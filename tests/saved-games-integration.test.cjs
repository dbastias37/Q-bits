// Real game/Cannon and browser events with DOM/GPU stubs; this is not visual QA.
const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');
const saves = require('../assets/js/save-games.js');
const preferences = require('../assets/js/preferences.js');

const plain = value => JSON.parse(JSON.stringify(value));
const vector = value => ['x', 'y', 'z'].map(key => value[key]);
const quaternion = value => ['x', 'y', 'z', 'w'].map(key => value[key]);
function near(actual, expected, label) {
  assert.equal(actual.length, expected.length, label);
  actual.forEach((value, index) => assert(Math.abs(value - expected[index]) < 1e-8,
    `${label}[${index}]: ${value} != ${expected[index]}`));
}
function memory(seed = []) {
  const values = new Map(seed), writes = [];
  const mem = { values, writes, fail: false };
  mem.storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      if (mem.fail) throw new Error('QuotaExceededError');
      values.set(key, String(value)); writes.push(key);
    },
    removeItem() { assert.fail('saving a game must not delete an existing slot'); }
  };
  mem.raw = mode => values.get(saves.KEYS[mode]);
  mem.data = mode => JSON.parse(mem.raw(mode)).data;
  mem.slotWrites = () => writes.filter(key => Object.values(saves.KEYS).includes(key)).length;
  return mem;
}
async function prepared(mem, clock = null) {
  const game = createGame({ storage: mem.storage, graphics: false });
  if (clock) game.sandbox.performance = { now: () => clock.now };
  const doc = game.sandbox.document;
  game.t.canvas.requestPointerLock = () => {
    doc.pointerLockElement = game.t.canvas;
    doc.dispatchEvent({ type: 'pointerlockchange' });
  };
  let done = false;
  const pending = game.api.prepare().then(() => { done = true; });
  for (let i = 0; i < 30 && !done; i++) {
    game.frame(clock ? clock.now : undefined);
    await Promise.resolve();
    await Promise.resolve();
  }
  assert.equal(done, true, 'prepare resolves through the actual frame fences');
  await pending;
  doc.body.dataset.booting = 'false';
  game.api.menu();
  return game;
}
const element = (game, id) => game.sandbox.document.querySelector('#' + id);
const click = (game, id) => element(game, id).dispatchEvent({ type: 'click' });
function key(game, code) {
  const event = { type: 'keydown', code, repeat: false };
  game.sandbox.document.dispatchEvent(event);
  game.sandbox.document.dispatchEvent({ type: 'keyup', code });
  return event;
}
function finishTransition(t) {
  for (let i = 0; i < 60 && t.story.transition; i++) t.tickStory(.1);
  assert.equal(t.story.transition, null, 'the existing scene fade completes');
}
function scene(t) {
  return plain({
    groups: t.groups.map(g => ({
      parts: t.worldParts(g), q: g.body.quaternion,
      v: g.body.velocity, w: g.body.angularVelocity
    })),
    cargos: t.cargos.map(c => ({ id: c.id, p: c.body.position, q: c.body.quaternion,
      v: c.body.velocity, w: c.body.angularVelocity, required: c.required, side: c.side })),
    position: t.position, look: t.getLook(), scene: t.story.scene, level: t.story.level
  });
}
function savedPieceIds(mem) {
  return mem.data('lab').snapshot.groups.flatMap(g => g.parts.map(p => p.id)).sort((a, b) => a - b);
}

