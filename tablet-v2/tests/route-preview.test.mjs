import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRouteTimeline, sampleRouteTimeline } from '../route-preview.mjs';

const p = (x, z, action = 'pass', wait = 0) => ({ x, z, height: .5, action, wait });
const route = (points, options = {}) => ({ points, loop: false, speed: .5, ...options });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('preview travels from the drone origin to the first point at the configured speed', () => {
  const source = route([p(3, 4)], { speed: 1 });
  const snapshot = JSON.stringify(source), timeline = buildRouteTimeline(source);
  assert.equal(timeline.duration, 5);
  assert.deepEqual(sampleRouteTimeline(timeline, 0), { x: 0, z: 0, finished: false, pointIndex: 0, phase: 'travel' });
  assert.deepEqual(sampleRouteTimeline(timeline, 2.5), { x: 1.5, z: 2, finished: false, pointIndex: 0, phase: 'travel' });
  assert.deepEqual(sampleRouteTimeline(timeline, 5), { x: 3, z: 4, finished: true, pointIndex: 0, phase: 'finished' });
  assert.equal(JSON.stringify(source), snapshot, 'timeline does not mutate route data');
});

test('a landing waits its configured time then continues to the following point', () => {
  const timeline = buildRouteTimeline(route([p(1, 0, 'land', 3), p(2, 0)], { speed: 1 }));
  assert.equal(timeline.duration, 5);
  assert.equal(sampleRouteTimeline(timeline, 2).phase, 'land');
  assert.deepEqual(sampleRouteTimeline(timeline, 4.5), { x: 1.5, z: 0, finished: false, pointIndex: 1, phase: 'travel' });
  assert.equal(sampleRouteTimeline(timeline, 5).finished, true);
});

test('loop waits once at each visit and does not repeat the initial origin leg', () => {
  const timeline = buildRouteTimeline(route([p(1, 0, 'wait', 2), p(3, 0, 'land', 1)], { speed: 1, loop: true }));
  // Initial origin leg 1 s. Cycle: first pause 2 + outward 2 + landing 1 + return 2.
  assert.equal(timeline.loopStart, 1);
  assert.equal(timeline.duration, 8);
  assert.equal(sampleRouteTimeline(timeline, 8.5).phase, 'wait');
  assert.equal(sampleRouteTimeline(timeline, 9.5).phase, 'wait');
  const afterPause = sampleRouteTimeline(timeline, 10.5);
  close(afterPause.x, 1.5); assert.equal(afterPause.phase, 'travel');
  assert.equal(sampleRouteTimeline(timeline, 15.5).phase, 'wait', 'second full loop starts one normal pause');
  assert.equal(sampleRouteTimeline(timeline, 50000).finished, false);
});

test('zero route speed uses the original .5 fallback without rewriting stored data', () => {
  const source = route([p(2, 0)], { speed: 0 });
  const timeline = buildRouteTimeline(source);
  assert.equal(timeline.duration, 4); assert.equal(source.speed, 0);
  assert.equal(sampleRouteTimeline(timeline, 1).x, .5);
});

test('zero-length one-point loops and coincident points always return finite samples', () => {
  for (const points of [[p(0, 0)], [p(0, 0, 'land'), p(0, 0, 'wait')], [p(1, 1)]]) {
    const timeline = buildRouteTimeline(route(points, { loop: true }));
    for (const elapsed of [0, .1, 1, 10, 1e9, NaN, Infinity, -1]) {
      const sample = sampleRouteTimeline(timeline, elapsed);
      assert.ok(Number.isFinite(sample.x) && Number.isFinite(sample.z));
      assert.equal(sample.finished, false);
    }
  }
  const once = buildRouteTimeline(route([p(0, 0), p(0, 0)]));
  assert.equal(sampleRouteTimeline(once, 0).finished, true);
});

test('pass ignores wait while zero-time landing continues immediately', () => {
  const timeline = buildRouteTimeline(route([p(0, 0, 'pass', 120), p(1, 0, 'land', 0), p(2, 0)], { speed: 1 }));
  assert.equal(timeline.duration, 2);
  assert.equal(sampleRouteTimeline(timeline, 1).pointIndex, 2);
  assert.equal(sampleRouteTimeline(timeline, 1).phase, 'travel');
});

test('empty paths finish safely and malformed input is rejected before animation', () => {
  assert.deepEqual(sampleRouteTimeline(buildRouteTimeline(route([])), 5), { x: 0, z: 0, finished: true, pointIndex: -1, phase: 'finished' });
  for (const invalid of [route([p(NaN, 0)]), route([p(29, 0)]), route([p(0, 0, 'wait', -1)]), route([p(0, 0, 'teleport')]), route([p(0, 0)], { speed: -1 }), route(Array.from({ length: 49 }, () => p(0, 0)))]) assert.throws(() => buildRouteTimeline(invalid));
});

test('altitude is an editable route attribute but this top-view preview invents no vertical timing', () => {
  const source = route([p(1, 0), p(2, 0)]), first = buildRouteTimeline(source);
  source.points[0].height = 3; source.points[1].height = .15;
  const second = buildRouteTimeline(source);
  assert.equal(first.duration, second.duration);
  assert.deepEqual(sampleRouteTimeline(first, 3), sampleRouteTimeline(second, 3));
});
