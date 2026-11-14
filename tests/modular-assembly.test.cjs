const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');
const C = .09;
const EPS = 1e-8;

function near(actual, expected, epsilon = EPS) {
  assert(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
}
function volume(t, shape) {
  const profile = t.unitProfile(shape);
  let total = 0;
  for (const face of profile.faces) for (let i = 1; i < face.length - 1; i++) {
    const [a, b, c] = [face[0], face[i], face[i + 1]].map(k => profile.vertices[k]);
    total += a.dot(b.cross(c)) / 6;
  }
  return total;
}
function inside(t, part, point, tolerance = 1e-10) {
  const local = part.q.inverse().vmult(point.vsub(part.p));
  const profile = t.unitProfile(part.shape);
  return profile.faceNormals.every((normal, i) => normal.dot(local.vsub(profile.faceCenters[i])) <= tolerance);
}
function sameVertices(a, b) {
  return a.length === b.length && a.every(v => b.some(w => v.distanceTo(w) < EPS));
}
function sharedFace(t, a, b) {
  return t.unitFaces(a).some(fa => t.unitFaces(b).some(fb =>
    fa.normal.dot(fb.normal) < -1 + EPS && sameVertices(fa.vertices, fb.vertices)));
}
function noIntersections(t, parts) {
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    assert.equal(t.obbOverlap(parts[i], parts[j], 1e-8), false, `interiors overlap: ${parts[i].id}, ${parts[j].id}`);
  }
}
function area(vertices) {
  let sum = 0;
  for (let i = 1; i < vertices.length - 1; i++) {
    sum += vertices[i].vsub(vertices[0]).cross(vertices[i + 1].vsub(vertices[0])).norm() / 2;
  }
  return sum;
}
function splitPyramid(t, pyramid, id = 200) {
  const turn = t.Q(); turn.setFromAxisAngle(t.V(0, 1, 0), Math.PI);
  return [
    { id, shape: 'tetra', weight: 1, p: pyramid.p.vadd(pyramid.q.vmult(t.V(C / 8, 0, -C / 8))), q: pyramid.q.clone() },
    { id: id + 1, shape: 'tetra', weight: 1, p: pyramid.p.vadd(pyramid.q.vmult(t.V(-C / 8, 0, C / 8))), q: pyramid.q.mult(turn) }
  ];
}
function cubeParts(t, kind, rotation = t.Q(), center = t.V(.3, 1, -.2)) {
  // Each base is a different cube boundary; all six tips meet at its center.
  const normals = [t.V(0, -1, 0), t.V(-1, 0, 0), t.V(0, 0, -1), t.V(1, 0, 0), t.V(0, 0, 1), t.V(0, 1, 0)];
  const pyramids = normals.map((normal, i) => {
    const face = t.Q(); face.setFromVectors(t.V(0, -1, 0), normal); face.normalize();
    return { id: 100 + i, shape: 'pyramid', weight: 1,
      p: center.vadd(rotation.vmult(normal.scale(3 * C / 8))), q: rotation.mult(face) };
  });
  const parts = kind === 'pyramid' ? pyramids : pyramids.flatMap((p, i) =>
    kind === 'mixed' && i > 0 ? [p] : splitPyramid(t, p, 200 + i * 2));
  return { parts, rotation, center };
}
function assertCubeClosure(t, assembly) {
  const { parts, rotation, center } = assembly;
  const toLocal = p => rotation.inverse().vmult(p.vsub(center));
  noIntersections(t, parts);
  near(parts.reduce((sum, part) => sum + volume(t, part.shape), 0), C ** 3, 1e-12);
  const points = parts.flatMap(part => t.corners(part).map(toLocal));
  for (const axis of ['x', 'y', 'z']) {
    near(Math.min(...points.map(p => p[axis])), -C / 2);
    near(Math.max(...points.map(p => p[axis])), C / 2);
  }
  // Every exposed face lies on the intended cube; each boundary receives C² area.
  const faces = parts.flatMap(part => t.unitFaces(part).map(face => ({ part, face })));
  const exposed = faces.filter(({ part, face }) => !faces.some(other => other.part !== part &&
    face.normal.dot(other.face.normal) < -1 + EPS && sameVertices(face.vertices, other.face.vertices)));
  const surface = new Map();
  for (const { face } of exposed) {
    const vertices = face.vertices.map(toLocal);
    const boundary = ['x', 'y', 'z'].flatMap(axis => [-1, 1].map(sign => ({ axis, sign })))
      .find(({ axis, sign }) => vertices.every(v => Math.abs(v[axis] - sign * C / 2) < EPS));
    assert(boundary, 'no exposed interior face or hidden crack may remain');
    const key = boundary.axis + boundary.sign;
    surface.set(key, (surface.get(key) || 0) + area(face.vertices));
  }
  assert.equal(surface.size, 6);
  for (const value of surface.values()) near(value, C * C, 1e-12);
  // Offset samples avoid shared planes. The closed solid contains each point once.
  for (let x = 0; x < 7; x++) for (let y = 0; y < 8; y++) for (let z = 0; z < 9; z++) {
    const local = t.V(((x + .317) / 7 - .5) * C, ((y + .173) / 8 - .5) * C, ((z + .719) / 9 - .5) * C);
    const point = center.vadd(rotation.vmult(local));
    assert.equal(parts.filter(part => inside(t, part, point)).length, 1, 'every interior sample belongs to exactly one piece');
  }
}

