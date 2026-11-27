const test=require('node:test'),assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
test('selection HUD snapshot is a counter without a duplicate mechanism, geometry or mood animation',()=>{
 const {t}=createGame();
 const q=t.Q();q.setFromAxisAngle(t.V(0,1,0),Math.PI/2);
 const g=t.makeGroup([{id:7001,shape:'cube',weight:1,p:t.V(0,.045,0),q:t.Q()},{id:7002,shape:'pyramid',weight:1,p:t.V(.09,.045,0),q}]);
 t.setSelected({g,part:g.parts[0]});g.parts[1].mood.state='restless';g.parts[1].mood.agitation=.9;
 const bodies=t.world.bodies.length,before=JSON.stringify(t.worldParts(g)),items=t.selectionHudSnapshot();
 assert.equal(items.length,1);assert.equal(items[0].count,2);
 assert.equal(items[0].parts.length,1,'a HUD counter requires no additional polygons');
 assert.equal(items[0].parts[0].vertices,undefined);
 assert.equal(items[0].mood,undefined);
 for(let i=0;i<120;i++)t.selectionHudSnapshot();
 assert.equal(t.world.bodies.length,bodies);assert.equal(JSON.stringify(t.worldParts(g)),before);
});
test('choosing a static selection chip isolates or removes its group without moving it',()=>{
 const {t}=createGame();const a=t.addQubit([1,.05,1]),b=t.addQubit([2,.05,1]);
 t.story.ready=true;t.story.mode='playing';t.setMultiSelection([a,b]);t.setSelected({g:a,part:a.parts[0]});
 const before=b.body.position.clone();assert.equal(t.selectFromHud(b.body.id),true);
 assert.deepEqual(Array.from(t.selectionGroups()),[b]);assert.equal(b.body.position.distanceTo(before),0);
 assert.equal(t.selectFromHud(b.body.id,{toggle:true}),true);assert.equal(t.selectionGroups().length,0);
 t.setSelected({g:a,part:a.parts[0]});t.removeGroup(a);assert.equal(t.selectFromHud(a.body.id),false);assert.equal(t.selectionHudSnapshot().length,0);
 t.story.mode='pause';assert.equal(t.selectFromHud(b.body.id),false);
});
