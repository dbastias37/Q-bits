const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const createGame=require('./game-harness.cjs');
const reference=require('./spatial-query-reference.cjs');

function setup(){
 let source=fs.readFileSync(path.join(__dirname,'../assets/js/game.js'),'utf8');
 const names=['rayPart','partPose','rayGroupCandidates','partQueryIndex'];
 const hook=reference+`window.__spatial={counts:{},referenceAim,referenceLanding,withScope(fn){const old=targetAimCache;targetAimCache=[];try{return fn();}finally{targetAimCache=old;}}};`+
 names.map(name=>`{const original=${name};${name}=function(...args){const counts=window.__spatial.counts;counts['${name}']=(counts['${name}']||0)+1;${name==='partQueryIndex'?`if(args[0].partQueryCache?.parts!==args[0].parts)counts.builds=(counts.builds||0)+1;`:''}return original.apply(this,args);};}`).join('\n');
 const at=source.lastIndexOf('})();');source=source.slice(0,at)+hook+source.slice(at);
 const game=createGame({gameSource:source,graphics:false}),{t,sandbox}=game;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 t.setLook({camera:[0,1.7,0],yaw:0,pitch:0});
 return {...game,query:sandbox.__spatial};
}
function grid(t,nx,ny,nz,center=t.V(0,.045,0),shape='cube'){
 const parts=[];
 for(let y=0;y<ny;y++)for(let z=0;z<nz;z++)for(let x=0;x<nx;x++)parts.push({id:t.allocateUnitId(),shape,weight:1,p:center.vadd(t.V((x-(nx-1)/2)*.09,(y-(ny-1)/2)*.09,(z-(nz-1)/2)*.09)),q:t.Q()});
 return t.makeGroup(parts);
}
function distant(t,count=100){for(let i=0;i<count;i++)grid(t,10,1,1,t.V(4+(i%5)*1.5,.045,Math.floor(i/5)*.4-4));}
function signature(hit){return hit?JSON.stringify({id:hit.part.id,distance:hit.distance,point:hit.point,normal:hit.normal}):null;}
function sameAim(game,max,dir){assert.equal(signature(game.t.aimQubit(max,dir)),signature(game.query.referenceAim(max,dir)));}
function sameLanding(game,g){const a=game.t.landingProjection(g),b=game.query.referenceLanding(g);assert.equal(a.delta,b.delta);assert.equal(JSON.stringify(a.position),JSON.stringify(b.position));}

test('empty aim and complete target update reject 1000 unreachable parts before any exact ray',()=>{
 const game=setup(),{t,query}=game;distant(t);
 query.counts={};assert.equal(query.referenceAim(),null);assert.equal(query.counts.rayPart,1000);
 query.counts={};assert.equal(t.aimQubit(),null);assert.equal(query.counts.rayPart||0,0);assert.equal(query.counts.partPose||0,0);assert.equal(query.counts.builds||0,0);
 query.counts={};t.updateTarget();assert.equal(query.counts.rayPart||0,0);assert.equal(query.counts.rayGroupCandidates,100,'8 m callout query serves the two shorter target queries');
});

test('large rotated mixed solids match exhaustive picking, including origins inside and arbitrary ray scales',()=>{
 const game=setup(),{t}=game,parts=[];
 for(let i=0;i<96;i++){const q=t.Q();q.setFromEuler(i*.13,i*.07,i*.11);parts.push({id:t.allocateUnitId(),weight:1,shape:['cube','tetra','pyramid','coupler'][i%4],p:t.V((i%8)*.13-.45,1.2+Math.floor(i/32)*.13,-1.5-Math.floor(i%32/8)*.13),q});}
 const g=t.makeGroup(parts);
 for(const angle of [0,.37,1.54]){
  g.body.quaternion.setFromEuler(angle,angle*.7,-angle*.2);
  for(const pose of t.poses(g)){const camera=t.V(...t.getLook().camera),dir=pose.p.vsub(camera);dir.normalize();sameAim(game,8,dir);sameAim(game,.8,dir);sameAim(game,8,dir.scale(2));}
  const inside=t.poses(g)[0].p;t.setLook({camera:[inside.x,inside.y,inside.z]});sameAim(game,8,t.V(1,0,0));t.setLook({camera:[0,1.7,0]});
 }
});

test('local hierarchy keeps real holes and original equal-distance priorities',()=>{
 const game=setup(),{t}=game,parts=[];
 for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++)if(Math.abs(x)===2||Math.abs(y)===2)parts.push({id:t.allocateUnitId(),weight:1,shape:'cube',p:t.V(x*.09,1.7+y*.09,-1),q:t.Q()});
 const ring=t.makeGroup(parts),back=t.addQubit([0,1.7,-2]);
 assert.equal(t.aimQubit().part.id,back.parts[0].id);sameAim(game,4,t.V(0,0,-1));
 const front=t.addQubit([0,1.7,-.6]);t.addQubit([0,1.7,-.6]);assert.equal(t.aimQubit().part.id,front.parts[0].id);
 t.removeGroup(front);sameAim(game,4,t.V(0,0,-1));assert(ring.partQueryCache,'tested the hierarchical path');
});

