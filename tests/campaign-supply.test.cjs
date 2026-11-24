'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const supply = require('../assets/js/campaign-supply.js');

const manifest = (count = 1) => Array.from({length:count}, (_, index) => ({
  id:index + 41, origin:'opening-reserve', weight:1, destination:'reserve'
}));
const fresh = (options = {}, count = 1) => supply.create(manifest(count), {attemptId:'opening-1', ...options});
const row = (state, id = 41) => supply.record(state, id);
const valid = state => assert.deepEqual(supply.validate(state), {ok:true});
function emit(state, requestId = 'first', id = 41, options = {}) {
  assert.equal(supply.request(state, requestId, [id], options).ok, true);
  assert.equal(supply.beginEmission(state, id).ok, true);
  assert.equal(supply.finishEmission(state, id).ok, true);
  valid(state);
}
function giveBack(state, id = 41, cause = 'voluntary') {
  assert.equal(supply.beginReturn(state, id, cause).ok, true);
  assert.equal(supply.acceptReturn(state, id).ok, true);
  valid(state);
}

test('finite supply exposes the same dependency-free module in browser and Node', () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/js/campaign-supply.js'), 'utf8'), sandbox);
  assert.deepEqual(Object.keys(sandbox.QBitsCampaignSupply), Object.keys(supply));
  const state = sandbox.QBitsCampaignSupply.create(manifest(), {attemptId:'browser'});
  assert.equal(sandbox.QBitsCampaignSupply.validate(state).ok, true);
  assert.equal(state.records[0].id, 41);
  assert.equal(state.offerSeconds, null);
});

test('manifest is finite and rejects repeated identities, impossible budgets and unaccepted destinations', () => {
  assert.throws(() => supply.create([]));
  assert.throws(() => supply.create([manifest()[0], manifest()[0]]));
  assert.throws(() => supply.create([{...manifest()[0], weight:NaN}]));
  assert.throws(() => supply.create([{...manifest()[0], origin:''}]));
  assert.throws(() => supply.create([{...manifest()[0], destination:'transit'}]));
  assert.throws(() => supply.create([{...manifest()[0], destination:'room'}]));
  assert.throws(() => fresh({maxQueue:5}));
  assert.throws(() => fresh({maxDispatches:3}));
  assert.throws(() => fresh({offerSeconds:0}));
  assert.throws(() => fresh({offerSeconds:Infinity}));
  const source = manifest(), state = supply.create(source);
  source[0].id = 999; source[0].weight = 99;
  assert.equal(row(state).weight, 1);
  assert.equal(row(state).id, 41);
  assert.equal(supply.beginEmission(state, null).ok, false);
  valid(state);
});

test('S01 reserves a protected identity immediately and never starts a timer', () => {
  const state = fresh();
  assert.equal(supply.request(state, 'S01', [41]).ok, true);
  assert.equal(row(state).claimed, true);
  assert.equal(row(state).location, 'queued');
  assert.equal(row(state).dispatches, 0);
  assert.deepEqual(state.facts, {requested:[41], taken:[], placed:[], voluntaryReturns:[], offeredReturns:[]});
  assert.equal(supply.noteTaken(state, 41).ok, false);
  assert.equal(supply.notePlaced(state, 41).ok, false);
  assert.equal(supply.beginEmission(state, 41).ok, true);
  assert.equal(row(state).dispatches, 1);
  assert.equal(supply.finishEmission(state, 41).ok, true);
  assert.deepEqual(supply.advance(state, 100000, {eligibleIds:[41]}).due, []);
  assert.equal(row(state).offerElapsed, 0);
  assert.equal(supply.beginReturn(state, 41, 'offer').ok, false);
  assert.equal(supply.noteTaken(state, 41).ok, true);
  assert.equal(supply.notePlaced(state, 41).ok, true);
  assert.deepEqual(state.facts.taken, [41]);
  assert.deepEqual(state.facts.placed, [41]);
  assert.equal(row(state).claimed, true);
  valid(state);
});

test('repeated request and emission completion cannot duplicate identity, quota or facts', () => {
  const state = fresh({}, 2);
  assert.equal(supply.request(state, 'button-1', [41]).ok, true);
  const pending = supply.snapshot(state);
  assert.deepEqual(supply.request(state, 'button-1', [41]), {ok:true, duplicate:true});
  assert.deepEqual(state, pending);
  assert.equal(supply.request(state, 'button-1', [42]).code, 'REQUEST_CONFLICT');
  assert.equal(supply.request(state, 'button-1', [41], {offered:true}).code, 'REQUEST_CONFLICT');
  assert.equal(supply.request(state, 'button-2', [42]).code, 'QUEUE_BUSY');
  assert.equal(supply.beginEmission(state, 41).ok, true);
  assert.equal(supply.beginEmission(state, 41).ok, false);
  assert.equal(supply.finishEmission(state, 41).ok, true);
  assert.equal(supply.finishEmission(state, 41).ok, false);
  assert.equal(supply.noteTaken(state, 41).ok, true);
  assert.equal(supply.noteTaken(state, 41).ok, true);
  assert.deepEqual(state.facts.taken, [41]);
  assert.equal(row(state).dispatches, 1);
  assert.deepEqual(supply.request(state, 'button-1', [41]), {ok:true, duplicate:true});
  assert.deepEqual(state.queue, []);
  valid(state);
});

