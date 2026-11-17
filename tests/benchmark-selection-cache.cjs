// CPU microbenchmark only: actual selection functions with a simulated GPU.
// node tests/benchmark-selection-cache.cjs [baseline-ref] [output.json]
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),createGame=require('./game-harness.cjs');
const root=path.resolve(__dirname,'..'),ref=process.argv[2]||'21825fb',sources={baseline:execFileSync('git',['show',ref+':assets/js/game.js'],{cwd:root,encoding:'utf8',maxBuffer:4e6}),optimized:fs.readFileSync(path.join(root,'assets/js/game.js'),'utf8')};
function run(version,count,moving){
 let uploads=0;const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0,getUniformLocation:()=>0,createBuffer:()=>({}),createShader:()=>({}),createProgram:()=>({}),isContextLost:()=>false,bufferData:()=>uploads++},{get:(o,k)=>k in o?o[k]:/^[A-Z_]+$/.test(k)?0:()=>{}});
 const {t}=createGame({gl,gameSource:sources[version],graphics:false});t.clearNarrativeScene();t.setLook({camera:[.2,1.3,3],yaw:0,pitch:-.2});
 const g=t.makeGroup(Array.from({length:count},(_,i)=>({id:t.allocateUnitId(),shape:['cube','tetra','pyramid','coupler'][i%4],weight:1,p:t.V(i%20*.09,.3+Math.floor(i/200)*.09,Math.floor(i/20)%10*.09),q:t.Q()})));
 for(let i=0;i<4;i++)t.drawRigidOutline(g,.85,true);uploads=0;const start=process.cpuUsage();
 for(let i=0;i<30;i++){if(moving)t.setLook({yaw:i*.0001});t.drawRigidOutline(g,.85,true);}const used=process.cpuUsage(start);
 return {cpuMsPerDraw:(used.user+used.system)/1000/30,uploads};
}
const repetitions=5,reports=[];
for(const count of [80,487,2000])for(const moving of [false,true]){
 const runs={baseline:[],optimized:[]};for(let i=0;i<repetitions;i++)for(const version of i%2?['optimized','baseline']:['baseline','optimized'])runs[version].push(run(version,count,moving));
 const median=Object.fromEntries(Object.entries(runs).map(([version,values])=>[version,{cpuMsPerDraw:values.map(v=>v.cpuMsPerDraw).sort((a,b)=>a-b)[Math.floor(repetitions/2)],uploads:values[0].uploads}]));reports.push({pieces:count,moving,median,runs});console.log(JSON.stringify({pieces:count,moving,median}));
}
if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify({baseline:ref,repetitions,method:'Median process CPU for 30 selected-outline draws, five repetitions with alternating order. Includes triangle construction and simulated GL calls only; excludes simulation, actual GPU work and DOM. Moving case changes yaw each draw. No browser FPS claim.',reports},null,2)+'\n');
