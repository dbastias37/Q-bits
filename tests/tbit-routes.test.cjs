const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');
function drain(iterator) { let next; do { next=iterator.next(); } while(!next.done); return next.value; }
function units(t, shapes, x=0, z=0) {
  const g=t.makeGroup(shapes.map((shape,i)=>({id:1100+i,weight:1,shape,p:t.V(x+i*.09,0,z),q:t.Q()})));
  g.body.position.y-=t.bounds(g).min.y;
  return g;
}
// Build the reference bridge from complete matching faces, independently of snap.
function cubePyramidTetra(t) {
  const cube={id:1200,shape:'cube',weight:1,p:t.V(0,.045,0),q:t.Q()};
  const pyramid={id:1201,shape:'pyramid',weight:1,p:t.V(0,.09+t.unitGroundHeight('pyramid'),0),q:t.Q()};
  const face=t.unitFaces(pyramid)[1],profile=t.unitProfile('tetra'),faceIndex=1,indices=profile.faces[faceIndex];
  const align=t.Q();align.setFromVectors(profile.faceNormals[faceIndex],face.normal.scale(-1));align.normalize();
  const from=align.vmult(profile.vertices[indices[1]].vsub(profile.vertices[indices[0]]));from.normalize();
  let tetra;
  for(let start=0;start<face.vertices.length;start++) {
    const to=face.vertices[(start-1+face.vertices.length)%face.vertices.length].vsub(face.vertices[start]);to.normalize();
    const twist=t.Q();twist.setFromAxisAngle(face.normal,Math.atan2(face.normal.dot(from.cross(to)),from.dot(to)));
    const q=twist.mult(align);q.normalize();
    const p=face.center.vsub(q.vmult(profile.faceCenters[faceIndex]));
    if(indices.every(index=>face.vertices.some(v=>p.vadd(q.vmult(profile.vertices[index])).distanceTo(v)<1e-9))) {tetra={id:1202,shape:'tetra',weight:1,p,q};break;}
  }
  assert(tetra,'the blueprint bridge requires a matching lateral triangle');
  assert(t.touchingUnitFaces(cube,pyramid));assert(t.touchingUnitFaces(pyramid,tetra));
  assert(!t.obbOverlap(cube,tetra));
  return t.makeGroup([cube,pyramid,tetra]);
}

test('T-bit and mixed routes use real support vertices and match every displayed step', () => {
  const {t}=createGame();
  for(const shapes of [['tetra'],['pyramid'],['cube','tetra','pyramid']]) {
    t.clearNarrativeScene();const g=units(t,shapes);
    for(const [x,z] of [[.4,.35],[-.4,.35],[.35,-.4]]) {
      const plan=drain(t.planRoute(g,t.V(x,0,z)));assert(plan,shapes.join('+'));
      let p=plan.startPosition,q=plan.startQuaternion;
      for(let i=0;i<plan.steps.length;i++) {
        const motion=t.rollGeometry(g,p,q,plan.steps[i]);
        assert(motion.endP.distanceTo(plan.preview[i])<1e-8,'preview equals actual convex motion');
        assert(Math.abs(motion.stride-plan.strides[i])<1e-8);
        for(const fraction of [0,.125,.25,.5,.75,.875,1]) {
          const pose=t.rollPoseAt(motion,fraction),floor=t.bounds(g,pose.p,pose.q).min.y;
          assert(Math.abs(floor)<1e-8,'each support phase remains on the floor without box-shaped floating');
        }
        p=motion.endP;q=motion.endQ;
      }
      const center=t.bounds(g,p,q).center;
      assert(Math.hypot(center.x-x,center.z-z)<.068);
    }
  }
});

