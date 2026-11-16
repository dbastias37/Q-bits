// Real Cannon/game logic, DOM/GPU stubs. Timings are CPU cost, not browser FPS.
// Run alone: node tests/benchmark-large-assemblies.cjs [baseline-ref] [output.json]
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),createGame=require('./game-harness.cjs');
const root=path.resolve(__dirname,'..'),ref=process.argv[2]||'050660fa24742779ea7407c3609f2b9daee3fd18',sources={baseline:execFileSync('git',['show',ref+':assets/js/game.js'],{cwd:root,encoding:'utf8',maxBuffer:4e6}),optimized:fs.readFileSync(path.join(root,'assets/js/game.js'),'utf8')};
function setup(version){const game=createGame({gameSource:sources[version],graphics:false}),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.settings.maxCarry=256;return game;}
function plate(t,nx,nz,x=0,y=1,mixed=false){return t.makeGroup(Array.from({length:nx*nz},(_,i)=>({id:t.allocateUnitId(),shape:mixed&&i%2?'pyramid':'cube',weight:1,p:t.V(x+i%nx*.09,y,Math.floor(i/nx)*.09),q:t.Q()})));}
function steps(t,n){for(let i=0;i<n;i++)t.stepPhysics(1/240);}
function measure(fn){const before=process.cpuUsage();fn();const cpu=process.cpuUsage(before);return (cpu.user+cpu.system)/1000;}
function take(t,g){t.grabQubit({g,part:g.parts[0],point:g.body.position.clone(),distance:.8});assert(t.getHeld());t.keys.add('ShiftLeft');}
function run(version,scenario){const {t}=setup(version);
 if(scenario==='idle-arm'){
  assert(t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V()));steps(t,720);const start=t.groups.map(g=>({g,p:g.body.position.clone()})),cpu=measure(()=>steps(t,2400));return {idleCpuMsPerFrame:cpu/600,maxDisplacementMeters:Math.max(...start.map(({g,p})=>g.body.position.distanceTo(p))),sleepingBodies:t.groups.filter(g=>g.body.sleepState===2).length,bodies:t.groups.length,constraints:t.world.constraints.length};
 }
 const single=scenario.startsWith('single-');let source,target,createCpuMs=measure(()=>{target=plate(t,single?16:8,12,0,single?.045:1,scenario.endsWith('-mixed'));});
 if(single){steps(t,720);const pose=t.poses(target)[100];source=t.addQubit([pose.p.x,pose.p.y+.105,pose.p.z]);}else source=plate(t,8,12,.735);
 take(t,source);let snap=t.findSnap();assert(snap);const snapCpuMs=measure(()=>{for(let i=0;i<20;i++){snap=t.findSnap();assert(snap);}})/20;t.setHeld(null);let joined;const weldCpuMs=measure(()=>{joined=t.weld(snap);});assert(joined);return {createCpuMs,snapCpuMs,weldCpuMs,pieces:joined.parts.length,colliders:joined.body.shapes.length};
}
const repetitions=7,reports=[];for(const scenario of ['single-on-192','single-on-192-mixed','96-on-96','idle-arm']){
 // Warm both versions separately, then alternate measured order.
 for(const version of ['baseline','optimized'])run(version,scenario);
 const runs={baseline:[],optimized:[]};for(let rep=0;rep<repetitions;rep++)for(const version of rep%2?['optimized','baseline']:['baseline','optimized'])runs[version].push(run(version,scenario));
 const median={};for(const version of ['baseline','optimized'])median[version]=Object.fromEntries(Object.keys(runs[version][0]).map(key=>[key,runs[version].map(r=>r[key]).sort((a,b)=>a-b)[Math.floor(repetitions/2)]]));const report={scenario,median,runs};reports.push(report);console.log(JSON.stringify({scenario,median}));
}
const result={baseline:ref,node:process.version,repetitions,method:'Median process CPU milliseconds. 20 snap queries per run; idle frame = four 240 Hz physics substeps, after three seconds settling, ten seconds measured. No GPU, render, DOM or browser FPS measurements.',reports};if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(result,null,2)+'\n');else console.log(JSON.stringify(result,null,2));
