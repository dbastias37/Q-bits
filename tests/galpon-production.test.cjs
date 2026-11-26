const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../assets/js/galpon-production.js');
const R = require('../assets/js/campaign-reconfiguration.js');

function rawAtStock(s,id,team = 1) {
  G.tick(s,G.CONFIG.extractionSeconds);
  assert.ok(G.extract(s,id));
  assert.ok(G.take(s,id,team));
  assert.ok(G.store(s,id,team));
}

function make(s,id,kind = 'cube',team = 1) {
  rawAtStock(s,id,team);
  assert.ok(G.start(s,'converter',id,kind));
  G.tick(s,G.CONFIG.conversionSeconds);
  return G.finish(s,'converter');
}

test('one and four start with authorized whole workers and an explicit installation reserve', () => {
  for (const ids of [[1],[1,2,3,4]]) {
    const s = G.create(ids);
    assert.equal(s.energyJ,180000);
    assert.deepEqual(G.stats(s).byPlace,{source:0,carry:0,belt:0,stock:0,job:0,world:ids.length,group:0,received:0});
    assert.equal(G.workerUnits(s,ids),ids.length);
    assert.equal(G.population(s),ids.length);
    assert.deepEqual(G.restore(G.snapshot(s)),s);
  }
  assert.throws(() => G.create([2,2,3,4]));
  assert.throws(() => G.create([1,2]));
  assert.throws(() => G.create([1,2,3,4],{workerCap:3}));
});

test('a real carrier can handle one unit, deposit locally and bring another only after unloading', () => {
  const s = G.create([1]);
  G.tick(s,100,{extracting:false});
  assert.equal(G.canExtract(s),false);
  G.tick(s,G.CONFIG.extractionSeconds/2);
  const partial = G.restore(G.snapshot(s));
  assert.equal(G.canExtract(partial),false);
  G.tick(partial,G.CONFIG.extractionSeconds/2);
  assert.ok(G.extract(partial,7));
  assert.equal(G.extract(partial,8),null);
  assert.equal(G.take(partial,7,9),false);
  assert.ok(G.take(partial,7,1));
  G.tick(partial,2);
  assert.ok(G.extract(partial,8));
  assert.equal(G.take(partial,8,1),false);
  assert.equal(G.store(partial,7,99),false);
  assert.ok(G.unload(partial,7,1));
  assert.ok(G.take(partial,8,1));
  assert.ok(G.store(partial,7));
  assert.ok(G.store(partial,8,1));
  assert.equal(G.store(partial,7),false);
  assert.equal(G.stats(partial).mass,3);
  assert.equal(partial.extracted,2);
  G.validate(partial);
});

test('source and stock have independent finite capacities and a blocked delivery retains the same cargo', () => {
  const s = G.create([1]);
  for (let i=0;i<G.CONFIG.stockCapacity;i++) rawAtStock(s,10+i);
  for (let i=0;i<G.CONFIG.sourceCapacity;i++) { G.tick(s,100); assert.ok(G.extract(s,100+i)); }
  G.tick(s,400);
  assert.equal(G.canExtract(s),false);
  assert.ok(G.take(s,100,1));
  assert.equal(G.store(s,100,1),false);
  assert.equal(G.record(s,100).place,'carry');
  assert.ok(G.start(s,'converter',10,'cube'));
  assert.ok(G.store(s,100,1));
  assert.equal(s.extracted,G.CONFIG.stockCapacity+G.CONFIG.sourceCapacity);
  G.validate(s);
});

test('a paid chamber owns exactly one ID while blocked, including a saved partial job', () => {
  const s = G.create([1],{workerCap:2});
  rawAtStock(s,20);
  assert.ok(G.start(s,'converter',20,'worker'));
  const prepaid = G.CONFIG.initialEnergyJ-G.CONFIG.extractionJ-G.CONFIG.conversionJ-225;
  assert.equal(s.energyJ,prepaid);
  G.tick(s,.3);
  assert.equal(G.ready(s,'converter'),null);
  const mid = G.restore(G.snapshot(s));
  rawAtStock(mid,21);
  assert.equal(G.start(mid,'converter',21,'cube'),false);
  G.tick(mid,200);
  assert.equal(G.record(mid,20).kind,'raw');
  assert.equal(G.ready(mid,'converter').energy,.75);
  assert.equal(G.finish(mid,'converter').id,20);
  assert.equal(G.finish(mid,'converter'),null);
  assert.equal(G.start(mid,'converter',21,'worker'),false);
  assert.equal(G.population(mid),2);
  assert.equal(mid.energyJ,prepaid-G.CONFIG.extractionJ);
  G.validate(mid);
});

test('the shaper preserves one physical unit, identity and actual remaining charge; the operation is paid separately', () => {
  const s = G.create([1]), p = make(s,2);
  assert.equal(p.energy,.05);
  assert.equal(G.start(s,'former',2,'coupler'),false);
  G.tick(s,10);
  assert.ok(G.syncEnergy(s,2,.032));
  const before = s.energyJ;
  assert.ok(G.start(s,'former',2,'coupler'));
  assert.equal(G.available(s,'cube').length,0);
  G.tick(s,200);
  assert.equal(G.record(s,2).place,'job');
  assert.equal(G.ready(s,'former').kind,'coupler');
  const out = G.finish(s,'former');
  assert.equal(out.id,out.origin);
  assert.equal(out.weight,1);
  assert.equal(out.energy,.032);
  assert.equal(before-s.energyJ,G.CONFIG.formingJ);
  assert.equal(out.heat,1);
  G.validate(s);
});

