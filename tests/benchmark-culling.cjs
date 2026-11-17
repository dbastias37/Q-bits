#!/usr/bin/env node
'use strict';

// Reproducible render-submission benchmark. Cannon and the game's JavaScript
// are real; DOM and every WebGL call are simulated. This does NOT measure GPU
// performance, frame rate, browser input, physics throughput, or visual quality.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const createGame=require('./game-harness.cjs'),Culling=require('../assets/js/culling.js');
const root=path.resolve(__dirname,'..'),output=path.join(root,'docs/benchmarks/culling-20261117.json');
const source=fs.readFileSync(path.join(root,'assets/js/game.js'),'utf8');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourceFiles=['assets/js/game.js','assets/js/culling.js','assets/js/preferences.js','assets/js/graphics.js','tests/game-harness.cjs','tests/benchmark-culling.cjs'];
const sourceHashes=Object.fromEntries(sourceFiles.map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]));
const warmup=5,samplesPerPhase=10,order=[false,true,true,false];

function makeGL(){
  let id=0,bound=null,enumId=40000;const live=new Set(),attributes=new Map();
  const frame={calls:0,triangles:0,lines:0,uploads:0,uploadedBytes:0};
  const constants={TRIANGLES:4,LINES:1,TRIANGLE_STRIP:5,FRAMEBUFFER_COMPLETE:36053,NO_ERROR:0};
  const gl=new Proxy({
    ...constants,getShaderParameter:()=>true,getProgramParameter:()=>true,getExtension:()=>null,
    getParameter:()=>8192,getError:()=>0,isContextLost:()=>false,checkFramebufferStatus:()=>36053,
    createShader:()=>++id,createProgram:()=>++id,createTexture:()=>++id,createFramebuffer:()=>++id,createRenderbuffer:()=>++id,
    createBuffer(){const next=++id;live.add(next);return next;},deleteBuffer(value){live.delete(value);},
    bindBuffer(_,value){bound=value;},
    bufferData(_,data){assert(live.has(bound),'upload requires a real distinct mock buffer');frame.uploads++;frame.uploadedBytes+=data.byteLength||0;},
    bufferSubData(_,offset,data){assert(live.has(bound));frame.uploads++;frame.uploadedBytes+=data.byteLength||0;},
    getAttribLocation(_,name){if(!attributes.has(name))attributes.set(name,attributes.size);return attributes.get(name);},
    getUniformLocation:(_,name)=>name,
    drawArrays(mode,first,count){
      assert(Number.isInteger(first)&&Number.isInteger(count)&&first>=0&&count>=0);
      frame.calls++;
      if(mode===4)frame.triangles+=count/3;
      else if(mode===5)frame.triangles+=Math.max(0,count-2);
      else if(mode===1)frame.lines+=count/2;
      else throw Error('Unexpected primitive mode '+mode);
    }
  },{get(target,key){if(key in target)return target[key];if(/^[A-Z_0-9]+$/.test(key))return target[key]=++enumId;return ()=>{};}});
  return {gl,frame,reset(){frame.calls=frame.triangles=frame.lines=frame.uploads=frame.uploadedBytes=0;},live};
}

function fixture(){
  const gpu=makeGL(),game=createGame({gl:gpu.gl,graphics:false,gameSource:source}),{t}=game;
  t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle',transition:false});
  t.canvas.width=1280;t.canvas.height=720;
  t.setLook({camera:[0,1.7,0],yaw:0,pitch:-.12});
  Object.assign(t.getVisuals(),{shadows:'soft',bloom:false,dither:0,bits:8,jitter:0});
  t.cullingLab.stats=true;t.cullingLab.observer=false;
  // This script measures renderScene only. No frame scheduler or world step is
  // called, and HUD refresh is excluded from the measured render submission.
  t.cullingLab.nextHud=Infinity;
  return {...game,gpu};
}

