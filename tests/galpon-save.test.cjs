// Cross-instance recovery from durable bytes using the real scene, Cannon and
// game store. The harness stubs drawing and input capture.
const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const saves=require('../assets/js/save-games.js');
const production=require('../assets/js/galpon-production.js');
const plain=x=>JSON.parse(JSON.stringify(x));

function memory(){
 const values=new Map();
 return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))};
}
function instance(storage,workers=null){
 const game=createGame({storage,graphics:false});
 game.t.story.ready=true;
 if(workers!==null)game.t.beginHangarGame({workers,workerLimit:12});
 return game;
}
function saved(t){
 const result=t.saveCurrentGame();assert(result.ok,result.error);return result.save.data;
}
function continueFrom(storage){
 const g=instance(storage);assert(g.t.hasHangarSave());
 assert(g.t.continueHangarGame(),g.t.saveSession.message);
 assert.deepEqual([...g.t.saveSession.restoreWarnings],[]);return g.t;
}
function extract(t){
 const s=t.story.galpon;
 production.tick(s,.65,{extracting:true});
 const raw=production.extract(s,t.allocateUnitId());assert(raw);
 return {s,raw};
}
test('a partially paid chamber survives reload with its original ID, time, charge and physical output reservation',()=>{
 const storage=memory(),{t}=instance(storage,1),{s,raw}=extract(t);
 assert(production.take(s,raw.id,s.initialIds));assert(production.store(s,raw.id,s.initialIds));
 assert(production.start(s,'converter',raw.id,'cube'));
 t.story.hangarWorld.outputs.converter={place:'cube',slot:3};
 production.tick(s,.37,{extracting:false});
 const before=saved(t);
 assert.equal(storage.values.size,1);
 const restored=continueFrom(storage),again=saved(restored);
 assert.deepEqual(plain(again.production),plain(before.production));
 assert.deepEqual(plain(again.world),plain(before.world));
 assert.equal(restored.groups.length,1);
 restored.tickHangarWorld(.44);restored.tickHangarWorld(.13);
 assert.equal(restored.groups.filter(g=>g.parts.some(p=>p.id===raw.id)).length,1);
 assert.equal(restored.story.galpon.extracted,1);
 assert.equal(restored.story.galpon.jobs.converter,null);
 assert.equal(restored.story.galpon.spent.charge,s.spent.charge);
 assert.equal(storage.values.has(saves.KEYS.lab),false);
 assert.equal(storage.values.has(saves.KEYS.campaign),false);
});

test('a moving raw load resumes its actual waypoint, velocities, original crew and following offsets',()=>{
 const storage=memory(),{t}=instance(storage,4),{s,raw}=extract(t);
 const crew=t.groups.slice(0,2),c=t.newCargo(t.V(-.8,0,2.0),1,2,'#555555',raw.id);
 assert(c&&t.hangarTakeSource(c,crew,false));assert(t.beginHaul(c,crew,t.V(.4,0,2.0)));
 // Install a known two-waypoint route on the real assigned hauling job.
 const job=c.job;c.pathSearch=null;job.phase='arrastrando';job.path=[t.V(-.4,0,2),t.V(.4,0,2)];job.index=1;job.activeCount=2;
 for(const slot of job.slots){slot.ready=true;slot.approachPath=[t.V(-.8,0,2)];slot.approachIndex=0;}
 c.body.type=1;c.body.mass=.25;c.body.updateMassProperties();c.body.velocity.set(.11,0,.02);
 const before=saved(t),restored=continueFrom(storage),out=restored.cargos[0],again=saved(restored);
 assert.equal(out.id,c.id);assert.equal(out.rawId,raw.id);assert.equal(out.body.mass,c.body.mass);
 assert.deepEqual(plain(out.body.velocity),plain(c.body.velocity));
 assert.equal(out.job.index,1);assert.equal(out.job.phase,'arrastrando');
 assert.deepEqual(plain(again.snapshot.cargos[0].haul),plain(before.snapshot.cargos[0].haul));
 assert.deepEqual(plain(again.production),plain(before.production));assert.equal(s.extracted,1);
 for(const slot of out.job.slots)assert.equal(slot.g.haulJob,out.job);
});

