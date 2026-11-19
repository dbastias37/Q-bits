const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;}
const select=(t,g,part=g.parts[0])=>t.setSelected({g,part});
test('real panel converts a selected cube without adding matter or energy and learns a chosen sample',()=>{
 const {t,sandbox}=lab(),g=t.addQubit([0,.2,0]);select(t,g);t.updateRobotArmPanel();const before=g.parts[0].mood.energy;
 sandbox.document.querySelector('#arm-convert').dispatchEvent({type:'click'});assert(g.parts[0].mood.gripper);assert.equal(t.groups.length,1);assert.equal(g.parts[0].mood.energy,before);
 const sample=t.addQubit([1,.05,0]);select(t,sample);t.updateRobotArmPanel();sandbox.document.querySelector('#arm-capture-piece').dispatchEvent({type:'click'});
 assert.equal(g.parts[0].mood.gripper.mode,'piece');assert.equal(g.parts[0].mood.gripper.targetId,sample.parts[0].id);
 sandbox.document.querySelector('#arm-capture-shape').dispatchEvent({type:'click'});assert.equal(g.parts[0].mood.gripper.mode,'form');assert.equal(g.parts[0].mood.gripper.formSignature,t.gripperFormSignature(sample));
 assert.equal(t.robotPanelAction('filter',{mode:'piece',targetId:null}).ok,false,'missing target is explained rather than saved');
});
test('blueprint UI places a recipe and creates neither bodies nor active motors',()=>{
 const {t,sandbox}=lab();t.setLook({camera:[0,1.68,2],pitch:-.8,yaw:0});t.updateRobotArmPanel();sandbox.document.querySelector('#arm-blueprint').dispatchEvent({type:'click'});
 assert.equal(t.blueprints.length,0);assert(t.getCreationPreview().valid);assert(t.confirmCreationPlacement());assert.equal(t.blueprints.length,1);assert.equal(t.groups.length,0);assert.equal(t.rotors.length,0);assert.equal(t.robotArms.length,0);
 assert.equal(t.blueprintTargets(t.blueprints[0]).length,26);
});
test('panel teaches the assembled arm and preserves identity when selecting its base or sample',()=>{
 const {t,sandbox}=lab();assert(t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V(0,0,0)));const arm=t.robotArms[0],base=t.rotorPart(arm.baseId);select(t,base.g,base.part);t.updateRobotArmPanel();
 const s=t.robotPanelSnapshot();assert(s.arm);assert.equal(s.canConvert,false,'base cannot receive an accidental second adaptation');assert.equal(s.arm.joints.length,4);assert.equal(s.arm.energy,4320,'only motor endpoints and gripper supply internal energy');
 sandbox.document.querySelector('#arm-teach-place').dispatchEvent({type:'click'});assert(arm.poses.place);sandbox.document.querySelector('#arm-repeat').checked=false;sandbox.document.querySelector('#arm-repeat').dispatchEvent({type:'change'});assert.equal(arm.repeat,false);
 const extra=t.addQubit([1,.05,0]);select(t,extra);assert.equal(t.robotPanelSnapshot().gripper.id,arm.gripperId);
 assert(t.robotPanelAction('capturePiece').ok);assert.equal(t.rotorPart(arm.gripperId).part.mood.gripper.targetId,extra.parts[0].id);
});
test('gripper adaptation and library categories survive ordinary panel updates',()=>{
 const {t,sandbox}=lab(),g=t.addQubit([0,.2,0]);select(t,g);assert(t.robotPanelAction('convert').ok);t.updateMechanismPanel();
 sandbox.document.querySelector('#saved-library-mechanisms-tab').dispatchEvent({type:'click'});assert.equal(sandbox.document.querySelector('#saved-shape-list').hidden,true);assert.equal(sandbox.document.querySelector('#saved-library-mechanisms').hidden,false);
 assert(t.saveMechanism(g));assert.equal(t.savedShapes.length,0);assert.equal(t.savedMechanisms.length,1);t.updateMechanismPanel();assert.equal(sandbox.document.querySelector('#saved-library-mechanisms').hidden,false);
 const snapshot=t.saveLab();t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=snapshot;t.enterLab(false);const restored=t.groups.find(x=>x.parts.some(p=>p.id===g.parts[0].id));assert(restored?.parts[0].mood.gripper);assert.notEqual(restored.parts[0].mood.gripper,g.parts[0].mood.gripper);
});
test('specific colored cargo is selectable by identity and keeps its real lifted pose across lab restoration',()=>{
 const {t}=lab(),g=t.addQubit([0,.145,0]),cargo=t.newCargo(t.V(0,0,0),1,1,'#c8102e');select(t,g);assert(t.robotPanelAction('convert').ok);
 assert(t.robotPanelSnapshot().targets.some(target=>target.id===-cargo.id));assert(t.robotPanelAction('filter',{mode:'piece',targetId:-cargo.id}).ok);assert(t.gripperGrab(g.parts[0].id));t.releaseGripper(g.parts[0].id);
 cargo.body.position.set(.4,.65,.3);cargo.body.velocity.set(.2,-.1,.05);cargo.body.quaternion.setFromAxisAngle(t.V(0,0,1),Math.PI/4);const saved=t.saveLab(),record=saved.cargos[0];
 t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);const restored=t.cargos.find(c=>c.id===record.id);assert(restored);assert(restored.robotPhysical);assert.equal(restored.body.position.y,.65);assert.equal(restored.body.velocity.y,-.1);assert.equal(restored.body.quaternion.z,record.q.z);assert.equal(restored.body.type,1);assert.equal(t.robotGrips.size,0);
 const grip=t.groups.flatMap(x=>x.parts).find(p=>p.mood.gripper);assert.equal(grip.mood.gripper.targetId,-restored.id);
});
test('workshop refuses overlapping battery, body and sensor adaptations on an existing gripper',()=>{
 const {t,sandbox}=lab();t.setupWorkshop();const bench=t.getWorkshopBench(),g=t.addQubit([bench.p.x,bench.p.y+.046,bench.p.z]),id=g.parts[0].id;select(t,g);assert(t.configureGripper(id));const before=JSON.stringify(t.worldParts(g));
 assert.equal(t.createExternalBattery(id,1),false);assert.equal(t.workshopBodyPreview(id,{x:1,y:1,z:1}).ok,false);assert.equal(t.applyWorkshopUpgrade(id,{sensor:true}),false);
 assert.equal(JSON.stringify(t.worldParts(g)),before);assert(t.mechanismSnapshot(g),'rejected conversion leaves a valid exportable gripper');
});
