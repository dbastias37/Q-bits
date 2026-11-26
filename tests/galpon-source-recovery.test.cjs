'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
// Captured from a fresh four-worker run at 120 Hz: two colleagues resting in
// the return corridor and a third planning to a waypoint inside one of them.
// Loading these durable bytes retains their physical poses, mood and energy.
const checkpoint=require('./fixtures/galpon-source-return-block.json');

for(const hz of [60,120,240])test('the paid source crew routes around an occupied return waypoint at '+hz+' Hz',context=>{
  const values=new Map(checkpoint.entries),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))};
  const {t,sandbox}=createGame({graphics:false,storage});t.story.ready=true;
  assert(t.continueHangarGame(),t.saveSession.message);t.resumeGame();t.hideStoryDialogue();
  const s=t.story.galpon,G=sandbox.QBitsGalponProduction,extracted=s.extracted,energy=s.energyJ;
  const crew=s.initialIds.map(id=>t.rotorPart(id).g),positions=crew.map(g=>g.body.position.clone()),rest=crew.slice(0,2).map(g=>g.parts[0].mood.restLeft);
  const returning=crew[3],start=returning.body.position.clone();let seconds=0,maxStep=0;
  for(let frame=0;frame<hz*35&&s.extracted<extracted+2;frame++){
    if(frame%(hz/60)===0&&t.navigationJobs.size)t.runNavigationJobs();
    t.stepSimulation(1/hz);seconds=(frame+1)/hz;
    crew.forEach((g,i)=>{maxStep=Math.max(maxStep,g.body.position.distanceTo(positions[i]));positions[i].copy(g.body.position);});
  }
  assert(s.extracted>=extracted+2,'the same willing pair must resume and repeat extraction');
  assert(returning.body.position.distanceTo(start)>.2);assert(maxStep<.08,'recovery uses ordinary continuous rolling and hauling');
  assert(crew.slice(0,2).every((g,i)=>g.parts[0].mood.state==='restless'&&Math.abs(g.parts[0].mood.restLeft-(rest[i]-seconds))<.1));
  assert(s.energyJ<energy);assert.equal(s.spent.extraction,s.extracted*G.CONFIG.extractionJ);
  assert.deepEqual(crew.map(g=>g.parts[0].id),[...s.initialIds]);assert.doesNotThrow(()=>G.validate(s));
  context.diagnostic(JSON.stringify({hz,seconds,extractedBefore:extracted,extractedAfter:s.extracted,maxStepMetres:maxStep,sourceSpentJ:energy-s.energyJ}));
});
