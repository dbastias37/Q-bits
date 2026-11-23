import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createInitialState, createStore, getSelection, getCapabilities, PARAMS, serializeDemo, restoreDemo, STORAGE_KEY } from '../model.mjs';
const require = createRequire(import.meta.url);
const flight = require('../../assets/js/propeller-power.js');
const rotor = require('../../assets/js/rotor-power.js');
const select = (store, id, additive = false) => store.dispatch({ type: 'SELECT', id, additive });
const param = (store, key, value, id) => store.dispatch({ type: 'SET_PARAM', key, value, id });
const plainRoute = state => ({ loop: state.route.loop, points: state.route.points.map(({ id, ...point }) => point) });

test('banco parameter limits match original rotor module; presets remain within each type', () => {
  for (const [demo, game] of [['speed', 'rpm'], ['torque', 'maxTorque'], ['capacity', 'capacity']]) {
    assert.deepEqual([PARAMS.rotor[demo].min, PARAMS.rotor[demo].max], rotor.LIMITS[game]);
  }
  for (const type of ['rotor', 'servo', 'drone']) for (const spec of Object.values(PARAMS[type])) for (const value of Object.values(spec.presets)) assert.ok(value >= spec.min && value <= spec.max);
  assert.notEqual(PARAMS.rotor.speed.presets.normal, PARAMS.servo.speed.presets.normal);
  assert.equal(createInitialState().mechanisms['rotor-1'].capacity, 256, 'banco default is not the module fallback 128');
});

test('initial scene and modified route satisfy the actual original flight validator', () => {
  const store = createStore();
  assert.equal(flight.validConfig({ height: .5, speed: .5, heading: 0, route: plainRoute(store.getState()) }), true);
  assert.equal(store.dispatch({ type: 'ROUTE_ADD', point: { x: 28, z: -28, height: 3, action: 'land', wait: 120 } }).ok, true);
  assert.equal(flight.validConfig({ height: .5, speed: .5, heading: 0, route: plainRoute(store.getState()) }), true);
  assert.equal(store.dispatch({ type: 'ROUTE_ADD', point: { x: 28.001 } }).ok, false);
  assert.equal(store.dispatch({ type: 'ROUTE_UPDATE', id: 'point-1', patch: { height: .149 } }).ok, false);
});

test('selection supports separate piece, whole mechanism, additive and clear', () => {
  const store = createStore();
  assert.deepEqual(getSelection(store.getState()).map(p => p.id), ['servo-1']);
  assert.equal(store.dispatch({ type: 'SET_SELECTION_MODE', mode: 'assembly' }).ok, true);
  assert.ok(getSelection(store.getState()).length > 10);
  assert.ok(!getSelection(store.getState()).some(p => ['cube-1', 'drone-1'].includes(p.id)));
  store.dispatch({ type: 'SET_SELECTION_MODE', mode: 'piece' });
  select(store, 'cube-1'); select(store, 'base-1', true);
  assert.equal(getSelection(store.getState()).length, 2);
  select(store, 'base-1', true); assert.deepEqual(store.getState().selectedIds, ['cube-1']);
  store.dispatch({ type: 'CLEAR_SELECTION' }); assert.equal(getCapabilities(store.getState()).canMove, false);
});

test('invalid actions are atomic, preserve references and do not notify subscribers', () => {
  const store = createStore(), initial = store.getState(); let calls = 0;
  const unsubscribe = store.subscribe(() => calls++);
  assert.equal(param(store, 'speed', 541).ok, false);
  assert.equal(store.dispatch({ type: 'SELECT', id: 'missing' }).ok, false);
  assert.equal(store.getState(), initial); assert.equal(calls, 0);
  param(store, 'speed', 90); assert.equal(calls, 1);
  unsubscribe(); param(store, 'speed', 45); assert.equal(calls, 1);
});

