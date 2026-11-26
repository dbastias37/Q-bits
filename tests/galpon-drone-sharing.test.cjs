'use strict';
// Explicit upstream/material fixtures isolate two genuine QR carriers. The
// shared cargo is created once on the cold plate and never repositioned after
// either controller starts. All measured movement uses the production clocks.
const test=require('node:test'),assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const {fixture,near}=require('./galpon-chain-fixture.cjs');

function sharedPickup(options={}){
 const f=fixture(),{t,sandbox,manufacture,build,place}=f,lines=[build('feedA'),build('feedB')],source=f.source(),system=t.getTrajectorySystem(),carriers=[];
 const relay=options.relay||options.triple;
 // The three-carrier scene uses the native receiving belts. A stopped belt
 // can let its released sample roll back onto a floor beacon; that is a real
 // obstruction, independent of admission and durable ground waiting.
 if(options.triple)for(const line of lines){f.cableTo(line.baseId);assert(t.startConveyor(line));}
 function adapt(g,id,role){const hit=t.rotorPart(id),delta=t.hangarTray('former',0).vsub(hit.p);g.body.position.vadd(delta,g.body.position);g.body.aabbNeedsUpdate=true;assert(t.applyWorkshopUpgrade(id,{trajectory:{role,level:1}}));}
 function marker(point,reverse=false){const g=manufacture('cube',t.hangarTray('former',0)),id=g.parts[0].id;adapt(g,id,'beacon');place(g,point);g.body.quaternion.setFromAxisAngle(t.V(0,0,1),Math.PI/2);if(reverse){const turn=t.Q();turn.setFromAxisAngle(t.V(0,1,0),Math.PI);g.body.quaternion.copy(turn.mult(g.body.quaternion));}g.body.aabbNeedsUpdate=true;return g;}
 for(let index=0;index<(options.triple?3:2);index++){
  const previous=new Set(t.groups);build('drone');const drone=t.groups.find(g=>!previous.has(g)&&g.parts.some(p=>p.mood.gripper)&&t.propellerModules([g]).length),receiver=drone.parts.find(p=>p.shape==='cube'&&!p.mood.gripper&&!p.mood.externalBattery),grip=drone.parts.find(p=>p.mood.gripper),cell=drone.parts.find(t.isExternalBattery);adapt(drone,receiver.id,'receiver');assert(t.toggleExternalBattery(cell.id,true));
  const line=lines[options.triple?Math.max(0,index-1):index],home=relay?(index?t.V(options.triple&&index===1?3.82:4.85,.006,.45):t.V(3.60,.006,-.25)):t.V(3.82,.006,index?1.05:.45),flight=t.flightForGroup(drone),state=t.flightSnapshot(flight),shift=t.V(home.x-state.center.x,home.y-state.height,home.z-state.center.z);drone.body.position.vadd(shift,drone.body.position);drone.body.aabbNeedsUpdate=true;
  const entry=t.conveyorPortWorld(line,'entry'),landing=relay&&!index?t.V(4.04,.575,.45):entry.p.vadd(entry.direction.scale(.08)),start=marker(t.V(home.x,.047,home.z-.35)),end=relay&&!index?marker(t.V(4.48,.047,.10)):marker(t.V(landing.x+(options.triple&&index===1?.04:.10),.047,landing.z+.36),true);
  const made=system.createStart(start.parts[0].id);assert(made.ok);assert(system.pair(made.routeId,end.parts[0].id).ok);assert(system.assign(receiver.id,made.routeId).ok);
  const from={kind:'reservoir',id:source.id},to={kind:'part',id:start.parts[0].id},a=t.powerPort(from),b=t.powerPort(to),materials=Array.from({length:8},()=>manufacture()).flatMap(g=>t.worldParts(g));
  const wired=t.connectPowerCable(from,to,[t.V(a.x,1.2,a.z),t.V(b.x,1.2,a.z),t.V(b.x,1.2,b.z)],materials);assert(wired.ok,wired.error);
  carriers.push({drone,receiver,grip,cell,flight,start,end,landing,line});
 }
 const payload=manufacture('cube',relay?t.V(3.08,.624,-.25):t.V(4.04,.624,.45));let second=relay?null:options.separate?manufacture('cube',t.V(4.30,.624,.70)):payload;
 for(let i=0;i<120*32;i++)t.stepSimulation(1/120);
 t.canvas.requestPointerLock=()=>{sandbox.document.pointerLockElement=t.canvas;sandbox.document.dispatchEvent({type:'pointerlockchange'});};
 const aim=point=>t.setLook({camera:[point.x,point.y+.85,point.z+.7],yaw:0,pitch:Math.atan2(-.85,.7)});
 for(const [index,carrier]of carriers.entries()){
  if(relay&&index&&!second){second=manufacture('cube',t.V(4.04,.624,.45));for(let step=0;step<240;step++)t.stepSimulation(1/120);}
  carrier.payload=index?second:payload;assert(carrier.cell.mood.energy>.9,carrier.flight.chargeStatus);const box=t.bounds(carrier.payload);
  assert(t.beginLogisticsPoseDraft(carrier.receiver.id,'pick'));aim(t.V(box.center.x,box.max.y,box.center.z));assert(t.updateLogisticsPoseDraft(1,true),t.getLogisticsPoseDraft().reason);assert(t.confirmLogisticsPoseDraft(),sandbox.document.querySelector('#notice').textContent);
  assert(t.beginLogisticsPoseDraft(carrier.receiver.id,'place'));aim(carrier.landing);assert(t.updateLogisticsPoseDraft(1,true),t.getLogisticsPoseDraft().reason);assert(t.confirmLogisticsPoseDraft(),sandbox.document.querySelector('#notice').textContent+' '+JSON.stringify({id:carrier.receiver.id,landing:carrier.landing,points:system.routeFor(carrier.receiver.id).points}));
  t.closeTrajectoryPanel(false);t.resumeGame();t.hideStoryDialogue();carrier.route=system.routeFor(carrier.receiver.id);system.refresh(carrier.route);assert(carrier.route.valid,carrier.route.reason);
 }
 const until=(condition,seconds=60)=>{for(let i=0;i<120*seconds;i++){t.stepSimulation(1/120);if(condition())return (i+1)/120;}assert.fail(JSON.stringify(carriers.map(c=>({id:c.receiver.id,status:c.flight.status,node:system.nodes.get(c.receiver.id).status,trip:c.flight.trip,position:c.drone.body.position}))));};
 return {...f,carriers,system,payload,until};
}

