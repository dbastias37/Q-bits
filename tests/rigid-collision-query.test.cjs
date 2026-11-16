const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
function lab(){const game=createGame();game.t.clearNarrativeScene();Object.assign(game.t.story,{ready:false,scene:'lab',mode:'playing',phase:'idle'});return game;}
const precise=(t,a,b)=>t.poses(a).some(x=>t.poses(b).some(y=>t.obbOverlap(x,y,.0005)));
test('body and part broad phases agree with exact SAT for cubes, couplers and T-bits, including touching edges',()=>{
 const {t}=lab();let seed=8021;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2**32;};
 const build=()=>t.makeGroup(Array.from({length:8},(_,i)=>{const q=t.Q();q.setFromEuler(random()*3,random()*3,random()*3);return {id:t.allocateUnitId(),shape:['cube','coupler','pyramid','tetra'][i%4],weight:1,p:t.V(random()*.4,.5+random()*.4,random()*.4),q};}));
 const a=build(),b=build();let overlaps=0,clear=0;
 for(let i=0;i<240;i++){b.body.position.set((random()-.5)*.8,.5+random()*.5,(random()-.5)*.8);b.body.quaternion.setFromEuler(random()*6,random()*6,random()*6);const expected=precise(t,a,b);assert.equal(t.rigidGroupsOverlap(a,b),expected,'sample '+i);expected?overlaps++:clear++;}
 assert(overlaps>10&&clear>10);
 for(const offset of [.089,.0895,.09,.0905]){const c=t.addQubit([2,.5,0]),d=t.addQubit([2+offset,.5,0]);assert.equal(t.rigidGroupsOverlap(c,d),precise(t,c,d));t.removeGroup(c);t.removeGroup(d);}
});
test('rigid collision cache follows movement, rotation and body replacement without filling empty space',()=>{
 const {t}=lab(),a=t.makeGroup([-1,1].map(x=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(x*.09,.5,0),q:t.Q()}))),b=t.addQubit([0,.5,0]);
 assert.equal(t.rigidGroupsOverlap(a,b),false,'hole between blocks stays open');const before=t.rigidCollisionParts(a);assert.equal(t.rigidCollisionParts(a),before);a.body.position.x+=.09;assert.notEqual(t.rigidCollisionParts(a),before);assert(t.rigidGroupsOverlap(a,b));
 a.body.quaternion.setFromEuler(.2,.3,.4);assert.equal(t.rigidGroupsOverlap(a,b),precise(t,a,b));
 const parts=t.worldParts(a);t.removeGroup(a);const replacement=t.makeGroup(parts);assert.notEqual(t.rigidCollisionParts(replacement),before);assert.equal(t.rigidGroupsOverlap(replacement,b),precise(t,replacement,b));
});
test('sleeping conveyor units reuse verified equilibrium and wake for contact or manual movement',()=>{
 const {t}=lab();assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight'),t.V()));
 for(let i=0;i<480;i++)t.stepPhysics(1/240);
 assert(t.groups.every(g=>g.body.sleepState===2));const rotor=t.rotors[0],pair=t.rotorGroups(rotor),saved=rotor.restPose;
 t.stepPhysics(1/240);assert.equal(rotor.restPose,saved,'no repeated geometric stabilization while sleeping');
 pair[1].body.position.x+=.001;t.stabilizeRotors();assert.notEqual(rotor.restPose,saved,'external move invalidates the rest check');
 const now=rotor.restPose;pair[1].body.wakeUp();pair[1].body.applyImpulse(t.V(.003,0,0),t.V());t.stepPhysics(1/240);assert.notEqual(rotor.restPose,now);
 const a=t.couplerTip(t.rotorPart(rotor.aId)),b=t.couplerTip(t.rotorPart(rotor.bId));assert(a.point.distanceTo(b.point)<.001);
});
