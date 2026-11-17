// Logic/render-submission tests: Cannon is real; WebGL and DOM are stubs.
// These assertions do not measure GPU performance or certify browser pixels.
const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');
const P = require('../assets/js/preferences.js');

function fixture(options = {}) {
  let next = 0, bound = null;
  const draws = [], live = new Set(), uniforms = new Map(), locations = new Map();
  const gl = new Proxy({
    TRIANGLES: 4, TRIANGLE_STRIP: 5, LINES: 1, FRAMEBUFFER_COMPLETE: 0x8cd5,
    getShaderParameter: () => true, getProgramParameter: () => true,
    getParameter: () => 8192, getExtension: () => null, isContextLost: () => false,
    checkFramebufferStatus: () => 0x8cd5,
    createShader: () => ++next, createProgram: () => ++next,
    createTexture: () => ++next, createFramebuffer: () => ++next, createRenderbuffer: () => ++next,
    createBuffer() { const id = ++next; live.add(id); return id; },
    deleteBuffer(id) { live.delete(id); }, bindBuffer(_, id) { bound = id; },
    getUniformLocation: (_, name) => name,
    getAttribLocation(_, name) { if (!locations.has(name)) locations.set(name, locations.size); return locations.get(name); },
    uniform1f: (name, value) => uniforms.set(name, value),
    uniform2f: (name, ...value) => uniforms.set(name, value),
    uniform3f: (name, ...value) => uniforms.set(name, value),
    uniform3fv: (name, value) => uniforms.set(name, Array.from(value)),
    uniform4f: (name, ...value) => uniforms.set(name, value),
    drawArrays(mode, first, count) {
      draws.push({mode, first, count, bound, kind: uniforms.get('uKind'), center: uniforms.get('uCenter'), eye: uniforms.get('uCamera')});
    },
  }, {get: (object, key) => key in object ? object[key] : /^[A-Z_]+$/.test(key) ? 0 : () => {}});
  const game = createGame({gl, graphics: options.graphics === true}), {t, sandbox} = game;
  t.clearNarrativeScene();
  Object.assign(t.story, {ready: true, mode: 'playing', scene: 'lab', phase: 'idle', started: true});
  sandbox.document.body.dataset.booting = 'false';
  sandbox.document.pointerLockElement = t.canvas;
  t.position.splice(0, 3, 0, t.EYE_HEIGHT, 0);
  t.setLook({camera: [0, t.EYE_HEIGHT, 0], yaw: 0, pitch: 0});
  t.getVisuals().shadows = 'off';
  t.resize();
  draws.length = 0;
  return {...game, gl, draws, live, uniforms};
}

function snapshot(t) {
  return JSON.parse(JSON.stringify({
    time: t.getSimTime(), groups: t.groups.map(g => ({
      p: g.body.position, q: g.body.quaternion, v: g.body.velocity, w: g.body.angularVelocity,
      pieces: t.worldParts(g),
    })), constraints: t.world.constraints.length,
  }));
}

function press(game, code, rest = {}) {
  const event = {code, repeat: false, target: game.t.canvas, preventDefault() { this.defaultPrevented = true; }, ...rest};
  game.t.onPhysicalKeyDown(event);
  return event;
}

test('offscreen culling reduces submitted geometry without changing a powered mechanism or its simulation', () => {
  const runs = [];
  for (const enabled of [false, true]) {
    const game = fixture(), {t} = game;
    t.getVisuals().culling = enabled;
    t.cullingLab.stats = true;
    t.addQubit([0, .5, -3]);
    const rotor = t.spawnRotor(t.V(0, .4, 3), {mount: 'fixed'});
    assert(t.configureRotor(rotor, {enabled: true}));
    const before = [rotor.aId, rotor.bId].map(id => t.rotorPart(id).part.mood.energy);
    for (let frame = 0; frame < 60; frame++) {
      t.stepPhysics(1 / 120);
      t.renderScene(frame * 1000 / 120);
    }
    const after = [rotor.aId, rotor.bId].map(id => t.rotorPart(id).part.mood.energy);
    assert(after.every((value, i) => value < before[i]), 'the unseen motor still pays its energy cost');
    assert.equal(rotor.enabled, true);
    runs.push({state: snapshot(t), render: {...t.cullingLab.last}});
  }
  assert.deepEqual(runs[1].state, runs[0].state);
  assert(runs[1].render.calls < runs[0].render.calls);
  assert(runs[1].render.triangles < runs[0].render.triangles);
  assert(runs[1].render.hiddenPieces >= 2);
});

