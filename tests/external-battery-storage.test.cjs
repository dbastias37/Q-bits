const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;}
function pack(t,count=3,origin=t.V(0,.045,0),enabled=true){
 const ids=Array.from({length:count},()=>t.allocateUnitId()),parts=ids.map((id,i)=>({id,shape:'cube',weight:1,p:t.V(origin.x+i*.09,origin.y,origin.z),q:t.Q(),mood:{energy:(i+1)/5,externalBattery:{version:1,ownerId:id,packId:ids[0],enabled}}}));
 return t.makeGroup(parts);
}
function batteries(t){return t.groups.flatMap(g=>g.parts).filter(p=>p.mood.externalBattery);}

test('battery templates preserve identity links and switches, but copies receive zero charge',()=>{
 const {t,sandbox}=lab(),original=pack(t),ids=original.parts.map(p=>p.id),before=original.parts.map(p=>p.mood.energy);
 const record=t.saveMechanism(original,'Reserva');assert(record);assert.equal(record.type,'battery');assert.equal(record.joints.length,0);
 for(const part of record.groups[0].parts){assert.equal(part.battery.pack,0);assert.equal(part.battery.enabled,true);assert.equal(part.energy,undefined);assert.equal(part.mood,undefined);}
 const exported=t.mechanismsExportData();assert.equal(t.importMechanismsData(exported),1);
 exported.mechanisms[0].groups[0].parts[0].battery.enabled=false;assert.equal(t.savedMechanisms[0].groups[0].parts[0].battery.enabled,true,'import must own its metadata');
 const copy=t.spawnSavedMechanism(t.savedMechanisms[0],t.V(2,0,0));assert(copy);assert.equal(copy.parts.length,3);
 for(const part of copy.parts){assert(!ids.includes(part.id));assert.equal(part.mood.energy,0);assert.equal(part.mood.externalBattery.ownerId,part.id);assert.equal(part.mood.externalBattery.packId,copy.parts[0].id);assert.equal(part.mood.externalBattery.enabled,true);}
 assert.deepEqual(original.parts.map(p=>p.mood.energy),before);assert.match(sandbox.document.querySelector('#notice').textContent,/baterías vacías.*piso/);
});

test('lab snapshots own battery metadata and restore the exact original charge',()=>{
 const {t}=lab(),original=pack(t),ids=original.parts.map(p=>p.id),snapshot=t.saveLab(),expected=plain(original.parts.map(p=>({id:p.id,energy:p.mood.energy,battery:p.mood.externalBattery})));
 original.parts[0].mood.externalBattery.enabled=false;original.parts[1].mood.energy=0;
 assert.equal(snapshot.groups[0].parts[0].mood.externalBattery.enabled,true);
 t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=snapshot;t.enterLab(false);
 assert.deepEqual(plain(ids.map(id=>{const p=t.rotorPart(id).part;return {id:p.id,energy:p.mood.energy,battery:p.mood.externalBattery};})),expected);
 const restored=t.rotorPart(ids[0]).part;restored.mood.externalBattery.enabled=false;
 assert.equal(snapshot.groups[0].parts[0].mood.externalBattery.enabled,true,'restoration must not alias saved metadata');
});

test('a separated battery fragment can be saved after its original anchor leaves the body',()=>{
 const {t}=lab(),original=pack(t),anchor=original.parts[0],remainingId=original.parts[1].id;
 t.detachPart({g:original,part:anchor},false);
 const fragment=t.rotorPart(remainingId).g;assert.equal(fragment.parts.length,2);assert(!fragment.parts.some(p=>p.id===anchor.id));
 const record=t.mechanismSnapshot(fragment);assert(record);assert.equal(record.groups[0].parts[0].battery.pack,0);assert.equal(record.groups[0].parts[1].battery.pack,0);
 const copy=t.spawnSavedMechanism(record,t.V(2,0,0));assert(copy);assert.equal(copy.parts.length,2);assert(copy.parts.every(p=>p.mood.energy===0&&p.mood.externalBattery.packId===copy.parts[0].id));
});

test('batteries mounted on a rotor chassis survive a full mechanism template',()=>{
 const {t}=lab(),rotor=t.spawnRotor(t.V(0,.4,0));assert(rotor);
 const base=t.rotorPart(rotor.aId),parts=t.worldParts(base.g),ids=[t.allocateUnitId(),t.allocateUnitId()];
 for(const [i,id]of ids.entries())parts.push({id,shape:'cube',weight:1,p:t.V(base.p.x+.09*(i+1),base.p.y-.09*5/56,base.p.z),q:t.Q(),mood:{energy:.5,externalBattery:{version:1,ownerId:id,packId:ids[0],enabled:false}}});
 t.removeGroup(base.g);t.makeGroup(parts);t.refreshRotors();
 const record=t.mechanismSnapshot(rotor,'Vehículo');assert(record);assert.equal(record.type,'rotor');assert.equal(record.groups.flatMap(g=>g.parts).filter(p=>p.battery).length,2);
 const copy=t.spawnSavedMechanism(record,t.V(3,0,0));assert(copy);const copied=t.mechanismGroups(copy).flatMap(g=>g.parts).filter(p=>p.mood.externalBattery);
 assert.equal(copied.length,2);assert(copied.every(p=>p.mood.energy===0&&!ids.includes(p.id)));assert.equal(copied[0].mood.externalBattery.packId,copied[1].mood.externalBattery.packId);
});

