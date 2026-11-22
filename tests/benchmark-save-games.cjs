// Reproducible save-path benchmark: production game/Cannon, DOM/GPU stubs.
// Run timing cases alone, without tests, counters or profilers in parallel.
// CPU is process user+system time; wall time is elapsed synchronous work.
// Neither is browser FPS, main-thread-only CPU, GPU time, or Web Storage I/O.
// node --expose-gc tests/benchmark-save-games.cjs --output=/tmp/qbits-saves.json
// --mode=counters and --mode=profile are separate diagnostic executions.
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const crypto=require('node:crypto'),assert=require('node:assert/strict');
const vm=require('node:vm'),Module=require('node:module'),cp=require('node:child_process');
const fixtures=require('./cpu-audit-fixtures.cjs');
const args=Object.fromEntries(process.argv.slice(2).map(value=>{
 const at=value.indexOf('=');return at<0?[value.replace(/^--/,''),'true']:[value.slice(0,at).replace(/^--/,''),value.slice(at+1)];
}));
const root=path.resolve(__dirname,'..');
const roots={baseline:path.resolve(root,args['baseline-root']||'../qbits-save-baseline'),optimized:path.resolve(root,args['optimized-root']||'.')};
const mode=args.mode||'timings',diagnostic=mode!=='timings';
assert(['timings','counters','profile'].includes(mode),'Unknown --mode');
const integer=(key,fallback,min=0)=>{const value=Number(args[key]??fallback);assert(Number.isInteger(value)&&value>=min,`Invalid --${key}`);return value;};
const repetitions=integer('repetitions',3,1),warmup=integer('warmup',8),samples=integer('samples',24,1);
const budget=integer('case-budget-ms',8000,1);
const scales=(args.scales||'16,100,500,1000,1500,2000').split(',').map(Number);
assert(scales.every(n=>Number.isInteger(n)&&n>0&&n<=2000),'Scales must respect the shipped 2000-piece limit');
const scenarios=(args.scenarios||'repeated-save,mutated-save,repeated-read,store-prepopulated-first-write').split(',');
assert(scenarios.every(name=>['repeated-save','mutated-save','repeated-read','store-prepopulated-first-write'].includes(name)),'Unknown scenario');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const plain=value=>JSON.parse(JSON.stringify(value));
const quantile=(values,q)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*q)-1)]??null;};
const stats=values=>({count:values.length,mean:values.length?values.reduce((s,n)=>s+n,0)/values.length:null,p50:quantile(values,.5),p95:quantile(values,.95),p99:quantile(values,.99),min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null});
const timed=fn=>{const cpu=process.cpuUsage(),start=performance.now(),value=fn(),wallMs=performance.now()-start,used=process.cpuUsage(cpu);return {value,wallMs,processCpuMs:(used.user+used.system)/1000};};
const identity=directory=>{
 const files=[...fs.readdirSync(path.join(directory,'assets/js')).filter(name=>name.endsWith('.js')).sort().map(name=>'assets/js/'+name),'tests/game-harness.cjs','tests/cpu-audit-fixtures.cjs'];
 let commit=null;try{commit=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:directory,encoding:'utf8'}).trim();}catch{}
 return {commit,files:Object.fromEntries(files.map(file=>[file,sha(fs.readFileSync(path.join(directory,file)))]))};
};
const sourceIdentity=Object.fromEntries(Object.entries(roots).map(([version,directory])=>[version,identity(directory)]));

