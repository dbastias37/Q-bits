// Real Cannon/hand simulation; DOM/GPU are stubs. No browser FPS claims.
// Run serially: node tests/benchmark-family-grab.cjs [output.json]
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),os=require('node:os');
const createGame=require('./game-harness.cjs'),root=path.join(__dirname,'..');
const gameSource=fs.readFileSync(path.join(root,'assets/js/game.js'),'utf8');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourceSha256=hash(gameSource),supportingSources={harness:hash(fs.readFileSync(path.join(__dirname,'game-harness.cjs'))),families:hash(fs.readFileSync(path.join(root,'assets/js/families.js')))};
const dt=1/120,warmup=120,frames=240,repetitions=3;
const stats=values=>{const sorted=values.slice().sort((a,b)=>a-b);return {p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))],max:sorted.at(-1)};};
function setup(mode,count){
 const game=createGame({gameSource}),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.setRunning(true);t.setLook({camera:[0,1.2,1],yaw:0,pitch:0});
 let body,stored=null,reads=0,inventoryReads=0,restore=()=>{};
 if(mode==='family'){
  const pieces=Array.from({length:count},(_,i)=>t.addQubit([3+(i%10)*.12,.06,-3+Math.floor(i/10)*.12],1));
  const [family]=t.groupIntoFamilies(pieces,{name:'Medición de agarre'});assert(family);body=family.body;body.position.set(0,1.2,0);body.aabbNeedsUpdate=true;stored=JSON.stringify(family.items);
  const items=family.items,records=items.flatMap(item=>item.groups.flatMap(g=>g.parts)).map(part=>({part,mood:part.mood}));
  for(const {part,mood}of records)Object.defineProperty(part,'mood',{configurable:true,enumerable:true,get(){reads++;return mood;}});
  Object.defineProperty(family,'items',{configurable:true,enumerable:true,get(){inventoryReads++;return items;}});
  restore=()=>{Object.defineProperty(family,'items',{configurable:true,enumerable:true,writable:true,value:items});for(const {part,mood}of records)Object.defineProperty(part,'mood',{configurable:true,enumerable:true,writable:true,value:mood});assert.equal(JSON.stringify(family.items),stored);};
  t.grabFamily({family,point:body.position.clone(),distance:1});assert(t.getHeld()?.family===family);
 }else{
  // Same aggregate mass as the family. The ordinary cube is the existing hand
  // control path; its 9 cm geometry differs from the family's 15 cm shell.
  const g=t.addQubit([0,1.2,0],count);body=g.body;t.grabQubit({g,part:g.parts[0],point:body.position.clone(),distance:1});assert(t.getHeld()?.g===g);
 }
 assert.equal(body.shapes.length,1);assert.equal(t.getHeld().items.length,1);assert.equal(t.world.constraints.length,1);
 return {game,t,body,readCount:()=>reads,inventoryReadCount:()=>inventoryReads,restore};
}
function frame(t,index){
 t.setLook({camera:[Math.sin(index*.025)*.15,1.2,1],yaw:Math.sin(index*.02)*.08,pitch:0});
 for(let i=0;i<2;i++)t.stepSimulation(dt);
 t.updateFamilies(1/60);
}
function run(mode,count){
 const fixture=setup(mode,count),{t,body}=fixture;
 try{
  for(let i=0;i<warmup;i++)frame(t,i);
  const steps=t.getTickState().physics,time=t.getSimTime(),cpuStart=process.cpuUsage(),wall=[];
  for(let i=0;i<frames;i++){const begin=performance.now();frame(t,i+warmup);wall.push(performance.now()-begin);}
  const cpu=process.cpuUsage(cpuStart),physicsSteps=t.getTickState().physics-steps,simulatedSeconds=t.getSimTime()-time;
  assert.equal(physicsSteps,frames*2);assert(Math.abs(simulatedSeconds-frames/60)<1e-8);assert.equal(fixture.readCount(),0);assert.equal(fixture.inventoryReadCount(),0);
  const result={mode,count,mass:body.mass,cpuMsPerFrame:(cpu.user+cpu.system)/1000/frames,wallMsPerFrame:stats(wall),physicsSteps,simulatedSeconds,bodies:t.world.bodies.length,shapes:body.shapes.length,constraints:t.world.constraints.length,liveGroups:t.groups.length,storedPieces:t.familyInventoryCount(),storedStateReads:fixture.readCount(),inventoryReads:fixture.inventoryReadCount()};
  t.releaseQubit();assert.equal(t.world.constraints.length,0);assert(t.getHeld()===null);assert.equal(fixture.readCount(),0);assert.equal(fixture.inventoryReadCount(),0);
  return result;
 }finally{fixture.restore();}
}
const results=[];
for(const count of [10,100]){
 const runs={cube:[],family:[]};
 for(let rep=0;rep<repetitions;rep++)for(const mode of rep%2?['family','cube']:['cube','family'])runs[mode].push(run(mode,count));
 const median={};for(const mode of ['cube','family'])median[mode]={cpuMsPerFrame:stats(runs[mode].map(r=>r.cpuMsPerFrame)).p50,wallP50:stats(runs[mode].map(r=>r.wallMsPerFrame.p50)).p50,wallP95:stats(runs[mode].map(r=>r.wallMsPerFrame.p95)).p50,bodies:runs[mode][0].bodies,constraints:runs[mode][0].constraints,storedStateReads:runs[mode][0].storedStateReads,inventoryReads:runs[mode][0].inventoryReads};
 results.push({count,median,runs});console.error(JSON.stringify({count,median}));
}
assert.equal(hash(fs.readFileSync(path.join(__dirname,'game-harness.cjs'))),supportingSources.harness,'Harness changed during measurement');
assert.equal(hash(fs.readFileSync(path.join(root,'assets/js/families.js'))),supportingSources.families,'Model changed during measurement');
assert.equal(hash(fs.readFileSync(path.join(root,'assets/js/game.js'))),sourceSha256,'Game source changed during measurement');
const report={capturedAt:new Date().toISOString(),sourceSha256,supportingSources,node:process.version,cpu:os.cpus()[0]?.model,repetitions,warmupFrames:warmup,measuredFrames:frames,physicsHz:120,scope:'Current game with one physically held ordinary cube versus one family containing 10 or 100 pieces. Both controls have the same aggregate mass, one dynamic shape, one hand anchor and one constraint; ordinary cube geometry is 9 cm and family shell 15 cm. Two simulation substeps (real Cannon and the game\'s normal logic cadence) per synthetic frame plus family animation update. DOM/GPU simulated. Setup/packing excluded. Zero inventory or stored mood reads checked through pickup, simulation and release; inventory unchanged after release. No browser FPS, rendering or GPU measurement.',results};
const output=JSON.stringify(report,null,2)+'\n';if(process.argv[2])fs.writeFileSync(process.argv[2],output);else process.stdout.write(output);