test('saved mixed forms retain unit types while older cube forms remain compatible', () => {
  const {t}=createGame();t.clearNarrativeScene();
  const g=cubePyramidTetra(t);t.saveShape(g);
  const saved=JSON.parse(JSON.stringify(t.savedShapes.at(-1)));
  assert.deepEqual(saved.parts.map(p=>p.shape),['cube','pyramid','tetra']);assert(t.savedShapeValid(saved));
  assert.equal(saved.geometryVersion,3);
  assert.equal(t.importShapesData({version:1,shapes:[saved]}),1);
  const bp={shape:t.savedShapes[0],p:t.V(-1,0,-1),q:t.Q(),slots:[]};
  assert.deepEqual(Array.from(t.blueprintTargets(bp),p=>p.shape).sort(),['cube','pyramid','tetra']);
  const legacy={name:'Forma anterior',parts:[{p:[0,.045,0],q:[0,0,0,1]}]};
  assert(t.savedShapeValid(legacy));assert.equal(t.blueprintTargets({...bp,shape:legacy})[0].shape,'cube');
  const invalid={...saved,parts:saved.parts.map(p=>({...p,shape:'sphere'}))};
  assert.equal(t.savedShapeValid(invalid),false);
  assert.throws(()=>t.importShapesData({version:1,shapes:[invalid]}),/inválido/);
});

test('blueprints recruit the requested T-bit type and retain it through completed assembly', () => {
  const game=createGame(),{t}=game;t.clearNarrativeScene();
  const tetra=units(t,['tetra'],-.45,0),cube=units(t,['cube'],-.3,0),pyramid=units(t,['pyramid'],-.6,0);
  const shape={name:'Solo tetra',parts:[{shape:'tetra',p:[0,t.unitGroundHeight('tetra'),0],q:[0,0,0,1]}]};
  const bp=t.placeBlueprint(shape,t.V(0,0,0));assert(bp);
  assert.deepEqual(Array.from(t.nearBlueprint(bp)),[tetra]);
  t.activateBlueprint(bp);t.updateBlueprints(0);
  assert.equal(bp.slots.length,1);assert.equal(bp.slots[0].g,tetra);
  assert.equal(cube.blueprintJob,undefined);assert.equal(pyramid.blueprintJob,undefined);
  game.navigationUntilIdle();
  const slot=bp.slots[0];t.stopRoute(tetra);slot.state='placed';
  tetra.body.position.copy(slot.target.p);tetra.body.quaternion.copy(slot.target.q);
  t.updateBlueprints(0);
  assert.equal(t.blueprints.length,0);
  const built=t.getSelected().g;assert.equal(built.parts[0].shape,'tetra');
  assert.equal(t.groups.includes(cube),true);assert.equal(t.groups.includes(pyramid),true);
});

test('a T-bit waits for missing lower blueprint pieces before mounting', () => {
  const game=createGame(),{t}=game;t.clearNarrativeScene();
  const pyramid=units(t,['pyramid'],-.45,0);
  const bp=t.placeBlueprint({name:'Base y pirámide',parts:[
    {shape:'cube',p:[0,.045,0],q:[0,0,0,1]},
    {shape:'pyramid',p:[0,.09+t.unitGroundHeight('pyramid'),0],q:[0,0,0,1]}
  ]},t.V(0,0,0));assert(bp);
  t.activateBlueprint(bp);t.updateBlueprints(0);assert.equal(bp.slots[0].index,1);
  game.navigationUntilIdle();t.stopRoute(pyramid);
  const slot=bp.slots[0];pyramid.body.position.copy(slot.stage);pyramid.body.position.y-=t.bounds(pyramid).min.y;
  t.updateBlueprints(.1);
  assert.equal(slot.state,'walking','missing cube base must arrive before the T-bit rises into its slot');
});

