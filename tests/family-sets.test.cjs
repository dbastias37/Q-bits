// Families must preserve control sets across independent physical assemblies.
// Uses the real game and Cannon; DOM/GPU remain simulated by the shared harness.
const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
const signature=members=>Array.from(members).sort((a,b)=>a.aId-b.aId||a.bId-b.bId).map(m=>m.aId+'-'+m.bId).join(',');
function lab(){
 const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();
 Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle',progress:{level1:true}});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 return game;
}
function reload(t){
 const saved=t.hydrateLabSnapshot(plain(t.saveLab()));
 t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);
}
function withdraw(t,family,x,z=0,count=1){
 assert(t.beginFamilyPlacement(family,'withdraw',count));
 assert(t.confirmFamilyPlacement({point:t.V(x,0,z),normal:t.V(0,1,0)}));
}
function installSensor(game){
 const {t,sandbox}=game,g=t.addQubit([0,.046,0]),W=sandbox.QBitsWorkshop;
 const profile=W.purchase(W.awardCompleted({},t.story.progress).profile,'sensor').profile;
 const upgrade=W.planPartUpgrade(g.parts[0],{sensor:true},profile);assert(!upgrade.error,upgrade.error);
 Object.assign(g.parts[0],upgrade.part);return g.parts[0].id;
}

test('a shared rotor set survives two withdrawals, saving between them and an external sensor',()=>{
 const game=lab(),{t,sandbox}=game,sensorId=installSensor(game);
 const a=t.spawnRotor(t.V(1.2,.3,0),{mount:'fixed'}),b=t.spawnRotor(t.V(2.2,.3,0),{mount:'fixed'});
 assert(a&&b);const members=[a,b],originalSignature=signature(members),pairIds=members.map(r=>({aId:r.aId,bId:r.bId}));
 t.createRotorSet('Motores coordinados',members);
 assert(t.linkContactSensor(sensorId,{kind:'set',name:'Motores coordinados',members,aId:a.aId,bId:a.bId,signature:originalSignature}));
 const originalLink=plain(t.rotorPart(sensorId).part.mood.sensorLink);
 const [family]=t.groupIntoFamilies(members.flatMap(t.rotorGroups),{name:'Repuestos',color:'#000000'});assert(family);
 assert.equal(family.items.length,2);assert.equal(t.rotorSets.length,0);
 for(const item of family.items)assert.equal(item.sets[0].familySignature,originalSignature);
 t.tickContactSensors(.02);assert.deepEqual(plain(t.rotorPart(sensorId).part.mood.sensorLink),originalLink);
 withdraw(t,family,1.8);
 assert.equal(t.rotorSets.length,1);assert.equal(t.rotorSetMembers(t.rotorSets[0]).length,1);
 assert.equal(t.serializeRotorSets()[0].familySignature,originalSignature);
 for(let i=0;i<5;i++)t.tickContactSensors(.02);
 assert.deepEqual(plain(t.rotorPart(sensorId).part.mood.sensorLink),originalLink);
 reload(t);
 assert.equal(t.families.length,1);assert.equal(t.rotorSets.length,1);
 assert.equal(t.serializeRotorSets()[0].familySignature,originalSignature);
 assert.deepEqual(plain(t.rotorPart(sensorId).part.mood.sensorLink),originalLink);
 withdraw(t,t.families[0],2.7);
 assert.equal(t.families.length,0);assert.equal(t.rotorSets.length,1);
 const restored=t.rotorSetMembers(t.rotorSets[0]);
 assert.equal(signature(restored),originalSignature);assert.deepEqual(plain(restored.map(r=>({aId:r.aId,bId:r.bId}))).sort((x,y)=>x.aId-y.aId),pairIds);
 assert.equal(t.rotorSets[0].name,'Motores coordinados');
 t.tickContactSensors(.02);assert.deepEqual(plain(t.rotorPart(sensorId).part.mood.sensorLink),originalLink);
 const active=t.rotorPart(sensorId).g;active.body.fixedRotation=true;active.body.updateMassProperties();
 t.world.defaultContactMaterial.friction=0;t.world.defaultContactMaterial.restitution=0;
 t.world.addBody(new sandbox.CANNON.Body({mass:0,shape:new sandbox.CANNON.Box(t.V(.04,.3,.4)),position:t.V(.12,.3,0)}));
 for(let i=0;i<80;i++){active.body.wakeUp();active.body.aabbNeedsUpdate=true;active.body.velocity.x=.7;t.stepSimulation(1/240);}
 assert(restored.every(r=>r.sensorPulses===1),'the restored external sensor starts the complete original set once');
 assert.deepEqual(plain(t.rotorPart(sensorId).part.mood.sensorLink),originalLink);
});

test('different control sets with the same name remain separate after storing together',()=>{
 const {t}=lab(),rotors=[1,2,3,4].map(x=>t.spawnRotor(t.V(x,.3,1)));
 assert(rotors.every(Boolean));t.createRotorSet('Motores',rotors.slice(0,2));t.createRotorSet('Motores',rotors.slice(2));
 const original=t.rotorSets.map(set=>signature(t.rotorSetMembers(set))).sort();
 const [family]=t.groupIntoFamilies(rotors.flatMap(t.rotorGroups),{name:'Drones'});assert(family);
 withdraw(t,family,4,-3,family.items.length);
 assert.equal(t.rotorSets.length,2);assert(t.rotorSets.every(set=>set.name==='Motores'));
 assert.deepEqual(t.rotorSets.map(set=>signature(t.rotorSetMembers(set))).sort(),original);
 assert(t.rotorSets.every(set=>t.rotorSetMembers(set).length===2));
});

test('a stored member rejoins the live remainder of its original set after a save',()=>{
 const {t}=lab(),a=t.spawnRotor(t.V(1,.3,1)),b=t.spawnRotor(t.V(2,.3,1));
 t.createRotorSet('Pareja',[a,b]);const original=signature([a,b]);
 const [family]=t.groupIntoFamilies(t.rotorGroups(a),{name:'Un motor'});assert(family);
 assert.equal(t.rotorSets.length,1);assert.equal(t.serializeRotorSets()[0].familySignature,original);
 reload(t);withdraw(t,t.families[0],4,-3);
 assert.equal(t.rotorSets.length,1);assert.equal(signature(t.rotorSetMembers(t.rotorSets[0])),original);
});
