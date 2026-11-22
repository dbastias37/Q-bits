const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
function scene(){
 const game=createGame(),{t}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});
 assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight'),t.V()));const conveyor=t.conveyors[0],base=t.rotorPart(conveyor.baseId).g,cube=t.addQubit([3,1,3]);
 return {...game,conveyor,base,cube};
}
function bandPoint(t,c){const surface=t.conveyorSurfacePoses(c)[0];return surface.p.vadd(surface.q.vmult(t.V(0,surface.half.y+.045-.001,0)));}
function proxyOnlyPoint(t,c){
 const base=t.rotorPart(c.baseId).g,material=t.groups.flatMap(g=>t.poses(g)).concat(t.conveyors.flatMap(c=>t.conveyorSurfacePoses(c)));
 for(const proxy of c.virtual.proxies){
  const q=base.body.quaternion.mult(proxy.q),p=base.body.position.vadd(base.body.quaternion.vmult(proxy.offset)),pose={p,q,half:proxy.half};
  for(const a of [-1,1])for(const b of [-1,1])for(const z of [0,.03,-.03]){
   const point=p.vadd(q.vmult(t.V(a*(proxy.half.x+.045-.002),b*(proxy.half.y+.045-.002),z))),cube={p:point,q:t.Q()};
   if(point.y>.045&&t.obbOverlap(cube,pose,.000001)&&material.every(other=>!t.obbOverlap(cube,other,.000001)))return point;
  }
 }assert.fail('fixture needs an envelope-only position outside actual material');
}

test('repeated placements share the destination tree while its exact band keeps blocking',()=>{
 const {t,conveyor,base,cube}=scene(),inside=bandPoint(t,conveyor),entries=t.physicalCollisionParts(base);
 assert.equal(t.validPose(cube,inside,t.Q()),false);const tree=entries.collisionIndex;assert(tree);
 for(let i=0;i<4;i++){assert.equal(t.validPose(cube,inside,t.Q()),false);assert.equal(t.physicalCollisionParts(base),entries);assert.equal(entries.collisionIndex,tree);}
 const above=inside.vadd(t.V(0,.004,0));assert.equal(t.validPose(cube,above,t.Q()),true,'skin remains thin rather than a filled envelope');
});

test('joining and foreign placements never share the relaxed roller-envelope variant',()=>{
 const {t,conveyor,base,cube}=scene(),point=proxyOnlyPoint(t,conveyor),full=t.physicalCollisionParts(base),seam=t.physicalCollisionParts(base,false);
 assert.notEqual(full,seam);assert.equal(full.length-seam.length,conveyor.virtual.proxies.length);
 const joining=new Set([base,cube]);
 for(let i=0;i<3;i++){
  assert.equal(t.validPose(cube,point,t.Q(),[],joining),true,'joining frames may occupy conservative envelope space outside real matter');
  assert.equal(t.validPose(cube,point,t.Q()),false,'an unrelated piece still sees the full swept roller volume');
 }
 assert.equal(t.physicalCollisionParts(base),full);assert.equal(t.physicalCollisionParts(base,false),seam);
 assert(full.collisionIndex&&seam.collisionIndex);assert.notEqual(full.collisionIndex,seam.collisionIndex);
});

test('moving and turning a stopped destination immediately moves its cached skin and removes stale blockers',()=>{
 const {t,conveyor,base,cube}=scene(),oldPoint=bandPoint(t,conveyor),original=t.physicalCollisionParts(base);
 assert.equal(t.validPose(cube,oldPoint,t.Q()),false);
 base.body.position.vadd(t.V(1,.4,.5),base.body.position);base.body.quaternion.setFromAxisAngle(t.V(0,1,0),.47);
 const moved=t.physicalCollisionParts(base);assert.notEqual(moved,original);assert.equal(t.physicalCollisionParts(base),moved);
 assert.equal(t.validPose(cube,oldPoint,t.Q()),true,'the old band position is empty immediately');
 assert.equal(t.validPose(cube,bandPoint(t,conveyor),t.Q()),false,'the transformed band blocks without a physics tick');
 base.parts=base.parts.slice();assert.notEqual(t.physicalCollisionParts(base),moved,'rebuilding material invalidates the exact entries');
});

test('materializing rollers and replacing a skin invalidate both physical variants without leaving phantom surfaces',()=>{
 const {t,conveyor,base,cube}=scene(),inside=bandPoint(t,conveyor),compact=t.physicalCollisionParts(base),seam=t.physicalCollisionParts(base,false),count=conveyor.virtual.proxies.length;
 assert.equal(t.validPose(cube,inside,t.Q()),false);assert(t.materializeConveyor(conveyor));
 const materialized=t.physicalCollisionParts(base);assert.notEqual(materialized,compact);assert.equal(materialized.length,compact.length-count);assert.notEqual(t.physicalCollisionParts(base,false),seam);
 t.conveyorRemoveSurfaces(conveyor);const removed=t.physicalCollisionParts(base);assert.notEqual(removed,materialized);assert.equal(removed.length,t.rigidCollisionParts(base).length);
 assert.equal(t.validPose(cube,inside,t.Q()),true,'removing the real skin also removes its cached collision');
 assert(t.conveyorEnsureSurfaces(conveyor));const rebuilt=t.physicalCollisionParts(base);assert.notEqual(rebuilt,removed);assert.equal(t.validPose(cube,inside,t.Q()),false);
 assert(t.virtualizeConveyor(conveyor));const virtual=t.physicalCollisionParts(base);assert.notEqual(virtual,rebuilt);assert.equal(virtual.length,compact.length);
 assert.equal(t.validPose(cube,proxyOnlyPoint(t,conveyor),t.Q()),false,'new virtual cartridges restore foreign-object envelopes');
});
