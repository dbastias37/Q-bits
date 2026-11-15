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
let unitRadial=null,pendingUnitCreation=null;
const preferences=window.QBitsPreferences;
let savedPreferences=preferences.load(window.localStorage),visuals=preferences.effective(savedPreferences),settingsScreen=null,lastVisualFrame=0,previewViewport=null;
let selectionHud=null,selectionHudClock=0,selectionHudStamp='',selectionHudItems=[];
const selectionHudGeometry=new WeakMap();
const reducedHudMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
const visualRGB=key=>preferences.rgb(visuals[key]);
function radialOpen(){return !!unitRadial?.isOpen;}
const storyWorld={walls:[],details:[],door:null,target:null,doorProgress:0};
const ROOM_SIZE = 28; // Ancho y largo; las cuatro paredes se alejan del centro.
const ROOM_HEIGHT = 14;
const EYE_HEIGHT = 1.68;
const PLAYER_RADIUS = 0.28;
const WALK_SPEED = 3.2;
const posture = { height:EYE_HEIGHT, crouchHeight:.78 };
// Inspection follows the wheel-driven hand distance, not the selection state.
const heldFocus = { amount:0, target:0, focal:1.48256097, groups:[], active:false };
const menuFocus={amount:0};
const mechanismDefaults={rpm:30,direction:1,moving:'b',mount:'wheel',maxTorque:.4,capacity:16};

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

