#!/usr/bin/env python3
"""Render the actual glass shader and actual radial meshes on real GLES.

Uses only Python/Node standard libraries and system EGL/GLES. No browser,
image mocks, or packages. Synthetic room/diagnostic textures make refraction
and blur measurable; these frames are not screenshots of a complete game.
Usage: python3 tests/validate-glass-gles.py [output_directory] [width] [height]
"""
import ctypes as C
import json
import math
import struct
import subprocess
import sys
import zlib
from pathlib import Path

OUT=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/tmp/qbits-glass')
W=int(sys.argv[2]) if len(sys.argv)>2 else 1280
H=int(sys.argv[3]) if len(sys.argv)>3 else 720
OUT.mkdir(parents=True,exist_ok=True)
subprocess.run(['node',str(Path(__file__).with_name('capture-glass.cjs')),str(OUT/'geometry.json'),str(W),str(H)],check=True)
data=json.loads((OUT/'geometry.json').read_text())
U=C.c_uint;I=C.c_int;F=C.c_float;P=C.c_void_p
E=C.CDLL('libEGL.so.1')
def egl(name,result,*args):
 f=getattr(E,name);f.restype=result;f.argtypes=list(args);return f
getproc=egl('eglGetProcAddress',P,C.c_char_p)
def gl(name,result,*args):
 p=getproc(name.encode())
 if not p:raise RuntimeError('Missing GL function '+name)
 return C.CFUNCTYPE(result,*args)(p)
display=C.CFUNCTYPE(P,U,P,C.POINTER(I))(getproc(b'eglGetPlatformDisplayEXT'))(0x31DD,None,None)
major=I();minor=I()
assert egl('eglInitialize',U,P,C.POINTER(I),C.POINTER(I))(display,C.byref(major),C.byref(minor))
config=P();count=I()
assert egl('eglChooseConfig',U,P,C.POINTER(I),C.POINTER(P),I,C.POINTER(I))(display,(I*13)(0x3033,1,0x3040,4,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3038),C.byref(config),1,C.byref(count)) and count.value
assert egl('eglBindAPI',U,U)(0x30A0)
surface=egl('eglCreatePbufferSurface',P,P,P,C.POINTER(I))(display,config,(I*5)(0x3057,W,0x3056,H,0x3038))
context=egl('eglCreateContext',P,P,P,P,C.POINTER(I))(display,config,None,(I*3)(0x3098,2,0x3038))
assert surface and context and egl('eglMakeCurrent',U,P,P,P,P)(display,surface,surface,context)
getString=gl('glGetString',C.c_char_p,U)
print(json.dumps({'renderer':getString(0x1f01).decode(),'version':getString(0x1f02).decode()}))
createShader=gl('glCreateShader',U,U);source=gl('glShaderSource',None,U,I,C.POINTER(C.c_char_p),C.POINTER(I));compileShader=gl('glCompileShader',None,U)
getShader=gl('glGetShaderiv',None,U,U,C.POINTER(I));shaderLog=gl('glGetShaderInfoLog',None,U,I,C.POINTER(I),C.c_char_p)
createProgram=gl('glCreateProgram',U);attach=gl('glAttachShader',None,U,U);link=gl('glLinkProgram',None,U);getProgram=gl('glGetProgramiv',None,U,U,C.POINTER(I));programLog=gl('glGetProgramInfoLog',None,U,I,C.POINTER(I),C.c_char_p)
use=gl('glUseProgram',None,U);getUniform=gl('glGetUniformLocation',I,U,C.c_char_p);getAttribute=gl('glGetAttribLocation',I,U,C.c_char_p)
uniform1i=gl('glUniform1i',None,I,I);uniform1f=gl('glUniform1f',None,I,F);uniform2f=gl('glUniform2f',None,I,F,F)
genBuffers=gl('glGenBuffers',None,I,C.POINTER(U));bindBuffer=gl('glBindBuffer',None,U,U);bufferData=gl('glBufferData',None,U,C.c_ssize_t,P,U)
enableAttrib=gl('glEnableVertexAttribArray',None,U);disableAttrib=gl('glDisableVertexAttribArray',None,U);attributePointer=gl('glVertexAttribPointer',None,U,I,U,C.c_ubyte,I,P)
genTextures=gl('glGenTextures',None,I,C.POINTER(U));bindTexture=gl('glBindTexture',None,U,U);parameter=gl('glTexParameteri',None,U,U,I);textureImage=gl('glTexImage2D',None,U,I,I,I,I,I,U,U,P)
copy=gl('glCopyTexSubImage2D',None,U,I,I,I,I,I,I,I);activeTexture=gl('glActiveTexture',None,U)
viewport=gl('glViewport',None,I,I,I,I);enable=gl('glEnable',None,U);disable=gl('glDisable',None,U);blend=gl('glBlendFunc',None,U,U)
draw=gl('glDrawArrays',None,U,I,I);read=gl('glReadPixels',None,I,I,I,I,U,U,P);getError=gl('glGetError',U)
def program(vertex,fragment):
 p=createProgram()
 for kind,body in [(0x8b31,vertex),(0x8b30,fragment)]:
  shader=createShader(kind);text=C.c_char_p(body.encode());source(shader,1,C.byref(text),None);compileShader(shader);status=I();getShader(shader,0x8b81,C.byref(status));log=C.create_string_buffer(8192);shaderLog(shader,len(log),None,log)
  assert status.value,log.value.decode();attach(p,shader)
 link(p);status=I();getProgram(p,0x8b82,C.byref(status));log=C.create_string_buffer(8192);programLog(p,len(log),None,log)
 assert status.value,log.value.decode()
 return p
