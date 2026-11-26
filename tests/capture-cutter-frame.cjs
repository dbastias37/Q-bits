// Run the production cutter renderer with a WebGL recorder. The Python
// companion replays these exact shaders, buffers and draws on real GLES.
const fs=require('node:fs'),path=require('node:path'),createGame=require('./game-harness.cjs');
const output=process.argv[2]||'/tmp/qbits-cutter/commands.json',width=Number(process.argv[3])||960,height=Number(process.argv[4])||720;
const renderBackend=process.env.QBITS_RENDER_BACKEND||'webgl1';
const constants={VERTEX_SHADER:0x8b31,FRAGMENT_SHADER:0x8b30,COMPILE_STATUS:0x8b81,LINK_STATUS:0x8b82,ARRAY_BUFFER:0x8892,STATIC_DRAW:0x88e4,DYNAMIC_DRAW:0x88e8,FLOAT:0x1406,TRIANGLES:4,LINES:1,DEPTH_TEST:0xb71,BLEND:0xbe2,CULL_FACE:0xb44,COLOR_BUFFER_BIT:0x4000,DEPTH_BUFFER_BIT:0x100,SRC_ALPHA:0x302,ONE_MINUS_SRC_ALPHA:0x303,ONE:1,ZERO:0,LESS:0x201,LEQUAL:0x203,MAX_TEXTURE_SIZE:0xd33,FRAMEBUFFER:0x8d40,TEXTURE0:0x84c0,TEXTURE_2D:0xde1};
let next=0,commands=[],bound=null,current=null,depthWritable=true;
const locations=new Map(),attributeKeys=new Map(),buffers=new Map(),validation=[];
let attributes=new Map(),enabled=new Set(),activeArray=null;
const vertexArrays=new Map([[null,{attributes,enabled}]]);
const serialize=value=>ArrayBuffer.isView(value)?Array.from(value):value;
const record=(name,args)=>commands.push([name,...args.map(serialize)]);
const vertexArrayAPI={
 createVertexArray(){const id=++next;vertexArrays.set(id,{attributes:new Map(),enabled:new Set()});record('createVertexArray',[id]);return id;},
 bindVertexArray(id){if(!vertexArrays.has(id))throw Error('Missing vertex array');activeArray=id;({attributes,enabled}=vertexArrays.get(id));record('bindVertexArray',[id]);},
 deleteVertexArray(id){if(activeArray===id){activeArray=null;({attributes,enabled}=vertexArrays.get(null));}vertexArrays.delete(id);record('deleteVertexArray',[id]);}
};
const gl=new Proxy({...constants,...(renderBackend==='webgl2'?vertexArrayAPI:{})},{get(target,name){
 if(name in target)return target[name];
 if(name==='getShaderParameter'||name==='getProgramParameter')return()=>true;
 if(name==='getShaderInfoLog'||name==='getProgramInfoLog')return()=>'';
 if(name==='getError')return()=>0;
 if(name==='getParameter')return()=>8192;
 if(name==='getExtension')return name=>name==='OES_vertex_array_object'&&renderBackend==='webgl1-vao'?{createVertexArrayOES:vertexArrayAPI.createVertexArray,bindVertexArrayOES:vertexArrayAPI.bindVertexArray,deleteVertexArrayOES:vertexArrayAPI.deleteVertexArray}:null;
 if(name==='getSupportedExtensions')return()=>[];
 if(name==='isContextLost')return()=>false;
 if(name==='createShader'||name==='createProgram'||name==='createBuffer')return(...args)=>{const id=++next;record(name,[id,...args]);return id;};
 if(name==='getUniformLocation'||name==='getAttribLocation')return(program,key)=>{const signature=program+':'+key;if(name==='getAttribLocation'&&attributeKeys.has(signature))return attributeKeys.get(signature);const id=++next;record(name,[id,program,key]);if(name==='getUniformLocation')locations.set(key,id);else attributeKeys.set(signature,id);return id;};
 if(name==='bindBuffer')return(...args)=>{bound=args[1];record(name,args);};
 if(name==='bufferData')return(...args)=>{buffers.set(bound,args[1].byteLength);record(name,args);};
 if(name==='bufferSubData')return(...args)=>{if(args[1]+args[2].byteLength>buffers.get(bound))validation.push('upload exceeds persistent buffer');record(name,args);};
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
const {t,sandbox}=createGame({gl,graphics:false,webgl2:renderBackend==='webgl2'});t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});
const init=commands;commands=[];const snapshots=[];
function uniform(name,value){gl.uniform1f(locations.get(name),value);}
function lab(){t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});}
function capture(name,eye,target,draw,details={}){
 commands=[];gl.viewport(0,0,width,height);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.clearColor(.93,.95,.94,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 const delta=target.map((v,i)=>v-eye[i]),distance=Math.hypot(...delta),yaw=Math.atan2(-delta[0],-delta[2]),pitch=Math.asin(delta[1]/distance);
 gl.uniform3fv(locations.get('uCamera'),eye);gl.uniform2f(locations.get('uLook'),yaw,pitch);uniform('uAspect',width/height);uniform('uFocal',1.9);uniform('uFocusMask',0);uniform('uTextureMix',0);uniform('uTextureScale',1);uniform('uWarp',0);uniform('uCel',0);uniform('uJitter',0);uniform('uLighting',.5);uniform('uGlow',0);uniform('uTime',1);
 gl.uniform2f(locations.get('uResolution'),width,height);gl.uniform3fv(locations.get('uLightPos[0]'),Array(12).fill(0));gl.uniform3fv(locations.get('uLightColor[0]'),Array(12).fill(0));
 draw();snapshots.push({name,parts:t.groups.reduce((n,g)=>n+g.parts.length,0),bodies:t.groups.length,joints:t.rotors.length,...details,commands});
}

sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
if(!t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight'),t.V()))throw Error('No conveyor');
const conveyor=t.conveyors.at(-1);let hit=t.rotorPart(conveyor.baseId),at=hit.p.vadd(hit.q.vmult(t.V(0,0,-.09))),cell=t.addQubit(at.toArray()),battery=cell.parts[0];
battery.mood.externalBattery={version:1,ownerId:battery.id,packId:battery.id,enabled:true};battery.mood.energy=1;
if(!t.weld({source:cell,target:hit.g,position:cell.body.position.clone(),quaternion:cell.body.quaternion.clone()}))throw Error('No battery');t.stepPhysics(1/240);
hit=t.rotorPart(conveyor.baseId);const points=conveyor.path.map(p=>hit.p.vadd(hit.q.vmult(p))),emitters=[];
for(const x of [-.11,.055,.21]){const g=t.addQubit([x,points[0].y+.048,-.4]),part=g.parts[0];t.adaptCutter({g,part});part.mood.cutter.face=t.unitProfile('cube').faceNormals.findIndex(n=>n.z>.9);part.mood.energy=1;emitters.push(g);
 const receiver=t.addQubit([x,points[0].y+.048,.35]),opposite=receiver.parts[0];t.adaptCutter({g:receiver,part:opposite});opposite.mood.cutter.face=t.unitProfile('cube').faceNormals.findIndex(n=>n.z<-.9);
 t.storyWall(t.V(x,points[0].y/2,-.4),t.V(.045,points[0].y/2,.045));}
const load=t.addQubit([points[0].x+.055,points[0].y+.055,0]),root=load.parts[0].id;
const draw=()=>{for(const g of t.groups)t.drawGroupSolid(g);t.drawConveyors();t.drawCutters();for(const w of t.storyWorld.walls)t.drawBox(w.p,w.q||t.Q(),w.half.scale(2),[.72,.76,.74,1]);};
const eye=[.65,.67,.78],look=[0,.27,-.04];
capture('cutter-off',eye,look,draw);
t.startConveyor(conveyor);for(const g of emitters)t.setCutterEnabled(g.parts[0].id,true);t.stepPhysics(1/240);capture('cutter-active',eye,look,draw);
let pyramids=false,triangles=false,destroyed=false;
for(let i=0;i<240*6;i++){t.stepPhysics(1/240);const matter=t.groups.filter(g=>g.parts[0].id===root||g.parts[0].mood.matter?.root===root);
 if(!pyramids&&matter.length===6&&matter.every(g=>g.parts[0].shape==='pyramid')){pyramids=true;capture('cutter-pyramids',eye,look,draw);}
 if(!triangles&&matter.length===12&&matter.every(g=>g.parts[0].shape==='tetra')){triangles=true;capture('cutter-triangles',eye,look,draw);}
 if(!matter.length){destroyed=true;capture('cutter-vaporized',eye,look,draw);break;}
}
if(!pyramids||!triangles||!destroyed)throw Error('Conveyor sequence incomplete');
lab();t.setLook({camera:[0,.5,.7],yaw:0,pitch:-.7});
if(!t.startCreationTool('quick-cutter')||!t.getCreationPreview()?.valid)throw Error('No blue placement');
const preview=t.getCreationPreview(),center=preview.point;
capture('cutter-blueprint',[center.x+.3,.25,center.z+.3],[center.x,.05,center.z],()=>t.drawCreationPlacement());
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({width,height,init,snapshots,validation}));
console.log(JSON.stringify({output,frames:snapshots.length,validationErrors:validation.length}));if(validation.length)process.exitCode=1;
