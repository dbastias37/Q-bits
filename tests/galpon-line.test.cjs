const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

function fixture(storage){
 const {t,sandbox}=createGame({graphics:false,storage}),G=sandbox.QBitsGalponProduction;
 t.beginHangarGame({workers:1});t.story.ready=true;t.hideStoryDialogue();
 sandbox.document.pointerLockElement=t.canvas;
 const state=t.story.galpon,worker=state.initialIds[0];
 // Supply only real identities that have completed the production transactions.
 // Freight timing is covered separately. This fixture isolates the eight real
 // sections, contact forces, powered cooler, hand intervention and physical tray.
 function manufacture(shape,p){
  const id=t.allocateUnitId();
  G.tick(state,1,{extracting:true});assert(G.extract(state,id));
  assert(G.take(state,id,worker));assert(G.store(state,id,worker));
  assert(G.start(state,'converter',id,'cube'));G.tick(state,1);G.finish(state,'converter');
  if(shape==='coupler'){
   G.tick(state,7);assert(G.start(state,'former',id,'coupler'));G.tick(state,1);G.finish(state,'former');
  }
  return t.hangarMakePart(G.record(state,id),p);
 }
 function build(){
  const ids=[];
  for(let j=0;j<30;j++){
   const g=manufacture(j<18?'cube':'coupler',t.V(-5.3+(j%6)*.12,.06,2+Math.floor(j/6)*.12));
   ids.push(g.parts[0].id);
  }
  G.tick(state,8);assert(t.buildHangarSegment(),t.hangarLineStatus().status);
  const c=t.getHangarSections().at(-1);
  assert.deepEqual([...c.required].sort((a,b)=>a-b),ids);
  assert.equal(c.joints.length,3);assert(c.running);
  return c;
 }
 const step=(frames=1)=>{for(let f=0;f<frames;f++)t.stepSimulation(1/60);};
 return {t,G,state,build,manufacture,step};
}
function place(g,p){
 g.body.position.copy(p);g.body.quaternion.set(0,0,0,1);
 g.body.velocity.set(0,0,0);g.body.angularVelocity.set(0,0,0);g.body.aabbNeedsUpdate=true;g.body.wakeUp();
}

test('eight physical modules deliver twelve once, from their real ports into one receiving family',()=>{
 const {t,G,state,build,manufacture,step}=fixture(),layout=t.galponLineLayout();
 assert.equal(t.buildHangarSegment(),false);
 for(let i=0;i<8;i++)build();
 assert.equal(t.buildHangarSegment(),false);
 const entrance=t.V(layout.entry.x+.07,layout.entry.y+.06,0);
 const cubes=Array.from({length:13},(_,i)=>manufacture('cube',t.V(-5+i*.14,.05,2))).reverse();
 const first=cubes[0],id=first.parts[0].id,manual=cubes[1],manualId=manual.parts[0].id;
 place(first,entrance);const shapeIds=t.groups.flatMap(g=>g.parts.map(p=>p.id));
 assert.equal(G.record(state,id).heat,1);
 let observedActive=false,charged=false;
 for(let f=0;f<550;f++){
  step();const r=G.record(state,id);
  if(t.hangarLineCoolingIds().includes(id)&&r.heat>.46)observedActive=true;
  if(r.energy>.45&&r.activeSeconds>=G.CONFIG.activeSeconds&&r.heat<=G.CONFIG.manipHeat)charged=true;
 }
 assert(observedActive,'a still-hot workpiece entered the real cooler');assert(charged);
 assert(state.spent.transport>0&&state.spent.cooling>0);
 // Taking a moving product invalidates that physical trip, including if the
 // hand places it in the tray after it was already cooled.
 t.grabQubit({g:first,part:first.parts[0],point:first.body.position.clone(),distance:1});
 assert.equal(t.getHeld()?.g,first);t.releaseQubit(false);
 place(first,t.V(layout.receiver.x,.66,-.24));
 place(manual,t.V(layout.receiver.x+.12,.66,-.30));step(90);
 assert.equal(state.received,0);assert(!t.galponLineSnapshot().trips.length);
 for(let f=0;f<3300;f++){
  if(f%100===0&&f/100<cubes.length)place(cubes[f/100],entrance);
  step();
  if(state.received===12&&t.hangarLineStatus().traveling===0&&cubes.at(-1).body.position.x>layout.exit.x)break;
  if(f===1000){
   const snapshot=t.galponLineSnapshot();assert(snapshot.trips.some(trip=>trip.stage>=3));
   assert(t.galponLineRecordValid(snapshot,t.saveLab({passive:true}),state));
  }
 }
 assert.equal(state.received,12);assert.equal(t.families.length,1);
 assert.equal(t.families[0].count,12);assert.equal(t.hangarLineStatus().traveling,0);
 const ids=[...t.groups.flatMap(g=>g.parts.map(p=>p.id)),...t.families[0].partIds];
 assert.deepEqual(ids.sort((a,b)=>a-b),[...shapeIds].sort((a,b)=>a-b));
 assert(G.record(state,manualId).credited);for(const cube of cubes.slice(0,12))assert(G.record(state,cube.parts[0].id).credited);
 assert.equal(G.record(state,cubes.at(-1).parts[0].id).credited,false);assert(t.groups.includes(cubes.at(-1)));
 G.validate(state);
});