function looseScene(t,count,behindFraction){
  const behind=Math.round(count*behindFraction),front=count-behind;
  for(let i=0;i<count;i++){
    const back=i>=front,local=back?i-front:i,n=back?behind:front,columns=Math.min(32,Math.ceil(Math.sqrt(n)));
    const x=(local%columns-(columns-1)/2)*.18,z=(5+Math.floor(local/columns)*.12)*(back?1:-1);
    t.addQubit([x,.045,z]);
  }
}
function assemblyScene(t,count,placement){
  const parts=[],columns=40;
  for(let i=0;i<count;i++)parts.push({id:t.allocateUnitId(),weight:1,shape:'cube',q:t.Q(),
    p:t.V((i%columns-(columns-1)/2)*.12+(placement==='edge'?9:0),.045,(5+Math.floor(i/columns)*.12)*(placement==='behind'?1:-1))});
  const group=t.makeGroup(parts);assert.equal(group.block,null,'assembly must exercise irregular rigid batching');
}
function immutableState(t){
  return hash(JSON.stringify(t.groups.map(g=>({p:g.body.position,q:g.body.quaternion,v:g.body.velocity,w:g.body.angularVelocity,
    parts:g.parts.map(p=>({id:p.id,shape:p.shape,weight:p.weight,offset:p.offset,q:p.q,energy:p.mood.energy}))}))));
}
function summarizeRows(rows){
  const measure=key=>Culling.summarize(rows.map(r=>r[key]));
  return {samples:rows.length,cpuJsRenderMs:measure('cpuMs'),drawCalls:measure('calls'),trianglesSubmitted:measure('triangles'),
    groupsOmitted:measure('culled'),piecesOmitted:measure('hiddenPieces'),bufferUploads:measure('uploads'),uploadedBytes:measure('uploadedBytes'),
    rawCpuJsRenderMs:rows.map(r=>r.cpuMs)};
}
function compare(name,setup,description){
  const {t,gpu}=fixture();setup(t);const before=immutableState(t),off=[],on=[];
  let time=0;
  for(const enabled of order){
    t.getVisuals().culling=enabled;
    for(let sample=-warmup;sample<samplesPerPhase;sample++){
      gpu.reset();t.renderScene(time+=16.6666667);
      const measured=t.cullingLab.last;
      assert(measured,'render stats must exist');
      assert.equal(measured.calls,gpu.frame.calls,'in-game draw count differs from independent GL mock');
      assert.equal(measured.triangles,gpu.frame.triangles,'in-game triangle count differs from independent GL mock');
      assert.equal(t.renderCounts.lines,gpu.frame.lines,'in-game line count differs from independent GL mock');
      if(sample>=0)(enabled?on:off).push({...measured,uploads:gpu.frame.uploads,uploadedBytes:gpu.frame.uploadedBytes});
    }
  }
  assert.equal(immutableState(t),before,'A/B rendering must not change transforms, velocities, identity, mass or energy');
  const a=summarizeRows(off),b=summarizeRows(on),pieces=t.groups.reduce((sum,g)=>sum+g.parts.length,0);
  const result={name,description,pieces,groups:t.groups.length,camera:t.getLook(),focal:t.heldFocus.focal,off:a,on:b,
    change:{drawCallsSaved:a.drawCalls.median-b.drawCalls.median,drawCallsSavedPercent:100*(1-b.drawCalls.median/a.drawCalls.median),
      trianglesSaved:a.trianglesSubmitted.median-b.trianglesSubmitted.median,trianglesSavedPercent:100*(1-b.trianglesSubmitted.median/a.trianglesSubmitted.median),
      cpuJsRenderMedianDeltaMs:b.cpuJsRenderMs.median-a.cpuJsRenderMs.median},frozenStateVerified:true,drawCountersIndependentlyVerified:true};
  process.stderr.write(`${name}: calls ${a.drawCalls.median} -> ${b.drawCalls.median}; triangles ${a.trianglesSubmitted.median} -> ${b.trianglesSubmitted.median}; JS p50 ${a.cpuJsRenderMs.median.toFixed(3)} -> ${b.cpuJsRenderMs.median.toFixed(3)} ms\n`);
  return result;
}

