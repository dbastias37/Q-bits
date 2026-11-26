'use strict';
// Isolated B fixtures pay for every extraction and conversion. The twelve A
// receipts are model fixtures, not an end-to-end run through the first line.
// Queue staging below supplies/clears the workstation between transfers; the
// arm itself must lift, carry and release every credited payload with Cannon.
const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const saves=require('../assets/js/save-games.js');
const restingPose=require('./fixtures/galpon-arm-resting-pose.json');
const dockedPose=require('./fixtures/galpon-arm-docked-pose.json');
const parkedPose=require('./fixtures/galpon-arm-parked-pose.json');
const plain=value=>JSON.parse(JSON.stringify(value));
const near=(a,b,epsilon=1e-7)=>assert(Math.abs(a-b)<epsilon,a+' != '+b);
function memory(){const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))};}

function fixture({withArm=true,storage=memory()}={}){
 const game=createGame({graphics:false,storage}),{t,sandbox}=game,G=sandbox.QBitsGalponProduction,C=sandbox.QBitsGalponChain;
 t.beginHangarGame({workers:4});t.story.ready=true;t.hideStoryDialogue();sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 const s=t.story.galpon,worker=s.initialIds[0];let slot=0;
 function make(shape='cube',credited=false,point=null){
  const id=t.allocateUnitId();G.tick(s,1);assert(G.extract(s,id));assert(G.take(s,id,worker));assert(G.store(s,id,worker));
  assert(G.start(s,'converter',id,'cube'));G.tick(s,1);G.finish(s,'converter');G.tick(s,12);
  if(shape==='coupler'){assert(G.start(s,'former',id,'coupler'));G.tick(s,1);G.finish(s,'former');G.tick(s,12);}
  if(credited){G.tick(s,.5,{activeCoolingIds:[id]});assert(G.receive(s,[id],'family:1'));assert(G.markReleased(s,[id],'family:1'));}
  const at=point||t.V(-5.2+(slot%8)*.17,.07,2.4+Math.floor(slot++/8)*.17),g=t.hangarMakePart(G.record(s,id),at);assert(g);return g;
 }
 // Insertion order reserves the arm's material before the twelve workpieces.
 if(withArm){for(let i=0;i<18;i++)make();for(let i=0;i<8;i++)make('coupler');}
 const credited=Array.from({length:12},()=>make('cube',true));C.ensure(s);t.initHangarChainWorld();t.hideStoryDialogue();
 const w=t.getHangarChainWorld();let arm=null,pickup=null;
 if(withArm){
  assert(t.buildHangarChainMechanism('arm'),w.message);arm=t.robotArms[0];
  const hit=t.rotorPart(arm.gripperId);t.setSelected({g:hit.g,part:hit.part});pickup=t.robotKinematics(arm).point.clone();
 }
 function place(g,p){g.body.position.copy(p);g.body.quaternion.set(0,0,0,1);g.body.velocity.set(0,0,0);g.body.angularVelocity.set(0,0,0);g.body.aabbNeedsUpdate=true;g.body.wakeUp();}
 function feed(g){place(g,t.V(pickup.x,.625,pickup.z));const tool=t.rotorPart(arm.gripperId).g;assert(!t.poses(tool).some(a=>t.poses(g).some(b=>t.obbOverlap(a,b,.0005))),'fixture input must not penetrate the gripper');assert(C.reintroduce(s,g.parts.map(p=>p.id)));}
 function teach(name,point,heightCm){
  sandbox.document.pointerLockElement=t.canvas;assert(t.robotPanelAction('pose',{pose:name,heightCm}).ok);
  const camera=[point.x,point.y+.85,point.z+.7];t.setLook({camera,yaw:0,pitch:Math.atan2(point.y-camera[1],.7)});
  t.updateRobotPoseDraft(1,true);const draft=t.getRobotPoseDraft();assert(draft.solution?.pose,draft.reason);
  t.canvas.dispatchEvent({type:'mousedown',button:0});assert.equal(t.getRobotPoseDraft(),null);t.resumeGame();t.hideStoryDialogue();
 }
 function program(g){
  // Teach over the empty receiver: its surface is 9.5 cm below the staged
  // cube's top. A 12.5 cm target leaves a normal 3 cm pickup gap; the precise
  // hinge solve must not rely on gravity sag to enter the 5 cm reach.
  teach('pick',t.V(pickup.x,.575,pickup.z),12.5);teach('place',t.hangarChainLayout().table,25);
  for(let joint=0;joint<4;joint++)assert(t.robotPanelAction('motor',{joint,rpm:12,maxTorque:[2,4,3,2][joint],capacity:64}).ok);
  // Reach that empty posture through the normal motors before inserting a
  // fixture input. No payload is spawned inside the assembled tilted wrist.
  assert(t.robotPanelAction('goto',{pose:'pick'}).ok);until(()=>!arm.jogging);feed(g);
 }
 function until(condition,seconds=30){for(let i=0;i<seconds*120;i++){t.stepSimulation(1/120);if(condition())return i+1;}assert.fail((arm?.status||w.message)+' · '+JSON.stringify({chain:C.status(s),motors:arm&&t.robotArmRotors(arm).map(r=>({enabled:r.enabled,stop:r.stopReason,power:r.power,actualRpm:r.actualRpm})),cables:t.powerCables.map(c=>c.status)}));}
 return {...game,G,C,s,w,arm,credited,make,place,feed,teach,program,until,storage};
}

