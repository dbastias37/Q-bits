#!/usr/bin/env python3
"""Optional real GLSL/pixel regression check for held-piece focus.

Run from any directory:
    python tests/validate-focus-gles.py [path/to/assets/js/game.js]

Requires Python 3 standard library and a system libEGL.so.1 implementation
supporting EGL_EXT_platform_base + surfaceless OpenGL ES (for example Mesa
llvmpipe). No Python/Node packages, app dependencies, network or display server
are needed. Capability failures are errors, never silent passes.

This compiles and links the actual scene/focus shaders, then renders a 64x64
texture fixture on real GLES. It verifies that disabled focus preserves pixels,
held-mask pixels remain sharp, the room softens, and foreground silhouettes do
not bleed into the room. This is not a browser or full-game visual test.
"""
import ctypes as C
import json
import re
import sys
from pathlib import Path
E=C.CDLL('libEGL.so.1')
def egl(name,result,*args):
 f=getattr(E,name);f.restype=result;f.argtypes=list(args);return f
getproc=egl('eglGetProcAddress',C.c_void_p,C.c_char_p)
def gl(name,result,*args):
 p=getproc(name.encode())
 if not p:raise RuntimeError('Missing GL procedure '+name)
 return C.CFUNCTYPE(result,*args)(p)
getDisplay=C.CFUNCTYPE(C.c_void_p,C.c_uint,C.c_void_p,C.POINTER(C.c_int))(getproc(b'eglGetPlatformDisplayEXT'))
d=getDisplay(0x31DD,None,None)
major=C.c_int();minor=C.c_int()
assert egl('eglInitialize',C.c_uint,C.c_void_p,C.POINTER(C.c_int),C.POINTER(C.c_int))(d,C.byref(major),C.byref(minor)), 'eglInitialize failed'
attrs=(C.c_int*13)(0x3033,1,0x3040,4,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3038)
config=C.c_void_p();count=C.c_int()
assert egl('eglChooseConfig',C.c_uint,C.c_void_p,C.POINTER(C.c_int),C.POINTER(C.c_void_p),C.c_int,C.POINTER(C.c_int))(d,attrs,C.byref(config),1,C.byref(count)) and count.value
assert egl('eglBindAPI',C.c_uint,C.c_uint)(0x30A0)
pbufferAttrs=(C.c_int*5)(0x3057,16,0x3056,16,0x3038)
surf=egl('eglCreatePbufferSurface',C.c_void_p,C.c_void_p,C.c_void_p,C.POINTER(C.c_int))(d,config,pbufferAttrs)
ctxAttrs=(C.c_int*3)(0x3098,2,0x3038)
ctx=egl('eglCreateContext',C.c_void_p,C.c_void_p,C.c_void_p,C.c_void_p,C.POINTER(C.c_int))(d,config,None,ctxAttrs)
assert ctx and surf
assert egl('eglMakeCurrent',C.c_uint,C.c_void_p,C.c_void_p,C.c_void_p,C.c_void_p)(d,surf,surf,ctx)
getString=gl('glGetString',C.c_char_p,C.c_uint)
print(json.dumps({'version':getString(0x1F02).decode(),'renderer':getString(0x1F01).decode()}))
create=gl('glCreateShader',C.c_uint,C.c_uint)
shaderSource=gl('glShaderSource',None,C.c_uint,C.c_int,C.POINTER(C.c_char_p),C.POINTER(C.c_int))
compileShader=gl('glCompileShader',None,C.c_uint)
getShader=gl('glGetShaderiv',None,C.c_uint,C.c_uint,C.POINTER(C.c_int))
getLog=gl('glGetShaderInfoLog',None,C.c_uint,C.c_int,C.POINTER(C.c_int),C.c_char_p)
compiled={}
game_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / 'assets/js/game.js'
source=game_path.read_text()
for name,body in re.findall(r'(?:const|let)\s+(\w+)\s*=\s*`([\s\S]*?)`',source):
 kind=0x8B31 if 'gl_Position' in body else 0x8B30 if 'gl_FragColor' in body else None
 if kind is None:continue
 if '${' in body:raise RuntimeError('Interpolated shader requires explicit extraction: '+name)
 shader=create(kind);text=C.c_char_p(body.encode());shaderSource(shader,1,C.byref(text),None);compileShader(shader)
 status=C.c_int();getShader(shader,0x8B81,C.byref(status));log=C.create_string_buffer(8192);getLog(shader,len(log),None,log)
 print(json.dumps({'shader':name,'compiled':bool(status.value),'log':log.value.decode()}))
 if not status.value:sys.exit(1)
 compiled[name]=shader
