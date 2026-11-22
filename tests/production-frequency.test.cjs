// Real Cannon and the production scheduler, with DOM/GPU stubs. This is a
// behavioral regression at the selected physics rates, not an FPS benchmark.
const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');
const model = require('../assets/js/campaign-production.js');

const GOALS = {
  19: {units:3, target:3, budget:20, interval:1.2, minAutonomy:5, packages:false},
  20: {units:12, target:6, budget:30, interval:2.4, minAutonomy:15, packages:true}
};

// Tolerances cover floating-point sums of clocks/joules, not physical poses.
function near(actual, expected, epsilon = 1e-8, message = '') {
  assert(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} != ${expected}`);
}

function campaign(level, hz) {
  const game = createGame({graphics:false}), {t, sandbox} = game;
  t.story.ready = true;
  sandbox.document.body.dataset.booting = 'false';
  // Selecting dt only at the call site does not recalibrate the game's hinges.
  t.applyPreferences({physicsHz:hz, shadows:'off', music:false, guideVoice:false, footsteps:false, joinSounds:false});
  assert.equal(t.getPhysicsStep(), 1 / hz);
  t.beginCampaignLevel(level);
  t.hideStoryDialogue();
  sandbox.document.pointerLockElement = t.canvas;
  assert.equal(t.getPhysicsStep(), 1 / hz);
  const s = t.story.campaign.production;
  for (const [key, value] of Object.entries(GOALS[level])) assert.equal(s.goal[key], value, key);
  assert.equal(s.rotor.rpm, 30);
  assert.equal(s.rotor.maxTorque, .4);
  assert.equal(s.rotor.capacity, 16);
  const batteries = [s.rotor.aId, s.rotor.bId].map(id => {
    const part = t.rotorPart(id).part;
    assert.equal(part.mood.energy, .8);
    assert.equal(t.gameBatteryCapacity(part), 300);
    return {id, energy:part.mood.energy, capacity:t.gameBatteryCapacity(part)};
  });
  const originalEntries = Array.from(s.entries, entry => ({id:entry.id, kind:entry.kind, weight:entry.weight}));
  return {...game, s, hz, batteries, originalEntries};
}

function material(t, s) {
  return t.groups.filter(g => g.parts.some(p => p.mood.production?.batch === s.batch));
}

function audit(game) {
  const {t, s, batteries, originalEntries} = game, physical = material(t, s);
  const parts = physical.flatMap(g => g.parts).concat(s.buffer, s.packJob?.parts || []);
  const delivered = Array.from(s.ledger.accepted).flatMap(item => Array.from(item.ids || [item.id]));
  const ids = [...s.ledger.stock, ...parts.map(p => p.id), ...delivered];
  assert.equal(ids.length, originalEntries.length, 'every original ID remains accounted for');
  assert.equal(new Set(ids).size, ids.length, 'no material is duplicated across stages');
  assert.deepEqual(ids.sort((a, b) => a - b), originalEntries.map(p => p.id).sort((a, b) => a - b));
  for (const part of parts) {
    const original = originalEntries.find(entry => entry.id === part.id);
    assert.equal(part.weight, original.weight);
    assert.equal(part.mood.production.kind, original.kind);
    assert.equal(part.shape, 'cube');
  }
  const mass = (s.ledger.stock.length + delivered.length) * .5 + parts.reduce((sum, p) => sum + p.weight, 0);
  near(mass, s.goal.units * .5, 1e-8, 'conserved material');
  near(model.totals(s.ledger).totalMass, mass, 1e-8, 'ledger and physical material agree');
  for (const g of physical) near(g.body.mass, g.parts.reduce((sum, p) => sum + p.weight, 0) * .25, 1e-8, 'physical mass');
  const spent = batteries.reduce((sum, battery) => {
    const part = t.rotorPart(battery.id).part;
    assert.equal(t.gameBatteryCapacity(part), battery.capacity);
    return sum + (battery.energy - part.mood.energy) * battery.capacity;
  }, 0);
  near(spent, s.joules, 1e-7, 'motor and line work debit the actual batteries');
}

function clock(t) {
  return {...t.getTickState(), worldSteps:t.world.stepnumber, worldTime:t.world.time};
}

function advanceUntil(game, condition, seconds, each = () => {}) {
  const {t, hz} = game, before = clock(t);
  let steps = 0;
  while (!condition() && steps < seconds * hz) {
    // Observe the exact completion step: subsequent steps legitimately let an
    // idle rotor recover energy, which would obscure the attempt's debit.
    near(t.advanceSimulation(1 / hz), 1 / hz, 1e-12, 'accepted simulation time');
    each(++steps);
  }
  const after = clock(t), elapsed = steps / hz;
  assert.equal(after.physicsDt, 1 / hz);
  assert.equal(after.physics - before.physics, steps);
  assert.equal(after.worldSteps - before.worldSteps, steps, 'Cannon executes every scheduled step');
  // The game's simulation clock and Cannon's executed-step count establish
  // elapsed simulation time; the raw world.time field is diagnostic only.
  near(after.simTime - before.simTime, elapsed);
  near(after.physicsAccumulator, before.physicsAccumulator);
  near((after.logic - before.logic) * after.logicDt + after.logicAccumulator - before.logicAccumulator, elapsed);
  assert.equal(after.droppedSeconds, before.droppedSeconds, 'progress must not come from discarded time');
  assert(condition(), `condition not reached after ${seconds} simulated seconds: ${game.s.reason}`);
  return elapsed;
}

for (const hz of [60, 120, 240]) for (const level of [19, 20]) {
  test(`production ${level} delivers its original 30 rpm batch at the selected ${hz} Hz, including off-camera work`, () => {
    const game = campaign(level, hz), {t, s} = game;
    assert(t.startProduction());
    audit(game);
    let away = false, lastStage = '';
    const elapsed = advanceUntil(game, () => s.complete || s.failed, 60, steps => {
      if (steps === hz) {
        assert.equal(s.ledger.released.length, 0);
        // The whole line is behind this camera, before any material is fed.
        t.setLook({camera:[0, 1.7, 6], yaw:Math.PI, pitch:0});
        away = true;
      }
      if (steps % hz === 0) {
        t.updateTarget();
        t.renderScene();
      }
      const stage = [s.ledger.stock.length, s.buffer.length, s.packJob?.time >= .7, s.ledger.packed.length, s.ledger.accepted.length].join('/');
      if (stage !== lastStage || steps % hz === 0) audit(game);
      lastStage = stage;
    });
    assert(away);
    assert(s.complete, s.reason);
    assert.equal(s.failed, false);
    assert.equal(s.ledger.accepted.length, GOALS[level].target);
    assert.equal(s.ledger.stock.length, 0);
    assert.equal(s.ledger.released.length, GOALS[level].units);
    assert.equal(material(t, s).length, 0);
    assert.equal(s.buffer.length, 0);
    assert.equal(s.packJob, null);
    assert.equal(s.rotor.rpm, 30, 'the fix must preserve the requested speed');
    assert.equal(s.rotor.maxTorque, .4);
    assert.equal(s.rotor.enabled, false);
    assert(s.joules > 0 && s.joules <= GOALS[level].budget);
    assert(s.autonomy >= GOALS[level].minAutonomy && s.autonomy <= s.time);
    near(s.time, elapsed, 1e-8, 'the production clock advances with the full physical simulation');
    audit(game);
    assert(t.story.progress['lore.production' + level]);
  });
}

test('60 Hz packing keeps its original pair through a blocked output and a pause, then emits it once', () => {
  const game = campaign(20, 60), {t, s, sandbox} = game;
  const obstacle = t.makeGroup([{id:t.allocateUnitId(), weight:1, p:t.V(.15, s.surface + .045, s.z), q:t.Q()}]);
  obstacle.body.type = sandbox.CANNON.Body.KINEMATIC;
  obstacle.body.updateMassProperties();
  assert(t.startProduction());
  advanceUntil(game, () => s.packJob?.time >= .7 || s.failed, 20);
  assert.equal(s.failed, false, s.reason);
  const job = s.packJob, ids = Array.from(job.item.ids), packed = s.ledger.packed.length;
  const blockedAt = s.time;
  advanceUntil(game, () => s.time >= blockedAt + 1, 2);
  assert.equal(s.packJob, job);
  assert.equal(job.time, .7);
  assert.deepEqual(Array.from(job.item.ids), ids);
  assert.equal(s.ledger.packed.length, packed);
  assert(!material(t, s).some(g => g.parts.some(p => p.mood.production.role === 'package')));
  audit(game);

  const snapshot = () => JSON.stringify({
    clocks:clock(t), time:s.time, autonomy:s.autonomy, joules:s.joules, meter:s.meter,
    ledger:s.ledger, buffer:s.buffer, job:s.packJob,
    bodies:t.groups.map(g => ({p:g.body.position, q:g.body.quaternion, v:g.body.velocity, w:g.body.angularVelocity, energies:g.parts.map(p => p.mood.energy)}))
  });
  const paused = snapshot();
  t.story.mode = 'pause';
  assert.equal(t.advanceSimulation(.5), 0);
  assert.equal(snapshot(), paused);
  t.story.mode = 'playing';
  sandbox.document.hidden = true;
  assert.equal(t.advanceSimulation(.5), 0);
  assert.equal(snapshot(), paused);
  sandbox.document.hidden = false;

  t.removeGroup(obstacle);
  const output = () => material(t, s).find(g => g.parts.every(p => p.mood.production.role === 'package'));
  advanceUntil(game, () => !!output() || s.failed, 2);
  assert.equal(s.failed, false, s.reason);
  assert.deepEqual(Array.from(output().parts, p => p.id).sort((a, b) => a - b), ids.sort((a, b) => a - b));
  assert.equal(s.ledger.packed.length, packed, 'clearing the output cannot manufacture a duplicate recipe');
  assert.equal(s.packJob, null);
  audit(game);
});