def buffer(values):
 b=U();genBuffers(1,C.byref(b));bindBuffer(0x8892,b);raw=(F*len(values))(*values);bufferData(0x8892,C.sizeof(raw),raw,0x88e4);return b.value
def pixels():
 raw=(C.c_ubyte*(W*H*4))();read(0,0,W,H,0x1908,0x1401,raw);assert getError()==0;return bytes(raw)
def png(name,raw):
 def chunk(kind,payload):return struct.pack('!I',len(payload))+kind+payload+struct.pack('!I',zlib.crc32(kind+payload)&0xffffffff)
 rows=b''.join(b'\0'+raw[y*W*4:(y+1)*W*4] for y in range(H-1,-1,-1))
 (OUT/(name+'.png')).write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',W,H,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(rows,6))+chunk(b'IEND',b''))
def pixel(raw,x,y):
 index=((H-1-int(y))*W+int(x))*4
 return raw[index:index+3]
def gray(raw,x,y):return sum(pixel(raw,x,y))/3

backgroundVertex='attribute vec2 aPosition;varying vec2 vUV;void main(){vUV=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}'
backgroundFragment='''precision mediump float;varying vec2 vUV;uniform vec2 uViewport;uniform float uMode;
float box(vec2 p,vec2 a,vec2 b){return step(a.x,p.x)*step(a.y,p.y)*(1.-step(b.x,p.x))*(1.-step(b.y,p.y));}
void main(){vec2 uv=vec2(vUV.x,1.-vUV.y),p=uv*uViewport;
 if(uMode>1.5){float stripe=step(.5,fract(p.x/6.));gl_FragColor=vec4(vec3(.12+.72*stripe),1.);return;}
 vec3 c=mix(vec3(.91,.94,.93),vec3(.99),uv.y);if(uv.y<.47)c=mix(vec3(.78,.84,.82),vec3(.94,.96,.95),uv.y/.47);
 float grid=(1.-step(.018,fract(uv.x*14.+uv.y*3.)))+(1.-step(.025,fract((uv.y-.47)*12.)));
 if(uv.y>.47)c-=vec3(.055)*min(1.,grid);
 float cubes=box(uv,vec2(.25,.29),vec2(.33,.43))+box(uv,vec2(.62,.56),vec2(.73,.73))+box(uv,vec2(.47,.12),vec2(.51,.19));
 c=mix(c,vec3(.24,.30,.30),clamp(cubes,0.,1.));
 float face=box(uv,vec2(.30,.29),vec2(.33,.43))+box(uv,vec2(.69,.56),vec2(.73,.73));c-=vec3(.10)*face;
 if(uMode>.5)c=mix(vec3(.025,.065,.08),vec3(.22,.43,.46),1.-c);
 gl_FragColor=vec4(c,1.);}'''