test('a taught physical arm reaches the table, parks without idle drain and repeats three cable-powered transfers',context=>{
 const f=fixture(),{t,G,C,s,w,arm,credited,program,until,make,feed,place}=f;
 program(credited[0]);assert(t.configureRobotArm(arm,{repeat:true}));const identities=t.groups.flatMap(g=>g.parts.map(p=>p.id));
 assert(t.startRobotArm(arm));until(()=>C.status(s).armDemo===1);
 assert.equal(arm.cycles,1);assert(arm.running);assert.equal(t.hangarChainZone(credited[0]),'table');
 assert.deepEqual(t.groups.flatMap(g=>g.parts.map(p=>p.id)),identities);
 assert.equal(t.powerReservoirs.length,1);const source=t.powerReservoirs[0];assert.equal(w.sourceId,source.id);near(source.cell.mood.energy*source.capacity,s.energyJ);
 assert(t.hangarChainAction('skip'));t.hideStoryDialogue();t.resumeGame();source.enabled=true;
 const from={kind:'reservoir',id:source.id},to={kind:'part',id:arm.baseId},a=t.powerPort(from),b=t.powerPort(to);
 const material=Array.from({length:4},()=>make()).flatMap(g=>t.worldParts(g));
 const result=t.connectPowerCable(from,to,[t.V(a.x,1.2,a.z),t.V(b.x,1.2,a.z),t.V(b.x,1.2,b.z)],material);
 assert(result.ok,result.error);assert(t.getCableSupply(t.rotorPart(arm.baseId).g).includes(source.cell));
 const internal=t.robotArmRotors(arm).flatMap(r=>[t.rotorPart(r.aId).part,t.rotorPart(r.bId).part]).concat(t.rotorPart(arm.gripperId).part);
 const charge=internal.map(p=>p.mood.energy),reserve=s.energyJ,start=t.getSimTime();
 for(let n=1;n<=3;n++){
  // Explicit input/output fixture handling, never moving a load in transit.
  if(n!==1)place(credited[n-1],t.V(3.25,.625,-.48+(n-1)*.22));
  until(()=>arm.state==='wait');
  if(n===1){
   const waiting=s.energyJ,inside=internal.map(p=>p.mood.energy);
   assert(t.robotArmRotors(arm).every(r=>!r.enabled),'waiting uses native passive brakes');
   for(let step=0;step<60*120;step++)t.stepSimulation(1/120);
   near(s.energyJ,waiting);internal.forEach((p,i)=>near(p.mood.energy,inside[i]));
   assert(arm.running);assert.equal(arm.state,'wait');assert(t.robotArmRotors(arm).every(r=>!r.enabled));
  }
  feed(credited[n]);
  if(n===1){
   const waiting=s.energyJ,inside=internal.map(p=>p.mood.energy);
   // The preceding product still occupies B. A new input must not start a
   // second pickup or get stacked on top while the output remains full.
   for(let step=0;step<5*120;step++)t.stepSimulation(1/120);
   assert.equal(arm.state,'wait');assert(arm.running);assert.equal(t.robotGrips.size,0);
   assert.match(arm.status,/Destino B ocupado/);assert(t.robotArmRotors(arm).every(r=>!r.enabled));
   near(s.energyJ,waiting);internal.forEach((p,i)=>near(p.mood.energy,inside[i]));
   place(credited[0],t.V(3.25,.625,-.48));
  }
  until(()=>C.status(s).armWired===n);
  assert(arm.running,'the repeating controller remains enabled');assert.equal(arm.cycles,n+1);
  assert.equal(t.hangarChainZone(credited[n]),'table');
 }
 assert(s.energyJ<reserve);internal.forEach((p,i)=>near(p.mood.energy,charge[i]));
 assert.equal(C.status(s).phase,'drone');assert.equal(t.powerCables.length,1);assert.equal(result.cable.materials.length,4);
 assert(material.every(p=>G.record(s,p.id).place==='cable'));assert.doesNotThrow(()=>G.validate(s));
 context.diagnostic(JSON.stringify({armParts:26,cableParts:4,sourceWatts:source.maxWatts,threeTransferJ:reserve-s.energyJ,seconds:t.getSimTime()-start,parkedSeconds:60,blockedDestinationSeconds:5,internalChargeUnchanged:true}));
});