test('a rolling worker continues from the same turn and advances to the same pose on its next step',()=>{
 const storage=memory(),{t}=instance(storage,1),g=t.groups[0],goal=t.V(2,0,3);
 g.body.position.set(1,.046,3);
 const segment=t.makeRollSegment(g,0);assert(segment);segment.t=.29;
 g.route={steps:[0],index:0,preview:[segment.endP],strides:[segment.stride],goal,segment,align:null};
 g.pin={point:goal,arrived:false};g.body.type=4;g.body.updateMassProperties();
 t.updateRoutes(.01);const before=saved(t),r=continueFrom(storage),g2=r.groups[0];
 assert.equal(g2.route.segment.t,g.route.segment.t);
 assert.equal(r.hangarRoutesSnapshot()[0].id,before.routes[0].id);
 t.updateRoutes(.01);r.updateRoutes(.01);
 assert(g2.body.position.distanceTo(g.body.position)<1e-9);
 assert(Math.abs(g2.body.quaternion.w-g.body.quaternion.w)<1e-9);
});

test('world identity, raw effort, provenance and active path corruption preserve the previous durable slot',()=>{
 const storage=memory(),{t}=instance(storage,1),{raw}=extract(t);
 assert(t.newCargo(t.V(-1,0,1),1,1,'#555555',raw.id));const base=saved(t);
 const original=storage.getItem(saves.KEYS.galpon);
 for(const mutate of [
  d=>d.snapshot.groups[0].parts[0].id++,
  d=>d.snapshot.groups[0].parts[0].mood.matter.root++,
  d=>d.snapshot.groups[0].parts[0].mood.energy-=.1,
  d=>d.snapshot.cargos[0].required=2,
  d=>d.snapshot.cargos=[],
  d=>d.routes=[{id:999}],
  d=>d.production.extracted++
 ]){
  const bad=plain(base);mutate(bad);
  const attempt=t.saveStore.write('galpon',bad);
  assert.equal(attempt.ok,false);assert.equal(storage.getItem(saves.KEYS.galpon),original);
 }
 storage.setItem(saves.KEYS.campaign,'other campaign');storage.setItem(saves.KEYS.lab,'other bench');
 const corrupt=JSON.parse(original);corrupt.data.world.deliveries=[{id:raw.id,crew:[999]}];
 storage.setItem(saves.KEYS.galpon,JSON.stringify(corrupt));
 const reader=instance(storage);assert.equal(reader.t.hasHangarSave(),false);assert.equal(reader.t.continueHangarGame(),false);
 assert.equal(reader.t.story.started,false);
 assert.equal(storage.getItem(saves.KEYS.campaign),'other campaign');assert.equal(storage.getItem(saves.KEYS.lab),'other bench');
});

test('a paid straight conveyor resumes its real motors with all thirty material IDs and the single plant supply',()=>{
 const storage=memory(),{t}=instance(storage,4),s=t.story.galpon,ids=[];
 for(let i=0;i<30;i++){
  const {raw}=extract(t);
  assert(production.take(s,raw.id,[s.initialIds[0]]));assert(production.store(s,raw.id,[s.initialIds[0]]));
  assert(production.start(s,'converter',raw.id,'cube'));production.tick(s,.8);let part=production.finish(s,'converter');
  production.tick(s,12);
  if(i>=18){assert(production.start(s,'former',raw.id,'coupler'));production.tick(s,.55);part=production.finish(s,'former');production.tick(s,12);}
  const g=t.hangarMakePart(part,t.V(4+i%6*.18,.047,3+Math.floor(i/6)*.18));assert(g);ids.push(raw.id);
 }
 assert(t.buildHangarSegment(),t.hangarLineStatus().message);
 assert(t.setHangarLineRunning(true),t.hangarLineStatus().message);
 const a=saved(t),r=continueFrom(storage),again=saved(r);
 assert.equal(r.getHangarSections().length,1);assert(r.getHangarSections()[0].running);
 assert.deepEqual(plain(again.line),plain(a.line));
 assert.deepEqual(plain(again.production),plain(a.production));
 assert.equal(again.snapshot.rotors.length,a.snapshot.rotors.length);
 assert.deepEqual([...r.getHangarSections()[0].required].sort((a,b)=>a-b),ids);
});

