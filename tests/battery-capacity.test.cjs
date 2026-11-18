const test = require('node:test');
const assert = require('node:assert/strict');
const power = require('../assets/js/rotor-power.js');
const base = { enabled:true, actualRpm:30, actualTorque:.15, maxTorque:.4, capacity:16, load:2, energyA:.8, energyB:.8 };
const near=(a,b,eps=1e-10)=>assert(Math.abs(a-b)<eps,`${a} != ${b}`);

test('unequal upgraded reservoirs supply equal joules with separate normalized debits',()=>{
 const result=power.evaluate({...base,capacityJoulesA:30,capacityJoulesB:20},2);
 near(result.drainA*30,result.drainB*20);
 near(result.drainA*30*2,result.spentJoules);
 near(result.energyA,.8-result.drainA);near(result.energyB,.8-result.drainB);
 near(result.drainPerSecondA*30,result.drainPerSecondB*20);
 near(result.drainPerSide*20*2,result.spentJoules);
 assert(result.drainA<result.drainB);
});

test('the lower absolute reserve stops the motor even when its percentage is higher',()=>{
 const result=power.evaluate({...base,capacityJoulesA:40,capacityJoulesB:20,energyA:.4,energyB:.5},1000);
 assert.equal(result.stopReason,'empty');near(result.spentJoules,20);
 near(result.energyA,.15);near(result.energyB,0);
 near(result.drainA,.25);near(result.drainB,.5);near(result.remainingSeconds,0);
 const next=power.evaluate({...base,capacityJoulesA:40,capacityJoulesB:20,energyA:result.energyA,energyB:result.energyB},1);
 assert.equal(next.stopReason,'empty');assert.equal(next.spentJoules,0);
});

test('capacity changes neither motor demand nor available energy when absolute charge is preserved',()=>{
 const ordinary=power.evaluate({...base,energyA:.6,energyB:.6},4);
 const upgraded=power.evaluate({...base,capacityJoulesA:40,capacityJoulesB:30,energyA:.3,energyB:.4},4);
 near(upgraded.inputWatts,ordinary.inputWatts);near(upgraded.spentJoules,ordinary.spentJoules);
 near(upgraded.energyA*40,ordinary.energyA*20);near(upgraded.energyB*30,ordinary.energyB*20);
 near(upgraded.remainingSeconds,ordinary.remainingSeconds);
});

test('upgraded capacity stays finite and bounded, with off and paused states spending no charge',()=>{
 for(const [input,expected] of [[undefined,20],[NaN,20],[Infinity,20],['30',20],[-1,20],[0,20],[100,100],[300,240]]){
  const state={...base,capacityJoulesA:input,capacityJoulesB:input};
  const result=power.evaluate(state,1);assert.equal(result.capacityJoulesA,expected);assert.equal(result.capacityJoulesB,expected);
  for(const value of Object.values(result))if(typeof value==='number')assert(Number.isFinite(value));
 }
 for(const state of [{...base,enabled:false,capacityJoulesA:40,capacityJoulesB:30},{...base,capacityJoulesA:40,capacityJoulesB:30}]){
  const result=power.evaluate(state,state.enabled?0:1000);near(result.energyA,.8);near(result.energyB,.8);assert.equal(result.drainA,0);assert.equal(result.drainB,0);assert.equal(result.spentJoules,0);
 }
});

test('unequal-reservoir exhaustion is independent of simulation step size',()=>{
 const initial={...base,capacityJoulesA:30,capacityJoulesB:40,energyA:.2,energyB:.4,actualTorque:.3,actualRpm:60};
 const whole=power.evaluate(initial,20);let state={...initial},spent=0;
 for(let i=0;i<4800;i++){const result=power.evaluate(state,1/240);spent+=result.spentJoules;state.energyA=result.energyA;state.energyB=result.energyB;}
 near(state.energyA,whole.energyA);near(state.energyB,whole.energyB);near(spent,whole.spentJoules);
 assert.equal(whole.stopReason,'empty');near(whole.spentJoules,12);
});

const createGame = require('./game-harness.cjs');
function workshopGame(){
 const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle',progress:Object.fromEntries(Array.from({length:20},(_,i)=>['level'+(i+1),true]))});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 t.setWorkshopProfile(sandbox.QBitsWorkshop.normalizeProfile({claimed:Array.from({length:20},(_,i)=>i+1),research:sandbox.QBitsWorkshop.RESEARCH.map(item=>item.id)}));t.setupWorkshop();return game;
}
function fittedCube(game,patch){
 const {t}=game,p=t.getWorkshopBench().p,g=t.addQubit([p.x,p.y+.055,p.z],1),id=g.parts[0].id;
 assert(t.applyWorkshopUpgrade(id,patch));return t.rotorPart(id).g;
}
function stepRuntime(t,seconds){for(let i=0;i<seconds*240;i++)t.stepPhysics(1/240);}

