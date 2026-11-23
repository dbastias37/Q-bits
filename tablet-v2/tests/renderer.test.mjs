/**
 * Tablet 2.0 renderer contract tests using instrumented DOM and Canvas2D stubs.
 * These exercise the real renderer's projection, picking, scheduling and state
 * transitions. They do NOT render pixels, compile shaders, verify GPU behavior
 * or certify visual equivalence between the WebGL and Canvas2D backends.
 *
 * Intended location: tablet-v2/tests/renderer.test.mjs
 * Run there with: node --test tablet-v2/tests/renderer.test.mjs
 * Before copying, QBITS_TABLET_TEST_ROOT may point to the tablet-v2 directory.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const moduleRoot = process.env.QBITS_TABLET_TEST_ROOT
  ? pathToFileURL(`${process.env.QBITS_TABLET_TEST_ROOT.replace(/\/$/, '')}/`)
  : new URL('../', import.meta.url);
const { createMechanismRenderer } = await import(new URL('renderer.mjs', moduleRoot));
const { createInitialState } = await import(new URL('model.mjs', moduleRoot));

function harness(t, { reducedMotion = false } = {}) {
  const originals = new Map();
  const install = (key, value) => {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  };
  const scheduled = new Map(), renderers = [], observers = [];
  const paint = { fills: 0, strokes: 0, clears: 0 };
  let serial = 0;
  const context = {
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, setTransform() {},
    fill() { paint.fills++; }, stroke() { paint.strokes++; }, clearRect() { paint.clears++; }
  };
  class InstrumentedCanvas extends EventTarget {
    clientWidth = 600;
    clientHeight = 440;
    width = 0;
    height = 0;
    style = {};
    dataset = {};
    captures = new Set();
    requestedContexts = [];
    getContext(type) {
      this.requestedContexts.push(type);
      return type === '2d' ? context : null;
    }
    getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; }
    setPointerCapture(id) { this.captures.add(id); }
    hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) { this.captures.delete(id); }
  }
  class InstrumentedResizeObserver {
    disconnected = false;
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() { this.callback(); }
    disconnect() { this.disconnected = true; }
  }
  const document = Object.assign(new EventTarget(), { hidden: false });
  const media = Object.assign(new EventTarget(), { matches: reducedMotion });
  install('document', document);
  install('window', { devicePixelRatio: 1, matchMedia: () => media });
  install('ResizeObserver', InstrumentedResizeObserver);
  install('requestAnimationFrame', callback => { scheduled.set(++serial, callback); return serial; });
  install('cancelAnimationFrame', id => scheduled.delete(id));

  t.after(() => {
    // Dispose while the instrumented scheduling functions are still installed.
    for (const renderer of renderers) renderer.dispose();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return {
    scheduled, paint, observers, document, media,
    create(options = {}) {
      const canvas = new InstrumentedCanvas();
      const renderer = createMechanismRenderer(canvas, options);
      renderers.push(renderer);
      return { canvas, renderer };
    },
    frame(time) {
      const callbacks = [...scheduled.values()];
      scheduled.clear();
      for (const callback of callbacks) callback(time);
    },
    pointer(canvas, type, point) {
      const event = new Event(type);
      Object.assign(event, {
        button: 0, pointerId: 1,
        clientX: point.x, clientY: point.y, offsetX: point.x, offsetY: point.y
      });
      canvas.dispatchEvent(event);
    }
  };
}

function scene(activeIds = []) {
  const state = createInitialState();
  return {
    pieces: state.pieces.filter(piece => piece.groupId !== 'drone'),
    selectedIds: ['servo-1'], activeIds, mechanisms: state.mechanisms,
    joints: [{
      motorId: 'servo-1', pivot: [0, 2.79, 0], axis: 'y',
      drivenIds: ['arm-1', 'arm-2', 'servo-2', 'gripper-1', 'gripper-2']
    }]
  };
}

test('Canvas2D fallback projects real geometry and selects a visible piece without modifying scene data', t => {
  const h = harness(t), selected = [];
  const { canvas, renderer } = h.create({ onSelect: id => selected.push(id) });
  const input = scene(), before = JSON.stringify(input);
  renderer.setScene(input);
  h.frame(0);

  assert.deepEqual(canvas.requestedContexts, ['webgl', '2d']);
  assert.equal(canvas.dataset.renderer, 'canvas2d');
  assert.equal(renderer.getMetrics().backend, 'canvas2d');
  assert.equal(renderer.getMetrics().gpuBuffers, 0);
  assert.equal(renderer.getMetrics().physicsBodies, 0);
  assert.ok(h.paint.fills > 20, 'Visible faces must be submitted to Canvas2D.');
  assert.ok(renderer.getMetrics().pickingTriangles > 40, 'Picking must use projected geometry.');
  assert.equal(h.scheduled.size, 0, 'A stationary scene must not keep rendering.');

  const point = renderer.getProjectedPieces().find(piece => piece.id === 'cube-1');
  assert.ok(point && Number.isFinite(point.x) && Number.isFinite(point.y));
  h.pointer(canvas, 'pointerdown', point);
  h.pointer(canvas, 'pointerup', point);
  assert.deepEqual(selected, ['cube-1']);
  assert.equal(JSON.stringify(input), before, 'Rendering and picking must not mutate the game-independent state.');
});

test('hidden sections, document visibility and dispose stop scheduled rendering and release subscriptions', t => {
  const h = harness(t), selected = [];
  const { canvas, renderer } = h.create({ onSelect: id => selected.push(id) });
  const input = scene(['rotor-1']);
  renderer.setScene(input);
  h.frame(0);
  h.frame(34);
  assert.equal(h.scheduled.size, 1, 'One animation request may remain while a motor runs.');

  const beforePause = renderer.getMetrics().frames;
  renderer.setActive(false);
  assert.equal(h.scheduled.size, 0);
  h.frame(300);
  assert.equal(renderer.getMetrics().frames, beforePause, 'A hidden section must not draw.');
  renderer.setActive(true);
  assert.equal(h.scheduled.size, 1);
  h.frame(400);
  assert.equal(renderer.getMetrics().frames, beforePause + 1);

  h.document.hidden = true;
  h.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h.scheduled.size, 0, 'A background document must pause animation.');
  h.document.hidden = false;
  h.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h.scheduled.size, 1);

  const point = renderer.getProjectedPieces().find(piece => piece.id === 'cube-1');
  const beforeDispose = renderer.getMetrics().frames;
  renderer.dispose();
  assert.equal(h.scheduled.size, 0);
  assert.equal(renderer.getMetrics().scheduledFrames, 0);
  assert.equal(renderer.getMetrics().gpuBuffers, 0);
  assert.equal(renderer.getMetrics().available, false);
  assert.equal(renderer.getProjectedPieces().length, 0);
  assert.ok(h.observers.every(observer => observer.disconnected));

  renderer.setScene(input);
  renderer.setActive(true);
  h.frame(800);
  h.pointer(canvas, 'pointerdown', point);
  h.pointer(canvas, 'pointerup', point);
  assert.equal(h.scheduled.size, 0);
  assert.equal(renderer.getMetrics().frames, beforeDispose);
  assert.deepEqual(selected, [], 'Disposed pointer subscriptions must not report a selection.');
});

test('servo once settles exactly once; reduced motion reaches its target without continuous frames', async t => {
  const h = harness(t), settled = [];
  const { renderer } = h.create({ onSettled: id => settled.push(id) });
  renderer.setScene(scene(['servo-1']));
  h.frame(0);
  for (let time = 34; time < 1500 && h.scheduled.size; time += 34) {
    h.frame(time);
    await Promise.resolve();
  }
  assert.deepEqual(settled, ['servo-1']);
  assert.equal(h.scheduled.size, 0, 'An already reached target must not keep an animation loop.');
  assert.ok(renderer.getMetrics().frames > 1, 'Normal motion must progress over several frames.');
  renderer.orbit(.05, 0);
  h.frame(1600);
  await Promise.resolve();
  assert.deepEqual(settled, ['servo-1'], 'An unrelated redraw must not re-emit completion.');
  renderer.dispose();

  h.media.matches = true;
  const reducedSettled = [];
  const reduced = h.create({ onSettled: id => reducedSettled.push(id) }).renderer;
  reduced.setScene(scene(['servo-1']));
  h.frame(0);
  await Promise.resolve();
  assert.deepEqual(reducedSettled, ['servo-1']);
  assert.equal(reduced.getMetrics().frames, 1);
  assert.equal(h.scheduled.size, 0);
  assert.equal(reduced.getMetrics().animationActive, false);
});
