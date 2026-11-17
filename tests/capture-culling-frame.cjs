// Record the production renderScene path for GLES pixel comparisons.
// DOM/input are simulated; Python executes the actual shaders and draw stream.
const fs=require('node:fs'),path=require('node:path'),createGame=require('./game-harness.cjs');
const output=process.argv[2]||'/tmp/qbits-culling/commands.json',width=Number(process.argv[3])||800,height=Number(process.argv[4])||600;
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
 if(name.startsWith('delete'))return()=>{};
 return(...args)=>record(name,args);
}});

const {t,sandbox}=createGame({gl,graphics:false});
t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});
sandbox.document.body.dataset.booting='false';
t.canvas.clientWidth=t.canvas.width=width;t.canvas.clientHeight=t.canvas.height=height;
t.heldFocus.focal=1.48256097;t.heldFocus.amount=0;
const prefs=sandbox.QBitsPreferences.defaults();prefs.resolution=100;prefs.sampling=1;prefs.shadows='soft';t.applyPreferences(prefs);
t.position.splice(0,3,0,1,4);t.posture.height=1;t.setLook({camera:[0,1,4],yaw:0,pitch:0});
const init=commands;commands=[];const snapshots=[];
for(let z=0;z<4;z++)for(let x=0;x<5;x++)t.addQubit([(x-2)*.3,.05,z*.3]);
for(let z=0;z<4;z++)for(let x=0;x<5;x++)t.addQubit([(x-2)*.3,.05,5.5+z*.3]);
// A solid above the top edge still casts a sharp shadow into the visible floor.
t.addQubit([0,3,2]);
// Visible silhouettes intersect the right side plane, including the longer coupler.
for(const [shape,y]of [['cube',.9],['coupler',1.15],['tetra',1.4]])t.addQubit([1.8,y,2],1,shape);
const parts=[];
for(let i=0;i<12;i++){const q=t.Q();q.setFromEuler(i*.1,.2,i*.17);parts.push({id:t.allocateUnitId(),shape:i%3?'cube':'pyramid',weight:1,p:t.V(1.65+i*.1,.5+(i%3)*.11,1.9),q});}
t.makeGroup(parts);
const propeller=t.spawnSavedMechanism(t.propellerBlueprintTemplate(),t.V(-1,1,1));
if(!propeller)throw Error('Missing propeller fixture');
const flight=t.flightForGroup(propeller);flight.enabled=true;flight.phase=0;
function capture(name,enabled,{style='clean',shadows='soft',observer=false}={}){
 const settings=sandbox.QBitsPreferences.defaults();settings.style=style;settings.shadows=shadows;settings.culling=enabled;settings.resolution=100;settings.sampling=1;settings.profiles.psx.jitter=100;settings.profiles.psx.dither=0;settings.profiles.psx.bits=8;t.applyPreferences(settings);
 t.cullingLab.stats=true;t.cullingLab.observer=observer;
 gl.viewport(0,0,width,height);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.clearColor(.93,.95,.94,1);
 gl.uniform1f(locations.get('uAspect'),width/height);
 t.renderScene(1000);
 snapshots.push({name,culling:enabled,observer,style,shadows,parts:t.groups.reduce((n,g)=>n+g.parts.length,0),bodies:t.groups.length,metrics:{...t.cullingLab.last},commands});commands=[];
}
for(const shadows of ['off','soft','sharp'])for(const style of ['clean','psx']){
 const name=style+'-'+shadows;capture(name+'-off',false,{style,shadows});capture(name+'-on',true,{style,shadows});
}
for(const phase of [Math.PI/4,Math.PI/2,Math.PI*.83]){
 flight.phase=phase;const name='propeller-'+phase.toFixed(2);capture(name+'-off',false);capture(name+'-on',true);
}
// The observer renders from outside but retains the original player's frustum.
capture('observer-off',false,{observer:true});capture('observer-on',true,{observer:true});
// A selected body may be outside the view while its screen-space marker is
// still visible. Compare actual pixels, including the marker at the bottom.
t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});
t.setLook({camera:[0,1.68,0],yaw:0,pitch:.47});
const selected=t.addQubit([0,.05,-10]);
t.setMultiSelection([selected]);t.setSelected({g:selected,part:selected.parts[0]});
t.addQubit([1,4,-5]);t.addQubit([0,.05,5]);
capture('selected-marker-edge-off',false);capture('selected-marker-edge-on',true);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({width,height,init,snapshots,validation}));
console.log(JSON.stringify({output,frames:snapshots.length,validationErrors:validation.length}));if(validation.length)process.exitCode=1;
