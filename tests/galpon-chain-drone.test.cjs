'use strict';
// The initial twelve receipts and staging before/after a flight are explicit
// fixtures. Every drone part, blade and cable is paid from the real ledger;
// each measured pickup, flight, drop and return uses the actual Cannon bodies.
const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const {fixture,plain,near}=require('./galpon-chain-fixture.cjs');

function missionDrone(options={}){
 const f=fixture(),{t,G,C,s,w,manufacture,build,place}=f,feedBelt=options.feed?build(options.feed):null,drone=build('drone');
 const receiver=drone.parts.find(p=>p.shape==='cube'&&!p.mood.gripper&&!p.mood.externalBattery),grip=drone.parts.find(p=>p.mood.gripper),cell=drone.parts.find(t.isExternalBattery);
 assert(receiver&&grip&&cell);cell.mood.externalBattery.enabled=true;
 function adapt(g,id,role){
  const hit=t.rotorPart(id),target=t.hangarTray('former',0),shift=target.vsub(hit.p),before=hit.part.mood.energy;
  g.body.position.vadd(shift,g.body.position);g.body.aabbNeedsUpdate=true;
  assert(t.applyWorkshopUpgrade(id,{trajectory:{role,level:1}}),'valid paid cube must adapt at the former');
  near(t.rotorPart(id).part.mood.energy,before);assert.equal(G.record(s,id).origin,hit.part.mood.matter.root);
 }
 adapt(drone,receiver.id,'receiver');
 function marker(x,y,z){
  const g=manufacture('cube',t.hangarTray('former',0)),id=g.parts[0].id;adapt(g,id,'beacon');
  place(g,t.V(x,y,z));g.body.quaternion.setFromAxisAngle(t.V(0,0,1),Math.PI/2);g.body.aabbNeedsUpdate=true;return g;
 }
 const start=marker(3.60,.047,-.60),end=marker(4.68,.047,.35),system=t.getTrajectorySystem(),created=system.createStart(start.parts[0].id);assert(created.ok);
 assert(system.pair(created.routeId,end.parts[0].id).ok);assert(system.assign(receiver.id,created.routeId).ok);
 const flight=t.flightForGroup(drone),state=t.flightSnapshot(flight),shift=t.V(3.60-state.center.x,.006-state.height,-.25-state.center.z);
 drone.body.position.vadd(shift,drone.body.position);drone.body.velocity.set(0,0,0);drone.body.angularVelocity.set(0,0,0);drone.body.aabbNeedsUpdate=true;
 const source=f.source(),from={kind:'reservoir',id:source.id},to={kind:'part',id:start.parts[0].id},a=t.powerPort(from),b=t.powerPort(to),materials=Array.from({length:8},()=>manufacture()).flatMap(g=>t.worldParts(g));
 const cable=t.connectPowerCable(from,to,[t.V(a.x,1.2,a.z),t.V(b.x,1.2,a.z),t.V(b.x,1.2,b.z)],materials);assert(cable.ok,cable.error);
 // Source queue staging is outside the measured automatic transfer.
 function feed(g){place(g,t.V(3.27,.624,-.35));assert(C.reintroduce(s,g.parts.map(p=>p.id)));}
 const payload=f.credited.find(g=>t.groups.includes(g)&&g.parts.length===1&&!g.parts[0].mood.gripper&&!g.parts[0].mood.externalBattery)||manufacture();feed(payload);
 for(let i=0;i<120*30;i++)t.stepSimulation(1/120);
 const route=system.routeFor(receiver.id);system.refresh(route);assert(route.valid,route.reason);
 assert(cell.mood.energy>.8,JSON.stringify({energy:cell.mood.energy,status:flight.chargeStatus,drone:drone.body.position,start:start.body.position,source:source.enabled,cable:{active:cable.cable.active,status:cable.cable.status,length:cable.cable.length},supply:t.getCableSupply(start).length,support:t.galponComponentSupported([start])}));
 function aim(point){const camera=[point.x,point.y+.85,point.z+.7];t.setLook({camera,yaw:0,pitch:Math.atan2(point.y-camera[1],.7)});}
 t.canvas.requestPointerLock=()=>{f.sandbox.document.pointerLockElement=t.canvas;f.sandbox.document.dispatchEvent({type:'pointerlockchange'});};
 const before=t.bounds(payload);assert(t.beginLogisticsPoseDraft(receiver.id,'pick'));aim(t.V(before.center.x,before.max.y,before.center.z));assert(t.updateLogisticsPoseDraft(1,true),t.getLogisticsPoseDraft().reason);assert(t.confirmLogisticsPoseDraft());
 assert(t.beginLogisticsPoseDraft(receiver.id,'place'));aim(options.coldPoint?t.V(...options.coldPoint):t.hangarChainLayout().cold);assert(t.updateLogisticsPoseDraft(1,true),t.getLogisticsPoseDraft().reason);assert(t.confirmLogisticsPoseDraft(),f.sandbox.document.querySelector('#notice').textContent);t.closeTrajectoryPanel(false);t.resumeGame();t.hideStoryDialogue();
 assert(t.trajectoryEnergyEstimate(flight,route).ok,t.trajectoryEnergyEstimate(flight,route).message);
 function until(condition,seconds=90){
  for(let i=0;i<120*seconds;i++){t.stepSimulation(1/120);if(condition())return (i+1)/120;}
  assert.fail(JSON.stringify({flight:flight.status,node:system.nodes.get(receiver.id).status,trip:flight.trip,drone:drone.body.position,payload:payload.body.position,chain:C.status(s),grips:t.robotGrips.size,waiting:w.pending,returning:w.returning}));
 }
 return {...f,drone,receiver,grip,cell,start,end,flight,system,route,payload,feed,until,aim,feedBelt};
}

