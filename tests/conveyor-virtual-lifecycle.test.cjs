const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
function lab(){const game=createGame();game.t.clearNarrativeScene();Object.assign(game.t.story,{ready:false,mode:'playing',scene:'lab',phase:'idle'});return game;}
function belt(t,kind='straight'){assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate(kind),t.V()));return t.conveyors.at(-1);}
function inventory(t){return t.groups.flatMap(g=>g.parts.map(p=>[p.id,p.shape,p.weight,p.mood.energy])).sort((a,b)=>a[0]-b[0]);}
function physicsMass(t){return t.world.bodies.reduce((n,b)=>n+b.mass,0);}
function extend(t,c){const r=t.conveyorBlueprintTemplate('straight'),placement=t.conveyorBlueprintPlacement(r,c),q=t.Q(),before=new Set(t.groups);q.setFromAxisAngle(t.V(0,1,0),placement.quarterTurns*Math.PI/2);const p=placement.point.clone();p.y-=.003;assert(t.spawnSavedMechanism(r,p,q));const next=t.conveyors.at(-1);assert(t.joinCompletedConveyorBlueprint({conveyorLink:c.baseId},t.groups.filter(g=>!before.has(g))));return next;}

test('virtual compilation removes three roller bodies and hinges and is exactly reversible without material or mass duplication',()=>{
 for(const kind of ['straight','left','right']){const {t}=lab(),c=belt(t,kind),parts=inventory(t),mass=parts.reduce((n,p)=>n+p[2]*.25,0),base=t.rotorPart(c.baseId).g;
  assert(c.virtual);assert.equal(c.virtual.records.length,3);assert.equal(t.world.bodies.filter(b=>b.qubitGroup).length,1);assert.equal(t.world.constraints.length,0);assert.equal(physicsMass(t),mass);assert.equal(t.groups.reduce((n,g)=>n+g.body.mass,0),mass);
  const proxies=c.virtual.proxies.map(p=>p.shape);assert(proxies.every(shape=>base.body.shapes.includes(shape)));
  for(let i=0;i<3;i++){assert(t.materializeConveyor(c));assert.equal(t.materializeConveyor(c),false);t.refreshRotors();assert.equal(t.world.bodies.filter(b=>b.qubitGroup).length,4);assert.equal(t.world.constraints.length,3);assert.equal(physicsMass(t),mass);assert(proxies.every(shape=>!base.body.shapes.includes(shape)));assert.deepEqual(inventory(t),parts);assert(t.virtualizeConveyor(c));assert(t.virtualizeConveyor(c));assert.equal(t.world.bodies.filter(b=>b.qubitGroup).length,1);assert.equal(t.world.constraints.length,0);assert.equal(physicsMass(t),mass);}
 }
});

test('materializing one module on a shared chassis preserves neighboring virtual mass and proxies',()=>{
 const {t}=lab(),first=belt(t),second=extend(t,first),before=inventory(t),mass=physicsMass(t),base=t.rotorPart(first.baseId).g,other=second.virtual;
 assert.equal(base,t.rotorPart(second.baseId).g);t.materializeConveyor(first);t.refreshRotors();assert(!first.virtual);assert.equal(second.virtual,other);assert(other.proxies.every(p=>base.body.shapes.includes(p.shape)));assert.equal(t.world.bodies.filter(b=>b.qubitGroup).length,4);assert.equal(t.world.constraints.length,3);assert.equal(physicsMass(t),mass);assert.deepEqual(inventory(t),before);
 assert(t.virtualizeConveyor(first));assert.equal(t.world.bodies.filter(b=>b.qubitGroup).length,1);assert.equal(physicsMass(t),mass);
});

test('ghost rest poses and sleep follow the chassis while visual phase changes only rendered poses',()=>{
 const {t}=lab(),c=belt(t),base=t.rotorPart(c.baseId).g,record=c.virtual.records[0],part=record.g.parts.find(p=>p.shape==='cube'),before=inventory(t);
 base.body.position.set(2,1,-1);base.body.quaternion.setFromEuler(.2,.7,-.4);base.body.sleepState=2;t.syncVirtualConveyors();const rest=t.rotorPart(part.id),a=t.rotorPart(record.rotor.aId),b=t.rotorPart(record.rotor.bId);
 assert(t.couplerTip(a).point.distanceTo(t.couplerTip(b).point)<1e-8);assert.equal(record.g.body.sleepState,2);
 record.rotor.visualPhase=Math.PI/4;const visual=t.virtualConveyorVisualPose(record.g,part);assert(Math.abs(visual.q.w-rest.q.w)>1e-4||Math.abs(visual.q.x-rest.q.x)>1e-4);const after=t.rotorPart(part.id);assert(rest.p.distanceTo(after.p)<1e-10);assert.deepEqual(inventory(t),before);assert(!t.world.bodies.includes(record.g.body));
});

