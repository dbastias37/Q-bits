const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

for(const count of [4,12])test(`battery cutoff keeps a ${count}-cube loaded axle closed while it falls onto the floor`,()=>{
 const {t}=createGame();t.clearNarrativeScene();t.story.ready=false;
 const rotor=t.spawnRotor(t.V(0,2,0),{rpm:120,mount:'fixed',maxTorque:4,capacity:128});
 const turn=t.Q();turn.setFromAxisAngle(t.V(0,0,1),Math.PI/2);
 const pivot=t.couplerTip(t.rotorPart(rotor.aId)).point;
 for(const g of t.rotorGroups(rotor)){
  g.body.position.copy(pivot.vadd(turn.vmult(g.body.position.vsub(pivot))));
  g.body.quaternion.copy(turn.mult(g.body.quaternion));
 }
 const endpoint=t.rotorPart(rotor.bId),parts=t.worldParts(endpoint.g);
 const center=endpoint.p.vadd(endpoint.q.vmult(t.V(0,-.09*5/56,0)));
 for(let i=1;i<=count;i++)parts.push({id:t.allocateUnitId(),shape:'cube',weight:3,p:center.vadd(endpoint.q.vmult(t.V(i*.09,0,0))),q:endpoint.q.clone()});
 const reference=endpoint.g.body.quaternion.clone();t.removeGroup(endpoint.g);t.makeGroup(parts,reference);t.refreshRotors();
 t.rotorPart(rotor.aId).part.mood.energy=.000002;
 assert(t.configureRotor(rotor,{enabled:true}));t.stepPhysics(1/240);
 assert.equal(rotor.enabled,false);assert.equal(rotor.stopReason,'empty');
 let greatestGap=0,minimumY=Infinity,worstAxisDot=-1;
 for(let i=0;i<2400;i++){
  t.stepPhysics(1/240);
  const a=t.couplerTip(t.rotorPart(rotor.aId)),b=t.couplerTip(t.rotorPart(rotor.bId));
  greatestGap=Math.max(greatestGap,a.point.distanceTo(b.point));worstAxisDot=Math.max(worstAxisDot,a.axis.dot(b.axis));
  minimumY=Math.min(minimumY,...t.rotorGroups(rotor).map(g=>t.bounds(g).min.y));
  assert.equal(rotor.actualTorque,0,'an empty motor cannot generate torque');
 }
 assert(greatestGap<1e-6,`unpowered mechanical joint stretched ${greatestGap} m`);
 assert(worstAxisDot<-.995,`unpowered axle lost its orientation: ${worstAxisDot}`);
 assert.equal(rotor.pin,null);assert.equal(rotor.constraint.motorEquation.enabled,false);
 assert(t.rotorGroups(rotor).every(g=>g.body.type===1),'the released structure is dynamic');
 assert(minimumY>-.006,`falling assembly penetrated floor: ${minimumY}`);
 assert(Math.min(...t.rotorGroups(rotor).map(g=>t.bounds(g).min.y))<.02,'structure actually falls to the floor after losing power');
});

test('manual stop clears speed telemetry immediately while the bank is paused',()=>{
 const {t}=createGame();t.clearNarrativeScene();t.story.ready=false;
 const rotor=t.spawnRotor(t.V(0,.4,0),{mount:'fixed'});t.configureRotor(rotor,{enabled:true});
 for(let i=0;i<240;i++)t.stepPhysics(1/240);
 assert(rotor.actualRpm>20);t.configureRotor(rotor,{enabled:false});
 assert.equal(rotor.actualRpm,0);assert.equal(rotor.actualTorque,0);
});
