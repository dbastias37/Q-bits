const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');
const C = .09, DT = 1 / 240;

function setup() {
  const game = createGame();
  game.t.clearNarrativeScene();game.t.story.ready = false;
  return game;
}
function floorRotor(t, options = {}, wheel = false) {
  const rotor = t.spawnRotor(t.V(0, .3, 0), {rpm:30, moving:'b', ...options});
  assert(rotor);
  const turn = t.Q();turn.setFromAxisAngle(t.V(0, 0, 1), Math.PI / 2);
  const pivot = t.couplerTip(t.rotorPart(rotor.aId)).point;
  for (const g of t.rotorGroups(rotor)) {
    g.body.position.copy(pivot.vadd(turn.vmult(g.body.position.vsub(pivot))));
    g.body.quaternion.copy(turn.mult(g.body.quaternion));
  }
  if (wheel) {
    // Five face-joined pieces form a cross wheel. A six-piece L-shaped
    // chassis rests on its own feet; this is a real eleven-unit construction.
    const b = t.rotorPart(rotor.bId), parts = t.worldParts(b.g);
    const center = b.p.vadd(b.q.vmult(t.V(0, -C * 5 / 56, 0)));
    for (const [x,z] of [[-1,0],[1,0],[0,-1],[0,1]]) parts.push({
      id:t.allocateUnitId(),shape:'cube',weight:1,
      p:center.vadd(b.q.vmult(t.V(x*C,0,z*C))),q:b.q.clone()
    });
    t.removeGroup(b.g);t.makeGroup(parts);t.refreshRotors();
    const a = t.rotorPart(rotor.aId), baseParts = t.worldParts(a.g);
    const baseCenter = a.p.vadd(a.q.vmult(t.V(0, -C * 5 / 56, 0)));
    for (const [x,y,z] of [[0,-1,0],[0,-2,0],[-1,-2,-1],[-1,-2,0],[-1,-2,1]]) baseParts.push({
      id:t.allocateUnitId(),shape:'cube',weight:1,
      p:baseCenter.vadd(a.q.vmult(t.V(x*C,y*C,z*C))),q:a.q.clone()
    });
    t.removeGroup(a.g);t.makeGroup(baseParts);t.refreshRotors();
  }
  const low = Math.min(...t.rotorGroups(rotor).map(g => t.bounds(g).min.y));
  for (const g of t.rotorGroups(rotor)) {g.body.position.y -= low - .002;g.body.aabbNeedsUpdate = true;}
  return rotor;
}
function measure(t, rotor, seconds) {
  let angle = 0, minY = 0, maxGap = 0, maxTorque = 0, worstAxisDot = -1;
  for (let i = 0; i < seconds / DT; i++) {
    t.stepPhysics(DT);
    const [a,b] = t.rotorGroups(rotor), at = t.couplerTip(t.rotorPart(rotor.aId)), bt = t.couplerTip(t.rotorPart(rotor.bId));
    angle += b.body.angularVelocity.vsub(a.body.angularVelocity).dot(bt.axis) * DT;
    minY = Math.min(minY,t.bounds(a).min.y,t.bounds(b).min.y);
    maxGap = Math.max(maxGap,at.point.distanceTo(bt.point));
    maxTorque = Math.max(maxTorque,rotor.actualTorque || 0);
    worstAxisDot = Math.max(worstAxisDot,at.axis.dot(bt.axis));
  }
  return {angle,minY,maxGap,maxTorque,worstAxisDot};
}

for (const direction of [1,-1]) test(`a horizontal rotor rolls in direction ${direction} on the floor without pinning its axle`, () => {
  const {t} = setup(), rotor = floorRotor(t,{direction,maxTorque:.4});
  assert.equal(rotor.mount,'wheel','new rotors default to a mobile axle');
  const [a,b] = t.rotorGroups(rotor), start = b.body.position.clone();
  assert(t.configureRotor(rotor,{enabled:true}));
  const motion = measure(t,rotor,2);
  assert.equal(rotor.pin,null);
  assert.equal(a.body.type,1);assert.equal(b.body.type,1);
  assert(motion.angle * direction > 4,'physical relative rotation continues after contacting the floor');
  assert(b.body.position.distanceTo(start) > .035,'contact moves the assembly instead of spinning through the floor');
  assert(motion.minY > -.003,`floor penetration stays within solver tolerance: ${motion.minY}`);
  assert(motion.maxGap < .001,`joint remains closed: ${motion.maxGap}`);
  assert(motion.worstAxisDot < -.995,'both couplers continue sharing the same axle');
  assert(motion.maxTorque <= rotor.maxTorque + 1e-8,'measured torque respects the configured cap');
});

test('a wheel assembled from Q-bits drives its attached chassis across the floor', () => {
  const {t} = setup(), rotor = floorRotor(t,{maxTorque:4},true);
  const [chassis,wheel] = t.rotorGroups(rotor);
  assert.equal(chassis.parts.length + wheel.parts.length,11);
  const start = chassis.body.position.clone();
  t.configureRotor(rotor,{enabled:true});
  const motion = measure(t,rotor,2);
  assert(motion.angle > 4,'the loaded wheel rotates around its actual hinge');
  assert(Math.hypot(chassis.body.position.x-start.x,chassis.body.position.z-start.z) > .04,'wheel traction moves its chassis');
  assert(motion.minY > -.003,`neither chassis nor wheel passes through the floor: ${motion.minY}`);
  assert(motion.maxGap < .001,'traction does not tear the axle');
  assert(motion.worstAxisDot < -.995);
  assert(motion.maxTorque <= 4 + 1e-8);
});

test('insufficient torque stalls a floor-loaded wheel instead of forcing its requested RPM', () => {
  const lowGame = setup(), low = floorRotor(lowGame.t,{maxTorque:.02});
  lowGame.t.configureRotor(low,{enabled:true});const weak = measure(lowGame.t,low,1);
  const highGame = setup(), high = floorRotor(highGame.t,{maxTorque:.4});
  highGame.t.configureRotor(high,{enabled:true});const strong = measure(highGame.t,high,1);
  assert(low.stalled,'stationary loaded motor reports its stall');
  assert(Math.abs(weak.angle) < .02,'a torque-limited motor cannot force a square wheel through the floor');
  assert(strong.angle > 2,'raising available torque overcomes the same load');
  assert(weak.maxTorque > .019 && weak.maxTorque <= .02 + 1e-8,'a stalled motor still applies finite torque');
  assert(weak.maxGap < .001 && strong.maxGap < .001);
});

test('wheel friction correction does not change contacts of unrelated Q-bits', () => {
  function slide(withMotor) {
    const {t} = setup(), rotor = floorRotor(t);
    const cube = t.addQubit([2,.047,0],1,'cube');cube.body.velocity.x = .5;
    if (withMotor) t.configureRotor(rotor,{enabled:true});
    measure(t,rotor,.5);
    return {p:cube.body.position.clone(),v:cube.body.velocity.clone()};
  }
  const stopped = slide(false), powered = slide(true);
  assert(stopped.p.distanceTo(powered.p) < 1e-7);
  assert(stopped.v.distanceTo(powered.v) < 1e-7);
});