test('wall and cargo occlusion preserve exact reach and priority rules',()=>{
 const game=setup(),{t}=game;t.addQubit([0,1.7,-2]);
 const cargo=t.newCargo(t.V(0,0,-1),2,1);assert(cargo);cargo.body.position.y=1.7;sameAim(game,4,t.V(0,0,-1));assert.equal(t.aimQubit(4),null);
 cargo.body.position.x=2;sameAim(game,4,t.V(0,0,-1));assert(t.aimQubit(4));
 t.storyWall(t.V(0,1.7,-.5),t.V(.3,.3,.01));sameAim(game,4,t.V(0,0,-1));assert.equal(t.aimQubit(4),null);
});

test('target scope shares only identical rays with sufficient reach and expires before mutations',()=>{
 const game=setup(),{t,query}=game,g=t.addQubit([0,1.7,-3]);
 query.withScope(()=>{assert(t.aimQubit(8));assert.equal(t.aimQubit(2.7),null);assert(t.aimQubit(4));assert.equal(t.aimQubit(8,t.V(1,0,0)),null);});
 t.updateTarget();g.body.position.x=2;assert.equal(t.aimQubit(8),null);t.updateTarget();
 g.body.position.set(0,1.7,-2);assert(t.aimQubit());t.removeGroup(g);assert.equal(t.aimQubit(),null);
 assert.throws(()=>query.withScope(()=>{t.aimQubit(8);throw Error('scope cleanup');}),/scope cleanup/);
 const next=t.addQubit([0,1.7,-1]);assert.equal(t.aimQubit().part.id,next.parts[0].id);
});

test('moving or rotating a body reuses local geometry without mutating sleep or physical state',()=>{
 const game=setup(),{t,query}=game,g=grid(t,10,10,1,t.V(0,1.7,-1));g.body.sleep();
 t.aimQubit();assert(g.partQueryCache);const cache=g.partQueryCache;
 for(const angle of [.23,.71,1.2]){g.body.quaternion.setFromEuler(0,angle,.1);g.body.position.x+=.02;query.counts={};sameAim(game,8,t.V(0,0,-1));assert.equal(g.partQueryCache,cache);assert.equal(query.counts.builds||0,0);assert.equal(g.body.sleepState,2);assert.equal(g.body.velocity.norm2(),0);}
});

test('cold large-body query builds one local index and warm queries reuse it with bounded exact candidates',()=>{
 const game=setup(),{t,query}=game,g=grid(t,10,10,10,t.V(0,1.7,-1.5));
 query.counts={};const cold=t.aimQubit();assert(cold);assert.equal(query.counts.builds,1);assert(query.counts.rayPart<=40,'only the four edge columns touched by the ray survive');
 const cache=g.partQueryCache;query.counts={};assert.equal(signature(t.aimQubit()),signature(cold));assert.equal(query.counts.builds||0,0);assert(query.counts.rayPart<=40);assert.equal(g.partQueryCache,cache);
 const point=t.poses(g).find(p=>p.part===cold.part).p;t.setLook({camera:[point.x,point.y,point.z]});
 query.withScope(()=>{const inside=t.aimQubit(8);assert.equal(inside.distance,0);assert.equal(t.aimQubit(.01).part.id,inside.part.id);assert.equal(t.aimQubit(0),null);});
});

test('Ctrl projection excludes 940 distant pieces before any of the 576 exact sample rays',()=>{
 const game=setup(),{t,query}=game;distant(t,94);const g=grid(t,4,4,4,t.V(0,1,0));t.setHeld({g,items:[{g}]});
 query.counts={};const baseline=query.referenceLanding(g);assert.equal(query.counts.rayPart,541440);
 query.counts={};assert.equal(t.landingProjection(g).delta,baseline.delta);assert.equal(query.counts.rayPart||0,0);assert.equal(query.counts.partPose,64);assert.equal(query.counts.builds||0,0);
});

test('Ctrl column keeps rotated furniture, welded holes, loads, held exclusions and current poses',()=>{
 const game=setup(),{t}=game,parts=[];
 for(let x=0;x<14;x++)for(const z of [-.18,.18])parts.push({id:t.allocateUnitId(),weight:1,shape:'cube',p:t.V((x-6.5)*.09,.5,z),q:t.Q()});
 const support=t.makeGroup(parts),g=t.addQubit([0,1.2,0]);sameLanding(game,g);assert.equal(t.landingProjection(g).delta,-t.bounds(g).min.y);
 support.body.quaternion.setFromEuler(0,.46,.2);sameLanding(game,g);
 g.body.position.z=.18;sameLanding(game,g);assert(support.partQueryCache);
 const q=t.Q();q.setFromEuler(.2,.7,.1);t.storyWall(t.V(0,.65,.18),t.V(.3,.01,.02),{q});sameLanding(game,g);
 const load=t.newCargo(t.V(0,0,.18),2,1);assert(load);load.body.position.y=.8;sameLanding(game,g);
 load.body.position.x=3;support.body.position.y+=.1;sameLanding(game,g);
 t.setHeld({g,items:[{g},{g:support}]});sameLanding(game,g);
});

