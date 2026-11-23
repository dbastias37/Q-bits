const test=require('node:test');
const assert=require('node:assert/strict');
const Controller=require('../assets/js/trajectory-controller.js');
const Model=require('../assets/js/trajectory-model.js');
const {setup,wheeledCar,walker,access}=require('./trajectory-fixtures.cjs');

function route(points,loop=false){
  points=points.map(p=>({y:.012,action:'pass',wait:0,...p}));
  return {id:'route-test',revision:1,mode:'ground',valid:true,points,polyline:Model.makePolyline(points),loop};
}
function gameAdapter(t,overrides={}){
  return {component:g=>t.rotorConnectedGroups([g]),rotors:groups=>t.rotors.filter(r=>t.rotorGroups(r).every(g=>groups.includes(g))),
    march:groups=>Array.from(t.servoMarches).find(m=>m.members.some(r=>t.rotorGroups(r).some(g=>groups.includes(g))))||null,
    startMarch:g=>t.startServoMarch(g),configureRotor:(r,p)=>t.configureRotor(r,p,true),stopMarch:(m,why)=>t.stopServoMarch(m,why),
    describeOptions:access(t),validGroup:g=>t.groups.includes(g),held:g=>!!t.getHeld()?.items.some(item=>item.g===g),blocked:()=>null,drop:()=>({ok:true}),...overrides};
}
function mock(){
  const body=(x,z)=>({position:{x,y:.15,z},velocity:{x:0,y:0,z:0},angularVelocity:{x:0,y:0,z:0},quaternion:{x:0,y:0,z:0,w:1}});
  const chassis={parts:[{id:1}],body:body(0,0)},groups=[chassis],rotors=[],parts=new Map();
  for(const side of [-1,1]){
    const wheel={parts:[{id:10+side}],body:body(0,side*.2)};groups.push(wheel);
    const r={aId:20+side,bId:30+side,pair:[chassis,wheel],moving:'b',mount:'wheel',rpm:30,direction:1,maxTorque:1,capacity:128,enabled:false,constraint:{}};rotors.push(r);
    parts.set(r.bId,{p:{x:0,y:.15,z:side*.2},axis:{x:0,y:0,z:-side}});
  }
  let held=false,dropCount=0,checks=0,obstacle=null,topology=0;
  const adapter={component:()=>groups,rotors:()=>rotors,march:()=>null,configureRotor:(r,p)=>{Object.assign(r,p);return true;},
    validGroup:g=>groups.includes(g),held:()=>held,forward:()=>({x:1,y:0,z:0}),topologyVersion:()=>topology,
    describeOptions:{groupsOf:r=>r.pair,partOf:id=>parts.get(id),endpoint:p=>({point:p.p,axis:p.axis}),boundsOf:g=>({min:{y:g===chassis?.1:0}})},
    blocked:()=>{checks++;return obstacle;},drop:()=>{dropCount++;return {ok:true};}};
  return {chassis,groups,rotors,node:{g:chassis,part:chassis.parts[0]},adapter,get drops(){return dropCount;},get checks(){return checks;},set held(value){held=value;},set obstacle(value){obstacle=value;},changeTopology(){topology++;}};
}
function ticks(controller,drive,r,count,dt=.05){let result;for(let i=0;i<count;i++){result=controller.step(drive,r,dt);if(result.done||result.error)break;}return result;}

test('start rejects a distant receiver and leaves an unrelated active mechanism alone',()=>{
  const m=mock(),controller=Controller.create(m.adapter),r=route([{x:1,z:0},{x:2,z:0}]);
  assert(!controller.start(m.node,r).ok);assert(m.rotors.every(r=>!r.enabled));
  m.chassis.body.position.x=1;m.rotors[0].enabled=true;
  assert(!controller.start(m.node,r).ok);assert(m.rotors[0].enabled,'a rejected request must not stop the manually running rotor');
});

test('a rejected motor start rolls every partially enabled wheel back to stopped',()=>{
  const m=mock();let starts=0;
  m.adapter.configureRotor=(r,p)=>{Object.assign(r,p);return !p.enabled||++starts<2;};
  const result=Controller.create(m.adapter).start(m.node,route([{x:0,z:0},{x:1,z:0}]));
  assert(!result.ok);assert(m.rotors.every(r=>!r.enabled&&!r.trajectoryDrive));
});

