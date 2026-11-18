const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');

function lab() {
  const game = createGame();
  game.t.clearNarrativeScene();
  Object.assign(game.t.story, {ready:true, scene:'lab', mode:'playing', phase:'idle'});
  return game;
}

function armAt(t, recipe = t.robotArmBlueprintTemplate()) {
  assert(t.spawnSavedMechanism(recipe, t.V()));
  const arm = t.robotArms.at(-1);
  const grip = t.rotorPart(arm.gripperId);
  t.setSelected({g:grip.g, part:grip.part});
  return arm;
}

function aim(t, point) {
  const camera = [point.x, 1.05, point.z + .9];
  t.setLook({camera, yaw:0, pitch:Math.atan2(point.y - camera[1], .9)});
}

function stepUntil(t, done, seconds = 16) {
  for (let step = 0; step < seconds * 120; step++) {
    t.stepPhysics(1/120);
    if (done()) return;
  }
  assert.fail('Arm did not finish within ' + seconds + ' seconds');
}

test('gripper reach is adjustable from 1.8 to 5 cm and old configurations pick up at 5 cm', () => {
  const {t} = lab();
  const grip = t.addQubit([0,.185,0]), id = grip.parts[0].id;
  const payload = t.addQubit([0,.045,0]);
  assert(t.configureGripper(id));
  delete grip.parts[0].mood.gripper.reachCm;
  assert(t.gripperCheck(id,true).ok, 'an old save defaults to 5 cm');
  assert(t.configureGripper(id,{reachCm:1.8}));
  assert.equal(t.gripperCheck(id,true).code,'distance');
  assert.equal(t.gripperGrab(id),false);
  assert.equal(t.configureGripper(id,{reachCm:5.1}),false);
  assert.equal(t.configureGripper(id,{reachCm:1.7}),false);
  assert(t.configureGripper(id,{reachCm:5}));
  assert(t.gripperGrab(id), 'a 5 cm gap is eligible');
  t.releaseGripper(id);
  payload.body.position.y -= .001;
  assert.equal(t.gripperCheck(id,true).code,'distance');
  payload.body.position.y += .034;
  assert(t.configureGripper(id,{reachCm:1.8}));
  assert(t.gripperGrab(id));
});

test('an arm mounted on 780 u starts unloaded, gates the actual payload and adjusts the limiting axis in P', () => {
  const {t,sandbox} = lab(), recipe = t.robotArmBlueprintTemplate();
  const baseParts = recipe.groups[0].parts;
  const minX = Math.min(...baseParts.map(p=>p.p[0]));
  const minZ = Math.min(...baseParts.map(p=>p.p[2]));
  const firstKey = recipe.groups.flatMap(g=>g.parts).length;
  for (let i=0;i<252;i++) {
    const x = minX - .09*(i%18+1), z = minZ - .09*Math.floor(i/18);
    baseParts.push({key:firstKey+i,shape:'cube',weight:i===251?1:3,p:[x,.045,z],q:[0,0,0,1]});
  }
  const arm = armAt(t,recipe), members = t.robotArmRotors(arm);
  const base = t.rotorPart(arm.baseId).g;
  const assemblyWeight = t.rotorConnectedGroups([base]).flatMap(g=>g.parts).reduce((sum,p)=>sum+p.weight,0);
  assert.equal(assemblyWeight,780);
  assert(members.every(rotor=>t.rotorPowerState(rotor).load===0));
  t.updateRobotArmPanel();
  const field = name => sandbox.document.querySelector('#arm-'+name);
  assert.equal(field('load').textContent,'0 u / 4 u');
  field('motor-axis').value='1';
  field('motor-axis').dispatchEvent({type:'change'});
  field('motor-rpm').value='8';
  field('motor-torque').value='3.5';
  field('motor-capacity').value='2';
  field('apply-motor').dispatchEvent({type:'click'});
  assert.equal(members[1].rpm,8);
  assert.equal(members[1].maxTorque,3.5);
  assert.equal(members[1].capacity,2);
  assert.equal(t.robotPanelSnapshot().arm.capacity,2);
  assert.equal(field('load').textContent,'0 u / 2 u');
  assert(t.robotPanelAction('start').ok);
  assert.equal(t.robotArmSignal(arm),'running');
  stepUntil(t,() => arm.state==='wait',3);
  assert.equal(t.robotArmSignal(arm),'waiting');
  assert.equal(t.robotPanelAction('fitLoad').ok,false,'editing is locked during production');

  const grip = t.robotKinematics(arm).point;
  const object = t.addQubit([grip.x,t.unitGroundHeight('pyramid'),grip.z],3,'pyramid');
  assert.match(t.robotPanelAction('check').message,/Hombro.*objeto de 3\.0 u.*límite de 2 u/);
  stepUntil(t,() => !arm.running,3);
  assert.equal(t.robotArmSignal(arm),'blocked');
  assert.equal(t.robotGrips.size,0);
  assert.equal(object.robotHeld,undefined);
  t.updateRobotArmPanel();
  assert.equal(field('indicator-label').textContent,'Trabado');

  field('fit-load').dispatchEvent({type:'click'});
  assert.equal(members[1].capacity,4);
  assert.equal(members[0].capacity,64);
  assert.equal(t.robotArmSignal(arm),'off');
  assert(t.robotPanelAction('grab').ok);
  assert(members.every(rotor=>t.rotorPowerState(rotor).load===3));
  t.updateRobotArmPanel();
  assert.equal(field('load').textContent,'3 u / 4 u · 1 pieza');
  assert(t.robotPanelAction('release').ok);
  assert(members.every(rotor=>t.rotorPowerState(rotor).load===0));
});

