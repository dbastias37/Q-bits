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

for(const lane of ['A','B'])test('two arrivals from '+lane+' alone leave C separately with their original identities',()=>{
 const {t}=lab(),s=build(t);power(t,s);assert(t.assemblerAction(s,'toggle'));
 const first=feed(t,s[lane]);tick(t,1.3);const second=feed(t,s[lane]);
 const ids=[first,second],originals=ids.map(id=>t.rotorPart(id).g),count=t.scenePartCount(),passed=new Set();
 assert(tick(t,32,()=>{
  ids.forEach((id,i)=>{
   assert.equal(t.rotorPart(id).g,originals[i],'a single lane cannot create a joint');
   if(progress(t,s.C,id)>.22)passed.add(id);
  });
  return passed.size===2;
 }),'both pieces must cross the central output');
 assert.equal(t.scenePartCount(),count);
 for(const id of ids)assert.equal(t.rotorPart(id).part.mood.assemblyPasses.at(-1).port,lane);
});

test('one cube in A plus two in B produces one pair and delivers the spare through C',()=>{
 const {t}=lab(),s=build(t);power(t,s);assert(t.assemblerAction(s,'toggle'));
 const b1=feed(t,s.B);tick(t,1.2);const b2=feed(t,s.B),a=feed(t,s.A);
 const spare=t.rotorPart(b2).g,count=t.scenePartCount();
 assert(tick(t,34,()=>t.rotorPart(a).g===t.rotorPart(b1).g&&progress(t,s.C,b2)>.22));
 assert.equal(t.rotorPart(b2).g,spare);assert.equal(spare.parts.length,1);assert.equal(t.scenePartCount(),count);
 assert.deepEqual(Array.from(t.assemblerOriginals(t.rotorPart(a).g),p=>p.id),[a,b1]);
});

test('a cube ahead of a matching triangular pyramid leaves intact; the two triangular pyramids couple',()=>{
 const {t}=lab(),s=build(t);power(t,s);assert(t.assemblerAction(s,'recipe','pyramid'));assert(t.assemblerAction(s,'toggle'));
 const cube=feed(t,s.B),left=feed(t,s.A,'tetra');tick(t,1.1);const right=feed(t,s.B,'tetra');
 const spare=t.rotorPart(cube).g,count=t.scenePartCount();
 assert(tick(t,30,()=>t.rotorPart(left).g===t.rotorPart(right).g&&progress(t,s.C,cube)>.22));
 assert.equal(t.rotorPart(cube).g,spare);assert.equal(t.scenePartCount(),count);
});

test('the wait only uses powered time and resumes from the elapsed second after a save',()=>{
 const {t}=lab(),s=build(t),cell=power(t,s),id=feed(t,s.A);assert(t.assemblerAction(s,'toggle'));
 assert(tick(t,15,()=>s.C.assemblyStatus==='Esperando la entrada B'));tick(t,6);
 cell.mood.externalBattery.enabled=false;tick(t,11);
 const snap=JSON.parse(JSON.stringify(t.saveLab({passive:true}))),record=snap.conveyors.find(c=>c.ports.assemblyLane==='C');
 const e=record.assemblyQueue.find(r=>r.id===id);assert(e.wait>=6&&e.wait<7);
 const next=lab().t;snap.workshop=null;Object.assign(next.story,{scene:'intro',lab:next.hydrateLabSnapshot(snap),labAlpha:t.alphaSettings});
 next.enterLab(false);const restored=next.assemblerStations()[0];next.rotorPart(cell.id).part.mood.externalBattery.enabled=true;assert(next.assemblerAction(restored,'toggle'));
 assert(tick(next,6,()=>progress(next,restored.C,id)>.04));
 assert.equal(next.rotorPart(id).part.mood.assemblyPasses[0].port,'A');
});

