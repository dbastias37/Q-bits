// Real production logic + Cannon; DOM/GPU stubs. Elapsed time is NOT CPU %
// or browser FPS. Run alone, after stopping other tests/profilers.
// node --expose-gc tests/benchmark-cpu-architecture.cjs --baseline-root=../qbits-baseline --output=/tmp/cpu.json
// --mode=matrix measures fixed simulated frames; --mode=equivalence checks state.
// --families=independent --phase=settled --warmup=60 separates sleeping from
// --phase=settling (zero physical warm-up, including initial contacts/JIT).
// --mode=outlines isolates preparation; --instrumentation=counts is a SEPARATE
// run with bounded call/upload counters and deliberately no primary timings.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const fixtures=require('./cpu-audit-fixtures.cjs');
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const root=path.resolve(__dirname,'..'),roots={baseline:path.resolve(root,args['baseline-root']||'../qbits-baseline'),optimized:path.resolve(root,args['optimized-root']||'.')};
const mode=args.mode||'operations',repetitions=Number(args.repetitions??3),samples=Number(args.samples??24),warmup=Number(args.warmup??8);
const instrumentation=args.instrumentation||'none',phase=args.phase||'mixed';
const familyNames=['welded','independent','few-articulated','many-mechanisms','factory'];
const families=(args.families||(mode==='outlines'?'independent':familyNames.join(','))).split(',');
const scales=(args.scales||'16,100,500,1000,1500,2000').split(',').map(Number),hz=Number(args.hz||120);
const budget=Number(args['case-budget-ms']||8000),matrixSamples=Number(args.samples??18);
const matrixWarmup=phase==='settling'?0:Number(args.warmup??(phase==='settled'?60:12));
assert(['none','counts'].includes(instrumentation),'instrumentation must be none or counts');
assert(instrumentation==='none'||mode==='outlines','counts are isolated to --mode=outlines');
assert(['mixed','settling','settled'].includes(phase),'phase must be mixed, settling or settled');
assert(families.length&&families.every(f=>familyNames.includes(f)),'unknown family');
assert(scales.length&&scales.every(n=>Number.isInteger(n)&&n>0&&n<=2000),'scales must respect the shipped 2000-piece limit');
assert([60,120,240].includes(hz),'choose a real physics preference: 60, 120 or 240 Hz');
assert(Number.isInteger(repetitions)&&repetitions>0&&Number.isInteger(samples)&&samples>0&&Number.isInteger(warmup)&&warmup>=0&&Number.isFinite(budget)&&budget>0,'invalid sampling or budget');
if(mode==='matrix'){assert(phase!=='settled'||matrixWarmup>=60,'settled needs at least 60 warm-up frames');assert(phase!=='settling'||args.warmup===undefined||Number(args.warmup)===0,'settling must use zero physical warm-up');}
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const sources=Object.fromEntries(Object.entries(roots).map(([v,p])=>[v,fs.readFileSync(path.join(p,'assets/js/game.js'),'utf8')]));
function git(p,...a){try{return execFileSync('git',['-C',p,...a],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{return null;}}
const identity=Object.fromEntries(Object.entries(roots).map(([v,p])=>[v,{headCommit:git(p,'rev-parse','HEAD'),headTree:git(p,'rev-parse','HEAD^{tree}'),worktreeStatus:git(p,'status','--porcelain'),gameSha256:sha(sources[v]),workshopSha256:sha(fs.readFileSync(path.join(p,'assets/js/workshop.js'))),harnessSha256:sha(fs.readFileSync(path.join(p,'tests/game-harness.cjs')))}]));
const quantile=(a,q)=>{const s=[...a].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.ceil(q*s.length)-1)]??null;};
const stats=a=>({count:a.length,mean:a.reduce((s,n)=>s+n,0)/Math.max(1,a.length),p50:quantile(a,.5),p95:quantile(a,.95),p99:quantile(a,.99),min:Math.min(...a),max:Math.max(...a)});
const reports=[];
// Persist primitive clock values in the host realm. Retaining the VM object
// also retains its game/world across cases (diagnose-benchmark-retention.cjs).
const clockSnapshot=t=>({...t.getTickState()});
function assertEquivalent(before,after,label){
 if(before===after)return;
 const differences=[];
 function visit(a,b,key){
  if(Object.is(a,b)||differences.length>=12)return;
  if(a&&b&&typeof a==='object'&&typeof b==='object'){
   for(const k of new Set([...Object.keys(a),...Object.keys(b)]))visit(a[k],b[k],key+'.'+k);
  }else differences.push({path:key,before:a,after:b});
 }
 visit(JSON.parse(before),JSON.parse(after),'state');
 throw new Error(label+' differs: '+JSON.stringify(differences));
}
function setup(version,hz=120,countOutlines=false){
  const source=sources[version],at=source.lastIndexOf('})();');
  const countHooks=countOutlines?`window.__outlineCounts={enabled:false,drawOutline:0,wideLineTriangles:0,bufferData:0,bufferDataBytes:0,createBuffer:0,drawArrays:0,vertices:0};
    for(const name of ['bufferData','createBuffer','drawArrays']){const original=gl[name];gl[name]=function(...args){const c=window.__outlineCounts;if(c.enabled){c[name]++;if(name==='bufferData')c.bufferDataBytes+=typeof args[1]==='number'?args[1]:(args[1]?.byteLength||0);if(name==='drawArrays')c.vertices+=args[2]||0;}return original.apply(this,args);};}
    {const original=drawOutline;drawOutline=function(...a){if(window.__outlineCounts.enabled)window.__outlineCounts.drawOutline++;return original.apply(this,a);};}
    {const original=wideLineTriangles;wideLineTriangles=function(...a){if(window.__outlineCounts.enabled)window.__outlineCounts.wideLineTriangles++;return original.apply(this,a);};}
  `:'';
  const hooks=countHooks+'window.__auditRaw={sensorWeight,sensorContactActive,sensorMotion,drawWorkshop,drawStructureOutlines,drawBatteriesTransparent,externalBatteryPackComponents,floor,settings,moodSettings};';
  const createGame=require(path.join(roots[version],'tests/game-harness.cjs'));
  const saved=new Map(),storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,String(v)),removeItem:k=>saved.delete(k)};
  const game=createGame({graphics:false,storage,gameSource:source.slice(0,at)+hooks+source.slice(at)}),{t,sandbox}=game;
  t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
  sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
  t.applyPreferences({physicsHz:hz,shadows:'off',music:false,guideVoice:false,footsteps:false,joinSounds:false});
  assert.equal(t.getPhysicsStep(),1/hz,'choose actual preferences before creating joints');
  t.setLook({camera:[0,1.7,0],yaw:0,pitch:0});
  return {...game,f:fixtures(t),raw:sandbox.__auditRaw};
}
function timed(fn){const cpu=process.cpuUsage(),start=performance.now();const value=fn();const wallMs=performance.now()-start,used=process.cpuUsage(cpu);return {value,wallMs,cpuMs:(used.user+used.system)/1000};}
function operation(game,name){
  const {t,f,raw}=game;let run,prepare=()=>{},result;
  if(name==='target-near'){
    const parts=[];for(let y=0;y<10;y++)for(let z=0;z<10;z++)for(let x=0;x<10;x++)parts.push({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V((x-4.5)*.09,1.7+(y-4.5)*.09,-1.5+(z-4.5)*.09),q:t.Q()});
    t.makeGroup(parts);run=()=>t.aimQubit()?.part.id??null;
  }
  else if(name.startsWith('target-')){f.distant(name==='target-small'?8:1000);run=()=>t.updateTarget();}
  else if(name==='landing'||name==='landing-near'){
    if(name==='landing')f.distant(940);else f.plate(1000,[-1.5,.045,-1.5],32);
    const g=f.heldCube();run=()=>t.landingProjection(g).delta;
  }
  else if(name.startsWith('physics-factory-')){f.scene('factory',500,true);run=()=>t.stepSimulation(t.getPhysicsStep());}
  else if(name.startsWith('sensor-empty')){f.distant(name.includes('small')?8:1000);run=name.endsWith('tick')?()=>t.tickContactSensors(1/120):()=>raw.drawWorkshop();}
  else if(name.startsWith('mood-')){f.distant(name==='mood-small'?8:1000);run=()=>t.updateMoods(1/120);}
  else if(name==='sensor-weight'||name==='sensor-contact'){
    for(let i=0;i<128;i++)t.addQubit([4+(i%16)*.2,.044,-3+Math.floor(i/16)*.2]);
    // A fresh real Cannon contact generation precedes each measured query
    // batch. Thus its lazy contact-index build is INCLUDED in query timing.
    prepare=()=>t.world.step(1/120);prepare();
    const hits=t.groups.slice(0,16).map(g=>({g,part:g.parts[0],...t.poses(g)[0]}));
    run=()=>hits.map(h=>name==='sensor-weight'?raw.sensorWeight(h,new Set([h.g.body])):raw.sensorContactActive(h));
  }else if(name==='battery-full'||name==='battery-frame'){
    for(let i=0;i<32;i++)f.battery(3,[(i%8)*.4,.045,Math.floor(i/8)*.2]);
    run=name==='battery-full'?()=>t.rechargeExternalBatteries(1/120):()=>{t.updateBatteryLiquids(1/60);for(const g of t.groups)t.drawGroupSolid(g);raw.drawBatteriesTransparent();};
  }else if(name==='save-unchanged'){f.distant(1000);t.saveCurrentGame();run=()=>t.saveCurrentGame().ok;}
  else throw new Error(name);
  const readResult=value=>JSON.stringify({value,ui:name.startsWith('target-')?{text:game.sandbox.document.querySelector('#target').textContent,ready:game.sandbox.document.querySelector('#crosshair').classList.contains('ready')}:undefined});
  return {run,prepare,readResult,meta:f.inventory()};
}
function runOperations(){
 for(const name of ['target-small','target-large','target-near','landing','landing-near','sensor-empty-small-tick','sensor-empty-tick','sensor-empty-draw','sensor-weight','sensor-contact','battery-full','battery-frame','mood-small','mood-large','save-unchanged','physics-factory-60','physics-factory-120','physics-factory-240']){
  const runs={baseline:[],optimized:[]},states={baseline:[],optimized:[]},outputs={baseline:[],optimized:[]};
  for(let r=0;r<repetitions;r++)for(const version of r%2?['optimized','baseline']:['baseline','optimized']){
    const game=setup(version,name.startsWith('physics-factory-')?Number(name.split('-')[2]):120),op=operation(game,name);global.gc?.();
    const heapBefore=process.memoryUsage().heapUsed,cold=timed(op.run),results=[op.readResult(cold.value)];
    for(let i=0;i<warmup;i++){op.prepare();op.run();}
    global.gc?.();const retainedDelta=process.memoryUsage().heapUsed-heapBefore;
    const wall=[],cpu=[];
    for(let i=0;i<samples;i++){op.prepare();const m=timed(op.run);wall.push(m.wallMs);cpu.push(m.cpuMs);results.push(op.readResult(m.value));}
    outputs[version].push(JSON.stringify(results));
    states[version].push(game.f.state());
    runs[version].push({repetition:r+1,inventory:game.f.inventory(),cold:{wallMs:cold.wallMs,cpuMs:cold.cpuMs},wallMsPerOperation:stats(wall),processCpuMsPerOperation:stats(cpu),retainedHeapDeltaBytes:retainedDelta,wallSamples:wall,cpuSamples:cpu});
  }
  const identical=states.baseline.every((s,i)=>s===states.optimized[i]);assert(identical,name+' full state changed');
  assert(outputs.baseline.every((s,i)=>s===outputs.optimized[i]),name+' query result or target UI changed');
  reports.push({scenario:name,identicalFinalState:identical,identicalResults:true,resultHashes:outputs.optimized.map(sha),runs});
  process.stderr.write(name+' completed\n');
 }
}
function runMatrix(){
 for(const kind of families){
  let lastCompleted=null;
  for(const pieces of scales){
   if(kind==='factory'&&pieces<100)continue;
   const runs={baseline:[],optimized:[]},states={baseline:[],optimized:[]};let stopped=null;
   for(let r=0;r<repetitions&&!stopped;r++)for(const version of r%2?['optimized','baseline']:['baseline','optimized']){
    const begun=performance.now(),game=setup(version,hz),{t,f}=game;f.scene(kind,pieces,kind==='factory'||kind==='many-mechanisms');
    const setupMs=performance.now()-begun,operation=()=>{t.advanceSimulation(1/60);t.updateBatteryLiquids(1/60);t.updateTarget();t.renderScene();};
    const stop=(phase,completed)=>{stopped={version,repetition:r+1,phase,completed,budgetMs:budget,elapsedMs:performance.now()-begun,setupMs,inventory:f.inventory(),clock:clockSnapshot(t)};};
    if(setupMs>=budget){stop('setup',0);break;}
    const warmupStart=performance.now();let i=0;
    for(;i<matrixWarmup&&performance.now()-begun<budget;i++)operation();
    const warmupMs=performance.now()-warmupStart;
    if(i<matrixWarmup||performance.now()-begun>=budget){stop('warmup',i);break;}
    const initial=f.inventory(),clock=clockSnapshot(t),wall=[],cpu=[];let firstFrameInventory=null;
    if(phase==='settled'&&kind==='independent')assert.equal(initial.awakeBodies,0,'independent scene has not settled; increase --warmup');
    for(i=0;i<matrixSamples&&performance.now()-begun<budget;i++){
     const m=timed(operation);wall.push(m.wallMs);cpu.push(m.cpuMs);
     if(i===0)firstFrameInventory=f.inventory();
    }
    if(i<matrixSamples||performance.now()-begun>=budget){stop('measurement',i);stopped.wallSamples=wall;stopped.cpuSamples=cpu;break;}
    const after=clockSnapshot(t);
    assert(Math.abs(after.simTime-clock.simTime-matrixSamples/60)<1e-8,'same simulated duration');
    assert.equal(after.physics-clock.physics,matrixSamples*hz/60,'all selected physical steps executed');
    assert.equal(after.droppedSeconds,clock.droppedSeconds,'controlled dt must not drop time');
    states[version].push(f.state());runs[version].push({repetition:r+1,setupMs,warmupMs,totalCaseMs:performance.now()-begun,initial,firstFrameInventory,final:f.inventory(),clockBefore:clock,clockAfter:after,clockDelta:{physics:after.physics-clock.physics,logic:after.logic-clock.logic,simulatedSeconds:after.simTime-clock.simTime,droppedSeconds:after.droppedSeconds-clock.droppedSeconds,physicsAccumulator:after.physicsAccumulator,logicAccumulator:after.logicAccumulator},wallMsPerSimulatedFrame:stats(wall),processCpuMsPerSimulatedFrame:stats(cpu),wallSamples:wall,cpuSamples:cpu});
   }
   if(stopped){reports.push({scenario:kind,phase,pieces,hz,stopped,lastCompleted,runs});break;}
   for(let r=0;r<repetitions;r++)assertEquivalent(states.baseline[r],states.optimized[r],kind+' '+pieces+' full state');
   lastCompleted=pieces;reports.push({scenario:kind,phase,pieces,hz,identicalFinalState:true,stateSha256:states.optimized.map(sha),runs});process.stderr.write(kind+' '+phase+' '+pieces+' completed\n');
  }
 }
}
function runOutlines(){
 const counted=instrumentation==='counts';
 const beginCounts=game=>{const c=game.sandbox.__outlineCounts;for(const k of Object.keys(c))c[k]=k==='enabled'?true:0;};
 const endCounts=game=>{const c=game.sandbox.__outlineCounts;c.enabled=false;const {enabled,...snapshot}=c;return snapshot;};
 for(const kind of families){
  let lastCompleted=null;
  for(const pieces of scales){
   if(kind==='factory'&&pieces<100)continue;
   const runs={baseline:[],optimized:[]},states={baseline:[],optimized:[]};let stopped=null;
   for(let r=0;r<repetitions&&!stopped;r++)for(const version of r%2?['optimized','baseline']:['baseline','optimized']){
    const begun=performance.now(),game=setup(version,hz,counted),{t,f,raw}=game;f.scene(kind,pieces,kind==='factory'||kind==='many-mechanisms');
    const setupMs=performance.now()-begun,initial=f.inventory(),before=f.state(),clock=clockSnapshot(t);
    // This operation includes the visibility-frame setup used by renderScene.
    // It never advances physics; complete state/clock equality is required.
    const operation=()=>{t.beginVisibilityFrame();raw.drawStructureOutlines();};
    const stop=(phase,completed)=>{stopped={version,repetition:r+1,phase,completed,budgetMs:budget,elapsedMs:performance.now()-begun,setupMs,inventory:f.inventory(),clock:clockSnapshot(t)};};
    if(performance.now()-begun>=budget){stop('setup',0);break;}
    let cold,coldCounts;
    if(counted){beginCounts(game);operation();coldCounts=endCounts(game);}else{const m=timed(operation);cold={wallMs:m.wallMs,cpuMs:m.cpuMs};}
    const warmupStart=performance.now();let i=0;
    for(;i<warmup&&performance.now()-begun<budget;i++)operation();
    const warmupMs=performance.now()-warmupStart;
    if(i<warmup||performance.now()-begun>=budget){stop('warmup',i);break;}
    const wall=[],cpu=[];if(counted)beginCounts(game);
    for(i=0;i<samples&&performance.now()-begun<budget;i++){
     if(counted)operation();else{const m=timed(operation);wall.push(m.wallMs);cpu.push(m.cpuMs);}
    }
    const counts=counted?endCounts(game):undefined;
    if(i<samples||performance.now()-begun>=budget){stop('measurement',i);break;}
    const state=f.state();assertEquivalent(before,state,kind+' outlines must not alter simulation');states[version].push(state);
    runs[version].push({repetition:r+1,setupMs,warmupMs,totalCaseMs:performance.now()-begun,initial,final:f.inventory(),clockBefore:clock,clockAfter:clockSnapshot(t),measuredOperations:samples,...(counted?{coldCounts,counts}:{cold,wallMsPerOperation:stats(wall),processCpuMsPerOperation:stats(cpu),wallSamples:wall,cpuSamples:cpu})});
   }
   if(stopped){reports.push({scenario:kind+'-outlines',pieces,hz,stopped,lastCompleted,runs});break;}
   for(let r=0;r<repetitions;r++)assertEquivalent(states.baseline[r],states.optimized[r],kind+' outlines full state');
   lastCompleted=pieces;reports.push({scenario:kind+'-outlines',pieces,hz,identicalFinalState:true,renderPreservesState:true,stateSha256:states.optimized.map(sha),runs});process.stderr.write(kind+' outlines '+pieces+' completed\n');
  }
 }
}
function runEquivalence(){
 for(const hz of [60,120,240])for(const scenario of ['factory-camera','factory-delayed-frames','production-19','production-20',...(hz===60?['production-20-rpm29']:[])]){
  const values={};
  for(const version of ['baseline','optimized']){
   const game=setup(version,hz),{t,f}=game;let s;
   if(scenario.startsWith('factory-'))f.scene('factory',100,true);
   else {t.beginCampaignLevel(Number(scenario.split('-')[1]));t.hideStoryDialogue();s=t.story.campaign.production;if(scenario.endsWith('rpm29'))assert(t.configureRotor(s.rotor,{rpm:29}));assert(t.startProduction());}
   const start=t.getTickState();let frames=0,completedFrames=0,requestedSeconds=0;
   for(;frames<(s?60:3)*60;frames++){
    if(frames%60===0)t.setLook({camera:frames%120?[0,1.7,-6]:[0,1.7,6],yaw:frames%120?Math.PI:0,pitch:-.2});
    const dt=scenario==='factory-delayed-frames'?(frames===60?.1:frames===120?.25:1/60):1/60;
    requestedSeconds+=dt;t.advanceSimulation(dt);completedFrames++;if(frames%6===0){t.updateTarget();t.drawQubits();}
    if(s&&(s.complete||s.failed))break;
   }
   if(s&&(scenario==='production-19'||scenario.endsWith('rpm29')||hz===240))assert(s.complete,'production '+scenario+' '+hz+': '+s.reason);
   values[version]={state:f.state(),summary:{frames:completedFrames,requestedSeconds,physicsSteps:t.getTickState().physics-start.physics,simulatedSeconds:t.getSimTime()-start.simTime,droppedSeconds:t.getTickState().droppedSeconds-start.droppedSeconds,physicsAccumulator:t.getTickState().physicsAccumulator,logicAccumulator:t.getTickState().logicAccumulator,delivered:s?.ledger.accepted.length??null,joules:s?.joules??null,rpm:s?.rotor.rpm??null,complete:s?.complete??null,failed:s?.failed??null,reason:s?.reason??null,inventory:f.inventory()}};
  }
  assertEquivalent(values.baseline.state,values.optimized.state,scenario+' '+hz+' complete physical, energy, save and timing state');
  reports.push({scenario,hz,identicalFinalState:true,baseline:values.baseline.summary,optimized:values.optimized.summary,stateSha256:sha(values.optimized.state)});process.stderr.write(scenario+' '+hz+' completed\n');
 }
}
if(mode==='operations')runOperations();else if(mode==='matrix')runMatrix();else if(mode==='equivalence')runEquivalence();else if(mode==='outlines')runOutlines();else throw new Error('Unknown mode '+mode);
const output={schema:1,mode,referenceCommit:args['reference-commit']||identity.baseline.headCommit,sources:identity,runtime:{node:process.version,platform:process.platform,arch:process.arch,cpuModel:os.cpus()[0]?.model,availableParallelism:os.availableParallelism()},configuration:{repetitions:mode==='equivalence'?1:repetitions,samples:mode==='equivalence'?null:mode==='matrix'?matrixSamples:samples,warmup:mode==='equivalence'?null:mode==='matrix'?matrixWarmup:warmup,phase:mode==='matrix'?phase:null,families:mode==='matrix'||mode==='outlines'?families:null,scales:mode==='matrix'||mode==='outlines'?scales:null,hz:mode==='matrix'||mode==='outlines'?hz:null,caseBudgetMs:budget,instrumentation,fixtureSha256:sha(fs.readFileSync(path.join(__dirname,'cpu-audit-fixtures.cjs'))),forcedGc:mode==='operations'&&!!global.gc,exposedGc:!!global.gc,viewport:'1280x720 stubs',graphics:'production preparation + stub GPU; shadows off',order:mode==='equivalence'?'baseline / optimized; one deterministic pair per scenario':Array.from({length:repetitions},(_,r)=>r%2?'BA':'AB').join(' / ')},method:'Real Cannon and production game. Wall elapsed time and process CPU measured separately. NO browser FPS or GPU time. Cold first touch is separate; contact-index builds are included after each real world.step. Retained heap deltas include JIT/harness noise and are not exact cache sizes. Matrix settling has zero physical warm-up and includes initial contact/JIT cost; settled independent bodies must already be asleep. Case budgets cover setup and warm-up and are checked between synchronous operations. Outline counters run separately without primary timings; initialization uploads precede their enable point.',reports};
if(args.output)fs.writeFileSync(args.output,JSON.stringify(output,null,2)+'\n');else console.log(JSON.stringify(output,null,2));
