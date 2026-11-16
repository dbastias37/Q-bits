const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;}
function chassis(t,count=4){
 const base=t.makeGroup(Array.from({length:count},(_,i)=>({id:t.allocateUnitId(),shape:'coupler',weight:1,p:t.V(i*.09,.3,0),q:t.Q()})));
 const flip=t.Q();flip.setFromAxisAngle(t.V(0,0,1),Math.PI);
 const members=[];for(const [i,part]of base.parts.entries()){
  const endpoint=t.makeGroup([{id:t.allocateUnitId(),shape:'coupler',weight:1,p:t.V(i*.09,.3+2*.09*51/56,0),q:flip.clone()}]);
  const r=t.connectRotorTips(part.id,endpoint.parts[0].id,{rpm:30+i,direction:i%2?-1:1,capacity:128});assert(r);members.push(r);
 }
 return {base,members};
}
const ids=members=>Array.from(members,r=>r.id);
const copy=value=>JSON.parse(JSON.stringify(value));

test('four exact rotor selections on one rigid chassis remain distinct and toggle from either endpoint',()=>{
 const {t}=lab(),{base,members}=chassis(t);assert(members.every(r=>t.rotorPart(r.aId).g===base));
 for(const r of members)assert(t.toggleRotorSelection(t.rotorForPart(r.aId)));
 assert.deepEqual(ids(t.selectedRotors()),ids(members));
 assert(t.toggleRotorSelection(t.rotorForPart(members[1].bId)));
 assert.deepEqual(ids(t.selectedRotors()),ids([members[0],members[2],members[3]]));
 assert(t.toggleRotorSelection(members[1]));const set=t.createRotorSet('Automóvil');assert(set);assert.equal(t.activeRotorSet(),set);
 t.clearRotorSelection();t.setSelected(t.rotorPart(members[2].aId));assert.equal(t.activeRotorSet(),set);assert.equal(t.controlRotors().length,4);
 t.toggleRotorSelection(members[2]);assert.equal(t.activeRotorSet(),null);assert.deepEqual(ids(t.controlRotors()),[members[2].id]);
});

test('set commands change common settings, preserve per-wheel orientation, invert each and stop all',()=>{
 const {t}=lab(),{members}=chassis(t),set=t.createRotorSet('Deslizante',members),before=members.map(r=>({direction:r.direction,moving:r.moving,mount:r.mount}));
 assert(t.configureRotorSet(set,{rpm:58,maxTorque:.72,capacity:80,enabled:true}));
 for(const [i,r]of members.entries()){assert.equal(r.enabled,true);assert.equal(r.rpm,58);assert.equal(r.maxTorque,.72);assert.equal(r.capacity,80);assert.deepEqual({direction:r.direction,moving:r.moving,mount:r.mount},before[i]);}
 assert(t.configureRotorSet(set,{invert:true}));members.forEach((r,i)=>assert.equal(r.direction,-before[i].direction));
 assert(t.configureRotorSet(set,{enabled:false}));assert(members.every(r=>!r.enabled&&!r.constraint.motorEquation.enabled));
 assert(t.configureRotorSet({rotorIds:ids([members[0],members[2]])},{rpm:20}));assert.equal(members[0].rpm,20);assert.equal(members[1].rpm,58);assert.equal(members[2].rpm,20);
});

test('one empty battery or overloaded axle rejects a whole start before changing any settings',()=>{
 const {t,sandbox}=lab(),{members}=chassis(t),set=t.createRotorSet('Camión',members),before=members.map(r=>r.rpm);
 t.rotorPart(members[3].bId).part.mood.energy=0;
 assert.equal(t.configureRotorSet(set,{enabled:true,rpm:90}),false);assert(members.every(r=>!r.enabled));assert.deepEqual(members.map(r=>r.rpm),before);assert.match(sandbox.document.querySelector('#notice').textContent,/sin energía/);
 t.rotorPart(members[3].bId).part.mood.energy=1;members[2].capacity=2;
 assert.equal(t.configureRotorSet(set,{enabled:true}),false);assert(members.every(r=>!r.enabled));
 assert(t.configureRotorSet(set,{capacity:128,enabled:true}));assert(members.every(r=>r.enabled));
});