test('preloading the prologue and showing the menu never overwrite either saved slot', async () => {
  const mem = memory(), writer = await prepared(mem), { t } = writer;
  assert(t.newSavedGame('lab'));
  t.addQubit([1, .5, -.7], 2, 'pyramid');
  assert(t.saveCurrentGame().ok);
  t.beginCampaignLevel(8);
  assert(t.saveCurrentGame().ok);
  const lab = mem.raw('lab'), campaign = mem.raw('campaign'), writes = mem.slotWrites();
  const reader = await prepared(mem);
  assert.equal(reader.t.story.mode, 'menu');
  assert.equal(reader.t.story.started, false);
  assert.equal(reader.t.story.scene, 'intro', 'the title preloads its scene without entering a saved game');
  assert.equal(mem.raw('lab'), lab);
  assert.equal(mem.raw('campaign'), campaign);
  assert.equal(mem.slotWrites(), writes);
  assert.equal(element(reader, 'main-continue').hidden, false);
  click(reader, 'main-saves');
  assert.equal(element(reader, 'saves-lab-continue').disabled, false);
  assert.equal(element(reader, 'saves-campaign-continue').disabled, false);
  assert.match(element(reader, 'saves-campaign-summary').textContent, /Nivel 8/);
  assert.equal(mem.raw('lab'), lab);
  assert.equal(mem.raw('campaign'), campaign);
});

test('a lab survives a new game instance with piece identities, moods, energy, cargos and poses', async () => {
  const mem = memory(), writer = await prepared(mem), { t } = writer;
  assert(t.newSavedGame('lab'));
  const cube = t.addQubit([1, .5, -.7], 2);
  const tetra = t.addQubit([-1, .3, .6], .5, 'tetra');
  cube.body.quaternion.setFromAxisAngle(t.V(0, 1, 0), .37);
  cube.body.velocity.set(.12, -.03, .04);
  cube.body.angularVelocity.set(.03, .07, -.02);
  Object.assign(cube.parts[0].mood, { name: 'Compañero guardado', energy: .37,
    state: 'restless', reason: 'necesita espacio', agitation: .65, restLeft: 42, blend: [.1, .1, .8] });
  tetra.parts[0].mood.energy = .63;
  const cargo = t.newCargo(t.V(2, 0, 1), 3, 6, '#51b8a8');
  assert(cargo);
  cargo.robotPhysical = true;
  cargo.body.mass = cargo.required * .25;
  cargo.body.type = 1;
  cargo.body.fixedRotation = false;
  cargo.body.position.set(2, .8, 1);
  cargo.body.quaternion.setFromAxisAngle(t.V(0, 0, 1), .2);
  cargo.body.velocity.set(.1, .2, -.1);
  cargo.body.angularVelocity.set(0, .1, .03);
  cargo.body.updateMassProperties();
  assert(t.newCargo(t.V(-2, 0, -1), 2, 4, '#5999c9'));
  t.position.splice(0, 3, .6, t.EYE_HEIGHT, 2.4);
  t.setLook({ camera: [...t.position], yaw: .4, pitch: -.23 });
  t.settings.friction = .27;
  const before = scene(t), ids = before.groups.flatMap(g => g.parts.map(p => p.id));
  assert(t.saveCurrentGame({ manual: true }).ok);
  const bytes = mem.raw('lab');
  const reader = await prepared(mem), r = reader.t;
  assert.equal(mem.raw('lab'), bytes);
  assert(r.continueSavedGame('lab'));
  assert.equal(r.story.scene, 'lab');
  assert.equal(r.story.mode, 'playing');
  assert.deepEqual(Array.from(r.groups.flatMap(g => g.parts.map(p => p.id))).sort((a, b) => a - b), [...ids].sort((a, b) => a - b));
  for (const group of before.groups) {
    const restored = r.groups.find(g => g.parts.some(p => p.id === group.parts[0].id));
    assert(restored);
    const parts = plain(r.worldParts(restored));
    for (const part of group.parts) {
      const found = parts.find(p => p.id === part.id);
      assert.equal(found.weight, part.weight);
      assert.equal(found.shape, part.shape);
      assert.deepEqual(found.mood, part.mood);
      near(vector(found.p), vector(part.p), 'piece position');
      near(quaternion(found.q), quaternion(part.q), 'piece rotation');
    }
    near(vector(restored.body.velocity), vector(group.v), 'group velocity');
    near(vector(restored.body.angularVelocity), vector(group.w), 'group spin');
  }
  assert.deepEqual(scene(r).cargos, before.cargos);
  assert.equal(r.cargos.find(c => c.id === cargo.id).robotPhysical, true);
  assert.equal(r.cargos.find(c => c.id === cargo.id).body.mass, 1.5);
  near(Array.from(r.position), before.position, 'player position');
  assert.equal(r.getLook().yaw, .4);
  assert.equal(r.getLook().pitch, -.23);
  assert.equal(r.settings.friction, .27);
  assert(r.saveCurrentGame().ok, 'restored data can be saved again without a special path');
  assert.deepEqual(savedPieceIds(mem), [...ids].sort((a, b) => a - b));
  assert(r.addQubit([3, .3, -2]).parts[0].id > Math.max(...ids), 'future creations do not reuse a restored ID');
});

