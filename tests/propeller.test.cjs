const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),createGame=require('./game-harness.cjs'),power=require('../assets/js/propeller-power.js');
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';return game;}
function tick(t,seconds){for(let i=0;i<Math.round(seconds*120);i++)t.stepPhysics(1/120);}
function drone(t,n=1,cells=Math.min(n,3)){
 const parts=[],length=(n-1)*3+1;let key=0;
 for(let i=0;i<length;i++)parts.push({key:key++,shape:'cube',weight:1,p:[i*.09,.045,0],q:[0,0,0,1],...(i<cells?{battery:{pack:0,enabled:false}}:{})});
 for(let i=0;i<n;i++)for(const p of t.propellerBlueprintTemplate().groups[0].parts)parts.push({...p,key:key++,p:[p.p[0]+i*.27,p.p[1]+.09,p.p[2]]});
 const record={version:1,type:'coupler',name:'Dron de prueba',groups:[{parts}],joints:[]};assert(t.savedMechanismValid(record));
 const g=t.spawnSavedMechanism(record,t.V());assert(g);for(const p of g.parts.filter(t.isExternalBattery)){p.mood.energy=1;p.mood.externalBattery.enabled=true;}
 const f=t.flightForGroup(g);t.configureFlight(f,{height:.35});return {g,f,record};
}
test('power model limits lift, battery power, height, count and exact last energy fraction',()=>{
 const s={count:1,mass:.6,height:.2,targetHeight:.5,cells:1,energy:100,enabled:true,spool:1};
 const a=power.evaluate(s,1/120);assert(a.fy>.6*9.8);assert(a.spentJoules>0);assert(a.inputWatts<=10);assert(a.canLift);
 assert(power.evaluate({...s,mass:6},0).reason==='overload');assert(power.evaluate({...s,cells:0}).reason==='battery');assert(power.evaluate({...s,energy:0}).reason==='empty');assert(power.evaluate({...s,count:5}).reason==='limit');
 assert(power.evaluate({...s,height:3}).maxForce<a.maxForce);assert.equal(power.evaluate({...s,enabled:false},.1).spentJoules,0);assert.equal(power.evaluate(s,0).spentJoules,0);
 const end=power.evaluate({...s,energy:1e-5},.1);assert.equal(end.spentJoules,1e-5);assert(end.exhausted);assert(end.fy<a.fy*.001);
 for(const count of [1,2,3,4]){const r=power.evaluate({...s,count,cells:3,mass:count},.01);assert(r.canLift);assert(r.inputWatts<=30+1e-7);}
 assert(Object.values(power.evaluate({count:NaN,mass:Infinity,energy:NaN,height:-Infinity,cells:NaN},NaN)).every(v=>typeof v!=='number'||Number.isFinite(v)));
});
test('two triangular tips snap manually to opposite sockets and retain IDs, weight and energy',()=>{
 const{t}=lab(),hub=t.addQubit([0,.15,0],1,'coupler');let owner=hub;const ids=[hub.parts[0].id];
 for(const side of [0,1]){const h=t.rotorPart(ids[0]),p=t.propellerBladePose(h,side),blade=t.addQubit([p.p.x+.015,p.p.y+.015,p.p.z],1/12,'tetra');ids.push(blade.parts[0].id);const snap=t.findPropellerSnap(blade,owner);assert(snap?.propellerTip);assert.equal(snap.side,side);owner=t.weld(snap);assert(owner);}
 assert.equal(t.groups.length,1);assert.equal(t.propellerLayout(owner).length,1);assert.deepEqual(Array.from(owner.parts,p=>p.id).sort(),ids.sort());assert(Math.abs(owner.parts.reduce((n,p)=>n+p.weight,0)-7/6)<1e-9);assert(owner.parts.every(p=>p.mood.energy===.8));
 const before=t.worldParts(owner);t.detachPart({g:owner,part:owner.parts.find(p=>p.shape==='tetra')});assert.equal(t.groups.flatMap(t.propellerLayout).length,0);assert.deepEqual(Array.from(t.groups.flatMap(g=>g.parts.map(p=>p.id))).sort(),ids.sort());assert(Math.abs(t.groups.flatMap(g=>g.parts).reduce((n,p)=>n+p.weight,0)-before.reduce((n,p)=>n+p.weight,0))<1e-12);
});
test('hub-to-blade reverse snap works and a used tip cannot also form a conventional rotor',()=>{
 const{t}=lab(),hub=t.addQubit([0,.2,0],1,'coupler'),h=t.rotorPart(hub.parts[0].id),p=t.propellerBladePose(h,0),blade=t.makeGroup([{id:t.allocateUnitId(),shape:'tetra',weight:1/12,p:p.p,q:p.q}]);
 hub.body.position.x+=.01;const snap=t.findPropellerSnap(hub,blade);assert(snap);const g=t.weld(snap);assert(g);const a=t.rotorPart(h.part.id),q=t.Q();q.setFromAxisAngle(t.V(1,0,0),Math.PI);const other=t.makeGroup([{id:t.allocateUnitId(),shape:'coupler',weight:1,p:t.couplerTip(a).point.vsub(q.vmult(t.V(0,.09*51/56,0))),q}]);assert.equal(t.connectRotorTips(a.part.id,other.parts[0].id),null);
});
for(const n of [1,2,3,4])test(`${n} propellers physically lift and hold the connected chassis with ${Math.min(n,3)} battery cells`,()=>{
 const{t}=lab(),{g,f}=drone(t,n),ids=g.parts.map(p=>p.id),constraints=t.world.constraints.length,energy=t.externalBatterySummary(g).storedJ;assert(t.startFlight(f),f.status);tick(t,5);
 assert(f.enabled,f.status);assert(Math.abs(t.bounds(g).min.y-.35)<.04,JSON.stringify({height:t.bounds(g).min.y,status:f.status}));assert(t.externalBatterySummary(g).storedJ<energy);assert.equal(t.world.constraints.length,constraints);assert.deepEqual(g.parts.map(p=>p.id),ids);assert.equal(t.groups.length,1);assert(f.power.inputWatts<=Math.min(n,3)*10+.00001);
 f.landing=true;tick(t,5);assert(!f.enabled,f.status);assert(t.bounds(g).min.y<.015);assert.equal(g.body.type,1,'body remains dynamic');
});
test('fifth propeller, absent batteries, held assembly and physical overload fail without spending energy',()=>{
 const{t}=lab(),{g,f}=drone(t,5),energy=t.externalBatterySummary(g).storedJ;assert(!t.startFlight(f));assert.match(f.status,/Máximo 4/);assert.equal(t.externalBatterySummary(g).storedJ,energy);
 t.clearNarrativeScene();Object.assign(t.story,{scene:'lab',mode:'playing'});const single=drone(t);const battery=single.g.parts.find(t.isExternalBattery);battery.mood.externalBattery.enabled=false;assert(!t.startFlight(single.f));assert.match(single.f.status,/batería/);battery.mood.externalBattery.enabled=true;t.setHeld({g:single.g,items:[{g:single.g}]});assert(!t.startFlight(single.f));t.setHeld(null);single.g.parts.find(p=>p.shape==='coupler').weight=20;assert(!t.startFlight(single.f));assert.match(single.f.status,/peso/);
});
test('rotating clearance includes foreign pieces, preventing thrust through a blocked blade disk',()=>{
 const{t}=lab(),{g,f}=drone(t),hub=t.rotorPart(f.modules[0].id),tip=t.couplerTip(hub).point;const obstacle=t.addQubit([tip.x,tip.y+.03,tip.z+.1]);assert(!t.startFlight(f));assert.match(f.status,/obstruida/);t.removeGroup(obstacle);assert(t.startFlight(f));tick(t,1);assert(f.phase>0);const blade=f.modules[0].blades[0],before=t.partPose?null:blade.offset.clone(),visual=t.propellerVisualPose(g,blade);assert(visual.q);assert.deepEqual(blade.offset,before);t.detachPart({g,part:blade});assert(!f.enabled);
});
test('translation is powered, direction can reverse, hovering arrests drift and battery exhaustion drops the body',()=>{
 const{t}=lab(),{g,f}=drone(t);t.configureFlight(f,{height:.3,speed:.3,heading:0});assert(t.startFlight(f));tick(t,4);assert(g.body.position.z<-.7);const z=g.body.position.z;t.configureFlight(f,{heading:Math.PI});tick(t,4);assert(g.body.position.z>z+.5);t.configureFlight(f,{speed:0});tick(t,3);assert(Math.abs(g.body.velocity.z)<.025);
 const cell=g.parts.find(t.isExternalBattery);cell.mood.energy=1e-8;tick(t,1/120);assert(!f.enabled);assert.equal(cell.mood.energy,0);tick(t,1);assert(t.bounds(g).min.y<.02);assert.equal(cell.mood.energy,0,'enabled batteries cannot passively refill');
});
test('contact face mounted to the drone reverses once per physical wall contact',()=>{
 const{t}=lab(),{g,f}=drone(t);const sensor=g.parts.find(p=>p.shape==='coupler');sensor.mood.workshop={version:1,ownerId:sensor.id,sensor:true,battery:1,lightweight:1,movement:1,baseWeight:1,ballast:0};t.configureFlight(f,{speed:.25,heading:0});assert(t.startFlight(f));
 const wall=t.storyWall(t.V(2,1,0),t.V(.05,1,1));const contact={bi:g.body,bj:wall.body,si:g.partShapes.get(sensor.id),ni:t.V(1,0,0)};t.world.contacts=[contact];for(let i=0;i<20;i++)t.tickFlightSensors(.05);assert(Math.abs(t.flightConfig(f).heading-Math.PI)<1e-9);for(let i=0;i<20;i++)t.tickFlightSensors(.05);assert.equal(t.flightConfig(f).heading,Math.PI);
 t.world.contacts=[];for(let i=0;i<20;i++)t.tickFlightSensors(.05);t.world.contacts=[contact];for(let i=0;i<20;i++)t.tickFlightSensors(.05);assert.equal(t.flightConfig(f).heading,0);
});
test('lab restore and templates retain bounded configuration, physical material and stored energy without resuming flight',()=>{
 const{t}=lab(),{g,f}=drone(t);t.configureFlight(f,{height:.7,speed:.2,heading:1});assert(t.startFlight(f));tick(t,1);const saved=t.saveLab(),energy=t.externalBatterySummary(g).storedJ,ids=g.parts.map(p=>p.id).sort(),record=t.mechanismSnapshot(g);assert(record);assert(t.savedMechanismValid(record));assert.equal(record.groups[0].parts.find(p=>p.shape==='coupler').flight.height,.7);
 t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);const restored=t.groups.find(g=>g.parts.some(p=>p.id===f.id)),flight=t.flightForGroup(restored);assert(flight&&!flight.enabled);assert.equal(t.flightConfig(flight).height,.7);assert(Math.abs(t.externalBatterySummary(restored).storedJ-energy)<1e-8);assert.deepEqual(restored.parts.map(p=>p.id).sort(),ids);
 const corrupt=t.copySavedMechanism(record);corrupt.groups[0].parts.find(p=>p.shape==='coupler').flight.height=Infinity;assert(!t.savedMechanismValid(corrupt));const copy=t.spawnSavedMechanism(record,t.V(3,0,0));assert(copy);assert.equal(t.externalBatterySummary(copy).storedJ,0);assert(!t.flightForGroup(copy).enabled);
});
test('blueprint consumes existing material and retains charge, mass and identity',()=>{
 const{t}=lab(),record=t.propellerBlueprintTemplate(),bp=t.placeMechanismBlueprint(record,t.V()),targets=t.blueprintTargets(bp),before=[];assert(bp);
 for(let i=0;i<targets.length;i++){const p=targets[i],g=t.makeGroup([{id:t.allocateUnitId(),shape:p.shape,weight:i?1/12:1,p:p.p.clone(),q:p.q.clone()}]);g.parts[0].mood.energy=.3+i*.1;const slot={g,bp,index:i,state:'placed'};g.blueprintJob=slot;bp.slots.push(slot);before.push(...t.worldParts(g));}
 assert(t.completeMechanismBlueprint(bp,targets));assert.equal(t.groups.length,1);const g=t.groups[0];assert.equal(t.propellerLayout(g).length,1);for(const p of g.parts){const original=before.find(o=>o.id===p.id);assert.equal(p.weight,original.weight);assert.equal(p.mood.energy,original.mood.energy);}
});
test('quick drone and panel controls are available, paused inspection spends nothing, safe settings clamp',()=>{
 const{t,sandbox}=lab();t.initUnitRadial();assert(t.spawnQuickElement('quick-drone'));const g=t.groups[0],f=t.flightForGroup(g);t.setSelected({g,part:g.parts.find(p=>p.shape==='coupler')});assert.equal(t.externalBatterySummary(g).active,false);assert(g.parts.find(t.isExternalBattery).mood.energy===1);t.updateFlightPanel();assert.equal(sandbox.document.querySelector('#flight-panel').hidden,false);g.parts.find(t.isExternalBattery).mood.externalBattery.enabled=true;t.pause();const energy=t.externalBatterySummary(g).storedJ,sim=t.getSimTime();assert(t.flightPanelAction('start'));t.updateFlights(0);assert.equal(t.externalBatterySummary(g).storedJ,energy);assert.equal(t.getSimTime(),sim);
 t.configureFlight(f,{height:1e6,speed:-2,heading:Infinity});assert.equal(t.flightConfig(f).height,3);assert.equal(t.flightConfig(f).speed,0);assert(Number.isFinite(t.flightConfig(f).heading));
 const html=fs.readFileSync('index.html','utf8');for(const id of ['flight-start','flight-land','flight-stop','flight-height','flight-speed','flight-telemetry'])assert(html.includes('id="'+id+'"'));
});
test('a mounted hand carries a real cube, shares its battery and counts the payload in flight load',()=>{
 const{t}=lab(),record=t.propellerBlueprintTemplate(true);for(const p of record.groups[0].parts)p.p[1]+=.18;record.groups[0].parts.push({key:4,shape:'cube',weight:1,p:[0,.135,0],q:[0,0,0,1],gripper:t.copyGripperConfig({capacity:4})});assert(t.savedMechanismValid(record));
 const g=t.spawnSavedMechanism(record,t.V()),grip=g.parts.find(p=>p.mood.gripper),cell=g.parts.find(t.isExternalBattery);cell.mood.energy=1;cell.mood.externalBattery.enabled=true;const payload=t.addQubit([0,.045,0]);assert(t.gripperGrab(grip.id));const f=t.flightForGroup(g);t.configureFlight(f,{height:.35});const loaded=t.flightSnapshot(f).load;assert(Math.abs(loaded-25/6)<1e-9);assert(t.startFlight(f),f.status);tick(t,4);assert(f.enabled,f.status);assert(t.robotGrips.has(grip.id),'hand keeps its physical payload');assert(payload.body.position.y>.25);assert(cell.mood.energy<.9);assert(t.releaseGripper(grip.id));assert(Math.abs(t.flightSnapshot(f).load-(loaded-1))<1e-9);tick(t,1);assert(payload.body.position.y<.06);
});
test('snapshots cannot share flight setting objects and shelving preserves the assembled mechanism',()=>{
 const{t}=lab(),{g,f}=drone(t);t.configureFlight(f,{height:.65,speed:.2});const before=t.worldParts(g),hub=before.find(p=>p.shape==='coupler');hub.mood.flight.height=2;assert.equal(t.flightConfig(f).height,.65);const s=t.saveLab();s.groups[0].parts.find(p=>p.shape==='coupler').mood.flight.height=1.5;assert.equal(t.flightConfig(f).height,.65);
 const shelf=t.createShelf({p:t.V(0,.4,-13.996),q:t.Q(),wall:'north'});assert(shelf);t.setMultiSelection([g]);t.setSelected({g,part:g.parts[0]});assert(t.startFlight(f));assert(!t.storeShelfSelection(shelf,0));t.stopFlight(f);const energy=t.externalBatterySummary(g).storedJ,ids=Array.from(g.parts,p=>p.id).sort();assert(t.storeShelfSelection(shelf,0));assert(t.withdrawShelf(shelf,0));const restored=t.groups.find(g=>g.parts.some(p=>p.id===f.id));assert(restored);assert.deepEqual(Array.from(restored.parts,p=>p.id).sort(),ids);const rf=t.flightForGroup(restored);assert(!rf.enabled);assert.equal(t.flightConfig(rf).height,.65);assert.equal(t.externalBatterySummary(restored).storedJ,energy);
});
test('excess load at altitude settles instead of creating unlimited lift, and simultaneous motors reserve battery output',()=>{
 const{t}=lab(),{g,f}=drone(t);const hub=g.parts.find(p=>p.shape==='coupler');hub.weight=3.8;g.body.mass=(3.8+1+1/6)*.25;g.body.updateMassProperties();t.configureFlight(f,{height:3});assert(t.startFlight(f));tick(t,5);assert(t.bounds(g).min.y<2);assert(f.enabled);assert(f.power.inputWatts<=10+1e-7);assert(f.power.spentJoules>0);
 const noBudget=power.evaluate({count:2,mass:1,height:.5,targetHeight:1,cells:2,availableWatts:0,energy:100,enabled:true},.01);assert.equal(noBudget.maxForce,0);assert.equal(noBudget.canLift,false);assert.equal(noBudget.fy,0);assert.equal(noBudget.inputWatts,0);
});
