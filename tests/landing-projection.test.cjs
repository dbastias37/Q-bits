const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

function setup(){const game=createGame();game.t.clearNarrativeScene();Object.assign(game.t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});return game;}

test('landing ghost rests on the actual worktop and does not sink when already touching it',()=>{
 const {t}=setup(),bench=t.setupWorkshop(),g=t.addQubit([bench.p.x,1,bench.p.z]);
 const falling=t.landingProjection(g);assert(Math.abs(t.bounds(g).min.y+falling.delta-bench.p.y)<1e-8);
 g.body.position.y=bench.p.y+.045;const resting=t.landingProjection(g);assert(Math.abs(resting.delta)<1e-8,'near-zero support distance is a valid resting surface');
});

test('landing ghost uses oriented shelf segments and leaves empty bounding-box corners open',()=>{
 const {t}=setup(),q=t.Q();q.setFromAxisAngle(t.V(0,1,0),Math.PI/4);t.storyWall(t.V(0,.5,0),t.V(.3,.01,.02),{q});
 const supported=t.addQubit([0,1,0]),overRail=t.landingProjection(supported);assert(Math.abs(t.bounds(supported).min.y+overRail.delta-.51)<1e-8);
 t.removeGroup(supported);const empty=t.addQubit([.15,1,.15]),overGap=t.landingProjection(empty);assert(Math.abs(t.bounds(empty).min.y+overGap.delta)<1e-8,'a real gap projects onto the floor, not the segment AABB');
});