test('a large rotated body remains visible when a corner enters the screen even if its center is outside', () => {
  const {t} = fixture();
  const parts = [];
  for (let i = 0; i < 30; i++) parts.push({id: t.allocateUnitId(), shape: 'cube', weight: 1, p: t.V(2.7 + i * .09, 1.68, -3), q: t.Q()});
  const group = t.makeGroup(parts);
  let visibleCorners = 0;
  for (const angle of [0, .3, .8, 1.4]) {
    group.body.quaternion.setFromEuler(.25, angle, .2);
    for (const yaw of [0, -.25, -.5]) {
      t.setLook({yaw});
      t.beginVisibilityFrame();
      for (const pose of t.poses(group)) for (const point of t.corners(pose)) {
        assert(point.distanceTo(group.body.position) <= t.renderGroupRadius(group) + 1e-8);
        const screen = t.project(point);
        if (screen && screen.depth < 60 && screen.x >= 0 && screen.x <= 1280 && screen.y >= 0 && screen.y <= 720) {
          visibleCorners++;
          assert(t.renderGroupVisible(group), 'a visible vertex must never disappear with its body');
        }
      }
    }
  }
  assert(visibleCorners > 0, 'the fixture exercises actual screen intersections');
  t.renderVisibility.active = false;
});

test('propeller visual vertices remain inside the culling bound throughout a full rotation', () => {
  const {t} = fixture();
  const group = t.spawnSavedMechanism(t.propellerBlueprintTemplate(true), t.V(0, 0, -2));
  assert(group);
  const flight = t.flightForGroup(group);
  assert(flight);
  flight.enabled = true;
  const radius = t.renderGroupRadius(group);
  for (let i = 0; i < 32; i++) {
    flight.phase = i * Math.PI / 16;
    group.body.quaternion.setFromEuler(i * .07, .4, -.3);
    for (const part of group.parts) {
      const pose = t.propellerVisualPose(group, part);
      for (const local of t.unitProfile(part).vertices) {
        const world = pose.q.vmult(local).vadd(pose.p);
        assert(world.distanceTo(group.body.position) <= radius + 1e-8);
      }
    }
  }
});

test('an offscreen object keeps its sharp shadow when the projected shadow is visible', () => {
  const {t} = fixture();
  t.getVisuals().shadows = 'sharp';
  t.cullingLab.stats = true;
  t.setLook({camera: [0, 1, 0], pitch: -.55});
  const group = t.addQubit([0, 3, -2]);
  t.beginVisibilityFrame();
  assert.equal(t.renderGroupVisible(group), false);
  assert.equal(t.renderShadowVisible(group), true);
  t.renderScene();
  assert.equal(t.cullingLab.last.hiddenPieces, 1);
  assert.equal(t.renderVisibility.shadowGroups, 1);
  assert(t.cullingLab.last.triangles > 12, 'the room and projected shadow are submitted');
});

test('a selected offscreen body keeps its screen-space marker when the marker enters the screen', () => {
  const {t, draws} = fixture();
  const group = t.addQubit([0, .05, -10]);
  t.setMultiSelection([group]);
  t.setSelected({g: group, part: group.parts[0]});
  t.getVisuals().markers = true;
  t.getVisuals().markerMotion = false;
  t.setLook({pitch: .47});
  t.beginVisibilityFrame();
  assert.equal(t.renderGroupVisible(group), false, 'the body is completely below the view');
  const bb = t.bounds(group), anchor = t.project(t.V(bb.center.x, bb.max.y + .025, bb.center.z));
  assert(anchor.y > 720 && anchor.y - 32 < 720, 'the screen-space marker crosses the lower screen edge');
  const markerDraws = () => draws.filter(draw => draw.kind === 3 && draw.count === 24);
  t.getVisuals().culling = false;
  draws.length = 0;
  t.renderScene();
  assert.equal(markerDraws().length, 1, 'the four-edge selection marker is drawn with culling off');
  t.getVisuals().culling = true;
  draws.length = 0;
  t.renderScene();
  assert.equal(markerDraws().length, 1, 'culling the body must not remove its visible marker');
});

