const test=require('node:test');
const assert=require('node:assert/strict');
const {setup}=require('./trajectory-fixtures.cjs');
const Preferences=require('../assets/js/preferences.js');
const Controls=require('../assets/js/controls.js');
const near=(a,b,tolerance=1e-7)=>assert(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
// Scope-only adapter fixture for the preflight/checkpoint entry points below.
// No simulation step runs in this context and no material/economy claim is
// derived from it; separate mission tests pay for the actual drone components.
function missionContext(f,run){
 const {t,cell}=f,scene=t.story.scene,galpon=t.story.galpon,matter=cell.mood.matter;
 t.story.scene='galpon';cell.mood.matter={root:cell.id,path:'',rootWeight:1};
 t.story.galpon={records:[{id:cell.id,origin:cell.id,path:'',kind:'cube',weight:1,energy:cell.mood.energy}]};
 try{return run();}finally{t.story.scene=scene;t.story.galpon=galpon;if(matter===undefined)delete cell.mood.matter;else cell.mood.matter=matter;}
}

function fixture(front=false){
 const game=setup(),{t}=game,template=t.galponDroneTemplate(front);
 assert(t.savedMechanismValid(template));const drone=t.spawnSavedMechanism(template,t.V(-.5,0,0));assert(drone);
 const grip=drone.parts.find(p=>p.mood.gripper),cell=drone.parts.find(t.isExternalBattery),receiver=drone.parts.find(p=>p.shape==='cube'&&!p.mood.gripper&&!p.mood.externalBattery);
 receiver.mood.trajectory={version:1,level:1,face:0,role:'receiver',routeId:null};t.onTrajectoryPartChanged(drone,receiver);cell.mood.energy=1;cell.mood.externalBattery.enabled=true;
 const marker=(x,z)=>{const q=t.Q();q.setFromAxisAngle(t.V(0,0,1),Math.PI/2);return t.makeGroup([{id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(x,.047,z),q,mood:{trajectory:{version:1,level:1,face:0,role:'beacon',routeId:null}}}]);};
 const start=marker(-.5,-.35),end=marker(1.6,-.35),system=t.getTrajectorySystem(),created=system.createStart(start.parts[0].id);assert(created.ok);assert(system.pair(created.routeId,end.parts[0].id).ok);assert(system.assign(receiver.id,created.routeId).ok);
 t.storyWall(t.V(0,.475,0),t.V(.25,.1,.25));t.storyWall(t.V(1.2,.475,0),t.V(.25,.1,.25));
 const payload=t.addQubit([0,.622,0]);for(let i=0;i<90;i++)t.stepPhysics(1/120);
 const route=system.routeFor(receiver.id);system.refresh(route);assert(route.valid,route.reason);
 return {...game,drone,grip,cell,receiver,start,end,system,route,payload,flight:t.flightForGroup(drone)};
}
function setCargoRoute(f,loop=true){
 const {t,route,receiver,system,front,grip}=f,face=t.rotorPart(grip.id),normal=face.q.vmult(t.V(0,-1,0)),state=t.flightSnapshot(f.flight),originGrip=face.p;
 const payloadBox=t.bounds(f.payload),pickFace=normal.y<-.85?t.V(payloadBox.center.x,payloadBox.max.y+.025,payloadBox.center.z):t.V(payloadBox.min.x-.025,payloadBox.center.y,payloadBox.center.z);
 const targetGrip=pickFace.vsub(normal.scale(.045)),shift=targetGrip.vsub(originGrip),pick={x:state.center.x+shift.x,y:state.height+shift.y,z:state.center.z+shift.z,action:'grab',wait:20};
 const drop={x:pick.x+1.2,y:pick.y+.035,z:pick.z,action:'drop',wait:.25};
 const points=[{...route.points[0],y:.9,action:'land',wait:.2},pick,{...pick,y:.9,action:'pass',wait:0},{...drop,y:.9,action:'pass',wait:0},drop,{...drop,y:.9,action:'pass',wait:0},{...route.points.at(-1),y:.9,action:'pass',wait:0}];
 const result=system.edit(receiver.id,points,loop);assert(result.ok,result.message);return {pick,drop,points};
}

for(const front of [false,true])test(`QR picks a real ${front?'front':'lower'} load, carries it, releases over the table and returns to origin`,context=>{
 const f=fixture(front),{t,system,receiver,flight,payload,drone,cell}=f,{drop}=setCargoRoute(f),energy=cell.mood.energy,ids=drone.parts.map(p=>p.id),mass=drone.body.mass;
 assert(system.start(receiver.id).ok);let grabbed=false,released=false,returned=false,maxPayloadHeight=0,releaseX=null,seconds=0;
 for(let i=0;i<120*100;i++){
  t.stepPhysics(1/120);maxPayloadHeight=Math.max(maxPayloadHeight,payload.body.position.y);
  if(t.robotGrips.size)grabbed=true;
  if(grabbed&&!t.robotGrips.size&&!released){released=true;releaseX=payload.body.position.x;}
  if(released&&flight.trip?.phase==='ground'&&flight.trip.index===0){returned=true;seconds=i/120;break;}
  if(!system.followers.has(receiver.id))break;
 }
 assert(grabbed,JSON.stringify({status:flight.status,node:system.nodes.get(receiver.id).status,trip:flight.trip,drone:drone.body.position,payload:payload.body.position}));
 assert(released,JSON.stringify({reason:'real pincher never released',status:flight.status,node:system.nodes.get(receiver.id).status,trip:flight.trip,drone:drone.body.position,payload:payload.body.position}));assert(returned,JSON.stringify({status:flight.status,node:system.nodes.get(receiver.id).status,trip:flight.trip,drone:drone.body.position,payload:payload.body.position}));
 assert(Math.abs(releaseX-1.2)<.08,`release at ${releaseX} instead of the destination`);assert(payload.body.position.x>1.1);assert(maxPayloadHeight>.635,'the carrier lifted its load clear of the source support');
 assert(cell.mood.energy<energy);near(drone.body.mass,mass);assert.deepEqual(drone.parts.map(p=>p.id),ids);assert.equal(drone.body.type,1);assert.equal(t.robotGrips.size,0);
 context.diagnostic(JSON.stringify({orientation:front?'front':'lower',roundTripSeconds:seconds,spentJ:(energy-cell.mood.energy)*t.externalBatteryCapacity(cell),deliveredX:payload.body.position.x}));
});

test('visual cargo teaching leaves all bodies, charge and identities untouched and catches obstruction and wrong facing',()=>{
 const f=fixture(),{t,receiver,drone,payload}=f,before=drone.body.position.clone(),energy=f.cell.mood.energy,count=t.groups.length;
 assert(t.beginLogisticsPoseDraft(receiver.id,'pick'));
 const draft=t.getLogisticsPoseDraft(),box=t.bounds(payload),surface={point:t.V(box.center.x,box.max.y,box.center.z),normal:t.V(0,1,0)};
 const good=t.logisticsPoseEvaluation(draft,surface);assert(good.valid,good.reason);assert(good.ghostPoses.length===drone.parts.length);
 assert.equal(t.logisticsPoseEvaluation(draft,{...surface,normal:t.V(1,0,0)}).valid,false);
 const obstacle=t.addQubit([good.center.x+.09,good.height+.135,good.center.z]);assert(obstacle);
 const blocked=t.logisticsPoseEvaluation(draft,surface);assert.equal(blocked.valid,false);assert.match(blocked.reason,/Colisión/);
 near(drone.body.position.distanceTo(before),0);near(f.cell.mood.energy,energy);assert.equal(t.groups.length,count+1);assert.equal(t.robotGrips.size,0);
 t.cancelLogisticsPoseDraft();assert.equal(t.getLogisticsPoseDraft(),null);
});

function aim(t,point){
 const camera=[point.x,point.y+.85,point.z+.7];
 t.setLook({camera,yaw:0,pitch:Math.atan2(point.y-camera[1],.7)});
}
function key(game,code){game.sandbox.document.dispatchEvent({type:'keydown',code,repeat:false});game.sandbox.document.dispatchEvent({type:'keyup',code});}

for(const remapped of [false,true])test(`cargo teaching accepts ${remapped?'remapped':'classic'} input, pauses physics and persists both poses without moving the drone`,()=>{
 const f=fixture(),{t,sandbox,receiver,drone,payload,grip,route}=f;
 if(remapped){const prefs=Preferences.defaults();Controls.assignBinding(prefs.controls,'keyboard','interact','Enter');Controls.assignBinding(prefs.controls,'keyboard','pause','KeyZ');t.applyPreferences(prefs);}
 let captures=0;t.canvas.requestPointerLock=()=>{captures++;sandbox.document.pointerLockElement=t.canvas;sandbox.document.dispatchEvent({type:'pointerlockchange'});};t.canvas.requestPointerLock();
 const bodies=t.groups.map(g=>[g,g.body.position.clone(),g.body.quaternion.clone()]),energy=f.cell.mood.energy;
 assert(t.beginLogisticsPoseDraft(receiver.id,'pick'));assert(t.simulationSuspended());assert.equal(t.advanceSimulation(.3),0);
 const draft=t.getLogisticsPoseDraft(),box=t.bounds(payload);aim(t,t.V(box.center.x,box.max.y,box.center.z));
 assert(t.updateLogisticsPoseDraft(1,true),draft.reason);
 t.handleWheel({deltaY:-1,preventDefault(){}});near(draft.clearance,.03);assert(draft.preview.valid,draft.reason);
 if(remapped)key(f,'Enter');else{t.canvas.dispatchEvent({type:'mousedown',button:0});const beforeClick=captures;t.canvas.dispatchEvent({type:'click',button:0});assert.equal(captures,beforeClick,'the consumed confirmation click must not recapture the mouse');}
 assert.equal(t.getLogisticsPoseDraft(),null);assert(grip.mood.gripper.logistics.pick);assert.equal(route.points[grip.mood.gripper.logistics.pick.pointIndex].action,'grab');
 assert(t.beginLogisticsPoseDraft(receiver.id,'place'));const destination=t.V(1.2,.575,0);aim(t,destination);
 assert(t.updateLogisticsPoseDraft(1,true),t.getLogisticsPoseDraft().reason);
 if(remapped){const preview=t.getLogisticsPoseDraft().preview;t.handleWheel({deltaY:-1,preventDefault(){}});near(t.getLogisticsPoseDraft().clearance,.055);near(t.getLogisticsPoseDraft().preview.height-preview.height,.02);}
 key(f,'Enter');
 const config=grip.mood.gripper.logistics;assert(config.pick&&config.place);assert.equal(route.points[config.place.pointIndex].action,'drop');assert.equal(route.loop,true);assert.equal(route.points[0].action,'land');
 assert.equal(config.pick.clearanceIndices.length,1);assert.equal(config.place.clearanceIndices.length,2);
 for(const [g,p,q]of bodies){near(g.body.position.distanceTo(p),0);for(const axis of ['x','y','z','w'])near(g.body.quaternion[axis],q[axis]);}
 near(f.cell.mood.energy,energy);assert.equal(t.robotGrips.size,0);
 assert(t.beginLogisticsPoseDraft(receiver.id,'pick'));key(f,'Escape');assert.equal(t.getLogisticsPoseDraft(),null);assert.equal(t.story.mode,'playing');
 assert.deepEqual(JSON.parse(JSON.stringify(grip.mood.gripper.logistics)),JSON.parse(JSON.stringify(config)));
 if(!remapped){
  t.closeTrajectoryPanel(false);assert(f.system.start(receiver.id).ok);let grabbed=false,delivered=false,returned=false;
  for(let i=0;i<120*100;i++){
   t.stepPhysics(1/120);if(t.robotGrips.size)grabbed=true;if(grabbed&&!t.robotGrips.size)delivered=true;
   if(delivered&&f.flight.trip?.phase==='ground'&&f.flight.trip.index===0){returned=true;break;}
   if(!f.system.followers.has(receiver.id))break;
  }
  assert(returned,JSON.stringify({grabbed,delivered,status:f.flight.status,node:f.system.nodes.get(receiver.id).status,trip:f.flight.trip}));assert(payload.body.position.x>1.1);
 }
});

test('the camera can move during a cargo preview while all simulated bodies remain paused',()=>{
 const f=fixture(),{t,sandbox,receiver,drone}=f;
 t.canvas.requestPointerLock=()=>{sandbox.document.pointerLockElement=t.canvas;sandbox.document.dispatchEvent({type:'pointerlockchange'});};t.canvas.requestPointerLock();
 assert(t.beginLogisticsPoseDraft(receiver.id,'pick'));const before=drone.body.position.clone(),energy=f.cell.mood.energy;
 t.setRunning(true);t.frame(1000);const camera=t.getLook().camera;
 sandbox.document.dispatchEvent({type:'keydown',code:'KeyW'});t.frame(1100);t.frame(1200);sandbox.document.dispatchEvent({type:'keyup',code:'KeyW'});
 assert(Math.hypot(...t.getLook().camera.map((n,i)=>n-camera[i]))>.01,'W still moves the observation camera');
 near(drone.body.position.distanceTo(before),0);near(f.cell.mood.energy,energy);assert(t.getLogisticsPoseDraft());t.cancelLogisticsPoseDraft();
});

test('pickup height can be taught above the adjacent tray while the real gripper reach stays unchanged',()=>{
 const f=fixture(),{t,sandbox,receiver,payload,drone,grip}=f;
 t.canvas.requestPointerLock=()=>{sandbox.document.pointerLockElement=t.canvas;sandbox.document.dispatchEvent({type:'pointerlockchange'});};t.canvas.requestPointerLock();
 const before={payload:payload.body.position.clone(),drone:drone.body.position.clone(),energy:f.cell.mood.energy,reach:grip.mood.gripper.reachCm};
 assert(t.beginLogisticsPoseDraft(receiver.id,'pick'));aim(t,t.V(.055,.575,0));t.updateLogisticsPoseDraft(1,true);
 const draft=t.getLogisticsPoseDraft();near(draft.preview.surface.point.y,.575,1e-6);assert.equal(draft.preview.valid,false);
 for(let i=0;i<18;i++)t.handleWheel({deltaY:-1,preventDefault(){}});
 near(draft.clearance,.115);assert(draft.preview.valid,draft.reason);assert.equal(draft.preview.candidate.g,payload);assert(draft.preview.candidate.distance<.05);
 for(let i=0;i<10;i++)t.handleWheel({deltaY:-1,preventDefault(){}});
 assert.equal(draft.preview.valid,false);assert.match(draft.reason,/Alcance|fuera|cm/);assert.equal(grip.mood.gripper.reachCm,before.reach);
 for(let i=0;i<10;i++)t.handleWheel({deltaY:1,preventDefault(){}});
 assert(t.confirmLogisticsPoseDraft(),draft.reason);assert.equal(grip.mood.gripper.logistics.pick.sampleId,payload.parts[0].id);
 near(payload.body.position.distanceTo(before.payload),0);near(drone.body.position.distanceTo(before.drone),0);near(f.cell.mood.energy,before.energy);assert.equal(t.robotGrips.size,0);
});

test('grab action refuses bare receivers and ground routes, preserving existing follower protections',()=>{
 const f=fixture(),{t,system,receiver,route,grip}=f;setCargoRoute(f);
 delete grip.mood.gripper;assert.match(system.start(receiver.id).message,/pinza/);
 grip.mood.gripper=t.copyGripperConfig({capacity:1});
 const fake={...route,mode:'ground'};assert.match(t.startTrajectoryFollower(system.nodes.get(receiver.id),fake).message,/aérea/);
 t.story.scene='campaign';assert.match(t.startTrajectoryFollower(system.nodes.get(receiver.id),route).message,/banco.*galpón/);
});

test('galpón preflight rejects a shortfall before moving, spending or creating an automatic grip',()=>{
 const f=fixture(),{t,receiver,system,flight,cell,drone}=f;setCargoRoute(f);cell.mood.energy=.0001;
 const p=drone.body.position.clone(),charge=cell.mood.energy;
 const result=missionContext(f,()=>system.start(receiver.id));assert.equal(result.ok,false);assert.match(result.message,/Batería insuficiente/);
 assert.equal(flight.enabled,false);assert.equal(system.followers.size,0);assert.equal(t.robotGrips.size,0);near(cell.mood.energy,charge);near(drone.body.position.distanceTo(p),0);
});

test('QR checkpoints resume before and after delivery at the same action index without replay or physical mutations',()=>{
 const f=fixture(),{t,receiver,system,flight,cell,drone,payload}=f;setCargoRoute(f);assert(system.start(receiver.id).ok);
 let heldSnapshot=null;for(let i=0;i<120*60;i++){t.stepPhysics(1/120);if(t.robotGrips.size&&flight.trip?.phase==='travel'){heldSnapshot=missionContext(f,()=>t.galponTrajectoryRuntimeSnapshot());break;}}
 assert(heldSnapshot?.length===1);const before={index:flight.trip.index,phase:flight.trip.phase,position:drone.body.position.clone(),payload:payload.body.position.clone(),energy:cell.mood.energy,grips:t.robotGrips.size};
 system.stop(receiver.id,'checkpoint');assert.equal(flight.trip,null);const restored=missionContext(f,()=>t.restoreGalponTrajectoryRuntime(heldSnapshot));
 assert(restored.ok,restored.warnings.join(';'));assert.equal(flight.trip.index,before.index);assert.equal(flight.trip.phase,before.phase);near(drone.body.position.distanceTo(before.position),0);near(payload.body.position.distanceTo(before.payload),0);near(cell.mood.energy,before.energy);assert.equal(t.robotGrips.size,before.grips);
 let released=0,previous=true,afterDrop=null;for(let i=0;i<120*60;i++){t.stepPhysics(1/120);const attached=t.robotGrips.size>0;if(previous&&!attached){released++;afterDrop=missionContext(f,()=>t.galponTrajectoryRuntimeSnapshot());break;}previous=attached;}
 assert.equal(released,1);assert(afterDrop?.length===1);system.stop(receiver.id,'checkpoint after release');const resumed=missionContext(f,()=>t.restoreGalponTrajectoryRuntime(afterDrop));assert(resumed.ok,resumed.warnings.join(';'));
 assert.equal(t.robotGrips.size,0);let returned=false;for(let i=0;i<120*60;i++){t.stepPhysics(1/120);assert.equal(t.robotGrips.size,0,'return must not grab the delivered cube');if(flight.trip?.phase==='ground'&&flight.trip.index===0){returned=true;break;}if(!system.followers.has(receiver.id))break;}
 assert(returned,system.nodes.get(receiver.id).status);assert(payload.body.position.x>1.1);assert.equal(released,1);
});

test('a newly placed physical obstacle still stops the carrier after the front-gripper envelope correction',()=>{
 const f=fixture(true),{t,system,receiver,flight}=f;setCargoRoute(f);assert(system.start(receiver.id).ok);
 t.storyWall(t.V(.6,.8,0),t.V(.025,.35,.4));
 for(let i=0;i<120*60&&system.followers.has(receiver.id);i++)t.stepPhysics(1/120);
 assert.equal(system.followers.size,0);assert.match(system.nodes.get(receiver.id).status,/bloqueado/);assert(flight.enabled,'stopping leaves a powered physical hover for recovery');
});

// Explicit pose fixture: the same persisted schema produced by the native
// editor above. Only fixture setup rotates bodies; from start onward Cannon,
// the original force limits and the real grip carry the unchanged payload.
function persistedCargoRoute(f,offset={x:0,z:0}){
 const {t,flight,drone,grip,receiver,route,system,start,end,payload}=f,{points}=setCargoRoute(f),state=t.flightSnapshot(flight);
 for(const i of [1,2,3,4,5]){points[i].x+=offset.x;points[i].z+=offset.z;}
 assert(system.edit(receiver.id,points,true).ok);
 const q=drone.body.quaternion,pose=(i,beacon,clearanceIndices)=>({pointIndex:i,position:[points[i].x,drone.body.position.y+points[i].y-state.height,points[i].z],quaternion:[q.x,q.y,q.z,q.w],beaconId:beacon.parts[0].id,beaconPosition:[beacon.body.position.x,beacon.body.position.y,beacon.body.position.z],sampleId:payload.parts[0].id,clearanceIndices});
 grip.mood.gripper.logistics={version:1,receiverId:receiver.id,routeId:route.id,dockReceiverId:start.parts[0].id,pick:pose(1,start,[2]),place:pose(4,end,[3,5])};
}

test('a taught lower face survives accumulated yaw, a loaded checkpoint and its actual pickup/delivery/return',()=>{
 const f=fixture(),{t,drone,payload,flight,grip,receiver,route,system,cell}=f;
 payload.body.quaternion.setFromAxisAngle(t.V(0,1,0),50*Math.PI/180);payload.body.aabbNeedsUpdate=true;payload.body.wakeUp();
 for(let i=0;i<90;i++)t.stepPhysics(1/120);
 persistedCargoRoute(f,{x:.0546,z:.0333});const config=JSON.stringify(grip.mood.gripper.logistics),authored=JSON.stringify(route.points),energy=cell.mood.energy,payloadPosition=payload.body.position.clone();
 const yaw=t.Q();yaw.setFromAxisAngle(t.V(0,1,0),66.917*Math.PI/180);drone.body.quaternion=yaw.mult(drone.body.quaternion);drone.body.aabbNeedsUpdate=true;drone.body.wakeUp();
 const orientation=drone.body.quaternion.clone(),state=t.flightSnapshot(flight),oldPick=route.points[1],oldHit=t.rotorPart(grip.id),oldPose={p:oldHit.p.clone(),q:oldHit.q.clone()};
 oldPose.p=oldPose.p.vadd(t.V(oldPick.x-state.center.x,oldPick.y-state.height,oldPick.z-state.center.z));assert.equal(t.gripperCheck(grip.id,true,{pose:oldPose}).ok,false,'the original fixed chassis target reproduces the yaw miss');
 const path=t.trajectoryToolPath(flight,route,state);assert(path.ok,path.message);assert(t.trajectoryPickupReadiness(system.nodes.get(receiver.id),route,flight,state).ok);
 assert.equal(path.points.length,route.polyline.points.length);for(let i=1;i<path.points.length;i++)assert(['x','y','z'].filter(k=>Math.abs(path.points[i][k]-path.points[i-1][k])>1e-6).length<=1,'translated approach remains cardinal');
 assert.equal(JSON.stringify(route.points),authored);assert.equal(JSON.stringify(grip.mood.gripper.logistics),config);near(cell.mood.energy,energy);near(payload.body.position.distanceTo(payloadPosition),0);for(const k of ['x','y','z','w'])near(drone.body.quaternion[k],orientation[k]);
 assert(system.start(receiver.id).ok);let picked=false,released=false,returned=false,restored=false;
 for(let i=0;i<120*100;i++){
  t.stepPhysics(1/120);if(t.robotGrips.has(grip.id))picked=true;
  if(picked&&!restored&&flight.trip?.phase==='travel'){
   const runtime=missionContext(f,()=>t.galponTrajectoryRuntimeSnapshot()),before={p:drone.body.position.clone(),q:drone.body.quaternion.clone(),load:payload.body.position.clone(),energy:cell.mood.energy,index:flight.trip.index};
   system.stop(receiver.id,'durable yaw check');const result=missionContext(f,()=>t.restoreGalponTrajectoryRuntime(runtime));assert(result.ok,result.warnings.join(';'));assert.equal(flight.trip.index,before.index);near(drone.body.position.distanceTo(before.p),0);near(payload.body.position.distanceTo(before.load),0);near(cell.mood.energy,before.energy);for(const k of ['x','y','z','w'])near(drone.body.quaternion[k],before.q[k]);assert.equal(t.robotGrips.size,1);restored=true;
  }
  if(picked&&!t.robotGrips.has(grip.id))released=true;
  if(released&&flight.trip?.phase==='ground'){returned=true;break;}
  if(!system.followers.has(receiver.id))break;
 }
 assert(picked&&restored&&released&&returned,JSON.stringify({picked,restored,released,returned,status:flight.status,node:system.nodes.get(receiver.id).status,trip:flight.trip}));assert(payload.body.position.x>1.1);assert(cell.mood.energy<energy);assert.equal(JSON.stringify(grip.mood.gripper.logistics),config);assert.equal(JSON.stringify(route.points),authored);
});

test('tool-relative targeting preserves the real front normal and still rejects a physically incompatible yaw',()=>{
 const f=fixture(true),{t,drone,grip,receiver,route,system,flight,cell,payload}=f;persistedCargoRoute(f);
 const q=t.Q();q.setFromAxisAngle(t.V(0,1,0),Math.PI/2);drone.body.quaternion=q.mult(drone.body.quaternion);drone.body.aabbNeedsUpdate=true;
 const before={q:drone.body.quaternion.clone(),p:drone.body.position.clone(),load:payload.body.position.clone(),energy:cell.mood.energy},path=t.trajectoryToolPath(flight,route);assert(path.ok,path.message);
 const result=t.trajectoryPickupReadiness(system.nodes.get(receiver.id),route,flight);assert.equal(result.ok,false);assert.match(result.message,/cara|alcance|objeto|cabe/i);
 near(drone.body.position.distanceTo(before.p),0);near(payload.body.position.distanceTo(before.load),0);near(cell.mood.energy,before.energy);for(const k of ['x','y','z','w'])near(drone.body.quaternion[k],before.q[k]);assert.equal(t.robotGrips.size,0);
});

test('the translated pickup still checks the complete real carrier volume before leaving its pad',()=>{
 const f=fixture(),{t,drone,receiver,route,system,flight,cell,payload}=f;persistedCargoRoute(f);
 const q=t.Q();q.setFromAxisAngle(t.V(0,1,0),1.17);drone.body.quaternion=q.mult(drone.body.quaternion);drone.body.aabbNeedsUpdate=true;
 const state=t.flightSnapshot(flight),path=t.trajectoryToolPath(flight,route,state),point=path.authored[1];assert(path.ok,path.message);assert(t.trajectoryPickupReadiness(system.nodes.get(receiver.id),route,flight,state).ok);
 const shift=t.V(point.x-state.center.x,point.y-state.height,point.z-state.center.z),cellAtPickup=t.rotorPart(cell.id).p.vadd(shift);t.addQubit([cellAtPickup.x,cellAtPickup.y,cellAtPickup.z]);
 const energy=cell.mood.energy,before=drone.body.position.clone(),load=payload.body.position.clone(),result=t.trajectoryPickupReadiness(system.nodes.get(receiver.id),route,flight,state);
 assert.equal(result.ok,false);assert.match(result.message,/dron no cabe/);near(cell.mood.energy,energy);near(drone.body.position.distanceTo(before),0);near(payload.body.position.distanceTo(load),0);assert.equal(t.robotGrips.size,0);
});