bg=program(backgroundVertex,backgroundFragment)
quad=buffer([-1,-1,1,-1,-1,1,1,1]);bgAttribute=getAttribute(bg,b'aPosition')
functions={
 'bindBuffer':bindBuffer,'bindTexture':bindTexture,'copyTexSubImage2D':copy,
 'useProgram':use,'enable':enable,'disable':disable,'blendFunc':blend,'activeTexture':activeTexture,
 'texParameteri':parameter,'viewport':viewport,'drawArrays':draw,
 'enableVertexAttribArray':enableAttrib,'disableVertexAttribArray':disableAttrib,'vertexAttribPointer':attributePointer,
 'uniform1f':uniform1f,'uniform1i':uniform1i,'uniform2f':uniform2f,
 'bindFramebuffer':gl('glBindFramebuffer',None,U,U),
 'framebufferTexture2D':gl('glFramebufferTexture2D',None,U,U,U,U,I),
 'blendFuncSeparate':gl('glBlendFuncSeparate',None,U,U,U,U),
 'deleteShader':gl('glDeleteShader',None,U),'deleteProgram':gl('glDeleteProgram',None,U),
}
handles={};locations={};uniformNames={};first=True;compiled=2;linked=1
def replay(command,thickness_scale):
 global compiled,linked
 name,*args=command
 if name=='createShader':handles[args[0]]=createShader(args[1])
 elif name=='createProgram':handles[args[0]]=createProgram()
 elif name in ['createBuffer','createTexture','createFramebuffer']:
  value=U();gl('glGen'+name[6:]+'s',None,I,C.POINTER(U))(1,C.byref(value));handles[args[0]]=value.value
 elif name=='shaderSource':
  text=C.c_char_p(args[1].encode());source(handles[args[0]],1,C.byref(text),None)
 elif name=='attachShader':attach(handles[args[0]],handles[args[1]])
 elif name in ['compileShader','linkProgram']:
  value=handles[args[0]];status=I();log=C.create_string_buffer(8192)
  if name=='compileShader':compileShader(value);getShader(value,0x8b81,C.byref(status));shaderLog(value,len(log),None,log);compiled+=1
  else:link(value);getProgram(value,0x8b82,C.byref(status));programLog(value,len(log),None,log);linked+=1
  assert status.value,(name,log.value.decode())
 elif name in ['getAttribLocation','getUniformLocation']:
  key,p,attribute=args;locations[key]=(getAttribute if name=='getAttribLocation' else getUniform)(handles[p],attribute.encode());uniformNames[key]=attribute
  assert locations[key]>=0,(name,attribute)
 elif name=='bufferData':
  raw=(F*len(args[1]))(*args[1]);bufferData(args[0],C.sizeof(raw),raw,args[2])
 elif name=='texImage2D':
  raw=None if args[-1] is None else (C.c_ubyte*len(args[-1]))(*args[-1]);textureImage(*args[:-1],raw)
 elif name in ['deleteBuffer','deleteTexture','deleteFramebuffer']:
  value=U(handles[args[0]]);gl('glDelete'+name[6:]+'s',None,I,C.POINTER(U))(1,C.byref(value))
 else:
  if name in ['useProgram','deleteShader','deleteProgram']:args[0]=handles[args[0]] if args[0] is not None else 0
  elif name in ['bindBuffer','bindTexture','bindFramebuffer']:args[1]=handles[args[1]] if args[1] is not None else 0
  elif name=='framebufferTexture2D':args[3]=handles[args[3]] if args[3] is not None else 0
  elif name.startswith('uniform'):
   if name=='uniform1f' and uniformNames[args[0]]=='uThickness':args[1]*=thickness_scale
   args[0]=locations[args[0]]
  elif name in ['enableVertexAttribArray','disableVertexAttribArray','vertexAttribPointer']:
   args[0]=locations[args[0]]
   if name=='vertexAttribPointer':args[-1]=P(args[-1])
  if name not in functions:raise RuntimeError('Unimplemented production GL operation '+name)
  functions[name](*args)
 assert getError()==0,('GLES error in production operation',name,args)
