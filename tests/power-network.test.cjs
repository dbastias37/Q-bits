const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const close=(a,b,e=1e-8)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;}
function spool(t,count=2,weight=1){const result=[];for(let i=0;i<count;i++){const g=t.addQubit([5+i*.14,.05,5],weight);result.push(...t.worldParts(g));t.removeGroup(g);}return result;}
function motor(t,p=t.V(0,0,2)){const r=t.spawnRotor(p,{capacity:256});assert(r);return r;}
function link(t,r,m,materials=spool(t,2),points=[]){const out=t.connectPowerCable({kind:'reservoir',id:r.id},{kind:'part',id:m.aId},points,materials);assert(out.ok,out.error);return out.cable;}
function start(t,r){assert(t.configureRotor(r,{enabled:true}));t.prepareRotorPower();r.actualTorque=.13;r.actualRpm=30;r.stalled=false;}

test('remote 180 kJ reservoir uses real static collision but adds no mechanical mass',()=>{
 const {t}=lab(),r=t.createPowerReservoir(t.V(0,0,0),{enabled:true}),m=motor(t);assert(r);link(t,r,m);
 assert.equal(r.wall.body.mass,0);assert(t.world.bodies.includes(r.wall.body));assert(t.storyWorld.walls.includes(r.wall));
 const supply=t.externalBatterySummary(m),power=t.rotorPowerState(m);assert.equal(supply.capacity,180000);assert.equal(supply.cells.length,1);assert.equal(power.load,2);assert.equal(t.rotorConnectedGroups(t.rotorGroups(m)).length,2);
 assert.equal(t.createPowerReservoir(t.V(0,0,0)),null,'cannot overlap itself');assert.equal(t.createPowerReservoir(t.V(0,.4,0)),null,'must sit on floor');
});

test('lossless cable debits only exact useful system demand and preserves internal motor charge',()=>{
 const {t}=lab(),r=t.createPowerReservoir(t.V(0,0,0),{energy:.8,enabled:true}),m=motor(t);link(t,r,m);
 const internal=t.rotorGroups(m).flatMap(g=>g.parts).map(p=>p.mood.energy);start(t,m);const watts=t.rotorPowerState(m).inputWatts,before=r.cell.mood.energy*180000;t.updateRotorPower(2);
 close(before-r.cell.mood.energy*180000,watts*2);assert.deepEqual(t.rotorGroups(m).flatMap(g=>g.parts).map(p=>p.mood.energy),internal);
 t.updatePowerNetwork(100);close(r.cell.mood.energy*180000,before-watts*2);r.enabled=false;t.updatePowerNetwork(100);close(r.cell.mood.energy*180000,before-watts*2);
});

test('all machines on a branching cyclic network see identical deduplicated source sets',()=>{
 const {t}=lab(),a=t.createPowerReservoir(t.V(-1,0,0),{energy:.3,enabled:true}),b=t.createPowerReservoir(t.V(1,0,0),{energy:.7,enabled:true}),m1=motor(t,t.V(-1,0,2)),m2=motor(t,t.V(1,0,2));
 link(t,a,m1);link(t,b,m2);
 assert(t.connectPowerCable({kind:'part',id:m1.aId},{kind:'part',id:m2.aId},[],spool(t,2)).ok);
 assert(t.connectPowerCable({kind:'reservoir',id:a.id},{kind:'reservoir',id:b.id},[t.V(-1,.35,.5),t.V(1,.35,.5)],spool(t,2)).ok);
 const ids=r=>Array.from(t.externalBatteryCells(r),p=>p.id);assert.deepEqual(ids(m1),ids(m2));assert.equal(ids(m1).length,2);
 start(t,m1);start(t,m2);const watts=[m1,m2].reduce((sum,m)=>sum+t.rotorPowerState(m).inputWatts,0),before=t.externalBatterySummary(m1).storedJ;t.updateRotorPower(.5);
 close(before-t.externalBatterySummary(m1).storedJ,watts*.5);close(a.cell.mood.energy/b.cell.mood.energy,3/7);
});

test('depleted enabled reservoir stops the motors without falling back to internal energy',()=>{
 const {t}=lab(),r=t.createPowerReservoir(t.V(0,0,0),{energy:1e-8,enabled:true}),m=motor(t);link(t,r,m);start(t,m);t.updateRotorPower(1);
 assert.equal(r.cell.mood.energy,0);assert.equal(m.enabled,false);assert.equal(m.stopReason,'empty');assert.equal(t.externalBatterySummary(m).active,true);assert.equal(t.configureRotor(m,{enabled:true}),false);
 r.enabled=false;assert.equal(t.externalBatterySummary(m).active,false);assert(t.configureRotor(m,{enabled:true}));
});

