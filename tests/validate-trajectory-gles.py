#!/usr/bin/env python3
"""Replay the production trajectory face renderer on Mesa EGL/GLES.

The Node harness records the actual atlas upload, shaders, buffers and draws;
EGL compiles and renders them. Every glyph cell is compared with the model at
projected cell centres, including rotated and upward-facing cubes. This is a
GPU pixel test, not a browser/input test. Set QBITS_RENDER_BACKEND=webgl2 to
exercise the production WebGL 2/VAO path in an ES 3 context.
"""
import ctypes as C
import gzip
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess
import sys
import zlib

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('/tmp/qbits-trajectory')
OUT.mkdir(parents=True, exist_ok=True)

# References to the existing renderer are exposed only inside this fixture.
# Production source, the ordinary harness and the atlas are not substituted.
CAPTURE = r"""
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=process.argv[2],output=process.argv[3],createGame=require(path.join(root,'tests/game-harness.cjs'));
const backend=process.env.QBITS_RENDER_BACKEND||'webgl1',width=384,height=384;
const constants={VERTEX_SHADER:0x8b31,FRAGMENT_SHADER:0x8b30,COMPILE_STATUS:0x8b81,LINK_STATUS:0x8b82,ARRAY_BUFFER:0x8892,STATIC_DRAW:0x88e4,DYNAMIC_DRAW:0x88e8,FLOAT:0x1406,TRIANGLES:4,LINES:1,DEPTH_TEST:0xb71,BLEND:0xbe2,CULL_FACE:0xb44,COLOR_BUFFER_BIT:0x4000,DEPTH_BUFFER_BIT:0x100,SRC_ALPHA:0x302,ONE_MINUS_SRC_ALPHA:0x303,ONE:1,ZERO:0,LESS:0x201,LEQUAL:0x203,MAX_TEXTURE_SIZE:0xd33,MAX_RENDERBUFFER_SIZE:0x84e8,NO_ERROR:0,FRAMEBUFFER:0x8d40,FRAMEBUFFER_COMPLETE:0x8cd5,TEXTURE0:0x84c0,TEXTURE1:0x84c1,TEXTURE_2D:0xde1,TEXTURE_MIN_FILTER:0x2801,TEXTURE_MAG_FILTER:0x2800,TEXTURE_WRAP_S:0x2802,TEXTURE_WRAP_T:0x2803,NEAREST:0x2600,LINEAR:0x2601,CLAMP_TO_EDGE:0x812f,RGBA:0x1908,UNSIGNED_BYTE:0x1401};
let next=0,commands=[],bound=null,current=null,depthWritable=true;
const locations=new Map(),attributeKeys=new Map(),buffers=new Map(),validation=[];
let attributes=new Map(),enabled=new Set(),activeArray=null;
const arrays=new Map([[null,{attributes,enabled}]]);
const serialize=value=>ArrayBuffer.isView(value)?Array.from(value):value;
const record=(name,args)=>commands.push([name,...args.map(serialize)]);
const vao={
 createVertexArray(){const id=++next;arrays.set(id,{attributes:new Map(),enabled:new Set()});record('createVertexArray',[id]);return id;},
 bindVertexArray(id){if(!arrays.has(id))throw Error('Missing vertex array');activeArray=id;({attributes,enabled}=arrays.get(id));record('bindVertexArray',[id]);},
 deleteVertexArray(id){if(activeArray===id){activeArray=null;({attributes,enabled}=arrays.get(null));}arrays.delete(id);record('deleteVertexArray',[id]);}
};
const gl=new Proxy({...constants,...(backend==='webgl2'?vao:{})},{get(target,name){
 if(name in target)return target[name];
 if(name==='getShaderParameter'||name==='getProgramParameter')return()=>true;
 if(name==='getShaderInfoLog'||name==='getProgramInfoLog')return()=>'';
 if(name==='getError')return()=>0;
 if(name==='getParameter')return()=>8192;
 if(name==='getExtension')return()=>null;
 if(name==='getSupportedExtensions')return()=>[];
 if(name==='isContextLost')return()=>false;
 if(['createShader','createProgram','createBuffer','createTexture'].includes(name))return(...args)=>{const id=++next;record(name,[id,...args]);return id;};
 if(name==='getUniformLocation'||name==='getAttribLocation')return(program,key)=>{const signature=program+':'+key;if(name==='getAttribLocation'&&attributeKeys.has(signature))return attributeKeys.get(signature);const id=++next;record(name,[id,program,key]);if(name==='getUniformLocation')locations.set(key,id);else attributeKeys.set(signature,id);return id;};
 if(name==='bindBuffer')return(...args)=>{bound=args[1];record(name,args);};
 if(name==='bufferData')return(...args)=>{buffers.set(bound,args[1].byteLength);record(name,args);};
 if(name==='bufferSubData')return(...args)=>{if(args[1]+args[2].byteLength>buffers.get(bound))validation.push('Buffer overflow');record(name,args);};
 if(name==='useProgram')return(...args)=>{current=args[0];record(name,args);};
 if(name==='enableVertexAttribArray')return(location)=>{enabled.add(location);record(name,[location]);};
 if(name==='disableVertexAttribArray')return(location)=>{enabled.delete(location);record(name,[location]);};
 if(name==='vertexAttribPointer')return(location,count,type,normalized,stride,offset)=>{attributes.set(location,{buffer:bound,count,stride,offset});record(name,[location,count,type,normalized,stride,offset]);};
 if(name==='depthMask')return(value)=>{depthWritable=value;record(name,[value]);};
 if(name==='clear')return(mask)=>{if(mask&constants.DEPTH_BUFFER_BIT&&!depthWritable)validation.push('Depth clear while writes disabled');record(name,[mask]);};
 if(name==='drawArrays')return(mode,first,count)=>{for(const location of enabled){const a=attributes.get(location);if(!a)throw Error('Missing attribute');const end=a.offset+(first+count-1)*(a.stride||a.count*4)+a.count*4;if(end>buffers.get(a.buffer))validation.push({program:current,location,required:end,buffer:buffers.get(a.buffer)});}record(name,[mode,first,count]);};
 if(name.startsWith('delete'))return()=>{};
 return(...args)=>record(name,args);
}});
const source=fs.readFileSync(path.join(root,'assets/js/game.js'),'utf8');
const gameSource=source.replace(/\}\)\(\);\s*$/,'window.__trajectoryRender={ensureTrajectoryAtlas,drawTrajectories,partPose,renderContext};})();');
if(gameSource===source)throw Error('Game closure not found');
const {t,sandbox}=createGame({gl,graphics:false,webgl2:backend==='webgl2',gameSource});
const render=sandbox.__trajectoryRender,model=sandbox.QBitsTrajectoryModel;
Object.assign(t.canvas,{width,height,clientWidth:width,clientHeight:height});
t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle',transition:null});
sandbox.document.hidden=false;sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.setRunning(true);
const g=t.addQubit([0,0,0]),part=g.parts[0],system=t.getTrajectorySystem();
part.mood.trajectory={version:1,level:1,role:'beacon',face:0,routeId:null};
if(!system.register(g,part))throw Error('Beacon registration failed');
const created=system.createStart(part.id);if(!created.ok)throw Error(created.message);
const route=system.routes.get(created.routeId);
render.ensureTrajectoryAtlas();const init=commands;commands=[];const snapshots=[];
function uniform(name,value){if(!locations.has(name))throw Error('Missing uniform '+name);gl.uniform1f(locations.get(name),value);}
function vector(v){return [v.x,v.y,v.z];}
function capture(name,glyph,rotation=[0,0,0],localEye=[.22,0,0],shell=.025,save=false){
 route.glyph=glyph;g.body.quaternion.setFromEuler(...rotation);
 const pose=render.partPose(g,part),world=(p)=>vector(pose.p.vadd(pose.q.vmult(t.V(...p))));
 const eye=world(localEye),target=world([.0458,0,0]),delta=target.map((v,i)=>v-eye[i]),distance=Math.hypot(...delta),yaw=Math.atan2(-delta[0],-delta[2]),pitch=Math.asin(delta[1]/distance);
 commands=[];gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,width,height);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.clearColor(.93,.95,.94,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 t.setLook({camera:eye,yaw,pitch});gl.uniform3fv(locations.get('uCamera'),eye);gl.uniform2f(locations.get('uLook'),yaw,pitch);
 for(const [key,value]of Object.entries({uAspect:1,uFocal:1.9,uFocusMask:0,uTextureMix:0,uTextureScale:1,uWarp:0,uCel:0,uJitter:0,uLighting:.5,uGlow:0,uTime:1}))uniform(key,value);
 gl.uniform2f(locations.get('uResolution'),width,height);gl.uniform3fv(locations.get('uLightPos[0]'),Array(12).fill(0));gl.uniform3fv(locations.get('uLightColor[0]'),Array(12).fill(0));
 t.drawBox(pose.p,pose.q,t.V(.09,.09,.09),[shell,shell,shell,1]);render.drawTrajectories();
 const centres=[];for(let row=0;row<10;row++)for(let col=0;col<10;col++)centres.push(world([.0458,(.5-(row+.5)/10)*.072,(.5-(col+.5)/10)*.072]));
 const housing=[[.04555,.038,0],[.04555,-.038,0],[.04555,0,.038],[.04555,0,-.038]].map(world);
 snapshots.push({name,glyph,eye,yaw,pitch,centres,housing,save,commands});
}
for(let glyph=0;glyph<model.GLYPHS.length;glyph++)capture('glyph-'+String(glyph).padStart(3,'0'),glyph,[0,0,0],[.22,0,0],.025,[0,7,23,24,143].includes(glyph));
capture('glyph-tilted',79,[.35,.7,.22],[.24,.035,.04],.025,true);
capture('glyph-upward',132,[0,0,Math.PI/2],[.24,.025,.04],.025,true);
capture('glyph-white-shell',7,[0,.35,0],[.22,.025,.05],.95,true);
capture('glyph-unpaired',-1,[0,0,0],[.22,0,0],.95,true);
// Pixel evidence for the link under both cubes, including the live draft.
// The underlying travel pads and authored route remain the production ones.
function captureRibbon(name,{air=false,preview=false}={}){
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle',transition:null});
 // A supported display width keeps the core above one pixel in this 384px
 // fixture; otherwise subpixel alignment would test aliasing, not continuity.
 t.getVisuals().pathWidth=4;
 const runtime=t.getTrajectorySystem(),a=t.addQubit([0,.045,0]),b=t.addQubit([.9,.045,0]);
 if(air){a.body.quaternion.setFromEuler(0,0,Math.PI/2);b.body.quaternion.setFromEuler(0,Math.PI,Math.PI/2);}
 else b.body.quaternion.setFromEuler(0,Math.PI,0);
 for(const group of [a,b]){const p=group.parts[0];p.mood.trajectory={version:1,level:1,role:'beacon',face:0,routeId:null};if(!t.onTrajectoryPartChanged(group,p))throw Error('Ribbon beacon registration failed');}
 const made=runtime.createStart(a.parts[0].id);if(!made.ok||!runtime.pair(made.routeId,b.parts[0].id).ok)throw Error('Ribbon pair failed');
 for(let i=0;i<4;i++)runtime.update(.05);
 const line=runtime.routes.get(made.routeId);if(!line.valid)throw Error(line.reason);
 if(preview&&!t.trajectoryPanelAction(a.parts[0].id,'trace').ok)throw Error('Ribbon draft failed');
 const eye=[.45,1.8,0],yaw=0,pitch=-Math.PI/2;
 commands=[];gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,width,height);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.clearColor(.93,.95,.94,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 t.setLook({camera:eye,yaw,pitch});gl.uniform3fv(locations.get('uCamera'),eye);gl.uniform2f(locations.get('uLook'),yaw,pitch);
 for(const [key,value]of Object.entries({uAspect:1,uFocal:1.9,uFocusMask:0,uTextureMix:0,uTextureScale:1,uWarp:0,uCel:0,uJitter:0,uLighting:.5,uGlow:0,uTime:1}))uniform(key,value);
 gl.uniform2f(locations.get('uResolution'),width,height);gl.uniform3fv(locations.get('uLightPos[0]'),Array(12).fill(0));gl.uniform3fv(locations.get('uLightColor[0]'),Array(12).fill(0));
 t.drawBox(t.V(.45,-.01,0),t.Q(),t.V(1.8,.02,1.2),[.94,.94,.94,1]);
 for(const group of [a,b])t.drawBox(group.body.position,group.body.quaternion,t.V(.09,.09,.09),[.8,.8,.8,1]);
 render.drawTrajectories();
 const groundY=air?.009:.012;
 const samples=air?[...[.065,.09,.15,.25,.32].map(z=>[0,groundY,z]),...[.065,.09,.15,.25,.32].map(z=>[.9,groundY,-z])]:[.055,.075,.10,.15,.25,.33,.45,.57,.65,.75,.80,.825,.845].map(x=>[x,groundY,0]);
 snapshots.push({name,kind:'ribbon',air,preview,eye,yaw,pitch,samples,occluded:[[.02,.091,0],[.88,.091,0]],save:true,commands});
 if(preview)t.cancelTrajectoryDraft(false);
}
captureRibbon('ribbon-ground');
captureRibbon('ribbon-ground-preview',{preview:true});
captureRibbon('ribbon-air-projection',{air:true});
fs.writeFileSync(output,JSON.stringify({width,height,backend,contextVersion:render.renderContext.version,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),modelSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets/js/trajectory-model.js'))).digest('hex'),glyphs:model.GLYPHS,init,snapshots,validation}));
"""
capture_file = OUT / 'capture.cjs'
capture_file.write_text(CAPTURE)
subprocess.run(['node', str(capture_file), str(ROOT), str(OUT / 'commands.json')], check=True)
data = json.loads((OUT / 'commands.json').read_text())
W, H = data['width'], data['height']
assert not data['validation'], data['validation']
expected_context = 3 if data['backend'] == 'webgl2' else 2
assert data['contextVersion'] == (2 if expected_context == 3 else 1)

