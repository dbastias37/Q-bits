'use strict';
// Adapter evidence, with paid station fixtures. These tests do not stand in
// for a complete four-worker run or a drone route.
const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./galpon-chain-fixture.cjs');

function firstReceipt(f){
 const {t,s,C,credited,certify,factory,feedRotor,bodySteps}=f;
 credited.slice(0,3).forEach(certify);assert(C.beginOrder(s));factory();feedRotor();
 assert(t.hangarChainStartStation('assembler'));C.tick(s,2,{powered:true,working:true});
 assert(t.hangarChainFinishStation('assembler'));bodySteps(120);
 assert(t.hangarChainReceiveProduct(s.chain.products[0]));assert.equal(C.status(s).total,1);
 C.tick(s,5,{powered:true,working:true,reason:'processing'});
 assert.equal(C.status(s).continuity,5);
}

test('a physically blocked paid output resets continuity even while another status message is shown',()=>{
 const f=fixture(),{t,s,w,C,feedRotor,manufacture}=f;firstReceipt(f);feedRotor();
 assert(t.hangarChainStartStation('assembler'));
 const out=s.chain.jobs.assembler.outputs[0].p;
 manufacture('cube',t.V(out.x,out.y,out.z));C.tick(s,2,{powered:true,working:true,reason:'processing'});
 const paid=s.energyJ;w.scan=0;t.tickHangarChain(.01);
 assert.equal(C.status(s).continuity,0);assert.equal(s.chain.order.continuity.state,'blocked');
 assert(C.ready(s,'assembler'));assert.equal(s.energyJ,paid);
 w.message='La cinta sigue en marcha.';t.tickHangarChain(.01);
 assert.equal(s.chain.order.continuity.state,'blocked');assert.equal(s.energyJ,paid);
});

test('a converter holding a completed output is waiting, not useful processing time',()=>{
 const f=fixture(),{t,s,w,G,C}=f;firstReceipt(f);
 const id=t.allocateUnitId(),worker=s.initialIds[0];G.tick(s,1);
 assert(G.extract(s,id));assert(G.take(s,id,worker));assert(G.store(s,id,worker));
 assert(G.start(s,'converter',id,'cube'));G.tick(s,1);assert(G.ready(s,'converter'));
 w.scan=0;t.tickHangarChain(.1);
 assert.equal(C.status(s).continuity,5);assert.equal(s.chain.order.continuity.state,'idle');
 assert(G.ready(s,'converter'));assert.doesNotThrow(()=>G.validate(s));
});

test('producing construction stock does not advance order continuity; normal feed production does',()=>{
 const f=fixture(),{t,s,sandbox,G,C}=f;firstReceipt(f);
 const id=t.allocateUnitId(),worker=s.initialIds[0];G.tick(s,1);
 assert(G.extract(s,id));assert(G.take(s,id,worker));assert(G.store(s,id,worker));
 assert(G.start(s,'converter',id,'cube'));
 sandbox.document.querySelector('#galpon-chain-plan').value='drone';assert(t.hangarChainAction('prepare'));
 t.tickHangarChain(.1);assert.equal(C.status(s).continuity,5);assert.equal(s.chain.order.continuity.state,'idle');
 assert(t.hangarChainAction('feed'));t.tickHangarChain(.1);
 assert.equal(C.status(s).continuity,5.1);assert.equal(s.chain.order.continuity.state,'processing');
 assert.doesNotThrow(()=>G.validate(s));
});

for(const interruption of ['power','blocked'])test('the third physical reception cannot latch its optional streak during a simultaneous '+interruption,()=>{
 const f=fixture(),{t,s,w,C,credited,certify,factory,feedRotor,bodySteps}=f;
 credited.slice(0,3).forEach(certify);assert(C.beginOrder(s));factory();
 for(let n=0;n<3;n++){
  feedRotor();assert(t.hangarChainStartStation('assembler'));
  C.tick(s,2,{powered:true,working:true});assert(t.hangarChainFinishStation('assembler'));bodySteps(120);
  if(n<2){assert(t.hangarChainReceiveProduct(s.chain.products[n]));assert.equal(C.status(s).clearOutputs,n+1);}
  else if(interruption==='power'){
   f.source().enabled=false;w.scan=0;t.tickHangarChain(.01);
  }else{
   w.blockedStation='laser';assert(t.hangarChainReceiveProduct(s.chain.products[n]));
  }
 }
 assert.equal(C.status(s).total,3,'the same physical products still reach storage');
 assert.equal(C.status(s).clearOutputs,0,'an interrupted third receipt must reset before the optional achievement latches');
 assert.equal(C.status(s).completed,false);assert.doesNotThrow(()=>f.G.validate(s));
});
