const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;}
function shelf(t){const s=t.createShelf({p:t.V(0,.4,-13.996),q:t.Q(),wall:'north'});assert(s);return s;}
function snapshotParts(t){return plain(t.groups.flatMap(g=>g.parts.map(p=>({id:p.id,shape:p.shape,weight:p.weight,mood:p.mood}))).sort((a,b)=>a.id-b.id));}
function choose(t,groups){t.clearRotorSelection();t.setMultiSelection(groups);t.setSelected(groups.length?{g:groups[0],part:groups[0].parts[0]}:null);}

test('organizer stores actual identities, mass, names, upgrades and charge once, with independent snapshots',()=>{
 const {t}=lab(),s=shelf(t),a=t.addQubit([0,.2,0]),b=t.addQubit([.3,.2,0]);
 a.parts[0].mood.name='Pequeño';a.parts[0].mood.energy=.137;b.parts[0].mood.energy=.91;
 b.parts[0].mood.workshop={version:1,ownerId:b.parts[0].id,sensor:false,battery:3,lightweight:1,movement:2,baseWeight:1,ballast:0};
 const before=snapshotParts(t);choose(t,[a,b]);assert(t.storeShelfSelection(s,0));assert.equal(t.groups.length,0);assert.equal(s.cells[0].items.length,2);
 a.parts[0].mood.energy=1;b.parts[0].mood.workshop.battery=1;
 assert(t.withdrawShelf(s,0,2));assert.equal(s.cells[0].items.length,0);assert.equal(s.cells[0].category,null);assert.deepEqual(snapshotParts(t),before);assert.equal(t.withdrawShelf(s,0,1),false);assert.equal(t.groups.length,2);
});

test('mixed categories and over-capacity batches reject atomically; emptied cells accept a new category',()=>{
 const {t}=lab(),s=shelf(t),cube=t.addQubit([0,.2,0]),tetra=t.addQubit([.3,.2,0],1,'tetra');choose(t,[cube,tetra]);assert.equal(t.storeShelfSelection(s),false);assert.equal(t.groups.length,2);assert.equal(s.cells[0].items.length,0);
 choose(t,[cube]);assert(t.storeShelfSelection(s));choose(t,[tetra]);assert.equal(t.storeShelfSelection(s),false);
 assert(t.withdrawShelf(s));choose(t,[tetra]);assert(t.storeShelfSelection(s));assert.equal(s.cells[0].category.label,'T-bit triangular');
 const more=Array.from({length:50},(_,i)=>t.addQubit([i*.1,.2,2]));choose(t,more);assert(t.storeShelfSelection(s,1));assert.equal(s.cells[1].items.length,50);
 const extra=t.addQubit([0,.2,3]);choose(t,[extra]);assert.equal(t.storeShelfSelection(s,1),false);assert(t.groups.includes(extra));assert.equal(s.cells[1].items.length,50);
});

test('complete rotor vehicles retain batteries, sensor links, named sets and latched contacts',()=>{
 const {t}=lab(),s=shelf(t),r=t.spawnRotor(t.V(0,.3,0)),base=t.rotorPart(r.aId),parts=t.worldParts(base.g),batteryId=t.allocateUnitId(),sensorId=t.allocateUnitId();
 parts.push({id:batteryId,shape:'cube',weight:1,p:t.V(base.p.x+.09,base.p.y,base.p.z),q:base.q.clone(),mood:{energy:.283,name:'Reserva',externalBattery:{version:1,ownerId:batteryId,packId:batteryId,enabled:true}}});
 parts.push({id:sensorId,shape:'cube',weight:1,p:t.V(base.p.x-.09,base.p.y,base.p.z),q:base.q.clone(),mood:{energy:.72,name:'Nariz',workshop:{version:1,ownerId:sensorId,sensor:true,battery:1,lightweight:1,movement:1,baseWeight:1,ballast:0},sensorLink:{aId:r.aId,bId:r.bId}}});
 t.removeGroup(base.g);t.makeGroup(parts);t.refreshRotors();t.configureRotor(r,{rpm:43,direction:-1,maxTorque:.8,capacity:50});t.createRotorSet('Vehículo solar',[r]);t.contactStates.set(sensorId,{latched:true,clearSeconds:.02});
 const before=snapshotParts(t),joint=plain(t.serializeRotorState()[0]);t.toggleRotorSelection(r);assert(t.storeShelfSelection(s,2));assert.equal(t.groups.length,0);assert.equal(t.rotors.length,0);
 assert(t.withdrawShelf(s,2,1));assert.deepEqual(snapshotParts(t),before);assert.deepEqual(plain(t.serializeRotorState()[0]),joint);assert.equal(t.rotorSets[0].name,'Vehículo solar');assert.equal(t.rotorSets[0].rotorIds.length,1);assert.equal(t.contactStates.get(sensorId).latched,true);
});

