'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
function lab(){const game=createGame({graphics:false}),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,mode:'playing',scene:'lab',phase:'idle',progress:{}});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;}
function laser(t,x=0,z=0,y=.048){
 const g=t.addQubit([x,y,z]);assert(t.adaptCutter({g,part:g.parts[0]}));g.parts[0].mood.energy=1;
 const receiver=t.addQubit([x+.5,y,z]);assert(t.adaptCutter({g:receiver,part:receiver.parts[0]}));
 receiver.parts[0].mood.cutter.face=t.unitProfile('cube').faceNormals.findIndex(n=>n.x<-.9);
 receiver.parts[0].mood.energy=1;return g;
}
function setup(shape='cube'){const game=lab(),{t}=game,c=laser(t),target=t.addQubit([.3,t.unitGroundHeight(shape)+.003,0],shape==='cube'?1:shape==='pyramid'?1/6:1/12,shape);return {...game,c,target,id:c.parts[0].id};}
function tick(t,seconds=1/120){for(let i=0;i<Math.ceil(seconds*120);i++)t.tickCutters(1/120);}
function material(t){return t.groups.filter(g=>!g.parts[0].mood.cutter);}
function totalJ(t,groups){return groups.flatMap(g=>g.parts).reduce((n,p)=>n+p.mood.energy*t.gameBatteryCapacity(p),0);}
function move(g,x,y,z){g.body.position.set(x,y,z);g.body.aabbNeedsUpdate=true;}
function translate(g,z){move(g,g.body.position.x,g.body.position.y,g.body.position.z+z);}
test('adaptation preserves identity, mass and energy and exposes only automatic on/off operation',()=>{
 const {t,c}=setup(),p=c.parts[0],before={id:p.id,weight:p.weight,energy:p.mood.energy};
 assert(t.validCutterConfig(p.mood.cutter));assert.equal(p.mood.cutter.version,2);assert.equal(p.mood.cutter.mode,undefined);
 assert.equal(t.canAdaptCutter({g:c,part:p}),false);assert.equal(t.configureGripper(p.id),false);assert.deepEqual({id:p.id,weight:p.weight,energy:p.mood.energy},before);
});
test('first contact instantly partitions the cube into six physical pyramids with conserved mass, provenance, volume and joules',()=>{
 const {t,c,target,id}=setup(),root=target.parts[0].id,j=totalJ(t,[target]),before=totalJ(t,[c]),box=t.bounds(target);
 assert(t.setCutterEnabled(id,true));tick(t);const out=material(t);assert.equal(out.length,6,t.cutterRuns.get(id)?.status);
 assert(out.every(g=>g.parts[0].shape==='pyramid'&&g.parts[0].mood.matter.root===root));assert.equal(new Set(out.map(g=>g.parts[0].id)).size,6);
 assert(Math.abs(out.reduce((n,g)=>n+g.parts[0].weight,0)-1)<1e-10);assert(Math.abs(totalJ(t,out)-j)<1e-9);assert(Math.abs(before-totalJ(t,[c])-8)<1e-9);
 for(const g of out){const b=t.bounds(g);for(const k of ['x','y','z'])assert(b.min[k]>=box.min[k]-1e-8&&b.max[k]<=box.max[k]+1e-8,'pieces remain inside original volume');}
 tick(t,2);assert.equal(material(t).length,6,'remaining inside stripe cannot cascade');
});
test('a second stripe automatically cuts all six pyramids into twelve tetrahedra; a third destroys all twelve',()=>{
 const {t,c,target,id}=setup(),second=laser(t,0,.25),third=laser(t,0,.5),root=target.parts[0].id,j=totalJ(t,[target]);
 for(const g of [c,second,third])assert(t.setCutterEnabled(g.parts[0].id,true));tick(t);
 const pyramids=material(t);assert.equal(pyramids.length,6);for(const g of pyramids)translate(g,.25);tick(t);
 const halves=material(t);assert.equal(halves.length,12,t.cutterRuns.get(second.parts[0].id).status);assert(halves.every(g=>g.parts[0].shape==='tetra'&&g.parts[0].mood.matter.root===root));assert(Math.abs(totalJ(t,halves)-j)<1e-9);
 for(const g of halves)translate(g,.25);tick(t);assert.equal(material(t).length,0);assert.equal(t.world.bodies.filter(b=>b.qubitGroup).length,6);
 const saved=t.saveLab({passive:true});assert(saved.groups.every(g=>g.parts.every(p=>p.mood.matter?.root!==root)),'destroyed fragments are absent from durable scene inventory');
 tick(t,1);assert.equal(material(t).length,0);assert.match(t.cutterRuns.get(third.parts[0].id).status,/Esperando/);
});
test('standalone pyramid and smallest triangular piece need no mode selection',()=>{
 for(const shape of ['pyramid','tetra']){const {t,c,id}=setup(shape),before=totalJ(t,[c]);assert(t.setCutterEnabled(id,true));tick(t);
 assert.equal(material(t).length,shape==='pyramid'?2:0);assert(material(t).every(g=>g.parts[0].shape==='tetra'));assert(Math.abs(before-totalJ(t,[c])-8)<1e-9);}
});
test('same stripe on the opposite side and R/off-on cannot recut stationary descendants',()=>{
 const {t,c,id}=setup(),other=t.groups.find(g=>g!==c&&g.parts[0].mood.cutter);
 assert(other);assert(t.setCutterEnabled(id,true));assert(t.setCutterEnabled(other.parts[0].id,true));
 assert.equal(t.cutterRuns.size,2,'both heads share one powered stripe');tick(t,1);assert.equal(material(t).length,6);
 t.setCutterEnabled(id,false);t.setCutterEnabled(id,true);tick(t,1);assert.equal(material(t).length,6);
});
test('leaving the stripe rearms a piece for a new passage, but a distinct nearby stripe can cut immediately',()=>{
 const {t,id}=setup();t.setCutterEnabled(id,true);tick(t);const out=material(t);for(const g of out)translate(g,.3);tick(t);for(const g of out)translate(g,-.3);tick(t);assert.equal(material(t).length,12);
 const game=setup(),second=laser(game.t,0,.025);game.t.setCutterEnabled(game.id,true);game.t.setCutterEnabled(second.parts[0].id,true);tick(game.t);assert(material(game.t).some(g=>g.parts[0].shape==='tetra'));
});
test('swept contact catches a fast crossing even when both endpoints are outside the stripe',()=>{
 const {t,target,id}=setup();move(target,.3,.048,-.13);t.setCutterEnabled(id,true);tick(t);assert(t.groups.includes(target));move(target,.3,.048,.13);tick(t);assert.equal(material(t).length,6);
});
test('finite stripe height and range reject distant pieces',()=>{
 const {t,target,id}=setup();move(target,.7,.048,0);t.setCutterEnabled(id,true);tick(t);assert(t.groups.includes(target));
 move(target,.3,.3,0);t.setCutterEnabled(id,true);tick(t);assert(t.groups.includes(target));
});
test('overlapping output waits without consuming energy and resumes after clearing',()=>{
 const {t,c,target,id}=setup(),block=t.addQubit([.3,.048,.075]);block.parts[0].mood.gripper=t.copyGripperConfig();const before=totalJ(t,[c]);
 assert(t.setCutterEnabled(id,true));tick(t);assert(t.groups.includes(target));assert.match(t.cutterRuns.get(id).status,/ocupada/);assert.equal(totalJ(t,[c]),before);
 t.removeGroup(block);tick(t);assert.equal(material(t).length,6);
});
test('incompatible bodies and a real wall occlude a target behind them',()=>{
 for(const wall of [false,true]){const {t,target,id}=setup();if(wall)t.storyWall(t.V(.16,.06,0),t.V(.015,.06,.1));else{const block=t.addQubit([.16,.048,0]);block.parts[0].mood.gripper=t.copyGripperConfig();}
 assert(t.setCutterEnabled(id,true));tick(t,.1);assert(t.groups.includes(target));}
});
test('insufficient energy, manual stop, hidden tab and removed input are safe',()=>{
 const {t,c,target,id,sandbox}=setup();c.parts[0].mood.energy=.00001;assert.equal(t.setCutterEnabled(id,true),false);tick(t);assert(t.groups.includes(target));
 c.parts[0].mood.energy=1;assert(t.setCutterEnabled(id,true));sandbox.document.hidden=true;tick(t);assert(t.groups.includes(target));sandbox.document.hidden=false;
 t.setCutterEnabled(id,false);tick(t);assert(t.groups.includes(target));t.setCutterEnabled(id,true);t.removeGroup(target);tick(t);assert.equal(material(t).length,0);
});
test('taking emitter stops it; a held input or welded mechanism is not cut',()=>{
 const {t,c,target,id}=setup();t.setCutterEnabled(id,true);t.setHeld({items:[{g:c}]});tick(t);assert.equal(t.cutterRuns.get(id).enabled,false);assert(t.groups.includes(target));t.setHeld(null);
 t.setCutterEnabled(id,true);t.setHeld({items:[{g:target}]});tick(t);assert(t.groups.includes(target));t.setHeld(null);
 const other=t.addQubit([.3,.048,.09]);assert(t.weld({source:other,target,position:other.body.position.clone(),quaternion:other.body.quaternion.clone()}));tick(t);assert.equal(material(t).length,1);
});
test('legacy settings migrate to automatic mode; passage protection survives durable restoration and rejects malformed data',()=>{
 const {t,c,id}=setup();c.parts[0].mood.cutter={version:1,face:c.parts[0].mood.cutter.face,range:100,mode:'pyramid'};
 const record=t.mechanismSnapshot(c,'Legado');assert(t.savedMechanismValid(record));assert(t.spawnSavedMechanism(t.copySavedMechanism(record),t.V(1,0,0),t.Q()));
 assert.equal(t.groups.find(g=>g!==c&&g.parts[0].mood.cutter).parts[0].mood.cutter.version,2);
 t.setCutterEnabled(id,true);tick(t);const saved=t.saveLab({passive:true}),hydrated=t.hydrateLabSnapshot(JSON.parse(JSON.stringify(saved)));assert(hydrated.groups.some(g=>g.parts.some(p=>p.mood.cutPasses?.length)));
 t.clearNarrativeScene();for(const g of hydrated.groups)t.makeGroup(g.parts,g.q,g.v,g.w);
 const emitter=t.groups.find(g=>g.parts[0].id===id);assert(emitter);t.setCutterEnabled(id,true);tick(t);assert.equal(material(t).length,6);
 const bad=JSON.parse(JSON.stringify(saved));bad.groups.find(g=>g.parts[0].mood.cutPasses).parts[0].mood.cutPasses[0].normal=[0,0,0];assert.throws(()=>t.hydrateLabSnapshot(bad));
});
test('native editor blueprint is available and blue placement makes a working adapted cube',async()=>{
 const game=createGame({graphics:false}),{t,api,sandbox}=game;let ready=false;const boot=api.prepare().then(()=>ready=true);for(let i=0;i<30&&!ready;i++){game.frame();await Promise.resolve();await Promise.resolve();}await boot;
 sandbox.document.body.dataset.booting='false';api.menu();assert(api.sceneEditor.open().ok);assert(api.sceneEditor.catalog().some(i=>i.id==='cutter'));
 sandbox.document.pointerLockElement=t.canvas;t.setLook({camera:[0,1.7,2],yaw:0,pitch:-.65});assert(api.sceneEditor.beginPlacement('cutter').ok);assert(t.getCreationPreview().valid);
 t.onCanvasMouseDown({button:0,preventDefault(){}});assert.equal(t.groups.length,1);assert(t.validCutterConfig(t.groups[0].parts[0].mood.cutter));
 const snapshot=api.sceneEditor.capture();assert(snapshot.ok,snapshot.error);assert(api.sceneEditor.open(snapshot.data).ok);assert(t.groups[0].parts[0].mood.cutter);assert.equal(t.cutterRuns.size,0);
});
test('campaign public entry points remain restricted',()=>{const {t,c,id}=setup();t.story.scene='campaign';assert.equal(t.setCutterEnabled(id,true),false);delete c.parts[0].mood.cutter;assert.equal(t.adaptCutter({g:c,part:c.parts[0]}),false);});
test('partition remains stable during full Cannon stepping on the floor',()=>{
 const {t,c,id}=setup();t.setCutterEnabled(id,true);for(let i=0;i<240;i++)t.stepPhysics(1/120);
 assert.equal(material(t).length,6,t.cutterRuns.get(id)?.status);assert(t.groups.every(g=>t.world.bodies.includes(g.body)&&g.body.position.y>-.01));
 assert(material(t).every(g=>Math.hypot(g.body.position.x-.3,g.body.position.z)<.2),'split does not eject fragments');
});
test('cut children inherit rigid-body linear and angular velocity',()=>{
 const {t,target,id}=setup();target.body.velocity.set(.3,0,.2);target.body.angularVelocity.set(0,1,0);t.setCutterEnabled(id,true);tick(t);
 for(const g of material(t)){const offset=g.body.position.vsub(target.body.position),expected=target.body.velocity.vadd(target.body.angularVelocity.cross(offset));assert(g.body.velocity.distanceTo(expected)<1e-9);assert(g.body.angularVelocity.distanceTo(target.body.angularVelocity)<1e-9);}
});
test('external reservoir powers the contact transaction without using internal charge',()=>{
 const {t,c,id}=setup(),reservoir=t.createPowerReservoir(t.V(-1,0,0),{enabled:true}),stock=t.addQubit([1,.05,1]),from={kind:'reservoir',id:reservoir.id},to={kind:'part',id},parts=t.worldParts(stock);t.removeGroup(stock);
 assert(t.connectPowerCable(from,to,t.powerSurfaceRoute(from,to),parts).ok);t.updatePowerNetwork(1);const before=c.parts[0].mood.energy,r=reservoir.cell.mood.energy;
 assert(t.setCutterEnabled(id,true));tick(t);assert.equal(material(t).filter(g=>g.parts[0].shape==='pyramid').length,6);assert.equal(c.parts[0].mood.energy,before);assert(reservoir.cell.mood.energy<r);
});

