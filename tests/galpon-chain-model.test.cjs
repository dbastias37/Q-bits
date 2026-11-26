'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../assets/js/galpon-production.js');
const C = require('../assets/js/galpon-chain.js');
const R = require('../assets/js/campaign-reconfiguration.js');

const near = (actual,expected) => assert.ok(Math.abs(actual-expected) < 1e-6,actual+' != '+expected);
function part(s,id) {
  const r = G.record(s,id);
  return {id,shape:r.kind === 'worker'?'cube':r.kind,weight:r.weight,p:{x:1,y:.1,z:1},q:{x:0,y:0,z:0,w:1},
    mood:{name:'Producto '+r.origin,energy:r.energy,blend:[1,0,0],matter:{root:r.origin,path:r.path,rootWeight:1,name:'Producto '+r.origin}}};
}
function fixture() {
  const s = G.create([1,2,3,4]);let next = 100, fragment = 1000;
  const cube = (credited = false) => {
    G.tick(s,1);const r = G.extract(s,next++);assert(r);
    assert(G.take(s,r.id,1));assert(G.store(s,r.id,1));assert(G.start(s,'converter',r.id,'cube'));
    G.tick(s,G.CONFIG.conversionSeconds);assert(G.finish(s,'converter'));G.tick(s,10);
    if (credited) {
      G.tick(s,G.CONFIG.activeSeconds,{activeCoolingIds:[r.id]});
      assert(G.receive(s,[r.id],'family:1'));assert(G.markReleased(s,[r.id],'family:1'));
    }
    return r.id;
  };
  const initial = Array.from({length:12},() => cube(true));C.ensure(s);
  const certify = id => {
    assert(C.reintroduce(s,[id]));
    assert(C.noteTransfer(s,{ids:[id],method:'arm',zone:'table',toolId:1,powered:true,kind:'wired',repeated:true}));
    assert(C.noteTransfer(s,{ids:[id],method:'drone',zone:'second-cooler',toolId:2,powered:true,returned:true}));
    C.cool(s,[id],.5,{second:true,powered:true});
    assert(C.noteTransfer(s,{ids:[id],method:'arm',zone:'feed',toolId:1,powered:true}));
    return id;
  };
  const split = id => {
    const input = part(s,id), plan = R.plan('divide',[input]);assert(!plan.error);
    const outputs = plan.outputs.map(p => ({...p,id:fragment++}));
    assert(C.prepare(s,'laser','laser',[input],outputs).ok);
    C.tick(s,C.CONFIG.laserSeconds,{powered:true,working:true});
    const result = C.commit(s,'laser');assert(result.ok);return result;
  };
  const rotor = (a = certify(cube()), b = certify(cube())) => {
    const cut = split(b), pyramids = cut.records.map(r => part(s,r.id)), whole = R.plan('cube',pyramids);
    assert(!whole.error);
    const outputs = [{...part(s,a),shape:'coupler'},{...whole.outputs[0],id:b,shape:'coupler'}];
    assert(C.prepare(s,'assembler','rotor',[part(s,a),...pyramids],outputs).ok);
    C.tick(s,C.CONFIG.rotorSeconds,{powered:true,working:true});
    const result = C.commit(s,'assembler');assert(result.ok);return result;
  };
  const open = () => {initial.slice(0,3).forEach(certify);assert(C.beginOrder(s));};
  return {s,cube,initial,certify,split,rotor,open};
}

test('an A save remains valid and entering B never repeats its material or energy grants', () => {
  const {s} = fixture(), before = G.snapshot(s);
  const restored = G.restore(before);C.ensure(restored);C.ensure(restored);
  near(G.stats(restored).mass,G.stats(s).mass);near(restored.energyJ,s.energyJ);
  assert.equal(restored.received,12);assert.deepEqual(restored.initialIds,[1,2,3,4]);
  assert.equal(C.status(restored).phase,'arm-demo');assert.equal(C.beginOrder(restored),null);
  delete before.chain;assert.doesNotThrow(() => G.restore(before));
});

