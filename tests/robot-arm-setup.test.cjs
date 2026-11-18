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

test('the 780 u mounting blocks at 64 u, then P adjusts all four axes with room for the payload', () => {
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
  assert.equal(t.robotPanelSnapshot().arm.connectedLoad,780);
  assert.equal(t.robotPanelAction('start').ok,false);
  assert.match(arm.status,/780\.0 \/ 64 u/);
  assert.equal(t.robotArmSignal(arm),'blocked');
  t.updateRobotArmPanel();
  const field = name => sandbox.document.querySelector('#arm-'+name);
  assert.equal(field('indicator-label').textContent,'Trabado');
  field('fit-load').dispatchEvent({type:'click'});
  assert(members.every(r => r.capacity===784));
  assert.equal(t.robotArmSignal(arm),'off');
  field('motor-axis').value='1';
  field('motor-axis').dispatchEvent({type:'change'});
  field('motor-rpm').value='8';
  field('motor-torque').value='3.5';
  field('motor-capacity').value='790';
  field('apply-motor').dispatchEvent({type:'click'});
  assert.equal(members[1].rpm,8);
  assert.equal(members[1].maxTorque,3.5);
  assert.equal(members[1].capacity,790);
  assert.equal(members[0].capacity,784);
  assert.equal(t.robotArmSignal(arm),'off');
  assert(t.robotPanelAction('start').ok);
  assert.equal(t.robotArmSignal(arm),'running');
  stepUntil(t,() => arm.state==='wait',3);
  assert.equal(t.robotArmSignal(arm),'waiting');
  assert.equal(t.robotPanelAction('fitLoad').ok,false,'editing is locked during production');
  assert(t.robotPanelAction('stop').ok);
  assert.equal(t.robotArmSignal(arm),'off');
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