viewport(0,0,W,H);disable(0x0b71);disable(0x0b44)
def render(mode,thickness_scale=1):
 global first
 disable(0x0be2);use(bg);bindBuffer(0x8892,quad);enableAttrib(bgAttribute);attributePointer(bgAttribute,2,0x1406,0,0,None)
 uniform2f(getUniform(bg,b'uViewport'),W,H);uniform1f(getUniform(bg,b'uMode'),mode);draw(5,0,4);disableAttrib(bgAttribute)
 before=pixels()
 for command in data['firstCommands' if first else 'repeatCommands']:replay(command,thickness_scale)
 first=False
 assert getError()==0,'GLES glass draw produced an error'
 return before,pixels()

reports=[]
for mode,name in [(0,'room'),(1,'dark'),(2,'diagnostic')]:
 before,after=render(mode);png(name+'-before',before);png(name,after)
 g=data['layout'];hole=(g['cx'],g['cy']-g['inner']*.20)
 for x,y in [(2,2),(W-3,2),(2,H-3),(W-3,H-3),hole]:
  assert pixel(before,x,y)==pixel(after,x,y),(name,'pixels outside the material changed',(x,y))
 reports.append({'scene':name,'path':str(OUT/(name+'.png'))})
 if mode==2:
  card=g['cards'][0];margin=max(10,min(24,card['height']*.18));y=card['top']+card['height']*.45
  xs=range(math.ceil(card['left']+margin),math.floor(card['left']+card['width']-margin))
  def contrast(raw):
   values=[gray(raw,x,y) for x in xs];mean=sum(values)/len(values);return math.sqrt(sum((v-mean)**2 for v in values)/len(values))
  beforeContrast=contrast(before);afterContrast=contrast(after)
  assert afterContrast<beforeContrast*.90,('frosted face must reduce high-frequency contrast',beforeContrast,afterContrast)
  _,flat=render(mode,0);png('diagnostic-no-refraction',flat)
  # The same mesh and shader, changing only optical thickness. A transparent
  # outline alone cannot produce a different sampled background at its rim.
  edge=[];center=[]
  for y in range(int(card['top']+margin),int(card['top']+card['height']-margin),2):
   for x in range(int(card['left'])+1,int(card['left']+card['width'])-1,2):
    delta=sum(abs(a-b) for a,b in zip(pixel(after,x,y),pixel(flat,x,y)))/3
    distance=min(x-card['left'],card['left']+card['width']-x)
    if distance<max(6,data['panels'][3]['thickness']):edge.append(delta)
    elif distance>margin:center.append(delta)
  edgeDifference=sum(edge)/len(edge);centerDifference=sum(center)/len(center)
  assert edgeDifference>1 and edgeDifference>centerDifference+0.5,('optical thickness must affect sampled rim',edgeDifference,centerDifference)
  reports.append({'faceContrastBefore':round(beforeContrast,3),'faceContrastAfter':round(afterContrast,3),'rimThicknessDifference':round(edgeDifference,3),'centerThicknessDifference':round(centerDifference,3)})
print(json.dumps({'width':W,'height':H,'shaders':compiled,'programs':linked,'panels':len(data['panels']),'checks':'production GL replay, outside/hole unchanged, frosted face contrast reduced, optical thickness changes rim','captures':reports}))
egl('eglMakeCurrent',U,P,P,P,P)(display,None,None,None)
egl('eglDestroyContext',U,P,P)(display,context);egl('eglDestroySurface',U,P,P)(display,surface);egl('eglTerminate',U,P)(display)
