const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
function lab(){const game=createGame();game.t.clearNarrativeScene();Object.assign(game.t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});return game;}
function store(t,n){const shelf=t.createShelf({p:t.V(0,.4,-13.996),q:t.Q(),wall:'north'}),g=t.makeGroup(Array.from({length:n},(_,i)=>({id:100+i,weight:1,shape:'cube',p:t.V((i%20)*.09,.3+Math.floor(i/400)*.09,Math.floor(i/20)%20*.09),q:t.Q()})));t.setMultiSelection([g]);t.setSelected({g,part:g.parts[0]});assert(t.storeShelfSelection(shelf));return shelf;}
test('a 2000-piece shelf thumbnail submits one draw and reuses buffers on every frame',()=>{
 const game=lab(),{t}=game,s=store(t,2000),bodyCount=t.world.bodies.length,before=game.buffers.size;t.renderCounts.active=true;t.renderCounts.calls=0;t.renderCounts.triangles=0;t.drawShelfContents();assert.equal(t.renderCounts.calls,1);assert.equal(t.renderCounts.triangles,24000);assert.equal(game.buffers.size,before+1);
 const entry=s.previewMeshes.get(0);for(let i=0;i<20;i++)t.drawShelfContents();assert.equal(s.previewMeshes.get(0),entry);assert.equal(game.buffers.size,before+1);assert.equal(t.world.bodies.length,bodyCount);t.deleteShelf(s,true);assert.equal(game.buffers.size,before);
});
test('withdraw and scene reset release cached thumbnail buffers without losing stored identities',()=>{
 const game=lab(),{t}=game,s=store(t,8),before=game.buffers.size;t.drawShelfContents();assert.equal(game.buffers.size,before+1);const ids=s.cells[0].items[0].groups.flatMap(g=>g.parts.map(p=>p.id));assert(t.withdrawShelf(s));assert.equal(game.buffers.size,before);assert.deepEqual(Array.from(t.groups.flatMap(g=>g.parts.map(p=>p.id))).sort(),Array.from(ids).sort());t.clearNarrativeScene();assert.equal(game.buffers.size,before);
});
test('mixed preview geometry groups by appearance and only drops the released prefix',()=>{
 const {t}=lab(),parts=['cube','pyramid','tetra','coupler'].map((shape,i)=>({shape,p:[i*.2,0,0],q:[0,0,0,1],mood:{}})),mesh=t.buildPreviewMesh(parts,t.V());t.renderCounts.active=true;t.renderCounts.calls=0;t.renderCounts.triangles=0;t.drawPreviewMesh(mesh,t.V(),t.Q());assert.equal(t.renderCounts.calls,2);assert.equal(t.renderCounts.triangles,36);
 t.renderCounts.calls=0;t.renderCounts.triangles=0;t.drawPreviewMesh(mesh,t.V(),t.Q(),1,2);assert.equal(t.renderCounts.calls,1);assert.equal(t.renderCounts.triangles,18);
});