test('removing an arriving input cancels pickup recovery and parks without empty motor drain',()=>{
 const f=fixture(),{t,C,s,arm,credited,program,until,feed,place}=f;program(credited[0]);assert(t.configureRobotArm(arm,{repeat:true}));assert(t.startRobotArm(arm));until(()=>C.status(s).armDemo===1);
 assert(t.hangarChainAction('skip'));t.hideStoryDialogue();t.resumeGame();place(credited[0],t.V(3.25,.625,-.48));until(()=>arm.state==='wait');
 feed(credited[1]);until(()=>arm.galponRecoveringPick);
 place(credited[1],t.V(-3,.05,2));until(()=>arm.state==='wait'&&arm.galponWaitingBrake);
 assert(arm.running);assert.equal(t.robotGrips.size,0);assert.equal(arm.cycles,1);assert(t.robotArmRotors(arm).every(r=>!r.enabled));
 const reserve=s.energyJ,parts=t.robotArmRotors(arm).flatMap(r=>[t.rotorPart(r.aId).part,t.rotorPart(r.bId).part]),charge=parts.map(p=>p.mood.energy);
 for(let i=0;i<5*120;i++)t.stepSimulation(1/120);
 near(s.energyJ,reserve);parts.forEach((p,i)=>near(p.mood.energy,charge[i]));assert.equal(arm.state,'wait');assert.equal(t.robotGrips.size,0);
});

