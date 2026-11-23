const test=require('node:test');
const assert=require('node:assert/strict');
const Drive=require('../assets/js/trajectory-drive.js');

const {access,setup,wheeledCar,walker,apply}=require('./trajectory-fixtures.cjs');

test('steering requests the correct yaw, slows on arrival and rejects invalid targets',()=>{
  const state={position:{x:0,z:0},forward:{x:1,z:0},maxSpeed:.25,speed:.25};
  const ahead=Drive.steer({...state,target:{x:1,z:0}});assert.equal(ahead.throttle,1);assert.equal(ahead.turn,0);assert(!ahead.brake);
  const left=Drive.steer({...state,target:{x:1,z:-1}}),right=Drive.steer({...state,target:{x:1,z:1}});
  assert(left.turn>0);assert(right.turn<0);assert.equal(left.throttle,right.throttle);
  assert(Drive.steer({...state,target:{x:.09,z:0},final:true}).throttle<ahead.throttle);
  assert(Drive.steer({...state,target:{x:.02,z:0},final:true}).arrived);
  assert(Drive.steer({...state,target:{x:NaN,z:0}}).brake);
  assert(Drive.steer({...state,target:{x:1,z:0},blocked:true}).brake);
});

test('differential commands are bounded and leave configuration and physical state untouched',()=>{
  const motors=[-1,1].map(side=>({side,forwardDirection:side,radius:.1,rotor:{rpm:30,maxTorque:2,capacity:128,enabled:true}}));
  const description={kind:'wheels',motors},before=JSON.stringify(description);
  const requests=Drive.wheelCommands(description,{throttle:.8,turn:.7});
  assert.equal(requests[1].rpm,30);assert(requests[0].rpm<requests[1].rpm);
  const pivot=Drive.wheelCommands(description,{throttle:0,turn:1});
  assert.equal(pivot[0].direction,pivot[1].direction,'mirrored axles counter-rotate around world up');
  assert(Drive.wheelCommands(description,{brake:true}).every(c=>c.rpm===0));
  assert.equal(JSON.stringify(description),before);
});

test('wheel recognition requires one chassis, opposing sides and a coherent axle direction',()=>{
  const {t}=setup(),car=wheeledCar(t),description=Drive.describe(car.component,t.rotors,null,{...access(t),forward:t.V(1,0,0)});
  assert.equal(description.kind,'wheels');assert.equal(description.chassis,car.trunk);assert.equal(description.motors.length,4);
  assert.equal(description.motors.filter(m=>m.side<0).length,2);
  assert.deepEqual(Drive.forward(description),{x:1,y:0,z:0});
  const sideways=Drive.describe(car.component,t.rotors,null,{...access(t),forward:t.V(0,0,1)});assert.equal(sideways.kind,'unsupported');
  const oneSide=Drive.describe(car.component,car.motors.filter(r=>t.rotorPart(r.aId).p.z<0),null,access(t));assert.equal(oneSide.kind,'unsupported');
  const turn=t.Q();turn.setFromAxisAngle(t.V(0,1,0),Math.PI/2);car.trunk.body.quaternion.copy(turn);
  const facing=Drive.forward(description);assert(Math.abs(facing.x)<1e-9);assert(facing.z<-.999);
});

test('walker recognition maps hip and knee to each physical side without changing the gait',()=>{
  const {t}=setup(),machine=walker(t);assert(t.startServoMarch(machine.motors[0]));const march=t.servoMarchFor(machine.motors[0]);
  const description=Drive.describe(machine.component,t.rotors,march,access(t));assert.equal(description.kind,'walk');assert.equal(description.chassis,machine.trunk);
  assert.equal(description.motors.length,8);assert.equal(description.motors.filter(m=>m.side<0).length,4);
  const phases=Array.from(march.walk.drives,([r,d])=>[r.id,d.sign,d.offset]);
  const left=Drive.gaitScales(description,{throttle:.8,turn:.7}),right=Drive.gaitScales(description,{throttle:.8,turn:-.7});
  for(const m of description.motors){assert(left.get(m.rotor)>=0&&left.get(m.rotor)<=1);assert.equal(left.get(m.rotor),right.get(description.motors.find(other=>other.side!==m.side).rotor));}
  assert.deepEqual(Array.from(march.walk.drives,([r,d])=>[r.id,d.sign,d.offset]),phases);
  assert(Drive.gaitScales(description,{brake:true}).values().every(n=>n===0));
  assert.equal(Drive.describe(machine.component,t.rotors,march,{...access(t),forward:t.V(0,0,1)}).kind,'unsupported');
});

