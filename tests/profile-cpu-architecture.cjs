// Diagnostic run, separate from primary timing. Native V8 CPU/heap sampling
// through Node's in-process Inspector (no listening port), and Cannon's own
// phase timers. DOM/GPU remain stubs: this is not a Chrome or FPS profile.
const fs=require('node:fs'),path=require('node:path'),inspector=require('node:inspector'),{PerformanceObserver}=require('node:perf_hooks'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const fixtures=require('./cpu-audit-fixtures.cjs');
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const root=path.resolve(__dirname,'..'),out=args.output||'/tmp/qbits-node-profile.json',dir=path.dirname(out);
const roots={baseline:path.resolve(root,args['baseline-root']||'../qbits-baseline'),optimized:root};
const identity=Object.fromEntries(Object.entries(roots).map(([variant,p])=>[variant,Object.fromEntries(['game','workshop'].map(n=>[n+'Sha256',crypto.createHash('sha256').update(fs.readFileSync(path.join(p,'assets/js',n+'.js'))).digest('hex')]))]));
const phases=['refreshRotors','updatePowerNetwork','updateConveyors','updateRobotGrips','updateRobotArms','updateGrab','updateRoutes','updateHauling','prepareRotorPower','updateRotorMotors','driveRobotArms','driveConveyors','driveServos','updateFlights','stabilizeRotors','finishMechanicalRest','updateRotorPower','tickContactSensors','tickFlightSensors','updateCooling','updateMoods','updateBlueprints','tickProduction','updateBatteryLiquids','updateTarget','renderScene','drawQubits','drawWorkshop','saveCurrentGame'];
const reports=[];
function setup(variant,instrumented=false){
 const p=roots[variant],createGame=require(path.join(p,'tests/game-harness.cjs'));let source=fs.readFileSync(path.join(p,'assets/js/game.js'),'utf8');
 if(instrumented){const at=source.lastIndexOf('})();'),hooks=`window.__phaseProfile={enabled:false,blocks:{}};`+phases.map(n=>`{const original=${n};${n}=function(...a){if(!window.__phaseProfile.enabled)return original.apply(this,a);const start=performance.now();try{return original.apply(this,a);}finally{const o=window.__phaseProfile.blocks['${n}']||(window.__phaseProfile.blocks['${n}']={calls:0,inclusiveMs:0});o.calls++;o.inclusiveMs+=performance.now()-start;}};}`).join('\n');source=source.slice(0,at)+hooks+source.slice(at);}
 const game=createGame({graphics:false,gameSource:source}),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.applyPreferences({physicsHz:120,shadows:'off'});assert.equal(t.getPhysicsStep(),1/120);t.setLook({camera:[0,1.7,6],yaw:0,pitch:-.2});return {...game,f:fixtures(t)};
}
function topCpu(p){const times=new Map();for(let i=0;i<(p.samples||[]).length;i++)times.set(p.samples[i],(times.get(p.samples[i])||0)+(p.timeDeltas?.[i]||0));return p.nodes.map(n=>({name:n.callFrame.functionName||'(anonymous)',url:n.callFrame.url,line:n.callFrame.lineNumber+1,selfMs:(times.get(n.id)||0)/1000})).sort((a,b)=>b.selfMs-a.selfMs).slice(0,30);}
function topAlloc(p){const all=[];function visit(n){if(n.selfSize)all.push({name:n.callFrame.functionName||'(anonymous)',line:n.callFrame.lineNumber+1,sampledBytes:n.selfSize});for(const c of n.children||[])visit(c);}visit(p.head);return all.sort((a,b)=>b.sampledBytes-a.sampledBytes).slice(0,30);}
(async()=>{
 fs.mkdirSync(dir,{recursive:true});
 for(const variant of ['baseline','optimized']){
  const game=setup(variant),{t,f}=game;f.distant(1000);
  const work=()=>{for(let i=0;i<80;i++){t.updateTarget();t.tickContactSensors(1/120);t.drawWorkshop();t.updateMoods(1/120);}};work();global.gc?.();
  const gc={events:0,totalMs:0,maxMs:0,byKind:{}},observer=new PerformanceObserver(list=>{for(const e of list.getEntries()){gc.events++;gc.totalMs+=e.duration;gc.maxMs=Math.max(gc.maxMs,e.duration);const kind=e.detail?.kind??'unknown';gc.byKind[kind]=(gc.byKind[kind]||0)+1;}});observer.observe({entryTypes:['gc']});
  const session=new inspector.Session();session.connect();const send=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(e,r)=>e?reject(e):resolve(r)));
  await send('Profiler.enable');await send('Profiler.setSamplingInterval',{interval:100});await send('Profiler.start');work();const cpu=await send('Profiler.stop');
  await new Promise(setImmediate);await new Promise(setImmediate);observer.disconnect();
  await send('HeapProfiler.enable');await send('HeapProfiler.collectGarbage');const before=process.memoryUsage();
  await send('HeapProfiler.startSampling',{samplingInterval:4096,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});work();const alloc=await send('HeapProfiler.stopSampling');
  await send('HeapProfiler.collectGarbage');const after=process.memoryUsage();session.disconnect();
  const prefix=path.join(dir,'node-'+variant);fs.writeFileSync(prefix+'.cpuprofile',JSON.stringify(cpu.profile));fs.writeFileSync(prefix+'.heapprofile',JSON.stringify(alloc.profile));
  reports.push({variant,scenario:'1000 distant pieces; 80 target + empty-sensor tick/draw + mood updates, warmed',inventory:f.inventory(),cpuTop:topCpu(cpu.profile),allocationTop:topAlloc(alloc.profile),gcDuringCpuProfile:gc,heapBefore:before,heapAfter:after,profiles:[path.basename(prefix+'.cpuprofile'),path.basename(prefix+'.heapprofile')]});
 }
 const diagnostics=[];
 for(const variant of ['baseline','optimized']){
  const states={false:[],true:[]},runs=[];
  for(let repetition=1;repetition<=3;repetition++)for(const instrumented of repetition%2?[false,true]:[true,false]){
   const {t,f,sandbox}=setup(variant,instrumented);f.scene('factory',500,true);
   for(let i=0;i<24;i++)t.stepSimulation(1/120);
   t.world.doProfiling=instrumented;if(instrumented)sandbox.__phaseProfile.enabled=true;
   const phases={};const cpu=process.cpuUsage(),start=performance.now();
   for(let frame=0;frame<12;frame++){
    for(let j=0;j<2;j++){t.stepSimulation(1/120);if(instrumented)for(const [key,value]of Object.entries(t.world.profile))phases[key]=(phases[key]||0)+value;}
    t.updateBatteryLiquids(1/60);t.updateTarget();t.renderScene();
   }
   const used=process.cpuUsage(cpu),wallMs=performance.now()-start;
   states[instrumented].push(f.state());runs.push({repetition,instrumented,wallMs,processCpuMs:(used.user+used.system)/1000,inventory:f.inventory(),blocks:instrumented?sandbox.__phaseProfile.blocks:null,cannonPhaseSumMs:instrumented?phases:null});
  }
  assert(states.false.every((s,i)=>s===states.true[i]),'instrumentation must preserve the full state');diagnostics.push({variant,identicalStateWithInstrumentation:true,runs});
 }
 fs.writeFileSync(out,JSON.stringify({method:'Node V8 Inspector sampling; not Chrome. Allocation samples include collected objects if supported by V8. GC durations and forced-GC heap readings are diagnostic and separate from main timings. Block times are inclusive and nested; DO NOT SUM them. Cannon phase timers are reported verbatim. Instrumentation A/B uses three warmed alternating pairs; report variation rather than a universal overhead percentage.',sources:identity,node:process.version,reports,diagnostics},null,2)+'\n');
})().catch(e=>{console.error(e);process.exitCode=1;});