test('visibility refreshes immediately after a moving body or a rapid camera turn', () => {
  const {t} = fixture();
  const group = t.addQubit([0, 1.68, 3]);
  t.beginVisibilityFrame();
  assert.equal(t.renderGroupVisible(group), false);
  group.body.position.z = -3;
  t.beginVisibilityFrame();
  assert.equal(t.renderGroupVisible(group), true);
  t.setLook({yaw: Math.PI});
  t.beginVisibilityFrame();
  assert.equal(t.renderGroupVisible(group), false);
  group.body.position.z = 3;
  t.beginVisibilityFrame();
  assert.equal(t.renderGroupVisible(group), true);
  t.renderVisibility.active = false;
});

test('Numpad7 ignores repeat and text editing, honors a custom binding, and does not use Digit7', () => {
  const game = fixture(), {t, sandbox} = game;
  press(game, 'Numpad7', {repeat: true});
  assert.equal(t.cullingLab.observer, false);
  press(game, 'Numpad7', {target: {tagName: 'INPUT'}});
  press(game, 'Digit7');
  assert.equal(t.cullingLab.observer, false);
  press(game, 'Numpad7', {key: 'Home'}); // NumLock off still uses the physical key code.
  assert.equal(t.cullingLab.observer, true);
  press(game, 'Numpad7', {repeat: true});
  assert.equal(t.cullingLab.observer, true);
  press(game, 'Numpad7');
  assert.equal(t.cullingLab.observer, false);
  const preferences = P.defaults();
  preferences.controls.keyboard.bindings.forward = 'Numpad7';
  t.applyPreferences(preferences);
  sandbox.document.pointerLockElement = t.canvas;
  press(game, 'Numpad7');
  assert.equal(t.cullingLab.observer, false);
  assert(t.keys.has('KeyW'), 'custom forward mapping takes precedence');
});

test('observer draws from an external camera while visibility and gameplay rays stay with the player', () => {
  const {t, draws} = fixture();
  t.addQubit([0, 1.68, -3]);
  t.addQubit([0, 1.68, 3]);
  t.cullingLab.stats = true;
  t.renderScene();
  const beforeLook = t.getLook(), beforeRay = t.screenRay(640, 360), hidden = t.cullingLab.last.hiddenPieces;
  assert(t.toggleCullingObserver());
  draws.length = 0;
  t.renderScene();
  assert.deepEqual(t.getLook(), beforeLook);
  assert.deepEqual(t.screenRay(640, 360), beforeRay);
  assert.equal(t.cullingLab.last.hiddenPieces, hidden);
  assert.notDeepEqual(draws[0].eye, beforeLook.camera);
  assert.equal(t.renderVisibility.active, false);
  assert.equal(t.cullingLab.renderView, null);
  assert(draws.some(draw => draw.mode === 1), 'observer includes frustum lines');
});

test('A/B freezes physics, energy, camera and inputs, restores the culling setting and records paired samples', () => {
  const game = fixture(), {t, sandbox} = game;
  t.getVisuals().culling = false;
  const rotor = t.spawnRotor(t.V(0, .4, 3), {mount: 'fixed'});
  assert(t.configureRotor(rotor, {enabled: true}));
  t.addQubit([0, 1.68, -3]);
  const state = snapshot(t), look = t.getLook();
  assert(t.startCullingBenchmark());
  press(game, 'KeyW');
  sandbox.document.dispatchEvent({type: 'mousemove', movementX: 120, movementY: 70, timeStamp: 10});
  assert.deepEqual(t.getLook(), look);
  for (let i = 0; i < 192; i++) t.frame(1000 + i * 16);
  assert.equal(t.cullingLab.benchmark, null);
  assert.equal(t.getVisuals().culling, false);
  assert.deepEqual(snapshot(t), state);
  assert.deepEqual(t.getLook(), look);
  assert.equal(t.cullingLab.result.off.samples, 72);
  assert.equal(t.cullingLab.result.on.samples, 72);
  assert(t.cullingLab.result.on.calls.median < t.cullingLab.result.off.calls.median);
  assert(t.cullingLab.result.on.triangles.median < t.cullingLab.result.off.triangles.median);
  assert.equal(t.cullingLab.result.config.pieces, 3);
  assert.equal(t.renderVisibility.active, false);
});

