const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(){
 const calls=[],live=new Map();let id=0,current=0,failFramebuffer=false;
 const gl=new Proxy({
  getParameter:()=>4096,getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0,getUniformLocation:(_,name)=>name,
  checkFramebufferStatus:()=>failFramebuffer?-1:gl.FRAMEBUFFER_COMPLETE,
  createShader:()=>++id,createProgram:()=>{const x=++id;live.set(x,'program');return x;},
  createTexture:()=>{const x=++id;live.set(x,'texture');return x;},createFramebuffer:()=>{const x=++id;live.set(x,'framebuffer');return x;},createRenderbuffer:()=>{const x=++id;live.set(x,'depth');return x;},createBuffer:()=>{const x=++id;live.set(x,'buffer');return x;},
  useProgram:p=>{current=p;calls.push(['useProgram',p]);}
 },{get:(o,k)=>k in o?o[k]:/^[A-Z_0-9]+$/.test(k)?k:(...args)=>{calls.push([k,...args]);if(k.startsWith('delete'))live.delete(args[0]);}});
 const sandbox={window:{},Float32Array,Uint8Array};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/js/graphics.js'),'utf8'),sandbox);return {api:sandbox.window.QBitsGraphics,gl,calls,live,fail(){failFramebuffer=true;}};
}
const neon={style:'neon',filter:'linear',bloom:true,bloomStrength:60,dither:35,bits:6};
test('bloom reuses two half-resolution buffers and releases them when disabled',()=>{
 const {api,gl,calls,live}=setup(),effect=api.create(gl);
 assert(effect.begin(800,600,neon));let sizes=calls.filter(c=>c[0]==='texImage2D').map(c=>c.slice(4,6));assert.deepEqual(sizes,[[800,600],[400,300],[400,300]]);
 const count=live.size;effect.end(neon);assert.equal(calls.filter(c=>c[0]==='drawArrays').length,3);assert(calls.some(c=>c[0]==='uniform1f'&&c[1]==='uAA'&&c[2]===1));
 calls.length=0;effect.begin(800,600,neon);effect.end(neon);assert.equal(live.size,count);assert.equal(calls.filter(c=>c[0]==='texImage2D').length,0);
 effect.begin(800,600,{...neon,bloom:false});assert.equal([...live.values()].filter(v=>v==='texture').length,1);
 effect.begin(800,600,{...neon,bloom:false,dither:0,bits:8});assert.equal(live.size,0);
});
test('bloom resize replaces halo resources, preserves pixel-art sampling and handles allocation failure',()=>{
 const {api,gl,calls,live,fail}=setup(),effect=api.create(gl);effect.begin(800,600,neon);const count=live.size;calls.length=0;
 effect.begin(400,300,neon);assert.equal(live.size,count);assert.deepEqual(calls.filter(c=>c[0]==='texImage2D').map(c=>c.slice(4,6)),[[400,300],[200,150],[200,150]]);
 calls.length=0;effect.end({...neon,style:'psx'});assert(calls.some(c=>c[0]==='uniform1f'&&c[1]==='uAA'&&c[2]===0));
 fail();assert.equal(effect.begin(900,600,neon),null);assert(effect.failed);assert.equal(live.size,0);assert.equal(effect.begin(800,600,neon),null);
});
