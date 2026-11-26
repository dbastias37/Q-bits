const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8, a+' != '+b);

function boot(workers = 1) {
  const game = createGame(), {t,sandbox} = game;
  t.beginHangarGame({workers});
  t.story.ready = true;
  sandbox.document.body.dataset.booting = 'false';
  sandbox.document.pointerLockElement = t.canvas;
  t.hideStoryDialogue();
  return game;
}

test('physical opening batteries match the one-time grant; idle mood and free test recharge cannot add energy', () => {
  for (const count of [1,4]) {
    const {t,sandbox} = boot(count), s = t.story.galpon;
    assert.equal(s.records.length,count);
    assert.equal(t.groups.length,count);
    for (const g of t.groups) {
      const p = g.parts[0];
      near(t.gameBatteryCapacity(p),300);
      near(p.mood.energy,1);
      near(sandbox.QBitsGalponProduction.record(s,p.id).energy,p.mood.energy);
    }
    assert.equal(s.energyJ,180000);
    const part = t.groups[0].parts[0];
    part.mood.energy = .15;
    t.updateMoods(5);
    t.rechargeExternalBatteries(5);
    near(part.mood.energy,.15);
    near(s.energyJ,180000);
  }
});

test('source service pays exactly the joules physically added to the worker and cannot pay from an empty reserve', () => {
  const {t,sandbox} = boot(), s = t.story.galpon, g = t.groups[0], p = g.parts[0];
  p.mood.energy = .1;
  g.body.position.set(-2.09,.045,.93);
  const before = s.energyJ, original = p.mood.energy;
  t.hangarProcessCrews();
  const increase = (p.mood.energy-original)*t.gameBatteryCapacity(p);
  assert.ok(increase>0);
  near(before-s.energyJ,increase);
  near(s.spent.charge,increase);
  near(s.records[0].energy,p.mood.energy);
  const after = p.mood.energy;
  sandbox.QBitsGalponProduction.spend(s,s.energyJ,'transport');
  t.hangarProcessCrews();
  near(p.mood.energy,after);
});

test('physical division and reunion preserve stored joules, lineage and the same slot through a saved partial assembly', () => {
  const {t,sandbox} = boot(), s = t.story.galpon, g = t.groups[0], id = g.parts[0].id;
  g.parts[0].mood.energy = .4;
  g.body.position.copy(t.hangarTray('former',0)); g.body.aabbNeedsUpdate = true;
  const sumEnergy = () => t.groups.reduce((sum,item) => sum+item.parts.reduce((n,p) => n+p.mood.energy*t.gameBatteryCapacity(p),0),0);
  near(sumEnergy(),120);
  assert.ok(t.hangarReconfigure('divide'));
  assert.equal(t.groups.length,6);
  near(sumEnergy(),120);
  for (const group of t.groups) near(t.gameBatteryCapacity(group.parts[0]),50);
  assert.equal(s.spent.reconfiguration,4);
  assert.equal(sandbox.QBitsGalponProduction.population(s),1);
  const saved = t.saveCurrentGame({replace:true});
  assert.ok(saved.ok,saved.error);
  assert.equal(saved.save.data.production.records.length,6);
  for (const [i,group] of t.groups.entries()) {
    group.body.position.copy(t.hangarTray('former',i));
    group.body.position.y = t.unitGroundHeight('pyramid')+.005;
    group.body.aabbNeedsUpdate = true;
  }
  assert.ok(t.hangarReconfigure('cube'));
  assert.equal(t.groups.length,1);
  assert.equal(t.groups[0].parts[0].id,id);
  near(sumEnergy(),120);
  near(s.spent.reconfiguration,8);
  near(s.energyJ,180000-8);
});
