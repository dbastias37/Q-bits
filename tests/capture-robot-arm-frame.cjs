// Run the production mechanism renderer with a WebGL recorder. The Python
// companion replays these exact shaders, buffers and draws on real GLES.
const fs=require('node:fs'),path=require('node:path'),createGame=require('./game-harness.cjs');
const output=process.argv[2]||'/tmp/qbits-robot-arm/commands.json',width=Number(process.argv[3])||960,height=Number(process.argv[4])||720;
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
// The scene uses the same paused pose editor and status lights as gameplay.
lab();if(!t.spawnSavedMechanism(template,t.V()))throw Error('Missing arm setup fixture');
const configuredArm=t.robotArms[0],armFixtureGrip=t.rotorPart(configuredArm.gripperId),model=t.robotKinematics(configuredArm);
const destination=t.robotKinematicSample(model,[.8,0,0,0]).point,aim=[destination.x,1.05,destination.z+.9];
t.setSelected({g:armFixtureGrip.g,part:armFixtureGrip.part});
sandbox.document.pointerLockElement=t.canvas;
t.setLook({camera:aim,yaw:0,pitch:Math.atan2(-aim[1],.9)});
if(!t.robotPanelAction('pose',{pose:'place',heightCm:13}).ok)throw Error('Could not open the pose blueprint');
t.updateRobotPoseDraft(0,true);
if(!t.getRobotPoseDraft().solution?.pose)throw Error(t.getRobotPoseDraft().reason);
capture('arm-b-placement-blueprint',[.8,.75,1.22],[.13,.22,.2],()=>{draw();t.drawRobotPoseDraft();});
t.canvas.dispatchEvent({type:'mousedown',button:2});
t.setLook({camera:aim,yaw:0,pitch:Math.atan2(-aim[1],.9)});
if(!t.robotPanelAction('pose',{pose:'home',heightCm:15}).ok)throw Error('Could not open the home blueprint');
t.updateRobotPoseDraft(0,true);
if(!t.getRobotPoseDraft().solution?.pose)throw Error(t.getRobotPoseDraft().reason);
capture('arm-home-placement-blueprint',[.8,.75,1.22],[.13,.22,.2],()=>{draw();t.drawRobotPoseDraft();});
t.canvas.dispatchEvent({type:'mousedown',button:2});
const basePoint=t.rotorPart(configuredArm.baseId).p;
const lightEye=[basePoint.x-.1,basePoint.y+.17,basePoint.z+.24],lightLook=[basePoint.x,basePoint.y+.02,basePoint.z];
const drawLight=()=>{draw();t.drawRobotArmLights();};
if(!t.startRobotArm(configuredArm))throw Error(configuredArm.status);
capture('arm-light-running',lightEye,lightLook,drawLight);
for(let i=0;i<180&&configuredArm.state!=='wait';i++)t.stepPhysics(1/120);
if(t.robotArmSignal(configuredArm)!=='waiting')throw Error(configuredArm.status);
capture('arm-light-waiting',lightEye,lightLook,drawLight);
t.stopRobotArm(configuredArm);
t.configureRotor(t.robotArmRotors(configuredArm)[0],{capacity:2},true);
const pickup=t.robotKinematics(configuredArm).point;
// The waiting wrist has settled under gravity. Put a low load beneath the
// actual face instead of spawning a full cube intersecting the wrist.
t.addQubit([pickup.x,t.unitGroundHeight('pyramid'),pickup.z],3,'pyramid');
if(!t.startRobotArm(configuredArm))throw Error(configuredArm.status);
for(let i=0;i<180&&configuredArm.running;i++)t.stepPhysics(1/120);
if(t.robotArmSignal(configuredArm)!=='blocked')throw Error('Expected the excess payload to block the arm');
capture('arm-light-blocked',lightEye,lightLook,drawLight);
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
 if(!variant.supports)for(const jitter of [0,.45]){
  capture('preview-compact-'+variant.kind+'-'+jitter+'-reference',eye,center,()=>{uniform('uJitter',jitter);for(const g of t.groups)for(const p of t.poses(g))t.drawUnitMesh(p);t.drawConveyors();},details);
  capture('preview-compact-'+variant.kind+'-'+jitter+'-merged',eye,center,()=>{uniform('uJitter',jitter);render();},details);
 }
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
// Compare cached selection strokes with the original per-piece strokes,
// including a moved camera/body and a second draw reusing the same GPU data.
lab();const outlineGroup=t.makeGroup(Array.from({length:80},(_,i)=>({id:t.allocateUnitId(),weight:1,shape:['cube','tetra','pyramid','coupler'][i%4],p:t.V((i%10)*.095,.15+Math.floor(i/40)*.11,Math.floor(i/10)%4*.095),q:t.Q()})));
t.canvas.clientWidth=width;t.canvas.clientHeight=height;t.heldFocus.focal=1.9;
for(const jitter of [0,.45])for(const moved of [false,true]){
 const eye=moved?[1.2,1.0,1.7]:[.9,.7,1.5],target=[.4,.2,.15],name='outline-'+jitter+'-'+Number(moved),delta=target.map((v,i)=>v-eye[i]);
 t.setLook({camera:eye,yaw:Math.atan2(-delta[0],-delta[2]),pitch:Math.asin(delta[1]/Math.hypot(...delta))});outlineGroup.body.quaternion.setFromEuler(moved?.1:0,moved?.25:0,moved?-.1:0);
 const renderOutline=reference=>{uniform('uJitter',jitter);t.drawGroupSolid(outlineGroup);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);if(reference)for(const pose of t.poses(outlineGroup))t.drawUnitOutline(pose,.85,true);else t.drawRigidOutline(outlineGroup,.85,true);gl.depthMask(true);gl.disable(gl.BLEND);};
 capture(name+'-reference',eye,target,()=>renderOutline(true),{joints:0});capture(name+'-merged',eye,target,()=>renderOutline(false),{joints:0});capture(name+'-cached',eye,target,()=>renderOutline(false),{joints:0});
}
// Exercise the persistent stroke shader beyond a stationary selection: custom
// widths/colors, mixed cel materials, observer projection, CSS resolution,
// focus masks, and segments crossing/behind the near plane.
function outlineCase(name,{group=outlineGroup,eye=[1.2,1,1.7],target=[.4,.2,.15],stroke=3,color='#30b5c4',alpha=.85,chosen=true,jitter=0,focal=1.9,cssScale=1,observer=false,focus=false,strokesOnly=false}={}){
 const visual=t.getVisuals(),old={outlineWidth:visual.outlineWidth,outlineColor:visual.outlineColor,style:visual.style},delta=target.map((v,i)=>v-eye[i]),yaw=Math.atan2(-delta[0],-delta[2]),pitch=Math.asin(delta[1]/Math.hypot(...delta));
 Object.assign(visual,{outlineWidth:stroke,outlineColor:color,style:'cel'});t.canvas.clientWidth=width*cssScale;t.canvas.clientHeight=height*cssScale;t.heldFocus.focal=focal;
 if(observer){t.setLook({camera:[-2,2,3],yaw:-.7,pitch:.2});t.cullingLab.renderView={eye,basis:{forward:t.V(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)),right:t.V(Math.cos(yaw),0,-Math.sin(yaw)),up:t.V(Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),Math.cos(yaw)*Math.sin(pitch))}};}
 else t.setLook({camera:eye,yaw,pitch});
 const render=reference=>{uniform('uJitter',jitter);uniform('uFocal',focal);uniform('uFocusMask',focus?1:0);if(!strokesOnly)t.drawGroupSolid(group);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);if(reference)for(const pose of t.poses(group))t.drawUnitOutline(pose,alpha,chosen);else t.drawRigidOutline(group,alpha,chosen);gl.depthMask(true);gl.disable(gl.BLEND);};
 const details={joints:0,outlineStroke:stroke,outlineFocal:focal,outlineObserver:observer,outlineFocus:focus};
 capture('outline-case-'+name+'-reference',eye,target,()=>render(true),details);capture('outline-case-'+name+'-merged',eye,target,()=>render(false),details);capture('outline-case-'+name+'-cached',eye,target,()=>render(false),details);
 Object.assign(visual,old);t.canvas.clientWidth=width;t.canvas.clientHeight=height;t.heldFocus.focal=1.9;t.cullingLab.renderView=null;
}
outlineCase('thick-color',{stroke:6,color:'#e852c0',alpha:.37});
outlineCase('mixed-cel',{stroke:2.75,chosen:false});
outlineCase('observer-focal',{stroke:3,focal:1.35,cssScale:1.5,observer:true,jitter:.45});
outlineCase('focus',{stroke:4,focus:true});
const nearOutline=t.makeGroup([{id:t.allocateUnitId(),weight:1,shape:'cube',p:t.V(0,.4,.17),q:t.Q()},{id:t.allocateUnitId(),weight:1,shape:'coupler',p:t.V(.1,.4,.3),q:t.Q()}]);
outlineCase('near-plane',{group:nearOutline,eye:[0,.4,.2],target:[0,.4,0],stroke:4,strokesOnly:true});
// Regular blocks previously bypassed persistent outlines. Keep their original
// CPU endpoint expansion as the reference: calling drawUnitOutline here would
// exercise the new box shader on both sides and miss a shared regression.
function legacyBoxOutline(p,q,size,alpha,chosen){
 const expanded=[size.x+.0009,size.y+.0009,size.z+.0009],points=[],visual=t.getVisuals();
 for(let axis=0;axis<3;axis++)for(const a of [-.5,.5])for(const b of [-.5,.5])for(const end of [-.5,.5]){
  const local=[0,0,0];local[axis]=end;local[(axis+1)%3]=a;local[(axis+2)%3]=b;
  points.push(q.vmult(t.V(...local.map((value,i)=>value*expanded[i]))).vadd(p));
 }
 const color=chosen?[1,3,5].map(i=>parseInt(visual.outlineColor.slice(i,i+2),16)/255):visual.style==='cel'?[.06,.09,.1]:[.48,.51,.54];
 t.drawWideLines(points,[...color,alpha],chosen||visual.style==='cel'?visual.outlineWidth:1);
}
function boxOutlineCase(name,{counts=[1,1,1],position=[0,.15,0],rotation=[0,0,0],eye=[.26,.27,.4],target=position,stroke=3,color='#30b5c4',style='cel',chosen=false,mood='neutral',jitter=0,focal=1.9,cssScale=1,observer=false,focus=false,strokesOnly=false}={}){
 lab();const [nx,ny,nz]=counts,parts=[];
 for(let x=0;x<nx;x++)for(let y=0;y<ny;y++)for(let z=0;z<nz;z++)parts.push({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V((x-(nx-1)/2)*.09,.15+(y-(ny-1)/2)*.09,(z-(nz-1)/2)*.09),q:t.Q()});
 const group=t.makeGroup(parts);if(!group.block)throw Error('Box outline fixture is not a regular block');
 group.body.position.set(...position);group.body.quaternion.setFromEuler(...rotation);group.body.sleep();
 const m=group.parts[0].mood;Object.assign(m,{state:mood,blend:mood==='excited'?[0,1,0]:mood==='restless'?[0,0,1]:[1,0,0],severity:2});
 const visual=t.getVisuals(),old={outlineWidth:visual.outlineWidth,outlineColor:visual.outlineColor,style:visual.style,markers:visual.markers},delta=target.map((v,i)=>v-eye[i]),yaw=Math.atan2(-delta[0],-delta[2]),pitch=Math.asin(delta[1]/Math.hypot(...delta));
 Object.assign(visual,{outlineWidth:stroke,outlineColor:color,style,markers:false});t.canvas.clientWidth=width*cssScale;t.canvas.clientHeight=height*cssScale;t.heldFocus.focal=focal;t.setSelected(chosen?{g:group,part:group.parts[0]}:null);
 if(observer){t.setLook({camera:[-2,2,3],yaw:-.7,pitch:.2});t.cullingLab.renderView={eye,basis:{forward:t.V(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)),right:t.V(Math.cos(yaw),0,-Math.sin(yaw)),up:t.V(Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),Math.cos(yaw)*Math.sin(pitch))}};}
 else t.setLook({camera:eye,yaw,pitch});
 const physical=JSON.stringify({parts:t.worldParts(group),p:group.body.position,q:group.body.quaternion,v:group.body.velocity,w:group.body.angularVelocity,sleep:group.body.sleepState});
 const render=reference=>{
  uniform('uJitter',jitter);uniform('uFocal',focal);uniform('uFocusMask',focus?1:0);if(!strokesOnly)t.drawGroupSolid(group);
  if(reference){const pose=t.moodVisualPose(group,t.blockPose(group));gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);legacyBoxOutline(pose.p,pose.q,pose.size,.88,chosen);gl.depthMask(true);gl.disable(gl.BLEND);}
  else t.drawStructureOutlines();
 };
 const details={joints:0,outlineStroke:chosen||style==='cel'?stroke:1,outlineFocal:focal,outlineObserver:observer,outlineFocus:focus,outlineStyle:style,outlineMood:mood};
 capture('outline-box-'+name+'-reference',eye,target,()=>render(true),details);capture('outline-box-'+name+'-merged',eye,target,()=>render(false),details);capture('outline-box-'+name+'-cached',eye,target,()=>render(false),details);
 if(JSON.stringify({parts:t.worldParts(group),p:group.body.position,q:group.body.quaternion,v:group.body.velocity,w:group.body.angularVelocity,sleep:group.body.sleepState})!==physical)throw Error('Box outline capture changed sleeping physics or energy');
 Object.assign(visual,old);t.canvas.clientWidth=width;t.canvas.clientHeight=height;t.heldFocus.focal=1.9;t.cullingLab.renderView=null;t.setSelected(null);
}
boxOutlineCase('solo-cel',{stroke:2.75});
boxOutlineCase('rectangle-clean',{counts:[3,2,1],rotation:[.22,.37,-.18],eye:[.55,.45,.8],style:'clean',stroke:6});
boxOutlineCase('selected-moved',{counts:[3,2,1],position:[-.08,.22,.04],rotation:[-.12,.21,.17],eye:[.4,.5,.7],chosen:true,color:'#e852c0',stroke:6});
boxOutlineCase('mood-excited',{rotation:[.05,.2,0],mood:'excited'});
boxOutlineCase('mood-restless',{position:[.03,.16,-.02],rotation:[-.03,-.16,.04],mood:'restless',chosen:true,color:'#df7c24',stroke:4});
boxOutlineCase('observer-focus',{counts:[2,1,1],chosen:true,focal:1.35,cssScale:1.5,observer:true,focus:true,jitter:.45});
boxOutlineCase('near-plane',{position:[0,.4,.17],eye:[0,.4,.2],target:[0,.4,0],stroke:4,strokesOnly:true});
// Virtual cartridges retain their original meshes while only the chassis
// participates in physics. Exercise real power, visual phase, stop and removal.
lab();t.world.gravity.set(0,-t.settings.gravity,0);if(!t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight',false),t.V()))throw Error('Missing virtual conveyor');
const virtualBelt=t.conveyors[0],baseHit=t.rotorPart(virtualBelt.baseId),batteryPoint=baseHit.p.vadd(baseHit.q.vmult(t.V(0,0,-.09))),batteryGroup=t.addQubit([batteryPoint.x,batteryPoint.y,batteryPoint.z]),batteryPart=batteryGroup.parts[0];
batteryPart.mood.externalBattery={version:1,ownerId:batteryPart.id,packId:batteryPart.id,enabled:true};batteryPart.mood.energy=1;
if(!t.weld({source:batteryGroup,target:baseHit.g,position:batteryGroup.body.position.clone(),quaternion:batteryGroup.body.quaternion.clone()}))throw Error('Virtual conveyor battery fixture failed');
for(let i=0;i<60;i++)t.stepPhysics(1/240);
const virtualEye=[.8,.48,.85],virtualTarget=[0,.15,0],virtualDraw=()=>{for(const group of t.groups)t.drawGroupSolid(group);t.drawConveyors();t.drawBatteriesTransparent();},virtualInfo=()=>({physicalBodies:t.groups.filter(g=>t.world.bodies.includes(g.body)).length,virtualRollers:t.groups.filter(g=>g.virtualConveyor).length,liveJoints:t.world.constraints.length});
if(!virtualBelt.virtual||virtualInfo().physicalBodies!==1||virtualInfo().virtualRollers!==3)throw Error('Virtual conveyor still simulates individual rollers');
capture('virtual-conveyor-off',virtualEye,virtualTarget,virtualDraw,virtualInfo());
if(!t.startConveyor(virtualBelt))throw Error(virtualBelt.status);
for(let i=0;i<30;i++)t.stepPhysics(1/240);
const movingRoller=t.conveyorRotors(virtualBelt)[0],phaseA=movingRoller.visualPhase;
capture('virtual-conveyor-running-a',virtualEye,virtualTarget,virtualDraw,{...virtualInfo(),phase:phaseA});
for(let i=0;i<30;i++)t.stepPhysics(1/240);
if(!virtualBelt.running||Math.abs(movingRoller.visualPhase-phaseA)<.05)throw Error('Powered virtual roller failed to animate');
capture('virtual-conveyor-running-b',virtualEye,virtualTarget,virtualDraw,{...virtualInfo(),phase:movingRoller.visualPhase});
const selectedVirtualGroup=t.rotorPart(movingRoller.bId).g,virtualDelta=virtualTarget.map((v,i)=>v-virtualEye[i]);t.setLook({camera:virtualEye,yaw:Math.atan2(-virtualDelta[0],-virtualDelta[2]),pitch:Math.asin(virtualDelta[1]/Math.hypot(...virtualDelta))});
for(const jitter of [0,.45]){
 const renderSelected=reference=>{uniform('uJitter',jitter);virtualDraw();gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);if(reference)for(const part of selectedVirtualGroup.parts)t.drawUnitOutline(t.virtualConveyorVisualPose(selectedVirtualGroup,part),.85,true);else t.drawRigidOutline(selectedVirtualGroup,.85,true);gl.depthMask(true);gl.disable(gl.BLEND);};
 capture('outline-virtual-'+jitter+'-reference',virtualEye,virtualTarget,()=>renderSelected(true),virtualInfo());capture('outline-virtual-'+jitter+'-merged',virtualEye,virtualTarget,()=>renderSelected(false),virtualInfo());
}
t.stopConveyor(virtualBelt);const stoppedPhase=movingRoller.visualPhase;for(let i=0;i<30;i++)t.stepPhysics(1/240);if(movingRoller.visualPhase!==stoppedPhase)throw Error('Stopped virtual roller continued animating');
capture('virtual-conveyor-stopped',virtualEye,virtualTarget,virtualDraw,virtualInfo());
const dismantledRoller=t.rotorPart(movingRoller.bId).g;t.detachPart({g:dismantledRoller,part:dismantledRoller.parts.find(p=>p.shape==='cube')});
if(t.groups.some(g=>g.virtualConveyor)||t.groups.some(g=>!t.world.bodies.includes(g.body)))throw Error('Disassembly failed to restore physical material');
capture('virtual-conveyor-dismantled',virtualEye,virtualTarget,virtualDraw,virtualInfo());
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({width,height,init,snapshots,validation}));
console.log(JSON.stringify({output,frames:snapshots.length,validationErrors:validation.length}));if(validation.length)process.exitCode=1;
