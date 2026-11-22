// Instrumented Node diagnostic, separate from the primary benchmark. No FPS,
// GPU, CPU sampling, heap sampling, forced GC or changes to the physical state.
// Optional private V8 inspection is tooling only and may change across Node:
// node --allow-natives-syntax tests/profile-sap-matrix-diagnostic.cjs --v8-elements=true
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const fixtures=require('./cpu-audit-fixtures.cjs');
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const root=path.resolve(__dirname,'..'),roots={baseline:path.resolve(root,args['baseline-root']||'../qbits-sap-baseline'),optimized:path.resolve(root,args['optimized-root']||'.')};
const pieces=Number(args.pieces||2000),hz=Number(args.hz||60),warmup=Number(args.warmup||60),frames=Number(args.frames||30),repetitions=Number(args.repetitions||3),budgetMs=Number(args['phase-budget-ms']||20000);
const output=path.resolve(args.output||'/tmp/qbits-sap-matrix-diagnostic.json');
assert(Number.isInteger(pieces)&&pieces>0&&pieces<=2000,'preserve current piece limit');assert([60,120,240].includes(hz),'select a real physics preference');
for(const [name,value]of Object.entries({warmup,frames,repetitions}))assert(Number.isInteger(value)&&value>0&&value<=(name==='repetitions'?6:600),name+' must be bounded');
assert(Number.isFinite(budgetMs)&&budgetMs>0&&budgetMs<=60000,'bounded per-phase budget');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex'),phaseNames=['broadphase','narrowphase','makeContactConstraints','solve','integrate'];
const sources=Object.fromEntries(Object.entries(roots).map(([variant,location])=>[variant,fs.readFileSync(path.join(location,'assets/js/game.js'),'utf8')]));
const identity=Object.fromEntries(Object.entries(roots).map(([variant,location])=>{
 const git=(...a)=>execFileSync('git',['-C',location,...a],{encoding:'utf8'}).trim();
 return [variant,{root:location,commit:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),gameSha256:sha(sources[variant]),harnessSha256:sha(fs.readFileSync(path.join(location,'tests/game-harness.cjs')))}];
}));
const v8Elements={requested:args['v8-elements']==='true',available:false};let elementInfo=null;
if(v8Elements.requested){
 try{elementInfo=new Function('value','return {dictionary:%HasDictionaryElements(value),holey:%HasHoleyElements(value),fast:%HasFastElements(value)};');elementInfo([]);v8Elements.available=true;}
 catch(error){elementInfo=null;v8Elements.error=String(error.message);}
}
const clock=t=>({...t.getTickState(),cannonSteps:t.world.stepnumber});
const quantile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)]??null;};
const stats=values=>({count:values.length,mean:values.reduce((a,b)=>a+b,0)/Math.max(1,values.length),p50:quantile(values,.5),p95:quantile(values,.95),p99:quantile(values,.99),min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null});
function frame(t){t.advanceSimulation(1/60);t.updateBatteryLiquids(1/60);t.updateTarget();t.renderScene();}
function totals(){return {worldSteps:0,worldMs:0,matrixCalls:0,matrixMs:0,matrixByArray:{0:{calls:0,ms:0},1:{calls:0,ms:0}},cannonPhases:Object.fromEntries(phaseNames.map(name=>[name,0]))};}
function delta(before,after){return {physicsSteps:after.physics-before.physics,cannonSteps:after.cannonSteps-before.cannonSteps,simulatedSeconds:after.simTime-before.simTime,droppedSeconds:after.droppedSeconds-before.droppedSeconds,physicsAccumulator:after.physicsAccumulator,logicAccumulator:after.logicAccumulator};}
function validateClock(before,after,count){const d=delta(before,after);assert.equal(d.physicsSteps,count*hz/60);assert.equal(d.cannonSteps,d.physicsSteps);assert(Math.abs(d.simulatedSeconds-count/60)<1e-8);assert.equal(d.droppedSeconds,0);return d;}

