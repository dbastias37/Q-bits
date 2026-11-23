// Run the production family renderer with a WebGL recorder. The Python
// companion replays these exact shaders, buffers and draws on real GLES.
const fs=require('node:fs'),path=require('node:path'),createGame=require('./game-harness.cjs');
const output=process.argv[2]||'/tmp/qbits-families/commands.json',width=Number(process.argv[3])||800,height=Number(process.argv[4])||600;
const renderBackend=process.env.QBITS_RENDER_BACKEND||'webgl1';
const constants={VERTEX_SHADER:0x8b31,FRAGMENT_SHADER:0x8b30,COMPILE_STATUS:0x8b81,LINK_STATUS:0x8b82,ARRAY_BUFFER:0x8892,STATIC_DRAW:0x88e4,DYNAMIC_DRAW:0x88e8,FLOAT:0x1406,TRIANGLES:4,TRIANGLE_STRIP:5,LINES:1,DEPTH_TEST:0xb71,BLEND:0xbe2,CULL_FACE:0xb44,COLOR_BUFFER_BIT:0x4000,DEPTH_BUFFER_BIT:0x100,SRC_ALPHA:0x302,ONE_MINUS_SRC_ALPHA:0x303,ONE:1,ZERO:0,LESS:0x201,LEQUAL:0x203,MAX_TEXTURE_SIZE:0xd33,MAX_RENDERBUFFER_SIZE:0x84e8,NO_ERROR:0,FRAMEBUFFER:0x8d40,RENDERBUFFER:0x8d41,FRAMEBUFFER_COMPLETE:0x8cd5,DEPTH_COMPONENT16:0x81a5,COLOR_ATTACHMENT0:0x8ce0,DEPTH_ATTACHMENT:0x8d00,TEXTURE0:0x84c0,TEXTURE1:0x84c1,TEXTURE_2D:0xde1,TEXTURE_MIN_FILTER:0x2801,TEXTURE_MAG_FILTER:0x2800,TEXTURE_WRAP_S:0x2802,TEXTURE_WRAP_T:0x2803,LINEAR:0x2601,CLAMP_TO_EDGE:0x812f,RGBA:0x1908,UNSIGNED_BYTE:0x1401};
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
 if(name==='checkFramebufferStatus')return(...args)=>{record(name,args);return constants.FRAMEBUFFER_COMPLETE;};
 if(name==='getParameter')return()=>8192;
 if(name==='getExtension')return name=>name==='OES_vertex_array_object'&&renderBackend==='webgl1-vao'?{createVertexArrayOES:vertexArrayAPI.createVertexArray,bindVertexArrayOES:vertexArrayAPI.bindVertexArray,deleteVertexArrayOES:vertexArrayAPI.deleteVertexArray}:null;
 if(name==='getSupportedExtensions')return()=>[];
 if(name==='isContextLost')return()=>false;
 if(['createShader','createProgram','createBuffer','createTexture','createFramebuffer','createRenderbuffer'].includes(name))return(...args)=>{const id=++next;record(name,[id,...args]);return id;};
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

