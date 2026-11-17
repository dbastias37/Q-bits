const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),createGame=require('./game-harness.cjs');
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';return game;}
function armAt(t,point=t.V()){assert(t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),point));return t.robotArms.at(-1);}
function select(t,a){const hit=t.rotorPart(a.gripperId);t.setSelected({g:hit.g,part:hit.part});t.setHeld(null);}
function until(t,done,n=2400){for(let i=0;i<n;i++){t.stepPhysics(1/240);if(done())return i+1;}assert.fail('No terminó el movimiento');}
function tick(t,n){for(let i=0;i<n;i++)t.stepPhysics(1/240);}
for(const joint of [0,1,2,3])for(const degrees of [-5,5])test(`fine adjustment moves joint ${joint} by ${degrees} degrees under gravity without losing the program`,()=>{
 const{t}=lab(),a=armAt(t),poses=JSON.stringify(a.poses),ids=t.groups.flatMap(g=>g.parts.map(p=>p.id));select(t,a);
 assert(t.robotPanelAction('jog',{joint,degrees}).ok);until(t,()=>!a.jogging);
 assert.match(a.status,/Postura lista/);const r=t.robotArmRotors(a)[joint];assert(Math.abs(t.robotTargetError(r,a.target[joint]))<.05);
 assert.equal(JSON.stringify(a.poses),poses);assert.deepEqual(t.groups.flatMap(g=>g.parts.map(p=>p.id)),ids);
 assert(t.rotorPart(r.aId).part.mood.energy<.8,'physical motion spends stored energy');
 assert(t.bounds(t.rotorPart(a.gripperId).g).min.y>-.01,'no fall through the floor');
});
test('pickup diagnosis measures distance, filter and capacity without spending energy or attaching a body',()=>{
 const{t}=lab(),g=t.addQubit([0,.245,0]),cube=t.addQubit([0,.05,0]),id=g.parts[0].id;t.configureGripper(id,{});const energy=g.parts[0].mood.energy,count=t.world.constraints.length;
 const far=t.gripperCheck(id,true);assert.equal(far.code,'distance');assert.match(far.message,/10\.5 cm/);assert.equal(t.gripperGrab(id),false);
 assert.equal(g.parts[0].mood.energy,energy);assert.equal(t.world.constraints.length,count);
 g.body.position.y=.145;t.configureGripper(id,{mode:'color',color:'#ff0000'});assert.equal(t.gripperCheck(id,true).code,'filter');assert.equal(t.gripperGrab(id),false);
 t.configureGripper(id,{mode:'any',capacity:1});cube.parts[0].weight=2;assert.equal(t.gripperCheck(id,true).code,'load');assert.equal(t.gripperGrab(id),false);
 cube.parts[0].weight=1;const ready=t.gripperCheck(id,true);assert(ready.ok);assert.equal(ready.candidate.g,cube);assert.equal(t.robotGrips.size,0);assert.equal(g.parts[0].mood.energy,energy);assert(t.gripperGrab(id));
});
test('pickup checks explain obstruction, occupied cargo, misalignment and empty energy',()=>{
 const{t}=lab(),g=t.addQubit([0,.145,0]),cube=t.addQubit([0,.05,0]),id=g.parts[0].id;t.configureGripper(id,{});
 t.setHeld({g:cube,part:cube.parts[0],items:[{g:cube}]});assert.equal(t.gripperCheck(id,true).code,'busy');t.setHeld(null);
 t.storyWall(t.V(0,.0975,0),t.V(.05,.001,.05));assert.equal(t.gripperCheck(id,true).code,'blocked');assert.equal(t.gripperGrab(id),false);
 cube.body.position.x=.5;assert.equal(t.gripperCheck(id,true).code,'alignment');g.parts[0].mood.energy=0;assert.equal(t.gripperCheck(id,true).code,'energy');
});
test('read-only panel check and physical A/B previews preserve poses and do not pick up cargo',()=>{
 const{t,sandbox}=lab(),a=armAt(t),pose=JSON.stringify(a.poses),h=t.rotorPart(a.gripperId),cube=t.addQubit([h.p.x,.046,h.p.z]);select(t,a);t.updateRobotArmPanel();t.pause();const before=t.getSimTime();
 sandbox.document.querySelector('#arm-check').dispatchEvent({type:'click'});assert.match(sandbox.document.querySelector('#arm-check-result').textContent,/Objeto al alcance/);assert.equal(t.getSimTime(),before);assert.equal(t.robotGrips.size,0);
 for(const name of ['place','pick']){assert(t.robotPanelAction('goto',{pose:name}).ok);assert.equal(sandbox.document.querySelector('#panel').hidden,true);until(t,()=>!a.jogging);assert.match(a.status,/Postura lista/);assert.equal(t.robotGrips.size,0);}
 assert.equal(a.cycles,0);assert.equal(JSON.stringify(a.poses),pose);assert(t.groups.includes(cube));assert.equal(t.robotPanelAction('goto',{pose:'unknown'}).ok,false);
});
test('a taught raised arm picks a real cube off a stopped conveyor and completes one delivery',()=>{
 const{t}=lab(),a=armAt(t,t.V(0,.27,0)),base=t.rotorPart(a.baseId).g,bb=t.bounds(base);
 t.storyWall(t.V((bb.min.x+bb.max.x)/2,.135,(bb.min.z+bb.max.z)/2),t.V((bb.max.x-bb.min.x)/2,.135,(bb.max.z-bb.min.z)/2));select(t,a);
 for(const [joint,degrees]of [[1,-10],[3,10]]){assert(t.robotPanelAction('jog',{joint,degrees}).ok);until(t,()=>!a.jogging);assert.match(a.status,/Postura lista/);}
 const hit=t.rotorPart(a.gripperId);assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight'),t.V(hit.p.x,0,hit.p.z)));
 const c=t.conveyors[0],deck=t.conveyorSurfacePoses(c)[0],payload=t.addQubit([hit.p.x,deck.p.y+deck.half.y+.048,hit.p.z]);tick(t,120);select(t,a);
 assert(t.robotPanelAction('check').ok);assert(t.robotPanelAction('teach',{pose:'pick'}).ok);assert(t.robotPanelAction('repeat',{value:false}).ok);
 const ids=t.groups.flatMap(g=>g.parts.map(p=>p.id)),start=payload.body.position.clone();assert(t.robotPanelAction('start').ok);until(t,()=>!a.running);
 assert.equal(a.cycles,1,a.status);assert.equal(a.status,'Ciclo completado');assert(payload.body.position.distanceTo(start)>.65);assert.equal(t.robotGrips.size,0);assert.equal(c.running,false);assert.deepEqual(t.groups.flatMap(g=>g.parts.map(p=>p.id)),ids);
});
test('reduction keeps shaft power consistent and disappears when the arm controller is removed',()=>{
 const{t}=lab(),a=armAt(t),r=t.robotArmRotors(a)[1];assert.equal(t.robotJointReduction(t.robotArmRotors(a)[0]),1);assert.equal(t.robotJointReduction(r),3);
 const power=t.rotorPowerState({...r,enabled:true,actualTorque:6,actualRpm:4,stalled:false});assert(Math.abs(power.mechanicalWatts-6*4*Math.PI*2/60)<1e-9);assert.equal(power.heatWatts,20,'motor shaft sees 2 N·m, not 6');
 assert.match(t.rotorPowerDescription(r),/Reducción 3:1/);assert(t.jogRobotArm(a,1,-5));tick(t,15);assert(a.jointBrakes.size);for(const brake of a.jointBrakes.values())assert.equal(brake.equations.length,1,'only twist is locked beside the existing hinge');
 t.stopRobotArm(a);const saved=t.saveLab();t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);const restored=t.robotArms[0];assert(restored);assert.equal(t.robotJointReduction(t.robotArmRotors(restored)[1]),3);
 const restoredRotor=t.robotArmRotors(restored)[1];t.removeGroup(t.rotorPart(restored.gripperId).g);t.pruneRobotArms();assert.equal(t.robotJointReduction(restoredRotor),1,'no hidden gearing on standalone rotors');
});
test('manual navigation retains scene objects and selected arm, with real markup for the new controls',()=>{
 const{t,sandbox}=lab(),a=armAt(t);select(t,a);const ids=t.groups.flatMap(g=>g.parts.map(p=>p.id));t.pause();
 sandbox.document.querySelector('#arm-help').dispatchEvent({type:'click'});assert.equal(sandbox.document.querySelector('#page-manual').hidden,false);assert.equal(sandbox.document.querySelector('#page-mechanisms').hidden,true);
 sandbox.document.querySelector('#manual-arm-controls').dispatchEvent({type:'click'});assert.equal(sandbox.document.querySelector('#page-manual').hidden,true);assert.equal(sandbox.document.querySelector('#page-mechanisms').hidden,false);assert.equal(t.robotPanelSnapshot().gripper.id,a.gripperId);assert.deepEqual(t.groups.flatMap(g=>g.parts.map(p=>p.id)),ids);
 const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');for(const id of ['tab-manual','page-manual','manual-arm-controls','arm-help','arm-check','arm-check-result','arm-goto-pick','arm-goto-place'])assert.equal([...html.matchAll(new RegExp('id="'+id+'"','g'))].length,1,id);
});
