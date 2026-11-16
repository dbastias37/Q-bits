const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
function setup(){const game=createGame(),{t}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});return game;}
function cells(t,count,axis='x',levels=Array(count).fill(.5)){
 const group=t.makeGroup(Array.from({length:count},(_,i)=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(...['x','y','z'].map(a=>a===axis?i*.09:0)),q:t.Q()})));
 const packId=group.parts[0].id;for(const [i,part]of group.parts.entries()){part.mood.externalBattery={version:1,ownerId:part.id,packId,enabled:true};part.mood.energy=levels[i];}return group;
}
test('one to three aligned battery cells form a single vessel in any axis without changing physics',()=>{
 for(const axis of ['x','y','z'])for(const count of [1,2,3]){
  const {t}=setup(),g=cells(t,count,axis),body=g.body,shapes=body.shapes.slice(),mass=body.mass,parts=g.parts;
  const turn=t.Q();turn.setFromEuler(.2,.3,.1);g.body.quaternion.copy(turn);const packs=t.batteryVisualPacks(g);assert.equal(packs.length,1);assert.equal(packs[0].parts.length,count);
  for(const dimension of ['x','y','z'])assert(Math.abs(packs[0].size[dimension]-.09*(dimension===axis?count:1))<1e-8);
  assert.equal(packs[0].fraction,.5);assert.equal(g.body,body);assert.equal(g.body.mass,mass);assert.deepEqual(body.shapes,shapes);assert.equal(g.parts,parts);
 }
});
test('a missing or detached cell cannot stretch a battery vessel across ordinary matter or empty space',()=>{
 const {t}=setup(),g=cells(t,3,'x',[.2,.5,.8]);delete g.parts[1].mood.externalBattery;
 let packs=t.batteryVisualPacks(g);assert.equal(packs.length,2);assert(packs.every(p=>Math.abs(p.size.x-.09)<1e-9));assert.deepEqual(Array.from(packs,p=>p.fraction),[.2,.8]);
 g.parts[1].mood.externalBattery={version:1,ownerId:g.parts[1].id,packId:g.parts[0].id,enabled:false};packs=t.batteryVisualPacks(g);assert.equal(packs.length,1);assert.equal(packs[0].fraction,.5);
 const fragment=t.makeGroup(t.worldParts(g).slice(2));t.removeGroup(g);assert.equal(t.batteryVisualPacks(fragment).length,1);assert(Math.abs(t.batteryVisualPacks(fragment)[0].size.x-.09)<1e-9);
});
test('opaque block optimization never hides battery interiors, and empty vessels have no green residue',()=>{
 const {t}=setup(),g=cells(t,2),gl=t.canvas.getContext('webgl'),draws=[];let kind=0;
 gl.uniform1f=(_,value)=>{kind=value;};gl.drawArrays=()=>draws.push(kind);t.drawGroupSolid(g);assert(!draws.includes(1),'a black combined block would hide the charge');assert(draws.includes(15));
 for(const part of g.parts)part.mood.energy=0;draws.length=0;t.drawGroupSolid(g);assert(!draws.includes(15));t.drawBatteriesTransparent();assert(draws.includes(16),'empty battery retains its transparent shell');
 delete g.parts[1].mood.externalBattery;g.parts[0].mood.energy=.5;draws.length=0;t.drawGroupSolid(g);assert(draws.includes(1),'ordinary attached cube remains visible');assert(draws.includes(15));
});
