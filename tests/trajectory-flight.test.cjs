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