test('actual polyline length sets the budget and extra cubes extend a stretched cable',()=>{
 const {t}=lab(),r=t.createPowerReservoir(t.V(0,0,0),{enabled:true}),m=motor(t),material=spool(t,1);
 const bad=t.connectPowerCable({kind:'reservoir',id:r.id},{kind:'part',id:m.aId},[t.V(-3,.01,0),t.V(-3,.01,2)],material);assert.equal(bad.ok,false);assert.equal(t.powerCables.length,0);
 const c=link(t,r,m,material);close(c.maxLength,2);for(const g of t.rotorGroups(m))g.body.position.z+=2;t.updatePowerNetwork(.1);assert.equal(c.active,false);assert.equal(t.externalBatterySummary(m).active,false);
 const extended=t.extendPowerCable(c,spool(t,2));assert(extended.ok);assert.equal(c.active,true);close(c.maxLength,6);assert.equal(t.externalBatterySummary(m).capacity,180000);
 const oldLength=c.length;assert.equal(t.reroutePowerCable(c,{kind:'part',id:m.aId},[t.V(-7,.01,0)]).ok,false);close(c.length,oldLength);
});

test('cable cannot cross walls but can route around their end',()=>{
 const {t}=lab(),r=t.createPowerReservoir(t.V(0,0,0),{enabled:true}),m=motor(t);t.storyWall(t.V(0,.5,1),t.V(.5,.5,.08));
 const material=spool(t,4);assert.equal(t.connectPowerCable({kind:'reservoir',id:r.id},{kind:'part',id:m.aId},[],material).ok,false);
 const c=link(t,r,m,material,[t.V(.7,.01,.6),t.V(.7,.01,1.4)]);assert.equal(c.active,true);
});

test('self-links, parallel duplicates, foreign cubes and repeated cable material are rejected',()=>{
 const {t}=lab(),r=t.createPowerReservoir(t.V(0,0,0)),m=motor(t),e={kind:'reservoir',id:r.id},material=spool(t,2);
 assert.equal(t.connectPowerCable(e,e,[],material).ok,false);const c=link(t,r,m,material);assert.equal(linkLength(c),4);
 assert.equal(t.connectPowerCable(e,{kind:'part',id:m.aId},[],spool(t,2)).ok,false);
 const other=motor(t,t.V(2,0,2));assert.equal(t.connectPowerCable(e,{kind:'part',id:other.aId},[],material).ok,false);
 assert.equal(t.extendPowerCable(c,material).ok,false);assert.equal(t.extendPowerCable(c,spool(t,7)).ok,false);
 const plain=t.addQubit([3,.05,0]);assert.equal(t.connectPowerCable(e,{kind:'part',id:plain.parts[0].id},[],spool(t,4)).ok,false);
 function linkLength(c){return c.maxLength;}
});

test('snapshot restores finite charge, all material and inactive links without reusing unit ids',()=>{
 const {t}=lab(),r=t.createPowerReservoir(t.V(0,0,0),{enabled:true,energy:.321}),m=motor(t),c=link(t,r,m),ids=Array.from(c.materials,p=>p.id),snapshot=JSON.parse(JSON.stringify(t.serializePowerNetwork()));
 t.clearPowerNetwork();assert.equal(t.powerReservoirs.length,0);assert(!t.world.bodies.includes(r.wall.body));assert(t.restorePowerNetwork(snapshot));
 close(t.powerReservoirs[0].cell.mood.energy,.321);assert.equal(t.powerCables[0].active,true);assert.deepEqual(Array.from(t.powerCables[0].materials,p=>p.id),ids);assert(t.allocateUnitId()>Math.max(...ids));
 t.removeGroup(t.rotorPart(m.aId).g);t.updatePowerNetwork(0);assert.equal(t.powerCables[0].active,false);const broken=JSON.parse(JSON.stringify(t.serializePowerNetwork()));assert(t.restorePowerNetwork(broken));assert.equal(t.powerCables[0].active,false);assert.equal(t.powerCables[0].materials.length,2);
 const returned=t.removePowerCable(t.powerCables[0]);assert.equal(returned.length,2);assert(returned[0].p.clone&&returned[0].q.clone);const recovered=t.makeGroup(returned);assert.equal(recovered.parts.length,2);
});