# Assert the real upload has exactly the documented 16x16 tiles, 3-texel
# padding and 100 cells. The pixel test below separately verifies sampling.
uploads = [c for c in data['init'] if c[0] == 'texImage2D' and c[4:6] == [256, 256]]
assert len(uploads) == 1, 'Atlas must upload once'
atlas = uploads[0][-1]
expected_atlas = bytearray([0, 0, 0, 255] * 256 * 256)
for index, rows in enumerate(data['glyphs']):
    assert len(rows) == 10 and all(len(row) == 10 for row in rows)
    assert set(rows[0] + rows[-1] + ''.join(row[0] + row[-1] for row in rows)) == {'0'}
    for y, row in enumerate(rows):
        for x, bit in enumerate(row):
            offset = (((index // 16) * 16 + 3 + y) * 256 + (index % 16) * 16 + 3 + x) * 4
            expected_atlas[offset:offset + 3] = bytes([255 if bit == '1' else 0]) * 3
assert bytes(atlas) == expected_atlas, 'Atlas upload differs from glyph catalogue or padding'
atlas_parameters = [command[1:] for command in data['init'] if command[0] == 'texParameteri']
for parameter, value in [(0x2801, 0x2600), (0x2800, 0x2600), (0x2802, 0x812f), (0x2803, 0x812f)]:
    assert [0x0de1, parameter, value] in atlas_parameters, 'Missing nearest/clamped atlas sampling'

# Mesa may return an ES 3.2 context for an ES 2 request. Restrict its advertised
# version here so the two test invocations exercise distinct ES 2/ES 3 APIs.
os.environ.setdefault('MESA_GLES_VERSION_OVERRIDE', str(expected_context) + '.0')
E = C.CDLL('libEGL.so.1')
def egl(name, result, *args):
    function = getattr(E, name); function.restype = result; function.argtypes = list(args)
    return function
getproc = egl('eglGetProcAddress', C.c_void_p, C.c_char_p)
def gl(name, result, *args):
    pointer = getproc(name.encode())
    if not pointer:
        raise RuntimeError('Missing ' + name)
    return C.CFUNCTYPE(result, *args)(pointer)
U, I, F, P = C.c_uint, C.c_int, C.c_float, C.c_void_p
get_display = C.CFUNCTYPE(P, U, P, C.POINTER(I))(getproc(b'eglGetPlatformDisplayEXT'))
display = get_display(0x31DD, None, None); major = I(); minor = I()
assert egl('eglInitialize', U, P, C.POINTER(I), C.POINTER(I))(display, C.byref(major), C.byref(minor))
attributes = (I * 15)(0x3033, 1, 0x3040, 4, 0x3024, 8, 0x3023, 8, 0x3022, 8, 0x3021, 8, 0x3025, 16, 0x3038)
config = P(); count = I()
assert egl('eglChooseConfig', U, P, C.POINTER(I), C.POINTER(P), I, C.POINTER(I))(display, attributes, C.byref(config), 1, C.byref(count)) and count.value
assert egl('eglBindAPI', U, U)(0x30A0)
surface = egl('eglCreatePbufferSurface', P, P, P, C.POINTER(I))(display, config, (I * 5)(0x3057, W, 0x3056, H, 0x3038))
context = egl('eglCreateContext', P, P, P, P, C.POINTER(I))(display, config, None, (I * 3)(0x3098, expected_context, 0x3038))
assert surface and context and egl('eglMakeCurrent', U, P, P, P, P)(display, surface, surface, context)
get_string = gl('glGetString', C.c_char_p, U)
graphics = {'version': get_string(0x1f02).decode(), 'renderer': get_string(0x1f01).decode(), 'requestedContextVersion': expected_context}

signatures = {
    'createShader': (U, U), 'createProgram': (U,),
    'compileShader': (None, U), 'attachShader': (None, U, U), 'linkProgram': (None, U),
    'bindBuffer': (None, U, U), 'useProgram': (None, U), 'bindVertexArray': (None, U),
    'bindTexture': (None, U, U), 'bindFramebuffer': (None, U, U),
    'activeTexture': (None, U), 'texParameteri': (None, U, U, I), 'texImage2D': (None, U, I, I, I, I, I, U, U, P),
    'getAttribLocation': (I, U, C.c_char_p), 'getUniformLocation': (I, U, C.c_char_p),
    'enableVertexAttribArray': (None, U), 'disableVertexAttribArray': (None, U),
    'vertexAttribPointer': (None, U, I, U, C.c_ubyte, I, P),
    'uniform1f': (None, I, F), 'uniform1i': (None, I, I), 'uniform2f': (None, I, F, F),
    'uniform3f': (None, I, F, F, F), 'uniform4f': (None, I, F, F, F, F),
    'viewport': (None, I, I, I, I), 'clearColor': (None, F, F, F, F), 'clear': (None, U),
    'enable': (None, U), 'disable': (None, U), 'depthMask': (None, C.c_ubyte),
    'depthFunc': (None, U), 'blendFunc': (None, U, U), 'drawArrays': (None, U, I, I),
}
functions = {name: gl('gl' + name[0].upper() + name[1:], result, *args) for name, (result, *args) in signatures.items()}
shader_source = gl('glShaderSource', None, U, I, C.POINTER(C.c_char_p), C.POINTER(I))
generators = {name: gl('glGen' + name + 's', None, I, C.POINTER(U)) for name in ['Buffer', 'Texture', 'VertexArray']}
delete_arrays = gl('glDeleteVertexArrays', None, I, C.POINTER(U))
buffer_data = gl('glBufferData', None, U, C.c_ssize_t, P, U)
buffer_sub_data = gl('glBufferSubData', None, U, C.c_ssize_t, C.c_ssize_t, P)
vec3 = gl('glUniform3fv', None, I, I, C.POINTER(F)); vec4 = gl('glUniform4fv', None, I, I, C.POINTER(F))
get_shader = gl('glGetShaderiv', None, U, U, C.POINTER(I)); get_program = gl('glGetProgramiv', None, U, U, C.POINTER(I))
shader_log = gl('glGetShaderInfoLog', None, U, I, C.POINTER(I), C.c_char_p)
program_log = gl('glGetProgramInfoLog', None, U, I, C.POINTER(I), C.c_char_p)
get_error = gl('glGetError', U); read_pixels = gl('glReadPixels', None, I, I, I, I, U, U, P)
handles, locations, attribute_locations = {}, {}, {}
compiled = linked = 0

def replay(command):
    global compiled, linked
    name, *args = command
    if name in ('createShader', 'createProgram'):
        key = args.pop(0); handles[key] = functions[name](*args)
    elif name in ('createBuffer', 'createTexture', 'createVertexArray'):
        value = U(); generators[name[6:]](1, C.byref(value)); handles[args[0]] = value.value
    elif name == 'deleteVertexArray':
        value = U(handles.pop(args[0])); delete_arrays(1, C.byref(value))
    elif name == 'shaderSource':
        source = C.c_char_p(args[1].encode()); shader_source(handles[args[0]], 1, C.byref(source), None)
    elif name == 'bufferData':
        raw = (F * len(args[1]))(*args[1]); buffer_data(args[0], C.sizeof(raw), raw, args[2])
    elif name == 'bufferSubData':
        raw = (F * len(args[2]))(*args[2]); buffer_sub_data(args[0], args[1], C.sizeof(raw), raw)
    elif name == 'texImage2D':
        raw = (C.c_ubyte * len(args[-1]))(*args[-1]) if args[-1] is not None else None
        functions[name](*args[:-1], raw)
    elif name in ('getAttribLocation', 'getUniformLocation'):
        key, program, attribute = args; value = functions[name](handles[program], attribute.encode())
        (attribute_locations if name == 'getAttribLocation' else locations)[key] = value
        assert value >= 0, (name, attribute, value)
    elif name in ('uniform3fv', 'uniform4fv'):
        raw = (F * len(args[1]))(*args[1]); size = 3 if name == 'uniform3fv' else 4
        (vec3 if size == 3 else vec4)(locations[args[0]], len(args[1]) // size, raw)
    else:
        if name in ('compileShader', 'linkProgram', 'useProgram'):
            args[0] = handles[args[0]]
        elif name == 'attachShader':
            args = [handles[value] for value in args]
        elif name in ('bindBuffer', 'bindTexture', 'bindFramebuffer'):
            args[1] = handles[args[1]] if args[1] is not None else 0
        elif name == 'bindVertexArray':
            args[0] = handles[args[0]] if args[0] is not None else 0
        elif name.startswith('uniform'):
            args[0] = locations[args[0]]
        elif name in ('enableVertexAttribArray', 'disableVertexAttribArray', 'vertexAttribPointer'):
            args[0] = attribute_locations[args[0]]
            if name == 'vertexAttribPointer':
                args[-1] = P(args[-1])
        if name not in functions:
            raise RuntimeError('Unimplemented ' + name)
        functions[name](*args)
        if name in ('compileShader', 'linkProgram'):
            status = I(); log = C.create_string_buffer(8192)
            if name == 'compileShader':
                get_shader(args[0], 0x8b81, C.byref(status)); shader_log(args[0], len(log), None, log); compiled += 1
            else:
                get_program(args[0], 0x8b82, C.byref(status)); program_log(args[0], len(log), None, log); linked += 1
            assert status.value, (name, log.value.decode())
    error = get_error()
    assert error == 0, (name, hex(error))

def png(path, pixels):
    def chunk(kind, payload):
        return struct.pack('!I', len(payload)) + kind + payload + struct.pack('!I', zlib.crc32(kind + payload) & 0xffffffff)
    raw = b''.join(b'\0' + pixels[y * W * 4:(y + 1) * W * 4] for y in range(H - 1, -1, -1))
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', W, H, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 6)) + chunk(b'IEND', b''))

def sample(raw, world, shot):
    sy, cy = math.sin(shot['yaw']), math.cos(shot['yaw'])
    sp, cp = math.sin(shot['pitch']), math.cos(shot['pitch'])
    relative = [a - b for a, b in zip(world, shot['eye'])]
    dot = lambda a, b: sum(x * y for x, y in zip(a, b))
    depth = dot(relative, [-sy * cp, sp, -cy * cp])
    x = int((dot(relative, [cy, 0, -sy]) * 1.9 / depth + 1) * W / 2)
    y = int((dot(relative, [sy * sp, cp, cy * sp]) * 1.9 / depth + 1) * H / 2)
    assert 0 <= x < W and 0 <= y < H, ('Projected sample outside image', x, y)
    at = (y * W + x) * 4
    return list(raw[at:at + 3])

for command in data['init']:
    replay(command)
results = []; checked_cells = 0
for shot in data['snapshots']:
    if shot.get('kind') != 'ribbon':
        assert sum(command[0] == 'drawArrays' for command in shot['commands']) == 3, 'Expected cube, housing and glyph draws'
    for command in shot['commands']:
        replay(command)
    pixels = (C.c_ubyte * (W * H * 4))()
    read_pixels(0, 0, W, H, 0x1908, 0x1401, pixels)
    assert get_error() == 0
    raw = bytes(pixels)
    if shot['save']:
        png(OUT / (shot['name'] + '.png'), raw)
    if shot.get('kind') == 'ribbon':
        for world in shot['samples']:
            r, g, b = value = sample(raw, world, shot)
            visible = r > g + 20 and g > b + 30 if shot['preview'] else b > r + 15 and g > r + 10 if shot['air'] else g > r + 35 and g > b + 10
            assert visible, (shot['name'], 'Gap in floor ribbon', world, value)
        for world in shot['occluded']:
            value = sample(raw, world, shot)
            housing = all(abs(channel - expected) <= 1 for channel, expected in zip(value, [191, 204, 204]))
            assert max(value) - min(value) <= 3 or housing, (shot['name'], 'Ribbon shows through cube', world, value)
        results.append({'name': shot['name'], 'ribbonSamples': len(shot['samples']), 'occlusionSamples': len(shot['occluded']),
                        'rgbaSha256': hashlib.sha256(raw).hexdigest(), 'png': shot['name'] + '.png'})
        continue
    rows = data['glyphs'][shot['glyph']] if shot['glyph'] >= 0 else ['0' * 10] * 10
    for cell, world in enumerate(shot['centres']):
        expected = 242 if rows[cell // 10][cell % 10] == '1' else 2
        value = sample(raw, world, shot)
        assert all(abs(channel - expected) <= 1 for channel in value), (shot['name'], 'Cell', cell // 10, cell % 10, 'Expected', expected, 'Actual', value)
        checked_cells += 1
    for world in shot['housing']:
        value = sample(raw, world, shot)
        assert all(abs(channel - expected) <= 1 for channel, expected in zip(value, [191, 204, 204])), (shot['name'], 'Housing', value)
    results.append({'name': shot['name'], 'glyph': shot['glyph'], 'cells': 100, 'housingSamples': 4,
                    'drawCalls': sum(command[0] == 'drawArrays' for command in shot['commands']),
                    'rgbaSha256': hashlib.sha256(raw).hexdigest(),
                    'png': shot['name'] + '.png' if shot['save'] else None})

summary = {'backend': data['backend'], 'sourceSha256': data['sourceSha256'], 'modelSha256': data['modelSha256'],
           'graphics': graphics, 'width': W, 'height': H, 'compiledShaders': compiled, 'linkedPrograms': linked,
           'atlasUploads': len(uploads), 'atlasBytes': len(atlas), 'glyphs': len(data['glyphs']),
           'checkedCells': checked_cells, 'gpuErrors': 0, 'browserValidated': False, 'uiDomValidated': False,
           'snapshots': results}
(OUT / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
(OUT / 'commands.json.gz').write_bytes(gzip.compress((OUT / 'commands.json').read_bytes(), mtime=0))
(OUT / 'commands.json').unlink()
capture_file.unlink()
print(json.dumps({key: value for key, value in summary.items() if key != 'snapshots'}))
egl('eglMakeCurrent', U, P, P, P, P)(display, None, None, None)
egl('eglDestroyContext', U, P, P)(display, context)
egl('eglDestroySurface', U, P, P)(display, surface)
egl('eglTerminate', U, P)(display)