if not compiled:raise RuntimeError('No shader strings found')
createProgram=gl('glCreateProgram',C.c_uint)
attach=gl('glAttachShader',None,C.c_uint,C.c_uint)
link=gl('glLinkProgram',None,C.c_uint)
getProgram=gl('glGetProgramiv',None,C.c_uint,C.c_uint,C.POINTER(C.c_int))
programLog=gl('glGetProgramInfoLog',None,C.c_uint,C.c_int,C.POINTER(C.c_int),C.c_char_p)
pairs=[('vertexSource','fragmentSource'),('focusVertexSource','focusFragmentSource')]
for a,b in pairs:
 if a not in compiled or b not in compiled:continue
 p=createProgram();attach(p,compiled[a]);attach(p,compiled[b]);link(p);status=C.c_int();getProgram(p,0x8B82,C.byref(status));log=C.create_string_buffer(8192);programLog(p,len(log),None,log)
 print(json.dumps({'program':[a,b],'linked':bool(status.value),'log':log.value.decode()}))
 if not status.value:sys.exit(1)

# Real texture fixture: linear sampling matches the production framebuffer.
W=H=64
getUniform=gl('glGetUniformLocation',C.c_int,C.c_uint,C.c_char_p)
getAttrib=gl('glGetAttribLocation',C.c_int,C.c_uint,C.c_char_p)
use=gl('glUseProgram',None,C.c_uint)
genTextures=gl('glGenTextures',None,C.c_int,C.POINTER(C.c_uint))
bindTexture=gl('glBindTexture',None,C.c_uint,C.c_uint)
parameter=gl('glTexParameteri',None,C.c_uint,C.c_uint,C.c_int)
textureImage=gl('glTexImage2D',None,C.c_uint,C.c_int,C.c_int,C.c_int,C.c_int,C.c_int,C.c_uint,C.c_uint,C.c_void_p)
activeTexture=gl('glActiveTexture',None,C.c_uint)
genFramebuffers=gl('glGenFramebuffers',None,C.c_int,C.POINTER(C.c_uint))
bindFramebuffer=gl('glBindFramebuffer',None,C.c_uint,C.c_uint)
attachTexture=gl('glFramebufferTexture2D',None,C.c_uint,C.c_uint,C.c_uint,C.c_uint,C.c_int)
checkFramebuffer=gl('glCheckFramebufferStatus',C.c_uint,C.c_uint)
viewport=gl('glViewport',None,C.c_int,C.c_int,C.c_int,C.c_int)
genBuffers=gl('glGenBuffers',None,C.c_int,C.POINTER(C.c_uint))
bindBuffer=gl('glBindBuffer',None,C.c_uint,C.c_uint)
bufferData=gl('glBufferData',None,C.c_uint,C.c_ssize_t,C.c_void_p,C.c_uint)
enableAttrib=gl('glEnableVertexAttribArray',None,C.c_uint)
vertexAttribPointer=gl('glVertexAttribPointer',None,C.c_uint,C.c_int,C.c_uint,C.c_uint,C.c_int,C.c_void_p)
uniform1i=gl('glUniform1i',None,C.c_int,C.c_int)
uniform1f=gl('glUniform1f',None,C.c_int,C.c_float)
uniform2f=gl('glUniform2f',None,C.c_int,C.c_float,C.c_float)
draw=gl('glDrawArrays',None,C.c_uint,C.c_int,C.c_int)
read=gl('glReadPixels',None,C.c_int,C.c_int,C.c_int,C.c_int,C.c_uint,C.c_uint,C.c_void_p)
error=gl('glGetError',C.c_uint)