test('blueprint mouse clicks set A and B and the physical arm delivers the cube', () => {
  const {t,sandbox} = lab(), arm = armAt(t), model = t.robotKinematics(arm);
  const payload = t.addQubit([model.point.x,.045,model.point.z]);
  const original = JSON.stringify(arm.poses), before = t.getSimTime();
  const originalBodies = t.groups.map(g => g.body.position.toArray());
  t.updateRobotArmPanel();
  const field = name => sandbox.document.querySelector('#arm-'+name);
  const click = name => field(name).dispatchEvent({type:'click'});
  const setPointerLock = () => {sandbox.document.pointerLockElement=t.canvas;};
  const clickWorld = () => t.canvas.dispatchEvent({type:'mousedown',button:0});
  setPointerLock();
  click('pose-pick');
  aim(t,t.V(model.point.x,.09,model.point.z));t.updateRobotPoseDraft(1,true);
  assert(t.getRobotPoseDraft().solution?.pose,t.getRobotPoseDraft().reason);
  assert.deepEqual(t.groups.map(g => g.body.position.toArray()),originalBodies);
  assert.equal(t.getSimTime(),before);
  assert.equal(JSON.stringify(arm.poses),original);
  clickWorld();
  assert.equal(t.getRobotPoseDraft(),null);
  assert.notEqual(JSON.stringify(arm.poses),original);

  setPointerLock();
  click('pose-place');
  aim(t,t.V(4,0,4));t.updateRobotPoseDraft(1,true);
  assert.match(t.getRobotPoseDraft().reason,/alcance/);
  clickWorld();
  assert(t.getRobotPoseDraft(),'red point is rejected without exiting');
  const place = t.robotKinematicSample(model,[.8,0,0,0]).point;
  aim(t,t.V(place.x,0,place.z));
  t.canvas.dispatchEvent({type:'wheel',deltaY:-1,shiftKey:true});
  assert.equal(t.getRobotPoseDraft().heightCm,13.5);
  clickWorld();
  assert.equal(t.getRobotPoseDraft(),null);
  assert.equal(Number(field('place-height').value),13.5);
  assert.equal(sandbox.document.querySelector('#panel').hidden,false);
  const taught = JSON.stringify(arm.poses);

  setPointerLock();
  click('pose-place');
  t.canvas.dispatchEvent({type:'mousedown',button:2});
  assert.equal(t.getRobotPoseDraft(),null);
  assert.equal(JSON.stringify(arm.poses),taught);

  assert(t.robotPanelAction('repeat',{value:false}).ok);
  assert(t.robotPanelAction('start').ok);
  stepUntil(t,() => !arm.running);
  assert.equal(arm.cycles,1,arm.status);
  assert.equal(t.robotArmSignal(arm),'off');
  assert(payload.body.position.distanceTo(t.V(place.x,.045,place.z))<.09);
  assert.equal(t.robotGrips.size,0);
});