function meter(){
 const state={enabled:false,calls:Object.create(null),wall:Object.create(null),storage:{reads:0,writes:0,charactersWritten:0,utf8BytesWritten:0}};
 state.call=(name,fn,self,values)=>{
  if(!state.enabled)return Reflect.apply(fn,self,values);
  state.calls[name]=(state.calls[name]||0)+1;
  // Recursive JSON nodes count as work; only the outer traversal is timed.
  const recursive=(name==='checkJson'&&(values[2]||0)>0)||(name==='checkParsedJson'&&(values[1]||0)>0);
  const measure=mode==='profile'&&!recursive;
  const start=measure?performance.now():0;
  try{return Reflect.apply(fn,self,values);}finally{if(measure)state.wall[name]=(state.wall[name]||0)+performance.now()-start;}
 };
 state.reset=()=>{state.calls=Object.create(null);state.wall=Object.create(null);state.storage={reads:0,writes:0,charactersWritten:0,utf8BytesWritten:0};};
 state.snapshot=()=>plain({calls:state.calls,inclusiveWallMs:state.wall,storage:state.storage});
 return state;
}
function wrapFunctions(names){
 return names.map(name=>`if(typeof ${name}==='function'){const original=${name};${name}=function(...values){const meter=globalThis.__saveBenchmarkMeter;return meter?meter.call('${name}',original,this,values):Reflect.apply(original,this,values);};}`).join('\n');
}
function instrumentedHarness(directory){
 // Diagnostic only: compile a test-harness copy in memory, adding an optional
 // source override for the save module. No repository file is changed, and
 // all other modules still load from the same reference/optimized checkout.
 const filename=path.join(directory,'tests/game-harness.cjs');
 const text=fs.readFileSync(filename,'utf8');
 const needle="fs.readFileSync(path.join(root,'assets/js/save-games.js'),'utf8')";
 assert.equal(text.split(needle).length,2,'Diagnostic harness insertion must be unique');
 const compiled=new Module(filename,module);compiled.filename=filename;compiled.paths=Module._nodeModulePaths(path.dirname(filename));
 compiled._compile(text.replace(needle,`(options.saveGamesSource||${needle})`),filename);return compiled.exports;
}
function setup(version,pieces){
 const directory=roots[version],m=meter(),values=new Map(),clock={wall:1800000000000,monotonic:0};
 const storage={
  getItem(key){if(m.enabled)m.storage.reads++;return values.get(key)??null;},
  setItem(key,value){const raw=String(value);if(m.enabled){m.storage.writes++;if(diagnostic){m.storage.charactersWritten+=raw.length;m.storage.utf8BytesWritten+=Buffer.byteLength(raw);}}values.set(key,raw);},
  removeItem(){throw new Error('The benchmark must not delete any persisted slot');}
 };
 const options={graphics:false,storage};
 if(diagnostic){
  const gameSource=fs.readFileSync(path.join(directory,'assets/js/game.js'),'utf8'),at=gameSource.lastIndexOf('})();');
  assert(at>=0,'Game closure');options.gameSource=gameSource.slice(0,at)+wrapFunctions(['saveLab','hydrateLabSnapshot','captureLabRuntime','worldParts','copyMood'])+gameSource.slice(at);
  const source=fs.readFileSync(path.join(directory,'assets/js/save-games.js'),'utf8');
  const needle='return Object.freeze({VERSION, FORMAT, KEYS, validate, createStore});';
  assert.equal(source.split(needle).length,2,'Diagnostic save-module insertion must be unique');
  const storeNeedle='return Object.freeze({read, write});';
  assert.equal(source.split(storeNeedle).length,2,'Diagnostic store insertion must be unique');
  options.saveGamesSource=source.replace(storeNeedle,wrapFunctions(['read','write','readFrom','remember'])+'\n'+storeNeedle)
   .replace(needle,wrapFunctions(['checkJson','checkParsedJson','checkParsedPrototypes','checkLab','checkCampaign','validate','inspect','inspectParsed'])+'\n'+needle);
 }
 const createGame=diagnostic?instrumentedHarness(directory):require(path.join(directory,'tests/game-harness.cjs'));
 const game=createGame(options),{t,sandbox}=game;
 sandbox.__saveBenchmarkClock=clock;sandbox.performance={now:()=>clock.monotonic};
 vm.runInContext('Date.now=()=>globalThis.__saveBenchmarkClock.wall;',sandbox);
 if(diagnostic){
  sandbox.__saveBenchmarkMeter=m;
  // The harness initially shares host JSON. Replace the sandbox binding,
  // never mutate the host JSON methods used by verification/report writing.
  sandbox.JSON={...JSON,parse(...a){return m.call('JSON.parse',JSON.parse,JSON,a);},stringify(...a){return m.call('JSON.stringify',JSON.stringify,JSON,a);}};
 }
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 t.applyPreferences({physicsHz:120,shadows:'off',music:false,guideVoice:false,footsteps:false,joinSounds:false});
 assert.equal(t.getPhysicsStep(),1/120);
 t.setLook({camera:[0,1.7,0],yaw:0,pitch:0});
 const f=fixtures(t);f.distant(pieces);
 assert.equal(f.count(),pieces);
 const key=sandbox.QBitsSavedGames.KEYS.lab;
 return {...game,f,m,values,storage,clock,key,raw:()=>values.get(key)??null};
}
function operation(game,name){
 const {t,sandbox,storage,clock}=game;
 let run=()=>t.saveCurrentGame(),reader=null,source=null,previousRaw=null;
 if(name==='repeated-read'||name==='store-prepopulated-first-write'){
  const seed=t.saveCurrentGame();assert(seed.ok,seed.error);
  previousRaw=game.raw();
  source={snapshot:t.saveLab({passive:true}),alphaSettings:{...t.alphaSettings}};
  reader=sandbox.QBitsSavedGames.createStore({storage:()=>storage,now:()=>clock.wall});
  run=name==='repeated-read'?()=>reader.read('lab'):()=>reader.write('lab',source);
 }
 function prepare(ordinal){
  clock.wall=1800000000000+ordinal*1000;clock.monotonic=ordinal*1000;
  if(name==='mutated-save'&&ordinal>0){
   // Production stepping, then visible live-state edits, all outside the
   // timed save. Changes do not rely on topology or a cache-specific marker.
   t.advanceSimulation(1/60);
   const group=t.groups[0],part=group.parts[0];
   group.body.position.x+=.002;group.body.velocity.x=.03;group.body.aabbNeedsUpdate=true;
   part.mood.energy=Math.max(.05,part.mood.energy-.003);
   t.setLook({yaw:ordinal*.01,pitch:0});
  }
  if(name==='store-prepopulated-first-write')reader=sandbox.QBitsSavedGames.createStore({storage:()=>storage,now:()=>clock.wall});
 }
 const checkResult=value=>assert(name==='repeated-read'?value.status==='ready':value.ok,value.error||name+' failed');
 return {run,prepare,checkResult,initialRaw:previousRaw,expectedWrites:name==='repeated-read'?0:1};
}
function liveState(game){
 const {t}=game;
 return plain({snapshot:t.saveLab({passive:true}),alphaSettings:t.alphaSettings,clock:t.getTickState(),worldTime:t.world.time,bodies:t.world.bodies.map(body=>({mass:body.mass,type:body.type,p:body.position.toArray(),q:body.quaternion.toArray(),v:body.velocity.toArray(),w:body.angularVelocity.toArray(),sleep:body.sleepState}))});
}
function checkpoint(game,value){
 const raw=game.raw();assert.equal(typeof raw,'string');
 const parsed=JSON.parse(raw);
 assert.deepEqual(plain(value.save),parsed,'Returned data must equal the persisted complete record');
 return {raw,parsed};
}
function outputDigest(game,value){
 const raw=game.raw();
 return {rawSha256:sha(raw),rawCharacters:raw.length,rawUtf8Bytes:Buffer.byteLength(raw),returnSha256:sha(JSON.stringify(value)),createdAt:value.save.createdAt,savedAt:value.save.savedAt};
}
class BudgetReached extends Error{constructor(phase,elapsedMs,completed){super('Case exceeded its bounded wall-time budget');Object.assign(this,{phase,elapsedMs,completed});}}
function guard(start,phase,completed){const elapsedMs=performance.now()-start;if(elapsedMs>budget)throw new BudgetReached(phase,elapsedMs,completed);}
function execute(version,name,pieces){
 const start=performance.now(),game=setup(version,pieces),op=operation(game,name);
 let completed=0;guard(start,'setup',completed);
 const invoke=ordinal=>{
  op.prepare(ordinal);guard(start,'prepare',completed);
  const beforeClock=plain(game.t.getTickState());
  game.m.reset();game.m.enabled=true;
  let measured;try{measured=timed(op.run);}finally{game.m.enabled=false;}
  op.checkResult(measured.value);completed++;
  assert.equal(game.m.storage.writes,op.expectedWrites,'Each successful save still writes its slot; reads do not write');
  assert.deepEqual(plain(game.t.getTickState()),beforeClock,'Saving/reading must not execute or discard simulation');
  const digest=outputDigest(game,measured.value);
  return {...measured,digest,diagnostic:game.m.snapshot()};
 };
 global.gc?.();guard(start,'pre-cold-gc',completed);
 const cold=invoke(0),coldCheck=checkpoint(game,cold.value);
 for(let i=1;i<=warmup;i++){invoke(i);guard(start,'warmup',completed);}
 const wall=[],cpu=[],digests=[],diagnostics=[];
 let last=cold;
 for(let i=0;i<samples;i++){
  last=invoke(warmup+1+i);wall.push(last.wallMs);cpu.push(last.processCpuMs);digests.push(last.digest);
  if(diagnostic)diagnostics.push(last.diagnostic);
  guard(start,'measurement',completed);
 }
 guard(start,'before-final-verification',completed);
 const finalCheck=checkpoint(game,last.value),state=liveState(game);
 assert.equal(state.clock.droppedSeconds,0,'No discarded simulation time in this fixture');
 if(name==='mutated-save'){
  assert.notEqual(coldCheck.raw,finalCheck.raw);
  assert.notDeepEqual(coldCheck.parsed.data.snapshot.groups,finalCheck.parsed.data.snapshot.groups,'Live changes must reach the persisted snapshot');
  assert(finalCheck.parsed.data.snapshot.runtime.time>coldCheck.parsed.data.snapshot.runtime.time,'Simulation time advances before mutated saves');
 }
 guard(start,'final-verification',completed);
 const summary={inventory:game.f.inventory(),operationsCompleted:completed,caseWallMs:performance.now()-start,
  cold:{wallMs:cold.wallMs,processCpuMs:cold.processCpuMs,digest:cold.digest,...(diagnostic?{diagnostic:cold.diagnostic}:{})},
  wallMsPerOperation:stats(wall),processCpuMsPerOperation:stats(cpu),wallSamples:wall,cpuSamples:cpu,digests,
  simulation:state.clock,worldTime:state.worldTime,finalStateSha256:sha(JSON.stringify(state)),
  ...(diagnostic?{diagnostics}:{})};
 return {summary,verification:{cold:coldCheck,final:finalCheck,state}};
}
function compare(a,b,label){
 assert.equal(a.verification.cold.raw,b.verification.cold.raw,label+' cold persisted bytes');
 assert.equal(a.verification.final.raw,b.verification.final.raw,label+' final persisted bytes');
 assert.deepEqual(a.verification.cold.parsed,b.verification.cold.parsed,label+' complete cold parsed record');
 assert.deepEqual(a.verification.final.parsed,b.verification.final.parsed,label+' complete final parsed record');
 assert.deepEqual(a.verification.state,b.verification.state,label+' full snapshot and physical state');
 assert.deepEqual(a.summary.digests,b.summary.digests,label+' per-sample full payload/result hashes and timestamps');
}

