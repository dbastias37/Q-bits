// CPU/command benchmark, not browser FPS. Runs the actual production render
// functions with a no-op WebGL endpoint; geometry uploads are warmed before
// timing. Both variants draw the same 256 independent cube surfaces in 16
// irregular rigid bodies. The GLES test independently checks pixel equivalence.
const assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
let next=0;const counts={draws:0,uniforms:0,uploads:0,pointers:0};
const gl=new Proxy({
 getShaderParameter:()=>true,getProgramParameter:()=>true,isContextLost:()=>false,
 createBuffer:()=>++next,createShader:()=>++next,createProgram:()=>++next,
 getUniformLocation:(_,name)=>name,getAttribLocation:()=>++next,
 drawArrays:()=>counts.draws++,bufferData:()=>counts.uploads++,vertexAttribPointer:()=>counts.pointers++,
},{get:(o,key)=>key in o?o[key]:/^[A-Z_]+$/.test(key)?0:key.startsWith('uniform')?()=>counts.uniforms++:()=>{}});
const {t}=createGame({gl,graphics:false});t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});
for(let body=0;body<16;body++){
 const parts=[];for(let i=0;i<16;i++){const q=t.Q();q.setFromEuler(i*.03,i*.02,0);parts.push({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(body*.6+(i%4)*.12,.1+Math.floor(i/4)*.12,i%2*.1),q});}
 assert.equal(t.makeGroup(parts).block,null);
}
const baseline=()=>{for(const g of t.groups)for(const pose of t.poses(g))t.drawUnitMesh(pose);},batched=()=>{for(const g of t.groups)t.drawGroupSolid(g);};
const reset=()=>{for(const key of Object.keys(counts))counts[key]=0;},snapshot=()=>JSON.stringify(t.groups.map(g=>t.worldParts(g)));
const original=snapshot(),warmup=200,frames=2000,repetitions=3,runs={baseline:[],batched:[]},commands={};
for(const [name,draw]of Object.entries({baseline,batched})){for(let i=0;i<warmup;i++)draw();reset();draw();commands[name]={...counts};assert.equal(snapshot(),original);}
for(let repetition=0;repetition<repetitions;repetition++)for(const name of repetition%2?['batched','baseline']:['baseline','batched']){
 const draw=name==='batched'?batched:baseline,start=process.cpuUsage();for(let i=0;i<frames;i++)draw();const used=process.cpuUsage(start);runs[name].push((used.user+used.system)/1000/frames);
}
assert.equal(snapshot(),original);assert.equal(commands.baseline.draws,256);assert.equal(commands.batched.draws,16);assert.equal(commands.batched.uploads,0);
const median=list=>[...list].sort((a,b)=>a-b)[1],before=median(runs.baseline),after=median(runs.batched);
console.log(JSON.stringify({node:process.version,pieces:256,rigidBodies:16,warmup,frames,repetitions,commands,runs,baselineCpuMsPerFrame:before,batchedCpuMsPerFrame:after,cpuReductionPercent:100*(1-after/before),drawCallReductionPercent:100*(1-commands.batched.draws/commands.baseline.draws),unchangedPhysicalState:true,measures:'CPU and WebGL command submission with a stub GPU; not browser FPS'},null,2));

// Also measure the actual production-line template when available. This keeps
// the same couplers, rollers, final belt and paint marks in both variants.
if(typeof t.conveyorBlueprintTemplate==='function'){
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});
 const recipe=t.conveyorBlueprintTemplate('straight',false);assert(recipe);
 for(let i=0;i<8;i++)assert(t.spawnSavedMechanism(recipe,t.V((i%4)*1.5,0,Math.floor(i/4)*1.5)));
 assert(t.groups.every(g=>!g.block&&g.parts.every(p=>!p.mood.externalBattery)),'per-piece reference matches these non-block, battery-free assemblies');
 const reference=()=>{baseline();t.drawConveyors?.();},merged=()=>{batched();t.drawConveyors?.();},lineCommands={},lineRuns={baseline:[],batched:[]},lineState=snapshot();
 for(const [name,draw]of Object.entries({baseline:reference,batched:merged})){for(let i=0;i<warmup;i++)draw();reset();draw();lineCommands[name]={...counts};}
 for(let repetition=0;repetition<repetitions;repetition++)for(const name of repetition%2?['batched','baseline']:['baseline','batched']){
  const draw=name==='batched'?merged:reference,start=process.cpuUsage();for(let i=0;i<frames;i++)draw();const used=process.cpuUsage(start);lineRuns[name].push((used.user+used.system)/1000/frames);
 }
 assert.equal(snapshot(),lineState);const first=median(lineRuns.baseline),second=median(lineRuns.batched);
 console.log(JSON.stringify({scenario:'8 actual straight conveyor sections including belts',pieces:t.groups.reduce((n,g)=>n+g.parts.length,0),rigidBodies:t.groups.length,rotors:t.rotors.length,warmup,frames,repetitions,commands:lineCommands,runs:lineRuns,baselineCpuMsPerFrame:first,batchedCpuMsPerFrame:second,cpuReductionPercent:100*(1-second/first),drawCallReductionPercent:100*(1-lineCommands.batched.draws/lineCommands.baseline.draws),unchangedPhysicalState:true,measures:'CPU and WebGL command submission with a stub GPU; not browser FPS'},null,2));
}
