// Run the production mechanism renderer with a WebGL recorder. The Python
// companion replays these exact shaders, buffers and draws on real GLES.
const fs=require('node:fs'),path=require('node:path'),createGame=require('./game-harness.cjs');
const output=process.argv[2]||'/tmp/qbits-robot-arm/commands.json',width=Number(process.argv[3])||960,height=Number(process.argv[4])||720;
const constants={VERTEX_SHADER:0x8b31,FRAGMENT_SHADER:0x8b30,COMPILE_STATUS:0x8b81,LINK_STATUS:0x8b82,ARRAY_BUFFER:0x8892,STATIC_DRAW:0x88e4,DYNAMIC_DRAW:0x88e8,FLOAT:0x1406,TRIANGLES:4,LINES:1,DEPTH_TEST:0xb71,BLEND:0xbe2,CULL_FACE:0xb44,COLOR_BUFFER_BIT:0x4000,DEPTH_BUFFER_BIT:0x100,SRC_ALPHA:0x302,ONE_MINUS_SRC_ALPHA:0x303,ONE:1,ZERO:0,LESS:0x201,LEQUAL:0x203,MAX_TEXTURE_SIZE:0xd33,FRAMEBUFFER:0x8d40,TEXTURE0:0x84c0,TEXTURE_2D:0xde1};
let next=0,commands=[],bound=null,current=null,depthWritable=true;
const locations=new Map(),attributeKeys=new Map(),buffers=new Map(),attributes=new Map(),enabled=new Set(),validation=[];
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
const {t,sandbox}=createGame({gl,graphics:false});t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});
const init=commands;commands=[];const snapshots=[];
function uniform(name,value){gl.uniform1f(locations.get(name),value);}
function lab(){t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});}
function capture(name,eye,target,draw,details={}){
 commands=[];gl.viewport(0,0,width,height);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.clearColor(.93,.95,.94,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 const delta=target.map((v,i)=>v-eye[i]),distance=Math.hypot(...delta),yaw=Math.atan2(-delta[0],-delta[2]),pitch=Math.asin(delta[1]/distance);
 gl.uniform3fv(locations.get('uCamera'),eye);gl.uniform2f(locations.get('uLook'),yaw,pitch);uniform('uAspect',width/height);uniform('uFocal',1.9);uniform('uFocusMask',0);uniform('uTextureMix',0);uniform('uTextureScale',1);uniform('uWarp',0);uniform('uCel',0);uniform('uJitter',0);uniform('uLighting',.5);uniform('uGlow',0);uniform('uTime',1);
 gl.uniform2f(locations.get('uResolution'),width,height);gl.uniform3fv(locations.get('uLightPos[0]'),Array(12).fill(0));gl.uniform3fv(locations.get('uLightColor[0]'),Array(12).fill(0));
 draw();snapshots.push({name,...details,commands});
}
const template=t.robotArmBlueprintTemplate();if(!template||!t.savedMechanismValid(template))throw Error('Invalid arm template');
lab();const mechanism=t.spawnSavedMechanism(template,t.V(0,0,0));if(!mechanism)throw Error('Could not instantiate the arm fixture');
const min=t.V(Infinity,Infinity,Infinity),max=t.V(-Infinity,-Infinity,-Infinity);
for(const g of t.groups){const b=t.bounds(g);for(const k of ['x','y','z']){min[k]=Math.min(min[k],b.min[k]);max[k]=Math.max(max[k],b.max[k]);}}
const target=[(min.x+max.x)/2,(min.y+max.y)/2,(min.z+max.z)/2],size=Math.max(max.x-min.x,max.y-min.y,max.z-min.z),distance=Math.max(.9,size*1.6);
const draw=()=>{for(const g of t.groups)t.drawGroupSolid(g);t.drawBatteriesTransparent();};
const info={parts:t.groups.reduce((n,g)=>n+g.parts.length,0),bodies:t.groups.length,joints:t.rotors.length,bounds:{min:[min.x,min.y,min.z],max:[max.x,max.y,max.z]}};
capture('arm-front',[target[0]+distance*.40,target[1]+distance*.25,target[2]+distance],target,draw,info);
capture('arm-side',[target[0]+distance,target[1]+distance*.25,target[2]+distance*.35],target,draw,info);
capture('arm-top',[target[0]+distance*.35,target[1]+distance,target[2]+distance*.45],target,draw,info);
const gripper=t.groups.flatMap(g=>t.poses(g)).find(p=>p.part.mood.gripper);
if(gripper){const p=gripper.p;capture('arm-gripper',[p.x+.18,p.y-.16,p.z+.22],[p.x,p.y,p.z],draw,info);}
// Lift the fixture together to isolate cargo rendering from the ground-only
// legacy path; the actual gripper creates the real attachment constraint.
for(const g of t.groups){g.body.position.y+=.3;g.body.aabbNeedsUpdate=true;}
const raisedGrip=t.groups.flatMap(g=>t.poses(g)).find(p=>p.part.mood.gripper),cargo=t.newCargo(t.V(raisedGrip.p.x,0,raisedGrip.p.z),1,1,'#1a99d6');
cargo.body.position.y=raisedGrip.p.y-.094;cargo.body.aabbNeedsUpdate=true;
if(!t.gripperGrab(raisedGrip.part.id)||!cargo.robotPhysical)throw Error('Cargo fixture did not attach physically');
let cargoCommands;
capture('arm-cargo',[target[0]+distance*.4,target[1]+distance*.25+.3,target[2]+distance],[target[0],target[1]+.3,target[2]],()=>{draw();const begin=commands.length;t.drawCargos();cargoCommands=commands.slice(begin);},{...info,cargoY:cargo.body.position.y});
let kind,renderedCenter=null;
for(const command of cargoCommands){if(command[0]==='uniform1f'&&command[1]===locations.get('uKind'))kind=command[2];if(kind===5&&command[0]==='uniform3f'&&command[1]===locations.get('uCenter')){renderedCenter=command.slice(2);break;}}
if(!renderedCenter||Math.abs(renderedCenter[1]-cargo.body.position.y)>1e-9||renderedCenter[1]<.3)throw Error('Raised cargo was rendered on the floor instead of at its physical center');
snapshots[snapshots.length-1].cargoRenderedCenter=renderedCenter;
lab();if(!t.placeMechanismBlueprint(template,t.V(0,0,0)))throw Error('Could not place the ghost blueprint');
capture('arm-blueprint',[target[0]+distance*.40,target[1]+distance*.25,target[2]+distance],target,()=>t.drawAlpha(),info);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({width,height,init,snapshots,validation}));
console.log(JSON.stringify({output,frames:snapshots.length,validationErrors:validation.length}));if(validation.length)process.exitCode=1;
