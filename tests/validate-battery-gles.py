#!/usr/bin/env python3
"""Replay production battery render commands on Mesa GLES, without browser automation.
Requires system libEGL.so.1 and Node. Outputs PNG snapshots in /tmp by default.
This validates GLSL, draw commands and rendered pixels, not browser input or UI.
"""
import ctypes as C
import json, subprocess, sys, struct, zlib, math
from pathlib import Path
OUT=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/tmp/qbits-battery')
OUT.mkdir(parents=True,exist_ok=True)
subprocess.run(['node',str(Path(__file__).with_name('capture-battery-frame.cjs')),str(OUT/'commands.json'),sys.argv[2] if len(sys.argv)>2 else '640',sys.argv[3] if len(sys.argv)>3 else '480'],check=True)
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
ctx=egl('eglCreateContext',C.c_void_p,C.c_void_p,C.c_void_p,C.c_void_p,C.POINTER(C.c_int))(d,config,None,(C.c_int*3)(0x3098,2,0x3038))
assert surf and ctx and egl('eglMakeCurrent',C.c_uint,C.c_void_p,C.c_void_p,C.c_void_p,C.c_void_p)(d,surf,surf,ctx)
getString=gl('glGetString',C.c_char_p,C.c_uint)
print(json.dumps({'version':getString(0x1f02).decode(),'renderer':getString(0x1f01).decode()}))
U=C.c_uint;I=C.c_int;F=C.c_float;P=C.c_void_p
functions={}
signatures={
 'createShader':(U,U),'createProgram':(U,),
 'compileShader':(None,U),'attachShader':(None,U,U),'linkProgram':(None,U),
 'bindBuffer':(None,U,U),'useProgram':(None,U),
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
results=[]
for shot in data['snapshots']:
 # Replay the actual command list; state remains live across captures as in WebGL.
 for command in shot['commands']:replay(command)
 pixels=(C.c_ubyte*(W*H*4))();readPixels(0,0,W,H,0x1908,0x1401,pixels);assert getError()==0
 raw=bytes(pixels);png(OUT/(shot['name']+'.png'),raw)
 green=sum(g>r+40 and g>b+30 and g>80 for r,g,b in zip(raw[0::4],raw[1::4],raw[2::4]))
 vessel=sum(abs(r-237)+abs(g-242)+abs(b-240)>25 for r,g,b in zip(raw[0::4],raw[1::4],raw[2::4]))
 assert vessel>100,(shot['name'],'missing vessel')
 dark=sum(max(r,g,b)<90 for r,g,b in zip(raw[0::4],raw[1::4],raw[2::4]))
 results.append({'name':shot['name'],'cells':shot['cells'],'level':shot['level'],'greenPixels':green,'vesselPixels':vessel,'darkPixels':dark,'path':str(OUT/(shot['name']+'.png'))})
byName={s['name']:s for s in results}
for cells in [1,2,3]:
 values=[byName[f'battery-{cells}-{level}']['greenPixels'] for level in [0,25,50,100]]
 assert values[0]==0,(cells,'empty vessel retains green charge',values)
 assert 100<values[1]<values[2]<values[3],(cells,'fill must visibly increase',values)
 assert byName[f'battery-{cells}-0']['vesselPixels']>200,'empty glass/cap must remain visible'
assert byName['battery-3-100-occluded']['greenPixels']<byName['battery-3-100']['greenPixels']*.75,'foreground must occlude charge and glass'
assert byName['battery-1-0-behind']['darkPixels']>byName['battery-1-0']['darkPixels']+100,'background Q-bit must be visible through the empty vessel'
assert byName['battery-1-100-behind']['darkPixels']<byName['battery-1-0-behind']['darkPixels']*.8,'full reservoir must occlude the background Q-bit'
for shot in data['snapshots']:
 if shot['surface'] and not shot['slosh']:
  ys=[point[1] for point in shot['surface']]
  assert max(ys)-min(ys)<2e-6,(shot['name'],'resting liquid is not level in world space')
  assert abs(shot['normal'][1]-1)<1e-9,(shot['name'],'resting normal is not world up')
 if shot['name'].startswith(('battery-tilted-45','battery-side-90','battery-bar-90','battery-upside-down','battery-stacked','battery-depth')):
  assert byName[shot['name']]['greenPixels']>300,(shot['name'],'rotated liquid missing')
assert byName['battery-tilted-empty-behind']['greenPixels']==0,'rotated empty vessel has residue'
assert byName['battery-tilted-full-behind']['darkPixels']<byName['battery-tilted-empty-behind']['darkPixels'],'rotated full liquid must occlude the rear body'
impulse=next(shot for shot in data['snapshots'] if shot['name']=='battery-slosh-impulse')
tilt=math.acos(max(-1,min(1,impulse['normal'][1])))
assert .001<tilt<=math.radians(12)+1e-8,('slosh must be visible and bounded',tilt)
assert (OUT/'battery-slosh-settled.png').read_bytes()==(OUT/'battery-3-50.png').read_bytes(),'settled liquid must return to its original rendered surface'
assert not data['validation'],'invalid attributes or depth clear'
print(json.dumps({'compiledShaders':compiled,'linkedPrograms':linked,'gpuErrors':0,'snapshots':results}))
egl('eglMakeCurrent',U,P,P,P,P)(d,None,None,None)
egl('eglDestroyContext',U,P,P)(d,ctx);egl('eglDestroySurface',U,P,P)(d,surf);egl('eglTerminate',U,P)(d)