test('Escape and hidden tabs cancel a comparison without spending energy or changing saved culling', () => {
  const game = fixture(), {t, sandbox} = game;
  t.addQubit([0, 1, -2]);
  const before = snapshot(t);
  assert(t.startCullingBenchmark());
  for (let i = 0; i < 20; i++) t.frame(1000 + i * 16);
  press(game, 'Escape');
  assert.equal(t.cullingLab.benchmark, null);
  assert.equal(t.cullingLab.result, null);
  assert.equal(t.getVisuals().culling, true);
  assert.deepEqual(snapshot(t), before);
  assert(t.startCullingBenchmark());
  sandbox.document.hidden = true;
  t.frame(2000);
  assert.equal(t.cullingLab.benchmark, null);
  assert.deepEqual(snapshot(t), before);
});

test('repeated culling and observer toggles reuse existing WebGL buffers', () => {
  const {t, live} = fixture();
  t.addQubit([0, 1.68, -3]);
  t.addQubit([0, 1.68, 3]);
  t.cullingLab.stats = true;
  t.toggleCullingObserver();
  t.renderScene();
  t.toggleCullingObserver();
  const warmed = live.size;
  for (let i = 0; i < 20; i++) {
    t.toggleCulling();
    t.toggleCullingObserver();
    t.renderScene(i * 16);
  }
  assert.equal(live.size, warmed);
});

test('settings preview remains independent of the player frustum, including post effects', () => {
  const {t, draws, sandbox} = fixture({graphics: true});
  t.cullingLab.stats = true;
  t.addQubit([0, 1.68, 3]);
  t.setLook({yaw: 2.1, pitch: .7});
  t.renderScene();
  const look = t.getLook(), state = snapshot(t);
  t.initSettingsScreen();
  t.getSettingsScreen().open('pause');
  // The preview's draft drives its own camera and is independent of culling.
  const selector = sandbox.document.querySelector('#pref-style');
  selector.value = 'neon';
  selector.dispatchEvent({type: 'change'});
  assert.equal(t.getSettingsScreen().draft.bloom, true);
  draws.length = 0;
  assert.doesNotThrow(() => t.renderSettingsPreview(3000));
  const firstCount = draws.length;
  assert(draws.some(draw => draw.mode === 5), 'the post-processing passes are exercised');
  t.getVisuals().culling = false;
  draws.length = 0;
  assert.doesNotThrow(() => t.renderSettingsPreview(3000));
  assert.equal(draws.length, firstCount);
  assert.deepEqual(t.getLook(), look);
  assert.deepEqual(snapshot(t), state);
  assert.equal(t.renderVisibility.active, false);
});

test('resizing cancels A/B before it can compare different drawing-buffer sizes', () => {
  const {t} = fixture();
  t.addQubit([0, 1, -2]);
  const before = snapshot(t);
  assert(t.startCullingBenchmark());
  for (let i = 0; i < 20; i++) t.frame(1000 + i * 16);
  t.canvas.clientWidth = 960;
  t.resize();
  assert.equal(t.cullingLab.benchmark, null);
  assert.equal(t.cullingLab.result, null);
  assert.equal(t.canvas.width, 960);
  assert.equal(t.getVisuals().culling, true);
  assert.deepEqual(snapshot(t), before);
});