test('actual automatic origin evidence gates arm, wired transfers, drone return and second cooling', () => {
  const {s,initial,certify} = fixture(), id = initial[0];
  assert.equal(C.noteTransfer(s,{ids:[id],method:'arm',zone:'table',toolId:1,powered:false}),false);
  assert(C.noteTransfer(s,{ids:[id],method:'arm',zone:'table',toolId:1,powered:true}));
  assert.equal(C.status(s).phase,'arm-power');assert.equal(C.status(s).armWired,0);
  assert.equal(C.noteTransfer(s,{ids:[id],method:'drone',zone:'second-cooler',toolId:2,powered:true}),false);
  initial.slice(0,3).forEach(certify);certify(id);
  assert.equal(C.status(s).armWired,3);assert.equal(C.status(s).droneDelivered,3);
  assert.equal(C.status(s).stabilized,3);assert.equal(C.status(s).phase,'assembler');
  assert(C.beginOrder(s));assert.equal(C.beginOrder(s).epoch,1);assert.doesNotThrow(() => G.validate(s));
});

test('the wired lesson requires repetition and three deliveries by one continuously running connected arm', () => {
  const {s,initial} = fixture();
  const deliver = (id,repeated=true,toolId=1) => C.noteTransfer(s,{ids:[id],method:'arm',zone:'table',toolId,powered:true,kind:'wired',repeated});
  assert(deliver(initial[0],false));assert.equal(C.status(s).armDemo,1);assert.equal(C.status(s).armWired,0);
  assert(deliver(initial[0]));assert(deliver(initial[1]));assert.equal(C.status(s).armWired,2);
  C.tick(s,.1,{arm:{toolId:1,running:false,repeated:true,wired:true}});assert.equal(C.status(s).armWired,0);
  assert(deliver(initial[2]));assert(deliver(initial[3]));
  C.observeArm(s,{toolId:1,running:true,repeated:true,wired:false});assert.equal(C.status(s).armWired,0);
  assert(deliver(initial[4]));assert(deliver(initial[5],true,2));assert.equal(C.status(s).armWired,1);
  assert(deliver(initial[6],true,2));assert(deliver(initial[7],true,2));assert.equal(C.status(s).armWired,3);
  C.observeArm(s,{toolId:2,running:false,repeated:false,wired:false});assert.equal(C.status(s).armWired,3);
  assert.doesNotThrow(() => G.validate(s));
});

test('manual handling survives division, grouping and save; the line can explicitly recover an input', () => {
  const {s,initial,certify,split} = fixture(), id = certify(initial[0]);
  assert(C.markManual(s,[id]));assert.equal(s.chain.traces[id].manual,true);
  const result = split(id), ids = result.records.map(r => r.id);
  assert(G.markGrouped(s,ids,'family:7'));
  const restored = G.restore(G.snapshot(s));
  assert.equal(restored.chain.traces[id].manual,true);assert.equal(restored.chain.traces[id].feed,false);
  assert.equal(C.noteTransfer(restored,{ids,method:'arm',zone:'feed',toolId:1,powered:true}),false);
  const other = initial[1];assert(C.markManual(s,[other]));assert(C.reintroduce(s,[other]));
  assert.equal(s.chain.traces[other].manual,false);assert.equal(s.chain.traces[other].second,false);
});

test('thermal processing charges every family member, retains cold inputs and conserves fractional heat', () => {
  const {s,initial,split} = fixture(), ids = initial.slice(0,3);
  assert(G.markGrouped(s,ids,'family:5'));for (const id of ids) G.record(s,id).heat = .4;
  const before = s.energyJ;assert(C.cool(s,ids,.5,{second:true,powered:true}));
  near(before-s.energyJ,6);assert(ids.every(id => G.record(s,id).heat === 0));
  const cooled = s.energyJ;C.cool(s,ids,2,{second:true,powered:true});near(s.energyJ,cooled);
  assert(G.markReleased(s,ids,'family:5'));
  const r = G.record(s,ids[0]);r.heat = .1;
  const cut = split(r.id);assert(cut.records.every(p => close(p.heat,.1) && p.secondActiveSeconds === .5));
  assert.doesNotThrow(() => G.validate(s));
  function close(a,b) {return Math.abs(a-b)<1e-7;}
});

