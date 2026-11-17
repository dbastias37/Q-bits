const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;}
function block(t){return Array.from({length:2000},(_,i)=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V((i%20-9.5)*.09,.05+(Math.floor(i/20)%10)*.09,(Math.floor(i/200)-4.5)*.09),q:t.Q()}));}
test('preview follows every 120 Hz camera frame instead of waiting for a 30 Hz tick',()=>{
 const {t}=lab();t.initUnitRadial();t.position.splice(0,3,0,2,2);t.setLook({camera:[0,2,2],yaw:0,pitch:-Math.PI/4});assert(t.beginCreationPlacement('cube'));
 let last=-Infinity;for(let i=0;i<12;i++){t.position[0]=i*.001;t.frame(1000+i*1000/120);const p=t.getCreationPreview();assert(p.valid);assert(p.point.x>last,'every frame must refresh its position');assert(Math.abs(p.point.x-t.getLook().camera[0])<1e-9);last=p.point.x;}
});
test('2000 piece ghost merges internal faces, confirms exact geometry and allocates no preview bodies',()=>{
 const {t,buffers}=lab(),parts=block(t);const shape={name:'Bloque 2000',geometryVersion:3,parts:parts.map(p=>({shape:p.shape,p:[p.p.x,p.p.y-.005,p.p.z],q:[0,0,0,1]}))};assert(t.savedShapeValid(shape));t.savedShapes.push(shape);t.initUnitRadial();t.setLook({camera:[0,2.5,2],yaw:0,pitch:Math.atan2(-2.5,2)});
 const bodies=t.world.bodies.length,allocated=buffers.size;assert(t.beginCreationPlacement('quick-saved-shape-0'));let preview=t.getCreationPreview();assert(preview.valid,preview.reason);assert.equal(preview.poses.length,2000);assert.equal(preview.drawPoses.length,1);assert.equal(t.world.bodies.length,bodies);assert.equal(buffers.size,allocated);
 for(let i=0;i<24;i++){assert(t.updateCreationPlacement({point:t.V(i*.002,0,0),normal:t.V(0,1,0)}));t.drawCreationPlacement();}assert.equal(buffers.size,allocated);
 t.updateCreationPlacement();const expected=preview.poses.map(p=>p.p.clone());assert(t.confirmCreationPlacement());assert.equal(t.groups.length,1);assert.equal(t.groups[0].parts.length,2000);assert.equal(t.groups[0].body.shapes.length,1);t.poses(t.groups[0]).forEach((p,i)=>assert(p.p.distanceTo(expected[i])<1e-8));
});
test('a 2000 unit structure can actually lift, move, release and survive a laboratory round trip',()=>{
 const {t}=lab(),g=t.makeGroup(block(t)),ids=g.parts.map(p=>p.id);assert.equal(t.settings.maxCarry,2000);assert.equal(t.settings.maxSelect,2000);assert.equal(g.body.mass,500);
 t.grabQubit({g,part:g.parts[0],point:g.body.position.clone(),distance:1});const held=t.getHeld();assert(held,'default hand accepts 2000 units');const target=t.V(.3,1.2,0);held.rootOffset=target.vsub(t.V(...t.getLook().camera).vadd(t.screenRay(640,360).scale(held.distance)));
 let peak=0;for(let i=0;i<120;i++){t.stepPhysics(1/120);peak=Math.max(peak,g.body.angularVelocity.norm());}assert(g.body.position.distanceTo(target)<.035,`hand at ${g.body.position}`);assert(peak<.1);t.releaseQubit();assert.equal(g.body.angularVelocity.norm(),0);
 t.setMultiSelection([g]);t.setSelected({g,part:g.parts[0]});assert.equal(t.selectionHudSnapshot()[0].parts.length,2000);
 const saved=t.saveLab();t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);assert.equal(t.groups.length,1);assert.deepEqual(Array.from(t.groups[0].parts,p=>p.id),Array.from(ids));assert.equal(t.settings.maxCarry,2000);assert.equal(t.groups[0].body.mass,500);
});
test('shelves retain all 2000 identities and accept enlarged gripper and conveyor settings',()=>{
 const {t,sandbox}=lab(),g=t.makeGroup(block(t));t.setMultiSelection([g]);t.setSelected({g,part:g.parts[0]});const shelf=t.createShelf({p:t.V(0,.4,-13.996),q:t.Q(),wall:'north'});assert(shelf);assert(t.storeShelfSelection(shelf,0));const stored=shelf.cells[0].items[0];assert(sandbox.QBitsOrganizers.validItem(stored));assert.equal(stored.groups[0].parts.length,2000);const saved=t.saveLab();t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);assert.equal(t.shelves[0].cells[0].items[0].groups[0].parts.length,2000);
 const grip=t.addQubit([3,.1,0]);assert(t.configureGripper(grip.parts[0],{capacity:2000}));assert.equal(t.configureGripper(grip.parts[0],{capacity:2001}),false);
 assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight'),t.V()));const c=t.conveyors[0];assert(t.configureConveyor(c,{capacity:2000}));assert.equal(t.configureConveyor(c,{capacity:2001}),false);const record=t.saveMechanism(t.rotorPart(c.baseId).g,'Carga 2000');assert(record);assert.equal(record.conveyors[0].capacity,2000);assert(t.savedMechanismValid(record));
});
test('Shift keeps a nearby connection through minor aim drift and releases it outside the margin',()=>{
 const {t}=lab();assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight'),t.V()));const c=t.conveyors[0],port=t.conveyorPortWorld(c,'exit');t.initUnitRadial();t.keys.add('ShiftLeft');t.beginCreationPlacement('quick-conveyor-right');
 t.updateCreationPlacement({point:port.p.clone(),normal:t.V(0,1,0)});const preview=t.getCreationPreview();assert.equal(preview.link,c.baseId);const snapped=preview.point.clone();
 t.updateCreationPlacement({point:port.p.vadd(t.V(.7,0,0)),normal:t.V(0,1,0)});assert.equal(preview.link,c.baseId);assert(preview.point.distanceTo(snapped)<1e-9);
 t.updateCreationPlacement({point:port.p.vadd(t.V(.85,0,0)),normal:t.V(0,1,0)});assert.equal(preview.link,null);
 t.updateCreationPlacement({point:port.p.clone(),normal:t.V(0,1,0)});assert.equal(preview.link,c.baseId);t.keys.clear();t.updateCreationPlacement({point:port.p.clone(),normal:t.V(0,1,0)});assert.equal(preview.link,null);
});
test('capacity UI handlers allow 2000 instead of silently clamping to legacy limits',()=>{
 const {t,sandbox}=lab();for(const id of ['maxCarry','maxSelect','rotor-capacity','alpha-capacity','cargoRequired']){const input=sandbox.document.querySelector('#'+id);input.value='2000';input.dispatchEvent({type:'input',target:input});}
 assert.equal(t.settings.maxCarry,2000);assert.equal(t.settings.maxSelect,2000);assert.equal(t.mechanismDefaults.capacity,2000);assert.equal(t.alphaSettings.capacity,2000);assert.equal(t.settings.cargoRequired,2000);
});