test('durable unloaded wait restores passive brakes and takes a later input without restarting the program',()=>{
 const f=fixture(),{t,s,arm,credited,program,until,place,storage}=f;program(credited[0]);const input=credited[0],pickup=input.body.position.clone();
 place(input,t.V(-3,.05,2));assert(t.configureRobotArm(arm,{repeat:true}));assert(t.startRobotArm(arm));until(()=>arm.state==='wait'&&arm.galponWaitingBrake);
 const saved=t.saveCurrentGame();assert(saved.ok,saved.error);const reserve=s.energyJ;
 const fresh=createGame({graphics:false,storage}),r=fresh.t;r.story.ready=true;assert(r.continueHangarGame(),r.saveSession.message);r.hideStoryDialogue();r.resumeGame();
 const restored=r.robotArms.find(a=>a.gripperId===arm.gripperId),cells=r.robotArmRotors(restored).flatMap(rotor=>[r.rotorPart(rotor.aId).part,r.rotorPart(rotor.bId).part]),charge=cells.map(p=>p.mood.energy);
 assert(restored.running);assert.equal(restored.state,'wait');assert(restored.galponWaitingBrake);assert(r.robotArmRotors(restored).every(rotor=>!rotor.enabled));
 for(let i=0;i<5*120;i++)r.stepSimulation(1/120);
 near(r.story.galpon.energyJ,reserve);cells.forEach((p,i)=>near(p.mood.energy,charge[i]));assert(restored.running);assert.equal(r.robotGrips.size,0);
 const next=r.rotorPart(input.parts[0].id).g;next.body.position.copy(pickup);next.body.velocity.set(0,0,0);next.body.angularVelocity.set(0,0,0);next.body.aabbNeedsUpdate=true;next.body.wakeUp();
 for(let i=0;i<30*120&&fresh.sandbox.QBitsGalponChain.status(r.story.galpon).armDemo<1;i++)r.stepSimulation(1/120);
 assert.equal(restored.cycles,1,restored.status);assert.equal(fresh.sandbox.QBitsGalponChain.status(r.story.galpon).armDemo,1);assert(restored.running);
});

for(const removeInput of [false,true])test('durable pickup approach '+(removeInput?'returns home when the observed input is removed':'reaches A and takes the same physical input once'),()=>{
 const f=fixture(),{t,s,arm,credited,program,until,storage}=f;program(credited[0]);assert(t.configureRobotArm(arm,{repeat:true}));assert(t.startRobotArm(arm));
 until(()=>arm.galponRecoveringPick);
 assert.equal(arm.state,'return');assert(arm.galponRecoveringPick);assert.equal(t.robotGrips.size,0);
 const id=credited[0].parts[0].id,energy=s.energyJ,toolEnergy=t.rotorPart(arm.gripperId).part.mood.energy,ids=plain(t.groups.flatMap(g=>g.parts.map(p=>p.id)).sort((a,b)=>a-b));
 const saved=t.saveCurrentGame();assert(saved.ok,saved.error);assert.equal(saved.save.data.snapshot.runtime.arms[0].state,'return');assert.equal(saved.save.data.machineGrips.length,0);
 const fresh=createGame({graphics:false,storage}),r=fresh.t;r.story.ready=true;assert(r.continueHangarGame(),r.saveSession.message);r.hideStoryDialogue();r.resumeGame();
 const restored=r.robotArms.find(a=>a.gripperId===arm.gripperId),input=r.rotorPart(id).g,C=fresh.sandbox.QBitsGalponChain;
 assert(restored.running);assert.equal(restored.state,'return');assert.equal(r.robotGrips.size,0);near(r.story.galpon.energyJ,energy);near(r.rotorPart(arm.gripperId).part.mood.energy,toolEnergy);
 assert.deepEqual(plain(r.groups.flatMap(g=>g.parts.map(p=>p.id)).sort((a,b)=>a-b)),ids);
 if(removeInput){input.body.position.set(-3,.05,2);input.body.velocity.set(0,0,0);input.body.angularVelocity.set(0,0,0);input.body.aabbNeedsUpdate=true;input.body.wakeUp();}
 for(let i=0;i<30*120;i++){
  r.stepSimulation(1/120);
  if(removeInput?restored.state==='wait'&&restored.galponWaitingBrake:C.status(r.story.galpon).armDemo===1)break;
 }
 assert(restored.running,restored.status);assert.equal(r.robotGrips.size,0);
 if(removeInput){
  assert.equal(restored.state,'wait');assert(restored.galponWaitingBrake);assert.equal(restored.cycles,0);assert.equal(C.status(r.story.galpon).armDemo,0);assert.equal(r.powerReservoirs.length,0);
  const cells=r.robotArmRotors(restored).flatMap(rotor=>[r.rotorPart(rotor.aId).part,r.rotorPart(rotor.bId).part]),charge=cells.map(p=>p.mood.energy),reserve=r.story.galpon.energyJ;
  for(let i=0;i<3*120;i++)r.stepSimulation(1/120);
  near(r.story.galpon.energyJ,reserve);cells.forEach((p,i)=>near(p.mood.energy,charge[i]));assert(r.robotArmRotors(restored).every(rotor=>!rotor.enabled));
 }else{
  assert.equal(restored.cycles,1,restored.status);assert.equal(C.status(r.story.galpon).armDemo,1);assert.equal(r.hangarChainZone(input),'table');assert.equal(r.powerReservoirs.length,1);
 }
 assert.doesNotThrow(()=>fresh.sandbox.QBitsGalponProduction.validate(r.story.galpon));
});

