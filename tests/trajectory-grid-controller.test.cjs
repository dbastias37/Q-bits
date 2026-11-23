'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Controller=require('../assets/js/trajectory-controller.js');
const Model=require('../assets/js/trajectory-model.js');
const {setup,wheeledCar,access}=require('./trajectory-fixtures.cjs');

const point=(x,z,action='pass',wait=0)=>({x,y:.012,z,action,wait});
function compiled(authored,loop=false){
 const points=authored.map(p=>({...p}));
 return {id:'grid-route',revision:1,mode:'ground',valid:true,points,polyline:Model.makePolyline(Model.geometry(points,'ground')),loop};
}
function carFixture(overrides={}){
 const {t}=setup(),car=wheeledCar(t);for(let i=0;i<36;i++)t.stepPhysics(1/120);
 const adapter={component:g=>t.rotorConnectedGroups([g]),rotors:groups=>t.rotors.filter(r=>t.rotorGroups(r).every(g=>groups.includes(g))),march:()=>null,
  configureRotor:(r,p)=>t.configureRotor(r,p,true),describeOptions:access(t),validGroup:g=>t.groups.includes(g),held:()=>false,forward:()=>t.V(1,0,0),blocked:()=>null,drop:()=>({ok:true}),...overrides};
 return {t,car,adapter,node:{g:car.trunk,part:car.trunk.parts[0]},position:car.trunk.body.position};
}
function distanceToSegment(p,a,b){const x=b.x-a.x,z=b.z-a.z,squared=x*x+z*z,t=squared?Math.max(0,Math.min(1,((p.x-a.x)*x+(p.z-a.z)*z)/squared)):0;return Math.hypot(p.x-a.x-x*t,p.z-a.z-z*t);}
const pathDistance=(p,points)=>Math.min(...points.slice(1).map((b,i)=>distanceToSegment(p,points[i],b)));

test('ground controller accepts compiled geometry above the author limit and rejects beyond the shared bound',()=>{
 const f=carFixture(),p=f.position,controller=Controller.create(f.adapter);
 const authored=Array.from({length:Model.LIMITS.points},(_,i)=>point(p.x+i*.03,p.z-i*.03));
 const r=compiled(authored);assert(r.polyline.points.length>Model.LIMITS.points);
 const accepted=controller.start(f.node,r);assert(accepted.ok,accepted.message);assert.equal(accepted.drive.points.length,r.polyline.points.length);assert(controller.stop(accepted.drive));
 const full=Array.from({length:Model.LIMITS.compiledPoints},(_,i)=>point(p.x+i*.005,p.z));
 const atLimit={...r,polyline:{points:full}};const maximum=controller.start(f.node,atLimit);assert(maximum.ok,maximum.message);controller.stop(maximum.drive);
 const tooMany={...r,polyline:{points:[...full,point(p.x+1,p.z)]}};assert.equal(controller.start(f.node,tooMany).ok,false);assert(f.car.motors.every(rotor=>!rotor.enabled));
});

test('a short first leg cannot disappear inside the old pass radius',()=>{
 const f=carFixture(),p=f.position,start={x:p.x,z:p.z},r=compiled([point(p.x,p.z),point(p.x+.03,p.z-.25)]),controller=Controller.create(f.adapter);
 const launched=controller.start(f.node,r);assert(launched.ok,launched.message);const drive=launched.drive;
 // No physics steps here: this verifies that merely standing 3cm before the
 // elbow does not consume it. The following section advances real Cannon.
 for(let i=0;i<8;i++)controller.step(drive,r,.05);
 assert.equal(drive.index,1);assert.equal(drive.phase,'follow');assert.deepEqual({x:p.x,z:p.z},start);
 let result={},atTurn=null;
 for(let i=0;i<4800;i++){
  const before=drive.index;result=controller.step(drive,r,1/120);f.t.stepPhysics(1/120);
  if(before===1&&drive.index===2)atTurn={x:p.x,z:p.z};
  if(result.done||result.error)break;
 }
 assert(result.done,JSON.stringify({result,index:drive.index,phase:drive.phase,p:p.toArray()}));assert(atTurn);
 assert(Math.hypot(atTurn.x-r.polyline.points[1].x,atTurn.z-r.polyline.points[1].z)<.012);
 assert(atTurn.x>start.x+.015,'Cannon must physically traverse the short X leg before switching to Z');
});

