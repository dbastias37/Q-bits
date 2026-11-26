'use strict';
// Isolated B reuse regressions with real game APIs, Cannon bodies and durable
// save bytes. The production/qualification fixtures prepare the inputs; these
// tests do not stand for the native A-to-80 run or its preceding transports.
const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');
const {fixture, plain, near} = require('./galpon-chain-fixture.cjs');

function materialAndEnergy(t) {
  const s = t.story.galpon;
  const parts = [
    ...t.groups.flatMap(t.worldParts),
    ...t.families.flatMap(f => f.items.flatMap(item => item.groups.flatMap(g => g.parts))),
    ...t.powerCables.flatMap(cable => cable.materials)
  ];
  const sorted = values => values.sort((a, b) => a.id - b.id);
  const actualIds = parts.map(p => p.id).sort((a, b) => a - b);
  assert.equal(new Set(actualIds).size, actualIds.length, 'each material ID has one physical custodian');
  assert.deepEqual(actualIds, Array.from(s.records, r => r.id).sort((a, b) => a - b));
  return plain({
    sourceJ: s.energyJ,
    spent: s.spent,
    extracted: s.extracted,
    ledger: sorted(Array.from(s.records, r => ({
      id: r.id, origin: r.origin, path: r.path, kind: r.kind, weight: r.weight, energy: r.energy
    }))),
    physical: sorted(parts.map(p => ({
      id: p.id, shape: p.shape, weight: p.weight, energy: p.mood.energy, matter: p.mood.matter
    })))
  });
}

function saveAndReload(t, storage) {
  const saved = t.saveCurrentGame();
  assert(saved.ok, saved.error);
  const game = createGame({graphics: false, storage});
  game.t.story.ready = true;
  assert(game.t.continueHangarGame(), game.t.saveSession.message);
  game.t.hideStoryDialogue();
  assert.doesNotThrow(() => game.sandbox.QBitsGalponProduction.validate(game.t.story.galpon));
  return game;
}

function assertOneStation(t, expected, baseBodies, wallCount) {
  const w = t.getHangarChainWorld();
  assert.deepEqual(plain(w.assembler), expected);
  assert.equal(w.assembler.id, 1, 'placing infrastructure reuses the unique station');
  assert.equal(w.stationWalls.length, expected.placed ? wallCount : 0);
  assert.equal(t.world.bodies.length, baseBodies + w.stationWalls.length);
  assert.equal(new Set(w.stationWalls.map(wall => wall.body)).size, w.stationWalls.length);
  for (const wall of w.stationWalls) {
    assert(t.world.bodies.includes(wall.body));
    assert.equal(t.storyWorld.walls.filter(other => other === wall).length, 1);
  }
  assert.equal(w.intakes.length, expected.placed ? 2 : 0);
  assert.equal(!!w.outlet, expected.placed);
}

test('an empty B assembler can move, be removed, reload and be placed again without extra infrastructure or material', () => {
  const f = fixture(), {t, w, storage} = f;
  const before = materialAndEnergy(t), baseBodies = t.world.bodies.length;
  assert(t.hangarChainPlaceAssembler(), w.message);
  const wallCount = w.stationWalls.length;
  assert(wallCount > 0);
  const originalBodies = w.stationWalls.map(wall => wall.body);

  // These are the same placement APIs used by the station's normal controls;
  // no station or material body pose is written by this test.
  assert(t.hangarChainPlaceAssembler(t.V(2, 0, 2), 1), w.message);
  assertOneStation(t, {id: 1, placed: true, p: [2, 0, 2], turns: 1}, baseBodies, wallCount);
  assert(originalBodies.every(body => !t.world.bodies.includes(body)), 'moving retires every previous collision solid');
  assert.deepEqual(materialAndEnergy(t), before);

  const movedBodies = w.stationWalls.map(wall => wall.body);
  assert(t.hangarChainRemoveAssembler(), w.message);
  assertOneStation(t, {id: 1, placed: false, p: [2, 0, 2], turns: 1}, baseBodies, wallCount);
  assert(movedBodies.every(body => !t.world.bodies.includes(body)));
  assert.deepEqual(materialAndEnergy(t), before);

  const removed = saveAndReload(t, storage), r = removed.t;
  assertOneStation(r, {id: 1, placed: false, p: [2, 0, 2], turns: 1}, baseBodies, wallCount);
  assert.deepEqual(materialAndEnergy(r), before);
  assert(r.hangarChainPlaceAssembler(r.V(2, 0, 2), 3), r.getHangarChainWorld().message);
  const placed = {id: 1, placed: true, p: [2, 0, 2], turns: 3};
  assertOneStation(r, placed, baseBodies, wallCount);

  const final = saveAndReload(r, storage);
  assertOneStation(final.t, placed, baseBodies, wallCount);
  assert.deepEqual(materialAndEnergy(final.t), before);
  assert.equal(final.t.story.galpon.chain.products.length, 0);
});