test('a paid QR drone saves during carry and after release, then resumes the same delivery from durable bytes',context=>{
 const f=missionDrone(),{t,s,G,C,system,receiver,flight,drone,grip,cell,payload,until,storage}=f;
 const initialCharge=cell.mood.energy*t.externalBatteryCapacity(cell);assert(system.start(receiver.id).ok);
 const beforeSaveSeconds=until(()=>t.robotGrips.has(grip.id)&&flight.trip?.phase==='travel');
 const before={index:flight.trip.index,phase:flight.trip.phase,position:drone.body.position.clone(),payload:payload.body.position.clone(),energy:cell.mood.energy,reserve:s.energyJ,ids:t.groups.flatMap(g=>g.parts.map(p=>p.id)).sort((a,b)=>a-b)};
 const saved=t.saveCurrentGame();assert(saved.ok,saved.error);assert.equal(saved.save.data.trajectoryRuntime.length,1);assert.equal(saved.save.data.machineGrips.length,1);
 const fresh=createGame({graphics:false,storage});let r=fresh.t;r.story.ready=true;assert(r.continueHangarGame(),r.saveSession.message);
 assert.deepEqual([...r.saveSession.restoreWarnings],[]);let restored=r.flightForGroup(r.rotorPart(receiver.id).g),rs=r.getTrajectorySystem(),load=r.rotorPart(payload.parts[0].id).g;
 assert(rs.followers.has(receiver.id),rs.nodes.get(receiver.id).status);assert.equal(restored.trip.index,before.index);assert.equal(restored.trip.phase,before.phase);
 assert.equal(r.robotGrips.size,1);assert.equal(r.robotGrips.get(grip.id).g,load);assert(r.world.constraints.includes(r.robotGrips.get(grip.id).constraint));
 near(r.rotorPart(cell.id).part.mood.energy,before.energy);near(r.story.galpon.energyJ,before.reserve);near(restored.component[0].body.position.distanceTo(before.position),0);near(load.body.position.distanceTo(before.payload),0);
 assert.deepEqual(plain(r.groups.flatMap(g=>g.parts.map(p=>p.id)).sort((a,b)=>a-b)),plain(before.ids));
 r.resumeGame();r.hideStoryDialogue();let elapsed=0;
 for(let i=0;i<120*60&&r.robotGrips.size;i++){r.stepSimulation(1/120);elapsed+=1/120;}
 assert.equal(r.robotGrips.size,0);assert(restored.trip?.trajectory,'release must occur in the active QR program');
 const dropped={index:restored.trip.index,phase:restored.trip.phase,position:load.body.position.clone(),energy:r.rotorPart(cell.id).part.mood.energy,reserve:r.story.galpon.energyJ};
 const secondSave=r.saveCurrentGame();assert(secondSave.ok,secondSave.error);assert.equal(secondSave.save.data.machineGrips.length,0);assert.equal(secondSave.save.data.trajectoryRuntime.length,1);
 const second=createGame({graphics:false,storage});r=second.t;r.story.ready=true;assert(r.continueHangarGame(),r.saveSession.message);assert.deepEqual([...r.saveSession.restoreWarnings],[]);
 restored=r.flightForGroup(r.rotorPart(receiver.id).g);rs=r.getTrajectorySystem();load=r.rotorPart(payload.parts[0].id).g;
 assert(rs.followers.has(receiver.id),rs.nodes.get(receiver.id).status);assert.equal(restored.trip.index,dropped.index);assert.equal(restored.trip.phase,dropped.phase);assert.equal(r.robotGrips.size,0);
 near(load.body.position.distanceTo(dropped.position),0);near(r.rotorPart(cell.id).part.mood.energy,dropped.energy);near(r.story.galpon.energyJ,dropped.reserve);
 r.resumeGame();r.hideStoryDialogue();
 for(let i=0;i<120*90;i++){r.stepSimulation(1/120);elapsed+=1/120;assert.equal(r.robotGrips.size,0,'a post-release checkpoint must never replay the pickup');if(C.status(r.story.galpon).droneDelivered===1)break;}
 const world=r.getHangarChainWorld(),nearby=r.world.bodies.filter(b=>Math.hypot(b.position.x-load.body.position.x,b.position.z-load.body.position.z)<1).map(b=>({id:b.id,type:b.type,p:plain(b.position),shapes:b.shapes.map(shape=>({type:shape.type,half:shape.halfExtents&&plain(shape.halfExtents)})),parts:b.qubitGroup?.parts.map(p=>p.id)}));
 assert.equal(C.status(r.story.galpon).droneDelivered,1,JSON.stringify({status:restored.status,node:rs.nodes.get(receiver.id).status,trip:restored.trip,load:load.body.position,pending:world.pending,carried:world.carried,returning:world.returning,nearby}));
 assert.equal(r.hangarChainZone(load),'second-cooler');assert.equal(r.robotGrips.size,0);assert.equal(C.status(s).droneDelivered,0);
 assert.equal(r.story.galpon.chain.traces[load.parts[0].mood.matter.root].drone,true);assert.doesNotThrow(()=>G.validate(r.story.galpon));
 context.diagnostic(JSON.stringify({beforeSaveSeconds,afterLoadSeconds:elapsed,spentBatteryJ:initialCharge-r.rotorPart(cell.id).part.mood.energy*r.externalBatteryCapacity(r.rotorPart(cell.id).part)}));
});

