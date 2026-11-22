// Matrix-operation benchmark, separate from integrated physics/gameplay timings.
// Explicit, clean reference required; never silently reuse an earlier baseline.
// node tests/benchmark-contact-matrix.cjs --baseline-root=../qbits-matrix-baseline --baseline-commit=1465a6c12160432c5df52b35d782c2f2527720cf --output=/tmp/matrix.json
// Run --mode=counts separately. Its array Proxies are never used in timings.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const args=Object.fromEntries(process.argv.slice(2).map(value=>value.replace(/^--/,'').split('=')));
const root=path.resolve(__dirname,'..');
assert(args['baseline-root'],'--baseline-root must explicitly identify this PR reference');
assert(/^[0-9a-f]{40}$/.test(args['baseline-commit']||''),'--baseline-commit requires the full expected commit');
const roots={baseline:path.resolve(root,args['baseline-root']),optimized:path.resolve(root,args['optimized-root']||'.')};
const mode=args.mode||'timings',counted=mode==='counts',repetitions=Number(args.repetitions??(counted?1:3));
const scales=(args.scales||'22,106,506,1006,1506,2006').split(',').map(Number);
const cases=(args.cases||'none,dormant,sparse,repeated,toggling,dense,churn').split(',');
const warmup=Number(args.warmup??(counted?0:8)),samples=Number(args.samples??(counted?1:30)),budgetMs=Number(args['case-budget-ms']??20000);
assert(['timings','counts'].includes(mode));
assert(scales.length&&scales.every(n=>Number.isInteger(n)&&n>=2&&n<=2006),'bounded body counts, including up to 6 scene bodies');
assert(cases.length&&cases.every(name=>['none','dormant','sparse','repeated','toggling','dense','churn'].includes(name)));
assert(Number.isInteger(repetitions)&&repetitions>0&&repetitions<=6);
assert(Number.isInteger(warmup)&&warmup>=0&&warmup<=600&&Number.isInteger(samples)&&samples>0&&samples<=600);
assert(Number.isFinite(budgetMs)&&budgetMs>0&&budgetMs<=20000,'case budget must be at most 20 seconds');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const git=(location,...a)=>execFileSync('git',['-C',location,...a],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
const sources=Object.fromEntries(Object.entries(roots).map(([key,location])=>[key,fs.readFileSync(path.join(location,'assets/js/game.js'),'utf8')]));
const dependencies=['assets/js/game.js','assets/js/cannon.min.js','tests/game-harness.cjs'];
const identity=Object.fromEntries(Object.entries(roots).map(([key,location])=>[key,{root:location,commit:git(location,'rev-parse','HEAD'),tree:git(location,'rev-parse','HEAD^{tree}'),status:git(location,'status','--porcelain'),files:Object.fromEntries(dependencies.map(name=>[name,sha(fs.readFileSync(path.join(location,name)))]))}]));
assert.equal(identity.baseline.commit,args['baseline-commit'],'wrong baseline commit');
assert.equal(identity.baseline.status,'','reference worktree must be clean');
for(const name of dependencies)assert.equal(identity.baseline.files[name],sha(execFileSync('git',['-C',roots.baseline,'show',args['baseline-commit']+':'+name],{maxBuffer:64*1024*1024})),'reference file differs from pinned commit: '+name);
assert.equal(identity.baseline.files['assets/js/cannon.min.js'],identity.optimized.files['assets/js/cannon.min.js'],'the native Cannon oracle must be identical');
assert.equal(identity.baseline.files['tests/game-harness.cjs'],identity.optimized.files['tests/game-harness.cjs'],'same harness required for both variants');
const quantile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)]??null;};
const stats=values=>({count:values.length,mean:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,p50:quantile(values,.5),p95:quantile(values,.95),p99:quantile(values,.99),min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null});
const copy=value=>JSON.parse(JSON.stringify(value));
const slots=['collisionMatrix','collisionMatrixPrevious'];
function measure(fn){const cpu=process.cpuUsage(),start=performance.now(),result=fn(),wallMs=performance.now()-start,used=process.cpuUsage(cpu);return {result,wallMs,processCpuMs:(used.user+used.system)/1000,processUserMs:used.user/1000,processSystemMs:used.system/1000};}
function memoryDelta(before,after){return Object.fromEntries(Object.keys(before).map(key=>[key,after[key]-before[key]]));}
function setup(variant){
 const source=sources[variant],at=source.lastIndexOf('})();');assert(at>=0);
 const hook='window.__matrixInstall=typeof installTrackedCollisionMatrices==="function"?installTrackedCollisionMatrices:null;';
 const game=require(path.join(roots[variant],'tests/game-harness.cjs'))({graphics:false,gameSource:source.slice(0,at)+hook+source.slice(at)});
 const C=game.sandbox.CANNON,world=new C.World(),oracle=new C.World();
 if(game.sandbox.__matrixInstall)game.sandbox.__matrixInstall(world);
 assert.equal(oracle.collisionMatrix.reset,C.ArrayCollisionMatrix.prototype.reset,'native oracle must not be patched globally');
 const nativeTick=C.World.prototype.collisionMatrixTick;
 assert.equal(oracle.collisionMatrixTick,nativeTick);
 return {C,world,oracle,installed:!!game.sandbox.__matrixInstall};
}
// Bodies deliberately have no shapes: these are matrix operations, not contacts
// generated by narrowphase. Allocation/add/remove/reindex work is included in
// growth and churn samples and is identical in the candidate and native oracle.
function addBodies(env,world,count){for(let i=0;i<count;i++)world.addBody(new env.C.Body({mass:1}));}
function primeDormant(world){
 // Reproduce a world whose two slots have already observed contacts at its
 // largest body index. Do not resize the previous slot by hand: native set
 // expands its array, and native ticks make those holes observable as zeros.
 // All four ticks and both writes are measured separately, never in warmup.
 const last=world.bodies[world.bodies.length-1],first=world.bodies[0];
 for(let i=0;i<2;i++){world.collisionMatrixTick();world.collisionMatrix.set(last,first,true);}
 world.collisionMatrixTick();world.collisionMatrixTick();
}
function round(env,world,name,iteration){
 world.collisionMatrixTick();
 if(name==='churn'){
  const originalCount=world.bodies.length,changes=Math.min(4,originalCount-1);
  for(let k=0;k<changes;k++)world.removeBody(world.bodies[Math.floor(world.bodies.length/3)]);
  addBodies(env,world,changes+4);
  for(let k=0;k<4;k++)world.removeBody(world.bodies[world.bodies.length-1]);
  assert.equal(world.bodies.length,originalCount);
 }
 const current=world.collisionMatrix,previous=world.collisionMatrixPrevious,bodies=world.bodies,n=bodies.length;
 let checksum=0;
 const read=value=>value===undefined?3:value===0?1:2;
 function visit(a,b){
  checksum=(Math.imul(checksum,33)+read(previous.get(a,b)))|0;
  if(name==='toggling'){
   current.set(a,b,true);current.set(a,b,false);current.set(a,b,true);current.set(a,b,false);
  }else{
   current.set(a,b,true);
   if(name==='repeated')for(let k=0;k<3;k++)current.set(a,b,true);
  }
  checksum=(Math.imul(checksum,33)+read(current.get(b,a)))|0;
 }
 if(name==='dense')for(let i=1;i<n;i++)for(let j=0;j<i;j++)visit(bodies[i],bodies[j]);
 else if(name!=='none'&&name!=='dormant')for(let i=1;i<n;i++)visit(bodies[i],bodies[(i+iteration)%i]);
 return checksum;
}
function matrixState(world){
 return slots.map(slot=>{
  const values=world[slot].matrix,bytes=Buffer.alloc(values.length);
  for(let i=0;i<values.length;i++)bytes[i]=Object.hasOwn(values,i)?values[i]===0?1:values[i]===1?2:4:0;
  return {slot,length:values.length,contentsSha256:sha(bytes)};
 });
}
function exactMatrices(actual,expected,label){
 assert.equal(actual.bodies.length,expected.bodies.length,label+' body count');
 for(let i=0;i<actual.bodies.length;i++)assert.equal(actual.bodies[i].index,expected.bodies[i].index,label+' body index');
 for(const slot of slots){
  const a=actual[slot].matrix,b=expected[slot].matrix;assert.equal(a.length,b.length,label+' '+slot+' length');
  for(let i=0;i<a.length;i++){
   if(a[i]!==b[i]||Object.hasOwn(a,i)!==Object.hasOwn(b,i))throw new Error(`${label} ${slot}[${i}]: actual ${a[i]}/${Object.hasOwn(a,i)}, native ${b[i]}/${Object.hasOwn(b,i)}`);
  }
 }
}
function counters(world){
 const value={calls:{get:0,set:0,reset:0,setNumObjects:0},numericReads:0,numericWrites:0,lengthReads:0,lengthWrites:0,resets:[],resizes:[]};let enabled=false;
 for(const slot of slots){
  const matrix=world[slot],array=matrix.matrix;
  matrix.matrix=new Proxy(array,{
   get(target,key,receiver){if(enabled){if(key==='length')value.lengthReads++;else if(typeof key==='string'&&/^(0|[1-9]\d*)$/.test(key))value.numericReads++;}return Reflect.get(target,key,receiver);},
   set(target,key,next,receiver){if(enabled){if(key==='length')value.lengthWrites++;else if(typeof key==='string'&&/^(0|[1-9]\d*)$/.test(key))value.numericWrites++;}return Reflect.set(target,key,next,receiver);}
  });
  for(const method of ['get','set','reset','setNumObjects']){
   const original=matrix[method];matrix[method]=function(...a){
    if(!enabled)return original.apply(this,a);
    value.calls[method]++;const beforeReads=value.numericReads,beforeWrites=value.numericWrites,beforeLength=array.length;
    const result=original.apply(this,a);
    if(method==='reset')value.resets.push({beforeLength,afterLength:array.length,numericReads:value.numericReads-beforeReads,numericWrites:value.numericWrites-beforeWrites});
    if(method==='setNumObjects')value.resizes.push({objects:a[0],beforeLength,afterLength:array.length,numericReads:value.numericReads-beforeReads,numericWrites:value.numericWrites-beforeWrites});
    return result;
   };
  }
 }
 return {start(){enabled=true;},stop(){enabled=false;},snapshot(){return copy(value);}};
}
function inventory(world){return {bodies:world.bodies.length,shapes:0,constraints:world.constraints.length,awakeBodies:world.bodies.filter(body=>body.sleepState===0).length,physicalContacts:world.contacts.length,solverEquations:world.solver.equations.length,sensors:0,motors:0,physicsSteps:world.stepnumber,worldTime:world.time,matrixLengths:slots.map(slot=>world[slot].matrix.length)};}
function oneRun(variant,name,count,repetition){
 const begun=performance.now(),env=setup(variant),runtimeSetupMs=performance.now()-begun;
 const record={variant,name,bodies:count,repetition,runtimeSetupMs,installed:env.installed,initial:inventory(env.world)};
 const stop=stage=>{record.stopped={stage,budgetMs,elapsedMs:performance.now()-begun};record.final=inventory(env.world);return {record};};
 const counter=counted?counters(env.world):null;
 if(performance.now()-begun>=budgetMs)return stop('runtime setup');
 const beforeMemory=process.memoryUsage();
 if(counted){counter.start();addBodies(env,env.world,count);counter.stop();record.growthCounts=counter.snapshot();}
 else{record.growth=measure(()=>addBodies(env,env.world,count));delete record.growth.result;}
 record.memoryAfterGrowth=memoryDelta(beforeMemory,process.memoryUsage());record.afterGrowth=inventory(env.world);
 if(performance.now()-begun>=budgetMs)return stop('growth');
 if(name==='dormant'){
  const primeMemory=process.memoryUsage();
  if(counted){counter.start();primeDormant(env.world);counter.stop();record.primingCounts=counter.snapshot();}
  else{record.priming=measure(()=>primeDormant(env.world));delete record.priming.result;}
  record.memoryDuringPriming=memoryDelta(primeMemory,process.memoryUsage());record.afterPriming=inventory(env.world);
  const length=count*(count-1)/2;
  assert.deepEqual(record.afterPriming.matrixLengths,[length,length],'both dormant matrices must retain the native triangular extent');
  if(performance.now()-begun>=budgetMs)return stop('dormant priming');
 }
 // The oracle is replayed outside timings, after the sampled candidate. It is
 // independent and never shares backing arrays or dirty trackers with it.
 const expectedChecksums=[],actualChecksums=[];
 let cold;
 if(counted){counter.start();cold={result:round(env,env.world,name,0)};counter.stop();record.coldCounts=counter.snapshot();}
 else cold=measure(()=>round(env,env.world,name,0));
 actualChecksums.push(cold.result);delete cold.result;record.cold=counted?undefined:cold;
 if(performance.now()-begun>=budgetMs)return stop('cold round');
 const warmStart=performance.now();let completed=0;
 for(;completed<warmup&&performance.now()-begun<budgetMs;completed++)actualChecksums.push(round(env,env.world,name,completed+1));
 record.warmup={completed,wallMs:performance.now()-warmStart};
 if(completed!==warmup||performance.now()-begun>=budgetMs)return stop('warmup');
 const sampleMemory=process.memoryUsage(),wall=[],cpu=[],user=[],system=[];
 if(counted)counter.start();
 for(completed=0;completed<samples&&performance.now()-begun<budgetMs;completed++){
  if(counted)actualChecksums.push(round(env,env.world,name,warmup+completed+1));
  else{const sample=measure(()=>round(env,env.world,name,warmup+completed+1));actualChecksums.push(sample.result);wall.push(sample.wallMs);cpu.push(sample.processCpuMs);user.push(sample.processUserMs);system.push(sample.processSystemMs);}
 }
 if(counted){counter.stop();record.totalCounts=counter.snapshot();}
 record.memoryDuringMeasurement=memoryDelta(sampleMemory,process.memoryUsage());record.completedSamples=completed;
 record.samples=counted?undefined:{wallMs:wall,processCpuMs:cpu,processUserMs:user,processSystemMs:system};
 record.statistics=counted?undefined:{wallMs:stats(wall),processCpuMs:stats(cpu),processUserMs:stats(user),processSystemMs:stats(system)};
 if(completed!==samples||performance.now()-begun>=budgetMs)return stop('measurement');
 const oracleStart=performance.now();addBodies(env,env.oracle,count);if(name==='dormant')primeDormant(env.oracle);
 record.nativeOracleRoundsRequested=1+warmup+samples;record.nativeOracleRoundsCompleted=0;
 for(let iteration=0;iteration<record.nativeOracleRoundsRequested;iteration++){
  if(performance.now()-begun>=budgetMs){record.nativeOracleMs=performance.now()-oracleStart;return stop('native oracle replay');}
  expectedChecksums.push(round(env,env.oracle,name,iteration));record.nativeOracleRoundsCompleted++;
 }
 if(performance.now()-begun>=budgetMs){record.nativeOracleMs=performance.now()-oracleStart;return stop('native oracle replay');}
 assert.deepEqual(actualChecksums,expectedChecksums,'native get/current/previous results differ');
 exactMatrices(env.world,env.oracle,'final matrix state');
 record.nativeOracleMs=performance.now()-oracleStart;record.nativeOracle=true;record.final=inventory(env.world);record.finalMatrices=matrixState(env.world);record.checksums=actualChecksums;
 assert.equal(record.final.physicsSteps,0);assert.equal(record.final.worldTime,0);
 record.totalCaseMs=performance.now()-begun;
 if(record.totalCaseMs>=budgetMs)return stop('native oracle validation');
 record.complete=true;return {record};
}
(async()=>{
 const reports=[],result={schema:1,mode,referenceCommit:args['baseline-commit'],sources:identity,runtime:{node:process.version,platform:process.platform,arch:process.arch,cpuModel:os.cpus()[0]?.model,availableParallelism:os.availableParallelism()},configuration:{scales,cases,repetitions,warmup,samples,budgetMs,order:Array.from({length:repetitions},(_,i)=>i%2?'BA':'AB').join('/'),forcedGc:false,benchmarkSha256:sha(fs.readFileSync(__filename))},method:'Synthetic matrix operations using shipped Cannon worlds/bodies and the production matrix installer loaded by the real game harness. Scale is BODY COUNT, not piece count. No shapes, narrowphase, solver, rendering, or simulated time. Each timed round includes current/previous swap, reset, previous/current queries, writes, and churn where selected. Growth includes body allocation and native addBody resizing; churn includes allocation/removal/reindexing. The none case leaves the never-used previous matrix empty. The dormant case separately measures priming: two tick/set operations at the largest body index, then two ticks to clear both slots; both arrays retain their full native extent. Priming costs and memory deltas are reported before the cold sample, not hidden in warmup. Native unpatched matrices are an independent oracle replayed outside timings; values, holes, lengths, body indices and query results must be exact. Counts use array Proxies and method wrappers in a separate mode; count snapshots are cumulative. Raw process memory deltas are runtime observations, not retained structure sizes; GC is never forced. Pared and process CPU are distinct, neither is browser FPS or CPU utilization. Budget checked between complete operations; no physical step is interrupted.',reports};
 let failure;
 try{
  for(const name of cases){let lastCompleted=null;
   for(const count of scales){
    const runs={baseline:[],optimized:[]};let stopped=false;
    for(let repetition=1;repetition<=repetitions&&!stopped;repetition++)for(const variant of repetition%2?['baseline','optimized']:['optimized','baseline']){
     const {record}=oneRun(variant,name,count,repetition);runs[variant].push(record);if(record.stopped){stopped=true;break;}
     await new Promise(setImmediate);
    }
    if(!stopped)for(let i=0;i<repetitions;i++){
     assert.deepEqual(runs.baseline[i].checksums,runs.optimized[i].checksums,'paired query results');
     assert.deepEqual(runs.baseline[i].finalMatrices,runs.optimized[i].finalMatrices,'paired exact matrix state');
     assert.deepEqual(runs.baseline[i].final,runs.optimized[i].final,'paired inventory and clocks');
    }
    reports.push({name,bodies:count,lastCompleted,complete:!stopped,identical:!stopped,runs});
    process.stderr.write(`${name} ${count} bodies ${stopped?'stopped':'completed'}\n`);
    if(args.output){fs.mkdirSync(path.dirname(path.resolve(args.output)),{recursive:true});fs.writeFileSync(args.output,JSON.stringify(result,null,2)+'\n');}
    if(stopped)break;lastCompleted=count;
   }
  }
 }catch(error){failure={message:error.message,stack:error.stack};process.exitCode=1;}
 result.failure=failure;result.complete=!failure&&reports.length===cases.length*scales.length&&reports.every(report=>report.complete);
 if(args.output)fs.writeFileSync(args.output,JSON.stringify(result,null,2)+'\n');else process.stdout.write(JSON.stringify(result,null,2)+'\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
