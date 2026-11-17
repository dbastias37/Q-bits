const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');

function setup(distance = .4) {
  const game = createGame(), {t, sandbox} = game;
  t.clearNarrativeScene();for (const g of [...t.groups]) t.removeGroup(g);
  t.story.ready = false;sandbox.document.pointerLockElement = t.canvas;
  const look = t.getLook(), camera = t.V(...look.camera);
  const forward = t.V(-Math.sin(look.yaw) * Math.cos(look.pitch), Math.sin(look.pitch), -Math.cos(look.yaw) * Math.cos(look.pitch));
  const point = camera.vadd(forward.scale(distance)), g = t.addQubit([point.x, point.y, point.z]);
  t.grabQubit({g, part:g.parts[0], point:g.body.position.clone(), distance});
  assert(t.getHeld());
  return {...game, g, camera, forward};
}
function settle(t, enabled=true) {for(let i=0;i<30;i++)t.updateHeldFocus(.05,enabled);}
function element(game, id){return game.sandbox.document.querySelector('#'+id);}

test('carried energy bars are hidden at distance and appear smoothly only when the actual piece is near', () => {
  const game = setup(2), {t,g,camera,forward} = game;
  settle(t);t.updateMoodCallout(t.getHeld());t.updateMoodSelection();
  assert.equal(t.heldFocus.amount,0);
  for(const id of ['mood-held-labels','mood-energy-track','mood-energy-label'])assert.equal(element(game,id).hidden,true,id);
  // Scrolling closer cannot reveal an object that has not reached the hand yet.
  for(let i=0;i<24;i++)t.handleWheel({deltaY:100,preventDefault(){}});
  assert(t.getHeld().distance<.4);
  settle(t);assert.equal(t.heldFocus.amount,0);
  g.body.position.copy(camera.vadd(forward.scale(.35)));
  t.updateHeldFocus(.05);
  assert(t.heldFocus.amount>0&&t.heldFocus.amount<.5,'focus eases in instead of jumping');
  settle(t);t.updateMoodCallout(t.getHeld());
  assert(t.heldFocus.amount>.99);
  for(const id of ['mood-held-labels','mood-energy-track','mood-energy-label'])assert.equal(element(game,id).hidden,false,id);
  assert.equal(element(game,'mood-energy-fill').style.width,Math.round(g.parts[0].mood.energy*100)+'%');
});

test('scroll distance controls a bounded FOV and all screen projection/ray math follows it', () => {
  const game = setup(), {t,camera} = game;
  const offCenter = t.screenRay(810,260), world = camera.vadd(offCenter.scale(.8));
  const original = t.project(world);assert(Math.abs(original.x-810)<1e-8);
  settle(t);
  const focused = t.project(world);
  assert(focused.x>original.x,'the close inspection lens is narrower');
  assert(t.heldFocus.focal>1.73&&t.heldFocus.focal<=1/Math.tan(Math.PI/6));
  const ray=t.screenRay(focused.x,focused.y), roundTrip=t.project(camera.vadd(ray.scale(.8)));
  assert(Math.abs(roundTrip.x-focused.x)<1e-8&&Math.abs(roundTrip.y-focused.y)<1e-8);
  for(let i=0;i<30;i++)t.handleWheel({deltaY:-100,preventDefault(){}});
  settle(t);assert(t.heldFocus.amount<.00001);assert.equal(t.heldFocus.focal,1.48256097);
});

test('release, pause, loss of capture, and the Q menu remove held HUD and return the lens smoothly', () => {
  for(const mode of ['release','pause','unlock','radial']){
    const game=setup(),{t,sandbox}=game;settle(t);assert(t.heldFocus.amount>.99);
    if(mode==='release')t.releaseQubit();
    if(mode==='pause'){t.story.ready=true;t.story.mode='pause';}
    if(mode==='unlock')sandbox.document.pointerLockElement=null;
    if(mode==='radial'){t.releaseQubit();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});assert(t.openUnitRadial());}
    t.updateHeldFocus(.05);
    assert(t.heldFocus.amount>0&&t.heldFocus.amount<.8,mode+' eases out');
    assert.equal(element(game,'mood-held-labels').hidden,true,mode);
    if(t.getHeld())assert.equal(element(game,'mood-energy-track').hidden,true,mode);
    settle(t);assert.equal(t.heldFocus.amount,0,mode);
    if(mode==='radial'){assert(t.heldFocus.focal>1.8,'Q has its own close lens');t.closeUnitRadial(false);settle(t);}
    assert.equal(t.heldFocus.focal,1.48256097);
  }
});