const postEffects=window.QBitsGraphics?.create(gl),surfaceTexture=window.QBitsGraphics?.surface(gl);
const vertexSource = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  uniform float uJitter;
  uniform vec2 uResolution;
  varying vec2 vSurfaceUV;
  varying vec3 vAffineUV;
  uniform vec3 uCamera;
  uniform vec2 uLook;
  uniform float uAspect;
  uniform float uFocal;
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
    float focal = uFocal;
    float nearClip = 0.04, farClip = 60.0;
    gl_Position = vec4(
      dot(relative, right) * focal / uAspect,
      dot(relative, up) * focal,
      (farClip + nearClip) / (farClip - nearClip) * depth
        - 2.0 * farClip * nearClip / (farClip - nearClip),
      depth
    );
    if(uJitter>0. && depth>nearClip){vec2 grid=max(vec2(1.),uResolution/(1.+uJitter*7.));vec2 ndc=gl_Position.xy/depth;gl_Position.xy=mix(ndc,floor(ndc*grid+.5)/grid,uJitter)*depth;}
    vec3 texPos=uKind>.5?aPosition:world;
    vec3 n=abs(aNormal);
    vSurfaceUV=n.y>.5?texPos.xz:(n.x>.5?texPos.zy:texPos.xy);
    vAffineUV=vec3(vSurfaceUV*depth,depth);
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
  uniform float uFocusMask;
  uniform sampler2D uSurface;
  uniform float uTextureMix,uTextureScale,uWarp,uCel,uLighting,uShadows;
  varying vec2 vSurfaceUV;
  varying vec3 vAffineUV;
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
  float surfaceGrain(){
    vec2 uv=mix(vSurfaceUV,vAffineUV.xy/max(.001,vAffineUV.z),uWarp)*uTextureScale;
    return mix(1.,.965+.035*texture2D(uSurface,uv).r,uTextureMix);
  }
  float lightBands(float value){return uCel>1. ? floor(value*(uCel-1.)+.5)/(uCel-1.):value;}
  vec3 accentLight() {
    vec3 result = vec3(0.0);
    for(int i=0;i<4;i++) { vec3 delta=uLightPos[i]-vPosition; float d=length(delta); result+=uLightColor[i]*(max(0.0,dot(vNormal,delta/max(d,0.001)))+uLighting*.3)*0.045*uGlow/(1.0+d*d*2.0); }
    return result;
  }
  void main() {
    if (uFocusMask > 0.5) { gl_FragColor = vec4(1.0); return; }
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
    if (uKind > 7.5) {
      float feather=(1.0-smoothstep(.28,.5,abs(vLocal.x)))*(1.0-smoothstep(.40,.5,abs(vLocal.z)));
      gl_FragColor=vec4(uTint.rgb,uTint.a*exp(-abs(vLocal.x)*9.0)*feather);return;
    }
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
      gl_FragColor = vec4(clamp(uTint.rgb * lightBands(light) * surfaceGrain() + accentLight(), 0.0, 1.0), uTint.a);
      return;
    }
    if (uKind > 2.5) {
      float shade = uKind > 3.5 ? 0.65 + 0.35 * max(0.0, dot(vNormal, normalize(vec3(-0.5,1.0,0.7)))) : 1.0;
      gl_FragColor = vec4(uTint.rgb * shade, uTint.a);
      return;
    }
    if (uKind > 1.5) {
      vec2 uv = (vPosition.xz - uCenter.xz) / uScale;
      float alpha = exp(-dot(uv, uv) * 7.0) * uShadow * uShadows;
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
      float black = 0.035 + 0.13 * lightBands(light) + 0.045 * fill + sheen*(1.+uLighting*2.) + edgeLight;
      black*=surfaceGrain();black+=uLighting*.025*max(vNormal.y,0.);
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
    float white = clamp(softLight + floorBounce*(1.+uLighting*3.) - contactShade*(1.+uLighting), 0.0, 1.0);
    gl_FragColor = vec4(clamp(vec3(white*surfaceGrain())+accentLight()*0.4,0.0,1.0), 1.0);
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
const uniforms = Object.fromEntries(['uJitter','uResolution','uSurface','uTextureMix','uTextureScale','uWarp','uCel','uLighting','uShadows','uFocal','uFocusMask','uGlow','uLightPos[0]','uLightColor[0]','uTime','uCamera','uLook','uAspect','uSize','uHeight','uKind','uCenter','uScale','uShadow','uDimensions','uQuaternion','uTint'].map(name => [name, gl.getUniformLocation(program, name)]));
gl.uniform1f(uniforms.uFocal, heldFocus.focal);
gl.uniform1f(uniforms.uFocusMask, 0);
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
// Input state is shared by real keyboard/mouse and a standard-mapped controller.
let gamepadActive=false,gamepadMove=[0,0],gamepadRotationCodes=new Set(),hudInputActive=false,hudReturnCapture=false;
const controlHolds=new Map(),controller=window.QBitsControls?.gamepad();
const keyboardInput=window.QBitsControls?.keyboard(()=>savedPreferences.controls?.keyboard||window.QBitsControls.defaults().keyboard,(id,down,event)=>dispatchControlAction(id,down,'keyboard',event));
function gameInputActive(){return !hudInputActive&&(document.pointerLockElement===canvas||gamepadActive);}
function inputLabel(action){return window.QBitsControls?.labelFor(action,savedPreferences)||action;}
function controlEvent(code,event={},source='keyboard'){return {code,repeat:false,target:canvas,clientX:event.clientX??canvas.clientWidth/2,clientY:event.clientY??canvas.clientHeight/2,altKey:altDown()||!!event.altKey,ctrlKey:ctrlDown()||!!event.ctrlKey,shiftKey:shiftDown()||!!event.shiftKey,metaKey:!!event.metaKey,source,preventDefault(){event.preventDefault?.();},stopPropagation(){event.stopPropagation?.();}};}
function setHudInput(enabled,source='keyboard'){
 if(enabled){if(hudInputActive||!window.qbitsSelectionHud?.available||story.mode!=='playing'||story.transition||!panel.hidden||!menu.hidden||!commandMenu.hidden)return;hudInputActive=true;hudReturnCapture=document.pointerLockElement===canvas;keys.clear();gamepadMove=[0,0];window.qbitsSelectionHud.setInteractive(true,source);if(hudReturnCapture){story.intentionalUnlock=true;story.preserveGrip=true;document.exitPointerLock();}}
 else {if(!hudInputActive)return;hudInputActive=false;window.qbitsSelectionHud?.setInteractive(false,source);const capture=hudReturnCapture;hudReturnCapture=false;if(capture&&!document.hidden&&story.mode==='playing'&&!story.transition)captureMouse();}
}
function dispatchControlAction(id,down,source='keyboard',event={}){
 const token=source+':'+id,holders=controlHolds.get(id)||new Set();
 if(down){if(holders.has(token))return;holders.add(token);controlHolds.set(id,holders);if(holders.size>1)return;}
 else {holders.delete(token);if(holders.size)return;controlHolds.delete(id);}
 if(id==='hud'){setHudInput(down,source);return;}
 const action=window.QBitsControls?.actions.find(a=>a.id===id);if(!action)return;
 const e=controlEvent(action.code,event,source);
 if(id==='primary'||id==='secondary'){
  if(hudInputActive){if(down&&id==='primary')window.qbitsSelectionHud?.activateFocused({toggle:ctrlDown(),source});return;}
  e.button=id==='primary'?0:2;
  if(down)onCanvasMouseDown(e);else if(id==='primary'){if(event.cancelled){if(!story.preserveGrip)releaseQubit(false);}else onCanvasMouseUp(e);}return;
 }
 if(!down){if(id==='radial'&&event.cancelled)closeUnitRadial(false);handleKeyUp(e);return;}
 if(id==='fullscreen'){toggleFullscreen();return;}
 if(hudInputActive)return;
 if(id==='select'&&storyActionAllowed()&&gameInputActive()){
  const hit=aimQubit();if(!hit)return;let team=selectedTeam();team=team.includes(hit.g)?team.filter(g=>g!==hit.g):[...team,hit.g];if(team.reduce((n,g)=>n+g.parts.length,0)>settings.maxSelect){announce('Máximo '+settings.maxSelect+' piezas seleccionadas');return;}multiSelection=team;selected=team.length?{g:team.includes(hit.g)?hit.g:team[0],part:team.includes(hit.g)?hit.part:team[0].parts[0]}:null;speech.nextHud=0;return;
 }
 if(id==='clear'&&storyActionAllowed()){if(held)releaseQubit(false);clearSelection();return;}
 if((id==='near'||id==='far')&&storyLookAllowed()){handleWheel({...e,deltaY:id==='near'?-1:1});return;}
 handleKey(e);
}
function releaseInputSource(source){for(const [id,holders]of [...controlHolds])if(holders.has(source+':'+id))dispatchControlAction(id,false,source,{cancelled:true});}
function resetGameInputs(){keyboardInput?.clear();releaseInputSource('gamepad');gamepadActive=false;gamepadMove=[0,0];controller?.reset();if(hudInputActive){hudReturnCapture=false;setHudInput(false);}keys.clear();}
function onPhysicalKeyDown(event){
 if(event.defaultPrevented||settingsScreen?.isOpen||editableTarget(event.target)||editableTarget(document.activeElement))return;
 if(event.code==='Escape'){event.preventDefault();if(hudInputActive){hudReturnCapture=false;setHudInput(false);}handleKey(controlEvent('Escape',event));return;}
 if(hudInputActive&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter','Space'].includes(event.code)){event.preventDefault();if(event.code==='Enter'||event.code==='Space')window.qbitsSelectionHud?.activateFocused({toggle:ctrlDown()||event.ctrlKey,source:'keyboard'});else window.qbitsSelectionHud?.stepFocus(event.code==='ArrowLeft'||event.code==='ArrowUp'?-1:1);return;}
 if(radialOpen()&&event.code.startsWith('Arrow')){handleKey(event);return;}
 if(story.ready&&story.mode!=='playing')return;
 gamepadActive=false;
 if(keyboardInput?.down(event.code,event))event.preventDefault();else if(!keyboardInput)handleKey(event);
}
function onPhysicalKeyUp(event){if(keyboardInput?.up(event.code,event))event.preventDefault();else if(!keyboardInput)handleKeyUp(event);}
function onPhysicalMouseDown(event){if(hudInputActive||settingsScreen?.isOpen)return;gamepadActive=false;if(keyboardInput?.down('Mouse'+event.button,event))event.preventDefault();else if(!keyboardInput)onCanvasMouseDown(event);}
function onPhysicalMouseUp(event){if(keyboardInput?.up('Mouse'+event.button,event))event.preventDefault();else if(!keyboardInput||(event.button===0&&savedPreferences.controls?.keyboard.bindings.primary==='Mouse0'&&!controlHolds.has('primary')))onCanvasMouseUp(event);}
function inputMenuScope(){
 if(settingsScreen?.isOpen)return document.querySelector(document.querySelector('#settings-confirm').hidden?'#settings-screen':'#settings-confirm');
 if(!menu.hidden)return menu;if(!commandMenu.hidden)return commandMenu;if(!panel.hidden)return panel;
 if(story.phase==='choice'||story.phase==='repeat')return document.querySelector('#story-choices');
 return document.querySelector(({menu:'#main-screen',pause:'#pause-screen',levels:'#levels-screen',codex:'#codex-screen',complete:'#chapter-complete'})[story.mode]||'#wake-screen');
}
function navigateControllerMenu(id){
 if(id==='back'||id==='pause'){if(settingsScreen?.isOpen){if(!document.querySelector('#settings-confirm').hidden)document.querySelector('#settings-keep').click();else settingsScreen.requestClose();}else handleKey(controlEvent('Escape',{},'gamepad'));return;}
 const scope=inputMenuScope(),nodes=[...(scope?.querySelectorAll('button,input,select')||[])].filter(el=>!el.disabled&&!el.hidden&&el.getClientRects?.().length);
 if(!nodes.length)return;let at=nodes.indexOf(document.activeElement);if(at<0){at=0;nodes[at].focus({preventScroll:true});}
 const el=nodes[at];
 if(id==='confirm'){if(el.tagName==='BUTTON')el.click();else if(el.type==='checkbox'){el.checked=!el.checked;el.dispatchEvent(new Event('change',{bubbles:true}));}return;}
 if(id==='left'||id==='right'){
  const delta=id==='right'?1:-1;
  if(el.tagName==='SELECT'){const opts=[...el.options].filter(o=>!o.disabled),i=opts.indexOf(el.selectedOptions[0]);el.value=opts[Math.max(0,Math.min(opts.length-1,i+delta))].value;el.dispatchEvent(new Event('change',{bubbles:true}));return;}
  if(el.type==='range'){el.value=String(Math.max(Number(el.min),Math.min(Number(el.max),Number(el.value)+delta*(Number(el.step)||1))));el.dispatchEvent(new Event('input',{bubbles:true}));return;}
 }
 if(['up','down','left','right'].includes(id)){at=(at+(['down','right'].includes(id)?1:nodes.length-1))%nodes.length;nodes[at].focus({preventScroll:true});nodes[at].scrollIntoView?.({block:'nearest'});}
}
function pollGamepadInput(dt){
 if(!controller)return;let pads=[];try{pads=navigator.getGamepads?.()||[];}catch{}
 const config=savedPreferences.controls?.gamepad||window.QBitsControls.defaults().gamepad,capture=document.querySelector('#settings-screen').dataset.bindingCapture;
 const blocked=document.hidden||story.transition||document.body.dataset.booting==='true'||capture==='gamepad'||capture==='keyboard';
 const uiMode=settingsScreen?.isOpen||story.ready&&(story.mode!=='playing'||!panel.hidden||!menu.hidden||!commandMenu.hidden||['choice','repeat'].includes(story.phase));
 const mode=blocked?'blocked':hudInputActive?'hud':radialOpen()?'radial':uiMode?'menu':'game',sample=controller.poll(pads,config,mode);
 window.qbitsInputStatus={status:sample.status,id:sample.id};
 if(!blocked&&(sample.events.some(e=>e.down)||Math.hypot(...sample.move,...sample.look)>.08))gamepadActive=true;
 if(sample.status!=='connected'&&gamepadActive){releaseInputSource('gamepad');gamepadActive=false;gamepadMove=[0,0];if(story.ready&&story.mode==='playing')openPauseMenu();}
 for(const e of sample.events){
  if(!e.down){dispatchControlAction(e.id,false,'gamepad',e);continue;}
  if(mode==='menu'){navigateControllerMenu(e.id);continue;}
  if(mode==='hud'&&['up','down','left','right','confirm','back'].includes(e.id)){if(e.id==='confirm')window.qbitsSelectionHud?.activateFocused({toggle:ctrlDown(),source:'gamepad'});else if(e.id==='back')setHudInput(false,'gamepad');else window.qbitsSelectionHud?.stepFocus(e.id==='left'||e.id==='up'?-1:1);continue;}
  if(mode==='radial'&&['up','down','left','right','confirm','back'].includes(e.id)){if(e.id==='back')closeUnitRadial(false);else if(e.id==='confirm')closeUnitRadial(true);else unitRadial.chooseNext(e.id==='left'||e.id==='up'?-1:1);continue;}
  dispatchControlAction(e.id,true,'gamepad',e);
 }
 for(const code of gamepadRotationCodes){const action=window.QBitsControls.actions.find(a=>a.code===code)?.id;if(!controlHolds.get(action)?.has('keyboard:'+action))keys.delete(code);}gamepadRotationCodes.clear();
 gamepadMove=mode==='game'&&gamepadActive?sample.move:[0,0];
 if(gamepadActive&&mode==='game'&&storyLookAllowed()&&!storySuspended()){
  const [x,y]=sample.look,speed=2.1*config.sensitivity;yaw-=x*speed*dt;yaw=Math.atan2(Math.sin(yaw),Math.cos(yaw));pitch=clamp(pitch-y*speed*dt*(config.invertY?-1:1),-Math.PI/2+.012,Math.PI/2-.012);if(x||y)redraw=true;
  if(held&&shiftDown()){for(const [code,pressed]of [['KeyW',gamepadMove[1]<-.1],['KeyS',gamepadMove[1]>.1],['KeyA',gamepadMove[0]<-.1],['KeyD',gamepadMove[0]>.1]]){if(pressed){keys.add(code);gamepadRotationCodes.add(code);}}}
 }
}


const hint = document.querySelector('#hint');
const pausedHint = 'Clic para entrar · Esc para pausa · Controles en Configuración';
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
  resetAssemblyShake();
  closeUnitRadial(false);
  if(story.ready){story.preserveGrip=!release;if(document.pointerLockElement===canvas)story.intentionalUnlock=true;}
  resetGameInputs();
  pendingPickup=null;
  finishMarquee(true);
  if(release)releaseQubit();
  keys.clear();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

function resize() {
  const scale = visualResolution(canvas.clientWidth,canvas.clientHeight,visuals);
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
  if(gamepadActive){panel.hidden=true;menu.hidden=true;detachChoice=null;closeCommandMenu(false);hint.hidden=true;if(pendingPickup)completePendingPickup();return;}
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
  resetAssemblyShake();
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
  noteAssemblyShake(event.movementX,event.movementY,event.timeStamp);
  gamepadActive=false;
  const mouse=savedPreferences.controls?.keyboard||{sensitivity:1,invertY:false};
  yaw -= event.movementX * 0.002 * mouse.sensitivity;
  yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  pitch = Math.max(-Math.PI / 2 + 0.012, Math.min(Math.PI / 2 - 0.012, pitch - event.movementY * 0.002 * mouse.sensitivity * (mouse.invertY?-1:1)));
  redraw = true;
});
document.addEventListener('keydown', onPhysicalKeyDown);
document.addEventListener('keyup', onPhysicalKeyUp);
window.addEventListener('blur',()=>{resetGameInputs();if(story.ready&&story.mode==='playing')openPauseMenu();else pause();});
document.addEventListener('visibilitychange', () => {
  if(document.hidden){resetGameInputs();if(story.ready&&story.mode==='playing')openPauseMenu();else pause();}
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
function normalizeUnitShape(shape){return shape==='tetra'||shape==='pyramid'||shape==='coupler'?shape:'cube';}
function unitShape(value){return normalizeUnitShape(typeof value==='string'?value:value?.part?.shape||value?.shape);}
function isTBit(value){return unitShape(value)!=='cube';}
function makeUnitProfile(points,faces,faceKinds){
 const vertices=points.map(p=>V(...p).scale(CUBE_SIZE)),faceNormals=[],faceCenters=[],edges=[],seen=new Set();
 faces=faces.map(indices=>{
  const face=[...indices],center=V();for(const i of face)center.vadd(mul(vertices[i],1/face.length),center);
  let normal=sub(vertices[face[1]],vertices[face[0]]).cross(sub(vertices[face[2]],vertices[face[0]]));normal.normalize();
  if(normal.dot(center)<0){face.reverse();normal=mul(normal,-1);}faceNormals.push(normal);faceCenters.push(center);
  for(let i=0;i<face.length;i++){const a=face[i],b=face[(i+1)%face.length],key=Math.min(a,b)+','+Math.max(a,b);if(!seen.has(key)){seen.add(key);edges.push([a,b]);}}
  return face;
 });
 return {vertices,faces,faceNormals,faceCenters,edges,faceKinds};
}
// A common cube partition, not three independently scaled Platonic solids.
// Six square pyramids meet at the cube center; each splits into two tetrahedra.
// Local coordinates are centered on each solid's true volume centroid.
const UNIT_PROFILES={
 cube:makeUnitProfile([[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5],[-.5,.5,-.5],[.5,.5,-.5],[.5,.5,.5],[-.5,.5,.5]],[[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]],Array(6).fill('square')),
 tetra:makeUnitProfile([[-.625,-.125,-.375],[.375,-.125,-.375],[.375,-.125,.625],[-.125,.375,.125]],[[0,1,2],[0,3,1],[1,3,2],[2,3,0]],['half-square','slope','slope','diagonal']),
 pyramid:makeUnitProfile([[-.5,-.125,-.5],[.5,-.125,-.5],[.5,-.125,.5],[-.5,-.125,.5],[0,.375,0]],[[0,1,2,3],[0,4,1],[1,4,2],[2,4,3],[3,4,0]],['square','slope','slope','slope','slope']),
 // One convex, indivisible cube with a pointed cap; its true volume centroid
 // sits 5/56 of a side above the cubic base center. Only square faces weld.
 coupler:makeUnitProfile([[-.5,-33/56,-.5],[.5,-33/56,-.5],[.5,-33/56,.5],[-.5,-33/56,.5],[-.5,23/56,-.5],[.5,23/56,-.5],[.5,23/56,.5],[-.5,23/56,.5],[0,51/56,0]],[[0,1,2,3],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0],[4,8,5],[5,8,6],[6,8,7],[7,8,4]],['square','square','square','square','square','coupler-cap','coupler-cap','coupler-cap','coupler-cap'])
};
function unitProfile(shape){return UNIT_PROFILES[unitShape(shape)];}
function unitGroundHeight(shape){return -Math.min(...unitProfile(shape).vertices.map(v=>v.y));}
function unitFaces(pose){const profile=unitProfile(pose);return profile.faces.map((face,index)=>({index,kind:profile.faceKinds[index],vertices:face.map(i=>add(pose.p,pose.q.vmult(profile.vertices[i]))),center:add(pose.p,pose.q.vmult(profile.faceCenters[index])),normal:pose.q.vmult(profile.faceNormals[index])}));}
const settings={mass:1,unitShape:'cube',gravity:9.8,bounce:.12,force:60,friction:.38,damping:.12,speed:.32,guide:'ghost',line:'dashed',maxCarry:16,maxSelect:32,rotationSpeed:2.8,grip:.95,cargoSide:4,cargoRequired:8,cargoColor:'#f4f4f1',haulSpeed:.2,haulForce:2};
const groups=[],cargos=[],rotors=[];let rotorSerial=0;
const alphaSettings={maxRest:180,coolSeconds:35,capacity:4,blueprintRange:1.5,exitEnergy:.5,glow:.6,coolingOn:true,allowPuzzleSpawn:false};
const coolers=[],blueprints=[],savedShapes=[],savedMechanisms=[],buttonBodies=[];let alphaSerial=0;
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
function allocateUnitId(){return ++serial;}
function makeGroup(parts,reference=Q(),velocity=V(),spin=V()) {
 serial=Math.max(serial,...parts.map(p=>p.id));
 const weight=parts.reduce((n,p)=>n+p.weight,0),center=V();
 for(const p of parts)center.vadd(mul(p.p,p.weight/weight),center);
 const inv=reference.inverse(),body=new CANNON.Body({mass:weight*.25,allowSleep:true,sleepSpeedLimit:.025,sleepTimeLimit:.6});
 body.collisionFilterMask=-1;body.position.copy(center);body.quaternion.copy(reference);body.velocity.copy(velocity);body.angularVelocity.copy(spin);
 body.linearDamping=.03;body.angularDamping=settings.damping;
 const local=parts.map(p=>{const shape=unitShape(p),mood=newMood(p.id,p.mood);if(!p.mood&&shape!=='cube')mood.name=(shape==='coupler'?'Enganche ':'T-bit ')+p.id;return {id:p.id,weight:p.weight,shape,offset:inv.vmult(sub(p.p,center)),q:inv.mult(p.q),mood};});
 for(const p of local){const profile=unitProfile(p),shape=isTBit(p)?new CANNON.ConvexPolyhedron(profile.vertices.map(v=>v.clone()),profile.faces.map(f=>f.slice())):cubeShape();body.addShape(shape,p.offset,p.q);}
 body.updateMassProperties();world.addBody(body);
 const g={body,parts:local,route:null,pin:null};body.qubitGroup=g;g.block=analyzeBlock(g);groups.push(g);registerSpeechGroup(g);return g;
}
function addQubit(p,weight=settings.mass,shape='cube'){return makeGroup([{id:++serial,weight,shape:normalizeUnitShape(shape),p:V(...p),q:Q()}]);}
function removeGroup(g){invalidateRotorBody(g);undockCampaignGroup(g);removeSpeechGroup(g);leaveHaul(g);stopRoute(g);world.removeBody(g.body);const i=groups.indexOf(g);if(i>=0)groups.splice(i,1);if(selected?.g===g)selected=null;multiSelection=multiSelection.filter(item=>item!==g);}
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
function mechanismsUnlocked(){return Object.keys(story.progress).some(key=>/^level\d+$/.test(key)&&Number(key.slice(5))>=5&&story.progress[key]);}
function mechanismsAvailable(){return !certifiedAutomation()&&!puzzle.active&&(story.scene==='lab'||story.scene==='campaign'&&mechanismsUnlocked());}
function isMechanismChoice(id){return id==='coupler'||id==='rotor';}
function normalizeCreationChoice(id){return id==='rotor'?'rotor':normalizeUnitShape(id);}
function creationChoiceAllowed(id){return ['cube','tetra','pyramid','coupler','rotor'].includes(id)&&(isMechanismChoice(id)?mechanismsAvailable():story.scene==='lab'&&!puzzle.active);}
function creationTitle(id){return {cube:'Q-bit',tetra:'T-bit triangular',pyramid:'T-bit de base cuadrada',coupler:'Enganche',rotor:'Rotor'}[id]||'Q-bit';}
function creationShape(){const id=normalizeCreationChoice(settings.unitShape);return creationChoiceAllowed(id)?id:'cube';}
function unitLabel(part){if(part?.mood?.production)return part.mood.production.role==='package'?'Paquete':'Materia';return unitShape(part)==='coupler'?'Enganche':isTBit(part)?'T-bit':'Q-bit';}
function groupUnitLabel(g){if(g.parts.some(p=>p.mood.production))return g.parts.every(p=>p.mood.production)?'bloques de materia':'piezas';const c=g.parts.filter(p=>unitShape(p)==='coupler').length;if(c)return c===g.parts.length?'Enganche'+(c===1?'':'s'):'piezas';const t=g.parts.filter(isTBit).length;return t===g.parts.length?'T-bit'+(t===1?'':'s'):t?'piezas':'Q-bit'+(g.parts.length===1?'':'s');}
function syncUnitControls(){const shape=creationShape(),select=document.querySelector('#unit-shape');select.value=shape;select.disabled=puzzle.active||story.scene!=='lab'&&!mechanismsAvailable();for(const option of select.querySelectorAll('option'))option.disabled=!creationChoiceAllowed(option.value);document.querySelector('#create').textContent='Crear '+creationTitle(shape);}
function initUnitRadial(){
 if(unitRadial)return;
 if(!window.QBitsRadial)throw new Error('No se pudo preparar el selector de piezas.');
 const entries=[
  {id:'cube',title:'Q-bit',subtitle:'Cubo',description:'Módulo de 9 × 9 × 9 cm. Seis pirámides o doce T-bits triangulares completan este volumen.',color:[43,46,49]},
  {id:'tetra',title:'T-bit',subtitle:'Triangular',description:'Media pirámide. Une dos por su corte diagonal para completarla; doce forman un cubo.',color:[135,140,143]},
  {id:'pyramid',title:'T-bit',subtitle:'Base cuadrada',description:'Base de 9 × 9 cm y altura de 4,5 cm. Seis encajan por sus caras, con las puntas al centro del cubo.',color:[135,140,143]},
  {id:'coupler',title:'Enganche',subtitle:'Una mitad del eje',section:'mechanisms',description:'Base cúbica y punta de conexión. Une dos puntas con Shift para crear un rotor; las caras cuadradas reciben tus piezas.',color:[94,110,113]},
  {id:'rotor',title:'Rotor',subtitle:'Dos enganches unidos',section:'mechanisms',description:'Eje articulado. Clic derecho → Rotación: elige sentido y lado móvil. Guarda el conjunto como mecanismo.',color:[94,110,113]}
 ];
 unitRadial=window.QBitsRadial.create({profiles:entries.map(entry=>{
  const profile=unitProfile(entry.id==='rotor'?'coupler':entry.id),locked=!creationChoiceAllowed(entry.id);
  let vertices=profile.vertices.map(v=>[v.x/CUBE_SIZE,v.y/CUBE_SIZE,v.z/CUBE_SIZE]),faces=profile.faces.map(f=>f.slice());
  if(entry.id==='rotor'){
   const tip=Math.max(...vertices.map(v=>v[1])),half=vertices.length;
   vertices=vertices.map(v=>[v[0],v[1]-tip,v[2]]).concat(vertices.map(v=>[v[0],tip-v[1],-v[2]]));
   faces=faces.concat(faces.map(f=>f.map(i=>i+half)));
  }
  return {...entry,vertices,faces,locked,lockedDescription:isMechanismChoice(entry.id)?'Se desbloquea al completar el nivel 5: La primera unión. Disponible desde el inicio en el banco de pruebas.':'Las piezas de la campaña se obtienen dentro del nivel.'};
 })});
}
function unitRadialAllowed(){
 return running&&gameInputActive()&&story.ready&&story.mode==='playing'&&(story.scene==='lab'||story.scene==='campaign'&&mechanismsUnlocked())&&!puzzle.active&&!story.transition&&!document.hidden&&document.body.dataset.booting!=='true'&&panel.hidden&&menu.hidden&&commandMenu.hidden&&!held&&!marquee&&!pendingPickup&&!moveChoice&&!pendingCargo&&!editableTarget(document.activeElement);
}
function openUnitRadial(){
 if(radialOpen()||!unitRadialAllowed())return false;
 cancelUnitCreation();initUnitRadial();for(const id of ['cube','tetra','pyramid','coupler','rotor'])unitRadial.setLocked?.(id,!creationChoiceAllowed(id));keys.clear();routeInspection=null;accumulator=0;
 unitRadial.open(creationShape(),{virtualPointer:gameInputActive()});
 document.body.dataset.unitRadial='open';hint.hidden=true;redraw=true;
 return true;
}
function closeUnitRadial(commit=false){
 if(!commit)cancelUnitCreation();
 if(!radialOpen())return false;
 const choice=unitRadial.hovered;
 const valid=commit&&unitRadialAllowed()&&creationChoiceAllowed(choice);
 unitRadial.close();document.body.dataset.unitRadial='closed';keys.clear();accumulator=0;
 if(valid){settings.unitShape=choice;pendingUnitCreation=choice;syncUnitControls();announce(creationTitle(choice)+' · clic izquierdo para crear · Esc cancela');}
 redraw=true;return valid;
}
function cancelUnitCreation(){pendingUnitCreation=null;}
function handleKeyUp(event){
 keys.delete(event.code);
 if(event.code==='ShiftLeft'||event.code==='ShiftRight'){resetAssemblyShake();if(held&&!shiftDown())held.shakeSeparated=false;}
 if(event.code==='KeyQ'&&radialOpen()){event.preventDefault();closeUnitRadial(true);}
}
function spawnQubit(){
 automationIntervention();
 const shape=creationShape();if(puzzleBlockedEdit(isMechanismChoice(shape)?'mechanism':'qubit'))return;
 if(isMechanismChoice(shape)&&!mechanismsAvailable()){announce('Completa La primera unión para desbloquear los mecanismos.');return;}
 if(shape==='rotor'){
  const rotor=spawnRotor(undefined,{...mechanismDefaults,enabled:false});if(!rotor){announce('No hay espacio libre para el rotor.');return;}
  const g=rotorGroups(rotor)[0];cancelUnitCreation();selected={g,part:g.parts[0]};multiSelection=[];announce('Rotor creado · clic derecho → Rotación');return g;
 }
 if(groups.reduce((s,g)=>s+g.parts.length,0)>=MAX_QUBITS){announce('Máximo de '+MAX_QUBITS+' piezas en la sala.');return;}
 for(let row=0;row<6;row++)for(const col of [0,1,-1,2,-2,3,-3]){
  const p=V(position[0]-Math.sin(yaw)*(.95+row*.16)+Math.cos(yaw)*col*.16,unitGroundHeight(shape)+.002,position[2]-Math.cos(yaw)*(.95+row*.16)-Math.sin(yaw)*col*.16);
  if(Math.max(Math.abs(p.x),Math.abs(p.z))>13.9)continue;
  if(groups.some(g=>poses(g).some(o=>obbOverlap({p,q:Q(),shape},o,-.012))))continue;
  const g=addQubit([p.x,p.y,p.z],settings.mass,shape);if(!validPose(g,g.body.position,g.body.quaternion)){removeGroup(g);continue;}cancelUnitCreation();selected={g,part:g.parts[0]};multiSelection=[];announce(unitLabel(g.parts[0])+' creado · '+settings.mass+' u');return g;
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
function carrySet(hit){return rotorConnectedGroups(multiSelection.includes(hit.g)&&multiSelection.length>1?multiSelection.filter(g=>groups.includes(g)):[hit.g]);}
function canCarry(list){return rotorConnectedGroups(list).reduce((n,g)=>n+totalWeight(g),0)<=settings.maxCarry+.0001;}
function grabQubit(hitOverride=null){
 resetAssemblyShake();
 if(!gameInputActive()||held||marquee)return;const hit=hitOverride||aimQubit();if(hit?.g?.storyEmerging)return;
 if(!hit){if(aimCargo(3)){announce('Este cuerpo se arrastra con un equipo de Q-bits.');return;}startMarquee();return;}
 if(altDown()){openDetachMenu(hit);return;}
 const list=carrySet(hit),weight=list.reduce((n,g)=>n+totalWeight(g),0);
 if(!canCarry(list)){announce('Peso '+formatWeight(weight)+' u · capacidad '+formatWeight(settings.maxCarry)+' u. Ajustable en P.');return;}
 if(story.ready&&story.scene==='intro'&&hit.g===storyGuide()){hit.g.storyFloat=false;hit.g.body.type=CANNON.Body.DYNAMIC;hit.g.body.updateMassProperties();}
 for(const rotor of rotors)if(rotorGroups(rotor).some(g=>list.includes(g)))configureRotor(rotor,{enabled:false});
 undockCampaignGroup(hit.g);
 selected=hit;const rootPoint=hit.point.clone();
 automationIntervention('Tomaste una pieza: ensayo reiniciado.');
 const ordered=[hit.g,...list.filter(g=>g!==hit.g)],items=[];
 for(const g of ordered){
  if(g.blueprintJob){const slot=g.blueprintJob;releaseBlueprintSlot(slot);slot.bp.slots=slot.bp.slots.filter(s=>s!==slot);}
  leaveHaul(g);stopRoute(g);g.body.wakeUp();const point=g===hit.g?hit.point:g.body.position.clone();
  const local=g.body.quaternion.inverse().vmult(sub(point,g.body.position));
  const anchorBody=new CANNON.Body({mass:0});anchorBody.type=CANNON.Body.KINEMATIC;anchorBody.position.copy(point);anchorBody.collisionFilterGroup=0;world.addBody(anchorBody);
  const joint=new CANNON.PointToPointConstraint(g.body,local,anchorBody,V(),settings.force*workshopGrip(g)*g.body.mass/(weight*.25));joint.collideConnected=false;world.addConstraint(joint);
  items.push({g,anchor:local,anchorBody,joint,relative:sub(point,rootPoint),initialQ:g.body.quaternion.clone(),restQ:null});
 }
 held={...hit,...items[0],items,weight,age:0,distance:clamp(hit.distance,.3,2.5),rotation:hit.g.body.quaternion.clone(),initialRotation:hit.g.body.quaternion.clone()};
 storyOnGrab(hit.g);
 speech.shake=null;queueSpeech(hit.g,'close',{part:hit.part,kind:'pickup',priority:62,cooldown:18});
}
function releaseQubit(join=false){
 resetAssemblyShake();
 if(!held)return;
 const g=held.g,items=held.items||[held],dock=story.dockCandidate;
 for(const item of items){if(item.joint)world.removeConstraint(item.joint);if(item.anchorBody)world.removeBody(item.anchorBody);item.g.body.angularDamping=settings.damping;item.g.body.fixedRotation=false;item.g.body.updateMassProperties();}
 let joined=null;
 if(heldMechanismCanSnap()&&join&&snap&&snap.source===g&&groups.includes(snap.target))joined=weld(snap);
 if(!joined)for(const item of items){item.g.body.velocity.set(0,0,0);item.g.body.wakeUp();}
 held=null;snap=null;tryDockCampaign(g,dock);
}
function touchingUnitFaces(a,b,tolerance=.00005){
 // Equal planes alone are not a joint: every corner of the full face must match.
 for(const fa of unitFaces(a))for(const fb of unitFaces(b)){
  if(facesCoincide(fa,fb,tolerance))return true;
 }
 return false;
}
function facesCoincide(a,b,tolerance=.00005){
 const n=a.vertices.length;
 if(a.kind==='coupler-cap'||b.kind==='coupler-cap'||a.kind&&b.kind&&a.kind!==b.kind)return false;
 if(n!==b.vertices.length||a.normal.dot(b.normal)>-.99999||a.center.distanceTo(b.center)>tolerance)return false;
 for(let start=0;start<n;start++)if(a.vertices.every((v,i)=>v.distanceTo(b.vertices[(start-i+n)%n])<=tolerance))return true;
 return false;
}
function mergeHalfSquareFaces(a,b,tolerance=.00005){
 if(a.kind!=='half-square'||b.kind!=='half-square'||a.members[0]===b.members[0]||a.normal.dot(b.normal)<.99999||Math.abs(sub(a.center,b.center).dot(a.normal))>tolerance)return null;
 // The shared edge must be the full diagonal, not a leg, point or partial edge.
 const shared=a.vertices.filter(v=>b.vertices.some(w=>v.distanceTo(w)<=tolerance));
 if(shared.length!==2||Math.abs(shared[0].distanceTo(shared[1])-CUBE_SIZE*Math.SQRT2)>tolerance)return null;
 const vertices=a.vertices.map(v=>v.clone());
 for(const vertex of b.vertices)if(!vertices.some(v=>v.distanceTo(vertex)<=tolerance))vertices.push(vertex.clone());
 if(vertices.length!==4)return null;
 const center=vertices.reduce((sum,v)=>add(sum,mul(v,.25)),V()),normal=a.normal.clone();
 const tangent=sub(vertices[0],center);tangent.normalize();const across=normal.cross(tangent);
 vertices.sort((v,w)=>Math.atan2(sub(v,center).dot(across),sub(v,center).dot(tangent))-Math.atan2(sub(w,center).dot(across),sub(w,center).dot(tangent)));
 for(let i=0;i<4;i++){
  if(Math.abs(vertices[i].distanceTo(vertices[(i+1)%4])-CUBE_SIZE)>tolerance||Math.abs(vertices[i].distanceTo(vertices[(i+2)%4])-CUBE_SIZE*Math.SQRT2)>tolerance)return null;
 }
 return {kind:'square',vertices,center,normal,members:[a.members[0],b.members[0]],composite:true};
}
function assemblyFaceSets(parts){
 const faces=parts.flatMap((part,index)=>unitFaces(part).map(face=>({...face,members:[index],composite:false}))),halves=faces.filter(face=>face.kind==='half-square');
 for(let i=0;i<halves.length;i++)for(let j=i+1;j<halves.length;j++){
  if(halves[i].center.distanceTo(halves[j].center)>CUBE_SIZE)continue;
  const square=mergeHalfSquareFaces(halves[i],halves[j]);if(square)faces.push(square);
 }
 return faces;
}
function assemblyConnections(parts){
 const links=parts.map(()=>new Set()),faces=assemblyFaceSets(parts);
 for(let i=0;i<faces.length;i++)for(let j=i+1;j<faces.length;j++){
  const a=faces[i],b=faces[j];
  if(a.kind!==b.kind||a.members.some(index=>b.members.includes(index))||!facesCoincide(a,b))continue;
  // A complete composite contact binds every contributor. Removing a half
  // rebuilds this graph, so its formerly full-square joint cannot survive.
  for(const ai of a.members)for(const bi of b.members){links[ai].add(bi);links[bi].add(ai);}
 }
 return links;
}
function assembliesTouch(a,b){
 const aFaces=assemblyFaceSets(a),bFaces=assemblyFaceSets(b);
 return aFaces.some(fa=>bFaces.some(fb=>facesCoincide(fa,fb)));
}
function groupJoinFaces(g){
 if(g.joinFaceCache?.parts===g.parts)return g.joinFaceCache;
 // Part offsets/orientations are immutable for a group. Weld and separation
 // create new groups; moving/rolling a body only transforms this cached mesh.
 const faces=assemblyFaceSets(g.parts.map(part=>({shape:part.shape,p:part.offset,q:part.q}))),squares=faces.filter(face=>face.kind==='square');
 return g.joinFaceCache={parts:g.parts,squares,hasComposite:squares.some(face=>face.composite)};
}
function assemblyValid(parts){
 if(!parts.length)return false;
 for(let i=0;i<parts.length;i++)for(let j=i+1;j<parts.length;j++){
  if(parts[i].p.distanceTo(parts[j].p)>CUBE_SIZE*2+.00005)continue;
  if(obbOverlap(parts[i],parts[j],.000001))return false;
 }
 const links=assemblyConnections(parts);
 const reached=new Set([0]),queue=[0];
 for(let i=0;i<queue.length;i++)for(const next of links[queue[i]])if(!reached.has(next)){reached.add(next);queue.push(next);}
 return reached.size===parts.length;
}
// Precompute legal orientations for each connector family. Triangle corners
// have distinct roles: only the rotations that preserve their edge lengths fit.
// Opposing winding is essential: normals face each other and vertices coincide.
const faceJoinCache=new Map();
function faceJoinOptions(sourceShape,targetShape){
 const key=unitShape(sourceShape)+':'+unitShape(targetShape);if(faceJoinCache.has(key))return faceJoinCache.get(key);
 const a=unitProfile(sourceShape),b=unitProfile(targetShape),options=[];
 for(let sourceFace=0;sourceFace<a.faces.length;sourceFace++)for(let targetFace=0;targetFace<b.faces.length;targetFace++){
  const af=a.faces[sourceFace],bf=b.faces[targetFace],n=af.length;if(a.faceKinds[sourceFace]==='coupler-cap'||n!==bf.length||a.faceKinds[sourceFace]!==b.faceKinds[targetFace])continue;
  const align=Q();align.setFromVectors(a.faceNormals[sourceFace],mul(b.faceNormals[targetFace],-1));align.normalize();
  const tangent=align.vmult(sub(a.vertices[af[1]],a.vertices[af[0]]));tangent.normalize();
  for(let start=0;start<n;start++){
   const along=sub(b.vertices[bf[(start-1+n)%n]],b.vertices[bf[start]]);along.normalize();
   const twist=Q(),normal=b.faceNormals[targetFace];twist.setFromAxisAngle(normal,Math.atan2(normal.dot(tangent.cross(along)),tangent.dot(along)));
   const rotation=twist.mult(align);rotation.normalize();const offset=sub(b.faceCenters[targetFace],rotation.vmult(a.faceCenters[sourceFace]));
   if(!af.every((index,i)=>add(offset,rotation.vmult(a.vertices[index])).distanceTo(b.vertices[bf[(start-i+n)%n]])<1e-8))continue;
   options.push({sourceFace,targetFace,rotation,offset});
  }
 }
 faceJoinCache.set(key,options);return options;
}
function makeFragments(parts,reference,velocity=V(),spin=V()){
 const links=assemblyConnections(parts),remaining=new Set(parts.map((_,index)=>index)),created=[];
 while(remaining.size){const first=remaining.values().next().value,component=[first];remaining.delete(first);
  for(let i=0;i<component.length;i++)for(const index of links[component[i]])if(remaining.delete(index))component.push(index);
  created.push(makeGroup(component.map(index=>parts[index]),reference,velocity,spin));
 }return created;
}
function detachPart(hit,all=false){
 automationIntervention();
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
function resetAssemblyShake(){if(held)held.assemblyShake=null;}
function dismantleHeldAssembly(){
 const grip=held;if(!grip||grip.g.parts.length<2||(grip.items||[grip]).length!==1)return false;
 const g=grip.g,parts=worldParts(g),picked=grip.part.id,center=g.body.position.clone();
 const point=add(center,g.body.quaternion.vmult(grip.anchor)),distance=grip.distance;
 const bounded=(value,max)=>{const length=value.norm();return length>max?mul(value,max/length):value.clone();};
 const velocity=bounded(g.body.velocity,.35),spin=bounded(g.body.angularVelocity,2);
 // Drop old constraints before replacing the body, but keep the actual picked
 // unit in the same hand. Other units retain their world poses and settle freely.
 story.dockCandidate=null;releaseQubit(false);removeGroup(g);multiSelection=[];
 let pickedGroup=null;
 for(const part of parts){
  const offset=sub(part.p,center),outward=offset.norm()>1e-6?mul(offset,.06/offset.norm()):V();
  const motion=bounded(add(add(velocity,spin.cross(offset)),outward),.45);
  const fragment=makeGroup([part],part.q,motion,spin);if(part.id===picked)pickedGroup=fragment;
 }
 grabQubit({g:pickedGroup,part:pickedGroup.parts[0],point,distance});
 if(held){held.distance=distance;held.latched=grip.latched;held.reward=grip.reward;held.shakeSeparated=true;}
 snap=null;announce('Estructura desarmada · conservas la pieza que tomaste');redraw=true;return true;
}
function noteAssemblyShake(dx,dy,time){
 if(!held||held.age<.25||held.g.parts.length<2||(held.items||[held]).length!==1||!shiftDown()||!running||document.hidden||document.pointerLockElement!==canvas||!storyLookAllowed()||story.transition||radialOpen()||!panel.hidden||!menu.hidden||!commandMenu.hidden){resetAssemblyShake();return;}
 if(!Number.isFinite(dx)||!Number.isFinite(dy))return;
 const now=Number.isFinite(time)?time:performance.now(),axis=Math.abs(dx)>=Math.abs(dy)?'x':'y';
 const amount=axis==='x'?dx:dy;if(Math.abs(amount)<2)return;
 let shake=held.assemblyShake;
 if(!shake||shake.group!==held.g||now<shake.last||now-shake.last>180||now-shake.start>1200||shake.axis!==axis||now-shake.strokeStart>240){
  shake=held.assemblyShake={group:held.g,axis,start:now,last:now,strokeStart:now,sign:Math.sign(amount),stroke:0,reverse:0,turns:0,travel:0};
 }
 const travel=Math.min(Math.abs(amount),120);shake.travel+=travel;shake.last=now;
 if(Math.sign(amount)===shake.sign){shake.stroke+=travel;shake.reverse=0;}
 else{
  shake.reverse+=travel;
  // A reversal counts only after both strokes travel far enough. Tiny mouse
  // jitter or one quick turn while aligning a joint cannot dismantle a body.
  if(shake.reverse>=32){
   if(shake.stroke>=32)shake.turns++;
   else{shake.turns=0;shake.travel=shake.reverse;shake.start=now;}
   shake.sign*=-1;shake.stroke=shake.reverse;shake.reverse=0;shake.strokeStart=now;
  }
 }
 if(shake.turns>=4&&shake.travel>=240&&now-shake.start>=120)dismantleHeldAssembly();
}
function deleteQubit(hit){
 automationIntervention();
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
 const candidates=[],faces=unitFaces(t);
 for(const option of faceJoinOptions(part,t)){
  const face=faces[option.targetFace];
  if(sub(part.p,face.center).dot(face.normal)<-.015)continue;
  const partQ=t.q.mult(option.rotation),center=add(t.p,t.q.vmult(option.offset)),distance=center.distanceTo(part.p);
  const score=distance+(1-qSimilarity(partQ,part.q))*.025;if(score>=limit)continue;
  const quaternion=partQ.mult(part.part.q.inverse()),position=sub(center,quaternion.vmult(part.part.offset));
  candidates.push({source,target,position,quaternion,score,face:{p:face.center,normal:face.normal,vertices:face.vertices,q:t.q,axis:0}});
 }
 // Most frames need one scene collision check, regardless of the number of faces.
 candidates.sort((a,b)=>a.score-b.score);
 return candidates.find(c=>validSnapPose(source,c.position,c.quaternion))||null;
}
function findCompoundSquareSnap(source,target,limit){
 if(source.body.position.distanceTo(target.body.position)>source.body.boundingRadius+target.body.boundingRadius+limit)return null;
 const src=groupJoinFaces(source),dst=groupJoinFaces(target);
 if(!src.hasComposite&&!dst.hasComposite)return null;
 const targetFaces=dst.squares.map(face=>({...face,center:add(target.body.position,target.body.quaternion.vmult(face.center)),normal:target.body.quaternion.vmult(face.normal),vertices:face.vertices.map(v=>add(target.body.position,target.body.quaternion.vmult(v)))})),candidates=[];
 for(const local of src.squares){
  const currentCenter=add(source.body.position,source.body.quaternion.vmult(local.center));
  for(const face of targetFaces){
   if(!local.composite&&!face.composite||currentCenter.distanceTo(face.center)>limit||sub(currentCenter,face.center).dot(face.normal)<-.015)continue;
   const align=Q();align.setFromVectors(local.normal,mul(face.normal,-1));align.normalize();
   const tangent=align.vmult(sub(local.vertices[1],local.vertices[0]));tangent.normalize();
   for(let start=0;start<4;start++){
    const along=sub(face.vertices[(start+3)%4],face.vertices[start]);along.normalize();
    const twist=Q();twist.setFromAxisAngle(face.normal,Math.atan2(face.normal.dot(tangent.cross(along)),tangent.dot(along)));
    const quaternion=twist.mult(align);quaternion.normalize();const position=sub(face.center,quaternion.vmult(local.center));
    if(!local.vertices.every((vertex,i)=>add(position,quaternion.vmult(vertex)).distanceTo(face.vertices[(start-i+4)%4])<.00005))continue;
    const score=currentCenter.distanceTo(face.center)+(1-qSimilarity(quaternion,source.body.quaternion))*.025;if(score>=limit)continue;
    candidates.push({source,target,position,quaternion,score,wholeFace:true,face:{p:face.center,normal:face.normal,vertices:face.vertices,q:target.body.quaternion,axis:0}});
   }
  }
 }
 candidates.sort((a,b)=>a.score-b.score);
 return candidates.find(candidate=>validSnapPose(source,candidate.position,candidate.quaternion))||null;
}
// Mechanical connections remain separate rigid bodies: stable unit IDs survive
// ordinary weld/split operations, and the hinge is rebuilt before the next step.
function rotorPart(id){for(const g of groups){const part=g.parts.find(p=>p.id===id);if(part)return {g,part,...partPose(g,part)};}return null;}
function couplerTip(pose){return {point:add(pose.p,pose.q.vmult(V(0,CUBE_SIZE*51/56,0))),axis:pose.q.vmult(V(0,1,0))};}
function rotorForPart(id){return rotors.find(r=>r.aId===id||r.bId===id)||null;}
function rotorGroups(rotor){return [rotorPart(rotor.aId)?.g||null,rotorPart(rotor.bId)?.g||null];}
function rotorForGroup(g){return rotors.find(r=>rotorGroups(r).includes(g))||null;}
function rotorConnectedGroups(initial){
 const result=[...new Set(initial.filter(g=>groups.includes(g)))];
 for(let i=0;i<result.length;i++)for(const rotor of rotors){const pair=rotorGroups(rotor);if(pair.includes(result[i]))for(const g of pair)if(g&&!result.includes(g))result.push(g);}
 return result;
}
function unpinRotor(rotor){
 const pin=rotor.pin;if(!pin)return;const b=pin.body;b.type=pin.type;b.fixedRotation=pin.fixedRotation;b.updateMassProperties();b.velocity.set(0,0,0);b.angularVelocity.set(0,0,0);b.wakeUp();rotor.pin=null;
}
function invalidateRotorBody(g){
 for(const rotor of rotors)if(rotor.constraint&&(rotor.constraint.bodyA===g.body||rotor.constraint.bodyB===g.body)){
  world.removeConstraint(rotor.constraint);rotor.constraint=null;unpinRotor(rotor);
 }
}
function disconnectRotor(rotor){
 if(!rotors.includes(rotor))return false;
 if(rotor.constraint)world.removeConstraint(rotor.constraint);rotor.constraint=null;unpinRotor(rotor);rotors.splice(rotors.indexOf(rotor),1);return true;
}
function rotorTipsCompatible(a,b,tolerance=.002){
 if(!a||!b||unitShape(a)!=='coupler'||unitShape(b)!=='coupler'||a.g===b.g)return false;
 const at=couplerTip(a),bt=couplerTip(b);return at.point.distanceTo(bt.point)<=tolerance&&at.axis.dot(bt.axis)<-.995;
}
function connectRotorTips(aId,bId,options={}){
 const a=rotorPart(aId),b=rotorPart(bId);
 if(aId===bId||rotorForPart(aId)||rotorForPart(bId)||!rotorTipsCompatible(a,b)||rotorConnectedGroups([a.g]).includes(b.g))return null;
 if(poses(a.g).some(pa=>poses(b.g).some(pb=>obbOverlap(pa,pb,.000001))))return null;
 if(options.rpm!==undefined&&!Number.isFinite(options.rpm)||options.direction!==undefined&&![1,-1].includes(options.direction)||options.moving!==undefined&&!['a','b'].includes(options.moving)||options.mount!==undefined&&!['wheel','fixed'].includes(options.mount)||options.maxTorque!==undefined&&!Number.isFinite(options.maxTorque)||options.capacity!==undefined&&!Number.isFinite(options.capacity))return null;
 if(story.scene==='campaign')options={...options,maxTorque:Math.min(options.maxTorque??.4,campaignTorqueCap())};
 const rotor={id:++rotorSerial,aId,bId,rpm:clamp(options.rpm??30,1,120),direction:options.direction??1,moving:options.moving??'b',mount:options.mount??'wheel',maxTorque:clamp(options.maxTorque??.4,.02,4),capacity:clamp(options.capacity??16,2,128),enabled:false,constraint:null,pin:null};
 stopRoute(a.g);stopRoute(b.g);leaveHaul(a.g);leaveHaul(b.g);rotors.push(rotor);for(const [part,label]of [[a.part,'A'],[b.part,'B']])if(/^Enganche (?:\d+|[AB] · \d+)$/.test(part.mood.name))part.mood.name='Enganche '+label+' · '+part.id;refreshRotors();
 if(options.enabled)configureRotor(rotor,{enabled:true});return rotor;
}
function refreshRotors(){
 for(const rotor of [...rotors]){
  const a=rotorPart(rotor.aId),b=rotorPart(rotor.bId);
  if(!a||!b||a.g===b.g||unitShape(a)!=='coupler'||unitShape(b)!=='coupler'){disconnectRotor(rotor);continue;}
  if(rotor.constraint&&(rotor.constraint.bodyA!==a.g.body||rotor.constraint.bodyB!==b.g.body)){world.removeConstraint(rotor.constraint);rotor.constraint=null;unpinRotor(rotor);}
  if(!rotor.constraint){
   if(!rotorTipsCompatible(a,b,.004)){disconnectRotor(rotor);continue;}
   const localTip=V(0,CUBE_SIZE*51/56,0);
   rotor.constraint=new CANNON.HingeConstraint(a.g.body,b.g.body,{pivotA:add(a.part.offset,a.part.q.vmult(localTip)),pivotB:add(b.part.offset,b.part.q.vmult(localTip)),axisA:a.part.q.vmult(V(0,1,0)),axisB:b.part.q.vmult(V(0,-1,0)),maxForce:1000,collideConnected:true});
   for(const equation of rotor.constraint.equations)equation.setSpookParams(1e10,4,FIXED_STEP);
   // Cannon 0.6 caps impulse (not torque) and does not expose a multiplier.
   const motor=rotor.constraint.motorEquation,applyImpulse=motor.addToWlambda;
   motor.addToWlambda=function(impulse){rotor.motorImpulse=(rotor.motorImpulse||0)+impulse;return applyImpulse.call(this,impulse);};
   world.addConstraint(rotor.constraint);
  }
 }
 // Welding two previously independent networks must not leave competing motors.
 const powered=new Map();for(const rotor of rotors)if(rotor.enabled){const component=rotorConnectedGroups(rotorGroups(rotor));if(component.some(g=>powered.has(g)&&(rotor.mount==='fixed'||powered.get(g)==='fixed'))){rotor.enabled=false;rotor.constraint?.disableMotor();unpinRotor(rotor);}else for(const g of component)powered.set(g,rotor.mount);}
}
function configureRotor(rotor,patch={},automatic=false){
 if(!rotor||!rotors.includes(rotor))return false;
 patch={...patch};if(story.scene==='campaign')patch.maxTorque=Math.min(patch.maxTorque??rotor.maxTorque,campaignTorqueCap());
 if(!rotors.includes(rotor)||patch.rpm!==undefined&&!Number.isFinite(patch.rpm)||patch.direction!==undefined&&![1,-1].includes(patch.direction)||patch.moving!==undefined&&!['a','b'].includes(patch.moving)||patch.mount!==undefined&&!['wheel','fixed'].includes(patch.mount)||patch.maxTorque!==undefined&&!Number.isFinite(patch.maxTorque)||patch.capacity!==undefined&&!Number.isFinite(patch.capacity))return false;
 refreshRotors();if(!rotors.includes(rotor))return false;
 if(!automatic)automationIntervention('Motor ajustado: ensayo reiniciado.');
 const connected=rotorConnectedGroups(rotorGroups(rotor));
 if(patch.enabled&&(held?.items||[]).some(item=>connected.includes(item.g))){announce('Suelta el rotor antes de accionarlo.');return false;}
 if(patch.moving&&patch.moving!==rotor.moving||patch.mount&&patch.mount!==rotor.mount)unpinRotor(rotor);
 if(patch.rpm!==undefined)rotor.rpm=clamp(patch.rpm,1,120);
 if(patch.direction!==undefined)rotor.direction=patch.direction;
 if(patch.moving!==undefined)rotor.moving=patch.moving;
 if(patch.mount!==undefined)rotor.mount=patch.mount;
 if(patch.maxTorque!==undefined)rotor.maxTorque=clamp(patch.maxTorque,.02,4);
 if(patch.capacity!==undefined)rotor.capacity=clamp(patch.capacity,2,128);
 if(patch.enabled&&typeof checkRotorPower==='function'&&!checkRotorPower(rotor))return false;
 if(patch.enabled!==undefined){rotor.enabled=!!patch.enabled;rotor.stopReason=null;}
 if(rotor.enabled)for(const other of rotors)if(other!==rotor&&(rotor.mount==='fixed'||other.mount==='fixed')&&rotorGroups(other).some(g=>connected.includes(g))){other.enabled=false;other.constraint?.disableMotor();unpinRotor(other);}
 if(!rotor.enabled){if(patch.enabled===false)rotor.actualRpm=0;rotor.constraint?.disableMotor();unpinRotor(rotor);for(const g of rotorGroups(rotor))if(g){g.body.angularVelocity.set(0,0,0);g.body.wakeUp();}}
 updateRotorMotors();return true;
}
function rotorMovingFrame(rotor,moving){
 if(rotor.frameCache?.parts===moving.parts&&rotor.frameCache.moving===rotor.moving)return rotor.frameCache;
 const part=moving.parts.find(p=>p.id===(rotor.moving==='a'?rotor.aId:rotor.bId)),pivot=add(part.offset,part.q.vmult(V(0,CUBE_SIZE*51/56,0))),axis=part.q.vmult(V(0,1,0));let radius=0;
 for(const pose of poses(moving,V(),Q()))for(const point of corners(pose)){const v=sub(point,pivot);radius=Math.max(radius,sub(v,mul(axis,v.dot(axis))).norm());}
 return rotor.frameCache={parts:moving.parts,moving:rotor.moving,pivot,axis,radius:Math.max(.01,radius)};
}
function rotorProjectedPose(rotor,moving,base,quaternion=moving.body.quaternion){
 const frame=rotorMovingFrame(rotor,moving),basePart=base.parts.find(p=>p.id===(rotor.moving==='a'?rotor.bId:rotor.aId)),tip=couplerTip(partPose(base,basePart));
 const correction=Q();correction.setFromVectors(quaternion.vmult(frame.axis),mul(tip.axis,-1));correction.normalize();
 const q=correction.mult(quaternion);q.normalize();return {p:sub(tip.point,q.vmult(frame.pivot)),q,pivot:tip.point,axis:mul(tip.axis,-1)};
}
// This Cannon version compares friction force bounds directly to impulse.
// Match the true torque cap for driven free bodies without changing legacy
// walking, hauling or unpowered contact behavior elsewhere in the room.
const solveRotorContacts=world.solver.solve;
world.solver.solve=function(dt,physicsWorld){
 const driven=new Set();for(const rotor of rotors)if(rotor.enabled&&rotor.mount==='wheel')for(const g of rotorConnectedGroups(rotorGroups(rotor)))driven.add(g.body);
 const changed=[];for(const eq of physicsWorld.frictionEquations)if(driven.has(eq.bi)||driven.has(eq.bj)){changed.push([eq,eq.minForce,eq.maxForce]);eq.minForce*=dt;eq.maxForce*=dt;}
 try{return solveRotorContacts.call(this,dt,physicsWorld);}finally{for(const [eq,min,max]of changed){eq.minForce=min;eq.maxForce=max;}}
};
function updateRotorMotors(dt=0){
 for(const rotor of rotors){
  const pair=rotorGroups(rotor),constraint=rotor.constraint;if(!constraint||pair.some(g=>!g))continue;
  const moving=pair[rotor.moving==='a'?0:1],base=pair[rotor.moving==='a'?1:0],b=base.body,frame=rotorMovingFrame(rotor,moving);
  // Respect the simulation's 6 m/s travel ceiling at the outermost point,
  // rather than clipping only the center velocity and stretching a long arm.
  rotor.effectiveRpm=Math.min(rotor.rpm,5/frame.radius*60/(2*Math.PI));rotor.speedLimited=rotor.effectiveRpm<rotor.rpm-.01;
  if(dt>0)rotor.beforeStep=pair.map(g=>({p:g.body.position.clone(),q:g.body.quaternion.clone()}));
  if(!rotor.enabled){constraint.collideConnected=false;constraint.disableMotor();unpinRotor(rotor);rotor.driveVelocity=0;rotor.stalled=false;rotor.obstructed=false;rotor.stallTime=0;rotor.actualTorque=0;continue;}
  // Coincident apex contact has no stable surface normal. While driven, the
  // exact sweep/stall guard below handles mutual solid contact; ordinary
  // Cannon contacts remain enabled against every other body.
  constraint.collideConnected=false;
  const component=rotorConnectedGroups(pair);
  if((held?.items||[]).some(item=>component.includes(item.g))){rotor.enabled=false;constraint.disableMotor();unpinRotor(rotor);rotor.driveVelocity=0;continue;}
  rotor.motorImpulse=0;rotor.motorStep=dt;
  if(rotor.mount==='wheel'){
   rotor.obstructed=false;unpinRotor(rotor);
   for(const g of pair){stopRoute(g);leaveHaul(g);if(g.body.type!==CANNON.Body.DYNAMIC||g.body.fixedRotation){g.body.type=CANNON.Body.DYNAMIC;g.body.fixedRotation=false;g.body.updateMassProperties();}g.body.wakeUp();}
   const target=rotor.direction*rotor.effectiveRpm*Math.PI*2/60,previous=rotor.driveVelocity||0;rotor.driveVelocity=previous+clamp(target-previous,-16*dt,16*dt);
   constraint.enableMotor();constraint.setMotorMaxForce(rotor.maxTorque*dt);constraint.setMotorSpeed(rotor.driveVelocity);
   continue;
  }
  if(rotor.pin?.body!==b){unpinRotor(rotor);stopRoute(base);stopRoute(moving);leaveHaul(base);leaveHaul(moving);rotor.pin={body:b,type:b.type,fixedRotation:b.fixedRotation,p:b.position.clone(),q:b.quaternion.clone()};b.type=CANNON.Body.KINEMATIC;b.fixedRotation=true;b.updateMassProperties();rotor.driveVelocity=0;rotor.safePose={p:moving.body.position.clone(),q:moving.body.quaternion.clone()};}
  b.position.copy(rotor.pin.p);b.quaternion.copy(rotor.pin.q);b.velocity.set(0,0,0);b.angularVelocity.set(0,0,0);b.force.set(0,0,0);b.torque.set(0,0,0);b.aabbNeedsUpdate=true;
  if(moving.body.type!==CANNON.Body.DYNAMIC||moving.body.fixedRotation){moving.body.type=CANNON.Body.DYNAMIC;moving.body.fixedRotation=false;moving.body.updateMassProperties();}moving.body.wakeUp();
  const target=rotor.direction*rotor.effectiveRpm*Math.PI*2/60,previous=rotor.driveVelocity||0;rotor.driveVelocity=previous+clamp(target-previous,-16*dt,16*dt);
  const projected=rotorProjectedPose(rotor,moving,base),turn=Q();turn.setFromAxisAngle(projected.axis,rotor.driveVelocity*dt);
  const next=rotorProjectedPose(rotor,moving,base,turn.mult(projected.q));
  rotor.obstructed=dt>0&&!validPose(moving,next.p,next.q);
  if(rotor.obstructed){moving.body.velocity.set(0,0,0);moving.body.angularVelocity.set(0,0,0);}
  constraint.enableMotor();constraint.setMotorMaxForce(rotor.maxTorque*dt);
  // Clockwise is viewed from the moving outer cube toward its own tip.
  constraint.setMotorSpeed(rotor.driveVelocity);
 }
}
function stabilizeRotors(){
 for(const rotor of rotors){
  const pair=rotorGroups(rotor);if(pair.some(g=>!g))continue;
  const moving=pair[rotor.moving==='a'?0:1],base=pair[rotor.moving==='a'?1:0],b=moving.body,pose=rotorProjectedPose(rotor,moving,base);
  rotor.actualTorque=rotor.enabled&&rotor.motorStep>0?Math.abs(rotor.motorImpulse||0)/rotor.motorStep:0;
  rotor.actualRpm=sub(b.angularVelocity,base.body.angularVelocity).dot(pose.axis)*60/(2*Math.PI);
  rotor.stallTime=rotor.enabled&&Math.abs(rotor.actualRpm)<Math.min(2,rotor.effectiveRpm*.15)&&Math.abs(rotor.driveVelocity)>.3?(rotor.stallTime||0)+(rotor.motorStep||0):0;
  rotor.stalled=rotor.obstructed||rotor.stallTime>.25;
  if(rotor.mount==='wheel'||!rotor.enabled){
   // An unpowered rotor remains a mechanical hinge. Leave contact forces and angular velocity to the solver. Correct only
   // translation drift, distributing it by mass so the assembly stays free.
   const at=couplerTip(rotorPart(rotor.aId)),bt=couplerTip(rotorPart(rotor.bId)),gap=sub(bt.point,at.point),total=pair[0].body.mass+pair[1].body.mass;
   pair[0].body.position.vadd(mul(gap,pair[1].body.mass/total),pair[0].body.position);
   pair[1].body.position.vsub(mul(gap,pair[0].body.mass/total),pair[1].body.position);
   const solidsOverlap=poses(pair[0]).some(a=>poses(pair[1]).some(b=>obbOverlap(a,b,.0005)));
   if(solidsOverlap&&rotor.beforeStep){for(let i=0;i<2;i++){pair[i].body.position.copy(rotor.beforeStep[i].p);pair[i].body.quaternion.copy(rotor.beforeStep[i].q);pair[i].body.angularVelocity.set(0,0,0);pair[i].body.velocity.set(0,0,0);}rotor.actualRpm=0;}
   rotor.stalled=rotor.enabled&&(solidsOverlap||rotor.stalled);
   // A falling assembly can cross the contact plane in one substep. Lift the
   // complete free mechanism together, preserving every connected axle.
   const component=rotorConnectedGroups(pair);
   if(component.every(g=>g.body.type===CANNON.Body.DYNAMIC)){
    const low=Math.min(...component.map(g=>bounds(g).min.y));
    if(low<-.001)for(const g of component){g.body.position.y+=-.001-low;if(g.body.velocity.y<0)g.body.velocity.y=0;g.body.aabbNeedsUpdate=true;}
   }
   for(const g of pair){g.body.aabbNeedsUpdate=true;g.body.updateInertiaWorld(true);}
   continue;
  }
  if(!rotor.pin)continue;
  // A hard mechanical axle must not stretch when iterative contacts fight a
  // motor. Project its physical body onto the exact hinge, or stall at the last
  // collision-free pose. Rendering and collision geometry always share this pose.
  if(!rotor.obstructed&&validPose(moving,pose.p,pose.q)){
   b.position.copy(pose.p);b.quaternion.copy(pose.q);rotor.safePose={p:pose.p.clone(),q:pose.q.clone()};
   const speed=b.angularVelocity.dot(pose.axis);b.angularVelocity.copy(mul(pose.axis,speed));b.velocity.copy(b.angularVelocity.cross(sub(b.position,pose.pivot)));
  }else if(rotor.safePose){
   b.position.copy(rotor.safePose.p);b.quaternion.copy(rotor.safePose.q);b.velocity.set(0,0,0);b.angularVelocity.set(0,0,0);rotor.actualRpm=0;rotor.stalled=true;
  }
  b.aabbNeedsUpdate=true;b.updateInertiaWorld(true);
 }
}
function spawnRotor(p=null,options={}){
 if(certifiedAutomation()){announce('Ensayo certificado: usa el mecanismo del banco.');return null;}
 if(groups.reduce((n,g)=>n+g.parts.length,0)+2>MAX_QUBITS){announce('No hay capacidad para dos enganches.');return null;}
 const positions=p?[p]:Array.from({length:6},(_,row)=>[0,1,-1,2,-2,3,-3].map(col=>V(position[0]-Math.sin(yaw)*(.95+row*.3)+Math.cos(yaw)*col*.3,0,position[2]-Math.cos(yaw)*(.95+row*.3)-Math.sin(yaw)*col*.3))).flat();
 const flip=Q();flip.setFromAxisAngle(V(0,0,1),Math.PI);
 for(const base of positions){
  const ap=add(base,V(0,unitGroundHeight('coupler')+.002,0)),bp=add(ap,V(0,2*CUBE_SIZE*51/56,0));
  const a=addQubit([ap.x,ap.y,ap.z],settings.mass,'coupler'),b=makeGroup([{id:allocateUnitId(),weight:settings.mass,shape:'coupler',p:bp,q:flip}]);
  if(!validPose(a,a.body.position,a.body.quaternion)||!validPose(b,b.body.position,b.body.quaternion)){removeGroup(a);removeGroup(b);continue;}
  const rotor=connectRotorTips(a.parts[0].id,b.parts[0].id,options);if(rotor){selected={g:a,part:a.parts[0]};multiSelection=[];announce('Rotor creado · clic derecho → Rotación');return rotor;}
  removeGroup(a);removeGroup(b);
 }
 announce('No hay espacio libre para el rotor.');return null;
}
function findRotorSnap(source,target,limit){
 let best=null;
 for(const a of poses(source))if(unitShape(a)==='coupler'&&!rotorForPart(a.part.id))for(const b of poses(target))if(unitShape(b)==='coupler'&&!rotorForPart(b.part.id)){
  const at=couplerTip(a),bt=couplerTip(b),distance=at.point.distanceTo(bt.point);if(distance>=limit)continue;
  const delta=Q();delta.setFromVectors(at.axis,mul(bt.axis,-1));delta.normalize();const quaternion=delta.mult(source.body.quaternion);quaternion.normalize();
  const local=add(a.part.offset,a.part.q.vmult(V(0,CUBE_SIZE*51/56,0))),position=sub(bt.point,quaternion.vmult(local));
  const score=distance+(1-qSimilarity(quaternion,source.body.quaternion))*.025;
  if(score>=limit||best&&score>=best.score||!validSnapPose(source,position,quaternion))continue;
  best={source,target,position,quaternion,score,rotorTip:true,aId:a.part.id,bId:b.part.id,face:{p:bt.point,q:b.q,axis:1,normal:bt.axis,dimensions:V(.018,.018,.018)}};
 }return best;
}

// Snap a connected mechanism as one placement, while retaining each rigid
// body and every hinge. Unrelated marquee selections still cannot be welded.
function heldMechanismCanSnap(){
 if(!held)return false;
 const members=rotorConnectedGroups([held.g]),items=held.items||[held];
 return items.length===members.length&&members.every(g=>items.some(item=>item.g===g));
}
function mechanismSnapPoses(source,position,quaternion){
 const delta=quaternion.mult(source.body.quaternion.inverse());delta.normalize();
 return rotorConnectedGroups([source]).map(g=>({g,p:add(position,delta.vmult(sub(g.body.position,source.body.position))),q:delta.mult(g.body.quaternion)}));
}
function validSnapPose(source,position,quaternion){
 const placement=mechanismSnapPoses(source,position,quaternion),members=placement.map(item=>item.g);
 return placement.every(item=>validPose(item.g,item.p,item.q,members));
}
function placeSnappedMechanism(placement){
 for(const {g,p,q}of placement){g.body.position.copy(p);g.body.quaternion.copy(q);g.body.aabbNeedsUpdate=true;g.body.updateInertiaWorld(true);}
}
function settleSnappedMechanisms(source,target){
 const members=rotorConnectedGroups([source,target]);
 for(const rotor of rotors)if(rotorGroups(rotor).some(g=>members.includes(g)))unpinRotor(rotor);
 for(const g of members){g.body.velocity.set(0,0,0);g.body.angularVelocity.set(0,0,0);g.body.wakeUp();}
}
function findSnap(){
 if(!held||held.shakeSeparated||!shiftDown()||!heldMechanismCanSnap())return null;
 const source=held.g,part=partPose(source,held.part);let candidate=null,best=.055;
 for(const target of groups){if(target===source||target.route||target.haulJob||rotorConnectedGroups([source]).includes(target))continue;
  const tip=findRotorSnap(source,target,best);if(tip){candidate=tip;best=tip.score;}
  if(sameBlockShape(source,target)){
   const blockCandidate=findBlockSnap(source,target);
   if(blockCandidate&&(!candidate||blockCandidate.score<candidate.score)){candidate=blockCandidate;best=blockCandidate.score;}
   continue;
  }
  const composite=findCompoundSquareSnap(source,target,best);if(composite){candidate=composite;best=composite.score;}
  for(const t of poses(target)){
   if(isTBit(part.part)||isTBit(t.part)){
    const convex=findConvexSnap(source,part,target,t,best);if(convex){candidate=convex;best=convex.score;}continue;
   }
   for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
   const normal=t.q.vmult(mul(axes[axis],sign)),center=add(t.p,mul(normal,CUBE_SIZE)),distance=center.distanceTo(part.p);
   if(distance>=best)continue;
   const partQ=nearestRelative(t.q,part.q),delta=partQ.mult(part.q.inverse()),quaternion=delta.mult(source.body.quaternion);
   const position=sub(center,quaternion.vmult(held.part.offset));
   if(!validSnapPose(source,position,quaternion))continue;
   best=distance;candidate={source,target,position,quaternion,score:distance,face:{p:add(t.p,mul(normal,HALF+.001)),normal,q:t.q,axis}};
   }
  }
 }return candidate;
}
function weld(candidate){
 automationIntervention();
 if(!candidate)return null;
 if([candidate.source,candidate.target].some(g=>g?.parts.some(p=>p.mood.production))){announce('La materia de este lote se combina dentro de la cámara.');return null;}
 const {source,target,position,quaternion}=candidate;
 if(source===target||!groups.includes(source)||!groups.includes(target)||!position||!quaternion||!['x','y','z'].every(k=>Number.isFinite(position[k]))||!['x','y','z','w'].every(k=>Number.isFinite(quaternion[k]))||Math.abs(quaternion.x**2+quaternion.y**2+quaternion.z**2+quaternion.w**2-1)>1e-5)return null;
 if(!validSnapPose(source,position,quaternion)||rotorConnectedGroups([source]).includes(target))return null;
 if(candidate.rotorTip){
  const placement=mechanismSnapPoses(source,position,quaternion),before=placement.map(({g})=>({g,p:g.body.position.clone(),q:g.body.quaternion.clone()}));placeSnappedMechanism(placement);
  const rotor=connectRotorTips(candidate.aId,candidate.bId);
  if(!rotor){placeSnappedMechanism(before);return null;}
  settleSnappedMechanisms(source,target);
  selected={g:source,part:source.parts.find(p=>p.id===candidate.aId)||source.parts[0]};announce('Rotor unido · clic derecho → Rotación');return source;
 }
 const sourceParts=poses(source,position,quaternion),targetParts=poses(target);
 if(sourceParts.some(a=>targetParts.some(b=>obbOverlap(a,b,.000001))))return null;
 if(!assembliesTouch(sourceParts,targetParts))return null;
 const parts=sourceParts.map(o=>({id:o.part.id,weight:o.part.weight,shape:o.part.shape,p:o.p,q:o.q,mood:copyMood(o.part.mood)})).concat(worldParts(target));
 const placement=mechanismSnapPoses(source,position,quaternion);settleSnappedMechanisms(source,target);placeSnappedMechanism(placement);
 const ref=target.body.quaternion.clone();removeGroup(source);removeGroup(target);const joined=makeGroup(parts,ref);refreshRotors();
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
 const snapPoses=snap&&snap.source===held.g?mechanismSnapPoses(held.g,snap.position,snap.quaternion):[];
 for(const item of held.items||[held]){
  const b=item.g.body;b.wakeUp();b.angularDamping=.85+settings.grip*.1499;
  let target=add(rootTarget,rotationDelta.vmult(item.relative||V())),desired=null,strength=160;
  const snapped=snapPoses.find(pose=>pose.g===item.g);
  if(snapped){target=add(snapped.p,snapped.q.vmult(item.anchor));desired=snapped.q;item.restQ=null;}
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
   const force=settings.force*workshopGrip(item.g)*b.mass/(held.weight*.25);
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
 if(!quiet)automationIntervention();
 if(!g||!groups.includes(g))return false;
 if(g.parts.some(p=>p.mood.production)){if(!quiet)announce('La materia se transporta con la línea, no recibe órdenes.');return false;}
 if(rotorForGroup(g)){if(!quiet)announce('Separa el rotor antes de asignar un recorrido.');return false;}
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
// Motor batteries belong to the two enganches. Other attached pieces add load,
// not free energy. The same mood energy powers the existing close-up bars.
function rotorPowerState(rotor,dt=0){
 const a=rotorPart(rotor.aId),b=rotorPart(rotor.bId),component=rotorConnectedGroups(rotorGroups(rotor));
 const load=component.reduce((sum,g)=>sum+totalWeight(g),0);
 return QBitsRotorPower.evaluate({enabled:rotor.enabled,rpm:rotor.rpm,actualRpm:rotor.actualRpm||0,actualTorque:rotor.actualTorque||0,stalled:rotor.stalled,maxTorque:rotor.maxTorque,load,capacity:rotor.capacity,energyA:a?.part.mood.energy??0,energyB:b?.part.mood.energy??0,capacityJoulesA:QBitsWorkshop.batteryCapacity(a?.part),capacityJoulesB:QBitsWorkshop.batteryCapacity(b?.part)},dt);
}
function rotorPowerDescription(rotor,compact=false){
 const power=rotorPowerState(rotor),energy=[rotor.aId,rotor.bId].map(id=>Math.round((rotorPart(id)?.part.mood.energy||0)*100));
 const load=rotorConnectedGroups(rotorGroups(rotor)).reduce((sum,g)=>sum+totalWeight(g),0),consumption=power.drainPerSecond*100;
 const state=rotor.stopReason?rotorStopLabel(rotor.stopReason):rotor.enabled?(rotor.stalled?'atascado':'encendido'):'apagado';
 if(compact)return 'Rotor '+state+' · '+Math.abs(rotor.actualRpm||0).toFixed(0)+' rpm · '+load.toFixed(1)+' / '+rotor.capacity+' u · −'+consumption.toFixed(2)+' %/s';
 return (story.campaign?.production?.rotor===rotor?'Motor: el objetivo suma también el consumo de la línea. ':'')+'Energía A '+energy[0]+' % · B '+energy[1]+' % · consumo '+consumption.toFixed(2)+' %/s ('+power.inputWatts.toFixed(2)+' W). Carga '+load.toFixed(1)+' / '+rotor.capacity+' u. Torque usado '+(rotor.actualTorque||0).toFixed(2)+' / '+rotor.maxTorque.toFixed(2)+' N·m. Giro real '+Math.abs(rotor.actualRpm||0).toFixed(1)+' / '+rotor.rpm+' rpm objetivo.';
}
function rotorStopLabel(reason){return reason==='overload'?'sobrecarga':reason==='empty'?'sin energía':'';}
function checkRotorPower(rotor){
 const enabled=rotor.enabled;rotor.enabled=true;const power=rotorPowerState(rotor);rotor.enabled=enabled;
 if(!power.stopReason)return true;
 rotor.stopReason=power.stopReason;announce('Rotor · '+rotorStopLabel(power.stopReason)+(power.stopReason==='overload'?' · reduce la carga o ajusta el límite en Mecanismos.':' · déjalo descansar para recargar.'));return false;
}
function stopRotorForPower(rotor,reason){
 configureRotor(rotor,{enabled:false});rotor.stopReason=reason;
 announce('Rotor detenido · '+rotorStopLabel(reason));
}
function prepareRotorPower(){
 for(const rotor of rotors){
  rotor.powerActive=false;
  if(!rotor.enabled)continue;
  const power=rotorPowerState(rotor);rotor.power=power;
  if(power.stopReason)stopRotorForPower(rotor,power.stopReason);else rotor.powerActive=true;
 }
}
function updateRotorPower(dt){
 for(const rotor of rotors){
  if(!rotor.powerActive||!rotor.enabled)continue;
  const power=rotorPowerState(rotor,dt);rotor.power=power;
  for(const [id,drain]of [[rotor.aId,power.drainA],[rotor.bId,power.drainB]]){const part=rotorPart(id)?.part;if(part){part.mood.energy=clamp(part.mood.energy-drain,0,1);part.mood.idle=0;part.mood.boredOnce=false;}}
  if(power.stopReason)stopRotorForPower(rotor,power.stopReason);
 }
}
function stepPhysics(dt){
 simTime+=dt;refreshRotors();tutorialFloat(dt);updateGrab(dt);updateRoutes(dt);updateHauling(dt);
 // Bound substep travel to avoid tunnelling through a 9 cm piece.
 for(const g of groups){const b=g.body,speed=b.velocity.norm();if(speed>6)b.velocity.scale(6/speed,b.velocity);const spin=b.angularVelocity.norm();if(spin>30)b.angularVelocity.scale(30/spin,b.angularVelocity);}
 updateCampaignPressure(dt);updateButtonPhysics();prepareRotorPower();updateRotorMotors(dt);productionForces(dt);world.step(dt);stabilizeRotors();updateRotorPower(dt);tickContactSensors(dt);
 // Correct only tiny solver penetration of a hand-held shape; free bodies keep
 // their normal collision response. A hand cannot push its attachment underground.
 if(held)for(const item of held.items||[held]){const b=item.g.body,low=bounds(item.g).min.y;if(low<.001){b.position.y+=.001-low;if(b.velocity.y<0)b.velocity.y=0;b.aabbNeedsUpdate=true;}if(item.floorLocked)b.angularVelocity.set(0,0,0);}
 for(const c of cargos){c.body.velocity.y=0;c.body.position.y=(c.dimensions?.y||c.size)/2;c.body.quaternion.set(0,0,0,1);c.body.angularVelocity.set(0,0,0);c.body.aabbNeedsUpdate=true;}
 updateCooling(dt);updateMoods(dt);updateBlueprints(dt);updatePuzzle(dt);tickAutomation(dt);tickProduction(dt);
}
function updatePanel(){
 if(selected&&!groups.includes(selected.g))selected=null;
 syncUnitControls();
 document.querySelector('#editing').textContent=selected?unitLabel(selected.part)+' '+selected.part.id+' · estructura de '+selected.g.parts.length+' · '+totalWeight(selected.g)+' u en total.':'Selecciona con clic derecho para ajustar una pieza.';
 for(const name of ['mass','gravity','bounce','force','friction','damping','speed','maxCarry','maxSelect','rotationSpeed','grip']){
  const input=document.querySelector('#'+name);if(name==='mass'){input.min=selected?.part.mood?.matter?String(.25/12):'.25';input.step=selected?.part.mood?.matter?'any':'.25';}input.value=name==='mass'&&selected?selected.part.weight:settings[name];
  document.querySelector('#'+name+'Value').textContent=Number(input.value).toFixed(name==='mass'?2:2)+({mass:' u',gravity:' m/s²',force:' N',speed:' m/s',maxCarry:' u',maxSelect:' piezas',rotationSpeed:' rad/s'}[name]||'');
 }
 for(const name of ['guide','line'])document.querySelector('#'+name).value=settings[name];
 updateCargoPanel();updatePuzzlePanel();updateMoodPanel();updateAlphaPanel();updateMechanismPanel();
 document.querySelector('#remove').disabled=puzzle.active||!selected;document.querySelector('#split').disabled=!selected||selected.g.parts.length===1;
}
function openPanel(){closeCommandMenu(false);selectedCargo=aimCargo(4)?.cargo||selectedCargo;selected=held?{g:held.g,part:held.part}:aimQubit()||selected;pause();panel.hidden=false;updatePanel();}
for(const name of ['mass','gravity','bounce','force','friction','damping','speed','maxCarry','maxSelect','rotationSpeed','grip'])document.querySelector('#'+name).addEventListener('input',event=>{
 if(story.scene==='campaign'&&story.campaign?.automation){announce('Ensayo certificado: masa y físicas permanecen fijas. Ajusta el motor.');updatePanel();return;}
 automationIntervention();settings[name]=Number(event.target.value);
 if(name==='mass'&&puzzle.active){settings.mass=1;updatePanel();return;}
 if(name==='mass'&&selected&&QBitsWorkshop.hasAdaptation(selected.part)){settings.mass=selected.part.weight;announce('Restablece la pieza en la mesa antes de cambiar su masa.');updatePanel();return;}
 if(name==='mass'&&selected){
  const old=selected.g,id=selected.part.id,parts=worldParts(old),ref=old.body.quaternion.clone();parts.find(p=>p.id===id).weight=settings.mass;
  removeGroup(old);const g=makeGroup(parts,ref);selected={g,part:g.parts.find(p=>p.id===id)};
 }
 world.gravity.y=-settings.gravity;world.defaultContactMaterial.friction=settings.friction;world.defaultContactMaterial.restitution=settings.bounce;
 for(const g of groups){g.body.angularDamping=settings.damping;g.body.wakeUp();}
 updatePanel();
});
for(const name of ['guide','line'])document.querySelector('#'+name).addEventListener('change',e=>settings[name]=e.target.value);
for(const name of ['cube','route','cargo','puzzle','alpha','mechanisms'])document.querySelector('#tab-'+name).addEventListener('click',()=>{
 for(const tab of ['cube','route','cargo','puzzle','alpha','mechanisms']){document.querySelector('#page-'+tab).hidden=tab!==name;document.querySelector('#tab-'+tab).setAttribute('aria-selected',String(tab===name));}
});
document.querySelector('#create').addEventListener('click',()=>{spawnQubit();updatePanel();});
document.querySelector('#unit-shape').addEventListener('change',event=>{if(creationChoiceAllowed(event.target.value))settings.unitShape=normalizeCreationChoice(event.target.value);syncUnitControls();});
document.querySelector('#remove').addEventListener('click',()=>{deleteQubit(selected);updatePanel();});
document.querySelector('#split').addEventListener('click',()=>{detachPart(selected,true);updatePanel();});
document.querySelector('#stop').addEventListener('click',()=>{if(selectedCargo)stopHaul(selectedCargo);for(const g of selectedTeam()){leaveHaul(g);stopRoute(g);}});
document.querySelector('#resume').addEventListener('click',()=>{panel.hidden=true;if(!story.ready||story.mode==='playing')captureMouse();});
canvas.addEventListener('mousedown',onPhysicalMouseDown);
document.addEventListener('mouseup',onPhysicalMouseUp);
function handleWheel(event){
 if(radialOpen()){event.preventDefault();return;}
 if(!gameInputActive())return;
 if(keys.has('KeyC')){
  event.preventDefault();posture.crouchHeight=clamp(posture.crouchHeight-Math.sign(event.deltaY)*.08,.42,1.15);redraw=true;return;
 }
 if(!held||!storyLookAllowed()||storySuspended()||story.transition)return;
 event.preventDefault();held.distance=clamp(held.distance+Math.sign(event.deltaY)*.07,.3,2.5);redraw=true;
}
canvas.addEventListener('wheel',handleWheel,{passive:false});
function handleKey(event){
 if(settingsScreen?.isOpen)return;
 if(radialOpen()){
  event.preventDefault();
  if(event.code==='Escape')closeUnitRadial(false);
  else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.code))unitRadial.chooseNext(event.code==='ArrowLeft'||event.code==='ArrowUp'?-1:1);
  return;
 }
 if(event.code==='KeyQ'&&!event.repeat&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&unitRadialAllowed()){
  event.preventDefault();openUnitRadial();return;
 }
 if(event.code==='Escape'&&pendingUnitCreation){event.preventDefault();cancelUnitCreation();announce('Creación cancelada');return;}
 if(storyInput(event))return;
 speech.lastInput=simTime;
 if(event.code==='Escape'){closeCommandMenu(false);moveChoice=null;pendingCargo=null;routeInspection=null;if(!menu.hidden)closeDetachMenu(false);finishMarquee(true);pause();return;}
 const editing=['INPUT','SELECT','BUTTON'].includes(document.activeElement?.tagName);
 if(event.code==='KeyP'&&!event.repeat&&!editing){event.preventDefault();if(panel.hidden)openPanel();else panel.hidden=true;return;}
 if(!gameInputActive())return;
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
 if(!gameInputActive()){targetLabel.textContent='';crosshair.classList.remove('ready');return;}
 const hit=held||aimQubit();crosshair.classList.toggle('ready',!!hit);
 if(pendingUnitCreation)targetLabel.textContent='Clic izquierdo · crear '+creationTitle(pendingUnitCreation)+' · Esc / clic derecho · cancelar';
 else if(marquee)targetLabel.textContent='Suelta para seleccionar · hasta '+settings.maxSelect+' piezas';
 else if(held?.latched)targetLabel.textContent='Clic · soltar selección · Shift + WASD · girar'+(held.g.parts.length>1?' · Shift + sacudir · desarmar':' · rueda · enfocar');
 else if(held)targetLabel.textContent=snap?(snap.rotorTip?'Puntas alineadas · suelta para formar Rotor':snap.wholeFace?'Cara completa · suelta para unir':'Suelta para unir esta cara'):shiftDown()?'WASD · girar'+(held.g.parts.length>1?' · sacudir varias veces · desarmar':''):'Shift · girar / unir · rueda · enfocar · Ctrl · caída';
 else if(aimWorkshop()){targetLabel.textContent='E · mesa de trabajo · investigar y adaptar';crosshair.classList.add('ready');}
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
for(const shape of ['tetra','pyramid','coupler']){
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
function drawUnitMesh(pose,color=null,kind=null){const shape=unitShape(pose),mesh=unitMeshes[shape];bindGeometry(mesh.buffer);gl.uniform1f(uniforms.uKind,kind??(shape==='cube'?1:5));setPose(pose.p,pose.q);if(shape==='coupler'&&!color&&kind===null){tint(.20,.23,.24,1);gl.drawArrays(gl.TRIANGLES,0,30);tint(.53,.59,.58,1);gl.drawArrays(gl.TRIANGLES,30,12);return;}if(color)tint(...color);else if(shape!=='cube')tint(.48,.48,.48,1);gl.drawArrays(gl.TRIANGLES,0,mesh.count);}
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
function drawGroupSolid(g){
 if(g.block){const p=moodVisualPose(g,blockPose(g));bindGeometry(cubeGeometry);gl.uniform1f(uniforms.uKind,1);setPose(p.p,p.q,p.size);gl.drawArrays(gl.TRIANGLES,0,36);}
 else for(const p of poses(g))drawUnitMesh(g.parts.length===1?{...moodVisualPose(g,p),part:p.part}:p);
}
function drawQubits(){
 bindGeometry(shadowGeometry);gl.uniform1f(uniforms.uKind,2);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
 for(const g of groups)for(const p of poses(g)){
  if(visuals.shadows==='off')continue;
  if(visuals.shadows==='sharp'){drawSharpShadow(p);bindGeometry(shadowGeometry);gl.uniform1f(uniforms.uKind,2);continue;}
  const height=Math.max(0,p.p.y-HALF),scale=.23+Math.min(height,2)*.18;
  setPose(V(p.p.x,.001,p.p.z),Q(),V(scale,scale,scale));gl.uniform1f(uniforms.uScale,scale);gl.uniform1f(uniforms.uShadow,.22/(1+height*3));gl.drawArrays(gl.TRIANGLES,0,6);
 }
 gl.depthMask(true);gl.disable(gl.BLEND);
 for(const g of groups){if(g.parts.some(p=>p.mood.production)){for(const p of poses(g))drawBox(p.p,p.q,V(CUBE_SIZE-.002,CUBE_SIZE-.002,CUBE_SIZE-.002),p.part.mood.production?.kind==='A'?[.27,.56,.67,1]:p.part.mood.production?[.72,.53,.26,1]:[.12,.14,.13,1]);if(g.parts.length===2)drawOutline(g.body.position,g.body.quaternion,sub(bounds(g,V(),Q()).max,bounds(g,V(),Q()).min),.8,false);}else drawGroupSolid(g);}
 drawCargos();drawPuzzle();drawAlpha();drawWorkshop();drawStructureOutlines();drawGuides();drawTaskGuides();
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
   const position=sub(center,q.vmult(source.block.center));if(!validSnapPose(source,position,q))continue;
   const score=distance+(1-qSimilarity(q,source.body.quaternion))*.025;if(best&&score>=best.score)continue;
   best={source,target,position,quaternion:q,score,wholeFace:true,face:{p:add(targetPose.p,mul(normal,target.block.size[k]/2+.001)),normal,q:targetPose.q,axis,dimensions:target.block.size}};
  }
 }return best;
}
function cameraBasis(){return {forward:direction(),right:V(Math.cos(yaw),0,-Math.sin(yaw)),up:V(Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),Math.cos(yaw)*Math.sin(pitch))};}
function screenRay(x,y){const b=cameraBasis(),w=canvas.clientWidth,h=canvas.clientHeight,xx=(2*x/w-1)*(w/h)/heldFocus.focal,yy=(1-2*y/h)/heldFocus.focal;const d=add(add(b.forward,mul(b.right,xx)),mul(b.up,yy));d.normalize();return d;}
function project(p){const b=cameraBasis(),r=sub(p,V(...camera)),depth=r.dot(b.forward);if(depth<=.04)return null;const h=previewViewport?.height||canvas.clientHeight,w=previewViewport?.width||canvas.clientWidth;return {x:w/2+r.dot(b.right)*heldFocus.focal*h/2/depth,y:h/2-r.dot(b.up)*heldFocus.focal*h/2/depth,depth};}
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
 if((multiSelection.length?multiSelection:selected?[selected.g]:[]).some(g=>g.parts.some(QBitsWorkshop.hasAdaptation))){announce('Retira las adaptaciones antes de duplicar: las reservas de mesa pertenecen a la pieza original.');return;}

 if(puzzleBlockedEdit())return;
 const hit=aimQubit()||selected;if(!hit){announce('Selecciona una figura para duplicarla con V.');return;}
 if(hit.g.parts.some(QBitsWorkshop.hasAdaptation)){announce('Retira las adaptaciones antes de duplicar: las reservas de mesa pertenecen a la pieza original.');return;}
 if(typeof rotorForGroup==='function'&&rotorForGroup(hit.g))return duplicateMechanism(hit.g);
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
 const info=panel.hidden&&menu.hidden&&commandMenu.hidden&&!marquee?(held||aimQubit(8,gameInputActive()?direction():hoverPointer?screenRay(hoverPointer.x,hoverPointer.y):V(0,1,0))):null;
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
 const expanded=add(size,V(.0009,.0009,.0009)),points=[];
 for(let i=0;i<edgeData.length;i+=6)points.push(add(p,q.vmult(V(edgeData[i]*expanded.x,edgeData[i+1]*expanded.y,edgeData[i+2]*expanded.z))));
 drawWideLines(points,[...(selectedOutline?visualRGB('outlineColor'):visuals.style==='cel'?[.06,.09,.1]:[.48,.51,.54]),alpha],selectedOutline?visuals.outlineWidth:visuals.style==='cel'?visuals.outlineWidth:1);
}
function drawUnitOutline(pose,alpha=.7,selectedOutline=true){
 if(!isTBit(pose)){drawOutline(pose.p,pose.q,V(CUBE_SIZE,CUBE_SIZE,CUBE_SIZE),alpha,selectedOutline);return;}
 const profile=unitProfile(pose),points=profile.edges.flatMap(edge=>edge.map(i=>add(pose.p,pose.q.vmult(mul(profile.vertices[i],1.008)))));
 drawWideLines(points,[...(selectedOutline?visualRGB('outlineColor'):[.1,.15,.16]),alpha],visuals.outlineWidth);
}
function selectionGroups(){return groups.filter(g=>multiSelection.includes(g)||selected?.g===g);}
function selectionHudSnapshot(team=selectionGroups()){
 return team.map(g=>{
  let geometry=selectionHudGeometry.get(g);
  if(!geometry||geometry.source!==g.parts){
   geometry={source:g.parts,parts:g.parts.map(p=>{const shape=unitShape(p),profile=unitProfile(p);return {id:p.id,p:[p.offset.x,p.offset.y,p.offset.z],q:[p.q.x,p.q.y,p.q.z,p.q.w],vertices:profile.vertices.map(v=>[v.x,v.y,v.z]),faces:profile.faces.map(face=>face.slice()),color:shape==='cube'?[.15,.18,.19]:shape==='coupler'?[.25,.30,.30]:[.48,.48,.48]};})};
   selectionHudGeometry.set(g,geometry);
  }
  const summary=moodSummary([g]),agitation=Math.max(0,...g.parts.map(p=>p.mood.agitation||0));
  return {id:g.body.id,name:g.parts[0].mood.name,count:g.parts.length,revision:g.parts.map(p=>p.id).join(','),parts:geometry.parts,mood:summary.counts.restless?'restless':summary.counts.excited?'excited':'neutral',energy:summary.energy,agitation,shaking:agitation>.65||speech.shake?.id===g.parts[0].id};
 });
}
function selectFromHud(id,{toggle=false}={}){
 const g=groups.find(item=>item.body.id===id);if(!g||story.transition||story.mode!=='playing')return false;
 if(toggle){const team=selectionGroups();multiSelection=team.includes(g)?team.filter(item=>item!==g):[...team,g];selected=multiSelection.length?{g:multiSelection[0],part:multiSelection[0].parts[0]}:null;}
 else {multiSelection=[g];selected={g,part:g.parts[0]};}
 selectedCargo=null;selectionHudStamp='';redraw=true;return true;
}
function initSelectionHud(){
 if(selectionHud||!window.QBitsSelectionHUD)return;
 selectionHud=window.QBitsSelectionHUD.create({root:document.querySelector('#selection-hud'),onSelect:selectFromHud});
 window.qbitsSelectionHud=selectionHud;
 selectionHud.setHint?.('Mantén '+inputLabel('hud')+' para elegir · Ctrl + clic para quitar');
}
function updateSelectionHud(dt){
 if(!selectionHud)return;
 const active=story.ready&&story.mode==='playing'&&!story.transition&&!document.hidden&&panel.hidden&&menu.hidden&&commandMenu.hidden&&!radialOpen();
 const team=active?selectionGroups():[],stamp=team.map(g=>g.body.id).join(',');selectionHudClock-=dt;
 if(stamp!==selectionHudStamp||selectionHudClock<=0){selectionHudStamp=stamp;selectionHudClock=.08;selectionHudItems=selectionHudSnapshot(team);}
 selectionHud.update(selectionHudItems,dt,{active,reducedMotion:!!reducedHudMotion?.matches});
}
function drawStructureOutlines(){
 gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
 const selectedGroups=selectionGroups();
 for(const g of groups){const chosen=selectedGroups.includes(g);
  if(g.block){const p=moodVisualPose(g,blockPose(g));drawOutline(p.p,p.q,p.size,.88,chosen);}
  else if(chosen||visuals.style==='cel')for(const pose of poses(g))drawUnitOutline(pose,.85,chosen);
  if(chosen&&visuals.markers){const bb=bounds(g);drawSelectionMarker(V(bb.center.x,bb.max.y+.025,bb.center.z),simTime);}
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
 if(job.cargo.job===job){job.activeCount=Math.min(job.activeCount,job.slots.reduce((n,s)=>n+groupWorkUnits(s.g),0));if(job.activeCount+1e-8<job.cargo.required)setCargoMoving(job.cargo,false);}
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
 for(const g of team){if(job.slots.some(s=>s.g===g)||!groups.includes(g)||rotorForGroup(g))continue;
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
 automationIntervention();
 if(!cargos.includes(c)||c.intake!==undefined&&c.intake!==null)return false;team=[...new Set(team.filter(g=>groups.includes(g)))];if(!team.length){announce('Selecciona primero los Q-bits que trabajarán.');return false;}
 stopHaul(c);const job={cargo:c,goal:goal.clone(),path:[],index:0,slots:[],activeCount:0,nextCrewPlan:0,phase:'planning',lastProgress:simTime,lastPosition:c.body.position.clone(),nextRouteCheck:0};c.job=job;c.pin={point:V(goal.x,0,goal.z),arrived:false};assignCrew(c,team);
 if(!job.slots.length){stopHaul(c,'Sin espacio para el equipo');announce('No hay espacio accesible para colocar el equipo.');return false;}
 c.lastStatus='Calculando recorrido';
 const search=scheduleNavigation(c,planCargoPath(c,job.goal,job.slots.map(s=>s.g)),path=>{
  c.pathSearch=null;
  if(!path||!job.slots.length){stopHaul(c,path?'Sin equipo':'Camino bloqueado');announce(path?'Selecciona de nuevo el equipo.':'El cuerpo no tiene un camino libre hasta ese punto.');return;}
  job.path=path;job.index=0;job.phase='reuniendo';job.nextRouteCheck=simTime+.5;
  for(const slot of job.slots)if(queueSpeech(slot.g,'order'))break;
  announce('Equipo asignado · '+job.slots.reduce((n,s)=>n+groupWorkUnits(s.g),0)+' / '+c.required+' Q-bits');
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
    const limit=groupWorkUnits(g)*5,magnitude=force.norm();if(magnitude>limit)force.scale(limit/magnitude,force);b.force.vadd(force,b.force);
   }
   slot.ready=!g.route&&distance<.18&&bb.min.y<.055; if(slot.ready)active+=groupWorkUnits(g);
  }
  job.activeCount=active;
  if(active+1e-8<c.required){setCargoMoving(c,false);job.phase=job.slots.some(s=>!groupWilling(s.g))?'descansando':'reuniendo';job.lastProgress=simTime;continue;}
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
 if(certifiedAutomation()){updateCargoPanel();return;}
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
 if(hudInputActive)return;
 if(radialOpen()){event.preventDefault();return;}
 if(event.button!==0&&event.button!==2)return;
 if(!storyActionAllowed())return;
 if(story.scene==='intro'&&event.button===2)return;
 event.preventDefault();speech.lastInput=simTime;
 if(pendingUnitCreation){
  if(!unitRadialAllowed()){cancelUnitCreation();return;}
  if(event.button===2){cancelUnitCreation();announce('Creación cancelada');return;}
  settings.unitShape=pendingUnitCreation;
  if(spawnQubit())clearSelection();
  return;
 }
 if((held?.reward||held?.latched)){releaseQubit(shiftDown());clearSelection();return;}
 if(event.button===2){if(marquee)finishMarquee(true);handleSecondary(event);return;}
 const hadSelection=selectedTeam().length>0;
 if(!menu.hidden||!commandMenu.hidden){closeDetachMenu(false);closeCommandMenu(false);}
 if(hadSelection){clearSelection();if(document.pointerLockElement===canvas&&!aimQubit()&&!aimCargo(3))startMarquee();return;}
 if(!gameInputActive())return;
 grabQubit();
}
function onCanvasMouseUp(event){
 if(hudInputActive)return;
 if(radialOpen()){event.preventDefault();return;}
 if(event.button!==0||held?.reward||held?.latched)return;
 if(marquee)finishMarquee();else releaseQubit(shiftDown());
}
function takeSelection(hit){
 const team=selectedTeam();if(!team.length||!canCarry(team)){announce('La selección supera la capacidad de agarre.');return;}
 const g=team.includes(hit.g)?hit.g:team[0],part=g===hit.g?hit.part:g.parts[0];
 pendingPickup={g,part,team:[...team]};
 if(gameInputActive())completePendingPickup();else captureMouse();
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
 const dir=gameInputActive()?direction():screenRay(clamp(event.clientX-rect.left,0,canvas.clientWidth),clamp(event.clientY-rect.top,0,canvas.clientHeight));
 if(openWorkshopMenu(dir)||openReconfigurationMenu(dir)||openProductionMenu(dir)||alphaSecondary(dir))return;
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
  if(QBitsWorkshop.partState(hit.part).sensor)items.unshift({label:'Sensor · conectar punta…',run:()=>showSensorMenu(hit)});
  const rotor=rotorForPart(hit.part.id)||rotorForGroup(hit.g);
  if(rotor){items.splice(items.findIndex(item=>item.label==='Guardar forma'),1);items.unshift({label:'Rotación…',run:()=>showRotorRotation(rotor,partPose(hit.g,hit.part).p)});items.push({label:'Guardar mecanismo · Rotor',run:()=>{saveMechanism(rotor);captureMouse();}},{label:'Separar enganches del rotor',run:()=>{disconnectRotor(rotor);captureMouse();}});}
  else if(hit.g.parts.some(part=>unitShape(part)==='coupler'))items.unshift({label:'Guardar mecanismo · Enganche',run:()=>{saveMechanism(hit.g);captureMouse();}},{label:'Enganche · une su punta con otra usando Shift',disabled:true,run:()=>{}});
  if(hit.g.parts.length>1)items.push({label:'Separar…',run:()=>openDetachMenu(hit)});
  items.push({label:'Deseleccionar',run:()=>{clearSelection();captureMouse();}});
  items.push({label:'Cerrar',run:()=>captureMouse()});openCommandMenu(partPose(hit.g,hit.part).p,rotor?'Rotor · lado '+(rotorGroups(rotor)[0]===hit.g?'A':'B'):count+' '+groupUnitLabel({parts:team.flatMap(g=>g.parts)}),items);return;
 }
 const point=floorAim(dir);if(point)openFloorOrders(point);
}

function selectedRotor(){return selected?.g?(rotorForPart(selected.part?.id)||rotorForGroup(selected.g)):null;}
function rotorMenuPoint(rotor){const members=rotorGroups(rotor);return members.length?members.reduce((v,g)=>add(v,mul(g.body.position,1/members.length)),V()):V(...camera);}
function showRotorRotation(rotor,point=rotorMenuPoint(rotor)){
 if(!rotors.includes(rotor)){announce('Ese rotor ya no está unido.');return;}
 const run=direction=>{const started=configureRotor(rotor,{direction,enabled:true});captureMouse();if(started)announce('Rotor · '+(direction===1?'horario':'antihorario')+' · '+rotor.rpm+' rpm · gira lado '+rotor.moving.toUpperCase());};
 openCommandMenu(point,'Rotor · Rotación · lado '+rotor.moving.toUpperCase()+(rotor.stalled?' · bloqueado':''),[
  {label:'Sentido horario',run:()=>run(1)},
  {label:'Sentido antihorario',run:()=>run(-1)},
  {label:'Detener rotación',run:()=>{configureRotor(rotor,{enabled:false});captureMouse();}},
  {label:'Elegir lado que gira…',run:()=>showRotorSide(rotor,point)},
  {label:'Motor · velocidad, fuerza y energía…',run:()=>{const g=rotorGroups(rotor)[rotor.moving==='a'?0:1],id=rotor.moving==='a'?rotor.aId:rotor.bId;selected={g,part:g.parts.find(p=>p.id===id)};panel.hidden=false;updatePanel();switchPanelTab('mechanisms');}},
  {label:'Guardar mecanismo · Rotor',run:()=>{saveMechanism(rotor);captureMouse();}},
  {label:'Cerrar',run:()=>captureMouse()}
 ]);
}
function showRotorSide(rotor,point=rotorMenuPoint(rotor)){
 openCommandMenu(point,'Elige el lado móvil · el otro será la base',[
  ...['a','b'].map(side=>({label:(rotor.moving===side?'✓ ':'')+'Girar lado '+side.toUpperCase(),run:()=>{configureRotor(rotor,{moving:side});showRotorRotation(rotor,point);}})),
  {label:'Volver a Rotación',run:()=>showRotorRotation(rotor,point)}
 ]);
}
function updateMechanismPanel(){
 const rotor=selectedRotor(),available=mechanismsAvailable(),rpm=rotor?.rpm??mechanismDefaults.rpm;
 document.querySelector('#mechanism-unlock').textContent=story.scene==='lab'?'Disponibles en el banco. En campaña: completa el nivel 5, La primera unión.':mechanismsUnlocked()?'Enganche y Rotor desbloqueados.':'Completa el nivel 5, La primera unión, para desbloquearlos en campaña.';
 document.querySelector('#rotor-status').textContent=rotor?'Rotor seleccionado · '+(rotor.stopReason?rotorStopLabel(rotor.stopReason):rotor.stalled?'atascado: revisa torque y espacio':rotor.enabled?'encendido':'detenido')+' · lado '+rotor.moving.toUpperCase()+' móvil'+(rotor.speedLimited?' · hasta '+Math.round(rotor.effectiveRpm)+' rpm para esta estructura':''):'Clic derecho sobre un rotor para seleccionarlo. También puedes crear uno aquí.';
 document.querySelector('#rotor-rpm').value=rpm;document.querySelector('#rotor-rpm-value').textContent=rpm+' rpm';
 document.querySelector('#rotor-side').value=rotor?.moving??mechanismDefaults.moving;
 document.querySelector('#rotor-mount').value=rotor?.mount??mechanismDefaults.mount;
 const torque=rotor?.maxTorque??mechanismDefaults.maxTorque,capacity=rotor?.capacity??mechanismDefaults.capacity;
 const tier=QBitsProgression.effectiveTier(Number(story.progress.torqueTier||1),story.progress),availableTier=QBitsProgression.availableTier(story.progress);
 document.querySelector('#rotor-tier-row').hidden=story.scene==='lab';document.querySelector('#rotor-tier').value=certifiedAutomation()?1:tier;document.querySelector('#rotor-tier').disabled=certifiedAutomation();
 for(const option of document.querySelector('#rotor-tier').children)option.disabled=Number(option.value)>availableTier;
 document.querySelector('#rotor-tier-status').textContent=story.scene==='lab'?'Banco libre · hasta 4 N·m':certifiedAutomation()?'Ensayo certificado · torque I, máximo 0,40 N·m':'Certificación '+tier+' · máximo '+campaignTorqueCap().toFixed(2)+' N·m. II: nivel 16; III: nivel 18.';
 document.querySelector('#rotor-torque').max=story.scene==='campaign'?campaignTorqueCap():4;
 document.querySelector('#rotor-torque').value=torque;document.querySelector('#rotor-torque-value').textContent=torque.toFixed(2)+' N·m';
 document.querySelector('#rotor-capacity').value=capacity;document.querySelector('#rotor-capacity-value').textContent=capacity+' u';
 document.querySelector('#rotor-power-readout').textContent=rotor?rotorPowerDescription(rotor):'Ajusta los valores de los próximos rotores o selecciona uno para ver su consumo y carga.';
 for(const id of ['rotor-clockwise','rotor-counterclockwise','rotor-stop','rotor-disconnect'])document.querySelector('#'+id).disabled=!rotor;
 document.querySelector('#rotor-save').disabled=!rotor&&!selected?.g?.parts.some(part=>unitShape(part)==='coupler');
 for(const id of ['create-coupler','create-rotor'])document.querySelector('#'+id).disabled=!available;
 const list=document.querySelector('#saved-mechanism-list');list.replaceChildren();
 for(const mechanism of savedMechanisms){
  const row=document.createElement('div'),create=document.createElement('button');create.type='button';create.textContent=mechanism.name+' · '+mechanismPartCount(mechanism)+' piezas';create.disabled=!available;
  create.addEventListener('click',()=>{if(!mechanismsAvailable())return;const p=floorAim()||V(position[0]-Math.sin(yaw)*1.4,0,position[2]-Math.cos(yaw)*1.4);if(spawnSavedMechanism(mechanism,p)){panel.hidden=true;captureMouse();}else announce('No hay espacio libre para el mecanismo.');});
  const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Eliminar '+mechanism.name);remove.addEventListener('click',()=>{savedMechanisms.splice(savedMechanisms.indexOf(mechanism),1);persistMechanisms();updateMechanismPanel();});row.append(create,remove);list.appendChild(row);
 }
}
function createMechanismChoice(kind){if(!mechanismsAvailable())return;settings.unitShape=kind;spawnQubit();updatePanel();}
document.querySelector('#create-coupler').addEventListener('click',()=>createMechanismChoice('coupler'));
document.querySelector('#create-rotor').addEventListener('click',()=>createMechanismChoice('rotor'));
document.querySelector('#rotor-tier').addEventListener('change',event=>{if(certifiedAutomation()){updateMechanismPanel();return;}const tier=QBitsProgression.effectiveTier(Number(event.target.value),story.progress);story.progress.torqueTier=tier;try{localStorage.setItem('qbits.campaign.v1',JSON.stringify(story.progress));}catch{}if(story.scene==='campaign'){for(const r of rotors)if(r.maxTorque>campaignTorqueCap())configureRotor(r,{maxTorque:campaignTorqueCap()});mechanismDefaults.maxTorque=Math.min(mechanismDefaults.maxTorque,campaignTorqueCap());}updateMechanismPanel();});
document.querySelector('#rotor-rpm').addEventListener('input',event=>{const value=Number(event.target.value);if(!Number.isFinite(value))return;mechanismDefaults.rpm=clamp(value,1,120);const rotor=selectedRotor();if(rotor)configureRotor(rotor,{rpm:mechanismDefaults.rpm});updateMechanismPanel();});
document.querySelector('#rotor-side').addEventListener('change',event=>{if(!['a','b'].includes(event.target.value))return;mechanismDefaults.moving=event.target.value;const rotor=selectedRotor();if(rotor)configureRotor(rotor,{moving:mechanismDefaults.moving});updateMechanismPanel();});
document.querySelector('#rotor-mount').addEventListener('change',event=>{if(!['wheel','fixed'].includes(event.target.value))return;mechanismDefaults.mount=event.target.value;const rotor=selectedRotor();if(rotor)configureRotor(rotor,{mount:mechanismDefaults.mount});updateMechanismPanel();});
for(const [id,field,min,max]of [['rotor-torque','maxTorque',.02,4],['rotor-capacity','capacity',2,128]])document.querySelector('#'+id).addEventListener('input',event=>{const value=Number(event.target.value);if(!Number.isFinite(value))return;mechanismDefaults[field]=clamp(value,min,max);const rotor=selectedRotor();if(rotor)configureRotor(rotor,{[field]:mechanismDefaults[field]});updateMechanismPanel();});
for(const [id,direction] of [['rotor-clockwise',1],['rotor-counterclockwise',-1]])document.querySelector('#'+id).addEventListener('click',()=>{const rotor=selectedRotor();if(rotor){mechanismDefaults.direction=direction;configureRotor(rotor,{direction,enabled:true});updateMechanismPanel();}});
document.querySelector('#rotor-stop').addEventListener('click',()=>{const rotor=selectedRotor();if(rotor)configureRotor(rotor,{enabled:false});updateMechanismPanel();});
document.querySelector('#rotor-save').addEventListener('click',()=>{const rotor=selectedRotor();if(rotor||selected?.g?.parts.some(part=>unitShape(part)==='coupler'))saveMechanism(rotor||selected.g);updateMechanismPanel();});
document.querySelector('#rotor-disconnect').addEventListener('click',()=>{const rotor=selectedRotor();if(rotor)disconnectRotor(rotor);updateMechanismPanel();});
document.querySelector('#export-mechanisms').addEventListener('click',()=>exportMechanisms());
document.querySelector('#import-mechanisms').addEventListener('change',async event=>{try{const file=event.target.files?.[0];if(!file)return;if(file.size>1000000)throw new Error('Archivo demasiado grande');const count=importMechanismsData(JSON.parse(await file.text()));announce(count+' mecanismos importados');updateMechanismPanel();}catch(error){announce('No se pudo importar: '+error.message);}event.target.value='';});

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
function switchPanelTab(name){for(const tab of ['cube','route','cargo','puzzle','alpha','mechanisms']){document.querySelector('#page-'+tab).hidden=tab!==name;document.querySelector('#tab-'+tab).setAttribute('aria-selected',String(tab===name));}}
function drawCargos(){
 for(const c of cargos){
  if(c.dimensions){drawMatter(c);continue;}
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);bindGeometry(shadowGeometry);gl.uniform1f(uniforms.uKind,2);const s=c.size*2;
  if(visuals.shadows==='sharp'){drawProjectedShadow(unitProfile('cube').vertices.map(p=>add(c.body.position,c.body.quaternion.vmult(mul(p,c.size/CUBE_SIZE)))));}else if(visuals.shadows!=='off'){setPose(V(c.body.position.x,.001,c.body.position.z),Q(),V(s,1,s));gl.uniform1f(uniforms.uScale,s);gl.uniform1f(uniforms.uShadow,.2);gl.drawArrays(gl.TRIANGLES,0,6);}
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
 const dir=gameInputActive()?direction():hoverPointer?screenRay(hoverPointer.x,hoverPointer.y):V(0,1,0),hit=aimCargo(8,dir);if(!hit){calloutState.cargo=null;return;}
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
function puzzleBlockedEdit(kind='edit'){if(certifiedAutomation()){announce('Ensayo certificado: usa las piezas del banco. Reinicia el nivel para restaurarlas.');return true;}if(kind==='mechanism'&&mechanismsAvailable())return false;if(story.ready&&story.scene==='campaign'&&panel.hidden){announce('La materia genera nuevos Q-bits. P abre el banco de herramientas de prueba.');return true;}if(!puzzle.active||kind==='qubit'&&alphaSettings.allowPuzzleSpawn)return false;announce('Puzle activo · los recursos se obtienen en los portales. P → Puzle para volver al banco.');return true;}
function saveLab(){return {mechanismDefaults:typeof mechanismDefaults==='undefined'?null:{...mechanismDefaults},rotors:serializeRotorState(),contacts:serializeContactState(),alphaScene:alphaSceneSnapshot(),settings:{...settings},moodSettings:{...moodSettings},position:[...position],yaw,pitch,groups:groups.map(g=>({parts:worldParts(g),q:g.body.quaternion.clone(),v:g.body.velocity.clone(),w:g.body.angularVelocity.clone()})),cargos:cargos.map(c=>({p:c.body.position.clone(),side:c.side,required:c.required,color:c.color}))};}
function clearPuzzleScene(){
 clearAlphaScene();releaseQubit();closeCommandMenu(false);closeDetachMenu(false);pendingCargo=null;moveChoice=null;routeInspection=null;multiSelection=[];selected=null;selectedCargo=null;
 for(const r of (typeof rotors==='undefined'?[]:[...rotors]))disconnectRotor(r);
 for(const c of [...cargos])deleteCargo(c,true);for(const g of [...groups])removeGroup(g);
 for(const wall of puzzle.walls)world.removeBody(wall.body);puzzle.walls=[];puzzle.portals=[];puzzle.buttons=[];puzzle.pendingRewards=0;
}
function puzzleWall(p,half,portal=null){
 const body=new CANNON.Body({mass:0});body.collisionFilterMask=-1;body.addShape(new CANNON.Box(half));body.position.copy(p);if(portal)body.collisionFilterGroup=1<<(portal.index+2);world.addBody(body);
 const wall={p,half,body,portal,min:sub(p,half),max:add(p,half)};puzzle.walls.push(wall);return wall;
}
function startPuzzle(){
 if(story.ready&&story.scene!=='lab')enterLab(false);
 if(!puzzle.active)puzzle.savedLab=saveLab();removeWorkshop();clearPuzzleScene();puzzle.active=true;puzzle.stage=0;puzzle.complete=false;puzzle.delivery=null;puzzle.earned=0;puzzle.run++;
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
 if(saved){Object.assign(settings,saved.settings);if(saved.moodSettings)Object.assign(moodSettings,saved.moodSettings);position.splice(0,3,...saved.position);yaw=saved.yaw;pitch=saved.pitch;camera.splice(0,3,...position);for(const g of saved.groups)makeGroup(g.parts,g.q,g.v,g.w);restoreLabMechanisms(saved);for(const c of saved.cargos)newCargo(c.p,c.side,c.required,c.color);}
 restoreAlphaScene(saved?.alphaScene);world.gravity.y=-settings.gravity;world.defaultContactMaterial.friction=settings.friction;world.defaultContactMaterial.restitution=settings.bounce;
 setupWorkshop();updatePuzzlePanel();updatePanel();announce('Banco de pruebas restaurado · mesa a la izquierda, E para adaptar');
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
 if(puzzle.delivery||!portalAccepts(p,c)||!c.job||c.job.activeCount+1e-8<c.required)return false;
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
 if(!puzzle.active||puzzle.pendingRewards<4||held||!gameInputActive()||!panel.hidden||!commandMenu.hidden||!menu.hidden)return false;
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
 if(!puzzle.active)return null;const d=gameInputActive()?direction():hoverPointer?screenRay(hoverPointer.x,hoverPointer.y):direction(),o=V(...camera);let best=Math.min(6,aimQubit(6,d)?.distance??6,raycastCargo(6,d)?.distance??6),found=null;
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
 return clamp(average,.5,1.16)*Math.min(...g.parts.map(p=>QBitsWorkshop.movementFactors(p).speed));
}
function crewMoodSpeed(c){const slots=c.job?.slots.filter(s=>s.ready&&groupWilling(s.g))||[];const count=slots.reduce((n,s)=>n+groupWorkUnits(s.g),0);return count?slots.reduce((n,s)=>n+moodSpeed(s.g)*groupWorkUnits(s.g),0)/count:1;}
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
  const effort=job?1+Math.min(1,job.cargo.required/Math.max(1,job.slots.reduce((n,s)=>n+groupWorkUnits(s.g),0)))*.65:1;
  for(const part of g.parts){const m=part.mood;if(m.production)continue;
   if(g.moodHadTask&&!task){m.calm=2;m.idle=0;m.fullTime=0;if(m.state!=='restless')m.state='neutral';}
   m.calm=Math.max(0,m.calm-dt);
   if(working&&moving){m.energy=clamp(m.energy-travel*moodSettings.drain*effort*QBitsWorkshop.movementFactors(part).energy*20/QBitsWorkshop.batteryCapacity(part)-dt*.0015*20/QBitsWorkshop.batteryCapacity(part),0,1);m.idle=0;m.boredOnce=false;}
   else if(!rotorForPart(part.id)?.powerActive)m.energy=clamp(m.energy+dt*moodSettings.recovery*(.9+.2*m.personality)*20/QBitsWorkshop.batteryCapacity(part),0,1);
   if(task||carried||duty||rotorForPart(part.id)?.powerActive){m.idle=0;m.boredOnce=false;}else m.idle+=dt;
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
function heldInspectionStrength(distance){
 const t=clamp((1.1-distance)/.7,0,1);return t*t*(3-2*t);
}
function syncHeldFocusHUD(){
 const visible=heldFocus.active&&heldFocus.target>.005&&heldFocus.amount>.015;
 const labels=document.querySelector('#mood-held-labels');labels.hidden=!visible;labels.style.opacity=String(visible?heldFocus.amount:0);
 for(const id of ['mood-energy-track','mood-energy-label']){
  const node=document.querySelector('#'+id);node.hidden=!!held&&!visible;node.style.opacity=String(held?(visible?heldFocus.amount:0):1);
 }
}
function updateHeldFocus(dt,enabled=true){
 heldFocus.active=!!(enabled&&held&&groups.includes(held.g)&&gameInputActive()&&!document.hidden&&!radialOpen()&&!storySuspended()&&!story.transition&&storyLookAllowed());
 let target=0;
 if(heldFocus.active){
  heldFocus.groups=(held.items||[held]).map(item=>item.g);
  const anchor=add(held.g.body.position,held.g.body.quaternion.vmult(held.anchor||V()));
  // A wheel target alone cannot reveal a distant piece obstructed by a wall.
  target=heldInspectionStrength(Math.max(held.distance,anchor.distanceTo(V(...camera))));
 }
 heldFocus.target=target;
 const previous=heldFocus.amount;heldFocus.amount+=(target-previous)*(1-Math.exp(-9*Math.max(0,Math.min(dt,.05))));
 if(heldFocus.amount<.0005&&target===0){heldFocus.amount=0;heldFocus.groups=[];}
 // 68° normally, 60° at close inspection and 58° inside Q. All projections agree.
 const previousMenu=menuFocus.amount,menuTarget=radialOpen()?1:0;menuFocus.amount+=(menuTarget-menuFocus.amount)*(1-Math.exp(-10*Math.max(0,Math.min(dt,.05))));if(menuTarget===0&&menuFocus.amount<.0005)menuFocus.amount=0;
 heldFocus.focal=1.48256097+(1/Math.tan(Math.PI/6)-1.48256097)*heldFocus.amount*(1-menuFocus.amount)+(1/Math.tan(29*Math.PI/180)-1.48256097)*menuFocus.amount;
 if(Math.abs(previousMenu-menuFocus.amount)>.000001)redraw=true;
 if(Math.abs(previous-heldFocus.amount)>.000001)redraw=true;
 syncHeldFocusHUD();
}
function updateMoodCallout(hit){
 syncHeldFocusHUD();
 const el=document.querySelector('#mood-callout');el.hidden=!hit;if(!hit)return;
 const part=hit.part||hit.g.parts[0],m=part.mood,summary=moodSummary([hit.g]);
 document.querySelector('#mood-unit-name').textContent=m.name;
 document.querySelector('#mood-state-description').textContent=moodName(m)+(m.reason?' · '+m.reason:'');
 const percent=Math.round(m.energy*100),bar=document.querySelector('#mood-energy-fill');bar.style.width=percent+'%';bar.style.background=moodCSS(m);document.querySelector('#mood-energy-track').setAttribute('aria-valuenow',String(percent));
 document.querySelector('#mood-energy-label').textContent='Energía '+percent+' %'+(m.state==='restless'?' · calma en ~'+Math.ceil(m.restLeft)+' s':'')+(hit.g.cooler?' · enfriando':'');
 const rotor=rotorForPart(part.id)||rotorForGroup(hit.g);
 document.querySelector('#mood-group-count').textContent=rotor?rotorPowerDescription(rotor,true):summary.total>1?summary.counts.neutral+' neutros · '+summary.counts.excited+' entusiasmados · '+summary.counts.restless+' inquietos':'';
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
  const pos=partPose(o.g,o.part).p,near=heldInspectionStrength(pos.distanceTo(V(...camera))),p=project(add(pos,V(0,.072,0)));if(!p||near<.005){label.hidden=true;continue;}label.style.opacity=String(near);
  label.style.left=p.x+'px';label.style.top=p.y+'px';label.style.color=moodCSS(o.part.mood);label.textContent=o.part.mood.name;label.style.backgroundImage='linear-gradient(to right,'+moodCSS(o.part.mood)+' '+Math.round(o.part.mood.energy*100)+'%,#aab3b333 '+Math.round(o.part.mood.energy*100)+'%)';label.title=moodName(o.part.mood);label.setAttribute('aria-label',moodName(o.part.mood)+', energía '+Math.round(o.part.mood.energy*100)+' por ciento');
 }
}
function updateMoodPanel(){
 for(const key of ['drain','recovery','idleSeconds']){document.querySelector('#mood-'+key).value=moodSettings[key];document.querySelector('#mood-'+key+'Value').textContent=key==='idleSeconds'?moodSettings[key]+' s':Math.round(moodSettings[key]*1000)/10+' % / '+(key==='drain'?'m':'s');}
 for(const key of ['tired','rested'])document.querySelector('#mood-test-'+key).disabled=!selected||puzzle.active||certifiedAutomation();
}
function testMood(tired){
 if(certifiedAutomation()){announce('La energía del ensayo solo se recupera con descanso.');return;}
 if(puzzle.active||!selected)return;const m=selected.part.mood;m.energy=tired?.01:1;m.agitation=tired?.75:0;m.state=tired?'restless':'neutral';m.reason=tired?'agotado':'';m.restLeft=tired?3:0;m.fullTime=0;m.calm=tired?0:1;updateMoodPanel();
}
for(const key of ['drain','recovery','idleSeconds'])document.querySelector('#mood-'+key).addEventListener('input',e=>{if(certifiedAutomation()){updateMoodPanel();return;}const value=Number(e.target.value);if(Number.isFinite(value))moodSettings[key]=clamp(value,...({drain:[.005,.08],recovery:[.02,.15],idleSeconds:[45,180]}[key]));updateMoodPanel();});
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
 if(certifiedAutomation()){announce('El ensayo usa las estaciones existentes.');return null;}
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
   for(const part of g.parts){seen.add(part.id);if(rotorForPart(part.id)?.powerActive)continue;let e=c.entries.get(part.id);if(!e){e={elapsed:0,done:false};c.entries.set(part.id,e);}const coolingSeconds=(c.coolSeconds||alphaSettings.coolSeconds)*QBitsWorkshop.batteryCapacity(part)/20;e.duration=coolingSeconds;e.elapsed=Math.min(coolingSeconds,e.elapsed+dt);
    const m=part.mood;m.coolProgress=e.elapsed/coolingSeconds;
    if(e.elapsed>=coolingSeconds){if(!e.done){m.energy=alphaSettings.exitEnergy;m.state='neutral';m.reason='';m.restLeft=0;m.agitation=0;m.strikes=0;m.severity=0;m.fullTime=0;m.calm=4;e.done=true;}m.energy=Math.min(m.energy,alphaSettings.exitEnergy);}
   }
  }
  for(const [id] of c.entries)if(!seen.has(id))c.entries.delete(id);c.occupants=count;
 }
}
// Mechanisms retain rigid-body boundaries and hinge endpoints separately from shapes.
// Older mechanism files omit drive limits. Missing fields receive the current
// defaults; explicitly supplied invalid fields must never be silently repaired.
function storedRotorDrive(config){return {mount:config.mount??'wheel',maxTorque:config.maxTorque??.4,capacity:config.capacity??16};}
function storedRotorOptionsValid(config){
 return !!config&&Number.isFinite(config.rpm)&&config.rpm>=1&&config.rpm<=120&&[1,-1].includes(config.direction)&&['a','b'].includes(config.moving)&&typeof config.enabled==='boolean'&&
  (config.mount===undefined||['wheel','fixed'].includes(config.mount))&&
  (config.maxTorque===undefined||Number.isFinite(config.maxTorque)&&config.maxTorque>=.02&&config.maxTorque<=4)&&
  (config.capacity===undefined||Number.isFinite(config.capacity)&&config.capacity>=2&&config.capacity<=128);
}
function serializeRotorState(){
 if(typeof rotors==='undefined')return [];
 return rotors.filter(r=>rotorGroups(r).every(g=>g&&groups.includes(g))).map(r=>({aId:r.aId,bId:r.bId,rpm:r.rpm,direction:r.direction,moving:r.moving,...storedRotorDrive(r),enabled:r.enabled}));
}
function restoreRotorState(data){
 if(typeof rotors==='undefined')return [];
 for(const r of [...rotors])disconnectRotor(r);
 if(!Array.isArray(data))return [];
 const made=[];
 for(const r of data){
  if(!storedRotorOptionsValid(r)||!Number.isSafeInteger(r.aId)||!Number.isSafeInteger(r.bId))continue;
  const a=rotorPart(r.aId),b=rotorPart(r.bId);
  if(a&&b&&a.g!==b.g){
   const at=couplerTip(a),bt=couplerTip(b),network=rotorConnectedGroups([b.g]);
   if(!network.includes(a.g)&&at.point.distanceTo(bt.point)<=.005&&at.axis.dot(bt.axis)<-.995){
    const turn=Q();turn.setFromVectors(bt.axis,mul(at.axis,-1));turn.normalize();
    for(const g of network){g.body.position.copy(add(at.point,turn.vmult(sub(g.body.position,bt.point))));g.body.quaternion.copy(turn.mult(g.body.quaternion));g.body.quaternion.normalize();g.body.velocity.copy(turn.vmult(g.body.velocity));g.body.angularVelocity.copy(turn.vmult(g.body.angularVelocity));g.body.aabbNeedsUpdate=true;}
   }
  }
  const rotor=connectRotorTips(r.aId,r.bId,{...r,...storedRotorDrive(r),enabled:false});if(rotor)made.push([rotor,r]);
 }
 for(const [r,state]of made)configureRotor(r,state);
 return made.map(([r])=>r);
}
function restoreLabMechanisms(saved){
 if(typeof mechanismDefaults!=='undefined'){
  const input=saved?.mechanismDefaults||{},defaults={rpm:30,direction:1,moving:'b',mount:'wheel',maxTorque:.4,capacity:16};
  // Only documented controls are restored. A damaged snapshot cannot inject
  // arbitrary keys, non-finite forces or a locked/unsupported mounting mode.
  for(const key of Object.keys(defaults)){
   const candidate={...defaults,[key]:input[key]??defaults[key],enabled:false};
   mechanismDefaults[key]=storedRotorOptionsValid(candidate)?candidate[key]:defaults[key];
  }
 }
 const restored=restoreRotorState(saved?.rotors);restoreContactState(saved?.contacts);return restored;
}
function mechanismGroups(subject){
 if(typeof rotors==='undefined')return [];
 const first=rotors.includes(subject)?rotorGroups(subject):subject?.parts?[subject]:[];
 const connected=new Set(first.filter(g=>g&&groups.includes(g)));let changed=true;
 while(changed){changed=false;for(const r of rotors){const pair=rotorGroups(r);if(pair.some(g=>!g||!groups.includes(g))||!pair.some(g=>connected.has(g)))continue;for(const g of pair)if(!connected.has(g)){connected.add(g);changed=true;}}}
 return [...connected];
}
function mechanismPartCount(record){return Array.isArray(record?.groups)?record.groups.reduce((n,g)=>n+(Array.isArray(g?.parts)?g.parts.length:0),0):0;}
function mechanismRecordParts(record,origin=V()){
 return record.groups.map(group=>group.parts.map(part=>{const q=Q();q.set(...part.q);q.normalize();return {key:part.key,shape:part.shape,weight:part.weight,p:add(origin,V(...part.p)),q};}));
}
function savedMechanismValid(record){
 try{
  if(!record||record.version!==1||!['rotor','coupler'].includes(record.type)||typeof record.name!=='string'||!record.name.trim()||record.name.length>40||/[\u0000-\u001f]/.test(record.name))return false;
  if(!Array.isArray(record.groups)||record.groups.length<1||record.groups.length>MAX_QUBITS||!Array.isArray(record.joints)||record.joints.length>=record.groups.length)return false;
  if(record.type==='coupler'&&(record.groups.length!==1||record.joints.length!==0)||record.type==='rotor'&&(record.groups.length<2||!record.joints.length))return false;
  const keys=new Map(),owners=new Map();let count=0;
  for(const [groupIndex,group]of record.groups.entries()){
   if(!Array.isArray(group?.parts)||!group.parts.length)return false;
   for(const part of group.parts){
    if(++count>MAX_QUBITS||!part||!Number.isSafeInteger(part.key)||part.key<0||part.key>=MAX_QUBITS||keys.has(part.key)||!['cube','tetra','pyramid','coupler'].includes(part.shape))return false;
    if(!Number.isFinite(part.weight)||part.weight<(part.shape==='tetra'?.25/12:part.shape==='pyramid'?.25/6:.25)-1e-9||part.weight>3||!Array.isArray(part.p)||part.p.length!==3||!part.p.every(n=>Number.isFinite(n)&&Math.abs(n)<14)||!Array.isArray(part.q)||part.q.length!==4||!part.q.every(Number.isFinite)||Math.abs(Math.hypot(...part.q)-1)>.0001)return false;
    keys.set(part.key,part);owners.set(part.key,groupIndex);
   }
  }
  if(![...keys.values()].some(part=>part.shape==='coupler'))return false;
  const powered=record.joints.filter(j=>j?.enabled===true);if(powered.length>1&&powered.some(j=>j.mount==='fixed'))return false;
  const attached=new Set(),graph=record.groups.map(()=>new Set()),parents=record.groups.map((_,i)=>i),root=i=>parents[i]===i?i:parents[i]=root(parents[i]);
  for(const joint of record.joints){
   if(!joint||!Number.isSafeInteger(joint.a)||!Number.isSafeInteger(joint.b)||joint.a===joint.b||keys.get(joint.a)?.shape!=='coupler'||keys.get(joint.b)?.shape!=='coupler'||owners.get(joint.a)===owners.get(joint.b)||attached.has(joint.a)||attached.has(joint.b))return false;
   if(!storedRotorOptionsValid(joint))return false;
   const a=owners.get(joint.a),b=owners.get(joint.b);if(root(a)===root(b))return false;parents[root(a)]=root(b);graph[a].add(b);graph[b].add(a);attached.add(joint.a);attached.add(joint.b);
  }
  const reached=new Set([0]),queue=[0];for(let i=0;i<queue.length;i++)for(const n of graph[queue[i]])if(!reached.has(n)){reached.add(n);queue.push(n);}
  if(reached.size!==record.groups.length||typeof couplerTip!=='function')return false;
  const rigid=mechanismRecordParts(record),all=rigid.flat(),byKey=new Map(all.map(part=>[part.key,part]));
  if(!rigid.every(assemblyValid))return false;
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)if(obbOverlap(all[i],all[j],.00001))return false;
  for(const joint of record.joints){const a=couplerTip(byKey.get(joint.a)),b=couplerTip(byKey.get(joint.b));if(a.point.distanceTo(b.point)>.002||a.axis.dot(b.axis)>-.995)return false;}
  return true;
 }catch{return false;}
}
function copySavedMechanism(record){
 return {version:1,type:record.type,name:record.name,groups:record.groups.map(g=>({parts:g.parts.map(p=>({key:p.key,shape:p.shape,weight:p.weight,p:[...p.p],q:[...p.q]}))})),joints:record.joints.map(j=>({a:j.a,b:j.b,rpm:j.rpm,direction:j.direction,moving:j.moving,...storedRotorDrive(j),enabled:j.enabled}))};
}
function alignMechanismSnapshot(record){
 // A live hinge solver may leave millimetres of drift. Canonicalize only this
 // saved copy; imports stay strict and live bodies are never repositioned here.
 if(!record.joints.length)return true;
 const rigid=mechanismRecordParts(record),parts=new Map(),owners=new Map();
 rigid.forEach((group,i)=>group.forEach(part=>{parts.set(part.key,part);owners.set(part.key,i);}));
 const reached=new Set([0]);let changed=true;
 while(changed){changed=false;for(const joint of record.joints){
  const ai=owners.get(joint.a),bi=owners.get(joint.b),knownA=reached.has(ai),knownB=reached.has(bi);
  if(knownA===knownB)continue;
  const parent=parts.get(knownA?joint.a:joint.b),child=parts.get(knownA?joint.b:joint.a),index=knownA?bi:ai;
  const a=couplerTip(parent),b=couplerTip(child);
  if(a.point.distanceTo(b.point)>.005||a.axis.dot(b.axis)>-.995)return false;
  const rotation=Q();rotation.setFromVectors(b.axis,mul(a.axis,-1));rotation.normalize();
  for(const part of rigid[index]){part.p=add(a.point,rotation.vmult(sub(part.p,b.point)));part.q=rotation.mult(part.q);part.q.normalize();}
  reached.add(index);changed=true;
 }}
 if(reached.size!==rigid.length)return false;
 const minY=Math.min(...rigid.flat().flatMap(corners).map(v=>v.y));
 for(const group of record.groups)for(const part of group.parts){const pose=parts.get(part.key);part.p=[pose.p.x,pose.p.y-minY,pose.p.z].map(n=>+n.toFixed(8));part.q=[pose.q.x,pose.q.y,pose.q.z,pose.q.w].map(n=>+n.toFixed(10));}
 return true;
}
function mechanismSnapshot(subject,name=null){
 const connected=mechanismGroups(subject);if(!connected.length||!connected.some(g=>g.parts.some(p=>p.shape==='coupler')))return null;
 const linked=rotors.filter(r=>rotorGroups(r).every(g=>connected.includes(g)));
 const type=linked.length?'rotor':'coupler',defaultName=linked.length?'Rotor':'Enganche';
 const min=V(Infinity,Infinity,Infinity),max=V(-Infinity,-Infinity,-Infinity);
 for(const g of connected){const box=bounds(g);for(const axis of ['x','y','z']){min[axis]=Math.min(min[axis],box.min[axis]);max[axis]=Math.max(max[axis],box.max[axis]);}}
 const origin=V((min.x+max.x)/2,min.y,(min.z+max.z)/2),keys=new Map();let key=0;
 const record={version:1,type,name:String(name||defaultName).replace(/[\u0000-\u001f]/g,'').trim().slice(0,40)||defaultName,groups:connected.map(g=>({parts:worldParts(g).map(p=>{const current=key++;keys.set(p.id,current);return {key:current,shape:p.shape,weight:p.weight,p:[p.p.x-origin.x,p.p.y-origin.y,p.p.z-origin.z].map(n=>+n.toFixed(8)),q:[p.q.x,p.q.y,p.q.z,p.q.w].map(n=>+n.toFixed(10))};})})),joints:linked.map(r=>({a:keys.get(r.aId),b:keys.get(r.bId),rpm:r.rpm,direction:r.direction,moving:r.moving,...storedRotorDrive(r),enabled:r.enabled}))};
 return alignMechanismSnapshot(record)&&savedMechanismValid(record)?record:null;
}
function loadSavedMechanisms(){
 try{const data=JSON.parse(window.localStorage.getItem('qbits.mechanisms.v1')||'[]');if(Array.isArray(data))savedMechanisms.push(...data.slice(0,32).filter(savedMechanismValid).map(copySavedMechanism));}catch{}
}
function persistMechanisms(){
 try{window.localStorage.setItem('qbits.mechanisms.v1',JSON.stringify(savedMechanisms));return true;}catch{announce('Mecanismo guardado en esta sesión · expórtalo para conservarlo');return false;}
}
function saveMechanism(subject,name=null){
 if(mechanismGroups(subject).some(g=>g.parts.some(QBitsWorkshop.hasAdaptation))){announce('Retira las adaptaciones antes de guardar el montaje. La investigación permanece disponible.');return null;}

 if(savedMechanisms.length>=32){announce('Hay 32 mecanismos guardados. Exporta o elimina uno antes de añadir otro.');return null;}
 const record=mechanismSnapshot(subject,name);if(!record){announce('No se puede guardar: revisa el encaje de las puntas del rotor.');return null;}
 savedMechanisms.push(record);const durable=persistMechanisms();updateAlphaPanel();announce(record.name+' guardado · '+mechanismPartCount(record)+' piezas'+(durable?'':' · solo en esta sesión'));return record;
}
function spawnSavedMechanism(record,point){
 automationIntervention();
 if(puzzleBlockedEdit('mechanism')||typeof mechanismsAvailable==='function'&&!mechanismsAvailable())return null;
 if(!savedMechanismValid(record)||!point||![point.x,point.y,point.z].every(Number.isFinite)){announce('El mecanismo guardado no es válido.');return null;}
 if(story.scene==='campaign'&&record.groups.some(group=>group.parts.some(part=>part.shape!=='coupler'))){announce('Los mecanismos con Q-bits o T-bits añadidos se crean solo en el banco de pruebas. En campaña, monta esas piezas con los recursos del nivel.');return null;}
 const count=mechanismPartCount(record);if(groups.reduce((sum,g)=>sum+g.parts.length,0)+count>MAX_QUBITS){announce('Máximo de '+MAX_QUBITS+' piezas en la sala.');return null;}
 const data=mechanismRecordParts(record,V(point.x,point.y+.003,point.z)),ids=new Map(),made=[],joints=[];
 try{
  for(const parts of data){const created=parts.map(part=>{const id=typeof allocateUnitId==='function'?allocateUnitId():++serial;ids.set(part.key,id);return {id,shape:part.shape,weight:part.weight,p:part.p,q:part.q};});made.push(makeGroup(created));}
  if(made.some(g=>!validPose(g,g.body.position,g.body.quaternion,made)))throw new Error('No hay espacio libre para el mecanismo.');
  for(const joint of record.joints){const rotor=connectRotorTips(ids.get(joint.a),ids.get(joint.b),{...joint,...storedRotorDrive(joint),enabled:false});if(!rotor)throw new Error('Las puntas del mecanismo ya no encajan.');joints.push(rotor);}
  for(let i=0;i<joints.length;i++)configureRotor(joints[i],record.joints[i]);
  multiSelection=made;selected={g:made[0],part:made[0].parts[0]};announce(record.name+' creado · '+count+' piezas');return joints[0]||made[0];
 }catch(error){
  for(const rotor of joints)disconnectRotor(rotor);for(const g of made)removeGroup(g);refreshRotors();announce(error.message||'No se pudo crear el mecanismo.');return null;
 }
}
function duplicateMechanism(subject){
 if(mechanismGroups(subject).some(g=>g.parts.some(QBitsWorkshop.hasAdaptation))){announce('Retira las adaptaciones antes de duplicar el mecanismo.');return null;}

 const record=mechanismSnapshot(subject);if(!record){announce('No se puede duplicar este mecanismo hasta ajustar sus puntas.');return null;}
 if(groups.reduce((sum,g)=>sum+g.parts.length,0)+mechanismPartCount(record)>MAX_QUBITS){announce('No caben más copias: límite de '+MAX_QUBITS+' piezas.');return null;}
 const vertices=mechanismRecordParts(record).flat().flatMap(corners),spacing=Math.max(...['x','z'].map(axis=>Math.max(...vertices.map(v=>v[axis]))-Math.min(...vertices.map(v=>v[axis]))))+.18;
 for(let row=0;row<5;row++)for(const col of [0,1,-1,2,-2]){
  const point=V(position[0]-Math.sin(yaw)*(1.2+row*spacing)+Math.cos(yaw)*col*spacing,0,position[2]-Math.cos(yaw)*(1.2+row*spacing)-Math.sin(yaw)*col*spacing);
  const rotor=spawnSavedMechanism(record,point);if(rotor)return mechanismGroups(rotor);
 }
 announce('No hay espacio libre delante para la copia del rotor.');return null;
}
function mechanismsExportData(){return {version:1,mechanisms:savedMechanisms.map(copySavedMechanism)};}
function exportMechanisms(){const blob=new Blob([JSON.stringify(mechanismsExportData(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Q-bits_mecanismos.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function importMechanismsData(data){
 const input=data?.version===1?data.mechanisms:null;
 if(!Array.isArray(input)||input.length>32||!input.every(savedMechanismValid))throw new Error('Archivo de mecanismos inválido');
 const normalized=input.map(copySavedMechanism);savedMechanisms.splice(0,savedMechanisms.length,...normalized);persistMechanisms();updateAlphaPanel();return normalized.length;
}

function savedShapeValid(shape){return shape&&typeof shape.name==='string'&&shape.name.length<=40&&Array.isArray(shape.parts)&&shape.parts.length>0&&shape.parts.length<=MAX_QUBITS&&shape.parts.every(p=>(p.shape===undefined||['cube','tetra','pyramid','coupler'].includes(p.shape))&&Array.isArray(p.p)&&p.p.length===3&&p.p.every(Number.isFinite)&&p.p.every(n=>Math.abs(n)<6)&&Array.isArray(p.q)&&p.q.length===4&&p.q.every(Number.isFinite)&&Math.abs(Math.hypot(...p.q)-1)<.01);}
function loadSavedShapes(){try{const list=JSON.parse(readQbitsStorage('qbits.shapes.v1')||'[]');if(Array.isArray(list))savedShapes.push(...list.filter(savedShapeValid).slice(0,32));}catch{} }
function persistShapes(){try{window.localStorage.setItem('qbits.shapes.v1',JSON.stringify(savedShapes));return true;}catch{announce('Forma guardada en esta sesión · Exportar formas permite conservar una copia.');return false;}}
function saveShape(g){
 if(g&&typeof rotorForGroup==='function'&&rotorForGroup(g))return saveMechanism(g);
 if(!g||!groups.includes(g))return;if(savedShapes.length>=32){announce('Hay 32 formas guardadas. Exporta o elimina una antes de añadir otra.');return;}
 if(!assemblyValid(poses(g))){announce('Esta forma tiene caras incompatibles. Desármala y vuelve a encajar las piezas.');return;}
 const bb=bounds(g,V(),Q()),origin=V(bb.center.x,bb.min.y,bb.center.z),shape={name:'Forma '+(savedShapes.length+1),geometryVersion:3,parts:poses(g,V(),Q()).map(o=>({shape:normalizeUnitShape(o.part.shape),p:[o.p.x-origin.x,o.p.y-origin.y,o.p.z-origin.z].map(n=>+n.toFixed(5)),q:[o.q.x,o.q.y,o.q.z,o.q.w].map(n=>+n.toFixed(7))}))};
 savedShapes.push(shape);const durable=persistShapes();updateAlphaPanel();announce(shape.name+' guardada · '+shape.parts.length+' unidades'+(durable?'':' · solo en esta sesión; exporta una copia'));
}
function blueprintTargets(bp){return bp.shape.parts.map(part=>{const q=Q();q.set(...part.q);return {shape:normalizeUnitShape(part.shape),p:add(bp.p,bp.q.vmult(V(...part.p))),q:bp.q.mult(q)};}).sort((a,b)=>a.p.y-b.p.y||a.p.x-b.p.x||a.p.z-b.p.z);}
function blueprintBox(bp){const pts=blueprintTargets(bp).flatMap(corners),min=V(Infinity,Infinity,Infinity),max=V(-Infinity,-Infinity,-Infinity);for(const p of pts)for(const k of ['x','y','z']){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}return {...alphaBox(mul(add(min,max),.5),mul(sub(max,min),.5)),size:sub(max,min)};}
function placeBlueprint(shape,p){
 automationIntervention();
 if(!savedShapeValid(shape)||!p||blueprints.length>=6){announce('No se puede colocar otro blueprint aquí.');return null;}
 const bp={id:++alphaSerial,shape:JSON.parse(JSON.stringify(shape)),p:V(p.x,.002,p.z),q:Q(),slots:[],active:false,nextScan:0,status:'Esperando unidades'};const box=blueprintBox(bp);
 if(!assemblyValid(blueprintTargets(bp))){announce('La forma guardada tiene caras incompatibles con las medidas actuales. Se conserva para exportarla; vuelve a armarla.');return null;}
 if(box.min.y<-.001||box.max.y>ROOM_HEIGHT||Math.max(Math.abs(box.min.x),Math.abs(box.max.x),Math.abs(box.min.z),Math.abs(box.max.z))>13.85||cargos.some(c=>obbOverlap(box,cargoPose(c)))||puzzleObstacleBounds().some(w=>obbOverlap(box,{p:w.p,q:Q(),half:w.half}))||alphaObstacles().some(w=>obbOverlap(box,w))||blueprints.some(other=>obbOverlap(box,blueprintBox(other)))){announce('La forma necesita más espacio libre.');return null;}
 blueprints.push(bp);announce(shape.name+' · clic derecho en el blueprint para integrar');return bp;
}
function nearBlueprint(bp){const used=new Set(bp.slots.map(s=>s.index)),needed=new Set(blueprintTargets(bp).filter((_,i)=>!used.has(i)).map(t=>t.shape));return groups.filter(g=>g.parts.length===1&&!(typeof rotorForGroup==='function'&&rotorForGroup(g))&&needed.has(normalizeUnitShape(g.parts[0].shape))&&!g.route&&!g.pendingMoodOrder&&!g.haulJob&&!g.blueprintJob&&!g.cooler&&!(held?.items||[]).some(i=>i.g===g)&&groupWilling(g)&&bounds(g).min.y<.03&&Math.hypot(g.body.position.x-bp.p.x,g.body.position.z-bp.p.z)<=alphaSettings.blueprintRange).sort((a,b)=>a.body.position.distanceTo(bp.p)-b.body.position.distanceTo(bp.p));}
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
  if(done===targets.length){const parts=bp.slots.flatMap(s=>worldParts(s.g));
   if(!assemblyValid(parts)){cancelBlueprint(bp);announce('Montaje cancelado: las caras ya no coinciden. Las piezas se mantienen separadas.');continue;}
   for(const s of bp.slots){s.g.blueprintJob=null;removeGroup(s.g);}const g=makeGroup(parts,bp.q);blueprints.splice(blueprints.indexOf(bp),1);selected={g,part:g.parts[0]};multiSelection=[g];queueSpeech(g,'happy',{kind:'built'});announce(bp.shape.name+' construida · '+parts.length+' unidades');}
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
 let qCount=0,tCount=0,mCount=0,rCount=0;for(const g of groups)for(const part of g.parts){if(part.mood.production){rCount++;continue;}if(unitShape(part)==='coupler')mCount++;else if(isTBit(part))tCount++;else qCount++;}
 document.querySelector('#alpha-census-text').textContent='× '+qCount+' Q'+(tCount?' · '+tCount+' T':'')+(mCount?' · '+mCount+' M':'')+(rCount?' · '+rCount+' bloques de materia':'');
 if(!panel.hidden||!commandMenu.hidden||held)return;const h=alphaHit(5);if(!h)return;
 if(h.bp)targetLabel.textContent=h.bp.shape.name+' · '+h.bp.status+' · clic derecho';
 if(h.cooler){const c=h.cooler,values=[...c.entries.values()],remaining=values.length?Math.ceil(Math.max(0,...values.map(v=>(v.duration||c.coolSeconds||alphaSettings.coolSeconds)-v.elapsed))):c.coolSeconds||alphaSettings.coolSeconds;targetLabel.textContent='Enfriador · '+c.occupants+'/'+c.capacity+' · '+(!c.enabled||!alphaSettings.coolingOn?'apagado':values.length&&remaining===0?'listos · energía '+Math.round(alphaSettings.exitEnergy*100)+' %':remaining+' s');}
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
 color=visualRGB('pathColor');
 if(!points.length)return;gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
 for(let i=0;i+1<points.length;i+=2){const a=points[i],b=points[i+1],d=sub(b,a),length=Math.hypot(d.x,d.z);if(length<.001)continue;const q=Q();q.setFromAxisAngle(V(0,1,0),Math.atan2(d.x,d.z));const center=mul(add(a,b),.5);center.y=Math.max(.006,center.y);
  bindGeometry(cubeGeometry);gl.uniform1f(uniforms.uKind,8);setPose(center,q,V(.025*visuals.pathWidth,.001,length));tint(...color,.22*alphaSettings.glow);gl.drawArrays(gl.TRIANGLES,0,36);drawBox(add(center,V(0,.001,0)),q,V(.0015*visuals.pathWidth,.001,length),[...color,.8]);
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
loadSavedShapes();loadSavedMechanisms();
document.querySelector('#rename-qubit').addEventListener('click',renameQubit);
document.querySelector('#save-shape').addEventListener('click',()=>saveShape(selected?.g));
document.querySelector('#place-cooler').addEventListener('click',()=>{const p=floorAim()||V(position[0]-Math.sin(yaw)*1.3,0,position[2]-Math.cos(yaw)*1.3);createCooler(p);});
document.querySelector('#export-shapes').addEventListener('click',exportShapes);
document.querySelector('#import-shapes').addEventListener('change',async e=>{try{const file=e.target.files?.[0];if(!file)return;if(file.size>1000000)throw new Error('Archivo demasiado grande');const count=importShapesData(JSON.parse(await file.text()));announce(count+' formas importadas');}catch(error){announce('No se pudo importar: '+error.message);}e.target.value='';});
for(const key of ['maxRest','coolSeconds','capacity','blueprintRange','exitEnergy','glow'])document.querySelector('#alpha-'+key).addEventListener('input',e=>{if(certifiedAutomation()){updateAlphaPanel();return;}const n=Number(e.target.value),ranges={maxRest:[15,180],coolSeconds:[5,60],capacity:[1,8],blueprintRange:[.5,3],exitEnergy:[.25,.75],glow:[0,1]};if(Number.isFinite(n))alphaSettings[key]=clamp(n,...ranges[key]);updateAlphaPanel();});
for(const key of ['coolingOn','allowPuzzleSpawn'])document.querySelector('#alpha-'+key).addEventListener('change',e=>{if(certifiedAutomation()){updateAlphaPanel();return;}alphaSettings[key]=!!e.target.checked;updatePuzzlePanel();updateAlphaPanel();});
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
 for(const p of g.parts){if(p.mood.production)continue;let s=speech.people.get(p.id);if(!s){s={id:p.id,next:simTime+26+Math.random()*24,last:-100,lastEvent:Object.create(null),recent:[],closeDwell:0,lastClose:-100,inspectArmed:true,inspectAway:8,state:p.mood.state,cooling:false,blocked:false,resting:false,lastTask:false,wasNearby:false,alone:0};speech.people.set(p.id,s);}s.g=g;s.part=p;}
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
  if(slot.sizeDirty||slot.viewportWidth!==w||slot.viewportHeight!==h){slot.w=slot.node.offsetWidth;slot.h=slot.node.offsetHeight;slot.viewportWidth=w;slot.viewportHeight=h;slot.sizeDirty=false;}
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
function gameMode(mode){if(mode!=='playing')closeUnitRadial(false);story.mode=mode;window.QBitsMusic?.setPaused(!['playing','menu','levels','codex','settings'].includes(mode));document.body.dataset.gameMode=mode;for(const [key,el] of [['menu',ui.main],['pause',ui.pause],['levels',ui.levels],['complete',ui.complete],['codex',document.querySelector('#codex-screen')]])el.hidden=mode!==key;document.querySelector('#pause-button').hidden=mode!=='playing';hint.hidden=true;redraw=true;}
function gameScene(scene){story.scene=scene;document.body.dataset.gameScene=scene;const label=document.querySelector('#chapter-label');label.hidden=scene==='lab';document.querySelector('#chapter-number').textContent=scene==='intro'?'PRÓLOGO / 00':'NIVEL / '+String(story.level||1).padStart(2,'0');document.querySelector('#chapter-name').textContent=scene==='intro'?'El primer encuentro':chapters[story.level||1][1];}
function storySuspended(){return radialOpen()||story.ready&&(story.mode!=='playing'||!panel.hidden||document.hidden);}
function storyWalkAllowed(){return !story.ready||story.scene!=='intro'||['deliver','cooling','cooled','choice','repeat'].includes(story.phase);}
function storyLookAllowed(){return !story.ready||story.mode==='playing'&&!['asleep','invocation','opening'].includes(story.phase);}
function storyActionAllowed(){return !story.ready||story.mode==='playing'&&!story.transition&&!encounterLocksActions()&&(story.scene!=='intro'||['pickup','carry','deliver','cooling','cooled'].includes(story.phase));}
function storyObjective(text){ui.objective.textContent=text;ui.objective.hidden=!text;}
function say(text,{after=null,hold=false,mysterious=false,choices=null,onComplete=null}={}){
 ui.dialogue.style.opacity='1';
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
function showWakeButton(){
 if(story.scene!=='intro'||story.mode!=='playing'||story.phase!=='asleep'||story.transition||story.phaseTime<5.1)return;
 const screen=document.querySelector('#wake-screen'),button=document.querySelector('#wake-button');
 const wasDisabled=button.disabled||screen.hidden,t=clamp((story.phaseTime-5.1)/1.6,0,1);
 screen.hidden=false;screen.style.opacity=String(t*t*(3-2*t));button.disabled=t<1;
 if(t===1&&wasDisabled){button.focus({preventScroll:true});story.intentionalUnlock=true;pause(false);}
}
function wakeUp(){
 if(story.scene!=='intro'||story.mode!=='playing'||story.phase!=='asleep'||story.phaseTime<6.7||story.transition||!panel.hidden||document.hidden)return;
 document.querySelector('#wake-screen').hidden=true;story.phase='opening';story.phaseTime=0;hideStoryDialogue();captureMouse();
}
function beginCreationNarration(){
 // The opening lines play in darkness. The player's gesture creates the light.
 story.phase='invocation';document.querySelector('#wake-screen').hidden=true;document.querySelector('#wake-screen').style.opacity='0';document.querySelector('#wake-button').disabled=true;
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
 workshopBench=null;contactStates.clear();rotorContactStates.clear();
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
 if(story.scene==='lab'){setupWorkshop();gameMode('playing');panel.hidden=true;if(capture)captureMouse();return;}
 clearNarrativeScene();gameScene('lab');gameMode('playing');story.started=true;const saved=story.lab;
 if(saved){Object.assign(settings,saved.settings);Object.assign(moodSettings,saved.moodSettings||{});Object.assign(alphaSettings,story.labAlpha||{});position.splice(0,3,...saved.position);yaw=saved.yaw;pitch=saved.pitch;camera.splice(0,3,...position);for(const g of saved.groups)makeGroup(g.parts,g.q,g.v,g.w);restoreLabMechanisms(saved);for(const c of saved.cargos)newCargo(c.p,c.side,c.required,c.color);restoreAlphaScene(saved.alphaScene);}else addQubit([0,HALF+.003,0]);
 world.gravity.y=-settings.gravity;world.defaultContactMaterial.friction=settings.friction;world.defaultContactMaterial.restitution=settings.bounce;world.broadphase.dirty=true;ui.veil.style.opacity='0';setupWorkshop();updatePanel();if(capture)captureMouse();
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
  if(story.mode==='codex'){closeCodex();return true;}if(story.mode==='levels'){backFromLevels();return true;}if(story.mode==='pause'){resumeGame();return true;}if(story.mode==='playing'){if(!commandMenu.hidden){closeCommandMenu(true);return true;}if(!menu.hidden){closeDetachMenu(true);return true;}openPauseMenu();return true;}return true;
 }
 if(editing)return false;if(event.code==='KeyJ'&&!event.repeat&&panel.hidden){event.preventDefault();if(story.mode==='codex')closeCodex();else if(story.mode==='playing')showCodex();return true;}if(story.mode!=='playing'||story.transition)return true;
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
  if(story.phase==='asleep'){
   if(story.dialogue){const fade=clamp((story.phaseTime-1.4)/1.2,0,1);ui.dialogue.style.opacity=String(1-fade*fade*(3-2*fade));if(fade===1)hideStoryDialogue();}
   showWakeButton();
  }
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
 if(story.scene==='campaign'){tickBlockTwo(dt);tickReconfiguration(dt);if(!story.encounter)tickCampaign(dt);}
}
function updateStoryMarker(){
 updateCampaignLabels();layoutEncounterBubbles();ui.marker.hidden=true;if(story.mode!=='playing'||!panel.hidden||story.transition)return;
 let point=null,label='';if(story.scene==='intro'&&['deliver','cooling'].includes(story.phase)&&story.cooler){point=add(story.cooler.p,V(0,.24,0));label=story.dropAligned?'CLIC · SOLTAR':'ENFRIADOR';}
 if(point){const p=project(point);if(p&&p.x>35&&p.x<canvas.clientWidth-35&&p.y>100&&p.y<canvas.clientHeight-195){ui.marker.style.left=p.x+'px';ui.marker.style.top=(p.y-18)+'px';ui.marker.textContent=label;ui.marker.hidden=false;}}
}
function initStory(){
 story.lab=saveLab();story.labAlpha={...alphaSettings};try{story.progress=JSON.parse(readQbitsStorage('qbits.campaign.v1')||'{}')||{};}catch{story.progress={};}story.ready=true;
 const click=(id,fn)=>document.querySelector('#'+id).addEventListener('click',fn);
 click('main-play',()=>{window.QBitsMusic?.next?.();sceneFade(()=>beginIntro(),{out:.3,black:.65});});click('wake-button',wakeUp);click('skip-encounter',finishEncounter);click('main-continue',resumeGame);click('main-levels',showLevelSelector);click('main-lab',()=>{sceneFade(()=>enterLab(false));captureForTransition();});click('pause-button',openPauseMenu);click('pause-resume',resumeGame);click('pause-restart',restartCurrent);click('pause-levels',showLevelSelector);click('pause-main',showMain);click('pause-lab',()=>{sceneFade(()=>enterLab(false));captureForTransition();});click('levels-back',backFromLevels);click('complete-repeat',()=>{sceneFade(()=>beginCampaignLevel(story.level||1));captureForTransition();});click('complete-next',()=>{sceneFade(()=>beginCampaignLevel(Math.min(LEVELS.length-1,story.level+1)));captureForTransition();});click('complete-levels',showLevelSelector);click('complete-main',showMain);click('complete-lab',()=>{sceneFade(()=>enterLab(false));captureForTransition();});
 click('main-codex',showCodex);click('pause-codex',showCodex);click('codex-back',closeCodex);initTitleGreeting();gameScene('lab');gameMode('boot');
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
 number=clamp(Math.floor(number),1,LEVELS.length-1);const carry=number===9&&story.level===8&&story.phase==='complete'?groups.flatMap(g=>worldParts(g)):null;rememberLab();clearNarrativeScene();applyStageDefaults();story.level=number;story.phase='challenge';story.started=true;story.elapsed=0;gameScene('campaign');gameMode('playing');position.splice(0,3,0,EYE_HEIGHT,2.3);yaw=0;pitch=number<=4?-.6:-.25;camera.splice(0,3,...position);
 const definition=LEVELS[number],zs=definition.gates.map((_,i)=>definition.gates.length===1?-3.4:-1.6-i*4),c={number,definition,stage:0,gates:[],crew:[],ordered:new Set(),labelsAt:0,hintAt:0};story.campaign=c;storyWorld.buttons=[];campaignBoundary(zs);
 definition.gates.forEach((def,index)=>{const gate=campaignGate(zs[index],index,def);c.gates.push(gate);
  if(def.weights)for(let i=0;i<def.weights.length;i++){const x=def.weights.length===1?(def.kind==='combo'?1.65:0):i===0?-1.4:1.4;makeCampaignPad(gate,x,gate.z+1.4,def.weights[i],i);}
  if(def.form)buildSocket(gate,FORMS[def.form]);
  if(def.targets)for(let i=0;i<def.targets;i++)gate.targets.push({p:V(def.targets===1?-.85:i===0?-1.35:1.35,.003,gate.z+1.8),assigned:null,ready:false,index:i});
 });
 for(let i=0;i<definition.count;i++){const x=definition.count===1?-.85:(i%3-1)*.30,z=.55+Math.floor(i/3)*.3,g=carry?.[i]?makeGroup([{...carry[i],p:V(x,HALF+.004,z),q:Q()}]):addQubit([x,HALF+.004,z],1);c.crew.push(g.parts[0].id);g.parts[0].mood.name='Q-bit '+(i+1);if(i===0)story.guideId=g.parts[0].id;}
 if(number<=2)c.gates[0].targets.forEach((t,i)=>t.assigned=c.crew[i]);makeButtonPhysics(storyWorld.buttons);storyWorld.door=c.gates[0].door;storyWorld.doorProgress=0;world.broadphase.dirty=true;
 setupBlockTwo(c);setupReconfiguration(c);setupAutomation(c);setupProduction(c);updateCampaignObjective();if(number===9)beginEncounter();else if(definition.lines)chapterDialogue(definition.lines);else say(definition.line,{after:hideStoryDialogue});updatePanel();
}
function updateCampaignObjective(){
 const c=story.campaign;if(!c)return;const gate=c.gates[c.stage],part=c.gates.length>1?'Sala '+(c.stage+1)+' / '+c.gates.length+' · ':'';let text='';
 if(c.reconfiguration){storyObjective(reconfigurationObjective(c));return;}
 if(c.automation){storyObjective(automationObjective(c));return;}
 if(c.production){storyObjective(productionObjective(c));return;}
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
 if(gate.kind==='production')active=!!c.production?.complete;
 else if(gate.kind==='automation')active=!!c.automation?.run.complete;
 else if(gate.kind==='reconfiguration')active=reconfigurationSatisfied(c);
 else if(gate.kind==='routes'){
  for(const t of gate.targets){const g=groups.find(g=>g.parts.length===1&&g.parts[0].id===t.assigned);t.ready=!!g&&c.ordered.has(t.assigned)&&!g.route&&held?.g!==g&&bounds(g).min.y<.035&&Math.hypot(g.body.position.x-t.p.x,g.body.position.z-t.p.z)<.21;}
  active=gate.targets.every(t=>t.ready);
 }else{active=gate.pads.every(b=>b.load>=b.required);if(gate.socket)active=active&&socketIsPressed(gate.socket);}
 if(gate.generatedRequired)active=active&&generatedForGate(gate)>=gate.generatedRequired;gate.active=active;
 if(!gate.solved){
  if(gate.pipe){gate.flow=clamp(gate.flow+dt*(active?1/(gate.seconds||9):-1/5.5),0,1);if(gate.flow>=1)gate.solved=true;}
  else{gate.hold=active?Math.min(1,gate.hold+dt/1.1):0;if(gate.hold>=1)gate.solved=true;}
  if(gate.solved){updateCampaignObjective();if(!story.dialogue)say(c.production?'Pedido completo. La línea y el material recibido se quedan en el taller. Crucemos.':c.automation?'Ensayo registrado. El banco se queda aquí; tú puedes cruzar. Ya tenemos una máquina que sabe trabajar sola.':c.reconfiguration?'Seguimos siendo nosotros. Solo cambió la forma de trabajar. El catálogo ya guarda el descubrimiento; reúne todas las piezas y crucemos.':gate.pipe?'Llegó. La puerta queda abierta. Ahora puedes retirarnos.':'Listo. Puedes recuperar las piezas; esta puerta ya queda abierta.',{after:hideStoryDialogue});}
 }
 storyWorld.door=gate.door;storyWorld.doorProgress=gate.open;
 if(gate.solved&&gate.open>.98&&position[2]<gate.z-.85){
  if(c.stage<c.gates.length-1){c.stage++;story.dockCandidate=null;updateCampaignObjective();const next=c.gates[c.stage];say(next.kind==='generation'?'La siguiente estación está más adelante. La materia debe llegar hasta su entrada.':next.kind==='combo'?'Dos en el botón y cuatro en la pared. Esta vez necesitamos a todo el equipo.':next.socket?'La siguiente forma es '+next.socket.form.name+'. Reorganiza las mismas piezas.':'Seguimos. Uno a cada lado.',{after:hideStoryDialogue});}
  else if(c.automation||c.production)finishCampaignLevel();
  else if(c.number===8||c.number>=9){const missing=c.crew.filter(id=>!groups.some(g=>g.parts.some(p=>p.id===id)&&partPose(g,g.parts.find(p=>p.id===id)).p.z<gate.z-.35));if(!missing.length)finishCampaignLevel();else storyObjective('Faltan '+missing.length+' Q-bits al otro lado.\nReúne al equipo y tráelo contigo.');}
  else finishCampaignLevel();
 }
}
function finishCampaignLevel(){
 if(story.phase==='finishing'||story.phase==='complete'||story.transition)return;
 story.phase='finishing';sceneFade(showCampaignResults,{out:2.1,black:.65,inTime:.9,loading:false,kind:'results'});
}
function showCampaignResults(){
 const n=story.level;saveStoryProgress('level'+n);awardWorkshopCredits();story.phase='complete';hideStoryDialogue();storyObjective('');gameMode('complete');pause(false);
 document.querySelector('#complete-eyebrow').textContent=String(n).padStart(2,'0')+' / '+chapters[n][1].toUpperCase();document.querySelector('#complete-title').textContent=n===12?'Cada pieza cuenta.':n===8?'Salimos juntos.':'Una puerta más.';document.querySelector('#complete-description').textContent=n===12?'Dos bloques completos. Todos los compañeros han cruzado contigo.':n===8?'Primer bloque completado. Al otro lado te espera el equipo.':'Nivel '+n+' completado. El siguiente encuentro te espera.';if(n===5)document.querySelector('#complete-description').textContent+=' Mecanismo desbloqueado: Enganche y Rotor. Mantén Q para encontrarlos.';if(n===12)document.querySelector('#complete-description').textContent='Dos bloques completos. Al otro lado empieza la reconfiguración.';if(n>=13&&n<=15){document.querySelector('#complete-title').textContent=n===15?'Seguimos siendo nosotros.':'La materia recuerda.';document.querySelector('#complete-description').textContent=n===15?'Has recuperado las dos escalas de división y su recomposición. Tus descubrimientos y planos quedan en el catálogo.':'Descubrimiento registrado. J abre el catálogo durante la partida.';}if(n>=16&&n<=18){document.querySelector('#complete-title').textContent=n===18?'La primera entrega autónoma.':'Una máquina, un acuerdo.';document.querySelector('#complete-description').textContent='Ensayo certificado con torque I · '+(story.campaign?.automation?.run.joules||0).toFixed(2)+' J consumidos.'+(n===16?' Torque II desbloqueado para tus mecanismos.':n===18?' Torque III desbloqueado. Has completado el bloque de automatización inicial.':'');}if(n>=19){const s=story.campaign?.production;document.querySelector('#complete-title').textContent=n===20?'Los primeros seis paquetes.':'Cada unidad cuenta.';document.querySelector('#complete-description').textContent=(s?.ledger.accepted.length||0)+' entregas correctas · '+(s?.joules||0).toFixed(2)+' J · '+(s?.autonomy||0).toFixed(1)+' s de trabajo útil sin intervenir. El catálogo guarda lo aprendido.';}document.querySelector('#complete-next').hidden=n===LEVELS.length-1;document.querySelector(n===LEVELS.length-1?'#complete-repeat':'#complete-next').focus({preventScroll:true});
}
function drawCampaignOpaque(){
 const c=story.campaign;if(!c)return;drawSourcesOpaque();drawReconfiguration();drawAutomation();drawProduction();gl.uniform1f(uniforms.uTime,simTime);drawAlphaButtons(storyWorld.buttons);
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
 const gate=c.gates[c.stage],labels=blockTwoLabels().concat(reconfigurationLabels(),automationLabels(),productionLabels());
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
 const rest=createCooler(V(-2.15,0,c.number===9?1.5:c.number>=13?2.7:.8));if(rest){rest.capacity=4;rest.coolSeconds=4.5;rest.chapterOwned=true;c.rest=rest;}
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
 for(const g of candidates){team.push(g);count+=groupWorkUnits(g);if(count+1e-8>=cargo.required)break;}
 if(count<cargo.required){announce('Se necesitan '+cargo.required+' Q-bits disponibles en el suelo. Libera al equipo de sus otras tareas.');return false;}
 const success=beginHaul(cargo,team,cargo.source.intake);if(success){hideStoryDialogue();storyObjective('Equipo en camino · '+cargo.required+' Q-bits\nPuedes acompañarlos o preparar el siguiente mecanismo.');}return success;
}
function interactMaterial(){if(openWorkshopMenu())return;if(story.scene!=='campaign'||story.encounter)return;if(openReconfigurationMenu()||openProductionMenu())return;const hit=aimCargo(4);if(hit?.cargo.source){if(hit.cargo.job)announce('El equipo ya está trabajando. Clic derecho para cambiar o detener la orden.');else sendMaterial(hit.cargo);}}
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

// Workshop research is persistent; fitted modules belong to existing piece IDs.
let workshopProfile;try{workshopProfile=QBitsWorkshop.normalizeProfile(JSON.parse(localStorage.getItem('qbits.workshop.v1')||'{}'));}catch{workshopProfile=QBitsWorkshop.normalizeProfile({});}
let workshopBench=null;
const contactStates=new Map(),rotorContactStates=new Map();
function serializeContactState(){
 return {sensors:[...contactStates].map(([id,state])=>({id,...state})),rotors:[...rotorContactStates].map(([key,state])=>({key,...state}))};
}
function restoreContactState(saved){
 contactStates.clear();rotorContactStates.clear();
 const valid=entry=>entry&&typeof entry.latched==='boolean'&&Number.isFinite(entry.clearSeconds)&&entry.clearSeconds>=0&&entry.clearSeconds<=.08;
 const copy=entry=>({latched:entry.latched,clearSeconds:entry.clearSeconds});
 const linked=new Set();for(const g of groups)for(const part of g.parts)if(QBitsWorkshop.partState(part).sensor){const r=sensorRotor(part);if(r)linked.add(r.aId+':'+r.bId);}
 for(const entry of Array.isArray(saved?.sensors)?saved.sensors:[]){if(!valid(entry)||!Number.isSafeInteger(entry.id))continue;const part=rotorPart(entry.id)?.part;if(part&&QBitsWorkshop.partState(part).sensor&&sensorRotor(part))contactStates.set(entry.id,copy(entry));}
 for(const entry of Array.isArray(saved?.rotors)?saved.rotors:[])if(valid(entry)&&linked.has(entry.key))rotorContactStates.set(entry.key,copy(entry));
}
function persistWorkshop(){try{localStorage.setItem('qbits.workshop.v1',JSON.stringify(workshopProfile));return true;}catch{return false;}}
function awardWorkshopCredits(){const result=QBitsWorkshop.awardCompleted(workshopProfile,story.progress);workshopProfile=result.profile;persistWorkshop();return result;}
function purchaseWorkshopResearch(key){awardWorkshopCredits();const result=QBitsWorkshop.purchase(workshopProfile,key,story.progress);if(!result.ok){announce(result.error);return false;}workshopProfile=result.profile;const saved=persistWorkshop();announce('Investigado · '+QBitsWorkshop.RESEARCH.find(item=>item.id===key).label+(saved?'':' · solo en esta sesión; no se pudo guardar'));return true;}
function setupWorkshop(){
 if(story.scene!=='lab'||puzzle.active)return null;
 if(workshopBench&&world.bodies.includes(workshopBench.wall.body))return workshopBench;
 const p=V(-1.75,.6,1.3),wall=storyWall(V(p.x,.3,p.z),V(.48,.3,.32),{color:[.8,.84,.81]});workshopBench={p,wall};announce('Mesa de trabajo a la izquierda · apunta y pulsa E. Misma personalidad; ahora con garantía de taller.');return workshopBench;
}
function removeWorkshop(){if(workshopBench){world.removeBody(workshopBench.wall.body);const at=storyWorld.walls.indexOf(workshopBench.wall);if(at>=0)storyWorld.walls.splice(at,1);workshopBench=null;}contactStates.clear();rotorContactStates.clear();}
function onWorkshop(p){return !!workshopBench&&Math.abs(p.x-workshopBench.p.x)<.55&&Math.abs(p.z-workshopBench.p.z)<.4&&p.y>=workshopBench.p.y-.02&&p.y<=workshopBench.p.y+.45;}
function workshopTarget(){
 if(!workshopBench)return null;
 const eligible=groups.flatMap(g=>g.parts.map(part=>({g,part,...partPose(g,part)}))).filter(o=>!o.part.mood.production&&onWorkshop(o.p)&&!held?.items?.some(item=>item.g===o.g));
 return eligible.find(o=>selected?.part.id===o.part.id)||eligible.sort((a,b)=>a.p.distanceTo(workshopBench.p)-b.p.distanceTo(workshopBench.p))[0]||null;
}
function applyWorkshopUpgrade(id,patch){
 if(story.scene!=='lab'||puzzle.active||!workshopBench){announce('Las adaptaciones se preparan en la mesa del banco de pruebas.');return false;}
 const hit=rotorPart(id);if(!hit||!onWorkshop(hit.p)||held?.items?.some(item=>item.g===hit.g)){announce('Deja la pieza sobre la mesa y suéltala.');return false;}
 const component=rotorConnectedGroups([hit.g]);if(component.some(g=>g.route||g.pendingMoodOrder||g.haulJob||g.blueprintJob)||rotors.some(r=>r.enabled&&rotorGroups(r).some(g=>component.includes(g)))){announce('Detén el mecanismo antes de adaptarlo.');return false;}
 awardWorkshopCredits();const parts=worldParts(hit.g),at=parts.findIndex(p=>p.id===id),plan=QBitsWorkshop.planPartUpgrade(parts[at],patch,workshopProfile);
 if(plan.error){announce(plan.error);return false;}
 parts[at]=plan.part;if(!QBitsWorkshop.partState(plan.part).sensor){delete parts[at].mood.sensorLink;contactStates.delete(id);}
 const ref=hit.g.body.quaternion.clone(),velocity=hit.g.body.velocity.clone(),spin=hit.g.body.angularVelocity.clone();removeGroup(hit.g);const made=makeGroup(parts,ref,velocity,spin);refreshRotors();selected={g:made,part:made.parts.find(p=>p.id===id)};
 announce('Adaptación aplicada · '+plan.storedJ.toFixed(1)+' / '+plan.capacity+' J conservados · '+plan.material.piece.toFixed(2)+' u + '+plan.material.bench.toFixed(2)+' u reservadas en mesa');updatePanel();return true;
}
function aimWorkshop(dir=direction()){if(story.scene!=='lab'||puzzle.active||!workshopBench)return false;const half=V(.5,.4,.35),center=add(workshopBench.p,V(0,-.1,0));return rayPuzzleBox(V(...camera),dir,{p:center,half,min:sub(center,half),max:add(center,half)},3.5)!==null;}
function openWorkshopMenu(dir=direction()){
 if(story.scene!=='lab'||puzzle.active||story.mode!=='playing'||story.transition)return false;
 const bench=setupWorkshop();if(!bench||!aimWorkshop(dir))return false;
 awardWorkshopCredits();const target=workshopTarget(),items=[{label:'Investigaciones · '+workshopProfile.credits+' créditos',run:showWorkshopResearch}];
 if(target){const state=QBitsWorkshop.partState(target.part),id=target.part.id;
  items.push({label:target.part.mood.name+' · '+target.part.weight.toFixed(2)+' u · reserva '+state.ballast.toFixed(2)+' u',disabled:true,run:()=>{}});
  items.push({label:state.sensor?'Retirar sensor de contacto':'Instalar sensor de contacto',disabled:!state.sensor&&!workshopProfile.research.includes('sensor'),run:()=>{applyWorkshopUpgrade(id,{sensor:!state.sensor});captureMouse();}});
  for(const [key,label]of [['battery','Batería'],['lightweight','Estructura ligera'],['movement','Movimiento']])for(const tier of [1,2,3])items.push({label:(state[key]===tier?'✓ ':'')+label+' '+tier,disabled:tier>1&&!workshopProfile.research.includes(key+tier),run:()=>{applyWorkshopUpgrade(id,{[key]:tier});captureMouse();}});
  items.push({label:'Restaurar pieza · retirar adaptaciones',run:()=>{applyWorkshopUpgrade(id,{sensor:false,battery:1,lightweight:1,movement:1});captureMouse();}});
 }else items.push({label:'Deja una pieza sobre la mesa para adaptarla',disabled:true,run:()=>{}});
 items.push({label:'Cerrar',run:()=>captureMouse()});openCommandMenu(bench.p,'Mesa '+workshopProfile.bench+' · investigar una vez, adaptar gratis',items);return true;
}
function showWorkshopResearch(){
 awardWorkshopCredits();const items=QBitsWorkshop.availableResearch(workshopProfile,story.progress).map(item=>({label:(item.owned?'✓ ':item.available?'':'🔒 ')+item.label+' · '+item.cost+' créditos'+(!item.available&&!item.owned?' · '+item.reason:''),disabled:!item.available,run:()=>{purchaseWorkshopResearch(item.id);showWorkshopResearch();}}));
 items.push({label:'12 créditos por nivel completado por primera vez. Repetir no paga.',disabled:true,run:()=>{}},{label:'Cerrar',run:()=>captureMouse()});openCommandMenu(workshopBench?.p||V(...camera),'Mesa '+workshopProfile.bench+' · '+workshopProfile.credits+' créditos disponibles',items);
}
function sensorRotor(part){const link=part?.mood?.sensorLink;if(!link)return null;const rotor=rotors.find(r=>r.aId===link.aId&&r.bId===link.bId);return rotor&&rotorPart(rotor.aId)&&rotorPart(rotor.bId)?rotor:null;}
function sensorFace(part){const profile=unitProfile(part),index=profile.faceNormals.reduce((best,n,i)=>n.x>profile.faceNormals[best].x?i:best,0);return {normal:profile.faceNormals[index],center:profile.faceCenters[index]};}
function linkContactSensor(sensorId,rotor){
 const hit=rotorPart(sensorId);if(certifiedAutomation()||!hit||!QBitsWorkshop.partState(hit.part).sensor||!rotors.includes(rotor)||rotorGroups(rotor).some(g=>!g)){announce('Necesitas un sensor adaptado y un rotor completo.');return false;}
 if(hit.p.distanceTo(couplerTip(rotorPart(rotor.aId)).point)>3){announce('Acerca sensor y rotor: el enlace alcanza 3 m.');return false;}
 hit.part.mood.sensorLink={aId:rotor.aId,bId:rotor.bId};contactStates.delete(sensorId);announce('Punta conectada · tocar pared invierte el rotor una vez');return true;
}
function unlinkContactSensor(sensorId){const hit=rotorPart(sensorId);if(!hit)return false;delete hit.part.mood.sensorLink;contactStates.delete(sensorId);return true;}
function showSensorMenu(hit){
 const part=hit.part,linked=sensorRotor(part),items=rotors.map((r,i)=>({label:(linked===r?'✓ ':'')+'Conectar punta → Rotor '+(i+1),run:()=>{linkContactSensor(part.id,r);captureMouse();}}));
 items.push({label:'Desconectar punta',disabled:!linked,run:()=>{unlinkContactSensor(part.id);captureMouse();}},{label:'La punta verde marca la cara activa. Shift permite orientarla.',disabled:true,run:()=>{}},{label:'Cerrar',run:()=>captureMouse()});openCommandMenu(partPose(hit.g,part).p,'Sensor · enlace de inversión',items);
}
function sensorContactActive(hit){
 const shape=hit.g.body.shapes[hit.g.parts.indexOf(hit.part)],axis=hit.q.vmult(sensorFace(hit.part).normal);
 for(const contact of world.contacts){const isA=contact.bi===hit.g.body,isB=contact.bj===hit.g.body;if(!isA&&!isB)continue;
  if((isA?contact.si:contact.sj)!==shape)continue;const other=isA?contact.bj:contact.bi;
  if(other===floor||other.type!==CANNON.Body.STATIC||other.qubitGroup||other.collisionFilterGroup===0)continue;
  const normal=isA?contact.ni:mul(contact.ni,-1);if(Math.abs(normal.y)<.45&&normal.dot(axis)>.55)return true;
 }return false;
}
function tickContactSensors(dt){
 if(storySuspended()||story.transition||certifiedAutomation()||!Number.isFinite(dt)||dt<=0)return;
 const live=new Set(),inputs=new Map();
 for(const g of groups)for(const part of g.parts){if(!QBitsWorkshop.partState(part).sensor)continue;live.add(part.id);const hit={g,part,...partPose(g,part)},r=sensorRotor(part);
  if(part.mood.sensorLink&&!r){delete part.mood.sensorLink;contactStates.delete(part.id);continue;}
  if(!r){contactStates.delete(part.id);continue;}
  const touching=!held?.items?.some(item=>item.g===g)&&hit.p.distanceTo(couplerTip(rotorPart(r.aId)).point)<=3&&sensorContactActive(hit);
  contactStates.set(part.id,QBitsContacts.step(contactStates.get(part.id),touching,dt).state);
  const input=inputs.get(r)||{touching:false,id:part.id};if(touching){input.touching=true;input.id=part.id;}inputs.set(r,input);
 }
 for(const id of contactStates.keys())if(!live.has(id))contactStates.delete(id);
 // One rotor receives one edge from the union of its sensors. Adjacent contacts
 // cannot undo one another; every linked tip must clear before it can rearm.
 for(const [r,input]of inputs){const key=r.aId+':'+r.bId,next=QBitsContacts.step(rotorContactStates.get(key),input.touching,dt);rotorContactStates.set(key,next.state);
  if(next.fire&&r.enabled){configureRotor(r,{direction:-r.direction},true);r.sensorPulses=(r.sensorPulses||0)+1;r.lastSensorId=input.id;}
 }
 const keys=new Set([...inputs.keys()].map(r=>r.aId+':'+r.bId));for(const key of rotorContactStates.keys())if(!keys.has(key))rotorContactStates.delete(key);
}
function drawWorkshop(){
 if(story.scene==='lab'&&workshopBench){const p=workshopBench.p;drawBox(add(p,V(0,.012,0)),Q(),V(.68,.018,.4),[.29,.43,.37,1]);drawBox(add(p,V(-.38,.18,-.2)),Q(),V(.12,.32,.06),[.28,.36,.32,1]);}
 for(const g of groups)for(const part of g.parts)if(QBitsWorkshop.partState(part).sensor){const pose=partPose(g,part),face=sensorFace(part),point=add(pose.p,pose.q.vmult(add(face.center,mul(face.normal,.004)))),r=sensorRotor(part),tipQ=Q();tipQ.setFromVectors(V(1,0,0),face.normal);drawBox(point,pose.q.mult(tipQ),V(.009,.023,.023),r?[.25,.8,.49,1]:[.7,.57,.25,1]);if(r){const tip=couplerTip(rotorPart(r.aId)).point;drawLines([point,tip],[.2,.7,.43,.7]);}}
}
function workshopGrip(g){return g.parts.reduce((n,p)=>n+QBitsWorkshop.movementFactors(p).grip,0)/Math.max(1,g.parts.length);}

// Chapter III. A bounded, reversible material transaction; the physical world
// is committed only when the complete output tray is clear.
chapters.push(...QBitsReconfiguration.chapters);
LEVELS.push(...QBitsReconfiguration.levels);
// Chapter IV: certified rotor benches measured from real physical motion.
chapters.push(...QBitsAutomation.chapters);
LEVELS.push(...QBitsAutomation.levels);
function certifiedAutomation(){return story.scene==='campaign'&&!!(story.campaign?.automation||story.campaign?.production);}
function campaignTorqueCap(){return (story.campaign?.production?.goal?.maxTorque??story.campaign?.automation?.certified?.maxTorque)??QBitsProgression.capFor(QBitsProgression.effectiveTier(Number(story.progress.torqueTier||1),story.progress));}
function automationIntervention(reason){
 productionIntervention(reason);
 const s=story.scene==='campaign'&&story.campaign?.automation;
 if(!s||s.internal||s.run.complete)return;
 s.run=QBitsAutomation.reset(s.run,reason);updateCampaignObjective();
}
function setupAutomation(c){
 const goal=c.definition.automation;if(!goal)return;
 Object.assign(settings,{bounce:.12,friction:.38,damping:.12});world.defaultContactMaterial.friction=.38;world.defaultContactMaterial.restitution=.12;
 const guide=storyGuide();guide.body.position.set(.8,HALF+.004,.8);
 storyWall(V(-.6,.06,-.8),V(.08,.06,.08),{color:[.77,.81,.79]});
 const rotor=spawnRotor(V(-.6,.12,-.8),{mount:'fixed',moving:'b',rpm:30,maxTorque:.4,capacity:goal.load});
 if(!rotor)return;
 const moving=rotorPart(rotor.bId),parts=worldParts(moving.g),center=add(moving.p,moving.q.vmult(V(0,-CUBE_SIZE*5/56,0)));
 for(let i=1;i<=goal.arm;i++)parts.push({id:allocateUnitId(),shape:'cube',weight:1,p:add(center,moving.q.vmult(V(i*CUBE_SIZE,0,0))),q:moving.q.clone()});
 if(goal.arm){removeGroup(moving.g);makeGroup(parts);refreshRotors();}
 const endpoint=parts[parts.length-1],from=endpoint.p.clone(),pivot=couplerTip(rotorPart(rotor.aId)).point,to=V(2*pivot.x-from.x,from.y,2*pivot.z-from.z);
 c.automation={goal,rotor,ids:rotorGroups(rotor).flatMap(g=>g.parts.map(p=>p.id)),movingIds:rotorGroups(rotor)[1].parts.map(p=>p.id),endpoint:endpoint.id,origin:from,target:to,pivot:pivot.clone(),certified:{maxTorque:.4},run:QBitsAutomation.create(),internal:false,lastUi:-1};
 // An actual low separator makes the first transfer a lift across a barrier.
 if(goal.delivery){storyWall(V(pivot.x,.06,pivot.z),V(.025,.06,.45),{color:[.72,.78,.75]});storyWall(add(to,V(0,-HALF-.016,0)),V(.09,.012,.09),{color:[.62,.74,.69]});}
 for(const id of [rotor.aId,rotor.bId])rotorPart(id).part.mood.energy=.8;
 selected={g:rotorPart(rotor.aId).g,part:rotorPart(rotor.aId).part};
}
function automationObjective(c){
 const s=c.automation,g=s.goal,r=s.rotor,run=s.run;
 if(c.gates[c.stage].solved)return 'Ensayo registrado · puerta abierta.\nCruza; el mecanismo permanece en el banco.';
 return (g.delivery?'Entrega al RECEPTOR':'Giro continuo: '+g.seconds+' s')+' · carga '+g.load+' u · torque I\n'+Math.min(g.seconds,run.seconds).toFixed(1)+' / '+g.seconds+' s autónomos · '+run.joules.toFixed(2)+' / '+g.budget+' J · '+Math.abs(r.actualRpm||0).toFixed(0)+' rpm reales\n'+run.reason+' · Clic derecho: Rotación';
}
function tickAutomation(dt){
 const c=story.scene==='campaign'&&story.campaign,s=c?.automation;
 if(!s||story.mode!=='playing'||storySuspended()||story.transition||s.run.complete||dt<=0)return;
 const r=s.rotor,pair=rotorGroups(r),parts=pair.filter(Boolean).flatMap(g=>g.parts),valid=rotors.includes(r)&&pair.length===2&&pair.every(Boolean)&&parts.length===s.ids.length&&s.ids.every(id=>parts.some(p=>p.id===id&&p.weight===1));
 const at=valid?couplerTip(rotorPart(r.aId)).point:null,endpoint=valid?rotorPart(s.endpoint):null;
 const fixed=valid&&s.movingIds.every(id=>pair[1].parts.some(p=>p.id===id))&&at.distanceTo(s.pivot)<.035&&r.mount==='fixed'&&r.moving==='b'&&r.maxTorque<=.4+1e-8&&r.capacity===s.goal.load;
 const productive=fixed&&r.enabled&&!r.stalled&&Math.abs(r.actualRpm||0)>=s.goal.minRpm&&!held?.items?.some(item=>pair.includes(item.g));
 const delivered=!!endpoint&&endpoint.g===pair[1]&&endpoint.p.distanceTo(s.target)<.07;
 const previous=s.run;s.run=QBitsAutomation.advance(previous,{productive,delivered,powered:r.enabled,joules:r.powerActive?(r.power?.drainPerSide||0)*QBitsRotorPower.MODEL.joulesPerSide*2:0,reason:!fixed?'Conserva el banco original, base fija, lado B y capacidad '+s.goal.load+' u.':!r.enabled?'Enciende el rotor.':r.stalled?'Rotor bloqueado: revisa fuerza y espacio.':'Alcanza '+s.goal.minRpm+' rpm reales.'},dt,s.goal);
 if(s.run.failed&&!previous.failed){s.internal=true;configureRotor(r,{enabled:false});s.internal=false;announce('Presupuesto superado · detención automática. Ajusta el motor para repetir.');}
 if(s.run.complete&&!previous.complete){s.internal=true;configureRotor(r,{enabled:false});s.internal=false;saveStoryProgress('lore.rotor'+c.number);announce(s.goal.delivery?'Entrega recibida · motor detenido':'Ensayo registrado · motor detenido');}
 const tenth=Math.floor(s.run.seconds*10);if(tenth!==s.lastUi||previous.reason!==s.run.reason){s.lastUi=tenth;updateCampaignObjective();}
}
function drawAutomation(){
 const s=story.campaign?.automation;if(!s)return;
 const points=s.goal.delivery?[[s.origin,[.42,.6,.7,1]],[s.target,s.run.complete?[.2,.85,.5,1]:[.3,.7,.5,1]]]:[[s.pivot,[.35,.6,.53,1]]];
 for(const [p,color]of points){drawAsset(storyTargetMesh,V(p.x,.004,p.z),Q(),V(.15,1,.15),color,3);drawRing(V(p.x,.007,p.z),.16,.7);}

}
function automationLabels(){
 const s=story.campaign?.automation;if(!s)return [];
 return s.goal.delivery?[{p:add(s.origin,V(0,.17,0)),text:'ORIGEN'},{p:add(s.target,V(0,.17,0)),text:s.run.complete?'RECIBIDO':'RECEPTOR'}]:[{p:add(s.pivot,V(0,.3,0)),text:'BANCO · '+s.goal.load+' u · 0,40 N·m'}];
}
// Chapter V: finite matter, powered dosing and physical station transport.
chapters.push(...QBitsProduction.chapters);LEVELS.push(...QBitsProduction.levels);
function productionGroups(s=story.campaign?.production){return s?groups.filter(g=>g.parts.some(p=>p.mood.production&&p.mood.production.batch===s.batch)):[];}
function productionIntervention(reason='Intervención manual: reinicia el lote en la estación.'){
 const s=story.scene==='campaign'&&story.campaign?.production;if(!s||s.internal||!s.started||s.complete)return;
 s.failed=true;s.reason=reason+' Reinicia el lote en la estación.';s.autonomy=0;updateCampaignObjective();
}
function setupProduction(c){
 const goal=c.definition.production;if(!goal)return;
 Object.assign(settings,{bounce:.02,friction:.38,damping:.12});world.defaultContactMaterial.friction=.38;world.defaultContactMaterial.restitution=.02;
 storyGuide().body.position.set(.6,HALF+.004,1);
 const z=-.7,surface=.3;
 storyWall(V(0,surface/2,z),V(1.85,surface/2,.22),{color:[.76,.80,.78]});
 for(const side of [-1,1])storyWall(V(0,surface+.045,z+side*.23),V(1.85,.045,.015),{color:[.68,.74,.72]});
 storyWall(V(-1.8,surface+.07,z),V(.015,.07,.23),{color:[.68,.74,.72]});
 storyWall(V(-1.45,.08,.08),V(.09,.08,.09),{color:[.75,.8,.77]});
 const rotor=spawnRotor(V(-1.45,.16,.08),{mount:'fixed',moving:'b',rpm:30,maxTorque:.4,capacity:2});if(!rotor)return;
 c.production={goal,rotor,z,surface,control:V(-1.45,.6,.1),pivot:couplerTip(rotorPart(rotor.aId)).point.clone(),bench:rotorGroups(rotor).map(g=>({id:g.parts[0].id,p:g.body.position.clone(),q:g.body.quaternion.clone()})),attempt:0,interval:goal.interval,internal:true};resetProduction();
}
function resetProduction(){
 const s=story.campaign?.production;if(!s)return false;
 if(!rotors.includes(s.rotor)||rotorGroups(s.rotor).some(g=>!g)){productionFail(s,'Falta un enganche. Reinicia el nivel desde pausa para recuperar el banco.');return false;}
 s.internal=true;const previous=productionGroups(s);
 if((held?.items||[]).some(item=>previous.includes(item.g)))releaseQubit();
 configureRotor(s.rotor,{enabled:false});for(const g of previous){const keep=worldParts(g).filter(p=>!p.mood.production||p.mood.production.batch!==s.batch),ref=g.body.quaternion.clone();removeGroup(g);if(keep.length)makeGroup(keep,ref);}refreshRotors();
 for(const saved of s.bench){const g=rotorPart(saved.id)?.g;if(g&&g.parts.length===1){g.body.position.copy(saved.p);g.body.quaternion.copy(saved.q);g.body.velocity.set(0,0,0);g.body.angularVelocity.set(0,0,0);g.body.aabbNeedsUpdate=true;}}
 s.attempt++;s.batch=story.level+':'+s.attempt;
 s.entries=Array.from({length:s.goal.units},(_,i)=>({id:allocateUnitId(),kind:i%2?'B':'A',weight:.5}));
 s.ledger=QBitsProduction.create(s.entries,s.goal);s.buffer=[];s.packJob=null;s.started=false;s.failed=false;s.complete=false;s.time=0;s.autonomy=0;s.joules=0;s.meter=0;s.forceJoules=0;s.receiver=new Map();s.lastUi=-1;s.reason='E en el control · iniciar lote';
 for(const id of [s.rotor.aId,s.rotor.bId]){const p=rotorPart(id)?.part;if(p)p.mood.energy=.8;}
 s.internal=false;updateCampaignObjective();return true;
}
function startProduction(){
 const s=story.campaign?.production;if(!s||s.started||s.failed||s.complete||!rotors.includes(s.rotor))return false;
 s.internal=true;const ok=configureRotor(s.rotor,{mount:'fixed',moving:'b',direction:1,capacity:2,enabled:true});s.internal=false;if(!ok)return false;
 s.started=true;s.reason='Lote en marcha · no intervengas';hideStoryDialogue();updateCampaignObjective();return true;
}
function productionDrive(s){
 const r=s.rotor,pair=rotorGroups(r);return rotors.includes(r)&&pair.every(Boolean)&&pair.every(g=>g.parts.length===1&&g.parts[0].weight===1)&&couplerTip(rotorPart(r.aId)).point.distanceTo(s.pivot)<.035&&r.enabled&&!r.stalled&&r.mount==='fixed'&&r.moving==='b'&&r.direction===1&&r.powerActive&&Math.abs(r.actualRpm||0)>3;
}
function productionForces(dt){
 const s=story.scene==='campaign'&&story.campaign?.production;if(!s||!s.started||s.failed||s.complete||!productionDrive(s))return;s.forceJoules=0;
 const drive=s.rotor,speed=Math.min(.65,Math.abs(drive.actualRpm)/30*.26),on=productionGroups(s).filter(g=>{const b=bounds(g);return Math.abs(g.body.position.z-s.z)<.21&&b.min.y>s.surface-.025&&b.min.y<s.surface+.025&&g.body.position.x>-1.8&&g.body.position.x<1.65;});
 const limit=Math.min(3.2,drive.maxTorque/.045/Math.max(1,on.length));
 for(const g of on){if(held?.items?.some(item=>item.g===g))continue;const b=g.body;const waiting=s.goal.packages&&g.parts.every(p=>p.mood.production?.role==='raw')&&(s.packJob||s.buffer.length>=2)&&b.position.x>-.42;const target=waiting?0:speed;const force=clamp(b.mass*(25*(target-b.velocity.x)+(waiting?0:.38*9.8)),-limit,limit);b.force.x+=force;b.force.z+=clamp((s.z-b.position.z)*b.mass*25-b.velocity.z*b.mass*6,-limit,limit);b.wakeUp();s.forceJoules+=(Math.abs(force*b.velocity.x)/.72+force*force*.025)*dt;}
 s.forceJoules+=.05*dt;if(s.packJob&&s.packJob.time<.7)s.forceJoules+=.12*Math.min(.7-s.packJob.time,dt*Math.abs(drive.actualRpm)/30)/.7;
}
function productionClear(s,p,ignore=[]){
 const box={p,q:Q(),half:V(HALF+.012,HALF+.004,HALF+.012)};
 return !groups.some(g=>!ignore.includes(g)&&poses(g).some(o=>obbOverlap(box,o,-.001)));
}
function productionPart(entry,s,role='raw',p=V(-1.65,s.surface+HALF+.006,s.z)){
 return {id:entry.id,weight:entry.weight,shape:'cube',p,q:Q(),mood:{name:'Materia '+entry.kind,energy:1,production:{batch:s.batch,kind:entry.kind,role}}};
}
function productionIntegrity(s){
 const physical=productionGroups(s),parts=physical.flatMap(g=>g.parts).concat(s.buffer,s.packJob?.parts||[]);
 if(physical.some(g=>Math.abs(g.body.mass-totalWeight(g)*.25)>1e-8))return false;
 if(parts.some(p=>!s.entries.some(e=>e.id===p.id&&e.kind===p.mood.production?.kind&&e.weight===p.weight)||unitShape(p)!=='cube'))return false;
 return s.entries.every(e=>parts.filter(p=>p.id===e.id).length===(['loose','packed'].includes(s.ledger.status[e.id])?1:0));
}
function productionFail(s,reason){s.failed=true;s.reason=reason;s.autonomy=0;s.internal=true;configureRotor(s.rotor,{enabled:false});s.internal=false;updateCampaignObjective();}
function tickProduction(dt){
 const c=story.scene==='campaign'&&story.campaign,s=c?.production;
 if(!s||story.mode!=='playing'||storySuspended()||story.transition||!s.started||s.complete||dt<=0)return;
 if(s.failed){if(s.rotor.enabled){s.internal=true;configureRotor(s.rotor,{enabled:false});s.internal=false;}return;}
 const pair=rotorGroups(s.rotor);if(!rotors.includes(s.rotor)||pair.some(g=>!g)){productionFail(s,'Falta un enganche. Reinicia el nivel para recuperar el banco.');return;}
 if(!productionIntegrity(s)){productionFail(s,'Falta materia o cambió la receta. Reinicia el lote.');return;}
 const moving=productionDrive(s),motorJ=s.rotor.powerActive?(s.rotor.power?.spentJoules||0):0,extra=moving?s.forceJoules:0;
 s.forceJoules=0;
 const available=Math.min(...pair.map(g=>g.parts[0].mood.energy))*40,spent=Math.min(available,extra);
 for(const g of pair)g.parts[0].mood.energy=Math.max(0,g.parts[0].mood.energy-spent/40);
 s.joules+=motorJ+spent;s.time+=dt;
 if(spent+1e-9<extra||available<.001){productionFail(s,'Energía agotada. Ajusta el motor y reinicia el lote.');return;}
 if(s.joules>s.goal.budget){productionFail(s,'Presupuesto superado. Reinicia el lote con una velocidad menor.');return;}
 if(!moving){s.reason='Activa giro horario, base fija y lado B. El lote espera.';s.autonomy=0;return;}
 s.reason='Lote en marcha · no intervengas';const material=productionGroups(s);let useful=false;
 for(const g of material){const bb=bounds(g);if(bb.min.y<.08||Math.abs(g.body.position.z-s.z)>.4){productionFail(s,'Material fuera de la línea. Reinicia el lote.');return;}if(g.body.velocity.x>.015)useful=true;}
 const input=V(-1.65,s.surface+HALF+.006,s.z);s.meter+=dt*Math.abs(s.rotor.actualRpm)/30;
 if(s.ledger.stock.length&&s.meter>=s.interval){if(productionClear(s,input)){const entry=QBitsProduction.release(s.ledger);if(entry){makeGroup([productionPart(entry,s)]);s.meter=0;useful=true;}}else{s.meter=Math.min(s.meter,s.interval);s.reason='Dosificador esperando: despeja la entrada o reinicia el lote.';}}
 if(s.goal.packages){
  for(const g of [...productionGroups(s)]){
   if(g.parts.some(p=>p.mood.production.role!=='raw')||g.body.position.x<-.3)continue;
   if(g.parts.length!==1){productionFail(s,'La entrada requiere unidades sueltas A y B. Reinicia el lote.');return;}
   const part=worldParts(g)[0],entry=s.entries.find(e=>e.id===part.id),expected=s.buffer.length%2?'B':'A';
   if(!entry||part.weight!==entry.weight||part.mood.production.kind!==expected){productionFail(s,'Material o secuencia incorrecta: se requiere A + B. Reinicia el lote.');return;}
   if(s.buffer.length>=2||s.packJob){g.body.velocity.set(0,0,0);g.body.angularVelocity.set(0,0,0);g.body.type=CANNON.Body.KINEMATIC;g.body.updateMassProperties();continue;}
   s.buffer.push(part);removeGroup(g);useful=true;
  }
  if(s.buffer.length===2&&!s.packJob){const item=QBitsProduction.package(s.ledger,s.buffer.map(p=>({id:p.id,kind:p.mood.production.kind,weight:p.weight})));if(item.error){productionFail(s,item.error);return;}s.packJob={item,time:0,parts:s.buffer};s.buffer=[];}
  if(s.packJob){const job=s.packJob;if(job.time<.7)useful=true;job.time=Math.min(.7,job.time+dt*Math.abs(s.rotor.actualRpm)/30);const a=V(.15,s.surface+HALF+.006,s.z-.045),b=V(.15,s.surface+HALF+.006,s.z+.045);
   if(job.time>=.7&&productionClear(s,a)&&productionClear(s,b)){makeGroup(job.parts.map((p,i)=>({...p,p:i?b:a,q:Q(),mood:{...p.mood,production:{...p.mood.production,role:'package'}}})));s.packJob=null;useful=true;}
  }
 }
 for(const g of [...productionGroups(s)]){
  if(g.body.position.x<1.43||Math.abs(g.body.position.z-s.z)>.1||held?.items?.some(item=>item.g===g))continue;
  const parts=g.parts,item=s.goal.packages?{ids:parts.map(p=>p.id),kind:'package',weight:totalWeight(g)}:{id:parts[0].id,kind:parts[0].mood.production.kind,weight:totalWeight(g)};
  if(s.goal.packages&&parts.some(p=>p.mood.production.role!=='package')||!s.goal.packages&&parts.length!==1){productionFail(s,'El receptor rechazó la forma de entrega. Reinicia el lote.');return;}
  const dwell=(s.receiver.get(g)||0)+dt;s.receiver.set(g,dwell);if(dwell<.12)continue;
  if(!QBitsProduction.accept(s.ledger,item)){productionFail(s,'El receptor rechazó una entrega incorrecta o repetida. Reinicia el lote.');return;}
  s.receiver.delete(g);removeGroup(g);useful=true;
 }
 s.autonomy=useful?s.autonomy+dt:s.autonomy;
 if(s.ledger.accepted.length===s.goal.target){
  if(s.autonomy<s.goal.minAutonomy){productionFail(s,'Entrega demasiado rápida: falta trabajo autónomo. Reinicia a menor velocidad.');return;}
  s.complete=true;s.reason='Pedido completo · materia conservada';s.internal=true;configureRotor(s.rotor,{enabled:false});s.internal=false;saveStoryProgress('lore.production'+c.number);announce('Pedido recibido · '+s.goal.target+' entregas correctas');
 }
 const ui=Math.floor(s.time*4);if(ui!==s.lastUi){s.lastUi=ui;updateCampaignObjective();}
}
function productionObjective(c){
 const s=c.production;if(c.gates[c.stage].solved)return 'Pedido recibido · puerta abierta.\nCruza; la línea permanece en el taller.';
 return (s.goal.packages?'Seis paquetes · A + B':'Tres unidades · A → B → A')+'\nEntregas '+s.ledger.accepted.length+'/'+s.goal.target+' · reserva '+s.ledger.stock.length+' · '+s.joules.toFixed(2)+'/'+s.goal.budget+' J (motor + línea)\nTrabajo útil sin intervenir '+s.autonomy.toFixed(1)+'/'+s.goal.minAutonomy+' s · '+s.reason;
}
function openProductionMenu(dir=direction()){
 const s=story.scene==='campaign'&&story.campaign?.production;if(!s||story.mode!=='playing'||story.transition)return false;
 const hit=rayPuzzleBox(V(...camera),dir,{min:sub(s.control,V(.25,.3,.2)),max:add(s.control,V(.25,.3,.2))},3.5);if(hit===null)return false;
 openCommandMenu(s.control,'Línea · dosificador y lote finito',[
  {label:s.started?'Lote iniciado':'Iniciar lote',disabled:s.started||s.failed,run:()=>{startProduction();captureMouse();}},
  ...[.8,1.2,1.8,2.4].map(interval=>({label:(s.interval===interval?'✓ ':'')+'Intervalo · '+interval+' s a 30 rpm',disabled:s.started,run:()=>{s.interval=interval;captureMouse();announce('Intervalo del dosificador: '+interval+' s');}})),
  {label:'Reiniciar lote · reponer reserva inicial',run:()=>{const reset=resetProduction();captureMouse();announce(reset?'Lote nuevo. E en el control para iniciar.':s.reason);}},
  {label:'Motor · velocidad, fuerza y energía…',run:()=>showRotorRotation(s.rotor)},
  {label:'Cerrar',run:()=>captureMouse()}
 ]);return true;
}
function drawProduction(){
 const s=story.campaign?.production;if(!s)return;
 drawBox(s.control,Q(),V(.3,.3,.08),[.23,.33,.3,1]);
 drawBox(V(-1.65,.65,s.z),Q(),V(.25,.35,.26),[.35,.43,.4,1]);
 drawBox(V(-1.65,s.surface+.06,s.z),Q(),V(.15,.11,.18),[.08,.12,.1,1]);
 for(let i=0;i<s.ledger.stock.length;i++)drawBox(V(-1.74+(i%3)*.08,.55+Math.floor(i/3)*.08,s.z-.137),Q(),V(.055,.055,.008),s.entries.find(e=>e.id===s.ledger.stock[i]).kind==='B'?[.72,.53,.26,1]:[.27,.56,.67,1]);
 if(s.goal.packages){for(const side of [-1,1])drawBox(V(-.08,.49,s.z+side*.2),Q(),V(.55,.38,.025),[.56,.65,.6,1]);drawBox(V(-.08,.68,s.z),Q(),V(.55,.025,.42),[.56,.65,.6,1]);
  const heldParts=s.packJob?.parts||s.buffer;for(let i=0;i<heldParts.length;i++)drawBox(V(-.16+i*.1,.4,s.z),Q(),V(.08,.08,.08),heldParts[i].mood.production.kind==='A'?[.27,.56,.67,1]:[.72,.53,.26,1]);}
 drawBox(V(1.68,.5,s.z),Q(),V(.12,.4,.4),[.28,.43,.36,1]);
 for(let x=-1.5;x<1.5;x+=.24){const offset=((simTime*(s.started&&!s.failed&&!s.complete?Math.abs(s.rotor.actualRpm||0)/30*.26:0))%.24);drawBox(V(x+offset,s.surface+.001,s.z),Q(),V(.012,.002,.35),[.46,.53,.5,1]);}
}
function productionLabels(){const s=story.campaign?.production;if(!s)return [];return [{p:add(s.control,V(0,.25,0)),text:'E · CONTROL DEL LOTE'},{p:V(-1.65,.96,s.z),text:'MATERIA · '+s.ledger.stock.length+' EN RESERVA'},...(s.goal.packages?[{p:V(-.08,.86,s.z),text:'EMPAQUE · A + B'}]:[]),{p:V(1.5,.79,s.z),text:'RECEPTOR · '+s.ledger.accepted.length+'/'+s.goal.target}];}

function groupWorkUnits(g){return g.parts.reduce((n,p)=>n+(p.mood?.matter?p.weight/p.mood.matter.rootWeight:1)*QBitsWorkshop.movementFactors(p).load,0);}
function chapterMatterParts(c=story.campaign){return groups.flatMap(g=>worldParts(g)).filter(p=>p.mood?.matter?.root===c?.reconfiguration?.root);}
function chapterDialogue(lines){
 const c=story.campaign;let index=0;
 const next=()=>{if(story.campaign!==c)return;if(index>=lines.length){hideStoryDialogue();return;}say(lines[index++],{hold:true,after:next});};next();
}
function setupReconfiguration(c){
 if(!c.definition.reconfiguration)return;
 const p=V(-1.9,0,-1.1),state={p,intake:add(p,V(0,0,.78)),exit:add(p,V(1.16,0,.7)),job:null,stats:{divide:0,subdivide:0,pyramid:0,cube:0},root:null,kind:c.definition.reconfiguration};c.reconfiguration=state;
 const guide=storyGuide();guide.body.position.set(.65,HALF+.004,.8);guide.parts[0].mood.name='Q-bit';
 let seed;
 if(c.number===15){const id=allocateUnitId();seed=QBitsReconfiguration.identify({id,weight:1,shape:'cube',mood:newMood(id)});seed.mood.name=seed.mood.matter.name='Compañero';
  const pyramids=QBitsReconfiguration.plan('divide',[seed]).outputs.map(p=>({...p,id:allocateUnitId()}));
  const halves=QBitsReconfiguration.plan('subdivide',[pyramids[0]]).outputs;
  const pieces=[...halves,...pyramids.slice(1)];
  for(const [i,part]of pieces.entries()){const id=allocateUnitId(),g=makeGroup([{...part,id,p:V(-1.9+(i%4)*.23,unitGroundHeight(part.shape)+.004,.65+Math.floor(i/4)*.25),q:Q()}]);c.crew.push(id);}
 }else{const g=groups.find(g=>g.parts[0].id===c.crew[1]);seed=QBitsReconfiguration.identify(worldParts(g)[0]);seed.mood.name=seed.mood.matter.name='Compañero';g.parts[0].mood=seed.mood;g.body.position.set(-1.9,HALF+.004,.65);}
 state.root=seed.mood.matter.root;
 const white=[.91,.935,.925];
 for(const x of [-.4,.4])storyWall(add(p,V(x,.39,0)),V(.055,.39,.25),{color:white});
 storyWall(add(p,V(0,.76,0)),V(.455,.05,.25),{color:white});
 storyWall(add(p,V(0,.37,-.235)),V(.35,.34,.025),{color:[.025,.033,.030]});
 storyWorld.details.push({p:add(p,V(0,.02,.48)),size:V(.68,.025,.3),color:[.72,.78,.75]});
 world.broadphase.dirty=true;
}
function reconfigurationInput(action){
 const c=story.campaign,s=c?.reconfiguration;
 if(!s||s.job||!QBitsReconfiguration.actions[action]||c.number<QBitsReconfiguration.actions[action].unlock)return [];
 const candidates=groups.filter(g=>!g.route&&!g.pendingMoodOrder&&!g.haulJob&&!g.blueprintJob&&!g.cooler&&!rotorForGroup(g)&&!held?.items.some(item=>item.g===g)&&
  poses(g).every(p=>p.part.mood?.matter?.root===s.root&&Math.hypot(p.p.x-s.intake.x,p.p.z-s.intake.z)<.38&&p.p.y<.27));
 const parts=candidates.flatMap(worldParts);
 if(action==='divide'||action==='subdivide'){
  const shape=action==='divide'?'cube':'pyramid',part=parts.find(p=>p.shape===shape);
  if(!part)return [];const group=candidates.find(g=>g.parts.some(p=>p.id===part.id));return group.parts.length===1?[part]:[];
 }
 if(action==='pyramid'){
  for(const p of parts.filter(p=>p.shape==='tetra')){
   const path=p.mood.matter.path,couple=parts.filter(other=>other.shape==='tetra'&&other.mood.matter.path[0]===path[0]);
   if(couple.length===2){const ids=new Set(couple.map(p=>p.id));if(candidates.filter(g=>g.parts.some(p=>ids.has(p.id))).every(g=>g.parts.every(p=>ids.has(p.id))))return couple;}
  }return [];
 }
 return parts.length===6&&parts.every(p=>p.shape==='pyramid')?parts:[];
}
function beginReconfiguration(action){
 const c=story.campaign,s=c?.reconfiguration;
 if(!s||s.job||story.mode!=='playing'||story.transition||!panel.hidden||document.hidden)return false;
 if(!QBitsReconfiguration.actions[action]||c.number<QBitsReconfiguration.actions[action].unlock)return false;
 const input=reconfigurationInput(action);if(input.some(QBitsWorkshop.hasAdaptation)){announce('Retira las adaptaciones en la mesa antes de dividir o recomponer.');return false;}const plan=QBitsReconfiguration.plan(action,input);
 if(plan.error){announce(input.length?plan.error:'Deja las piezas necesarias dentro de ENTRADA y suéltalas.');return false;}
 const ids=new Set(plan.inputs),owners=groups.filter(g=>g.parts.some(p=>ids.has(p.id)));
 if(owners.some(g=>g.parts.some(p=>!ids.has(p.id)))||groups.reduce((n,g)=>n+g.parts.length,0)-input.length+plan.outputs.length>MAX_QUBITS){announce('Separa la pieza o libera espacio antes de transformar.');return false;}
 s.job={...plan,time:0,duration:4,original:input,blocked:false};
 for(const g of owners)removeGroup(g);clearSelection();
 announce('Reconfigurando · la materia y la energía se conservan');updateCampaignObjective();return true;
}
function reconfigurationOutputPoses(s){return s.job.outputs.map((part,i)=>({...part,p:add(s.exit,V((i%3-1)*.17,unitGroundHeight(part.shape)+.005,Math.floor(i/3)*.17)),q:Q()}));}
function reconfigurationOutputClear(parts){
 if(groups.reduce((n,g)=>n+g.parts.length,0)+parts.length>MAX_QUBITS)return false;
 return parts.every(p=>!groups.some(g=>poses(g).some(other=>obbOverlap(p,other,.000001)))&&!cargos.some(c=>obbOverlap(p,cargoPose(c),.000001))&&!storyWorld.walls.some(w=>obbOverlap(p,{p:w.p,q:Q(),half:w.half},.000001)));
}
function tickReconfiguration(dt){
 const c=story.campaign,s=c?.reconfiguration;
 if(!s||!s.job||storySuspended()||story.transition||story.mode!=='playing'||!Number.isFinite(dt)||dt<=0)return;
 s.job.time=Math.min(s.job.duration,s.job.time+dt);
 if(s.job.time<s.job.duration)return;
 const outputs=reconfigurationOutputPoses(s);s.job.blocked=!reconfigurationOutputClear(outputs);
 if(s.job.blocked){updateCampaignObjective();return;}
 const job=s.job,made=[];
 try{for(const output of outputs){const id=output.shape==='cube'?output.mood.matter.root:allocateUnitId();made.push(makeGroup([{...output,id}]));}}
 catch(error){for(const g of made)removeGroup(g);job.blocked=true;return;}
 c.crew=c.crew.filter(id=>!job.inputs.includes(id));c.crew.push(...made.map(g=>g.parts[0].id));s.stats[job.action]++;s.job=null;
 const lesson=job.action==='divide'?'division':job.action==='subdivide'?'subdivision':'reunion';
 saveStoryProgress('lore.'+lesson);updatePanel();updateCampaignObjective();announce('Transformación completa · J: catálogo');
}
function reconfigurationSatisfied(c){
 const s=c?.reconfiguration;if(!s||s.job||!QBitsReconfiguration.complete(s.kind,s.stats))return false;
 const parts=chapterMatterParts(c),mass=parts.reduce((n,p)=>n+p.weight,0);
 return Math.abs(mass-1)<1e-8&&(s.kind!=='reunion'||parts.length===1&&parts[0].shape==='cube'&&parts[0].mood.matter.path==='');
}
function reconfigurationObjective(c){
 const s=c.reconfiguration,job=s.job;
 if(c.gates[c.stage].solved)return 'Puerta abierta. Reúne al guía y todas las piezas.\nLa misma materia sale contigo. J · catálogo';
 if(job)return job.blocked?'SALIDA ocupada · libera la bandeja.\nLa cámara conserva todas las piezas.':'Reconfigurando · '+Math.floor(job.time/job.duration*100)+' %\nLa energía disponible se reparte entre las formas.';
 return c.definition.goal+'\nENTRADA: deja las piezas · E: operar la cámara · J: catálogo';
}
function reconfigurationHit(dir=direction()){
 const s=story.campaign?.reconfiguration;if(!s)return null;
 const box=alphaBox(add(s.p,V(0,.4,.2)),V(.47,.45,.48)),d=rayPuzzleBox(V(...camera),dir,box,3.2);
 if(d===null||Math.min(aimQubit(d,dir)?.distance??Infinity,aimCargo(d,dir)?.distance??Infinity)<d-.02)return null;
 return {s,d};
}
function openReconfigurationMenu(dir=direction()){
 const hit=reconfigurationHit(dir);if(!hit)return false;
 if(hit.s.job){announce(hit.s.job.blocked?'Libera la bandeja SALIDA.':'La cámara está reconfigurando.');return true;}
 const items=Object.entries(QBitsReconfiguration.actions).filter(([,action])=>story.level>=action.unlock).map(([key,action])=>({label:action.label,run:()=>{beginReconfiguration(key);captureMouse();}}));
 items.push({label:'Consultar catálogo',run:showCodex},{label:'Cerrar',run:()=>captureMouse()});
 openCommandMenu(add(hit.s.p,V(0,.4,.2)),'Cámara de reconfiguración',items);return true;
}
function drawReconfiguration(){
 const s=story.campaign?.reconfiguration;if(!s)return;
 for(const [point,color]of [[s.intake,[.2,.55,.47,1]],[s.exit,[.5,.63,.68,1]]]){
  drawAsset(storyTargetMesh,add(point,V(0,.003,0)),Q(),V(.38,1,.38),color,3);drawRing(add(point,V(0,.005,0)),.4,.75);
 }
 drawBox(add(s.p,V(.31,.40,.27)),Q(),V(.025,.32,.015),[.2,.42,.36,1]);
 if(s.job){
  const progress=s.job.time/s.job.duration,q=Q();q.setFromEuler(0,simTime*.4,0);
  if(progress<.5){for(const [i,part]of s.job.original.entries())drawUnitMesh({...part,p:add(s.p,V((i%3-1)*.105,.25+Math.floor(i/3)*.1,.08)),q});}
  else for(const [i,part]of s.job.outputs.entries())drawUnitMesh({...part,p:add(s.p,V((i%3-1)*.14,.25+Math.floor(i/3)*.15,.08)),q});
  drawBox(add(s.p,V(.31,.24+.16*progress,.282)),Q(),V(.015,.32*progress,.004),[.5,.9,.72,1]);
 }
}
function reconfigurationLabels(){
 const s=story.campaign?.reconfiguration;if(!s)return [];
 const labels=[{p:add(s.p,V(0,.92,.05)),text:'RECONFIGURACIÓN · '+(s.job?s.job.blocked?'SALIDA ocupada':Math.floor(s.job.time/s.job.duration*100)+' %':'E · operar')},
  {p:add(s.intake,V(0,.08,.1)),text:'ENTRADA'},{p:add(s.exit,V(0,.08,.1)),text:'SALIDA'}];
 for(const g of groups)if(g.parts.length===1&&g.parts[0].mood?.matter?.root===s.root&&g.body.position.z>0)labels.push({p:add(g.body.position,V(0,.14,0)),text:g.parts[0].shape==='cube'?'COMPAÑERO':g.parts[0].shape==='pyramid'?'1/6 · pirámide':'1/12 · triangular'});
 return labels;
}
function catalogueRecipe(kind){
 let parts;
 if(kind==='pyramid'){
  const turn=Q();turn.setFromAxisAngle(V(0,1,0),Math.PI);
  parts=[{shape:'tetra',p:V(CUBE_SIZE/8,0,-CUBE_SIZE/8),q:Q()},{shape:'tetra',p:V(-CUBE_SIZE/8,0,CUBE_SIZE/8),q:turn}];
 }else if(kind==='cube')parts=[V(0,-1,0),V(-1,0,0),V(0,0,-1),V(1,0,0),V(0,0,1),V(0,1,0)].map(normal=>{const q=Q();q.setFromVectors(V(0,-1,0),normal);q.normalize();return {shape:'pyramid',p:mul(normal,3*CUBE_SIZE/8),q};});
 else return null;
 const min=Math.min(...parts.flatMap(corners).map(v=>v.y));
 return {name:kind==='cube'?'Cubo · seis pirámides':'Pirámide · dos triangulares',catalogueId:kind,geometryVersion:3,parts:parts.map(p=>({shape:p.shape,p:[p.p.x,p.p.y-min,p.p.z],q:[p.q.x,p.q.y,p.q.z,p.q.w]}))};
}
const catalogueLessons={...QBitsReconfiguration.lessons,...QBitsAutomation.lessons,...QBitsProduction.lessons};
function catalogueKnown(key){const lesson=catalogueLessons[key];return !!story.progress['lore.'+key]||story.scene==='campaign'&&story.level>=lesson.level;}
function rememberCatalogueRecipe(kind){
 const entry=Object.entries(catalogueLessons).find(([,value])=>value.recipe===kind);
 if(!entry||!catalogueKnown(entry[0]))return false;
 if(savedShapes.some(shape=>shape.catalogueId===kind)){announce('Ese plano ya está entre tus formas guardadas.');return true;}
 if(savedShapes.length>=32){announce('Libera un espacio entre tus formas guardadas.');return false;}
 const recipe=catalogueRecipe(kind);if(!savedShapeValid(recipe)||!assemblyValid(blueprintTargets({shape:recipe,p:V(),q:Q()})))return false;
 savedShapes.push(recipe);persistShapes();updateAlphaPanel();announce('Plano añadido · clic derecho en el suelo → Formas guardadas');return true;
}
function showCodex(){
 if(story.transition||!story.ready)return;story.codexReturn=story.mode==='codex'?story.codexReturn:story.mode;
 closeCommandMenu(false);gameMode('codex');pause(false);panel.hidden=true;
 const list=document.querySelector('#codex-entries');list.replaceChildren();
 for(const [key,entry]of Object.entries(catalogueLessons)){
  const article=document.createElement('article'),title=document.createElement('h3'),text=document.createElement('p'),known=catalogueKnown(key);
  title.textContent=entry.title;text.textContent=known?entry.text:'Se descubre en el nivel '+entry.level+'.';article.append(title,text);
  if(known&&entry.recipe){const button=document.createElement('button');button.textContent='Guardar blueprint · '+(entry.recipe==='cube'?'cubo de seis pirámides':'pirámide de dos triangulares');button.addEventListener('click',()=>rememberCatalogueRecipe(entry.recipe));article.appendChild(button);}list.appendChild(article);
 }
 const learned=Object.keys(catalogueLessons).filter(key=>story.progress['lore.'+key]).length;
 document.querySelector('#codex-progress').textContent=learned+' / '+Object.keys(catalogueLessons).length+' descubrimientos registrados · materia y mecanismos';document.querySelector('#codex-back').focus({preventScroll:true});
}
function closeCodex(){gameMode(story.codexReturn||'menu');if(story.mode==='playing')resumeGame();}

// Shared renderer for the game and the settings specimen. No simulated scene is mutated.
function visualResolution(w,h,s){
 const max=Number(gl.getParameter(gl.MAX_TEXTURE_SIZE))||4096;
 return Math.min(Math.min(window.devicePixelRatio||1,2)*s.resolution/100*s.sampling,Math.sqrt(4500000/Math.max(1,w*h)),max/Math.max(w,h,1));
}
function restoreSceneProgram(){gl.useProgram(program);for(const [location]of attributes)gl.enableVertexAttribArray(location);boundGeometry=null;}
function applyVisualUniforms(){
 surfaceTexture?.bind(visuals);gl.uniform1i(uniforms.uSurface,2);gl.uniform1f(uniforms.uTextureMix,surfaceTexture?1:0);
 gl.uniform1f(uniforms.uTextureScale,visuals.textureScale);gl.uniform1f(uniforms.uWarp,visuals.warp/100);gl.uniform1f(uniforms.uJitter,visuals.jitter/100);gl.uniform2f(uniforms.uResolution,canvas.width,canvas.height);gl.uniform1f(uniforms.uCel,visuals.cel);gl.uniform1f(uniforms.uLighting,visuals.lighting/100);gl.uniform1f(uniforms.uShadows,visuals.shadows==='off'?0:1);
}
function applyPreferences(next){
 resetGameInputs();
 savedPreferences=preferences.sanitize(next);visuals=preferences.effective(savedPreferences);
 window.qbitsSelectionHud?.setHint?.('Mantén '+inputLabel('hud')+' para elegir · Ctrl + clic para quitar');
 window.QBitsSubtitles?.apply(savedPreferences);
 for(const b of encounterBubbles)b.size=null;
 for(const slot of speech.slots)slot.sizeDirty=true;
 window.QBitsMusic?.setVolume(savedPreferences.volume/100);window.QBitsMusic?.setMuted(!savedPreferences.music);
 restoreSceneProgram();resize();redraw=true;
}
function initSettingsScreen(){
 if(settingsScreen||!window.QBitsSettings)return;
 settingsScreen=window.QBitsSettings.init({capabilities:{anisotropy:surfaceTexture?.maxAnisotropy||1},
  open(){closeCommandMenu(false);closeDetachMenu(false);gameMode('settings');pause(false);panel.hidden=true;},
  close(mode){visuals=preferences.effective(savedPreferences);previewViewport=null;restoreSceneProgram();resize();gameMode(mode);redraw=true;},
  apply:applyPreferences
 });
 for(const id of ['main-settings','pause-settings'])document.querySelector('#'+id).addEventListener('click',()=>{if(story.ready&&!story.transition)settingsScreen.open(story.mode);});
}
function drawWorldTriangles(data,color){
 if(!data.length)return;gl.bindBuffer(gl.ARRAY_BUFFER,lineGeometry);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);boundGeometry=null;bindGeometry(lineGeometry);gl.uniform1f(uniforms.uKind,3);setPose(V(),Q(),V(1,1,1));tint(...color);gl.drawArrays(gl.TRIANGLES,0,data.length/6);
}
function drawWideLines(points,color,width=1){
 const basis=cameraBasis(),h=previewViewport?.height||canvas.clientHeight,data=[];
 for(let i=0;i+1<points.length;i+=2){const a=points[i],b=points[i+1],pa=project(a),pb=project(b);if(!pa||!pb)continue;
  const dx=pb.x-pa.x,dy=pb.y-pa.y,len=Math.hypot(dx,dy);if(len<.01)continue;
  const axis=add(mul(basis.right,-dy/len),mul(basis.up,-dx/len));
  const oa=mul(axis,width*pa.depth/(heldFocus.focal*h)),ob=mul(axis,width*pb.depth/(heldFocus.focal*h));
  const aa=add(a,oa),ab=sub(a,oa),ba=add(b,ob),bb=sub(b,ob);
  for(const v of [aa,ab,ba,ba,ab,bb])data.push(v.x,v.y,v.z,0,1,0);
 }
 drawWorldTriangles(data,color);
}
function drawSelectionMarker(anchor,time){
 const projected=project(anchor);if(!projected)return;const h=previewViewport?.height||canvas.clientHeight;
 const basis=cameraBasis(),unit=2*projected.depth/(heldFocus.focal*h),float=visuals.markerMotion?Math.sin(time*2)*3:0;
 const center=add(anchor,mul(basis.up,(23+float)*unit));
 const pts=[[-12,9],[0,2],[12,9],[0,-12]].map(([x,y])=>add(center,add(mul(basis.right,x*unit),mul(basis.up,y*unit))));
 drawWideLines(pts.flatMap((p,i)=>[p,pts[(i+1)%pts.length]]),[...visualRGB('outlineColor'),.95],visuals.outlineWidth);
}
function shadowHull(points){
 const sorted=points.map(p=>V(p.x+.6*Math.max(0,p.y),.0015,p.z-.35*Math.max(0,p.y))).sort((a,b)=>a.x-b.x||a.z-b.z),cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
 const half=list=>{const out=[];for(const p of list){while(out.length>1&&cross(out.at(-2),out.at(-1),p)<=0)out.pop();out.push(p);}out.pop();return out;};
 return [...half(sorted),...half([...sorted].reverse())];
}
function drawProjectedShadow(points){
 const hull=shadowHull(points),data=[];for(let i=1;i+1<hull.length;i++)for(const v of [hull[0],hull[i],hull[i+1]])data.push(v.x,v.y,v.z,0,1,0);
 drawWorldTriangles(data,[.04,.06,.06,.23]);
}
function drawSharpShadow(pose){drawProjectedShadow(unitProfile(pose).vertices.map(p=>add(pose.p,pose.q.vmult(p))));}
function renderSettingsPreview(time){
 const target=document.querySelector('#settings-preview-canvas'),ctx=target.getContext('2d');if(!ctx)return;
 const old={camera:[...camera],yaw,pitch,focal:heldFocus.focal,visuals};
 try{
  visuals=settingsScreen.draft;const w=target.clientWidth,h=target.clientHeight,scale=visualResolution(w,h,visuals);
  previewViewport={width:w,height:h};const rw=Math.max(1,Math.floor(w*scale)),rh=Math.max(1,Math.floor(h*scale));if(canvas.width!==rw)canvas.width=rw;if(canvas.height!==rh)canvas.height=rh;
  // Use a low eye level so the preview reads as a room with a floor and two walls.
  camera.splice(0,3,1.65,1.32,2.5);yaw=.58;pitch=-.28;heldFocus.focal=1.65;
  const destination=postEffects?.begin(canvas.width,canvas.height,visuals)||null;
  restoreSceneProgram();applyVisualUniforms();gl.bindFramebuffer(gl.FRAMEBUFFER,destination);gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(1,1,1,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.BLEND);
  gl.uniform1f(uniforms.uAspect,w/h);gl.uniform1f(uniforms.uFocal,heldFocus.focal);gl.uniform3fv(uniforms.uCamera,camera);gl.uniform2f(uniforms.uLook,yaw,pitch);gl.uniform1f(uniforms.uTime,time/1000);gl.uniform1f(uniforms.uGlow,1);gl.uniform1f(uniforms.uFocusMask,0);
  gl.uniform3fv(uniforms['uLightPos[0]'],new Float32Array([0,.4,.6,0,0,0,0,0,0,0,0,0]));gl.uniform3fv(uniforms['uLightColor[0]'],new Float32Array([...visualRGB('pathColor'),0,0,0,0,0,0,0,0,0]));
  bindGeometry(geometry);gl.uniform1f(uniforms.uKind,0);gl.drawArrays(gl.TRIANGLES,0,vertices.length/6);
  // White panels close the sample room around the rotating specimen.
  drawBox(V(0,1.4,-1.5),Q(),V(5,2.8,.03),[.94,.95,.94,1]);drawBox(V(-1.6,1.4,0),Q(),V(.03,2.8,4),[.91,.93,.92,1]);
  const q=Q();q.setFromAxisAngle(V(0,1,0),time*.00028);const center=V(0,.3,0),size=V(.6,.6,.6);
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
  if(visuals.shadows==='sharp')drawProjectedShadow(unitProfile('cube').vertices.map(p=>add(center,q.vmult(mul(p,.6/CUBE_SIZE)))));
  else if(visuals.shadows==='soft'){bindGeometry(shadowGeometry);gl.uniform1f(uniforms.uKind,2);setPose(V(0,.001,0),Q(),V(1.45,1,1.45));gl.uniform1f(uniforms.uScale,1.45);gl.uniform1f(uniforms.uShadow,.32);gl.drawArrays(gl.TRIANGLES,0,6);}
  gl.depthMask(true);gl.disable(gl.BLEND);bindGeometry(cubeGeometry);gl.uniform1f(uniforms.uKind,1);setPose(center,q,size);gl.drawArrays(gl.TRIANGLES,0,36);
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);drawOutline(center,q,size,1,true);if(visuals.markers)drawSelectionMarker(V(0,.67,0),time/1000);gl.depthMask(true);gl.disable(gl.BLEND);
  drawNeonPath([V(-.1,.006,.65),V(.8,.006,.65),V(.8,.006,.65),V(.8,.006,-.5)]);
  if(destination){postEffects.end(visuals);restoreSceneProgram();}
  if(target.width!==canvas.width)target.width=canvas.width;if(target.height!==canvas.height)target.height=canvas.height;
  ctx.drawImage(canvas,0,0,target.width,target.height);
  document.querySelector('#settings-preview-state').textContent=(postEffects?.failed?'Efectos de pantalla no disponibles · ':visuals.style.toUpperCase()+' · ')+Math.round(visuals.resolution)+' %';
 }finally{camera.splice(0,3,...old.camera);yaw=old.yaw;pitch=old.pitch;heldFocus.focal=old.focal;visuals=old.visuals;previewViewport=null;}
}

// One depth-tested mask keeps carried pieces sharp while the room softens. The
// mask shares the scene depth buffer, so focus never reveals an occluded piece.
const focusVertexSource = `
 attribute vec2 aScreen;
 varying vec2 vUV;
 void main(){vUV=aScreen*.5+.5;gl_Position=vec4(aScreen,0.,1.);}
`;
const focusFragmentSource = `
 precision mediump float;
 uniform sampler2D uScene;
 uniform sampler2D uMask;
 uniform vec2 uStep;
 uniform float uAmount;
 varying vec2 vUV;
 void sampleRoom(inout vec3 sum,inout float weight,vec2 offset,float factor){
   vec2 uv=vUV+offset*uStep;
   // Reject bilinear taps touching the silhouette; fractional weights still leak its color.
   float w=factor*(1.-step(.001,texture2D(uMask,uv).r));
   sum+=texture2D(uScene,uv).rgb*w;weight+=w;
 }
 void main(){
   vec3 original=texture2D(uScene,vUV).rgb;
   float mask=texture2D(uMask,vUV).r;
   vec3 sum=vec3(0.);float weight=0.;
   sampleRoom(sum,weight,vec2(0.,0.),4.);
   sampleRoom(sum,weight,vec2(-1.,0.),2.);sampleRoom(sum,weight,vec2(1.,0.),2.);
   sampleRoom(sum,weight,vec2(0.,-1.),2.);sampleRoom(sum,weight,vec2(0.,1.),2.);
   sampleRoom(sum,weight,vec2(-1.,-1.),1.);sampleRoom(sum,weight,vec2(1.,-1.),1.);
   sampleRoom(sum,weight,vec2(-1.,1.),1.);sampleRoom(sum,weight,vec2(1.,1.),1.);
   // Excluding mask samples prevents dark silhouettes bleeding into the room.
   vec3 room=weight>.001?sum/weight:original;
   gl_FragColor=vec4(mix(original,room,uAmount*(1.-mask)),1.);
 }
`;
const focusPass={failed:false,nativeOnly:false,maxSize:Infinity,width:0,height:0,program:null,quad:null,depth:null,scene:null,mask:null};
function disableFocusPass(){
 for(const key of ['scene','mask'])if(focusPass[key]){gl.deleteTexture(focusPass[key].texture);gl.deleteFramebuffer(focusPass[key].framebuffer);focusPass[key]=null;}
 if(focusPass.depth)gl.deleteRenderbuffer(focusPass.depth);
 if(focusPass.quad)gl.deleteBuffer(focusPass.quad);
 if(focusPass.program)gl.deleteProgram(focusPass.program);
 focusPass.depth=null;focusPass.quad=null;focusPass.program=null;focusPass.failed=true;boundGeometry=null;
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindRenderbuffer(gl.RENDERBUFFER,null);gl.bindTexture(gl.TEXTURE_2D,null);
}
function ensureFocusPass(){
 if(focusPass.failed||gl.isContextLost())return false;
 try{
  if(!focusPass.program){
   const p=gl.createProgram(),vs=shader(gl.VERTEX_SHADER,focusVertexSource),fs=shader(gl.FRAGMENT_SHADER,focusFragmentSource);
   focusPass.program=p;gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);
   if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('Focus shader unavailable');
   focusPass.maxSize=Math.min(Number(gl.getParameter(gl.MAX_TEXTURE_SIZE))||Infinity,Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE))||Infinity);
   focusPass.location=gl.getAttribLocation(p,'aScreen');
   focusPass.uniforms=Object.fromEntries(['uScene','uMask','uStep','uAmount'].map(name=>[name,gl.getUniformLocation(p,name)]));
   focusPass.quad=buffer([-1,-1,1,-1,-1,1,1,1]);boundGeometry=null;focusPass.depth=gl.createRenderbuffer();
   for(const key of ['scene','mask'])focusPass[key]={texture:gl.createTexture(),framebuffer:gl.createFramebuffer()};
   if(!focusPass.depth||!focusPass.scene.texture||!focusPass.mask.texture||!focusPass.scene.framebuffer||!focusPass.mask.framebuffer)throw new Error('Focus buffers unavailable');
  }
  // FBOs have no canvas MSAA. Extra sampling is capped at 4.5 MP and 2× CSS
  // density; larger native canvases retain their resolution without extra cost.
  if(Math.max(canvas.width,canvas.height)>focusPass.maxSize)throw new Error('Focus size unsupported');
  const scale=focusPass.nativeOnly?1:Math.max(1,Math.min(1.5,2*canvas.clientWidth/canvas.width,Math.sqrt(4500000/(canvas.width*canvas.height)),focusPass.maxSize/Math.max(canvas.width,canvas.height)));
  const width=Math.max(1,Math.floor(canvas.width*scale)),height=Math.max(1,Math.floor(canvas.height*scale));
  if(focusPass.width!==width||focusPass.height!==height){
   const allocate=(w,h)=>{
    // Clear a failed larger allocation before retrying, including a retained OOM.
    for(let i=0;i<8;i++){const error=gl.getError();if(!error||error===gl.NO_ERROR)break;}
    gl.bindRenderbuffer(gl.RENDERBUFFER,focusPass.depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,w,h);
    for(const key of ['scene','mask']){
     const target=focusPass[key];gl.bindTexture(gl.TEXTURE_2D,target.texture);
     for(const parameter of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,parameter,gl.LINEAR);
     for(const parameter of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,parameter,gl.CLAMP_TO_EDGE);
     gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
     gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target.texture,0);
     gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,focusPass.depth);
     if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Focus framebuffer incomplete');
    }
    const error=gl.getError();if(error&&error!==gl.NO_ERROR)throw new Error('Focus allocation failed');
    focusPass.width=w;focusPass.height=h;
   };
   try{allocate(width,height);}catch(error){
    if(width===canvas.width&&height===canvas.height)throw error;
    focusPass.nativeOnly=true;allocate(canvas.width,canvas.height);
   }
   gl.bindRenderbuffer(gl.RENDERBUFFER,null);gl.bindTexture(gl.TEXTURE_2D,null);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }
  return true;
 }catch{disableFocusPass();return false;}
}
function compositeHeldFocus(destination=null){
 gl.bindFramebuffer(gl.FRAMEBUFFER,focusPass.mask.framebuffer);
 gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.clearColor(1,1,1,1);
 gl.disable(gl.BLEND);gl.depthMask(false);gl.depthFunc(gl.LEQUAL);gl.uniform1f(uniforms.uFocusMask,1);
 for(const g of heldFocus.groups)if(groups.includes(g)){
  drawGroupSolid(g);
  if(g.block){const p=moodVisualPose(g,blockPose(g));drawOutline(p.p,p.q,p.size);}
  else if(multiSelection.includes(g))for(const pose of poses(g))drawUnitOutline(pose);
 }
 gl.uniform1f(uniforms.uFocusMask,0);gl.depthFunc(gl.LESS);gl.depthMask(true);
 gl.bindFramebuffer(gl.FRAMEBUFFER,destination);gl.viewport(0,0,canvas.width,canvas.height);gl.disable(gl.DEPTH_TEST);
 for(const [location]of attributes)gl.disableVertexAttribArray(location);
 gl.useProgram(focusPass.program);gl.bindBuffer(gl.ARRAY_BUFFER,focusPass.quad);gl.enableVertexAttribArray(focusPass.location);gl.vertexAttribPointer(focusPass.location,2,gl.FLOAT,false,0,0);
 gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,focusPass.scene.texture);gl.uniform1i(focusPass.uniforms.uScene,0);
 gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,focusPass.mask.texture);gl.uniform1i(focusPass.uniforms.uMask,1);
 const radius=2.8*heldFocus.amount;gl.uniform2f(focusPass.uniforms.uStep,radius/canvas.clientWidth,radius/canvas.clientHeight);gl.uniform1f(focusPass.uniforms.uAmount,heldFocus.amount);
 gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
 gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,null);
 gl.disableVertexAttribArray(focusPass.location);gl.useProgram(program);for(const [location]of attributes)gl.enableVertexAttribArray(location);
 boundGeometry=null;gl.enable(gl.DEPTH_TEST);
}

