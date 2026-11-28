'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const game=require('./game-harness.cjs');
const Room=require('../assets/js/lab-room.js'),Feeder=require('../assets/js/ceiling-feeder.js');
const saves=require('../assets/js/save-games.js'),scenes=require('../assets/js/scene-files.js');
const preferences=require('../assets/js/preferences.js');
function lab(){
 const result=game({graphics:false}),{t,sandbox}=result;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.initUnitRadial();
 return result;
}
function size(t,patch){return t.configureRoom({...t.room,...patch});}
function wall(t,mount,height=1,x=0,z=0){
 const p=Feeder.mouth(mount,x,height,z,t.room),f=t.createCeilingFeeder(t.V(p.x,height,p.z),mount);
 assert(f,'mount fits '+mount);return f;
}
function change(t,f,patch){
 const {height,shape,rate,idle,enabled}=f;assert.equal(t.configureFeeder(f,{height,shape,rate,idle,enabled,...patch}),'');
}
function step(t,seconds,after){
 const dt=t.getPhysicsStep();
 for(let i=0;i<Math.round(seconds/dt);i++){t.stepSimulation(dt);after?.();}
}
test('Cuerpos applies rectangular bounds to the room shell, ray hits, floor placement and both quotas',()=>{
 const {t,sandbox}=lab(),doc=sandbox.document,bodyCount=t.world.bodies.length;
 const patch={width:38,length:10,height:6,partLimit:9,cargoLimit:4};
 for(const [key,value] of Object.entries(patch))doc.getElementById('room-'+key).value=value;
 doc.getElementById('room-settings').dispatchEvent({type:'submit'});
 assert.deepEqual({...t.room},patch);assert.equal(t.world.bodies.length,bodyCount);
 for(const [dir,distance,surface] of [[[1,0,0],19,'east'],[[0,0,-1],5,'north'],[[0,1,0],5,'ceiling']]){
  const from=t.V(0,1,0),to=t.V(...dir.map((v,i)=>v*50+from.toArray()[i])),hit=new sandbox.CANNON.RaycastResult();
  assert(t.world.raycastClosest(from,to,{},hit));assert.equal(t.roomWalls.get(hit.body),surface);
  assert(Math.abs(hit.distance-distance)<1e-6);
 }
 t.setLook({camera:[17,1.6,1],yaw:0,pitch:-1});assert(t.beginCreationPlacement('cube'));
 assert(t.confirmCreationPlacement());const cube=t.groups[0];assert(cube.body.position.x>15);
 assert.match(size(t,{width:12}),/fuera/);assert.equal(t.room.width,38);assert.equal(t.groups[0],cube);
 t.setLook({camera:[0,1.6,0],yaw:0,pitch:-1});
 assert.match(size(t,{width:7}),/medidas/);assert.match(size(t,{height:3}),/medidas/);
 assert.match(size(t,{partLimit:2001}),/medidas/);assert.match(size(t,{cargoLimit:65}),/medidas/);
});
test('placement uses the nearest structural wall and real aim height; the wheel and menu also reach low outlets',()=>{
 const {t,sandbox}=lab(),doc=sandbox.document;
 assert.equal(size(t,{width:12,length:8,height:4}),'');
 t.setLook({camera:[0,1.1,-2],yaw:0,pitch:-.15});
 assert(t.beginCreationPlacement('quick-ceiling-feeder'));const ghost=t.getCreationPreview();
 assert(ghost.valid,ghost.reason);assert.equal(ghost.mount,'north');assert.equal(ghost.point.y,.8);
 t.handleWheel({deltaY:-100,preventDefault(){}});assert.equal(ghost.point.y,.9);
 const f=t.confirmCreationPlacement();assert(f);assert.equal(f.mount,'north');assert.equal(f.height,.9);
 t.setLook({camera:[0,1.1,-2.1],yaw:0,pitch:Math.atan2(f.height-1.1,Math.abs(f.z+2.1))});
 assert.equal(t.aimCeilingFeeder()?.feeder,f);
 t.onCanvasMouseDown({button:0,preventDefault(){}});
 const height=doc.getElementById('feeder-height');assert.equal(Number(height.min),.3);assert.equal(Number(height.max),3.7);
 height.value='.4';doc.getElementById('feeder-form').dispatchEvent({type:'submit'});
 assert.equal(f.height,.4);
 t.setLook({camera:[0,.4,-2.1],yaw:0,pitch:0});t.addQubit([0,.4,-3]);
 assert.equal(t.aimCeilingFeeder(),null);assert(t.beginCreationPlacement('quick-ceiling-feeder'));
 assert.equal(t.getCreationPreview().valid,false,'foreground face cannot act as a room wall');
});
for(const hz of [60,120,240])test('four wall normals eject all four profiles along a falling arc at '+hz+' Hz',()=>{
 const {t}=lab();assert.equal(size(t,{width:10,length:8,height:5}),'');
 t.applyPreferences({...preferences.defaults(),physicsHz:hz});
 const fixtures=Object.keys(Feeder.walls).map((mount,i)=>{
  const f=wall(t,mount,.8);change(t,f,{rate:60,shape:Object.keys(Feeder.shapes)[i]});return f;
 });
 // At most two outlets emit per logic tick.
 step(t,1.15);assert.equal(t.groups.length,4);
 for(const f of fixtures)change(t,f,{enabled:false});
 const list=[...t.feederDrops].map(([g,d])=>({g,f:fixtures.find(f=>f.id===d.source),before:g.body.position.clone(),vy:g.body.velocity.y}));
 step(t,.15);
 for(const {g,f,before,vy} of list){
  const n=Feeder.walls[f.mount],p=g.body.position;
  assert(n.x*(p.x-before.x)+n.z*(p.z-before.z)>.14,'moves away from '+f.mount);
  assert(p.y<before.y-.045 && g.body.velocity.y<vy-.45,'gravity bends the flight');
 }
 step(t,4);
 for(const {g} of list){assert(Math.abs(t.bounds(g).min.y)<.003);assert(t.feederDrops.get(g).elapsed>0);}
});
test('resizing remounts ceiling pipes, wall outlets and shelves, and rejects cutting into a mechanism before moving anything',()=>{
 const {t}=lab(),f=wall(t,'east',1.2),ceiling=t.createCeilingFeeder(t.V(1,2.4,2));
 t.setLook({camera:[0,1.5,-12],yaw:0,pitch:0});assert(t.beginShelfPlacement(t.wallAim()));const shelf=t.confirmShelfPlacement();assert(shelf);
 const base=t.world.bodies.length;
 assert.equal(size(t,{width:20,length:36,height:7}),'');
 assert.equal(f.x,10-Feeder.wallLength);assert(Math.abs(shelf.p.z-(-18+.004))<1e-5);
 assert(Math.abs(ceiling.bounds.max.y-7)<1e-6);assert.equal(t.world.bodies.length,base);
 const obstacle=t.addQubit([7.8,1.2,0]);assert.match(size(t,{width:16}),/chocaría/);
 assert.equal(t.room.width,20);assert.equal(f.x,10-Feeder.wallLength);assert(t.groups.includes(obstacle));
 t.removeGroup(obstacle);assert.equal(size(t,{width:16}), '');
});
test('limits stop new pieces and loads, preserve excess already in the room across reload and resume when a slot opens',()=>{
 const {t}=lab(),f=wall(t,'west',.6);
 assert.equal(size(t,{width:40,cargoLimit:16,partLimit:2}),'');
 for(let i=0;i<14;i++)assert(t.newCargo(t.V(i-7,0,4),2,1,'#eeeeee'));
 const a=t.addQubit([2,.045,2]),b=t.addQubit([3,.045,2]);
 assert.equal(size(t,{cargoLimit:1,partLimit:1}),'');change(t,f,{rate:60});
 step(t,1.2);assert.equal(t.feederDrops.size,0);assert.match(f.blocked,/Límite/);
 assert.equal(t.newCargo(t.V(0,0,3)),null);
 t.setLook({camera:[0,1.6,1],pitch:-1,yaw:0});assert(t.beginCreationPlacement('cube'));assert.equal(t.confirmCreationPlacement(),null);
 const payload={snapshot:JSON.parse(JSON.stringify(t.saveLab({passive:true}))),alphaSettings:{...t.alphaSettings}};
 const doc=scenes.parse(JSON.stringify(scenes.pack('Sala larga',payload)));assert.equal(doc.inventory.mechanisms.at(-1).mount,'west');
 const {t:next}=lab();Object.assign(next.story,{scene:'intro',lab:next.hydrateLabSnapshot(doc.data.snapshot),labAlpha:doc.data.alphaSettings});next.enterLab(false);
 assert.deepEqual({...next.room},{...t.room});assert.equal(next.cargos.length,14);assert.equal(next.groups.length,2);
 assert.equal(next.ceilingFeeders[0].x,-20+Feeder.wallLength);
 t.removeGroup(a);step(t,.35);assert.equal(t.feederDrops.size,0);
 t.removeGroup(b);step(t,.35);assert.equal(t.feederDrops.size,1);
 next.startPuzzle();assert.deepEqual({...next.room},Room.defaults);assert.equal(next.cargos.length,3);
 next.leavePuzzle();assert.equal(next.room.cargoLimit,1);assert.equal(next.cargos.length,14);
 for(const mutate of [s=>s.room.width=99,s=>s.room=null,s=>s.ceilingSupply.fixtures[0].mount='floor',s=>s.ceilingSupply.fixtures[0].x=0]){
  const invalid=structuredClone(payload);mutate(invalid.snapshot);assert.equal(saves.validate('lab',invalid).ok,false);assert.throws(()=>t.hydrateLabSnapshot(invalid.snapshot));
 }
});
test('old ceiling-only saves retain their vertical supply in the original room',()=>{
 const {t}=lab();const f=t.createCeilingFeeder(t.V(1,2.3,2));change(t,f,{rate:60});
 const data={snapshot:JSON.parse(JSON.stringify(t.saveLab())),alphaSettings:{...t.alphaSettings}};
 delete data.snapshot.room;delete data.snapshot.ceilingSupply.fixtures[0].mount;
 assert.equal(saves.validate('lab',data).ok,true);
 assert.equal(size(t,{width:40,height:18}), '');
 Object.assign(t.story,{scene:'intro',lab:t.hydrateLabSnapshot(data.snapshot)});t.enterLab(false);
 assert.deepEqual({...t.room},Room.defaults);assert.equal(t.ceilingFeeders[0].mount,'ceiling');
 step(t,1);assert.equal(t.groups[0].body.velocity.norm(),0);
});
test('a wall outlet waits behind a blocked mouth, then feeds a powered belt that carries the same cube',()=>{
 const {t}=lab();assert.equal(size(t,{width:8,length:8,height:4}),'');
 assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight',true),t.V(-3.05,0,0)));
 const c=t.conveyors[0],base=t.rotorPart(c.baseId),p=base.p.clone();p.y+=.09;
 const battery=t.addQubit(p.toArray()),cell=battery.parts[0];
 cell.mood.externalBattery={version:1,ownerId:cell.id,packId:cell.id,enabled:true};cell.mood.energy=1;
 assert(t.weld({source:battery,target:base.g,position:battery.body.position.clone(),quaternion:battery.body.quaternion.clone()}));
 step(t,.5);assert(t.startConveyor(c));
 const f=wall(t,'west',.8,0,t.conveyorSurfacePoses(c)[0].p.z);change(t,f,{rate:60,idle:1});
 const obstruction=t.storyWall(t.V(f.x+.03,f.height,f.z),t.V(.04,.08,.08));
 step(t,2);assert.equal(t.feederDrops.size,0);assert.equal(f.blocked,'Salida ocupada');
 t.world.removeBody(obstruction.body);t.storyWorld.walls.splice(t.storyWorld.walls.indexOf(obstruction),1);
 step(t,.3);assert.equal(t.feederDrops.size,1);change(t,f,{enabled:false});
 const cube=[...t.feederDrops.keys()][0];let first,last,contactTime=0;
 step(t,4,()=>{
  if(t.world.contacts.some(e=>e.bi===cube.body&&e.bj===c.surfaceBody||e.bj===cube.body&&e.bi===c.surfaceBody)){
   first??=cube.body.position.x;last=cube.body.position.x;contactTime+=t.getPhysicsStep();
   assert.equal(t.feederDrops.get(cube).elapsed,0);
  }
 });
 assert(contactTime>.2);assert(last-first>.2);
});
