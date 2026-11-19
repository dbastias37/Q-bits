const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const near=(a,b)=>assert(Math.abs(a-b)<1e-10,`${a} != ${b}`);
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;}

test('the laboratory doubles motor autonomy without changing its work, draw or campaign calibration',()=>{
 const {t}=lab(),rotor=t.spawnRotor(t.V(0,.4,0),{mount:'fixed'});assert(rotor);
 assert.equal(rotor.capacity,32);assert(t.configureRotor(rotor,{enabled:true}));
 rotor.actualRpm=30;rotor.actualTorque=.2;
 const extended=t.rotorPowerState(rotor,1);
 t.story.scene='campaign';const ordinary=t.rotorPowerState(rotor,1);
 assert.equal(extended.capacityJoulesA,600);assert.equal(ordinary.capacityJoulesA,300);
 near(extended.inputWatts,ordinary.inputWatts);near(extended.mechanicalWatts,ordinary.mechanicalWatts);near(extended.spentJoules,ordinary.spentJoules);
 near(extended.drainA*2,ordinary.drainA);near(extended.drainB*2,ordinary.drainB);
 near(extended.remainingSeconds+1,(ordinary.remainingSeconds+1)*2);
});

test('a campaign visit preserves laboratory charge and load settings without carrying its extra batteries into the mission',()=>{
 const {t}=lab(),rotor=t.spawnRotor(t.V(0,.4,0));assert(rotor);
 t.rotorPart(rotor.aId).part.mood.energy=.37;t.rotorPart(rotor.bId).part.mood.energy=.61;
 t.configureRotor(rotor,{capacity:2000});t.settings.maxCarry=96;t.settings.maxSelect=200;
 const ids=[rotor.aId,rotor.bId];t.beginCampaignLevel(16);
 const campaignRotor=t.rotors[0];assert(campaignRotor);assert.equal(t.rotorPowerState(campaignRotor).capacityJoulesA,300);
 assert.equal(t.settings.maxCarry,2000);
 t.enterLab(false);const restored=t.rotors.find(r=>r.aId===ids[0]&&r.bId===ids[1]);assert(restored);
 assert.equal(restored.capacity,2000);assert.equal(t.settings.maxCarry,96);assert.equal(t.settings.maxSelect,200);
 near(t.rotorPart(ids[0]).part.mood.energy,.37);near(t.rotorPart(ids[1]).part.mood.energy,.61);
 assert.equal(t.rotorPowerState(restored).capacityJoulesA,600);
});

test('the enlarged creation limit admits 2000 pieces and rejects another rotor atomically',()=>{
 const {t}=lab();
 for(let i=0;i<1998;i++)t.addQubit([2+(i%40)*.1,.2,2+Math.floor(i/40)*.1]);
 const rotor=t.spawnRotor(t.V(-3,.4,-3));assert(rotor);
 assert.equal(t.groups.reduce((n,g)=>n+g.parts.length,0),2000);
 const bodies=t.world.bodies.length,constraints=t.world.constraints.length;
 assert.equal(t.spawnRotor(t.V(-4,.4,-4)),null);
 assert.equal(t.groups.reduce((n,g)=>n+g.parts.length,0),2000);
 assert.equal(t.world.bodies.length,bodies);assert.equal(t.world.constraints.length,constraints);
});

test('expanded load remains validated and survives mechanism export and import',()=>{
 const {t}=lab(),rotor=t.spawnRotor(t.V(0,.4,0),{capacity:2000});assert(rotor);
 const record=t.saveMechanism(rotor,'Carga ampliada');assert(record);assert.equal(record.joints[0].capacity,2000);
 const exported=t.mechanismsExportData();assert.equal(t.importMechanismsData(exported),1);
 const invalid=JSON.parse(JSON.stringify(exported));invalid.mechanisms[0].joints[0].capacity=2001;
 assert.throws(()=>t.importMechanismsData(invalid),/inválido/);
 assert.equal(t.savedMechanisms[0].joints[0].capacity,2000);
});
