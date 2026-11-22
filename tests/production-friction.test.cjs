const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const createGame=require('./game-harness.cjs');

const DT=1/60;
let source=fs.readFileSync(path.join(__dirname,'../assets/js/game.js'),'utf8');
const solverMarker='const solveRotorContacts=world.solver.solve;';
assert(source.includes(solverMarker),'the probe must observe the native solver inside the game wrapper');
source=source.replace(solverMarker,`const nativeProductionTestSolver=world.solver.solve;
const solveRotorContacts=function(dt,physicsWorld){
 window.__productionContactProbe?.(physicsWorld);
 return nativeProductionTestSolver.call(this,dt,physicsWorld);
};`);
const end=source.lastIndexOf('})();');
source=source.slice(0,end)+'window.__productionContactTest={limits:productionContactFriction};'+source.slice(end);

function begin(game,level=20){
 const {t,sandbox}=game;
 t.story.ready=true;t.beginCampaignLevel(level);t.hideStoryDialogue();
 sandbox.document.pointerLockElement=t.canvas;
 assert(t.startProduction());
 for(let i=0;i<24;i++)t.advanceSimulation(DT);
 const s=t.story.campaign.production;
 assert(s.rotor.powerActive&&s.rotor.actualRpm>20,'use the actual powered motor, after its normal acceleration');
 assert.equal(t.getPhysicsStep(),DT);
 return s;
}
function campaign(){
 const game=createGame({graphics:false,gameSource:source});
 game.t.applyPreferences({physicsHz:60,shadows:'off',music:false,guideVoice:false,footsteps:false,joinSounds:false});
 return {...game,s:begin(game)};
}
function releaseMaterial(game,role,x,y=game.s.surface+.045){
 const {t,sandbox,s}=game,entries=Array.from({length:role==='package'?2:1},()=>sandbox.QBitsProduction.release(s.ledger));
 assert(entries.every(Boolean));
 if(role==='package')assert(!sandbox.QBitsProduction.package(s.ledger,entries).error);
 return t.makeGroup(entries.map((entry,i)=>({id:entry.id,weight:entry.weight,shape:'cube',
  p:t.V(x,y,s.z+(role==='package'?(i? .045:-.045):0)),q:t.Q(),
  mood:{energy:1,production:{batch:s.batch,kind:entry.kind,role}}
 })));
}
function pair(eq,a,b){return eq.bi===a&&eq.bj===b||eq.bi===b&&eq.bj===a;}
function inspectSolver(game,inspect){
 const {t,sandbox}=game,original=t.world.solver.solve;let before;
 sandbox.__productionContactProbe=world=>inspect(world,before);
 t.world.solver.solve=function(dt,world){
  before=new Map(Array.from(world.frictionEquations,eq=>[eq,[eq.minForce,eq.maxForce]]));
  try{return original.call(this,dt,world);}
  finally{
   for(const [eq,[min,max]]of before){
    assert.equal(eq.minForce,min,'pooled friction lower limits must be restored after the solve');
    assert.equal(eq.maxForce,max,'pooled friction upper limits must be restored after the solve');
   }
   before=null;
  }
 };
 return ()=>{t.world.solver.solve=original;delete sandbox.__productionContactProbe;};
}
// Isolate contact behavior from the campaign's out-of-line failure policy.
// The lateral-contact fixture deliberately puts a unit against the table edge.
function contactStep(game){
 const {t}=game;
 t.prepareRotorPower();t.updateRotorMotors(DT);t.productionForces(DT);
 t.world.step(DT);t.stabilizeRotors();t.updateRotorPower(DT);
}

test('a flat package starts sliding at 60 Hz with the original torque and four simultaneous loads',()=>{
 const game=campaign(),{t,s}=game,pack=releaseMaterial(game,'package',.2);
 for(const x of [-.8,-1.2,-1.6])releaseMaterial(game,'raw',x);
 const ids=Array.from(pack.parts,p=>p.id),start=pack.body.position.x;
 let supported=false,maxForce=0,maxTorque=0,minY=Infinity;
 const stop=inspectSolver(game,world=>{
  supported ||= world.contacts.filter(c=>pair(c,s.surfaceBody,pack.body)).length>=4;
  maxForce=Math.max(maxForce,Math.abs(pack.body.force.x));
 });
 try{
  for(let i=0;i<72;i++){
   t.advanceSimulation(DT);maxTorque=Math.max(maxTorque,s.rotor.actualTorque);
   minY=Math.min(minY,t.bounds(pack).min.y);
   assert(!s.failed,s.reason);
  }
 }finally{stop();}
 assert(supported,'the regression must include the flat four-point patch that previously stuck');
 assert(pack.body.position.x-start>.15,'a supported package must advance without needing to tumble first');
 assert(minY>s.surface-.006,'transport keeps the physical table support');
 assert(maxForce>0&&maxForce<=.4/.045/4+1e-9,'the original shared force cap is not increased');
 assert(maxTorque<=.4+1e-9);assert.equal(s.rotor.maxTorque,.4);assert.equal(s.rotor.rpm,30);
 assert.equal(pack.body.type,1);assert.equal(pack.body.mass,.25);
 assert.deepEqual(Array.from(pack.parts,p=>p.id),ids);
});

