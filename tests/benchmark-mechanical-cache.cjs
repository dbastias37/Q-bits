// Reproducible CPU benchmark: node tests/benchmark-mechanical-cache.cjs
// Reads the current game/harness sources once, then compares the same snapshot
// with and without per-substep mechanical caches. Production files are untouched.
// Real Cannon/game simulation; DOM/GPU stubs. These CPU timings are NOT FPS and
// do not measure rendering, browser performance, input latency or player devices.
// Defaults match the reported run: 256 pieces, 20 rotors, 120 warmup substeps,
// 120 measured substeps at 1/240 second, three repetitions per configuration.
// Run on an otherwise idle machine: scheduling, garbage collection and thermal
// limits introduce noise. Report medians and equivalent final simulation states.
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const harnessPath=path.join(root,'tests/game-harness.cjs');
const gamePath=path.join(root,'assets/js/game.js');
const snapshots=new Map(fs.readdirSync(path.join(root,'assets/js')).filter(name=>name.endsWith('.js')).map(name=>{const p=path.join(root,'assets/js',name);return[p,fs.readFileSync(p,'utf8')];}));
const original=snapshots.get(gamePath);
const needle='mechanicalStepCache={parts:null,components:new Map()};';
assert.equal(original.split(needle).length-1,1);
const harness=fs.readFileSync(harnessPath,'utf8').replace('setRunning:value=>{running=value}};',`setRunning:value=>{running=value},getMechanicalCache:()=>mechanicalStepCache,beginMechanicalCache:()=>{mechanicalStepCache={parts:null,components:new Map()};},endMechanicalCache:()=>{mechanicalStepCache=null;}};`);
function createGame(cached){
 const gameSource=cached?original:original.replace(needle,'mechanicalStepCache=null;');
 const mod=new Module(harnessPath,module);mod.filename=harnessPath;mod.paths=Module._nodeModulePaths(path.dirname(harnessPath));
 const nativeRequire=mod.require.bind(mod);
 mod.require=name=>name==='node:fs'?{...fs,readFileSync(file,...args){const p=String(file);return p===gamePath?gameSource:snapshots.has(p)?snapshots.get(p):fs.readFileSync(file,...args);}}:nativeRequire(name);
 mod._compile(harness,harnessPath);
 const game=mod.exports(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 return game;
}
function setup(cached,active){
 const game=createGame(cached),{t}=game;
 for(let i=0;i<20;i++){const rotor=t.spawnRotor(t.V(-4+(i%5)*2,0,-5+Math.floor(i/5)));assert(rotor);assert(t.configureRotor(rotor,{rpm:24,maxTorque:.4,capacity:32,mount:'wheel',enabled:active}));}
 for(let i=0;i<216;i++)t.addQubit([-4.25+(i%18)*.5,.045,2+Math.floor(i/18)*.5]);
 assert.equal(t.groups.reduce((sum,g)=>sum+g.parts.length,0),256);assert.equal(t.rotors.length,20);
 return game;
}
function state(t){return JSON.stringify({groups:t.groups.map(g=>({parts:g.parts.map(p=>[p.id,p.mood.energy]),p:[g.body.position.x,g.body.position.y,g.body.position.z],q:[g.body.quaternion.x,g.body.quaternion.y,g.body.quaternion.z,g.body.quaternion.w]})),rotors:t.rotors.map(r=>[r.aId,r.bId,r.enabled,r.actualRpm,r.actualTorque])});}
function correctness(){
 const {t}=createGame(true),r=t.spawnRotor(t.V(0,.3,0)),a=t.rotorPart(r.aId),b=t.rotorPart(r.bId);
 t.beginMechanicalCache();assert.equal(t.rotorConnectedGroups([a.g]).length,2);const first=t.rotorPart(r.aId).p.clone();a.g.body.position.x+=.2;assert(Math.abs(t.rotorPart(r.aId).p.x-first.x-.2)<1e-12);a.g.body.position.x-=.2;
 const extra=t.addQubit([2,.2,0]);assert.equal(t.rotorPart(extra.parts[0].id).g,extra);t.removeGroup(extra);assert.equal(t.rotorPart(extra.parts[0].id),null);
 assert(t.disconnectRotor(r));assert.equal(t.rotorConnectedGroups([a.g]).length,1);assert(t.connectRotorTips(a.part.id,b.part.id));assert.equal(t.rotorConnectedGroups([a.g]).length,2);t.endMechanicalCache();
 const nativeStep=t.world.step;t.world.step=()=>{throw new Error('benchmark injected failure');};assert.throws(()=>t.stepPhysics(1/240),/benchmark injected failure/);assert.equal(t.getMechanicalCache(),null);t.world.step=nativeStep;t.stepPhysics(1/240);assert.equal(t.getMechanicalCache(),null);
 return 'live pose, make/remove/connect/disconnect invalidation, finally cleanup after normal/error paths: PASS';
}
const warmup=120,steps=120,repetitions=3,results=[];
console.log(JSON.stringify({node:process.version,warmup,steps,repetitions,correctness:correctness()}));
for(const active of [false,true]){
 const runs={baseline:[],cached:[]},states={baseline:[],cached:[]};
 for(let repetition=0;repetition<repetitions;repetition++)for(const cached of repetition%2?[true,false]:[false,true]){
  const {t}=setup(cached,active);for(let i=0;i<warmup;i++)t.stepPhysics(1/240);
  const start=process.cpuUsage(),wallStart=performance.now();for(let i=0;i<steps;i++)t.stepPhysics(1/240);const cpu=process.cpuUsage(start),wallMs=performance.now()-wallStart;
  const key=cached?'cached':'baseline',ms=(cpu.user+cpu.system)/1000;assert.equal(t.getMechanicalCache(),null);runs[key].push(ms/steps);states[key].push(state(t));
  console.log(JSON.stringify({active,repetition:repetition+1,variant:key,cpuMsPerStep:ms/steps,wallMsPerStep:wallMs/steps,enabled:t.rotors.filter(r=>r.enabled).length}));
 }
 for(let i=0;i<repetitions;i++)assert.equal(states.baseline[i],states.cached[i],'identical physics and energy state');
 const median=values=>[...values].sort((a,b)=>a-b)[1],before=median(runs.baseline),after=median(runs.cached);
 results.push({active,pieces:256,rigidBodies:256,rotors:20,warmup,steps,repetitions,baselineCpuMsPerStep:before,cachedCpuMsPerStep:after,reductionPercent:100*(1-after/before),speedup:before/after,identicalFinalState:true,runs});
}
console.log('RESULT '+JSON.stringify(results));
