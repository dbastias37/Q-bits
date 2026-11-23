#!/usr/bin/env python3
"""Replay production family render commands on Mesa GLES, without browser automation.
Requires system libEGL.so.1 and Node. Outputs PNG snapshots in /tmp by default.
This validates GLSL, draw commands and rendered pixels, not browser input or UI.
"""
import ctypes as C
import gzip, hashlib, json, subprocess, sys, struct, zlib, os
from pathlib import Path
OUT=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/tmp/qbits-families')
OUT.mkdir(parents=True,exist_ok=True)
subprocess.run(['node',str(Path(__file__).with_name('capture-families-frame.cjs')),str(OUT/'commands.json'),sys.argv[2] if len(sys.argv)>2 else '800',sys.argv[3] if len(sys.argv)>3 else '600'],check=True)
data=json.loads((OUT/'commands.json').read_text());W=data['width'];H=data['height']
E=C.CDLL('libEGL.so.1')
def egl(name,result,*args):
 f=getattr(E,name);f.restype=result;f.argtypes=list(args);return f
getproc=egl('eglGetProcAddress',C.c_void_p,C.c_char_p)
def gl(name,result,*args):
 p=getproc(name.encode())
 if not p:raise RuntimeError('Missing '+name)
 return C.CFUNCTYPE(result,*args)(p)
getDisplay=C.CFUNCTYPE(C.c_void_p,C.c_uint,C.c_void_p,C.POINTER(C.c_int))(getproc(b'eglGetPlatformDisplayEXT'))
d=getDisplay(0x31DD,None,None);major=C.c_int();minor=C.c_int()
assert egl('eglInitialize',C.c_uint,C.c_void_p,C.POINTER(C.c_int),C.POINTER(C.c_int))(d,C.byref(major),C.byref(minor))
attrs=(C.c_int*15)(0x3033,1,0x3040,4,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3025,16,0x3038)
config=C.c_void_p();count=C.c_int()
assert egl('eglChooseConfig',C.c_uint,C.c_void_p,C.POINTER(C.c_int),C.POINTER(C.c_void_p),C.c_int,C.POINTER(C.c_int))(d,attrs,C.byref(config),1,C.byref(count)) and count.value
assert egl('eglBindAPI',C.c_uint,C.c_uint)(0x30A0)
surf=egl('eglCreatePbufferSurface',C.c_void_p,C.c_void_p,C.c_void_p,C.POINTER(C.c_int))(d,config,(C.c_int*5)(0x3057,W,0x3056,H,0x3038))
context_version=3 if os.environ.get('QBITS_RENDER_BACKEND')=='webgl2' else 2
ctx=egl('eglCreateContext',C.c_void_p,C.c_void_p,C.c_void_p,C.c_void_p,C.POINTER(C.c_int))(d,config,None,(C.c_int*3)(0x3098,context_version,0x3038))
assert surf and ctx and egl('eglMakeCurrent',C.c_uint,C.c_void_p,C.c_void_p,C.c_void_p,C.c_void_p)(d,surf,surf,ctx)
getString=gl('glGetString',C.c_char_p,C.c_uint)
graphics={'version':getString(0x1f02).decode(),'renderer':getString(0x1f01).decode()}
print(json.dumps(graphics))
U=C.c_uint;I=C.c_int;F=C.c_float;P=C.c_void_p
functions={}
signatures={
 'createShader':(U,U),'createProgram':(U,),
 'compileShader':(None,U),'attachShader':(None,U,U),'linkProgram':(None,U),
 'bindBuffer':(None,U,U),'useProgram':(None,U),'bindVertexArray':(None,U),
 'getAttribLocation':(I,U,C.c_char_p),'getUniformLocation':(I,U,C.c_char_p),
 'enableVertexAttribArray':(None,U),'disableVertexAttribArray':(None,U),
 'vertexAttribPointer':(None,U,I,U,C.c_ubyte,I,P),
 'uniform1f':(None,I,F),'uniform2f':(None,I,F,F),'uniform3f':(None,I,F,F,F),'uniform4f':(None,I,F,F,F,F),
 'viewport':(None,I,I,I,I),'clearColor':(None,F,F,F,F),'clear':(None,U),
 'enable':(None,U),'disable':(None,U),'depthMask':(None,C.c_ubyte),'blendFunc':(None,U,U),
 'drawArrays':(None,U,I,I),
}
for name,(result,*args) in signatures.items():functions[name]=gl('gl'+name[0].upper()+name[1:],result,*args)
shaderSource=gl('glShaderSource',None,U,I,C.POINTER(C.c_char_p),C.POINTER(I))
genBuffers=gl('glGenBuffers',None,I,C.POINTER(U))
genVertexArrays=gl('glGenVertexArrays',None,I,C.POINTER(U))
deleteVertexArrays=gl('glDeleteVertexArrays',None,I,C.POINTER(U))
bufferData=gl('glBufferData',None,U,C.c_ssize_t,P,U)
bufferSubData=gl('glBufferSubData',None,U,C.c_ssize_t,C.c_ssize_t,P)
matrix=gl('glUniformMatrix4fv',None,I,I,C.c_ubyte,C.POINTER(F))
vec3=gl('glUniform3fv',None,I,I,C.POINTER(F));vec4=gl('glUniform4fv',None,I,I,C.POINTER(F))
getShader=gl('glGetShaderiv',None,U,U,C.POINTER(I));getProgram=gl('glGetProgramiv',None,U,U,C.POINTER(I))
shaderLog=gl('glGetShaderInfoLog',None,U,I,C.POINTER(I),C.c_char_p);programLog=gl('glGetProgramInfoLog',None,U,I,C.POINTER(I),C.c_char_p)
getError=gl('glGetError',U);readPixels=gl('glReadPixels',None,I,I,I,I,U,U,P)
handles={};locations={};attributeLocations={};compiled=0;linked=0

