// Cold startup benchmark: one NEW Node process per arm/repetition, run serially.
// No pre-frame saveLab/state capture, internal wrappers, counters, profiler or GC.
// node tests/benchmark-startup.cjs --baseline-root=../qbits-startup-baseline --baseline-commit=<full-PR1-merge-SHA> --output=/tmp/startup.json
// Coarse external frame stages are timed; detailed attribution belongs in a
// separate profiler. DOM/GPU stubs cannot measure browser Main/GPU/FPS.
const entryWall=performance.now(),entryCpu=process.cpuUsage();
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync,spawnSync}=require('node:child_process');
const args=Object.fromEntries(process.argv.slice(2).map(value=>{const at=value.indexOf('=');return at<0?[value.replace(/^--/,''),true]:[value.slice(0,at).replace(/^--/,''),value.slice(at+1)];}));
const root=path.resolve(__dirname,'..');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const git=(location,...a)=>execFileSync('git',['-C',location,...a],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
const copy=value=>JSON.parse(JSON.stringify(value));
const quantile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)]??null;};
const stats=values=>({count:values.length,mean:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,p50:quantile(values,.5),p95:quantile(values,.95),p99:quantile(values,.99),min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null});
const memoryDelta=(before,after)=>Object.fromEntries(Object.keys(before).map(key=>[key,after[key]-before[key]]));
function measured(operation){
 const beforeMemory=process.memoryUsage(),cpu=process.cpuUsage(),start=performance.now(),value=operation(),wallMs=performance.now()-start,used=process.cpuUsage(cpu),afterMemory=process.memoryUsage();
 return {value,measurement:{wallMs,processCpuMs:(used.user+used.system)/1000,processUserMs:used.user/1000,processSystemMs:used.system/1000,memoryBefore:beforeMemory,memoryAfter:afterMemory,memoryDelta:memoryDelta(beforeMemory,afterMemory)}};
}
function clock(t){return {...t.getTickState(),cannonSteps:t.world.stepnumber,cannonTime:t.world.time};}
function clockDelta(before,after){return {physicsSteps:after.physics-before.physics,cannonSteps:after.cannonSteps-before.cannonSteps,logicSteps:after.logic-before.logic,simulatedSeconds:after.simTime-before.simTime,cannonSeconds:after.cannonTime-before.cannonTime,droppedSeconds:after.droppedSeconds-before.droppedSeconds,physicsAccumulator:after.physicsAccumulator,logicAccumulator:after.logicAccumulator};}
function validateClock(before,after,frames,hz){
 const delta=clockDelta(before,after);
 assert.equal(delta.physicsSteps,frames*hz/60,'every selected physical step executes');
 assert.equal(delta.cannonSteps,delta.physicsSteps,'game and Cannon steps agree');
 assert(Math.abs(delta.simulatedSeconds-frames/60)<1e-8,'equal simulated time');
 assert(Math.abs(delta.cannonSeconds-frames/60)<1e-8,'Cannon time agrees');
 assert.equal(delta.droppedSeconds,0,'normal startup frames must not discard simulation time');
 return delta;
}
function worker(spec){
 const record={variant:spec.variant,repetition:spec.repetition,scenario:spec.family,pieces:spec.pieces,hz:spec.hz,pid:process.pid,stages:{},frames:[],coldProcess:true,noWarmup:true,processMemoryAtEntry:process.memoryUsage()};
 let game,f,finalState=null;
 const elapsed=()=>performance.now()-entryWall;
 const stop=stage=>{record.stopped={stage,budgetMs:spec.budgetMs,elapsedMs:elapsed(),completedFrames:record.frames.length};};
 const stage=(name,operation)=>{const result=measured(operation);record.stages[name]=result.measurement;return result.value;};
 try{
  // Load production/harness/fixture modules fresh in this process, with no state
  // or cache inherited from the previous arm. The parent pins these bytes.
  const loaded=stage('sourceAndModules',()=>{
   for(const [file,expected] of Object.entries(spec.files))assert.equal(sha(fs.readFileSync(path.join(spec.sourceRoot,file))),expected,'source changed while benchmark was running: '+file);
   assert.equal(sha(fs.readFileSync(spec.fixturePath)),spec.fixtureSha256,'fixture changed during benchmark');
   return {source:fs.readFileSync(path.join(spec.sourceRoot,'assets/js/game.js'),'utf8'),createGame:require(path.join(spec.sourceRoot,'tests/game-harness.cjs')),fixtures:require(spec.fixturePath)};
  });
  if(elapsed()>=spec.budgetMs){stop('sourceAndModules');return {record};}
  game=stage('harness',()=>loaded.createGame({graphics:false,gameSource:loaded.source}));
  if(elapsed()>=spec.budgetMs){stop('harness');return {record};}
  const {t,sandbox}=game;
  stage('preferencesAndSceneReset',()=>{
   t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
   sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
   t.applyPreferences({physicsHz:spec.hz,shadows:'off',music:false,guideVoice:false,footsteps:false,joinSounds:false});
   assert.equal(t.getPhysicsStep(),1/spec.hz,'real physics preferences selected BEFORE bodies and joints');
   t.setLook({camera:[0,1.7,0],yaw:0,pitch:0});f=loaded.fixtures(t);
  });
  if(elapsed()>=spec.budgetMs){stop('preferencesAndSceneReset');return {record};}
  const sceneStart=performance.now();
  stage('sceneCreation',()=>f.scene(spec.family,spec.pieces,['factory','many-mechanisms'].includes(spec.family)||(spec.family==='few-articulated'&&spec.activeArms)));
  // These inventories read arrays/properties only; no saved snapshot, spatial
  // query, AABB refresh, selection or rendering is performed before frame 1.
  record.initialInventory=copy(f.inventory());record.clockBefore=clock(t);record.memoryBeforeFrames=process.memoryUsage();
  if(elapsed()>=spec.budgetMs){stop('sceneCreation');return {record};}
  const frameWindowStart=performance.now(),frameWindowCpu=process.cpuUsage();
  for(let index=0;index<spec.frames;index++){
   if(elapsed()>=spec.budgetMs){stop('frames');break;}
   const before=clock(t),beforeMemory=process.memoryUsage(),cpu=process.cpuUsage(),start=performance.now(),phases={};
   // Coarse timers only; no internal functions are replaced. The total includes
   // this external timer overhead. An entire frame finishes before budget checks.
   for(const [name,operation] of [['advance',()=>t.advanceSimulation(1/60)],['liquids',()=>t.updateBatteryLiquids(1/60)],['targetQuery',()=>t.updateTarget()],['renderPreparation',()=>t.renderScene()]]){
    phases[name]=measured(operation).measurement;
   }
   const wallMs=performance.now()-start,used=process.cpuUsage(cpu),after=clock(t),afterMemory=process.memoryUsage();
   const frame={index:index+1,wallMs,processCpuMs:(used.user+used.system)/1000,processUserMs:used.user/1000,processSystemMs:used.system/1000,phases,clockBefore:before,clockAfter:after,clockDelta:validateClock(before,after,1,spec.hz),inventory:copy(f.inventory()),memoryDelta:memoryDelta(beforeMemory,afterMemory)};
   record.frames.push(frame);
   if(index===0){record.workerTimeToFirstFrameMs=elapsed();record.sceneStartToFirstFrameMs=performance.now()-sceneStart;}
   if(elapsed()>=spec.budgetMs){stop('frames');break;}
  }
  const windowCpu=process.cpuUsage(frameWindowCpu);
  record.frameWindow={wallMs:performance.now()-frameWindowStart,processCpuMs:(windowCpu.user+windowCpu.system)/1000,processUserMs:windowCpu.user/1000,processSystemMs:windowCpu.system/1000,completedFrames:record.frames.length};
  record.clockAfter=clock(t);record.clockDelta=validateClock(record.clockBefore,record.clockAfter,record.frames.length,spec.hz);record.finalInventory=copy(f.inventory());
  record.memoryAfterFrames=process.memoryUsage();
  record.statistics={wallMs:stats(record.frames.map(frame=>frame.wallMs)),processCpuMs:stats(record.frames.map(frame=>frame.processCpuMs)),phases:Object.fromEntries(['advance','liquids','targetQuery','renderPreparation'].map(name=>[name,{wallMs:stats(record.frames.map(frame=>frame.phases[name].wallMs)),processCpuMs:stats(record.frames.map(frame=>frame.phases[name].processCpuMs))}]))};
  if(record.stopped){record.finalStateCapture={skipped:'startup case budget exhausted'};return {record};}
  const beforeSnapshot=clock(t);
  finalState=stage('finalStateCapture',()=>f.state());
  assert.deepEqual(clock(t),beforeSnapshot,'state capture cannot advance physics');
  record.finalStateSha256=sha(finalState);record.complete=true;
  // Snapshot cost is reported separately and still part of total case latency.
  if(elapsed()>=spec.budgetMs){stop('finalStateCapture');record.complete=false;}
 }catch(error){record.failure={message:error.message,stack:error.stack};record.complete=false;}
 finally{
  if(game){record.finalClock=clock(game.t);if(f)record.finalInventory=copy(f.inventory());}
  const cpu=process.cpuUsage(entryCpu);record.workerElapsedMs=elapsed();record.workerProcessCpuMs=(cpu.user+cpu.system)/1000;record.processMemoryAtExit=process.memoryUsage();
 }
 return {record,finalState};
}
function identity(location){
 const files=['assets/js/game.js','assets/js/cannon.min.js','assets/js/graphics.js','assets/js/workshop.js','assets/js/preferences.js','tests/game-harness.cjs','tests/cpu-audit-fixtures.cjs'];
 return {root:location,commit:git(location,'rev-parse','HEAD'),tree:git(location,'rev-parse','HEAD^{tree}'),status:git(location,'status','--porcelain'),files:Object.fromEntries(files.map(file=>[file,sha(fs.readFileSync(path.join(location,file)))]))};
}
function exactState(a,b,label){
 if(a===b)return;
 let at=0;while(at<Math.min(a.length,b.length)&&a[at]===b[at])at++;
 throw new Error(label+': '+JSON.stringify({firstDifference:at,baselineSha256:sha(a),optimizedSha256:sha(b),baselineExcerpt:a.slice(Math.max(0,at-80),at+160),optimizedExcerpt:b.slice(Math.max(0,at-80),at+160)}));
}
async function main(){
 assert(args['baseline-root'],'--baseline-root is required; no older baseline default');
 assert(/^[0-9a-f]{40}$/.test(args['baseline-commit']||''),'--baseline-commit requires the full expected PR1 merge SHA');
 const roots={baseline:path.resolve(root,args['baseline-root']),optimized:path.resolve(root,args['optimized-root']||'.')};
 const sources=Object.fromEntries(Object.entries(roots).map(([name,location])=>[name,identity(location)]));
 assert.equal(sources.baseline.commit,args['baseline-commit'],'wrong startup baseline');assert.equal(sources.baseline.status,'','startup reference must be clean');
 for(const [file,expected]of Object.entries(sources.baseline.files))assert.equal(sha(execFileSync('git',['-C',roots.baseline,'show',args['baseline-commit']+':'+file],{maxBuffer:64*1024*1024})),expected,'reference bytes differ from pinned commit: '+file);
 for(const file of ['assets/js/cannon.min.js','tests/game-harness.cjs','tests/cpu-audit-fixtures.cjs'])assert.equal(sources.baseline.files[file],sources.optimized.files[file],'both arms must use the same '+file);
 const families=(args.families||'independent').split(','),scales=(args.scales||'16,100,500,1000,1500,2000').split(',').map(Number),hz=Number(args.hz||120),frames=Number(args.frames||30),repetitions=Number(args.repetitions||3),budgetMs=Number(args['case-budget-ms']||20000),activeArms=args['active-arms']==='true';
 assert(families.length&&families.every(name=>['independent','welded','few-articulated','many-mechanisms','factory'].includes(name)));
 assert(scales.length&&scales.every(n=>Number.isInteger(n)&&n>0&&n<=2000),'respect current piece limit');assert([60,120,240].includes(hz));
 assert(Number.isInteger(frames)&&frames>0&&frames<=120&&Number.isInteger(repetitions)&&repetitions>=1&&repetitions<=6);
 assert(Number.isFinite(budgetMs)&&budgetMs>0&&budgetMs<=60000,'bounded startup budget');
 const fixturePath=path.join(__dirname,'cpu-audit-fixtures.cjs'),fixtureSha256=sha(fs.readFileSync(fixturePath));
 const result={schema:1,mode:'cold-process-startup',referenceCommit:args['baseline-commit'],sources,runtime:{node:process.version,platform:process.platform,arch:process.arch,cpuModel:os.cpus()[0]?.model,availableParallelism:os.availableParallelism()},configuration:{families,scales,hz,frames,repetitions,caseBudgetMs:budgetMs,activeArms,warmup:0,freshProcessPerArm:true,forcedGc:false,internalInstrumentation:false,coarseExternalPhaseTimers:true,preferencesBeforeJoints:true,camera:[0,1.7,0],yaw:0,pitch:0,viewport:'1280x720 DOM/GPU stubs',shadows:'off',order:Array.from({length:repetitions},(_,r)=>r%2?'BA':'AB').join('/'),benchmarkSha256:sha(fs.readFileSync(__filename)),fixtureSha256},method:'Fresh Node process for each arm/repetition, no retained VM/world/cache between runs; OS file caches, machine load and the Node executable are not reset. Process startup/IPC parent elapsed is separate from worker game phases. Harness/modules/scene construction, first frames and final saved-state capture are separately measured. No pre-frame save/state query, physics warmup, GC forcing, internal counters or profiler. Each frame calls advanceSimulation(1/60), liquids, target query and render preparation; coarse external timers and their overhead are included in total frames. Stage CPU/wall metrics are inclusive within the frame; do not sum them to the total. Budgets are checked between complete frames/stages, never interrupting a physics step or postponing useful work. Process memory deltas are not allocation counts or retained cache sizes. Full final states are compared exactly outside the performance window; frame clocks and inventories are host-owned primitive snapshots. DOM/GPU stubs: no browser Main, GPU, RAF or FPS claims.',reports:[]};
 const save=()=>{if(args.output){const output=path.resolve(args.output);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');}};
 try{
  for(const family of families){let lastCompleted=null;
   for(const pieces of scales){
    const report={scenario:family,pieces,hz,lastCompleted,runs:{baseline:[],optimized:[]},comparisons:[]};result.reports.push(report);let stopped=false;
    for(let repetition=1;repetition<=repetitions&&!stopped;repetition++){
     const values={};
     for(const variant of repetition%2?['baseline','optimized']:['optimized','baseline']){
      const spec={variant,repetition,family,pieces,hz,frames,budgetMs,activeArms,sourceRoot:roots[variant],files:sources[variant].files,fixturePath,fixtureSha256};
      const begin=performance.now(),parentCpu=process.cpuUsage();
      // No subprocess timeout: forcibly killing an in-flight physical step is
      // not an admissible timing sample. The worker's bounded fixtures and
      // checks stop after the current synchronous frame/creation operation.
      const child=spawnSync(process.execPath,[__filename,'--worker-spec='+JSON.stringify(spec)],{encoding:'utf8',maxBuffer:64*1024*1024,cwd:root});
      const elapsed=performance.now()-begin,used=process.cpuUsage(parentCpu);
      let value;
      try{value=JSON.parse(child.stdout);}catch(error){value={record:{variant,repetition,complete:false,failure:{message:'Child output unavailable: '+error.message,status:child.status,signal:child.signal,error:child.error?.message,stderr:child.stderr?.slice(-12000)}}};}
      value.record.subprocess={elapsedMs:elapsed,parentOrchestrationCpuMs:(used.user+used.system)/1000,exitCode:child.status,signal:child.signal,stderr:child.stderr||'',includesNodeLaunchAndOutputSerialization:true};
      report.runs[variant].push(value.record);values[variant]=value;
      if(!value.record.complete){stopped=true;report.stopped={variant,repetition,...(value.record.stopped||{}),failure:value.record.failure};if(value.record.failure)result.failure={scenario:family,pieces,hz,variant,repetition,...value.record.failure};save();break;}
      await new Promise(setImmediate);
     }
     if(!stopped){
      exactState(values.baseline.finalState,values.optimized.finalState,`${family}/${pieces}/${hz}/rep${repetition} final state`);
      assert.deepEqual(values.baseline.record.clockDelta,values.optimized.record.clockDelta,'same measured physical time');
      assert.deepEqual(values.baseline.record.initialInventory,values.optimized.record.initialInventory,'same initial inventory');
      assert.deepEqual(values.baseline.record.finalInventory,values.optimized.record.finalInventory,'same final inventory');
      assert.deepEqual(values.baseline.record.frames.map(frame=>({clock:frame.clockDelta,inventory:frame.inventory})),values.optimized.record.frames.map(frame=>({clock:frame.clockDelta,inventory:frame.inventory})),'every frame keeps inventory and clocks');
      report.comparisons.push({repetition,identicalFinalState:true,identicalFrameClocksAndInventories:true,stateSha256:values.optimized.record.finalStateSha256});
     }
    }
    report.complete=!stopped&&report.comparisons.length===repetitions;if(report.complete)lastCompleted=pieces;
    process.stderr.write(`${family} ${pieces}/${hz} ${report.complete?'completed':'stopped'}\n`);save();
    if(stopped)break;
   }
  }
 }catch(error){result.failure={message:error.message,stack:error.stack};process.exitCode=1;}
 result.complete=!result.failure&&result.reports.length===families.length*scales.length&&result.reports.every(report=>report.complete);if(result.failure)process.exitCode=1;
 save();if(!args.output)process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
if(args['worker-spec']){
 const result=worker(JSON.parse(args['worker-spec']));process.stdout.write(JSON.stringify(result)+'\n');if(result.record.failure)process.exitCode=1;
}else main().catch(error=>{console.error(error);process.exitCode=1;});
