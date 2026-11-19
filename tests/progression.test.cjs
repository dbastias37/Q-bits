const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const progression = require('../assets/js/progression.js');
const power = require('../assets/js/rotor-power.js');

test('campaign torque tiers load in browsers and CommonJS, with immutable limits', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js/progression.js'), 'utf8'), context);
  assert.equal(context.QBitsProgression.capFor(2), .65);
  assert(Object.isFrozen(progression));
  assert(Object.isFrozen(progression.TIERS));
  for (const tier of Object.values(progression.TIERS)) assert(Object.isFrozen(tier));
  assert.equal(power.LIMITS.maxTorque[1], 32, 'laboratory torque range');
});

test('completion unlocks finite tiers while selecting a level or legacy progress does not', () => {
  assert.equal(progression.availableTier({}), 1);
  assert.equal(progression.availableTier({ level15: true }), 1);
  assert.equal(progression.availableTier({ level16: true }), 2);
  assert.equal(progression.availableTier({ level16: true, level17: true }), 2);
  assert.equal(progression.availableTier({ level18: true }), 3);
  assert.equal(progression.availableTier({ level16: true, level18: true, level99: true }), 3);
  for (const bad of [null, undefined, 18, 'level18', [], { level18: 'true' }, { level18: 1 }, Object.create({ level18: true })]) {
    assert.equal(progression.availableTier(bad), 1);
  }
});

test('tier unlocks preserve configured torque and require explicit tier selection', () => {
  const selection = Object.freeze({ tier: 1, maxTorque: .2 });
  const completed = Object.freeze({ level16: true, level18: true });
  assert.deepEqual(progression.normalize(selection, completed), selection);
  assert.deepEqual(progression.normalize(undefined, completed), { tier: 1, maxTorque: .4 });
  assert.deepEqual(progression.normalize({ tier: 3, maxTorque: .2 }, completed), { tier: 3, maxTorque: .2 });
  assert.deepEqual(progression.normalize({ tier: 3, maxTorque: 1 }, {}), { tier: 1, maxTorque: .4 });
  assert.deepEqual(progression.normalize({ tier: 3, maxTorque: 1 }, { level16: true }), { tier: 2, maxTorque: .65 });
  assert.deepEqual(progression.normalize({ tier: 3, maxTorque: 1 }, completed), { tier: 3, maxTorque: 1 });
});

test('corrupt selections remain finite and cannot escape the unlocked torque cap', () => {
  const corrupt = [null, undefined, false, [], {}, { tier: '3', maxTorque: '1' }, { tier: Infinity, maxTorque: Infinity }, { tier: 3.5, maxTorque: NaN }, { tier: -1, maxTorque: -10 }, { tier: 999, maxTorque: 99 }];
  for (const input of corrupt) {
    const result = progression.normalize(input, { level18: true });
    assert.equal(result.tier, 1);
    assert(Number.isFinite(result.maxTorque));
    assert(result.maxTorque >= .02 && result.maxTorque <= .4);
    assert(progression.validate(result, {}));
  }
  for (const input of [null, {}, { tier: 2, maxTorque: .65 }, { tier: 1, maxTorque: .401 }, { tier: 1, maxTorque: .019 }, { tier: 1, maxTorque: NaN }, Object.create({ tier: 1, maxTorque: .4 })]) {
    assert.equal(progression.validate(input, {}), false);
  }
  assert(progression.validate({ tier: 2, maxTorque: .65 }, { level16: true }));
  assert(progression.validate({ tier: 3, maxTorque: 1 }, { level18: true }));
});

test('higher available torque grants no free efficiency or energy', () => {
  const state = { enabled: true, load: 2, capacity: 16, energyA: 1, energyB: 1, actualRpm: 30 };
  const low = power.evaluate({ ...state, maxTorque: progression.capFor(1), actualTorque: .4 }, 1);
  const high = power.evaluate({ ...state, maxTorque: progression.capFor(3), actualTorque: 1 }, 1);
  assert(high.spentJoules > low.spentJoules);
  assert(high.heatWatts > low.heatWatts);
  assert(high.energyA < low.energyA);
  const sameWork = power.evaluate({ ...state, maxTorque: progression.capFor(3), actualTorque: .4 }, 1);
  assert.equal(sameWork.spentJoules, low.spentJoules);
});
