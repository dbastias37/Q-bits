const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');

function setup() {
  const game = createGame();
  game.t.clearNarrativeScene();game.t.story.ready = false;
  return game;
}
function gap(t, rotor) {
  return t.couplerTip(t.rotorPart(rotor.aId)).point.distanceTo(t.couplerTip(t.rotorPart(rotor.bId)).point);
}
function horizontalArm(t, count) {
  const rotor = t.spawnRotor(t.V(0, 2, 0), { rpm: 120, moving: 'b' });
  assert(rotor);
  const turn = t.Q();turn.setFromAxisAngle(t.V(0, 0, 1), Math.PI / 2);
  const pivot = t.couplerTip(t.rotorPart(rotor.aId)).point;
  for (const g of t.rotorGroups(rotor)) {
    g.body.position.copy(pivot.vadd(turn.vmult(g.body.position.vsub(pivot))));
    g.body.quaternion.copy(turn.mult(g.body.quaternion));
  }
  const movingPart = t.rotorPart(rotor.bId), parts = t.worldParts(movingPart.g);
  const base = movingPart.p.vadd(movingPart.q.vmult(t.V(0, -.09 * 5 / 56, 0)));
  for (let i = 1; i <= count; i++) parts.push({
    id: t.allocateUnitId(), shape: 'cube', weight: 3,
    p: base.vadd(movingPart.q.vmult(t.V(i * .09, 0, 0))), q: movingPart.q.clone()
  });
  const reference = movingPart.g.body.quaternion.clone();
  t.removeGroup(movingPart.g);const moving = t.makeGroup(parts, reference);
  t.refreshRotors();assert.equal(t.rotors.length, 1);
  return { rotor, moving, base: t.rotorGroups(rotor)[0] };
}

for (const count of [4, 12]) test(`a horizontal rotor keeps its axle closed under a ${count}-cube arm and gravity`, () => {
  const { t } = setup(), { rotor, moving, base } = horizontalArm(t, count);
  const basePosition = base.body.position.clone(), baseQuaternion = base.body.quaternion.clone();
  t.configureRotor(rotor, { enabled: true });
  let greatestGap = 0, greatestSpeed = 0;
  for (let i = 0; i < 2400; i++) {
    t.stepPhysics(1 / 240);
    greatestGap = Math.max(greatestGap, gap(t, rotor));
    greatestSpeed = Math.max(greatestSpeed, moving.body.velocity.norm());
  }
  assert(greatestGap < .000001, `axle must not stretch: ${greatestGap} m`);
  assert(base.body.position.distanceTo(basePosition) < 1e-10);
  assert(Math.abs(['x', 'y', 'z', 'w'].reduce((sum, k) => sum + base.body.quaternion[k] * baseQuaternion[k], 0)) > 1 - 1e-10);
  assert(greatestSpeed < 6.001, 'large arm must obey the physics travel ceiling');
  assert(rotor.effectiveRpm <= rotor.rpm);
  const axis = t.couplerTip(t.rotorPart(rotor.bId)).axis;
  assert(moving.body.angularVelocity.dot(axis) > rotor.effectiveRpm * Math.PI * 2 / 60 * .85);
  assert(t.world.constraints.every(c => t.world.bodies.includes(c.bodyA) && t.world.bodies.includes(c.bodyB)));
});

test('a rotating arm stalls against its own fixed-side support without penetrating or tearing the axle', () => {
  const { t } = setup();t.settings.gravity = 0;t.world.gravity.set(0, 0, 0);
  const rotor = t.spawnRotor(t.V(0, 1, 0), { rpm: 120, moving: 'b' });
  const a = t.rotorPart(rotor.aId), b = t.rotorPart(rotor.bId);
  const aCenter = a.p.vadd(a.q.vmult(t.V(0, -.09 * 5 / 56, 0)));
  const bCenter = b.p.vadd(b.q.vmult(t.V(0, -.09 * 5 / 56, 0)));
  const fixedParts = t.worldParts(a.g), movingParts = t.worldParts(b.g);
  for (let i = 0; i < 3; i++) fixedParts.push({
    id: t.allocateUnitId(), shape: 'cube', weight: 1, p: aCenter.vadd(t.V(.09, i * .09, 0)), q: t.Q()
  });
  movingParts.push({ id: t.allocateUnitId(), shape: 'cube', weight: 1, p: bCenter.vadd(t.V(0, 0, .09)), q: t.Q() });
  assert(!fixedParts.some(p => movingParts.some(q => t.obbOverlap(p, q, .000001))), 'fixture starts without overlap');
  t.removeGroup(a.g);t.removeGroup(b.g);
  const fixed = t.makeGroup(fixedParts), moving = t.makeGroup(movingParts);
  t.refreshRotors();t.configureRotor(rotor, { enabled: true, direction: -1 });
  let greatestGap = 0, greatestSpin = 0, blocked = false;
  for (let i = 0; i < 2400; i++) {
    t.stepPhysics(1 / 240);
    greatestGap = Math.max(greatestGap, gap(t, rotor));
    greatestSpin = Math.max(greatestSpin, moving.body.angularVelocity.norm());
    blocked ||= rotor.stalled;
    assert(!t.poses(fixed).some(p => t.poses(moving).some(q => t.obbOverlap(p, q, .003))), 'motor must not drive the arm through its own base');
  }
  assert(greatestSpin > .1, 'the motor actually starts before encountering the obstruction');
  assert(blocked, 'motor reports the obstruction');
  assert(moving.body.angularVelocity.norm() < .05, 'blocked rotor stops');
  assert(greatestGap < .000001, 'collision must not stretch the physical joint');
});
