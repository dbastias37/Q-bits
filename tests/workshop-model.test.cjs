const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const model=require('../assets/js/workshop.js');
const matter=require('../assets/js/campaign-reconfiguration.js');
const progress=n=>Object.fromEntries(Array.from({length:n},(_,i)=>['level'+(i+1),true]));
const all=()=>model.normalizeProfile({claimed:Array.from({length:20},(_,i)=>i+1),research:model.RESEARCH.map(item=>item.id)});
const part=()=>({id:42,shape:'cube',weight:1,mood:{name:'Ada',energy:.8,state:'neutral',blend:[1,0,0]}});
const near=(a,b)=>assert(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('workshop loads as a browser module and its finite research economy is reachable',()=>{
 const sandbox={};vm.runInNewContext(fs.readFileSync(require.resolve('../assets/js/workshop.js'),'utf8'),sandbox);
 assert.equal(typeof sandbox.QBitsWorkshop.planPartUpgrade,'function');
 assert(Object.isFrozen(model.RESEARCH));assert(model.RESEARCH.every(Object.isFrozen));
 assert.equal(model.RESEARCH.reduce((n,item)=>n+item.cost,0),236);
 const profile=all();assert.equal(profile.research.length,model.RESEARCH.length);assert.equal(profile.earned,240);assert.equal(profile.spent,236);assert.equal(profile.credits,4);assert.equal(profile.bench,3);
});
test('legacy campaign completion earns bounded credits once and replay does not grant them twice',()=>{
 const original=model.normalizeProfile(),first=model.awardCompleted(original,{level1:true,level2:true,level3:'true',level21:true});
 assert.equal(first.added,24);assert.deepEqual(first.awardedLevels,[1,2]);assert.equal(original.credits,0);
 const replay=model.awardCompleted(JSON.parse(JSON.stringify(first.profile)),{level1:true,level2:true});assert.equal(replay.added,0);assert.equal(replay.profile.credits,24);
 const inherited=Object.create({level4:true});assert.equal(model.awardCompleted(first.profile,inherited).added,0);
 const rest=model.awardCompleted(first.profile,progress(20));assert.equal(rest.added,216);assert.equal(rest.profile.credits,240);assert.equal(rest.profile.claimed.length,20);
});
test('research purchase validates bench, completion gates, prerequisites and balance without repeat charges',()=>{
 let profile=model.awardCompleted(null,progress(1)).profile;
 const before=JSON.stringify(profile),tooEarly=model.purchase(profile,'bench2');assert(!tooEarly.ok);assert.match(tooEarly.error,/nivel 8/);assert.equal(JSON.stringify(profile),before);
 const sensor=model.purchase(profile,'sensor');assert(sensor.ok);profile=sensor.profile;assert.equal(profile.credits,4);
 assert(!model.purchase(profile,'sensor').ok);assert.equal(model.purchase(profile,'sensor').profile.credits,4);
 assert(!model.purchase(profile,'battery2').ok);assert(!model.purchase(profile,'unknown').ok);
 profile=model.awardCompleted(profile,progress(8)).profile;const bench=model.purchase(profile,'bench2');assert(bench.ok);profile=bench.profile;
 for(const key of ['battery2','lightweight2','movement2']){const bought=model.purchase(profile,key);assert(bought.ok,bought.error);profile=bought.profile;}
 assert.equal(profile.credits,4);assert.equal(profile.bench,2);assert(!model.purchase(profile,'bench3').ok);
 profile=model.awardCompleted(profile,progress(16)).profile;profile=model.purchase(profile,'bench3').profile;
 const tier3=model.purchase(profile,'battery3');assert(tier3.ok);assert(!model.purchase(tier3.profile,'movement3').ok,'another branch requires more earned credits');
 assert.equal(model.availableResearch(tier3.profile).find(item=>item.id==='battery3').owned,true);
});
test('invalid saved balances, duplicate receipts and impossible research cannot create resources',()=>{
 const profile=model.normalizeProfile({credits:Infinity,earned:999999,spent:-1,claimed:[1,1,-2,0,21,1.5,'2',NaN],research:['bench3','battery3','sensor','sensor','unknown']});
 assert.deepEqual(profile.claimed,[1]);assert.deepEqual(profile.research,['sensor']);assert.equal(profile.earned,12);assert.equal(profile.spent,8);assert.equal(profile.credits,4);
 assert.equal(model.normalizeProfile({credits:10000}).credits,0);assert.equal(model.normalizeProfile(null).bench,1);
 assert.equal(model.normalizeProfile({claimed:[1],research:['movement2','battery2']}).research.length,0);
});
test('battery adaptations preserve stored joules through upgrades, save/load and a valid downgrade',()=>{
 const original=part(),before=JSON.stringify(original),profile=all();
 let adapted=model.planPartUpgrade(original,{battery:2},profile);assert(!adapted.error);near(adapted.capacity,30);near(adapted.part.mood.energy,16/30);near(adapted.storedJ,16);assert.equal(JSON.stringify(original),before);
 adapted=model.planPartUpgrade(JSON.parse(JSON.stringify(adapted.part)),{battery:3},profile);near(model.batteryCapacity(adapted.part),40);near(adapted.part.mood.energy,.4);near(adapted.storedJ,16);
 const reverted=model.planPartUpgrade(adapted.part,{battery:1},profile);near(reverted.part.mood.energy,.8);near(model.batteryCapacity(reverted.part),20);assert.equal(reverted.part.mood.workshop,undefined);
 const charged={...adapted.part,mood:{...adapted.part.mood,energy:.95}};const denied=model.planPartUpgrade(charged,{battery:1},profile);assert.match(denied.error,/energía actual/);near(charged.mood.energy,.95);
});
test('lightweight tiers conserve bound bench ballast and apply absolute, reversible mass and grip changes',()=>{
 const profile=all(),original=part();let adapted=model.planPartUpgrade(original,{lightweight:2},profile);assert(!adapted.error);near(adapted.part.weight,.9);near(adapted.materialDelta,.1);near(adapted.material.bench,.1);near(adapted.material.total,1);
 adapted=model.planPartUpgrade(adapted.part,{lightweight:3},profile);near(adapted.part.weight,.8);near(adapted.materialDelta,.1);near(adapted.material.bench,.2);
 const repeated=model.planPartUpgrade(adapted.part,{lightweight:3},profile);near(repeated.part.weight,.8);near(repeated.materialDelta,0);assert.equal(model.movementFactors(repeated.part).grip,.8);assert.equal(model.movementFactors(repeated.part).load,.7);
 assert.equal(model.hasAdaptation(repeated.part),true);const reverted=model.planPartUpgrade(repeated.part,{lightweight:1},profile);near(reverted.part.weight,1);near(reverted.materialDelta,-.2);assert.equal(model.hasAdaptation(reverted.part),false);assert.equal(reverted.part.mood.workshop,undefined);
 const seed=matter.identify(reverted.part),divided=matter.plan('divide',[seed]);assert(!divided.error);near(divided.outputs.reduce((n,p)=>n+p.weight,0),1);assert(divided.outputs.every(p=>!p.mood.workshop),'restoring strips ballast metadata before a safe ordinary division');
});
test('movement adds speed with an explicit energy tradeoff and sensor fitting preserves identity',()=>{
 const original=part(),profile=all(),before=JSON.stringify(profile);
 const result=model.planPartUpgrade(original,{sensor:true,movement:3},profile);assert(!result.error);assert.equal(result.part.id,42);assert.equal(result.part.shape,'cube');assert.equal(result.part.mood.name,'Ada');near(result.part.weight,1);near(result.part.mood.energy,.8);
 assert.deepEqual(model.movementFactors(result.part),{speed:1.2,energy:1.35,grip:1,load:1});assert.equal(result.cost,0);assert.equal(JSON.stringify(profile),before,'fitting unlocked research does not consume a finite currency again');
 assert.equal(model.partState(result.part).sensor,true);assert.equal(model.partState(result.part).ownerId,42);
});
test('corrupt, foreign, divided and production material cannot gain invalid adaptations',()=>{
 const profile=all(),base=part();assert(model.planPartUpgrade(base,{sensor:true},null).error);
 for(const patch of [{battery:4},{movement:NaN},{lightweight:0},{sensor:1},{unknown:true}])assert(model.planPartUpgrade(base,patch,profile).error);
 for(const invalid of [null,{...base,weight:-1},{...base,mood:{...base.mood,energy:Infinity}},{...base,id:NaN}])assert(model.planPartUpgrade(invalid,{sensor:true},profile).error);
 const adapted=model.planPartUpgrade(base,{battery:3,lightweight:3},profile).part;
 const clone={...adapted,id:99};assert(model.planPartUpgrade(clone,{sensor:true},profile).error);assert.equal(model.batteryCapacity(clone),20);assert.equal(model.hasAdaptation(clone),true);
 const forged={...adapted,weight:1};assert(model.planPartUpgrade(forged,{sensor:true},profile).error);
 const divided={...base,mood:{...base.mood,matter:{root:42,path:'0',rootWeight:1}}};assert(model.planPartUpgrade(divided,{lightweight:2},profile).error);
 const production={...base,mood:{...base.mood,production:{batch:'20:1'}}};assert(model.planPartUpgrade(production,{sensor:true},profile).error);
});