test('two QR carriers retain one shared pickup across a durable departure checkpoint',context=>{
 const f=sharedPickup(),{t,carriers,system,payload,until}=f;
 for(const c of carriers)assert(system.start(c.receiver.id).ok);
 let departedTogether=false;for(let i=0;i<120*2;i++){t.stepSimulation(1/120);if(carriers.every(c=>c.flight.trip?.phase!=='ground'))departedTogether=true;}
 assert.equal(departedTogether,false,'one physical cargo must not dispatch both carriers');
 const active=carriers.find(c=>c.flight.trip?.phase!=='ground'),waiting=carriers.find(c=>c!==active);assert(active&&waiting);
 assert.equal(waiting.flight.power.rpm,0);assert.equal(waiting.flight.power.inputWatts,0);assert(t.galponComponentSupported(waiting.flight.component));
 const before={active:active.drone.body.position.clone(),waiting:waiting.drone.body.position.clone(),payload:payload.body.position.clone(),energy:waiting.cell.mood.energy,reserve:f.s.energyJ};
 const saved=t.saveCurrentGame();assert(saved.ok,saved.error);assert.equal(saved.save.data.trajectoryRuntime.length,2);assert.equal(saved.save.data.machineGrips.length,0);
 const fresh=createGame({graphics:false,storage:f.storage}),r=fresh.t;r.story.ready=true;assert(r.continueHangarGame(),r.saveSession.message);assert.deepEqual([...r.saveSession.restoreWarnings],[]);
 const rs=r.getTrajectorySystem(),first=r.flightForGroup(r.rotorPart(active.receiver.id).g),parked=r.flightForGroup(r.rotorPart(waiting.receiver.id).g),load=r.rotorPart(payload.parts[0].id).g;
 assert.equal(rs.followers.size,2);assert.equal(parked.trip.phase,'ground');assert.notEqual(first.trip.phase,'ground');
 near(first.component[0].body.position.distanceTo(before.active),0);near(parked.component[0].body.position.distanceTo(before.waiting),0);near(load.body.position.distanceTo(before.payload),0);near(r.story.galpon.energyJ,before.reserve);near(r.rotorPart(waiting.cell.id).part.mood.energy,before.energy);
 r.resumeGame();r.hideStoryDialogue();let grabbed=false,returned=false,seconds=0;
 for(let i=0;i<120*70;i++){
  r.stepSimulation(1/120);seconds=(i+1)/120;grabbed||=r.robotGrips.get(active.grip.id)?.g===load;
  assert.equal(parked.trip?.phase,'ground');assert.equal(parked.power.rpm,0);assert.equal(parked.power.inputWatts,0);assert.equal(r.robotGrips.has(waiting.grip.id),false);assert(rs.followers.has(waiting.receiver.id));
  if(grabbed&&!r.robotGrips.has(active.grip.id)&&first.trip?.phase==='ground'&&r.galponComponentSupported(first.component)){returned=true;break;}
 }
 assert(grabbed&&returned,first.status);near(r.rotorPart(waiting.cell.id).part.mood.energy,before.energy);assert.doesNotThrow(()=>f.G.validate(r.story.galpon));
 context.diagnostic(JSON.stringify({first:active.receiver.id,waiting:waiting.receiver.id,secondsAfterCheckpoint:seconds}));
});

