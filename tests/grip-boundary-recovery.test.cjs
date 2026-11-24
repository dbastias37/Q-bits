const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

const faces=[
 {name:'ceiling',axis:'y',sign:1,edge:14},
 {name:'east',axis:'x',sign:1,edge:14},
 {name:'west',axis:'x',sign:-1,edge:-14},
 {name:'south',axis:'z',sign:1,edge:14},
 {name:'north',axis:'z',sign:-1,edge:-14},
 {name:'floor',axis:'y',sign:-1,edge:0}
];
function setup(){
 const game=createGame({graphics:false}),{t,sandbox}=game;t.clearNarrativeScene();
 Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;
}
function grab(t,g){t.grabQubit({g,part:g.parts[0],point:g.body.position.clone(),distance:1});assert(t.getHeld());return t.getHeld().items[0];}
function extreme(box,face){return box[face.sign>0?'max':'min'][face.axis];}
function inside(box,face){return face.sign*(extreme(box,face)-face.edge)<=0;}
function target(t,g,face,distance){const p=g.body.position.clone();p[face.axis]+=face.sign*distance;return p;}
function bar(face,tilted){
 const {t}=setup(),along=face.axis==='x'?'z':'x',g=t.makeGroup([-1,0,1].map((n,index)=>{
  const p=t.V(0,1,0);p[along]+=.09*n;return {id:t.allocateUnitId(),shape:'cube',weight:1,p,q:t.Q()};
 }));
 if(tilted)g.body.quaternion.setFromAxisAngle(t.V(...(face.axis==='y'?[0,0,1]:[0,1,0])),.6);
 g.body.position[face.axis]+=face.edge+face.sign*.025-extreme(t.physicalGroupBounds(g),face);g.body.aabbNeedsUpdate=true;
 return {t,g,item:grab(t,g)};
}

test('a held body can retreat fully from a small ceiling or wall overlap, but cannot deepen it',()=>{
 for(const face of faces){
  const {t}=setup(),p=t.V(0,1,0);p[face.axis]=face.edge-face.sign*.02;
  const g=t.addQubit([p.x,p.y,p.z]),item=grab(t,g),before=g.body.position.clone();
  const blocked=t.safeGripSweep(item,target(t,g,face,.2));
  assert(blocked.distanceTo(before)<1e-7,`${face.name}: an outward pull cannot increase existing penetration`);
  const recovered=t.safeGripSweep(item,target(t,g,face,-.2));
  assert(inside(t.physicalGroupBounds(g,recovered,g.body.quaternion),face),`${face.name}: an inward pull reaches a fully clear pose`);
  assert.equal(g.body.position.distanceTo(before),0,'sweep queries do not teleport the physical body');
 }
});

test('boundary recovery permits a reducing rotation and rejects a rotation that increases overlap',()=>{
 for(const face of faces){
  const reducing=bar(face,true),{t,g,item}=reducing,desired=t.Q(),safe=t.safeGripRotation(item,desired);
  assert(inside(t.physicalGroupBounds(g,g.body.position,safe),face),`${face.name}: rotation may reduce overlap until clear`);
  assert(Math.abs(safe.w)>1-1e-8,`${face.name}: the clear requested orientation is reached`);
  const increasing=bar(face,false),turn=increasing.t.Q();turn.setFromAxisAngle(increasing.t.V(...(face.axis==='y'?[0,0,1]:[0,1,0])),.3);
  const blocked=increasing.t.safeGripRotation(increasing.item,turn),before=extreme(increasing.t.physicalGroupBounds(increasing.g),face);
  assert(face.sign*(extreme(increasing.t.physicalGroupBounds(increasing.g,increasing.g.body.position,blocked),face)-before)<=1e-7,`${face.name}: rotation cannot worsen the existing overlap`);
 }
});

test('ordinary grabs still stop at the ceiling, every wall and the floor before crossing from inside',()=>{
 for(const face of faces){
  const {t}=setup(),p=t.V(0,1,0);p[face.axis]=face.edge-face.sign*.06;
  const g=t.addQubit([p.x,p.y,p.z]),item=grab(t,g),safe=t.safeGripSweep(item,target(t,g,face,.3));
  const box=t.physicalGroupBounds(g,safe,g.body.quaternion);
  assert(face.sign*(extreme(box,face)-face.edge)<=.00031,`${face.name}: recovery does not authorize a new boundary crossing`);
 }
});

test('recovering from a corner cannot trade less overlap on one wall for more on another',()=>{
 const {t}=setup(),g=t.addQubit([13.98,1,13.98]),item=grab(t,g);
 const safe=t.safeGripSweep(item,t.V(13.78,1,14.18));
 assert(safe.x<g.body.position.x-.02,'the hand can retreat along the available axis');
 assert(safe.z<=g.body.position.z+1e-7,'the other already intersected wall remains solid');
});

test('a braked four-axis arm recovers from ceiling overlap using its whole held extent',()=>{
 const {t}=setup();assert(t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V(0,2,0)));
 const arm=t.robotArms[0],root=t.rotorPart(arm.baseId).g,component=t.rotorConnectedGroups([root]);
 const top=Math.max(...component.map(g=>t.physicalGroupBounds(g).max.y));
 for(const g of component){g.body.position.y+=14.025-top;g.body.aabbNeedsUpdate=true;}
 const before=component.map(g=>g.body.position.clone()),item=grab(t,root),safe=t.safeGripSweep(item,root.body.position.vadd(t.V(0,-.2,0))),shift=safe.vsub(root.body.position);
 assert.equal(t.getHeld().items.filter(i=>i.joint).length,1);assert.equal(t.robotArmRotors(arm).length,4);
 assert(shift.y<-.025,'the hand can bring the passive links back under the ceiling');
 for(const [i,g]of component.entries()){
  assert(t.physicalGroupBounds(g,g.body.position.vadd(shift),g.body.quaternion).max.y<14,'every link is inside at the accepted translation');
  assert.equal(g.body.position.distanceTo(before[i]),0,'collision query preserves the real articulated bodies');
 }
});
