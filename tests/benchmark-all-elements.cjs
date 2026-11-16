// Real game/Cannon and production render paths. DOM/GPU stubs: CPU timings
// and draw counts are not browser FPS. Run without concurrent test processes.
// Usage: node tests/benchmark-all-elements.cjs [baseline-git-ref]
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),createGame=require('./game-harness.cjs');
const ref=process.argv[2]||'3264913563a71763cf8e6f762f11e50e2668ebc7',root=path.resolve(__dirname,'..');
const sources={baseline:execFileSync('git',['show',ref+':assets/js/game.js'],{cwd:root,encoding:'utf8',maxBuffer:4e6}),optimized:fs.readFileSync(path.join(root,'assets/js/game.js'),'utf8')};
function setup(version,scenario){
 let draws=0;const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0,getUniformLocation:()=>0,createBuffer:()=>({}),createShader:()=>({}),createProgram:()=>({}),isContextLost:()=>false,drawArrays:()=>{draws++;}},{get:(o,k)=>k in o?o[k]:/^[A-Z_]+$/.test(k)?0:()=>{}});
 const game=createGame({gameSource:sources[version],gl,graphics:false}),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.settings.maxCarry=256;t.setLook({camera:[.4,1.4,2],yaw:0,pitch:-.4});
 let picked,wall;
 if(scenario==='mixed'){
  for(let group=0;group<3;group++){const parts=[];for(let i=0;i<64;i++){const q=t.Q();q.setFromEuler(i*.17,i*.09,i*.05);parts.push({id:t.allocateUnitId(),shape:['cube','tetra','pyramid','coupler'][i%4],weight:1,p:t.V(-2+group*2+(i%8)*.15,.8+Math.floor(i/8)*.15,i%3*.13),q});}t.makeGroup(parts);}
 }else if(scenario==='blocked'){
  assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('left'),t.V()));picked=t.rotorPart(t.conveyors[0].baseId);
 }else{
  for(const [kind,x]of [['straight',-2],['straight',2],['left',0]])assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate(kind),t.V(x,0,0)));
  if(scenario==='arm'){assert(t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V(0,0,-2)));picked=t.rotorPart(t.rotors.at(-1).bId);}else picked=t.rotorPart(t.conveyors.at(-1).baseId);
 }
 t.settings.gravity=0;t.world.gravity.set(0,0,0);for(const g of t.groups)g.body.position.y+=.7;
 t.setMultiSelection(t.groups.slice());
 if(['corner','arm','blocked'].includes(scenario)){
  t.setMultiSelection([]);t.grabQubit({...picked,point:picked.g.body.position.clone(),distance:.8});assert(t.getHeld());
  if(scenario==='blocked'){const bb=t.physicalGroupBounds(picked.g);wall=t.storyWall(t.V(bb.max.x+.023,(bb.min.y+bb.max.y)/2,(bb.min.z+bb.max.z)/2),t.V(.002,.5,.8));}
 }
 const start=picked?.g.body.position.clone(),aim=frame=>{if(!t.getHeld())return;const target=start.vadd(scenario==='blocked'?t.V(.5,0,0):t.V(.15*Math.sin(frame*.025),.12,.1*Math.cos(frame*.025))),held=t.getHeld();held.rootOffset=target.vsub(t.V(...t.getLook().camera).vadd(t.screenRay(640,360).scale(held.distance)));};
 return {t,aim,draws:()=>draws,penetration:()=>wall?Math.max(0,t.physicalGroupBounds(picked.g).max.x-wall.min.x):0};
}
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)],reports=[],frames=30,repetitions=3;
for(const scenario of ['selected','corner','arm','mixed','blocked']){
 const runs={baseline:[],optimized:[]},drawCounts={},penetrations={};let pieces;
 for(let rep=0;rep<repetitions;rep++)for(const version of rep%2?['optimized','baseline']:['baseline','optimized']){
  const {t,aim,draws,penetration}=setup(version,scenario);for(let f=0;f<30;f++){aim(f);for(let i=0;i<4;i++)t.stepPhysics(1/240);}for(let i=0;i<3;i++)t.renderScene();
  const initialDraws=draws(),cpu=process.cpuUsage();let maxPenetration=0;
  for(let f=0;f<frames;f++){aim(f+30);for(let i=0;i<4;i++){t.stepPhysics(1/240);maxPenetration=Math.max(maxPenetration,penetration());}t.renderScene();t.updateTarget();}
  const used=process.cpuUsage(cpu);runs[version].push((used.user+used.system)/1000/frames);drawCounts[version]=(draws()-initialDraws)/frames;penetrations[version]=maxPenetration;pieces=t.groups.reduce((n,g)=>n+g.parts.length,0);
 }
 const baseline=median(runs.baseline),optimized=median(runs.optimized),report={scenario,pieces,baselineCpuMsPerFrame:baseline,optimizedCpuMsPerFrame:optimized,cpuReductionPercent:100*(1-optimized/baseline),drawCallsPerFrame:drawCounts,maxPanelPenetration:penetrations,runs};reports.push(report);console.log(JSON.stringify(report));
}
console.log(JSON.stringify({baseline:ref,node:process.version,frames,repetitions,measures:'CPU for four 240 Hz physics substeps, render and target UI per simulated frame. GPU/DOM stubs; no FPS claim.',reports},null,2));