test('stopping the approaching follower releases the shared pickup for the waiting drone',()=>{
 const f=sharedPickup(),{t,carriers,system,payload,until}=f;for(const c of carriers)assert(system.start(c.receiver.id).ok);
 until(()=>carriers.some(c=>c.flight.trip.index>0),4);
 const active=carriers.find(c=>c.flight.trip.index>0),waiting=carriers.find(c=>c!==active);assert.equal(waiting.flight.trip.phase,'ground');
 assert(system.stop(active.receiver.id,'Manual route stop'));assert.equal(active.flight.trip,null);
 until(()=>waiting.flight.trip?.phase!=='ground',3);until(()=>t.robotGrips.get(waiting.grip.id)?.g===payload,30);assert(system.followers.has(waiting.receiver.id));
});

test('an occupied first destination leaves the shared cold pickup available to the other feed',()=>{
 const f=sharedPickup(),{t,carriers:[a,b],system,payload,until}=f;
 f.manufacture('cube',t.V(a.landing.x,a.landing.y+.05,a.landing.z));for(let i=0;i<120*2;i++)t.stepSimulation(1/120);
 assert(system.start(a.receiver.id).ok);assert(system.start(b.receiver.id).ok);
 until(()=>b.flight.trip?.phase!=='ground',4);assert.equal(a.flight.trip.phase,'ground');assert.match(a.flight.logisticsWaitReason,/Esperando espacio en destino/);
 until(()=>t.robotGrips.get(b.grip.id)?.g===payload,30);assert.equal(a.flight.trip.phase,'ground');assert.equal(t.robotGrips.has(a.grip.id),false);
});

