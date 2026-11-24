// Actual game/Cannon and persistence code with DOM/GPU stubs. These checks do
// not certify the appearance, readability or performance of a browser playthrough.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');
const savedGames = require('../assets/js/save-games.js');
const passage = require('../assets/js/factory-passage.js');
const plain = value => JSON.parse(JSON.stringify(value));

function memory() {
  const values = new Map();
  return {
    storage:{getItem:key => values.get(key) ?? null, setItem:(key, value) => values.set(key, String(value))},
    data:() => JSON.parse(values.get(savedGames.KEYS.campaign)).data,
    raw:() => values.get(savedGames.KEYS.campaign)
  };
}
function game(mem = memory()) {
  const instance = createGame({storage:mem.storage, graphics:false}), {t, sandbox} = instance;
  t.story.ready = true; sandbox.document.body.dataset.booting = 'false';
  t.canvas.requestPointerLock = () => {
    sandbox.document.pointerLockElement = t.canvas;
    sandbox.document.dispatchEvent({type:'pointerlockchange'});
  };
  return {...instance, mem};
}
function finishReading(t) {
  for (let index = 0; index < 4 && t.story.dialogue?.modal; index++) t.advanceDialogue();
  assert.equal(!!t.story.dialogue?.modal, false, 'reading ends only on the explicit advance action');
}
function opening() {
  const instance = game(), {t} = instance;
  t.beginIntro();
  const guide = t.groups.find(group => group.parts.some(part => part.id === t.story.guideId));
  instance.guideId = guide.parts[0].id;
  instance.guideMood = plain(guide.parts[0].mood);
  t.beginOpeningSupply(); finishReading(t);
  return instance;
}
const id = t => t.story.firstCycle.ledger.records[0].id;
const group = t => t.groups.find(g => g.parts.some(part => part.id === id(t)));
const record = t => t.story.firstCycle.ledger.records[0];
function until(t, predicate, seconds = 3) {
  for (let index = 0; index < seconds * 40 && !predicate(); index++) t.tickStory(.025);
  assert(predicate(), 'the expected physical transaction completes without replacing its identity');
}
function emit(t) {
  assert.equal(t.requestOpeningCompanion(), true);
  until(t, () => record(t).location === 'room');
  finishReading(t);
  return group(t);
}
function grab(t, g = group(t)) {
  t.position.splice(0, 3, 0, t.EYE_HEIGHT, .2);
  t.setLook({camera:[...t.position], yaw:0, pitch:-.35});
  t.canvas.requestPointerLock();
  const point = t.poses(g)[0].p, distance = point.distanceTo(t.V(...t.getLook().camera));
  assert(distance < 2.7);
  t.grabQubit({g, part:g.parts[0], point, distance});
  assert.equal(t.getHeld()?.g, g, 'the actual grab creates the hand constraint');
  return g;
}
function place(t, point, g = group(t)) {
  g.body.quaternion.set(0, 0, 0, 1);
  const half = (t.bounds(g).max.y - t.bounds(g).min.y) / 2;
  g.body.position.set(point[0], (point === t.openingSupply.hatch ? .07 : 0) + half + .004, point[2]);
  g.body.velocity.set(0, 0, 0); g.body.angularVelocity.set(0, 0, 0); g.body.aabbNeedsUpdate = true;
  t.world.broadphase.dirty = true;
  return g;
}
function reachReturn(t) {
  emit(t); grab(t); t.releaseQubit(); place(t, t.openingSupply.pad);
  t.tickStory(.51);
  assert.equal(t.story.firstCycle.phase, 'return');
  finishReading(t);
}
function beginReturn(t) {
  reachReturn(t); place(t, t.openingSupply.hatch); t.tickStory(.51);
  assert.equal(t.returnOpeningCompanion(), true);
}
function complete(t) {
  beginReturn(t); until(t, () => t.story.firstCycle.phase === 'closing'); finishReading(t);
}
function reload(instance) {
  const result = instance.t.saveCurrentGame({manual:true});
  assert.equal(result.ok, true, result.error);
  const bytes = instance.mem.raw(), reader = game(instance.mem);
  assert.equal(reader.t.continueSavedGame('campaign'), true, reader.t.saveSession.message);
  assert.equal(instance.mem.raw(), bytes, 'loading does not rewrite or replenish the attempt');
  return reader;
}
function material(t) {
  const c = t.story.firstCycle;
  return [...c.reserveParts, ...t.groups.flatMap(g => t.worldParts(g))].filter(part => part.id === id(t));
}

