const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

function lab(){
 const game=createGame(),{t,sandbox}=game;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});
 sandbox.document.body.dataset.booting='false';
 return {...game,field:name=>sandbox.document.querySelector('#'+name)};
}
function sensor(t,p){
 const g=t.addQubit(p),part=g.parts[0];
 part.mood.workshop={version:1,ownerId:part.id,sensor:true,battery:1,lightweight:1,movement:1,baseWeight:1,ballast:0};
 return {g,part,...t.rotorPart(part.id)};
}
function step(t,count){for(let i=0;i<count;i++)t.stepPhysics(1/120);}
function change(field,name,value){const node=field('sensor-'+name);node.value=String(value);node.dispatchEvent({type:'change'});}

test('P keeps Cannon and the arm moving and displays the effect of per-axis rpm',()=>{
 function run(rpm){
  const {t,field}=lab();t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V());
  const arm=t.robotArms[0],base=t.rotorPart(arm.baseId);t.setSelected(base);t.updateMechanismPanel();
  field('panel').hidden=false;t.switchPanelTab('mechanisms');
  assert(t.robotPanelAction('motor',{joint:0,rpm,maxTorque:4,capacity:64}).ok);
  assert(t.robotPanelAction('jog',{joint:0,degrees:90}).ok);
  assert.equal(field('panel').hidden,false);assert.equal(t.storySuspended(),false);
  assert(!t.robotPanelAction('motor',{joint:0,rpm:1,maxTorque:4,capacity:64}).ok);
  t.setRunning(true);const rotor=t.robotArmRotors(arm)[0];let highest=0;
  for(let i=1;i<=240;i++){t.frame(i*1000/120);highest=Math.max(highest,Math.abs(rotor.actualRpm||0));}
  assert(t.getSimTime()>.075);return highest;
 }
 const slow=run(24),fast=run(72);
 assert(slow>0&&fast>slow*1.5,'actual hinge speeds: '+[slow,fast]);
});

test('laser range, linkage, single rising edge and setup persist via the real panel',()=>{
 const {t,field}=lab(),hit=sensor(t,[0,.045,0]),rotor=t.spawnRotor(t.V(0,.3,.7),{mount:'fixed'});
 const box=t.addQubit([.8,.045,0]);t.showSensorMenu(hit);
 change(field,'mode','laser');change(field,'action','start');change(field,'target',rotor.id);
 change(field,'range',50);step(t,5);assert(!rotor.enabled);
 change(field,'range',100);step(t,12);assert(rotor.enabled);assert.equal(rotor.sensorPulses,1);
 const beam=t.sensorBeam(t.rotorPart(hit.part.id),100,new Set([hit.g.body]));
 assert(beam.distance>.6&&beam.distance<.8);
 let traces=0;const trace=t.world.raycastAll.bind(t.world);t.world.raycastAll=(...args)=>{traces++;return trace(...args);};
 t.drawWorkshop();assert.equal(traces,0);t.keys.add('AltLeft');t.drawWorkshop();assert.equal(traces,1);
 step(t,30);assert.equal(rotor.sensorPulses,1);
 const saved=t.saveLab().groups.flatMap(g=>g.parts).find(p=>p.id===hit.part.id);
 assert.equal(saved.mood.sensorConfig.range,100);assert.equal(saved.mood.sensorLink.aId,rotor.aId);
 assert(box.body.position.x>.7);
});

test('motion uses the configured minimum speed and ignores the stationary mount',()=>{
 const {t,field}=lab(),hit=sensor(t,[0,.045,0]),box=t.addQubit([.32,.045,0]);
 t.showSensorMenu(hit);change(field,'mode','motion');change(field,'speed',30);
 assert(!t.sensorReading(hit).active);step(t,5);
 box.body.velocity.x=.2;assert(!t.sensorReading(hit).active);step(t,5);
 box.body.velocity.x=.6;assert(t.sensorReading(hit).active);
});

test('weight measures a resting load once and clears when lifted',()=>{
 const {t,field}=lab(),hit=sensor(t,[0,.045,0]),box=t.addQubit([0,.14,0]);
 t.showSensorMenu(hit);change(field,'mode','weight');change(field,'weight',2);
 box.parts[0].weight=3;
 for(let i=0;i<240;i++){step(t,1);t.sensorReading(t.rotorPart(hit.part.id));}
 let reading=t.sensorReading(t.rotorPart(hit.part.id));assert.equal(reading.value,3);assert(reading.active);
 box.body.position.y+=.25;box.body.wakeUp();box.body.aabbNeedsUpdate=true;step(t,1);
 assert(!t.sensorReading(t.rotorPart(hit.part.id)).active);
});

test('a lab motor draws the same watts and runs three times as long at identical shaft load',()=>{
 const {t}=lab(),r=t.spawnRotor(t.V(0,.4,0),{mount:'fixed'});assert(t.configureRotor(r,{enabled:true}));
 r.actualTorque=.2;r.actualRpm=30;const now=t.rotorPowerState(r),a=t.rotorPart(r.aId).part;
 const formerSeconds=2*40*a.mood.energy/now.inputWatts;
 assert(Math.abs(now.remainingSeconds/formerSeconds-3)<1e-9);
});

test('a beam starts a complete arm and a second beam stops all its joints',()=>{
 const {t,field}=lab();
 t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V());
 const arm=t.robotArms[0],rotor=t.robotArmRotors(arm)[1];
 for(const [z,action] of [[.8,'start'],[1.4,'stop']]){
  const hit=sensor(t,[-.8,.045,z]);t.showSensorMenu(hit);
  change(field,'mode','laser');change(field,'target',rotor.id);change(field,'action',action);
 }
 t.addQubit([-.48,.045,.8]);step(t,4);assert(arm.running);assert(t.robotArmRotors(arm).every(r=>r.enabled));
 t.addQubit([-.48,.045,1.4]);step(t,10);assert(!arm.running);assert(t.robotArmRotors(arm).every(r=>!r.enabled));
});
test('weight detects a stack already asleep when the sensor is configured',()=>{
 const {t,field}=lab(),hit=sensor(t,[0,.045,0]);
 const boxes=[.135,.225].map(y=>t.addQubit([0,y,0]));
 step(t,240);for(const g of [hit.g,...boxes])g.body.sleep();step(t,2);
 t.showSensorMenu(hit);change(field,'mode','weight');change(field,'weight',2);
 assert.equal(t.sensorReading(t.rotorPart(hit.part.id)).value,2);
});
