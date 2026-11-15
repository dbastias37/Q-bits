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
  const TIMING = Object.freeze({ black: .8, assemble: 11.5, hold: .5, glow: 1.2, orbit: 12, dive: 3.5, white: .85 });

  function fontDots(doc) {
    if (!doc?.createElement || !doc.fonts?.check('180px "LED Calculator"', 'Q-bits')) return FONT_DOTS.map(p => [...p]);
    const c = doc.createElement('canvas'); c.width = 1000; c.height = 250;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return FONT_DOTS.map(p => [...p]);
    ctx.font = '180px "LED Calculator"'; ctx.fillStyle = '#fff'; ctx.fillText('Q-bits', 20, 205);
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    const visited = new Uint8Array(width * height), found = [];
    for (let seed = 0; seed < visited.length; seed++) {
      if (visited[seed] || data[seed * 4 + 3] < 120) continue;
      const queue = [seed]; visited[seed] = 1;
      let x0 = width, x1 = 0, y0 = height, y1 = 0;
      for (let k = 0; k < queue.length; k++) {
        const n = queue[k], x = n % width, y = Math.floor(n / width);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        for (const next of [x > 0 ? n - 1 : -1, x < width - 1 ? n + 1 : -1, y > 0 ? n - width : -1, y < height - 1 ? n + width : -1]) {
          if (next < 0 || visited[next] || data[next * 4 + 3] < 120) continue;
          visited[next] = 1; queue.push(next);
        }
      }
      if (queue.length > 8) found.push([(x0 + x1) / 2, (y0 + y1) / 2]);
    }
    if (found.length !== FONT_DOTS.length) return FONT_DOTS.map(p => [...p]);
    const xs = found.map(p => p[0]), ys = found.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return found.map(p => [(p[0] - (x0 + x1) / 2) * 15 / (x1 - x0), (p[1] - (y0 + y1) / 2) * 15 / (x1 - x0)]);
  }

  function random(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  function makePieces(dots = FONT_DOTS) {
    const rand = random(17062026);
    return dots.map((p, i) => {
      const a = rand() * Math.PI * 2, radius = 15 + rand() * 7;
      const start = [Math.cos(a) * radius, SIZE / 2, Math.sin(a) * radius];
      const target = [p[0], SIZE / 2, p[1]];
      const bend = [mix(start[0], target[0], .55) + (rand() - .5) * 7, SIZE / 2, mix(start[2], target[2], .55) + (rand() - .5) * 5];
      return { target, start, bend, p: [...start], v: [0, 0, 0], angle: (rand() - .5) * 2, spin: (rand() - .5) * 4, delay: rand() * 1.8, duration: 5 + rand() * 2.4, settled: false, id: i };
    });
  }
  function bezier(a, b, c, t) { const u = 1 - t; return a.map((v, i) => u * u * v + 2 * u * t * b[i] + t * t * c[i]); }
  function updatePieces(pieces, time, dt) {
    const finish = smooth((time - 9) / 2.5);
    for (const p of pieces) {
      if (time < p.delay) continue;
      const u = clamp((time - p.delay) / p.duration);
      const desired = bezier(p.start, p.bend, p.target, smooth(u));
      const gain = 13 + finish * 30;
      for (const k of [0, 2]) {
        p.v[k] += (desired[k] - p.p[k]) * gain * dt;
        p.v[k] *= Math.exp(-5.5 * dt); p.p[k] += p.v[k] * dt;
      }
      p.angle += p.spin * dt * (1 - smooth(u)); p.angle *= Math.exp(-dt * (2 + finish * 10));
      p.p[1] = SIZE / 2 + Math.abs(Math.sin(time * 6 + p.id)) * .035 * (1 - smooth(u));
      if (finish > 0) { const f = 1 - Math.exp(-dt * finish * 35); p.p = lerp(p.p, p.target, f); }
      p.settled = Math.hypot(...sub(p.p, p.target)) < .012 && u === 1;
    }
    // Equal-mass contact impulses while the pieces are entering; no particles are
    // teleported through each other. Final spacing already exceeds the cube size.
    if (finish < .95) for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i], b = pieces[j]; if (time < a.delay || time < b.delay) continue;
      const dx = b.p[0] - a.p[0], dz = b.p[2] - a.p[2], d = Math.hypot(dx, dz), min = SIZE * 1.04;
      if (d >= min) continue;
      const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0, push = (min - d) * .5;
      a.p[0] -= nx * push; a.p[2] -= nz * push; b.p[0] += nx * push; b.p[2] += nz * push;
      const approach = (b.v[0] - a.v[0]) * nx + (b.v[2] - a.v[2]) * nz;
      if (approach < 0) {
        const impulse = approach * .65;
        a.v[0] += nx * impulse; a.v[2] += nz * impulse; b.v[0] -= nx * impulse; b.v[2] -= nz * impulse;
        a.spin += .15; b.spin -= .15;
      }
    }
  }

  function multiply(a, b) { const out = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return out; }
  function perspective(fov, aspect, near = .015, far = 150) {
    const f = 1 / Math.tan(fov / 2), m = new Float32Array(16);
    m[0] = f / aspect; m[5] = f; m[10] = (far + near) / (near - far); m[11] = -1; m[14] = 2 * far * near / (near - far); return m;
  }
  function lookAt(eye, at, roll = 0) {
    const z = norm(sub(eye, at));
    const up = Math.abs(z[1]) > .999 ? [Math.sin(roll), 0, -Math.cos(roll)] : [Math.sin(roll), Math.cos(roll), 0];
    const x = norm(cross(up, z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
  }
  function model(pos, size, angle = 0) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return new Float32Array([c * size[0], 0, -s * size[0], 0, 0, size[1], 0, 0, s * size[2], 0, c * size[2], 0, ...pos, 1]);
  }
  function fitHeight(aspect) { return Math.max(10.2, 8.8 / (Math.tan(.61) * aspect)); }
  function orbitCamera(t, aspect, target = [0, 0, 0], reduced = false) {
    const u = clamp(t), height = fitHeight(aspect), ease = smooth(u), a = ease * Math.PI * 2;
    if (reduced) return { eye: [0, height, .001], at: target, roll: 0, fov: 1.22 };
    // Radius opens smoothly out of the top-down view, then makes one full orbit.
    const r = 8.8 * smooth(u / .18), y = Math.max(height * .82, 8.4) + Math.sin(a * 1.5) * .55;
    return { eye: [Math.sin(a) * r, mix(height, y, smooth(u / .18)), Math.cos(a) * r], at: target, roll: Math.sin(a) * .045, fov: 1.22 };
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
    function camera(c) { currentEye = c.eye; currentVP = multiply(perspective(c.fov, aspect), lookAt(c.eye, c.at, c.roll)); }
    function drawCube(pos, size, color, angle = 0, glass = false, emission = 0) {
      use(solid); gl.bindBuffer(gl.ARRAY_BUFFER, cube); attr(solid,'aPosition',3,24);attr(solid,'aNormal',3,24,12);
      gl.uniformMatrix4fv(loc(solid,'uVP'),false,currentVP);gl.uniformMatrix4fv(loc(solid,'uModel'),false,model(pos,size,angle));
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
    let state='loading',progress=0,ready=false,clock=0,last=0,raf=0,disposed=false,pieces=[],pathBuffer=null,pathCount=0,resolvePlay,rejectPlay,promise;
    let formationStart=TIMING.black,settledAt=null,diveTarget=[0,SIZE/2,0];
    const orbitDuration=reduced?2:TIMING.orbit,diveDuration=reduced?1.4:TIMING.dive;
    function finish(){if(state==='complete')return;state='complete';resolvePlay?.();}
    function paths(){const data=[];for(const p of pieces)for(let i=0;i<24;i++){const a=bezier(p.start,p.bend,p.target,i/24),b=bezier(p.start,p.bend,p.target,(i+1)/24);a[1]=b[1]=.012;data.push(...a,...b);}pathBuffer=buffer(data);pathCount=data.length/3;}
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
      if(settledAt===null){updatePieces(pieces,assemblyTime,dt);if(assemblyTime>=TIMING.assemble&&pieces.every(p=>p.settled)){settledAt=clock;state='hold';}}
      const since=settledAt===null?-1:clock-settledAt;
      let emission=0,white=0;
      const top={eye:[0,fitHeight(aspect),.001],at:[0,0,0],roll:0,fov:1.22};
      let view=top;
      if(since>=TIMING.hold){
        const glowTime=since-TIMING.hold;emission=Math.sin(clamp(glowTime/TIMING.glow)*Math.PI)*1.8;state='glow';
        if(glowTime>=TIMING.glow){
          const orbitTime=glowTime-TIMING.glow;state='orbit';view=orbitCamera(orbitTime/orbitDuration,aspect,[0,0,0],reduced);
          if(orbitTime>=orbitDuration){
            state='dive';const t=clamp((orbitTime-orbitDuration)/diveDuration),start=orbitCamera(1,aspect,[0,0,0],reduced);
            const travel=t*t*t,at=lerp([0,0,0],diveTarget,smooth(t*1.8));
            const end=[diveTarget[0],SIZE+.05,diveTarget[2]+.012];
            view={eye:lerp(start.eye,end,travel),at,roll:reduced?0:Math.sin(t*Math.PI)*-.075,fov:mix(1.22,1.32,smooth(t))};
            // The lens reaches the cube first. Only then does its white face bloom
            // across the frame; no distant fade is substituted for the dive.
            white=smooth((orbitTime-orbitDuration-diveDuration-.12)/.55);emission=white*.8;
            if(orbitTime>=orbitDuration+diveDuration+TIMING.white){finish();white=1;}
          }
        }
      }
      camera(view);
      const enter=smooth(assemblyTime/.8),pathOpacity=settledAt===null?.19: .19*(1-smooth(since/.5));
      if(pathOpacity>0){gl.depthMask(false);drawLines(pathBuffer,pathCount,[.56,.67,.72,pathOpacity*enter]);gl.depthMask(true);}
      for(const p of pieces){if(assemblyTime<p.delay)continue;drawCube(p.p,[SIZE,SIZE,SIZE],[.97,.985,1,enter],p.angle,false,emission);}
      // Soft bloom only during the synchronized pulse, with no halos on paths.
      if(emission>.015){gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);for(const p of pieces)glowAt(p.p,1.5,Math.min(.38,emission*.24));gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);}
      if(white>0){gl.disable(gl.DEPTH_TEST);gl.depthMask(false);use(glow);gl.bindBuffer(gl.ARRAY_BUFFER,quad);attr(glow,'aPosition',2,8);gl.uniform2f(loc(glow,'uCenter'),0,0);gl.uniform2f(loc(glow,'uScale'),20,20);gl.uniform4fv(loc(glow,'uColor'),[1,1,1,white]);gl.drawArrays(gl.TRIANGLES,0,6);}
    }
    function frame(now){if(disposed)return;const dt=last?Math.min(.04,(now-last)/1000):0;last=now;if(!doc.hidden){if(state!=='loading'&&state!=='complete')clock+=dt;render(dt);}raf=win.requestAnimationFrame(frame);}
    function contextLost(event){event.preventDefault();const error=new Error('Se perdió el contexto WebGL de la presentación. Reintenta la carga.');if(rejectPlay)rejectPlay(error);else win.dispatchEvent(new win.ErrorEvent('error',{error,message:error.message}));dispose();}
    function dispose(){if(disposed)return;disposed=true;win.cancelAnimationFrame(raf);canvas.removeEventListener('webglcontextlost',contextLost);for(const b of buffers)gl.deleteBuffer(b);for(const p of programs)gl.deleteProgram(p);for(const s of shaders)gl.deleteShader(s);}
    canvas.addEventListener('webglcontextlost',contextLost);raf=win.requestAnimationFrame(frame);
    return {
      setProgress(value){progress=clamp(Number(value)||0);},
      setReady(value){ready=!!value;},
      play(){
        if(promise)return promise;
        if(disposed)return Promise.reject(new Error('La presentación ya se cerró.'));
        pieces=makePieces(fontDots(doc));paths();diveTarget=[...pieces.reduce((a,b)=>Math.hypot(a.target[0],a.target[2])<Math.hypot(b.target[0],b.target[2])?a:b).target];
        state='fade';clock=0;promise=new Promise((resolve,reject)=>{resolvePlay=resolve;rejectPlay=reject;});return promise;
      },
      getState(){return {phase:state,elapsed:clock,cubes:pieces.length,settled:pieces.filter(p=>p.settled).length,reducedMotion:reduced};},
      dispose
    };
  }
  const api = {create,fontDots,makePieces,updatePieces,orbitCamera,FONT_DOTS,TIMING};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')window.QBitsOpening=api;
})();
