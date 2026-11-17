const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');

function lab({ locked = true } = {}) {
  const game = createGame(), { t, sandbox } = game;
  t.clearNarrativeScene();
  Object.assign(t.story, { ready: true, scene: 'lab', mode: 'playing', phase: 'idle' });
  sandbox.document.body.dataset.booting = 'false';
  sandbox.document.pointerLockElement = locked ? t.canvas : null;
  return game;
}
function key(game, code, options = {}) {
  game.sandbox.document.dispatchEvent({ type: 'keydown', code, repeat: false, ...options });
}
function release(game, code) { game.sandbox.document.dispatchEvent({ type: 'keyup', code }); }
function hover(game, shape) {
  const before = game.radial.getState();
  const figure = before.figures.find(item => item.id === shape);
  game.sandbox.document.dispatchEvent({ type: 'mousemove', movementX: figure.x-before.x, movementY: figure.y-before.y });
  assert.equal(game.radial.hovered, shape);
}

test('holding Q opens once, and releasing it commits the hovered type without creating a unit', () => {
  const game = lab(), { t, sandbox } = game;
  t.settings.unitShape = 'cube';
  const count = t.groups.length;
  key(game, 'KeyQ');
  assert(t.radialOpen());
  assert.equal(sandbox.document.querySelector('#radial-option-cube').getAttribute('aria-selected'), 'true');
  assert(sandbox.document.querySelector('#unit-radial').classList.contains('virtual-pointer'));
  hover(game, 'tetra');
  const choice = game.radial.getState();
  key(game, 'KeyQ', { repeat: true });
  assert.equal(game.radial.getState().x, choice.x);
  assert.equal(game.radial.hovered, 'tetra', 'repeated Q must not reset the current choice');
  assert.equal(t.settings.unitShape, 'cube');
  release(game, 'KeyQ');
  assert.equal(t.radialOpen(), false);
  assert.equal(t.settings.unitShape, 'tetra');
  assert.equal(sandbox.document.querySelector('#unit-shape').value, 'tetra');
  assert.equal(t.groups.length, count);
  assert.equal(sandbox.document.pointerLockElement, t.canvas);
  release(game, 'KeyQ');
  assert.equal(t.groups.length, count, 'a duplicate release does not create a piece');
});

test('dead zone, outside release and Escape retain the previous type', () => {
  for (const outside of [false, true]) {
    const game = lab(), { t } = game;
    t.settings.unitShape = 'pyramid';
    key(game, 'KeyQ');
    if(outside){hover(game, 'tetra');game.radial.moveTo(0, 0);}
    release(game, 'KeyQ');
    assert.equal(t.settings.unitShape, 'pyramid');
    assert.equal(t.radialOpen(), false);
  }
  const game = lab(), { t } = game;
  t.settings.unitShape = 'pyramid';key(game, 'KeyQ');hover(game, 'tetra');
  key(game, 'Escape');release(game, 'KeyQ');
  assert.equal(t.settings.unitShape, 'pyramid');
  assert.equal(t.story.mode, 'playing');
  assert.equal(t.radialOpen(), false);
  key(game, 'KeyQ', { repeat: true });
  assert.equal(t.radialOpen(), false, 'an existing held Q cannot reopen after cancellation');
});

test('selection changes the shape N creates and preserves the existing creation workflow', () => {
  const game = lab(), { t } = game;
  for (const shape of ['tetra', 'pyramid', 'cube']) {
    key(game, 'KeyQ');hover(game, shape);release(game, 'KeyQ');
    t.setLook({camera:[['tetra','pyramid','cube'].indexOf(shape),2,2],yaw:0,pitch:-Math.PI/4});key(game, 'KeyN');
    assert.equal(t.getSelected().part.shape, shape);
    assert.equal(t.creationShape(), shape);
  }
});

test('opening clears movement keys and freezes movement, posture, physics and narrative time', () => {
  const game = lab(), { t } = game;
  const piece = t.addQubit([0, 2, 0]);
  key(game, 'KeyW');key(game, 'KeyC');key(game, 'ShiftLeft');
  assert(t.keys.size >= 3);
  key(game, 'KeyQ');
  assert.equal(t.keys.size, 0);
  assert(t.storySuspended());
  const before = {
    position: [...t.position], look: JSON.stringify(t.getLook()), height: t.posture.height, simulation: t.getSimTime(),
    elapsed: t.story.elapsed, pieceY: piece.body.position.y, count: t.groups.length
  };
  for (const code of ['KeyW', 'KeyC', 'ShiftLeft', 'KeyN', 'KeyV', 'Delete', 'KeyP']) key(game, code);
  t.frame(performance.now() + 1000);
  assert.deepEqual([...t.position], before.position);
  assert.equal(JSON.stringify(t.getLook()), before.look, 'camera smoothing is frozen too');
  assert.equal(t.posture.height, before.height);
  assert.equal(t.getSimTime(), before.simulation);
  assert.equal(t.story.elapsed, before.elapsed);
  assert.equal(piece.body.position.y, before.pieceY);
  assert.equal(t.groups.length, before.count);
  assert.equal(t.keys.size, 0);
  release(game, 'KeyQ');
  assert.equal(t.keys.size, 0);
  assert.equal(t.storySuspended(), false);
});

