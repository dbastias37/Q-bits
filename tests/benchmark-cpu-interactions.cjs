// Real production pipeline + Cannon, with the harness's DOM/GPU stubs.
// Run alone; these are elapsed and process CPU times, never browser FPS.
// node tests/benchmark-cpu-interactions.cjs --baseline-root=../qbits-baseline --optimized-root=. --output=/tmp/interactions.json
// Both roots supply their COMPLETE harness and modules. The shared fixture
// comes from the optimized root, so no baseline game code is mixed in.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i]; assert(arg.startsWith('--'), 'Use --name=value or --name value');
  const eq = arg.indexOf('='), name = arg.slice(2, eq < 0 ? undefined : eq);
  args[name] = eq < 0 ? process.argv[++i] : arg.slice(eq + 1);
  assert(args[name] !== undefined, 'Missing value for --' + name);
}
const root = path.resolve(__dirname, '..');
const roots = {
  baseline:path.resolve(root, args['baseline-root'] || '../qbits-baseline'),
  optimized:path.resolve(root, args['optimized-root'] || '.')
};
const fixtures = require(path.join(roots.optimized, 'tests/cpu-audit-fixtures.cjs'));
const repetitions = 3, warmup = 8, hz = 120, dt = 1 / hz;
const samples = Number(args.samples || 24), budgetMs = Number(args['case-budget-ms'] || 8000);
assert(Number.isInteger(samples) && samples >= 1 && samples <= 24, 'Samples must be between 1 and 24');
assert(Number.isFinite(budgetMs) && budgetMs > 0 && budgetMs <= 8000, 'Case budget must be at most 8000 ms');
const selected = (args.scenarios || 'grab-move-release,weld-detach,two-arms-contact').split(',');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function identity(dir) {
  const files = ['index.html', 'tests/game-harness.cjs', ...fs.readdirSync(path.join(dir, 'assets/js')).filter(f => f.endsWith('.js')).sort().map(f => 'assets/js/' + f)];
  return {
    root:dir, commit:execFileSync('git', ['rev-parse', 'HEAD'], {cwd:dir, encoding:'utf8'}).trim(),
    workingTree:execFileSync('git', ['status', '--short'], {cwd:dir, encoding:'utf8'}).trim(),
    sha256:Object.fromEntries(files.map(file => [file, hash(fs.readFileSync(path.join(dir, file)))]))
  };
}
const identities = Object.fromEntries(Object.entries(roots).map(([name, dir]) => [name, identity(dir)]));
function stats(values) {
  if (!values.length) return {count:0, mean:null, p50:null, p95:null, p99:null, min:null, max:null};
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = q => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
  return {count:values.length, mean:values.reduce((a, b) => a + b, 0) / values.length,
    p50:percentile(.5), p95:percentile(.95), p99:percentile(.99), min:sorted[0], max:sorted[sorted.length - 1]};
}
function timed(fn) {
  const cpuStart = process.cpuUsage(), start = performance.now();
  const value = fn(), wallMs = performance.now() - start, cpu = process.cpuUsage(cpuStart);
  return {value, wallMs, processCpuMs:(cpu.user + cpu.system) / 1000,
    processUserMs:cpu.user / 1000, processSystemMs:cpu.system / 1000};
}
function timingSummary(measurements) {
  return Object.fromEntries(['wallMs', 'processCpuMs', 'processUserMs', 'processSystemMs']
    .map(key => [key, stats(measurements.map(m => m[key]))]));
}
function setup(version) {
  const createGame = require(path.join(roots[version], 'tests/game-harness.cjs'));
  const game = createGame({graphics:false}), {t, sandbox} = game;
  t.clearNarrativeScene();
  Object.assign(t.story, {ready:true, started:true, scene:'lab', mode:'playing', phase:'idle'});
  sandbox.document.body.dataset.booting = 'false';
  sandbox.document.pointerLockElement = t.canvas;
  t.applyPreferences({physicsHz:hz, shadows:'off', music:false, guideVoice:false, footsteps:false, joinSounds:false});
  // Apply the actual preference BEFORE any hand or mechanism constraint exists.
  assert.equal(t.getPhysicsStep(), dt);
  assert.equal(t.simulationSuspended(), false);
  return {...game, f:fixtures(t)};
}
function material(t, energy = true) {
  const parts = Array.from(t.groups).flatMap(g => Array.from(g.parts, p =>
    energy ? [p.id, p.shape, p.weight, p.mood.energy] : [p.id, p.shape, p.weight])).sort((a, b) => a[0] - b[0]);
  return JSON.stringify({parts, physicalMass:t.groups.reduce((sum, g) => sum + (g.virtualConveyor ? 0 : g.body.mass), 0)});
}
function clockDifference(before, after) {
  return {physicsSteps:after.physics - before.physics, logicSteps:after.logic - before.logic,
    simulatedSeconds:after.simTime - before.simTime, droppedSeconds:after.droppedSeconds - before.droppedSeconds,
    physicsAccumulator:after.physicsAccumulator, logicAccumulator:after.logicAccumulator};
}
class BudgetExceeded extends Error {
  constructor(detail) { super('Per-run stress budget reached'); this.detail = detail; }
}
function runner(version, scenario) {
  const start = performance.now(), report = {version, scenario, completed:false, actions:{}, phases:[], checkpoints:[], observations:{}};
  const states = new Map(); let game, phase = 'setup', completedSteps = 0;
  function guard(label = phase) {
    const elapsedMs = performance.now() - start;
    if (elapsedMs >= budgetMs) throw new BudgetExceeded({phase:label, completedSteps, elapsedMs, budgetMs,
      lastCompletedCheckpoint:report.checkpoints.at(-1)?.name || null});
  }
  try {
    game = setup(version); const {t, f} = game; report.initialClock = t.getTickState(); guard();
    function action(name, fn) {
      phase = name; guard(); const measurement = timed(fn), {value, ...cost} = measurement;
      (report.actions[name] ||= []).push(cost); guard(); return value;
    }
    function checkpoint(name) {
      phase = 'checkpoint:' + name; guard();
      const begin = performance.now(), state = f.state(); states.set(name, state);
      report.checkpoints.push({name, stateSha256:hash(state), inventory:f.inventory(), clocks:t.getTickState(),
        serializationWallMs:performance.now() - begin}); guard();
    }
    function steps(name, count, {beforeStep, afterStep, measure = true} = {}) {
      phase = name; const before = t.getTickState(), measurements = [];
      // A phase always executes every requested step. Its first eight steps
      // (or more, for long settling phases) are outside the timed sample.
      const measured = measure ? Math.min(samples, Math.max(0, count - warmup)) : 0;
      const row = {name, requestedSteps:count, completedSteps:0, measurements}; report.phases.push(row);
      for (let i = 0; i < count; i++) {
        guard(name + ':' + i); beforeStep?.(i);
        let simulated;
        if (i >= count - measured) {
          const {value, ...cost} = timed(() => t.advanceSimulation(dt)); simulated = value; measurements.push(cost);
        } else simulated = t.advanceSimulation(dt);
        assert.equal(simulated, dt, 'Each requested tick must execute the selected 120 Hz step');
        completedSteps++; row.completedSteps++; afterStep?.(i);
      }
      row.clockDelta = clockDifference(before, t.getTickState()); row.summary = timingSummary(measurements);
      assert.equal(row.clockDelta.physicsSteps, count);
      assert(Math.abs(row.clockDelta.simulatedSeconds - count * dt) < 1e-9, 'No lost simulated time');
      assert.equal(row.clockDelta.droppedSeconds, 0, 'No discarded time in controlled ticks'); guard(name);
    }
    function take(g, distance = 1, yOffset = 0) {
      const center = g.body.position.clone();
      t.setMultiSelection([]); t.setLook({camera:[center.x, center.y + yOffset, center.z + distance], yaw:0, pitch:0});
      action('grab', () => t.grabQubit({g, part:g.parts[0], point:center, distance}));
      assert(t.getHeld(), 'The production hand controller must actually grab the assembly');
      return center;
    }
    function prime(g, name) {
      const point = t.poses(g)[0].p;
      t.setLook({camera:[point.x, point.y + .5, point.z], yaw:0, pitch:0});
      const hit = action(name, () => t.aimQubit(2.7, t.V(0, -1, 0)));
      assert(hit && hit.g === g, 'The exact query must hit the intended group');
      return hit.part.id;
    }
    if (scenario === 'grab-move-release') {
      f.distant(1000);
      const parts = [];
      for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) {
        parts.push({id:t.allocateUnitId(), shape:'cube', weight:1,
          p:t.V((x - 1.5) * .09, 1 + (y - 1.5) * .09, (z - 1.5) * .09), q:t.Q()});
      }
      const g = t.makeGroup(parts), matter = material(t, false), initialConstraints = t.world.constraints.length,
        initialBodies = t.world.bodies.length;
      steps('before-grab-warmup', warmup, {measure:false}); checkpoint('before-grab');
      const before = take(g), camera = t.getLook().camera;
      assert.equal(t.getHeld().items.length, 1); assert.equal(t.getHeld().g.parts.length, 64);
      steps('held-moving', warmup + samples, {beforeStep:i => {
        if (i < warmup) return;
        const fraction = (i - warmup + 1) / samples;
        // Move the camera/hand target, never teleport the physical body.
        t.setLook({camera:[camera[0] + .3 * fraction, camera[1] + .15 * fraction, camera[2]]});
      }});
      report.observations.handDisplacement = g.body.position.vsub(before).toArray();
      assert(g.body.position.x > before.x, 'The physical hand must move toward its target'); checkpoint('after-moving');
      action('release', () => t.releaseQubit(false)); assert.equal(t.getHeld(), null);
      assert.equal(t.world.constraints.length, initialConstraints); assert.equal(t.world.bodies.length, initialBodies);
      steps('released', warmup + samples); assert.equal(material(t, false), matter); checkpoint('released');
    } else if (scenario === 'weld-detach') {
      f.distant(1000);
      const target = f.plate(64, [0, 1, 0], 8), source = f.plate(64, [.735, 1, 0], 8);
      steps('before-edit-warmup', warmup, {measure:false});
      const ids = [prime(target, 'query-target-cold'), prime(source, 'query-source-cold')];
      report.observations.priorQueryIds = ids;
      report.observations.originalIndicesBuilt = [target, source].map(g => !!g.partQueryCache);
      if (version === 'optimized') assert(report.observations.originalIndicesBuilt.every(Boolean), 'Prime both spatial indices before topology changes');
      for (let i = 0; i < warmup; i++) { t.aimQubit(2.7, t.V(0, -1, 0)); }
      const conserved = material(t), clock = JSON.stringify(t.getTickState()); checkpoint('before-weld');
      take(source, .8); t.keys.add('ShiftLeft');
      const snap = action('find-snap', () => t.findSnap()); assert(snap && snap.target === target);
      action('release-before-weld', () => t.releaseQubit(false)); t.keys.delete('ShiftLeft');
      const joined = action('weld', () => t.weld(snap)); assert(joined && joined.parts.length === 128);
      assert.equal(material(t), conserved, 'Welding must preserve all IDs, masses and live energies');
      assert.equal(JSON.stringify(t.getTickState()), clock, 'An edit must not advance or discard simulation time');
      prime(joined, 'query-joined-cold'); checkpoint('after-weld');
      const detachId = source.parts[0].id, detach = joined.parts.find(p => p.id === detachId);
      const hadIndex = !!joined.partQueryCache;
      action('detach', () => t.detachPart({g:joined, part:detach}));
      assert(!t.groups.includes(joined));
      if (hadIndex) assert.equal(joined.partQueryCache, undefined, 'A retained retired group must release its query index');
      assert.equal(material(t), conserved, 'Detaching must preserve all IDs, masses and live energies');
      assert.equal(JSON.stringify(t.getTickState()), clock);
      const detached = t.groups.find(g => g.parts.some(p => p.id === detachId));
      assert(detached && detached.parts.length === 1); assert.equal(prime(detached, 'query-detached'), detachId);
      checkpoint('after-detach'); steps('post-edit', warmup + samples); checkpoint('post-edit-physics');
    } else if (scenario === 'two-arms-contact') {
      // Keep the complete sequence from mechanical-floor-impact.test.cjs:
      // 3 s settle, 60 opposing-force ticks, 4 s settle, 60 hand ticks,
      // release, 3 s settle, then the existing 1 s drift observation.
      const armRoots = [];
      for (const x of [-.6, .6]) {
        const before = new Set(t.groups);
        assert(t.spawnSavedMechanism(t.robotArmBlueprintTemplate(), t.V(x, 0, 0)));
        armRoots.push(t.groups.find(g => !before.has(g)));
      }
      const matter = material(t, false), components = armRoots.map(g => t.rotorConnectedGroups([g])),
        a = new Set(components[0].map(g => g.body)), b = new Set(components[1].map(g => g.body));
      steps('initial-settle', 3 * hz);
      const shift = Math.max(...components[0].map(g => t.bounds(g).max.x)) + .00005 - Math.min(...components[1].map(g => t.bounds(g).min.x));
      action('place-touching', () => {
        for (const g of components[1]) { g.body.position.x += shift; g.body.aabbNeedsUpdate = true; g.body.wakeUp(); g.body.velocity.x = -.16; }
        for (const g of components[0]) { g.body.wakeUp(); g.body.velocity.x = .16; }
      });
      steps('opposing-forces', 60, {beforeStep:() => {
        armRoots[0].body.force.x += armRoots[0].body.mass * 6; armRoots[1].body.force.x -= armRoots[1].body.mass * 6;
      }});
      steps('touching-settle', 4 * hz); checkpoint('before-arm-grab'); take(armRoots[0], 1, .12);
      action('move-hand-target', () => {
        const held = t.getHeld(), camera = t.V(...t.getLook().camera), ray = t.screenRay(640, 360), target = armRoots[0].body.position.clone();
        target.x += .3; held.rootOffset = target.vsub(camera.vadd(ray.scale(held.distance)));
      });
      let crossContacts = 0, maximumCrossContacts = 0;
      steps('held-arm-contact', 60, {afterStep:() => {
        let count = 0; for (const c of t.world.contacts) if (a.has(c.bi) && b.has(c.bj) || b.has(c.bi) && a.has(c.bj)) count++;
        crossContacts += count; maximumCrossContacts = Math.max(maximumCrossContacts, count);
      }});
      assert(crossContacts > 0, 'Require actual contacts between the two mechanisms');
      report.observations.crossContacts = {total:crossContacts, maximumPerStep:maximumCrossContacts}; checkpoint('held-arm-contact');
      action('release', () => t.releaseQubit(false)); steps('released-arms-settle', 3 * hz);
      const before = t.groups.map(g => g.body.position.clone()); steps('released-arms-drift', hz);
      const drift = Math.max(...t.groups.map((g, i) => g.body.position.distanceTo(before[i])));
      // This tolerance is the existing supported-arm regression (0.5 mm),
      // not a relaxed cross-variant state comparison, which remains exact.
      assert(drift < .0005, 'Released supported arms must not drift'); report.observations.finalDriftMetres = drift;
      assert(t.groups.every(g => g.body.type === 1)); assert(t.rotors.every(r => !r.enabled));
      assert.equal(material(t, false), matter); checkpoint('released-arms');
    } else throw new Error('Unknown scenario ' + scenario);
    report.completed = true;
  } catch (error) {
    if (error instanceof BudgetExceeded) report.stopped = error.detail;
    else report.error = {phase, message:error.message, stack:error.stack};
  }
  report.elapsedWallMsIncludingSetupChecks = performance.now() - start;
  report.completedSteps = completedSteps;
  if (game) { report.finalInventory = game.f.inventory(); report.finalClock = game.t.getTickState(); }
  for (const row of report.phases) row.summary ||= timingSummary(row.measurements);
  return {report, states};
}
function exactDifference(a, b) {
  const differences = [];
  function visit(x, y, at) {
    if (Object.is(x, y) || differences.length >= 12) return;
    if (x && y && typeof x === 'object' && typeof y === 'object') {
      for (const key of new Set([...Object.keys(x), ...Object.keys(y)])) visit(x[key], y[key], at + '.' + key);
    } else differences.push({path:at, baseline:x, optimized:y});
  }
  visit(JSON.parse(a), JSON.parse(b), 'state'); return differences;
}
const reports = []; let failed = false;
for (const scenario of selected) {
  const result = {scenario, plannedRepetitions:repetitions, runs:[], pairs:[]};
  for (let repetition = 1; repetition <= repetitions; repetition++) {
    const order = repetition % 2 ? ['baseline', 'optimized'] : ['optimized', 'baseline'], runs = {};
    for (const version of order) {
      runs[version] = runner(version, scenario); result.runs.push({repetition, order:order.join('/'), ...runs[version].report});
    }
    const common = [...runs.baseline.states.keys()].filter(name => runs.optimized.states.has(name));
    const comparisons = common.map(name => {
      const baseline = runs.baseline.states.get(name), optimized = runs.optimized.states.get(name), identical = baseline === optimized;
      const left = runs.baseline.report.checkpoints.find(row => row.name === name), right = runs.optimized.report.checkpoints.find(row => row.name === name);
      const identicalInventory = JSON.stringify(left.inventory) === JSON.stringify(right.inventory),
        identicalClocks = JSON.stringify(left.clocks) === JSON.stringify(right.clocks);
      if (!identical || !identicalInventory || !identicalClocks) failed = true;
      return {checkpoint:name, identical, identicalInventory, identicalClocks, baselineSha256:hash(baseline), optimizedSha256:hash(optimized),
        ...(!identical ? {differences:exactDifference(baseline, optimized)} : {})};
    });
    const complete = runs.baseline.report.completed && runs.optimized.report.completed;
    result.pairs.push({repetition, complete, comparisons,
      identicalCompleteSequence:complete && comparisons.length === runs.baseline.states.size &&
        comparisons.length === runs.optimized.states.size && comparisons.every(row => row.identical && row.identicalInventory && row.identicalClocks)});
    if (runs.baseline.report.error || runs.optimized.report.error) failed = true;
    process.stderr.write(`${scenario} repetition ${repetition}: ${complete ? 'completed' : 'incomplete'}\n`);
    // A timeout is a recorded impracticable configuration, not a speedup or a
    // correctness pass. Preserve both partial runs; do not keep stressing it.
    if (!complete) break;
  }
  result.aggregate = {};
  for (const version of ['baseline', 'optimized']) {
    const rows = result.runs.filter(r => r.version === version && r.completed), actions = {}, phases = {};
    for (const row of rows) {
      for (const [name, values] of Object.entries(row.actions)) (actions[name] ||= []).push(...values);
      for (const item of row.phases) (phases[item.name] ||= []).push(...item.measurements);
    }
    result.aggregate[version] = {completedRepetitions:rows.length,
      actions:Object.fromEntries(Object.entries(actions).map(([name, values]) => [name, timingSummary(values)])),
      steps:Object.fromEntries(Object.entries(phases).map(([name, values]) => [name, timingSummary(values)]))};
  }
  reports.push(result);
}
const output = {
  schema:1, kind:'node-interactions', node:process.version, platform:process.platform, arch:process.arch,
  cpu:os.cpus()[0]?.model, logicalCpus:os.cpus().length, hz, dt, repetitions, order:['AB', 'BA', 'AB'], warmup,
  maximumSamplesPerPhase:samples, budgetMsPerVariantAndRepetition:budgetMs, identities,
  sharedFixtureSha256:hash(fs.readFileSync(path.join(roots.optimized, 'tests/cpu-audit-fixtures.cjs'))),
  method:[
    'Each root provides its own complete harness and shipped modules; actual 120 Hz preferences precede all constraints.',
    'Stateful action peaks are single operations in each fresh run. Physics samples exclude action, fixture, input-target, assertion and checkpoint serialization costs.',
    'All requested fixed steps execute through advanceSimulation; only at most 24 final steps per phase are timed, after at least eight untimed steps.',
    'Snapshots use the shared f.state unchanged, with exact comparison at named checkpoints. No physical, energy, contact or clock fields are removed or rounded.',
    'process.cpuUsage is process user/system CPU time; performance.now is elapsed wall time. Neither is CPU utilization, GPU time, RAF duration or browser FPS.',
    'Three action samples and at most 24 step samples per phase and repetition give coarse tail percentiles; individual samples are retained.',
    'The 8 s guard is checked between atomic game calls. It cannot interrupt a single long physics step or edit; overruns and incomplete phases are reported.',
    'Settling, setup and checks count toward the stress guard but are not charged to a measured action or step. Time-limited sequences do not pass full equivalence.'
  ], failed, reports
};
const json = JSON.stringify(output, null, 2) + '\n';
if (args.output) fs.writeFileSync(path.resolve(args.output), json); else process.stdout.write(json);
if (failed) process.exitCode = 1;
