// Same current game, loose pieces versus stored families. Real Cannon/game CPU,
// simulated DOM/GPU: these measurements do not report browser FPS or GPU time.
// Run serially: node tests/benchmark-families.cjs [output.json] [100,500,2000]
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),os=require('node:os'),createGame=require('./game-harness.cjs');
const gameSource=fs.readFileSync(path.join(__dirname,'../assets/js/game.js'),'utf8'),sourceSha256=crypto.createHash('sha256').update(gameSource).digest('hex');
const capturedAt=new Date().toISOString(),fileHash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,file))).digest('hex');
const supportingSources={families:fileHash('../assets/js/families.js'),cannon:fileHash('../assets/js/cannon.min.js'),harness:fileHash('game-harness.cjs')};
const plain=value=>JSON.parse(JSON.stringify(value));
const counts=(process.argv[3]||'100,500,2000').split(',').map(Number);
assert(counts.every(n=>Number.isInteger(n)&&n>=1&&n<=2000));
const stepsPerFrame=2,dt=1/120,warmup=120,frames=60,repetitions=3;
const stats=values=>{const sorted=values.slice().sort((a,b)=>a-b);return {p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))],max:sorted.at(-1)};};
function inventory(t){return plain([...t.groups.flatMap(t.worldParts),...t.families.flatMap(f=>f.items.flatMap(item=>item.groups.flatMap(g=>g.parts)))].map(p=>({id:p.id,weight:p.weight,shape:p.shape,name:p.mood.name,energy:p.mood.energy}))).sort((a,b)=>a.id-b.id);}
function setup(count,fixture='loose'){
 const game=createGame({gameSource}),{t}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
 game.sandbox.document.pointerLockElement=t.canvas;game.sandbox.document.body.dataset.booting='false';
 t.setRunning(true);
 const parts=[];for(let i=0;i<count;i++){const id=t.allocateUnitId(),part={id,shape:'cube',weight:1,p:t.V(-3+(i%40)*.15,.048,-3+Math.floor(i/40)*.15),q:t.Q(),mood:{energy:.5,name:'Pieza '+i}};if(fixture==='compound')parts.push(part);else t.makeGroup([part]);}
 if(fixture==='compound')t.makeGroup(parts);
 return game;
}
function frame(t){for(let step=0;step<stepsPerFrame;step++)t.stepSimulation(dt);t.updateFamilies(1/60);}
function run(count,mode){
 const game=setup(count),{t}=game,original=inventory(t);let groupingMs=0;
 if(mode==='families'){
  const start=performance.now(),made=t.groupIntoFamilies([...t.groups],{name:'Medición',color:'#3b7986',disassemble:true,byType:true});groupingMs=performance.now()-start;
  assert(Array.isArray(made));assert.equal(made.length,Math.ceil(count/100));assert.deepEqual(inventory(t),original);
 }
 for(let i=0;i<warmup;i++)frame(t);
 const preSteps=t.getTickState().physics,preTime=t.getSimTime(),cpuStart=process.cpuUsage(),times=[];
 for(let i=0;i<frames;i++){const start=performance.now();frame(t);times.push(performance.now()-start);}
 const cpu=process.cpuUsage(cpuStart),elapsedSteps=t.getTickState().physics-preSteps,elapsedTime=t.getSimTime()-preTime;
 assert.equal(elapsedSteps,frames*stepsPerFrame);assert(Math.abs(elapsedTime-frames/60)<1e-8);
 assert.equal(t.scenePartCount(),count);assert.equal(new Set(inventory(t).map(p=>p.id)).size,count);
 return {mode,count,groupingMs,cpuMsPerFrame:(cpu.user+cpu.system)/1000/frames,wallMsPerFrame:stats(times),bodies:t.world.bodies.length,liveGroups:t.groups.length,families:t.families.length,constraints:t.world.constraints.length,storedPieces:t.familyInventoryCount(),physicsSteps:elapsedSteps,simulatedSeconds:elapsedTime};
}
function runIncremental(count,fixture='loose'){
 const {t}=setup(count,fixture),original=inventory(t),cpuStart=process.cpuUsage(),start=performance.now();
 assert(t.startFamilyGrouping([...t.groups],{name:'Medición incremental',color:'#3b7986',disassemble:true,byType:true}));
 const startMs=performance.now()-start,times=[];
 while(t.getFamilyGroupingJob()&&times.length<10000){const at=performance.now();t.advanceFamilyGrouping();times.push(performance.now()-at);}
 const cpu=process.cpuUsage(cpuStart);
 assert.equal(t.getFamilyGroupingJob(),null);assert.equal(t.families.length,Math.ceil(count/100));assert.deepEqual(inventory(t),original);
 return {count,fixture,startMs,workWallMs:startMs+times.reduce((sum,value)=>sum+value,0),cpuMs:(cpu.user+cpu.system)/1000,advanceCalls:times.length,advanceMs:stats(times.length?times:[0]),largestSynchronousMs:Math.max(startMs,...times),bodies:t.world.bodies.length,families:t.families.length,storedPieces:t.familyInventoryCount()};
}
const results=[];
for(const count of counts){
 const runs={loose:[],families:[]};
 for(let rep=0;rep<repetitions;rep++)for(const mode of rep%2?['families','loose']:['loose','families'])runs[mode].push(run(count,mode));
 const median={};for(const mode of ['loose','families'])median[mode]={cpuMsPerFrame:stats(runs[mode].map(r=>r.cpuMsPerFrame)).p50,wallP50:stats(runs[mode].map(r=>r.wallMsPerFrame.p50)).p50,wallP95:stats(runs[mode].map(r=>r.wallMsPerFrame.p95)).p50,groupingMs:stats(runs[mode].map(r=>r.groupingMs)).p50,bodies:runs[mode][0].bodies,families:runs[mode][0].families,storedPieces:runs[mode][0].storedPieces};
 results.push({count,median,runs});console.error(JSON.stringify({count,median}));
}
for(const result of results)for(const fixture of ['loose','compound']){
 const runs=Array.from({length:repetitions},()=>runIncremental(result.count,fixture)),median={};
 for(const key of ['startMs','workWallMs','cpuMs','advanceCalls','largestSynchronousMs'])median[key]=stats(runs.map(run=>run[key])).p50;
 median.advanceP50=stats(runs.map(run=>run.advanceMs.p50)).p50;median.advanceP95=stats(runs.map(run=>run.advanceMs.p95)).p50;
 const key=fixture==='loose'?'incremental':'incrementalCompound',peakSynchronousMs=Math.max(...runs.map(run=>run.largestSynchronousMs));result[key]={median,peakSynchronousMs,runs};console.error(JSON.stringify({count:result.count,fixture,incremental:median,peakSynchronousMs}));
}
assert.deepEqual(supportingSources,{families:fileHash('../assets/js/families.js'),cannon:fileHash('../assets/js/cannon.min.js'),harness:fileHash('game-harness.cjs')},'Supporting source files changed during the measurement.');
const report={capturedAt,sourceSha256,supportingSources,node:process.version,cpu:os.cpus()[0]?.model,repetitions,warmupFrames:warmup,measuredFrames:frames,physicsHz:120,scope:'Current game loose independent pieces vs families with identical inventory at transfer. Real Cannon and game simulation; DOM/GPU simulated. Two 120 Hz steps per synthetic frame. Storage intentionally suspends piece mood/energy logic, so post-run individual states are not expected to equal loose states. Incremental advance calls run consecutively for measurement: their count describes logical work slices, not elapsed browser frames. No browser FPS, GPU or end-to-end render measurement.',results};
const output=JSON.stringify(report,null,2)+'\n';if(process.argv[2])fs.writeFileSync(process.argv[2],output);else process.stdout.write(output);