test('independent cold pickup poses do not acquire a global fleet lock',()=>{
 const f=sharedPickup({separate:true}),{t,carriers,system}=f;
 for(const c of carriers)assert(system.start(c.receiver.id).ok);
 for(let i=0;i<120*2;i++)t.stepSimulation(1/120);
 assert(carriers.every(c=>c.flight.trip?.phase!=='ground'));assert.notEqual(carriers[0].payload,carriers[1].payload);
});

test('an incoming delivery waits for the outgoing carrier to return through their shared cold shaft, including reload',context=>{
 const f=sharedPickup({relay:true}),{t,carriers:[incoming,outgoing],system,until}=f;
 const table=incoming.payload,cold=outgoing.payload;
 assert(system.start(outgoing.receiver.id).ok);
 until(()=>t.robotGrips.get(outgoing.grip.id)?.g===cold,25);
 until(()=>Math.hypot(cold.body.position.x-4.04,cold.body.position.z-.45)>.55,12);
 assert(system.start(incoming.receiver.id).ok);
 until(()=>incoming.flight.trip?.phase==='ground',8);
 until(()=>outgoing.flight.trip?.trajectory.direction===-1,35);
 assert.equal(incoming.flight.trip.phase,'ground');assert.match(incoming.flight.logisticsWaitReason,/puesto compartido/);
 assert.equal(incoming.flight.power.rpm,0);assert.equal(incoming.flight.power.inputWatts,0);assert.equal(t.robotGrips.has(incoming.grip.id),false);
 const before={table:table.body.position.clone(),incoming:incoming.drone.body.position.clone(),outgoing:outgoing.drone.body.position.clone(),reserve:f.s.energyJ};
 const saved=t.saveCurrentGame();assert(saved.ok,saved.error);assert.equal(saved.save.data.trajectoryRuntime.length,2);
 const fresh=createGame({graphics:false,storage:f.storage}),r=fresh.t;r.story.ready=true;assert(r.continueHangarGame(),r.saveSession.message);assert.deepEqual([...r.saveSession.restoreWarnings],[]);
 const rs=r.getTrajectorySystem(),a=r.flightForGroup(r.rotorPart(incoming.receiver.id).g),b=r.flightForGroup(r.rotorPart(outgoing.receiver.id).g),load=r.rotorPart(table.parts[0].id).g;
 near(load.body.position.distanceTo(before.table),0);near(a.component[0].body.position.distanceTo(before.incoming),0);near(b.component[0].body.position.distanceTo(before.outgoing),0);near(r.story.galpon.energyJ,before.reserve);
 r.resumeGame();r.hideStoryDialogue();let outgoingHome=false,grabbed=false,released=false,complete=false,waitSeconds=0;
 for(let step=0;step<120*90;step++){
  r.stepSimulation(1/120);assert(rs.followers.has(incoming.receiver.id),a.status);assert(rs.followers.has(outgoing.receiver.id),b.status);
  outgoingHome||=b.trip?.phase==='ground'&&r.galponComponentSupported(b.component);
  if(!outgoingHome){waitSeconds+=1/120;assert.equal(a.trip.phase,'ground');assert.equal(a.power.rpm,0);assert.equal(a.power.inputWatts,0);}
  grabbed||=r.robotGrips.get(incoming.grip.id)?.g===load;released||=grabbed&&!r.robotGrips.has(incoming.grip.id);
  if(released&&a.trip?.phase==='ground'&&r.galponComponentSupported(a.component)){complete=true;break;}
 }
 assert(outgoingHome&&grabbed&&released&&complete,a.status);assert.equal(r.hangarChainZone(load),'second-cooler');assert.doesNotThrow(()=>f.G.validate(r.story.galpon));
 context.diagnostic(JSON.stringify({waitingForReturnAfterReload:waitSeconds,incoming:incoming.receiver.id,outgoing:outgoing.receiver.id}));
});