test('a real return credits previously paid cooling after another transporter has removed the cargo', () => {
  const {s,initial} = fixture(), id = initial[0];assert(C.reintroduce(s,[id]));
  C.cool(s,[id],.5,{second:true,powered:true});assert(s.chain.traces[id].second);
  assert.equal(C.status(s).droneDelivered,0);assert.equal(C.status(s).stabilized,0);
  assert(C.noteTransfer(s,{ids:[id],method:'arm',zone:'feed',toolId:1,powered:true}));
  assert(G.markGrouped(s,[id],'family:17'));const energy=s.energyJ,paid=s.spent.cooling;
  assert(C.noteReturn(s,{origins:[id],toolId:2,powered:true,returned:true}));
  assert.equal(C.status(s).droneDelivered,1);assert.equal(C.status(s).stabilized,1);
  near(s.energyJ,energy);near(s.spent.cooling,paid);assert.equal(G.record(s,id).group,'family:17');
  assert(C.noteReturn(s,{origins:[id],toolId:2,powered:true,returned:true}));assert.equal(C.status(s).stabilized,1);
  assert.doesNotThrow(()=>G.restore(G.snapshot(s)));
});

test('return evidence follows origins through a completed cut and a saved machine reservation', () => {
  const {s,initial,split} = fixture(), [cutOrigin,reservedOrigin] = initial;
  for(const id of [cutOrigin,reservedOrigin]){assert(C.reintroduce(s,[id]));C.cool(s,[id],.5,{second:true,powered:true});}
  const cut=split(cutOrigin);assert.equal(G.record(s,cutOrigin),null);assert.equal(cut.records.length,6);
  const input=part(s,reservedOrigin),outputs=R.plan('divide',[input]).outputs.map((p,i)=>({...p,id:5000+i}));
  assert(C.prepare(s,'laser','laser',[input],outputs).ok);assert.equal(G.record(s,reservedOrigin).place,'machine');
  const restored=G.restore(G.snapshot(s)),energy=restored.energyJ,paid=restored.spent.cooling;
  assert(C.noteReturn(restored,{origins:[cutOrigin,reservedOrigin],toolId:2,powered:true,returned:true}));
  assert.equal(C.status(restored).droneDelivered,2);assert.equal(C.status(restored).stabilized,2);
  near(restored.energyJ,energy);near(restored.spent.cooling,paid);assert(C.ready(restored,'laser')===null);
  assert.doesNotThrow(()=>G.restore(G.snapshot(restored)));
  assert.equal(C.noteReturn(restored,{origins:[999999],toolId:2,powered:true,returned:true}),false);
  assert.equal(C.noteReturn(restored,{origins:[cutOrigin],toolId:2,powered:true,returned:false}),false);
  C.markManual(restored,cut.records.map(r=>r.id));
  assert.equal(C.noteReturn(restored,{origins:[cutOrigin],toolId:2,powered:true,returned:true}),false);
});

