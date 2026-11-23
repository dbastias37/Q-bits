/* Tablet 2.0: a view of data, never a second physics world.
 * Cube partitions below are the normalized UNIT_PROFILES in assets/js/game.js.
 * They preserve the game's square-based T-bit and true volume-centroid offsets.
 * GPU meshes are built once; picking is cached only when the view changes.
 */
const TAU = Math.PI * 2;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const sub = (a, b) => a.map((n, i) => n - b[i]);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const dot = (a, b) => a.reduce((sum, n, i) => sum+n*b[i], 0);
const normal = a => { const length = Math.hypot(...a) || 1; return a.map(n => n/length); };
const identity = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function multiply(a, b) {
  const out = new Float32Array(16);
  for (let c=0; c<4; c++) for (let r=0; r<4; r++) {
    out[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
  }
  return out;
}
function transform(m, p) {
  return [0,1,2,3].map(r => m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]+m[12+r]);
}
function lookAt(eye, target) {
  const z = normal(sub(eye, target)), x = normal(cross([0,1,0], z)), y = cross(z,x);
  return [x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -dot(x,eye),-dot(y,eye),-dot(z,eye),1];
}
function orthographic(x, y, near, far) {
  return [1/x,0,0,0, 0,1/y,0,0, 0,0,-2/(far-near),0, 0,0,-(far+near)/(far-near),1];
}
function quaternion(rotation) {
  if (Array.isArray(rotation) && rotation.length===4) return rotation;
  const [x,y,z] = Array.isArray(rotation) ? rotation : [0,0,0];
  const cx=Math.cos(x/2), sx=Math.sin(x/2), cy=Math.cos(y/2), sy=Math.sin(y/2), cz=Math.cos(z/2), sz=Math.sin(z/2);
  return [sx*cy*cz+cx*sy*sz, cx*sy*cz-sx*cy*sz, cx*cy*sz+sx*sy*cz, cx*cy*cz-sx*sy*sz];
}
function multiplyQuaternion(a,b){
  const [ax,ay,az,aw]=a,[bx,by,bz,bw]=b;
  return [aw*bx+ax*bw+ay*bz-az*by,aw*by-ax*bz+ay*bw+az*bx,aw*bz+ax*by-ay*bx+az*bw,aw*bw-ax*bx-ay*by-az*bz];
}
function rotateVector(q,p){return transform(pose([0,0,0],[1,1,1],q),p).slice(0,3);}
function pose(position, size, rotation) {
  const [x,y,z,w]=quaternion(rotation), [a,b,c]=size;
  return [(1-2*y*y-2*z*z)*a, (2*x*y+2*z*w)*a, (2*x*z-2*y*w)*a, 0,
    (2*x*y-2*z*w)*b, (1-2*x*x-2*z*z)*b, (2*y*z+2*x*w)*b, 0,
    (2*x*z+2*y*w)*c, (2*y*z-2*x*w)*c, (1-2*x*x-2*y*y)*c, 0,
    ...position,1];
}
const PROFILES = {
  cube: {
    vertices:[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5],[-.5,.5,-.5],[.5,.5,-.5],[.5,.5,.5],[-.5,.5,.5]],
    faces:[[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]]
  },
  pyramid: {
    vertices:[[-.5,-.125,-.5],[.5,-.125,-.5],[.5,-.125,.5],[-.5,-.125,.5],[0,.375,0]],
    faces:[[0,1,2,3],[0,4,1],[1,4,2],[2,4,3],[3,4,0]]
  },
  tetra: {
    vertices:[[-.625,-.125,-.375],[.375,-.125,-.375],[.375,-.125,.625],[-.125,.375,.125]],
    faces:[[0,1,2],[0,3,1],[1,3,2],[2,3,0]]
  },
  coupler: {
    vertices:[[-.5,-33/56,-.5],[.5,-33/56,-.5],[.5,-33/56,.5],[-.5,-33/56,.5],[-.5,23/56,-.5],[.5,23/56,-.5],[.5,23/56,.5],[-.5,23/56,.5],[0,51/56,0]],
    faces:[[0,1,2,3],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0],[4,8,5],[5,8,6],[6,8,7],[7,8,4]]
  }
};
function profileData(profile) {
  const triangles=[], edges=[], edgeKeys=new Set(), triangleIndices=[];
  for (const input of profile.faces) {
    const face=[...input], center=[0,0,0];
    face.forEach(i => profile.vertices[i].forEach((n,j) => center[j]+=n/face.length));
    let n=normal(cross(sub(profile.vertices[face[1]],profile.vertices[face[0]]),sub(profile.vertices[face[2]],profile.vertices[face[0]])));
    if (dot(n,center)<0) { face.reverse(); n=n.map(v=>-v); }
    for (let j=1;j<face.length-1;j++) {
      const t=[face[0],face[j],face[j+1]]; triangleIndices.push(t);
      t.forEach(i=>triangles.push(...profile.vertices[i],...n));
    }
    face.forEach((a,i)=>{
      const b=face[(i+1)%face.length],key=[Math.min(a,b),Math.max(a,b)].join(',');
      if(!edgeKeys.has(key)) { edgeKeys.add(key); for(const id of [a,b]) edges.push(...profile.vertices[id],0,1,0); }
    });
  }
  return {triangles,edges,triangleIndices,vertices:profile.vertices};
}
function program(gl, vertex, fragment) {
  const p=gl.createProgram(), shaders=[];
  try {
    for(const [kind,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]) {
      const s=gl.createShader(kind); shaders.push(s); gl.shaderSource(s,source); gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p,s);
    }
    gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  } catch(error) { gl.deleteProgram(p); throw error; }
  finally { shaders.forEach(s=>gl.deleteShader(s)); }
}
const VERTEX=`
  attribute vec3 aPosition, aNormal;
  uniform mat4 uModel, uViewProjection;
  uniform vec3 uSize;
  varying vec3 vNormal, vWorld;
  void main(){
    vec4 world=uModel*vec4(aPosition,1.0);
    vWorld=world.xyz;
    vNormal=normalize(mat3(uModel)*(aNormal/max(uSize*uSize,vec3(.00001))));
    gl_Position=uViewProjection*world;
  }`;
const FRAGMENT=`
  precision mediump float;
  uniform vec4 uColor;
  uniform vec3 uEye;
  uniform float uUnlit;
  varying vec3 vNormal, vWorld;
  void main(){
    vec3 n=normalize(vNormal);
    vec3 light=normalize(vec3(-.45,.90,.65));
    vec3 view=normalize(uEye-vWorld);
    float diffuse=max(0.0,dot(n,light));
    float fill=max(0.0,dot(n,normalize(vec3(.8,.3,-.7))));
    float spec=pow(max(0.0,dot(n,normalize(light+view))),42.0);
    vec3 color=uColor.rgb*(.51+.65*diffuse+.20*fill)+vec3(.17,.20,.20)*spec;
    color+=vec3(.03,.06,.065)*pow(1.0-max(0.0,dot(n,view)),3.0);
    gl_FragColor=vec4(mix(color,uColor.rgb,uUnlit),uColor.a);
  }`;