// Expose renderer entry points to this fixture without changing game code or
// the general harness. The injected object contains references, not substitutes.
const source=fs.readFileSync(path.join(__dirname,'../assets/js/game.js'),'utf8');
const gameSource=source.replace(/\}\)\(\);\s*$/, 'window.__familyRender={drawFamilies,drawFamilyGlass,drawFamilyPlacement,drawGuides,familyEffect,familyRefresh,familyEffects,ensureFocusPass,compositeHeldFocus,focusPass};})();');
if(gameSource===source)throw Error('Game closure not found');
const {t,sandbox}=createGame({gl,graphics:false,webgl2:renderBackend==='webgl2',gameSource});
const render=sandbox.__familyRender;if(!render)throw Error('Missing family render entry points');
Object.assign(t.canvas,{width,height,clientWidth:width,clientHeight:height});
render.focusPass.nativeOnly=true;
if(!render.ensureFocusPass())throw Error('Focus framebuffer setup failed');
const init=commands;commands=[];const snapshots=[];
function uniform(name,value){if(!locations.has(name))throw Error('Missing uniform '+name);gl.uniform1f(locations.get(name),value);}
function lab(){t.clearNarrativeScene();t.clearFamilies();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle',transition:null});sandbox.document.hidden=false;sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.setRunning(true);t.position.splice(0,3,3,1.66,3);}
function item(battery=false,level=.75){const id=t.allocateUnitId();return {version:1,groups:[{q:[0,0,0,1],parts:[{id,shape:'cube',weight:1,p:[0,.045,0],q:[0,0,0,1],mood:{name:'Q-bit '+id,energy:level,...(battery?{externalBattery:{version:1,ownerId:id,packId:id,enabled:false}}:{})}}]}],joints:[],sets:[],contacts:{sensors:[],rotors:[]}};}
function family(color,battery=false,level=.75,count=100){const f=t.createFamily(Array.from({length:count},()=>item(battery,level)),t.V(0,.081,0),{name:battery?'Baterías':'Familia de prueba',color});if(!f)throw Error('Family fixture rejected');if(battery)t.updateBatteryLiquids(1/60);return f;}
function capture(name,draw,details={},eye=[.30,.23,.48],target=[0,.08,0]){
 commands=[];gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,width,height);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.clearColor(.93,.95,.94,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 const delta=target.map((v,i)=>v-eye[i]),distance=Math.hypot(...delta),yaw=Math.atan2(-delta[0],-delta[2]),pitch=Math.asin(delta[1]/distance);t.setLook({camera:eye,yaw,pitch});
 gl.uniform3fv(locations.get('uCamera'),eye);gl.uniform2f(locations.get('uLook'),yaw,pitch);uniform('uAspect',width/height);uniform('uFocal',1.9);uniform('uFocusMask',0);uniform('uTextureMix',0);uniform('uTextureScale',1);uniform('uWarp',0);uniform('uCel',0);uniform('uJitter',0);uniform('uLighting',.5);uniform('uGlow',0);uniform('uTime',1);
 gl.uniform2f(locations.get('uResolution'),width,height);gl.uniform3fv(locations.get('uLightPos[0]'),Array(12).fill(0));gl.uniform3fv(locations.get('uLightColor[0]'),Array(12).fill(0));
 draw();const inventory=t.families.map(f=>({id:f.id,color:f.color,count:f.count,weight:f.weight,battery:f.battery,fraction:f.fraction??null,shapes:f.body.shapes.length}));
 const liquids=t.batteryLiquidDebug().map(entry=>{const f=t.families.find(f=>f.body.id===entry.bodyId),surface=[];if(f?.liquidPack){const pack=f.liquidPack,mesh=sandbox.QBitsBatteryLiquid.fillMesh(entry.size,entry.localNormal,entry.fraction);for(let i=0;i<mesh.topPositions.length;i+=3){const point=pack.p.vadd(pack.q.vmult(t.V(...mesh.topPositions.slice(i,i+3))));surface.push([point.x,point.y,point.z]);}}return {...entry,surface};});
 snapshots.push({name,inventory,liquids,familyBodies:t.families.length,livePieces:t.groups.reduce((n,g)=>n+g.parts.length,0),effects:render.familyEffects.length,...details,commands});
}
function draw(){render.drawFamilies();render.drawFamilyGlass();}
for(const [name,color]of [['family-black','#000000'],['family-yellow','#e6bb42']]){lab();family(color);capture(name,draw,{kind:'shell',color});}
for(const level of [0,.25,.75,1]){lab();family('#297ee6',true,level);capture('family-battery-blue-'+Math.round(level*100),draw,{kind:'battery',color:'#297ee6',level});}
lab();family('#e84d52',true,.75);capture('family-battery-red-75',draw,{kind:'battery',color:'#e84d52',level:.75});
capture('family-battery-red-occluded',()=>{render.drawFamilies();t.drawBox(t.V(0,.09,.105),t.Q(),t.V(.19,.22,.018),[.19,.22,.21,1]);render.drawFamilyGlass();},{kind:'occlusion',color:'#e84d52',level:.75});
lab();let movingBattery=family('#297ee6',true,.5);movingBattery.body.quaternion.setFromEuler(0,0,Math.PI/4);t.updateBatteryLiquids(1/60);
capture('family-battery-blue-tilted-50',draw,{kind:'battery',color:'#297ee6',level:.5});
lab();movingBattery=family('#297ee6',true,.5);movingBattery.body.velocity.set(4,-4,0);t.updateBatteryLiquids(1/30);movingBattery.body.velocity.set(4,0,0);t.updateBatteryLiquids(1/30);for(let i=0;i<4;i++)t.updateBatteryLiquids(1/60);
capture('family-battery-blue-slosh-impulse',draw,{kind:'battery',color:'#297ee6',level:.5});
t.updateBatteryLiquids(1,true);capture('family-battery-blue-slosh-paused',draw,{kind:'battery',color:'#297ee6',level:.5});
for(let i=0;i<480;i++)t.updateBatteryLiquids(1/60);capture('family-battery-blue-slosh-settled',draw,{kind:'battery',color:'#297ee6',level:.5});
lab();let f=family('#e6bb42',false,.75,30);if(!t.beginFamilyPlacement(f,'move'))throw Error('Could not start family placement');if(!t.updateFamilyPlacement({point:t.V(.26,0,0),normal:t.V(0,1,0)}))throw Error('Valid family placement rejected');
capture('family-placement-blue',()=>{draw();render.drawFamilyPlacement();},{kind:'placement',valid:true},[.46,.30,.60],[.13,.08,0]);
t.addQubit([.26,.05,0]);if(t.updateFamilyPlacement({point:t.V(.26,0,0),normal:t.V(0,1,0)}))throw Error('Occupied placement accepted');
capture('family-placement-blocked',()=>{draw();for(const g of t.groups)t.drawGroupSolid(g);render.drawFamilyPlacement();},{kind:'placement',valid:false},[.46,.30,.60],[.13,.08,0]);
t.cancelFamilyPlacement();for(const g of [...t.groups])t.removeGroup(g);if(!t.beginFamilyPlacement(f,'withdraw',10))throw Error('Could not start extraction guide');if(!t.updateFamilyPlacement({point:t.V(-.5,0,-.4),normal:t.V(0,1,0)}))throw Error('Valid extraction guide rejected');
capture('family-withdraw-blue',()=>{draw();render.drawFamilyPlacement();},{kind:'withdraw',valid:true},[.6,.58,.95],[-.04,.06,-.2]);
lab();f=family('#e6bb42',false,.75,100);for(let i=0;i<8;i++)render.familyEffect(t.V(-.24+(i%4)*.10,.17+Math.floor(i/4)*.10,-.12),f.body.position,'cube',f.color);
t.updateFamilies(.05);capture('family-animation-a',draw,{kind:'animation'},[.35,.34,.58],[-.035,.11,-.02]);
for(let i=0;i<5;i++)t.updateFamilies(.05);capture('family-animation-b',draw,{kind:'animation'},[.35,.34,.58],[-.035,.11,-.02]);
for(let i=0;i<10;i++)t.updateFamilies(.05);capture('family-animation-complete',draw,{kind:'animation-complete'},[.35,.34,.58],[-.035,.11,-.02]);

// Physical pickup must reuse one shell and protect its whole silhouette from
// inspection blur. Exercise the actual framebuffer/mask/composite functions.
lab();f=family('#e6bb42',false,.75,100);
if(!t.grabFamily({family:f,point:f.body.position.clone(),distance:.35}))throw Error('Physical family pickup failed');
const held=t.getHeld(),inventoryBefore=JSON.stringify(f.items),bodyCount=t.world.bodies.length;
for(let i=0;i<30;i++)t.updateHeldFocus(1/60);
if(!t.heldFocus.active||!t.heldFocus.groups.includes(held.g))throw Error('Held family did not enter the ordinary inspection focus');
const focusDetails={kind:'held-focus',heldCount:f.count,handAnchors:held.items.length,handConstraints:held.items.filter(item=>item.joint).length};
function focused(mask=false){
 gl.bindFramebuffer(gl.FRAMEBUFFER,render.focusPass.scene.framebuffer);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 draw();render.compositeHeldFocus();
 if(mask)gl.bindFramebuffer(gl.FRAMEBUFFER,render.focusPass.mask.framebuffer);
}
capture('family-held-focus',()=>focused(),focusDetails);
capture('family-held-focus-mask',()=>focused(true),{...focusDetails,kind:'held-mask'});
// A solid outer box with both identifying bands is the silhouette reference,
// independent of its inventory. Shared scene depth must not exclude the bands.
capture('family-held-mask-reference',()=>{gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);uniform('uFocusMask',1);t.drawBox(f.body.position,f.body.quaternion,t.V(.15,.15,.15),[1,1,1,1]);for(const y of [-.045,.045])t.drawBox(f.body.position.vadd(t.V(0,y,0)),f.body.quaternion,t.V(.152,.005,.152),[1,1,1,1]);uniform('uFocusMask',0);},{...focusDetails,kind:'held-mask-reference'});
f.body.position.y=.40;f.body.aabbNeedsUpdate=true;t.keys.add('ControlLeft');t.settings.line='none';t.settings.guide='ghost';
const ghostEye=[.38,.44,.62],ghostTarget=[0,.21,0];
capture('family-held-drop-ghost',()=>render.drawGuides(),{...focusDetails,kind:'held-ghost'},ghostEye,ghostTarget);
const ghostPose=t.poses(held.g,t.V(0,.077,0))[0];
capture('family-held-drop-reference',()=>{gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);t.drawBox(ghostPose.p,ghostPose.q,t.V(.15,.15,.15),[.14,.3,.31,.18]);gl.depthMask(true);gl.disable(gl.BLEND);},{...focusDetails,kind:'held-ghost-reference'},ghostEye,ghostTarget);
if(JSON.stringify(f.items)!==inventoryBefore||t.world.bodies.length!==bodyCount||t.groups.length)throw Error('Rendering physical pickup changed stored inventory or bodies');
t.keys.delete('ControlLeft');t.releaseQubit();
lab();f=family('#297ee6',true,.75,100);
if(!t.grabFamily({family:f,point:f.body.position.clone(),distance:.35}))throw Error('Physical battery family pickup failed');
for(let i=0;i<30;i++)t.updateHeldFocus(1/60);
capture('family-held-battery-focus',()=>focused(),{...focusDetails,kind:'held-battery-focus'});
capture('family-held-battery-mask',()=>focused(true),{...focusDetails,kind:'held-battery-mask'});
t.releaseQubit();
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({width,height,backend:renderBackend,sourceSha256:require('node:crypto').createHash('sha256').update(source).digest('hex'),init,snapshots,validation}));
console.log(JSON.stringify({output,frames:snapshots.length,validationErrors:validation.length}));if(validation.length)process.exitCode=1;
