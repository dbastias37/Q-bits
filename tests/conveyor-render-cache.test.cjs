const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
function scene(kind='straight'){const game=createGame(),{t}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:false,scene:'lab',mode:'playing',phase:'idle'});assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate(kind),t.V()));return {...game,c:t.conveyors[0]};}
const vector=(a,b)=>assert(a.distanceTo(b)<1e-9,`${a} != ${b}`);
function colliderMatch(t,c){for(const pose of t.conveyorSurfacePoses(c)){const i=c.surfaceBody.shapes.indexOf(pose.surface.shape);assert(i>=0);vector(pose.p,c.surfaceBody.pointToWorldFrame(c.surfaceBody.shapeOffsets[i]));const rotation=c.surfaceBody.quaternion.mult(c.surfaceBody.shapeOrientations[i]);for(const axis of [t.V(1,0,0),t.V(0,1,0),t.V(0,0,1)])vector(pose.q.vmult(axis),rotation.vmult(axis));vector(pose.half,pose.surface.shape.halfExtents);vector(pose.up,pose.q.vmult(t.V(0,1,0)));vector(pose.inverse.vmult(pose.up),t.V(0,1,0));}}

test('straight and both corner skins cache their exact collider frames without changing physical material',()=>{
 for(const kind of ['straight','left','right']){const {t,c}=scene(kind),before=JSON.stringify(t.saveLab()),surfaces=t.conveyorSurfacePoses(c),path=t.conveyorPathPoses(c);assert.equal(surfaces.length,kind==='straight'?1:2);for(let i=0;i<50;i++){assert.equal(t.conveyorSurfacePoses(c),surfaces);assert.equal(t.conveyorPathPoses(c),path);}colliderMatch(t,c);assert.equal(JSON.stringify(t.saveLab()),before);}
});

test('translation and rotation invalidate immediately, including outside the physics loop',()=>{
 const {t,c}=scene('left'),base=t.rotorPart(c.baseId).g,first=t.conveyorSurfacePoses(c);base.body.position.x+=.7;base.body.quaternion.setFromEuler(.13,.72,-.08);const second=t.conveyorSurfacePoses(c);assert.notEqual(first,second);colliderMatch(t,c);assert.equal(t.conveyorSurfacePoses(c),second);
 base.parts.find(p=>p.id===c.baseId).q.setFromEuler(0,.1,0);assert.notEqual(t.conveyorSurfacePoses(c),second,'local base reference also invalidates the cache');
});

test('skin removal and rebuilding release stale frames and preserve part count',()=>{
 const {t,c}=scene(),base=t.rotorPart(c.baseId),count=base.g.parts.length,old=t.conveyorSurfacePoses(c);t.conveyorRemoveSurfaces(c);assert.equal(c.worldGeometry,null);assert.equal(t.conveyorSurfacePoses(c).length,0);assert(t.conveyorEnsureSurfaces(c));const fresh=t.conveyorSurfacePoses(c);assert.notEqual(fresh,old);assert.notEqual(fresh[0].surface.shape,old[0].surface.shape);assert.equal(base.g.parts.length,count);colliderMatch(t,c);
});

test('welding rebuilds the skin against the new chassis instead of retaining the removed body',()=>{
 const {t,c}=scene(),old=t.conveyorSurfacePoses(c),base=t.rotorPart(c.baseId),p=base.p.clone();p.y+=.09;const g=t.makeGroup([{id:t.allocateUnitId(),shape:'cube',weight:1,p,q:base.q.clone()}]);assert(t.weld({source:g,target:base.g,position:g.body.position.clone(),quaternion:g.body.quaternion.clone()}));assert(t.conveyorEnsureSurfaces(c));const next=t.conveyorSurfacePoses(c);assert.notEqual(next,old);assert.equal(c.worldGeometry.body,t.rotorPart(c.baseId).g.body);assert.notEqual(c.worldGeometry.body,base.g.body);colliderMatch(t,c);
});
