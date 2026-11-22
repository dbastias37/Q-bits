// Isolated mood/query work with real game geometry, zero physics, DOM/GPU stubs.
// Run serially. Every arm uses a fresh Node process; no cache is cleared by hand.
// --baseline-root=../qbits-pressure-baseline --baseline-commit=274a389b77d0f57c9f4c13d56c5caf86070b1b0d
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync,execFileSync}=require('node:child_process');
const args=Object.fromEntries(process.argv.slice(2).map(x=>x.replace(/^--/,'').split('=')));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),plain=x=>JSON.parse(JSON.stringify(x));
const reference='274a389b77d0f57c9f4c13d56c5caf86070b1b0d',root=path.resolve(__dirname,'..');
const mode=args.mode||'timing',hz=Number(args.hz||120),batch=Number(args['mood-iterations']||8),warm=Number(args['warm-queries']||8),budget=Number(args['case-budget-ms']||20000);
assert(['timing','counts'].includes(mode));assert([60,120,240].includes(hz));
assert(Number.isInteger(batch)&&batch>0&&batch<=120&&Number.isInteger(warm)&&warm>0&&warm<=120);
assert(Number.isFinite(budget)&&budget>=100&&budget<=120000);
function measure(fn){
 if(mode==='counts')return {value:fn(),wallMs:null,processCpuMs:null};
 const cpu=process.cpuUsage(),start=performance.now(),value=fn(),wallMs=performance.now()-start,used=process.cpuUsage(cpu);
 return {value,wallMs,processCpuMs:(used.user+used.system)/1000};
}
function worker(){
 const sourceRoot=path.resolve(args['source-root']),pieces=Number(args.pieces),family=args.family,buttons=args.buttons==='true';
 assert(Number.isInteger(pieces)&&pieces>0&&pieces<=2000);assert(['cubes','mixed'].includes(family));
 const source=fs.readFileSync(path.join(sourceRoot,'assets/js/game.js'),'utf8'),at=source.lastIndexOf('})();');assert(at>=0);
 const names=['bounds','rotatedGroupBounds','rigidQueryPoses','collisionIndex','localBoundsSupport'];
 const hook='window.__padQueryBench={query:onCampaignPad,counts:{}};'+(mode==='counts'?names.map(name=>`{const original=${name};${name}=function(...a){const c=window.__padQueryBench.counts;c['${name}']=(c['${name}']||0)+1;return original.apply(this,a);};}`).join('\n'):'');
 const start=performance.now(),createGame=require(path.join(sourceRoot,'tests/game-harness.cjs'));
 const game=createGame({graphics:false,gameSource:source.slice(0,at)+hook+source.slice(at)}),{t,sandbox}=game;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 t.applyPreferences({physicsHz:hz,shadows:'off',music:false,guideVoice:false,footsteps:false,joinSounds:false});
 assert.equal(t.getPhysicsStep(),1/hz);assert.equal(t.puzzle.active,false);t.storyWorld.buttons=[];
 const api=sandbox.__padQueryBench,clockBefore=plain(t.getTickState()),stages={},outputs={},cacheSnapshots={},counts={};let group;
 const record={family,pieces,buttons,sourceSha256:sha(source),setupWallMs:performance.now()-start,clockBefore,stages,outputs,cacheSnapshots,counts,complete:false};
 if(record.setupWallMs>budget){record.stopped={phase:'setup',elapsedMs:record.setupWallMs,budgetMs:budget};return record;}
 function cache(){return {rotatedEntries:group?.rotatedBoundsCache?.entries.length||0,localBoundsTree:!!group?.localBoundsTree,rigidQueryLayout:!!group?.rigidQueryLayout};}
 function stage(name,fn,output=x=>x){
  const sample=measure(fn);stages[name]={wallMs:sample.wallMs,processCpuMs:sample.processCpuMs};
  outputs[name]=output(sample.value);cacheSnapshots[name]=cache();if(mode==='counts')counts[name]=plain(api.counts);
  if(performance.now()-start>budget){record.stopped={phase:name,elapsedMs:performance.now()-start,budgetMs:budget};return false;}return true;
 }
 const vector=v=>[v.x,v.y,v.z],box=b=>({min:vector(b.min),max:vector(b.max),center:vector(b.center),size:vector(b.size)});
 const columns=Math.ceil(Math.sqrt(pieces)),memoryBefore=process.memoryUsage(),windowStart=performance.now(),cpuBefore=process.cpuUsage();
 // A square grid forms one rigid group. Mixed members preserve their own
 // convex colliders; analyzeBlock returns before warming their material bounds.
 if(!stage('creation',()=>{
  const parts=Array.from({length:pieces},(_,i)=>({id:t.allocateUnitId(),weight:1,shape:family==='mixed'?['cube','pyramid','coupler'][i%3]:'cube',p:t.V((i%columns)*.09,.3,Math.floor(i/columns)*.09),q:t.Q()}));
  group=t.makeGroup(parts);return {pieces:group.parts.length,bodies:t.world.bodies.length,shapes:group.body.shapes.length,mass:group.body.mass};
 }))return record;
 const pad=()=>({kind:'campaign',p:t.V(group.body.position.x,0,group.body.position.z),half:10,surface:1,required:1,load:0,pressed:0});
 if(buttons)t.storyWorld.buttons=[pad()];
 if(!stage('moodBatch',()=>{for(let i=0;i<batch;i++)t.updateMoods(1/hz);return {calls:batch,duty:group.moodDuty};}))return record;
 if(!stage('firstBounds',()=>t.bounds(group),box))return record;
 const coldCpu=process.cpuUsage(cpuBefore);record.coldTotalWallMs=mode==='timing'?performance.now()-windowStart:null;
 record.coldTotalCpuMs=mode==='timing'?(coldCpu.user+coldCpu.system)/1000:null;
 if(!stage('warmBounds',()=>{let last;for(let i=0;i<warm;i++)last=t.bounds(group);return last;},box))return record;
 assert.deepEqual(outputs.firstBounds,outputs.warmBounds,'unchanged warm geometry');
 // Adding/replacing a button and rotating the body must be visible immediately.
 // The preceding bounds query has already paid any deferred cold construction.
 t.storyWorld.buttons=[pad()];group.body.quaternion.setFromEuler(.21,.13,-.09);group.body.aabbNeedsUpdate=true;
 if(!stage('addedPadQuery',()=>api.query(group)))return record;
 const cpu=process.cpuUsage(cpuBefore);record.totalWallMs=mode==='timing'?performance.now()-windowStart:null;
 record.totalCpuMs=mode==='timing'?(cpu.user+cpu.system)/1000:null;record.memoryBefore=memoryBefore;record.memoryAfter=process.memoryUsage();
 record.clockAfter=plain(t.getTickState());assert.deepEqual(record.clockAfter,clockBefore,'query experiment executes no physics or logic ticks');
 record.inventory={pieces:group.parts.length,groups:t.groups.length,bodies:t.world.bodies.length,shapes:t.world.bodies.reduce((n,b)=>n+b.shapes.length,0),constraints:t.world.constraints.length,awakeBodies:t.world.bodies.filter(b=>b.mass>0&&b.sleepState!==2).length,contacts:t.world.contacts.length,frictionEquations:t.world.frictionEquations.length,constraintEquations:t.world.constraints.reduce((n,c)=>n+c.equations.filter(e=>e.enabled).length,0),sensors:group.parts.filter(p=>p.mood.workshop?.sensor===true).length,motors:t.rotors.length,activeMotors:t.rotors.filter(r=>r.enabled).length,physicsDt:t.getPhysicsStep(),physicsSteps:0};
 record.rawState=JSON.stringify({save:t.saveLab({passive:true}),bodies:t.world.bodies.map(b=>({mass:b.mass,type:b.type,p:vector(b.position),q:[b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w],v:vector(b.velocity),w:vector(b.angularVelocity),sleep:b.sleepState,force:vector(b.force),torque:vector(b.torque)})),clock:record.clockAfter,worldTime:t.world.time});
 record.stateSha256=sha(record.rawState);record.complete=true;return record;
}
if(args.worker){process.stdout.write(JSON.stringify(worker())+'\n');}
else{
 assert(args['baseline-root'],'Pass --baseline-root explicitly');assert.equal(args['baseline-commit'],reference,'Pass the integrated PR32 reference explicitly');
 const roots={baseline:path.resolve(root,args['baseline-root']),optimized:path.resolve(root,args['optimized-root']||'.')};
 const git=(where,...argv)=>execFileSync('git',['-C',where,...argv],{encoding:'utf8'}).trim();
 assert.equal(git(roots.baseline,'rev-parse','HEAD'),reference);assert.equal(git(roots.baseline,'status','--porcelain'),'','reference must be clean');
 const files=['assets/js/game.js','assets/js/cannon.min.js','assets/js/workshop.js','tests/game-harness.cjs'];
 const sources=Object.fromEntries(Object.entries(roots).map(([variant,where])=>[variant,{root:where,headCommit:git(where,'rev-parse','HEAD'),headTree:git(where,'rev-parse','HEAD^{tree}'),worktreeStatus:git(where,'status','--porcelain'),files:Object.fromEntries(files.map(file=>[file,sha(fs.readFileSync(path.join(where,file)))]))}]));
 for(const file of files){assert.equal(sources.baseline.files[file],sha(execFileSync('git',['-C',roots.baseline,'show',reference+':'+file])));if(file!=='assets/js/game.js')assert.equal(sources.baseline.files[file],sources.optimized.files[file],file+' must match');}
 const scales=(args.scales||'16,100,500,1000,1500,2000').split(',').map(Number),families=(args.families||'cubes,mixed').split(','),buttonModes=(args.buttons||'false,true').split(','),repetitions=Number(args.repetitions||3);
 assert(scales.every(n=>Number.isInteger(n)&&n>0&&n<=2000));assert(families.every(f=>['cubes','mixed'].includes(f)));assert(buttonModes.every(b=>['false','true'].includes(b)));assert(Number.isInteger(repetitions)&&repetitions>0&&repetitions<=6);
 const reports=[],result={schema:1,mode:'pressure-pad-query',referenceCommit:reference,sources,runtime:{node:process.version,platform:process.platform,arch:process.arch,cpuModel:os.cpus()[0]?.model,availableParallelism:os.availableParallelism()},configuration:{mode,scales,families,buttonModes,repetitions,hz,moodIterations:batch,warmQueries:warm,caseBudgetMs:budget,order:Array.from({length:repetitions},(_,i)=>i%2?'BA':'AB').join('/'),freshProcessPerArm:true,physicsSteps:0,forcedGc:false,benchmarkSha256:sha(fs.readFileSync(__filename))},method:'Fresh Node process and game/group for every arm. Creation, isolated updateMoods batch, first subsequent bounds query, warm bounds batch, and added/replaced-pad query are separate. No physics or logic ticks; mood work uses the real selected dt but is not elapsed simulation. No cache deletion or preparatory bounds query. Cubes may warm bounds during normal analyzeBlock; mixed convex groups do not. coldTotal ends after firstBounds; total additionally includes warm queries and added/replaced-pad query with a new body rotation. Both totals include creation and bookkeeping; setup and final state capture are separate. Counts mode wraps functions and reports no primary timings; cache snapshots only inspect presence and entry counts. Counts are cumulative; localBoundsSupport/collisionIndex can include recursive calls. process.cpuUsage is process CPU, performance.now is wall time, neither is FPS or CPU utilization. OS caches are not reset. Budgets are checked between complete stages; unfinished cases and last completed scale are preserved.',complete:true,reports};
 for(const family of families)for(const buttons of buttonModes){
  let lastCompleted=null;
  for(const pieces of scales){
   const report={family,pieces,buttons:buttons==='true',lastCompleted,runs:{baseline:[],optimized:[]},comparisons:[],complete:true};reports.push(report);const states={baseline:[],optimized:[]};
   for(let repetition=1;repetition<=repetitions&&report.complete;repetition++){
    for(const variant of repetition%2?['baseline','optimized']:['optimized','baseline']){
     const child=spawnSync(process.execPath,[__filename,'--worker=true','--source-root='+roots[variant],'--family='+family,'--pieces='+pieces,'--buttons='+buttons,'--mode='+mode,'--hz='+hz,'--mood-iterations='+batch,'--warm-queries='+warm,'--case-budget-ms='+budget],{encoding:'utf8',maxBuffer:32*1024*1024});
     if(child.status!==0){report.complete=false;report.stopped={variant,repetition,error:child.error?.message||child.stderr.slice(0,4000),exitStatus:child.status};break;}
     const run=JSON.parse(child.stdout);assert.equal(run.sourceSha256,sources[variant].files['assets/js/game.js'],'source changed while measuring');
     run.variant=variant;run.repetition=repetition;states[variant].push(run.rawState);delete run.rawState;report.runs[variant].push(run);
     if(!run.complete){report.complete=false;report.stopped={variant,repetition,...run.stopped};break;}
    }
    if(report.complete){
     const a=report.runs.baseline.at(-1),b=report.runs.optimized.at(-1),same=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
     const comparison={repetition,identicalState:states.baseline.at(-1)===states.optimized.at(-1),identicalOutputs:same(a.outputs,b.outputs),identicalInventory:same(a.inventory,b.inventory),identicalClocks:same(a.clockAfter,b.clockAfter),stateSha256:{baseline:a.stateSha256,optimized:b.stateSha256}};report.comparisons.push(comparison);
     if(!comparison.identicalState||!comparison.identicalOutputs||!comparison.identicalInventory||!comparison.identicalClocks){report.complete=false;report.stopped={phase:'equivalence',repetition};process.exitCode=1;}
    }
   }
   if(!report.complete){result.complete=false;break;}lastCompleted=pieces;report.lastCompleted=pieces;
  }
 }
 const output=JSON.stringify(result,null,2)+'\n';if(args.output)fs.writeFileSync(args.output,output);else process.stdout.write(output);
}
