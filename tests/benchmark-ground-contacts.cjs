// Reproduce falls with the production game and Cannon; DOM/GPU are stubs.
// Run: node tests/benchmark-ground-contacts.cjs
// Compare a saved game source: QBITS_GAME_SOURCE=/path/game.js node tests/benchmark-ground-contacts.cjs
// Writes JSON to stdout only. These are simulation/behavior measurements, not FPS.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');

const sourceFile = process.env.QBITS_GAME_SOURCE || path.join(__dirname, '../assets/js/game.js');
const source = fs.readFileSync(sourceFile, 'utf8');
const sourceSha256 = crypto.createHash('sha256').update(source).digest('hex');
const closureEnd = source.lastIndexOf('})();');
assert(closureEnd >= 0, 'Game closure not found');
const gameSource = source.slice(0, closureEnd) +
  'window.__groundContactBenchmark={floor};' + source.slice(closureEnd);
const durationSeconds = 4;
const observationSeconds = 1;

function setup(hz, kind, height) {
  const game = createGame({graphics:false, gameSource});
  const {t, sandbox} = game;
  t.clearNarrativeScene();
  Object.assign(t.story, {ready:true, scene:'lab', mode:'playing', phase:'idle'});
  sandbox.document.body.dataset.booting = 'false';
  sandbox.document.pointerLockElement = t.canvas;
  t.applyPreferences({physicsHz:hz});
  assert.equal(t.getPhysicsStep(), 1 / hz);
  if (kind === 'rotor') {
    assert(t.spawnRotor(t.V(0, height, 0)), 'Could not create rotor');
  } else {
    const record = kind === 'arm' ? t.robotArmBlueprintTemplate() : t.servoBlueprintTemplate(kind);
    assert(t.spawnSavedMechanism(record, t.V(0, height, 0)), 'Could not create mechanism');
  }
  return {...game, floor:sandbox.__groundContactBenchmark.floor};
}

function pose(body) {
  return [...body.position.toArray(), ...body.quaternion.toArray()];
}

function inventory(groups) {
  return JSON.stringify(groups.map(g => ({
    bodyId:g.body.id, mass:g.body.mass, type:g.body.type,
    parts:g.parts.map(p => ({id:p.id, shape:p.shape, weight:p.weight}))
  })));
}