test('focus GPU resources are created only near a held piece and unsupported targets fall back safely', () => {
  const {t}=setup(2);
  t.canvas.width=1280;t.canvas.height=720;
  t.renderScene();assert.equal(t.focusPass.program,null,'the normal view allocates no focus targets');
  // Default harness cannot create framebuffer attachments: exercise the real fallback.
  t.getHeld().distance=.3;t.getHeld().g.body.position.copy(t.V(...t.getLook().camera));
  settle(t);t.renderScene();assert.equal(t.focusPass.failed,true);
  assert(t.heldFocus.focal>1.73,'the usable lens remains available after GPU fallback');
  assert.equal(t.focusPass.program,null);assert.equal(t.focusPass.scene,null);assert.equal(t.focusPass.mask,null);
  assert.doesNotThrow(()=>t.renderScene());
});

test('focus mask shares scene depth, survives resizing, and restores normal render state', () => {
  const {t}=setup(),gl=t.canvas.getContext('webgl'),calls=[];
  for(const name of ['createRenderbuffer','createTexture','createFramebuffer'])gl[name]=()=>({name,id:calls.length+Math.random()});
  gl.checkFramebufferStatus=()=>gl.FRAMEBUFFER_COMPLETE;
  for(const name of ['bindFramebuffer','framebufferRenderbuffer','renderbufferStorage','depthFunc','depthMask','useProgram','activeTexture','bindTexture','viewport'])gl[name]=(...args)=>calls.push({name,args});
  t.canvas.width=1280;t.canvas.height=720;settle(t);t.renderScene();
  assert.equal(t.focusPass.failed,false);
  assert.equal(t.focusPass.width,1920);assert.equal(t.focusPass.height,1080,'1× screens receive modest edge supersampling');
  const depths=calls.filter(c=>c.name==='framebufferRenderbuffer');
  assert.equal(depths.length,2);assert.equal(depths[0].args[3],depths[1].args[3],'both targets use the same occlusion depth');
  assert.equal(calls.filter(c=>c.name==='bindFramebuffer').at(-1).args[1],null,'composite finishes on the canvas');
  assert.equal(calls.filter(c=>c.name==='depthMask').at(-1).args[0],true);
  const sceneTexture=t.focusPass.scene.texture,maskTexture=t.focusPass.mask.texture;
  t.canvas.width=960;t.canvas.height=540;t.renderScene();
  assert.equal(t.focusPass.width,1440);assert.equal(t.focusPass.height,810);
  assert.deepEqual(calls.filter(c=>c.name==='viewport').at(-1).args,[0,0,960,540],'the output viewport returns to the visible canvas');
  assert.equal(t.focusPass.scene.texture,sceneTexture);assert.equal(t.focusPass.mask.texture,maskTexture,'resize reuses target ownership');
  assert.equal(calls.filter(c=>c.name==='renderbufferStorage').length,2);
  t.canvas.width=2560;t.canvas.height=1440;t.renderScene();
  assert.equal(t.focusPass.width,2560);assert.equal(t.focusPass.height,1440,'retina keeps its existing 2× density');
});

function supportedGPU(t, maxSize=8192){
  const gl=t.canvas.getContext('webgl');
  for(const name of ['createRenderbuffer','createTexture','createFramebuffer'])gl[name]=()=>({name});
  gl.getParameter=()=>maxSize;gl.checkFramebufferStatus=()=>gl.FRAMEBUFFER_COMPLETE;
  return gl;
}
test('extra edge sampling respects pixel and hardware budgets without reducing native resolution', () => {
  for(const size of [[1920,1080],[3840,2160]]){
    const {t}=setup();supportedGPU(t);t.canvas.width=t.canvas.clientWidth=size[0];t.canvas.height=t.canvas.clientHeight=size[1];
    assert(t.ensureFocusPass());
    assert(t.focusPass.width>=size[0]&&t.focusPass.height>=size[1]);
    if(size[0]*size[1]<=4500000)assert(t.focusPass.width*t.focusPass.height<=4500000);
    else {assert.equal(t.focusPass.width,size[0]);assert.equal(t.focusPass.height,size[1]);}
  }
  const {t}=setup();supportedGPU(t,1500);t.canvas.width=1280;t.canvas.height=720;
  assert(t.ensureFocusPass());assert(t.focusPass.width<=1500&&t.focusPass.height<=1500);
});

test('a failed extra-sampling allocation retries native once and keeps the focus effect', () => {
  const {t}=setup(),gl=supportedGPU(t);let checks=0,allocations=0;
  gl.checkFramebufferStatus=()=>++checks===1?-1:gl.FRAMEBUFFER_COMPLETE;
  gl.renderbufferStorage=()=>allocations++;
  t.canvas.width=1280;t.canvas.height=720;
  assert(t.ensureFocusPass());assert.equal(t.focusPass.failed,false);assert.equal(t.focusPass.nativeOnly,true);
  assert.equal(t.focusPass.width,1280);assert.equal(t.focusPass.height,720);assert.equal(allocations,2);
  assert(t.ensureFocusPass());assert.equal(allocations,2,'a rejected supersample is not retried every frame');
});