test('three sleeping carriers start and reload in their real ground wait before sharing one cold station',context=>{
 const f=sharedPickup({triple:true}),{t,carriers,system}=f;
 for(const c of carriers){assert(t.galponComponentSupported(c.flight.component));c.drone.body.sleep();}
 t.world.step(1/120); // Cannon may now omit contacts for the sleeping bodies.
 const positions=carriers.map(c=>c.drone.body.position.clone()),energy=carriers.map(c=>c.cell.mood.energy),reserve=f.s.energyJ;
 for(const c of carriers){assert(system.start(c.receiver.id).ok);assert.equal(c.flight.trip.phase,'ground');assert.equal(c.flight.spool,0);}
 const saved=t.saveCurrentGame();assert(saved.ok,saved.error);assert.equal(saved.save.data.trajectoryRuntime.length,3);
 assert(saved.save.data.trajectoryRuntime.every(record=>record.trip.phase==='ground'));
 const fresh=createGame({graphics:false,storage:f.storage}),r=fresh.t;r.story.ready=true;assert(r.continueHangarGame());assert.deepEqual([...r.saveSession.restoreWarnings],[]);
 const rs=r.getTrajectorySystem(),restored=carriers.map((c,i)=>{
  const flight=r.flightForGroup(r.rotorPart(c.receiver.id).g);assert.equal(flight.trip.phase,'ground');near(flight.component[0].body.position.distanceTo(positions[i]),0);near(r.rotorPart(c.cell.id).part.mood.energy,energy[i]);return {...c,flight};
 });near(r.story.galpon.energyJ,reserve);r.resumeGame();r.hideStoryDialogue();
 let oldColdTaken=false,newTableTaken=false,newTableReleased=false,departures=0,previous=null;
 for(let step=0;step<60*105;step++){
  const groundedBefore=new Set(restored.filter(c=>c.flight.trip?.phase==='ground').map(c=>c.receiver.id));
  r.stepSimulation(1/60);const air=restored.filter(c=>c.flight.trip?.phase!=='ground');assert(air.length<=1,'a shared station must not dispatch two supported carriers');
  for(const c of restored){
   assert(rs.followers.has(c.receiver.id),JSON.stringify({seconds:(step+1)/60,id:c.receiver.id,status:c.flight.status,node:rs.nodes.get(c.receiver.id)?.status,position:c.flight.component[0].body.position,trip:c.flight.trip}));
   // The touchdown substep still reports the final descent power sample.
   // Once the ground wait has begun, every following sample must be zero.
   if(c.flight.trip.phase==='ground'&&groundedBefore.has(c.receiver.id)){assert.equal(c.flight.power.rpm,0);assert.equal(c.flight.power.inputWatts,0);}
  }
  const active=air[0]?.receiver.id??null;if(active!==null&&active!==previous)departures++;previous=active;
  oldColdTaken||=restored.slice(1).some(c=>r.robotGrips.get(c.grip.id)?.g?.parts[0]?.id===carriers[1].payload.parts[0].id);
  newTableTaken||=r.robotGrips.get(restored[0].grip.id)?.g?.parts[0]?.id===carriers[0].payload.parts[0].id;
  newTableReleased||=newTableTaken&&!r.robotGrips.has(restored[0].grip.id);
  if(newTableReleased&&restored[0].flight.trip.phase==='ground'&&groundedBefore.has(restored[0].receiver.id))break;
 }
 assert(oldColdTaken&&newTableTaken&&newTableReleased);assert(departures>=2);assert.doesNotThrow(()=>f.G.validate(r.story.galpon));context.diagnostic(JSON.stringify({departures,receivers:carriers.map(c=>c.receiver.id)}));
});