test('almost aligned anchors do not demand a separate microscopic manoeuvre',()=>{
 const f=carFixture(),p=f.position,r=compiled([point(p.x,p.z),point(p.x+.00002,p.z-.7)]),controller=Controller.create(f.adapter);
 assert.equal(r.polyline.points.length,3,'the exact visual geometry retains the tiny X difference');
 const launched=controller.start(f.node,r);assert(launched.ok,launched.message);const drive=launched.drive;
 let result={},microStops=0;
 for(let i=0;i<4800;i++){
  result=controller.step(drive,r,1/120);f.t.stepPhysics(1/120);
  if(drive.index===1&&['turn','settle'].includes(drive.phase))microStops++;
  if(result.done||result.error)break;
 }
 assert(result.done,JSON.stringify({result,index:drive.index,phase:drive.phase,p:p.toArray()}));assert.equal(microStops,0);
 assert(Math.hypot(p.x-r.polyline.points[2].x,p.z-r.polyline.points[2].z)<.09);
});

test('a real wheel chassis brakes at a 90-degree elbow and performs only authored actions',()=>{
 const f=carFixture(),p=f.position,start=p.clone(),authored=[point(p.x,p.z),point(p.x+.7,p.z-.7,'wait',.15),point(p.x+.7,p.z-.7,'drop')];
 const r=compiled(authored),unchanged=JSON.stringify(authored);let drops=0,probes=0;
 f.adapter.drop=()=>{drops++;return {ok:true};};f.adapter.blocked=()=>{probes++;return null;};
 const controller=Controller.create(f.adapter),launched=controller.start(f.node,r);assert(launched.ok,launched.message);
 const drive=launched.drive,phases=new Set(),waitIndices=new Set(),configuration=f.car.motors.map(rotor=>({rpm:rotor.rpm,maxTorque:rotor.maxTorque,capacity:rotor.capacity}));
 let result={},turn=null,maxDeviation=0,largestStep=0,steps=0;
 for(;steps<4800;steps++){
  const before=p.clone(),oldIndex=drive.index;result=controller.step(drive,r,1/120);f.t.stepPhysics(1/120);
  phases.add(drive.phase);if(drive.phase==='wait')waitIndices.add(drive.index);
  if(oldIndex===1&&drive.index===2)turn={distance:Math.hypot(p.x-r.polyline.points[1].x,p.z-r.polyline.points[1].z),speed:Math.hypot(f.car.trunk.body.velocity.x,f.car.trunk.body.velocity.z)};
  maxDeviation=Math.max(maxDeviation,pathDistance(p,r.polyline.points));largestStep=Math.max(largestStep,p.distanceTo(before));
  if(result.done||result.error)break;
 }
 assert(result.done,JSON.stringify({result,index:drive.index,phase:drive.phase,p:p.toArray(),maxDeviation,steps}));
 assert(turn&&turn.distance<.035&&turn.speed<.06,JSON.stringify(turn));assert(phases.has('settle')&&phases.has('turn'));
 assert(maxDeviation<.09,'the chassis must follow the L, not take the diagonal or swing far beyond it: '+maxDeviation);
 assert.deepEqual([...waitIndices],[2]);assert.equal(drops,1);assert.equal(r.polyline.points[1].action,'pass');assert.equal(r.polyline.points[1].wait,0);
 assert.equal(JSON.stringify(authored),unchanged);assert(largestStep<.05);assert(p.distanceTo(start)>.8);assert(probes<=Math.ceil(steps/6)+1);
 assert(f.car.component.every(group=>group.body.type===1));assert(f.car.motors.every(rotor=>!rotor.enabled&&!rotor.trajectoryDrive));assert(f.car.motors.some(rotor=>rotor.power?.spentJoules>0));
 assert.deepEqual(f.car.motors.map(rotor=>({rpm:rotor.rpm,maxTorque:rotor.maxTorque,capacity:rotor.capacity})),configuration);
});

