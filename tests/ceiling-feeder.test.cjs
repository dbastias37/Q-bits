'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');
const model = require('../assets/js/ceiling-feeder.js');
const preferences = require('../assets/js/preferences.js');
const saves = require('../assets/js/save-games.js');
const scenes = require('../assets/js/scene-files.js');

function lab(hz=60) {
 const game=createGame({graphics:false}), {t,sandbox}=game;
 t.clearNarrativeScene();
 Object.assign(t.story,{ready:true,started:true,mode:'playing',scene:'lab',phase:'idle',progress:{}});
 sandbox.document.body.dataset.booting='false';
 sandbox.document.pointerLockElement=t.canvas;
 t.applyPreferences({...preferences.defaults(),physicsHz:hz});
 return game;
}
function settings(t,f,patch) {
 const {height,shape,rate,idle,enabled}=f;
 assert.equal(t.configureFeeder(f,{height,shape,rate,idle,enabled,...patch}),'');
}
function run(t,seconds,after) {
 const dt=t.getPhysicsStep();
 for(let i=0;i<Math.round(seconds/dt);i++){t.stepSimulation(dt);after?.();}
}
function add(t,x=0,height=2.5,z=0) {
 const f=t.createCeilingFeeder(t.V(x,height,z));assert(f,'ceiling fixture fits');return f;
}

test('live ceiling/floor placement, wheel, actual clicks, configuration and foreground occlusion',()=>{
 const {t,sandbox}=lab(),doc=sandbox.document,bodies=t.world.bodies.length;
 t.setLook({camera:[0,1.7,1.2],yaw:0,pitch:1.54});
 t.initUnitRadial();
 assert(t.beginCreationPlacement('quick-ceiling-feeder'));
 let ghost=t.getCreationPreview();assert(ghost.valid,ghost.reason);assert.equal(t.world.bodies.length,bodies);
 doc.dispatchEvent({type:'pointerlockerror'});
 assert.equal(t.getCreationPreview(),ghost,'late raw-input rejection preserves the chosen ghost');
 t.handleWheel({deltaY:-120,preventDefault(){}});assert.equal(ghost.elevation,2.6);
 t.setLook({camera:[0,1.7,1.2],yaw:0,pitch:-.8});assert(t.updateCreationPlacement());
 const p=ghost.point.clone(),f=t.confirmCreationPlacement();
 assert(f);assert.equal(f.height,2.6);assert.equal(t.groups.length,0);assert.equal(t.world.bodies.length,bodies+1);
 assert.equal(t.createCeilingFeeder(p),null,'same shaft cannot be installed twice');
 assert.equal(t.createCeilingFeeder(t.V(13.99,2.5,0)),null);
 t.setLook({camera:[p.x,1.7,p.z+.01],yaw:0,pitch:Math.PI/2});
 assert.equal(t.aimCeilingFeeder()?.feeder,f);
 t.onCanvasMouseDown({button:0,preventDefault(){}});
 const field=id=>doc.getElementById('feeder-'+id);
 assert.equal(field('form').hidden,false);
 field('height').value='2.9';field('rate').value='37';field('idle').value='8';field('shape').value='coupler';field('enabled').checked=false;
 field('form').dispatchEvent({type:'submit'});
 assert.deepEqual([f.height,f.rate,f.idle,f.shape,f.enabled],[2.9,37,8,'coupler',false]);
 assert.equal(t.world.bodies.length,bodies+1,'changing height replaces one compound collider');
 t.addQubit([p.x,2.1,p.z+.01]);
 assert.equal(t.aimCeilingFeeder(),null,'nearer physical material owns the click');
 t.removeCeilingFeeder(f);assert.equal(t.ceilingFeeders.length,0);assert.equal(t.storyWorld.walls.length,0);
});

for(const hz of [60,120,240])test('all four profiles emerge behind the curtain and land at '+hz+' Hz',()=>{
 const {t}=lab(hz),list=Object.keys(model.shapes).map((shape,i)=>{
  const f=add(t,i,3);settings(t,f,{shape,rate:60,idle:30});return f;
 });
 run(t,1.15);
 assert.equal(t.groups.length,4);
 for(const f of list)settings(t,f,{enabled:false});
 let minFloor=Infinity;
 run(t,1.7,()=>{for(const g of t.groups)minFloor=Math.min(minFloor,t.bounds(g).min.y);});
 assert(minFloor>-.003,'lowest vertex '+minFloor);
 for(const g of t.groups){
  assert.equal(g.parts[0].shape,list[Math.round(g.body.position.x)].shape);
  assert(Math.abs(t.bounds(g).min.y)<.002);
  assert(t.feederDrops.get(g).elapsed>.6,'timer starts on the floor');
 }
 assert.equal(t.getPhysicsStep(),1/hz);
 const checks=lab(hz).t,f=add(checks,0,3);settings(checks,f,{rate:60,shape:'coupler'});
 run(checks,1);
 const born=checks.groups[0];assert(born);assert.equal(born.body.velocity.norm(),0);
 assert(checks.bounds(born).min.y>=3+model.curtainY,'first visible surface starts above the black membrane');
 assert.equal(born.body.position.x,0);assert.equal(born.body.position.z,0);
});

