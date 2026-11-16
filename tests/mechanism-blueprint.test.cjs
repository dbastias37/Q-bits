const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
function setup(){const game=createGame(),{t}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:false,scene:'lab',mode:'playing',phase:'idle'});return game;}
function supplyPlaced(t,bp,skip=-1){return t.blueprintTargets(bp).map((target,index)=>{if(index===skip)return null;const g=t.makeGroup([{id:t.allocateUnitId(),shape:target.shape,weight:1,p:target.p.clone(),q:target.q.clone()}]);g.parts[0].mood.energy=.35+index*.01;const slot={g,bp,index,state:'placed'};g.blueprintJob=slot;bp.slots.push(slot);return g;}).filter(Boolean);}
function inventory(t){return t.groups.flatMap(g=>g.parts).map(p=>({id:p.id,weight:p.weight,shape:p.shape,joules:p.mood.energy*t.gameBatteryCapacity(p)})).sort((a,b)=>a.id-b.id);}

test('built-in arm uses eighteen existing cubes and eight couplers in five genuine rigid bodies',()=>{
 const {t}=setup(),record=t.robotArmBlueprintTemplate();assert(record);assert(t.savedMechanismValid(record));
 const parts=record.groups.flatMap(g=>g.parts);assert.equal(parts.length,26);assert.equal(parts.filter(p=>p.shape==='cube').length,18);assert.equal(parts.filter(p=>p.shape==='coupler').length,8);assert.equal(record.groups.length,5);assert.equal(record.joints.length,4);
 assert(record.joints.every(j=>j.mount==='wheel'&&!j.enabled));assert.equal(record.groups[0].parts.filter(p=>p.shape==='cube').length,12);
 const grip=parts.find(p=>p.key===record.robotArm.gripper);assert(grip.gripper);assert.equal(grip.shape,'cube');const q=t.Q();q.set(...grip.q);assert(q.vmult(t.V(0,-1,0)).y<-.9999);
 const mutable=t.robotArmBlueprintTemplate();mutable.groups[0].parts[0].p[0]+=10;assert(t.savedMechanismValid(t.robotArmBlueprintTemplate()),'caller cannot corrupt shared recipe');
});

test('incomplete mechanism is only a blueprint; final assembly conserves exact supplied identities mass and energy',()=>{
 const {t}=setup(),record=t.robotArmBlueprintTemplate(),bp=t.placeMechanismBlueprint(record,t.V());assert(bp);
 const supplied=supplyPlaced(t,bp,25),before=inventory(t);bp.active=true;t.updateBlueprints(0);
 assert.equal(t.rotors.length,0);assert.equal(t.robotArms.length,0);assert.equal(t.blueprints.length,1);assert.equal(t.groups.length,25);assert.deepEqual(inventory(t),before);
 const target=t.blueprintTargets(bp)[25],last=t.makeGroup([{id:t.allocateUnitId(),shape:target.shape,weight:1,p:target.p.clone(),q:target.q.clone()}]);last.parts[0].mood.energy=.61;
 const slot={g:last,bp,index:25,state:'placed'};last.blueprintJob=slot;bp.slots.push(slot);const all=inventory(t);
 t.updateBlueprints(0);assert.equal(t.blueprints.length,0);assert.equal(t.rotors.length,4);assert.equal(t.groups.length,5);assert.equal(t.robotArms.length,1);assert(t.rotors.every(r=>!r.enabled));assert.deepEqual(inventory(t),all);
 assert(supplied.every(g=>!t.groups.includes(g)));assert(t.mechanismSnapshot(t.rotors[0]),'assembled recipe can be saved again');
});

test('cancelling or rejecting damaged final geometry releases every piece without a partial machine',()=>{
 for(const damaged of [false,true]){const {t}=setup(),bp=t.placeMechanismBlueprint(t.robotArmBlueprintTemplate(),t.V());supplyPlaced(t,bp);const ids=inventory(t).map(p=>p.id);bp.active=true;
  if(damaged){bp.slots[5].g.body.position.x+=.03;t.updateBlueprints(0);}else t.cancelBlueprint(bp);
  assert.equal(t.blueprints.length,0);assert.equal(t.rotors.length,0);assert.equal(t.robotArms.length,0);assert.equal(t.groups.length,26);assert.deepEqual(inventory(t).map(p=>p.id),ids);assert(t.groups.every(g=>!g.blueprintJob&&g.body.type===1));
 }
});