test('held vehicles and incompatible fixed mounts reject group starts without disabling another motor',()=>{
 const {t}=lab(),{base,members}=chassis(t),set=t.createRotorSet('Carro',members);
 t.setHeld({g:base,items:[{g:base}]});assert.equal(t.configureRotorSet(set,{enabled:true}),false);assert(members.every(r=>!r.enabled));t.setHeld(null);
 t.configureRotor(members[0],{mount:'fixed'});assert.equal(t.configureRotorSet(set,{enabled:true}),false);assert(members.every(r=>!r.enabled));
 assert(t.configureRotor(members[0],{enabled:true}));const rest={rotorIds:ids(members.slice(1))};assert.equal(t.configureRotorSet(rest,{enabled:true}),false);assert.equal(members[0].enabled,true);assert(members.slice(1).every(r=>!r.enabled));
 assert(t.configureRotorSet(set,{enabled:false}));
});

test('membership can move, rename or dissolve without joining bodies or changing the motors',()=>{
 const {t}=lab(),{members}=chassis(t),bodyCount=t.groups.length,first=t.createRotorSet('  Auto\u0000móvil  ',members);
 assert.equal(first.name,'Automóvil');assert.equal(t.groups.length,bodyCount);
 const other=t.createRotorSet('Otro',[members[0],members[0]]);assert.equal(t.rotorSetMembers(first).length,3);assert.equal(t.rotorSetMembers(other).length,1);assert.equal(t.rotorSetFor(members[0]),other);
 assert(t.renameRotorSet(other,'x'.repeat(60)));assert.equal(other.name.length,40);assert(t.renameRotorSet(other,' '));assert.equal(other.name,'Conjunto de rotores');
 assert(t.dissolveRotorSet(other));assert.equal(t.rotorSetFor(members[0]),null);assert.equal(t.rotors.length,4);assert.equal(t.groups.length,bodyCount);assert(members.every(r=>!r.enabled));
});

test('welding reconstructs the chassis without losing set identity, disconnection removes only its member',()=>{
 const {t}=lab(),{base,members}=chassis(t),set=t.createRotorSet('Vehículo',members);
 const face=t.unitFaces(t.rotorPart(members[0].aId)).find(f=>f.kind==='square'&&f.normal.x<-.9),point=face.center.vadd(face.normal.scale(.045));
 const cube=t.addQubit([point.x,point.y,point.z],1),joined=t.weld({source:cube,target:base,position:cube.body.position.clone(),quaternion:cube.body.quaternion.clone()});assert(joined);
 assert(members.every(r=>t.rotorSetFor(r)===set));assert.equal(t.rotorSetMembers(set).length,4);t.selectRotorSet(set);
 t.disconnectRotor(members[1]);assert.equal(t.rotorSetMembers(set).length,3);assert.equal(t.selectedRotors().length,3);assert.equal(set.name,'Vehículo');
 for(const r of [...t.rotors])t.disconnectRotor(r);assert.equal(t.rotorSets.length,0);assert.equal(t.selectedRotors().length,0);
});

test('laboratory recovery restores group names and exact endpoints with fresh rotor identities',()=>{
 const {t}=lab(),{members}=chassis(t),set=t.createRotorSet('Automóvil',members),before=ids(members);t.selectRotorSet(set);t.configureRotorSet(set,{rpm:42,enabled:true});
 const snapshot=t.saveLab();assert.equal(snapshot.rotorSets[0].members.length,4);t.clearNarrativeScene();assert.equal(t.rotorSets.length,0);
 t.story.scene='campaign';t.story.lab=snapshot;t.enterLab(false);assert.equal(t.rotorSets.length,1);assert.equal(t.rotorSets[0].name,'Automóvil');
 const restored=t.rotorSetMembers(t.rotorSets[0]);assert.equal(restored.length,4);assert(restored.every(r=>!before.includes(r.id)&&r.rpm===42&&r.enabled));assert.equal(t.selectedRotors().length,0);
 assert.deepEqual(Array.from(restored,r=>[r.aId,r.bId]),members.map(r=>[r.aId,r.bId]));
});