test('the optional return reserve uses a completed automatic trip and observed stored joules without granting resources', () => {
  const {s,initial}=fixture(),origin=initial[0];assert(C.reintroduce(s,[origin]));
  const event={origins:[origin],toolId:2,powered:true,returned:true,storedJ:179,capacityJ:900};
  const energy=s.energyJ,mass=G.stats(s).mass;
  assert(C.noteReturn(s,event));assert.equal(C.status(s).reserveReturn,false);
  assert.equal(C.noteReturn(s,{...event,returned:false,storedJ:800}),false);
  assert(C.noteReturn(s,{...event,storedJ:1000}));assert.equal(C.status(s).reserveReturn,false);
  assert(C.noteReturn(s,{...event,storedJ:180}));assert.equal(C.status(s).reserveReturn,true);near(C.status(s).returnReservePercent,20);
  near(s.energyJ,energy);near(G.stats(s).mass,mass);
  const saved=G.snapshot(s),restored=G.restore(saved);assert.equal(C.status(restored).reserveReturn,true);
  const invalid=structuredClone(saved);invalid.chain.opportunities.reserveReturn.storedJ=179;assert.throws(()=>G.restore(invalid));
  delete saved.chain.opportunities;const legacy=G.restore(saved);assert.equal(C.status(legacy).reserveReturn,false);near(legacy.energyJ,energy);
});

test('three optional clear receptions count unique new products, tolerate normal waits and reset an unfinished streak on a real block', () => {
  const {s,open,rotor}=fixture();open();
  const receive=()=>{const product=rotor().product;assert(C.receiveRotor(s,product.id,{automatic:true}));return product;};
  const first=receive();assert.equal(C.status(s).clearOutputs,1);
  assert.equal(C.receiveRotor(s,first.id,{automatic:true}),false);assert.equal(C.status(s).clearOutputs,1);
  C.tick(s,10,{reason:'waiting',activeCycle:true});assert.equal(C.status(s).clearOutputs,1);
  const energy=s.energyJ;C.tick(s,.1,{reason:'blocked'});assert.equal(C.status(s).clearOutputs,0);near(s.energyJ,energy);
  receive();receive();receive();assert.equal(C.status(s).clearOutputs,3);
  C.tick(s,.1,{powered:false});assert.equal(C.status(s).clearOutputs,3,'an earned optional objective stays earned');
  assert.equal(C.status(s).completed,false,'optional success cannot complete the main order');
  const saved=G.snapshot(s);assert.equal(C.status(G.restore(saved)).clearOutputs,3);
  saved.chain.opportunities.clearOutputs[0]='rotor:99999';assert.throws(()=>G.restore(saved));
});

test('a laser owns one input while processing and waiting for output, including after reload and abort', () => {
  const {s,initial} = fixture(), input = part(s,initial[0]);
  const outputs = R.plan('divide',[input]).outputs.map((p,i) => ({...p,id:3000+i}));
  assert(C.prepare(s,'laser','laser',[input],outputs).ok);
  assert.equal(G.record(s,input.id).place,'machine');assert.equal(C.commit(s,'laser').ok,false);
  C.tick(s,.6,{working:true});const mid = G.restore(G.snapshot(s)), paid = mid.energyJ;
  assert.equal(mid.chain.jobs.laser.inputIds[0],input.id);near(mid.chain.jobs.laser.paidJ,2);
  C.tick(mid,1,{powered:false});near(mid.energyJ,paid);
  C.tick(mid,1,{powered:true,working:true});assert(C.ready(mid,'laser'));
  const readyEnergy = mid.energyJ;C.tick(mid,50,{working:true});near(mid.energyJ,readyEnergy);
  const aborted = C.abort(mid,'laser');assert(aborted.ok);assert.equal(G.record(mid,input.id).place,'world');
  near(mid.energyJ,readyEnergy);assert.equal(mid.records.filter(r => r.origin === input.id).length,1);
  assert.doesNotThrow(() => G.validate(mid));
});