test('two complementary triangular T-bits fill one square pyramid without a seam gap or intersection', () => {
  const { t } = createGame();
  for (const turned of [false, true]) {
    const q = t.Q(); if (turned) q.setFromEuler(.47, -.32, .29);
    const pyramid = { id: 1, shape: 'pyramid', p: t.V(.2, 1, -.4), q };
    const halves = splitPyramid(t, pyramid);
    assert(sharedFace(t, ...halves)); noIntersections(t, halves);
    near(volume(t, 'tetra') * 2, volume(t, 'pyramid'), 1e-12);
    near(volume(t, 'pyramid'), C ** 3 / 6, 1e-12);
    near(volume(t, 'tetra'), C ** 3 / 12, 1e-12);
    const inverse = q.inverse();
    const all = halves.flatMap(part => t.corners(part).map(p => inverse.vmult(p.vsub(pyramid.p))));
    const reference = t.unitProfile('pyramid').vertices;
    for (const axis of ['x', 'y', 'z']) {
      near(Math.min(...all.map(p => p[axis])), Math.min(...reference.map(p => p[axis])));
      near(Math.max(...all.map(p => p[axis])), Math.max(...reference.map(p => p[axis])));
    }
    for (let x = 0; x < 9; x++) for (let y = 0; y < 8; y++) for (let z = 0; z < 9; z++) {
      const local = t.V(((x + .237) / 9 - .5) * C, ((y + .713) / 8 * .5 - .125) * C, ((z + .519) / 9 - .5) * C);
      const point = pyramid.p.vadd(q.vmult(local));
      assert.equal(halves.filter(part => inside(t, part, point)).length, Number(inside(t, pyramid, point)));
    }
  }
});

test('six pyramids, twelve triangular halves and a mixed assembly each close a complete Q-bit volume', () => {
  const { t } = createGame();
  for (const kind of ['pyramid', 'tetra', 'mixed']) for (const turned of [false, true]) {
    const q = t.Q(); if (turned) q.setFromEuler(.31, -.48, .22);
    assertCubeClosure(t, cubeParts(t, kind, q));
  }
});