test('campaign and lab remain independent while switching and Continue resumes the live scene', async () => {
  const mem = memory(), game = await prepared(mem), { t } = game;
  assert(t.newSavedGame('lab'));
  const kept = t.addQubit([1, .2, .7]);
  kept.parts[0].mood.energy = .22;
  assert(t.saveCurrentGame().ok);
  const bank = mem.data('lab');
  assert(t.newSavedGame('campaign'));
  t.beginCampaignLevel(4);
  t.saveStoryProgress('level2');
  assert(t.saveCurrentGame().ok);
  const campaign = mem.data('campaign');
  assert.deepEqual(mem.data('lab'), bank);
  assert(t.continueSavedGame('lab'));
  assert.deepEqual(mem.data('campaign'), campaign);
  const live = t.groups.find(g => g.parts[0].id === kept.parts[0].id);
  assert(live);
  assert.equal(live.parts[0].mood.energy, .22);
  live.body.position.x += .15;
  t.showSavedGames('lab');
  click(game, 'saves-lab-continue');
  assert.equal(t.story.mode, 'playing');
  assert.equal(t.groups.find(g => g.parts[0].id === live.parts[0].id), live, 'same-session Continue does not rebuild bodies');
  assert.deepEqual(mem.data('campaign'), campaign);
});

test('campaign Continue restarts the saved level from its checkpoint instead of restoring a partial puzzle', async () => {
  const mem = memory(), writer = await prepared(mem), { t } = writer;
  assert(t.newSavedGame('campaign'));
  t.saveStoryProgress('level1');
  t.beginCampaignLevel(7);
  const initial = Array.from(t.position);
  t.position[0] = 3;
  t.groups[0].body.position.x += 1;
  assert(t.saveCurrentGame().ok);
  const reader = await prepared(mem), r = reader.t;
  assert(r.continueSavedGame('campaign'));
  assert.equal(r.story.level, 7);
  assert.equal(r.story.phase, 'challenge');
  assert.equal(r.story.progress.level1, true);
  near(Array.from(r.position), initial, 'checkpoint spawn');
  assert.equal(r.story.elapsed, 0);
  assert.match(element(reader, 'saves-status').textContent, /inicio del nivel/);
});

test('a completed campaign checkpoint continues at the next level after reloading', async () => {
  const mem = memory(), writer = await prepared(mem);
  writer.t.beginCampaignLevel(7);
  writer.t.showCampaignResults();
  assert.equal(mem.data('campaign').checkpoint.completed, true);
  const reader = await prepared(mem);
  reader.t.showSavedGames('campaign');
  assert.match(element(reader, 'saves-campaign-summary').textContent, /Continuar en nivel 8/);
  assert(reader.t.continueSavedGame('campaign'));
  assert.equal(reader.t.story.level, 8);
  assert.equal(reader.t.story.progress.level7, true);
  assert.equal(reader.t.story.phase, 'challenge');
});

