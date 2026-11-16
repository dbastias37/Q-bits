// Actual game/Cannon integration with DOM/GPU stubs. These checks do not
// certify the appearance of the liquid in a browser.
const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle',transition:null});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;}
function pack(t,count=3,position=t.V(0,.5,0),fraction=.43){
 const ids=Array.from({length:count},()=>t.allocateUnitId()),g=t.makeGroup(ids.map((id,i)=>({id,shape:'cube',weight:1,p:t.V(position.x+i*.09,position.y,position.z),q:t.Q(),mood:{energy:fraction,name:'Celda '+id,externalBattery:{version:1,ownerId:id,packId:ids[0],enabled:true}}})));return g;
}
function physics(t){return plain(t.groups.map(g=>({ids:g.parts.map(p=>p.id),mass:g.body.mass,inertia:g.body.inertia,p:g.body.position,q:g.body.quaternion,v:g.body.velocity,w:g.body.angularVelocity,force:g.body.force,torque:g.body.torque,mood:g.parts.map(p=>p.mood),weights:g.parts.map(p=>p.weight),shapes:g.body.shapes.length})));}
function draw(t){for(const g of t.groups)t.drawGroupSolid(g);t.drawBatteriesTransparent();}
function debug(t){return plain(t.batteryLiquidDebug());}
function assertLiveCache(t){const live=new Set(t.groups.flatMap(g=>g.parts.map(p=>p.id)));for(const state of t.batteryLiquidDebug()){assert(t.groups.some(g=>g.body.id===state.bodyId));assert(state.partIds.every(id=>live.has(id)));assert(state.normal.every(Number.isFinite));assert(Math.abs(Math.hypot(...state.normal)-1)<1e-6);}}

test('liquid motion and drawing never spend charge, change mass or push the rigid body',()=>{
 const {t,buffers}=lab(),g=pack(t),body=g.body,parts=g.parts,shapes=g.body.shapes.slice();t.updateBatteryLiquids(1/60);draw(t);const allocated=buffers.size;
 for(let i=0;i<36;i++){
  g.body.velocity.set(Math.sin(i*.12)*2,.2,Math.cos(i*.1));g.body.angularVelocity.set(.3,-.5,.2);const q=t.Q();q.setFromEuler(i*.01,.2,-.3);g.body.quaternion.copy(q);
  const before=physics(t);t.updateBatteryLiquids(1/60);draw(t);assert.deepEqual(physics(t),before);
 }
 assert.equal(g.body,body);assert.equal(g.parts,parts);assert.deepEqual(g.body.shapes,shapes);assertLiveCache(t);assert.equal(t.batteryLiquidDebug().length,1);assert.equal(buffers.size,allocated);assert(t.batteryLiquidDebug()[0].meshBuilds>1,'moving liquid reclips its mesh inside the same GPU buffer');
});

test('charge changes update the rendered fraction without inventing a second energy reserve',()=>{
 const {t}=lab(),g=pack(t,3);[.1,.5,.9].forEach((fraction,i)=>g.parts[i].mood.energy=fraction);t.updateBatteryLiquids(1/60);draw(t);assert(Math.abs(t.batteryLiquidDebug()[0].fraction-.5)<1e-12);
 for(const fraction of [0,.15,.99,1]){for(const part of g.parts)part.mood.energy=fraction;const before=physics(t);t.updateBatteryLiquids(1/60);draw(t);assert(Math.abs(t.batteryLiquidDebug()[0].fraction-fraction)<1e-12);assert.deepEqual(physics(t),before);}
});

test('detaching cells, deleting objects and clearing scenes release old liquid state and GPU buffers',()=>{
 const {t,buffers}=lab(),baseline=buffers.size,g=pack(t);t.updateBatteryLiquids(1/60);draw(t);const originalBody=g.body.id;assert.equal(t.batteryLiquidDebug().length,1);
 t.detachPart({g,part:g.parts[0]},false);t.updateBatteryLiquids(1/60);draw(t);assertLiveCache(t);assert(!t.batteryLiquidDebug().some(state=>state.bodyId===originalBody));assert.equal(t.batteryLiquidDebug().length,2);
 for(const current of [...t.groups])t.removeGroup(current);assert.equal(t.batteryLiquidDebug().length,0);assert.equal(buffers.size,baseline,'deleting all battery bodies must release their GPU resources immediately');
 pack(t,2);t.updateBatteryLiquids(1/60);draw(t);assert.equal(t.batteryLiquidDebug().length,1);t.clearNarrativeScene();assert.equal(t.batteryLiquidDebug().length,0);assert.equal(buffers.size,baseline);
});