test('locked mouse controls the selector without rotating the camera or interacting with units', () => {
  const game = lab(), { t, sandbox } = game;
  key(game, 'KeyQ');
  const before = t.getLook(), pointer = game.radial.getState(), height = t.posture.crouchHeight, count = t.groups.length;
  sandbox.document.dispatchEvent({ type: 'mousemove', movementX: 47, movementY: -23 });
  assert.equal(game.radial.getState().x, pointer.x + 47);
  assert.equal(game.radial.getState().y, pointer.y - 23);
  assert.deepEqual(t.getLook(), before);
  t.canvas.dispatchEvent({ type: 'mousedown', button: 0 });
  t.canvas.dispatchEvent({ type: 'mousedown', button: 2 });
  sandbox.document.dispatchEvent({ type: 'mouseup', button: 0 });
  t.canvas.dispatchEvent({ type: 'wheel', deltaY: 1 });
  assert.equal(t.getHeld(), null);
  assert.equal(t.groups.length, count);
  assert.equal(t.posture.crouchHeight, height);
  assert(t.radialOpen());
});

test('Q requires actual pointer capture, and arrow keys can select once captured', () => {
  const game = lab({ locked: false }), { t, sandbox } = game;
  key(game, 'KeyQ');
  assert.equal(t.radialOpen(), false);
  sandbox.document.pointerLockElement = t.canvas;
  key(game, 'KeyQ');
  key(game, 'ArrowRight');key(game, 'ArrowRight');
  assert.equal(game.radial.hovered, 'tetra');
  release(game, 'KeyQ');
  assert.equal(t.settings.unitShape, 'tetra');
  assert.equal(sandbox.document.pointerLockElement, t.canvas);
});

test('blur, hidden tab and pause discard hover instead of committing it', () => {
  for (const cancel of [
    game => game.sandbox.dispatchEvent({ type: 'blur' }),
    game => { game.sandbox.document.hidden = true;game.sandbox.document.dispatchEvent({ type: 'visibilitychange' }); },
    game => game.t.openPauseMenu()
  ]) {
    const game = lab(), { t } = game;
    t.settings.unitShape = 'cube';key(game, 'KeyQ');hover(game, 'pyramid');
    cancel(game);release(game, 'KeyQ');
    assert.equal(t.radialOpen(), false);
    assert.equal(t.settings.unitShape, 'cube');
    assert.equal(t.story.mode, 'pause');
  }
});

test('pointer-lock loss, lock errors and WebGL loss cancel selection', () => {
  for (const cancel of [
    game => { game.sandbox.document.pointerLockElement = null;game.sandbox.document.dispatchEvent({ type: 'pointerlockchange' }); },
    game => game.sandbox.document.dispatchEvent({ type: 'pointerlockerror' }),
    game => game.t.canvas.dispatchEvent({ type: 'webglcontextlost' })
  ]) {
    const game = lab(), { t } = game;
    t.settings.unitShape = 'tetra';key(game, 'KeyQ');hover(game, 'pyramid');
    cancel(game);release(game, 'KeyQ');
    assert.equal(t.radialOpen(), false);
    assert.equal(t.settings.unitShape, 'tetra');
  }
});

test('scene transitions and scene replacement cancel a pending selection', () => {
  for (const change of [game => game.t.sceneFade(() => {}), game => game.t.clearNarrativeScene()]) {
    const game = lab(), { t } = game;
    t.settings.unitShape = 'tetra';key(game, 'KeyQ');hover(game, 'pyramid');
    change(game);release(game, 'KeyQ');
    assert.equal(t.radialOpen(), false);
    assert.equal(t.settings.unitShape, 'tetra');
  }
});

test('Q cannot open in boot, campaign, puzzles, nonplaying screens, transitions or another menu', () => {
  for (const restrict of [
    game => { game.t.story.ready = false; },
    game => { game.t.setRunning(false); },
    game => { game.sandbox.document.pointerLockElement = null; },
    game => { game.t.setMarquee({}); },
    game => { game.sandbox.document.body.dataset.booting = 'true'; },
    game => { game.t.story.scene = 'campaign'; },
    game => { game.t.story.scene = 'intro'; },
    game => { game.t.puzzle.active = true; },
    game => { game.t.story.mode = 'menu'; },
    game => { game.t.story.mode = 'pause'; },
    game => { game.t.story.transition = {}; },
    game => { game.sandbox.document.hidden = true; },
    game => { game.sandbox.document.querySelector('#panel').hidden = false; },
    game => { game.sandbox.document.querySelector('#detach-menu').hidden = false; },
    game => { game.sandbox.document.querySelector('#command-menu').hidden = false; },
    game => { game.sandbox.document.activeElement = { tagName: 'INPUT' }; },
    game => { game.sandbox.document.activeElement = { isContentEditable: true }; }
  ]) {
    const game = lab();restrict(game);
    assert.equal(game.t.unitRadialAllowed(), false);
    key(game, 'KeyQ');
    assert.equal(game.t.radialOpen(), false);
  }
});

