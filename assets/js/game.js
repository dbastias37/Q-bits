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
let radialGlassStamp='',radialGlassAllocated=false;
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
const mechanismDefaults={driveRating:2,rpm:30,direction:1,moving:'b',mount:'wheel',maxTorque:3.2,capacity:256};

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

const postEffects=window.QBitsGraphics?.create(gl),surfaceTexture=window.QBitsGraphics?.surface(gl),radialGlass=window.QBitsGlass?.create(gl);
// Visibility is a render decision only. Bodies, energy, routes and sensors keep
// their normal simulation even when none of their geometry reaches the GPU.
const visibilityFrustum=window.QBitsCulling?.createFrustum();
const renderVisibility={active:false,enabled:false,serial:0,groups:0,culled:0,pieces:0,hiddenPieces:0,shadowGroups:0};
const cullingLab={observer:false,stats:false,renderView:null,benchmark:null,result:null,last:null,frameSamples:[],simulationMs:0,lastFrame:null,nextHud:0,gpu:null};
const renderCounts={active:false,calls:0,triangles:0,lines:0};
const geometryRadii=new Map();
function submitDraw(mode,first,count){
 if(renderCounts.active){renderCounts.calls++;if(mode===gl.TRIANGLES)renderCounts.triangles+=count/3;else if(mode===gl.TRIANGLE_STRIP)renderCounts.triangles+=Math.max(0,count-2);else if(mode===gl.LINES)renderCounts.lines+=count/2;}
 gl.drawArrays(mode,first,count);
}
function deleteRenderBuffer(b){geometryRadii.delete(b);gl.deleteBuffer(b);}
function renderSphereVisible(p,r){return !renderVisibility.active||!renderVisibility.enabled||visibilityFrustum.intersectsSphere(p.x,p.y,p.z,r+.025);}
function renderPointsVisible(points,padding=.04){
 if(!renderVisibility.active||!renderVisibility.enabled||!points.length)return true;
 let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
 for(const p of points){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);minZ=Math.min(minZ,p.z);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);maxZ=Math.max(maxZ,p.z);}
 return visibilityFrustum.intersectsSphere((minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2,Math.hypot(maxX-minX,maxY-minY,maxZ-minZ)/2+padding);
}
function renderGroupRadius(g){
 let cached=g.renderRadius;
 if(!cached||cached.parts!==g.parts){
  let extra=0;
  for(const module of propellerLayout(g)){
   const hub=module.hub,tip=add(hub.offset,hub.q.vmult(V(0,CUBE_SIZE*51/56,0)));
   for(const blade of module.blades)for(const v of unitProfile(blade).vertices){const p=add(blade.offset,blade.q.vmult(v));extra=Math.max(extra,tip.norm()+p.distanceTo(tip));}
  }
  cached=g.renderRadius={parts:g.parts,extra};
 }
 const pivotPadding=g.virtualConveyor?2*rotorMovingFrame(g.virtualConveyor.rotor,g).pivot.norm():0;
 return Math.max(g.body.boundingRadius,cached.extra)+pivotPadding+.03;
}
function renderGroupVisible(g){
 if(!renderVisibility.active||!renderVisibility.enabled)return true;
 if(g.renderVisibilitySerial!==renderVisibility.serial){g.renderVisibilitySerial=renderVisibility.serial;g.renderVisible=renderSphereVisible(g.body.position,renderGroupRadius(g));}
 return g.renderVisible;
}
function renderShadowVisible(g){
 if(!renderVisibility.enabled)return true;
 const p=g.body.position,r=renderGroupRadius(g);
 return visuals.shadows==='sharp'?visibilityFrustum.intersectsSphere(p.x+.6*Math.max(0,p.y),.0015,p.z-.35*Math.max(0,p.y),r*1.219+.025):visibilityFrustum.intersectsSphere(p.x,.001,p.z,r+.43);
}
const vertexSource = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  attribute vec3 aPiecePosition;
  attribute vec3 aPieceNormal;
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
    vec3 texPos=uKind>.5?aPiecePosition:world;
    vec3 n=abs(aPieceNormal);
    vSurfaceUV=n.y>.5?texPos.xz:(n.x>.5?texPos.zy:texPos.xy);
    vAffineUV=vec3(vSurfaceUV*depth,depth);
    vPosition = world;
    vNormal = uKind > 0.5 ? rotate(aNormal) : aNormal;
    vLocal = aPiecePosition;
    vLocalNormal = aPieceNormal;
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
  uniform vec3 uLiquidNormal;
  uniform vec4 uLiquidPlane;
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
    if (uKind > 16.5) {
      // Cached circuit ribbons encode transverse/longitudinal coordinates in
      // the unused normal channel, preserving one buffer and draw per cable.
      float x=abs(vLocalNormal.x),z=abs(vLocalNormal.z);
      float halo=.22*uShadow*exp(-x*9.0)*(1.-smoothstep(.28,.5,x))*(1.-smoothstep(.40,.5,z));
      float core=.8*(1.-smoothstep(.03,.04,x));
      gl_FragColor=vec4(uTint.rgb,uTint.a*(core+halo*(1.-core)));return;
    }
    if (uKind > 15.5) {
      // Clear battery vessel: restrained face opacity, bright glass edges and
      // a broad reflection remain legible even when the reservoir is empty.
      vec3 n=normalize(vNormal),view=normalize(uCamera-vPosition);
      float fres=pow(1.0-abs(dot(n,view)),2.5);
      vec3 border=vec3(.5)-abs(vLocal)+abs(vLocalNormal);
      float edge=1.0-smoothstep(.004,.035,min(border.x,min(border.y,border.z)));
      float reflection=pow(max(0.0,dot(reflect(-normalize(vec3(-.6,1.,.8)),n),view)),24.0);
      vec3 glass=mix(vec3(.53,.76,.68),vec3(.96,1.,.98),min(1.,fres*.6+edge*.5+reflection*.7));
      gl_FragColor=vec4(glass,.045+fres*.22+edge*.23+reflection*.18);return;
    }
    if (uKind > 14.5) {
      // The volume is clipped against the gravity/slosh plane before drawing.
      // Its cap has a world-space normal, independent of the vessel's rotation.
      vec3 n=normalize(vNormal),view=normalize(uCamera-vPosition);
      float light=.68+.28*max(0.,dot(n,normalize(vec3(-.6,1.,.35))));
      float surface=step(.999,dot(n,uLiquidNormal));
      float meniscus=1.-smoothstep(.0002,.0015,abs(dot(uLiquidPlane.xyz,vLocal)-uLiquidPlane.w));
      float ripple=.025*sin(vPosition.x*170.+vPosition.z*130.+uTime*.8);
      float sheen=pow(max(0.,dot(reflect(-normalize(vec3(-.6,1.,.8)),n),view)),20.);
      vec3 green=mix(uTint.rgb*light,vec3(.24,.96,.51),surface*.55+meniscus*.22);
      gl_FragColor=vec4(green+vec3(.08,.16,.10)*(sheen+surface*ripple),1.);return;
    }
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
for (const [name, offset] of [['aPosition', 0], ['aNormal', 12], ['aPiecePosition', 0], ['aPieceNormal', 12]]) {
  const location = gl.getAttribLocation(program, name);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 24, offset);
}
const uniforms = Object.fromEntries(['uJitter','uResolution','uSurface','uTextureMix','uTextureScale','uWarp','uCel','uLighting','uShadows','uFocal','uFocusMask','uGlow','uLightPos[0]','uLightColor[0]','uTime','uCamera','uLook','uAspect','uSize','uHeight','uKind','uCenter','uScale','uShadow','uDimensions','uQuaternion','uTint','uLiquidNormal','uLiquidPlane'].map(name => [name, gl.getUniformLocation(program, name)]));
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
function gameInputActive(){return panel.hidden&&!hudInputActive&&(document.pointerLockElement===canvas||gamepadActive);}
function inputLabel(action){return window.QBitsControls?.labelFor(action,savedPreferences)||action;}
function controlEvent(code,event={},source='keyboard'){return {code,repeat:false,target:canvas,clientX:event.clientX??canvas.clientWidth/2,clientY:event.clientY??canvas.clientHeight/2,altKey:altDown()||(!!event.altKey&&!/^Alt/.test(event.code||'')),ctrlKey:ctrlDown()||(!!event.ctrlKey&&!/^Control/.test(event.code||'')),shiftKey:shiftDown()||!!event.shiftKey,metaKey:!!event.metaKey,source,preventDefault(){event.preventDefault?.();},stopPropagation(){event.stopPropagation?.();}};}
function setHudInput(enabled,source='keyboard'){
 if(enabled){if(hudInputActive||!window.qbitsSelectionHud?.available||story.mode!=='playing'||story.transition||!panel.hidden||!menu.hidden||!commandMenu.hidden)return;hudInputActive=true;hudReturnCapture=document.pointerLockElement===canvas;keys.clear();gamepadMove=[0,0];window.qbitsSelectionHud.setHint?.(source==='gamepad'?window.QBitsControls.gamepadHint(savedPreferences.controls.gamepad,'hud'):'← → · elegir · Enter · aislar · Ctrl + clic · quitar');window.qbitsSelectionHud.setInteractive(true,source);if(hudReturnCapture){story.intentionalUnlock=true;story.preserveGrip=true;document.exitPointerLock();}}
 else {if(!hudInputActive)return;hudInputActive=false;window.qbitsSelectionHud?.setInteractive(false,source);const capture=hudReturnCapture;hudReturnCapture=false;if(capture&&!document.hidden&&story.mode==='playing'&&!story.transition)captureMouse();}
}
function dispatchControlAction(id,down,source='keyboard',event={}){
 if(cullingLab.benchmark)return;
 if(cullingLab.observer&&down&&!['forward','backward','left','right','crouch','pause','tools','fullscreen'].includes(id)){announce('Modo observador · 7 numérico para volver y manipular');return;}
 const token=source+':'+id,holders=controlHolds.get(id)||new Set();
 if(down){if(holders.has(token))return;holders.add(token);controlHolds.set(id,holders);if(holders.size>1)return;}
 else {holders.delete(token);if(holders.size)return;controlHolds.delete(id);}
 if(id==='tablet'){if(down)toggleTablet();return;}
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
  const hit=aimQubit();if(!hit)return;const rotor=rotorForPart(hit.part.id);if(rotor){toggleRotorSelection(rotor);announce(selectedRotors().length+' rotores seleccionados · clic derecho o P para controles');return;}clearRotorSelection();let team=selectedTeam();team=team.includes(hit.g)?team.filter(g=>g!==hit.g):[...team,hit.g];if(team.reduce((n,g)=>n+g.parts.length,0)>settings.maxSelect){announce('Máximo '+settings.maxSelect+' piezas seleccionadas');return;}multiSelection=team;selected=team.length?{g:team.includes(hit.g)?hit.g:team[0],part:team.includes(hit.g)?hit.part:team[0].parts[0]}:null;speech.nextHud=0;return;
 }
 if(id==='clear'&&storyActionAllowed()){if(held)releaseQubit(false);clearSelection();return;}
 if((id==='near'||id==='far')&&storyLookAllowed()){handleWheel({...e,deltaY:0,distanceAction:id==='near'?-1:1});return;}
 handleKey(e);
}
function releaseInputSource(source){for(const [id,holders]of [...controlHolds])if(holders.has(source+':'+id))dispatchControlAction(id,false,source,{cancelled:true});}
function resetGameInputs(){keyboardInput?.clear();releaseInputSource('gamepad');gamepadActive=false;gamepadMove=[0,0];controller?.reset();if(hudInputActive){hudReturnCapture=false;setHudInput(false);}keys.clear();}
function onPhysicalKeyDown(event){
 if(cullingLab.benchmark){if(event.code==='Escape'){event.preventDefault();cancelCullingBenchmark();}return;}
 if(tabletVisible()&&!event.defaultPrevented){
  const action=window.QBitsControls?.keyboardAction(savedPreferences.controls.keyboard,event.code);
  if(action==='tablet'||event.code==='Escape'||workshopPanel?.isOpen&&event.code==='KeyE'&&!editableTarget(event.target)){
   event.preventDefault();if(!event.repeat)stowTablet();return;
  }
  if(!tabletTyping(event.target)&&!tabletTyping(document.activeElement)&&['forward','backward','left','right','crouch'].includes(action)){
   keyboardInput.down(event.code,event);event.preventDefault();return;
  }
 }
 if(event.defaultPrevented||settingsScreen?.isOpen||editableTarget(event.target)||editableTarget(document.activeElement))return;
 if(story.mode==='playing'&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!window.QBitsControls?.keyboardAction(savedPreferences.controls.keyboard,event.code)&&['Numpad7','Numpad8','Numpad9','Slash'].includes(event.code)){event.preventDefault();if(!event.repeat)({'Numpad7':toggleCullingObserver,'Numpad8':toggleCullingStats,'Numpad9':startCullingBenchmark,'Slash':toggleCulling})[event.code]();return;}
 if(!event.repeat&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&(event.code==='Backquote'||event.key==='º')&&quickWake()){event.preventDefault();return;}
 if(robotPoseDraft&&['Escape','Enter'].includes(event.code)){handleKey(event);return;}
 if(event.code==='Escape'){event.preventDefault();if(hudInputActive){hudReturnCapture=false;setHudInput(false);}handleKey(controlEvent('Escape',event));return;}
 if(hudInputActive&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter','Space'].includes(event.code)){event.preventDefault();if(event.code==='Enter'||event.code==='Space')window.qbitsSelectionHud?.activateFocused({toggle:ctrlDown()||event.ctrlKey,source:'keyboard'});else window.qbitsSelectionHud?.stepFocus(event.code==='ArrowLeft'||event.code==='ArrowUp'?-1:1);return;}
 if(radialOpen()&&(event.code.startsWith('Arrow')||['Tab','PageUp','PageDown'].includes(event.code))){handleKey(event);return;}
 if(story.ready&&story.mode!=='playing'&&!['pause','fullscreen'].includes(window.QBitsControls?.keyboardAction(savedPreferences.controls.keyboard,event.code)))return;
 gamepadActive=false;
 if(keyboardInput?.down(event.code,event))event.preventDefault();else if(!keyboardInput)handleKey(event);
}
function onPhysicalKeyUp(event){
 if(keyboardInput?.up(event.code,event)){event.preventDefault();return;}
 if(!keyboardInput){handleKeyUp(event);return;}
 // Opening a panel releases input capture. A walking key can span that change.
 const action=window.QBitsControls.keyboardAction(savedPreferences.controls.keyboard,event.code);
 if(tabletMovement[action])keys.delete(tabletMovement[action]);
}
function onPhysicalMouseDown(event){
 if(!settingsScreen?.isOpen&&!robotPoseDraft&&window.QBitsControls?.keyboardAction(savedPreferences.controls.keyboard,'Mouse'+event.button)==='tablet'){event.preventDefault();toggleTablet();return;}
 robotPoseHandledClick=false;if(robotPoseDraft){robotPoseHandledClick=event.button===0;robotPoseMouse(event);return;}if(hudInputActive||settingsScreen?.isOpen||workshopPanel?.isOpen)return;gamepadActive=false;if(keyboardInput?.down('Mouse'+event.button,event))event.preventDefault();else if(!keyboardInput)onCanvasMouseDown(event);}
function onPhysicalMouseUp(event){if(keyboardInput?.up('Mouse'+event.button,event))event.preventDefault();else if(!keyboardInput||(event.button===0&&savedPreferences.controls?.keyboard.bindings.primary==='Mouse0'&&!controlHolds.has('primary')))onCanvasMouseUp(event);}
function inputMenuScope(){
 if(workshopPanel?.isOpen)return document.querySelector('#workshop-screen');
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
 const uiMode=settingsScreen?.isOpen||workshopPanel?.isOpen||story.ready&&(story.mode!=='playing'||!panel.hidden||!menu.hidden||!commandMenu.hidden||['choice','repeat'].includes(story.phase));
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
  if(robotPoseDraft){hint.hidden=true;redraw=true;return;}
  showHint(blockedHint);
}

function pause(release=true) {
  window.QBitsGuideAudio?.setPaused(true);window.QBitsFootsteps?.setPaused(true);window.QBitsJoinAudio?.setPaused(true);
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
  if(cullingLab.benchmark)cancelCullingBenchmark();
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
 if(workshopPanel?.isOpen)closeWorkshopPanel(false);
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

let robotPoseHandledClick=false;
canvas.addEventListener('click',()=>{
 if(robotPoseHandledClick){robotPoseHandledClick=false;return;}
 if(!tabletVisible())captureMouse();
});
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
  if(locked||panel.hidden||!tabletVisible())keys.clear();
  if (locked) { story.intentionalUnlock=false;story.preserveGrip=false;hint.hidden=true;completePendingPickup(); }
  else { const expected=story.intentionalUnlock;story.intentionalUnlock=false;
    if(!expected&&robotPoseDraft){returnRobotPosePanel();return;}
    if(story.ready&&!expected&&story.mode==='playing'&&panel.hidden&&commandMenu.hidden&&menu.hidden){openPauseMenu();}
    if(!story.preserveGrip)releaseQubit();
    if((!story.ready||story.mode==='playing')&&panel.hidden&&menu.hidden&&commandMenu.hidden&&!['asleep','invocation','choice','repeat'].includes(story.phase))showHint(pausedHint);else hint.hidden=true;
  }
});
document.addEventListener('pointerlockerror', lockFailed);
document.addEventListener('mousemove', event => {
  if(cullingLab.benchmark)return;
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
const CUBE_SIZE=.09, HALF=.045, MAX_QUBITS=2000;
let FIXED_STEP=1/savedPreferences.physicsHz;
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
const settings={mass:1,unitShape:'cube',gravity:9.8,bounce:.12,force:60,friction:.38,damping:.12,speed:.32,guide:'ghost',line:'dashed',maxCarry:2000,maxSelect:2000,rotationSpeed:2.8,grip:.95,cargoSide:4,cargoRequired:8,cargoColor:'#f4f4f1',haulSpeed:.2,haulForce:2};
const disassemblyJobs=[];
const groups=[],cargos=[],rotors=[];let rotorSerial=0;
const flightStates=new Map();
// Only ownership and connections survive a substep. Positions, contacts and
// electrical supply remain live. Topology edits invalidate before AND after
// callbacks, which may query the still-existing assembly during removal.
let mechanicalStepCache=null,mechanicalTopology=null;
function invalidateMechanicalIndex(){
 mechanicalTopology=null;
 if(mechanicalStepCache){mechanicalStepCache.parts=null;mechanicalStepCache.components.clear();mechanicalStepCache.electricalGraph=null;}
}
function mechanicalTopologyIndex(){
 if(mechanicalTopology)return mechanicalTopology;
 const parts=new Map(),byPart=new Map(),byGroup=new Map(),byPair=new Map(),edges=new Map(groups.map(g=>[g,[]]));
 for(const g of groups)for(const part of g.parts)parts.set(part.id,{g,part});
 for(const rotor of rotors){
  for(const id of [rotor.aId,rotor.bId]){if(!byPart.has(id))byPart.set(id,rotor);const g=parts.get(id)?.g;if(g&&!byGroup.has(g))byGroup.set(g,rotor);}
  const key=rotor.aId+':'+rotor.bId;if(!byPair.has(key))byPair.set(key,rotor);
  const a=parts.get(rotor.aId)?.g,b=parts.get(rotor.bId)?.g;if(a&&b){edges.get(a).push(b);edges.get(b).push(a);}
 }
 return mechanicalTopology={parts,byPart,byGroup,byPair,edges,components:new Map()};
}
function mechanicalPartIndex(){return mechanicalTopologyIndex().parts;}
function rotorForPair(pair){return mechanicalTopologyIndex().byPair.get(pair.aId+':'+pair.bId)||null;}
const rotorSets=[];let rotorSetSerial=0,selectedRotorIds=[];
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
// Long belts have a very large bounding sphere. Use their actual conservative
// AABB to reject distant bodies before Cannon visits every compound shape.
world.broadphase.useBoundingBoxes=true;
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
function partPose(g,p,pos=g.body.position,quat=g.body.quaternion){if(g.virtualConveyor&&pos===g.body.position&&quat===g.body.quaternion)syncVirtualConveyorGroup(g);return {p:add(pos,quat.vmult(p.offset)),q:quat.mult(p.q),part:p,g};}
function poses(g,pos,quat){return g.parts.map(p=>partPose(g,p,pos,quat));}
function worldParts(g){return poses(g).map(o=>({id:o.part.id,weight:o.part.weight,shape:unitShape(o),p:o.p,q:o.q,mood:copyMood(o.part.mood)}));}
function allocateUnitId(){return ++serial;}
// Compact only exact rectangular runs of aligned cubes. Material identities,
// concave gaps and articulated bodies remain separate. Sensors keep their own
// contact shape so a neighbouring cell cannot activate their face.
function rigidColliderLayout(parts){
 const layout=[],buckets=[],key=(x,y,z)=>x+','+y+','+z,gridTolerance=1e-8;
 for(const part of parts){
  if(unitShape(part)!=='cube'||QBitsWorkshop.partState(part).sensor){layout.push({parts:[part],offset:part.offset,q:part.q,half:null});continue;}
  let bucket=null,cell=null;
  for(const candidate of buckets){
   const relative=candidate.inverse.mult(part.q);
   if(!axes.every(axis=>{const v=relative.vmult(axis),values=[Math.abs(v.x),Math.abs(v.y),Math.abs(v.z)].sort((a,b)=>b-a);return Math.abs(values[0]-1)<1e-9&&values[1]<1e-9&&values[2]<1e-9;}))continue;
   const p=candidate.inverse.vmult(sub(part.offset,candidate.origin)),coordinates=['x','y','z'].map(k=>Math.round(p[k]/CUBE_SIZE));
   if(['x','y','z'].some((k,i)=>Math.abs(p[k]-coordinates[i]*CUBE_SIZE)>gridTolerance)||candidate.cells.has(key(...coordinates)))continue;
   bucket=candidate;cell=coordinates;break;
  }
  if(!bucket){bucket={q:part.q,inverse:part.q.inverse(),origin:part.offset,cells:new Map()};buckets.push(bucket);cell=[0,0,0];}
  bucket.cells.set(key(...cell),{part,cell});
 }
 for(const bucket of buckets){
  const remaining=new Map(bucket.cells),ordered=[...bucket.cells.values()].sort((a,b)=>a.cell[1]-b.cell[1]||a.cell[2]-b.cell[2]||a.cell[0]-b.cell[0]);
  for(const seed of ordered){const [x,y,z]=seed.cell;if(!remaining.has(key(x,y,z)))continue;let nx=1,ny=1,nz=1;
   while(remaining.has(key(x+nx,y,z)))nx++;
   const row=zz=>{for(let xx=0;xx<nx;xx++)if(!remaining.has(key(x+xx,y,zz)))return false;return true;};while(row(z+nz))nz++;
   const layer=yy=>{for(let zz=0;zz<nz;zz++)for(let xx=0;xx<nx;xx++)if(!remaining.has(key(x+xx,yy,z+zz)))return false;return true;};while(layer(y+ny))ny++;
   const members=[];for(let yy=0;yy<ny;yy++)for(let zz=0;zz<nz;zz++)for(let xx=0;xx<nx;xx++){const k=key(x+xx,y+yy,z+zz);members.push(remaining.get(k).part);remaining.delete(k);}
   if(members.length===1)layout.push({parts:members,offset:seed.part.offset,q:seed.part.q,half:null});
   else layout.push({parts:members,offset:add(bucket.origin,bucket.q.vmult(V((x+(nx-1)/2)*CUBE_SIZE,(y+(ny-1)/2)*CUBE_SIZE,(z+(nz-1)/2)*CUBE_SIZE))),q:bucket.q,half:V(nx*HALF,ny*HALF,nz*HALF)});
  }
 }return layout;
}
function addRigidCollisionShapes(body,parts){
 const owners=new Map();
 for(const collider of rigidColliderLayout(parts)){
  const part=collider.parts[0],profile=unitProfile(part),shape=collider.half?new CANNON.Box(collider.half):isTBit(part)?new CANNON.ConvexPolyhedron(profile.vertices.map(v=>v.clone()),profile.faces.map(f=>f.slice())):cubeShape();
  // Cannon 0.6 addShape recalculates the entire body after every insertion.
  // This body is not in the world yet: append the same cloned shape transforms
  // and calculate its radius/mass once, including unmergeable convex pieces.
  body.shapes.push(shape);body.shapeOffsets.push(collider.offset.clone());body.shapeOrientations.push(collider.q.clone());for(const member of collider.parts)owners.set(member.id,shape);
 }
 body.updateBoundingRadius();body.aabbNeedsUpdate=true;return owners;
}
function groupAngularDamping(count){return count>1?Math.max(settings.damping,Math.min(.65,.24+Math.log2(count)*.065)):settings.damping;}
function makeGroup(parts,reference=Q(),velocity=V(),spin=V()) {
 invalidateMechanicalIndex();
 serial=Math.max(serial,...parts.map(p=>p.id));
 const weight=parts.reduce((n,p)=>n+p.weight,0),center=V();
 for(const p of parts)center.vadd(mul(p.p,p.weight/weight),center);
 const inv=reference.inverse(),body=new CANNON.Body({mass:weight*.25,allowSleep:true,sleepSpeedLimit:.025,sleepTimeLimit:.6});
 body.collisionFilterMask=-1;body.position.copy(center);body.quaternion.copy(reference);body.velocity.copy(velocity);body.angularVelocity.copy(spin);
 body.linearDamping=.03;body.angularDamping=groupAngularDamping(parts.length);
 const local=parts.map(p=>{const shape=unitShape(p),mood=newMood(p.id,p.mood);if(!p.mood&&shape!=='cube')mood.name=(shape==='coupler'?'Enganche ':'T-bit ')+p.id;return {id:p.id,weight:p.weight,shape,offset:inv.vmult(sub(p.p,center)),q:inv.mult(p.q),mood};});
 const partShapes=addRigidCollisionShapes(body,local),materialShapeCount=body.shapes.length;
 body.updateMassProperties();world.addBody(body);
 const g={body,parts:local,partShapes,materialShapeCount,route:null,pin:null};body.qubitGroup=g;body.addEventListener('wakeup',()=>{g.wakeMechanicalComponent=true;});g.block=analyzeBlock(g);groups.push(g);invalidateMechanicalIndex();registerSpeechGroup(g);return g;
}
function addQubit(p,weight=settings.mass,shape='cube'){return makeGroup([{id:++serial,weight,shape:normalizeUnitShape(shape),p:V(...p),q:Q()}]);}
function removeGroup(g){materializeConveyorsForGroup(g);disposeRigidCubeBatch(g);disposeRigidOutline(g);robotBeforeRemoveGroup(g);invalidateMechanicalIndex();resetBatteryLiquids(g.body);invalidateRotorBody(g);undockCampaignGroup(g);removeSpeechGroup(g);leaveHaul(g);stopRoute(g);world.removeBody(g.body);const i=groups.indexOf(g);if(i>=0)groups.splice(i,1);invalidateMechanicalIndex();if(selected?.g===g)selected=null;multiSelection=multiSelection.filter(item=>item!==g);}
function corners(pose){if(isTBit(pose))return unitProfile(pose).vertices.map(v=>add(pose.p,pose.q.vmult(v)));const out=[],half=pose.half||V(HALF,HALF,HALF);for(const x of [-half.x,half.x])for(const y of [-half.y,half.y])for(const z of [-half.z,half.z])out.push(add(pose.p,pose.q.vmult(V(x,y,z))));return out;}
// Rigid geometry is immutable between makeGroup/removeGroup. A translation
// never changes its rotated extents. Keep a bounded set of exact orientations
// for hand sweeps, rotation previews, selection and all placement queries.
function rotatedGroupBounds(g,quat){
 let cache=g.rotatedBoundsCache;
 if(!cache||cache.parts!==g.parts)cache=g.rotatedBoundsCache={parts:g.parts,entries:[]};
 const found=cache.entries.find(c=>c.x===quat.x&&c.y===quat.y&&c.z===quat.z&&c.w===quat.w);if(found)return found;
 const min=V(Infinity,Infinity,Infinity),max=V(-Infinity,-Infinity,-Infinity);
 if(g.parts.length>16){
  // Exact support extrema of the original local vertices. A hierarchy skips
  // interior vertices instead of transforming the whole chassis nine times
  // per hand target and again for every rotation sweep sample.
  let local=g.localBoundsTree;
  if(!local||local.parts!==g.parts){const points=rigidQueryPoses(g,V(),Q()).flatMap(corners);local=g.localBoundsTree={parts:g.parts,tree:collisionIndex(points.map(point=>({min:point,max:point})))};}
  const {x,y,z,w}=quat,rows=[[w*w+x*x-y*y-z*z,2*(x*y-w*z),2*(x*z+w*y)],[2*(x*y+w*z),w*w-x*x+y*y-z*z,2*(y*z-w*x)],[2*(x*z-w*y),2*(y*z+w*x),w*w-x*x-y*y+z*z]];
  for(let i=0;i<3;i++){const [dx,dy,dz]=rows[i],k=['x','y','z'][i];max[k]=localBoundsSupport(local.tree,dx,dy,dz);min[k]=-localBoundsSupport(local.tree,-dx,-dy,-dz);}
 }else for(const pose of rigidQueryPoses(g,V(),quat)){const box=collisionPoseBounds(pose);
  min.x=Math.min(min.x,box.min.x);min.y=Math.min(min.y,box.min.y);min.z=Math.min(min.z,box.min.z);max.x=Math.max(max.x,box.max.x);max.y=Math.max(max.y,box.max.y);max.z=Math.max(max.z,box.max.z);
 }
 const result={min,max,x:quat.x,y:quat.y,z:quat.z,w:quat.w};cache.entries.push(result);if(cache.entries.length>12)cache.entries.shift();return result;
}
function localBoundsSupport(tree,x,y,z){
 let best=-Infinity;
 const upper=node=>x*(x<0?node.min.x:node.max.x)+y*(y<0?node.min.y:node.max.y)+z*(z<0?node.min.z:node.max.z);
 const visit=node=>{
  if(upper(node)<best-1e-12)return;
  if(node.entries){for(const {min:p}of node.entries)best=Math.max(best,x*p.x+y*p.y+z*p.z);return;}
  if(upper(node.left)>upper(node.right)){visit(node.left);visit(node.right);}else{visit(node.right);visit(node.left);}
 };
 visit(tree);return best;
}
function translatedBounds(box,pos){const min=add(box.min,pos),max=add(box.max,pos);return {min,max,center:mul(add(min,max),.5),size:sub(max,min)};}
function bounds(g,pos=g.body.position,quat=g.body.quaternion){return translatedBounds(rotatedGroupBounds(g,quat),pos);}
function collisionPoseBounds(pose){
 const min=V(Infinity,Infinity,Infinity),max=V(-Infinity,-Infinity,-Infinity);
 if(isTBit(pose)){
  const {x,y,z,w}=pose.q,p=pose.p;
  const xx=w*w+x*x-y*y-z*z,xy=2*(x*y-w*z),xz=2*(x*z+w*y),yx=2*(x*y+w*z),yy=w*w-x*x+y*y-z*z,yz=2*(y*z-w*x),zx=2*(x*z-w*y),zy=2*(y*z+w*x),zz=w*w-x*x-y*y+z*z;
  // Exact convex vertex extrema, without allocating world-space vertices for
  // every orientation sample of every roller in a large held installation.
  for(const v of unitProfile(pose).vertices){const vx=p.x+xx*v.x+xy*v.y+xz*v.z,vy=p.y+yx*v.x+yy*v.y+yz*v.z,vz=p.z+zx*v.x+zy*v.y+zz*v.z;
   min.x=Math.min(min.x,vx);min.y=Math.min(min.y,vy);min.z=Math.min(min.z,vz);max.x=Math.max(max.x,vx);max.y=Math.max(max.y,vy);max.z=Math.max(max.z,vz);
  }
 }
 else{
  const {x,y,z,w}=pose.q,h=pose.half||V(HALF,HALF,HALF),p=pose.p;
  const ex=h.x*Math.abs(w*w+x*x-y*y-z*z)+h.y*Math.abs(2*(x*y-w*z))+h.z*Math.abs(2*(x*z+w*y));
  const ey=h.x*Math.abs(2*(x*y+w*z))+h.y*Math.abs(w*w-x*x+y*y-z*z)+h.z*Math.abs(2*(y*z-w*x));
  const ez=h.x*Math.abs(2*(x*z-w*y))+h.y*Math.abs(2*(y*z+w*x))+h.z*Math.abs(w*w-x*x-y*y+z*z);
  min.set(p.x-ex,p.y-ey,p.z-ez);max.set(p.x+ex,p.y+ey,p.z+ez);
 }return {min,max};
}
function collisionEntry(pose){return {pose,...collisionPoseBounds(pose)};}
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
// Rigid material is queried as a body first, then as candidate parts. The
// precise SAT test remains the authority; disjoint boxes cannot collide.
// Reuse transformed geometry until that body actually changes pose.
function rigidQueryPoses(g,pos=g.body.position,quat=g.body.quaternion){
 if(!g.partShapes||!Number.isInteger(g.materialShapeCount))return poses(g,pos,quat);
 // Query the exact same material colliders as Cannon: aligned runs are boxes,
 // convex pieces/sensors remain separate, and holes are never filled.
 let layout=g.rigidQueryLayout;
 if(!layout||layout.parts!==g.parts){
  const owners=new Map();for(const part of g.parts){const shape=g.partShapes.get(part.id);if(!owners.has(shape))owners.set(shape,part);}
  layout=g.rigidQueryLayout={parts:g.parts,entries:g.body.shapes.slice(0,g.materialShapeCount).map((shape,i)=>({part:owners.get(shape),offset:g.body.shapeOffsets[i],q:g.body.shapeOrientations[i],half:shape.halfExtents}))};
 }
 return layout.entries.map(entry=>({p:add(pos,quat.vmult(entry.offset)),q:quat.mult(entry.q),part:entry.part,g,...(entry.half?{half:entry.half}:{})}));
}
function rigidCollisionParts(g){
 const b=g.body,p=b.position,q=b.quaternion,cached=g.collisionPartsCache;
 if(cached&&cached.parts===g.parts&&cached.x===p.x&&cached.y===p.y&&cached.z===p.z&&cached.qx===q.x&&cached.qy===q.y&&cached.qz===q.z&&cached.qw===q.w)return cached.entries;
 const entries=rigidQueryPoses(g).map(collisionEntry);
 g.collisionPartsCache={parts:g.parts,x:p.x,y:p.y,z:p.z,qx:q.x,qy:q.y,qz:q.z,qw:q.w,entries};return entries;
}
function collisionIndex(entries){
 if(entries.collisionIndex)return entries.collisionIndex;
 const build=list=>{const min=V(Infinity,Infinity,Infinity),max=V(-Infinity,-Infinity,-Infinity);for(const e of list)for(const k of ['x','y','z']){min[k]=Math.min(min[k],e.min[k]);max[k]=Math.max(max[k],e.max[k]);}
  if(list.length<=8)return {min,max,entries:list};const axis=['x','y','z'].sort((a,b)=>(max[b]-min[b])-(max[a]-min[a]))[0];list.sort((a,b)=>(a.min[axis]+a.max[axis])-(b.min[axis]+b.max[axis]));const middle=list.length>>1;return {min,max,left:build(list.slice(0,middle)),right:build(list.slice(middle))};
 };
 return entries.collisionIndex=build(entries.slice());
}
function collisionIndexSome(tree,box,visit,delta=null){
 const x=delta?.x||0,y=delta?.y||0,z=delta?.z||0;
 const overlaps=b=>box.min.x+x<=b.max.x&&box.max.x+x>=b.min.x&&box.min.y+y<=b.max.y&&box.max.y+y>=b.min.y&&box.min.z+z<=b.max.z&&box.max.z+z>=b.min.z;
 const walk=node=>{if(!overlaps(node))return false;if(node.entries){for(const entry of node.entries)if(overlaps(entry)&&visit(entry))return true;return false;}return walk(node.left)||walk(node.right);};
 return walk(tree);
}
function collisionEntriesOverlap(a,b,epsilon=.0005){
 const tree=collisionIndex(b);return a.some(first=>collisionIndexSome(tree,first,second=>obbOverlap(first.pose,second.pose,epsilon)));
}
function rigidGroupsOverlap(a,b){
 if(!boundsOverlap(bounds(a),bounds(b)))return false;
 // Every hinge correction translates the common chassis. Keep its spatial
 // index in local coordinates, and transform only the smaller moving body.
 // Rigid transforms preserve SAT distances, including open concave gaps.
 if((a.materialShapeCount??a.parts.length)>(b.materialShapeCount??b.parts.length))[a,b]=[b,a];
 let cached=b.localCollisionCache;
 if(!cached||cached.parts!==b.parts){const entries=rigidQueryPoses(b,V(),Q()).map(collisionEntry);cached=b.localCollisionCache={parts:b.parts,entries};}
 const inverse=b.body.quaternion.inverse(),position=inverse.vmult(sub(a.body.position,b.body.position)),quaternion=inverse.mult(a.body.quaternion);
 return collisionEntriesOverlap(rigidQueryPoses(a,position,quaternion).map(collisionEntry),cached.entries);
}
function convexUnitOverlap(a,b,epsilon=.0005){
 const aa=convexPoseGeometry(a),bb=convexPoseGeometry(b);
 for(const axis of [...aa.normals,...bb.normals,...aa.edges.flatMap(x=>bb.edges.map(y=>x.cross(y)))]){
  if(axis.norm2()<1e-14)continue;axis.normalize();let amin=Infinity,amax=-Infinity,bmin=Infinity,bmax=-Infinity;
  for(const v of aa.vertices){const d=v.dot(axis);amin=Math.min(amin,d);amax=Math.max(amax,d);}for(const v of bb.vertices){const d=v.dot(axis);bmin=Math.min(bmin,d);bmax=Math.max(bmax,d);}
  if(amax<=bmin+epsilon||bmax<=amin+epsilon)return false;
 }return true;
}
// Completed skins are physical surfaces, not extra inventory pieces. Include
// them in manual placement/sweep checks without changing saved material poses.
function conveyorGroupSurfaces(g,pos=g.body.position,quat=g.body.quaternion,includeVirtual=true){
 const result=[];for(const conveyor of conveyors){const base=g.parts.find(part=>part.id===conveyor.baseId);if(!base)continue;
  for(const surface of conveyor.surfaces||[]){const offset=add(base.offset,base.q.vmult(surface.center));result.push({p:add(pos,quat.vmult(offset)),q:quat.mult(base.q.mult(surface.q)),half:surface.half});}
  if(includeVirtual&&conveyor.virtual?.body===g.body)for(const proxy of conveyor.virtual.proxies)result.push({p:add(pos,quat.vmult(proxy.offset)),q:quat.mult(proxy.q),half:proxy.half});
 }return result;
}
function physicalGroupPoses(g,pos=g.body.position,quat=g.body.quaternion){return poses(g,pos,quat).concat(conveyorGroupSurfaces(g,pos,quat));}
function physicalGroupBounds(g,pos=g.body.position,quat=g.body.quaternion){
 const modules=conveyors.filter(c=>c.surfaceBody===g.body&&c.surfaces?.length);if(!modules.length)return bounds(g,pos,quat);
 let cache=g.physicalBoundsCache;
 if(!cache||cache.parts!==g.parts||cache.sources.length!==modules.length||modules.some((c,i)=>cache.sources[i]!==c.surfaces))cache=g.physicalBoundsCache={parts:g.parts,sources:modules.map(c=>c.surfaces),entries:[]};
 let box=cache.entries.find(c=>c.x===quat.x&&c.y===quat.y&&c.z===quat.z&&c.w===quat.w);
 if(!box){box=bounds(g,V(),quat);
  for(const surface of conveyorGroupSurfaces(g,V(),quat)){const extents=collisionPoseBounds(surface);for(const k of ['x','y','z']){box.min[k]=Math.min(box.min[k],extents.min[k]);box.max[k]=Math.max(box.max[k],extents.max[k]);}}
  Object.assign(box,{x:quat.x,y:quat.y,z:quat.z,w:quat.w});cache.entries.push(box);if(cache.entries.length>12)cache.entries.shift();
 }return translatedBounds(box,pos);
}
function validPose(g,pos,quat,exclude=[],joiningFrames=null){
 const bb=physicalGroupBounds(g,pos,quat);if(bb.min.y<-.001||bb.max.y>ROOM_HEIGHT||Math.max(Math.abs(bb.min.x),Math.abs(bb.max.x),Math.abs(bb.min.z),Math.abs(bb.max.z))>ROOM_SIZE/2-.001)return false;
 const src=rigidQueryPoses(g,pos,quat).concat(conveyorGroupSurfaces(g,pos,quat)),entries=src.map(collisionEntry);
 if(!puzzlePoseClear(g,pos,quat,src,bb)||!alphaPoseClear(g,pos,quat)||!storyPoseClear(g,pos,quat,src,bb))return false;
 if(cargos.some(c=>boundsOverlap(bb,cargoBounds(c))&&src.some(a=>obbOverlap(a,cargoPose(c)))))return false;
 let seamEntries=null;
 return !groups.some(other=>{
  if(other===g||exclude.includes(other))return false;
  const owner=other.virtualConveyor?.baseGroup||other,seam=joiningFrames?.has(g.virtualConveyor?.baseGroup||g)&&joiningFrames.has(owner);
  if(other.virtualConveyor){if(!seam)return false;syncVirtualConveyorGroup(other);}
  if(!boundsOverlap(bb,physicalGroupBounds(other)))return false;
  // A conveyor frame and its joining rigid body become one body. Conservative
  // roller envelopes may overlap across a legal seam; test original matter
  // and skins there. Every foreign obstacle still sees the full envelopes.
  const sourceEntries=seam?(seamEntries||=rigidQueryPoses(g,pos,quat).concat(conveyorGroupSurfaces(g,pos,quat,false)).map(collisionEntry)):entries;
  return collisionEntriesOverlap(sourceEntries,rigidCollisionParts(other).concat(conveyorGroupSurfaces(other,other.body.position,other.body.quaternion,!seam).map(collisionEntry)));
 });
}
function mechanismsUnlocked(){return Object.keys(story.progress).some(key=>/^level\d+$/.test(key)&&Number(key.slice(5))>=5&&story.progress[key]);}
function mechanismsAvailable(){return !certifiedAutomation()&&!puzzle.active&&(story.scene==='lab'||story.scene==='campaign'&&mechanismsUnlocked());}
function isMechanismChoice(id){return id==='coupler'||id==='rotor';}
function normalizeCreationChoice(id){return id==='rotor'?'rotor':normalizeUnitShape(id);}
function creationChoiceAllowed(id){if(typeof id==='string'&&id.startsWith('quick-'))return story.scene==='lab'&&!puzzle.active&&quickEntries.has(id);return ['cube','tetra','pyramid','coupler','rotor'].includes(id)&&(isMechanismChoice(id)?mechanismsAvailable():story.scene==='lab'&&!puzzle.active);}
function creationTitle(id){if(quickEntries.has(id))return quickEntries.get(id).title;return {cube:'Q-bit',tetra:'T-bit triangular',pyramid:'T-bit de base cuadrada',coupler:'Enganche',rotor:'Rotor'}[id]||'Q-bit';}
function creationShape(){const id=normalizeCreationChoice(settings.unitShape);return creationChoiceAllowed(id)?id:'cube';}
function unitLabel(part){if(part?.mood?.production)return part.mood.production.role==='package'?'Paquete':'Materia';if(isExternalBattery(part))return 'Batería';return unitShape(part)==='coupler'?'Enganche':isTBit(part)?'T-bit':'Q-bit';}
function groupUnitLabel(g){if(g.parts.some(p=>p.mood.production))return g.parts.every(p=>p.mood.production)?'bloques de materia':'piezas';const c=g.parts.filter(p=>unitShape(p)==='coupler').length;if(c)return c===g.parts.length?'Enganche'+(c===1?'':'s'):'piezas';const t=g.parts.filter(isTBit).length;return t===g.parts.length?'T-bit'+(t===1?'':'s'):t?'piezas':'Q-bit'+(g.parts.length===1?'':'s');}
function syncUnitControls(){const shape=creationShape(),select=document.querySelector('#unit-shape');select.value=shape;select.disabled=puzzle.active||story.scene!=='lab'&&!mechanismsAvailable();for(const option of select.querySelectorAll('option'))option.disabled=!creationChoiceAllowed(option.value);document.querySelector('#create').textContent='Crear '+creationTitle(shape);}
// Explicit sandbox copies: construction blueprints and campaign resources remain separate.
let quickCatalogueStamp='';
const quickEntries=new Map();
function quickSingleRecord(type,count=1){
 const parts=Array.from({length:count},(_,key)=>({key,shape:'cube',weight:1,p:[(key-(count-1)/2)*CUBE_SIZE,HALF,0],q:[0,0,0,1],...(type==='battery'?{battery:{pack:0,enabled:false}}:type==='gripper'?{gripper:copyGripperConfig()}: {})}));
 return {version:1,type,name:type==='battery'?'Batería '+['','I','II','III'][count]:'Cubo de agarre',groups:[{parts}],joints:[]};
}
function quickCatalogue(){
 const list=[{id:'quick-power-reservoir',title:'Depósito de energía',action:'power-reservoir',subtitle:'180000 J · 100 % · apagado'},
 ...[1,4,8].map(count=>({id:'quick-cable-'+count,title:'Cable · '+count+' cubo'+(count>1?'s':''),action:'power-cable',count,weight:1,subtitle:(count*2)+' m · suelo y paredes'})),
 ...[['small','pequeño',.5],['large','grande',2]].map(([id,label,weight])=>({id:'quick-cable-'+id,title:'Cable · '+(weight*2)+' m',action:'power-cable',count:1,weight,subtitle:(weight*2)+' m · ampliable'})),
 ...['pivot','hinge'].map(kind=>({id:'quick-servo-'+kind,title:kind==='pivot'?'Servo pivote':'Servo bisagra',record:servoBlueprintTemplate(kind),subtitle:'Articulación · apagada'})),
 {id:'quick-propeller',title:'Hélice modular',record:propellerBlueprintTemplate()},{id:'quick-drone',title:'Dron de prueba',record:propellerBlueprintTemplate(true),subtitle:'1 hélice + batería I'}, {id:'quick-arm',title:'Brazo Q-bits',record:robotArmBlueprintTemplate()},...['straight','left','right'].map((kind,i)=>({id:'quick-conveyor-'+kind,title:['Cinta recta','Esquina izquierda','Esquina derecha'][i],record:conveyorBlueprintTemplate(kind)})),
 {id:'quick-gripper',title:'Cubo de agarre',record:quickSingleRecord('gripper')},...[1,2,3].map(n=>({id:'quick-battery-'+n,title:'Batería '+['','I','II','III'][n],record:quickSingleRecord('battery',n),subtitle:'100 % · apagada'})),
 {id:'quick-sensor',title:'Sensor configurable',action:'sensor'},{id:'quick-cargo',title:'Cuerpo sólido',action:'cargo'},{id:'quick-cooler',title:'Enfriador',action:'cooler'},{id:'quick-shelf',title:'Repisa',action:'shelf',subtitle:'Colocar en pared'},
 {id:'quick-workshop',title:'Mesa de trabajo',action:'workshop',subtitle:'Colocar o reubicar en el suelo'},
 ...savedMechanisms.map((record,i)=>({id:'quick-saved-mechanism-'+i,title:record.name,record:copySavedMechanism(record),subtitle:'Mecanismo guardado'})),
 ...savedShapes.map((shape,i)=>({id:'quick-saved-shape-'+i,title:shape.name,shape:JSON.parse(JSON.stringify(shape)),subtitle:'Forma guardada'}))];
 return list;
}
function quickProfile(entry){
 if(entry.action==='power-reservoir'){const vertices=[],faces=[];for(const y of [-1,1])for(let i=0;i<12;i++){const a=i*Math.PI/6;vertices.push([Math.cos(a)*.42,y,Math.sin(a)*.42]);}for(let i=0;i<12;i++)faces.push([i,(i+1)%12,(i+1)%12+12,i+12]);faces.push(Array.from({length:12},(_,i)=>11-i),Array.from({length:12},(_,i)=>i+12));return {id:entry.id,title:entry.title,subtitle:entry.subtitle,section:'quick',vertices,faces,color:[65,145,112],description:'Depósito de suelo con líquido visible. Clic derecho: encender. Conecta una máquina con un cable de Q-bits. La recarga de prueba se hace apagado.'};}
 if(entry.action==='power-cable'){const profile=unitProfile('cube');return {id:entry.id,title:entry.title,subtitle:entry.subtitle,section:'quick',vertices:profile.vertices.map(v=>[v.x/CUBE_SIZE*2,v.y/CUBE_SIZE*.25,v.z/CUBE_SIZE]),faces:profile.faces.map(f=>f.slice()),color:[185,119,44],description:'Crea los cubos y desenróllalos: clic en salida, apoyos opcionales en suelo o pared y clic en entrada. Esc conserva el material; clic derecho deshace.'};}
 const source=entry.record?.groups.flatMap(g=>g.parts)||entry.shape?.parts||[{shape:'cube',p:[0,0,0],q:[0,0,0,1]}],vertices=[],faces=[];
 for(const part of source){const profile=unitProfile(part.shape||'cube'),q=Q();q.set(...part.q);const offset=vertices.length;for(const v of profile.vertices){const p=add(V(...part.p),q.vmult(v));vertices.push([p.x/CUBE_SIZE,p.y/CUBE_SIZE,p.z/CUBE_SIZE]);}for(const face of profile.faces)faces.push(face.map(i=>i+offset));}
 return {id:entry.id,title:entry.title,subtitle:entry.subtitle||'Montaje completo',section:'quick',vertices,faces,color:entry.id.includes('battery')?[54,139,105]:[66,82,85],description:entry.action==='shelf'?'Selecciona y apunta a una pared; clic para colocar.':entry.action==='workshop'?'Coloca la mesa en el suelo. Con clic derecho puedes retirarla. E abre el taller.':'Copia de prueba: suelta Q, apunta la vista previa azul y haz clic para colocar. Rueda: girar por caras. Shift: cuadrícula y giro libre con la rueda. Los motores quedan detenidos. Tab cambia de pestaña.'};
}
// A placement preview owns no bodies, material IDs, joints or inventory.
let creationPreview=null;
function creationPlacementAllowed(id){return creationChoiceAllowed(id)||puzzle.active&&alphaSettings.allowPuzzleSpawn&&['cube','tetra','pyramid'].includes(id);}
function startCreationTool(id){if(held||powerDraft)return false;refreshQuickEntries();if(!creationPlacementAllowed(id))return false;if(panel.hidden)captureMouse();else stowTablet();return beginCreationPlacement(id);}
function creationRecord(id){
 const entry=quickEntries.get(id);if(entry?.record)return copySavedMechanism(entry.record);
 if(id!=='rotor')return null;
 const flip=Q();flip.setFromAxisAngle(V(0,0,1),Math.PI);
 return {version:1,type:'rotor',name:'Rotor',groups:[{parts:[{key:0,shape:'coupler',weight:settings.mass,p:[0,unitGroundHeight('coupler'),0],q:[0,0,0,1]}]},{parts:[{key:1,shape:'coupler',weight:settings.mass,p:[0,unitGroundHeight('coupler')+2*CUBE_SIZE*51/56,0],q:[flip.x,flip.y,flip.z,flip.w]}]}],joints:[{a:0,b:1,...mechanismDefaults,enabled:false}]};
}
function beginBlueprintPlacement(shape,options={}){
 if(shape?.mechanism?!mechanismsAvailable()||!savedMechanismValid(shape.mechanism):!savedShapeValid(shape))return false;
 panel.hidden=true;captureMouse();return beginCreationPlacement('construction-plan',shape,options);
}
function beginCreationPlacement(id,plan=null,options={}){
 if(!plan&&!creationPlacementAllowed(id))return false;
 cancelUnitCreation();const entry=quickEntries.get(id);
 if(entry?.action==='shelf')return beginShelfPlacement(wallAim());
 const record=plan?.mechanism||creationRecord(id);let local=[];
 if(record){
  if(!plan){for(const joint of record.joints)joint.enabled=false;for(const part of record.groups.flatMap(g=>g.parts))if(part.battery)part.battery.enabled=false;}
  local=mechanismRecordParts(record).flat();
 }
 else if(plan||entry?.shape)local=(plan||entry.shape).parts.map(part=>({shape:part.shape||'cube',weight:1,p:V(...part.p),q:shelfQuaternion(part.q)}));
 else if(entry?.action==='workshop')local=QBitsFurniture.desk().parts.map(part=>({p:add(V(0,.6,0),V(...part.p)),q:shelfQuaternion(part.q),half:V(...part.half)}));
 else if(entry?.action==='power-reservoir')local=[{p:V(0,.95,0),q:Q(),half:V(.39,.95,.39)}];
 else if(entry?.action==='cargo'){const h=settings.cargoSide*CUBE_SIZE/2;local=[{p:V(0,h,0),q:Q(),half:V(h,h,h)}];}
 else if(entry?.action==='cooler'){
  local=[{p:V(0,.009,0),q:Q(),half:V(.32,.009,.32)}];
  for(let i=0;i<20;i++){const a=i*Math.PI/10,q=Q();q.setFromAxisAngle(V(0,1,0),-a);local.push({p:V(Math.cos(a)*.36,.077,Math.sin(a)*.36),q,half:V(.042,.077,.061)});}
 }else if(entry?.action==='power-cable')local=Array.from({length:entry.count},(_,i)=>({shape:'cube',weight:entry.weight,p:V((i-(entry.count-1)/2)*CUBE_SIZE,HALF,0),q:Q()}));
 else {const shape=entry?'cube':id;local=[{shape,weight:entry?1:settings.mass,p:V(0,unitGroundHeight(shape),0),q:Q()}];}
 const surfaces=[];
 for(const c of record?.conveyors||[]){const base=local.find(p=>p.key===c.base),path=conveyorPath(c);
  for(let i=1;i<path.length;i++){const delta=sub(path[i],path[i-1]),q=Q();q.setFromVectors(V(1,0,0),mul(delta,1/delta.norm()));q.normalize();surfaces.push({p:add(base.p,base.q.vmult(add(mul(add(path[i],path[i-1]),.5),V(0,-.002,0)))),q:base.q.mult(q),half:V(delta.norm()/2,.002,CUBE_SIZE*1.5)});}
 }
 const compact=local.some(p=>p.half)?local:rigidColliderLayout(local.map((p,id)=>({...p,id,offset:p.p}))).map(box=>box.half?{p:box.offset,q:box.q,half:box.half}:box.parts[0]);
 pendingUnitCreation=id;creationPreview={id,entry,record,local,compact,surfaces,plan,elevation:options.height||0,turns:options.quarterTurns||0,valid:false,poses:[],reason:'Apunta a una superficie.'};
 updateCreationPlacement();redraw=true;announce((plan?.name||creationTitle(id))+' · rueda: girar por caras · Shift: cuadrícula y giro libre · clic: colocar · Esc: cancelar');return true;
}
function creationSurfaceAim(dir=direction(),exclude=[]){
 const origin=V(...camera);let best=8,hit=null;
 // All solid surfaces occlude the ray; only upward-facing surfaces support a copy.
 const candidates=groups.filter(g=>!exclude.includes(g)&&rayPuzzleBox(origin,dir,physicalGroupBounds(g),best)!==null).flatMap(g=>physicalGroupPoses(g)).concat(cargos.map(cargoPose),storyWorld.walls.map(w=>({p:w.p,q:w.q||Q(),half:w.half})),alphaObstacles());
 for(const pose of candidates){const convex=isTBit(pose),ray=convex?rayPart(origin,dir,pose,best):null,distance=convex?ray?.distance??null:rayPuzzleBox(origin,dir,{...pose,half:pose.half||V(HALF,HALF,HALF)},best);if(distance===null||distance<.001||distance>=best)continue;
  const point=add(origin,mul(dir,distance)),local=pose.q.inverse().vmult(sub(point,pose.p)),half=pose.half||V(HALF,HALF,HALF);let axis='y',gap=Infinity;
  for(const k of ['x','y','z']){const d=Math.abs(Math.abs(local[k])-half[k]);if(d<gap){gap=d;axis=k;}}
  const normal=V();normal[axis]=local[axis]<0?-1:1;best=distance;hit={point,normal:ray?.normal||pose.q.vmult(normal)};
 }
 if(dir.y<-.015){const distance=-origin.y/dir.y;if(distance>0&&distance<best){const point=add(origin,mul(dir,distance));if(Math.max(Math.abs(point.x),Math.abs(point.z))<ROOM_SIZE/2)hit={point,normal:V(0,1,0)};}}
 return hit;
}
function creationPosesClear(poses,plan=false){
 const boxes=poses.map(collisionPoseBounds),extent={min:V(Infinity,Infinity,Infinity),max:V(-Infinity,-Infinity,-Infinity)};for(const box of boxes)for(const k of ['x','y','z']){extent.min[k]=Math.min(extent.min[k],box.min[k]);extent.max[k]=Math.max(extent.max[k],box.max[k]);}
 if(plan)return blueprintSiteClear({...extent,...alphaBox(mul(add(extent.min,extent.max),.5),mul(sub(extent.max,extent.min),.5))});
 const obstacles=groups.filter(g=>boundsOverlap(extent,physicalGroupBounds(g))).flatMap(g=>physicalGroupPoses(g)).concat(cargos.map(cargoPose),storyWorld.walls.map(w=>({p:w.p,q:w.q||Q(),half:w.half})),alphaObstacles(),puzzleObstacleBounds().map(w=>({p:w.p,q:w.q||Q(),half:w.half})));
 const entries=obstacles.map(collisionEntry).filter(box=>boundsOverlap(extent,box));
 return poses.every(pose=>{const box=collisionPoseBounds(pose);return box.min.y>=-.001&&box.max.y<=ROOM_HEIGHT&&Math.max(Math.abs(box.min.x),Math.abs(box.max.x),Math.abs(box.min.z),Math.abs(box.max.z))<ROOM_SIZE/2-.001&&!entries.some(other=>boundsOverlap(box,other)&&obbOverlap(pose,other.pose));});
}
function updateCreationPlacement(hit=creationSurfaceAim()){
 const preview=creationPreview;if(!preview)return false;
 const {entry,record}=preview;let point=hit?.point?.clone(),turns=preview.turns,link=null;
 if(shiftDown()&&!preview.freeRotation&&record?.conveyors?.length&&point){let nearest=.65;
  const retained=conveyors.find(c=>c.baseId===preview.link),port=retained&&conveyorPortWorld(retained,retained.direction===-1?'entry':'exit'),placement=port&&port.p.distanceTo(point)<.78&&conveyorBlueprintPlacement(record,retained);
  if(placement){point=placement.point.clone();point.y-=preview.plan ? .002 : .003;turns=placement.angle/(Math.PI/2);link=retained.baseId;nearest=-1;}
  for(const conveyor of conveyors){const port=conveyorPortWorld(conveyor,conveyor.direction===-1?'entry':'exit');if(!port)continue;const distance=port.p.distanceTo(hit.point);if(distance>=nearest)continue;
   const placement=conveyorBlueprintPlacement(record,conveyor);if(!placement)continue;nearest=distance;point=placement.point.clone();point.y-=preview.plan ? .002 : .003;turns=placement.angle/(Math.PI/2);link=conveyor.baseId;
  }
 }
 preview.link=link;preview.valid=false;
 if(!point||!link&&hit.normal.y<.98){preview.poses=[];preview.reason='Apunta al suelo o a una superficie horizontal cercana.';return false;}
 const floorOnly=['cargo','cooler','power-reservoir','workshop'].includes(entry?.action),q=Q();q.setFromAxisAngle(V(0,1,0),turns*Math.PI/2);
 if(floorOnly){if(entry?.action!=='workshop')q.set(0,0,0,1);if(Math.abs(point.y)>.02){preview.poses=[];preview.reason='Este elemento se coloca en el suelo.';return false;}point.y=0;}
 preview.grid=shiftDown()&&!link&&Math.abs(point.y)<.001;
 if(preview.grid){point.x=Math.round(point.x/CUBE_SIZE)*CUBE_SIZE;point.z=Math.round(point.z/CUBE_SIZE)*CUBE_SIZE;}
 if(preview.plan&&!link)point.y+=preview.elevation;
 const origin=add(point,V(0,floorOnly?0:preview.plan ? .002 : .003,0));
 const transform=p=>({...p,p:add(origin,q.vmult(p.p)),q:q.mult(p.q)});
 const poses=preview.local.map(transform),surfaces=preview.surfaces.map(transform),drawPoses=preview.compact.map(transform).concat(surfaces);Object.assign(preview,{point,q,poses,surfacePoses:surfaces,drawPoses});
 const count=preview.plan||floorOnly?0:record?mechanismPartCount(record):preview.local.length;
 if(preview.plan&&blueprints.length>=12)preview.reason='Retira un plano antes de colocar otro.';
 else if(scenePartCount()+count>MAX_QUBITS)preview.reason='No caben más piezas. Retira o guarda un montaje.';
 else if(entry?.action==='cargo'&&(cargos.length>=12||!cargoPlacementClear(point,settings.cargoSide*CUBE_SIZE)))preview.reason='No hay espacio o se alcanzó el límite de cuerpos.';
 else if(entry?.action==='cooler'&&(coolers.length>=12||!cargoPlacementClear(point,.84)||coolers.some(c=>c.p.distanceTo(point)<.9)))preview.reason='Deja espacio libre para el enfriador.';
 else if(entry?.action==='power-reservoir'&&(powerReservoirs.length>=12||!powerReservoirPlacement(point)))preview.reason='Deja espacio libre para el depósito.';
 else if(!creationPosesClear(drawPoses,!!preview.plan))preview.reason='Posición ocupada · mueve la vista previa.';
 else {preview.valid=true;preview.reason=(link?'Conexión alineada · ':'')+(preview.grid?'Cuadrícula · ':'')+'Clic: colocar · rueda: 90° · Shift + rueda: giro libre · Esc: cancelar';}
 redraw=true;return preview.valid;
}
function confirmCreationPlacement(){
 if(!creationPreview||!creationPreview.plan&&!creationPlacementAllowed(creationPreview.id))return null;
 // Refresh on the actual click: a moving obstacle or released Shift invalidates old previews.
 if(!updateCreationPlacement()){announce(creationPreview.reason);return null;}
 const preview=creationPreview,{entry,record,point,q}=preview,before=new Set(groups);let made=null;
 if(preview.plan){
  const bp=placeBlueprint(preview.plan,point,{height:Math.max(0,point.y),angle:2*Math.atan2(q.y,q.w)});
  if(bp){bp.conveyorLink=preview.link;cancelUnitCreation();}return bp;
 }
 if(entry?.action==='workshop'){
  packWorkshop();workshopPlacement={x:point.x,z:point.z,angle:2*Math.atan2(q.y,q.w)};made=setupWorkshop();
 }else if(record)made=spawnSavedMechanism(record,point,q);
 else if(entry?.action==='power-reservoir')made=createPowerReservoir(point);
 else if(entry?.action==='cooler')made=createCooler(point);
 else if(entry?.action==='cargo')made=newCargo(point);
 else {
  const parts=preview.poses.map(p=>({id:allocateUnitId(),shape:p.shape,weight:p.weight,p:p.p.clone(),q:p.q.clone()}));
  if(!assemblyValid(parts)){announce('Esta forma necesita volver a guardarse.');return null;}made=makeGroup(parts);
  if(entry?.action==='sensor'){const part=made.parts[0];part.mood.workshop={version:1,ownerId:part.id,sensor:true,battery:1,lightweight:1,movement:1,baseWeight:1,ballast:0};}
 }
 if(!made){announce('No se pudo colocar. Revisa el espacio libre.');return null;}
 const added=groups.filter(g=>!before.has(g));for(const g of added){g.body.velocity.set(0,0,0);g.body.angularVelocity.set(0,0,0);for(const part of g.parts)if(isExternalBattery(part))part.mood.energy=1;}
 if(!record&&made.parts){selected={g:made,part:made.parts[0]};multiSelection=[];}
 const connected=preview.link?!!joinCompletedConveyorBlueprint({conveyorLink:preview.link},added):false;
 cancelUnitCreation();if(entry?.action==='power-cable'){beginPowerCable([made]);return made;}
 announce(creationTitle(preview.id)+(connected?' colocado y conectado':preview.link?' colocado · no se pudo unir; revisa las caras':' colocado')+(record?' · motores detenidos':''));redraw=true;return made;
}
function drawCreationPlacement(){
 if(!creationPreview?.poses.length)return;
 if(creationPreview.grid){
  const {x,z}=creationPreview.point,y=.001,span=4*CUBE_SIZE,lines=[];
  for(let i=-4;i<=4;i++){const d=i*CUBE_SIZE;lines.push(V(x+d,y,z-span),V(x+d,y,z+span),V(x-span,y,z+d),V(x+span,y,z+d));}
  drawLines(lines,[.22,.64,.72,.55]);
 }
 const color=creationPreview.valid?[.25,.75,1,.5]:[1,.25,.2,.5];
 // The placement tool stays smooth even when the world uses PSX vertex jitter.
 // Merged exact boxes remove internal faces and subpixel cracks between cubes.
 gl.uniform1f(uniforms.uJitter,0);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
 const eye=V(...camera),ordered=creationPreview.drawPoses.slice().sort((a,b)=>b.p.distanceSquared(eye)-a.p.distanceSquared(eye));
 for(const pose of ordered){if(pose.half)drawBox(pose.p,pose.q,mul(pose.half,2),color);else drawUnitMesh(pose,color,3);}
 if(creationPreview.record)drawConveyorBlueprintArrows({shape:{mechanism:creationPreview.record}},creationPreview.poses);
 gl.depthMask(true);gl.disable(gl.BLEND);gl.uniform1f(uniforms.uJitter,visuals.jitter/100);
}

function spawnQuickElement(id){
 if(story.scene!=='lab'||puzzle.active||!creationChoiceAllowed(id))return null;
 if(creationPreview?.id!==id){beginCreationPlacement(id);return null;}
 return confirmCreationPlacement();
}

function refreshQuickEntries(){
 quickEntries.clear();if(story.scene==='lab')for(const entry of quickCatalogue())quickEntries.set(entry.id,entry);
}
function initUnitRadial(){
 refreshQuickEntries();const catalogue=[...quickEntries.values()],stamp=JSON.stringify(catalogue);
 if(unitRadial&&quickCatalogueStamp===stamp)return;
 if(unitRadial)unitRadial.dispose();unitRadial=null;quickCatalogueStamp=stamp;
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
 }).concat(catalogue.map(quickProfile))});
}
function unitRadialAllowed(){
 return running&&gameInputActive()&&story.ready&&story.mode==='playing'&&(story.scene==='lab'||story.scene==='campaign'&&mechanismsUnlocked())&&!puzzle.active&&!story.transition&&!document.hidden&&document.body.dataset.booting!=='true'&&panel.hidden&&menu.hidden&&commandMenu.hidden&&!held&&!marquee&&!pendingPickup&&!moveChoice&&!pendingCargo&&!editableTarget(document.activeElement);
}
function openUnitRadial(){
 if(powerDraft){announce('Termina el cable o pulsa Esc antes de abrir Q.');return false;}
 if(radialOpen()||!unitRadialAllowed())return false;
 cancelUnitCreation();initUnitRadial();for(const id of ['cube','tetra','pyramid','coupler','rotor'])unitRadial.setLocked?.(id,!creationChoiceAllowed(id));keys.clear();routeInspection=null;accumulator=0;
 unitRadial.open(creationShape(),{virtualPointer:gameInputActive()});
 const radialHelp=document.querySelector('#unit-radial .radial-help');if(radialHelp)radialHelp.textContent=gamepadActive?window.QBitsControls.gamepadHint(savedPreferences.controls.gamepad,'radial')+' · suelta '+window.QBitsControls.labelFor('radial',savedPreferences,'gamepad')+' para elegir':'Suelta '+inputLabel('radial')+' para elegir · '+inputLabel('primary')+' para crear · Tab: Banco rápido';
 document.body.dataset.unitRadial='open';hint.hidden=true;redraw=true;
 return true;
}
function closeUnitRadial(commit=false){
 if(!commit)cancelUnitCreation();
 if(!radialOpen())return false;
 const choice=unitRadial.hovered;
 const valid=commit&&unitRadialAllowed()&&creationChoiceAllowed(choice);
 unitRadial.close();document.body.dataset.unitRadial='closed';keys.clear();accumulator=0;
 if(valid){if(!choice.startsWith('quick-'))settings.unitShape=choice;syncUnitControls();beginCreationPlacement(choice);}
 redraw=true;return valid;
}
function cancelUnitCreation(){pendingUnitCreation=null;creationPreview=null;redraw=true;}
function handleKeyUp(event){
 keys.delete(event.code);
 if(event.code.startsWith('Alt'))routeInspection=null;
 if(event.code==='ShiftLeft'||event.code==='ShiftRight'){if(creationPreview&&!shiftDown())creationPreview.freeRotation=false;resetAssemblyShake();if(held&&!shiftDown())held.shakeSeparated=false;}
 if(event.code==='KeyQ'&&radialOpen()){event.preventDefault();closeUnitRadial(true);}
}
function spawnQubit(){
 automationIntervention();
 if(creationPreview)return confirmCreationPlacement();
 if(pendingUnitCreation?.startsWith('quick-'))return spawnQuickElement(pendingUnitCreation);
 const shape=creationShape();if(puzzleBlockedEdit(isMechanismChoice(shape)?'mechanism':'qubit'))return;
 if(isMechanismChoice(shape)&&!mechanismsAvailable()){announce('Completa La primera unión para desbloquear los mecanismos.');return;}
 if(shape==='rotor'){
  const rotor=spawnRotor(undefined,{...mechanismDefaults,enabled:false});if(!rotor){announce('No hay espacio libre para el rotor.');return;}
  const g=rotorGroups(rotor)[0];cancelUnitCreation();selected={g,part:g.parts[0]};multiSelection=[];announce('Rotor creado · clic derecho → Rotación');return g;
 }
 if(scenePartCount()>=MAX_QUBITS){announce('Máximo de '+MAX_QUBITS+' piezas en la sala.');return;}
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
 // A completed band's visible surface selects its own module, including when
 // several modules share one welded chassis. Closer solids still occlude it.
 if(typeof conveyorSurfacePoses==='function')for(const conveyor of conveyors){
  const base=rotorPart(conveyor.baseId);if(!base)continue;
  for(const pose of conveyorSurfacePoses(conveyor)){const distance=rayPuzzleBox(origin,dir,pose,best);if(distance===null||distance>=best)continue;
   const point=add(origin,mul(dir,distance)),local=pose.q.inverse().vmult(sub(point,pose.p)),normal=V();let axis='y',gap=Infinity;
   for(const key of ['x','y','z']){const edge=Math.abs(Math.abs(local[key])-pose.half[key]);if(edge<gap){axis=key;gap=edge;}}
   normal[axis]=local[axis]<0?-1:1;best=distance;hit={distance,point,normal:pose.q.vmult(normal),g:base.g,part:base.part};
  }
 }
 return hit;
}
function carrySet(hit){return rotorConnectedGroups(multiSelection.includes(hit.g)&&multiSelection.length>1?multiSelection.filter(g=>groups.includes(g)):[hit.g]);}
function manualGripForce(weight){return Math.max(settings.force,weight*.25*(settings.gravity+12));}
function canCarry(list){return rotorConnectedGroups(list).reduce((n,g)=>n+totalWeight(g),0)<=settings.maxCarry+.0001;}
function grabQubit(hitOverride=null){
 resetAssemblyShake();
 if(!gameInputActive()||held||marquee)return;let hit=hitOverride||aimQubit();if(hit?.g?.storyEmerging)return;const pickedPartId=hit?.part.id;
 if(hit?.g?.virtualConveyor){const base=rotorPart(hit.g.virtualConveyor.conveyor.baseId);if(base)hit={...hit,g:base.g,part:base.part};}
 if(!hit){if(aimCargo(3)){announce('Este cuerpo se arrastra con un equipo de Q-bits.');return;}startMarquee();return;}
 if(altDown()){openDetachMenu(hit);return;}
 const list=carrySet(hit),weight=list.reduce((n,g)=>n+totalWeight(g),0);
 if(runningConveyorForGroups(list)){selected=hit;announce('Cinta en funcionamiento · primero apaga o desconecta la cinta para moverla.');return;}
 if(!canCarry(list)){announce('Peso '+formatWeight(weight)+' u · capacidad '+formatWeight(settings.maxCarry)+' u. Ajustable en P.');return;}
 for(const member of list){const run=mechanismRuns.get(member);if(run)run.repositioned=true;}
 robotStopForGroups(list);
 if(story.ready&&story.scene==='intro'&&hit.g===storyGuide()){hit.g.storyFloat=false;hit.g.body.type=CANNON.Body.DYNAMIC;hit.g.body.updateMassProperties();}
 for(const rotor of rotors)if(rotorGroups(rotor).some(g=>list.includes(g)))configureRotor(rotor,{enabled:false});
 undockCampaignGroup(hit.g);
 selected=hit;const stable=list.length>1||hit.g.parts.length>1,rootPoint=stable?hit.g.body.position.clone():hit.point.clone();
 automationIntervention('Tomaste una pieza: ensayo reiniciado.');
 const ordered=[hit.g,...list.filter(g=>g!==hit.g)],items=[],passive=passiveConveyorRollers(list);for(const g of list)if(g.virtualConveyor){const base=rotorPart(g.virtualConveyor.conveyor.baseId)?.g;if(base)passive.set(g,base);}for(const arm of robotArms){
  const base=robotGripperHit(arm.baseId)?.g;if(!base||!list.includes(base))continue;
  const component=rotorConnectedGroups([base]),driver=component.includes(hit.g)?hit.g:base;
  for(const g of component)if(g!==driver)passive.set(g,driver);
 }
 passive.delete(hit.g);
 const gripMass=new Map(list.filter(g=>!passive.has(g)).map(g=>[g,g.body.mass]));
 for(const [roller,driver]of passive)if(!roller.virtualConveyor)gripMass.set(driver,(gripMass.get(driver)||0)+roller.body.mass);
 for(const g of ordered){
  if(g.blueprintJob){const slot=g.blueprintJob;releaseBlueprintSlot(slot);slot.bp.slots=slot.bp.slots.filter(s=>s!==slot);}
  leaveHaul(g);stopRoute(g);g.body.wakeUp();const point=stable?g.body.position.clone():g===hit.g?hit.point:g.body.position.clone();
  const local=g.body.quaternion.inverse().vmult(sub(point,g.body.position));
  let anchorBody=null,joint=null;const passiveGrip=passive.has(g),mass=gripMass.get(g)||0;
  if(!passiveGrip){
   anchorBody=new CANNON.Body({mass:0});anchorBody.type=CANNON.Body.KINEMATIC;anchorBody.position.copy(point);anchorBody.collisionFilterGroup=0;world.addBody(anchorBody);
   joint=new CANNON.PointToPointConstraint(g.body,local,anchorBody,V(),manualGripForce(weight)*workshopGrip(g)*mass/(weight*.25));joint.collideConnected=false;world.addConstraint(joint);
  }
  items.push({g,anchor:local,anchorBody,joint,passiveGrip,gripDriver:passive.get(g)||null,gripMass:mass,relative:sub(point,rootPoint),initialQ:g.body.quaternion.clone(),restQ:null});
 }
 held={...hit,...items[0],pickedPartId,items,weight,stable,rootOffset:stable?sub(rootPoint,hit.point):V(),age:0,distance:clamp(hit.distance,.3,2.5),rotation:hit.g.body.quaternion.clone(),initialRotation:hit.g.body.quaternion.clone(),tiltAxis:V(Math.cos(yaw),0,-Math.sin(yaw))};
 storyOnGrab(hit.g);
 speech.shake=null;queueSpeech(hit.g,'close',{part:hit.part,kind:'pickup',priority:62,cooldown:18});
}
function releaseQubit(join=false){
 resetAssemblyShake();
 if(!held)return;
 const g=held.g,items=held.items||[held],dock=story.dockCandidate;
 for(const item of items){if(item.joint)world.removeConstraint(item.joint);if(item.anchorBody)world.removeBody(item.anchorBody);if(item.g.virtualConveyor)continue;item.g.body.angularDamping=groupAngularDamping(item.g.parts.length);item.g.body.fixedRotation=false;item.g.body.updateMassProperties();}
 let joined=null;
 if(heldMechanismCanSnap()&&join&&snap&&snap.source===g&&groups.includes(snap.target))joined=weld(snap);
 if(!joined)for(const item of items){item.g.body.velocity.set(0,0,0);item.g.body.angularVelocity.set(0,0,0);item.g.body.force.set(0,0,0);item.g.body.torque.set(0,0,0);item.g.body.wakeUp();}
 held=null;snap=null;tryDockCampaign(g,dock);
}
// Propellers reuse one rigid body and the existing material identities. The two
// tetrahedra have exact tip sockets; spin is a bounded visual, not two extra
// high-speed rigid bodies per motor. The full swept volume must stay clear.
function propellerBladePose(hub,side){
 const turn=Q();turn.setFromAxisAngle(V(0,1,0),Math.PI/4+side*Math.PI);
 const q=hub.q.mult(turn),tip=couplerTip(hub).point;
 return {shape:'tetra',p:sub(tip,q.vmult(unitProfile('tetra').vertices[0])),q};
}
function propellerSocket(hub,blade,tolerance=.00005){
 if(unitShape(hub)!=='coupler'||unitShape(blade)!=='tetra')return -1;
 for(let side=0;side<2;side++){const pose=propellerBladePose(hub,side);if(pose.p.distanceTo(blade.p)<=tolerance&&qSimilarity(pose.q,blade.q)>1-1e-7)return side;}
 return -1;
}
function propellerBonds(parts){
 const bonds=[];for(let i=0;i<parts.length;i++)if(unitShape(parts[i])==='coupler')for(let j=0;j<parts.length;j++)if(unitShape(parts[j])==='tetra'&&propellerSocket(parts[i],parts[j])>=0)bonds.push([i,j]);return bonds;
}
function propellerLayout(g){
 if(g.propellerCache?.parts===g.parts)return g.propellerCache.modules;
 const local=g.parts.map(part=>({part,shape:part.shape,p:part.offset,q:part.q})),modules=[];
 for(const hub of local){if(hub.shape!=='coupler')continue;const blades=[0,1].map(side=>local.find(p=>p.shape==='tetra'&&propellerSocket(hub,p)===side));
  if(blades.every(Boolean))modules.push({id:hub.part.id,g,hub:hub.part,blades:blades.map(p=>p.part)});
 }g.propellerCache={parts:g.parts,modules};return modules;
}
function propellerModules(component){return component.flatMap(propellerLayout).filter(m=>!rotorForPart(m.id));}
function propellerHasBlade(id){const hit=rotorPart(id);return !!hit&&poses(hit.g).some(p=>propellerSocket(hit,p)>=0);}
function findPropellerSnap(source,target,limit=.055){
 if(!mechanismsAvailable())return null;let best=null;
 // Either take a single triangular blade to a hub or bring a bare hub to it.
 const attempt=(bladeGroup,hubGroup,reverse)=>{
  if(bladeGroup.parts.length!==1||bladeGroup.parts[0].shape!=='tetra'||rotorForGroup(bladeGroup))return;
  const blade=partPose(bladeGroup,bladeGroup.parts[0]);
  for(const hub of poses(hubGroup))if(hub.part.shape==='coupler'&&!rotorForPart(hub.part.id))for(let side=0;side<2;side++){
   if(poses(hubGroup).some(p=>propellerSocket(hub,p)===side))continue;
   const desired=propellerBladePose(hub,side),near=Math.min(blade.p.distanceTo(desired.p),add(blade.p,blade.q.vmult(unitProfile('tetra').vertices[0])).distanceTo(couplerTip(hub).point));
   if(near>=limit)continue;
   let quaternion,position;
   if(!reverse){quaternion=desired.q.mult(blade.part.q.inverse());position=sub(desired.p,quaternion.vmult(blade.part.offset));}
   else{const delta=blade.q.mult(desired.q.inverse());quaternion=delta.mult(source.body.quaternion);position=add(blade.p,delta.vmult(sub(source.body.position,desired.p)));}
   if(best&&near>=best.score||!validSnapPose(source,position,quaternion,target))continue;
   best={source,target,position,quaternion,score:near,propellerTip:true,hubId:hub.part.id,bladeId:blade.part.id,side,face:{p:couplerTip(hub).point,q:hub.q,axis:1,normal:hub.q.vmult(V(0,1,0))}};
  }
 };attempt(source,target,false);attempt(target,source,true);return best;
}
function propellerBlueprintTemplate(withBattery=false){
 const hub={shape:'coupler',p:V(0,unitGroundHeight('coupler')+(withBattery?CUBE_SIZE:0),0),q:Q()},parts=[{key:0,shape:'coupler',weight:1,p:[hub.p.x,hub.p.y,hub.p.z],q:[0,0,0,1],flight:QBitsPropellerPower.config()}];
 for(let side=0;side<2;side++){const p=propellerBladePose(hub,side);parts.push({key:side+1,shape:'tetra',weight:1/12,p:[p.p.x,p.p.y,p.p.z],q:[p.q.x,p.q.y,p.q.z,p.q.w]});}
 if(withBattery)parts.push({key:3,shape:'cube',weight:1,p:[0,HALF,0],q:[0,0,0,1],battery:{pack:3,enabled:false}});
 return {version:1,type:'coupler',name:withBattery?'Dron de prueba · 1 hélice':'Hélice · 1 enganche + 2 T-bits',groups:[{parts}],joints:[]};
}
function flightForGroup(g){const component=rotorConnectedGroups([g]),modules=propellerModules(component).sort((a,b)=>a.id-b.id);if(!modules.length)return null;
 const key=Math.min(...modules.map(m=>m.id));let flight=flightStates.get(key);
 if(!flight){flight={id:key,enabled:false,landing:false,spool:0,phase:0,status:'Apagado',contact:null};flightStates.set(key,flight);}
 flight.component=component;flight.modules=modules;return flight;
}
function stopFlight(flight,reason='Apagado'){if(!flight)return;flight.trip=null;flight.hold=null;flight.enabled=false;flight.landing=false;flight.spool=0;flight.power=null;flight.status=reason;}
function flightStopForGroups(list){for(const flight of flightStates.values())if(flight.component?.some(g=>list.includes(g)))stopFlight(flight,'Detenido para manipular');}
function flightConfig(flight){return QBitsPropellerPower.config(flight.modules[0]?.hub.mood.flight);}
function configureFlight(flight,patch){if(!flight)return false;if(patch.speed===0)flight.hold=null;const config=QBitsPropellerPower.config({...flightConfig(flight),...patch});for(const m of flight.modules)m.hub.mood.flight=QBitsPropellerPower.config(config);return true;}
function propellerObstruction(module){
 const hub=partPose(module.g,module.hub),tip=couplerTip(hub).point,inv=hub.q.inverse(),radius=CUBE_SIZE*Math.SQRT2+.003,ignored=new Set([module.hub.id,...module.blades.map(p=>p.id)]);
 const intersects=pose=>{const points=corners(pose).map(p=>inv.vmult(sub(p,tip))),min=V(...['x','y','z'].map(k=>Math.min(...points.map(p=>p[k])))),max=V(...['x','y','z'].map(k=>Math.max(...points.map(p=>p[k]))));
  if(max.y<.001||min.y>CUBE_SIZE/2+.002)return false;const x=clamp(0,min.x,max.x),z=clamp(0,min.z,max.z);return Math.hypot(x,z)<radius;
 };
 for(const g of groups){if(g!==module.g&&g.body.position.distanceTo(tip)>g.body.boundingRadius+radius+.1)continue;for(const p of poses(g))if(!ignored.has(p.part.id)&&intersects(p))return QBitsWorkshop.partState(p.part).sensor?'sensor':'solid';}
 for(const c of cargos)if(intersects(cargoPose(c)))return 'solid';
 for(const wall of storyWorld.walls)if(intersects(wall))return 'solid';
 return tip.y<.001?'solid':null;
}
function flightSnapshot(flight,dt=0){
 const {component,modules}=flight,config=modules[0].hub.mood.flight||QBitsPropellerPower.config(),supply=externalBatterySummary(component),load=component.reduce((n,g)=>n+totalWeight(g),0)+robotGripLoad(component),mass=load*.25;
 const height=Math.max(0,Math.min(...component.map(g=>bounds(g).min.y))),baseMass=component.reduce((n,g)=>n+g.body.mass,0),velocity=component.reduce((sum,g)=>add(sum,mul(g.body.velocity,g.body.mass/Math.max(.001,baseMass))),V());
 const targetSpeed=flight.landing?0:config.speed,rotorWatts=rotors.filter(r=>r.enabled&&rotorGroups(r).some(g=>component.includes(g))).reduce((n,r)=>n+rotorPowerState(r).inputWatts,0),gripWatts=[...robotGrips.values()].filter(grip=>component.includes(robotGripperHit(grip.id)?.g)).reduce((n,grip)=>n+.08+.08*grip.weight,0),otherWatts=rotorWatts+gripWatts;
 const center=component.reduce((sum,g)=>add(sum,mul(g.body.position,g.body.mass/Math.max(.001,baseMass))),V());if(!flight.hold)flight.hold=center.clone();
 let obstruction=null;
 for(const module of modules){obstruction=partPose(module.g,module.hub).q.vmult(V(0,1,0)).y<.65?'tilt':propellerObstruction(module);if(obstruction)break;}
 const state={targetHeight:config.height,height,count:modules.length,mass,gravity:Math.abs(world.gravity.y),cells:supply.powerCells,availableWatts:Math.max(0,supply.powerCells*QBitsPropellerPower.SPEC.wattsPerCell-otherWatts),energy:Math.max(0,supply.storedJ-rotorWatts*Math.max(0,dt)),vx:velocity.x,vy:velocity.y,vz:velocity.z,targetVx:flight.landing?0:targetSpeed?-Math.sin(config.heading)*targetSpeed:clamp((flight.hold.x-center.x)*1.5,-.4,.4),targetVz:flight.landing?0:targetSpeed?-Math.cos(config.heading)*targetSpeed:clamp((flight.hold.z-center.z)*1.5,-.4,.4),enabled:flight.enabled,landing:flight.landing,spool:flight.spool,
 held:component.some(g=>cubeIsHeld(g)||g.blueprintJob||g.robotHeld),fixed:component.some(g=>g.body.type!==CANNON.Body.DYNAMIC)||rotors.some(r=>r.enabled&&r.mount==='fixed'&&rotorGroups(r).some(g=>component.includes(g))),blocked:!!obstruction};
 if(flight.trip&&!flight.landing)Object.assign(state,flightGuidance(flight,center,height,velocity,dt));
 const power=QBitsPropellerPower.evaluate(state,dt),totalWatts=power.inputWatts+otherWatts;
 return {...power,center,obstruction,remainingSeconds:totalWatts>0?Math.max(0,supply.storedJ-power.spentJoules)/totalWatts:null,height,config,supply,baseMass,velocity};
}
function flightReason(reason){return {incomplete:'Falta una pala',limit:'Máximo 4 hélices por conjunto',battery:'Conecta y enciende una batería',empty:'Batería agotada',blocked:'Hélice obstruida o inclinada · deja libre su giro',held:'Suelta el conjunto antes de despegar',fixed:'Libera el anclaje fijo antes de despegar',overload:'Demasiado peso o poca potencia · aligera o añade hélices/batería'}[reason]||'Listo';}
function flightProblem(s){
 if(s.reason==='overload')return flightReason(s.reason)+' · '+s.load.toFixed(1)+' u a bordo / '+(s.maxLoad/1.03).toFixed(1)+' u admitidas al despegar';
 if(s.reason==='blocked'&&s.obstruction==='sensor')return 'Hélice obstruida por el sensor · fíjalo al costado del chasis, por debajo de las palas';
 if(s.reason==='blocked'&&s.obstruction==='tilt')return 'Hélice inclinada · orienta el eje hacia arriba';
 return flightReason(s.reason);
}
function requestFlightLanding(f){
 f.trip=null;f.landing=true;f.status='Aterrizando';
}
function flightGuidance(f,center,height,velocity,dt){
 const trip=f.trip,point=trip.points[trip.index],x=trip.origin.x+point.x,z=trip.origin.z+point.z;
 const reach=Math.hypot(center.x-x,center.z-z)<.065&&Math.abs(height-point.height)<.065;
 const down=trip.phase==='descend'||trip.phase==='ground';
 const lift=trip.phase==='lift',dx=(lift?trip.depart.x:x)-center.x,dz=(lift?trip.depart.z:z)-center.z;
 const speed=f.modules[0].hub.mood.flight.speed||.5,factor=Math.min(1.6,speed/Math.max(.001,Math.hypot(dx,dz)));
 const guidance={targetHeight:point.height,targetVx:dx*factor,targetVz:dz*factor,landing:down,enabled:f.enabled&&trip.phase!=='ground'};
 if(dt<=0)return guidance;
 function advance(){
  trip.index++;
  if(trip.index===trip.points.length){if(!trip.loop){requestFlightLanding(f);return;}trip.index=0;}
  trip.phase='lift';trip.depart=center.clone();
 }
 if(lift&&Math.abs(height-point.height)<.055)trip.phase='travel';
 else if(trip.phase==='travel'&&reach){
  trip.remaining=point.wait;
  if(point.action==='land')trip.phase='descend';
  else if(point.action==='wait')trip.phase='wait';
  else advance();
 }else if(trip.phase==='descend'&&flightTouchdown(f,height,velocity)){
  trip.phase='ground';f.spool=0;
 }else if(trip.phase==='wait'||trip.phase==='ground'){
  if(trip.phase==='ground')f.spool=0;
  trip.remaining-=dt;if(trip.remaining<=0)advance();
 }
 return guidance;
}
function flightTouchdown(f,height,velocity){
 if(Math.abs(velocity.y)>=.12)return false;
 if(height<.012)return true;
 const bodies=new Set(f.component.map(g=>g.body));
 for(const grip of robotGrips.values())if(f.component.includes(robotGripperHit(grip.id)?.g))bodies.add(grip.body);
 return world.contacts.some(c=>bodies.has(c.bi)!==bodies.has(c.bj)&&(bodies.has(c.bi)?-c.ni.y:c.ni.y)>.85);
}
function startFlight(flight){
 if(!flight||!mechanismsAvailable())return false;
 if(flight.enabled)return false;
 const snapshot=flightSnapshot(flight);if(!snapshot.canLift){flight.status=flightProblem(snapshot);
  announce(flight.status);return false;}
 const config=flightConfig(flight),route=config.route;
 if(route?.points.length){
  const origin=snapshot.center,bound=ROOM_SIZE/2;
  const boxes=flight.component.map(g=>bounds(g));
  if(route.points.some(p=>boxes.some(b=>b.min.x+p.x< -bound||b.max.x+p.x>bound||b.min.z+p.z< -bound||b.max.z+p.z>bound))){
   flight.status='Trayectoria fuera de la sala · acerca los puntos al origen';announce(flight.status);return false;
  }
  flight.trip={...route,index:0,phase:'lift',origin:origin.clone(),depart:origin.clone(),remaining:0};
 }else flight.trip=null;
 for(const g of flight.component){stopRoute(g);leaveHaul(g);g.body.wakeUp();}
 configureFlight(flight,config);flight.enabled=true;flight.landing=false;flight.spool=0;flight.hold=null;flight.contact=null;flight.status='Despegando';rememberMechanismRun(flight.component[0],'flight',flight);announce('Dron · altura '+flightConfig(flight).height.toFixed(2)+' m');return true;
}
function updateFlights(dt){
 if(!Number.isFinite(dt)||dt<=0)return;
 const seen=new Set();for(const g of groups){if(seen.has(g)||!propellerLayout(g).length)continue;const f=flightForGroup(g);if(!f)continue;f.component.forEach(member=>seen.add(member));
  if(!f.enabled)continue;
  for(const member of f.component)for(const part of member.parts)robotWorkingParts.add(part);
  f.spool=Math.min(1,f.spool+dt*2);const s=flightSnapshot(f,dt);f.power=s;
  if(['limit','battery','empty','blocked','held','fixed'].includes(s.reason)){stopFlight(f,flightProblem(s));continue;}
  if(f.landing&&flightTouchdown(f,s.height,s.velocity)){stopFlight(f,'Aterrizado · apaga la batería para recargar');continue;}
  // A single energy debit for the entire physical network. Other powered tools
  // debit the remaining reservoir later in the step; no cell can be spent twice.
  const fraction=s.supply.storedJ>0?s.spentJoules/s.supply.storedJ:0;
  for(const cell of s.supply.cells){cell.mood.energy=Math.max(0,cell.mood.energy*(1-fraction));cell.mood.idle=0;}
  const force=V(s.fx,s.fy,s.fz);
  for(const grip of robotGrips.values())if(f.component.includes(robotGripperHit(grip.id)?.g))grip.body.wakeUp();
  for(const member of f.component){const body=member.body;if(body.type!==CANNON.Body.DYNAMIC)continue;body.wakeUp();body.applyForce(mul(force,body.mass/Math.max(.001,s.baseMass)),body.position);}
  // Assisted attitude holds the carrier upright; the rigid assemblies and
  // articulated arm retain their Cannon bodies, payload and collision response.
  const roots=new Set(f.modules.map(m=>m.g));for(const root of roots){const hub=f.modules.find(m=>m.g===root).hub,up=partPose(root,hub).q.vmult(V(0,1,0)),axis=up.cross(V(0,1,0)),b=root.body,budget=Math.hypot(s.fx,s.fy,s.fz)*.1/roots.size;
   const torque=V(axis.x*.5-b.angularVelocity.x*.04,-b.angularVelocity.y*.025,axis.z*.5-b.angularVelocity.z*.04),size=torque.norm();if(size>budget)torque.scale(budget/size,torque);b.torque.vadd(torque,b.torque);
  }
  f.phase=(f.phase+s.rpm*Math.PI/30*dt)%(Math.PI*2);f.status=s.reason==='overload'?flightProblem(s):f.landing?'Aterrizando':f.trip?({lift:'Despegue o ajuste de altura',travel:'En ruta',wait:'Parada en vuelo',descend:'Descenso',ground:'Parada en tierra'}[f.trip.phase]+' · punto '+(f.trip.index+1)+'/'+f.trip.points.length):s.height<s.config.height-.06?'Subiendo':'En vuelo';
  if(s.exhausted)stopFlight(f,'Batería agotada · sin sustentación');
 }
 const liveIds=new Set(groups.flatMap(propellerLayout).map(m=>m.id));for(const [id,f]of flightStates)if(!liveIds.has(id)){stopFlight(f);flightStates.delete(id);}
}
function tickFlightSensors(dt){
 for(const f of flightStates.values()){
  const signals=new Set();
  for(const g of f.component)for(const part of g.parts)if(QBitsWorkshop.partState(part).sensor&&!sensorTarget(part)){
   const cfg=sensorConfig(part);if((f.enabled||cfg.action==='start')&&sensorReading({g,part,...partPose(g,part)},cfg).active)signals.add(cfg.action);
  }
  for(const action of ['reverse','start','stop']){
   const key=action==='reverse'?'contact':'contact_'+action,next=QBitsContacts.step(f[key],signals.has(action),dt);f[key]=next.state;
   if(!next.fire)continue;
   if(action==='start'){if(!f.enabled)startFlight(f);}
   else if(action==='stop'){if(f.enabled)stopFlight(f,'Detenido por sensor');}
   else if(f.enabled){let heading=flightConfig(f).heading+Math.PI;if(heading>Math.PI)heading-=2*Math.PI;configureFlight(f,{heading});f.status='Sensor · sentido invertido';}
  }
 }
}
function propellerVisualPose(g,part){if(g.virtualConveyor)return virtualConveyorVisualPose(g,part);const module=propellerLayout(g).find(m=>m.blades.includes(part)),pose=partPose(g,part);if(!module)return pose;
 const f=[...flightStates.values()].find(f=>f.modules?.some(m=>m.id===module.id)),phase=f?.enabled?f.phase:0;if(!phase)return pose;
 const hub=partPose(g,module.hub),tip=couplerTip(hub).point,turn=Q();turn.setFromAxisAngle(hub.q.vmult(V(0,1,0)),phase);return {...pose,p:add(tip,turn.vmult(sub(pose.p,tip))),q:turn.mult(pose.q)};
}
function flightPanelSubject(){return selected?.g?flightForGroup(selected.g):null;}
function flightField(id){return document.querySelector('#flight-'+id);}
function updateFlightFleet(){
 const list=flightField('fleet-list'),seen=new Set();list.replaceChildren();
 for(const g of groups){
  if(seen.has(g)||!propellerLayout(g).length)continue;
  const f=flightForGroup(g);if(!f)continue;f.component.forEach(member=>seen.add(member));
  const button=document.createElement('button'),hub=f.modules[0];
  button.type='button';button.textContent='Dron '+f.id+' · '+f.status;
  button.addEventListener('click',()=>openFlightPanel({g:hub.g,part:hub.hub}));list.appendChild(button);
 }
 flightField('fleet').hidden=!list.children.length;
}
function routeOf(f){return f.modules[0].hub.mood.flight?.route||{loop:false,points:[]};}
let flightEditorSubject=null,flightEditorStamp='';
function drawFlightRoute(f){
 if(flightEditorSubject!==f){flightEditorSubject=f;flightEditorStamp='';flightField('route-feedback').textContent='';}
 const route=routeOf(f),scale=Number(flightField('scale').value)||2;
 const stamp=JSON.stringify([route,scale,f.enabled]);if(stamp===flightEditorStamp)return;flightEditorStamp=stamp;
 flightField('mode').value=route.loop?'loop':'once';flightField('mode').disabled=f.enabled;
 flightField('fields').disabled=f.enabled;flightField('undo').disabled=!route.points.length;
 const list=flightField('points'),path=flightField('path');list.replaceChildren();path.replaceChildren();
 const svg=(tag,attrs)=>{const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);path.appendChild(el);return el;};
 const coords=route.points.map(p=>[50+50*p.x/scale,50+50*p.z/scale]);
 svg('polyline',{points:[[50,50],...coords,...(route.loop?coords.slice(0,1):[])].map(pair=>pair.join(',')).join(' '),fill:'none',stroke:'#37878a','stroke-width':.8});
 svg('circle',{cx:50,cy:50,r:1.6,fill:'#394743'});
 route.points.forEach((p,i)=>{
  const [x,y]=coords[i];svg('circle',{cx:x,cy:y,r:2.4,fill:'#216b68'});svg('text',{x:x+2.7,y:y-1,'font-size':5}).textContent=String(i+1);
  const item=document.createElement('li');item.textContent='X '+p.x+' · Z '+p.z+' · '+p.height+' m · '+({pass:'Paso',wait:'Espera en vuelo',land:'Aterrizaje'}[p.action])+(p.action==='pass'?'':' · '+p.wait+' s');list.appendChild(item);
 });
}
function editFlightRoute(action){
 const f=flightPanelSubject();if(!f||f.enabled)return;
 const route=routeOf(f),points=[...route.points],feedback=flightField('route-feedback');
 if(action==='add'){
  const read=id=>flightField(id).value===''?NaN:Number(flightField(id).value);
  const point={x:read('x'),z:read('z'),height:read('altitude'),action:flightField('action').value,wait:read('wait')};points.push(point);
 }else if(action==='undo')points.pop();
 const next={loop:flightField('mode').value==='loop',points};
 if(!QBitsPropellerPower.validConfig({...flightConfig(f),route:next})){feedback.textContent='Revisa las coordenadas (±28 m), altura (0,15–3 m) y parada (0–120 s). Máximo '+QBitsPropellerPower.maxPoints+' puntos.';return;}
 configureFlight(f,{route:next});feedback.textContent=points.length?'Trayectoria guardada en el dron.':'Trayectoria vacía · vuelo manual.';drawFlightRoute(f);
}
for(const action of ['add','undo'])flightField(action).addEventListener('click',()=>editFlightRoute(action));
flightField('mode').addEventListener('change',()=>editFlightRoute('mode'));
flightField('scale').addEventListener('change',()=>{const f=flightPanelSubject();if(f)drawFlightRoute(f);});
flightField('map').addEventListener('click',event=>{
 const rect=flightField('map').getBoundingClientRect(),scale=Number(flightField('scale').value);
 if(flightPanelSubject()?.enabled||!rect.width||!rect.height)return;
 flightField('x').value=((2*(event.clientX-rect.left)/rect.width-1)*scale).toFixed(2);
 flightField('z').value=((2*(event.clientY-rect.top)/rect.height-1)*scale).toFixed(2);
 editFlightRoute('add');
});
function updateFlightPanel(){
 const f=flightPanelSubject(),section=document.querySelector('#flight-panel');section.hidden=!f;if(!f)return;
 drawFlightRoute(f);const s=flightSnapshot(f),c=s.config;document.querySelector('#flight-status').textContent=f.status+' · '+f.modules.length+'/4 hélices · '+s.load.toFixed(2)+' / '+s.maxLoad.toFixed(2)+' u · '+Math.round(s.supply.storedJ)+' J';
 document.querySelector('#flight-height').value=String(c.height);document.querySelector('#flight-speed').value=String(c.speed);
 document.querySelector('#flight-telemetry').textContent='Altura '+s.height.toFixed(2)+' m · '+(f.power?.rpm||0).toFixed(0)+' rpm · '+(f.power?.inputWatts||0).toFixed(2)+' W'+(f.power?.remainingSeconds!=null?' · autonomía estimada '+f.power.remainingSeconds.toFixed(0)+' s · alcance estimado '+(f.power.remainingSeconds*Math.hypot(s.velocity.x,s.velocity.z)).toFixed(1)+' m':'')+'. La estimación cambia con la carga, altura y consumo del resto de herramientas.';
 for(const id of ['height','speed','apply','heading'])document.querySelector('#flight-'+id).disabled=f.enabled;
 document.querySelector('#flight-start').disabled=f.enabled;document.querySelector('#flight-land').disabled=!f.enabled;
}
function openFlightPanel(hit,editor=false){
 closeCommandMenu(false);pause();clearRotorSelection();selected=hit;multiSelection=[];selectedCargo=null;showTablet();updatePanel();switchPanelTab('mechanisms');
 if(editor)flightField('editor').open=true;
 flightField(editor?'editor':'panel').scrollIntoView?.({block:'start'});
}
function showFlightMenu(hit,flight){
 clearRotorSelection();selected=hit;multiSelection=[];selectedCargo=null;
 const items=[{label:'Crear trayectoria',run:()=>openFlightPanel(hit,true)},{label:'Vuelo · altura, velocidad y batería…',run:()=>openFlightPanel(hit)},
  {label:flight.enabled?'Aterrizar':'Despegar',run:()=>{if(flight.enabled)requestFlightLanding(flight);else startFlight(flight);captureMouse();}}];
 if(hit.distance<=4)items.push({label:'Guardar mecanismo',disabled:flight.enabled,run:()=>{saveMechanism(hit.g);captureMouse();}},
  {label:'Tomar dron',disabled:hit.distance>2.8||!canCarry(flight.component),run:()=>takeSelection(hit)},
  {label:'Separar pieza…',run:()=>{stopFlight(flight);openDetachMenu(hit);}});
 items.push({label:'Cerrar',run:()=>captureMouse()});openCommandMenu(hit.point||partPose(hit.g,hit.part).p,'Dron '+flight.id+' · '+flight.status,items,hit.g);
}
function flightPanelAction(action){const f=flightPanelSubject();if(!f)return false;
 if(f.enabled&&['heading','apply'].includes(action))return false;
 if(action==='apply')configureFlight(f,{height:Number(document.querySelector('#flight-height').value),speed:Number(document.querySelector('#flight-speed').value)});
 if(action==='heading')configureFlight(f,{heading:Math.atan2(Math.sin(yaw),Math.cos(yaw))});
 if(action==='start')startFlight(f);if(action==='land')requestFlightLanding(f);if(action==='stop')stopFlight(f,'Apagado · caída libre si está en el aire');
 updateFlightPanel();return true;
}
for(const action of ['apply','heading','start','land','stop'])document.querySelector('#flight-'+action).addEventListener('click',()=>flightPanelAction(action));

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
 for(const [a,b]of propellerBonds(parts)){links[a].add(b);links[b].add(a);}
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
 if(!hit||!groups.includes(hit.g))return;
 if(runningConveyorForGroups([hit.g])){announce('Cinta en funcionamiento · primero apaga o desconecta la cinta para separarla.');return;}
 const modules=conveyors.filter(c=>rotorPart(c.baseId)?.g===hit.g||conveyorRotors(c).some(r=>rotorGroups(r).includes(hit.g)));
 for(const c of modules)materializeConveyor(c);
 automationIntervention();
 const g=hit.g;if(all&&stagedDisassemblyEnabled()&&g.parts.length>1){beginStagedDisassembly([g]);return;}if(g.parts.length===1){announce('Este '+unitLabel(hit.part)+' ya está separado.');return;}
 if(held&&(held.items||[held]).some(item=>item.g===g))releaseQubit();const parts=worldParts(g),velocity=g.body.velocity.clone(),spin=g.body.angularVelocity.clone(),ref=g.body.quaternion.clone();
 removeGroup(g);
 if(all){for(const part of parts)makeGroup([part],part.q,velocity,spin);announce('Estructura desarmada');}
 else {
  const one=parts.find(p=>p.id===hit.part.id),rest=parts.filter(p=>p.id!==hit.part.id);
  makeFragments(rest,ref,velocity,spin);const detached=makeGroup([one],one.q,velocity,spin);selected={g:detached,part:detached.parts[0]};announce(unitLabel(one)+' separado');
 }
 if(modules.length){refreshRotors();pruneConveyors();for(const c of modules)if(conveyors.includes(c)){conveyorEnsureSurfaces(c);virtualizeConveyor(c);}}
}
function resetAssemblyShake(){if(held)held.assemblyShake=null;}
// One connected mechanism can have several articulated rigid units. An
// unrelated multi-selection must never be destroyed by the same gesture.
function heldAssemblyGroups(){
 if(!held)return [];
 const items=(held.items||[held]).map(item=>item.g),members=rotorConnectedGroups([held.g]);
 if(new Set(items).size!==items.length||members.length!==items.length||members.some(g=>!items.includes(g))||members.reduce((n,g)=>n+g.parts.length,0)<2)return [];
 return members;
}
function dismantleHeldAssembly(){
 const grip=held,members=heldAssemblyGroups();if(!members.length)return false;
 if(stagedDisassemblyEnabled())return beginStagedDisassembly(members);
 const picked=grip.pickedPartId??grip.part.id,point=picked!==grip.part.id?(rotorPart(picked)?.p.clone()||add(grip.g.body.position,grip.g.body.quaternion.vmult(grip.anchor))):add(grip.g.body.position,grip.g.body.quaternion.vmult(grip.anchor)),distance=grip.distance;
 const bounded=(value,max)=>{const length=value.norm();return length>max?mul(value,max/length):value.clone();};
 const originals=members.map(g=>({g,parts:worldParts(g),center:g.body.position.clone(),velocity:bounded(g.body.velocity,.35),spin:bounded(g.body.angularVelocity,2)}));
 // Retire motors, controllers, skins and all hand anchors before rebuilding.
 // Disconnect explicitly so an intact pair of recovered tips stays separate.
 story.dockCandidate=null;releaseQubit(false);
 for(const rotor of [...rotors])if(rotorGroups(rotor).some(g=>members.includes(g)))disconnectRotor(rotor);
 pruneConveyors();pruneRobotArms();for(const g of members)removeGroup(g);multiSelection=[];
 let pickedGroup=null;
 for(const {parts,center,velocity,spin} of originals)for(const part of parts){
  const offset=sub(part.p,center),outward=offset.norm()>1e-6?mul(offset,.06/offset.norm()):V();
  const motion=bounded(add(add(velocity,spin.cross(offset)),outward),.45);
  const fragment=makeGroup([part],part.q,motion,spin);if(part.id===picked)pickedGroup=fragment;
 }
 grabQubit({g:pickedGroup,part:pickedGroup.parts[0],point,distance});
 if(held){held.distance=distance;held.latched=grip.latched;held.reward=grip.reward;held.shakeSeparated=true;}
 snap=null;announce('Estructura desarmada · conservas la pieza que tomaste');redraw=true;return true;
}
// Pending matter is data, not active Cannon bodies. Only a small release budget
// runs once per animation frame, never once per physics substep.
function stagedDisassemblyEnabled(){return savedPreferences.disassemblyMode==='staged'&&story.scene==='lab'&&!puzzle.active;}
function pendingDisassemblyCount(){return disassemblyJobs.reduce((n,j)=>n+j.parts.length-j.cursor,0);}
function scenePartCount(){return groups.reduce((n,g)=>n+g.parts.length,0)+pendingDisassemblyCount();}
function disposePreviewMesh(mesh){for(const batch of mesh?.batches||[]){deleteRenderBuffer(batch.buffer);if(boundGeometry===batch.buffer)boundGeometry=null;}}
function clearDisassembly(){for(const job of disassemblyJobs)disposePreviewMesh(job.mesh);disassemblyJobs.length=0;}
function serializeDisassembly(){return disassemblyJobs.map(j=>({parts:j.parts.slice(j.cursor).map(p=>({id:p.id,shape:p.shape,weight:p.weight,p:[p.p.x,p.p.y,p.p.z],q:[p.q.x,p.q.y,p.q.z,p.q.w],mood:JSON.parse(JSON.stringify(p.mood))})),origin:[j.origin.x,j.origin.y,j.origin.z]}));}
function restoreDisassembly(records){
 clearDisassembly();const ids=new Set(groups.flatMap(g=>g.parts.map(p=>p.id)));let remaining=MAX_QUBITS-scenePartCount();
 for(const record of Array.isArray(records)?records:[]){
  const validVector=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
  if(!Array.isArray(record.parts)||!record.parts.length||record.parts.length>remaining||!validVector(record.origin,3))continue;
  const own=new Set();if(!record.parts.every(p=>Number.isSafeInteger(p.id)&&p.id>0&&!ids.has(p.id)&&!own.has(p.id)&&own.add(p.id)&&['cube','pyramid','tetra','coupler'].includes(p.shape)&&Number.isFinite(p.weight)&&p.weight>0&&validVector(p.p,3)&&validVector(p.q,4)&&Math.hypot(...p.q)>.0001))continue;
  const parts=record.parts.map(p=>({...p,p:V(...p.p),q:new CANNON.Quaternion(...p.q),mood:JSON.parse(JSON.stringify(p.mood||{}))}));for(const p of parts){p.q.normalize();ids.add(p.id);serial=Math.max(serial,p.id);}
  disassemblyJobs.push({parts,cursor:0,origin:V(...record.origin),active:[],search:0});remaining-=parts.length;
 }
}
function beginStagedDisassembly(members){
 if(disassemblyJobs.length){announce('Espera a que termine el desarme en curso.');return false;}
 if(story.scene!=='lab'||puzzle.active||!members.length||members.some(g=>!groups.includes(g)))return false;
 const parts=members.flatMap(worldParts).sort((a,b)=>b.p.y-a.p.y||a.id-b.id);if(parts.length<2)return false;
 const origin=members[0].body.position.clone();automationIntervention();story.dockCandidate=null;
 if(held?.items?.some(i=>members.includes(i.g)))releaseQubit(false);
 for(const rotor of [...rotors])if(rotorGroups(rotor).some(g=>members.includes(g)))disconnectRotor(rotor);
 pruneConveyors();pruneRobotArms();for(const g of members)removeGroup(g);multiSelection=[];snap=null;
 disassemblyJobs.push({parts,cursor:0,origin,active:[],search:0});
 announce('Desarme por etapas · las piezas bajan al suelo por tandas');redraw=true;return true;
}
function disassemblyDestination(job,part){
 // A deterministic expanding grid, bounded to 24 candidates in this frame.
 const radius=Math.ceil(ROOM_SIZE/.24),width=radius*2+1;
 for(let attempt=0;attempt<24;attempt++){
  const index=job.search++%(width*width),ring=Math.ceil((Math.sqrt(index+1)-1)/2),side=Math.max(1,ring*2),d=index-(2*ring-1)**2;
  let x=0,z=0;if(ring){const edge=Math.floor(d/side),step=d%side;if(edge===0){x=ring;z=-ring+step;}else if(edge===1){x=ring-step;z=ring;}else if(edge===2){x=-ring;z=ring-step;}else{x=-ring+step;z=-ring;}}
  const pose={shape:part.shape,p:V(job.origin.x+x*.24,0,job.origin.z+z*.24),q:part.q};
  pose.p.y=.006-Math.min(...corners(pose).map(v=>v.y));
  if(job.active.some(a=>Math.hypot(a.target.x-pose.p.x,a.target.z-pose.p.z)<.20)||Math.hypot(position[0]-pose.p.x,position[2]-pose.p.z)<PLAYER_RADIUS+.12)continue;
  if(creationPosesClear([pose]))return pose.p;
 }
 return null;
}
function updateDisassembly(dt){
 if(!Number.isFinite(dt)||dt<=0||document.hidden||storySuspended()||story.transition)return;
 const job=disassemblyJobs[0];if(!job)return;const started=performance.now();let released=0;
 for(const active of job.active)active.age+=Math.min(dt,.05);
 // Four bodies / two ms at most; no catch-up burst after pause or lag.
 while(job.active.length&&released<4&&performance.now()-started<2){
  const active=job.active[0],part=job.parts[job.cursor];if(active.age<.22)break;
  if(!creationPosesClear([{...part,p:active.target}])){job.active.length=0;break;}
  makeGroup([{...part,p:active.target}],part.q,V(),V());job.cursor++;job.active.shift();released++;redraw=true;
 }
 // Up to sixteen visual pieces travel together. No physical bodies exist for
 // them until their free landing position is rechecked at release.
 let planned=0;
 while(job.active.length<16&&job.cursor+job.active.length<job.parts.length&&planned<4&&performance.now()-started<2){
  const part=job.parts[job.cursor+job.active.length],target=disassemblyDestination(job,part);planned++;
  if(!target){if(!job.active.length&&(!job.warnAt||performance.now()-job.warnAt>2000)){announce('Desarme en espera · libera espacio en el suelo');job.warnAt=performance.now();}break;}
  job.active.push({target,age:0});
 }
 if(job.cursor===job.parts.length){disposePreviewMesh(job.mesh);disassemblyJobs.shift();announce('Desarme terminado · todas las piezas conservadas');}
 else if(job.active.length)redraw=true;
}
function drawDisassembly(){
 for(const job of disassemblyJobs){
  if(!job.mesh)job.mesh=buildPreviewMesh(job.parts.map(p=>({...p,p:[p.p.x,p.p.y,p.p.z],q:[p.q.x,p.q.y,p.q.z,p.q.w]})),V());
  drawPreviewMesh(job.mesh,V(),Q(),1,job.cursor+job.active.length);
  for(let i=0;i<job.active.length;i++){const active=job.active[i],part=job.parts[job.cursor+i],t=clamp(active.age/.22,0,1),u=t*t*(3-2*t),p=add(mul(part.p,1-u),mul(active.target,u));p.y+=Math.sin(Math.PI*t)*.18;drawUnitMesh({...part,p},[.38,.62,.66,1],5);}
 }
}
function noteAssemblyShake(dx,dy,time){
 if(!held||held.age<.25||!shiftDown()||!running||document.hidden||document.pointerLockElement!==canvas||!storyLookAllowed()||story.transition||radialOpen()||!panel.hidden||!menu.hidden||!commandMenu.hidden){resetAssemblyShake();return;}
 if(!heldAssemblyGroups().length){resetAssemblyShake();return;}
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
 return candidates.find(c=>validSnapPose(source,c.position,c.quaternion,target))||null;
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
 return candidates.find(candidate=>validSnapPose(source,candidate.position,candidate.quaternion,target))||null;
}
// Robot controls reuse Q-bits, couplers and the real hinge motors. A gripper is
// an adaptation of a cube; its active face is local -Y, never an extra body.
const robotArms=[],robotGrips=new Map(),robotWorkingParts=new Set(),gripperFormCache=new WeakMap();let robotArmSerial=0;
const GRIPPER_MIN_REACH=1.8,GRIPPER_MAX_REACH=5;
const robotJointName=i=>['Base','Hombro','Codo','Muñeca'][i]||'Eje '+(i+1);
function gripperReach(config){return (config.reachCm??GRIPPER_MAX_REACH)/100;}
function copyGripperConfig(input={}){
 return {version:1,mode:input.mode??'any',color:input.color??'#f4f4f1',targetId:input.targetId??null,shape:input.shape??'cube',capacity:input.capacity??4,reachCm:input.reachCm??GRIPPER_MAX_REACH,...(input.formSignature?{formSignature:input.formSignature}:{})};
}
function validGripperConfig(input){
 return !!input&&typeof input==='object'&&!Array.isArray(input)&&input.version===1&&['any','color','piece','shape','form'].includes(input.mode)&&/^#[0-9a-f]{6}$/i.test(input.color)&&(['cube','pyramid','tetra','coupler'].includes(input.shape))&&(input.targetId===null||Number.isSafeInteger(input.targetId)&&input.targetId!==0)&&Number.isInteger(input.capacity)&&input.capacity>=1&&input.capacity<=MAX_QUBITS&&(input.reachCm===undefined||Number.isFinite(input.reachCm)&&input.reachCm>=GRIPPER_MIN_REACH&&input.reachCm<=GRIPPER_MAX_REACH)&&(input.formSignature===undefined||typeof input.formSignature==='string'&&input.formSignature.length<=512000)&&(input.mode!=='form'||!!input.formSignature);
}
function robotGripperHit(partOrId){return rotorPart(typeof partOrId==='object'?partOrId.id:partOrId);}
function configureGripper(partOrId,patch={}){
 const hit=robotGripperHit(partOrId);if(!hit||hit.part.shape!=='cube'||isExternalBattery(hit.part)||hit.part.mood.production||hit.part.mood.matter||QBitsWorkshop.hasAdaptation(hit.part)||certifiedAutomation())return false;
 const config=copyGripperConfig({...hit.part.mood.gripper,...patch});if(!validGripperConfig(config))return false;
 if(hit.g.virtualConveyor){const conveyor=hit.g.virtualConveyor.conveyor;if(conveyor.running){announce('Cinta en funcionamiento · primero apaga o desconecta la cinta para modificarla.');return false;}materializeConveyor(conveyor);refreshRotors();}
 const arm=robotArmForGroup(hit.g);if(arm&&(arm.running||arm.jogging))stopRobotArm(arm,'Detenido para ajustar el agarre');
 releaseGripper(hit.part.id);hit.part.mood.gripper=config;return true;
}
function gripperFormSignature(g){
 if(!g?.parts?.length)return '';
 const stamp=g.parts.map(p=>[p.shape,p.weight,p.offset.x,p.offset.y,p.offset.z,p.q.x,p.q.y,p.q.z,p.q.w].join(',')).join(';'),cached=gripperFormCache.get(g);if(cached?.stamp===stamp)return cached.signature;
 const parts=g.parts.map(part=>({part,p:part.offset,q:part.q})),round=n=>Math.abs(n)<.00005?0:+n.toFixed(4);
 // Express every piece in each possible part frame. Selecting a canonical
 // frame removes world position/orientation while retaining full local shape.
 const signature=parts.map(anchor=>{
  const inverse=anchor.q.inverse();return JSON.stringify(parts.map(p=>{
   const v=inverse.vmult(sub(p.p,anchor.p)),q=inverse.mult(p.q),sign=q.w<-.00001||Math.abs(q.w)<.00001&&(q.x<-.00001||Math.abs(q.x)<.00001&&(q.y<-.00001||Math.abs(q.y)<.00001&&q.z<0))?-1:1;
   return [unitShape(p),round(p.part.weight),...['x','y','z'].map(k=>round(v[k])),...['x','y','z','w'].map(k=>round(q[k]*sign))];
  }).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
 }).sort()[0];gripperFormCache.set(g,{stamp,signature});return signature;
}
function gripperColor(candidate){
 if(candidate.cargo)return candidate.cargo.color.toLowerCase();
 const p=candidate.part;if(/^#[0-9a-f]{6}$/i.test(p.mood?.color||''))return p.mood.color.toLowerCase();
 const rgb=p.mood?.production?(p.mood.production.kind==='A'?[.27,.56,.67]:[.72,.53,.26]):[.15,.18,.19];
 return '#'+rgb.map(c=>Math.round(c*255).toString(16).padStart(2,'0')).join('');
}
function gripperMatches(config,candidate){
 if(config.mode==='any')return true;
 if(config.mode==='piece')return candidate.part?candidate.part.id===config.targetId:!!candidate.cargo&&-candidate.cargo.id===config.targetId;
 if(config.mode==='shape')return (candidate.part?unitShape(candidate.part):'cube')===config.shape;
 if(config.mode==='form')return !!candidate.g&&gripperFormSignature(candidate.g)===config.formSignature;
 return gripperColor(candidate)===config.color.toLowerCase();
}
function gripperFaceDistance(hit,candidate,reach=.13){
 const inverse=hit.q.inverse(),normal=hit.q.vmult(V(0,-1,0)),solids=candidate.g?poses(candidate.g):[cargoPose(candidate.cargo)];let nearest=Infinity;
 // Inspect each solid, not a group's bounding box: hollow forms keep their holes.
 for(const pose of solids){
  const local=corners(pose).map(p=>inverse.vmult(sub(p,hit.p))),min=V(Infinity,Infinity,Infinity),max=V(-Infinity,-Infinity,-Infinity);
  for(const p of local)for(const axis of ['x','y','z']){min[axis]=Math.min(min[axis],p[axis]);max[axis]=Math.max(max[axis],p[axis]);}
  if(min.x>HALF-.005||max.x< -HALF+.005||min.z>HALF-.005||max.z< -HALF+.005||max.y> -HALF+.015)continue;
  for(const x of [-.03,0,.03])for(const z of [-.03,0,.03]){
   const origin=add(hit.p,hit.q.vmult(V(x,-HALF+.015,z))),contact=rayPart(origin,normal,pose,reach);
   if(contact)nearest=Math.min(nearest,Math.max(0,contact.distance-.015));
  }
 }
 return nearest;
}
function gripperPathClear(hit,candidate,component){
 const gap=candidate.distance;if(gap<.002)return true;
 const probe={p:add(hit.p,hit.q.vmult(V(0,-HALF-gap/2,0))),q:hit.q,half:V(.033,Math.max(.0005,gap/2-.0005),.033)};
 if(puzzleObstacleBounds().some(w=>obbOverlap(probe,{p:w.p,q:w.q||Q(),half:w.half},.0002)))return false;
 if(groups.some(g=>g!==candidate.g&&!component.includes(g)&&poses(g).some(p=>obbOverlap(probe,p,.0002))))return false;
 return !cargos.some(c=>c!==candidate.cargo&&obbOverlap(probe,cargoPose(c),.0002));
}
function gripperSupply(hit){
 const external=externalBatterySummary(hit.g);return external.active?{...external,parts:external.cells}: {active:false,parts:[hit.part],storedJ:hit.part.mood.energy*gameBatteryCapacity(hit.part)};
}
function spendGripperEnergy(hit,joules){
 const supply=gripperSupply(hit);if(supply.storedJ+1e-10<joules)return false;
 const fraction=supply.storedJ?Math.min(1,joules/supply.storedJ):0;
 for(const part of supply.parts){part.mood.energy=Math.max(0,part.mood.energy*(1-fraction));part.mood.idle=0;robotWorkingParts.add(part);}
 return true;
}
function robotGripLoad(component){return [...robotGrips.values()].reduce((sum,grip)=>sum+(component.includes(robotGripperHit(grip.id)?.g)?grip.weight:0),0);}
function robotLockConstraint(a,b,maxForce,targetRelative=null){
 const constraint=new CANNON.LockConstraint(a,b,{maxForce}),relative=targetRelative||b.quaternion.inverse().mult(a.quaternion),local=[V(0,1,0),V(0,0,1),V(1,0,0)].map(axis=>relative.vmult(axis)),update=constraint.update;
 // Cannon 0.6's bundled LockConstraint assumes equal initial orientations.
 // Retain the actual contact posture (including a tilted payload or joint).
 constraint.update=function(){update.call(this);[this.rotationalEquation1,this.rotationalEquation2,this.rotationalEquation3].forEach((equation,i)=>b.vectorToWorldFrame(local[i],equation.axisB));};
 constraint.collideConnected=false;return constraint;
}
function releaseGripper(partOrId){
 const id=typeof partOrId==='object'?partOrId.id:partOrId,grip=robotGrips.get(id);if(!grip)return false;
 world.removeConstraint(grip.constraint);robotGrips.delete(id);const hit=robotGripperHit(id);if(hit)delete hit.g.robotGrip;
 if(grip.g){delete grip.g.robotHeld;grip.g.body.wakeUp();}
 if(grip.cargo){delete grip.cargo.robotHeld;grip.cargo.robotPhysical=true;grip.cargo.body.wakeUp();}
 return true;
}
// The same read-only check explains failed pickups and gates the real grip.
// Long-range measurement is requested only from the paused panel, never per frame.
function gripperCheck(partOrId,detailed=false){
 const fail=(code,message)=>({ok:false,code,message});
 const hit=robotGripperHit(partOrId),config=hit?.part.mood.gripper;
 if(!hit||!validGripperConfig(config))return fail('missing','Selecciona un cubo de agarre.');
 if(robotGrips.has(hit.part.id))return fail('holding','Ya sostiene un objeto. Pulsa Soltar antes de probar otra toma.');
 const component=rotorConnectedGroups([hit.g]),heldGroups=new Set((held?.items||[]).map(item=>item.g));
 if(component.some(g=>heldGroups.has(g)))return fail('held-arm','Suelta el brazo de tu mano antes de iniciarlo.');
 if(gripperSupply(hit).storedJ<.05)return fail('energy','Agarre sin energía. Recarga o acopla y activa una batería.');
 const candidates=[],reach=gripperReach(config),limit=reach+.00001,rangeText=(reach*100).toLocaleString('es-CL',{maximumFractionDigits:1})+' cm';
 const arm=robotArms.find(a=>a.gripperId===hit.part.id);
 const capacity=arm?robotLiftCapacity(config,robotArmRotors(arm)):config.capacity;
 const search=detailed ? .8 : .13;
 for(const g of groups){if(component.includes(g))continue;
  const part=config.mode==='form'?(gripperFormSignature(g)===config.formSignature?g.parts[0]:null):g.parts.find(part=>gripperMatches(config,{g,part}));
  const candidate={g,part:part||g.parts[0],body:g.body,weight:totalWeight(g),matches:!!part,busy:heldGroups.has(g)||g.robotHeld||g.blueprintJob||g.route||g.haulJob||g.cooler||g.body.type!==CANNON.Body.DYNAMIC||!!rotorForGroup(g)};
  if(!detailed&&(candidate.busy||!part||candidate.weight>config.capacity))continue;
  const distance=gripperFaceDistance(hit,candidate,search);if(distance<Infinity)candidates.push({...candidate,distance});
 }
 for(const cargo of cargos){const candidate={cargo,body:cargo.body,weight:cargo.required||cargo.side**3,busy:!!(cargo.job||cargo.robotHeld||cargo.intake!=null)};candidate.matches=gripperMatches(config,candidate);
  if(!detailed&&(candidate.busy||!candidate.matches||candidate.weight>config.capacity))continue;
  const distance=gripperFaceDistance(hit,candidate,search);if(distance<Infinity)candidates.push({...candidate,distance});
 }
 candidates.sort((a,b)=>a.distance-b.distance||(a.part?.id||a.cargo.id)-(b.part?.id||b.cargo.id));
 const chosen=candidates.find(c=>!c.busy&&c.matches&&c.weight<=capacity&&c.distance<=limit&&gripperPathClear(hit,c,component));
 if(chosen){
  const problem=arm&&robotPowerProblem(arm);
  if(problem)return fail('energy',problem);
  return {ok:true,code:'ready',message:'Objeto al alcance ('+(chosen.distance*100).toFixed(1)+' cm) · '+chosen.weight.toFixed(1)+' / '+capacity+' u.',candidate:chosen};
 }
 const nearest=candidates[0];
 if(!nearest)return fail('alignment','Sin objeto frente a la cara naranja. Centra un cubo suelto frente a ella. Alcance: '+rangeText+'.');
 if(nearest.busy)return fail('busy','Objeto ocupado o articulado. Suéltalo y detén sus órdenes; prueba con un cubo suelto.');
 if(!nearest.matches)return fail('filter','El objeto no coincide con el filtro. Elige Cualquier sólido y pulsa Aplicar filtro, carga y alcance.');
 if(nearest.weight>config.capacity)return fail('load','Objeto demasiado pesado: '+nearest.weight.toFixed(1)+' / '+config.capacity+' u. Reduce la carga o ajusta el agarre.');
 if(nearest.distance>limit)return fail('distance','Objeto a '+(nearest.distance*100).toFixed(1)+' cm de la cara naranja. Alcance: '+rangeText+'. Acerca el objeto o ajusta el brazo.');
 if(arm&&nearest.weight>capacity&&gripperPathClear(hit,nearest,component))return fail('rotor-load',robotPayloadProblem(arm,nearest.weight));
 return fail('blocked','Hay un obstáculo entre la cara naranja y el objeto. Deja libre el contacto.');
}
function gripperGrab(partOrId,feedback=null){
 const check=gripperCheck(partOrId);if(feedback)Object.assign(feedback,check);if(!check.ok)return false;
 const hit=robotGripperHit(partOrId),config=hit.part.mood.gripper,chosen=check.candidate;
 if(!spendGripperEnergy(hit,.05))return false;
 const constraint=robotLockConstraint(hit.g.body,chosen.body,Math.max(12,config.capacity*5));constraint.collideConnected=false;
 for(const eq of constraint.equations)setPhysicsEquation(eq,1e8,4);
 if(chosen.cargo){chosen.body.material=world.defaultMaterial;chosen.body.mass=chosen.weight*.25;chosen.body.type=CANNON.Body.DYNAMIC;chosen.body.fixedRotation=false;chosen.body.updateMassProperties();chosen.cargo.robotHeld=hit.part.id;chosen.cargo.robotPhysical=true;}
 if(chosen.g){stopRoute(chosen.g);leaveHaul(chosen.g);chosen.g.robotHeld=hit.part.id;}
 chosen.body.wakeUp();hit.g.robotGrip=hit.part.id;world.addConstraint(constraint);robotGrips.set(hit.part.id,{id:hit.part.id,...chosen,constraint});return true;
}
function updateRobotGrips(dt){
 robotWorkingParts.clear();if(!robotGrips.size)return;
 for(const [id,grip]of [...robotGrips]){
  const hit=robotGripperHit(id),config=hit?.part.mood.gripper;if(grip.g)grip.weight=totalWeight(grip.g);
  if(grip.cargo){grip.weight=grip.cargo.required||grip.cargo.side**3;if(grip.body.mass!==grip.weight*.25){grip.body.mass=grip.weight*.25;grip.body.updateMassProperties();grip.body.wakeUp();}}
  const arm=robotArms.find(a=>a.gripperId===id),overload=arm?robotPayloadProblem(arm,grip.weight):'';
  if(overload){stopRobotArm(arm,overload,true);continue;}
  if(!hit||!config||!world.bodies.includes(grip.body)||grip.g&&!groups.includes(grip.g)||grip.cargo&&!cargos.includes(grip.cargo)||grip.weight>config.capacity||!spendGripperEnergy(hit,dt*(.08+.08*grip.weight))){releaseGripper(id);if(arm)stopRobotArm(arm,'Sin energía o carga incompatible',true);continue;}
  // Constraint failure is visible as release, never a teleport back to the hand.
  if(gripperFaceDistance(hit,grip)>.10){releaseGripper(id);if(arm)stopRobotArm(arm,'Agarre perdido',true);}
 }
}
function robotArmRotors(arm){return arm.joints.map(rotorForPair).filter(Boolean);}
// Pitch joints need a reduction: the stock shoulder requires ~6.55 N·m
// under its own weight, exceeding a direct 4 N·m drive. Base yaw stays direct.
// Derive this from the controller so old saves receive the fix and detached
// rotors immediately revert to their ordinary drive, without stale metadata.
function robotArmForRotor(rotor){
 return robotArms.find(arm=>arm.joints.some(j=>j.aId===rotor.aId&&j.bId===rotor.bId));
}
function robotJointReduction(rotor,arm=robotArmForRotor(rotor)){
 return arm&&(arm.joints[0].aId!==rotor.aId||arm.joints[0].bId!==rotor.bId)?3:1;
}
function robotLiftCapacity(config,members){
 return Math.min(config.capacity,...members.map(rotor=>rotor.capacity));
}
function robotArmForGroup(g,partId){
 if(!g)return null;
 const direct=robotArms.find(arm=>arm.gripperId===partId||arm.baseId===partId||arm.joints.some(j=>j.aId===partId||j.bId===partId));
 return direct||robotArms.find(arm=>robotArmRotors(arm).some(r=>rotorGroups(r).includes(g)))||robotArms.find(arm=>rotorConnectedGroups([robotGripperHit(arm.gripperId)?.g].filter(Boolean)).includes(g))||null;
}
function robotRelativePose(rotor){const a=rotorPart(rotor.aId),b=rotorPart(rotor.bId);return a.q.inverse().mult(b.q);}
function robotReadPose(arm){return robotArmRotors(arm).map(r=>{const q=robotRelativePose(r);return [q.x,q.y,q.z,q.w];});}
function robotPoseValid(pose,count){return Array.isArray(pose)&&pose.length===count&&pose.every(q=>Array.isArray(q)&&q.length===4&&q.every(Number.isFinite)&&Math.abs(Math.hypot(...q)-1)<.01);}
function robotRemoveBrakes(arm){for(const constraint of arm.brakes||[])if(!rotors.some(rotor=>rotor.constraint===constraint))world.removeConstraint(constraint);for(const constraint of arm.jointBrakes?.values()||[])world.removeConstraint(constraint);arm.brakes=[];arm.jointBrakes=new Map();}
// A joint brake holds the current twist. Only constraint targets change here;
// Cannon corrects the real bodies during subsequent substeps.
function robotJointBrake(rotor){
 const a=rotorPart(rotor.aId),b=rotorPart(rotor.bId);if(!a||!b)return null;
 // The hinge already constrains five degrees of freedom. Lock only twist;
 // a second six-axis lock fights the hinge and prevents the loaded shoulder
 // motor from converging even below its torque limit.
 const brake=new CANNON.Constraint(a.g.body,b.g.body,{collideConnected:false}),equation=new CANNON.RotationalEquation(a.g.body,b.g.body,{maxForce:1000});
 const localA=a.part.q.vmult(V(1,0,0)),axis=a.part.q.vmult(V(0,1,0)),perpendicular=a.g.body.quaternion.vmult(axis.cross(localA)),localB=b.g.body.quaternion.inverse().vmult(perpendicular);
 setPhysicsEquation(equation,1e10,4);brake.equations.push(equation);
 brake.update=function(){this.bodyA.quaternion.vmult(localA,equation.axisA);this.bodyB.quaternion.vmult(localB,equation.axisB);};
 return brake;
}
function robotApplyBrakes(arm){
 // Stopped hinges already lock their twist. A second six-axis lock fights
 // the same contacts, adds solver work and prevents a resting arm from sleeping.
 robotRemoveBrakes(arm);for(const rotor of robotArmRotors(arm)){if(!rotor.constraint)continue;setRotorBrake(rotor,true);arm.brakes.push(rotor.constraint);}
}
function robotReleaseBase(arm){conveyorReleaseBase(arm);}
function createRobotArm(options={}){
 const hit=robotGripperHit(options.gripperId),base=robotGripperHit(options.baseId);if(!hit||!base||!validGripperConfig(hit.part.mood.gripper))return null;
 const members=(options.joints||[]).map(j=>rotors.find(r=>r===j||r.aId===j.aId&&r.bId===j.bId)).filter(Boolean),component=rotorConnectedGroups([hit.g]);
 if(!members.length||members.some(r=>r.servo)||members.length>4||new Set(members).size!==members.length||!component.includes(base.g)||members.some(r=>rotorGroups(r).some(g=>!component.includes(g)))||robotArms.some(a=>a.gripperId===hit.part.id||a.joints.some(j=>members.some(r=>r.aId===j.aId&&r.bId===j.bId)))||conveyors.some(c=>c.joints.some(j=>members.some(r=>r.aId===j.aId&&r.bId===j.bId))))return null;
 const arm={id:++robotArmSerial,gripperId:hit.part.id,baseId:base.part.id,joints:members.map(r=>({aId:r.aId,bId:r.bId})),repeat:options.repeat!==false,poses:{},running:false,jogging:false,state:'idle',status:'Listo · enseña Tomar y Dejar',brakes:[],cycles:0};
 const pose=robotReadPose(arm);arm.poses.pick=robotPoseValid(options.poses?.pick,members.length)?JSON.parse(JSON.stringify(options.poses.pick)):pose;
 arm.poses.place=robotPoseValid(options.poses?.place,members.length)?JSON.parse(JSON.stringify(options.poses.place)):null;
 if(robotPoseValid(options.poses?.home,members.length))arm.poses.home=options.poses.home.map(q=>[...q]);
 robotArms.push(arm);for(const rotor of members)configureRotor(rotor,{enabled:false,mount:'wheel'},true);robotApplyBrakes(arm);return arm;
}
function registerRobotArm(gripperId){
 const hit=robotGripperHit(gripperId);if(!hit)return null;const component=rotorConnectedGroups([hit.g]);if(component.length<2)return null;
 const members=rotors.filter(r=>rotorGroups(r).every(g=>component.includes(g)));if(members.length>4)return null;
 // Walk the chain outwards from the gripper; branching is deliberately rejected.
 const visited=new Set([hit.g]),ordered=[],tail=[];let g=hit.g;
 while(true){const next=members.filter(r=>!ordered.includes(r)&&rotorGroups(r).includes(g));if(!next.length)break;if(next.length!==1)return null;
  const rotor=next[0],other=rotorGroups(rotor).find(item=>item!==g);if(visited.has(other))return null;ordered.push(rotor);visited.add(other);g=other;tail.push(g);
 }
 if(ordered.length!==members.length)return null;
 return createRobotArm({gripperId,baseId:g.parts.find(p=>p.shape==='cube')?.id||g.parts[0].id,joints:ordered.reverse()});
}
function configureRobotArm(arm,patch={}){if(!robotArms.includes(arm)||patch.repeat!==undefined&&typeof patch.repeat!=='boolean')return false;if(patch.repeat!==undefined)arm.repeat=patch.repeat;return true;}
function stopRobotArm(arm,reason='Detenido',blocked=false){
 if(!robotArms.includes(arm))return false;arm.running=false;arm.jogging=false;arm.waypoints=[];arm.state=blocked?'blocked':'idle';arm.status=reason;redraw=true;
 // Stopping is safe inside a weld transaction, while an old body may already
 // be absent. Do not refresh/prune the shared topology until rebuilding ends.
 for(const rotor of robotArmRotors(arm)){rotor.enabled=false;rotor.actualRpm=0;rotor.driveVelocity=0;rotor.constraint?.disableMotor();unpinRotor(rotor);for(const g of rotorGroups(rotor))if(g){g.body.angularVelocity.set(0,0,0);g.body.wakeUp();}}
 releaseGripper(arm.gripperId);robotReleaseBase(arm);robotApplyBrakes(arm);return true;
}
function teachRobotArmPose(arm,name){if(!robotArms.includes(arm)||!['pick','place'].includes(name)||arm.running||arm.jogging)return false;arm.poses[name]=robotReadPose(arm);arm.status=name==='pick'?'Postura Tomar guardada':'Postura Dejar guardada';return true;}
function robotPayloadProblem(arm,weight,members=robotArmRotors(arm)){
 const limit=members.findIndex(rotor=>weight>rotor.capacity);
 return limit<0?'':robotJointName(limit)+' · objeto de '+weight.toFixed(1)+' u supera el límite de '+members[limit].capacity+' u del eje. Usa una carga más liviana o ajusta el eje en P.';
}
function robotPowerProblem(arm){
 const members=robotArmRotors(arm),overload=robotPayloadProblem(arm,robotGrips.get(arm.gripperId)?.weight||0,members);
 if(overload)return overload;
 for(const [i,rotor] of members.entries()){
  const power=rotorPowerState({...rotor,enabled:true});
  if(power.stopReason==='empty')return robotJointName(i)+' sin energía. '+(power.external?'Apaga y recarga la batería externa.':'Deja descansar los enganches o acopla y activa una batería.');
 }
 return '';
}
function robotJointSpeed(rotor){
 const rpm=rotor.speedLimited?Math.min(rotor.rpm,rotor.effectiveRpm):rotor.rpm;
 return rpm*2*Math.PI/60/robotJointReduction(rotor);
}
function robotMotionDeadline(arm){
 return Math.max(20,...robotArmRotors(arm).map((rotor,i)=>{
  const speed=robotJointSpeed(rotor);
  return 5+1.5*Math.abs(robotTargetError(rotor,arm.target[i]))/speed;
 }));
}
function robotBeginMotion(arm,target,jogging=false){
 const members=robotArmRotors(arm),base=robotGripperHit(arm.baseId),hit=robotGripperHit(arm.gripperId),component=hit?rotorConnectedGroups([hit.g]):[];
 if(members.length!==arm.joints.length||!base||!hit||!component.includes(base.g)||!robotPoseValid(target,members.length)){arm.status='Revisa el montaje y guarda las posturas del brazo.';return false;}
 if(component.some(g=>(held?.items||[]).some(item=>item.g===g))){arm.status='Suelta el brazo de tu mano antes de iniciarlo.';return false;}
 const problem=robotPowerProblem(arm);if(problem){arm.state='blocked';arm.status=problem;redraw=true;return false;}
 if(!robotSetRoute(arm,target))return false;
 robotRemoveBrakes(arm);robotReleaseBase(arm);conveyorAcquireBase(arm,base.g.body);
 arm.running=!jogging;arm.jogging=jogging;arm.elapsed=0;arm.settled=0;arm.lastError=Infinity;arm.stuck=0;
 for(const rotor of members)if(!configureRotor(rotor,{enabled:true,mount:'wheel'},true)){stopRobotArm(arm,'No se pudo iniciar',true);return false;}
 arm.deadline=robotMotionDeadline(arm);return true;
}
function jogRobotArm(arm,index,degrees){
 if(!robotArms.includes(arm)||arm.running||arm.jogging||robotGrips.has(arm.gripperId)||!Number.isInteger(index)||index<0||index>=arm.joints.length||!Number.isFinite(degrees)||Math.abs(degrees)>90)return false;
 const pose=robotReadPose(arm);if(!pose[index])return false;const axis=V(0,1,0),turn=Q();turn.setFromAxisAngle(axis,degrees*Math.PI/180);const q=turn.mult(new CANNON.Quaternion(...pose[index]));pose[index]=[q.x,q.y,q.z,q.w];
 if(!robotBeginMotion(arm,pose,true))return false;arm.state='jog';arm.status='Ajustando articulación '+(index+1);return true;
}
function startRobotArm(arm){
 if(!robotArms.includes(arm)||arm.running||arm.jogging||robotGrips.has(arm.gripperId))return false;
 if(!robotPoseValid(arm.poses.pick,arm.joints.length)||!robotPoseValid(arm.poses.place,arm.joints.length)){if(arm)arm.status='Guarda primero las posturas Tomar y Dejar';return false;}
 if(!robotBeginMotion(arm,arm.poses.home||arm.poses.pick))return false;rememberMechanismRun(robotGripperHit(arm.baseId).g,'arm',arm);arm.state=arm.poses.home?'home':'return';arm.status=arm.poses.home?'Yendo a la posición inicial':'Volviendo a Tomar';return true;
}
function robotTargetError(rotor,target){
 const current=robotRelativePose(rotor),difference=new CANNON.Quaternion(...target).mult(current.inverse()),axis=V(0,1,0);
 let error=2*Math.atan2(V(difference.x,difference.y,difference.z).dot(axis),difference.w);while(error>Math.PI)error-=2*Math.PI;while(error< -Math.PI)error+=2*Math.PI;return error;
}
function updateRobotArms(dt){
 for(const arm of [...robotArms]){
  const members=robotArmRotors(arm),hit=robotGripperHit(arm.gripperId),base=robotGripperHit(arm.baseId);
  if(!hit||!base||members.length!==arm.joints.length||!rotorConnectedGroups([hit.g]).includes(base.g)){stopRobotArm(arm,'Brazo incompleto');robotRemoveBrakes(arm);robotArms.splice(robotArms.indexOf(arm),1);continue;}
  if(!arm.running&&!arm.jogging){if(!arm.brakes.length)robotApplyBrakes(arm);continue;}
  if(members.some(r=>!r.enabled)){stopRobotArm(arm,robotPowerProblem(arm)||'Motor detenido · revisa energía y carga',true);continue;}
  arm.elapsed+=dt;
  if(arm.state==='wait'){
   arm.scan=(arm.scan||0)-dt;
   if(arm.scan<=0){
    arm.scan=.10;const feedback={};
    if(gripperGrab(arm.gripperId,feedback)){if(!robotSetRoute(arm,arm.poses.place))continue;arm.state='carry';arm.elapsed=0;arm.stuck=0;arm.lastError=Infinity;arm.deadline=robotMotionDeadline(arm);arm.status='Tomado · llevando a B';}
    else if(['blocked','energy','rotor-load'].includes(feedback.code))stopRobotArm(arm,feedback.message,true);
    else arm.status=feedback.message;
   }
   continue;
  }
  const errors=members.map((r,i)=>Math.abs(robotTargetError(r,arm.target[i]))),max=Math.max(...errors),speed=Math.max(...members.map(r=>Math.abs(r.actualRpm||0)));
  arm.settled=max<.05&&speed<1.2?arm.settled+dt:0;
  if(max<arm.lastError-.003){arm.lastError=max;arm.stuck=0;}else arm.stuck+=dt;
  if(arm.elapsed>arm.deadline||max>.1&&(arm.stuck>3||arm.stuck>.4&&members.some(r=>r.stalled))){
   if(!arm.routeRetried&&arm.destination){robotSetRoute(arm,arm.destination,true);continue;}
   stopRobotArm(arm,'Movimiento bloqueado · revisa espacio, fuerza y carga',true);continue;
  }
  if(arm.settled<.12)continue;arm.settled=0;arm.elapsed=0;arm.stuck=0;arm.lastError=Infinity;
  if(arm.waypoints?.length){arm.target=arm.waypoints.shift();arm.deadline=robotMotionDeadline(arm);continue;}
  if(arm.state==='home'){
   if(robotSetRoute(arm,arm.poses.pick)){arm.state='return';arm.status='Yendo a A';}
   continue;
  }
  if(arm.jogging){stopRobotArm(arm,'Postura lista · puedes guardarla');continue;}
  if(arm.state==='return'){arm.state='wait';arm.status='Esperando objeto compatible bajo la cara de agarre';arm.scan=0;}
  else if(arm.state==='carry'){releaseGripper(arm.gripperId);arm.cycles++;if(!arm.repeat){stopRobotArm(arm,'Ciclo completado');continue;}if(!robotSetRoute(arm,arm.poses.pick))continue;arm.state='return';arm.deadline=robotMotionDeadline(arm);arm.status='Soltado · volviendo a A';}
 }
}
function driveRobotArms(dt){
 for(const arm of robotArms){if(!arm.running&&!arm.jogging)continue;
  const members=robotArmRotors(arm);for(let i=0;i<members.length;i++){
   const rotor=members[i];if(!rotor.enabled||!rotor.constraint)continue;
   const reduction=robotJointReduction(rotor),error=robotTargetError(rotor,arm.target[i]),limit=robotJointSpeed(rotor);
   let brake=arm.jointBrakes.get(rotor.id);
   if(brake&&Math.abs(error)>.05){world.removeConstraint(brake);arm.jointBrakes.delete(rotor.id);brake=null;}
   const brakeTolerance=arm.state==='carry' ? .03 : .012;
   if(!brake&&Math.abs(error)<brakeTolerance&&Math.abs(rotor.actualRpm||0)<1.2){brake=robotJointBrake(rotor);if(brake){arm.jointBrakes.set(rotor.id,brake);world.addConstraint(brake);}}
   if(brake){rotor.driveVelocity=0;rotor.motorImpulse=0;rotor.constraint.disableMotor();continue;}
   const brakingAngle=(12*2*Math.PI/60)/(5*reduction);
   const speed=-limit*clamp(error/brakingAngle,-1,1);rotor.driveVelocity=speed;rotor.constraint.enableMotor();rotor.constraint.setMotorSpeed(speed);rotor.constraint.setMotorMaxForce(rotor.maxTorque*reduction*dt);
  }
 }
}
function robotArmSignal(arm){
 if(arm.state==='blocked')return 'blocked';
 if(arm.state==='wait'&&arm.running)return 'waiting';
 return arm.running||arm.jogging?'running':'off';
}
function robotArmStatus(arm){
 if(!arm)return 'Selecciona un cubo de agarre o un brazo';
 return arm.waypoints?.length&&(arm.running||arm.jogging)?arm.status+' · rodeando un obstáculo':arm.status;
}
function robotStopForGroups(list){stopServoMarchForGroups(list);flightStopForGroups(list);conveyorStopForGroups(list);for(const arm of robotArms)if(rotorConnectedGroups([robotGripperHit(arm.gripperId)?.g].filter(Boolean)).some(g=>list.includes(g)))stopRobotArm(arm,'Detenido para manipular');for(const grip of [...robotGrips.values()])if(list.includes(grip.g)||list.includes(robotGripperHit(grip.id)?.g))releaseGripper(grip.id);}
function robotBeforeRemoveGroup(g){robotStopForGroups([g]);for(const arm of robotArms)if(arm.brakes.some(c=>c.bodyA===g.body||c.bodyB===g.body))robotRemoveBrakes(arm);}
function clearRobotArms(){cancelRobotPoseDraft();for(const arm of [...robotArms]){stopRobotArm(arm);robotRemoveBrakes(arm);}for(const id of [...robotGrips.keys()])releaseGripper(id);robotArms.length=0;robotWorkingParts.clear();}
function pruneRobotArms(){for(const arm of [...robotArms])if(!robotGripperHit(arm.gripperId)||!robotGripperHit(arm.baseId)||robotArmRotors(arm).length!==arm.joints.length){stopRobotArm(arm,'Brazo incompleto');robotRemoveBrakes(arm);robotArms.splice(robotArms.indexOf(arm),1);}}
function serializeRobotArms(){pruneRobotArms();return robotArms.map(arm=>({gripperId:arm.gripperId,baseId:arm.baseId,joints:arm.joints.map(j=>({...j})),poses:JSON.parse(JSON.stringify(arm.poses)),repeat:arm.repeat}));}
function restoreRobotArms(records){for(const data of Array.isArray(records)?records:[]){if(robotArms.some(a=>a.gripperId===data.gripperId))continue;createRobotArm(data);}}
function robotArmTemplate(subject,idToKey,linkedRotors){
 const component=mechanismGroups(subject),arm=robotArms.find(a=>component.includes(robotGripperHit(a.gripperId)?.g));if(!arm)return null;
 return {version:1,base:idToKey.get(arm.baseId),gripper:idToKey.get(arm.gripperId),joints:robotArmRotors(arm).map(r=>linkedRotors.indexOf(r)),poses:JSON.parse(JSON.stringify(arm.poses)),repeat:arm.repeat};
}
function restoreRobotArmTemplate(data,keyToId,joints){
 if(!data)return null;const arm=createRobotArm({baseId:keyToId.get(data.base),gripperId:keyToId.get(data.gripper),joints:data.joints.map(i=>joints[i]),poses:data.poses,repeat:data.repeat});
 if(arm&&!data.poses){const pose=robotReadPose(arm),rotor=robotArmRotors(arm)[0],axis=V(0,1,0),turn=Q();turn.setFromAxisAngle(axis,Math.PI/2);const q=turn.mult(new CANNON.Quaternion(...pose[0]));pose[0]=[q.x,q.y,q.z,q.w];arm.poses.place=pose;arm.status='Listo · Tomar aquí y Dejar a 90°';}
 return arm;
}

// Sample the real hinge chain without moving bodies or touching the stored poses.
function robotKinematics(arm){
 const base=robotGripperHit(arm.baseId),grip=robotGripperHit(arm.gripperId),members=robotArmRotors(arm);
 if(!base||!grip||members.length!==arm.joints.length)return null;
 const chain=[],visited=new Set([base.g]);
 let parent=base.g;
 while(chain.length<members.length){
  const index=members.findIndex(r=>{const ends=rotorGroups(r);return ends.includes(parent)&&ends.some(g=>g&&!visited.has(g));});
  if(index<0)return null;
  const r=members[index],a=rotorPart(r.aId),b=rotorPart(r.bId);
  if(!a||!b)return null;
  const sign=a.g===parent?1:-1,child=sign===1?b.g:a.g;
  const tip=couplerTip(a);
  chain.push({index,sign,pivot:tip.point,axis:tip.axis,child,position:child.body.position.clone(),rotation:child.body.quaternion.clone()});
  visited.add(child);parent=child;
 }
 if(parent!==grip.g)return null;
 const normal=grip.q.vmult(V(0,-1,0)),point=add(grip.p,mul(normal,HALF));
 const reach=chain.reduce((sum,link,i)=>sum+link.pivot.distanceTo(chain[i+1]?.pivot||point),0);
 return {chain,point,normal,reach,relative:robotReadPose(arm)};
}

function robotKinematicSample(model,angles){
 let rotation=Q(),origin=V();const links=[];
 for(const link of model.chain){
  const pivot=add(origin,rotation.vmult(link.pivot)),axis=rotation.vmult(link.axis),turn=Q();
  turn.setFromAxisAngle(axis,angles[link.index]);rotation=turn.mult(rotation);
  origin=sub(pivot,rotation.vmult(link.pivot));
  links.push({link,pivot,axis,position:add(origin,rotation.vmult(link.position)),rotation:rotation.mult(link.rotation)});
 }
 return {point:add(origin,rotation.vmult(model.point)),normal:rotation.vmult(model.normal),links};
}

function robotAnglesToPose(model,angles){
 const pose=model.relative.map(q=>[...q]);
 for(const link of model.chain){
  const i=link.index,turn=Q();turn.setFromAxisAngle(V(0,1,0),angles[i]*link.sign);
  const q=turn.mult(new CANNON.Quaternion(...pose[i]));q.normalize();pose[i]=[q.x,q.y,q.z,q.w];
 }
 return pose;
}

function robotRouteScene(model,grip){
 const moving=new Set(model.chain.map(link=>link.child)),obstacles=[];
 const reach=model.reach+Math.max(...model.chain.map(link=>link.position.distanceTo(link.pivot)+link.child.body.boundingRadius))+(grip?.body.boundingRadius||0);
 const pad=V(reach,reach,reach),center=model.chain[0].pivot,region={min:sub(center,pad),max:add(center,pad)};
 for(const g of groups)if(!moving.has(g)&&g!==grip?.g&&!g.virtualConveyor&&boundsOverlap(region,physicalGroupBounds(g)))obstacles.push(...rigidCollisionParts(g),...conveyorGroupSurfaces(g).map(collisionEntry));
 for(const wall of [...puzzleObstacleBounds(),...alphaObstacles()]){
  const entry=collisionEntry({p:wall.p,q:wall.q||Q(),half:wall.half});if(boundsOverlap(region,entry))obstacles.push(entry);
 }
 for(const c of cargos)if(c!==grip?.cargo&&boundsOverlap(region,cargoBounds(c)))obstacles.push(collisionEntry(cargoPose(c)));
 const wrist=model.chain.at(-1),inverse=wrist.rotation.inverse();
 const load=grip?{offset:inverse.vmult(sub(grip.body.position,wrist.position)),q:inverse.mult(grip.body.quaternion)}:null;
 return (angles,clearance=0)=>{
  const sample=robotKinematicSample(model,angles),occupied=[];
  const clear=solids=>!solids.some(e=>e.min.y<-.0015||e.max.y>ROOM_HEIGHT||Math.max(-e.min.x,-e.min.z,e.max.x,e.max.z)>ROOM_SIZE/2)&&!collisionEntriesOverlap(solids,obstacles,.001)&&!occupied.some(previous=>collisionEntriesOverlap(solids,previous,.001));
  for(const {link,position,rotation} of sample.links){
   const solids=rigidQueryPoses(link.child,position,rotation).concat(conveyorGroupSurfaces(link.child,position,rotation)).map(collisionEntry);
   if(!clear(solids))return false;
   occupied.push(solids);
  }
  if(load){
   const end=sample.links.at(-1),p=add(end.position,end.rotation.vmult(load.offset)),q=end.rotation.mult(load.q);
   const solids=grip.g?rigidQueryPoses(grip.g,p,q):[{...cargoPose(grip.cargo),p,q}];
   if(!clear(solids.map(collisionEntry)))return false;
   if(clearance>0){
    const below=solids.map(s=>collisionEntry({...s,p:sub(s.p,V(0,clearance,0))}));
    if(collisionEntriesOverlap(below,obstacles,.001))return false;
   }
  }
  return true;
 };
}

// Plan in hinge space. A folded posture on either side allows a lift, a
// base rotation and a descent without dragging the wrist or payload sideways.
function robotPlanRoute(arm,target){
 const model=robotKinematics(arm);if(!model)return null;
 const members=robotArmRotors(arm),end=members.map((r,i)=>robotTargetError(r,target[i]));
 for(const link of model.chain)end[link.index]*=link.sign;
 const zero=end.map(()=>0),clear=robotRouteScene(model,robotGrips.get(arm.gripperId));
 const edge=(a,b,clearance=0)=>{
  const delta=a.map((v,i)=>b[i]-v),span=Math.max(...delta.map(Math.abs));
  if(span>Math.PI+.00001)return false;
  const samples=Math.max(1,Math.ceil(delta.reduce((sum,v)=>sum+Math.abs(v),0)*model.reach/.025));
  for(let j=1;j<=samples;j++)if(!clear(a.map((v,i)=>v+delta[i]*j/samples),clearance))return false;
  return true;
 };
 const [base,shoulder,elbow,wrist]=model.chain;
 if(!clear(end)){
  // Approaching a loose pickup can leave the braked wrist a few mm lower
  // under gravity. Allow a small lift within the servo settling tolerance.
  if(!shoulder||target!==arm.poses.pick)return null;
  const requested=robotKinematicSample(model,end).point;
  let adjusted=false;
  for(const lift of [-.012,.012,-.025,.025,-.04,.04]){
   const candidate=[...end];candidate[shoulder.index]+=lift;
   if(wrist)candidate[wrist.index]-=lift;
   const point=robotKinematicSample(model,candidate).point;
   if(point.y<=requested.y||point.distanceTo(requested)>.022||!clear(candidate))continue;
   end.splice(0,end.length,...candidate);target=robotAnglesToPose(model,end);adjusted=true;break;
  }
  if(!adjusted)return null;
 }
 if(edge(zero,end))return [target];
 const yawFirst=[...zero];yawFirst[base.index]=end[base.index];
 const yawLast=[...end];yawLast[base.index]=0;
 for(const mid of [yawFirst,yawLast])if(edge(zero,mid)&&edge(mid,end))return [robotAnglesToPose(model,mid),target];
 const reverseSweep=()=>{
  const yaw=end[base.index];if(Math.abs(yaw)<.12)return null;
  const around=[...end];around[base.index]-=Math.sign(yaw)*2*Math.PI;
  const mid=around.map(a=>a*.5);
  return edge(zero,mid)&&edge(mid,around)?[robotAnglesToPose(model,mid),target]:null;
 };
 if(!shoulder)return reverseSweep();
 for(const bend of [.03,.08,.18,.35,.44,.55,.63,.7,.8,1,1.2,1.45].flatMap(angle=>[angle,-angle])){
  if(bend===.8){const alternate=reverseSweep();if(alternate)return alternate;}
  const fold=[...zero];fold[shoulder.index]=bend;
  if(elbow)fold[elbow.index]=-bend*.55;
  if(wrist)fold[wrist.index]=-bend*.45;
  const swing=[...fold];swing[base.index]=end[base.index];
  if(!edge(zero,fold))continue;
  if(edge(fold,end))return [robotAnglesToPose(model,fold),target];
  // A loaded gripper deflects under gravity. Leave vertical clearance while
  // crossing the obstacle, then descend to the exact delivery posture.
  if(edge(fold,swing,.032)&&edge(swing,end))return [robotAnglesToPose(model,fold),robotAnglesToPose(model,swing),target];
 }
 return null;
}
function robotSetRoute(arm,target,retry=false){
 const route=robotPlanRoute(arm,target);
 if(!route){stopRobotArm(arm,'Recorrido bloqueado · despeja el paso o cambia la altura de la postura en P.',true);return false;}
 arm.destination=target;arm.routeRetried=retry;
 arm.target=route.shift();arm.waypoints=route;arm.elapsed=0;arm.settled=0;arm.stuck=0;arm.lastError=Infinity;
 arm.deadline=robotMotionDeadline(arm);return true;
}

// Damping handles straight arms and hinges with no leverage in the requested direction.
function robotSolveStep(columns,residual){
 const matrix=columns.map((a,i)=>[...columns.map((b,j)=>a[0].dot(b[0])+a[1].dot(b[1])+(i===j?.00008:0)),a[0].dot(residual[0])+a[1].dot(residual[1])]);
 const count=matrix.length;
 for(let i=0;i<count;i++){
  const divisor=matrix[i][i];
  for(let j=i;j<=count;j++)matrix[i][j]/=divisor;
  for(let k=0;k<count;k++)if(k!==i){
   const scale=matrix[k][i];
   for(let j=i;j<=count;j++)matrix[k][j]-=scale*matrix[i][j];
  }
 }
 return matrix.map(row=>clamp(row[count],-.35,.35));
}
function robotPoseClear(sample){
 const moving=sample.links.map(({link})=>link.child),occupied=[];
 for(const {link,position,rotation}of sample.links){
  if(!validPose(link.child,position,rotation,moving))return false;
  const solids=rigidQueryPoses(link.child,position,rotation).map(collisionEntry);
  if(occupied.some(other=>collisionEntriesOverlap(solids,other,.001)))return false;
  occupied.push(solids);
 }
 return true;
}
function solveRobotPose(model,target,normal,warm=null){
 if(target.distanceTo(model.chain[0].pivot)>model.reach+.004)return {reason:'Fuera del alcance del brazo'};
 const count=model.chain.length,zero=Array(count).fill(0),radial=sub(target,model.chain[0].pivot),from=sub(model.point,model.chain[0].pivot),axis=model.chain[0].axis;
 const yaw=Math.atan2(axis.dot(from.cross(radial)),from.dot(radial)-axis.dot(from)*axis.dot(radial)),seed=(base,bend)=>{
  const angles=[...zero];angles[model.chain[0].index]=base;
  if(count>1)angles[model.chain[1].index]=bend;
  if(count>2)angles[model.chain[2].index]=-bend*1.4;
  if(count>3)angles[model.chain[3].index]=bend*.4;
  return angles;
 };
 const seeds=[...(warm?[warm]:[]),seed(yaw,0),zero,seed(yaw,1.1),seed(yaw,-1.1),seed(yaw+Math.PI,0),seed(yaw+Math.PI,1.1),seed(yaw+Math.PI,-1.1)];
 let best=null,blocked=false;
 for(const initial of seeds){
  const angles=[...initial];
  for(let i=0;i<32;i++){
   const sample=robotKinematicSample(model,angles),gap=target.distanceTo(sample.point),alignment=sample.normal.dot(normal),score=gap+.06*(1-alignment);
   if(!best||score<best.score)best={sample,angles:[...angles],score};
   if(gap<.0045&&alignment>.98){
    if(!robotPoseClear(sample)){blocked=true;break;}
    return {sample,angles,pose:robotAnglesToPose(model,angles)};
   }
   const columns=[];
   for(const {link,pivot,axis}of sample.links)columns[link.index]=[axis.cross(sub(sample.point,pivot)),mul(axis.cross(sample.normal),.1)];
   const step=robotSolveStep(columns,[sub(target,sample.point),mul(sub(normal,sample.normal),.1)]);
   for(let j=0;j<count;j++)angles[j]=Math.atan2(Math.sin(angles[j]+step[j]),Math.cos(angles[j]+step[j]));
  }
 }
 return {...best,reason:blocked?'Hay piezas en la postura marcada':'El brazo no alcanza ese punto con la pinza alineada'};
}

let robotPoseDraft=null;
const ROBOT_MAX_POSE_OFFSET_CM=100*Math.hypot(ROOM_SIZE,ROOM_SIZE,ROOM_HEIGHT);
function beginRobotPoseDraft(arm,name,heightCm){
 if(!['home','pick','place'].includes(name)||!Number.isFinite(heightCm)||heightCm<0||heightCm>ROBOT_MAX_POSE_OFFSET_CM||held||arm.running||arm.jogging||robotGrips.has(arm.gripperId))return false;
 const model=robotKinematics(arm);if(!model)return false;
 cancelUnitCreation();cancelShelfPlacement();cancelPowerCable();
 robotPoseDraft={arm,name,model,heightCm,nextUpdate:0};
 panel.hidden=true;captureMouse();canvas.focus({preventScroll:true});redraw=true;
 return true;
}
function cancelRobotPoseDraft(){
 if(!robotPoseDraft)return;
 robotPoseDraft=null;redraw=true;
}
function returnRobotPosePanel(){
 const arm=robotPoseDraft?.arm,name=robotPoseDraft?.name;cancelRobotPoseDraft();
 if(!arm||!robotArms.includes(arm))return;
 const grip=robotGripperHit(arm.gripperId);
 if(grip)selected={g:grip.g,part:grip.part};
 robotPanelGripperId=arm.gripperId;pause();showTablet();
 switchPanelTab('mechanisms');updatePanel();const control=document.querySelector('#arm-pose-'+name);control.scrollIntoView?.({block:'nearest'});control.focus({preventScroll:true});
}
function updateRobotPoseDraft(time=performance.now(),force=false){
 const draft=robotPoseDraft;if(!draft||!force&&time<draft.nextUpdate)return;
 draft.nextUpdate=time+100;
 const dir=!gameInputActive()&&hoverPointer?screenRay(hoverPointer.x,hoverPointer.y):direction();
 const surface=creationSurfaceAim(dir,draft.model.chain.map(link=>link.child));
 if(!surface||surface.normal.norm2()<.9){
  draft.solution=null;draft.surface=null;draft.reason='Apunta a la cara del objeto o a una superficie de entrega';redraw=true;return;
 }
 const heightAxis=draft.name==='home'?V(0,1,0):surface.normal;
 const target=add(surface.point,mul(heightAxis,draft.heightCm/100));
 if(!force&&draft.target?.distanceTo(target)<.002&&draft.surface?.normal.dot(surface.normal)>.999)return;
 const warm=draft.solution?.pose&&draft.target?.distanceTo(target)<.1?draft.solution.angles:null;
 draft.target=target;draft.surface=surface;
 draft.solution=solveRobotPose(draft.model,target,mul(heightAxis,-1),warm);
 draft.reason=draft.solution.reason;redraw=true;
}
function confirmRobotPoseDraft(){
 const draft=robotPoseDraft;if(!draft)return false;
 updateRobotPoseDraft(performance.now(),true);
 if(!draft.solution?.pose||!robotArms.includes(draft.arm))return false;
 draft.arm.poses[draft.name]=draft.solution.pose;document.querySelector('#arm-'+draft.name+'-height').value=draft.heightCm;
 draft.arm.status=({home:'Posición inicial',pick:'A · Tomar',place:'B · Soltar'}[draft.name])+' guardada';
 returnRobotPosePanel();return true;
}
function robotPoseMouse(event){
 if(![0,2].includes(event.button))return;
 event.preventDefault();
 if(event.button===2){returnRobotPosePanel();return;}
 if(!gameInputActive()&&Number.isFinite(event.clientX)){
  const rect=canvas.getBoundingClientRect();hoverPointer={x:event.clientX-rect.left,y:event.clientY-rect.top};
 }
 confirmRobotPoseDraft();
}
function drawRobotPoseDraft(){
 const draft=robotPoseDraft;if(!draft?.surface)return;
 const valid=!!draft.solution?.pose,color=valid?[.25,.75,1,.43]:[1,.26,.21,.4];
 const {point,normal}=draft.surface,rotation=Q();rotation.setFromVectors(V(0,1,0),normal);
 gl.uniform1f(uniforms.uJitter,0);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
 drawBox(add(point,mul(normal,.002)),rotation,V(.07,.003,.07),color);
 drawWideLines([point,draft.target],[...color.slice(0,3),.9],2);
 const links=draft.solution?.sample?.links||[];
 for(const {link,position,rotation} of links){
  for(const pose of rigidQueryPoses(link.child,position,rotation)){
   if(pose.half)drawBox(pose.p,pose.q,mul(pose.half,2),color);else drawUnitMesh(pose,color,3);
  }
 }
 gl.depthMask(true);gl.disable(gl.BLEND);gl.uniform1f(uniforms.uJitter,visuals.jitter/100);
}

// A completed conveyor retains its real chassis and hinged Q-bit rollers.
// Its final belt adds a visible contact surface; bounded powered traction
// moves touching loads while Cannon resolves gravity, support and collisions.
const conveyors=[],conveyorPins=new Map();let conveyorSerial=0,conveyorBodyUpdateDepth=0;
const conveyorDirtyBodies=new Set();
function conveyorUpdateBodyProperties(body){
 body.aabbNeedsUpdate=true;if(conveyorBodyUpdateDepth){conveyorDirtyBodies.add(body);return;}
 body.updateMassProperties();body.updateBoundingRadius();
}
function batchConveyorBodyUpdates(run){
 conveyorBodyUpdateDepth++;try{return run();}finally{if(!--conveyorBodyUpdateDepth){const pending=[...conveyorDirtyBodies];conveyorDirtyBodies.clear();for(const body of pending)conveyorUpdateBodyProperties(body);}}
}
// Cannon.addShape recomputes every previous shape's bounds and mass each time.
// These callers append a complete skin/cartridge and refresh once at the end.
function conveyorAppendShape(body,shape,offset,orientation){body.shapes.push(shape);body.shapeOffsets.push(offset.clone());body.shapeOrientations.push(orientation.clone());}
// Ownership is invariant until a weld, split or rotor edit invalidates the
// mechanical index. Do not transform every original piece on every substep
// merely to prove that an assembled conveyor still owns its same material.
function conveyorTopology(conveyor){
 if(!conveyor)return null;const topology=mechanicalTopologyIndex(),cached=conveyor.topologyCache;
 if(cached?.topology===topology&&cached.joints===conveyor.joints&&cached.required===conveyor.required&&cached.baseId===conveyor.baseId)return cached;
 const base=topology.parts.get(conveyor.baseId)||null,members=(conveyor.joints||[]).map(j=>topology.byPair.get(j.aId+':'+j.bId)).filter(Boolean),owned=new Set(base?[base.g]:[]),rollerBodies=new Set();
 for(const r of members)for(const id of [r.aId,r.bId]){const g=topology.parts.get(id)?.g;if(g){owned.add(g);if(g!==base?.g)rollerBodies.add(g.body);}}
 const complete=!!base&&members.length===(conveyor.joints||[]).length&&(conveyor.required||[]).every(id=>owned.has(topology.parts.get(id)?.g));
 return conveyor.topologyCache={topology,joints:conveyor.joints,required:conveyor.required,baseId:conveyor.baseId,base,members,complete,rollerBodies,componentBodies:null};
}
function conveyorComponentBodies(conveyor){const cache=conveyorTopology(conveyor);return cache.componentBodies||(cache.componentBodies=new Set(rotorConnectedGroups(cache.base?[cache.base.g]:[]).map(g=>g.body)));}
function conveyorRotors(conveyor){return conveyorTopology(conveyor)?.members||[];}
// Stopped, closed roller cartridges follow the chassis through their real
// braked hinge while being carried. Only untouched exclusive roller groups
// qualify: attached tools, additional hinges or adapted pieces retain their
// independent hand targets and the full general mechanism manipulation path.
function passiveConveyorRollers(list){
 const included=new Set(list),passive=new Map(),topology=mechanicalTopologyIndex();
 for(const conveyor of conveyors){const cache=conveyorTopology(conveyor),base=cache.base?.g;
  if(conveyor.running||!cache.complete||!included.has(base))continue;
  const required=new Set(conveyor.required);
  for(const rotor of cache.members){
   if(rotor.enabled||rotor.servo)continue;const pair=rotorGroups(rotor),roller=pair.find(g=>g&&g!==base);
   if(!roller||!included.has(roller)||pair.filter(g=>g===base).length!==1||(topology.edges.get(roller)||[]).length!==1)continue;
   if(roller.parts.some(p=>!required.has(p.id)||p.mood?.gripper||p.mood?.flight||p.mood?.externalBattery||p.mood?.production||QBitsWorkshop.hasAdaptation(p)))continue;
   passive.set(roller,base);
  }
 }
 return passive;
}
// Completed standard roller cartridges are logical material, not separate
// simulation islands. Keep their original groups and rotor IDs for storage,
// power and disassembly, transfer their mass to the chassis, and let one fixed
// swept envelope plus the contact skin handle physical interactions.
function virtualConveyorCandidates(conveyor){
 const cache=conveyorTopology(conveyor),base=cache?.base?.g;if(!base||!cache.complete||cache.members.length!==3||base.virtualConveyor)return null;
 const topology=mechanicalTopologyIndex(),required=new Set(conveyor.required),records=[];
 for(const rotor of cache.members){const pair=rotorGroups(rotor),g=pair.find(group=>group&&group!==base);
  if(!g||pair[rotor.moving==='a'?0:1]!==g||rotor.servo||g.virtualConveyor&&g.virtualConveyor.conveyor!==conveyor||(topology.edges.get(g)||[]).length!==1||g.parts.length!==3||g.parts.filter(p=>unitShape(p)==='coupler').length!==2||g.parts.filter(p=>unitShape(p)==='cube').length!==1)return null;
  if(g.parts.some(p=>!required.has(p.id)||p.mood?.gripper||p.mood?.flight||p.mood?.externalBattery||p.mood?.production||QBitsWorkshop.hasAdaptation(p)))return null;
  if(world.constraints.some(joint=>joint!==rotor.constraint&&(joint.bodyA===g.body||joint.bodyB===g.body)))return null;
  records.push({g,rotor});
 }return {base,records};
}
function syncVirtualConveyorGroup(g){
 const record=g?.virtualConveyor;if(!record)return;const base=record.baseGroup,part=record.basePart;if(!part)return;
 const body=base.body,origin=add(body.position,body.quaternion.vmult(part.offset)),rotation=body.quaternion.mult(part.q),p=add(origin,rotation.vmult(record.p)),q=rotation.mult(record.q),offset=sub(p,body.position);
 g.body.position.copy(p);g.body.quaternion.copy(q);g.body.velocity.copy(add(body.velocity,body.angularVelocity.cross(offset)));g.body.angularVelocity.copy(body.angularVelocity);g.body.sleepState=body.sleepState;g.body.force.set(0,0,0);g.body.torque.set(0,0,0);g.body.aabbNeedsUpdate=true;
}
function syncVirtualConveyors(){for(const conveyor of conveyors)for(const record of conveyor.virtual?.records||[])syncVirtualConveyorGroup(record.g);}
function virtualConveyorVisualPose(g,part){
 syncVirtualConveyorGroup(g);const record=g.virtualConveyor,pose=partPose(g,part);if(!record)return pose;
 const rotor=record.rotor,frame=rotorMovingFrame(rotor,g),phase=Number.isFinite(rotor.visualPhase)?rotor.visualPhase:0;if(!phase)return pose;
 const axis=g.body.quaternion.vmult(frame.axis),pivot=add(g.body.position,g.body.quaternion.vmult(frame.pivot)),turn=Q();turn.setFromAxisAngle(axis,phase);
 return {...pose,p:add(pivot,turn.vmult(sub(pose.p,pivot))),q:turn.mult(pose.q)};
}
function virtualizeConveyor(conveyor){
 if(conveyor.virtual)return true;
 const candidate=virtualConveyorCandidates(conveyor);if(!candidate)return false;
 const {base,records}=candidate,baseHit=rotorPart(conveyor.baseId),inverse=baseHit.q.inverse(),body=base.body,proxies=[];
 // Build every record before mutating the world, so custom or invalid geometry
 // falls back to its original independently simulated cartridge intact.
 for(const record of records){const {g,rotor}=record,frame=rotorMovingFrame(rotor,g),pivot=frame.pivot,axis=frame.axis;let low=Infinity,high=-Infinity;
  for(const pose of poses(g,V(),Q()))for(const point of corners(pose)){const along=sub(point,pivot).dot(axis);low=Math.min(low,along);high=Math.max(high,along);}
  if(!Number.isFinite(low)||!Number.isFinite(high)||high<=low)return false;
  const localCenter=add(pivot,mul(axis,(low+high)/2)),center=add(g.body.position,g.body.quaternion.vmult(localCenter)),turn=Q();turn.setFromVectors(V(0,0,1),axis);turn.normalize();
  const q=body.quaternion.inverse().mult(g.body.quaternion.mult(turn)),offset=body.quaternion.inverse().vmult(sub(center,body.position)),half=V(frame.radius,frame.radius,(high-low)/2),shape=new CANNON.Box(half);
  Object.assign(record,{conveyor,baseId:conveyor.baseId,baseGroup:base,basePart:baseHit.part,p:inverse.vmult(sub(g.body.position,baseHit.p)),q:inverse.mult(g.body.quaternion),mass:g.body.mass,inertia:g.body.inertia.clone(),proxy:{shape,offset,q,half}});proxies.push(record.proxy);
 }
 const mass=records.reduce((n,r)=>n+r.mass,0);conveyor.virtual={baseGroup:base,body,records,proxies,mass};
 for(const record of records){const {g,rotor}=record;if(rotor.constraint)world.removeConstraint(rotor.constraint);rotor.constraint=null;rotor.virtualConveyor=conveyor;rotor.visualPhase=0;g.virtualConveyor=record;world.removeBody(g.body);g.body.mass=0;g.body.invMass=0;
  const proxy=record.proxy;conveyorAppendShape(body,proxy.shape,proxy.offset,proxy.q);
 }
 body.mass+=mass;conveyorUpdateBodyProperties(body);conveyor.surfaces=conveyor.surfaces.slice();conveyor.worldGeometry=null;base.physicalBoundsCache=null;base.gripRadiusCache=null;syncVirtualConveyors();return true;
}
function materializeConveyor(conveyor){
 const compact=conveyor?.virtual;if(!compact)return false;syncVirtualConveyors();conveyor.virtual=null;const body=compact.body;
 for(const proxy of compact.proxies){const index=body.shapes.indexOf(proxy.shape);if(index>=0){body.shapes.splice(index,1);body.shapeOffsets.splice(index,1);body.shapeOrientations.splice(index,1);}proxy.shape.body=null;}
 body.mass=Math.max(0,body.mass-compact.mass);conveyorUpdateBodyProperties(body);
 for(const record of compact.records){const {g,rotor}=record;delete g.virtualConveyor;delete rotor.virtualConveyor;g.body.mass=record.mass;g.body.updateMassProperties();g.body.aabbNeedsUpdate=true;rotor.frameCache=null;rotor.restPose=null;if(groups.includes(g)&&!world.bodies.includes(g.body))world.addBody(g.body);}
 conveyor.surfaces=conveyor.surfaces.slice();conveyor.worldGeometry=null;compact.baseGroup.physicalBoundsCache=null;compact.baseGroup.gripRadiusCache=null;return true;
}
function materializeConveyorsForGroup(g){for(const conveyor of conveyors)if(conveyor.virtual&&(conveyor.virtual.baseGroup===g||conveyor.virtual.records.some(r=>r.g===g)))materializeConveyor(conveyor);}
function conveyorForGroup(g){return conveyors.find(c=>conveyorRotors(c).some(r=>rotorGroups(r).includes(g)&&rotorPart(c.baseId)?.g!==g))||conveyors.find(c=>rotorPart(c.baseId)?.g===g)||null;}
function conveyorStatus(conveyor){return conveyor?.status||'Selecciona una cinta';}
function conveyorPortsValid(ports){return !ports||['entry','exit'].every(name=>{const port=ports[name];return port&&Array.isArray(port.p)&&port.p.length===3&&port.p.every(n=>Number.isFinite(n)&&Math.abs(n)<=10)&&Array.isArray(port.direction)&&port.direction.length===3&&port.direction.every(Number.isFinite)&&Math.abs(Math.hypot(...port.direction)-1)<.001;});}
function conveyorPath(conveyor){
 const ports=conveyor.ports;if(!ports)return [];const entry=V(...ports.entry.p),exit=V(...ports.exit.p),dir=V(...ports.entry.direction),lift=V(0,HALF*Math.SQRT2+.004,0);
 const points=conveyor.kind==='straight'?[entry,exit]:[entry,add(entry,mul(dir,sub(exit,entry).dot(dir))),exit];return points.map(p=>add(p,lift));
}
function conveyorRemoveSurfaces(conveyor){
 materializeConveyor(conveyor);const body=conveyor.surfaceBody;if(body)for(const surface of conveyor.surfaces||[]){const index=body.shapes.indexOf(surface.shape);if(index>=0){body.shapes.splice(index,1);body.shapeOffsets.splice(index,1);body.shapeOrientations.splice(index,1);surface.shape.body=null;}}
 if(body)conveyorUpdateBodyProperties(body);conveyor.surfaces=[];conveyor.surfaceBody=null;conveyor.surfaceParts=null;conveyor.worldGeometry=null;
}
function conveyorComplete(conveyor){return !!conveyorTopology(conveyor)?.complete;}
function conveyorEnsureSurfaces(conveyor){
 const hit=rotorPart(conveyor.baseId);if(!hit||!conveyorComplete(conveyor))return false;if(conveyor.surfaceBody===hit.g.body&&conveyor.surfaceParts===hit.g.parts)return true;
 conveyorRemoveSurfaces(conveyor);const path=conveyorPath(conveyor);if(path.length<2)return false;
 const members=conveyorRotors(conveyor),rollers=members.flatMap(r=>rotorGroups(r).filter(g=>g&&g!==hit.g)).flatMap(g=>poses(g));
 if(typeof conveyorPortGeometryValid==='function'){
  const index=mechanicalPartIndex(),material=conveyor.required.map(id=>index.get(id)).filter(Boolean).map(({g,part})=>partPose(g,part)),basePose=partPose(hit.g,hit.part);
  // A valid subset's bounds remain valid when other connected material is
  // added. Most modules validate against their own original pieces; retain
  // the full-machine fallback for custom installations with wider supports.
  if(!conveyorPortGeometryValid(conveyor.kind,conveyor.ports,basePose,material,rollers)&&!conveyorPortGeometryValid(conveyor.kind,conveyor.ports,basePose,rotorConnectedGroups([hit.g]).flatMap(g=>poses(g)),rollers))return false;
 }
 conveyor.path=path;conveyor.surfaces=[];conveyor.surfaceBody=hit.g.body;conveyor.surfaceParts=hit.g.parts;
 for(let i=0;i<path.length-1;i++){const delta=sub(path[i+1],path[i]),length=delta.norm();if(length<.01)continue;delta.scale(1/length,delta);const q=Q();q.setFromVectors(V(1,0,0),delta);q.normalize();const center=add(mul(add(path[i],path[i+1]),.5),V(0,-.002,0)),half=V(length/2,.002,CUBE_SIZE*1.5),shape=new CANNON.Box(half);
  const offset=add(hit.part.offset,hit.part.q.vmult(center)),orientation=hit.part.q.mult(q);conveyorAppendShape(hit.g.body,shape,offset,orientation);conveyor.surfaces.push({center,half,q,shape,index:i});
 }
 conveyorUpdateBodyProperties(hit.g.body);return conveyor.surfaces.length===path.length-1;
}
// Read-only world geometry is shared by contact queries, picking and drawing.
// Compare the live base pose on every read: moving/rebuilding a stopped section
// cannot leave an old contact plane behind, even outside a physics substep.
function conveyorWorldGeometry(conveyor){
 const hit=rotorPart(conveyor.baseId);if(!hit){conveyor.worldGeometry=null;return null;}
 const p=hit.p,q=hit.q,cached=conveyor.worldGeometry;
 if(cached&&cached.body===hit.g.body&&cached.part===hit.part&&cached.sourceSurfaces===conveyor.surfaces&&cached.sourcePath===conveyor.path&&cached.x===p.x&&cached.y===p.y&&cached.z===p.z&&cached.qx===q.x&&cached.qy===q.y&&cached.qz===q.z&&cached.qw===q.w)return cached;
 const surfaces=(conveyor.surfaces||[]).map(surface=>{const rotation=q.mult(surface.q);return {p:add(p,q.vmult(surface.center)),q:rotation,inverse:rotation.inverse(),up:rotation.vmult(V(0,1,0)),half:surface.half.clone(),size:mul(surface.half,2),surface};});
 return conveyor.worldGeometry={body:hit.g.body,part:hit.part,sourceSurfaces:conveyor.surfaces,sourcePath:conveyor.path,x:p.x,y:p.y,z:p.z,qx:q.x,qy:q.y,qz:q.z,qw:q.w,surfaces,path:(conveyor.path||[]).map(point=>add(p,q.vmult(point)))};
}
function conveyorSurfacePoses(conveyor){return conveyorWorldGeometry(conveyor)?.surfaces||[];}
function conveyorPathPoses(conveyor){return conveyorWorldGeometry(conveyor)?.path||[];}
function conveyorSurfaceContact(conveyor,contact){
 const body=conveyor.surfaceBody;if(!body||contact.bi!==body&&contact.bj!==body)return null;
 const isA=contact.bi===body,point=add(body.position,isA?contact.ri:contact.rj),normal=mul(contact.ni,isA?1:-1),other=isA?contact.bj:contact.bi;
 for(const pose of conveyorSurfacePoses(conveyor)){const local=pose.inverse.vmult(sub(point,pose.p));if(normal.dot(pose.up)>.6&&Math.abs(local.x)<=pose.half.x+.006&&Math.abs(local.z)<=pose.half.z+.006&&Math.abs(local.y-pose.half.y)<.012)return {body:other,point,normal,surface:pose.surface};}
 return null;
}
function conveyorContactIndex(physicsWorld=world){
 if(mechanicalStepCache?.contactIndex?.world===physicsWorld)return mechanicalStepCache.contactIndex.byBody;
 const byBody=new Map();for(const contact of physicsWorld.contacts){
  for(const body of contact.bi===contact.bj?[contact.bi]:[contact.bi,contact.bj]){if(!byBody.has(body))byBody.set(body,[]);byBody.get(body).push(contact);}
 }
 if(mechanicalStepCache)mechanicalStepCache.contactIndex={world:physicsWorld,byBody};
 return byBody;
}
function invalidateConveyorContacts(){if(mechanicalStepCache){mechanicalStepCache.contactIndex=null;mechanicalStepCache.conveyorContacts=null;}}
function conveyorContactLoads(conveyor){
 const byBody=new Map(),component=conveyorComponentBodies(conveyor);
 for(const contact of conveyorContactIndex().get(conveyor.surfaceBody)||[]){const hit=conveyorSurfaceContact(conveyor,contact);if(!hit||component.has(hit.body)||hit.body.mass<=0)continue;const g=hit.body.qubitGroup,c=hit.body.cargoRef;if(!g&&!c||g?.robotHeld||c?.robotHeld||(held?.items||[]).some(item=>item.g===g))continue;byBody.set(hit.body,{...hit,weight:g?totalWeight(g):c.required});}
 return [...byBody.values()];
}
function conveyorSpendTraction(conveyor,joules){
 const supply=externalBatterySummary(rotorPart(conveyor.baseId)?.g);if(!supply.active||supply.storedJ+1e-9<joules)return false;const fraction=supply.storedJ?joules/supply.storedJ:0;
 for(const part of supply.cells){part.mood.energy=Math.max(0,part.mood.energy*(1-fraction));part.mood.idle=0;}return true;
}
function conveyorDriveSurface(conveyor,dt){
 const members=conveyorRotors(conveyor),rpm=members.length?Math.min(...members.map(r=>Math.abs(r.actualRpm||0))):0;conveyor.speed=rpm*2*Math.PI/60*HALF;conveyor.tractionWatts=0;
 if(conveyor.speed<.002||!conveyor.running)return;conveyor.phase=(conveyor.phase||0)+conveyor.speed*dt*conveyor.direction;
 const loads=conveyorContactLoads(conveyor),load=loads.reduce((sum,item)=>sum+item.weight,0);if(load>conveyor.capacity){stopConveyor(conveyor,'Sobrecarga · retira objetos');return;}
 const hit=rotorPart(conveyor.baseId),pose=partPose(hit.g,hit.part),inverse=pose.q.inverse(),points=conveyor.direction===1?conveyor.path:[...conveyor.path].reverse(),forceBudget=members.reduce((sum,r)=>sum+Math.max(0,r.maxTorque-Math.abs(r.actualTorque||0))/HALF,0);
 for(const item of loads){const body=item.body,local=inverse.vmult(sub(body.position,pose.p));let nearest=null;
  for(let i=0;i<points.length-1;i++){const delta=sub(points[i+1],points[i]),length=delta.norm(),axis=mul(delta,1/length),along=clamp(sub(local,points[i]).dot(axis),0,length),point=add(points[i],mul(axis,along)),distance=Math.hypot(local.x-point.x,local.z-point.z);if(!nearest||distance<nearest.distance)nearest={point,axis,length,along,index:i,distance};}
  if(!nearest)continue;const remaining=nearest.length-nearest.along;
  // Follow the visible bend while there is real contact with its skin. A
  // bounded lateral correction keeps loads on the lane; walls still collide.
  let target=add(nearest.point,mul(nearest.axis,Math.max(.05,conveyor.speed*.5)));
  if(nearest.index<points.length-2&&remaining<.07){const next=points[nearest.index+2],axis=sub(next,points[nearest.index+1]);axis.normalize();target=add(points[nearest.index+1],mul(axis,.07-remaining));}
  const delta=V(target.x-local.x,0,target.z-local.z);if(delta.norm()<1e-8)continue;delta.normalize();const desired=pose.q.vmult(mul(delta,conveyor.speed)),velocity=body.velocity,up=pose.q.vmult(V(0,1,0)),relative=sub(sub(desired,velocity),mul(up,sub(desired,velocity).dot(up))),force=mul(relative,body.mass*24),limit=Math.min(body.mass*settings.gravity*.9,forceBudget*(load?item.weight/load:1)),length=force.norm();if(length>limit)force.scale(limit/length,force);
  const watts=Math.max(0,force.dot(desired))/.7+force.norm()*.005;if(!conveyorSpendTraction(conveyor,watts*dt)){stopConveyor(conveyor,'Sin energía');return;}
  conveyor.tractionWatts+=watts;body.force.vadd(force,body.force);body.wakeUp();
 }
}
function conveyorFrictionPairs(physicsWorld){
 const pairs=new Map();for(const conveyor of conveyors){if(!conveyor.running||conveyor.speed<.002)continue;for(const contact of conveyorContactIndex(physicsWorld).get(conveyor.surfaceBody)||[]){const hit=conveyorSurfaceContact(conveyor,contact);if(!hit)continue;if(!pairs.has(conveyor.surfaceBody))pairs.set(conveyor.surfaceBody,new Set());pairs.get(conveyor.surfaceBody).add(hit.body);}}
 return pairs;
}

function conveyorReleaseBase(conveyor){
 const pin=conveyor.pin;if(!pin)return;conveyor.pin=null;pin.owners.delete(conveyor);if(pin.owners.size)return;
 conveyorPins.delete(pin.body);const {body,type,fixedRotation}=pin;body.type=type;body.fixedRotation=fixedRotation;body.updateMassProperties();body.wakeUp();
}
function conveyorAcquireBase(conveyor,body){let pin=conveyorPins.get(body);if(!pin){pin={body,type:body.type,fixedRotation:body.fixedRotation,p:body.position.clone(),q:body.quaternion.clone(),owners:new Set()};conveyorPins.set(body,pin);}pin.owners.add(conveyor);conveyor.pin=pin;}

function createConveyor(options={}){
 const base=rotorPart(options.baseId),source=options.joints;if(!base||!Array.isArray(source)||source.length<1||source.length>16||!['straight','left','right'].includes(options.kind)||options.direction!==undefined&&![1,-1].includes(options.direction)||options.capacity!==undefined&&(!Number.isInteger(options.capacity)||options.capacity<1||options.capacity>MAX_QUBITS)||!conveyorPortsValid(options.ports))return null;
 const members=source.map(j=>rotors.find(r=>r===j||r.aId===j?.aId&&r.bId===j?.bId));
 if(members.some(r=>!r||r.servo)||new Set(members).size!==members.length||members.some(r=>!rotorGroups(r).includes(base.g))||conveyors.some(c=>c.baseId===base.part.id||c.joints.some(j=>members.some(r=>r.aId===j.aId&&r.bId===j.bId)))||robotArms.some(a=>a.joints.some(j=>members.some(r=>r.aId===j.aId&&r.bId===j.bId))))return null;
 const drives=options.drives||source.map((j,i)=>j.forward??members[i].direction);if(!Array.isArray(drives)||drives.length!==members.length||drives.some(n=>![1,-1].includes(n)))return null;
 const owned=new Set([base.g,...members.flatMap(r=>rotorGroups(r))]),required=options.required||[...owned].flatMap(g=>g.parts.map(p=>p.id));if(!Array.isArray(required)||required.length<1||required.length>MAX_QUBITS||new Set(required).size!==required.length||!required.includes(base.part.id)||required.some(id=>!Number.isSafeInteger(id)||!owned.has(rotorPart(id)?.g))||members.some(r=>!required.includes(r.aId)||!required.includes(r.bId)||rotorGroups(r).filter(g=>g!==base.g).some(g=>g.parts.some(p=>!required.includes(p.id)))))return null;
 const moduleParts=options.moduleParts||inferConveyorModuleParts(options.kind,base,required);
 if(!Array.isArray(moduleParts)||moduleParts.length>MAX_QUBITS||new Set(moduleParts).size!==moduleParts.length||required.some(id=>!moduleParts.includes(id))||moduleParts.some(id=>!Number.isSafeInteger(id)||!owned.has(rotorPart(id)?.g)))return null;
 const conveyor={id:++conveyorSerial,baseId:base.part.id,required:[...required],moduleParts:[...moduleParts],joints:members.map((r,i)=>({aId:r.aId,bId:r.bId,forward:drives[i]})),kind:options.kind,direction:options.direction??1,capacity:options.capacity??8,ports:options.ports?JSON.parse(JSON.stringify(options.ports)):null,running:false,status:'Listo · acopla y enciende una batería',load:0,watts:0,payloads:new Map(),pin:null,surfaces:[],path:[],phase:0,speed:0};
 conveyors.push(conveyor);if(!conveyorEnsureSurfaces(conveyor)){conveyorRemoveSurfaces(conveyor);conveyors.splice(conveyors.indexOf(conveyor),1);return null;}for(const rotor of members)configureRotor(rotor,{enabled:false,mount:'wheel'},true);virtualizeConveyor(conveyor);return conveyor;
}
function stopConveyor(conveyor,reason='Detenido'){
 if(!conveyors.includes(conveyor))return false;conveyor.running=false;conveyor.status=reason;conveyor.watts=0;conveyor.speed=0;
 for(const rotor of conveyorRotors(conveyor)){rotor.enabled=false;rotor.actualRpm=0;rotor.driveVelocity=0;rotor.constraint?.disableMotor();unpinRotor(rotor);}conveyorReleaseBase(conveyor);return true;
}
function configureConveyor(conveyor,patch={}){
 if(!conveyors.includes(conveyor)||patch.direction!==undefined&&![1,-1].includes(patch.direction)||patch.capacity!==undefined&&(!Number.isInteger(patch.capacity)||patch.capacity<1||patch.capacity>MAX_QUBITS))return false;
 const resume=conveyor.running;if(resume)stopConveyor(conveyor,'Ajustado');if(patch.direction!==undefined)conveyor.direction=patch.direction;if(patch.capacity!==undefined)conveyor.capacity=patch.capacity;
 return resume?startConveyor(conveyor):true;
}
// Powered anchoring holds a supported installation steady; it cannot suspend
// a loose conveyor in midair. Remember static supports because Cannon does not
// generate fresh contacts between a kinematic chassis and a static tabletop.
function conveyorSupportReady(conveyor){
 const base=rotorPart(conveyor?.baseId);if(!base)return false;
 const up=base.q.vmult(V(0,1,0));if(up.y<.98){conveyor.supportStatus='Coloca la cinta horizontal antes de iniciar';return false;}
 const grounded=body=>{const g=body.qubitGroup;if(!g||!groups.includes(g))return false;const bottom=bounds(g).min.y;return bottom>=-.02&&bottom<=.008;};
 if(grounded(base.g.body)){conveyor.support={base:base.g.body,chain:[]};return true;}
 const previous=conveyor.support;
 const unchanged=saved=>world.bodies.includes(saved.body)&&saved.body.position.distanceTo(saved.p)<.008&&Math.abs(saved.body.quaternion.x*saved.q.x+saved.body.quaternion.y*saved.q.y+saved.body.quaternion.z*saved.q.z+saved.body.quaternion.w*saved.q.w)>.9995&&(saved.body.type!==CANNON.Body.DYNAMIC||saved.body.velocity.norm()<.05&&saved.body.angularVelocity.norm()<.1);
 if(conveyor.running&&previous?.base===base.g.body&&previous.chain.length&&previous.chain.every(unchanged))return true;
 // Contacts still belong to the preceding Cannon step. If a remembered
 // support moved, do not certify its NEW position using that old contact:
 // sleeping/kinematic bodies may never produce another contact to undo it.
 // The ray probes below can still validate genuinely remaining support.
 const staleSupports=new Set((previous?.chain||[]).filter(saved=>!unchanged(saved)).map(saved=>saved.body));
 const machine=new Set(rotorConnectedGroups([base.g]).map(g=>g.body)),visited=new Set();
 const support=(body,depth=0)=>{
  if(depth>6||visited.has(body))return null;visited.add(body);
  for(const contact of world.contacts){
   if(contact.bi!==body&&contact.bj!==body)continue;
   const other=contact.bi===body?contact.bj:contact.bi,normalY=contact.ni.y*(contact.bj===body?1:-1);
   if(normalY<.65||staleSupports.has(body)||staleSupports.has(other)||machine.has(other)||!world.bodies.includes(other)||other.velocity.norm()>=.05||other.angularVelocity.norm()>=.1)continue;
   const saved={body:other,p:other.position.clone(),q:other.quaternion.clone()};
   if(other.type===CANNON.Body.STATIC||grounded(other))return [saved];
   const chain=support(other,depth+1);if(chain)return [saved,...chain];
  }
  // Sleeping dynamic/static pairs also stop emitting contacts. Probe only
  // actual lowest vertices/face centers, never the empty space in an AABB.
  const group=body.qubitGroup;
  if(group){
   const minimum=bounds(group).min.y,candidates=[];
   for(const pose of poses(group)){const vertices=corners(pose).filter(p=>p.y<=minimum+.003);if(vertices.length){candidates.push(vertices.reduce((sum,p)=>add(sum,mul(p,1/vertices.length)),V()),...vertices);}}
   const targets=world.bodies.filter(other=>other!==body&&!machine.has(other)&&other.velocity.norm()<.05&&other.angularVelocity.norm()<.1);
   for(const point of candidates){
    const ray=new CANNON.Ray(add(point,V(0,.004,0)),add(point,V(0,-.012,0))),result=new CANNON.RaycastResult();ray.mode=CANNON.Ray.ALL;ray.skipBackfaces=true;let found=null;
    ray.callback=hit=>{if(found||hit.hitNormalWorld.y<.65)return;const other=hit.body,saved={body:other,p:other.position.clone(),q:other.quaternion.clone()};if(other.type===CANNON.Body.STATIC||grounded(other)){found=[saved];return;}const chain=support(other,depth+1);if(chain)found=[saved,...chain];};
    ray.intersectBodies(targets,result);if(found)return found;
   }
  }
  return null;
 };
 const chain=support(base.g.body);if(chain){conveyor.support={base:base.g.body,chain};return true;}
 conveyor.support=null;conveyor.supportStatus='Apoya la cinta en el suelo, una mesa o una estructura estable';return false;
}
function conveyorLine(c){
 const base=rotorPart(c?.baseId)?.g;
 return base?conveyors.filter(other=>rotorPart(other.baseId)?.g===base):[];
}
function startConveyorLine(c){
 const started=[],line=conveyorLine(c);
 for(const section of line){
  if(section.running)continue;
  if(!startConveyor(section)){
   const reason=section.status;
   for(const item of started)stopConveyor(item);
   if(c!==section)c.status='Tramo '+section.id+' · '+reason;
   return false;
  }
  started.push(section);
 }
 return line.length>0;
}
function stopConveyorLine(c){
 const line=conveyorLine(c);for(const section of line)stopConveyor(section);return line.length>0;
}
function alignJoinedConveyors(source,target,anchorId){
 const incoming=conveyors.filter(c=>rotorPart(c.baseId)?.g===source);
 if(!incoming.length)return;
 const existing=conveyors.filter(c=>rotorPart(c.baseId)?.g===target&&(!anchorId||c.baseId===anchorId));
 if(!existing.length)return;
 let nearest=null;
 for(const a of incoming)for(const b of existing){
  for(const endA of ['entry','exit'])for(const endB of ['entry','exit']){
   const pa=conveyorPortWorld(a,endA),pb=conveyorPortWorld(b,endB);if(!pa||!pb)continue;
   const distance=pa.p.distanceTo(pb.p),dot=pa.direction.dot(pb.direction);
   if(!nearest||distance<nearest.distance-.0001||Math.abs(distance-nearest.distance)<.0001&&Math.abs(dot)>Math.abs(nearest.dot)){
    const sign=Math.abs(dot)>.5?Math.sign(dot):endA===endB?-1:1;
    nearest={distance,dot,flip:a.direction!==b.direction*sign};
   }
  }
 }
 // Port tangents point in the belt's nominal forward direction at both ends.
 // Reversing the incoming assembly preserves the flow through its own corners.
 if(nearest?nearest.flip:incoming[0].direction!==existing[0].direction)for(const section of incoming)section.direction*=-1;
}
function startConveyor(conveyor){
 if(!conveyors.includes(conveyor))return false;if(conveyor.running)return true;
 const base=rotorPart(conveyor.baseId),members=conveyorRotors(conveyor),component=base?rotorConnectedGroups([base.g]):[];
 if(!base||!conveyorComplete(conveyor)||members.some(r=>!rotorGroups(r).includes(base.g))){conveyor.status='Cinta incompleta';return false;}
 if(!conveyorSupportReady(conveyor)){conveyor.status=conveyor.supportStatus;return false;}
 if(component.some(g=>(held?.items||(held?[held]:[])).some(item=>item.g===g))){conveyor.status='Suelta el mecanismo antes de iniciar';return false;}
 const supply=externalBatterySummary(base.g);if(!supply.active||supply.storedJ<=.001){conveyor.status='Acopla y enciende una batería con energía';return false;}
 conveyorReadLoad(conveyor);if(conveyor.load>conveyor.capacity){conveyor.status='Sobrecarga · retira objetos';return false;}
 // All rollers turn at one calm speed. Their finite torque and actual contact
 // surfaces determine transport; the numeric rate is not a teleport speed.
 for(let i=0;i<members.length;i++)if(!configureRotor(members[i],{rpm:30,direction:conveyor.joints[i].forward*conveyor.direction,maxTorque:8,capacity:QBitsRotorPower.LIMITS.capacity[1],mount:'wheel',enabled:true},true)){stopConveyor(conveyor,'No se pudo iniciar el motor');return false;}
 conveyorAcquireBase(conveyor,base.g.body);conveyor.running=true;rememberMechanismRun(base.g,'belt',conveyor);conveyor.status=conveyor.direction===1?'En marcha':'En marcha · sentido inverso';return true;
}
function conveyorContactMap(){
 if(mechanicalStepCache?.conveyorContacts)return mechanicalStepCache.conveyorContacts;
 const map=new Map();for(const [body,contacts]of conveyorContactIndex()){const others=new Set();for(const contact of contacts)others.add(contact.bi===body?contact.bj:contact.bi);map.set(body,others);}
 if(mechanicalStepCache)mechanicalStepCache.conveyorContacts=map;return map;
}
function conveyorReadLoad(conveyor){
 const base=rotorPart(conveyor.baseId);if(!base){conveyor.load=0;return;}
 const component=conveyorComponentBodies(conveyor),rollers=conveyorTopology(conveyor).rollerBodies,contacts=conveyorContactMap();
 for(const item of conveyorContactLoads(conveyor))conveyor.payloads.set(item.body,{at:simTime,weight:item.weight});
 for(const roller of rollers)for(const other of contacts.get(roller)||[]){if(component.has(other)||other.position.y<roller.position.y-.015)continue;
  const g=other.qubitGroup,c=other.cargoRef;if(!g&&!c||g?.robotHeld||c?.robotHeld||(held?.items||[]).some(item=>item.g===g))continue;
  const weight=g?totalWeight(g):c.required;conveyor.payloads.set(other,{at:simTime,weight});
 }
 for(const [body,data]of conveyor.payloads)if(!world.bodies.includes(body)||simTime-data.at>.25)conveyor.payloads.delete(body);
 conveyor.load=[...conveyor.payloads.values()].reduce((sum,item)=>sum+item.weight,0);
}

function updateConveyors(dt){
 for(const conveyor of [...conveyors]){
  const base=rotorPart(conveyor.baseId),members=conveyorRotors(conveyor);if(!base||!conveyorComplete(conveyor)||members.some(r=>!rotorGroups(r).includes(base.g))){stopConveyor(conveyor,'Cinta incompleta');conveyorRemoveSurfaces(conveyor);conveyors.splice(conveyors.indexOf(conveyor),1);continue;}
  if(!conveyorEnsureSurfaces(conveyor)){stopConveyor(conveyor,'Revisa la superficie de la cinta');continue;}if(!conveyor.virtual)virtualizeConveyor(conveyor);conveyorReadLoad(conveyor);if(!conveyor.running)continue;
  if(!conveyorSupportReady(conveyor)){stopConveyor(conveyor,conveyor.supportStatus);continue;}
  if(conveyor.pin?.body!==base.g.body){stopConveyor(conveyor,'Detenida para ajustar el montaje');continue;}
  if((held?.items||(held?[held]:[])).some(item=>rotorConnectedGroups([base.g]).includes(item.g))){stopConveyor(conveyor,'Detenida para manipular');continue;}
  const supply=externalBatterySummary(base.g);if(!supply.active||supply.storedJ<=.001){stopConveyor(conveyor,'Sin batería activa o sin energía');continue;}
  if(conveyor.load>conveyor.capacity){stopConveyor(conveyor,'Sobrecarga · '+formatWeight(conveyor.load)+' / '+conveyor.capacity+' u');continue;}
  if(members.some(r=>!r.enabled)){stopConveyor(conveyor,'Motor detenido');continue;}
  conveyor.watts=members.reduce((sum,r)=>sum+(r.power?.inputWatts||0),0)+(conveyor.tractionWatts||0);
 }
}
function driveConveyors(dt){
 for(const pin of conveyorPins.values()){const b=pin.body;
  if(b.type!==CANNON.Body.KINEMATIC||!b.fixedRotation){b.type=CANNON.Body.KINEMATIC;b.fixedRotation=true;b.updateMassProperties();}
  b.position.copy(pin.p);b.quaternion.copy(pin.q);b.velocity.set(0,0,0);b.angularVelocity.set(0,0,0);b.force.set(0,0,0);b.torque.set(0,0,0);b.aabbNeedsUpdate=true;
 }
 for(const conveyor of conveyors)if(conveyor.running)conveyorDriveSurface(conveyor,dt);
}

// Selection is read-only. Moving or changing a powered production line is an
// explicit operation; reject it before any motor, grip or topology is changed.
function inferConveyorModuleParts(kind,base,required){
 // Older saves did not record optional legs. Recover only the four exact
 // standard support locations, never every unrelated piece on a welded frame.
 const ids=new Set(required),recipe=conveyorBlueprintTemplate(kind,true),parts=recipe?.groups.flatMap(g=>g.parts)||[],definition=recipe?.conveyors?.[0],origin=parts.find(p=>p.key===definition?.base);
 if(origin)for(const part of parts)if(!definition.required.includes(part.key)){
  const position=add(base.p,base.q.vmult(sub(V(...part.p),V(...origin.p)))),orientation=base.q.mult(shelfQuaternion(part.q));
  const found=base.g.parts.find(p=>p.shape===part.shape&&!ids.has(p.id)&&partPose(base.g,p).p.distanceTo(position)<.003&&qSimilarity(partPose(base.g,p).q,orientation)>.99999);
  if(found)ids.add(found.id);
 }
 return [...ids];
}
function conveyorModuleParts(conveyor){
 const base=rotorPart(conveyor.baseId),owned=new Set([base?.g,...conveyorRotors(conveyor).flatMap(rotorGroups)]);
 return (conveyor.moduleParts||conveyor.required).filter(id=>owned.has(rotorPart(id)?.g));
}
function conveyorForPart(id){return conveyors.find(c=>c.baseId===id||c.required.includes(id)||c.moduleParts?.includes(id)&&conveyorModuleParts(c).includes(id))||null;}
function runningConveyorForGroups(list){
 if(!conveyors.some(c=>c.running))return null;
 const component=new Set(rotorConnectedGroups(list.filter(g=>groups.includes(g))));
 return conveyors.find(c=>c.running&&component.has(rotorPart(c.baseId)?.g))||null;
}
function detachConveyorModule(conveyor){
 syncVirtualConveyors(0);
 if(!conveyors.includes(conveyor)||!conveyorComplete(conveyor))return false;
 const base=rotorPart(conveyor.baseId),component=rotorConnectedGroups([base.g]);
 if(runningConveyorForGroups(component)){announce('Cinta en funcionamiento · primero apaga o desconecta la cinta para separarla.');return false;}
 const owned=new Set(conveyorModuleParts(conveyor));
 // Shared material in a custom controller has no unambiguous module boundary.
 if(conveyors.some(c=>c!==conveyor&&conveyorModuleParts(c).some(id=>owned.has(id)))){announce('Este montaje comparte piezas entre tramos; separa las conexiones antes de extraer el módulo.');return false;}
 const mixed=component.filter(g=>g.parts.some(p=>owned.has(p.id))&&g.parts.some(p=>!owned.has(p.id)));
 if(!mixed.length){announce('Este módulo de cinta ya está separado.');return false;}
 if(held&&(held.items||[held]).some(item=>component.includes(item.g)))releaseQubit(false);
 automationIntervention();
 const affected=conveyors.filter(c=>mixed.some(g=>rotorPart(c.baseId)?.g===g));
 for(const c of affected)materializeConveyor(c);
 const originals=mixed.map(g=>({g,parts:worldParts(g),p:g.body.position.clone(),q:g.body.quaternion.clone(),v:g.body.velocity.clone(),w:g.body.angularVelocity.clone()}));
 for(const c of affected)conveyorRemoveSurfaces(c);
 for(const {g}of originals)removeGroup(g);
 for(const original of originals){
  const {parts,q,v,w,p}=original;
  for(const subset of [parts.filter(part=>owned.has(part.id)),parts.filter(part=>!owned.has(part.id))]){
   for(const fragment of makeFragments(subset,q,v,w))fragment.body.velocity.copy(add(v,w.cross(sub(fragment.body.position,p))));
  }
 }
 refreshRotors();for(const c of affected){conveyorEnsureSurfaces(c);virtualizeConveyor(c);}
 const detached=rotorPart(conveyor.baseId);selected={g:detached.g,part:detached.part};multiSelection=[];
 conveyor.status='Módulo separado · conserva sus piezas y motores';
 announce('Módulo de cinta separado completo · '+owned.size+' piezas conservadas.');return true;
}
function conveyorStopForGroups(list){for(const conveyor of conveyors){const base=rotorPart(conveyor.baseId);if(base&&rotorConnectedGroups([base.g]).some(g=>list.includes(g)))stopConveyor(conveyor,'Detenida para manipular');}}
function clearConveyors(){for(const conveyor of [...conveyors]){stopConveyor(conveyor);conveyorRemoveSurfaces(conveyor);}conveyors.length=0;}
function pruneConveyors(){for(const conveyor of [...conveyors])if(!conveyorComplete(conveyor)){stopConveyor(conveyor,'Cinta incompleta');conveyorRemoveSurfaces(conveyor);conveyors.splice(conveyors.indexOf(conveyor),1);}}
function serializeConveyors(){syncVirtualConveyors(0);pruneConveyors();return conveyors.map(c=>({baseId:c.baseId,required:[...c.required],moduleParts:conveyorModuleParts(c),joints:c.joints.map(j=>({...j})),kind:c.kind,direction:c.direction,capacity:c.capacity,...(c.ports?{ports:JSON.parse(JSON.stringify(c.ports))}:{})}));}
function restoreConveyors(records){for(const data of Array.isArray(records)?records:[])if(!conveyors.some(c=>c.baseId===data.baseId))createConveyor(data);}
function conveyorTemplate(subject,idToKey,linkedRotors){
 syncVirtualConveyors(0);
 const component=mechanismGroups(subject);return conveyors.filter(c=>component.includes(rotorPart(c.baseId)?.g)).map(c=>({version:1,base:idToKey.get(c.baseId),required:c.required.map(id=>idToKey.get(id)),moduleParts:conveyorModuleParts(c).map(id=>idToKey.get(id)),joints:conveyorRotors(c).map(r=>linkedRotors.indexOf(r)),drives:c.joints.map(j=>j.forward),kind:c.kind,direction:c.direction,capacity:c.capacity,...(c.ports?{ports:JSON.parse(JSON.stringify(c.ports))}:{})}));
}
function restoreConveyorTemplate(records,keyToId,joints){return (Array.isArray(records)?records:[]).map(data=>createConveyor({baseId:keyToId.get(data.base),required:data.required?.map(key=>keyToId.get(key)),moduleParts:data.moduleParts?.map(key=>keyToId.get(key)),joints:data.joints.map(index=>joints[index]),drives:data.drives,kind:data.kind,direction:data.direction,capacity:data.capacity,ports:data.ports})).filter(Boolean);}

// Mechanical connections remain separate rigid bodies: stable unit IDs survive
// ordinary weld/split operations, and the hinge is rebuilt before the next step.
// Servos reuse the physical motor graph; only their local anchors and bounded
// position controller differ. Geometry, collisions and rendered parts stay real.
// A connected mechanism has one march clock, not one timer per leg. The
// registration is transient; per-joint starting ends survive via servo.direction.
const servoMarches=new Set();
function servoMarchMembers(subject){
 const seed=rotors.includes(subject)?rotorGroups(subject):subject?.parts?[subject]:[],component=rotorConnectedGroups(seed);
 return rotors.filter(r=>r.servo&&rotorGroups(r).every(g=>component.includes(g))).sort((a,b)=>a.aId-b.aId);
}
function servoMarchFor(rotor){return [...servoMarches].find(m=>m.members.includes(rotor))||null;}
function stopServoMarch(march,reason='Conjunto detenido · articulaciones bloqueadas'){
 if(!march)return false;servoMarches.delete(march);
 for(const r of march.members)if(rotors.includes(r)){configureRotor(r,{enabled:false},true);r.servoStatus=reason;setRotorBrake(r,true);}return true;
}
function stopServoMarchForGroups(list){for(const m of [...servoMarches])if(m.members.some(r=>rotorGroups(r).some(g=>list.includes(g))))stopServoMarch(m,'Conjunto detenido para manipular');}
// Identify four distinct branches on a common chassis. Other servo assemblies
// keep the general synchronized controller and their configured starting ends.
function walkingLegs(members,component){
 const links=new Map(component.map(g=>[g,[]]));
 for(const r of members){const [a,b]=rotorGroups(r);links.get(a).push({r,next:b});links.get(b).push({r,next:a});}
 const trunk=component.find(g=>links.get(g).length===4);
 if(!trunk)return null;
 const legs=links.get(trunk).map(({r,next})=>{
  const branch=links.get(next).filter(link=>link.r!==r);
  if(branch.length>1||branch[0]&&links.get(branch[0].next).length!==1)return null;
  const foot=branch[0]?.next||next,hip=rotorPart(r.aId),anchor=rotorEndpoint(hip,r.servo,'a');
  const arm=sub(foot.body.position,anchor.point),axis=anchor.axis;
  const tangent=axis.cross(arm);if(hip.g!==trunk)tangent.negate(tangent);
  return {r,knee:branch[0]?.r,foot,point:anchor.point,tangent};
 });
 if(legs.some(l=>!l)||legs.reduce((n,l)=>n+1+Number(!!l.knee),0)!==members.length)return null;
 // Collinear test rigs and four hinges stacked on one axis are not walkers.
 const center=mul(legs.reduce((p,l)=>add(p,l.point),V()),.25);
 const offsets=legs.map(l=>sub(l.point,center));
 if(!offsets.some(a=>offsets.some(b=>Math.abs(a.x*b.z-a.z*b.x)>HALF*HALF)))return null;
 const diagonal=legs.slice(1).reduce((best,l)=>l.point.distanceTo(legs[0].point)>best.point.distanceTo(legs[0].point)?l:best);
 const auto=legs.every(l=>l.r.servo.direction===legs[0].r.servo.direction),drives=new Map(),feet=new Map();
 const forward=legs[0].tangent.clone();forward.y=0;if(forward.norm()<.005)return null;
 for(const leg of legs){
  const mirror=leg.tangent.dot(forward)<0?-1:1;
  const phaseSign=auto?(leg===legs[0]||leg===diagonal?1:-1)*legs[0].r.servo.direction:leg.r.servo.direction*mirror;
  drives.set(leg.r,{sign:phaseSign*mirror,offset:0});
  if(leg.knee){
   const a=rotorPart(leg.knee.aId),end=rotorEndpoint(a,leg.knee.servo,'a');
   const lift=end.axis.cross(sub(leg.foot.body.position,end.point)).y*(leg.foot===a.g?-1:1);
   drives.set(leg.knee,{sign:phaseSign*(lift<0?-1:1),offset:Math.PI/2});
  }
  feet.set(leg.foot.body,phaseSign);
 }
 return {drives,feet,mass:component.reduce((n,g)=>n+g.body.mass,0)};
}

// Cannon budgets ordinary friction from the individual foot's mass. During
// stance that foot also supports the chassis. Distribute one bounded friction
// budget across its real floor contacts, and unload the returning diagonal.
function walkingFootFriction(physicsWorld,dt){
 if(!servoMarches.size)return null;
 let limits=null;
 for(const march of servoMarches){
  const walk=march.walk;if(!walk||march.phase!=='march')continue;
  const sin=Math.sin(2*Math.PI*march.elapsed/march.period),loaded=[],returning=[];
  for(const eq of physicsWorld.frictionEquations){
   const foot=eq.bi===floor?eq.bj:eq.bj===floor?eq.bi:null,phase=walk.feet.get(foot);
   if(phase)(phase*sin<0?loaded:returning).push(eq);
  }
  if(!loaded.length&&!returning.length)continue;
  limits??=new Map();
  const impulse=walk.mass*Math.abs(physicsWorld.gravity.y)*physicsWorld.defaultContactMaterial.friction*dt;
  for(const eq of loaded)limits.set(eq,2*impulse/loaded.length);
  for(const eq of returning)limits.set(eq,Math.min(eq.maxForce*dt,impulse*.08/returning.length));
 }
 return limits;
}

// Keep one launch pose for the connected bodies. Each controller uses its usual
// start routine on replay, including its energy and obstruction checks.
const mechanismRuns=new WeakMap();
let replayingRun=false,lastRunGroup=null;
function mechanismRun(g){
 const run=g&&mechanismRuns.get(g);if(!run)return null;
 const component=rotorConnectedGroups([g]);
 if(component.length!==run.poses.size||component.some(member=>run.poses.get(member)?.parts!==member.parts))return null;
 const joints=rotors.filter(r=>component.includes(rotorGroups(r)[0]));
 return joints.length===run.joints.size&&joints.every(r=>run.joints.has(r))?run:null;
}
function commandRunning(command){
 const {kind,target}=command;
 if(kind==='march')return !!servoMarchFor(target);
 if(kind==='route')return !!(target.route||target.pendingMoodOrder);
 return !!(target.enabled||target.running);
}
function rememberMechanismRun(g,kind,target,goal=null){
 if(!g||replayingRun)return;
 let run=mechanismRun(g);
 // A newly issued destination starts at its own origin. For a machine that
 // stopped under load, pressing Start again must preserve its recovery pose.
 if(!run||run.repositioned||kind==='route'){
  const component=rotorConnectedGroups([g]);
  const poses=new Map(component.map(member=>[member,{parts:member.parts,p:member.body.position.clone(),q:member.body.quaternion.clone()}]));
  run={poses,joints:new Set(rotors.filter(r=>poses.has(rotorGroups(r)[0]))),commands:[]};
  if(kind==='march'){
   const stance=neutralWalkerRun(g);
   if(stance){
    const trunk=[...stance.poses.keys()][0],upright=stance.poses.get(trunk).q,current=trunk.body.quaternion;
    const alignment=Math.abs(current.x*upright.x+current.y*upright.y+current.z*upright.z+current.w*upright.w);
    if(alignment<.89)run.poses=stance.poses;
   }
  }
  for(const member of component)mechanismRuns.set(member,run);
 }
 run.commands=run.commands.filter(c=>commandRunning(c)&&c.target!==target&&!(kind==='march'&&(c.kind==='servo'||c.kind==='march')));
 run.commands.push({kind,target,goal:goal?.clone()});lastRunGroup=g;
}
// Older blueprints contain joint reference rotations but no launch checkpoint.
// Rebuild a four-legged stance from those references and coincident hip/knee
// pivots, then face its support polygon toward the floor.
function neutralWalkerRun(g){
 if(!g||!rotorForGroup(g))return null;
 const joints=servoMarchMembers(g),component=rotorConnectedGroups([g]);
 if(joints.length<4||joints.length>8||component.length!==joints.length+1)return null;
 const links=new Map(component.map(member=>[member,[]]));
 for(const r of joints)for(const member of rotorGroups(r))links.get(member).push(r);
 const trunk=component.find(member=>links.get(member).length===4);
 if(!trunk||component.some(member=>member!==trunk&&links.get(member).length>2))return null;
 const poses=new Map([[trunk,{parts:trunk.parts,p:trunk.body.position.clone(),q:trunk.body.quaternion.clone()}]]);
 const hips=[],feet=[];
 for(const [parent,pose] of poses){
  for(const r of links.get(parent)){
   const a=rotorPart(r.aId),b=rotorPart(r.bId),forward=a.g===parent;
   const source=forward?a:b,dest=forward?b:a;if(poses.has(dest.g))continue;
   const reference=new CANNON.Quaternion(...r.servo.reference),joint=partPose(parent,source.part,pose.p,pose.q);
   const q=joint.q.mult(forward?reference:reference.inverse()).mult(dest.part.q.inverse());q.normalize();
   const anchor=rotorEndpoint(joint,r.servo,forward?'a':'b').point;
   const offset=rotorEndpoint(partPose(dest.g,dest.part,V(),q),r.servo,forward?'b':'a').point;
   const p=sub(anchor,offset);poses.set(dest.g,{parts:dest.g.parts,p,q});
   if(parent===trunk)hips.push(anchor);
   if(links.get(dest.g).length===1)feet.push(p);
  }
 }
 if(feet.length!==4||poses.size!==component.length)return null;
 const center=mul(hips.reduce(add,V()),.25),meanFoot=mul(feet.reduce(add,V()),.25);
 const offsets=hips.map(p=>sub(p,center));let normal=V();
 for(const a of offsets)for(const b of offsets){const n=a.cross(b);if(n.norm2()>normal.norm2())normal=n;}
 if(normal.norm()<HALF*HALF)return null;
 normal.normalize();const height=normal.dot(sub(center,meanFoot));if(Math.abs(height)<HALF)return null;
 if(height<0)normal.negate(normal);
 const turn=Q();turn.setFromVectors(normal,V(0,1,0));
 let bottom=Infinity;
 for(const [member,pose] of poses){
  pose.p=add(center,turn.vmult(sub(pose.p,center)));pose.q=turn.mult(pose.q);
  bottom=Math.min(bottom,physicalGroupBounds(member,pose.p,pose.q).min.y);
 }
 for(const pose of poses.values())pose.p.y-=bottom;
 return {poses,joints:new Set(joints),commands:[{kind:'march',target:joints[0]}]};
}

function restartMechanism(g,run=mechanismRun(g)||neutralWalkerRun(g)){
 if(!run)return false;
 const component=[...run.poses.keys()];
 if(component.some(cubeIsHeld)){announce('Suelta el conjunto antes de reiniciarlo.');return false;}
 // Permit the small contact penetration of a resting foot. Move every body by
 // the same correction so hinge pivots stay coincident.
 let lift=0;
 for(const [member,pose] of run.poses)lift=Math.max(lift,-physicalGroupBounds(member,pose.p,pose.q).min.y);
 const positions=new Map();
 for(const [member,pose] of run.poses){
  const p=add(pose.p,V(0,lift,0));positions.set(member,p);
  if(!validPose(member,p,pose.q,component)){announce('El punto de partida está ocupado. Despéjalo para reiniciar.');return false;}
 }
 for(const member of component)mechanismRuns.set(member,run);
 run.repositioned=false;lastRunGroup=g;
 const stop=()=>{
  robotStopForGroups(component);
  for(const member of component){leaveHaul(member);stopRoute(member);}
  for(const r of run.joints){r.enabled=false;r.constraint?.disableMotor();unpinRotor(r);setRotorBrake(r,false);}
 };
 stop();
 for(const [member,pose] of run.poses){
  const b=member.body;b.position.copy(positions.get(member));b.quaternion.copy(pose.q);
  b.previousPosition?.copy(b.position);b.interpolatedPosition?.copy(b.position);
  b.previousQuaternion?.copy(b.quaternion);b.interpolatedQuaternion?.copy(b.quaternion);
  for(const v of [b.velocity,b.angularVelocity,b.force,b.torque])v.set(0,0,0);
  b.aabbNeedsUpdate=true;b.wakeUp();
 }
 world.broadphase.dirty=true;
 for(const r of run.joints)Object.assign(r,{beforeStep:null,safePose:null,restPose:null,driveVelocity:0,actualRpm:0,actualTorque:0,motorImpulse:0,stallTime:0,stalled:false,obstructed:false,stopReason:null,visualPhase:0});
 let ok=true;replayingRun=true;
 try{
  for(const {kind,target,goal} of run.commands){
   if(kind==='march')ok=startServoMarch(target);
   else if(kind==='servo')ok=startServo(target);
   else if(kind==='rotor')ok=configureRotor(target,{enabled:true},true);
   else if(kind==='belt')ok=startConveyor(target);
   else if(kind==='arm'){target.cycles=0;ok=startRobotArm(target);}
   else if(kind==='flight'){target.phase=0;ok=startFlight(target);}
   else if(kind==='route')ok=startRoute(target,goal);
   if(!ok){stop();break;}
  }
 }finally{replayingRun=false;updateRotorMotors();}
 announce(ok?'Conjunto reiniciado desde su posición inicial':'Posición inicial recuperada · revisa la energía, la carga y los apoyos');
 return ok;
}
function restartSelection(){
 const team=selectedTeam(),motors=selectedRotors();
 const requested=motors.length?motors.flatMap(rotorGroups):team.length?team:[aimQubit(4)?.g||lastRunGroup];
 const handled=new Set();
 for(const g of requested){const run=mechanismRun(g)||neutralWalkerRun(g);if(run&&!handled.has(run)){handled.add(run);restartMechanism(g,run);}}
 if(!handled.size){
  if(selectedCargo||team.some(g=>g.haulJob)){if(selectedCargo)stopHaul(selectedCargo);for(const g of team)leaveHaul(g);announce('Transporte detenido');}
  else announce('Selecciona un mecanismo o una pieza que haya iniciado un recorrido.');
 }
 pendingCargo=null;moveChoice=null;
}

function startServoMarch(subject){
 const members=servoMarchMembers(subject);if(!members.length)return false;
 const component=rotorConnectedGroups(rotorGroups(members[0])),fail=reason=>{for(const r of members)r.servoStatus=reason;announce(reason);return false;};
 if((held?.items||(held?[held]:[])).some(item=>component.includes(item.g)))return fail('Suelta el mecanismo antes de iniciar la marcha');
 if(rotors.some(r=>!members.includes(r)&&r.enabled&&r.mount==='fixed'&&rotorGroups(r).some(g=>component.includes(g))))return fail('Detén el rotor fijo antes de iniciar el conjunto');
 // Preflight every joint before enabling any: no partly started mechanism.
 for(const r of members){const p=rotorPowerState({...r,enabled:true});if(!r.constraint||!servoConfigValid(r.servo)||p.stopReason)return fail('No se inició el conjunto · '+(p.stopReason?rotorStopLabel(p.stopReason):'revisa las articulaciones'));}
 for(const m of [...servoMarches])if(m.members.some(r=>members.includes(r)))stopServoMarch(m);
 const march={members,walk:walkingLegs(members,component),phase:'align',elapsed:0,settled:0,blocked:0,bestError:Infinity,period:Math.max(...members.map(r=>Math.PI*(r.servo.max-r.servo.min)/r.servo.speed))};
 for(const r of members){
  if(!configureRotor(r,{enabled:true},true)){stopServoMarch(march,'No se pudo iniciar el conjunto');return false;}
  r.servoStatus='Conjunto · preparando posición inicial';
 }
 servoMarches.add(march);rememberMechanismRun(component[0],'march',members[0]);automationIntervention('Marcha del conjunto iniciada');return true;
}
function validateServoMarches(){
 for(const m of [...servoMarches]){
  const current=servoMarchMembers(m.members[0]);
  if(current.length!==m.members.length||m.members.some(r=>!rotors.includes(r)||!r.enabled||!current.includes(r))){const failed=m.members.find(r=>r.stopReason);stopServoMarch(m,'Conjunto detenido · '+(failed?rotorStopLabel(failed.stopReason):'revisa carga o uniones'));}
 }
}
function driveServoMarches(dt){
 validateServoMarches();
 for(const m of [...servoMarches]){
  let maxError=0,maxRpm=0;
  // A grounded walker cannot slide four loaded feet to opposing endpoints
  // before its first step. Align at neutral, then build stride over one cycle.
  const amplitude=m.walk?(m.strideRamp||0):1;
  const rampRate=m.walk&&m.phase==='march'&&amplitude<1?1/m.period:0;
  for(const r of m.members){
   const s=r.servo,drive=m.walk?.drives.get(r),sign=drive?.sign??s.direction,phase=2*Math.PI*m.elapsed/m.period+(drive?.offset||0);
   const goal=(s.min+s.max)/2-sign*(s.max-s.min)/2*amplitude*Math.cos(phase);
   r.servoGoal=goal;const error=goal-servoAngle(r);maxError=Math.max(maxError,Math.abs(error));maxRpm=Math.max(maxRpm,Math.abs(r.actualRpm||0));
   const feed=m.phase==='align'?0:sign*(s.max-s.min)/2*(amplitude*Math.sin(phase)*2*Math.PI/m.period-rampRate*Math.cos(phase));
   const limit=Math.min(s.speed,(r.effectiveRpm||r.rpm)*6),speed=-clamp(error*8+feed,-limit,limit)*Math.PI/180;
   r.driveVelocity=speed;r.constraint.enableMotor();r.constraint.setMotorSpeed(speed);r.constraint.setMotorMaxForce(r.maxTorque*dt);
  }
  if(m.phase==='align'){
   m.settled=maxError<1&&maxRpm<.5?m.settled+dt:0;
   if(maxError<m.bestError-.1){m.bestError=maxError;m.blocked=0;}else m.blocked+=dt;
   if(m.settled>.15){m.phase='march';m.elapsed=0;m.blocked=0;for(const r of m.members)r.servoStatus='Marcha del conjunto · sincronizada';}
  }else {if(m.walk)m.strideRamp=Math.min(1,amplitude+dt/m.period);m.elapsed=(m.elapsed+dt)%m.period;m.blocked=maxError>12?m.blocked+dt:0;}
  if(m.blocked>3)stopServoMarch(m,'Conjunto bloqueado · revisa espacio, fuerza y carga');
 }
}
function servoMarchSnapshot(r){
 const members=servoMarchMembers(r),march=servoMarchFor(r);
 return {running:!!march,status:march?(march.phase==='align'?'Preparando todas las patas antes de comenzar':'Marcha sincronizada'):(r.servoStatus||'Conjunto detenido'),members:members.map(item=>({id:item.id,label:servoLabel(item)+' · '+item.aId,direction:item.servo.direction,angle:servoAngle(item),min:item.servo.min,max:item.servo.max})),period:march?.period};
}
function servoMarchAction(action){
 const r=selectedRotor();if(!r?.servo)return false;
 if(action.type==='start')return startServoMarch(r);
 if(action.type==='stop'){const members=servoMarchMembers(r);stopServoMarch(servoMarchFor(r));for(const item of members){configureRotor(item,{enabled:false},true);setRotorBrake(item,true);item.servoStatus='Conjunto detenido · articulaciones bloqueadas';}return true;}
 const target=servoMarchMembers(r).find(item=>item.id===action.id);if(!target)return false;
 if(action.type==='phase')return !target.enabled&&configureServo(target,{direction:action.direction});
 if(action.type==='select'){const hit=rotorPart(target.aId);clearRotorSelection();selected={g:hit.g,part:hit.part};multiSelection=[];return true;}
 return false;
}

function servoConfig(kind='pivot',reference=[0,0,0,1]){return {kind,min:-60,max:60,speed:45,mode:'once',target:30,direction:1,reference:[...reference]};}
function servoConfigValid(s){return !!s&&['pivot','hinge'].includes(s.kind)&&['hold','once','repeat'].includes(s.mode)&&[1,-1].includes(s.direction)&&['min','max','target','speed'].every(k=>Number.isFinite(s[k]))&&s.min>=-90&&s.max<=90&&s.min<s.max&&s.target>=s.min&&s.target<=s.max&&s.speed>=5&&s.speed<=540&&Array.isArray(s.reference)&&s.reference.length===4&&s.reference.every(Number.isFinite)&&Math.abs(Math.hypot(...s.reference)-1)<.0001;}
function rotorEndpoint(pose,servo,side='a'){
 const localPoint=servo?V(0,servo.kind==='pivot'&&side==='b'?-HALF:CUBE_SIZE*.375,0):V(0,CUBE_SIZE*51/56,0);
 const localAxis=servo?.kind==='hinge'?V(0,0,side==='a'?1:-1):V(0,servo&&side==='b'?-1:1,0);
 return {point:add(pose.p,pose.q.vmult(localPoint)),axis:pose.q.vmult(localAxis),localPoint,localAxis};
}
function rotorEndpointFor(rotor,pose){return rotorEndpoint(pose,rotor.servo,pose.part?.id===rotor.aId?'a':'b');}
function servoShapesValid(a,b,s){return unitShape(a)==='pyramid'&&unitShape(b)===(s.kind==='pivot'?'cube':'pyramid');}
function servoTipsCompatible(a,b,s,tolerance=.004){if(!a||!b||!servoShapesValid(a,b,s)||a.g===b.g)return false;const at=rotorEndpoint(a,s,'a'),bt=rotorEndpoint(b,s,'b');return at.point.distanceTo(bt.point)<=tolerance&&at.axis.dot(bt.axis)<-.995;}
function connectServoTips(aId,bId,options={}){
 const a=rotorPart(aId),b=rotorPart(bId);if(!a||!b||aId===bId||rotorForPart(aId)||rotorForPart(bId)||rotorConnectedGroups([a.g]).includes(b.g))return null;
 const rel=a.q.inverse().mult(b.q),s=options.servo?JSON.parse(JSON.stringify(options.servo)):servoConfig(options.kind,[rel.x,rel.y,rel.z,rel.w]);
 if(!servoConfigValid(s)||!servoTipsCompatible(a,b,s)||rigidGroupsOverlap(a.g,b.g))return null;
 const rotor={driveRating:2,id:++rotorSerial,aId,bId,rpm:Math.max(1,s.speed/6),direction:1,moving:'b',mount:'wheel',maxTorque:clamp(options.maxTorque??3.2,.02,32),capacity:clamp(options.capacity??256,2,QBitsRotorPower.LIMITS.capacity[1]),enabled:false,constraint:null,pin:null,servo:s};
 if(!Number.isFinite(rotor.maxTorque)||!Number.isFinite(rotor.capacity))return null;
 if(story.scene==='campaign')rotor.maxTorque=Math.min(rotor.maxTorque,campaignTorqueCap());
 for(const g of [a.g,b.g]){stopRoute(g);leaveHaul(g);}invalidateMechanicalIndex();rotors.push(rotor);invalidateMechanicalIndex();refreshRotors();return rotor;
}
function servoAngle(rotor){
 const current=robotRelativePose(rotor),reference=new CANNON.Quaternion(...rotor.servo.reference),delta=current.mult(reference.inverse()),axis=rotor.servo.kind==='hinge'?V(0,0,1):V(0,1,0);
 let angle=2*Math.atan2(V(delta.x,delta.y,delta.z).dot(axis),delta.w)*180/Math.PI;while(angle>180)angle-=360;while(angle< -180)angle+=360;return angle;
}
function configureServo(rotor,patch={}){
 if(!rotors.includes(rotor)||!rotor.servo)return false;
 const next={...rotor.servo};for(const key of ['min','max','speed','mode','target','direction'])if(patch[key]!==undefined)next[key]=patch[key];
 if(!servoConfigValid(next))return false;
 stopServoMarch(servoMarchFor(rotor),'Conjunto detenido para ajustar');
 configureRotor(rotor,{enabled:false},true);rotor.servo=next;rotor.rpm=Math.max(1,next.speed/6);rotor.servoStatus='Configurado · detenido';return true;
}
function startServo(rotor){
 if(!rotors.includes(rotor)||!rotor.servo)return false;
 stopServoMarch(servoMarchFor(rotor),'Conjunto detenido · prueba individual');
 rotor.servoGoal=rotor.servo.mode==='repeat'?(rotor.servo.direction===1?rotor.servo.max:rotor.servo.min):rotor.servo.target;
 rotor.servoSettled=0;rotor.servoStuck=0;rotor.servoLastError=Infinity;
 const ok=configureRotor(rotor,{enabled:true},true);if(ok)rememberMechanismRun(rotorGroups(rotor)[0],'servo',rotor);rotor.servoStatus=ok?'En movimiento':'Revisa energía y carga';return ok;
}
function driveServos(dt){
 driveServoMarches(dt);const grouped=new Set([...servoMarches].flatMap(m=>m.members));
 for(const r of rotors){if(!r.servo||!r.enabled||!r.constraint||grouped.has(r))continue;
  const s=r.servo,angle=servoAngle(r),goal=r.servoGoal??s.target,error=goal-angle;
  if(Math.abs(error)<.5&&Math.abs(r.actualRpm||0)<.3){
   r.servoSettled=(r.servoSettled||0)+dt;
   if(r.servoSettled>.12){if(s.mode==='repeat'){r.servoGoal=goal===s.max?s.min:s.max;r.servoSettled=0;r.servoStuck=0;r.servoLastError=Infinity;}
    else {configureRotor(r,{enabled:false},true);r.servoStatus='Posición alcanzada · bloqueado';continue;}}
  }else r.servoSettled=0;
  if(Math.abs(error)<(r.servoLastError??Infinity)-.1){r.servoLastError=Math.abs(error);r.servoStuck=0;}else r.servoStuck=(r.servoStuck||0)+dt;
  if(r.servoStuck>3&&Math.abs(error)>2){configureRotor(r,{enabled:false},true);r.servoStatus='Bloqueado · revisa fuerza, carga y espacio';continue;}
  // Cannon's motor target has the opposite sign of B relative to A.
  const target=-clamp(error*6,-s.speed,s.speed)*Math.PI/180;
  r.driveVelocity=target;r.constraint.enableMotor();r.constraint.setMotorSpeed(target);r.constraint.setMotorMaxForce(r.maxTorque*dt);
 }
}
function servoLabel(r){return r.servo.kind==='hinge'?'Servo bisagra':'Servo pivote';}
let servoPanel=null;
function updateServoPanel(){
 if(!window.QBitsServoPanel)return;
 if(!servoPanel)servoPanel=QBitsServoPanel.create({host:document.querySelector('#servo-panel'),onMarch:action=>{const ok=servoMarchAction(action);updateServoPanel();return ok;},onApply:patch=>{const r=selectedRotor();const ok=!r?.enabled&&configureServo(r,patch);if(ok)updateServoPanel();return ok;},onAction:action=>{const r=selectedRotor();if(!r?.servo||r.enabled&&action!=='stop')return false;let ok=true;if(action==='start')ok=startServo(r);else if(action==='stop'){stopServoMarch(servoMarchFor(r));configureRotor(r,{enabled:false},true);r.servoStatus='Apagado · bloqueado';}else if(action==='invert'){ok=configureServo(r,{direction:-r.servo.direction,target:clamp(-r.servo.target,r.servo.min,r.servo.max)});}updateServoPanel();return ok;}});
 const r=selectedRotor();servoPanel.render(r?.servo?{...r.servo,id:r.id,label:servoLabel(r),angle:servoAngle(r),enabled:r.enabled,status:r.stopReason?rotorStopLabel(r.stopReason):r.servoStatus||'Apagado · bloqueado',torque:r.maxTorque,capacity:r.capacity,march:servoMarchSnapshot(r)}:null);
}
function prepareServoPart(hit,kind){
 if(story.scene!=='lab'||unitShape(hit)!=='pyramid'||rotorForPart(hit.part.id))return false;
 hit.part.mood.servoSocket=kind;announce(kind==='pivot'?'Pivote preparado · Shift: une un cubo a la punta.':'Bisagra preparada · Shift: une otra pirámide por su punta.');return true;
}
function findServoSnap(source,target,limit){
 let best=null;
 for(const a of poses(source))for(const b of poses(target)){
  if(rotorForPart(a.part.id)||rotorForPart(b.part.id))continue;
  for(const [hub,other,hubIsSource]of [[a,b,true],[b,a,false]]){
   const kind=hub.part.mood.servoSocket;if(!['pivot','hinge'].includes(kind)||unitShape(hub)!=='pyramid'||unitShape(other)!==(kind==='pivot'?'cube':'pyramid'))continue;
   const s=servoConfig(kind),at=rotorEndpoint(hub,s,'a'),bt=rotorEndpoint(other,s,'b'),distance=at.point.distanceTo(bt.point);if(distance>=limit)continue;
   const desiredQ=hubIsSource?other.q.clone():hub.q.clone();
   if(kind==='hinge'){const flip=Q();flip.setFromAxisAngle(V(0,0,1),Math.PI);desiredQ.copy(desiredQ.mult(flip));}
   const from=hubIsSource?hub:other,to=hubIsSource?bt:at,local=rotorEndpoint(from,s,hubIsSource?'a':'b').localPoint,delta=desiredQ.mult(from.q.inverse()),quaternion=delta.mult(source.body.quaternion);
   const position=sub(to.point,quaternion.vmult(add(from.part.offset,from.part.q.vmult(local))));
   const score=distance+(1-qSimilarity(quaternion,source.body.quaternion))*.025;if(score>=limit||best&&score>=best.score||!validSnapPose(source,position,quaternion,target))continue;
   best={source,target,position,quaternion,score,rotorTip:true,servoKind:kind,aId:hub.part.id,bId:other.part.id,face:{p:to.point,q:desiredQ,axis:1,normal:to.axis,dimensions:V(.018,.018,.018)}};
  }
 }return best;
}
function servoBlueprintTemplate(kind='pivot',leg=false){
 const C=CUBE_SIZE,flip=[0,0,1,0],q=[0,0,0,1],parts=[],groupsData=[];let key=0;
 const piece=(shape,p,rot=q,weight=shape==='pyramid'?1/6:1)=>({key:key++,shape,p,q:rot,weight});
 const base=[piece('cube',[0,C/2,0]),piece('pyramid',[0,C+C*.125,0])];
 const tipY=C*1.5;
 const moving=kind==='pivot'?[piece('cube',[0,tipY+C/2,0]),piece('cube',[C,tipY+C/2,0])]:[piece('pyramid',[0,tipY+C*.375,0],flip),piece('cube',[0,tipY+C,0]),piece('cube',[C,tipY+C,0])];
 groupsData.push({parts:base},{parts:moving});
 const reference=kind==='pivot'?q:flip,s=servoConfig(kind,reference);s.mode='repeat';s.min=-40;s.max=40;s.target=30;
 return {version:1,type:'rotor',name:kind==='pivot'?'Servo pivote':'Servo bisagra',groups:groupsData,joints:[{a:base[1].key,b:moving[0].key,rpm:Math.max(1,s.speed/6),direction:1,moving:'b',mount:'wheel',maxTorque:.4,capacity:32,enabled:false,servo:s}]};
}
function drawServoGuides(){
 const r=selectedRotor();if(!r?.servo)return;const a=rotorPart(r.aId),tip=rotorEndpoint(a,r.servo,'a'),points=[],axis=tip.axis,zero=a.q.vmult(r.servo.kind==='hinge'?V(0,1,0):V(1,0,0));
 const radius=CUBE_SIZE*.9;
 for(let i=0;i<=24;i++){const q=Q();q.setFromAxisAngle(axis,(r.servo.min+(r.servo.max-r.servo.min)*i/24)*Math.PI/180);points.push(add(tip.point,mul(q.vmult(zero),radius)));}
 const lines=[];for(let i=1;i<points.length;i++)lines.push(points[i-1],points[i]);drawLines(lines,[.2,.65,.75,.8]);
}

function rotorPart(id){
 const index=mechanicalPartIndex();if(index){const hit=index.get(id);return hit?{...hit,...partPose(hit.g,hit.part)}:null;}
 for(const g of groups){const part=g.parts.find(p=>p.id===id);if(part)return {g,part,...partPose(g,part)};}return null;
}
function couplerTip(pose){return {point:add(pose.p,pose.q.vmult(V(0,CUBE_SIZE*51/56,0))),axis:pose.q.vmult(V(0,1,0))};}
function rotorForPart(id){return mechanicalTopologyIndex().byPart.get(id)||null;}
function rotorGroups(rotor){const parts=mechanicalPartIndex();return [parts.get(rotor.aId)?.g||null,parts.get(rotor.bId)?.g||null];}
function rotorForGroup(g){return mechanicalTopologyIndex().byGroup.get(g)||null;}
function rotorConnectedGroups(initial){
 const topology=mechanicalTopologyIndex(),seeds=[...new Set(initial.filter(g=>topology.edges.has(g)))];
 // Preserve the existing physics traversal order, including energy allocation.
 if(mechanicalStepCache){
  const components=topology.components;
  if(!components.size)for(const seed of groups)if(!components.has(seed)){
   const component=[seed],seen=new Set(component);for(let i=0;i<component.length;i++)for(const next of topology.edges.get(component[i]))if(!seen.has(next)){seen.add(next);component.push(next);}
   for(const g of component)components.set(g,component);
  }
  const result=seeds.slice(),seen=new Set(result);for(const seed of seeds)for(const g of components.get(seed)||[])if(!seen.has(g)){seen.add(g);result.push(g);}return result;
 }
 // UI/construction queries retain seed-first breadth-first ordering.
 const result=seeds.slice(),seen=new Set(result);
 for(let i=0;i<result.length;i++)for(const next of topology.edges.get(result[i]))if(!seen.has(next)){seen.add(next);result.push(next);}
 return result;
}
// Control sets reference hinges, not rigid bodies: several selected axles may
// share one chassis, and welding must never change their membership.
function rotorSetName(name){return String(name??'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,40)||'Conjunto de rotores';}
function rotorSetMembers(set){return [...new Set(Array.isArray(set?.rotorIds)?set.rotorIds:[])].map(id=>rotors.find(r=>r.id===id)).filter(Boolean);}
function selectedRotors(){return rotorSetMembers({rotorIds:selectedRotorIds});}
function rotorSetFor(rotor){return rotor&&rotorSets.find(set=>set.rotorIds.includes(rotor.id))||null;}
function activeRotorSet(){
 const chosen=selectedRotors();
 if(chosen.length){const set=rotorSetFor(chosen[0]);return set&&set.rotorIds.length===chosen.length&&chosen.every(r=>set.rotorIds.includes(r.id))?set:null;}
 return rotorSetFor(selectedRotor());
}
function controlRotors(){const chosen=selectedRotors();if(chosen.length)return chosen;const set=activeRotorSet();return set?rotorSetMembers(set):selectedRotor()?[selectedRotor()]:[];}
function clearRotorSelection(){selectedRotorIds=[];redraw=true;}
function selectRotorSet(set){const members=rotorSetMembers(set);selectedRotorIds=members.map(r=>r.id);multiSelection=[];selectedCargo=null;const hit=members.length&&rotorPart(members[0].aId);selected=hit?{g:hit.g,part:hit.part}:null;redraw=true;return members.length>0;}
function toggleRotorSelection(rotor){
 if(!rotors.includes(rotor))return false;
 const at=selectedRotorIds.indexOf(rotor.id);
 if(at<0&&selectedRotors().length>=settings.maxSelect){announce('Máximo '+settings.maxSelect+' rotores seleccionados');return false;}
 if(at<0)selectedRotorIds.push(rotor.id);else selectedRotorIds.splice(at,1);
 multiSelection=[];selectedCargo=null;const first=selectedRotors()[0],hit=first&&rotorPart(first.aId);selected=hit?{g:hit.g,part:hit.part}:null;redraw=true;return true;
}
function cleanRotorSets(){
 const hadSelection=selectedRotorIds.length>0,valid=new Set(rotors.map(r=>r.id));selectedRotorIds=selectedRotorIds.filter(id=>valid.has(id));
 if(hadSelection){const first=selectedRotors()[0],hit=first&&rotorPart(first.aId);selected=hit?{g:hit.g,part:hit.part}:null;}
 for(const set of [...rotorSets]){set.rotorIds=set.rotorIds.filter(id=>valid.has(id));if(!set.rotorIds.length)rotorSets.splice(rotorSets.indexOf(set),1);}
}
function createRotorSet(name,members=selectedRotors()){
 const ids=[...new Set((Array.isArray(members)?members:[]).filter(r=>rotors.includes(r)).map(r=>r.id))];if(!ids.length)return null;
 for(const set of [...rotorSets]){set.rotorIds=set.rotorIds.filter(id=>!ids.includes(id));if(!set.rotorIds.length)rotorSets.splice(rotorSets.indexOf(set),1);}
 const set={id:++rotorSetSerial,name:rotorSetName(name),rotorIds:ids};rotorSets.push(set);return set;
}
function renameRotorSet(set,name){if(!rotorSets.includes(set))return false;set.name=rotorSetName(name);return true;}
function dissolveRotorSet(set){const at=rotorSets.indexOf(set);if(at<0)return false;rotorSets.splice(at,1);return true;}
function configureRotorSet(set,patch={}){
 if(!patch||typeof patch!=='object'||!Array.isArray(set?.rotorIds))return false;
 const requested=[...new Set(set.rotorIds)];refreshRotors();
 const members=rotorSetMembers({rotorIds:requested});if(members.some(r=>r.servo)&&patch.enabled===true){announce('Configura e inicia cada servo desde su panel.');return false;}if(!members.length||members.length!==requested.length){announce('Revisa los rotores del conjunto.');return false;}
 if(['rpm','maxTorque','capacity'].some(key=>patch[key]!==undefined&&!Number.isFinite(patch[key]))||patch.enabled!==undefined&&typeof patch.enabled!=='boolean'||patch.invert!==undefined&&typeof patch.invert!=='boolean')return false;
 const belts=conveyors.filter(c=>c.joints.some(j=>members.some(r=>r.aId===j.aId&&r.bId===j.bId)));if(belts.length&&patch.enabled===true){announce('Usa Iniciar cinta en Mecanismos.');return false;}for(const belt of belts)if(belt.running)stopConveyor(belt,'Detenida para ajustar');
 const arms=robotArms.filter(arm=>arm.joints.some(j=>members.some(r=>r.aId===j.aId&&r.bId===j.bId)));
 // Sets are a public control surface too: their automatic internal apply must
 // never bypass the arm's sequencer and drive against its passive brakes.
 if(arms.length&&patch.enabled===true){announce('Usa Ajustar ejes o Iniciar secuencia del brazo.');return false;}
 for(const arm of arms)if(arm.running||arm.jogging)stopRobotArm(arm,'Detenido para ajustar el conjunto');
 const plans=members.map(rotor=>{
  const next={};for(const key of ['rpm','maxTorque','capacity'])if(patch[key]!==undefined){const limits=QBitsRotorPower.LIMITS[key];next[key]=clamp(patch[key],limits[0],limits[1]);}
  if(next.maxTorque!==undefined&&story.scene==='campaign')next.maxTorque=Math.min(next.maxTorque,campaignTorqueCap());
  if(patch.enabled!==undefined)next.enabled=patch.enabled;
  if(patch.invert)next.direction=-rotor.direction;
  return {rotor,next,proposed:{...rotor,...next}};
 });
 // Validate the whole command before touching any member, including existing
 // motors outside this set which a fixed mount would otherwise switch off.
 for(const {rotor,proposed}of plans){
  if(!proposed.enabled)continue;
  const component=rotorConnectedGroups(rotorGroups(rotor));
  if((held?.items||(held?[held]:[])).some(item=>component.includes(item.g))){announce('Suelta el conjunto antes de iniciar la marcha.');return false;}
  const power=rotorPowerState(proposed);
  if(power.stopReason){announce('No se aplicó la orden · '+rotorStopLabel(power.stopReason)+'. Revisa los rotores del conjunto.');return false;}
  const conflict=rotors.some(other=>{
   if(other===rotor||!rotorGroups(other).some(g=>component.includes(g)))return false;
   const future=plans.find(plan=>plan.rotor===other)?.proposed||other;
   return future.enabled&&(proposed.mount==='fixed'||future.mount==='fixed');
  });
  if(conflict){announce('El conjunto tiene ejes fijos incompatibles. Usa rueda libre para un vehículo.');return false;}
 }
 const before=members.map(rotor=>({rpm:rotor.rpm,maxTorque:rotor.maxTorque,capacity:rotor.capacity,direction:rotor.direction,enabled:rotor.enabled}));
 for(const {rotor,next}of plans)if(!configureRotor(rotor,next,true)){
  members.forEach((r,i)=>configureRotor(r,{...before[i],enabled:false},true));members.forEach((r,i)=>{if(before[i].enabled)configureRotor(r,{enabled:true},true);});
  announce('No se pudo aplicar la orden al conjunto.');return false;
 }
 if(patch.enabled===true)for(const r of members)rememberMechanismRun(rotorGroups(r)[0],'rotor',r);
 automationIntervention('Conjunto ajustado: ensayo reiniciado.');return true;
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
 if(rotor.virtualConveyor)materializeConveyor(rotor.virtualConveyor);
 stopServoMarch(servoMarchFor(rotor),'Conjunto detenido · articulación separada');
 invalidateMechanicalIndex();
 if(rotor.constraint)world.removeConstraint(rotor.constraint);rotor.constraint=null;unpinRotor(rotor);rotors.splice(rotors.indexOf(rotor),1);invalidateMechanicalIndex();cleanRotorSets();return true;
}
function rotorTipsCompatible(a,b,tolerance=.002){
 if(!a||!b||unitShape(a)!=='coupler'||unitShape(b)!=='coupler'||a.g===b.g)return false;
 const at=couplerTip(a),bt=couplerTip(b);return at.point.distanceTo(bt.point)<=tolerance&&at.axis.dot(bt.axis)<-.995;
}
function connectRotorTips(aId,bId,options={}){
 if(options.servo)return connectServoTips(aId,bId,options);
 const a=rotorPart(aId),b=rotorPart(bId);
 if(aId===bId||rotorForPart(aId)||rotorForPart(bId)||propellerHasBlade(aId)||propellerHasBlade(bId)||!rotorTipsCompatible(a,b)||rotorConnectedGroups([a.g]).includes(b.g))return null;
 if(poses(a.g).some(pa=>poses(b.g).some(pb=>obbOverlap(pa,pb,.000001))))return null;
 if(options.rpm!==undefined&&!Number.isFinite(options.rpm)||options.direction!==undefined&&![1,-1].includes(options.direction)||options.moving!==undefined&&!['a','b'].includes(options.moving)||options.mount!==undefined&&!['wheel','fixed'].includes(options.mount)||options.maxTorque!==undefined&&!Number.isFinite(options.maxTorque)||options.capacity!==undefined&&!Number.isFinite(options.capacity))return null;
 if(story.scene==='campaign')options={...options,maxTorque:Math.min(options.maxTorque??.4,campaignTorqueCap())};
 const rotor={driveRating:2,id:++rotorSerial,aId,bId,rpm:clamp(options.rpm??30,1,360),direction:options.direction??1,moving:options.moving??'b',mount:options.mount??'wheel',maxTorque:clamp(options.maxTorque??3.2,.02,32),capacity:clamp(options.capacity??(story.scene==='lab'?256:128),2,QBitsRotorPower.LIMITS.capacity[1]),enabled:false,constraint:null,pin:null};
 stopRoute(a.g);stopRoute(b.g);leaveHaul(a.g);leaveHaul(b.g);invalidateMechanicalIndex();rotors.push(rotor);invalidateMechanicalIndex();for(const [part,label]of [[a.part,'A'],[b.part,'B']])if(/^Enganche (?:\d+|[AB] · \d+)$/.test(part.mood.name))part.mood.name='Enganche '+label+' · '+part.id;refreshRotors();
 if(options.enabled)configureRotor(rotor,{enabled:true});return rotor;
}
function refreshRotors(rebound=null){
 syncVirtualConveyors();
 for(const conveyor of conveyors)if(conveyor.virtual&&!virtualConveyorCandidates(conveyor))materializeConveyor(conveyor);
 for(const rotor of [...rotors]){
  if(rotor.virtualConveyor?.virtual)continue;
  const a=rotorPart(rotor.aId),b=rotorPart(rotor.bId);
  if(!a||!b||a.g===b.g||(rotor.servo?!servoShapesValid(a,b,rotor.servo):unitShape(a)!=='coupler'||unitShape(b)!=='coupler')){disconnectRotor(rotor);continue;}
  if(rotor.constraint&&(rotor.constraint.bodyA!==a.g.body||rotor.constraint.bodyB!==b.g.body)){world.removeConstraint(rotor.constraint);rotor.constraint=null;unpinRotor(rotor);}
  if(!rotor.constraint){
   if(!rebound?.has(rotor)&&!(rotor.servo?servoTipsCompatible(a,b,rotor.servo):rotorTipsCompatible(a,b,.004))){disconnectRotor(rotor);continue;}
   const af=rotorEndpoint(a,rotor.servo,'a'),bf=rotorEndpoint(b,rotor.servo,'b');
   rotor.constraint=new CANNON.HingeConstraint(a.g.body,b.g.body,{pivotA:add(a.part.offset,a.part.q.vmult(af.localPoint)),pivotB:add(b.part.offset,b.part.q.vmult(bf.localPoint)),axisA:a.part.q.vmult(af.localAxis),axisB:b.part.q.vmult(mul(bf.localAxis,-1)),maxForce:1000,collideConnected:true});
   for(const equation of rotor.constraint.equations)setPhysicsEquation(equation,1e10,4);
   // A passive parking brake closes only the remaining twist degree of
   // freedom. It belongs to this hinge, never to the room or its floor.
   const brake=new CANNON.RotationalEquation(a.g.body,b.g.body,{maxForce:1000});
   setPhysicsEquation(brake,1e10,4);brake.enabled=false;
   rotor.constraint.stopBrake={equation:brake,localA:V(),localB:V()};
   rotor.constraint.equations.push(brake);
   const update=rotor.constraint.update;
   rotor.constraint.update=function(){update.call(this);const hold=this.stopBrake;if(hold.equation.enabled){this.bodyA.quaternion.vmult(hold.localA,hold.equation.axisA);this.bodyB.quaternion.vmult(hold.localB,hold.equation.axisB);}};
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
 if(!automatic&&!panel.hidden&&rotor.enabled&&patch.enabled!==false)return false;
 if(!automatic&&rotor.servo&&patch.enabled===false)stopServoMarch(servoMarchFor(rotor));
 if(rotor.servo&&(patch.mount&&patch.mount!=='wheel'||patch.moving&&patch.moving!=='b'))return false;
 if(rotor.servo&&!automatic&&patch.enabled===true)return startServo(rotor);
 if(!automatic){const conveyor=conveyors.find(c=>c.joints.some(j=>j.aId===rotor.aId&&j.bId===rotor.bId));if(conveyor){if(patch.enabled===true){announce('Usa Iniciar cinta en Mecanismos.');return false;}if(conveyor.running)stopConveyor(conveyor,'Detenida para ajustar');}}
 if(!automatic){const arm=robotArmForRotor(rotor);if(arm){if(patch.enabled===true){announce('Usa Ajustar ejes o Iniciar secuencia del brazo.');return false;}if(arm.running||arm.jogging)stopRobotArm(arm,'Detenido para ajustar');}}
 patch={...patch};if(story.scene==='campaign')patch.maxTorque=Math.min(patch.maxTorque??rotor.maxTorque,campaignTorqueCap());
 if(!rotors.includes(rotor)||patch.rpm!==undefined&&!Number.isFinite(patch.rpm)||patch.direction!==undefined&&![1,-1].includes(patch.direction)||patch.moving!==undefined&&!['a','b'].includes(patch.moving)||patch.mount!==undefined&&!['wheel','fixed'].includes(patch.mount)||patch.maxTorque!==undefined&&!Number.isFinite(patch.maxTorque)||patch.capacity!==undefined&&!Number.isFinite(patch.capacity))return false;
 if(rotor.virtualConveyor&&patch.moving&&patch.moving!==rotor.moving)materializeConveyor(rotor.virtualConveyor);
 refreshRotors();if(!rotors.includes(rotor))return false;
 if(!automatic)automationIntervention('Motor ajustado: ensayo reiniciado.');
 const connected=rotorConnectedGroups(rotorGroups(rotor));
 if(patch.enabled&&(held?.items||[]).some(item=>connected.includes(item.g))){announce('Suelta el rotor antes de accionarlo.');return false;}
 if(patch.moving&&patch.moving!==rotor.moving||patch.mount&&patch.mount!==rotor.mount)unpinRotor(rotor);
 if(patch.rpm!==undefined)rotor.rpm=clamp(patch.rpm,1,360);
 if(patch.direction!==undefined)rotor.direction=patch.direction;
 if(patch.moving!==undefined)rotor.moving=patch.moving;
 if(patch.mount!==undefined)rotor.mount=patch.mount;
 if(patch.maxTorque!==undefined)rotor.maxTorque=clamp(patch.maxTorque,.02,32);
 if(patch.capacity!==undefined)rotor.capacity=clamp(patch.capacity,2,QBitsRotorPower.LIMITS.capacity[1]);
 if(patch.enabled&&typeof checkRotorPower==='function'&&!checkRotorPower(rotor))return false;
 if(patch.enabled!==undefined){rotor.enabled=!!patch.enabled;rotor.stopReason=null;}
 if(rotor.enabled)for(const other of rotors)if(other!==rotor&&(rotor.mount==='fixed'||other.mount==='fixed')&&rotorGroups(other).some(g=>connected.includes(g))){other.enabled=false;other.constraint?.disableMotor();unpinRotor(other);}
 if(!rotor.enabled){if(patch.enabled===false)rotor.actualRpm=0;rotor.constraint?.disableMotor();unpinRotor(rotor);for(const g of rotorGroups(rotor))if(g){g.body.angularVelocity.set(0,0,0);g.body.wakeUp();}}
 updateRotorMotors();if(!automatic&&patch.enabled===true)rememberMechanismRun(connected[0],'rotor',rotor);return true;
}
function rotorMovingFrame(rotor,moving){
 if(rotor.frameCache?.parts===moving.parts&&rotor.frameCache.moving===rotor.moving)return rotor.frameCache;
 const part=moving.parts.find(p=>p.id===(rotor.moving==='a'?rotor.aId:rotor.bId)),endpoint=rotorEndpointFor(rotor,partPose(moving,part)),pivot=add(part.offset,part.q.vmult(endpoint.localPoint)),axis=part.q.vmult(endpoint.localAxis);let radius=0;
 for(const pose of poses(moving,V(),Q()))for(const point of corners(pose)){const v=sub(point,pivot);radius=Math.max(radius,sub(v,mul(axis,v.dot(axis))).norm());}
 return rotor.frameCache={parts:moving.parts,moving:rotor.moving,pivot,axis,radius:Math.max(.01,radius)};
}
function rotorProjectedPose(rotor,moving,base,quaternion=moving.body.quaternion){
 const frame=rotorMovingFrame(rotor,moving),basePart=base.parts.find(p=>p.id===(rotor.moving==='a'?rotor.bId:rotor.aId)),tip=rotorEndpointFor(rotor,partPose(base,basePart));
 const correction=Q();correction.setFromVectors(quaternion.vmult(frame.axis),mul(tip.axis,-1));correction.normalize();
 const q=correction.mult(quaternion);q.normalize();return {p:sub(tip.point,q.vmult(frame.pivot)),q,pivot:tip.point,axis:mul(tip.axis,-1)};
}
// This Cannon version compares friction force bounds directly to impulse.
// Match the true torque cap for driven free bodies without changing legacy
// walking, hauling or unpowered contact behavior elsewhere in the room.
const solveRotorContacts=world.solver.solve;
world.solver.solve=function(dt,physicsWorld){
 // Narrowphase has replaced/reused the contacts since the pre-step load checks.
 invalidateConveyorContacts();
 // Propagate actual wake events (impact, grabbing, motor start) through the
 // mechanism. Ordinary SLEEPY solver jitter must not repeatedly wake its base.
 for(const g of groups)if(g.wakeMechanicalComponent){const component=rotorConnectedGroups([g]);
  for(const member of component)if(member.body.type===CANNON.Body.DYNAMIC&&member.body.sleepState===CANNON.Body.SLEEPING)member.body.wakeUp();
  for(const member of component)member.wakeMechanicalComponent=false;
 }
 const driven=new Set();for(const rotor of rotors)if(rotor.enabled&&rotor.mount==='wheel')for(const g of rotorConnectedGroups(rotorGroups(rotor)))driven.add(g.body);
 for(const grip of robotGrips.values())if(driven.has(robotGripperHit(grip.id)?.g.body))driven.add(grip.body);
 // Large assemblies retain their summed mass and inertia, with quieter contacts.
 for(const contact of physicsWorld.contacts){
  if(story.scene==='lab'&&Math.abs(contact.ni.y)>.97&&Math.abs(contact.getImpactVelocityAlongNormal())<.35)contact.restitution=0;
  else if(contact.bi.qubitGroup?.parts.length>1||contact.bj.qubitGroup?.parts.length>1)contact.restitution=Math.min(contact.restitution,.025);
 }
 const articulated=new Set();for(const rotor of rotors){const pair=rotorGroups(rotor);if(pair.some(g=>!articulated.has(g.body)))for(const g of rotorConnectedGroups(pair))articulated.add(g.body);}
 for(const g of groups)if(!(held?.items||[]).some(item=>item.g===g))g.body.angularDamping=articulated.has(g.body)||g.route||g.haulJob||g.blueprintJob||g.parts.some(p=>p.mood.flight?.enabled)?settings.damping:groupAngularDamping(g.parts.length);
 if(story.scene==='lab')settleSupportedGroups(dt,physicsWorld.contacts,driven,articulated);
 const footLimits=walkingFootFriction(physicsWorld,dt),skinPairs=conveyorFrictionPairs(physicsWorld),changed=[];for(const eq of physicsWorld.frictionEquations){if(skinPairs.get(eq.bi)?.has(eq.bj)||skinPairs.get(eq.bj)?.has(eq.bi)){changed.push([eq,eq.minForce,eq.maxForce]);eq.minForce=0;eq.maxForce=0;}else if(footLimits?.has(eq)){changed.push([eq,eq.minForce,eq.maxForce]);eq.maxForce=footLimits.get(eq);eq.minForce=-eq.maxForce;}else if(driven.has(eq.bi)||driven.has(eq.bj)){changed.push([eq,eq.minForce,eq.maxForce]);eq.minForce*=dt;eq.maxForce*=dt;}}
 try{return solveRotorContacts.call(this,dt,physicsWorld);}finally{for(const [eq,min,max]of changed){eq.minForce=min;eq.maxForce=max;}}
};
// Completed conveyor rollers are motor records plus a visual angle. The
// existing electrical model still charges every motor for idle, acceleration
// and winding loss; conveyorDriveSurface separately pays for real load work.
function updateVirtualConveyorMotor(rotor,dt=0){
 const conveyor=rotor.virtualConveyor,pair=rotorGroups(rotor),moving=pair.find(g=>g?.virtualConveyor?.conveyor===conveyor);
 if(!moving||!rotor.enabled||!conveyor.running){rotor.actualRpm=0;rotor.actualTorque=0;rotor.driveVelocity=0;rotor.stalled=false;return;}
 const frame=rotorMovingFrame(rotor,moving),record=moving.virtualConveyor,inertia=record.inertia||moving.body.inertia,axis=frame.axis;
 const axial=Math.max(1e-9,inertia.x*axis.x*axis.x+inertia.y*axis.y*axis.y+inertia.z*axis.z*axis.z+(record.mass||0)*(frame.pivot.norm2()-frame.pivot.dot(axis)**2));
 rotor.effectiveRpm=Math.min(rotor.rpm,5/frame.radius*60/(2*Math.PI));rotor.speedLimited=rotor.effectiveRpm<rotor.rpm-.01;
 const seconds=Number.isFinite(dt)?Math.max(0,dt):0,previous=rotor.driveVelocity||0,target=rotor.direction*rotor.effectiveRpm*Math.PI*2/60,limit=Math.min(16,rotor.maxTorque/axial)*seconds;
 rotor.driveVelocity=previous+clamp(target-previous,-limit,limit);
 rotor.actualRpm=rotor.driveVelocity*60/(2*Math.PI);rotor.actualTorque=seconds?Math.min(rotor.maxTorque,axial*Math.abs(rotor.driveVelocity-previous)/seconds):0;
 rotor.visualPhase=(rotor.visualPhase||0)+rotor.driveVelocity*seconds;rotor.motorStep=seconds;rotor.stalled=false;rotor.obstructed=false;rotor.beforeStep=null;
}
function updateRotorMotors(dt=0){
 for(const rotor of rotors){
  if(rotor.virtualConveyor?.virtual){updateVirtualConveyorMotor(rotor,dt);continue;}
  const pair=rotorGroups(rotor),constraint=rotor.constraint;if(!constraint||pair.some(g=>!g))continue;
  const moving=pair[rotor.moving==='a'?0:1],base=pair[rotor.moving==='a'?1:0],b=base.body,frame=rotorMovingFrame(rotor,moving);
  // Respect the simulation's 6 m/s travel ceiling at the outermost point,
  // rather than clipping only the center velocity and stretching a long arm.
  rotor.effectiveRpm=Math.min(rotor.rpm,5/frame.radius*60/(2*Math.PI));rotor.speedLimited=rotor.effectiveRpm<rotor.rpm-.01;
  if(dt>0)rotor.beforeStep=pair.map(g=>({p:g.body.position.clone(),q:g.body.quaternion.clone()}));
  setRotorBrake(rotor,!rotor.enabled);
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
   for(const g of pair){stopRoute(g);leaveHaul(g);if(conveyorPins.has(g.body))continue;if(g.body.type!==CANNON.Body.DYNAMIC||g.body.fixedRotation){g.body.type=CANNON.Body.DYNAMIC;g.body.fixedRotation=false;g.body.updateMassProperties();}g.body.wakeUp();}
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
function setRotorBrake(rotor,enabled){
 const constraint=rotor.constraint,hold=constraint?.stopBrake;if(!hold)return;
 if(enabled&&!hold.equation.enabled){
  const a=rotorPart(rotor.aId),axis=a.part.q.vmult(rotorEndpoint(a,rotor.servo,'a').localAxis);
  hold.localA.copy(a.part.q.vmult(V(1,0,0)));
  const perpendicular=constraint.bodyA.quaternion.vmult(axis.cross(hold.localA));
  constraint.bodyB.quaternion.inverse().vmult(perpendicular,hold.localB);
 }
 hold.equation.enabled=enabled;
}
function rotorRestPose(g){const b=g.body,p=b.position,q=b.quaternion;return {g,parts:g.parts,values:[p.x,p.y,p.z,q.x,q.y,q.z,q.w]};}
function rotorRestUnchanged(g,saved){
 if(!saved||saved.g!==g||saved.parts!==g.parts||g.body.sleepState!==CANNON.Body.SLEEPING)return false;
 const b=g.body,p=b.position,q=b.quaternion,values=[p.x,p.y,p.z,q.x,q.y,q.z,q.w];
 return values.every((value,i)=>Math.abs(value-saved.values[i])<1e-12);
}
function stabilizeRotors(){
 syncVirtualConveyors();
 for(const rotor of rotors){
  if(rotor.virtualConveyor?.virtual)continue;
  const pair=rotorGroups(rotor);if(pair.some(g=>!g))continue;
  // Sleeping means Cannon found equilibrium. Recheck immediately after a
  // contact wakes either body, a rebuild, a move, or a motor start.
  if(!rotor.enabled&&pair.every((g,i)=>rotorRestUnchanged(g,rotor.restPose?.[i]))){rotor.actualTorque=0;rotor.actualRpm=0;rotor.stalled=false;continue;}
  const moving=pair[rotor.moving==='a'?0:1],base=pair[rotor.moving==='a'?1:0],b=moving.body,pose=rotorProjectedPose(rotor,moving,base);
  rotor.actualTorque=rotor.enabled&&rotor.motorStep>0?Math.abs(rotor.motorImpulse||0)/rotor.motorStep:0;
  rotor.actualRpm=sub(b.angularVelocity,base.body.angularVelocity).dot(pose.axis)*60/(2*Math.PI);
  rotor.stallTime=rotor.enabled&&Math.abs(rotor.actualRpm)<Math.min(2,rotor.effectiveRpm*.15)&&Math.abs(rotor.driveVelocity)>.3?(rotor.stallTime||0)+(rotor.motorStep||0):0;
  rotor.stalled=rotor.obstructed||rotor.stallTime>.25;
  if(rotor.mount==='wheel'||!rotor.enabled){
   // An unpowered rotor holds its twist with a passive brake. Leave contact forces and angular velocity to the solver. Correct only
   // translation drift, distributing it by mass so the assembly stays free.
   const at=rotorEndpoint(rotorPart(rotor.aId),rotor.servo,'a'),bt=rotorEndpoint(rotorPart(rotor.bId),rotor.servo,'b'),gap=sub(bt.point,at.point),total=pair[0].body.mass+pair[1].body.mass;
   // Sleeping supports have zero solver mass. Moving them here bypasses
   // their floor contacts and makes an idle machine creep indefinitely.
   const fixedA=pair[0].body.type!==CANNON.Body.DYNAMIC||pair[0].body.invMassSolve===0,fixedB=pair[1].body.type!==CANNON.Body.DYNAMIC||pair[1].body.invMassSolve===0;
   if(!fixedA)pair[0].body.position.vadd(mul(gap,fixedB?1:pair[1].body.mass/total),pair[0].body.position);
   if(!fixedB)pair[1].body.position.vsub(mul(gap,fixedA?1:pair[0].body.mass/total),pair[1].body.position);
   const solidsOverlap=rigidGroupsOverlap(pair[0],pair[1]);
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
   rotor.restPose=!rotor.enabled&&!solidsOverlap?pair.map(rotorRestPose):null;
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
 if(scenePartCount()+2>MAX_QUBITS){announce('No hay capacidad para dos enganches.');return null;}
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
 for(const a of poses(source))if(unitShape(a)==='coupler'&&!rotorForPart(a.part.id)&&!propellerHasBlade(a.part.id))for(const b of poses(target))if(unitShape(b)==='coupler'&&!rotorForPart(b.part.id)&&!propellerHasBlade(b.part.id)){
  const at=couplerTip(a),bt=couplerTip(b),distance=at.point.distanceTo(bt.point);if(distance>=limit)continue;
  const delta=Q();delta.setFromVectors(at.axis,mul(bt.axis,-1));delta.normalize();const quaternion=delta.mult(source.body.quaternion);quaternion.normalize();
  const local=add(a.part.offset,a.part.q.vmult(V(0,CUBE_SIZE*51/56,0))),position=sub(bt.point,quaternion.vmult(local));
  const score=distance+(1-qSimilarity(quaternion,source.body.quaternion))*.025;
  if(score>=limit||best&&score>=best.score||!validSnapPose(source,position,quaternion,target))continue;
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
function validSnapPose(source,position,quaternion,target=null){
 const placement=mechanismSnapPoses(source,position,quaternion),members=placement.map(item=>item.g);
 const isFrame=g=>g&&conveyors.some(conveyor=>conveyorTopology(conveyor)?.complete&&rotorPart(conveyor.baseId)?.g===g),joiningFrames=target&&(isFrame(source)||isFrame(target))?new Set([source,target]):null;
 return placement.every(item=>validPose(item.g,item.p,item.q,members,joiningFrames));
}
function placeSnappedMechanism(placement){
 for(const {g,p,q}of placement){g.body.position.copy(p);g.body.quaternion.copy(q);g.body.aabbNeedsUpdate=true;g.body.updateInertiaWorld(true);}
}
function settleSnappedMechanisms(source,target){
 const members=rotorConnectedGroups([source,target]);
 for(const rotor of rotors)if(rotorGroups(rotor).some(g=>members.includes(g)))unpinRotor(rotor);
 for(const g of members){g.body.velocity.set(0,0,0);g.body.angularVelocity.set(0,0,0);g.body.force.set(0,0,0);g.body.torque.set(0,0,0);g.body.wakeUp();}
}
function findSnap(){
 if(!held||held.shakeSeparated||!shiftDown()||!heldMechanismCanSnap())return null;
 const source=held.g,part=partPose(source,held.part),connected=new Set(rotorConnectedGroups([source])),sourceBox=bounds(source),margin=V(.15,.15,.15),nearSource={min:sub(sourceBox.min,margin),max:add(sourceBox.max,margin)};let candidate=null,best=.055;
 for(const target of groups){if(target.route||target.haulJob||connected.has(target)||!boundsOverlap(nearSource,bounds(target)))continue;
  const blade=findPropellerSnap(source,target,best);if(blade){candidate=blade;best=blade.score;}
  const servo=findServoSnap(source,target,best);if(servo){candidate=servo;best=servo.score;}
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
   if(!validSnapPose(source,position,quaternion,target))continue;
   best=distance;candidate={source,target,position,quaternion,score:distance,face:{p:add(t.p,mul(normal,HALF+.001)),normal,q:t.q,axis}};
   }
  }
 }return candidate;
}
function emitJoinSound(point){
 // Optional audio must never roll back an already committed physical assembly.
 try{if(story.mode==='playing'&&!storySuspended()&&!story.transition)window.QBitsJoinAudio?.play(point,camera,yaw);}catch{}
}
function weld(candidate,{sound=true}={}){
 if(!candidate)return null;
 if(runningConveyorForGroups([candidate.source,candidate.target])){announce('Cinta en funcionamiento · primero apaga o desconecta la cinta para modificarla.');return null;}
 automationIntervention();
 if([candidate.source,candidate.target].some(g=>g?.parts.some(p=>p.mood.production))){announce('La materia de este lote se combina dentro de la cámara.');return null;}
 const {source,target,position,quaternion}=candidate;
 if(source===target||!groups.includes(source)||!groups.includes(target)||!position||!quaternion||!['x','y','z'].every(k=>Number.isFinite(position[k]))||!['x','y','z','w'].every(k=>Number.isFinite(quaternion[k]))||Math.abs(quaternion.x**2+quaternion.y**2+quaternion.z**2+quaternion.w**2-1)>1e-5)return null;
 if(!validSnapPose(source,position,quaternion,target)||rotorConnectedGroups([source]).includes(target))return null;
 if(candidate.rotorTip){
  const placement=mechanismSnapPoses(source,position,quaternion),before=placement.map(({g})=>({g,p:g.body.position.clone(),q:g.body.quaternion.clone()}));placeSnappedMechanism(placement);
  const rotor=candidate.servoKind?connectServoTips(candidate.aId,candidate.bId,{kind:candidate.servoKind}):connectRotorTips(candidate.aId,candidate.bId);
  if(!rotor){placeSnappedMechanism(before);return null;}
  settleSnappedMechanisms(source,target);
  selected={g:source,part:source.parts.find(p=>p.id===candidate.aId)||source.parts[0]};announce(rotor.servo?servoLabel(rotor)+' unido · clic derecho → Configurar servo':'Rotor unido · clic derecho → Rotación');if(sound)emitJoinSound(candidate.face?.p||position);return source;
 }
 const sourceParts=poses(source,position,quaternion),targetParts=poses(target);
 const sourceEntries=sourceParts.map(collisionEntry),targetEntries=targetParts.map(collisionEntry);
 if(sourceEntries.some(a=>targetEntries.some(b=>boundsOverlap(a,b)&&obbOverlap(a.pose,b.pose,.000001))))return null;
 // A joining face must reach both material bounds. Keep the existing exact
 // face test, including composite T-bit faces, but build it only near the seam.
 const margin=V(.0001,.0001,.0001),sourceBox=bounds(source,position,quaternion),targetBox=bounds(target),nearSource={min:sub(sourceBox.min,margin),max:add(sourceBox.max,margin)},nearTarget={min:sub(targetBox.min,margin),max:add(targetBox.max,margin)};
 if(!candidate.propellerTip&&!assembliesTouch(sourceEntries.filter(a=>boundsOverlap(a,nearTarget)).map(a=>a.pose),targetEntries.filter(b=>boundsOverlap(b,nearSource)).map(b=>b.pose)))return null;
 if(candidate.propellerTip){const both=sourceParts.concat(targetParts),hub=both.find(p=>p.part.id===candidate.hubId),blade=both.find(p=>p.part.id===candidate.bladeId);if(!hub||!blade||rotorForPart(candidate.hubId)||propellerSocket(hub,blade)!==candidate.side)return null;}
 const parts=sourceParts.map(o=>({id:o.part.id,weight:o.part.weight,shape:o.part.shape,p:o.p,q:o.q,mood:copyMood(o.part.mood)})).concat(worldParts(target));
 const rebound=new Set();
 for(const r of rotors){
  if(!r.constraint||!robotArmForRotor(r)||!rotorGroups(r).some(g=>g===source||g===target))continue;
  // Check the original live sockets before retiring either body. A small
  // solver offset is safe because the weld moves the whole chain rigidly.
  if(!rotorTipsCompatible(rotorPart(r.aId),rotorPart(r.bId),.008)){announce('Deja reposar el brazo antes de fijarlo al soporte.');return null;}
  rebound.add(r);
 }
 const placement=mechanismSnapPoses(source,position,quaternion);settleSnappedMechanisms(source,target);placeSnappedMechanism(placement);
 alignJoinedConveyors(source,target,candidate.conveyorAnchor);
 const ref=target.body.quaternion.clone();removeGroup(source);removeGroup(target);const joined=makeGroup(parts,ref);refreshRotors(rebound);
 batchConveyorBodyUpdates(()=>{for(const conveyor of conveyors)if(conveyorComplete(conveyor)&&conveyorEnsureSurfaces(conveyor))virtualizeConveyor(conveyor);});
 selected={g:joined,part:joined.parts[0]};queueSpeech(joined,'happy',{kind:'joined',indices:[7,9,15,17]});announce(candidate.propellerTip?(propellerLayout(joined).length?'Hélice lista · conecta una batería y abre Vuelo con clic derecho':'Primera pala colocada · acerca otro triangular al lado libre de la punta'):'Unidos · '+joined.parts.length+' '+groupUnitLabel(joined)+' · '+totalWeight(joined)+' u');if(sound)emitJoinSound(candidate.face?.p||position);return joined;
}
function applyOrientation(g,desired,strength=160,inertia=g.body.inertia){
 const b=g.body;let error=desired.mult(b.quaternion.inverse());if(error.w<0)error.set(-error.x,-error.y,-error.z,-error.w);
 const vector=V(error.x,error.y,error.z),length=vector.norm();if(length>1e-8)vector.scale(2*Math.atan2(length,clamp(error.w,-1,1))/length,vector);
 const local=b.quaternion.inverse().vmult(vector),omega=b.quaternion.inverse().vmult(b.angularVelocity),torque=V();
 for(const k of ['x','y','z'])torque[k]=inertia[k]*(local[k]*strength-omega[k]*2*Math.sqrt(strength));
 b.torque.vadd(b.quaternion.vmult(torque),b.torque);
 const grip=held&&(held.items||[held]).find(item=>item.g===g);
 if(grip){const offset=b.quaternion.vmult(grip.anchor);b.torque.vsub(offset.cross(V(0,b.mass*settings.gravity,0)),b.torque);}
}
// Clamp the attachment using the entire shape, including its requested rotation.
function safeGripTarget(item,target,quaternions){
 const result=target.clone(),low=V(-Infinity,-Infinity,-Infinity),high=V(Infinity,Infinity,Infinity);
 const visited=new Set(),tree=!coolers.length&&!activePressureButtons().length?gripDrivenTree(item):null;
 for(const q of quaternions){
  const key=q.x+','+q.y+','+q.z+','+q.w;if(visited.has(key))continue;visited.add(key);
  const anchor=q.vmult(item.anchor),center=sub(target,anchor);
  if(tree){const bb=gripTreeBounds(tree,V(),q);for(const k of ['x','y','z']){const floor=k==='y'?.008:-ROOM_SIZE/2+.003,ceiling=k==='y'?ROOM_HEIGHT-.003:ROOM_SIZE/2-.003;low[k]=Math.max(low[k],floor-bb.min[k]+anchor[k]);high[k]=Math.min(high[k],ceiling-bb.max[k]+anchor[k]);}continue;}
  for(const pose of gripDrivenPoses(item,V(),q)){
   const bb=physicalGroupBounds(pose.g,pose.p,pose.q),support=.008+alphaSupport(pose.g,add(center,pose.p),pose.q);
   for(const k of ['x','y','z']){const floor=k==='y'?support:-ROOM_SIZE/2+.003,ceiling=k==='y'?ROOM_HEIGHT-.003:ROOM_SIZE/2-.003;
    low[k]=Math.max(low[k],floor-bb.min[k]+anchor[k]);high[k]=Math.min(high[k],ceiling-bb.max[k]+anchor[k]);
   }
  }
 }
 for(const k of ['x','y','z'])result[k]=clamp(result[k],low[k],high[k]);return result;
}
// A grab is a physical constraint, but its invisible target must not cross a
// solid. Otherwise the solver keeps pulling through a table and stores a large
// correction that throws the part when the contact finally separates.
function gripPenetration(a,b){
 const aa=convexPoseGeometry(a),bb=convexPoseGeometry(b);let depth=Infinity;
 for(const axis of [...aa.normals,...bb.normals,...aa.edges.flatMap(x=>bb.edges.map(y=>x.cross(y)))]){
  if(axis.norm2()<1e-14)continue;axis.normalize();let amin=Infinity,amax=-Infinity,bmin=Infinity,bmax=-Infinity;
  for(const v of aa.vertices){const d=v.dot(axis);amin=Math.min(amin,d);amax=Math.max(amax,d);}for(const v of bb.vertices){const d=v.dot(axis);bmin=Math.min(bmin,d);bmax=Math.max(bmax,d);}
  if(amax<=bmin||bmax<=amin)return 0;depth=Math.min(depth,amax-bmin,bmax-amin);
 }return depth;
}
// During a translation, SAT axes and projected spans stay fixed. Prepare
// their signed gaps once per candidate pair, then test only the displacement.
// Keep every axis even if originally separated: that gap can close in a sweep.
function gripTranslationContact(first,second){
 const aa=first.geometry||=convexPoseGeometry(first.pose),bb=second.geometry||=convexPoseGeometry(second.pose),intervals=[];let depth=Infinity;
 for(const rawAxis of [...aa.normals,...bb.normals,...aa.edges.flatMap(x=>bb.edges.map(y=>x.cross(y)))]){
  if(rawAxis.norm2()<1e-14)continue;const axis=rawAxis.clone();axis.normalize();let amin=Infinity,amax=-Infinity,bmin=Infinity,bmax=-Infinity;
  for(const v of aa.vertices){const d=v.dot(axis);amin=Math.min(amin,d);amax=Math.max(amax,d);}for(const v of bb.vertices){const d=v.dot(axis);bmin=Math.min(bmin,d);bmax=Math.max(bmax,d);}
  const forward=amax-bmin,backward=bmax-amin;depth=Math.min(depth,forward,backward);intervals.push({axis,forward,backward});
 }return {intervals,depth:Math.max(0,depth)};
}
function gripTranslatedDepth(contact,shift){
 let depth=Infinity;for(const {axis,forward,backward}of contact.intervals){const d=axis.dot(shift);depth=Math.min(depth,forward+d,backward-d);if(depth<=.00035)return 0;}return depth;
}
// One immutable geometry snapshot per grab update. All anchors inspect the
// same complete mechanism; SAT spans are shared, not rebuilt for each roller.
let gripFrameSnapshot=null;
function gripDrivenGroups(item){return [item.g,...(held?.items||[]).filter(other=>other.passiveGrip&&!other.g.virtualConveyor&&other.gripDriver===item.g).map(other=>other.g)];}
function gripDrivenPoses(item,p=item.g.body.position,q=item.g.body.quaternion){
 const body=item.g.body,delta=q.mult(body.quaternion.inverse());
 return gripDrivenGroups(item).map(g=>g===item.g?{g,p,q}:{g,p:add(p,delta.vmult(sub(g.body.position,body.position))),q:delta.mult(g.body.quaternion)});
}
function gripDrivenInertia(item){
 const body=item.g.body,inertia=body.inertia.clone(),inverse=body.quaternion.inverse();
 for(const g of gripDrivenGroups(item))if(g!==item.g){const offset=inverse.vmult(sub(g.body.position,body.position)),q=inverse.mult(g.body.quaternion),localAxes=axes.map(axis=>q.vmult(axis));
  for(const [i,k]of ['x','y','z'].entries())inertia[k]+=localAxes.reduce((sum,axis,j)=>sum+axis[k]*axis[k]*g.body.inertia[['x','y','z'][j]],0)+g.body.mass*(offset.norm2()-offset[k]*offset[k]);
 }return inertia;
}
function gripAssemblySnapshot(item){
 if(gripFrameSnapshot?.snapshot)return gripFrameSnapshot.snapshot;
 const members=(held?.items||[item]).map(x=>x.g).filter(g=>!g.virtualConveyor),excluded=new Set(members),ranges=new Map(),entries=[],owners=[],boxes=new Map(),obstacles=[];
 for(const g of members){const first=entries.length;entries.push(...rigidCollisionParts(g),...conveyorGroupSurfaces(g).map(collisionEntry));ranges.set(g,{first,last:entries.length});for(let i=first;i<entries.length;i++)owners[i]=g;boxes.set(g,physicalGroupBounds(g));}
 for(const wall of [...(puzzle.active?puzzle.walls:[]),...storyWorld.walls])obstacles.push({bb:wall,entries:[collisionEntry({p:wall.p,q:wall.q||Q(),half:wall.half})]});
 for(const c of cargos)obstacles.push({bb:cargoBounds(c),entries:[collisionEntry(cargoPose(c))]});
 for(const g of groups)if(!g.virtualConveyor&&!excluded.has(g))obstacles.push({bb:physicalGroupBounds(g),g});
 const snapshot={members,ranges,entries,owners,boxes,obstacles,penetrations:new Map(),translations:new Map()};if(gripFrameSnapshot)gripFrameSnapshot.snapshot=snapshot;return snapshot;
}
function gripDrivenTree(item){
 const driven=gripDrivenGroups(item);if(driven.length===1)return null;
 const snapshot=gripAssemblySnapshot(item),trees=snapshot.drivenTrees||=new Map();if(trees.has(item.g))return trees.get(item.g);
 const inverse=item.g.body.quaternion.inverse(),origin=item.g.body.position,points=[];
 for(const g of driven){const {first,last}=snapshot.ranges.get(g);for(let i=first;i<last;i++)for(const vertex of corners(snapshot.entries[i].pose)){const point=inverse.vmult(sub(vertex,origin));points.push({min:point,max:point});}}
 const tree=collisionIndex(points);trees.set(item.g,tree);return tree;
}
function gripTreeBounds(tree,p,q){
 const {x,y,z,w}=q,rows=[[w*w+x*x-y*y-z*z,2*(x*y-w*z),2*(x*z+w*y)],[2*(x*y+w*z),w*w-x*x+y*y-z*z,2*(y*z-w*x)],[2*(x*z-w*y),2*(y*z+w*x),w*w-x*x-y*y+z*z]],min=V(),max=V();
 for(let i=0;i<3;i++){const [dx,dy,dz]=rows[i],k=['x','y','z'][i];min[k]=p[k]-localBoundsSupport(tree,-dx,-dy,-dz);max[k]=p[k]+localBoundsSupport(tree,dx,dy,dz);}return {min,max};
}
function gripCollisionContext(item,region){
 const assembly=gripAssemblySnapshot(item),driven=new Set(gripDrivenGroups(item)),sharedBounds={min:V(Infinity,Infinity,Infinity),max:V(-Infinity,-Infinity,-Infinity)},bb=physicalGroupBounds(item.g);
 for(const g of assembly.members){const surface=assembly.boxes.get(g);for(const k of ['x','y','z']){if(!driven.has(g)){sharedBounds.min[k]=Math.min(sharedBounds.min[k],surface.min[k]);sharedBounds.max[k]=Math.max(sharedBounds.max[k],surface.max[k]);}bb.min[k]=Math.min(bb.min[k],surface.min[k]);bb.max[k]=Math.max(bb.max[k],surface.max[k]);if(region){region.min[k]=Math.min(region.min[k],surface.min[k]-.1);region.max[k]=Math.max(region.max[k],surface.max[k]+.1);}}}
 const obstacles=assembly.obstacles.filter(o=>!region||boundsOverlap(region,o.bb));
 for(const o of obstacles)if(!o.entries)o.entries=rigidCollisionParts(o.g).concat(conveyorGroupSurfaces(o.g).map(collisionEntry));
 return {item,assembly,obstacles,driven,drivenTree:gripDrivenTree(item),sharedBounds,source:assembly.entries,penetrations:assembly.penetrations,translations:assembly.translations,bb};
}
function gripPoseClear(context,p,q){
 const {item,obstacles,assembly,sharedBounds,driven}=context,bb=context.drivenTree?gripTreeBounds(context.drivenTree,p,q):physicalGroupBounds(item.g,p,q),shift=sub(p,item.g.body.position);
 let drivenPoses=null;
 if(assembly.members.length>1)for(const k of ['x','y','z']){bb.min[k]=Math.min(bb.min[k],sharedBounds.min[k]+shift[k]);bb.max[k]=Math.max(bb.max[k],sharedBounds.max[k]+shift[k]);}
 if(bb.min.y<Math.min(-.0003,context.bb.min.y)-1e-7||bb.max.y>ROOM_HEIGHT-.001||Math.max(Math.abs(bb.min.x),Math.abs(bb.max.x),Math.abs(bb.min.z),Math.abs(bb.max.z))>ROOM_SIZE/2-.001)return false;
 if(coolers.length){drivenPoses=gripDrivenPoses(item,p,q);if(drivenPoses.some(pose=>!alphaPoseClear(pose.g,pose.p,pose.q)))return false;}
 const nearby=obstacles.filter(o=>boundsOverlap(bb,o.bb));if(!nearby.length)return true;
 const current=item.g.body.quaternion,translation=q.x===current.x&&q.y===current.y&&q.z===current.z&&q.w===current.w,zero=V();
 let next=context.source;if(!translation){next=next.slice();drivenPoses||=gripDrivenPoses(item,p,q);for(const pose of drivenPoses){const {first,last}=assembly.ranges.get(pose.g),moved=rigidQueryPoses(pose.g,pose.p,pose.q).concat(conveyorGroupSurfaces(pose.g,pose.p,pose.q)).map(collisionEntry);for(let i=first;i<last;i++)next[i]=moved[i-first];}}
 for(const obstacle of nearby){const index=collisionIndex(obstacle.entries);for(let i=0;i<next.length;i++){
  const entry=next[i],moved=translation||!driven.has(assembly.owners[i]),delta=moved?shift:zero;
  if(collisionIndexSome(index,entry,other=>{
   if(translation){
    let pairs=context.translations.get(other);if(!pairs){pairs=new Map();context.translations.set(other,pairs);}
    let contact=pairs.get(i);if(!contact){contact=gripTranslationContact(entry,other);pairs.set(i,contact);}
    const after=gripTranslatedDepth(contact,shift);return !!after&&(contact.depth<.00035||after>contact.depth+1e-7);
   }
   const pose=moved?{...entry.pose,p:add(entry.pose.p,delta)}:entry.pose,after=gripPenetration(pose,other.pose);if(after<=.00035)return false;
   let before=context.penetrations.get(other);if(!before){before=new Map();context.penetrations.set(other,before);}
   if(!before.has(i))before.set(i,gripPenetration(context.source[i].pose,other.pose));
   const depth=before.get(i);return depth<.00035||after>depth+1e-7;
  },delta))return false;
 }}return true;
}
function safeGripSweep(item,target){
 const b=item.g.body,q=b.quaternion,anchor=q.vmult(item.anchor),start=add(b.position,anchor),bb=physicalGroupBounds(item.g),context=gripCollisionContext(item,{min:sub(bb.min,V(.1,.1,.1)),max:add(bb.max,V(.1,.1,.1))});
 let wanted=target.clone(),delta=sub(wanted,start);const distance=delta.norm();
 // Bound target lag as well as its per-frame speed. A blocked hand cannot leave
 // a spring target on the far side of a thin shelf or another body.
 if(distance>.09)wanted=add(start,mul(delta,.09/distance));
 const sweep=(from,to)=>{const change=sub(to,from),steps=Math.max(1,Math.ceil(change.norm()/.006));let safe=from.clone();
  for(let i=1;i<=steps;i++){const candidate=add(from,mul(change,i/steps));if(!gripPoseClear(context,sub(candidate,anchor),q)){
    let low=safe,high=candidate;for(let j=0;j<8;j++){const mid=mul(add(low,high),.5);if(gripPoseClear(context,sub(mid,anchor),q))low=mid;else high=mid;}return low;
   }safe=candidate;}return safe;
 };
 let safe=sweep(start,wanted);
 // Preserve tangential motion along the tabletop instead of sticking whenever
 // the player's view also asks for a small downward movement.
 for(const k of ['x','z','y']){const slide=safe.clone();slide[k]=wanted[k];safe=sweep(safe,slide);}
 return safe;
}
function gripRotationRadius(g){
 const sources=conveyors.filter(c=>c.surfaceBody===g.body).map(c=>c.surfaces),cache=g.gripRadiusCache;
 if(cache&&cache.parts===g.parts&&cache.sources.length===sources.length&&sources.every((s,i)=>s===cache.sources[i]))return cache.radius;
 const radius=Math.max(...physicalGroupPoses(g,V(),Q()).flatMap(corners).map(v=>v.norm()));g.gripRadiusCache={parts:g.parts,sources,radius};return radius;
}
function safeGripRotation(item,desired){
 const b=item.g.body,dot=Math.min(1,Math.abs(b.quaternion.x*desired.x+b.quaternion.y*desired.y+b.quaternion.z*desired.z+b.quaternion.w*desired.w)),angle=2*Math.acos(dot);if(angle<1e-7)return desired;
 let radius=gripRotationRadius(item.g);for(const g of gripDrivenGroups(item))if(g!==item.g){const box=physicalGroupBounds(g),x=Math.max(Math.abs(box.min.x-b.position.x),Math.abs(box.max.x-b.position.x)),y=Math.max(Math.abs(box.min.y-b.position.y),Math.abs(box.max.y-b.position.y)),z=Math.max(Math.abs(box.min.z-b.position.z),Math.abs(box.max.z-b.position.z));radius=Math.max(radius,Math.hypot(x,y,z));}
 const extent=V(radius,radius,radius),context=gripCollisionContext(item,{min:sub(b.position,extent),max:add(b.position,extent)});
 // Bound the entire shortest-arc rotation, not just its endpoints. For an
 // axis u and any vertex within radius r, coordinate k moves by at most
 // 2*r*sin(angle/2)*sqrt(1-u[k]^2). Yaw therefore needs no vertical padding.
 // Near solids/floor/coolers retain the exact sampled sweep below.
 if(!coolers.length){
  const turn=desired.mult(b.quaternion.inverse());if(turn.w<0)turn.set(-turn.x,-turn.y,-turn.z,-turn.w);const axis=V(turn.x,turn.y,turn.z);axis.normalize();
  const envelope={min:V(Infinity,Infinity,Infinity),max:V(-Infinity,-Infinity,-Infinity)},travel=2*radius*Math.sin(angle/2);
  for(const g of context.driven){const box=context.assembly.boxes.get(g);for(const k of ['x','y','z']){envelope.min[k]=Math.min(envelope.min[k],box.min[k]);envelope.max[k]=Math.max(envelope.max[k],box.max[k]);}}
  for(const k of ['x','y','z']){const padding=travel*Math.sqrt(Math.max(0,1-axis[k]*axis[k]))+1e-8;envelope.min[k]-=padding;envelope.max[k]+=padding;}
  if(envelope.min.y>=Math.min(-.0003,context.bb.min.y)-1e-7&&envelope.max.y<=ROOM_HEIGHT-.001&&Math.max(Math.abs(envelope.min.x),Math.abs(envelope.max.x),Math.abs(envelope.min.z),Math.abs(envelope.max.z))<=ROOM_SIZE/2-.001&&!context.obstacles.some(obstacle=>boundsOverlap(envelope,obstacle.bb)))return desired;
 }
 const steps=Math.max(1,Math.min(96,Math.ceil(angle*Math.max(radius,HALF)/.006)));let safe=b.quaternion.clone();
 for(let i=1;i<=steps;i++){const q=slerp(b.quaternion,desired,i/steps);if(!gripPoseClear(context,b.position,q))break;safe=q;}return safe;
}
function updateGrab(dt){
 if(!held)return;held.age+=dt;gripFrameSnapshot=story.dockCandidate?null:{};
 const grabSpeed=savedPreferences.grabSpeed||1;
 if(shiftDown()){
  const tilt=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),turn=Number(keys.has('KeyA'))-Number(keys.has('KeyD'));
  if(tilt||turn){const axis=add(mul(held.tiltAxis||V(1,0,0),tilt),V(0,turn,0));axis.normalize();const q=Q();q.setFromAxisAngle(axis,dt*settings.rotationSpeed*(savedPreferences.invertPieceRotation?-1:1));held.rotation=q.mult(held.rotation);}
 }
 const rootTarget=campaignDockTarget(tutorialGripTarget(add(add(V(...camera),mul(direction(),held.distance)),held.rootOffset||V()))),rotationDelta=held.rotation.mult(held.initialRotation.inverse());
 const snapPoses=snap&&snap.source===held.g?mechanismSnapPoses(held.g,snap.position,snap.quaternion):[];
 for(const item of held.items||[held]){
  const b=item.g.body;b.wakeUp();b.angularDamping=.85+settings.grip*.1499;
  if(item.passiveGrip){item.floorLocked=false;if(!item.g.virtualConveyor&&b.fixedRotation){b.fixedRotation=false;b.updateMassProperties();}continue;}
  let target=add(rootTarget,rotationDelta.vmult(item.relative||V())),desired=null,strength=160;
  const snapped=snapPoses.find(pose=>pose.g===item.g);
  if(snapped){target=add(snapped.p,snapped.q.vmult(item.anchor));desired=snapped.q;item.restQ=null;}
  else if(story.dockCandidate&&item.g===held.g){desired=story.dockCandidate.quaternion;item.restQ=null;}
  else if(shiftDown()){desired=rotationDelta.mult(item.initialQ||held.initialRotation);item.restQ=null;}
  else if(held.stable||held.age>.22){if(!item.restQ)item.restQ=held.stable?rotationDelta.mult(item.initialQ):b.quaternion.clone();desired=item.restQ;strength=held.stable?160:30+settings.grip*35;}
  const rotations=[b.quaternion];
  if(desired){for(let i=1;i<=8;i++)rotations.push(slerp(b.quaternion,desired,i/8));}
  target=safeGripTarget(item,target,rotations);
  const currentFloor=physicalGroupBounds(item.g).min.y;
  const turning=shiftDown()||!!snap,turnClear=desired?physicalGroupBounds(item.g,b.position,desired).min.y>=.004:true;
  const docking=!!story.dockCandidate&&item.g===held.g;
  if(docking){b.quaternion.copy(slerp(b.quaternion,story.dockCandidate.quaternion,1-Math.exp(-8*dt)));b.aabbNeedsUpdate=true;}
  const lockFloor=docking||currentFloor<.015&&(!turning||!turnClear);
  if(b.fixedRotation!==lockFloor){b.fixedRotation=lockFloor;b.updateMassProperties();}
  item.floorLocked=lockFloor;if(lockFloor){b.angularVelocity.set(0,0,0);b.torque.set(0,0,0);if(!turning)item.restQ=b.quaternion.clone();}
  if(desired&&!lockFloor){
   applyOrientation(item.g,safeGripRotation(item,desired),strength,gripDrivenInertia(item));
  }
  if(item.anchorBody){
   const delta=sub(target,item.anchorBody.position),distance=delta.norm(),step=Math.min(distance*(1-Math.exp(-16*grabSpeed*dt)),2.8*grabSpeed*dt);
   if(distance>1e-8)item.anchorBody.position.vadd(mul(delta,step/distance),item.anchorBody.position);
   item.anchorBody.position.copy(safeGripSweep(item,safeGripTarget(item,item.anchorBody.position,[b.quaternion])));
   const force=manualGripForce(held.weight)*gripDrivenGroups(item).reduce((sum,g)=>sum+workshopGrip(g)*g.body.mass,0)/(held.weight*.25);
   // Match the physical body's positional response to the faster hand target.
   // Keep the original coefficients once: switching back to slow is exact, and
   // repeated frames never compound the multiplier or increase the grip force.
   item.gripResponseBase||=item.joint.equations.map(equation=>equation.a);
   for(let i=0;i<item.joint.equations.length;i++){const equation=item.joint.equations[i];equation.a=item.gripResponseBase[i]*grabSpeed;equation.maxForce=force;equation.minForce=-force;}
  }
 }
 gripFrameSnapshot=null;
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
function startRoute(g,goal,quiet=false,remember=!quiet){
 if(!quiet)automationIntervention();
 if(!g||!groups.includes(g))return false;
 if(g.parts.some(p=>p.mood?.externalBattery)){if(!quiet)announce('La batería es pasiva: muévela a mano o móntala en un vehículo.');return false;}
 if(g.parts.some(p=>p.mood.production)){if(!quiet)announce('La materia se transporta con la línea, no recibe órdenes.');return false;}
 if(rotorForGroup(g)){if(!quiet)announce('Separa el rotor antes de asignar un recorrido.');return false;}
 const wasBlocked=g.pendingMoodOrder?.reason==='bloqueo',changed=!!g.route;
 if(held&&(held.items||[held]).some(item=>item.g===g)){announce('Suelta la estructura antes de marcar su recorrido.');return false;}
 const bb=bounds(g);if(bb.min.y>.025){if(!quiet)announce('Deja la pieza en el piso antes de darle un destino.');return false;}
 if(remember)rememberMechanismRun(g,'route',g,goal);
 if(!groupWilling(g)){queueMoodRoute(g,goal);if(!quiet)announce('Necesita descansar · la orden queda pendiente.');return true;}
 stopRoute(g);goal=goal.clone();const source=g.body.position.clone(),sourceQ=g.body.quaternion.clone();
 const pending={goal,reason:'planning',nextTry:Infinity};g.pendingMoodOrder=pending;g.pin={point:goal.clone(),arrived:false};
 g.routeSearch=scheduleNavigation(g,planRoute(g,goal),plan=>{
  g.routeSearch=null;
  if(!plan){if(Math.max(Math.abs(goal.x),Math.abs(goal.z))<13.9)queueMoodRoute(g,goal,'bloqueo');else g.pendingMoodOrder=null;if(!quiet)announce('Camino bloqueado · esperará a que haya paso. Detener selección cancela la orden.');return;}
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
function cubeIsHeld(g){return !!held&&(held.items||[held]).some(item=>item.g===g);}
function emitCubeFootstep(g){if(!cubeIsHeld(g)&&!g.storyFloat)window.QBitsFootsteps?.step(g);}
function* walkingAudioGroups(){
 for(const g of groups)if((g.route||g.haulJob&&Math.hypot(g.body.velocity.x,g.body.velocity.z)>.015)&&!cubeIsHeld(g)&&!g.storyFloat)yield {key:g,position:g.body.position};
}
function recordHaulFootstep(slot,grounded){
 const p=slot.g.body.position,old=slot.footstepPosition;
 if(!old){slot.footstepPosition={x:p.x,z:p.z};slot.footstepDistance=0;return;}
 const distance=Math.hypot(p.x-old.x,p.z-old.z);old.x=p.x;old.z=p.z;
 // Actual ground travel, not pushing force, elapsed time or a teleport.
 if(!grounded||cubeIsHeld(slot.g)||distance>.15){slot.footstepDistance=0;return;}
 slot.footstepDistance+=distance;
 if(slot.footstepDistance>=.11){slot.footstepDistance%=.11;emitCubeFootstep(slot.g);}
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
  if(s.t>=1){b.position.copy(s.endP);b.quaternion.copy(s.endQ);r.segment=null;r.index++;emitCubeFootstep(g);}
 }
}
function landingProjection(g){
 let delta=-bounds(g).min.y;
 const others=groups.filter(o=>o!==g&&!(held?.items?.some(item=>item.g===o))).flatMap(o=>poses(o)).concat(cargos.map(cargoPose));
 const solids=[...(puzzle.active?puzzle.walls:[]),...storyWorld.walls],down=V(0,-1,0);
 for(const pose of poses(g)){
  const samples=corners(pose);samples.push(pose.p);
  for(const point of samples){
   const origin=add(point,V(0,.0005,0));
   for(const other of others){const hit=rayPart(origin,down,other,30);if(hit)delta=Math.max(delta,Math.min(0,.0005-hit.distance));}
   // Use each real furniture segment, with its orientation, rather than its
   // enclosing box. The empty spaces beneath the desk and inside shelves stay open.
   for(const solid of solids){const distance=rayPuzzleBox(origin,down,solid,30);if(distance!==null)delta=Math.max(delta,Math.min(0,.0005-distance));}
  }
 }
 return {position:add(g.body.position,V(0,delta+.002,0)),delta};
}
// Electrical links deliberately never become joints: a floor reservoir adds
// charge, not mass, to a remote motor. Stored cable material stays recoverable.
const powerReservoirs=[],powerCables=[];
let powerReservoirSerial=0,powerCableSerial=0;
const POWER_RESERVOIR_CAPACITY=180000;
function powerVector(value){
 const a=Array.isArray(value)?value:value&&[value.x,value.y,value.z];
 return a?.length===3&&a.every(Number.isFinite)?V(...a):null;
}
function powerEndpoint(value){
 if(!value||!['part','reservoir'].includes(value.kind)||!Number.isSafeInteger(value.id)||value.id<1)return null;
 return {kind:value.kind,id:value.id};
}
function powerEndpointKey(value){return value.kind+':'+value.id;}
function powerReservoirCell(part){return powerReservoirs.find(r=>r.cell===part)||null;}
function powerPartConnectable(hit){
 if(!hit)return false;
 // Every articulated group owns its coupler; inspect the local rigid body
 // instead of walking the entire hinge graph for every rendered cable end.
 return hit.g.parts.some(p=>unitShape(p)==='coupler'||isExternalBattery(p)||p.mood?.gripper||p.mood?.flight);
}
function powerPort(endpoint){
 const e=powerEndpoint(endpoint);if(!e)return null;
 if(e.kind==='reservoir'){const r=powerReservoirs.find(r=>r.id===e.id);return r?add(r.p,V(.19,.35,.341)):null;}
 const hit=rotorPart(e.id);return powerPartConnectable(hit)?add(hit.p,hit.q.vmult(V(0,0,HALF+.004))):null;
}
function powerReservoirPlacement(p){
 const point=powerVector(p);if(!point||Math.abs(point.y)>.02||Math.abs(point.x)>.5*ROOM_SIZE-.42||Math.abs(point.z)>.5*ROOM_SIZE-.42)return null;
 point.y=0;const half=V(.39,.95,.39),center=add(point,V(0,.95,0)),box={p:center,q:Q(),half,min:sub(center,half),max:add(center,half)};
 if(storyWorld.walls.some(w=>obbOverlap(box,{p:w.p,q:w.q||Q(),half:w.half}))||groups.some(g=>boundsOverlap(box,bounds(g)))||cargos.some(c=>Math.abs(c.body.position.x-point.x)<.39+c.size/2&&Math.abs(c.body.position.z-point.z)<.39+c.size/2))return null;
 return {point,half,center};
}
function createPowerReservoir(p,options={}){
 if(powerReservoirs.length>=12)return null;
 const placement=powerReservoirPlacement(p);if(!placement)return null;
 const energy=options.energy===undefined?1:options.energy;if(!Number.isFinite(energy)||energy<0||energy>1||options.enabled!==undefined&&typeof options.enabled!=='boolean')return null;
 const id=options.id===undefined?powerReservoirSerial+1:options.id;if(!Number.isSafeInteger(id)||id<1||powerReservoirs.some(r=>r.id===id))return null;
 const wall=storyWall(placement.center,placement.half,{color:[.24,.31,.32]});wall.furniture='power-reservoir';wall.powerReservoirId=id;
 const r={id,p:placement.point,wall,capacity:POWER_RESERVOIR_CAPACITY,enabled:!!options.enabled,cell:{id:-id,powerReservoir:true,mood:{energy,idle:0,boredOnce:false}}};
 powerReservoirSerial=Math.max(powerReservoirSerial,id);powerReservoirs.push(r);redraw=true;return r;
}
function removePowerReservoir(subject){
 const r=typeof subject==='number'?powerReservoirs.find(r=>r.id===subject):subject,index=powerReservoirs.indexOf(r);if(index<0)return false;
 if(world.bodies.includes(r.wall.body))world.removeBody(r.wall.body);const wallIndex=storyWorld.walls.indexOf(r.wall);if(wallIndex>=0)storyWorld.walls.splice(wallIndex,1);
 powerReservoirs.splice(index,1);updatePowerNetwork(0);redraw=true;return true;
}
function powerCopyMaterial(part){
 if(!part||!Number.isSafeInteger(part.id)||part.id<1||(part.shape||'cube')!=='cube'||!Number.isFinite(part.weight)||part.weight<.25||part.weight>16)return null;
 if(!part.mood||typeof part.mood!=='object'||!Number.isFinite(part.mood.energy)||part.mood.energy<0||part.mood.energy>1||part.mood?.externalBattery||part.mood?.gripper||part.mood?.production||part.mood?.matter||QBitsWorkshop.hasAdaptation(part))return null;
 const p=powerVector(part.p),q=Array.isArray(part.q)?part.q:part.q&&[part.q.x,part.q.y,part.q.z,part.q.w];if(!p||q?.length!==4||!q.every(Number.isFinite)||Math.abs(q.reduce((n,v)=>n+v*v,0)-1)>.01)return null;
 const rotation=Q();rotation.set(...q);return {id:part.id,shape:'cube',weight:part.weight,p,q:rotation,mood:part.mood?JSON.parse(JSON.stringify(part.mood)):newMood(part.id)};
}
function powerCableLimit(materials){
 if(!Array.isArray(materials)||!materials.length||materials.length>8||materials.some(p=>!Number.isFinite(p.weight)||p.weight<.25||p.weight>16))return 0;
 return materials.reduce((metres,p)=>metres+p.weight*2,0);
}
function powerCablePath(cable){
 const a=powerPort(cable.from),b=powerPort(cable.to);return a&&b?[a,...cable.points.map(p=>p.clone()),b]:null;
}
function powerCableLength(points){return points?points.reduce((sum,p,i)=>sum+(i?p.distanceTo(points[i-1]):0),0):Infinity;}
function powerCableBlocked(cable,path){
 const excluded=new Set([cable.from,cable.to].filter(e=>e.kind==='reservoir').map(e=>e.id));
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],length=a.distanceTo(b);if(length<.0001)continue;const d=mul(sub(b,a),1/length);
  for(const w of [...storyWorld.walls,...(puzzle.active?puzzle.walls:[])]){
   if(excluded.has(w.powerReservoirId))continue;
   // Inset solids by 5 mm so a flat ribbon can lie on the floor/wall face.
   const half=V(Math.max(.001,w.half.x-.005),Math.max(.001,w.half.y-.005),Math.max(.001,w.half.z-.005));
   const distance=rayPuzzleBox(a,d,{p:w.p,q:w.q||Q(),half},length);
   if(distance!==null&&distance<length-.003)return true;
  }
 }
 return false;
}
function refreshPowerCable(cable){
 const path=powerCablePath(cable);cable.length=powerCableLength(path);cable.maxLength=powerCableLimit(cable.materials);
 if(!path){cable.active=false;cable.status='Extremo desconectado';return false;}
 if(cable.length>cable.maxLength+1e-5){cable.active=false;cable.status='Cable corto · añade cubos o acerca la máquina';return false;}
 const signature=path.map(p=>[p.x,p.y,p.z].map(v=>Math.round(v*10000)).join(',')).join(';')+'|'+storyWorld.walls.length;
 if(cable._pathSignature!==signature){cable._pathSignature=signature;cable._blocked=powerCableBlocked(cable,path);}
 cable.active=!cable._blocked;cable.status=cable._blocked?'Trayecto obstruido · vuelve a tender el cable':'Conectado';return cable.active;
}
function powerCableMaterials(materials,exclude=null){
 if(!Array.isArray(materials)||!materials.length||materials.length>8)return null;
 const copies=materials.map(powerCopyMaterial);if(copies.some(p=>!p)||new Set(copies.map(p=>p.id)).size!==copies.length)return null;
 const used=new Set(powerCables.filter(c=>c!==exclude).flatMap(c=>c.materials.map(p=>p.id)));return copies.some(p=>used.has(p.id))?null:copies;
}
function connectPowerCable(from,to,points=[],materials=[]){
 const a=powerEndpoint(from),b=powerEndpoint(to),fail=error=>({ok:false,error});
 if(!a||!b||!powerPort(a)||!powerPort(b))return fail('Conecta una salida de batería o máquina y una entrada de máquina.');
 if(powerEndpointKey(a)===powerEndpointKey(b))return fail('Elige dos extremos distintos.');
 if(a.kind==='part'&&b.kind==='part'&&rotorConnectedGroups([rotorPart(a.id).g]).includes(rotorPart(b.id).g))return fail('Estas piezas ya comparten la conexión interna.');
 if(powerCables.length>=128)return fail('Límite de 128 cables. Recupera un tramo antes de crear otro.');
 if(powerCables.some(c=>[c.from,c.to].some(e=>powerEndpointKey(e)===powerEndpointKey(a))&&[c.from,c.to].some(e=>powerEndpointKey(e)===powerEndpointKey(b))))return fail('Estos extremos ya tienen cable.');
 if(!Array.isArray(points)||points.length>64)return fail('El circuito supera los 64 puntos de trazado.');
 const route=points.map(powerVector);if(route.some(p=>!p||p.y<-.01||p.y>ROOM_HEIGHT||Math.abs(p.x)>.5*ROOM_SIZE||Math.abs(p.z)>.5*ROOM_SIZE))return fail('El trayecto queda fuera de la sala.');
 const copies=powerCableMaterials(materials);if(!copies)return fail('Usa de 1 a 8 cubos normales, sin repetir material.');
 const cable={id:powerCableSerial+1,from:a,to:b,points:route,materials:copies,maxLength:powerCableLimit(copies),length:0,active:false,status:'',progress:0};
 if(!refreshPowerCable(cable))return fail(cable.status);
 powerCableSerial++;powerCables.push(cable);redraw=true;return {ok:true,cable};
}
function extendPowerCable(subject,materials){
 const cable=typeof subject==='number'?powerCables.find(c=>c.id===subject):subject;if(!powerCables.includes(cable))return {ok:false,error:'Cable no encontrado.'};
 const copies=powerCableMaterials([...cable.materials,...(Array.isArray(materials)?materials:[])],cable);
 if(!copies||!materials?.length)return {ok:false,error:'El cable admite hasta 8 cubos normales, sin material repetido.'};
 cable.materials=copies;cable._pathSignature=null;refreshPowerCable(cable);redraw=true;return {ok:true,cable};
}
function reroutePowerCable(subject,to,points=[]){
 const cable=typeof subject==='number'?powerCables.find(c=>c.id===subject):subject,b=powerEndpoint(to);
 if(!powerCables.includes(cable)||!b||!powerPort(b)||!powerPort(cable.from)||powerEndpointKey(cable.from)===powerEndpointKey(b))return {ok:false,error:'Elige un extremo disponible.'};
 if(cable.from.kind==='part'&&b.kind==='part'&&rotorConnectedGroups([rotorPart(cable.from.id).g]).includes(rotorPart(b.id).g))return {ok:false,error:'Estas piezas ya comparten la conexión interna.'};
 if(powerCables.some(c=>c!==cable&&[c.from,c.to].some(e=>powerEndpointKey(e)===powerEndpointKey(cable.from))&&[c.from,c.to].some(e=>powerEndpointKey(e)===powerEndpointKey(b))))return {ok:false,error:'Estos extremos ya tienen cable.'};
 const route=Array.isArray(points)&&points.length<=64?points.map(powerVector):null;
 if(!route||route.some(p=>!p||p.y<-.01||p.y>ROOM_HEIGHT||Math.abs(p.x)>.5*ROOM_SIZE||Math.abs(p.z)>.5*ROOM_SIZE))return {ok:false,error:'El trayecto queda fuera de la sala.'};
 const draft={...cable,to:b,points:route,_pathSignature:null};if(!refreshPowerCable(draft))return {ok:false,error:draft.status};
 Object.assign(cable,draft,{progress:0});redraw=true;return {ok:true,cable};
}
function removePowerCable(subject){
 const cable=typeof subject==='number'?powerCables.find(c=>c.id===subject):subject,index=powerCables.indexOf(cable);if(index<0)return [];
 powerCables.splice(index,1);clearPowerRibbonCache(cable);redraw=true;return cable.materials.map(powerCopyMaterial);
}
function updatePowerNetwork(dt){
 if(mechanicalStepCache)mechanicalStepCache.electricalGraph=null;
 const seconds=Number.isFinite(dt)?Math.max(0,dt):0;
 for(const c of powerCables){if(!seconds)c._pathSignature=null;refreshPowerCable(c);c.progress=Math.min(1,c.progress+seconds*1.8);}
}
function powerElectricalGraph(){
 if(mechanicalStepCache?.electricalGraph)return mechanicalStepCache.electricalGraph;
 const graph={groups:new Map(),members:new Map(),edges:new Map(),supplies:new Map()};
 graph.groupNode=g=>{
  if(graph.groups.has(g))return graph.groups.get(g);
  const component=rotorConnectedGroups([g]);if(!component.length)return null;
  const node=component[0];graph.members.set(node,component);for(const member of component)graph.groups.set(member,node);return node;
 };
 graph.endpointNode=e=>e.kind==='reservoir'?powerReservoirs.find(r=>r.id===e.id)||null:graph.groupNode(rotorPart(e.id)?.g);
 for(const cable of powerCables){
  if(!refreshPowerCable(cable))continue;const a=graph.endpointNode(cable.from),b=graph.endpointNode(cable.to);if(!a||!b||a===b)continue;
  if(!graph.edges.has(a))graph.edges.set(a,new Set());if(!graph.edges.has(b))graph.edges.set(b,new Set());graph.edges.get(a).add(b);graph.edges.get(b).add(a);
 }
 if(mechanicalStepCache)mechanicalStepCache.electricalGraph=graph;return graph;
}
function getCableSupply(subject){
 const graph=powerElectricalGraph(),seeds=externalBatteryComponent(subject),result=new Map();
 for(const seed of seeds){
  const first=graph.groupNode(seed);let cells=graph.supplies.get(first);
  if(!cells){
   const reached=new Set([first]),queue=[first];for(let i=0;i<queue.length;i++)for(const next of graph.edges.get(queue[i])||[])if(!reached.has(next)){reached.add(next);queue.push(next);}
   const found=new Map();for(const node of reached){
    if(graph.members.has(node)){for(const g of graph.members.get(node))for(const part of g.parts)if(externalBatteryState(part)?.enabled)found.set(part.id,part);}
    else if(powerReservoirs.includes(node)&&node.enabled)found.set(node.cell.id,node.cell);
   }
   cells=[...found.values()].sort((a,b)=>a.id-b.id);for(const node of reached)graph.supplies.set(node,cells);
  }
  for(const cell of cells)result.set(cell.id,cell);
 }
 return [...result.values()].sort((a,b)=>a.id-b.id);
}
function powerGroupCabled(group){
 if(!powerCables.length)return false;const graph=powerElectricalGraph();return !!graph.edges.get(graph.groupNode(group))?.size;
}
function serializePowerNetwork(){
 return {version:1,reservoirs:powerReservoirs.map(r=>({id:r.id,p:[r.p.x,r.p.y,r.p.z],energy:r.cell.mood.energy,enabled:r.enabled})),cables:powerCables.map(c=>({id:c.id,from:{...c.from},to:{...c.to},points:c.points.map(p=>[p.x,p.y,p.z]),materials:c.materials.map(p=>({...powerCopyMaterial(p),p:[p.p.x,p.p.y,p.p.z],q:[p.q.x,p.q.y,p.q.z,p.q.w]}))}))};
}
function clearPowerNetwork(){
 clearPowerRibbonCache();powerCables.length=0;for(const r of [...powerReservoirs])removePowerReservoir(r);powerReservoirSerial=0;powerCableSerial=0;
}
function restorePowerNetwork(saved){
 clearPowerNetwork();if(!saved||saved.version!==1||!Array.isArray(saved.reservoirs)||!Array.isArray(saved.cables)||saved.reservoirs.length>12||saved.cables.length>128)return false;
 for(const r of saved.reservoirs)if(!createPowerReservoir(r.p,{id:r.id,energy:r.energy,enabled:r.enabled})){clearPowerNetwork();return false;}
 const used=new Set(groups.flatMap(g=>g.parts.map(p=>p.id)));
 for(const record of saved.cables){
  const a=powerEndpoint(record.from),b=powerEndpoint(record.to),materials=powerCableMaterials(record.materials),points=Array.isArray(record.points)&&record.points.length<=64?record.points.map(powerVector):null;
  if(!a||!b||powerEndpointKey(a)===powerEndpointKey(b)||!materials||!points||points.some(p=>!p||p.y<-.01||p.y>ROOM_HEIGHT||Math.abs(p.x)>.5*ROOM_SIZE||Math.abs(p.z)>.5*ROOM_SIZE)||materials.some(p=>used.has(p.id))||!Number.isSafeInteger(record.id)||record.id<1||powerCables.some(c=>c.id===record.id)){
   clearPowerNetwork();return false;
  }
  // Broken/moved endpoints are kept as inactive wire, so recovering the lab
  // never silently destroys the cubes used to make it.
  const cable={id:record.id,from:a,to:b,points,materials,maxLength:powerCableLimit(materials),length:0,active:false,status:'',progress:1};powerCables.push(cable);refreshPowerCable(cable);powerCableSerial=Math.max(powerCableSerial,cable.id);
  for(const p of materials){used.add(p.id);serial=Math.max(serial,p.id);}
 }
 return true;
}

// A wire is made from real cubes; drafting is reversible until the last click.
let powerDraft=null,powerModelCache=null;
const powerRibbonCaches=new Map();
function clearPowerRibbonCache(cable=null){for(const [key,mesh]of powerRibbonCaches)if(!cable||key===cable){deleteRenderBuffer(mesh.buffer);powerRibbonCaches.delete(key);}boundGeometry=null;}
function powerMaterialGroups(list){
 const picked=[...new Set(list)].filter(g=>groups.includes(g)),parts=picked.flatMap(g=>worldParts(g));
 if(!picked.length||!parts.length||parts.length>8||picked.some(g=>rotorForGroup(g)||g.robotHeld||g.blueprintJob||g.cooler||g.parts.some(p=>p.mood.flight))||parts.some(p=>!powerCopyMaterial(p)))return null;
 return {groups:picked,materials:parts};
}
function beginPowerCable(list){
 if(story.scene!=='lab'||puzzle.active||held)return false;
 const source=powerMaterialGroups(list);if(!source){announce('Usa de 1 a 8 cubos normales, sueltos o unidos, sin mecanismos ni adaptaciones.');return false;}
 for(const g of source.groups){stopRoute(g);leaveHaul(g);}
 powerDraft={...source,from:null,bends:[],existing:null};clearSelection();captureMouse();
 announce('Cable · apunta a una batería o máquina y haz clic para fijar la salida. Esc cancela sin gastar cubos.');return true;
}
function cancelPowerCable(){if(!powerDraft)return false;powerDraft=null;redraw=true;return true;}
function powerDraftMaterials(){
 if(!powerDraft)return null;if(powerDraft.existing)return powerCables.includes(powerDraft.existing)?powerDraft.existing.materials:null;
 const current=powerMaterialGroups(powerDraft.groups);return current&&current.materials.length===powerDraft.materials.length&&current.materials.every(p=>powerDraft.materials.some(old=>old.id===p.id))?current.materials:null;
}
function powerFloor(p){return V(p.x,.008,p.z);}
function powerSurfaceRoute(from,to,bends=[]){
 return powerCircuitRoute(powerPort(from),powerPort(to),bends);
}
function powerCircuitRoute(start,finish,bends=[],surfaceEnd=false){
 if(!start||!finish)return [];
 const route=[powerFloor(start)];
 for(const point of (surfaceEnd?[...bends,finish]:bends)){const previous=route[route.length-1],wallA=Math.abs(previous.x)>.5*ROOM_SIZE-.03||Math.abs(previous.z)>.5*ROOM_SIZE-.03,wallB=Math.abs(point.x)>.5*ROOM_SIZE-.03||Math.abs(point.z)>.5*ROOM_SIZE-.03,sameWall=wallA&&wallB&&(Math.abs(previous.x-point.x)<.025||Math.abs(previous.z-point.z)<.025);
  if(!sameWall){if(previous.y>.02)route.push(powerFloor(previous));if(point.y>.02)route.push(powerFloor(point));}route.push(point.clone());
 }
 if(!surfaceEnd){if(route[route.length-1].y>.02)route.push(powerFloor(route[route.length-1]));route.push(powerFloor(finish));}
 // Cardinal elbows match the cube route grid. Explicit surface supports stay
 // fixed; old saved cable geometry is never silently lengthened on restore.
 const circuit=[route[0]];
 for(const point of route.slice(1)){const cursor=circuit[circuit.length-1].clone();for(const axis of ['x','z','y'])if(Math.abs(cursor[axis]-point[axis])>1e-6){cursor[axis]=point[axis];circuit.push(cursor.clone());}}
 return circuit;
}
function powerAimPort(dir=direction(),max=4){
 const origin=V(...camera),hit=aimQubit(max,dir);let best=hit&&powerPartConnectable(hit)?{endpoint:{kind:'part',id:hit.part.id},point:powerPort({kind:'part',id:hit.part.id}),distance:hit.distance,hit}:null;
 for(const r of powerReservoirs){const distance=rayPuzzleBox(origin,dir,r.wall,max);if(distance===null||best&&distance>=best.distance)continue;if(hit&&hit.distance<distance-.01)continue;
  if(storyWorld.walls.some(w=>w!==r.wall&&(rayPuzzleBox(origin,dir,w,distance)??Infinity)<distance-.01))continue;
  best={endpoint:{kind:'reservoir',id:r.id},point:powerPort({kind:'reservoir',id:r.id}),distance,reservoir:r};best.point=powerPort(best.endpoint);
 }return best;
}
function powerAimCable(dir=direction(),max=4){
 const origin=V(...camera);let best=null;
 for(const cable of powerCables){const path=powerCablePath(cable)||cable.points;
  for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],v=sub(b,a),w=sub(a,origin),vv=v.dot(v),dv=dir.dot(v),dw=dir.dot(w),vw=v.dot(w),den=vv-dv*dv;
   let along=den>1e-8?(dv*dw-vw)/den:0;along=clamp(along,0,1);const p=add(a,mul(v,along)),distance=sub(p,origin).dot(dir);if(distance<0||distance>max||best&&distance>=best.distance)continue;
   const miss=p.distanceTo(add(origin,mul(dir,distance)));if(miss>.045||storyWorld.walls.some(w=>(rayPuzzleBox(origin,dir,w,distance)??Infinity)<distance-.035))continue;
   best={cable,point:p,distance};
  }
 }return best;
}
function powerSurfaceAim(dir=direction()){
 const wall=wallAim(dir,12);const floor=dir.y<-.0001?add(V(...camera),mul(dir,(.008-camera[1])/dir.y)):null;
 if(wall&&(!floor||wall.distance<floor.distanceTo(V(...camera))))return add(wall.p,mul(wall.normal,.008));
 return floor&&floor.distanceTo(V(...camera))<=12&&Math.abs(floor.x)<ROOM_SIZE/2&&Math.abs(floor.z)<ROOM_SIZE/2?floor:null;
}
function finishPowerCable(endpoint){
 const draft=powerDraft,materials=powerDraftMaterials();if(!draft||!draft.from||!materials){cancelPowerCable();announce('El material cambió. Vuelve a seleccionar los cubos.');return false;}
 const points=powerSurfaceRoute(draft.from,endpoint,draft.bends),result=draft.existing?reroutePowerCable(draft.existing,endpoint,points):connectPowerCable(draft.from,endpoint,points,materials);
 if(!result.ok){announce(result.error+' · añade puntos de apoyo o cancela para usar más cubos.');return false;}
 if(!draft.existing){for(const g of draft.groups)removeGroup(g);}
 powerDraft=null;clearSelection();redraw=true;announce('Cable conectado · '+result.cable.length.toFixed(1)+' / '+result.cable.maxLength.toFixed(1)+' m · sin pérdidas. Enciende la batería y la máquina.');return true;
}
function powerCableClick(event){
 if(!powerDraft||!gameInputActive()||!storyActionAllowed())return false;
 event.preventDefault();if(event.button===2){if(powerDraft.bends.length){powerDraft.bends.pop();announce('Último punto retirado');}else{cancelPowerCable();announce('Cable cancelado · cubos conservados');}return true;}
 if(event.button!==0)return true;
 const hit=powerAimPort();if(!powerDraft.from){if(hit){powerDraft.from=hit.endpoint;announce('Salida fijada · clic en suelo/pared para guiar; clic en máquina para conectar la entrada.');}else announce('Apunta a una batería, rotor o máquina.');return true;}
 if(hit){finishPowerCable(hit.endpoint);return true;}
 const p=powerSurfaceAim();if(!p){announce('Apunta al suelo o a una pared cercana.');return true;}
 if(powerDraft.bends.length>=12){announce('Máximo 12 apoyos. Clic derecho deshace el último.');return true;}
 powerDraft.bends.push(p);redraw=true;return true;
}
function nearestPowerMaterial(point,maxCount=8){
 return groups.filter(g=>g.parts.length<=maxCount&&g.body.position.distanceTo(point)<3&&!held?.items?.some(i=>i.g===g)).sort((a,b)=>a.body.position.distanceTo(point)-b.body.position.distanceTo(point)).find(g=>powerMaterialGroups([g]));
}
function addPowerCableMaterial(cable){
 const point=powerPort(cable.to)||cable.points[cable.points.length-1]||V(),g=nearestPowerMaterial(point,8-cable.materials.length);
 if(!g){announce('Deja cubos normales a menos de 3 m de la entrada. Máximo 8 cubos por cable.');return false;}
 const result=extendPowerCable(cable,worldParts(g));if(!result.ok){announce(result.error);return false;}removeGroup(g);clearSelection();announce('Cable ampliado · '+cable.materials.length+' cubos · '+cable.maxLength.toFixed(1)+' m disponibles');return true;
}
function recoverPowerCable(cable){
 if(!powerCables.includes(cable))return false;
 if(scenePartCount()+cable.materials.length>MAX_QUBITS){announce('No hay espacio para recuperar los cubos. Retira algunas piezas primero.');return false;}
 const candidates=[];
 for(let row=0;row<6&&candidates.length<cable.materials.length;row++)for(const col of [0,1,-1,2,-2]){
  const p=V(position[0]-Math.sin(yaw)*(1+row*.15)+Math.cos(yaw)*col*.14,HALF+.004,position[2]-Math.cos(yaw)*(1+row*.15)-Math.sin(yaw)*col*.14);
  const record=powerCopyMaterial(cable.materials[candidates.length]);if(!record)break;record.p=p;record.q=Q();const g=makeGroup([record]);if(validPose(g,g.body.position,g.body.quaternion))candidates.push(g);else removeGroup(g);
  if(candidates.length===cable.materials.length)break;
 }
 if(candidates.length!==cable.materials.length){for(const g of candidates)removeGroup(g);announce('No hay espacio para desplegar los cubos delante de ti. El cable se conserva.');return false;}
 removePowerCable(cable);redraw=true;announce('Cable recogido · '+candidates.length+' cubos recuperados con su carga original');return true;
}
function openPowerCableMenu(cable,point){
 openCommandMenu(point,'Cable · '+cable.status,[
 {label:cable.length.toFixed(1)+' / '+cable.maxLength.toFixed(1)+' m · '+cable.materials.length+'/8 cubos · sin pérdidas',disabled:true,run:()=>{}},
 {label:'Añadir cubos cercanos',disabled:cable.materials.length>=8,run:()=>{addPowerCableMaterial(cable);captureMouse();}},
 {label:'Prolongar / cambiar entrada',run:()=>{powerDraft={groups:[],materials:cable.materials,from:{...cable.from},bends:[],existing:cable};captureMouse();announce('Cable original conservado · marca apoyos y elige la nueva entrada. Esc cancela.');}},
 {label:'Recoger cable y recuperar cubos',run:()=>{recoverPowerCable(cable);captureMouse();}},
 {label:'Cerrar',run:()=>captureMouse()}]);
}
function openPowerReservoirMenu(r){
 openCommandMenu(powerPort({kind:'reservoir',id:r.id}),'Depósito de energía',[
 {label:Math.round(r.cell.mood.energy*100)+' % · '+(r.cell.mood.energy*r.capacity).toFixed(0)+' / '+r.capacity+' J',disabled:true,run:()=>{}},
 {label:r.enabled?'Apagar salida':'Encender salida',run:()=>{r.enabled=!r.enabled;updatePowerNetwork(0);openPowerReservoirMenu(r);}},
 {label:'Tender cable con cubos cercanos',run:()=>{const g=nearestPowerMaterial(r.p);if(g&&beginPowerCable([g]))powerDraft.from={kind:'reservoir',id:r.id};else announce('Deja de 1 a 8 cubos normales cerca del depósito, o créalos con Q.');}},
 {label:'Recargar · banco de pruebas',disabled:r.enabled,run:()=>{if(story.scene==='lab'&&!r.enabled)r.cell.mood.energy=1;openPowerReservoirMenu(r);}},
 {label:'Retirar depósito',disabled:powerCables.some(c=>[c.from,c.to].some(e=>e.kind==='reservoir'&&e.id===r.id)),run:()=>{removePowerReservoir(r);captureMouse();}},
 {label:'Cerrar',run:()=>captureMouse()}]);
}
function powerSecondary(dir){
 if(story.scene!=='lab'||puzzle.active||held)return false;
 const port=powerAimPort(dir),wire=powerAimCable(dir),piece=aimQubit(4,dir),cargo=aimCargo(4,dir);
 if(port?.reservoir&&port.distance<Math.min(wire?.distance??Infinity,piece?.distance??Infinity,cargo?.distance??Infinity)){openPowerReservoirMenu(port.reservoir);return true;}
 if(wire&&wire.distance<Math.min(piece?.distance??Infinity,cargo?.distance??Infinity)){openPowerCableMenu(wire.cable,wire.point);return true;}return false;
}
function powerTargetText(){
 if(powerDraft){const limit=powerCableLimit(powerDraftMaterials()||[]);return powerDraft.from?'Cable · '+limit.toFixed(1)+' m disponibles · clic: apoyo / entrada · clic derecho: deshacer · Esc: cancelar':'Cable · '+limit.toFixed(1)+' m · clic en batería o máquina: salida · Esc: cancelar';}
 const port=powerAimPort(),wire=powerAimCable();
 if(port?.reservoir&&(!wire||port.distance<wire.distance))return 'Salida · depósito '+Math.round(port.reservoir.cell.mood.energy*100)+' % · '+(port.reservoir.enabled?'encendido':'apagado')+' · clic derecho: energía';
 if(wire){const a=powerPort(wire.cable.from),b=powerPort(wire.cable.to),role=a&&wire.point.distanceTo(a)<.15?'Salida':b&&wire.point.distanceTo(b)<.15?'Entrada':'Cable';return role+' · '+wire.cable.status+' · '+wire.cable.length.toFixed(1)+' / '+wire.cable.maxLength.toFixed(1)+' m · clic derecho: ampliar / recoger';}
 if(port&&powerCables.some(c=>[c.from,c.to].some(e=>powerEndpointKey(e)===powerEndpointKey(port.endpoint)))){const role=powerCables.some(c=>powerEndpointKey(c.to)===powerEndpointKey(port.endpoint))?'Entrada':'Salida';return role+' eléctrica · Alt: conexiones · Alt + X: separar · clic derecho: máquina';}
 return '';
}
function powerInspectionAvailable(){return story.scene==='lab'&&!puzzle.active&&powerCables.length>0;}
function powerModel(){
 if(powerModelCache)return powerModelCache;const model=window.QBitsReservoirModel?.create();if(!model)return null;
 const mesh=m=>({buffer:buffer(m.data),count:m.count,color:m.color});powerModelCache={...model,opaque:model.opaque.map(mesh),glass:mesh(model.glass),liquid:mesh(model.liquid)};return powerModelCache;
}
function drawPowerReservoirs(){
 if(!powerReservoirs.length)return;const model=powerModel();if(!model)return;
 for(const r of powerReservoirs){for(const mesh of model.opaque)drawAsset(mesh,r.p,Q(),V(1,1,1),mesh.color);
  const fraction=clamp(r.cell.mood.energy,0,1);if(fraction>.00001){gl.uniform1f(uniforms.uTime,simTime);gl.uniform3fv(uniforms.uLiquidNormal,[0,1,0]);gl.uniform4f(uniforms.uLiquidPlane,0,1,0,1);drawAsset(model.liquid,add(r.p,V(0,model.fill.bottom,0)),Q(),V(model.fill.radius,model.fill.height*fraction,model.fill.radius),[.04,.65,.34,1],15);}
  drawBox(powerPort({kind:'reservoir',id:r.id}),Q(),V(.055,.04,.018),r.enabled?[.1,.87,.53,1]:[.45,.46,.43,1]);
 }
 gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
 for(const r of [...powerReservoirs].sort((a,b)=>b.p.distanceTo(V(...camera))-a.p.distanceTo(V(...camera))))drawAsset(model.glass,r.p,Q(),V(1,1,1),[.7,.9,.8,1],16);
 gl.depthMask(true);gl.disable(gl.BLEND);
}
function drawPowerRibbon(points,color,fraction=1){
 if(!points.length)return;const revealed=[points[0]];let remaining=powerCableLength(points)*fraction;
 for(let i=1;i<points.length&&remaining>0;i++){const a=points[i-1],full=points[i].distanceTo(a);if(full<.0001)continue;const length=Math.min(remaining,full);revealed.push(add(a,mul(sub(points[i],a),length/full)));remaining-=length;}
 drawCachedPowerRibbon('preview',revealed,color);
}
function drawCachedPowerRibbon(cable,points,color){
 if(!renderPointsVisible(points,.0125*visuals.pathWidth+.025))return;
 const signature=visuals.pathWidth+':'+points.map(p=>[p.x,p.y,p.z].map(v=>v.toFixed(4)).join(',')).join(';');let mesh=powerRibbonCaches.get(cable);
 if(!mesh){mesh={buffer:gl.createBuffer(),count:0,signature:null};powerRibbonCaches.set(cable,mesh);}
 if(mesh.signature!==signature){const data=[];
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=a.distanceTo(b);if(length<.0001)continue;const dir=mul(sub(b,a),1/length);let normal=V(0,1,0);
   if(Math.abs(a.x)>.5*ROOM_SIZE-.03&&Math.abs(a.x-b.x)<.03)normal=V(a.x>0?-1:1,0,0);
   else if(Math.abs(a.z)>.5*ROOM_SIZE-.03&&Math.abs(a.z-b.z)<.03)normal=V(0,0,a.z>0?-1:1);
   else if(Math.abs(dir.y)>.9)normal=V(0,0,1);
   const side=normal.cross(dir);side.normalize();side.scale(.0125*visuals.pathWidth,side);
   const vertices=[sub(a,side),add(a,side),add(b,side),sub(b,side)],uv=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]];
   for(const j of [0,1,2,0,2,3])data.push(vertices[j].x,vertices[j].y,vertices[j].z,uv[j][0],0,uv[j][1]);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);boundGeometry=null;mesh.count=data.length/6;mesh.signature=signature;
 }
 if(mesh.count){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.uniform1f(uniforms.uShadow,alphaSettings.glow);drawAsset(mesh,V(),Q(),V(1,1,1),color,17);gl.depthMask(true);gl.disable(gl.BLEND);}
}
function drawPowerCables(){
 const inspect=altDown()&&powerInspectionAvailable();
 for(const c of powerCables){const path=powerCablePath(c)||c.points;if(path.length<2)continue;
  const color=[...visualRGB('cableColor'),c.active?1:.4];if(c.progress>=1)drawCachedPowerRibbon(c,path,color);else drawPowerRibbon(path,color,c.progress);
  const a=path[0],b=path[path.length-1];for(const p of [a,b])drawBox(p,Q(),V(.031,.012,.031),c.active?[.11,.67,.42,1]:[.69,.22,.13,1]);
  if(c.progress<1){const size=CUBE_SIZE*(1-c.progress);drawBox(add(a,V(0,size/2,0)),Q(),V(CUBE_SIZE,Math.max(.004,size),CUBE_SIZE),[.25,.28,.28,1]);}
  if(inspect){drawWideLines(path.flatMap((p,i)=>i?[path[i-1],p]:[]),[...visualRGB('cableColor'),.95],visuals.pathWidth);}
 }
 if(inspect){gl.disable(gl.DEPTH_TEST);const visited=new Set();for(const c of powerCables)for(const e of [c.from,c.to])if(e.kind==='part'){const hit=rotorPart(e.id);if(!hit)continue;const component=rotorConnectedGroups([hit.g]);for(const g of component){if(visited.has(g))continue;visited.add(g);const center=g.body.position;for(const part of g.parts)if(unitShape(part)==='coupler'||isExternalBattery(part)||part.mood.gripper)drawWideLines([center,partPose(g,part).p],[...visualRGB('cableColor'),.85],1.5);}for(const rotor of rotors)if(component.includes(rotorPart(rotor.aId)?.g)){const a=rotorPart(rotor.aId),b=rotorPart(rotor.bId);if(a&&b)drawWideLines([a.p,b.p],[...visualRGB('cableColor'),1],2);}}gl.enable(gl.DEPTH_TEST);}
 if(powerDraft?.from){const start=powerPort(powerDraft.from),target=powerAimPort(),point=target?.point||powerSurfaceAim();if(start&&point){let path;if(target)path=[start,...powerSurfaceRoute(powerDraft.from,target.endpoint,powerDraft.bends),point];else path=[start,...powerCircuitRoute(start,point,powerDraft.bends,true)];const length=powerCableLength(path),valid=length<=powerCableLimit(powerDraftMaterials()||[]);drawPowerRibbon(path,valid?[...visualRGB('cableColor'),.85]:[.85,.18,.16,.85]);}}
}

// Motors normally use the two enganches. A converted external battery on the
// same physical mechanism replaces those reserves; ordinary attached pieces
// still add load only. Each cell has one charge value, never a second reservoir.
// Lab snapshots contain their own pieces and charge percentages. Capacity is
// calibrated per scene, so leaving/re-entering the lab cannot refill a battery
// or grant its extra reserve to campaign pieces. Workshop tier ratios stay the
// same and therefore preserve absolute stored energy when fitting an upgrade.
function externalBatteryState(part){
 const state=part?.mood?.externalBattery;
 if(!state||typeof state!=='object'||Array.isArray(state)||state.version!==1||!Number.isSafeInteger(part?.id)||part.id<1||state.ownerId!==part.id||!Number.isSafeInteger(state.packId)||state.packId<1||typeof state.enabled!=='boolean')return null;
 if((part.shape||'cube')!=='cube'||!Number.isFinite(part.weight)||part.weight<=0||!Number.isFinite(part.mood.energy)||part.mood.energy<0||part.mood.energy>1||part.mood.production||part.mood.matter||QBitsWorkshop.hasAdaptation(part))return null;
 return state;
}
function isExternalBattery(part){return !!externalBatteryState(part);}
function batterySceneScale(){return story.scene==='lab'?30:15;}
function externalBatteryCapacity(part){const reservoir=powerReservoirCell(part);return reservoir?reservoir.capacity:isExternalBattery(part)?60*batterySceneScale():0;}
function externalBatteryComponent(subject){return rotorConnectedGroups(Array.isArray(subject)?subject:subject?.parts?[subject]:subject&&Number.isSafeInteger(subject.aId)&&Number.isSafeInteger(subject.bId)?rotorGroups(subject):[]);}
function externalBatteryCells(subject){return powerCables.length?getCableSupply(subject):externalBatteryComponent(subject).flatMap(g=>g.parts).filter(part=>externalBatteryState(part)?.enabled).sort((a,b)=>a.id-b.id);}
function externalBatterySummary(subject){
 const cells=externalBatteryCells(subject),capacity=cells.reduce((sum,part)=>sum+externalBatteryCapacity(part),0),storedJ=cells.reduce((sum,part)=>sum+part.mood.energy*externalBatteryCapacity(part),0);
 const powerCells=cells.reduce((sum,cell)=>sum+(powerReservoirCell(cell)?POWER_RESERVOIR_CAPACITY/1800:1),0);
 return {cells,powerCells,storedJ,capacity,energy:capacity?storedJ/capacity:0,active:cells.length>0};
}
function externallyPoweredInternalIds(){
 const ids=new Set(),seen=new Set();
 for(const rotor of rotors){if(seen.has(rotor))continue;const component=externalBatteryComponent(rotor),members=rotors.filter(r=>rotorGroups(r).some(g=>component.includes(g)));members.forEach(r=>seen.add(r));
  if(externalBatteryCells(component).length)for(const r of members){ids.add(r.aId);ids.add(r.bId);}
 }
 // An adapted cube has its own internal reserve even when there are no rotors.
 // An active external supply neither drains nor passively refills that reserve.
 for(const g of groups){const grippers=g.parts.filter(part=>part.mood.gripper);if(grippers.length&&externalBatteryCells(g).length)for(const part of grippers)ids.add(part.id);}
 return ids;
}
function gameBatteryCapacity(part){return isExternalBattery(part)?externalBatteryCapacity(part):QBitsWorkshop.batteryCapacity(part)*batterySceneScale();}
function rotorDrivenLoad(component,arm){
 // An arm's rated load is the payload on its own gripper. The mass of its
 // links still contributes to measured torque through the physical constraints.
 return arm?robotGrips.get(arm.gripperId)?.weight||0:component.reduce((sum,g)=>sum+totalWeight(g),0)+robotGripLoad(component);
}
function rotorPowerState(rotor,dt=0){
 const a=rotorPart(rotor.aId),b=rotorPart(rotor.bId),component=rotorConnectedGroups(rotorGroups(rotor)),arm=robotArmForRotor(rotor);
 const load=rotorDrivenLoad(component,arm);
 // Evaluate the motor shaft: torque falls and RPM rises by the same ratio.
 // Mechanical power is conserved; the existing efficiency/loss model applies.
 const reduction=robotJointReduction(rotor,arm);
 const state={enabled:rotor.enabled,rpm:rotor.rpm,actualRpm:(rotor.actualRpm||0)*reduction,actualTorque:(rotor.actualTorque||0)/reduction,stalled:rotor.stalled,maxTorque:rotor.maxTorque,load,capacity:rotor.capacity,energyA:a?.part.mood.energy??0,energyB:b?.part.mood.energy??0,capacityJoulesA:gameBatteryCapacity(a?.part),capacityJoulesB:gameBatteryCapacity(b?.part)},external=externalBatterySummary(component);
 return external.active?QBitsRotorPower.evaluateExternal(state,external,dt):QBitsRotorPower.evaluate(state,dt);
}
function rotorPowerDescription(rotor,compact=false){
 const arm=robotArmForRotor(rotor),power=rotorPowerState(rotor),energy=[rotor.aId,rotor.bId].map(id=>Math.round((rotorPart(id)?.part.mood.energy||0)*100));
 const load=power.load,consumption=(power.external?power.externalDrainPerSecond:Math.max(power.drainPerSecondA,power.drainPerSecondB))*100;
 const state=rotor.stopReason?rotorStopLabel(rotor.stopReason):rotor.enabled?(rotor.stalled?'atascado':'encendido'):'apagado';
 if(compact)return 'Rotor '+state+' · '+Math.abs(rotor.actualRpm||0).toFixed(0)+' rpm · '+load.toFixed(1)+' / '+rotor.capacity+' u · '+(power.external?'batería externa · ':'')+'−'+consumption.toFixed(2)+' %/s';
 const supply=power.external?'Batería externa '+Math.round(power.externalEnergy*100)+' % · reservas internas conservadas':'Energía A '+energy[0]+' % · B '+energy[1]+' %';
 const reduction=robotJointReduction(rotor,arm);
 return (story.campaign?.production?.rotor===rotor?'Motor: el objetivo suma también el consumo de la línea. ':'')+supply+' · consumo '+consumption.toFixed(2)+' %/s ('+power.inputWatts.toFixed(2)+' W). '+(arm?'Carga en la pinza ':'Carga ')+load.toFixed(1)+' / '+rotor.capacity+' u. '+(reduction>1?'Reducción '+reduction+':1 · ':'')+(reduction>1?'Torque de salida ':'Torque usado ')+(rotor.actualTorque||0).toFixed(2)+' / '+(rotor.maxTorque*reduction).toFixed(2)+' N·m. Giro real '+Math.abs(rotor.actualRpm||0).toFixed(1)+' / '+(rotor.rpm/reduction).toFixed(1)+' rpm objetivo.';
}
function rotorStopLabel(reason){return reason==='overload'?'sobrecarga':reason==='empty'?'sin energía':'';}
function checkRotorPower(rotor){
 const enabled=rotor.enabled;rotor.enabled=true;const power=rotorPowerState(rotor);rotor.enabled=enabled;
 if(!power.stopReason)return true;
 rotor.stopReason=power.stopReason;announce('Rotor · '+rotorStopLabel(power.stopReason)+(power.stopReason==='overload'?' · reduce la carga o ajusta el límite en Mecanismos.':power.external?' · desactiva la batería y apóyala en el suelo para recargar.':' · déjalo descansar para recargar.'));return false;
}
function stopRotorForPower(rotor,reason){
 configureRotor(rotor,{enabled:false},true);rotor.stopReason=reason;
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
 const seconds=Number.isFinite(dt)?Math.max(0,dt):0,pools=new Map();
 for(const rotor of rotors){
  if(!rotor.powerActive||!rotor.enabled)continue;
  const external=externalBatterySummary(rotor);
  if(external.active){const power=rotorPowerState(rotor);rotor.power=power;if(power.stopReason){stopRotorForPower(rotor,power.stopReason);continue;}
   const key=external.cells.map(part=>part.id).join(','),pool=pools.get(key)||{...external,motors:[]};pool.motors.push({rotor,power});pools.set(key,pool);continue;
  }
  const power=rotorPowerState(rotor,seconds);rotor.power=power;
  for(const [id,drain]of [[rotor.aId,power.drainA],[rotor.bId,power.drainB]]){const part=rotorPart(id)?.part;if(part){part.mood.energy=clamp(part.mood.energy-drain,0,1);part.mood.idle=0;part.mood.boredOnce=false;}}
  if(power.stopReason)stopRotorForPower(rotor,power.stopReason);
 }
 for(const pool of pools.values()){
  // Stable sums and proportional debits make the result independent of the
  // rotor order and prevent a shared cell from being charged once per motor.
  pool.motors.sort((a,b)=>a.rotor.aId-b.rotor.aId||a.rotor.bId-b.rotor.bId);
  const watts=pool.motors.reduce((sum,item)=>sum+item.power.inputWatts,0),spent=Math.min(pool.storedJ,watts*seconds),fraction=pool.storedJ>0?spent/pool.storedJ:0;
  const exhausted=seconds>0&&watts>0&&spent>=pool.storedJ;
  for(const part of pool.cells){part.mood.energy=exhausted?0:clamp(part.mood.energy*(1-fraction),0,1);part.mood.idle=0;part.mood.boredOnce=false;}
  for(const {rotor,power}of pool.motors){const share=watts>0?spent*power.inputWatts/watts:0;
   Object.assign(power,{spentJoules:share,drainPerSide:share/(QBitsRotorPower.MODEL.joulesPerSide*2),suppliedSeconds:power.inputWatts>0?share/power.inputWatts:0,remainingSeconds:watts>0?(pool.storedJ-spent)/watts:null,externalStoredJ:pool.storedJ-spent,externalEnergy:pool.capacity?(pool.storedJ-spent)/pool.capacity:0,externalDrainPerSecond:pool.capacity?watts/pool.capacity:0,stopReason:exhausted?'empty':null});
   if(exhausted)stopRotorForPower(rotor,'empty');
  }
 }
 rechargeExternalBatteries(seconds);
}
function externalBatteryPackComponents(g){
 const remaining=new Set(g.parts.filter(isExternalBattery)),packs=[];
 while(remaining.size){const first=remaining.values().next().value,pack=[first],packId=externalBatteryState(first).packId;remaining.delete(first);
  for(let i=0;i<pack.length;i++)for(const candidate of [...remaining]){
   if(externalBatteryState(candidate).packId!==packId)continue;
   const a=pack[i],near=a.offset.distanceTo(candidate.offset)<=CUBE_SIZE+.0001;
   if(near&&touchingUnitFaces({shape:a.shape,p:a.offset,q:a.q},{shape:candidate.shape,p:candidate.offset,q:candidate.q})){remaining.delete(candidate);pack.push(candidate);}
  }
  packs.push(pack);
 }
 return packs;
}
function rechargeExternalBatteries(dt){
 if(!Number.isFinite(dt)||dt<=0)return;
 const heldGroups=new Set((held?.items||(held?[held]:[])).map(item=>item.g));
 for(const g of groups){
  const cells=g.parts.filter(isExternalBattery);if(!cells.length||powerGroupCabled(g)||heldGroups.has(g)||g.route||g.haulJob||g.pendingMoodOrder||g.blueprintJob||g.body.velocity.norm()>.025||g.body.angularVelocity.norm()>.05)continue;
  const component=externalBatteryComponent([g]);if([...flightStates.values()].some(f=>f.enabled&&f.component?.some(member=>component.includes(member))))continue;if(rotors.some(r=>r.enabled&&rotorGroups(r).some(member=>component.includes(member)))||component.some(member=>heldGroups.has(member)||member.route||member.haulJob||member.pendingMoodOrder||member.blueprintJob||member.body.velocity.norm()>.025||member.body.angularVelocity.norm()>.05))continue;
  for(const pack of externalBatteryPackComponents(g)){
   if(pack.some(part=>externalBatteryState(part).enabled))continue;
   const grounded=pack.some(part=>{const floor=Math.min(...corners(partPose(g,part)).map(point=>point.y));return floor>=-.006&&floor<=.008;});if(!grounded)continue;
   for(const part of pack){const capacity=externalBatteryCapacity(part),rate=story.scene==='lab'?20:10;part.mood.energy=clamp(part.mood.energy+dt*rate/capacity,0,1);}
  }
 }
}
// Dissipate sub-centimetre creep only on a quiet horizontal contact patch.
// Falling, pushing, tipping, powered transport and zero-friction play remain dynamic.
function settleSupportedGroups(dt,contacts,driven,articulated){
 for(const g of groups)if(g.floorSettleUntil!==undefined&&(world.defaultContactMaterial.friction<=0||simTime>g.floorSettleUntil||g.body.sleepState===CANNON.Body.SLEEPING||driven.has(g.body))){
  g.body.sleepSpeedLimit=.025;delete g.floorSettleUntil;
 }
 if(world.defaultContactMaterial.friction<=0)return;
 const supports=new Map(),passive=new Map(),fixedDrives=new Set();
 for(const r of rotors)if(r.enabled&&r.mount!=='wheel')for(const g of rotorGroups(r))fixedDrives.add(g);
 function quietAssembly(group){
  if(passive.has(group))return passive.get(group);
  const members=rotorConnectedGroups([group]);
  const quiet=members.every(g=>g.virtualConveyor||(
   !fixedDrives.has(g)&&!driven.has(g.body)&&g.body.type===CANNON.Body.DYNAMIC&&
   !g.robotGrip&&!g.robotHeld&&!g.route&&!g.haulJob&&!g.blueprintJob&&
   g.body.velocity.norm2()<.0064&&g.body.angularVelocity.norm2()<.0225&&
   !g.parts.some(p=>p.mood.flight?.enabled)&&!(held?.items||[]).some(i=>i.g===g)
  ));
  for(const g of members)passive.set(g,quiet);
  return quiet;
 }
 for(const contact of contacts){
  const up=contact.ni.y;if(Math.abs(up)<.995)continue;
  const body=up>0?contact.bj:contact.bi,base=up>0?contact.bi:contact.bj,g=body.qubitGroup;
  if(!g||body.type!==CANNON.Body.DYNAMIC||body.sleepState===CANNON.Body.SLEEPING||driven.has(body)||driven.has(base)||g.robotHeld||g.route||g.haulJob||g.blueprintJob||(held?.items||[]).some(i=>i.g===g))continue;
  if(Math.abs(body.velocity.y)>.03||body.velocity.norm2()>.0064||body.angularVelocity.norm2()>.0225||base.velocity.norm2()>.0001||base.angularVelocity.norm2()>.0025||g.parts.some(p=>p.mood.flight?.enabled))continue;
  if(articulated.has(body)&&!quietAssembly(g))continue;
  const r=up>0?contact.rj:contact.ri;
  let patch=supports.get(body);if(!patch){patch={floorOnly:true,count:0,x0:Infinity,x1:-Infinity,z0:Infinity,z1:-Infinity};supports.set(body,patch);}
  patch.floorOnly&&=base===floor;patch.count++;patch.x0=Math.min(patch.x0,r.x);patch.x1=Math.max(patch.x1,r.x);patch.z0=Math.min(patch.z0,r.z);patch.z1=Math.max(patch.z1,r.z);
 }
 const decay=Math.exp(-16*dt*Math.min(1,world.defaultContactMaterial.friction/.38));
 for(const [body,p] of supports)if(p.count>=3&&p.x0<0&&p.x1>0&&p.z0<0&&p.z1>0){
  // Small angular oscillations of broad feet can restart Cannon's sleep timer
  // every other step at 60 Hz. Let its normal delayed sleep settle the chassis.
  if(p.floorOnly&&body.qubitGroup.parts.length>1&&body.velocity.norm2()<.0004){
   body.sleepSpeedLimit=.065;body.qubitGroup.floorSettleUntil=simTime+.1;
  }
  body.velocity.x*=decay;body.velocity.z*=decay;body.angularVelocity.scale(decay,body.angularVelocity);
 }
}

function stepPhysics(dt){
 mechanicalStepCache={parts:null,components:new Map()};
 try{
 simTime+=dt;refreshRotors();updatePowerNetwork(dt);updateConveyors(dt);updateRobotGrips(dt);updateRobotArms(dt);tutorialFloat(dt);updateGrab(dt);updateRoutes(dt);updateHauling(dt);
 // Bound substep travel to avoid tunnelling through a 9 cm piece.
 for(const g of groups){if(g.virtualConveyor)continue;const b=g.body,speed=b.velocity.norm();if(speed>6)b.velocity.scale(6/speed,b.velocity);const spin=b.angularVelocity.norm();if(spin>30){
  const limit=rotorForGroup(g)?QBitsRotorPower.LIMITS.rpm[1]*Math.PI/30:30;
  if(spin>limit)b.angularVelocity.scale(limit/spin,b.angularVelocity);
 }}
 updateCampaignPressure(dt);updateButtonPhysics();prepareRotorPower();updateRotorMotors(dt);driveRobotArms(dt);driveConveyors(dt);driveServos(dt);productionForces(dt);updateFlights(dt);world.step(dt);invalidateConveyorContacts();stabilizeRotors();updateRotorPower(dt);validateServoMarches();tickContactSensors(dt);tickFlightSensors(dt);
 // The floor correction must translate a hinged assembly as a whole. Moving
 // a single link stretches its constraints and stores an impulse on release.
 if(held){
  const corrected=new Set();
  for(const item of held.items||[held]){
   if(item.g.virtualConveyor)continue;
   if(item.floorLocked)item.g.body.angularVelocity.set(0,0,0);
   if(corrected.has(item.g))continue;
   const component=rotorConnectedGroups([item.g]).filter(g=>!g.virtualConveyor);
   const low=Math.min(...component.map(g=>bounds(g).min.y));
   for(const g of component){
    corrected.add(g);
    if(low<.001){g.body.position.y+=.001-low;if(g.body.velocity.y<0)g.body.velocity.y=0;g.body.aabbNeedsUpdate=true;}
   }
  }
 }
 for(const c of cargos){if(c.robotPhysical)continue;c.body.velocity.y=0;c.body.position.y=(c.dimensions?.y||c.size)/2;c.body.quaternion.set(0,0,0,1);c.body.angularVelocity.set(0,0,0);c.body.aabbNeedsUpdate=true;}
 updateCooling(dt);updateMoods(dt);updateBlueprints(dt);updatePuzzle(dt);tickAutomation(dt);tickProduction(dt);
 }finally{mechanicalStepCache=null;}
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
function showArmControls(){
 switchPanelTab('mechanisms');document.querySelector('#arm-panel').scrollIntoView?.({block:'start'});
}
function openPanel(){
 cancelUnitCreation();closeWorkshopPanel(false);cancelShelfPlacement();closeCommandMenu(false);selectedCargo=aimCargo(4)?.cargo||selectedCargo;
 if(!selectedRotors().length)selected=held?{g:held.g,part:held.part}:aimQubit()||selected;
 if(panel.hidden)releaseForTablet();showTablet();updatePanel();switchPanelTab(tabletTab==='catalog'&&(story.scene!=='lab'||puzzle.active)?'cube':tabletTab);
 if(selectedSensor())switchPanelTab('mechanisms');
 else if(selected?.part.mood.gripper||robotArmForGroup(selected?.g,selected?.part.id))showArmControls();
 else if(selectedRotors().length||activeRotorSet())switchPanelTab('mechanisms');
}
for(const name of ['mass','gravity','bounce','force','friction','damping','speed','maxCarry','maxSelect','rotationSpeed','grip'])document.querySelector('#'+name).addEventListener('input',event=>{
 if(story.scene==='campaign'&&story.campaign?.automation){announce('Ensayo certificado: masa y físicas permanecen fijas. Ajusta el motor.');updatePanel();return;}
 automationIntervention();settings[name]=Number(event.target.value);
 if(name==='mass'&&puzzle.active){settings.mass=1;updatePanel();return;}
 if(name==='mass'&&selected&&(QBitsWorkshop.hasAdaptation(selected.part)||isExternalBattery(selected.part))){settings.mass=selected.part.weight;announce('Restablece la pieza en la mesa antes de cambiar su masa.');updatePanel();return;}
 if(name==='mass'&&selected){
  const old=selected.g,id=selected.part.id,parts=worldParts(old),ref=old.body.quaternion.clone();parts.find(p=>p.id===id).weight=settings.mass;
  removeGroup(old);const g=makeGroup(parts,ref);selected={g,part:g.parts.find(p=>p.id===id)};
 }
 world.gravity.y=-settings.gravity;world.defaultContactMaterial.friction=settings.friction;world.defaultContactMaterial.restitution=settings.bounce;
 for(const g of groups){g.body.angularDamping=groupAngularDamping(g.parts.length);g.body.wakeUp();}
 updatePanel();
});
for(const name of ['guide','line'])document.querySelector('#'+name).addEventListener('change',e=>settings[name]=e.target.value);
for(const name of ['catalog','cube','route','cargo','puzzle','alpha','mechanisms','manual'])document.querySelector('#tab-'+name).addEventListener('click',()=>switchPanelTab(name));
document.querySelector('#arm-help').addEventListener('click',()=>switchPanelTab('manual'));
document.querySelector('#manual-arm-controls').addEventListener('click',showArmControls);
document.querySelector('#create').addEventListener('click',()=>startCreationTool(creationShape()));
document.querySelector('#unit-shape').addEventListener('change',event=>{if(creationChoiceAllowed(event.target.value))settings.unitShape=normalizeCreationChoice(event.target.value);syncUnitControls();});
document.querySelector('#remove').addEventListener('click',()=>{deleteQubit(selected);updatePanel();});
document.querySelector('#split').addEventListener('click',()=>{detachPart(selected,true);updatePanel();});
document.querySelector('#stop').addEventListener('click',()=>{if(selectedCargo)stopHaul(selectedCargo);for(const g of selectedTeam()){leaveHaul(g);stopRoute(g);}});
document.querySelector('#resume').addEventListener('click',stowTablet);
canvas.addEventListener('mousedown',onPhysicalMouseDown);
panel.addEventListener('mousedown',event=>{if(window.QBitsControls?.keyboardAction(savedPreferences.controls.keyboard,'Mouse'+event.button)==='tablet')onPhysicalMouseDown(event);});
for(const surface of [panel,canvas])surface.addEventListener('auxclick',event=>{if(event.button===1)event.preventDefault();});
document.addEventListener('mouseup',onPhysicalMouseUp);
function handleWheel(event){
 if(robotPoseDraft){
  event.preventDefault();const draft=robotPoseDraft;
  draft.heightCm=clamp(Math.round((draft.heightCm-Math.sign(event.deltaY)*(event.shiftKey?.5:2))*10)/10,0,ROBOT_MAX_POSE_OFFSET_CM);
  updateRobotPoseDraft(performance.now(),true);updateTarget();return;
 }
 if(cullingLab.benchmark)return;
 if(radialOpen()){event.preventDefault();return;}
 if(!gameInputActive())return;
 if(creationPreview){
  event.preventDefault();
  const delta=event.deltaY*(savedPreferences.invertPieceRotation?-1:1);
  if(!delta)return;
  const turns=creationPreview.turns;
  let next;
  creationPreview.freeRotation=event.shiftKey||shiftDown();
  if(creationPreview.freeRotation){const pixels=delta*(event.deltaMode===1?16:event.deltaMode===2?120:1);next=turns+pixels/900;}
  else next=delta>0?Math.floor(turns+1e-9)+1:Math.ceil(turns-1e-9)-1;
  creationPreview.turns=((next%4)+4)%4;updateCreationPlacement();return;
 }
 if(keys.has('KeyC')){
  event.preventDefault();posture.crouchHeight=clamp(posture.crouchHeight-Math.sign(event.deltaY)*.08,.42,1.15);redraw=true;return;
 }
 if(!held||!storyLookAllowed()||storySuspended()||story.transition)return;
 event.preventDefault();held.distance=clamp(held.distance+(event.distanceAction??Math.sign(event.deltaY)*(savedPreferences.invertObjectDistance?1:-1))*.07,.3,2.5);redraw=true;
}
canvas.addEventListener('wheel',handleWheel,{passive:false});
function handleKey(event){
 if(robotPoseDraft){
  if(['Escape','KeyP','Enter','KeyE'].includes(event.code)){
   event.preventDefault();if(['Enter','KeyE'].includes(event.code))confirmRobotPoseDraft();else returnRobotPosePanel();return;
  }
  if(!['KeyW','KeyA','KeyS','KeyD','KeyC','ShiftLeft','ShiftRight'].includes(event.code))return;
 }
 if(powerDraft&&event.code==='Escape'){event.preventDefault();cancelPowerCable();announce('Cable cancelado · material conservado');return;}
 if(tabletVisible()&&['KeyW','KeyA','KeyS','KeyD','KeyC'].includes(event.code)){event.preventDefault();keys.add(event.code);return;}
 if(tabletVisible()&&event.code==='KeyQ'&&!puzzle.active&&!event.repeat&&!event.altKey&&!event.ctrlKey&&!event.metaKey){
  event.preventDefault();closeWorkshopPanel(false);switchPanelTab('catalog');return;
 }
 if(tabletVisible()&&['KeyP','Escape'].includes(event.code)){event.preventDefault();if(!event.repeat)stowTablet();return;}
 if(workshopPanel?.isOpen){event.preventDefault();if(['Escape','KeyE','KeyP'].includes(event.code))closeWorkshopPanel(true);return;}
 if(shelfPreview){if(['Escape','KeyP'].includes(event.code)){event.preventDefault();cancelShelfPlacement();announce('Colocación cancelada');return;}if(event.code==='KeyE'){event.preventDefault();confirmShelfPlacement();return;}if(!['KeyW','KeyA','KeyS','KeyD','KeyC','ShiftLeft','ShiftRight'].includes(event.code))return;}
 if(settingsScreen?.isOpen)return;
 if(radialOpen()){
  event.preventDefault();
  if(event.code==='Escape')closeUnitRadial(false);
  else if(event.code==='Tab')unitRadial.switchTab();
  else if(['PageUp','PageDown'].includes(event.code))unitRadial.changePage(event.code==='PageUp'?-1:1);
  else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.code))unitRadial.chooseNext(event.code==='ArrowLeft'||event.code==='ArrowUp'?-1:1);
  return;
 }
 if(event.code==='KeyQ'&&!event.repeat&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&unitRadialAllowed()){
  event.preventDefault();if(story.scene==='lab'){if(powerDraft)return;openPanel();switchPanelTab('catalog');}else openUnitRadial();return;
 }
 if(event.code==='Escape'&&pendingUnitCreation){event.preventDefault();cancelUnitCreation();announce('Creación cancelada');return;}
 if(storyInput(event))return;
 speech.lastInput=simTime;
 if(event.code==='Escape'){closeCommandMenu(false);moveChoice=null;pendingCargo=null;routeInspection=null;if(!menu.hidden)closeDetachMenu(false);finishMarquee(true);pause();return;}
 const editing=['INPUT','SELECT','BUTTON'].includes(document.activeElement?.tagName);
 if(event.code==='KeyP'&&!event.repeat&&!editing){event.preventDefault();if(panel.hidden)openPanel();else stowTablet();return;}
 if(!gameInputActive())return;
 if(event.code.startsWith('Alt')&&!held&&!marquee&&!event.repeat){if(powerInspectionAvailable()){event.preventDefault();keys.add(event.code);redraw=true;return;}const inspection=inspectionNearPin();if(inspection){event.preventDefault();routeInspection=inspection;keys.add(event.code);return;}const hit=aimQubit()||selected;if(hit?.g.parts.length>1){event.preventDefault();openDetachMenu(hit);return;}}
 if(['ShiftLeft','ShiftRight','ControlLeft','ControlRight','AltLeft','AltRight','KeyW','KeyA','KeyS','KeyD','KeyC'].includes(event.code)){
  event.preventDefault();
  if(event.code.startsWith('Shift')&&held&&!shiftDown()){
   if(!held.stable){
    // A face remains a natural grab point for dragging. During rotation
    // move the hand constraint to the centre and preserve its world target.
    const item=held.items[0],offset=item.g.body.quaternion.vmult(item.anchor);
    held.rootOffset.vsub(offset,held.rootOffset);
    item.anchorBody.position.vsub(offset,item.anchorBody.position);
    item.anchor.set(0,0,0);item.joint.pivotA.set(0,0,0);
   }
   held.rotation=held.g.body.quaternion.clone();held.initialRotation=held.rotation.clone();
   for(const item of held.items||[held]){
    item.initialQ=item.g.body.quaternion.clone();
    item.relative=sub(item.g.body.position,held.g.body.position);
   }
  }
  keys.add(event.code);return;
 }
 if(event.repeat)return;
 if(event.code==='KeyB'){event.preventDefault();startCreationTool('quick-cargo');}
 if(event.code==='KeyN'){event.preventDefault();if(creationPreview)confirmCreationPlacement();else startCreationTool(creationShape());}
 if(event.code==='KeyV'){event.preventDefault();duplicateSelection();}
 if(event.code==='KeyR'){event.preventDefault();restartSelection();}
 if(event.code==='KeyX'&&(event.altKey||altDown())){event.preventDefault();openDetachMenu(aimQubit()||selected);}
 if(event.code==='Delete'||event.code==='Backspace'){event.preventDefault();const c=aimCargo(4);if(c)deleteCargo(c.cargo);else deleteQubit(held||aimQubit()||selected);}
}
function updateTarget(){
 if(robotPoseDraft){
  const draft=robotPoseDraft,valid=!!draft.solution?.pose;
  crosshair.classList.toggle('ready',valid);
  targetLabel.textContent=({home:'Posición inicial',pick:'A · Tomar',place:'B · Soltar'}[draft.name])+' · '+draft.heightCm.toLocaleString('es-CL')+' cm · '+(valid?'Clic para guardar':draft.reason||'Apunta para marcar')+' · Rueda: altura · Esc: volver';
  return;
 }
 snap=findSnap();updateCallout();updateCargoCallout();updateMenuConnector();updateInspection();updatePuzzleHUD();updateMoodSelection();updateAlphaHUD();
 if(!gameInputActive()){targetLabel.textContent='';crosshair.classList.remove('ready');return;}
 const hit=held||aimQubit(),shelfTarget=!held&&aimShelf();crosshair.classList.toggle('ready',!!hit||!!shelfTarget);
 if(shelfPreview)targetLabel.textContent=shelfPreview.valid?(shelfPreview.snapped?'Repisa alineada · ':'')+'Clic / E · colocar · Esc · cancelar':shelfPreview.reason;
 else if(creationPreview)targetLabel.textContent=creationPreview.reason;
 else if(marquee)targetLabel.textContent='Suelta para seleccionar · hasta '+settings.maxSelect+' piezas';
 else if(held?.latched)targetLabel.textContent='Clic · soltar selección · Shift + WASD · girar'+(heldAssemblyGroups().length?' · Shift + sacudir · desarmar':' · rueda · enfocar');
 else if(held)targetLabel.textContent=snap?(snap.propellerTip?'Pala alineada · suelta para unir a la hélice':snap.rotorTip?(snap.servoKind?'Servo alineado · suelta para unir':'Puntas alineadas · suelta para formar Rotor'):snap.wholeFace?'Cara completa · suelta para unir':'Suelta para unir esta cara'):shiftDown()?'WASD · girar'+(heldAssemblyGroups().length?' · sacudir varias veces · desarmar':''):'Shift · girar / unir · rueda · enfocar · Ctrl · caída';
 else if(hit&&isExternalBattery(hit.part)){const info=externalBatteryPackInfo(hit.part.id);targetLabel.textContent=info.label+' · '+info.percent+' % · '+(info.enabled?'activa':'apagada')+' · clic derecho: batería';}
 else if(shelfTarget&&(!hit||shelfTarget.distance<(hit.distance??Infinity))){const cell=shelfTarget.shelf.cells[shelfTarget.cellIndex];targetLabel.textContent='Compartimento '+(shelfTarget.cellIndex+1)+' · '+(cell.category?.label||'Vacío')+' · '+cell.items.length+'/50 · clic derecho: organizar';}
 else if(selectedRotors().length)targetLabel.textContent=(activeRotorSet()?.name||'Selección de rotores')+' · '+selectedRotors().length+' · Ctrl + clic: añadir / quitar · clic derecho o P: controles';
 else if(aimWorkshop()){targetLabel.textContent=hit?'Clic derecho · propiedades de la pieza | E · mesa de trabajo':'E · mesa de trabajo | clic derecho · retirar';crosshair.classList.add('ready');}
 else if(selectedTeam().length)targetLabel.textContent='Clic derecho en el suelo · dar destino | clic izquierdo · deseleccionar';
 else if(hit)targetLabel.textContent=totalWeight(hit.g)>settings.maxCarry?'Supera la capacidad de '+formatWeight(settings.maxCarry)+' u':'Clic · tomar | clic derecho · seleccionar';else targetLabel.textContent=aimCargo(4)?'Clic derecho · órdenes del cuerpo':wallAim()?'Clic derecho · organización de pared':'';
 if(!held&&!pendingUnitCreation&&!marquee&&story.scene==='lab'&&!puzzle.active){const text=powerTargetText();if(text)targetLabel.textContent=text;}
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
function buffer(data){const b=gl.createBuffer();let radius=0;for(let i=0;i+2<data.length;i+=6)radius=Math.max(radius,Math.hypot(data[i],data[i+1],data[i+2]));geometryRadii.set(b,radius);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);return b;}
const cubeVertexData=vertices.slice(roomVertexCount),cubeGeometry=buffer(cubeVertexData);vertices.length=roomVertexCount;
const unitMeshes={cube:{buffer:cubeGeometry,count:36,data:cubeVertexData}};
for(const shape of ['tetra','pyramid','coupler']){
 const profile=unitProfile(shape),data=[],edges=[];
 for(let i=0;i<profile.faces.length;i++){const f=profile.faces[i],n=profile.faceNormals[i];for(let j=1;j<f.length-1;j++)for(const k of [f[0],f[j],f[j+1]]){const v=profile.vertices[k];data.push(v.x/CUBE_SIZE,v.y/CUBE_SIZE,v.z/CUBE_SIZE,n.x,n.y,n.z);}}
 for(const edge of profile.edges)for(const k of edge){const v=profile.vertices[k];edges.push(v.x/CUBE_SIZE,v.y/CUBE_SIZE,v.z/CUBE_SIZE,0,1,0);}
 unitMeshes[shape]={buffer:buffer(data),count:data.length/6,data,edgeBuffer:buffer(edges),edgeCount:edges.length/6};
}
const faceGuideGeometry=gl.createBuffer();
face([[-.5,0,-.5],[.5,0,-.5],[.5,0,.5],[-.5,0,.5]],[0,1,0]);
const shadowGeometry=buffer(vertices.slice(roomVertexCount));vertices.length=roomVertexCount;
const ringVertices=[];for(let i=0;i<48;i++)for(const n of [i,i+1]){const t=n/48*Math.PI*2;ringVertices.push(Math.cos(t),0,Math.sin(t),0,1,0);}
const ringGeometry=buffer(ringVertices),lineGeometry=gl.createBuffer();
const attributes=[['aPosition',0],['aNormal',12],['aPiecePosition',0],['aPieceNormal',12]].map(([name,offset])=>[gl.getAttribLocation(program,name),offset]);
let boundGeometry=null;
function bindGeometry(b,batched=false){if(boundGeometry===b)return;gl.bindBuffer(gl.ARRAY_BUFFER,b);for(let i=0;i<attributes.length;i++){const [loc,offset]=attributes[i];gl.vertexAttribPointer(loc,3,gl.FLOAT,false,batched?48:24,offset+(batched&&i>1?24:0));}boundGeometry=b;}
function setPose(pos,q=Q(),dimensions=V(CUBE_SIZE,CUBE_SIZE,CUBE_SIZE)){
 gl.uniform3f(uniforms.uCenter,pos.x,pos.y,pos.z);gl.uniform4f(uniforms.uQuaternion,q.x,q.y,q.z,q.w);gl.uniform3f(uniforms.uDimensions,dimensions.x,dimensions.y,dimensions.z);
}
function tint(r,g,b,a){gl.uniform4f(uniforms.uTint,r,g,b,a);}
function drawBox(pos,q,dimensions,color){if(!renderSphereVisible(pos,Math.hypot(dimensions.x,dimensions.y,dimensions.z)/2))return;bindGeometry(cubeGeometry);gl.uniform1f(uniforms.uKind,3);setPose(pos,q,dimensions);tint(...color);submitDraw(gl.TRIANGLES,0,36);}
function drawUnitMesh(pose,color=null,kind=null){const shape=unitShape(pose),mesh=unitMeshes[shape];if(!renderSphereVisible(pose.p,(geometryRadii.get(mesh.buffer)||1)*CUBE_SIZE))return;bindGeometry(mesh.buffer);gl.uniform1f(uniforms.uKind,kind??(shape==='cube'?1:5));setPose(pose.p,pose.q);if(shape==='coupler'&&!color&&kind===null){tint(.20,.23,.24,1);submitDraw(gl.TRIANGLES,0,30);tint(.53,.59,.58,1);submitDraw(gl.TRIANGLES,30,12);return;}if(color)tint(...color);else if(shape!=='cube')tint(.48,.48,.48,1);submitDraw(gl.TRIANGLES,0,mesh.count);}
function drawUnitFaceGuide(face){
 const points=face.vertices.map(p=>add(p,mul(face.normal,.0007))),data=[];
 for(let i=1;i<points.length-1;i++)for(const p of [points[0],points[i],points[i+1]])data.push(p.x,p.y,p.z,face.normal.x,face.normal.y,face.normal.z);
 gl.bindBuffer(gl.ARRAY_BUFFER,faceGuideGeometry);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);bindGeometry(faceGuideGeometry);gl.uniform1f(uniforms.uKind,3);setPose(V(),Q(),V(1,1,1));tint(.12,.64,.67,.4);submitDraw(gl.TRIANGLES,0,data.length/6);
 drawLines(points.flatMap((p,i)=>[p,points[(i+1)%points.length]]),[.18,.67,.69,.95]);
}
function drawRing(pos,radius,alpha,color=[.12,.36,.36]){if(!renderSphereVisible(pos,radius))return;bindGeometry(ringGeometry);gl.uniform1f(uniforms.uKind,3);setPose(pos,Q(),V(radius,1,radius));tint(...color,alpha);submitDraw(gl.LINES,0,96);}
function drawLines(points,color){
 if(!points.length)return;const data=[];for(const p of points)data.push(p.x,p.y,p.z,0,1,0);
 gl.bindBuffer(gl.ARRAY_BUFFER,lineGeometry);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);bindGeometry(lineGeometry);
 gl.uniform1f(uniforms.uKind,3);setPose(V(),Q(),V(1,1,1));tint(...color);submitDraw(gl.LINES,0,points.length);
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
// Battery visuals share the existing rigid pieces. A pack is combined only
// across adjacent cells in the same body, so a split never bridges empty space
// or hides a neighbouring ordinary Q-bit inside a large opaque block.
function batteryVisualPacks(g){
 const cells=g.parts.filter(part=>isExternalBattery(part));if(!cells.length)return [];
 const packs=[],pending=new Set(cells);
 while(pending.size){
  const first=pending.values().next().value,packId=first.mood.externalBattery.packId,members=[first];pending.delete(first);
  for(let i=0;i<members.length;i++)for(const candidate of [...pending]){
   if(candidate.mood.externalBattery.packId===packId&&Math.abs(candidate.offset.distanceTo(members[i].offset)-CUBE_SIZE)<.0001){members.push(candidate);pending.delete(candidate);}
  }
  const ref=first.q,inverse=ref.inverse(),points=members.flatMap(part=>corners({part,shape:'cube',p:part.offset,q:part.q}).map(p=>inverse.vmult(sub(p,first.offset))));
  const low=V(...['x','y','z'].map(axis=>Math.min(...points.map(p=>p[axis])))),high=V(...['x','y','z'].map(axis=>Math.max(...points.map(p=>p[axis])))),size=sub(high,low);
  // Safe fallback for a modified/malformed pack: render each owned cell.
  const rectangular=Math.abs(size.x*size.y*size.z-members.length*CUBE_SIZE**3)<1e-7;
  const batches=rectangular?[{parts:members,local:add(first.offset,ref.vmult(mul(add(low,high),.5))),q:ref,size}]:members.map(part=>({parts:[part],local:part.offset,q:part.q,size:V(CUBE_SIZE,CUBE_SIZE,CUBE_SIZE)}));
  for(const pack of batches)packs.push({body:g.body,parts:pack.parts,p:add(g.body.position,g.body.quaternion.vmult(pack.local)),q:g.body.quaternion.mult(pack.q),size:pack.size,fraction:clamp(pack.parts.reduce((sum,part)=>sum+part.mood.energy,0)/pack.parts.length,0,1),enabled:pack.parts.some(part=>part.mood.externalBattery.enabled)});
 }
 return packs;
}
// Liquid motion belongs to visual state only: never to a piece's saved energy.
// A body plus owned cell IDs identifies a contiguous vessel. Splits, storage and
// scene changes dispose its GPU buffer rather than recycling an unrelated wave.
const batteryLiquids=new Map();
function batteryLiquidSize(pack){return [Math.max(.02,pack.size.x-.012),Math.max(.02,pack.size.y-.014),Math.max(.02,pack.size.z-.012)];}
function batteryLiquidEntry(pack){
 const partIds=pack.parts.map(part=>part.id).sort((a,b)=>a-b),key=pack.body.id+':'+partIds.join(',');let entry=batteryLiquids.get(key);
 if(!entry){entry={key,body:pack.body,partIds,state:QBitsBatteryLiquid.createState(),normal:[0,1,0],localNormal:[0,1,0],size:batteryLiquidSize(pack),fraction:pack.fraction,buffer:null,data:null,count:0,signature:null,offset:0,meshBuilds:0,uploads:0};batteryLiquids.set(key,entry);}
 entry.size=batteryLiquidSize(pack);entry.fraction=pack.fraction;return entry;
}
function resetBatteryLiquids(body=null){
 for(const [key,entry]of batteryLiquids)if(!body||entry.body===body){if(entry.buffer)deleteRenderBuffer(entry.buffer);batteryLiquids.delete(key);}
 boundGeometry=null;
}
function updateBatteryLiquids(dt,paused=false){
 const alive=new Set();for(const g of groups)for(const pack of batteryVisualPacks(g)){
  const entry=batteryLiquidEntry(pack),offset=sub(pack.p,pack.body.position),velocity=add(pack.body.velocity,pack.body.angularVelocity.cross(offset));alive.add(entry.key);
  entry.normal=QBitsBatteryLiquid.updateState(entry.state,{position:[pack.p.x,pack.p.y,pack.p.z],quaternion:[pack.q.x,pack.q.y,pack.q.z,pack.q.w],velocity:[velocity.x,velocity.y,velocity.z],angularVelocity:[pack.body.angularVelocity.x,pack.body.angularVelocity.y,pack.body.angularVelocity.z],dt,paused},entry.size,pack.fraction).slice();
 }
 for(const [key,entry]of batteryLiquids)if(!alive.has(key)){if(entry.buffer)deleteRenderBuffer(entry.buffer);batteryLiquids.delete(key);boundGeometry=null;}
 return batteryLiquids.size;
}
function batteryLiquidMesh(pack){
 const entry=batteryLiquidEntry(pack),q=[pack.q.x,pack.q.y,pack.q.z,pack.q.w];entry.localNormal=QBitsBatteryLiquid.localNormal(entry.normal,q);
 // Quantization bounds invisible sub-micrometre variation and avoids rebuilding
 // a resting vessel because of solver noise. Rotation still reclips its volume.
 const normal=entry.localNormal.map(n=>Math.round(n*100000)/100000),fraction=Math.round(pack.fraction*100000)/100000,signature=[...entry.size,...normal,fraction].join(':');
 if(entry.signature!==signature){
  const mesh=QBitsBatteryLiquid.fillMesh(entry.size,normal,fraction),count=mesh.positions.length/3;entry.signature=signature;entry.offset=mesh.offset;entry.count=count;entry.meshBuilds++;
  if(count){
   if(!entry.buffer){entry.buffer=gl.createBuffer();entry.data=new Float32Array(Math.max(128,count)*6);gl.bindBuffer(gl.ARRAY_BUFFER,entry.buffer);gl.bufferData(gl.ARRAY_BUFFER,entry.data,gl.DYNAMIC_DRAW);}
   else gl.bindBuffer(gl.ARRAY_BUFFER,entry.buffer);
   if(entry.data.length<count*6){entry.data=new Float32Array(count*6);gl.bufferData(gl.ARRAY_BUFFER,entry.data,gl.DYNAMIC_DRAW);}
   for(let i=0;i<count;i++)for(let axis=0;axis<3;axis++){entry.data[i*6+axis]=mesh.positions[i*3+axis];entry.data[i*6+3+axis]=mesh.normals[i*3+axis];}
   gl.bufferSubData(gl.ARRAY_BUFFER,0,entry.data.subarray(0,count*6));entry.uploads++;boundGeometry=null;
  }
 }
 return entry;
}
function batteryLiquidDebug(){return [...batteryLiquids.values()].map(entry=>({key:entry.key,bodyId:entry.body.id,partIds:entry.partIds.slice(),normal:entry.normal.slice(),localNormal:entry.localNormal.slice(),size:entry.size.slice(),fraction:entry.fraction,meshBuilds:entry.meshBuilds,uploads:entry.uploads,buffer:entry.buffer,count:entry.count}));}
function drawBatteryOpaque(pack){
 const size=pack.size,at=offset=>add(pack.p,pack.q.vmult(offset)),shell=V(size.x-.002,size.y-.002,size.z-.002),rim=.004;
 // A continuous base and cap make a two/three-cell conversion read as one
 // larger battery, while keeping exactly the original collision dimensions.
 drawAsset({buffer:cubeGeometry,count:36},at(V(0,-shell.y/2+rim/2,0)),pack.q,V(shell.x,rim,shell.z),[.17,.23,.21,1]);
 drawAsset({buffer:cubeGeometry,count:36},at(V(0,shell.y/2-rim/2,0)),pack.q,V(shell.x,rim,shell.z),[.32,.40,.37,1]);
 if(pack.fraction>1e-6){
  const liquid=batteryLiquidMesh(pack);
  if(liquid.count){gl.uniform1f(uniforms.uTime,simTime);gl.uniform3fv(uniforms.uLiquidNormal,liquid.normal);gl.uniform4f(uniforms.uLiquidPlane,...liquid.localNormal,liquid.offset);drawAsset({buffer:liquid.buffer,count:liquid.count},pack.p,pack.q,V(1,1,1),[.045,.73,.30,1],15);}
 }
 // Flush contacts remain inside the old cube silhouette and cannot snag on
 // nearby wheels. The small port distinguishes switched-on from idle packs.
 const terminalY=shell.y/2+.0002;
 drawBox(at(V(-Math.min(.015,shell.x*.2),terminalY,0)),pack.q,V(.009,.0008,.009),[.63,.69,.65,1]);
 drawBox(at(V(Math.min(.015,shell.x*.2),terminalY,0)),pack.q,V(.009,.0008,.009),[.63,.69,.65,1]);
 const indicator=pack.enabled?(pack.fraction>1e-6?[.18,.94,.47,1]:[.82,.38,.18,1]):[.44,.50,.47,1];
 drawBox(at(V(0,-shell.y/2+.003,shell.z/2+.0001)),pack.q,V(.012,.003,.001),indicator);
}
function drawBatteryGlass(pack){
 const size=V(pack.size.x-.001,pack.size.y-.001,pack.size.z-.001);
 drawAsset({buffer:cubeGeometry,count:36},pack.p,pack.q,size,[.7,.9,.8,1],16);
}
function drawBatteriesTransparent(){
 const packs=groups.filter(renderGroupVisible).flatMap(batteryVisualPacks).sort((a,b)=>b.p.distanceTo(V(...camera))-a.p.distanceTo(V(...camera)));
 if(!packs.length)return;
 gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
 for(const pack of packs)drawBatteryGlass(pack);
 gl.depthMask(true);gl.disable(gl.BLEND);
}
function drawRobotArmLights(){
 for(const arm of robotArms){
  const base=robotGripperHit(arm.baseId);if(!base)continue;
  const signal=robotArmSignal(arm),pulse=.32+.68*(.5-.5*Math.cos(simTime*Math.PI*2/2.8));
  const color=signal==='blocked'?[1,.12,.08,1]:signal==='off'?[.16,.24,.22,1]:[.14*(signal==='waiting'?pulse:1),.94*(signal==='waiting'?pulse:1),.48*(signal==='waiting'?pulse:1),1];
  drawBox(add(base.p,base.q.vmult(V(0,HALF+.004,0))),base.q,V(.021,.011,.021),color);
 }
}
function drawGripperMark(pose){
 const active=robotGrips.has(pose.part.id),config=pose.part.mood.gripper;
 const color=active?[.19,.78,.49,1]:[.76,.43,.16,1],at=v=>add(pose.p,pose.q.vmult(v));
 for(const sign of [-1,1]){
  drawBox(at(V(sign*.036,-HALF-.0004,0)),pose.q,V(.006,.001,.077),color);
  drawBox(at(V(0,-HALF-.0004,sign*.036)),pose.q,V(.077,.001,.006),color);
 }
 const sensor=config.mode==='color'?[1,3,5].map(i=>parseInt(config.color.slice(i,i+2),16)/255).concat(1):color;
 drawBox(at(V(0,-.026,HALF+.0003)),pose.q,V(.026,.006,.001),sensor);
}
// The completed blueprint's skin sits exactly on its finite contact surface.
// Roller bodies remain visible below it; these boxes add no Q-bit or reservoir.
function drawConveyors(){
 if(typeof conveyorSurfacePoses!=='function')return;
 for(const conveyor of conveyors){let travelled=0;
  for(const pose of conveyorSurfacePoses(conveyor)){
   drawAsset({buffer:cubeGeometry,count:36},pose.p,pose.q,pose.size,[.115,.14,.135,1]);
   const length=pose.size.x,spacing=.18,phase=Number.isFinite(conveyor.phase)?conveyor.phase:0,offset=((phase-travelled)%spacing+spacing)%spacing;
   const color=conveyor.running?[.80,.47,.17,1]:[.46,.34,.21,1];
   for(let x=-length/2+offset;x<length/2-.012;x+=spacing){if(x<-length/2+.012)continue;
    const p=add(pose.p,pose.q.vmult(V(x,pose.size.y/2+.0006,0)));
    drawBox(p,pose.q,V(.012,.001,.045),color);
   }
   travelled+=length;
  }
 }
}
function drawConveyorBlueprintArrows(bp,targets){
 for(const conveyor of bp.shape.mechanism?.conveyors||[]){
  const base=targets.find(part=>part.key===conveyor.base);if(!base||!conveyor.ports)continue;
  for(const name of ['entry','exit']){const port=conveyor.ports[name];if(!port)continue;
   const local=add(V(...port.p),V(0,HALF*Math.SQRT2+.01,0)),p=add(base.p,base.q.vmult(local)),direction=mul(V(...port.direction),conveyor.direction===-1?-1:1),turn=Q();turn.setFromVectors(V(1,0,0),direction);turn.normalize();const q=base.q.mult(turn),color=[.86,.50,.18,.8];
   drawBox(p,q,V(.075,.002,.005),color);
   for(const sign of [-1,1]){const head=Q();head.setFromAxisAngle(V(0,1,0),sign*Math.atan2(.02,.03));drawBox(add(p,q.vmult(V(.03,0,sign*.01))),q.mult(head),V(Math.hypot(.03,.02),.002,.007),color);}
  }
 }
}
// One immutable mesh per material for any rigid assembly: cubes, both T-bits
// and both coupler finishes. Original piece-local shading stays intact. Battery
// glass/liquid and gripper markings retain their own dynamic render passes.
function disposeRigidCubeBatch(g){
 const entry=g.rigidCubeBatch;if(!entry)return;
 for(const batch of entry.batches||[entry])if(batch.buffer){deleteRenderBuffer(batch.buffer);if(boundGeometry===batch.buffer)boundGeometry=null;}
 delete g.rigidCubeBatch;
}
// Remove only full, coincident opposing faces inside one rigid body. Keep
// the original pieces and colliders: separation rebuilds the mesh and exposes
// the recovered faces. Different bodies (including rollers) never occlude one
// another here, so rotating, separating or inspecting a module stays correct.
function rigidHiddenFaces(parts){
 const hidden=new Map(),faces=new Map(),key=v=>[v.x,v.y,v.z].map(n=>Math.round(n*1e8)).join(',');
 for(const part of parts){const profile=unitProfile(part);for(let i=0;i<profile.faces.length;i++){
  const normal=part.q.vmult(profile.faceNormals[i]),signature=profile.faces[i].map(index=>key(add(part.offset,part.q.vmult(profile.vertices[index])))).sort().join(';'),opposite=faces.get(signature);
  if(opposite&&opposite.part!==part&&opposite.normal.dot(normal)<-.999999){
   if(!hidden.has(part))hidden.set(part,new Set());if(!hidden.has(opposite.part))hidden.set(opposite.part,new Set());
   hidden.get(part).add(key(profile.faceNormals[i]));hidden.get(opposite.part).add(opposite.normalKey);
  }else faces.set(signature,{part,normal,normalKey:key(profile.faceNormals[i])});
 }}
 return hidden;
}
function rigidCubeBatch(g){
 if(g.parts.length<4){disposeRigidCubeBatch(g);return null;}
 let entry=g.rigidCubeBatch,valid=entry?.parts===g.parts&&entry.local.length===g.parts.length;
 if(valid)for(let i=0;i<g.parts.length;i++){
  const p=g.parts[i],local=entry.local[i];
  if(local.part!==p||local.shape!==unitShape(p)||local.battery!==isExternalBattery(p)||local.x!==p.offset.x||local.y!==p.offset.y||local.z!==p.offset.z||local.qx!==p.q.x||local.qy!==p.q.y||local.qz!==p.q.z||local.qw!==p.q.w){valid=false;break;}
 }
 if(valid)return entry.batches.length?entry:null;
 disposeRigidCubeBatch(g);
 const local=g.parts.map(p=>({part:p,shape:unitShape(p),battery:isExternalBattery(p),x:p.offset.x,y:p.offset.y,z:p.offset.z,qx:p.q.x,qy:p.q.y,qz:p.q.z,qw:p.q.w}));
 const blades=new Set(propellerLayout(g).flatMap(m=>m.blades)),solidParts=g.parts.filter(part=>!isExternalBattery(part)&&!blades.has(part)),hiddenFaces=rigidHiddenFaces(solidParts);
 const materials=new Map(),append=(key,kind,color,part,first,count)=>{
  let material=materials.get(key);if(!material){material={kind,color,data:[]};materials.set(key,material);}
  const data=unitMeshes[unitShape(part)].data;
  for(let i=first*6;i<(first+count)*6;i+=6){
   if(hiddenFaces.get(part)?.has([data[i+3],data[i+4],data[i+5]].map(n=>Math.round(n*1e8)).join(',')))continue;
   const position=add(part.offset,part.q.vmult(V(data[i]*CUBE_SIZE,data[i+1]*CUBE_SIZE,data[i+2]*CUBE_SIZE))),normal=part.q.vmult(V(data[i+3],data[i+4],data[i+5]));
   material.data.push(position.x,position.y,position.z,normal.x,normal.y,normal.z,...data.slice(i,i+6));
  }
 };
 for(const part of solidParts){
  const shape=unitShape(part);
  if(shape==='coupler'){append('coupler',5,[.20,.23,.24,1],part,0,30);append('tip',5,[.53,.59,.58,1],part,30,12);}
  else append(shape==='cube'?'cube':'tbit',shape==='cube'?1:5,shape==='cube'?null:[.48,.48,.48,1],part,0,unitMeshes[shape].count);
 }
 const batches=[];for(const [key,material]of materials)batches.push({key,kind:material.kind,color:material.color,count:material.data.length/12,buffer:buffer(material.data)});
 boundGeometry=null;const cubes=batches.find(b=>b.key==='cube');
 g.rigidCubeBatch={parts:g.parts,local,batches,hiddenFaceCount:[...hiddenFaces.values()].reduce((n,set)=>n+set.size,0),count:cubes?.count||0,buffer:cubes?.buffer||null};return batches.length?g.rigidCubeBatch:null;
}
function drawGroupSolid(g){
 if(g.virtualConveyor)syncVirtualConveyorGroup(g);
 if(!renderGroupVisible(g))return;
 const batteries=batteryVisualPacks(g);
 if(g.block&&!batteries.length){disposeRigidCubeBatch(g);const p=moodVisualPose(g,blockPose(g));bindGeometry(cubeGeometry);gl.uniform1f(uniforms.uKind,1);setPose(p.p,p.q,p.size);submitDraw(gl.TRIANGLES,0,36);}
 else {
  const batch=rigidCubeBatch(g);
  if(batch)for(const material of batch.batches){bindGeometry(material.buffer,true);gl.uniform1f(uniforms.uKind,material.kind);setPose(g.body.position,g.body.quaternion,V(1,1,1));if(material.color)tint(...material.color);submitDraw(gl.TRIANGLES,0,material.count);}
  const blades=new Set(propellerLayout(g).flatMap(m=>m.blades));
  for(const part of g.parts)if(!isExternalBattery(part)&&(!batch||blades.has(part))){const p=propellerVisualPose(g,part);drawUnitMesh(g.parts.length===1?{...moodVisualPose(g,p),part}:p);}
 }
 for(const battery of batteries)drawBatteryOpaque(battery);
 for(const part of g.parts)if(part.mood.gripper)drawGripperMark(partPose(g,part));
}
function drawQubits(){
 bindGeometry(shadowGeometry);gl.uniform1f(uniforms.uKind,2);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
 if(visuals.shadows!=='off')for(const g of groups){if(renderVisibility.active&&!renderShadowVisible(g))continue;if(renderVisibility.active)renderVisibility.shadowGroups++;for(const p of g.virtualConveyor?g.parts.map(part=>virtualConveyorVisualPose(g,part)):poses(g)){
  if(visuals.shadows==='sharp'){drawSharpShadow(p);bindGeometry(shadowGeometry);gl.uniform1f(uniforms.uKind,2);continue;}
  const height=Math.max(0,p.p.y-HALF),scale=.23+Math.min(height,2)*.18;
  setPose(V(p.p.x,.001,p.p.z),Q(),V(scale,scale,scale));gl.uniform1f(uniforms.uScale,scale);gl.uniform1f(uniforms.uShadow,.22/(1+height*3));submitDraw(gl.TRIANGLES,0,6);
 }}
 gl.depthMask(true);gl.disable(gl.BLEND);
 for(const g of groups){if(!renderGroupVisible(g))continue;if(g.parts.some(p=>p.mood.production)){for(const p of poses(g))drawBox(p.p,p.q,V(CUBE_SIZE-.002,CUBE_SIZE-.002,CUBE_SIZE-.002),p.part.mood.production?.kind==='A'?[.27,.56,.67,1]:p.part.mood.production?[.72,.53,.26,1]:[.12,.14,.13,1]);if(g.parts.length===2)drawOutline(g.body.position,g.body.quaternion,sub(bounds(g,V(),Q()).max,bounds(g,V(),Q()).min),.8,false);}else drawGroupSolid(g);}
 drawConveyors();drawCargos();drawPuzzle();drawAlpha();drawWorkshop();drawShelves();drawDisassembly();drawCreationPlacement();drawRobotArmLights();drawRobotPoseDraft();drawPowerReservoirs();drawPowerCables();drawBatteriesTransparent();drawStructureOutlines();drawServoGuides();drawGuides();drawTaskGuides();
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
 const candidates=[];
 for(const o of orientations){
  // The 24 grid orientations only permute/sign the local box axes.
  const q=target.body.quaternion.mult(o),rotated=o.vmult(source.block.size),size=V(Math.abs(rotated.x),Math.abs(rotated.y),Math.abs(rotated.z));
  if(['x','y','z'].some(k=>Math.abs(size[k]-target.block.size[k])>.001))continue;
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
   const k=['x','y','z'][axis],normal=targetPose.q.vmult(mul(axes[axis],sign));
   const center=add(targetPose.p,mul(normal,(target.block.size[k]+size[k])/2));
   const distance=center.distanceTo(sourcePose.p);if(distance>limit)continue;
   const position=sub(center,q.vmult(source.block.center));
   const score=distance+(1-qSimilarity(q,source.body.quaternion))*.025;
   candidates.push({source,target,position,quaternion:q,score,wholeFace:true,face:{p:add(targetPose.p,mul(normal,target.block.size[k]/2+.001)),normal,q:targetPose.q,axis,dimensions:target.block.size}});
  }
 }
 // Equivalent box orientations often propose the same face. Validate in score
 // order, then stop at the first clear placement of the entire mechanism.
 candidates.sort((a,b)=>a.score-b.score);
 return candidates.find(candidate=>validSnapPose(source,candidate.position,candidate.quaternion,target))||null;
}
function cameraBasis(){return {forward:direction(),right:V(Math.cos(yaw),0,-Math.sin(yaw)),up:V(Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),Math.cos(yaw)*Math.sin(pitch))};}
function screenRay(x,y){const b=cameraBasis(),w=canvas.clientWidth,h=canvas.clientHeight,xx=(2*x/w-1)*(w/h)/heldFocus.focal,yy=(1-2*y/h)/heldFocus.focal;const d=add(add(b.forward,mul(b.right,xx)),mul(b.up,yy));d.normalize();return d;}
function project(p){return projectWithBasis(p,cameraBasis());}
function projectWithBasis(p,b,eye=camera){
 const x=p.x-eye[0],y=p.y-eye[1],z=p.z-eye[2],depth=x*b.forward.x+y*b.forward.y+z*b.forward.z;if(depth<=.04)return null;
 const h=previewViewport?.height||canvas.clientHeight,w=previewViewport?.width||canvas.clientWidth;
 return {x:w/2+(x*b.right.x+y*b.right.y+z*b.right.z)*heldFocus.focal*h/2/depth,y:h/2-(x*b.up.x+y*b.up.y+z*b.up.z)*heldFocus.focal*h/2/depth,depth};
}
function screenBounds(g){
 let cache=g.screenBoundsCache;
 if(!cache||cache.parts!==g.parts)cache=g.screenBoundsCache={parts:g.parts,points:g.parts.flatMap(part=>corners({part,p:part.offset,q:part.q})),stamp:null};
 const p=g.body.position,q=g.body.quaternion,stamp=[p.x,p.y,p.z,q.x,q.y,q.z,q.w,...camera,yaw,pitch,heldFocus.focal,previewViewport?.width||canvas.clientWidth,previewViewport?.height||canvas.clientHeight];
 if(cache.stamp&&stamp.every((v,i)=>v===cache.stamp[i]))return cache.bounds;
 const basis=cameraBasis(),world=V();let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
 for(const local of cache.points){q.vmult(local,world);world.vadd(p,world);const point=projectWithBasis(world,basis);if(!point)continue;left=Math.min(left,point.x);right=Math.max(right,point.x);top=Math.min(top,point.y);bottom=Math.max(bottom,point.y);}
 cache.stamp=stamp;return cache.bounds=left===Infinity?null:{left,right,top,bottom};
}
function visibleFromCamera(g){
 for(const pose of poses(g)){
  const ray=sub(pose.p,V(...camera)),distance=ray.norm();if(distance>4||distance<.01)continue;ray.normalize();const hit=aimQubit(distance+.1,ray);if(hit?.g===g)return true;
 }return false;
}
function selectRectangle(rect){
 clearRotorSelection();
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
 if(runningConveyorForGroups([hit.g])){announce('Cinta en funcionamiento · primero apaga o desconecta la cinta para separarla.');return;}
 const module=conveyorForPart(hit.part.id);
 document.querySelector('#detach-one').textContent=module?'Separar módulo completo':'Separar esta pieza';
 if(!module&&hit.g.parts.length===1){announce('Este '+unitLabel(hit.part)+' ya es una pieza independiente.');return;}
 closeCommandMenu(false);detachChoice={g:hit.g,part:hit.part};selected=hit;pause();stopRoute(hit.g);panel.hidden=true;
 const projected=project(partPose(hit.g,hit.part).p)||{x:canvas.clientWidth/2,y:canvas.clientHeight/2};
 const right=projected.x<canvas.clientWidth/2;
 menu.style.left=clamp(projected.x+(right?30:-218),12,Math.max(12,canvas.clientWidth-214))+'px';menu.style.top=clamp(projected.y-30,12,Math.max(12,canvas.clientHeight-160))+'px';
 menu.style.transformOrigin=right?'left center':'right center';document.querySelector('#detach-title').textContent=hit.g.parts.length+' '+groupUnitLabel(hit.g)+' · '+formatWeight(totalWeight(hit.g))+' u';
 connectMenu(menu,partPose(hit.g,hit.part).p);
}
function closeDetachMenu(resume=false){menu.hidden=true;detachChoice=null;if(menuConnector?.element===menu){menuConnector=null;document.querySelector('#menu-link').style.opacity='0';}if(resume)captureMouse();}
function applyDetachMenu(all){const choice=detachChoice;closeDetachMenu(false);if(choice&&groups.includes(choice.g)){const module=!all&&conveyorForPart(choice.part.id);if(module)detachConveyorModule(module);else detachPart(choice,all);}captureMouse();}
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
 if(originals.some(g=>g.parts.some(p=>p.mood?.externalBattery))){if(originals.length===1)return duplicateMechanism(originals[0]);announce('Selecciona un solo montaje para copiarlo con sus baterías. Las copias comienzan vacías.');return;}
 const count=originals.reduce((n,g)=>n+g.parts.length,0),population=scenePartCount();
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
 if(!renderSphereVisible(p,Math.hypot(size.x,size.y,size.z)/2+.02))return;
 const expanded=add(size,V(.0009,.0009,.0009)),points=[];
 for(let i=0;i<edgeData.length;i+=6)points.push(add(p,q.vmult(V(edgeData[i]*expanded.x,edgeData[i+1]*expanded.y,edgeData[i+2]*expanded.z))));
 drawWideLines(points,[...(selectedOutline?visualRGB('outlineColor'):visuals.style==='cel'?[.06,.09,.1]:[.48,.51,.54]),alpha],selectedOutline?visuals.outlineWidth:visuals.style==='cel'?visuals.outlineWidth:1);
}
function drawUnitOutline(pose,alpha=.7,selectedOutline=true){
 if(!isTBit(pose)){drawOutline(pose.p,pose.q,V(CUBE_SIZE,CUBE_SIZE,CUBE_SIZE),alpha,selectedOutline);return;}
 const profile=unitProfile(pose),points=profile.edges.flatMap(edge=>edge.map(i=>add(pose.p,pose.q.vmult(mul(profile.vertices[i],1.008)))));
 drawWideLines(points,[...(selectedOutline?visualRGB('outlineColor'):[.1,.15,.16]),alpha],visuals.outlineWidth);
}
function disposeRigidOutline(g){
 for(const batch of g.outlineCache?.batches||[]){deleteRenderBuffer(batch.buffer);if(boundGeometry===batch.buffer)boundGeometry=null;}
 delete g.outlineCache;
}
function drawRigidOutline(g,alpha,chosen){
 // Roller cartridges animate without physical bodies. Their three visible
 // parts use the same phase as the solid and shadow, never a frozen cache.
 if(g.virtualConveyor){for(const part of g.parts)drawUnitOutline(virtualConveyorVisualPose(g,part),alpha,chosen);return;}
 let cache=g.outlineCache;
 if(!cache||cache.parts!==g.parts){
  disposeRigidOutline(g);
  const pieces=g.parts.map(part=>{
   const tbit=isTBit(part),points=[];
   if(tbit){const profile=unitProfile(part);for(const edge of profile.edges)for(const i of edge)points.push(add(part.offset,part.q.vmult(mul(profile.vertices[i],1.008))));}
   else for(let i=0;i<edgeData.length;i+=6)points.push(add(part.offset,part.q.vmult(V(edgeData[i]*(CUBE_SIZE+.0009),edgeData[i+1]*(CUBE_SIZE+.0009),edgeData[i+2]*(CUBE_SIZE+.0009)))));
   return {tbit,points};
  });cache=g.outlineCache={parts:g.parts,pieces,batches:[],stamp:null};
 }
 // Screen-width strokes depend on the view, but selection itself does not
 // change their geometry. A still machine reuses its GPU buffer, including
 // when the outline color/opacity changes. Keep only the current view.
 const p=g.body.position,q=g.body.quaternion,basis=cullingLab.renderView?.basis||cameraBasis(),eye=cullingLab.renderView?.eye||camera;
 const stamp=[p.x,p.y,p.z,q.x,q.y,q.z,q.w,...eye,basis.forward.x,basis.forward.y,basis.forward.z,basis.right.x,basis.right.y,basis.right.z,basis.up.x,basis.up.y,basis.up.z,previewViewport?.width||canvas.clientWidth,previewViewport?.height||canvas.clientHeight,heldFocus.focal,visuals.outlineWidth,!!chosen];
 if(!cache.stamp||!stamp.every((value,i)=>value===cache.stamp[i])){
  if(cache.chosen!==!!chosen){
   let batchIndex=0,local=[],type=null;
   const flush=()=>{if(!local.length)return;const batch=cache.batches[batchIndex]||{buffer:gl.createBuffer(),data:[]};batch.type=type;batch.local=local;batch.points=local.map(()=>V());cache.batches[batchIndex++]=batch;local=[];};
   for(const piece of cache.pieces){if(!chosen&&type!==null&&type!==piece.tbit)flush();type=piece.tbit;for(const point of piece.points)local.push(point);}flush();
   while(cache.batches.length>batchIndex){const batch=cache.batches.pop();deleteRenderBuffer(batch.buffer);if(boundGeometry===batch.buffer)boundGeometry=null;}cache.chosen=!!chosen;
  }
  for(const batch of cache.batches){
   for(let i=0;i<batch.local.length;i++){const point=batch.points[i];q.vmult(batch.local[i],point);point.vadd(p,point);}
   const data=wideLineTriangles(batch.points,visuals.outlineWidth,batch.data);batch.count=data.length/6;
   if(!batch.upload||batch.upload.length<data.length)batch.upload=new Float32Array(data.length);batch.upload.set(data);
   gl.bindBuffer(gl.ARRAY_BUFFER,batch.buffer);gl.bufferData(gl.ARRAY_BUFFER,batch.upload.subarray(0,data.length),gl.DYNAMIC_DRAW);boundGeometry=null;
  }cache.stamp=stamp;
 }
 for(const batch of cache.batches)if(batch.count){bindGeometry(batch.buffer);gl.uniform1f(uniforms.uKind,3);setPose(V(),Q(),V(1,1,1));tint(...(chosen?visualRGB('outlineColor'):batch.type?[.1,.15,.16]:[.06,.09,.1]),alpha);submitDraw(gl.TRIANGLES,0,batch.count);}
}
function selectionGroups(){if(selectedRotors().length)return [];const chosen=new Set(multiSelection);if(selected?.g)chosen.add(selected.g);return groups.filter(g=>chosen.has(g));}
function selectionHudSnapshot(team=selectionGroups()){
 return team.map(g=>{
  let geometry=selectionHudGeometry.get(g);
  if(!geometry||geometry.source!==g.parts){
   geometry={source:g.parts,revision:g.parts.map(p=>p.id).join(','),parts:g.parts.map(p=>{const shape=unitShape(p),profile=unitProfile(p);return {id:p.id,p:[p.offset.x,p.offset.y,p.offset.z],q:[p.q.x,p.q.y,p.q.z,p.q.w],vertices:profile.vertices.map(v=>[v.x,v.y,v.z]),faces:profile.faces.map(face=>face.slice()),color:shape==='cube'?[.15,.18,.19]:shape==='coupler'?[.25,.30,.30]:[.48,.48,.48]};})};
   selectionHudGeometry.set(g,geometry);
  }
  const summary=moodSummary([g]),agitation=Math.max(0,...g.parts.map(p=>p.mood.agitation||0));
  return {id:g.body.id,name:g.parts[0].mood.name,count:g.parts.length,revision:geometry.revision,parts:geometry.parts,mood:summary.counts.restless?'restless':summary.counts.excited?'excited':'neutral',energy:summary.energy,agitation,shaking:agitation>.65||speech.shake?.id===g.parts[0].id};
 });
}
function selectFromHud(id,{toggle=false}={}){
 const g=groups.find(item=>item.body.id===id);if(!g||story.transition||story.mode!=='playing')return false;
 clearRotorSelection();
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
 const selectedGroups=new Set(selectionGroups());
 const rotorParts=new Set(selectedRotors().flatMap(r=>[r.aId,r.bId]));
 for(const g of groups){const visible=renderGroupVisible(g);if(!visible&&(!visuals.markers||!selectedGroups.has(g)))continue;const chosen=selectedGroups.has(g);
  if(visible){
   if(g.block){const p=moodVisualPose(g,blockPose(g));drawOutline(p.p,p.q,p.size,.88,chosen);}
   else if(chosen||visuals.style==='cel')drawRigidOutline(g,.85,chosen);
  }
  // A screen-space marker extends beyond its body's bound. Keep it separate
  // so a selected body just below the view does not hide its visible marker.
  if(chosen&&visuals.markers){const bb=bounds(g);drawSelectionMarker(V(bb.center.x,bb.max.y+.025,bb.center.z),simTime);}
  if(visible&&rotorParts.size)for(const pose of g.virtualConveyor?g.parts.map(part=>virtualConveyorVisualPose(g,part)):poses(g))if(rotorParts.has(pose.part.id))drawUnitOutline(pose,1,true);
 }
 if(visuals.markers)for(const rotor of selectedRotors()){const p=rotorMenuPoint(rotor);drawSelectionMarker(V(p.x,p.y+CUBE_SIZE*1.5,p.z),simTime);}
 gl.depthMask(true);gl.disable(gl.BLEND);
}
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas)finishMarquee(true);});


// Ground cargo: always cubic, never hand-grabbable. Quorum is counted in
// participating Q-bit pieces; payload size and required crew are independent.
function cargoBounds(c,p=c.body.position){if(c.robotPhysical){const points=corners({...cargoPose(c),p}),min=V(...['x','y','z'].map(k=>Math.min(...points.map(v=>v[k])))),max=V(...['x','y','z'].map(k=>Math.max(...points.map(v=>v[k]))));return {min,max,center:mul(add(min,max),.5),size:sub(max,min)};}if(c.dimensions){const h=mul(c.dimensions,.5);return {min:sub(p,h),max:add(p,h),center:p.clone(),size:c.dimensions.clone()};}const r=c.size/2;return {min:V(p.x-r,p.y-r,p.z-r),max:V(p.x+r,p.y+r,p.z+r),center:p.clone(),size:V(c.size,c.size,c.size)};}
function cargoPose(c){return {p:c.body.position,q:c.body.quaternion,half:c.dimensions?mul(c.dimensions,.5):V(c.size/2,c.size/2,c.size/2)};}
function navigationObstacles(g){return groups.filter(o=>o!==g).map(o=>bounds(o)).concat(cargos.map(c=>cargoBounds(c)),puzzleObstacleBounds(),alphaObstacles());}
function raycastCargo(max=8,dir=direction()){
 let result=null,best=puzzleRayLimit(max,dir);for(const c of cargos){if(c.intake!==undefined&&c.intake!==null)continue;const hit=rayPart(V(...camera),dir,cargoPose(c),best,c.size/2);if(hit&&hit.distance<best){best=hit.distance;result={...hit,cargo:c};}}return result;
}
function aimCargo(max=8,dir=direction()){const c=raycastCargo(max,dir);if(!c)return null;const q=aimQubit(c.distance,dir);return q?null:c;}
function newCargo(p,side=settings.cargoSide,required=settings.cargoRequired,color=settings.cargoColor){
 if(!Number.isInteger(side)||side<1||side>12||!Number.isInteger(required)||required<1||required>MAX_QUBITS||!/^#[0-9a-f]{6}$/i.test(color))return null;
 if(cargos.length>=12)return null;const size=side*CUBE_SIZE;
 const body=new CANNON.Body({mass:0});body.addShape(new CANNON.Box(V(size/2,size/2,size/2)));body.position.set(p.x,size/2,p.z);body.material=world.defaultMaterial;body.fixedRotation=true;body.linearDamping=.08;body.updateMassProperties();world.addBody(body);
 const c={id:++cargoSerial,side,size,required,color,body,job:null,pin:null,lastStatus:'En reposo'};body.cargoRef=c;cargos.push(c);return c;
}
function restoreLabCargo(record){
 const cargo=newCargo(record.p,record.side,record.required,record.color);if(!cargo)return null;
 if(Number.isSafeInteger(record.id)&&record.id>0&&!cargos.some(c=>c!==cargo&&c.id===record.id)){cargo.id=record.id;cargoSerial=Math.max(cargoSerial,cargo.id);}
 if(record.robotPhysical){const body=cargo.body;cargo.robotPhysical=true;body.mass=cargo.required*.25;body.type=CANNON.Body.DYNAMIC;body.fixedRotation=false;body.position.copy(record.p);if(record.q)body.quaternion.copy(record.q);if(record.v)body.velocity.copy(record.v);if(record.w)body.angularVelocity.copy(record.w);body.updateMassProperties();body.aabbNeedsUpdate=true;body.wakeUp();}
 return cargo;
}
function cargoPlacementClear(p,size,exclude=null,ignored=[]){
 const half=size/2;if(Math.abs(p.x)+half>13.98||Math.abs(p.z)+half>13.98)return false;
 const candidate={p:V(p.x,half,p.z),q:Q(),half:V(half,half,half)};
 if(alphaObstacles().some(w=>obbOverlap(candidate,w,-.004)))return false;
 if(puzzleObstacleBounds(exclude).some(w=>obbOverlap(candidate,{p:w.p,q:w.q||Q(),half:w.half},-.004)))return false;
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
 c.body.material=moving?haulMaterial:world.defaultMaterial;
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
function deleteCargo(c,internal=false){if(!internal&&puzzleBlockedEdit())return;if(!c||!cargos.includes(c))return;if(c.robotHeld)releaseGripper(c.robotHeld);stopHaul(c);world.removeBody(c.body);cargos.splice(cargos.indexOf(c),1);if(selectedCargo===c)selectedCargo=null;if(pendingCargo?.cargo===c)pendingCargo=null;announce('Cuerpo borrado');}
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
 for(const g of team){if(job.slots.some(s=>s.g===g)||!groups.includes(g)||rotorForGroup(g)||g.parts.some(p=>p.mood?.externalBattery))continue;
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
 if(c?.robotHeld){announce('Suelta primero el objeto del brazo.');return false;}
 if(c?.robotPhysical){if(cargoBounds(c).min.y>.015||c.body.velocity.norm()>.2){announce('Espera a que el cuerpo se apoye antes de arrastrarlo.');return false;}c.body.fixedRotation=true;c.body.updateMassProperties();}
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
   recordHaulFootstep(slot,bb.min.y<.055&&groupWilling(g));
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
 if(name==='cargoRequired'&&selectedCargo){const c=selectedCargo;if(c.robotHeld){const owner=robotGripperHit(c.robotHeld);if(owner)robotStopForGroups([owner.g]);else releaseGripper(c.robotHeld);}stopHaul(c);c.required=Math.round(value);if(c.robotPhysical){c.body.mass=c.required*.25;c.body.type=CANNON.Body.DYNAMIC;c.body.fixedRotation=false;c.body.updateMassProperties();c.body.wakeUp();}}updateCargoPanel();
});
document.querySelector('#cargoColor').addEventListener('input',e=>{if(puzzle.active)return;if(/^#[0-9a-f]{6}$/i.test(e.target.value)){settings.cargoColor=e.target.value;if(selectedCargo)selectedCargo.color=e.target.value;}});
document.querySelector('#create-cargo').addEventListener('click',()=>startCreationTool('quick-cargo'));
document.querySelector('#delete-cargo').addEventListener('click',()=>{deleteCargo(selectedCargo);updateCargoPanel();});

function closeCommandMenu(resume=false){commandMenu.hidden=true;commandState=null;menuConnector=null;document.querySelector('#menu-link').style.opacity='0';if(resume)captureMouse();}
function connectMenu(element,point){
 const p=project(point)||{x:canvas.clientWidth/2,y:canvas.clientHeight/2},side=p.x<canvas.clientWidth/2?1:-1;
 element.style.left=clamp(p.x+(side>0?115:-285),16,Math.max(16,canvas.clientWidth-225))+'px';element.hidden=false;const menuHeight=element.offsetHeight||250;element.style.top=clamp(p.y-25,20,Math.max(20,canvas.clientHeight-menuHeight-20))+'px';
 element.style.transformOrigin=side>0?'left center':'right center';element.hidden=false;
 menuConnector={element,point:point.clone(),started:simTime};
}
function openCommandMenu(point,title,items,restartGroup=null){
 if(mechanismRun(restartGroup)||neutralWalkerRun(restartGroup)){
  const index=items.findIndex(item=>item.label==='Cerrar');
  items.splice(index<0?items.length:index,0,{label:'Reiniciar conjunto',run:()=>{restartMechanism(restartGroup);captureMouse();}});
 }
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
 clearRotorSelection();
 multiSelection=[];selected=null;selectedCargo=null;pendingCargo=null;pendingPickup=null;moveChoice=null;routeInspection=null;
 speech.nextHud=0;document.querySelector('#selection').textContent='';
}
function onCanvasMouseDown(event){
 if(robotPoseDraft){robotPoseMouse(event);return;}
 if(powerDraft&&powerCableClick(event))return;
 if(workshopPanel?.isOpen)return;
 if(tabletVisible()&&event.button===0){
  const rect=canvas.getBoundingClientRect(),dir=screenRay(event.clientX-rect.left,event.clientY-rect.top);
  const hit=aimQubit(ROOM_SIZE*1.5,dir),cargo=aimCargo(4,dir);
  if(cargo){selectedCargo=cargo.cargo;switchPanelTab('cargo');}
  else if(hit&&(hit.distance<=4||flightForGroup(hit.g))){
   clearSelection();selected=hit;updatePanel();
   const machine=selectedSensor()||rotorForPart(hit.part.id)||robotArmForGroup(hit.g,hit.part.id)||flightForGroup(hit.g)||conveyorForGroup(hit.g);
   switchPanelTab(machine?'mechanisms':'cube');
  }
  if(cargo)updatePanel();event.preventDefault();return;
 }
 if(shelfPreview){event.preventDefault();if(event.button===2)cancelShelfPlacement();else if(event.button===0){updateShelfPlacement(wallAim());confirmShelfPlacement();}return;}
 if(hudInputActive)return;
 if(radialOpen()){event.preventDefault();if(event.button===0)unitRadial.activate();return;}
 if(event.button!==0&&event.button!==2)return;
 if(!storyActionAllowed())return;
 if(story.scene==='intro'&&event.button===2)return;
 event.preventDefault();speech.lastInput=simTime;
 if(pendingUnitCreation){
  if(!unitRadialAllowed()&&!(creationPreview?.plan&&gameInputActive()&&panel.hidden&&!held&&!story.transition)&&!(puzzle.active&&alphaSettings.allowPuzzleSpawn&&creationPreview&&gameInputActive()&&panel.hidden&&!held)){cancelUnitCreation();return;}
  if(event.button===2){cancelUnitCreation();announce('Creación cancelada');return;}
  if(!creationPreview?.plan&&!pendingUnitCreation.startsWith('quick-'))settings.unitShape=pendingUnitCreation;
  if(spawnQubit())clearSelection();
  return;
 }
 if((held?.reward||held?.latched)){releaseQubit(shiftDown());clearSelection();return;}
 if(!held&&event.button===0&&(event.ctrlKey||event.metaKey||ctrlDown())&&gameInputActive()){
  const hit=aimQubit(4),rotor=hit&&rotorForPart(hit.part.id);
  if(rotor){toggleRotorSelection(rotor);announce(selectedRotors().length+' rotores seleccionados · clic derecho o P para crear un conjunto');}
  else announce('Apunta a un enganche de rotor · Ctrl + clic para añadirlo');
  return;
 }
 if(event.button===2){if(marquee)finishMarquee(true);handleSecondary(event);return;}
 if(!held&&gameInputActive()){
  const hit=aimQubit(ROOM_SIZE*1.5),f=hit&&flightForGroup(hit.g);if(f&&(hit.distance>2.7||f.enabled)){showFlightMenu(hit,f);return;}
 }
 const hadSelection=selectedTeam().length>0||selectedRotors().length>0;
 if(!menu.hidden||!commandMenu.hidden){closeDetachMenu(false);closeCommandMenu(false);}
 if(hadSelection){clearSelection();if(document.pointerLockElement===canvas&&!aimQubit()&&!aimCargo(3))startMarquee();return;}
 if(!gameInputActive())return;
 grabQubit();
}
function onCanvasMouseUp(event){
 if(powerDraft)return;
 if(hudInputActive)return;
 if(radialOpen()){event.preventDefault();if(event.button===0)unitRadial.activate();return;}
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
function wallAim(dir=direction(),max=4){
 if(story.scene!=='lab'||puzzle.active)return null;
 const origin=V(...camera),half=ROOM_SIZE/2;let found=null;
 for(const [wall,axis,value,normal,angle]of [['north','z',-half,V(0,0,1),0],['south','z',half,V(0,0,-1),Math.PI],['east','x',half,V(-1,0,0),-Math.PI/2],['west','x',-half,V(1,0,0),Math.PI/2]]){
  if(Math.abs(dir[axis])<1e-9)continue;const distance=(value-origin[axis])/dir[axis];if(distance<=0||distance>max||found&&distance>=found.distance)continue;
  const p=add(origin,mul(dir,distance));if(p.y<.05||p.y>ROOM_HEIGHT-.05||Math.abs(p[axis==='x'?'z':'x'])>half-.05)continue;
  if(storyWorld.walls.some(w=>w.furniture!=='shelf'&&(rayPuzzleBox(origin,dir,w,distance)??Infinity)<distance-.01))continue;
  const q=Q();q.setFromAxisAngle(V(0,1,0),angle);found={p,q,normal,wall,distance};
 }return found;
}
function openWallOrganization(hit){
 const showItems=()=>openCommandMenu(hit.p,'Organización · elementos',[
  {label:'Repisa modular · 15 compartimentos',run:()=>beginShelfPlacement(hit)},
  {label:'Un tipo por compartimento · hasta 50 elementos',disabled:true,run:()=>{}},
  {label:'Volver',run:()=>openWallOrganization(hit)},
  {label:'Cerrar',run:()=>captureMouse()}
 ]);
 openCommandMenu(hit.p,'Pared',[
  {label:'Organización…',run:showItems},
  {label:'Cerrar',run:()=>captureMouse()}
 ]);
}
function handleSecondary(event){
 const rect=canvas.getBoundingClientRect();
 const dir=gameInputActive()?direction():screenRay(clamp(event.clientX-rect.left,0,canvas.clientWidth),clamp(event.clientY-rect.top,0,canvas.clientHeight));
 if(powerSecondary(dir))return;
 const cargoHit=aimCargo(4,dir),hit=aimQubit(4,dir),shelfHit=aimShelf(dir,4);
 if(shelfHit&&shelfHit.distance<Math.min(cargoHit?.distance??Infinity,hit?.distance??Infinity)){openShelfMenu(shelfHit.shelf,shelfHit.cellIndex);return;}
 if(!cargoHit&&!hit&&!shelfHit){
  const distant=aimQubit(ROOM_SIZE*1.5,dir),flight=distant&&flightForGroup(distant.g);
  if(flight){showFlightMenu(distant,flight);return;}
 }
 if(selectedRotors().length){
  const flight=hit&&flightForGroup(hit.g);if(flight&&(flight.modules.some(m=>m.id===hit.part.id)||rotorForPart(hit.part.id))){showFlightMenu(hit,flight);return;}
  showRotorSetMenu();return;
 }
 if(!hit&&!cargoHit&&aimWorkshop(dir)){
  openCommandMenu(workshopBench.p,'Mesa de trabajo',[
   {label:'Abrir taller · E',run:()=>openWorkshopPanel()},
   {label:'Retirar mesa',run:()=>{packWorkshop();captureMouse();announce('Mesa retirada · Q → Equipo para colocarla.');}},
   {label:'Cerrar',run:()=>captureMouse()}
  ]);return;
 }
 if(openReconfigurationMenu(dir)||openProductionMenu(dir)||alphaSecondary(dir))return;
 if(cargoHit){
  selectedCargo=cargoHit.cargo;const c=selectedCargo,team=selectedTeam(),number=team.reduce((n,g)=>n+g.parts.length,0),items=[];
  if(c.source)items.push({label:'Entregar en desintegrador '+c.source.id+' · '+c.units+' unidades',disabled:!!c.job,run:()=>{sendMaterial(c,team);captureMouse();}});
  if(puzzle.active&&c.puzzleStage!==undefined){const portal=puzzle.portals[c.puzzleStage];items.push({label:'Entregar · portal '+portal.name,disabled:!number||!portalAccepts(portal,c),run:()=>{deliverSelectedCargo(c,team);captureMouse();}});}
  if(c.job)items.push({label:'Sumar selección ('+number+')',disabled:!number,run:()=>{addCrew(c,team);captureMouse();}});
  items.push({label:c.job?'Cambiar destino':'Arrastrar con selección ('+number+')',disabled:!number&&!c.job,run:()=>{pendingCargo={cargo:c,team:c.job?[...new Set(c.job.slots.map(s=>s.g).concat(team))]:[...team]};captureMouse();announce('Clic derecho en el suelo → Llevar carga a este punto.');}});
  if(c.job)items.push({label:'Detener equipo',run:()=>{stopHaul(c);captureMouse();}});
  items.push({label:'Color y peso · pruebas',run:()=>{showTablet();updatePanel();switchPanelTab('cargo');}});
  items.push({label:'Cerrar',run:()=>captureMouse()});openCommandMenu(c.body.position,'Cuerpo · '+c.required+' u · '+(c.job?.activeCount||0)+' / '+c.required,items);return;
 }
 if(hit){
  selectedCargo=null;pendingCargo=null;selected=hit;if(!multiSelection.includes(hit.g))multiSelection=[];
  if(event.altKey||altDown()){openDetachMenu(hit);return;}
  if(isExternalBattery(hit.part)){showExternalBatteryMenu(hit.part.id);return;}
  const flight=flightForGroup(hit.g);if(flight&&!hit.part.mood.gripper&&!QBitsWorkshop.partState(hit.part).sensor){showFlightMenu(hit,flight);return;}
  const ownedConveyor=conveyorForPart(hit.part.id);
  if(QBitsWorkshop.partState(hit.part).sensor&&(flight||ownedConveyor||conveyorForGroup(hit.g)||robotArmForGroup(hit.g,hit.part.id))){
   if(mechanismRun(hit.g))openCommandMenu(hit.point,'Sensor del conjunto',[{label:'Configurar sensor…',run:()=>showSensorMenu(hit)},{label:'Cerrar',run:()=>captureMouse()}],hit.g);
   else showSensorMenu(hit);return;
  }
  const arm=ownedConveyor&&!hit.part.mood.gripper?null:robotArmForGroup(hit.g,hit.part.id),gripperId=arm?.gripperId||(hit.part.mood.gripper?hit.part.id:null);
  if(gripperId){
   robotPanelGripperId=gripperId;
   openCommandMenu(partPose(hit.g,hit.part).p,arm?'Brazo Q-bits · '+robotArmStatus(arm):'Cubo de agarre',[
    {label:'Configurar agarre y secuencia…',run:()=>{closeCommandMenu(false);pause();showTablet();updatePanel();showArmControls();}},
    ...(arm?[{label:arm.running||arm.jogging?'Detener brazo':'Iniciar secuencia',run:()=>{if(arm.running||arm.jogging)stopRobotArm(arm);else startRobotArm(arm);captureMouse();}}]:[{label:'Tomar objeto compatible',run:()=>{gripperGrab(gripperId);captureMouse();}}]),
    {label:'Soltar objeto',run:()=>{if(arm?.running)stopRobotArm(arm);releaseGripper(gripperId);captureMouse();}},
    {label:'Tomar mecanismo',disabled:!canCarry(rotorConnectedGroups([hit.g]))||hit.distance>2.8,run:()=>takeSelection(hit)},
    {label:'Guardar mecanismo',run:()=>{saveMechanism(hit.g);captureMouse();}},
    {label:'Separar pieza…',run:()=>{if(arm)stopRobotArm(arm);openDetachMenu(hit);}},
    {label:'Cerrar',run:()=>captureMouse()}
   ],hit.g);return;
  }
  const conveyor=ownedConveyor||conveyorForGroup(hit.g);
  if(conveyor){
   openCommandMenu(partPose(hit.g,hit.part).p,'Cinta Q-bits · '+conveyorStatus(conveyor),[
    {label:'Configurar cinta y extender…',run:()=>{closeCommandMenu(false);pause();showTablet();updatePanel();switchPanelTab('mechanisms');}},
    {label:'Iniciar marcha de la línea',disabled:conveyorLine(conveyor).every(c=>c.running),run:()=>{if(startConveyorLine(conveyor))announce('Línea en marcha');else announce(conveyorStatus(conveyor));captureMouse();}},
    {label:'Detener tramo',disabled:!conveyor.running,run:()=>{stopConveyor(conveyor);announce(conveyorStatus(conveyor));captureMouse();}},
    {label:'Invertir sentido del tramo',run:()=>{configureConveyor(conveyor,{direction:-conveyor.direction});announce(conveyorStatus(conveyor));captureMouse();}},
    {label:'Tomar mecanismo',disabled:!canCarry(rotorConnectedGroups([hit.g]))||hit.distance>2.8,run:()=>takeSelection(hit)},
    {label:'Guardar mecanismo',run:()=>{saveMechanism(hit.g);captureMouse();}},
    {label:'Separar módulo completo',run:()=>{detachConveyorModule(conveyor);captureMouse();}},
    {label:'Desarmar piezas…',run:()=>openDetachMenu(hit)},
    {label:'Cerrar',run:()=>captureMouse()}
   ],hit.g);return;
  }
  const team=selectedTeam(),count=team.reduce((n,g)=>n+g.parts.length,0);
  const items=[{label:team.length>1?'Tomar selección':'Tomar '+unitLabel(hit.part),disabled:!canCarry(team)||hit.distance>2.8,run:()=>takeSelection(hit)},
   {label:'Elegir destino en el suelo',run:()=>{captureMouse();announce('Clic derecho en el suelo → Ir a este punto.');}},
   {label:'Guardar forma',run:()=>{saveShape(hit.g);captureMouse();}},
   {label:'Nombrar '+unitLabel(hit.part),run:()=>openAlphaPanel(hit)}];
  if(story.scene==='lab'&&!puzzle.active&&powerMaterialGroups(team))items.unshift({label:'Desenrollar como cable · '+powerCableLimit(team.flatMap(worldParts)).toFixed(1)+' m',run:()=>beginPowerCable(team)});
  if(QBitsWorkshop.partState(hit.part).sensor)items.unshift({label:'Configurar sensor…',run:()=>showSensorMenu(hit)});
  const rotor=rotorForPart(hit.part.id)||rotorForGroup(hit.g);
  if(rotor&&rotorSetFor(rotor)&&!QBitsWorkshop.partState(hit.part).sensor){selectRotorSet(rotorSetFor(rotor));showRotorSetMenu();return;}
  if(rotor?.servo)items.unshift({label:servoMarchFor(rotor)?'Detener marcha del conjunto':'Iniciar marcha del conjunto',run:()=>{if(servoMarchFor(rotor))stopServoMarch(servoMarchFor(rotor));else startServoMarch(rotor);captureMouse();}});
  if(rotor){items.splice(items.findIndex(item=>item.label==='Guardar forma'),1);items.unshift({label:rotor.servo?'Configurar '+servoLabel(rotor)+'…':'Rotación…',run:()=>rotor.servo?openRotorControls():showRotorRotation(rotor,partPose(hit.g,hit.part).p)});items.push({label:'Guardar mecanismo · Rotor',run:()=>{saveMechanism(rotor);captureMouse();}},{label:'Separar enganches del rotor',run:()=>{disconnectRotor(rotor);captureMouse();}});}
  else if(hit.g.parts.some(part=>unitShape(part)==='coupler'))items.unshift({label:'Guardar mecanismo · Enganche',run:()=>{saveMechanism(hit.g);captureMouse();}},{label:hit.g.parts.some(p=>p.shape==='coupler'&&propellerHasBlade(p.id))?'Hélice incompleta · conecta otro triangular a la punta':'Enganche · Shift + otra punta: rotor; Shift + 2 triangulares: hélice',disabled:true,run:()=>{}});
  if(!rotor&&story.scene==='lab'&&unitShape(hit)==='pyramid')items.unshift(...[['pivot','Preparar Servo pivote'],['hinge','Preparar Servo bisagra']].map(([kind,label])=>({label,run:()=>{prepareServoPart(hit,kind);captureMouse();}})));
  if(hit.g.parts.length>1)items.push({label:'Separar…',run:()=>openDetachMenu(hit)});
  items.push({label:'Deseleccionar',run:()=>{clearSelection();captureMouse();}});
  items.push({label:'Cerrar',run:()=>captureMouse()});openCommandMenu(partPose(hit.g,hit.part).p,rotor?(rotor.servo?servoLabel(rotor):'Rotor')+' · lado '+(rotorGroups(rotor)[0]===hit.g?'A':'B'):count+' '+groupUnitLabel({parts:team.flatMap(g=>g.parts)}),items,hit.g);return;
 }
 const wall=wallAim(dir);if(wall){openWallOrganization(wall);return;}
 const point=floorAim(dir);if(point)openFloorOrders(point);
}

function selectedRotor(){return selected?.g?(rotorForPart(selected.part?.id)||rotorForGroup(selected.g)):null;}
function rotorMenuPoint(rotor){const members=rotorGroups(rotor);return members.length?members.reduce((v,g)=>add(v,mul(g.body.position,1/members.length)),V()):V(...camera);}
function rotorControlSubject(){return activeRotorSet()||{name:'Selección de rotores',rotorIds:controlRotors().map(r=>r.id)};}
function individualControlRotor(){const members=controlRotors();return members.length===1?members[0]:null;}
function openRotorControls(){closeCommandMenu(false);pause();showTablet();updatePanel();switchPanelTab('mechanisms');}
function runRotorControls(patch){
 const members=controlRotors();if(!members.length)return false;
 if(!panel.hidden&&members.some(r=>r.enabled)&&patch.enabled!==false)return false;
 const subject=rotorControlSubject(),ok=configureRotorSet(subject,patch);
 if(ok)announce((activeRotorSet()?.name||'Rotores')+(patch.enabled===false?' · detenidos':patch.invert?' · marcha invertida':patch.enabled?' · en marcha':' · ajustes aplicados'));
 return ok;
}
function showRotorSetMenu(){
 const members=controlRotors();if(!members.length)return;
 const set=activeRotorSet(),point=rotorMenuPoint(members[0]);
 openCommandMenu(point,(set?.name||'Selección de rotores')+' · '+members.length,[
  {label:'Iniciar marcha',run:()=>{runRotorControls({enabled:true});captureMouse();}},
  {label:'Detener conjunto',run:()=>{runRotorControls({enabled:false});captureMouse();}},
  {label:'Invertir marcha',run:()=>{runRotorControls({invert:true});captureMouse();}},
  {label:'Velocidad, fuerza y carga…',run:openRotorControls},
  {label:set?'Nombre y miembros…':'Crear conjunto con nombre…',run:()=>{openRotorControls();document.querySelector('#rotor-set-name').focus();}},
  {label:'Tomar mecanismo',disabled:!canCarry(rotorConnectedGroups(rotorGroups(members[0])))||!members.every(r=>rotorConnectedGroups(rotorGroups(members[0])).includes(rotorGroups(r)[0])),run:()=>{const hit=rotorPart(members[0].aId);clearRotorSelection();if(hit){selected={g:hit.g,part:hit.part};takeSelection({...hit,distance:hit.p.distanceTo(V(...camera)),point:hit.p});}}},
  {label:'Ajustar un rotor por separado…',run:()=>{clearSelection();captureMouse();announce('Ctrl + clic sobre un solo rotor y después P · ajustes individuales');}},
  {label:'Deseleccionar',run:()=>{clearSelection();captureMouse();}},
  {label:'Cerrar',run:()=>captureMouse()}
 ],rotorGroups(members[0])[0]);
}
function showRotorRotation(rotor,point=rotorMenuPoint(rotor)){
 if(!rotors.includes(rotor)){announce('Ese rotor ya no está unido.');return;}
 const run=direction=>{const started=configureRotor(rotor,{direction,enabled:true});captureMouse();if(started)announce('Rotor · '+(direction===1?'horario':'antihorario')+' · '+rotor.rpm+' rpm · gira lado '+rotor.moving.toUpperCase());};
 openCommandMenu(point,'Rotor · Rotación · lado '+rotor.moving.toUpperCase()+(rotor.stalled?' · bloqueado':''),[
  {label:'Sentido horario',run:()=>run(1)},
  {label:'Sentido antihorario',run:()=>run(-1)},
  {label:'Detener rotación',run:()=>{configureRotor(rotor,{enabled:false});captureMouse();}},
  {label:'Elegir lado que gira…',run:()=>showRotorSide(rotor,point)},
  {label:'Motor · velocidad, fuerza y energía…',run:()=>{const g=rotorGroups(rotor)[rotor.moving==='a'?0:1],id=rotor.moving==='a'?rotor.aId:rotor.bId;selected={g,part:g.parts.find(p=>p.id===id)};showTablet();updatePanel();switchPanelTab('mechanisms');}},
  {label:'Guardar mecanismo · Rotor',run:()=>{saveMechanism(rotor);captureMouse();}},
  {label:'Cerrar',run:()=>captureMouse()}
 ],rotorGroups(rotor)[0]);
}
function showRotorSide(rotor,point=rotorMenuPoint(rotor)){
 openCommandMenu(point,'Elige el lado móvil · el otro será la base',[
  ...['a','b'].map(side=>({label:(rotor.moving===side?'✓ ':'')+'Girar lado '+side.toUpperCase(),run:()=>{configureRotor(rotor,{moving:side});showRotorRotation(rotor,point);}})),
  {label:'Volver a Rotación',run:()=>showRotorRotation(rotor,point)}
 ]);
}
// Remember the chosen gripper while the player selects a sample to teach its filter.
let robotArmPanel=null,robotPanelGripperId=null;
function robotPanelSubject(){
 const selection=selected&&groups.includes(selected.g)?selected:null;
 const selectedArm=selection?robotArmForGroup(selection.g,selection.part.id):null;
 const direct=selection?.part?.mood?.gripper?selection.part.id:selectedArm?.gripperId;
 if(direct)robotPanelGripperId=direct;
 let hit=robotPanelGripperId?robotGripperHit(robotPanelGripperId):null;
 if(!hit?.part.mood.gripper){robotPanelGripperId=null;hit=null;}
 return {selection,hit,arm:hit?robotArms.find(arm=>arm.gripperId===hit.part.id)||null:null};
}
function robotPanelSnapshot(){
 const {selection,hit,arm}=robotPanelSubject(),component=hit?rotorConnectedGroups([hit.g]):[],config=hit?.part.mood.gripper;
 const grip=hit?robotGrips.get(hit.part.id):null,load=grip?.weight||0,pieces=grip?.g?.parts.length,supply=hit?gripperSupply(hit):null;
 const motorIds=new Set(arm?arm.joints.flatMap(j=>[j.aId,j.bId]).concat(arm.gripperId):hit?[hit.part.id]:[]);
 const energy=supply?.active?supply.storedJ:[...motorIds].reduce((sum,id)=>{const p=rotorPart(id)?.part;return sum+(p?p.mood.energy*gameBatteryCapacity(p):0);},0);
 const sample=selection&&!component.includes(selection.g)?selection:null;
 const source=selection?.part,canConvert=!selection?.g?.robotHeld&&!selection?.g?.blueprintJob&&!robotArmForGroup(selection?.g)&&story.scene==='lab'&&!puzzle.active&&source?.shape==='cube'&&!source.mood.gripper&&!isExternalBattery(source)&&!source.mood.production&&!source.mood.matter&&!QBitsWorkshop.hasAdaptation(source);
 const snapshot={available:story.scene==='lab'&&!puzzle.active,selectedLabel:selection?(selection.part.mood.name||'Pieza '+selection.part.id)+(hit&&sample?' · muestra para '+hit.part.mood.name:''):'Selecciona el brazo o un Q-bit para adaptarlo.',canConvert:!!canConvert,canRegister:!!hit&&!arm&&component.length>1,canCaptureShape:!!sample,canCapturePiece:!!sample,
 targets:groups.filter(g=>!component.includes(g)).flatMap(g=>g.parts.map(p=>({id:p.id,label:(p.mood.name||'Pieza')+' · #'+p.id}))).concat(cargos.filter(c=>c.intake==null).map(c=>({id:-c.id,label:'Cuerpo '+c.id+' · '+c.color+' · '+c.required+' u'}))),gripper:config?{...config,reachCm:gripperReach(config)*100,id:hit.part.id,name:hit.part.mood.name,energy:supply.storedJ,load,pieces}:null};
 if(arm){
  const members=robotArmRotors(arm),running=arm.running||arm.jogging,holding=!!grip,capacity=robotLiftCapacity(config,members);
  snapshot.arm={name:'Brazo Q-bits',status:robotArmStatus(arm),signal:robotArmSignal(arm),running,holding,phase:arm.state==='wait'?'detect':arm.state==='carry'?'move':arm.state,repeat:arm.repeat,
   homeReady:!!arm.poses.home,pickReady:!!arm.poses.pick,placeReady:!!arm.poses.place,load,pieces,capacity,energy,cycles:arm.cycles,
   canFit:capacity<config.capacity,posable:robotKinematics(arm)!==null,
   efficiency:Math.max(0,100-load/capacity*100),joints:members.map((r,i)=>({name:robotJointName(i),rpm:r.rpm,maxTorque:r.maxTorque,capacity:r.capacity,angle:arm.poses.pick?-robotTargetError(r,arm.poses.pick[i])*180/Math.PI:0}))};
 }
 return snapshot;
}
function robotPanelAction(action,payload={}){
 const {selection,hit,arm}=robotPanelSubject(),finish=(ok,message)=>({ok:!!ok,message});
 if(story.scene!=='lab'||puzzle.active)return finish(false,'Disponible en el banco de pruebas.');
 if(action==='blueprint'){
  const ready=beginBlueprintPlacement(mechanismBlueprintShape(robotArmBlueprintTemplate()));return finish(ready,ready?'Apunta y haz clic para colocar el plano.':'Plano no disponible.');
 }
 if(action==='convert'){
  if(!robotPanelSnapshot().canConvert)return finish(false,'Selecciona un cubo normal del banco.');
  const ok=configureGripper(selection.part.id,{});if(ok){robotPanelGripperId=selection.part.id;redraw=true;}return finish(ok,ok?'Cubo de agarre preparado. La cara marcada toma el objeto.':'Esta pieza no admite la adaptación.');
 }
 if(!hit)return finish(false,'Selecciona primero un cubo de agarre.');
 if(action==='check'){
  const check=gripperCheck(hit.part.id,true),problem=arm?robotPowerProblem(arm):'';
  return finish(check.ok&&!problem,problem&&check.code!=='rotor-load'?problem+' '+check.message:check.message);
 }
 if(action==='register'){const made=registerRobotArm(hit.part.id);return finish(made,made?'Montaje registrado. Enseña A y B con los ajustes de cada eje.':'Conecta una cadena de uno a cuatro rotores a una base y al agarre.');}
 if(arm&&(arm.running||arm.jogging)&&!['check','stop','release'].includes(action))return finish(false,'Detén el brazo antes de ajustarlo.');
 if(action==='filter'){
  if(arm?.running||arm?.jogging)return finish(false,'Detén el brazo antes de cambiar el filtro.');
  if(payload.mode==='piece'&&!Number.isSafeInteger(payload.targetId))return finish(false,'Elige una pieza de la lista.');
  const ok=configureGripper(hit.part.id,payload);return finish(ok,ok?'Filtro actualizado.':'Revisa el filtro, la forma aprendida y el límite de carga.');
 }
 if(action==='capturePiece'||action==='captureShape'){
  if(!selection||rotorConnectedGroups([hit.g]).includes(selection.g))return finish(false,'Selecciona otra pieza o estructura de la sala y vuelve a este panel.');
  const patch=action==='capturePiece'?{mode:'piece',targetId:selection.part.id}:{mode:'form',formSignature:gripperFormSignature(selection.g)};
  return finish(configureGripper(hit.part.id,patch),action==='capturePiece'?'Pieza objetivo guardada por su identidad.':'Forma aprendida: piezas y disposición relativa.');
 }
 if(action==='grab'){
  if(arm?.running||arm?.jogging)return finish(false,'Detén el brazo antes de tomar manualmente.');
  const check=gripperCheck(hit.part.id,true);if(!check.ok)return finish(false,check.message);
  const ok=gripperGrab(hit.part.id);return finish(ok,ok?'Objeto sujeto.':'No se pudo tomar. Comprueba la toma otra vez.');
 }
 if(action==='release'){releaseGripper(hit.part.id);if(arm?.running)stopRobotArm(arm,'Detenido · objeto liberado');return finish(true,'Objeto liberado.');}
 if(!arm)return finish(false,'Primero registra el montaje como brazo.');
 if(action==='pose'){
  const ok=beginRobotPoseDraft(arm,payload.pose,payload.heightCm);
  return finish(ok,ok?'Apunta en la sala para enseñar la postura.':'Detén el brazo, libera la pinza y revisa la altura y la cadena de ejes.');
 }
 if(action==='motor'||action==='fitLoad'){
  if(arm.running||arm.jogging)return finish(false,'Detén el brazo antes de ajustar los motores.');
  const members=robotArmRotors(arm);
  if(action==='motor'){
   const {joint,rpm,maxTorque,capacity}=payload;
   if(!Number.isInteger(joint)||!members[joint]||!Number.isFinite(rpm)||rpm<1||rpm>360||!Number.isFinite(maxTorque)||maxTorque<.02||maxTorque>32||!Number.isInteger(capacity)||capacity<2||capacity>QBitsRotorPower.LIMITS.capacity[1])return finish(false,'Revisa las rpm, el torque y la capacidad del eje.');
   if(!configureRotor(members[joint],{rpm,maxTorque,capacity},true))return finish(false,'No se pudo ajustar el eje.');
  }else{
   const capacity=hit.part.mood.gripper.capacity;
   for(const rotor of members)if(rotor.capacity<capacity)configureRotor(rotor,{capacity},true);
  }
  const problem=robotPowerProblem(arm);
  arm.state=problem?'blocked':'idle';arm.status=problem||'Motores listos';redraw=true;
  return finish(true,problem||'Ajustes de los motores guardados.');
 }
 if(action==='clearHome'&&!arm.running&&!arm.jogging){delete arm.poses.home;return finish(true,'La secuencia empezará yendo directamente a A.');}
 if(action==='teach')return finish(teachRobotArmPose(arm,payload.pose),robotArmStatus(arm));
 if(action==='repeat')return finish(configureRobotArm(arm,{repeat:payload.value}),'Secuencia '+(payload.value?'en repetición.':'de un ciclo.'));
 if(action==='stop')return finish(stopRobotArm(arm),'Brazo detenido; articulaciones frenadas y objeto liberado.');
 if(action==='goto'){
  if(arm.running||arm.jogging||robotGrips.has(arm.gripperId))return finish(false,'Detén el brazo y suelta el objeto antes de probar una postura.');
  if(!['home','pick','place'].includes(payload.pose)||!robotPoseValid(arm.poses[payload.pose],arm.joints.length))return finish(false,'Guarda primero esa postura.');
  const ok=robotBeginMotion(arm,arm.poses[payload.pose],true);
  if(ok){arm.state='jog';arm.status='Probando postura '+({home:'inicial',pick:'A · tomar',place:'B · soltar'}[payload.pose]);}
  return finish(ok,robotArmStatus(arm));
 }
 if(action==='jog'||action==='start'){
  if(robotGrips.has(arm.gripperId))return finish(false,'Suelta el objeto antes de mover el brazo.');
  const ok=action==='jog'?jogRobotArm(arm,payload.joint,payload.degrees):startRobotArm(arm);
  if(ok)announce(action==='jog'?'Ajustando eje':'Brazo en marcha');
  return finish(ok,robotArmStatus(arm));
 }
 return finish(false,'Orden no disponible.');
}
function updateRobotArmPanel(){
 if(!window.QBitsRobotArmPanel)return;
 if(!robotArmPanel)robotArmPanel=QBitsRobotArmPanel.create({snapshot:robotPanelSnapshot,action:robotPanelAction});
 robotArmPanel.refresh();
}
// Construction controls share the same blueprints and real materials as the arm.
let conveyorPanel=null;
function conveyorPanelSubject(){const hit=held||selected,g=hit?.g;return g?(conveyorForPart(hit.part?.id)||conveyorForGroup(g)):null;}
function conveyorPanelSnapshot(){
 const c=conveyorPanelSubject(),base=c?rotorPart(c.baseId):null,line=c?conveyorLine(c):[],supply=base?externalBatterySummary(base.g):null;
 const materials={},materialsWithSupports={};for(const kind of ['straight','left','right']){const recipe=conveyorBlueprintTemplate(kind,false),supported=conveyorBlueprintTemplate(kind,true);materials[kind]=recipe?blueprintMaterials(mechanismBlueprintShape(recipe)):'Plano en preparación';materialsWithSupports[kind]=supported?blueprintMaterials(mechanismBlueprintShape(supported)):materials[kind];}
 return {available:story.scene==='lab'&&!puzzle.active,supportsAvailable:true,materials,materialsWithSupports,selectedLabel:c?(c.kind==='straight'?'Cinta recta':c.kind==='left'?'Esquina izquierda':'Esquina derecha')+' · tramo '+c.id:'Selecciona un rodillo del tramo para configurarlo.',conveyor:c?{id:c.id,kind:c.kind,enabled:c.running,direction:c.direction,status:conveyorStatus(c),load:c.load,capacity:c.capacity,speed:conveyorRotors(c).reduce((sum,r)=>sum+Math.abs(r.actualRpm||0)*Math.PI*CUBE_SIZE/60,0)/Math.max(1,c.joints.length),energy:supply?.storedJ||0,connected:line.length,lineRunning:line.every(section=>section.running)}:null};
}
function conveyorPortWorld(c,name){const base=rotorPart(c?.baseId),port=c?.ports?.[name];return base&&port?{p:add(base.p,base.q.vmult(V(...port.p))),direction:base.q.vmult(V(...port.direction))}:null;}
function conveyorBlueprintPlacement(record,c){
 const input=record?.conveyors?.[0],part=input&&record.groups.flatMap(g=>g.parts).find(p=>p.key===input.base),exit=conveyorPortWorld(c,c?.direction===-1?'entry':'exit');if(!part||!input.ports?.entry||!exit)return null;exit.direction.scale(c.direction===-1?-1:1,exit.direction);
 const baseQ=Q();baseQ.set(...part.q);const entry=input.ports.entry,local=add(V(...part.p),baseQ.vmult(V(...entry.p))),incoming=baseQ.vmult(V(...entry.direction));
 // Match both port directions even when the receiving chassis has a free yaw.
 if(Math.abs(exit.direction.y)>.01||Math.abs(incoming.y)>.01)return null;
 const angle=Math.atan2(exit.direction.x,exit.direction.z)-Math.atan2(incoming.x,incoming.z);
 const q=Q();q.setFromAxisAngle(V(0,1,0),angle);
 const origin=sub(exit.p,q.vmult(local));if(origin.y<-.001)return null;
 return {point:origin,height:Math.max(0,origin.y-.002),angle,quarterTurns:((Math.round(angle/(Math.PI/2))%4)+4)%4};
}
function conveyorPanelAction(action,payload={}){
 const c=conveyorPanelSubject(),finish=(ok,message)=>({ok:!!ok,message});if(story.scene!=='lab'||puzzle.active)return finish(false,'Disponible en el banco de pruebas.');
 if(action==='blueprint'){
  if(!['straight','left','right'].includes(payload.kind)||!Number.isInteger(payload.quarterTurns)||payload.quarterTurns<0||payload.quarterTurns>3||!Number.isFinite(payload.height)||payload.height<0||payload.height>6)return finish(false,'Revisa el tipo, la orientación y la altura.');
  const record=conveyorBlueprintTemplate(payload.kind,payload.supports===true);if(!record)return finish(false,'No se pudo preparar este plano.');
  if(!payload.extend)return finish(beginBlueprintPlacement(mechanismBlueprintShape(record),payload),'Apunta y haz clic para colocar el plano.');
  if(!c)return finish(false,'Selecciona primero una cinta.');
  const placement=conveyorBlueprintPlacement(record,c);if(!placement)return finish(false,'Coloca el tramo nivelado para prolongar su salida.');
  const bp=placeBlueprint(mechanismBlueprintShape(record),placement.point,placement);if(bp){bp.conveyorLink=c.baseId;panel.hidden=true;captureMouse();}
  return finish(bp,bp?'Plano colocado. Acerca las piezas e integra con clic derecho. Acopla la batería al terminar.':'No hay espacio libre para ese tramo.');
 }
 if(!c)return finish(false,'Selecciona un rodillo de la cinta.');
 if(c.running&&['direction','capacity'].includes(action))return finish(false,'Detén el tramo antes de ajustarlo.');
 if(action==='direction'){const ok=configureConveyor(c,{direction:payload.direction});return finish(ok,conveyorStatus(c));}
 if(action==='capacity'){const ok=configureConveyor(c,{capacity:payload.capacity});return finish(ok,ok?'Carga máxima actualizada.':'Usa una carga entre 1 y '+MAX_QUBITS+' u.');}
 if(action==='toggle'){const ok=payload.enabled===true?startConveyorLine(c):stopConveyorLine(c);return finish(ok,ok?(payload.enabled?'Línea en marcha':'Línea detenida'):conveyorStatus(c));}
 return finish(false,'Orden no disponible.');
}
function joinCompletedConveyorBlueprint(bp,made){
 if(!bp.conveyorLink)return;const previous=rotorPart(bp.conveyorLink),next=conveyors.find(c=>made.includes(rotorPart(c.baseId)?.g)),incoming=next&&rotorPart(next.baseId);if(!previous||!incoming||previous.g===incoming.g)return;
 const joined=weld({source:incoming.g,target:previous.g,conveyorAnchor:bp.conveyorLink,position:incoming.g.body.position.clone(),quaternion:incoming.g.body.quaternion.clone()},{sound:false});
 if(joined){made.splice(made.indexOf(incoming.g),1,joined);pruneConveyors();}else announce('Tramo completo. Une los laterales con Shift para compartir la batería.');return joined;
}
function updateConveyorPanel(){if(!window.QBitsConveyorPanel||typeof conveyorBlueprintTemplate!=='function')return;if(!conveyorPanel)conveyorPanel=QBitsConveyorPanel.create({snapshot:conveyorPanelSnapshot,action:conveyorPanelAction});conveyorPanel.refresh();}
function builtInMechanismRecipes(){return [propellerBlueprintTemplate(),robotArmBlueprintTemplate(),...(typeof conveyorBlueprintTemplate==='function'?['straight','left','right'].map(kind=>conveyorBlueprintTemplate(kind,false)):[])].filter(Boolean);}

function updateMechanismPanel(){
 refreshSensorPanel();updateRobotArmPanel();updateConveyorPanel();updateFlightFleet();updateFlightPanel();updateServoPanel();
 const targets=controlRotors(),rotor=targets[0]||selectedRotor(),set=activeRotorSet(),available=mechanismsAvailable(),rpm=rotor?.rpm??mechanismDefaults.rpm;
 const common=(field,format)=>targets.length>1&&targets.some(r=>r[field]!==targets[0][field])?'Varios':format(rotor?.[field]??mechanismDefaults[field]);
 document.querySelector('#mechanism-unlock').textContent=story.scene==='lab'?'Disponibles en el banco. En campaña: completa el nivel 5, La primera unión.':mechanismsUnlocked()?'Enganche y Rotor desbloqueados.':'Completa el nivel 5, La primera unión, para desbloquearlos en campaña.';
 document.querySelector('#rotor-status').textContent=targets.length?(set?.name||'Selección')+' · '+targets.length+' rotor'+(targets.length===1?'':'es')+' · '+targets.filter(r=>r.enabled).length+' en marcha'+(targets.some(r=>r.stalled)?' · revisa los rotores atascados':''):'Ctrl + clic sobre cada rotor para añadirlo o quitarlo. También puedes usar '+inputLabel('select')+'.';
 const nameInput=document.querySelector('#rotor-set-name');if(document.activeElement!==nameInput)nameInput.value=set?.name||'';
 document.querySelector('#rotor-set-create').disabled=!targets.length;document.querySelector('#rotor-set-create').textContent=set?'Renombrar conjunto':'Crear conjunto';
 document.querySelector('#rotor-set-dissolve').disabled=!set;
 const setList=document.querySelector('#rotor-set-list');setList.replaceChildren();
 for(const item of rotorSets){const button=document.createElement('button');button.type='button';button.textContent=item.name+' · '+rotorSetMembers(item).length+' rotores';button.setAttribute('aria-pressed',String(item===set));button.addEventListener('click',()=>{selectRotorSet(item);updateMechanismPanel();});setList.appendChild(button);}
 document.querySelector('#rotor-rpm').value=rpm;document.querySelector('#rotor-rpm-value').textContent=common('rpm',v=>String(Math.round(v)));
 document.querySelector('#rotor-side').value=rotor?.moving??mechanismDefaults.moving;
 document.querySelector('#rotor-mount').value=rotor?.mount??mechanismDefaults.mount;
 const torque=rotor?.maxTorque??mechanismDefaults.maxTorque,capacity=rotor?.capacity??mechanismDefaults.capacity;
 const tier=QBitsProgression.effectiveTier(Number(story.progress.torqueTier||1),story.progress),availableTier=QBitsProgression.availableTier(story.progress);
 document.querySelector('#rotor-tier-row').hidden=story.scene==='lab';document.querySelector('#rotor-tier').value=certifiedAutomation()?1:tier;document.querySelector('#rotor-tier').disabled=certifiedAutomation();
 for(const option of document.querySelector('#rotor-tier').children)option.disabled=Number(option.value)>availableTier;
 document.querySelector('#rotor-tier-status').textContent=story.scene==='lab'?'Banco libre · fuerza hasta 3200':certifiedAutomation()?'Ensayo certificado · fuerza máxima 40':'Certificación '+tier+' · fuerza máxima '+Math.round(campaignTorqueCap()*100)+'. II: nivel 16; III: nivel 18.';
 document.querySelector('#rotor-force').max=Math.round((story.scene==='campaign'?campaignTorqueCap():32)*100);
 document.querySelector('#rotor-force').value=Math.round(torque*100);document.querySelector('#rotor-force-value').textContent=common('maxTorque',v=>String(Math.round(v*100)));
 document.querySelector('#rotor-torque').max=story.scene==='campaign'?campaignTorqueCap():32;
 document.querySelector('#rotor-torque').value=torque;document.querySelector('#rotor-torque-value').textContent=torque.toFixed(2)+' N·m';
 document.querySelector('#rotor-capacity').value=capacity;document.querySelector('#rotor-capacity-value').textContent=common('capacity',v=>String(Math.round(v)));
 const component=targets.length?rotorConnectedGroups(rotorGroups(targets[0])):[],sameMechanism=targets.every(r=>rotorGroups(r).every(g=>component.includes(g)));
 const payloads=[],connectedLoads=[];
 for(const r of targets){
  const arm=robotArmForRotor(r);
  (arm?payloads:connectedLoads).push(rotorDrivenLoad(arm?[]:rotorConnectedGroups(rotorGroups(r)),arm));
 }
 const loadSummary=[];
 if(payloads.length)loadSummary.push('Carga en la pinza '+formatWeight(Math.max(...payloads))+' u');
 if(connectedLoads.length)loadSummary.push('Carga conectada '+Math.ceil(Math.max(...connectedLoads))+' u'+(sameMechanism?'':' como máximo por mecanismo'));
 const supplies=targets.map(r=>({rotor:r,external:externalBatterySummary(r)}));
 const battery=supplies.length?Math.min(...supplies.map(s=>s.external.active?s.external.energy:Math.min(...[s.rotor.aId,s.rotor.bId].map(id=>rotorPart(id)?.part.mood.energy??0)))):0;
 document.querySelector('#rotor-power-readout').textContent=targets.length?loadSummary.join(' · ')+' · batería mínima '+Math.round(battery*100)+' %'+(targets.some(r=>r.stopReason)?' · '+[...new Set(targets.filter(r=>r.stopReason).map(r=>rotorStopLabel(r.stopReason)))].join(', '):''):'Estos ajustes se usarán en los próximos rotores.';
 const poweredExternally=supplies.filter(s=>s.external.active).length;
 document.querySelector('#rotor-supply-status').textContent=targets.length?(poweredExternally===targets.length?'Batería externa activa · se conserva la reserva interna de los rotores.':poweredExternally?'Alimentación mixta · algunos rotores usan sus reservas internas.':'Reserva interna · acopla y activa una batería externa para conservar la carga de los rotores.'):'Taller → Baterías externas: versiones de 1, 2 y 3 cubos disponibles desde el inicio.';
 const batteryList=document.querySelector('#connected-batteries');batteryList.replaceChildren();const shownPacks=new Set();
 for(const g of rotorConnectedGroups(targets.flatMap(rotorGroups)))for(const part of g.parts)if(isExternalBattery(part)){
  const info=externalBatteryPackInfo(part.id),key=Math.min(...info.parts.map(p=>p.id));if(shownPacks.has(key))continue;shownPacks.add(key);
  const button=document.createElement('button');button.type='button';button.textContent=(info.enabled?'Apagar ':'Activar ')+info.label+' · '+info.percent+' %';button.addEventListener('click',()=>{toggleExternalBattery(part.id,!info.enabled);updateMechanismPanel();});batteryList.appendChild(button);
 }
 document.querySelector('#rotor-technical-readout').textContent=rotor?rotorPowerDescription(rotor):'';
 document.querySelector('#rotor-individual-note').textContent=targets.length>1?'Selecciona un solo rotor con Ctrl + clic para cambiar su montaje o lado.':'Montaje del rotor seleccionado. El conjunto conserva la orientación de cada eje.';
 for(const id of ['rotor-clockwise','rotor-counterclockwise','rotor-disconnect','rotor-side','rotor-mount'])document.querySelector('#'+id).disabled=targets.length>1||(!rotor&&!['rotor-side','rotor-mount'].includes(id));
 for(const id of ['rotor-start','rotor-invert','rotor-stop'])document.querySelector('#'+id).disabled=!targets.length;
 document.querySelector('#rotor-save').disabled=!sameMechanism||!rotor&&!selected?.g?.parts.some(part=>unitShape(part)==='coupler'||isExternalBattery(part)||part.mood.gripper);
 document.querySelector('#rotor-save-note').textContent=sameMechanism?'Guardar mecanismo conserva su nombre y conjuntos en la plantilla.':'Para guardar una plantilla, selecciona rotores de un solo montaje conectado. Este conjunto sigue disponible en la sala.';
 for(const id of ['rotor-rpm','rotor-clockwise','rotor-counterclockwise','rotor-side','rotor-mount','rotor-start','rotor-invert'])if(rotor?.servo)document.querySelector('#'+id).disabled=true;
 const powered=targets.some(r=>r.enabled);
 for(const id of ['force','capacity','torque'])document.querySelector('#rotor-'+id).disabled=powered;
 if(powered)for(const id of ['side','mount','disconnect','clockwise','counterclockwise','start','invert'])document.querySelector('#rotor-'+id).disabled=true;
 document.querySelector('#rotor-rpm').disabled=powered||!!rotor?.servo;
 for(const id of ['create-coupler','create-rotor'])document.querySelector('#'+id).disabled=!available;
 const list=document.querySelector('#saved-mechanism-list');list.replaceChildren();
 for(const mechanism of savedMechanisms){
  const row=document.createElement('div'),create=document.createElement('button');create.type='button';create.textContent=mechanism.name+' · '+mechanismPartCount(mechanism)+' piezas';create.disabled=!available;
  create.addEventListener('click',()=>{if(!mechanismsAvailable())return;beginBlueprintPlacement(mechanismBlueprintShape(mechanism));});
  const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Eliminar '+mechanism.name);remove.addEventListener('click',()=>{savedMechanisms.splice(savedMechanisms.indexOf(mechanism),1);persistMechanisms();updateMechanismPanel();});row.append(create,remove);list.appendChild(row);
 }
}
function createMechanismChoice(kind){if(!mechanismsAvailable())return;clearRotorSelection();settings.unitShape=kind;startCreationTool(kind);}
document.querySelector('#create-coupler').addEventListener('click',()=>createMechanismChoice('coupler'));
document.querySelector('#create-rotor').addEventListener('click',()=>createMechanismChoice('rotor'));
document.querySelector('#rotor-tier').addEventListener('change',event=>{if(certifiedAutomation()){updateMechanismPanel();return;}const tier=QBitsProgression.effectiveTier(Number(event.target.value),story.progress);story.progress.torqueTier=tier;try{localStorage.setItem('qbits.campaign.v1',JSON.stringify(story.progress));}catch{}if(story.scene==='campaign'){for(const r of rotors)if(r.maxTorque>campaignTorqueCap())configureRotor(r,{maxTorque:campaignTorqueCap()});mechanismDefaults.maxTorque=Math.min(mechanismDefaults.maxTorque,campaignTorqueCap());}updateMechanismPanel();});
document.querySelector('#rotor-rpm').addEventListener('input',event=>{const value=Number(event.target.value);if(!Number.isFinite(value))return;mechanismDefaults.rpm=clamp(Math.round(value),1,360);if(controlRotors().length)runRotorControls({rpm:mechanismDefaults.rpm});updateMechanismPanel();});
document.querySelector('#rotor-force').addEventListener('input',event=>{const value=Number(event.target.value);if(!Number.isFinite(value))return;mechanismDefaults.maxTorque=clamp(Math.round(value)/100,.02,story.scene==='campaign'?campaignTorqueCap():32);if(controlRotors().length)runRotorControls({maxTorque:mechanismDefaults.maxTorque});updateMechanismPanel();});
document.querySelector('#rotor-side').addEventListener('change',event=>{if(!['a','b'].includes(event.target.value)||controlRotors().length>1)return;mechanismDefaults.moving=event.target.value;const rotor=individualControlRotor();if(rotor)configureRotor(rotor,{moving:mechanismDefaults.moving});updateMechanismPanel();});
document.querySelector('#rotor-mount').addEventListener('change',event=>{if(!['wheel','fixed'].includes(event.target.value)||controlRotors().length>1)return;mechanismDefaults.mount=event.target.value;const rotor=individualControlRotor();if(rotor)configureRotor(rotor,{mount:mechanismDefaults.mount});updateMechanismPanel();});
for(const [id,field,min,max]of [['rotor-torque','maxTorque',.02,32],['rotor-capacity','capacity',2,QBitsRotorPower.LIMITS.capacity[1]]])document.querySelector('#'+id).addEventListener('input',event=>{const value=Number(event.target.value);if(!Number.isFinite(value))return;mechanismDefaults[field]=clamp(field==='capacity'?Math.round(value):value,min,max);if(controlRotors().length)runRotorControls({[field]:mechanismDefaults[field]});updateMechanismPanel();});
for(const [id,direction] of [['rotor-clockwise',1],['rotor-counterclockwise',-1]])document.querySelector('#'+id).addEventListener('click',()=>{const rotor=individualControlRotor();if(rotor){mechanismDefaults.direction=direction;configureRotor(rotor,{direction,enabled:true});updateMechanismPanel();}});
document.querySelector('#rotor-start').addEventListener('click',()=>{runRotorControls({enabled:true});updateMechanismPanel();});
document.querySelector('#rotor-invert').addEventListener('click',()=>{runRotorControls({invert:true});updateMechanismPanel();});
document.querySelector('#rotor-stop').addEventListener('click',()=>{runRotorControls({enabled:false});updateMechanismPanel();});
document.querySelector('#rotor-set-create').addEventListener('click',()=>{const name=document.querySelector('#rotor-set-name').value,set=activeRotorSet();const result=set?renameRotorSet(set,name):createRotorSet(name,controlRotors());if(result){if(!set)selectRotorSet(result);announce('Conjunto guardado · '+(set||result).name);updateMechanismPanel();}});
document.querySelector('#rotor-set-dissolve').addEventListener('click',()=>{const set=activeRotorSet();if(set){dissolveRotorSet(set);announce('Conjunto disuelto · los rotores conservan sus ajustes');}updateMechanismPanel();});
document.querySelector('#rotor-save').addEventListener('click',()=>{const targets=controlRotors(),rotor=targets[0]||selectedRotor();if(targets.length&&targets.some(r=>!rotorConnectedGroups(rotorGroups(rotor)).includes(rotorGroups(r)[0])))return;if(rotor||selected?.g?.parts.some(part=>unitShape(part)==='coupler'||isExternalBattery(part)))saveMechanism(rotor||selected.g,activeRotorSet()?.name);updateMechanismPanel();});
document.querySelector('#battery-guide').addEventListener('click',()=>showExternalBatteryGuide());
document.querySelector('#rotor-disconnect').addEventListener('click',()=>{const rotor=individualControlRotor();if(rotor)disconnectRotor(rotor);updateMechanismPanel();});
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
  leaveHaul(team[i]);if(startRoute(team[i],p,true,true)){started++;queueSpeech(team[i],'order',{kind:team[i].body.position.distanceTo(p)>2?'long':''});}
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
 if(info.pending){el.textContent=info.status+' · R reinicia';return;}
 el.textContent=info.status+' · '+info.metres.toFixed(2)+' m restantes · '+(info.waiting?'~'+Math.ceil(info.seconds)+' s de arrastre después de reunir el equipo':'~'+Math.ceil(info.seconds)+' s');
}
const tabletSections={
 bodies:{label:'Cuerpos',tabs:['catalog','cube','route','cargo']},
 machines:{label:'Mecanismos',tabs:['mechanisms']},
 files:{label:'Archivo',tabs:['alpha','puzzle']},
 help:{label:'Ayuda',tabs:['manual']}
};
const tabletPages={
 catalog:['Catálogo','Elige un objeto para ver su plano en la sala. Confirma con clic. Shift alinea la posición a la cuadrícula.'],
 cube:['Piezas','Selecciona una pieza en la sala para ver su masa y ajustar el agarre o la física.'],
 route:['Recorrido','Selecciona las piezas que van a moverse. Usa el menú del suelo para indicar el destino.'],
 cargo:['Cuerpos','Selecciona un cuerpo para ajustar sus propiedades y las órdenes de transporte.'],
 mechanisms:['Mecanismos','Selecciona la máquina en la sala. Los indicadores siguen en vivo mientras ajustas los controles disponibles.'],
 alpha:['Archivo del banco','Consulta las formas guardadas, los planos y las herramientas del banco.'],
 puzzle:['Puzle','Prepara el desafío y consulta sus condiciones antes de iniciarlo.'],
 manual:['Manual','Abre el capítulo del mecanismo que quieras probar. Encontrarás los controles y los pasos para montarlo.']
};
let tabletTab='cube',catalogFilter='Piezas',tabletWheelTime=-Infinity;
const tabletEl=id=>document.getElementById(id);
const tabletMovement={forward:'KeyW',backward:'KeyS',left:'KeyA',right:'KeyD',crouch:'KeyC'};
function tabletTyping(el){
 return !!el&&(el.isContentEditable||el.tagName==='TEXTAREA'||el.tagName==='INPUT'&&
  !['range','checkbox','radio','button','color'].includes(el.type));
}
function releaseForTablet(){
 const walking=Object.values(tabletMovement).filter(code=>keys.has(code));pause();
 for(const code of walking)keys.add(code);
}
let tabletPose=null, drawTabletMesh=null;
function layoutTablet(){
 if(panel.hidden)return;
 const f=window.QBitsTabletView.placement(innerWidth,innerHeight,savedPreferences);
 tabletPose=f;
 Object.assign(panel.style,{width:f.width+'px',height:f.height+'px',left:(f.x-f.width/2)+'px',
  top:(f.y-f.height/2)+'px',transform:'matrix3d('+f.pose.join(',')+')'});
 panel.dataset.style=savedPreferences.tabletStyle;
 redraw=true;
}
window.addEventListener('resize',layoutTablet);
function tabletPreferences(){
 panel.dataset.hand=savedPreferences.tabletHand||'left';
 layoutTablet();
 const label=inputLabel('tablet')==='Clic central'?'M3':inputLabel('tablet');
 tabletEl('tablet-close-hint').textContent=label+' · guardar';tabletEl('tablet-hud-hint').textContent=label+' · Tableta';
}
function tabletNearBench(){
 if(story.scene!=='lab'||puzzle.active||!workshopBench)return false;
 const {p,q,surfaceHalf}=workshopBench;
 const dx=position[0]-p.x,dz=position[2]-p.z,cos=1-2*q.y*q.y,sin=2*q.w*q.y;
 const x=Math.max(0,Math.abs(dx*cos-dz*sin)-surfaceHalf.x);
 const z=Math.max(0,Math.abs(dx*sin+dz*cos)-surfaceHalf.z);
 return x*x+z*z<=3.5*3.5;
}
function syncTabletMode(){
 const workshop=!!workshopPanel?.isOpen,near=tabletNearBench();
 panel.dataset.mode=workshop?'workshop':'bank';
 tabletEl('tablet-bank').setAttribute('aria-pressed',String(!workshop));
 const button=tabletEl('tablet-workshop');button.disabled=!near;button.title=near?'Trabajar en la mesa':'Acércate a una mesa desplegada';
 button.setAttribute('aria-pressed',String(workshop));
}
function tabletVisible(){return !panel.hidden&&story.mode==='playing'&&!story.transition&&story.scene==='lab';}
const tabletReducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
let tabletMotionStart=0,tabletStowTimer=0;
function showTablet(){
 if(panel.hidden){tabletMotionStart=performance.now();clearTimeout(tabletStowTimer);delete panel.dataset.stowing;}
 panel.hidden=false;tabletPreferences();syncTabletMode();
}
function stowTablet(){
 if(panel.hidden)return;
 closeWorkshopPanel(false);panel.hidden=true;redraw=true;tabletMotionStart=performance.now();
 panel.dataset.stowing='true';tabletStowTimer=setTimeout(()=>{delete panel.dataset.stowing;redraw=true;},170);
 if(!story.ready||story.mode==='playing')captureMouse();
}
function toggleTablet(){
 if(settingsScreen?.isOpen||story.mode!=='playing'||story.transition||document.body.dataset.booting==='true')return;
 if(panel.hidden)openPanel();else stowTablet();
}
function catalogCategory(id){
 if(id.startsWith('quick-saved-'))return 'Guardados';
 if(/^quick-(battery|cable|power|workshop|shelf|cooler)/.test(id))return 'Equipo';
 if(['cube','tetra','pyramid','coupler','quick-cargo','quick-gripper'].includes(id))return 'Piezas';
 return 'Máquinas';
}
function drawTabletCatalog(){
 const entries=['cube','tetra','pyramid','coupler','rotor',...quickEntries.keys()].filter(creationChoiceAllowed);
 const filters=tabletEl('catalog-filters'),list=tabletEl('catalog-entries');
 filters.replaceChildren();list.replaceChildren();
 const usable=['Piezas','Máquinas','Equipo','Guardados'].filter(name=>entries.some(id=>catalogCategory(id)===name));
 if(!usable.includes(catalogFilter))catalogFilter=usable[0];
 for(const name of usable){
  const button=document.createElement('button');button.type='button';button.textContent=name;
  button.setAttribute('aria-pressed',String(name===catalogFilter));button.addEventListener('click',()=>{catalogFilter=name;drawTabletCatalog();});filters.append(button);
 }
 for(const id of entries.filter(id=>catalogCategory(id)===catalogFilter)){
  const button=document.createElement('button');button.type='button';button.textContent=creationTitle(id);
  const description=quickEntries.get(id)?.subtitle||tabletPages.catalog[1];
  for(const event of ['focus','pointerenter'])button.addEventListener(event,()=>{tabletEl('tablet-help').textContent=description;});
  button.dataset.creation=id;button.addEventListener('click',()=>startCreationTool(id));list.append(button);
 }
}
function selectTabletGroup(id){switchPanelTab(tabletSections[id].tabs.find(tab=>tab!=='catalog'||story.scene==='lab'&&!puzzle.active));}
function switchPanelTab(name){
 if(!tabletPages[name])return;
 tabletTab=name;const group=Object.keys(tabletSections).find(id=>tabletSections[id].tabs.includes(name));
 panel.dataset.group=group;tabletPreferences();
 tabletEl('tablet-center').scrollTop=0;
 tabletEl('tablet-group-title').textContent=tabletSections[group].label;tabletEl('tablet-title').textContent=tabletPages[name][0];
 tabletEl('tablet-help').textContent=tabletPages[name][1];
 for(const id of Object.keys(tabletSections))tabletEl('wheel-'+id).setAttribute('aria-pressed',String(id===group));
 for(const tab of Object.keys(tabletPages)){
  const button=tabletEl('tab-'+tab);button.hidden=!tabletSections[group].tabs.includes(tab)||tab==='catalog'&&(story.scene!=='lab'||puzzle.active);
  tabletEl('page-'+tab).hidden=tab!==name;button.setAttribute('aria-selected',String(tab===name));
 }
 drawMachineLinks();
 if(name==='catalog'){refreshQuickEntries();drawTabletCatalog();}
}
const machineLinks=[
 ['servo-panel','Servos','Ajusta los límites, la velocidad y la marcha de las articulaciones.'],
 ['flight-panel','Vuelo','Configura la altura, las paradas y los puntos de la trayectoria.'],
 ['arm-panel','Brazo','Ajusta la posición inicial y los puntos A y B antes de iniciar la secuencia.'],
 ['conveyor-panel','Cintas','Prueba el sentido de la línea y comprueba la carga del tramo.'],
 ['sensor-panel','Sensor','Elige qué detecta el sensor, el destino y la acción que ejecutará.'],
 ['create-rotor','Rotores','Selecciona un rotor o un conjunto para ajustar el sentido, la fuerza y la velocidad.']
];
function drawMachineLinks(){
 const nav=tabletEl('machine-links');nav.replaceChildren();nav.hidden=tabletTab!=='mechanisms';if(nav.hidden)return;
 for(const [id,name,help] of machineLinks){
  const section=tabletEl(id);if(section.hidden)continue;
  const button=document.createElement('button');button.type='button';button.textContent=name;
  button.addEventListener('click',()=>{
   for(const other of nav.children)other.setAttribute('aria-pressed',String(other===button));
   tabletEl('tablet-help').textContent=help;section.scrollIntoView?.({block:'start'});
  });
  nav.append(button);
 }
}
function tabletWheel(event){
 if(panel.hidden||!event.deltaY)return;
 if(!event.shiftKey&&(workshopPanel?.isOpen||event.target?.closest?.('#tablet-center, .tablet-guide')))return;
 event.preventDefault();event.stopPropagation();
 const now=performance.now();if(now-tabletWheelTime<160)return;tabletWheelTime=now;
 if(event.shiftKey){
  if(workshopPanel?.isOpen){closeWorkshopPanel(false);switchPanelTab(tabletTab);}
  else if(tabletNearBench())openWorkshopPanel();
  return;
 }
 const order=Object.keys(tabletSections),index=order.indexOf(panel.dataset.group);
 selectTabletGroup(order[(index+Math.sign(event.deltaY)+order.length)%order.length]);
}
for(const id of Object.keys(tabletSections))tabletEl('wheel-'+id).addEventListener('click',()=>selectTabletGroup(id));
tabletEl('tablet-workshop').addEventListener('click',()=>{if(tabletNearBench())openWorkshopPanel();});
tabletEl('tablet-bank').addEventListener('click',()=>{closeWorkshopPanel(false);switchPanelTab(tabletTab);});
function saveTabletPosition(){
 try{window.localStorage.setItem(preferences.KEY,JSON.stringify(savedPreferences));}
 catch{announce('Ajuste aplicado para esta sesión.');}
}
tabletEl('tablet-hand').addEventListener('click',()=>{
 savedPreferences.tabletHand=savedPreferences.tabletHand==='right'?'left':'right';
 savedPreferences.tabletX=100-savedPreferences.tabletX;tabletPreferences();saveTabletPosition();
});
panel.addEventListener('wheel',tabletWheel,{passive:false});
const tabletGrip=tabletEl('tablet-grip');
let tabletDrag=null;
tabletGrip.addEventListener('pointerdown',event=>{
 if(event.button!==0||!tabletPose)return;
 tabletDrag={id:event.pointerId,x:event.clientX,y:event.clientY,startX:savedPreferences.tabletX,startY:savedPreferences.tabletY,travelX:tabletPose.travelX,travelY:tabletPose.travelY};
 tabletGrip.setPointerCapture(event.pointerId);event.preventDefault();
});
tabletGrip.addEventListener('pointermove',event=>{
 if(!tabletDrag||tabletDrag.id!==event.pointerId||panel.hidden)return;
 const {x,y,startX,startY,travelX,travelY}=tabletDrag;
 if(travelX>0)savedPreferences.tabletX=clamp(startX+100*(event.clientX-x)/travelX,0,100);
 if(travelY>0)savedPreferences.tabletY=clamp(startY+100*(event.clientY-y)/travelY,0,100);
 layoutTablet();
});
tabletGrip.addEventListener('lostpointercapture',()=>{
 if(tabletDrag){tabletDrag=null;saveTabletPosition();}
});

function drawCargos(){
 for(const c of cargos){
  if(c.dimensions){drawMatter(c);continue;}
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);bindGeometry(shadowGeometry);gl.uniform1f(uniforms.uKind,2);const s=c.size*2;
  if(visuals.shadows==='sharp'){drawProjectedShadow(unitProfile('cube').vertices.map(p=>add(c.body.position,c.body.quaternion.vmult(mul(p,c.size/CUBE_SIZE)))));}else if(visuals.shadows!=='off'){setPose(V(c.body.position.x,.001,c.body.position.z),Q(),V(s,1,s));gl.uniform1f(uniforms.uScale,s);gl.uniform1f(uniforms.uShadow,.2);submitDraw(gl.TRIANGLES,0,6);}
  const intake=c.intake||0,drawSize=c.size*(1-intake*.85);gl.depthMask(intake===0);if(intake===0)gl.disable(gl.BLEND);bindGeometry(cubeGeometry);gl.uniform1f(uniforms.uKind,5);setPose(V(c.body.position.x,c.robotPhysical?c.body.position.y:drawSize/2,c.body.position.z),c.body.quaternion,V(drawSize,drawSize,drawSize));
  const rgb=[1,3,5].map(i=>parseInt(c.color.slice(i,i+2),16)/255);tint(...rgb,1-intake*.8);submitDraw(gl.TRIANGLES,0,36);
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
// Inspection release is handled by the canonical action, including remapped keys.

// The first puzzle lives in the laboratory. Its previous contents are restored
// when leaving the challenge; rewards and deliveries use a single transaction.
const puzzleConfig={frameSeconds:12,energySeconds:8};
function puzzleBlockedEdit(kind='edit'){if(certifiedAutomation()){announce('Ensayo certificado: usa las piezas del banco. Reinicia el nivel para restaurarlas.');return true;}if(kind==='mechanism'&&mechanismsAvailable())return false;if(story.ready&&story.scene==='campaign'&&panel.hidden){announce('La materia genera nuevos Q-bits. P abre el banco de herramientas de prueba.');return true;}if(!puzzle.active||kind==='qubit'&&alphaSettings.allowPuzzleSpawn)return false;announce('Puzle activo · los recursos se obtienen en los portales. P → Puzle para volver al banco.');return true;}
function saveLab(){syncVirtualConveyors(0);cancelPowerCable();return {workshop:workshopPlacement&&{...workshopPlacement},disassembly:serializeDisassembly(),powerNetwork:serializePowerNetwork(),mechanismDefaults:typeof mechanismDefaults==='undefined'?null:{...mechanismDefaults},rotors:serializeRotorState(),rotorSets:serializeRotorSets(),robotArms:serializeRobotArms(),conveyors:typeof serializeConveyors==='function'?serializeConveyors():[],contacts:serializeContactState(),shelves:serializeShelves(),alphaScene:alphaSceneSnapshot(),settings:{...settings},moodSettings:{...moodSettings},position:[...position],yaw,pitch,groups:groups.map(g=>({parts:worldParts(g),q:g.body.quaternion.clone(),v:g.body.velocity.clone(),w:g.body.angularVelocity.clone()})),cargos:cargos.map(c=>({id:c.id,p:c.body.position.clone(),side:c.side,required:c.required,color:c.color,...(c.robotPhysical?{robotPhysical:true,q:c.body.quaternion.clone(),v:c.body.velocity.clone(),w:c.body.angularVelocity.clone()}:{} )}))};}
function clearPuzzleScene(){
 clearDisassembly();cancelUnitCreation();
 cancelPowerCable();clearPowerNetwork();
 flightStates.clear();resetBatteryLiquids();
 clearShelves();
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
 if(!puzzle.active)puzzle.savedLab=saveLab();removeWorkshop();contactStates.clear();rotorContactStates.clear();clearPuzzleScene();puzzle.active=true;puzzle.stage=0;puzzle.complete=false;puzzle.delivery=null;puzzle.earned=0;puzzle.run++;
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
 if(saved){Object.assign(settings,saved.settings);if(saved.moodSettings)Object.assign(moodSettings,saved.moodSettings);position.splice(0,3,...saved.position);yaw=saved.yaw;pitch=saved.pitch;camera.splice(0,3,...position);for(const g of saved.groups)makeGroup(g.parts,g.q,g.v,g.w);restoreLabMechanisms(saved);for(const c of saved.cargos)restoreLabCargo(c);}
 restoreAlphaScene(saved?.alphaScene);world.gravity.y=-settings.gravity;world.defaultContactMaterial.friction=settings.friction;world.defaultContactMaterial.restitution=settings.bounce;
 workshopPlacement=saved?.workshop===undefined?defaultWorkshopPlacement:saved.workshop;setupWorkshop();updatePuzzlePanel();updatePanel();announce('Banco de pruebas restaurado');
}
function portalReady(p){return p.frame>=1&&p.energy>=1;}
function portalAccepts(p,c){return puzzle.active&&!p.completed&&p.index===puzzle.stage&&c.puzzleStage===p.index&&c.color.toLowerCase()===p.color&&c.required===p.required&&portalReady(p);}
function puzzleObstacleBounds(c=null){return (puzzle.active?puzzle.walls.filter(w=>!w.portal||!c||!portalAccepts(w.portal,c)):[]).concat(storyWorld.walls);}
function puzzlePoseClear(g,pos,q,src=poses(g,pos,q),bb=bounds(g,pos,q)){return !puzzle.active||!puzzleObstacleBounds().some(w=>boundsOverlap(bb,w)&&src.some(a=>obbOverlap(a,{p:w.p,q:w.q||Q(),half:w.half})));}
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
  if(points.every(p=>p.y>HALF+.02&&p.y<ROOM_HEIGHT-HALF&&Math.max(Math.abs(p.x),Math.abs(p.z))<13.9&&cargoPlacementClear(p,.1,null,[])&&!groups.some(g=>poses(g).some(o=>obbOverlap(o,{p,q:Q()},-.012)))&&!puzzleObstacleBounds().some(w=>obbOverlap({p,q:Q()},{p:w.p,q:w.q||Q(),half:w.half},-.012))))return points;
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
 if(w.q&&w.p&&w.half){const inverse=w.q.inverse();origin=inverse.vmult(sub(origin,w.p));dir=inverse.vmult(dir);w={min:mul(w.half,-1),max:w.half};}
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
 const solid=(p,size,color)=>{bindGeometry(cubeGeometry);gl.uniform1f(uniforms.uKind,5);setPose(p,Q(),size);tint(...color,1);submitDraw(gl.TRIANGLES,0,36);};
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
  if(p.energy>0&&p.frame>0){const amount=Math.min(p.frame,p.energy);bindGeometry(cubeGeometry);gl.uniform1f(uniforms.uKind,6);setPose(V(p.x,.81,p.z+.002),Q(),V(1.08,1.62,.008));tint(...p.rgb,.40*amount);submitDraw(gl.TRIANGLES,0,36);
   gl.uniform1f(uniforms.uKind,7);setPose(V(p.x,.003,p.z+.35),Q(),V(1.9,.001,1.1));tint(...p.rgb,.11*amount);submitDraw(gl.TRIANGLES,0,36);
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
 if(saved)Object.assign(m,saved,{blend:[...(saved.blend||[1,0,0])],...(saved.externalBattery?{externalBattery:{...saved.externalBattery}}:{}),...(saved.gripper?{gripper:JSON.parse(JSON.stringify(saved.gripper))}:{}),...(saved.flight?{flight:QBitsPropellerPower.config(saved.flight)}:{})});m.name=m.name.replace(/^(?:Kiubit|Qubit) (\d+)$/,'Q-bit $1');return m;
}
function copyMood(m){return m?{...m,blend:[...m.blend],...(m.externalBattery?{externalBattery:{...m.externalBattery}}:{}),...(Array.isArray(m.sensorMachine?.members)?{sensorMachine:{...m.sensorMachine,members:m.sensorMachine.members.map(pair=>({...pair}))}}:{}),...(m.sensorConfig?{sensorConfig:{...m.sensorConfig}}:{}),...(m.sensorLink?{sensorLink:{...m.sensorLink}}:{}),...(m.gripper?{gripper:JSON.parse(JSON.stringify(m.gripper))}:{}),...(m.flight?{flight:QBitsPropellerPower.config(m.flight)}:{})}:null;}
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
 let retried=false;const externalInternals=externallyPoweredInternalIds();
 for(const g of groups){
  const previous=g.moodLastPosition||g.body.position;const travel=Math.min(Math.hypot(g.body.position.x-previous.x,g.body.position.z-previous.z),6*dt);g.moodLastPosition=g.body.position.clone();
  const carried=!!held&&(held.items||[held]).some(i=>i.g===g),job=g.haulJob,slot=job?.slots.find(s=>s.g===g),task=!!(g.route||job||g.pendingMoodOrder||g.blueprintJob||g.robotHeld||g.robotGrip||g.parts.some(p=>robotWorkingParts.has(p))),duty=onPuzzleButton(g)||onCampaignPad(g)||!!g.storySocket||!!g.cooler;
  const waiting=!!job&&(job.phase==='planning'||slot?.ready&&['reuniendo','descansando'].includes(job.phase)),resting=!groupWilling(g),moving=travel>dt*.006;
  const working=!carried&&!resting&&(!!g.route||!!job&&!waiting&&job.phase!=='bloqueado');
  const blocked=!carried&&!resting&&((g.pendingMoodOrder?.reason==='bloqueo')||!!job&&job.phase==='bloqueado'||working&&!moving&&!g.route?.align&&!slot?.ready);
  const effort=job?1+Math.min(1,job.cargo.required/Math.max(1,job.slots.reduce((n,s)=>n+groupWorkUnits(s.g),0)))*.65:1;
  for(const part of g.parts){const m=part.mood;if(m.production||isExternalBattery(part))continue;
   if(g.moodHadTask&&!task){m.calm=2;m.idle=0;m.fullTime=0;if(m.state!=='restless')m.state='neutral';}
   m.calm=Math.max(0,m.calm-dt);
   if(!externalInternals.has(part.id)){
    if(working&&moving){m.energy=clamp(m.energy-travel*moodSettings.drain*effort*QBitsWorkshop.movementFactors(part).energy*20/gameBatteryCapacity(part)-dt*.0015*20/gameBatteryCapacity(part),0,1);m.idle=0;m.boredOnce=false;}
    else if(!rotorForPart(part.id)?.powerActive&&!robotWorkingParts.has(part))m.energy=clamp(m.energy+dt*moodSettings.recovery*(.9+.2*m.personality)*20/gameBatteryCapacity(part),0,1);
   }
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
   if(!externalInternals.has(part.id)&&g.cooler&&g.cooler.entries.get(part.id)?.done)m.energy=Math.min(m.energy,alphaSettings.exitEnergy);
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
 if(coolers.length>=12){announce('Máximo de 12 enfriadores en esta sala.');return null;}
 if(!p||Math.max(Math.abs(p.x),Math.abs(p.z))>13.4||!cargoPlacementClear(p,.84)||coolers.some(c=>c.p.distanceTo(p)<.9)){announce('Busca un espacio libre para el enfriador.');return null;}
 const c={id:++alphaSerial,p:V(p.x,0,p.z),capacity:alphaSettings.capacity,enabled:true,bodies:[],entries:new Map(),occupants:0};coolers.push(c);
 const floor=new CANNON.Body({mass:0});floor.addShape(new CANNON.Cylinder(.32,.32,.018,20),V(),new CANNON.Quaternion().setFromEuler(-Math.PI/2,0,0));floor.position.set(p.x,.009,p.z);floor.collisionFilterMask=-1;world.addBody(floor);c.bodies.push(floor);
 for(let i=0;i<20;i++){const a=i*Math.PI/10,q=Q();q.setFromAxisAngle(V(0,1,0),-a);addAlphaCollider(c,V(p.x+Math.cos(a)*.36,.077,p.z+Math.sin(a)*.36),V(.042,.077,.061),q);}
 announce('Enfriador colocado · capacidad '+c.capacity);return c;
}
function removeCooler(c){for(const b of c.bodies)world.removeBody(b);for(const g of groups)if(g.cooler===c)g.cooler=null;coolers.splice(coolers.indexOf(c),1);}
function updateCooling(dt){
 const externalInternals=externallyPoweredInternalIds();
 for(const g of groups)g.cooler=null;
 for(const c of coolers){let count=0;const seen=new Set();
  const candidates=groups.filter(g=>!g.route&&!g.haulJob&&!g.blueprintJob&&!(held?.items||[]).some(i=>i.g===g)).map(g=>({g,b:bounds(g)})).filter(o=>o.b.min.y>=-.005&&o.b.min.y<.05&&Math.max(...poses(o.g).flatMap(corners).map(v=>Math.hypot(v.x-c.p.x,v.z-c.p.z)))<.315).sort((a,b)=>Number(c.entries.has(b.g.parts[0].id))-Number(c.entries.has(a.g.parts[0].id)));
  for(const {g} of candidates){if(count+g.parts.length>c.capacity)continue;count+=g.parts.length;
   if(!c.enabled||!alphaSettings.coolingOn)continue;g.cooler=c;
   for(const part of g.parts){if(isExternalBattery(part)||externalInternals.has(part.id))continue;seen.add(part.id);if(rotorForPart(part.id)?.powerActive||robotWorkingParts.has(part))continue;let e=c.entries.get(part.id);if(!e){e={elapsed:0,done:false};c.entries.set(part.id,e);}const coolingSeconds=(c.coolSeconds||alphaSettings.coolSeconds)*gameBatteryCapacity(part)/300;e.duration=coolingSeconds;e.elapsed=Math.min(coolingSeconds,e.elapsed+dt);
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
function storedRotorDrive(config){
 const legacy=config.driveRating!==2;
 return {driveRating:2,mount:config.mount??'wheel',maxTorque:legacy?(config.maxTorque??.4)*8:(config.maxTorque??3.2),capacity:legacy?(config.capacity??16)*8:(config.capacity??128),...(config.servo?{servo:JSON.parse(JSON.stringify(config.servo))}:{})};}
function storedJointShapesValid(config,a,b){
 if(!a||!b)return false;
 return config.servo?servoConfigValid(config.servo)&&unitShape(a)==='pyramid'&&unitShape(b)===(config.servo.kind==='pivot'?'cube':'pyramid'):unitShape(a)==='coupler'&&unitShape(b)==='coupler';
}
function storedRotorOptionsValid(config){
 return !!config&&Number.isFinite(config.rpm)&&config.rpm>=1&&config.rpm<=(config.driveRating===2?360:120)&&(config.driveRating===undefined||config.driveRating===2)&&[1,-1].includes(config.direction)&&['a','b'].includes(config.moving)&&typeof config.enabled==='boolean'&&
  (config.mount===undefined||['wheel','fixed'].includes(config.mount))&&
  (config.maxTorque===undefined||Number.isFinite(config.maxTorque)&&config.maxTorque>=.02&&config.maxTorque<=(config.driveRating===2?32:4))&&
  (config.capacity===undefined||Number.isFinite(config.capacity)&&config.capacity>=2&&config.capacity<=(config.driveRating===2?16000:MAX_QUBITS))&&
  (config.servo===undefined||servoConfigValid(config.servo)&&config.moving==='b'&&config.mount==='wheel');
}
function serializeRotorState(){
 if(typeof rotors==='undefined')return [];
 return rotors.filter(r=>rotorGroups(r).every(g=>g&&groups.includes(g))).map(r=>({aId:r.aId,bId:r.bId,rpm:r.rpm,direction:r.direction,moving:r.moving,...storedRotorDrive(r),enabled:r.enabled}));
}
function serializeRotorSets(){return rotorSets.map(set=>({name:set.name,members:rotorSetMembers(set).map(r=>({aId:r.aId,bId:r.bId}))})).filter(set=>set.members.length);}
function restoreRotorSets(records){
 rotorSets.length=0;clearRotorSelection();if(!Array.isArray(records))return;
 const assigned=new Set();
 for(const record of records.slice(0,rotors.length)){
  if(!record||typeof record.name!=='string'||!Array.isArray(record.members))continue;
  const members=[];for(const pair of record.members.slice(0,rotors.length)){
   const rotor=rotors.find(r=>r.aId===pair?.aId&&r.bId===pair?.bId);
   if(rotor&&!assigned.has(rotor.id)){members.push(rotor);assigned.add(rotor.id);}
  }
  if(members.length)createRotorSet(record.name,members);
 }
}
function restoreRotorState(data){
 if(typeof rotors==='undefined')return [];
 for(const r of [...rotors])disconnectRotor(r);
 if(!Array.isArray(data))return [];
 const made=[],links=data.filter(r=>storedRotorOptionsValid(r)&&Number.isSafeInteger(r.aId)&&Number.isSafeInteger(r.bId)).map(record=>({record,a:rotorPart(record.aId)?.g,b:rotorPart(record.bId)?.g})).filter(link=>link.a&&link.b&&link.a!==link.b);
 // Restoring an upstream hinge must move its saved downstream branch too.
 // Those hinges do not exist yet in the live graph. Moving only body B
 // separates the next pivot and used to discard a taught shoulder/elbow.
 const savedBranch=(root,excluded)=>{const found=new Set([root]),queue=[root];for(let i=0;i<queue.length;i++)for(const link of links){if(link.record===excluded)continue;const next=link.a===queue[i]?link.b:link.b===queue[i]?link.a:null;if(next&&!found.has(next)){found.add(next);queue.push(next);}}return queue;};
 for(const r of data){
  if(!storedRotorOptionsValid(r)||!Number.isSafeInteger(r.aId)||!Number.isSafeInteger(r.bId))continue;
  const a=rotorPart(r.aId),b=rotorPart(r.bId);
  if(a&&b&&a.g!==b.g){
   const at=rotorEndpoint(a,r.servo,'a'),bt=rotorEndpoint(b,r.servo,'b'),network=savedBranch(b.g,r);
   if(!network.includes(a.g)&&at.point.distanceTo(bt.point)<=.005&&at.axis.dot(bt.axis)<-.995){
    const turn=Q();turn.setFromVectors(bt.axis,mul(at.axis,-1));turn.normalize();
    for(const g of network){g.body.position.copy(add(at.point,turn.vmult(sub(g.body.position,bt.point))));g.body.quaternion.copy(turn.mult(g.body.quaternion));g.body.quaternion.normalize();g.body.velocity.copy(turn.vmult(g.body.velocity));g.body.angularVelocity.copy(turn.vmult(g.body.angularVelocity));g.body.aabbNeedsUpdate=true;}
   }
  }
  const rotor=connectRotorTips(r.aId,r.bId,{...r,...storedRotorDrive(r),enabled:false});if(rotor)made.push([rotor,r]);
 }
 for(const [r,state]of made)configureRotor(r,{...state,...storedRotorDrive(state),enabled:state.enabled&&!state.servo});
 return made.map(([r])=>r);
}
function restoreLabMechanisms(saved){
 restoreDisassembly(saved?.disassembly);
 if(typeof mechanismDefaults!=='undefined'){
  const input=saved?.mechanismDefaults||{},defaults={rpm:30,direction:1,moving:'b',mount:'wheel',maxTorque:3.2,capacity:256};
  for(const [key,fallback] of Object.entries(defaults)){
   mechanismDefaults[key]=fallback;
   if(input[key]===undefined)continue;
   const candidate={...defaults,driveRating:input.driveRating,[key]:input[key],enabled:false};
   if(storedRotorOptionsValid(candidate))mechanismDefaults[key]=storedRotorDrive(candidate)[key]??candidate[key];
  }
 }
 restorePowerNetwork(saved?.powerNetwork);const restored=restoreRotorState(saved?.rotors);restoreRotorSets(saved?.rotorSets);restoreContactState(saved?.contacts);restoreShelves(saved?.shelves);if(typeof restoreRobotArms==='function')restoreRobotArms(saved?.robotArms);if(typeof restoreConveyors==='function')restoreConveyors(saved?.conveyors);return restored;
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
 return record.groups.map(group=>group.parts.map(part=>{const q=Q();q.set(...part.q);q.normalize();return {key:part.key,shape:part.shape,weight:part.weight,p:add(origin,V(...part.p)),q,...(part.battery!==undefined?{battery:{...part.battery}}:{})};}));
}
function storedBatteryPacksValid(keys,owners,posesByKey){
 const packs=new Map();
 for(const part of keys.values()){
  if(part.battery===undefined)continue;
  const state=part.battery;
  if(!state||typeof state!=='object'||Array.isArray(state)||Object.keys(state).some(key=>!['pack','enabled'].includes(key))||part.shape!=='cube'||!Number.isSafeInteger(state.pack)||typeof state.enabled!=='boolean')return false;
  const anchor=keys.get(state.pack);if(!anchor||anchor.battery?.pack!==state.pack||owners.get(anchor.key)!==owners.get(part.key))return false;
  if(!packs.has(state.pack))packs.set(state.pack,[]);packs.get(state.pack).push(posesByKey.get(part.key));
 }
 for(const cells of packs.values()){
  if(cells.length>3)return false;if(cells.length===1)continue;
  let first=cells[0],last=cells[1],distance=first.p.distanceTo(last.p);
  for(const a of cells)for(const b of cells){const d=a.p.distanceTo(b.p);if(d>distance){first=a;last=b;distance=d;}}
  const axis=sub(last.p,first.p);axis.normalize();
  const sorted=[...cells].sort((a,b)=>sub(a.p,first.p).dot(axis)-sub(b.p,first.p).dot(axis));
  for(let i=0;i<sorted.length;i++){
   const offset=sub(sorted[i].p,first.p),along=offset.dot(axis);
   if(sub(offset,mul(axis,along)).norm()>.00005||Math.abs(along-i*CUBE_SIZE)>.00005||i&&!touchingUnitFaces(sorted[i-1],sorted[i]))return false;
  }
 }
 return true;
}
function storedRotorSetsValid(record){
 if(record.rotorSets===undefined)return true;
 if(!Array.isArray(record.rotorSets)||record.rotorSets.length>record.joints.length)return false;
 const used=new Set();
 for(const set of record.rotorSets){
  if(!set||typeof set.name!=='string'||!set.name.trim()||set.name.length>40||/[\u0000-\u001f\u007f]/.test(set.name)||!Array.isArray(set.joints)||!set.joints.length||set.joints.length>record.joints.length)return false;
  for(const index of set.joints){if(!Number.isSafeInteger(index)||index<0||index>=record.joints.length||used.has(index))return false;used.add(index);}
 }
 return true;
}
function storedGripperConfigValid(config){
 return typeof validGripperConfig==='function'&&validGripperConfig(config);
}
function storedRobotArmValid(record,keys){
 const arm=record.robotArm;if(arm===undefined)return true;
 if(!arm||arm.version!==1||!keys.has(arm.base)||!keys.get(arm.gripper)?.gripper||typeof arm.repeat!=='boolean'||!Array.isArray(arm.joints)||arm.joints.length<1||arm.joints.length>4||new Set(arm.joints).size!==arm.joints.length||arm.joints.some(i=>!Number.isInteger(i)||i<0||i>=record.joints.length||record.joints[i].servo))return false;
 if(arm.poses?.home!==undefined&&!robotPoseValid(arm.poses.home,arm.joints.length))return false;
 if(arm.poses!==undefined){for(const name of ['pick','place'])if(arm.poses?.[name]!==null&&(!Array.isArray(arm.poses?.[name])||arm.poses[name].length!==arm.joints.length||arm.poses[name].some(q=>!Array.isArray(q)||q.length!==4||!q.every(Number.isFinite)||Math.abs(Math.hypot(...q)-1)>.0001)))return false;}
 return true;
}
function storedConveyorPortsValid(ports){
 if(ports===undefined)return true;
 if(!ports||typeof ports!=='object'||Array.isArray(ports))return false;
 return ['entry','exit'].every(key=>{const port=ports[key];return port&&Array.isArray(port.p)&&port.p.length===3&&port.p.every(n=>Number.isFinite(n)&&Math.abs(n)<=10)&&Array.isArray(port.direction)&&port.direction.length===3&&port.direction.every(Number.isFinite)&&Math.abs(Math.hypot(...port.direction)-1)<.0001;});
}
// The final belt is a surface of the supplied machine. Imported ports cannot
// manufacture an unrelated platform elsewhere or outside its own rollers.
function conveyorPortGeometryValid(kind,ports,basePose,materialPoses,rollerPoses){
 if(ports===undefined||ports===null)return true;
 if(!storedConveyorPortsValid(ports)||!basePose?.p||!basePose?.q||!materialPoses?.length||!rollerPoses?.length)return false;
 const e=ports.entry,x=ports.exit,tolerance=.0001,cardinal=d=>Math.abs(d[1])<tolerance&&((Math.abs(Math.abs(d[0])-1)<tolerance&&Math.abs(d[2])<tolerance)||(Math.abs(Math.abs(d[2])-1)<tolerance&&Math.abs(d[0])<tolerance));
 if(!cardinal(e.direction)||!cardinal(x.direction)||Math.abs(e.p[1]-x.p[1])>tolerance)return false;
 const delta=x.p.map((n,i)=>n-e.p[i]),dot=(a,b)=>a.reduce((v,n,i)=>v+n*b[i],0);let path;
 if(kind==='straight'){
  const length=dot(delta,e.direction);if(length<.02||length>2||e.direction.some((n,i)=>Math.abs(n-x.direction[i])>tolerance)||delta.some((n,i)=>Math.abs(n-length*e.direction[i])>tolerance))return false;
  path=[e.p,x.p];
 }else{
  if(!['left','right'].includes(kind)||Math.abs(e.direction[0])<.9999||Math.abs(x.direction[2])<.9999||Math.abs(e.direction[0]*x.direction[2]-(kind==='right'?1:-1))>tolerance)return false;
  const lengths=[delta[0]*e.direction[0],delta[2]*x.direction[2]];if(lengths.some(n=>n<.02||n>2))return false;path=[e.p,[x.p[0],e.p[1],e.p[2]],x.p];
 }
 const inv=basePose.q.inverse(),local=p=>inv.vmult(sub(p,basePose.p));
 const box=poses=>{const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const pose of poses)for(const corner of corners(pose)){const p=local(corner);min[0]=Math.min(min[0],p.x);min[1]=Math.min(min[1],p.y);min[2]=Math.min(min[2],p.z);max[0]=Math.max(max[0],p.x);max[1]=Math.max(max[1],p.y);max[2]=Math.max(max[2],p.z);}return {min,max};};
 const material=box(materialPoses),rollers=box(rollerPoses),top=e.p[1]+HALF*Math.SQRT2+.004,width=3*CUBE_SIZE;
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],alongX=Math.abs(a[0]-b[0])>tolerance;
  const low=[Math.min(a[0],b[0])-(alongX?0:width/2),top-.004,Math.min(a[2],b[2])-(alongX?width/2:0)],high=[Math.max(a[0],b[0])+(alongX?0:width/2),top,Math.max(a[2],b[2])+(alongX?width/2:0)];
  for(let axis=0;axis<3;axis++)if(low[axis]<material.min[axis]-.0301||high[axis]>material.max[axis]+.0301||low[axis]<rollers.min[axis]-.1001||high[axis]>rollers.max[axis]+.1001)return false;
 }
 return true;
}
function storedConveyorGeometryValid(modules,groupsData,readId,readPose){
 if(!modules?.length)return true;
 const poses=groupsData.map(group=>group.parts.map(readPose)),byId=new Map(),owners=new Map();groupsData.forEach((g,i)=>g.parts.forEach((p,j)=>{byId.set(readId(p),poses[i][j]);owners.set(readId(p),i);}));
 return modules.every(module=>{const base=byId.get(module.baseId),owner=owners.get(module.baseId),moving=new Set(module.joints.map(j=>owners.get(j.aId)===owner?owners.get(j.bId):owners.get(j.aId)));return !!base&&conveyorPortGeometryValid(module.kind,module.ports,base,poses.flat(),[...moving].flatMap(i=>poses[i]||[]));});
}
function storedShelfConveyorsValid(item){
 return storedConveyorGeometryValid(item.conveyors,item.groups,p=>p.id,p=>{const q=Q();q.set(...p.q);return {shape:p.shape,p:V(...p.p),q};});
}
function storedConveyorsValid(record,keys,owners){
 if(record.conveyors===undefined)return true;
 if(!Array.isArray(record.conveyors)||!record.conveyors.length||record.conveyors.length>record.joints.length)return false;
 const bases=new Set(),claimed=new Set(record.robotArm?.joints||[]);
 for(const module of record.conveyors){
  if(!module||module.version!==1||!keys.has(module.base)||bases.has(module.base)||!['straight','left','right'].includes(module.kind)||![1,-1].includes(module.direction)||!Number.isInteger(module.capacity)||module.capacity<1||module.capacity>MAX_QUBITS||!Array.isArray(module.joints)||!module.joints.length||module.joints.length>16||!storedConveyorPortsValid(module.ports))return false;
  bases.add(module.base);
  if(module.drives!==undefined&&(!Array.isArray(module.drives)||module.drives.length!==module.joints.length||module.drives.some(n=>![1,-1].includes(n))))return false;
  for(const index of module.joints){if(!Number.isInteger(index)||index<0||index>=record.joints.length||claimed.has(index))return false;const joint=record.joints[index];if(!joint||joint.servo||![owners.get(joint.a),owners.get(joint.b)].includes(owners.get(module.base)))return false;claimed.add(index);}
  if(module.moduleParts!==undefined){const allowed=new Set([owners.get(module.base),...module.joints.flatMap(index=>[owners.get(record.joints[index].a),owners.get(record.joints[index].b)])]);if(!Array.isArray(module.moduleParts)||module.moduleParts.length>MAX_QUBITS||new Set(module.moduleParts).size!==module.moduleParts.length||module.moduleParts.some(key=>!keys.has(key)||!allowed.has(owners.get(key)))||!(module.required||[module.base]).every(key=>module.moduleParts.includes(key)))return false;}
  if(module.required!==undefined){const allowed=new Set([owners.get(module.base),...module.joints.flatMap(index=>[owners.get(record.joints[index].a),owners.get(record.joints[index].b)])]);if(!Array.isArray(module.required)||!module.required.length||module.required.length>MAX_QUBITS||new Set(module.required).size!==module.required.length||module.required.some(key=>!keys.has(key)||!allowed.has(owners.get(key)))||![module.base,...module.joints.flatMap(index=>[record.joints[index].a,record.joints[index].b]),...record.groups.flatMap((group,index)=>allowed.has(index)&&index!==owners.get(module.base)?group.parts.map(part=>part.key):[])].every(key=>module.required.includes(key)))return false;}
 }
 return true;
}
function savedMechanismValid(record){
 try{
  if(!record||record.version!==1||!['rotor','coupler','battery','gripper'].includes(record.type)||typeof record.name!=='string'||!record.name.trim()||record.name.length>40||/[\u0000-\u001f]/.test(record.name))return false;
  if(!Array.isArray(record.groups)||record.groups.length<1||record.groups.length>MAX_QUBITS||!Array.isArray(record.joints)||record.joints.length>=record.groups.length)return false;
  if(['coupler','battery','gripper'].includes(record.type)&&(record.groups.length!==1||record.joints.length!==0)||record.type==='rotor'&&(record.groups.length<2||!record.joints.length)||!storedRotorSetsValid(record))return false;
  const keys=new Map(),owners=new Map();let count=0;
  for(const [groupIndex,group]of record.groups.entries()){
   if(!Array.isArray(group?.parts)||!group.parts.length)return false;
   for(const part of group.parts){
    if(++count>MAX_QUBITS||!part||!Number.isSafeInteger(part.key)||part.key<0||part.key>=MAX_QUBITS||keys.has(part.key)||!['cube','tetra','pyramid','coupler'].includes(part.shape))return false;
    if(!Number.isFinite(part.weight)||part.weight<(part.shape==='tetra'?.25/12:part.shape==='pyramid'?.25/6:.25)-1e-9||part.weight>3||!Array.isArray(part.p)||part.p.length!==3||!part.p.every(n=>Number.isFinite(n)&&Math.abs(n)<14)||!Array.isArray(part.q)||part.q.length!==4||!part.q.every(Number.isFinite)||Math.abs(Math.hypot(...part.q)-1)>.0001)return false;
    if(part.flight!==undefined&&(part.shape!=='coupler'||!QBitsPropellerPower.validConfig(part.flight)))return false;
    if(part.gripper!==undefined&&(part.shape!=='cube'||part.battery!==undefined||!storedGripperConfigValid(part.gripper)))return false;
    keys.set(part.key,part);owners.set(part.key,groupIndex);
   }
  }
  if(record.type==='battery'?![...keys.values()].some(part=>part.battery!==undefined):record.type==='gripper'?![...keys.values()].some(part=>part.gripper!==undefined):![...keys.values()].some(part=>part.shape==='coupler')&&!record.joints.some(j=>j?.servo))return false;
  if(!storedRobotArmValid(record,keys)||!storedConveyorsValid(record,keys,owners))return false;
  const powered=record.joints.filter(j=>j?.enabled===true);if(powered.length>1&&powered.some(j=>j.mount==='fixed'))return false;
  const attached=new Set(),graph=record.groups.map(()=>new Set()),parents=record.groups.map((_,i)=>i),root=i=>parents[i]===i?i:parents[i]=root(parents[i]);
  for(const joint of record.joints){
   if(!joint||!Number.isSafeInteger(joint.a)||!Number.isSafeInteger(joint.b)||joint.a===joint.b||!storedJointShapesValid(joint,keys.get(joint.a),keys.get(joint.b))||owners.get(joint.a)===owners.get(joint.b)||attached.has(joint.a)||attached.has(joint.b))return false;
   if(!storedRotorOptionsValid(joint))return false;
   const a=owners.get(joint.a),b=owners.get(joint.b);if(root(a)===root(b))return false;parents[root(a)]=root(b);graph[a].add(b);graph[b].add(a);attached.add(joint.a);attached.add(joint.b);
  }
  const reached=new Set([0]),queue=[0];for(let i=0;i<queue.length;i++)for(const n of graph[queue[i]])if(!reached.has(n)){reached.add(n);queue.push(n);}
  if(reached.size!==record.groups.length||typeof couplerTip!=='function')return false;
  const rigid=mechanismRecordParts(record),all=rigid.flat(),byKey=new Map(all.map(part=>[part.key,part]));
  const modules=(record.conveyors||[]).map(module=>({...module,baseId:module.base,joints:module.joints.map(index=>({aId:record.joints[index].a,bId:record.joints[index].b}))}));
  if(!storedConveyorGeometryValid(modules,record.groups,p=>p.key,p=>byKey.get(p.key)))return false;
  if(!storedBatteryPacksValid(keys,owners,byKey))return false;
  if(!rigid.every(assemblyValid))return false;
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)if(obbOverlap(all[i],all[j],.00001))return false;
  for(const joint of record.joints){const a=rotorEndpoint(byKey.get(joint.a),joint.servo,'a'),b=rotorEndpoint(byKey.get(joint.b),joint.servo,'b');if(a.point.distanceTo(b.point)>.002||a.axis.dot(b.axis)>-.995)return false;}
  return true;
 }catch{return false;}
}
function copySavedMechanism(record){
 return {version:1,type:record.type,name:record.name,groups:record.groups.map(g=>({parts:g.parts.map(p=>({key:p.key,shape:p.shape,weight:p.weight,p:[...p.p],q:[...p.q],...(p.battery?{battery:{pack:p.battery.pack,enabled:p.battery.enabled}}:{}),...(p.gripper?{gripper:{...p.gripper}}:{}),...(p.flight?{flight:QBitsPropellerPower.config(p.flight)}:{})}))})),joints:record.joints.map(j=>({a:j.a,b:j.b,rpm:j.rpm,direction:j.direction,moving:j.moving,...storedRotorDrive(j),enabled:j.enabled})),...(record.rotorSets?{rotorSets:record.rotorSets.map(set=>({name:set.name,joints:[...set.joints]}))}:{}),...(record.robotArm?{robotArm:JSON.parse(JSON.stringify(record.robotArm))}:{}),...(record.conveyors?{conveyors:JSON.parse(JSON.stringify(record.conveyors))}:{})};
}
function alignMechanismSnapshot(record){
 // A live hinge solver may leave millimetres of drift. Canonicalize only this
 // saved copy; imports stay strict and live bodies are never repositioned here.
 if(!record.joints.length)return true;
 const rigid=mechanismRecordParts(record),parts=new Map(),owners=new Map();
 rigid.forEach((group,i)=>group.forEach(part=>{parts.set(part.key,part);owners.set(part.key,i);}));
 const links=rigid.map(()=>[]);for(const joint of record.joints){const a=owners.get(joint.a),b=owners.get(joint.b);links[a].push(b);links[b].push(a);}
 const reached=new Set([0]);let changed=true;
 while(changed){changed=false;for(const joint of record.joints){
  const ai=owners.get(joint.a),bi=owners.get(joint.b),knownA=reached.has(ai),knownB=reached.has(bi);
  if(knownA===knownB)continue;
  const parent=parts.get(knownA?joint.a:joint.b),child=parts.get(knownA?joint.b:joint.a),index=knownA?bi:ai;
  const a=rotorEndpoint(parent,joint.servo,knownA?'a':'b'),b=rotorEndpoint(child,joint.servo,knownA?'b':'a');
  if(a.point.distanceTo(b.point)>.005||a.axis.dot(b.axis)>-.995)return false;
  const rotation=Q();rotation.setFromVectors(b.axis,mul(a.axis,-1));rotation.normalize();
  // Correct the complete descendant branch together. Moving only the first
  // body would manufacture a larger gap at its otherwise sound next hinge.
  const branch=[index],seen=new Set(branch);for(const at of branch)for(const next of links[at])if(!reached.has(next)&&!seen.has(next)){seen.add(next);branch.push(next);}
  for(const childIndex of branch)for(const part of rigid[childIndex]){part.p=add(a.point,rotation.vmult(sub(part.p,b.point)));part.q=rotation.mult(part.q);part.q.normalize();}
  reached.add(index);changed=true;
 }}
 if(reached.size!==rigid.length)return false;
 const minY=Math.min(...rigid.flat().flatMap(corners).map(v=>v.y));
 for(const group of record.groups)for(const part of group.parts){const pose=parts.get(part.key);part.p=[pose.p.x,pose.p.y-minY,pose.p.z].map(n=>+n.toFixed(8));part.q=[pose.q.x,pose.q.y,pose.q.z,pose.q.w].map(n=>+n.toFixed(10));}
 return true;
}
function mechanismSnapshot(subject,name=null){
 syncVirtualConveyors(0);
 const connected=mechanismGroups(subject);if(!connected.length||!connected.some(g=>g.parts.some(p=>p.shape==='coupler'||p.mood?.externalBattery||p.mood?.gripper))&&!rotors.some(r=>r.servo&&rotorGroups(r).some(g=>connected.includes(g))))return null;
 if(connected.some(g=>g.parts.some(p=>p.mood?.externalBattery&&!isExternalBattery(p))))return null;
 const linked=rotors.filter(r=>rotorGroups(r).every(g=>connected.includes(g)));
 const hasBattery=connected.some(g=>g.parts.some(isExternalBattery)),hasGrip=connected.some(g=>g.parts.some(p=>p.mood?.gripper)),type=linked.length?'rotor':hasBattery?'battery':hasGrip?'gripper':'coupler',commonSet=linked.length&&rotorSetFor(linked[0]),defaultName=commonSet&&linked.every(r=>commonSet.rotorIds.includes(r.id))?commonSet.name:linked.length?(hasGrip?'Brazo Q-bits':linked.length===1&&linked[0].servo?(linked[0].servo.kind==='pivot'?'Servo pivote':'Servo bisagra'):linked.some(r=>r.servo)?'Mecanismo articulado':'Rotor'):hasBattery?'Batería':hasGrip?'Cubo de agarre':'Enganche';
 const min=V(Infinity,Infinity,Infinity),max=V(-Infinity,-Infinity,-Infinity);
 for(const g of connected){const box=bounds(g);for(const axis of ['x','y','z']){min[axis]=Math.min(min[axis],box.min[axis]);max[axis]=Math.max(max[axis],box.max[axis]);}}
 const origin=V((min.x+max.x)/2,min.y,(min.z+max.z)/2),keys=new Map();let key=0;
 const record={version:1,type,name:String(name||(propellerModules(connected).length?'Dron Q-bits':defaultName)).replace(/[\u0000-\u001f]/g,'').trim().slice(0,40)||defaultName,groups:connected.map(g=>({parts:worldParts(g).map(p=>{const current=key++;keys.set(p.id,current);return {key:current,shape:p.shape,weight:p.weight,p:[p.p.x-origin.x,p.p.y-origin.y,p.p.z-origin.z].map(n=>+n.toFixed(8)),q:[p.q.x,p.q.y,p.q.z,p.q.w].map(n=>+n.toFixed(10)),...(p.mood?.gripper?{gripper:{...p.mood.gripper}}:{}),...(p.mood?.flight?{flight:QBitsPropellerPower.config(p.mood.flight)}:{})};})})),joints:linked.map(r=>({a:keys.get(r.aId),b:keys.get(r.bId),rpm:r.rpm,direction:r.direction,moving:r.moving,...storedRotorDrive(r),enabled:r.enabled}))};
 // A chassis can still join two cells after their middle cell is removed.
 // Export each contiguous straight run as its own pack, without changing live
 // identities, switches or charge. Charge never enters the template.
 const batteryPoses=mechanismRecordParts(record);
 for(let i=0;i<connected.length;i++){
  const packs=new Map();
  for(let j=0;j<connected[i].parts.length;j++){const battery=externalBatteryState(connected[i].parts[j]);if(!battery)continue;if(!packs.has(battery.packId))packs.set(battery.packId,[]);packs.get(battery.packId).push({battery,stored:record.groups[i].parts[j],pose:batteryPoses[i][j]});}
  for(const cells of packs.values()){
   const remaining=new Set(cells);
   while(remaining.size){
    const seed=remaining.values().next().value;let run=[seed];
    for(const neighbor of remaining){
     if(neighbor===seed||!touchingUnitFaces(seed.pose,neighbor.pose))continue;
     const direction=sub(neighbor.pose.p,seed.pose.p),forward=add(neighbor.pose.p,direction),backward=sub(seed.pose.p,direction);
     const extra=[...remaining].find(cell=>cell!==seed&&cell!==neighbor&&(cell.pose.p.distanceTo(forward)<.00005&&touchingUnitFaces(neighbor.pose,cell.pose)||cell.pose.p.distanceTo(backward)<.00005&&touchingUnitFaces(seed.pose,cell.pose)));
     const candidate=extra?[seed,neighbor,extra]:[seed,neighbor];if(candidate.length>run.length)run=candidate;if(run.length===3)break;
    }
    const anchor=Math.min(...run.map(cell=>cell.stored.key));for(const cell of run){cell.stored.battery={pack:anchor,enabled:cell.battery.enabled};remaining.delete(cell);}
   }
  }
 }
 const sets=rotorSets.map(set=>({name:set.name,joints:linked.map((r,index)=>set.rotorIds.includes(r.id)?index:-1).filter(index=>index>=0)})).filter(set=>set.joints.length);
 if(sets.length)record.rotorSets=sets;
 if(typeof robotArmTemplate==='function'){const arm=robotArmTemplate(subject,keys,linked);if(arm)record.robotArm=arm;}
 if(typeof conveyorTemplate==='function'){const modules=conveyorTemplate(subject,keys,linked);if(modules.length)record.conveyors=modules;}
 return alignMechanismSnapshot(record)&&savedMechanismValid(record)?record:null;
}
function loadSavedMechanisms(){
 try{const data=JSON.parse(window.localStorage.getItem('qbits.mechanisms.v1')||'[]');if(Array.isArray(data))savedMechanisms.push(...data.slice(0,64).filter(savedMechanismValid).map(copySavedMechanism));}catch{}
}
function persistMechanisms(){
 try{window.localStorage.setItem('qbits.mechanisms.v1',JSON.stringify(savedMechanisms));return true;}catch{announce('Mecanismo guardado en esta sesión · expórtalo para conservarlo');return false;}
}
function saveMechanism(subject,name=null){
 if(mechanismGroups(subject).some(g=>g.parts.some(QBitsWorkshop.hasAdaptation))){announce('Retira las adaptaciones antes de guardar el montaje. La investigación permanece disponible.');return null;}

 if(savedMechanisms.length>=64){announce('Hay 64 mecanismos guardados. Exporta o elimina uno antes de añadir otro.');return null;}
 const record=mechanismSnapshot(subject,name);if(!record){announce('No se puede guardar: revisa el encaje de las puntas del rotor.');return null;}
 const component=new Set(mechanismGroups(subject));rememberSensorMachine(record.name,rotors.filter(r=>rotorGroups(r).every(g=>component.has(g))));
 savedMechanisms.push(record);const durable=persistMechanisms();updateAlphaPanel();announce(record.name+' guardado · '+mechanismPartCount(record)+' piezas'+(durable?'':' · solo en esta sesión'));return record;
}
function spawnSavedMechanism(record,point,rotation=Q()){
 automationIntervention();
 if(puzzleBlockedEdit('mechanism')||typeof mechanismsAvailable==='function'&&!mechanismsAvailable())return null;
 if(!savedMechanismValid(record)||!point||![point.x,point.y,point.z].every(Number.isFinite)){announce('El mecanismo guardado no es válido.');return null;}
 if(story.scene==='campaign'&&record.groups.some(group=>group.parts.some(part=>part.shape!=='coupler'))){announce('Los mecanismos con Q-bits o T-bits añadidos se crean solo en el banco de pruebas. En campaña, monta esas piezas con los recursos del nivel.');return null;}
 const count=mechanismPartCount(record);if(scenePartCount()+count>MAX_QUBITS){announce('Máximo de '+MAX_QUBITS+' piezas en la sala.');return null;}
 const origin=V(point.x,point.y+.003,point.z),data=mechanismRecordParts(record).map(parts=>parts.map(part=>({...part,p:add(origin,rotation.vmult(part.p)),q:rotation.mult(part.q)}))),ids=new Map(),made=[],joints=[];
 // Probe candidate space before allocating physics bodies, IDs or GPU state.
 // Placement is exact: failed validation never searches another location.
 for(const parts of data){const probe={body:{position:V(),quaternion:Q()},parts:parts.map(part=>({...part,offset:part.p}))};
  if(!validPose(probe,probe.body.position,probe.body.quaternion)){announce('No hay espacio libre para el mecanismo.');return null;}
 }
 try{
  for(const parts of data)for(const part of parts)ids.set(part.key,allocateUnitId());
  for(const [i,parts]of data.entries()){const created=parts.map((part,j)=>{const id=ids.get(part.key),config=record.groups[i].parts[j].gripper,mood=part.battery?{...newMood(id),energy:0,externalBattery:{version:1,ownerId:id,packId:ids.get(part.battery.pack),enabled:part.battery.enabled}}:config?{...newMood(id),gripper:{...config}}:null;return {id,shape:part.shape,weight:part.weight,p:part.p,q:part.q,mood:record.groups[i].parts[j].flight?{...(mood||newMood(id)),flight:QBitsPropellerPower.config(record.groups[i].parts[j].flight)}:mood};});made.push(makeGroup(created));}
  for(const joint of record.joints){const rotor=connectRotorTips(ids.get(joint.a),ids.get(joint.b),{...joint,...storedRotorDrive(joint),enabled:false});if(!rotor)throw new Error('Las puntas del mecanismo ya no encajan.');joints.push(rotor);}
  for(let i=0;i<joints.length;i++){const state=record.joints[i];configureRotor(joints[i],{...state,...storedRotorDrive(state),enabled:state.enabled&&!state.servo});}
  rememberSensorMachine(record.name,joints);
  for(const set of record.rotorSets||[])createRotorSet(set.name,set.joints.map(index=>joints[index]));
  if(record.robotArm&&typeof restoreRobotArmTemplate==='function')restoreRobotArmTemplate(record.robotArm,ids,joints);
  if(record.conveyors&&typeof restoreConveyorTemplate==='function'){const modules=restoreConveyorTemplate(record.conveyors,ids,joints);if(!Array.isArray(modules)||modules.length!==record.conveyors.length)throw new Error('La cinta no pudo recuperar sus rodillos.');}
  if(made.some(g=>!validPose(g,g.body.position,g.body.quaternion,made)))throw new Error('No hay espacio libre para la superficie del mecanismo.');
  clearRotorSelection();multiSelection=made;selected={g:made[0],part:made[0].parts[0]};announce(record.name+' creado · '+count+' piezas'+(made.some(g=>g.parts.some(isExternalBattery))?' · baterías vacías: apágalas y déjalas sobre el piso':''));return joints[0]||made[0];
 }catch(error){
  for(const rotor of joints)disconnectRotor(rotor);for(const g of made)removeGroup(g);if(typeof pruneConveyors==='function')pruneConveyors();pruneRobotArms();refreshRotors();announce(error.message||'No se pudo crear el mecanismo.');return null;
 }
}
function duplicateMechanism(subject){
 if(mechanismGroups(subject).some(g=>g.parts.some(QBitsWorkshop.hasAdaptation))){announce('Retira las adaptaciones antes de duplicar el mecanismo.');return null;}

 const record=mechanismSnapshot(subject);if(!record){announce('No se puede duplicar este mecanismo hasta ajustar sus puntas.');return null;}
 if(scenePartCount()+mechanismPartCount(record)>MAX_QUBITS){announce('No caben más copias: límite de '+MAX_QUBITS+' piezas.');return null;}
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
 if(!Array.isArray(input)||input.length>64||!input.every(savedMechanismValid))throw new Error('Archivo de mecanismos inválido');
 const normalized=input.map(copySavedMechanism);savedMechanisms.splice(0,savedMechanisms.length,...normalized);persistMechanisms();updateAlphaPanel();return normalized.length;
}

// The arm is a recipe made exclusively from the same cube and coupler profiles
// used by hand construction. A blueprint consumes those actual loose pieces.
let builtInArmRecipe=null;
function robotArmBlueprintTemplate(){
 if(builtInArmRecipe)return copySavedMechanism(builtInArmRecipe);
 const record={version:1,type:'rotor',name:'Brazo Q-bits',groups:Array.from({length:5},()=>({parts:[]})),joints:[]};let key=0;
 const part=(group,shape,center,axis=V(0,1,0))=>{const q=Q();if(shape==='coupler')q.setFromVectors(V(0,1,0),axis);q.normalize();const p=shape==='coupler'?add(center,mul(axis,CUBE_SIZE*5/56)):center;
  const item={key:key++,shape,weight:1,p:[p.x,p.y,p.z],q:[q.x,q.y,q.z,q.w]};record.groups[group].parts.push(item);return item;};
 const cube=(group,x,y,z)=>part(group,'cube',V(x*CUBE_SIZE,y*CUBE_SIZE,z*CUBE_SIZE));
 const coupling=(group,x,y,z,axis)=>part(group,'coupler',V(x*CUBE_SIZE,y*CUBE_SIZE,z*CUBE_SIZE),axis);
 const joint=(a,b)=>record.joints.push({a:a.key,b:b.key,rpm:12,direction:1,moving:'b',mount:'wheel',maxTorque:4,capacity:64,enabled:false});
 for(const x of [-1.5,-.5,.5,1.5])for(const z of [-1,0,1])cube(0,x,.5,z);
 const a0=coupling(0,.5,1.5,0,V(0,1,0)),b0=coupling(1,.5,3.5,0,V(0,-1,0));joint(a0,b0);
 const a1=coupling(1,1.5,3.5,0,V(0,0,1)),b1=coupling(2,1.5,3.5,2,V(0,0,-1));joint(a1,b1);
 cube(2,1.5,4.5,2);cube(2,1.5,5.5,2);
 const a2=coupling(2,1.5,6.5,2,V(0,0,1)),b2=coupling(3,1.5,6.5,4,V(0,0,-1));joint(a2,b2);
 cube(3,.5,6.5,4);cube(3,-.5,6.5,4);
 const a3=coupling(3,-1.5,6.5,4,V(0,0,1)),b3=coupling(4,-1.5,6.5,6,V(0,0,-1));joint(a3,b3);
 cube(4,-1.5,5.5,6);const grip=cube(4,-1.5,4.5,6);
 const turn=(indices,pivot,angle)=>{const rotation=Q();rotation.setFromAxisAngle(V(0,0,1),angle);for(const index of indices)for(const item of record.groups[index].parts){const q=Q();q.set(...item.q);const p=add(pivot,rotation.vmult(sub(V(...item.p),pivot))),next=rotation.mult(q);item.p=[p.x,p.y,p.z];item.q=[next.x,next.y,next.z,next.w];}};
 // Bend the shoulder and compensate at the wrist, leaving the grip face down
// one cube above the floor. This is an initial construction pose, not motion.
 turn([2,3,4],V(1.5*CUBE_SIZE,3.5*CUBE_SIZE,CUBE_SIZE),Math.PI/4);
 const wristQ=Q();wristQ.set(...a3.q);turn([4],couplerTip({p:V(...a3.p),q:wristQ}).point,-Math.PI/4);
 grip.gripper=copyGripperConfig();
 record.robotArm={version:1,base:0,gripper:grip.key,joints:[0,1,2,3],repeat:true};
 record.rotorSets=[{name:'Brazo Q-bits',joints:[0,1,2,3]}];
 const all=mechanismRecordParts(record).flat().flatMap(corners),low=V(Infinity,Infinity,Infinity),high=V(-Infinity,-Infinity,-Infinity);
 for(const p of all)for(const axis of ['x','y','z']){low[axis]=Math.min(low[axis],p[axis]);high[axis]=Math.max(high[axis],p[axis]);}
 const origin=V((low.x+high.x)/2,low.y,(low.z+high.z)/2);
 for(const group of record.groups)for(const item of group.parts)item.p=item.p.map((n,i)=>+(n-origin[['x','y','z'][i]]).toFixed(9));
 if(!savedMechanismValid(record))return null;
 builtInArmRecipe=copySavedMechanism(record);return copySavedMechanism(record);
}
// Conveyor recipes use only existing cubes and pointed couplers. One driven
// bearing per roller avoids a redundant closed constraint loop; the other pair
// is the matching passive support. The underframe clears the rotating corners.
function conveyorBlueprintTemplate(kind='straight',supports=false){
 if(!['straight','left','right'].includes(kind))return null;
 const C=CUBE_SIZE,corner=kind!=='straight',record={version:1,type:'rotor',name:'Cinta Q-bits · '+(corner?(kind==='left'?'esquina izquierda':'esquina derecha'):'recta'),groups:Array.from({length:4},()=>({parts:[]})),joints:[]};let key=0;const legKeys=new Set();
 const part=(group,shape,x,y,z,axis=V(0,1,0))=>{const q=Q();if(shape==='coupler')q.setFromVectors(V(0,1,0),axis);q.normalize();const p=add(V(x*C,y*C,z*C),shape==='coupler'?mul(axis,C*5/56):V());const item={key:key++,shape,weight:1,p:[p.x,p.y,p.z],q:[q.x,q.y,q.z,q.w]};record.groups[group].parts.push(item);return item;};
 const cube=(group,x,y,z)=>part(group,'cube',x,y,z),couple=(group,x,y,z,axis)=>part(group,'coupler',x,y,z,axis);
 const base=cube(0,-1,1.5,-3),fixed=new Map(),occupied=new Set(['-1,-3']);
 const rail=(x,z,axis)=>{const k=x+','+z;if(occupied.has(k))return;occupied.add(k);const p=axis?couple(0,x,1.5,z,axis):cube(0,x,1.5,z);if(axis)fixed.set(k,p);};
 if(!corner){
  for(const z of [-3,3])for(let x=-2;x<=3;x++)rail(x,z,[-2,0,2].includes(x)?V(0,0,z<0?1:-1):null);
 }else{
  for(let x=-2;x<=5;x++)rail(x,-3,[-2,0].includes(x)?V(0,0,1):null);
  for(let z=-2;z<=6;z++)rail(5,z,z===5?V(-1,0,0):null);
  for(let x=-2;x<=0;x++)rail(x,3,[-2,0].includes(x)?V(0,0,-1):null);
  for(let z=4;z<=6;z++)rail(-1,z,z===5?V(1,0,0):null);
 }
 const bridgeX=corner?-2:0;
 for(let z=-3;z<=3;z++)cube(0,bridgeX,-.5,z);
 for(const z of [-3,3]){cube(0,bridgeX,.5,z);if(supports)for(const y of [-1.5,-2.5])legKeys.add(cube(0,bridgeX,y,z).key);}
 const rollers=corner?[{x:-2,z:0,axis:V(0,0,1),fixed:'-2,-3',drive:1},{x:0,z:0,axis:V(0,0,1),fixed:'0,-3',drive:1},{x:2,z:5,axis:V(1,0,0),fixed:'-1,5',drive:-1}]:[-2,0,2].map(x=>({x,z:0,axis:V(0,0,1),fixed:x+',-3',drive:1}));
 for(const [i,roller]of rollers.entries()){
  const {x,z,axis}=roller,a=fixed.get(roller.fixed),b=couple(i+1,x-axis.x,1.5,z-axis.z,mul(axis,-1));
  cube(i+1,x,1.5,z);couple(i+1,x+axis.x,1.5,z+axis.z,axis);
  const phase=Q();phase.setFromAxisAngle(axis,i*Math.PI/4);const pivot=V(x*C,1.5*C,z*C);
  for(const item of record.groups[i+1].parts){const q=Q();q.set(...item.q);const p=add(pivot,phase.vmult(sub(V(...item.p),pivot))),next=phase.mult(q);item.p=[p.x,p.y,p.z];item.q=[next.x,next.y,next.z,next.w];}
  record.joints.push({a:a.key,b:b.key,rpm:30,direction:roller.drive,moving:'b',mount:'wheel',maxTorque:1,capacity:128,enabled:false});
 }
 const points=corner?[[-2.5,1.5,0],[2,1.5,0],[2,1.5,6.5]]:[[-2.5,1.5,0],[3.5,1.5,0]],relative=p=>p.map((n,i)=>+(n*C-base.p[i]).toFixed(9));
 const ports={entry:{p:relative(points[0]),direction:[1,0,0]},exit:{p:relative(points[points.length-1]),direction:corner?[0,0,1]:[1,0,0]}};
 const drives=rollers.map(r=>r.drive);
 if(kind==='left'){
  for(const group of record.groups)for(const item of group.parts){item.p[2]*=-1;item.q[0]*=-1;item.q[1]*=-1;}
  for(const port of Object.values(ports)){port.p[2]*=-1;port.direction[2]*=-1;}
  for(const joint of record.joints)joint.direction*=-1;for(let i=0;i<drives.length;i++)drives[i]*=-1;
 }
 record.conveyors=[{version:1,base:base.key,joints:[0,1,2],kind,direction:1,capacity:8,ports,drives,moduleParts:record.groups.flatMap(g=>g.parts).map(p=>p.key),required:record.groups.flatMap(g=>g.parts).filter(p=>!legKeys.has(p.key)).map(p=>p.key)}];
 record.rotorSets=[{name:'Cinta Q-bits',joints:[0,1,2]}];
 const origin=V((corner?1.5:.5)*C,(supports?-3:-1)*C,(corner?(kind==='left'?-1.5:1.5):0)*C);
 for(const group of record.groups)for(const item of group.parts)item.p=item.p.map((n,i)=>+(n-origin[['x','y','z'][i]]).toFixed(9));
 return savedMechanismValid(record)?record:null;
}
function mechanismBlueprintShape(record){return {name:record.name,geometryVersion:4,mechanism:copySavedMechanism(record),parts:record.groups.flatMap((g,group)=>g.parts.map(part=>({...part,group}))) };}
function blueprintMaterials(shape){
 const counts=new Map();for(const part of shape.parts)counts.set(normalizeUnitShape(part.shape),(counts.get(normalizeUnitShape(part.shape))||0)+1);
 const names={cube:'cubos',coupler:'enganches',pyramid:'T-bits de base cuadrada',tetra:'T-bits triangulares'};
 return [...counts].map(([kind,n])=>n+' '+names[kind]).join(' + ');
}
function placeMechanismBlueprint(record,p){
 if(!mechanismsAvailable()||!savedMechanismValid(record)){announce('Este blueprint de mecanismo no está disponible.');return null;}
 return placeBlueprint(mechanismBlueprintShape(record),p);
}
function completeMechanismBlueprint(bp,targets){
 const record=bp.shape.mechanism,byKey=new Map(),ids=new Map();
 if(!savedMechanismValid(record)||bp.slots.length!==targets.length)return false;
 for(const slot of bp.slots){const target=targets[slot.index],part=worldParts(slot.g)[0];if(!part||part.shape!==target.shape)return false;byKey.set(target.key,part);ids.set(target.key,part.id);}
 const rigid=record.groups.map(group=>group.parts.map(part=>byKey.get(part.key)));
 if(rigid.some(parts=>parts.some(p=>!p)||!assemblyValid(parts)))return false;
 for(const joint of record.joints){const a=rotorEndpoint(byKey.get(joint.a),joint.servo,'a'),b=rotorEndpoint(byKey.get(joint.b),joint.servo,'b');if(a.point.distanceTo(b.point)>.002||a.axis.dot(b.axis)>-.995)return false;}
 // Revalidate all solids before changing ownership: corrupt/incomplete plans
// release their materials instead of creating a partial functioning machine.
 const flat=rigid.flat();for(let i=0;i<flat.length;i++)for(let j=i+1;j<flat.length;j++)if(obbOverlap(flat[i],flat[j],.000001))return false;
 const originals=flat.map(p=>({...p,p:p.p.clone(),q:p.q.clone(),mood:copyMood(p.mood)})),made=[],joints=[];
 for(const slot of bp.slots){slot.g.blueprintJob=null;removeGroup(slot.g);}
 try{
  for(let i=0;i<rigid.length;i++){
   for(let j=0;j<rigid[i].length;j++){const p=rigid[i][j],recipe=record.groups[i].parts[j],storedJ=p.mood.energy*gameBatteryCapacity(p);
    if(recipe.battery){p.mood.externalBattery={version:1,ownerId:p.id,packId:ids.get(recipe.battery.pack),enabled:false};p.mood.energy=storedJ/(60*batterySceneScale());}
    if(recipe.gripper)p.mood.gripper={...recipe.gripper};if(recipe.flight)p.mood.flight=QBitsPropellerPower.config(recipe.flight);
   }
   made.push(makeGroup(rigid[i],bp.q));
  }
  for(const joint of record.joints){const rotor=connectRotorTips(ids.get(joint.a),ids.get(joint.b),{...joint,...storedRotorDrive(joint),enabled:false});if(!rotor)throw new Error('Las puntas ya no coinciden');joints.push(rotor);}
  rememberSensorMachine(record.name,joints);
  for(const set of record.rotorSets||[])createRotorSet(set.name,set.joints.map(i=>joints[i]));
  if(record.robotArm&&typeof restoreRobotArmTemplate==='function')restoreRobotArmTemplate(record.robotArm,ids,joints);
  if(record.conveyors&&typeof restoreConveyorTemplate==='function'){const modules=restoreConveyorTemplate(record.conveyors,ids,joints);if(!Array.isArray(modules)||modules.length!==record.conveyors.length)throw new Error('La cinta no pudo recuperar sus rodillos.');}
  if(record.conveyors?.length&&typeof joinCompletedConveyorBlueprint==='function')joinCompletedConveyorBlueprint(bp,made);
  clearRotorSelection();multiSelection=made;selected={g:made[0],part:made[0].parts[0]};blueprints.splice(blueprints.indexOf(bp),1);
  announce(record.name+' construido · '+flat.length+' piezas · '+(record.conveyors?.length?'detenido; acopla una batería y activa la cinta.':propellerModules(made).length?'detenido; conecta y enciende una batería, luego abre Vuelo.':'detenido; configura el agarre y acopla tu batería.'));if(flat.length>1)emitJoinSound(bp.p);return true;
 }catch{
  for(const rotor of joints)disconnectRotor(rotor);for(const g of made)removeGroup(g);if(typeof pruneConveyors==='function')pruneConveyors();
  for(const p of originals)makeGroup([p]);blueprints.splice(blueprints.indexOf(bp),1);announce('Montaje interrumpido. Se conservaron todas las piezas.');return true;
 }
}

function savedShapeValid(shape){return shape&&typeof shape.name==='string'&&shape.name.length<=40&&Array.isArray(shape.parts)&&shape.parts.length>0&&shape.parts.length<=MAX_QUBITS&&shape.parts.every(p=>(p.shape===undefined||['cube','tetra','pyramid','coupler'].includes(p.shape))&&Array.isArray(p.p)&&p.p.length===3&&p.p.every(Number.isFinite)&&p.p.every(n=>Math.abs(n)<6)&&Array.isArray(p.q)&&p.q.length===4&&p.q.every(Number.isFinite)&&Math.abs(Math.hypot(...p.q)-1)<.01);}
function loadSavedShapes(){try{const list=JSON.parse(readQbitsStorage('qbits.shapes.v1')||'[]');if(Array.isArray(list))savedShapes.push(...list.filter(savedShapeValid).slice(0,64));}catch{} }
function persistShapes(){try{window.localStorage.setItem('qbits.shapes.v1',JSON.stringify(savedShapes));return true;}catch{announce('Forma guardada en esta sesión · Exportar formas permite conservar una copia.');return false;}}
function saveShape(g){
 if(g?.parts.some(p=>p.mood?.externalBattery||p.mood?.gripper)||g&&propellerLayout(g).length)return saveMechanism(g);
 if(g&&typeof rotorForGroup==='function'&&rotorForGroup(g))return saveMechanism(g);
 if(!g||!groups.includes(g))return;if(savedShapes.length>=64){announce('Hay 64 formas guardadas. Exporta o elimina una antes de añadir otra.');return;}
 if(!assemblyValid(poses(g))){announce('Esta forma tiene caras incompatibles. Desármala y vuelve a encajar las piezas.');return;}
 const bb=bounds(g,V(),Q()),origin=V(bb.center.x,bb.min.y,bb.center.z),shape={name:'Forma '+(savedShapes.length+1),geometryVersion:3,parts:poses(g,V(),Q()).map(o=>({shape:normalizeUnitShape(o.part.shape),p:[o.p.x-origin.x,o.p.y-origin.y,o.p.z-origin.z].map(n=>+n.toFixed(5)),q:[o.q.x,o.q.y,o.q.z,o.q.w].map(n=>+n.toFixed(7))}))};
 savedShapes.push(shape);const durable=persistShapes();updateAlphaPanel();announce(shape.name+' guardada · '+shape.parts.length+' unidades'+(durable?'':' · solo en esta sesión; exporta una copia'));
}
function blueprintTargets(bp){
 const stamp=[bp.p.x,bp.p.y,bp.p.z,bp.q.x,bp.q.y,bp.q.z,bp.q.w].join(',');if(bp.targetCache?.shape===bp.shape&&bp.targetCache.stamp===stamp)return bp.targetCache.targets;
 const targets=bp.shape.parts.map(part=>{const q=Q();q.set(...part.q);return {key:part.key,group:part.group,shape:normalizeUnitShape(part.shape),p:add(bp.p,bp.q.vmult(V(...part.p))),q:bp.q.mult(q)};}).sort((a,b)=>a.p.y-b.p.y||a.p.x-b.p.x||a.p.z-b.p.z);
 bp.targetCache={shape:bp.shape,stamp,targets};return targets;
}
function blueprintBox(bp){const targets=blueprintTargets(bp);if(bp.boxCache?.targets===targets)return bp.boxCache.box;const pts=targets.flatMap(corners),min=V(Infinity,Infinity,Infinity),max=V(-Infinity,-Infinity,-Infinity);for(const p of pts)for(const k of ['x','y','z']){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}const box={...alphaBox(mul(add(min,max),.5),mul(sub(max,min),.5)),size:sub(max,min)};bp.boxCache={targets,box};return box;}
function blueprintSiteClear(box){
 return !(box.min.y<-.001||box.max.y>ROOM_HEIGHT||Math.max(Math.abs(box.min.x),Math.abs(box.max.x),Math.abs(box.min.z),Math.abs(box.max.z))>13.85||cargos.some(c=>obbOverlap(box,cargoPose(c)))||puzzleObstacleBounds().some(w=>obbOverlap(box,{p:w.p,q:w.q||Q(),half:w.half}))||alphaObstacles().some(w=>obbOverlap(box,w))||blueprints.some(other=>obbOverlap(box,blueprintBox(other))));
}
function placeBlueprint(shape,p,placement={}){
 if(shape?.mechanism?.conveyors&&story.scene!=='lab'){announce('Las cintas modulares se construyen en el banco de pruebas.');return null;}
 automationIntervention();
 if((shape?.mechanism?!savedMechanismValid(shape.mechanism)||!mechanismsAvailable():!savedShapeValid(shape))||!p||![p.x,p.z].every(Number.isFinite)||blueprints.length>=12){announce('No se puede colocar otro blueprint aquí.');return null;}
 if(shape.mechanism)shape=mechanismBlueprintShape(shape.mechanism);
 const elevation=placement.height??0,turns=placement.quarterTurns??0;if(!Number.isFinite(elevation)||elevation<0||elevation>ROOM_HEIGHT||!Number.isInteger(turns)||turns<0||turns>3)return null;
 const angle=placement.angle??turns*Math.PI/2;if(!Number.isFinite(angle))return null;
 const rotation=Q();rotation.setFromAxisAngle(V(0,1,0),angle);
 const bp={shape:JSON.parse(JSON.stringify(shape)),p:V(p.x,elevation+.002,p.z),q:rotation,slots:[],active:false,nextScan:0,status:'Esperando unidades'};const box=blueprintBox(bp);
 if(!shape.mechanism&&!assemblyValid(blueprintTargets(bp))){announce('La forma guardada tiene caras incompatibles con las medidas actuales. Se conserva para exportarla; vuelve a armarla.');return null;}
 if(!blueprintSiteClear(box)){announce('La forma necesita más espacio libre.');return null;}
 bp.id=++alphaSerial;blueprints.push(bp);announce(shape.name+' · '+blueprintMaterials(shape)+' · acerca piezas sueltas y usa clic derecho → Integrar');return bp;
}
function nearBlueprint(bp){const used=new Set(bp.slots.map(s=>s.index)),needed=new Set(blueprintTargets(bp).filter((_,i)=>!used.has(i)).map(t=>t.shape));return groups.filter(g=>g.parts.length===1&&!g.parts[0].mood?.externalBattery&&!g.parts[0].mood?.gripper&&(!bp.shape.mechanism||!QBitsWorkshop.hasAdaptation(g.parts[0]))&&!(typeof rotorForGroup==='function'&&rotorForGroup(g))&&needed.has(normalizeUnitShape(g.parts[0].shape))&&!g.route&&!g.pendingMoodOrder&&!g.haulJob&&!g.blueprintJob&&!g.cooler&&!(held?.items||[]).some(i=>i.g===g)&&groupWilling(g)&&bounds(g).min.y<.03&&Math.hypot(g.body.position.x-bp.p.x,g.body.position.z-bp.p.z)<=alphaSettings.blueprintRange).sort((a,b)=>a.body.position.distanceTo(bp.p)-b.body.position.distanceTo(bp.p));}
function activateBlueprint(bp){bp.active=true;bp.nextScan=0;const used=new Set(bp.slots.map(s=>s.index)),available=nearBlueprint(bp).map(g=>normalizeUnitShape(g.parts[0].shape)),missing=[];for(const [i,target] of blueprintTargets(bp).entries()){if(used.has(i))continue;const j=available.indexOf(target.shape);if(j<0)missing.push(target);else available.splice(j,1);}announce(missing.length?'Faltan '+blueprintMaterials({parts:missing})+' en el radio de '+alphaSettings.blueprintRange+' m. Acerca piezas sueltas.':'Integrando unidades cercanas · '+blueprintMaterials(bp.shape));}
function releaseBlueprintSlot(s){const g=s.g;if(!groups.includes(g))return;stopRoute(g);g.blueprintJob=null;g.body.type=CANNON.Body.DYNAMIC;g.body.collisionResponse=true;g.body.updateMassProperties();g.body.velocity.set(0,0,0);g.body.angularVelocity.set(0,0,0);g.body.wakeUp();}
function cancelBlueprint(bp){for(const s of bp.slots)releaseBlueprintSlot(s);blueprints.splice(blueprints.indexOf(bp),1);}
function updateBlueprints(dt){
 for(const bp of [...blueprints]){
  bp.slots=bp.slots.filter(s=>groups.includes(s.g)&&s.g.blueprintJob===s);if(!bp.active)continue;const targets=blueprintTargets(bp),box=blueprintBox(bp);
  if(bp.slots.length<targets.length&&simTime>=bp.nextScan&&(!bp.shape.mechanism||bp.slots.every(s=>s.state==='placed'))){bp.nextScan=simTime+.25;const used=new Set(bp.slots.map(s=>s.index)),next=targets.findIndex((_,i)=>!used.has(i)),g=nearBlueprint(bp).find(g=>!bp.shape.mechanism||normalizeUnitShape(g.parts[0].shape)===targets[next]?.shape);
   if(g){const index=targets.findIndex((target,i)=>!used.has(i)&&target.shape===normalizeUnitShape(g.parts[0].shape)),angle=index*2.399,radius=Math.max(box.size.x,box.size.z)/2+.25+Math.floor(index/10)*.15,stage=bp.shape.mechanism?V(g.body.position.x,0,g.body.position.z):V(bp.p.x+Math.cos(angle)*radius,0,bp.p.z+Math.sin(angle)*radius);
    // A mechanism consumes supplied loose pieces one at a time. Lift directly
// from their resting location: twenty simultaneous walking routes used to jam
// each other before even reaching the assembly lane.
    if(index>=0&&(bp.shape.mechanism||startRoute(g,stage,true))){const pose=targets[index],q=pose.q.mult(g.parts[0].q.inverse()),target={shape:pose.shape,p:sub(pose.p,q.vmult(g.parts[0].offset)),q},slot={g,bp,index,target,stage,state:'walking',t:0};g.blueprintJob=slot;bp.slots.push(slot);}
   }
  }
  let assembling=bp.slots.some(s=>s.state==='assembly');
  for(const slot of bp.slots){const g=slot.g,b=g.body;
   if(slot.state==='walking'&&!g.route&&!g.pendingMoodOrder&&groupWilling(g)&&Math.hypot(b.position.x-slot.stage.x,b.position.z-slot.stage.z)<.10&&!assembling&&targets.slice(0,slot.index).every((_,i)=>bp.slots.some(s=>s.index===i&&s.state==='placed'))){
    slot.state='assembly';slot.fromP=b.position.clone();slot.fromQ=b.quaternion.clone();slot.height=box.max.y+.16;slot.legs=[V(b.position.x,slot.height,b.position.z),V(slot.target.p.x,slot.height,slot.target.p.z),slot.target.p.clone()];slot.leg=0;slot.legStart=b.position.clone();slot.t=0;b.type=CANNON.Body.KINEMATIC;b.velocity.set(0,0,0);b.angularVelocity.set(0,0,0);b.updateMassProperties();assembling=true;
   }
   if(slot.state==='assembly'){
    const to=slot.legs[slot.leg],duration=Math.max(.3,slot.legStart.distanceTo(to)/(bp.shape.mechanism ? .7 : .35)),next=Math.min(1,slot.t+dt/duration),smooth=next*next*(3-2*next),pos=V();slot.legStart.lerp(to,smooth,pos);const q=slot.leg===0?slot.fromQ:slot.leg===1?slerp(slot.fromQ,slot.target.q,smooth):slot.target.q;
    if(!validPose(g,pos,q)){bp.status='Paso de montaje bloqueado';g.speechBuildBlocked=true;continue;}g.speechBuildBlocked=false;slot.t=next;b.position.copy(pos);b.quaternion.copy(q);b.aabbNeedsUpdate=true;
    if(next>=1){slot.leg++;slot.t=0;slot.legStart=b.position.clone();if(slot.leg===3){slot.state='placed';b.position.copy(slot.target.p);b.quaternion.copy(slot.target.q);}}
   }
  }
  const done=bp.slots.filter(s=>s.state==='placed').length;bp.status=(bp.slots.some(s=>s.g.speechBuildBlocked)?'Paso de montaje bloqueado · libera espacio · ':'')+done+' / '+targets.length+' integrados · radio '+alphaSettings.blueprintRange+' m';
  if(done===targets.length){
   if(bp.shape.mechanism){if(!completeMechanismBlueprint(bp,targets)){cancelBlueprint(bp);announce('Montaje cancelado: revisa las piezas. Se conservaron separadas.');}continue;}
   const parts=bp.slots.flatMap(s=>worldParts(s.g));
   if(!assemblyValid(parts)){cancelBlueprint(bp);announce('Montaje cancelado: las caras ya no coinciden. Las piezas se mantienen separadas.');continue;}
   for(const s of bp.slots){s.g.blueprintJob=null;removeGroup(s.g);}const g=makeGroup(parts,bp.q);blueprints.splice(blueprints.indexOf(bp),1);selected={g,part:g.parts[0]};multiSelection=[g];queueSpeech(g,'happy',{kind:'built'});announce(bp.shape.name+' construida · '+parts.length+' unidades');if(parts.length>1)emitJoinSound(g.body.position);}
 }
}
function alphaSceneSnapshot(){return {coolers:coolers.map(c=>({p:[c.p.x,c.p.z],capacity:c.capacity,enabled:c.enabled})),blueprints:blueprints.map(b=>({shape:b.shape,p:[b.p.x,b.p.z],height:Math.max(0,b.p.y-.002),angle:2*Math.atan2(b.q.y,b.q.w),quarterTurns:((Math.round(2*Math.atan2(b.q.y,b.q.w)/(Math.PI/2))%4)+4)%4,...(b.conveyorLink?{conveyorLink:b.conveyorLink}:{})}))};}
function clearAlphaScene(){for(const b of [...blueprints])cancelBlueprint(b);for(const c of [...coolers])removeCooler(c);for(const b of buttonBodies)world.removeBody(b);buttonBodies.length=0;document.querySelector('#completion-panel').hidden=true;}
function restoreAlphaScene(data){if(!data)return;for(const d of data.coolers||[]){const c=createCooler(V(d.p[0],0,d.p[1]));if(c){c.capacity=d.capacity;c.enabled=d.enabled;}}for(const d of data.blueprints||[]){const bp=placeBlueprint(d.shape,V(d.p[0],0,d.p[1]),{height:d.height??0,angle:d.angle,quarterTurns:d.quarterTurns??0});if(bp&&Number.isSafeInteger(d.conveyorLink))bp.conveyorLink=d.conveyorLink;}}
function showSavedShapes(point,category=null){
 if(!category){openCommandMenu(point,'Formas guardadas',[
  {label:'Formas · '+savedShapes.length,run:()=>showSavedShapes(point,'shapes')},
  {label:'Mecanismos · '+savedMechanisms.length+' guardados + planos iniciales',run:()=>showSavedShapes(point,'mechanisms')},
  {label:'Cerrar',run:()=>captureMouse()}
 ]);return;}
 const mechanisms=category==='mechanisms',records=mechanisms?[...builtInMechanismRecipes(),...savedMechanisms]:savedShapes;
 openCommandMenu(point,mechanisms?'Mecanismos':'Formas',records.map(record=>({label:record.name+' · '+(mechanisms?mechanismPartCount(record):record.parts.length)+' piezas',run:()=>{beginBlueprintPlacement(mechanisms?mechanismBlueprintShape(record):record);}})).concat(!records.length?[{label:'Guarda una estructura para verla aquí',disabled:true,run:()=>{}}]:[],[{label:'← Categorías',run:()=>showSavedShapes(point)},{label:'Cerrar',run:()=>captureMouse()}]));
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
function openAlphaPanel(hit=null){pause();showTablet();if(hit)selected=hit;updatePanel();switchPanelTab('alpha');updateAlphaPanel();}
function renameQubit(){if(!selected||!groups.includes(selected.g))return;const input=document.querySelector('#qubit-name'),name=String(input.value||'').replace(/[\u0000-\u001f]/g,'').trim().slice(0,24);selected.part.mood.name=name||unitLabel(selected.part)+' '+selected.part.id;input.value=selected.part.mood.name;announce('Nombre guardado');}
function updateAlphaPanel(){
 document.querySelector('#qubit-name').value=selected?.part.mood.name||'';document.querySelector('#qubit-name').disabled=!selected;
 document.querySelector('#rename-qubit').disabled=!selected;document.querySelector('#save-shape').disabled=!selected;
 for(const key of ['maxRest','coolSeconds','capacity','blueprintRange','exitEnergy','glow']){document.querySelector('#alpha-'+key).value=alphaSettings[key];document.querySelector('#alpha-'+key+'Value').textContent=key==='exitEnergy'?Math.round(alphaSettings[key]*100)+' %':alphaSettings[key]+({maxRest:' s',coolSeconds:' s',capacity:' u',blueprintRange:' m',glow:''}[key]||'');}
 document.querySelector('#alpha-coolingOn').checked=alphaSettings.coolingOn;document.querySelector('#alpha-allowPuzzleSpawn').checked=alphaSettings.allowPuzzleSpawn;
 const list=document.querySelector('#saved-shape-list');list.replaceChildren();for(const shape of savedShapes){const row=document.createElement('div'),button=document.createElement('button');button.type='button';button.textContent=shape.name+' · '+shape.parts.length+' u';button.addEventListener('click',()=>{beginBlueprintPlacement(shape);});row.appendChild(button);
  const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Borrar '+shape.name);remove.addEventListener('click',()=>{savedShapes.splice(savedShapes.indexOf(shape),1);persistShapes();updateAlphaPanel();});row.appendChild(remove);list.appendChild(row);}
 const mechanisms=document.querySelector('#saved-library-mechanisms');if(mechanisms){mechanisms.replaceChildren();const builtin=builtInMechanismRecipes();
  for(const mechanism of [...builtin,...savedMechanisms]){const row=document.createElement('div'),button=document.createElement('button');button.type='button';button.textContent=mechanism.name+' · '+mechanismPartCount(mechanism)+' piezas'+(builtin.includes(mechanism)?' · plano inicial':'');button.disabled=!mechanismsAvailable();button.addEventListener('click',()=>{beginBlueprintPlacement(mechanismBlueprintShape(mechanism));});row.appendChild(button);
   if(!builtin.includes(mechanism)){const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Borrar '+mechanism.name);remove.addEventListener('click',()=>{savedMechanisms.splice(savedMechanisms.indexOf(mechanism),1);persistMechanisms();updateAlphaPanel();});row.appendChild(remove);}mechanisms.appendChild(row);
  }
 }
}
function exportShapes(){const blob=new Blob([JSON.stringify({version:1,shapes:savedShapes},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Q-bits_formas.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function importShapesData(data){const input=data?.version===1?data.shapes:null;if(!Array.isArray(input)||input.length>64||!input.every(savedShapeValid))throw new Error('Archivo de formas inválido');savedShapes.splice(0,savedShapes.length,...input.map(s=>JSON.parse(JSON.stringify(s))));persistShapes();updateAlphaPanel();return input.length;}
function showPuzzleComplete(){
 pause();panel.hidden=true;document.querySelector('#completion-panel').hidden=false;document.querySelector('#completion-detail').textContent='Tres materiales entregados · '+puzzle.earned+' nuevos Q-bits. La última recompensa te espera al volver a la sala.';
}
function updateAlphaHUD(){
 const machineGroups=new Set(),arms=robotArms.filter(a=>rotorPart(a.baseId)),belts=conveyors.filter(c=>rotorPart(c.baseId));
 for(const machine of arms)for(const rotor of robotArmRotors(machine))for(const g of rotorGroups(rotor))if(g)machineGroups.add(g);
 for(const machine of belts)for(const rotor of conveyorRotors(machine))for(const g of rotorGroups(rotor))if(g)machineGroups.add(g);
 let qCount=0,tCount=0,mCount=0,rCount=0,materialCount=0;for(const g of groups)for(const part of g.parts){if(machineGroups.has(g)){materialCount++;continue;}if(part.mood.production){rCount++;continue;}if(unitShape(part)==='coupler')mCount++;else if(isTBit(part))tCount++;else qCount++;}
 const census=document.querySelector('#alpha-census-text');census.textContent='× '+qCount+' Q'+(tCount?' · '+tCount+' T':'')+(mCount?' · '+mCount+' M':'')+(arms.length?' · '+arms.length+' brazos':'')+(belts.length?' · '+belts.length+' cintas':'')+(rCount?' · '+rCount+' bloques de materia':'');if(pendingDisassemblyCount())census.textContent+=' · '+pendingDisassemblyCount()+' en desarme';census.title=materialCount+' piezas integradas en mecanismos; se conservan al desarmarlos y dentro del límite de la sala.';
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
function drawAsset(mesh,p,q,size,color,kind=5){const radius=geometryRadii.get(mesh.buffer);if(radius!==undefined&&!renderSphereVisible(p,radius*Math.max(Math.abs(size.x),Math.abs(size.y),Math.abs(size.z))))return;bindGeometry(mesh.buffer);gl.uniform1f(uniforms.uKind,kind);setPose(p,q,size);tint(...color);submitDraw(gl.TRIANGLES,0,mesh.count);}
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
  bindGeometry(cubeGeometry);gl.uniform1f(uniforms.uKind,8);setPose(center,q,V(.025*visuals.pathWidth,.001,length));tint(...color,.22*alphaSettings.glow);submitDraw(gl.TRIANGLES,0,36);drawBox(add(center,V(0,.001,0)),q,V(.0015*visuals.pathWidth,.001,length),[...color,.8]);
 }gl.depthMask(true);gl.disable(gl.BLEND);
}
function drawAlpha(){
 for(const c of coolers){drawAsset(coolerBodyMesh,c.p,Q(),V(1,1,1),[.93,.94,.94,1]);drawAsset(coolerTrayMesh,c.p,Q(),V(1,1,1),[.24,.27,.28,1]);drawAsset(coolerBaseMesh,c.p,Q(),V(1,1,1),[.23,.25,.26,1]);drawAsset(coolerRimMesh,c.p,Q(),V(1,1,1),[.35,.38,.39,1]);drawAsset(coolerAccentMesh,c.p,Q(),V(1,1,1),c.enabled&&alphaSettings.coolingOn?[.53,.75,.79,1]:[.4,.43,.44,1]);}
 gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
 for(const bp of blueprints){const occupied=new Set(bp.slots.filter(s=>s.state==='placed').map(s=>s.index));const targets=blueprintTargets(bp);for(let i=0;i<targets.length;i++){if(occupied.has(i))continue;const t=targets[i];if(isTBit(t)){drawUnitMesh(t,[.27,.67,.73,.07],4);drawUnitOutline(t,.4,true);}else{drawBox(t.p,t.q,V(.088,.088,.088),[.27,.67,.73,.07]);drawOutline(t.p,t.q,V(.09,.09,.09),.4,true);}}drawConveyorBlueprintArrows(bp,targets);const bb=blueprintBox(bp);drawRing(V(bp.p.x,.007,bp.p.z),Math.max(.1,Math.min(.65,Math.max(bb.size.x,bb.size.z)/2+.08)),.35);}
 for(const c of coolers)if(c.enabled&&alphaSettings.coolingOn){bindGeometry(cubeGeometry);gl.uniform1f(uniforms.uKind,7);setPose(add(c.p,V(0,.002,0)),Q(),V(1.15,.001,1.15));tint(.2,.63,.73,.13*alphaSettings.glow);submitDraw(gl.TRIANGLES,0,36);}
 gl.depthMask(true);gl.disable(gl.BLEND);
}
function updateAccentLights(){const lights=[];if(puzzle.active)for(const p of puzzle.portals)lights.push({p:V(p.x,.8,p.z+.25),c:p.rgb.map(v=>v*p.frame*p.energy)});for(const c of coolers)if(c.enabled&&alphaSettings.coolingOn)lights.push({p:add(c.p,V(0,.3,0)),c:[.2,.65,.8]});lights.sort((a,b)=>a.p.distanceTo(V(...camera))-b.p.distanceTo(V(...camera)));const pos=[],colors=[];for(let i=0;i<4;i++){pos.push(...(lights[i]?[lights[i].p.x,lights[i].p.y,lights[i].p.z]:[0,-100,0]));colors.push(...(lights[i]?.c||[0,0,0]));}gl.uniform3fv(uniforms['uLightPos[0]'],pos);gl.uniform3fv(uniforms['uLightColor[0]'],colors);gl.uniform1f(uniforms.uGlow,alphaSettings.glow);}
loadSavedShapes();loadSavedMechanisms();
document.querySelector('#rename-qubit').addEventListener('click',renameQubit);
document.querySelector('#save-shape').addEventListener('click',()=>saveShape(selected?.g));
document.querySelector('#place-cooler').addEventListener('click',()=>{const p=floorAim()||V(position[0]-Math.sin(yaw)*1.3,0,position[2]-Math.cos(yaw)*1.3);createCooler(p);});
document.querySelector('#export-shapes').addEventListener('click',exportShapes);
document.querySelector('#import-shapes').addEventListener('change',async e=>{try{const file=e.target.files?.[0];if(!file)return;if(file.size>1000000)throw new Error('Archivo demasiado grande');const count=importShapesData(JSON.parse(await file.text()));announce(count+' formas importadas');}catch(error){announce('No se pudo importar: '+error.message);}e.target.value='';});
for(const key of ['maxRest','coolSeconds','capacity','blueprintRange','exitEnergy','glow'])document.querySelector('#alpha-'+key).addEventListener('input',e=>{if(certifiedAutomation()){updateAlphaPanel();return;}const n=Number(e.target.value),ranges={maxRest:[15,180],coolSeconds:[5,60],capacity:[1,MAX_QUBITS],blueprintRange:[.5,3],exitEnergy:[.25,.75],glow:[0,1]};if(Number.isFinite(n))alphaSettings[key]=clamp(n,...ranges[key]);updateAlphaPanel();});
for(const key of ['coolingOn','allowPuzzleSpawn'])document.querySelector('#alpha-'+key).addEventListener('change',e=>{if(certifiedAutomation()){updateAlphaPanel();return;}alphaSettings[key]=!!e.target.checked;updatePuzzlePanel();updateAlphaPanel();});
document.querySelector('#completion-continue').addEventListener('click',()=>{document.querySelector('#completion-panel').hidden=true;captureMouse();});
document.querySelector('#completion-restart').addEventListener('click',()=>{document.querySelector('#completion-panel').hidden=true;startPuzzle();captureMouse();});
document.querySelector('#completion-lab').addEventListener('click',()=>{document.querySelector('#completion-panel').hidden=true;leavePuzzle();showTablet();switchPanelTab('puzzle');});

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
 const s=speechRepresentative(g,options.part);if(!s||isExternalBattery(s.part)||!speechScreen(s))return false;
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
function gameMode(mode){if(mode!=='playing'){window.QBitsGuideAudio?.setPaused(true);window.QBitsFootsteps?.setPaused(true);window.QBitsJoinAudio?.setPaused(true);}if(mode!=='playing')closeUnitRadial(false);story.mode=mode;if(mode!=='playing'){cullingLab.observer=false;document.body.dataset.cullingObserver='false';cullingLab.lastFrame=null;}updateCullingHud(true);window.QBitsMusic?.setPaused(!['playing','menu','levels','codex','settings'].includes(mode));document.body.dataset.gameMode=mode;for(const [key,el] of [['menu',ui.main],['pause',ui.pause],['levels',ui.levels],['complete',ui.complete],['codex',document.querySelector('#codex-screen')]])el.hidden=mode!==key;document.querySelector('#pause-button').hidden=mode!=='playing';hint.hidden=true;redraw=true;}
function gameScene(scene){story.scene=scene;document.body.dataset.gameScene=scene;const label=document.querySelector('#chapter-label');label.hidden=scene==='lab';document.querySelector('#chapter-number').textContent=scene==='intro'?'PRÓLOGO / 00':'NIVEL / '+String(story.level||1).padStart(2,'0');document.querySelector('#chapter-name').textContent=scene==='intro'?'El primer encuentro':chapters[story.level||1][1];}
function storySuspended(){return radialOpen()||story.ready&&(story.mode!=='playing'||document.hidden);}
function storyWalkAllowed(){return !story.ready||story.scene!=='intro'||['deliver','cooling','cooled','choice','repeat'].includes(story.phase);}
function storyLookAllowed(){return !workshopPanel?.isOpen&&(!story.ready||story.mode==='playing'&&!['asleep','invocation','opening'].includes(story.phase));}
function storyActionAllowed(){return !story.ready||story.mode==='playing'&&!story.transition&&!encounterLocksActions()&&(story.scene!=='intro'||['pickup','carry','deliver','cooling','cooled'].includes(story.phase));}
function storyObjective(text){ui.objective.textContent=text;ui.objective.hidden=!text;}
function say(text,{after=null,hold=false,mysterious=false,choices=null,onComplete=null}={}){
 const timing=window.QBitsDialogueTiming.create(text);
 window.QBitsGuideAudio?.begin(text,{voice:!mysterious,timing});
 ui.dialogue.style.opacity='1';
 story.dialogue={text,timing,time:0,count:-1,after,hold,choices,onComplete,done:false};ui.text.textContent='';ui.text.classList.add('typing');ui.dialogue.hidden=false;ui.dialogue.classList.toggle('mysterious',mysterious);ui.speaker.textContent=mysterious?'UNA VOZ…':'Q-BIT';ui.choices.hidden=true;ui.choices.replaceChildren();ui.cooling.hidden=true;document.querySelector('#dialogue-hint').textContent=after?'E · continuar':choices?'Elige una respuesta':'';
}
function hideStoryDialogue(){window.QBitsGuideAudio?.stop();story.dialogue=null;ui.dialogue.hidden=true;ui.choices.hidden=true;ui.cooling.hidden=true;}
function advanceDialogue(){const d=story.dialogue;if(!d||story.mode!=='playing'||!panel.hidden)return;const end=d.timing.duration;if(d.time<end){window.QBitsGuideAudio?.reveal(d.text.length,{skip:true});d.time=end;renderDialogue(0);return;}if(d.after){const after=d.after;d.after=null;after();}}
function renderDialogue(dt){
 const d=story.dialogue;if(!d)return;d.time+=dt;const count=d.timing.countAt(d.time);if(count!==d.count){window.QBitsGuideAudio?.reveal(count);ui.text.textContent=d.text.slice(0,count);d.count=count;ui.text.classList.toggle('typing',count<d.text.length);}
 if(count===d.text.length&&!d.done){d.done=true;if(d.choices){ui.choices.hidden=false;for(const choice of d.choices){const button=document.createElement('button');button.textContent=choice.label;button.addEventListener('click',choice.run);ui.choices.appendChild(button);}document.querySelector('#dialogue-hint').textContent='Elige una respuesta';story.intentionalUnlock=true;pause(false);ui.choices.querySelector('button')?.focus({preventScroll:true});}if(d.onComplete){const complete=d.onComplete;d.onComplete=null;complete();}}
 if(!d.hold&&d.after&&d.time>d.timing.duration+2.6){const after=d.after;d.after=null;after();}
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
 window.QBitsMusic?.start();window.QBitsGuideAudio?.unlock();window.QBitsFootsteps?.unlock();window.QBitsJoinAudio?.unlock();
 document.querySelector('#wake-screen').hidden=true;story.phase='opening';story.phaseTime=0;hideStoryDialogue();captureMouse();
}
// Shortcut only for startup/menu and the opening narration; never resets active play.
function quickWake(){
 if(!gamePrepared||document.hidden||settingsScreen?.isOpen)return false;
 const initial=story.scene==='intro'&&['invocation','asleep'].includes(story.phase);
 if(!['boot','menu'].includes(story.mode)&&!(story.mode==='playing'&&initial))return false;
 if(story.transition&&!initial)return false;
 story.transition=null;document.body.dataset.transitioning='false';document.querySelector('#scene-loading').hidden=true;
 resetGameInputs();pause(false);panel.hidden=true;
 if(!initial)beginIntro();else{gameMode('playing');story.started=true;}
 hideStoryDialogue();storyObjective('');story.phase='asleep';story.phaseTime=6.7;
 ui.veil.style.opacity='1';ui.top.style.height='52%';ui.bottom.style.height='52%';canvas.style.filter='none';
 previousTime=performance.now();accumulator=0;showWakeButton();return true;
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
function storyWall(p,half,{glass=false,color=[.91,.935,.92],door=false,q=Q()}={}){
 const body=new CANNON.Body({mass:0});body.addShape(new CANNON.Box(half));body.position.copy(p);body.quaternion.copy(q);body.collisionFilterMask=-1;world.addBody(body);body.computeAABB();const wall={p,half,q:body.quaternion,body,min:body.aabb.lowerBound.clone(),max:body.aabb.upperBound.clone(),glass,color,door,initialY:p.y};storyWorld.walls.push(wall);return wall;
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
function storyPoseClear(g,pos,q,src=poses(g,pos,q),bb=bounds(g,pos,q)){return !storyWorld.walls.some(w=>boundsOverlap(bb,w)&&src.some(a=>obbOverlap(a,{p:w.p,q:w.q||Q(),half:w.half})));}
function resolveStoryPlayer(oldX,oldZ){const r=PLAYER_RADIUS;const blocked=(x,z)=>storyWorld.walls.some(w=>w.min.y<posture.height+.15&&w.max.y>.15&&x>w.min.x-r&&x<w.max.x+r&&z>w.min.z-r&&z<w.max.z+r&&obbOverlap({p:V(x,posture.height/2,z),q:Q(),half:V(r,posture.height/2,r)},{p:w.p,q:w.q||Q(),half:w.half},0));if(blocked(position[0],oldZ))position[0]=oldX;if(blocked(position[0],position[2]))position[2]=oldZ;}
function drawStoryWorld(){
 if(!storyWorld.walls.length)return;
 gl.disable(gl.BLEND);gl.depthMask(true);
 for(const w of storyWorld.walls)if(!w.glass&&w.furniture!=='power-reservoir')drawAsset({buffer:cubeGeometry,count:36},w.p,w.q||Q(),mul(w.half,2),[...w.color.slice(0,3),1]);
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
 cancelCullingBenchmark();cullingLab.observer=false;cullingLab.lastFrame=null;document.body.dataset.cullingObserver='false';
 window.QBitsFootsteps?.reset();window.QBitsJoinAudio?.stop();
 clearRobotArms();if(typeof clearConveyors==='function')clearConveyors();
 closeWorkshopPanel(false);cancelShelfPlacement();cancelUnitCreation();
 workshopBench=null;contactStates.clear();rotorContactStates.clear();
 closeUnitRadial(false);
 releaseQubit();story.preserveGrip=false;clearCampaign();clearStoryWalls();clearPuzzleScene();puzzle.active=false;puzzle.savedLab=null;puzzle.delivery=null;clearSelection();speech.queue.length=0;for(const slot of speech.slots)clearSpeechSlot(slot);hideStoryDialogue();storyObjective('');ui.marker.hidden=true;story.guideId=null;story.phaseTime=0;story.dropAligned=false;story.lost=0;story.arrival=0;story.routeIssued=false;story.phase='idle';ui.top.style.height='0';ui.bottom.style.height='0';canvas.style.filter='none';document.querySelector('#notice').textContent='';document.querySelector('#wake-screen').hidden=true;
}
function rememberLab(){if(story.scene==='lab'){story.lab=puzzle.active?puzzle.savedLab:saveLab();story.labAlpha={...alphaSettings};}}
function applyStageDefaults(){Object.assign(settings,{mass:1,gravity:9.8,force:60,maxCarry:2000,maxSelect:2000,speed:.32});world.gravity.set(0,-settings.gravity,0);alphaSettings.coolingOn=true;posture.height=EYE_HEIGHT;bobHeight=0;bobSide=0;world.broadphase.dirty=true;}
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
 clearNarrativeScene();gameScene('lab');gameMode('playing');story.started=true;const saved=story.lab;workshopPlacement=saved?.workshop===undefined?defaultWorkshopPlacement:saved.workshop;
 if(saved){Object.assign(settings,saved.settings);Object.assign(moodSettings,saved.moodSettings||{});Object.assign(alphaSettings,story.labAlpha||{});position.splice(0,3,...saved.position);yaw=saved.yaw;pitch=saved.pitch;camera.splice(0,3,...position);for(const g of saved.groups)makeGroup(g.parts,g.q,g.v,g.w);restoreLabMechanisms(saved);for(const c of saved.cargos)restoreLabCargo(c);restoreAlphaScene(saved.alphaScene);}else{settings.maxCarry=MAX_QUBITS;settings.maxSelect=MAX_QUBITS;addQubit([0,HALF+.003,0]);}
 world.gravity.y=-settings.gravity;world.defaultContactMaterial.friction=settings.friction;world.defaultContactMaterial.restitution=settings.bounce;world.broadphase.dirty=true;ui.veil.style.opacity='0';setupWorkshop();updatePanel();if(capture)captureMouse();
}
function showMain(){document.querySelector('#wake-screen').hidden=true;gameMode('menu');pause(false);panel.hidden=true;document.querySelector('#main-continue').hidden=!story.started;ui.veil.style.opacity='0';ui.top.style.height='0';ui.bottom.style.height='0';canvas.style.filter='none';document.querySelector('#main-play').focus({preventScroll:true});}
function openPauseMenu(){if(!story.ready||story.mode!=='playing'||story.transition)return;closeWorkshopPanel(false);cancelUnitCreation();cancelShelfPlacement();document.querySelector('#wake-screen').hidden=true;gameMode('pause');pause(false);panel.hidden=true;document.querySelector('#pause-chapter').textContent=story.scene==='intro'?'Prólogo · El primer encuentro':story.scene==='campaign'?'Nivel '+story.level+' · '+chapters[story.level][1]:'Banco de pruebas';document.querySelector('#pause-resume').focus({preventScroll:true});}
function resumeGame(){if(story.phase==='complete'){gameMode('complete');return;}gameMode('playing');if(story.scene==='intro'&&['asleep','invocation'].includes(story.phase)){ui.veil.style.opacity='1';ui.top.style.height='52%';ui.bottom.style.height='52%';ui.dialogue.hidden=!story.dialogue;if(story.phase==='asleep')showWakeButton();else{document.querySelector('#wake-screen').hidden=true;canvas.focus({preventScroll:true});}return;}if(story.phase==='choice'||story.phase==='repeat')return;captureMouse();}
function restartCurrent(){sceneFade(()=>{if(story.scene==='intro')beginIntro();else if(story.scene==='campaign')beginCampaignLevel(story.level);else if(puzzle.active)startPuzzle();else{clearNarrativeScene();gameScene('intro');enterLab(false);}});captureForTransition();}
function showLevelSelector(){story.returnMode=story.mode;gameMode('levels');pause(false);panel.hidden=true;const list=document.querySelector('#level-list');list.replaceChildren();for(let i=0;i<chapters.length;i++){const row=document.createElement('button');row.disabled=false;const number=document.createElement('span'),info=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('small');number.className='level-number';number.textContent=chapters[i][0];name.textContent=chapters[i][1];detail.textContent=(i===0?story.progress.intro:story.progress['level'+i])?'Completado · volver a jugar':chapters[i][2];info.append(name,detail);row.append(number,info);row.addEventListener('click',()=>{sceneFade(()=>i===0?beginIntro():beginCampaignLevel(i));captureForTransition();});list.appendChild(row);}document.querySelector('#levels-back').focus({preventScroll:true});}
function backFromLevels(){gameMode(story.returnMode||'menu');if(story.mode==='playing')resumeGame();}
function storyInput(event){
 if(document.body.dataset.booting==='true')return true;
 if(story.transition){event.preventDefault();return true;}
 if(!story.ready)return false;const editing=editableTarget(document.activeElement);
 if(event.code==='KeyP'&&!event.repeat&&!editing){event.preventDefault();if(!panel.hidden)stowTablet();else openPanel();return true;}
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
 window.QBitsGuideAudio?.setPaused(storySuspended()||!!story.transition);window.QBitsFootsteps?.setPaused(document.hidden||storySuspended()||!!story.transition);window.QBitsJoinAudio?.setPaused(document.hidden||storySuspended()||!!story.transition);
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
 if(story.campaign)for(const gate of story.campaign.gates)if(gate.pipe)for(const mesh of [gate.pipe.shell,gate.pipe.liquid,gate.pipe.halo])deleteRenderBuffer(mesh.buffer);
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
 const c=story.campaign;if(c?.sources)for(const s of c.sources)for(const mesh of [s.pipe.shell,s.pipe.liquid,s.pipe.halo,s.hardware])deleteRenderBuffer(mesh.buffer);
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
 if(scenePartCount()+cargo.units>MAX_QUBITS){s.blocked=true;return false;}
 stopHaul(cargo,'Materia recibida');cargo.intake=0;cargo.body.type=CANNON.Body.KINEMATIC;cargo.body.collisionResponse=false;cargo.body.velocity.set(0,0,0);cargo.body.updateMassProperties();s.state='intake';s.timer=0;s.from=cargo.body.position.clone();s.blocked=false;return true;
}
function outputPosition(s,index){return add(s.exit,V((index%4-1.5)*.15,HALF+.008,.57+Math.floor(index/4)*.16));}
function outputClear(p){
 const box={p,q:Q(),half:V(HALF+.005,HALF+.005,HALF+.005)};
 return !groups.some(g=>poses(g).some(pose=>obbOverlap(box,pose,-.002)))&&!storyWorld.walls.some(w=>obbOverlap(box,{p:w.p,q:w.q||Q(),half:w.half},-.002));
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
// Organizers suspend actual world objects; catalogue templates never enter here.
const shelves=[];
let shelfSerial=0,shelfPreview=null,shelfModelCache=null;
const shelfClone=value=>JSON.parse(JSON.stringify(value));
const shelfVector=v=>Array.isArray(v)?V(...v):V(v.x,v.y,v.z);
const shelfQuaternion=q=>Array.isArray(q)?new CANNON.Quaternion(...q):new CANNON.Quaternion(q.x,q.y,q.z,q.w);
function shelfModel(){return shelfModelCache||(shelfModelCache=QBitsFurniture.shelf());}
function shelfPartPose(placement,part){return {p:add(placement.p,placement.q.vmult(V(...part.p))),q:placement.q.mult(shelfQuaternion(part.q)),half:V(...part.half),shape:'cube'};}
function shelfBounds(placement){const model=shelfModel(),points=[];for(const x of [model.bounds.min[0],model.bounds.max[0]])for(const y of [model.bounds.min[1],model.bounds.max[1]])for(const z of [model.bounds.min[2],model.bounds.max[2]])points.push(add(placement.p,placement.q.vmult(V(x,y,z))));return {min:V(...['x','y','z'].map(k=>Math.min(...points.map(p=>p[k])))),max:V(...['x','y','z'].map(k=>Math.max(...points.map(p=>p[k]))))};}
function shelfPlacementValid(placement,ignore=null,restoring=false){
 if(!placement||!['north','south','east','west'].includes(placement.wall)||![placement.p.x,placement.p.y,placement.p.z,placement.q.x,placement.q.y,placement.q.z,placement.q.w].every(Number.isFinite)||Math.abs(Math.hypot(placement.q.x,placement.q.y,placement.q.z,placement.q.w)-1)>.001)return false;
 const model=shelfModel(),half=ROOM_SIZE/2,axis=['north','south'].includes(placement.wall)?'z':'x',sign=['north','west'].includes(placement.wall)?-1:1;
 if(Math.abs(placement.p[axis]-sign*(half-.004))>.02)return false;
 const normal=placement.q.vmult(V(0,0,1)),expected=V();expected[axis]=-sign;if(normal.dot(expected)<.9999)return false;
 const bb=shelfBounds(placement);if(bb.min.y<.025||bb.max.y>ROOM_HEIGHT-.025||Math.max(Math.abs(bb.min.x),Math.abs(bb.max.x),Math.abs(bb.min.z),Math.abs(bb.max.z))>half-.001)return false;
 for(const other of shelves)if(other!==ignore&&boundsOverlap(bb,shelfBounds(other)))return false;
 for(const part of model.parts){const pose=shelfPartPose(placement,part);
  if(storyWorld.walls.some(w=>(!ignore||w.shelfId!==ignore.id)&&obbOverlap(pose,{p:w.p,q:w.q||Q(),half:w.half,shape:'cube'},.00001)))return false;
  if(!restoring&&(groups.some(g=>poses(g).some(p=>obbOverlap(pose,p,.00001)))||cargos.some(c=>obbOverlap(pose,cargoPose(c),.00001))))return false;
 }return true;
}
function beginShelfPlacement(hit){
 if(story.scene!=='lab'||puzzle.active)return false;
 if(shelves.length>=QBitsOrganizers.MAX_SHELVES){announce('Máximo '+QBitsOrganizers.MAX_SHELVES+' repisas en este banco.');return false;}
 shelfPreview={placement:null,valid:false,snapped:false,reason:''};updateShelfPlacement(hit);captureMouse();announce('Repisa · apunta a una pared · clic o E para colocar · Esc para cancelar.');return true;
}
function updateShelfPlacement(hit){
 if(!shelfPreview)return false;
 if(!hit){Object.assign(shelfPreview,{valid:false,reason:'Apunta a una pared cercana.'});return false;}
 const model=shelfModel(),width=model.bounds.max[0]-model.bounds.min[0],height=model.bounds.max[1]-model.bounds.min[1],p=add(hit.p,mul(hit.normal,.004));p.y=clamp(p.y-height/2,.03,ROOM_HEIGHT-height-.03);
 const side=['north','south'].includes(hit.wall)?'x':'z';p[side]=clamp(p[side],-ROOM_SIZE/2+width/2+.03,ROOM_SIZE/2-width/2-.03);
 let snapped=false,distance=.24;for(const existing of shelves.filter(s=>s.wall===hit.wall))for(const delta of [V(width+.015,0,0),V(-width-.015,0,0),V(0,height+.015,0),V(0,-height-.015,0)]){const target=add(existing.p,existing.q.vmult(delta)),gap=target.distanceTo(p);if(gap<distance){distance=gap;p.copy(target);snapped=true;}}
 const placement={p,q:hit.q.clone(),wall:hit.wall};Object.assign(shelfPreview,{placement,snapped,valid:shelfPlacementValid(placement),reason:''});if(!shelfPreview.valid)shelfPreview.reason='Deja espacio libre para la repisa.';redraw=true;return shelfPreview.valid;
}
function confirmShelfPlacement(){if(!shelfPreview?.valid){announce(shelfPreview?.reason||'Apunta a una pared libre.');return null;}const shelf=createShelf(shelfPreview.placement);if(shelf){cancelShelfPlacement();announce('Repisa lista · clic derecho en un compartimento para organizar.');}return shelf;}
function cancelShelfPlacement(){shelfPreview=null;redraw=true;return true;}
function createShelf(placement,restoring=false){
 if(story.scene!=='lab'||puzzle.active||shelves.length>=QBitsOrganizers.MAX_SHELVES||!shelfPlacementValid(placement,null,restoring))return null;
 const shelf={id:++shelfSerial,p:placement.p.clone(),q:placement.q.clone(),wall:placement.wall,cells:shelfModel().cells.map(()=>({category:null,items:[]})),walls:[],labels:[]};
 shelf.walls=shelfModel().parts.map(part=>{const pose=shelfPartPose(shelf,part),wall=storyWall(pose.p,pose.half,{q:pose.q,color:part.color.slice(0,3)});wall.furniture='shelf';wall.shelfId=shelf.id;return wall;});shelves.push(shelf);redraw=true;return shelf;
}
function shelfCellPoint(shelf,index=0,front=false){const cell=shelfModel().cells[index]||shelfModel().cells[0],p=V(...cell.p);if(front)p.z+=cell.halfDepth+.015;return add(shelf.p,shelf.q.vmult(p));}
function aimShelf(dir=direction(),max=4){
 if(story.scene!=='lab'||puzzle.active)return null;const origin=V(...camera);let result=null;
 for(const shelf of shelves){const inverse=shelf.q.inverse(),o=inverse.vmult(sub(origin,shelf.p)),d=inverse.vmult(dir),model=shelfModel(),t=rayPuzzleBox(o,d,{min:V(...model.bounds.min),max:V(...model.bounds.max)},max);if(t===null||t<0||result&&t>=result.distance)continue;
  if(storyWorld.walls.some(w=>w.shelfId!==shelf.id&&(rayPuzzleBox(origin,dir,w,t)??Infinity)<t-.002))continue;
  const point=add(o,mul(d,t));let cellIndex=0,nearest=Infinity;model.cells.forEach((cell,index)=>{const gap=Math.hypot(point.x-cell.p[0],point.y-cell.p[1]);if(gap<nearest){nearest=gap;cellIndex=index;}});if(nearest>model.cells[cellIndex].radius+.025)continue;result={shelf,cellIndex,point:shelfCellPoint(shelf,cellIndex,true),distance:t};
 }return result;
}
function drawShelves(){drawShelfContents();if(shelfPreview?.placement){const color=shelfPreview.valid?[.25,.75,1,.5]:[1,.25,.2,.5];gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);for(const part of shelfModel().parts){const pose=shelfPartPose(shelfPreview.placement,part);drawBox(pose.p,pose.q,mul(pose.half,2),color);}gl.depthMask(true);gl.disable(gl.BLEND);}}
function shelfSnapshot(component){
 syncVirtualConveyors(0);
 const ids=new Set(component.flatMap(g=>g.parts.map(p=>p.id))),joints=serializeRotorState().filter(r=>ids.has(r.aId)&&ids.has(r.bId)),contacts=serializeContactState(),keys=new Set(joints.map(r=>r.aId+':'+r.bId));
 const item={version:1,groups:component.map(g=>({q:[g.body.quaternion.x,g.body.quaternion.y,g.body.quaternion.z,g.body.quaternion.w],parts:worldParts(g).map(p=>({id:p.id,shape:unitShape(p),weight:p.weight,p:[p.p.x,p.p.y,p.p.z],q:[p.q.x,p.q.y,p.q.z,p.q.w],mood:shelfClone(p.mood)}))})),joints:shelfClone(joints),sets:serializeRotorSets().map(set=>({name:set.name,members:set.members.filter(r=>ids.has(r.aId)&&ids.has(r.bId))})).filter(set=>set.members.length),contacts:{sensors:contacts.sensors.filter(s=>ids.has(s.id)),rotors:contacts.rotors.filter(r=>keys.has(r.key.split(':').slice(0,2).join(':')))}};
 const arms=serializeRobotArms().filter(arm=>ids.has(arm.gripperId));if(arms.length)item.robotArms=shelfClone(arms);
 const modules=typeof serializeConveyors==='function'?serializeConveyors().filter(c=>ids.has(c.baseId)):[];if(modules.length)item.conveyors=shelfClone(modules);
 if(!QBitsOrganizers.validItem(item))return null;
 const points=component.flatMap(g=>poses(g).flatMap(corners)),origin=V((Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2,Math.min(...points.map(p=>p.y)),(Math.min(...points.map(p=>p.z))+Math.max(...points.map(p=>p.z)))/2);for(const group of item.groups)for(const part of group.parts)part.p=part.p.map((v,i)=>v-[origin.x,origin.y,origin.z][i]);item.category=QBitsOrganizers.category(item);return item;
}
function shelfSelectionPlan(shelf,cellIndex=0){
 const cell=shelf?.cells?.[cellIndex],fail=error=>({ok:false,error});if(!shelves.includes(shelf)||!cell)return fail('El compartimento ya no existe.');
 const team=selectedRotors().length?selectedRotors().flatMap(rotorGroups):selectedTeam().length?selectedTeam():(held?.items||(held?[held]:[])).map(item=>item.g);if(!team.length)return fail('Selecciona las piezas o mecanismos que quieres guardar.');
 const components=[],seen=new Set();for(const g of team)if(!seen.has(g)){const component=rotorConnectedGroups([g]);components.push(component);component.forEach(x=>seen.add(x));}
 if(components.some(component=>component.some(g=>!groups.includes(g)||g.route||g.haulJob||g.cooler||g.blueprintJob||g.pendingMoodOrder||g.parts.some(p=>p.mood.production))))return fail('Termina las rutas, enfriamiento o trabajos antes de guardar.');
 if([...seen].some(g=>{const arm=robotArmForGroup(g);return arm&&(arm.running||arm.jogging);}))return fail('Detén la secuencia del brazo antes de guardarlo.');
 if(typeof conveyors!=='undefined'&&conveyors.some(c=>c.running&&seen.has(rotorPart(c.baseId)?.g)))return fail('Detén las cintas antes de guardar la línea.');
 if([...flightStates.values()].some(f=>f.enabled&&f.component?.some(g=>seen.has(g))))return fail('Aterriza y detén las hélices antes de guardar el dron.');
 if([...robotGrips.values()].some(grip=>seen.has(grip.g)||seen.has(robotGripperHit(grip.id)?.g)))return fail('Suelta el objeto del cubo de agarre antes de guardar.');
 if(rotors.some(r=>r.enabled&&rotorGroups(r).some(g=>seen.has(g))))return fail('Detén los rotores antes de guardar el mecanismo.');
 const items=components.map(shelfSnapshot);if(items.some(item=>!QBitsOrganizers.validItem(item)))return fail('No se puede guardar esta estructura.');
 const category=cell.category||items[0].category;if(items.some(item=>item.category.key!==category.key))return fail('Un compartimento admite un solo tipo. Selecciona piezas o mecanismos compatibles.');
 if(cell.items.length+items.length>QBitsOrganizers.CAPACITY)return fail('Este compartimento admite 50 elementos; quedan '+(QBitsOrganizers.CAPACITY-cell.items.length)+' lugares.');
 return {ok:true,components,items,category};
}
function storeShelfSelection(shelf,cellIndex=0){
 if(story.scene!=='lab'||puzzle.active)return false;const plan=shelfSelectionPlan(shelf,cellIndex);if(!plan.ok){announce(plan.error);return false;}
 const stored=new Set(plan.components.flat());if((held?.items||(held?[held]:[])).some(item=>stored.has(item.g)))releaseQubit(false);
 for(const rotor of [...rotors])if(rotorGroups(rotor).some(g=>stored.has(g)))disconnectRotor(rotor);
 for(const g of stored)removeGroup(g);if(typeof pruneConveyors==='function')pruneConveyors();const cell=shelf.cells[cellIndex];cell.category=shelfClone(plan.category);cell.items.push(...plan.items);clearSelection();redraw=true;announce(plan.items.length+' elemento'+(plan.items.length===1?'':'s')+' guardado'+(plan.items.length===1?'':'s')+' · '+cell.items.length+' / 50');return true;
}
function shelfItemBounds(item){const points=item.groups.flatMap(g=>g.parts.flatMap(p=>corners({shape:p.shape,p:V(...p.p),q:shelfQuaternion(p.q)})));return {min:V(...['x','y','z'].map(k=>Math.min(...points.map(p=>p[k])))),max:V(...['x','y','z'].map(k=>Math.max(...points.map(p=>p[k]))))};}
function shelfRestoreJoint(state){
 const a=rotorPart(state.aId),b=rotorPart(state.bId);if(!a||!b)return null;const at=rotorEndpoint(a,state.servo,'a'),bt=rotorEndpoint(b,state.servo,'b'),network=rotorConnectedGroups([b.g]);
 if(!network.includes(a.g)&&at.point.distanceTo(bt.point)<=.005&&at.axis.dot(bt.axis)<-.995){const turn=Q();turn.setFromVectors(bt.axis,mul(at.axis,-1));turn.normalize();for(const g of network){g.body.position.copy(add(at.point,turn.vmult(sub(g.body.position,bt.point))));g.body.quaternion.copy(turn.mult(g.body.quaternion));g.body.quaternion.normalize();g.body.aabbNeedsUpdate=true;}}
 return connectRotorTips(state.aId,state.bId,{...state,...storedRotorDrive(state),enabled:false});
}
function withdrawShelf(shelf,cellIndex=0,count=1){
 if(story.scene!=='lab'||puzzle.active||!shelves.includes(shelf))return false;const cell=shelf.cells[cellIndex];if(!cell||!Number.isInteger(count)||count<1||count>cell.items.length)return false;
 pruneRobotArms();if(typeof pruneConveyors==='function')pruneConveyors();
 const items=cell.items.slice(0,count),liveIds=new Set(groups.flatMap(g=>g.parts.map(p=>p.id)));if(items.some(item=>!QBitsOrganizers.validItem(item)||!storedShelfConveyorsValid(item)||item.joints.some(j=>!storedRotorOptionsValid(j))||item.groups.some(g=>g.parts.some(p=>{if(liveIds.has(p.id))return true;liveIds.add(p.id);return false;})))){announce('No se puede recuperar este contenido: hay identidades o datos incompatibles.');return false;}
 if(scenePartCount()+items.reduce((n,item)=>n+QBitsOrganizers.count(item),0)>MAX_QUBITS){announce('No hay capacidad libre en el banco. Guarda otras piezas antes de retirar.');return false;}
 const made=[],madeRotors=[],oldContacts=serializeContactState(),origin=shelfCellPoint(shelf,cellIndex),normal=shelf.q.vmult(V(0,0,1)),tangent=shelf.q.vmult(V(1,0,0)),sizes=items.map(shelfItemBounds),spacing=Math.max(...sizes.map(b=>Math.hypot(b.max.x-b.min.x,b.max.z-b.min.z)))+.15,columns=Math.min(5,count);
 const rollback=()=>{madeRotors.forEach(disconnectRotor);made.forEach(removeGroup);restoreContactState(oldContacts);announce('No hay espacio libre delante de la repisa. Aparta los objetos o retira una tanda menor.');return false;};
 for(const [index,item]of items.entries()){
  const offset=add(add(origin,mul(normal,.35+spacing/2+Math.floor(index/columns)*spacing)),mul(tangent,(index%columns-(columns-1)/2)*spacing));offset.y=.006-sizes[index].min.y;
  for(const record of item.groups){const parts=record.parts.map(p=>({id:p.id,shape:p.shape,weight:p.weight,p:add(V(...p.p),offset),q:shelfQuaternion(p.q),mood:shelfClone(p.mood)})),g=makeGroup(parts,shelfQuaternion(record.q));made.push(g);}
  for(const joint of item.joints){const r=shelfRestoreJoint(joint);if(!r)return rollback();madeRotors.push(r);}
 }
 if(made.some(g=>!validPose(g,g.body.position,g.body.quaternion)))return rollback();
 for(const item of items)for(const saved of item.sets||[]){const members=(saved.members||[]).map(m=>madeRotors.find(r=>r.aId===m.aId&&r.bId===m.bId)).filter(Boolean);if(members.length)createRotorSet(saved.name,members);}
 restoreContactState({sensors:[...oldContacts.sensors,...items.flatMap(item=>item.contacts?.sensors||[])],rotors:[...oldContacts.rotors,...items.flatMap(item=>item.contacts?.rotors||[])]});
 restoreRobotArms(items.flatMap(item=>item.robotArms||[]));
 if(typeof restoreConveyors==='function')restoreConveyors(items.flatMap(item=>item.conveyors||[]));
 shelfPreviewMesh(shelf,cellIndex,null);cell.items.splice(0,count);if(!cell.items.length)cell.category=null;clearSelection();multiSelection=made;selected={g:made[0],part:made[0].parts[0]};redraw=true;announce(count+' elemento'+(count===1?' retirado':'s retirados')+' · delante de la repisa');return true;
}
function deleteShelf(shelf,confirmed=false){
 if(!confirmed||!shelves.includes(shelf))return false;clearShelfPreviewMeshes(shelf);for(const wall of shelf.walls){if(world.bodies.includes(wall.body))world.removeBody(wall.body);const at=storyWorld.walls.indexOf(wall);if(at>=0)storyWorld.walls.splice(at,1);}for(const label of shelf.labels)label?.remove();shelves.splice(shelves.indexOf(shelf),1);redraw=true;return true;
}
function requestDeleteShelf(shelf){
 if(!shelves.includes(shelf))return false;const count=shelf.cells.reduce((n,cell)=>n+cell.items.length,0);
 openCommandMenu(shelfCellPoint(shelf),count?'Eliminar repisa: se perderán '+count+' elementos':'Eliminar repisa vacía',[
  {label:count?'Saca primero los objetos que quieras conservar.':'La repisa está vacía.',disabled:true,run:()=>{}},
  {label:'Cancelar · conservar repisa',run:()=>openShelfMenu(shelf)},
  {label:count?'Eliminar repisa y perder '+count+' elementos':'Confirmar eliminación',run:()=>{deleteShelf(shelf,true);captureMouse();announce('Repisa eliminada');}}
 ]);return true;
}
function openShelfMenu(shelf,cellIndex=0){
 if(!shelves.includes(shelf))return false;const cell=shelf.cells[cellIndex],plan=shelfSelectionPlan(shelf,cellIndex),count=cell.items.length;
 const action=fn=>()=>{fn();captureMouse();};openCommandMenu(shelfCellPoint(shelf,cellIndex,true),'Compartimento '+(cellIndex+1)+' · '+(cell.category?.label||'Vacío')+' · '+count+'/50',[
  {label:plan.ok?'Guardar selección · '+plan.items.length+' elemento'+(plan.items.length===1?'':'s'):plan.error,disabled:!plan.ok,run:action(()=>storeShelfSelection(shelf,cellIndex))},
  {label:'Retirar 1',disabled:count<1,run:action(()=>withdrawShelf(shelf,cellIndex,1))},
  {label:'Retirar tanda de '+Math.min(5,count||5),disabled:count<2,run:action(()=>withdrawShelf(shelf,cellIndex,Math.min(5,count)))},
  {label:'Retirar todo · '+count,disabled:count<2,run:action(()=>withdrawShelf(shelf,cellIndex,count))},
  {label:'Eliminar repisa…',run:()=>requestDeleteShelf(shelf)},
  {label:'Cerrar',run:()=>captureMouse()}
 ]);return true;
}
function serializeShelves(){return shelves.map(shelf=>({version:1,p:[shelf.p.x,shelf.p.y,shelf.p.z],q:[shelf.q.x,shelf.q.y,shelf.q.z,shelf.q.w],wall:shelf.wall,cells:shelfClone(shelf.cells)}));}
function restoreShelves(records){
 clearShelves();if(!Array.isArray(records)||records.length>QBitsOrganizers.MAX_SHELVES)return 0;const ids=new Set(groups.flatMap(g=>g.parts.map(p=>p.id))),valid=[];
 for(const record of records){
  if(record?.version!==1||!Array.isArray(record.p)||record.p.length!==3||!Array.isArray(record.q)||record.q.length!==4||!Array.isArray(record.cells)||record.cells.length!==shelfModel().cells.length)continue;
  const candidates=new Set(),cells=[];let ok=true;for(const cell of record.cells){if(!Array.isArray(cell?.items)||cell.items.length>QBitsOrganizers.CAPACITY){ok=false;break;}let category=null;for(const item of cell.items){if(!QBitsOrganizers.validItem(item)||item.joints.some(j=>!storedRotorOptionsValid(j))){ok=false;break;}const type=QBitsOrganizers.category(item);if(category&&category.key!==type.key){ok=false;break;}category=type;for(const g of item.groups)for(const part of g.parts){if(ids.has(part.id)||candidates.has(part.id))ok=false;candidates.add(part.id);}}cells.push({category,items:shelfClone(cell.items)});}
  if(!ok)continue;const placement={p:shelfVector(record.p),q:shelfQuaternion(record.q),wall:record.wall},shelf=createShelf(placement,true);if(!shelf)continue;shelf.cells=cells;for(const id of candidates){ids.add(id);serial=Math.max(serial,id);}valid.push(shelf);
 }return valid.length;
}
function clearShelves(){cancelShelfPlacement();for(const shelf of [...shelves])deleteShelf(shelf,true);}
function buildPreviewMesh(parts,middle){
 const materials=new Map(),entries=[];
 // Pre-size typed buffers. Avoid vectors, temporary slices and growing JS
 // arrays for every vertex when a 2000-piece model is first displayed.
 for(let index=0;index<parts.length;index++){
  const part=parts[index],key=part.mood?.externalBattery?'battery':part.shape==='cube'?'cube':'other',mesh=unitMeshes[part.shape];
  let batch=materials.get(key);if(!batch){batch={color:key==='battery'?[.38,.62,.66,1]:key==='cube'?[.3,.34,.35,1]:[.58,.61,.61,1],size:0,offset:0,ends:[]};materials.set(key,batch);}
  batch.size+=mesh.count*12;entries.push({part,index,batch,mesh});
 }
 for(const batch of materials.values())batch.data=new Float32Array(batch.size);
 for(const {part,index,batch,mesh}of entries){
  const q=shelfQuaternion(part.q),x=q.x,y=q.y,z=q.z,w=q.w,xx=x*x,yy=y*y,zz=z*z;
  const m00=1-2*(yy+zz),m01=2*(x*y-z*w),m02=2*(x*z+y*w),m10=2*(x*y+z*w),m11=1-2*(xx+zz),m12=2*(y*z-x*w),m20=2*(x*z-y*w),m21=2*(y*z+x*w),m22=1-2*(xx+yy);
  const data=mesh.data,out=batch.data,px=part.p[0]-middle.x,py=part.p[1]-middle.y,pz=part.p[2]-middle.z;
  for(let i=0;i<data.length;i+=6){const vx=data[i],vy=data[i+1],vz=data[i+2],nx=data[i+3],ny=data[i+4],nz=data[i+5];let j=batch.offset;
   out[j++]=px+CUBE_SIZE*(m00*vx+m01*vy+m02*vz);out[j++]=py+CUBE_SIZE*(m10*vx+m11*vy+m12*vz);out[j++]=pz+CUBE_SIZE*(m20*vx+m21*vy+m22*vz);
   out[j++]=m00*nx+m01*ny+m02*nz;out[j++]=m10*nx+m11*ny+m12*nz;out[j++]=m20*nx+m21*ny+m22*nz;
   out[j++]=vx;out[j++]=vy;out[j++]=vz;out[j++]=nx;out[j++]=ny;out[j++]=nz;batch.offset=j;
  }
  batch.ends.push({index,end:batch.offset/12});
 }
 const batches=[...materials.values()].map(b=>({color:b.color,count:b.offset/12,ends:b.ends,buffer:buffer(b.data)}));boundGeometry=null;return {batches};
}
function drawPreviewMesh(mesh,p,q,scale=1,firstPart=0){
 for(const batch of mesh.batches){let first=0;if(firstPart){let lo=0,hi=batch.ends.length;while(lo<hi){const mid=(lo+hi)>>1;if(batch.ends[mid].index<firstPart)lo=mid+1;else hi=mid;}first=lo?batch.ends[lo-1].end:0;}
  if(first===batch.count)continue;bindGeometry(batch.buffer,true);gl.uniform1f(uniforms.uKind,5);setPose(p,q,V(scale,scale,scale));tint(...batch.color);submitDraw(gl.TRIANGLES,first,batch.count-first);
 }
}
function clearShelfPreviewMeshes(shelf){for(const entry of shelf.previewMeshes?.values()||[])disposePreviewMesh(entry.mesh);shelf.previewMeshes?.clear();}
function shelfPreviewMesh(shelf,index,item){
 shelf.previewMeshes||=new Map();let entry=shelf.previewMeshes.get(index);if(entry?.item===item)return entry;
 if(entry)disposePreviewMesh(entry.mesh);shelf.previewMeshes.delete(index);if(!item)return null;
 const bb=shelfItemBounds(item),middle=mul(add(bb.min,bb.max),.5),scale=.19/Math.max(bb.max.x-bb.min.x,bb.max.y-bb.min.y,bb.max.z-bb.min.z,.09);
 entry={item,scale,mesh:buildPreviewMesh(item.groups.flatMap(g=>g.parts),middle)};shelf.previewMeshes.set(index,entry);return entry;
}
function drawShelfContents(){
 if(story.scene!=='lab'||puzzle.active)return;
 for(const shelf of shelves)for(const [index,cell]of shelf.cells.entries()){
  const center=shelfCellPoint(shelf,index),front=shelfCellPoint(shelf,index,true),visible=cell.items.length&&sub(V(...camera),front).dot(shelf.q.vmult(V(0,0,1)))>0&&front.distanceTo(V(...camera))<6;
  if(!cell.items.length||!renderSphereVisible(center,.20)){if(!cell.items.length)shelfPreviewMesh(shelf,index,null);if(shelf.labels[index])shelf.labels[index].hidden=true;continue;}
  const preview=shelfPreviewMesh(shelf,index,cell.items[0]);drawPreviewMesh(preview.mesh,center,shelf.q,preview.scale);
  if(!shelf.labels[index]){const label=document.createElement('span');label.className='shelf-count';label.style.cssText='position:fixed;z-index:8;pointer-events:none;padding:2px 5px;border-radius:4px;background:rgba(20,27,29,.78);color:white;font:11px system-ui;transform:translate(-50%,0);';document.body.appendChild(label);shelf.labels[index]=label;}
  const label=shelf.labels[index],screen=visible&&!cullingLab.renderView&&project(add(front,V(0,-.085,0)));label.hidden=!screen;if(screen){label.textContent='×'+cell.items.length;label.style.left=screen.x+'px';label.style.top=screen.y+'px';}
 }
}
const defaultWorkshopPlacement={x:-1.75,z:1.3,angle:0};
let workshopPlacement=defaultWorkshopPlacement,workshopBench=null,workshopPanel=null;
const contactStates=new Map(),rotorContactStates=new Map();
function serializeContactState(){
 return {sensors:[...contactStates].map(([id,state])=>({id,...state})),rotors:[...rotorContactStates].map(([key,state])=>({key,...state}))};
}
function restoreContactState(saved){
 contactStates.clear();rotorContactStates.clear();
 const valid=entry=>entry&&typeof entry.latched==='boolean'&&Number.isFinite(entry.clearSeconds)&&entry.clearSeconds>=0&&entry.clearSeconds<=.08;
 const copy=entry=>({latched:entry.latched,clearSeconds:entry.clearSeconds});
 const linked=new Set();for(const g of groups)for(const part of g.parts)if(QBitsWorkshop.partState(part).sensor){const r=sensorTarget(part);if(r)linked.add(sensorOutputKey(r,sensorConfig(part).action));}
 for(const entry of Array.isArray(saved?.sensors)?saved.sensors:[]){if(!valid(entry)||!Number.isSafeInteger(entry.id))continue;const part=rotorPart(entry.id)?.part;if(part&&QBitsWorkshop.partState(part).sensor&&sensorTarget(part))contactStates.set(entry.id,copy(entry));}
 for(const entry of Array.isArray(saved?.rotors)?saved.rotors:[])if(valid(entry)&&linked.has(entry.key))rotorContactStates.set(entry.key,copy(entry));
}
function persistWorkshop(){try{localStorage.setItem('qbits.workshop.v1',JSON.stringify(workshopProfile));return true;}catch{return false;}}
function awardWorkshopCredits(){const result=QBitsWorkshop.awardCompleted(workshopProfile,story.progress);workshopProfile=result.profile;persistWorkshop();return result;}
function purchaseWorkshopResearch(key){awardWorkshopCredits();const result=QBitsWorkshop.purchase(workshopProfile,key,story.progress);if(!result.ok){announce(result.error);return false;}workshopProfile=result.profile;const saved=persistWorkshop();announce('Investigado · '+QBitsWorkshop.RESEARCH.find(item=>item.id===key).label+(saved?'':' · solo en esta sesión; no se pudo guardar'));return true;}
function setupWorkshop(){
 if(story.scene!=='lab'||puzzle.active)return null;
 if(!workshopPlacement)return null;
 if(workshopBench&&world.bodies.includes(workshopBench.wall.body))return workshopBench;
 const p=V(workshopPlacement.x,.6,workshopPlacement.z),q=Q();q.setFromAxisAngle(V(0,1,0),workshopPlacement.angle);
 const model=QBitsFurniture.desk(),walls=model.parts.map(part=>storyWall(add(p,q.vmult(V(...part.p))),V(...part.half),{q:q.mult(shelfQuaternion(part.q)),color:part.color.slice(0,3)}));
 workshopBench={p,q,wall:walls[0],walls,model,surfaceHalf:V(...model.surfaceHalf)};announce('Mesa de trabajo lista · E para trabajar · clic derecho para retirar.');return workshopBench;
}
function removeWorkshop(){if(workshopBench){for(const wall of workshopBench.walls||[workshopBench.wall]){world.removeBody(wall.body);const at=storyWorld.walls.indexOf(wall);if(at>=0)storyWorld.walls.splice(at,1);}workshopBench=null;world.broadphase.dirty=true;}}
function packWorkshop(){
 if(workshopBench){
  for(const g of groups)if(poses(g).some(p=>onWorkshop(p.p)))g.body.wakeUp();
  for(const c of cargos)c.body.wakeUp();
  removeWorkshop();
 }
 workshopPlacement=null;
}
function onWorkshop(p){if(!workshopBench)return false;const local=workshopBench.q.inverse().vmult(sub(p,workshopBench.p));
 return Math.abs(local.x)<workshopBench.surfaceHalf.x&&Math.abs(local.z)<workshopBench.surfaceHalf.z&&local.y>=-.02&&local.y<=.45;}
function workshopTarget(){
 if(!workshopBench)return null;
 const eligible=groups.flatMap(g=>g.parts.map(part=>({g,part,...partPose(g,part)}))).filter(o=>!o.part.mood.production&&onWorkshop(o.p)&&!held?.items?.some(item=>item.g===o.g));
 return eligible.find(o=>selected?.part.id===o.part.id)||eligible.sort((a,b)=>a.p.distanceTo(workshopBench.p)-b.p.distanceTo(workshopBench.p))[0]||null;
}
// The body editor rearranges existing cubes; it never stretches a collider or
// creates material. Preview and apply share validation to avoid stale UI plans.
function workshopBodyPreview(id,dimensions={}){
 const dims={x:Number(dimensions.x),y:Number(dimensions.y),z:Number(dimensions.z)},count=dims.x*dims.y*dims.z;
 const fail=error=>({ok:false,error,dimensions:dims,count});
 if(story.scene!=='lab'||puzzle.active||!workshopBench)return fail('Los cuerpos se preparan en el taller del banco de pruebas.');
 if(Object.values(dims).some(n=>!Number.isInteger(n)||n<1||n>16)||count>MAX_QUBITS)return fail('Usa medidas enteras de 1 a 16, con un máximo de '+MAX_QUBITS+' cubos.');
 const hit=rotorPart(id);if(!hit)return fail('Deja un grupo de cubos sobre la mesa.');
 const g=hit.g,parts=g.parts;
 if(parts.length!==count)return fail('Estas medidas necesitan '+count+' cubos; el grupo tiene '+parts.length+'.');
 if(parts.some(p=>unitShape(p)!=='cube'||p.mood.externalBattery||p.mood.gripper||p.mood.production||p.mood.matter||QBitsWorkshop.hasAdaptation(p)))return fail('Usa cubos normales, sin baterías ni adaptaciones.');
 if(parts.some(p=>!Number.isFinite(p.weight)||p.weight<=0||!Number.isFinite(p.mood.energy)||p.mood.energy<0||p.mood.energy>1))return fail('Una pieza tiene datos de masa o carga no válidos.');
 if(rotorForGroup(g))return fail('Desconecta los rotores antes de editar el cuerpo.');
 if((held?.items||(held?[held]:[])).some(item=>item.g===g)||g.route||g.pendingMoodOrder||g.haulJob||g.blueprintJob||g.cooler||g.body.velocity.norm()>.05||g.body.angularVelocity.norm()>.1)return fail('Detén el grupo, déjalo sobre la mesa y suéltalo.');
 const surface=workshopBench.surfaceHalf||V(.48,0,.32),origin=workshopBench.p,frame=workshopBench.q,inverse=frame.inverse(),source=bounds(g,inverse.vmult(sub(g.body.position,origin)),inverse.mult(g.body.quaternion)),margin=.002;
 if(source.min.y<-.015||source.min.y>.08||source.min.x< -surface.x-margin||source.max.x>surface.x+margin||source.min.z< -surface.z-margin||source.max.z>surface.z+margin)return fail('Coloca el grupo completo sobre la superficie de trabajo.');
 const size=V(dims.x*CUBE_SIZE,dims.y*CUBE_SIZE,dims.z*CUBE_SIZE);
 if(size.x>surface.x*2-margin||size.z>surface.z*2-margin)return fail('Ese cuerpo sobresale de la mesa. Reduce el largo o el ancho y aumenta otra medida.');
 const center=V(origin.x,origin.y+size.y/2+.004,origin.z),planned=worldParts(g);let i=0;
 for(let y=0;y<dims.y;y++)for(let z=0;z<dims.z;z++)for(let x=0;x<dims.x;x++)Object.assign(planned[i++],{p:add(center,frame.vmult(V((x-(dims.x-1)/2)*CUBE_SIZE,(y-(dims.y-1)/2)*CUBE_SIZE,(z-(dims.z-1)/2)*CUBE_SIZE))),q:frame.clone()});
 const candidate={body:{position:center,quaternion:Q()},parts:planned.map(p=>({...p,offset:sub(p.p,center)}))};
 if(!validPose(candidate,center,candidate.body.quaternion,[g]))return fail('El resultado necesita espacio libre sobre la mesa. Retira las piezas que lo bloquean.');
 return {ok:true,error:'',dimensions:dims,count,size,parts:planned,source:g,center};
}
function workshopBodyApply(id,dimensions){
 const plan=workshopBodyPreview(id,dimensions);if(!plan.ok){announce(plan.error);return false;}
 const selectedId=selected?.g===plan.source?selected.part.id:id;
 removeGroup(plan.source);const made=makeGroup(plan.parts);made.body.aabbNeedsUpdate=true;world.broadphase.dirty=true;
 multiSelection=[];clearRotorSelection();selected={g:made,part:made.parts.find(p=>p.id===selectedId)||made.parts[0]};
 automationIntervention();redraw=true;updatePanel();announce('Cuerpo '+plan.dimensions.x+' × '+plan.dimensions.z+' × '+plan.dimensions.y+' listo sobre la mesa · '+plan.count+' cubos conservados');return true;
}
function previewWorkshopBody(id,dimensions){return workshopBodyPreview(id,dimensions);}
function applyWorkshopBody(id,dimensions){return workshopBodyApply(id,dimensions);}
function externalBatteryPack(id){
 const hit=rotorPart(id),state=hit&&externalBatteryState(hit.part);if(!state)return null;
 return {g:hit.g,parts:externalBatteryPackComponents(hit.g).find(parts=>parts.includes(hit.part))||[hit.part]};
}
function externalBatteryPackInfo(id){
 const pack=externalBatteryPack(id);if(!pack)return null;
 const capacity=pack.parts.reduce((n,p)=>n+externalBatteryCapacity(p),0),storedJ=pack.parts.reduce((n,p)=>n+p.mood.energy*externalBatteryCapacity(p),0);
 return {...pack,capacity,storedJ,percent:Math.round(100*storedJ/capacity),enabled:pack.parts.every(p=>externalBatteryState(p).enabled),label:'Batería '+['','I','II','III'][Math.min(3,pack.parts.length)]+' · '+pack.parts.length+' cubo'+(pack.parts.length===1?'':'s')};
}
function batteryWorkshopCheck(id,count){
 if(story.scene!=='lab'||puzzle.active||!workshopBench)return 'Las baterías se preparan en el taller del banco de pruebas.';
 if(!Number.isInteger(count)||count<1||count>3)return 'Elige una batería de uno, dos o tres cubos.';
 const hit=rotorPart(id);if(!hit)return 'Deja los cubos sobre la mesa.';
 const g=hit.g;
 if((held?.items||(held?[held]:[])).some(item=>item.g===g)||poses(g).some(p=>!onWorkshop(p.p)))return 'Deja todos los cubos sobre la mesa y suéltalos.';
 if(g.parts.length!==count||g.parts.some(p=>unitShape(p)!=='cube'))return 'Esta versión necesita '+count+' cubo'+(count===1?'':'s')+' unido'+(count===1?'':'s')+' en línea.';
 if(count>1&&(!g.block||g.block.counts.filter(n=>n>1).length!==1||Math.max(...g.block.counts)!==count))return 'Une los cubos en una barra recta antes de llevarlos al taller.';
 if(g.parts.some(p=>isExternalBattery(p)||p.mood.externalBattery||p.mood.gripper||p.mood.production||p.mood.matter||QBitsWorkshop.hasAdaptation(p)))return 'Usa cubos normales, sin batería externa ni adaptaciones.';
 if(g.parts.some(p=>!Number.isFinite(p.mood.energy)||p.mood.energy<0||p.mood.energy>1))return 'La carga de una pieza no es válida.';
 const network=rotorConnectedGroups([g]);
 if(network.some(m=>m.route||m.pendingMoodOrder||m.haulJob||m.blueprintJob)||rotors.some(r=>r.enabled&&rotorGroups(r).some(m=>network.includes(m))))return 'Detén y suelta el mecanismo antes de adaptarlo.';
 return '';
}
function createExternalBattery(id,count){
 const error=batteryWorkshopCheck(id,count);if(error){announce(error);return false;}
 const hit=rotorPart(id),parts=hit.g.parts,packId=Math.min(...parts.map(p=>p.id));
 for(const part of parts){const storedJ=part.mood.energy*gameBatteryCapacity(part);part.mood.externalBattery={version:1,ownerId:part.id,packId,enabled:false};delete part.mood.workshop;delete part.mood.sensorLink;part.mood.energy=clamp(storedJ/externalBatteryCapacity(part),0,1);Object.assign(part.mood,{state:'neutral',blend:[1,0,0],agitation:0,restLeft:0,reason:'',idle:0});}
 automationIntervention();clearRotorSelection();multiSelection=[];selected={g:hit.g,part:hit.part};redraw=true;
 announce('Batería '+['','I','II','III'][count]+' creada · conserva su carga · actívala después de acoplarla');return true;
}
function toggleExternalBattery(id,enabled){
 const pack=externalBatteryPack(id);if(!pack||typeof enabled!=='boolean'||certifiedAutomation())return false;
 // Source changes are deliberate and stop the connected motors first.
 const component=rotorConnectedGroups([pack.g]);for(const r of rotors)if(rotorGroups(r).some(g=>component.includes(g)))configureRotor(r,{enabled:false});
 for(const part of pack.parts)part.mood.externalBattery={...externalBatteryState(part),enabled};
 automationIntervention();redraw=true;announce(enabled?'Batería activa · inicia los rotores para usar la reserva externa':'Batería apagada · los rotores usarán su reserva interna');return true;
}
function restoreExternalBattery(id){
 const pack=externalBatteryPack(id);if(!pack||story.scene!=='lab'||puzzle.active||!workshopBench)return false;
 if((held?.items||(held?[held]:[])).some(item=>item.g===pack.g)||pack.parts.some(p=>!onWorkshop(partPose(pack.g,p).p))){announce('Deja la batería sobre la mesa y suéltala.');return false;}
 const component=rotorConnectedGroups([pack.g]);if(component.some(g=>g.route||g.haulJob||g.blueprintJob)||rotors.some(r=>r.enabled&&rotorGroups(r).some(g=>component.includes(g)))){announce('Detén el mecanismo antes de restaurar los cubos.');return false;}
 const scale=batterySceneScale(),charges=pack.parts.map(p=>({part:p,joules:p.mood.energy*externalBatteryCapacity(p),capacity:QBitsWorkshop.batteryCapacity(p)*scale}));
 if(charges.some(x=>x.joules>x.capacity+1e-8)){announce('La carga supera la reserva de los cubos normales. Usa energía antes de restaurarlos.');return false;}
 for(const {part,joules,capacity}of charges){delete part.mood.externalBattery;part.mood.energy=clamp(joules/capacity,0,1);}
 automationIntervention();redraw=true;announce('Cubos restaurados · materia y energía conservadas');return true;
}
function showExternalBatteryGuide(id=null){
 const hit=id&&rotorPart(id),point=hit?.p||workshopBench?.p||V(...camera);
 openCommandMenu(point,'Baterías · antes de arrancar',[
  {label:'1 · Une 1, 2 o 3 cubos en línea y conviértelos en el taller.',disabled:true,run:()=>{}},
  {label:'2 · Acopla la batería al mecanismo con Shift y actívala con clic derecho.',disabled:true,run:()=>{}},
  {label:'3 · Verifica «Batería externa» en el menú del rotor. Sin una activa usa las internas.',disabled:true,run:()=>{}},
  {label:'El verde muestra la carga. Vacía y activa: detiene el motor, sin gastar las internas.',disabled:true,run:()=>{}},
  {label:'Para recargar: apágala y déjala quieta, tocando el piso, con los motores detenidos.',disabled:true,run:()=>{}},
  ...(hit&&isExternalBattery(hit.part)?[{label:'Volver a la batería',run:()=>showExternalBatteryMenu(id)}]:[]),
  {label:'Entendido · volver a la sala',run:()=>captureMouse()}
 ]);
}
function showExternalBatteryMenu(id){
 const hit=rotorPart(id),info=externalBatteryPackInfo(id);if(!hit||!info)return;
 selected={g:hit.g,part:hit.part};const items=[
  {label:info.percent+' % · '+(info.enabled?'activa':'apagada'),disabled:true,run:()=>{}},
  {label:info.enabled?'Apagar batería':'Activar batería',run:()=>{toggleExternalBattery(id,!info.enabled);showExternalBatteryMenu(id);}},
  {label:'Tomar batería / mecanismo',disabled:!canCarry([hit.g])||hit.p.distanceTo(V(...camera))>2.8,run:()=>{multiSelection=[];takeSelection({...hit,point:hit.p,distance:hit.p.distanceTo(V(...camera))});}},
  {label:'Guardar mecanismo con batería',run:()=>{saveMechanism(hit.g);captureMouse();}},
  {label:'Cómo conectar y recargar…',run:()=>showExternalBatteryGuide(id)}
 ];
 if(hit.g.parts.length>1)items.push({label:'Separar piezas…',run:()=>openDetachMenu(hit)});
 if(onWorkshop(hit.p))items.push({label:'Restaurar cubos en el taller',run:()=>{restoreExternalBattery(id);captureMouse();}});
 items.push({label:'Cerrar',run:()=>captureMouse()});openCommandMenu(hit.p,info.label,items,hit.g);
}
function workshopPanelSnapshot(){
 const hit=workshopTarget(),counts=hit?.g.block?.counts||[hit?.g.parts.length||1,1,1];
 return {credits:workshopProfile.credits,bench:workshopProfile.bench,target:hit?{id:hit.part.id,count:hit.g.parts.length,battery:isExternalBattery(hit.part),name:hit.part.mood.name,summary:hit.part.mood.name+' · '+hit.g.parts.length+' pieza'+(hit.g.parts.length===1?'':'s')+' sobre la mesa',dimensions:{x:counts[0],y:counts[1],z:counts[2]}}:null};
}
function workshopUpgradePreview(hit,patch){
 if(!hit)return {error:'Deja una pieza sobre la mesa para adaptarla.'};
 if(isExternalBattery(hit.part))return {error:'Restaura primero los cubos de la batería desde la pestaña Baterías.'};
 if(!onWorkshop(hit.p)||(held?.items||(held?[held]:[])).some(item=>item.g===hit.g))return {error:'Deja la pieza sobre la mesa y suéltala.'};
 const component=rotorConnectedGroups([hit.g]);if(component.some(g=>g.route||g.pendingMoodOrder||g.haulJob||g.blueprintJob)||rotors.some(r=>r.enabled&&rotorGroups(r).some(g=>component.includes(g))))return {error:'Detén el mecanismo antes de adaptarlo.'};
 return QBitsWorkshop.planPartUpgrade(hit.part,patch,workshopProfile);
}
function workshopPanelInspect(draft,snapshot=workshopPanelSnapshot()){
 const hit=snapshot.target&&rotorPart(snapshot.target.id),model={title:'Resultado',description:'',intro:'',options:[],fields:[],facts:[],preview:{kind:'piece',size:[1,1,1]},allowed:false,error:'',applyLabel:'Aplicar',action:null,targetId:hit?.part.id};
 if(draft.tab==='bodies'){
  const dimensions=draft.dimensions,plan=workshopBodyPreview(hit?.part.id,dimensions);model.title='Cuerpo de '+dimensions.x+' × '+dimensions.z+' × '+dimensions.y;model.intro='Redistribuye los cubos de la mesa. La cantidad de piezas se conserva.';model.description='Largo × ancho × alto';model.preview={kind:'body',size:[dimensions.x,dimensions.y,dimensions.z],caption:'Cada división corresponde a un cubo existente'};
  model.fields=[['x','Largo'],['z','Ancho'],['y','Alto']].map(([axis,label])=>({id:'dimension-'+axis,label,value:dimensions[axis],min:1,max:16}));
  model.facts=[['En la mesa',snapshot.target?.count||0],['Necesarios',dimensions.x*dimensions.y*dimensions.z],['Resultado',dimensions.x+' × '+dimensions.z+' × '+dimensions.y]];model.error=plan.error||'';model.allowed=!!plan.ok;model.applyLabel='Formar cuerpo';model.action={kind:'body',dimensions};return model;
 }
 if(draft.tab==='upgrades'){
  model.modes=[{id:'adapt',label:'Adaptaciones'},{id:'research',label:'Investigaciones'}];
  if(draft.mode==='research'){
   const entries=QBitsWorkshop.availableResearch(workshopProfile,story.progress);model.intro='Investiga una vez. Después puedes aplicar esa mejora sin volver a pagar.';model.options=entries.map(item=>({id:'research:'+item.id,title:item.label,subtitle:item.owned?'Investigado':item.cost+' créditos',note:!item.owned&&!item.available?item.reason:''}));
   const item=entries.find(item=>'research:'+item.id===draft.choice)||entries[0];model.title=item.label;model.description='Desbloquea una opción del taller';model.preview={kind:'research',size:[1,1,1],caption:'La investigación desbloquea la mejora; no modifica la pieza'};model.facts=[['Costo',item.cost+' créditos'],['Disponibles',snapshot.credits],['Estado',item.owned?'Investigado':item.available?'Disponible':'Bloqueado']];model.allowed=item.available;model.error=item.owned?'':item.reason;model.note=item.owned?'Esta investigación ya está disponible.':'';model.applyLabel=item.owned?'Investigado':'Investigar · '+item.cost+' créditos';model.action={kind:'research',key:item.id};return model;
  }
  const labels={sensor:'Sensor configurable',battery:'Reserva interna',lightweight:'Estructura ligera',movement:'Movimiento',restore:'Restaurar pieza'};
  model.intro='Elige una adaptación y revisa el resultado antes de aplicarla.';model.options=Object.entries(labels).map(([key,title])=>({id:'upgrade:'+key,title,subtitle:{sensor:'Contacto, movimiento, láser o peso',battery:'Más autonomía en la misma pieza',lightweight:'Menos peso; también menos agarre',movement:'Más velocidad; mayor consumo',restore:'Retira las adaptaciones del taller'}[key]}));
  const key=draft.choice.split(':')[1]||'sensor',state=QBitsWorkshop.partState(hit?.part),tier=clamp(Math.round(draft.tier)||1,1,3),patch=key==='restore'?{sensor:false,battery:1,lightweight:1,movement:1}:key==='sensor'?{sensor:!state.sensor}:{[key]:tier};
  if(['battery','lightweight','movement'].includes(key))model.fields=[{id:'tier',label:'Nivel de adaptación',value:tier,options:[[1,'I · Original'],[2,'II · Mejorado'],[3,'III · Avanzado']]}];
  const plan=workshopUpgradePreview(hit,patch);model.title=(key==='sensor'&&state.sensor?'Retirar sensor':labels[key]||labels.sensor)+(model.fields.length?' '+['','I','II','III'][tier]:'');model.description=hit?hit.part.mood.name+' · '+unitLabel(hit.part):'Selecciona una pieza de la mesa';model.preview={kind:'piece',size:[1,1,1],sensor:patch.sensor??state.sensor,caption:'Vista previa de la pieza adaptada'};
  if(hit&&isTBit(hit.part)){const profile=unitProfile(hit.part);model.preview.mesh={vertices:profile.vertices.map(v=>[v.x/CUBE_SIZE,v.y/CUBE_SIZE,v.z/CUBE_SIZE]),faces:profile.faces.map(face=>face.slice())};}
  model.facts=[['Peso',plan.part?formatWeight(plan.part.weight)+' u':'—'],['Batería',plan.capacity?Math.round(plan.capacity*batterySceneScale()):'—'],['Materia',plan.material?formatWeight(plan.material.total)+' u conservadas':'—']];model.error=plan.error||'';model.allowed=!!plan.part;model.action={kind:'upgrade',patch};model.applyLabel=key==='restore'?'Restaurar pieza':'Aplicar adaptación';return model;
 }
 model.intro='Convierte cubos unidos en una batería externa. Las tres versiones están disponibles.';
 model.options=[1,2,3].map(count=>({id:'battery:'+count,title:'Batería '+['','I','II','III'][count],subtitle:count+' cubo'+(count===1?'':'s')+' · capacidad ×'+count}));
 const info=hit&&externalBatteryPackInfo(hit.part.id),count=Number(draft.choice.split(':')[1])||info?.parts.length||1;
 if(info)model.options.push({id:'battery:keep',title:'Batería de la mesa',subtitle:info.percent+' % de carga conservada'},{id:'battery:restore',title:'Restaurar cubos',subtitle:'Recuperar las piezas originales'});
 const stored=info?.storedJ??(hit?hit.g.parts.reduce((n,p)=>n+p.mood.energy*gameBatteryCapacity(p),0):0),capacity=count*60*batterySceneScale();
 const dimensions=snapshot.target?.dimensions,previewSize=snapshot.target?.count===count&&dimensions?[dimensions.x,dimensions.y,dimensions.z]:[count,1,1];
 model.title='Batería '+['','I','II','III'][count];model.description='Carcasa transparente · reserva externa';model.preview={kind:'battery',size:previewSize,energy:stored/capacity,caption:'El nivel verde representa la carga que se conserva'};model.facts=[['Cubos',count],['Capacidad',capacity],['Carga inicial',Math.round(clamp(stored/capacity,0,1)*100)+' %']];
 model.help='Después: acóplala con Shift, actívala y arranca los rotores. Para recargar, apágala y apoya su carcasa en el piso.';
 if(draft.choice==='battery:keep'&&info){model.allowed=false;model.note='Batería preparada. El resultado permanece sobre la mesa.';model.applyLabel='Batería preparada';return model;}
 if(draft.choice==='battery:restore'&&info){const scale=batterySceneScale(),overflow=info.parts.some(p=>p.mood.energy*externalBatteryCapacity(p)>QBitsWorkshop.batteryCapacity(p)*scale+1e-8);model.title='Cubos originales';model.description='Retirar la carcasa de batería';model.preview={kind:'body',size:previewSize};model.error=overflow?'Usa parte de la carga antes de restaurar: supera la reserva de los cubos originales.':'';model.allowed=!overflow;model.applyLabel='Restaurar cubos';model.action={kind:'restore-battery'};return model;}
 model.error=batteryWorkshopCheck(hit?.part.id,count);model.allowed=!model.error;model.applyLabel='Crear batería '+['','I','II','III'][count];model.action={kind:'battery',count};return model;
}
function workshopPanelApply(draft,model){
 if(!tabletNearBench())return {ok:false,message:'Acércate a la mesa para aplicar el cambio.'};
 let ok=false;const action=model.action;if(!action)return {ok:false,message:'Elige una operación disponible.'};
 if(action.kind==='body')ok=workshopBodyApply(model.targetId,action.dimensions);
 else if(action.kind==='research')ok=purchaseWorkshopResearch(action.key);
 else if(action.kind==='upgrade')ok=applyWorkshopUpgrade(model.targetId,action.patch);
 else if(action.kind==='restore-battery')ok=restoreExternalBattery(model.targetId);
 else if(action.kind==='battery')ok=createExternalBattery(model.targetId,action.count);
 return {ok,message:document.querySelector('#notice').textContent||(ok?'Aplicado · el resultado queda sobre la mesa.':'No se pudo aplicar.'),choice:ok&&action.kind==='battery'?'battery:keep':ok&&action.kind==='restore-battery'?'battery:1':undefined};
}
function initWorkshopPanel(){if(!workshopPanel&&window.QBitsWorkshopPanel)workshopPanel=window.QBitsWorkshopPanel.create({snapshot:workshopPanelSnapshot,inspect:workshopPanelInspect,apply:workshopPanelApply,onClose:()=>closeWorkshopPanel(true)});return workshopPanel;}
function openWorkshopPanel(tab='batteries'){
 if(story.scene!=='lab'||puzzle.active||story.mode!=='playing'||story.transition)return false;
 if(!setupWorkshop()){announce('Coloca la mesa desde Q → Equipo.');return false;}
 if(!tabletNearBench()){announce('Acércate a la mesa para trabajar.');return false;}
 if(!initWorkshopPanel())return false;awardWorkshopCredits();closeCommandMenu(false);closeDetachMenu(false);if(panel.hidden)releaseForTablet();workshopPanel.open(tab);showTablet();return true;
}
function closeWorkshopPanel(resume=true){if(!workshopPanel?.isOpen)return;workshopPanel.close();syncTabletMode();if(resume)stowTablet();}
function showWorkshopBatteries(){return openWorkshopPanel('batteries');}
function applyWorkshopUpgrade(id,patch){
 if(story.scene!=='lab'||puzzle.active||!workshopBench){announce('Las adaptaciones se preparan en la mesa del banco de pruebas.');return false;}
 const hit=rotorPart(id);if(!hit||!onWorkshop(hit.p)||held?.items?.some(item=>item.g===hit.g)){announce('Deja la pieza sobre la mesa y suéltala.');return false;}
 const component=rotorConnectedGroups([hit.g]);if(component.some(g=>g.route||g.pendingMoodOrder||g.haulJob||g.blueprintJob)||rotors.some(r=>r.enabled&&rotorGroups(r).some(g=>component.includes(g)))){announce('Detén el mecanismo antes de adaptarlo.');return false;}
 awardWorkshopCredits();const parts=worldParts(hit.g),at=parts.findIndex(p=>p.id===id),plan=QBitsWorkshop.planPartUpgrade(parts[at],patch,workshopProfile);
 if(plan.error){announce(plan.error);return false;}
 parts[at]=plan.part;if(!QBitsWorkshop.partState(plan.part).sensor){delete parts[at].mood.sensorLink;delete parts[at].mood.sensorConfig;contactStates.delete(id);}
 const ref=hit.g.body.quaternion.clone(),velocity=hit.g.body.velocity.clone(),spin=hit.g.body.angularVelocity.clone();removeGroup(hit.g);const made=makeGroup(parts,ref,velocity,spin);refreshRotors();selected={g:made,part:made.parts.find(p=>p.id===id)};
 const batteryScale=batterySceneScale();announce('Adaptación aplicada · '+Math.round(plan.storedJ*batteryScale)+' / '+plan.capacity*batteryScale+' de batería conservada · '+plan.material.piece.toFixed(2)+' u + '+plan.material.bench.toFixed(2)+' u reservadas en mesa');updatePanel();return true;
}
function aimWorkshop(dir=direction()){
 if(story.scene!=='lab'||puzzle.active||!workshopBench)return false;
 const origin=V(...camera);let nearest=Infinity;
 for(const wall of workshopBench.walls){const distance=rayPuzzleBox(origin,dir,wall,3.5);if(distance!==null)nearest=Math.min(nearest,distance);}
 return Number.isFinite(nearest)&&nearest<=puzzleRayLimit(nearest,dir)+.00001;
}
function openWorkshopMenu(dir=direction()){
 if(story.scene!=='lab'||puzzle.active||story.mode!=='playing'||story.transition)return false;
 if(!aimWorkshop(dir))return false;
 return openWorkshopPanel('batteries');
}
function showWorkshopResearch(){
 if(!openWorkshopPanel('upgrades'))return false;workshopPanel.setMode('research');return true;
}
function sensorMotorKey(r){return r.aId+'-'+r.bId;}
function sensorGroup(kind,name,members){
 if(members.length<2)return null;
 const parts=mechanicalPartIndex();if(members.some(r=>!r||!parts.has(r.aId)||!parts.has(r.bId)))return null;
 const sorted=members.slice().sort((a,b)=>a.aId-b.aId),first=sorted[0];
 return {kind,name,members:sorted,aId:first.aId,bId:first.bId,signature:sorted.map(sensorMotorKey).join(',')};
}
// Keep the instance on its physical anchor. Template copies receive fresh endpoint IDs.
function rememberSensorMachine(name,joints){
 const group=sensorGroup('machine',name,joints);if(!group)return;
 rotorPart(group.aId).part.mood.sensorMachine={name,members:group.members.map(r=>({aId:r.aId,bId:r.bId}))};
}
function sensorMachine(anchor){
 const saved=mechanicalPartIndex().get(anchor.aId)?.part.mood.sensorMachine;
 if(!Array.isArray(saved?.members)||saved.members.length>MAX_QUBITS||typeof saved.name!=='string')return null;
 const members=saved.members.map(pair=>pair&&rotorForPair(pair));
 const group=sensorGroup('machine',saved.name,members);
 if(!group||group.aId!==anchor.aId)return null;
 const connected=new Set(rotorConnectedGroups(rotorGroups(anchor)));
 return members.every(r=>rotorGroups(r).every(g=>connected.has(g)))?group:null;
}
function sensorSet(set){return set?sensorGroup('set',set.name,rotorSetMembers(set)):null;}
function sensorTarget(part){
 const link=part?.mood?.sensorLink;if(!link)return null;
 const r=rotorForPart(link.aId);if(!r||r.aId!==link.aId||r.bId!==link.bId||!rotorPart(r.aId)||!rotorPart(r.bId))return null;
 if(!link.kind)return r;
 const group=link.kind==='set'?sensorSet(rotorSetFor(r)):link.kind==='machine'?sensorMachine(r):null;
 return group&&group.signature===link.signature?group:null;
}
function sensorNearest(hit,target){
 let nearest=null;
 for(const r of target.members||[target]){
  const a=rotorPart(r.aId);if(!a)continue;
  const point=couplerTip(a).point,distance=hit.p.distanceTo(point);
  if(!nearest||distance<nearest.distance)nearest={point,distance};
 }
 return nearest;
}
function sensorChoice(target){return target.members?target.kind+':'+target.aId:String(target.id);}
function sensorCanReverse(target){
 return (target?.members||(target?[target]:[])).every(r=>!r.servo&&!robotArmForRotor(r));
}
function sensorFace(part){const profile=unitProfile(part),index=profile.faceNormals.reduce((best,n,i)=>n.x>profile.faceNormals[best].x?i:best,0);return {normal:profile.faceNormals[index],center:profile.faceCenters[index]};}
function linkContactSensor(sensorId,target){
 const hit=rotorPart(sensorId);if(certifiedAutomation()||!hit||!QBitsWorkshop.partState(hit.part).sensor||!(target?.members||[target]).every(r=>rotors.includes(r)&&rotorGroups(r).every(Boolean))){announce('Elige un sensor adaptado y un destino completo.');return false;}
 if(sensorNearest(hit,target).distance>3){announce('Acerca sensor y rotor: el enlace alcanza 3 m.');return false;}
 hit.part.mood.sensorLink={aId:target.aId,bId:target.bId,...(target.members?{kind:target.kind,signature:target.signature}:{})};contactStates.delete(sensorId);announce('Sensor conectado al mecanismo');return true;
}
function unlinkContactSensor(sensorId){const hit=rotorPart(sensorId);if(!hit)return false;delete hit.part.mood.sensorLink;contactStates.delete(sensorId);return true;}
function showSensorMenu(hit){
 clearRotorSelection();selected={g:hit.g,part:hit.part};closeCommandMenu(false);pause();showTablet();updatePanel();switchPanelTab('mechanisms');sensorField('panel').scrollIntoView?.({block:'start'});
}
function sensorField(name){return document.querySelector('#sensor-'+name);}
function selectedSensor(){return selected?.part&&QBitsWorkshop.partState(selected.part).sensor?rotorPart(selected.part.id):null;}
function sensorTargetBusy(target){
 return (target?.members||(target?[target]:[])).some(r=>{const arm=robotArmForRotor(r);return r.enabled||arm?.running||arm?.jogging;});
}
function refreshSensorPanel(){
 const hit=selectedSensor();sensorField('panel').hidden=!hit;if(!hit)return;
 const cfg=sensorConfig(hit.part),linked=sensorTarget(hit.part),flight=flightForGroup(hit.g),target=sensorField('target');
 target.replaceChildren();const option=(value,label)=>{const el=document.createElement('option');el.value=value;el.textContent=label;target.append(el);};
 option('',flight?'Dron acoplado':'Sin enlace');

 const addGroup=group=>{
  if(!group)return;
  if((!linked||sensorChoice(group)!==sensorChoice(linked))&&!(sensorNearest(hit,group)?.distance<=3))return;
  const id=sensorChoice(group);
  option(id,(group.kind==='set'?'Conjunto · ':'Mecanismo · ')+group.name+' · '+group.members.length+' rotores · #'+group.aId);
 };
 for(const set of rotorSets)addGroup(sensorSet(set));
 for(const r of rotors)addGroup(sensorMachine(r));
 for(const r of rotors){
  const a=rotorPart(r.aId);if(!a||r!==linked&&hit.p.distanceTo(couplerTip(a).point)>3)continue;
  option(String(r.id),(robotArmForRotor(r)?'Brazo':sensorBelt(r)?'Cinta':r.servo?'Servo':'Rotor')+' · eje #'+r.id);
 }
 target.value=linked?sensorChoice(linked):'';
 for(const field of ['mode','action','range','weight','speed'])sensorField(field).value=String(cfg[field]);
 sensorField('range-row').hidden=!['laser','motion'].includes(cfg.mode);sensorField('weight-row').hidden=cfg.mode!=='weight';sensorField('speed-row').hidden=cfg.mode!=='motion';
 const busy=sensorTargetBusy(linked)||!!flight?.enabled;
 for(const field of ['mode','action','target','range','weight','speed'])sensorField(field).disabled=busy;
 const reverse=sensorField('reverse');reverse.disabled=!sensorCanReverse(linked);
}
for(const field of ['mode','action','target','range','weight','speed'])sensorField(field).addEventListener('change',()=>{
 const hit=selectedSensor();if(!hit||certifiedAutomation())return;
 let r=sensorTarget(hit.part);if(sensorTargetBusy(r)||flightForGroup(hit.g)?.enabled){refreshSensorPanel();return;}
 const cfg=sensorConfig(hit.part),value=sensorField(field).value;
 if(field==='target'){
  if(value==='')unlinkContactSensor(hit.part.id);
  else{
   const [kind,id]=value.split(':'),anchor=id&&rotorForPart(Number(id));
   const next=kind==='set'&&anchor?sensorSet(rotorSetFor(anchor)):kind==='machine'&&anchor?sensorMachine(anchor):rotors.find(r=>String(r.id)===value);
   if(!next||sensorTargetBusy(next)||!linkContactSensor(hit.part.id,next)){refreshSensorPanel();return;}
  }
  r=sensorTarget(hit.part);
 }else if(['mode','action'].includes(field))cfg[field]=value;
 else if(value!==''&&Number.isFinite(Number(value)))cfg[field]=Number(value);
 const implicit=field!=='action'&&hit.part.mood.sensorConfig?.action===undefined;
 if(implicit)delete cfg.action;
 if(!sensorCanReverse(r)&&(cfg.action==='reverse'||cfg.action===undefined))cfg.action='start';
 hit.part.mood.sensorConfig=cfg;const clean=sensorConfig(hit.part);
 if(cfg.action===undefined)delete clean.action;hit.part.mood.sensorConfig=clean;
 sensorSamples.delete(hit.part);refreshSensorPanel();redraw=true;
});
function liveSensorPanel(hit){
 const cfg=sensorConfig(hit.part),r=sensorTarget(hit.part),reading=sensorReading(hit,cfg);
 const units={laser:' cm',weight:' u',motion:' cm/s'};
 const value=Number.isFinite(reading.value)?' · '+Number(reading.value.toFixed(2))+units[cfg.mode]:'';
 const out=r&&sensorNearest(hit,r).distance>3;
 sensorField('reading').textContent=(reading.active?'Detectado':'En espera')+value+(out?' · enlace fuera de 3 m':!r&&!flightForGroup(hit.g)?' · elige un mecanismo':'');
}
function sensorContactActive(hit){
 const shape=hit.g.partShapes.get(hit.part.id),axis=hit.q.vmult(sensorFace(hit.part).normal);
 for(const contact of world.contacts){const isA=contact.bi===hit.g.body,isB=contact.bj===hit.g.body;if(!isA&&!isB)continue;
  if((isA?contact.si:contact.sj)!==shape)continue;const other=isA?contact.bj:contact.bi;
  if(other===floor||other.type!==CANNON.Body.STATIC||other.qubitGroup||other.collisionFilterGroup===0)continue;
  const normal=isA?contact.ni:mul(contact.ni,-1);if(Math.abs(normal.y)<.45&&normal.dot(axis)>.55)return true;
 }return false;
}
const SENSOR_RANGES=[25,50,100,200];
const sensorSamples=new WeakMap();
function sensorConfig(part){
 const cfg=part.mood.sensorConfig||{};
 return {mode:['motion','laser','weight'].includes(cfg.mode)?cfg.mode:'contact',range:SENSOR_RANGES.includes(cfg.range)?cfg.range:50,
  weight:Number.isFinite(cfg.weight)?clamp(cfg.weight,.25,MAX_QUBITS):1,speed:Number.isFinite(cfg.speed)?clamp(cfg.speed,1,500):5,
  action:['start','stop','reverse'].includes(cfg.action)?cfg.action:part.mood.sensorLink?.kind?'start':'reverse'};
}
function sensorBeam(hit,range,own){
 const face=sensorFace(hit.part),axis=hit.q.vmult(face.normal),origin=add(hit.p,hit.q.vmult(face.center));
 const end=add(origin,mul(axis,range/100)),nearest=end.clone();let distance=Infinity;
 world.raycastAll(origin,end,{skipBackfaces:false},result=>{
  if(own.has(result.body)||result.body.collisionFilterGroup===0)return;
  if(result.distance<distance){distance=result.distance;nearest.copy(result.hitPointWorld);}
 });
 return {origin,end:nearest,distance};
}
function sensorWeight(hit,own){
 const base=hit.g.body,shape=hit.g.partShapes.get(hit.part.id),queue=[base],seen=new Set(own);
 const cargoByBody=new Map(cargos.map(c=>[c.body,c])),above=new Map();
 for(const c of world.contacts){
  if(Math.abs(c.ni.y)<.65)continue;
  const a=c.ni.y>0,lower=a?c.bi:c.bj,upper=a?c.bj:c.bi;
  if(lower===base&&(a?c.si:c.sj)!==shape)continue;
  if(!above.has(lower))above.set(lower,[]);above.get(lower).push(upper);
 }
 let weight=0;
 function addLoad(body){
  if(seen.has(body))return;
  const load=body.qubitGroup?totalWeight(body.qubitGroup):cargoByBody.get(body)?.required;
  if(!load)return;seen.add(body);queue.push(body);weight+=load;
 }
 function solids(body){return body===base?[hit]:body.qubitGroup?poses(body.qubitGroup):[cargoPose(cargoByBody.get(body))];}
 for(let i=0;i<queue.length;i++){
  const lower=queue[i];
  for(const upper of above.get(lower)||[])addLoad(upper);
  if(lower.type===CANNON.Body.DYNAMIC&&lower.sleepState!==CANNON.Body.SLEEPING)continue;
  // Sleeping pairs do not emit contacts. Probe the same solids a few mm
  // upward to recover their top contact, including stacks restored at rest.
  for(const solid of solids(lower)){
   const raised={...solid,p:add(solid.p,V(0,.003,0))},area=collisionPoseBounds(raised),nearby=[];
   world.broadphase.aabbQuery(world,new CANNON.AABB({lowerBound:area.min,upperBound:area.max}),nearby);
   for(const other of nearby){
    if(seen.has(other)||other.sleepState!==CANNON.Body.SLEEPING||!other.qubitGroup&&!cargoByBody.has(other))continue;
    if(solids(other).some(top=>top.p.y>solid.p.y&&obbOverlap(raised,top)&&!obbOverlap({...solid,p:add(solid.p,V(0,-.003,0))},top)))addLoad(other);
   }
  }
 }
 return weight;
}
function sensorMotion(hit,range,own){
 let fastest=0;
 for(const body of world.bodies){
  if(own.has(body)||body.sleepState===CANNON.Body.SLEEPING||!body.collisionFilterGroup||!body.qubitGroup&&!cargos.some(c=>c.body===body))continue;
  const speed=body.velocity.norm()+body.angularVelocity.norm()*body.boundingRadius;if(speed<=fastest)continue;
  if(body.aabbNeedsUpdate)body.computeAABB();
  const {lowerBound:lo,upperBound:hi}=body.aabb;
  const distance=Math.hypot(...['x','y','z'].map(k=>hit.p[k]-clamp(hit.p[k],lo[k],hi[k])));
  if(distance<=range/100)fastest=speed;
 }
 return fastest*100;
}
function sensorReading(hit,cfg=sensorConfig(hit.part)){
 if(cfg.mode==='contact')return {active:sensorContactActive(hit)};
 const previous=sensorSamples.get(hit.part);
 if(cfg.mode!=='weight'&&previous&&simTime>=previous.time&&simTime-previous.time<1/30)return previous;
 const own=new Set(rotorConnectedGroups([hit.g]).map(g=>g.body));
 const value=cfg.mode==='laser'?sensorBeam(hit,cfg.range,own).distance*100:cfg.mode==='motion'?sensorMotion(hit,cfg.range,own):sensorWeight(hit,own);
 const sample={time:simTime,value,active:cfg.mode==='laser'?Number.isFinite(value):value>=(cfg.mode==='motion'?cfg.speed:cfg.weight)};
 sensorSamples.set(hit.part,sample);return sample;
}
function sensorOutputKey(r,action){return r.aId+':'+r.bId+(r.members?':group:'+r.signature:'')+(action==='reverse'?'':':'+action);}
function sensorBelt(r){return conveyors.find(c=>c.joints.some(j=>j.aId===r.aId&&j.bId===r.bId));}
function sensorGroupCommand(target,action){
 const motors=[],arms=new Set(),belts=new Set(),servos=new Set();
 for(const r of target.members){
  const arm=robotArmForRotor(r),belt=sensorBelt(r);
  if(arm)arms.add(arm);
  else if(belt){for(const section of action==='start'?conveyorLine(belt):[belt])belts.add(section);}
  else if(r.servo)servos.add(r);
  else motors.push(r);
 }
 if(action==='reverse'&&(arms.size||servos.size||!target.members.some(r=>r.enabled)))return false;
 const ids=list=>({rotorIds:list.map(r=>r.id)});
 if(action==='stop'){
  for(const arm of arms)stopRobotArm(arm);
  for(const belt of belts)stopConveyor(belt);
  for(const r of servos)sensorCommand(r,'stop');
  return !motors.length||configureRotorSet(ids(motors),{enabled:false});
 }
 // Apply ordinary motors as one validated command. If another controller cannot
 // start, undo the new commands without stopping members that were already running.
 const undo=[];
 if(motors.length){
  const idle=motors.filter(r=>!r.enabled),invert=action==='reverse';
  if(!configureRotorSet(ids(motors),invert?{invert:true}:{enabled:true}))return false;
  if(invert)undo.push(()=>configureRotorSet(ids(motors),{invert:true}));
  else if(idle.length)undo.push(()=>configureRotorSet(ids(idle),{enabled:false}));
 }
 function apply(command,revert){
  if(command()){undo.push(revert);return true;}
  for(const rollback of undo.reverse())rollback();return false;
 }
 for(const belt of belts){
  if(action==='reverse'){
   const direction=belt.direction;
   if(!apply(()=>configureConveyor(belt,{direction:-direction}),()=>configureConveyor(belt,{direction})))return false;
  }else if(!belt.running&&!apply(()=>startConveyor(belt),()=>stopConveyor(belt)))return false;
 }
 for(const arm of arms)if(!arm.running&&!arm.jogging&&!apply(()=>startRobotArm(arm),()=>stopRobotArm(arm)))return false;
 for(const r of servos){
  if(r.enabled)continue;
  const march=servoMarchMembers(r);
  if(march.every(m=>servos.has(m)&&!m.enabled)){
   if(!apply(()=>startServoMarch(r),()=>stopServoMarch(servoMarchFor(r))))return false;
  }else if(!apply(()=>startServo(r),()=>sensorCommand(r,'stop')))return false;
 }
 return true;
}
function sensorCommand(r,action){
 if(r.members)return sensorGroupCommand(r,action);
 const arm=robotArmForRotor(r),belt=sensorBelt(r);
 if(action==='reverse'){
  if(!r.enabled||arm||r.servo)return false;
  return belt?configureConveyor(belt,{direction:-belt.direction}):configureRotor(r,{direction:-r.direction},true);
 }
 const start=action==='start';
 if(arm)return start?startRobotArm(arm):stopRobotArm(arm);
 if(belt)return start?startConveyorLine(belt):stopConveyor(belt);
 if(r.servo){if(start)return startServo(r);stopServoMarch(servoMarchFor(r));}
 const ok=configureRotor(r,{enabled:start},true);
 if(ok&&start)rememberMechanismRun(rotorGroups(r)[0],'rotor',r);
 return ok;
}
function tickContactSensors(dt){
 if(storySuspended()||story.transition||certifiedAutomation()||!Number.isFinite(dt)||dt<=0)return;
 const live=new Set(),inputs=new Map();
 for(const g of groups)for(const part of g.parts){if(!QBitsWorkshop.partState(part).sensor)continue;live.add(part.id);const hit={g,part,...partPose(g,part)},r=sensorTarget(part);
  if(part.mood.sensorLink&&!r){delete part.mood.sensorLink;contactStates.delete(part.id);continue;}
  if(!r){contactStates.delete(part.id);continue;}
  const cfg=sensorConfig(part),key=sensorOutputKey(r,cfg.action);
  const touching=!held?.items?.some(item=>item.g===g)&&sensorNearest(hit,r).distance<=3&&sensorReading(hit,cfg).active;
  contactStates.set(part.id,QBitsContacts.step(contactStates.get(part.id),touching,dt).state);
  const input=inputs.get(key)||{r,action:cfg.action,touching:false,id:part.id};if(touching){input.touching=true;input.id=part.id;}inputs.set(key,input);
 }
 for(const id of contactStates.keys())if(!live.has(id))contactStates.delete(id);
 // One rotor receives one edge from the union of its sensors. Adjacent contacts
 // cannot undo one another; every linked tip must clear before it can rearm.
 for(const [key,input]of inputs){const {r}=input,next=QBitsContacts.step(rotorContactStates.get(key),input.touching,dt);rotorContactStates.set(key,next.state);
  if(next.fire&&sensorCommand(r,input.action))for(const motor of r.members||[r]){motor.sensorPulses=(motor.sensorPulses||0)+1;motor.lastSensorId=input.id;}
 }
 for(const key of rotorContactStates.keys())if(!inputs.has(key))rotorContactStates.delete(key);
}
function drawWorkshop(){
 // Furniture is drawn once by drawStoryWorld using the same oriented solids
 // as its Cannon colliders. Only fitted-piece indicators are drawn here.
 for(const g of groups)for(const part of g.parts)if(QBitsWorkshop.partState(part).sensor){const pose=partPose(g,part),face=sensorFace(part),point=add(pose.p,pose.q.vmult(add(face.center,mul(face.normal,.004)))),r=sensorTarget(part),tipQ=Q();tipQ.setFromVectors(V(1,0,0),face.normal);drawBox(point,pose.q.mult(tipQ),V(.009,.023,.023),r?[.25,.8,.49,1]:[.7,.57,.25,1]);if(altDown()&&sensorConfig(part).mode==='laser'){const beam=sensorBeam({g,part,...pose},sensorConfig(part).range,new Set(rotorConnectedGroups([g]).map(member=>member.body)));drawLines([beam.origin,beam.end],[1,.24,.12,1]);}if(r){const tip=sensorNearest(pose,r).point;drawLines([point,tip],[.2,.7,.43,.7]);}}
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
 const rotor=spawnRotor(V(-.6,.12,-.8),{mount:'fixed',moving:'b',rpm:30,maxTorque:.4,capacity:8*goal.load});
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
 const fixed=valid&&s.movingIds.every(id=>pair[1].parts.some(p=>p.id===id))&&at.distanceTo(s.pivot)<.035&&r.mount==='fixed'&&r.moving==='b'&&r.maxTorque<=.4+1e-8&&r.capacity===8*s.goal.load;
 const productive=fixed&&r.enabled&&!r.stalled&&Math.abs(r.actualRpm||0)>=s.goal.minRpm&&!held?.items?.some(item=>pair.includes(item.g));
 const delivered=!!endpoint&&endpoint.g===pair[1]&&endpoint.p.distanceTo(s.target)<.07;
 const previous=s.run;s.run=QBitsAutomation.advance(previous,{productive,delivered,powered:r.enabled,joules:r.powerActive?(r.power?.drainPerSide||0)*QBitsRotorPower.MODEL.joulesPerSide*2:0,reason:!fixed?'Conserva el banco original, base fija, lado B y capacidad '+(8*s.goal.load)+' u.':!r.enabled?'Enciende el rotor.':r.stalled?'Rotor bloqueado: revisa fuerza y espacio.':'Alcanza '+s.goal.minRpm+' rpm reales.'},dt,s.goal);
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
 const rotor=spawnRotor(V(-1.45,.16,.08),{mount:'fixed',moving:'b',rpm:30,maxTorque:.4,capacity:16});if(!rotor)return;
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
 s.internal=true;const ok=configureRotor(s.rotor,{mount:'fixed',moving:'b',direction:1,capacity:16,enabled:true});s.internal=false;if(!ok)return false;
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
 const available=2*Math.min(...pair.map(g=>g.parts[0].mood.energy*gameBatteryCapacity(g.parts[0]))),spent=Math.min(available,extra);
 for(const g of pair)g.parts[0].mood.energy=Math.max(0,g.parts[0].mood.energy-spent/(2*gameBatteryCapacity(g.parts[0])));
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
   if(job.time>=.7&&productionClear(s,a)&&productionClear(s,b)){makeGroup(job.parts.map((p,i)=>({...p,p:i?b:a,q:Q(),mood:{...p.mood,production:{...p.mood.production,role:'package'}}})));s.packJob=null;useful=true;emitJoinSound(a);}
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

function groupWorkUnits(g){return g.parts.reduce((n,p)=>n+(p.mood?.externalBattery?0:(p.mood?.matter?p.weight/p.mood.matter.rootWeight:1)*QBitsWorkshop.movementFactors(p).load),0);}
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
 const input=reconfigurationInput(action);if(input.some(p=>p.mood?.externalBattery)){announce('La batería no se divide ni se recompone. Usa sus controles de batería.');return false;}if(input.some(QBitsWorkshop.hasAdaptation)){announce('Retira las adaptaciones en la mesa antes de dividir o recomponer.');return false;}const plan=QBitsReconfiguration.plan(action,input);
 if(plan.error){announce(input.length?plan.error:'Deja las piezas necesarias dentro de ENTRADA y suéltalas.');return false;}
 const ids=new Set(plan.inputs),owners=groups.filter(g=>g.parts.some(p=>ids.has(p.id)));
 if(owners.some(g=>g.parts.some(p=>!ids.has(p.id)))||scenePartCount()-input.length+plan.outputs.length>MAX_QUBITS){announce('Separa la pieza o libera espacio antes de transformar.');return false;}
 s.job={...plan,time:0,duration:4,original:input,blocked:false};
 for(const g of owners)removeGroup(g);clearSelection();
 announce('Reconfigurando · la materia y la energía se conservan');updateCampaignObjective();return true;
}
function reconfigurationOutputPoses(s){return s.job.outputs.map((part,i)=>({...part,p:add(s.exit,V((i%3-1)*.17,unitGroundHeight(part.shape)+.005,Math.floor(i/3)*.17)),q:Q()}));}
function reconfigurationOutputClear(parts){
 if(scenePartCount()+parts.length>MAX_QUBITS)return false;
 return parts.every(p=>!groups.some(g=>poses(g).some(other=>obbOverlap(p,other,.000001)))&&!cargos.some(c=>obbOverlap(p,cargoPose(c),.000001))&&!storyWorld.walls.some(w=>obbOverlap(p,{p:w.p,q:w.q||Q(),half:w.half},.000001)));
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
 if(savedShapes.length>=64){announce('Libera un espacio entre tus formas guardadas.');return false;}
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
function suspendSceneAttributes(){for(const [location]of attributes)gl.disableVertexAttribArray(location);}
function restoreSceneProgram(){gl.useProgram(program);for(const [location]of attributes)gl.enableVertexAttribArray(location);boundGeometry=null;}
function applyVisualUniforms(){
 surfaceTexture?.bind(visuals);gl.uniform1i(uniforms.uSurface,2);gl.uniform1f(uniforms.uTextureMix,surfaceTexture?1:0);
 gl.uniform1f(uniforms.uTextureScale,visuals.textureScale);gl.uniform1f(uniforms.uWarp,visuals.warp/100);gl.uniform1f(uniforms.uJitter,visuals.jitter/100);gl.uniform2f(uniforms.uResolution,canvas.width,canvas.height);gl.uniform1f(uniforms.uCel,visuals.cel);gl.uniform1f(uniforms.uLighting,visuals.lighting/100);gl.uniform1f(uniforms.uShadows,visuals.shadows==='off'?0:1);
}
function setPhysicsEquation(equation,stiffness,relaxation){
 equation.qbitsSpook={stiffness,relaxation};equation.setSpookParams(stiffness,relaxation,FIXED_STEP);
}
function applyPhysicsRate(hz){
 const step=1/hz;if(step===FIXED_STEP)return;FIXED_STEP=step;accumulator=0;
 for(const constraint of world.constraints)for(const equation of constraint.equations)if(equation.qbitsSpook){const {stiffness,relaxation}=equation.qbitsSpook;equation.setSpookParams(stiffness,relaxation,step);}
}
function applyPreferences(next){
 cullingLab.lastFrame=null;cullingLab.frameSamples.length=0;
 resetGameInputs();
 savedPreferences=preferences.sanitize(next);tabletPreferences();visuals=preferences.effective(savedPreferences);applyPhysicsRate(savedPreferences.physicsHz);
 window.qbitsSelectionHud?.setHint?.('Mantén '+inputLabel('hud')+' para elegir · Ctrl + clic para quitar');
 window.QBitsSubtitles?.apply(savedPreferences);
 window.QBitsGuideAudio?.configure(savedPreferences);window.QBitsFootsteps?.configure(savedPreferences);window.QBitsJoinAudio?.configure(savedPreferences);
 for(const b of encounterBubbles)b.size=null;
 for(const slot of speech.slots)slot.sizeDirty=true;
 window.QBitsMusic?.setVolume(savedPreferences.volume/100);window.QBitsMusic?.setMuted(!savedPreferences.music);
 restoreSceneProgram();resize();redraw=true;
}
function initSettingsScreen(){
 if(settingsScreen||!window.QBitsSettings)return;
 settingsScreen=window.QBitsSettings.init({capabilities:{anisotropy:surfaceTexture?.maxAnisotropy||1},
  open(){
   closeCommandMenu(false);closeDetachMenu(false);gameMode('settings');pause(false);panel.hidden=true;
   // The preview reuses the main GL canvas. Freeze the actual room first so
   // transparent settings never reveal a stretched second preview behind them.
   restoreSceneProgram();resize();renderScene();
   const backdrop=document.querySelector('#settings-room-backdrop'),ctx=backdrop.getContext('2d');
   const scale=Math.min(1,Math.sqrt(1200000/(canvas.width*canvas.height)));
   backdrop.width=Math.max(1,Math.round(canvas.width*scale));backdrop.height=Math.max(1,Math.round(canvas.height*scale));
   if(ctx){ctx.fillStyle='#e7eeea';ctx.fillRect(0,0,backdrop.width,backdrop.height);ctx.drawImage(canvas,0,0,backdrop.width,backdrop.height);}
   backdrop.hidden=false;
  },
  close(mode){
   const backdrop=document.querySelector('#settings-room-backdrop');backdrop.hidden=true;backdrop.width=backdrop.height=1;
   visuals=preferences.effective(savedPreferences);previewViewport=null;restoreSceneProgram();resize();gameMode(mode);redraw=true;
  },
  apply:applyPreferences
 });
 for(const id of ['main-settings','pause-settings'])document.querySelector('#'+id).addEventListener('click',()=>{if(story.ready&&!story.transition)settingsScreen.open(story.mode);});
}
function drawWorldTriangles(data,color){
 if(!data.length)return;gl.bindBuffer(gl.ARRAY_BUFFER,lineGeometry);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);boundGeometry=null;bindGeometry(lineGeometry);gl.uniform1f(uniforms.uKind,3);setPose(V(),Q(),V(1,1,1));tint(...color);submitDraw(gl.TRIANGLES,0,data.length/6);
}
function wideLineTriangles(points,width=1,data=[]){
 const basis=cullingLab.renderView?.basis||cameraBasis(),eye=cullingLab.renderView?.eye||camera,h=previewViewport?.height||canvas.clientHeight;data.length=0;
 for(let i=0;i+1<points.length;i+=2){const a=points[i],b=points[i+1],pa=projectWithBasis(a,basis,eye),pb=projectWithBasis(b,basis,eye);if(!pa||!pb)continue;
  const dx=pb.x-pa.x,dy=pb.y-pa.y,len=Math.hypot(dx,dy);if(len<.01)continue;
  const nx=-dy/len,ny=-dx/len,ax=basis.right.x*nx+basis.up.x*ny,ay=basis.right.y*nx+basis.up.y*ny,az=basis.right.z*nx+basis.up.z*ny;
  const sa=width*pa.depth/(heldFocus.focal*h),sb=width*pb.depth/(heldFocus.focal*h),oa=[ax*sa,ay*sa,az*sa],ob=[ax*sb,ay*sb,az*sb];
  data.push(a.x+oa[0],a.y+oa[1],a.z+oa[2],0,1,0,a.x-oa[0],a.y-oa[1],a.z-oa[2],0,1,0,b.x+ob[0],b.y+ob[1],b.z+ob[2],0,1,0,
   b.x+ob[0],b.y+ob[1],b.z+ob[2],0,1,0,a.x-oa[0],a.y-oa[1],a.z-oa[2],0,1,0,b.x-ob[0],b.y-ob[1],b.z-ob[2],0,1,0);
 }
 return data;
}
function drawWideLines(points,color,width=1){
 drawWorldTriangles(wideLineTriangles(points,width),color);
}
function drawSelectionMarker(anchor,time){
 const basis=cullingLab.renderView?.basis||cameraBasis(),projected=projectWithBasis(anchor,basis,cullingLab.renderView?.eye||camera);if(!projected)return;const h=previewViewport?.height||canvas.clientHeight;
 const unit=2*projected.depth/(heldFocus.focal*h),float=visuals.markerMotion?Math.sin(time*2)*3:0;
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
  bindGeometry(geometry);gl.uniform1f(uniforms.uKind,0);submitDraw(gl.TRIANGLES,0,vertices.length/6);
  // White panels close the sample room around the rotating specimen.
  drawBox(V(0,1.4,-1.5),Q(),V(5,2.8,.03),[.94,.95,.94,1]);drawBox(V(-1.6,1.4,0),Q(),V(.03,2.8,4),[.91,.93,.92,1]);
  const q=Q();q.setFromAxisAngle(V(0,1,0),time*.00028);const center=V(0,.3,0),size=V(.6,.6,.6);
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
  if(visuals.shadows==='sharp')drawProjectedShadow(unitProfile('cube').vertices.map(p=>add(center,q.vmult(mul(p,.6/CUBE_SIZE)))));
  else if(visuals.shadows==='soft'){bindGeometry(shadowGeometry);gl.uniform1f(uniforms.uKind,2);setPose(V(0,.001,0),Q(),V(1.45,1,1.45));gl.uniform1f(uniforms.uScale,1.45);gl.uniform1f(uniforms.uShadow,.32);submitDraw(gl.TRIANGLES,0,6);}
  gl.depthMask(true);gl.disable(gl.BLEND);bindGeometry(cubeGeometry);gl.uniform1f(uniforms.uKind,1);setPose(center,q,size);submitDraw(gl.TRIANGLES,0,36);
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);drawOutline(center,q,size,1,true);if(visuals.markers)drawSelectionMarker(V(0,.67,0),time/1000);gl.depthMask(true);gl.disable(gl.BLEND);
  drawNeonPath([V(-.1,.006,.65),V(.8,.006,.65),V(.8,.006,.65),V(.8,.006,-.5)]);
  drawPowerRibbon([V(-.75,.008,.55),V(-.75,.008,-.45),V(-.2,.008,-.45)],[...visualRGB('cableColor'),1]);
  if(destination){suspendSceneAttributes();postEffects.end(visuals);restoreSceneProgram();}
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
 if(focusPass.quad)deleteRenderBuffer(focusPass.quad);
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
 submitDraw(gl.TRIANGLE_STRIP,0,4);
 gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,null);
 gl.disableVertexAttribArray(focusPass.location);gl.useProgram(program);for(const [location]of attributes)gl.enableVertexAttribArray(location);
 boundGeometry=null;gl.enable(gl.DEPTH_TEST);
}

initSpeech();
let previousTime = performance.now();
function radialGlassFrame(time){
  const visible=!!unitRadial?.isGlassVisible&&story.mode==='playing';
  const opacity=visible?unitRadial.getGlassOpacity(time):0;
  const panels=visible?unitRadial.getGlassPanels():[];
  // The room is paused under the selector. Only material state/fades or a
  // genuine scene change need a fresh GPU capture; model previews use 2D.
  const stamp=panels.length?canvas.width+':'+canvas.height+':'+canvas.clientWidth+':'+canvas.clientHeight+':'+opacity.toFixed(4)+':'+panels.map(p=>[p.hovered,p.selected,p.locked].join(',')).join(';'):'';
  return {panels,opacity,stamp};
}
// Diagnostic controls belong to the test bench; the render optimization also
// applies in campaign. The observer never replaces the player's camera/rays.
function beginVisibilityFrame(){
 syncVirtualConveyors();
 renderVisibility.active=true;renderVisibility.enabled=!!visibilityFrustum&&(cullingLab.benchmark?cullingLab.benchmark.enabled:visuals.culling!==false);renderVisibility.serial++;
 renderVisibility.groups=groups.length;renderVisibility.culled=renderVisibility.pieces=renderVisibility.hiddenPieces=renderVisibility.shadowGroups=0;
 if(renderVisibility.enabled)visibilityFrustum.set(camera,yaw,pitch,canvas.width/canvas.height,heldFocus.focal,Math.max(.02,window.QBitsCulling.psxGuardBand(canvas.width,canvas.height,visuals.jitter/100)));
 if(cullingLab.stats||cullingLab.observer||cullingLab.benchmark)for(const g of groups){renderVisibility.pieces+=g.parts.length;if(!renderGroupVisible(g)){renderVisibility.culled++;renderVisibility.hiddenPieces+=g.parts.length;}}
}
function cullingObserverView(){
 const right=V(Math.cos(yaw),0,-Math.sin(yaw)),forward=V(-Math.sin(yaw),0,-Math.cos(yaw));
 const eye=[clamp(camera[0]-forward.x*4+right.x*3,-13.5,13.5),clamp(camera[1]+3,.4,13.5),clamp(camera[2]-forward.z*4+right.z*3,-13.5,13.5)];
 const target=add(V(...camera),mul(forward,1.7)),d=sub(target,V(...eye));d.normalize();const y=Math.atan2(-d.x,-d.z),p=Math.asin(d.y);
 return {eye,yaw:y,pitch:p,basis:{forward:d,right:V(Math.cos(y),0,-Math.sin(y)),up:V(Math.sin(y)*Math.sin(p),Math.cos(p),Math.cos(y)*Math.sin(p))}};
}
function drawCullingObserver(){
 const wasActive=renderVisibility.active,wasCounting=renderCounts.active;renderVisibility.active=false;renderCounts.active=false;
 try{
  gl.uniform1f(uniforms.uJitter,0);
  const q=Q();q.setFromAxisAngle(V(0,1,0),yaw);const p=V(position[0],0,position[2]);
  drawBox(add(p,V(0,.96,0)),q,V(.34,.64,.18),[.16,.30,.34,1]);
  drawBox(add(p,V(0,posture.height-.08,0)),q,V(.22,.22,.22),[.3,.62,.66,1]);
  for(const side of [-1,1])drawBox(add(p,q.vmult(V(side*.105,.35,0))),q,V(.12,.7,.14),[.16,.30,.34,1]);
  const b=cameraBasis(),origin=V(...camera),depth=8,h=depth/heldFocus.focal,w=h*canvas.width/canvas.height,center=add(origin,mul(b.forward,depth));
  const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>add(center,add(mul(b.right,x*w),mul(b.up,y*h))));
  const lines=[];for(let i=0;i<4;i++)lines.push(origin,corners[i],corners[i],corners[(i+1)%4]);
  gl.disable(gl.DEPTH_TEST);drawLines(lines,[.1,.61,.66,1]);drawLines([origin,add(origin,mul(b.forward,2))],[.85,.4,.1,1]);gl.enable(gl.DEPTH_TEST);
 }finally{renderVisibility.active=wasActive;renderCounts.active=wasCounting;gl.uniform1f(uniforms.uJitter,visuals.jitter/100);}
}
function toggleCulling(){
 if(cullingLab.benchmark)return false;
 savedPreferences.culling=visuals.culling===false;visuals=preferences.effective(savedPreferences);
 try{window.localStorage.setItem(preferences.KEY,JSON.stringify(savedPreferences));}catch{}
 cullingLab.lastFrame=null;cullingLab.frameSamples.length=0;redraw=true;announce('Culling '+(visuals.culling?'activado':'desactivado')+' · física y máquinas siguen activas');updateCullingHud(true);return visuals.culling;
}
function toggleCullingObserver(){
 if(cullingLab.benchmark||story.scene!=='lab'||story.mode!=='playing'||story.transition||held||creationPreview||shelfPreview||radialOpen()){announce('Observador: entra al banco y suelta o cancela la pieza primero.');return false;}
 cullingLab.observer=!cullingLab.observer;cullingLab.stats=true;cullingLab.lastFrame=null;cullingLab.frameSamples.length=0;resetGameInputs();finishMarquee(true);redraw=true;
 document.body.dataset.cullingObserver=String(cullingLab.observer);announce(cullingLab.observer?'Observador · WASD y mouse mueven al jugador · 7 numérico para volver':'Vista del jugador');updateCullingHud(true);return cullingLab.observer;
}
function toggleCullingStats(){cullingLab.stats=!cullingLab.stats;cullingLab.lastFrame=null;cullingLab.frameSamples.length=0;updateCullingHud(true);redraw=true;return cullingLab.stats;}
function startCullingBenchmark(){
 if(disassemblyJobs.length){announce('A/B: espera a que termine el desarme.');return false;}
 if(cullingLab.benchmark)return false;
 if(story.scene!=='lab'||story.mode!=='playing'||story.transition||held||creationPreview||shelfPreview||radialOpen()||settingsScreen?.isOpen){announce('A/B: entra al banco y suelta o cancela la pieza primero.');return false;}
 resetGameInputs();cullingLab.observer=false;document.body.dataset.cullingObserver='false';cullingLab.stats=true;cullingLab.result=null;cullingLab.lastFrame=null;
 cullingLab.gpu?.dispose();cullingLab.gpu=null;
 cullingLab.benchmark={phase:0,frame:0,enabled:false,order:[false,true,true,false],off:[],on:[],config:{width:canvas.width,height:canvas.height,shadows:visuals.shadows,style:visuals.style,pieces:scenePartCount()}};
 panel.hidden=true;menu.hidden=true;commandMenu.hidden=true;accumulator=0;redraw=true;updateCullingHud(true);return true;
}
function finishCullingBenchmark(cancelled=false){
 const bench=cullingLab.benchmark;if(!bench)return;
 if(!cancelled){const summary=rows=>({samples:rows.length,cpu:window.QBitsCulling.summarize(rows.map(r=>r.cpuMs)),calls:window.QBitsCulling.summarize(rows.map(r=>r.calls)),triangles:window.QBitsCulling.summarize(rows.map(r=>r.triangles)),hidden:window.QBitsCulling.summarize(rows.map(r=>r.hiddenPieces))});cullingLab.result={off:summary(bench.off),on:summary(bench.on),config:bench.config};}
 cullingLab.benchmark=null;cullingLab.lastFrame=null;cullingLab.frameSamples.length=0;cullingLab.gpu?.dispose();cullingLab.gpu=null;accumulator=0;previousTime=performance.now();redraw=true;updateCullingHud(true);
 if(cancelled)announce('Comparación cancelada · configuración conservada');
}
function cancelCullingBenchmark(){finishCullingBenchmark(true);}
function advanceCullingBenchmark(time){
 const b=cullingLab.benchmark;if(!b)return;
 if(document.hidden||story.mode!=='playing'||story.scene!=='lab'||story.transition){cancelCullingBenchmark();return;}
 b.enabled=b.order[b.phase];renderScene(time);if(b.frame>=12)(b.enabled?b.on:b.off).push({...cullingLab.last});b.frame++;
 if(b.frame>=48){b.frame=0;b.phase++;if(b.phase===b.order.length)finishCullingBenchmark();}
}
function updateCullingHud(force=false){
 const el=document.querySelector('#culling-hud');if(!el)return;
 el.hidden=!(cullingLab.stats||cullingLab.observer||cullingLab.benchmark)||story.mode!=='playing';
 document.querySelector('#culling-toggle').textContent='Culling: '+(visuals.culling===false?'desactivado':'activado');
 if(el.hidden||(!force&&performance.now()<cullingLab.nextHud))return;cullingLab.nextHud=performance.now()+300;
 const r=cullingLab.last,b=cullingLab.benchmark,fmt=n=>Number.isFinite(n)?n.toFixed(2):'—';
 const lines=[cullingLab.observer?'OBSERVADOR · frustum del jugador':'RENDIMIENTO · vista del jugador'];
 lines.push('Simulación: '+savedPreferences.physicsHz+' pasos/s');
 if(b)lines.push('A/B · escena congelada · '+(b.phase+1)+'/4 · culling '+(b.enabled?'ON':'OFF')+' · Esc cancela');
 else lines.push('Culling '+(visuals.culling===false?'OFF':'ON')+' · / alternar · Num7 observador · Num8 panel · Num9 A/B');
 if(r){lines.push('Q-bits omitidos: '+r.hiddenPieces+'/'+r.pieces+' · conjuntos '+r.culled+'/'+r.groups);lines.push('Dibujo escena: '+r.calls+' llamadas · '+Math.round(r.triangles)+' triángulos');lines.push('CPU render: '+fmt(r.cpuMs)+' ms · simulación: '+(b?'pausada':fmt(cullingLab.simulationMs)+' ms'));}
 const samples=window.QBitsCulling.summarize(cullingLab.frameSamples);if(samples.count&&!b)lines.push('Fotograma p50 / p95: '+fmt(samples.median)+' / '+fmt(samples.p95)+' ms · '+fmt(1000/samples.mean)+' FPS');
 if(!b)lines.push('GPU: '+(cullingLab.gpu?.supported?fmt(cullingLab.gpu.latestMs)+' ms':'no disponible'));
 if(cullingLab.observer)lines.push('Avatar y cámara externa añaden coste · líneas: tramo de 8 m · alcance real 60 m');
 lines.push('Física, energía y máquinas continúan fuera de cámara.');
 const result=cullingLab.result;if(result){const off=result.off,on=result.on;lines.push('A/B final · misma escena · '+result.config.pieces+' piezas · '+result.config.width+'×'+result.config.height);lines.push('OFF → ON · llamadas '+Math.round(off.calls.median)+' → '+Math.round(on.calls.median)+' · triángulos '+Math.round(off.triangles.median)+' → '+Math.round(on.triangles.median));lines.push('CPU render p50: '+fmt(off.cpu.median)+' → '+fmt(on.cpu.median)+' ms · p95: '+fmt(off.cpu.p95)+' → '+fmt(on.cpu.p95));lines.push('72 muestras por modo · sin física ni observador. No mide FPS ni tiempo GPU.');}
 el.textContent=lines.join('\n');
}
for(const [id,action]of [['culling-toggle',toggleCulling],['culling-observer',()=>{const enabled=toggleCullingObserver();if(enabled){panel.hidden=true;captureMouse();}}],['culling-stats',toggleCullingStats],['culling-benchmark',startCullingBenchmark]])document.querySelector('#'+id).addEventListener('click',action);

function renderScene(time=performance.now()){
  const measured=cullingLab.stats||cullingLab.observer||!!cullingLab.benchmark,start=measured?performance.now():0;
  beginVisibilityFrame();renderCounts.active=measured;renderCounts.calls=renderCounts.triangles=renderCounts.lines=0;
  if(measured&&!cullingLab.benchmark){cullingLab.gpu??=window.QBitsCulling.createGpuTimer(gl);cullingLab.gpu.poll();cullingLab.gpu.begin();}
  cullingLab.renderView=cullingLab.observer&&story.mode==='playing'&&story.scene==='lab'?cullingObserverView():null;
  try{
  const destination=postEffects?.begin(canvas.width,canvas.height,visuals)||null;
  const focused=!cullingLab.renderView&&heldFocus.amount>.001&&ensureFocusPass();
  restoreSceneProgram();applyVisualUniforms();
  gl.bindFramebuffer(gl.FRAMEBUFFER,focused?focusPass.scene.framebuffer:destination);
  gl.viewport(0,0,focused?focusPass.width:canvas.width,focused?focusPass.height:canvas.height);
  gl.uniform1f(uniforms.uFocal,heldFocus.focal);
  updateAccentLights();
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.uniform3fv(uniforms.uCamera,cullingLab.renderView?.eye||camera);
  gl.uniform2f(uniforms.uLook,cullingLab.renderView?.yaw??yaw,cullingLab.renderView?.pitch??pitch);
  bindGeometry(geometry);
  gl.uniform1f(uniforms.uKind,0);
  submitDraw(gl.TRIANGLES,0,vertices.length/6);
  drawStoryWorld();drawQubits();drawStoryGlass();
  if(cullingLab.renderView)drawCullingObserver();
  if(focused)compositeHeldFocus(destination);
  if(destination){suspendSceneAttributes();postEffects.end(visuals);restoreSceneProgram();if(measured){const passes=visuals.bloom&&visuals.bloomStrength>0?3:1;renderCounts.calls+=passes;renderCounts.triangles+=passes*2;}}
  const glass=radialGlassFrame(time);
  if(glass.panels.length&&radialGlass){
    suspendSceneAttributes();
    const success=radialGlass.render(canvas.width,canvas.height,canvas.clientWidth,canvas.clientHeight,glass.panels.map(panel=>({...panel,opacity:glass.opacity})));
    radialGlassAllocated=success;
    unitRadial.setGlassActive(success);
    restoreSceneProgram();
  }else{
    if(radialGlassAllocated){radialGlass.release();radialGlassAllocated=false;}
    unitRadial?.setGlassActive(false);
  }
  if((!panel.hidden||panel.dataset.stowing) && tabletPose && story.mode==='playing'){
    const progress=clamp((time-tabletMotionStart)/170,0,1);
    const lift=tabletReducedMotion.matches?0:28*(panel.hidden?progress*progress:(1-progress)**2);
    panel.style.translate=lift?('0 '+lift+'px'):'none';
    suspendSceneAttributes();
    drawTabletMesh??=window.QBitsTabletView.renderer(gl,shader,submitDraw);
    drawTabletMesh(lift?{...tabletPose,y:tabletPose.y+lift}:tabletPose);restoreSceneProgram();
  }
  radialGlassStamp=glass.stamp;
  redraw=false;
  }finally{
   renderVisibility.active=false;renderCounts.active=false;cullingLab.renderView=null;
   if(measured&&!cullingLab.benchmark)cullingLab.gpu?.end();
  }
  if(measured){
   cullingLab.last={cpuMs:performance.now()-start,calls:renderCounts.calls,triangles:renderCounts.triangles,groups:renderVisibility.groups,culled:renderVisibility.culled,pieces:renderVisibility.pieces,hiddenPieces:renderVisibility.hiddenPieces};
   if(!cullingLab.benchmark&&!storySuspended()&&!story.transition){if(cullingLab.lastFrame!==null){const dt=time-cullingLab.lastFrame;if(dt>0){cullingLab.frameSamples.push(dt);if(cullingLab.frameSamples.length>180)cullingLab.frameSamples.shift();}}cullingLab.lastFrame=time;}else cullingLab.lastFrame=null;
   updateCullingHud();
  }
}
// Keep the fractional time between display refreshes. Resetting the clock
// to "now" on every draw makes a 60 FPS cap run at 48 on a 144 Hz screen.
function visualFrameDue(time,fps){
 if(!fps){lastVisualFrame=time;return true;}
 const period=1000/fps,elapsed=time-lastVisualFrame;
 const periods=Math.floor((elapsed+.5)/period);
 if(periods<1)return false;
 lastVisualFrame+=periods*period;
 return true;
}
let panelNextRead=0,panelActiveStamp='';
function liveMechanismPanel(time){
 if(panel.hidden||document.querySelector('#page-mechanisms').hidden){panelActiveStamp='';return;}
 if(time<panelNextRead)return;panelNextRead=time+200;
 const sensor=selectedSensor(),arm=robotPanelSubject().arm,belt=conveyorPanelSubject(),flight=flightPanelSubject(),members=controlRotors();
 const stamp=[arm?.running,arm?.jogging,belt?.running,belt&&conveyorLine(belt).every(c=>c.running),flight?.enabled,sensor&&sensorTargetBusy(sensorTarget(sensor.part)),...members.map(r=>r.enabled)].join('|');
 if(panelActiveStamp!==stamp){if(panelActiveStamp)updateMechanismPanel();panelActiveStamp=stamp;}
 if(sensor)liveSensorPanel(sensor);
 if(arm){
  const signal=robotArmSignal(arm);document.querySelector('#arm-status').textContent=robotArmStatus(arm);
  document.querySelector('#arm-indicator').dataset.state=signal;document.querySelector('#arm-indicator-label').textContent={waiting:'Esperando objeto',running:'Encendido',off:'Apagado',blocked:'Trabado'}[signal];
  document.querySelector('#arm-cycles').textContent=String(arm.cycles);
  const gripHit=robotGripperHit(arm.gripperId),supply=gripperSupply(gripHit),joints=robotArmRotors(arm);
  const ids=new Set([arm.gripperId,...arm.joints.flatMap(j=>[j.aId,j.bId])]);
  const energy=supply.active?supply.storedJ:[...ids].reduce((sum,id)=>{const p=rotorPart(id)?.part;return sum+(p?p.mood.energy*gameBatteryCapacity(p):0);},0);
  document.querySelector('#arm-energy').textContent=Math.round(energy)+' J';
  const grip=robotGrips.get(arm.gripperId),capacity=robotLiftCapacity(gripHit.part.mood.gripper,joints);
  document.querySelector('#arm-load').textContent=formatWeight(grip?.weight||0)+' / '+capacity+' u';
  const phase={wait:'detect',carry:'move',return:'return',home:'return',grab:'grab',release:'release'}[arm.state];
  for(const name of ['detect','grab','move','release','return']){
   const node=document.querySelector('#arm-phase-'+name),active=arm.running&&phase===name;node.dataset.active=String(active);node.setAttribute('aria-current',active?'step':'false');
  }
  const joint=joints[Number(document.querySelector('#arm-motor-axis').value)||0];
  if(joint)document.querySelector('#arm-live-speed').textContent='Motor '+joint.rpm+' rpm · eje '+Math.abs(joint.actualRpm||0).toFixed(1)+' rpm reales';
 }
 if(belt){
  document.querySelector('#conveyor-status').textContent=conveyorStatus(belt);
  document.querySelector('#conveyor-energy').textContent=Math.round(externalBatterySummary(rotorPart(belt.baseId).g).storedJ)+' J';
  document.querySelector('#conveyor-load').textContent=formatWeight(belt.load)+' / '+belt.capacity+' u';
  const motors=conveyorRotors(belt),speed=motors.reduce((n,r)=>n+Math.abs(r.actualRpm||0)*Math.PI*CUBE_SIZE/60,0)/Math.max(1,motors.length);
  document.querySelector('#conveyor-speed').textContent=speed.toFixed(2)+' m/s';
 }
 if(flight?.enabled)updateFlightPanel();
 if(selectedRotor()?.servo&&selectedRotor().enabled)updateServoPanel();
 if(members.length)document.querySelector('#rotor-technical-readout').textContent=rotorPowerDescription(members[0]);
}
function frame(time) {
  if (!running) return;
  if(cullingLab.benchmark){advanceCullingBenchmark(time);requestAnimationFrame(frame);return;}
  const dt = Math.min(Math.max((time - previousTime) / 1000, 0), 0.05);
  let distance = 0;
  previousTime = time;
  window.QBitsGuideAudio?.setPaused(storySuspended()||!!story.transition);window.QBitsFootsteps?.setPaused(document.hidden||storySuspended()||!!story.transition);window.QBitsJoinAudio?.setPaused(document.hidden||storySuspended()||!!story.transition);
  pollGamepadInput(dt);
  updateSelectionHud(dt);
  if(radialGlassFrame(time).stamp!==radialGlassStamp)redraw=true;
  if(settingsScreen?.isOpen){
    accumulator=0;
    if(!document.hidden && visualFrameDue(time,30))renderSettingsPreview(time);
    requestAnimationFrame(frame);return;
  }
  if(radialOpen()){
    accumulator=0;if(!unitRadialAllowed())closeUnitRadial(false);
    updateHeldFocus(dt,false);if(redraw&&!document.hidden)renderScene(time);
    requestAnimationFrame(frame);return;
  }
  tickStory(dt);
  liveMechanismPanel(time);
  const frozen=storySuspended()||!!story.transition;
  if(tabletVisible()){
   const near=tabletNearBench();
   if(workshopPanel?.isOpen&&!near){closeWorkshopPanel(false);switchPanelTab(tabletTab);}
   if(tabletEl('tablet-workshop').disabled===near)syncTabletMode();
  }
  const active=(gameInputActive()||tabletVisible())&&!document.hidden&&!frozen;
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
  if(shelfPreview&&!frozen){updateShelfPlacement(wallAim());redraw=true;}
  if(creationPreview&&!frozen){updateCreationPlacement();redraw=true;}
  if(robotPoseDraft&&!frozen&&!document.hidden){accumulator=0;updateRobotPoseDraft(time);updateTarget();}
  else if (!document.hidden&&!frozen) {
    const simulationStart=cullingLab.stats?performance.now():0;
    window.QBitsFootsteps?.update(camera,yaw,walkingAudioGroups(),dt);window.QBitsJoinAudio?.update(camera,yaw,dt);
    accumulator += dt;
    let simulatedDt=0;
    while (accumulator >= FIXED_STEP) { stepPhysics(FIXED_STEP); accumulator -= FIXED_STEP; simulatedDt+=FIXED_STEP; }
    updateDisassembly(dt);
    updateBatteryLiquids(simulatedDt);
    updateTarget();
    updateSpeech();updateStoryMarker();
    if(cullingLab.stats)cullingLab.simulationMs=performance.now()-simulationStart;
    redraw = true;
  }
  if (redraw && !document.hidden && visualFrameDue(time,visuals.fps)) {
    renderScene(time);
  }
  requestAnimationFrame(frame);
}
let gamePrepared=false;
const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
window.QBitsGame={
  culling:{toggle:toggleCulling,toggleObserver:toggleCullingObserver,toggleStats:toggleCullingStats,benchmark:startCullingBenchmark,cancel:cancelCullingBenchmark,snapshot:()=>({enabled:visuals.culling!==false,observer:cullingLab.observer,stats:cullingLab.stats,benchmark:!!cullingLab.benchmark,last:cullingLab.last,result:cullingLab.result})},
  quickWake,
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

