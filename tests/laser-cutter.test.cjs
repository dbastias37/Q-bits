'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
function lab(){const game=createGame({graphics:false}),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,mode:'playing',scene:'lab',phase:'idle',progress:{}});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;}
function setup(shape='cube'){
 const game=lab(),{t}=game,c=t.addQubit([0,.048,0]),target=t.addQubit([.3,t.unitGroundHeight(shape)+.003,0],shape==='cube'?1:1/6,shape);
 assert(t.adaptCutter({g:c,part:c.parts[0]}));c.parts[0].mood.energy=1;c.parts[0].mood.cutter.mode=shape;
 t.world.broadphase.dirty=true;return {...game,c,target,id:c.parts[0].id};
}
function tick(t,seconds){for(let i=0;i<Math.ceil(seconds*120);i++)t.tickCutters(1/120);}
function totalJ(t,groups){return groups.flatMap(g=>g.parts).reduce((n,p)=>n+p.mood.energy*t.gameBatteryCapacity(p),0);}
test('adaptation preserves cube identity, mass and energy; cannot combine another adapter',()=>{
 const {t,c}=setup(),p=c.parts[0],before={id:p.id,weight:p.weight,energy:p.mood.energy};
 assert(t.validCutterConfig(p.mood.cutter));assert.equal(t.canAdaptCutter({g:c,part:p}),false);
 assert.equal(t.configureGripper(p.id),false);assert.deepEqual({id:p.id,weight:p.weight,energy:p.mood.energy},before);
 assert.equal(t.groups.length,2);
});
test('real Cannon ray and timed cut produce six physical pyramids, conserving material, origins and joules',()=>{
 const {t,c,target,id}=setup(),root=target.parts[0].id,j=totalJ(t,[target]),before=totalJ(t,[c]);
 assert.equal(t.cutterBeam(t.rotorPart(id)).target.part.id,root);
 assert(t.setCutterEnabled(id,true));tick(t,3.9);assert(t.groups.includes(target));tick(t,.2);
 const out=t.groups.filter(g=>g!==c);assert.equal(out.length,6,t.cutterRuns.get(id)?.status);
 assert(out.every(g=>g.parts[0].shape==='pyramid'&&g.parts[0].mood.matter.root===root));
 assert.equal(new Set(out.map(g=>g.parts[0].id)).size,6);
 assert(Math.abs(out.reduce((n,g)=>n+g.parts[0].weight,0)-1)<1e-10);
 assert(Math.abs(totalJ(t,out)-j)<1e-9);assert(Math.abs(before-totalJ(t,[c])-8)<1e-9);
 tick(t,5);assert.equal(t.groups.length,7,'cube mode never recuts pyramids');
});
test('pyramid mode creates two triangular pieces with the original capacity and material',()=>{
 const {t,c,target,id}=setup('pyramid'),j=totalJ(t,[target]);assert(t.setCutterEnabled(id,true));tick(t,4.1);
 const out=t.groups.filter(g=>g!==c);assert.equal(out.length,2,t.cutterRuns.get(id)?.status);assert(out.every(g=>g.parts[0].shape==='tetra'));
 assert(Math.abs(out.reduce((n,g)=>n+g.parts[0].weight,0)-1/6)<1e-10);assert(Math.abs(totalJ(t,out)-j)<1e-9);
});
test('occupied output waits without consuming energy; removing obstacle resumes once',()=>{
 const {t,c,target,id}=setup(),block=t.addQubit([.3,.048,.11]),before=totalJ(t,[c]);assert(t.setCutterEnabled(id,true));tick(t,5);
 assert(t.groups.includes(target));assert.match(t.cutterRuns.get(id).status,/ocupada/);assert.equal(totalJ(t,[c]),before);
 t.removeGroup(block);tick(t,4.1);assert.equal(t.groups.length,7);
});
test('wall or incompatible first object occludes targets behind it',()=>{
 const {t,target,id}=setup(),block=t.addQubit([.16,.048,0]);block.parts[0].mood.gripper=t.copyGripperConfig();
 assert.equal(t.cutterBeam(t.rotorPart(id)).target.part.id,block.parts[0].id);assert(t.setCutterEnabled(id,true));tick(t,6);
 assert(t.groups.includes(target));assert.equal(t.groups.length,3);
});
test('cutoff, manual stop, pause and a removed target never consume or duplicate input',()=>{
 const {t,c,target,id,sandbox}=setup();c.parts[0].mood.energy=.00001;assert(t.setCutterEnabled(id,true));tick(t,1);
 assert.equal(t.cutterRuns.get(id).enabled,false);assert(t.groups.includes(target));
 c.parts[0].mood.energy=1;assert(t.setCutterEnabled(id,true));tick(t,2);const before=totalJ(t,[c]);
 sandbox.document.hidden=true;tick(t,8);assert.equal(totalJ(t,[c]),before);sandbox.document.hidden=false;
 assert(t.setCutterEnabled(id,false));tick(t,4);assert(t.groups.includes(target));
 assert(t.setCutterEnabled(id,true));tick(t,2);t.removeGroup(target);tick(t,5);assert.equal(t.groups.length,1);
});
test('taking the emitter or target stops destructive work',()=>{
 const {t,c,target,id}=setup();assert(t.setCutterEnabled(id,true));tick(t,2);t.setHeld({items:[{g:c}]});tick(t,3);
 assert.equal(t.cutterRuns.get(id).enabled,false);assert(t.groups.includes(target));t.setHeld(null);
 assert(t.setCutterEnabled(id,true));t.setHeld({items:[{g:target}]});tick(t,5);assert(t.groups.includes(target));
});
test('settings survive saved mechanisms, actual spawn and durable bank restoration; execution reloads stopped',()=>{
 const {t,c,id}=setup();c.parts[0].mood.cutter.range=100;
 const record=t.mechanismSnapshot(c,'Cortador prueba');assert(record);assert(t.savedMechanismValid(record));assert.equal(record.type,'cutter');
 const clone=t.spawnSavedMechanism(t.copySavedMechanism(record),t.V(1,0,0),t.Q());assert(clone);const copy=t.groups.find(g=>g!==c&&g.parts[0].mood.cutter);assert(copy);assert.equal(copy.parts[0].mood.cutter.range,100);
 const saved=t.saveLab({passive:true}),hydrated=t.hydrateLabSnapshot(JSON.parse(JSON.stringify(saved)));assert(hydrated.groups.some(g=>g.parts.some(p=>p.mood.cutter?.range===100)));
 assert(t.setCutterEnabled(id,true));t.clearNarrativeScene();assert.equal(t.cutterRuns.size,0);
 const bad=JSON.parse(JSON.stringify(saved));bad.groups.find(g=>g.parts[0].mood.cutter).parts[0].mood.cutter.range=Infinity;assert.throws(()=>t.hydrateLabSnapshot(bad));
});
test('native editor includes cutter blueprint and blue placement makes a working adapted cube',async()=>{
 const game=createGame({graphics:false}),{t,api,sandbox}=game;let ready=false;const boot=api.prepare().then(()=>ready=true);for(let i=0;i<30&&!ready;i++){game.frame();await Promise.resolve();await Promise.resolve();}await boot;
 sandbox.document.body.dataset.booting='false';api.menu();assert(api.sceneEditor.open().ok);assert(api.sceneEditor.catalog().some(i=>i.id==='cutter'));
 sandbox.document.pointerLockElement=t.canvas;t.setLook({camera:[0,1.7,2],yaw:0,pitch:-.65});assert(api.sceneEditor.beginPlacement('cutter').ok);assert(t.getCreationPreview().valid);assert.equal(t.groups.length,0);
 t.onCanvasMouseDown({button:0,preventDefault(){}});assert.equal(t.groups.length,1);assert(t.validCutterConfig(t.groups[0].parts[0].mood.cutter));
 const snapshot=api.sceneEditor.capture();assert(snapshot.ok,snapshot.error);assert(api.sceneEditor.open(snapshot.data).ok);assert(t.groups[0].parts[0].mood.cutter);assert.equal(t.cutterRuns.size,0);
});
test('campaign cannot adapt or activate a cutter through public entry points',()=>{
 const {t,c,id}=setup();t.story.scene='campaign';assert.equal(t.setCutterEnabled(id,true),false);delete c.parts[0].mood.cutter;assert.equal(t.adaptCutter({g:c,part:c.parts[0]}),false);
});
test('full simulation cuts on the floor with physical stepping and actual energy draw',()=>{
 const {t,c,id}=setup();const before=totalJ(t,[c]);assert(t.setCutterEnabled(id,true));
 for(let i=0;i<480;i++)t.stepPhysics(1/120);
 assert.equal(t.groups.filter(g=>g.parts[0].shape==='pyramid').length,6,t.cutterRuns.get(id)?.status);
 assert(Math.abs(before-totalJ(t,[c])-8)<1e-8,'working emitter cannot recover charge during the cut');
 assert(t.groups.every(g=>t.world.bodies.includes(g.body)&&g.body.position.y>-.01));
});
test('simultaneous emitters cannot cut the same input twice',()=>{
 const {t,c,target,id}=setup(),other=t.addQubit([.3,.048,.3]),p=other.parts[0];assert(t.adaptCutter({g:other,part:p}));
 p.mood.cutter.face=t.unitProfile('cube').faceNormals.findIndex(n=>n.z<-.9);p.mood.energy=1;
 assert(t.setCutterEnabled(id,true));assert(t.setCutterEnabled(p.id,true));tick(t,4.2);
 assert.equal(t.groups.filter(g=>g.parts[0].shape==='pyramid').length,6);assert(!t.groups.includes(target));
});
test('real output can subdivide again and recompose without multiplying reserve',()=>{
 const {t,c,target,id,sandbox}=setup(),j=totalJ(t,[target]);t.setCutterEnabled(id,true);tick(t,4.1);t.setCutterEnabled(id,false);
 const pyramids=t.groups.filter(g=>g!==c),first=pyramids[0],root=first.parts[0].mood.matter.root;
 for(const g of pyramids.slice(1))t.removeGroup(g);
 first.body.position.set(.3,t.unitGroundHeight('pyramid')+.003,0);first.body.aabbNeedsUpdate=true;t.world.broadphase.dirty=true;
 c.parts[0].mood.cutter.mode='pyramid';t.setCutterEnabled(id,true);tick(t,4.1);
 const halves=t.groups.filter(g=>g!==c);assert.equal(halves.length,2);assert(halves.every(g=>g.parts[0].mood.matter.root===root));assert(Math.abs(totalJ(t,halves)-j/6)<1e-9);
 const restored=sandbox.QBitsReconfiguration.plan('pyramid',halves.flatMap(g=>t.worldParts(g)));assert(!restored.error);assert(Math.abs(restored.outputs[0].mood.cutEnergyScale-1/6)<1e-9);
});
test('active external battery powers cutter without draining its internal reserve',()=>{
 const {t,c,id}=setup(),reservoir=t.createPowerReservoir(t.V(-1,0,0),{enabled:true}),material=t.addQubit([1,.05,1]);
 const from={kind:'reservoir',id:reservoir.id},to={kind:'part',id};const parts=t.worldParts(material);t.removeGroup(material);
 const wire=t.connectPowerCable(from,to,t.powerSurfaceRoute(from,to),parts);assert(wire.ok,wire.error);t.updatePowerNetwork(1);
 const before=c.parts[0].mood.energy,r=reservoir.cell.mood.energy;assert(t.setCutterEnabled(id,true));tick(t,4.1);assert.equal(c.parts[0].mood.energy,before);assert(reservoir.cell.mood.energy<r);
});
