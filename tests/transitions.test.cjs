// Logic only: timing, narrative, input and physics. Real fade pixels need browser QA.
const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');

function setup() {
  const game = createGame();
  game.t.story.ready = true;
  game.t.story.mode = 'playing';
  game.t.story.scene = 'lab';
  return game;
}

test('travel transitions enforce 1.8 seconds of black and move the loading bar during that hold', () => {
  const { t, sandbox } = setup();
  const veil = sandbox.document.querySelector('#scene-veil');
  const loading = sandbox.document.querySelector('#scene-loading');
  const bar = sandbox.document.querySelector('#scene-loading .transition-track b');
  let swaps = 0;
  t.sceneFade(() => { swaps++; }, { out: .4, black: .1, inTime: .8 });
  assert.equal(t.story.transition.black, 1.8);
  assert.equal(bar.style.width, '0%');
  t.tickSceneFade(.2);
  assert.equal(swaps, 0);
  assert(Number(veil.style.opacity) > 0 && Number(veil.style.opacity) < 1);
  t.tickSceneFade(.2);
  assert.equal(swaps, 1);
  assert.equal(veil.style.opacity, '1');
  assert.equal(loading.hidden, false);
  assert.equal(bar.style.width, '0%');
  t.tickSceneFade(.9);
  assert.equal(veil.style.opacity, '1');
  assert(Math.abs(parseFloat(bar.style.width) - 50) < 1e-7);
  t.tickSceneFade(.89);
  assert.equal(veil.style.opacity, '1');
  assert.equal(loading.hidden, false);
  assert(parseFloat(bar.style.width) < 100);
  t.tickSceneFade(.02);
  assert.equal(bar.style.width, '100%');
  assert.equal(loading.hidden, true);
  assert(Number(veil.style.opacity) < 1);
  t.tickSceneFade(.8);
  assert.equal(t.story.transition, null);
  assert.equal(sandbox.document.body.dataset.transitioning, 'false');
  assert.equal(veil.style.opacity, '0');
  assert.equal(swaps, 1);
});

test('scene replacement runs once, and repeated transition requests cannot replace it', () => {
  const { t } = setup();
  let swaps = 0, ignored = 0;
  t.sceneFade(() => { swaps++; t.beginCampaignLevel(2); });
  t.sceneFade(() => { ignored++; });
  for (let i = 0; i < 80; i++) t.tickSceneFade(.05);
  assert.equal(swaps, 1);
  assert.equal(ignored, 0);
  assert.equal(t.story.level, 2);
  assert.equal(t.story.transition, null);
});

test('narrative clocks, dialogue, keyboard actions and physics remain frozen during the transition', () => {
  const { t, sandbox } = setup();
  const cube = t.addQubit([0, 1, 0]);
  cube.body.velocity.set(1, -1, 1);
  t.story.elapsed = 8;
  t.story.phaseTime = 3;
  t.keys.add('KeyW');
  t.sceneFade(() => {});
  assert.equal(t.keys.size, 0, 'held movement keys clear as the transition starts');
  t.story.dialogue = { text: 'Espera.', time: 0, count: 0, hold: true, done: false };
  const panel = sandbox.document.querySelector('#panel');
  let prevented = 0;
  for (const code of ['KeyE', 'Space', 'KeyP', 'Escape', 'KeyW', 'KeyC', 'ShiftLeft']) {
    assert.equal(t.storyInput({ code, repeat: false, preventDefault() { prevented++; } }), true);
  }
  assert.equal(prevented, 7);
  assert.equal(t.story.mode, 'playing');
  assert.equal(panel.hidden, true);
  assert.equal(t.story.dialogue.time, 0);
  const beforePosition = [...t.position];
  const beforeBody = [cube.body.position.x, cube.body.position.y, cube.body.position.z];
  const beforeWorldTime = t.world.time;
  sandbox.document.pointerLockElement = t.canvas;
  t.keys.add('KeyW');
  t.setRunning(true);
  const now = performance.now();
  for (let i = 1; i <= 20; i++) t.frame(now + i * 50);
  assert.equal(t.story.elapsed, 8);
  assert.equal(t.story.phaseTime, 3);
  assert.equal(t.story.dialogue.time, 0);
  assert.deepEqual([...t.position], beforePosition);
  assert.deepEqual([cube.body.position.x, cube.body.position.y, cube.body.position.z], beforeBody);
  assert.equal(t.world.time, beforeWorldTime);
});

test('hidden tabs do not consume transition time or run a pending scene swap', () => {
  const { t, sandbox } = setup();
  let swaps = 0;
  t.sceneFade(() => { swaps++; });
  t.tickSceneFade(.2);
  const elapsed = t.story.transition.time;
  sandbox.document.hidden = true;
  t.tickSceneFade(30);
  t.tickStory(30);
  assert.equal(t.story.transition.time, elapsed);
  assert.equal(swaps, 0);
  sandbox.document.hidden = false;
  t.tickStory(.5);
  assert.equal(swaps, 1);
  assert(t.story.transition, 'the black hold still has to elapse after returning');
  sandbox.document.hidden = true;
  const heldTime = t.story.transition.time;
  t.tickStory(300);
  assert.equal(t.story.transition.time, heldTime);
});