test('simple and precise controls preserve force↔torque mapping and independent capacity', () => {
  const store = createStore(); select(store, 'rotor-1');
  store.dispatch({ type: 'SET_PRESET', key: 'force', preset: 'strong' });
  assert.equal(store.getState().mechanisms['rotor-1'].torque, 8);
  assert.equal(store.getState().mechanisms['rotor-1'].force, 800);
  assert.equal(store.getState().mechanisms['rotor-1'].capacity, 256);
  param(store, 'torque', 2.345);
  assert.equal(store.getState().mechanisms['rotor-1'].torque, 2.345);
  assert.equal(store.getState().mechanisms['rotor-1'].force, 234.50000000000003);
  assert.equal(param(store, 'force', 3201).ok, false);
  assert.equal(param(store, 'capacity', 16000).ok, true);
  assert.equal(param(store, 'capacity', 16001).ok, false);
});

test('servo min/max/target invariants are not silently clamped or reset', () => {
  const store = createStore();
  assert.deepEqual([store.getState().mechanisms['servo-1'].min, store.getState().mechanisms['servo-1'].max], [-60, 60]);
  assert.equal(param(store, 'max', 20).ok, false, 'target30 would exceed max20');
  assert.equal(param(store, 'target', 10).ok, true);
  assert.equal(param(store, 'max', 20).ok, true);
  assert.equal(param(store, 'min', 20).ok, false, 'minimum must be strictly less than maximum');
  assert.equal(param(store, 'mode', 'repeat').ok, true);
  assert.equal(param(store, 'speed', 4.9).ok, false);
  assert.equal(param(store, 'speed', 540).ok, true);
});

test('running motors lock edits/reversal; stop and restart produce distinct states', () => {
  const store = createStore();
  assert.equal(store.dispatch({ type: 'MECHANISM', command: 'start' }).ok, true);
  assert.equal(getCapabilities(store.getState()).canAdjust, false);
  assert.equal(param(store, 'speed', 60).ok, false);
  assert.equal(store.dispatch({ type: 'MECHANISM', command: 'reverse' }).ok, false);
  store.dispatch({ type: 'MECHANISM', command: 'stop' });
  assert.equal(getCapabilities(store.getState()).canAdjust, true);
  store.dispatch({ type: 'MECHANISM', command: 'reverse' });
  assert.equal(store.getState().mechanisms['servo-1'].direction, -1);
  store.dispatch({ type: 'MECHANISM', command: 'restart' });
  assert.equal(store.getState().mechanisms['servo-1'].status, 'running');
  assert.equal(store.getState().mechanisms['servo-1'].restartSerial, 1);
});

test('mixed mechanism preset changes use each original type and are all-or-nothing', () => {
  const store = createStore(); select(store, 'rotor-1'); select(store, 'servo-1', true);
  store.dispatch({ type: 'SET_PRESET', key: 'speed', preset: 'fast' });
  assert.equal(store.getState().mechanisms['rotor-1'].speed, 90);
  assert.equal(store.getState().mechanisms['servo-1'].speed, 135);
  const before = store.getState();
  assert.equal(param(store, 'speed', 400).ok, false, 'servo permits400 but rotor does not');
  assert.equal(store.getState(), before);
});

test('families conserve identities, mechanism settings and battery charge on roundtrip', () => {
  const store = createStore();
  store.dispatch({ type: 'SET_SELECTION_MODE', mode: 'assembly' });
  const before = getSelection(store.getState());
  const motorBefore = store.getState().mechanisms['servo-1'];
  assert.equal(store.dispatch({ type: 'GROUP', name: 'Mi mecanismo' }).ok, true);
  assert.equal(getSelection(store.getState())[0].type, 'family');
  assert.equal(store.getState().mechanisms['servo-1'], undefined);
  assert.equal(store.getState().families[0].pieces.length, before.length);
  assert.equal(getCapabilities(store.getState()).canUngroup, true);
  store.dispatch({ type: 'UNGROUP' });
  assert.deepEqual(getSelection(store.getState()), before);
  assert.deepEqual(store.getState().mechanisms['servo-1'], motorBefore);
  assert.equal(store.getState().pieces.find(p => p.id === 'battery-1').charge, 1);
});

