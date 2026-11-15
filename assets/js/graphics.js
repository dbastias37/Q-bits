/* WebGL1 post effects and a real mipmapped procedural surface texture. */
(function(){'use strict';
 const vertex=`attribute vec2 aScreen;varying vec2 vUV;void main(){vUV=aScreen*.5+.5;gl_Position=vec4(aScreen,0.,1.);}`;
 const fragment=`precision mediump float;
 uniform sampler2D uImage;uniform vec2 uPixel;uniform float uBloom,uDither,uLevels;varying vec2 vUV;
 vec3 bright(vec2 offset){vec3 c=texture2D(uImage,vUV+offset*uPixel).rgb;float hi=max(c.r,max(c.g,c.b)),lo=min(c.r,min(c.g,c.b));return c*smoothstep(.12,.35,hi-lo)*smoothstep(.35,.8,hi);}
 float bayer(vec2 p){vec2 a=mod(floor(p),2.);vec2 b=mod(floor(p/2.),2.);float lo=2.*a.x+3.*a.y-4.*a.x*a.y;float hi=2.*b.x+3.*b.y-4.*b.x*b.y;return (4.*lo+hi+.5)/16.-.5;}
 void main(){vec3 c=texture2D(uImage,vUV).rgb;
 if(uBloom>0.){vec3 glow=bright(vec2(-3.,0.))+bright(vec2(3.,0.))+bright(vec2(0.,-3.))+bright(vec2(0.,3.));glow+=bright(vec2(-6.,-6.))+bright(vec2(6.,-6.))+bright(vec2(-6.,6.))+bright(vec2(6.,6.));c+=glow*uBloom*.22;}
 c=clamp(c,0.,1.);if(uLevels<254.5||uDither>0.){c=floor(c*uLevels+.5+bayer(gl_FragCoord.xy)*uDither)/uLevels;}
 gl_FragColor=vec4(clamp(c,0.,1.),1.);}`;
 function compile(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
 function create(gl){
  let p=null,quad=null,texture=null,depth=null,fbo=null,w=0,h=0,failed=false,uniforms,location;
  const max=Math.min(Number(gl.getParameter(gl.MAX_TEXTURE_SIZE))||4096,Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE))||4096);
  function release(){for(const [obj,fn]of [[p,'deleteProgram'],[quad,'deleteBuffer'],[texture,'deleteTexture'],[depth,'deleteRenderbuffer'],[fbo,'deleteFramebuffer']])if(obj)gl[fn](obj);p=quad=texture=depth=fbo=null;w=h=0;gl.bindFramebuffer(gl.FRAMEBUFFER,null);}
  function begin(width,height,s){
   if(failed)return null;
   if(!s.bloom&&s.dither===0&&s.bits===8){if(p)release();return null;}
   try{
    if(!p){p=gl.createProgram();const vs=compile(gl,gl.VERTEX_SHADER,vertex),fs=compile(gl,gl.FRAGMENT_SHADER,fragment);gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error('Post shader');
     location=gl.getAttribLocation(p,'aScreen');uniforms=Object.fromEntries(['uImage','uPixel','uBloom','uDither','uLevels'].map(n=>[n,gl.getUniformLocation(p,n)]));
     quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);texture=gl.createTexture();fbo=gl.createFramebuffer();depth=gl.createRenderbuffer();if(!texture||!fbo||!depth)throw Error('Post buffers');
    }
    if(width>max||height>max)throw Error('Post dimensions');
    if(w!==width||h!==height){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);for(const k of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,k,gl.LINEAR);for(const k of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,width,height);gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Post framebuffer');w=width;h=height;}
    gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);return fbo;
   }catch(error){release();failed=true;return null;}
  }
  function end(s){gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.useProgram(p);gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(uniforms.uImage,0);gl.uniform2f(uniforms.uPixel,1/w,1/h);gl.uniform1f(uniforms.uBloom,s.bloom?s.bloomStrength/100:0);gl.uniform1f(uniforms.uDither,s.dither/100);gl.uniform1f(uniforms.uLevels,Math.pow(2,s.bits)-1);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);gl.disableVertexAttribArray(location);gl.enable(gl.DEPTH_TEST);}
  return {begin,end,release,get failed(){return failed;}};
 }
 function surface(gl){
  const extension=gl.getExtension('EXT_texture_filter_anisotropic')||gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic'),max=extension?Number(gl.getParameter(extension.MAX_TEXTURE_MAX_ANISOTROPY_EXT))||1:1;
  let texture=null,signature='';
  function bind(s){
   gl.activeTexture(gl.TEXTURE2);
   if(!texture){texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);const pixels=new Uint8Array(64*64*4);for(let y=0;y<64;y++)for(let x=0;x<64;x++){const i=(y*64+x)*4,n=((x*73+y*151+x*y*7)%17)-8,grid=x===0||y===0?-.12:0,v=Math.round(240+n+grid*255);pixels[i]=pixels[i+1]=pixels[i+2]=v;pixels[i+3]=255;}gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,64,64,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);gl.generateMipmap(gl.TEXTURE_2D);}
   gl.bindTexture(gl.TEXTURE_2D,texture);const key=s.filter+':'+s.anisotropy;
   if(key!==signature){gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,s.filter==='nearest'?gl.NEAREST:gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,s.filter==='nearest'?gl.NEAREST:s.filter==='trilinear'?gl.LINEAR_MIPMAP_LINEAR:gl.LINEAR);if(extension)gl.texParameterf(gl.TEXTURE_2D,extension.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(max,s.anisotropy));signature=key;}
   gl.activeTexture(gl.TEXTURE0);
  }
  return {bind,maxAnisotropy:max};
 }
 window.QBitsGraphics={create,surface,vertex,fragment};
})();
