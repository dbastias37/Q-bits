const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const Power=require('../assets/js/rotor-power.js');

function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;}
function battery(t,part,energy=.5,enabled=true,packId=part.id){part.mood.externalBattery={version:1,ownerId:part.id,packId,enabled};part.mood.energy=energy;assert(t.isExternalBattery(part));return part;}
function fixture(t,count=4,cellCount=2,height=.3){
 const parts=Array.from({length:count},(_,i)=>({id:t.allocateUnitId(),shape:'coupler',weight:1,p:t.V(i*.09,height,0),q:t.Q()}));
 for(let i=0;i<cellCount;i++)parts.push({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(-(i+1)*.09,height-.09*5/56,0),q:t.Q()});
 const base=t.makeGroup(parts),cells=base.parts.filter(p=>p.shape==='cube');cells.forEach(p=>battery(t,p,.6,true,cells[0].id));
 const flip=t.Q();flip.setFromAxisAngle(t.V(0,0,1),Math.PI);const rotors=[];
 for(const [i,part]of base.parts.filter(p=>p.shape==='coupler').entries()){
  const endpoint=t.makeGroup([{id:t.allocateUnitId(),shape:'coupler',weight:1,p:t.V(i*.09,height+2*.09*51/56,0),q:flip.clone()}]);
  const r=t.connectRotorTips(part.id,endpoint.parts[0].id,{rpm:30+i,capacity:256});assert(r);rotors.push(r);part.mood.energy=.2+i*.1;endpoint.parts[0].mood.energy=.7-i*.1;
 }
 return {base,cells,rotors};
}
const internal=t=>t.rotors.flatMap(r=>[t.rotorPart(r.aId).part.mood.energy,t.rotorPart(r.bId).part.mood.energy]);
const joules=(t,cells)=>cells.reduce((sum,p)=>sum+p.mood.energy*t.externalBatteryCapacity(p),0);
const close=(actual,expected,epsilon=1e-8)=>assert(Math.abs(actual-expected)<=epsilon,`${actual} != ${expected}`);
function start(t,rotors){assert(t.configureRotorSet({rotorIds:rotors.map(r=>r.id)},{enabled:true}));t.prepareRotorPower();rotors.forEach((r,i)=>{r.actualTorque=.12+i*.03;r.actualRpm=35+i*7;r.stalled=false;});}

test('external demand ignores empty internal reservoirs and never reports an internal debit',()=>{
 const state={enabled:true,maxTorque:.4,load:8,capacity:32,actualTorque:.2,actualRpm:50,energyA:0,energyB:0};
 const result=Power.evaluateExternal(state,{capacity:240,storedJ:120},2);assert.equal(result.stopReason,null);assert(result.inputWatts>0);close(result.spentJoules,result.inputWatts*2);assert.equal(result.drainA,0);assert.equal(result.drainB,0);assert.equal(result.energyA,0);
 const empty=Power.evaluateExternal(state,{capacity:240,storedJ:0},2);assert.equal(empty.stopReason,'empty');assert.equal(empty.spentJoules,0);
 const overloaded=Power.evaluateExternal({...state,capacity:2},{capacity:240,storedJ:120},2);assert.equal(overloaded.stopReason,'overload');assert.equal(overloaded.spentJoules,0);
 for(const dt of [0,-1,NaN])assert.equal(Power.evaluateExternal(state,{capacity:240,storedJ:120},dt).spentJoules,0);
});

test('four connected motors share one battery pool with exact aggregate expenditure and intact internals',()=>{
 const {t}=lab(),{cells,rotors}=fixture(t),beforeJ=joules(t,cells),beforeInternal=internal(t);start(t,rotors);
 const watts=rotors.reduce((sum,r)=>sum+t.rotorPowerState(r).inputWatts,0);t.updateRotorPower(1.25);
 close(beforeJ-joules(t,cells),watts*1.25);close(rotors.reduce((sum,r)=>sum+r.power.spentJoules,0),watts*1.25);assert.deepEqual(internal(t),beforeInternal);
 assert(rotors.every(r=>r.power.external&&r.power.drainA===0&&r.power.drainB===0));assert.equal(t.externalBatterySummary(rotors[0]).capacity,240);
});

test('pool debit is proportional to stored joules and independent of rotor iteration order',()=>{
 function run(reverse){const {t}=lab(),{cells,rotors}=fixture(t);cells[0].mood.energy=.8;cells[1].mood.energy=.2;start(t,rotors);if(reverse)t.rotors.reverse();t.updateRotorPower(2);return cells.map(p=>p.mood.energy);}
 const forward=run(false),reverse=run(true);forward.forEach((value,i)=>close(value,reverse[i],1e-12));close(forward[0]/forward[1],4);
});

