const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const api=require('../assets/js/culling.js');

function shaderClip(point,camera,yaw,pitch,aspect,focal){
  const sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
  const x=point[0]-camera[0],y=point[1]-camera[1],z=point[2]-camera[2];
  const depth=-x*sy*cp+y*sp-z*cy*cp;
  return [(x*cy-z*sy)*focal/aspect,(x*sy*sp+y*cp+z*cy*sp)*focal,
    (60+.04)/(60-.04)*depth-2*60*.04/(60-.04),depth];
}
function clippedIn(c){return c[0]>=-c[3]&&c[0]<=c[3]&&c[1]>=-c[3]&&c[1]<=c[3]&&c[2]>=-c[3]&&c[2]<=c[3];}
function randomSource(){let seed=189138;return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}

test('culling module exposes the same API to browsers and Node',()=>{
  const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/js/culling.js'),'utf8'),sandbox);
  assert.equal(typeof sandbox.window.QBitsCulling.createFrustum,'function');
  assert.equal(sandbox.window.QBitsCulling.NEAR,.04);assert.equal(sandbox.window.QBitsCulling.FAR,60);
});
test('frustum rejects every outside plane and keeps intersecting sphere bounds',()=>{
  const f=api.createFrustum().set([0,0,0],0,0,1,1,0);
  for(const point of [[0,0,-1],[1,0,-1],[-1,0,-1],[0,1,-1],[0,-1,-1],[0,0,-.04],[0,0,-60]])assert(f.intersectsSphere(...point,0),String(point));
  for(const point of [[2,0,-1],[-2,0,-1],[0,2,-1],[0,-2,-1],[0,0,1],[0,0,-61]])assert(!f.intersectsSphere(...point,0),String(point));
  assert(f.intersectsSphere(1.1,0,-1,.1));assert(!f.intersectsSphere(1.3,0,-1,.1));
  assert(f.intersectsSphere(0,0,0,.05));assert(f.intersectsSphere(0,0,-60.1,.11));
  assert(f.intersectsSphere(20,0,-1,20)); // A large assembly can cross the view although its center is outside.
});
test('frustum point decisions match actual shader projection across yaw, pitch, FOV and aspect',()=>{
  const random=randomSource(),f=api.createFrustum();
  for(let scene=0;scene<100;scene++){
    const camera=[random()*20-10,random()*10,random()*20-10],yaw=random()*Math.PI*2,pitch=random()*2.8-1.4,aspect=.4+random()*2.5,focal=.5+random()*2.7;
    f.set(camera,yaw,pitch,aspect,focal,0);
    for(let p=0;p<200;p++){
      const point=[random()*140-70,random()*140-70,random()*140-70];
      assert.equal(f.intersectsSphere(...point,0),clippedIn(shaderClip(point,camera,yaw,pitch,aspect,focal)),`scene ${scene}, point ${p}`);
    }
  }
});
test('sphere culling never discards a sphere containing a shader-visible sampled point',()=>{
  const random=randomSource(),f=api.createFrustum(),camera=[3,1.7,-2];
  for(let scene=0;scene<20;scene++){
    const yaw=random()*6,pitch=random()*2-1,aspect=.5+random()*2,focal=.7+random()*2;
    f.set(camera,yaw,pitch,aspect,focal,0);
    for(let p=0;p<300;p++){
      const center=[random()*50-25,random()*20-10,random()*50-25],radius=random()*7;
      for(let s=0;s<12;s++){
        const azimuth=random()*Math.PI*2,vertical=random()*2-1,horizontal=Math.sqrt(1-vertical*vertical),r=radius*random();
        const point=[center[0]+r*horizontal*Math.cos(azimuth),center[1]+r*vertical,center[2]+r*horizontal*Math.sin(azimuth)];
        if(clippedIn(shaderClip(point,camera,yaw,pitch,aspect,focal)))assert(f.intersectsSphere(...center,radius));
      }
    }
  }
});
test('frustum has reusable planes, accepts vector cameras and fails open on unknown bounds',()=>{
  const f=api.createFrustum(),planes=f.planes;
  assert(f.intersectsSphere(0,0,10,0));
  assert.equal(f.set({x:0,y:0,z:0},Math.PI/2,0,1,1,0),f);assert(f.intersectsSphere(-2,0,0,.1));assert(!f.intersectsSphere(2,0,0,.1));
  f.set([0,0,0],0,0,1,1,0);assert.equal(f.planes,planes);
  assert(f.intersectsSphere(NaN,0,1,0));assert(f.intersectsSphere(0,0,1,Infinity));
  f.set([0,0,0],0,0,0,1,0);assert.equal(f.valid,false);assert(f.intersectsSphere(0,0,100,0));
});
test('guard band contains PSX rounded vertices near screen edges without expanding depth planes',()=>{
  const f=api.createFrustum(),camera=[0,0,0],width=320,height=180,jitter=1;
  const margin=api.psxGuardBand(width,height,jitter);
  assert.equal(api.psxGuardBand(width,height,0),0);assert(margin>0);
  f.set(camera,0,0,width/height,1,margin);
  for(let axis=0;axis<2;axis++)for(let sign of [-1,1])for(let n=0;n<=100;n++){
    const ndc=sign*(1+n*.0005),grid=(axis?height:width)/(1+jitter*7),snapped=Math.floor(ndc*grid+.5)/grid;
    if(Math.abs(snapped)<=1){const point=axis?[0,ndc,-1]:[ndc*width/height,0,-1];assert(f.intersectsSphere(...point,0));}
  }
  assert(!f.intersectsSphere(0,0,-61,0));assert(!f.intersectsSphere(0,0,1,0));
});
test('statistics use median and nearest-rank p95 without mutating or fabricating samples',()=>{
  const samples=[4,1,3,2,NaN,Infinity,-1];assert.deepEqual(api.summarize(samples),{count:4,mean:2.5,median:2.5,p95:4,min:1,max:4});
  assert.deepEqual(samples,[4,1,3,2,NaN,Infinity,-1]);assert.equal(api.summarize(Array.from({length:100},(_,i)=>i+1)).p95,95);
  assert.equal(api.summarize([0]).median,0);assert.equal(api.summarize([]).median,null);assert.equal(api.summarize([]).count,0);
});