test('a recipe imported from a native servo file builds an articulated product from four arriving pieces and reverses it',()=>{
 const {t}=lab(),s=build(t);power(t,s);
 const record=t.servoBlueprintTemplate('pivot');
 assert.equal(t.installAssemblerPlans(s,[record]).accepted,1);assert.equal(s.C.ports.product,'plan-0');
 assert.equal(t.installAssemblerPlans(s,[record]).accepted,1);assert.equal(s.C.ports.plans.length,1);
 const portable=t.mechanismSnapshot(t.rotorPart(s.C.baseId).g,'Acoplador con receta');assert(t.savedMechanismValid(portable));
 const a=feed(t,s.A),b=feed(t,s.B,'pyramid');assert(t.assemblerAction(s,'toggle'));tick(t,1.4);
 const c=feed(t,s.A),d=feed(t,s.B),count=t.scenePartCount(),initialJoints=t.rotors.length;
 const ids=[a,b,c,d];
 assert(tick(t,26,()=>t.rotors.length===initialJoints+1&&progress(t,s.C,a)>.09),'the assembled servo must travel along C');
 assert.equal(t.rotors.at(-1).servo.kind,'pivot');assert.equal(t.rotors.at(-1).enabled,false);
 assert.deepEqual(new Set(Array.from(t.assemblerOriginals(t.rotorPart(d).g),p=>p.id)),new Set(ids));
 const snapshot=t.hydrateLabSnapshot(JSON.parse(JSON.stringify(t.saveLab({passive:true})))),next=lab().t;
 snapshot.workshop=null;Object.assign(next.story,{scene:'intro',lab:snapshot,labAlpha:t.alphaSettings});next.enterLab(false);
 const n=next.assemblerStations()[0];assert.equal(n.C.ports.plans[0].name,record.name);
 assert(next.assemblerAction(n,'reverse'));assert(next.assemblerAction(n,'toggle'));
 assert(tick(next,24,()=>next.rotors.length===initialJoints&&ids.every(id=>!next.rotorPart(id).part.mood.assemblyJoint)));
 for(const [i,id] of ids.entries()){assert.equal(next.rotorPart(id).g.parts.length,1);assert.equal(next.rotorPart(id).part.mood.name,'Pieza '+id);const port=i%2===0?'A':'B';assert(tick(next,14,()=>progress(next,n[port],id)<.1));}
 assert.equal(next.scenePartCount(),count);
});

test('the rotor product joins two real couplers and releases them to the originating lanes in reverse',()=>{
 const {t}=lab(),s=build(t);power(t,s);const joints=t.rotors.length;
 const a=feed(t,s.B,'coupler'),b=feed(t,s.A,'coupler');assert(t.assemblerAction(s,'recipe','rotor'));assert(t.assemblerAction(s,'toggle'));
 assert(tick(t,17,()=>t.rotors.length===joints+1&&progress(t,s.C,b)>.07));
 assert(t.assemblerAction(s,'reverse'));
 assert(tick(t,18,()=>t.rotors.length===joints&&progress(t,s.B,a)<.1&&progress(t,s.A,b)<.1));
 assert.equal(t.rotorPart(a).part.mood.assemblyJoint,undefined);
});

test('a rigid imported form uses both lanes and skips invalid, oversize and duplicate recipes without affecting the saved library',()=>{
 const {t}=lab(),s=build(t);power(t,s);const q=[0,0,0,1],form={name:'Trío horizontal',parts:[0,.09,.18].map(x=>({shape:'cube',p:[x,0,0],q}))};
 const broken={name:'Separado',parts:[{shape:'cube',p:[0,0,0],q},{shape:'cube',p:[.5,0,0],q}]};
 assert.equal(t.installAssemblerPlans(s,[broken,t.assemblerBlueprintTemplate(),form]).skipped,2);
 assert.equal(s.C.ports.plans.length,1);assert.throws(()=>t.installAssemblerPlans(s,[broken]));assert.equal(s.C.ports.product,'plan-0');
 assert.equal(t.savedShapes.length,0);assert.equal(t.savedMechanisms.length,0);
 const a=feed(t,s.A),b=feed(t,s.B);assert(t.assemblerAction(s,'toggle'));tick(t,1.5);const c=feed(t,s.B);
 assert(tick(t,22,()=>t.rotorPart(a).g.parts.length===3&&progress(t,s.C,a)>.12));
 assert.equal(t.rotorPart(a).g,t.rotorPart(b).g);assert.equal(t.rotorPart(b).g,t.rotorPart(c).g);
});