test('saved mechanisms preserve gripper filters, taught poses and articulated connections through export and remap',()=>{
 const {t}=setup(),r=t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V(2,0,2));assert(r);const arm=t.robotArms[0],hit=t.rotorPart(arm.gripperId);
 assert(t.configureGripper(hit.part,{mode:'piece',targetId:999,capacity:3}));const saved=t.saveShape(hit.g);assert(saved);assert.equal(t.savedShapes.length,0);assert.equal(t.savedMechanisms.length,1);assert(saved.robotArm);
 const exported=t.mechanismsExportData();assert.equal(t.importMechanismsData(exported),1);const copy=t.spawnSavedMechanism(t.savedMechanisms[0],t.V(-2,0,-2));assert(copy);assert.equal(t.robotArms.length,2);
 const next=t.robotArms[1],nextHit=t.rotorPart(next.gripperId);assert.notEqual(next.gripperId,arm.gripperId);assert.equal(nextHit.part.mood.gripper.targetId,999);assert.equal(nextHit.part.mood.gripper.capacity,3);assert.notEqual(nextHit.part.mood.gripper,hit.part.mood.gripper);
 assert.equal(next.joints.length,4);assert.equal(next.running,false);
});

test('malformed arm and gripper import data is rejected atomically',()=>{
 const {t}=setup(),record=t.robotArmBlueprintTemplate();t.importMechanismsData({version:1,mechanisms:[record]});
 const changes=[r=>r.robotArm.base=255,r=>r.robotArm.gripper=0,r=>r.robotArm.joints=[0,0],r=>r.robotArm.poses={pick:[[0,0,0,1]],place:null},r=>r.groups.flatMap(g=>g.parts).find(p=>p.gripper).gripper.capacity=Infinity,r=>r.groups.flatMap(g=>g.parts).find(p=>p.gripper).shape='coupler'];
 for(const change of changes){const bad=JSON.parse(JSON.stringify(record));change(bad);assert.equal(t.savedMechanismValid(bad),false);assert.throws(()=>t.importMechanismsData({version:1,mechanisms:[bad]}));assert.equal(t.savedMechanisms.length,1);}
});

test('saved library exposes separate forms and mechanisms and keeps legacy shape entries',()=>{
 const {t,sandbox}=setup(),g=t.addQubit([2,.045,2]);t.saveShape(g);t.showSavedShapes(t.V());let menu=t.getCommandState();assert.equal(menu.title,'Formas guardadas');assert(menu.items[0].label.startsWith('Formas'));assert(menu.items[1].label.startsWith('Mecanismos'));
 menu.items[0].run();assert(t.getCommandState().items.some(i=>i.label.startsWith('Forma 1')));t.showSavedShapes(t.V(),'mechanisms');assert(t.getCommandState().items.some(i=>i.label.startsWith('Brazo Q-bits')));
 t.updateAlphaPanel();assert.equal(sandbox.document.querySelector('#saved-shape-list').children.length,1);assert.equal(sandbox.document.querySelector('#saved-library-mechanisms').children.length,1);
});

test('a saved battery blueprint converts supplied cubes while conserving their joules and starts switched off',()=>{
 const {t}=setup(),battery=t.addQubit([2,.045,2]),part=battery.parts[0];part.mood.externalBattery={version:1,ownerId:part.id,packId:part.id,enabled:true};const saved=t.mechanismSnapshot(battery);assert(saved);t.removeGroup(battery);
 const bp=t.placeMechanismBlueprint(saved,t.V());assert(bp);supplyPlaced(t,bp);const before=inventory(t);bp.active=true;t.updateBlueprints(0);const after=inventory(t);assert.deepEqual(after,before);assert.equal(t.groups.length,1);assert(t.isExternalBattery(t.groups[0].parts[0]));assert.equal(t.groups[0].parts[0].mood.externalBattery.enabled,false);
});

test('the complete arm assembles naturally from loose floor supplies with real physics and no manual slot changes',()=>{
 const {t}=setup(),record=t.robotArmBlueprintTemplate(),bp=t.placeMechanismBlueprint(record,t.V());assert(bp);
 const supply=record.groups.flatMap(g=>g.parts);supply.forEach((p,i)=>{const angle=i*2*Math.PI/supply.length;t.addQubit([Math.cos(angle),t.unitGroundHeight(p.shape)+.003,Math.sin(angle)],1,p.shape);});
 const ids=inventory(t).map(p=>p.id);t.activateBlueprint(bp);let ticks=0;
 while(t.blueprints.includes(bp)&&ticks<240*120){t.runNavigationJobs();t.stepPhysics(1/240);ticks++;if(t.blueprints.includes(bp)){assert.equal(t.rotors.length,0);assert.equal(t.robotArms.length,0);}}
 assert(!t.blueprints.includes(bp),bp.status);assert.equal(t.rotors.length,4);assert.equal(t.robotArms.length,1);assert.equal(t.groups.length,5);assert(t.rotors.every(r=>!r.enabled));assert.deepEqual(inventory(t).map(p=>p.id),ids);
 assert(ticks>240*20,'materials must traverse the actual assembly animation');assert(ticks<240*120,'assembly must finish without a traffic deadlock');
});
