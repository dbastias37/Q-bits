const test=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('./trajectory-fixtures.cjs');

function tick(t,seconds){for(let i=0;i<Math.round(seconds*120);i++)t.stepPhysics(1/120);}
function beacon(t,x,z){
 const q=t.Q();q.setFromAxisAngle(t.V(0,0,1),Math.PI/2);
 return t.makeGroup([{id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(x,.047,z),q,mood:{trajectory:{version:1,level:1,face:0,role:'beacon',routeId:null}}}]);
}
function fixture(withGrip=false){
 const game=setup(),{t}=game,record=t.propellerBlueprintTemplate(true);
 if(withGrip){for(const p of record.groups[0].parts)p.p[1]+=.18;record.groups[0].parts.push({key:4,shape:'cube',weight:1,p:[0,.135,0],q:[0,0,0,1],gripper:t.copyGripperConfig({capacity:4})});}
 record.groups[0].parts.push({key:withGrip?5:4,shape:'cube',weight:1,p:[.09,withGrip?.225:.045,0],q:[0,0,0,1]});
 assert(t.savedMechanismValid(record));const g=t.spawnSavedMechanism(record,t.V());assert(g);
 const receiver=g.parts.find(p=>p.shape==='cube'&&!p.mood.externalBattery&&!p.mood.gripper);
 receiver.mood.trajectory={version:1,level:1,face:0,role:'receiver',routeId:null};t.onTrajectoryPartChanged(g,receiver);
 const cell=g.parts.find(t.isExternalBattery);cell.mood.energy=1;cell.mood.externalBattery.enabled=true;
 let payload=null;if(withGrip){payload=t.addQubit([0,.045,0]);assert(t.gripperGrab(g.parts.find(p=>p.mood.gripper).id));}
 const start=beacon(t,0,-.35),end=beacon(t,.8,-.35),system=t.getTrajectorySystem(),created=system.createStart(start.parts[0].id);assert(created.ok);assert(system.pair(created.routeId,end.parts[0].id).ok);assert(system.assign(receiver.id,created.routeId).ok);
 tick(t,.6);const route=system.routeFor(receiver.id);system.refresh(route);assert(route.valid,route.reason);assert.equal(route.mode,'air');
 const points=route.points.map(p=>({...p,y:.28}));points[points.length-1].action='land';assert(system.edit(receiver.id,points,false).ok);
 return {...game,g,cell,receiver,start,end,system,route,payload,f:t.flightForGroup(g)};
}
test('an upward pair guides a powered physical drone to the second beacon and lands',()=>{
 const {t,g,cell,receiver,system,route,f}=fixture(),energy=cell.mood.energy,ids=g.parts.map(p=>p.id),mass=g.body.mass;
 const result=system.start(receiver.id);assert(result.ok,result.message);let reachedHeight=0;
 for(let i=0;i<2400;i++){t.stepPhysics(1/120);reachedHeight=Math.max(reachedHeight,t.bounds(g).min.y);if(i>120&&!system.followers.has(receiver.id))break;}
 assert(reachedHeight>.2,'flight needs to rise physically');assert.equal(system.followers.size,0,JSON.stringify({status:f.status,trip:f.trip}));assert.equal(f.enabled,false,f.status);
 assert(Math.hypot(g.body.position.x-route.points[1].x,g.body.position.z-route.points[1].z)<.09,JSON.stringify({p:g.body.position,status:system.nodes.get(receiver.id).status}));assert(t.bounds(g).min.y<.02);
 assert(cell.mood.energy<energy);assert.equal(g.body.type,1);assert.equal(g.body.mass,mass);assert.deepEqual(g.parts.map(p=>p.id),ids);
});
test('moving a marker pauses its drone in powered hover without relocating the aircraft',()=>{
 const {t,g,receiver,end,system,f}=fixture();assert(system.start(receiver.id).ok);tick(t,2);assert(f.enabled);
 const before=g.body.position.clone();end.body.position.x+=.15;end.body.wakeUp();tick(t,.12);assert.equal(system.followers.size,0);assert(f.enabled,'route pause retains physical hover');assert.equal(f.trip,null);assert.equal(t.flightConfig(f).speed,0);
 assert(before.distanceTo(g.body.position)<.1,'pausing must not reposition the aircraft');assert.match(system.nodes.get(receiver.id).status,/Baliza/);
 const energy=t.externalBatterySummary(g).storedJ;tick(t,1);assert(t.externalBatterySummary(g).storedJ<energy,'hover remains powered');assert(g.body.type===1);
});
test('an airborne point releases an actual held payload once and continues to landing',()=>{
 const {t,g,receiver,system,route,payload,f}=fixture(true),first=route.points[0],last=route.points[1];
 assert(system.edit(receiver.id,[first,{x:.35,y:.32,z:0,action:'drop',wait:.15},last],false).ok);assert(system.start(receiver.id).ok);
 let releaseCount=0,previous=true;for(let i=0;i<3000;i++){t.stepPhysics(1/120);const attached=t.robotGrips.size>0;if(previous&&!attached)releaseCount++;previous=attached;if(i>120&&!system.followers.has(receiver.id))break;}
 assert.equal(releaseCount,1);assert.equal(t.robotGrips.size,0);assert.equal(payload.robotHeld,undefined);assert.equal(g.body.type,1);assert.equal(system.followers.size,0,JSON.stringify({status:f.status,node:system.nodes.get(receiver.id).status}));assert.match(system.nodes.get(receiver.id).status,/terminado/);
});
test('a receiver rejects aerial delivery without a pincher and cannot restart an empty battery',()=>{
 const {t,g,cell,receiver,system,route}=fixture();const points=route.points.map(p=>({...p}));points[1].action='drop';assert(system.edit(receiver.id,points,false).ok);assert.match(system.start(receiver.id).message,/pinza/);points[1].action='land';assert(system.edit(receiver.id,points,false).ok);cell.mood.energy=0;
 assert.equal(system.start(receiver.id).ok,false);assert.equal(t.flightForGroup(g).enabled,false);assert.equal(system.followers.size,0);assert.equal(cell.mood.energy,0);
});
test('a final pass completes in powered hover instead of forcing an unrequested landing',()=>{
 const {t,g,receiver,system,route,f}=fixture(),points=route.points.map(p=>({...p,action:'pass'}));assert(system.edit(receiver.id,points,false).ok);assert(system.start(receiver.id).ok);
 tick(t,12);assert.equal(system.followers.size,0);assert(f.enabled);assert.equal(f.trip,null);assert.equal(t.flightConfig(f).speed,0);assert(Math.abs(t.bounds(g).min.y-.28)<.055);assert(Math.hypot(g.body.position.x-points[1].x,g.body.position.z-points[1].z)<.09);
});
test('a durable in-flight save retains pair identity and reloads its route paused in physical hover',()=>{
 const {t,g,receiver,system}=fixture();assert(system.start(receiver.id).ok);tick(t,2);
 const saved=t.hydrateLabSnapshot(t.saveLab({passive:true})),height=t.bounds(g).min.y,energy=t.externalBatterySummary(g).storedJ,routeId=receiver.mood.trajectory.routeId;
 assert.deepEqual(Array.from(saved.runtime.trajectoryReceivers),[receiver.id]);
 t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);const result=t.restoreLabRuntime(saved.runtime);assert(result.ok,result.warnings.join('; '));
 const restored=t.rotorPart(receiver.id),f=t.flightForGroup(restored.g),runtime=t.getTrajectorySystem();assert.equal(restored.part.mood.trajectory.routeId,routeId);assert(runtime.routeFor(receiver.id));assert.equal(runtime.followers.size,0);assert.equal(f.trip,null);assert(f.enabled);assert.equal(t.flightConfig(f).speed,0);assert.match(runtime.nodes.get(receiver.id).status,/pausado al cargar/);
 assert(Math.abs(t.externalBatterySummary(restored.g).storedJ-energy)<1e-8);tick(t,1);assert(Math.abs(t.bounds(restored.g).min.y-height)<.09);assert(t.externalBatterySummary(restored.g).storedJ<energy);
});