test('a hand protects its piece and a released drop gets a fresh floor interval',()=>{
 const {t}=lab(),f=add(t),other=add(t,1);
 settings(t,f,{rate:60,idle:2});settings(t,other,{rate:60,idle:2});
 const handmade=t.addQubit([2,.045,0]);
 run(t,1);settings(t,f,{enabled:false});settings(t,other,{enabled:false});
 const loose=t.groups[1],chosen=t.groups[2];
 run(t,1.6);assert(t.feederDrops.get(chosen).elapsed>.3);
 t.setLook({camera:[1,1.7,0],pitch:Math.PI/2,yaw:0});
 t.grabQubit({g:chosen,part:chosen.parts[0],point:chosen.body.position.clone(),distance:.9});
 assert.equal(t.feederDrops.get(chosen).elapsed,0);
 run(t,3.2);assert(t.groups.includes(chosen));assert(!t.groups.includes(loose));
 t.releaseQubit();t.setSelected(null);t.setMultiSelection([]);
 run(t,1);assert(t.groups.includes(chosen));
 run(t,4);assert(!t.groups.includes(chosen));assert(t.groups.includes(handmade));
 assert.equal(t.feederDrops.size,0);assert.equal(loose.body.world,null);
});

test('the actual gripper holds a floor drop past its timeout, then releases it to a full fresh interval',()=>{
 const {t,sandbox}=lab(),f=add(t);settings(t,f,{rate:60,idle:2});
 run(t,1);settings(t,f,{enabled:false});run(t,1.7);
 const drop=t.groups[0],p=drop.body.position,record=t.feederDrops.get(drop);
 assert(record.elapsed>.5);
 const hand=t.addQubit([p.x,p.y+.10,p.z]),id=hand.parts[0].id;
 hand.body.mass=0;hand.body.type=sandbox.CANNON.Body.STATIC;hand.body.updateMassProperties();
 assert(t.configureGripper(id,{}));assert(t.gripperGrab(id));
 run(t,3);assert(t.robotGrips.has(id));assert.equal(record.elapsed,0);
 assert(t.releaseGripper(id));t.removeGroup(hand);
 run(t,1.3);assert(t.groups.includes(drop));run(t,1.4);assert(!t.groups.includes(drop));
});

test('a selection resets sleeping floor pieces, and material joined to a mechanism stays in the room',()=>{
 const {t}=lab(),f=add(t),other=add(t,1);
 for(const fixture of [f,other])settings(t,fixture,{rate:60,idle:2});
 run(t,1);for(const fixture of [f,other])settings(t,fixture,{enabled:false});run(t,1.8);
 const [first,second]=t.groups;
 assert(t.selectFromHud(first.body.id));assert(t.selectFromHud(second.body.id,{toggle:true}));
 run(t,3);assert.equal(t.feederDrops.get(first).elapsed,0);assert.equal(t.feederDrops.get(second).elapsed,0);
 t.setSelected(null);t.setMultiSelection([]);
 const pos=second.body.position,part=t.addQubit([pos.x+.09,pos.y,pos.z]);
 assert(t.weld({source:part,target:second,position:part.body.position.clone(),quaternion:part.body.quaternion.clone()}));
 t.setSelected(null);t.setMultiSelection([]);run(t,1);assert(t.groups.includes(first));
 run(t,2);assert(!t.groups.includes(first));assert(t.groups.some(g=>g.parts.length===2));
 assert.equal(t.feederDrops.size,0);
});

test('the outlet waits for clearance, freezes with the simulation and never backfills missed pieces',()=>{
 const {t,sandbox}=lab(),f=add(t);
 settings(t,f,{rate:60,idle:30});
 const block=t.addQubit([f.x,f.height+.065,f.z]);block.body.type=sandbox.CANNON.Body.STATIC;block.body.updateMassProperties();
 run(t,5);assert.equal(t.feederDrops.size,0);assert.equal(f.blocked,'Salida ocupada');
 t.removeGroup(block);run(t,.3);assert.equal(t.feederDrops.size,1);
 sandbox.document.hidden=true;const wait=f.wait;assert.equal(t.advanceSimulation(1000),0);assert.equal(f.wait,wait);
 sandbox.document.hidden=false;t.advanceSimulation(1000);assert.equal(t.feederDrops.size,1);
 run(t,.4);assert.equal(t.feederDrops.size,1);
 t.startPuzzle();assert.equal(t.ceilingFeeders.length,0);assert.equal(t.createCeilingFeeder(t.V(1,2.5,0)),null);
 run(t,1);assert.equal(t.feederDrops.size,0);t.leavePuzzle();assert.equal(t.feederDrops.size,1);
 t.story.scene='campaign';t.tickCeilingFeeders(1);assert.equal(t.feederDrops.size,1);
});

