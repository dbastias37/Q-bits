const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');

// Build a known exact join independently of the snap search: oppose the normals,
// reverse the boundary winding, then make the polygon centers coincide.
function attachedPart(t, shape, sourceFaceIndex, targetFace, id, { gap = 0, twist = 0, slide = 0, allowMismatch = false } = {}) {
  const profile = t.unitProfile(shape), indices = profile.faces[sourceFaceIndex];
  const align = t.Q();align.setFromVectors(profile.faceNormals[sourceFaceIndex], targetFace.normal.scale(-1));align.normalize();
  const tangent = align.vmult(profile.vertices[indices[1]].vsub(profile.vertices[indices[0]]));tangent.normalize();
  let reference;
  for(let start=0;start<targetFace.vertices.length;start++) {
    const along=targetFace.vertices[(start-1+targetFace.vertices.length)%targetFace.vertices.length].vsub(targetFace.vertices[start]);along.normalize();
    const angle=Math.atan2(targetFace.normal.dot(tangent.cross(along)),tangent.dot(along));
    const rotation=t.Q();rotation.setFromAxisAngle(targetFace.normal,angle);
    const q=rotation.mult(align);q.normalize();
    const p=targetFace.center.vsub(q.vmult(profile.faceCenters[sourceFaceIndex]));
    const exact=indices.length===targetFace.vertices.length && indices.every(index=>targetFace.vertices.some(v=>p.vadd(q.vmult(profile.vertices[index])).distanceTo(v)<1e-9));
    if(exact || allowMismatch && !reference)reference={q,p,along};
    if(exact)break;
  }
  assert(reference,`reference face ${shape}[${sourceFaceIndex}] must be congruent`);
  const perturb=t.Q();perturb.setFromAxisAngle(targetFace.normal,twist);
  const q=perturb.mult(reference.q);q.normalize();
  const p=targetFace.center.vsub(q.vmult(profile.faceCenters[sourceFaceIndex]))
    .vadd(targetFace.normal.scale(gap)).vadd(reference.along.scale(slide));
  return {id,shape,weight:1,q,p};
}
function exactSharedFaces(t, a, b, tolerance = 1e-8) {
  const matches=[];
  for(const fa of t.unitFaces(a))for(const fb of t.unitFaces(b)) {
    if(fa.vertices.length!==fb.vertices.length || fa.normal.dot(fb.normal)>-1+1e-9)continue;
    if(fa.vertices.every(v=>fb.vertices.some(w=>v.distanceTo(w)<tolerance)))matches.push([fa,fb]);
  }
  return matches;
}
function hold(t, source) { t.setHeld({g:source,part:source.parts[0],items:[{g:source}]});t.keys.add('ShiftLeft'); }
const compatible = [
  ['cube',1,'cube',0], ['cube',1,'pyramid',0], ['pyramid',0,'cube',1],
  ['tetra',1,'tetra',2], ['tetra',1,'pyramid',1], ['pyramid',1,'tetra',1],
  ['tetra',0,'tetra',0], ['tetra',3,'tetra',3],
  ['pyramid',0,'pyramid',0], ['pyramid',1,'pyramid',1]
];

test('compatible square and triangular faces snap from noisy alignment to exact vertex-for-vertex joins', () => {
  for(const [targetShape,targetFaceIndex,sourceShape,sourceFaceIndex] of compatible)for(const rotated of [false,true]) {
    const {t}=createGame();t.clearNarrativeScene();
    const q=t.Q();if(rotated)q.setFromEuler(.31,-.48,.22);
    const target=t.makeGroup([{id:100,shape:targetShape,weight:1,p:t.V(0,1,0),q}]);
    const targetPose=t.worldParts(target)[0],face=t.unitFaces(targetPose)[targetFaceIndex];
    const source=t.makeGroup([attachedPart(t,sourceShape,sourceFaceIndex,face,101,{gap:.008,twist:.12,slide:.004})]);
    hold(t,source);
    const snap=t.findSnap();
    assert(snap, `${sourceShape}[${sourceFaceIndex}] → ${targetShape}[${targetFaceIndex}], rotated=${rotated}`);
    assert.equal(snap.source,source);assert.equal(snap.target,target);
    assert(t.validPose(source,snap.position,snap.quaternion));
    const pose=t.poses(source,snap.position,snap.quaternion)[0];
    const shared=exactSharedFaces(t,pose,targetPose);
    assert.equal(shared.length,1,'the join must cover one entire face, with no overhang or twist');
    assert.equal(shared[0][1].index,targetFaceIndex,'snap must use the approached target face');
    assert.equal(t.obbOverlap(pose,targetPose),false,'joined interiors must not intersect');
    assert(t.touchingUnitFaces(pose,targetPose));
    t.setHeld(null);
    const joined=t.weld(snap);assert(joined);
    assert.equal(t.groups.length,1);assert.equal(joined.parts.length,2);
    assert.deepEqual(Array.from(joined.parts,p=>p.shape).sort(),[sourceShape,targetShape].sort());
    assert.equal(joined.body.shapes.length,2);
    t.detachPart({g:joined,part:joined.parts[0]},true);
    assert.equal(t.groups.length,2);
    assert(t.groups.every(g=>g.parts.length===1&&g.body.shapes.length===1));
    assert.deepEqual(Array.from(t.groups,g=>g.parts[0].shape).sort(),[sourceShape,targetShape].sort());
  }
});