test('packing-line friction leaves obstacles, side contacts and unrelated bodies unchanged',()=>{
 const game=campaign(),{t,s}=game,pack=releaseMaterial(game,'package',.1);
 const blocker=t.storyWall(t.V(.194,s.surface+.06,s.z),t.V(.05,.06,.18)).body;
 const lateral=releaseMaterial(game,'raw',1.89,.15);
 const ordinary=t.addQubit([.9,s.surface+.045,s.z],.5);
 const oldBatch=t.makeGroup([{id:t.allocateUnitId(),weight:.5,p:t.V(-.9,s.surface+.045,s.z),q:t.Q(),
  mood:{energy:1,production:{batch:s.batch+'-retired',kind:'A',role:'raw'}}}]);
 const seen={support:false,obstacle:false,lateral:false,ordinary:false,oldBatch:false};
 const stop=inspectSolver(game,(world,before)=>{
  for(const eq of world.frictionEquations){
   const [min,max]=before.get(eq),support=pair(eq,s.surfaceBody,pack.body);
   if(support){seen.support=true;assert(eq.maxForce<max);}
   else{
    assert.equal(eq.minForce,min,'contact outside the packing support retains its lower limit');
    assert.equal(eq.maxForce,max,'contact outside the packing support retains its upper limit');
   }
   if(pair(eq,blocker,pack.body))seen.obstacle=true;
   if(pair(eq,s.surfaceBody,lateral.body))seen.lateral=true;
   if(pair(eq,s.surfaceBody,ordinary.body))seen.ordinary=true;
   if(pair(eq,s.surfaceBody,oldBatch.body))seen.oldBatch=true;
  }
 });
 try{for(let i=0;i<60;i++)contactStep(game);}finally{stop();}
 assert.deepEqual(seen,{support:true,obstacle:true,lateral:true,ordinary:true,oldBatch:true},'all exclusion cases must create real Cannon friction equations');
 assert(pack.body.position.x<.11,'the powered package cannot pass through the real obstacle');
 assert(t.bounds(pack).max.x<.149,'the original obstacle contact still stops its geometry');
});

test('reset and scene changes retire packing supports, and pooled limits survive a solver exception',()=>{
 const game=campaign(),{t,sandbox}=game;
 releaseMaterial(game,'package',.2);contactStep(game);
 assert(sandbox.__productionContactTest.limits(t.world,DT)?.size>0);
 const oldSurface=game.s.surfaceBody,oldBatch=game.s.batch;
 const stale={
  contacts:Array.from(t.world.contacts,c=>({bi:c.bi,bj:c.bj,ni:{x:c.ni.x,y:c.ni.y,z:c.ni.z}})),
  frictionEquations:Array.from(t.world.frictionEquations,eq=>({bi:eq.bi,bj:eq.bj,enabled:eq.enabled,maxForce:eq.maxForce}))
 };
 assert(t.resetProduction());assert.notEqual(game.s.batch,oldBatch);assert(t.startProduction());
 for(let i=0;i<24;i++)t.advanceSimulation(DT);
 assert.equal(sandbox.__productionContactTest.limits(stale,DT),null,'retired batch bodies cannot reuse the new batch support budget');
 releaseMaterial(game,'package',.2);contactStep(game);
 assert(sandbox.__productionContactTest.limits(t.world,DT)?.size>0,'a new batch uses its current contacts immediately');

 game.s=begin(game,19);assert(!t.world.bodies.includes(oldSurface));
 const ordinaryProduction=releaseMaterial(game,'raw',.2);let checked19=false;
 let stop=inspectSolver(game,(world,before)=>{
  for(const eq of world.frictionEquations){const [min,max]=before.get(eq);assert.equal(eq.minForce,min);assert.equal(eq.maxForce,max);}
  checked19 ||= world.frictionEquations.some(eq=>pair(eq,game.s.surfaceBody,ordinaryProduction.body));
 });
 try{contactStep(game);}finally{stop();}
 assert(checked19,'the unpacked production station keeps its real legacy friction');

 game.s=begin(game,20);assert.notEqual(game.s.surfaceBody,oldSurface);
 const pack=releaseMaterial(game,'package',.2),failure=new Error('injected native solver failure');let adjusted=false;
 assert.equal(sandbox.__productionContactTest.limits(stale,DT),null,'the new scene never uses the previous table or its contacts');
 stop=inspectSolver(game,(world,before)=>{
  adjusted=world.frictionEquations.some(eq=>pair(eq,game.s.surfaceBody,pack.body)&&eq.maxForce<before.get(eq)[1]);
  assert(adjusted,'throw only after the new support limits have actually been applied');
  throw failure;
 });
 try{assert.throws(()=>contactStep(game),error=>error===failure);}finally{stop();}
 assert(adjusted,'the real solver wrapper restores limits on its exceptional path too');
});