test('opening preserves the guide and requests one real companion without an expiry', () => {
  const instance = opening(), {t} = instance, companionId = id(t);
  assert.equal(t.story.guideId, instance.guideId);
  assert.deepEqual(plain(t.groups.find(g => g.parts[0].id === instance.guideId).parts[0].mood), instance.guideMood);
  assert.notEqual(companionId, instance.guideId);
  assert.equal(t.story.firstCycle.ledger.offerSeconds, null);
  assert.equal(material(t).length, 1);
  const requested = emit(t), mood = requested.parts[0].mood;
  assert.equal(record(t).claimed, true);
  assert.equal(record(t).dispatches, 1);
  assert.equal(t.requestOpeningCompanion(), false);
  t.tickStory(1000);
  assert.equal(group(t), requested);
  assert.equal(record(t).location, 'room');
  assert.equal(record(t).claimed, true);
  assert.equal(record(t).dispatches, 1);
  mood.energy = .31;
  t.updateMoods(30);
  assert.equal(mood.energy, .31, 'waiting in the supply attempt does not recharge its piece');
  assert.deepEqual(plain(t.story.firstCycle.ledger.facts.taken), []);
  assert.equal(material(t).length, 1);
});

test('an occupied physical outlet leaves the request protected and does not consume another piece', () => {
  const {t} = opening(), guide = t.groups.find(g => g.parts[0].id === t.story.guideId);
  place(t, t.openingSupply.hatch, guide);
  assert.equal(t.requestOpeningCompanion(), true);
  for (let index = 0; index < 30; index++) t.tickStory(.1);
  assert.equal(record(t).location, 'queued');
  assert.equal(record(t).claimed, true);
  assert.equal(record(t).dispatches, 0);
  assert.equal(t.story.firstCycle.reserveParts.length, 1);
  assert.equal(group(t), undefined);
  assert.equal(t.requestOpeningCompanion(), false);
  guide.body.position.set(-.7, .05, .7); guide.body.aabbNeedsUpdate = true;
  until(t, () => record(t).location === 'room');
  assert.equal(record(t).dispatches, 1);
  assert.equal(t.story.firstCycle.reserveParts.length, 0);
  assert.equal(material(t).length, 1);
});

test('only the actual hand hook and a stable placement satisfy S01; rescue cannot substitute for either', () => {
  const {t} = opening(); emit(t);
  assert.equal(t.recoverOpeningCompanion(), true);
  place(t, t.openingSupply.pad); t.tickStory(1);
  assert.equal(t.story.firstCycle.phase, 'take');
  assert.deepEqual(plain(t.story.firstCycle.ledger.facts.taken), []);
  assert.deepEqual(plain(t.story.firstCycle.ledger.facts.placed), []);
  grab(t);
  assert.deepEqual(plain(t.story.firstCycle.ledger.facts.taken), [id(t)]);
  place(t, t.openingSupply.pad); t.tickStory(1);
  assert.equal(t.story.firstCycle.phase, 'take', 'a held piece is not an accepted placement');
  t.releaseQubit(); place(t, t.openingSupply.pad);
  t.tickStory(.2); t.tickStory(.2);
  assert.equal(t.story.firstCycle.phase, 'take');
  t.tickStory(.11);
  assert.equal(t.story.firstCycle.phase, 'return');
  assert.deepEqual(plain(t.story.firstCycle.ledger.facts.placed), [id(t)]);
});

test('voluntary return waits for stable physical acceptance and preserves identity, charge and fatigue', () => {
  const {t} = opening(); reachReturn(t);
  const g = group(t), companionId = id(t);
  Object.assign(g.parts[0].mood, {name:'Compañero de prueba', energy:.273, state:'restless', restLeft:39,
    restTotal:72, agitation:.41, reason:'acalorado', blend:[.2, .1, .7]});
  const before = plain(t.worldParts(g)[0]);
  assert.equal(t.returnOpeningCompanion(), false, 'placing on the work pad is not returning');
  place(t, t.openingSupply.hatch);
  t.tickStory(.4); assert.equal(t.returnOpeningCompanion(), false);
  t.tickStory(.11); assert.equal(t.returnOpeningCompanion(), true);
  assert.equal(record(t).claimed, true);
  assert.equal(record(t).location, 'returning');
  assert.deepEqual(plain(t.story.firstCycle.ledger.facts.voluntaryReturns), []);
  assert.equal(t.openingDestinations().complete, false);
  assert.equal(t.openingDestinations().pending[0].location, 'transit');
  until(t, () => t.story.firstCycle.phase === 'closing');
  const accepted = t.story.firstCycle.reserveParts[0];
  assert.equal(accepted.id, companionId);
  assert.equal(accepted.weight, before.weight);
  assert.equal(accepted.shape, before.shape);
  assert.deepEqual(plain(accepted.mood), before.mood);
  assert.equal(record(t).claimed, false);
  assert.equal(record(t).dispatches, 1);
  assert.deepEqual(plain(t.story.firstCycle.ledger.facts.voluntaryReturns), [companionId]);
  assert.equal(group(t), undefined);
  assert.equal(material(t).length, 1);
  assert.equal(t.openingDestinations().complete, true);
  assert.equal(t.openingDestinations().locations.reserve, 1);
  assert.equal(t.openingDestinations().matter, 1);
  assert(t.groups.some(member => member.parts[0].id === t.story.guideId), 'the guide is outside the return manifest');
});

