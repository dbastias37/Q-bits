const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');

function attachedPart(t, shape, face, id, gap = 0) {
  const profile = t.unitProfile(shape), q = t.Q();
  q.setFromVectors(profile.faceNormals[0], face.normal.scale(-1));
  q.normalize();
  return {id, shape, weight:1, q, p:face.center.vsub(q.vmult(profile.faceCenters[0])).vadd(face.normal.scale(gap))};
}

test('all Q-bit/T-bit pairings snap through real faces, preserve their types and fully disassemble', () => {
  for (const targetShape of ['cube','tetra','pyramid']) for (const sourceShape of ['cube','tetra','pyramid']) {
    const {t} = createGame();t.clearNarrativeScene();
    const target = t.makeGroup([{id:100,shape:targetShape,weight:1,p:t.V(0,1,0),q:t.Q()}]);
    // Cube top or a sloping pyramid face, including non-axis-aligned joins.
    const targetFace = t.unitFaces(t.worldParts(target)[0])[1];
    const source = t.makeGroup([attachedPart(t,sourceShape,targetFace,101,.008)]);
    t.setHeld({g:source,part:source.parts[0],items:[{g:source}]});t.keys.add('ShiftLeft');
    const snap = t.findSnap();
    assert(snap, `${sourceShape} must snap to ${targetShape}`);
    assert.equal(snap.source,source);assert.equal(snap.target,target);
    assert(t.validPose(source,snap.position,snap.quaternion));
    const snappedPose = t.poses(source,snap.position,snap.quaternion)[0];
    assert(t.touchingUnitFaces({shape:sourceShape,p:snappedPose.p,q:snappedPose.q},t.worldParts(target)[0]));
    t.setHeld(null);
    const joined = t.weld(snap);
    assert.equal(t.groups.length,1);assert.equal(joined.parts.length,2);
    assert.deepEqual(Array.from(joined.parts,p=>p.shape).sort(),[sourceShape,targetShape].sort());
    assert.equal(joined.body.shapes.length,2);
    t.detachPart({g:joined,part:joined.parts[0]},true);
    assert.equal(t.groups.length,2);
    assert.deepEqual(Array.from(t.groups,g=>g.parts[0].shape).sort(),[sourceShape,targetShape].sort());
    assert(t.groups.every(g=>g.parts.length===1&&g.body.shapes.length===1));
  }
});

test('removing the central T-bit separates a mixed chain while an intact face connection stays joined', () => {
  const {t} = createGame();t.clearNarrativeScene();
  const a={id:100,shape:'cube',weight:1,p:t.V(0,1,0),q:t.Q()};
  const b=attachedPart(t,'tetra',t.unitFaces(a)[3],101);
  const face=t.unitFaces(b).reduce((best,f)=>f.normal.x>best.normal.x?f:best);
  const c=attachedPart(t,'pyramid',face,102);
  assert(t.touchingUnitFaces(a,b));assert(t.touchingUnitFaces(b,c));assert(!t.touchingUnitFaces(a,c));
  const joined=t.makeGroup([a,b,c]);
  t.detachPart({g:joined,part:joined.parts.find(p=>p.id===101)});
  assert.equal(t.groups.length,3);
  assert.deepEqual(Array.from(t.groups,g=>g.parts.length),[1,1,1]);
  for(const g of [...t.groups])t.removeGroup(g);
  const fragments=t.makeFragments([a,b],t.Q());
  assert.equal(fragments.length,1);assert.equal(fragments[0].parts.length,2);
});

test('touching only at an edge or a point does not weld T-bit fragments into one structure', () => {
  const {t}=createGame();t.clearNarrativeScene();
  const a={id:100,shape:'pyramid',weight:1,p:t.V(0,1,0),q:t.Q()};
  const b={id:101,shape:'pyramid',weight:1,p:t.V(.09,1,0),q:t.Q()};
  assert(!t.touchingUnitFaces(a,b));
  assert.equal(t.makeFragments([a,b],t.Q()).length,2);
});
