const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const saves=require('../assets/js/save-games.js');
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);

function fixture(storage){
 const game=createGame({graphics:false,storage}),{t,sandbox}=game,G=sandbox.QBitsGalponProduction;
 t.beginHangarGame({workers:4});t.story.ready=true;t.hideStoryDialogue();
 const s=t.story.galpon,worker=s.initialIds[0];
 function make(kind='cube',point=t.V(-5,.05,1)){
  const id=t.allocateUnitId();G.tick(s,1);assert(G.extract(s,id));assert(G.take(s,id,worker));assert(G.store(s,id,worker));
  assert(G.start(s,'converter',id,'cube'));G.tick(s,1);G.finish(s,'converter');G.tick(s,8);
  if(kind==='coupler'){assert(G.start(s,'former',id,'coupler'));G.tick(s,1);G.finish(s,'former');G.tick(s,8);}
  const g=t.hangarMakePart(G.record(s,id),point);assert(g);return g;
 }
 const source=()=>{const r=t.createGalponPowerReservoir(t.V(.6,0,2.7),{enabled:true});assert(r);return r;};
 const step=n=>{for(let i=0;i<n;i++)t.stepSimulation(1/120);};
 return {...game,G,s,make,source,step};
}
function wire(f,r,target,material){
 const result=f.t.connectPowerCable({kind:'reservoir',id:r.id},{kind:'part',id:target.parts[0].id},[],f.t.worldParts(material));
 assert(result.ok,result.error);return result.cable;
}

test('mission source reveals the original remaining reserve once and cannot refill it through its cell',()=>{
 const f=fixture(),{t,G,s}=f;G.spend(s,1245,'transport');const before=s.energyJ,r=f.source();
 near(r.cell.mood.energy*r.capacity,before);assert.equal(t.createPowerReservoir(t.V(3,0,3)),null);
 assert.equal(t.createGalponPowerReservoir(t.V(3,0,3)),null);
 r.cell.mood.energy=1;near(s.energyJ,before);r.cell.mood.energy=(before-25)/r.capacity;
 near(s.energyJ,before-25);near(s.spent.transport,1270);
 G.spend(s,13,'charge');near(r.cell.mood.energy*r.capacity,before-38);
 assert.equal(r.maxWatts,240);assert.equal(G.validate(s),s);
});

test('laying and extending cable transfers only live paid material, and recovery keeps identities and energy',()=>{
 const f=fixture(),{t,G,s}=f,r=f.source(),target=f.make('coupler',t.V(.6,.1,3.6));
 const a=f.make(),before=t.worldParts(a),id=a.parts[0].id,c=wire(f,r,target,a);
 assert(!t.groups.includes(a));assert.equal(G.record(s,id).place,'cable');assert.equal(G.record(s,id).group,'cable:'+c.id);
 assert.equal(t.makeGroup(before),null,'stored cable cannot also exist as a world cube');
 assert.equal(t.extendPowerCable(c,before).ok,false);
 const b=f.make('cube',t.V(-4.6,.05,1)),bid=b.parts[0].id;
 assert(t.extendPowerCable(c,t.worldParts(b)).ok);assert(!t.groups.includes(b));assert.equal(c.materials.length,2);
 const returned=t.removePowerCable(c);assert.equal(returned.length,2);
 assert.deepEqual(Array.from(returned,p=>p.id),[id,bid]);
 for(const p of returned){assert.equal(G.record(s,p.id).place,'world');near(p.mood.energy,G.record(s,p.id).energy);assert(t.makeGroup([p]));}
 assert.equal(t.powerCables.length,0);G.validate(s);
});

test('blocked cable and hot or fabricated inputs preserve world pieces and the reserve',()=>{
 const f=fixture(),{t,G,s}=f,r=f.source(),target=f.make('coupler',t.V(.6,.1,3.6)),material=f.make(),id=material.parts[0].id;
 const endpoints=[{kind:'reservoir',id:r.id},{kind:'part',id:target.parts[0].id}],before=s.energyJ;
 G.record(s,id).heat=1;
 assert.equal(t.connectPowerCable(...endpoints,[],t.worldParts(material)).ok,false);assert(t.groups.includes(material));
 G.record(s,id).heat=0;
 const copy=t.worldParts(material);copy[0].mood.energy=1;
 assert.equal(t.connectPowerCable(...endpoints,[],copy).ok,false);
 assert.equal(t.connectPowerCable(...endpoints,[t.V(-5,.1,4)],t.worldParts(material)).ok,false);
 assert.equal(t.powerCables.length,0);near(s.energyJ,before);assert.equal(G.record(s,id).place,'world');
});