test('workshop fitting preserves stored joules and real rotor batteries pay equal joules with unequal capacities',()=>{
 const game=workshopGame(),{t,sandbox}=game,p=t.getWorkshopBench().p;
 const rotor=t.spawnRotor(t.V(p.x,p.y+.1,p.z),{mount:'fixed'});assert(rotor);
 const id=rotor.aId,old=t.rotorPart(id).part.mood.energy*120;assert(t.applyWorkshopUpgrade(id,{battery:3}));
 near(t.rotorPart(id).part.mood.energy*240,old);assert.equal(sandbox.QBitsWorkshop.batteryCapacity(t.rotorPart(rotor.bId).part),20);
 const before=[rotor.aId,rotor.bId].map((id,i)=>t.rotorPart(id).part.mood.energy*(i?120:240));
 assert(t.configureRotor(rotor,{enabled:true}));stepRuntime(t,1);
 const after=[rotor.aId,rotor.bId].map((id,i)=>t.rotorPart(id).part.mood.energy*(i?120:240));
 assert(after[0]<before[0]);near(before[0]-after[0],before[1]-after[1],1e-8);
 assert.equal(rotor.power.capacityJoulesA,240);assert.equal(rotor.power.capacityJoulesB,120);assert(rotor.power.drainA<rotor.power.drainB);
});

test('walking expenditure and passive recharge use fixed joules instead of granting a larger battery free energy',()=>{
 const game=workshopGame(),{t}=game,ordinary=fittedCube(game,{battery:1}),upgraded=fittedCube(game,{battery:3});
 for(const [i,g]of [ordinary,upgraded].entries()){
  g.body.position.set(i*.3,.045,0);g.moodLastPosition=g.body.position.clone();g.body.position.x+=.1;g.route={};Object.assign(g.parts[0].mood,{energy:.8,personality:.5});
 }
 t.updateMoods(.2);
 const spentOrdinary=(.8-ordinary.parts[0].mood.energy)*40,spentUpgraded=(.8-upgraded.parts[0].mood.energy)*80;
 assert(spentOrdinary>0);near(spentOrdinary,spentUpgraded);
 for(const g of [ordinary,upgraded]){g.route=null;g.moodLastPosition=g.body.position.clone();g.parts[0].mood.energy=.4;}
 t.updateMoods(.2);
 const gainedOrdinary=(ordinary.parts[0].mood.energy-.4)*40,gainedUpgraded=(upgraded.parts[0].mood.energy-.4)*80;
 assert(gainedOrdinary>0);near(gainedOrdinary,gainedUpgraded);
});

test('lightweight fitting changes real body mass and trades grip and hauling capacity while preserving matter',()=>{
 const game=workshopGame(),{t,sandbox}=game,ordinary=fittedCube(game,{lightweight:1}),light=fittedCube(game,{lightweight:3});
 near(ordinary.body.mass,.25);near(light.body.mass,.2);
 const material=sandbox.QBitsWorkshop.materialBalance(light.parts[0]);near(material.piece,.8);near(material.bench,.2);near(material.total,1);
 near(t.groupWorkUnits(ordinary),1);near(t.groupWorkUnits(light),.7);
 const grip=[];
 for(const g of [ordinary,light]){
  t.grabQubit({g,part:g.parts[0],point:g.body.position.clone(),distance:1});assert(t.getHeld());grip.push(t.getHeld().joint.equations[0].maxForce);t.releaseQubit();
 }
 near(grip[1]/grip[0],.8);
});

test('movement fitting advances a real planned route faster and spends more energy per travelled metre',()=>{
 function travel(tier){
  const game=workshopGame(),{t}=game,g=fittedCube(game,{movement:tier});g.body.position.set(0,.045,0);g.body.quaternion.set(0,0,0,1);g.body.velocity.set(0,0,0);g.body.aabbNeedsUpdate=true;g.parts[0].mood.energy=.8;
  assert(t.startRoute(g,t.V(2,0,0),true));game.navigationUntilIdle();assert(g.route);
  stepRuntime(t,2);assert(g.route);return {distance:g.body.position.x,energy:(.8-g.parts[0].mood.energy)*20};
 }
 const base=travel(1),enhanced=travel(3);assert(base.distance>.2);assert(enhanced.distance>base.distance*1.15);assert(enhanced.energy/enhanced.distance>base.energy/base.distance*1.2);
});