test('powered motors and active work reject storage before removing any body',()=>{
 const {t}=lab(),s=shelf(t),r=t.spawnRotor(t.V(0,.3,0));assert(t.configureRotor(r,{enabled:true}));t.toggleRotorSelection(r);assert.equal(t.storeShelfSelection(s),false);assert.equal(t.rotors.length,1);assert.equal(t.groups.length,2);
 t.configureRotor(r,{enabled:false});t.clearRotorSelection();const g=t.addQubit([1,.2,0]);choose(t,[g]);for(const key of ['haulJob','blueprintJob','pendingMoodOrder']){g[key]={};assert.equal(t.storeShelfSelection(s),false,key);assert(t.groups.includes(g));delete g[key];}
});

test('blocked withdrawal rolls back the whole batch and preserves all stored energy and IDs',()=>{
 const {t}=lab(),s=shelf(t),a=t.addQubit([0,.2,0]),b=t.addQubit([.3,.2,0]);choose(t,[a,b]);assert(t.storeShelfSelection(s));const before=plain(s.cells[0]);
 const point=t.shelfCellPoint(s);t.storyWall(t.V(point.x,.25,point.z+.6),t.V(1,.25,.5));assert.equal(t.withdrawShelf(s,0,2),false);assert.equal(t.groups.length,0);assert.deepEqual(plain(s.cells[0]),before);
});

test('lab transitions preserve shelf content and reserve stored IDs for future creation',()=>{
 const {t}=lab(),s=shelf(t),g=t.addQubit([0,.2,0]);g.parts[0].mood.energy=.234;const id=g.parts[0].id;choose(t,[g]);assert(t.storeShelfSelection(s));const saved=t.saveLab(),stored=plain(saved.shelves);
 s.cells[0].items[0].groups[0].parts[0].mood.energy=1;t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);assert.equal(t.shelves.length,1);assert.deepEqual(plain(t.serializeShelves()),stored);assert(t.allocateUnitId()>id);
 assert(t.withdrawShelf(t.shelves[0]));assert.equal(t.rotorPart(id).part.mood.energy,.234);
});

test('a resting body with solver penetration never discards a restored shelf inventory',()=>{
 const {t}=lab(),s=shelf(t),stored=t.addQubit([0,.2,0]);choose(t,[stored]);assert(t.storeShelfSelection(s));const part=s.walls.find(w=>Math.abs(w.q.z)<1e-8&&w.half.x>.04),rest=t.addQubit([part.p.x,part.p.y+part.half.y+.045-.0003,part.p.z]);
 const id=stored.parts[0].id,saved=t.saveLab();t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);assert.equal(t.shelves.length,1);assert.equal(t.shelves[0].cells[0].items[0].groups[0].parts[0].id,id);assert(t.rotorPart(rest.parts[0].id));
});

test('damaged snapshots cannot duplicate live IDs or corrupt an existing category',()=>{
 const {t}=lab(),s=shelf(t),g=t.addQubit([0,.2,0]);choose(t,[g]);assert(t.storeShelfSelection(s));const saved=plain(t.serializeShelves());t.clearShelves();
 t.makeGroup([{id:g.parts[0].id,shape:'cube',weight:1,p:t.V(0,.2,0),q:t.Q()}]);assert.equal(t.restoreShelves(saved),0);assert.equal(t.groups.length,1);
 t.removeGroup(t.groups[0]);const damaged=plain(saved);damaged[0].cells[0].items.push(plain(damaged[0].cells[0].items[0]));assert.equal(t.restoreShelves(damaged),0);assert.equal(t.groups.length,0);
 const invalid=plain(saved);invalid[0].cells[0].items[0].groups[0].parts[0].mood.energy=2;assert.equal(t.restoreShelves(invalid),0);
});