test('Q does not interrupt a held unit and modified Q shortcuts do not open the selector', () => {
  const game = lab(), { t } = game;
  const g = t.addQubit([0, .05, 0]);
  t.grabQubit({ g, part: g.parts[0], point: g.body.position.clone(), distance: 1 });
  assert(t.getHeld());
  key(game, 'KeyQ');
  assert.equal(t.radialOpen(), false);
  assert.equal(t.getHeld().g, g);
  t.releaseQubit();
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
    key(game, 'KeyQ', { [modifier]: true });
    assert.equal(t.radialOpen(), false);
  }
});

test('releasing Q after eligibility changes never applies the hover choice', () => {
  const game = lab(), { t } = game;
  t.settings.unitShape = 'cube';key(game, 'KeyQ');hover(game, 'tetra');
  t.story.scene = 'campaign';release(game, 'KeyQ');
  assert.equal(t.radialOpen(), false);
  assert.equal(t.settings.unitShape, 'cube');
});

function click(game, button = 0) {
  game.t.canvas.dispatchEvent({ type: 'mousedown', button });
  game.sandbox.document.dispatchEvent({ type: 'mouseup', button });
}
function choose(game, shape) { key(game, 'KeyQ');hover(game, shape);release(game, 'KeyQ'); }

test('Q selection arms exactly one primary click to create the chosen shape', () => {
  for (const shape of ['cube', 'tetra', 'pyramid']) {
    const game = lab(), { t } = game;
    choose(game, shape);
    assert.equal(t.groups.length, 0, 'releasing Q only selects');
    click(game);
    assert.equal(t.groups.length, 1);
    assert.equal(t.groups[0].parts[0].shape, shape);
    assert.equal(t.getHeld(), null, 'creation click is not also a pickup');
    assert.equal(t.getSelected(), null, 'next click can interact normally');
    click(game);
    assert.equal(t.groups.length, 1, 'the creation choice is consumed after one click');
  }
});

test('Escape and secondary click cancel an armed creation without opening another action', () => {
  for (const cancel of [game => key(game, 'Escape'), game => click(game, 2)]) {
    const game = lab(), { t } = game;
    choose(game, 'tetra');cancel(game);
    assert.equal(t.story.mode, 'playing');
    assert.equal(game.sandbox.document.querySelector('#command-menu').hidden, true);
    click(game);
    assert.equal(t.groups.length, 0);
  }
});

test('reopening Q replaces the pending choice, and dead-zone cancellation disarms it', () => {
  const game = lab(), { t } = game;
  choose(game, 'tetra');choose(game, 'pyramid');click(game);
  assert.equal(t.groups[0].parts[0].shape, 'pyramid');
  choose(game, 'cube');key(game, 'KeyQ');release(game, 'KeyQ');click(game);
  assert.equal(t.groups.length, 1, 'cancelled selector must not leave the earlier creation armed');
});

test('pause, lock loss, hidden tab and scene changes discard pending creation', () => {
  for (const cancel of [
    game => game.t.pause(),
    game => { game.sandbox.document.pointerLockElement = null;game.sandbox.document.dispatchEvent({ type: 'pointerlockchange' }); },
    game => { game.sandbox.document.hidden = true;game.sandbox.document.dispatchEvent({ type: 'visibilitychange' }); },
    game => game.t.clearNarrativeScene(),
    game => game.t.sceneFade(() => {})
  ]) {
    const game = lab(), { t, sandbox } = game;
    choose(game, 'tetra');cancel(game);
    Object.assign(t.story, { mode: 'playing', transition: null });
    sandbox.document.hidden = false;sandbox.document.pointerLockElement = t.canvas;
    click(game);
    assert.equal(t.groups.length, 0);
  }
});

test('N consumes the pending creation and a failed full-capacity click can be retried', () => {
  const game = lab(), { t } = game;
  choose(game, 'pyramid');key(game, 'KeyN');click(game);
  assert.equal(t.groups.length, 1, 'N must not leave another piece armed');
  t.clearNarrativeScene();
  for (let i = 0; i < 256; i++) t.addQubit([5 + (i % 16) * .1, .05, 5 + Math.floor(i / 16) * .1]);
  choose(game, 'tetra');click(game);
  assert.equal(t.groups.length, 256);
  t.removeGroup(t.groups[0]);click(game);
  assert.equal(t.groups.length, 256);
  assert.equal(t.groups.at(-1).parts[0].shape, 'tetra');
});