function deliveryArm(f){
 const {t,sandbox}=f,arm=f.build('arm'),hit=t.rotorPart(arm.gripperId),pickup=t.robotKinematics(arm).point.clone();
 const from={kind:'reservoir',id:f.source().id},to={kind:'part',id:arm.baseId},a=t.powerPort(from),b=t.powerPort(to),materials=Array.from({length:8},()=>f.manufacture()).flatMap(g=>t.worldParts(g));
 const cable=t.connectPowerCable(from,to,[t.V(a.x,1.2,a.z),t.V(b.x,1.2,a.z),t.V(b.x,1.2,b.z)],materials);assert(cable.ok,cable.error);t.setSelected({g:hit.g,part:hit.part});
 const until=(condition,seconds=30)=>{for(let step=0;step<60*seconds;step++){t.stepSimulation(1/60);if(condition())return;}assert.fail(arm.status);};
 function teach(name,point,heightCm){
  sandbox.document.pointerLockElement=t.canvas;assert(t.robotPanelAction('pose',{pose:name,heightCm}).ok);
  const distance=name==='place'?.05:.7;t.setLook({camera:[point.x,point.y+.85,point.z+distance],yaw:0,pitch:Math.atan2(-.85,distance)});
  t.updateRobotPoseDraft(1,true);const draft=t.getRobotPoseDraft();assert(draft.solution?.pose,JSON.stringify({name,reason:draft.reason,point:draft.point,target:draft.target,base:draft.model.chain[0].pivot,reach:draft.model.reach,tool:draft.model.point}));
  t.canvas.dispatchEvent({type:'mousedown',button:0});assert.equal(t.getRobotPoseDraft(),null);t.resumeGame();t.hideStoryDialogue();
 }
 // B already has the one QR sample. Its visible top is 9 cm above the tray,
 // so the same 25 cm tool height is taught with 16 cm over that real face.
 teach('pick',t.V(pickup.x,.575,pickup.z),12.5);teach('place',t.hangarChainLayout().table,16);
 for(let joint=0;joint<4;joint++)assert(t.robotPanelAction('motor',{joint,rpm:12,maxTorque:[2,4,3,2][joint],capacity:64}).ok);
 assert(t.robotPanelAction('goto',{pose:'pick'}).ok);until(()=>!arm.jogging);
 const payload=f.manufacture('cube',t.V(pickup.x,.625,pickup.z));assert(f.C.reintroduce(f.s,payload.parts.map(p=>p.id)));
 return {arm,payload,until};
}

test('a delivery arm and QR pickup retain their local station until HOME or touchdown, including reload',context=>{
 const f=sharedPickup({relay:true}),{t,system,carriers:[incoming,outgoing]}=f,{arm,payload,until}=deliveryArm(f);
 // The outgoing cold pickup is a different station: it may leave while the
 // table arm moves HOME. The upstream table pickup must wait for both owners.
 assert(system.start(outgoing.receiver.id).ok);until(()=>outgoing.flight.trip.phase!=='ground',4);
 assert(t.startRobotArm(arm));assert.notEqual(arm.state,'wait','a cold pickup must not globally lock the table arm');
 assert(system.start(incoming.receiver.id).ok);let waitedForHome=false,armDepartedDuringFlight=false;
 until(()=>{
  if(arm.state!=='wait'){waitedForHome=true;assert.equal(incoming.flight.trip.phase,'ground');}
  return incoming.flight.trip.phase!=='ground';
 },65);
 assert(waitedForHome);assert.equal(arm.state,'wait');
 until(()=>{
  armDepartedDuringFlight||=arm.state!=='wait';assert(t.robotArmRotors(arm).every(r=>!r.enabled));
  return incoming.flight.trip.trajectory.direction===-1;
 },35);
 assert.equal(armDepartedDuringFlight,false);assert.match(arm.status,/Puesto B en uso por un dron/);
 assert.equal(t.robotGrips.has(arm.gripperId),false,'the next input must remain physically available at A');
 const before={seconds:f.s.elapsed,reserve:f.s.energyJ,position:payload.body.position.clone(),cycles:arm.cycles};
 const saved=t.saveCurrentGame();assert(saved.ok,saved.error);
 const fresh=createGame({graphics:false,storage:f.storage}),r=fresh.t;r.story.ready=true;assert(r.continueHangarGame());assert.deepEqual([...r.saveSession.restoreWarnings],[]);r.resumeGame();r.hideStoryDialogue();
 const restored=r.robotArms.find(a=>a.gripperId===arm.gripperId),flight=r.flightForGroup(r.rotorPart(incoming.receiver.id).g),rs=r.getTrajectorySystem();
 near(r.story.galpon.energyJ,before.reserve);near(r.rotorPart(payload.parts[0].id).g.body.position.distanceTo(before.position),0);
 let home=false,delivered=false,waitSeconds=0;
 for(let step=0;step<60*65;step++){
  r.stepSimulation(1/60);assert(rs.followers.has(incoming.receiver.id),flight.status);
  if(!home&&flight.trip.phase!=='ground'){
   waitSeconds+=1/60;assert.equal(restored.state,'wait');assert(r.robotArmRotors(restored).every(j=>!j.enabled));assert.equal(r.robotGrips.has(restored.gripperId),false);
  }
  home||=flight.trip.phase==='ground'&&r.galponComponentSupported(flight.component);
  delivered||=restored.cycles>before.cycles;
  // Once B is filled again, the drone waits through the arm's empty return.
  if(delivered&&restored.state==='home')assert.equal(flight.trip.phase,'ground');
  if(delivered&&restored.state==='wait')break;
 }
 assert(home&&delivered,restored.status);assert.equal(r.hangarChainZone(r.rotorPart(payload.parts[0].id).g),'table');assert.doesNotThrow(()=>f.G.validate(r.story.galpon));
 context.diagnostic(JSON.stringify({arm:arm.gripperId,drone:incoming.receiver.id,waitingAfterReload:waitSeconds,seconds:r.story.galpon.elapsed,durationSeconds:r.story.galpon.elapsed-before.seconds}));
});

