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
    assert.ok(Math.hypot(p.start[0], p.start[2]) > 10, 'cube must enter from outside the title');
  }
  pieces[0].target[0] = 100;
  assert.notEqual(opening.makePieces()[0].target[0], 100, 'instances must not modify font data');
});

for (const rate of [30, 60, 120]) test(`all cubes physically settle before the glow at ${rate} FPS`, () => {
  const pieces = opening.makePieces(), step = 1 / rate;
  for (let frame = 1; frame <= Math.ceil(40 * rate); frame++) opening.updatePieces(pieces, frame * step, step);
  assert.equal(pieces.filter(p => p.settled).length, 69);
  for (const p of pieces) {
    assert.ok(Math.hypot(...p.p.map((v, i) => v - p.target[i])) < .012);
    assert.ok([...p.p, ...p.v, p.angle].every(Number.isFinite));
  }
  for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
    assert.ok(Math.hypot(pieces[i].p[0] - pieces[j].p[0], pieces[i].p[2] - pieces[j].p[2]) > .335, 'settled cubes must not overlap');
  }
});

test('rolling lifts the center around a support edge and replans around an obstacle',()=>{
 const p=opening.makePieces().slice(0,2);p[0].p=[0,.1675,0];p[0].target=[1.005,.1675,0];p[0].delay=0;
 p[1].p=[.40,.1675,0];p[1].settled=true;
 opening.updatePieces(p,2,.06);
 assert.ok(p[0].p[1]>.2);assert.ok(p[0].rollAngle>0);assert.ok(Math.abs(p[0].p[2])>0,'detour must avoid blocked forward step');
 for(let t=2;t<12;t+=1/60)opening.updatePieces(p,t,1/60);
 assert.equal(p[0].settled,true);assert.ok(p[0].replans>0);
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