test('a material-backed battery changes capacity without adding charge and cannot passively charge',()=>{
 const f=fixture(),{t,G,s}=f,g=f.make('cube',t.hangarTray('former',0)),p=g.parts[0];
 p.mood.energy=.4;G.syncEnergy(s,p.id,.4);const joules=p.mood.energy*t.gameBatteryCapacity(p),before=s.energyJ;
 assert(t.createExternalBattery(p.id,1));near(t.externalBatteryCapacity(p),900);near(p.mood.energy*t.externalBatteryCapacity(p),joules);
 near(before-s.energyJ,G.CONFIG.formingJ);near(G.record(s,p.id).energy,p.mood.energy);
 t.rechargeExternalBatteries(30);near(p.mood.energy*t.externalBatteryCapacity(p),joules);
 assert(t.restoreExternalBattery(p.id));near(p.mood.energy*t.gameBatteryCapacity(p),joules);assert(!t.isExternalBattery(p));G.validate(s);
});

test('a stopped wired battery charges only while physically supported and spends exactly transferred joules',()=>{
 const f=fixture(),{t,G,s}=f,r=f.source(),g=f.make('cube',t.hangarTray('former',0)),p=g.parts[0];
 assert(t.createExternalBattery(p.id,1));g.body.position.set(.6,.05,3.6);g.body.aabbNeedsUpdate=true;
 wire(f,r,g,f.make());
 const stored=()=>p.mood.energy*t.externalBatteryCapacity(p);const initial=stored(),before=s.energyJ;
 t.rechargeExternalBatteries(1);near(stored(),initial);near(s.energyJ,before);
 f.step(180);assert(t.galponComponentSupported([g]));assert(stored()>initial);near(before-s.energyJ,stored()-initial);
 const charged=stored();r.enabled=false;f.step(120);near(stored(),charged);
 r.enabled=true;g.body.position.y=.5;g.body.velocity.set(0,0,0);g.body.aabbNeedsUpdate=true;
 t.stepSimulation(1/120);const airborne=stored();t.rechargeExternalBatteries(1);near(stored(),airborne);
});

test('the real rotor and source share exact energy debits and enforce available output power',()=>{
 const f=fixture(),{t,s}=f,r=f.source(),a=f.make('coupler',t.V(.6,.15,3.9)),b=f.make('coupler',t.V(.6,.15+2*.09*51/56,3.9));
 b.body.quaternion.setFromAxisAngle(t.V(0,0,1),Math.PI);
 const motor=t.connectRotorTips(a.parts[0].id,b.parts[0].id,{capacity:64,maxTorque:4});assert(motor);
 wire(f,r,a,f.make());assert(t.configureRotor(motor,{enabled:true}));t.prepareRotorPower();motor.actualTorque=.13;motor.actualRpm=30;motor.stalled=false;
 const inside=[a.parts[0].mood.energy,b.parts[0].mood.energy],watts=t.rotorPowerState(motor).inputWatts,before=s.energyJ;
 t.updateRotorPower(.5);near(before-s.energyJ,watts*.5);assert.deepEqual([a.parts[0].mood.energy,b.parts[0].mood.energy],inside);
 r.maxWatts=.01;t.updatePowerNetwork(.1);t.prepareRotorPower();assert.equal(motor.enabled,false);assert.equal(motor.stopReason,'power');
});