test('the production drone completes three physical pickups, cold-table deliveries and landed returns with the same matter',context=>{
 const f=missionDrone(),{t,s,G,C,system,receiver,flight,cell,payload,until,feed,place}=f;
 const queue=[payload,...f.credited.filter(g=>g!==payload&&t.groups.includes(g)&&g.parts.length===1&&!g.parts[0].mood.gripper&&!g.parts[0].mood.externalBattery).slice(0,2)];assert.equal(queue.length,3);
 const identities=t.groups.flatMap(g=>g.parts.map(p=>p.id)).sort((a,b)=>a-b),source=s.energyJ,charge=cell.mood.energy*t.externalBatteryCapacity(cell),spent={...s.spent},seconds=[];
 assert(system.start(receiver.id).ok);
 for(let n=0;n<3;n++){
  if(n)feed(queue[n]);
  seconds.push(until(()=>C.status(s).droneDelivered===n+1&&flight.trip?.phase==='ground'&&flight.trip.index===0&&t.galponComponentSupported(flight.component)));
  assert.equal(t.hangarChainZone(queue[n]),'second-cooler');assert.equal(t.robotGrips.size,0);assert(t.galponComponentSupported(flight.component));
  assert(s.chain.stabilized.includes(queue[n].parts[0].mood.matter.root));
  // Explicit output queue clearing only after the completed physical cycle.
  if(n<2)place(queue[n],t.V(4.10+n*.20,.624,.90));
 }
 assert.equal(C.status(s).droneDelivered,3);assert.equal(C.status(s).stabilized,3);assert.equal(new Set(s.chain.drone.delivered).size,3);
 assert.equal(C.status(s).reserveReturn,true);assert(C.status(s).returnReservePercent>=20,'the optional reserve needs measured onboard joules at a real return');
 assert.deepEqual(t.groups.flatMap(g=>g.parts.map(p=>p.id)).sort((a,b)=>a-b),identities);assert.doesNotThrow(()=>G.validate(s));
 assert(s.energyJ<source,'cooling and charging draw from the existing reserve');assert(cell.mood.energy*t.externalBatteryCapacity(cell)<charge);
 system.stop(receiver.id,'Test complete');assert.equal(flight.enabled,false);
 context.diagnostic(JSON.stringify({cyclesSeconds:seconds,chargeDeltaJ:charge-cell.mood.energy*t.externalBatteryCapacity(cell),sourceSpentJ:source-s.energyJ,sourceChargeJ:s.spent.charge-spent.charge,sourceCoolingJ:s.spent.cooling-spent.cooling,delivered:[...s.chain.drone.delivered]}));
});

