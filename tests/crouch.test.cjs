const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');
function setup() {
  const game = createGame(), { t, sandbox } = game;
  t.clearNarrativeScene();
  sandbox.document.pointerLockElement = t.canvas;
  t.story.ready = false;
  return game;
}
function press(t, code) { t.handleKey({ code, repeat: false, preventDefault() {} }); }
function settle(t) { for (let i = 0; i < 40; i++) t.updatePosture(.05, true, t.keys.has('KeyC')); }
function pick(t) {
  const g = t.addQubit([0, .05, 0]);
  t.grabQubit({ g, part: g.parts[0], point: g.body.position.clone(), distance: 1 });
  assert(t.getHeld());
  return g;
}

test('Shift does not crouch before, during or after grabbing a cube', () => {
  const { t } = setup();
  press(t, 'ShiftLeft');settle(t);
  assert.equal(t.posture.height, t.EYE_HEIGHT);
  pick(t);settle(t);
  assert.equal(t.posture.height, t.EYE_HEIGHT);
  t.releaseQubit(true);settle(t);
  assert.equal(t.posture.height, t.EYE_HEIGHT);
  assert(t.keys.has('ShiftLeft'), 'Shift is still held for the joining action');
});

test('C crouches while carrying and releasing C rises without a camera-height latch', () => {
  const { t } = setup();
  press(t, 'KeyC');settle(t);
  assert(Math.abs(t.posture.height - t.posture.crouchHeight) < 1e-7);
  pick(t);settle(t);
  assert(Math.abs(t.posture.height - t.posture.crouchHeight) < 1e-7);
  t.keys.delete('KeyC');settle(t);
  assert(t.getHeld(), 'the cube is still being carried');
  assert(Math.abs(t.posture.height - t.EYE_HEIGHT) < 1e-7);
  press(t, 'KeyC');settle(t);t.releaseQubit();settle(t);
  assert(Math.abs(t.posture.height - t.posture.crouchHeight) < 1e-7);
});

test('C plus wheel adjusts posture, ordinary and Shift plus wheel adjust held distance', () => {
  const { t } = setup();pick(t);
  const wheel = shiftKey => ({ deltaY: 1, shiftKey, preventDefault() {} });
  const initialHeight = t.posture.crouchHeight, initialDistance = t.getHeld().distance;
  press(t, 'KeyC');t.handleWheel(wheel(false));
  assert(Math.abs(t.posture.crouchHeight - (initialHeight - .08)) < 1e-9);
  assert.equal(t.getHeld().distance, initialDistance);
  t.keys.delete('KeyC');press(t, 'ShiftLeft');t.handleWheel(wheel(true));
  assert(Math.abs(t.getHeld().distance - (initialDistance + .07)) < 1e-9);
  assert(Math.abs(t.posture.crouchHeight - (initialHeight - .08)) < 1e-9);
});

test('C registers as a held posture key without duplicating the selected unit', () => {
  const { t } = setup();pick(t);
  const count = t.groups.length;
  press(t, 'KeyC');
  assert(t.keys.has('KeyC'));
  assert.equal(t.groups.length, count);
});

test('releasing C still respects a low ceiling', () => {
  const { t } = setup();
  t.posture.height = t.posture.crouchHeight;
  t.storyWorld.walls.push({p:t.V(0,1.2,0),half:t.V(1,.2,1),min:t.V(-1,1,-1),max:t.V(1,1.4,1)});
  t.position[0] = 0;t.position[2] = 0;
  settle(t);
  assert(t.posture.height <= .85 + 1e-7);
});
