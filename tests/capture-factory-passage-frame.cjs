// Record the production opening/gallery renderer for real GLES replay.
// This reuses the recorder contract of capture-culling-frame.cjs.
// DOM/input are simulated; no interface is painted into the captured pixels.
const fs=require('node:fs'),path=require('node:path'),createGame=require('./game-harness.cjs');
const output=process.argv[2]||'/tmp/qbits-opening-review/commands.json',width=Number(process.argv[3])||960,height=Number(process.argv[4])||720;
const constants={VERTEX_SHADER:0x8b31,FRAGMENT_SHADER:0x8b30,COMPILE_STATUS:0x8b81,LINK_STATUS:0x8b82,ARRAY_BUFFER:0x8892,STATIC_DRAW:0x88e4,DYNAMIC_DRAW:0x88e8,FLOAT:0x1406,TRIANGLES:4,TRIANGLE_STRIP:5,LINES:1,DEPTH_TEST:0xb71,BLEND:0xbe2,CULL_FACE:0xb44,COLOR_BUFFER_BIT:0x4000,DEPTH_BUFFER_BIT:0x100,SRC_ALPHA:0x302,ONE_MINUS_SRC_ALPHA:0x303,ONE:1,ZERO:0,LESS:0x201,LEQUAL:0x203,MAX_TEXTURE_SIZE:0xd33,FRAMEBUFFER:0x8d40,TEXTURE0:0x84c0,TEXTURE1:0x84c1,TEXTURE2:0x84c2,TEXTURE_2D:0xde1};
let next=0,commands=[],bound=null,current=null,depthWritable=true;
const locations=new Map(),attributeKeys=new Map(),buffers=new Map(),attributes=new Map(),enabled=new Set(),validation=[];
// WebGL copies uniform values when submitted. Snapshot ordinary arrays too:
// camera/model arrays are mutated between fixtures and must not rewrite a
// previously recorded frame when this command stream is serialized later.
const serialize=value=>ArrayBuffer.isView(value)?Array.from(value):Array.isArray(value)?value.map(serialize):value;
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
 if(name==='deleteBuffer')return(id)=>{buffers.delete(id);record(name,[id]);};
 if(name.startsWith('delete'))return()=>{};
 return(...args)=>record(name,args);
}});

const {t,sandbox}=createGame({gl,graphics:false}),F=sandbox.QBitsFactoryPassage;
t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'campaign',phase:'idle'});
sandbox.document.body.dataset.booting='false';
t.canvas.clientWidth=t.canvas.width=width;t.canvas.clientHeight=t.canvas.height=height;
t.heldFocus.focal=1.48256097;t.heldFocus.amount=0;
const prefs=sandbox.QBitsPreferences.defaults();
prefs.style='clean';prefs.resolution=100;prefs.sampling=1;prefs.shadows='soft';prefs.culling=true;
t.applyPreferences(prefs);t.cullingLab.stats=true;
const init=commands;commands=[];const snapshots=[];
function guide(){return t.groups.find(g=>g.parts.some(p=>p.id===t.story.guideId));}
function capture(name,eye,target,details={}){
 // Keep the commands submitted since the preceding frame. Scene construction
 // compiles new buffers before rendering; discarding those uploads would turn
 // a replay into a different scene, or reference handles that never existed.
 const delta=target.map((value,index)=>value-eye[index]),distance=Math.hypot(...delta);
 const yaw=Math.atan2(-delta[0],-delta[2]),pitch=Math.asin(delta[1]/distance);
 t.position.splice(0,3,...eye);t.setLook({camera:eye,yaw,pitch});
 gl.viewport(0,0,width,height);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.clearColor(.93,.95,.94,1);
 gl.uniform1f(locations.get('uAspect'),width/height);
 t.renderScene(1000);
 const draws=commands.filter(command=>command[0]==='drawArrays');
 if(!draws.length)throw Error('Empty production draw stream: '+name);
 snapshots.push({name,eye,target,yaw,pitch,scene:t.story.scene,phase:t.story.phase,
  parts:t.groups.reduce((n,g)=>n+g.parts.length,0),physicalBodies:t.world.bodies.length,
  guideId:t.story.guideId,metrics:Object.fromEntries(Object.entries(t.cullingLab.last||{}).filter(([key])=>key!=='cpuMs')),draws:draws.length,
  ...details,commands});commands=[];
}
function passagePose(playerDistance,time){
 const distance=Math.min(F.ROUTE_LENGTH,playerDistance+F.LEAD_DISTANCE),pose=F.sampleRoute(distance);
 t.story.passage.state.guideDistance=distance;t.story.passage.state.arrived=distance===F.ROUTE_LENGTH;t.story.passage.state.time=time;
 const g=guide();g.body.position.set(pose.p[0],pose.p[1]+.049,pose.p[2]);g.body.quaternion.setFromEuler(0,pose.yaw,0);g.body.aabbNeedsUpdate=true;
}

