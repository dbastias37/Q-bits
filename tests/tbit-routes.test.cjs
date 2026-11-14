const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');
function drain(iterator) { let next; do { next=iterator.next(); } while(!next.done); return next.value; }
function units(t, shapes, x=0, z=0) {
  const g=t.makeGroup(shapes.map((shape,i)=>({id:1100+i,weight:1,shape,p:t.V(x+i*.09,0,z),q:t.Q()})));
  g.body.position.y-=t.bounds(g).min.y;
  return g;
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
  const g=units(t,['tetra','pyramid','cube']);t.saveShape(g);
  const saved=JSON.parse(JSON.stringify(t.savedShapes.at(-1)));
  assert.deepEqual(saved.parts.map(p=>p.shape),['tetra','pyramid','cube']);assert(t.savedShapeValid(saved));
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
  const shape={name:'Solo tetra',parts:[{shape:'tetra',p:[0,.01837,0],q:[0,0,0,1]}]};
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
  const tetra=units(t,['tetra'],-.45,0);
  const bp=t.placeBlueprint({name:'Base y pirámide',parts:[
    {shape:'cube',p:[0,.045,0],q:[0,0,0,1]},
    {shape:'tetra',p:[0,.10837,0],q:[0,0,0,1]}
  ]},t.V(0,0,0));assert(bp);
  t.activateBlueprint(bp);t.updateBlueprints(0);assert.equal(bp.slots[0].index,1);
  game.navigationUntilIdle();t.stopRoute(tetra);
  const slot=bp.slots[0];tetra.body.position.copy(slot.stage);tetra.body.position.y-=t.bounds(tetra).min.y;
  t.updateBlueprints(.1);
  assert.equal(slot.state,'walking','missing cube base must arrive before the T-bit rises into its slot');
});
