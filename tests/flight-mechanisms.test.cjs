const test=require('node:test');
const assert=require('node:assert/strict');
const {lab,tick,machine}=require('./flight-mechanism-fixture.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
const structure=t=>t.groups.map(g=>({body:g.body.id,mass:g.body.mass,parts:g.parts.map(p=>[p.id,p.weight])}));
const dynamic=t=>t.groups.filter(g=>!g.virtualConveyor).every(g=>g.body.type===1&&!g.body.fixedRotation);
const selectBase=(t,m)=>{const hit=t.rotorPart(m.baseId);t.setSelected({g:hit.g,part:hit.part});};
const start=(t,kind,m)=>kind==='arm'?t.startRobotArm(m):t.startConveyor(m);
const stop=(t,kind,m)=>kind==='arm'?t.stopRobotArm(m):t.stopConveyor(m);

// Regression: previously the arm's automatic support pin became KINEMATIC,
// stopped the drone as "fixed", then released the floating base on arrival.
test('four propellers hold a real four-axis arm through panel motions to B and A and their final brakes',()=>{
 const {t,mechanism:arm,base,flight}=machine(),before=structure(t);
 assert(t.startFlight(flight),flight.status);tick(t,5);selectBase(t,arm);
 for(const pose of ['place','pick']){
  const energy=t.externalBatterySummary(base).storedJ,phase=flight.phase,rotation=base.body.quaternion.clone();
  assert(t.robotPanelAction('goto',{pose}).ok,arm.status);
  let frames=0,minimum=Infinity,paidMotors=false,paidFlight=false;
  while(arm.jogging&&frames++<1200){
   t.stepPhysics(1/120);
   assert(flight.enabled,flight.status);assert(dynamic(t),'moving tools must not fix the carrier to the world');
   minimum=Math.min(minimum,t.flightSnapshot(flight).height);
   paidMotors||=t.robotArmRotors(arm).some(r=>r.power?.spentJoules>0);
   paidFlight||=flight.power?.spentJoules>0;
  }
  assert(frames>12&&frames<1200,arm.status);assert.equal(arm.jogging,false);assert.match(arm.status,/Postura lista/);
  assert(t.robotArmRotors(arm).every((r,i)=>Math.abs(t.robotTargetError(r,arm.poses[pose][i]))<.055));
  assert(minimum>.5,`minimum flight clearance ${minimum}`);assert(paidMotors&&paidFlight,'both controllers consume energy');
  assert(t.externalBatterySummary(base).storedJ<energy);assert.notEqual(flight.phase,phase,'propellers continue animating');
  assert.notDeepEqual(base.body.quaternion,rotation,'the carrier responds to real joint reaction torque');
  tick(t,2);assert(flight.enabled,flight.status);assert(t.flightSnapshot(flight).height>.5);assert(dynamic(t));
 }
 assert.deepEqual(structure(t),before,'no parts, masses or Cannon bodies replaced');
});

for(const kind of ['arm','conveyor'])for(const order of ['flight-first','tool-first'])test(`${kind} and flight coexist when ${order}, and stopping only the tool preserves lift`,()=>{
 const {t,mechanism,base,flight}=machine(kind),before=structure(t);
 if(order==='tool-first'){
  assert(start(t,kind,mechanism),mechanism.status);tick(t,.2);assert.equal(base.body.type,4,'ground machinery keeps its ordinary support');
  const pose=base.body.position.clone(),energy=t.externalBatterySummary(base).storedJ;
  assert(t.startFlight(flight),flight.status);assert.equal(base.body.type,1);assert(base.body.position.distanceTo(pose)<1e-12);assert.equal(t.externalBatterySummary(base).storedJ,energy);
 }else{
  assert(t.startFlight(flight),flight.status);tick(t,5);assert(start(t,kind,mechanism),mechanism.status);
 }
 tick(t,5);assert(mechanism.running,mechanism.status);assert(flight.enabled,flight.status);assert(dynamic(t));assert(Math.abs(t.flightSnapshot(flight).height-.65)<.05);
 const energy=t.externalBatterySummary(base).storedJ,phase=flight.phase;
 tick(t,.25);assert(t.externalBatterySummary(base).storedJ<energy);assert.notEqual(flight.phase,phase);
 stop(t,kind,mechanism);tick(t,2);assert(flight.enabled,flight.status);assert(dynamic(t));assert(t.flightSnapshot(flight).height>.55);
 assert.deepEqual(structure(t),before);
});

test('a rejected takeoff preserves the running ground tool, its anchor, pose and energy',()=>{
 const {t,mechanism:arm,base,flight}=machine();assert(t.startRobotArm(arm));tick(t,.2);
 const pin=arm.pin,pose=base.body.position.clone(),cells=base.parts.filter(t.isExternalBattery);
 for(const p of cells)p.mood.externalBattery.enabled=false;
 const energy=t.externalBatterySummary(base).storedJ;
 assert.equal(t.startFlight(flight),false);assert.match(flight.status,/batería/);assert(arm.running);assert.equal(arm.pin,pin);assert.equal(base.body.type,4);assert(base.body.position.distanceTo(pose)<1e-12);assert.equal(t.externalBatterySummary(base).storedJ,energy);
 for(const p of cells)p.mood.externalBattery.enabled=true;
 assert(t.startFlight(flight),flight.status);assert.equal(arm.pin,null);assert.equal(base.body.type,1);
});

test('explicitly fixed rotors remain a takeoff blocker rather than being silently released',()=>{
 const {t,mechanism:arm,base,flight}=machine(),rotor=t.robotArmRotors(arm)[0];
 assert(t.configureRotor(rotor,{mount:'fixed',enabled:true},true));
 const pin=rotor.pin,pose=base.body.position.clone(),energy=t.externalBatterySummary(base).storedJ;
 assert(pin);assert.equal(t.startFlight(flight),false);assert.match(flight.status,/anclaje fijo/);
 assert.equal(rotor.pin,pin);assert(rotor.enabled);assert.equal(base.body.type,4);assert(base.body.position.distanceTo(pose)<1e-12);assert.equal(t.externalBatterySummary(base).storedJ,energy);
});

for(const reason of ['manual','empty'])test(`${reason} flight shutdown lets an active airborne arm fall without an automatic world anchor`,()=>{
 const {t,mechanism:arm,base,flight}=machine();assert(t.startFlight(flight));tick(t,5);assert(t.startRobotArm(arm));tick(t,.25);
 const height=t.flightSnapshot(flight).height;
 if(reason==='manual'){selectBase(t,arm);assert(t.flightPanelAction('stop'));}
 else for(const p of base.parts.filter(t.isExternalBattery))p.mood.energy=1e-10;
 tick(t,.25);assert.equal(flight.enabled,false);assert(dynamic(t));assert(!arm.pin);assert(t.flightSnapshot(flight).height<height-.15,'gravity must resume, not freeze the platform');
 tick(t,2);assert(t.flightSnapshot(flight).height<.025);
 if(reason==='empty')assert(base.parts.filter(t.isExternalBattery).every(p=>p.mood.energy===0));
});

for(const kind of ['arm','conveyor'])test(`${kind} keeps its controls while a requested landing ends on real ground`,()=>{
 const {t,mechanism,base,flight}=machine(kind);assert(t.startFlight(flight));tick(t,5);assert(start(t,kind,mechanism),mechanism.status);tick(t,.25);
 selectBase(t,mechanism);assert(t.flightPanelAction('land'));assert(flight.landing);tick(t,6);
 assert.equal(flight.enabled,false);assert.match(flight.status,/Aterrizado/);assert(t.flightSnapshot(flight).height<.02);assert(mechanism.running,mechanism.status);
 if(kind==='conveyor'){assert(mechanism.pin);assert.equal(base.body.type,4,'the belt may reacquire a fresh anchor only on real support');}
 else assert.equal(base.body.type,1);
});

for(const kind of ['arm','conveyor'])test(`${kind} and airborne flight restore together without reanchoring, moving bodies or spending stored energy`,()=>{
 const {t,mechanism,base,flight}=machine(kind);assert(t.startFlight(flight));tick(t,5);assert(start(t,kind,mechanism),mechanism.status);tick(t,.5);
 const saved=plain(t.saveLab({passive:true})),energy=t.externalBatterySummary(base).storedJ,pose=base.body.position.clone(),height=t.flightSnapshot(flight).height;
 const game=lab(),rt=game.t,hydrated=rt.hydrateLabSnapshot(saved);rt.story.lab=hydrated;rt.story.scene='campaign';rt.enterLab(false);
 const result=rt.restoreLabRuntime(hydrated.runtime),restored=kind==='arm'?rt.robotArms[0]:rt.conveyors[0],carrier=rt.rotorPart(restored.baseId).g,rf=rt.flightForGroup(carrier);
 assert(result.ok,result.warnings.join('; '));assert(restored.running);assert(rf.enabled);assert(dynamic(rt));assert.equal(rt.externalBatterySummary(carrier).storedJ,energy);assert(carrier.body.position.distanceTo(pose)<1e-10);
 tick(rt,1);assert(rf.enabled,rf.status);assert(restored.running,restored.status);assert(dynamic(rt));assert(rt.flightSnapshot(rf).height>height-.05);assert(rt.externalBatterySummary(carrier).storedJ<energy);
});

test('a compact four-propeller carrier picks, carries and releases one cube with the original four-axis arm',()=>{
 const {t,mechanism:arm,base,flight}=machine('arm',{}, {spanX:5,spanZ:4});
 assert(t.startFlight(flight));tick(t,5);
 // Teach a clear 30-degree delivery with the real jog controller. A 90-degree
 // swing intersects this compact frame and must still be rejected by planning.
 assert(t.jogRobotArm(arm,0,30));for(let i=0;i<1200&&arm.jogging;i++)t.stepPhysics(1/120);
 assert.match(arm.status,/Postura lista/);assert(t.teachRobotArmPose(arm,'place'));
 assert(t.configureRotor(t.robotArmRotors(arm)[0],{rpm:1},true));assert(t.configureRobotArm(arm,{repeat:false}));assert(t.startRobotArm(arm));
 for(let i=0;i<1800&&arm.state!=='wait';i++)t.stepPhysics(1/120);assert.equal(arm.state,'wait',arm.status);
 const face=t.robotKinematics(arm),point=face.point.vadd(face.normal.scale(.06)),payload=t.addQubit([point.x,point.y,point.z]),origin=payload.body.position.clone();
 arm.scan=0;const before=structure(t),energy=t.externalBatterySummary(base).storedJ;let carrying=0,minimum=Infinity;
 for(let i=0;i<1800&&arm.running;i++){
  t.stepPhysics(1/120);assert(flight.enabled,flight.status);assert(dynamic(t));
  if(t.robotGrips.has(arm.gripperId)){carrying++;minimum=Math.min(minimum,t.flightSnapshot(flight).height);assert(t.flightSnapshot(flight).load>53.7,'payload participates in the lift budget');}
 }
 assert(carrying>240,'loaded flight must last beyond the former two-second tipping failure');
 assert.equal(arm.cycles,1,arm.status);assert.match(arm.status,/Ciclo completado/);assert.equal(t.robotGrips.size,0);assert(payload.body.position.distanceTo(origin)>.2);
 assert(minimum>.55,`loaded clearance ${minimum}`);assert(t.externalBatterySummary(base).storedJ<energy);assert.deepEqual(structure(t),before);
 tick(t,2);assert(flight.enabled,flight.status);assert(t.flightSnapshot(flight).height>.6);assert(payload.body.position.y<.07);
});

test('shoulder, elbow and wrist jogs move their real joints without disabling onboard flight',()=>{
 const {t,mechanism:arm,flight}=machine();assert(t.startFlight(flight));tick(t,5);
 for(const joint of [1,2,3])for(const degrees of [15,-15]){
  assert(t.jogRobotArm(arm,joint,degrees),arm.status);
  for(let i=0;i<1200&&arm.jogging;i++){t.stepPhysics(1/120);assert(flight.enabled,flight.status);assert(dynamic(t));assert(t.flightSnapshot(flight).height>.5);}
  assert.equal(arm.jogging,false);assert.match(arm.status,/Postura lista/);
 }
});

test('a sensor directed at the arm stops its sequence while the drone keeps hovering and spending energy',()=>{
 const {t,mechanism:arm,base,flight}=machine(),sensor=base.parts.filter(p=>p.shape==='cube'&&!t.isExternalBattery(p)).sort((a,b)=>b.offset.x-a.offset.x||Math.abs(a.offset.z)-Math.abs(b.offset.z))[0];
 sensor.mood.workshop={version:1,ownerId:sensor.id,sensor:true,battery:1,lightweight:1,movement:1,baseWeight:1,ballast:0};
 sensor.mood.sensorConfig={mode:'laser',action:'stop',range:60,speed:1,weight:1};
 assert(t.linkContactSensor(sensor.id,t.robotArmRotors(arm)[0]));assert(t.startFlight(flight));tick(t,5);assert(t.startRobotArm(arm));tick(t,.5);
 const point=t.rotorPart(sensor.id).p;t.storyWall(point.vadd(t.V(.4,0,0)),t.V(.025,.025,.025));tick(t,.2);
 assert.equal(arm.running,false);assert(flight.enabled,flight.status);const energy=t.externalBatterySummary(base).storedJ;
 tick(t,2);assert(flight.enabled,flight.status);assert(t.flightSnapshot(flight).height>.6);assert(t.externalBatterySummary(base).storedJ<energy);
});
