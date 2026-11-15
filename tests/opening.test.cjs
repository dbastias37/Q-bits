const test = require('node:test');
const assert = require('node:assert/strict');
const opening = require('../assets/js/opening.js');

test('the title has one independently addressable cube for each of its 69 font dots', () => {
  const pieces = opening.makePieces();
  assert.equal(pieces.length, 69);
  assert.equal(new Set(pieces.map(p => p.target.join(','))).size, 69);
  assert.equal(new Set(pieces.map(p => p.id)).size, 69);
  for (const p of pieces) {
    assert.ok(p.target.every(Number.isFinite));
    assert.ok(Math.hypot(p.start[0], p.start[2]) > 14, 'cube must enter from outside the title');
  }
  pieces[0].target[0] = 100;
  assert.notEqual(opening.makePieces()[0].target[0], 100, 'instances must not modify font data');
});

for (const rate of [30, 60, 120]) test(`all cubes physically settle before the glow at ${rate} FPS`, () => {
  const pieces = opening.makePieces(), step = 1 / rate;
  for (let frame = 1; frame <= Math.ceil(opening.TIMING.assemble * rate); frame++) opening.updatePieces(pieces, frame * step, step);
  assert.equal(pieces.filter(p => p.settled).length, 69);
  for (const p of pieces) {
    assert.ok(Math.hypot(...p.p.map((v, i) => v - p.target[i])) < .012);
    assert.ok([...p.p, ...p.v, p.angle].every(Number.isFinite));
  }
  for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
    assert.ok(Math.hypot(pieces[i].p[0] - pieces[j].p[0], pieces[i].p[2] - pieces[j].p[2]) > .335, 'settled cubes must not overlap');
  }
});

test('an approaching pair separates and exchanges an impulse instead of passing through', () => {
  const pieces = opening.makePieces().slice(0, 2);
  for (const [i, p] of pieces.entries()) {
    const x = i ? .1 : -.1;
    p.start = p.bend = p.target = [x, .335 / 2, 0];
    p.p = [x, .335 / 2, 0]; p.v = [i ? -.8 : .8, 0, 0]; p.delay = 0;
  }
  opening.updatePieces(pieces, .5, 1 / 60);
  assert.ok(pieces[1].p[0] - pieces[0].p[0] >= .335);
  assert.ok(pieces[0].v[0] < 0 && pieces[1].v[0] > 0, 'contact should reverse the closing motion');
});

test('camera completes a tracked 360 orbit without nonfinite transforms on narrow screens', () => {
  for (const aspect of [.45, 1, 16 / 9, 3]) {
    let angle = 0, previous = 0;
    for (let i = 0; i <= 120; i++) {
      const camera = opening.orbitCamera(i / 120, aspect);
      assert.deepEqual(camera.at, [0, 0, 0]);
      assert.ok([...camera.eye, camera.roll, camera.fov].every(Number.isFinite));
      assert.ok(camera.eye[1] > 0);
      if (i === 0) continue;
      const current = Math.atan2(camera.eye[0], camera.eye[2]);
      let delta = current - previous;
      if (delta < -Math.PI) delta += 2 * Math.PI;
      angle += delta; previous = current;
    }
    assert.ok(Math.abs(angle - 2 * Math.PI) < .001);
  }
  assert.ok(opening.orbitCamera(0, .45).eye[1] > opening.orbitCamera(0, 16 / 9).eye[1], 'portrait view must move back to fit the title');
});

test('reduced motion holds an unbanked overhead camera while retaining the title target', () => {
  const initial = opening.orbitCamera(0, .5, [0, 0, 0], true);
  for (const t of [.1, .5, .9, 1]) assert.deepEqual(opening.orbitCamera(t, .5, [0, 0, 0], true), initial);
  assert.equal(initial.roll, 0);
});