function runCase(kind, hz, height) {
  const {t, floor} = setup(hz, kind, height);
  const members = t.groups.filter(g => !g.virtualConveyor);
  const before = inventory(members);
  const mass = members.reduce((sum, g) => sum + g.body.mass, 0);
  const start = t.getSimTime();
  const result = {
    kind, physicsHz:hz, dropHeightM:height,
    physicalBodies:members.length, pieces:members.reduce((sum, g) => sum + g.parts.length, 0),
    mass, friction:t.world.defaultContactMaterial.friction,
    restitution:t.world.defaultContactMaterial.restitution,
    firstContactSeconds:null, firstImpactSpeedMps:null, firstContactRestitution:null,
    peakUpwardComSpeedMps:0, peakUpwardBodySpeedMps:0, maxPenetrationM:0,
    firstRestSeconds:null, maxFinalPositionDriftM:0, maxFinalQuaternionChange:0
  };
  const originalSolve = t.world.solver.solve;
  t.world.solver.solve = function(dt, world) {
    let first = null;
    if (result.firstContactSeconds === null) {
      first = world.contacts.filter(c => c.enabled !== false && (c.bi === floor || c.bj === floor));
      if (first.length) {
        result.firstContactSeconds = t.getSimTime() - start;
        result.firstImpactSpeedMps = Math.max(...first.map(c => Math.abs(c.getImpactVelocityAlongNormal())));
      }
    }
    const value = originalSolve.call(this, dt, world);
    if (first?.length) result.firstContactRestitution = Math.max(...first.map(c => c.restitution));
    return value;
  };
  let reference = null;
  for (let i = 0; i < durationSeconds * hz; i++) {
    t.stepPhysics(1 / hz);
    result.maxPenetrationM = Math.max(result.maxPenetrationM, ...members.map(g => -t.bounds(g).min.y));
    if (result.firstContactSeconds !== null) {
      result.peakUpwardBodySpeedMps = Math.max(result.peakUpwardBodySpeedMps, ...members.map(g => g.body.velocity.y));
      result.peakUpwardComSpeedMps = Math.max(result.peakUpwardComSpeedMps,
        members.reduce((sum, g) => sum + g.body.mass * g.body.velocity.y, 0) / mass);
    }
    if (result.firstRestSeconds === null && members.every(g => g.body.sleepState === 2)) {
      result.firstRestSeconds = t.getSimTime() - start;
    }
    if (i + 1 === (durationSeconds - observationSeconds) * hz) reference = members.map(g => pose(g.body));
    if (reference) for (let j = 0; j < members.length; j++) {
      const current = pose(members[j].body), saved = reference[j];
      result.maxFinalPositionDriftM = Math.max(result.maxFinalPositionDriftM,
        Math.hypot(current[0] - saved[0], current[1] - saved[1], current[2] - saved[2]));
      // Component distance avoids reporting acos roundoff as a rotation of an
      // unchanged quaternion. q and -q encode the same physical orientation.
      const direct = Math.hypot(...current.slice(3).map((v, k) => v - saved[k + 3]));
      const opposite = Math.hypot(...current.slice(3).map((v, k) => v + saved[k + 3]));
      result.maxFinalQuaternionChange = Math.max(result.maxFinalQuaternionChange, Math.min(direct, opposite));
    }
  }
  result.restingAtEnd = members.every(g => g.body.sleepState === 2);
  result.zeroVelocityAtEnd = members.every(g => g.body.velocity.norm2() === 0 && g.body.angularVelocity.norm2() === 0);
  result.maxFinalSpeedMps = Math.max(...members.map(g => g.body.velocity.norm()));
  result.maxFinalAngularSpeedRadps = Math.max(...members.map(g => g.body.angularVelocity.norm()));
  result.matterAndMassPreserved = inventory(members) === before;
  result.solverIterationsAtEnd = t.world.solver.iterations;
  return result;
}

const cases = [];
for (const height of [1, 2, 5]) for (const hz of [60, 120, 240]) {
  for (const kind of ['rotor', 'pivot', 'hinge', 'arm']) cases.push(runCase(kind, hz, height));
}
const label = c => ({kind:c.kind, physicsHz:c.physicsHz, dropHeightM:c.dropHeightM});
const report = {
  sourceSha256, source:process.env.QBITS_GAME_SOURCE ? 'QBITS_GAME_SOURCE' : 'assets/js/game.js',
  runtime:{node:process.version, platform:process.platform, architecture:process.arch},
  scope:'Production game logic and Cannon with DOM/GPU stubs; simulated falls and rest, not browser FPS.',
  durationSeconds, finalObservationSeconds:observationSeconds,
  summary:{
    cases:cases.length,
    contactsObserved:cases.filter(c => c.firstContactSeconds !== null).length,
    nearZeroFirstImpactCases:cases.filter(c => c.firstImpactSpeedMps !== null && c.firstImpactSpeedMps < .1).map(label),
    notRestingAtEnd:cases.filter(c => !c.restingAtEnd).map(label),
    maxFirstRestSeconds:Math.max(...cases.map(c => c.firstRestSeconds || 0)),
    maxPenetrationM:Math.max(...cases.map(c => c.maxPenetrationM)),
    maxFinalPositionDriftM:Math.max(...cases.map(c => c.maxFinalPositionDriftM)),
    allFinalVelocitiesZero:cases.every(c => c.zeroVelocityAtEnd),
    allMatterAndMassPreserved:cases.every(c => c.matterAndMassPreserved)
  },
  cases
};
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
