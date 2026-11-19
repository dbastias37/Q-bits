const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle',progress:{}});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;}
function step(t,n=240){for(let i=0;i<n;i++)t.stepPhysics(1/240);}
function gripper(t){const g=t.addQubit([0,.145,0]);assert(t.configureGripper(g.parts[0],{}));return g;}
test('gripper attaches one real solid at its active face, spends energy and releases its constraint',()=>{
 const {t}=lab(),g=gripper(t),cargo=t.addQubit([0,.05,0]),id=g.parts[0].id,before=g.parts[0].mood.energy;
 assert(t.gripperGrab(id));assert.equal(t.robotGrips.size,1);assert.equal(t.robotGrips.get(id).g,cargo);assert(g.parts[0].mood.energy<before);
 assert.equal(t.gripperGrab(id),false);const constraint=t.robotGrips.get(id).constraint;assert(t.world.constraints.includes(constraint));
 assert(t.releaseGripper(id));assert.equal(t.robotGrips.size,0);assert(!t.world.constraints.includes(constraint));assert(t.groups.includes(cargo));
});
test('gripper rejects wrong piece, excessive load and solids behind its face',()=>{
 const {t}=lab(),g=gripper(t),cargo=t.addQubit([0,.05,0],5),id=g.parts[0].id;
 assert.equal(t.gripperGrab(id),false);t.configureGripper(id,{capacity:8,mode:'piece',targetId:id});assert.equal(t.gripperGrab(id),false);
 t.configureGripper(id,{targetId:cargo.parts[0].id});assert(t.gripperGrab(id));t.releaseGripper(id);cargo.body.position.y=.24;assert.equal(t.gripperGrab(id),false);
});
test('gripper color and geometry filters work on colored solid cargo and complete forms',()=>{
 const {t}=lab(),g=gripper(t),id=g.parts[0].id,c=t.newCargo(t.V(0,0,0),1,1,'#ff0000');
 t.configureGripper(id,{mode:'color',color:'#00ff00'});assert.equal(t.gripperGrab(id),false);t.configureGripper(id,{color:'#ff0000'});assert(t.gripperGrab(id));
 t.releaseGripper(id);assert.equal(c.body.type,1);assert(c.robotPhysical,'released cargo falls instead of snapping to the floor');
 const a=t.makeGroup([{id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(1,.5,0),q:t.Q()},{id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(1.09,.5,0),q:t.Q()}]);
 const sig=t.gripperFormSignature(a),q=t.Q();q.setFromAxisAngle(t.V(0,1,0),.6);a.body.position.set(3,2,1);a.body.quaternion.copy(q);assert.equal(t.gripperFormSignature(a),sig);
 t.configureGripper(id,{mode:'form',formSignature:sig});assert(t.gripperMatches(g.parts[0].mood.gripper,{g:a,part:a.parts[0]}));
});
test('energy exhaustion and deleting a held payload remove the attachment safely',()=>{
 const {t}=lab(),g=gripper(t),cargo=t.addQubit([0,.05,0]),id=g.parts[0].id;assert(t.gripperGrab(id));g.parts[0].mood.energy=0;step(t,1);assert.equal(t.robotGrips.size,0);
 g.body.position.set(0,.145,0);cargo.body.position.set(0,.05,0);g.parts[0].mood.energy=.8;assert(t.gripperGrab(id));t.removeGroup(cargo);assert.equal(t.robotGrips.size,0);
});
function blueprintArm(t){assert(t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V(0,0,0)));for(const g of t.groups)for(const p of g.parts)p.mood.energy=1;return t.robotArms[0];}
function until(t,condition,limit=4800){for(let i=0;i<limit;i++){t.stepPhysics(1/240);if(condition())return i+1;}throw new Error('Simulation did not reach expected state');}
test('four real hinges execute the blueprint pick, rotate and release cycle under gravity',()=>{
 const {t}=lab(),arm=blueprintArm(t),hit=t.rotorPart(arm.gripperId),payload=t.addQubit([hit.p.x,.046,hit.p.z]),before=payload.body.position.clone(),ids=t.groups.flatMap(g=>g.parts.map(p=>p.id));
 t.configureRobotArm(arm,{repeat:false});assert(t.startRobotArm(arm));until(t,()=>arm.cycles===1||!arm.running);
 assert.equal(arm.cycles,1,arm.status);assert.equal(arm.status,'Ciclo completado');assert.equal(t.robotGrips.size,0);assert(payload.body.position.distanceTo(before)>.65);
 assert.deepEqual(t.groups.flatMap(g=>g.parts.map(p=>p.id)),ids,'transport does not create or consume matter');assert(t.robotArmRotors(arm).every(r=>!r.enabled));
 assert(t.rotorPart(arm.joints[0].aId).part.mood.energy<.98,'physical yaw spends energy');step(t,240);assert(t.bounds(payload).min.y>-.01);assert(payload.body.velocity.norm()<.1);
});
test('teaching with physical jog preserves the taught posture and the opposite pickup pose',()=>{
 const {t}=lab(),arm=blueprintArm(t),pick=JSON.stringify(arm.poses.pick);assert(t.jogRobotArm(arm,0,15));until(t,()=>!arm.jogging,1600);
 assert.match(arm.status,/Postura lista/);assert(Math.abs(t.robotTargetError(t.robotArmRotors(arm)[0],arm.target[0]))<.05);assert(t.teachRobotArmPose(arm,'place'));
 assert.equal(JSON.stringify(arm.poses.pick),pick);assert.notEqual(JSON.stringify(arm.poses.place),pick);const taught=arm.poses.place[0];step(t,120);assert(Math.abs(t.robotTargetError(t.robotArmRotors(arm)[0],taught))<.04,'passive brake keeps the taught angle');
 assert.equal(t.configureRotor(t.robotArmRotors(arm)[0],{enabled:true}),false,'legacy rotor controls cannot fight the arm brake');
});
test('empty power cuts off the whole running arm and releases the real payload',()=>{
 const {t}=lab(),arm=blueprintArm(t),hit=t.rotorPart(arm.gripperId);t.addQubit([hit.p.x,.046,hit.p.z]);assert(t.startRobotArm(arm));until(t,()=>t.robotGrips.size===1,480);
 const rotor=t.robotArmRotors(arm)[0];t.rotorPart(rotor.aId).part.mood.energy=0;step(t,2);assert.equal(arm.running,false);assert.equal(t.robotGrips.size,0);assert(t.robotArmRotors(arm).every(r=>!r.enabled));assert.match(arm.status,/energía|Motor/);
});
test('gripper does not attach through a thin wall or across a hollow form bounding box',()=>{
 const {t}=lab(),g=gripper(t),id=g.parts[0].id,cargo=t.addQubit([0,.05,0]);t.storyWall(t.V(0,.0975,0),t.V(.05,.001,.05));assert.equal(t.gripperGrab(id),false);
 t.removeGroup(cargo);const h=t.makeGroup([-.1,.1].map(x=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(x,.05,0),q:t.Q()})));assert.equal(t.gripperFaceDistance(t.rotorPart(id),{g:h}),Infinity);
});
test('registering another controller on an existing arm is rejected',()=>{
 const {t}=lab(),arm=blueprintArm(t),group=t.rotorPart(arm.gripperId).g,second=group.parts.find(p=>p.shape==='cube'&&p.id!==arm.gripperId);assert(second);assert(t.configureGripper(second,{}));
 assert.equal(t.createRobotArm({gripperId:second.id,baseId:arm.baseId,joints:t.robotArmRotors(arm)}),null);assert.equal(t.robotArms.length,1);
});
test('a wall blocks the transfer without tunnelling or silently completing a cycle',()=>{
 const {t}=lab(),arm=blueprintArm(t),hit=t.rotorPart(arm.gripperId),pivot=t.couplerTip(t.rotorPart(arm.joints[0].aId)).point,turn=t.Q();turn.setFromAxisAngle(t.V(0,1,0),Math.PI/4);
 const middle=pivot.vadd(turn.vmult(hit.p.vsub(pivot))),wall=t.storyWall(t.V(middle.x,.3,middle.z),t.V(.05,.3,.05));
 const opposite=pivot.vsub(middle.vsub(pivot));t.storyWall(t.V(opposite.x,.3,opposite.z),t.V(.05,.3,.05));
 t.addQubit([hit.p.x,.046,hit.p.z]);t.configureRobotArm(arm,{repeat:false});assert(t.startRobotArm(arm));until(t,()=>!arm.running,2400);
 assert.equal(arm.cycles,0);assert.equal(t.robotGrips.size,0);assert.match(arm.status,/bloqueado|energía/);assert(t.rotorPart(arm.gripperId).p.x<wall.p.x-wall.half.x,'wrist remains on the starting side of the obstruction');
});
test('a taught program survives saving a rotated mechanism with new rigid-body frames',()=>{
 const {t}=lab(),arm=blueprintArm(t);assert(t.jogRobotArm(arm,0,30));until(t,()=>!arm.jogging,2400);assert(t.teachRobotArmPose(arm,'place'));
 const source=t.rotorPart(arm.gripperId).g,record=t.mechanismSnapshot(source,'Brazo enseñado');assert(record,'aligned arm can be saved');assert(t.savedMechanismValid(record));
 const expected=JSON.stringify(record.robotArm.poses);assert(t.spawnSavedMechanism(record,t.V(2,0,0)));const copy=t.robotArms.find(a=>a!==arm);assert(copy);assert.equal(JSON.stringify(copy.poses),expected);
 for(const [i,r]of t.robotArmRotors(copy).entries())assert(Math.abs(t.robotTargetError(r,copy.poses.place[i]))<.055,'saved part frames retain the taught articulation');
 const snapshot=t.saveLab();assert.equal(snapshot.robotArms.length,2);assert.equal(t.robotArms.length,2);
});
test('repeat returns to the pickup posture and waits without reclaiming the delivered object',()=>{
 const {t}=lab(),arm=blueprintArm(t),hit=t.rotorPart(arm.gripperId),payload=t.addQubit([hit.p.x,.046,hit.p.z]);assert(t.startRobotArm(arm));until(t,()=>arm.cycles===1&&arm.state==='wait',2400);
 assert(arm.running);assert.equal(t.robotGrips.size,0);assert(payload.body.position.distanceTo(t.rotorPart(arm.gripperId).p)>.6);step(t,120);assert.equal(arm.cycles,1);assert.equal(arm.state,'wait');t.stopRobotArm(arm);
});
test('attaching an existing external battery preserves taught arm identities and powers motor and gripper',()=>{
 const {t}=lab(),arm=blueprintArm(t),base=t.rotorPart(arm.baseId).g,pick=JSON.stringify(arm.poses),corner=t.worldParts(base).filter(p=>p.shape==='cube').sort((a,b)=>b.p.x-a.p.x||a.p.z-b.p.z)[0],cell=t.addQubit([corner.p.x,corner.p.y+.09,corner.p.z]),id=cell.parts[0].id;
 cell.parts[0].mood.externalBattery={version:1,ownerId:id,packId:id,enabled:true};cell.parts[0].mood.energy=1;
 assert(t.weld({source:cell,target:base,position:cell.body.position.clone(),quaternion:cell.body.quaternion.clone()}));step(t,1);assert.equal(t.robotArms[0],arm);assert.equal(JSON.stringify(arm.poses),pick);assert.equal(arm.brakes.length,4);
 for(const r of t.robotArmRotors(arm)){t.rotorPart(r.aId).part.mood.energy=.1;t.rotorPart(r.bId).part.mood.energy=.1;}
 const hit=t.rotorPart(arm.gripperId);t.addQubit([hit.p.x,.046,hit.p.z]);t.configureRobotArm(arm,{repeat:false});assert(t.startRobotArm(arm));until(t,()=>arm.cycles===1||!arm.running,2400);assert.equal(arm.cycles,1,arm.status);assert(t.rotorPart(id).part.mood.energy<1);
 for(const r of t.robotArmRotors(arm))assert.equal(t.rotorPart(r.aId).part.mood.energy,.1,'external battery protects each motor reservoir');
});
test('rotor sets cannot bypass arm brakes and adjusting a running sequence stops it first',()=>{
 const {t}=lab(),arm=blueprintArm(t),members=t.robotArmRotors(arm),set=t.createRotorSet('Brazo',members),before=members.map(r=>t.rotorPart(r.aId).part.mood.energy);
 assert.equal(t.configureRotorSet(set,{enabled:true}),false);assert(members.every(r=>!r.enabled));assert.deepEqual(members.map(r=>t.rotorPart(r.aId).part.mood.energy),before);assert.equal(arm.brakes.length,4);
 const unrelated=t.spawnRotor(t.V(2,.4,0),{capacity:64}),mixed=t.createRotorSet('Mixto',[members[0],unrelated]);assert.equal(t.configureRotorSet(mixed,{enabled:true}),false);assert.equal(unrelated.enabled,false,'mixed command is rejected before starting unrelated motors');
 assert(t.startRobotArm(arm));step(t,2);assert(arm.running);assert(t.configureRotorSet(set,{rpm:24}));assert.equal(arm.running,false);assert.equal(arm.jogging,false);assert(members.every(r=>!r.enabled));assert(members.filter(r=>set.rotorIds.includes(r.id)).every(r=>r.rpm===24));
 assert(t.jogRobotArm(arm,0,15));assert(t.configureRotorSet(mixed,{capacity:80}));assert.equal(arm.jogging,false);assert(members.every(r=>!r.enabled));
});
test('an independent gripper spends real energy while stationary and recovers only after release',()=>{
 const {t}=lab(),g=gripper(t),id=g.parts[0].id;t.addQubit([0,.05,0]);assert(t.gripperGrab(id));const before=g.parts[0].mood.energy,capacity=t.gameBatteryCapacity(g.parts[0]);step(t,240);
 assert.equal(t.robotGrips.size,1);assert(Math.abs(g.parts[0].mood.energy-(before-.16/capacity))<1e-9,'holding one unit costs .16 joules per second without passive recharge');
 const spent=g.parts[0].mood.energy;t.releaseGripper(id);step(t,240);assert(g.parts[0].mood.energy>spent,'ordinary rest resumes after releasing the solid');
});
test('an independent externally powered gripper conserves its internal reserve',()=>{
 const {t}=lab(),g=t.makeGroup([{id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(0,.145,0),q:t.Q()},{id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(.09,.145,0),q:t.Q()}]),grip=g.parts[0],cell=g.parts[1];
 assert(t.configureGripper(grip,{}));grip.mood.energy=.3;cell.mood.externalBattery={version:1,ownerId:cell.id,packId:cell.id,enabled:true};cell.mood.energy=.5;t.addQubit([0,.05,0]);assert(t.gripperGrab(grip.id));const internal=grip.mood.energy,external=cell.mood.energy;step(t,240);
 assert.equal(t.robotGrips.size,1);assert.equal(grip.mood.energy,internal,'external supply prevents hidden regeneration of the grip reserve');assert(Math.abs(cell.mood.energy-(external-.16/1800))<1e-9);
 t.releaseGripper(grip.id);cell.mood.externalBattery.enabled=false;step(t,240);assert(grip.mood.energy>internal,'rest is restored after release and switching off the external supply');
});
test('changing a held solid cargo load updates its physical mass and releases an overloaded grip',()=>{
 const {t}=lab(),g=gripper(t),id=g.parts[0].id,cargo=t.newCargo(t.V(0,0,0),1,1,'#ff0000');assert(t.gripperGrab(id));assert.equal(t.robotGrips.get(id).weight,1);
 cargo.required=16;step(t,1);assert.equal(t.robotGrips.size,0);assert.equal(cargo.body.mass,4);assert.equal(cargo.robotHeld,undefined);assert(cargo.robotPhysical,'overloaded cargo keeps real free-fall physics');
});
