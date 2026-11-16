const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

function setup(speed,{many=false,gravity=0}={}){
 const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 t.applyPreferences({...sandbox.QBitsPreferences.defaults(),...(speed===undefined?{}:{grabSpeed:speed})});t.settings.gravity=gravity;t.world.gravity.set(0,-gravity,0);
 const groups=Array.from({length:many?3:1},(_,i)=>t.addQubit([0,1,i*.18]));t.setMultiSelection(groups);const group=groups[0];
 t.grabQubit({g:group,part:group.parts[0],point:group.body.position.clone(),distance:.6});assert.equal(t.getHeld().items.length,groups.length);
 return {...game,group,groups};
}
function aimAt(t,target){const held=t.getHeld();held.rootOffset=target.vsub(t.V(...t.getLook().camera).vadd(t.screenRay(640,360).scale(held.distance)));}
function arrival(speed,many=false){
 const game=setup(speed,{many}),{t,groups}=game;aimAt(t,t.V(1.2,1,0));let time=null,peak=0,overshoot=0;
 for(let i=0;i<480;i++){t.stepPhysics(1/240);peak=Math.max(peak,...groups.map(g=>g.body.velocity.norm()));overshoot=Math.max(overshoot,...groups.map(g=>g.body.position.x-1.2));if(time===null&&groups.every(g=>g.body.position.x>=1.17))time=(i+1)/240;}
 assert(time!==null,'physical bodies reach the destination');assert(overshoot<.01,'the response settles without a forward overshoot');
 for(const [index,g]of groups.entries()){assert(Math.abs(g.body.position.x-1.2)<.001);assert(Math.abs(g.body.position.z-index*.18)<.001);assert(g.body.velocity.norm()<.01);}
 return {time,peak,force:t.getHeld().joint.equations[0].maxForce};
}

for(const many of [false,true])test(`saved grab speed accelerates the real ${many?'three-body selection':'body'} without increasing force`,()=>{
 const slow=arrival(1,many),normal=arrival(2,many),fast=arrival(3.5,many);
 assert(normal.time<slow.time*.7,JSON.stringify({slow,normal,fast}));assert(fast.time<normal.time*.75);
 assert.equal(normal.force,slow.force);assert.equal(fast.force,slow.force);assert(fast.peak<6,'the global physical travel ceiling remains sufficient');
});

test('missing preference keeps the exact slow trajectory, and changing the preset never compounds response',()=>{
 const original=setup(),slow=setup(1);for(const game of [original,slow])aimAt(game.t,game.t.V(1.2,1,0));
 for(let i=0;i<150;i++){original.t.stepPhysics(1/240);slow.t.stepPhysics(1/240);assert(original.group.body.position.distanceTo(slow.group.body.position)<1e-12);assert(original.group.body.velocity.distanceTo(slow.group.body.velocity)<1e-12);}
 const {t,sandbox}=slow,item=t.getHeld().items[0],base=item.joint.equations.map(e=>({a:e.a,b:e.b,eps:e.eps,max:e.maxForce,min:e.minForce}));
 for(const speed of [3.5,2,3.5,1]){t.applyPreferences({...sandbox.QBitsPreferences.defaults(),grabSpeed:speed});for(let i=0;i<4;i++)t.updateGrab(1/240);for(const [i,equation]of item.joint.equations.entries()){
  assert.equal(equation.a,base[i].a*speed);assert.equal(equation.b,base[i].b);assert.equal(equation.eps,base[i].eps);assert.equal(equation.maxForce,base[i].max);assert.equal(equation.minForce,base[i].min);
 }}
});

for(const speed of [1,2,3.5])test(`grab speed ${speed} keeps floors and thin panels solid and releases without a stored burst`,()=>{
 const floor=setup(speed,{gravity:9.8});aimAt(floor.t,floor.t.V(.2,-1,0));
 for(let i=0;i<180;i++){floor.t.stepPhysics(1/120);assert(floor.t.bounds(floor.group).min.y>=.0009);}
 const game=setup(speed),{t,group}=game;t.storyWall(t.V(.3,1,0),t.V(.006,.5,.5));aimAt(t,t.V(1.2,1,0));
 for(let i=0;i<180;i++){t.stepPhysics(1/120);assert(t.bounds(group).max.x<.297,'the body cannot tunnel through the panel');}
 assert(group.body.velocity.norm()<.05);const point=group.body.position.clone();t.releaseQubit();
 for(let i=0;i<120;i++)t.stepPhysics(1/120);assert(group.body.position.distanceTo(point)<.01,'blocked release has no stored spring movement');assert(group.body.velocity.norm()<.01);
});

test('manipulation speed leaves the clock and an unrelated falling body unchanged',()=>{
 const samples=[];
 for(const speed of [1,2,3.5]){const game=setup(speed,{gravity:9.8}),{t}=game,free=t.addQubit([5,3,0]);aimAt(t,t.V(1.2,1,0));for(let i=0;i<30;i++)t.stepPhysics(1/120);samples.push({p:free.body.position.clone(),v:free.body.velocity.clone(),time:t.getSimTime()});}
 for(const sample of samples.slice(1)){assert(sample.p.distanceTo(samples[0].p)<1e-12);assert(sample.v.distanceTo(samples[0].v)<1e-12);assert.equal(sample.time,samples[0].time);}
});

for(const speed of [1,2,3.5])test(`dragging by a face while turning at speed ${speed} still respects a nearby solid`,()=>{
 const game=setup(speed),{t,group}=game;t.releaseQubit();
 const point=group.body.position.vadd(t.V(0,0,.045));t.grabQubit({g:group,part:group.parts[0],point,distance:.6});
 const wall=t.storyWall(t.V(.3,1,0),t.V(.006,.5,.5));aimAt(t,t.V(1.2,1,.045));
 t.keys.add('ShiftLeft');t.getHeld().rotation.setFromAxisAngle(t.V(0,1,0),Math.PI/4);
 // Use the game's fixed 240 Hz solver step for the coupled translation/rotation
 // contact. Coarser artificial timesteps overstate transient corner penetration.
 for(let i=0;i<480;i++){t.stepPhysics(1/240);assert(!t.poses(group).some(p=>t.obbOverlap(p,{p:wall.p,q:wall.q,half:wall.half},.001)),'the offset grip cannot turn a corner through the panel');}
 assert(group.body.position.x<.3);assert(group.body.velocity.norm()<.05);assert(group.body.angularVelocity.norm()<.2);
});
