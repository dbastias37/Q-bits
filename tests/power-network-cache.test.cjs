const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const createGame=require('./game-harness.cjs');

// Optional A/B input for this regression file; normal runs always use game.js.
const comparisonSource=process.env.QBITS_NETWORK_BASELINE_SOURCE
 ?fs.readFileSync(process.env.QBITS_NETWORK_BASELINE_SOURCE,'utf8'):null;
const near=(a,b,epsilon=1e-8)=>assert(Math.abs(a-b)<=epsilon,`${a} != ${b}`);
const ids=cells=>Array.from(cells,part=>part.id);
function lab(){
 const game=createGame({graphics:false,...(comparisonSource?{gameSource:comparisonSource}:{})}),{t,sandbox}=game;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;
}
function cached(t,run){
 t.setStepCache({parts:null,components:new Map()});
 try{return run();}finally{t.setStepCache(null);}
}
function spool(t,count=4){
 const parts=[];
 for(let i=0;i<count;i++){const g=t.addQubit([5+i*.14,.05,5],1);parts.push(...t.worldParts(g));t.removeGroup(g);}
 return parts;
}
function wire(t,from,to,materials=spool(t)){
 const result=t.connectPowerCable(from,to,[],materials);assert(result.ok,result.error);return result.cable;
}
function reservoirPort(r){return {kind:'reservoir',id:r.id};}
function rotorPort(r){return {kind:'part',id:r.aId};}
function chassis(t,count=4,cellCount=2){
 const parts=Array.from({length:count},(_,i)=>({id:t.allocateUnitId(),shape:'coupler',weight:1,p:t.V(i*.09,.3,0),q:t.Q()}));
 for(let i=0;i<cellCount;i++)parts.push({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(-(i+1)*.09,.3-.09*5/56,0),q:t.Q()});
 const base=t.makeGroup(parts),cells=base.parts.filter(p=>p.shape==='cube'),leaves=[],rotors=[];
 for(const cell of cells){cell.mood.externalBattery={version:1,ownerId:cell.id,packId:cells[0].id,enabled:true};cell.mood.energy=.6;}
 const flip=t.Q();flip.setFromAxisAngle(t.V(0,0,1),Math.PI);
 for(const [i,part]of base.parts.filter(p=>p.shape==='coupler').entries()){
  const leaf=t.makeGroup([{id:t.allocateUnitId(),shape:'coupler',weight:1,p:t.V(i*.09,.3+2*.09*51/56,0),q:flip.clone()}]);
  const rotor=t.connectRotorTips(part.id,leaf.parts[0].id,{rpm:30+i,capacity:256});assert(rotor);
  leaves.push(leaf);rotors.push(rotor);
 }
 return {base,cells,leaves,rotors};
}
function start(t,rotors){
 assert(t.configureRotorSet({rotorIds:rotors.map(r=>r.id)},{enabled:true}));
 t.prepareRotorPower();
 for(const [i,r]of rotors.entries()){r.actualTorque=.12+i*.003;r.actualRpm=32+i;r.stalled=false;}
}
function internal(t){return Array.from(t.rotors).flatMap(r=>[t.rotorPart(r.aId).part.mood.energy,t.rotorPart(r.bId).part.mood.energy]);}

