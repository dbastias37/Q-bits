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
 draw();snapshots.push({name,parts:t.groups.reduce((n,g)=>n+g.parts.length,0),bodies:t.groups.length,joints:t.rotors.length,...details,commands});
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
// Compare the identical irregular rigid assembly drawn per piece and in its
// cached combined mesh. Rotations exercise both world and per-piece normals.
lab();const batchParts=[];
for(let i=0;i<12;i++){const q=t.Q();q.setFromEuler(i*.17,i*.09,i*.05);batchParts.push({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V((i%4)*.15,.18+Math.floor(i/4)*.12,(i%3)*.11),q});}
const batchOrientation=t.Q();batchOrientation.setFromEuler(.12,.26,-.31);const batchGroup=t.makeGroup(batchParts,batchOrientation);
if(batchGroup.block)throw Error('Batch fixture must retain individual cube silhouettes');
const batchInfo={parts:12,bodies:1,joints:0},batchEye=[1.05,.94,1.1],batchTarget=[.23,.31,.11];
capture('rigid-batch-reference',batchEye,batchTarget,()=>{for(const pose of t.poses(batchGroup))t.drawUnitMesh(pose);},batchInfo);
capture('rigid-batch-merged',batchEye,batchTarget,()=>t.drawGroupSolid(batchGroup),batchInfo);
// Identical mixed solids: cube texture coordinates, T-bit normals and both
// coupler finishes must survive material batching without any visual downgrade.
lab();const mixedParts=batchParts.map((part,i)=>({...part,id:t.allocateUnitId(),shape:['cube','tetra','pyramid','coupler'][i%4]})),mixed=t.makeGroup(mixedParts,batchOrientation);
capture('mixed-batch-reference',batchEye,batchTarget,()=>{for(const pose of t.poses(mixed))t.drawUnitMesh(pose);},batchInfo);
capture('mixed-batch-merged',batchEye,batchTarget,()=>t.drawGroupSolid(mixed),batchInfo);
// Production conveyor templates use the same render path and real part/joint
// graph. The payload is placed with the real gripper and released for this
// render fixture; contact transport itself is checked by the runtime tests.
for(const variant of [{kind:'straight',supports:false},{kind:'left',supports:false},{kind:'right',supports:false},{kind:'straight',supports:true}]){
 const recipe=t.conveyorBlueprintTemplate(variant.kind,variant.supports);if(!recipe)throw Error('Missing conveyor variant '+variant.kind);
 lab();const built=t.spawnSavedMechanism(recipe,t.V(0,0,0));if(!built)throw Error('Could not instantiate conveyor '+variant.kind);
 const list=t.groups.slice(),boxes=list.map(g=>t.bounds(g)),lo=[0,1,2].map(i=>Math.min(...boxes.map(b=>b.min[['x','y','z'][i]]))),hi=[0,1,2].map(i=>Math.max(...boxes.map(b=>b.max[['x','y','z'][i]]))),center=lo.map((v,i)=>(v+hi[i])/2),extent=Math.max(...hi.map((v,i)=>v-lo[i])),d=Math.max(.8,extent*1.55),eye=[center[0]+d*.55,center[1]+d*.7,center[2]+d];
 const name='conveyor-'+variant.kind+(variant.supports?'-supports':''),details={parts:list.reduce((n,g)=>n+g.parts.length,0),bodies:list.length,joints:t.rotors.length};
 const render=()=>{for(const group of t.groups)t.drawGroupSolid(group);t.drawConveyors();t.drawCargos();t.drawBatteriesTransparent();};
 capture(name,eye,center,render,details);
 if(!variant.supports){
  const roller=t.rotorPart(t.rotors[0].bId).g,pose=t.poses(roller).find(p=>p.part.shape==='cube');
  const surface=t.conveyorSurfacePoses(t.conveyors[0])[0];if(!surface)throw Error('Missing physical conveyor skin');const point=surface.p.vadd(surface.q.vmult(t.V(-surface.size.x*.2,surface.size.y/2+.045,0)));
  const payload=t.newCargo(point,1,1,'#1a99d6');payload.body.position.copy(point);
  const fixtureGrip=t.addQubit([payload.body.position.x,payload.body.position.y+.09,payload.body.position.z]),gripId=fixtureGrip.parts[0].id;
  if(!t.configureGripper(gripId,{mode:'piece',targetId:-payload.id,capacity:8})||!t.gripperGrab(gripId))throw Error('Conveyor render fixture cargo could not be handled');
  t.releaseGripper(gripId);t.removeGroup(fixtureGrip);capture(name+'-cargo',eye,center,render,{...details,cargoY:payload.body.position.y,fixture:'released gripper load; transport tested separately'});
  lab();if(!t.placeMechanismBlueprint(recipe,t.V(0,0,0)))throw Error('Could not place conveyor ghost '+variant.kind);capture(name+'-blueprint',eye,center,()=>t.drawAlpha(),{...details,directionalArrows:true});
  if(variant.kind==='left'){
   lab();const elevated=t.placeBlueprint(t.mechanismBlueprintShape(recipe),t.V(0,0,0),{height:.45,quarterTurns:1});if(!elevated)throw Error('Could not place rotated elevated blueprint');
   const targets=t.blueprintTargets(elevated),middle=['x','y','z'].map(axis=>(Math.min(...targets.map(part=>part.p[axis]))+Math.max(...targets.map(part=>part.p[axis])))/2);
   capture('conveyor-left-rotated-elevated-blueprint',[middle[0]+d*.55,middle[1]+d*.7,middle[2]+d],middle,()=>t.drawAlpha(),{...details,directionalArrows:true,height:.45,quarterTurns:1});
  }
 }
}
// New propeller render uses the same batched chassis and only two animated
// meshes per motor. Capture distinct shaft phases with the production draw path.
lab();const drone=t.spawnSavedMechanism(t.propellerBlueprintTemplate(true),t.V());if(!drone)throw Error('Missing drone fixture');
const flight=t.flightForGroup(drone),cell=drone.parts.find(t.isExternalBattery);cell.mood.energy=1;cell.mood.externalBattery.enabled=true;
const droneDraw=()=>{t.drawGroupSolid(drone);t.drawBatteriesTransparent();},droneInfo={parts:4,bodies:1,joints:0};
capture('propeller-rest',[.30,.35,.45],[0,.16,0],droneDraw,droneInfo);
if(!t.startFlight(flight))throw Error(flight.status);
for(let i=0;i<360;i++)t.stepPhysics(1/120);
const altitude=t.bounds(drone).min.y;flight.phase=Math.PI/3;
capture('propeller-flight',[.30,.35+altitude,.45],[0,.16+altitude,0],droneDraw,{...droneInfo,altitude,watts:flight.power.inputWatts});
flight.phase=Math.PI*2/3;
capture('propeller-flight-turn',[.30,.35+altitude,.45],[0,.16+altitude,0],droneDraw,droneInfo);
// Creation ghosts preserve exact geometry, merge internal faces and ignore world jitter.
lab();t.initUnitRadial();t.setLook({camera:[0,2,2],yaw:0,pitch:-Math.PI/4});
t.beginCreationPlacement('quick-conveyor-left');
capture('placement-blue',[1.2,1.1,1.5],[0,.2,0],()=>t.drawCreationPlacement());
capture('placement-jitter-independent',[1.2,1.1,1.5],[0,.2,0],()=>{uniform('uJitter',1);t.drawCreationPlacement();});
const blocked=t.getCreationPreview().poses[0].p;t.addQubit([blocked.x,blocked.y,blocked.z]);t.updateCreationPlacement();
capture('placement-blocked',[1.2,1.1,1.5],[0,.2,0],()=>{t.drawQubits();t.drawCreationPlacement();});
lab();t.initUnitRadial();t.setLook({camera:[0,2,2],yaw:0,pitch:-Math.PI/4});t.beginCreationPlacement('quick-conveyor-straight');t.confirmCreationPlacement();
const port=t.conveyorPortWorld(t.conveyors[0],'exit');t.setLook({camera:[port.p.x,2,port.p.z+2],yaw:0,pitch:Math.atan2(port.p.y-2,2)});t.keys.add('ShiftLeft');t.beginCreationPlacement('quick-conveyor-right');
if(!t.getCreationPreview().link||!t.getCreationPreview().valid)throw Error('Missing snapped ghost');
capture('placement-snap',[1.5,1.35,1.8],[.4,.2,.15],()=>{t.drawQubits();t.drawConveyors();t.drawCreationPlacement();});
// Servo fixtures use the production shapes and real Cannon joints. Gravity is
// disabled only here so a change in posture can be inspected from a fixed camera.
for(const servoKind of ['pivot','hinge']){
 lab();t.world.gravity.set(0,0,0);
 const servo=t.spawnSavedMechanism(t.servoBlueprintTemplate(servoKind),t.V(0,.25,0));if(!servo)throw Error('Missing servo fixture '+servoKind);
 t.setSelected(t.rotorPart(servo.aId));
 const renderServo=()=>{for(const group of t.groups)t.drawGroupSolid(group);t.drawServoGuides();};
 const details={kind:servoKind,parts:t.groups.reduce((n,g)=>n+g.parts.length,0),bodies:t.groups.length,joints:1};
 const center=[.025,.40,0],eye=[.32,.58,.65];
 capture('servo-'+servoKind+'-rest',eye,center,renderServo,{...details,angle:t.servoAngle(servo)});
 t.configureServo(servo,{target:35,speed:45,mode:'once'});if(!t.startServo(servo))throw Error('Could not start servo fixture');
 for(let i=0;i<720;i++)t.stepPhysics(1/240);
 if(Math.abs(t.servoAngle(servo)-35)>1)throw Error('Servo capture did not reach its physical target');
 capture('servo-'+servoKind+'-35deg',eye,center,renderServo,{...details,angle:t.servoAngle(servo)});
}
// Compare the actual merged preview against the previous piece-by-piece draw,
// including rotated mixed shapes, battery tint and PSX local coordinates.
for(const jitter of [0,.45]){
 lab();const rotation=t.Q();rotation.setFromAxisAngle(t.V(0,1,0),.4);
 const parts=Array.from({length:32},(_,i)=>({shape:['cube','pyramid','tetra','coupler'][i%4],p:[(i%4-1.5)*.12,(Math.floor(i/4)%4-1.5)*.12,Math.floor(i/16)*.12],q:[rotation.x,rotation.y,rotation.z,rotation.w],mood:i%7===0?{externalBattery:{}}:{}}));
 const mesh=t.buildPreviewMesh(parts,t.V()),eye=[.65,.4,1.25],target=[0,0,.05];
 capture('preview-'+jitter+'-reference',eye,target,()=>{uniform('uJitter',jitter);t.drawPreviewReference(parts,t.V(),t.Q(),1);});
 capture('preview-'+jitter+'-merged',eye,target,()=>{uniform('uJitter',jitter);t.drawPreviewMesh(mesh,t.V(),t.Q());});
}
lab();const pieces=t.makeGroup(Array.from({length:32},(_,i)=>({id:2000+i,weight:1,shape:'cube',p:t.V(1+(i%4)*.09,.3+Math.floor(i/16)*.09,(Math.floor(i/4)%4)*.09),q:t.Q()})));
t.beginStagedDisassembly([pieces]);
capture('disassembly-pending',[2,1.4,1.8],[1,.2,.1],()=>t.drawDisassembly());
for(let i=0;i<4;i++)t.updateDisassembly(.04);
capture('disassembly-moving',[2,1.4,1.8],[1,.2,.1],()=>{t.drawDisassembly();t.drawQubits();});
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({width,height,init,snapshots,validation}));
console.log(JSON.stringify({output,frames:snapshots.length,validationErrors:validation.length}));if(validation.length)process.exitCode=1;
