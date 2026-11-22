const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),createGame=require('./game-harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
const close=(a,b)=>assert(Math.abs(a-b)<1e-10,`${a} != ${b}`);
function lab(){
 let source=fs.readFileSync(path.join(__dirname,'../assets/js/game.js'),'utf8');
 const hook=`window.__batteryGeometryTest={counts:{},reset(){this.counts={};}};`+
  ['corners','touchingUnitFaces','buildExternalBatteryComponents','buildBatteryVisualGeometry'].map(name=>`{const native=${name};${name}=function(...args){const c=window.__batteryGeometryTest.counts;c['${name}']=(c['${name}']||0)+1;return native.apply(this,args);};}`).join('\n');
 const at=source.lastIndexOf('})();');source=source.slice(0,at)+hook+source.slice(at);
 const game=createGame({gameSource:source,graphics:false}),{t,sandbox}=game;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,mode:'playing',scene:'lab',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 return {...game,counter:sandbox.__batteryGeometryTest};
}
function pack(t,count=3,position=t.V(0,.045,0),energy=.5){
 const ids=Array.from({length:count},()=>t.allocateUnitId());
 return t.makeGroup(ids.map((id,i)=>({id,shape:'cube',weight:1,p:position.vadd(t.V(i*.09,0,0)),q:t.Q(),mood:{energy,externalBattery:{version:1,ownerId:id,packId:ids[0],enabled:false}}})));
}
function geometry(packs){return plain(packs.map(p=>({ids:p.parts.map(part=>part.id),p:p.p,q:p.q,size:p.size,fraction:p.fraction,enabled:p.enabled})));}

test('unchanged three-cell packs reuse face components and local visual geometry across all passes',()=>{
 const {t,counter}=lab();for(let i=0;i<32;i++)pack(t,3,t.V((i%8)*.4,.045,Math.floor(i/8)*.2));
 counter.reset();t.rechargeExternalBatteries(1/120);
 assert.equal(counter.counts.buildExternalBatteryComponents,32);assert.equal(counter.counts.touchingUnitFaces,64);
 t.updateBatteryLiquids(1/60);assert.equal(counter.counts.buildBatteryVisualGeometry,32);
 const before=plain(t.saveLab());counter.reset();
 for(const g of t.groups)t.drawGroupSolid(g);t.drawBatteriesTransparent();
 assert.equal(counter.counts.buildBatteryVisualGeometry||0,0);assert.equal(counter.counts.corners||0,0);
 assert.deepEqual(plain(t.saveLab()),before,'drawing never changes saved state');
 counter.reset();t.rechargeExternalBatteries(1/120);
 assert.equal(counter.counts.buildExternalBatteryComponents||0,0);assert.equal(counter.counts.touchingUnitFaces||0,0);
 assert.equal(counter.counts.corners,32,'current support still uses exact world geometry');
});

test('full packs do no adjacency or floor geometry work, and resume charging on the first depleted read',()=>{
 const {t,counter}=lab(),g=pack(t,3,t.V(0,.045,0),1);g.body.sleep();
 const before=plain(t.saveLab());counter.reset();t.rechargeExternalBatteries(1/120);
 assert.equal(counter.counts.buildExternalBatteryComponents||0,0);assert.equal(counter.counts.touchingUnitFaces||0,0);assert.equal(counter.counts.corners||0,0);
 assert.deepEqual(plain(t.saveLab()),before);assert.equal(g.body.sleepState,2);
 g.parts[1].mood.energy=.4;counter.reset();t.rechargeExternalBatteries(9);
 close(g.parts[1].mood.energy,.5);assert.equal(g.parts[0].mood.energy,1);assert.equal(g.parts[2].mood.energy,1);
 assert.equal(counter.counts.touchingUnitFaces,2);assert.equal(g.body.sleepState,2,'queries cannot wake a sleeping body');
});

test('energy, activation and world pose remain live without reconstructing local geometry',()=>{
 const {t,counter}=lab(),g=pack(t),first=t.batteryVisualPacks(g)[0],cache=g.batteryGeometryCache;
 t.externalBatteryPack(g.parts[0].id);counter.reset();
 g.parts[0].mood.energy=0;g.parts[1].mood.energy=.3;g.parts[2].mood.energy=.9;
 assert(t.toggleExternalBattery(g.parts[0].id,true));
 g.body.position.set(1.2,.8,-.4);g.body.quaternion.setFromEuler(.3,.6,.2);
 const moved=t.batteryVisualPacks(g)[0];close(moved.fraction,.4);assert(moved.enabled);
 assert(moved.p.distanceTo(first.p)>.5);assert(moved.q.x!==first.q.x);assert.equal(g.batteryGeometryCache,cache);
 close(t.externalBatterySummary(g).storedJ,2160);
 for(const p of g.parts)p.mood.energy=0;
 assert.equal(t.batteryVisualPacks(g)[0].fraction,0);assert.equal(t.externalBatterySummary(g).storedJ,0);assert(t.externalBatterySummary(g).active);
 assert(t.toggleExternalBattery(g.parts[0].id,false));assert(!t.batteryVisualPacks(g)[0].enabled);assert(!t.externalBatterySummary(g).active);
 assert.equal(counter.counts.buildBatteryVisualGeometry||0,0);assert.equal(counter.counts.buildExternalBatteryComponents||0,0);
});

test('membership, pack identity and invalid adaptations invalidate immediately without joining holes',()=>{
 const {t}=lab(),g=pack(t),middle=g.parts[1],saved={...middle.mood.externalBattery};
 assert.equal(t.batteryVisualPacks(g).length,1);assert.equal(t.externalBatteryPack(g.parts[0].id).parts.length,3);
 delete middle.mood.externalBattery;
 assert.equal(t.batteryVisualPacks(g).length,2);assert.equal(t.externalBatteryPack(g.parts[0].id).parts.length,1);
 middle.mood.externalBattery={...saved,packId:middle.id};assert.equal(t.batteryVisualPacks(g).length,3);
 middle.mood.externalBattery={...saved};assert.equal(t.batteryVisualPacks(g).length,1);
 middle.mood.workshop={invalid:true};assert.equal(t.batteryVisualPacks(g).length,2);assert.equal(t.externalBatteryPack(g.parts[2].id).parts.length,1);
 delete middle.mood.workshop;assert.equal(t.batteryVisualPacks(g).length,1);
 middle.mood.energy=NaN;assert.equal(t.batteryVisualPacks(g).length,2);assert.equal(t.externalBatteryCells(g).length,0,'all cells remain disabled');
 middle.mood.energy=.5;assert.equal(t.batteryVisualPacks(g).length,1);
 for(const p of g.parts)delete p.mood.externalBattery;
 assert.equal(t.batteryVisualPacks(g).length,0);assert.equal(g.batteryGeometryCache,undefined);
});

test('direct local translation, rotation and part replacement rebuild exact geometry',()=>{
 const {t}=lab(),g=pack(t),middle=g.parts[1],original=t.batteryVisualPacks(g)[0];
 t.externalBatteryPack(g.parts[0].id);
 middle.offset.z=.14;
 assert.equal(t.batteryVisualPacks(g).length,3);assert.equal(t.externalBatteryPack(g.parts[0].id).parts.length,1);
 middle.offset.z=0;middle.q.setFromEuler(0,0,Math.PI/4);
 assert.equal(t.batteryVisualPacks(g).length,3,'nonrectangular shape falls back to its individual vessels');
 assert.equal(t.externalBatteryPack(g.parts[0].id).parts.length,1,'a rotated cell cannot supply a nonexistent joined face');
 middle.q.copy(t.Q());assert.deepEqual(geometry(t.batteryVisualPacks(g)),geometry([original]));
 const replacement={...middle,mood:{...middle.mood,energy:.8}};g.parts[1]=replacement;
 const changed=t.batteryVisualPacks(g)[0];assert.equal(changed.parts[1],replacement);close(changed.fraction,.6);
 assert.equal(t.externalBatteryPack(g.parts[0].id).parts[1],replacement);
});

test('an L-shaped pack keeps individual vessels while its exact connected component still recharges',()=>{
 const {t}=lab(),g=pack(t),last=g.parts[2];last.offset.copy(g.parts[1].offset.vadd(t.V(0,0,.09)));
 const visuals=t.batteryVisualPacks(g);assert.equal(visuals.length,3);assert(visuals.every(p=>p.size.x===.09&&p.size.y===.09&&p.size.z===.09));
 assert.equal(t.externalBatteryPack(g.parts[0].id).parts.length,3);
 t.rechargeExternalBatteries(9);for(const p of g.parts)close(p.mood.energy,.6);
});

test('weld, separation, scene replacement and save restoration retain matter and replace owned caches',()=>{
 const {t}=lab(),a=pack(t,2),b=pack(t,1,t.V(.18,.045,0)),ids=[...a.parts,...b.parts].map(p=>p.id);
 b.parts[0].mood.externalBattery.packId=a.parts[0].id;t.batteryVisualPacks(a);t.batteryVisualPacks(b);
 const mass=a.body.mass+b.body.mass;
 const joined=t.weld({source:b,target:a,position:b.body.position.clone(),quaternion:b.body.quaternion.clone()});assert(joined);
 assert.equal(a.batteryGeometryCache,undefined);assert.equal(b.batteryGeometryCache,undefined);assert.equal(t.batteryVisualPacks(joined).length,1);close(joined.body.mass,mass);
 t.detachPart({g:joined,part:joined.parts.find(p=>p.id===ids[0])},false);
 assert.equal(joined.batteryGeometryCache,undefined);
 assert.deepEqual(plain(t.groups.flatMap(g=>g.parts.map(p=>p.id)).sort((a,b)=>a-b)),ids.sort((a,b)=>a-b));
 for(const g of t.groups)t.batteryVisualPacks(g);
 const saved=t.saveLab(),live=[...t.groups];t.clearNarrativeScene();assert(live.every(g=>g.batteryGeometryCache===undefined));
 t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);
 assert(t.groups.every(g=>!live.includes(g)&&g.batteryGeometryCache===undefined));
 assert.deepEqual(plain(t.groups.flatMap(g=>g.parts.map(p=>p.id)).sort((a,b)=>a-b)),ids);
 for(const g of t.groups)for(const pack of t.batteryVisualPacks(g))for(const part of pack.parts)close(part.mood.energy,.5);
});

test('caches retain only the current local structure during repeated mutation and deletion',()=>{
 const {t}=lab(),g=pack(t),middle=g.parts[1],saved={...middle.mood.externalBattery};
 for(let i=0;i<64;i++){
  if(i%2)middle.mood.externalBattery={...saved};else delete middle.mood.externalBattery;
  t.externalBatteryPack(g.parts[0].id);t.batteryVisualPacks(g);
  const cache=g.batteryGeometryCache,count=i%2?3:2;
  assert.equal(cache.cells.length,count);assert.equal(cache.local.length,count);
  assert.equal(cache.components.reduce((n,p)=>n+p.length,0),count);assert.equal(cache.visual.reduce((n,p)=>n+p.parts.length,0),count);
 }
 t.removeGroup(g);assert.equal(g.batteryGeometryCache,undefined);
});