test('deleting or saving a fixture keeps the remaining floor time and old scenes stay empty',()=>{
 const {t}=lab(),f=add(t);
 settings(t,f,{rate:60,idle:4});run(t,1.1);settings(t,f,{enabled:false});run(t,1.8);
 const p=t.groups[0],previous=t.feederDrops.get(p).elapsed;
 assert(previous>.8);t.removeCeilingFeeder(f);
 const data={snapshot:JSON.parse(JSON.stringify(t.saveLab({passive:true}))),alphaSettings:{...t.alphaSettings}};
 assert(saves.validate('lab',data).ok);
 const doc=scenes.pack('Caída',data);
 assert.equal(scenes.parse(JSON.stringify(doc)).data.snapshot.ceilingSupply.loose[0].partId,p.parts[0].id);
 const {t:next}=lab();Object.assign(next.story,{scene:'intro',lab:next.hydrateLabSnapshot(data.snapshot),labAlpha:data.alphaSettings});next.enterLab(false);
 assert.equal(next.feederDrops.get(next.groups[0]).elapsed,previous);assert.equal(next.ceilingFeeders.length,0);
 const replacement=add(next,1);assert.notEqual(replacement.id,f.id);settings(next,replacement,{enabled:false});
 run(next,4-previous+.25);assert.equal(next.feederDrops.size,0);assert.equal(next.groups.length,0);
 for(const change of [s=>s.loose.push({...s.loose[0]}),s=>s.loose[0].elapsed=-1,s=>s.loose[0].partId=99999,
   s=>s.fixtures.push({...model.defaults,id:1,x:50,z:0,wait:1}),s=>s.fixtures=Array(13).fill({})]){
  const corrupt=structuredClone(data);change(corrupt.snapshot.ceilingSupply);assert.equal(saves.validate('lab',corrupt).ok,false);
  assert.throws(()=>t.hydrateLabSnapshot(corrupt.snapshot));
 }
 delete data.snapshot.ceilingSupply;assert(saves.validate('lab',data).ok);assert(t.hydrateLabSnapshot(data.snapshot));
});

test('a saved running outlet resumes its settings and phase at the same delivery position',()=>{
 const {t}=lab(),f=add(t,-2,2.3,4);settings(t,f,{rate:29,shape:'tetra',idle:17});run(t,.7);
 const data={snapshot:JSON.parse(JSON.stringify(t.saveLab({passive:true}))),alphaSettings:{...t.alphaSettings}};
 const doc=scenes.pack('Prueba',data);
 assert.equal(doc.inventory.systems.ceilingFeeders,1);assert.equal(doc.inventory.mechanisms.at(-1).rate,29);
 const {t:next}=lab();Object.assign(next.story,{scene:'intro',lab:next.hydrateLabSnapshot(data.snapshot),labAlpha:data.alphaSettings});next.enterLab(false);
 const other=next.ceilingFeeders[0];assert.deepEqual([other.x,other.z,other.height,other.idle,other.rate,other.shape,other.wait],[-2,4,2.3,17,29,'tetra',f.wait]);
 run(next,f.wait-.1);assert.equal(next.groups.length,0);run(next,.25);assert.equal(next.groups.length,1);
});

test('a running physical belt receives the drop, transports it, then the unattended floor timer starts',()=>{
 const {t}=lab();
 assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight',true),t.V()));
 const c=t.conveyors[0],base=t.rotorPart(c.baseId),p=base.p.clone();p.y+=.09;
 const battery=t.addQubit(p.toArray()),cell=battery.parts[0];
 cell.mood.externalBattery={version:1,ownerId:cell.id,packId:cell.id,enabled:true};cell.mood.energy=1;
 assert(t.weld({source:battery,target:base.g,position:battery.body.position.clone(),quaternion:battery.body.quaternion.clone()}));
 run(t,.5);assert(t.startConveyor(c));
 const surface=t.conveyorSurfacePoses(c)[0],at=surface.p.vadd(surface.q.vmult(t.V(-.15,0,0)));
 const f=add(t,at.x,3,at.z);settings(t,f,{rate:60,idle:1});run(t,1.05);settings(t,f,{enabled:false});
 const g=Array.from(t.feederDrops.keys())[0];assert(g);let touched=false,travel=0;
 run(t,7,()=>{
  const contact=t.world.contacts.find(eq=>eq.bi===g.body&&eq.bj===c.surfaceBody||eq.bi===c.surfaceBody&&eq.bj===g.body);
  if(contact&&t.feederDrops.has(g)){touched=true;travel=Math.max(travel,g.body.position.x-at.x);assert.equal(t.feederDrops.get(g).elapsed,0);}
 });
 assert(touched,'real Cannon contact');assert(travel>.12,'belt carries the load');assert(!t.groups.includes(g),'loose piece expires downstream');
});