test('powered conveyor carries one real cube through three mounted stripes: six pyramids, twelve tetrahedra, no remaining matter',()=>{
 const {t}=lab();assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight'),t.V()));const conveyor=t.conveyors.at(-1);let hit=t.rotorPart(conveyor.baseId);
 const at=hit.p.vadd(hit.q.vmult(t.V(0,0,-.09))),cell=t.addQubit(at.toArray()),battery=cell.parts[0];battery.mood.externalBattery={version:1,ownerId:battery.id,packId:battery.id,enabled:true};battery.mood.energy=1;
 assert(t.weld({source:cell,target:hit.g,position:cell.body.position.clone(),quaternion:cell.body.quaternion.clone()}));t.stepPhysics(1/240);
 hit=t.rotorPart(conveyor.baseId);const path=conveyor.path.map(p=>hit.p.vadd(hit.q.vmult(p))),emitters=[];
 for(const x of [-.11,.055,.21]){const g=t.addQubit([x,path[0].y+.048,-.4]);assert(t.adaptCutter({g,part:g.parts[0]}));g.parts[0].mood.cutter.face=t.unitProfile('cube').faceNormals.findIndex(n=>n.z>.9);g.parts[0].mood.energy=1;
  const receiver=t.addQubit([x,path[0].y+.048,.1]);assert(t.adaptCutter({g:receiver,part:receiver.parts[0]}));receiver.parts[0].mood.cutter.face=t.unitProfile('cube').faceNormals.findIndex(n=>n.z<-.9);emitters.push(g);
  t.storyWall(t.V(x,path[0].y/2,-.4),t.V(.045,path[0].y/2,.045));}
 const load=t.addQubit([path[0].x+.055,path[0].y+.055,0]),root=load.parts[0].id,descendants=()=>t.groups.filter(g=>g.parts[0].id===root||g.parts[0].mood.matter?.root===root);let six=false,twelve=false,done=false;
 assert(t.startConveyor(conveyor));for(const g of emitters)assert(t.setCutterEnabled(g.parts[0].id,true));
 for(let i=0;i<240*6;i++){t.stepPhysics(1/240);const remaining=descendants();six||=remaining.length===6&&remaining.every(g=>g.parts[0].shape==='pyramid');twelve||=remaining.length===12&&remaining.every(g=>g.parts[0].shape==='tetra');
  assert(remaining.every(g=>g.body.position.y>path[0].y-.02),'matter stays on the moving belt');if(!remaining.length){done=true;break;}}
 assert(six,'first stripe creates six pyramids');assert(twelve,'second stripe produces twelve smallest pieces');assert(done,'third stripe removes all matter before the end of the belt');assert(conveyor.running);
});

