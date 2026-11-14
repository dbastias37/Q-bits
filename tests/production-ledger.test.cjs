const test=require('node:test');
const assert=require('node:assert/strict');
const model=require('../assets/js/campaign-production.js');
const entries=n=>Array.from({length:n},(_,i)=>({id:i+1,kind:i%2?'B':'A',weight:.5}));
const snapshot=state=>JSON.stringify(state);
function conserved(state,mass){const t=model.totals(state);assert(t);assert.equal(t.totalMass,mass);assert.equal(t.stockMass+t.looseMass+t.packedMass+t.deliveredMass,mass);return t;}

test('finite source releases each original identity once and retains exact conserved mass',()=>{
 const source=entries(3),s=model.create(source,{packages:false,target:3});source[0].kind='B';
 assert.equal(s.units[0].kind,'A');assert(Object.isFrozen(s.units[0]));
 for(let i=0;i<3;i++){const part=model.release(s);assert.equal(part.id,i+1);conserved(s,1.5);}
 assert.equal(model.release(s),null);assert.equal(s.stock.length,0);assert.deepEqual(s.released,[1,2,3]);
});

test('raw receiver enforces source order, identity, weight and exactly-once counting',()=>{
 const s=model.create(entries(3),{packages:false,target:3}),a=model.release(s),b=model.release(s),c=model.release(s);
 const before=snapshot(s);for(const wrong of [b,null,{}, {...a,id:99},{...a,kind:'B'},{...a,weight:1},{...a,shape:'pyramid'}])assert.equal(model.accept(s,wrong),false);
 assert.equal(snapshot(s),before);assert(model.accept(s,a));assert.equal(model.accept(s,a),false);assert(model.accept(s,b));assert(model.accept(s,c));
 assert.equal(model.accept(s,c),false);assert.equal(s.accepted.length,3);assert.equal(conserved(s,1.5).deliveredMass,1.5);
});

test('twelve halves become six packages with original identities and no duplicated deliveries',()=>{
 const s=model.create(entries(12),{packages:true,target:6});
 for(let i=0;i<6;i++){
  const a=model.release(s),b=model.release(s),p=model.package(s,[a,b]);assert.equal(p.kind,'package');assert.equal(p.weight,1);
  assert.equal(conserved(s,6).packages,1);assert(model.accept(s,p));assert.equal(model.accept(s,p),false);assert.equal(conserved(s,6).packages,0);
 }
 assert.equal(model.release(s),null);assert.equal(s.accepted.length,6);assert.equal(conserved(s,6).deliveredMass,6);
});

test('invalid or reused package inputs and forged delivery recipes leave the ledger unchanged',()=>{
 const s=model.create(entries(4),{packages:true,target:2}),a=model.release(s),b=model.release(s),c=model.release(s),d=model.release(s);
 let before=snapshot(s);for(const parts of [null,[],[a],[a,a],[a,c],[a,{...b,id:90}],[a,{...b,weight:.6}],[a,{...b,kind:'A'}]])assert(model.package(s,parts).error);
 assert.equal(snapshot(s),before);const p=model.package(s,[a,b]);before=snapshot(s);assert(model.package(s,[a,b]).error);
 for(const fake of [{ids:[a.id,b.id],kind:'package',weight:2},{ids:[a.id,a.id],kind:'package',weight:1},{ids:[a.id,d.id],kind:'package',weight:1},{ids:[a.id,b.id],kind:'raw',weight:1}])assert.equal(model.accept(s,fake),false);
 assert.equal(snapshot(s),before);assert(model.accept(s,p));assert(model.accept(s,model.package(s,[c,d])));conserved(s,2);
});

test('malformed batches are rejected and a new explicit batch has isolated delivery history',()=>{
 for(const parts of [null,[],[null],[{id:0,kind:'A',weight:.5}],[...entries(2),entries(1)[0]],[{id:1,kind:'A',weight:NaN}]])assert(model.create(parts).error);
 assert(model.create(entries(3),{packages:true,target:2}).error);assert(model.create([{id:1,kind:'A',weight:.5},{id:2,kind:'A',weight:.5}],{packages:true,target:1}).error);
 const first=model.create(entries(3),{packages:false,target:3});model.accept(first,model.release(first));
 const second=model.create(entries(3),{packages:false,target:3});assert.equal(second.accepted.length,0);assert.equal(second.stock.length,3);assert.equal(first.accepted.length,1);
});
