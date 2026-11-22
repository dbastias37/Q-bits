// Isolated production SAP queries using the existing game harness and fixtures.
// Run timings alone, separately from --mode=counts and other tests/profilers.
// node tests/benchmark-sap-broadphase.cjs --baseline-root=../qbits-sap-baseline --output=/tmp/sap.json
// No physical step is executed here: sleeping/active states are explicit query
// fixtures. benchmark-cpu-architecture.cjs validates actual simulation/production.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const fixtures=require('./cpu-audit-fixtures.cjs');
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const root=path.resolve(__dirname,'..'),roots={baseline:path.resolve(root,args['baseline-root']||'../qbits-sap-baseline'),optimized:path.resolve(root,args['optimized-root']||'.')};
const mode=args.mode||'timings',counted=mode==='counts',repetitions=Number(args.repetitions??(counted?1:3)),samples=Number(args.samples??(counted?1:30)),warmup=Number(args.warmup??(counted?0:20));
const scales=(args.scales||'16,100,500,1000,1500,2000').split(',').map(Number),families=(args.families||'independent').split(','),states=(args.states||'sleeping,few-active,all-active').split(','),phases=(args.phases||'clean,dirty').split(',');
const hz=Number(args.hz??120),budget=Number(args['case-budget-ms']??20000),activeCount=Number(args['active-count']??8),forceGc=args['force-gc']==='true';
assert(['timings','counts'].includes(mode),'mode must be timings or counts');
assert(scales.length&&scales.every(n=>Number.isInteger(n)&&n>0&&n<=2000),'respect the shipped 2000-piece limit');
assert(families.length&&families.every(s=>['independent','welded'].includes(s)),'unknown family');
assert(states.length&&states.every(s=>['sleeping','few-active','all-active'].includes(s)),'unknown state');
assert(phases.length&&phases.every(s=>['clean','dirty'].includes(s)),'unknown phase');
assert([60,120,240].includes(hz),'select an actual physics preference');
assert(Number.isInteger(repetitions)&&repetitions>0&&Number.isInteger(samples)&&samples>0&&Number.isInteger(warmup)&&warmup>=0&&Number.isInteger(activeCount)&&activeCount>0&&Number.isFinite(budget)&&budget>0,'invalid sampling or budget');
assert(!forceGc||typeof global.gc==='function','--force-gc=true requires node --expose-gc');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const sources=Object.fromEntries(Object.entries(roots).map(([name,p])=>[name,fs.readFileSync(path.join(p,'assets/js/game.js'),'utf8')]));
function git(p,...a){try{return execFileSync('git',['-C',p,...a],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{return null;}}
const identity=Object.fromEntries(Object.entries(roots).map(([name,p])=>[name,{headCommit:git(p,'rev-parse','HEAD'),headTree:git(p,'rev-parse','HEAD^{tree}'),worktreeStatus:git(p,'status','--porcelain'),gameSha256:sha(sources[name]),cannonSha256:sha(fs.readFileSync(path.join(p,'assets/js/cannon.min.js'))),harnessSha256:sha(fs.readFileSync(path.join(p,'tests/game-harness.cjs')))}]));
const quantile=(a,q)=>{const s=[...a].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.ceil(q*s.length)-1)]??null;};
const stats=a=>({count:a.length,mean:a.reduce((s,n)=>s+n,0)/Math.max(1,a.length),p50:quantile(a,.5),p95:quantile(a,.95),p99:quantile(a,.99),min:Math.min(...a),max:Math.max(...a)});
const reports=[];
function sameText(a,b,label){
 if(a===b)return;
 let at=0;while(at<Math.min(a.length,b.length)&&a[at]===b[at])at++;
 throw new Error(label+': '+JSON.stringify({firstDifference:at,baselineHash:sha(a),optimizedHash:sha(b),baselineExcerpt:a.slice(Math.max(0,at-60),at+120),optimizedExcerpt:b.slice(Math.max(0,at-60),at+120)}));
}
function setup(version,family,pieces,state){
 const createGame=require(path.join(roots[version],'tests/game-harness.cjs'));
 const saved=new Map(),storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,String(v)),removeItem:k=>saved.delete(k)};
 const game=createGame({graphics:false,storage,gameSource:sources[version]}),{t,sandbox}=game,C=sandbox.CANNON;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 t.applyPreferences({physicsHz:hz,shadows:'off',music:false,guideVoice:false,footsteps:false,joinSounds:false});
 assert.equal(t.getPhysicsStep(),1/hz,'select real preferences before scene construction');
 t.setLook({camera:[0,1.7,0],yaw:0,pitch:0});
 const f=fixtures(t);f.scene(family,pieces);
 const moving=t.world.bodies.filter(b=>(b.type&(C.Body.STATIC|C.Body.KINEMATIC))===0);
 for(const b of moving)b.sleep();
 const awake=state==='sleeping'?0:state==='all-active'?moving.length:Math.min(activeCount,moving.length);
 for(let i=0;i<awake;i++)moving[Math.floor(i*moving.length/awake)].wakeUp();
 // Keep one genuinely SLEEPY dynamic body in the mixed fixture. It must be
 // eligible for collisions, unlike a sleeping, static or kinematic body.
 if(state==='few-active'&&awake)moving[0].sleepState=C.Body.SLEEPY;
 const origins=moving.map(b=>({body:b,p:b.position.clone(),q:b.quaternion.clone()}));
 let counts;
 if(counted){
  counts={enabled:false,needBroadphaseCollision:0,checkBounds:0,intersectionTest:0,sortList:0,computeAABB:0};
  for(const [object,key] of [[t.world.broadphase,'needBroadphaseCollision'],[C.SAPBroadphase,'checkBounds'],[t.world.broadphase,'intersectionTest'],[t.world.broadphase,'sortList'],[C.Body.prototype,'computeAABB']]){
   const original=object[key];object[key]=function(...a){if(counts.enabled)counts[key]++;return original.apply(this,a);};
  }
 }
 function prepare(phase,step){
  if(phase==='dirty'){
   // Controlled pose changes outside the timer. The resulting AABB updates,
   // sorting and active-index maintenance stay INSIDE collisionPairs.
   for(let i=0;i<origins.length;i++){
    const {body,p}=origins[i],angle=step*.17+i*.31;
    body.position.set(p.x+.015*Math.sin(angle),p.y+.002*Math.sin(angle*.7),p.z+.015*Math.cos(angle));
    body.quaternion.setFromEuler(.13*Math.sin(angle),.09*Math.cos(angle*.9),.05*Math.sin(angle*.6));body.aabbNeedsUpdate=true;
   }
   t.world.broadphase.dirty=true;
  }
 }
 const pairA=[],pairB=[];
 const query=()=>t.world.broadphase.collisionPairs(t.world,pairA,pairB);
 const clear=()=>{pairA.length=0;pairB.length=0;};
 const pairState=()=>JSON.stringify(pairA.map((b,i)=>[b.index,pairB[i].index]));
 function checkNative(){
  const a=[],b=[];C.SAPBroadphase.prototype.collisionPairs.call(t.world.broadphase,t.world,a,b);
  sameText(pairState(),JSON.stringify(a.map((body,i)=>[body.index,b[i].index])),'ordered pairs must match native SAP exactly');
 }
 function inventory(){
  const bodies=t.world.bodies,passiveMask=C.Body.STATIC|C.Body.KINEMATIC;
  return {...f.inventory(),staticBodies:bodies.filter(b=>(b.type&C.Body.STATIC)!==0).length,kinematicBodies:bodies.filter(b=>(b.type&C.Body.KINEMATIC)!==0).length,sleepingBodies:bodies.filter(b=>b.sleepState===C.Body.SLEEPING).length,sleepyBodies:bodies.filter(b=>b.sleepState===C.Body.SLEEPY).length,sapEligibleBodies:bodies.filter(b=>(b.type&passiveMask)===0&&b.sleepState!==C.Body.SLEEPING).length,axisIndex:t.world.broadphase.axisIndex,useBoundingBoxes:t.world.broadphase.useBoundingBoxes};
 }
 function beginCounts(){for(const key of Object.keys(counts))counts[key]=key==='enabled'?false:0;}
 function countQuery(){counts.enabled=true;try{return query();}finally{counts.enabled=false;}}
 function endCounts(){counts.enabled=false;const {enabled,...value}=counts;return value;}
 return {t,f,prepare,query,countQuery,clear,pairState,checkNative,inventory,beginCounts,endCounts,pairCount:()=>pairA.length};
}
function measured(fn){const cpu=process.cpuUsage(),start=performance.now();fn();const wallMs=performance.now()-start,used=process.cpuUsage(cpu);return {wallMs,cpuUserMs:used.user/1000,cpuSystemMs:used.system/1000,cpuMs:(used.user+used.system)/1000};}
function oneRun(version,family,pieces,state,phase,repetition){
 const begun=performance.now(),game=setup(version,family,pieces,state),{t,f}=game,setupMs=performance.now()-begun;
 // Copy cross-realm clocks into host objects so report history cannot retain
 // entire VM globals through their object prototypes.
 const initial=game.inventory(),clockBefore={...t.getTickState()};
 const stop=(stage,completed)=>({stopped:{version,repetition,stage,completed,budgetMs:budget,elapsedMs:performance.now()-begun,setupMs,inventory:game.inventory(),clock:{...t.getTickState()}}});
 if(performance.now()-begun>=budget)return stop('setup',0);
 game.prepare(phase,0);game.clear();const beforeCold=f.state();
 let cold,coldCounts;
 if(counted){game.beginCounts();game.countQuery();coldCounts=game.endCounts();}else cold=measured(game.query);
 sameText(f.state(),beforeCold,'cold query must not mutate physical/game state or wake a body');
 const coldPairs=game.pairState();game.checkNative();
 let i=0;const warmupStart=performance.now();
 for(;i<warmup&&performance.now()-begun<budget;i++){game.prepare(phase,i+1);game.clear();game.query();}
 const warmupMs=performance.now()-warmupStart;
 if(i<warmup||performance.now()-begun>=budget)return stop('warmup',i);
 if(forceGc)global.gc();
 const wall=[],cpu=[],user=[],system=[];let lastBefore;
 if(counted)game.beginCounts();
 for(i=0;i<samples&&performance.now()-begun<budget;i++){
  game.prepare(phase,warmup+i+1);game.clear();
  if(i===samples-1)lastBefore=f.state();
  if(counted)game.countQuery();else{const m=measured(game.query);wall.push(m.wallMs);cpu.push(m.cpuMs);user.push(m.cpuUserMs);system.push(m.cpuSystemMs);}
 }
 const counts=counted?game.endCounts():undefined;
 if(i<samples||performance.now()-begun>=budget)return {...stop('measurement',i),wallSamples:counted?undefined:wall,processCpuSamples:counted?undefined:cpu};
 const after=f.state();sameText(after,lastBefore,'hot query must not mutate physical/game state or wake a body');
 const finalPairs=game.pairState();game.checkNative();
 assert.deepEqual({...t.getTickState()},clockBefore,'queries must not advance clocks');
 return {state:after,pairs:finalPairs,coldPairs,run:{repetition,setupMs,warmupMs,totalCaseMs:performance.now()-begun,initial,final:game.inventory(),clockBefore,clockAfter:{...t.getTickState()},coldPairs:JSON.parse(coldPairs).length,finalPairs:game.pairCount(),coldPairsSha256:sha(coldPairs),finalPairsSha256:sha(finalPairs),measuredQueries:samples,...(counted?{coldCounts,counts}:{cold,wallMsPerQuery:stats(wall),processCpuMsPerQuery:stats(cpu),processUserMsPerQuery:stats(user),processSystemMsPerQuery:stats(system),wallSamples:wall,processCpuSamples:cpu,userSamples:user,systemSamples:system})}};
}
function run(){
 for(const family of families)for(const state of states)for(const phase of phases){
  let lastCompleted=null;
  for(const pieces of scales){
   const runs={baseline:[],optimized:[]},values={baseline:[],optimized:[]};let stopped=null;
   for(let r=0;r<repetitions&&!stopped;r++)for(const version of r%2?['optimized','baseline']:['baseline','optimized']){
    const value=oneRun(version,family,pieces,state,phase,r+1);
    if(value.stopped){stopped=value;break;}
    runs[version].push(value.run);values[version].push(value);
   }
   if(stopped){reports.push({family,state,phase,pieces,hz,stopped,lastCompleted,runs});process.stderr.write(`${family} ${state} ${phase} ${pieces} stopped (${stopped.stopped.stage})\n`);break;}
   for(let i=0;i<repetitions;i++){
    sameText(values.baseline[i].state,values.optimized[i].state,`${family} ${state} ${phase} ${pieces} full state differs`);
    sameText(values.baseline[i].coldPairs,values.optimized[i].coldPairs,'cold pair order differs');
    sameText(values.baseline[i].pairs,values.optimized[i].pairs,'final pair order differs');
   }
   lastCompleted=pieces;reports.push({family,state,phase,pieces,hz,identicalFinalState:true,queriesPreservePhysicalState:true,identicalOrderedPairs:true,nativePairOracle:true,stateSha256:values.optimized.map(v=>sha(v.state)),runs});
   process.stderr.write(`${family} ${state} ${phase} ${pieces} completed\n`);
  }
 }
}
let failure;
try{run();}catch(error){failure={message:error.message,stack:error.stack};process.exitCode=1;}
const output={schema:1,mode,referenceCommit:identity.baseline.headCommit,sources:identity,runtime:{node:process.version,platform:process.platform,arch:process.arch,cpuModel:os.cpus()[0]?.model,availableParallelism:os.availableParallelism()},configuration:{repetitions,samples,warmup,scales,families,states,phases,hz,activeCount,caseBudgetMs:budget,forcedGc:forceGc,fixtureSha256:sha(fs.readFileSync(path.join(__dirname,'cpu-audit-fixtures.cjs'))),benchmarkSha256:sha(fs.readFileSync(__filename)),order:Array.from({length:repetitions},(_,r)=>r%2?'BA':'AB').join(' / '),viewport:'1280x720 DOM/GPU stubs'},method:'Real game-created bodies and shipped Cannon SAP. No physics step or rendering. Sleep/active states are explicitly prepared query fixtures. Clean queries retain poses; dirty query poses are prepared outside timing, while AABB recomputation, sorting, active-index maintenance and pair output remain inside collisionPairs. Cold allocation/sort is separate. Timings contain no detailed counters. Counts are a separate run and include cold/hot native method calls. Wall elapsed, process user and system CPU are distinct; none is CPU utilization or browser FPS. Complete physical/save/clock states must be preserved by first and final queries and equal between variants; cold and final ordered pair arrays must be exactly equal and match the native SAP oracle. Case budgets cover setup, warm-up, validation and measurement, checked between synchronous operations. Buffers hold at most the configured samples and one scenario at a time.',failure,reports};
if(args.output)fs.writeFileSync(args.output,JSON.stringify(output,null,2)+'\n');else console.log(JSON.stringify(output,null,2));