test('the final completed checkpoint stays completed instead of creating an out-of-range level', async () => {
  const mem = memory(), writer = await prepared(mem);
  const last = writer.t.LEVELS.length - 1;
  writer.t.beginCampaignLevel(last);
  writer.t.showCampaignResults();
  const reader = await prepared(mem);
  assert(reader.t.continueSavedGame('campaign'));
  assert.equal(reader.t.story.level, last);
  assert.equal(reader.t.story.mode, 'complete');
  assert.equal(reader.t.story.phase, 'complete');
  assert.equal(element(reader, 'complete-next').hidden, true);
  assert.equal(reader.t.story.progress['level' + last], true);
  assert(reader.t.saveCurrentGame().ok);
  assert.equal(mem.data('campaign').checkpoint.completed, true);
});

test('Nueva campaña resets campaign progress while preserving the bank, plans, preferences and research', async () => {
  const pref = preferences.defaults(); pref.volume = 17; pref.physicsHz = 60;
  const mem = memory([[preferences.KEY, JSON.stringify(pref)]]);
  const game = await prepared(mem), { t } = game;
  assert(t.newSavedGame('lab'));
  t.saveShape(t.groups[0]);
  const mechanism = t.spawnRotor(t.V(2, .2, 0));
  assert(mechanism);
  assert(t.saveMechanism(mechanism));
  assert(t.saveCurrentGame().ok);
  t.beginCampaignLevel(3);
  t.saveStoryProgress('level1');
  t.awardWorkshopCredits();
  assert(t.purchaseWorkshopResearch('sensor'));
  const bank = mem.data('lab');
  const sharedKeys = ['qbits.shapes.v1', 'qbits.mechanisms.v1', preferences.KEY, 'qbits.workshop.v1'];
  const shared = sharedKeys.map(key => [key, mem.values.get(key)]);
  shared.forEach(([key, value]) => assert(value, key + ' is durably populated before restart'));
  const profile = plain(t.getWorkshopProfile());
  assert(t.newSavedGame('campaign'));
  assert.equal(t.story.scene, 'intro');
  assert.deepEqual(plain(t.story.progress), {});
  assert.deepEqual(mem.data('campaign').checkpoint, { scene: 'intro', level: 0, completed: false });
  assert.deepEqual(mem.data('lab'), bank);
  assert.deepEqual(plain(t.getWorkshopProfile()), profile);
  for (const [key, value] of shared) assert.equal(mem.values.get(key), value, key + ' remains intact');
  assert.equal(t.savedShapes.length, 1);
  assert.equal(t.savedMechanisms.length, 1);
  assert.equal(t.getPhysicsStep(), 1 / 60);
});

test('Nueva partida del banco replaces only that scene and preserves campaign progress', async () => {
  const mem = memory(), game = await prepared(mem), { t } = game;
  t.beginCampaignLevel(5);
  t.saveStoryProgress('level2');
  const campaign = mem.data('campaign');
  assert(t.newSavedGame('lab'));
  const discarded = t.addQubit([1, .3, 0]).parts[0].id;
  t.newCargo(t.V(-2, 0, 0));
  assert(t.saveCurrentGame().ok);
  t.showSavedGames('lab');
  click(game, 'saves-lab-new');
  assert.equal(element(game, 'saves-confirm').hidden, false);
  click(game, 'saves-confirm-new');
  assert(t.story.transition);
  finishTransition(t);
  assert.equal(t.story.scene, 'lab');
  assert.equal(t.groups.length, 1);
  assert.equal(t.cargos.length, 0);
  assert(!t.groups.some(g => g.parts.some(p => p.id === discarded)));
  assert.equal(t.story.progress.level2, true);
  assert.deepEqual(mem.data('campaign'), campaign);
});