test('an industrial laser batch blocks another cut until its six siblings are reserved by the assembler', () => {
  const {s,initial,certify,split} = fixture(), [cutOrigin,nextOrigin,cubeOrigin] = initial.slice(0,3).map(certify);
  const cut = split(cutOrigin), ids = cut.records.map(r => r.id);
  // Five members can be in one holder while a sixth remains elsewhere. The
  // queue owns the whole origin and does not depend on a tray-contact count.
  assert(G.markGrouped(s,ids.slice(0,5),'family:19'));
  assert.deepEqual(C.laserBacklog(s).origins,[cutOrigin]);assert.equal(C.laserBacklog(s).pieces,6);
  near(C.laserBacklog(s).units,1);
  const nextInput = part(s,nextOrigin), nextOutputs = R.plan('divide',[nextInput]).outputs.map((p,i)=>({...p,id:6000+i}));
  const energy=s.energyJ,serial=s.chain.serial;
  assert.equal(C.prepare(s,'laser','laser',[nextInput],nextOutputs).ok,false);
  near(s.energyJ,energy);assert.equal(s.chain.serial,serial);assert.equal(G.record(s,nextOrigin).place,'world');
  assert(G.markReleased(s,ids.slice(0,5),'family:19'));
  const pyramids=ids.map(id=>part(s,id)),whole=R.plan('cube',pyramids).outputs[0];
  const outputs=[{...part(s,cubeOrigin),shape:'coupler'},{...whole,id:cutOrigin,shape:'coupler'}];
  assert(C.prepare(s,'assembler','rotor',[part(s,cubeOrigin),...pyramids],outputs).ok);
  assert.equal(C.laserBacklog(s).blocked,false);assert.equal(C.laserBacklog(s).pieces,0);
  const restored=G.restore(G.snapshot(s));assert.equal(C.laserBacklog(restored).blocked,false);
  assert(C.prepare(restored,'laser','laser',[nextInput],nextOutputs).ok);
  assert(C.abort(restored,'assembler').ok);assert.equal(C.laserBacklog(restored).pieces,6);
  assert.doesNotThrow(()=>G.validate(restored));
});

test('six compatible pyramids and one cube produce two existing couplers with two separate origins', () => {
  const {s,open,rotor} = fixture();open();
  const beforeMass = G.stats(s).mass, beforeEnergy = s.energyJ, result = rotor();
  assert.equal(result.records.length,2);assert(result.records.every(r => r.kind === 'coupler' && r.weight === 1));
  assert.equal(new Set(result.records.map(r => r.origin)).size,2);near(G.stats(s).mass,beforeMass+2);
  near(s.spent.forming,8);assert(beforeEnergy>s.energyJ);assert(result.product.id.startsWith('rotor:'));
  assert(C.receiveRotor(s,result.product.id,{automatic:true}));
  assert.equal(C.receiveRotor(s,result.product.id,{automatic:true}),false);
  assert.equal(C.status(s).total,1);assert.doesNotThrow(() => G.validate(s));
});

test('missing siblings, mixed origins, triangular blades, invented charge and repeated identities are rejected', () => {
  const {s,initial,split} = fixture(), a = initial[0], b = initial[1], cut = split(b), pyramids = cut.records.map(r => part(s,r.id));
  const recomposed = R.plan('cube',pyramids).outputs[0];
  const outputs = [{...part(s,a),shape:'coupler'},{...recomposed,id:b,shape:'coupler'}];
  for (const inputs of [
    [part(s,a),...pyramids.slice(1)],
    [part(s,a),...pyramids.map((p,i) => i? p : {...p,shape:'tetra'})],
    [part(s,a),...pyramids.map((p,i) => i? p : {...p,mood:{...p.mood,matter:{...p.mood.matter,root:initial[2]}}})]
  ]) assert.equal(C.prepare(s,'assembler','rotor',inputs,outputs).ok,false);
  const extraCharge = structuredClone(outputs);extraCharge[1].mood.energy+=.1;
  assert.equal(C.prepare(s,'assembler','rotor',[part(s,a),...pyramids],extraCharge).ok,false);
  const duplicate = structuredClone(outputs);duplicate[1].id=duplicate[0].id;
  assert.equal(C.prepare(s,'assembler','rotor',[part(s,a),...pyramids],duplicate).ok,false);
  assert.equal(s.chain.jobs.assembler,null);assert.doesNotThrow(() => G.validate(s));
});