test('a chassis with the middle battery cell removed exports its two ends as separate packs',()=>{
 const {t}=lab(),original=pack(t,3,t.V(0,.135,0)),ids=original.parts.map(p=>p.id),parts=t.worldParts(original);
 for(let i=0;i<3;i++)parts.push({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(i*.09,.045,0),q:t.Q()});
 t.removeGroup(original);const chassis=t.makeGroup(parts);t.detachPart({g:chassis,part:chassis.parts.find(p=>p.id===ids[1])},false);
 const remaining=t.rotorPart(ids[0]).g;assert.equal(t.rotorPart(ids[2]).g,remaining,'support keeps both end cells in one rigid body');
 const liveBefore=plain(remaining.parts.filter(p=>p.mood.externalBattery).map(p=>({id:p.id,energy:p.mood.energy,battery:p.mood.externalBattery})));
 const record=t.mechanismSnapshot(remaining,'Reserva con hueco');assert(record);assert(t.savedMechanismValid(record));
 const stored=record.groups[0].parts.filter(p=>p.battery);assert.equal(stored.length,2);assert.equal(new Set(stored.map(p=>p.battery.pack)).size,2);assert(stored.every(p=>p.battery.pack===p.key&&p.battery.enabled));
 assert.deepEqual(plain(remaining.parts.filter(p=>p.mood.externalBattery).map(p=>({id:p.id,energy:p.mood.energy,battery:p.mood.externalBattery}))),liveBefore,'export does not rewrite live charge or pack links');
 const copy=t.spawnSavedMechanism(record,t.V(2,0,0));assert(copy);const cells=copy.parts.filter(p=>p.mood.externalBattery);
 assert.equal(cells.length,2);assert(cells.every(p=>p.mood.energy===0&&p.mood.externalBattery.enabled&&p.mood.externalBattery.packId===p.id));
});

test('reassembled angled cells export as straight subpacks without changing the live assembly',()=>{
 const {t}=lab(),original=pack(t),parts=t.worldParts(original);parts[2].p=t.V(.09,.045,.09);t.removeGroup(original);const corner=t.makeGroup(parts);
 const record=t.mechanismSnapshot(corner);assert(record);assert(t.savedMechanismValid(record));
 const cells=record.groups[0].parts;assert.equal(new Set(cells.map(p=>p.battery.pack)).size,2);
 assert(corner.parts.every(p=>p.mood.externalBattery.packId===corner.parts[0].id));
});

test('invalid battery templates are rejected atomically before import or spawning',()=>{
 const {t}=lab(),original=pack(t),record=t.saveMechanism(original);assert(record);const before=t.groups.length;
 const mutations=[
  r=>{r.groups[0].parts[0].battery.pack=99;},
  r=>{r.groups[0].parts[0].battery.enabled='yes';},
  r=>{r.groups[0].parts[0].battery.energy=1;},
  r=>{r.groups[0].parts[0].shape='pyramid';},
  r=>{r.groups[0].parts[2].p[0]=r.groups[0].parts[1].p[0];r.groups[0].parts[2].p[2]+=.09;},
  r=>{const extra=plain(r.groups[0].parts[2]);extra.key=3;extra.p[0]+=.09;r.groups[0].parts.push(extra);},
  r=>{r.groups[0].parts.forEach(p=>delete p.battery);}
 ];
 for(const mutate of mutations){const invalid=plain(record);mutate(invalid);assert.equal(t.savedMechanismValid(invalid),false);assert.throws(()=>t.importMechanismsData({version:1,mechanisms:[invalid]}));assert.equal(t.spawnSavedMechanism(invalid,t.V(2,0,0)),null);assert.equal(t.groups.length,before);assert.equal(t.savedMechanisms[0].name,record.name);}
});

test('simple save and duplicate routes retain batteries instead of turning them into charged Q-bits',()=>{
 const {t}=lab(),original=pack(t,2);t.saveShape(original);assert.equal(t.savedShapes.length,0);assert.equal(t.savedMechanisms.length,1);assert.equal(t.savedMechanisms[0].type,'battery');
 t.setSelected({g:original,part:original.parts[0]});const copies=t.duplicateSelection();assert(copies);assert.equal(batteries(t).length,4);assert(copies.flatMap(g=>g.parts).every(p=>p.mood.externalBattery&&p.mood.energy===0));
});

test('external batteries cannot become autonomous workers, blueprint material or upgraded and divided companions',()=>{
 const {t,sandbox}=lab(),battery=pack(t,1),part=battery.parts[0];
 assert.equal(t.groupWorkUnits(battery),0);assert.equal(t.startRoute(battery,t.V(1,0,0),true),false);assert.equal(battery.route,null);
 const ordinary=t.addQubit([.4,.045,0]);t.saveShape(ordinary);t.removeGroup(ordinary);const blueprint=t.placeBlueprint(t.savedShapes[0],t.V(.6,0,0));assert(blueprint);assert(!t.nearBlueprint(blueprint).includes(battery));
 const W=sandbox.QBitsWorkshop,profile=W.normalizeProfile({claimed:Array.from({length:20},(_,i)=>i+1),research:W.RESEARCH.map(r=>r.id)});assert.match(W.planPartUpgrade(part,{battery:2},profile).error,/batería/);
 const R=sandbox.QBitsReconfiguration,identified=R.identify({...part});assert.match(R.plan('divide',[identified]).error,/baterías/);
});