test('cached sources expose each gripper, traction and motor debit in the same substep',()=>{
 const {t}=lab(),r=t.createPowerReservoir(t.V(),{enabled:true,energy:.1}),motor=t.spawnRotor(t.V(-2,0,2),{capacity:256});assert(r&&motor);
 assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight'),t.V(2,0,2)));const conveyor=t.conveyors.at(-1);
 const gripper=t.addQubit([0,.4,3]),part=gripper.parts[0];assert(t.configureGripper(part.id));
 for(const id of [motor.aId,conveyor.baseId,part.id])wire(t,reservoirPort(r),{kind:'part',id});
 assert(t.startConveyor(conveyor));assert(t.configureRotor(motor,{enabled:true}));t.prepareRotorPower();
 for(const rotor of t.rotors){rotor.actualTorque=.12;rotor.actualRpm=32;rotor.stalled=false;}
 const beforeInternal=internal(t),beforeGrip=part.mood.energy;
 cached(t,()=>{
  const before=t.externalBatterySummary(motor).storedJ;
  t.externalBatterySummary(gripper);t.externalBatterySummary(t.rotorPart(conveyor.baseId).g);
  const watts=t.rotors.reduce((sum,rotor)=>sum+t.rotorPowerState(rotor).inputWatts,0);
  assert(t.spendGripperEnergy(t.rotorPart(part.id),2));near(t.externalBatterySummary(motor).storedJ,before-2);
  assert(t.conveyorSpendTraction(conveyor,3));near(t.externalBatterySummary(gripper).storedJ,before-5);
  t.updateRotorPower(.5);near(t.externalBatterySummary(motor).storedJ,before-5-watts*.5);
  r.cell.mood.energy=1/r.capacity;
  assert.equal(t.spendGripperEnergy(t.rotorPart(part.id),2),false);
  assert.equal(t.conveyorSpendTraction(conveyor,2),false);near(t.externalBatterySummary(motor).storedJ,1);
  t.updateRotorPower(100);assert.equal(r.cell.mood.energy,0);
  assert(t.rotors.every(rotor=>!rotor.enabled&&rotor.stopReason==='empty'));
  assert.equal(t.externalBatterySummary(motor).active,true,'an exhausted enabled source still blocks internal fallback');
  assert.equal(t.spendGripperEnergy(t.rotorPart(part.id),.1),false);
  assert.equal(t.conveyorSpendTraction(conveyor,.1),false);
 });
 assert.deepEqual(internal(t),beforeInternal);assert.equal(part.mood.energy,beforeGrip);
});

test('an unwired cached battery pool rereads charge and explicit source toggles without internal fallback',()=>{
 const {t}=lab(),{cells,rotors}=chassis(t,3,2);start(t,rotors);const beforeInternal=internal(t);
 cached(t,()=>{
  const initial=t.externalBatterySummary(rotors[0]);assert.equal(initial.capacity,3600);
  const watts=rotors.reduce((sum,r)=>sum+t.rotorPowerState(r).inputWatts,0);
  t.updateRotorPower(.5);near(t.externalBatterySummary(rotors[1]).storedJ,initial.storedJ-watts*.5);
  t.updateRotorPower(1e6);assert(cells.every(p=>p.mood.energy===0));
  assert(t.externalBatterySummary(rotors[2]).active);assert(rotors.every(r=>!r.enabled&&r.stopReason==='empty'));
  assert.equal(t.configureRotor(rotors[0],{enabled:true}),false);
  assert(t.toggleExternalBattery(cells[0].id,false));assert.equal(t.externalBatterySummary(rotors[0]).active,false);
  assert(t.configureRotor(rotors[0],{enabled:true}));assert(t.toggleExternalBattery(cells[0].id,true));
  assert.equal(t.externalBatterySummary(rotors[0]).active,true);
  assert.equal(t.configureRotor(rotors[0],{enabled:true}),false);
 });
 assert.deepEqual(internal(t),beforeInternal);
});

test('cached supply follows a rotor split, reconnection and source-body removal within the same substep',()=>{
 const {t}=lab(),{base,cells,leaves,rotors}=chassis(t,2,1),rotor=rotors[1],leaf=leaves[1],cellId=cells[0].id;
 cached(t,()=>{
  assert.deepEqual(ids(t.externalBatteryCells(leaf)),[cellId]);
  assert(t.disconnectRotor(rotor));assert.deepEqual(ids(t.externalBatteryCells(leaf)),[]);
  assert.deepEqual(ids(t.externalBatteryCells(base)),[cellId]);
  const replacement=t.connectRotorTips(rotor.aId,rotor.bId,{capacity:256});assert(replacement);
  assert.deepEqual(ids(t.externalBatteryCells(leaf)),[cellId]);
  t.removeGroup(base);assert.deepEqual(ids(t.externalBatteryCells(leaf)),[]);
  assert.deepEqual(ids(t.externalBatteryCells([base,leaf,base,null])),[],'removed bodies cannot retain an old source');
 });
 assert(t.groups.includes(leaf));assert.equal(leaf.parts[0].id,rotor.bId);
});