test('storage and lab restoration preserve exact charge while recreating only live visual state',()=>{
 const {t,buffers}=lab(),baseline=buffers.size,s=t.createShelf({p:t.V(0,.4,-13.996),q:t.Q(),wall:'north'}),g=pack(t,3),ids=g.parts.map(p=>p.id),charges=g.parts.map(p=>p.mood.energy);assert(s);t.updateBatteryLiquids(1/60);draw(t);const oldBody=g.body.id;
 t.setSelected({g,part:g.parts[0]});assert(t.storeShelfSelection(s));assert.equal(t.batteryLiquidDebug().length,0);assert.equal(buffers.size,baseline);const snapshot=t.saveLab();
 t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=snapshot;t.enterLab(false);assert.equal(t.batteryLiquidDebug().length,0);assert(t.withdrawShelf(t.shelves[0]));t.updateBatteryLiquids(1/60);draw(t);assert.equal(t.batteryLiquidDebug().length,1);assert.notEqual(t.batteryLiquidDebug()[0].bodyId,oldBody);assert.deepEqual(ids.map(id=>t.rotorPart(id).part.mood.energy),charges);assertLiveCache(t);
});

test('pause and a hidden tab freeze liquid motion through the actual frame dispatcher',()=>{
 const {t,sandbox}=lab(),g=pack(t,1);t.updateBatteryLiquids(1/60);g.body.velocity.set(3,0,0);t.updateBatteryLiquids(1/60);draw(t);const initial=debug(t),body=physics(t);
 t.story.mode='pause';let time=performance.now()+100;for(let i=0;i<8;i++)t.frame(time+=16.667);assert.deepEqual(debug(t),initial);assert.deepEqual(physics(t),body);
 t.story.mode='playing';sandbox.document.hidden=true;for(let i=0;i<8;i++)t.frame(time+=16.667);assert.deepEqual(debug(t),initial);assert.deepEqual(physics(t),body);
 sandbox.document.hidden=false;t.updateBatteryLiquids(.05,true);assert.deepEqual(debug(t),initial,'explicit paused update does not advance inertia');
});

test('twenty packs among 256 pieces reuse settled meshes and hold a bounded resource count',()=>{
 const {t,buffers}=lab(),baseline=buffers.size;
 for(let i=0;i<20;i++)pack(t,3,t.V((i%5)*.5,.5,Math.floor(i/5)*.5));for(let i=60;i<256;i++)t.addQubit([4+(i%20)*.1,.5,4+Math.floor(i/20)*.1]);
 t.updateBatteryLiquids(1/60);draw(t);assert.equal(t.batteryLiquidDebug().length,20);const initial=debug(t),allocated=buffers.size;
 for(let frame=0;frame<60;frame++){t.updateBatteryLiquids(1/60);draw(t);}
 assert.equal(buffers.size,allocated);assert.equal(t.batteryLiquidDebug().length,20);for(const [index,state]of t.batteryLiquidDebug().entries()){assert.equal(state.meshBuilds,initial[index].meshBuilds);assert.equal(state.uploads,initial[index].uploads);assert.equal(state.buffer,initial[index].buffer);}assertLiveCache(t);
 t.resetBatteryLiquids();assert.equal(t.batteryLiquidDebug().length,0);assert.equal(buffers.size,baseline);
});

test('an actual Cannon drop excites a bounded liquid wave and settles without changing stored energy',()=>{
 const {t}=lab(),g=pack(t,1,t.V(0,1.2,0),.5),tilt=t.Q();tilt.setFromEuler(.08,0,.16);g.body.quaternion.copy(tilt);t.updateBatteryLiquids(1/60);
 let impact=false,falling=false,peakAfterImpact=0,largestTilt=0,lastTilt=0;
 for(let frame=0;frame<360;frame++){
  for(let step=0;step<4;step++)t.stepPhysics(1/240);
  if(g.body.velocity.y<-.8)falling=true;
  if(falling&&t.world.contacts.some(contact=>contact.bi===g.body||contact.bj===g.body))impact=true;
  const before=physics(t);t.updateBatteryLiquids(1/60);assert.deepEqual(physics(t),before,'the visual response cannot feed forces or charge back into Cannon');
  const normal=t.batteryLiquidDebug()[0].normal;lastTilt=Math.atan2(Math.hypot(normal[0],normal[2]),normal[1]);largestTilt=Math.max(largestTilt,lastTilt);if(impact)peakAfterImpact=Math.max(peakAfterImpact,lastTilt);
 }
 assert(falling&&impact,'the original body actually falls and contacts the floor');assert(peakAfterImpact>.005,'the collision produces a visible wave');assert(largestTilt<=12*Math.PI/180+1e-8);assert(lastTilt<.001&&lastTilt<peakAfterImpact*.05,'the wave damps back to horizontal');assert.equal(g.parts[0].mood.energy,.5);assert(t.bounds(g).min.y>-.001&&t.bounds(g).min.y<.01);
});