test('only physically connected active cells supply a motor, regardless of control-set membership',()=>{
 const {t}=lab(),{cells,rotors}=fixture(t,1,1),remote=t.spawnRotor(t.V(3,0,0),{capacity:256});assert(remote);
 t.createRotorSet('Dos máquinas',[rotors[0],remote]);assert.equal(t.externalBatterySummary(rotors[0]).active,true);assert.equal(t.externalBatterySummary(remote).active,false);
 const loose=t.addQubit([4,.045,0]);battery(t,loose.parts[0],1,true,cells[0].mood.externalBattery.packId);assert.equal(t.externalBatteryCells(remote).length,0);
 cells[0].mood.externalBattery.enabled=false;assert.equal(t.externalBatteryCells(rotors[0]).length,0);assert.equal(t.rotorPowerState(rotors[0]).external,undefined);
});

test('an empty active external battery blocks internal fallback until explicitly disabled',()=>{
 const {t}=lab(),{cells,rotors}=fixture(t,1,1),r=rotors[0];cells[0].mood.energy=0;
 assert.equal(t.configureRotor(r,{enabled:true}),false);assert.equal(r.stopReason,'empty');assert.equal(t.externalBatterySummary(r).active,true);
 cells[0].mood.externalBattery.enabled=false;assert(t.configureRotor(r,{enabled:true}));t.prepareRotorPower();r.actualTorque=.2;r.actualRpm=40;const before=internal(t);t.updateRotorPower(1);
 assert(internal(t).every((value,i)=>value<before[i]));assert.equal(cells[0].mood.energy,0,'a mounted battery above the floor does not recharge');
});

test('shared exhaustion spends the remaining reserve once and stops every supplied motor together',()=>{
 const {t}=lab(),{cells,rotors}=fixture(t),beforeInternal=internal(t);cells.forEach(p=>p.mood.energy=.001/240);const before=joules(t,cells);start(t,rotors);t.updateRotorPower(1);
 assert(cells.every(p=>p.mood.energy===0));assert(rotors.every(r=>!r.enabled&&r.stopReason==='empty'&&!r.constraint.motorEquation.enabled));close(rotors.reduce((sum,r)=>sum+r.power.spentJoules,0),before,1e-12);assert.deepEqual(internal(t),beforeInternal);
 assert.equal(t.configureRotorSet({rotorIds:rotors.map(r=>r.id)},{enabled:true}),false);assert(rotors.every(r=>!r.enabled));
});

test('external expenditure and depletion are independent of time subdivision',()=>{
 function run(parts){const {t}=lab(),{cells,rotors}=fixture(t);cells.forEach(p=>p.mood.energy=.04);start(t,rotors);for(const dt of parts)t.updateRotorPower(dt);return {stored:joules(t,cells),enabled:rotors.map(r=>r.enabled)};}
 const whole=run([3]),subdivided=run(Array(30).fill(.1));close(whole.stored,subdivided.stored);assert.deepEqual(whole.enabled,subdivided.enabled);
 const empty=run([100]),emptySteps=run(Array(100).fill(1));close(empty.stored,0);close(emptySteps.stored,0);assert.deepEqual(empty.enabled,emptySteps.enabled);
});

test('ordinary mood and cooler recovery cannot change external charge or frozen internal reserves',()=>{
 const {t}=lab(),cooler=t.createCooler(t.V(0,0,0));assert(cooler);cooler.capacity=10;cooler.coolSeconds=.001;
 const {cells,rotors}=fixture(t,1,1,.06),beforeInternal=internal(t);cells[0].mood.energy=.85;cells[0].mood.state='neutral';cells[0].mood.idle=0;
 t.updateCooling(100);t.updateMoods(100);assert.equal(cells[0].mood.energy,.85);assert.equal(cells[0].mood.state,'neutral');assert.equal(cells[0].mood.idle,0);assert.deepEqual(internal(t),beforeInternal);
 cells[0].mood.externalBattery.enabled=false;t.updateMoods(1);assert(internal(t).some((value,i)=>value>beforeInternal[i]));
});

test('disabled grounded cells recharge at four joules per second in the lab with finite capacity',()=>{
 const {t}=lab(),g=t.addQubit([0,.045,0]),part=battery(t,g.parts[0],0,false);assert.equal(t.externalBatteryCapacity(part),120);assert.equal(t.gameBatteryCapacity(part),120);
 t.rechargeExternalBatteries(15);close(part.mood.energy,.5);t.rechargeExternalBatteries(15);close(part.mood.energy,1);t.rechargeExternalBatteries(100);assert.equal(part.mood.energy,1);
 t.story.scene='campaign';assert.equal(t.externalBatteryCapacity(part),60);part.mood.energy=0;t.rechargeExternalBatteries(15);close(part.mood.energy,.5);
});

