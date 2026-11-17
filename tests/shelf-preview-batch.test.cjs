const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
function setup(){let next=0,bound;const draws=[],uploads=new Map(),live=new Set();
 const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,isContextLost:()=>false,getParameter:()=>8192,getExtension:()=>null,
 createBuffer:()=>{const b=++next;live.add(b);return b;},deleteBuffer:b=>live.delete(b),bindBuffer:(_,b)=>{bound=b;},bufferData:(_,data)=>uploads.set(bound,Array.from(data)),drawArrays:(_,first,count)=>draws.push({buffer:bound,first,count})}, {get:(o,k)=>k in o?o[k]:/^[A-Z_]+$/.test(k)?0:()=>{}});
 const game=createGame({gl,graphics:false}),{t}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});const shelf=t.createShelf({p:t.V(0,.4,-13.996),q:t.Q(),wall:'north'});assert(shelf);return {...game,draws,uploads,live,shelf};
}
function store(t,shelf,n=100,mixed=false){const g=t.makeGroup(Array.from({length:n},(_,i)=>({id:t.allocateUnitId(),shape:mixed?['cube','tetra','pyramid','coupler'][i%4]:'cube',weight:1,p:t.V(i%10*.09,.3+Math.floor(i/10)*.09,0),q:t.Q()})));
 if(mixed){const p=g.parts[0];p.mood.externalBattery={version:1,ownerId:p.id,packId:p.id,enabled:false};}
 t.setMultiSelection([g]);t.setSelected({g,part:g.parts[0]});assert(t.storeShelfSelection(shelf));return shelf.cells[0];}

test('100 stored cubes use one draw and one immutable buffer without changing inventory or physics',()=>{
 const {t,shelf,draws,uploads,live}=setup(),cell=store(t,shelf),saved=JSON.stringify(t.serializeShelves()),bodies=t.world.bodies.length;
 draws.length=0;t.drawShelfContents();assert.equal(draws.length,1);assert.equal(draws[0].count,3600);const preview=cell.preview,buffer=preview.batches[0].buffer;
 const count=uploads.size;for(let i=0;i<20;i++)t.drawShelfContents();assert.equal(uploads.size,count);assert.equal(cell.preview,preview);assert(live.has(buffer));assert.equal(t.world.bodies.length,bodies);assert.equal(JSON.stringify(t.serializeShelves()),saved,'GPU cache is never serialized');
 t.clearShelves();assert(!live.has(buffer));
});

test('mixed shelf previews retain all vertices and material colors in at most three draws',()=>{
 const {t,shelf,draws,uploads}=setup(),cell=store(t,shelf,12,true),item=cell.items[0],before=JSON.stringify(item);draws.length=0;t.drawShelfContents();assert.equal(draws.length,3);
 const expected=item.groups.flatMap(g=>g.parts).reduce((n,p)=>n+t.unitProfile(p.shape).faces.reduce((sum,f)=>sum+(f.length-2)*3,0),0);assert.equal(draws.reduce((n,d)=>n+d.count,0),expected);
 for(const batch of cell.preview.batches){const data=uploads.get(batch.buffer);for(let i=0;i<data.length;i+=12){assert(Math.max(Math.abs(data[i]),Math.abs(data[i+1]),Math.abs(data[i+2]))<=.09500001);assert(Math.abs(Math.hypot(...data.slice(i+3,i+6))-1)<1e-6);}}
 assert.equal(JSON.stringify(item),before);assert.deepEqual(Array.from(cell.preview.batches,b=>Array.from(b.color)).sort(),[[.38,.62,.66,1],[.3,.34,.35,1],[.58,.61,.61,1]].sort());
});

test('withdrawing the visible item frees its preview and rebuilding never reuses stale inventory',()=>{
 const {t,shelf,live}=setup(),cell=store(t,shelf,4);t.drawShelfContents();const buffers=cell.preview.batches.map(b=>b.buffer);assert(t.withdrawShelf(shelf,0,1));assert.equal(cell.preview,undefined);assert(buffers.every(b=>!live.has(b)));
 const before=t.groups.flatMap(g=>g.parts.map(p=>p.id));t.setMultiSelection([...t.groups]);t.setSelected({g:t.groups[0],part:t.groups[0].parts[0]});assert(t.storeShelfSelection(shelf));t.drawShelfContents();assert(cell.preview);assert(cell.preview.batches.every(b=>!buffers.includes(b.buffer)));assert.deepEqual(cell.items[0].groups.flatMap(g=>g.parts.map(p=>p.id)),before);
});
