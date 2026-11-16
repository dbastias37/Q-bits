// Run the production furniture renderer with a WebGL recorder. The Python
// companion replays these exact shaders, buffers and draws on real GLES.
const fs=require('node:fs'),path=require('node:path'),createGame=require('./game-harness.cjs');
const output=process.argv[2]||'/tmp/qbits-furniture/commands.json',width=Number(process.argv[3])||640,height=Number(process.argv[4])||480;
const constants={VERTEX_SHADER:0x8b31,FRAGMENT_SHADER:0x8b30,COMPILE_STATUS:0x8b81,LINK_STATUS:0x8b82,ARRAY_BUFFER:0x8892,STATIC_DRAW:0x88e4,DYNAMIC_DRAW:0x88e8,FLOAT:0x1406,TRIANGLES:4,LINES:1,DEPTH_TEST:0xb71,BLEND:0xbe2,CULL_FACE:0xb44,COLOR_BUFFER_BIT:0x4000,DEPTH_BUFFER_BIT:0x100,SRC_ALPHA:0x302,ONE_MINUS_SRC_ALPHA:0x303,ONE:1,ZERO:0,LESS:0x201,LEQUAL:0x203,MAX_TEXTURE_SIZE:0xd33,FRAMEBUFFER:0x8d40,TEXTURE0:0x84c0,TEXTURE_2D:0xde1};
let next=0,commands=[],bound=null,current=null,depthWritable=true;
const locations=new Map(),buffers=new Map(),attributes=new Map(),enabled=new Set(),validation=[];
const serialize=value=>ArrayBuffer.isView(value)?Array.from(value):value;
const record=(name,args)=>commands.push([name,...args.map(serialize)]);
const gl=new Proxy({...constants},{get(target,name){
 if(name in target)return target[name];
 if(name==='getShaderParameter'||name==='getProgramParameter')return()=>true;
 if(name==='getShaderInfoLog'||name==='getProgramInfoLog')return()=>'';
 if(name==='getError')return()=>0;
 if(name==='getParameter')return()=>8192;
 if(name==='getExtension')return()=>null;
 if(name==='getSupportedExtensions')return()=>[];
 if(name==='isContextLost')return()=>false;
 if(name==='createShader'||name==='createProgram'||name==='createBuffer')return(...args)=>{const id=++next;record(name,[id,...args]);return id;};
 if(name==='getUniformLocation'||name==='getAttribLocation')return(program,key)=>{const id=++next;record(name,[id,program,key]);if(name==='getUniformLocation')locations.set(key,id);return id;};
 if(name==='bindBuffer')return(...args)=>{bound=args[1];record(name,args);};
 if(name==='bufferData')return(...args)=>{buffers.set(bound,args[1].byteLength);record(name,args);};
 if(name==='useProgram')return(...args)=>{current=args[0];record(name,args);};
 if(name==='enableVertexAttribArray')return(location)=>{enabled.add(location);record(name,[location]);};
 if(name==='disableVertexAttribArray')return(location)=>{enabled.delete(location);record(name,[location]);};
 if(name==='vertexAttribPointer')return(location,count,type,normalized,stride,offset)=>{attributes.set(location,{buffer:bound,count,stride,offset});record(name,[location,count,type,normalized,stride,offset]);};
 if(name==='depthMask')return(value)=>{depthWritable=value;record(name,[value]);};
 if(name==='clear')return(mask)=>{if(mask&constants.DEPTH_BUFFER_BIT&&!depthWritable)validation.push('depth clear while writes disabled');record(name,[mask]);};
 if(name==='drawArrays')return(mode,first,count)=>{for(const location of enabled){const a=attributes.get(location);if(!a)throw Error('Missing attribute');const end=a.offset+(first+count-1)*(a.stride||a.count*4)+a.count*4;if(end>buffers.get(a.buffer))validation.push({program:current,location,required:end,buffer:buffers.get(a.buffer)});}record(name,[mode,first,count]);};
 if(name.startsWith('delete'))return()=>{};
 return(...args)=>record(name,args);
}});
const {t,sandbox}=createGame({gl,graphics:false});Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});
const init=commands;commands=[];const snapshots=[];
function uniform(name,value){gl.uniform1f(locations.get(name),value);}
function reset(){t.removeWorkshop();for(const wall of t.storyWorld.walls)t.world.removeBody(wall.body);t.storyWorld.walls.length=0;t.storyWorld.details=[];t.storyWorld.target=null;t.storyWorld.door=null;}
function shelfAt(p,q=t.Q()){
 const model=sandbox.QBitsFurniture.shelf();for(const part of model.parts)t.storyWall(p.vadd(q.vmult(t.V(...part.p))),t.V(...part.half),{q:q.mult(new sandbox.CANNON.Quaternion(...part.q)),color:part.color.slice(0,3)});return model;
}
function fixture(name,mode,eye,target){
 reset();let model;
 if(mode==='desk')t.setupWorkshop();
 else if(mode==='shelf')model=shelfAt(t.V());
 else {const bench=t.setupWorkshop();shelfAt(bench.p.vadd(t.V(0,.4,-.6)));}
 commands=[];gl.viewport(0,0,width,height);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.clearColor(.93,.95,.94,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 const delta=target.map((v,i)=>v-eye[i]),distance=Math.hypot(...delta),yaw=Math.atan2(-delta[0],-delta[2]),pitch=Math.asin(delta[1]/distance),focal=1.9;
 gl.uniform3fv(locations.get('uCamera'),eye);gl.uniform2f(locations.get('uLook'),yaw,pitch);uniform('uAspect',width/height);uniform('uFocal',focal);uniform('uFocusMask',0);uniform('uTextureMix',0);uniform('uTextureScale',1);uniform('uWarp',0);uniform('uCel',0);uniform('uJitter',0);uniform('uLighting',.5);uniform('uGlow',0);uniform('uTime',1);
 gl.uniform2f(locations.get('uResolution'),width,height);gl.uniform3fv(locations.get('uLightPos[0]'),Array(12).fill(0));gl.uniform3fv(locations.get('uLightColor[0]'),Array(12).fill(0));
 t.drawStoryWorld();t.drawWorkshop();
 const project=p=>{const rel=p.map((v,i)=>v-eye[i]),right=[Math.cos(yaw),0,-Math.sin(yaw)],up=[Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),Math.cos(yaw)*Math.sin(pitch)],forward=[-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)],dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),depth=dot(rel,forward);return [(1+dot(rel,right)*focal/(width/height)/depth)*width/2,(1+dot(rel,up)*focal/depth)*height/2];};
 snapshots.push({name,mode,commands,holes:name==='shelf-front'?model.cells.map(c=>project(c.p)):[],beams:name==='shelf-front'?model.parts.map(p=>project([p.p[0],p.p[1],.24])):[]});
}
fixture('desk-front','desk',[-.35,1.3,3.3],[-1.75,.3,1.3]);
fixture('desk-rear','desk',[-2.95,1.15,-.7],[-1.75,.3,1.3]);
fixture('shelf-front','shelf',[0,.49,2.1],[0,.49,0]);
fixture('shelf-perspective','shelf',[1.4,1.2,2.5],[0,.49,.12]);
fixture('workshop-furniture','both',[-.05,1.7,3.8],[-1.75,.85,1.15]);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({width,height,init,snapshots,validation}));
console.log(JSON.stringify({output,frames:snapshots.length,validationErrors:validation.length}));if(validation.length)process.exitCode=1;
