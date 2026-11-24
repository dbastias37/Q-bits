const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

// Observe the actual view sent by renderScene. GPU calls remain instrumented;
// these tests exercise input, frame scheduling and Cannon, not browser pixels.
function setup({crouched=false,holding=false}={}){
 const presentations=[],uniforms=new Map();
 const gl=new Proxy({
  getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0,
  getUniformLocation:(_,name)=>name,createBuffer:()=>({}),createShader:()=>({}),createProgram:()=>({}),isContextLost:()=>false,
  uniform1f:(name,value)=>uniforms.set(name,value),
  uniform3fv:(name,value)=>uniforms.set(name,Array.from(value)),
  uniform2f:(name,x,y)=>{
   uniforms.set(name,[x,y]);
   if(name==='uLook')presentations.push({yaw:x,pitch:y,camera:[...uniforms.get('uCamera')],focal:uniforms.get('uFocal')});
  }
 },{get:(target,name)=>name in target?target[name]:/^[A-Z_]+$/.test(name)?0:()=>{}});
 const game=createGame({gl,graphics:false}),{t,sandbox}=game;
 t.clearNarrativeScene();
 Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 t.applyPreferences({...sandbox.QBitsPreferences.defaults(),fps:60});
 const height=crouched?t.posture.crouchHeight:t.EYE_HEIGHT;
 t.posture.height=height;t.position.splice(0,3,0,height,0);
 t.setLook({camera:[0,height,0],yaw:3.1,pitch:-.1});
 if(crouched)t.keys.add('KeyC');
 let carried=null;
 if(holding){
  const point=t.V(...t.getLook().camera).vadd(t.screenRay(640,360).scale(.8));
  carried=t.addQubit([point.x,point.y,point.z]);
  t.grabQubit({g:carried,part:carried.parts[0],point:point.clone(),distance:.8});
  assert.equal(t.getHeld()?.g,carried);
 }
 t.resetSimulationClock(0);presentations.length=0;
 return {...game,presentations,carried};
}

const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const pointDistance=(a,b)=>Math.hypot(...a.map((value,index)=>value-b[index]));
function viewForward(t,view){return t.V(-Math.sin(view.yaw)*Math.cos(view.pitch),Math.sin(view.pitch),-Math.cos(view.yaw)*Math.cos(view.pitch));}

function assertRenderedAim(t,view){
 const look=t.getLook();
 assert(Math.abs(angleDelta(view.yaw,look.yaw))<1e-12,'render uses the current input orientation');
 assert.equal(view.pitch,look.pitch);
 assert(pointDistance(view.camera,look.camera)<1e-12,'render and interaction rays share the same eye position');
 assert.equal(view.focal,t.heldFocus.focal);
 const forward=viewForward(t,view),ray=t.screenRay(640,360);
 assert(forward.distanceTo(ray)<1e-12,'the center ray follows the rendered view');
 const point=t.V(...view.camera).vadd(forward.scale(1.2)),projected=t.project(point);
 assert(projected&&Math.abs(projected.x-640)<1e-8&&Math.abs(projected.y-360)<1e-8,'a point on the rendered center ray projects to the crosshair');
}

for(const scenario of [
 {name:'standing still while looking around',dx:-6,walking:false},
 {name:'walking while turning quickly',dx:-24,walking:true},
 {name:'crouched slow walking while turning quickly',dx:-24,walking:true,crouched:true},
 {name:'holding a cube while looking around',dx:-6,walking:false,holding:true}
]){
 test(`${scenario.name} presents continuous camera updates at jittered 60 Hz`,()=>{
  const game=setup(scenario),{t,sandbox,presentations,carried}=game;
  if(scenario.walking)t.keys.add('KeyW');
  const initial=t.getLook();let previous=initial,totalTravel=0;
  for(let frame=1;frame<=120;frame++){
   const time=frame*1000/60+(frame%2?.6:-.6);
   sandbox.document.dispatchEvent({type:'mousemove',movementX:scenario.dx,movementY:0,timeStamp:time});
   const before=presentations.length;t.frame(time);
   assert.equal(presentations.length,before+1,'the cap must not leave the camera on its previous image');
   const view=presentations.at(-1);
   assertRenderedAim(t,view);
   assert(Math.abs(angleDelta(view.yaw,previous.yaw)+scenario.dx*.002)<1e-12,'one input increment must not become a doubled turn on the next presentation');
   const travel=pointDistance(view.camera,previous.camera);totalTravel+=travel;
   assert(travel<.08,'walking and head movement cannot teleport the eye');
   if(!scenario.walking)assert(pointDistance(view.camera,initial.camera)<1e-12,'turning in place must not translate the eye');
   if(carried){
    assert.equal(t.getHeld()?.g,carried,'turning preserves the physical grip');
    const hand=t.getHeld().anchorBody.position,target=t.V(...view.camera).vadd(viewForward(t,view).scale(t.getHeld().distance));
    assert(hand.distanceTo(target)<.1,'the physical hand follows the rendered aim without a stale camera offset');
    assert(Number.isFinite(carried.body.position.x+carried.body.position.y+carried.body.position.z));
   }
   previous=view;
  }
  assert.equal(presentations.length,120);
  if(scenario.walking)assert(totalTravel>2,'the test must really walk while turning');
  if(scenario.crouched)assert(Math.abs(t.posture.height-t.posture.crouchHeight)<1e-12);
  // Conservation check: after the last mouse sample, looking does not add an
  // automatic turn. These geometry/input checks also passed before this fix.
  t.keys.delete('KeyW');const stoppedYaw=t.getLook().yaw;
  for(let frame=121;frame<=150;frame++){
   t.frame(frame*1000/60+(frame%2?.6:-.6));
   assert.equal(t.getLook().yaw,stoppedYaw);
  }
 });
}