test('moving a family moves recovered pieces without duplicating inventory', () => {
  const store = createStore(); select(store, 'base-1'); select(store, 'base-2', true);
  const before = getSelection(store.getState());
  store.dispatch({ type: 'GROUP' }); store.dispatch({ type: 'MOVE', delta: [3, 0, -2] }); store.dispatch({ type: 'UNGROUP' });
  const after = getSelection(store.getState());
  assert.equal(after.length, before.length);
  for (let i = 0; i < after.length; i++) assert.deepEqual(after[i].position, [before[i].position[0] + 3, before[i].position[1], before[i].position[2] - 2]);
});

test('duplicate creates new identities and copies batteries empty, preserving originals', () => {
  const store = createStore(); store.dispatch({ type: 'SET_SELECTION_MODE', mode: 'assembly' });
  const ids = new Set(getSelection(store.getState()).map(p => p.id));
  assert.equal(store.dispatch({ type: 'DUPLICATE' }).ok, true);
  const copies = getSelection(store.getState());
  assert.ok(copies.every(p => !ids.has(p.id)));
  assert.equal(copies.find(p => p.type === 'battery').charge, 0);
  assert.equal(store.getState().pieces.find(p => p.id === 'battery-1').charge, 1);
  assert.equal(new Set(store.getState().pieces.map(p => p.id)).size, store.getState().pieces.length);
});

test('blueprint confirmation changes only selected pose and cancellation preserves pose', () => {
  const store = createStore(); select(store, 'cube-1');
  const before = getSelection(store.getState())[0].position;
  store.dispatch({ type: 'SET_TOOL', tool: 'blueprint' }); store.dispatch({ type: 'CANCEL_BLUEPRINT' });
  assert.deepEqual(getSelection(store.getState())[0].position, before);
  store.dispatch({ type: 'SET_TOOL', tool: 'blueprint' }); store.dispatch({ type: 'PLACE_BLUEPRINT' });
  assert.deepEqual(getSelection(store.getState())[0].position, [before[0] + 1.2, before[1], before[2] + .6]);
  assert.equal(store.getState().blueprint, null);
});

test('route editing preserves point order, stable identities and locks during preview', () => {
  const store = createStore(); const original = store.getState().route.points.map(p => p.id);
  assert.equal(store.dispatch({ type: 'ROUTE_ADD' }).ok, true);
  assert.equal(new Set(store.getState().route.points.map(p => p.id)).size, 4);
  store.dispatch({ type: 'ROUTE_UPDATE', id: original[1], patch: { x: 2.25, action: 'wait', wait: 5 } });
  assert.deepEqual(store.getState().route.points.slice(0, 3).map(p => p.id), original);
  store.dispatch({ type: 'ROUTE_DELETE', id: original[1] });
  assert.deepEqual(store.getState().route.points.slice(0, 2).map(p => p.id), [original[0], original[2]]);
  store.dispatch({ type: 'ROUTE_RUN' });
  assert.equal(store.dispatch({ type: 'ROUTE_ADD' }).ok, false);
  assert.equal(store.dispatch({ type: 'ROUTE_UPDATE', id: original[0], patch: { x: 0 } }).ok, false);
  store.dispatch({ type: 'ROUTE_STOP' }); assert.equal(store.dispatch({ type: 'ROUTE_ADD' }).ok, true);
  assert.equal(store.dispatch({ type: 'ROUTE_REORDER', from: 0, to: 1 }).ok, false);
});

