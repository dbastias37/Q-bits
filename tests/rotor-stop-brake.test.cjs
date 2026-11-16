const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
const angle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w)));
const relative=(t,r)=>{const [a,b]=t.rotorGroups(r);return a.body.quaternion.inverse().mult(b.body.quaternion);};
function lab(){const {t}=createGame();t.clearNarrativeScene();t.story.ready=false;t.world.gravity.set(0,0,0);return t;}
function steps(t,n){for(let i=0;i<n;i++)t.stepPhysics(1/240);}
test('a stopped rotor holds its shaft against light sustained torque without a motor or a ground pin',()=>{
 const t=lab(),r=t.spawnRotor(t.V(0,1,0)),start=relative(t,r);steps(t,1);const [a,b]=t.rotorGroups(r),from=a.body.position.clone();
 for(let i=0;i<480;i++){const axis=t.couplerTip(t.rotorPart(r.bId)).axis;b.body.torque.vadd(axis.scale(.002),b.body.torque);a.body.force.x+=.01;t.stepPhysics(1/240);}
 assert(angle(start,relative(t,r))<.005,'stopped shaft must not freewheel');assert(a.body.position.distanceTo(from)>.005,'whole mechanism remains movable');
 assert.equal(r.constraint.motorEquation.enabled,false);assert.equal(r.actualTorque,0);assert.equal(r.pin,null);assert(t.rotorGroups(r).every(g=>g.body.type===1));
});
test('brake releases on start and captures the current angle on repeated stops',()=>{
 const t=lab(),r=t.spawnRotor(t.V(0,1,0),{rpm:30,maxTorque:.4});
 for(let cycle=0;cycle<3;cycle++){
  const before=relative(t,r);assert(t.configureRotor(r,{enabled:true}));assert.equal(r.constraint.stopBrake.equation.enabled,false);steps(t,120);assert(angle(before,relative(t,r))>.5);
  assert(t.configureRotor(r,{enabled:false}));assert.equal(r.constraint.stopBrake.equation.enabled,true);const stopped=relative(t,r);steps(t,120);assert(angle(stopped,relative(t,r))<.005);
 }
 assert.equal(t.world.constraints.length,1,'brake belongs to the existing joint; no accumulated constraints');
});
test('stopped conveyor rollers resist a physical falling payload',()=>{
 const t=lab();t.world.gravity.set(0,-9.8,0);t.story.scene='lab';assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight'),t.V()));const c=t.conveyors[0],poses=t.rotors.map(r=>relative(t,r));
 const surface=t.conveyorSurfacePoses(c)[0];t.addQubit([surface.p.x,surface.p.y+.2,surface.p.z]);steps(t,480);
 t.rotors.forEach((r,i)=>{assert(angle(poses[i],relative(t,r))<.01);assert.equal(r.enabled,false);assert.equal(r.actualTorque,0);});
});