test('recovery during return cancels credit while conserving the same physical state and claim', () => {
  const {t} = opening(); beginReturn(t); t.tickStory(.2);
  const original = plain(t.worldParts(group(t))[0]);
  assert.equal(t.recoverOpeningCompanion(), true);
  assert.equal(record(t).location, 'room');
  assert.equal(record(t).claimed, true);
  assert.equal(record(t).dispatches, 1);
  assert.equal(t.story.firstCycle.phase, 'return');
  assert.deepEqual(plain(t.story.firstCycle.ledger.facts.voluntaryReturns), []);
  assert.equal(group(t).parts[0].id, original.id);
  assert.deepEqual(plain(group(t).parts[0].mood), original.mood);
  assert.equal(material(t).length, 1);
  assert.equal(t.openingDestinations().complete, false);
});

test('saving and reloading each phase retains the same exclusive identity and current transfer', () => {
  const phases = {
    request:t => {},
    queued:t => { t.requestOpeningCompanion(); },
    emitting:t => { t.requestOpeningCompanion(); t.tickStory(.2); },
    available:t => { emit(t); },
    held:t => { emit(t); grab(t); },
    return:t => { reachReturn(t); },
    returning:t => { beginReturn(t); t.tickStory(.25); },
    closing:t => { complete(t); }
  };
  for (const [name, arrange] of Object.entries(phases)) {
    const writer = opening(); arrange(writer.t);
    const t = writer.t, savedId = id(t), before = plain(t.openingPayload()), beforePart = plain(material(t)[0]);
    const reader = reload(writer), r = reader.t;
    assert.equal(id(r), savedId, name);
    assert.equal(r.story.firstCycle.phase, before.phase, name);
    assert.deepEqual(plain(r.story.firstCycle.ledger), before.ledger, name);
    assert.equal(r.story.firstCycle.transferTime, before.transferTime, name);
    assert.equal(r.story.firstCycle.time, before.time, name);
    assert.equal(material(r).length, 1, name + ': one physical payload across reserve and scene');
    assert.deepEqual(plain(material(r)[0].mood), beforePart.mood, name + ': retained state');
    assert.equal(r.getHeld(), null, name + ': a stale hand constraint is never restored');
    assert.equal(r.story.firstCycle.reserveParts.some(part => part.id === savedId), ['reserve', 'queued'].includes(record(r).location), name);
    assert.equal(r.saveCurrentGame().ok, true, name + ': restored state remains saveable');
    if (record(r).location === 'emitting') {
      finishReading(r); until(r, () => record(r).location === 'room');
      assert.equal(record(r).dispatches, before.ledger.records[0].dispatches, 'loading cannot emit a second copy');
    }
  }
});

test('loading a held piece over the work target cannot award the pending placement', () => {
  const writer = opening(), {t} = writer; emit(t); grab(t); place(t, t.openingSupply.pad);
  assert.equal(t.story.firstCycle.phase, 'take');
  assert.equal(t.openingStableAt(t.openingSupply.pad), false);
  const {t:r} = reload(writer); finishReading(r);
  for (let index = 0; index < 40; index++) r.tickStory(.05);
  assert.equal(record(r).claimed, true);
  assert.equal(r.story.firstCycle.phase, 'take', 'a technical release on load is not a deliberate placement');
  assert.deepEqual(plain(r.story.firstCycle.ledger.facts.placed), []);
  grab(r); r.releaseQubit(); place(r, r.openingSupply.pad); r.tickStory(.51);
  assert.equal(r.story.firstCycle.phase, 'return', 'retaking and physically placing the same piece completes the pending action');
  assert.deepEqual(plain(r.story.firstCycle.ledger.facts.placed), [id(r)]);
});