test('charge requires direct cell-to-floor support, rest, disabled state and a stopped physical network',()=>{
 const {t}=lab(),g=t.addQubit([0,.045,0]),part=battery(t,g.parts[0],0,false);
 const guards=[
  ()=>{part.mood.externalBattery.enabled=true;return()=>part.mood.externalBattery.enabled=false;},
  ()=>{g.body.position.y=.2;return()=>g.body.position.y=.045;},
  ()=>{g.body.velocity.x=.1;return()=>g.body.velocity.x=0;},
  ()=>{g.body.angularVelocity.x=.1;return()=>g.body.angularVelocity.x=0;},
  ()=>{t.setHeld({g,items:[{g}]});return()=>t.setHeld(null);},
  ()=>{g.route={};return()=>g.route=null;},
  ()=>{g.haulJob={};return()=>g.haulJob=null;},
  ()=>{g.blueprintJob={};return()=>g.blueprintJob=null;}
 ];
 for(const guard of guards){const reset=guard();t.rechargeExternalBatteries(10);assert.equal(part.mood.energy,0);reset();}
 for(const dt of [0,-1,NaN,Infinity]){t.rechargeExternalBatteries(dt);assert.equal(part.mood.energy,0);}
 const second=lab(),f=fixture(second.t,1,1,.045+.09*5/56),cell=f.cells[0];cell.mood.externalBattery.enabled=false;cell.mood.energy=0;assert(second.t.configureRotor(f.rotors[0],{enabled:true}));second.t.rechargeExternalBatteries(10);assert.equal(cell.mood.energy,0);
 second.t.configureRotor(f.rotors[0],{enabled:false});second.t.rechargeExternalBatteries(10);close(cell.mood.energy,1/3);
});

test('a vertical three-cell physical battery recharges all cells through its own bottom cell',()=>{
 const {t}=lab(),g=t.makeGroup([.045,.135,.225].map(y=>({id:t.allocateUnitId(),weight:1,shape:'cube',p:t.V(0,y,0),q:t.Q()})));
 g.parts.forEach(p=>battery(t,p,0,false,g.parts[0].id));t.rechargeExternalBatteries(3);g.parts.forEach(p=>close(p.mood.energy,.1));
 g.parts[2].mood.externalBattery.enabled=true;t.rechargeExternalBatteries(3);g.parts.forEach(p=>close(p.mood.energy,.1));
});

test('battery fragments cannot recharge through a chassis or another disconnected fragment with the same pack ID',()=>{
 const {t}=lab(),g=t.makeGroup([.045,.135,.225].map(y=>({id:t.allocateUnitId(),weight:1,shape:'cube',p:t.V(0,y,0),q:t.Q()}))),bottom=battery(t,g.parts[0],0,false),top=battery(t,g.parts[2],0,false,bottom.id);
 t.rechargeExternalBatteries(3);close(bottom.mood.energy,.1);assert.equal(top.mood.energy,0);
 delete bottom.mood.externalBattery;top.mood.energy=0;t.rechargeExternalBatteries(3);assert.equal(top.mood.energy,0,'normal chassis floor contact never charges an elevated battery');
});

test('invalid or incompatible battery metadata cannot become an external power source',()=>{
 const {t}=lab(),g=t.addQubit([0,.045,0]),part=battery(t,g.parts[0]),valid=JSON.parse(JSON.stringify(part.mood));
 const mutations=[p=>p.mood.externalBattery.ownerId++,p=>p.mood.externalBattery.packId=0,p=>p.mood.externalBattery.version=2,p=>p.mood.externalBattery.enabled=1,p=>p.shape='coupler',p=>p.mood.production={},p=>p.mood.matter={},p=>p.mood.workshop={invalid:true},p=>p.mood.energy=NaN,p=>p.mood.energy=1.1];
 for(const mutate of mutations){part.shape='cube';part.mood=JSON.parse(JSON.stringify(valid));mutate(part);assert.equal(t.externalBatteryState(part),null);assert.equal(t.externalBatteryCapacity(part),0);assert.equal(t.externalBatteryCells([g]).length,0);}
});

test('real simulation runs a shared rotor chassis on external charge with exhausted internal cells',()=>{
 const {t}=lab(),{cells,rotors}=fixture(t);for(const r of rotors){t.rotorPart(r.aId).part.mood.energy=0;t.rotorPart(r.bId).part.mood.energy=0;}
 const before=joules(t,cells);start(t,rotors);for(let i=0;i<240;i++)t.stepPhysics(1/240);
 assert(joules(t,cells)<before);assert(rotors.every(r=>r.enabled&&r.power.external));assert(internal(t).every(value=>value===0));
});