function assembleBySnap(t, intended) {
  t.clearNarrativeScene();
  const remaining = [...intended.parts];
  const first = remaining.shift();
  let target = t.makeGroup([first]);
  const placed = [first];
  while (remaining.length) {
    const index = remaining.findIndex(part => placed.some(other => sharedFace(t, part, other)));
    assert(index >= 0, 'the intended assembly is face-connected');
    const desired = remaining.splice(index, 1)[0];
    const noise = t.Q(); noise.setFromEuler(.018, -.012, .009);
    const source = t.makeGroup([{ ...desired, p: desired.p.vadd(t.V(.0008, .0006, -.0007)), q: desired.q.mult(noise) }]);
    t.setHeld({ g: source, part: source.parts[0], items: [{ g: source }] });
    t.keys.add('ShiftLeft');
    const candidate = t.findSnap();
    assert(candidate, `${remaining.length ? 'next' : 'last cavity'} ${desired.shape} must snap`);
    assert.equal(candidate.target, target);
    const pose = t.poses(source, candidate.position, candidate.quaternion)[0];
    assert(sameVertices(t.corners(pose), t.corners(desired)), 'snap must place the part into the intended closing slot');
    t.setHeld(null);
    target = t.weld(candidate); assert(target, 'a full-face cavity fit must weld');
    placed.push(desired);
  }
  assert.equal(t.groups.length, 1);
  assert.equal(target.parts.length, intended.parts.length);
  return target;
}

test('the normal Shift snap and weld path closes the final cavity in six- and twelve-part cubes', () => {
  for (const kind of ['pyramid', 'tetra']) for (const turned of [false, true]) {
    const { t } = createGame();
    const q = t.Q(); if (turned) q.setFromEuler(.31, -.48, .22);
    const intended = cubeParts(t, kind, q);
    const joined = assembleBySnap(t, intended);
    assertCubeClosure(t, { ...intended, parts: t.worldParts(joined) });
    t.detachPart({ g: joined, part: joined.parts[0] }, true);
    assert.equal(t.groups.length, intended.parts.length);
    assertCubeClosure(t, { ...intended, parts: t.groups.flatMap(g => t.worldParts(g)) });
  }
});

function baseAssembly(t, sourceKind, targetKind, turned = false) {
  const rotation = t.Q(); if (turned) rotation.setFromEuler(.31, -.48, .22);
  const center = t.V(.2, 1, -.3), down = t.Q(); down.setFromAxisAngle(t.V(0, 0, 1), Math.PI);
  function side(kind, above, id) {
    const pyramid = { id, shape: 'pyramid', weight: 1, p: t.V(0, (above ? 1 : -1) * C / 8, 0), q: above ? t.Q() : down.clone() };
    const parts = kind === 'pair' ? splitPyramid(t, pyramid, id) : kind === 'pyramid' ? [pyramid] :
      [{ id, shape: 'cube', weight: 1, p: t.V(0, (above ? 1 : -1) * C / 2, 0), q: t.Q() }];
    return parts.map(part => ({ ...part, p: center.vadd(rotation.vmult(part.p)), q: rotation.mult(part.q) }));
  }
  return { source: side(sourceKind, true, 300), target: side(targetKind, false, 400), center, rotation };
}
function assertFullCompoundBase(t, parts, center, rotation) {
  const local = point => rotation.inverse().vmult(point.vsub(center));
  const faces = parts.flatMap(part => t.unitFaces(part)).filter(face => face.vertices.every(v => Math.abs(local(v).y) < EPS));
  assert(faces.length > 0);
  near(faces.reduce((sum, face) => sum + area(face.vertices), 0), C ** 2, 1e-12);
  for (const face of faces) for (const v of face.vertices.map(local)) {
    assert(Math.abs(v.x) <= C / 2 + EPS && Math.abs(v.z) <= C / 2 + EPS);
  }
  for (let x = 0; x < 9; x++) for (let z = 0; z < 10; z++) {
    const sample = center.vadd(rotation.vmult(t.V(((x + .317) / 9 - .5) * C, 0, ((z + .719) / 10 - .5) * C)));
    assert.equal(parts.filter(part => inside(t, part, sample)).length, 1, 'a composite base must cover its entire square once');
  }
}
function snapCompoundBase(t, intended) {
  t.clearNarrativeScene();
  const target = t.makeGroup(intended.target), source = t.makeGroup(intended.source);
  const noise = t.Q(); noise.setFromEuler(.018, -.012, .009);
  source.body.position.vadd(t.V(.0008, .0006, -.0007), source.body.position);
  source.body.quaternion.copy(noise.mult(source.body.quaternion));source.body.aabbNeedsUpdate = true;
  t.setHeld({ g: source, part: source.parts[0], items: [{ g: source }] });t.keys.add('ShiftLeft');
  const snap = t.findSnap();
  assert(snap, 'a complete two-triangle square must snap as one complete base');
  assert.equal(snap.target, target);
  const actual = t.poses(source, snap.position, snap.quaternion);
  for (const part of actual) {
    const expected = intended.source.find(p => p.id === part.part.id);
    assert(sameVertices(t.corners(part), t.corners(expected)), 'the square must align without rotating or sliding its triangular halves independently');
  }
  t.setHeld(null);
  const joined = t.weld(snap);assert(joined, 'complete compound-square contact must be accepted by weld');
  const parts = t.worldParts(joined);noIntersections(t, parts);
  assertFullCompoundBase(t, parts.filter(p => intended.source.some(s => s.id === p.id)), intended.center, intended.rotation);
  assertFullCompoundBase(t, parts.filter(p => intended.target.some(s => s.id === p.id)), intended.center, intended.rotation);
  return joined;
}