test('cancelling replacement with its button or Escape preserves both slots and the current scene', async () => {
  const mem = memory(), game = await prepared(mem), { t } = game;
  assert(t.newSavedGame('lab'));
  t.addQubit([1, .3, 0]);
  t.showSavedGames('lab');
  const before = scene(t), bank = mem.raw('lab'), writes = mem.slotWrites();
  click(game, 'saves-lab-new');
  assert.equal(t.saveSession.confirmation, 'lab');
  assert.equal(element(game, 'saves-confirm').hidden, false);
  assert.match(element(game, 'saves-confirm-text').textContent, /reemplazará/);
  click(game, 'saves-confirm-cancel');
  assert.equal(element(game, 'saves-confirm').hidden, true);
  assert.equal(t.saveSession.confirmation, null);
  click(game, 'saves-lab-new');
  assert.equal(key(game, 'Escape').defaultPrevented, true);
  assert.equal(element(game, 'saves-confirm').hidden, true);
  assert.equal(t.story.mode, 'saves', 'first Escape dismisses only confirmation');
  assert.equal(mem.raw('lab'), bank);
  assert.equal(mem.raw('campaign'), undefined);
  assert.equal(mem.slotWrites(), writes);
  assert.deepEqual(scene(t), before);
});

test('quota errors preserve saved bytes and live construction for Save, New and mode switching', async () => {
  const mem = memory(), game = await prepared(mem), { t } = game;
  assert(t.newSavedGame('lab'));
  const original = mem.raw('lab');
  t.addQubit([1, .4, -.2]);
  const before = scene(t);
  mem.fail = true;
  const result = t.saveCurrentGame({ manual: true });
  assert.equal(result.ok, false);
  assert.equal(mem.raw('lab'), original);
  assert.deepEqual(scene(t), before);
  assert.match(element(game, 'pause-save-status').textContent, /No se pudo guardar/);
  assert.match(element(game, 'saves-status').textContent, /anterior se conserva/);
  assert.equal(t.newSavedGame('lab'), false);
  assert.equal(mem.raw('lab'), original);
  assert.deepEqual(scene(t), before);
  assert.equal(t.newSavedGame('campaign'), false, 'a failed save blocks abandoning the current bank');
  assert.equal(mem.raw('campaign'), undefined);
  assert.deepEqual(scene(t), before);
  mem.fail = false;
  assert(t.saveCurrentGame({ manual: true }).ok, 'storage recovery allows a later retry');
  assert.notEqual(mem.raw('lab'), original);
  assert.match(element(game, 'pause-save-status').textContent, /guardado/);
});

for (const mode of ['campaign', 'lab']) {
  for (const [name, raw, summary] of [
    ['invalid JSON', '{broken', /No se puede leer/],
    ['a future version', JSON.stringify({ format: 'qbits-save', version: 999, mode, data: {} }), /versión distinta/]
  ]) {
    test(`${name} in the ${mode} slot is preserved and Continue is disabled after boot`, async () => {
      const mem = memory([[saves.KEYS[mode], raw]]), game = await prepared(mem);
      click(game, 'main-saves');
      const before = scene(game.t);
      assert.equal(element(game, 'saves-' + mode + '-continue').disabled, true);
      assert.match(element(game, 'saves-' + mode + '-summary').textContent, summary);
      assert.equal(game.t.continueSavedGame(mode), false);
      assert.equal(mem.raw(mode), raw);
      assert.equal(mem.slotWrites(), 0);
      assert.deepEqual(scene(game.t), before);
      click(game, 'saves-' + mode + '-new');
      assert.equal(element(game, 'saves-confirm').hidden, false, 'replacement still requires an explicit choice');
      click(game, 'saves-confirm-cancel');
      assert.equal(mem.raw(mode), raw);
    });
  }
}

test('real RAF autosaves at fifteen seconds, then waits another interval before the next save', async () => {
  const clock = { now: 0 }, mem = memory(), game = await prepared(mem, clock), { t } = game;
  assert(t.newSavedGame('lab'));
  const first = t.addQubit([1, .3, 0]).parts[0].id;
  const writes = mem.slotWrites();
  clock.now = 14999; game.frame(clock.now);
  assert.equal(mem.slotWrites(), writes);
  assert(!savedPieceIds(mem).includes(first));
  clock.now = 15000; game.frame(clock.now);
  assert.equal(mem.slotWrites(), writes + 1);
  assert(savedPieceIds(mem).includes(first));
  const second = t.addQubit([-1, .3, 0]).parts[0].id;
  clock.now = 29999; game.frame(clock.now);
  assert.equal(mem.slotWrites(), writes + 1);
  assert(!savedPieceIds(mem).includes(second));
  clock.now = 30000; game.frame(clock.now);
  assert.equal(mem.slotWrites(), writes + 2);
  assert(savedPieceIds(mem).includes(second));
});