test('an empty production pickup waits supported beyond an upstream cycle and resumes only for a real new load',()=>{
 const f=missionDrone(),{t,s,C,system,receiver,flight,drone,cell,until,feed}=f;assert(system.start(receiver.id).ok);
 until(()=>C.status(s).droneDelivered===1&&flight.trip?.phase==='ground'&&t.galponComponentSupported(flight.component));
 for(let i=0;i<120*3;i++)t.stepSimulation(1/120);
 const position=drone.body.position.clone(),energy=cell.mood.energy*t.externalBatteryCapacity(cell),reserve=s.energyJ;
 for(let i=0;i<120*70;i++){t.stepSimulation(1/120);assert.equal(flight.trip?.phase,'ground');assert.equal(t.robotGrips.size,0);}
 assert(system.followers.has(receiver.id));assert.match(flight.logisticsWaitReason,/Esperando producto en origen/);
 // Keep the live resting body in Cannon; allow its measured sub-centimetre
 // contact creep instead of replacing support with an artificial anchor.
 assert(drone.body.position.distanceTo(position)<.02);assert(t.galponComponentSupported(flight.component));assert.equal(flight.power.rpm,0);assert.equal(flight.power.inputWatts,0);
 near(reserve-s.energyJ,cell.mood.energy*t.externalBatteryCapacity(cell)-energy,1e-5);assert.equal(C.status(s).droneDelivered,1);
 f.place(f.payload,t.V(5.2,.05,1.2)); // clear the explicit output fixture before the next source-only check
 const next=f.credited.find(g=>g!==f.payload&&t.groups.includes(g)&&g.parts.length===1&&!g.parts[0].mood.gripper&&!g.parts[0].mood.externalBattery);assert(next);feed(next);
 until(()=>t.robotGrips.get(f.grip.id)?.g===next,30);assert.notEqual(flight.trip.phase,'ground');
});

test('a full physical drop pocket keeps the drone supported until the destination actually clears',()=>{
 const f=missionDrone(),{t,system,receiver,flight,cell,payload,until}=f;
 // An explicit environment fixture blocks the taught delivery pocket. The
 // measured payload stays untouched on its real source surface throughout.
 const obstruction=f.manufacture('cube',t.V(4.30,.624,.70));
 for(let i=0;i<120*2;i++)t.stepSimulation(1/120);
 const before=payload.body.position.clone(),charge=cell.mood.energy*t.externalBatteryCapacity(cell);assert(system.start(receiver.id).ok);
 for(let i=0;i<120*15;i++){
  t.stepSimulation(1/120);assert.equal(flight.trip?.phase,'ground');assert.equal(t.robotGrips.size,0);
 }
 assert.match(flight.logisticsWaitReason,/Esperando espacio en destino/);assert.equal(flight.power.rpm,0);assert.equal(flight.power.inputWatts,0);
 near(payload.body.position.distanceTo(before),0,1e-5);assert(cell.mood.energy*t.externalBatteryCapacity(cell)>=charge);assert(t.galponComponentSupported(flight.component));
 // Clear only the test obstruction, then let the same native program acquire
 // its original payload and finish the physical transfer without restarting.
 f.place(obstruction,t.V(5.2,.05,1.2));until(()=>t.robotGrips.get(f.grip.id)?.g===payload,30);
 until(()=>f.C.status(f.s).droneDelivered===1&&flight.trip?.phase==='ground'&&t.galponComponentSupported(flight.component),80);
 assert.equal(t.hangarChainZone(payload),'second-cooler');assert.doesNotThrow(()=>f.G.validate(f.s));
});

