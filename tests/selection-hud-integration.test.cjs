const test=require('node:test'),assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

test('the selection chooser reads only body identity, name and count from a compound',()=>{
 const {t}=createGame(),g=t.makeGroup(['cube','pyramid'].map((shape,i)=>({id:7001+i,shape,weight:1,p:t.V(i*.09,.045,0),q:t.Q()})));
 t.setSelected({g,part:g.parts[0]});const before=JSON.stringify(t.worldParts(g)),bodies=t.world.bodies.length;
 const [entry]=t.selectionHudSnapshot();
 assert.deepEqual({...entry},{id:g.body.id,name:g.parts[0].mood.name,count:2});
 assert.equal(t.world.bodies.length,bodies);assert.equal(JSON.stringify(t.worldParts(g)),before);
});

test('choosing a listed structure isolates or removes the selected group without moving it; deleted IDs are rejected',()=>{
 const {t}=createGame();const a=t.addQubit([1,.05,1]),b=t.addQubit([2,.05,1]);
 t.story.ready=true;t.story.mode='playing';t.setMultiSelection([a,b]);t.setSelected({g:a,part:a.parts[0]});
 const before=b.body.position.clone();assert.equal(t.selectFromHud(b.body.id),true);
 assert.deepEqual(Array.from(t.selectionGroups()),[b]);assert.equal(b.body.position.distanceTo(before),0);
 assert.equal(t.selectFromHud(b.body.id,{toggle:true}),true);assert.equal(t.selectionGroups().length,0);
 t.setSelected({g:a,part:a.parts[0]});t.removeGroup(a);assert.equal(t.selectFromHud(a.body.id),false);assert.equal(t.selectionHudSnapshot().length,0);
 t.story.mode='pause';assert.equal(t.selectFromHud(b.body.id),false);
});