def replay(command):
 global compiled,linked
 name,*args=command
 if name in ('createShader','createProgram'):
  key=args.pop(0);handles[key]=functions[name](*args)
 elif name=='createBuffer':
  b=U();genBuffers(1,C.byref(b));handles[args[0]]=b.value
 elif name=='createVertexArray':
  b=U();genVertexArrays(1,C.byref(b));handles[args[0]]=b.value
 elif name=='deleteVertexArray':
  b=U(handles.pop(args[0]));deleteVertexArrays(1,C.byref(b))
 elif name=='shaderSource':
  source=C.c_char_p(args[1].encode());shaderSource(handles[args[0]],1,C.byref(source),None)
 elif name=='bufferData':
  raw=(F*len(args[1]))(*args[1]);bufferData(args[0],C.sizeof(raw),raw,args[2])
 elif name=='bufferSubData':
  raw=(F*len(args[2]))(*args[2]);bufferSubData(args[0],args[1],C.sizeof(raw),raw)
 elif name in ('getAttribLocation','getUniformLocation'):
  key,p,attr=args;value=functions[name](handles[p],attr.encode())
  (attributeLocations if name=='getAttribLocation' else locations)[key]=value
  assert value>=0,(name,attr,value)
 elif name in ('uniformMatrix4fv','uniform3fv','uniform4fv'):
  raw=(F*len(args[-1]))(*args[-1]);location=locations[args[0]]
  if name=='uniformMatrix4fv':matrix(location,1,args[1],raw)
  else:(vec3 if name=='uniform3fv' else vec4)(location,len(args[-1])//(3 if name=='uniform3fv' else 4),raw)
 else:
  if name in ('compileShader','linkProgram','useProgram'):args[0]=handles[args[0]]
  elif name=='attachShader':args=[handles[x] for x in args]
  elif name=='bindBuffer':args[1]=handles[args[1]]
  elif name=='bindVertexArray':args[0]=handles[args[0]] if args[0] is not None else 0
  elif name.startswith('uniform'):args[0]=locations[args[0]]
  elif name in ('enableVertexAttribArray','disableVertexAttribArray','vertexAttribPointer'):
   args[0]=attributeLocations[args[0]]
   if name=='vertexAttribPointer':args[-1]=P(args[-1])
  if name not in functions:raise RuntimeError('Unimplemented '+name)
  functions[name](*args)
  if name in ('compileShader','linkProgram'):
   status=I();log=C.create_string_buffer(8192)
   if name=='compileShader':getShader(args[0],0x8b81,C.byref(status));shaderLog(args[0],len(log),None,log);compiled+=1
   else:getProgram(args[0],0x8b82,C.byref(status));programLog(args[0],len(log),None,log);linked+=1
   assert status.value,(name,log.value.decode())
 error=getError()
 assert error==0,(name,args,hex(error))

def png(path,pixels):
 def chunk(kind,b):return struct.pack('!I',len(b))+kind+b+struct.pack('!I',zlib.crc32(kind+b)&0xffffffff)
 raw=b''.join(b'\0'+pixels[y*W*4:(y+1)*W*4] for y in range(H-1,-1,-1))
 path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',W,H,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw,6))+chunk(b'IEND',b''))

for command in data['init']:replay(command)
results=[];all_pixels={}
for shot in data['snapshots']:
 for command in shot['commands']:replay(command)
 pixels=(C.c_ubyte*(W*H*4))();readPixels(0,0,W,H,0x1908,0x1401,pixels);assert getError()==0
 raw=bytes(pixels);all_pixels[shot['name']]=raw;png(OUT/(shot['name']+'.png'),raw)
 rgb=list(zip(raw[0::4],raw[1::4],raw[2::4]))
 foreground=sum(abs(r-237)+abs(g-242)+abs(b-240)>25 for r,g,b in rgb)
 blue=sum(b>r+40 and b>g+15 for r,g,b in rgb)
 red=sum(r>g+35 and r>b+35 for r,g,b in rgb)
 green=sum(g>r+35 and g>b+20 for r,g,b in rgb)
 cyan=sum(b>r+20 and g>r+20 for r,g,b in rgb)
 yellow=sum(r>b+40 and g>b+25 for r,g,b in rgb)
 dark=sum(max(r,g,b)<70 for r,g,b in rgb)
 assert foreground>500,(shot['name'],'missing rendered family',foreground)
 assert shot['familyBodies']==1,(shot['name'],'unexpected physical family count')
 assert all(f['shapes']==1 for f in shot['inventory']),(shot['name'],'stored pieces added collision shapes')
 assert shot['effects']<=16,(shot['name'],'visual effect budget exceeded')
 assert len(shot['liquids'])==sum(f['battery'] for f in shot['inventory']),(shot['name'],'liquid vessel count differs from battery families')
 assert all(len(liquid['partIds'])==1 for liquid in shot['liquids']),(shot['name'],'internal battery pieces became individual liquid vessels')
 if shot['kind'] in ('shell','battery','occlusion','animation','animation-complete'):assert shot['livePieces']==0,(shot['name'],'stored pieces materialized during rendering')
 results.append({key:shot[key] for key in ['name','kind','inventory','liquids','familyBodies','livePieces','effects']}|{'foregroundPixels':foreground,'bluePixels':blue,'redPixels':red,'greenPixels':green,'cyanPixels':cyan,'yellowPixels':yellow,'darkPixels':dark,'drawCalls':sum(command[0]=='drawArrays' for command in shot['commands']),'rgbaSha256':hashlib.sha256(raw).hexdigest(),'png':shot['name']+'.png'})
by_name={result['name']:result for result in results}
assert by_name['family-black']['darkPixels']>1000,'black family missing'
assert by_name['family-yellow']['yellowPixels']>1000,'yellow family missing'
blue_values=[by_name['family-battery-blue-'+str(level)]['bluePixels'] for level in [0,25,75,100]]
# The permanent family bands also carry its color at zero charge. Compare
# against that baseline instead of treating every blue pixel as stored energy.
assert all(a<b for a,b in zip(blue_values,blue_values[1:])) and blue_values[-1]-blue_values[0]>1000,('blue charge does not match fill',blue_values)
assert by_name['family-battery-red-75']['redPixels']>1000,'red battery ignores family color'
assert by_name['family-battery-red-75']['bluePixels']<100,'red battery retains blue charge'
assert all(result['greenPixels']<20 for result in results if result['kind']=='battery'),'selected battery colors retain a green liquid surface'
assert by_name['family-battery-red-occluded']['redPixels']<by_name['family-battery-red-75']['redPixels']*.75,'foreground failed to occlude battery charge'
tilted=by_name['family-battery-blue-tilted-50']['liquids'][0]
assert tilted['surface'] and max(p[1] for p in tilted['surface'])-min(p[1] for p in tilted['surface'])<1e-5,'resting liquid tilts with the container instead of gravity'
impulse=by_name['family-battery-blue-slosh-impulse']['liquids'][0]
paused=by_name['family-battery-blue-slosh-paused']['liquids'][0]
settled=by_name['family-battery-blue-slosh-settled']['liquids'][0]
assert abs(impulse['normal'][0])+abs(impulse['normal'][2])>.01,'controlled motion produces no liquid response'
assert impulse==paused,'pausing changed the liquid or rebuilt its buffer'
assert abs(settled['normal'][0])+abs(settled['normal'][2])<1e-4,'liquid does not settle'
assert impulse['buffer']==settled['buffer'] and settled['uploads']>impulse['uploads'],'liquid buffer is not reused across motion'
assert all_pixels['family-battery-blue-slosh-impulse']==all_pixels['family-battery-blue-slosh-paused'],'paused liquid frame changes'
assert all_pixels['family-battery-blue-slosh-impulse']!=all_pixels['family-battery-blue-slosh-settled'],'liquid motion does not affect rendered pixels'
assert by_name['family-placement-blue']['cyanPixels']>300,'placement guide is not blue'
assert by_name['family-withdraw-blue']['cyanPixels']>500,'extraction guide is not blue'
assert by_name['family-placement-blocked']['redPixels']>by_name['family-placement-blue']['redPixels']+1000,'blocked guide is not red'
assert by_name['family-placement-blocked']['cyanPixels']==0,'blocked guide retains the valid blue tint'
assert all_pixels['family-animation-a']!=all_pixels['family-animation-b'],'grouping animation frames do not change'
assert by_name['family-animation-complete']['effects']==0,'animation did not release temporary pieces'
assert not data['validation'],'invalid attributes or depth clear'
summary={'backend':data['backend'],'sourceSha256':data['sourceSha256'],'graphics':graphics,'width':W,'height':H,'compiledShaders':compiled,'linkedPrograms':linked,'gpuErrors':0,'browserValidated':False,'uiDomValidated':False,'snapshots':results}
(OUT/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
(OUT/'commands.json.gz').write_bytes(gzip.compress((OUT/'commands.json').read_bytes(),mtime=0))
(OUT/'commands.json').unlink()
print(json.dumps(summary))
egl('eglMakeCurrent',U,P,P,P,P)(d,None,None,None)
egl('eglDestroyContext',U,P,P)(d,ctx);egl('eglDestroySurface',U,P,P)(d,surf);egl('eglTerminate',U,P)(d)
