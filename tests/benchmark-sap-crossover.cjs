// Same-world crossover to separate SAP route cost from differences between VMs.
// Node/Cannon with DOM/GPU stubs, not browser FPS. Run alone, without profilers.
// node tests/benchmark-sap-crossover.cjs --output=/tmp/sap-crossover.json
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const fixtures=require('./cpu-audit-fixtures.cjs');
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const root=path.resolve(__dirname,'..',args['game-root']||'.'),pieces=Number(args.pieces||2000),hz=60,warmup=180,reheat=30,frames=60,worlds=3,budgetMs=Number(args['phase-budget-ms']||20000);
const output=path.resolve(args.output||'/tmp/qbits-sap-crossover.json');
assert(Number.isInteger(pieces)&&pieces>0&&pieces<=2000,'preserve current piece limit');assert(Number.isFinite(budgetMs)&&budgetMs>0&&budgetMs<=60000,'bounded phase budget');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex'),source=fs.readFileSync(path.join(root,'assets/js/game.js'),'utf8');
const git=(...a)=>execFileSync('git',['-C',root,...a],{encoding:'utf8'}).trim();
const clock=t=>({...t.getTickState(),cannonSteps:t.world.stepnumber});
const quantile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.ceil(p*sorted.length)-1)]??null;};
const stats=values=>({count:values.length,mean:values.reduce((a,b)=>a+b,0)/Math.max(1,values.length),p50:quantile(values,.5),p95:quantile(values,.95),p99:quantile(values,.99),min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null});
function frame(t){t.advanceSimulation(1/60);t.updateBatteryLiquids(1/60);t.updateTarget();t.renderScene();}
function clockDelta(before,after,count){
 const d={physicsSteps:after.physics-before.physics,cannonSteps:after.cannonSteps-before.cannonSteps,logicSteps:after.logic-before.logic,simulatedSeconds:after.simTime-before.simTime,droppedSeconds:after.droppedSeconds-before.droppedSeconds,physicsAccumulator:after.physicsAccumulator,logicAccumulator:after.logicAccumulator};
 assert.equal(d.physicsSteps,count);assert.equal(d.cannonSteps,count);assert(Math.abs(d.simulatedSeconds-count/60)<1e-8);assert.equal(d.droppedSeconds,0);return d;
}
function invariantState(f){
 const state=JSON.parse(f.state());
 // This fixture is fully charged and neutral throughout its six simulated
 // seconds. Only clocks are omitted, never energy, mood/blend, pose or mass.
 delete state.clocks;delete state.worldTime;delete state.data.runtime.time;
 for(const group of state.data.groups)for(const part of group.parts){
  assert.equal(part.mood.energy,1,'do not obtain cheaper work by changing energy');assert.equal(part.mood.state,'neutral','fixture crossed a mood transition');
  delete part.mood.idle;delete part.mood.fullTime;
 }
 return JSON.stringify(state);
}
function runWorld(repetition){
 const start=performance.now(),createGame=require(path.join(root,'tests/game-harness.cjs')),game=createGame({graphics:false,gameSource:source}),{t,sandbox}=game,f=fixtures(t);
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 t.applyPreferences({physicsHz:hz,shadows:'off',music:false,guideVoice:false,footsteps:false,joinSounds:false});assert.equal(t.getPhysicsStep(),1/hz);
 t.setLook({camera:[0,1.7,0],yaw:0,pitch:0});f.scene('independent',pieces,false);
 for(const g of t.groups)for(const p of g.parts)p.mood.energy=1;
 const world=t.world,bp=world.broadphase,native=sandbox.CANNON.SAPBroadphase.prototype.collisionPairs,filtered=bp.collisionPairs,routes={native,filtered};
 assert.notEqual(native,filtered,'use the optimized game root, with native prototype intact');assert.equal(world.doProfiling,false,'primary timing must not enable Cannon profiling');
 const order=repetition%2?['native','filtered']:['filtered','native'];
 const report={repetition,order,setupMs:performance.now()-start,routeFunctionSha256:{native:sha(String(native)),filtered:sha(String(filtered))},clockBeforeWarmup:clock(t),inventoryBefore:f.inventory(),arms:[]};
 const stop=(phase,completed,elapsedMs)=>{report.stopped={phase,completed,elapsedMs,budgetMs};report.clockAtStop=clock(t);report.inventoryAtStop=f.inventory();};
 function bounded(count,operation){const begun=performance.now();let completed=0;for(;completed<count&&performance.now()-begun<budgetMs;completed++)operation(completed);return {completed,wallMs:performance.now()-begun};}
 try{
  if(report.setupMs>budgetMs){stop('setup',0,report.setupMs);return report;}
  // Warm both call targets equally within this same world before either arm.
  const common=bounded(warmup,i=>{bp.collisionPairs=i%2?filtered:native;frame(t);});
  report.commonWarmup={...common,clockAfter:clock(t)};report.commonWarmup.clockDelta=clockDelta(report.clockBeforeWarmup,report.commonWarmup.clockAfter,common.completed);
  if(common.completed!==warmup||common.wallMs>budgetMs){stop('common-warmup',common.completed,common.wallMs);return report;}
  assert.equal(f.inventory().awakeBodies,0,'common warmup must settle all dynamic bodies');
  const reference=invariantState(f),axisBodies=[...bp.axisList],matrixArrays=[world.collisionMatrix.matrix,world.collisionMatrixPrevious.matrix],matrixLengths=matrixArrays.map(a=>a.length);
  report.referenceStateSha256=sha(reference);report.axisBodyIds=axisBodies.map(body=>body.id);report.matrixLengths=matrixLengths;
  function verifyScene(){
   assert.equal(invariantState(f),reference,'all non-clock physical/save/mood state must remain exactly invariant');
   assert.equal(bp.axisList.length,axisBodies.length);for(let i=0;i<axisBodies.length;i++)assert.equal(bp.axisList[i],axisBodies[i],'axis list order or body identity changed');
   const slots=[world.collisionMatrix.matrix,world.collisionMatrixPrevious.matrix];
   for(let slot=0;slot<slots.length;slot++){
    const array=slots[slot];assert.equal(array,matrixArrays[slot],'even step count must preserve current/previous array identities');assert.equal(array.length,matrixLengths[slot]);
    for(let i=0;i<array.length;i++)if(array[i]!==0)throw new Error('settled matrix entry is not zero at '+slot+':'+i);
   }
   const dirty=bp.dirty,output={};
   try{for(const [name,route]of Object.entries(routes)){const a=[],b=[];route.call(bp,world,a,b);output[name]=a.map((body,i)=>[body.id,b[i].id]);}}
   finally{bp.dirty=dirty;}
   assert.deepEqual(output.native,output.filtered,'ordered native and filtered pairs differ');assert.equal(output.native.length,0,'settled fixture must have no candidate pairs');
   for(let i=0;i<axisBodies.length;i++)assert.equal(bp.axisList[i],axisBodies[i],'query changed settled axis order');
   return {invariantStateSha256:sha(reference),sameBodyAndArrayIdentities:true,matricesAllZero:true,orderedPairsIdentical:true,pairCount:output.native.length,inventory:f.inventory(),clock:clock(t),moodClockRange:{idleMin:Math.min(...t.groups.map(g=>g.parts[0].mood.idle)),idleMax:Math.max(...t.groups.map(g=>g.parts[0].mood.idle)),fullTimeMin:Math.min(...t.groups.map(g=>g.parts[0].mood.fullTime)),fullTimeMax:Math.max(...t.groups.map(g=>g.parts[0].mood.fullTime))}};
  }
  report.afterCommonWarmup=verifyScene();
  for(const name of order){
   bp.collisionPairs=routes[name];const beforeReheat=clock(t),reheated=bounded(reheat,()=>frame(t));
   const arm={route:name,reheat:{...reheated,clockDelta:clockDelta(beforeReheat,clock(t),reheated.completed)}};report.arms.push(arm);
   if(reheated.completed!==reheat||reheated.wallMs>budgetMs){stop(name+'-reheat',reheated.completed,reheated.wallMs);return report;}
   // Expensive snapshots and matrix scans occur before reheat or after timing,
   // never between reheating and the primary measurement window.
   const before=clock(t),wall=[],cpu=[],user=[],system=[],begun=performance.now();let completed=0;
   for(;completed<frames&&performance.now()-begun<budgetMs;completed++){
    const initialCpu=process.cpuUsage(),start=performance.now();frame(t);const wallMs=performance.now()-start,used=process.cpuUsage(initialCpu);
    wall.push(wallMs);cpu.push((used.user+used.system)/1000);user.push(used.user/1000);system.push(used.system/1000);
   }
   const totalWallMs=performance.now()-begun,after=clock(t);
   arm.measurement={completed,totalWallMs,clockBefore:before,clockAfter:after,clockDelta:clockDelta(before,after,completed),wallMsPerFrame:stats(wall),processCpuMsPerFrame:stats(cpu),processUserMsPerFrame:stats(user),processSystemMsPerFrame:stats(system),wallSamples:wall,processCpuSamples:cpu};
   arm.validation=verifyScene();
   if(completed!==frames||totalWallMs>budgetMs){stop(name+'-measurement',completed,totalWallMs);return report;}
  }
  report.complete=true;report.invariantAcrossBothRoutes=true;report.clockAfter=clock(t);return report;
 }finally{bp.collisionPairs=filtered;}
}

