const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

function setup(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;}
function grab(game,g){const {t}=game;t.grabQubit({g,part:g.parts[0],point:g.body.position.clone(),distance:.6});assert(t.getHeld());return t.getHeld().items[0];}
function aimAt(t,target){const held=t.getHeld(),camera=t.V(...t.getLook().camera),dir=t.screenRay(640,360);held.rootOffset=target.vsub(camera.vadd(dir.scale(held.distance)));}

test('hand target stops before a thin solid, slides along it, and can pull away',()=>{
 const game=setup(),{t}=game;t.storyWall(t.V(0,1,0),t.V(.4,.4,.008));const g=t.addQubit([0,1,.08]),item=grab(game,g);
 const stopped=t.safeGripSweep(item,t.V(0,1,-.4));assert(stopped.z>=.0525,'target cannot pass the front face');
 const slide=t.safeGripSweep(item,t.V(.06,1,-.4));assert(slide.x>.005,'a blocked forward request still permits sideways motion');assert(slide.z>=.0525);
 const away=t.safeGripSweep(item,t.V(0,1,.14));assert(away.z>.13);
});

test('rotated furniture uses its true surfaces instead of filling the bounding box',()=>{
 const game=setup(),{t}=game,q=t.Q();q.setFromAxisAngle(t.V(0,1,0),Math.PI/4);
 const wall=t.storyWall(t.V(0,1,0),t.V(.3,.3,.008),{q});const g=t.addQubit([.14,1,.14]),item=grab(game,g);
 const hit=t.safeGripSweep(item,t.V(-.14,1,-.14));const normal=q.vmult(t.V(0,0,1));assert(hit.dot(normal)>.071,'stops outside the tilted face');
 g.body.position.set(.18,1,-.02);const free=t.safeGripSweep(item,t.V(.23,1,-.02));assert(free.x>.229,'empty area inside a broad-phase AABB remains usable');
 assert(wall.q,'the collider stores its orientation');
});

test('an unheld body blocks the grab sweep while held assembly members remain free',()=>{
 const game=setup(),{t}=game;const g=t.addQubit([0,1,.1]),other=t.addQubit([0,1,0],4),item=grab(game,g);
 const stopped=t.safeGripSweep(item,t.V(0,1,-.1));assert(stopped.z>=.0895);
 t.getHeld().items.push({g:other,anchor:t.V()});const together=t.safeGripSweep(item,t.V(0,1,.01));assert(together.z<.02,'own articulated members are not treated as external walls');
});

test('rotation of a long held body is limited before it cuts through a shelf',()=>{
 const game=setup(),{t}=game;t.storyWall(t.V(0,1,.15),t.V(.5,.4,.012));
 const g=t.makeGroup(Array.from({length:5},(_,i)=>({id:100+i,shape:'cube',weight:1,p:t.V((i-2)*.09,1,0),q:t.Q()}))),item=grab(game,g),desired=t.Q();desired.setFromAxisAngle(t.V(0,1,0),Math.PI/2);
 const safe=t.safeGripRotation(item,desired);assert(Math.abs(safe.y)<Math.abs(desired.y)-.1,'rotation stops before a long end crosses the shelf');
 assert(t.validPose(g,g.body.position,safe),'last accepted pose is clear');
});

test('real grab constraints cannot pull a cube through the table or launch it on release',()=>{
 const game=setup(),{t}=game;t.storyWall(t.V(0,.6,0),t.V(.6,.02,.4));const g=t.addQubit([0,.73,0]);grab(game,g);aimAt(t,t.V(.18,.2,0));
 let lowest=Infinity,peak=0;
 for(let i=0;i<360;i++){t.stepPhysics(1/120);lowest=Math.min(lowest,t.bounds(g).min.y);peak=Math.max(peak,g.body.velocity.norm());}
 assert(lowest>.617,'table remains an impassable top surface');assert(g.body.position.x>.1,'piece can slide over the top');
 t.releaseQubit();let highest=g.body.position.y;for(let i=0;i<240;i++){t.stepPhysics(1/120);highest=Math.max(highest,g.body.position.y);}
 assert(highest<.72,'releasing a blocked hand does not eject the cube');assert(t.bounds(g).min.y>.617);assert(g.body.velocity.norm()<.05);assert(peak<2);
});

test('real grab constraints do not tunnel through a narrow vertical panel after a fast view change',()=>{
 const game=setup(),{t}=game;t.settings.gravity=0;t.world.gravity.set(0,0,0);t.storyWall(t.V(0,1,0),t.V(.5,.5,.006));const g=t.addQubit([0,1,.16]);grab(game,g);aimAt(t,t.V(0,1,-1));
 let near=Infinity;for(let i=0;i<360;i++){t.stepPhysics(1/120);near=Math.min(near,t.bounds(g).min.z);}
 assert(near>.003,'cube stays on the starting side of the thin panel');assert(g.body.velocity.norm()<.05);
});

test('a constrained long body turns up to a wall without swinging through it',()=>{
 const game=setup(),{t}=game;t.settings.gravity=0;t.world.gravity.set(0,0,0);const wall=t.storyWall(t.V(0,1,.15),t.V(.5,.4,.012));
 const g=t.makeGroup(Array.from({length:5},(_,i)=>({id:200+i,shape:'cube',weight:1,p:t.V((i-2)*.09,1,0),q:t.Q()})));grab(game,g);aimAt(t,g.body.position.clone());
 t.keys.add('ShiftLeft');t.getHeld().rotation.setFromAxisAngle(t.V(0,1,0),Math.PI/2);let turned=false;
 for(let i=0;i<240;i++){t.stepPhysics(1/120);turned||=Math.abs(g.body.quaternion.y)>.1;assert(!t.poses(g).some(p=>t.obbOverlap(p,{p:wall.p,q:wall.q,half:wall.half},.003)),'turning cannot cut the long end through the wall');}
 assert(turned,'the guard permits the available arc before contact');assert(g.body.angularVelocity.norm()<.2);
});