const reports=[];
for(const name of scenarios){
 let lastCompletedScale=null;
 for(const pieces of scales){
  const runs={baseline:[],optimized:[]},comparisons=[];let stopped=null;
  for(let repetition=0;repetition<repetitions&&!stopped;repetition++){
   const pair={};
   for(const version of repetition%2?['optimized','baseline']:['baseline','optimized']){
    try{pair[version]=execute(version,name,pieces);runs[version].push({repetition:repetition+1,...pair[version].summary});}
    catch(error){if(!(error instanceof BudgetReached))throw error;stopped={version,repetition:repetition+1,phase:error.phase,caseElapsedMs:error.elapsedMs,operationsCompleted:error.completed,lastCompletedScale};break;}
   }
   if(!stopped){compare(pair.baseline,pair.optimized,name+' '+pieces+' repetition '+(repetition+1));comparisons.push({repetition:repetition+1,exactColdAndFinalBytes:true,exactCompleteParsedRecords:true,exactPhysicalState:true,equalEverySamplePayloadHashes:true});}
  }
  reports.push({scenario:name,pieces,status:stopped?'stopped':'complete',runs,comparisons,stopped});
  process.stderr.write(`${name} ${pieces}: ${stopped?'stopped at '+stopped.phase:'complete'}\n`);
  if(stopped)break;
  lastCompletedScale=pieces;
 }
}
for(const [version,directory] of Object.entries(roots))assert.deepEqual(identity(directory).files,sourceIdentity[version].files,version+' source files changed during the benchmark');
const result={schema:1,mode,sources:sourceIdentity,benchmarkSha256:sha(fs.readFileSync(__filename)),runtime:{node:process.version,platform:process.platform,arch:process.arch,cpuModel:os.cpus()[0]?.model,availableParallelism:os.availableParallelism()},
 configuration:{scales,scenarios,repetitions,warmup,samples,caseBudgetMs:budget,physicsHz:120,viewport:'1280x720 DOM/GPU stubs',storage:'persistent Map, no Web Storage or disk I/O',clock:'deterministic wall and monotonic clocks; timestamps compared in full',order:'AB / BA / AB',forcedGc:!!global.gc},
 method:{timing:'Elapsed wall time and process CPU user+system. No browser FPS, GPU time or main-thread-only measurement. Only constant-size storage read/write tallies remain in timing mode; traversal counters, byte scans and phase wrappers are diagnostic-only.',cold:'First invocation in a fresh game VM, before warmup. repeated/mutated-save: initially empty slot; repeated-read: fresh reader over a prepopulated slot; store-prepopulated-first-write: fresh store before every write.',verification:'Full raw strings and parsed records compared exactly at cold/final checkpoints; full payload/result hashes and timestamps compared for every measured sample. Full guardable snapshot, physical bodies and clocks compared after each pair. Verification and preparation are outside each timed operation.',diagnostics:'Counters/profile separately wrap production functions in memory only. JSON traversal counts include recursive nodes; profile timings are inclusive/nested and must not be summed. Timing mode uses unchanged production source, apart from test harness exports.',retention:'Sample output retains bounded hashes, not every serialized scene. Two full raw/parsed checkpoints per variant are retained until pair comparison; no heap-byte or GC claim is made.',percentiles:'Nearest rank per repetition. With 24 samples p95 is rank23 and p99 is rank24; short runs do not establish long-tail behavior.',budget:'Eight seconds by default per variant/case, including setup, warmup, measurement and checks between atomic operations. Never interrupts Cannon or a storage operation midway.'},reports};
const output=JSON.stringify(result,null,2)+'\n';
if(args.output){fs.mkdirSync(path.dirname(path.resolve(args.output)),{recursive:true});fs.writeFileSync(args.output,output);}else process.stdout.write(output);
