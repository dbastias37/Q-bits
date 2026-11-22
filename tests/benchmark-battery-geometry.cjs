// Exact work and retained-object counts; no timing, CPU-% or FPS claims.
// QBITS_REFERENCE_ROOT=/path/to/checkout node tests/benchmark-battery-geometry.cjs
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const referenceRoot=path.resolve(process.env.QBITS_REFERENCE_ROOT||path.join(__dirname,'..'));
const createGame=require(path.join(referenceRoot,'tests/game-harness.cjs'));
const file=process.env.QBITS_GAME_SOURCE||path.join(referenceRoot,'assets/js/game.js');
const original=fs.readFileSync(file,'utf8'),at=original.lastIndexOf('})();');
const names=['externalBatteryGeometry','buildExternalBatteryComponents','buildBatteryVisualGeometry','externalBatteryPackComponents','batteryVisualPacks','corners','touchingUnitFaces'];
const hooks=`window.__batteryAudit={counts:{},reset(){this.counts={};}};`+names.map(name=>
 `if(typeof ${name}==='function'){const native=${name};${name}=function(...args){const c=window.__batteryAudit.counts;c['${name}']=(c['${name}']||0)+1;return native.apply(this,args);};}`).join('\n');
const game=createGame({graphics:false,gameSource:original.slice(0,at)+hooks+original.slice(at)}),{t,sandbox}=game;
t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
for(let i=0;i<32;i++){
 const ids=Array.from({length:3},()=>t.allocateUnitId()),g=t.makeGroup(ids.map((id,j)=>({id,shape:'cube',weight:1,p:t.V((i%8)*.4+j*.09,.045,Math.floor(i/8)*.2),q:t.Q(),mood:{energy:1,externalBattery:{version:1,ownerId:id,packId:ids[0],enabled:false}}})));
}
const reports=[],counter=sandbox.__batteryAudit;
function measure(label,fn){counter.reset();fn();reports.push({label,counts:{...counter.counts}});}
measure('cold-full-recharge',()=>t.rechargeExternalBatteries(1/120));
measure('first-liquid-frame',()=>t.updateBatteryLiquids(1/60));
measure('first-opaque-pass',()=>{for(const g of t.groups)t.drawGroupSolid(g);});
measure('first-transparent-pass',()=>t.drawBatteriesTransparent());
measure('warm-three-passes',()=>{t.updateBatteryLiquids(1/60);for(const g of t.groups)t.drawGroupSolid(g);t.drawBatteriesTransparent();});
for(const g of t.groups)for(const p of g.parts)p.mood.energy=.5;
measure('first-partial-recharge',()=>t.rechargeExternalBatteries(1/120));
measure('warm-partial-recharge',()=>t.rechargeExternalBatteries(1/120));

// Traverse only objects owned by the new cache. Existing pieces, local poses,
// and source arrays are reference boundaries; do not count the whole scene.
const borrowed=new Set();for(const g of t.groups){borrowed.add(g.parts);for(const p of g.parts){borrowed.add(p);borrowed.add(p.offset);borrowed.add(p.q);}}
const seen=new Set();let arrays=0,references=0,borrowedReferences=0,numbers=0;
function visit(value){
 if(!value||typeof value!=='object'||borrowed.has(value)||seen.has(value))return;
 seen.add(value);if(Array.isArray(value))arrays++;
 for(const child of Object.values(value)){
  if(typeof child==='number')numbers++;
  else if(child&&typeof child==='object'){references++;if(borrowed.has(child))borrowedReferences++;else visit(child);}
 }
}
for(const g of t.groups)visit(g.batteryGeometryCache);
const cacheObjects={groups:t.groups.filter(g=>g.batteryGeometryCache).length,objectsIncludingArrays:seen.size,arrays,objectReferenceSlots:references,borrowedReferenceSlots:borrowedReferences,numericSlots:numbers};
const retired=[...t.groups];t.clearNarrativeScene();
console.log(JSON.stringify({sourceSha256:crypto.createHash('sha256').update(original).digest('hex'),node:process.version,scope:'Real game/Cannon with DOM/GPU stubs. Work counters separate from timing. Object counts are not bytes.',fixture:{packs:32,cells:96},reports,cacheObjects,cacheOwnersAfterRemoval:retired.filter(g=>g.batteryGeometryCache).length},null,2));