test('reversed or stopped first section cannot advance intake and a missing section releases its material',()=>{
 const {t,state,build,manufacture,step}=fixture(),c=build(),l=t.galponLineLayout();
 t.setHangarLineRunning(false);assert(t.configureConveyor(c,{direction:-1}));assert(t.setHangarLineRunning(true));
 const g=manufacture('cube',t.V(l.entry.x+.10,l.entry.y+.065,0));step(40);
 assert.equal(t.galponLineSnapshot().trips.length,0);assert(g.body.position.x<l.entry.x+.10);
 t.setHangarLineRunning(false);const required=[...c.required];
 t.detachPart(t.rotorPart(c.baseId),true);
 assert.equal(t.galponLineSnapshot().sections.filter(Boolean).length,0);
 assert.equal(t.hangarLineStatus().built,0);assert(required.every(id=>state.records.find(r=>r.id===id).place==='world'));
});

test('B feeds its single reserved line position despite surplus paid construction stock elsewhere',()=>{
 const {t,G,state,build,manufacture}=fixture();for(let i=0;i<8;i++)build();
 // Isolated accounting setup for the completed A quota. Every spare below
 // remains a paid world body; this is a station-admission regression.
 for(let i=0;i<25;i++){
  const g=manufacture('cube',t.V(-5.3+(i%5)*.15,.05,2+Math.floor(i/5)*.15)),id=g.parts[0].id;
  if(i<12){G.tick(state,.5,{activeCoolingIds:[id]});G.tick(state,8);assert(G.receive(state,[id],'fixture:A'));assert(G.markReleased(state,[id],'fixture:A'));}
 }
 assert(t.beginHangarChain());t.hideStoryDialogue();t.resumeGame();assert(t.hangarChainAction('feed'));
 const raw=[];for(let i=0;i<2;i++){const id=t.allocateUnitId();G.tick(state,1);assert(G.extract(state,id));assert(G.take(state,id,state.initialIds[0]));assert(G.store(state,id,state.initialIds[0]));raw.push(id);}
 const energy=state.energyJ,spares=t.hangarWorldStatus().cubes;assert(spares>=25);
 t.tickHangarWorld(.13);assert.equal(t.story.hangarWorld.outputs.converter?.place,'belt');assert.equal(state.jobs.converter?.id,raw[0]);
 assert(state.energyJ<energy,'the fresh feed conversion is paid');
 G.tick(state,1);t.tickHangarWorld(.13);assert(t.rotorPart(raw[0]),'the same converted identity appears at the physical mouth');
 assert.equal(state.jobs.converter,null,'the next raw input waits while the single line position is reserved');
 assert.equal(G.record(state,raw[1]).place,'stock');assert.equal(t.hangarWorldStatus().cubes,spares+1);
 assert.doesNotThrow(()=>G.validate(state));
});

test('a product resumes between real belt sections after a cross-instance save and finishes one physical receipt',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v))};
 const {t,build,manufacture,step}=fixture(storage),l=t.galponLineLayout();
 for(let i=0;i<8;i++)build();
 const g=manufacture('cube',t.V(l.entry.x+.07,l.entry.y+.06,0)),id=g.parts[0].id;
 step(900);
 const trip=t.galponLineSnapshot().trips.find(entry=>entry.id===id);
 assert(trip&&trip.stage>=3&&trip.stage<8&&trip.recovered);
 const saved=t.saveCurrentGame();assert(saved.ok,saved.error);
 const {t:r}=createGame({graphics:false,storage});r.story.ready=true;assert(r.continueHangarGame(),r.saveSession.message);
 const restored=r.rotorPart(id).g;
 assert(restored.body.position.distanceTo(g.body.position)<.001);
 assert.equal(r.galponLineSnapshot().trips[0].stage,trip.stage);
 for(let i=0;i<1200&&r.story.galpon.received===0;i++)r.stepSimulation(1/60);
 assert.equal(r.story.galpon.received,1);assert(r.families[0].partIds.has(id));
});