function readColor(value, fallback) {
  if(Array.isArray(value)) return value.length===4?value:[...value.slice(0,3),1];
  if(typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)) return [...[1,3,5].map(i=>parseInt(value.slice(i,i+2),16)/255),1];
  return fallback;
}
function barycentric(p,a,b,c) {
  const d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
  if(Math.abs(d)<.0001) return null;
  const u=((b[1]-c[1])*(p[0]-c[0])+(c[0]-b[0])*(p[1]-c[1]))/d;
  const v=((c[1]-a[1])*(p[0]-c[0])+(a[0]-c[0])*(p[1]-c[1]))/d;
  return u>=-.005&&v>=-.005&&u+v<=1.005?[u,v,1-u-v]:null;
}

/** Creates an independent visual viewport. setScene accepts only plain data. */
export function createMechanismRenderer(canvas, {onSelect=()=>{},onMeasure=()=>{},onSettled=()=>{}}={}) {
  let gl=null;
  try{gl=canvas.getContext('webgl',{alpha:true,antialias:true,depth:true,premultipliedAlpha:false,powerPreference:'low-power'});}catch{}
  if(!gl)return createSoftwareRenderer(canvas,{onSelect,onMeasure,onSettled});
  const p=program(gl,VERTEX,FRAGMENT);
  const loc=Object.fromEntries(['uModel','uViewProjection','uSize','uColor','uEye','uUnlit'].map(n=>[n,gl.getUniformLocation(p,n)]));
  const attr={position:gl.getAttribLocation(p,'aPosition'),normal:gl.getAttribLocation(p,'aNormal')};
  const buffers=[];
  function buffer(data) {const b=gl.createBuffer();buffers.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);return b;}
  const meshes=Object.fromEntries(Object.entries(PROFILES).map(([key,profile])=>{
    const data=profileData(profile);return [key,{...data,buffer:buffer(data.triangles),edgeBuffer:buffer(data.edges),count:data.triangles.length/6,edgeCount:data.edges.length/6}];
  }));
  const gridData=[];
  for(let i=-12;i<=12;i++) for(const p of [[i,0,-12],[i,0,12],[-12,0,i],[12,0,i]])gridData.push(...p,0,1,0);
  const grid=buffer(gridData), ringData=[];
  for(let i=0;i<64;i++)for(const k of [i,i+1]){const a=k*TAU/64;ringData.push(Math.cos(a),0,Math.sin(a),0,1,0);}
  const ring=buffer(ringData);
  let disposed=false,contextLost=false,enabled=true, raf=0, lastFrame=-Infinity, lastReport=-Infinity;
  let scene={pieces:[],selectedIds:[],activeIds:[],blueprint:null,mechanisms:{},joints:[]};
  const motion=new Map();
  let animationTimestamp=null;
  let yaw=.62, pitch=.48, zoomFactor=.80, center=[0,1.2,0], radius=3, ground=0;
  let width=1,height=1, dirty=true, picking=[], projected=[], frameCounter=0,totalCpuMs=0,maxCpuMs=0,lastDrawCalls=0;
  const samples=[],mql=window.matchMedia('(prefers-reduced-motion: reduce)');
  const abort=new AbortController(),signal=abort.signal;
  canvas.dataset.renderer='webgl';
  canvas.style.touchAction='none';
  function active() {return enabled&&!document.hidden&&!disposed&&!contextLost;}
  function animated() {return !mql.matches&&scene.activeIds.some(id=>scene.pieces.some(p=>p.id===id)&&!motion.get(id)?.settled);}
  function invalidate() {dirty=true;if(!raf&&active())raf=requestAnimationFrame(frame);}
  function meshFor(piece){return Object.hasOwn(meshes,piece.shape)?meshes[piece.shape]:Object.hasOwn(meshes,piece.type)?meshes[piece.type]:meshes.cube;}
  function bind(b){gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.enableVertexAttribArray(attr.position);gl.vertexAttribPointer(attr.position,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(attr.normal);gl.vertexAttribPointer(attr.normal,3,gl.FLOAT,false,24,12);}
  function draw(mesh,position,size,rotation,color,{edges=false,unlit=false}={}){
    const model=pose(position,size,rotation);bind(edges?mesh.edgeBuffer:mesh.buffer);
    gl.uniformMatrix4fv(loc.uModel,false,model);gl.uniform3fv(loc.uSize,size);gl.uniform4fv(loc.uColor,color);gl.uniform1f(loc.uUnlit,unlit?1:0);
    gl.drawArrays(edges?gl.LINES:gl.TRIANGLES,0,edges?mesh.edgeCount:mesh.count);lastDrawCalls++;
    return model;
  }
  function drawLine(b,count,position,size,color,rotation){
    bind(b);gl.uniformMatrix4fv(loc.uModel,false,pose(position,size,rotation));gl.uniform3fv(loc.uSize,size);gl.uniform4fv(loc.uColor,color);gl.uniform1f(loc.uUnlit,1);gl.drawArrays(gl.LINES,0,count);lastDrawCalls++;
  }
  function measure(){
    const sorted=[...samples].sort((a,b)=>a-b), at=f=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*f))]||0;
    return {available:!disposed&&!contextLost,backend:'webgl',frames:frameCounter,pieceCount:scene.pieces.length,drawCalls:lastDrawCalls,physicsBodies:0,gpuBuffers:disposed?0:buffers.length,
      cpuMeanMs:frameCounter?totalCpuMs/frameCounter:0,cpuP50Ms:at(.5),cpuP95Ms:at(.95),cpuMaxMs:maxCpuMs,
      animationActive:active()&&animated(),scheduledFrames:raf?1:0,pickingTriangles:picking.length,devicePixelRatio:Math.min(window.devicePixelRatio||1,1.75),
      settledMotorIds:[...motion].filter(([id,m])=>m.running&&m.settled).map(([id])=>id)};
  }
  function syncMotion(){
    const ids=new Set(scene.pieces.map(piece=>piece.id));
    for(const id of motion.keys())if(!ids.has(id))motion.delete(id);
    const activeIds=new Set(scene.activeIds);
    for(const piece of scene.pieces){
      if(!['rotor','servo','drone'].includes(piece.type))continue;
      const config=scene.mechanisms[piece.id]||{},running=activeIds.has(piece.id),serial=config.restartSerial||0;
      let m=motion.get(piece.id);
      if(!m||m.serial!==serial){m={phase:0,angle:0,serial,running:false,settled:false,travelDirection:config.direction||1,command:''};motion.set(piece.id,m);}
      const command=[config.mode,config.direction,config.min,config.max,config.target].join('|');
      if((running&&!m.running)||command!==m.command){m.settled=false;m.travelDirection=config.direction||1;}
      m.running=running;m.command=command;
    }
  }
  function animate(time){
    const dt=animationTimestamp===null?0:clamp((time-animationTimestamp)/1000,0,.06);animationTimestamp=time;
    if(mql.matches){
      for(const piece of scene.pieces){const m=motion.get(piece.id),c=scene.mechanisms[piece.id]||{};
        if(piece.type==='servo'&&m?.running&&!m.settled&&c.mode!=='repeat'){
          m.angle=clamp(c.target??30,c.min??-60,c.max??60);m.settled=true;queueMicrotask(()=>{if(!disposed)onSettled(piece.id);});
        }
      }return;
    }
    for(const piece of scene.pieces){
      const m=motion.get(piece.id);if(!m?.running||m.settled)continue;
      const c=scene.mechanisms[piece.id]||{};
      if(piece.type==='servo'){
        const lo=Number.isFinite(c.min)?c.min:-60,hi=Number.isFinite(c.max)?c.max:60,speed=Number.isFinite(c.speed)?c.speed:45;
        if(c.mode==='repeat'){
          const span=Math.max(.001,hi-lo),at=clamp(m.angle,lo,hi)-lo;
          let phase=m.travelDirection===1?at:2*span-at;
          phase=(phase+speed*dt)%(span*2);m.angle=lo+(phase<=span?phase:2*span-phase);m.travelDirection=phase<span?1:-1;
        }else{
          const goal=clamp(Number.isFinite(c.target)?c.target:30,lo,hi),distance=goal-m.angle;
          m.angle+=Math.sign(distance)*Math.min(Math.abs(distance),speed*dt);
          if(Math.abs(goal-m.angle)<.0001&&dt>0){m.angle=goal;m.settled=true;queueMicrotask(()=>{if(!disposed)onSettled(piece.id);});}
        }
      }else{
        // A rotor follows rpm; a drone only has a visual propeller indicator.
        const speed=Number.isFinite(c.speed)?c.speed:30;
        m.phase=(m.phase+(c.direction||1)*(piece.type==='rotor'?speed*TAU/60:4+speed*8)*dt)%TAU;
      }
    }
  }
  function visualPiece(piece){
    let position=[...piece.position],rotation=quaternion(piece.rotation||[0,0,0]);
    // Explicit fixture joints only. No inferred connections, constraints or bodies.
    // Children are transformed before parents, so each pivot stays in its source frame.
    for(let i=scene.joints.length-1;i>=0;i--){
      const joint=scene.joints[i];if(!joint.drivenIds?.includes(piece.id))continue;
      const m=motion.get(joint.motorId);if(!m)continue;
      const angle=scene.mechanisms[joint.motorId]?.type==='servo'?m.angle*Math.PI/180:m.phase;
      const s=Math.sin(angle/2),q=[joint.axis==='x'?s:0,joint.axis==='y'?s:0,joint.axis==='z'?s:0,Math.cos(angle/2)];
      const v=rotateVector(q,sub(position,joint.pivot));position=v.map((n,k)=>n+joint.pivot[k]);rotation=multiplyQuaternion(q,rotation);
    }
    return {...piece,position,rotation};
  }
  function fitBounds(){
    if(!scene.pieces.length){center=[0,1.2,0];radius=3;ground=0;return;}
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const piece of scene.pieces) for(let j=0;j<3;j++){
      const s=piece.size?.[j]||1,pos=piece.position?.[j]||0;min[j]=Math.min(min[j],pos-s*.6);max[j]=Math.max(max[j],pos+s*.6);
    }
    center=min.map((n,j)=>(n+max[j])/2);radius=Math.max(.5,Math.hypot(...max.map((n,j)=>(n-min[j])/2)));ground=min[1]+.1;
  }
  function toScreen(vp,world){const v=transform(vp,world),w=v[3]||1;return [(v[0]/w*.5+.5)*width,(-v[1]/w*.5+.5)*height,v[2]/w];}
  function buildPicking(piece,mesh,model,vp){
    const vertices=mesh.vertices.map(v=>toScreen(vp,transform(model,v)));
    for(const tri of mesh.triangleIndices)picking.push({id:piece.id,points:tri.map(i=>vertices[i])});
    const xy=toScreen(vp,piece.position);projected.push({id:piece.id,x:xy[0],y:xy[1],z:xy[2]});
  }
  function render(time){
    const started=performance.now();lastDrawCalls=0;picking=[];projected=[];
    animate(time);
    const visualPieces=scene.pieces.map(visualPiece);
    const aspect=width/height, span=radius*1.05*zoomFactor*Math.max(1,1/aspect);
    const distance=radius*4+10, eye=[center[0]+Math.sin(yaw)*Math.cos(pitch)*distance,center[1]+Math.sin(pitch)*distance,center[2]+Math.cos(yaw)*Math.cos(pitch)*distance];
    const vp=multiply(orthographic(span*aspect,span,.01,distance+radius*8+30),lookAt(eye,center));
    gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.useProgram(p);gl.uniformMatrix4fv(loc.uViewProjection,false,vp);gl.uniform3fv(loc.uEye,eye);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    // Quiet grid and projected footprint: no shadow maps, textures or postprocessing.
    gl.depthMask(false);
    const step=radius/5;
    drawLine(grid,gridData.length/6,[center[0],ground-.025,center[2]],[step,1,step],[.38,.60,.60,.10]);
    for(const piece of visualPieces){
      const s=piece.size||[1,1,1], at=[piece.position[0],ground-.02,piece.position[2]],shade=clamp(.15-(piece.position[1]-ground)*.014,.035,.15);
      draw(meshes.cube,at,[s[0]*1.4,.001,s[2]*1.4],[0,0,0],[.0,.025,.03,shade],{unlit:true});
    }
    gl.depthMask(true);
    const selected=new Set(scene.selectedIds),activeIds=new Set(scene.activeIds);
    for(const piece of visualPieces){
      const size=piece.size||[1,1,1],position=piece.position||[0,0,0],rotation=piece.rotation||[0,0,0],mesh=meshFor(piece);
      const special=['servo','rotor','pyramid','tetra','coupler','hinge'].includes(piece.type);
      let color=readColor(piece.color,special?[.42,.47,.48,1]:[.145,.18,.185,1]);
      if(piece.type==='battery')color=[.16,.35,.27,1];
      if(selected.has(piece.id))color=color.map((n,i)=>i<3?n*1.15:n);
      const model=pose(position,size,rotation);
      // A battery has a transparent casing. An opaque full-size box would hide
      // its liquid even if a translucent pass were added afterwards.
      if(piece.type!=='battery')draw(mesh,position,size,rotation,color);
      draw(mesh,position,size.map(n=>n*1.003),rotation,[.50,.62,.63,.24],{edges:true,unlit:true});
      buildPicking(piece,mesh,model,vp);
      if(piece.type==='battery'){
        // Game's green liquid and two opaque covers, represented without liquid physics.
        const liquid=transform(model,[0,-.06,.01]).slice(0,3);
        draw(meshes.cube,liquid,[size[0]*.87,size[1]*.74,size[2]*.87],rotation,[.045,.73,.30,1]);
        for(const sign of [-1,1]){
          const cap=transform(model,[0,sign*.47,0]).slice(0,3);
          draw(meshes.cube,cap,[size[0]*1.01,size[1]*.08,size[2]*1.01],rotation,sign===1?[.32,.40,.37,1]:[.17,.23,.21,1]);
        }
        gl.depthMask(false);draw(meshes.cube,position,size.map(v=>v*1.015),rotation,[.7,.9,.8,.14]);gl.depthMask(true);
      }
      if(['rotor','servo','hinge','gripper','drone'].includes(piece.type)){
        const indicator=transform(model,[0,0,.509]).slice(0,3), isActive=activeIds.has(piece.id);
        const glow=isActive?[.43,.96,.80,1]:[.48,.73,.70,1];
        draw(meshes.cube,indicator,[size[0]*.44,size[1]*.05,size[2]*.018],rotation,glow,{unlit:true});
        if(piece.type==='rotor'){
          const hub=transform(model,[0,0,.51]).slice(0,3),phase=motion.get(piece.id)?.phase||0;
          drawLine(ring,ringData.length/6,hub,[size[0]*.34,size[1]*.34,size[2]*.34],[.55,.70,.69,.85],[Math.PI/2,0,0]);
          const marker=transform(model,[Math.sin(phase)*.28,Math.cos(phase)*.28,.52]).slice(0,3);
          draw(meshes.cube,marker,[size[0]*.075,size[1]*.075,size[2]*.02],rotation,glow,{unlit:true});
        }
        if(piece.type==='servo'){
          const angle=(motion.get(piece.id)?.angle||0)*Math.PI/180;
          const tip=transform(model,[Math.sin(angle)*.36,Math.cos(angle)*.36,.15]).slice(0,3);
          draw(meshes.cube,tip,[size[0]*.10,size[1]*.10,size[2]*.05],rotation,glow,{unlit:true});
        }
      }
      if(piece.type==='family'){
        for(const side of [-1,1]){
          const band=transform(model,[0,side*.29,.506]).slice(0,3);
          draw(meshes.cube,band,[size[0]*.92,size[1]*.045,size[2]*.018],rotation,[.39,.76,.70,1],{unlit:true});
        }
      }
      if(piece.type==='drone'){
        for(const x of [-.32,.32])for(const z of [-.32,.32]){
          const hub=transform(model,[x,.52,z]).slice(0,3),r=Math.min(size[0],size[2])*.18;
          drawLine(ring,ringData.length/6,hub,[r,1,r],[.53,.72,.70,1]);
          const phase=motion.get(piece.id)?.phase||Math.PI/4;
          draw(meshes.cube,hub,[r*1.75,size[1]*.035,r*.15],[0,phase,0],[.58,.73,.70,1]);
        }
      }
      if(selected.has(piece.id)){
        // Enlarged back-facing silhouette plus original-profile edges. Shared meshes only.
        gl.cullFace(gl.FRONT);draw(mesh,position,size.map(n=>n*1.045),rotation,[.45,.95,.86,1],{unlit:true});gl.cullFace(gl.BACK);
        draw(mesh,position,size.map(n=>n*1.009),rotation,[.64,1,.93,1],{edges:true,unlit:true});
      }
      if(activeIds.has(piece.id)){
        const pulse=mql.matches?.65:.6+.25*Math.sin(time*.003);
        drawLine(ring,ringData.length/6,[position[0],ground+.005,position[2]],[size[0]*.83,1,size[2]*.83],[.35,.85,.72,pulse]);
      }
    }
    if(scene.blueprint){
      const target=typeof scene.blueprint==='object'?scene.blueprint:{},targets=target.pieces||scene.pieces.filter(p=>selected.has(p.id)),offset=target.offset||[.9,0,.9];
      gl.depthMask(false);
      for(const piece of targets){
        const position=piece.position.map((n,i)=>n+(offset[i]||0)),size=piece.size||[1,1,1],mesh=meshFor(piece);
        draw(mesh,position,size,piece.rotation,[.22,.60,1,.15],{unlit:true});
        draw(mesh,position,size,piece.rotation,[.32,.72,1,.8],{edges:true,unlit:true});
      }
      gl.depthMask(true);
    }
    const elapsed=performance.now()-started;frameCounter++;totalCpuMs+=elapsed;maxCpuMs=Math.max(maxCpuMs,elapsed);samples.push(elapsed);if(samples.length>180)samples.shift();
    if(time-lastReport>1000||frameCounter===1){lastReport=time;onMeasure(measure());}
  }
  function frame(time){
    raf=0;if(!active())return;
    if(dirty||time-lastFrame>=33){dirty=false;lastFrame=time;render(time);}
    if(active()&&animated()&&!raf)raf=requestAnimationFrame(frame);
  }
  function resize(){
    if(disposed)return;
    const box=canvas.getBoundingClientRect(),nextW=Math.max(1,canvas.clientWidth||box.width),nextH=Math.max(1,canvas.clientHeight||box.height),dpr=Math.min(window.devicePixelRatio||1,1.75);
    width=nextW;height=nextH;const w=Math.round(width*dpr),h=Math.round(height*dpr);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}invalidate();
  }
  const observer=new ResizeObserver(resize);observer.observe(canvas);
  function setScene(next){
    if(disposed)return;
    const previousIds=new Set(scene.pieces.map(piece=>piece.id));
    const first=scene.pieces.length===0||!(next.pieces||[]).some(piece=>previousIds.has(piece.id));
    scene={pieces:next.pieces||[],selectedIds:next.selectedIds||[],activeIds:next.activeIds||[],blueprint:next.blueprint||null,mechanisms:next.mechanisms||{},joints:next.joints||[]};
    syncMotion();
    if(first)fitBounds();invalidate();
  }
  function orbit(dx=0,dy=0){yaw+=dx;pitch=clamp(pitch+dy,.08,1.35);invalidate();}
  function zoom(delta=0){zoomFactor=clamp(zoomFactor*Math.exp(delta),.45,2.4);invalidate();}
  let drag=null;
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};
    canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';
  },{signal});
  canvas.addEventListener('pointermove',e=>{
    if(!drag||drag.id!==e.pointerId)return;
    if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>5)drag.moved=true;
    if(drag.moved)orbit(-(e.clientX-drag.x)*.007,(e.clientY-drag.y)*.007);
    drag.x=e.clientX;drag.y=e.clientY;
  },{signal});
  function release(e){
    if(!drag||drag.id!==e.pointerId)return;
    const was=drag;drag=null;canvas.style.cursor='grab';
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    if(!was.moved&&e.type==='pointerup'){
      const box=canvas.getBoundingClientRect();
      // offset coordinates are in the canvas's CSS plane even when the whole
      // tablet is transformed. Rect normalization is only a legacy fallback.
      const point=Number.isFinite(e.offsetX)&&Number.isFinite(e.offsetY)?[e.offsetX,e.offsetY]:[(e.clientX-box.left)*width/box.width,(e.clientY-box.top)*height/box.height];
      let hit=null,depth=Infinity;
      for(const tri of picking){const w=barycentric(point,...tri.points);if(!w)continue;const z=w.reduce((sum,n,i)=>sum+n*tri.points[i][2],0);if(z<depth){depth=z;hit=tri.id;}}
      onSelect(hit,e);
    }
  }
  canvas.addEventListener('pointerup',release,{signal});canvas.addEventListener('pointercancel',release,{signal});
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(clamp(e.deltaY,-100,100)*.002);},{passive:false,signal});
  document.addEventListener('visibilitychange',()=>{animationTimestamp=null;if(document.hidden){cancelAnimationFrame(raf);raf=0;}else invalidate();},{signal});
  mql.addEventListener('change',invalidate,{signal});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;cancelAnimationFrame(raf);raf=0;canvas.dataset.renderer='lost';onMeasure({...measure(),available:false,error:'context-lost'});},{signal});
  canvas.addEventListener('webglcontextrestored',()=>{canvas.dataset.renderer='reload-required';onMeasure({...measure(),available:false,error:'context-restored-reload-required'});},{signal});
  resize();
  return {
    setScene,
    setActive(value){enabled=Boolean(value);animationTimestamp=null;if(!enabled){cancelAnimationFrame(raf);raf=0;}else invalidate();},
    fit(){yaw=.62;pitch=.48;zoomFactor=.80;fitBounds();invalidate();},orbit,zoom,
    getProjectedPieces(){return projected.map(p=>({...p}));},
    getMetrics:measure,
    dispose(){
      if(disposed)return;disposed=true;cancelAnimationFrame(raf);raf=0;observer.disconnect();abort.abort();
      buffers.forEach(b=>gl.deleteBuffer(b));gl.deleteProgram(p);picking=[];projected=[];motion.clear();
      canvas.dataset.renderer='disposed';
    }
  };
}

