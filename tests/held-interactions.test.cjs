const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');

test('shaking a focused compound transfers focus to the retained unit and cannot rejoin on immediate release', () => {
  const { t, sandbox } = createGame();
  t.clearNarrativeScene();
  Object.assign(t.story, { ready: true, mode: 'playing', scene: 'lab', phase: 'idle' });
  sandbox.document.pointerLockElement = t.canvas;
  const camera = t.V(...t.getLook().camera);
  const point = camera.vadd(t.screenRay(640, 360).scale(.4));
  const compound = t.makeGroup([
    { id: 401, shape: 'cube', weight: 1, p: point, q: t.Q() },
    { id: 402, shape: 'cube', weight: 1, p: point.vadd(t.V(.09, 0, 0)), q: t.Q() }
  ]);
  t.grabQubit({ g: compound, part: compound.parts[0], point, distance: .4 });
  t.getHeld().age = .4;
  for (let i = 0; i < 30; i++) t.updateHeldFocus(.05);
  assert(t.heldFocus.amount > .99);
  assert.equal(t.heldFocus.groups[0], compound);
  sandbox.document.dispatchEvent({ type: 'keydown', code: 'ShiftLeft', repeat: false });
  for (let i = 0; i < 5; i++) sandbox.document.dispatchEvent({
    type: 'mousemove', movementX: i % 2 ? -50 : 50, movementY: 0, timeStamp: 1000 + i * 70
  });
  assert.equal(t.groups.length, 2);
  assert.equal(t.getHeld().part.id, 401);
  t.updateHeldFocus(.05);
  assert.equal(t.heldFocus.groups.length, 1);
  assert.equal(t.heldFocus.groups[0], t.getHeld().g);
  assert(!t.heldFocus.groups.includes(compound));
  assert.equal(sandbox.document.querySelector('#mood-energy-track').hidden, false);
  assert.equal(t.findSnap(), null);
  sandbox.document.dispatchEvent({ type: 'mouseup', button: 0 });
  assert.equal(t.getHeld(), null);
  assert.equal(t.groups.length, 2);
  t.updateHeldFocus(.05);
  assert(t.heldFocus.amount > 0 && t.heldFocus.amount < .9);
  assert.equal(sandbox.document.querySelector('#mood-held-labels').hidden, true);
  for (let i = 0; i < 30; i++) t.updateHeldFocus(.05);
  assert.equal(t.heldFocus.amount, 0);
});
