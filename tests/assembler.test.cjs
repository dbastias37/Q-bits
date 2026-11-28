const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

function lab(){
 const game=createGame(),{t}=game;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle',progress:{}});
 return game;
}
function build(t,angle=0){
 const q=t.Q();q.setFromAxisAngle(t.V(0,1,0),angle);
 assert(t.spawnSavedMechanism(t.assemblerBlueprintTemplate(),t.V(),q));
 return t.assemblerStations()[0];
}
function power(t,station){
 const base=t.rotorPart(station.A.baseId);
 const point=base.p.vadd(base.q.vmult(t.V(0,0,-.09))),cell=t.addQubit(point.toArray()),id=cell.parts[0].id;
 cell.body.quaternion.copy(base.q);cell.parts[0].mood.externalBattery={version:1,ownerId:id,packId:id,enabled:true};
 assert(t.weld({source:cell,target:base.g,position:cell.body.position.clone(),quaternion:cell.body.quaternion.clone()}));
 t.stepPhysics(1/120);return t.rotorPart(id).part;
}
function feed(t,belt,shape='cube',weight=1){
 const path=t.conveyorPathPoses(belt),q=t.rotorPart(belt.baseId).q;
 const tip=belt.ports.assemblyLane==='C'?path.at(-1):path[0],step=belt.ports.assemblyLane==='C'?-.07:.07;
 const point=tip.vadd(q.vmult(t.V(step,.065,0)));
 const g=t.addQubit(point.toArray(),weight,shape);
 g.parts[0].mood.energy=.61;g.parts[0].mood.name='Pieza '+g.parts[0].id;return g.parts[0].id;
}
function tick(t,seconds,until=()=>false){
 for(let n=0;n<Math.ceil(seconds*120);n++){t.stepPhysics(1/120);if(until())return true;}
 return false;
}
function progress(t,belt,id){
 const base=t.rotorPart(belt.baseId),p=t.rotorPart(id).g.body.position;
 return base.q.inverse().vmult(p.vsub(base.p)).x;
}
for(const [recipe,left,right,angle] of [
 ['double','cube','cube',0],['socket','coupler','cube',Math.PI/3],
 ['pyramid','tetra','tetra',0],['bipyramid','pyramid','pyramid',-Math.PI/4]
])test('Acoplador transports, assembles and returns the original pair · '+recipe,()=>{
 const {t}=lab(),s=build(t,angle),battery=power(t,s);
 const a=feed(t,s.A,left,1.5),b=feed(t,s.B,right,.5),count=t.scenePartCount(),energy=battery.mood.energy;
 assert(t.assemblerAction(s,'recipe',recipe));assert(t.assemblerAction(s,'toggle'));
 assert(tick(t,15,()=>t.rotorPart(a).g===t.rotorPart(b).g&&progress(t,s.C,a)>.10));
 const g=t.rotorPart(a).g;
 assert.equal(g.parts.length,2);assert.equal(g.body.mass,.5);assert(t.assemblyValid(t.worldParts(g)));
 assert.deepEqual(Array.from(t.assemblerOriginals(g),p=>p.id),[a,b]);
 assert(t.assemblerAction(s,'reverse'));
 assert(tick(t,16,()=>t.rotorPart(a).g!==t.rotorPart(b).g&&progress(t,s.A,a)<.08&&progress(t,s.B,b)<.08));
 for(const [id,weight,shape] of [[a,1.5,left],[b,.5,right]]){
  const {g,part}=t.rotorPart(id);assert.equal(g.parts.length,1);assert.equal(part.weight,weight);
  assert.equal(part.shape,shape);assert.equal(part.mood.name,'Pieza '+id);assert.equal(part.mood.assemblyJoint,undefined);
  assert.equal(t.groups.flatMap(g=>g.parts).filter(p=>p.id===id).length,1);
 }
 assert.equal(t.scenePartCount(),count);assert(battery.mood.energy<energy);
});
test('incompatible pair exits intact in order, signals red, and the next valid pair clears the alarm',()=>{
 const {t}=lab(),s=build(t);power(t,s);
 const a=feed(t,s.A),b=feed(t,s.B,'pyramid'),ga=t.rotorPart(a).g,gb=t.rotorPart(b).g;
 assert(t.assemblerAction(s,'toggle'));
 assert(tick(t,15,()=>s.C.assemblySignal==='reject'));
 assert.equal(t.rotorPart(a).g,ga);assert.equal(t.rotorPart(b).g,gb);assert(ga.body.position.x>gb.body.position.x);
 assert(tick(t,4,()=>progress(t,s.C,b)>.27));assert.match(s.C.assemblyMessage,/intactas/);
 const nextA=feed(t,s.A),nextB=feed(t,s.B);
 assert(tick(t,15,()=>t.rotorPart(nextA).g===t.rotorPart(nextB).g));
 assert.equal(s.C.assemblySignal,'success');assert.equal(t.rotorPart(b).part.shape,'pyramid');
});
test('a half pair waits inside the curtain, survives a save and power loss, and waits behind an occupied output',()=>{
 const {t}=lab(),s=build(t);const battery=power(t,s),a=feed(t,s.A);
 assert(t.assemblerAction(s,'toggle'));assert(tick(t,14,()=>s.C.assemblyStatus==='Esperando la entrada B'));
 const snapshot=t.hydrateLabSnapshot(JSON.parse(JSON.stringify(t.saveLab({passive:true}))));
 assert(snapshot.groups.some(g=>g.parts.some(p=>p.id===a)));
 const base=t.rotorPart(s.C.baseId),wall=t.storyWall(base.p.vadd(base.q.vmult(t.V(-.055,.13,.27))),t.V(.040,.040,.10));
 const b=feed(t,s.B);battery.mood.externalBattery.enabled=false;tick(t,.10);
 assert([s.A,s.B,s.C].every(belt=>!belt.running));assert.notEqual(t.rotorPart(a).g,t.rotorPart(b).g);
 battery.mood.externalBattery.enabled=true;assert(t.assemblerAction(s,'toggle'));
 assert(tick(t,14,()=>s.C.assemblyStatus==='Salida C ocupada'));
 assert.notEqual(t.rotorPart(a).g,t.rotorPart(b).g);
 t.world.removeBody(wall.body);t.storyWorld.walls.splice(t.storyWorld.walls.indexOf(wall),1);
 assert(tick(t,2,()=>t.rotorPart(a).g===t.rotorPart(b).g));
});
test('a foreign group fed backwards returns whole without splitting or duplicating it',()=>{
 const {t}=lab(),s=build(t);power(t,s);const id=feed(t,s.C),g=t.rotorPart(id).g,count=t.scenePartCount();
 assert(t.assemblerAction(s,'reverse'));assert(t.assemblerAction(s,'toggle'));
 assert(tick(t,14,()=>s.C.assemblySignal==='reject'&&progress(t,s.A,id)<0));
 assert.equal(t.rotorPart(id).g,g);assert.equal(t.scenePartCount(),count);
});
test('the three catalogue ports join stock straight sections on full faces, and a stored template keeps the product',()=>{
 const {t}=lab(),s=build(t,.42);assert(t.assemblerAction(s,'recipe','socket'));
 const base=t.rotorPart(s.C.baseId),record=t.mechanismSnapshot(base.g,'Acoplador');
 assert(t.savedMechanismValid(record));assert.equal(record.conveyors.length,3);
 assert.equal(record.conveyors.find(c=>c.ports.assemblyLane==='C').ports.product,'socket');
 const straight=t.conveyorBlueprintTemplate(),parts=t.mechanismRecordParts(straight);
 for(const role of ['A','B','C']){
  const out=role==='C',site=t.conveyorBlueprintPlacement(straight,s[role],out?'exit':'entry',out?'entry':'exit');
  assert(site);const q=t.Q();q.setFromAxisAngle(t.V(0,1,0),site.angle);
  const rail=parts[0].map(p=>({...p,p:site.point.vadd(q.vmult(p.p)),q:q.mult(p.q)}));
  assert(rail.some(p=>t.worldParts(base.g).some(other=>t.touchingUnitFaces(p,other))),role+' has two flush rail ends');
 }
 const normal=t.conveyorBlueprintTemplate();assert(!normal.conveyors[0].ports.assemblyLane);
});
test('reverse returns both rejected solids to their own inlets, including after saving the scene',()=>{
 const game=lab(),{t}=game,s=build(t);power(t,s);
 const a=feed(t,s.A),b=feed(t,s.B,'tetra');
 assert(t.assemblerAction(s,'toggle'));assert(tick(t,14,()=>progress(t,s.C,b)>.045&&s.C.assemblySignal==='reject'));
 const saved=t.hydrateLabSnapshot(JSON.parse(JSON.stringify(t.saveLab({passive:true}))));
 const {t:next}=lab();Object.assign(next.story,{scene:'intro',lab:saved,labAlpha:t.alphaSettings});
 next.enterLab(false);const restored=next.assemblerStations()[0];assert(restored);
 assert(next.assemblerAction(restored,'reverse'));assert(next.assemblerAction(restored,'toggle'));
 assert(tick(next,15,()=>progress(next,restored.A,a)<.10&&progress(next,restored.B,b)<.10));
 const ga=next.rotorPart(a).g,gb=next.rotorPart(b).g;
 assert(ga.body.position.z<-.60&&gb.body.position.z>.60);assert.equal(ga.parts[0].mood.assemblyPasses,undefined);assert.equal(gb.parts[0].mood.assemblyPasses,undefined);
});
test('all three ports accept a physical extension from the tablet and hand a load across each seam',()=>{
 const {t}=lab(),s=build(t),ends={};
 for(const role of ['A','B','C']){
  assert(t.extendAssembler(s,role));const bp=t.blueprints.at(-1);
  assert.equal(bp.conveyorLink,s[role].baseId);
  for(const [index,target] of t.blueprintTargets(bp).entries()){
   const g=t.makeGroup([{id:t.allocateUnitId(),weight:1,shape:target.shape,p:target.p.clone(),q:target.q.clone()}]);
   const slot={g,bp,index,state:'placed'};g.blueprintJob=slot;bp.slots.push(slot);
  }
  bp.active=true;t.updateBlueprints(0);assert(!t.blueprints.includes(bp));
  ends[role]=t.conveyors.at(-1);assert.equal(t.rotorPart(ends[role].baseId).g,t.rotorPart(s.C.baseId).g);
 }
 power(t,s);const a=feed(t,ends.A),b=feed(t,ends.B);
 assert(t.assemblerAction(s,'toggle'));assert(tick(t,25,()=>t.rotorPart(a).g===t.rotorPart(b).g&&progress(t,ends.C,a)>.12));
 assert(t.configureConveyor(s.B,{direction:-1}));assert(t.conveyors.every(c=>c.running&&c.direction===-1));
 assert(tick(t,25,()=>t.rotorPart(a).g!==t.rotorPart(b).g&&progress(t,ends.A,a)<0&&progress(t,ends.B,b)<0));
});
test('after reloading a half pair, only a piece in the opposite branch completes the order',()=>{
 const {t}=lab(),s=build(t);power(t,s);const id=feed(t,s.A);assert(t.assemblerAction(s,'toggle'));
 assert(tick(t,14,()=>s.C.assemblyStatus==='Esperando la entrada B'));
 const snapshot=JSON.parse(JSON.stringify(t.saveLab({passive:true}))),{t:next}=lab();
 snapshot.workshop=null;Object.assign(next.story,{scene:'intro',lab:next.hydrateLabSnapshot(snapshot),labAlpha:t.alphaSettings});
 next.enterLab(false);const n=next.assemblerStations()[0],count=next.scenePartCount();assert(next.assemblerAction(n,'toggle'));
 assert(tick(next,2,()=>n.C.assemblyStatus==='Esperando la entrada B'));assert.equal(next.scenePartCount(),count);
 const other=feed(next,n.B);assert(tick(next,15,()=>next.rotorPart(other).g===next.rotorPart(id).g));
 assert.equal(next.scenePartCount(),count+1);
});
test('starting on cable power picks up sleeping loads and leaves a sleeping bystander alone',()=>{
 const {t}=lab(),s=build(t),reservoir=t.createPowerReservoir(t.V(-2.5,0,-1.8),{enabled:true}),materials=[];
 for(let i=0;i<3;i++){const g=t.addQubit([4+i*.12,.05,4]);materials.push(...t.worldParts(g));t.removeGroup(g);}
 assert(t.connectPowerCable({kind:'reservoir',id:reservoir.id},{kind:'part',id:s.C.baseId},[],materials).ok);
 const a=feed(t,s.A),b=feed(t,s.B),aside=t.addQubit([4,.048,4]);
 tick(t,2);assert.equal(t.rotorPart(a).g.body.sleepState,2);assert.equal(t.rotorPart(b).g.body.sleepState,2);assert.equal(aside.body.sleepState,2);
 assert(t.assemblerAction(s,'toggle'));assert.equal(aside.body.sleepState,2);
 assert(tick(t,15,()=>t.rotorPart(a).g===t.rotorPart(b).g));assert(reservoir.cell.mood.energy<1);
});
test('colored physical cargo also passes through unchanged and returns to its recorded inlet',()=>{
 const {t}=lab(),s=build(t);power(t,s);const a=feed(t,s.A),at=t.conveyorPathPoses(s.B)[0].vadd(t.V(.075,.065,0));
 const c=t.newCargo(t.V(at.x,0,at.z),1,2,'#3366cc'),body=c.body;
 c.robotPhysical=true;body.mass=.5;body.fixedRotation=false;body.type=1;body.position.copy(at);body.updateMassProperties();
 assert(t.assemblerAction(s,'toggle'));assert(tick(t,15,()=>body.position.x>.56&&s.C.assemblySignal==='reject'));
 assert(t.assemblerAction(s,'reverse'));assert(tick(t,16,()=>body.position.z>.60&&body.position.x<-.65));
 assert.equal(t.cargos.length,1);assert.equal(t.cargos[0],c);assert.equal(c.body,body);assert.equal(c.color,'#3366cc');assert.equal(c.required,2);
 assert(t.rotorPart(a).g.body.position.z<-.56);
});
test('clicking the central roof chooses a product, and the context menu opens its tablet',()=>{
 const {t,sandbox}=lab(),s=build(t),base=t.rotorPart(s.C.baseId);
 const chamber=t.assemblerChamber(base),point=chamber.p;
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.initUnitRadial();
 t.setLook({camera:[point.x,point.y+2,point.z],yaw:0,pitch:-Math.PI/2});
 t.onCanvasMouseDown({button:0,preventDefault(){}});
 const menu=t.getCommandState();assert.match(menu.title,/Acoplador · elegir producto/);
 menu.items.find(item=>item.label==='Bipirámide').run();
 assert.equal(s.C.ports.product,'bipyramid');assert.equal(t.getSelected().g,base.g);
 t.handleSecondary({clientX:640,clientY:360});
 t.getCommandState().items.find(item=>item.label==='Abrir Acoplador en la tableta').run();
 assert.equal(sandbox.document.querySelector('#assembler-panel').hidden,false);
 assert.equal(sandbox.document.querySelector('#assembler-recipe').value,'bipyramid');
});