test('legacy incompatible forms stay available for export but cannot become blueprints', () => {
  const {t,sandbox}=createGame();t.clearNarrativeScene();
  const legacy={name:'Triángulo sobre cubo antiguo',parts:[
    {shape:'cube',p:[0,.045,0],q:[0,0,0,1]},
    {shape:'tetra',p:[0,.09+t.unitGroundHeight('tetra'),0],q:[0,0,0,1]}
  ]};
  assert(t.savedShapeValid(legacy),'older files remain syntactically accepted');
  assert.equal(t.importShapesData({version:1,shapes:[legacy]}),1);
  assert.deepEqual(JSON.parse(JSON.stringify(t.savedShapes[0])),legacy,'the original data remains intact for export');
  assert.equal(t.placeBlueprint(t.savedShapes[0],t.V(0,0,0)),null,'a triangle cannot attach to a square face');
  assert.equal(t.blueprints.length,0);
  assert(sandbox.document.querySelector('#notice').textContent.length>0,'placement explains the incompatible shape');
  assert.deepEqual(JSON.parse(JSON.stringify(t.savedShapes[0])),legacy,'a rejected placement does not erase the old form');
});

test('overlapping and disconnected compounds cannot be saved or placed as blueprints', () => {
  const {t}=createGame();t.clearNarrativeScene();
  for(const x of [.04,.18]) {
    const shape={name:'Encaje inválido',parts:[
      {shape:'cube',p:[0,.045,0],q:[0,0,0,1]},
      {shape:'cube',p:[x,.045,0],q:[0,0,0,1]}
    ]};
    assert(t.savedShapeValid(shape));assert.equal(t.placeBlueprint(shape,t.V(0,0,0)),null);
    const g=t.makeGroup(shape.parts.map((p,i)=>({shape:p.shape,id:1300+i,weight:1,p:t.V(...p.p),q:t.Q()})));
    const count=t.savedShapes.length;t.saveShape(g);
    assert.equal(t.savedShapes.length,count,'invalid connections cannot enter the new shape catalogue');
    t.removeGroup(g);
  }
});

test('a connected legacy solid cube blueprint remains accepted', () => {
  const {t}=createGame();t.clearNarrativeScene();
  const shape={name:'Cubo 2×2×2 anterior',parts:[]};
  for(let x=0;x<2;x++)for(let y=0;y<2;y++)for(let z=0;z<2;z++)shape.parts.push({p:[x*.09,.045+y*.09,z*.09],q:[0,0,0,1]});
  assert(t.savedShapeValid(shape));
  const bp=t.placeBlueprint(shape,t.V(-1,0,-1));assert(bp);
  assert.equal(t.blueprintTargets(bp).length,8);
  assert(t.blueprintTargets(bp).every(p=>p.shape==='cube'));
});

test('completed blueprint assembly rechecks live face contact before joining the pieces', () => {
  for(const shifted of [false,true]) {
    const {t,sandbox}=createGame();t.clearNarrativeScene();
    const shape={name:'Base y pirámide',parts:[
      {shape:'cube',p:[0,.045,0],q:[0,0,0,1]},
      {shape:'pyramid',p:[0,.09+t.unitGroundHeight('pyramid'),0],q:[0,0,0,1]}
    ]};
    const bp=t.placeBlueprint(shape,t.V(0,0,0));assert(bp);bp.active=true;
    bp.slots=Array.from(t.blueprintTargets(bp),(pose,index)=>{
      const g=t.makeGroup([{id:1400+index,shape:pose.shape,weight:1,p:pose.p,q:pose.q}]);
      const slot={g,bp,index,state:'placed'};g.blueprintJob=slot;
      if(shifted&&index===1)g.body.position.x+=.004;
      return slot;
    });
    const originalGroups=bp.slots.map(s=>s.g);t.updateBlueprints(0);
    assert.equal(t.blueprints.length,0);
    if(shifted) {
      assert.equal(t.groups.length,2,'misaligned live parts must not become a rigid compound');
      assert(originalGroups.every(g=>t.groups.includes(g)&&g.blueprintJob===null));
      assert.match(sandbox.document.querySelector('#notice').textContent,/cancelado|coinciden/i);
    } else {
      assert.equal(t.groups.length,1);
      assert.deepEqual(Array.from(t.groups[0].parts,p=>p.shape),['cube','pyramid']);
      assert(t.touchingUnitFaces(...t.worldParts(t.groups[0])));
    }
  }
});
