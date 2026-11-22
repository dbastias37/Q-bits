/* Compatible WebGL 2/1 setup, post effects and a mipmapped surface texture. */
(function(){'use strict';
 function context(canvas){
  const options={alpha:false,antialias:true,depth:true,powerPreference:'high-performance'};
  // The existing GLSL ES 1.00 shaders are also accepted by WebGL 2. Keep the
  // WebGL 1 path for older devices; no simulation or save data lives here.
  for(const [type,version]of [['webgl2',2],['webgl',1]]){
   try{const gl=canvas.getContext(type,options);if(gl)return {gl,version};}catch(_){/* Try the compatible context. */}
  }
  return {gl:null,version:0};
 }
 function geometryBindings(gl,attributes){
  let arrays=null;
  try{
   if(['createVertexArray','bindVertexArray','deleteVertexArray'].every(name=>name in gl&&typeof gl[name]==='function')){
    arrays={create:()=>gl.createVertexArray(),bind:value=>gl.bindVertexArray(value),remove:value=>gl.deleteVertexArray(value)};
   }else{
    const ext=gl.getExtension?.('OES_vertex_array_object');
    if(ext&&['createVertexArrayOES','bindVertexArrayOES','deleteVertexArrayOES'].every(name=>typeof ext[name]==='function'))arrays={create:()=>ext.createVertexArrayOES(),bind:value=>ext.bindVertexArrayOES(value),remove:value=>ext.deleteVertexArrayOES(value)};
   }
  }catch(_){/* Vertex arrays are optional on WebGL 1. */}
  const buffers=new Map();
  function configure(layout,enable=false){
   for(let i=0;i<attributes.length;i++){
    const [location,offset]=attributes[i];if(location<0)continue;
    if(enable)gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location,3,gl.FLOAT,false,layout==='outline'?36:layout?48:24,layout==='outline'?(i>1?24:offset):offset+(layout&&i>1?24:0));
   }
  }
  function bind(buffer,layout=false){
   gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
   if(!arrays){configure(layout);return;}
   let variants=buffers.get(buffer),array=variants?.get(layout);
   if(array){arrays.bind(array);return;}
   array=arrays.create();
   if(!array){arrays.bind(null);configure(layout);return;}
   arrays.bind(array);configure(layout,true);
   if(!variants){variants=new Map();buffers.set(buffer,variants);}variants.set(layout,array);
  }
  // Screen effects use the default VAO. Their attributes must never overwrite
  // one of the immutable scene layouts, even when a program reuses a location.
  function unbind(){arrays?.bind(null);}
  function release(buffer){
   const variants=buffers.get(buffer);if(!variants)return;
   for(const array of variants.values())arrays.remove(array);buffers.delete(buffer);
  }
  return {bind,unbind,release,get supported(){return !!arrays;}};
 }
 const vertex=`attribute vec2 aScreen;varying vec2 vUV;void main(){vUV=aScreen*.5+.5;gl_Position=vec4(aScreen,0.,1.);}`;
 // Five bilinear taps are a nine-tap Gaussian. The two half-resolution passes
 // cost only 2.5 full-screen samples and never soften the original scene.
 const blurFragment=`precision mediump float;
 uniform sampler2D uImage;uniform vec2 uDirection;uniform float uExtract;varying vec2 vUV;
 vec3 sampleLight(vec2 uv){vec3 c=texture2D(uImage,uv).rgb;if(uExtract>.5){float hi=max(c.r,max(c.g,c.b)),lo=min(c.r,min(c.g,c.b));c*=smoothstep(.035,.30,hi-lo)*smoothstep(.25,.75,hi);}return c;}
 void main(){vec3 c=sampleLight(vUV)*.227027;
 c+=(sampleLight(vUV+uDirection*1.384615)+sampleLight(vUV-uDirection*1.384615))*.316216;
 c+=(sampleLight(vUV+uDirection*3.230769)+sampleLight(vUV-uDirection*3.230769))*.070270;
 gl_FragColor=vec4(c,1.);}`;
 const fragment=`precision mediump float;
 uniform sampler2D uImage,uHalo;uniform vec2 uPixel;uniform float uBloom,uDither,uLevels,uAA;varying vec2 vUV;
 float luma(vec3 c){return dot(c,vec3(.299,.587,.114));}
 vec3 antialias(vec3 original){
  vec3 nw=texture2D(uImage,vUV+vec2(-1.,-1.)*uPixel).rgb,ne=texture2D(uImage,vUV+vec2(1.,-1.)*uPixel).rgb;
  vec3 sw=texture2D(uImage,vUV+vec2(-1.,1.)*uPixel).rgb,se=texture2D(uImage,vUV+vec2(1.,1.)*uPixel).rgb;
  float m=luma(original),a=luma(nw),b=luma(ne),c=luma(sw),d=luma(se),lo=min(m,min(min(a,b),min(c,d))),hi=max(m,max(max(a,b),max(c,d)));
  if(hi-lo<max(.04,hi*.10))return original;
  vec2 dir=vec2(-((a+b)-(c+d)),((a+c)-(b+d)));
  float reduce=max((a+b+c+d)*.03125,.0078125),r=1./(min(abs(dir.x),abs(dir.y))+reduce);
  dir=clamp(dir*r,vec2(-4.),vec2(4.))*uPixel;
  vec3 inner=.5*(texture2D(uImage,vUV-dir/6.).rgb+texture2D(uImage,vUV+dir/6.).rgb);
  vec3 outer=inner*.5+.25*(texture2D(uImage,vUV-dir*.5).rgb+texture2D(uImage,vUV+dir*.5).rgb);
  float y=luma(outer);return y<lo||y>hi?inner:outer;
 }
 float bayer(vec2 p){vec2 a=mod(floor(p),2.);vec2 b=mod(floor(p/2.),2.);float lo=2.*a.x+3.*a.y-4.*a.x*a.y;float hi=2.*b.x+3.*b.y-4.*b.x*b.y;return (4.*lo+hi+.5)/16.-.5;}
 void main(){vec3 c=texture2D(uImage,vUV).rgb;if(uAA>.5)c=antialias(c);
 c=clamp(c,0.,1.);if(uLevels<254.5||uDither>0.){c=floor(c*uLevels+.5+bayer(gl_FragCoord.xy)*uDither)/uLevels;}
 // Quantize the scene first: the low-intensity tail must fade continuously.
 if(uBloom>0.)c+=texture2D(uHalo,vUV).rgb*uBloom*1.5;
 gl_FragColor=vec4(clamp(c,0.,1.),1.);}`;
 function compile(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
 function create(gl){
  let p=null,blur=null,quad=null,texture=null,depth=null,fbo=null,w=0,h=0,failed=false,uniforms,location,blurUniforms,blurLocation;
  let halos=[],bw=0,bh=0;
  const max=Math.min(Number(gl.getParameter(gl.MAX_TEXTURE_SIZE))||4096,Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE))||4096);
  function program(source){const result=gl.createProgram(),vs=compile(gl,gl.VERTEX_SHADER,vertex),fs=compile(gl,gl.FRAGMENT_SHADER,source);gl.attachShader(result,vs);gl.attachShader(result,fs);gl.linkProgram(result);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(result,gl.LINK_STATUS)){gl.deleteProgram(result);throw Error('Post shader');}return result;}
  function releaseHalos(){for(const target of halos){gl.deleteTexture(target.texture);gl.deleteFramebuffer(target.fbo);}halos=[];bw=bh=0;}
  function release(){releaseHalos();for(const [obj,fn]of [[p,'deleteProgram'],[blur,'deleteProgram'],[quad,'deleteBuffer'],[texture,'deleteTexture'],[depth,'deleteRenderbuffer'],[fbo,'deleteFramebuffer']])if(obj)gl[fn](obj);p=blur=quad=texture=depth=fbo=null;w=h=0;gl.bindFramebuffer(gl.FRAMEBUFFER,null);}
  function allocate(t,width,height){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,t);for(const k of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,k,gl.LINEAR);for(const k of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);}
  function begin(width,height,s){
   if(failed)return null;
   if(!s.bloom&&s.dither===0&&s.bits===8){if(p)release();return null;}
   try{
    if(!p){p=program(fragment);location=gl.getAttribLocation(p,'aScreen');uniforms=Object.fromEntries(['uImage','uHalo','uPixel','uBloom','uDither','uLevels','uAA'].map(n=>[n,gl.getUniformLocation(p,n)]));
     quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);texture=gl.createTexture();fbo=gl.createFramebuffer();depth=gl.createRenderbuffer();if(!texture||!fbo||!depth)throw Error('Post buffers');
    }
    if(width>max||height>max)throw Error('Post dimensions');
    if(w!==width||h!==height){allocate(texture,width,height);gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,width,height);gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Post framebuffer');w=width;h=height;}
    if(s.bloom&&s.bloomStrength>0){
     if(!blur){blur=program(blurFragment);blurLocation=gl.getAttribLocation(blur,'aScreen');blurUniforms=Object.fromEntries(['uImage','uDirection','uExtract'].map(n=>[n,gl.getUniformLocation(blur,n)]));}
     const x=Math.max(1,Math.ceil(w/2)),y=Math.max(1,Math.ceil(h/2));
     if(bw!==x||bh!==y){releaseHalos();for(let i=0;i<2;i++){const target={texture:gl.createTexture(),fbo:gl.createFramebuffer()};halos.push(target);if(!target.texture||!target.fbo)throw Error('Bloom buffers');allocate(target.texture,x,y);gl.bindFramebuffer(gl.FRAMEBUFFER,target.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target.texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Bloom framebuffer');}bw=x;bh=y;}
    }else if(halos.length)releaseHalos();
    gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);return fbo;
   }catch(error){release();failed=true;return null;}
  }
  function preparePass(program,attribute){gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);}
  function end(s){
   gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
   if(halos.length){preparePass(blur,blurLocation);gl.viewport(0,0,bw,bh);gl.uniform1i(blurUniforms.uImage,0);
    for(let i=0;i<2;i++){gl.bindFramebuffer(gl.FRAMEBUFFER,halos[i].fbo);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,i?halos[0].texture:texture);gl.uniform2f(blurUniforms.uDirection,i?0:1/bw,i?1/bh:0);gl.uniform1f(blurUniforms.uExtract,i?0:1);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}
    gl.disableVertexAttribArray(blurLocation);
   }
   gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);preparePass(p,location);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(uniforms.uImage,0);
   gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,halos.length?halos[1].texture:texture);gl.uniform1i(uniforms.uHalo,1);gl.activeTexture(gl.TEXTURE0);
   gl.uniform2f(uniforms.uPixel,1/w,1/h);gl.uniform1f(uniforms.uAA,s.style==='psx'||s.filter==='nearest'?0:1);gl.uniform1f(uniforms.uBloom,halos.length?s.bloomStrength/100:0);gl.uniform1f(uniforms.uDither,s.dither/100);gl.uniform1f(uniforms.uLevels,Math.pow(2,s.bits)-1);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);gl.disableVertexAttribArray(location);gl.enable(gl.DEPTH_TEST);
  }
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
 window.QBitsGraphics={context,geometryBindings,create,surface,vertex,fragment,blurFragment};
})();
