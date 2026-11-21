// Scheduler integration: the production game and Cannon run unchanged in the
// headless harness. These checks do not measure browser FPS or GPU performance.
const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');
const preferences = require('../assets/js/preferences.js');

function near(actual, expected, epsilon = 1e-8) {
  assert(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

function lab(physicsHz = 60) {
  const game = createGame({graphics:false});
  const {t, sandbox} = game;
  const doc = sandbox.document;
  t.clearNarrativeScene();
  Object.assign(t.story, {ready:true, mode:'playing', scene:'lab', phase:'idle'});
  doc.body.dataset.booting = 'false';
  t.applyPreferences({...preferences.defaults(), physicsHz, shadows:'off'});
  t.canvas.requestPointerLock = () => {
    doc.pointerLockElement = t.canvas;
    doc.dispatchEvent({type:'pointerlockchange'});
  };
  t.canvas.requestPointerLock();
  t.setRunning(true);
  t.resetSimulationClock(0, true);
  return {...game, doc};
}

function clocks(t) {
  return JSON.parse(JSON.stringify(t.getTickState()));
}

function worldState(t) {
  return JSON.parse(JSON.stringify({
    clocks: t.getTickState(),
    time: t.world.time,
    bodies: t.groups.map(g => ({
      p:g.body.position, q:g.body.quaternion,
      v:g.body.velocity, w:g.body.angularVelocity,
      energy:g.parts.map(p => p.mood.energy)
    }))
  }));
}

function advance(t, frames, dt = 1 / 60) {
  for (let i = 0; i < frames; i++) t.advanceSimulation(dt);
}

for (const physicsHz of [60, 120, 240]) {
  for (const refreshHz of [30, 60, 144]) {
    test(`${refreshHz} Hz RAF advances one simulated second at ${physicsHz} Hz physics and 15 Hz logic`, () => {
      const {t} = lab(physicsHz);
      const cube = t.addQubit([0, 1, 0]);
      const before = clocks(t), worldSteps = t.world.stepnumber;
      for (let frame = 1; frame <= refreshHz; frame++) {
        t.frame(frame * 1000 / refreshHz);
      }
      const after = clocks(t);
      assert.equal(after.physics - before.physics, physicsHz);
      assert.equal(after.logic - before.logic, 15);
      near(after.simTime - before.simTime, 1);
      assert.equal(t.world.stepnumber - worldSteps, physicsHz);
      near(after.physicsAccumulator, 0);
      near(after.logicAccumulator, 0);
      near(after.droppedSeconds, before.droppedSeconds);
      assert(cube.body.position.y < .1, 'Cannon advances the falling piece, not only the counters');
    });
  }
}

for (const physicsHz of [60, 120, 240]) {
  test(`a one-second stall accepts only 50 ms at ${physicsHz} Hz and leaves no catch-up debt`, () => {
    const {t} = lab(physicsHz);
    const before = clocks(t), worldSteps = t.world.stepnumber;
    near(t.advanceSimulation(1), .05);
    const stalled = clocks(t);
    assert.equal(stalled.physics - before.physics, physicsHz / 20);
    assert.equal(stalled.logic - before.logic, 0);
    near(stalled.droppedSeconds - before.droppedSeconds, .95);
    near(stalled.physicsAccumulator, 0);
    near(stalled.simTime - before.simTime, .05);
    assert.equal(t.world.stepnumber - worldSteps, physicsHz / 20);
    near(t.advanceSimulation(1 / physicsHz), 1 / physicsHz);
    const resumed = clocks(t);
    assert.equal(resumed.physics - stalled.physics, 1);
    near(resumed.simTime - stalled.simTime, 1 / physicsHz);
    near(resumed.droppedSeconds, stalled.droppedSeconds);
    near(resumed.physicsAccumulator, 0);
  });
}

test('the production RAF path accounts for discarded wall time and leaves no catch-up debt', () => {
  const {t} = lab(60);
  const before = clocks(t), worldSteps = t.world.stepnumber;
  t.frame(1000);
  const stalled = clocks(t);
  assert.equal(stalled.physics - before.physics, 3);
  assert.equal(t.world.stepnumber - worldSteps, 3);
  near(stalled.simTime - before.simTime, .05);
  near(stalled.droppedSeconds - before.droppedSeconds, .95);
  near(stalled.physicsAccumulator, 0);
  t.frame(1000 + 1000 / 60);
  const next = clocks(t);
  assert.equal(next.physics - stalled.physics, 1);
  near(next.droppedSeconds, stalled.droppedSeconds);
  near(next.physicsAccumulator, 0);
});

test('invalid deltas do not consume pending fractions or mutate the world', () => {
  const {t} = lab();
  t.addQubit([0, 1, 0]);
  t.advanceSimulation(1 / 120);
  const before = worldState(t);
  for (const dt of [0, -1, NaN, Infinity, -Infinity, undefined, null, '0.1']) {
    assert.equal(t.advanceSimulation(dt), 0);
    assert.deepEqual(worldState(t), before);
    t.stepSimulation(dt);
    assert.deepEqual(worldState(t), before);
  }
  t.advanceSimulation(1 / 120);
  assert.equal(clocks(t).physics - before.clocks.physics, 1);
  near(clocks(t).physicsAccumulator, 0);
});

test('the compatibility entry point executes one atomic production substep, including energy cutoff', () => {
  const {t} = lab();
  assert.equal(t.stepPhysics, t.stepSimulation);
  assert.notEqual(t.stepPhysicsOnly, t.stepSimulation);
  const rotor = t.spawnRotor(t.V(0, .4, 0), {mount:'fixed'});
  t.rotorPart(rotor.aId).part.mood.energy = .000002;
  t.rotorPart(rotor.bId).part.mood.energy = .6;
  assert(t.configureRotor(rotor, {enabled:true}));
  const before = clocks(t);
  t.stepSimulation(1 / 16);
  const after = clocks(t);
  assert.equal(after.physics - before.physics, 1);
  near(after.simTime - before.simTime, 1 / 16);
  assert.equal(rotor.enabled, false);
  assert.equal(rotor.stopReason, 'empty');
  assert.equal(t.rotorPart(rotor.aId).part.mood.energy, 0,
    'an atomic powered step cannot gain passive charge in invented later substeps');
});

test('pausing preserves the slow-tick fraction but does not accumulate paused wall time', () => {
  const {t} = lab();
  t.addQubit([0, 1, 0]);
  t.advanceSimulation(.05);
  near(clocks(t).logicAccumulator, .05);
  t.openPauseMenu();
  assert.equal(t.story.mode, 'pause');
  const paused = worldState(t);
  assert.equal(t.advanceSimulation(60), 0);
  assert.deepEqual(worldState(t), paused);
  t.resumeGame();
  near(clocks(t).logicAccumulator, .05);
  t.advanceSimulation(1 / 60);
  const resumed = clocks(t);
  assert.equal(resumed.physics - paused.clocks.physics, 1);
  assert.equal(resumed.logic - paused.clocks.logic, 1);
  near(resumed.logicAccumulator, 0);
  near(resumed.simTime - paused.clocks.simTime, 1 / 60);
  near(resumed.droppedSeconds, paused.clocks.droppedSeconds);
});

test('hide and restore events rebase RAF without advancing bodies or charging a minute of debt', () => {
  const {t, doc} = lab();
  t.addQubit([0, 1, 0]);
  t.advanceSimulation(.05);
  doc.hidden = true;
  doc.dispatchEvent({type:'visibilitychange'});
  const hidden = worldState(t);
  assert.equal(t.advanceSimulation(60), 0);
  t.frame(60000);
  assert.deepEqual(worldState(t), hidden);
  doc.hidden = false;
  doc.dispatchEvent({type:'visibilitychange'});
  t.resumeGame();
  t.frame(120000);
  assert.deepEqual(worldState(t), hidden, 'the first resumed RAF establishes an origin');
  t.frame(120000 + 1000 / 60);
  assert.equal(clocks(t).physics - hidden.clocks.physics, 1);
  near(clocks(t).simTime - hidden.clocks.simTime, 1 / 60);
});

test('P/tablet keeps a powered machine running whereas the radial selector freezes it', () => {
  const {t, doc} = lab();
  const rotor = t.spawnRotor(t.V(0, .4, 0), {mount:'fixed'});
  assert(t.configureRotor(rotor, {enabled:true}));
  const charge = () => t.rotorPart(rotor.aId).part.mood.energy;
  const before = charge();
  doc.dispatchEvent({type:'keydown', code:'KeyP', repeat:false});
  assert.equal(doc.querySelector('#panel').hidden, false);
  assert.equal(t.simulationSuspended(), false);
  advance(t, 12);
  assert(charge() < before, 'the actual rotor consumes energy while its tablet is open');
  assert(t.getSimTime() >= .19);
  doc.dispatchEvent({type:'keydown', code:'KeyP', repeat:false});
  assert.equal(doc.querySelector('#panel').hidden, true);
  assert(t.openUnitRadial());
  assert(t.radialOpen());
  assert(t.simulationSuspended());
  const radial = worldState(t);
  assert.equal(t.advanceSimulation(2), 0);
  assert.deepEqual(worldState(t), radial);
  t.closeUnitRadial(false);
  assert(!t.simulationSuspended());
  t.advanceSimulation(1 / 60);
  assert.equal(clocks(t).physics - radial.clocks.physics, 1);
});

test('settings preview suspends both rates and closing it establishes a fresh RAF origin', () => {
  const {t} = lab();
  t.addQubit([0, 1, 0]);
  t.advanceSimulation(.05);
  t.initSettingsScreen();
  const settings = t.getSettingsScreen();
  settings.open('playing');
  assert(settings.isOpen);
  assert(t.simulationSuspended());
  const paused = worldState(t);
  assert.equal(t.advanceSimulation(60), 0);
  t.frame(60000);
  assert.deepEqual(worldState(t), paused);
  settings.requestClose();
  assert(!settings.isOpen);
  assert(!t.simulationSuspended());
  t.frame(120000);
  assert.deepEqual(worldState(t), paused);
  t.frame(120000 + 1000 / 60);
  assert.equal(clocks(t).physics - paused.clocks.physics, 1);
  assert.equal(clocks(t).logic - paused.clocks.logic, 1);
});

test('the culling comparison freezes simulation and cancellation cannot introduce deferred ticks', () => {
  const {t} = lab();
  t.addQubit([0, 1, 0]);
  t.advanceSimulation(.05);
  assert(t.startCullingBenchmark());
  assert(t.simulationSuspended());
  const paused = worldState(t);
  assert.equal(t.advanceSimulation(60), 0);
  t.frame(1000);
  t.frame(60000);
  assert.deepEqual(worldState(t), paused);
  t.cancelCullingBenchmark();
  assert(!t.simulationSuspended());
  t.frame(120000);
  assert.deepEqual(worldState(t), paused);
  t.frame(120000 + 1000 / 60);
  assert.equal(clocks(t).physics - paused.clocks.physics, 1);
  assert.equal(clocks(t).logic - paused.clocks.logic, 1);
});

test('teaching a robot pose freezes the physical world until the pose editor closes', () => {
  const {t, doc} = lab();
  assert(t.spawnSavedMechanism(t.robotArmBlueprintTemplate(), t.V()));
  const arm = t.robotArms.at(-1), grip = t.rotorPart(arm.gripperId);
  t.setSelected({g:grip.g, part:grip.part});
  assert(t.robotPanelAction('pose', {pose:'pick', heightCm:0}).ok);
  assert(t.getRobotPoseDraft());
  assert(t.simulationSuspended());
  const paused = worldState(t);
  assert.equal(t.advanceSimulation(2), 0);
  t.frame(1000);
  assert.deepEqual(worldState(t), paused);
  doc.dispatchEvent({type:'keydown', code:'Escape', repeat:false});
  assert.equal(t.getRobotPoseDraft(), null);
  assert(!t.simulationSuspended());
  t.advanceSimulation(1 / 60);
  assert.equal(clocks(t).physics - paused.clocks.physics, 1);
  near(clocks(t).simTime - paused.clocks.simTime, 1 / 60);
});

test('a new campaign scene discards both pending fractions without resetting completed simulation time', () => {
  const {t} = lab();
  t.advanceSimulation(.05);
  t.advanceSimulation(.005);
  const old = clocks(t);
  assert(old.physicsAccumulator > 0);
  assert(old.logicAccumulator > 0);
  t.beginCampaignLevel(13);
  t.hideStoryDialogue();
  const next = clocks(t);
  near(next.physicsAccumulator, 0);
  near(next.logicAccumulator, 0);
  near(next.simTime, old.simTime);
  t.advanceSimulation(1 / 60);
  assert.equal(clocks(t).logic, next.logic, 'old-room progress cannot trigger a new-room slow tick');
  near(clocks(t).simTime - next.simTime, 1 / 60);
});

test('rate changes preserve matter and slow-time credit while discarding incompatible physical debt', () => {
  const {t} = lab(60);
  const cube = t.addQubit([0, 1, 0]);
  t.advanceSimulation(.05);
  t.advanceSimulation(.005);
  const before = clocks(t);
  const body = JSON.stringify({p:cube.body.position, q:cube.body.quaternion, parts:t.worldParts(cube)});
  t.applyPreferences({...preferences.defaults(), physicsHz:120, shadows:'off'});
  near(clocks(t).physicsAccumulator, 0);
  near(clocks(t).logicAccumulator, before.logicAccumulator);
  near(clocks(t).simTime, before.simTime);
  assert.equal(JSON.stringify({p:cube.body.position, q:cube.body.quaternion, parts:t.worldParts(cube)}), body);
  advance(t, 2, 1 / 120);
  assert.equal(clocks(t).physics - before.physics, 2);
  assert.equal(clocks(t).logic - before.logic, 1);
  near(clocks(t).simTime - before.simTime, 1 / 60);
});

function chamber() {
  const game = lab(), {t} = game;
  t.beginCampaignLevel(13);
  t.hideStoryDialogue();
  const station = t.story.campaign.reconfiguration;
  const source = t.groups.find(g => g.parts.some(p => p.mood.matter?.root === station.root));
  source.body.position.set(station.intake.x, t.unitGroundHeight(source.parts[0].shape) + .004, station.intake.z);
  source.body.velocity.set(0, 0, 0);
  source.body.angularVelocity.set(0, 0, 0);
  assert(t.beginReconfiguration('divide'));
  t.resetSimulationClock(0, true);
  return {...game, station};
}

test('reconfiguration follows fixed slow ticks and narrative rendering cannot double its progress', () => {
  const {t, station} = chamber();
  const before = clocks(t);
  t.tickStory(2, false);
  near(station.job.time, 0);
  for (let frame = 1; frame <= 120; frame++) t.frame(frame * 1000 / 60);
  near(station.job.time, 2);
  assert.equal(clocks(t).logic - before.logic, 30);
  t.tickStory(2, false);
  near(station.job.time, 2, 1e-7);
  for (let frame = 121; frame <= 244; frame++) t.frame(frame * 1000 / 60);
  assert.equal(station.job, null);
  assert.equal(station.stats.divide, 1);
  const fragments = t.groups.flatMap(g => g.parts).filter(p => p.mood.matter?.root === station.root);
  assert.equal(fragments.length, 6);
  near(fragments.reduce((sum, p) => sum + p.weight, 0), 1);
  assert.equal(new Set(fragments.map(p => p.id)).size, 6);
});

test('a new scene cancels a pending reconfiguration instead of applying its elapsed fraction to the next one', () => {
  const {t, station} = chamber();
  advance(t, 123);
  assert(station.job);
  near(station.job.time, 2);
  assert(clocks(t).logicAccumulator > 0);
  t.beginCampaignLevel(14);
  t.hideStoryDialogue();
  const next = t.story.campaign.reconfiguration;
  near(clocks(t).logicAccumulator, 0);
  assert.equal(next.job, null);
  const ids = t.groups.flatMap(g => g.parts.map(p => p.id));
  advance(t, 240);
  assert.equal(next.job, null);
  assert.deepEqual(t.groups.flatMap(g => g.parts.map(p => p.id)), ids);
  assert.equal(next.stats.divide, 0);
});
