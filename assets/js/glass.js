/* Screen-space cut glass. The room is captured on the GPU; its image is bent
   through a rounded bevel and a genuinely extruded contour, never read to JS.
   DOM labels and controls remain above this material and stay perfectly sharp. */
(function(){'use strict';
 const vertex=`precision highp float;attribute vec2 aPosition,aNormal;attribute vec4 aOptics;
 uniform mediump vec2 uViewport;varying vec2 vPosition,vNormal;varying vec4 vOptics;
 void main(){vPosition=aPosition;vNormal=aNormal;vOptics=aOptics;
 gl_Position=vec4(aPosition.x/uViewport.x*2.-1.,1.-aPosition.y/uViewport.y*2.,0.,1.);}`;
 const fragment=`precision highp float;
 uniform sampler2D uScene,uFrost;uniform mediump vec2 uViewport;uniform float uThickness,uHover,uLocked,uOpacity;
 varying vec2 vPosition,vNormal;varying vec4 vOptics;
 vec3 image(vec2 p){return texture2D(uScene,clamp(vec2(p.x/uViewport.x,1.-p.y/uViewport.y),vec2(.001),vec2(.999))).rgb;}
 void main(){
  float bevel=clamp(vOptics.x,0.,1.),side=vOptics.y,coverage=clamp(vOptics.z,0.,1.),depth=vOptics.w;
  vec2 normal=vNormal/max(.001,length(vNormal));
  // Refraction grows smoothly across the polished bevel. The exposed cut face
  // has a longer optical path and samples a different part of the same room.
  float curve=sin(bevel*1.5707963),bend=(curve*curve*.92+side*(.42+sin(depth*3.1415927)*.48))*uThickness;
  vec2 p=vPosition-normal*bend-vec2(.42,1.)*side*uThickness*.38;
  vec2 uv=clamp(vec2(p.x/uViewport.x,1.-p.y/uViewport.y),vec2(.001),vec2(.999));
  vec3 frost=texture2D(uFrost,uv).rgb;
  vec3 c=mix(frost,image(p),max(smoothstep(.18,.98,curve),min(side,1.)));
  // A small wavelength separation belongs to the cut edge, not the text.
  float dispersion=(curve*.42+side*.38);
  c.r=mix(c.r,image(p+normal*dispersion).r,curve*.65+side*.25);
  c.b=mix(c.b,image(p-normal*dispersion).b,curve*.65+side*.25);
  float light=dot(normal,normalize(vec2(-.65,-.76)));
  float polished=pow(max(0.,light),3.)*.38+pow(max(0.,-light),8.)*.20;
  float rim=pow(curve,5.);
  // Clear front, denser blue-green cut sides, narrow white reflected rim.
  c=mix(c,vec3(.93,.965,.97),.065+uLocked*.035);
  c*=vec3(1.)-side*vec3(.075,.032,.018);
  float rearLine=exp(-pow((depth-.94)/.065,2.)),frontLine=exp(-pow(depth/.095,2.));
  c=mix(c,vec3(.98,1.,1.),clamp(rim*(.17+polished)+side*(polished*.23+rearLine*.47+frontLine*.17)+uHover*.045,0.,.78));
  c*=1.-rim*(1.-max(0.,light))*.045;
  // The last vertex band is a soft projected contact shadow outside the slab.
  if(side>1.5){c=image(vPosition)*vec3(.93,.95,.955);}
  gl_FragColor=vec4(clamp(c,0.,1.),coverage*uOpacity);
 }`;
 const blurVertex=`attribute vec2 aScreen;varying vec2 vUV;void main(){vUV=aScreen*.5+.5;gl_Position=vec4(aScreen,0.,1.);}`;
 // First downsample to a small texture, then blur there. Applying distant
 // taps directly to the full-resolution room would create ghosted cube edges.
 const blurFragment=`precision mediump float;uniform sampler2D uImage;uniform vec2 uDirection;uniform float uDownsample;varying vec2 vUV;
 void main(){vec3 c;
 if(uDownsample>.5){
 c=(texture2D(uImage,vUV+uDirection).rgb+texture2D(uImage,vUV-uDirection).rgb+texture2D(uImage,vUV+vec2(uDirection.x,-uDirection.y)).rgb+texture2D(uImage,vUV+vec2(-uDirection.x,uDirection.y)).rgb)*.25;
 }else{
 c=texture2D(uImage,vUV).rgb*.227027;
 c+=(texture2D(uImage,vUV+uDirection*1.384615).rgb+texture2D(uImage,vUV-uDirection*1.384615).rgb)*.316216;
 c+=(texture2D(uImage,vUV+uDirection*3.230769).rgb+texture2D(uImage,vUV-uDirection*3.230769).rgb)*.070270;
 }gl_FragColor=vec4(c,1.);}`;
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 function contour(input){
  const points=[];
  for(const p of input||[]){
   if(!p||!Number.isFinite(p[0])||!Number.isFinite(p[1]))throw Error('Invalid glass contour');
   if(!points.length||Math.hypot(p[0]-points.at(-1)[0],p[1]-points.at(-1)[1])>.001)points.push([p[0],p[1]]);
  }
  if(points.length>1&&Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])<.001)points.pop();
  if(points.length<3||points.length>512)throw Error('Invalid glass contour size');
  let area=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a[0]*b[1]-b[0]*a[1];}
  if(Math.abs(area)<.01)throw Error('Empty glass contour');
  if(area<0)points.reverse();return points;
 }
 function triangulate(points){
  const remaining=points.map((_,i)=>i),triangles=[];let attempts=0;
  while(remaining.length>3){
   let found=false;
   for(let k=0;k<remaining.length;k++){
    const ia=remaining[(k+remaining.length-1)%remaining.length],ib=remaining[k],ic=remaining[(k+1)%remaining.length],a=points[ia],b=points[ib],c=points[ic];
    if(cross(a,b,c)<=.00001)continue;
    let contains=false;
    for(const index of remaining){if(index===ia||index===ib||index===ic)continue;const p=points[index];if(cross(a,b,p)>=-.00001&&cross(b,c,p)>=-.00001&&cross(c,a,p)>=-.00001){contains=true;break;}}
    if(contains)continue;triangles.push([ia,ib,ic]);remaining.splice(k,1);found=true;break;
   }
   if(!found||++attempts>points.length)throw Error('Glass contour cannot be triangulated');
  }
  triangles.push(remaining);return triangles;
 }
 function mesh(input,thickness=10){
  const points=contour(input),count=points.length,t=clamp(Number(thickness)||10,2,24),bevel=clamp(t*.54,1.5,7),normals=[],miters=[],inner=[],out=[];
  const edgeNormals=points.map((p,i)=>{const q=points[(i+1)%count],dx=q[0]-p[0],dy=q[1]-p[1],length=Math.hypot(dx,dy);return [dy/length,-dx/length];});
  for(let i=0;i<count;i++){
   const a=edgeNormals[(i+count-1)%count],b=edgeNormals[i],length=Math.hypot(a[0]+b[0],a[1]+b[1]);
   const normal=length>.001?[(a[0]+b[0])/length,(a[1]+b[1])/length]:b;
   const miter=1/Math.max(.35,normal[0]*b[0]+normal[1]*b[1]);normals.push(normal);miters.push(miter);
   inner.push([points[i][0]-normal[0]*bevel*miter,points[i][1]-normal[1]*bevel*miter]);
  }
  const shift=[t*.42,t],rear=points.map(p=>[p[0]+shift[0],p[1]+shift[1]]);
  function vertex(p,n,b,s,a=1,depth=0){return [p[0],p[1],n[0],n[1],b,s,a,depth];}
  function tri(a,b,c){out.push(...a,...b,...c);}
  function quad(a,b,c,d){tri(a,b,c);tri(a,c,d);}
  // A narrow, feathered rear shadow grounds the visible thickness. It is
  // geometry, not a full-screen blur and costs no additional framebuffer.
  for(let i=0;i<count;i++){
   const j=(i+1)%count,n=normals[i],m=normals[j],e=edgeNormals[i];
   if(e[0]*shift[0]+e[1]*shift[1]<=0)continue;
   const a=rear[i],b=rear[j],c=[b[0]+m[0]*4,b[1]+m[1]*4],d=[a[0]+n[0]*4,a[1]+n[1]*4];
   quad(vertex(a,n,0,2,.52),vertex(b,m,0,2,.52),vertex(c,m,0,2,0),vertex(d,n,0,2,0));
  }
  // Only faces exposed by the extrusion are drawn. Hidden side triangles
  // would darken the center and betray the illusion of one solid glass piece.
  for(let i=0;i<count;i++){
   const j=(i+1)%count,e=edgeNormals[i];if(e[0]*shift[0]+e[1]*shift[1]<=0)continue;
   quad(vertex(points[i],normals[i],1,1),vertex(points[j],normals[j],1,1),vertex(rear[j],normals[j],1,1,1,1),vertex(rear[i],normals[i],1,1,1,1));
  }
  for(const triangle of triangulate(inner))tri(...triangle.map(i=>vertex(inner[i],[0,0],0,0)));
  for(let i=0;i<count;i++){
   const j=(i+1)%count;
   quad(vertex(inner[i],normals[i],0,0),vertex(inner[j],normals[j],0,0),vertex(points[j],normals[j],1,0),vertex(points[i],normals[i],1,0));
   // One CSS pixel of analytic coverage prevents a faceted/sawtooth rim even
   // when the game intentionally runs below the display's native resolution.
   const a=[points[i][0]+normals[i][0],points[i][1]+normals[i][1]],b=[points[j][0]+normals[j][0],points[j][1]+normals[j][1]];
   quad(vertex(points[i],normals[i],1,0),vertex(points[j],normals[j],1,0),vertex(b,normals[j],1,0,0),vertex(a,normals[i],1,0,0));
  }
  return new Float32Array(out);
 }
 function create(gl){
  let program=null,blurProgram=null,quad=null,texture=null,width=0,height=0,failed=false,locations,uniforms,blurLocation,blurUniforms,cache=[],frost=[],fw=0,fh=0;
  const max=Number(gl.getParameter(gl.MAX_TEXTURE_SIZE))||4096;
  function release(){
   if(texture)gl.deleteTexture(texture);texture=null;width=height=0;
   for(const entry of cache)if(entry?.buffer)gl.deleteBuffer(entry.buffer);cache=[];
   for(const target of frost){if(target.texture)gl.deleteTexture(target.texture);if(target.fbo)gl.deleteFramebuffer(target.fbo);}frost=[];fw=fh=0;
   if(quad)gl.deleteBuffer(quad);quad=null;
  }
  function dispose(){release();if(program)gl.deleteProgram(program);if(blurProgram)gl.deleteProgram(blurProgram);program=blurProgram=null;gl.bindFramebuffer(gl.FRAMEBUFFER,null);}
  function compile(type,source){
   const shader=gl.createShader(type);if(!shader)throw Error('Glass shader unavailable');
   gl.shaderSource(shader,source);gl.compileShader(shader);
   if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error(log||'Glass shader failed');}return shader;
  }
  function link(vertexSource,fragmentSource){
   let vs=null,fs=null,p=null;
   try{
    vs=compile(gl.VERTEX_SHADER,vertexSource);fs=compile(gl.FRAGMENT_SHADER,fragmentSource);p=gl.createProgram();if(!p)throw Error('Glass program unavailable');
    gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error('Glass program failed');return p;
   }catch(error){if(p)gl.deleteProgram(p);throw error;}finally{if(vs)gl.deleteShader(vs);if(fs)gl.deleteShader(fs);}
  }
  function init(){
   if(!program){
    program=link(vertex,fragment);
    locations=['aPosition','aNormal','aOptics'].map(n=>gl.getAttribLocation(program,n));
    uniforms=Object.fromEntries(['uScene','uFrost','uViewport','uThickness','uHover','uLocked','uOpacity'].map(n=>[n,gl.getUniformLocation(program,n)]));
   }
   if(!blurProgram){blurProgram=link(blurVertex,blurFragment);blurLocation=gl.getAttribLocation(blurProgram,'aScreen');blurUniforms=Object.fromEntries(['uImage','uDirection','uDownsample'].map(n=>[n,gl.getUniformLocation(blurProgram,n)]));}
   if(!quad){quad=gl.createBuffer();if(!quad)throw Error('Glass quad unavailable');gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);}
  }
  function allocate(target,w,h){
   gl.bindTexture(gl.TEXTURE_2D,target);for(const parameter of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,parameter,gl.LINEAR);
   for(const parameter of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,parameter,gl.CLAMP_TO_EDGE);
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  }
  function blurRoom(w,h,cssWidth,cssHeight){
   // CSS-pixel scale keeps the frost equally soft at 50% or 150% game
   // resolution and on HiDPI displays. Its buffers never exceed the source.
   const targetWidth=Math.max(1,Math.min(w,Math.ceil(cssWidth/4))),targetHeight=Math.max(1,Math.min(h,Math.ceil(cssHeight/4)));
   if(fw!==targetWidth||fh!==targetHeight){
    if(!frost.length)for(let i=0;i<2;i++){const target={texture:gl.createTexture(),fbo:gl.createFramebuffer()};frost.push(target);if(!target.texture||!target.fbo)throw Error('Glass frost buffers unavailable');}
    for(const target of frost){allocate(target.texture,targetWidth,targetHeight);gl.bindFramebuffer(gl.FRAMEBUFFER,target.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target.texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Glass frost framebuffer failed');}
    fw=targetWidth;fh=targetHeight;
   }
   gl.disable(gl.BLEND);gl.viewport(0,0,fw,fh);gl.useProgram(blurProgram);gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.enableVertexAttribArray(blurLocation);gl.vertexAttribPointer(blurLocation,2,gl.FLOAT,false,0,0);gl.uniform1i(blurUniforms.uImage,0);
   for(let pass=0;pass<3;pass++){
    gl.bindFramebuffer(gl.FRAMEBUFFER,frost[pass===1?1:0].fbo);gl.bindTexture(gl.TEXTURE_2D,pass===0?texture:frost[pass===1?0:1].texture);
    gl.uniform1f(blurUniforms.uDownsample,pass===0?1:0);gl.uniform2f(blurUniforms.uDirection,pass===0?1/w:pass===1?1/fw:0,pass===0?1/h:pass===2?1/fh:0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
   }
   gl.disableVertexAttribArray(blurLocation);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.enable(gl.BLEND);
  }
  function render(w,h,cssWidth,cssHeight,panels){
   if(failed)return false;
   if(!panels?.length){release();return true;}
   if(gl.isContextLost?.())return false;
   let states=null;
   try{
    if(![w,h,cssWidth,cssHeight].every(x=>Number.isFinite(x)&&x>0)||w>max||h>max||w*h>6000000||panels.length>24)throw Error('Glass dimensions unsupported');
    init();
    // Capture before any glass draw, preventing self-feedback. A single image
    // is shared by every panel; hovering never allocates another render target.
    gl.activeTexture(gl.TEXTURE0);if(!texture){texture=gl.createTexture();if(!texture)throw Error('Glass texture unavailable');}
    gl.bindTexture(gl.TEXTURE_2D,texture);
    if(width!==w||height!==h){
     allocate(texture,w,h);width=w;height=h;
     if(gl.getError()!==gl.NO_ERROR)throw Error('Glass texture allocation failed');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.copyTexSubImage2D(gl.TEXTURE_2D,0,0,0,0,0,w,h);
    if(gl.getError()!==gl.NO_ERROR)throw Error('Glass scene capture failed');
    states=[gl.DEPTH_TEST,gl.BLEND,gl.CULL_FACE,gl.SCISSOR_TEST].map(cap=>[cap,gl.isEnabled(cap)]);
    const blend=[gl.BLEND_SRC_RGB,gl.BLEND_DST_RGB,gl.BLEND_SRC_ALPHA,gl.BLEND_DST_ALPHA].map(p=>gl.getParameter(p));
    states.blend=blend;
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.SCISSOR_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    blurRoom(w,h,cssWidth,cssHeight);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,frost[0].texture);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.viewport(0,0,w,h);gl.useProgram(program);gl.uniform1i(uniforms.uScene,0);gl.uniform1i(uniforms.uFrost,1);gl.uniform2f(uniforms.uViewport,cssWidth,cssHeight);
    for(let i=0;i<panels.length;i++){
     const panel=panels[i],key=panel.thickness+':'+panel.points.map(p=>p.join(',')).join(';');let entry=cache[i];
     if(!entry||entry.key!==key){
      const geometry=mesh(panel.points,panel.thickness);if(!entry){entry={buffer:gl.createBuffer()};cache[i]=entry;}if(!entry.buffer)throw Error('Glass geometry unavailable');
      gl.bindBuffer(gl.ARRAY_BUFFER,entry.buffer);gl.bufferData(gl.ARRAY_BUFFER,geometry,gl.STATIC_DRAW);entry.key=key;entry.count=geometry.length/8;
     }else gl.bindBuffer(gl.ARRAY_BUFFER,entry.buffer);
     for(let a=0;a<3;a++){gl.enableVertexAttribArray(locations[a]);gl.vertexAttribPointer(locations[a],a===2?4:2,gl.FLOAT,false,32,a*8);}
     gl.uniform1f(uniforms.uThickness,clamp(Number(panel.thickness)||10,2,24));gl.uniform1f(uniforms.uHover,panel.hovered?1:panel.selected?.35:0);gl.uniform1f(uniforms.uLocked,panel.locked?1:0);gl.uniform1f(uniforms.uOpacity,Number.isFinite(panel.opacity)?clamp(panel.opacity,0,1):1);
     gl.drawArrays(gl.TRIANGLES,0,entry.count);
    }
    for(let i=panels.length;i<cache.length;i++)gl.deleteBuffer(cache[i].buffer);cache.length=panels.length;
    return true;
   }catch(error){dispose();failed=true;return false;}
   finally{
    if(locations)for(const location of locations)if(location>=0)gl.disableVertexAttribArray(location);
    if(blurLocation>=0)gl.disableVertexAttribArray(blurLocation);
    if(states){for(const [cap,enabled]of states)gl[enabled?'enable':'disable'](cap);gl.blendFuncSeparate(...states.blend);}
    gl.activeTexture(gl.TEXTURE0);
   }
  }
  return {render,release,dispose,get failed(){return failed;}};
 }
 window.QBitsGlass={create,mesh,contour,triangulate,vertex,fragment,blurVertex,blurFragment};
})();
