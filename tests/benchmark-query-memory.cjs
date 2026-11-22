// Structural retained-memory inventory for the production local picking BVH.
// No heap-byte estimate, timer, forced GC, browser FPS or stress loop.
// Usage: node tests/benchmark-query-memory.cjs
//        node tests/benchmark-query-memory.cjs --root=/absolute/repository --output=/tmp/query-memory.json
// Run separately from timing benchmarks. The instrumentation itself allocates
// temporary Sets while inspecting ownership; none is retained by the game.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');return at<0?[arg.replace(/^--/,''),true]:[arg.slice(0,at).replace(/^--/,''),arg.slice(at+1)];}));
const root=path.resolve(args.root||path.join(__dirname,'..'));
const source=fs.readFileSync(path.join(root,'assets/js/game.js'),'utf8');
const createGame=require(path.join(root,'tests/game-harness.cjs'));

function setup(){
 const hook=`window.__queryMemory={calls:0,builds:0,maxPieces:MAX_QUBITS,scopeIsClear:()=>targetAimCache===null};
 const memoryOriginalPartQueryIndex=partQueryIndex;
 partQueryIndex=function(g){const previous=g.partQueryCache;window.__queryMemory.calls++;const tree=memoryOriginalPartQueryIndex(g);if(g.partQueryCache!==previous)window.__queryMemory.builds++;return tree;};\n`;
 const at=source.lastIndexOf('})();');assert(at>=0,'production closure');
 const game=createGame({graphics:false,gameSource:source.slice(0,at)+hook+source.slice(at)}),{t,sandbox}=game;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 return {...game,work:sandbox.__queryMemory};
}

function structuralInventory(cache){
 const counts={cacheObjects:0,bvhNodes:0,internalNodes:0,leafNodes:0,leafArrays:0,partEntries:0,boundsVectors:0,ownedObjectsTotal:0,ownedReferenceSlots:0,externalReferenceSlots:0,externalObjectsReferenced:0,numericValueSlots:0,arrayLengthSlots:0};
 if(!cache)return counts;
 const owned=new Set(),external=new Set(),entries=new Set();
 function add(object,key){assert(object&&typeof object==='object');if(!owned.has(object)){owned.add(object);counts[key]++;}}
 function bounds(object){add(object.min,'boundsVectors');add(object.max,'boundsVectors');}
 function node(tree){
  add(tree,'bvhNodes');bounds(tree);
  if(tree.entries){
   counts.leafNodes++;add(tree.entries,'leafArrays');
   for(const entry of tree.entries){assert(!entries.has(entry),'a part entry occurs in only one leaf');entries.add(entry);add(entry,'partEntries');bounds(entry);}
  }else{counts.internalNodes++;assert(tree.left&&tree.right,'binary internal node');node(tree.left);node(tree.right);}
 }
 add(cache,'cacheObjects');node(cache.tree);
 // Traverse own enumerable values only. Prototypes, hidden classes, property
 // names, array capacity and allocator overhead are engine-dependent and not
 // counted. The original parts array and live part objects are external: the
 // index adds references to them, not additional copies of their full graphs.
 for(const object of owned){
  if(Array.isArray(object))counts.arrayLengthSlots++;
  for(const value of Object.values(object)){
   if(value&&typeof value==='object'){
    if(owned.has(value))counts.ownedReferenceSlots++;
    else{counts.externalReferenceSlots++;external.add(value);}
   }else if(typeof value==='number')counts.numericValueSlots++;
  }
 }
 counts.ownedObjectsTotal=owned.size;counts.externalObjectsReferenced=external.size;
 assert.equal(counts.bvhNodes,counts.internalNodes+counts.leafNodes);
 assert.equal(counts.leafNodes,counts.leafArrays);
 return counts;
}

function makeBlock(t,pieces){
 const side=Math.ceil(Math.cbrt(pieces)),parts=[];
 for(let i=0;i<pieces;i++)parts.push({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V((i%side-(side-1)/2)*.09,1.7+(Math.floor(i/side)%side-(side-1)/2)*.09,-2.7+(Math.floor(i/(side*side))-(side-1)/2)*.09),q:t.Q()});
 return t.makeGroup(parts);
}
function aimAtGroup(t,g){
 const pose=t.poses(g)[0],origin=pose.p.vadd(t.V(0,0,2));
 t.setLook({camera:[origin.x,origin.y,origin.z],yaw:0,pitch:0});
 assert(t.aimQubit(8,t.V(0,0,-1)),'fixture ray reaches material');
}
function workDelta(work,run){const calls=work.calls,builds=work.builds;run();return {indexCalls:work.calls-calls,indexBuilds:work.builds-builds};}

const reports=[];
for(const pieces of [8,100,1000,2000]){
 const {t,work}=setup();assert(pieces<=work.maxPieces,'do not increase the shipped limit');
 const g=makeBlock(t,pieces);assert.equal(g.partQueryCache,undefined,'construction alone does not allocate a picking BVH');
 const cold=workDelta(work,()=>aimAtGroup(t,g));
 const structural=structuralInventory(g.partQueryCache);
 if(pieces<=8){assert.equal(cold.indexBuilds,0);assert.equal(structural.ownedObjectsTotal,0);}
 else{assert.equal(cold.indexBuilds,1);assert.equal(structural.partEntries,pieces);}
 let originalCache=g.partQueryCache;
 const warm=workDelta(work,()=>aimAtGroup(t,g));assert.equal(g.partQueryCache,originalCache);assert.equal(warm.indexBuilds,0);
 const translated=workDelta(work,()=>{g.body.position.x+=.37;g.body.position.y+=.12;aimAtGroup(t,g);});
 assert.equal(g.partQueryCache,originalCache);assert.equal(translated.indexBuilds,0);
 const rotated=workDelta(work,()=>{g.body.quaternion.setFromEuler(.13,.29,.17);aimAtGroup(t,g);});
 assert.equal(g.partQueryCache,originalCache);assert.equal(rotated.indexBuilds,0);
 t.updateTarget();assert(work.scopeIsClear(),'target-query results expire after the synchronous update');
 // Keep g deliberately alive, but release our own explicit cache reference.
 // This proves owner-link cleanup, not a GC collection or exact heap reduction.
 originalCache=null;
 t.removeGroup(g);
 assert.equal(g.partQueryCache,undefined,'retired group must release its BVH even if a caller retains g');
 assert(!t.groups.includes(g));assert(!t.world.bodies.includes(g.body));
 const afterRemoval=structuralInventory(g.partQueryCache);
 reports.push({pieces,cold,warm,translated,rotated,retainedStructure:structural,removal:{groupReferenceDeliberatelyRetained:true,cachePropertyCleared:g.partQueryCache===undefined,objectsReachableThroughCacheProperty:afterRemoval.ownedObjectsTotal,targetScopeCleared:work.scopeIsClear()}});
}

const result={schema:1,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),runtime:process.version,method:'Production query and removal functions; structural ownership counts only. No byte estimate, elapsed-time benchmark or proof of garbage collection. Existing live part objects and their source array are counted as external references, not newly allocated objects.',reports};
const json=JSON.stringify(result,null,2)+'\n';if(args.output)fs.writeFileSync(path.resolve(args.output),json);else process.stdout.write(json);