test('failed physical materialization can roll back to a paid ready process without duplicating matter or energy', () => {
  const {s,rotor} = fixture(), result = rotor(), energy = s.energyJ, mass = G.stats(s).mass;
  assert(C.rollback(s,result.transaction));assert.equal(s.chain.products.length,0);assert(C.ready(s,'assembler'));
  near(s.spent.forming,0);near(s.energyJ,energy);near(G.stats(s).mass,mass);
  assert.doesNotThrow(() => G.validate(s));
  const replay = C.commit(s,'assembler');assert(replay.ok);assert.equal(replay.product.id,result.product.id);
  near(s.energyJ,energy);near(s.spent.forming,8);assert.doesNotThrow(() => G.validate(s));
  assert.equal(C.commit(s,'assembler').ok,false);
});

test('a rotor manufactured before the order, or delivered after manual interference, cannot count', () => {
  const {s,rotor,open} = fixture(), prefabricated = rotor();open();
  assert.equal(C.receiveRotor(s,prefabricated.product.id,{automatic:true}),false);
  const current = rotor();assert(C.markManual(s,current.product.partIds));
  assert.equal(C.receiveRotor(s,current.product.id,{automatic:true}),false);
  assert.equal(C.status(s).total,0);assert.doesNotThrow(() => G.validate(s));
});

test('four batches need 80 unique receptions and a live sixty-second window; faults preserve earlier deliveries', () => {
  const {s,rotor,open} = fixture();open();
  for (let i=0;i<80;i++) {
    const result = rotor();assert(C.receiveRotor(s,result.product.id,{automatic:true}));
    if (i===39) {
      assert(C.status(s).sustained);
      const energy = s.energyJ;C.tick(s,.1,{powered:false,reason:'power'});
      assert.equal(C.status(s).continuity,0);assert.equal(C.status(s).total,40);near(s.energyJ,energy);
    }
  }
  const summary = C.status(s);
  assert.equal(summary.total,80);assert.equal(summary.lot,4);assert.equal(summary.lotCount,20);
  assert.equal(summary.phase,'complete');assert.equal(summary.completed,true);
  const restored = G.restore(G.snapshot(s));assert.equal(C.status(restored).completed,true);
  const extra = rotor();assert(extra.ok);assert.equal(C.status(s).completed,true);
  near(G.stats(s).mass,4+s.extracted);assert.doesNotThrow(() => G.validate(s));
});

test('motors without new deliveries cannot complete continuity and stale deliveries reset its clock', () => {
  const {s,open,rotor} = fixture();open();
  C.tick(s,120,{working:true});assert.equal(C.status(s).continuity,0);
  const result = rotor();assert(C.receiveRotor(s,result.product.id,{automatic:true}));
  C.tick(s,10,{working:true});assert.equal(C.status(s).continuity,10);
  C.tick(s,C.CONFIG.recentDeliverySeconds+1,{working:true});assert.equal(C.status(s).continuity,0);
  assert.equal(C.status(s).total,1);assert.equal(C.status(s).completed,false);
});

