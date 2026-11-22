const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

function lab(){
 const game=createGame({graphics:false}),{t,sandbox}=game;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';return game;
}
function chassis(t,count=4,x=0){
 const base=t.makeGroup(Array.from({length:count},(_,i)=>({id:t.allocateUnitId(),shape:'coupler',weight:1,p:t.V(x+i*.09,.3,0),q:t.Q()})));
 const flip=t.Q();flip.setFromAxisAngle(t.V(0,0,1),Math.PI);
 const leaves=[];
 for(const [i,part]of base.parts.entries()){
  const leaf=t.makeGroup([{id:t.allocateUnitId(),shape:'coupler',weight:1,p:t.V(x+i*.09,.3+2*.09*51/56,0),q:flip.clone()}]);
  assert(t.connectRotorTips(part.id,leaf.parts[0].id));leaves.push(leaf);
 }
 return {base,leaves};
}
const ids=list=>Array.from(list,g=>g.parts[0].id);

test('cached expansion preserves seed-first order across interleaved mechanical networks',()=>{
 const {t}=lab(),a=chassis(t),b=chassis(t,4,2),removed=t.addQubit([4,.3,0]);t.removeGroup(removed);
 t.setStepCache({parts:null,components:new Map()});
 try{
  const seeds=[a.leaves[2],b.leaves[1],a.leaves[0],a.leaves[2],removed,null];
  const expected=[a.leaves[2],b.leaves[1],a.leaves[0],a.base,a.leaves[1],a.leaves[3],b.base,b.leaves[0],b.leaves[2],b.leaves[3]];
  assert.deepEqual(ids(t.rotorConnectedGroups(seeds)),ids(expected));
  const all=[...a.leaves].reverse().concat(a.base);
  const result=t.rotorConnectedGroups(all.concat(all));assert.deepEqual(ids(result),ids(all));
  result.pop();assert.deepEqual(ids(t.rotorConnectedGroups(all)),ids(all),'callers cannot mutate the cached membership');
  assert.deepEqual(ids(t.rotorConnectedGroups([])),[]);
  assert.deepEqual(ids(t.rotorConnectedGroups([removed,null,{}])),[]);
 }finally{t.setStepCache(null);}
});

test('querying a complete large component visits a linear number of cached members',()=>{
 const {t}=lab(),{base}=chassis(t,32);
 t.setStepCache({parts:null,components:new Map()});
 try{
  const seeds=Array.from(t.rotorConnectedGroups([base])).reverse();
  const component=t.mechanicalTopologyIndex().components.get(base),iterate=component[Symbol.iterator];let visits=0;
  // Count work rather than wall time so slow/contended CI machines do not fail.
  component[Symbol.iterator]=function*(){for(const member of iterate.call(this)){visits++;yield member;}};
  try{
   assert.deepEqual(ids(t.rotorConnectedGroups(seeds)),ids(seeds));
   assert(visits<=2*seeds.length,`complete component query visited ${visits} members for ${seeds.length} groups`);
  }finally{delete component[Symbol.iterator];}
 }finally{t.setStepCache(null);}
});

test('cached component queries follow disconnect, reconnect and removal in the same substep',()=>{
 const {t}=lab(),rotor=t.spawnRotor(t.V(0,.3,0)),a=t.rotorPart(rotor.aId),b=t.rotorPart(rotor.bId);
 t.setStepCache({parts:null,components:new Map()});
 try{
  assert.deepEqual(ids(t.rotorConnectedGroups([b.g])),ids([b.g,a.g]));
  assert(t.disconnectRotor(rotor));
  assert.deepEqual(ids(t.rotorConnectedGroups([a.g])),ids([a.g]));
  assert.deepEqual(ids(t.rotorConnectedGroups([b.g])),ids([b.g]));
  assert(t.connectRotorTips(a.part.id,b.part.id));
  assert.deepEqual(ids(t.rotorConnectedGroups([b.g])),ids([b.g,a.g]));
  t.removeGroup(b.g);
  assert.deepEqual(ids(t.rotorConnectedGroups([b.g,a.g])),ids([a.g]));
 }finally{t.setStepCache(null);}
});