test('one mechanism can be owned by only one receiver, and stopping releases that ownership',()=>{
  const m=mock(),controller=Controller.create(m.adapter),r=route([{x:0,z:0},{x:1,z:0}]);
  const first=controller.start(m.node,r);assert(first.ok);assert(!controller.start({...m.node,part:{id:99}},r).ok);
  assert(controller.stop(first.drive));assert(!controller.stop(first.drive));assert(m.rotors.every(r=>!r.enabled&&!r.trajectoryDrive));
  assert(controller.start(m.node,r).ok);
});

test('wait and drop happen at the reached point once, and the return retraces intermediate points',()=>{
  const m=mock(),controller=Controller.create(m.adapter),r=route([{x:0,z:0},{x:.3,z:0,action:'wait',wait:.2},{x:.6,z:.1,action:'drop'}],true);
  const {drive}=controller.start(m.node,r);ticks(controller,drive,r,1);assert.equal(drive.index,1);
  Object.assign(m.chassis.body.position,r.points[1]);ticks(controller,drive,r,4);assert.equal(drive.phase,'wait');
  const left=drive.waitRemaining;controller.step(drive,r,0);assert.equal(drive.waitRemaining,left,'pause does not spend a wait');
  ticks(controller,drive,r,5);assert.equal(drive.index,2);
  Object.assign(m.chassis.body.position,r.points[2]);ticks(controller,drive,r,4);assert.equal(m.drops,1);assert.equal(drive.direction,-1);assert.equal(drive.index,1,'return must target the preceding waypoint, never the first endpoint directly');
  const pose={...m.chassis.body.position};ticks(controller,drive,r,2);assert.deepEqual(m.chassis.body.position,pose,'the controller never teleports to the start');assert.equal(m.drops,1);
});

test('guidance probes at most twenty times per second and an obstacle stops all motors',()=>{
  const m=mock(),controller=Controller.create(m.adapter),r=route([{x:0,z:0},{x:1,z:0}]);
  const {drive}=controller.start(m.node,r);ticks(controller,drive,r,120,1/120);assert(m.checks<=20);
  m.obstacle='Hay una pieza en el camino';const result=ticks(controller,drive,r,6,1/120);assert(result.error);assert.match(result.message,/camino/);
  const checks=m.checks;ticks(controller,drive,r,120,1/120);assert.equal(m.checks,checks);assert(m.rotors.every(r=>!r.enabled));
});

for(const problem of ['power','held','topology','route'])test('following stops safely on '+problem,()=>{
  const m=mock(),controller=Controller.create(m.adapter),r=route([{x:0,z:0},{x:1,z:0}]);const {drive}=controller.start(m.node,r);
  if(problem==='power'){m.rotors[0].enabled=false;m.rotors[0].stopReason='empty';}
  if(problem==='held')m.held=true;if(problem==='topology'){const added={...m.rotors[0],enabled:false,constraint:{}};delete added.trajectoryDrive;m.rotors.push(added);m.changeTopology();}if(problem==='route')r.revision++;
  assert(ticks(controller,drive,r,1).error);assert(m.rotors.every(r=>!r.enabled&&!r.trajectoryDrive));
});

test('an unrelated topology edit revalidates the owned graph without stopping or rescanning it every step',()=>{
  const m=mock();let reads=0;const component=m.adapter.component;m.adapter.component=g=>{reads++;return component(g);};
  const controller=Controller.create(m.adapter),r=route([{x:0,z:0},{x:1,z:0}]),{drive}=controller.start(m.node,r);
  const initial=reads;m.changeTopology();assert(!ticks(controller,drive,r,1).error);assert.equal(reads,initial+1);
  ticks(controller,drive,r,6);assert.equal(reads,initial+1);assert(m.rotors.every(r=>r.enabled));
});

test('an immobile commanded chassis stops after the progress budget instead of retrying forever',()=>{
  const m=mock(),controller=Controller.create(m.adapter),r=route([{x:0,z:0},{x:1,z:0}]);const {drive}=controller.start(m.node,r);
  const result=ticks(controller,drive,r,180);assert(result.error);assert.match(result.message,/no avanza/);assert(m.rotors.every(r=>!r.enabled));
});