test('cached cable networks follow bridge creation, removal, rerouting and reservoir removal immediately',()=>{
 const {t}=lab(),r=t.createPowerReservoir(t.V(),{enabled:true}),a=t.spawnRotor(t.V(-1,0,2)),b=t.spawnRotor(t.V(1,0,2));assert(r&&a&&b);
 const feed=wire(t,reservoirPort(r),rotorPort(a)),bridgeMaterial=spool(t);
 cached(t,()=>{
  assert.deepEqual(ids(t.getCableSupply(a)),[r.cell.id]);assert.deepEqual(ids(t.getCableSupply(b)),[]);
  const bridge=wire(t,rotorPort(a),rotorPort(b),bridgeMaterial);
  assert.deepEqual(ids(t.getCableSupply(b)),[r.cell.id]);
  const returned=t.removePowerCable(bridge);assert.equal(returned.length,bridgeMaterial.length);
  assert.deepEqual(ids(t.getCableSupply(b)),[]);assert.deepEqual(ids(t.getCableSupply(a)),[r.cell.id]);
  const reroute=t.reroutePowerCable(feed,rotorPort(b));assert(reroute.ok,reroute.error);
  assert.deepEqual(ids(t.getCableSupply(a)),[]);assert.deepEqual(ids(t.getCableSupply(b)),[r.cell.id]);
  wire(t,rotorPort(a),rotorPort(b),returned);assert.deepEqual(ids(t.getCableSupply(a)),[r.cell.id]);
  assert(t.removePowerReservoir(r));assert.deepEqual(ids(t.getCableSupply(a)),[]);assert.deepEqual(ids(t.getCableSupply(b)),[]);
 });
});

test('cached candidate sources stay live, deduplicated and isolated from mutations of returned arrays',()=>{
 const {t}=lab(),{base,cells,leaves,rotors}=chassis(t,3,2),r=t.createPowerReservoir(t.V(-2,0,0),{enabled:true});assert(r);
 wire(t,reservoirPort(r),rotorPort(rotors[0]));cells[0].mood.externalBattery.enabled=false;
 cached(t,()=>{
  const expected=[r.cell.id,cells[1].id],first=t.externalBatteryCells(base);
  assert.deepEqual(ids(first),expected);first.length=0;
  const second=t.getCableSupply(rotors[2]);assert.deepEqual(ids(second),expected);second.reverse();second.pop();
  assert.deepEqual(ids(t.externalBatteryCells([leaves[2],base,leaves[0],base])),expected);
  cells[0].mood.externalBattery.enabled=true;
  assert.deepEqual(ids(t.externalBatteryCells(rotors[1])),[r.cell.id,...ids(cells)]);
  r.enabled=false;assert.deepEqual(ids(t.externalBatteryCells(base)),ids(cells));
  cells[1].mood.externalBattery.ownerId++;
  assert.deepEqual(ids(t.externalBatteryCells(base)),[cells[0].id],'candidate metadata must still be validated live');
  cells[1].mood.externalBattery.ownerId=cells[1].id;r.enabled=true;
  assert.deepEqual(ids(t.externalBatteryCells(base)),[r.cell.id,...ids(cells)]);
 });
});

