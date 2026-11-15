// Read actual radial contours and glass shaders/meshes for the GLES pixel test.
// DOM/gameplay are stubbed here; only the Python replay validates GPU output.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const output=process.argv[2]||'/tmp/qbits-glass/geometry.json';
const width=Number(process.argv[3])||1280,height=Number(process.argv[4])||720;
const game=require('./game-harness.cjs')();
game.sandbox.innerWidth=width;game.sandbox.innerHeight=height;
game.t.initUnitRadial();
const radial=game.t.getUnitRadial();radial.open('cube');
const sandbox={window:{},Float32Array,Uint8Array,console};vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js/glass.js'),'utf8'),sandbox);
const api=sandbox.window.QBitsGlass,panels=radial.getGlassPanels();
if(!panels.length)throw Error('No glass panels exported');
const data={width,height,layout:game.sandbox.QBitsRadial.layout(width,height,3,2),vertex:api.vertex,fragment:api.fragment,panels:panels.map(panel=>({...panel,vertices:Array.from(api.mesh(panel.points,panel.thickness))})),figures:radial.getState().figures};
// Record the production compositor too: Python replays allocation, scene copy,
// any blur passes, uniforms, attributes and draws against a real framebuffer.
const constants={VERTEX_SHADER:0x8b31,FRAGMENT_SHADER:0x8b30,COMPILE_STATUS:0x8b81,LINK_STATUS:0x8b82,ARRAY_BUFFER:0x8892,STATIC_DRAW:0x88e4,DYNAMIC_DRAW:0x88e8,FLOAT:0x1406,TRIANGLES:4,TRIANGLE_STRIP:5,DEPTH_TEST:0xb71,BLEND:0xbe2,CULL_FACE:0xb44,SCISSOR_TEST:0xc11,SRC_ALPHA:0x302,ONE_MINUS_SRC_ALPHA:0x303,ONE:1,ZERO:0,NO_ERROR:0,TEXTURE0:0x84c0,TEXTURE1:0x84c1,TEXTURE_2D:0x0de1,TEXTURE_MIN_FILTER:0x2801,TEXTURE_MAG_FILTER:0x2800,TEXTURE_WRAP_S:0x2802,TEXTURE_WRAP_T:0x2803,LINEAR:0x2601,CLAMP_TO_EDGE:0x812f,RGBA:0x1908,UNSIGNED_BYTE:0x1401,FRAMEBUFFER:0x8d40,COLOR_ATTACHMENT0:0x8ce0,FRAMEBUFFER_COMPLETE:0x8cd5,MAX_TEXTURE_SIZE:0xd33,MAX_RENDERBUFFER_SIZE:0x84e8,BLEND_SRC_RGB:0x80c9,BLEND_DST_RGB:0x80c8,BLEND_SRC_ALPHA:0x80cb,BLEND_DST_ALPHA:0x80ca};
let commands=[],next=0;const enabled=new Set();
const gl=new Proxy(constants,{get(target,name){
 if(name in target)return target[name];
 if(name==='getParameter')return value=>value===constants.MAX_TEXTURE_SIZE||value===constants.MAX_RENDERBUFFER_SIZE?8192:value===constants.BLEND_SRC_RGB||value===constants.BLEND_SRC_ALPHA?constants.SRC_ALPHA:constants.ONE_MINUS_SRC_ALPHA;
 if(name==='getError')return()=>0;if(name==='isContextLost')return()=>false;
 if(name==='getShaderParameter'||name==='getProgramParameter')return()=>true;
 if(name==='getShaderInfoLog'||name==='getProgramInfoLog')return()=>'';
 if(name==='checkFramebufferStatus')return()=>constants.FRAMEBUFFER_COMPLETE;
 if(name==='isEnabled')return cap=>enabled.has(cap);
 if(name==='getUniformLocation'||name==='getAttribLocation')return(...args)=>{const id=++next;commands.push([name,id,...args]);return id;};
 if(name.startsWith('create'))return(...args)=>{const id=++next;commands.push([name,id,...args]);return id;};
 return(...args)=>{if(name==='enable')enabled.add(args[0]);if(name==='disable')enabled.delete(args[0]);commands.push([name,...args.map(a=>ArrayBuffer.isView(a)?Array.from(a):a)]);};
}});
const renderer=api.create(gl);
if(!renderer.render(width,height,width,height,panels))throw Error('Production glass renderer failed while recording');
data.firstCommands=commands;commands=[];
if(!renderer.render(width,height,width,height,panels))throw Error('Production glass redraw failed while recording');
data.repeatCommands=commands;
if(data.repeatCommands.some(command=>['createTexture','createBuffer','createFramebuffer','texImage2D','bufferData'].includes(command[0])))throw Error('Unchanged radial redraw reallocates glass resources');
if([...data.firstCommands,...data.repeatCommands].some(command=>command[0]==='readPixels'))throw Error('Glass compositor reads the scene back to CPU');
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(data));
console.log(JSON.stringify({output,width,height,panels:panels.length,triangles:data.panels.map(p=>p.vertices.length/24)}));