for (const reason of ['power','blocked','stopped']) test('a physical '+reason+' event interrupts useful continuity without time or energy and recovers only with a new receipt', () => {
  const {s,open,rotor} = fixture();open();const first=rotor().product;
  assert(C.receiveRotor(s,first.id,{automatic:true}));C.tick(s,30,{working:true,reason:'processing'});
  assert.equal(C.status(s).continuity,30);assert.equal(C.status(s).clearOutputs,1);
  const resources=JSON.stringify({records:s.records,energyJ:s.energyJ,spent:s.spent,jobs:s.chain.jobs,products:s.chain.products,clock:s.chain.clock,elapsed:s.elapsed});
  assert(C.interrupt(s,reason));assert.equal(C.status(s).continuity,0);assert.equal(C.status(s).continuityState,reason);
  assert.equal(C.status(s).clearOutputs,0);assert.equal(C.status(s).total,1);
  assert.equal(JSON.stringify({records:s.records,energyJ:s.energyJ,spent:s.spent,jobs:s.chain.jobs,products:s.chain.products,clock:s.chain.clock,elapsed:s.elapsed}),resources);
  const interrupted=JSON.stringify(s);assert(C.interrupt(s,reason));assert.equal(JSON.stringify(s),interrupted);
  assert.equal(C.receiveRotor(s,first.id,{automatic:true}),false);C.tick(s,60,{working:true,reason:'processing'});
  assert.equal(C.status(s).continuity,0);assert.equal(C.status(s).sustained,false);
  const next=rotor().product;assert(C.receiveRotor(s,next.id,{automatic:true}));C.tick(s,60,{working:true,reason:'processing'});
  assert.equal(C.status(s).continuity,60);assert(C.status(s).sustained);assert.equal(C.status(s).total,2);
  assert.doesNotThrow(()=>G.validate(s));
});

test('an ordinary wait or an A-only state cannot acquire a safety interruption', () => {
  const {s,open,rotor}=fixture();open();assert(C.receiveRotor(s,rotor().product.id,{automatic:true}));
  C.tick(s,10,{working:true,reason:'processing'});const before=JSON.stringify(s);
  assert.equal(C.interrupt(s,'waiting'),false);assert.equal(JSON.stringify(s),before);
  const opening=G.create([1,2,3,4]),original=JSON.stringify(opening);
  assert.equal(C.interrupt(opening,'blocked'),false);assert.equal(JSON.stringify(opening),original);
});

test('the measured single-drone cadence permits useful activity and a bounded normal wait without demanding three rotors per minute', () => {
  const {s,open,rotor} = fixture();open();const product=rotor().product;assert(C.receiveRotor(s,product.id,{automatic:true}));
  C.tick(s,37.025,{working:true,activeCycle:true,reason:'transport'});
  near(C.status(s).continuity,37.025);
  C.tick(s,30,{working:false,activeCycle:true,reason:'waiting'});
  near(C.status(s).continuity,37.025);assert.equal(C.status(s).continuityState,'waiting');
  C.tick(s,15,{working:true,activeCycle:true,reason:'returning'});
  C.tick(s,7.975,{working:false,activeCycle:true,chargedJ:239.25,reason:'charging'});
  near(C.status(s).continuity,60);assert.equal(C.status(s).sustained,true);assert.equal(C.status(s).total,1);
  assert.equal(C.status(s).continuityMode,'useful-activity');assert.equal(C.status(s).deliveryWindow,240);
  assert.doesNotThrow(() => G.validate(s));
});

test('four measured serial flights and recharge fit the recent-delivery window while waiting alone cannot finish continuity', () => {
  const {s,open,rotor} = fixture();open();const first=rotor().product;assert(C.receiveRotor(s,first.id,{automatic:true}));
  for(let flight=0;flight<4;flight++)C.tick(s,49,{working:true,activeCycle:true,reason:flight%2?'returning':'transport'});
  C.tick(s,20,{working:false,activeCycle:true,chargedJ:600,reason:'charging'});
  near(C.status(s).continuity,60);assert(C.status(s).sustained);assert.equal(C.status(s).total,1);
  C.tick(s,25,{working:true,activeCycle:true,reason:'transport'});
  assert.equal(C.status(s).continuity,0);assert.equal(C.status(s).total,1);
  const second=rotor().product;assert(C.receiveRotor(s,second.id,{automatic:true}));
  C.tick(s,170,{working:false,activeCycle:true,reason:'waiting'});
  assert.equal(C.status(s).continuity,0);assert.equal(C.status(s).sustained,false);
  assert.doesNotThrow(()=>G.validate(s));
});