t.beginCampaignLevel(1);t.beginOpeningSupply();t.hideStoryDialogue();
capture('01-supply-room',[0,1.68,2.3],[0,.42,-1.45],{fixture:'initial supply room; no HUD in this GLES capture'});
capture('02-supply-hatch-closed',[.58,.78,-.2],[0,.31,-1.45],{fixture:'crouched inspection of the existing hatch geometry'});
if(!t.requestOpeningCompanion())throw Error('The first request was refused');
for(let i=0;i<7;i++)t.tickOpeningSupply(.05);
capture('03-supply-hatch-offering',[.58,.78,-.2],[0,.31,-1.45],{fixture:'production transfer sampled during its animation',transfer:plain(t.story.firstCycle.ledger.transfer)});
for(let i=0;i<10;i++)t.tickOpeningSupply(.05);
capture('04-supply-offered',[.58,.78,-.2],[0,.19,-1.45],{fixture:'offered companion on the receiving tray'});

t.beginFactoryPassage();t.hideStoryDialogue();t.story.passage.invitationPending=false;
passagePose(0,0);
const entry=t.getLook(),eye=entry.camera,aim=[eye[0]-Math.sin(entry.yaw)*Math.cos(entry.pitch)*3,eye[1]+Math.sin(entry.pitch)*3,eye[2]-Math.cos(entry.yaw)*Math.cos(entry.pitch)*3];
capture('05-passage-start',eye,aim,{fixture:'actual entry heading and eye height; invitation UI is not captured'});
capture('06-passage-start-look-down',[0,4.68,7.5],[0,3.05,5.6],{fixture:'player looks down towards the same guide'});
passagePose(2.3,1.5);
capture('07-factory-phase-a',[.55,4.68,5.2],[6.8,2.4,4.4],{fixture:'gallery window; fixed camera, animation phase A',animationTime:1.5});
passagePose(2.3,6.5);
capture('08-factory-phase-b',[.55,4.68,5.2],[6.8,2.4,4.4],{fixture:'same gallery window; animation phase B',animationTime:6.5});
passagePose(6.8,9);
capture('09-left-turn',[0,4.68,.7],[-3,3.5,.7],{fixture:'left turn before descending'});
passagePose(10.7,14);
capture('10-first-descent',[-3,4.68,-.2],[-3,1.6,-3.8],{fixture:'first flight from its upper landing'});
passagePose(14.5,18);
capture('11-middle-landing',[-3,3.18,-4],[-3,.25,-8.1],{fixture:'flat landing between the two flights'});
passagePose(16.7,22);
capture('12-second-descent',[-3,2.43,-6.2],[-3,.65,-9.3],{fixture:'second flight from the player floor height'});
passagePose(19.3,27);
capture('13-lower-door',[-3,1.68,-8.8],[-3,1.25,-10.3],{fixture:'lower corridor and cycle two threshold'});

function plain(value){return JSON.parse(JSON.stringify(value));}
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify({width,height,init,snapshots,validation,
 scope:'Production renderScene, shaders, buffers and draw stream; fixed camera fixtures with simulated DOM; no UI, browser input or FPS claim.'}));
console.log(JSON.stringify({output,frames:snapshots.length,validationErrors:validation.length}));
if(validation.length)process.exitCode=1;