test('a real obstacle on the second axis stops the real chassis after the first elbow',()=>{
 const f=carFixture(),p=f.position,start=p.clone(),r=compiled([point(p.x,p.z),point(p.x+.8,p.z-1.2)]);
 const obstacle=f.t.addQubit([p.x+.8,.045,p.z-.9]),obstacleStart=obstacle.body.position.clone(),probed=[];
 f.adapter.blocked=(drive,target)=>{probed.push({index:drive.index,x:target.x,z:target.z});return f.t.trajectoryObstacle(drive,target);};
 const controller=Controller.create(f.adapter),launched=controller.start(f.node,r);assert(launched.ok,launched.message);let result={};
 for(let i=0;i<4800;i++){result=controller.step(launched.drive,r,1/120);f.t.stepPhysics(1/120);if(result.done||result.error)break;}
 assert(result.error&&/bloqueado/.test(result.message),JSON.stringify({result,index:launched.drive.index,p:p.toArray()}));
 assert.equal(launched.drive.index,2);assert(p.x>start.x+.65);assert(p.z<start.z-.1,'the chassis must physically enter the second leg before reaching the obstruction');
 assert(probed.some(probe=>probe.index===1)&&probed.some(probe=>probe.index===2));
 for(const probe of probed)assert.deepEqual({x:probe.x,z:probe.z},{x:r.polyline.points[probe.index].x,z:r.polyline.points[probe.index].z});
 assert(Math.hypot(p.x-obstacle.body.position.x,p.z-obstacle.body.position.z)>.3,'pause before contact instead of pushing through the obstacle');
 assert(Math.hypot(obstacle.body.position.x-obstacleStart.x,obstacle.body.position.z-obstacleStart.z)<.005);assert(f.car.motors.every(rotor=>!rotor.enabled&&!rotor.trajectoryDrive));
});

test('a real looping chassis retraces each compiled elbow in reverse without a shortcut',()=>{
 const f=carFixture(),p=f.position,start=p.clone(),r=compiled([point(p.x,p.z),point(p.x+.45,p.z-.45)],true),controller=Controller.create(f.adapter);
 const launched=controller.start(f.node,r);assert(launched.ok,launched.message);const drive=launched.drive,order=[];
 let result={},previous='',largestStep=0,maxDeviation=0;
 for(let i=0;i<9000;i++){
  const before=p.clone();result=controller.step(drive,r,1/120);f.t.stepPhysics(1/120);largestStep=Math.max(largestStep,p.distanceTo(before));maxDeviation=Math.max(maxDeviation,pathDistance(p,r.polyline.points));
  const state=drive.index+':'+drive.direction;if(state!==previous){order.push(state);previous=state;}
  if(result.error||order.includes('0:-1')&&drive.index===1&&drive.direction===1)break;
 }
 assert(!result.error,JSON.stringify({result,order,p:p.toArray()}));assert.deepEqual(order,['0:1','1:1','2:1','1:-1','0:-1','1:1']);
 // A real skid-steer chassis needs clearance during the 180-degree reversal.
 // This corridor still excludes the diagonal shortcut (22.5cm from either
 // axis at its midpoint) without pretending the physical body runs on rails.
 assert(Math.hypot(p.x-start.x,p.z-start.z)<.09);assert(largestStep<.05);assert(maxDeviation<.15,'return must follow the two existing axes: '+maxDeviation);assert.equal(r.polyline.points.length,3);
 assert(controller.stop(drive));assert(f.car.motors.every(rotor=>!rotor.enabled));
});