test('a sleeping pile wakes when its floor support expires and clears to baseline',()=>{
 const {t}=lab(),f=add(t);settings(t,f,{idle:5,rate:60});
 run(t,4.1);settings(t,f,{enabled:false});assert.equal(t.feederDrops.size,4);
 run(t,25);assert.equal(t.groups.length,0);assert.equal(t.feederDrops.size,0);
});

test('fixture, loose inventory and room population caps back off and resume without bursts',()=>{
 const {t}=lab();t.world.gravity.set(0,0,0);
 const fixtures=Array.from({length:model.limits.fixtures},(_,i)=>add(t,i-6));
 assert.equal(t.createCeilingFeeder(t.V(7,2.5,0)),null);
 for(const f of fixtures)settings(t,f,{rate:60,idle:600});
 for(let step=0;step<15*10;step++){
  const before=t.feederDrops.size;t.tickCeilingFeeders(1/15);
  assert(t.feederDrops.size-before<=2);
  for(const g of t.feederDrops.keys())if(g.body.position.y>2){g.body.position.y=1;g.body.aabbNeedsUpdate=true;}
 }
 assert.equal(t.feederDrops.size,model.limits.loose);
 assert.equal(new Set(Array.from(t.feederDrops.values(),p=>p.source)).size,fixtures.length,'all emitters get a turn');
 const oldest=t.feederDrops.keys().next().value;t.removeGroup(oldest);
 for(let i=0;i<15;i++)t.tickCeilingFeeders(1/15);
 assert.equal(t.feederDrops.size,model.limits.loose);
 t.clearNarrativeScene();assert.equal(t.ceilingFeeders.length+t.feederDrops.size,0);
 const other=lab().t,fixture=add(other);settings(other,fixture,{rate:60});
 for(let i=0;i<2000;i++)other.addQubit([4+(i%40)*.1,.05,3+Math.floor(i/40)*.1]);
 for(let i=0;i<30;i++)other.tickCeilingFeeders(1/15);
 assert.equal(other.groups.length,2000);assert.equal(fixture.blocked,'Límite de piezas de la sala');
 other.removeGroup(other.groups.at(-1));for(let i=0;i<5;i++)other.tickCeilingFeeders(1/15);
 assert.equal(other.groups.length,2000);assert.equal(other.feederDrops.size,1);
});

test('37 pieces per simulated minute keep the fractional cadence across saves, with no new bodies from the preview',()=>{
 const {t}=lab(),f=add(t);settings(t,f,{rate:37});
 let made=0;
 for(let i=0;i<60*15;i++){
  t.tickCeilingFeeders(1/15);
  for(const g of t.feederDrops.keys()){made++;t.removeGroup(g);}
 }
 assert.equal(made,37);
 const before=t.world.bodies.length;
 t.initUnitRadial();t.setLook({camera:[2,1.7,1],pitch:-.8,yaw:0});
 assert(t.beginCreationPlacement('quick-ceiling-feeder'));
 for(let i=0;i<100;i++){
  t.handleWheel({deltaY:i%2?100:-100,preventDefault(){}});
  t.updateCreationPlacement();
 }
 assert.equal(t.world.bodies.length,before);
 t.onCanvasMouseDown({button:2,preventDefault(){}});assert.equal(t.groups.length,0);
});

test('repeated tetrahedron and coupler impacts cannot push a sleeping floor piece through the floor',()=>{
 const {t}=lab(),fixtures=['tetra','coupler'].map((shape,i)=>{
  const f=add(t,i,3);settings(t,f,{shape,rate:60,idle:2});return f;
 });
 let low=Infinity;
 run(t,9,()=>{for(const g of t.groups)low=Math.min(low,t.bounds(g).min.y);});
 assert(low>=-.00151,'lowest corner in the pile '+low);
 for(const f of fixtures)t.removeCeilingFeeder(f);
 run(t,30);assert.equal(t.groups.length,0);assert.equal(t.feederDrops.size,0);
});