test('target validation rejects an occupied posture even when the pin is geometrically reachable', () => {
  const {t} = lab(), arm = armAt(t), model = t.robotKinematics(arm);
  const target = t.V(model.point.x,model.point.y+.03,model.point.z);
  const normal = t.V(0,-1,0);
  assert(t.solveRobotPose(model,target,normal).pose);
  t.storyWall(t.V(target.x,target.y+.046,target.z),t.V(.09,.04,.09));
  const blocked = t.solveRobotPose(model,target,normal);
  assert.equal(blocked.pose,undefined);
  assert.match(blocked.reason,/piezas en la postura/);
});

test('initial position is taught with the mouse, recalled on start and removable from the program', () => {
  const {t,sandbox}=lab(), arm=armAt(t), initial=t.robotKinematics(arm), previous=JSON.stringify(arm.poses);
  const point=t.robotKinematicSample(initial,[.22,0,0,0]).point;
  t.updateRobotArmPanel();
  const control=id=>sandbox.document.querySelector('#arm-'+id);
  sandbox.document.pointerLockElement=t.canvas;
  control('home-height').value=10;
  control('pose-home').dispatchEvent({type:'click'});
  aim(t,t.V(point.x,0,point.z));
  t.canvas.dispatchEvent({type:'wheel',deltaY:-1,shiftKey:true});
  assert.equal(t.getRobotPoseDraft().heightCm,10.5);
  t.canvas.dispatchEvent({type:'mousedown',button:0});
  assert.equal(t.getRobotPoseDraft(),null);
  assert(arm.poses.home);assert.equal(control('home-state').textContent,'Guardada');
  const saved=t.saveLab();
  assert.equal(JSON.stringify(saved.robotArms[0].poses.home),JSON.stringify(arm.poses.home));
  const record=t.mechanismSnapshot(t.rotorPart(arm.baseId).g);
  assert(t.savedMechanismValid(record));assert(t.spawnSavedMechanism(record,t.V(3,0,0)));
  assert.equal(JSON.stringify(t.robotArms.at(-1).poses.home),JSON.stringify(arm.poses.home));
  assert(t.startRobotArm(arm));assert.equal(arm.state,'home');
  stepUntil(t,()=>arm.state==='wait');t.stopRobotArm(arm);
  const grip=t.rotorPart(arm.gripperId);t.setSelected({g:grip.g,part:grip.part});
  control('clear-home').dispatchEvent({type:'click'});assert.equal(JSON.stringify(arm.poses),previous);
});

test('a physical transfer lifts the payload over an obstacle in the middle of the direct arc',()=>{
  const {t}=lab(),arm=armAt(t),model=t.robotKinematics(arm);
  const middle=t.robotKinematicSample(model,[Math.PI/4,0,0,0]).point;
  const wall=t.storyWall(t.V(middle.x,.05,middle.z),t.V(.023,.05,.023));
  const payload=t.addQubit([model.point.x,.046,model.point.z]);
  t.configureRobotArm(arm,{repeat:false});assert(t.startRobotArm(arm));
  let waypoints=0,crossed=false;
  stepUntil(t,()=>{
    waypoints=Math.max(waypoints,arm.waypoints?.length||0);
    const box=t.bounds(payload);
    if(box.max.x>wall.min.x&&box.min.x<wall.max.x&&box.max.z>wall.min.z&&box.min.z<wall.max.z){
      assert(box.min.y>=wall.max.y-.002,'load clears the obstacle');crossed=true;
    }
    return !arm.running;
  });
  assert(waypoints>0);assert(crossed);assert.equal(arm.cycles,1,arm.status);
});

test('placing a braked arm against a tabletop uses one hand anchor and preserves all live joints',()=>{
  const {t,sandbox}=lab();
  sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
  t.storyWall(t.V(0,.2,0),t.V(.9,.2,.9));assert(t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V(0,.43,0)));
  const arm=t.robotArms[0],base=t.rotorPart(arm.baseId),g=base.g,partIds=arm.joints.map(j=>[j.aId,j.bId]);
  const look=p=>t.setLook({camera:[p.x,p.y,p.z+1],yaw:0,pitch:0});
  look(g.body.position);t.grabQubit({g,part:base.part,point:g.body.position.clone(),distance:1});
  assert.equal(t.getHeld().items.filter(item=>item.joint).length,1);
  look(t.V(.12,.3,.05));
  let gap=0;
  for(let i=0;i<780;i++){
    if(i===180)t.releaseQubit();
    t.stepPhysics(1/120);
    for(const [a,b] of partIds)gap=Math.max(gap,t.couplerTip(t.rotorPart(a)).point.distanceTo(t.couplerTip(t.rotorPart(b)).point));
  }
  assert(gap<.008);assert.equal(t.robotArmRotors(arm).length,4);
  assert(Math.abs(t.bounds(g).min.y-.4)<.002);assert(Math.abs(g.body.position.x-.12)<.01);
});