test('the original 48-point route limit and empty-route behavior are retained', () => {
  const store = createStore();
  for (let i = 3; i < 48; i++) assert.equal(store.dispatch({ type: 'ROUTE_ADD', point: { x: 0, z: 0 } }).ok, true);
  assert.equal(store.dispatch({ type: 'ROUTE_ADD' }).ok, false);
  assert.equal(store.getState().route.points.length, flight.maxPoints);
  for (const p of [...store.getState().route.points]) store.dispatch({ type: 'ROUTE_DELETE', id: p.id });
  assert.equal(store.getState().route.selectedPointId, null);
  assert.equal(store.dispatch({ type: 'ROUTE_RUN' }).ok, false);
});

test('save roundtrip preserves all capabilities but recovers stopped, with no pending placement', () => {
  const store = createStore(); param(store, 'target', -20); store.dispatch({ type: 'MECHANISM', command: 'start' }); store.dispatch({ type: 'ROUTE_RUN' });
  const restored = restoreDemo(serializeDemo(store.getState()));
  assert.equal(restored.mechanisms['servo-1'].target, -20);
  assert.equal(restored.mechanisms['servo-1'].status, 'stopped');
  assert.equal(restored.route.status, 'stopped');
  assert.deepEqual(restored.pieces, store.getState().pieces);
  assert.deepEqual(restored.route.points, store.getState().route.points);
  assert.ok(STORAGE_KEY.startsWith('qbits.tablet-v2.'));
  assert.throws(() => restoreDemo('{invalid'));
  assert.throws(() => restoreDemo(JSON.stringify({ format: 'qbits-game', version: 1, state: restored })));
});

test('corrupt saved parameters, duplicate inventory IDs and duplicate point IDs are rejected', () => {
  const store = createStore(); store.dispatch({ type: 'SET_SELECTION_MODE', mode: 'assembly' }); store.dispatch({ type: 'GROUP' });
  const good = JSON.parse(serializeDemo(store.getState()));
  const badParam = structuredClone(good); badParam.state.families[0].mechanisms['servo-1'].speed = 900;
  assert.throws(() => restoreDemo(badParam));
  const badRoute = structuredClone(good); badRoute.state.route.points[1].id = badRoute.state.route.points[0].id;
  assert.throws(() => restoreDemo(badRoute));
  const badFamily = structuredClone(good); badFamily.state.families[0].pieces[1].id = badFamily.state.families[0].pieces[0].id;
  assert.throws(() => restoreDemo(badFamily));
  assert.equal(createStore(restoreDemo(good)).dispatch({ type: 'UNGROUP' }).ok, true);
});

test('battery switch preserves its charge and family color accepts black without recoloring inventory', () => {
  const store = createStore(); select(store, 'battery-1');
  assert.equal(getCapabilities(store.getState()).canBatteryControl, true);
  assert.equal(store.dispatch({ type: 'SET_BATTERY', enabled: false }).ok, true);
  assert.equal(getSelection(store.getState())[0].enabled, false);
  assert.equal(getSelection(store.getState())[0].charge, 1);
  assert.equal(store.dispatch({ type: 'SET_BATTERY', enabled: true, id: 'cube-1' }).ok, false);
  select(store, 'base-1'); select(store, 'base-2', true); store.dispatch({ type: 'GROUP' });
  const inventory = store.getState().families[0].pieces;
  assert.equal(getCapabilities(store.getState()).canFamilyColor, true);
  assert.equal(store.dispatch({ type: 'FAMILY_COLOR', color: '#000000' }).ok, true);
  assert.equal(getSelection(store.getState())[0].color, '#000000');
  assert.deepEqual(store.getState().families[0].pieces, inventory);
  assert.equal(store.dispatch({ type: 'FAMILY_COLOR', color: 'red;display:none' }).ok, false);
  const loaded = restoreDemo(serializeDemo(store.getState()));
  assert.equal(loaded.pieces.find(p => p.type === 'family').color, '#000000');
  assert.equal(loaded.pieces.find(p => p.id === 'battery-1').enabled, false);
});

