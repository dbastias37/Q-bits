const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');
const drain = iterator => { let next; do { next = iterator.next(); } while (!next.done); return next.value; };
function shape(t, count) {
  return t.makeGroup(Array.from({ length: count }, (_, i) => ({ id: 1000 + i, weight: 1,
    p: t.V((i % 3) * .09, .045 + Math.floor(i / 3) * .09, 0), q: t.Q() })));
}

test('exact bounds match transformed corners, including merged structures and cache ownership', () => {
  const { t } = createGame(); t.clearNarrativeScene();
  const groups = Array.from({ length: 8 }, (_, i) => shape(t, i + 1));
  for (let i = 0; i < 500; i++) {
    const g = groups[i % groups.length], pos = t.V(Math.sin(i) * 5, Math.abs(Math.sin(i * .53)) * 3, Math.cos(i) * 4);
    const q = t.Q(Math.sin(i * .43), Math.cos(i * .22), Math.sin(i * .62), Math.cos(i * .12)); q.normalize();
    const expected = { min: t.V(Infinity, Infinity, Infinity), max: t.V(-Infinity, -Infinity, -Infinity) };
    for (const pose of t.poses(g, pos, q)) for (const corner of t.corners(pose)) for (const axis of ['x', 'y', 'z']) {
      expected.min[axis] = Math.min(expected.min[axis], corner[axis]); expected.max[axis] = Math.max(expected.max[axis], corner[axis]);
    }
    const actual = t.bounds(g, pos, q);
    for (const key of ['min', 'max']) for (const axis of ['x', 'y', 'z']) assert(Math.abs(expected[key][axis] - actual[key][axis]) < 1e-10);
    const cached = t.bounds(g); const original = cached.min.x; cached.min.x = 999;
    assert.equal(t.bounds(g).min.x, original, 'callers must not mutate cached bounds');
  }
});

test('route preview positions and distances match physical rolling for 1–8 part shapes', () => {
  const { t } = createGame();
  for (let parts = 1; parts <= 8; parts++) {
    t.clearNarrativeScene(); const g = shape(t, parts);
    for (const [x, z] of [[1, 1], [-1, -1], [1, -1]]) {
      const plan = drain(t.planRoute(g, t.V(x, 0, z))); assert(plan);
      let pos = plan.startPosition, q = plan.startQuaternion;
      for (let i = 0; i < plan.steps.length; i++) {
        const motion = t.rollGeometry(g, pos, q, plan.steps[i]);
        assert(motion.endP.distanceTo(plan.preview[i]) < 1e-8);
        assert(Math.abs(motion.stride - plan.strides[i]) < 1e-8);
        pos = motion.endP; q = motion.endQ;
      }
    }
  }
});

test('long blocked searches yield, can be canceled and cannot overwrite a newer order', () => {
  const game = createGame(), { t } = game; t.beginCampaignLevel(1); const g = t.groups[0];
  assert(t.startRoute(g, t.V(0, 0, -6), true));
  assert.equal(g.route, null, 'path is not searched synchronously');
  assert(t.navigationJobs.size > 0);
  t.runNavigationJobs();
  t.stopRoute(g); assert.equal(t.navigationJobs.size, 0); assert.equal(g.pendingMoodOrder, null);
  t.startRoute(g, t.V(0, 0, -6), true);
  t.startRoute(g, t.V(-1, 0, -1), true);
  game.navigationUntilIdle(); assert(g.route); assert.equal(g.route.goal.x, -1); assert.equal(g.route.goal.z, -1);
  t.clearNarrativeScene(); assert.equal(t.navigationJobs.size, 0);
});

test('all 12 levels step and draw, with stable bodies and GPU buffer ownership after reloads', () => {
  const { t, buffers } = createGame(), counts = [];
  for (let cycle = 0; cycle < 3; cycle++) for (let level = 1; level <= 12; level++) {
    t.beginCampaignLevel(level); t.hideStoryDialogue(); t.story.encounter = null;
    for (let i = 0; i < 10; i++) t.stepPhysics(1 / 60);
    t.drawStoryWorld(); t.drawQubits(); t.drawStoryGlass(); t.updateTarget(); t.updateSpeech(); t.updateStoryMarker();
    const count = { bodies: t.world.bodies.length, buffers: buffers.size, groups: t.groups.length, cargos: t.cargos.length };
    if (!cycle) counts[level] = count; else assert.deepEqual(count, counts[level]);
  }
});

test('real preparation builds the prologue and does not advance it before Play', async () => {
  const game = createGame(), { t, api } = game; assert(api);
  const progress = []; let done = false;
  const promise = api.prepare(value => progress.push(value)).then(() => { done = true; });
  assert.equal(done, false);
  for (let i = 0; i < 20 && !done; i++) { game.frame(); await Promise.resolve(); await Promise.resolve(); }
  await promise;
  assert.equal(progress.at(-1), 1); assert(progress.every((n, i) => !i || n >= progress[i - 1]));
  assert.equal(t.story.scene, 'intro'); assert.equal(t.story.phase, 'asleep'); assert.equal(t.story.mode, 'boot');
  assert(t.groups.length > 0); const elapsed = t.story.elapsed;
  for (let i = 0; i < 20; i++) game.frame(performance.now() + i * 17);
  assert.equal(t.story.elapsed, elapsed); assert.equal(t.story.started, false);
  api.play(); assert.equal(t.story.mode, 'playing'); assert.equal(t.story.phase, 'asleep'); assert.equal(t.story.started, true);
});

test('cargo planning completes asynchronously and cancellation releases crew and searches', () => {
  const game = createGame(), { t } = game; t.beginCampaignLevel(12); t.story.encounter = null;
  for (let i = 0; i < 60; i++) t.stepPhysics(1 / 60);
  const cargo = t.cargos[0], team = [...t.groups], goal = t.V(cargo.body.position.x - .7, 0, cargo.body.position.z + .3);
  assert(t.beginHaul(cargo, team, goal)); assert(cargo.pathSearch); assert.equal(cargo.job.phase, 'planning');
  t.stopHaul(cargo); assert.equal(cargo.job, null); assert.equal(t.navigationJobs.size, 0);
  assert(team.every(g => !g.haulJob));
  assert(t.beginHaul(cargo, team, goal)); game.navigationUntilIdle();
  assert.equal(cargo.job.phase, 'reuniendo'); assert(cargo.job.path.length);
  const endpoint = cargo.job.path.at(-1); assert(Math.hypot(endpoint.x - goal.x, endpoint.z - goal.z) < 1e-8);
  // Workers may schedule approach searches during the next physics update.
  t.stepPhysics(1 / 60); t.stopHaul(cargo);
  assert.equal(t.navigationJobs.size, 0); assert(team.every(g => !g.haulJob));
});