test('invalid restored source or duplicated material rolls back the complete network',()=>{
 const {t}=lab(),r=t.createPowerReservoir(t.V(0,0,0)),m=motor(t);link(t,r,m);const snapshot=JSON.parse(JSON.stringify(t.serializePowerNetwork()));
 snapshot.cables[0].materials.push({...snapshot.cables[0].materials[0]});assert.equal(t.restorePowerNetwork(snapshot),false);assert.equal(t.powerReservoirs.length,0);assert.equal(t.powerCables.length,0);
 const malformed={version:1,reservoirs:[{id:1,p:[0,0,0],energy:2,enabled:true}],cables:[]};assert.equal(t.restorePowerNetwork(malformed),false);assert.equal(t.powerReservoirs.length,0);
});


test('portable external batteries and reservoir share an exact conductive pool without idle recharge',()=>{
 const {t}=lab(),r=t.createPowerReservoir(t.V(-2,0,0),{enabled:true,energy:.5}),g=t.addQubit([0,.045,0]),p=g.parts[0],m=motor(t);
 p.mood.externalBattery={version:1,ownerId:p.id,packId:p.id,enabled:true};p.mood.energy=.5;
 assert(t.connectPowerCable({kind:'part',id:p.id},{kind:'part',id:m.aId},[],spool(t,2)).ok);
 assert(t.connectPowerCable({kind:'reservoir',id:r.id},{kind:'part',id:p.id},[],spool(t,2)).ok);
 const supply=t.externalBatterySummary(m);assert.equal(supply.capacity,181800);assert.equal(supply.cells.length,2);close(supply.storedJ,90900);
 p.mood.externalBattery.enabled=false;p.mood.energy=0;t.rechargeExternalBatteries(10);assert.equal(p.mood.energy,0,'wired disabled cell requires unplugging to recharge');
 for(const cable of [...t.powerCables])t.removePowerCable(cable);t.rechargeExternalBatteries(10);close(p.mood.energy,1/9);
});

test('wire restores reject invalid stored energy and routes above the ceiling',()=>{
 const {t}=lab(),r=t.createPowerReservoir(t.V(0,0,0)),m=motor(t),material=spool(t,2);
 const endpoints=[{kind:'reservoir',id:r.id},{kind:'part',id:m.aId}];material[0].mood.energy=NaN;assert.equal(t.connectPowerCable(...endpoints,[],material).ok,false);
 material[0].mood.energy=.5;assert.equal(t.connectPowerCable(...endpoints,[t.V(0,20,1)],material).ok,false);
});


test('one reservoir feeds independent rotor, conveyor and gripper with one exact finite debit',()=>{
 const {t}=lab(),r=t.createPowerReservoir(t.V(0,0,0),{enabled:true,energy:.1}),m=motor(t,t.V(-2,0,2));
 assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight'),t.V(2,0,2)));const conveyor=t.conveyors.at(-1);
 const gripper=t.addQubit([0,.4,3]),part=gripper.parts[0];assert(t.configureGripper(part.id));
 for(const id of [m.aId,conveyor.baseId,part.id])assert(t.connectPowerCable({kind:'reservoir',id:r.id},{kind:'part',id},[],spool(t,4)).ok);
 assert(t.startConveyor(conveyor));start(t,m);t.prepareRotorPower();for(const rotor of t.rotors){rotor.actualTorque=.12;rotor.actualRpm=32;rotor.stalled=false;}
 const internals=Array.from(t.rotors.flatMap(rotor=>[rotor.aId,rotor.bId]),id=>t.rotorPart(id).part.mood.energy),gripInternal=part.mood.energy;
 const before=r.cell.mood.energy*180000,watts=t.rotors.reduce((sum,rotor)=>sum+t.rotorPowerState(rotor).inputWatts,0);
 assert(t.spendGripperEnergy(t.rotorPart(part.id),2));assert(t.conveyorSpendTraction(conveyor,3));t.updateRotorPower(.5);
 close(before-r.cell.mood.energy*180000,5+watts*.5);assert.deepEqual(Array.from(t.rotors.flatMap(rotor=>[rotor.aId,rotor.bId]),id=>t.rotorPart(id).part.mood.energy),internals);close(part.mood.energy,gripInternal);
 r.cell.mood.energy=1/180000;assert.equal(t.spendGripperEnergy(t.rotorPart(part.id),2),false);assert.equal(t.conveyorSpendTraction(conveyor,2),false);close(r.cell.mood.energy*180000,1);
 t.updateRotorPower(100);assert.equal(r.cell.mood.energy,0);assert(t.rotors.every(rotor=>!rotor.enabled));assert.equal(t.spendGripperEnergy(t.rotorPart(part.id),.1),false);assert.equal(t.conveyorSpendTraction(conveyor,.1),false);
});