test('occupied outlet keeps one bounded queue and cancellation releases only unemitted identities', () => {
  const state = fresh({}, 5);
  assert.equal(supply.request(state, 'too-large', [41, 42, 43, 44, 45]).ok, false);
  assert.equal(supply.request(state, 'lot', [41, 42, 43, 44]).ok, true);
  for (let index = 0; index < 50; index++) {
    assert.equal(supply.next(state), 41);
    supply.advance(state, 1, {eligibleIds:[]});
  }
  assert.ok(state.records.every(entry => entry.dispatches === 0));
  assert.equal(supply.beginEmission(state, 42).ok, false);
  assert.equal(supply.beginEmission(state, 41).ok, true);
  assert.equal(supply.next(state), null);
  const result = supply.cancelPending(state, 'lot');
  assert.deepEqual(result.event.ids, [42, 43, 44]);
  assert.equal(result.event.educational, false);
  assert.equal(row(state).claimed, true);
  assert.equal(row(state).location, 'emitting');
  assert.equal(row(state, 42).claimed, false);
  assert.equal(row(state, 42).location, 'reserve');
  assert.equal(row(state, 42).dispatches, 0);
  assert.deepEqual(state.facts.voluntaryReturns, []);
  assert.equal(supply.request(state, 'parallel', [45]).code, 'QUEUE_BUSY');
  valid(state);
  assert.equal(supply.finishEmission(state, 41).ok, true);
  assert.equal(supply.request(state, 'next-lot', [42, 43, 44, 45]).ok, true);
  valid(state);
});

test('S02 keeps its claim in transit and releases it only after physical acceptance', () => {
  let state = fresh(); emit(state, 'S01');
  supply.noteTaken(state, 41); supply.notePlaced(state, 41);
  assert.equal(supply.beginReturn(state, 41, 'voluntary').ok, true);
  assert.equal(row(state).location, 'returning');
  assert.equal(row(state).claimed, true);
  assert.deepEqual(state.facts.voluntaryReturns, []);
  state = supply.restore(JSON.parse(JSON.stringify(supply.snapshot(state))));
  assert.equal(row(state).claimed, true);
  assert.equal(state.transfer.cause, 'voluntary');
  const result = supply.acceptReturn(state, 41);
  assert.equal(result.event.cause, 'voluntary');
  assert.equal(row(state).location, 'reserve');
  assert.equal(row(state).claimed, false);
  assert.equal(row(state).id, 41);
  assert.equal(row(state).origin, 'opening-reserve');
  assert.equal(row(state).weight, 1);
  assert.equal(row(state).dispatches, 1);
  assert.deepEqual(state.facts.voluntaryReturns, [41]);
  assert.equal(supply.acceptReturn(state, 41).ok, false);
  valid(state);
});

test('returning a piece does not automatically requeue it or replenish dispatch allowance', () => {
  let state = fresh();
  emit(state, 'initial'); giveBack(state);
  assert.equal(supply.next(state), null);
  supply.advance(state, 1000);
  assert.deepEqual(state.queue, []);
  state = supply.restore(supply.snapshot(state));
  emit(state, 'explicit-retry'); giveBack(state);
  assert.equal(row(state).dispatches, 2);
  assert.equal(supply.request(state, 'third', [41]).code, 'DISPATCH_LIMIT');
  assert.equal(supply.request(state, 'third-offer', [41], {offered:true}).code, 'DISPATCH_LIMIT');
  assert.equal(row(state).location, 'reserve');
  assert.deepEqual(state.queue, []);
  valid(state);
});

test('technical rescue retains assignment and dispatch but grants no handling or return credit', () => {
  const state = fresh();
  supply.request(state, 'S01', [41]);
  assert.equal(supply.recover(state, 41).ok, false);
  supply.beginEmission(state, 41);
  assert.equal(supply.recover(state, 41).event.educational, false);
  assert.equal(row(state).claimed, true);
  assert.equal(row(state).location, 'room');
  assert.equal(row(state).dispatches, 1);
  assert.equal(row(state).recoveries, 1);
  assert.deepEqual(state.facts.taken, []);
  assert.deepEqual(state.facts.placed, []);
  assert.deepEqual(state.facts.voluntaryReturns, []);
  assert.equal(supply.finishEmission(state, 41).ok, false);
  supply.noteTaken(state, 41);
  supply.beginReturn(state, 41);
  supply.recover(state, 41);
  assert.equal(row(state).claimed, true);
  assert.deepEqual(state.facts.taken, [41]);
  assert.deepEqual(state.facts.placed, []);
  assert.deepEqual(state.facts.voluntaryReturns, []);
  assert.equal(supply.acceptReturn(state, 41).ok, false);
  assert.equal(supply.beginReturn(state, 41, 'technical').ok, false);
  valid(state);
});