test('delete requires an explicit loss warning and confirmation, while cancel preserves inventory',()=>{
 const {t,sandbox}=lab(),s=shelf(t),g=t.addQubit([0,.2,0]);choose(t,[g]);t.storeShelfSelection(s);const bodies=t.world.bodies.length;
 assert.equal(t.deleteShelf(s),false);assert.equal(t.world.bodies.length,bodies);assert(t.requestDeleteShelf(s));assert.match(sandbox.document.querySelector('#command-title').textContent,/se perderán 1/);const buttons=sandbox.document.querySelector('#command-actions').children;assert.match(buttons[0].textContent,/Saca primero/);buttons[1].dispatchEvent({type:'click'});assert.equal(s.cells[0].items.length,1);
 t.requestDeleteShelf(s);sandbox.document.querySelector('#command-actions').children[2].dispatchEvent({type:'click'});assert.equal(t.shelves.length,0);assert.equal(t.groups.length,0);assert.equal(t.world.bodies.length,bodies-s.walls.length);
});

test('category follows geometry and topology, not IDs, energy, orientation or hinge angle',()=>{
 const {t,sandbox}=lab(),first=t.spawnRotor(t.V(0,.3,0)),second=t.spawnRotor(t.V(2,.3,0));t.rotorPart(second.aId).part.mood.energy=.1;
 const a=t.shelfSnapshot(t.rotorConnectedGroups(t.rotorGroups(first))),b=t.shelfSnapshot(t.rotorConnectedGroups(t.rotorGroups(second)));assert.equal(a.category.key,b.category.key);
 const altered=plain(a);altered.groups[0].parts[0].shape='cube';assert.equal(sandbox.QBitsOrganizers.validItem(altered),false);
 const turn=t.Q();turn.setFromAxisAngle(t.V(0,1,0),.7);const moving=t.rotorPart(second.bId).g;moving.body.quaternion.copy(turn.mult(moving.body.quaternion));const changed=t.shelfSnapshot(t.rotorConnectedGroups(t.rotorGroups(second)));assert.equal(changed.category.key,a.category.key);
});

test('restoring a stored axle never steals a live axle from its newly edited control set',()=>{
 const {t}=lab(),s=shelf(t),a=t.spawnRotor(t.V(0,.3,0)),b=t.spawnRotor(t.V(2,.3,0));t.createRotorSet('Original',[a,b]);t.toggleRotorSelection(a);assert(t.storeShelfSelection(s));
 t.createRotorSet('Editado mientras guardado',[b]);assert(t.withdrawShelf(s));assert.equal(t.rotorSetFor(b).name,'Editado mientras guardado');assert.equal(t.rotorSetFor(b).rotorIds.length,1);const restored=t.rotors.find(r=>r.aId===a.aId);assert.equal(t.rotorSetFor(restored).name,'Original');assert.equal(t.rotorSetFor(restored).rotorIds.length,1);
});

test('the wall compartment menu accepts exact Ctrl rotor selections before the rotor menu intercepts',()=>{
 const {t}=lab(),s=shelf(t),a=t.spawnRotor(t.V(0,.3,0)),b=t.spawnRotor(t.V(2,.3,0)),point=t.shelfCellPoint(s,0,true);t.toggleRotorSelection(a);t.toggleRotorSelection(b);t.setLook({camera:[point.x,point.y,point.z+2],yaw:0,pitch:0});
 t.handleSecondary({clientX:640,clientY:360});const menu=t.getCommandState();assert.match(menu.title,/Compartimento 1/);assert.match(menu.items[0].label,/Guardar selección · 2/);assert.equal(menu.items[0].disabled,false);menu.items[0].run();assert.equal(s.cells[0].items.length,2);assert.equal(t.groups.length,0);assert.equal(t.rotors.length,0);
});