test('a destination occupied during carry retains the load, pays only holding energy and resumes after durable reload',()=>{
 const f=fixture(),{t,G,s,arm,credited,program,until,place,storage}=f;program(credited[0]);assert(t.configureRobotArm(arm,{repeat:false}));assert(t.startRobotArm(arm));
 until(()=>arm.state==='carry'&&t.robotGrips.has(arm.gripperId));
 const block=credited[1],table=t.hangarChainLayout().table;place(block,t.V(table.x,.625,table.z));
 until(()=>arm.galponWaitingPlace);assert.equal(arm.state,'carry');assert(arm.running);assert.equal(t.robotGrips.get(arm.gripperId).g,credited[0]);
 const members=t.robotArmRotors(arm),cells=members.flatMap(r=>[t.rotorPart(r.aId).part,t.rotorPart(r.bId).part]),charge=cells.map(p=>p.mood.energy),tool=t.rotorPart(arm.gripperId).part,inside=tool.mood.energy,reserve=s.energyJ;
 for(let i=0;i<10*120;i++)t.stepSimulation(1/120);
 assert(members.every(r=>!r.enabled));cells.forEach((p,i)=>near(p.mood.energy,charge[i]));near(s.energyJ,reserve);near((inside-tool.mood.energy)*t.gameBatteryCapacity(tool),1.6);
 const saved=t.saveCurrentGame();assert(saved.ok,saved.error);const toolCharge=tool.mood.energy;
 const fresh=createGame({graphics:false,storage}),r=fresh.t;r.story.ready=true;assert(r.continueHangarGame(),r.saveSession.message);r.hideStoryDialogue();r.resumeGame();
 const restored=r.robotArms.find(a=>a.gripperId===arm.gripperId);assert(restored.running);assert.equal(restored.state,'carry');assert(restored.galponWaitingPlace);assert(r.robotArmRotors(restored).every(x=>!x.enabled));
 assert.equal(r.robotGrips.size,1);near(r.story.galpon.energyJ,reserve);near(r.rotorPart(arm.gripperId).part.mood.energy,toolCharge);
 for(let i=0;i<2*120;i++)r.stepSimulation(1/120);assert(restored.galponWaitingPlace);assert.equal(r.robotGrips.size,1);
 const obstruction=r.rotorPart(block.parts[0].id).g;obstruction.body.position.set(-3,.05,2);obstruction.body.velocity.set(0,0,0);obstruction.body.angularVelocity.set(0,0,0);obstruction.body.aabbNeedsUpdate=true;obstruction.body.wakeUp();
 for(let i=0;i<30*120&&fresh.sandbox.QBitsGalponChain.status(r.story.galpon).armDemo<1;i++)r.stepSimulation(1/120);
 assert.equal(restored.cycles,1,restored.status);assert.equal(r.robotGrips.size,0);assert.equal(fresh.sandbox.QBitsGalponChain.status(r.story.galpon).armDemo,1);assert.doesNotThrow(()=>G.validate(r.story.galpon));
});

