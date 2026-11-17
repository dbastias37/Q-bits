// Real Cannon creation/placement, stubbed DOM and GL; NOT browser FPS or GPU timings.
const createGame=require('./game-harness.cjs'),assert=require('node:assert/strict');
function setup(n){const game=createGame(),{t}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});const g=t.makeGroup(Array.from({length:n},(_,i)=>({id:100+i,weight:1,shape:'cube',p:t.V(2+(i%20)*.09,.4+Math.floor(i/400)*.09,Math.floor(i/20)%20*.09),q:t.Q(),mood:{energy:.3}})));return {...game,g};}
const results=[];
for(const pieces of [80,500,2000]){
 const a=setup(pieces);let start=performance.now();a.t.detachPart({g:a.g,part:a.g.parts[0]},true);const instantMs=performance.now()-start;
 const b=setup(pieces);start=performance.now();b.t.beginStagedDisassembly([b.g]);const preparationMs=performance.now()-start;start=performance.now();b.t.drawDisassembly();const firstPreviewMs=performance.now()-start;
 const times=[];let maxBodiesPerFrame=0,frames=0;while(b.t.pendingDisassemblyCount()&&frames<100000){const before=b.t.groups.length;start=performance.now();b.t.updateDisassembly(1/60);times.push(performance.now()-start);maxBodiesPerFrame=Math.max(maxBodiesPerFrame,b.t.groups.length-before);frames++;}
 assert.equal(b.t.pendingDisassemblyCount(),0);assert.equal(b.t.groups.length,pieces);assert.equal(new Set(b.t.groups.flatMap(g=>g.parts.map(p=>p.id))).size,pieces);assert(maxBodiesPerFrame<=4);
 const sorted=[...times].sort((a,b)=>a-b);results.push({pieces,instantMs,preparationMs,firstPreviewMs,releaseTotalMs:times.reduce((a,b)=>a+b,0),releaseMedianMs:sorted[Math.floor(sorted.length/2)],releaseP95Ms:sorted[Math.floor(sorted.length*.95)],releaseMaxMs:Math.max(...times),maxBodiesPerFrame,frames,simulatedSeconds:frames/60});
}
console.log(JSON.stringify({scope:'CPU setup and release calls with real Cannon creation, stubbed DOM/GL. Physics stepping excluded; not FPS, capacity limit or end-to-end frame cost. 2ms is a cooperative scheduling target, not a worst-case guarantee.',results},null,2));