test('cooling and family custody use the same physical cube; passive cooling enables construction, active cooling qualifies an ordered delivery', () => {
  const s = G.create([1]), p = make(s,2);
  G.tick(s,7);
  assert.ok(G.manipulable(p));
  assert.equal(G.stabilized(p),false);
  assert.equal(G.receive(s,[2],'pedido-1'),false);
  assert.ok(G.markGrouped(s,[2],'armado'));
  const before = s.energyJ;
  G.tick(s,30,{activeCoolingIds:[2]});
  assert.equal(p.activeSeconds,0);
  assert.equal(s.energyJ,before);
  assert.ok(G.markReleased(s,[2],'armado'));
  G.tick(s,.25,{activeCoolingIds:[2,2]});
  assert.equal(G.receive(s,[2],'pedido-1'),false);
  G.tick(s,.25,{activeCoolingIds:[2]});
  assert.ok(G.stabilized(p));
  assert.ok(G.receive(s,[2],'pedido-1'));
  assert.equal(s.received,1);
  assert.ok(G.moveFamily(s,[2],'pedido-1','pedido-2'));
  assert.ok(G.markReleased(s,[2],'pedido-2'));
  assert.ok(G.receive(s,[2],'pedido-3'));
  assert.equal(s.received,1);
  G.validate(G.restore(G.snapshot(s)));
});

test('combining crew keeps population slots and dividing a worker cannot multiply hauling capacity or charge', () => {
  const s = G.create([1,2,3,4],{workerCap:4});
  assert.ok(G.markGrouped(s,[1,2],'cinta'));
  assert.equal(G.population(s),4);
  assert.equal(G.workerUnits(s,[1,2,3,4]),2);
  assert.equal(G.markReleased(s,[1,3],'cinta'),false);
  assert.ok(G.markReleased(s,[1],'cinta'));
  const cube = R.identify({id:1,shape:'cube',weight:1,mood:{name:'Uno',energy:.6}});
  const pieces = R.plan('divide',[cube]).outputs.map((part,i) => ({...part,id:30+i}));
  assert.ok(G.reconfigure(s,'divide',[cube],pieces));
  const ids = pieces.map(p => p.id);
  assert.ok(Math.abs(G.workerUnits(s,ids)-1)<1e-8);
  assert.equal(G.population(s),4);
  G.tick(s,2);
  G.extract(s,50);
  assert.equal(G.take(s,50,ids.slice(1)),false);
  assert.ok(G.take(s,50,ids));
  assert.ok(G.store(s,50,ids));
  const restored = G.restore(G.snapshot(s));
  const recombined = {...R.plan('cube',pieces).outputs[0],id:1};
  assert.ok(G.reconfigure(restored,'cube',pieces,[recombined]));
  assert.equal(G.record(restored,1).kind,'worker');
  assert.ok(Math.abs(G.record(restored,1).energy-.6)<1e-8);
  G.validate(restored);
});

test('restore rejects invented conversions, energy, unpaid receipts and overlapping ownership', () => {
  const s = G.create([1]);
  rawAtStock(s,2);
  for (const mutate of [
    t => {t.energyJ+=1;},
    t => {t.received=10;},
    t => {t.records.push({...t.records[0]});},
    t => {t.records[1].place='job';},
    t => {t.records[1].kind='cube';t.records[1].place='world';},
    t => {t.records[1].weight=0;}
  ]) {
    const corrupt = G.snapshot(s);
    mutate(corrupt);
    assert.throws(() => G.restore(corrupt));
  }
});

test('energy exhaustion pauses conversion and active refrigeration without spending the input', () => {
  const s = G.create([1]), p = make(s,2);
  rawAtStock(s,3);
  assert.ok(G.spend(s,s.energyJ,'transport'));
  assert.equal(G.start(s,'converter',3,'worker'),false);
  assert.equal(G.record(s,3).place,'stock');
  G.tick(s,60,{activeCoolingIds:[2]});
  assert.equal(p.activeSeconds,0);
  assert.equal(s.energyJ,0);
  assert.equal(G.receive(s,[2],'f'),false);
  G.validate(s);
});

test('eight real-material recipes and the twelve-unit order require distinct origins and paid production', () => {
  const s = G.create([1,2,3,4]);
  let serial = 10;
  for (let section=1;section<=8;section++) {
    const ids = [];
    for (let slot=0;slot<30;slot++) {
      const id = serial++;
      make(s,id);
      G.tick(s,7);
      if (slot>=18) {
        assert.ok(G.start(s,'former',id,'coupler'));
        G.tick(s,G.CONFIG.formingSeconds);
        assert.ok(G.finish(s,'former'));
        G.tick(s,7);
      }
      ids.push(id);
    }
    assert.ok(G.markGrouped(s,ids,'belt-'+section));
    assert.ok(G.spend(s,60,'assembly'));
  }
  assert.equal(G.stats(s).byPlace.group,240);
  for (let i=0;i<12;i++) {
    const id = serial++;
    make(s,id);
    G.tick(s,1.2,{activeCoolingIds:[id]});
    assert.ok(G.receive(s,[id],'family:1'));
  }
  assert.equal(s.extracted,252);
  assert.equal(s.received,12);
  assert.equal(s.spent.extraction+s.spent.conversion+s.spent.charge+s.spent.forming+s.spent.assembly,6408);
  const extra = serial++;
  make(s,extra);
  G.tick(s,1.2,{activeCoolingIds:[extra]});
  assert.equal(G.receive(s,[extra],'family:1'),false);
  assert.equal(G.record(s,extra).place,'world');
  assert.equal(G.stats(s).mass,257);
  G.validate(s);
});