test('charging already allocated before motor accounting remains inside the same source power limit',()=>{
 const f=fixture(),{t,s}=f,r=f.source(),battery=f.make('cube',t.hangarTray('former',0)),part=battery.parts[0];
 assert(t.createExternalBattery(part.id,1));battery.body.position.set(.85,.05,3.25);battery.body.aabbNeedsUpdate=true;wire(f,r,battery,f.make());
 const a=f.make('coupler',t.V(.6,.15,3.9)),b=f.make('coupler',t.V(.6,.15+2*.09*51/56,3.9));b.body.quaternion.setFromAxisAngle(t.V(0,0,1),Math.PI);
 const motor=t.connectRotorTips(a.parts[0].id,b.parts[0].id,{capacity:64,maxTorque:6.5});assert(motor);wire(f,r,a,f.make());
 r.enabled=false;f.step(240);assert(t.galponComponentSupported([battery]));r.enabled=true;t.updatePowerNetwork(.5);
 const before=s.energyJ,stored=part.mood.energy*t.externalBatteryCapacity(part),charged=t.chargeGalponComponent([battery],.5);near(charged,15);near(r.chargeWatts,30);
 assert(t.configureRotor(motor,{enabled:true}));t.prepareRotorPower();motor.actualTorque=6.5;motor.actualRpm=15;motor.stalled=false;
 const watts=t.rotorPowerState(motor).inputWatts;assert(watts<r.maxWatts&&watts+r.chargeWatts>r.maxWatts);
 t.updateRotorPower(.5);assert.equal(motor.enabled,false);assert.equal(motor.stopReason,'power');
 near(before-s.energyJ,charged);near(part.mood.energy*t.externalBatteryCapacity(part)-stored,charged);assert(r.outputWatts+r.chargeWatts<=r.maxWatts);
});

test('a fixed QR charging berth requires its cable, proximity and physical support; airborne requests receive nothing',()=>{
 const f=fixture(),{t,s}=f,r=f.source(),g=f.make('cube',t.hangarTray('former',0)),p=g.parts[0];assert(t.createExternalBattery(p.id,1));
 g.body.position.set(.6,.05,3.8);g.body.aabbNeedsUpdate=true;
 const dock=f.make('cube',t.V(.6,.05,3.45)),beacon=dock.parts[0];
 beacon.mood.trajectory={version:1,level:1,face:0,role:'beacon',routeId:null};t.onTrajectoryPartChanged(dock,beacon);
 wire(f,r,dock,f.make());
 const original=p.mood.energy*t.externalBatteryCapacity(p),before=s.energyJ;f.step(240);
 const stored=p.mood.energy*t.externalBatteryCapacity(p);assert(stored>original+30);near(before-s.energyJ,stored-original);
 const airborne={component:[g],enabled:true,trip:null};assert.equal(t.chargeGalponDockedDrone(airborne,10,beacon.id),0);near(p.mood.energy*t.externalBatteryCapacity(p),stored);
 dock.body.position.x+=1;dock.body.aabbNeedsUpdate=true;dock.body.wakeUp();f.step(120);
 near(p.mood.energy*t.externalBatteryCapacity(p),stored);
});

test('connecting a previously sleeping QR berth records a real support before charging',()=>{
 const f=fixture(),{t,s}=f,r=f.source(),dock=f.make('cube',t.V(.6,.05,3.45)),beacon=dock.parts[0];
 beacon.mood.trajectory={version:1,level:1,face:0,role:'beacon',routeId:null};t.onTrajectoryPartChanged(dock,beacon);
 f.step(360);assert.equal(dock.body.sleepState,2);assert(!t.world.contacts.some(c=>c.bi===dock.body||c.bj===dock.body));
 const g=f.make('cube',t.hangarTray('former',0)),p=g.parts[0];assert(t.createExternalBattery(p.id,1));
 g.body.position.set(.6,.05,3.8);g.body.aabbNeedsUpdate=true;
 const before=p.mood.energy*t.externalBatteryCapacity(p);f.step(180);near(p.mood.energy*t.externalBatteryCapacity(p),before);
 wire(f,r,dock,f.make());assert.notEqual(dock.body.sleepState,2,'connection wakes the berth instead of inventing contact');
 const reserve=s.energyJ;f.step(180);const charged=p.mood.energy*t.externalBatteryCapacity(p)-before;
 assert(charged>30);near(reserve-s.energyJ,charged);
});

test('source, cable custody and battery charge survive a fresh instance without duplicated grants',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v))};
 const f=fixture(storage),{t,G,s}=f,r=f.source(),g=f.make('cube',t.hangarTray('former',0)),p=g.parts[0];
 assert(t.createExternalBattery(p.id,1));g.body.position.set(.6,.05,3.6);wire(f,r,g,f.make());
 const saved=t.saveCurrentGame();assert(saved.ok,saved.error);const original=values.get(saves.KEYS.galpon),before=s.energyJ;
 const fresh=createGame({graphics:false,storage});fresh.t.story.ready=true;assert(fresh.t.continueHangarGame(),fresh.t.saveSession.message);
 near(fresh.t.story.galpon.energyJ,before);assert.equal(fresh.t.powerReservoirs.length,1);assert.equal(fresh.t.powerCables.length,1);
 near(fresh.t.rotorPart(p.id).part.mood.energy,p.mood.energy);assert.equal(fresh.t.groups.flatMap(g=>g.parts).length,t.groups.flatMap(g=>g.parts).length);
 for(const mutate of [d=>d.snapshot.powerNetwork.reservoirs[0].energy=1,d=>d.snapshot.powerNetwork.cables[0].materials[0].mood.energy=1,d=>d.production.records.find(r=>r.place==='cable').group='cable:999']){
  const corrupt=JSON.parse(JSON.stringify(saved.save.data));mutate(corrupt);assert.equal(t.saveStore.write('galpon',corrupt).ok,false);
 }
 assert.equal(values.get(saves.KEYS.galpon),original);G.validate(s);
});