test('a received product keeps its physical family, original energy and receipt record',()=>{
 const storage=memory(),{t}=instance(storage,4),s=t.story.galpon;
 const {raw}=extract(t),crew=[s.initialIds[0]];
 assert(production.take(s,raw.id,crew));assert(production.store(s,raw.id,crew));
 assert(production.start(s,'converter',raw.id,'cube'));production.tick(s,1);
 const r=production.finish(s,'converter');production.tick(s,2,{activeCoolingIds:[r.id]});
 const g=t.hangarMakePart(r,t.V(3,.045,2));
 const made=t.groupIntoFamilies([g],{name:'Test galpón'});
 assert(made&&made.length===1);
 const stock=production.record(s,r.id);
 // Fixture at the receiver, using the same real family representation.
 assert(production.markReleased(s,[r.id],stock.group));assert(production.receive(s,[r.id],'family:'+made[0].id));
 const before=saved(t),loaded=continueFrom(storage),again=saved(loaded);
 assert.equal(loaded.families.length,1);assert.equal(loaded.families[0].id,made[0].id);
 assert.equal(loaded.story.galpon.received,1);
 assert.deepEqual(plain(again.production),plain(before.production));
 assert.equal(loaded.familyInventoryCount(),1);assert.equal(loaded.groups.length,4);
 assert(loaded.beginFamilyPlacement(loaded.families[0],'withdraw',1));
 assert(loaded.confirmFamilyPlacement({point:loaded.V(2,0,3),normal:loaded.V(0,1,0)}));
 const released=saved(loaded),after=continueFrom(storage);
 assert.equal(after.families.length,0);assert.equal(after.groups.length,5);
 assert.equal(after.story.galpon.received,1);assert.deepEqual(plain(released.production),plain(after.story.galpon));
});

test('saving a divided worker preserves all six fractional pieces, their original charge and one labor slot',()=>{
 const storage=memory(),{t}=instance(storage,1),g=t.groups[0],origin=g.parts[0].id,p=t.hangarTray('former',0);
 g.body.position.set(p.x,t.unitGroundHeight(g.parts[0].shape)+.001,p.z);g.parts[0].mood.energy=.37;
 assert(t.hangarReconfigure('divide'));const before=saved(t),r=continueFrom(storage);
 assert.equal(r.groups.length,6);assert.equal(production.population(r.story.galpon),1);
 assert(r.story.galpon.records.every(part=>part.origin===origin&&part.weight===1/6&&part.energy===.37));
 assert.deepEqual(plain(saved(r).production),plain(before.production));
});

for(const family of [false,true])test('the hand keeps its '+(family?'family':'worker')+' and physical grip across reload',()=>{
 const storage=memory(),game=instance(storage,1),{t,sandbox}=game;
 sandbox.document.pointerLockElement=t.canvas;
 const g=t.groups[0];
 if(family){
  const group=t.groupIntoFamilies([g],{name:'Equipo'});assert(group);
  assert(t.grabFamily({family:group[0],point:group[0].body.position.clone(),distance:1.2}));
 }else t.grabQubit({g,part:g.parts[0],point:g.body.position.clone(),distance:1.2});
 assert(t.getHeld());const before=saved(t),r=continueFrom(storage);
 assert(r.getHeld());assert.deepEqual(plain(saved(r).grip),plain(before.grip));
 assert.equal(r.story.galpon.received,0);
});