test('one laser cannot activate alone; facing receiver shares exactly one cutting beam',()=>{
 const {t}=lab(),source=t.addQubit([0,.048,0]);assert(t.adaptCutter({g:source,part:source.parts[0]}));
 const id=source.parts[0].id;assert.equal(t.setCutterEnabled(id,true),false);assert.equal(t.cutterRuns.size,0);
 const receiver=t.addQubit([.5,.048,0]);assert(t.adaptCutter({g:receiver,part:receiver.parts[0]}));
 receiver.parts[0].mood.cutter.face=t.unitProfile('cube').faceNormals.findIndex(n=>n.x<-.9);
 assert(t.setCutterEnabled(id,true));tick(t);assert.equal(t.cutterRuns.size,2);
 const beam=t.cutterRuns.get(id).beam;assert(Math.abs(beam.distance-.386)<.008);
 assert.equal(t.cutterRuns.get(receiver.parts[0].id).role,'receiver');
 assert(t.setCutterEnabled(receiver.parts[0].id,false));assert.equal(t.cutterRuns.size,0);
});
test('the opposite cube must face the source and remain aligned while activated',()=>{
 const {t,c,id}=setup(),other=t.groups.find(g=>g!==c&&g.parts[0].mood.cutter),config=other.parts[0].mood.cutter,face=config.face;
 config.face=c.parts[0].mood.cutter.face;assert.equal(t.setCutterEnabled(id,true),false);
 config.face=face;other.body.position.z+=.06;assert.equal(t.setCutterEnabled(id,true),false);
 other.body.position.z-=.06;assert(t.setCutterEnabled(id,true));tick(t);
 other.body.position.z+=.08;tick(t);
 assert.equal(t.cutterRuns.get(id).enabled,false);assert.equal(t.cutterRuns.get(other.parts[0].id).enabled,false);
});