function run(variant,repetition){
 const start=performance.now(),createGame=require(path.join(roots[variant],'tests/game-harness.cjs'));
 const game=createGame({graphics:false,gameSource:sources[variant]}),{t,sandbox}=game,f=fixtures(t);
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 t.applyPreferences({physicsHz:hz,shadows:'off',music:false,guideVoice:false,footsteps:false,joinSounds:false});assert.equal(t.getPhysicsStep(),1/hz);
 t.setLook({camera:[0,1.7,0],yaw:0,pitch:0});f.scene('independent',pieces,false);
 const world=t.world,arrayIds=new WeakMap([[world.collisionMatrix.matrix,0],[world.collisionMatrixPrevious.matrix,1]]);
 const matrices=()=>['collisionMatrix','collisionMatrixPrevious'].map(slot=>{
  const array=world[slot].matrix,shape=elementInfo?elementInfo(array):null;
  return {slot,arrayId:arrayIds.get(array),length:array.length,...(shape||{}),representation:shape?(shape.dictionary?'dictionary':shape.fast?(shape.holey?'fast-holey':'fast-packed'):'other'):'not-inspected'};
 });
 const report={variant,repetition,setupMs:performance.now()-start,inventoryBefore:f.inventory(),clockBefore:clock(t),matricesBeforeWarmup:matrices()},nativeStep=world.step,nativeMatrixTick=world.collisionMatrixTick;
 const initialState=f.state();report.initialStateSha256=sha(initialState);
 let current=null;
 world.collisionMatrixTick=function(...a){
  const id=arrayIds.get(this.collisionMatrixPrevious.matrix),begun=performance.now();
  try{return nativeMatrixTick.apply(this,a);}finally{if(current){const elapsed=performance.now()-begun;current.matrixCalls++;current.matrixMs+=elapsed;current.matrixByArray[id].calls++;current.matrixByArray[id].ms+=elapsed;}}
 };
 world.step=function(...a){
  const before=this.stepnumber,begun=performance.now();
  try{return nativeStep.apply(this,a);}finally{if(current){const elapsed=performance.now()-begun,steps=this.stepnumber-before;assert.equal(steps,1,'world step remains atomic');current.worldSteps+=steps;current.worldMs+=elapsed;for(const name of phaseNames)current.cannonPhases[name]+=this.profile[name];}}
 };
 world.doProfiling=true;
 const stop=(phase,completed,elapsedMs)=>{report.stopped={phase,completed,elapsedMs,budgetMs};report.inventoryAfter=f.inventory();report.clockAfter=clock(t);report.matricesAtStop=matrices();};
 let warmState=null,finalState=null;
 try{
  if(report.setupMs>budgetMs){stop('setup',0,report.setupMs);return {report};}
  current=totals();const warmStart=performance.now(),warmCpu=process.cpuUsage();let completed=0;
  for(;completed<warmup&&performance.now()-warmStart<budgetMs;completed++)frame(t);
  const warmUsed=process.cpuUsage(warmCpu),warmWallMs=performance.now()-warmStart;
  report.warmup={completed,wallMs:warmWallMs,processCpuMs:(warmUsed.user+warmUsed.system)/1000,totals:current};current=null;
  report.clockAfterWarmup=clock(t);report.matricesAfterWarmup=matrices();report.inventoryAfterWarmup=f.inventory();
  report.warmup.clockDelta=validateClock(report.clockBefore,report.clockAfterWarmup,completed);
  if(completed!==warmup||warmWallMs>budgetMs){stop('warmup',completed,warmWallMs);return {report};}
  assert.equal(report.inventoryAfterWarmup.awakeBodies,0,'fixture must be settled after warmup');
  warmState=f.state();report.warmStateSha256=sha(warmState);
  const samples=[],measureStart=performance.now();
  for(completed=0;completed<frames&&performance.now()-measureStart<budgetMs;completed++){
   current=totals();const cpu=process.cpuUsage(),begun=performance.now();frame(t);const wallMs=performance.now()-begun,used=process.cpuUsage(cpu);
   const phaseTotal=Object.values(current.cannonPhases).reduce((a,b)=>a+b,0);
   samples.push({frame:completed+1,wallMs,processCpuMs:(used.user+used.system)/1000,processUserMs:used.user/1000,processSystemMs:used.system/1000,...current,worldOutsideNativeAndMatrixMs:current.worldMs-phaseTotal-current.matrixMs});current=null;
  }
  const measuredWallMs=performance.now()-measureStart;
  report.measurement={completed,totalWallMs:measuredWallMs,samples};report.clockAfter=clock(t);report.inventoryAfter=f.inventory();report.matricesAfterMeasurement=matrices();
  report.measurement.clockDelta=validateClock(report.clockAfterWarmup,report.clockAfter,completed);
  report.measurement.statistics=Object.fromEntries(['wallMs','processCpuMs','worldMs','matrixMs','worldOutsideNativeAndMatrixMs',...phaseNames].map(name=>[name,stats(samples.map(sample=>phaseNames.includes(name)?sample.cannonPhases[name]:sample[name]))]));
  if(completed!==frames||measuredWallMs>budgetMs){stop('measurement',completed,measuredWallMs);return {report};}
  finalState=f.state();report.finalStateSha256=sha(finalState);report.complete=true;
  return {report,initialState,warmState,finalState};
 }finally{current=null;world.step=nativeStep;world.collisionMatrixTick=nativeMatrixTick;world.doProfiling=false;}
}

