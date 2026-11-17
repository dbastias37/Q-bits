const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
function setup(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.world.gravity.set(0,0,0);return game;}
const step=(t,seconds,check=()=>{})=>{for(let i=0;i<seconds*240;i++){t.stepPhysics(1/240);check();}};
function legs(t,count=4){
 const C=.09,base=[],hips=[],knees=[],ends=[];
 for(let i=0;i<(count-1)*4+1;i++)base.push({id:t.allocateUnitId(),shape:'cube',weight:.25,p:t.V(i*C,1,0),q:t.Q()});
 for(let i=0;i<count;i++) {const id=t.allocateUnitId();hips.push(id);base.push({id,shape:'pyramid',weight:.1,p:t.V(i*4*C,1+C*.625,0),q:t.Q()});}
 t.makeGroup(base);
 for(let i=0;i<count;i++){
  const x=i*4*C,y=1+C*1.5,b=t.allocateUnitId(),a=t.allocateUnitId(),end=t.allocateUnitId(),qa=t.Q(),qb=t.Q();qa.setFromAxisAngle(t.V(0,0,1),-Math.PI/2);qb.setFromAxisAngle(t.V(0,0,1),Math.PI/2);
  t.makeGroup([{id:b,shape:'cube',weight:.25,p:t.V(x,y,0),q:t.Q()},{id:a,shape:'pyramid',weight:.1,p:t.V(x+C*.625,y,0),q:qa}]);
  t.makeGroup([{id:end,shape:'pyramid',weight:.1,p:t.V(x+C*1.375,y,0),q:qb}]);
  const hip=t.connectServoTips(hips[i],b,{kind:'pivot',maxTorque:4,capacity:2000}),knee=t.connectServoTips(a,end,{kind:'hinge',maxTorque:4,capacity:2000});assert(hip&&knee);ends.push(hip,knee);
 }
 for(const [i,r]of ends.entries())assert(t.configureServo(r,{min:-15,max:15,target:0,speed:i%2?30:60,direction:i%4<2?1:-1}));return ends;
}
test('eight joints start atomically, align, share one clock with opposed phases, and stop together',()=>{
 const {t}=setup(),rs=legs(t);assert.equal(t.servoMarchMembers(rs[0]).length,8);assert(t.startServoMarch(rs[0]));assert(rs.every(r=>r.enabled));const m=t.servoMarchFor(rs[0]);
 step(t,4);assert.equal(m.phase,'march');assert.equal(t.servoMarches.size,1);let maxError=0;
 step(t,3,()=>{assert(rs.every(r=>r.enabled));for(const r of rs){maxError=Math.max(maxError,Math.abs(t.servoAngle(r)-r.servoGoal));assert(Math.abs(t.servoAngle(r))<17);}assert(Math.abs(rs[0].servoGoal+rs[2].servoGoal)<1e-8);assert.equal(rs[0].servoGoal,rs[1].servoGoal);});
 assert(maxError<3,'actual bodies follow the common clock: '+maxError);assert(t.stopServoMarch(m));assert(rs.every(r=>!r.enabled&&r.constraint.stopBrake.equation.enabled));const before=rs.map(t.servoAngle);step(t,.25);rs.forEach((r,i)=>assert(Math.abs(t.servoAngle(r)-before[i])<1));assert.equal(t.servoMarches.size,0);
});
test('a powerless member prevents any partial start',()=>{const {t}=setup(),rs=legs(t,2);for(const id of [rs[3].aId,rs[3].bId])t.rotorPart(id).part.mood.energy=0;assert.equal(t.startServoMarch(rs[0]),false);assert(rs.every(r=>!r.enabled));assert.equal(t.servoMarches.size,0);});
test('power loss or disconnect stops every member',()=>{for(const action of ['power','disconnect']){const {t}=setup(),rs=legs(t,2);assert(t.startServoMarch(rs[0]));step(t,.2);if(action==='power'){for(const id of [rs[3].aId,rs[3].bId])t.rotorPart(id).part.mood.energy=0;step(t,1/240);}else t.disconnectRotor(rs[3]);assert(rs.every(r=>!r.enabled));assert.equal(t.servoMarches.size,0);}});
test('changing one starting end stops the whole march and survives save/recovery',()=>{const {t}=setup(),rs=legs(t,2);assert(t.startServoMarch(rs[0]));step(t,.1);assert(t.configureServo(rs[1],{direction:-1}));assert(rs.every(r=>!r.enabled));const record=t.mechanismSnapshot(rs[0],'Patas');assert(record);assert.equal(record.joints[1].servo.direction,-1);const copy=t.spawnSavedMechanism(record,t.V(3,1,0));assert(copy);assert.equal(t.servoMarches.size,0);assert(t.servoMarchMembers(copy).every(r=>!r.enabled));});
test('separate mechanisms do not start together and grabbing stops the connected one',()=>{const {t}=setup(),rs=legs(t,2),other=t.spawnSavedMechanism(t.servoBlueprintTemplate(),t.V(3,1,0));assert(other);assert(t.startServoMarch(rs[0]));assert(!other.enabled);const hit=t.rotorPart(rs[0].aId);t.grabQubit({g:hit.g,part:hit.part,point:hit.p,distance:.8});assert(t.getHeld());assert(rs.every(r=>!r.enabled));assert.equal(t.servoMarches.size,0);assert.equal(t.startServoMarch(rs[0]),false);});

test('a blocked initial pose stops the entire mechanism ',()=>{const {t}=setup(),rs=legs(t,2);for(const g of t.groups){g.body.type=2;g.body.mass=0;g.body.updateMassProperties();}assert(t.startServoMarch(rs[0]));step(t,4,()=>{for(const g of t.groups)for(const p of g.parts)p.mood.energy=1;});assert.equal(t.servoMarches.size,0);assert(rs.every(r=>!r.enabled));assert.match(rs[0].servoStatus,/bloqueado/);});

test('panel actions reach any connected knee and scene cleanup removes the march',()=>{
 const {t}=setup(),rs=legs(t,2),hit=t.rotorPart(rs[0].aId);t.setSelected({g:hit.g,part:hit.part});
 assert(t.servoMarchAction({type:'select',id:rs[3].id}));assert.equal(t.getSelected().part.id,rs[3].aId);
 assert(t.servoMarchAction({type:'phase',id:rs[3].id,direction:1}));assert.equal(rs[3].servo.direction,1);
 assert(t.servoMarchAction({type:'start'}));assert(rs.every(r=>r.enabled));assert(t.servoMarchAction({type:'stop'}));assert(rs.every(r=>!r.enabled));
 assert(t.servoMarchAction({type:'start'}));t.clearNarrativeScene();assert.equal(t.servoMarches.size,0);
});