test('modal reading and pause freeze the transaction; contextual menus and the tablet keep it running', () => {
  const instance = opening(), {t, sandbox} = instance;
  t.requestOpeningCompanion(); t.tickStory(.2);
  const captured = () => plain({time:t.story.firstCycle.time, transfer:t.story.firstCycle.transferTime,
    ledger:t.story.firstCycle.ledger, pose:group(t).body.position, sim:t.getSimTime()});
  t.openingResetPrompt(() => assert.fail('reading a prompt must not reset the attempt'));
  assert.equal(t.story.dialogue.modal, true);
  let before = captured();
  t.tickStory(30); t.advanceSimulation(30);
  assert.deepEqual(captured(), before);
  t.hideStoryDialogue();
  t.openPauseMenu(); before = captured();
  t.tickStory(30); t.advanceSimulation(30);
  assert.deepEqual(captured(), before);
  t.resumeGame();
  const menu = sandbox.document.querySelector('#command-menu'); menu.hidden = false;
  before = captured(); t.tickStory(.05); t.advanceSimulation(.05);
  assert(t.story.firstCycle.time > before.time);
  assert(t.story.firstCycle.transferTime > before.transfer);
  assert(t.getSimTime() > before.sim);
  menu.hidden = true;
  const event = {code:'KeyP', repeat:false, preventDefault(){}};
  t.storyInput(event);
  assert.equal(sandbox.document.querySelector('#panel').hidden, false);
  assert.equal(t.storySuspended(), false, 'operational tablet is not a pause menu');
  before = captured(); t.tickStory(.05); t.advanceSimulation(.05);
  assert(t.story.firstCycle.time > before.time);
  assert(t.story.firstCycle.transferTime > before.transfer);
  assert(t.getSimTime() > before.sim);
});

test('closing archives the returned reserve and continues the existing level without reclaiming the guide', () => {
  const writer = opening(), {t} = writer; complete(t);
  const companionId = id(t), guideId = t.story.guideId, payload = plain(t.story.firstCycle.reserveParts[0]);
  assert.equal(t.openingDestinations().complete, true);
  t.position[2] = -4.4;
  until(t, () => !!t.story.transition, 3);
  for (let index = 0; index < 60 && t.story.transition; index++) t.tickStory(.1);
  assert.equal(t.story.transition, null);
  assert.equal(t.story.firstCycle, null);
  assert.equal(t.story.level, 1);
  assert.equal(t.story.guideId, guideId);
  assert.equal(t.story.openingReserve.reserveParts.length, 1);
  assert.deepEqual(plain(t.story.openingReserve.reserveParts[0]), payload);
  assert.equal(t.groups.some(g => g.parts.some(part => part.id === companionId)), false);
  assert.equal(t.groups.filter(g => g.parts.some(part => part.id === guideId)).length, 1);
  const result = t.saveCurrentGame(); assert.equal(result.ok, true, result.error);
  assert.equal(writer.mem.data().openingReserve.reserveParts[0].id, companionId);
  const reader = reload(writer);
  assert.equal(reader.t.story.level, 1);
  assert.equal(reader.t.story.openingReserve.reserveParts[0].id, companionId);
  assert.deepEqual(plain(reader.t.story.openingReserve.reserveParts[0].mood), payload.mood);
  assert.equal(reader.t.groups.some(g => g.parts.some(part => part.id === companionId)), false, 'archived identity is never respawned as a level actor');
});

async function prepareOpeningReader(reader) {
  let ready = false;const preparing = reader.api.prepare().then(() => { ready = true; });
  for (let index = 0; index < 30 && !ready; index++) { reader.frame();await Promise.resolve();await Promise.resolve(); }
  assert(ready);await preparing;reader.sandbox.document.body.dataset.booting = 'false';
}
function finishOpeningTransition(t) {
  for (let index = 0; index < 100 && t.story.transition; index++) t.tickStory(.05);
  assert.equal(t.story.transition, null);
}
function leaveClosedOpening(t) {
  finishReading(t);t.position[2] = -4.4;
  until(t, () => !!t.story.transition, 3);finishOpeningTransition(t);
  assert.equal(t.story.level, 1);assert.equal(t.story.firstCycle, null);
}
function finishOpeningWalk(t) {
  t.hideStoryDialogue();t.finishCampaignLevel();finishOpeningTransition(t);finishReading(t);
  const g = t.groups.find(group => group.parts.some(part => part.id === t.story.guideId));
  t.story.passage.state.guideDistance = passage.ROUTE_LENGTH;t.story.passage.state.arrived = true;
  g.body.position.set(passage.EXIT[0], .049, passage.EXIT[2]);
  t.position.splice(0, 3, passage.EXIT[0], t.EYE_HEIGHT, passage.EXIT[2]);
  t.tickStory(.05);finishOpeningTransition(t);
  assert.equal(t.story.level, 2);assert.equal(t.story.passage, null);
}

