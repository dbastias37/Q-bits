const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.world.gravity.set(0,0,0);return game;}
const step=(t,n)=>{for(let i=0;i<n*240;i++)t.stepPhysics(1/240);};
const near=(a,b,tol=1)=>assert(Math.abs(a-b)<tol,`${a} differs from ${b}`);
const inventory=t=>t.groups.flatMap(g=>g.parts.map(p=>({id:p.id,shape:p.shape,weight:p.weight,energy:p.mood.energy,name:p.mood.name}))).sort((a,b)=>a.id-b.id);
function extend(t,r,side){
 const group=t.rotorGroups(r)[side==='a'?0:1],part=group.parts.filter(p=>p.shape==='cube').at(-1),pose=t.rotorPart(part.id),direction=pose.q.vmult(t.V(side==='a'?-1:1,0,0));
 const point=pose.p.vadd(direction.scale(.096)),cube=t.makeGroup([{id:t.allocateUnitId(),shape:'cube',weight:.25,p:point,q:pose.q.clone()}]);
 t.grabQubit({g:cube,part:cube.parts[0],point,distance:.8});t.keys.add('ShiftLeft');const candidate=t.findSnap();assert(candidate&&!candidate.rotorTip,'extension uses an ordinary square weld');
 t.updateTarget();t.releaseQubit(true);t.keys.delete('ShiftLeft');t.refreshRotors();return cube.parts[0].id;
}
for(const kind of ['pivot','hinge'])for(const side of ['a','b'])test(`${kind} square weld on ${side} rebuilds its joint without losing pose, identity or brake`,()=>{
 const {t}=lab(),r=t.spawnSavedMechanism(t.servoBlueprintTemplate(kind),t.V(0,1,0));assert(r);t.configureServo(r,{target:25,mode:'once'});assert(t.startServo(r));step(t,3);t.configureRotor(r,{enabled:false});
 const angle=t.servoAngle(r),old=r.constraint,ids=[r.aId,r.bId],extra=extend(t,r,side);
 assert(t.rotors.includes(r));assert.deepEqual([r.aId,r.bId],ids);assert.notEqual(r.constraint,old);assert(!t.world.constraints.includes(old));assert(t.rotorGroups(r)[side==='a'?0:1].parts.some(p=>p.id===extra));
 near(t.servoAngle(r),angle,.1);step(t,.5);near(t.servoAngle(r),angle,.6);assert(r.constraint.stopBrake.equation.enabled);
 const a=t.rotorEndpoint(t.rotorPart(r.aId),r.servo,'a'),b=t.rotorEndpoint(t.rotorPart(r.bId),r.servo,'b');assert(a.point.distanceTo(b.point)<.003);
 t.configureServo(r,{target:-20,mode:'once'});assert(t.startServo(r));step(t,3);near(t.servoAngle(r),-20);
});
for(const kind of ['pivot','hinge'])test(`${kind} Shift shaking returns all original pieces and removes the servo`,()=>{
 const game=lab(),{t,sandbox}=game,r=t.spawnSavedMechanism(t.servoBlueprintTemplate(kind),t.V(0,1,0));assert(r);
 const hit=t.rotorPart(r.bId),before=inventory(t),old=r.constraint;t.grabQubit({g:hit.g,part:hit.part,point:hit.p,distance:.8});assert(t.getHeld());t.getHeld().age=.4;
 sandbox.document.dispatchEvent({type:'keydown',code:'ShiftLeft',repeat:false});
 for(let i=0;i<6;i++)sandbox.document.dispatchEvent({type:'mousemove',movementX:i%2?-60:60,movementY:0,timeStamp:1000+i*70});
 assert.equal(t.rotors.length,0);assert.equal(t.groups.length,before.length);assert(t.groups.every(g=>g.parts.length===1));assert.deepEqual(inventory(t),before);assert(!t.world.constraints.includes(old));assert.equal(t.world.constraints.length,1);assert.equal(t.getHeld().part.id,r.bId);
 assert.equal(t.findSnap(),null,'shaken pieces cannot instantly rejoin');
});
test('legacy arm registration cannot take ownership of a servo motor',()=>{
 const {t}=lab(),r=t.spawnSavedMechanism(t.servoBlueprintTemplate('pivot'),t.V(0,1,0)),hit=t.rotorPart(r.bId);assert(r);
 assert(t.configureGripper(hit.part,{mode:'any',capacity:1}));
 assert(t.registerRobotArm(r.bId)===null,'servo cannot register as a legacy arm');assert(t.createRobotArm({baseId:r.aId,gripperId:r.bId,joints:[r]})===null,'servo cannot enter arm controller');assert.equal(t.robotArms.length,0);
 assert(t.createConveyor({baseId:r.aId,joints:[r],kind:'straight'})===null,'servo cannot enter belt controller');assert.equal(t.conveyors.length,0);
});