test('complete two-triangle bases snap to cubes, pyramid bases and other pairs in both directions', () => {
  for (const [sourceKind, targetKind] of [['pair', 'cube'], ['cube', 'pair'], ['pair', 'pyramid'], ['pyramid', 'pair'], ['pair', 'pair']]) {
    for (const turned of [false, true]) {
      const { t } = createGame(), intended = baseAssembly(t, sourceKind, targetKind, turned);
      const joined = snapCompoundBase(t, intended);
      assert.equal(joined.parts.length, intended.source.length + intended.target.length);
      assert.equal(t.groups.length, 1);
      t.saveShape(joined);
      assert.equal(t.savedShapes.length, 1, 'the connected compound base is valid for saving');
      assert.equal(t.savedShapes[0].geometryVersion, 3);
    }
  }
});

test('removing either triangular half breaks an incomplete square attachment and preserves all pieces', () => {
  for (const removedIndex of [0, 1]) {
    const { t } = createGame(), intended = baseAssembly(t, 'pair', 'cube');
    const joined = snapCompoundBase(t, intended);
    const removedId = intended.source[removedIndex].id;
    t.detachPart({ g: joined, part: joined.parts.find(p => p.id === removedId) });
    assert.equal(t.groups.length, 3, 'a single remaining triangle must no longer carry the cube');
    assert(t.groups.every(g => g.parts.length === 1));
    assert.deepEqual(Array.from(t.groups, g => g.parts[0].id).sort(), [...intended.source, ...intended.target].map(p => p.id).sort());
    const remaining = t.groups.flatMap(g => t.worldParts(g));
    for (const part of remaining) {
      const expected = [...intended.source, ...intended.target].find(p => p.id === part.id);
      assert(sameVertices(t.corners(part), t.corners(expected)), 'detaching must not move or lose a piece');
    }
    noIntersections(t, remaining);
  }
});

test('one triangular half cannot attach to a square base on its own in either direction', () => {
  for (const sourceKind of ['pair', 'cube']) {
    const { t } = createGame(), intended = baseAssembly(t, sourceKind, sourceKind === 'pair' ? 'cube' : 'pair');
    if (sourceKind === 'pair') intended.source = intended.source.slice(0, 1);
    else intended.target = intended.target.slice(0, 1);
    t.clearNarrativeScene();
    const source = t.makeGroup(intended.source), target = t.makeGroup(intended.target);
    t.setHeld({ g: source, part: source.parts[0], items: [{ g: source }] });t.keys.add('ShiftLeft');
    assert(t.findSnap() === null, 'half a square is not a compatible full-square connector');t.setHeld(null);
    assert(!t.weld({ source, target, position: source.body.position.clone(), quaternion: source.body.quaternion.clone() }));
    assert.equal(t.groups.length, 2);
  }
});