test('templates, duplicate, import and export remap rotor sets without tying copies to originals',()=>{
 const {t}=lab(),{members}=chassis(t),original=t.createRotorSet('Automóvil',members);t.configureRotorSet(original,{rpm:51});
 const record=t.saveMechanism(members[0]);assert(record);assert.equal(record.name,'Automóvil');assert.equal(record.rotorSets.length,1);assert.equal(record.rotorSets[0].joints.length,4);assert(t.savedMechanismValid(record));
 const encoded=copy(t.mechanismsExportData());assert.equal(t.importMechanismsData(encoded),1);assert.deepEqual(copy(t.savedMechanisms[0].rotorSets),copy(record.rotorSets));
 const made=t.spawnSavedMechanism(t.savedMechanisms[0],t.V(3,0,1));assert(made);assert.equal(t.rotorSets.length,2);const duplicated=t.rotorSetFor(made);assert.notEqual(duplicated,original);assert.equal(duplicated.name,'Automóvil');assert.equal(t.rotorSetMembers(duplicated).length,4);
 assert(t.configureRotorSet(duplicated,{rpm:19}));assert(members.every(r=>r.rpm===51));
 t.setSelected(t.rotorPart(members[0].aId));assert(t.duplicateSelection());assert.equal(t.rotorSets.length,3);assert.equal(t.rotorSets.at(-1).name,'Automóvil');
});

test('invalid group records reject imports atomically while legacy mechanisms remain valid',()=>{
 const {t}=lab(),{members}=chassis(t);t.createRotorSet('Auto',members);const record=t.saveMechanism(members[0]);
 const mutations=[s=>{s.rotorSets[0].joints=[9];},s=>{s.rotorSets[0].joints=[0,0];},s=>{s.rotorSets.push({name:'Duplicado',joints:[0]});},s=>{s.rotorSets[0].name='';},s=>{s.rotorSets[0].name='bad\nname';},s=>{s.rotorSets[0].joints=[];},s=>{s.rotorSets={};}];
 for(const change of mutations){const bad=copy(record);change(bad);assert.equal(t.savedMechanismValid(bad),false);assert.throws(()=>t.importMechanismsData({version:1,mechanisms:[bad]}));assert.equal(t.savedMechanisms.length,1);}
 const legacy=copy(record);delete legacy.rotorSets;assert(t.savedMechanismValid(legacy));assert(t.spawnSavedMechanism(legacy,t.V(3,0,2)));assert.equal(t.rotorSets.length,1);
});

test('invalid commands and stale members cannot partially update a rotor set',()=>{
 const {t}=lab(),{members}=chassis(t),set=t.createRotorSet('Auto',members),values=members.map(r=>r.rpm);
 for(const patch of [{rpm:NaN},{capacity:Infinity},{enabled:'true'},{invert:1}])assert.equal(t.configureRotorSet(set,patch),false);
 assert.deepEqual(members.map(r=>r.rpm),values);
 assert.equal(t.configureRotorSet({rotorIds:[members[0].id,999999]},{rpm:20,enabled:true}),false);assert.deepEqual(members.map(r=>r.rpm),values);assert(members.every(r=>!r.enabled));
});

test('removing the sole precise selection never falls back to another axle sharing its body',()=>{
 const {t}=lab(),{members}=chassis(t);t.createRotorSet('Auto',members);t.toggleRotorSelection(members[0]);
 t.disconnectRotor(members[0]);assert.equal(t.selectedRotors().length,0);assert.equal(t.getSelected(),null);assert.equal(t.controlRotors().length,0);
 assert.equal(t.rotorSets[0].rotorIds.length,3);assert.equal(t.selectRotorSet({rotorIds:[999999]}),false);assert.equal(t.controlRotors().length,0);
});