test('adapting an internal roller restores its physical bodies and blocks further virtual compilation',()=>{
 const {t}=lab(),c=belt(t),g=c.virtual.records[0].g,part=g.parts.find(p=>p.shape==='cube'),mass=physicsMass(t),before=inventory(t);
 assert(t.configureGripper(part.id,{mode:'any',capacity:4}));assert(!c.virtual);assert(!g.virtualConveyor);assert.equal(t.world.bodies.filter(b=>b.qubitGroup).length,4);assert.equal(t.world.constraints.length,3);assert.equal(t.virtualizeConveyor(c),false);assert.equal(physicsMass(t),mass);assert.deepEqual(inventory(t),before);
 t.stepPhysics(1/240);assert(!c.virtual,'modified cartridges retain their general physical behavior');
});

test('changing the driven side restores real rollers before custom frames are evaluated',()=>{
 const {t}=lab(),c=belt(t),record=c.virtual.records[0],rotor=record.rotor,moving=rotor.moving,other=moving==='a'?'b':'a',before=inventory(t),mass=physicsMass(t);
 assert(t.configureRotor(rotor,{moving:other}));assert(!c.virtual);assert(!record.g.virtualConveyor);assert.equal(t.world.bodies.filter(b=>b.qubitGroup).length,4);assert.equal(t.world.constraints.length,3);assert.equal(t.virtualizeConveyor(c),false);assert.equal(physicsMass(t),mass);assert.deepEqual(inventory(t),before);
 t.stepPhysics(1/240);assert(!c.virtual,'a custom chassis-driven motor retains independent physical bodies');const afterStep=inventory(t);
 assert(t.configureRotor(rotor,{moving}));assert(t.virtualizeConveyor(c));assert.equal(t.world.bodies.filter(b=>b.qubitGroup).length,1);assert.equal(physicsMass(t),mass);assert.deepEqual(inventory(t),afterStep);
});

test('deleting a virtual roller materializes the module and never leaves transferred mass, ghost constraints or lost remaining pieces',()=>{
 const {t}=lab(),c=belt(t),record=c.virtual.records[0],removed=new Set(record.g.parts.map(p=>p.id)),before=inventory(t),mass=physicsMass(t),removedMass=record.mass;
 t.removeGroup(record.g);t.refreshRotors();t.pruneConveyors();assert(!t.conveyors.includes(c));assert.equal(physicsMass(t),mass-removedMass);assert.deepEqual(inventory(t),before.filter(p=>!removed.has(p[0])));assert(t.groups.every(g=>!g.virtualConveyor));assert(t.world.constraints.every(j=>t.world.bodies.includes(j.bodyA)&&t.world.bodies.includes(j.bodyB)));
});

test('surface validation retains custom installations supported by material outside their required subset',()=>{
 const {t}=lab(),c=belt(t),base=t.rotorPart(c.baseId),motors=t.conveyorRotors(c),rollerGroups=motors.flatMap(r=>t.rotorGroups(r).filter(g=>g!==base.g)),required=new Set([c.baseId,...motors.flatMap(r=>[r.aId,r.bId]),...rollerGroups.flatMap(g=>g.parts.map(p=>p.id))]);
 c.required=[...required];c.ports.exit.p[0]+=.01;t.conveyorRemoveSurfaces(c);
 const subset=c.required.map(id=>t.rotorPart(id)),all=t.groups.flatMap(g=>t.poses(g)),rollers=rollerGroups.flatMap(g=>t.poses(g));
 assert.equal(t.conveyorPortGeometryValid(c.kind,c.ports,base,subset,rollers),false);assert(t.conveyorPortGeometryValid(c.kind,c.ports,base,all,rollers));assert(t.conveyorEnsureSurfaces(c),'full connected material remains the fallback for accepted custom ports');assert(t.virtualizeConveyor(c));
 t.conveyorRemoveSurfaces(c);c.ports.exit.p[0]+=.2;assert.equal(t.conveyorEnsureSurfaces(c),false,'fallback cannot manufacture a platform outside the real machine');assert.equal(c.surfaces.length,0);
});

test('batched joining leaves mass, inertia, broadphase radius and proxy collisions ready immediately',()=>{
 const {t,sandbox}=lab(),first=belt(t),second=extend(t,first),base=t.rotorPart(first.baseId).g,body=base.body,reference=new sandbox.CANNON.Body({mass:body.mass});reference.position.copy(body.position);reference.quaternion.copy(body.quaternion);
 body.shapes.forEach((shape,i)=>reference.addShape(shape,body.shapeOffsets[i],body.shapeOrientations[i]));reference.updateMassProperties();body.computeAABB();reference.computeAABB();
 const near=(a,b)=>assert(Math.abs(a-b)<1e-10,`${a} differs from ${b}`);near(body.mass,inventory(t).reduce((sum,p)=>sum+p[2]*.25,0));near(body.boundingRadius,reference.boundingRadius);
 for(const k of ['x','y','z']){near(body.inertia[k],reference.inertia[k]);near(body.invInertia[k],reference.invInertia[k]);near(body.aabb.lowerBound[k],reference.aabb.lowerBound[k]);near(body.aabb.upperBound[k],reference.aabb.upperBound[k]);}
 const proxy=second.virtual.proxies[0],position=body.pointToWorldFrame(proxy.offset),obstacle=t.addQubit([position.x,position.y,position.z]),a=[],b=[];t.world.broadphase.collisionPairs(t.world,a,b);assert(a.some((candidate,i)=>candidate===body&&b[i]===obstacle.body||candidate===obstacle.body&&b[i]===body),'new proxy geometry participates before another physics step');
});