test('blueprint movement is transactional and serialization discards the pending guide', () => {
  const store = createStore(); select(store, 'cube-1');
  const before = store.getState().pieces;
  store.dispatch({ type: 'SET_TOOL', tool: 'blueprint' });
  assert.equal(store.dispatch({ type: 'BLUEPRINT_MOVE', delta: [0, .6, -1.2] }).ok, true);
  assert.deepEqual(store.getState().pieces, before);
  assert.deepEqual(store.getState().blueprint.offset, [1.2, .6, -.6]);
  const loaded = restoreDemo(serializeDemo(store.getState()));
  assert.equal(loaded.blueprint, null); assert.equal(loaded.tool, 'select'); assert.deepEqual(loaded.pieces, before);
  store.dispatch({ type: 'CANCEL_BLUEPRINT' }); assert.deepEqual(store.getState().pieces, before);
  store.dispatch({ type: 'SET_TOOL', tool: 'blueprint' });
  store.dispatch({ type: 'BLUEPRINT_MOVE', delta: [0, .6, -1.2] }); store.dispatch({ type: 'PLACE_BLUEPRINT' });
  const p = before.find(p => p.id === 'cube-1');
  assert.deepEqual(getSelection(store.getState())[0].position, [p.position[0] + 1.2, p.position[1] + .6, p.position[2] - .6]);
  assert.equal(store.dispatch({ type: 'BLUEPRINT_MOVE', delta: [1, 0, 0] }).ok, false);
});

test('restart preserves precise settings; zero route speed explains the original automatic fallback', () => {
  const store = createStore(); param(store, 'speed', 86.5); param(store, 'torque', 4.7); param(store, 'target', -20); param(store, 'mode', 'repeat');
  store.dispatch({ type: 'MECHANISM', command: 'reverse' });
  const before = store.getState().mechanisms['servo-1'];
  store.dispatch({ type: 'MECHANISM', command: 'restart' });
  assert.deepEqual(store.getState().mechanisms['servo-1'], { ...before, status: 'running', restartSerial: before.restartSerial + 1 });
  assert.equal(store.dispatch({ type: 'ROUTE_SPEED', value: 0 }).ok, true);
  assert.equal(store.dispatch({ type: 'ROUTE_RUN' }).ok, true);
  assert.equal(store.getState().route.speed, 0, 'zero is not silently rewritten');
  assert.match(store.getState().notice, /automática.*0,5 m\/s/);
});

test('total import and duplicate limits include stored family inventories', () => {
  const state = createInitialState(), source = state.pieces.find(p => p.id === 'cube-1');
  state.pieces = []; state.families = []; state.mechanisms = {}; state.selectedIds = [];
  state.route.points = []; state.route.selectedPointId = null;
  for (let f = 0; f < 5; f++) {
    const id = `container-${f}`;
    state.pieces.push({ ...structuredClone(source), id, type: 'family', groupId: id, count: 99 });
    state.families.push({ id, origin: [0, 0, 0], mechanisms: {}, pieces: Array.from({ length: 99 }, (_, i) => ({ ...structuredClone(source), id: `inventory-${f}-${i}` })) });
  }
  state.selectedIds = ['container-0'];
  const envelope = JSON.parse(serializeDemo(state));
  assert.equal(restoreDemo(envelope).families.length, 5, 'exact total500 accepted');
  const tooMany = structuredClone(envelope); tooMany.state.pieces.push({ ...structuredClone(source), id: 'overflow-piece' });
  assert.throws(() => restoreDemo(tooMany));
  const store = createStore(state); store.dispatch({ type: 'UNGROUP' });
  assert.equal(store.dispatch({ type: 'DUPLICATE' }).ok, false, 'remaining inventories count toward preview limit');
});