for(const returning of [false,true])test('a real propeller obstruction interrupts a productive '+(returning?'empty return':'loaded flight')+' once, without treating ground waits as faults',()=>{
 const f=sharedPickup(),{t,sandbox,system,carriers:[active,waiting],payload,until}=f;
 assert(f.C.reintroduce(f.s,payload.parts.map(p=>p.id)));
 const events=[],C=sandbox.QBitsGalponChain;
 sandbox.QBitsGalponChain=Object.freeze({...C,interrupt:(s,reason)=>{
  const before={clock:s.chain.clock,energyJ:s.energyJ,records:JSON.stringify(s.records)},result=C.interrupt(s,reason);
  assert.equal(s.chain.clock,before.clock);assert.equal(s.energyJ,before.energyJ);assert.equal(JSON.stringify(s.records),before.records);
  events.push(reason);return result;
 }});
 assert(system.start(active.receiver.id).ok);assert(system.start(waiting.receiver.id).ok);
 until(()=>t.robotGrips.get(active.grip.id)?.g===payload,30);
 assert.equal(waiting.flight.trip.phase,'ground');assert.equal(events.length,0);
 assert(system.stop(waiting.receiver.id,'Normal ground pause'));assert.equal(events.length,0);
 if(returning)until(()=>active.flight.trip.trajectory.direction<0&&!t.robotGrips.has(active.grip.id),30);
 const hub=t.rotorPart(active.flight.modules[0].hub.id),tip=t.couplerTip(hub).point;
 // Explicit physical obstacle fixture. The ordinary swept rotor volume must
 // detect it and invoke its existing stop; no mocked status or fault event.
 f.manufacture('cube',tip.clone());t.stepSimulation(1/120);
 assert.equal(active.flight.enabled,false);assert.match(active.flight.status,/Hélice obstruida/);assert.deepEqual(events,['blocked']);
 for(let step=0;step<60;step++)t.stepSimulation(1/120);
 assert.deepEqual(events,['blocked'],'the retired controller must not poison later continuity');assert.doesNotThrow(()=>f.G.validate(f.s));
});

module.exports={sharedPickup};
