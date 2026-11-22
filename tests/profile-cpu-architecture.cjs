// Diagnostic run, separate from primary timing. Native V8 CPU/heap sampling
// through Node's in-process Inspector (no listening port), and Cannon's own
// phase timers. DOM/GPU remain stubs: this is not a Chrome or FPS profile.
// Default: the original distant-query profile plus the 500-piece factory.
// Example: --scenario=independent --pieces=500 --hz=120 --warmup=60 --frames=30
const fs=require('node:fs'),path=require('node:path'),inspector=require('node:inspector'),{PerformanceObserver}=require('node:perf_hooks'),assert=require('node:assert/strict'),crypto=require('node:crypto'),os=require('node:os'),{execFileSync}=require('node:child_process');
const fixtures=require('./cpu-audit-fixtures.cjs');
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const root=path.resolve(__dirname,'..'),out=args.output||'/tmp/qbits-node-profile.json',dir=path.dirname(out);
const roots={baseline:path.resolve(root,args['baseline-root']||'../qbits-baseline'),optimized:path.resolve(root,args['optimized-root']||'.')};
const scenario=args.scenario||args.scene||'legacy',hz=Number(args.hz||120),pieces=Number(args.pieces||500),frames=Number(args.frames||(scenario==='legacy'?12:30)),warmup=Number(args.warmup||(scenario==='legacy'?12:60)),caseBudgetMs=Number(args['case-budget-ms']||60000);
assert(['legacy','independent','factory','welded','few-articulated','many-mechanisms'].includes(scenario),'unknown scene');assert([60,120,240].includes(hz),'use a selectable physics rate');
assert(Number.isInteger(pieces)&&pieces>0&&pieces<=2000,'preserve the current piece limit');
for(const [name,value]of Object.entries({frames,warmup}))assert(Number.isInteger(value)&&value>=0&&value<=600&&(name!=='frames'||value>0),name+' must be bounded');
assert(Number.isFinite(caseBudgetMs)&&caseBudgetMs>0&&caseBudgetMs<=300000,'bounded case budget');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex'),sources=Object.fromEntries(Object.entries(roots).map(([v,p])=>[v,fs.readFileSync(path.join(p,'assets/js/game.js'),'utf8')]));
const identity=Object.fromEntries(Object.entries(roots).map(([variant,p])=>{
 const git=(...a)=>execFileSync('git',['-C',p,...a],{encoding:'utf8'}).trim();
 const files=['assets/js/game.js','assets/js/graphics.js','assets/js/workshop.js','assets/js/cannon.min.js','assets/js/preferences.js','tests/game-harness.cjs'];
 const hashes=Object.fromEntries(files.map(file=>[file,sha(fs.readFileSync(path.join(p,file)))]));
 return [variant,{root:p,commit:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),trackedChanges:!!git('status','--porcelain','--untracked-files=no'),gameSha256:sha(sources[variant]),workshopSha256:hashes['assets/js/workshop.js'],sha256:hashes}];
}));
const phases=['stepPhysics','stepSimulation','stepLogic','refreshRotors','updatePowerNetwork','updateConveyors','updateRobotGrips','updateRobotArms','updateGrab','updateRoutes','updateHauling','prepareRotorPower','updateRotorMotors','driveRobotArms','driveConveyors','driveServos','updateFlights','stabilizeRotors','finishMechanicalRest','updateRotorPower','tickContactSensors','tickFlightSensors','updateCooling','updateMoods','updateBlueprints','tickProduction','updateBatteryLiquids','updateTarget','renderScene','drawQubits','drawStructureOutlines','drawOutline','wideLineTriangles','drawGroupSolid','moodVisualPose','drawWorkshop','saveCurrentGame'];
const reports=[];
function setup(variant,instrumented=false){
 const p=roots[variant],createGame=require(path.join(p,'tests/game-harness.cjs'));let source=sources[variant];
 if(instrumented){const at=source.lastIndexOf('})();'),hooks=`window.__phaseProfile={enabled:false,blocks:{}};`+phases.map(n=>`if(typeof ${n}==='function'){const original=${n};${n}=function(...a){if(!window.__phaseProfile.enabled)return original.apply(this,a);const start=performance.now();try{return original.apply(this,a);}finally{const o=window.__phaseProfile.blocks['${n}']||(window.__phaseProfile.blocks['${n}']={calls:0,inclusiveMs:0});o.calls++;o.inclusiveMs+=performance.now()-start;}};}`).join('\n');source=source.slice(0,at)+hooks+source.slice(at);}
 const game=createGame({graphics:false,gameSource:source}),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.applyPreferences({physicsHz:hz,shadows:'off',music:false,guideVoice:false,footsteps:false,joinSounds:false});assert.equal(t.getPhysicsStep(),1/hz);t.setLook({camera:scenario==='legacy'?[0,1.7,6]:[0,1.7,0],yaw:0,pitch:scenario==='legacy'?-.2:0});return {...game,f:fixtures(t)};
}
function topCpu(p){const times=new Map();for(let i=0;i<(p.samples||[]).length;i++)times.set(p.samples[i],(times.get(p.samples[i])||0)+(p.timeDeltas?.[i]||0));return p.nodes.map(n=>({name:n.callFrame.functionName||'(anonymous)',url:n.callFrame.url,line:n.callFrame.lineNumber+1,selfMs:(times.get(n.id)||0)/1000})).sort((a,b)=>b.selfMs-a.selfMs).slice(0,30);}
function topAlloc(p){const all=[];function visit(n){if(n.selfSize)all.push({name:n.callFrame.functionName||'(anonymous)',line:n.callFrame.lineNumber+1,sampledBytes:n.selfSize});for(const c of n.children||[])visit(c);}visit(p.head);return all.sort((a,b)=>b.sampledBytes-a.sampledBytes).slice(0,30);}
function frameOperation(t){t.advanceSimulation(1/60);t.updateBatteryLiquids(1/60);t.updateTarget();t.renderScene();}
function bounded(count,operation,label){const start=performance.now();for(let i=0;i<count;i++){if(performance.now()-start>caseBudgetMs)throw new Error(label+' exceeded '+caseBudgetMs+' ms after '+i+'/'+count+' operations');operation();}}
function prepareScene(variant,instrumented=false,profile=false){
 const game=setup(variant,instrumented),{t,f}=game;
 if(scenario==='legacy'&&profile){f.distant(Number(args.pieces||1000));game.operation=()=>{t.updateTarget();t.tickContactSensors(1/hz);t.drawWorkshop();t.updateMoods(1/hz);};game.operations=Number(args.frames||80);bounded(Number(args.warmup||80),game.operation,'legacy query warmup');}
 else{
  const kind=scenario==='legacy'?'factory':scenario;f.scene(kind,pieces,['factory','many-mechanisms','few-articulated'].includes(kind));
  game.operation=()=>frameOperation(t);game.operations=frames;
  // Preserve the old factory warmup: 24 physics steps, with no render calls.
  if(scenario==='legacy')bounded(warmup*hz/60,()=>t.stepSimulation(1/hz),'factory warmup');
  else bounded(warmup,game.operation,scenario+' warmup');
 }
 return game;
}
function clock(t){return {...t.getTickState(),cannonSteps:t.world.stepnumber};}
function clockDelta(before,after,operations,profile){
 const delta={physicsSteps:after.physics-before.physics,cannonSteps:after.cannonSteps-before.cannonSteps,simulatedSeconds:after.simTime-before.simTime,droppedSeconds:after.droppedSeconds-before.droppedSeconds,physicsAccumulator:after.physicsAccumulator,logicAccumulator:after.logicAccumulator};
 if(!(scenario==='legacy'&&profile)){
  assert.equal(delta.physicsSteps,operations*hz/60,'execute every selected physical step');assert.equal(delta.cannonSteps,delta.physicsSteps);assert(Math.abs(delta.simulatedSeconds-operations/60)<1e-8);assert.equal(delta.droppedSeconds,0,'profiling must not discard regular-frame time');
 }
 return delta;
}
function gcObserver(){
 const gc={events:0,totalMs:0,maxMs:0,byKind:{}},window={start:Infinity,end:-Infinity};
 const record=entries=>{for(const e of entries)if(e.startTime>=window.start&&e.startTime<=window.end){gc.events++;gc.totalMs+=e.duration;gc.maxMs=Math.max(gc.maxMs,e.duration);const kind=e.detail?.kind??'unknown';gc.byKind[kind]=(gc.byKind[kind]||0)+1;}};
 const observer=new PerformanceObserver(list=>record(list.getEntries()));observer.observe({entryTypes:['gc']});
 return {gc,window,async finish(){await new Promise(setImmediate);await new Promise(setImmediate);record(observer.takeRecords());observer.disconnect();},disconnect:()=>observer.disconnect()};
}
async function capture(variant,kind){
 // CPU and heap captures start from fresh, identically warmed game instances.
 // Neither contains the block wrappers or Cannon phase timers.
 const {t,f,operation,operations}=prepareScene(variant,false,true),initial=clock(t),inventoryBefore=f.inventory();
 const session=new inspector.Session();session.connect();const send=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(e,r)=>e?reject(e):resolve(r)));
 const observer=gcObserver();let profile,before,after;
 try{
  await send('HeapProfiler.enable');await send('HeapProfiler.collectGarbage');
  if(kind==='cpu'){await send('Profiler.enable');await send('Profiler.setSamplingInterval',{interval:100});await send('Profiler.start');}
  else {before=process.memoryUsage();await send('HeapProfiler.startSampling',{samplingInterval:4096,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});}
  observer.window.start=performance.now();bounded(operations,operation,variant+' '+kind+' profile');observer.window.end=performance.now();
  profile=(await send(kind==='cpu'?'Profiler.stop':'HeapProfiler.stopSampling')).profile;
  await observer.finish();
  if(kind==='heap'){await send('HeapProfiler.collectGarbage');after=process.memoryUsage();}
 }finally{observer.disconnect();session.disconnect();}
 const suffix=scenario==='legacy'?'':scenario+'-'+pieces+'-'+hz+'hz-',file=path.join(dir,'node-'+suffix+variant+(kind==='cpu'?'.cpuprofile':'.heapprofile'));
 fs.writeFileSync(file,JSON.stringify(profile));
 return {profileFile:path.basename(file),top:kind==='cpu'?topCpu(profile):topAlloc(profile),gc:observer.gc,heapBefore:before,heapAfter:after,operations,inventoryBefore,inventory:f.inventory(),clockDelta:clockDelta(initial,clock(t),operations,true),stateSha256:sha(f.state()),windowWallMs:observer.window.end-observer.window.start,samples:profile.samples?.length||0};
}
(async()=>{
 fs.mkdirSync(dir,{recursive:true});
 for(const variant of ['baseline','optimized']){
  const cpu=await capture(variant,'cpu'),heap=await capture(variant,'heap');assert.equal(cpu.stateSha256,heap.stateSha256,'separate profile captures must execute the same full state');
  reports.push({variant,scenario:scenario==='legacy'?'distant pieces; target + empty-sensor tick/draw + mood updates, warmed':scenario,pieces:scenario==='legacy'?Number(args.pieces||1000):pieces,hz,inventory:cpu.inventory,cpuTop:cpu.top,allocationTop:heap.top,gcDuringCpuProfile:cpu.gc,gcDuringHeapProfile:heap.gc,heapBefore:heap.heapBefore,heapAfter:heap.heapAfter,profiles:[cpu.profileFile,heap.profileFile],identicalStateAcrossProfileCaptures:true,captures:{cpu,heap}});
 }
 const diagnostics=[];
 for(const variant of ['baseline','optimized']){
  const states={false:[],true:[]},runs=[];
  for(let repetition=1;repetition<=3;repetition++)for(const instrumented of repetition%2?[false,true]:[true,false]){
   const {t,f,sandbox,operation,operations}=prepareScene(variant,instrumented),initial=clock(t);
   t.world.doProfiling=instrumented;if(instrumented)sandbox.__phaseProfile.enabled=true;
   const cannonPhases={},nativeStep=t.world.step;let observedCannonSteps=0;
   if(instrumented)t.world.step=function(...a){const before=this.stepnumber,start=performance.now();try{return nativeStep.apply(this,a);}finally{const elapsed=performance.now()-start,blocks=sandbox.__phaseProfile.blocks,block=blocks['world.step']||(blocks['world.step']={calls:0,inclusiveMs:0});block.calls++;block.inclusiveMs+=elapsed;const steps=this.stepnumber-before;assert(steps===1,'game world.step must remain atomic');observedCannonSteps+=steps;for(const [key,value]of Object.entries(this.profile))cannonPhases[key]=(cannonPhases[key]||0)+value;}};
   const cpu=process.cpuUsage(),start=performance.now();bounded(operations,operation,variant+' instrumentation '+instrumented);
   const used=process.cpuUsage(cpu),wallMs=performance.now()-start;
   if(instrumented){sandbox.__phaseProfile.enabled=false;t.world.step=nativeStep;}t.world.doProfiling=false;
   const delta=clockDelta(initial,clock(t),operations,false);if(instrumented)assert.equal(observedCannonSteps,delta.cannonSteps);
   states[instrumented].push(f.state());runs.push({repetition,instrumented,frames:operations,wallMs,processCpuMs:(used.user+used.system)/1000,inventory:f.inventory(),clockDelta:delta,observedCannonSteps:instrumented?observedCannonSteps:null,blocks:instrumented?sandbox.__phaseProfile.blocks:null,cannonPhaseSumMs:instrumented?cannonPhases:null,cannonPhaseMeanMsPerStep:instrumented?Object.fromEntries(Object.entries(cannonPhases).map(([k,v])=>[k,v/observedCannonSteps])):null});
  }
  assert(states.false.every((s,i)=>s===states.true[i]),'instrumentation must preserve the full state');diagnostics.push({variant,identicalStateWithInstrumentation:true,runs});
 }
 const identicalFinalStateBetweenVariants=reports[0].captures.cpu.stateSha256===reports[1].captures.cpu.stateSha256;
 if(scenario!=='legacy')assert(identicalFinalStateBetweenVariants,'scene profiling must preserve full physical, energy, save and clock state between variants');
 fs.writeFileSync(out,JSON.stringify({method:'Node V8 Inspector sampling; not Chrome or FPS. CPU and heap/GC captures use separate fresh game instances with identical warmup and no block wrappers. Allocation samples request collected objects if supported by V8; sampled bytes are estimates, not exact allocation totals. GC windows exclude explicit collections. Forced-GC heap readings include harness/JIT noise. Main performance timings belong to a separate benchmark. Block times are inclusive and nested; DO NOT SUM them. Cannon phase timers are summed once per executed world.step and normalized by the observed step count. Instrumentation A/B uses three warmed OFF/ON, ON/OFF, OFF/ON pairs; report variation rather than a universal overhead percentage.',sources:identity,toolSha256:sha(fs.readFileSync(__filename)),fixturesSha256:sha(fs.readFileSync(path.join(__dirname,'cpu-audit-fixtures.cjs'))),node:process.version,runtime:{platform:process.platform,arch:process.arch,cpuModel:os.cpus()[0]?.model,availableParallelism:os.availableParallelism()},configuration:{scenario,pieces,hz,frames,warmup,caseBudgetMs,viewport:'1280x720 DOM/GPU stubs',camera:scenario==='legacy'?[0,1.7,6]:[0,1.7,0],shadows:'off',preferencesBeforeJoints:true,legacyQueryOperations:Number(args.frames||80),legacyQueryWarmup:Number(args.warmup||80),legacyFactoryWarmupPhysicsSteps:warmup*hz/60},identicalFinalStateBetweenVariants,reports,diagnostics},null,2)+'\n');
})().catch(e=>{console.error(e);process.exitCode=1;});