test('frame statistics retain long stutters and restart after toggling culling or applying preferences', () => {
  const {t} = fixture();
  t.cullingLab.stats = true;
  for (const time of [1000, 1016, 1266, 1866]) t.renderScene(time);
  assert.deepEqual(Array.from(t.cullingLab.frameSamples), [16, 250, 600]);
  t.toggleCulling();
  assert.equal(t.cullingLab.frameSamples.length, 0);
  assert.equal(t.cullingLab.lastFrame, null);
  t.renderScene(2000);
  assert.equal(t.cullingLab.frameSamples.length, 0, 'the toggle does not become a frame-duration sample');
  t.renderScene(2250);
  assert.deepEqual(Array.from(t.cullingLab.frameSamples), [250]);
  t.applyPreferences({...P.defaults(), culling: false, resolution: 75});
  assert.equal(t.cullingLab.frameSamples.length, 0);
  assert.equal(t.cullingLab.lastFrame, null);
  t.renderScene(4000);
  assert.equal(t.cullingLab.frameSamples.length, 0, 'different settings start a fresh sample series');
  t.renderScene(4500);
  assert.deepEqual(Array.from(t.cullingLab.frameSamples), [500]);
});

test('offscreen shelf contents omit their miniature and label without altering stored pieces', () => {
  const {t, draws} = fixture();
  const shelf = t.createShelf({p: t.V(0, .4, -13.996), q: t.Q(), wall: 'north'});
  assert(shelf);
  const group = t.addQubit([0, .2, 0]);
  group.parts[0].mood.energy = .37;
  t.setMultiSelection([group]);
  t.setSelected({g: group, part: group.parts[0]});
  assert(t.storeShelfSelection(shelf, 0));
  const inventory = JSON.stringify(t.serializeShelves());
  const front = t.shelfCellPoint(shelf, 0, true);
  t.setLook({camera: [front.x, front.y, front.z + 2], yaw: 0, pitch: 0});
  t.beginVisibilityFrame();
  draws.length = 0;
  t.drawShelves();
  assert(draws.length > 0);
  assert.equal(shelf.labels[0].hidden, false);
  t.setLook({yaw: Math.PI});
  t.beginVisibilityFrame();
  draws.length = 0;
  t.drawShelves();
  assert.equal(draws.length, 0);
  assert.equal(shelf.labels[0].hidden, true);
  assert.equal(JSON.stringify(t.serializeShelves()), inventory);
  t.getVisuals().culling = false;
  t.beginVisibilityFrame();
  t.drawShelves();
  assert(draws.length > 0, 'turning culling off submits the hidden miniature again');
  t.renderVisibility.active = false;
});

test('an offscreen cable avoids draw calls and ribbon allocation while preserving its live connection', () => {
  const {t, draws} = fixture();
  const reservoir = t.createPowerReservoir(t.V(0, 0, 3), {enabled: true});
  const rotor = t.spawnRotor(t.V(0, 0, 5), {capacity: 256});
  assert(reservoir && rotor);
  const material = [];
  for (let i = 0; i < 3; i++) {
    const group = t.addQubit([5 + i * .14, .05, 5]);
    material.push(...t.worldParts(group));
    t.removeGroup(group);
  }
  const result = t.connectPowerCable({kind: 'reservoir', id: reservoir.id}, {kind: 'part', id: rotor.aId}, [], material);
  assert(result.ok, result.error);
  const cable = result.cable;
  cable.progress = 1;
  const network = JSON.stringify(t.serializePowerNetwork());
  t.beginVisibilityFrame();
  draws.length = 0;
  t.drawPowerCables();
  assert.equal(draws.length, 0);
  assert.equal(t.powerRibbonCaches.has(cable), false);
  assert.equal(cable.active, true);
  assert.equal(JSON.stringify(t.serializePowerNetwork()), network);
  t.getVisuals().culling = false;
  t.beginVisibilityFrame();
  t.drawPowerCables();
  assert(draws.some(draw => draw.kind === 17));
  assert.equal(t.powerRibbonCaches.has(cable), true);
  assert.equal(JSON.stringify(t.serializePowerNetwork()), network);
  t.getVisuals().culling = true;
  t.setLook({yaw: Math.PI, pitch: -.2});
  t.beginVisibilityFrame();
  draws.length = 0;
  t.drawPowerCables();
  assert(draws.some(draw => draw.kind === 17), 'the cable returns immediately after turning toward it');
  t.renderVisibility.active = false;
});