/** A genuine projected 3D fallback for browsers without WebGL.
 * Uses the same profiles, camera, joints and picking contract. The painter
 * sorts outward-facing polygons by depth; no DOM facsimile or physics world.
 */
export function createSoftwareRenderer(canvas,{onSelect=()=>{},onMeasure=()=>{},onSettled=()=>{}}={}){
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx){
    canvas.dataset.renderer='unavailable';const message=document.createElement('p');message.className='viewport-fallback';
    message.textContent='La vista gráfica no está disponible. Puedes usar la lista de piezas y sus controles.';message.setAttribute('role','status');canvas.insertAdjacentElement('afterend',message);
    return {setScene(){},setActive(){},fit(){},orbit(){},zoom(){},getProjectedPieces:()=>[],getMetrics:()=>({available:false,backend:'none',physicsBodies:0,gpuBuffers:0,scheduledFrames:0}),dispose(){message.remove();}};
  }
  canvas.dataset.renderer='canvas2d';canvas.style.touchAction='none';
  const profiles=Object.fromEntries(Object.entries(PROFILES).map(([name,profile])=>{
    const faces=profile.faces.map(input=>{const face=[...input],center=[0,0,0];face.forEach(i=>profile.vertices[i].forEach((n,j)=>center[j]+=n/face.length));
      const n=cross(sub(profile.vertices[face[1]],profile.vertices[face[0]]),sub(profile.vertices[face[2]],profile.vertices[face[0]]));if(dot(n,center)<0)face.reverse();return face;});
    return [name,{vertices:profile.vertices,faces}];
  }));
  const abort=new AbortController(),signal=abort.signal,mql=window.matchMedia('(prefers-reduced-motion: reduce)'),motion=new Map();
  let scene={pieces:[],selectedIds:[],activeIds:[],blueprint:null,mechanisms:{},joints:[]};
  let disposed=false,enabled=true,raf=0,dirty=true,lastFrame=-Infinity,lastReport=-Infinity,animationTimestamp=null;
  let width=1,height=1,dpr=1,yaw=.62,pitch=.48,zoomFactor=.80,center=[0,1.2,0],radius=3,ground=0;
  let picking=[],projected=[],frames=0,totalCpuMs=0,maxCpuMs=0,drawCalls=0;const samples=[];
  const active=()=>enabled&&!document.hidden&&!disposed;
  const animated=()=>!mql.matches&&scene.activeIds.some(id=>scene.pieces.some(p=>p.id===id)&&!motion.get(id)?.settled);
  function invalidate(){dirty=true;if(!raf&&active())raf=requestAnimationFrame(frame);}
  function metrics(){const sorted=[...samples].sort((a,b)=>a-b),at=f=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*f))]||0;
    return {available:!disposed,backend:'canvas2d',frames,pieceCount:scene.pieces.length,drawCalls,physicsBodies:0,gpuBuffers:0,
      cpuMeanMs:frames?totalCpuMs/frames:0,cpuP50Ms:at(.5),cpuP95Ms:at(.95),cpuMaxMs:maxCpuMs,animationActive:active()&&animated(),scheduledFrames:raf?1:0,pickingTriangles:picking.length,devicePixelRatio:dpr,
      settledMotorIds:[...motion].filter(([id,m])=>m.running&&m.settled).map(([id])=>id)};
  }
  function fitBounds(){
    if(!scene.pieces.length){center=[0,1.2,0];radius=3;ground=0;return;}
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const piece of scene.pieces)for(let j=0;j<3;j++){const s=piece.size?.[j]||1,p=piece.position?.[j]||0;min[j]=Math.min(min[j],p-s*.6);max[j]=Math.max(max[j],p+s*.6);}
    center=min.map((n,j)=>(n+max[j])/2);radius=Math.max(.5,Math.hypot(...max.map((n,j)=>(n-min[j])/2)));ground=min[1]+.1;
  }
  function syncMotion(){
    const ids=new Set(scene.pieces.map(p=>p.id)),activeIds=new Set(scene.activeIds);for(const id of motion.keys())if(!ids.has(id))motion.delete(id);
    for(const piece of scene.pieces){if(!['rotor','servo','drone'].includes(piece.type))continue;const c=scene.mechanisms[piece.id]||{},running=activeIds.has(piece.id),serial=c.restartSerial||0;let m=motion.get(piece.id);
      if(!m||m.serial!==serial){m={phase:0,angle:0,serial,running:false,settled:false,travelDirection:c.direction||1,command:''};motion.set(piece.id,m);}
      const command=[c.mode,c.direction,c.min,c.max,c.target].join('|');if((running&&!m.running)||command!==m.command){m.settled=false;m.travelDirection=c.direction||1;}m.running=running;m.command=command;
    }
  }
  function animate(time){
    const dt=animationTimestamp===null?0:clamp((time-animationTimestamp)/1000,0,.06);animationTimestamp=time;
    for(const piece of scene.pieces){const m=motion.get(piece.id);if(!m?.running||m.settled)continue;const c=scene.mechanisms[piece.id]||{};
      if(piece.type==='servo'){
        const lo=Number.isFinite(c.min)?c.min:-60,hi=Number.isFinite(c.max)?c.max:60,speed=Number.isFinite(c.speed)?c.speed:45;
        if(c.mode==='repeat'){if(mql.matches)continue;const span=Math.max(.001,hi-lo),at=clamp(m.angle,lo,hi)-lo;let phase=m.travelDirection===1?at:span*2-at;phase=(phase+speed*dt)%(span*2);m.angle=lo+(phase<=span?phase:span*2-phase);m.travelDirection=phase<span?1:-1;}
        else{const goal=clamp(Number.isFinite(c.target)?c.target:30,lo,hi),distance=goal-m.angle;m.angle=mql.matches?goal:m.angle+Math.sign(distance)*Math.min(Math.abs(distance),speed*dt);
          if(Math.abs(goal-m.angle)<.0001&&(dt>0||mql.matches)){m.angle=goal;m.settled=true;queueMicrotask(()=>{if(!disposed)onSettled(piece.id);});}}
      }else if(!mql.matches){const speed=Number.isFinite(c.speed)?c.speed:30;m.phase=(m.phase+(c.direction||1)*(piece.type==='rotor'?speed*TAU/60:4+speed*8)*dt)%TAU;}
    }
  }
  function visualPiece(piece){
    let position=[...piece.position],rotation=quaternion(piece.rotation||[0,0,0]);
    for(let i=scene.joints.length-1;i>=0;i--){const joint=scene.joints[i];if(!joint.drivenIds?.includes(piece.id))continue;const m=motion.get(joint.motorId);if(!m)continue;
      const angle=scene.mechanisms[joint.motorId]?.type==='servo'?m.angle*Math.PI/180:m.phase,s=Math.sin(angle/2),q=[joint.axis==='x'?s:0,joint.axis==='y'?s:0,joint.axis==='z'?s:0,Math.cos(angle/2)],v=rotateVector(q,sub(position,joint.pivot));
      position=v.map((n,k)=>n+joint.pivot[k]);rotation=multiplyQuaternion(q,rotation);
    }return {...piece,position,rotation};
  }
  const rgba=(c,a=1)=>`rgba(${c.slice(0,3).map(v=>Math.round(clamp(v,0,1)*255)).join(',')},${a*(c[3]??1)})`;
  function render(time){
    const started=performance.now();animate(time);picking=[];projected=[];drawCalls=0;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.lineJoin='round';ctx.lineCap='round';
    const aspect=width/height,span=radius*1.05*zoomFactor*Math.max(1,1/aspect),distance=radius*4+10;
    const eye=[center[0]+Math.sin(yaw)*Math.cos(pitch)*distance,center[1]+Math.sin(pitch)*distance,center[2]+Math.cos(yaw)*Math.cos(pitch)*distance],vp=multiply(orthographic(span*aspect,span,.01,distance+radius*8+30),lookAt(eye,center));
    const screen=p=>{const v=transform(vp,p),w=v[3]||1;return [(v[0]/w*.5+.5)*width,(-v[1]/w*.5+.5)*height,v[2]/w];};
    const path=points=>{ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));};
    const primitives=[],selected=new Set(scene.selectedIds),activeIds=new Set(scene.activeIds),light=normal([-.45,.90,.65]),fill=normal([.8,.3,-.7]);
    function line(points,color,lineWidth=1){const pts=points.map(screen);primitives.push({points:pts,depth:pts.reduce((s,p)=>s+p[2],0)/pts.length,stroke:rgba(color),lineWidth});}
    function shape(profileName,position,size,rotation,color,id=null,highlight=false,unlit=false){
      const profile=Object.hasOwn(profiles,profileName)?profiles[profileName]:profiles.cube,m=pose(position,size,rotation),world=profile.vertices.map(v=>transform(m,v).slice(0,3)),vertices=world.map(screen);
      for(const face of profile.faces){const points=face.map(i=>vertices[i]),w=face.map(i=>world[i]),n=normal(cross(sub(w[1],w[0]),sub(w[2],w[0]))),centroid=w.reduce((v,p)=>v.map((k,j)=>k+p[j]/w.length),[0,0,0]);
        if(dot(n,sub(eye,centroid))<=0)continue;
        const factor=.51+.65*Math.max(0,dot(n,light))+.20*Math.max(0,dot(n,fill)),shine=Math.pow(Math.max(0,dot(n,normal(light.map((v,j)=>v+normal(sub(eye,centroid))[j])))),42)*.18;
        const paint=unlit?color:color.map((v,j)=>j<3?v*factor+shine:v);
        primitives.push({points,depth:points.reduce((s,p)=>s+p[2],0)/points.length,fill:rgba(paint),stroke:highlight?'#a5ffe7':rgba([.50,.65,.64,.27*(color[3]??1)]),lineWidth:highlight?1.6:.65});
        if(id)for(let i=1;i<points.length-1;i++)picking.push({id,points:[points[0],points[i],points[i+1]]});
      }return m;
    }
    const visualPieces=scene.pieces.map(visualPiece);
    // The floor grid and soft footprints are deliberately simpler than the game.
    const step=radius/5;ctx.strokeStyle='rgba(134,184,174,.11)';ctx.lineWidth=.7;
    for(let i=-10;i<=10;i++)for(const ends of [[[i*step,-10*step],[i*step,10*step]],[[-10*step,i*step],[10*step,i*step]]]){path(ends.map(([x,z])=>screen([center[0]+x,ground-.025,center[2]+z])));ctx.stroke();drawCalls++;}
    for(const p of visualPieces){const s=p.size||[1,1,1],corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>screen([p.position[0]+x*s[0]*.8,ground-.02,p.position[2]+z*s[2]*.8]));path(corners);ctx.closePath();ctx.fillStyle='rgba(0,15,18,.15)';ctx.fill();drawCalls++;}
    function ringAt(model,r,color,vertical=false){const points=[];for(let i=0;i<=36;i++){const a=i*TAU/36;points.push(transform(model,vertical?[Math.cos(a)*r,Math.sin(a)*r,.515]:[Math.cos(a)*r,.51,Math.sin(a)*r]).slice(0,3));}line(points,color,1.1);}
    for(const piece of visualPieces){
      const size=piece.size||[1,1,1],rotation=piece.rotation||[0,0,0],isSelected=selected.has(piece.id),special=['servo','rotor','pyramid','tetra','coupler','hinge'].includes(piece.type);
      const profile=Object.hasOwn(profiles,piece.shape)?piece.shape:Object.hasOwn(profiles,piece.type)?piece.type:'cube';
      let color=readColor(piece.color,special?[.42,.47,.48,1]:[.145,.18,.185,1]);if(isSelected)color=color.map((v,i)=>i<3?v*1.15:v);
      const model=pose(piece.position,size,rotation),at=p=>transform(model,p).slice(0,3),detail=(p,s,c)=>shape('cube',at(p),size.map((v,i)=>v*s[i]),rotation,c,piece.id,false,true);
      if(piece.type!=='battery')shape(profile,piece.position,size,rotation,color,piece.id,isSelected);
      if(piece.type==='battery'){
        shape('cube',at([0,-.06,.01]),size.map((v,i)=>v*[.87,.74,.87][i]),rotation,[.045,.73,.30,1],piece.id);
        for(const sign of [-1,1])detail([0,sign*.47,0],[1.01,.08,1.01],sign===1?[.32,.40,.37,1]:[.17,.23,.21,1]);
        shape('cube',piece.position,size,rotation,[.7,.9,.8,.17],piece.id,isSelected);
      }
      const xy=screen(piece.position);projected.push({id:piece.id,x:xy[0],y:xy[1],z:xy[2]});
      if(['rotor','servo','hinge','gripper','drone'].includes(piece.type)){
        const glow=activeIds.has(piece.id)?[.43,.96,.80,1]:[.48,.73,.70,1];detail([0,0,.511],[.44,.05,.018],glow);
        if(piece.type==='rotor'){ringAt(model,.34,[.55,.74,.71,.9],true);const phase=motion.get(piece.id)?.phase||0;detail([Math.sin(phase)*.28,Math.cos(phase)*.28,.52],[.075,.075,.02],glow);}
        if(piece.type==='servo'){const angle=(motion.get(piece.id)?.angle||0)*Math.PI/180;detail([Math.sin(angle)*.36,Math.cos(angle)*.36,.15],[.1,.1,.05],glow);}
      }
      if(piece.type==='family')for(const side of [-1,1])detail([0,side*.29,.506],[.92,.045,.018],[.39,.76,.70,1]);
      if(piece.type==='drone')for(const x of [-.32,.32])for(const z of [-.32,.32]){
        const points=[];for(let i=0;i<=28;i++){const a=i*TAU/28;points.push(at([x+Math.cos(a)*.18,.52,z+Math.sin(a)*.18]));}line(points,[.53,.72,.70,1],1.2);
        const phase=motion.get(piece.id)?.phase||Math.PI/4;line([at([x-Math.cos(phase)*.15,.53,z-Math.sin(phase)*.15]),at([x+Math.cos(phase)*.15,.53,z+Math.sin(phase)*.15])],[.64,.81,.74,1],2.3);
      }
      if(activeIds.has(piece.id)){const points=[];for(let i=0;i<=36;i++){const a=i*TAU/36;points.push([piece.position[0]+Math.cos(a)*size[0]*.83,ground+.005,piece.position[2]+Math.sin(a)*size[2]*.83]);}line(points,[.35,.85,.72,mql.matches?.65:.6+.25*Math.sin(time*.003)],1.2);}
    }
    if(scene.blueprint){const target=typeof scene.blueprint==='object'?scene.blueprint:{},offset=target.offset||[.9,0,.9],pieces=target.pieces||scene.pieces.filter(p=>selected.has(p.id));for(const p of pieces)shape(p.shape||p.type,p.position.map((n,i)=>n+(offset[i]||0)),p.size||[1,1,1],p.rotation,[.23,.65,1,.22],null,true,true);}
    primitives.sort((a,b)=>b.depth-a.depth);
    for(const item of primitives){path(item.points);if(item.fill){ctx.closePath();ctx.fillStyle=item.fill;ctx.fill();}if(item.stroke){ctx.strokeStyle=item.stroke;ctx.lineWidth=item.lineWidth;ctx.stroke();}drawCalls++;}
    const elapsed=performance.now()-started;frames++;totalCpuMs+=elapsed;maxCpuMs=Math.max(maxCpuMs,elapsed);samples.push(elapsed);if(samples.length>180)samples.shift();
    if(time-lastReport>1000||frames===1){lastReport=time;onMeasure(metrics());}
  }
  function frame(time){raf=0;if(!active())return;if(dirty||time-lastFrame>=33){dirty=false;lastFrame=time;render(time);}if(active()&&animated()&&!raf)raf=requestAnimationFrame(frame);}
  function resize(){if(disposed)return;const box=canvas.getBoundingClientRect();width=Math.max(1,canvas.clientWidth||box.width);height=Math.max(1,canvas.clientHeight||box.height);dpr=Math.min(window.devicePixelRatio||1,1.5);
    const w=Math.round(width*dpr),h=Math.round(height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}invalidate();}
  const observer=new ResizeObserver(resize);observer.observe(canvas);
  function setScene(next){if(disposed)return;const ids=new Set(scene.pieces.map(p=>p.id)),first=!scene.pieces.length||!(next.pieces||[]).some(p=>ids.has(p.id));
    scene={pieces:next.pieces||[],selectedIds:next.selectedIds||[],activeIds:next.activeIds||[],blueprint:next.blueprint||null,mechanisms:next.mechanisms||{},joints:next.joints||[]};syncMotion();if(first)fitBounds();invalidate();}
  const orbit=(dx=0,dy=0)=>{yaw+=dx;pitch=clamp(pitch+dy,.08,1.35);invalidate();},zoom=(delta=0)=>{zoomFactor=clamp(zoomFactor*Math.exp(delta),.45,2.4);invalidate();};
  let drag=null;
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';},{signal});
  canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>5)drag.moved=true;if(drag.moved)orbit(-(e.clientX-drag.x)*.007,(e.clientY-drag.y)*.007);drag.x=e.clientX;drag.y=e.clientY;},{signal});
  function release(e){if(!drag||drag.id!==e.pointerId)return;const was=drag;drag=null;canvas.style.cursor='grab';if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    if(!was.moved&&e.type==='pointerup'){const box=canvas.getBoundingClientRect(),point=Number.isFinite(e.offsetX)&&Number.isFinite(e.offsetY)?[e.offsetX,e.offsetY]:[(e.clientX-box.left)*width/box.width,(e.clientY-box.top)*height/box.height];let hit=null,depth=Infinity;
      for(const tri of picking){const w=barycentric(point,...tri.points);if(!w)continue;const z=w.reduce((sum,n,i)=>sum+n*tri.points[i][2],0);if(z<depth){hit=tri.id;depth=z;}}onSelect(hit,e);}}
  canvas.addEventListener('pointerup',release,{signal});canvas.addEventListener('pointercancel',release,{signal});canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(clamp(e.deltaY,-100,100)*.002);},{passive:false,signal});
  document.addEventListener('visibilitychange',()=>{animationTimestamp=null;if(document.hidden){cancelAnimationFrame(raf);raf=0;}else invalidate();},{signal});mql.addEventListener('change',invalidate,{signal});resize();
  return {setScene,setActive(value){enabled=Boolean(value);animationTimestamp=null;if(!enabled){cancelAnimationFrame(raf);raf=0;}else invalidate();},fit(){yaw=.62;pitch=.48;zoomFactor=.80;fitBounds();invalidate();},orbit,zoom,
    getProjectedPieces:()=>projected.map(p=>({...p})),getMetrics:metrics,
    dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);raf=0;observer.disconnect();abort.abort();picking=[];projected=[];motion.clear();ctx.clearRect(0,0,canvas.width,canvas.height);canvas.dataset.renderer='disposed';}};
}