for(const legacy of [false,true])test('saving an arm during its real carry restores one grip and finishes the same transfer'+(legacy?' from an older snapshot without an offset':''),()=>{
 const f=fixture(),{t,G,C,s,arm,credited,program,until,storage}=f;program(credited[0]);assert(t.configureRobotArm(arm,{repeat:false}));
 assert(t.startRobotArm(arm));until(()=>arm.state==='carry'&&t.robotGrips.has(arm.gripperId));
 const grip=t.robotGrips.get(arm.gripperId);assert.equal(grip.g,credited[0]);assert(t.world.constraints.includes(grip.constraint));
 const ids=t.groups.flatMap(g=>g.parts.map(p=>p.id)).sort((a,b)=>a-b),energy=s.energyJ,toolEnergy=t.rotorPart(arm.gripperId).part.mood.energy;
 const save=t.saveCurrentGame();assert(save.ok,save.error);assert.equal(save.save.data.machineGrips.length,1);
 const offset=save.save.data.machineGrips[0].offset;assert.equal(offset.length,3);
 if(legacy){const older=plain(save.save.data);delete older.machineGrips[0].offset;const written=t.saveStore.write('galpon',older);assert(written.ok,written.error);}
 const fresh=createGame({graphics:false,storage}),r=fresh.t;r.story.ready=true;assert(r.continueHangarGame(),r.saveSession.message);
 const loadedArm=r.robotArms[0],restored=r.robotGrips.get(arm.gripperId);
 assert(restored);assert.equal(restored.g.parts[0].id,credited[0].parts[0].id);assert(r.world.constraints.includes(restored.constraint));
 assert.equal(r.robotGrips.size,1);assert.equal(restored.g.robotHeld,arm.gripperId);assert.equal(loadedArm.state,'carry');assert(loadedArm.running);
 const tool=r.rotorPart(arm.gripperId).g.body,relativeOffset=tool.quaternion.inverse().vmult(restored.body.position.vsub(tool.position));
 ['x','y','z'].forEach((key,i)=>near(relativeOffset[key],offset[i]));
 assert.deepEqual(plain(r.groups.flatMap(g=>g.parts.map(p=>p.id)).sort((a,b)=>a-b)),plain(ids));
 near(r.story.galpon.energyJ,energy);near(r.rotorPart(arm.gripperId).part.mood.energy,toolEnergy);
 r.resumeGame();r.hideStoryDialogue();for(let i=0;i<3600&&fresh.sandbox.QBitsGalponChain.status(r.story.galpon).armDemo<1;i++)r.stepSimulation(1/120);
 assert.equal(loadedArm.cycles,1,loadedArm.status);assert.equal(fresh.sandbox.QBitsGalponChain.status(r.story.galpon).armDemo,1);
 assert.equal(r.robotGrips.size,0);assert.doesNotThrow(()=>G.validate(r.story.galpon));assert.equal(C.status(s).armDemo,0);
});