test('a sustained obstruction releases intact pieces beside C; the next valid pair resumes when C clears',()=>{
 const {t}=lab(),s=build(t);power(t,s);
 const a=feed(t,s.A),b=feed(t,s.B),base=t.rotorPart(s.C.baseId);
 const wall=t.storyWall(base.p.vadd(base.q.vmult(t.V(-.06,.13,.27))),t.V(.095,.06,.12));
 const count=t.scenePartCount();assert(t.assemblerAction(s,'toggle'));
 assert(tick(t,15,()=>s.C.assemblyStatus==='Salida C ocupada'));
 tick(t,1);assert.equal(t.rotorPart(a).part.mood.assemblyPasses,undefined);
 const ejected=id=>t.rotorPart(id).part.mood.assemblyPasses?.[0]?.station===s.C.baseId;
 assert(tick(t,25,()=>ejected(a)&&ejected(b)));
 for(const id of [a,b]){const h=t.rotorPart(id);assert.equal(h.g.parts.length,1);assert.equal(h.part.mood.assemblyJoint,undefined);assert.equal(t.rotorPart(id).part.mood.name,'Pieza '+id);}
 assert(tick(t,3,()=>[a,b].every(id=>t.rotorPart(id).p.y<.08)));assert.equal(t.scenePartCount(),count);
 t.world.removeBody(wall.body);t.storyWorld.walls.splice(t.storyWorld.walls.indexOf(wall),1);
 const c=feed(t,s.A),d=feed(t,s.B);assert(tick(t,15,()=>t.rotorPart(c).g===t.rotorPart(d).g));
});

for(const hz of [60,240])test('a mixed continuous run conserves every input at '+hz+' Hz',()=>{
 const {t}=lab(),s=build(t,.38);power(t,s);assert(t.assemblerAction(s,'recipe','pyramid'));assert(t.assemblerAction(s,'toggle'));
 const before=t.scenePartCount(),ids=new Map(),delivered=new Set(),pairs=new Set();
 const batches=[['tetra','cube'],[null,'tetra'],['cube','pyramid'],['tetra','tetra'],['tetra',null],[null,'cube']];
 for(let frame=0;frame<36*hz;frame++){
  const index=frame/(1.5*hz);
  if(Number.isInteger(index)&&batches[index])for(const [i,shape] of batches[index].entries())if(shape){
   const port=i?'B':'A',id=feed(t,s[port],shape);ids.set(id,{port,shape});
  }
  t.stepPhysics(1/hz);
  if(frame%6!==0)continue;
  for(const [id,{port,shape}] of ids){
   const hit=t.rotorPart(id);assert(hit);assert.equal(hit.part.shape,shape);
   if(progress(t,s.C,id)<.16)continue;
   delivered.add(id);
   if(hit.g.parts.length===2){
    const other=hit.g.parts.find(p=>p.id!==id);assert.equal(shape,'tetra');assert.equal(other.shape,'tetra');
    assert.notEqual(port,ids.get(other.id).port);pairs.add(Math.min(other.id,id));
   }else assert.equal(hit.part.mood.assemblyPasses?.at(-1).port,port);
  }
  if(ids.size===9&&delivered.size===ids.size)break;
 }
 assert.equal(delivered.size,ids.size);assert(pairs.size>=1);
 assert.equal(t.scenePartCount(),before+ids.size);
});

