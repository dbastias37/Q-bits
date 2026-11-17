const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
function lab(){const game=createGame();game.t.clearNarrativeScene();Object.assign(game.t.story,{ready:false,mode:'playing',scene:'lab',phase:'idle'});return game;}
function belt(t,kind='straight'){assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate(kind),t.V()));return t.conveyors.at(-1);}
function inventory(t){return t.groups.flatMap(g=>g.parts.map(p=>[p.id,p.shape,p.weight,p.mood.energy])).sort((a,b)=>a[0]-b[0]);}
function extend(t,c,kind='straight'){
 const r=t.conveyorBlueprintTemplate(kind),placement=t.conveyorBlueprintPlacement(r,c),q=t.Q();assert(placement);q.setFromAxisAngle(t.V(0,1,0),placement.quarterTurns*Math.PI/2);const before=new Set(t.groups),p=placement.point.clone();p.y-=.003;
 assert(t.spawnSavedMechanism(r,p,q));const next=t.conveyors.at(-1);assert(t.joinCompletedConveyorBlueprint({conveyorLink:c.baseId},t.groups.filter(g=>!before.has(g))));return next;
}
function drawVertices(t,groups=t.groups){let count=0,hidden=0;for(const g of groups){t.drawGroupSolid(g);if(g.rigidCubeBatch){count+=g.rigidCubeBatch.batches.reduce((n,b)=>n+b.count,0);hidden+=g.rigidCubeBatch.hiddenFaceCount;}}return {count,hidden};}

test('conveyor ownership cache persists across simulation steps and invalidates on weld, split and removal',()=>{
 const {t}=lab(),c=belt(t),initial=t.conveyorTopology(c),members=t.conveyorRotors(c),ids=inventory(t);assert(initial.complete);assert.equal(t.conveyorRotors(c),members);
 for(let i=0;i<4;i++)t.stepPhysics(1/240);
 assert.equal(t.conveyorTopology(c),initial);assert.equal(t.conveyorComponentBodies(c),t.conveyorComponentBodies(c));assert.deepEqual(inventory(t).map(p=>p.slice(0,3)),ids.map(p=>p.slice(0,3)));
 const second=extend(t,c),joined=t.conveyorTopology(c);assert.notEqual(joined,initial);assert.equal(joined.base.g,t.conveyorTopology(second).base.g);assert.equal(t.conveyorComponentBodies(c).size,7);
 const roller=t.rotorPart(members[0].bId).g;assert(t.conveyorComponentBodies(c).has(roller.body));t.disconnectRotor(members[0]);assert.equal(t.conveyorComplete(c),false);assert(!t.conveyorComponentBodies(c).has(roller.body));assert(t.conveyorComplete(second));
 const base=joined.base.g;t.removeGroup(base);assert.equal(t.conveyorTopology(c).base,null);assert.equal(t.conveyorComplete(second),false);
});

test('cached membership never caches current roller positions or energy',()=>{
 const {t}=lab(),c=belt(t),r=t.conveyorRotors(c)[0],old=t.rotorPart(r.bId),cache=t.conveyorTopology(c),groups=t.rotorGroups(r);
 t.rotorPart(c.baseId).g.body.position.y+=.2;old.part.mood.energy=.123;
 assert.equal(t.conveyorTopology(c),cache);assert.deepEqual(Array.from(t.rotorGroups(r)),Array.from(groups));assert(Math.abs(t.rotorPart(r.bId).p.y-old.p.y-.2)<1e-10);assert.equal(t.rotorPart(r.bId).part.mood.energy,.123);
});