test('pause, the explicit Save button, pagehide and hiding the page persist the current bank', async () => {
  const mem = memory(), game = await prepared(mem), { t, sandbox } = game;
  assert(t.newSavedGame('lab'));
  const one = t.addQubit([1, .3, 0]).parts[0].id;
  t.openPauseMenu();
  assert.equal(t.story.mode, 'pause');
  assert(savedPieceIds(mem).includes(one));
  const two = t.addQubit([-1, .3, 0]).parts[0].id;
  click(game, 'pause-save');
  assert(savedPieceIds(mem).includes(two));
  assert.match(element(game, 'pause-save-status').textContent, /guardado/);
  t.resumeGame();
  const three = t.addQubit([2, .3, 0]).parts[0].id;
  sandbox.dispatchEvent({ type: 'pagehide' });
  assert(savedPieceIds(mem).includes(three));
  const four = t.addQubit([-2, .3, 0]).parts[0].id;
  sandbox.document.hidden = true;
  sandbox.document.dispatchEvent({ type: 'visibilitychange' });
  assert(savedPieceIds(mem).includes(four));
  assert.equal(t.story.mode, 'pause');
});

test('saving defers held pieces and unfinished placement without cancelling them or replacing the last save', async () => {
  const clock = { now: 0 }, mem = memory(), game = await prepared(mem, clock), { t, sandbox } = game;
  assert(t.newSavedGame('lab'));
  sandbox.document.pointerLockElement = t.canvas;
  t.setLook({ camera: [0, .4, 2], yaw: 0, pitch: 0 });
  const g = t.addQubit([0, .4, 1.4]);
  t.grabQubit({ g, part: g.parts[0], point: g.body.position.clone(), distance: .6 });
  const held = t.getHeld(), original = mem.raw('lab');
  assert(held);
  clock.now = 15000; t.autosaveGame(clock.now);
  assert.equal(mem.raw('lab'), original);
  assert.equal(t.getHeld(), held);
  assert.equal(t.saveCurrentGame({ manual: true }).deferred, true);
  assert.match(element(game, 'pause-save-status').textContent, /suelta la pieza/);
  t.releaseQubit();
  clock.now = 16000; t.autosaveGame(clock.now);
  assert(savedPieceIds(mem).includes(g.parts[0].id));
  t.setLook({ camera: [2, 2.5, 2], yaw: 0, pitch: Math.atan2(-2.5, 2) });
  assert(t.beginCreationPlacement('cube'));
  const draft = t.getCreationPreview(), saved = mem.raw('lab');
  assert(draft);
  clock.now = 31000; t.autosaveGame(clock.now);
  assert.equal(mem.raw('lab'), saved);
  assert.equal(t.getCreationPreview(), draft);
  assert.equal(t.saveCurrentGame({ manual: true }).deferred, true);
  assert.equal(t.getCreationPreview(), draft);
  key(game, 'Escape');
  assert.equal(t.getCreationPreview(), null);
});