def tex(data=None):
 t=C.c_uint();genTextures(1,C.byref(t));bindTexture(0x0DE1,t)
 for key in [0x2801,0x2800]:parameter(0x0DE1,key,0x2601)
 for key in [0x2802,0x2803]:parameter(0x0DE1,key,0x812F)
 a=None if data is None else (C.c_ubyte*len(data))(*data)
 textureImage(0x0DE1,0,0x1908,W,H,0,0x1908,0x1401,a)
 return t.value
out=tex();fb=C.c_uint();genFramebuffers(1,C.byref(fb));bindFramebuffer(0x8D40,fb);attachTexture(0x8D40,0x8CE0,0x0DE1,out,0);assert checkFramebuffer(0x8D40)==0x8CD5
viewport(0,0,W,H)
program=createProgram();attach(program,compiled['focusVertexSource']);attach(program,compiled['focusFragmentSource']);link(program);use(program)
quad=(C.c_float*8)(-1,-1,1,-1,-1,1,1,1);b=C.c_uint();genBuffers(1,C.byref(b));bindBuffer(0x8892,b);bufferData(0x8892,C.sizeof(quad),quad,0x88E4)
attr=getAttrib(program,b'aScreen');enableAttrib(attr);vertexAttribPointer(attr,2,0x1406,0,0,None)

def render(scene,mask,amount):
 st=tex(scene);mt=tex(mask)
 activeTexture(0x84C0);bindTexture(0x0DE1,st);uniform1i(getUniform(program,b'uScene'),0)
 activeTexture(0x84C1);bindTexture(0x0DE1,mt);uniform1i(getUniform(program,b'uMask'),1)
 uniform2f(getUniform(program,b'uStep'),2.8/W,2.8/H);uniform1f(getUniform(program,b'uAmount'),amount)
 draw(0x0005,0,4);data=(C.c_ubyte*(W*H*4))();read(0,0,W,H,0x1908,0x1401,data)
 assert error()==0
 return list(data)

def held(x,y):return 24<=x<40 and 24<=y<40
mask=[];scene=[]
for y in range(H):
 for x in range(W):
  mask.extend([255 if held(x,y) else 0,0,0,255])
  v=255 if (x+y)%2 else 0;scene.extend([v,v,v,255])
original=render(scene,mask,0);focused=render(scene,mask,1)
allError=max(abs(a-b) for a,b in zip(scene,original))
foregroundError=max(abs(focused[(y*W+x)*4+k]-scene[(y*W+x)*4+k]) for y in range(H) for x in range(W) if held(x,y) for k in range(3))
background=[focused[(y*W+x)*4] for y in range(5,20) for x in range(5,20)]
contrast=max(background)-min(background)
assert allError<=1,(allError,'amount=0 must preserve pixels')
assert foregroundError<=1,(foregroundError,'mask must preserve high-frequency foreground')
assert contrast<90,(contrast,'background must soften high-frequency checker')
scene2=[]
for y in range(H):
 for x in range(W):
  v=0 if held(x,y) else 255;scene2.extend([v,v,v,255])
noBleed=render(scene2,mask,1)
backgroundMinimum=min(noBleed[(y*W+x)*4] for y in range(H) for x in range(W) if not held(x,y))
foregroundMaximum=max(noBleed[(y*W+x)*4] for y in range(H) for x in range(W) if held(x,y))
assert backgroundMinimum>=254,(backgroundMinimum,'foreground must not bleed into background')
assert foregroundMaximum<=1,foregroundMaximum
print(json.dumps({'pixel_fixture':'PASS','size':[W,H],'disabled_max_pixel_error':allError,'held_foreground_max_pixel_error':foregroundError,'background_checker_contrast_original':255,'background_checker_contrast_focused':contrast,'white_background_min_after_dark_foreground_exclusion':backgroundMinimum,'black_foreground_max':foregroundMaximum}))

egl('eglMakeCurrent',C.c_uint,C.c_void_p,C.c_void_p,C.c_void_p,C.c_void_p)(d,None,None,None)
egl('eglDestroyContext',C.c_uint,C.c_void_p,C.c_void_p)(d,ctx)
egl('eglDestroySurface',C.c_uint,C.c_void_p,C.c_void_p)(d,surf)
egl('eglTerminate',C.c_uint,C.c_void_p)(d)