test('assembled straight and corner conveyors discard only internal faces and retain every original solid and joint',()=>{
 for(const kind of ['straight','left','right']){
  const {t}=lab(),c=belt(t,kind),before=inventory(t),bodies=t.world.bodies.length,constraints=t.world.constraints.length;
  const rendered=drawVertices(t),eligible=t.groups.filter(g=>g.parts.length>=4),full=eligible.flatMap(g=>g.parts).reduce((n,p)=>n+({cube:36,coupler:42,pyramid:18,tetra:12}[p.shape]),0);
  assert(rendered.hidden>0,kind+' must remove closed interior chassis faces');assert(rendered.count<full,kind+' requires fewer triangles');assert.equal((full-rendered.count)%6,0,'only complete square face triangles are omitted in these recipes');
  assert.deepEqual(inventory(t),before);assert.equal(t.world.bodies.length,bodies);assert.equal(t.world.constraints.length,constraints);assert(t.conveyorComplete(c));
 }
});

test('separating a chassis primitive restores all newly exposed faces without changing IDs or material',()=>{
 const {t}=lab(),c=belt(t),base=t.rotorPart(c.baseId).g,parts=inventory(t);t.drawGroupSolid(base);const old=base.rigidCubeBatch;assert(old.hiddenFaceCount>0);
 const cubes=base.parts.filter(p=>p.shape==='cube'),part=cubes.find(p=>t.rigidHiddenFaces(base.parts).has(p));assert(part);
 // The primitive action remains separate from the new module-level action.
 t.detachPart({g:base,part});
 assert.deepEqual(inventory(t),parts);assert.equal(base.rigidCubeBatch,undefined,'old GPU mesh is disposed');
 for(const g of t.groups){t.drawGroupSolid(g);if(g.rigidCubeBatch){const expected=t.rigidHiddenFaces(g.parts).values();assert.equal(g.rigidCubeBatch.hiddenFaceCount,[...expected].reduce((n,set)=>n+set.size,0));}}
});

test('shared-face detection preserves gaps and opposing faces on distinct moving roller bodies',()=>{
 const {t}=lab();function group(gap){return t.makeGroup([[0,0],[1,0],[2,0],[2,1]].map(([x,z])=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(x*(.09+gap),.5,z*(.09+gap)),q:t.Q()})));}
 const closed=group(0);t.drawGroupSolid(closed);assert.equal(closed.rigidCubeBatch.hiddenFaceCount,6);assert.equal(closed.rigidCubeBatch.count,4*36-6*6);
 t.removeGroup(closed);const open=group(.00001);t.drawGroupSolid(open);assert.equal(open.rigidCubeBatch.hiddenFaceCount,0);assert.equal(open.rigidCubeBatch.count,4*36);
 const c=belt(t),r=t.conveyorRotors(c)[0],pair=t.rotorGroups(r);assert.notEqual(pair[0].body,pair[1].body);const before=pair.map(g=>{t.drawGroupSolid(g);return g.rigidCubeBatch?.hiddenFaceCount||0;});pair[1].body.quaternion.setFromEuler(.3,.1,.2);assert.deepEqual(pair.map(g=>{t.drawGroupSolid(g);return g.rigidCubeBatch?.hiddenFaceCount||0;}),before);
});

test('passive roller hand targets require an intact exclusive unmodified stopped module',()=>{
 const {t}=lab(),c=belt(t),list=t.rotorConnectedGroups([t.rotorPart(c.baseId).g]),base=t.rotorPart(c.baseId).g,map=t.passiveConveyorRollers(list);
 assert.equal(map.size,3);assert([...map.values()].every(g=>g===base));assert(!map.has(base));
 const roller=[...map.keys()][0],part=roller.parts.find(p=>p.shape==='cube');part.mood.gripper={capacity:4};assert.equal(t.passiveConveyorRollers(list).size,2);delete part.mood.gripper;
 const rotor=t.conveyorRotors(c)[0];rotor.enabled=true;assert.equal(t.passiveConveyorRollers(list).size,2);rotor.enabled=false;
 c.running=true;assert.equal(t.passiveConveyorRollers(list).size,0);c.running=false;
 assert.equal(t.passiveConveyorRollers(list.filter(g=>g!==base)).size,0);t.disconnectRotor(rotor);assert.equal(t.passiveConveyorRollers(list).size,0);
});