for(const destination of ['feedA','feedB'])test(`a real QR drone lifts stabilized product from the second cooler and delivers it to ${destination}`,context=>{
 const f=missionDrone({feed:destination,coldPoint:[4.04,.575,.45]}),{t,s,G,C,w,drone,receiver,grip,cell,start,end,flight,system,payload,until,place,aim,feedBelt:line}=f;
 assert(system.start(receiver.id).ok);until(()=>C.status(s).droneDelivered===1&&flight.trip?.phase==='ground'&&t.galponComponentSupported(flight.component));system.stop(receiver.id,'Prepare next route');
 const id=payload.parts[0].id,origin=payload.parts[0].mood.matter.root,originalBody=payload.body,coldPosition=payload.body.position.clone();assert(s.chain.traces[origin].second);assert.equal(t.hangarChainZone(payload),'second-cooler');
 // Only carrier and beacon setup changes between programs. The cooled product
 // stays on the same real plate until the second actual gripper takes it.
 assert(system.unlink(start.parts[0].id).ok);
 const entry=t.conveyorPortWorld(line,'entry'),landing=entry.p.vadd(entry.direction.scale(.08));
 for(const [g,p]of [[start,t.V(3.82,.047,.10)],[end,t.V(landing.x+.10,.047,landing.z+.36)]]){place(g,p);g.body.quaternion.setFromAxisAngle(t.V(0,0,1),Math.PI/2);g.body.aabbNeedsUpdate=true;}
 const facing=t.Q();facing.setFromAxisAngle(t.V(0,1,0),Math.PI);end.body.quaternion.copy(facing.mult(end.body.quaternion));
 drone.body.quaternion.set(0,0,0,1);const current=t.flightSnapshot(flight),shift=t.V(3.82-current.center.x,.006-current.height,.45-current.center.z);drone.body.position.vadd(shift,drone.body.position);drone.body.velocity.set(0,0,0);drone.body.angularVelocity.set(0,0,0);drone.body.aabbNeedsUpdate=true;drone.body.wakeUp();
 f.cableTo(line.baseId);
 for(let i=0;i<120*3;i++)t.stepSimulation(1/120);
 const created=system.createStart(start.parts[0].id);assert(created.ok);assert(system.pair(created.routeId,end.parts[0].id).ok);assert(system.assign(receiver.id,created.routeId).ok);const route=system.routeFor(receiver.id);system.refresh(route);assert(route.valid,route.reason);
 const box=t.bounds(payload);assert(t.beginLogisticsPoseDraft(receiver.id,'pick'));aim(t.V(box.center.x,box.max.y,box.center.z));assert(t.updateLogisticsPoseDraft(1,true),t.getLogisticsPoseDraft().reason);assert(t.confirmLogisticsPoseDraft(),f.sandbox.document.querySelector('#notice').textContent);
 assert(t.beginLogisticsPoseDraft(receiver.id,'place'));aim(landing);assert(t.updateLogisticsPoseDraft(1,true),t.getLogisticsPoseDraft().reason);assert(t.confirmLogisticsPoseDraft(),f.sandbox.document.querySelector('#notice').textContent);t.closeTrajectoryPanel(false);t.resumeGame();t.hideStoryDialogue();
 near(payload.body.position.distanceTo(coldPosition),0,1e-4);assert.equal(s.chain.traces[origin].feed,false);assert(t.startConveyor(line));assert(system.start(receiver.id).ok);
 const energy=cell.mood.energy*t.externalBatteryCapacity(cell);let grabbed=false,contact=false,elapsed=0;
 for(let i=0;i<120*90;i++){
  t.stepSimulation(1/120);elapsed=(i+1)/120;grabbed||=t.robotGrips.get(grip.id)?.g===payload;contact||=t.hangarChainZone(payload)==='feed';if(s.chain.traces[origin].feed)break;
 }
 assert(grabbed,'the same stabilized body must be physically picked up');assert(contact,'the delivered body must touch the conveyor');assert(s.chain.traces[origin].feed,JSON.stringify({status:flight.status,node:system.nodes.get(receiver.id).status,trip:flight.trip,load:payload.body.position,line:line.status,pending:w.pending}));
 assert.equal(payload.body,originalBody);assert.equal(payload.parts[0].id,id);assert.equal(t.robotGrips.size,0);assert.equal(s.chain.traces[origin].manual,false);assert(cell.mood.energy*t.externalBatteryCapacity(cell)<energy);assert.doesNotThrow(()=>G.validate(s));
 context.diagnostic(JSON.stringify({destination,seconds:elapsed,routeMetres:route.length,spentBatteryJ:energy-cell.mood.energy*t.externalBatteryCapacity(cell),payloadId:id}));
});

module.exports={missionDrone};