test('a real four-motor Cannon chassis approaches a waypoint using only motor commands',()=>{
  const {t}=setup(),car=wheeledCar(t),description=Drive.describe(car.component,t.rotors,null,{...access(t),forward:t.V(1,0,0)});
  const baseline=car.motors.map(r=>({rpm:r.rpm,direction:r.direction,maxTorque:r.maxTorque,capacity:r.capacity}));
  for(let i=0;i<36;i++)t.stepPhysics(1/120);
  const start=car.trunk.body.position.clone(),target=start.vadd(t.V(.45,0,-.12));
  const initialDistance=Math.hypot(target.x-start.x,target.z-start.z);
  for(const r of car.motors)assert(t.configureRotor(r,{enabled:true},true));
  let nearest=initialDistance,maxTorque=0,turned=0;
  for(let i=0;i<1200;i++){
    if(i%6===0)apply(description,Drive.steer({position:car.trunk.body.position,forward:Drive.forward(description),target,speed:.25,maxSpeed:.25,stopRadius:.065,final:true,slowRadius:.14}));
    t.stepPhysics(1/120);
    nearest=Math.min(nearest,Math.hypot(target.x-car.trunk.body.position.x,target.z-car.trunk.body.position.z));
    turned=Math.max(turned,Math.abs(Drive.forward(description).z));
    for(const r of car.motors)maxTorque=Math.max(maxTorque,r.actualTorque||0);
  }
  assert(nearest<.07,'wheel contact must reach the waypoint tolerance: '+JSON.stringify({nearest,initialDistance,p:car.trunk.body.position,turned}));
  assert(Math.hypot(target.x-car.trunk.body.position.x,target.z-car.trunk.body.position.z)<.1,'braking must keep the chassis at the destination');
  assert(turned>.05,'differential traction must steer the chassis');
  assert(maxTorque<=.8+1e-7,'navigation preserves motor torque');
  assert(car.motors.some(r=>r.power?.spentJoules>0),'real actuation still spends energy');
  assert.deepEqual(car.motors.map(r=>({rpm:r.rpm,direction:r.direction,maxTorque:r.maxTorque,capacity:r.capacity})),baseline,'transient guidance preserves configured motors');
  assert(car.component.every(g=>g.body.type===1),'navigation must not make the chassis kinematic');
});

test('a real eight-joint walker follows an arc by shortening strides without extra thrust',()=>{
  const {t}=setup(),machine=walker(t);
  const baseline=machine.motors.map(r=>JSON.stringify({servo:r.servo,torque:r.maxTorque,capacity:r.capacity}));
  for(let i=0;i<24;i++)t.stepPhysics(1/120);assert(t.startServoMarch(machine.motors[0]));
  const march=t.servoMarchFor(machine.motors[0]),description=Drive.describe(machine.component,t.rotors,march,access(t));
  const start=machine.trunk.body.position.clone(),target=start.vadd(t.V(.9,0,-.3));
  let nearest=Infinity,maxError=0,maxTorque=0;
  for(let i=0;i<2400;i++){
    if(i%6===0)march.trajectoryScales=Drive.gaitScales(description,Drive.steer({position:machine.trunk.body.position,forward:Drive.forward(description),target,speed:.25,maxSpeed:.25,stopRadius:.08,final:true,slowRadius:.14}));
    t.stepPhysics(1/120);
    nearest=Math.min(nearest,Math.hypot(target.x-machine.trunk.body.position.x,target.z-machine.trunk.body.position.z));
    for(const r of machine.motors){maxError=Math.max(maxError,Math.abs(t.servoAngle(r)-r.servoGoal));maxTorque=Math.max(maxTorque,r.actualTorque||0);}
  }
  assert(nearest<.085,'the diagonal gait must physically reach the curved destination: '+nearest);
  assert(Math.hypot(target.x-machine.trunk.body.position.x,target.z-machine.trunk.body.position.z)<.1);
  assert(Drive.forward(description).z<-.3,'the body must turn, not slide sideways');
  assert(machine.trunk.body.quaternion.vmult(t.V(0,1,0)).y>.98,'the walker remains upright');
  assert(maxError<10,'the original bounded servo controller still tracks its goals: '+maxError);
  assert(maxTorque<=3.2+1e-7);assert(machine.motors.every(r=>r.enabled&&r.power.inputWatts>0));
  assert.deepEqual(machine.motors.map(r=>JSON.stringify({servo:r.servo,torque:r.maxTorque,capacity:r.capacity})),baseline);
});

test('navigation requests cannot restart a wheel whose normal energy check stopped it',()=>{
  const {t}=setup(),car=wheeledCar(t),description=Drive.describe(car.component,t.rotors,null,{...access(t),forward:t.V(1,0,0)});
  for(const r of car.motors)assert(t.configureRotor(r,{enabled:true},true));
  for(const r of car.motors)for(const id of [r.aId,r.bId])t.rotorPart(id).part.mood.energy=0;
  for(let i=0;i<12;i++){apply(description,{throttle:1,turn:.5});t.stepPhysics(1/120);}
  assert(car.motors.every(r=>!r.enabled&&r.stopReason==='empty'));
  assert(car.motors.every(r=>!r.constraint.motorEquation.enabled&&r.actualTorque===0));
});