test('a B-produced rotor can leave its receipt family, keep configured settings on reload and be dismantled without losing or duplicating its credit', () => {
  const f = fixture(), {t, s, w, G, C, factory, feedRotor, credited, certify, bodySteps, storage} = f;
  credited.slice(0, 3).forEach(certify);
  assert(C.beginOrder(s));
  factory();
  const inputs = feedRotor();
  assert(t.hangarChainStartStation('assembler'), w.message);
  const beforeWorkJ = s.energyJ;
  C.tick(s, 2, {powered: {assembler: true, laser: false}, working: true});
  near(beforeWorkJ - s.energyJ, 12);
  assert(t.hangarChainFinishStation('assembler'), w.message);
  const product = s.chain.products[0], ids = Array.from(product.partIds).sort((a, b) => a - b);
  assert.deepEqual(Array.from(product.origins).sort((a, b) => a - b), inputs.origins.sort((a, b) => a - b));
  const made = t.rotors.find(rotor => ids.includes(rotor.aId) && ids.includes(rotor.bId));
  assert(made?.constraint && t.world.constraints.includes(made.constraint), 'the assembler creates a real hinge');
  bodySteps(120);
  assert(t.hangarChainReceiveProduct(product), w.message);
  assert.equal(C.status(s).total, 1);
  assert.equal(t.families.length, 1);
  const family = t.families[0];
  assert.equal(family.count, 2);
  assert.equal(family.items[0].joints.length, 1);
  const receipt = plain(s.chain.order.receivedIds), productRecord = plain(product), before = materialAndEnergy(t);

  assert(t.beginFamilyPlacement(family, 'withdraw', 1));
  const surface = {point: t.V(1.8, 0, 2), normal: t.V(0, 1, 0)};
  assert(t.updateFamilyPlacement(surface), t.getFamilyPlacement().reason);
  const withdrawn = t.confirmFamilyPlacement(surface);
  assert(withdrawn);
  assert.deepEqual(Array.from(withdrawn).flatMap(g => Array.from(g.parts, p => p.id)).sort((a, b) => a - b), ids);
  assert.equal(t.families.length, 0);
  assert(ids.every(id => G.record(s, id).place === 'world'));
  assert.deepEqual(materialAndEnergy(t), before);
  const rotor = t.rotors.find(r => ids.includes(r.aId) && ids.includes(r.bId));
  assert(rotor?.constraint && t.world.constraints.includes(rotor.constraint));
  const settings = {rpm: 37, maxTorque: 1.25, capacity: 32, direction: -1, moving: 'a', mount: 'wheel', enabled: false};
  assert(t.configureRotor(rotor, settings));
  const configured = saveAndReload(t, storage), r = configured.t, restored = r.story.galpon;
  const restoredRotor = r.rotors.find(value => ids.includes(value.aId) && ids.includes(value.bId));
  assert(restoredRotor?.constraint && r.world.constraints.includes(restoredRotor.constraint));
  for (const [key, value] of Object.entries(settings)) assert.equal(restoredRotor[key], value, key);
  assert.deepEqual(materialAndEnergy(r), before);
  assert.deepEqual(plain(restored.chain.order.receivedIds), receipt);
  assert.deepEqual(plain(restored.chain.products[0]), productRecord);

  // Dispatch the normal mechanism panel action, including its hand-operation
  // checks, rather than removing a constraint or editing the rotor array.
  r.clearRotorSelection();
  r.setMultiSelection([]);
  const selected = r.rotorPart(ids[0]);
  r.setSelected({g: selected.g, part: selected.part});
  assert.deepEqual(Array.from(r.controlRotors(), value => value.id), [restoredRotor.id]);
  const formerHinge = restoredRotor.constraint;
  configured.sandbox.document.querySelector('#rotor-disconnect').dispatchEvent({type: 'click'});
  assert.equal(r.rotorForPart(ids[0]), null);
  assert.equal(r.rotorForPart(ids[1]), null);
  assert(!r.world.constraints.includes(formerHinge));
  assert(ids.every(id => r.rotorPart(id)?.g.body.world === r.world));
  assert.deepEqual(materialAndEnergy(r), before);

  const final = saveAndReload(r, storage), state = final.t.story.galpon, chain = final.sandbox.QBitsGalponChain;
  assert.deepEqual(materialAndEnergy(final.t), before);
  assert.deepEqual(plain(state.chain.order.receivedIds), receipt);
  assert.deepEqual(plain(state.chain.products[0]), productRecord);
  assert.equal(chain.status(state).total, 1);
  assert.equal(chain.receiveRotor(state, product.id, {automatic: true}), false, 'reuse cannot credit the same product twice');
  assert.equal(final.t.hangarChainReceiveProduct(state.chain.products[0]), false);
  for (const id of ids) {
    assert.equal(final.t.rotorForPart(id), null, 'save restoration does not silently rebuild a dismantled product');
    assert.equal(final.t.rotorPart(id).part.shape, 'coupler');
    assert.equal(final.sandbox.QBitsGalponProduction.record(state, id).place, 'world');
  }
  assert.equal(chain.status(state).total, 1);
  assert.deepEqual(plain(state.chain.order.receivedIds), receipt);
});
