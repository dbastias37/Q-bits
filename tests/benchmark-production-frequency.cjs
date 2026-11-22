// Guided production, real Cannon and game code; DOM/GPU are harness stubs.
// Run alone. Timings are Node process CPU / elapsed wall time, never FPS.
// node tests/benchmark-production-frequency.cjs --baseline-root=../qbits-production-baseline --mode=timing --output=/tmp/production-timing.json
// node tests/benchmark-production-frequency.cjs --baseline-root=../qbits-production-baseline --mode=trace --output=/tmp/production-trace.json
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const fixtures=require('./cpu-audit-fixtures.cjs');
const args=Object.fromEntries(process.argv.slice(2).map(value=>{const i=value.indexOf('=');assert(value.startsWith('--')&&i>2,'Use --name=value arguments');return [value.slice(2,i),value.slice(i+1)];}));
const root=path.resolve(__dirname,'..'),roots={baseline:path.resolve(root,args['baseline-root']||'../qbits-production-baseline'),optimized:path.resolve(root,args['optimized-root']||'.')};
const mode=args.mode||'timing',repetitions=mode==='trace'?1:Number(args.repetitions||3),budgetMs=Number(args['case-budget-ms']||60000);
const levels=(args.levels||'19,20').split(',').map(Number),rates=(args.rates||'60,120,240').split(',').map(Number);
assert(['timing','trace'].includes(mode));assert(Number.isInteger(repetitions)&&repetitions>=1&&repetitions<=10);assert(Number.isFinite(budgetMs)&&budgetMs>0&&budgetMs<=300000);
assert(levels.length&&levels.every(n=>[19,20].includes(n)));assert(rates.length&&rates.every(n=>[60,120,240].includes(n)));
const FRAME_DT=1/60,MAX_FRAMES=3600,WARMUP_FRAMES=300,SHARED_END_FRAME=900,TRACE_LIMIT=256;
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sources=Object.fromEntries(Object.entries(roots).map(([version,dir])=>[version,fs.readFileSync(path.join(dir,'assets/js/game.js'),'utf8')]));
const sourceFiles=['assets/js/game.js','assets/js/cannon.min.js','assets/js/rotor-power.js','assets/js/campaign-production.js','assets/js/preferences.js','tests/game-harness.cjs'];
function identity(dir){
 const git=(...parameters)=>execFileSync('git',['-C',dir,...parameters],{encoding:'utf8'}).trim();
 return {root:dir,commit:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),trackedChanges:!!git('status','--porcelain','--untracked-files=no'),sha256:Object.fromEntries(sourceFiles.map(file=>[file,sha(fs.readFileSync(path.join(dir,file)))]))};
}
const identities=Object.fromEntries(Object.entries(roots).map(([version,dir])=>[version,identity(dir)]));
const quantile=(values,q)=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.ceil(q*sorted.length)-1];};
const stats=values=>({count:values.length,mean:values.length?values.reduce((sum,n)=>sum+n,0)/values.length:null,p50:quantile(values,.5),p95:quantile(values,.95),p99:quantile(values,.99),min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null});
const vec=value=>[value.x,value.y,value.z];
function setup(version,hz,level){
 let source=sources[version];
 if(mode==='trace'){
  // The callback is deliberately absent from timing runs. It observes the
  // battery immediately after the final production tick, before a later step
  // in the same 60 Hz frame can recharge the now-disabled rotor.
  const hook='const auditProductionTick=tickProduction;tickProduction=function(dt){auditProductionTick(dt);window.__productionFrequencyStep?.();};';
  const solve='const solveRotorContacts=world.solver.solve;';assert.equal(source.split(solve).length,2,'one native-solver boundary');
  source=source.replace(solve,'const auditNativeProductionSolve=world.solver.solve;const solveRotorContacts=function(dt,physicsWorld){window.__productionFrequencySolve?.(dt,physicsWorld);return auditNativeProductionSolve.call(this,dt,physicsWorld);};');
  const end=source.lastIndexOf('})();');assert(end>=0);source=source.slice(0,end)+hook+source.slice(end);
 }
 const storageMap=new Map(),storage={getItem:key=>storageMap.get(key)??null,setItem:(key,value)=>storageMap.set(key,String(value)),removeItem:key=>storageMap.delete(key)};
 const game=require(path.join(roots[version],'tests/game-harness.cjs'))({graphics:false,storage,gameSource:source}),{t,sandbox}=game;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 t.applyPreferences({physicsHz:hz,shadows:'off',music:false,guideVoice:false,footsteps:false,joinSounds:false});
 assert.equal(t.getPhysicsStep(),1/hz,'select the actual preference BEFORE creating joints');
 t.setLook({camera:[0,1.7,0],yaw:0,pitch:0});t.beginCampaignLevel(level);t.hideStoryDialogue();
 const s=t.story.campaign.production;assert.equal(s.rotor.rpm,30);assert.equal(s.rotor.maxTorque,.4);assert.equal(s.goal.budget,level===19?20:30);assert(t.startProduction());
 return {...game,s,f:fixtures(t)};
}
function material(t,s){return t.groups.filter(g=>g.parts.some(part=>part.mood.production?.batch===s.batch));}
function auditMatter(t,s){
 const bodies=material(t,s),physical=bodies.flatMap(g=>Array.from(g.parts)),buffer=Array.from(s.buffer),job=Array.from(s.packJob?.parts||[]),delivered=Array.from(s.ledger.accepted).flatMap(item=>Array.from(item.ids||[item.id]));
 const ids=[...s.ledger.stock,...physical.map(p=>p.id),...buffer.map(p=>p.id),...job.map(p=>p.id),...delivered];
 const expected=Array.from(s.entries,p=>p.id).sort((a,b)=>a-b);
 assert.deepEqual([...ids].sort((a,b)=>a-b),expected,'each original identity exists exactly once');assert.equal(new Set(ids).size,ids.length);
 const mass=(s.ledger.stock.length+delivered.length)*.5+[...physical,...buffer,...job].reduce((sum,p)=>sum+p.weight,0);
 assert(Math.abs(mass-s.goal.units*.5)<1e-8,'the finite batch retains its mass');
 for(const g of bodies)assert(Math.abs(g.body.mass-g.parts.reduce((sum,p)=>sum+p.weight,0)*.25)<1e-8,'physical mass matches matter');
 return {uniqueIds:ids.length,totalMass:mass,originalIds:expected,deliveredIds:delivered};
}
function batteries(t,s){
 return [s.rotor.aId,s.rotor.bId].map(id=>{const part=t.rotorPart(id).part;return {id,fraction:part.mood.energy,capacityJoules:t.gameBatteryCapacity(part)};});
}
function debit(initial,current){return initial.reduce((sum,b,i)=>sum+(b.fraction-current[i].fraction)*b.capacityJoules,0);}
function detail(t,s,f,frame){
 return {frame,time:s.time,joules:s.joules,autonomy:s.autonomy,actualRpm:s.rotor.actualRpm,stalled:s.rotor.stalled,powerActive:s.rotor.powerActive,
  stock:s.ledger.stock.length,released:s.ledger.released.length,packed:s.ledger.packed.length,accepted:s.ledger.accepted.length,
  buffer:Array.from(s.buffer,p=>p.id),packJob:s.packJob?{ids:Array.from(s.packJob.item.ids),time:s.packJob.time}:null,
  complete:s.complete,failed:s.failed,inventory:f.inventory(),matter:auditMatter(t,s),
  material:material(t,s).map(g=>{const b=g.body;return {ids:Array.from(g.parts,p=>p.id),role:g.parts[0].mood.production.role,mass:b.mass,type:b.type,sleepState:b.sleepState,shapes:b.shapes.length,
   position:vec(b.position),velocity:vec(b.velocity),angularVelocity:vec(b.angularVelocity),quaternion:[b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w],minY:t.bounds(g).min.y,
   contacts:t.world.contacts.filter(c=>c.bi===b||c.bj===b).map(c=>({otherBodyId:(c.bi===b?c.bj:c.bi).id,normal:vec(c.ni),multiplier:c.multiplier})),
   friction:t.world.frictionEquations.filter(eq=>eq.bi===b||eq.bj===b).map(eq=>({otherBodyId:(eq.bi===b?eq.bj:eq.bi).id,tangent:vec(eq.t),maxForceAfterRestore:eq.maxForce,multiplier:eq.multiplier}))};})};
}
function run(version,hz,level,repetition){
 const {t,s,sandbox,f}=setup(version,hz,level),initialClock=t.getTickState(),initialWorldStepNumber=t.world.stepnumber,initialInventory=f.inventory(),initialBatteries=batteries(t,s),initialMatter=auditMatter(t,s);
 const trace=[],peak={},wallSamples=[],cpuSamples=[],sharedWall=[],sharedCpu=[];
 const solveStats={calls:0,callsWithTableContact:0,adjustedEquationVisits:0,peakMaterialBodies:0,peakTableContactPoints:0,peakTableFrictionEquations:0,peakAdjustedFrictionEquations:0,peakAdjustedBodies:0};let latestSolve=null;
 let frame=0,traceSteps=0,nextSample=0,previousKey='',lastCompletedFrame=0,stopped=null,terminalStep=null,traceOverflow=false;
 if(mode==='trace'){
  const surfaceBody=s.surfaceBody||t.storyWorld.walls.find(w=>w.p.x===0&&w.p.y===s.surface/2&&w.p.z===s.z&&w.half.x===1.85&&w.half.z===.22)?.body;
  assert(surfaceBody,'identify the actual guided table, including baseline without surfaceBody');
  sandbox.__productionFrequencySolve=(dt,physicsWorld)=>{
   const bodies=material(t,s),other=eq=>eq.bi===surfaceBody?eq.bj:eq.bj===surfaceBody?eq.bi:null;
   let contactCount=0,frictionCount=0,adjustedCount=0,adjustedBodies=0;const records=[];
   for(const g of bodies){
    const b=g.body,contacts=physicsWorld.contacts.filter(c=>c.enabled&&other(c)===b),equations=physicsWorld.frictionEquations.filter(eq=>eq.enabled&&other(eq)===b);
    if(!contacts.length&&!equations.length)continue;
    const nominalForce=physicsWorld.defaultContactMaterial.friction*b.mass*physicsWorld.gravity.length(),adjusted=equations.filter(eq=>Math.abs(eq.maxForce-nominalForce)>1e-10).length;
    const impulseX=equations.reduce((sum,eq)=>sum+Math.abs(eq.maxForce*eq.t.x),0);
    contactCount+=contacts.length;frictionCount+=equations.length;adjustedCount+=adjusted;if(adjusted)adjustedBodies++;
    records.push({ids:Array.from(g.parts,p=>p.id),role:g.parts[0].mood.production.role,mass:b.mass,position:vec(b.position),velocity:vec(b.velocity),appliedForce:vec(b.force),tableContacts:contacts.length,tableFrictionEquations:equations.length,adjustedFrictionEquations:adjusted,wholeBodyFrictionForceN:nominalForce,wholeBodyFrictionImpulse:nominalForce*dt,solverMaxImpulseX:impulseX,solverEquivalentForceLimitXN:impulseX/dt,solverLimits:equations.map(eq=>({minImpulse:eq.minForce,maxImpulse:eq.maxForce,tangent:vec(eq.t)}))});
   }
   solveStats.calls++;if(contactCount)solveStats.callsWithTableContact++;solveStats.adjustedEquationVisits+=adjustedCount;
   for(const [key,value]of Object.entries({peakMaterialBodies:bodies.length,peakTableContactPoints:contactCount,peakTableFrictionEquations:frictionCount,peakAdjustedFrictionEquations:adjustedCount,peakAdjustedBodies:adjustedBodies}))solveStats[key]=Math.max(solveStats[key],value);
   latestSolve={stationSecondsBeforeSolve:s.time,dt,configuredRpm:s.rotor.rpm,actualRpm:s.rotor.actualRpm,maxTorque:s.rotor.maxTorque,material:records};
  };
 }
 if(mode==='trace')sandbox.__productionFrequencyStep=()=>{
  traceSteps++;
  const inventory=f.inventory();for(const [key,value]of Object.entries(inventory))if(typeof value==='number')peak[key]=Math.max(peak[key]??0,value);
  if(!terminalStep&&(s.complete||s.failed)){
   const current=batteries(t,s);terminalStep={simulatedSeconds:t.getSimTime()-initialClock.simTime,stationSeconds:s.time,observedPhysicsSteps:traceSteps,batteries:current,batteryDebitJoules:debit(initialBatteries,current),stationJoules:s.joules};
   assert(Math.abs(terminalStep.batteryDebitJoules-s.joules)<1e-7,'actual battery debit equals the station meter at its terminal step');
  }
  const key=[s.ledger.stock.length,s.ledger.packed.length,s.ledger.accepted.length,s.buffer.length,!!s.packJob,s.complete,s.failed].join(',');
  if(key!==previousKey||s.time+1e-9>=nextSample){
   if(trace.length<TRACE_LIMIT)trace.push({...detail(t,s,f,frame),nativeSolve:latestSolve});else traceOverflow=true;
   previousKey=key;nextSample=Math.floor(s.time+1e-9)+1;
  }
 };
 const operation=()=>{t.advanceSimulation(FRAME_DT);if(frame%6===0){t.updateTarget();t.drawQubits();}};
 const begun=performance.now();
 for(;frame<MAX_FRAMES;frame++){
  if(performance.now()-begun>budgetMs){stopped={reason:'wall-time budget',budgetMs,lastCompletedFrame};break;}
  if(frame%60===0)t.setLook({camera:frame%120?[0,1.7,-6]:[0,1.7,6],yaw:frame%120?Math.PI:0,pitch:-.2});
  if(mode==='timing'){
   const beforeCpu=process.cpuUsage(),beforeWall=performance.now();operation();
   const elapsed=performance.now()-beforeWall,used=process.cpuUsage(beforeCpu),cpuMs=(used.user+used.system)/1000;
   if(frame>=WARMUP_FRAMES){wallSamples.push(elapsed);cpuSamples.push(cpuMs);if(frame<SHARED_END_FRAME){sharedWall.push(elapsed);sharedCpu.push(cpuMs);}}
  }else operation();
  lastCompletedFrame=frame+1;
  if(s.complete||s.failed)break;
 }
 const elapsedRunWallMs=performance.now()-begun,after=t.getTickState(),finalBatteries=batteries(t,s),finalMatter=auditMatter(t,s);
 const physicsSteps=after.physics-initialClock.physics,simulatedSeconds=after.simTime-initialClock.simTime,requestedSeconds=lastCompletedFrame*FRAME_DT;
 assert.equal(physicsSteps,lastCompletedFrame*hz/60,'no physics steps are skipped');
 assert.equal(t.world.stepnumber-initialWorldStepNumber,physicsSteps,'Cannon executes every reported physics step');
 assert(Math.abs(simulatedSeconds-requestedSeconds)<1e-8,'all requested regular-frame time is simulated');assert.equal(after.droppedSeconds,initialClock.droppedSeconds,'no regular-frame time is discarded');
 assert.equal(after.physicsDt,1/hz);assert(after.physicsAccumulator<1/hz);
 if(s.complete){assert.equal(s.ledger.accepted.length,s.goal.target);assert.equal(s.ledger.stock.length,0);assert.equal(finalMatter.deliveredIds.length,s.goal.units);assert(s.autonomy>=s.goal.minAutonomy);assert(s.joules<=s.goal.budget);}
 const validationError=stopped?`${version} level ${level} at ${hz} Hz stopped at frame ${lastCompletedFrame}`:((version==='optimized'||level===19)&&!s.complete?`${version} level ${level} at ${hz} Hz did not complete: ${s.reason}`:null);
 return {version,repetition,level,hz,frames:lastCompletedFrame,complete:s.complete,failed:s.failed,reason:s.reason,validationError,stopped,
  stationSeconds:s.time,autonomySeconds:s.autonomy,joules:s.joules,delivered:s.ledger.accepted.length,rpm:s.rotor.rpm,maxTorque:s.rotor.maxTorque,budgetJoules:s.goal.budget,
  clock:{requestedSeconds,simulatedSeconds,physicsSteps,cannonSteps:t.world.stepnumber-initialWorldStepNumber,physicsDt:after.physicsDt,logicSteps:after.logic-initialClock.logic,droppedSeconds:after.droppedSeconds-initialClock.droppedSeconds,physicsAccumulator:after.physicsAccumulator,logicAccumulator:after.logicAccumulator,afterTerminalSeconds:Math.max(0,simulatedSeconds-s.time)},
  initialInventory,finalInventory:f.inventory(),initialMatter,finalMatter,initialBatteries,finalBatteries,batteryDebitAtFrameEndJoules:debit(initialBatteries,finalBatteries),terminalStep,
  elapsedRunWallMs,finalFullStateSha256:sha(f.state()),
  ...(mode==='timing'?{timing:{warmupFrames:Math.min(lastCompletedFrame,WARMUP_FRAMES),measuredFrames:wallSamples.length,wallMsPerSimulatedFrame:stats(wallSamples),processCpuMsPerSimulatedFrame:stats(cpuSamples),summedMeasuredWallMs:wallSamples.reduce((sum,n)=>sum+n,0),summedMeasuredProcessCpuMs:cpuSamples.reduce((sum,n)=>sum+n,0),commonWindow:{fromSimulatedSecond:5,toSimulatedSecond:15,wallMsPerSimulatedFrame:stats(sharedWall),processCpuMsPerSimulatedFrame:stats(sharedCpu)},wallSamples,cpuSamples}}:{traceSteps,peakInventoryByPhysicalStep:peak,nativeSolveCounters:solveStats,traceLimit:TRACE_LIMIT,traceOverflow,trace})};
}
function repeatVariation(runs){
 const metrics=['stationSeconds','autonomySeconds','joules','delivered','elapsedRunWallMs'];
 const result=Object.fromEntries(metrics.map(key=>[key,stats(runs.map(run=>run[key]))]));
 if(mode==='timing'){
  result.processCpuMeanMs=stats(runs.map(run=>run.timing.processCpuMsPerSimulatedFrame.mean).filter(Number.isFinite));
  result.wallMeanMs=stats(runs.map(run=>run.timing.wallMsPerSimulatedFrame.mean).filter(Number.isFinite));
  result.commonWindowCpuMeanMs=stats(runs.map(run=>run.timing.commonWindow.processCpuMsPerSimulatedFrame.mean).filter(Number.isFinite));
 }
 return result;
}
const reports=[];
for(const level of levels)for(const hz of rates){
 const runs={baseline:[],optimized:[]},order=[];
 for(let repetition=1;repetition<=repetitions;repetition++){
  const pair=repetition%2?['baseline','optimized']:['optimized','baseline'];order.push(pair);
  for(const version of pair){runs[version].push(run(version,hz,level,repetition));process.stderr.write(`production ${level}, ${hz} Hz, ${version}, repetition ${repetition} completed\n`);}
 }
 const identicalFinalState=runs.baseline.every((run,i)=>run.finalFullStateSha256===runs.optimized[i].finalFullStateSha256);
 if(level===19&&!Object.values(runs).flat().some(run=>run.stopped))assert(identicalFinalState,'level 19 retains the complete physical, energy, save and clock state');
 reports.push({level,hz,order,identicalFinalState,runs,variation:{baseline:repeatVariation(runs.baseline),optimized:repeatVariation(runs.optimized)}});
}
const output={schema:1,mode,generatedAt:new Date().toISOString(),sources:identities,runtime:{node:process.version,platform:process.platform,arch:process.arch,cpuModel:os.cpus()[0]?.model,availableParallelism:os.availableParallelism()},
 configuration:{levels,rates,repetitions,frameDt:FRAME_DT,maxSimulatedSeconds:MAX_FRAMES*FRAME_DT,caseBudgetMs:budgetMs,warmupFrames:WARMUP_FRAMES,warmupSimulatedSeconds:WARMUP_FRAMES*FRAME_DT,commonTimingWindowSeconds:[5,15],traceLimit:TRACE_LIMIT,camera:'alternate every 60 simulated frames between [0,1.7,6] and [0,1.7,-6]',viewport:'1280x720 DOM/GPU stubs',graphics:'drawQubits and updateTarget every sixth frame; shadows off',preferencesBeforeJoints:true},
 method:{timing:'Wall elapsed time and whole Node-process CPU are separate. First 300 simulated frames are warmup and excluded from timing samples without resetting the production state. AB/BA/AB by default. No per-step observer or detailed counters in timing mode. Samples include advanceSimulation and every sixth frame updateTarget/drawQubits, not the browser main-thread frame or GPU. No FPS is measured.',trace:'A separate instrumented run observes every physical step, records inventory peaks and the exact terminal battery debit, and stores at most 256 state/event snapshots per case. nativeSolve observes the native solver boundary AFTER the game wrapper changes friction bounds and BEFORE Cannon solves. solverMaxImpulseX sums maxForce*abs(tangent.x); despite the field name, this Cannon solver clamps impulse. Top-level material.friction is observed after bounds are restored. Adjusted equation counters compare live solver bounds with the default mu*m*g for the table/material pair.',comparison:'Batch durations and workloads can differ after the physical correction. The shared 5–15 simulated-second window is also reported. No sum of subsystem percentages or claim of global FPS improvement.',energy:'Timing reports battery debit at the end of its 60 Hz frame. Any physical steps after completion may recharge the disabled rotor, so that endpoint is not an exact terminal-energy invariant. Trace mode and production-frequency.test.cjs verify debit at the terminal physical step.',memory:'Trace/sample arrays are tool-only and bounded by 256 snapshots / 3600 simulated frames per run. nativeSolveCounters reports material-body and adjusted-equation peaks for estimating transient count/limit Map entries and restore tuples; these are entry counts, not allocated bytes or retained-heap measurements.'},reports};
if(args.output)fs.writeFileSync(args.output,JSON.stringify(output,null,2)+'\n');else process.stdout.write(JSON.stringify(output,null,2)+'\n');
if(reports.some(report=>Object.values(report.runs).flat().some(run=>run.validationError)))process.exitCode=1;