/** The game's actual beveled tablet mesh, used as a static shell behind DOM.
 * Apply the same CSS perspective to shell and controls as a single device.
 * No simulation, animation loop, external texture, or game event is installed.
 */
export function createTabletShell(canvas,{alloy=false}={}) {
  let gl=null;try{gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false,powerPreference:'low-power'});}catch{}
  const model=globalThis.QBitsTabletModel;
  if(!model)return {available:false,draw(){},setPose(){},dispose(){}};
  if(!gl){
    const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)return {available:false,draw(){},setPose(){},dispose(){}};
    canvas.dataset.renderer='canvas2d';let disposed=false;
    const faces=[];
    for(let i=0;i<model.triangles.length;i+=3){const points=model.triangles.slice(i,i+3).map(id=>model.positions.slice(id*3,id*3+3));let n=normal(cross(sub(points[1],points[0]),sub(points[2],points[0])));
      if(dot(n,[points[0][0],points[0][1],points[0][2]+.028])<0)n=n.map(v=>-v);if(n[2]<-.01)continue;
      faces.push({points,normal:n,depth:points.reduce((s,p)=>s+p[2],0)/3});}
    faces.sort((a,b)=>a.depth-b.depth);
    function draw(){if(disposed)return;const dpr=Math.min(window.devicePixelRatio||1,1.5),w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
      if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
      for(const face of faces){const light=.5+.5*dot(face.normal,normal([-.4,-.7,.7])),base=alloy?[.18,.20,.22]:[.10,.25,.27],color=base.map(v=>v*(.55+light*.7)+.15*Math.pow(light,8));
        ctx.beginPath();face.points.forEach((p,i)=>{const x=(p[0]*.995+.5)*w,y=(p[1]*.995+.5)*h;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.fillStyle=`rgb(${color.map(v=>Math.round(clamp(v,0,1)*255)).join(',')})`;ctx.fill();}
    }
    const observer=new ResizeObserver(draw);observer.observe(canvas);draw();
    return {available:true,backend:'canvas2d',draw,setPose(options={}){if(typeof options.alloy==='boolean')alloy=options.alloy;draw();},dispose(){if(disposed)return;disposed=true;observer.disconnect();ctx.clearRect(0,0,canvas.width,canvas.height);}};
  }
  const p=program(gl,`
    attribute vec3 aPosition,aNormal;
    varying vec3 vNormal,vPoint;
    void main(){vNormal=aNormal;vPoint=aPosition;gl_Position=vec4(aPosition.x*1.99,aPosition.y*-1.99,-aPosition.z,1.0);}
  `,`
    precision mediump float;
    varying vec3 vNormal,vPoint;
    uniform float uAlloy;
    void main(){
      float light=.5+.5*dot(normalize(vNormal),normalize(vec3(-.4,-.7,.7)));
      vec3 base=mix(vec3(.10,.25,.27),vec3(.18,.20,.22),uAlloy);
      vec3 c=base*(.55+light*.7)+vec3(.15)*pow(light,8.0);
      float glass=step(abs(vPoint.x),.465)*step(-.455,vPoint.y)*step(vPoint.y,.408)*step(-.0002,vPoint.z);
      c=mix(c,vec3(.025,.075,.085),glass);
      float seam=(1.0-smoothstep(.001,.004,abs(vPoint.z+.026)));
      c=mix(c,mix(vec3(.36,.71,.68),vec3(.7,.50,.29),uAlloy),seam*.65);
      gl_FragColor=vec4(c,mix(1.0,.93,glass));
    }
  `);
  const data=[];
  for(let i=0;i<model.triangles.length;i+=3){
    const points=model.triangles.slice(i,i+3).map(id=>model.positions.slice(id*3,id*3+3));
    let n=normal(cross(sub(points[1],points[0]),sub(points[2],points[0])));
    const outside=[points[0][0],points[0][1],points[0][2]+.028];if(dot(n,outside)<0)n=n.map(v=>-v);
    points.forEach(v=>data.push(...v,...n));
  }
  const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
  const a=gl.getAttribLocation(p,'aPosition'),n=gl.getAttribLocation(p,'aNormal'),u=gl.getUniformLocation(p,'uAlloy');
  let disposed=false;
  function draw(){
    if(disposed)return;
    const dpr=Math.min(window.devicePixelRatio||1,1.5),w=Math.round(canvas.clientWidth*dpr),h=Math.round(canvas.clientHeight*dpr);
    if(canvas.width!==w||canvas.height!==h){canvas.width=Math.max(1,w);canvas.height=Math.max(1,h);}
    gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.useProgram(p);gl.bindBuffer(gl.ARRAY_BUFFER,b);
    gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(n);gl.vertexAttribPointer(n,3,gl.FLOAT,false,24,12);gl.uniform1f(u,alloy?1:0);gl.drawArrays(gl.TRIANGLES,0,data.length/6);
  }
  const observer=new ResizeObserver(draw);observer.observe(canvas);draw();
  return {available:true,backend:'webgl',draw,setPose(options={}){if(typeof options.alloy==='boolean')alloy=options.alloy;draw();},dispose(){if(disposed)return;disposed=true;observer.disconnect();gl.deleteBuffer(b);gl.deleteProgram(p);}};
}
