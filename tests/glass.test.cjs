const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(){
 const calls=[],live=new Map(),enabled=new Set(['DEPTH_TEST','CULL_FACE']);let id=0,error=0;
 const gl=new Proxy({
  getParameter:key=>key==='MAX_TEXTURE_SIZE'?4096:key==='BLEND_SRC_RGB'||key==='BLEND_SRC_ALPHA'?'ONE':'ZERO',
  getShaderParameter:()=>true,getProgramParameter:()=>true,getShaderInfoLog:()=>'',getAttribLocation:(_,name)=>name==='aScreen'?0:['aPosition','aNormal','aOptics'].indexOf(name),getUniformLocation:(_,name)=>name,
  isContextLost:()=>false,getError:()=>error,isEnabled:cap=>enabled.has(cap),enable:cap=>{enabled.add(cap);calls.push(['enable',cap]);},disable:cap=>{enabled.delete(cap);calls.push(['disable',cap]);},
  createShader:()=>{const x=++id;live.set(x,'shader');return x;},createProgram:()=>{const x=++id;live.set(x,'program');return x;},createTexture:()=>{const x=++id;live.set(x,'texture');return x;},createFramebuffer:()=>{const x=++id;live.set(x,'framebuffer');return x;},checkFramebufferStatus:()=>gl.FRAMEBUFFER_COMPLETE,createBuffer:()=>{const x=++id;live.set(x,'buffer');return x;},NO_ERROR:0
 },{get:(o,k)=>k in o?o[k]:/^[A-Z_0-9]+$/.test(k)?k:(...args)=>{calls.push([k,...args]);if(k.startsWith('delete'))live.delete(args[0]);}});
 const sandbox={window:{},Float32Array};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/js/glass.js'),'utf8'),sandbox);return {api:sandbox.window.QBitsGlass,gl,calls,live,enabled,fail(){error=1285;}};
}
const rectangle=[[40,40],[240,40],[240,160],[40,160]],panel={points:rectangle,thickness:10};
const area=points=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;
test('concave glass front triangulates around the radial hole without filling the gap',()=>{
 const {api}=setup(),points=[];
 for(let i=0;i<=24;i++){const a=Math.PI+i/24*Math.PI/3;points.push([400+Math.cos(a)*300,400+Math.sin(a)*300]);}
 for(let i=24;i>=0;i--){const a=Math.PI+i/24*Math.PI/3;points.push([400+Math.cos(a)*130,400+Math.sin(a)*130]);}
 const triangles=api.triangulate(points),sum=triangles.reduce((total,indices)=>total+area(indices.map(i=>points[i])),0);
 assert.equal(triangles.length,points.length-2);assert(Math.abs(sum-area(points))<.001);
 for(const indices of triangles){const center=[0,1].map(axis=>indices.reduce((s,i)=>s+points[i][axis],0)/3);assert(Math.hypot(center[0]-400,center[1]-400)>129,'no triangle crosses cancel hole');}
 const geometry=api.mesh(points,10);assert(geometry.every(Number.isFinite));assert.equal(geometry.length%24,0);assert(geometry.length/8<1500);
});
test('glass contours accept either winding, reject invalid input, and expose real cut sides plus antialias coverage',()=>{
 const {api}=setup(),forward=api.mesh(rectangle,10),reverse=api.mesh([...rectangle].reverse(),10);
 assert.equal(forward.length,reverse.length);assert(forward.every(Number.isFinite));
 let side=0,front=0,feather=0,maxY=0;
 for(let i=0;i<forward.length;i+=8){if(forward[i+5]===1)side++;if(forward[i+4]===0&&forward[i+5]===0)front++;if(forward[i+6]===0)feather++;maxY=Math.max(maxY,forward[i+1]);}
 assert(side>0&&front>0&&feather>0);assert(maxY>170,'thickness and soft rear shadow extend beyond front');
 assert.throws(()=>api.mesh([[0,0],[1,NaN],[2,2]],10));assert.throws(()=>api.mesh([[0,0],[1,1],[2,2]],10));
});
test('all glass panels share one GPU capture and reuse mesh buffers across hover',()=>{
 const {api,gl,calls,live,enabled}=setup(),effect=api.create(gl),panels=[panel,{...panel,points:rectangle.map(([x,y])=>[x+300,y])}];
 assert(effect.render(800,600,800,600,panels));assert.equal([...live.values()].filter(x=>x==='texture').length,3);
 assert.deepEqual(calls.filter(x=>x[0]==='texImage2D').map(x=>x.slice(4,6)),[[800,600],[200,150],[200,150]],'frost uses two small targets');
 assert.equal(calls.filter(x=>x[0]==='copyTexSubImage2D').length,1);assert.equal(calls.filter(x=>x[0]==='drawArrays').length,5);
 assert.deepEqual([...enabled].sort(),['CULL_FACE','DEPTH_TEST']);assert(calls.filter(x=>x[0]==='disableVertexAttribArray').length>=3);
 calls.length=0;assert(effect.render(800,600,800,600,panels.map(p=>({...p,hovered:true,opacity:.5}))));
 assert.equal(calls.filter(x=>x[0]==='bufferData').length,0);assert.equal(calls.filter(x=>x[0]==='texImage2D').length,0);
 assert(calls.some(x=>x[0]==='uniform1f'&&x[1]==='uOpacity'&&x[2]===.5));assert(!calls.some(x=>x[0]==='readPixels'));
 calls.length=0;assert(effect.render(1600,1200,800,600,panels));assert.deepEqual(calls.filter(x=>x[0]==='texImage2D').map(x=>x.slice(4,6)),[[1600,1200]],'HiDPI resizes the source but keeps CSS-scale frost buffers');
 effect.release();assert.deepEqual([...live.values()],['program','program'],'closed selector keeps only compiled shaders, no screen textures');
 assert(effect.render(800,600,800,600,[panel]));effect.dispose();assert.equal(live.size,0);
});
test('unsupported or failed allocation frees glass resources and enables a clean DOM fallback',()=>{
 const {api,gl,live,fail}=setup(),effect=api.create(gl);fail();assert.equal(effect.render(800,600,800,600,[panel]),false);assert(effect.failed);assert.equal(live.size,0);assert.equal(effect.render(800,600,800,600,[panel]),false);
 const next=setup(),tooLarge=next.api.create(next.gl);assert.equal(tooLarge.render(8000,600,800,600,[panel]),false);assert.equal(next.live.size,0);
 const copy=setup(),copyEffect=copy.api.create(copy.gl);assert(copyEffect.render(800,600,800,600,[panel]));copy.fail();assert.equal(copyEffect.render(800,600,800,600,[panel]),false,'a GPU capture error must not activate native glass');assert.equal(copy.live.size,0);
});