test('idle motors, an unrelated empty flight and a claimed recharge without transferred energy cannot earn useful seconds', () => {
  const {s,open,rotor} = fixture();open();
  let product=rotor().product;assert(C.receiveRotor(s,product.id,{automatic:true}));
  C.tick(s,60,{working:true,reason:'returning',activeCycle:false});assert.equal(C.status(s).continuity,0);
  product=rotor().product;assert(C.receiveRotor(s,product.id,{automatic:true}));
  C.tick(s,60,{working:true,reason:'charging',activeCycle:true,chargedJ:0});assert.equal(C.status(s).continuity,0);
  C.tick(s,60,{working:false,reason:'waiting',activeCycle:true});assert.equal(C.status(s).continuity,0);
  assert.equal(C.status(s).sustained,false);assert.equal(C.status(s).total,2);
  C.tick(s,61,{working:false,reason:'waiting',activeCycle:true});assert.equal(s.chain.order.continuity.lastDelivery,null);
});

test('power, obstruction and true material starvation restart only the useful-activity measurement', () => {
  const {s,open,rotor} = fixture();open();
  for(const reason of ['power','blocked','starved','stopped']) {
    const p=rotor().product;assert(C.receiveRotor(s,p.id,{automatic:true}));
    C.tick(s,20,{working:true,reason:'transport',activeCycle:true});assert.equal(C.status(s).continuity,20);
    const received=C.status(s).total,energy=s.energyJ;
    C.tick(s,.1,{working:false,reason,activeCycle:true});
    assert.equal(C.status(s).continuity,0);assert.equal(C.status(s).total,received);near(s.energyJ,energy);
  }
});

test('normal construction and moving completed rotor families do not erase a useful-activity streak', () => {
  const {s,open,rotor,cube} = fixture();open();const product=rotor().product;assert(C.receiveRotor(s,product.id,{automatic:true}));
  C.tick(s,20,{working:true,reason:'transport',activeCycle:true});
  const building=cube();assert(C.markManual(s,[building]));assert(C.markManual(s,[1]));
  assert(G.markGrouped(s,product.partIds,'family:42'));assert(C.markManual(s,product.partIds));
  assert.equal(C.status(s).continuity,20);assert.equal(C.status(s).total,1);
  const pending=rotor().product;assert(C.markManual(s,pending.partIds));assert.equal(C.status(s).continuity,0);
  assert.equal(C.status(s).total,1);assert.doesNotThrow(() => G.validate(s));
});

test('save validation rejects altered process costs, lost reservations, invented receipts and false victory', () => {
  const {s,initial} = fixture(), input = part(s,initial[0]);
  const outputs = R.plan('divide',[input]).outputs.map((p,i) => ({...p,id:4000+i}));
  assert(C.prepare(s,'laser','laser',[input],outputs).ok);C.tick(s,.4,{working:true});
  const saved = G.snapshot(s);
  for (const mutate of [
    t => {t.chain.jobs.laser.paidJ+=1;},
    t => {t.chain.jobs.laser=null;},
    t => {t.chain.completed=true;},
    t => {t.chain.jobs.laser.outputs[0].weight=1;},
    t => {t.records.find(r => r.id===input.id).place='world';}
  ]) {
    const bad = structuredClone(saved);mutate(bad);assert.throws(() => G.restore(bad));
  }
});

test('cable custody preserves the same material and survives ledger serialization without a second copy', () => {
  const {s,initial} = fixture(), ids = initial.slice(0,2), before = G.stats(s).mass;
  assert(G.reserve(s,ids,'cable:1','cable'));assert.equal(G.reserve(s,ids,'cable:2','cable'),false);
  const restored = G.restore(G.snapshot(s));assert(ids.every(id => G.record(restored,id).place==='cable'));
  assert(G.release(restored,ids,'cable:1'));near(G.stats(restored).mass,before);
  assert(ids.every(id => G.record(restored,id).place==='world'));assert.doesNotThrow(() => G.validate(restored));
});