test('an unrelated articulated rotor passes from A to C and back as the same two bodies and joint',()=>{
 const {t,sandbox}=lab(),s=build(t);power(t,s);
 const r=sandbox.QBitsAssembler.recipes.rotor,path=t.conveyorPathPoses(s.A),origin=path[0].vadd(t.V(.18,.067,0));
 const gs=r.poses.map(([p,q])=>t.makeGroup([{id:t.allocateUnitId(),shape:'coupler',weight:1,p:origin.vadd(t.V(...p).scale(.09)),q:new sandbox.CANNON.Quaternion(...q)}]));
 const [a,b]=gs.map(g=>g.parts[0].id),joint=t.connectRotorTips(a,b,{enabled:false}),count=t.scenePartCount();assert(joint);
 assert(t.assemblerAction(s,'toggle'));
 assert(tick(t,29,()=>progress(t,s.C,a)>.08&&gs[0].parts[0].mood.assemblyPasses?.at(-1).port==='A'));
 assert.equal(t.rotorPart(a).g,gs[0]);assert.equal(t.rotorPart(b).g,gs[1]);assert(t.rotors.includes(joint));
 assert(t.assemblerAction(s,'reverse'));assert(tick(t,18,()=>progress(t,s.A,a)<.08&&gs[0].parts[0].mood.assemblyPasses===undefined));
 assert(t.rotors.includes(joint));assert.equal(t.scenePartCount(),count);
});

test('a push across the chamber cannot change the recorded inlet',()=>{
 const {t}=lab(),s=build(t);power(t,s);const first=feed(t,s.A);assert(t.assemblerAction(s,'toggle'));
 tick(t,1.4);const second=feed(t,s.A),g=t.rotorPart(first).g;
 assert(tick(t,15,()=>s.C.assemblyStatus==='Esperando la entrada B'&&s.C.assemblyQueue.size===2));
 g.body.position.copy(t.assemblerPocket(s.B).vadd(t.V(0,.05,0)));g.body.velocity.setZero();g.body.aabbNeedsUpdate=true;
 const passed=new Set();
 assert(tick(t,25,()=>{
  for(const id of [first,second]){
   const h=t.rotorPart(id);assert.equal(h.g.parts.length,1);
   if(progress(t,s.C,id)>.13){assert.equal(h.part.mood.assemblyPasses.at(-1).port,'A');passed.add(id);}
  }
  return passed.size===2;
 }));
});

test('a compact eight-slot form completes from balanced lanes and survives portable scene validation',()=>{
 const {t}=lab(),s=build(t);power(t,s);const parts=[];
 for(const x of [0,.09])for(const y of [0,.09])for(const z of [0,.09])parts.push({shape:'cube',p:[x,y,z],q:[0,0,0,1]});
 t.installAssemblerPlans(s,[{name:'Bloque 2 × 2 × 2',parts}]);
 const ids=[];assert(t.assemblerAction(s,'toggle'));
 for(let i=0;i<4;i++){ids.push(feed(t,s.A),feed(t,s.B));tick(t,1.55);}
 assert(tick(t,25,()=>t.rotorPart(ids[0]).g.parts.length===8&&progress(t,s.C,ids[0])>.1));
 const root=t.rotorPart(ids[0]).g;assert(t.assemblyValid(t.worldParts(root)));assert(ids.every(id=>t.rotorPart(id).g===root));
 const raw=JSON.parse(JSON.stringify(t.saveLab({passive:true})));assert.doesNotThrow(()=>t.hydrateLabSnapshot(raw));
 raw.conveyors.find(c=>c.ports.assemblyLane==='C').ports.plans[0].parts[0].p=[1,1,1];
 assert.throws(()=>t.hydrateLabSnapshot(raw));
});

