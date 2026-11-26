const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const G=require('../assets/js/galpon-production.js');

function run(t,seconds,onStep=()=>{}){
 for(let i=0;i<seconds*60;i++){
  if(t.navigationJobs.size)t.runNavigationJobs();
  t.stepSimulation(1/60);
  onStep();
 }
}
for(const workers of [1,4]){
 test(workers+' Q-bits reúnen su quórum, mueven el cuerpo, transforman y repiten la extracción',()=>{
  const {t}=createGame();t.beginHangarGame({workers,workerLimit:12});
  run(t,2);const s=t.story.galpon;assert.equal(s.extracted,0);
  assert.equal(t.hangarWorldAction('work'),true);
  let quorum=false,moved=false,converted=false;
  run(t,50,()=>{
   const c=t.cargos[0];
   if(c?.job&&c.job.activeCount>=c.required){quorum=true;assert.equal(c.required,workers===1?1:2);if(c.body.position.x< -2.3)moved=true;}
   if(s.records.some(r=>r.kind==='coupler'))converted=true;
  });
  assert(quorum);assert(moved);assert(converted);assert(s.extracted>=2);
  assert.equal(G.population(s),workers);assert.equal(s.spent.extraction,s.extracted*G.CONFIG.extractionJ);
  G.validate(s);
 });
}
test('un compañero encargado cuesta carga inicial y ocupa una única plaza; una nueva orden respeta el límite',()=>{
 const {t}=createGame();t.beginHangarGame({workers:1,workerLimit:2});
 assert(t.hangarWorldAction('work'));assert(t.hangarWorldAction('worker'));assert(!t.hangarWorldAction('worker'));
 run(t,35);const s=t.story.galpon;
 assert.equal(G.population(s),2);assert(s.spent.charge>=G.CONFIG.workerCharge*G.CONFIG.unitCapacityJ);assert(!t.hangarWorldAction('worker'));
 const created=s.records.find(r=>r.source==='extraction'&&r.kind==='worker');assert(created);assert(t.groups.some(g=>g.parts[0].id===created.id));G.validate(s);
});
test('una salida ocupada retiene una única entrada ya pagada hasta que el puesto quede libre',()=>{
 const {t}=createGame();t.beginHangarGame({workers:1});const s=t.story.galpon,w=t.story.hangarWorld,worker=t.groups[0],id=worker.parts[0].id;
 G.tick(s,1,{extracting:true});const raw=G.extract(s,id+1);assert(G.take(s,raw.id,id));assert(G.store(s,raw.id,id));assert(G.start(s,'converter',raw.id,'cube'));
 w.outputs.converter={place:'cube',slot:0};const back=worker.body.position.clone();worker.body.position.set(-3.23,.055,-1.68);
 t.tickHangarWorld(1);t.tickHangarWorld(.2);assert.equal(s.jobs.converter.id,raw.id);const paid=s.spent.conversion;
 assert.equal(t.groups.some(g=>g.parts[0].id===raw.id),false);
 worker.body.position.copy(back);t.tickHangarWorld(.2);assert.equal(s.jobs.converter,null);assert.equal(s.spent.conversion,paid);assert(t.groups.some(g=>g.parts[0].id===raw.id));G.validate(s);
});
test('retomar el recorrido despeja la boca ocupada mediante una orden del mismo trabajador',()=>{
 const {t}=createGame();t.beginHangarGame({workers:1});
 const g=t.groups[0],s=t.story.galpon,id=g.parts[0].id;
 g.body.position.set(-2.09,.045,.93);g.body.aabbNeedsUpdate=true;
 assert(t.hangarWorldAction('work'));assert(t.hangarWorldAction('recover'));
 assert(g.routeSearch||g.pendingMoodOrder||g.route);
 assert.equal(g.body.position.x,-2.09);assert.equal(g.body.position.z,.93);assert.equal(s.extracted,0);
 run(t,20);assert(s.extracted>=1);assert.equal(g.parts[0].id,id);G.validate(s);
});