test('welding a live arm with a small solver offset keeps the original hinge on the new support',()=>{
  const {t}=lab(),arm=armAt(t),base=t.rotorPart(arm.baseId).g,r=t.robotArmRotors(arm)[0];
  for(const g of t.rotorConnectedGroups([base]))if(g!==base){g.body.position.y+=.006;g.body.aabbNeedsUpdate=true;}
  const top=t.poses(base).filter(p=>p.part.shape==='cube').sort((a,b)=>b.p.x-a.p.x)[0];
  const support=t.addQubit([top.p.x,top.p.y+.09,top.p.z]);
  const joined=t.weld({source:support,target:base,position:support.body.position.clone(),quaternion:t.Q()});
  assert(joined);assert.equal(t.rotorPart(arm.baseId).g,joined);
  for(let i=0;i<120;i++)t.stepPhysics(1/120);
  assert(t.robotArms.includes(arm));assert(t.robotArmRotors(arm).includes(r));
  assert(t.couplerTip(t.rotorPart(r.aId)).point.distanceTo(t.couplerTip(t.rotorPart(r.bId)).point)<.004);
});

test('a four-legged table falls and then rests on both the room floor and an elevated white surface',()=>{
  for(const height of [0,.4]){
    const {t}=lab();
    if(height)t.storyWall(t.V(0,height/2,0),t.V(.9,height/2,.9));
    const parts=[];
    const cube=(x,y,z)=>parts.push({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(x,height+.16+y,z),q:t.Q()});
    for(let x=-2;x<=2;x++)for(let z=-1;z<=1;z++)cube(.09*x,.225,.09*z);
    for(const x of [-.18,.18])for(const z of [-.09,.09])for(const y of [.045,.135])cube(x,y,z);
    const table=t.makeGroup(parts);table.body.velocity.x=.04;
    for(let i=0;i<300;i++)t.stepPhysics(1/120);
    assert(Math.abs(t.bounds(table).min.y-height)<.002);const rest=table.body.position.clone();
    for(let i=0;i<300;i++)t.stepPhysics(1/120);
    assert(table.body.position.distanceTo(rest)<.0005);assert.equal(table.body.sleepState,2);
  }
});

test('tilting a held piece keeps the same axis after the player looks sideways and uses its centre',()=>{
  const {t,sandbox}=lab();sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
  const g=t.addQubit([0,1,0]);
  t.setLook({camera:[0,1,1],yaw:0,pitch:0});
  t.grabQubit({g,part:g.parts[0],point:t.V(.045,1,0),distance:1});
  t.handleKey({code:'ShiftLeft',preventDefault(){}});
  const held=t.getHeld();assert(held.anchor.norm()<1e-8);assert(held.joint.pivotA.norm()<1e-8);
  t.keys.add('KeyW');t.updateGrab(1/120);
  const before=held.rotation.clone();
  t.setLook({camera:[1,1,0],yaw:Math.PI/2,pitch:0});t.updateGrab(1/120);
  const turn=held.rotation.mult(before.inverse());
  assert(Math.abs(turn.x)>.005);assert(Math.abs(turn.y)<1e-8);assert(Math.abs(turn.z)<1e-8);
});

test('an empty arm approaches B around the other side when a tall obstacle closes the short arc',()=>{
  const {t}=lab(),arm=armAt(t),model=t.robotKinematics(arm);
  const middle=t.robotKinematicSample(model,[Math.PI/4,0,0,0]).point;
  t.storyWall(t.V(middle.x,.3,middle.z),t.V(.05,.3,.05));
  assert(t.robotPanelAction('goto',{pose:'place'}).ok);
  assert(arm.waypoints.length);assert.match(t.robotArmStatus(arm),/rodeando/);
  stepUntil(t,()=>!arm.jogging);
  assert.match(arm.status,/Postura lista/);
  assert(Math.abs(t.robotTargetError(t.robotArmRotors(arm)[0],arm.poses.place[0]))<.05);
});
