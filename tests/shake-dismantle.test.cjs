const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');

function setup({ single = false, mixed = false } = {}) {
  const game = createGame(), { t, sandbox } = game;
  t.clearNarrativeScene();
  Object.assign(t.story, { ready: true, scene: 'lab', mode: 'playing', phase: 'idle' });
  sandbox.document.body.dataset.booting = 'false';
  sandbox.document.pointerLockElement = t.canvas;
  const C = .09, turn = t.Q(); turn.setFromAxisAngle(t.V(0, 1, 0), Math.PI);
  const parts = [{ id: 101, weight: 1, shape: 'cube', p: t.V(0, 1, 0), q: t.Q() }];
  if (!single) {
    if (mixed) parts.push(
      { id: 102, weight: .8, shape: 'tetra', p: t.V(C / 8, 1 + C / 2 + C / 8, -C / 8), q: t.Q() },
      { id: 103, weight: 1.2, shape: 'tetra', p: t.V(-C / 8, 1 + C / 2 + C / 8, C / 8), q: turn }
    );
    else for (let i = 1; i < 3; i++) parts.push({ id: 101 + i, weight: 1, shape: 'cube', p: t.V(i * C, 1, 0), q: t.Q() });
  }
  const group = t.makeGroup(parts);
  const point = t.worldParts(group)[0].p;
  t.grabQubit({ g: group, part: group.parts[0], point, distance: .8 });
  t.getHeld().age = .4;
  return { ...game, group };
}
function press(game) { game.sandbox.document.dispatchEvent({ type: 'keydown', code: 'ShiftLeft', repeat: false }); }
function releaseShift(game) { game.sandbox.document.dispatchEvent({ type: 'keyup', code: 'ShiftLeft' }); }
function move(game, amount, time, vertical = false) {
  game.sandbox.document.dispatchEvent({ type: 'mousemove', movementX: vertical ? 0 : amount, movementY: vertical ? amount : 0, timeStamp: time });
}
function burst(game, { start = 1000, gap = 70, count = 5, amount = 50, vertical = false } = {}) {
  for (let i = 0; i < count; i++) move(game, amount * (i % 2 ? -1 : 1), start + i * gap, vertical);
}
function unchanged(game) { assert.equal(game.t.groups.length, 1); assert.equal(game.t.groups[0], game.group); }

for (const vertical of [false, true]) test(`rapid repeated ${vertical ? 'vertical' : 'horizontal'} Shift shaking separates a mixed compound and keeps the picked unit held`, () => {
  const game = setup({ mixed: true }), { t, group } = game;
  group.parts.forEach((part, index) => { part.mood.energy = .31 + index * .2; part.mood.name = 'Original ' + part.id; });
  group.body.velocity.set(5, -3, 4); group.body.angularVelocity.set(10, -20, 7);
  const before = t.worldParts(group), oldJoint = t.getHeld().joint, oldAnchor = t.getHeld().anchorBody;
  t.getHeld().latched = true; press(game); burst(game, { vertical });
  assert.equal(t.groups.length, 3);
  assert(t.groups.every(fragment => fragment.parts.length === 1));
  assert(!t.groups.includes(group)); assert(!t.world.bodies.includes(group.body));
  assert(!t.world.bodies.includes(oldAnchor)); assert(!t.world.constraints.includes(oldJoint));
  const held = t.getHeld(); assert(held);
  assert.equal(held.part.id, 101); assert.equal(held.distance, .8); assert.equal(held.latched, true);
  assert.equal(t.world.constraints.length, 1, 'only the retained picked unit is constrained');
  for (const original of before) {
    const fragment = t.groups.find(g => g.parts[0].id === original.id), after = t.worldParts(fragment)[0];
    assert.equal(after.shape, original.shape); assert.equal(after.weight, original.weight);
    assert.equal(after.mood.energy, original.mood.energy); assert.equal(after.mood.name, original.mood.name);
    assert(after.p.distanceTo(original.p) < 1e-9);
    assert(Math.abs(['x','y','z','w'].reduce((sum, key) => sum + after.q[key] * original.q[key], 0)) > 1 - 1e-9);
    assert(fragment.body.velocity.norm() <= .450001); assert(fragment.body.angularVelocity.norm() <= 2.000001);
  }
  assert.equal(t.findSnap(), null, 'holding Shift after the shake cannot instantly weld the pieces again');
  releaseShift(game); assert.equal(held.shakeSeparated, false);
});

