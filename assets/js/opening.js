/* Q-bits opening. Geometry is independent of the campaign's simulation and saves. */
(() => {
  'use strict';
  const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
  const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  const mix = (a, b, t) => a + (b - a) * t;
  const lerp = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const n = Math.hypot(...a) || 1; return a.map(x => x / n); };
  // Centers of the 69 actual dot contours in LEDCalculator.ttf, Q-bits, normalized
  // to 15 world units. This exact outline-derived fallback also avoids tofu dots.
  const FONT_DOTS = [[-6.1765,-1.3245],[-5.7347,-.8827],[-6.6173,-1.3245],[-5.7347,-.4419],[-7.0592,-1.3245],[-5.7347,0],[-5.7347,.4408],[-7.5,-.8827],[-7.5,-.4419],[-6.6173,.4408],[-6.1765,.8827],[-5.7347,1.3245],[-7.5,0],[-7.5,.4408],[-6.6173,1.3245],[-7.5,.8827],[-7.0592,1.3245],[-3.0877,0],[-3.5296,0],[-3.9704,0],[-4.4123,0],[-4.8531,0],[-.8827,-.4419],[-.4408,0],[-2.2061,-1.3245],[-1.3235,-.4419],[-.4408,.4408],[-2.2061,-.8827],[-.4408,.8827],[-2.2061,-.4419],[-1.7653,0],[-2.2061,0],[-.8827,1.3245],[-2.2061,.4408],[-1.3235,1.3245],[-2.2061,.8827],[-1.7653,1.3245],[-2.2061,1.3245],[1.3235,-1.3245],[1.3235,-.4419],[.8816,-.4419],[1.3235,0],[1.3235,.4408],[1.3235,.8827],[1.7643,1.3245],[1.3235,1.3245],[.8816,1.3245],[3.9704,-1.3245],[3.9704,-.8827],[4.4112,-.4419],[3.9704,-.4419],[3.5285,-.4419],[3.9704,0],[4.8531,.8827],[3.9704,.4408],[3.9704,.8827],[4.4112,1.3245],[7.0581,-.4419],[6.6173,-.4419],[6.1755,-.4419],[7.0581,.4408],[7.5,.8827],[6.6173,.4408],[5.7347,0],[6.1755,.4408],[7.0581,1.3245],[6.6173,1.3245],[6.1755,1.3245],[5.7347,1.3245]];
  const SIZE = .335;
  const TIMING = Object.freeze({ black: .8, assemble: 11.5, hold: .5, glow: 1.2, flight: 9.5, reducedFlight: 3, menuReveal: 1.2 });

  function fontDots() {
    // Exact centers extracted from the bundled font contours, independent of
    // browser antialiasing and raster scan order; each dot owns a stable route.
    return FONT_DOTS.map(p=>[...p]);
  }

  function random(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  function makePieces(dots = FONT_DOTS) {
    const rand = random(17062026), occupied=[];
    return dots.map((p,i) => {
      const a=rand()*Math.PI*2,r=12+rand()*5;
      const target=[p[0],SIZE/2,p[1]];
      let start=[target[0]+Math.round((Math.cos(a)*r-target[0])/SIZE)*SIZE,SIZE/2,target[2]+Math.round((Math.sin(a)*r-target[2])/SIZE)*SIZE];
      while(occupied.some(q=>Math.hypot(q[0]-start[0],q[2]-start[2])<SIZE*2)) {start[0]+=SIZE*2;start[2]+=SIZE*2;}
      occupied.push(start);
      return {id:i,target,start,bend:lerp(start,target,.5),p:[...start],v:[0,0,0],angle:0,delay:rand()*1.5,settled:false,segment:null,path:[],retry:0,replans:0,rollAxis:[0,0,1],rollAngle:0};
    });
  }
  function bezier(a,b,c,t){return lerp(a,c,t);}
  function obstacleBoxes(piece,pieces){return pieces.filter(p=>p!==piece).map(p=>{
    const a=p.segment?.from||p.p,b=p.segment?.to||p.p;
    return {x0:Math.min(a[0],b[0])-SIZE*.51,x1:Math.max(a[0],b[0])+SIZE*.51,z0:Math.min(a[2],b[2])-SIZE*.51,z1:Math.max(a[2],b[2])+SIZE*.51};
  });}
  function stepClear(a,b,boxes){
    const pad=SIZE*.51;
    return !boxes.some(o=>Math.min(a[0],b[0])-pad<o.x1&&Math.max(a[0],b[0])+pad>o.x0&&Math.min(a[2],b[2])-pad<o.z1&&Math.max(a[2],b[2])+pad>o.z0);
  }
  const directions=[[1,0],[-1,0],[0,1],[0,-1]];
  function plan(piece,pieces){
    const boxes=obstacleBoxes(piece,pieces),origin=piece.target;
    const sx=Math.round((piece.p[0]-origin[0])/SIZE),sz=Math.round((piece.p[2]-origin[2])/SIZE);
    const point=(x,z)=>[origin[0]+x*SIZE,SIZE/2,origin[2]+z*SIZE];
    const key=(x,z)=>x+','+z,open=[{x:sx,z:sz,g:0,f:Math.abs(sx)+Math.abs(sz),parent:null}],cost=new Map([[key(sx,sz),0]]);
    for(let n=0;open.length&&n<5000;n++){
      let best=0;for(let j=1;j<open.length;j++)if(open[j].f<open[best].f)best=j;
      const c=open.splice(best,1)[0];if(c.x===0&&c.z===0){const path=[];for(let q=c;q.parent;q=q.parent)path.push(point(q.x,q.z));return path.reverse();}
      for(const [dx,dz]of directions){const x=c.x+dx,z=c.z+dz,g=c.g+1,k=key(x,z);if(g>=(cost.get(k)??Infinity)||Math.abs(x)>100||Math.abs(z)>100)continue;
        if(!stepClear(point(c.x,c.z),point(x,z),boxes))continue;
        cost.set(k,g);open.push({x,z,g,f:g+Math.abs(x)+Math.abs(z),parent:c});
      }
    }return [];
  }
  function updatePieces(pieces,time,dt){
    pieces.tickRemainder=(pieces.tickRemainder||0)+dt;
    while(pieces.tickRemainder>=1/60-1e-9){pieces.tickRemainder-=1/60;const t=pieces.simulationTime||0;stepPieces(pieces,t,1/60);pieces.simulationTime=t+1/60;}
  }
  function stepPieces(pieces,time,dt){
    // Same movement principle as autonomous campaign cubes: choose a clear
    // cardinal step, reserve its sweep, and rotate 90 degrees on the support edge.
    for(const p of pieces){
      if(p.yieldFor?.settled){p.target=p.home;p.home=null;p.yieldFor=null;p.settled=false;p.path=[];p.retry=0;}
      if(p.settled||time<p.delay)continue;
      // Fill the enclosed dot of Q before closing its surrounding outline.
      const inner=pieces.find(q=>q.target[0]>-6.8&&q.target[0]<-6.4&&q.target[2]>.3&&q.target[2]<.6);
      if(inner&&inner!==p&&!inner.settled&&p.target[0]<-5.4)continue;
      if(!p.segment){
        if(Math.hypot(p.p[0]-p.target[0],p.p[2]-p.target[2])<.001){p.settled=true;continue;}
        if(time<p.retry)continue;
        if(!p.path.length||!stepClear(p.p,p.path[0],obstacleBoxes(p,pieces))){p.path=plan(p,pieces);p.replans++;}
        if(!p.path.length){
          if(p.replans%4===0&&!p.yieldFor){
            const candidates=pieces.filter(q=>q!==p&&!q.segment&&!q.home&&!q.yieldFor).sort((a,b)=>Math.min(Math.hypot(a.p[0]-p.p[0],a.p[2]-p.p[2]),Math.hypot(a.p[0]-p.target[0],a.p[2]-p.target[2]))-Math.min(Math.hypot(b.p[0]-p.p[0],b.p[2]-p.p[2]),Math.hypot(b.p[0]-p.target[0],b.p[2]-p.target[2])));
            for(const q of candidates.slice(0,5)){
              let found=false;for(const [dx,dz]of directions){const home=q.target,temp=[q.p[0]+dx*SIZE*3,SIZE/2,q.p[2]+dz*SIZE*3];q.target=temp;const route=plan(q,pieces);q.target=home;
                if(route.length){q.home=home;q.target=temp;q.path=route;q.settled=false;q.yieldFor=p;q.retry=0;found=true;break;}}
              if(found)break;
            }
          }
          p.retry=time+.25+(p.id%7)*.04;continue;
        }
        const to=p.path.shift(),from=[...p.p],dx=Math.round((to[0]-from[0])/SIZE),dz=Math.round((to[2]-from[2])/SIZE);
        p.segment={from,to,dx,dz,t:0};p.rollAxis=[dz,0,-dx];
      }
      const seg=p.segment;seg.t=Math.min(1,seg.t+dt/.12);
      const angle=smooth(seg.t)*Math.PI/2,h=SIZE/2;
      const distance=h*(1-Math.cos(angle)+Math.sin(angle));
      p.p=[seg.from[0]+seg.dx*distance,h*(Math.cos(angle)+Math.sin(angle)),seg.from[2]+seg.dz*distance];p.rollAngle=angle;
      if(seg.t===1){p.p=[...seg.to];p.segment=null;p.rollAngle=0;}
    }
  }

  function multiply(a, b) { const out = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return out; }
  function perspective(fov, aspect, near = .015, far = 150) {
    const f = 1 / Math.tan(fov / 2), m = new Float32Array(16);
    m[0] = f / aspect; m[5] = f; m[10] = (far + near) / (near - far); m[11] = -1; m[14] = 2 * far * near / (near - far); return m;
  }
  function lookAt(eye, at, roll = 0, topDown = false) {
    const z = norm(sub(eye, at));
    const up = topDown || Math.abs(z[1]) > .999 ? [Math.sin(roll), 0, -Math.cos(roll)] : [Math.sin(roll), Math.cos(roll), 0];
    const x = norm(cross(up, z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
  }
  function model(pos, size, angle = 0, rollAxis = null, rollAngle = 0) {
    if(rollAxis){const [x,y,z]=rollAxis,c=Math.cos(rollAngle),s=Math.sin(rollAngle),t=1-c;
      return new Float32Array([(t*x*x+c)*size[0],(t*x*y+s*z)*size[0],(t*x*z-s*y)*size[0],0,(t*x*y-s*z)*size[1],(t*y*y+c)*size[1],(t*y*z+s*x)*size[1],0,(t*x*z+s*y)*size[2],(t*y*z-s*x)*size[2],(t*z*z+c)*size[2],0,...pos,1]);}
    const c = Math.cos(angle), s = Math.sin(angle);
    return new Float32Array([c * size[0], 0, -s * size[0], 0, 0, size[1], 0, 0, s * size[2], 0, c * size[2], 0, ...pos, 1]);
  }
  function fitHeight(aspect) { return Math.max(10.2, 8.8 / (Math.tan(.61) * aspect)); }
  const smoother = x => { x=clamp(x);return x*x*x*(x*(x*6-15)+10); };
  function menuSize(aspect) { const width=SIZE*.88*Math.min(1,aspect);return [width,width/aspect]; }
  function flightCamera(t, aspect, target=[0,SIZE/2,0], reduced=false) {
    t=clamp(t);
    const u=smoother(t),height=fitHeight(aspect);
    const surface=[target[0],SIZE+.002,target[2]],fov=mix(1.22,1.04,u);
    const distance=menuSize(aspect)[1]/(2*Math.tan(1.04/2)),end=[surface[0],surface[1]+distance,surface[2]];
    // Restore the first opening's broad, tracked FPV arc. Orbit and approach
    // share one clock, with a calm speed envelope rather than a terminal surge.
    const angle=u*Math.PI*2,radius=reduced?0:8.8*Math.sin(Math.PI*u)*(1-u);
    const eye=t===1?[...end]:lerp([0,height,0],end,u);
    eye[0]+=Math.sin(angle)*radius;eye[2]+=Math.cos(angle)*radius;
    const bank=reduced||t===1?0:-.045*Math.sin(Math.PI*u)**2;
    return {eye,at:lerp([0,0,0],surface,u),roll:bank,fov,topDown:true};
  }

  function nearArrival(view,aspect,target) {
    // All four corners of the central 90% of the viewport see the white face.
    // This ties the reveal to coverage, including portrait screens, not a timer.
    const m=lookAt(view.eye,view.at,view.roll,true),x=[m[0],m[4],m[8]],y=[m[1],m[5],m[9]],z=[m[2],m[6],m[10]],f=Math.tan(view.fov/2);
    for(const sx of [-.9,.9])for(const sy of [-.9,.9]){
      const ray=z.map((v,i)=>-v+x[i]*sx*f*aspect+y[i]*sy*f);
      if(ray[1]>=0)return false;
      const length=(SIZE+.002-view.eye[1])/ray[1];
      if(Math.abs(view.eye[0]+ray[0]*length-target[0])>SIZE/2||Math.abs(view.eye[2]+ray[2]*length-target[2])>SIZE/2)return false;
    }
    return true;
  }

  // Project the live DOM menu onto the same world plane as the cube's top face.
  // CSS and WebGL share this homogeneous transform; at t=1 it is the identity.
  function menuSurface(view,aspect,width,height,target) {
    const vp=multiply(perspective(view.fov,aspect),lookAt(view.eye,view.at,view.roll,true));
    const [pw,ph]=menuSize(aspect);
    const world=new Float32Array([pw/width,0,0,0, 0,0,ph/height,0, 0,1,0,0, target[0]-pw/2,SIZE+.002,target[2]-ph/2,1]);
    const clip=multiply(vp,world),out=Array(16).fill(0),normal=clip[15];
    for(const c of [0,1,3]){const i=c*4;out[i]=(clip[i]+clip[i+3])*width/2/normal;out[i+1]=(clip[i+3]-clip[i+1])*height/2/normal;out[i+3]=clip[i+3]/normal;}
    out[10]=1;return out;
  }

  function create(canvas) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('No se pudo iniciar WebGL para la presentación.');
    const win = canvas.ownerDocument.defaultView, doc = canvas.ownerDocument;
    const reduced = !!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const shaders = [], programs = [], buffers = [];
    function program(vertex, fragment) {
      const p = gl.createProgram(); programs.push(p);
      for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
        const s = gl.createShader(type); shaders.push(s); gl.shaderSource(s, source); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Opening shader: ' + gl.getShaderInfoLog(s)); gl.attachShader(p, s);
      }
      gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Opening link: ' + gl.getProgramInfoLog(p));
      return p;
    }
    const solid = program(`attribute vec3 aPosition,aNormal; uniform mat4 uVP,uModel; varying vec3 vNormal,vWorld; void main(){vec4 p=uModel*vec4(aPosition,1.);vWorld=p.xyz;vNormal=normalize(mat3(uModel)*aNormal);gl_Position=uVP*p;}`, `precision mediump float; varying vec3 vNormal,vWorld; uniform vec3 uEye; uniform vec4 uColor; uniform float uGlass,uGlow; void main(){vec3 n=normalize(vNormal);vec3 v=normalize(uEye-vWorld);float light=.49+.42*max(0.,dot(n,normalize(vec3(-.7,1.,.8))));float spec=pow(max(0.,dot(reflect(-normalize(vec3(-.8,1.,1.)),n),v)),30.);float fres=pow(1.-abs(dot(n,v)),2.);vec3 c=uColor.rgb*(light+uGlow)+vec3(spec*.25);float a=uColor.a;if(uGlass>.5){c=vec3(.49,.62,.68)+vec3(fres*.4+spec*.65);a*=.2+fres*.8+spec*.5;}gl_FragColor=vec4(c,a);}`);
    const lines = program(`attribute vec3 aPosition;uniform mat4 uVP,uModel;void main(){gl_Position=uVP*uModel*vec4(aPosition,1.);}`, `precision mediump float;uniform vec4 uColor;void main(){gl_FragColor=uColor;}`);
    const glow = program(`attribute vec2 aPosition;uniform vec2 uCenter,uScale;varying vec2 vUV;void main(){vUV=aPosition;gl_Position=vec4(uCenter+aPosition*uScale,0.,1.);}`, `precision mediump float;varying vec2 vUV;uniform vec4 uColor;void main(){float r=dot(vUV,vUV);float a=exp(-r*5.5)*(1.-smoothstep(.45,1.,r));gl_FragColor=vec4(uColor.rgb,uColor.a*a);}`);
    function buffer(data) { const b = gl.createBuffer(); buffers.push(b); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); return b; }
    const vertices = [], face = (n, p) => { for (const i of [0, 1, 2, 0, 2, 3]) vertices.push(...p[i], ...n); };
    face([0,1,0],[[-.5,.5,-.5],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5]]);
    face([0,-1,0],[[-.5,-.5,.5],[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5]]);
    face([1,0,0],[[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[.5,-.5,.5]]);
    face([-1,0,0],[[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-.5,-.5,-.5]]);
    face([0,0,1],[[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]]);
    face([0,0,-1],[[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]]);
    const cube = buffer(vertices), quad = buffer([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]);
    const edgeData = [];
    for (let axis = 0; axis < 3; axis++) for (const a of [-.5,.5]) for (const b of [-.5,.5]) {
      const p = [a,b,0], q = [a,b,0]; p.splice(axis,0,-.5);q.splice(axis,0,.5);p.length=3;q.length=3;edgeData.push(...p,...q);
    }
    const edges = buffer(edgeData);
    const locations = new Map();
    function loc(p, name) { const key = programs.indexOf(p) + ':' + name; if (!locations.has(key)) locations.set(key, name.startsWith('a') ? gl.getAttribLocation(p, name) : gl.getUniformLocation(p, name)); return locations.get(key); }
    let activeProgram=null;const enabledAttributes=new Set();
    function use(p){if(activeProgram!==p){for(const l of enabledAttributes)gl.disableVertexAttribArray(l);enabledAttributes.clear();gl.useProgram(p);activeProgram=p;}}
    function attr(p, name, count, stride, offset = 0) { const l = loc(p, name); gl.enableVertexAttribArray(l);enabledAttributes.add(l);gl.vertexAttribPointer(l, count, gl.FLOAT, false, stride, offset); }
    let currentVP, currentEye, aspect = 1, width = 1, height = 1;
    function camera(c) { currentEye = c.eye; currentVP = multiply(perspective(c.fov, aspect), lookAt(c.eye, c.at, c.roll,c.topDown)); }
    function drawCube(pos, size, color, angle = 0, glass = false, emission = 0, rollAxis = null, rollAngle = 0) {
      use(solid); gl.bindBuffer(gl.ARRAY_BUFFER, cube); attr(solid,'aPosition',3,24);attr(solid,'aNormal',3,24,12);
      gl.uniformMatrix4fv(loc(solid,'uVP'),false,currentVP);gl.uniformMatrix4fv(loc(solid,'uModel'),false,model(pos,size,angle,rollAxis,rollAngle));
      gl.uniform3fv(loc(solid,'uEye'),currentEye);gl.uniform4fv(loc(solid,'uColor'),color);gl.uniform1f(loc(solid,'uGlass'),glass?1:0);gl.uniform1f(loc(solid,'uGlow'),emission);gl.drawArrays(gl.TRIANGLES,0,36);
    }
    function drawLines(b, count, color, m) {
      use(lines);gl.bindBuffer(gl.ARRAY_BUFFER,b);attr(lines,'aPosition',3,12);
      gl.uniformMatrix4fv(loc(lines,'uVP'),false,currentVP);gl.uniformMatrix4fv(loc(lines,'uModel'),false,m || model([0,0,0],[1,1,1]));gl.uniform4fv(loc(lines,'uColor'),color);gl.drawArrays(gl.LINES,0,count);
    }
    function glowAt(pos, radius, alpha, tint = [1,1,1]) {
      const v = [...pos,1], p = [0,0,0,0]; for(let r=0;r<4;r++)for(let c=0;c<4;c++)p[r]+=currentVP[c*4+r]*v[c];if(p[3]<=0)return;
      use(glow);gl.bindBuffer(gl.ARRAY_BUFFER,quad);attr(glow,'aPosition',2,8);
      gl.uniform2f(loc(glow,'uCenter'),p[0]/p[3],p[1]/p[3]);gl.uniform2f(loc(glow,'uScale'),radius/p[3]/aspect,radius/p[3]);gl.uniform4fv(loc(glow,'uColor'),[...tint,alpha]);gl.drawArrays(gl.TRIANGLES,0,6);
    }
    function resize() {
      const bounds=canvas.getBoundingClientRect(),dpr=Math.min(win.devicePixelRatio||1,1.6),limit=Math.min(1,2048/Math.max(bounds.width*dpr,bounds.height*dpr));
      const w=Math.max(1,Math.round(bounds.width*dpr*limit)),h=Math.max(1,Math.round(bounds.height*dpr*limit));
      if(width!==w||height!==h){width=canvas.width=w;height=canvas.height=h;aspect=w/h;gl.viewport(0,0,w,h);}
    }
    let state='loading',progress=0,ready=false,clock=0,last=0,raf=0,disposed=false,pieces=[],pathBuffer=null,pathCount=0,resolvePlay,rejectPlay,promise,onMenuFrame=null,flightProgress=0,menuOpacity=0,menuRevealAt=null;
    let formationStart=TIMING.black,settledAt=null,diveTarget=[0,SIZE/2,0];
    const diveDuration=reduced?TIMING.reducedFlight:TIMING.flight;
    function finish(){if(state==='complete')return;state='complete';resolvePlay?.();}
    function paths(){const data=[];for(const p of pieces){let prev=p.p;for(const next of p.path){data.push(prev[0],.012,prev[2],next[0],.012,next[2]);prev=next;}}
      if(!pathBuffer)pathBuffer=buffer(data);else {gl.bindBuffer(gl.ARRAY_BUFFER,pathBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);}pathCount=data.length/3;}
    function render(dt){
      resize();gl.depthMask(true);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.CULL_FACE);
      if(state==='loading'||state==='fade'){
        const fade=state==='fade'?1-smooth(clock/TIMING.black):1;
        const fit=Math.max(1,.78/aspect);
        camera({eye:[4.8*fit,3.1*fit,7.5*fit],at:[0,-.35,0],roll:0,fov:.68});
        gl.disable(gl.DEPTH_TEST);gl.depthMask(false);glowAt([0,.25,-.6],4.5,(ready?.62:.075)*fade,[.82,.9,1]);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);
        if(progress>0){const h=Math.max(.005,progress*2.08);drawCube([0,-1.04+h/2,0],[2.08,h,2.08],[.97,.985,1,fade],0,false,ready?.22:0);}
        gl.depthMask(false);drawCube([0,0,0],[2.3,2.3,2.3],[.75,.87,.95,.28*fade],0,true);drawLines(edges,24,[.72,.84,.91,.44*fade],model([0,0,0],[2.3,2.3,2.3]));
        if(ready){gl.disable(gl.DEPTH_TEST);glowAt([0,.1,0],2.3,.09*fade);}
        if(state==='fade'&&clock>=TIMING.black)state='assembling';
        return;
      }
      if(state==='complete'){gl.clearColor(1,1,1,1);gl.clear(gl.COLOR_BUFFER_BIT);return;}
      const assemblyTime=clock-formationStart;
      if(settledAt===null){updatePieces(pieces,assemblyTime,dt);paths();if(assemblyTime>=TIMING.assemble&&pieces.every(p=>p.settled&&!p.home)){settledAt=clock;state='hold';}}
      const since=settledAt===null?-1:clock-settledAt;
      let emission=0;
      const top={eye:[0,fitHeight(aspect),0],at:[0,0,0],roll:0,fov:1.22,topDown:true};
      let view=top;
      if(since>=TIMING.hold){
        const glowTime=since-TIMING.hold;emission=Math.sin(clamp(glowTime/TIMING.glow)*Math.PI)*1.8;state='glow';
        if(glowTime>=TIMING.glow){
          const flightTime=glowTime-TIMING.glow;
          state='dive';flightProgress=clamp(flightTime/diveDuration);
          view=flightCamera(flightProgress,aspect,diveTarget,reduced);
          if(menuRevealAt===null&&nearArrival(view,aspect,diveTarget))menuRevealAt=clock;
          menuOpacity=menuRevealAt===null?0:smoother((clock-menuRevealAt)/TIMING.menuReveal);
          if(flightProgress===1)state='reveal';
          if(menuOpacity===1&&flightProgress===1)finish();
        }
      }
      camera(view);
      const enter=smooth(assemblyTime/.8),pathOpacity=settledAt===null?.19: .19*(1-smooth(since/.5));
      if(pathOpacity>0){gl.depthMask(false);drawLines(pathBuffer,pathCount,[.56,.67,.72,pathOpacity*enter]);gl.depthMask(true);}
      for(const p of pieces){if(assemblyTime<p.delay)continue;drawCube(p.p,[SIZE,SIZE,SIZE],[.97,.985,1,enter],p.angle,false,emission+smoother((flightProgress-.65)/.3),p.rollAxis,p.rollAngle);}
      // Soft bloom only during the synchronized pulse, with no halos on paths.
      if(emission>.015){gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);for(const p of pieces)glowAt(p.p,1.5,Math.min(.38,emission*.24));gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);}
      if(onMenuFrame&&since>=TIMING.hold+TIMING.glow){
        const bounds=canvas.getBoundingClientRect();
        onMenuFrame({matrix:menuSurface(view,aspect,bounds.width,bounds.height,diveTarget),blur:6*(1-menuOpacity),opacity:menuOpacity,progress:flightProgress,nearArrival:nearArrival(view,aspect,diveTarget)});
      }
    }
    function frame(now){if(disposed)return;const dt=last?Math.min(.04,(now-last)/1000):0;last=now;if(!doc.hidden){if(state!=='loading'&&state!=='complete')clock+=dt;render(dt);}raf=win.requestAnimationFrame(frame);}
    function contextLost(event){event.preventDefault();const error=new Error('Se perdió el contexto WebGL de la presentación. Reintenta la carga.');if(rejectPlay)rejectPlay(error);else win.dispatchEvent(new win.ErrorEvent('error',{error,message:error.message}));dispose();}
    function dispose(){if(disposed)return;disposed=true;win.cancelAnimationFrame(raf);canvas.removeEventListener('webglcontextlost',contextLost);for(const b of buffers)gl.deleteBuffer(b);for(const p of programs)gl.deleteProgram(p);for(const s of shaders)gl.deleteShader(s);}
    canvas.addEventListener('webglcontextlost',contextLost);raf=win.requestAnimationFrame(frame);
    return {
      setProgress(value){progress=clamp(Number(value)||0);},
      setReady(value){ready=!!value;},
      play({onFrame}={}){
        if(promise)return promise;
        if(disposed)return Promise.reject(new Error('La presentación ya se cerró.'));
        pieces=makePieces(fontDots(doc));paths();diveTarget=[...pieces.reduce((a,b)=>Math.hypot(a.target[0],a.target[2])<Math.hypot(b.target[0],b.target[2])?a:b).target];
        onMenuFrame=onFrame;state='fade';clock=0;promise=new Promise((resolve,reject)=>{resolvePlay=resolve;rejectPlay=reject;});return promise;
      },
      getState(){return {phase:state,elapsed:clock,cubes:pieces.length,settled:pieces.filter(p=>p.settled).length,reducedMotion:reduced,flightProgress,menuOpacity};},
      dispose
    };
  }
  const api = {plan,stepClear,obstacleBoxes,create,fontDots,makePieces,updatePieces,flightCamera,menuSurface,nearArrival,FONT_DOTS,TIMING};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')window.QBitsOpening=api;
})();