function armAndConveyor(t){
 assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight'),t.V()));const conveyor=t.conveyors[0];
 assert(t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V(2,0,0)));const arm=t.robotArms[0];
 const source=t.rotorPart(arm.baseId).g,target=t.rotorPart(conveyor.baseId),from=t.poses(source).filter(p=>p.part.shape==='cube').sort((a,b)=>a.p.x-b.p.x||b.p.z-a.p.z)[0];
 const shift=target.p.vadd(t.V(0,.09,0)).vsub(from.p);
 assert(t.weld({source,target:target.g,position:source.body.position.vadd(shift),quaternion:t.Q()}));
 const g=t.addQubit([.225,.318,.27]),part=g.parts[0];part.mood.energy=.9;
 part.mood.externalBattery={version:1,ownerId:part.id,packId:part.id,enabled:true};
 assert(t.weld({source:g,target:t.rotorPart(conveyor.baseId).g,position:g.body.position.clone(),quaternion:t.Q()}));
 return {arm,conveyor};
}
test('shared static mass does not freeze the distinct arm and conveyor loads during grab and release',()=>{
 const {t}=lab(),{arm,conveyor}=armAndConveyor(t),armMotor=t.robotArmRotors(arm)[1],beltMotor=t.conveyorRotors(conveyor)[0];
 const point=t.robotKinematics(arm).point,payload=t.addQubit([point.x,point.y-.06,point.z],2);
 const matter=Array.from(t.groups).flatMap(g=>ids(g.parts));
 cached(t,()=>{
  assert.equal(t.rotorPowerState(armMotor).load,0);assert.equal(t.rotorPowerState(beltMotor).load,57);
  assert(t.gripperGrab(arm.gripperId));assert.equal(t.robotGrips.get(arm.gripperId).g,payload);
  assert.equal(t.rotorPowerState(armMotor).load,2);assert.equal(t.rotorPowerState(beltMotor).load,59);
  assert(t.releaseGripper(arm.gripperId));
  assert.equal(t.rotorPowerState(armMotor).load,0);assert.equal(t.rotorPowerState(beltMotor).load,57);
 });
 assert.deepEqual(Array.from(t.groups).flatMap(g=>ids(g.parts)),matter);
});

test('cached mass preserves each rotor seed order and rereads changed weights on the next substep',()=>{
 const {t}=lab(),{rotors}=chassis(t,6,0),weights=[1/3,.7,Math.PI,.25,.3,8.1,.4,2/3];
 for(const [i,part]of t.groups.flatMap(g=>g.parts).entries())part.weight=weights[i%weights.length];
 const check=()=>{
  for(const r of rotors){
   const members=t.rotorConnectedGroups(t.rotorGroups(r));
   const expected=members.reduce((sum,g)=>sum+g.parts.reduce((weight,p)=>weight+p.weight,0),0);
   assert.equal(t.rotorPowerState(r).load,expected,'group mass caching must preserve the outer floating-point sum order');
  }
 };
 cached(t,check);t.groups[0].parts[0].weight+=.25;cached(t,check);
});

test('reading all motors shares body weights and candidate discovery with linear work',()=>{
 const {t}=lab(),{rotors}=chassis(t,32,2),parts=Array.from(t.groups).flatMap(g=>Array.from(g.parts));
 let weightReads=0,candidateReads=0;const restore=[];
 function observe(object,key,onRead){
  const descriptor=Object.getOwnPropertyDescriptor(object,key);let value=object[key];
  Object.defineProperty(object,key,{configurable:true,enumerable:descriptor?.enumerable??true,get(){onRead();return value;},set(next){value=next;}});
  restore.push(()=>{if(descriptor)Object.defineProperty(object,key,descriptor);else delete object[key];});
 }
 for(const part of parts){observe(part,'weight',()=>weightReads++);observe(part.mood,'externalBattery',()=>candidateReads++);}
 try{
  cached(t,()=>{for(let pass=0;pass<2;pass++)for(const rotor of rotors)t.rotorPowerState(rotor);});
  // Count actual hot-data reads, not elapsed time or a particular helper name.
  // The allowance includes live validation and charge reads for the two cells.
  const queries=rotors.length*2,limit=parts.length*4+queries*16;
  assert(weightReads<=limit,`${weightReads} weight reads for ${parts.length} pieces and ${rotors.length} motors`);
  assert(candidateReads<=limit,`${candidateReads} battery metadata reads for ${parts.length} pieces and ${rotors.length} motors`);
 }finally{for(const reset of restore)reset();}
});