test('48 authored flight points retain all compiled elbows and reload paused in powered hover',()=>{
 const {t,g,receiver,system,route,f}=fixture(),first=route.points[0],last=route.points[1];
 const points=[first,...Array.from({length:46},(_,i)=>({x:(i+1)*.015,y:i%2?.28:.3,z:i%2?.015:.035,action:'pass',wait:0})),last];
 assert(system.edit(receiver.id,points,false).ok);assert.equal(route.points.length,48);assert(route.polyline.points.length>100);
 assert(route.polyline.points.length<=142);const started=system.start(receiver.id);assert(started.ok,started.message);
 assert.equal(t.flightConfig(f).route.points.length,48);assert.equal(f.trip.points.length,route.polyline.points.length);
 assert.equal(system.followers.get(receiver.id).drive.points,route.polyline.points);
 for(let i=0;i<f.trip.points.length;i++){
  const p=f.trip.points[i],expected=route.polyline.points[i];
  assert(Math.abs(f.trip.origin.x+p.x-expected.x)<1e-10);assert(Math.abs(f.trip.origin.z+p.z-expected.z)<1e-10);assert.equal(p.height,expected.y);assert.equal(p.action,expected.action);
 }
 assert.equal(g.body.type,1);tick(t,2);
 const height=t.bounds(g).min.y,energy=t.externalBatterySummary(g).storedJ,saved=t.hydrateLabSnapshot(t.saveLab({passive:true}));
 assert(height>.2);assert.equal(saved.runtime.flights.length,1);assert.equal(saved.runtime.flights[0].trip,null,'compiled controller points are not serialized as a manual route');
 assert.equal(saved.trajectories.routes[0].points.length,48);
 t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);const restored=t.restoreLabRuntime(saved.runtime);assert(restored.ok,restored.warnings.join('; '));
 const loaded=t.rotorPart(receiver.id),flight=t.flightForGroup(loaded.g),runtime=t.getTrajectorySystem();
 assert(flight.enabled);assert.equal(flight.trip,null);assert.equal(runtime.followers.size,0);assert.equal(t.flightConfig(flight).speed,0);assert.match(runtime.nodes.get(receiver.id).status,/pausado al cargar/);
 assert(Math.abs(t.externalBatterySummary(loaded.g).storedJ-energy)<1e-8);tick(t,1);assert(Math.abs(t.bounds(loaded.g).min.y-height)<.09);assert(t.externalBatterySummary(loaded.g).storedJ<energy);
});

