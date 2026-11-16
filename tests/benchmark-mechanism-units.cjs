// Reproducible comparison against the reported release. Real simulation and
// production render/selection paths; stub DOM/GPU. This does NOT measure FPS.
// Usage: node tests/benchmark-mechanism-units.cjs [baseline-git-ref]
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),createGame=require('./game-harness.cjs');
const root=path.resolve(__dirname,'..'),ref=process.argv[2]||'bc1324b11b7cc1327261581034dcf1af9ac93372';
const sources={baseline:execFileSync('git',['show',ref+':assets/js/game.js'],{cwd:root,encoding:'utf8',maxBuffer:4e6}),optimized:fs.readFileSync(path.join(root,'assets/js/game.js'),'utf8')};
function setup(name,count,active){
 let draws=0;const game=createGame({gameSource:sources[name],graphics:false}),{t}=game;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});
 for(let i=0;i<count;i++){
  const kind=count===3&&i===2?'left':'straight';assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate(kind),t.V(-4+(i%4)*2,0,-2+Math.floor(i/4)*2)));
  if(active){const c=t.conveyors.at(-1),base=t.rotorPart(c.baseId),p=base.p.clone();p.y+=.09;
   const battery=t.makeGroup([{id:t.allocateUnitId(),shape:'cube',weight:1,p,q:base.q.clone()}]),cell=battery.parts[0];cell.mood.energy=1;cell.mood.externalBattery={version:1,ownerId:cell.id,packId:cell.id,enabled:true};assert(t.weld({source:battery,target:base.g,position:battery.body.position.clone(),quaternion:battery.body.quaternion.clone()}));assert(t.conveyorEnsureSurfaces(c));
   const surface=t.conveyorSurfacePoses(c)[0],point=surface.p.vadd(surface.q.vmult(t.V(-surface.size.x*.2,surface.half.y+.05,0)));t.addQubit([point.x,point.y,point.z]);assert(t.startConveyor(c),c.status);
  }
 }
 // Include the real selection outline after spawning, and all selected
 // mechanisms in the 240-piece stress case. Same camera and settings both ways.
 t.setMultiSelection(t.groups.slice());t.setLook({camera:[0,2.2,4],yaw:0,pitch:-.25});
 return {t};
}
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)],frames=30,warmup=240,repetitions=3,reports=[];
for(const scenario of [{name:'two straight sections and a corner, stopped',count:3,active:false},{name:'same line powered with three batteries and three payloads',count:3,active:true},{name:'eight straight sections, all selected',count:8,active:false}]){
 const runs={baseline:[],optimized:[]},states={};let meta;
 for(let rep=0;rep<repetitions;rep++)for(const name of rep%2?['optimized','baseline']:['baseline','optimized']){
  const {t}=setup(name,scenario.count,scenario.active);for(let i=0;i<warmup;i++)t.stepPhysics(1/240);for(let i=0;i<3;i++)t.renderScene();
  const start=process.cpuUsage();for(let f=0;f<frames;f++){for(let i=0;i<4;i++)t.stepPhysics(1/240);t.renderScene();t.updateTarget();t.updateSpeech();}
  const used=process.cpuUsage(start);runs[name].push((used.user+used.system)/1000/frames);
  if(scenario.active)assert(t.conveyors.every(c=>c.running),'all powered sections stay running');
  states[name]=t.groups.flatMap(g=>[g.body.position.x,g.body.position.y,g.body.position.z,g.body.quaternion.x,g.body.quaternion.y,g.body.quaternion.z,g.body.quaternion.w,...g.parts.map(p=>p.mood.energy)]);
  meta={pieces:t.groups.reduce((n,g)=>n+g.parts.length,0),rigidBodies:t.groups.length,hinges:t.rotors.length,sleepingBodies:t.groups.filter(g=>g.body.sleepState===2).length};
 }
 const baseline=median(runs.baseline),optimized=median(runs.optimized),drift=Math.max(...states.baseline.map((x,i)=>Math.abs(x-states.optimized[i])));
 // Braked stopped mechanisms intentionally change their response to friction;
 // powered transport should preserve its physical trajectory and energy.
 if(scenario.active)assert(drift<1e-6,'powered geometry and energy changed: '+drift);
 const report={scenario:scenario.name,...meta,baselineCpuMsPerFrame:baseline,optimizedCpuMsPerFrame:optimized,cpuReductionPercent:100*(1-optimized/baseline),maxStateDelta:drift,runs};reports.push(report);console.log(JSON.stringify(report));
}
console.log(JSON.stringify({baseline:ref,node:process.version,frames,warmupSubsteps:warmup,repetitions,measures:'CPU for four real 240 Hz substeps + rendering and UI, per simulated 60 Hz frame. DOM/GPU stubs, not browser FPS.',reports},null,2));
