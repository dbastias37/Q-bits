(() => {
// Read earlier saves once and preserve them under the current identity.
function readQbitsStorage(key){
 const current=window.localStorage.getItem(key);if(current!==null)return current;
 const legacy={'qbits.shapes.v1':'qubits.shapes.v1','qbits.dialogue.enabled.v1':'kiubits.dialogue.enabled.v1','qbits.campaign.v1':'kiubits.campaign.v1'}[key];
 if(!legacy)return null;const previous=window.localStorage.getItem(legacy);
 if(previous!==null){try{window.localStorage.setItem(key,previous);}catch{}}
 return previous;
}
const story={ready:false,mode:'menu',scene:'lab',phase:'idle',started:false,elapsed:0,phaseTime:0,dialogue:null,transition:null,intentionalUnlock:false,preserveGrip:false,progress:{},lab:null,guideId:null,dropAligned:false};
let unitRadial=null;
function radialOpen(){return !!unitRadial?.isOpen;}
const storyWorld={walls:[],details:[],door:null,target:null,doorProgress:0};
const ROOM_SIZE = 28; // Ancho y largo; las cuatro paredes se alejan del centro.
const ROOM_HEIGHT = 14;
const EYE_HEIGHT = 1.68;
const PLAYER_RADIUS = 0.28;
const WALK_SPEED = 3.2;
const posture = { height:EYE_HEIGHT, crouchHeight:.78 };

function updatePosture(dt, active, crouching) {
  // C controls posture independently of grabbing, rotating and joining pieces.
  // Never latch the current camera height when a cube is picked up.
  let target=active&&crouching?posture.crouchHeight:EYE_HEIGHT;
  // Keep the head below overhead geometry when trying to stand up.
  for(const wall of [...(puzzle.active?puzzle.walls:[]),...storyWorld.walls]) {
    if(wall.min.y>posture.height+.1 && Math.abs(position[0]-wall.p.x)<wall.half.x+PLAYER_RADIUS && Math.abs(position[2]-wall.p.z)<wall.half.z+PLAYER_RADIUS)
      target=Math.min(target,Math.max(.42,wall.min.y-.15));
  }
  const previous=posture.height;
  posture.height+=(target-posture.height)*(1-Math.exp(-11*dt));
  position[1]=posture.height;
  if(Math.abs(posture.height-previous)>.000001) redraw=true;
}

function movePlayer(position, yaw, forward, sideways, seconds, speedScale=1) {
  const length = Math.hypot(forward, sideways);
  if (!length) return;
  const step = WALK_SPEED * speedScale * Math.min(Math.max(seconds, 0), 0.05) / length;
  const limit = ROOM_SIZE / 2 - PLAYER_RADIUS;
  const dx = (-Math.sin(yaw) * forward + Math.cos(yaw) * sideways) * step;
  const dz = (-Math.cos(yaw) * forward - Math.sin(yaw) * sideways) * step;
  position[0] = Math.max(-limit, Math.min(limit, position[0] + dx));
  position[2] = Math.max(-limit, Math.min(limit, position[2] + dz));
}


const canvas = document.querySelector('#room');
const gl = canvas.getContext('webgl', { alpha: false, antialias: true, depth: true, powerPreference: 'high-performance' });

if (!gl) {
  document.querySelector('#boot-message').textContent='No se pudo iniciar WebGL. Abre este archivo directamente en Chrome, Edge o Firefox con aceleración gráfica disponible.';
  document.querySelector('#boot-screen .boot-track').hidden=true;
  canvas.replaceWith(Object.assign(document.createElement('p'), {
    textContent: 'Este navegador no pudo iniciar la vista 3D.',
  }));
  throw new Error('WebGL unavailable');
}

const vertexSource = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  uniform vec3 uCamera;
  uniform vec2 uLook;
  uniform float uAspect;
  uniform float uKind;
  uniform vec3 uCenter;
  uniform float uScale;
  uniform vec3 uDimensions;
  uniform vec4 uQuaternion;
  varying vec3 vLocal;
  varying vec3 vLocalNormal;
  varying vec3 vPosition;
  varying vec3 vNormal;
  vec3 rotate(vec3 v) { return v + 2.0 * cross(uQuaternion.xyz, cross(uQuaternion.xyz, v) + uQuaternion.w * v); }
  void main() {
    float sy = sin(uLook.x), cy = cos(uLook.x);
    float sp = sin(uLook.y), cp = cos(uLook.y);
    vec3 right = vec3(cy, 0.0, -sy);
    vec3 up = vec3(sy * sp, cp, cy * sp);
    vec3 forward = vec3(-sy * cp, sp, -cy * cp);
    vec3 world = uKind > 0.5 ? rotate(aPosition * uDimensions) + uCenter : aPosition;
    vec3 relative = world - uCamera;
    float depth = dot(relative, forward);
    float focal = 1.48256097;
    float nearClip = 0.04, farClip = 60.0;
    gl_Position = vec4(
      dot(relative, right) * focal / uAspect,
      dot(relative, up) * focal,
      (farClip + nearClip) / (farClip - nearClip) * depth
        - 2.0 * farClip * nearClip / (farClip - nearClip),
      depth
    );
    vPosition = world;
    vNormal = uKind > 0.5 ? rotate(aNormal) : aNormal;
    vLocal = aPosition;
    vLocalNormal = aNormal;
  }
`;

const fragmentSource = `
  precision highp float;
  uniform vec3 uCamera;
  uniform float uTime;
  uniform vec3 uLightPos[4];
  uniform vec3 uLightColor[4];
  uniform float uGlow;
  varying vec3 vPosition;
  varying vec3 vNormal;
  uniform float uSize;
  uniform float uHeight;
  uniform float uKind;
  uniform vec3 uCenter;
  uniform float uScale;
  uniform float uShadow;
  uniform vec4 uTint;
  varying vec3 vLocal;
  varying vec3 vLocalNormal;
  vec3 accentLight() {
    vec3 result = vec3(0.0);
    for(int i=0;i<4;i++) { vec3 delta=uLightPos[i]-vPosition; float d=length(delta); result+=uLightColor[i]*max(0.0,dot(vNormal,delta/max(d,0.001)))*0.045*uGlow/(1.0+d*d*2.0); }
    return result;
  }
  void main() {
    if (uKind > 13.5) {
      // Dense black feedstock, with a neutral moving meniscus and soft reflections.
      // Unlike the energy circuits, this liquid does not emit green light.
      if (vLocalNormal.x > uScale) discard;
      float tip=smoothstep(max(0.0,uScale-.018),uScale,vLocalNormal.x);
      float ripple=.5+.5*sin(vLocalNormal.x*48.0-uTime*2.1);
      float reflection=pow(.5+.5*sin(vPosition.y*18.0+vPosition.x*9.0-vPosition.z*11.0),12.0);
      vec3 ink=uTint.rgb*(.8+ripple*.2)+vec3(.045)*reflection+vec3(.08)*tip;
      gl_FragColor=vec4(ink,1.0);return;
    }
    if (uKind > 12.5) {
      vec2 uv=vLocal.xy*2.0;
      float r=length(uv),a=atan(uv.y,uv.x),t=uTime*.32;
      float warp=sin(a*3.0+r*7.0-t*2.0)*.12+sin(uv.y*12.0+t)*.07;
      float band=pow(.5+.5*sin((r+warp)*23.0-a*2.0-t*3.0),5.0);
      float cloud=.5+.5*sin(uv.x*7.0+sin(uv.y*6.0+t)*2.0-t);
      float edge=pow(max(abs(uv.x),abs(uv.y)),9.0);
      vec3 black=vec3(.002,.004,.006);
      gl_FragColor=vec4(black+uTint.rgb*(band*.19+cloud*.035+edge*.30),1.0);return;
    }
    if (uKind > 11.5) {
      if (vLocalNormal.x > uScale) discard;
      gl_FragColor=vec4(uTint.rgb,uTint.a*(0.65+0.35*sin(vLocalNormal.x*38.0-uTime*1.8))); return;
    }
    if (uKind > 10.5) {
      float rim=pow(1.0-abs(dot(normalize(vNormal),normalize(uCamera-vPosition))),2.0);
      gl_FragColor=vec4(mix(uTint.rgb,vec3(1.0),rim*.65),.035+rim*.34); return;
    }
    if (uKind > 9.5) {
      if (vLocalNormal.x > uScale) discard;
      float tip=smoothstep(max(0.0,uScale-.025),uScale,vLocalNormal.x);
      float ripple=.92+.06*sin(vLocalNormal.x*34.0-uTime*2.4);
      gl_FragColor=vec4(mix(uTint.rgb*ripple,vec3(.90,1.0,.96),tip*.6),1.0); return;
    }
    if (uKind > 8.5) {
      float angle = fract(atan(vLocal.x, -vLocal.z) / 6.28318530718 + 1.0);
      float amount = clamp(uScale, 0.0, 1.0);
      float lit = amount < 0.0001 ? 0.0 : amount > 0.9999 ? 1.0 : 1.0-smoothstep(amount-0.002,amount+0.002,angle);
      gl_FragColor = vec4(mix(vec3(0.53,0.60,0.61),uTint.rgb,lit),1.0);
      return;
    }
    if (uKind > 7.5) { gl_FragColor=vec4(uTint.rgb,uTint.a*exp(-abs(vLocal.x)*9.0)); return; }
    if (uKind > 6.5) {
      float light = exp(-dot(vLocal.xz, vLocal.xz) * 10.0);
      gl_FragColor = vec4(uTint.rgb, uTint.a * light); return;
    }
    if (uKind > 5.5) {
      vec2 uv = vLocal.xy;
      float wave = sin(uv.y * 18.0 + uTime * 0.7 + sin(uv.x * 12.0 - uTime * 0.35) * 0.35);
      float ripple = sin(length(uv * vec2(1.0, 1.4)) * 25.0 - uTime * 0.6);
      float edge = smoothstep(0.0, 0.06, min(0.5 - abs(uv.x), 0.5 - abs(uv.y)));
      gl_FragColor = vec4(mix(uTint.rgb, vec3(1.0), 0.22 + wave * 0.035), uTint.a * edge * (0.54 + wave * 0.04 + ripple * 0.025)); return;
    }
    if (uKind > 4.5) {
      vec3 lightDir = normalize(vec3(-0.6, 1.0, 0.35));
      float light = 0.77 + 0.22 * max(0.0, dot(vNormal, lightDir)) + 0.06 * max(0.0, dot(vNormal, normalize(vec3(0.7,0.2,-0.6))));
      gl_FragColor = vec4(clamp(uTint.rgb * light + accentLight(), 0.0, 1.0), uTint.a);
      return;
    }
    if (uKind > 2.5) {
      float shade = uKind > 3.5 ? 0.65 + 0.35 * max(0.0, dot(vNormal, normalize(vec3(-0.5,1.0,0.7)))) : 1.0;
      gl_FragColor = vec4(uTint.rgb * shade, uTint.a);
      return;
    }
    if (uKind > 1.5) {
      vec2 uv = (vPosition.xz - uCenter.xz) / uScale;
      float alpha = exp(-dot(uv, uv) * 7.0) * uShadow;
      gl_FragColor = vec4(vec3(0.06), alpha);
      return;
    }
    if (uKind > 0.5) {
      vec3 local = abs(vLocal);
      vec3 edges = vec3(0.5) - local + abs(vLocalNormal);
      float edgeDistance = min(edges.x, min(edges.y, edges.z));
      float edgeLight = 0.035 * (1.0 - smoothstep(0.0, 0.018, edgeDistance));
      vec3 lightDir = normalize(vec3(-0.6, 1.0, 0.35));
      float light = max(0.0, dot(vNormal, lightDir));
      float fill = max(0.0, dot(vNormal, normalize(vec3(0.7,0.2,-0.6))));
      vec3 halfVector = normalize(lightDir + normalize(uCamera - vPosition));
      float sheen = 0.065 * pow(max(0.0, dot(vNormal, halfVector)), 24.0);
      float black = 0.035 + 0.13 * light + 0.045 * fill + sheen + edgeLight;
      gl_FragColor = vec4(vec3(black)+accentLight(), 1.0);
      return;
    }
    float halfSize = uSize * 0.5;
    vec3 boundary = vec3(
      halfSize - abs(vPosition.x),
      min(vPosition.y, uHeight - vPosition.y),
      halfSize - abs(vPosition.z)
    );
    // Soft contact shading at the edges makes the all-white volume legible.
    vec3 edgeDistances = boundary + abs(vNormal) * uSize;
    float edge = max(0.0, min(edgeDistances.x, min(edgeDistances.y, edgeDistances.z)));
    float contactShade = 0.065 * exp(-edge * 2.7);
    float heightLight = 0.024 * smoothstep(0.0, uHeight, vPosition.y);
    float softLight = 0.948 - 0.024 * vNormal.y
      + 0.012 * vNormal.x + 0.008 * vNormal.z + heightLight;
    float floorBounce = 0.009 * exp(-dot(vPosition.xz, vPosition.xz) / 55.0);
    float white = clamp(softLight + floorBounce - contactShade, 0.0, 1.0);
    gl_FragColor = vec4(clamp(vec3(white)+accentLight()*0.4,0.0,1.0), 1.0);
  }
`;

function shader(type, source) {
  const result = gl.createShader(type);
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(result));
  }
  return result;
}

const program = gl.createProgram();
gl.attachShader(program, shader(gl.VERTEX_SHADER, vertexSource));
gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragmentSource));
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
gl.useProgram(program);

const vertices = [];
function face(corners, normal) {
  for (const index of [0, 1, 2, 0, 2, 3]) vertices.push(...corners[index], ...normal);
}
const h = ROOM_SIZE / 2, top = ROOM_HEIGHT;
face([[-h,0,-h], [h,0,-h], [h,0,h], [-h,0,h]], [0,1,0]);
face([[-h,top,h], [h,top,h], [h,top,-h], [-h,top,-h]], [0,-1,0]);
face([[-h,0,-h], [-h,0,h], [-h,top,h], [-h,top,-h]], [1,0,0]);
face([[h,0,h], [h,0,-h], [h,top,-h], [h,top,h]], [-1,0,0]);
face([[h,0,-h], [-h,0,-h], [-h,top,-h], [h,top,-h]], [0,0,1]);
face([[-h,0,h], [h,0,h], [h,top,h], [-h,top,h]], [0,0,-1]);

const geometry = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, geometry);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
for (const [name, offset] of [['aPosition', 0], ['aNormal', 12]]) {
  const location = gl.getAttribLocation(program, name);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 24, offset);
}
const uniforms = Object.fromEntries(['uGlow','uLightPos[0]','uLightColor[0]','uTime','uCamera','uLook','uAspect','uSize','uHeight','uKind','uCenter','uScale','uShadow','uDimensions','uQuaternion','uTint'].map(name => [name, gl.getUniformLocation(program, name)]));
gl.uniform1f(uniforms.uSize, ROOM_SIZE);
gl.uniform1f(uniforms.uHeight, ROOM_HEIGHT);
gl.enable(gl.DEPTH_TEST);
gl.clearColor(1, 1, 1, 1);

const position = [1.4, EYE_HEIGHT, 3.6];
let yaw = 0.46;
let pitch = -Math.atan2(EYE_HEIGHT - 0.045, 1.25);
let locked = false;
let lockPending = false;
let redraw = true;
let running = true;
const keys = new Set();

const hint = document.querySelector('#hint');
const pausedHint = 'Clic para entrar · WASD para caminar · C para agacharte · Esc para liberar el mouse';
const blockedHint = 'No se pudo capturar el mouse. Haz clic para reintentar. Si estás en un visor, descarga este HTML y ábrelo directamente en Chrome, Edge o Firefox.';
let lockTimeout;
let pendingPickup=null;
let walkPhase = 0;
let bobHeight = 0;
let bobSide = 0;
const camera = [...position];

function showHint(message) {
  hint.textContent = message;
  hint.hidden = false;
}

function lockFailed() {
  closeUnitRadial(false);
  clearTimeout(lockTimeout);
  lockPending = false;
  if (document.pointerLockElement === canvas) return;
  locked = false;
  pendingPickup=null;
  keys.clear();
  showHint(blockedHint);
}

function pause(release=true) {
  closeUnitRadial(false);
  if(story.ready){story.preserveGrip=!release;if(document.pointerLockElement===canvas)story.intentionalUnlock=true;}
  pendingPickup=null;
  finishMarquee(true);
  if(release)releaseQubit();
  keys.clear();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

function resize() {
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(canvas.clientWidth * scale));
  const height = Math.max(1, Math.round(canvas.clientHeight * scale));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.uniform1f(uniforms.uAspect, width / height);
    redraw = true;
  }
}

async function captureMouse() {
  if(radialOpen())return;
  if(story.ready&&!story.allowTransitionCapture&&(story.mode!=='playing'||['asleep','invocation','choice','repeat'].includes(story.phase)))return;
  if (document.pointerLockElement === canvas || lockPending) return;
  panel.hidden = true;
  menu.hidden = true; detachChoice = null; closeCommandMenu(false);
  canvas.focus({ preventScroll: true });
  if (!canvas.requestPointerLock) {
    lockFailed();
    return;
  }
  lockPending = true;
  // Keep pending until the browser confirms capture, including legacy APIs
  // that return undefined instead of a Promise.
  lockTimeout = setTimeout(lockFailed, 2500);
  try {
    await canvas.requestPointerLock();
  } catch (error) {
    lockFailed();
  }
}

canvas.addEventListener('click', captureMouse);
function editableTarget(target){return !!target&&(['INPUT','TEXTAREA','SELECT'].includes(target.tagName)||target.isContentEditable);}
function blockNativeContext(event){if(!editableTarget(event.target)){event.preventDefault();event.stopPropagation();}}
document.addEventListener('contextmenu',blockNativeContext,true);
document.addEventListener('dragstart',blockNativeContext,true);
document.addEventListener('selectstart',blockNativeContext,true);
document.addEventListener('pointerlockchange', () => {
  clearTimeout(lockTimeout);
  lockPending = false;
  locked = document.pointerLockElement === canvas;
  if(!locked)closeUnitRadial(false);
  keys.clear();
  if (locked) { story.intentionalUnlock=false;story.preserveGrip=false;hint.hidden=true;completePendingPickup(); }
  else { const expected=story.intentionalUnlock;story.intentionalUnlock=false;
    if(story.ready&&!expected&&story.mode==='playing'&&panel.hidden&&commandMenu.hidden&&menu.hidden){openPauseMenu();}
    if(!story.preserveGrip)releaseQubit();
    if((!story.ready||story.mode==='playing')&&panel.hidden&&menu.hidden&&commandMenu.hidden&&!['asleep','invocation','choice','repeat'].includes(story.phase))showHint(pausedHint);else hint.hidden=true;
  }
});
document.addEventListener('pointerlockerror', lockFailed);
document.addEventListener('mousemove', event => {
  if(radialOpen()){
    if(document.pointerLockElement===canvas)unitRadial.moveBy(event.movementX,event.movementY);
    else unitRadial.moveTo(event.clientX,event.clientY);
    return;
  }
  // Never simulate capture by merely hiding the cursor.
  if (document.pointerLockElement !== canvas || !storyLookAllowed()) return;
  if (marquee) { updateMarquee(event); return; }
  noteSpeechLook(event.movementX,event.movementY);
  yaw -= event.movementX * 0.002;
  yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  pitch = Math.max(-Math.PI / 2 + 0.012, Math.min(Math.PI / 2 - 0.012, pitch - event.movementY * 0.002));
  redraw = true;
});
document.addEventListener('keydown', handleKey);
document.addEventListener('keyup', handleKeyUp);
window.addEventListener('blur',()=>{if(story.ready&&story.mode==='playing')openPauseMenu();else pause();});
document.addEventListener('visibilitychange', () => {
  if(document.hidden){if(story.ready&&story.mode==='playing')openPauseMenu();else pause();}
});
window.addEventListener('resize', resize);
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  closeUnitRadial(false);
  running = false;
  releaseQubit();
  keys.clear();
});
canvas.addEventListener('webglcontextrestored', () => window.location.reload());

// Q-bits lab · rigid bodies, compound structures, face rolling and drop guides.
const CUBE_SIZE=.09, HALF=.045, MAX_QUBITS=128, FIXED_STEP=1/240;
const V=(x=0,y=0,z=0)=>new CANNON.Vec3(x,y,z), Q=()=>new CANNON.Quaternion();
const add=(a,b)=>a.vadd(b), sub=(a,b)=>a.vsub(b), mul=(a,s)=>a.scale(s);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// Unit profiles share one scale with the Q-bit. Pyramid origins are their mass
// centroids, so their collision hulls and visible surfaces balance together.
function normalizeUnitShape(shape){return shape==='tetra'||shape==='pyramid'?shape:'cube';}
function unitShape(value){return normalizeUnitShape(typeof value==='string'?value:value?.part?.shape||value?.shape);}
function isTBit(value){return unitShape(value)!=='cube';}
function makeUnitProfile(points,faces){
 const vertices=points.map(p=>V(...p).scale(CUBE_SIZE)),faceNormals=[],faceCenters=[],edges=[],seen=new Set();
 faces=faces.map(indices=>{
  const face=[...indices],center=V();for(const i of face)center.vadd(mul(vertices[i],1/face.length),center);
  let normal=sub(vertices[face[1]],vertices[face[0]]).cross(sub(vertices[face[2]],vertices[face[0]]));normal.normalize();
  if(normal.dot(center)<0){face.reverse();normal=mul(normal,-1);}faceNormals.push(normal);faceCenters.push(center);
  for(let i=0;i<face.length;i++){const a=face[i],b=face[(i+1)%face.length],key=Math.min(a,b)+','+Math.max(a,b);if(!seen.has(key)){seen.add(key);edges.push([a,b]);}}
  return face;
 });
 return {vertices,faces,faceNormals,faceCenters,edges};
}
const tetraHeight=Math.sqrt(2/3),tetraRadius=Math.sqrt(3)/3;
const UNIT_PROFILES={
 cube:makeUnitProfile([[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5],[-.5,.5,-.5],[.5,.5,-.5],[.5,.5,.5],[-.5,.5,.5]],[[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]]),
 tetra:makeUnitProfile([[-.5,-tetraHeight/4,-tetraRadius/2],[.5,-tetraHeight/4,-tetraRadius/2],[0,-tetraHeight/4,tetraRadius],[0,tetraHeight*3/4,0]],[[0,1,2],[0,3,1],[1,3,2],[2,3,0]]),
 pyramid:makeUnitProfile([[-.5,-.25,-.4],[.5,-.25,-.4],[.5,-.25,.4],[-.5,-.25,.4],[0,.75,0]],[[0,1,2,3],[0,4,1],[1,4,2],[2,4,3],[3,4,0]])
};
function unitProfile(shape){return UNIT_PROFILES[unitShape(shape)];}
function unitGroundHeight(shape){return -Math.min(...unitProfile(shape).vertices.map(v=>v.y));}
function unitFaces(pose){const profile=unitProfile(pose);return profile.faces.map((face,index)=>({index,vertices:face.map(i=>add(pose.p,pose.q.vmult(profile.vertices[i]))),center:add(pose.p,pose.q.vmult(profile.faceCenters[index])),normal:pose.q.vmult(profile.faceNormals[index])}));}
const settings={mass:1,unitShape:'cube',gravity:9.8,bounce:.12,force:60,friction:.38,damping:.12,speed:.32,guide:'ghost',line:'dashed',maxCarry:16,maxSelect:32,rotationSpeed:2.8,grip:.95,cargoSide:4,cargoRequired:8,cargoColor:'#f4f4f1',haulSpeed:.2,haulForce:2};
const groups=[],cargos=[];
const alphaSettings={maxRest:180,coolSeconds:35,capacity:4,blueprintRange:1.5,exitEnergy:.5,glow:.6,coolingOn:true,allowPuzzleSpawn:false};
const coolers=[],blueprints=[],savedShapes=[],buttonBodies=[];let alphaSerial=0;
const moodSettings={drain:.035,recovery:.06,idleSeconds:90},moodLabels=[];

// Dialogue catalogue v10: 253 approved lines + 20 close-up + 20 shaking + 20 impact reactions.
const QBIT_LINES = {
 "neutral": [
  "¿Hay algo que hacer?",
  "Trato de ver la vida de forma no tan cuadrada.",
  "Qué bueno, un tiempo de descanso.",
  "¿Qué vamos a hacer ahora?",
  "...",
  "A veces es necesario tomarse el tiempo y reflexionar.",
  "¿Qué se sentirá tener piernas?",
  "Trataré de ser menos rígido para la próxima.",
  "A pesar de todo, sigo aquí, atento a lo que me pidas.",
  "A veces, quedarse quieto también ayuda.",
  "No todo tiene que encajar de inmediato.",
  "Aunque no me mires, sigo aquí."
 ],
 "attention": [
  "¿Hay alguien ahí?",
  "¿Estás ahí?",
  "Juraría haberte visto por acá.",
  "¿Hay alguien ahí? ¿Aló?",
  "Todo ha estado muy silencioso.",
  "Hola, ¿cómo estás?",
  "Hola, ¿estás ahí?",
  "Hola. Qué buen lugar.",
  "Qué tipo tan agradable.",
  "Ah, eras tú."
 ],
 "social": [
  "¿Qué está pasando? ¿Por qué nadie ha vuelto acá conmigo?",
  "Me siento solo.",
  "Aquí me siento seguro."
 ],
 "participate": [
  "¿Necesitas ayuda?",
  "Si hace falta otro, estoy acá.",
  "¿Te vendría bien un par de esquinas más?",
  "Llevo un rato mirando. Creo que ya entendí.",
  "Avísame antes de que parezca decoración.",
  "Escógeme a mí.",
  "Yo también quiero ser parte.",
  "Qué bueno es participar.",
  "Creo que ahí quepo.",
  "Espero estar en tus planos."
 ],
 "comment": [
  "Aquí vamos otra vez.",
  "Esta vez parecía definitivo.",
  "Me había acostumbrado a ese lugar.",
  "Bueno, probemos tu otra idea.",
  "Estoy empezando a reconocer este recorrido.",
  "Te vi dudar.",
  "Desde ahí debe verse distinto.",
  "¿Me estás eligiendo o solo mirando?",
  "Me pregunto qué ves tú.",
  "Si estás pensando, puedo esperar."
 ],
 "excited": [
  "¡Estoy preparado!",
  "¡Te estoy esperando!",
  "¡Vamos, vamos! ¿Estás ahí?",
  "¡Dime que hay algo que hacer!",
  "¡Ya he descansado lo suficiente!",
  "¡Mi energía se desborda!",
  "¡Por favor, utilízame!",
  "Quiero ser parte de tu nuevo proyecto.",
  "¡Busquemos nuevas formas de crear formas!",
  "No sé lo que estoy diciendo. Disculpa, estoy un poco entusiasmado.",
  "Con esta energía, puedo hacer el trabajo más rápido.",
  "⚡ ¡Carga completa!",
  "¿Vamos despacio? Me costará, pero te sigo.",
  "Tómate tu tiempo. Bueno… tampoco todo el del mundo.",
  "Recuerda que estamos aquí para ayudarte.",
  "¡YOLO! Espero estar usando bien esa palabra.",
  "¡Hoy hasta mis esquinas tienen energía!",
  "¡Ponme a prueba!",
  "¡Tengo una idea! Todavía no sé si funciona.",
  "¡Déjame intentarlo!",
  "¡Estoy a una orden de salir rodando!",
  "¡Entre todos podemos mover esto!",
  "¿Ese es el plan? ¡Ya me entusiasmé!",
  "Demasiada energía para tan pocas caras.",
  "¡Esto empieza a tomar forma!",
  "¡Cuenta conmigo para lo que viene!",
  "Creo que estoy hablando más rápido de lo que pienso.",
  "⚡ Estoy tranquilo. ¡Tranquilísimo!"
 ],
 "blocked": [
  "Aló, estoy tratando de hacer mi tarea.",
  "Aló, ¿hay alguien ahí?",
  "¿Por qué estás bloqueando mi camino?",
  "No puedo hacer lo que necesito.",
  "Me frustra no poder avanzar.",
  "Ayúdame.",
  "Necesito ayuda, estoy atrapado.",
  "Ayuda, ¿estás ahí?",
  "Por favor, ayuda...",
  "Estoy empezando a molestarme.",
  "No puedo completar mi tarea.",
  "No encuentro por dónde pasar.",
  "Necesito que despejes el camino.",
  "Algo me está impidiendo seguir.",
  "He intentado pasar y sigo atascado.",
  "No puedo alcanzar ese lugar.",
  "Necesito un poco más de espacio.",
  "Sigo aquí, esperando ayuda.",
  "Quiero continuar, pero no puedo.",
  "¿Puedes ayudarme a salir?"
 ],
 "calm": [
  "Ya, ok. Voy a tomarme las cosas con calma.",
  "Voy a detenerme un momento.",
  "Necesito una pausa.",
  "Voy a descansar antes de volver a intentarlo.",
  "Puedo esperar un poco.",
  "Primero voy a tranquilizarme.",
  "Ahora necesito quedarme quieto.",
  "Déjame recuperar un poco de energía.",
  "Voy a dejar de insistir por un momento.",
  "Todavía estoy molesto. Necesito tiempo.",
  "Descansaré y después lo intentaré.",
  "Vamos con calma, una cosa a la vez.",
  "No voy a resolverlo apurándome.",
  "Me tomaré esto con más paciencia.",
  "Voy a probar otra vez, con calma.",
  "Sigo sin poder pasar.",
  "Descansé, pero el camino sigue bloqueado.",
  "Lo intenté de nuevo. Sigo atrapado.",
  "Estoy empezando a frustrarme otra vez.",
  "Todavía necesito ayuda para continuar."
 ],
 "angry": [
  "¡Ya basta!",
  "Ya estoy agotado.",
  "No necesito más trabajo ahora.",
  "Ya no quiero más.",
  "Necesito enfriarme.",
  "Tengo la cabeza muy caliente.",
  "¡No puedo seguir así!",
  "Ya no tengo paciencia.",
  "¡Necesito parar!",
  "Estoy demasiado enojado para continuar.",
  "No quiero otra orden ahora.",
  "Déjame descansar, por favor.",
  "Esto ya me superó.",
  "Llevo demasiado tiempo atascado.",
  "Estoy haciendo lo que puedo.",
  "Ahora mismo necesito que me ayudes.",
  "No puedo con otra tarea.",
  "¡Estoy al límite!",
  "Necesito que me lleves a enfriar.",
  "Cuando me calme, podremos seguir."
 ],
 "cooling": [
  "Ah… esto es lo que necesitaba.",
  "Qué bien se siente bajar un poco las revoluciones.",
  "Por fin se me están ordenando las ideas.",
  "El bloqueo mental ya me tenía aburrido.",
  "Necesitaba una pausa, aunque me costara admitirlo.",
  "Ya no me molesta tanto tener esquinas.",
  "Un poco más aquí y vuelvo a ser yo.",
  "Esto debería venir incluido en todos los planos.",
  "No me muevas todavía. Estoy en mi momento.",
  "Estoy soltando tensión. Me sobraba por todas partes.",
  "Se me estaba calentando hasta la paciencia.",
  "¿Podemos guardar este lugar para después?",
  "Creo que mi mal humor también se está enfriando.",
  "Me hacía falta algo que no fuera otra orden.",
  "Estoy procesando la tranquilidad. Va bastante bien.",
  "Nunca había estado tan cómodo siendo un cubo.",
  "Por una vez, no tengo ninguna prisa.",
  "Cuando salga de aquí, lo intento otra vez.",
  "Podemos dejar el mundo sin resolver un ratito.",
  "Gracias por traerme aquí."
 ],
 "helped": [
  "Gracias, ya puedo pasar.",
  "Ahora sí tengo espacio.",
  "Ya no estoy atrapado.",
  "Gracias por despejar el camino.",
  "Puedo seguir con mi tarea.",
  "Retomo donde me quedé.",
  "Voy a intentarlo otra vez.",
  "Esta vez puedo avanzar.",
  "El camino está libre.",
  "Ya puedo llegar hasta ahí.",
  "Gracias por venir a ayudarme.",
  "Eso era lo que me faltaba.",
  "Con esta ayuda, ya puedo continuar.",
  "Bien, volvamos a lo que estábamos haciendo.",
  "Ya pasó. Sigamos.",
  "Qué alivio poder moverme.",
  "Ahora veo por dónde ir.",
  "Estoy listo para retomar.",
  "El problema está resuelto.",
  "Sigamos, esta parte quedó pendiente."
 ],
 "order": [
  "¿Todo ese camino?",
  "Entendido.",
  "Voy para allá.",
  "Enseguida.",
  "Me pongo en marcha.",
  "Voy a intentarlo.",
  "Déjamelo a mí.",
  "Ese es el destino. Vamos.",
  "Recibido, cambio de rumbo.",
  "Te sigo.",
  "Voy a ocupar mi lugar.",
  "Me acerco.",
  "Allá voy.",
  "Primero llego y después me encargo.",
  "Un momento. Ya voy.",
  "¿Por ahí? De acuerdo.",
  "Tomaré ese camino.",
  "Voy rodando.",
  "Lo tengo. Ahora voy.",
  "A tu orden."
 ],
 "working": [
  "Trabajo, trabajo.",
  "Ya estoy en ello.",
  "Una cosa a la vez.",
  "Me encargo de esta parte.",
  "Aquí hace falta un poco de precisión.",
  "Voy avanzando.",
  "Paso a paso.",
  "Estoy concentrado.",
  "Ahora ajusto esto.",
  "Esta pieza va aquí.",
  "Sigamos con la siguiente parte.",
  "Estoy manteniendo la posición.",
  "Sigo con la tarea.",
  "Todavía falta un poco.",
  "Ya va tomando forma.",
  "Dame un momento para terminar.",
  "Vamos a hacerlo bien.",
  "Aquí sigo, haciendo mi parte.",
  "Estoy atento al siguiente paso.",
  "No pierdo de vista el objetivo."
 ],
 "pushing": [
  "¡Empuja, empuja!",
  "A la cuenta de tres.",
  "Una, dos… ¡tres!",
  "¡Todos juntos!",
  "Un poco más de fuerza.",
  "Vamos, que se mueve.",
  "Mantengamos el ritmo.",
  "Despacio, pero sin parar.",
  "Yo empujo por este lado.",
  "¿Listos? ¡Ahora!",
  "Entre todos pesa menos.",
  "Un esfuerzo más.",
  "Sigan empujando.",
  "Cuidado, que gira.",
  "Hay que llevarlo un poco más allá.",
  "Vamos en la misma dirección.",
  "No aflojemos todavía.",
  "Necesito más compañeros para moverlo.",
  "Esperemos a que estén todos.",
  "Ahora sí, hagamos fuerza."
 ],
 "happy": [
  "¡Genial, lo logramos!",
  "¡Yay!",
  "¡Llegué!",
  "¡Ya estoy donde me pediste!",
  "¡Tarea completada!",
  "¡Lo conseguimos juntos!",
  "¡La forma está completa!",
  "¡Ahora sí encaja!",
  "¡Quedó como en el plano!",
  "¡Qué bueno ser parte de esto!",
  "¡Valió la pena intentarlo!",
  "¡Mira lo que construimos!",
  "¡Sabía que podíamos!",
  "¡Buen trabajo, equipo!",
  "¡Conseguimos moverlo!",
  "¡Esta parte ya está lista!",
  "¡Lo hicimos funcionar!",
  "¡Me alegra haber ayudado!",
  "¡Una cosa menos por resolver!",
  "¡Terminamos! ¿Viste?"
 ],
 "close": [
  "Hola, ¿qué haces ahí?",
  "Hola.",
  "Hola, ¿cómo estás?",
  "¿Quién eres tú?",
  "¿Por qué me tomaste?",
  "Ah, ahora sí te veo.",
  "¿Querías decirme algo?",
  "Me estás mirando muy de cerca.",
  "¿Tengo algo en la cara?",
  "Esta es mi mejor cara. Creo.",
  "¿Así nos vemos mejor?",
  "Hola, al otro lado.",
  "Bueno, ya tienes mi atención.",
  "¿Me escogiste por algo?",
  "¿Qué estás buscando?",
  "Desde aquí pareces distinto.",
  "Puedes mirar. Con cuidado.",
  "¿Y ahora qué hacemos tú y yo?",
  "¿Esto es una inspección?",
  "Aquí estoy. No hace falta acercarse más."
 ],
 "shake": [
  "Hey, ¿por qué me agitas?",
  "Hey, déjate.",
  "Hey, déjame.",
  "Me estás revolviendo.",
  "Me siento mareado.",
  "Un momento. Todo está dando vueltas.",
  "Por favor, deja de agitarme.",
  "¿Podemos quedarnos quietos?",
  "Se me están mezclando las ideas.",
  "¡Despacio!",
  "No sé dónde quedó el piso.",
  "Creo que ya entendí. Puedes parar.",
  "¡Mis esquinas necesitan una pausa!",
  "Eso fue demasiada vuelta.",
  "Me cuesta pensar así.",
  "¿Siempre saludas de esta manera?",
  "Necesito que me sostengas quieto.",
  "No soy una coctelera.",
  "Se me movió hasta el ánimo.",
  "Voy a necesitar un segundo."
 ],
 "bump": [
  "¡Ay! Cuidado.",
  "Hey, estaba aquí.",
  "¿Por qué me golpeaste?",
  "Un poco de espacio, por favor.",
  "Eso me tomó por sorpresa.",
  "¡Ojo con mis esquinas!",
  "No hacía falta empujarme así.",
  "¿Podemos pasar de a uno?",
  "Sentí ese golpe.",
  "Estoy en medio, ya veo.",
  "¡Despacio con ese compañero!",
  "Me acabas de mover sin avisar.",
  "¿Todo bien? Yo sigo entero.",
  "Eso fue un saludo bastante brusco.",
  "Creo que chocamos.",
  "Avísame antes de pasar por aquí.",
  "Tenía mis ideas ordenadas.",
  "Aquí también hay alguien.",
  "¿Podemos seguir con más cuidado?",
  "Un golpecito menos estaría bien."
 ]
};
const SPEECH_PRIORITY={neutral:10,attention:12,social:14,participate:23,comment:18,excited:35,blocked:68,calm:58,angry:78,cooling:70,helped:73,order:50,working:24,pushing:30,happy:74,close:62,shake:95,bump:89};
const SPEECH_FACES={neutral:['(・_・)','(￣ω￣)'],attention:['(・_・)'],social:['(◡‿◡)'],excited:['(≧▽≦)','(ﾉ◕ヮ◕)ﾉ'],blocked:['(¬_¬)','(＃￣ω￣)'],angry:['(＃￣ω￣)','(¬_¬)'],calm:['(－_－)'],cooling:['(˘ω˘)','(－‿－)','(◡‿◡)'],helped:['(◡‿◡)'],happy:['(≧▽≦)','(ﾉ◕ヮ◕)ﾉ'],close:['(・_・)','(￣ω￣)'],shake:['(@_@)','(>_<)'],bump:['(>_<)','(¬_¬)']};
const speech={enabled:true,ready:false,people:new Map(),queue:[],slots:[],recent:[],used:new Map(),impacts:new Map(),shake:null,ray:null,nextScan:0,nextLayout:0,nextStart:0,ambientAfter:24,lastEnd:-100,nextObstacles:0,nextHud:0,lastInput:0,obstacles:[]};

const puzzle={active:false,stage:0,complete:false,run:0,portals:[],buttons:[],walls:[],delivery:null,pendingRewards:0,earned:0,savedLab:null};
let cargoSerial=0,selectedCargo=null,pendingCargo=null,moveChoice=null,routeInspection=null,commandState=null,menuConnector=null;
const commandMenu=document.querySelector('#command-menu');
let multiSelection=[],marquee=null,hoverPointer=null,detachChoice=null;
const menu=document.querySelector('#detach-menu'),selectionRect=document.querySelector('#selection-rect');
let serial=0, held=null, selected=null, snap=null, accumulator=0, simTime=0, noticeTimer;
const panel=document.querySelector('#panel'),targetLabel=document.querySelector('#target'),crosshair=document.querySelector('#crosshair');
const world=new CANNON.World();world.gravity.set(0,-settings.gravity,0);world.allowSleep=true;
world.broadphase=new CANNON.SAPBroadphase(world);
world.solver.iterations=24;world.solver.tolerance=1e-8;
world.defaultContactMaterial.friction=settings.friction;world.defaultContactMaterial.restitution=settings.bounce;
world.defaultContactMaterial.contactEquationStiffness=1e8;world.defaultContactMaterial.contactEquationRelaxation=4;
const haulMaterial=new CANNON.Material('cooperative-ground');
world.addContactMaterial(new CANNON.ContactMaterial(haulMaterial,world.defaultMaterial,{friction:0,restitution:0}));
world.addContactMaterial(new CANNON.ContactMaterial(haulMaterial,haulMaterial,{friction:0,restitution:0}));
const floor=new CANNON.Body({mass:0,material:world.defaultMaterial});floor.addShape(new CANNON.Plane());floor.quaternion.setFromEuler(-Math.PI/2,0,0);world.addBody(floor);
for(const [p,h] of [[[0,ROOM_HEIGHT+.1,0],[14,.1,14]],[[14.1,7,0],[.1,7,14]],[[-14.1,7,0],[.1,7,14]],[[0,7,14.1],[14,7,.1]],[[0,7,-14.1],[14,7,.1]]]) {
 const wall=new CANNON.Body({mass:0});wall.addShape(new CANNON.Box(V(...h)));wall.position.set(...p);world.addBody(wall);
}
const cubeShape=()=>new CANNON.Box(V(HALF,HALF,HALF));
const axes=[V(1,0,0),V(0,1,0),V(0,0,1)];
function announce(text){document.querySelector('#notice').textContent=text;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>document.querySelector('#notice').textContent='',3200);}
function direction(){return V(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));}
function shiftDown(){return keys.has('ShiftLeft')||keys.has('ShiftRight');}
function ctrlDown(){return keys.has('ControlLeft')||keys.has('ControlRight');}
function altDown(){return keys.has('AltLeft')||keys.has('AltRight');}
function totalWeight(g){return g.parts.reduce((n,p)=>n+p.weight,0);}
function partPose(g,p,pos=g.body.position,quat=g.body.quaternion){return {p:add(pos,quat.vmult(p.offset)),q:quat.mult(p.q),part:p,g};}
function poses(g,pos,quat){return g.parts.map(p=>partPose(g,p,pos,quat));}
function worldParts(g){return poses(g).map(o=>({id:o.part.id,weight:o.part.weight,shape:unitShape(o),p:o.p,q:o.q,mood:copyMood(o.part.mood)}));}
function makeGroup(parts,reference=Q(),velocity=V(),spin=V()) {
 const weight=parts.reduce((n,p)=>n+p.weight,0),center=V();
 for(const p of parts)center.vadd(mul(p.p,p.weight/weight),center);
 const inv=reference.inverse(),body=new CANNON.Body({mass:weight*.25,allowSleep:true,sleepSpeedLimit:.025,sleepTimeLimit:.6});
 body.collisionFilterMask=-1;body.position.copy(center);body.quaternion.copy(reference);body.velocity.copy(velocity);body.angularVelocity.copy(spin);
 body.linearDamping=.03;body.angularDamping=settings.damping;
 const local=parts.map(p=>{const shape=unitShape(p),mood=newMood(p.id,p.mood);if(!p.mood&&shape!=='cube')mood.name='T-bit '+p.id;return {id:p.id,weight:p.weight,shape,offset:inv.vmult(sub(p.p,center)),q:inv.mult(p.q),mood};});
 for(const p of local){const profile=unitProfile(p),shape=isTBit(p)?new CANNON.ConvexPolyhedron(profile.vertices.map(v=>v.clone()),profile.faces.map(f=>f.slice())):cubeShape();body.addShape(shape,p.offset,p.q);}
 body.updateMassProperties();world.addBody(body);
 const g={body,parts:local,route:null,pin:null};body.qubitGroup=g;g.block=analyzeBlock(g);groups.push(g);registerSpeechGroup(g);return g;
}
function addQubit(p,weight=settings.mass,shape='cube'){return makeGroup([{id:++serial,weight,shape:normalizeUnitShape(shape),p:V(...p),q:Q()}]);}
function removeGroup(g){undockCampaignGroup(g);removeSpeechGroup(g);leaveHaul(g);stopRoute(g);world.removeBody(g.body);const i=groups.indexOf(g);if(i>=0)groups.splice(i,1);if(selected?.g===g)selected=null;multiSelection=multiSelection.filter(item=>item!==g);}
function corners(pose){if(isTBit(pose))return unitProfile(pose).vertices.map(v=>add(pose.p,pose.q.vmult(v)));const out=[],half=pose.half||V(HALF,HALF,HALF);for(const x of [-half.x,half.x])for(const y of [-half.y,half.y])for(const z of [-half.z,half.z])out.push(add(pose.p,pose.q.vmult(V(x,y,z))));return out;}
function bounds(g,pos=g.body.position,quat=g.body.quaternion){
 // The absolute rotation matrix gives the exact same AABB as eight corners.
 // Reuse an unchanged body's bounds, but return owned vectors: callers move them.
 const cached=g.boundsCache,live=pos===g.body.position&&quat===g.body.quaternion;
 if(live&&cached&&cached.x===pos.x&&cached.y===pos.y&&cached.z===pos.z&&cached.qx===quat.x&&cached.qy===quat.y&&cached.qz===quat.z&&cached.qw===quat.w)
  return {min:cached.min.clone(),max:cached.max.clone(),center:cached.center.clone(),size:cached.size.clone()};
 const min=V(Infinity,Infinity,Infinity),max=V(-Infinity,-Infinity,-Infinity);
 for(const part of g.parts){
  const center=add(pos,quat.vmult(part.offset)),q=quat.mult(part.q),x=q.x,y=q.y,z=q.z,w=q.w;
  if(isTBit(part)){for(const local of unitProfile(part).vertices){const v=add(center,q.vmult(local));min.x=Math.min(min.x,v.x);min.y=Math.min(min.y,v.y);min.z=Math.min(min.z,v.z);max.x=Math.max(max.x,v.x);max.y=Math.max(max.y,v.y);max.z=Math.max(max.z,v.z);}continue;}
  const ex=HALF*(Math.abs(w*w+x*x-y*y-z*z)+Math.abs(2*(x*y-w*z))+Math.abs(2*(x*z+w*y)));
  const ey=HALF*(Math.abs(2*(x*y+w*z))+Math.abs(w*w-x*x+y*y-z*z)+Math.abs(2*(y*z-w*x)));
  const ez=HALF*(Math.abs(2*(x*z-w*y))+Math.abs(2*(y*z+w*x))+Math.abs(w*w-x*x-y*y+z*z));
  min.x=Math.min(min.x,center.x-ex);min.y=Math.min(min.y,center.y-ey);min.z=Math.min(min.z,center.z-ez);
  max.x=Math.max(max.x,center.x+ex);max.y=Math.max(max.y,center.y+ey);max.z=Math.max(max.z,center.z+ez);
 }
 const result={min,max,center:mul(add(min,max),.5),size:sub(max,min)};
 if(live)g.boundsCache={x:pos.x,y:pos.y,z:pos.z,qx:quat.x,qy:quat.y,qz:quat.z,qw:quat.w,min:min.clone(),max:max.clone(),center:result.center.clone(),size:result.size.clone()};
 return result;
}
function boundsOverlap(a,b){return a.min.x<=b.max.x&&a.max.x>=b.min.x&&a.min.y<=b.max.y&&a.max.y>=b.min.y&&a.min.z<=b.max.z&&a.max.z>=b.min.z;}
function obbOverlap(a,b,epsilon=.0005){
 if(isTBit(a)||isTBit(b))return convexUnitOverlap(a,b,epsilon);
 const aa=axes.map(v=>a.q.vmult(v)),bb=axes.map(v=>b.q.vmult(v)),delta=sub(a.p,b.p);
 for(const axis of [...aa,...bb,...aa.flatMap(x=>bb.map(y=>x.cross(y)))]){
  if(axis.norm2()<1e-10)continue;axis.normalize();
  const ah=a.half||V(HALF,HALF,HALF),bh=b.half||V(HALF,HALF,HALF),ks=['x','y','z'];
  const extent=aa.reduce((s,x,i)=>s+ah[ks[i]]*Math.abs(x.dot(axis)),0)+bb.reduce((s,x,i)=>s+bh[ks[i]]*Math.abs(x.dot(axis)),0);
  if(Math.abs(delta.dot(axis))>=extent-epsilon)return false;
 }return true;
}
function convexPoseGeometry(pose){
 const profile=unitProfile(pose),vertices=corners(pose),normals=(isTBit(pose)?profile.faceNormals:axes).map(n=>pose.q.vmult(n));
 // Box corner ordering differs from profile indexing; its three axes suffice.
 const edges=isTBit(pose)?profile.edges.map(([a,b])=>sub(vertices[b],vertices[a])):axes.map(n=>pose.q.vmult(n));
 return {vertices,normals,edges};
}
function convexUnitOverlap(a,b,epsilon=.0005){
 const aa=convexPoseGeometry(a),bb=convexPoseGeometry(b);
 for(const axis of [...aa.normals,...bb.normals,...aa.edges.flatMap(x=>bb.edges.map(y=>x.cross(y)))]){
  if(axis.norm2()<1e-14)continue;axis.normalize();let amin=Infinity,amax=-Infinity,bmin=Infinity,bmax=-Infinity;
  for(const v of aa.vertices){const d=v.dot(axis);amin=Math.min(amin,d);amax=Math.max(amax,d);}for(const v of bb.vertices){const d=v.dot(axis);bmin=Math.min(bmin,d);bmax=Math.max(bmax,d);}
  if(amax<=bmin+epsilon||bmax<=amin+epsilon)return false;
 }return true;
}
function validPose(g,pos,quat,exclude=[]){
 const bb=bounds(g,pos,quat);if(bb.min.y<-.001||bb.max.y>ROOM_HEIGHT||Math.max(Math.abs(bb.min.x),Math.abs(bb.max.x),Math.abs(bb.min.z),Math.abs(bb.max.z))>ROOM_SIZE/2-.001)return false;
 const src=poses(g,pos,quat);
 if(!puzzlePoseClear(g,pos,quat,src,bb)||!alphaPoseClear(g,pos,quat)||!storyPoseClear(g,pos,quat,src,bb))return false;
 if(cargos.some(c=>boundsOverlap(bb,cargoBounds(c))&&src.some(a=>obbOverlap(a,cargoPose(c)))))return false;
 return !groups.some(other=>other!==g&&!exclude.includes(other)&&boundsOverlap(bb,bounds(other))&&poses(other).some(b=>src.some(a=>obbOverlap(a,b))));
}
function creationShape(){return story.scene==='lab'&&!puzzle.active?normalizeUnitShape(settings.unitShape):'cube';}
function unitLabel(part){return isTBit(part)?'T-bit':'Q-bit';}
function groupUnitLabel(g){const t=g.parts.filter(isTBit).length;return t===g.parts.length?'T-bit'+(t===1?'':'s'):t?'piezas':'Q-bit'+(g.parts.length===1?'':'s');}
function syncUnitControls(){const shape=creationShape();document.querySelector('#unit-shape').value=shape;document.querySelector('#unit-shape').disabled=story.scene!=='lab'||puzzle.active;document.querySelector('#create').textContent=shape==='cube'?'Crear Q-bit':'Crear T-bit';}
function initUnitRadial(){
 if(unitRadial)return;
 if(!window.QBitsRadial)throw new Error('No se pudo preparar el selector de piezas.');
 const entries=[
  {id:'cube',title:'Q-bit',subtitle:'Cubo',description:'Seis caras, muchas posibilidades. Tómalo, únelo y sepáralo para construir.',color:[43,46,49]},
  {id:'tetra',title:'T-bit',subtitle:'Triangular',description:'Cuatro caras triangulares. Una nueva forma de encajar, con la misma vida que un Q-bit.',color:[135,140,143]},
  {id:'pyramid',title:'T-bit',subtitle:'Rectangular',description:'Base rectangular y caras inclinadas. Únelo a otras piezas y desarma cuando quieras.',color:[135,140,143]}
 ];
 unitRadial=window.QBitsRadial.create({profiles:entries.map(entry=>{
  const profile=unitProfile(entry.id);
  return {...entry,vertices:profile.vertices.map(v=>[v.x/CUBE_SIZE,v.y/CUBE_SIZE,v.z/CUBE_SIZE]),faces:profile.faces};
 })});
}
function unitRadialAllowed(){
 return running&&document.pointerLockElement===canvas&&story.ready&&story.mode==='playing'&&story.scene==='lab'&&!puzzle.active&&!story.transition&&!document.hidden&&document.body.dataset.booting!=='true'&&panel.hidden&&menu.hidden&&commandMenu.hidden&&!held&&!marquee&&!pendingPickup&&!moveChoice&&!pendingCargo&&!editableTarget(document.activeElement);
}
function openUnitRadial(){
 if(radialOpen()||!unitRadialAllowed())return false;
 initUnitRadial();keys.clear();routeInspection=null;accumulator=0;
 unitRadial.open(creationShape(),{virtualPointer:document.pointerLockElement===canvas});
 document.body.dataset.unitRadial='open';hint.hidden=true;redraw=true;
 return true;
}
function closeUnitRadial(commit=false){
 if(!radialOpen())return false;
 const choice=unitRadial.hovered;
 const valid=commit&&unitRadialAllowed()&&['cube','tetra','pyramid'].includes(choice);
 unitRadial.close();document.body.dataset.unitRadial='closed';keys.clear();accumulator=0;
 if(valid){settings.unitShape=choice;syncUnitControls();announce((choice==='cube'?'Q-bit':choice==='tetra'?'T-bit triangular':'T-bit rectangular')+' · N para crear');}
 redraw=true;return valid;
}
function handleKeyUp(event){
 keys.delete(event.code);
 if(event.code==='KeyQ'&&radialOpen()){event.preventDefault();closeUnitRadial(true);}
}
function spawnQubit(){
 if(puzzleBlockedEdit('qubit'))return;
 const shape=creationShape();
 if(groups.reduce((s,g)=>s+g.parts.length,0)>=MAX_QUBITS){announce('Máximo de '+MAX_QUBITS+' piezas en la sala.');return;}
 for(let row=0;row<6;row++)for(const col of [0,1,-1,2,-2,3,-3]){
  const p=V(position[0]-Math.sin(yaw)*(.95+row*.16)+Math.cos(yaw)*col*.16,unitGroundHeight(shape)+.002,position[2]-Math.cos(yaw)*(.95+row*.16)-Math.sin(yaw)*col*.16);
  if(Math.max(Math.abs(p.x),Math.abs(p.z))>13.9)continue;
  if(groups.some(g=>poses(g).some(o=>obbOverlap({p,q:Q(),shape},o,-.012))))continue;
  const g=addQubit([p.x,p.y,p.z],settings.mass,shape);selected={g,part:g.parts[0]};multiSelection=[];announce(unitLabel(g.parts[0])+' creado · '+settings.mass+' u');return g;
 }announce('No hay espacio delante. Muévete y vuelve a intentarlo.');
}
function rayPart(origin,dir,pose,max=40,half=pose.half?.x||HALF){
 const inv=pose.q.inverse(),o=inv.vmult(sub(origin,pose.p)),d=inv.vmult(dir);let near=0,far=max,normal=V();
 if(isTBit(pose)){
  const profile=unitProfile(pose);
  for(let i=0;i<profile.faces.length;i++){
   const n=profile.faceNormals[i],distance=n.dot(profile.faceCenters[i])-n.dot(o),denominator=n.dot(d);
   if(Math.abs(denominator)<1e-9){if(distance<0)return null;continue;}
   const t=distance/denominator;if(denominator<0){if(t>near){near=t;normal=n;}}else far=Math.min(far,t);if(near>far)return null;
  }
  return {distance:near,point:add(origin,mul(dir,near)),normal:pose.q.vmult(normal)};
 }
 for(const k of ['x','y','z']){
  if(Math.abs(d[k])<1e-9){if(Math.abs(o[k])>half)return null;continue;}
  let a=(-half-o[k])/d[k],b=(half-o[k])/d[k],sign=-1;if(a>b){[a,b]=[b,a];sign=1;}
  if(a>near){near=a;normal=V();normal[k]=sign;}far=Math.min(far,b);if(near>far)return null;
 }return {distance:near,point:add(origin,mul(dir,near)),normal:pose.q.vmult(normal)};
}
function aimQubit(max=2.7,dir=direction()){
 const origin=V(...camera);let hit=null,best=Math.min(puzzleRayLimit(max,dir),raycastCargo(max,dir)?.distance??max);
 for(const g of groups)for(const pose of poses(g)){const r=rayPart(origin,dir,pose,best);if(r&&r.distance<best){best=r.distance;hit={...r,g,part:pose.part};}}
 return hit;
}
function carrySet(hit){return multiSelection.includes(hit.g)&&multiSelection.length>1?multiSelection.filter(g=>groups.includes(g)):[hit.g];}
function canCarry(list){return list.reduce((n,g)=>n+totalWeight(g),0)<=settings.maxCarry+.0001;}
function grabQubit(hitOverride=null){
 if(document.pointerLockElement!==canvas||held||marquee)return;const hit=hitOverride||aimQubit();if(hit?.g?.storyEmerging)return;
 if(!hit){if(aimCargo(3)){announce('Este cuerpo se arrastra con un equipo de Q-bits.');return;}startMarquee();return;}
 if(altDown()){openDetachMenu(hit);return;}
 const list=carrySet(hit),weight=list.reduce((n,g)=>n+totalWeight(g),0);
 if(!canCarry(list)){announce('Peso '+formatWeight(weight)+' u · capacidad '+formatWeight(settings.maxCarry)+' u. Ajustable en P.');return;}
 if(story.ready&&story.scene==='intro'&&hit.g===storyGuide()){hit.g.storyFloat=false;hit.g.body.type=CANNON.Body.DYNAMIC;hit.g.body.updateMassProperties();}
 undockCampaignGroup(hit.g);
 selected=hit;const rootPoint=hit.point.clone();
 const ordered=[hit.g,...list.filter(g=>g!==hit.g)],items=[];
 for(const g of ordered){
  if(g.blueprintJob){const slot=g.blueprintJob;releaseBlueprintSlot(slot);slot.bp.slots=slot.bp.slots.filter(s=>s!==slot);}
  leaveHaul(g);stopRoute(g);g.body.wakeUp();const point=g===hit.g?hit.point:g.body.position.clone();
  const local=g.body.quaternion.inverse().vmult(sub(point,g.body.position));
  const anchorBody=new CANNON.Body({mass:0});anchorBody.type=CANNON.Body.KINEMATIC;anchorBody.position.copy(point);anchorBody.collisionFilterGroup=0;world.addBody(anchorBody);
  const joint=new CANNON.PointToPointConstraint(g.body,local,anchorBody,V(),settings.force*g.body.mass/(weight*.25));joint.collideConnected=false;world.addConstraint(joint);
  items.push({g,anchor:local,anchorBody,joint,relative:sub(point,rootPoint),initialQ:g.body.quaternion.clone(),restQ:null});
 }
 held={...hit,...items[0],items,weight,age:0,distance:clamp(hit.distance,.3,2.5),rotation:hit.g.body.quaternion.clone(),initialRotation:hit.g.body.quaternion.clone()};
 storyOnGrab(hit.g);
 speech.shake=null;queueSpeech(hit.g,'close',{part:hit.part,kind:'pickup',priority:62,cooldown:18});
}
function releaseQubit(join=false){
 if(!held)return;
 const g=held.g,items=held.items||[held],dock=story.dockCandidate;
 for(const item of items){if(item.joint)world.removeConstraint(item.joint);if(item.anchorBody)world.removeBody(item.anchorBody);item.g.body.angularDamping=settings.damping;item.g.body.fixedRotation=false;item.g.body.updateMassProperties();}
 if(items.length===1&&join&&snap&&snap.source===g&&groups.includes(snap.target)&&validPose(g,snap.position,snap.quaternion))weld(snap);
 else for(const item of items){item.g.body.velocity.set(0,0,0);item.g.body.wakeUp();}
 held=null;snap=null;tryDockCampaign(g,dock);
}
function touchingUnitFaces(a,b,tolerance=.002){
 // Preserve the established cube grid; convex units connect through real faces.
 if(!isTBit(a.shape)&&!isTBit(b.shape))return Math.abs(a.p.distanceTo(b.p)-CUBE_SIZE)<tolerance;
 for(const fa of unitFaces(a))for(const fb of unitFaces(b)){
  if(fa.normal.dot(fb.normal)>-.999||Math.abs(sub(fb.center,fa.center).dot(fa.normal))>=tolerance)continue;
  let overlaps=true;
  for(const face of [fa,fb])for(let i=0;i<face.vertices.length;i++){
   const edge=sub(face.vertices[(i+1)%face.vertices.length],face.vertices[i]),axis=fa.normal.cross(edge);axis.normalize();
   let amin=Infinity,amax=-Infinity,bmin=Infinity,bmax=-Infinity;
   for(const p of fa.vertices){const d=p.dot(axis);amin=Math.min(amin,d);amax=Math.max(amax,d);}
   for(const p of fb.vertices){const d=p.dot(axis);bmin=Math.min(bmin,d);bmax=Math.max(bmax,d);}
   if(Math.min(amax,bmax)-Math.max(amin,bmin)<.0005){overlaps=false;break;}
  }
  if(overlaps)return true;
 }
 return false;
}
function makeFragments(parts,reference,velocity=V(),spin=V()){
 const remaining=new Set(parts),created=[];
 while(remaining.size){const first=remaining.values().next().value,component=[first];remaining.delete(first);
  for(let i=0;i<component.length;i++)for(const part of [...remaining])if(touchingUnitFaces(component[i],part)){component.push(part);remaining.delete(part);}
  created.push(makeGroup(component,reference,velocity,spin));
 }return created;
}
function detachPart(hit,all=false){
 if(!hit||!groups.includes(hit.g))return;
 const g=hit.g;if(g.parts.length===1){announce('Este '+unitLabel(hit.part)+' ya está separado.');return;}
 if(held&&(held.items||[held]).some(item=>item.g===g))releaseQubit();const parts=worldParts(g),velocity=g.body.velocity.clone(),spin=g.body.angularVelocity.clone(),ref=g.body.quaternion.clone();
 removeGroup(g);
 if(all){for(const part of parts)makeGroup([part],part.q,velocity,spin);announce('Estructura desarmada');}
 else {
  const one=parts.find(p=>p.id===hit.part.id),rest=parts.filter(p=>p.id!==hit.part.id);
  makeFragments(rest,ref,velocity,spin);const detached=makeGroup([one],one.q,velocity,spin);selected={g:detached,part:detached.parts[0]};announce(unitLabel(one)+' separado');
 }
}
function deleteQubit(hit){
 if(puzzleBlockedEdit())return;
 if(!hit||!groups.includes(hit.g)){announce('Apunta a una pieza para borrarla.');return;}
 const g=hit.g;if(held&&(held.items||[held]).some(item=>item.g===g))releaseQubit();const rest=worldParts(g).filter(p=>p.id!==hit.part.id),ref=g.body.quaternion.clone();removeGroup(g);
 if(rest.length)makeFragments(rest,ref);announce(unitLabel(hit.part)+' borrado');
}
// All 24 orientations of a cube are used for magnetic alignment and rolling.
const orientations=[];
function qSimilarity(a,b){return Math.abs(a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w);}
for(let x=0;x<4;x++)for(let y=0;y<4;y++)for(let z=0;z<4;z++){
 const q=Q();q.setFromEuler(x*Math.PI/2,y*Math.PI/2,z*Math.PI/2);q.normalize();if(!orientations.some(o=>qSimilarity(o,q)>.9999))orientations.push(q);
}
function orientationIndex(q){let index=0,best=-1;orientations.forEach((o,i)=>{const d=qSimilarity(o,q);if(d>best){best=d;index=i;}});return index;}
function nearestRelative(reference,current){let best=reference,bestScore=-1;for(const o of orientations){const q=reference.mult(o),score=qSimilarity(q,current);if(score>bestScore){best=q;bestScore=score;}}return best;}
function findConvexSnap(source,part,target,t,limit){
 if(part.p.distanceTo(t.p)>CUBE_SIZE*2+limit)return null;
 const profile=unitProfile(part.part.shape),candidates=[];
 for(const face of unitFaces(t)){
  if(sub(part.p,face.center).dot(face.normal)<-.015)continue;
  for(let index=0;index<profile.faces.length;index++){
   const align=Q();align.setFromVectors(part.q.vmult(profile.faceNormals[index]),mul(face.normal,-1));align.normalize();
   const base=align.mult(part.q),faceIndices=profile.faces[index],edge=sub(profile.vertices[faceIndices[1]],profile.vertices[faceIndices[0]]);
   const tangent=base.vmult(edge);tangent.normalize();
   let edgeAligned=base,edgeScore=-1;
   // A second candidate aligns a polygon edge; keep the closest such rotation.
   for(let i=0;i<face.vertices.length;i++)for(const sign of [-1,1]){
    const along=mul(sub(face.vertices[(i+1)%face.vertices.length],face.vertices[i]),sign);along.normalize();
    const twist=Q();twist.setFromAxisAngle(face.normal,Math.atan2(face.normal.dot(tangent.cross(along)),tangent.dot(along)));
    const q=twist.mult(base),score=qSimilarity(q,part.q);if(score>edgeScore){edgeScore=score;edgeAligned=q;}
   }
   for(const partQ of qSimilarity(base,edgeAligned)>.99999?[base]:[base,edgeAligned]){
    const center=sub(face.center,partQ.vmult(profile.faceCenters[index])),distance=center.distanceTo(part.p);
    const score=distance+(1-qSimilarity(partQ,part.q))*.015;if(score>=limit)continue;
    const quaternion=partQ.mult(part.part.q.inverse()),position=sub(center,quaternion.vmult(part.part.offset));
    candidates.push({source,target,position,quaternion,score,face:{p:face.center,normal:face.normal,vertices:face.vertices,q:t.q,axis:0}});
   }
  }
 }
 // Most frames need one scene collision check, regardless of the number of faces.
 candidates.sort((a,b)=>a.score-b.score);
 return candidates.find(c=>validPose(source,c.position,c.quaternion))||null;
}
function findSnap(){
 if(!held||!shiftDown()||(held.items&&held.items.length>1))return null;
 const source=held.g,part=partPose(source,held.part);let candidate=null,best=.055;
 for(const target of groups){if(target===source||target.route||target.haulJob)continue;
  if(sameBlockShape(source,target)){
   const blockCandidate=findBlockSnap(source,target);
   if(blockCandidate&&(!candidate||blockCandidate.score<candidate.score)){candidate=blockCandidate;best=blockCandidate.score;}
   continue;
  }
  for(const t of poses(target)){
   if(isTBit(part.part)||isTBit(t.part)){
    const convex=findConvexSnap(source,part,target,t,best);if(convex){candidate=convex;best=convex.score;}continue;
   }
   for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
   const normal=t.q.vmult(mul(axes[axis],sign)),center=add(t.p,mul(normal,CUBE_SIZE)),distance=center.distanceTo(part.p);
   if(distance>=best)continue;
   const partQ=nearestRelative(t.q,part.q),delta=partQ.mult(part.q.inverse()),quaternion=delta.mult(source.body.quaternion);
   const position=sub(center,quaternion.vmult(held.part.offset));
   if(!validPose(source,position,quaternion))continue;
   best=distance;candidate={source,target,position,quaternion,score:distance,face:{p:add(t.p,mul(normal,HALF+.001)),normal,q:t.q,axis}};
   }
  }
 }return candidate;
}
function weld(candidate){
 const {source,target,position,quaternion}=candidate;
 const parts=poses(source,position,quaternion).map(o=>({id:o.part.id,weight:o.part.weight,shape:o.part.shape,p:o.p,q:o.q,mood:copyMood(o.part.mood)})).concat(worldParts(target));
 const ref=target.body.quaternion.clone();removeGroup(source);removeGroup(target);const joined=makeGroup(parts,ref);
 selected={g:joined,part:joined.parts[0]};queueSpeech(joined,'happy',{kind:'joined',indices:[7,9,15,17]});announce('Unidos · '+joined.parts.length+' '+groupUnitLabel(joined)+' · '+totalWeight(joined)+' u');return joined;
}
function applyOrientation(g,desired,strength=160){
 const b=g.body;let error=desired.mult(b.quaternion.inverse());if(error.w<0)error.set(-error.x,-error.y,-error.z,-error.w);
 const vector=V(error.x,error.y,error.z),length=vector.norm();if(length>1e-8)vector.scale(2*Math.atan2(length,clamp(error.w,-1,1))/length,vector);
 const local=b.quaternion.inverse().vmult(vector),omega=b.quaternion.inverse().vmult(b.angularVelocity),torque=V();
 for(const k of ['x','y','z'])torque[k]=b.inertia[k]*(local[k]*strength-omega[k]*2*Math.sqrt(strength));
 b.torque.vadd(b.quaternion.vmult(torque),b.torque);
 const grip=held&&(held.items||[held]).find(item=>item.g===g);
 if(grip){const offset=b.quaternion.vmult(grip.anchor);b.torque.vsub(offset.cross(V(0,b.mass*settings.gravity,0)),b.torque);}
}
// Clamp the attachment using the entire shape, including its requested rotation.
function safeGripTarget(item,target,quaternions){
 const result=target.clone(),low=V(-Infinity,-Infinity,-Infinity),high=V(Infinity,Infinity,Infinity);
 for(const q of quaternions){
  const bb=bounds(item.g,V(),q),anchor=q.vmult(item.anchor);
  for(const k of ['x','y','z']){
   const floor=k==='y'?.008+alphaSupport(item.g,sub(target,q.vmult(item.anchor)),q):-ROOM_SIZE/2+.003,ceiling=k==='y'?ROOM_HEIGHT-.003:ROOM_SIZE/2-.003;
   low[k]=Math.max(low[k],floor-bb.min[k]+anchor[k]);high[k]=Math.min(high[k],ceiling-bb.max[k]+anchor[k]);
  }
 }
 for(const k of ['x','y','z'])result[k]=clamp(result[k],low[k],high[k]);return result;
}
function updateGrab(dt){
 if(!held)return;held.age+=dt;
 if(shiftDown()){
  const tilt=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),turn=Number(keys.has('KeyA'))-Number(keys.has('KeyD'));
  if(tilt||turn){const axis=V(Math.cos(yaw)*tilt,turn,-Math.sin(yaw)*tilt);axis.normalize();const q=Q();q.setFromAxisAngle(axis,dt*settings.rotationSpeed);held.rotation=q.mult(held.rotation);}
 }
 const rootTarget=campaignDockTarget(tutorialGripTarget(add(add(V(...camera),mul(direction(),held.distance)),held.rootOffset||V()))),rotationDelta=held.rotation.mult(held.initialRotation.inverse());
 for(const item of held.items||[held]){
  const b=item.g.body;b.wakeUp();b.angularDamping=.85+settings.grip*.1499;
  let target=add(rootTarget,rotationDelta.vmult(item.relative||V())),desired=null,strength=160;
  if(snap&&item.g===held.g){target=add(snap.position,snap.quaternion.vmult(item.anchor));desired=snap.quaternion;item.restQ=null;}
  else if(story.dockCandidate&&item.g===held.g){desired=story.dockCandidate.quaternion;item.restQ=null;}
  else if(shiftDown()){desired=rotationDelta.mult(item.initialQ||held.initialRotation);item.restQ=null;}
  else if(held.age>.22){if(!item.restQ)item.restQ=b.quaternion.clone();desired=item.restQ;strength=30+settings.grip*35;}
  const rotations=[b.quaternion];
  if(desired){for(let i=1;i<=8;i++)rotations.push(slerp(b.quaternion,desired,i/8));}
  target=safeGripTarget(item,target,rotations);
  const currentFloor=bounds(item.g).min.y;
  const turning=shiftDown()||!!snap,turnClear=desired?bounds(item.g,b.position,desired).min.y>=.004:true;
  const docking=!!story.dockCandidate&&item.g===held.g;
  if(docking){b.quaternion.copy(slerp(b.quaternion,story.dockCandidate.quaternion,1-Math.exp(-8*dt)));b.aabbNeedsUpdate=true;}
  const lockFloor=docking||currentFloor<.015&&(!turning||!turnClear);
  if(b.fixedRotation!==lockFloor){b.fixedRotation=lockFloor;b.updateMassProperties();}
  item.floorLocked=lockFloor;if(lockFloor){b.angularVelocity.set(0,0,0);b.torque.set(0,0,0);if(!turning)item.restQ=b.quaternion.clone();}
  if(desired&&!lockFloor){
   // Raise the real body before turning it into the floor or a wall.
   const next=slerp(b.quaternion,desired,.15),bb=bounds(item.g,b.position,next);
   const clear=bb.min.y>=-.0003&&bb.max.y<=ROOM_HEIGHT-.001&&Math.max(Math.abs(bb.min.x),Math.abs(bb.max.x),Math.abs(bb.min.z),Math.abs(bb.max.z))<ROOM_SIZE/2-.001;
   applyOrientation(item.g,clear?desired:b.quaternion,strength);
  }
  if(item.anchorBody){
   const delta=sub(target,item.anchorBody.position),distance=delta.norm(),step=Math.min(distance*(1-Math.exp(-16*dt)),2.8*dt);
   if(distance>1e-8)item.anchorBody.position.vadd(mul(delta,step/distance),item.anchorBody.position);
   item.anchorBody.position.copy(safeGripTarget(item,item.anchorBody.position,[b.quaternion]));
   const force=settings.force*b.mass/(held.weight*.25);
   for(const equation of item.joint.equations){equation.maxForce=force;equation.minForce=-force;}
  }
 }
}
function slerp(a,b,t){
 let dot=a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w,sign=dot<0?-1:1;dot=Math.abs(dot);
 let u=1-t,v=t;if(dot<.9995){const angle=Math.acos(clamp(dot,-1,1)),sin=Math.sin(angle);u=Math.sin((1-t)*angle)/sin;v=Math.sin(t*angle)/sin;}
 const q=Q();q.set(u*a.x+v*b.x*sign,u*a.y+v*b.y*sign,u*a.z+v*b.z*sign,u*a.w+v*b.w*sign);q.normalize();return q;
}
const rollDirections=[V(1,0,0),V(-1,0,0),V(0,0,1),V(0,0,-1)];
const rollQuats=rollDirections.map(d=>{const q=Q();q.setFromAxisAngle(V(0,1,0).cross(d),Math.PI/2);return q;});
class MinHeap {
 constructor(){this.items=[];}
 better(a,b){return a.f<b.f-1e-9||(Math.abs(a.f-b.f)<1e-9&&a.h<b.h);}
 push(v){const a=this.items;a.push(v);let i=a.length-1;while(i){const p=(i-1)>>1;if(!this.better(a[i],a[p]))break;[a[i],a[p]]=[a[p],a[i]];i=p;}}
 pop(){const a=this.items,r=a[0],last=a.pop();if(a.length){a[0]=last;let i=0;while(true){let c=2*i+1;if(c>=a.length)break;if(c+1<a.length&&this.better(a[c+1],a[c]))c++;if(!this.better(a[c],a[i]))break;[a[c],a[i]]=[a[i],a[c]];i=c;}}return r;}
}
function sweepClear(a,b,height,obstacles){
 const minX=Math.min(a.min.x,b.min.x)-.002,maxX=Math.max(a.max.x,b.max.x)+.002,minZ=Math.min(a.min.z,b.min.z)-.002,maxZ=Math.max(a.max.z,b.max.z)+.002;
 if(minX< -14||maxX>14||minZ< -14||maxZ>14||height>ROOM_HEIGHT)return false;
 return !obstacles.some(o=>o.min.y<height+.002&&o.max.y>-.002&&o.min.x<maxX&&o.max.x>minX&&o.min.z<maxZ&&o.max.z>minZ);
}
// Follow actual supporting vertices. A concave silhouette may change its
// contact edge several times during a quarter turn.
function rollGeometry(g,position,quaternion,dir){
 const d=rollDirections[dir],axis=V(0,1,0).cross(d),phases=[];
 if(!g.rollVertices)g.rollVertices=poses(g,V(),Q()).flatMap(corners);
 let p=position.clone(),orientation=quaternion.clone(),angle=0;
 let vertices=g.rollVertices.map(v=>add(p,orientation.vmult(v)));
 const envelope={min:V(Infinity,Infinity,Infinity),max:V(-Infinity,-Infinity,-Infinity)};
 const includePoint=(x,y,z)=>{const min=envelope.min,max=envelope.max;min.x=Math.min(min.x,x);min.y=Math.min(min.y,y);min.z=Math.min(min.z,z);max.x=Math.max(max.x,x);max.y=Math.max(max.y,y);max.z=Math.max(max.z,z);};
 const include=points=>{for(const v of points)includePoint(v.x,v.y,v.z);};
 const sample=V(),rotated=V();
 include(vertices);
 for(let pass=0;angle<Math.PI/2-1e-8&&pass<32;pass++){
  let low=Infinity;for(const v of vertices)low=Math.min(low,v.y);
  let support=null,supportDistance=-Infinity;for(const v of vertices)if(v.y<low+1e-7){const distance=v.dot(d);if(distance>supportDistance){support=v;supportDistance=distance;}}
  const pivot=support.clone();let turn=Math.PI/2-angle;
  for(const v of vertices){const du=sub(v,pivot).dot(d),dv=v.y-pivot.y;if(dv<1e-7)continue;
   const hit=Math.atan2(dv,du);if(hit>1e-7&&hit<turn)turn=hit;
  }
  const phase={pivot,relative:sub(p,pivot),fromQ:orientation.clone(),start:angle,angle:turn};phases.push(phase);
  const count=Math.max(1,Math.ceil(turn/(Math.PI/32)));
  for(let i=1;i<=count;i++){const q=Q();q.setFromAxisAngle(axis,turn*i/count);for(const v of vertices){v.vsub(pivot,sample);q.vmult(sample,rotated);includePoint(pivot.x+rotated.x,pivot.y+rotated.y,pivot.z+rotated.z);}}
  const q=Q();q.setFromAxisAngle(axis,turn);p=add(pivot,q.vmult(phase.relative));orientation=q.mult(orientation);orientation.normalize();
  vertices=vertices.map(v=>add(pivot,q.vmult(sub(v,pivot))));angle+=turn;
 }
 const startCenter=bounds(g,position,quaternion).center,endCenter=bounds(g,p,orientation).center;
 return {phases,axis,endP:p,endQ:orientation,envelope,stride:Math.hypot(endCenter.x-startCenter.x,endCenter.z-startCenter.z)};
}
function rollPoseAt(motion,fraction){
 const angle=clamp(fraction,0,1)*Math.PI/2,phase=motion.phases.find(s=>angle<=s.start+s.angle+1e-9)||motion.phases.at(-1),q=Q();
 q.setFromAxisAngle(motion.axis,clamp(angle-phase.start,0,phase.angle));
 return {p:add(phase.pivot,q.vmult(phase.relative)),q:q.mult(phase.fromQ)};
}
// Navigation keeps its complete search limits, but shares a small frame budget.
// A blocked destination must never hold the render/input thread for 35,000 nodes.
const navigationJobs=new Map();
let navigationFrame=0;
function cancelNavigation(owner){navigationJobs.delete(owner);}
function scheduleNavigation(owner,iterator,complete,valid=()=>true){
 const task={owner,iterator,complete,valid};navigationJobs.set(owner,task);
 if(!navigationFrame)navigationFrame=requestAnimationFrame(runNavigationJobs);
 return task;
}
function runNavigationJobs(){
 navigationFrame=0;
 if(!running){navigationJobs.clear();return;}
 if(!document.hidden&&!storySuspended()&&!story.transition){
  const deadline=performance.now()+3;
  while(navigationJobs.size&&performance.now()<deadline){
   const task=navigationJobs.values().next().value;navigationJobs.delete(task.owner);
   if(!task.valid())continue;
   const next=task.iterator.next();
   if(next.done)task.complete(next.value);else if(task.valid())navigationJobs.set(task.owner,task);
  }
 }
 if(navigationJobs.size)navigationFrame=requestAnimationFrame(runNavigationJobs);
}
function* planRoute(g,goal){
 const oi=orientationIndex(g.body.quaternion),layouts=[];
 for(const q of orientations){layouts.push(bounds(g,V(),q));yield;}
 const initial=bounds(g),origin=initial.center,obstacleBounds=navigationObstacles(g),motions=new Map();
 const at=(x,z,o)=>{
  const l=layouts[o],cx=origin.x+x*HALF,cz=origin.z+z*HALF;
  return {min:V(cx-l.size.x/2,0,cz-l.size.z/2),max:V(cx+l.size.x/2,l.size.y,cz+l.size.z/2),size:l.size,position:V(cx-l.center.x,-l.min.y,cz-l.center.z)};
 };
 const tolerance=HALF*Math.SQRT2+.003;
 const heuristic=(x,z)=>Math.max(0,Math.abs(origin.x+x*HALF-goal.x)+Math.abs(origin.z+z*HALF-goal.z)-tolerance*Math.SQRT2);
 // Convex T-bits roll by their actual support edge, not a cube's half-cell stride.
 // Keep their sub-cell positions distinct while retaining the original cube grid.
 const convex=g.parts.some(p=>isTBit(p)),precision=convex?1000:1;
 const keyOf=(x,z,o)=>Math.round(x*precision)+','+Math.round(z*precision)+','+o;
 const start={x:0,z:0,o:oi,g:0,h:heuristic(0,0),parent:null};start.f=start.h;
 const startBox=at(0,0,oi);
 if(!sweepClear(initial,startBox,Math.max(initial.size.y,startBox.size.y),obstacleBounds))return null;
 const heap=new MinHeap();heap.push(start);const costs=new Map([[keyOf(0,0,oi),0]]);let examined=0,found=null;
 while(heap.items.length&&examined++<35000){
  if((examined&15)===0)yield;
  const n=heap.pop(),key=keyOf(n.x,n.z,n.o);if(n.g>costs.get(key)+1e-8)continue;
  if(Math.hypot(origin.x+n.x*HALF-goal.x,origin.z+n.z*HALF-goal.z)<=tolerance){found=n;break;}
  for(let dir=0;dir<4;dir++){
   const mk=n.o+','+dir;
   if(!motions.has(mk)){yield;const base=at(0,0,n.o),motion=rollGeometry(g,base.position,orientations[n.o],dir);motions.set(mk,motion);}
   const m=motions.get(mk),d=rollDirections[dir],shift=V(n.x*HALF,0,n.z*HALF),envelope={min:add(m.envelope.min,shift),max:add(m.envelope.max,shift)};
   if(!sweepClear(envelope,envelope,envelope.max.y+.002,obstacleBounds))continue;
   const x=n.x+d.x*m.stride/HALF,z=n.z+d.z*m.stride/HALF,o=orientationIndex(m.endQ),cost=n.g+m.stride,k=keyOf(x,z,o);
   if(cost>=(costs.get(k)??Infinity)-1e-8)continue;
   const h=heuristic(x,z);costs.set(k,cost);heap.push({x,z,o,g:cost,h,f:cost+h,parent:n,dir});
  }
 }
 if(!found)return null;
 const steps=[],preview=[],strides=[];for(let n=found;n.parent;n=n.parent){steps.push(n.dir);preview.push(at(n.x,n.z,n.o).position);strides.push(n.g-n.parent.g);}steps.reverse();preview.reverse();strides.reverse();
 return {steps,preview,strides,startPosition:startBox.position,startQuaternion:orientations[oi].clone(),end:V(origin.x+found.x*HALF,0,origin.z+found.z*HALF)};
}
function stopRoute(g,clearPin=true){
 if(!g)return;cancelNavigation(g);g.routeSearch=null;
 if(g.route){g.route=null;g.body.type=CANNON.Body.DYNAMIC;g.body.updateMassProperties();g.body.velocity.set(0,0,0);g.body.angularVelocity.set(0,0,0);g.body.wakeUp();}
 if(clearPin){g.pin=null;g.pendingMoodOrder=null;}
}
function startRoute(g,goal,quiet=false){
 if(!g||!groups.includes(g))return false;
 const wasBlocked=g.pendingMoodOrder?.reason==='bloqueo',changed=!!g.route;
 if(held&&(held.items||[held]).some(item=>item.g===g)){announce('Suelta la estructura antes de marcar su recorrido.');return false;}
 const bb=bounds(g);if(bb.min.y>.025){if(!quiet)announce('Deja la pieza en el piso antes de darle un destino.');return false;}
 if(!groupWilling(g)){queueMoodRoute(g,goal);if(!quiet)announce('Necesita descansar · la orden queda pendiente.');return true;}
 stopRoute(g);goal=goal.clone();const source=g.body.position.clone(),sourceQ=g.body.quaternion.clone();
 const pending={goal,reason:'planning',nextTry:Infinity};g.pendingMoodOrder=pending;g.pin={point:goal.clone(),arrived:false};
 g.routeSearch=scheduleNavigation(g,planRoute(g,goal),plan=>{
  g.routeSearch=null;
  if(!plan){if(Math.max(Math.abs(goal.x),Math.abs(goal.z))<13.9)queueMoodRoute(g,goal,'bloqueo');else g.pendingMoodOrder=null;if(!quiet)announce('Camino bloqueado · esperará a que haya paso. R cancela.');return;}
  // A held, moved or reorganized piece must not follow an obsolete start pose.
  const b=g.body,rotation=Math.abs(b.quaternion.x*sourceQ.x+b.quaternion.y*sourceQ.y+b.quaternion.z*sourceQ.z+b.quaternion.w*sourceQ.w);
  if(b.position.distanceTo(source)>.025||rotation<.999){queueMoodRoute(g,goal,'replan');return;}
  if(!groupWilling(g)){queueMoodRoute(g,goal);return;}
  g.pendingMoodOrder=null;campaignOrder(g);g.route={steps:plan.steps,preview:plan.preview,strides:plan.strides,index:0,goal,align:{fromP:b.position.clone(),fromQ:b.quaternion.clone(),toP:plan.startPosition,toQ:plan.startQuaternion,t:0},segment:null};
  g.pin={point:plan.end,arrived:false};b.type=CANNON.Body.KINEMATIC;b.updateMassProperties();b.velocity.set(0,0,0);b.angularVelocity.set(0,0,0);b.wakeUp();
  if(wasBlocked)queueSpeech(g,'helped',{priority:73});else if(!quiet)queueSpeech(g,'order',{kind:changed?'changed':b.position.distanceTo(goal)>2?'long':''});
 },()=>groups.includes(g)&&g.pendingMoodOrder===pending);
 if(!quiet)announce('Calculando recorrido · '+totalWeight(g)+' u');return true;
}
function makeRollSegment(g,dir){
 const motion=rollGeometry(g,g.body.position,g.body.quaternion,dir),box=motion.envelope;
 if(!sweepClear(box,box,box.max.y+.002,navigationObstacles(g)))return null;
 return {...motion,t:0,duration:Math.max(.16,motion.stride/settings.speed*Math.sqrt(totalWeight(g)))};
}
function updateRoutes(dt){
 for(const g of groups){const r=g.route;if(!r)continue;const b=g.body;
  if(!groupWilling(g)&&!r.segment&&!r.align){queueMoodRoute(g,r.goal);continue;}
  if(r.align){const oldP=b.position.clone(),oldQ=b.quaternion.clone();const a=r.align;a.t=Math.min(1,a.t+dt/.32);const u=a.t*a.t*(3-2*a.t);b.quaternion.copy(slerp(a.fromQ,a.toQ,u));a.fromP.lerp(a.toP,u,b.position);
   b.position.y-=bounds(g).min.y;
   if(!validPose(g,b.position,b.quaternion)){b.position.copy(oldP);b.quaternion.copy(oldQ);queueMoodRoute(g,r.goal,'bloqueo');announce('No hay espacio para iniciar el giro · orden pendiente.');continue;}
   b.aabbNeedsUpdate=true;b.updateInertiaWorld(true);if(a.t>=1)r.align=null;continue;}
  if(!r.segment){
   if(r.index>=r.steps.length){if(g.pin)g.pin.arrived=true;stopRoute(g,false);if(!g.blueprintJob&&!g.haulJob)queueSpeech(g,'happy',{kind:'arrived'});continue;}
   r.segment=makeRollSegment(g,r.steps[r.index]);
   if(!r.segment){const goal=r.goal.clone();if(!startRoute(g,goal,true))announce('Recorrido detenido: el camino quedó bloqueado.');continue;}
  }
  const s=r.segment;s.t=Math.min(1,s.t+dt*moodSpeed(g)/s.duration);const smooth=s.t*s.t*(3-2*s.t),pose=rollPoseAt(s,smooth);
  const nextP=pose.p,nextQ=pose.q;
  if(!validPose(g,nextP,nextQ)) {queueMoodRoute(g,r.goal,'bloqueo');announce('Paso bloqueado · espera o pulsa R para cancelar.');continue;}
  b.position.copy(nextP);b.quaternion.copy(nextQ);b.aabbNeedsUpdate=true;b.updateInertiaWorld(true);
  if(s.t>=1){b.position.copy(s.endP);b.quaternion.copy(s.endQ);r.segment=null;r.index++;}
 }
}
function landingProjection(g){
 let delta=-bounds(g).min.y;
 const others=groups.filter(o=>o!==g&&!(held?.items?.some(item=>item.g===o))).flatMap(o=>poses(o)).concat(cargos.map(cargoPose));
 for(const pose of poses(g)){
  const samples=corners(pose);samples.push(pose.p);
  for(const point of samples){
   for(const other of others){const hit=rayPart(add(point,V(0,.0005,0)),V(0,-1,0),other,30);if(hit&&hit.distance>.001)delta=Math.max(delta,.0005-hit.distance);}
  }
 }
 return {position:add(g.body.position,V(0,delta+.002,0)),delta};
}
function stepPhysics(dt){
 simTime+=dt;tutorialFloat(dt);updateGrab(dt);updateRoutes(dt);updateHauling(dt);
 // Bound substep travel to avoid tunnelling through a 9 cm piece.
 for(const g of groups){const b=g.body,speed=b.velocity.norm();if(speed>6)b.velocity.scale(6/speed,b.velocity);const spin=b.angularVelocity.norm();if(spin>30)b.angularVelocity.scale(30/spin,b.angularVelocity);}
 updateCampaignPressure(dt);updateButtonPhysics();world.step(dt);
 // Correct only tiny solver penetration of a hand-held shape; free bodies keep
 // their normal collision response. A hand cannot push its attachment underground.
 if(held)for(const item of held.items||[held]){const b=item.g.body,low=bounds(item.g).min.y;if(low<.001){b.position.y+=.001-low;if(b.velocity.y<0)b.velocity.y=0;b.aabbNeedsUpdate=true;}if(item.floorLocked)b.angularVelocity.set(0,0,0);}
 for(const c of cargos){c.body.velocity.y=0;c.body.position.y=(c.dimensions?.y||c.size)/2;c.body.quaternion.set(0,0,0,1);c.body.angularVelocity.set(0,0,0);c.body.aabbNeedsUpdate=true;}
 updateCooling(dt);updateMoods(dt);updateBlueprints(dt);updatePuzzle(dt);
}
function updatePanel(){
 if(selected&&!groups.includes(selected.g))selected=null;
 syncUnitControls();
 document.querySelector('#editing').textContent=selected?unitLabel(selected.part)+' '+selected.part.id+' · estructura de '+selected.g.parts.length+' · '+totalWeight(selected.g)+' u en total.':'Selecciona con clic derecho para ajustar una pieza.';
 for(const name of ['mass','gravity','bounce','force','friction','damping','speed','maxCarry','maxSelect','rotationSpeed','grip']){
  const input=document.querySelector('#'+name);input.value=name==='mass'&&selected?selected.part.weight:settings[name];
  document.querySelector('#'+name+'Value').textContent=Number(input.value).toFixed(name==='mass'?2:2)+({mass:' u',gravity:' m/s²',force:' N',speed:' m/s',maxCarry:' u',maxSelect:' piezas',rotationSpeed:' rad/s'}[name]||'');
 }
 for(const name of ['guide','line'])document.querySelector('#'+name).value=settings[name];
 updateCargoPanel();updatePuzzlePanel();updateMoodPanel();updateAlphaPanel();
 document.querySelector('#remove').disabled=puzzle.active||!selected;document.querySelector('#split').disabled=!selected||selected.g.parts.length===1;
}
function openPanel(){closeCommandMenu(false);selectedCargo=aimCargo(4)?.cargo||selectedCargo;selected=held?{g:held.g,part:held.part}:aimQubit()||selected;pause();panel.hidden=false;updatePanel();}
for(const name of ['mass','gravity','bounce','force','friction','damping','speed','maxCarry','maxSelect','rotationSpeed','grip'])document.querySelector('#'+name).addEventListener('input',event=>{
 settings[name]=Number(event.target.value);
 if(name==='mass'&&puzzle.active){settings.mass=1;updatePanel();return;}
 if(name==='mass'&&selected){
  const old=selected.g,id=selected.part.id,parts=worldParts(old),ref=old.body.quaternion.clone();parts.find(p=>p.id===id).weight=settings.mass;
  removeGroup(old);const g=makeGroup(parts,ref);selected={g,part:g.parts.find(p=>p.id===id)};
 }
 world.gravity.y=-settings.gravity;world.defaultContactMaterial.friction=settings.friction;world.defaultContactMaterial.restitution=settings.bounce;
 for(const g of groups){g.body.angularDamping=settings.damping;g.body.wakeUp();}
 updatePanel();
});
for(const name of ['guide','line'])document.querySelector('#'+name).addEventListener('change',e=>settings[name]=e.target.value);
for(const name of ['cube','route','cargo','puzzle','alpha'])document.querySelector('#tab-'+name).addEventListener('click',()=>{
 for(const tab of ['cube','route','cargo','puzzle','alpha']){document.querySelector('#page-'+tab).hidden=tab!==name;document.querySelector('#tab-'+tab).setAttribute('aria-selected',String(tab===name));}
});
document.querySelector('#create').addEventListener('click',()=>{spawnQubit();updatePanel();});
document.querySelector('#unit-shape').addEventListener('change',event=>{settings.unitShape=normalizeUnitShape(event.target.value);syncUnitControls();});
document.querySelector('#remove').addEventListener('click',()=>{deleteQubit(selected);updatePanel();});
document.querySelector('#split').addEventListener('click',()=>{detachPart(selected,true);updatePanel();});
document.querySelector('#stop').addEventListener('click',()=>{if(selectedCargo)stopHaul(selectedCargo);for(const g of selectedTeam()){leaveHaul(g);stopRoute(g);}});
document.querySelector('#resume').addEventListener('click',()=>{panel.hidden=true;if(!story.ready||story.mode==='playing')captureMouse();});
canvas.addEventListener('mousedown',onCanvasMouseDown);
document.addEventListener('mouseup',onCanvasMouseUp);
function handleWheel(event){
 if(radialOpen()){event.preventDefault();return;}
 if(document.pointerLockElement!==canvas)return;
 if(keys.has('KeyC')){
  event.preventDefault();posture.crouchHeight=clamp(posture.crouchHeight-Math.sign(event.deltaY)*.08,.42,1.15);redraw=true;return;
 }
 if(!held)return;
 event.preventDefault();held.distance=clamp(held.distance+Math.sign(event.deltaY)*.07,.3,2.5);
}
canvas.addEventListener('wheel',handleWheel,{passive:false});
function handleKey(event){
 if(radialOpen()){
  event.preventDefault();
  if(event.code==='Escape')closeUnitRadial(false);
  else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.code))unitRadial.chooseNext(event.code==='ArrowLeft'||event.code==='ArrowUp'?-1:1);
  return;
 }
 if(event.code==='KeyQ'&&!event.repeat&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&unitRadialAllowed()){
  event.preventDefault();openUnitRadial();return;
 }
 if(storyInput(event))return;
 speech.lastInput=simTime;
 if(event.code==='Escape'){closeCommandMenu(false);moveChoice=null;pendingCargo=null;routeInspection=null;if(!menu.hidden)closeDetachMenu(false);finishMarquee(true);pause();return;}
 const editing=['INPUT','SELECT','BUTTON'].includes(document.activeElement?.tagName);
 if(event.code==='KeyP'&&!event.repeat&&!editing){event.preventDefault();if(panel.hidden)openPanel();else panel.hidden=true;return;}
 if(document.pointerLockElement!==canvas)return;
 if(event.code.startsWith('Alt')&&!held&&!marquee&&!event.repeat){const inspection=inspectionNearPin();if(inspection){event.preventDefault();routeInspection=inspection;keys.add(event.code);return;}const hit=aimQubit()||selected;if(hit?.g.parts.length>1){event.preventDefault();openDetachMenu(hit);return;}}
 if(['ShiftLeft','ShiftRight','ControlLeft','ControlRight','AltLeft','AltRight','KeyW','KeyA','KeyS','KeyD','KeyC'].includes(event.code)){
  event.preventDefault();if(event.code.startsWith('Shift')&&held&&!shiftDown()){held.rotation=held.g.body.quaternion.clone();held.initialRotation=held.rotation.clone();for(const item of held.items||[held]){item.initialQ=item.g.body.quaternion.clone();item.relative=sub(item.anchorBody.position,held.anchorBody.position);}}keys.add(event.code);return;
 }
 if(event.repeat)return;
 if(event.code==='KeyB'){event.preventDefault();spawnCargo();}
 if(event.code==='KeyN'){event.preventDefault();spawnQubit();}
 if(event.code==='KeyV'){event.preventDefault();duplicateSelection();}
 if(event.code==='KeyR'){if(selectedCargo)stopHaul(selectedCargo);for(const g of selectedTeam()){leaveHaul(g);stopRoute(g);}pendingCargo=null;moveChoice=null;announce('Orden detenida');}
 if(event.code==='KeyX'&&(event.altKey||altDown())){event.preventDefault();openDetachMenu(aimQubit()||selected);}
 if(event.code==='Delete'||event.code==='Backspace'){event.preventDefault();const c=aimCargo(4);if(c)deleteCargo(c.cargo);else deleteQubit(held||aimQubit()||selected);}
}
function updateTarget(){
 snap=findSnap();updateCallout();updateCargoCallout();updateMenuConnector();updateInspection();updatePuzzleHUD();updateMoodSelection();updateAlphaHUD();
 if(document.pointerLockElement!==canvas){targetLabel.textContent='';crosshair.classList.remove('ready');return;}
 const hit=held||aimQubit();crosshair.classList.toggle('ready',!!hit);
 if(marquee)targetLabel.textContent='Suelta para seleccionar · hasta '+settings.maxSelect+' piezas';
 else if(held?.latched)targetLabel.textContent='Clic · soltar selección · Shift + WASD · girar';
 else if(held)targetLabel.textContent=snap?(snap.wholeFace?'Cara completa · suelta para unir':'Suelta para unir esta cara'):shiftDown()?'WASD · girar':'Shift · girar / unir · Ctrl · caída';
 else if(selectedTeam().length)targetLabel.textContent='Clic derecho en el suelo · dar destino | clic izquierdo · deseleccionar';
 else if(hit)targetLabel.textContent=totalWeight(hit.g)>settings.maxCarry?'Supera la capacidad de '+formatWeight(settings.maxCarry)+' u':'Clic · tomar | clic derecho · seleccionar';else targetLabel.textContent=aimCargo(4)?'Clic derecho · órdenes del cuerpo':'';
 if(pendingCargo)targetLabel.textContent='Clic derecho en el suelo · destino de la carga';
 const pieces=multiSelection.reduce((n,g)=>n+g.parts.length,0),weight=multiSelection.reduce((n,g)=>n+totalWeight(g),0);
 document.querySelector('#selection').textContent=multiSelection.length>1?pieces+' seleccionados · '+formatWeight(weight)+' u':'';
}

// Shared meshes. The cube's opacity stays at 100%; guides are separate passes.
const roomVertexCount=vertices.length;
face([[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]],[0,-1,0]);
face([[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]],[0,1,0]);
face([[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]],[-1,0,0]);
face([[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]],[1,0,0]);
face([[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]],[0,0,-1]);
face([[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]],[0,0,1]);
function buffer(data){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);return b;}
const cubeGeometry=buffer(vertices.slice(roomVertexCount));vertices.length=roomVertexCount;
const unitMeshes={cube:{buffer:cubeGeometry,count:36}};
for(const shape of ['tetra','pyramid']){
 const profile=unitProfile(shape),data=[],edges=[];
 for(let i=0;i<profile.faces.length;i++){const f=profile.faces[i],n=profile.faceNormals[i];for(let j=1;j<f.length-1;j++)for(const k of [f[0],f[j],f[j+1]]){const v=profile.vertices[k];data.push(v.x/CUBE_SIZE,v.y/CUBE_SIZE,v.z/CUBE_SIZE,n.x,n.y,n.z);}}
 for(const edge of profile.edges)for(const k of edge){const v=profile.vertices[k];edges.push(v.x/CUBE_SIZE,v.y/CUBE_SIZE,v.z/CUBE_SIZE,0,1,0);}
 unitMeshes[shape]={buffer:buffer(data),count:data.length/6,edgeBuffer:buffer(edges),edgeCount:edges.length/6};
}
const faceGuideGeometry=gl.createBuffer();
face([[-.5,0,-.5],[.5,0,-.5],[.5,0,.5],[-.5,0,.5]],[0,1,0]);
const shadowGeometry=buffer(vertices.slice(roomVertexCount));vertices.length=roomVertexCount;
const ringVertices=[];for(let i=0;i<48;i++)for(const n of [i,i+1]){const t=n/48*Math.PI*2;ringVertices.push(Math.cos(t),0,Math.sin(t),0,1,0);}
const ringGeometry=buffer(ringVertices),lineGeometry=gl.createBuffer();
const attributes=[['aPosition',0],['aNormal',12]].map(([name,offset])=>[gl.getAttribLocation(program,name),offset]);
let boundGeometry=null;
function bindGeometry(b){if(boundGeometry===b)return;gl.bindBuffer(gl.ARRAY_BUFFER,b);for(const [loc,offset]of attributes)gl.vertexAttribPointer(loc,3,gl.FLOAT,false,24,offset);boundGeometry=b;}
function setPose(pos,q=Q(),dimensions=V(CUBE_SIZE,CUBE_SIZE,CUBE_SIZE)){
 gl.uniform3f(uniforms.uCenter,pos.x,pos.y,pos.z);gl.uniform4f(uniforms.uQuaternion,q.x,q.y,q.z,q.w);gl.uniform3f(uniforms.uDimensions,dimensions.x,dimensions.y,dimensions.z);
}
function tint(r,g,b,a){gl.uniform4f(uniforms.uTint,r,g,b,a);}
function drawBox(pos,q,dimensions,color){bindGeometry(cubeGeometry);gl.uniform1f(uniforms.uKind,3);setPose(pos,q,dimensions);tint(...color);gl.drawArrays(gl.TRIANGLES,0,36);}
function drawUnitMesh(pose,color=null,kind=null){const shape=unitShape(pose),mesh=unitMeshes[shape];bindGeometry(mesh.buffer);gl.uniform1f(uniforms.uKind,kind??(shape==='cube'?1:5));setPose(pose.p,pose.q);if(color)tint(...color);else if(shape!=='cube')tint(.48,.48,.48,1);gl.drawArrays(gl.TRIANGLES,0,mesh.count);}
function drawUnitFaceGuide(face){
 const points=face.vertices.map(p=>add(p,mul(face.normal,.0007))),data=[];
 for(let i=1;i<points.length-1;i++)for(const p of [points[0],points[i],points[i+1]])data.push(p.x,p.y,p.z,face.normal.x,face.normal.y,face.normal.z);
 gl.bindBuffer(gl.ARRAY_BUFFER,faceGuideGeometry);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);bindGeometry(faceGuideGeometry);gl.uniform1f(uniforms.uKind,3);setPose(V(),Q(),V(1,1,1));tint(.12,.64,.67,.4);gl.drawArrays(gl.TRIANGLES,0,data.length/6);
 drawLines(points.flatMap((p,i)=>[p,points[(i+1)%points.length]]),[.18,.67,.69,.95]);
}
function drawRing(pos,radius,alpha,color=[.12,.36,.36]){bindGeometry(ringGeometry);gl.uniform1f(uniforms.uKind,3);setPose(pos,Q(),V(radius,1,radius));tint(...color,alpha);gl.drawArrays(gl.LINES,0,96);}
function drawLines(points,color){
 if(!points.length)return;const data=[];for(const p of points)data.push(p.x,p.y,p.z,0,1,0);
 gl.bindBuffer(gl.ARRAY_BUFFER,lineGeometry);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);bindGeometry(lineGeometry);
 gl.uniform1f(uniforms.uKind,3);setPose(V(),Q(),V(1,1,1));tint(...color);gl.drawArrays(gl.LINES,0,points.length);
}
function drawGuides(){
 gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
 for(const g of groups)if(g.pin){const p=g.pin.point,breath=.5+.5*Math.sin(simTime*1.4);
  drawRing(add(p,V(0,.006,0)),.065+breath*.004,.35+breath*.2);
  drawBox(add(p,V(0,.08,0)),Q(),V(.0025,.145,.0025),[.12,.36,.36,.3+breath*.18]);
 }
 if(snap){const f=snap.face;if(f.vertices)drawUnitFaceGuide(f);else{const dims=f.dimensions?mul(f.dimensions,.985):V(.087,.087,.087);dims[['x','y','z'][f.axis]]=.001;
  drawBox(f.p,f.q,dims,[.12,.64,.67,.58]);drawOutline(f.p,f.q,dims,.95,true);}
 }
 if(held&&ctrlDown()){
  const g=held.g,delta=Math.max(...(held.items||[held]).map(item=>landingProjection(item.g).delta));
  const projection={delta,position:add(g.body.position,V(0,delta+.002,0))},ghostBounds=bounds(g,projection.position),base=ghostBounds.center;base.y=ghostBounds.min.y+.003;
  if(settings.guide==='ghost')for(const item of held.items||[held])for(const p of poses(item.g,add(item.g.body.position,V(0,projection.delta+.002,0))))drawUnitMesh(p,[.14,.3,.31,.18],4);
  if(settings.guide==='dot')drawBox(base,Q(),V(.012,.001,.012),[.1,.3,.31,.55]);
  if(settings.guide==='x'){const r=.025;drawLines([add(base,V(-r,0,-r)),add(base,V(r,0,r)),add(base,V(-r,0,r)),add(base,V(r,0,-r))],[.1,.3,.31,.55]);}
  if(settings.line!=='none'){
   const top=held.g.body.position,low=V(top.x,ghostBounds.max.y+.004,top.z),points=[];
   if(settings.line==='solid')points.push(low,top);
   else for(let y=low.y-(simTime*.12%.045);y<top.y;y+=.045){const a=Math.max(low.y,y),b=Math.min(top.y,y+.022);if(b>a)points.push(V(top.x,a,top.z),V(top.x,b,top.z));}
   drawLines(points,[.16,.4,.4,.42]);
  }
 }
 gl.depthMask(true);gl.disable(gl.BLEND);
}
function drawQubits(){
 bindGeometry(shadowGeometry);gl.uniform1f(uniforms.uKind,2);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
 for(const g of groups)for(const p of poses(g)){
  const height=Math.max(0,p.p.y-HALF),scale=.23+Math.min(height,2)*.18;
  setPose(V(p.p.x,.001,p.p.z),Q(),V(scale,scale,scale));gl.uniform1f(uniforms.uScale,scale);gl.uniform1f(uniforms.uShadow,.22/(1+height*3));gl.drawArrays(gl.TRIANGLES,0,6);
 }
 gl.depthMask(true);gl.disable(gl.BLEND);
 for(const g of groups){if(g.block){const p=moodVisualPose(g,blockPose(g));bindGeometry(cubeGeometry);gl.uniform1f(uniforms.uKind,1);setPose(p.p,p.q,p.size);gl.drawArrays(gl.TRIANGLES,0,36);}else for(const p of poses(g))drawUnitMesh(g.parts.length===1?{...moodVisualPose(g,p),part:p.part}:p);}
 drawCargos();drawPuzzle();drawAlpha();drawStructureOutlines();drawGuides();drawTaskGuides();
}
addQubit([position[0]-Math.sin(yaw)*1.25,HALF+.003,position[2]-Math.cos(yaw)*1.25]);


function formatWeight(n){return Number(n.toFixed(2)).toLocaleString('es-CL');}
// A regular block has every exterior grid cell filled. Interior voids (26/27)
// are allowed; irregular/open silhouettes never get an invented bounding box.
function analyzeBlock(g){
 if(g.parts.some(isTBit))return null;
 const bb=bounds(g,V(),Q()),counts=['x','y','z'].map(k=>Math.round(bb.size[k]/CUBE_SIZE));
 if(counts.some(n=>n<1)||['x','y','z'].some((k,i)=>Math.abs(bb.size[k]-counts[i]*CUBE_SIZE)>.001))return null;
 const [nx,ny,nz]=counts,outer=nx*ny*nz-Math.max(0,nx-2)*Math.max(0,ny-2)*Math.max(0,nz-2);
 if(outer>g.parts.length)return null;
 const cells=new Set();
 for(const p of g.parts){
  for(const axis of axes){const a=p.q.vmult(axis);if(Math.max(Math.abs(a.x),Math.abs(a.y),Math.abs(a.z))<.9999)return null;}
  const cell=['x','y','z'].map(k=>(p.offset[k]-bb.min[k]-HALF)/CUBE_SIZE);
  if(cell.some(v=>Math.abs(v-Math.round(v))>.01))return null;
  const key=cell.map(Math.round).join(',');if(cells.has(key))return null;cells.add(key);
 }
 for(let x=0;x<nx;x++)for(let y=0;y<ny;y++)for(let z=0;z<nz;z++)if(x===0||y===0||z===0||x===nx-1||y===ny-1||z===nz-1){if(!cells.has(x+','+y+','+z))return null;}
 return {center:bb.center,size:bb.size,counts,isCube:nx===ny&&ny===nz};
}
function blockPose(g){return {p:add(g.body.position,g.body.quaternion.vmult(g.block.center)),q:g.body.quaternion,size:g.block.size};}
function sameBlockShape(a,b){if(!a.block||!b.block)return false;const x=Object.values(a.block.size).sort((a,b)=>a-b),y=Object.values(b.block.size).sort((a,b)=>a-b);return x.every((v,i)=>Math.abs(v-y[i])<.001);}
function findBlockSnap(source,target){
 const targetPose=blockPose(target),sourcePose=blockPose(source),limit=clamp(Math.min(...Object.values(target.block.size))*.6,.055,.14);
 let best=null;
 for(const o of orientations){
  const q=target.body.quaternion.mult(o),localBB=bounds(source,V(),o),size=localBB.size;
  if(['x','y','z'].some(k=>Math.abs(size[k]-target.block.size[k])>.001))continue;
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
   const k=['x','y','z'][axis],normal=targetPose.q.vmult(mul(axes[axis],sign));
   const center=add(targetPose.p,mul(normal,(target.block.size[k]+size[k])/2));
   const distance=center.distanceTo(sourcePose.p);if(distance>limit)continue;
   const position=sub(center,q.vmult(source.block.center));if(!validPose(source,position,q))continue;
   const score=distance+(1-qSimilarity(q,source.body.quaternion))*.025;if(best&&score>=best.score)continue;
   best={source,target,position,quaternion:q,score,wholeFace:true,face:{p:add(targetPose.p,mul(normal,target.block.size[k]/2+.001)),normal,q:targetPose.q,axis,dimensions:target.block.size}};
  }
 }return best;
}
function cameraBasis(){return {forward:direction(),right:V(Math.cos(yaw),0,-Math.sin(yaw)),up:V(Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),Math.cos(yaw)*Math.sin(pitch))};}
function screenRay(x,y){const b=cameraBasis(),w=canvas.clientWidth,h=canvas.clientHeight,xx=(2*x/w-1)*(w/h)/1.48256097,yy=(1-2*y/h)/1.48256097;const d=add(add(b.forward,mul(b.right,xx)),mul(b.up,yy));d.normalize();return d;}
function project(p){const b=cameraBasis(),r=sub(p,V(...camera)),depth=r.dot(b.forward);if(depth<=.04)return null;const h=canvas.clientHeight,w=canvas.clientWidth;return {x:w/2+r.dot(b.right)*1.48256097*h/2/depth,y:h/2-r.dot(b.up)*1.48256097*h/2/depth,depth};}
function screenBounds(g){
 const points=poses(g).flatMap(p=>corners(p)).map(project).filter(Boolean);if(!points.length)return null;
 return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
}
function visibleFromCamera(g){
 for(const pose of poses(g)){
  const ray=sub(pose.p,V(...camera)),distance=ray.norm();if(distance>4||distance<.01)continue;ray.normalize();const hit=aimQubit(distance+.1,ray);if(hit?.g===g)return true;
 }return false;
}
function selectRectangle(rect){
 const candidates=groups.filter(g=>{const b=screenBounds(g);return b&&b.right>=rect.left&&b.left<=rect.right&&b.bottom>=rect.top&&b.top<=rect.bottom&&visibleFromCamera(g);}).sort((a,b)=>a.body.position.distanceTo(V(...camera))-b.body.position.distanceTo(V(...camera)));
 const accepted=[];let pieces=0,weight=0;
 for(const g of candidates){const w=totalWeight(g);if(pieces+g.parts.length>settings.maxSelect)continue;accepted.push(g);pieces+=g.parts.length;weight+=w;}
 multiSelection=accepted;selected=accepted.length?{g:accepted[0],part:accepted[0].parts[0]}:null;
 const limited=candidates.length>accepted.length;
 announce(accepted.length?pieces+' Q-bits · '+formatWeight(weight)+' u'+(limited?' · selección limitada':weight>settings.maxCarry?' · supera la carga manual, puede recibir órdenes':' · clic derecho en el suelo para dar destino'):limited?'La selección supera el límite de piezas. Ajusta en P.':'Sin Q-bits visibles dentro de la selección.');return accepted;
}
function startMarquee(){
 const x=canvas.clientWidth/2,y=canvas.clientHeight/2;marquee={x0:x,y0:y,x,y};keys.delete('KeyW');keys.delete('KeyA');keys.delete('KeyS');keys.delete('KeyD');selectionRect.hidden=false;updateMarquee({movementX:0,movementY:0});
}
function updateMarquee(event){
 if(!marquee)return;
 marquee.x=clamp(marquee.x+(event.movementX||0),0,canvas.clientWidth);marquee.y=clamp(marquee.y+(event.movementY||0),0,canvas.clientHeight);
 Object.assign(selectionRect.style,{left:Math.min(marquee.x0,marquee.x)+'px',top:Math.min(marquee.y0,marquee.y)+'px',width:Math.abs(marquee.x-marquee.x0)+'px',height:Math.abs(marquee.y-marquee.y0)+'px'});
}
function finishMarquee(cancel=false){if(!marquee)return;const m=marquee;marquee=null;selectionRect.hidden=true;if(!cancel&&Math.hypot(m.x-m.x0,m.y-m.y0)>=6)selectRectangle({left:Math.min(m.x0,m.x),right:Math.max(m.x0,m.x),top:Math.min(m.y0,m.y),bottom:Math.max(m.y0,m.y)});}
function openDetachMenu(hit){
 if(!hit||!groups.includes(hit.g))return;
 if(hit.g.parts.length===1){announce('Este '+unitLabel(hit.part)+' ya es una pieza independiente.');return;}
 closeCommandMenu(false);detachChoice={g:hit.g,part:hit.part};selected=hit;pause();stopRoute(hit.g);panel.hidden=true;
 const projected=project(partPose(hit.g,hit.part).p)||{x:canvas.clientWidth/2,y:canvas.clientHeight/2};
 const right=projected.x<canvas.clientWidth/2;
 menu.style.left=clamp(projected.x+(right?30:-218),12,Math.max(12,canvas.clientWidth-214))+'px';menu.style.top=clamp(projected.y-30,12,Math.max(12,canvas.clientHeight-160))+'px';
 menu.style.transformOrigin=right?'left center':'right center';document.querySelector('#detach-title').textContent=hit.g.parts.length+' '+groupUnitLabel(hit.g)+' · '+formatWeight(totalWeight(hit.g))+' u';
 connectMenu(menu,partPose(hit.g,hit.part).p);
}
function closeDetachMenu(resume=false){menu.hidden=true;detachChoice=null;if(menuConnector?.element===menu){menuConnector=null;document.querySelector('#menu-link').style.opacity='0';}if(resume)captureMouse();}
function applyDetachMenu(all){const choice=detachChoice;closeDetachMenu(false);if(choice&&groups.includes(choice.g))detachPart(choice,all);captureMouse();}
document.querySelector('#detach-one').addEventListener('click',()=>applyDetachMenu(false));
document.querySelector('#detach-all').addEventListener('click',()=>applyDetachMenu(true));
document.querySelector('#detach-cancel').addEventListener('click',()=>closeDetachMenu(true));
canvas.addEventListener('mousemove',event=>{if(document.pointerLockElement!==canvas){const rect=canvas.getBoundingClientRect();hoverPointer={x:event.clientX-rect.left,y:event.clientY-rect.top};}});
canvas.addEventListener('mouseleave',()=>hoverPointer=null);
function duplicateSelection(){
 if(puzzleBlockedEdit())return;
 const hit=aimQubit()||selected;if(!hit){announce('Selecciona una figura para duplicarla con V.');return;}
 const originals=multiSelection.includes(hit.g)&&multiSelection.length>1?multiSelection.filter(g=>groups.includes(g)):[hit.g];
 const count=originals.reduce((n,g)=>n+g.parts.length,0),population=groups.reduce((n,g)=>n+g.parts.length,0);
 if(count+population>MAX_QUBITS){announce('No caben más copias: límite de '+MAX_QUBITS+' piezas.');return;}
 const originalParts=originals.map(g=>worldParts(g));const pts=originalParts.flat(),min=V(Infinity,Infinity,Infinity),max=V(-Infinity,-Infinity,-Infinity);
 for(const group of originals){const b=bounds(group);for(const k of ['x','y','z']){min[k]=Math.min(min[k],b.min[k]);max[k]=Math.max(max[k],b.max[k]);}}
 const center=mul(add(min,max),.5),spacing=Math.max(max.x-min.x,max.z-min.z)+.14;
 for(let row=0;row<5;row++)for(const col of [0,1,-1,2,-2]){
  const dest=V(position[0]-Math.sin(yaw)*(1.2+row*spacing)+Math.cos(yaw)*col*spacing,center.y-min.y+.003,position[2]-Math.cos(yaw)*(1.2+row*spacing)-Math.sin(yaw)*col*spacing),delta=sub(dest,center);
  const copies=originalParts.map(parts=>parts.map(p=>({...p,p:add(p.p,delta)})));
  const all=copies.flat();if(all.some(p=>corners(p).some(v=>v.y<0||v.y>ROOM_HEIGHT||Math.max(Math.abs(v.x),Math.abs(v.z))>13.99)))continue;
  if(groups.some(g=>poses(g).some(o=>all.some(p=>obbOverlap(p,o,-.005)))))continue;
  const made=copies.map((parts,i)=>makeGroup(parts.map(p=>({...p,id:++serial,mood:null})),originals[i].body.quaternion));
  multiSelection=made;selected={g:made[0],part:made[0].parts[0]};announce('Duplicado · '+count+' '+groupUnitLabel({parts:made.flatMap(g=>g.parts)}));return made;
 }announce('No hay espacio libre delante para la copia.');
}
const callout=document.querySelector('#callout'),calloutPath=document.querySelector('#callout-path'),calloutText=document.querySelector('#callout-text');
let calloutState={g:null,since:0,nextLayout:0,side:1,dy:-34};
function placeCallout(g,anchor){
 const w=canvas.clientWidth,h=canvas.clientHeight,occupied=groups.filter(o=>o!==g).map(screenBounds).filter(Boolean);let chosen=null;
 for(const side of [-1,1])for(const dy of [-34,34,-64,64]){
  const endX=clamp(anchor.x+side*128,18,w-18),y=clamp(anchor.y+dy,25,h-115),left=side>0?endX+8:endX-164,right=left+156;
  let score=(left<12||right>w-12)?10000:0;
  for(const r of occupied){const ox=Math.max(0,Math.min(right,r.right+8)-Math.max(left,r.left-8)),oy=Math.max(0,Math.min(y+90,r.bottom+8)-Math.max(y-5,r.top-8));score+=ox*oy;}
  score+=Math.abs(dy)*.1;if(!chosen||score<chosen.score)chosen={side,dy,score};
 }
 return chosen;
}
function updateCallout(){
 const info=panel.hidden&&menu.hidden&&commandMenu.hidden&&!marquee?(held||aimQubit(8,document.pointerLockElement===canvas?direction():hoverPointer?screenRay(hoverPointer.x,hoverPointer.y):V(0,1,0))):null;
 updateMoodCallout(info);
 if(!info||!groups.includes(info.g)){callout.style.opacity='0';calloutState.g=null;return;}
 const g=info.g,box=screenBounds(g);if(!box){callout.style.opacity='0';return;}
 const anchor={x:clamp((box.left+box.right)/2,16,canvas.clientWidth-16),y:clamp(box.top-6,16,canvas.clientHeight-30)};
 if(calloutState.g!==g){calloutState={g,since:simTime,nextLayout:0,side:1,dy:-34};}
 if(simTime>=calloutState.nextLayout){Object.assign(calloutState,placeCallout(g,anchor));calloutState.nextLayout=simTime+.35;}
 const {side,dy}=calloutState,w=canvas.clientWidth,h=canvas.clientHeight;
 const textX=clamp(anchor.x+side*128+(side>0?8:-164),12,Math.max(12,w-168)),y=clamp(anchor.y+dy,25,h-115),endX=side>0?textX-8:textX+164;
 const elbow={x:anchor.x+side*22,y},end={x:endX,y};
 const d1=Math.hypot(elbow.x-anchor.x,elbow.y-anchor.y),d2=Math.abs(end.x-elbow.x),progress=clamp((simTime-calloutState.since)/.26,0,1),length=(d1+d2)*(1-(1-progress)**3);
 let path='M '+anchor.x+' '+anchor.y;
 if(length<d1){const f=length/d1;path+=' L '+(anchor.x+(elbow.x-anchor.x)*f)+' '+(anchor.y+(elbow.y-anchor.y)*f);}
 else path+=' L '+elbow.x+' '+elbow.y+' L '+(elbow.x+(end.x-elbow.x)*clamp((length-d1)/Math.max(.001,d2),0,1))+' '+y;
 calloutPath.setAttribute('d',path);calloutText.style.left=textX+'px';calloutText.style.top=(y-7)+'px';calloutText.style.opacity=String(clamp((progress-.8)/.2,0,1));
 document.querySelector('#callout-count').textContent=g.parts.length+' '+groupUnitLabel(g);
 document.querySelector('#callout-weight').textContent='Peso '+formatWeight(totalWeight(g))+' u';callout.style.opacity='1';
}
// Stronger outer edges for regular blocks; never draw a box around an L-shape.
const edgeData=[];
for(let axis=0;axis<3;axis++)for(const a of [-.5,.5])for(const b of [-.5,.5]){
 for(const end of [-.5,.5]){const xyz=[0,0,0];xyz[axis]=end;xyz[(axis+1)%3]=a;xyz[(axis+2)%3]=b;edgeData.push(...xyz,0,1,0);}
}
const edgeGeometry=buffer(edgeData);
function drawOutline(p,q,size,alpha=.85,selectedOutline=false){
 bindGeometry(edgeGeometry);gl.uniform1f(uniforms.uKind,3);setPose(p,q,add(size,V(.0009,.0009,.0009)));tint(selectedOutline ? .38 : .48,selectedOutline ? .56 : .51,selectedOutline ? .57 : .54,alpha);gl.drawArrays(gl.LINES,0,24);
}
function drawUnitOutline(pose,alpha=.7,selectedOutline=true){
 if(!isTBit(pose)){drawOutline(pose.p,pose.q,V(CUBE_SIZE,CUBE_SIZE,CUBE_SIZE),alpha,selectedOutline);return;}
 const mesh=unitMeshes[unitShape(pose)];bindGeometry(mesh.edgeBuffer);gl.uniform1f(uniforms.uKind,3);setPose(pose.p,pose.q,V(CUBE_SIZE+.0006,CUBE_SIZE+.0006,CUBE_SIZE+.0006));tint(selectedOutline?.38:.48,selectedOutline?.56:.51,selectedOutline?.57:.54,alpha);gl.drawArrays(gl.LINES,0,mesh.edgeCount);
}
function drawStructureOutlines(){
 gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
 for(const g of groups){const chosen=multiSelection.includes(g);
  if(g.block){const p=moodVisualPose(g,blockPose(g));drawOutline(p.p,p.q,p.size,.88,chosen);}
  else if(chosen)for(const pose of poses(g))drawUnitOutline(pose,.7,true);
 }
 gl.depthMask(true);gl.disable(gl.BLEND);
}
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas)finishMarquee(true);});


// Ground cargo: always cubic, never hand-grabbable. Quorum is counted in
// participating Q-bit pieces; payload size and required crew are independent.
function cargoBounds(c,p=c.body.position){if(c.dimensions){const h=mul(c.dimensions,.5);return {min:sub(p,h),max:add(p,h),center:p.clone(),size:c.dimensions.clone()};}const r=c.size/2;return {min:V(p.x-r,p.y-r,p.z-r),max:V(p.x+r,p.y+r,p.z+r),center:p.clone(),size:V(c.size,c.size,c.size)};}
function cargoPose(c){return {p:c.body.position,q:c.body.quaternion,half:c.dimensions?mul(c.dimensions,.5):V(c.size/2,c.size/2,c.size/2)};}
function navigationObstacles(g){return groups.filter(o=>o!==g).map(o=>bounds(o)).concat(cargos.map(c=>cargoBounds(c)),puzzleObstacleBounds(),alphaObstacles());}
function raycastCargo(max=8,dir=direction()){
 let result=null,best=puzzleRayLimit(max,dir);for(const c of cargos){if(c.intake!==undefined&&c.intake!==null)continue;const hit=rayPart(V(...camera),dir,cargoPose(c),best,c.size/2);if(hit&&hit.distance<best){best=hit.distance;result={...hit,cargo:c};}}return result;
}
function aimCargo(max=8,dir=direction()){const c=raycastCargo(max,dir);if(!c)return null;const q=aimQubit(c.distance,dir);return q?null:c;}
function newCargo(p,side=settings.cargoSide,required=settings.cargoRequired,color=settings.cargoColor){
 if(!Number.isInteger(side)||side<1||side>12||!Number.isInteger(required)||required<1||required>MAX_QUBITS||!/^#[0-9a-f]{6}$/i.test(color))return null;
 if(cargos.length>=12)return null;const size=side*CUBE_SIZE;
 const body=new CANNON.Body({mass:0});body.addShape(new CANNON.Box(V(size/2,size/2,size/2)));body.position.set(p.x,size/2,p.z);body.material=haulMaterial;body.fixedRotation=true;body.linearDamping=.08;body.updateMassProperties();world.addBody(body);
 const c={id:++cargoSerial,side,size,required,color,body,job:null,pin:null,lastStatus:'En reposo'};body.cargoRef=c;cargos.push(c);return c;
}
function cargoPlacementClear(p,size,exclude=null,ignored=[]){
 const half=size/2;if(Math.abs(p.x)+half>13.98||Math.abs(p.z)+half>13.98)return false;
 const candidate={p:V(p.x,half,p.z),q:Q(),half:V(half,half,half)};
 if(alphaObstacles().some(w=>obbOverlap(candidate,w,-.004)))return false;
 if(puzzleObstacleBounds(exclude).some(w=>obbOverlap(candidate,{p:w.p,q:Q(),half:w.half},-.004)))return false;
 if(cargos.some(c=>c!==exclude&&obbOverlap(candidate,cargoPose(c),-.004)))return false;
 return !groups.some(g=>!ignored.includes(g)&&poses(g).some(pose=>obbOverlap(candidate,pose,-.004)));
}
function spawnCargo(){
 if(puzzleBlockedEdit())return;
 if(cargos.length>=12){announce('Límite de 12 cuerpos en la sala.');return null;}
 const size=settings.cargoSide*CUBE_SIZE,gap=size+.24;
 for(let row=0;row<5;row++)for(const col of [0,1,-1,2,-2]){
  const p=V(position[0]-Math.sin(yaw)*(1.6+row*gap)+Math.cos(yaw)*col*gap,0,position[2]-Math.cos(yaw)*(1.6+row*gap)-Math.sin(yaw)*col*gap);
  if(!cargoPlacementClear(p,size))continue;
  const c=newCargo(p);if(c){selectedCargo=c;announce('Cuerpo creado · '+c.side+' × '+c.side+' × '+c.side+' · requiere '+c.required+' Q-bits');updateCargoPanel();}return c;
 }announce('No hay espacio libre delante.');return null;
}
function setCargoMoving(c,moving){
 const type=moving?CANNON.Body.DYNAMIC:CANNON.Body.STATIC;
 if(c.body.type===type)return;
 c.body.type=type;c.body.mass=moving?c.required*.25:0;c.body.velocity.set(0,0,0);c.body.angularVelocity.set(0,0,0);c.body.force.set(0,0,0);c.body.updateMassProperties();c.body.wakeUp();
}
function leaveHaul(g){
 const job=g.haulJob;if(!job)return;for(const slot of job.slots)if(slot.g===g){cancelNavigation(slot);slot.approachSearch=null;}job.slots=job.slots.filter(s=>s.g!==g);g.haulJob=null;g.body.material=g.haulMaterialRestore||null;g.body.fixedRotation=false;g.body.updateMassProperties();g.body.wakeUp();
 if(job.cargo.job===job){job.activeCount=Math.min(job.activeCount,job.slots.reduce((n,s)=>n+s.g.parts.length,0));if(job.activeCount<job.cargo.required)setCargoMoving(job.cargo,false);}
}
function stopHaul(c,status='Detenido'){
 cancelNavigation(c);c.pathSearch=null;const job=c.job;if(job){cancelNavigation(job);job.pathSearch=null;for(const slot of job.slots){cancelNavigation(slot);slot.approachSearch=null;}}
 if(job&&status==='Destino alcanzado'){for(const slot of job.slots)if(queueSpeech(slot.g,'happy',{kind:'delivered'}))break;}if(job)for(const slot of [...job.slots]){stopRoute(slot.g);leaveHaul(slot.g);}c.job=null;c.lastStatus=status;setCargoMoving(c,false);return job;
}
function deleteCargo(c,internal=false){if(!internal&&puzzleBlockedEdit())return;if(!c||!cargos.includes(c))return;stopHaul(c);world.removeBody(c.body);cargos.splice(cargos.indexOf(c),1);if(selectedCargo===c)selectedCargo=null;if(pendingCargo?.cargo===c)pendingCargo=null;announce('Cuerpo borrado');}
function selectedTeam(){return [...new Set((multiSelection.length?multiSelection:selected?[selected.g]:[]).filter(g=>groups.includes(g)))];}
function floorAim(d=direction()){if(d.y>=-.015)return null;const t=-camera[1]/d.y;if(t>40||puzzleRayLimit(t,d)<t-.01)return null;const p=add(V(...camera),mul(d,t));return Math.max(Math.abs(p.x),Math.abs(p.z))<=13.95?p:null;}
function* planCargoPath(c,goal,crew=[]){
 yield;
 if(!cargoPlacementClear(goal,c.size,c,crew))return null;
 const origin=c.body.position.clone(),step=.18,obstacles=cargos.filter(o=>o!==c).map(c=>cargoBounds(c)).concat(groups.filter(g=>!crew.includes(g)).map(g=>bounds(g)),puzzleObstacleBounds(c),alphaObstacles());
 const box=(x,z)=>cargoBounds(c,V(x,c.size/2,z));
 const clear=(a,b)=>sweepClear(box(a.x,a.z),box(b.x,b.z),c.size,obstacles);
 if(clear(origin,goal))return [V(goal.x,0,goal.z)];
 const heap=new MinHeap(),costs=new Map();const h=(x,z)=>Math.hypot(origin.x+x*step-goal.x,origin.z+z*step-goal.z);
 const root={x:0,z:0,g:0,h:h(0,0),parent:null};root.f=root.h;heap.push(root);costs.set('0,0',0);let found=null,expanded=0;
 while(heap.items.length&&expanded++<(c.workerProxy?2500:18000)){if((expanded&15)===0)yield;const n=heap.pop(),key=n.x+','+n.z;if(n.g>(costs.get(key)??Infinity)+1e-8)continue;
  const from=V(origin.x+n.x*step,0,origin.z+n.z*step);if(from.distanceTo(V(goal.x,0,goal.z))<step*1.5&&clear(from,goal)){found=n;break;}
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
   const x=n.x+dx,z=n.z+dz,to=V(origin.x+x*step,0,origin.z+z*step),cost=n.g+Math.hypot(dx,dz)*step,k=x+','+z;
   if(cost>=(costs.get(k)??Infinity)-1e-8||!clear(from,to))continue;const distance=h(x,z);costs.set(k,cost);heap.push({x,z,g:cost,h:distance,f:cost+distance,parent:n});
  }
 }
 if(!found)return null;const points=[V(goal.x,0,goal.z)];let rebuilt=0;for(let n=found;n.parent;n=n.parent){points.push(V(origin.x+n.x*step,0,origin.z+n.z*step));if((++rebuilt&31)===0)yield;}points.reverse();
 const simplified=[];let from=V(origin.x,0,origin.z),index=0,checks=0;while(index<points.length){let last=index;for(let j=index+1;j<points.length;j++){if((++checks&15)===0)yield;if(clear(from,points[j]))last=j;else break;}simplified.push(points[last]);from=points[last];index=last+1;}return simplified;
}
function crewSlotCandidates(c,crew){
 const width=Math.max(.09,...crew.map(g=>{const b=bounds(g);return Math.max(b.size.x,b.size.z);})),spacing=width+.025,candidates=[];
 const directionToGoal=c.job?sub(c.job.goal,c.body.position):V(1,0,0);directionToGoal.y=0;directionToGoal.normalize();
 const normals=[V(1,0,0),V(-1,0,0),V(0,0,1),V(0,0,-1)].sort((a,b)=>b.dot(directionToGoal)-a.dot(directionToGoal));
 for(let ring=0;ring<7;ring++)for(const normal of normals){
  const lateral=V(-normal.z,0,normal.x),span=c.size+ring*spacing*2,count=Math.max(1,Math.floor(span/spacing)),out=c.size/2+width/2+.025+ring*spacing;
  for(let k=0;k<count;k++)candidates.push(add(mul(normal,out),mul(lateral,(k-(count-1)/2)*spacing)));
 }return candidates;
}
function assignCrew(c,team){
 const job=c.job;if(!job)return 0;let added=0;const all=[...new Set(job.slots.map(s=>s.g).concat(team))],slots=crewSlotCandidates(c,all);
 for(const g of team){if(job.slots.some(s=>s.g===g)||!groups.includes(g))continue;
  if(held&&(held.items||[held]).some(i=>i.g===g))continue;
  const bb=bounds(g);if(bb.min.y>.04)continue;
  const q=orientations[orientationIndex(g.body.quaternion)],local=bounds(g,V(),q);
  let best=null,bestCost=Infinity;
  for(const offset of slots){
   if(job.slots.some(s=>s.offset.distanceTo(offset)<Math.max(bb.size.x,bb.size.z)+.018))continue;
   const point=add(c.body.position,offset),cost=g.body.position.distanceTo(point)+offset.norm()*4;
   if(cost>=bestCost)continue;
   const p=V(point.x-local.center.x,-local.min.y,point.z-local.center.z);
   if(!validPose(g,p,q,all))continue;
   bestCost=cost;best={offset,point};
  }
  if(!best)continue;leaveHaul(g);stopRoute(g);g.haulJob=job;g.haulMaterialRestore=g.body.material;g.body.material=haulMaterial;g.body.fixedRotation=false;g.body.updateMassProperties();
  job.slots.push({g,offset:best.offset,ready:false,nextPlan:simTime,routeFailures:0});added++;
 }
 return added;
}
function beginHaul(c,team,goal){
 if(!cargos.includes(c)||c.intake!==undefined&&c.intake!==null)return false;team=[...new Set(team.filter(g=>groups.includes(g)))];if(!team.length){announce('Selecciona primero los Q-bits que trabajarán.');return false;}
 stopHaul(c);const job={cargo:c,goal:goal.clone(),path:[],index:0,slots:[],activeCount:0,nextCrewPlan:0,phase:'planning',lastProgress:simTime,lastPosition:c.body.position.clone(),nextRouteCheck:0};c.job=job;c.pin={point:V(goal.x,0,goal.z),arrived:false};assignCrew(c,team);
 if(!job.slots.length){stopHaul(c,'Sin espacio para el equipo');announce('No hay espacio accesible para colocar el equipo.');return false;}
 c.lastStatus='Calculando recorrido';
 const search=scheduleNavigation(c,planCargoPath(c,job.goal,job.slots.map(s=>s.g)),path=>{
  c.pathSearch=null;
  if(!path||!job.slots.length){stopHaul(c,path?'Sin equipo':'Camino bloqueado');announce(path?'Selecciona de nuevo el equipo.':'El cuerpo no tiene un camino libre hasta ese punto.');return;}
  job.path=path;job.index=0;job.phase='reuniendo';job.nextRouteCheck=simTime+.5;
  for(const slot of job.slots)if(queueSpeech(slot.g,'order'))break;
  announce('Equipo asignado · '+job.slots.reduce((n,s)=>n+s.g.parts.length,0)+' / '+c.required+' Q-bits');
 },()=>cargos.includes(c)&&c.job===job&&c.pathSearch===search);
 c.pathSearch=search;announce('Calculando recorrido del equipo…');return true;
}
function addCrew(c,team){if(!c.job)return false;const count=assignCrew(c,team);announce(count?'Equipo ampliado':'No se encontraron posiciones libres para sumar esos Q-bits.');return count>0;}
function haulSpeed(c){return settings.haulSpeed*Math.min(1.8,Math.sqrt(Math.max(1,c.job?.activeCount||0)/c.required))*crewMoodSpeed(c);}
function updateHauling(dt){
 for(const c of cargos){const job=c.job;if(!job)continue;
  job.slots=job.slots.filter(s=>{if(groups.includes(s.g)&&s.g.haulJob===job)return true;cancelNavigation(s);s.approachSearch=null;return false;});
  if(!job.slots.length){stopHaul(c,'Sin equipo');continue;}
  if(c.pathSearch){setCargoMoving(c,false);continue;}
  let active=0;const crewBounds=new Map(job.slots.map(s=>[s.g,bounds(s.g)]));
  if(job.phase==='reuniendo'&&simTime>=(job.nextRematch||0)){
   job.nextRematch=simTime+1.5;
   // Exchange equally sized work positions to prevent opposing queues.
   const choices=[];
   for(let i=0;i<job.slots.length;i++)for(let j=0;j<job.slots.length;j++){
    const a=crewBounds.get(job.slots[i].g),b=crewBounds.get(job.slots[j].g);
    if(Math.abs(a.size.x-b.size.x)+Math.abs(a.size.z-b.size.z)>.008)continue;
    const target=add(c.body.position,job.slots[j].offset);
    choices.push({i,j,cost:Math.hypot(a.center.x-target.x,a.center.z-target.z)});
   }
   choices.sort((a,b)=>a.cost-b.cost);const workers=new Set(),places=new Set(),offsets=job.slots.map(s=>s.offset);
   for(const choice of choices){if(workers.has(choice.i)||places.has(choice.j))continue;
    const slot=job.slots[choice.i];workers.add(choice.i);places.add(choice.j);
    if(slot.offset.distanceTo(offsets[choice.j])>.001){cancelNavigation(slot);slot.approachSearch=null;slot.offset=offsets[choice.j];slot.approachPath=null;slot.nextPlan=simTime;slot.lastDistance=Infinity;}
   }
  }

  for(const slot of job.slots){const g=slot.g,b=g.body,bb=crewBounds.get(g),target=add(c.body.position,slot.offset),error=V(target.x-bb.center.x,0,target.z-bb.center.z),distance=error.norm();
   if(g.route)stopRoute(g);
   if(!groupWilling(g)){slot.ready=false;b.velocity.x*=Math.exp(-12*dt);b.velocity.z*=Math.exp(-12*dt);continue;}
   if(!b.fixedRotation){b.fixedRotation=true;b.updateMassProperties();}
   const crew=job.slots.map(s=>s.g);
   if(distance>.2&&!slot.approachSearch&&simTime>=slot.nextPlan&&simTime>=job.nextCrewPlan){
    job.nextCrewPlan=simTime+.035;slot.nextPlan=simTime+2;
    if(!slot.approachPath||(slot.lastDistance??Infinity)-distance<.025){
     const proxy={body:b,size:Math.max(bb.size.x,bb.size.z)+.04,workerProxy:true},plannedTarget=target.clone(),plannedStart=b.position.clone();
     const search=scheduleNavigation(slot,planCargoPath(proxy,V(target.x,0,target.z),crew),path=>{
      slot.approachSearch=null;
      if(b.position.distanceTo(plannedStart)>.2||add(c.body.position,slot.offset).distanceTo(plannedTarget)>.12){slot.nextPlan=simTime;return;}
      slot.approachPath=path;slot.approachIndex=0;
     },()=>cargos.includes(c)&&c.job===job&&groups.includes(g)&&g.haulJob===job&&job.slots.includes(slot)&&slot.approachSearch===search);
     slot.approachSearch=search;
    }
    slot.lastDistance=distance;
   }
   let steer=error;
   if(slot.approachPath?.length){
    while(slot.approachIndex<slot.approachPath.length-1&&Math.hypot(slot.approachPath[slot.approachIndex].x-bb.center.x,slot.approachPath[slot.approachIndex].z-bb.center.z)<.025)slot.approachIndex++;
    const waypoint=slot.approachPath[slot.approachIndex];
    steer=V(waypoint.x-bb.center.x,0,waypoint.z-bb.center.z);
    if(slot.approachIndex===slot.approachPath.length-1)steer=error;
   }
   if(slot.approachPath||distance<.2){
    b.wakeUp();const length=steer.norm(),desired=length>.001?mul(steer,Math.min(.38*moodSpeed(g),length*4)/length):V();desired.vadd(V(c.body.velocity.x,0,c.body.velocity.z),desired);
    const force=mul(sub(desired,V(b.velocity.x,0,b.velocity.z)),b.mass*14);
    for(const other of job.slots){if(other===slot)continue;const away=sub(b.position,other.g.body.position);away.y=0;const gap=away.norm();
     const safe=(Math.max(bb.size.x,bb.size.z)+Math.max(crewBounds.get(other.g).size.x,crewBounds.get(other.g).size.z))/2+.012;
     if(gap>.001&&gap<safe)force.vadd(mul(away,b.mass*18*(safe-gap)/gap),force);
    }
    const limit=g.parts.length*5,magnitude=force.norm();if(magnitude>limit)force.scale(limit/magnitude,force);b.force.vadd(force,b.force);
   }
   slot.ready=!g.route&&distance<.18&&bb.min.y<.055; if(slot.ready)active+=g.parts.length;
  }
  job.activeCount=active;
  if(active<c.required){setCargoMoving(c,false);job.phase=job.slots.some(s=>!groupWilling(s.g))?'descansando':'reuniendo';job.lastProgress=simTime;continue;}
  if(job.phase==='bloqueado'&&simTime<job.nextRouteCheck){setCargoMoving(c,false);continue;}
  if(job.index>=job.path.length){c.pin.arrived=true;stopHaul(c,'Destino alcanzado');continue;}
  let target=job.path[job.index],error=V(target.x-c.body.position.x,0,target.z-c.body.position.z),distance=error.norm();
  if(distance<.035){job.index++;if(job.index>=job.path.length){c.pin.arrived=true;stopHaul(c,'Destino alcanzado');continue;}target=job.path[job.index];error=V(target.x-c.body.position.x,0,target.z-c.body.position.z);distance=error.norm();}
  if(!job.pathSearch&&simTime>=job.nextRouteCheck){
   job.nextRouteCheck=simTime+.5;const start=c.body.position.clone();
   const search=scheduleNavigation(job,planCargoPath(c,job.goal,job.slots.map(s=>s.g)),remaining=>{
    job.pathSearch=null;
    if(c.body.position.distanceTo(start)>.2){job.nextRouteCheck=simTime;return;}
    if(!remaining){setCargoMoving(c,false);job.phase='bloqueado';return;}
    job.path=remaining;job.index=0;if(job.phase==='bloqueado'){job.phase='reuniendo';job.lastProgress=simTime;job.lastPosition.copy(c.body.position);}
   },()=>cargos.includes(c)&&c.job===job&&job.pathSearch===search);
   job.pathSearch=search;
  }
  // Revalidate the next short movement against today's obstacles while a
  // background search still uses its earlier snapshot; never move through it.
  if(simTime>=(job.nextSafetyCheck||0)){
   job.nextSafetyCheck=simTime+1/30;
   const step=Math.min(.12,distance),probe=V(c.body.position.x+error.x*step/Math.max(distance,.001),0,c.body.position.z+error.z*step/Math.max(distance,.001));
   const crew=job.slots.map(s=>s.g),obstacles=cargos.filter(o=>o!==c).map(o=>cargoBounds(o)).concat(groups.filter(g=>!crew.includes(g)).map(g=>bounds(g)),puzzleObstacleBounds(c),alphaObstacles());
   job.segmentClear=sweepClear(cargoBounds(c),cargoBounds(c,V(probe.x,c.body.position.y,probe.z)),c.size,obstacles);
  }
  if(job.segmentClear===false){setCargoMoving(c,false);job.phase='bloqueado';continue;}
  setCargoMoving(c,true);job.phase='arrastrando';const speed=haulSpeed(c)*Math.min(1,distance/.12),desired=mul(error,speed/Math.max(distance,.001));
  const force=mul(sub(desired,V(c.body.velocity.x,0,c.body.velocity.z)),c.body.mass*9);
  const maxForce=active*settings.haulForce*crewMoodSpeed(c),magnitude=force.norm();if(magnitude>maxForce)force.scale(maxForce/magnitude,force);c.body.wakeUp();c.body.force.vadd(force,c.body.force);
  if(c.body.position.distanceTo(job.lastPosition)>.03){job.lastPosition.copy(c.body.position);job.lastProgress=simTime;}
  if(simTime-job.lastProgress>10){job.phase='bloqueado';setCargoMoving(c,false);}
 }
}
function updateCargoPanel(){
 if(selectedCargo&&!cargos.includes(selectedCargo))selectedCargo=null;
 document.querySelector('#cargo-editing').textContent=selectedCargo?'Cuerpo '+selectedCargo.id+' · '+selectedCargo.side+' × '+selectedCargo.side+' × '+selectedCargo.side+' · '+selectedCargo.required+' Q-bits necesarios':'Tamaño y peso se ajustan por separado. El tamaño siempre es cúbico.';
 for(const name of ['cargoSide','cargoRequired','haulSpeed','haulForce']){const input=document.querySelector('#'+name);input.value=name==='cargoRequired'&&selectedCargo?selectedCargo.required:settings[name];document.querySelector('#'+name+'Value').textContent=input.value+({cargoSide:' por lado',cargoRequired:' Q-bits',haulSpeed:' m/s',haulForce:' N / Q-bit'}[name]||'');}
 document.querySelector('#cargoColor').value=selectedCargo?.color||settings.cargoColor;
}
for(const name of ['cargoSide','cargoRequired','haulSpeed','haulForce'])document.querySelector('#'+name).addEventListener('input',e=>{
 if(name==='cargoRequired'&&puzzle.active)return;
 const value=Number(e.target.value);settings[name]=value;
 if(name==='cargoRequired'&&selectedCargo){stopHaul(selectedCargo);selectedCargo.required=Math.round(value);}updateCargoPanel();
});
document.querySelector('#cargoColor').addEventListener('input',e=>{if(puzzle.active)return;if(/^#[0-9a-f]{6}$/i.test(e.target.value)){settings.cargoColor=e.target.value;if(selectedCargo)selectedCargo.color=e.target.value;}});
document.querySelector('#create-cargo').addEventListener('click',spawnCargo);
document.querySelector('#delete-cargo').addEventListener('click',()=>{deleteCargo(selectedCargo);updateCargoPanel();});

function closeCommandMenu(resume=false){commandMenu.hidden=true;commandState=null;menuConnector=null;document.querySelector('#menu-link').style.opacity='0';if(resume)captureMouse();}
function connectMenu(element,point){
 const p=project(point)||{x:canvas.clientWidth/2,y:canvas.clientHeight/2},side=p.x<canvas.clientWidth/2?1:-1;
 element.style.left=clamp(p.x+(side>0?115:-285),16,Math.max(16,canvas.clientWidth-225))+'px';element.hidden=false;const menuHeight=element.offsetHeight||250;element.style.top=clamp(p.y-25,20,Math.max(20,canvas.clientHeight-menuHeight-20))+'px';
 element.style.transformOrigin=side>0?'left center':'right center';element.hidden=false;
 menuConnector={element,point:point.clone(),started:simTime};
}
function openCommandMenu(point,title,items){
 closeDetachMenu(false);closeCommandMenu(false);pause();panel.hidden=true;
 commandState={point:point.clone(),title,items};document.querySelector('#command-title').textContent=title;
 const list=document.querySelector('#command-actions');list.replaceChildren();
 for(const item of items){const button=document.createElement('button');button.type='button';button.textContent=item.label;button.disabled=!!item.disabled;button.addEventListener('click',()=>{closeCommandMenu(false);item.run();});list.appendChild(button);}
 connectMenu(commandMenu,point);
}
function updateMenuConnector(){
 const svg=document.querySelector('#menu-link');if(!menuConnector||menuConnector.element.hidden){svg.style.opacity='0';return;}
 const state=menuConnector,p=project(state.point)||{x:canvas.clientWidth/2,y:canvas.clientHeight/2};
 const x=parseFloat(state.element.style.left),y=parseFloat(state.element.style.top)+7,side=x>p.x?1:-1,endX=side>0?x-10:x+208;
 const elbow={x:p.x+side*22,y},a=Math.hypot(elbow.x-p.x,y-p.y),b=Math.abs(endX-elbow.x),progress=clamp((simTime-state.started)/.22,0,1),length=(a+b)*(1-(1-progress)**3);
 let path='M '+p.x+' '+p.y;if(length<a){const k=length/Math.max(a,.001);path+=' L '+(p.x+(elbow.x-p.x)*k)+' '+(p.y+(y-p.y)*k);}else path+=' L '+elbow.x+' '+y+' L '+(elbow.x+(endX-elbow.x)*clamp((length-a)/Math.max(b,.001),0,1))+' '+y;
 document.querySelector('#menu-link-path').setAttribute('d',path);svg.style.opacity='1';state.element.style.opacity=String(clamp((progress-.7)/.3,0,1));
}
// Selection is persistent for orders; a primary click clears it.
function clearSelection(){
 multiSelection=[];selected=null;selectedCargo=null;pendingCargo=null;pendingPickup=null;moveChoice=null;routeInspection=null;
 speech.nextHud=0;document.querySelector('#selection').textContent='';
}
function onCanvasMouseDown(event){
 if(radialOpen()){event.preventDefault();return;}
 if(event.button!==0&&event.button!==2)return;
 if(!storyActionAllowed())return;
 if(story.scene==='intro'&&event.button===2)return;
 event.preventDefault();speech.lastInput=simTime;
 if((held?.reward||held?.latched)){releaseQubit(shiftDown());clearSelection();return;}
 if(event.button===2){if(marquee)finishMarquee(true);handleSecondary(event);return;}
 const hadSelection=selectedTeam().length>0;
 if(!menu.hidden||!commandMenu.hidden){closeDetachMenu(false);closeCommandMenu(false);}
 if(hadSelection){clearSelection();if(document.pointerLockElement===canvas&&!aimQubit()&&!aimCargo(3))startMarquee();return;}
 if(document.pointerLockElement!==canvas)return;
 grabQubit();
}
function onCanvasMouseUp(event){
 if(radialOpen()){event.preventDefault();return;}
 if(event.button!==0||held?.reward||held?.latched)return;
 if(marquee)finishMarquee();else releaseQubit(shiftDown());
}
function takeSelection(hit){
 const team=selectedTeam();if(!team.length||!canCarry(team)){announce('La selección supera la capacidad de agarre.');return;}
 const g=team.includes(hit.g)?hit.g:team[0],part=g===hit.g?hit.part:g.parts[0];
 pendingPickup={g,part,team:[...team]};
 if(document.pointerLockElement===canvas)completePendingPickup();else captureMouse();
}
function completePendingPickup(){
 const request=pendingPickup;pendingPickup=null;if(!request||!groups.includes(request.g))return;
 const point=partPose(request.g,request.part).p,distance=point.distanceTo(V(...camera));
 if(distance>2.8){announce('Acércate a la selección para tomarla.');return;}
 multiSelection=request.team.filter(g=>groups.includes(g));
 grabQubit({g:request.g,part:request.part,point,distance});if(held)held.latched=true;
}
function openFloorOrders(point){
 const team=[...selectedTeam()],count=team.reduce((n,g)=>n+g.parts.length,0),items=[];
 if(pendingCargo){const order=pendingCargo;
  items.push({label:'Llevar carga a este punto',run:()=>{pendingCargo=null;beginHaul(order.cargo,order.team,point);captureMouse();}});
  items.push({label:'Cancelar destino de la carga',run:()=>{pendingCargo=null;captureMouse();}});
 }else if(team.length){
  items.push({label:team.length===1?'Ir a este punto':'Ir a este punto · grupo',run:()=>{if(team.length===1){leaveHaul(team[0]);startRoute(team[0],point);}else moveTeamTo(team,point);captureMouse();}});
  if(team.some(g=>g.route||g.pendingMoodOrder||g.haulJob))items.push({label:'Detener selección',run:()=>{for(const g of team){leaveHaul(g);stopRoute(g);}captureMouse();}});
  items.push({label:'Deseleccionar',run:()=>{clearSelection();captureMouse();}});
 }
 items.push({label:'Formas guardadas',run:()=>showSavedShapes(point)});
 items.push({label:'Colocar enfriador',run:()=>{createCooler(point);captureMouse();}});
 items.push({label:'Cerrar',run:()=>captureMouse()});
 openCommandMenu(point,pendingCargo?'Destino de la carga':count?count+' '+groupUnitLabel({parts:team.flatMap(g=>g.parts)}):'Suelo',items);
}
function handleSecondary(event){
 const rect=canvas.getBoundingClientRect();
 const dir=document.pointerLockElement===canvas?direction():screenRay(clamp(event.clientX-rect.left,0,canvas.clientWidth),clamp(event.clientY-rect.top,0,canvas.clientHeight));
 if(alphaSecondary(dir))return;
 const cargoHit=aimCargo(4,dir),hit=aimQubit(4,dir);
 if(cargoHit){
  selectedCargo=cargoHit.cargo;const c=selectedCargo,team=selectedTeam(),number=team.reduce((n,g)=>n+g.parts.length,0),items=[];
  if(c.source)items.push({label:'Entregar en desintegrador '+c.source.id+' · '+c.units+' unidades',disabled:!!c.job,run:()=>{sendMaterial(c,team);captureMouse();}});
  if(puzzle.active&&c.puzzleStage!==undefined){const portal=puzzle.portals[c.puzzleStage];items.push({label:'Entregar · portal '+portal.name,disabled:!number||!portalAccepts(portal,c),run:()=>{deliverSelectedCargo(c,team);captureMouse();}});}
  if(c.job)items.push({label:'Sumar selección ('+number+')',disabled:!number,run:()=>{addCrew(c,team);captureMouse();}});
  items.push({label:c.job?'Cambiar destino':'Arrastrar con selección ('+number+')',disabled:!number&&!c.job,run:()=>{pendingCargo={cargo:c,team:c.job?[...new Set(c.job.slots.map(s=>s.g).concat(team))]:[...team]};captureMouse();announce('Clic derecho en el suelo → Llevar carga a este punto.');}});
  if(c.job)items.push({label:'Detener equipo',run:()=>{stopHaul(c);captureMouse();}});
  items.push({label:'Color y peso · pruebas',run:()=>{panel.hidden=false;updatePanel();switchPanelTab('cargo');}});
  items.push({label:'Cerrar',run:()=>captureMouse()});openCommandMenu(c.body.position,'Cuerpo · '+c.required+' u · '+(c.job?.activeCount||0)+' / '+c.required,items);return;
 }
 if(hit){
  selectedCargo=null;pendingCargo=null;selected=hit;if(!multiSelection.includes(hit.g))multiSelection=[];
  if(event.altKey||altDown()){openDetachMenu(hit);return;}
  const team=selectedTeam(),count=team.reduce((n,g)=>n+g.parts.length,0);
  const items=[{label:team.length>1?'Tomar selección':'Tomar '+unitLabel(hit.part),disabled:!canCarry(team)||hit.distance>2.8,run:()=>takeSelection(hit)},
   {label:'Elegir destino en el suelo',run:()=>{captureMouse();announce('Clic derecho en el suelo → Ir a este punto.');}},
   {label:'Guardar forma',run:()=>{saveShape(hit.g);captureMouse();}},
   {label:'Nombrar '+unitLabel(hit.part),run:()=>openAlphaPanel(hit)}];
  if(hit.g.parts.length>1)items.push({label:'Separar…',run:()=>openDetachMenu(hit)});
  items.push({label:'Deseleccionar',run:()=>{clearSelection();captureMouse();}});
  items.push({label:'Cerrar',run:()=>captureMouse()});openCommandMenu(partPose(hit.g,hit.part).p,count+' '+groupUnitLabel({parts:team.flatMap(g=>g.parts)}),items);return;
 }
 const point=floorAim(dir);if(point)openFloorOrders(point);
}

function moveTeamTo(team,goal){
 team=team.filter(g=>groups.includes(g));if(!team.length)return 0;
 const spacing=Math.max(.32,...team.map(g=>{const b=bounds(g);return Math.max(b.size.x,b.size.z)*Math.SQRT2+.16;}));
 const targets=[],columns=Math.ceil(Math.sqrt(team.length)),rows=Math.ceil(team.length/columns);let started=0;
 const largestHalf=Math.max(...team.map(g=>{const b=bounds(g);return Math.max(b.size.x,b.size.z)/2;}));
 const limit=ROOM_SIZE/2-largestHalf-.04,cx=clamp(goal.x,-limit+(columns-1)*spacing/2,limit-(columns-1)*spacing/2),cz=clamp(goal.z,-limit+(rows-1)*spacing/2,limit-(rows-1)*spacing/2);
 for(let i=0;i<team.length;i++){
  const p=V(cx+(i%columns-(columns-1)/2)*spacing,0,cz+(Math.floor(i/columns)-(rows-1)/2)*spacing);targets.push(p);
  leaveHaul(team[i]);if(startRoute(team[i],p,true)){started++;queueSpeech(team[i],'order',{kind:team[i].body.position.distanceTo(p)>2?'long':''});}
 }
 announce('Recorridos iniciados: '+started+' / '+team.length);return started;
}

function groupRouteMetrics(g){
 const r=g.route,points=[V(g.body.position.x,0,g.body.position.z)];let seconds=0;
 if(!r)return {points,metres:0,seconds:0,pending:!!g.pendingMoodOrder,status:g.pendingMoodOrder?(['planning','replan'].includes(g.pendingMoodOrder.reason)?'Calculando recorrido':g.pendingMoodOrder.reason==='bloqueo'?'Esperando un paso libre':'Recuperando energía')+' · orden pendiente':g.pin?.arrived?'Destino alcanzado':'Detenido'};
 let p=g.body.position.clone(),q=g.body.quaternion.clone(),index=r.index;
 if(r.align){p=r.align.toP.clone();q=r.align.toQ.clone();seconds+=(1-r.align.t)*.32;}
 if(r.segment){p=r.segment.endP.clone();q=r.segment.endQ.clone();points.push(V(p.x,0,p.z));seconds+=(1-r.segment.t)*r.segment.duration;index++;}
 for(let i=index;i<r.steps.length;i++){
  // The search already has every endpoint. Rebuilding all rolling geometry
  // here used to repeat hundreds of sweeps just to draw a route preview.
  p=r.preview[i];points.push(V(p.x,0,p.z));
  seconds+=Math.max(.16,r.strides[i]/settings.speed*Math.sqrt(totalWeight(g)));
 }
 let metres=0;for(let i=1;i<points.length;i++)metres+=points[i].distanceTo(points[i-1]);return {points,metres,seconds:seconds/moodSpeed(g),status:'En camino'};
}
function cargoRouteMetrics(c){
 const job=c.job,points=[V(c.body.position.x,0,c.body.position.z)];if(job)points.push(...job.path.slice(job.index));
 let metres=0;for(let i=1;i<points.length;i++)metres+=points[i].distanceTo(points[i-1]);
 const seconds=job?metres/Math.max(.01,haulSpeed(c)):0;
 return {points,metres,seconds,status:job?(job.phase==='planning'?'Calculando recorrido':job.phase==='arrastrando'?'Arrastrando':job.phase==='bloqueado'?'Camino bloqueado':job.phase==='descansando'?'Equipo recuperando energía · '+job.activeCount+' / '+c.required:'Reuniendo '+job.activeCount+' / '+c.required):c.lastStatus,waiting:job&&job.activeCount<c.required};
}
function inspectionNearPin(){
 const point=floorAim();if(!point)return null;let best=.35,found=null;
 for(const g of groups)if(g.pin){const d=g.pin.point.distanceTo(point);if(d<best){best=d;found={g};}}
 for(const cargo of cargos)if(cargo.pin){const d=cargo.pin.point.distanceTo(point);if(d<best){best=d;found={cargo};}}return found;
}
function updateInspection(){
 const el=document.querySelector('#route-readout');if(!routeInspection){el.hidden=true;return;}
 if(routeInspection.g&&!groups.includes(routeInspection.g)||routeInspection.cargo&&!cargos.includes(routeInspection.cargo)){routeInspection=null;el.hidden=true;return;}
 const info=routeInspection.g?groupRouteMetrics(routeInspection.g):cargoRouteMetrics(routeInspection.cargo);el.hidden=false;
 if(info.pending){el.textContent=info.status+' · R cancela';return;}
 el.textContent=info.status+' · '+info.metres.toFixed(2)+' m restantes · '+(info.waiting?'~'+Math.ceil(info.seconds)+' s de arrastre después de reunir el equipo':'~'+Math.ceil(info.seconds)+' s');
}
function switchPanelTab(name){for(const tab of ['cube','route','cargo','puzzle','alpha']){document.querySelector('#page-'+tab).hidden=tab!==name;document.querySelector('#tab-'+tab).setAttribute('aria-selected',String(tab===name));}}
function drawCargos(){
 for(const c of cargos){
  if(c.dimensions){drawMatter(c);continue;}
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);bindGeometry(shadowGeometry);gl.uniform1f(uniforms.uKind,2);const s=c.size*2;
  setPose(V(c.body.position.x,.001,c.body.position.z),Q(),V(s,1,s));gl.uniform1f(uniforms.uScale,s);gl.uniform1f(uniforms.uShadow,.2);gl.drawArrays(gl.TRIANGLES,0,6);
  const intake=c.intake||0,drawSize=c.size*(1-intake*.85);gl.depthMask(intake===0);if(intake===0)gl.disable(gl.BLEND);bindGeometry(cubeGeometry);gl.uniform1f(uniforms.uKind,5);setPose(V(c.body.position.x,drawSize/2,c.body.position.z),c.body.quaternion,V(drawSize,drawSize,drawSize));
  const rgb=[1,3,5].map(i=>parseInt(c.color.slice(i,i+2),16)/255);tint(...rgb,1-intake*.8);gl.drawArrays(gl.TRIANGLES,0,36);
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);if(!intake)drawOutline(c.body.position,c.body.quaternion,V(c.size,c.size,c.size),.65,selectedCargo===c);gl.depthMask(true);gl.disable(gl.BLEND);
 }
}
function drawTaskGuides(){
 if(!routeInspection){for(const g of groups)if(g.route){const info=renderRouteMetrics(g),points=[];for(let i=1;i<info.points.length;i++)points.push(add(info.points[i-1],V(0,.006,0)),add(info.points[i],V(0,.006,0)));drawNeonPath(points,[.28,.68,.73]);}for(const c of cargos)if(c.job){const info=cargoRouteMetrics(c),points=[];for(let i=1;i<info.points.length;i++)points.push(add(info.points[i-1],V(0,.006,0)),add(info.points[i],V(0,.006,0)));drawNeonPath(points,[.28,.68,.73]);}}
 gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
 for(const c of cargos)if(c.pin){const p=c.pin.point,b=.5+.5*Math.sin(simTime*1.4);drawRing(add(p,V(0,.006,0)),.07+b*.004,.4+b*.15);drawBox(add(p,V(0,.085,0)),Q(),V(.003,.15,.003),[.18,.39,.4,.45]);}
 if(routeInspection){const info=routeInspection.g?groupRouteMetrics(routeInspection.g):cargoRouteMetrics(routeInspection.cargo),points=[];for(let i=1;i<info.points.length;i++)points.push(add(info.points[i-1],V(0,.006,0)),add(info.points[i],V(0,.006,0)));drawNeonPath(points,[.28,.68,.73]);}
 gl.depthMask(true);gl.disable(gl.BLEND);
}
function updateCargoCallout(){
 if(held)return;
 if(!panel.hidden||!menu.hidden||!commandMenu.hidden||marquee)return;
 const dir=document.pointerLockElement===canvas?direction():hoverPointer?screenRay(hoverPointer.x,hoverPointer.y):V(0,1,0),hit=aimCargo(8,dir);if(!hit){calloutState.cargo=null;return;}
 const c=hit.cargo,p=project(add(c.body.position,V(0,c.size/2+.025,0)));if(!p)return;
 const side=p.x<canvas.clientWidth/2?1:-1,x=clamp(p.x+side*130+(side>0?0:-156),12,canvas.clientWidth-168),y=clamp(p.y-32,18,canvas.clientHeight-60);
 if(calloutState.cargo!==c){calloutState={g:null,cargo:c,since:simTime};}
 const t=clamp((simTime-calloutState.since)/.26,0,1),endX=side>0?x-8:x+164;
 calloutPath.setAttribute('d','M '+p.x+' '+p.y+' L '+(p.x+(endX-p.x)*t)+' '+(p.y+(y-p.y)*t));
 calloutText.style.left=x+'px';calloutText.style.top=(y-7)+'px';calloutText.style.opacity=String(clamp((t-.8)/.2,0,1));
 document.querySelector('#callout-count').textContent='Cuerpo · '+c.required+' u';document.querySelector('#callout-weight').textContent=c.job?c.job.activeCount+' / '+c.required+' Q-bits · '+(c.job.phase==='arrastrando'?'arrastrando':c.job.phase==='descansando'?'recuperando energía':'esperando'):'Requiere '+c.required+' Q-bits';callout.style.opacity='1';
}
document.addEventListener('keyup',event=>{if(event.code.startsWith('Alt'))routeInspection=null;});

// The first puzzle lives in the laboratory. Its previous contents are restored
// when leaving the challenge; rewards and deliveries use a single transaction.
const puzzleConfig={frameSeconds:12,energySeconds:8};
function puzzleBlockedEdit(kind='edit'){if(story.ready&&story.scene==='campaign'&&panel.hidden){announce('La materia genera nuevos Q-bits. P abre el banco de herramientas de prueba.');return true;}if(!puzzle.active||kind==='qubit'&&alphaSettings.allowPuzzleSpawn)return false;announce('Puzle activo · los recursos se obtienen en los portales. P → Puzle para volver al banco.');return true;}
function saveLab(){return {alphaScene:alphaSceneSnapshot(),settings:{...settings},moodSettings:{...moodSettings},position:[...position],yaw,pitch,groups:groups.map(g=>({parts:worldParts(g),q:g.body.quaternion.clone(),v:g.body.velocity.clone(),w:g.body.angularVelocity.clone()})),cargos:cargos.map(c=>({p:c.body.position.clone(),side:c.side,required:c.required,color:c.color}))};}
function clearPuzzleScene(){
 clearAlphaScene();releaseQubit();closeCommandMenu(false);closeDetachMenu(false);pendingCargo=null;moveChoice=null;routeInspection=null;multiSelection=[];selected=null;selectedCargo=null;
 for(const c of [...cargos])deleteCargo(c,true);for(const g of [...groups])removeGroup(g);
 for(const wall of puzzle.walls)world.removeBody(wall.body);puzzle.walls=[];puzzle.portals=[];puzzle.buttons=[];puzzle.pendingRewards=0;
}
function puzzleWall(p,half,portal=null){
 const body=new CANNON.Body({mass:0});body.collisionFilterMask=-1;body.addShape(new CANNON.Box(half));body.position.copy(p);if(portal)body.collisionFilterGroup=1<<(portal.index+2);world.addBody(body);
 const wall={p,half,body,portal,min:sub(p,half),max:add(p,half)};puzzle.walls.push(wall);return wall;
}
function startPuzzle(){
 if(story.ready&&story.scene!=='lab')enterLab(false);
 if(!puzzle.active)puzzle.savedLab=saveLab();clearPuzzleScene();puzzle.active=true;puzzle.stage=0;puzzle.complete=false;puzzle.delivery=null;puzzle.earned=0;puzzle.run++;
 settings.mass=1;settings.maxCarry=Math.max(settings.maxCarry,4);settings.maxSelect=Math.max(settings.maxSelect,12);
 const colors=['#73bdc5','#a69bce','#cdb47b'],names=['Calipso','Violeta','Ámbar'],requirements=[1,5,9],sizes=[3,5,7];
 for(let i=0;i<3;i++){
  const p={index:i,name:names[i],color:colors[i],rgb:[1,3,5].map(k=>parseInt(colors[i].slice(k,k+2),16)/255),x:-3+i*3,z:-ROOM_SIZE/2+.17,required:requirements[i],frame:i<2?1:0,energy:i<2?1:0,completed:false};puzzle.portals.push(p);
  puzzleWall(V(p.x-.96,1.25,p.z),V(.24,1.25,.12));puzzleWall(V(p.x+.96,1.25,p.z),V(.24,1.25,.12));puzzleWall(V(p.x,2.24,p.z),V(.72,.26,.12));
  p.barrier=puzzleWall(V(p.x,.99,p.z),V(.72,.99,.065),p);
  const c=newCargo(V(p.x,0,p.z+3.25),sizes[i],p.required,p.color);c.puzzleStage=i;p.material=c;
 }
 puzzle.buttons=[{kind:'frame',name:'Marco',p:V(2.05,0,-ROOM_SIZE/2+2.07),half:.16,required:1,load:0,pressed:0},{kind:'energy',name:'Energía',p:V(3.95,0,-ROOM_SIZE/2+2.07),half:.21,required:2,load:0,pressed:0}];
 for(let i=0;i<4;i++)addQubit([-3.22+(i%2)*.16,HALF+.003,-ROOM_SIZE/2+4.22+Math.floor(i/2)*.16],1);
 makeButtonPhysics();position[0]=-1.7;position[2]=-ROOM_SIZE/2+5.67;yaw=.18;pitch=-.34;camera.splice(0,3,...position);keys.clear();world.broadphase.dirty=true;
 updatePuzzleMasks();updatePuzzlePanel();announce('Puzle 01 · entrega los materiales del mismo color. Cada entrega crea cuatro Q-bits.');
}
function leavePuzzle(){
 if(!puzzle.active)return;const saved=puzzle.savedLab;clearPuzzleScene();puzzle.active=false;puzzle.savedLab=null;
 if(saved){Object.assign(settings,saved.settings);if(saved.moodSettings)Object.assign(moodSettings,saved.moodSettings);position.splice(0,3,...saved.position);yaw=saved.yaw;pitch=saved.pitch;camera.splice(0,3,...position);for(const g of saved.groups)makeGroup(g.parts,g.q,g.v,g.w);for(const c of saved.cargos)newCargo(c.p,c.side,c.required,c.color);}
 restoreAlphaScene(saved?.alphaScene);world.gravity.y=-settings.gravity;world.defaultContactMaterial.friction=settings.friction;world.defaultContactMaterial.restitution=settings.bounce;
 updatePuzzlePanel();updatePanel();announce('Banco de pruebas restaurado');
}
function portalReady(p){return p.frame>=1&&p.energy>=1;}
function portalAccepts(p,c){return puzzle.active&&!p.completed&&p.index===puzzle.stage&&c.puzzleStage===p.index&&c.color.toLowerCase()===p.color&&c.required===p.required&&portalReady(p);}
function puzzleObstacleBounds(c=null){return (puzzle.active?puzzle.walls.filter(w=>!w.portal||!c||!portalAccepts(w.portal,c)):[]).concat(storyWorld.walls);}
function puzzlePoseClear(g,pos,q,src=poses(g,pos,q),bb=bounds(g,pos,q)){return !puzzle.active||!puzzleObstacleBounds().some(w=>boundsOverlap(bb,w)&&src.some(a=>obbOverlap(a,{p:w.p,q:Q(),half:w.half})));}
function updatePuzzleMasks(){
 if(!puzzle.active)return;for(const c of cargos){let mask=-1;for(const p of puzzle.portals)if(portalAccepts(p,c))mask&=~(1<<(p.index+2));c.body.collisionFilterMask=mask;}
}
function buttonLoad(button){
 const resting=groups.filter(g=>!g.route&&!g.haulJob&&!(held?.items||[]).some(i=>i.g===g)).map(g=>({g,b:bounds(g)})).filter(o=>o.b.min.x>=button.p.x-button.half-.006&&o.b.max.x<=button.p.x+button.half+.006&&o.b.min.z>=button.p.z-button.half-.006&&o.b.max.z<=button.p.z+button.half+.006);
 const supported=new Set(resting.filter(o=>o.b.min.y<(button.surface||0)+.018).map(o=>o.g));
 for(let pass=0;pass<resting.length;pass++){let changed=false;for(const o of resting){if(supported.has(o.g))continue;for(const base of resting){if(!supported.has(base.g)||base.g===o.g)continue;
  if(o.b.min.y>=base.b.max.y-.008&&o.b.min.y<=base.b.max.y+.015&&Math.min(o.b.max.x,base.b.max.x)-Math.max(o.b.min.x,base.b.min.x)>.015&&Math.min(o.b.max.z,base.b.max.z)-Math.max(o.b.min.z,base.b.min.z)>.015){supported.add(o.g);changed=true;break;}
 }}if(!changed)break;}
 return [...supported].reduce((n,g)=>n+totalWeight(g),0);
}
function beginPortalIntake(p,c){
 if(puzzle.delivery||!portalAccepts(p,c)||!c.job||c.job.activeCount<c.required)return false;
 stopHaul(c,'Entregando');c.pin=null;const start=c.body.position.clone();puzzle.delivery={p,c,start,t:0,run:puzzle.run};
 c.body.type=CANNON.Body.KINEMATIC;c.body.collisionResponse=false;c.body.velocity.set(0,0,0);c.intake=0;return true;
}
function abortPortalIntake(){
 const d=puzzle.delivery;if(!d)return;const c=d.c;c.intake=null;c.body.position.copy(d.start);c.body.position.z=Math.max(c.body.position.z,d.p.z+c.size/2+.10);c.body.velocity.set(0,0,0);c.body.collisionResponse=true;c.body.type=CANNON.Body.STATIC;c.body.mass=0;c.body.updateMassProperties();c.body.aabbNeedsUpdate=true;c.lastStatus='Entrega interrumpida';puzzle.delivery=null;announce('Portal sin alimentación · vuelve a activar los botones.');
}
function finishPortalIntake(d){
 if(puzzle.delivery!==d||d.run!==puzzle.run||d.p.completed)return;
 d.p.completed=true;d.p.material=null;puzzle.delivery=null;deleteCargo(d.c,true);puzzle.stage++;puzzle.earned+=4;puzzle.pendingRewards+=4;puzzle.complete=puzzle.stage===3;
 announce(puzzle.complete?'Puzle completado · cuatro nuevos Q-bits':'Material recibido · cuatro nuevos Q-bits');updatePuzzlePanel();if(puzzle.complete)showPuzzleComplete();
}
function rewardPlacement(){
 const flat=V(-Math.sin(yaw),0,-Math.cos(yaw)),right=V(Math.cos(yaw),0,-Math.sin(yaw)),up=V(0,1,0);
 for(const distance of [.8,.55,1.05])for(const lift of [-.22,.04,-.45]){
  const center=add(add(V(...camera),mul(flat,distance)),mul(up,lift));const points=[];
  for(let i=0;i<4;i++)points.push(add(center,mul(right,(i-1.5)*.14)));
  if(points.every(p=>p.y>HALF+.02&&p.y<ROOM_HEIGHT-HALF&&Math.max(Math.abs(p.x),Math.abs(p.z))<13.9&&cargoPlacementClear(p,.1,null,[])&&!groups.some(g=>poses(g).some(o=>obbOverlap(o,{p,q:Q()},-.012)))&&!puzzleObstacleBounds().some(w=>obbOverlap({p,q:Q()},{p:w.p,q:Q(),half:w.half},-.012))))return points;
 }return null;
}
function givePuzzleReward(){
 if(!puzzle.active||puzzle.pendingRewards<4||held||document.pointerLockElement!==canvas||!panel.hidden||!commandMenu.hidden||!menu.hidden)return false;
 const points=rewardPlacement();if(!points)return false;
 const team=points.map(p=>addQubit([p.x,p.y,p.z],1)),rootPoint=points[0],items=[];
 for(let i=0;i<team.length;i++){
  const g=team[i],anchorBody=new CANNON.Body({mass:0});anchorBody.type=CANNON.Body.KINEMATIC;anchorBody.position.copy(points[i]);anchorBody.collisionFilterGroup=0;world.addBody(anchorBody);
  const joint=new CANNON.PointToPointConstraint(g.body,V(),anchorBody,V(),settings.force/4);joint.collideConnected=false;world.addConstraint(joint);
  items.push({g,anchor:V(),anchorBody,joint,relative:sub(points[i],rootPoint),initialQ:Q(),restQ:Q()});
 }
 const g=team[0],offset=sub(rootPoint,V(...camera)),distance=offset.dot(direction()),rootOffset=sub(rootPoint,add(V(...camera),mul(direction(),distance)));
 held={g,part:g.parts[0],...items[0],items,weight:4,age:.3,distance,rootOffset,rotation:Q(),initialRotation:Q(),reward:true};multiSelection=team;selected={g,part:g.parts[0]};puzzle.pendingRewards-=4;announce('Cuatro Q-bits · clic derecho o clic izquierdo para dejarlos caer');return true;
}
function updatePuzzle(dt){
 if(!puzzle.active)return;
 const last=puzzle.portals[2];for(const b of puzzle.buttons){b.load=buttonLoad(b);b.pressed+=(Math.min(1,b.load/b.required)-b.pressed)*(1-Math.exp(-12*dt));}
 if(puzzle.buttons[0].load>=1){last.frame=Math.min(1,last.frame+dt/puzzleConfig.frameSeconds);last.energy=puzzle.buttons[1].load>=2?Math.min(1,last.energy+dt/puzzleConfig.energySeconds):0;}
 else {last.frame=0;last.energy=0;}
 updatePuzzleMasks();
 if(puzzle.delivery){const d=puzzle.delivery;if(!portalAccepts(d.p,d.c)){abortPortalIntake();}
  else {d.t=Math.min(1,d.t+dt/1.25);d.c.intake=d.t;d.c.body.position.z=d.start.z+(d.p.z-.35-d.start.z)*d.t;d.c.body.aabbNeedsUpdate=true;if(d.t>=1)finishPortalIntake(d);}
 }else{
  const p=puzzle.portals[puzzle.stage];if(p&&portalReady(p))for(const c of cargos){if(!portalAccepts(p,c)||!c.job)continue;
   const fits=Math.abs(c.body.position.x-p.x)+c.size/2<.54&&c.size<1.62;
   const touching=c.body.position.z-c.size/2<=p.z+.065&&c.body.position.z>p.z-.15;
   if(fits&&touching&&beginPortalIntake(p,c))break;
  }
 }
 givePuzzleReward();
}
function portalDeliveryGoal(p,c){return V(p.x,0,p.z+c.size/2+.025);}
function deliverSelectedCargo(c,team){const p=puzzle.portals[c.puzzleStage];if(!p||!portalAccepts(p,c)){announce('Activa el portal correspondiente antes de entregar.');return false;}return beginHaul(c,team,portalDeliveryGoal(p,c));}
function rayPuzzleBox(origin,dir,w,max){
 let near=0,far=max;for(const k of ['x','y','z']){if(Math.abs(dir[k])<1e-9){if(origin[k]<w.min[k]||origin[k]>w.max[k])return null;continue;}let a=(w.min[k]-origin[k])/dir[k],b=(w.max[k]-origin[k])/dir[k];if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>far)return null;}return near;
}
function puzzleRayLimit(max,dir=direction()){for(const w of [...(puzzle.active?puzzle.walls:[]),...storyWorld.walls]){const d=rayPuzzleBox(V(...camera),dir,w,max);if(d!==null)max=Math.min(max,d);}return max;}
function aimPuzzle(){
 if(!puzzle.active)return null;const d=document.pointerLockElement===canvas?direction():hoverPointer?screenRay(hoverPointer.x,hoverPointer.y):direction(),o=V(...camera);let best=Math.min(6,aimQubit(6,d)?.distance??6,raycastCargo(6,d)?.distance??6),found=null;
 for(const p of puzzle.portals){const hit=rayPuzzleBox(o,d,{min:V(p.x-.72,0,p.z-.15),max:V(p.x+.72,1.98,p.z+.15)},best);if(hit!==null&&hit<best){best=hit;found={portal:p,point:V(p.x,1.45,p.z+.16)};}}
 for(const b of puzzle.buttons){const hit=rayPuzzleBox(o,d,{min:V(b.p.x-b.half,0,b.p.z-b.half),max:V(b.p.x+b.half,.018,b.p.z+b.half)},best);if(hit!==null&&hit<best){best=hit;found={button:b,point:add(b.p,V(0,.025,0))};}}
 return found;
}
function updatePuzzleHUD(){
 const hud=document.querySelector('#puzzle-status');hud.hidden=!puzzle.active;if(!puzzle.active)return;
 hud.textContent=puzzle.complete?'Puzle 01 completado':String(puzzle.stage+1).padStart(2,'0')+' / 03 · '+puzzle.portals[puzzle.stage].name+' · material → portal';
 if(puzzle.pendingRewards)hud.textContent+=' · recompensa pendiente: deja espacio frente a ti';
 if(held?.reward)targetLabel.textContent='Cuatro nuevos Q-bits · clic derecho o izquierdo para soltar';
 if(!panel.hidden||!menu.hidden||!commandMenu.hidden||held||marquee)return;
 const hit=aimPuzzle();if(!hit)return;const screen=project(hit.point);if(!screen)return;
 const key=hit.portal||hit.button;if(puzzle.hover!==key){puzzle.hover=key;puzzle.hoverSince=simTime;}
 const t=clamp((simTime-puzzle.hoverSince)/.25,0,1),side=screen.x<canvas.clientWidth/2?1:-1,x=clamp(screen.x+side*115+(side>0?0:-156),12,canvas.clientWidth-168),y=clamp(screen.y-30,18,canvas.clientHeight-60),end=side>0?x-8:x+164;
 calloutPath.setAttribute('d','M '+screen.x+' '+screen.y+' L '+(screen.x+(end-screen.x)*t)+' '+(screen.y+(y-screen.y)*t));calloutText.style.left=x+'px';calloutText.style.top=(y-7)+'px';calloutText.style.opacity=String(clamp((t-.7)/.3,0,1));callout.style.opacity='1';
 if(hit.portal){const p=hit.portal;document.querySelector('#callout-count').textContent=p.name+' · material de '+p.required+' u';document.querySelector('#callout-weight').textContent=p.completed?'Entrega completada':p.index!==puzzle.stage?'Completa la entrega anterior':portalReady(p)?'Listo · solo materiales': 'Marco '+Math.round(p.frame*100)+' % · energía '+Math.round(p.energy*100)+' %';}
 else{const b=hit.button,p=puzzle.portals[2],seconds=b.kind==='frame'?puzzleConfig.frameSeconds:puzzleConfig.energySeconds;document.querySelector('#callout-count').textContent=b.name+' · '+formatWeight(b.load)+' / '+b.required+' u';document.querySelector('#callout-weight').textContent='Mantener · '+Math.ceil((1-p[b.kind])*seconds)+' s restantes';}
}
function updatePuzzlePanel(){
 document.querySelector('#puzzle-description').textContent=puzzle.active?(puzzle.complete?'Primera cadena completada. Puedes reiniciarla o volver a tu banco.':'Calipso → Violeta → Ámbar. Cada material entregado crea cuatro Q-bits. En el último portal reserva uno para el marco y dos para la energía; el resto arrastra.'):'Monta la primera cadena dentro de la sala. Al salir se recupera el contenido de tu banco de pruebas.';
 document.querySelector('#start-puzzle').textContent=puzzle.active?'Reiniciar puzle':'Montar puzle 01';document.querySelector('#leave-puzzle').disabled=!puzzle.active;
 for(const id of ['mass','cargoRequired','cargoColor','create','create-cargo','remove','delete-cargo'])document.querySelector('#'+id).disabled=puzzle.active;document.querySelector('#create').disabled=puzzle.active&&!alphaSettings.allowPuzzleSpawn;
 for(const key of ['frameSeconds','energySeconds']){document.querySelector('#'+key).value=puzzleConfig[key];document.querySelector('#'+key+'Value').textContent=puzzleConfig[key]+' s';}
}
function resolvePuzzlePlayer(oldX,oldZ){
 if(!puzzle.active)return;const r=PLAYER_RADIUS;const blocked=(x,z)=>puzzle.walls.some(w=>w.min.y<posture.height+.15&&w.max.y>.15&&x>w.min.x-r&&x<w.max.x+r&&z>w.min.z-r&&z<w.max.z+r);
 if(blocked(position[0],oldZ))position[0]=oldX;if(blocked(position[0],position[2]))position[2]=oldZ;
}
function drawPuzzle(){
 if(!puzzle.active)return;
 const solid=(p,size,color)=>{bindGeometry(cubeGeometry);gl.uniform1f(uniforms.uKind,5);setPose(p,Q(),size);tint(...color,1);gl.drawArrays(gl.TRIANGLES,0,36);};
 for(const w of puzzle.walls)if(!w.portal)solid(w.p,mul(w.half,2),[.92,.925,.92]);
 for(const p of puzzle.portals){
  const progress=p.frame*12;
  for(const side of [-1,1])for(let i=0;i<12;i++){
   const amount=clamp(progress-i,0,1);if(amount<=0)continue;
   const point=i<9?V(p.x+side*.63,.09+i*.18,p.z+.025):V(p.x+side*(.63-(i-8)*.18),1.71,p.z+.025);
   const size=.178*Math.pow(amount,.4);solid(point,V(size,size,size),[.55,.58,.59]);
  }
 }
 gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.uniform1f(uniforms.uTime,simTime);
 for(const p of puzzle.portals){
  if(p.frame>0&&p.frame<1){const progress=p.frame*12,i=Math.min(11,Math.floor(progress));for(const side of [-1,1]){const point=i<9?V(p.x+side*.63,.09+i*.18,p.z+.025):V(p.x+side*(.63-(i-8)*.18),1.71,p.z+.025);
   for(let k=0;k<9;k++){const phase=(simTime*.7+k*.113)%1,angle=k*2.399,spread=(1-phase)*.13,pos=add(point,V(Math.cos(angle)*spread,Math.sin(angle)*spread,(1-phase)*.10));drawBox(pos,Q(),V(.009,.009,.009),[.48,.53,.55,Math.sin(phase*Math.PI)*.55]);}
  }}
  if(p.energy>0&&p.frame>0){const amount=Math.min(p.frame,p.energy);bindGeometry(cubeGeometry);gl.uniform1f(uniforms.uKind,6);setPose(V(p.x,.81,p.z+.002),Q(),V(1.08,1.62,.008));tint(...p.rgb,.40*amount);gl.drawArrays(gl.TRIANGLES,0,36);
   gl.uniform1f(uniforms.uKind,7);setPose(V(p.x,.003,p.z+.35),Q(),V(1.9,.001,1.1));tint(...p.rgb,.11*amount);gl.drawArrays(gl.TRIANGLES,0,36);
  }
 }
 drawAlphaButtons();
 gl.depthMask(true);gl.disable(gl.BLEND);
}
document.querySelector('#start-puzzle').addEventListener('click',()=>{startPuzzle();panel.hidden=true;captureMouse();});
document.querySelector('#leave-puzzle').addEventListener('click',leavePuzzle);
for(const key of ['frameSeconds','energySeconds'])document.querySelector('#'+key).addEventListener('input',e=>{puzzleConfig[key]=clamp(Number(e.target.value)||1,1,30);updatePuzzlePanel();});

// Each piece owns its state. Welding, splitting and lab snapshots retain it.
function newMood(id,saved=null){
 const personality=Math.abs(Math.sin(id*127.1)*43758.5453)%1;
 const m={name:'Q-bit '+id,strikes:0,severity:0,lastAnger:-1000,restTotal:0,energy:.8,state:'neutral',reason:'',agitation:0,restLeft:0,idle:0,fullTime:0,blocked:0,calm:0,boredOnce:false,personality,blend:[1,0,0]};
 if(saved)Object.assign(m,saved,{blend:[...(saved.blend||[1,0,0])]});m.name=m.name.replace(/^(?:Kiubit|Qubit) (\d+)$/,'Q-bit $1');return m;
}
function copyMood(m){return m?{...m,blend:[...m.blend]}:null;}
function moodName(m){return m.state==='excited'?'Entusiasmado':m.state==='restless'?(m.severity>=3?'Alterado':'Inquieto'):'Neutro';}
function moodColor(m){const colors=[[.53,.60,.61],[.38,.66,.56],[.76,.48,.38]],rgb=[0,0,0];for(let i=0;i<3;i++)for(let k=0;k<3;k++)rgb[k]+=colors[i][k]*m.blend[i];return rgb;}
function moodCSS(m){return 'rgb('+moodColor(m).map(c=>Math.round(c*255)).join(',')+')';}
function groupWilling(g){return g.parts.every(p=>p.mood.state!=='restless'&&p.mood.energy>.025);}
function moodSpeed(g){
 const average=g.parts.reduce((n,p)=>n+(.5+.5*Math.min(1,p.mood.energy/.65)+p.mood.blend[1]*.16),0)/g.parts.length;
 return clamp(average,.5,1.16);
}
function crewMoodSpeed(c){const slots=c.job?.slots.filter(s=>s.ready&&groupWilling(s.g))||[];const count=slots.reduce((n,s)=>n+s.g.parts.length,0);return count?slots.reduce((n,s)=>n+moodSpeed(s.g)*s.g.parts.length,0)/count:1;}
function frustrate(g,reason){for(const p of g.parts)beginMoodEpisode(p.mood,reason);}
function moodObstacleStamp(g){return [g.body.position.x,g.body.position.y,g.body.position.z,...navigationObstacles(g).flatMap(b=>[b.min.x,b.min.y,b.min.z,b.max.x,b.max.y,b.max.z])].map(n=>Math.round(n*100)).join(',');}
function queueMoodRoute(g,goal,reason='descanso'){
 stopRoute(g,false);g.pendingMoodOrder={goal:goal.clone(),reason,nextTry:simTime+1,obstacleStamp:reason==='bloqueo'?moodObstacleStamp(g):null};g.pin={point:goal.clone(),arrived:false};
 if(reason==='bloqueo'){for(const p of g.parts)p.mood.blocked=Math.max(p.mood.blocked,3);queueSpeech(g,g.parts.some(p=>p.mood.strikes>0)?'calm':'blocked',{kind:'retry-blocked',priority:68});}
}
function onPuzzleButton(g){
 if(!puzzle.active||g.route||g.haulJob)return false;
 const b=bounds(g);return puzzle.buttons.some(p=>b.min.y<(p.surface||0)+.02&&b.min.x>=p.p.x-p.half-.006&&b.max.x<=p.p.x+p.half+.006&&b.min.z>=p.p.z-p.half-.006&&b.max.z<=p.p.z+p.half+.006);
}
function updateMoods(dt){
 if(moodTeachingPaused())return;
 let retried=false;
 for(const g of groups){
  const previous=g.moodLastPosition||g.body.position;const travel=Math.min(Math.hypot(g.body.position.x-previous.x,g.body.position.z-previous.z),6*dt);g.moodLastPosition=g.body.position.clone();
  const carried=!!held&&(held.items||[held]).some(i=>i.g===g),job=g.haulJob,slot=job?.slots.find(s=>s.g===g),task=!!(g.route||job||g.pendingMoodOrder||g.blueprintJob),duty=onPuzzleButton(g)||onCampaignPad(g)||!!g.storySocket||!!g.cooler;
  const waiting=!!job&&(job.phase==='planning'||slot?.ready&&['reuniendo','descansando'].includes(job.phase)),resting=!groupWilling(g),moving=travel>dt*.006;
  const working=!carried&&!resting&&(!!g.route||!!job&&!waiting&&job.phase!=='bloqueado');
  const blocked=!carried&&!resting&&((g.pendingMoodOrder?.reason==='bloqueo')||!!job&&job.phase==='bloqueado'||working&&!moving&&!g.route?.align&&!slot?.ready);
  const effort=job?1+Math.min(1,job.cargo.required/Math.max(1,job.slots.reduce((n,s)=>n+s.g.parts.length,0)))*.65:1;
  for(const part of g.parts){const m=part.mood;
   if(g.moodHadTask&&!task){m.calm=2;m.idle=0;m.fullTime=0;if(m.state!=='restless')m.state='neutral';}
   m.calm=Math.max(0,m.calm-dt);
   if(working&&moving){m.energy=clamp(m.energy-travel*moodSettings.drain*effort-dt*.0015,0,1);m.idle=0;m.boredOnce=false;}
   else m.energy=clamp(m.energy+dt*moodSettings.recovery*(.9+.2*m.personality),0,1);
   if(task||carried||duty){m.idle=0;m.boredOnce=false;}else m.idle+=dt;
   m.blocked=blocked?m.blocked+dt:Math.max(0,m.blocked-dt*2);
   m.agitation=clamp(m.agitation+(blocked&&m.blocked>3?dt*.09:-dt*.20),0,1);
   if(m.state!=='restless'&&(m.energy<.025||m.agitation>.72||!m.boredOnce&&m.idle>moodSettings.idleSeconds*(.85+.3*m.personality))){
    const reason=m.energy<.025?'agotado':m.agitation>.72?'bloqueado':'sin actividad';
    beginMoodEpisode(m,reason);if(reason==='sin actividad')m.boredOnce=true;
   }
   if(m.state==='restless'){
    m.restLeft=Math.max(0,m.restLeft-dt);
    if(m.restLeft===0&&m.energy>=.28&&m.agitation<.3){m.state='neutral';m.reason='';m.calm=2;m.fullTime=0;m.blocked=0;}
   }else{
    m.fullTime=!working&&!task&&!duty&&!carried&&m.energy>.995&&m.calm===0?m.fullTime+dt:0;
    if(m.state==='excited'&&(m.energy<.82||duty||m.calm>0))m.state='neutral';
    if(m.state==='neutral'&&m.fullTime>6)m.state='excited';
   }
   if(g.cooler&&g.cooler.entries.get(part.id)?.done)m.energy=Math.min(m.energy,alphaSettings.exitEnergy);
   const target=m.state==='excited'?1:m.state==='restless'?2:0,blend=1-Math.exp(-5*dt);
   for(let i=0;i<3;i++)m.blend[i]+=((i===target?1:0)-m.blend[i])*blend;
  }
  g.moodHadTask=task;g.moodDuty=duty;g.moodCarried=carried;
  const pending=g.pendingMoodOrder;
  if(pending&&groupWilling(g)&&!carried&&!job&&!retried&&simTime>=pending.nextTry){
   if(pending.reason==='bloqueo'&&pending.obstacleStamp===moodObstacleStamp(g)){pending.nextTry=simTime+1;continue;}
   retried=true;pending.nextTry=simTime+3;
   const goal=pending.goal.clone();startRoute(g,goal,true);
   if(g.pendingMoodOrder)g.pendingMoodOrder.nextTry=simTime+3;
  }
 }
}
function moodVisualPose(g,pose){
 if(g.storySocket)return pose;
 if(g.parts.length!==1||g.route||g.haulJob&&groupWilling(g)||g.moodDuty||g.cooler||g.moodCarried||g.body.velocity.norm()>.03)return pose;
 const m=g.parts[0].mood,phase=simTime*(2.1+m.personality*.4)+g.parts[0].id,joy=m.blend[1],restless=m.blend[2],pulse=Math.max(0,Math.sin(phase));
 if(joy+restless<.001)return pose;
 const q=Q();q.setFromAxisAngle(V(0,0,1),joy*Math.sin(phase)*.018+restless*Math.sin(simTime*28+phase)*(.008+.014*(m.severity||1)));
 // Render-only gestures never move colliders or remove weight from a switch.
 const result={...pose,p:add(pose.p,V(restless*Math.sin(simTime*31+phase)*(.00045+.0008*(m.severity||1)),joy*pulse*pulse*.002+restless*Math.pow(Math.max(0,Math.sin(simTime*8+phase)),12)*.005*(m.severity||1),0)),q:q.mult(pose.q)};
 const base=Math.min(...corners(pose).map(v=>v.y)),bottom=Math.min(...corners(result).map(v=>v.y));result.p.y+=Math.max(0,base-bottom);return result;
}
function moodSummary(list){
 const counts={neutral:0,excited:0,restless:0};let energy=0;
 for(const g of [...new Set(list)])for(const p of g.parts){counts[p.mood.state]++;energy+=p.mood.energy;}
 const total=counts.neutral+counts.excited+counts.restless;return {counts,total,energy:total?energy/total:0};
}
function updateMoodCallout(hit){
 const el=document.querySelector('#mood-callout');el.hidden=!hit;if(!hit)return;
 const part=hit.part||hit.g.parts[0],m=part.mood,summary=moodSummary([hit.g]);
 document.querySelector('#mood-unit-name').textContent=m.name;
 document.querySelector('#mood-state-description').textContent=moodName(m)+(m.reason?' · '+m.reason:'');
 const percent=Math.round(m.energy*100),bar=document.querySelector('#mood-energy-fill');bar.style.width=percent+'%';bar.style.background=moodCSS(m);document.querySelector('#mood-energy-track').setAttribute('aria-valuenow',String(percent));
 document.querySelector('#mood-energy-label').textContent='Energía '+percent+' %'+(m.state==='restless'?' · calma en ~'+Math.ceil(m.restLeft)+' s':'')+(hit.g.cooler?' · enfriando':'');
 document.querySelector('#mood-group-count').textContent=summary.total>1?summary.counts.neutral+' neutros · '+summary.counts.excited+' entusiasmados · '+summary.counts.restless+' inquietos':'';
}
function updateMoodSelection(){
 if(simTime<speech.nextHud)return;speech.nextHud=simTime+.10;
 const team=held?(held.items||[held]).map(i=>i.g):selectedTeam(),summary=moodSummary(team),el=document.querySelector('#mood-selection');el.hidden=summary.total===0;document.querySelector('#tools').style.opacity=summary.total?'.9':'';
 if(summary.total){document.querySelector('#mood-selection-label').textContent=summary.counts.neutral+' neutros · '+summary.counts.excited+' entusiasmados · '+summary.counts.restless+' inquietos';for(const state of ['neutral','excited','restless'])document.querySelector('#mood-segment-'+state).style.width=(summary.counts[state]/summary.total*100)+'%';}
 const labels=document.querySelector('#mood-held-labels');
 while(moodLabels.length<8){const node=document.createElement('div');node.className='mood-held-item';node.hidden=true;labels.appendChild(node);moodLabels.push(node);}
 const parts=held?held.items.flatMap(item=>item.g.parts.map(part=>({g:item.g,part}))):[];
 for(let i=0;i<moodLabels.length;i++){
  const label=moodLabels[i],o=parts.length<=8?parts[i]:null;label.hidden=!o||speech.slots.some(b=>b.s?.id===o?.part.id);if(label.hidden)continue;
  const pos=partPose(o.g,o.part).p,p=project(add(pos,V(0,.072,0)));if(!p){label.hidden=true;continue;}
  label.style.left=p.x+'px';label.style.top=p.y+'px';label.style.color=moodCSS(o.part.mood);label.textContent=o.part.mood.name;label.style.backgroundImage='linear-gradient(to right,'+moodCSS(o.part.mood)+' '+Math.round(o.part.mood.energy*100)+'%,#aab3b333 '+Math.round(o.part.mood.energy*100)+'%)';label.title=moodName(o.part.mood);label.setAttribute('aria-label',moodName(o.part.mood)+', energía '+Math.round(o.part.mood.energy*100)+' por ciento');
 }
}
function updateMoodPanel(){
 for(const key of ['drain','recovery','idleSeconds']){document.querySelector('#mood-'+key).value=moodSettings[key];document.querySelector('#mood-'+key+'Value').textContent=key==='idleSeconds'?moodSettings[key]+' s':Math.round(moodSettings[key]*1000)/10+' % / '+(key==='drain'?'m':'s');}
 for(const key of ['tired','rested'])document.querySelector('#mood-test-'+key).disabled=!selected||puzzle.active;
}
function testMood(tired){
 if(puzzle.active||!selected)return;const m=selected.part.mood;m.energy=tired?.01:1;m.agitation=tired?.75:0;m.state=tired?'restless':'neutral';m.reason=tired?'agotado':'';m.restLeft=tired?3:0;m.fullTime=0;m.calm=tired?0:1;updateMoodPanel();
}
for(const key of ['drain','recovery','idleSeconds'])document.querySelector('#mood-'+key).addEventListener('input',e=>{const value=Number(e.target.value);if(Number.isFinite(value))moodSettings[key]=clamp(value,...({drain:[.005,.08],recovery:[.02,.15],idleSeconds:[45,180]}[key]));updateMoodPanel();});
document.querySelector('#mood-test-tired').addEventListener('click',()=>testMood(true));
document.querySelector('#mood-test-rested').addEventListener('click',()=>testMood(false));

// Alpha tools: local shape library, visible construction and physical coolers.
function beginMoodEpisode(m,reason){
 if(m.state==='restless')return;
 if(simTime-(m.lastAnger??-1000)>120)m.strikes=0;
 m.strikes=(m.strikes||0)+1;m.lastAnger=simTime;m.severity=Math.min(3,m.strikes);
 m.state='restless';m.reason=reason;m.restLeft=m.severity>=3?alphaSettings.maxRest:2.8+m.severity*1.5+m.personality;
 m.restTotal=m.restLeft;m.fullTime=0;m.agitation=Math.max(.75,m.agitation);
}
function alphaBox(p,half){return {p,half,min:sub(p,half),max:add(p,half),q:Q()};}
function addAlphaCollider(owner,p,half,q=Q()){
 const body=new CANNON.Body({mass:0});body.addShape(new CANNON.Box(half));body.position.copy(p);body.quaternion.copy(q);body.collisionFilterMask=-1;world.addBody(body);owner.bodies.push(body);return body;
}
function alphaObstacles(){return coolers.map(c=>alphaBox(add(c.p,V(0,.08,0)),V(.40,.08,.40))).concat(activePressureButtons().map(b=>alphaBox(add(b.p,V(0,.07,0)),V(b.half,.07,b.half))));}
function alphaPoseClear(g,pos,q){return !coolers.some(c=>{const bb=bounds(g,pos,q);const inside=Math.max(Math.abs(bb.min.x-c.p.x),Math.abs(bb.max.x-c.p.x))<.25&&Math.max(Math.abs(bb.min.z-c.p.z),Math.abs(bb.max.z-c.p.z))<.25;
 return bb.min.y<.15&&!inside&&obbOverlap({p:bb.center,q:Q(),half:mul(bb.size,.5)},alphaBox(add(c.p,V(0,.08,0)),V(.40,.08,.40)));});}
function alphaSupport(g,center,q){
 const bb=bounds(g,center,q);let level=0;
 for(const b of activePressureButtons()){if(bb.max.x>b.p.x-b.half&&bb.min.x<b.p.x+b.half&&bb.max.z>b.p.z-b.half&&bb.min.z<b.p.z+b.half)level=Math.max(level,b.surface||0);}
 for(const c of coolers){const dx=Math.max(Math.abs(bb.min.x-c.p.x),Math.abs(bb.max.x-c.p.x)),dz=Math.max(Math.abs(bb.min.z-c.p.z),Math.abs(bb.max.z-c.p.z));
 if(Math.max(...poses(g,center,q).flatMap(corners).map(v=>Math.hypot(v.x-c.p.x,v.z-c.p.z)))<.315)level=Math.max(level,.018);else if(bb.max.x>c.p.x-.40&&bb.min.x<c.p.x+.40&&bb.max.z>c.p.z-.40&&bb.min.z<c.p.z+.40)level=Math.max(level,.145);
 }return level;
}
function createCooler(p){
 if(coolers.length>=6){announce('Máximo de seis enfriadores en esta sala.');return null;}
 if(!p||Math.max(Math.abs(p.x),Math.abs(p.z))>13.4||!cargoPlacementClear(p,.84)||coolers.some(c=>c.p.distanceTo(p)<.9)){announce('Busca un espacio libre para el enfriador.');return null;}
 const c={id:++alphaSerial,p:V(p.x,0,p.z),capacity:alphaSettings.capacity,enabled:true,bodies:[],entries:new Map(),occupants:0};coolers.push(c);
 const floor=new CANNON.Body({mass:0});floor.addShape(new CANNON.Cylinder(.32,.32,.018,20),V(),new CANNON.Quaternion().setFromEuler(-Math.PI/2,0,0));floor.position.set(p.x,.009,p.z);floor.collisionFilterMask=-1;world.addBody(floor);c.bodies.push(floor);
 for(let i=0;i<20;i++){const a=i*Math.PI/10,q=Q();q.setFromAxisAngle(V(0,1,0),-a);addAlphaCollider(c,V(p.x+Math.cos(a)*.36,.077,p.z+Math.sin(a)*.36),V(.042,.077,.061),q);}
 announce('Enfriador colocado · capacidad '+c.capacity);return c;
}
function removeCooler(c){for(const b of c.bodies)world.removeBody(b);for(const g of groups)if(g.cooler===c)g.cooler=null;coolers.splice(coolers.indexOf(c),1);}
function updateCooling(dt){
 for(const g of groups)g.cooler=null;
 for(const c of coolers){let count=0;const seen=new Set();
  const candidates=groups.filter(g=>!g.route&&!g.haulJob&&!g.blueprintJob&&!(held?.items||[]).some(i=>i.g===g)).map(g=>({g,b:bounds(g)})).filter(o=>o.b.min.y>=-.005&&o.b.min.y<.05&&Math.max(...poses(o.g).flatMap(corners).map(v=>Math.hypot(v.x-c.p.x,v.z-c.p.z)))<.315).sort((a,b)=>Number(c.entries.has(b.g.parts[0].id))-Number(c.entries.has(a.g.parts[0].id)));
  for(const {g} of candidates){if(count+g.parts.length>c.capacity)continue;count+=g.parts.length;
   if(!c.enabled||!alphaSettings.coolingOn)continue;g.cooler=c;
   for(const part of g.parts){seen.add(part.id);let e=c.entries.get(part.id);if(!e){e={elapsed:0,done:false};c.entries.set(part.id,e);}const coolingSeconds=c.coolSeconds||alphaSettings.coolSeconds;e.elapsed=Math.min(coolingSeconds,e.elapsed+dt);
    const m=part.mood;m.coolProgress=e.elapsed/coolingSeconds;
    if(e.elapsed>=coolingSeconds){if(!e.done){m.energy=alphaSettings.exitEnergy;m.state='neutral';m.reason='';m.restLeft=0;m.agitation=0;m.strikes=0;m.severity=0;m.fullTime=0;m.calm=4;e.done=true;}m.energy=Math.min(m.energy,alphaSettings.exitEnergy);}
   }
  }
  for(const [id] of c.entries)if(!seen.has(id))c.entries.delete(id);c.occupants=count;
 }
}
function savedShapeValid(shape){return shape&&typeof shape.name==='string'&&shape.name.length<=40&&Array.isArray(shape.parts)&&shape.parts.length>0&&shape.parts.length<=MAX_QUBITS&&shape.parts.every(p=>(p.shape===undefined||['cube','tetra','pyramid'].includes(p.shape))&&Array.isArray(p.p)&&p.p.length===3&&p.p.every(Number.isFinite)&&p.p.every(n=>Math.abs(n)<6)&&Array.isArray(p.q)&&p.q.length===4&&p.q.every(Number.isFinite)&&Math.abs(Math.hypot(...p.q)-1)<.01);}
function loadSavedShapes(){try{const list=JSON.parse(readQbitsStorage('qbits.shapes.v1')||'[]');if(Array.isArray(list))savedShapes.push(...list.filter(savedShapeValid).slice(0,32));}catch{} }
function persistShapes(){try{window.localStorage.setItem('qbits.shapes.v1',JSON.stringify(savedShapes));return true;}catch{announce('Forma guardada en esta sesión · Exportar formas permite conservar una copia.');return false;}}
function saveShape(g){
 if(!g||!groups.includes(g))return;if(savedShapes.length>=32){announce('Hay 32 formas guardadas. Exporta o elimina una antes de añadir otra.');return;}
 const bb=bounds(g,V(),Q()),origin=V(bb.center.x,bb.min.y,bb.center.z),shape={name:'Forma '+(savedShapes.length+1),parts:poses(g,V(),Q()).map(o=>({shape:normalizeUnitShape(o.part.shape),p:[o.p.x-origin.x,o.p.y-origin.y,o.p.z-origin.z].map(n=>+n.toFixed(5)),q:[o.q.x,o.q.y,o.q.z,o.q.w].map(n=>+n.toFixed(7))}))};
 savedShapes.push(shape);const durable=persistShapes();updateAlphaPanel();announce(shape.name+' guardada · '+shape.parts.length+' unidades'+(durable?'':' · solo en esta sesión; exporta una copia'));
}
function blueprintTargets(bp){return bp.shape.parts.map(part=>{const q=Q();q.set(...part.q);return {shape:normalizeUnitShape(part.shape),p:add(bp.p,bp.q.vmult(V(...part.p))),q:bp.q.mult(q)};}).sort((a,b)=>a.p.y-b.p.y||a.p.x-b.p.x||a.p.z-b.p.z);}
function blueprintBox(bp){const pts=blueprintTargets(bp).flatMap(corners),min=V(Infinity,Infinity,Infinity),max=V(-Infinity,-Infinity,-Infinity);for(const p of pts)for(const k of ['x','y','z']){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}return {...alphaBox(mul(add(min,max),.5),mul(sub(max,min),.5)),size:sub(max,min)};}
function placeBlueprint(shape,p){
 if(!savedShapeValid(shape)||!p||blueprints.length>=6){announce('No se puede colocar otro blueprint aquí.');return null;}
 const bp={id:++alphaSerial,shape:JSON.parse(JSON.stringify(shape)),p:V(p.x,.002,p.z),q:Q(),slots:[],active:false,nextScan:0,status:'Esperando unidades'};const box=blueprintBox(bp);
 if(box.min.y<-.001||box.max.y>ROOM_HEIGHT||Math.max(Math.abs(box.min.x),Math.abs(box.max.x),Math.abs(box.min.z),Math.abs(box.max.z))>13.85||cargos.some(c=>obbOverlap(box,cargoPose(c)))||puzzleObstacleBounds().some(w=>obbOverlap(box,w))||alphaObstacles().some(w=>obbOverlap(box,w))||blueprints.some(other=>obbOverlap(box,blueprintBox(other)))){announce('La forma necesita más espacio libre.');return null;}
 blueprints.push(bp);announce(shape.name+' · clic derecho en el blueprint para integrar');return bp;
}
function nearBlueprint(bp){const used=new Set(bp.slots.map(s=>s.index)),needed=new Set(blueprintTargets(bp).filter((_,i)=>!used.has(i)).map(t=>t.shape));return groups.filter(g=>g.parts.length===1&&needed.has(normalizeUnitShape(g.parts[0].shape))&&!g.route&&!g.pendingMoodOrder&&!g.haulJob&&!g.blueprintJob&&!g.cooler&&!(held?.items||[]).some(i=>i.g===g)&&groupWilling(g)&&bounds(g).min.y<.03&&Math.hypot(g.body.position.x-bp.p.x,g.body.position.z-bp.p.z)<=alphaSettings.blueprintRange).sort((a,b)=>a.body.position.distanceTo(bp.p)-b.body.position.distanceTo(bp.p));}
function activateBlueprint(bp){bp.active=true;bp.nextScan=0;const used=new Set(bp.slots.map(s=>s.index)),available=nearBlueprint(bp).map(g=>normalizeUnitShape(g.parts[0].shape));let missing=0;for(const [i,target] of blueprintTargets(bp).entries()){if(used.has(i))continue;const j=available.indexOf(target.shape);if(j<0)missing++;else available.splice(j,1);}announce(missing>0?'Faltan '+missing+' unidades de la forma indicada en el radio de '+alphaSettings.blueprintRange+' m. Acércalas al blueprint.':'Integrando unidades cercanas');}
function releaseBlueprintSlot(s){const g=s.g;if(!groups.includes(g))return;stopRoute(g);g.blueprintJob=null;g.body.type=CANNON.Body.DYNAMIC;g.body.collisionResponse=true;g.body.updateMassProperties();g.body.velocity.set(0,0,0);g.body.angularVelocity.set(0,0,0);g.body.wakeUp();}
function cancelBlueprint(bp){for(const s of bp.slots)releaseBlueprintSlot(s);blueprints.splice(blueprints.indexOf(bp),1);}
function updateBlueprints(dt){
 for(const bp of [...blueprints]){
  bp.slots=bp.slots.filter(s=>groups.includes(s.g)&&s.g.blueprintJob===s);if(!bp.active)continue;const targets=blueprintTargets(bp),box=blueprintBox(bp);
  if(bp.slots.length<targets.length&&simTime>=bp.nextScan){bp.nextScan=simTime+.25;const g=nearBlueprint(bp)[0];
   if(g){const used=new Set(bp.slots.map(s=>s.index)),index=targets.findIndex((target,i)=>!used.has(i)&&target.shape===normalizeUnitShape(g.parts[0].shape)),angle=index*2.399,radius=Math.max(box.size.x,box.size.z)/2+.25+Math.floor(index/10)*.15,stage=V(bp.p.x+Math.cos(angle)*radius,0,bp.p.z+Math.sin(angle)*radius);
    if(index>=0&&startRoute(g,stage,true)){const pose=targets[index],q=pose.q.mult(g.parts[0].q.inverse()),target={shape:pose.shape,p:sub(pose.p,q.vmult(g.parts[0].offset)),q},slot={g,bp,index,target,stage,state:'walking',t:0};g.blueprintJob=slot;bp.slots.push(slot);}
   }
  }
  let assembling=bp.slots.some(s=>s.state==='assembly');
  for(const slot of bp.slots){const g=slot.g,b=g.body;
   if(slot.state==='walking'&&!g.route&&!g.pendingMoodOrder&&groupWilling(g)&&Math.hypot(b.position.x-slot.stage.x,b.position.z-slot.stage.z)<.10&&!assembling&&targets.slice(0,slot.index).every((_,i)=>bp.slots.some(s=>s.index===i&&s.state==='placed'))){
    slot.state='assembly';slot.fromP=b.position.clone();slot.fromQ=b.quaternion.clone();slot.height=box.max.y+.16;slot.legs=[V(b.position.x,slot.height,b.position.z),V(slot.target.p.x,slot.height,slot.target.p.z),slot.target.p.clone()];slot.leg=0;slot.legStart=b.position.clone();slot.t=0;b.type=CANNON.Body.KINEMATIC;b.velocity.set(0,0,0);b.angularVelocity.set(0,0,0);b.updateMassProperties();assembling=true;
   }
   if(slot.state==='assembly'){
    const to=slot.legs[slot.leg],duration=Math.max(.3,slot.legStart.distanceTo(to)/.35),next=Math.min(1,slot.t+dt/duration),smooth=next*next*(3-2*next),pos=V();slot.legStart.lerp(to,smooth,pos);const q=slot.leg===0?slot.fromQ:slot.leg===1?slerp(slot.fromQ,slot.target.q,smooth):slot.target.q;
    if(!validPose(g,pos,q)){bp.status='Paso de montaje bloqueado';g.speechBuildBlocked=true;continue;}g.speechBuildBlocked=false;slot.t=next;b.position.copy(pos);b.quaternion.copy(q);b.aabbNeedsUpdate=true;
    if(next>=1){slot.leg++;slot.t=0;slot.legStart=b.position.clone();if(slot.leg===3){slot.state='placed';b.position.copy(slot.target.p);b.quaternion.copy(slot.target.q);}}
   }
  }
  const done=bp.slots.filter(s=>s.state==='placed').length;bp.status=done+' / '+targets.length+' integrados · radio '+alphaSettings.blueprintRange+' m';
  if(done===targets.length){const parts=bp.slots.flatMap(s=>worldParts(s.g));for(const s of bp.slots){s.g.blueprintJob=null;removeGroup(s.g);}const g=makeGroup(parts,bp.q);blueprints.splice(blueprints.indexOf(bp),1);selected={g,part:g.parts[0]};multiSelection=[g];queueSpeech(g,'happy',{kind:'built'});announce(bp.shape.name+' construida · '+parts.length+' unidades');}
 }
}
function alphaSceneSnapshot(){return {coolers:coolers.map(c=>({p:[c.p.x,c.p.z],capacity:c.capacity,enabled:c.enabled})),blueprints:blueprints.map(b=>({shape:b.shape,p:[b.p.x,b.p.z]}))};}
function clearAlphaScene(){for(const b of [...blueprints])cancelBlueprint(b);for(const c of [...coolers])removeCooler(c);for(const b of buttonBodies)world.removeBody(b);buttonBodies.length=0;document.querySelector('#completion-panel').hidden=true;}
function restoreAlphaScene(data){if(!data)return;for(const d of data.coolers||[]){const c=createCooler(V(d.p[0],0,d.p[1]));if(c){c.capacity=d.capacity;c.enabled=d.enabled;}}for(const d of data.blueprints||[])placeBlueprint(d.shape,V(d.p[0],0,d.p[1]));}
function showSavedShapes(point){
 if(!savedShapes.length){announce('Primero selecciona una estructura y elige Guardar forma.');return;}
 openCommandMenu(point,'Formas guardadas',savedShapes.map(shape=>({label:shape.name+' · '+shape.parts.length+' u',run:()=>{placeBlueprint(shape,point);captureMouse();}})).concat([{label:'Cerrar',run:()=>captureMouse()}]));
}
function alphaHit(max=4,dir=direction()){
 const o=V(...camera);let best=max,hit=null;
 for(const bp of blueprints){const d=rayPuzzleBox(o,dir,blueprintBox(bp),best);if(d!==null&&d<best){best=d;hit={bp,distance:d,point:bp.p};}}
 for(const c of coolers){const d=rayPuzzleBox(o,dir,alphaBox(add(c.p,V(0,.08,0)),V(.40,.08,.40)),best);if(d!==null&&d<best){best=d;hit={cooler:c,distance:d,point:add(c.p,V(0,.16,0))};}}
 return hit;
}
function alphaSecondary(dir=direction()){
 const hit=alphaHit(4,dir),object=Math.min(aimQubit(4,dir)?.distance??4,aimCargo(4,dir)?.distance??4);if(!hit||hit.distance>object+.02)return false;
 if(hit.bp){const b=hit.bp;openCommandMenu(b.p,b.shape.name+' · '+b.status,[{label:'Integrar cercanos ('+nearBlueprint(b).length+')',run:()=>{activateBlueprint(b);captureMouse();}},{label:'Retirar blueprint',run:()=>{cancelBlueprint(b);captureMouse();}},{label:'Cerrar',run:()=>captureMouse()}]);}
 else {const c=hit.cooler;openCommandMenu(hit.point,'Enfriador · '+c.occupants+' / '+c.capacity,[{label:c.enabled?'Desactivar':'Activar',run:()=>{c.enabled=!c.enabled;captureMouse();}},{label:'Retirar enfriador',run:()=>{removeCooler(c);captureMouse();}},{label:'Cerrar',run:()=>captureMouse()}]);}return true;
}
function openAlphaPanel(hit=null){pause();panel.hidden=false;if(hit)selected=hit;updatePanel();switchPanelTab('alpha');updateAlphaPanel();}
function renameQubit(){if(!selected||!groups.includes(selected.g))return;const input=document.querySelector('#qubit-name'),name=String(input.value||'').replace(/[\u0000-\u001f]/g,'').trim().slice(0,24);selected.part.mood.name=name||unitLabel(selected.part)+' '+selected.part.id;input.value=selected.part.mood.name;announce('Nombre guardado');}
function updateAlphaPanel(){
 document.querySelector('#qubit-name').value=selected?.part.mood.name||'';document.querySelector('#qubit-name').disabled=!selected;
 document.querySelector('#rename-qubit').disabled=!selected;document.querySelector('#save-shape').disabled=!selected;
 for(const key of ['maxRest','coolSeconds','capacity','blueprintRange','exitEnergy','glow']){document.querySelector('#alpha-'+key).value=alphaSettings[key];document.querySelector('#alpha-'+key+'Value').textContent=key==='exitEnergy'?Math.round(alphaSettings[key]*100)+' %':alphaSettings[key]+({maxRest:' s',coolSeconds:' s',capacity:' u',blueprintRange:' m',glow:''}[key]||'');}
 document.querySelector('#alpha-coolingOn').checked=alphaSettings.coolingOn;document.querySelector('#alpha-allowPuzzleSpawn').checked=alphaSettings.allowPuzzleSpawn;
 const list=document.querySelector('#saved-shape-list');list.replaceChildren();for(const shape of savedShapes){const row=document.createElement('div'),button=document.createElement('button');button.type='button';button.textContent=shape.name+' · '+shape.parts.length+' u';button.addEventListener('click',()=>{const p=floorAim()||V(position[0]-Math.sin(yaw)*1.4,0,position[2]-Math.cos(yaw)*1.4);placeBlueprint(shape,p);panel.hidden=true;captureMouse();});row.appendChild(button);
  const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Borrar '+shape.name);remove.addEventListener('click',()=>{savedShapes.splice(savedShapes.indexOf(shape),1);persistShapes();updateAlphaPanel();});row.appendChild(remove);list.appendChild(row);}
}
function exportShapes(){const blob=new Blob([JSON.stringify({version:1,shapes:savedShapes},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Q-bits_formas.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function importShapesData(data){const input=data?.version===1?data.shapes:null;if(!Array.isArray(input)||input.length>32||!input.every(savedShapeValid))throw new Error('Archivo de formas inválido');savedShapes.splice(0,savedShapes.length,...input.map(s=>JSON.parse(JSON.stringify(s))));persistShapes();updateAlphaPanel();return input.length;}
function showPuzzleComplete(){
 pause();panel.hidden=true;document.querySelector('#completion-panel').hidden=false;document.querySelector('#completion-detail').textContent='Tres materiales entregados · '+puzzle.earned+' nuevos Q-bits. La última recompensa te espera al volver a la sala.';
}
function updateAlphaHUD(){
 let qCount=0,tCount=0;for(const g of groups)for(const part of g.parts){if(isTBit(part))tCount++;else qCount++;}
 document.querySelector('#alpha-census-text').textContent='× '+qCount+' Q'+(tCount?' · '+tCount+' T':'');
 if(!panel.hidden||!commandMenu.hidden||held)return;const h=alphaHit(5);if(!h)return;
 if(h.bp)targetLabel.textContent=h.bp.shape.name+' · '+h.bp.status+' · clic derecho';
 if(h.cooler){const c=h.cooler,values=[...c.entries.values()],remaining=values.length?Math.ceil(Math.max(...values.map(v=>alphaSettings.coolSeconds-v.elapsed))):alphaSettings.coolSeconds;targetLabel.textContent='Enfriador · '+c.occupants+'/'+c.capacity+' · '+(!c.enabled||!alphaSettings.coolingOn?'apagado':values.length&&remaining===0?'listos · energía '+Math.round(alphaSettings.exitEnergy*100)+' %':remaining+' s');}
}
function buildLathe(profile,segments=20){const data=[];const tri=(a,b,c)=>{const normal=sub(b,a).cross(sub(c,a));normal.normalize();for(const p of [a,b,c])data.push(p.x,p.y,p.z,normal.x,normal.y,normal.z);};
 for(let j=0;j<profile.length-1;j++)for(let i=0;i<segments;i++){const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2,[r,y]=profile[j],[r2,y2]=profile[j+1];const p=V(Math.cos(a)*r,y,Math.sin(a)*r),q=V(Math.cos(b)*r,y,Math.sin(b)*r),s=V(Math.cos(a)*r2,y2,Math.sin(a)*r2),t=V(Math.cos(b)*r2,y2,Math.sin(b)*r2);tri(p,s,q);tri(q,s,t);}
 return {buffer:buffer(data),count:data.length/6};}
// Soft ceramic shoulders, a thin graphite lip and a recessed receiving tray.
// All dimensions stay inside the existing cooler collision envelope.
const coolerBodyMesh=buildLathe([[0,.002],[.38,.002],[.395,.014],[.40,.025],[.397,.043],[.38,.10],[.358,.136],[.35,.145],[.32,.145],[.32,.018],[0,.018]],48);
const coolerRimMesh=buildLathe([[.32,.135],[.323,.151],[.329,.155],[.343,.155],[.35,.14]],48);
const coolerAccentMesh=buildLathe([[.384,.068],[.386,.074]],48);
const coolerTrayMesh=buildLathe([[0,.0183],[.295,.0183],[.311,.022],[.316,.028]],48);
const coolerBaseMesh=buildLathe([[.375,.003],[.39,.010],[.394,.017]],48);
function buildBoxAssembly(boxes){
 const data=[],faces=[[[0,1,2,3],[0,-1,0]],[[7,6,5,4],[0,1,0]],[[0,3,7,4],[-1,0,0]],[[1,5,6,2],[1,0,0]],[[0,4,5,1],[0,0,-1]],[[3,2,6,7],[0,0,1]]];
 for(const [p,size] of boxes){const h=mul(size,.5),v=[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1],[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1]];
  for(const [indices,n] of faces)for(const k of [0,1,2,0,2,3]){const a=v[indices[k]];data.push(p.x+a[0]*h.x,p.y+a[1]*h.y,p.z+a[2]*h.z,...n);}
 }return {buffer:buffer(data),count:data.length/6};
}
function drawAsset(mesh,p,q,size,color,kind=5){bindGeometry(mesh.buffer);gl.uniform1f(uniforms.uKind,kind);setPose(p,q,size);tint(...color);gl.drawArrays(gl.TRIANGLES,0,mesh.count);}
function makeButtonPhysics(buttons=puzzle.buttons){
 for(const b of buttons){b.diameter=b.half*3.05;b.surface=b.diameter*.167*.6;const body=new CANNON.Body({mass:0});body.addShape(new CANNON.Cylinder(b.half,b.half,.004,16),V(),Q().setFromEuler(-Math.PI/2,0,0));body.position.set(b.p.x,b.surface-.002,b.p.z);body.collisionFilterMask=-1;world.addBody(body);buttonBodies.push(body);b.pressBody=body;}
}
function updateButtonPhysics(){
 for(const b of activePressureButtons()){const next=b.diameter*.167*.6-b.pressed*.004;if(Math.abs(next-b.surface)>1e-6){for(const g of groups)if(Math.hypot(g.body.position.x-b.p.x,g.body.position.z-b.p.z)<b.half+.1)g.body.wakeUp();b.surface=next;b.pressBody.position.y=next-.002;b.pressBody.aabbNeedsUpdate=true;}}
}
function drawAlphaButtons(buttons=puzzle.buttons){
 gl.depthMask(true);gl.disable(gl.BLEND);
 for(const b of buttons){const scale=V(b.diameter,b.diameter*.6,b.diameter),pressed=b.pressed*.004;
  for(let i=0;i<4;i++){const a=i*Math.PI/2,q=Q();q.setFromAxisAngle(V(0,1,0),a);drawAsset({buffer:cubeGeometry,count:36},add(b.p,V(Math.sin(a)*b.diameter*.45,.012,Math.cos(a)*b.diameter*.45)),q,V(b.diameter*.18,.024,b.diameter*.23),[.28,.30,.31,1]);}
  drawAsset(buttonMeshes[0],add(b.p,V(0,.0008,0)),Q(),scale,[.90,.91,.91,1]);
  drawAsset(buttonMeshes[1],add(b.p,V(0,.0008-pressed,0)),Q(),scale,[.95,.96,.95,1]);
  // The unlit track and continuous charge arc share the cap's 3D rim.
  gl.uniform1f(uniforms.uScale,b.pressed);
  drawAsset(buttonChargeMesh,add(b.p,V(0,.0008-pressed,0)),Q(),scale,[.37,.86,.77,1],9);
 }
}
function renderRouteMetrics(g){if(g.renderRouteCache?.route===g.route&&simTime<g.renderRouteCache.until)return g.renderRouteCache.info;const info=groupRouteMetrics(g);g.renderRouteCache={route:g.route,until:simTime+.18,info};return info;}
function drawNeonPath(points,color=[.28,.68,.73]){
 if(!points.length)return;gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
 for(let i=0;i+1<points.length;i+=2){const a=points[i],b=points[i+1],d=sub(b,a),length=Math.hypot(d.x,d.z);if(length<.001)continue;const q=Q();q.setFromAxisAngle(V(0,1,0),Math.atan2(d.x,d.z));const center=mul(add(a,b),.5);center.y=Math.max(.006,center.y);
  bindGeometry(cubeGeometry);gl.uniform1f(uniforms.uKind,8);setPose(center,q,V(.055,.001,length));tint(...color,.22*alphaSettings.glow);gl.drawArrays(gl.TRIANGLES,0,36);drawBox(add(center,V(0,.001,0)),q,V(.003,.001,length),[...color,.8]);
 }gl.depthMask(true);gl.disable(gl.BLEND);
}
function drawAlpha(){
 for(const c of coolers){drawAsset(coolerBodyMesh,c.p,Q(),V(1,1,1),[.93,.94,.94,1]);drawAsset(coolerTrayMesh,c.p,Q(),V(1,1,1),[.24,.27,.28,1]);drawAsset(coolerBaseMesh,c.p,Q(),V(1,1,1),[.23,.25,.26,1]);drawAsset(coolerRimMesh,c.p,Q(),V(1,1,1),[.35,.38,.39,1]);drawAsset(coolerAccentMesh,c.p,Q(),V(1,1,1),c.enabled&&alphaSettings.coolingOn?[.53,.75,.79,1]:[.4,.43,.44,1]);}
 gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
 for(const bp of blueprints){const occupied=new Set(bp.slots.filter(s=>s.state==='placed').map(s=>s.index));const targets=blueprintTargets(bp);for(let i=0;i<targets.length;i++){if(occupied.has(i))continue;const t=targets[i];if(isTBit(t)){drawUnitMesh(t,[.27,.67,.73,.07],4);drawUnitOutline(t,.4,true);}else{drawBox(t.p,t.q,V(.088,.088,.088),[.27,.67,.73,.07]);drawOutline(t.p,t.q,V(.09,.09,.09),.4,true);}}const bb=blueprintBox(bp);drawRing(V(bp.p.x,.007,bp.p.z),Math.max(.1,Math.min(.65,Math.max(bb.size.x,bb.size.z)/2+.08)),.35);}
 for(const c of coolers)if(c.enabled&&alphaSettings.coolingOn){bindGeometry(cubeGeometry);gl.uniform1f(uniforms.uKind,7);setPose(add(c.p,V(0,.002,0)),Q(),V(1.15,.001,1.15));tint(.2,.63,.73,.13*alphaSettings.glow);gl.drawArrays(gl.TRIANGLES,0,36);}
 gl.depthMask(true);gl.disable(gl.BLEND);
}
function updateAccentLights(){const lights=[];if(puzzle.active)for(const p of puzzle.portals)lights.push({p:V(p.x,.8,p.z+.25),c:p.rgb.map(v=>v*p.frame*p.energy)});for(const c of coolers)if(c.enabled&&alphaSettings.coolingOn)lights.push({p:add(c.p,V(0,.3,0)),c:[.2,.65,.8]});lights.sort((a,b)=>a.p.distanceTo(V(...camera))-b.p.distanceTo(V(...camera)));const pos=[],colors=[];for(let i=0;i<4;i++){pos.push(...(lights[i]?[lights[i].p.x,lights[i].p.y,lights[i].p.z]:[0,-100,0]));colors.push(...(lights[i]?.c||[0,0,0]));}gl.uniform3fv(uniforms['uLightPos[0]'],pos);gl.uniform3fv(uniforms['uLightColor[0]'],colors);gl.uniform1f(uniforms.uGlow,alphaSettings.glow);}
loadSavedShapes();
document.querySelector('#rename-qubit').addEventListener('click',renameQubit);
document.querySelector('#save-shape').addEventListener('click',()=>saveShape(selected?.g));
document.querySelector('#place-cooler').addEventListener('click',()=>{const p=floorAim()||V(position[0]-Math.sin(yaw)*1.3,0,position[2]-Math.cos(yaw)*1.3);createCooler(p);});
document.querySelector('#export-shapes').addEventListener('click',exportShapes);
document.querySelector('#import-shapes').addEventListener('change',async e=>{try{const file=e.target.files?.[0];if(!file)return;if(file.size>1000000)throw new Error('Archivo demasiado grande');const count=importShapesData(JSON.parse(await file.text()));announce(count+' formas importadas');}catch(error){announce('No se pudo importar: '+error.message);}e.target.value='';});
for(const key of ['maxRest','coolSeconds','capacity','blueprintRange','exitEnergy','glow'])document.querySelector('#alpha-'+key).addEventListener('input',e=>{const n=Number(e.target.value),ranges={maxRest:[15,180],coolSeconds:[5,60],capacity:[1,8],blueprintRange:[.5,3],exitEnergy:[.25,.75],glow:[0,1]};if(Number.isFinite(n))alphaSettings[key]=clamp(n,...ranges[key]);updateAlphaPanel();});
for(const key of ['coolingOn','allowPuzzleSpawn'])document.querySelector('#alpha-'+key).addEventListener('change',e=>{alphaSettings[key]=!!e.target.checked;updatePuzzlePanel();updateAlphaPanel();});
document.querySelector('#completion-continue').addEventListener('click',()=>{document.querySelector('#completion-panel').hidden=true;captureMouse();});
document.querySelector('#completion-restart').addEventListener('click',()=>{document.querySelector('#completion-panel').hidden=true;startPuzzle();captureMouse();});
document.querySelector('#completion-lab').addEventListener('click',()=>{document.querySelector('#completion-panel').hidden=true;leavePuzzle();panel.hidden=false;switchPanelTab('puzzle');});

// Low-poly reconstruction of the supplied STL silhouette: 122.25 mm diameter,
// 20.45 mm actuator height, stepped circular housing and four mounting tabs.


const buttonMeshes=[
 buildLathe([[0,.002],[.49,.002],[.5,.045],[.46,.085],[.38,.115],[.335,.12],[.32,.12],[.32,.04],[0,.04]],32),
 buildLathe([[0,.12],[.305,.12],[.315,.145],[.29,.167],[0,.167]],32)
];
const buttonChargeMesh=buildLathe([[.276,.1686],[.292,.1686],[.309,.151]],128);

// Q-bits dialogue director. Text is scheduled outside the 240 Hz physics loop.
// Three reusable DOM nodes, bounded queues, one speaker per structure.
function registerSpeechGroup(g){
 for(const p of g.parts){let s=speech.people.get(p.id);if(!s){s={id:p.id,next:simTime+26+Math.random()*24,last:-100,lastEvent:Object.create(null),recent:[],closeDwell:0,lastClose:-100,inspectArmed:true,inspectAway:8,state:p.mood.state,cooling:false,blocked:false,resting:false,lastTask:false,wasNearby:false,alone:0};speech.people.set(p.id,s);}s.g=g;s.part=p;}
 g.body.addEventListener('collide',onSpeechCollision);
}
function removeSpeechGroup(g){
 g.body.removeEventListener('collide',onSpeechCollision);
 for(const slot of speech.slots)if(slot.s?.g===g)clearSpeechSlot(slot);
 speech.queue=speech.queue.filter(e=>e.s.g!==g);
 for(const p of g.parts){const s=speech.people.get(p.id);if(s?.g===g)s.g=null;}
}
function speechRepresentative(g,part=null){
 if(!g?.parts?.length)return null;
 if(part)return speech.people.get(part.id);
 if(held?.g===g)return speech.people.get(held.part.id);
 let best=g.parts[0],distance=Infinity;
 for(const p of g.parts){const pos=partPose(g,p).p,d=(pos.x-camera[0])**2+(pos.y-camera[1])**2+(pos.z-camera[2])**2;if(d<distance){distance=d;best=p;}}
 return speech.people.get(best.id);
}
function speechAvailable(){return (!story.ready||story.scene==='lab'||campaignAmbientAllowed())&&speech.enabled&&speech.ready&&!document.hidden&&panel.hidden&&menu.hidden&&commandMenu.hidden&&!marquee&&document.querySelector('#completion-panel').hidden;}
function speechScreen(s){
 if(!s?.g)return null;const pos=partPose(s.g,s.part).p;
 if((pos.x-camera[0])**2+(pos.y-camera[1])**2+(pos.z-camera[2])**2>36)return null;
 const screen=project(pos),w=canvas.clientWidth,h=canvas.clientHeight;
 return screen&&screen.x>12&&screen.x<w-12&&screen.y>64&&screen.y<h-55?{pos,screen}:null;
}
function speechVisible(s,screen=speechScreen(s)){
 if(!screen)return false;
 speech.ray.reset();world.raycastClosest(V(...camera),screen.pos,{skipBackfaces:true},speech.ray);
 return !speech.ray.hasHit||speech.ray.body===s.g.body;
}
function queueSpeech(g,category,options={}){
 if(!speechAvailable()||!QBIT_LINES[category])return false;
 const s=speechRepresentative(g,options.part);if(!s||!speechScreen(s))return false;
 const priority=options.priority??SPEECH_PRIORITY[category]??20,now=simTime;
 const cadence={close:75,shake:35,bump:35,blocked:45,calm:45,angry:50,cooling:45,order:20,happy:25,helped:30};
 const cooldown=Math.max(options.cooldown||0,cadence[category]??(priority>=50?30:60));
 if(now-(s.lastEvent[category]??-100)<cooldown||now-s.last<(priority>=85?12:20))return false;
 if(priority<50&&(now<speech.ambientAfter||speech.slots.some(b=>b.s)))return false;
 const active=speech.slots.find(b=>b.s?.g===g);
 if(active&&priority<=active.event.priority)return false;
 const older=speech.queue.find(e=>e.s.g===g);
 if(older&&older.priority>priority)return false;
 if(!older&&speech.queue.length>=4){let least=0;for(let i=1;i<speech.queue.length;i++)if(speech.queue[i].priority<speech.queue[least].priority)least=i;if(speech.queue[least].priority>=priority)return false;speech.queue.splice(least,1);}
 if(older)speech.queue.splice(speech.queue.indexOf(older),1);
 s.lastEvent[category]=now;
 speech.queue.push({s,category,kind:options.kind||'',indices:options.indices||null,priority,created:now,expires:now+(options.ttl??5)});
 return true;
}
function speechIndices(e){
 const s=e.s,g=s.g,m=s.part.mood,cat=e.category;
 if(e.indices)return e.indices;
 if(cat==='social')return e.kind==='together'?[2]:[0,1];
 if(cat==='participate')return e.kind==='blueprint'?[5,6,7,8,9]:[0,1,2,3,4];
 if(cat==='comment')return e.kind==='changed'?[0,1,2,3,4]:[5,6,7,8,9];
 if(cat==='calm')return e.kind==='retry-blocked'?[15,16,17,18,19]:e.kind==='retry'?[14]:[0,1,2,3,4,5,6,7,8,9,10,11,12,13];
 if(cat==='angry'&&m.reason!=='bloqueado')return [0,1,2,3,4,5,6,7,8,9,10,11,12,14,15,16,17,18,19];
 if(cat==='order'){const a=[1,2,3,4,5,6,7,11,12,13,14,15,16,17,18,19];if(e.kind==='long')a.push(0);if(e.kind==='changed')a.push(8);if(g.blueprintJob)a.push(10);return a;}
 if(cat==='happy'){const a=[0,1,4,10,12,17,18,19];if(e.kind==='arrived')a.push(2,3);if(e.kind==='built')a.push(6,7,8,9,11,15,16);if(e.kind==='delivered')a.push(14);if(g.parts.length>1||e.kind==='delivered'||e.kind==='built')a.push(5,13);return a;}
 if(cat==='working'){if(g.blueprintJob)return [0,1,2,3,4,7,8,9,10,12,13,14,15,16,17,18,19];if(g.moodDuty)return [0,2,7,11,12,17,18,19];return [0,1,2,3,5,6,7,12,13,15,16,17,18,19];}
 if(cat==='pushing')return e.kind==='waiting'?[17,18]:[0,1,2,3,4,5,6,7,8,9,10,11,12,14,15,16,19];
 if(cat==='excited')return e.kind==='blueprint'?[7,8,18,22,24]:e.kind==='crew'?[12,14,21,22,25]:[0,1,2,3,4,5,6,9,10,11,13,14,15,16,17,18,19,20,23,25,26,27];
 if(cat==='close'&&e.kind==='pickup')return [0,1,2,3,4,6,12,13,14,16,17,18];
 return QBIT_LINES[cat].map((_,i)=>i);
}
function speechEventValid(e,active=false){
 const g=e.s.g;if(!g||!active&&simTime>e.expires)return false;const m=e.s.part.mood,blocked=!!(g.pendingMoodOrder?.reason==='bloqueo'||g.haulJob?.phase==='bloqueado'||g.speechBuildBlocked);
 if(e.category==='blocked')return blocked;
 if(e.category==='angry')return m.state==='restless'&&!g.cooler;
 if(e.category==='cooling')return !!g.cooler;
 if(e.category==='excited')return m.state==='excited'&&!g.cooler;
 if(e.category==='pushing')return !!g.haulJob&&(e.kind==='waiting'?g.haulJob.phase==='reuniendo':g.haulJob.phase==='arrastrando');
 if(e.category==='working')return !!(g.route||g.haulJob||g.blueprintJob||g.moodDuty);
 if(e.category==='order')return !!(g.route||g.haulJob||g.blueprintJob);
 if(e.category==='helped')return !blocked;
 if(e.category==='calm')return e.kind==='retry-blocked'?blocked:!g.cooler&&(m.state==='restless'||g.pendingMoodOrder!=null);
 if(e.category==='shake')return held?.items.some(i=>i.g===g)||simTime-e.created<1.3;
 if(e.category==='participate')return !g.route&&!g.pendingMoodOrder&&!g.haulJob&&!g.blueprintJob&&!g.cooler&&m.state!=='restless';
 if(['neutral','attention','social','comment'].includes(e.category))return !g.cooler&&m.state!=='restless'&&!g.pendingMoodOrder;
 return true;
}
function chooseSpeech(e){
 const lines=QBIT_LINES[e.category],indices=speechIndices(e),recent=speech.recent;
 let options=indices.filter(i=>!recent.includes(lines[i])&&!e.s.recent.includes(lines[i])&&simTime-(speech.used.get(lines[i])??-1000)>180);
 if(!options.length)options=indices.filter(i=>simTime-(speech.used.get(lines[i])??-1000)>240);
 if(!options.length)return null;
 // Favor text not heard recently while keeping a little variation between Q-bits.
 options.sort((a,b)=>(speech.used.get(lines[a])??-1000)-(speech.used.get(lines[b])??-1000));
 const text=lines[options[Math.floor(Math.random()*Math.min(5,options.length))]];
 e.s.recent.push(text);if(e.s.recent.length>6)e.s.recent.shift();recent.push(text);if(recent.length>22)recent.shift();speech.used.set(text,simTime);
 return text;
}
function clearSpeechSlot(slot){slot.s=null;slot.event=null;slot.node.hidden=true;slot.node.style.opacity='0';}
function startSpeech(e,slot){
 const text=chooseSpeech(e);if(!text)return false;
 const faces=e.category==='social'&&e.kind==='alone'?['(｡•́︿•̀｡)']:(SPEECH_FACES[e.category]||SPEECH_FACES.neutral);
 slot.text.textContent=text;slot.face.textContent=text==='...'?'':Math.random()<.30?' '+faces[Math.floor(Math.random()*faces.length)]:'';
 slot.node.dataset.tone=['angry','blocked','bump','shake'].includes(e.category)?'tense':e.category==='excited'||e.category==='happy'?'bright':'calm';
 slot.node.setAttribute('aria-label',e.s.part.mood.name+': '+text+slot.face.textContent);
 slot.s=e.s;slot.event=e;slot.start=simTime;slot.end=simTime+clamp(2.5+text.length/18,3.1,7.2);slot.nextVisibility=0;slot.visible=false;
 slot.node.hidden=false;slot.node.style.visibility='hidden';slot.node.style.opacity='0';
 slot.w=slot.node.offsetWidth;slot.h=slot.node.offsetHeight;
 e.s.last=simTime;e.s.next=slot.end+44+Math.random()*36;
 speech.lastEnd=slot.end;speech.nextStart=slot.end+6+Math.random()*4;speech.ambientAfter=slot.end+21+Math.random()*15;
 return true;
}
function intersectsSpeech(a,b,pad=10){return a.x<b.x+b.w+pad&&a.x+a.w+pad>b.x&&a.y<b.y+b.h+pad&&a.y+a.h+pad>b.y;}
function layoutSpeech(){
 const w=canvas.clientWidth,h=canvas.clientHeight,placed=[];
 if(simTime>=speech.nextObstacles){speech.nextObstacles=simTime+.2;speech.obstacles=[];
  const el=document.querySelector('#callout-text');if(callout.style.opacity==='1'){const r=el.getBoundingClientRect();if(r.width&&r.height)speech.obstacles.push({x:r.left-8,y:r.top-8,w:r.width+16,h:r.height+16});}
 }
 for(const slot of speech.slots){if(!slot.s)continue;
  const screen=speechScreen(slot.s);
  if(simTime>=slot.nextVisibility){slot.visible=speechVisible(slot.s,screen);slot.nextVisibility=simTime+.25;}
  if(!screen||!slot.visible){slot.node.style.visibility='hidden';continue;}
  const anchor=project(add(screen.pos,V(0,.065,0)))||screen.screen;
  const options=[[-slot.w/2,-slot.h-22],[-slot.w-22,-slot.h-12],[22,-slot.h-12],[-slot.w/2,-slot.h-58],[-slot.w-28,14],[28,14]];
  let box=null;
  for(const [dx,dy] of options){const b={x:clamp(anchor.x+dx,14,w-slot.w-14),y:anchor.y+dy,w:slot.w,h:slot.h};
   if(b.y<70||b.y+b.h>h-76||placed.some(o=>intersectsSpeech(b,o,15))||speech.obstacles.some(o=>intersectsSpeech(b,o)))continue;
   box=b;break;
  }
  if(!box){slot.node.style.visibility='hidden';continue;}
  placed.push(box);slot.node.style.visibility='visible';slot.node.style.transform='translate3d('+Math.round(box.x)+'px,'+Math.round(box.y)+'px,0)';
  slot.node.style.setProperty('--tail-x',clamp(anchor.x-box.x,12,slot.w-12)+'px');
  slot.node.dataset.tail=box.y>anchor.y?'up':'down';
  slot.node.style.opacity=String(Math.min(1,(simTime-slot.start)/.16,(slot.end-simTime)/.35));
 }
}
function onSpeechCollision(event){
 const a=event.target?.qubitGroup,b=event.body?.qubitGroup;if(!a||!b||a===b||a.body.id>b.body.id||!speech.ready)return;
 const carried=held?.items.some(i=>i.g===a||i.g===b);
 const speed=typeof event.contact?.getImpactVelocityAlongNormal==='function'?Math.abs(event.contact.getImpactVelocityAlongNormal()):a.body.velocity.distanceTo(b.body.velocity);
 if(speed<(carried?.20:.85))return;
 const key=Math.min(a.parts[0].id,b.parts[0].id)+':'+Math.max(a.parts[0].id,b.parts[0].id);
 if(simTime-(speech.impacts.get(key)??-100)<8)return;
 speech.impacts.set(key,simTime);if(speech.impacts.size>64)speech.impacts.delete(speech.impacts.keys().next().value);
 const target=held?.items.some(i=>i.g===a)?b:held?.items.some(i=>i.g===b)?a:(a.body.velocity.norm()<b.body.velocity.norm()?a:b);
 queueSpeech(target,'bump',{priority:89,ttl:3});
}
function noteSpeechLook(dx,dy){
 speech.lastInput=simTime;if(!held||held.age<.25||shiftDown()||!speech.enabled)return;
 const id=held.part.id,axis=Math.abs(dx)>Math.abs(dy)?'x':'y',amount=axis==='x'?dx:dy;
 if(Math.abs(amount)<2)return;
 let sh=speech.shake;
 if(!sh||sh.id!==id||simTime-sh.last>.35||simTime-sh.start>1.3)sh=speech.shake={id,axis,start:simTime,last:simTime,sign:Math.sign(amount),segment:0,travel:0,turns:0};
 const sign=Math.sign(amount);
 if(sh.axis===axis&&sign!==sh.sign&&sh.segment>=12){sh.turns++;sh.segment=0;sh.sign=sign;}
 if(sh.axis!==axis){sh.axis=axis;sh.segment=0;sh.sign=sign;}
 sh.segment+=Math.abs(amount);sh.travel+=Math.abs(amount);sh.last=simTime;
 if(sh.turns>=3&&sh.travel>=100){queueSpeech(held.g,'shake',{part:held.part,priority:95,ttl:3.5,cooldown:7});speech.shake=null;}
}
function scanSpeech(){
 const all=[];let activeWork=false;for(const g of groups){const s=speechRepresentative(g);if(s){all.push(s);if(g.route||g.haulJob||g.blueprintJob||held?.g===g)activeWork=true;}}
 const basis=direction(),cam=V(...camera);
 for(const s of all){const g=s.g,m=s.part.mood,pos=partPose(g,s.part).p,carried=!!held?.items.some(i=>i.g===g),task=!!(g.route||g.haulJob||g.blueprintJob),blocked=!!(g.pendingMoodOrder?.reason==='bloqueo'||g.haulJob?.phase==='bloqueado'||g.speechBuildBlocked),cooling=!!g.cooler;
  if(cooling&&!s.cooling)queueSpeech(g,'cooling',{priority:76});
  if(!cooling&&m.state==='restless'&&s.state!=='restless')queueSpeech(g,m.severity>=3?'angry':blocked?'blocked':'calm',{priority:72});
  if(!cooling&&m.state==='restless'&&s.state==='restless'&&!s.resting&&m.restTotal-m.restLeft>2.8){queueSpeech(g,m.severity>=3?'angry':'calm',{priority:60});s.resting=true;}
  if(m.state!=='restless')s.resting=false;
  if(!cooling&&m.state==='excited'&&s.state!=='excited')queueSpeech(g,'excited',{priority:40});
  if(blocked&&!s.blocked)queueSpeech(g,'blocked',{priority:68});
  if(!blocked&&s.blocked&&task&&m.state!=='restless')queueSpeech(g,'helped',{priority:73});
  s.state=m.state;s.cooling=cooling;s.blocked=blocked;
  const distance=pos.distanceTo(cam),toward=sub(pos,cam);toward.normalize();
  const inspecting=(carried&&held.g===g&&held.part.id===s.id&&distance<.9||!carried&&distance<1.95&&toward.dot(basis)>.996)&&!shiftDown();
  s.closeDwell=inspecting?s.closeDwell+.25:0;
  if(inspecting)s.inspectAway=0;else{s.inspectAway+=.25;if(s.inspectAway>=8)s.inspectArmed=true;}
  if(s.closeDwell>1.2&&s.inspectArmed){s.inspectArmed=false;if(simTime-s.lastClose>75&&queueSpeech(g,'close',{part:s.part,priority:62,ttl:3}))s.lastClose=simTime;}
  if(simTime<s.next||simTime<24||carried)continue;
  s.next=simTime+35+Math.random()*30;
  if(!speechScreen(s))continue;
  if(cooling){queueSpeech(g,'cooling');continue;}
  if(m.state==='restless'){queueSpeech(g,m.severity>=3?'angry':'calm');continue;}
  if(blocked){queueSpeech(g,m.strikes>0?'calm':'blocked',{kind:m.strikes>0?'retry-blocked':''});continue;}
  if(g.haulJob){if(m.state==='excited'&&g.haulJob.phase==='arrastrando'&&Math.random()<.2)queueSpeech(g,'excited',{kind:'crew'});else queueSpeech(g,g.haulJob.phase==='arrastrando'||g.haulJob.phase==='reuniendo'?'pushing':'working',{kind:g.haulJob.phase==='reuniendo'?'waiting':''});continue;}
  if(task||g.moodDuty){queueSpeech(g,'working');continue;}
  let nearby=false;for(const other of all){if(other===s)continue;if(g.body.position.distanceTo(other.g.body.position)<.5){nearby=true;break;}}
  s.alone=nearby?0:s.alone+12;
  const bp=blueprints.find(b=>Math.hypot(b.p.x-pos.x,b.p.z-pos.z)<=alphaSettings.blueprintRange);
  if(bp){queueSpeech(g,m.state==='excited'&&Math.random()<.35?'excited':'participate',{kind:'blueprint'});continue;}
  if(activeWork&&distance<3.3&&Math.random()<.55){queueSpeech(g,'participate');continue;}
  if(nearby&&!s.wasNearby){queueSpeech(g,'social',{kind:'together'});s.wasNearby=true;continue;}s.wasNearby=nearby;
  if(m.state==='excited'&&Math.random()<.65){queueSpeech(g,'excited');continue;}
  if(s.alone>50&&all.length>1&&Math.random()<.25){queueSpeech(g,'social',{kind:'alone'});continue;}
  queueSpeech(g,simTime-speech.lastInput>20&&Math.random()<.4?'attention':Math.random()<.12?'comment':'neutral');
 }
 for(const [id,s] of speech.people)if(!s.g)speech.people.delete(id);
}
function updateSpeech(){
 if(!speech.ready)return;
 const max=1;
 if(!speechAvailable()){for(const b of speech.slots)if(b.s)clearSpeechSlot(b);speech.queue.length=0;return;}
 for(let i=0;i<speech.slots.length;i++){const b=speech.slots[i];if(b.s&&(simTime>=b.end||!b.s.g||i>=max||!speechEventValid(b.event,true)))clearSpeechSlot(b);}
 if(simTime>=speech.nextScan){speech.nextScan=simTime+.25;scanSpeech();}
 speech.queue=speech.queue.filter(e=>speechEventValid(e));
 if(speech.queue.length&&!speech.slots.some(b=>b.s)){speech.queue.sort((a,b)=>b.priority-a.priority||a.created-b.created);
  let attempts=0;
  for(const e of [...speech.queue]){if(attempts++>=4)break;
   const allowed=e.priority>=85?speech.lastEnd+2:e.priority>=50?speech.nextStart:speech.ambientAfter;if(simTime<allowed)continue;
   const existing=speech.slots.find(b=>b.s?.g===e.s.g);
   if(existing&&e.priority<=existing.event.priority)continue;
   let slot=existing||speech.slots.slice(0,max).find(b=>!b.s);
   if(!slot&&e.priority>=85){slot=speech.slots.slice(0,max).find(b=>b.event.priority<45&&simTime-b.start>1.8);}
   if(!slot)break;
   if(!speechVisible(e.s)){speech.queue.splice(speech.queue.indexOf(e),1);continue;}
   if(existing&&simTime-existing.start<1.8)continue;
   if(slot.s)clearSpeechSlot(slot);
   speech.queue.splice(speech.queue.indexOf(e),1);
   if(startSpeech(e,slot))break;
  }
 }
 if(simTime>=speech.nextLayout){speech.nextLayout=simTime+1/30;layoutSpeech();}
}
function initSpeech(){
 const layer=document.querySelector('#qbit-dialogues');
 for(let i=0;i<3;i++){const node=document.createElement('div'),text=document.createElement('span'),face=document.createElement('span');node.className='qbit-speech';face.className='qbit-face';node.append(text,face);node.hidden=true;layer.appendChild(node);speech.slots.push({node,text,face,s:null,event:null});}
 speech.ray=new CANNON.RaycastResult();speech.ready=true;
 try{speech.enabled=readQbitsStorage('qbits.dialogue.enabled.v1')!=='false';}catch{}
 const toggle=document.querySelector('#dialogues-enabled');toggle.checked=speech.enabled;toggle.addEventListener('change',()=>{speech.enabled=toggle.checked;try{window.localStorage.setItem('qbits.dialogue.enabled.v1',String(speech.enabled));}catch{}if(!speech.enabled){speech.queue.length=0;for(const s of speech.slots)clearSpeechSlot(s);}});
}


function fullscreenActive(){return !!(document.fullscreenElement||document.webkitFullscreenElement);}
function syncFullscreenButton(){const active=fullscreenActive(),button=document.querySelector('#fullscreen-button');button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',active?'Salir de pantalla completa':'Entrar en pantalla completa');button.title=active?'Salir de pantalla completa':'Pantalla completa';resize();redraw=true;}
async function toggleFullscreen(){
 try{if(fullscreenActive()){const exit=document.exitFullscreen||document.webkitExitFullscreen;if(exit)await exit.call(document);}else{const enter=document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen;if(!enter){announce('Pantalla completa no está disponible en este navegador.');return;}await enter.call(document.documentElement);}syncFullscreenButton();}
 catch(error){announce('No se pudo abrir pantalla completa. Prueba abriendo el HTML directamente en tu navegador.');}
}
document.querySelector('#fullscreen-button').addEventListener('click',event=>{event.preventDefault();event.stopPropagation();toggleFullscreen();});
document.addEventListener('fullscreenchange',syncFullscreenButton);
document.addEventListener('webkitfullscreenchange',syncFullscreenButton);

// Campaign prologue. Scene state, narrative timers and test tools share one clock.
const chapters=[['00','El primer encuentro','Prólogo · tomar, mover y enfriar'],['01','Primer contacto','Llevar un Q-bit a un destino'],['02','Cada uno por su camino','Dos destinos independientes'],['03','Dos lados','Dos botones simultáneos'],['04','Juntos pesamos más','Dos Q-bits en un botón'],['05','La primera unión','Dos piezas · circuito de líquido'],['06','Cambiar de forma','Tres puertas · L, cuadrado y T'],['07','Seis piezas','Rectángulo y escalera'],['08','Salimos juntos','Seis compañeros · fin del primer bloque'],['09','La fuente','Conocer al equipo · transformar materia'],['10','El camino de vuelta','Dos estaciones · transporte y descanso'],['11','Dos rutas','Elegir materia y organizar al equipo'],['12','La instalación','Tres estaciones · el equipo completo']];
const ui={main:document.querySelector('#main-screen'),pause:document.querySelector('#pause-screen'),levels:document.querySelector('#levels-screen'),complete:document.querySelector('#chapter-complete'),dialogue:document.querySelector('#story-dialogue'),text:document.querySelector('#story-text'),speaker:document.querySelector('#story-speaker'),choices:document.querySelector('#story-choices'),objective:document.querySelector('#story-objective'),veil:document.querySelector('#scene-veil'),top:document.querySelector('#eye-top'),bottom:document.querySelector('#eye-bottom'),cooling:document.querySelector('#cooling-track'),marker:document.querySelector('#world-label')};
function gameMode(mode){if(mode!=='playing')closeUnitRadial(false);story.mode=mode;window.QBitsMusic?.setPaused(mode!=='playing');document.body.dataset.gameMode=mode;for(const [key,el] of [['menu',ui.main],['pause',ui.pause],['levels',ui.levels],['complete',ui.complete]])el.hidden=mode!==key;document.querySelector('#pause-button').hidden=mode!=='playing';hint.hidden=true;redraw=true;}
function gameScene(scene){story.scene=scene;document.body.dataset.gameScene=scene;const label=document.querySelector('#chapter-label');label.hidden=scene==='lab';document.querySelector('#chapter-number').textContent=scene==='intro'?'PRÓLOGO / 00':'NIVEL / '+String(story.level||1).padStart(2,'0');document.querySelector('#chapter-name').textContent=scene==='intro'?'El primer encuentro':chapters[story.level||1][1];}
function storySuspended(){return radialOpen()||story.ready&&(story.mode!=='playing'||!panel.hidden||document.hidden);}
function storyWalkAllowed(){return !story.ready||story.scene!=='intro'||['deliver','cooling','cooled','choice','repeat'].includes(story.phase);}
function storyLookAllowed(){return !story.ready||story.mode==='playing'&&!['asleep','invocation','opening'].includes(story.phase);}
function storyActionAllowed(){return !story.ready||story.mode==='playing'&&!story.transition&&!encounterLocksActions()&&(story.scene!=='intro'||['pickup','carry','deliver','cooling','cooled'].includes(story.phase));}
function storyObjective(text){ui.objective.textContent=text;ui.objective.hidden=!text;}
function say(text,{after=null,hold=false,mysterious=false,choices=null,onComplete=null}={}){
 story.dialogue={text,time:0,count:-1,after,hold,choices,onComplete,done:false};ui.text.textContent='';ui.text.classList.add('typing');ui.dialogue.hidden=false;ui.dialogue.classList.toggle('mysterious',mysterious);ui.speaker.textContent=mysterious?'UNA VOZ…':'Q-BIT';ui.choices.hidden=true;ui.choices.replaceChildren();ui.cooling.hidden=true;document.querySelector('#dialogue-hint').textContent=after?'E · continuar':choices?'Elige una respuesta':'';
}
function hideStoryDialogue(){story.dialogue=null;ui.dialogue.hidden=true;ui.choices.hidden=true;ui.cooling.hidden=true;}
function advanceDialogue(){const d=story.dialogue;if(!d||story.mode!=='playing'||!panel.hidden)return;const end=d.text.length/34;if(d.time<end){d.time=end;renderDialogue(0);return;}if(d.after){const after=d.after;d.after=null;after();}}
function renderDialogue(dt){
 const d=story.dialogue;if(!d)return;d.time+=dt;const count=Math.min(d.text.length,Math.floor(d.time*34));if(count!==d.count){ui.text.textContent=d.text.slice(0,count);d.count=count;ui.text.classList.toggle('typing',count<d.text.length);}
 if(count===d.text.length&&!d.done){d.done=true;if(d.choices){ui.choices.hidden=false;for(const choice of d.choices){const button=document.createElement('button');button.textContent=choice.label;button.addEventListener('click',choice.run);ui.choices.appendChild(button);}document.querySelector('#dialogue-hint').textContent='Elige una respuesta';story.intentionalUnlock=true;pause(false);ui.choices.querySelector('button')?.focus({preventScroll:true});}if(d.onComplete){const complete=d.onComplete;d.onComplete=null;complete();}}
 if(!d.hold&&d.after&&d.time>d.text.length/34+2.6){const after=d.after;d.after=null;after();}
}
function sceneFade(action,{out=.65,black=1.8,inTime=.8,loading=true,kind='travel'}={}){
 if(story.transition)return;
 // A deliberate breathing space between rooms, separate from real startup loading.
 if(loading)black=Math.max(1.8,black);
 document.body.dataset.transitioning='true';story.transition={time:0,swapped:false,action,out,black,inTime,loading,kind};hideStoryDialogue();storyObjective('');ui.marker.hidden=true;keys.clear();story.intentionalUnlock=true;pause(false);panel.hidden=true;document.querySelector('#wake-screen').hidden=true;
 document.querySelector('#scene-loading .transition-track b').style.width='0%';
}
function tickSceneFade(dt){
 const t=story.transition;if(!t||document.hidden)return;t.time+=dt;const u=clamp(t.time/Math.max(t.out,.001),0,1);ui.veil.style.opacity=String(u*u*(3-2*u));
 if(t.time>=t.out&&!t.swapped){t.swapped=true;t.action();ui.veil.style.opacity='1';document.querySelector('#scene-loading').hidden=!t.loading;}
 if(!t.swapped)return;
 if(t.time<t.out+t.black){ui.veil.style.opacity='1';const p=clamp((t.time-t.out)/t.black,0,1);document.querySelector('#scene-loading .transition-track b').style.width=(100*(p*p*(3-2*p)))+'%';return;}
 document.querySelector('#scene-loading .transition-track b').style.width='100%';
 document.querySelector('#scene-loading').hidden=true;
 const v=clamp((t.time-t.out-t.black)/t.inTime,0,1);ui.veil.style.opacity=String(1-v*v*(3-2*v));
 if(story.scene==='intro'&&['asleep','invocation'].includes(story.phase))ui.veil.style.opacity='1';
 if(v===1){story.transition=null;document.body.dataset.transitioning='false';if(story.phase==='asleep')showWakeButton();}
}
function showWakeButton(){if(story.scene!=='intro'||story.mode!=='playing'||story.phase!=='asleep'||story.transition)return;document.querySelector('#wake-screen').hidden=false;document.querySelector('#wake-button').focus({preventScroll:true});story.intentionalUnlock=true;pause(false);}
function wakeUp(){
 if(story.scene!=='intro'||story.mode!=='playing'||story.phase!=='asleep'||story.transition||!panel.hidden||document.hidden)return;
 document.querySelector('#wake-screen').hidden=true;story.phase='opening';story.phaseTime=0;hideStoryDialogue();captureMouse();
}
function beginCreationNarration(){
 // The opening lines play in darkness. The player's gesture creates the light.
 story.phase='invocation';document.querySelector('#wake-screen').hidden=true;
 say('En el inicio no había nada…',{mysterious:true,after:()=>{
  say('Y un ser todopoderoso dijo: «Hágase la luz».',{mysterious:true,hold:true,onComplete:()=>{
   story.phase='asleep';story.phaseTime=0;document.querySelector('#dialogue-hint').textContent='';showWakeButton();
  }});
 }});
}
function storyWall(p,half,{glass=false,color=[.91,.935,.92],door=false}={}){
 const body=new CANNON.Body({mass:0});body.addShape(new CANNON.Box(half));body.position.copy(p);body.collisionFilterMask=-1;world.addBody(body);const wall={p,half,body,min:sub(p,half),max:add(p,half),glass,color,door,initialY:p.y};storyWorld.walls.push(wall);return wall;
}
function clearStoryWalls(){for(const w of storyWorld.walls)world.removeBody(w.body);storyWorld.walls.length=0;storyWorld.door=null;storyWorld.target=null;}
function buildWhiteRooms(){
 const white=[.938,.95,.938],edge=[.86,.895,.87];
 storyWall(V(-3.3,1.8,-1.95),V(.10,1.8,5.6),{color:white});storyWall(V(3.3,1.8,-1.95),V(.10,1.8,5.6),{color:white});storyWall(V(0,1.8,3.65),V(3.4,1.8,.10),{color:white});storyWall(V(0,1.8,-7.55),V(3.4,1.8,.10),{color:white});storyWall(V(0,3.55,-1.95),V(3.4,.10,5.6),{color:[.965,.97,.96]});
 for(const sign of [-1,1]){
  for(const x of [.83,3.18])storyWall(V(sign*x,1.75,-3.4),V(.055,1.75,.10),{color:white});
  storyWall(V(sign*2,.16,-3.4),V(1.13,.16,.10),{color:white});storyWall(V(sign*2,3.32,-3.4),V(1.13,.18,.10),{color:white});
  storyWall(V(sign*2,1.74,-3.4),V(1.12,1.40,.016),{glass:true,color:[.68,.84,.79]});
 }
 storyWall(V(0,2.99,-3.4),V(.78,.51,.12),{color:white});storyWorld.door=storyWall(V(0,1.22,-3.4),V(.76,1.22,.055),{color:[.87,.91,.88],door:true});storyWorld.doorProgress=0;
 storyWorld.details=[{p:V(-3.185,.016,0),size:V(.016,.025,6.8),color:edge},{p:V(3.185,.016,0),size:V(.016,.025,6.8),color:edge},{p:V(0,3.435,-.3),size:V(1.35,.008,.06),color:[1,1,1]},{p:V(0,3.435,-5.5),size:V(1.35,.008,.06),color:[1,1,1]}];
}
function storyPoseClear(g,pos,q,src=poses(g,pos,q),bb=bounds(g,pos,q)){return !storyWorld.walls.some(w=>boundsOverlap(bb,w)&&src.some(a=>obbOverlap(a,{p:w.p,q:Q(),half:w.half})));}
function resolveStoryPlayer(oldX,oldZ){const r=PLAYER_RADIUS;const blocked=(x,z)=>storyWorld.walls.some(w=>w.min.y<posture.height+.15&&w.max.y>.15&&x>w.min.x-r&&x<w.max.x+r&&z>w.min.z-r&&z<w.max.z+r);if(blocked(position[0],oldZ))position[0]=oldX;if(blocked(position[0],position[2]))position[2]=oldZ;}
function drawStoryWorld(){
 if(!storyWorld.walls.length)return;
 gl.disable(gl.BLEND);gl.depthMask(true);
 for(const w of storyWorld.walls)if(!w.glass)drawAsset({buffer:cubeGeometry,count:36},w.p,Q(),mul(w.half,2),[...w.color,1]);
 for(const d of storyWorld.details)drawAsset({buffer:cubeGeometry,count:36},d.p,Q(),d.size,[...d.color,1]);
 const door=storyWorld.door;if(door)drawBox(add(door.p,V(.66,.45,.059)),Q(),V(.012,.28,.004),storyWorld.doorProgress>.8?[.37,.68,.55,1]:[.68,.74,.70,1]);
 drawCampaignOpaque();
 if(storyWorld.target){const p=storyWorld.target;drawAsset(storyTargetMesh,p,Q(),V(.25,1,.25),[.36,.69,.58,1],3);drawRing(add(p,V(0,.003,0)),.275,.7);}
}
function drawStoryGlass(){
 if(!storyWorld.walls.length)return;gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
 const glass=storyWorld.walls.filter(w=>w.glass).sort((a,b)=>b.p.distanceTo(V(...camera))-a.p.distanceTo(V(...camera)));
 for(const w of glass){drawAsset({buffer:cubeGeometry,count:36},w.p,Q(),mul(w.half,2),[...w.color,.075],3);drawBox(add(w.p,V(0,.92,.02)),Q(),V(w.half.x*1.65,.007,.002),[.82,.94,.89,.26]);}
 gl.depthMask(true);gl.disable(gl.BLEND);drawCampaignTransparent();
}
const storyTargetMesh=buildLathe([[.88,.006],[1,.006]],72);
function clearNarrativeScene(){
 closeUnitRadial(false);
 releaseQubit();story.preserveGrip=false;clearCampaign();clearStoryWalls();clearPuzzleScene();puzzle.active=false;puzzle.savedLab=null;puzzle.delivery=null;clearSelection();speech.queue.length=0;for(const slot of speech.slots)clearSpeechSlot(slot);hideStoryDialogue();storyObjective('');ui.marker.hidden=true;story.guideId=null;story.phaseTime=0;story.dropAligned=false;story.lost=0;story.arrival=0;story.routeIssued=false;story.phase='idle';ui.top.style.height='0';ui.bottom.style.height='0';canvas.style.filter='none';document.querySelector('#notice').textContent='';document.querySelector('#wake-screen').hidden=true;
}
function rememberLab(){if(story.scene==='lab'){story.lab=puzzle.active?puzzle.savedLab:saveLab();story.labAlpha={...alphaSettings};}}
function applyStageDefaults(){Object.assign(settings,{mass:1,gravity:9.8,force:60,maxCarry:16,speed:.32});world.gravity.set(0,-settings.gravity,0);alphaSettings.coolingOn=true;posture.height=EYE_HEIGHT;bobHeight=0;bobSide=0;world.broadphase.dirty=true;}
function storyGuide(){return groups.find(g=>g.parts.some(p=>p.id===story.guideId));}
function spawnGuide(floating=true){const g=addQubit(floating?[0,1.49,2.45]:[-.85,HALF+.004,.3],1);story.guideId=g.parts[0].id;g.parts[0].mood.name='Q-bit';g.storyFloat=floating;if(floating){g.body.type=CANNON.Body.KINEMATIC;g.body.updateMassProperties();const m=g.parts[0].mood;m.energy=.12;m.state='restless';m.reason='acalorado';m.restLeft=120;m.agitation=.8;}return g;}
function ensureTutorialCooler(){if(!story.cooler||!coolers.includes(story.cooler)){story.cooler=createCooler(V(-1.05,0,2.28));if(story.cooler){story.cooler.coolSeconds=4.5;story.cooler.capacity=1;story.cooler.storyOwned=true;}}}
function beginIntro(replay=false){
 rememberLab();clearNarrativeScene();applyStageDefaults();gameScene('intro');gameMode('playing');story.phase=replay?'pickup':'invocation';story.elapsed=0;story.started=true;story.moved=false;story.guideSeen=0;story.cooler=null;spawnGuide();ensureTutorialCooler();position.splice(0,3,0,EYE_HEIGHT,1.3);yaw=replay?Math.PI:0;pitch=replay?-.16:0;camera.splice(0,3,...position);story.moveOrigin=null;document.querySelector('#notice').textContent='';
 buildWhiteRooms();
 if(replay){ui.veil.style.opacity='0';askPickup('Va de nuevo. Esta vez sin crear el universo: apunta hacia mí y haz clic para tomarme.');}
 else{ui.veil.style.opacity='1';ui.top.style.height='52%';ui.bottom.style.height='52%';beginCreationNarration();}
 updatePanel();
}
function askPickup(text='Hola. ¿Cómo estás? Soy un Q-bit. Apunta hacia mí y haz clic izquierdo para tomarme.'){
 story.phase='pickup';storyObjective('Apunta al Q-bit y haz clic izquierdo.');say(text,{hold:true});
}
function storyOnGrab(g){
 if(story.scene==='campaign'){held.latched=true;return;}
 if(story.scene!=='intro'||g!==storyGuide())return;
 g.storyFloat=false;g.body.type=CANNON.Body.DYNAMIC;g.body.updateMassProperties();held.latched=true;
 if(story.phase==='pickup'){story.phase='carry';story.moved=false;story.moveOrigin=g.body.position.clone();story.grabYaw=yaw;story.grabPitch=pitch;storyObjective('Mueve el mouse para mover al Q-bit.\nClic izquierdo · soltar');say('Bien. Ahora mueve el mouse un poco. Yo voy contigo.',{hold:true});}
}
function tutorialGripTarget(target){
 const care=encounterCoolerTarget(target);if(care)return care;
 story.dropAligned=false;if(story.scene!=='intro'||story.phase!=='deliver'||held?.g!==storyGuide()||!story.cooler)return target;
 const c=story.cooler,hit=rayPuzzleBox(V(...camera),direction(),alphaBox(add(c.p,V(0,.18,0)),V(.34,.22,.34)),2.8);
 if(hit===null)return target;story.dropAligned=true;return add(c.p,V(0,.23,0));
}
function tutorialFloat(dt){if(story.scene!=='intro')return;const g=storyGuide();if(!g?.storyFloat)return;g.body.position.set(0,1.49+Math.sin(story.elapsed*1.65)*.035,2.45);g.body.quaternion.setFromEuler(.10*Math.sin(story.elapsed),story.elapsed*.24,.05);g.body.velocity.set(0,0,0);g.body.angularVelocity.set(0,0,0);g.body.aabbNeedsUpdate=true;}
function readyQuestion(){story.phase='choice';storyObjective('');say('Ya estás preparado. ¿Quieres empezar los niveles?',{hold:true,choices:[{label:'Sí, empecemos',run:()=>{saveStoryProgress('intro');sceneFade(()=>{beginLevelOne();});captureForTransition();}},{label:'No, todavía no',run:()=>{ui.choices.hidden=true;story.phase='repeat';say('¿Cómo que no? Si hasta enfriar a un cubo te salió bien. ¿Repetimos la práctica?',{hold:true,choices:[{label:'Sí, repetir',run:()=>{sceneFade(()=>beginIntro(true));captureForTransition();}},{label:'Ya, vamos a los niveles',run:()=>{saveStoryProgress('intro');sceneFade(()=>beginLevelOne());captureForTransition();}}]});}}]});}
function captureForTransition(){story.allowTransitionCapture=true;captureMouse();story.allowTransitionCapture=false;}
function beginLevelOne(){beginCampaignLevel(1);}

function openStoryDoor(dt){const d=storyWorld.door;if(!d)return;storyWorld.doorProgress=Math.min(1,storyWorld.doorProgress+dt/.95);const t=storyWorld.doorProgress,u=t*t*(3-2*t);d.p.y=d.initialY+2.65*u;d.body.position.copy(d.p);d.min=sub(d.p,d.half);d.max=add(d.p,d.half);d.body.aabbNeedsUpdate=true;}
function saveStoryProgress(key){story.progress[key]=true;try{localStorage.setItem('qbits.campaign.v1',JSON.stringify(story.progress));}catch{}}
function finishFirstLevel(){saveStoryProgress('level1');story.phase='complete';hideStoryDialogue();storyObjective('');gameMode('complete');pause(false);document.querySelector('#complete-repeat').focus({preventScroll:true});}
function enterLab(capture=true){
 if(story.scene==='lab'){gameMode('playing');panel.hidden=true;if(capture)captureMouse();return;}
 clearNarrativeScene();gameScene('lab');gameMode('playing');story.started=true;const saved=story.lab;
 if(saved){Object.assign(settings,saved.settings);Object.assign(moodSettings,saved.moodSettings||{});Object.assign(alphaSettings,story.labAlpha||{});position.splice(0,3,...saved.position);yaw=saved.yaw;pitch=saved.pitch;camera.splice(0,3,...position);for(const g of saved.groups)makeGroup(g.parts,g.q,g.v,g.w);for(const c of saved.cargos)newCargo(c.p,c.side,c.required,c.color);restoreAlphaScene(saved.alphaScene);}else addQubit([0,HALF+.003,0]);
 world.gravity.y=-settings.gravity;world.defaultContactMaterial.friction=settings.friction;world.defaultContactMaterial.restitution=settings.bounce;world.broadphase.dirty=true;ui.veil.style.opacity='0';updatePanel();if(capture)captureMouse();
}
function showMain(){document.querySelector('#wake-screen').hidden=true;gameMode('menu');pause(false);panel.hidden=true;document.querySelector('#main-continue').hidden=!story.started;ui.veil.style.opacity='0';ui.top.style.height='0';ui.bottom.style.height='0';canvas.style.filter='none';document.querySelector('#main-play').focus({preventScroll:true});}
function openPauseMenu(){if(!story.ready||story.mode!=='playing'||story.transition)return;document.querySelector('#wake-screen').hidden=true;gameMode('pause');pause(false);panel.hidden=true;document.querySelector('#pause-chapter').textContent=story.scene==='intro'?'Prólogo · El primer encuentro':story.scene==='campaign'?'Nivel '+story.level+' · '+chapters[story.level][1]:'Banco de pruebas';document.querySelector('#pause-resume').focus({preventScroll:true});}
function resumeGame(){if(story.phase==='complete'){gameMode('complete');return;}gameMode('playing');if(story.scene==='intro'&&['asleep','invocation'].includes(story.phase)){ui.veil.style.opacity='1';ui.top.style.height='52%';ui.bottom.style.height='52%';ui.dialogue.hidden=!story.dialogue;if(story.phase==='asleep')showWakeButton();else{document.querySelector('#wake-screen').hidden=true;canvas.focus({preventScroll:true});}return;}if(story.phase==='choice'||story.phase==='repeat')return;captureMouse();}
function restartCurrent(){sceneFade(()=>{if(story.scene==='intro')beginIntro();else if(story.scene==='campaign')beginCampaignLevel(story.level);else if(puzzle.active)startPuzzle();else{clearNarrativeScene();gameScene('intro');enterLab(false);}});captureForTransition();}
function showLevelSelector(){story.returnMode=story.mode;gameMode('levels');pause(false);panel.hidden=true;const list=document.querySelector('#level-list');list.replaceChildren();for(let i=0;i<chapters.length;i++){const row=document.createElement('button');row.disabled=false;const number=document.createElement('span'),info=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('small');number.className='level-number';number.textContent=chapters[i][0];name.textContent=chapters[i][1];detail.textContent=(i===0?story.progress.intro:story.progress['level'+i])?'Completado · volver a jugar':chapters[i][2];info.append(name,detail);row.append(number,info);row.addEventListener('click',()=>{sceneFade(()=>i===0?beginIntro():beginCampaignLevel(i));captureForTransition();});list.appendChild(row);}document.querySelector('#levels-back').focus({preventScroll:true});}
function backFromLevels(){gameMode(story.returnMode||'menu');if(story.mode==='playing')resumeGame();}
function storyInput(event){
 if(document.body.dataset.booting==='true')return true;
 if(story.transition){event.preventDefault();return true;}
 if(!story.ready)return false;const editing=editableTarget(document.activeElement);
 if(event.code==='KeyP'&&!event.repeat&&!editing){event.preventDefault();if(!panel.hidden){panel.hidden=true;if(story.mode==='playing')captureMouse();}else openPanel();return true;}
 if(event.code==='Escape'){
  event.preventDefault();if(story.transition&&panel.hidden)return true;if(!panel.hidden){panel.hidden=true;if(story.mode==='playing')openPauseMenu();return true;}
  if(story.mode==='levels'){backFromLevels();return true;}if(story.mode==='pause'){resumeGame();return true;}if(story.mode==='playing'){if(!commandMenu.hidden){closeCommandMenu(true);return true;}if(!menu.hidden){closeDetachMenu(true);return true;}openPauseMenu();return true;}return true;
 }
 if(editing)return false;if(story.mode!=='playing'||story.transition)return true;
 if(event.code==='KeyO'&&story.encounter&&!event.repeat){event.preventDefault();finishEncounter();return true;}
 if((event.code==='KeyE'||event.code==='Space')&&!event.repeat&&panel.hidden){event.preventDefault();if(story.phase==='asleep')wakeUp();else if(story.dialogue)advanceDialogue();else if(event.code==='KeyE')interactMaterial();return true;}
 if(story.scene==='intro'&&!storyWalkAllowed()&&['KeyW','KeyA','KeyS','KeyD','KeyC','ShiftLeft','ShiftRight'].includes(event.code)&&!held){event.preventDefault();return true;}
 return false;
}
function tickStory(dt){
 if(story.transition){if(panel.hidden)tickSceneFade(dt);return;}if(storySuspended())return;
 story.elapsed+=dt;story.phaseTime+=dt;renderDialogue(dt);
 if(story.scene==='intro'){
  if(['asleep','invocation'].includes(story.phase))ui.veil.style.opacity='1';
  if(story.phase==='opening'){
   const t=clamp(story.phaseTime/2.8,0,1),u=t*t*(3-2*t);ui.veil.style.opacity=String(1-u);ui.top.style.height=(52*(1-u))+'%';ui.bottom.style.height=(52*(1-u))+'%';canvas.style.filter='blur('+((1-u)*13).toFixed(2)+'px)';
   if(t===1){story.phase='light';canvas.style.filter='none';say('Bueno, era broma. Estoy acá atrás. Detrás tuyo.',{after:()=>{story.phase='look';storyObjective('Mueve el mouse para mirar detrás de ti.\nPor ahora, solo puedes mirar.');}});}
  }
  let g=storyGuide();if(!g){story.lost+=dt;if(story.lost>1){spawnGuide();story.lost=0;askPickup('Volví. Las herramientas de prueba hacen cosas curiosas. Tómame otra vez.');}return;}story.lost=0;
  if(story.phase==='look'){
   const d=sub(g.body.position,V(...camera));d.normalize();story.guideSeen=direction().dot(d)>.965?story.guideSeen+dt:0;
   if(story.guideSeen>.35){askPickup();}
  }
  if(story.phase==='carry'){
   if(held?.g!==g){story.phase='pickup';storyObjective('Apunta al Q-bit y haz clic para retomarlo.');say('Casi. Tómame otra vez y mueve el mouse conmigo.',{hold:true});}
   else if(g.body.position.distanceTo(story.moveOrigin)>.18||Math.abs(yaw-story.grabYaw)+Math.abs(pitch-story.grabPitch)>.25){story.moved=true;if(story.dialogue?.done){story.phase='deliver';held.distance=Math.max(held.distance,1.8);storyObjective('Ahora puedes caminar con WASD.\nApunta al interior del enfriador y suéltame.');say('Uf, estoy acalorado. Esa canasta es un enfriador. Déjame dentro, por favor. Ya puedes caminar; clic otra vez para soltarme.',{hold:true});}}
  }
  if(['deliver','cooling'].includes(story.phase)){
   ensureTutorialCooler();const c=story.cooler;const entry=c?.entries.get(story.guideId);
   if(story.dropAligned&&held?.g===g)storyObjective('Enfriador alineado. Clic izquierdo para soltar.');else if(story.phase==='deliver')storyObjective('WASD · acercarte | rueda · distancia\nApunta al interior del enfriador y haz clic.');
   if(entry&&g.cooler===c){if(story.phase!=='cooling'){story.phase='cooling';storyObjective('Déjalo descansar un momento.');say('Ah… mucho mejor. Dame unos segundos. Hasta los cubos necesitamos bajar un cambio.',{hold:true});}ui.cooling.hidden=false;const pct=Math.round(entry.elapsed/(c.coolSeconds||alphaSettings.coolSeconds)*100);ui.cooling.querySelector('i').style.width=pct+'%';ui.cooling.querySelector('span').textContent='Enfriando · '+pct+'%';
    if(entry.done){story.phase='cooled';ui.cooling.hidden=true;storyObjective('');say('Listo. Ya sabes mirar, tomarme, moverme y ayudarme a descansar. Nada mal para alguien que acaba de abrir los ojos.',{after:readyQuestion});}
   }else if(story.phase==='cooling'){story.phase='deliver';ui.cooling.hidden=true;say('Un poquito más dentro. Todavía me falta enfriarme.',{hold:true});}
  }
 }
 if(story.scene==='campaign'){tickBlockTwo(dt);if(!story.encounter)tickCampaign(dt);}
}
function updateStoryMarker(){
 updateCampaignLabels();layoutEncounterBubbles();ui.marker.hidden=true;if(story.mode!=='playing'||!panel.hidden||story.transition)return;
 let point=null,label='';if(story.scene==='intro'&&['deliver','cooling'].includes(story.phase)&&story.cooler){point=add(story.cooler.p,V(0,.24,0));label=story.dropAligned?'CLIC · SOLTAR':'ENFRIADOR';}
 if(point){const p=project(point);if(p&&p.x>35&&p.x<canvas.clientWidth-35&&p.y>100&&p.y<canvas.clientHeight-195){ui.marker.style.left=p.x+'px';ui.marker.style.top=(p.y-18)+'px';ui.marker.textContent=label;ui.marker.hidden=false;}}
}
function initStory(){
 story.lab=saveLab();story.labAlpha={...alphaSettings};try{story.progress=JSON.parse(readQbitsStorage('qbits.campaign.v1')||'{}')||{};}catch{story.progress={};}story.ready=true;
 const click=(id,fn)=>document.querySelector('#'+id).addEventListener('click',fn);
 click('main-play',()=>{sceneFade(()=>beginIntro(),{out:.3,black:.65});});click('wake-button',wakeUp);click('skip-encounter',finishEncounter);click('main-continue',resumeGame);click('main-levels',showLevelSelector);click('main-lab',()=>{sceneFade(()=>enterLab(false));captureForTransition();});click('pause-button',openPauseMenu);click('pause-resume',resumeGame);click('pause-restart',restartCurrent);click('pause-levels',showLevelSelector);click('pause-main',showMain);click('pause-lab',()=>{sceneFade(()=>enterLab(false));captureForTransition();});click('levels-back',backFromLevels);click('complete-repeat',()=>{sceneFade(()=>beginCampaignLevel(story.level||1));captureForTransition();});click('complete-next',()=>{sceneFade(()=>beginCampaignLevel(Math.min(12,story.level+1)));captureForTransition();});click('complete-levels',showLevelSelector);click('complete-main',showMain);click('complete-lab',()=>{sceneFade(()=>enterLab(false));captureForTransition();});
 initTitleGreeting();gameScene('lab');gameMode('boot');
}

// Eight complete campaign levels. All gates use the actual bodies and welded parts.
const FORMS={
 domino:{name:'Dúo',cells:[[0,0],[1,0]]},
 corner:{name:'L · 3',cells:[[0,0],[0,1],[1,0]]},
 square:{name:'Cuadrado · 4',cells:[[0,0],[1,0],[0,1],[1,1]]},
 tee:{name:'T · 4',cells:[[0,1],[1,1],[2,1],[1,0]]},
 rectangle:{name:'Rectángulo · 6',cells:[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]]},
 steps:{name:'Escalera · 6',cells:[[0,0],[1,0],[2,0],[0,1],[1,1],[0,2]]}
};
const LEVELS=[null,
 {count:1,gates:[{kind:'routes',targets:1}],line:'Ahora puedo ir por mi cuenta. Clic derecho en mí, «Elegir destino en el suelo», y después clic derecho en el círculo: «Ir a este punto».'},
 {count:2,gates:[{kind:'routes',targets:2}],line:'Esta vez somos dos. Dale un destino distinto a cada uno. No hace falta que hagamos todo juntos.'},
 {count:2,gates:[{kind:'buttons',weights:[1,1]}],line:'Uno a cada lado. Estos botones necesitan estar presionados al mismo tiempo. Puedes tomarnos y dejarnos encima.'},
 {count:2,gates:[{kind:'buttons',weights:[2]}],line:'El aro te lo cuenta: uno llena la mitad; dos completan el círculo. Juntos pesamos más.'},
 {count:2,gates:[{kind:'shape',form:'domino',seconds:8}],line:'Acerca nuestras caras, mantén Shift y suelta para unirnos. Después lleva la pareja al hueco de la pared. La luz te ayudará a encajarla.'},
 {count:4,gates:[{kind:'shape',form:'corner',seconds:8},{kind:'shape',form:'square',seconds:9},{kind:'shape',form:'tee',seconds:9}],line:'Tres puertas, cuatro piezas. Primero una L de tres. Cuando una puerta abra, retira las piezas para usarlas de nuevo. Alt permite separarnos.'},
 {count:6,gates:[{kind:'shape',form:'rectangle',seconds:10},{kind:'shape',form:'steps',seconds:11}],line:'Ahora somos seis. Primero un rectángulo; después una escalera. La misma compañía, otra forma de seguir.'},
 {count:6,gates:[{kind:'buttons',weights:[1,1]},{kind:'combo',weights:[2],form:'tee',seconds:10},{kind:'shape',form:'steps',seconds:12}],line:'Último recorrido. Botones, formas y un poco de paciencia. Esta vez salimos todos: nadie se queda en la sala.'}
];
function activePressureButtons(){return puzzle.active?puzzle.buttons:storyWorld.buttons||[];}
function clearCampaign(){
 clearBlockTwo();
 if(story.campaign)for(const gate of story.campaign.gates)if(gate.pipe)for(const mesh of [gate.pipe.shell,gate.pipe.liquid,gate.pipe.halo])gl.deleteBuffer(mesh.buffer);
 story.campaign=null;storyWorld.buttons=[];story.dockCandidate=null;story.socketHint=null;const layer=document.querySelector('#campaign-labels');if(layer)layer.replaceChildren();campaignLabels.length=0;
}
function campaignBoundary(gateZs){
 const front=3.65,back=gateZs.at(-1)-3.1,center=(front+back)/2,depth=(front-back)/2,white=[.94,.95,.942];
 storyWall(V(-3.3,1.8,center),V(.1,1.8,depth),{color:white});storyWall(V(3.3,1.8,center),V(.1,1.8,depth),{color:white});storyWall(V(0,1.8,front),V(3.4,1.8,.1),{color:white});storyWall(V(0,1.8,back),V(3.4,1.8,.1),{color:white});storyWall(V(0,3.55,center),V(3.4,.1,depth),{color:[.97,.975,.969]});
 storyWorld.details=[{p:V(-3.18,.018,center),size:V(.016,.026,depth*2),color:[.83,.87,.85]},{p:V(3.18,.018,center),size:V(.016,.026,depth*2),color:[.83,.87,.85]}];
}
function campaignGate(z,index,definition){
 const white=[.94,.95,.942];for(const sign of [-1,1]){
  for(const x of [.83,3.18])storyWall(V(sign*x,1.75,z),V(.055,1.75,.10),{color:white});
  storyWall(V(sign*2,.16,z),V(1.13,.16,.10),{color:white});storyWall(V(sign*2,3.32,z),V(1.13,.18,.10),{color:white});storyWall(V(sign*2,1.74,z),V(1.12,1.40,.016),{glass:true,color:[.68,.84,.79]});
 }
 storyWall(V(0,2.99,z),V(.78,.51,.12),{color:white});const door=storyWall(V(0,1.22,z),V(.76,1.22,.055),{color:[.88,.915,.895],door:true});
 storyWorld.details.push({p:V(0,3.435,z+1.7),size:V(1.2,.012,.07),color:[1,1,1]});
 return {...definition,index,z,door,open:0,solved:false,hold:0,flow:0,active:false,pads:[],targets:[],socket:null,pipe:null};
}
function makeCampaignPad(gate,x,z,required,index){
 const b={kind:'campaign',name:String(index+1),p:V(x,0,z),half:required===2?.27:.22,required,load:0,pressed:0};gate.pads.push(b);storyWorld.buttons.push(b);return b;
}
function buildSocket(gate,form){
 const width=Math.max(...form.cells.map(c=>c[0]))+1,height=Math.max(...form.cells.map(c=>c[1]))+1;
 const center=V(-2.06,1.12,gate.z+.55),targets=form.cells.map(([x,y])=>add(center,V((x-(width-1)/2)*CUBE_SIZE,(y-(height-1)/2)*CUBE_SIZE,0)));
 const socket={form,center,targets,gate,occupant:null,fitCache:new WeakMap(),width,height,half:V(.43,.43,.09),p: center};socket.min=sub(center,socket.half);socket.max=add(center,socket.half);gate.socket=socket;
 // A real recess: surround and backing collide; requested cells are open.
 const side=width*CUBE_SIZE/2+.007,top=height*CUBE_SIZE/2+.007;
 for(const sign of [-1,1]){
  storyWall(add(center,V(sign*(.43+side)/2,0,0)),V((.43-side)/2,.43,.07),{color:[.90,.928,.911]});
  storyWall(add(center,V(0,sign*(.43+top)/2,0)),V(side,(.43-top)/2,.07),{color:[.90,.928,.911]});
 }
 for(let x=0;x<width;x++)for(let y=0;y<height;y++)if(!form.cells.some(c=>c[0]===x&&c[1]===y))storyWall(add(center,V((x-(width-1)/2)*CUBE_SIZE,(y-(height-1)/2)*CUBE_SIZE,0)),V(HALF-.002,HALF-.002,.07),{color:[.90,.928,.911]});
 storyWall(add(center,V(0,0,-.09)),V(.425,.425,.018),{color:[.23,.30,.28]});
 const start=add(center,V(.34,-.33,.10)),end=V(-.86,1.12,gate.z+.15);
 const controls=[start,add(start,V(.08,-.11,.04)),V(-1.62,.25,gate.z+.8),V(-.98,.25,gate.z+.83),V(-.86,.5,gate.z+.40),end];
 gate.pipe=buildFlowPipe(controls,indexedNeon(gate.index));return socket;
}
function indexedNeon(index){return index%2?[.12,.69,1]:[.18,1,.53];}
function catmullPoint(a,b,c,d,t){return V(...['x','y','z'].map(k=>.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t*t+(-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t)));}
function buildFlowPipe(controls,color){
 const points=[];for(let j=0;j<controls.length-1;j++)for(let i=0;i<18;i++)points.push(catmullPoint(controls[Math.max(0,j-1)],controls[j],controls[j+1],controls[Math.min(controls.length-1,j+2)],i/18));points.push(controls.at(-1));
 const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+points[i].distanceTo(points[i-1]));const total=lengths.at(-1);
 function tube(radius,progress){const data=[],rings=[];
  for(let i=0;i<points.length;i++){const tangent=sub(points[Math.min(i+1,points.length-1)],points[Math.max(0,i-1)]);tangent.normalize();const ref=Math.abs(tangent.y)>.92?V(1,0,0):V(0,1,0),side=tangent.cross(ref);side.normalize();const up=side.cross(tangent);up.normalize();const ring=[];
   for(let j=0;j<10;j++){const a=j/10*Math.PI*2,n=add(mul(side,Math.cos(a)),mul(up,Math.sin(a)));ring.push({p:add(points[i],mul(n,radius)),n:progress?V(lengths[i]/total,0,0):n});}rings.push(ring);
  }
  const tri=(a,b,c)=>{for(const v of [a,b,c])data.push(v.p.x,v.p.y,v.p.z,v.n.x,v.n.y,v.n.z);};
  for(let i=0;i<rings.length-1;i++)for(let j=0;j<10;j++){const k=(j+1)%10;tri(rings[i][j],rings[i+1][j],rings[i][k]);tri(rings[i][k],rings[i+1][j],rings[i+1][k]);}
  return {buffer:buffer(data),count:data.length/6};
 }
 return {shell:tube(.026,false),liquid:tube(.017,true),halo:tube(.037,true),points,color,total};
}
function socketFit(g,socket){
 if(g.parts.length!==socket.targets.length)return null;
 if(socket.fitCache.has(g))return socket.fitCache.get(g);
 const mean=socket.targets.reduce((v,p)=>add(v,p),V()).scale(1/socket.targets.length),localMean=g.parts.reduce((v,p)=>add(v,p.offset),V()).scale(1/g.parts.length),firstInv=g.parts[0].q.inverse();
 for(const o of orientations){const q=o.mult(firstInv),p=sub(mean,q.vmult(localMean)),locations=g.parts.map(part=>add(p,q.vmult(part.offset))),taken=new Set();let fits=true;
  for(const loc of locations){const index=socket.targets.findIndex((target,i)=>!taken.has(i)&&target.distanceTo(loc)<.007);if(index<0){fits=false;break;}taken.add(index);}
  if(fits){const fit={position:p,quaternion:q};socket.fitCache.set(g,fit);return fit;}
 }socket.fitCache.set(g,null);return null;
}
function undockCampaignGroup(g){if(!g?.storySocket)return;const socket=g.storySocket;socket.occupant=null;g.storySocket=null;g.body.type=CANNON.Body.DYNAMIC;g.body.updateMassProperties();g.body.wakeUp();}
function campaignDockTarget(target){
 story.dockCandidate=null;story.socketHint=null;const c=story.campaign;if(story.scene!=='campaign'||!c||!held||held.items.length!==1)return target;const gate=c.gates[c.stage],socket=gate?.socket;if(!socket||gate.solved&&socket.occupant)return target;
 const hit=rayPuzzleBox(V(...camera),direction(),socket,2.8);if(hit===null)return target;
 const fit=socketFit(held.g,socket);story.socketHint={socket,text:fit?'Acerca la forma al hueco':held.g.parts.length!==socket.targets.length?socket.targets.length+' Q-bits unidos · '+socket.form.name:'La forma todavía no coincide'};
 if(!fit||socket.occupant&&socket.occupant!==held.g)return target;
 story.dockCandidate={socket,g:held.g,...fit};const aligned=qSimilarity(held.g.body.quaternion,fit.quaternion)>.995;story.socketHint.text=aligned&&held.g.body.position.distanceTo(fit.position)<.09?'Suelta para encajar':'Alineando la estructura…';const approach=add(fit.position,V(0,0,aligned?0:.32));return add(approach,fit.quaternion.vmult(held.anchor));
}
function tryDockCampaign(g,candidate){
 if(!candidate||candidate.g!==g||!groups.includes(g)||candidate.socket.occupant||g.body.position.distanceTo(candidate.position)>.11||qSimilarity(g.body.quaternion,candidate.quaternion)<.975)return false;
 const s=candidate.socket;g.body.position.copy(candidate.position);g.body.quaternion.copy(candidate.quaternion);g.body.velocity.set(0,0,0);g.body.angularVelocity.set(0,0,0);g.body.type=CANNON.Body.KINEMATIC;g.body.updateMassProperties();g.body.aabbNeedsUpdate=true;g.storySocket=s;s.occupant=g;story.dockCandidate=null;return true;
}
function socketIsPressed(socket){const g=socket?.occupant;if(!g||!groups.includes(g)||held?.items.some(i=>i.g===g))return false;const fit=socketFit(g,socket);return !!fit&&g.body.position.distanceTo(fit.position)<.025&&poses(g).every(p=>socket.targets.some(t=>t.distanceTo(p.p)<.015));}
function updateCampaignPressure(dt){if(story.scene!=='campaign'||!story.campaign)return;for(const b of storyWorld.buttons){b.load=buttonLoad(b);b.pressed+=(Math.min(1,b.load/b.required)-b.pressed)*(1-Math.exp(-12*dt));}}
function moveCampaignDoor(gate,dt){if(!gate.solved)return;gate.open=Math.min(1,gate.open+dt/.95);const t=gate.open,u=t*t*(3-2*t),d=gate.door;d.p.y=d.initialY+2.65*u;d.body.position.copy(d.p);d.min=sub(d.p,d.half);d.max=add(d.p,d.half);d.body.aabbNeedsUpdate=true;}
function campaignOrder(g){if(story.scene==='campaign'&&story.campaign)for(const part of g.parts)story.campaign.ordered.add(part.id);}
function beginCampaignLevel(number){
 number=clamp(Math.floor(number),1,12);const carry=number===9&&story.level===8&&story.phase==='complete'?groups.flatMap(g=>worldParts(g)):null;rememberLab();clearNarrativeScene();applyStageDefaults();story.level=number;story.phase='challenge';story.started=true;story.elapsed=0;gameScene('campaign');gameMode('playing');position.splice(0,3,0,EYE_HEIGHT,2.3);yaw=0;pitch=number<=4?-.6:-.25;camera.splice(0,3,...position);
 const definition=LEVELS[number],zs=definition.gates.map((_,i)=>definition.gates.length===1?-3.4:-1.6-i*4),c={number,definition,stage:0,gates:[],crew:[],ordered:new Set(),labelsAt:0,hintAt:0};story.campaign=c;storyWorld.buttons=[];campaignBoundary(zs);
 definition.gates.forEach((def,index)=>{const gate=campaignGate(zs[index],index,def);c.gates.push(gate);
  if(def.weights)for(let i=0;i<def.weights.length;i++){const x=def.weights.length===1?(def.kind==='combo'?1.65:0):i===0?-1.4:1.4;makeCampaignPad(gate,x,gate.z+1.4,def.weights[i],i);}
  if(def.form)buildSocket(gate,FORMS[def.form]);
  if(def.targets)for(let i=0;i<def.targets;i++)gate.targets.push({p:V(def.targets===1?-.85:i===0?-1.35:1.35,.003,gate.z+1.8),assigned:null,ready:false,index:i});
 });
 for(let i=0;i<definition.count;i++){const x=definition.count===1?-.85:(i%3-1)*.30,z=.55+Math.floor(i/3)*.3,g=carry?.[i]?makeGroup([{...carry[i],p:V(x,HALF+.004,z),q:Q()}]):addQubit([x,HALF+.004,z],1);c.crew.push(g.parts[0].id);g.parts[0].mood.name='Q-bit '+(i+1);if(i===0)story.guideId=g.parts[0].id;}
 if(number<=2)c.gates[0].targets.forEach((t,i)=>t.assigned=c.crew[i]);makeButtonPhysics(storyWorld.buttons);storyWorld.door=c.gates[0].door;storyWorld.doorProgress=0;world.broadphase.dirty=true;
 setupBlockTwo(c);updateCampaignObjective();if(number===9)beginEncounter();else say(definition.line,{after:hideStoryDialogue});updatePanel();
}
function updateCampaignObjective(){
 const c=story.campaign;if(!c)return;const gate=c.gates[c.stage],part=c.gates.length>1?'Sala '+(c.stage+1)+' / '+c.gates.length+' · ':'';let text='';
 if(gate.solved){text=c.number>=5?'Puerta abierta. Retira y reutiliza los Q-bits.\nCruza para continuar.':'Puerta abierta. Cruza para continuar.';}
 else if(gate.kind==='routes')text=gate.targets.length===1?'Lleva al Q-bit al círculo de luz.\nClic derecho · seleccionar y elegir destino':'Un Q-bit en cada destino.\nDales órdenes por separado: 1 → A, 2 → B.';
 else if(gate.kind==='generation')text='Entrega materia al desintegrador '+(gate.index+1)+'.\n'+gate.generatedRequired+' unidades → '+gate.generatedRequired+' Q-bits.\nApunta al material y pulsa E para asignar un equipo.';
 else if(gate.kind==='buttons')text=gate.pads.length===2?'Mantén un Q-bit sobre cada botón.':'Coloca dos Q-bits en el mismo botón.\nEl aro muestra 50 % y 100 %.';
 else {text=gate.socket.form.name+' · '+gate.socket.targets.length+' Q-bits unidos\nShift + soltar · unir | Alt · separar';if(gate.kind==='combo')text+='\nAdemás, mantén dos Q-bits en el botón.';}
 if(gate.generatedRequired&&gate.kind!=='generation')text+='\nGeneración: '+generatedForGate(gate)+' / '+gate.generatedRequired;storyObjective(part+text);
}
function tickCampaign(dt){
 const c=story.campaign;if(!c||['complete','finishing'].includes(story.phase))return;const gate=c.gates[c.stage];
 for(const g of c.gates)moveCampaignDoor(g,dt);
 let active=false;
 if(gate.kind==='routes'){
  for(const t of gate.targets){const g=groups.find(g=>g.parts.length===1&&g.parts[0].id===t.assigned);t.ready=!!g&&c.ordered.has(t.assigned)&&!g.route&&held?.g!==g&&bounds(g).min.y<.035&&Math.hypot(g.body.position.x-t.p.x,g.body.position.z-t.p.z)<.21;}
  active=gate.targets.every(t=>t.ready);
 }else{active=gate.pads.every(b=>b.load>=b.required);if(gate.socket)active=active&&socketIsPressed(gate.socket);}
 if(gate.generatedRequired)active=active&&generatedForGate(gate)>=gate.generatedRequired;gate.active=active;
 if(!gate.solved){
  if(gate.pipe){gate.flow=clamp(gate.flow+dt*(active?1/(gate.seconds||9):-1/5.5),0,1);if(gate.flow>=1)gate.solved=true;}
  else{gate.hold=active?Math.min(1,gate.hold+dt/1.1):0;if(gate.hold>=1)gate.solved=true;}
  if(gate.solved){updateCampaignObjective();if(!story.dialogue)say(gate.pipe?'Llegó. La puerta queda abierta. Ahora puedes retirarnos.':'Listo. Puedes recuperar las piezas; esta puerta ya queda abierta.',{after:hideStoryDialogue});}
 }
 storyWorld.door=gate.door;storyWorld.doorProgress=gate.open;
 if(gate.solved&&gate.open>.98&&position[2]<gate.z-.85){
  if(c.stage<c.gates.length-1){c.stage++;story.dockCandidate=null;updateCampaignObjective();const next=c.gates[c.stage];say(next.kind==='generation'?'La siguiente estación está más adelante. La materia debe llegar hasta su entrada.':next.kind==='combo'?'Dos en el botón y cuatro en la pared. Esta vez necesitamos a todo el equipo.':next.socket?'La siguiente forma es '+next.socket.form.name+'. Reorganiza las mismas piezas.':'Seguimos. Uno a cada lado.',{after:hideStoryDialogue});}
  else if(c.number===8||c.number>=9){const missing=c.crew.filter(id=>!groups.some(g=>g.parts.some(p=>p.id===id)&&partPose(g,g.parts.find(p=>p.id===id)).p.z<gate.z-.35));if(!missing.length)finishCampaignLevel();else storyObjective('Faltan '+missing.length+' Q-bits al otro lado.\nReúne al equipo y tráelo contigo.');}
  else finishCampaignLevel();
 }
}
function finishCampaignLevel(){
 if(story.phase==='finishing'||story.phase==='complete'||story.transition)return;
 story.phase='finishing';sceneFade(showCampaignResults,{out:2.1,black:.65,inTime:.9,loading:false,kind:'results'});
}
function showCampaignResults(){
 const n=story.level;saveStoryProgress('level'+n);story.phase='complete';hideStoryDialogue();storyObjective('');gameMode('complete');pause(false);
 document.querySelector('#complete-eyebrow').textContent=String(n).padStart(2,'0')+' / '+chapters[n][1].toUpperCase();document.querySelector('#complete-title').textContent=n===12?'Cada pieza cuenta.':n===8?'Salimos juntos.':'Una puerta más.';document.querySelector('#complete-description').textContent=n===12?'Dos bloques completos. Todos los compañeros han cruzado contigo.':n===8?'Primer bloque completado. Al otro lado te espera el equipo.':'Nivel '+n+' completado. El siguiente encuentro te espera.';document.querySelector('#complete-next').hidden=n===12;document.querySelector(n===12?'#complete-repeat':'#complete-next').focus({preventScroll:true});
}
function drawCampaignOpaque(){
 const c=story.campaign;if(!c)return;drawSourcesOpaque();gl.uniform1f(uniforms.uTime,simTime);drawAlphaButtons(storyWorld.buttons);
 for(const gate of c.gates){
  for(const t of gate.targets){drawAsset(storyTargetMesh,t.p,Q(),V(.25,1,.25),t.ready?[.22,.77,.50,1]:[.42,.67,.62,1],3);drawRing(add(t.p,V(0,.003,0)),.28,.8);}
  const s=gate.socket;if(s){for(const p of s.targets){const size=V(CUBE_SIZE-.005,CUBE_SIZE-.005,.003);drawBox(add(p,V(0,0,-.069)),Q(),size,[.21,.40,.34,1]);}
   const ready=socketIsPressed(s);drawBox(add(s.center,V(.35,.34,.073)),Q(),V(.035,.012,.003),ready?[.2,1,.53,1]:[.50,.63,.57,1]);
  }
  if(gate.pipe){const f=gate.pipe;gl.uniform1f(uniforms.uScale,gate.flow);if(gate.flow>0)drawAsset(f.liquid,V(),Q(),V(1,1,1),[...f.color,1],10);drawBox(V(-.86,1.12,gate.z+.145),Q(),V(.10,.19,.065),[.71,.77,.74,1]);drawBox(V(-.86,1.12-.075*(1-gate.flow),gate.z+.181),Q(),V(.035,.15*Math.max(.01,gate.flow),.003),[...f.color,1]);}
 }
}
function drawCampaignTransparent(){
 const c=story.campaign;if(!c)return;gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
 for(const gate of c.gates){if(gate.pipe){const f=gate.pipe;gl.uniform1f(uniforms.uScale,gate.flow);drawAsset(f.shell,V(),Q(),V(1,1,1),[.74,.89,.85,.25],11);if(gate.flow>0)drawAsset(f.halo,V(),Q(),V(1,1,1),[...f.color,.14],12);}
  if(gate.socket&&!gate.socket.occupant&&gate.index===c.stage)for(const p of gate.socket.targets){drawBox(add(p,V(0,0,.015)),Q(),V(.086,.086,.086),[.25,.86,.57,(story.dockCandidate?.socket===gate.socket)? .09:.035]);}
 }drawSourcesTransparent();gl.depthMask(true);gl.disable(gl.BLEND);
}
const campaignLabels=[];
function updateCampaignLabels(){
 const layer=document.querySelector('#campaign-labels'),c=story.campaign,visible=story.scene==='campaign'&&story.mode==='playing'&&panel.hidden&&!story.transition;layer.hidden=!visible;if(!visible||!c)return;
 const gate=c.gates[c.stage],labels=blockTwoLabels();
 for(const t of gate.targets)labels.push({p:add(t.p,V(0,.10,0)),text:(t.index===0?'A':'B')+' · '+(t.ready?'listo':'Q-bit '+(t.index+1))});
 if(gate.kind==='routes')for(const [i,id] of c.crew.entries()){const g=groups.find(g=>g.parts.some(p=>p.id===id));if(g)labels.push({p:add(g.body.position,V(0,.14,0)),text:String(i+1)});}
 for(const b of gate.pads)labels.push({p:add(b.p,V(0,.19,0)),text:Math.min(b.required,Math.round(b.load))+' / '+b.required+' Q-bits'});
 if(gate.socket){const s=gate.socket,text=gate.solved?'Puerta abierta · retira las piezas':story.socketHint?.socket===s?story.socketHint.text:gate.flow>0?(gate.active?'Cargando ':'Volviendo ')+Math.round(gate.flow*100)+' %':s.form.name;labels.push({p:add(s.center,V(0,.54,0)),text});}
 while(campaignLabels.length<labels.length){const el=document.createElement('div');el.className='campaign-label';layer.appendChild(el);campaignLabels.push(el);}
 for(let i=0;i<campaignLabels.length;i++){const el=campaignLabels[i],l=labels[i],p=l?project(l.p):null;el.hidden=!p||p.x<25||p.x>canvas.clientWidth-25||p.y<65||p.y>canvas.clientHeight-(ui.dialogue.hidden?40:205);if(!el.hidden){el.style.left=p.x+'px';el.style.top=p.y+'px';el.textContent=l.text;el.dataset.voice=l.voice||'';}}
}
function initTitleGreeting(){const cube=document.querySelector('#title-qbit'),bubble=document.querySelector('#title-greeting');let last=-100,hide=null;const greet=()=>{const now=performance.now()/1000;if(now-last<5)return;last=now;bubble.textContent='¡Hola! Te estaba esperando.';bubble.hidden=false;cube.classList.add('saying-hello');clearTimeout(hide);hide=setTimeout(()=>{bubble.hidden=true;cube.classList.remove('saying-hello');},2800);};cube.addEventListener('pointerenter',greet);cube.addEventListener('focus',greet);cube.addEventListener('click',greet);}

// Chapter II — finite matter, physical transport, opaque animated chambers.
LEVELS.push(
 {count:6,gates:[{kind:'generation',generatedRequired:2},{kind:'combo',form:'square',weights:[2,2],seconds:9}],line:''},
 {count:8,gates:[{kind:'buttons',weights:[2,2]},{kind:'generation',generatedRequired:2},{kind:'generation',generatedRequired:2,weights:[2,2]}],line:'Abramos el paso antes de mover la materia. Después hay dos desintegradores, uno en cada sala. Podemos arrastrar mientras tú exploras.'},
 {count:8,gates:[{kind:'generation',generatedRequired:2},{kind:'combo',form:'rectangle',weights:[2],seconds:10}],line:'Dos rutas, dos depósitos. La barra cercana da dos compañeros; el bloque del otro lado da cuatro y necesita más ayuda. Tú eliges.'},
 {count:8,gates:[{kind:'generation',generatedRequired:2,weights:[2]},{kind:'combo',form:'tee',weights:[2],generatedRequired:4,seconds:10},{kind:'combo',form:'steps',weights:[2],generatedRequired:8,seconds:12}],line:'Tres estaciones: dos, cuatro y ocho unidades. Cada trozo de materia se transforma una sola vez. Reúne al equipo y llévanos a todos hasta la salida.'}
);
const encounterBubbles=[];
function clearBlockTwo(){
 const c=story.campaign;if(c?.sources)for(const s of c.sources)for(const mesh of [s.pipe.shell,s.pipe.liquid,s.pipe.halo,s.hardware])gl.deleteBuffer(mesh.buffer);
 story.encounter=null;for(const b of encounterBubbles)b.node.remove();encounterBubbles.length=0;
 document.querySelector('#encounter-bubbles').hidden=true;document.querySelector('#skip-encounter').hidden=true;
}
function generatedForGate(gate){return (story.campaign?.sources||[]).filter(s=>s.gate===gate).reduce((n,s)=>n+s.produced,0);}
function setupBlockTwo(c){
 c.sources=[];c.materials=new Map();c.consumed=new Set();c.generated=0;c.moodLessons=new Set();c.lessonAt=story.elapsed+25;
 if(c.number<9)return;
 const station=(gateIndex,units,p,materialP,required=2)=>buildSource(c.gates[gateIndex],units,p,materialP,required);
 if(c.number===9){station(0,2,V(2.15,0,-.4),V(.9,0,1.25));}
 if(c.number===10){station(1,2,V(2.15,0,-4.3),V(1.6,0,.5));station(2,2,V(2.15,0,-8.3),V(-1.5,0,-3.05));}
 if(c.number===11){station(0,2,V(-2.15,0,-.35),V(-1.85,0,1.1));station(0,4,V(2.15,0,-.35),V(2.05,0,3.0),4);storyWall(V(0,.5,.25),V(.07,.5,.95),{color:[.93,.95,.94]});for(const [i,g] of groups.entries()){g.body.position.set((i%3-1)*.36,HALF+.005,1.45+Math.floor(i/3)*.22);g.body.aabbNeedsUpdate=true;}}
 if(c.number===12){station(0,2,V(2.15,0,-.35),V(1.1,0,1.4));station(1,4,V(2.15,0,-4.3),V(1.65,0,-2.9),4);station(2,8,V(2.15,0,-8.3),V(1.65,0,-6.8),6);}
 const rest=createCooler(V(-2.15,0,c.number===9?1.5:.8));if(rest){rest.capacity=4;rest.coolSeconds=4.5;rest.chapterOwned=true;c.rest=rest;}
 for(let i=1;i<c.gates.length;i++){const cooler=createCooler(V(-2.6,0,c.gates[i].z+2.6));if(cooler){cooler.capacity=4;cooler.coolSeconds=4.5;cooler.chapterOwned=true;}}
}
function newMatter(units,p,required,station){
 const dims=units===2?[2,1,1]:units===4?[2,1,2]:[2,2,2],scale=.18,size=V(...dims.map(v=>v*scale));
 const material=newCargo(p,Math.round(Math.max(...dims)*scale/CUBE_SIZE),required,units===2?'#51b8a8':units===4?'#5999c9':'#788bd2');if(!material)return null;
 material.dimensions=size;material.grid=dims;material.units=units;material.source=station;material.materialId='matter-'+story.level+'-'+station.id;material.body.shapes.length=0;material.body.shapeOffsets.length=0;material.body.shapeOrientations.length=0;material.body.addShape(new CANNON.Box(mul(size,.5)));material.body.position.y=size.y/2;material.body.updateBoundingRadius();material.body.updateMassProperties();material.body.aabbNeedsUpdate=true;
 story.campaign.materials.set(material.materialId,{units,consumed:false,source:station});return material;
}
function buildSource(gate,units,p,materialP,required){
 const c=story.campaign,side=p.x<0?-1:1,id=c.sources.length+1,exit=add(p,V(-side*.92,0,.05)),color=[.38,.40,.41],fluid=[.012,.013,.014];
 const s={id,gate,p,side,units,required,exit,intake:add(p,V(0,0,.52)),state:'waiting',timer:0,flow:0,produced:0,shutter:0,material:null,launches:[],blocked:false,color};c.sources.push(s);
 const white=[.93,.94,.94];for(const x of [-.39,.39])storyWall(add(p,V(x,.43,-.02)),V(.065,.43,.18),{color:white});
 storyWall(add(p,V(0,.83,-.02)),V(.455,.09,.18),{color:white});storyWall(add(p,V(0,.37,-.19)),V(.34,.37,.05),{color:[.008,.009,.010]});
 storyWall(add(exit,V(0,.26,-.10)),V(.32,.26,.09),{color:white});
 s.pipe=buildFlowPipe([add(p,V(.27,.74,.20)),add(p,V(.30,1.08,.26)),add(p,V(-side*.40,1.22,.28)),add(exit,V(0,.85,.19)),add(exit,V(0,.38,.19))],fluid);
 // Static inset seams and hose couplings share one buffer and draw call.
 // The white structural bodies and their collision dimensions are unchanged.
 s.hardware=buildBoxAssembly([
  [add(p,V(-.320,.40,.166)),V(.012,.66,.010)],[add(p,V(.320,.40,.166)),V(.012,.66,.010)],
  [add(p,V(0,.736,.166)),V(.65,.012,.010)],
  [add(p,V(-.39,.12,.166)),V(.12,.006,.010)],[add(p,V(.39,.12,.166)),V(.12,.006,.010)],
  [add(p,V(.27,.746,.20)),V(.075,.045,.075)],[add(exit,V(0,.38,.19)),V(.075,.065,.075)],
  [add(exit,V(0,.103,.024)),V(.46,.012,.022)],
  [add(exit,V(-side*.275,.285,.080)),V(.074,.33,.018)]
 ]);
 s.material=newMatter(units,materialP,required,s);return s;
}
function sourceAccepts(s,cargo){
 const c=story.campaign,record=c?.materials.get(cargo?.materialId);
 return !!record&&!record.consumed&&!c.consumed.has(cargo.materialId)&&record.source===s&&s.material===cargo&&cargos.includes(cargo)&&s.state==='waiting'&&cargo.units===record.units;
}
function beginConversion(s,cargo){
 if(!sourceAccepts(s,cargo)||Math.hypot(cargo.body.position.x-s.intake.x,cargo.body.position.z-s.intake.z)>.14)return false;
 if(groups.reduce((n,g)=>n+g.parts.length,0)+cargo.units>MAX_QUBITS){s.blocked=true;return false;}
 stopHaul(cargo,'Materia recibida');cargo.intake=0;cargo.body.type=CANNON.Body.KINEMATIC;cargo.body.collisionResponse=false;cargo.body.velocity.set(0,0,0);cargo.body.updateMassProperties();s.state='intake';s.timer=0;s.from=cargo.body.position.clone();s.blocked=false;return true;
}
function outputPosition(s,index){return add(s.exit,V((index%4-1.5)*.15,HALF+.008,.57+Math.floor(index/4)*.16));}
function outputClear(p){
 const box={p,q:Q(),half:V(HALF+.005,HALF+.005,HALF+.005)};
 return !groups.some(g=>poses(g).some(pose=>obbOverlap(box,pose,-.002)))&&!storyWorld.walls.some(w=>obbOverlap(box,{p:w.p,q:Q(),half:w.half},-.002));
}
function emitSourceQbit(s){
 if(s.produced>=s.units)return false;
 const target=outputPosition(s,s.produced);if(!outputClear(target)){s.blocked=true;return false;}
 const g=addQubit([target.x,target.y,target.z],1);if(!g)return false;
 g.parts[0].mood.name='Q-bit '+(story.campaign.crew.length+1);g.parts[0].mood.energy=.9;g.storyEmerging=true;g.body.type=CANNON.Body.KINEMATIC;g.body.collisionResponse=false;g.body.updateMassProperties();g.body.position.copy(add(s.exit,V(0,.15,.21)));s.launches.push({g,target,t:0,from:g.body.position.clone()});
 s.produced++;story.campaign.generated++;story.campaign.crew.push(g.parts[0].id);s.blocked=false;return true;
}
function tickSources(dt){
 const c=story.campaign;if(!c?.sources)return;
 for(const s of c.sources){
  for(const item of [...s.launches]){item.t=Math.min(1,item.t+dt/.65);const u=item.t*item.t*(3-2*item.t);item.g.body.position.copy(add(mul(item.from,1-u),mul(item.target,u)));item.g.body.aabbNeedsUpdate=true;
   if(item.t===1){item.g.storyEmerging=false;item.g.body.type=CANNON.Body.DYNAMIC;item.g.body.collisionResponse=true;item.g.body.updateMassProperties();item.g.body.wakeUp();s.launches.splice(s.launches.indexOf(item),1);}}
  const active=['intake','charging','output'].includes(s.state);s.shutter+=((active?1:0)-s.shutter)*(1-Math.exp(-4*dt));
  if(s.state==='waiting'){
   if(s.gate.index>c.stage)continue;const cargo=s.material;if(!sourceAccepts(s,cargo))continue;
   if(Math.hypot(cargo.body.position.x-s.intake.x,cargo.body.position.z-s.intake.z)<.11)beginConversion(s,cargo);
  }else if(s.state==='intake'){
   s.timer+=dt;const t=Math.min(1,s.timer/2.3),u=t*t*(3-2*t),cargo=s.material;cargo.intake=t;cargo.body.position.copy(add(mul(s.from,1-u),mul(add(s.p,V(0,cargo.dimensions.y/2,.01)),u)));cargo.body.aabbNeedsUpdate=true;
   if(t===1){const record=c.materials.get(cargo.materialId);record.consumed=true;c.consumed.add(cargo.materialId);deleteCargo(cargo,true);s.state='charging';s.timer=0;}
  }else if(s.state==='charging'){
   s.flow=Math.min(1,s.flow+dt/4.5);if(s.flow===1){s.state='output';s.timer=.8;}
  }else if(s.state==='output'){
   s.timer+=dt;if(s.timer>=.9&&emitSourceQbit(s))s.timer=0;
   if(s.produced===s.units&&!s.launches.length){s.state='done';updateCampaignObjective();if(!story.dialogue) say(s.units+' unidades transformadas. '+s.units+' compañeros nuevos. La materia se consumió; no hay copias infinitas.',{after:hideStoryDialogue});}
  }
 }
}
function availableHaulers(cargo){return groups.filter(g=>g.parts.every(p=>story.campaign.crew.includes(p.id))&&!g.storySocket&&!g.storyEmerging&&!g.cooler&&!g.route&&!g.haulJob&&!held?.items.some(i=>i.g===g)&&bounds(g).min.y<.04&&!onCampaignPad(g)).sort((a,b)=>Number(groupWilling(b))-Number(groupWilling(a))||a.body.position.distanceTo(cargo.body.position)-b.body.position.distanceTo(cargo.body.position));}
function sendMaterial(cargo,chosen=null){
 if(!cargo?.source||!sourceAccepts(cargo.source,cargo)||story.encounter)return false;
 if(cargo.source.gate.index>story.campaign.stage){announce('Abre primero el paso hasta esa estación.');return false;}
 const candidates=chosen?.length?chosen:availableHaulers(cargo),team=[];let count=0;
 for(const g of candidates){team.push(g);count+=g.parts.length;if(count>=cargo.required)break;}
 if(count<cargo.required){announce('Se necesitan '+cargo.required+' Q-bits disponibles en el suelo. Libera al equipo de sus otras tareas.');return false;}
 const success=beginHaul(cargo,team,cargo.source.intake);if(success){hideStoryDialogue();storyObjective('Equipo en camino · '+cargo.required+' Q-bits\nPuedes acompañarlos o preparar el siguiente mecanismo.');}return success;
}
function interactMaterial(){if(story.scene!=='campaign'||story.encounter)return;const hit=aimCargo(4);if(hit?.cargo.source){if(hit.cargo.job)announce('El equipo ya está trabajando. Clic derecho para cambiar o detener la orden.');else sendMaterial(hit.cargo);}}
function onCampaignPad(g){const bb=bounds(g);return activePressureButtons().some(b=>bb.min.y<(b.surface||0)+.025&&bb.min.x>=b.p.x-b.half-.006&&bb.max.x<=b.p.x+b.half+.006&&bb.min.z>=b.p.z-b.half-.006&&bb.max.z<=b.p.z+b.half+.006);}
function drawMatter(c){
 const t=c.intake||0,scale=1-t*.94,dims=c.dimensions,step=.18,origin=c.body.position,rgb=[1,3,5].map(i=>parseInt(c.color.slice(i,i+2),16)/255);
 for(let x=0;x<c.grid[0];x++)for(let y=0;y<c.grid[1];y++)for(let z=0;z<c.grid[2];z++){
  const local=V((x-(c.grid[0]-1)/2)*step,(y-(c.grid[1]-1)/2)*step,(z-(c.grid[2]-1)/2)*step),p=add(origin,mul(local,scale));drawBox(p,Q(),V((step-.003)*scale,(step-.003)*scale,(step-.003)*scale),[...rgb,1]);
 }
 if(!t)drawOutline(origin,Q(),dims,.7,selectedCargo===c);
}
function drawSourcesOpaque(){
 const c=story.campaign;if(!c?.sources)return;
 for(const s of c.sources){
  const p=s.p,e=s.exit,f=s.pipe;
  drawAsset(s.hardware,V(),Q(),V(1,1,1),[.28,.30,.31,1]);
  // Opaque animated portal plane: a black chamber, never a view through a wall.
  drawAsset({buffer:cubeGeometry,count:36},add(p,V(0,.38,.015)),Q(),V(.63,.70,.012),[...s.color,1],13);
  for(const side of [-1,1])drawBox(add(p,V(side*(.18+s.shutter*.15),.40,.045)),Q(),V(.018,.66,.04),[.49,.52,.53,1]);
  drawBox(add(p,V(0,.008,.46)),Q(),V(.76,.015,.70),[.79,.81,.81,1]);drawRing(add(s.intake,V(0,.019,0)),.23,.8,[.31,.34,.35]);
  drawBox(add(e,V(0,.27,.005)),Q(),V(.46,.32,.018),[.006,.007,.008,1]);
  drawBox(add(e,V(0,.26+s.shutter*.34,.035)),Q(),V(.48,.34,.04),[.89,.91,.91,1]);
  drawBox(add(e,V(0,.006,.60)),Q(),V(.72,.012,.70),[.85,.87,.87,1]);
  drawBox(add(e,V(0,.70,.065)),Q(),V(.72,.19,.035),[.91,.93,.92,1]);
  for(let i=0;i<s.units;i++)drawBox(add(e,V((i-(s.units-1)/2)*.072,.70,.089)),Q(),V(.046,.056,.012),i<s.produced?[.035,.038,.040,1]:[.70,.74,.73,1]);
  // The side window exposes the same black feedstock arriving through the hose.
  drawBox(add(e,V(-s.side*.275,.285,.092)),Q(),V(.052,.30,.009),[.76,.79,.79,1]);
  if(s.flow>0)drawAsset({buffer:cubeGeometry,count:36},add(e,V(-s.side*.275,.135+.15*s.flow,.099)),Q(),V(.052,.30*s.flow,.009),[...f.color,1],4);
  gl.uniform1f(uniforms.uScale,s.flow);if(s.flow>0)drawAsset(f.liquid,V(),Q(),V(1,1,1),[...f.color,1],14);
  for(let i=0;i<7;i++){const a=simTime*.22+i*.71,x=Math.sin(a*2.7)*.27,y=.11+((simTime*.055+i*.137)%1)*.57;drawBox(add(p,V(x,y,.045+Math.sin(a)*.025)),Q(),V(.007,.012,.004),[.27,.29,.30,.75]);}
 }
}
function drawSourcesTransparent(){for(const s of story.campaign?.sources||[]){gl.uniform1f(uniforms.uScale,s.flow);drawAsset(s.pipe.shell,V(),Q(),V(1,1,1),[.85,.87,.87,.2],11);if(s.flow>0)drawAsset(s.pipe.halo,V(),Q(),V(1,1,1),[.55,.57,.57,.025],12);drawAsset({buffer:cubeGeometry,count:36},add(s.exit,V(-s.side*.275,.285,.106)),Q(),V(.052,.30,.004),[.85,.87,.87,.12],11);}}
function blockTwoLabels(){
 const labels=[],c=story.campaign;if(!c?.sources)return labels;
 for(const s of c.sources){if(s.gate.index>c.stage+1)continue;
  const state=s.blocked?'Libera la bandeja de salida':s.state==='waiting'?'Materia '+s.units+' → '+s.units+' Q-bits':s.state==='intake'?'Desintegrando materia…':s.state==='charging'?'Transfiriendo · '+Math.round(s.flow*100)+' %':s.state==='output'?'Abriendo compuerta…':'Transformación completa';
  labels.push({p:add(s.p,V(0,1.0,.05)),text:'DESINTEGRADOR '+s.id+' · '+state});labels.push({p:add(s.exit,V(0,.86,.10)),text:s.produced+' / '+s.units+' generados'});
  if(cargos.includes(s.material)&&s.state==='waiting'){const m=s.material;labels.push({p:add(m.body.position,V(0,.25,0)),text:m.job?'Equipo '+(m.job.activeCount||0)+' / '+m.required+' · '+m.job.phase:m.units+' unidades · E: transportar con '+m.required+' Q-bits'});}
 }
 if(story.encounter?.phase==='care'){const g=encounterPatient();if(g)labels.push({p:add(g.body.position,V(0,.15,0)),text:'INQUIETO · agotado'});if(c.rest)labels.push({p:add(c.rest.p,V(0,.25,0)),text:'ENFRIADOR · déjalo descansar'});}
 if(story.encounter?.phase==='calling'){const g=storyGuide();if(g)labels.push({p:add(g.body.position,V(0,.14,0)),text:'Pssss… ¡Por aquí!',voice:'npc'});}
 return labels;
}
function encounterLocksActions(){return !!story.encounter&&['talk','chorus','explain'].includes(story.encounter.phase);}
function moodTeachingPaused(){return !!story.encounter&&story.encounter.phase!=='care';}
function encounterPatient(){const id=story.encounter?.patient;return groups.find(g=>g.parts.some(p=>p.id===id));}
function storySequence(lines,done){let i=0;const next=()=>{if(!story.encounter)return;if(i===lines.length){done?.();return;}say(lines[i++],{hold:true,after:next});};next();}
function beginEncounter(){
 const c=story.campaign;story.encounter={phase:'calling',time:0,chorus:0,patient:c.crew[4],greeted:false};document.querySelector('#skip-encounter').hidden=false;
 for(let i=0;i<6;i++){const g=groups.find(g=>g.parts[0].id===c.crew[i]);g.body.position.set(i===0?-.5:-1.35+(i-1)*.42,HALF+.005,i===0?1.05:.35);g.body.velocity.set(0,0,0);g.parts[0].mood.idle=0;}
 storyObjective('Pssss… alguien te llama desde el suelo.\nAcércate y mira al Q-bit. C · agacharte');hideStoryDialogue();
}
function beginTeamTalk(){
 story.encounter.phase='talk';storySequence(['¡Hola! Soy yo de nuevo. Esta vez aquí abajo.','Ya sabes movernos y unirnos. Pero creo que todavía no te he contado mucho sobre nosotros.','Bueno… estos son los demás.'],()=>{hideStoryDialogue();story.encounter.phase='chorus';story.encounter.time=0;});
}
function addEncounterBubble(id,text,duration=3){
 if(encounterBubbles.length>=3){encounterBubbles[0].node.remove();encounterBubbles.shift();}const node=document.createElement('div');node.className='encounter-bubble';node.textContent=text;document.querySelector('#encounter-bubbles').appendChild(node);encounterBubbles.push({id,text,node,left:duration});
}
function measureEncounterBubbles(bubbles,width,height){
 // Fonts are ready before play. Read each bubble only on creation or a viewport resize.
 for(const b of bubbles)if(!b.size||b.size.viewportWidth!==width||b.size.viewportHeight!==height){
  b.size={width:b.node.offsetWidth,height:b.node.offsetHeight,viewportWidth:width,viewportHeight:height};
 }
}
function placeEncounterBubble(p,size,placed,width,height){
 if(size.width>width-24||size.height>height-24)return null;
 const inset=12,gap=8,x=clamp(p.x,size.width/2+inset,width-size.width/2-inset),left=x-size.width/2,right=x+size.width/2;
 const maxTop=Math.max(inset,height-size.height-inset),preferred=p.y-15-size.height;
 const candidates=[preferred,p.y+15,inset,maxTop];
 for(const other of placed)candidates.push(other.top-size.height-gap,other.bottom+gap);
 const overlap=top=>placed.reduce((sum,other)=>sum+Math.max(0,Math.min(right+gap,other.right)-Math.max(left-gap,other.left))*Math.max(0,Math.min(top+size.height+gap,other.bottom)-Math.max(top-gap,other.top)),0);
 let top=inset,bestOverlap=Infinity,bestDistance=Infinity;
 for(const candidate of candidates){const y=clamp(candidate,inset,maxTop),area=overlap(y),distance=Math.abs(y-preferred);if(area<bestOverlap||(area===bestOverlap&&distance<bestDistance)){top=y;bestOverlap=area;bestDistance=distance;}}
 return bestOverlap?null:{left,right,top,bottom:top+size.height,x};
}
function layoutEncounterBubbles(){
 const layer=document.querySelector('#encounter-bubbles');layer.hidden=!encounterBubbles.length||story.mode!=='playing'||!panel.hidden;if(layer.hidden)return;
 const width=canvas.clientWidth,height=canvas.clientHeight,visible=[],placed=[];
 for(const b of encounterBubbles){const g=groups.find(g=>g.parts.some(p=>p.id===b.id)),p=g?project(add(g.body.position,V(0,.11,0))):null;const hidden=!p||p.x<10||p.x>width-10||p.y<60||p.y>height-80;if(b.node.hidden!==hidden)b.node.hidden=hidden;if(!hidden){b.anchor=p;visible.push(b);}}
 // Batch visibility writes, then measurements, then positions: no per-frame size reads.
 measureEncounterBubbles(visible,width,height);
 for(const b of visible){const rect=placeEncounterBubble(b.anchor,b.size,placed,width,height);if(!rect){b.node.hidden=true;continue;}placed.push(rect);b.node.style.left=rect.x+'px';b.node.style.top=rect.bottom+'px';}
}
function startCareLesson(){
 const e=story.encounter;e.phase='care';const g=encounterPatient();if(g){const m=g.parts[0].mood;m.state='neutral';m.energy=.04;beginMoodEpisode(m,'agotado');m.restLeft=24;m.restTotal=24;}
 hideStoryDialogue();storyObjective('Ayuda al compañero agotado.\nTómalo con clic y déjalo en el enfriador.');
}
function encounterCoolerTarget(target){
 const e=story.encounter,c=story.campaign?.rest;if(e?.phase!=='care'||held?.g!==encounterPatient()||!c)return null;
 return rayPuzzleBox(V(...camera),direction(),alphaBox(add(c.p,V(0,.2,0)),V(.35,.25,.35)),2.8)!==null?add(c.p,V(0,.23,0)):null;
}
function finishEncounter(){
 const e=story.encounter;if(!e)return;const g=encounterPatient();if(g){for(const p of g.parts){Object.assign(p.mood,{state:'neutral',reason:'',energy:.85,restLeft:0,agitation:0,severity:0,calm:3});}}
 story.encounter=null;document.querySelector('#skip-encounter').hidden=true;for(const b of encounterBubbles)b.node.remove();encounterBubbles.length=0;hideStoryDialogue();updateCampaignObjective();captureMouse();story.campaign.lessonAt=story.elapsed+30;
}
function tickEncounter(dt){
 const e=story.encounter;if(!e)return;e.time+=dt;const c=story.campaign;
 for(const b of [...encounterBubbles]){b.left-=dt;if(b.left<=0){b.node.remove();encounterBubbles.splice(encounterBubbles.indexOf(b),1);}}
 if(e.phase==='calling'){const g=storyGuide();if(!g)return;const v=sub(g.body.position,V(...camera)),distance=v.norm();v.normalize();if(distance<2.6&&direction().dot(v)>.92&&e.time>.8)beginTeamTalk();}
 if(e.phase==='chorus'){
  const lines=['¡Hola!','¡Hellooo!','¡Un gusto!','¿Y este quién es?','¡Jajá, holaaa! ¡Qué guapo!'];while(e.chorus<5&&e.time>=e.chorus*.85){addEncounterBubble(c.crew[e.chorus+1],lines[e.chorus]);e.chorus++;}
  if(e.time>6.6){e.phase='explain';const joy=groups.find(g=>g.parts[0].id===c.crew[2]);if(joy)Object.assign(joy.parts[0].mood,{state:'excited',energy:1,blend:[0,1,0]});storySequence(['Ya, ya… de a uno. Y tú: compórtate.','Nos parecemos, pero tenemos energía y estados de ánimo. Tranquilos, podemos trabajar; bien descansados, nos entusiasmamos.','Moverse y arrastrar cosas cuesta energía. Si nos agotamos, necesitamos parar. Mira a nuestro compañero.','Tómalo y déjalo en el enfriador. Ya sabes hacerlo: espera a que termine.'],startCareLesson);}
 }
 if(e.phase==='care'){
  const g=encounterPatient(),entry=c.rest?.entries.get(e.patient);if(g&&!g.cooler){g.parts[0].mood.restLeft=Math.max(g.parts[0].mood.restLeft,12);g.parts[0].mood.energy=Math.min(.2,g.parts[0].mood.energy);}
  if(entry?.done){e.phase='explain';storySequence(['Mucho mejor. Descansar recupera energía; el enfriador también nos ayuda a calmarnos.','Si no podemos pasar, revisa el camino. Y si estamos mucho rato sin hacer nada, podemos inquietarnos. Te avisaremos.','Ahora mira la compuerta: el desintegrador transforma materia de color en nuevos compañeros.','Cada unidad marcada produce un Q-bit. Dos dan dos; cuatro dan cuatro; ocho dan ocho. La materia se consume una sola vez.','No podemos levantar esos bloques: hay que arrastrarlos en equipo. Apunta a la barra de color y pulsa E.','La manguera lleva la materia transformada hasta la compuerta de salida. La bandeja cuenta cuántos han salido. Vamos juntos.'],finishEncounter);}
 }
}
function tickMoodHints(){
 const c=story.campaign;if(!c||c.number<9||story.dialogue||story.encounter||story.elapsed<c.lessonAt)return;
 const g=groups.find(g=>g.parts.some(p=>p.mood.state==='restless'));if(!g)return;
 const m=g.parts.find(p=>p.mood.state==='restless').mood,key=m.severity>=3?'alterado':m.reason;if(c.moodLessons.has(key))return;c.moodLessons.add(key);c.lessonAt=story.elapsed+40;
 const lines={agotado:'Está agotado. Dale un descanso o llévalo al enfriador; el equipo retomará la orden cuando pueda.',bloqueado:'El camino está bloqueado. Libera el paso: repetir la orden no despeja el obstáculo.','sin actividad':'Lleva un rato sin una tarea. También nos inquietamos por eso. Déjalo calmarse y dale algo que hacer.',alterado:'Está bastante alterado. Dale tiempo; el enfriador ayuda a calmarlo.'};if(lines[key])say(lines[key],{after:hideStoryDialogue});
}
function tickBlockTwo(dt){if(!story.campaign)return;if(story.encounter)tickEncounter(dt);else{tickSources(dt);tickMoodHints();}}
function campaignAmbientAllowed(){return story.scene==='campaign'&&story.mode==='playing'&&!story.transition&&!story.encounter&&!story.dialogue&&story.elapsed>8;}

initSpeech();
let previousTime = performance.now();
function renderScene(){
  updateAccentLights();
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.uniform3fv(uniforms.uCamera,camera);
  gl.uniform2f(uniforms.uLook,yaw,pitch);
  bindGeometry(geometry);
  gl.uniform1f(uniforms.uKind,0);
  gl.drawArrays(gl.TRIANGLES,0,vertices.length/6);
  drawStoryWorld();drawQubits();drawStoryGlass();
  redraw=false;
}
function frame(time) {
  if (!running) return;
  const dt = Math.min(Math.max((time - previousTime) / 1000, 0), 0.05);
  let distance = 0;
  previousTime = time;
  if(radialOpen()){
    accumulator=0;if(!unitRadialAllowed())closeUnitRadial(false);
    requestAnimationFrame(frame);return;
  }
  tickStory(dt);
  const frozen=storySuspended()||!!story.transition;
  const active=document.pointerLockElement===canvas&&!document.hidden&&!frozen;
  if(!frozen)updatePosture(dt,active&&storyWalkAllowed(),keys.has('KeyC'));
  if (active) {
    const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
    const sideways = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
    if ((forward || sideways) && storyWalkAllowed() && !marquee && !(held && shiftDown())) {
      const oldX = position[0], oldZ = position[2];
      movePlayer(position, yaw, forward, sideways, dt,posture.height<EYE_HEIGHT-.1?.58:1);
      resolvePuzzlePlayer(oldX,oldZ);resolveStoryPlayer(oldX,oldZ);
      distance = Math.hypot(position[0] - oldX, position[2] - oldZ);
      redraw = true;
    }
  }
  // Two footfalls per stride; driven by actual travel so walking against
  // a wall does not keep the camera bouncing. Blend back to rest smoothly.
  const moving = distance > 0.00001;
  if (moving) walkPhase = (walkPhase + distance * Math.PI * 2 / 1.8) % (Math.PI * 2);
  const blend = 1 - Math.exp(-12 * dt);
  const nextHeight = bobHeight + ((moving ? Math.sin(walkPhase * 2) * 0.026*(posture.height/EYE_HEIGHT) : 0) - bobHeight) * blend;
  const nextSide = bobSide + ((moving ? Math.sin(walkPhase) * 0.016 : 0) - bobSide) * blend;
  if (Math.abs(nextHeight - bobHeight) + Math.abs(nextSide - bobSide) > 0.000001) redraw = true;
  bobHeight = Math.abs(nextHeight) < 0.000001 ? 0 : nextHeight;
  bobSide = Math.abs(nextSide) < 0.000001 ? 0 : nextSide;
  const cameraLimit = ROOM_SIZE / 2 - PLAYER_RADIUS;
  camera[0] = Math.max(-cameraLimit, Math.min(cameraLimit, position[0] + Math.cos(yaw) * bobSide));
  camera[1] = posture.height + bobHeight;
  camera[2] = Math.max(-cameraLimit, Math.min(cameraLimit, position[2] - Math.sin(yaw) * bobSide));
  if (!document.hidden&&!frozen) {
    accumulator += dt;
    while (accumulator >= FIXED_STEP) { stepPhysics(FIXED_STEP); accumulator -= FIXED_STEP; }
    updateTarget();
    updateSpeech();updateStoryMarker();
    redraw = true;
  }
  if (redraw && !document.hidden) {
    renderScene();
  }
  requestAnimationFrame(frame);
}
let gamePrepared=false;
const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
window.QBitsGame={
  async prepare(onProgress=()=>{}){
    if(gamePrepared)return;
    initUnitRadial();initStory();resize();onProgress(.25);
    await nextPaint();
    // Build the actual prologue before Jugar, retaining its bodies and GPU assets.
    beginIntro();gameMode('boot');story.started=false;
    document.querySelector('#wake-screen').hidden=true;
    onProgress(.65);await nextPaint();
    renderScene();
    // A single startup fence pays the initial shader/driver cost behind the loader.
    gl.finish();
    if(gl.isContextLost())throw new Error('Se perdió la conexión con la tarjeta gráfica.');
    onProgress(.9);await nextPaint();
    gamePrepared=true;onProgress(1);
    previousTime=performance.now();accumulator=0;requestAnimationFrame(frame);
  },
  play(){if(!gamePrepared)return;story.started=true;previousTime=performance.now();accumulator=0;resumeGame();}
};

})();