test('a powered drone reaches every horizontal and vertical corner before landing on a grid circuit',()=>{
 const {t,g,cell,receiver,system,route,f}=fixture(),first=route.points[0],last=route.points[1],energy=cell.mood.energy;
 assert(system.edit(receiver.id,[first,{x:.2,y:.28,z:.35,action:'wait',wait:.05},{x:.2,y:.28,z:.35,action:'pass',wait:0},{x:.6,y:.55,z:.35,action:'pass',wait:0},last],false).ok);
 const compiled=route.polyline.points;assert(compiled.length>=8);assert(system.start(receiver.id).ok);
 const coincident=compiled.map((p,i)=>p.x===.2&&p.y===.28&&p.z===.35?i:-1).filter(i=>i>=0);assert.equal(coincident.length,2);for(const i of coincident)assert(f.trip.trajectory.corners[i],'coincident commands must retain their shared corner');
 const arrivals=[],body=g.body;let maxMiss=0,previous=0,previousPhase='',waits=0;
 const distanceToSegment=(p,a,b)=>{const x=b.x-a.x,y=b.y-a.y,z=b.z-a.z,s=x*x+y*y+z*z,factor=s?Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y+(p.z-a.z)*z)/s)):0;return Math.hypot(p.x-a.x-x*factor,p.y-a.y-y*factor,p.z-a.z-z*factor);};
 for(let i=0;i<7200;i++){
  t.stepPhysics(1/120);const trip=f.trip,state=f.power;if(!trip){if(!system.followers.has(receiver.id))break;continue;}
  if(trip.phase==='wait'&&previousPhase!=='wait')waits++;previousPhase=trip.phase;
  if(trip.index!==previous){assert.equal(trip.index,previous+1,'every compiled corner is visited in order');
   if(trip.trajectory.corners[previous])assert(Math.hypot(state.velocity.x,state.velocity.y,state.velocity.z)<.06,'the drone stabilizes before leaving each corner, including coincident actions');
   arrivals.push(previous);previous=trip.index;
  }
  if(trip.phase==='travel'&&trip.index>0&&state){const position={x:state.center.x,y:state.height,z:state.center.z};maxMiss=Math.max(maxMiss,Math.min(...compiled.slice(1).map((p,j)=>distanceToSegment(position,compiled[j],p))));}
 }
 assert.equal(system.followers.size,0,JSON.stringify({status:f.status,node:system.nodes.get(receiver.id).status,index:f.trip?.index}));
 assert.equal(arrivals.length,compiled.length-1,'the trip did not skip its inserted elbows');assert.equal(f.enabled,false,f.status);assert(t.bounds(g).min.y<.02);
 assert.equal(waits,1,'the authored wait executes once, without spreading to synthetic corners');
 assert(maxMiss<.08,`physical flight departed ${maxMiss.toFixed(3)} m from the authored circuit`);
 assert(Math.hypot(body.position.x-last.x,body.position.z-last.z)<.09);assert.equal(g.body,body);assert.equal(body.type,1);assert(cell.mood.energy<energy);
});
