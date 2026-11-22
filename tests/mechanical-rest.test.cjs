const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const createGame=require('./game-harness.cjs');
let source=fs.readFileSync(process.env.REST_SOURCE||path.join(__dirname,'../assets/js/game.js'),'utf8');
source=source.replace('try{return solveRotorContacts.call(this,dt,physicsWorld);}','try{window.__restIterations.push(this.iterations);return solveRotorContacts.call(this,dt,physicsWorld);}');
const at=source.lastIndexOf('})();');source=source.slice(0,at)+'window.__restIterations=[];window.__restTest={floor,records:mechanicalRestRecords,supports:mechanicalFloorSupports,getStep:()=>mechanicalRestStep};'+source.slice(at);
function lab(hz=120){const game=createGame({graphics:false,gameSource:source}),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.applyPreferences({physicsHz:hz});return {...game,hz};}
function steps(game,seconds){for(let i=0;i<Math.round(seconds*game.hz);i++)game.t.stepPhysics(1/game.hz);}
function spawn(game,kind='rotor',height=0){const {t}=game;if(kind==='rotor')return t.spawnRotor(t.V(0,height,0));assert(t.spawnSavedMechanism(kind==='arm'?t.robotArmBlueprintTemplate():t.servoBlueprintTemplate(kind),t.V(0,height,0)));return t.rotors[0];}
function physical(t){return t.groups.filter(g=>!g.virtualConveyor);}
function transforms(t){return physical(t).map(g=>[...g.body.position.toArray(),...g.body.quaternion.toArray()]);}
function settled(game){assert(physical(game.t).every(g=>g.body.sleepState===2),'every member reaches Cannon sleep');assert(physical(game.t).every(g=>g.body.velocity.norm2()===0&&g.body.angularVelocity.norm2()===0),'sleep has no residual velocity');}
for(const hz of [60,120,240])for(const kind of ['rotor','pivot','hinge','arm'])test(`${kind} settles as a supported passive component at ${hz} Hz`,()=>{
 const game=lab(hz);spawn(game,kind);const ids=game.t.groups.flatMap(g=>g.parts.map(p=>p.id)),mass=physical(game.t).map(g=>g.body.mass);steps(game,3);settled(game);const before=transforms(game.t);steps(game,3);settled(game);assert.deepEqual(transforms(game.t),before,'rest has no pulses or drift');assert.deepEqual(game.t.groups.flatMap(g=>g.parts.map(p=>p.id)),ids);assert.deepEqual(physical(game.t).map(g=>g.body.mass),mass);assert(physical(game.t).every(g=>g.body.type===1));assert.equal(game.t.world.solver.iterations,24);
 if(kind==='arm'&&hz===60){assert(game.sandbox.__restIterations.includes(96));assert(game.sandbox.__restIterations.filter(x=>x>24).length<=180);assert(game.sandbox.__restIterations.slice(-60).every(x=>x===24));}
});
for(const action of ['force','impulse','torque'])test(`direct ${action} wakes the entire resting component before the next broadphase`,()=>{
 const game=lab(),{t}=game,r=spawn(game);steps(game,3);settled(game);const moving=t.rotorGroups(r)[1].body,before=transforms(t);
 if(action==='force')moving.applyForce(t.V(2,0,0),moving.position);else if(action==='impulse')moving.applyImpulse(t.V(.1,0,0),moving.position);else moving.torque.x=.02;
 steps(game,1/game.hz);assert(t.rotorGroups(r).every(g=>g.body.sleepState!==2));assert.notDeepEqual(transforms(t),before);
});
test('a real collision wakes a stopped mechanism and transfers momentum',()=>{
 const game=lab(),{t}=game,r=spawn(game);steps(game,3);settled(game);const before=t.rotorGroups(r)[1].body.position.clone(),projectile=t.addQubit([-.4,.17,0]);projectile.body.velocity.x=2;projectile.body.wakeUp();let awake=false;
 for(let i=0;i<60;i++){t.stepPhysics(1/game.hz);awake ||= t.rotorGroups(r).some(g=>g.body.sleepState!==2);}
 assert(awake);assert(t.rotorGroups(r)[1].body.position.distanceTo(before)>.003);
});
test('disconnecting the final sleeping joint lets its unsupported moving member fall',()=>{
 const game=lab(),{t}=game,r=spawn(game,'pivot');steps(game,3);settled(game);const moving=t.rotorGroups(r)[1],before=moving.body.position.y;
 t.disconnectRotor(r);steps(game,.5);assert(moving.body.position.y<before-.02,'the disconnected load falls under gravity');assert.equal(game.sandbox.__restTest.records.size,0);assert.equal(game.sandbox.__restTest.supports.size,0);
});
for(const action of ['remove','mask','shape','shape-response'])test(`changing floor ${action} invalidates a sleeping component's real support`,()=>{
 const game=lab(),{t,sandbox}=game,floor=sandbox.__restTest.floor;floor.position.y=1;floor.aabbNeedsUpdate=true;spawn(game,'rotor',1);steps(game,3);settled(game);const before=physical(t).map(g=>g.body.position.y);
 if(action==='remove')t.world.removeBody(floor);else if(action==='mask')floor.collisionFilterMask=0;else if(action==='shape-response')floor.shapes[0].collisionResponse=false;else{floor.shapes.length=0;floor.shapeOffsets.length=0;floor.shapeOrientations.length=0;floor.updateBoundingRadius();}
 steps(game,.15);assert(physical(t).every((g,i)=>g.body.position.y<before[i]-.03),'removing support cannot suspend the mechanism');
});
test('starting the motor after collective sleep releases the brake and turns again',()=>{
 const game=lab(),{t}=game,r=spawn(game);steps(game,3);settled(game);assert(t.configureRotor(r,{enabled:true}));steps(game,.5);assert(r.enabled);assert(Math.abs(r.actualRpm)>1);assert.equal(r.constraint.stopBrake.equation.enabled,false);
});
test('a falling assembly, zero friction, and an inclined floor never receive contextual sleep',()=>{
 for(const mode of ['fall','ice','slope']){const game=lab(),{t,sandbox}=game;if(mode==='ice')t.world.defaultContactMaterial.friction=0;if(mode==='slope')sandbox.__restTest.floor.quaternion.setFromAxisAngle(t.V(1,0,0),-Math.PI/2+.1);spawn(game,'rotor',mode==='fall'?2:0);const before=t.rotorGroups(t.rotors[0])[1].body.position.y;steps(game,.25);if(mode==='fall')assert(t.rotorGroups(t.rotors[0])[1].body.position.y<before-.1);assert([...sandbox.__restTest.records.values()].every(r=>!r.sleeping));}
});
test('scene reset clears rest cohorts, support history and pending step references immediately',()=>{
 for(const method of ['clearNarrativeScene','clearPuzzleScene']){const game=lab();spawn(game);steps(game,3);assert(game.sandbox.__restTest.records.size>0);game.t[method]();assert.equal(game.sandbox.__restTest.records.size,0);assert.equal(game.sandbox.__restTest.supports.size,0);assert.equal(game.sandbox.__restTest.getStep().length,0);}
});
function mountedFactory(game){
 const {t}=game;let first;
 for(const z of [-2,2]){let last;for(let i=0;i<21;i++){
  const record=t.conveyorBlueprintTemplate('straight'),q=t.Q();let point=t.V(-5,0,z);
  if(last){const placement=t.conveyorBlueprintPlacement(record,last);point=placement.point.clone();point.y-=.003;q.setFromAxisAngle(t.V(0,1,0),placement.quarterTurns*Math.PI/2);}
  const before=new Set(t.groups);assert(t.spawnSavedMechanism(record,point,q));const next=t.conveyors.at(-1);if(last)assert(t.joinCompletedConveyorBlueprint({conveyorLink:last.baseId},t.groups.filter(g=>!before.has(g))));first ||= next;last=next;
 }}
 assert(t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V(-10,0,8)));const arm=t.robotArms.at(-1),source=t.rotorPart(arm.baseId).g,target=t.rotorPart(first.baseId),from=t.poses(source).filter(p=>p.part.shape==='cube').sort((a,b)=>a.p.x-b.p.x||b.p.z-a.p.z)[0],shift=target.p.vadd(t.V(0,.09,0)).vsub(from.p);
 assert(t.weld({source,target:target.g,position:source.body.position.vadd(shift),quaternion:t.Q()}));
 return {arm,base:t.rotorPart(first.baseId).g,members:t.rotorConnectedGroups([t.rotorPart(arm.baseId).g])};
}
test('a mounted arm and 21 welded belts sleep with zero link velocity and coherent virtual rollers, then wake on impact and restart',()=>{
 const game=lab(120),{t}=game,{arm,base,members}=mountedFactory(game),real=members.filter(g=>!g.virtualConveyor),virtual=members.filter(g=>g.virtualConveyor),ids=members.flatMap(g=>g.parts.map(p=>p.id));
 assert.equal(real.length,5);assert.equal(virtual.length,63);steps(game,6);settled(game);const poses=transforms(t);steps(game,.5);assert.deepEqual(transforms(t),poses);
 for(const g of members){assert.equal(g.body.sleepState,2);assert.equal(g.body.velocity.norm2()+g.body.angularVelocity.norm2(),0,'projection cannot leave awake links or stale virtual velocities');}
 assert(game.sandbox.__restIterations.every(n=>n===24),'120 Hz does not need extra global solver work');assert.deepEqual(members.flatMap(g=>g.parts.map(p=>p.id)),ids);
 const target=t.rotorPart(arm.gripperId),projectile=t.addQubit([target.p.x,target.p.y+.6,target.p.z]);projectile.body.velocity.y=-1.5;let woke=false;
 for(let i=0;i<90;i++){t.stepPhysics(1/game.hz);if(real.every(g=>g.body.sleepState!==2)){woke=true;break;}}
 assert(woke,'a real falling cube wakes the complete mounted component');assert.equal(base.body.type,1);t.removeGroup(projectile);
 assert(t.jogRobotArm(arm,0,15));let turning=false;for(let i=0;i<60;i++){t.stepPhysics(1/game.hz);turning ||= t.robotArmRotors(arm).some(r=>Math.abs(r.actualRpm)>1);}
 assert(turning,'the actual arm motor starts again after collective rest');
});
