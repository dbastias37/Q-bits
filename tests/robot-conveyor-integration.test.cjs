const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
function tick(t,n=12){for(let i=0;i<n;i++)t.stepPhysics(1/240);}
function setup(){
 const {t}=createGame();t.clearNarrativeScene();Object.assign(t.story,{ready:false,scene:'lab',mode:'playing',phase:'idle'});
 assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight'),t.V()));const conveyor=t.conveyors[0];
 assert(t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V(2,0,0)));const arm=t.robotArms[0];
 const source=t.rotorPart(arm.baseId).g,target=t.rotorPart(conveyor.baseId),from=t.poses(source).filter(p=>p.part.shape==='cube').sort((a,b)=>a.p.x-b.p.x||b.p.z-a.p.z)[0];
 const shift=target.p.vadd(t.V(0,.09,0)).vsub(from.p),before=t.groups.flatMap(g=>g.parts.map(p=>p.id)).sort((a,b)=>a-b);
 assert(t.weld({source,target:target.g,position:source.body.position.vadd(shift),quaternion:t.Q()}),'arm must physically weld above a complete square rail face');
 assert.deepEqual(t.groups.flatMap(g=>g.parts.map(p=>p.id)).sort((a,b)=>a-b),before);assert.equal(t.rotors.length,7);assert.equal(t.robotArms.length,1);assert.equal(t.conveyors.length,1);
 let base=t.rotorPart(conveyor.baseId),batteryPoint=t.V(.225,.318,.27),g=t.makeGroup([{id:t.allocateUnitId(),shape:'cube',weight:1,p:batteryPoint,q:t.Q()}]),part=g.parts[0];part.mood.energy=.9;part.mood.externalBattery={version:1,ownerId:part.id,packId:part.id,enabled:true};
 assert(t.weld({source:g,target:base.g,position:g.body.position.clone(),quaternion:t.Q()}),'one real battery attaches to the free opposite rail face');
 const cell=t.rotorPart(part.id).part,body=t.rotorPart(conveyor.baseId).g.body;assert.equal(t.rotorPart(arm.baseId).g.body,body);assert.equal(t.rotors.length,7);assert.equal(body.type,1);assert.equal(body.fixedRotation,false);assert.equal(t.groups.flatMap(g=>g.parts).length,57);
 return {t,arm,conveyor,cell,body};
}
for(const first of ['arm','conveyor'])test(`a real welded arm and conveyor share one anchor safely when ${first} starts and stops first`,()=>{
 const {t,arm,conveyor,cell,body}=setup(),originalMass=body.mass;
 const poses=()=>t.groups.map(g=>({id:g.body.id,p:[g.body.position.x,g.body.position.y,g.body.position.z],q:[g.body.quaternion.x,g.body.quaternion.y,g.body.quaternion.z,g.body.quaternion.w]}));
 const start={arm:()=>t.startRobotArm(arm),conveyor:()=>t.startConveyor(conveyor)},stop={arm:()=>t.stopRobotArm(arm),conveyor:()=>t.stopConveyor(conveyor)},second=first==='arm'?'conveyor':'arm';
 assert(start[first](),first==='arm'?arm.status:conveyor.status);tick(t);assert.equal(body.type,4);
 assert(start[second](),second==='arm'?arm.status:conveyor.status);const energy=cell.mood.energy;tick(t,24);
 assert(arm.running,arm.status);assert(conveyor.running,conveyor.status);assert.equal(body.type,4);assert(cell.mood.energy<energy,'both mechanisms draw from the single attached battery');
 const beforeFirstStop=poses();stop[first]();assert.deepEqual(poses(),beforeFirstStop,'stopping changes constraint targets without moving bodies');tick(t,6);assert.equal(body.type,4,'the other active controller retains the shared chassis');assert(first==='arm'?conveyor.running:arm.running);
 const beforeFinalStop=poses();stop[second]();assert.deepEqual(poses(),beforeFinalStop,'the final brake and anchor release do not teleport any part');assert.equal(body.type,1,'last owner restores original dynamic body');assert.equal(body.fixedRotation,false);assert.equal(body.mass,originalMass);assert.equal(t.rotors.length,7);assert.equal(t.robotArms.length,1);assert.equal(t.conveyors.length,1);
 assert(t.mechanismSnapshot(t.rotorPart(conveyor.baseId).g),'combined machine remains saveable after both controllers stop');
});
test('a welded conveyor and arm report distinct loads while sharing the same body and battery',()=>{
 const {t,arm,conveyor}=setup(),members=t.robotArmRotors(arm),motor=members[1];
 t.configureRotor(motor,{capacity:2},true);
 for(const rotor of members)assert.equal(t.rotorPowerState(rotor).load,0);
 assert.equal(t.rotorPowerState(t.conveyorRotors(conveyor)[0]).load,57);
 assert.match(t.rotorPowerDescription(motor),/Carga en la pinza 0\.0 \/ 2 u/);
 const point=t.robotKinematics(arm).point;
 const payload=t.addQubit([point.x,point.y-.06,point.z],2);
 assert(t.gripperGrab(arm.gripperId));
 assert.equal(t.rotorPowerState(motor).load,2);
 assert.equal(t.rotorPowerState(t.conveyorRotors(conveyor)[0]).load,59);
 payload.parts[0].weight=3;
 tick(t,1);
 assert.equal(t.robotArmSignal(arm),'blocked');
 assert.match(arm.status,/Hombro.*objeto de 3\.0 u/);
 assert.equal(t.robotGrips.size,0);
 assert.equal(t.rotorPowerState(motor).load,0);
});
