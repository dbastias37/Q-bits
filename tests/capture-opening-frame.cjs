// Execute the actual renderer with a WebGL command recorder, without a browser.
// The companion Python script replays these commands on real GLES.
const fs=require('node:fs'),path=require('node:path');
const opening=require('../assets/js/opening.js');
const output=process.argv[2]||'/tmp/qbits-opening-frames/commands.json';
const width=Number(process.argv[3])||1280,height=Number(process.argv[4])||720;
const constants={VERTEX_SHADER:0x8b31,FRAGMENT_SHADER:0x8b30,COMPILE_STATUS:0x8b81,LINK_STATUS:0x8b82,ARRAY_BUFFER:0x8892,STATIC_DRAW:0x88e4,FLOAT:0x1406,TRIANGLES:4,LINES:1,DEPTH_TEST:0xb71,BLEND:0xbe2,CULL_FACE:0xb44,COLOR_BUFFER_BIT:0x4000,DEPTH_BUFFER_BIT:0x100,SRC_ALPHA:0x302,ONE_MINUS_SRC_ALPHA:0x303,ONE:1};
let id=0,frameCommands=[],bound=null,current=null,nextFrame=0,depthWritable=true;
const init=[],frames=new Map(),snapshots=[],buffers=new Map(),attribs=new Map(),enabled=new Set(),programAttribs=new Map(),validation=[];
const serialize=a=>ArrayBuffer.isView(a)?Array.from(a):a;
const record=(name,args)=>frameCommands.push([name,...args.map(serialize)]);
const create=kind=>{const h=++id;init.push(['create'+kind,h]);return h;};
const gl=new Proxy({...constants},{get(o,key){
 if(key in o)return o[key];
 if(key==='createShader')return type=>{const h=++id;init.push(['createShader',h,type]);return h;};
 if(key==='createProgram')return()=>create('Program');
 if(key==='createBuffer')return()=>create('Buffer');
 if(['shaderSource','compileShader','attachShader','linkProgram'].includes(key))return(...args)=>init.push([key,...args]);
 if(key==='getShaderParameter'||key==='getProgramParameter')return()=>true;
 if(key==='getShaderInfoLog'||key==='getProgramInfoLog')return()=>'';
 if(key==='getUniformLocation'||key==='getAttribLocation')return(p,name)=>{const loc=++id;init.push([key,loc,p,name]);if(key==='getAttribLocation'){if(!programAttribs.has(p))programAttribs.set(p,new Set());programAttribs.get(p).add(loc);}return loc;};
 if(key==='bufferData')return(target,data,usage)=>{if(!buffers.has(bound))init.push(['bindBuffer',target,bound],['bufferData',target,Array.from(data),usage]);else record('bufferData',[target,data,usage]);buffers.set(bound,data.byteLength);};
 if(key==='bindBuffer')return(...args)=>{bound=args[1];record(key,args);};
 if(key==='depthMask')return(value)=>{depthWritable=value;record(key,[value]);};
 if(key==='clear')return(mask)=>{if((mask&constants.DEPTH_BUFFER_BIT)&&!depthWritable)validation.push({error:'depth clear while writes disabled'});record(key,[mask]);};
 if(key==='useProgram')return(...args)=>{current=args[0];record(key,args);};
 if(key==='enableVertexAttribArray')return(loc)=>{enabled.add(loc);record(key,[loc]);};
 if(key==='disableVertexAttribArray')return(loc)=>{enabled.delete(loc);record(key,[loc]);};
 if(key==='vertexAttribPointer')return(loc,count,type,norm,stride,offset)=>{attribs.set(loc,{buffer:bound,count,stride,offset});record(key,[loc,count,type,norm,stride,offset]);};
 if(key==='drawArrays')return(mode,first,count)=>{for(const loc of enabled){const a=attribs.get(loc);if(!enabled.has(loc)||!a)throw Error('Missing active attribute '+loc);const end=a.offset+(first+count-1)*(a.stride||a.count*4)+a.count*4;if(end>buffers.get(a.buffer))validation.push({program:current,loc,required:end,bufferBytes:buffers.get(a.buffer)});}record(key,[mode,first,count]);};
 if(key.startsWith('delete'))return()=>{};
 return(...args)=>record(key,args);
}});
const win={devicePixelRatio:1,matchMedia:()=>({matches:false}),requestAnimationFrame(fn){frames.set(++nextFrame,fn);return nextFrame;},cancelAnimationFrame(n){frames.delete(n);}};
const doc={defaultView:win,hidden:false,fonts:{check:()=>false}};
const canvas={ownerDocument:doc,getContext:()=>gl,getBoundingClientRect:()=>({width,height}),addEventListener(){},removeEventListener(){}};
const scene=opening.create(canvas);
let now=100,frameStartProgram=null,surface=null;
function tick(){frameStartProgram=current;frameCommands=[];now+=1000/60;const batch=[...frames.values()];frames.clear();for(const fn of batch)fn(now);}
function save(name){snapshots.push({name,state:scene.getState(),surface,commands:[['viewport',0,0,width,height],...(frameStartProgram===null?[]:[['useProgram',frameStartProgram]]),...frameCommands]});}
for(const [p,name]of[[0,'loading-0'],[.5,'loading-50'],[1,'loading-100']]){scene.setProgress(p);scene.setReady(p===1);tick();save(name);}
scene.play({onFrame:value=>{if(!value.nearArrival&&value.opacity!==0)throw Error('Menu visible before white face fills the view');surface=value;}});
let ticks=0,formed=false,close=false;
while(scene.getState().phase!=='complete'&&ticks<60*65){tick();ticks++;
 const state=scene.getState();
 if(ticks===300)save('forming');
 if(state.phase==='glow'&&!formed){save('assembled');formed=true;}
 if(state.phase==='dive'&&!close){save('dive');close=true;}
 if(state.flightProgress>=.8&&!snapshots.some(s=>s.name==='approach'))save('approach');
 if(state.phase==='reveal'&&state.menuOpacity>.45&&!snapshots.some(s=>s.name==='reveal'))save('reveal');
 if(state.flightProgress>=.95&&!snapshots.some(s=>s.name==='focus'))save('focus');
}
if(scene.getState().phase!=='complete')throw Error('Formation did not finish');save('white');
scene.dispose();fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({width,height,init,snapshots,validation}));
console.log(JSON.stringify({output,frames:snapshots.map(s=>({name:s.name,...s.state})),activeAttributeErrors:validation.length}));
if(validation.length)process.exitCode=1;
