// node tests/benchmark-runtime-lookups.cjs /path/to/baseline-game.js
// Run without other benchmarks. Real Cannon; DOM/GPU stubs, NOT browser FPS.
// Baseline used for this delivery: 458b7860e6ac761e4df4a66f292b2d984584fac8.
const fs=require('node:fs'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
assert(process.argv[2],'Pass the baseline game.js file');
const baseline=fs.readFileSync(process.argv[2],'utf8');
function setup(variant,scene){
 const {t}=createGame(variant==='baseline'?{gameSource:baseline}:{});t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});
 if(scene==='rotors'){
  for(let i=0;i<20;i++){const r=t.spawnRotor(t.V(-4+(i%5)*2,0,-5+Math.floor(i/5)));assert(r);assert(t.configureRotor(r,{rpm:24,maxTorque:.4,capacity:32,mount:'wheel',enabled:true}));}
  for(let i=0;i<216;i++)t.addQubit([-4.25+(i%18)*.5,.045,2+Math.floor(i/18)*.5]);
 }else for(let i=0;i<4;i++){
  assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate(i%2?'left':'straight'),t.V(-3+i*2,0,0)));
  const c=t.conveyors.at(-1),base=t.rotorPart(c.baseId),p=base.p.clone();p.y+=.09;
  const battery=t.makeGroup([{id:t.allocateUnitId(),shape:'cube',weight:1,p,q:base.q.clone()}]),cell=battery.parts[0];cell.mood.energy=1;cell.mood.externalBattery={version:1,ownerId:cell.id,packId:cell.id,enabled:true};
  assert(t.weld({source:battery,target:base.g,position:battery.body.position.clone(),quaternion:battery.body.quaternion.clone()}));assert(t.conveyorEnsureSurfaces(c));
  const surface=t.conveyorSurfacePoses(c)[0],point=surface.p.vadd(surface.q.vmult(t.V(-surface.size.x*.2,surface.half.y+.05,0)));t.addQubit([point.x,point.y,point.z]);assert(t.startConveyor(c),c.status);
 }
 return t;
}
function snapshot(t){const v=p=>[p.x,p.y,p.z,...('w'in p?[p.w]:[])];return JSON.stringify({groups:t.groups.map(g=>({parts:g.parts.map(p=>[p.id,p.mood.energy]),p:v(g.body.position),q:v(g.body.quaternion),v:v(g.body.velocity),w:v(g.body.angularVelocity)})),rotors:t.rotors.map(r=>[r.actualRpm,r.actualTorque,r.enabled]),conveyors:t.conveyors.map(c=>[c.phase,c.speed,c.load,c.running,c.status])});}
const warmup=120,steps=120,repetitions=3,results=[];
for(const scene of ['rotors','conveyors']){
 const runs={baseline:[],optimized:[]},states={baseline:[],optimized:[]};let meta;
 for(let repeat=0;repeat<repetitions;repeat++)for(const variant of repeat%2?['optimized','baseline']:['baseline','optimized']){
  const t=setup(variant,scene);for(let i=0;i<warmup;i++)t.stepPhysics(1/240);
  const start=process.cpuUsage();for(let i=0;i<steps;i++)t.stepPhysics(1/240);const used=process.cpuUsage(start);
  runs[variant].push((used.user+used.system)/1000/steps);states[variant].push(snapshot(t));
  if(scene==='conveyors')assert(t.conveyors.every(c=>c.running),'all four conveyors must remain powered');
  meta={pieces:t.groups.reduce((n,g)=>n+g.parts.length,0),bodies:t.groups.length,rotors:t.rotors.length,contacts:t.world.contacts.length};
 }
 for(let i=0;i<repetitions;i++)assert.equal(states.baseline[i],states.optimized[i],scene+': identical positions, velocities, energy and controller state');
 const median=a=>[...a].sort((a,b)=>a-b)[1],before=median(runs.baseline),after=median(runs.optimized);
 results.push({scene,...meta,warmup,steps,repetitions,runs,baselineCpuMsPerSubstep:before,optimizedCpuMsPerSubstep:after,cpuReductionPercent:100*(1-after/before),identicalPhysicsAndEnergy:true});
}
console.log(JSON.stringify({node:process.version,baselineCommit:'458b7860e6ac761e4df4a66f292b2d984584fac8',physicsHz:240,scope:'CPU per real Cannon substep, DOM/GPU stubs; not browser FPS or a capacity limit',results},null,2));