test('invalid tools, guide references, counters and inherited mechanism IDs are rejected', () => {
  const good = JSON.parse(serializeDemo(createInitialState()));
  for (const [key, value] of [['serial', Number.MAX_SAFE_INTEGER], ['revision', -1], ['tool', 'inject']]) {
    const bad = structuredClone(good); bad.state[key] = value; assert.throws(() => restoreDemo(bad));
  }
  const badGuide = structuredClone(good); badGuide.state.tool = 'blueprint'; badGuide.state.blueprint = { ids: ['missing'], offset: [0, 0, 0], rotation: 0 };
  assert.throws(() => restoreDemo(badGuide));
  const badId = structuredClone(good); badId.state.pieces[0].id = 'constructor'; assert.throws(() => restoreDemo(badId));
  const store = createStore();
  assert.equal(store.dispatch({ type: 'MECHANISM', id: '__proto__', command: 'start' }).ok, false);
  assert.equal(Object.prototype.status, undefined);
  const high = createInitialState(); high.serial = 1000000000; high.revision = 1000000000;
  const highStore = createStore(high); highStore.dispatch({ type: 'ROUTE_ADD' });
  assert.ok(highStore.getState().serial <= 1000000000); assert.equal(highStore.getState().revision, 0);
  assert.doesNotThrow(() => serializeDemo(highStore.getState()));
});

test('servo inversion reverses its one-shot target with the original limit clamp', () => {
  const store = createStore(); param(store, 'min', -10); param(store, 'max', 50); param(store, 'target', 40);
  store.dispatch({ type: 'MECHANISM', command: 'reverse' });
  assert.equal(store.getState().mechanisms['servo-1'].direction, -1);
  assert.equal(store.getState().mechanisms['servo-1'].target, -10, 'clamp(-40,-10,50), matching servo-panel invert');
  store.dispatch({ type: 'MECHANISM', command: 'reverse' });
  assert.equal(store.getState().mechanisms['servo-1'].target, 10);
  select(store, 'rotor-1'); const rotorBefore = store.getState().mechanisms['rotor-1'];
  store.dispatch({ type: 'MECHANISM', command: 'reverse' });
  assert.deepEqual(store.getState().mechanisms['rotor-1'], { ...rotorBefore, direction: -1 });
});

test('import rejects HTML-bearing family counts and prototype-shaped rendering profiles', () => {
  const store = createStore(); select(store, 'base-1'); select(store, 'base-2', true); store.dispatch({ type: 'GROUP' });
  const envelope = JSON.parse(serializeDemo(store.getState()));
  for (const count of ['<img src=x onerror=alert(1)>', 0, 101, 3]) {
    const bad = structuredClone(envelope); bad.state.pieces.find(p => p.type === 'family').count = count;
    assert.throws(() => restoreDemo(bad));
  }
  const malformed = structuredClone(envelope); malformed.state.pieces.find(p => p.type === 'servo').shape = '__proto__';
  assert.throws(() => restoreDemo(malformed));
  const named = structuredClone(envelope); named.state.name = '<img src=x onerror=alert(1)>';
  assert.equal(restoreDemo(named).name, named.state.name, 'names remain text; UI is responsible for HTML escaping');
});

test('imports reject missing controllers and mismatched route ownership instead of dropping capabilities', () => {
  const good = JSON.parse(serializeDemo(createInitialState()));
  const missing = structuredClone(good); delete missing.state.mechanisms['servo-1'];
  assert.throws(() => restoreDemo(missing));
  const wrongOwner = structuredClone(good); wrongOwner.state.route.ownerId = 'cube-1';
  assert.throws(() => restoreDemo(wrongOwner));
  const store = createStore(); select(store, 'drone-1');
  assert.equal(store.dispatch({ type: 'DELETE' }).ok, true);
  assert.equal(getCapabilities(store.getState()).canEditRoute, false);
  assert.equal(store.dispatch({ type: 'ROUTE_RUN' }).ok, false);
  assert.doesNotThrow(() => restoreDemo(serializeDemo(store.getState())), 'deleting the drone leaves a valid empty route');
});