(async()=>{
 const begun=performance.now(),runs=[],result={method:'Same-world SAP crossover. Three fresh optimized game worlds; native and filtered collisionPairs are alternated only by assigning the existing method references. The same bodies, matrices, camera and full non-clock state are used for both arms. Both routes receive common warmup, then each arm receives reheat. Native Cannon phase timers, detailed counters and V8 introspection are OFF; no forced GC. Expensive invariant/pair/matrix checks occur outside timing. This diagnostic does not replace independent-VM results or erase unfavorable measurements; it isolates route cost within each world. Not browser FPS.',startedAt:new Date().toISOString(),invocation:{executable:process.execPath,execArgv:[...process.execArgv],args:process.argv.slice(1)},source:{root,commit:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),gameSha256:sha(source),harnessSha256:sha(fs.readFileSync(path.join(root,'tests/game-harness.cjs')))},toolSha256:sha(fs.readFileSync(__filename)),fixturesSha256:sha(fs.readFileSync(path.join(__dirname,'cpu-audit-fixtures.cjs'))),node:process.version,runtime:{platform:process.platform,arch:process.arch,cpuModel:os.cpus()[0]?.model,availableParallelism:os.availableParallelism()},configuration:{pieces,hz,warmup,reheat,frames,worlds,budgetMs,order:'AB/BA/AB',commonWarmupRoutes:'native/filtered alternating frames',initialPieceEnergy:1,requiredMoodState:'neutral',viewport:'1280x720 DOM/GPU stubs',camera:[0,1.7,0],shadows:'off',excludedClockFields:['clocks','worldTime','data.runtime.time','data.groups[*].parts[*].mood.idle','data.groups[*].parts[*].mood.fullTime']},runs};
 fs.mkdirSync(path.dirname(output),{recursive:true});
 for(let repetition=1;repetition<=worlds;repetition++){
  const run=runWorld(repetition);runs.push(run);fs.writeFileSync(output,JSON.stringify({...result,totalRunWallMs:performance.now()-begun,complete:runs.length===worlds&&runs.every(r=>r.complete)},null,2)+'\n');
  process.stderr.write('world '+repetition+' '+(run.complete?'completed':'stopped')+'\n');if(run.stopped)break;await new Promise(setImmediate);
 }
 process.stdout.write(JSON.stringify({output,complete:runs.length===worlds&&runs.every(r=>r.complete),completedWorlds:runs.filter(r=>r.complete).length,totalRunWallMs:performance.now()-begun})+'\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