test('a real dock charge crossing twenty percent survives save without becoming landing reserve',()=>{
 const {fixture:chainFixture}=require('./galpon-chain-fixture.cjs'),f=chainFixture(),{t,G,C,s,storage}=f;
 const drone=f.build('drone'),flight=t.flightForGroup(drone),part=drone.parts.find(t.isExternalBattery),source=f.source();
 assert(part&&flight);part.mood.externalBattery.enabled=true;
 const state=t.flightSnapshot(flight);drone.body.position.vadd(t.V(.6-state.center.x,.006-state.height,3.8-state.center.z),drone.body.position);drone.body.aabbNeedsUpdate=true;
 const dock=f.manufacture('cube',t.V(.6,.05,3.45)),beacon=dock.parts[0];
 beacon.mood.trajectory={version:1,level:1,face:0,role:'beacon',routeId:null};t.onTrajectoryPartChanged(dock,beacon);f.cableTo(beacon.id);
 source.enabled=false;for(let i=0;i<240;i++)t.stepSimulation(1/120);
 assert(t.galponComponentSupported(flight.component));
 // Explicit boundary-condition fixture: a completed arrival has 179.9/900 J.
 // The measured charger now transfers real source joules before the next
 // logical observation. No route or delivered-product milestone is invented.
 part.mood.energy=179.9/t.externalBatteryCapacity(part);G.syncEnergy(s,part.id,part.mood.energy);flight.galponChargedSinceLogic=0;
 source.enabled=true;t.updatePowerNetwork(1/60);const before=s.energyJ,charged=t.chargeGalponDockedDrone(flight,1/60,beacon.id);
 near(charged,.5);near(before-s.energyJ,charged);assert(part.mood.energy*900>180);
 const saved=t.saveCurrentGame();assert(saved.ok,saved.error);assert.deepEqual(JSON.parse(JSON.stringify(saved.save.data.snapshot.runtime.galponCharges)),[{id:flight.id,joules:.5}]);
 const bytes=storage.values.get(saves.KEYS.galpon);
 for(const change of [a=>{a[0].joules=-1;},a=>{a[0].joules=901;},a=>{a[0].id=beacon.id;},a=>{a.push({...a[0]});}]){
  const invalid=JSON.parse(JSON.stringify(saved.save.data));change(invalid.snapshot.runtime.galponCharges);assert.equal(t.saveStore.write('galpon',invalid).ok,false);
 }
 assert.equal(storage.values.get(saves.KEYS.galpon),bytes);
 const fresh=createGame({graphics:false,storage}),r=fresh.t;r.story.ready=true;assert(r.continueHangarGame(),r.saveSession.message);
 assert.deepEqual(Array.from(r.saveSession.restoreWarnings),[]);const restored=r.flightForGroup(r.rotorPart(flight.id).g),cell=r.rotorPart(part.id).part;
 near(restored.galponChargedSinceLogic,.5);near(r.story.galpon.energyJ,s.energyJ);near(cell.mood.energy,part.mood.energy);
 const returned=cell.mood.energy*r.externalBatteryCapacity(cell)-restored.galponChargedSinceLogic;near(returned,179.9);
 assert(fresh.sandbox.QBitsGalponChain.noteReturn(r.story.galpon,{origins:[f.credited[0].parts[0].id],toolId:drone.parts.find(p=>p.mood.gripper).id,powered:true,returned:true,storedJ:returned,capacityJ:900}));
 assert.equal(fresh.sandbox.QBitsGalponChain.status(r.story.galpon).reserveReturn,false);
 near(r.story.galpon.energyJ,s.energyJ);assert.doesNotThrow(()=>fresh.sandbox.QBitsGalponProduction.validate(r.story.galpon));
});