test('the native product list offers both functional servo designs and the Q-bit with a square pyramid',()=>{
 const {t,sandbox}=lab(),s=build(t),base=t.rotorPart(s.C.baseId);
 const point=t.assemblerChamber(base).p;
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 t.setLook({camera:[point.x,point.y+2,point.z],yaw:0,pitch:-Math.PI/2});
 t.onCanvasMouseDown({button:0,preventDefault(){}});
 for(const label of ['Servo pivote','Servo bisagra','Q-bit con punta piramidal'])assert(t.getCommandState().items.some(i=>i.label===label));
 for(const [id,n] of [['pivot',4],['hinge',5],['tip',2]]){
  assert(t.assemblerAction(s,'recipe',id));const txt=sandbox.document.querySelector('#assembler-materials').textContent;
  assert.equal([...txt.matchAll(/(\d+) ×/g)].reduce((sum,m)=>sum+Number(m[1]),0),n);
 }
});

test('a matching partner that enters just before timeout can finish its trip down the other belt',()=>{
 const {t}=lab(),s=build(t);power(t,s);assert(t.assemblerAction(s,'toggle'));
 const a=feed(t,s.A);assert(tick(t,15,()=>s.C.assemblyStatus==='Esperando la entrada B'));tick(t,8.5);
 const b=feed(t,s.B);assert(tick(t,5,()=>s.C.assemblyStatus.includes('en camino')));
 assert(tick(t,12,()=>t.rotorPart(a).g===t.rotorPart(b).g&&progress(t,s.C,a)>.1));
 assert.equal(t.rotorPart(a).part.mood.assemblyPasses,undefined);
});

test('an adapted ingredient uses the imported settings and recovers its own configuration on reverse',()=>{
 const {t}=lab(),s=build(t);power(t,s);
 const q=[0,0,0,1],record={version:1,name:'Pareja con láser',type:'cutter',joints:[],groups:[{parts:[
  {key:0,shape:'cube',weight:1,p:[0,.045,0],q,cutter:{version:2,face:4}},
  {key:1,shape:'cube',weight:1,p:[.09,.045,0],q}
 ]}]};
 assert.equal(t.installAssemblerPlans(s,[record]).accepted,1);const a=feed(t,s.A),b=feed(t,s.B);
 assert(t.adaptCutter(t.rotorPart(a)));t.rotorPart(a).part.mood.cutter={version:2,face:0};
 assert(t.assemblerAction(s,'toggle'));assert(tick(t,16,()=>t.rotorPart(a).g===t.rotorPart(b).g&&progress(t,s.C,a)>.10));
 assert.equal(t.rotorPart(a).part.mood.cutter.face,4);
 assert.doesNotThrow(()=>t.hydrateLabSnapshot(JSON.parse(JSON.stringify(t.saveLab({passive:true})))));
 assert(t.assemblerAction(s,'reverse'));assert(tick(t,16,()=>t.rotorPart(a).g!==t.rotorPart(b).g&&progress(t,s.A,a)<.10));
 assert.equal(t.rotorPart(a).part.mood.cutter.face,0);assert.equal(t.rotorPart(b).part.mood.cutter,undefined);
});

test('when both return branches stay obstructed the assembled load is recovered whole',()=>{
 const {t}=lab(),s=build(t);power(t,s);const a=feed(t,s.A),b=feed(t,s.B);
 assert(t.assemblerAction(s,'toggle'));assert(tick(t,16,()=>t.rotorPart(a).g===t.rotorPart(b).g&&progress(t,s.C,a)>.10));
 const g=t.rotorPart(a).g,count=t.scenePartCount();
 for(const lane of [s.A,s.B])t.storyWall(t.assemblerPocket(lane).vadd(t.V(0,.06,0)),t.V(.07,.06,.08));
 assert(t.assemblerAction(s,'reverse'));assert(tick(t,25,()=>s.C.assemblyMessage?.includes('Retorno bloqueado')));
 assert(tick(t,3,()=>g.body.position.y<.08));assert.equal(t.rotorPart(a).g,g);assert.equal(t.rotorPart(b).g,g);
 assert.equal(t.scenePartCount(),count);
});