test('snapshot restores one in-flight transaction without another emission and detaches caller data', () => {
  const state = fresh({}, 2);
  supply.request(state, 'pair', [41, 42]); supply.beginEmission(state, 41);
  const saved = supply.snapshot(state), restored = supply.restore(saved);
  assert.equal(supply.next(restored), null);
  assert.equal(row(restored).dispatches, 1);
  assert.equal(row(restored, 42).dispatches, 0);
  saved.records[0].claimed = false; saved.queue.push(41);
  assert.equal(row(restored).claimed, true);
  assert.deepEqual(restored.queue, [42]);
  assert.equal(row(state).claimed, true);
  supply.finishEmission(restored, 41);
  assert.equal(supply.next(restored), 42);
  assert.equal(row(restored).dispatches, 1);
  valid(restored);
});

test('dormant offered timer needs explicit configuration and never applies to requested pieces', () => {
  const state = fresh(); emit(state, 'offered', 41, {offered:true});
  assert.equal(row(state).claimed, false);
  assert.deepEqual(supply.advance(state, 5000, {eligibleIds:[41]}).due, []);
  assert.equal(supply.beginReturn(state, 41, 'offer').ok, false);
  assert.equal(row(state).location, 'room');
  const configured = fresh({offerSeconds:10}); emit(configured);
  assert.deepEqual(supply.advance(configured, 5000, {eligibleIds:[41]}).due, []);
  assert.equal(row(configured).offerElapsed, 0);
  valid(state); valid(configured);
});

test('later offer experiment uses eligible simulation time, resets on instability and freezes while paused', () => {
  let state = fresh({offerSeconds:10}); emit(state, 'observation', 41, {offered:true});
  supply.advance(state, 4, {eligibleIds:[41]});
  assert.equal(row(state).offerElapsed, 4);
  supply.advance(state, 3600, {paused:true, eligibleIds:[]});
  assert.equal(row(state).offerElapsed, 4);
  state = supply.restore(supply.snapshot(state));
  assert.equal(row(state).offerElapsed, 4);
  supply.advance(state, 1, {eligibleIds:[]});
  assert.equal(row(state).offerElapsed, 0);
  assert.deepEqual(supply.advance(state, 9.5, {eligibleIds:[41]}).due, []);
  assert.deepEqual(supply.advance(state, .5, {eligibleIds:[41]}).due, [41]);
  assert.equal(supply.beginReturn(state, 41, 'offer').ok, true);
  state = supply.restore(supply.snapshot(state));
  assert.equal(state.transfer.cause, 'offer');
  assert.equal(supply.acceptReturn(state, 41).event.cause, 'offer');
  assert.deepEqual(state.facts.offeredReturns, [41]);
  assert.deepEqual(state.facts.voluntaryReturns, []);
  assert.deepEqual(state.facts.taken, []);
  valid(state);
});

test('claiming an offered piece survives saves and cancels its automatic return', () => {
  let state = fresh({offerSeconds:10}); emit(state, 'observation', 41, {offered:true});
  supply.advance(state, 10, {eligibleIds:[41]}); supply.beginReturn(state, 41, 'offer');
  assert.equal(supply.noteTaken(state, 41).event.cancelledReturn, true);
  assert.equal(state.transfer, null);
  assert.equal(row(state).location, 'room');
  assert.equal(row(state).claimed, true);
  assert.equal(row(state).offered, false);
  assert.equal(row(state).offerElapsed, 0);
  state = supply.restore(supply.snapshot(state));
  supply.advance(state, 1000, {eligibleIds:[41]});
  assert.equal(row(state).claimed, true);
  assert.equal(supply.beginReturn(state, 41, 'offer').ok, false);
  assert.deepEqual(state.facts.offeredReturns, []);
  giveBack(state);
  assert.deepEqual(state.facts.voluntaryReturns, [41]);
});

test('invalid time cannot mutate a valid offer window', () => {
  const state = fresh({offerSeconds:10}); emit(state, 'observe', 41, {offered:true});
  supply.advance(state, 3, {eligibleIds:[41]});
  for (const dt of [-1, NaN, Infinity, '4']) assert.equal(supply.advance(state, dt, {eligibleIds:[41]}).ok, false);
  assert.equal(row(state).offerElapsed, 3);
  valid(state);
});