(async()=>{
 const runs=[],comparisons=[];let stopped=false;
 const result={method:'Node diagnostic with native Cannon phase timers plus inclusive world.step and collisionMatrixTick wrappers. These are instrumented times, separate from primary measurements. Matrix reset timing is observed directly; subtraction of native phases only describes unattributed remainder, not a causal attribution. No forced GC. No browser FPS/GPU measurements.',sources:identity,toolSha256:sha(fs.readFileSync(__filename)),fixturesSha256:sha(fs.readFileSync(path.join(__dirname,'cpu-audit-fixtures.cjs'))),node:process.version,runtime:{platform:process.platform,arch:process.arch,cpuModel:os.cpus()[0]?.model,availableParallelism:os.availableParallelism()},configuration:{pieces,hz,warmup,frames,repetitions,budgetMs,viewport:'1280x720 DOM/GPU stubs',camera:[0,1.7,0],shadows:'off',preferencesBeforeBodies:true,order:'AB/BA/AB',profilingDuringWarmup:true},v8Elements,runs,comparisons};
 fs.mkdirSync(path.dirname(output),{recursive:true});
 for(let repetition=1;repetition<=repetitions&&!stopped;repetition++){
  const values={};
  for(const variant of repetition%2?['baseline','optimized']:['optimized','baseline']){
   values[variant]=run(variant,repetition);runs.push(values[variant].report);
   process.stderr.write(variant+' '+repetition+' '+(values[variant].report.complete?'completed':'stopped')+'\n');
   if(values[variant].report.stopped){stopped=true;break;}
   // Do not retain VM-owned clocks/arrays in the report. Yield between cases;
   // automatic GC is left to Node and is not forced by this diagnostic.
   await new Promise(setImmediate);
  }
  if(!stopped){for(const phase of ['initialState','warmState','finalState'])assert.equal(values.baseline[phase],values.optimized[phase],phase+' must remain exactly equal');comparisons.push({repetition,initialIdentical:true,warmIdentical:true,finalIdentical:true});}
  fs.writeFileSync(output,JSON.stringify({...result,complete:!stopped&&comparisons.length===repetitions},null,2)+'\n');
 }
 process.stdout.write(JSON.stringify({output,complete:!stopped&&comparisons.length===repetitions,runs:runs.length,identicalPairs:comparisons.length,v8Elements})+'\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
