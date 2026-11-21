// Integration only: real game state and events with DOM/GPU stubs, not visual QA.
const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');

async function prepare(game) {
  let done = false;
  const pending = game.api.prepare().then(() => { done = true; });
  for (let i = 0; i < 30 && !done; i++) {
    game.frame();
    await Promise.resolve();
    await Promise.resolve();
  }
  assert.equal(done, true, 'asset preparation resolves through the actual frame fences');
  await pending;
}

test('menu cannot expose an unprepared game', () => {
  const game = createGame();
  const mode = game.t.story.mode;
  const scene = game.t.story.scene;
  game.api.menu();
  assert.equal(game.t.story.mode, mode);
  assert.equal(game.t.story.scene, scene);
  assert.equal(game.sandbox.document.querySelector('#main-screen').hidden, true);
});

test('opening keeps the prologue frozen through the menu until Nueva campaña is chosen', async () => {
  const game = createGame(), {t, api, sandbox} = game;
  await prepare(game);
  assert.equal(t.story.mode, 'boot');
  assert.equal(t.story.started, false);
  api.menu();
  assert.equal(t.story.mode, 'menu');
  assert.equal(sandbox.document.querySelector('#main-screen').hidden, false);
  assert.equal(sandbox.document.querySelector('#main-continue').hidden, true);
  assert.equal(sandbox.document.querySelector('#wake-screen').hidden, true);
  assert.equal(t.story.started, false);
  const dialogue = t.story.dialogue;
  for (let i = 0; i < 20; i++) t.tickStory(.1);
  t.storyInput({ code: 'KeyE', repeat: false, preventDefault() {} });
  assert.equal(t.story.dialogue, dialogue);
  assert.equal(dialogue.time, 0);
  assert.equal(t.story.phase, 'invocation');
  sandbox.document.querySelector('#main-play').dispatchEvent({ type: 'click' });
  assert.equal(t.story.mode, 'saves');
  assert.equal(sandbox.document.querySelector('#saves-screen').hidden, false);
  assert.equal(t.story.started, false);
  assert.equal(t.story.transition, null);
  sandbox.document.querySelector('#saves-campaign-new').dispatchEvent({ type: 'click' });
  assert.ok(t.story.transition, 'the campaign starts through its existing scene fade');
  for (let i = 0; i < 50; i++) t.tickStory(.1);
  assert.equal(t.story.mode, 'playing');
  assert.equal(t.story.scene, 'intro');
  assert.equal(t.story.started, true);
  assert.equal(sandbox.document.querySelector('#main-screen').hidden, true);
  assert.equal(sandbox.document.querySelector('#wake-screen').hidden, true);
  assert.equal(t.story.dialogue.text, 'En el inicio no había nada…');
});

test('menu continues to expose level selection and catalogue without starting campaign', async () => {
  const game = createGame(), {t, api, sandbox} = game;
  await prepare(game);api.menu();
  sandbox.document.querySelector('#main-levels').dispatchEvent({type: 'click'});
  assert.equal(t.story.mode, 'levels');
  assert.equal(sandbox.document.querySelector('#level-list').children.length, t.chapters.length);
  sandbox.document.querySelector('#levels-back').dispatchEvent({type: 'click'});
  assert.equal(t.story.mode, 'menu');
  sandbox.document.querySelector('#main-codex').dispatchEvent({type: 'click'});
  assert.equal(t.story.mode, 'codex');
  sandbox.document.querySelector('#codex-back').dispatchEvent({type: 'click'});
  assert.equal(t.story.mode, 'menu');
  assert.equal(t.story.started, false);
});
