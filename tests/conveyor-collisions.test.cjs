const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
function setup(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.settings.maxCarry=256;assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight'),t.V()));return game;}
function grab(t,g,part=g.parts[0]){t.grabQubit({g,part,point:g.body.position.clone(),distance:.6});assert(t.getHeld());return t.getHeld().items.find(item=>item.g===g);}
function aimAt(t,target){const held=t.getHeld(),camera=t.V(...t.getLook().camera),dir=t.screenRay(640,360);held.rootOffset=target.vsub(camera.vadd(dir.scale(held.distance)));}

test('placement and hand sweeps include the completed band above its constituent material',()=>{
 const {t}=setup(),c=t.conveyors[0],surface=t.conveyorSurfacePoses(c)[0],top=surface.p.y+surface.half.y,cube=t.addQubit([2,1,2]),inside=t.V(surface.p.x,top+.045-.001,surface.p.z),above=t.V(inside.x,top+.045+.003,inside.z);
 assert(t.groups.filter(g=>g!==cube).every(g=>t.poses(g).every(p=>!t.obbOverlap({p:inside,q:t.Q()},p))),'the sample intersects only the band, not the source cubes or couplers');assert.equal(t.validPose(cube,inside,t.Q()),false);assert.equal(t.validPose(cube,above,t.Q()),true);
 cube.body.position.copy(t.V(inside.x,top+.045+.025,inside.z));const item=grab(t,cube),target=cube.body.position.clone();target.y-=.15;const safe=t.safeGripSweep(item,target);assert(safe.y-.045>=top-.00036,'the hand target must stop at the band rather than entering its thin skin');
});

test('physical bounds transform the band while saved matter stays exactly the original thirty pieces',()=>{
 const {t}=setup(),c=t.conveyors[0],base=t.rotorPart(c.baseId).g,original=t.worldParts(base),skin=t.conveyorGroupSurfaces(base)[0],delta=t.V(.3,.5,-.2),pos=base.body.position.vadd(delta),q=t.Q();q.setFromAxisAngle(t.V(0,0,1),Math.PI/2);const relative=skin.p.vsub(base.body.position),expected=pos.vadd(q.vmult(relative)),moved=t.conveyorGroupSurfaces(base,pos,q)[0];assert(moved.p.distanceTo(expected)<1e-8);const bb=t.physicalGroupBounds(base,pos,q);for(const point of t.corners(moved))for(const key of ['x','y','z'])assert(point[key]>=bb.min[key]-1e-9&&point[key]<=bb.max[key]+1e-9);assert.deepEqual(t.worldParts(base),original);assert.equal(t.groups.reduce((sum,g)=>sum+t.worldParts(g).length,0),30);assert.equal(t.physicalGroupPoses(base).length,base.parts.length+1);
});

test('real held conveyor anchors stop together before the band crosses a thin vertical or horizontal panel',()=>{
 for(const axis of ['x','y']){const {t}=setup(),c=t.conveyors[0],base=t.rotorPart(c.baseId);t.settings.gravity=0;t.world.gravity.set(0,0,0);for(const g of t.groups)g.body.position.y+=.8;
  const surface=t.conveyorSurfacePoses(c)[0],center=surface.p.clone();center[axis]+=surface.half[axis]+.02;const half=axis==='x'?t.V(.002,.5,.025):t.V(.5,.002,.5),wall=t.storyWall(center,half),item=grab(t,base.g,base.part),start=base.g.body.position.clone(),target=start.clone();target[axis]+=.5;
  assert.equal(t.getHeld().items.length,4);const safe=t.safeGripSweep(item,target);assert(safe[axis]-start[axis]<.019);aimAt(t,target);
  for(let i=0;i<180;i++){t.stepPhysics(1/120);assert(t.conveyors.includes(c));assert(!t.conveyorGroupSurfaces(base.g).some(p=>t.obbOverlap(p,{p:wall.p,q:wall.q,half:wall.half},.001)),axis+' skin cannot be pulled through the panel by its other held rollers');}
  assert(base.g.body.position[axis]-start[axis]<.025,axis+' body remains on the starting side');assert(base.g.body.velocity.norm()<.02);t.releaseQubit();
 }
});

for(const kind of ['left','right'])test(`${kind} corner hand movement preserves both legs against a thin panel`,()=>{
 const {t}=setup();for(const g of [...t.groups])t.removeGroup(g);t.pruneConveyors();t.refreshRotors();assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate(kind),t.V()));const c=t.conveyors[0],base=t.rotorPart(c.baseId);t.settings.gravity=0;t.world.gravity.set(0,0,0);for(const g of t.groups)g.body.position.y+=.8;
 const bb=t.physicalGroupBounds(base.g),center=t.V(bb.max.x+.023,(bb.min.y+bb.max.y)/2,(bb.min.z+bb.max.z)/2),wall=t.storyWall(center,t.V(.002,.5,.8)),item=grab(t,base.g,base.part),target=base.g.body.position.vadd(t.V(.5,0,0));
 assert(t.safeGripSweep(item,target).x-base.g.body.position.x<.023);aimAt(t,target);
 for(let i=0;i<180;i++){t.stepPhysics(1/120);assert(!t.physicalGroupPoses(base.g).some(p=>t.obbOverlap(p,{p:wall.p,q:wall.q,half:wall.half},.001)));}assert(base.g.body.velocity.norm()<.03);assert(t.conveyors.includes(c));
});

test('spawning a corner rejects occupied space before allocating temporary bodies or identities',()=>{
 const {t}=setup(),before=t.groups.slice(),ids=t.allocateUnitId(),bodies=t.world.bodies.slice(),joints=t.world.constraints.slice();
 assert.equal(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('left'),t.V()),null);assert.equal(t.allocateUnitId(),ids+1);assert.deepEqual(t.groups,before);assert.deepEqual(t.world.bodies,bodies);assert.deepEqual(t.world.constraints,joints);
});

for(const kind of ['left','right'])test(`${kind} corner creation rejects skin-only overlap and rolls back every temporary controller`,()=>{
 const {t}=setup();for(const g of [...t.groups])t.removeGroup(g);t.pruneConveyors();t.refreshRotors();const record=t.conveyorBlueprintTemplate(kind);assert(t.spawnSavedMechanism(record,t.V()));
 const c=t.conveyors[0],skin=t.conveyorSurfacePoses(c)[0],point=skin.p.vadd(t.V(0,skin.half.y+.045-.001,0));
 assert(t.groups.every(g=>t.poses(g).every(p=>!t.obbOverlap({p:point,q:t.Q()},p))),'obstacle intersects only the completed skin');
 for(const g of [...t.groups])t.removeGroup(g);t.pruneConveyors();t.refreshRotors();const obstacle=t.addQubit([point.x,point.y,point.z]),bodies=t.world.bodies.slice();
 assert.equal(t.spawnSavedMechanism(record,t.V()),null);assert.equal(t.groups.length,1);assert.equal(t.groups[0],obstacle);assert.equal(t.conveyors.length,0);assert.equal(t.rotors.length,0);assert.equal(t.world.constraints.length,0);assert.deepEqual(t.world.bodies,bodies);assert.equal(obstacle.body.shapes.length,1);
});