test('the controller runs a real wheeled chassis through a wait and dispatches cargo release',()=>{
  const {t}=setup(),car=wheeledCar(t);for(let i=0;i<36;i++)t.stepPhysics(1/120);
  const p=car.trunk.body.position,start={x:p.x,z:p.z},r=route([start,{x:p.x+.45,z:p.z-.12,action:'wait',wait:.2},{x:p.x+.9,z:p.z-.12,action:'drop'}]);
  let drops=0,probes=0;
  const controller=Controller.create(gameAdapter(t,{forward:()=>t.V(1,0,0),blocked:()=>{probes++;return null;},drop:()=>{drops++;return {ok:true};}}));
  const launched=controller.start({g:car.trunk,part:car.trunk.parts[0]},r);assert(launched.ok,launched.message);
  let result={},steps=0,visitedWait=false;
  for(;steps<3600;steps++){result=controller.step(launched.drive,r,1/120);t.stepPhysics(1/120);visitedWait||=launched.drive.phase==='wait';if(result.done||result.error)break;}
  assert(result.done,JSON.stringify({result,index:launched.drive.index,phase:launched.drive.phase,p:p.toArray(),steps}));
  assert(visitedWait);assert.equal(drops,1);assert(probes<=Math.ceil(steps/6));
  assert(Math.hypot(p.x-r.points[2].x,p.z-r.points[2].z)<.1);
  assert(car.motors.every(r=>!r.enabled&&!r.trajectoryDrive));
});

test('a real wheel chassis returns through the same middle point without teleporting or drawing a closing shortcut',()=>{
  const {t}=setup(),car=wheeledCar(t);for(let i=0;i<36;i++)t.stepPhysics(1/120);
  const p=car.trunk.body.position,r=route([{x:p.x,z:p.z},{x:p.x+.3,z:p.z},{x:p.x+.6,z:p.z-.1}],true);
  const controller=Controller.create(gameAdapter(t,{forward:()=>t.V(1,0,0)})),launched=controller.start({g:car.trunk,part:car.trunk.parts[0]},r);assert(launched.ok);
  const drive=launched.drive,order=[];let previous='',largestStep=0,result={};
  for(let i=0;i<3600;i++){
    const before=p.clone();result=controller.step(drive,r,1/120);t.stepPhysics(1/120);largestStep=Math.max(largestStep,p.distanceTo(before));
    const entry=drive.index+':'+drive.direction;if(entry!==previous){order.push(entry);previous=entry;}
    if(result.error||order.includes('0:-1')&&drive.index===1&&drive.direction===1)break;
  }
  assert(!result.error,result.message);assert.deepEqual(order,['0:1','1:1','2:1','1:-1','0:-1','1:1']);
  assert(Math.hypot(p.x-r.points[0].x,p.z-r.points[0].z)<.1,'the chassis physically returns to the start');
  assert(largestStep<.05,'no navigation step can move the body directly between endpoints');
  assert(controller.stop(drive));assert(car.motors.every(r=>!r.enabled));
});

test('the controller starts the real eight-servo gait and finishes its curved route',()=>{
  const {t}=setup(),machine=walker(t);for(let i=0;i<24;i++)t.stepPhysics(1/120);
  const p=machine.trunk.body.position,r=route([{x:p.x,z:p.z},{x:p.x+.9,z:p.z-.3}]);
  const controller=Controller.create(gameAdapter(t));const launched=controller.start({g:machine.trunk,part:machine.trunk.parts[0]},r);assert(launched.ok,launched.message);
  assert.equal(launched.drive.description.kind,'walk');let result={};
  for(let i=0;i<3000;i++){result=controller.step(launched.drive,r,1/120);t.stepPhysics(1/120);if(result.done||result.error)break;}
  assert(result.done,JSON.stringify({result,p:p.toArray(),index:launched.drive.index,phase:launched.drive.phase}));
  assert(machine.motors.every(r=>!r.enabled));assert.equal(t.servoMarches.size,0);assert(!launched.drive.description.march.trajectoryScales);
  assert(Math.hypot(p.x-r.points[1].x,p.z-r.points[1].z)<.11);
});