test('single pieces, multi-selection grips and non-Shift motion never dismantle', () => {
  const ordinary = setup(); burst(ordinary); unchanged(ordinary);
  const single = setup({ single: true }); press(single); burst(single); unchanged(single);
  const many = setup(); press(many); many.t.getHeld().items.push({ g: many.group }); burst(many); unchanged(many);
});

test('one swipe, jitter, slow reversals, too few reversals and a fresh pickup are ignored', () => {
  const one = setup(); press(one); for (let i = 0; i < 10; i++) move(one, 100, 1000 + i * 30); unchanged(one);
  const jitter = setup(); press(jitter); burst(jitter, { count: 40, amount: 4, gap: 15 }); unchanged(jitter);
  const slow = setup(); press(slow); burst(slow, { count: 8, gap: 300 }); unchanged(slow);
  const fewer = setup(); press(fewer); burst(fewer, { count: 4, amount: 100 }); unchanged(fewer);
  const fresh = setup(); fresh.t.getHeld().age = .1; press(fresh); burst(fresh); unchanged(fresh);
});

test('Shift release and pause discard partial gestures even when the grip is preserved', () => {
  for (const paused of [false, true]) {
    const game = setup(); press(game); burst(game, { count: 4 });
    if (paused) {
      game.t.pause(false);
      game.sandbox.document.pointerLockElement = game.t.canvas;
      Object.assign(game.t.story, { mode: 'playing', preserveGrip: false });
    } else releaseShift(game);
    press(game); move(game, 50, 1250); unchanged(game);
    burst(game, { start: 1500 }); assert.equal(game.t.groups.length, 3);
  }
});

test('unlock, hidden document and blocked menu input cannot accumulate a breaking gesture', () => {
  for (const kind of ['unlock', 'hidden', 'panel']) {
    const game = setup(); press(game); burst(game, { count: 4 });
    if (kind === 'unlock') {
      game.t.story.preserveGrip = true; game.t.story.intentionalUnlock = true;
      game.sandbox.document.pointerLockElement = null;
      game.sandbox.document.dispatchEvent({ type: 'pointerlockchange' });
    } else if (kind === 'hidden') game.sandbox.document.hidden = true;
    else game.sandbox.document.querySelector('#panel').hidden = false;
    burst(game, { start: 1250 }); unchanged(game);
    game.sandbox.document.pointerLockElement = game.t.canvas;
    game.sandbox.document.hidden = false; game.sandbox.document.querySelector('#panel').hidden = true;
    press(game); move(game, 50, 1500); unchanged(game);
  }
});

test('release and a new pickup never inherit a previous compound gesture', () => {
  const game = setup(); press(game); burst(game, { count: 4 });
  const { t, group } = game; t.releaseQubit();
  t.grabQubit({ g: group, part: group.parts[0], point: t.worldParts(group)[0].p, distance: .8 });
  t.getHeld().age = .4; move(game, 50, 1250); unchanged(game);
  burst(game, { start: 1500 }); assert.equal(t.groups.length, 3);
});

test('the dismantling gesture works with character dialogue disabled', () => {
  const game = setup();
  const toggle = game.sandbox.document.querySelector('#dialogues-enabled');
  toggle.checked = false; toggle.dispatchEvent({ type: 'change' });
  press(game); burst(game);
  assert.equal(game.t.groups.length, 3);
  assert.equal(game.t.getHeld().part.id, 101);
});