test('cold reload after return reserves the archived identity through the walk and subsequent cycle-two reload', () => {
  for (const checkpoint of ['closed supply', 'first route']) {
    const writer = opening();complete(writer.t);
    const archived = plain(writer.t.story.firstCycle.reserveParts[0]);
    if (checkpoint === 'first route') leaveClosedOpening(writer.t);
    const reader = reload(writer), r = reader.t;
    if (r.story.firstCycle) leaveClosedOpening(r);
    finishOpeningWalk(r);
    assert.deepEqual(plain(r.story.openingReserve.reserveParts[0]), archived, checkpoint);
    assert.equal(r.groups.some(group => group.parts.some(part => part.id === archived.id)), false, checkpoint);
    assert.equal(r.groups.length, 2, 'only the two actors of cycle two are materialized');
    const again = reload(reader).t;
    assert.equal(again.story.level, 2);
    assert.deepEqual(plain(again.story.openingReserve.reserveParts[0]), archived);
    assert.equal(again.groups.some(group => group.parts.some(part => part.id === archived.id)), false);
  }
});

test('cold chapter selection and a visit to the bank preserve the closed reserve without materializing it', async () => {
  const writer = opening();complete(writer.t);leaveClosedOpening(writer.t);
  assert(writer.t.saveCurrentGame().ok);
  const archive = plain(writer.t.story.openingReserve), reader = game(writer.mem), {t, sandbox} = reader;
  await prepareOpeningReader(reader);
  assert.deepEqual(plain(t.story.openingReserve), archive, 'startup retains the archive before Continue is selected');
  function selectCycleTwo() {
    t.showLevelSelector();sandbox.document.querySelector('#level-list').children[2].click();finishOpeningTransition(t);
    assert.equal(t.story.level, 2);assert.deepEqual(plain(t.story.openingReserve), archive);
    assert.equal(t.groups.some(group => group.parts.some(part => part.id === archive.reserveParts[0].id)), false);
    assert(t.saveCurrentGame().ok);assert.deepEqual(plain(writer.mem.data().openingReserve), archive);
  }
  selectCycleTwo();t.enterLab(false);selectCycleTwo();
});

test('a collision between archived matter and a physical scene cannot overwrite the prior campaign save', () => {
  const writer = opening();complete(writer.t);leaveClosedOpening(writer.t);
  assert(writer.t.saveCurrentGame().ok);
  const previous = writer.mem.raw(), {t} = writer, part = t.story.openingReserve.reserveParts[0];
  t.makeGroup([{...part,p:t.V(1,.05,1),q:t.Q()}]);
  const result = t.saveCurrentGame({manual:true});
  assert.equal(result.ok, false);assert.match(result.error, /reserva inicial/);
  assert.equal(writer.mem.raw(), previous, 'the valid slot remains byte-for-byte intact');
});

test('cold chapter selection preserves a claimed request until the announced reset is explicitly accepted', async () => {
  for (const fromBank of [false, true]) {
    const writer = opening();assert(writer.t.requestOpeningCompanion());assert(writer.t.saveCurrentGame().ok);
    const previous = writer.mem.raw(), saved = writer.mem.data();
    assert.equal(saved.firstCycle.ledger.records[0].claimed, true);
    const reader = game(writer.mem), {t, sandbox} = reader;await prepareOpeningReader(reader);
    if (fromBank) t.enterLab(false);
    t.showLevelSelector();
    const select = () => sandbox.document.querySelector('#level-list').children[2].click();
    const choose = label => {
      t.advanceDialogue();
      const button = sandbox.document.querySelector('#story-choices').children.find(item => item.textContent === label);
      assert(button, label);button.click();
    };
    select();assert.equal(t.story.transition, null);assert.match(t.story.dialogue.text, /Reiniciar este intento/);
    assert.equal(writer.mem.raw(), previous, 'showing the reset does not replace the pending attempt');
    choose('Seguir aquí');assert.equal(t.story.mode, 'levels');assert.equal(t.story.transition, null);
    assert.equal(writer.mem.raw(), previous, 'cancellation keeps the claimed piece and original save bytes');
    select();assert.equal(t.story.transition, null);assert.equal(writer.mem.raw(), previous);
    choose('Reiniciar el intento');assert(t.story.transition);finishOpeningTransition(t);
    assert.equal(t.story.level, 2);assert.equal(t.story.firstCycle, null);
    assert.equal(Object.hasOwn(writer.mem.data(), 'firstCycle'), false, 'only the accepted reset replaces the old attempt');
  }
});
