const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
function setup(){
 const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();
 Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;
}
function walker(t,withKnees=false){
 const chassis=[],branches=[],C=.09,height=withKnees?.52:.33;
 const make=(shape,x,y,z,q=t.Q(),weight=.25)=>({id:t.allocateUnitId(),shape,weight,p:t.V(x*C,height+y*C,z*C),q});
 const down=t.Q();down.setFromAxisAngle(t.V(0,0,1),Math.PI);
 for(const x of [-2,-1,0,1,2])for(const z of [-1,0,1])chassis.push(make('cube',x,0,z));
 for(const x of [-2,2])for(const z of [-1,1]){
  const hip=make('pyramid',x,-.625,z,down,.1),thigh=make('pyramid',x,-1.375,z,t.Q(),.1);
  chassis.push(hip);
  const upper=[thigh,make('cube',x,-2,z)],parts=[upper],pairs=[[hip,thigh]];
  if(withKnees){
   const knee=make('pyramid',x,-2.625,z,down,.1),shin=make('pyramid',x,-3.375,z,t.Q(),.1);
   upper.push(knee);pairs.push([knee,shin]);
   parts.push([shin,make('cube',x,-4,z),make('cube',x,-5,z),make('cube',x+1,-5,z)]);
  }else upper.push(make('cube',x,-3,z));
  branches.push({parts,pairs});
 }
 const trunk=t.makeGroup(chassis),joints=[];
 for(const branch of branches){
  for(const parts of branch.parts)t.makeGroup(parts);
  for(const [a,b] of branch.pairs){
   const rotor=t.connectServoTips(a.id,b.id,{kind:'hinge',maxTorque:withKnees?3.2:2});
   assert(rotor);assert(t.configureServo(rotor,{min:-20,max:20,target:0,speed:65,direction:1}));joints.push(rotor);
  }
 }
 return {trunk,joints};
}

function flip(t,trunk){
 const center=trunk.body.position.clone(),turn=t.Q();turn.setFromAxisAngle(t.V(1,0,0),Math.PI/2);
 for(const g of t.rotorConnectedGroups([trunk])){
  const b=g.body;b.position.copy(center.vadd(turn.vmult(b.position.vsub(center))));
  b.quaternion.copy(turn.mult(b.quaternion));b.position.x+=2;b.angularVelocity.set(1,1,1);b.aabbNeedsUpdate=true;
 }
}
test('a four-footed chassis walks on the floor, falls, and resumes from the launch pose with R',()=>{
 const {t}=setup(),{trunk,joints}=walker(t);
 const step=n=>{for(let i=0;i<n;i++)t.stepPhysics(1/240);};
 step(48);const start=trunk.body.position.clone();assert(t.startServoMarch(joints[0]));step(2400);
 assert(trunk.body.position.x-start.x>1);assert(Math.abs(trunk.body.position.y-start.y)<.03);
 const other=t.addQubit([4,.045,2]);const isolated=other.body.position.clone();
 t.stopServoMarch(t.servoMarchFor(joints[0]));flip(t,trunk);
 const charge=t.rotorPart(joints[0].aId).part.mood.energy;
 t.setSelected({g:trunk,part:trunk.parts[0]});t.handleKey({code:'KeyR',preventDefault(){}});
 assert(t.servoMarchFor(joints[0]));assert(trunk.body.position.distanceTo(start)<.002);
 assert.equal(trunk.body.angularVelocity.norm(),0);assert.equal(t.rotorPart(joints[0].aId).part.mood.energy,charge);
 assert(other.body.position.distanceTo(isolated)<1e-10);
 step(960);assert(trunk.body.position.x-start.x>.35);
});
test('a sideways legacy walker recovers using its hinge references without a launch checkpoint',()=>{
 const {t}=setup(),{trunk,joints}=walker(t);flip(t,trunk);
 assert(t.restartMechanism(trunk));assert(Math.abs(trunk.body.quaternion.w)>.999);
 assert(t.servoMarchFor(joints[0]));assert(trunk.body.position.y>.30);
});
test('restarting an order restores its original goal and refuses an occupied start atomically',()=>{
 const {t}=setup(),g=t.addQubit([0,.045,0]),origin=g.body.position.clone(),goal=t.V(1,0,1);
 assert(t.startRoute(g,goal));t.stopRoute(g);g.body.position.x=2;
 const obstacle=t.addQubit([0,.045,0]);assert.equal(t.restartMechanism(g),false);assert.equal(g.body.position.x,2);
 obstacle.body.position.x=-2;assert(t.restartMechanism(g));assert(g.body.position.distanceTo(origin)<.001);
 assert(g.pendingMoodOrder.goal.distanceTo(goal)<.001);
});
test('legacy ratings migrate once and expanded settings survive a round trip',()=>{
 const {t}=setup(),r=t.spawnRotor(t.V(0,.4,0)),old=t.mechanismSnapshot(r);
 delete old.joints[0].driveRating;Object.assign(old.joints[0],{maxTorque:.8,capacity:63,rpm:119});
 const copy=t.spawnSavedMechanism(old,t.V(2,0,2));assert(copy);
 assert.equal(copy.capacity,504);assert.equal(copy.maxTorque,6.4);assert.equal(copy.rpm,119);
 assert(t.configureRotor(copy,{rpm:360,maxTorque:32,capacity:16000}));
 const data=t.mechanismSnapshot(copy);assert(t.savedMechanismValid(data));
 const next=t.spawnSavedMechanism(data,t.V(4,0,2));assert.equal(next.rpm,360);assert.equal(next.capacity,16000);assert.equal(next.maxTorque,32);
 const s=t.spawnSavedMechanism(t.servoBlueprintTemplate(),t.V(-2,0,2));assert(t.configureServo(s,{speed:540}));assert.equal(s.rpm,90);assert.equal(t.configureServo(s,{speed:541}),false);
});

test('a 360 rpm rotor reaches its commanded speed and restarts through the context menu',()=>{
 const {t}=setup(),r=t.spawnRotor(t.V(0,.5,0),{mount:'fixed',rpm:360,enabled:true});
 for(let i=0;i<960;i++)t.stepPhysics(1/240);
 assert(Math.abs(r.actualRpm)>350);assert(t.configureRotor(r,{enabled:false}));
 const a=t.rotorPart(r.aId);t.setLook({camera:[a.p.x,a.p.y,a.p.z+.8],yaw:0,pitch:0});
 t.handleSecondary({clientX:640,clientY:360});
 const restart=t.getCommandState().items.find(item=>item.label==='Reiniciar conjunto');
 assert(restart);restart.run();assert(r.enabled);assert.equal(r.rpm,360);
});

test('eight articulated hips and knees leave neutral under load and sustain a floor gait',()=>{
 const {t}=setup(),{trunk,joints}=walker(t,true);
 for(let i=0;i<48;i++)t.stepPhysics(1/240);
 const origin=trunk.body.position.clone();
 assert(t.startServoMarch(joints[0]));
 for(let i=0;i<2400;i++)t.stepPhysics(1/240);
 assert(joints.every(r=>r.enabled));assert.equal(t.servoMarchFor(joints[0]).phase,'march');
 assert(trunk.body.position.x-origin.x>.8);assert(Math.abs(trunk.body.position.y-origin.y)<.04);
});
