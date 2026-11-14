const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');

function contactAtBench() {
  const game = createGame(), { t, sandbox } = game;
  t.clearNarrativeScene();
  Object.assign(t.story, { ready: true, mode: 'playing', scene: 'lab', phase: 'idle', progress: { level1: true } });
  sandbox.document.body.dataset.booting = 'false';
  sandbox.document.pointerLockElement = t.canvas;
  t.world.defaultContactMaterial.friction = 0;
  t.world.defaultContactMaterial.restitution = 0;
  const bench = t.setupWorkshop(), g = t.addQubit([bench.p.x - .53, .046, bench.p.z]);
  const W = sandbox.QBitsWorkshop, profile = W.purchase(W.awardCompleted({}, t.story.progress).profile, 'sensor').profile;
  const part = g.parts[0], id = part.id, plan = W.planPartUpgrade(part, { sensor: true }, profile);
  assert(!plan.error, plan.error);
  Object.assign(part, plan.part);
  g.body.fixedRotation = true;
  g.body.updateMassProperties();
  const rotor = t.spawnRotor(t.V(-.6, .3, bench.p.z), { mount: 'fixed' });
  assert(t.linkContactSensor(id, rotor));
  assert(t.configureRotor(rotor, { enabled: true }));
  push(t, g, 80);
  assert.equal(rotor.direction, -1);
  assert.equal(rotor.sensorPulses, 1);
  assert(t.sensorContactActive(t.rotorPart(id)));
  return { ...game, id, aId: rotor.aId, bId: rotor.bId };
}

function push(t, g, steps) {
  for (let i = 0; i < steps; i++) {
    g.body.wakeUp();
    g.body.aabbNeedsUpdate = true;
    g.body.velocity.x = .7;
    t.stepPhysics(1 / 240);
  }
}

function assertResumedContact(game) {
  const { t, id, aId, bId } = game;
  const g = t.rotorPart(id).g, rotor = t.rotors.find(r => r.aId === aId && r.bId === bId);
  assert(rotor);
  assert.equal(rotor.direction, -1);
  assert.equal(rotor.enabled, true);
  // Keep the fixture perpendicular to the bench, as before travelling.
  g.body.fixedRotation = true;
  g.body.updateMassProperties();
  push(t, g, 30);
  assert.equal(rotor.direction, -1, 'restoring a scene must not create another edge from the same wall contact');
  const contactX = g.body.position.x;
  g.body.position.x -= .2;
  g.body.velocity.set(0, 0, 0);
  for (let i = 0; i < 30; i++) t.stepPhysics(1 / 240);
  g.body.position.x = contactX;
  push(t, g, 60);
  assert.equal(rotor.direction, 1, 'a genuine separation and new contact still rearms the restored sensor');
}

test('campaign round trip preserves the latch of a sensor already touching the lab bench', () => {
  const game = contactAtBench(), { t } = game;
  t.beginCampaignLevel(1);
  assert.equal(t.story.scene, 'campaign');
  t.enterLab(false);
  assertResumedContact(game);
});

test('standalone puzzle round trip preserves contact state together with the saved lab mechanism', () => {
  const game = contactAtBench(), { t, sandbox } = game;
  sandbox.document.querySelector('#start-puzzle').dispatchEvent({ type: 'click' });
  assert(t.puzzle.active);
  t.leavePuzzle();
  assert(!t.puzzle.active);
  assertResumedContact(game);
});

test('contact snapshots detach their state and ignore corrupt or foreign records without breaking old snapshots', () => {
  const game = contactAtBench(), { t, id, aId, bId } = game;
  const snapshot = t.saveLab(), savedSensor = snapshot.contacts.sensors.find(s => s.id === id);
  const savedRotor = snapshot.contacts.rotors.find(r => r.key === aId + ':' + bId);
  t.contactStates.get(id).clearSeconds = .04;
  assert.equal(savedSensor.clearSeconds, 0, 'saving must copy state instead of retaining a live reference');
  snapshot.contacts.sensors.push(null, { id, latched: 'yes', clearSeconds: 0 }, { id, latched: true, clearSeconds: Infinity }, { id: aId, latched: true, clearSeconds: 0 });
  snapshot.contacts.rotors.push(null, { key: savedRotor.key, latched: true, clearSeconds: -1 }, { key: '99999:99998', latched: true, clearSeconds: 0 });
  t.beginCampaignLevel(1);
  t.story.lab = snapshot;
  assert.doesNotThrow(() => t.enterLab(false));
  assert.equal(t.contactStates.size, 1);
  assert.equal(t.contactStates.get(id).clearSeconds, 0);
  assert.equal(t.saveLab().contacts.rotors.length, 1);
  savedSensor.latched = false;
  savedRotor.latched = false;
  assertResumedContact(game);

  // Pre-change snapshots have no contacts member and must still restore normally.
  t.beginCampaignLevel(1);
  delete t.story.lab.contacts;
  assert.doesNotThrow(() => t.enterLab(false));
  assert(t.rotorPart(id));
  assert.equal(t.rotors.length, 1);
});