function fakeGpu(version=1){
  let next=0,active=null,disjoint=false,lost=false;const live=new Set(),calls=[];
  const legacy={TIME_ELAPSED_EXT:1,CURRENT_QUERY_EXT:2,QUERY_RESULT_AVAILABLE_EXT:3,QUERY_RESULT_EXT:4,GPU_DISJOINT_EXT:5,
    createQueryEXT(){const q={id:++next,ready:false,ns:2500000};live.add(q);calls.push('create');return q;},
    deleteQueryEXT(q){live.delete(q);if(active===q)active=null;calls.push('delete');},
    beginQueryEXT(target,q){assert.equal(target,1);assert.equal(active,null);active=q;q.ready=false;calls.push('begin');},
    endQueryEXT(target){assert.equal(target,1);assert(active);active=null;calls.push('end');},
    getQueryEXT(target,key){assert.equal(target,1);assert.equal(key,2);return active;},
    getQueryObjectEXT(q,key){assert(key===3||key===4);calls.push(key===3?'available':'result');if(key===3)return q.ready;assert(q.ready,'must not read unavailable query');return q.ns;}};
  // WebGL2 exposes neither query methods nor result enums on its extension.
  // Use different core enum values to catch accidental WebGL1 API mixing.
  const ext=version===2?{TIME_ELAPSED_EXT:1,GPU_DISJOINT_EXT:5}:legacy;
  const gl={getExtension:name=>{assert.equal(name,version===2?'EXT_disjoint_timer_query_webgl2':'EXT_disjoint_timer_query');return ext;},
    getParameter:key=>{assert.equal(key,5);return disjoint;},isContextLost:()=>lost};
  if(version===2)Object.assign(gl,{CURRENT_QUERY:12,QUERY_RESULT_AVAILABLE:13,QUERY_RESULT:14,
    createQuery(){assert.equal(this,gl);return legacy.createQueryEXT();},
    deleteQuery(q){assert.equal(this,gl);legacy.deleteQueryEXT(q);},
    beginQuery(target,q){assert.equal(this,gl);legacy.beginQueryEXT(target,q);},
    endQuery(target){assert.equal(this,gl);legacy.endQueryEXT(target);},
    getQuery(target,key){assert.equal(this,gl);assert.equal(key,12);return legacy.getQueryEXT(target,2);},
    getQueryParameter(q,key){assert.equal(this,gl);assert(key===13||key===14);return legacy.getQueryObjectEXT(q,key===13?3:4);}});
  return {gl,ext,live,calls,ready(ns=2500000){for(const q of live){q.ready=true;q.ns=ns;}},disjoint(v){disjoint=v;},lost(v){lost=v;},get created(){return next;},
    beginOutside(){const q=legacy.createQueryEXT();legacy.beginQueryEXT(1,q);return q;},
    endOutside(q){legacy.endQueryEXT(1);legacy.deleteQueryEXT(q);}};
}
for(const version of [1,2]){
test(`WebGL${version} GPU timer bounds pending queries, polls asynchronously, converts ns and reuses queries`,()=>{
  const gpu=fakeGpu(version),timer=api.createGpuTimer(gpu.gl,2);assert(timer.supported);
  assert(timer.begin());assert(!timer.begin());assert(timer.end());assert.equal(timer.poll(),null);assert.equal(timer.latestMs,null);
  assert(!gpu.calls.includes('result'),'polling must not read an unavailable result');
  assert(timer.begin());assert(timer.end());assert(!timer.begin());assert.equal(gpu.created,2);assert.equal(timer.pendingCount,2);
  gpu.ready();assert.equal(timer.poll(),2.5);assert.equal(timer.poll(),2.5);assert.equal(timer.poll(),null);assert.equal(timer.sampleCount,2);
  assert(timer.begin());assert(timer.end());assert.equal(gpu.created,2);assert.equal(timer.pendingCount,1);
  gpu.ready(2**32+2500000);assert.equal(timer.poll(),(2**32+2500000)/1e6,'elapsed nanoseconds must not be truncated to 32 bits');
  timer.dispose();assert.equal(gpu.live.size,0);assert(!timer.supported);assert(!timer.begin());
});
test(`WebGL${version} GPU disjoint drops all outstanding readings, then clean sampling resumes`,()=>{
  const gpu=fakeGpu(version),timer=api.createGpuTimer(gpu.gl,3);
  timer.begin();timer.end();gpu.ready();assert.equal(timer.poll(),2.5);
  timer.begin();timer.end();timer.begin();timer.end();gpu.ready();gpu.disjoint(true);
  assert.equal(timer.poll(),null);assert.equal(timer.latestMs,null);assert.equal(timer.pendingCount,0);assert.equal(gpu.live.size,0);
  gpu.disjoint(false);assert(timer.begin());assert(timer.end());gpu.ready();assert.equal(timer.poll(),2.5);
  assert(timer.begin());gpu.disjoint(true);assert.equal(timer.poll(),null);assert(!timer.end());assert.equal(gpu.live.size,0);
  gpu.disjoint(false);assert(timer.begin());assert(timer.end());gpu.ready();assert.equal(timer.poll(),2.5);
  timer.dispose();assert.equal(gpu.live.size,0);
});
test(`WebGL${version} GPU timer preserves outside queries and disables on context loss`,()=>{
  const gpu=fakeGpu(version),timer=api.createGpuTimer(gpu.gl),outside=gpu.beginOutside();
  assert(!timer.begin());assert(gpu.live.has(outside));assert.equal(gpu.created,1);gpu.endOutside(outside);
  assert(timer.begin());gpu.lost(true);assert.equal(timer.poll(),null);assert(!timer.supported);assert.equal(gpu.live.size,0);
  gpu.lost(false);assert(!timer.begin(),'lost-context queries must not be reused');
});
test(`WebGL${version} GPU timer rejects a query ended after context loss`,()=>{
  const gpu=fakeGpu(version),timer=api.createGpuTimer(gpu.gl);assert(timer.begin());gpu.lost(true);
  assert(!timer.end());assert.equal(timer.pendingCount,0);assert.equal(timer.latestMs,null);assert.equal(timer.sampleCount,0);
  assert(!timer.supported);assert.equal(gpu.live.size,0);assert(!gpu.calls.includes('result'));
});
test(`WebGL${version} GPU query errors release all measurements without breaking rendering`,()=>{
  const gpu=fakeGpu(version),timer=api.createGpuTimer(gpu.gl,2);
  assert(timer.supported);assert(timer.begin());assert(timer.end());assert(timer.begin());assert(timer.end());gpu.ready();
  if(version===2)gpu.gl.getQueryParameter=()=>{throw Error('query unavailable');};
  else gpu.ext.getQueryObjectEXT=()=>{throw Error('query unavailable');};
  assert.equal(timer.poll(),null);assert(!timer.supported);assert.equal(gpu.live.size,0);assert.equal(timer.pendingCount,0);
  assert.equal(timer.latestMs,null);assert(!timer.begin());timer.dispose();
});
}
test('GPU timing stays optional without its extension or the complete query API',()=>{
  const gpu=fakeGpu(2);gpu.gl.getExtension=()=>null;
  const partial=fakeGpu(2);delete partial.gl.getQueryParameter;
  for(const gl of [{getExtension:()=>null},{getExtension:()=>{throw Error('unsupported');}},gpu.gl,partial.gl]){
    const unsupported=api.createGpuTimer(gl);assert(!unsupported.supported);assert(!unsupported.begin());assert(!unsupported.end());assert.equal(unsupported.poll(),null);unsupported.dispose();
  }
  assert.equal(gpu.created,0);assert.equal(partial.created,0);
});