function sphereMathBenchmark(){
  const f=Culling.createFrustum().set([0,1.7,0],0,-.12,1280/720,1.48256097,.02),data=new Float64Array(2000*4),samples=[];
  for(let i=0;i<2000;i++){data[i*4]=(i%32-15.5)*.18;data[i*4+1]=.045;data[i*4+2]=-(5+Math.floor(i/32)*.12);data[i*4+3]=.1;}
  let visible=0;
  for(let run=-20;run<100;run++){
    const start=performance.now();visible=0;
    for(let i=0;i<data.length;i+=4)if(f.intersectsSphere(data[i],data[i+1],data[i+2],data[i+3]))visible++;
    const ms=performance.now()-start;if(run>=0)samples.push(ms);
  }
  assert.equal(visible,2000);
  return {scope:'Only 2000 all-front intersectsSphere calls per sample; excludes game loops, bounds calculation, draw submission and GPU.',
    spheresPerSample:2000,samples:samples.length,warmup:20,visible,jsMs:Culling.summarize(samples)};
}

const results=[];
for(const count of [80,500,2000])for(const [label,fraction]of [['all-front',0],['half-behind',.5],['90pct-behind',.9]]){
  results.push(compare(`loose-${count}-${label}`,t=>looseScene(t,count,fraction),`${count} separate cube bodies, ${fraction*100}% behind the player; static render-only snapshot.`));
}
for(const placement of ['front','behind','edge'])results.push(compare(`assembly-2000-${placement}`,t=>assemblyScene(t,2000,placement),
  `One irregular rigid assembly of 2000 cubes ${placement==='edge'?'crossing the right frustum boundary':placement==='behind'?'behind the player':'in front of the player'}; cached rigid mesh and per-piece soft shadows.`));

const changedDuringRun=sourceFiles.filter(file=>sourceHashes[file]!==hash(fs.readFileSync(path.join(root,file))));
const report={schemaVersion:1,generatedAt:new Date().toISOString(),scope:'Headless JavaScript render submission and exact primitive counts; not GPU time, browser FPS, CPU utilization or physics throughput.',
  method:{renderer:'Actual Q-bits custom WebGL1 renderScene in tests/game-harness.cjs',dom:'simulated',webgl:'simulated; unique buffer IDs and distinct primitive enums',physics:'Cannon loaded but never advanced',
    gpuTime:null,fps:null,viewport:{width:1280,height:720},shadows:'soft',postprocessing:false,jitter:0,observer:false,stats:true,
    phases:order.map(enabled=>enabled?'ON':'OFF'),warmupPerPhase:warmup,measuredPerPhase:samplesPerPhase,samplesPerMode:20,
    percentile:'nearest rank p95; even-sized median is mean of two central samples',hudRefreshDuringMeasurement:false},
  environment:{node:process.version,platform:process.platform,arch:process.arch,cpuModel:os.cpus()[0]?.model||null,logicalCpus:os.cpus().length},
  sourceHashes,sourceFilesChangedDuringRun:changedDuringRun,
  limitations:['GL stubs do not compile shaders or execute GPU commands.','Timing includes JavaScript and assertion/mock-call overhead; it is environment-dependent and includes GC/JIT noise.',
    'All-front cases expose culling overhead; no improvement is guaranteed when everything is visible.','Physics and production performance are outside this benchmark.',
    'Bounds discard complete assemblies conservatively; a visible fragment can retain the entire assembly.','Actual browser A/B and player hardware measurements remain necessary.'],
  sphereMath:sphereMathBenchmark(),results};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(path.relative(root,output));
if(changedDuringRun.length)process.stderr.write('NOTICE: source files changed during this run: '+changedDuringRun.join(', ')+'. Re-run against final source before publishing numbers.\n');