test('rotated mixed-shape falling sets keep exactly the exhaustive landing height',()=>{
 const game=setup(),{t}=game,parts=[];
 for(let i=0;i<36;i++){const q=t.Q();q.setFromEuler(i*.21,i*.13,-i*.09);parts.push({id:t.allocateUnitId(),weight:1,shape:['cube','pyramid','tetra','coupler'][i%4],p:t.V((i%6-2.5)*.1,.5,Math.floor(i/6)*.1-.25),q});}
 const support=t.makeGroup(parts),heldParts=[];
 for(let i=0;i<12;i++){const q=t.Q();q.setFromEuler(i*.17,i*.11,i*.19);heldParts.push({id:t.allocateUnitId(),weight:1,shape:['cube','pyramid','tetra','coupler'][i%4],p:t.V((i%3-1)*.1,1.4,Math.floor(i/3)*.1-.15),q});}
 const falling=t.makeGroup(heldParts);t.setHeld({g:falling,items:[{g:falling}]});
 for(let i=0;i<24;i++){support.body.quaternion.setFromEuler(i*.07,i*.13,i*.17);falling.body.quaternion.setFromEuler(i*.1,-i*.09,i*.14);falling.body.position.x=(i%5-2)*.11;falling.body.position.z=(i%3-1)*.12;sameLanding(game,falling);}
});

test('replacing groups and restoring a scene cannot inherit stale query ownership',()=>{
 const game=setup(),{t}=game,g=grid(t,10,1,1,t.V(0,1.7,-1)),camera=t.getLook().camera;
 t.aimQubit();assert(g.partQueryCache);const original=t.worldParts(g),oldCache=g.partQueryCache,ids=original.map(p=>p.id);
 t.removeGroup(g);assert.equal(g.partQueryCache,undefined,'retired group releases its BVH even while a caller retains the group');const pieces=original.map(part=>t.makeGroup([part]));sameAim(game,8,t.V(0,0,-1));
 const saved=t.alphaSceneSnapshot();t.clearAlphaScene();t.restoreAlphaScene(saved);sameAim(game,8,t.V(0,0,-1));
 const restored=t.groups.flatMap(group=>group.parts).map(p=>p.id);assert(ids.every(id=>restored.includes(id)));
 assert(t.groups.every(group=>group.partQueryCache!==oldCache));assert.equal(pieces.length,10);assert.deepEqual(Array.from(t.getLook().camera),Array.from(camera));
});

test('actual weld, detach and workshop adaptation replace the local query cache and preserve ids',()=>{
 const game=setup(),{t,sandbox}=game,bench=t.setupWorkshop(),p=bench.p;
 t.setWorkshopProfile(sandbox.QBitsWorkshop.normalizeProfile({claimed:Array.from({length:20},(_,i)=>i+1),research:sandbox.QBitsWorkshop.RESEARCH.map(item=>item.id)}));
 const g=grid(t,10,1,1,t.V(p.x,p.y+.055,p.z)),id=g.parts[4].id,point=t.poses(g)[4].p;
 t.setLook({camera:[point.x,point.y+.5,point.z],pitch:-Math.PI/2});t.aimQubit();assert(g.partQueryCache);const old=g.partQueryCache;
 assert(t.applyWorkshopUpgrade(id,{sensor:true}));const adapted=t.rotorPart(id).g;assert.notEqual(adapted,g);assert(!adapted.partQueryCache);sameAim(game,2,t.V(0,-1,0));assert.notEqual(adapted.partQueryCache,old);
 const edge=t.poses(adapted).at(-1).p,neighbor=t.addQubit([edge.x+.09,edge.y,edge.z]);
 const joined=t.weld({source:neighbor,target:adapted,position:neighbor.body.position.clone(),quaternion:neighbor.body.quaternion.clone()});assert(joined);sameAim(game,2,t.V(0,-1,0));assert.notEqual(joined.partQueryCache,adapted.partQueryCache);
 t.detachPart(t.rotorPart(id),false);assert.equal(t.rotorPart(id).g.parts.length,1);sameAim(game,2,t.V(0,-1,0));
});

test('virtual rollers synchronize before spatial rejection after their chassis changes pose',()=>{
 const game=setup(),{t}=game;
 assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight'),t.V(2,0,2)));
 const conveyor=t.conveyors[0];assert(conveyor.virtual);const base=conveyor.virtual.baseGroup,roller=conveyor.virtual.records[0].g;
 t.syncVirtualConveyors();const old=roller.body.position.clone(),delta=t.V(-3,.4,-3);base.body.position.vadd(delta,base.body.position);
 const expected=old.vadd(delta);t.setLook({camera:[expected.x,expected.y+.5,expected.z],pitch:-Math.PI/2});sameAim(game,3,t.V(0,-1,0));assert(roller.body.position.distanceTo(expected)<1e-9);
 base.body.position.x+=.2;const held=t.addQubit([expected.x+.2,expected.y+.5,expected.z]);sameLanding(game,held);
});