test('invalid restore rejects duplicate IDs, lost claims, contradictory locations and invented dispatches', () => {
  const state = fresh({}, 2); supply.request(state, 'pair', [41, 42]); supply.beginEmission(state, 41);
  const alterations = [
    value => { value.records[1].id = 41; },
    value => { value.queue.push(42); },
    value => { value.records[0].claimed = false; },
    value => { value.records[0].dispatches = 0; },
    value => { value.transfer = null; },
    value => { value.transfer.id = 42; },
    value => { value.requests[0].emitted.push(41); },
    value => { value.requests[0].cancelled.push(41); },
    value => { value.records[1].requestId = 'missing'; },
    value => { value.facts.placed = [41]; },
    value => { value.records[0].weight = Infinity; },
    value => { value.offerSeconds = null; value.records[0].offerElapsed = 2; },
    value => { value.extraInventories = [{id:41}]; }
  ];
  for (const alter of alterations) {
    const corrupted = supply.snapshot(state); alter(corrupted);
    assert.equal(supply.validate(corrupted).ok, false);
    assert.throws(() => supply.restore(corrupted));
  }
  valid(state);
});

test('restore rejects unsafe JSON without executing getters or custom serialization', () => {
  let calls = 0;
  const getter = supply.snapshot(fresh());
  Object.defineProperty(getter.records[0], 'weight', {enumerable:true, get() { calls++; return 1; }});
  assert.equal(supply.validate(getter).ok, false);
  assert.throws(() => supply.restore(getter));
  assert.equal(calls, 0);
  const serializer = supply.snapshot(fresh());
  serializer.toJSON = () => { calls++; return {}; };
  assert.throws(() => supply.restore(serializer));
  assert.equal(calls, 0);
  const sparse = supply.snapshot(fresh()); sparse.records.length = 2;
  assert.throws(() => supply.restore(sparse));
  const cyclic = supply.snapshot(fresh()); cyclic.cycle = cyclic;
  assert.throws(() => supply.restore(cyclic));
});

test('closure locates pending room and transit pieces instead of treating known matter as delivered', () => {
  const state = fresh(); emit(state);
  let result = supply.checkDestinations(state, [{id:41, weight:1, location:'room'}, {id:999, weight:1, location:'room'}]);
  assert.equal(result.complete, false);
  assert.equal(result.pending[0].location, 'room');
  assert.equal(result.pending[0].destination, 'reserve');
  assert.equal(result.pieces, 1);
  assert.equal(result.matter, 1);
  supply.beginReturn(state, 41);
  result = supply.checkDestinations(state, [{id:41, weight:1, location:'transit'}]);
  assert.equal(result.complete, false);
  assert.equal(result.pending[0].location, 'transit');
  supply.acceptReturn(state, 41);
  result = supply.checkDestinations(state, [{id:41, weight:1, location:'reserve'}]);
  assert.equal(result.complete, true);
  assert.equal(result.locations.reserve, 1);
  assert.equal(result.matter, 1);
  assert.deepEqual(state.facts.voluntaryReturns, [41]);
});

test('closure verifies unique actual inventory, original matter and physically accepted destinations', () => {
  const state = fresh();
  assert.equal(supply.checkDestinations(state).ok, false);
  assert.equal(supply.checkDestinations(state, []).pending[0].issue, 'missing');
  const material = {id:41, weight:1, location:'reserve', origin:'opening-reserve'};
  assert.equal(supply.checkDestinations(state, [material, material]).pending[0].issue, 'duplicate');
  assert.equal(supply.checkDestinations(state, [{...material, weight:2}]).pending[0].issue, 'matter');
  assert.equal(supply.checkDestinations(state, [{...material, origin:'other'}]).pending[0].issue, 'matter');
  supply.request(state, 'queued', [41]);
  assert.equal(supply.checkDestinations(state, [material]).pending[0].issue, 'assignment');
  supply.cancelPending(state, 'queued');
  assert.equal(supply.checkDestinations(state, [material]).complete, true);
  const accepted = supply.create([{id:8, origin:'shelf:R', weight:.5, destination:'room:accepted-platform'}]);
  assert.equal(supply.checkDestinations(accepted, [{id:8, weight:.5, location:'room'}]).complete, false);
  assert.equal(supply.checkDestinations(accepted, [{id:8, weight:.5, location:'room:accepted-platform'}]).complete, false);
  emit(accepted, 'known-platform', 8);
  const named = supply.checkDestinations(accepted, [{id:8, weight:.5, location:'room:accepted-platform'}]);
  assert.equal(named.complete, true);
  assert.equal(named.pieces, 1);
  assert.equal(named.matter, .5);
});
