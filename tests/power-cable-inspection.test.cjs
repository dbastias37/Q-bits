const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const createGame=require('./game-harness.cjs');

function lab(){
 const source=fs.readFileSync(path.join(__dirname,'../assets/js/game.js'),'utf8');
 const at=source.lastIndexOf('})();');assert(at>=0);
 // Observe the production renderer's world-space lines and network work.
 // Keep executing the real draw functions; only DOM/GPU calls are stubbed.
 const hook=`
  const inspection=window.__powerInspection={lines:[],topologyReads:0};
  const drawInspectionLine=drawWideLines,readInspectionComponent=rotorConnectedGroups;
  drawWideLines=function(points,...rest){
   inspection.lines.push(points.map(p=>[p.x,p.y,p.z]));
   return drawInspectionLine(points,...rest);
  };
  rotorConnectedGroups=function(...args){
   inspection.topologyReads++;
   return readInspectionComponent(...args);
  };
 `;
 const game=createGame({gameSource:source.slice(0,at)+hook+source.slice(at)}),{t,sandbox}=game;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';
 return {...game,inspection:sandbox.__powerInspection};
}

function wiredChassis(t,perSide){
 const r=t.createPowerReservoir(t.V(),{enabled:true,energy:.61});assert(r);
 const corners=[[0,2],[2.88,2],[2.88,4.88],[0,4.88]],parts=[];
 for(let side=0;side<4;side++)for(let i=0;i<perSide;i++){
  const a=corners[side],b=corners[(side+1)%4],fraction=i/perSide;
  parts.push({id:t.allocateUnitId(),shape:'coupler',weight:1,
   p:t.V(a[0]+(b[0]-a[0])*fraction,.3,a[1]+(b[1]-a[1])*fraction),q:t.Q()});
 }
 const base=t.makeGroup(parts),flip=t.Q();flip.setFromAxisAngle(t.V(0,0,1),Math.PI);
 const leaf=t.makeGroup([{id:t.allocateUnitId(),shape:'coupler',weight:1,p:t.V(0,.3+2*.09*51/56,2),q:flip}]);
 assert(t.connectRotorTips(base.parts[0].id,leaf.parts[0].id));
 const material=[t.addQubit([-2,.05,2],1),t.addQubit([-1.8,.05,2],1)];
 assert(t.beginPowerCable(material));t.getPowerDraft().from={kind:'reservoir',id:r.id};
 assert(t.finishPowerCable({kind:'part',id:base.parts[0].id}));t.updatePowerNetwork(1);
 return {base,leaf,cable:t.powerCables[0]};
}

function state(t){
 return JSON.stringify({
  network:t.serializePowerNetwork(),rotors:t.serializeRotorState(),
  groups:t.groups.map(g=>({parts:t.worldParts(g),velocity:g.body.velocity,spin:g.body.angularVelocity})),
  bodies:t.world.bodies.map(body=>body.id),constraints:t.world.constraints.map(constraint=>constraint.id)
 });
}

test('Alt shows only laid cable routes, independent of internal couplers, without changing the powered assembly',()=>{
 for(const perSide of [1,32]){
  const {t,inspection}=lab(),{base,leaf,cable}=wiredChassis(t,perSide);
  const draw=()=>{inspection.lines.length=0;inspection.topologyReads=0;t.drawPowerCables();};
  const expected=()=>{
   const route=Array.from(t.powerCablePath(cable),p=>[p.x,p.y,p.z]),segments=[];
   for(let i=1;i<route.length;i++)segments.push(route[i-1],route[i]);
   return [segments];
  };
  const before=state(t);
  draw();assert.equal(inspection.lines.length,0,'normal view has no inspection overlay');
  t.keys.add('AltLeft');
  for(let i=0;i<3;i++){
   draw();
   assert.deepEqual(JSON.parse(JSON.stringify(inspection.lines)),expected(),
    'Alt must not draw spokes from the hollow chassis centre or implicit rotor links');
   assert.equal(inspection.topologyReads,0,'drawing a cable must not expand its mechanical network');
  }
  assert.equal(state(t),before,'drawing preserves charge, matter, identities, poses and constraints');
  const oldEnd=expected()[0].at(-1);
  base.body.position.x+=.15;leaf.body.position.x+=.15;
  const moved=state(t);draw();
  assert.deepEqual(JSON.parse(JSON.stringify(inspection.lines)),expected(),'highlight follows the actual moving port');
  assert.notDeepEqual(expected()[0].at(-1),oldEnd);
  assert.equal(state(t),moved);
  t.keys.delete('AltLeft');draw();assert.equal(inspection.lines.length,0);
 }
});