for(const [label,poseFixture]of [['resting',restingPose],['docked',dockedPose],['parked after fleet teaching',parkedPose]])test('a '+label+' arm restores its saved hinges despite the measured Cannon deflection',()=>{
 const f=fixture(),{t,G,s,arm,storage}=f,groupIds=[arm.baseId,...arm.joints.map(j=>j.bId)];
 for(let i=0;i<groupIds.length;i++){
  const g=t.rotorPart(groupIds[i]).g,pose=poseFixture.groups[i];
  assert.deepEqual(plain(g.parts.map(p=>p.shape)),pose.shapes);
  g.body.quaternion.copy(pose.q);const offset=g.body.quaternion.vmult(g.parts[0].offset);
  g.body.position.set(pose.firstPosition.x-offset.x,pose.firstPosition.y-offset.y,pose.firstPosition.z-offset.z);
  g.body.velocity.copy(pose.v);g.body.angularVelocity.copy(pose.w);g.body.aabbNeedsUpdate=true;
 }
 const a=t.couplerTip(t.rotorPart(arm.joints[0].aId)),b=t.couplerTip(t.rotorPart(arm.joints[0].bId));
 near(a.point.distanceTo(b.point),poseFixture.firstHingePivotGapMetres);near(a.axis.dot(b.axis),poseFixture.firstHingeAxisDot);
 if(poseFixture.poses){
  arm.poses=plain(poseFixture.poses);arm.repeat=true;
  const resumed=t.restoreLabRuntime({version:1,arms:[{gripperId:arm.gripperId,state:'wait',jogging:false,destination:plain(arm.poses.home),cycles:6,scan:0}]});
  assert.deepEqual(plain(resumed.warnings),[]);assert(arm.running);assert(arm.galponWaitingBrake);
 }else{assert.equal(arm.poses.pick,null);assert.equal(arm.poses.place,null);}
 const energy=s.energyJ,ids=plain(t.groups.flatMap(g=>g.parts.map(p=>p.id)).sort((a,b)=>a-b)),save=t.saveCurrentGame();assert(save.ok,save.error);
 const fresh=createGame({graphics:false,storage}),r=fresh.t;r.story.ready=true;assert(r.continueHangarGame(),r.saveSession.message);
 assert.equal(r.robotArms.length,1);assert.equal(r.robotArmRotors(r.robotArms[0]).length,4);near(r.story.galpon.energyJ,energy);
 assert.deepEqual(plain(r.saveSession.restoreWarnings),[]);
 if(poseFixture.poses){
  assert.deepEqual(plain(r.robotArms[0].poses),poseFixture.poses);assert(r.robotArms[0].running);assert.equal(r.robotArms[0].cycles,6);assert.equal(r.robotArms[0].state,'wait');assert(r.robotArms[0].galponWaitingBrake);
 }else{assert.equal(r.robotArms[0].poses.pick,null);assert.equal(r.robotArms[0].poses.place,null);}
 assert.deepEqual(plain(r.groups.flatMap(g=>g.parts.map(p=>p.id)).sort((a,b)=>a-b)),ids);
 for(let i=0;i<120;i++)r.stepSimulation(1/120);
 assert.equal(r.robotArms.length,1);assert.equal(r.robotArmRotors(r.robotArms[0]).length,4);assert.doesNotThrow(()=>G.validate(r.story.galpon));
 if(poseFixture.poses){assert(r.robotArms[0].running);assert.equal(r.robotArms[0].state,'wait');assert(r.robotArmRotors(r.robotArms[0]).every(rotor=>!rotor.enabled));}
});

test('an independent paid gripper keeps its constraint and exact charge across reload, rejecting forged holds atomically',()=>{
 const f=fixture({withArm:false}),{t,G,s,make,storage}=f,tool=make('cube',false,t.V(-2,.145,2)),payload=make('cube',false,t.V(-2,.05,2)),id=tool.parts[0].id;
 assert(t.configureGripper(id));assert(t.gripperGrab(id));const before=tool.parts[0].mood.energy,energy=s.energyJ;
 const save=t.saveCurrentGame();assert(save.ok,save.error);const bytes=storage.values.get(saves.KEYS.galpon);
 for(const change of [data=>data.machineGrips.push({...data.machineGrips[0]}),data=>data.machineGrips[0].partId=id,data=>data.machineGrips[0].toolId=payload.parts[0].id,data=>data.machineGrips[0].relative=[0,0,0,0],data=>data.machineGrips[0].offset=[0,0],data=>data.machineGrips[0].offset=[29,0,0],data=>data.trajectoryRuntime=[{}]]){
  const bad=plain(save.save.data);change(bad);assert.equal(t.saveStore.write('galpon',bad).ok,false);assert.equal(storage.values.get(saves.KEYS.galpon),bytes);
 }
 const loaded=createGame({graphics:false,storage}),r=loaded.t;r.story.ready=true;assert(r.continueHangarGame(),r.saveSession.message);
 const restored=r.robotGrips.get(id);assert(restored);assert.equal(restored.g.parts[0].id,payload.parts[0].id);assert(r.world.constraints.includes(restored.constraint));
 near(r.rotorPart(id).part.mood.energy,before);near(r.story.galpon.energyJ,energy);
 const count=r.groups.flatMap(g=>g.parts).length;for(let i=0;i<120;i++)r.stepSimulation(1/120);
 assert.equal(r.robotGrips.size,1);assert.equal(r.groups.flatMap(g=>g.parts).length,count);
 near((before-r.rotorPart(id).part.mood.energy)*r.gameBatteryCapacity(r.rotorPart(id).part),.16);
 assert(r.releaseGripper(id));assert.equal(r.robotGrips.size,0);assert.doesNotThrow(()=>G.validate(r.story.galpon));
});