test('triangle-to-square contacts cannot snap or be welded in either direction', () => {
  for(const [targetShape,sourceShape] of [['cube','tetra'],['tetra','cube']]) {
    const {t}=createGame();t.clearNarrativeScene();
    const target=t.makeGroup([{id:100,shape:targetShape,weight:1,p:t.V(0,1,0),q:t.Q()}]);
    const source=t.makeGroup([attachedPart(t,sourceShape,0,t.unitFaces(t.worldParts(target)[0])[1],101,{gap:.005,allowMismatch:true})]);
    hold(t,source);assert(t.findSnap()===null,`${sourceShape} must not fit ${targetShape}`);t.setHeld(null);
    const before=t.groups.length;
    assert(!t.weld({source,target,position:source.body.position.clone(),quaternion:source.body.quaternion.clone()}));
    assert.equal(t.groups.length,before);
    assert(t.groups.includes(source)&&t.groups.includes(target));
  }
});

test('different triangular face families cannot be treated as matching connectors', () => {
  for(const [targetShape,targetFaceIndex,sourceShape,sourceFaceIndex] of [
    ['tetra',0,'tetra',1],['tetra',0,'tetra',3],['tetra',1,'tetra',3],
    ['pyramid',1,'tetra',0],['pyramid',1,'tetra',3]
  ]) {
    const {t}=createGame();t.clearNarrativeScene();
    const target=t.makeGroup([{id:100,shape:targetShape,weight:1,p:t.V(0,1,0),q:t.Q()}]);
    const sourcePart=attachedPart(t,sourceShape,sourceFaceIndex,t.unitFaces(t.worldParts(target)[0])[targetFaceIndex],101,{allowMismatch:true});
    const source=t.makeGroup([sourcePart]);
    assert.equal(t.touchingUnitFaces(t.worldParts(source)[0],t.worldParts(target)[0]),false);
    assert(!t.weld({source,target,position:source.body.position.clone(),quaternion:source.body.quaternion.clone()}),'triangle count alone cannot authorize a weld');
    assert.equal(t.groups.length,2);
  }
});

test('coplanar partial faces, arbitrary twists and edge contacts are not structural connections', () => {
  for(const [shape,sourceFaceIndex,targetFaceIndex] of [['cube',0,1],['tetra',0,0],['tetra',1,2],['tetra',3,3],['pyramid',0,0],['pyramid',1,1]]) {
    const {t}=createGame();t.clearNarrativeScene();
    const a={id:100,shape,weight:1,p:t.V(0,1,0),q:t.Q()},face=t.unitFaces(a)[targetFaceIndex];
    const aligned=attachedPart(t,shape,sourceFaceIndex,face,101);
    assert.equal(exactSharedFaces(t,a,aligned).length,1);assert(t.touchingUnitFaces(a,aligned));
    for(const noise of [{slide:.012},{twist:.2},{slide:.09}]) {
      const b=attachedPart(t,shape,sourceFaceIndex,face,101,noise);
      assert.equal(t.touchingUnitFaces(a,b),false,`${shape} must reject ${JSON.stringify(noise)}`);
      const fragments=t.makeFragments([a,b],t.Q());assert.equal(fragments.length,2);
      for(const group of fragments)t.removeGroup(group);
    }
  }
  const {t}=createGame();
  const a={id:1,shape:'cube',p:t.V(0,1,0),q:t.Q()};
  const b={id:2,shape:'cube',p:t.V(.09/Math.sqrt(2),1,.09/Math.sqrt(2)),q:t.Q()};
  assert.equal(t.touchingUnitFaces(a,b),false,'equal center distance is not proof of a face join');
});

test('removing the pyramid bridge separates a cube and tetra while a full-face pair remains joined', () => {
  const {t}=createGame();t.clearNarrativeScene();
  const a={id:100,shape:'cube',weight:1,p:t.V(0,1,0),q:t.Q()};
  const b=attachedPart(t,'pyramid',0,t.unitFaces(a)[3],101);
  const c=attachedPart(t,'tetra',1,t.unitFaces(b)[1],102);
  assert(t.touchingUnitFaces(a,b));assert(t.touchingUnitFaces(b,c));assert(!t.touchingUnitFaces(a,c));
  const joined=t.makeGroup([a,b,c]);
  t.detachPart({g:joined,part:joined.parts.find(p=>p.id===101)});
  assert.equal(t.groups.length,3);assert(t.groups.every(g=>g.parts.length===1));
  for(const g of [...t.groups])t.removeGroup(g);
  const fragments=t.makeFragments([a,b],t.Q());
  assert.equal(fragments.length,1);assert.equal(fragments[0].parts.length,2);
});

test('weld rejects stale, obstructed and intersecting candidates without consuming either group', () => {
  for(const invalidate of [
    (t,snap)=>{snap.target.body.position.x+=.3;},
    (t,snap)=>{t.removeGroup(snap.target);},
    (t,snap)=>{snap.position=snap.target.body.position.clone();snap.quaternion=snap.target.body.quaternion.clone();},
    (t,snap)=>{t.makeGroup([{id:102,shape:'cube',weight:1,p:snap.position.clone(),q:t.Q()}]);}
  ]) {
    const {t}=createGame();t.clearNarrativeScene();
    const target=t.makeGroup([{id:100,shape:'cube',weight:1,p:t.V(0,1,0),q:t.Q()}]);
    const source=t.makeGroup([attachedPart(t,'pyramid',0,t.unitFaces(t.worldParts(target)[0])[1],101,{gap:.006})]);
    hold(t,source);const snap=t.findSnap();assert(snap);t.setHeld(null);invalidate(t,snap);
    const remaining=[...t.groups];let result;
    assert.doesNotThrow(()=>{result=t.weld(snap);});assert(!result);
    assert.deepEqual([...t.groups],remaining,'a rejected weld must not remove or rebuild any group');
  }
});