test('saved-game screen consumes game shortcuts, freezes simulation and Escape returns to its caller', async () => {
  const clock = { now: 0 }, mem = memory(), game = await prepared(mem, clock), { t } = game;
  click(game, 'main-saves');
  assert.equal(t.story.mode, 'saves');
  key(game, 'Escape');
  assert.equal(t.story.mode, 'menu');
  assert(t.newSavedGame('lab'));
  const falling = t.addQubit([1, 1, 0]);
  assert(t.showSavedGames('lab'));
  const before = scene(t), time = t.getSimTime(), writes = mem.slotWrites();
  assert.equal(element(game, 'saves-screen').hidden, false);
  key(game, 'KeyP');
  assert.equal(t.story.mode, 'saves');
  assert.equal(t.advanceSimulation(.05), 0);
  clock.now = 20000; game.frame(clock.now);
  assert.equal(t.getSimTime(), time);
  assert.equal(falling.body.position.y, 1);
  assert.deepEqual(scene(t), before);
  assert.equal(mem.slotWrites(), writes, 'the menu does not run timed autosaves');
  key(game, 'Escape');
  assert.equal(t.story.mode, 'playing');
  assert.equal(element(game, 'saves-screen').hidden, true);
  clock.now += 20; game.frame(clock.now);
  clock.now += 20; game.frame(clock.now);
  assert(t.getSimTime() > time);
  assert(t.getSimTime() - time < .05, 'resuming does not replay time spent at the menu');
});

test('the startup shortcut opens saved games without replacing a level-twelve checkpoint', async () => {
  const mem = memory(), writer = await prepared(mem);
  writer.t.beginCampaignLevel(12);
  assert(writer.t.saveCurrentGame().ok);
  const checkpoint = mem.raw('campaign'), reader = await prepared(mem);
  assert.equal(key(reader, 'Backquote').defaultPrevented, true);
  assert.equal(reader.t.story.mode, 'saves');
  assert.equal(reader.t.story.started, false);
  assert.equal(element(reader, 'saves-screen').hidden, false);
  assert.equal(element(reader, 'wake-screen').hidden, true);
  assert.match(element(reader, 'saves-campaign-summary').textContent, /Nivel 12/);
  assert.equal(mem.raw('campaign'), checkpoint);
  assert(reader.t.continueSavedGame('campaign'));
  assert.equal(reader.t.story.level, 12);
});

test('pagehide during Nueva campaña fade cannot write the previous checkpoint over the new slot', async () => {
  const mem = memory(), writer = await prepared(mem), { t } = writer;
  t.beginCampaignLevel(7);
  assert(t.newSavedGame('campaign', { fade: true }));
  assert(t.story.transition);
  assert.equal(t.story.level, 7, 'the outgoing scene is still present during the fade');
  const fresh = mem.raw('campaign');
  assert.deepEqual(mem.data('campaign'), {
    checkpoint: { scene: 'intro', level: 0, completed: false }, progress: {}
  });
  writer.sandbox.dispatchEvent({ type: 'pagehide' });
  assert.equal(mem.raw('campaign'), fresh);
  const reader = await prepared(mem);
  assert(reader.t.continueSavedGame('campaign'));
  assert.equal(reader.t.story.scene, 'intro');
  assert.deepEqual(plain(reader.t.story.progress), {});
  assert.equal(mem.raw('campaign'), fresh);
});

test('legacy campaign credits survive Nueva campaña and a reload before its fade finishes', async () => {
  const mem = memory([['qbits.campaign.v1', JSON.stringify({ intro: true, level1: true })]]);
  const writer = await prepared(mem);
  assert.equal(writer.t.story.progress.level1, true);
  assert(writer.t.newSavedGame('campaign', { fade: true }));
  assert(writer.t.story.transition);
  writer.sandbox.dispatchEvent({ type: 'pagehide' });
  const reader = await prepared(mem);
  assert.equal(reader.t.getWorkshopProfile().credits, 12);
  assert.deepEqual(plain(reader.t.getWorkshopProfile().claimed), [1]);
  assert(reader.t.continueSavedGame('campaign'));
  assert.deepEqual(plain(reader.t.story.progress), {});
  assert.equal(reader.t.story.scene, 'intro');
  assert(reader.t.newSavedGame('campaign'));
  assert.equal(reader.t.getWorkshopProfile().credits, 12, 'another restart cannot claim the old reward again');
});