initSpeech();
let previousTime = performance.now();
function renderScene(){
  const destination=postEffects?.begin(canvas.width,canvas.height,visuals)||null;
  const focused=heldFocus.amount>.001&&ensureFocusPass();
  restoreSceneProgram();applyVisualUniforms();
  gl.bindFramebuffer(gl.FRAMEBUFFER,focused?focusPass.scene.framebuffer:destination);
  gl.viewport(0,0,focused?focusPass.width:canvas.width,focused?focusPass.height:canvas.height);
  gl.uniform1f(uniforms.uFocal,heldFocus.focal);
  updateAccentLights();
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.uniform3fv(uniforms.uCamera,camera);
  gl.uniform2f(uniforms.uLook,yaw,pitch);
  bindGeometry(geometry);
  gl.uniform1f(uniforms.uKind,0);
  gl.drawArrays(gl.TRIANGLES,0,vertices.length/6);
  drawStoryWorld();drawQubits();drawStoryGlass();
  if(focused)compositeHeldFocus(destination);
  if(destination){postEffects.end(visuals);restoreSceneProgram();}
  redraw=false;
}
function frame(time) {
  if (!running) return;
  const dt = Math.min(Math.max((time - previousTime) / 1000, 0), 0.05);
  let distance = 0;
  previousTime = time;
  pollGamepadInput(dt);
  updateSelectionHud(dt);
  if(settingsScreen?.isOpen){
    accumulator=0;
    if(!document.hidden && time-lastVisualFrame>=1000/30){renderSettingsPreview(time);lastVisualFrame=time;}
    requestAnimationFrame(frame);return;
  }
  if(radialOpen()){
    accumulator=0;if(!unitRadialAllowed())closeUnitRadial(false);
    updateHeldFocus(dt,false);if(redraw&&!document.hidden)renderScene();
    requestAnimationFrame(frame);return;
  }
  tickStory(dt);
  const frozen=storySuspended()||!!story.transition;
  const active=gameInputActive()&&!document.hidden&&!frozen;
  if(!frozen)updatePosture(dt,active&&storyWalkAllowed(),keys.has('KeyC'));
  if (active) {
    const forward = clamp(Number(keys.has('KeyW')) - Number(keys.has('KeyS'))-gamepadMove[1],-1,1);
    const sideways = clamp(Number(keys.has('KeyD')) - Number(keys.has('KeyA'))+gamepadMove[0],-1,1);
    if ((forward || sideways) && storyWalkAllowed() && !marquee && !(held && shiftDown())) {
      const oldX = position[0], oldZ = position[2];
      const analogSpeed=Math.min(1,Math.hypot(forward,sideways));
      movePlayer(position, yaw, forward, sideways, dt,(posture.height<EYE_HEIGHT-.1?.58:1)*analogSpeed);
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
  updateHeldFocus(dt,active);
  if (!document.hidden&&!frozen) {
    accumulator += dt;
    while (accumulator >= FIXED_STEP) { stepPhysics(FIXED_STEP); accumulator -= FIXED_STEP; }
    updateTarget();
    updateSpeech();updateStoryMarker();
    redraw = true;
  }
  if (redraw && !document.hidden && (!visuals.fps || time-lastVisualFrame>=1000/visuals.fps-.5)) {
    lastVisualFrame=time;renderScene();
  }
  requestAnimationFrame(frame);
}
let gamePrepared=false;
const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
window.QBitsGame={
  applyPreferences:()=>applyPreferences(savedPreferences),
  async prepare(onProgress=()=>{}){
    if(gamePrepared)return;
    initUnitRadial();initStory();initSettingsScreen();initSelectionHud();resize();onProgress(.25);
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
  menu(){if(!gamePrepared)return;previousTime=performance.now();accumulator=0;showMain();},
  play(){if(!gamePrepared)return;story.started=true;previousTime=performance.now();accumulator=0;resumeGame();}
};

})();
