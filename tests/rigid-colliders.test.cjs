const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
const near=(a,b,epsilon=1e-8)=>assert(Math.abs(a-b)<epsilon,`${a} != ${b}`);
function lab(){const game=createGame(),{t}=game;t.clearNarrativeScene();t.story.ready=false;t.story.scene='lab';return game;}
function grid(t,x,y,z,center=t.V(0,1,0),turn=t.Q()){const parts=[];for(let iy=0;iy<y;iy++)for(let iz=0;iz<z;iz++)for(let ix=0;ix<x;ix++)parts.push({id:t.allocateUnitId(),shape:'cube',weight:1,p:center.vadd(turn.vmult(t.V((ix-(x-1)/2)*.09,(iy-(y-1)/2)*.09,(iz-(z-1)/2)*.09))),q:turn.clone()});return parts;}
function steps(t,n){for(let i=0;i<n;i++)t.stepPhysics(1/240);}
test('192 aligned cubes share one exact collider while preserving every identity, weight, pose and charge',()=>{
 const {t}=lab(),q=t.Q();q.setFromEuler(.3,.7,.2);const parts=grid(t,8,2,12,t.V(0,2,0),q);for(const [i,p]of parts.entries()){p.weight=1+i%3;p.mood={energy:(i%11)/10};const turn=t.Q();turn.setFromAxisAngle(t.V(0,1,0),(i%4)*Math.PI/2);p.q=p.q.mult(turn);}
 const g=t.makeGroup(parts,q),actual=t.worldParts(g);assert.equal(g.parts.length,192);assert.equal(g.body.shapes.length,1);assert.equal(new Set(g.partShapes.values()).size,1);near(g.body.mass,parts.reduce((n,p)=>n+p.weight,0)*.25);
 near(g.body.shapes[0].volume(),192*.09**3);for(let i=0;i<parts.length;i++){assert.equal(actual[i].id,parts[i].id);assert.equal(actual[i].weight,parts[i].weight);near(actual[i].p.distanceTo(parts[i].p),0);near(actual[i].mood.energy,parts[i].mood.energy);near(Math.abs(actual[i].q.dot?actual[i].q.dot(parts[i].q):['x','y','z','w'].reduce((n,k)=>n+actual[i].q[k]*parts[i].q[k],0)),1);}
});
test('compact colliders preserve an open through-hole and separated material exactly',()=>{
 const {t,sandbox}=lab(),parts=grid(t,3,1,3).filter((p,i)=>i!==4),g=t.makeGroup(parts);assert(g.body.shapes.length<parts.length);assert(g.body.shapes.length>1);near(g.body.shapes.reduce((n,s)=>n+s.volume(),0),8*.09**3);
 const hole=new sandbox.CANNON.RaycastResult(),edge=new sandbox.CANNON.RaycastResult();t.world.raycastClosest(t.V(0,1.2,0),t.V(0,.8,0),{},hole);assert.equal(hole.hasHit,false,'empty central cell remains empty');t.world.raycastClosest(t.V(.09,1.2,0),t.V(.09,.8,0),{},edge);assert.equal(edge.body,g.body);
});
test('misaligned, gapped and differently shaped parts never become a filled rectangular box',()=>{
 for(const mode of ['gap','rotation','pyramid','coupler']){const {t}=lab(),parts=grid(t,2,1,1);if(mode==='gap')parts[1].p.x+=.001;else if(mode==='rotation')parts[1].q.setFromAxisAngle(t.V(0,1,0),Math.PI/4);else parts[1].shape=mode;const g=t.makeGroup(parts);assert.equal(g.body.shapes.length,2,mode);assert.notEqual(g.partShapes.get(parts[0].id),g.partShapes.get(parts[1].id));}
});
test('sensors retain their own collision shape inside a long compact body',()=>{
 const {t,sandbox}=lab(),g=t.makeGroup(grid(t,8,1,1)),parts=t.worldParts(g),sensor=parts[3],W=sandbox.QBitsWorkshop,profile=W.purchase(W.awardCompleted({},{level1:true}).profile,'sensor').profile,plan=W.planPartUpgrade(sensor,{sensor:true},profile);assert(!plan.error,plan.error);Object.assign(sensor,plan.part);t.removeGroup(g);const made=t.makeGroup(parts),shape=made.partShapes.get(sensor.id);
 assert.equal(made.body.shapes.length,3);assert.notEqual(shape,made.partShapes.get(parts[2].id));assert.notEqual(shape,made.partShapes.get(parts[4].id));near(shape.volume(),.09**3);
});
test('removing the middle of a compact bar rebuilds two exact bodies and returns the original unit',()=>{
 const {t}=lab(),g=t.makeGroup(grid(t,7,1,1)),ids=g.parts.map(p=>p.id).sort((a,b)=>a-b),middle=g.parts[3];assert.equal(g.body.shapes.length,1);t.detachPart({g,part:middle});assert.deepEqual(Array.from(t.groups,g=>g.parts.length).sort(),[1,3,3]);assert(t.groups.every(g=>g.body.shapes.length===1));assert.deepEqual(Array.from(t.groups.flatMap(g=>g.parts.map(p=>p.id))).sort((a,b)=>a-b),Array.from(ids));
});
test('a compact plate grips the floor after a push while zero friction still permits sliding',()=>{
 const distance=[];for(const friction of [.38,0]){const {t}=lab();t.world.defaultContactMaterial.friction=friction;const g=t.makeGroup(grid(t,16,1,12,t.V(0,.045,0)));g.body.velocity.x=.3;steps(t,720);distance.push(g.body.position.x);if(friction){assert.equal(g.body.sleepState,2);const p=g.body.position.clone();steps(t,720);near(g.body.position.distanceTo(p),0);assert.equal(g.body.type,1);}}
 assert(distance[0]<.03,`normal floor drift ${distance[0]}`);assert(distance[1]>.5,'friction preference is not replaced by an artificial ground pin');
});
test('an idle arm uses one constraint per hinge, settles completely and does not creep',()=>{
 const {t}=lab();assert(t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V()));const arm=t.robotArms[0];assert.equal(t.world.constraints.length,t.rotors.length);assert(arm.brakes.every(c=>t.rotors.some(r=>r.constraint===c)));steps(t,720);assert(t.groups.every(g=>g.body.sleepState===2));const saved=t.groups.map(g=>({g,p:g.body.position.clone(),q:g.body.quaternion.clone()}));steps(t,1680);for(const {g,p,q}of saved){near(g.body.position.distanceTo(p),0);for(const k of ['x','y','z','w'])near(g.body.quaternion[k],q[k]);assert.equal(g.body.type,1);}
});
test('an impact wake propagates to the whole resting arm without turning on its motors',()=>{
 const {t}=lab();assert(t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V()));steps(t,720);const tip=t.rotorPart(t.robotArms[0].gripperId).g,base=t.rotorPart(t.robotArms[0].baseId).g,p=base.body.position.clone();assert(t.groups.every(g=>g.body.sleepState===2));tip.body.wakeUp();tip.body.velocity.x=1;t.stepPhysics(1/240);assert(t.groups.every(g=>g.body.sleepState!==2),'sleeping parts must not become ground anchors');steps(t,120);assert(base.body.position.distanceTo(p)>.001);assert(t.rotors.every(r=>!r.enabled&&r.pin===null));
});
test('batched shape insertion preserves native Cannon mass, inertia, AABB and bounding radius for mixed convex pieces',()=>{
 const {t,sandbox}=lab(),turn=t.Q();turn.setFromEuler(.2,.3,.1);const parts=Array.from({length:20},(_,i)=>{const q=t.Q();q.setFromEuler(i*.11,i*.17,i*.03);return {id:t.allocateUnitId(),shape:['cube','pyramid','tetra','coupler'][i%4],weight:1+i%3,p:t.V(i%5*.22,1+Math.floor(i/5)*.22,i%3*.19),q};}),g=t.makeGroup(parts,turn),reference=new sandbox.CANNON.Body({mass:g.body.mass});reference.position.copy(g.body.position);reference.quaternion.copy(g.body.quaternion);
 g.body.shapes.forEach((shape,i)=>reference.addShape(shape,g.body.shapeOffsets[i],g.body.shapeOrientations[i]));reference.updateMassProperties();g.body.computeAABB();reference.computeAABB();near(g.body.boundingRadius,reference.boundingRadius);for(const k of ['x','y','z']){near(g.body.inertia[k],reference.inertia[k]);near(g.body.invInertia[k],reference.invInertia[k]);near(g.body.aabb.lowerBound[k],reference.aabb.lowerBound[k]);near(g.body.aabb.upperBound[k],reference.aabb.upperBound[k]);}
});

test('released and restored robot cargo stops on the floor with the normal friction setting',()=>{
 for(const hz of [60,120,240]){
  const {t}=lab(),grip=t.addQubit([0,.145,0]).parts[0];assert(t.configureGripper(grip,{}));
  let cargo=t.newCargo(t.V(),1,1,'#ff0000');
  assert(t.gripperGrab(grip));assert(t.releaseGripper(grip));t.removeGroup(t.rotorPart(grip.id).g);
  for(const restore of [false,true]){
   if(restore){
    const saved=t.saveLab();t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);
    cargo=t.cargos[0];assert(cargo.robotPhysical);
   }
   const start=cargo.body.position.clone();cargo.body.wakeUp();cargo.body.velocity.x=.15;
   for(let i=0;i<3*hz;i++)t.stepPhysics(1/hz);
   assert(Math.hypot(cargo.body.position.x-start.x,cargo.body.position.z-start.z)<.002);
   assert.equal(cargo.body.sleepState,2);assert.equal(cargo.body.type,1);
  }
 }
});

test('a braked mechanism settles after a small lateral nudge at every simulation rate',()=>{
 for(const hz of [60,120,240]){
  const {t}=lab();assert(t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V()));
  const body=t.rotorPart(t.robotArms[0].baseId).g.body;
  for(let i=0;i<2*hz;i++)t.stepPhysics(1/hz);
  const start=body.position.clone();for(const g of t.groups){g.body.wakeUp();g.body.velocity.x=.035;}
  for(let i=0;i<3*hz;i++)t.stepPhysics(1/hz);
  assert(Math.hypot(body.position.x-start.x,body.position.z-start.z)<.009);
  assert.equal(body.sleepState,2);
 }
});

test('a stopped conveyor on legs stays at rest even with alternating floor contacts at 60 Hz',()=>{
 const {t}=lab();assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight',true),t.V()));
 const body=t.rotorPart(t.conveyors[0].baseId).g.body;
 for(let i=0;i<120;i++)t.stepPhysics(1/60);
 body.wakeUp();body.velocity.x=.035;
 for(let i=0;i<180;i++)t.stepPhysics(1/60);
 const atRest=body.position.clone();
 assert.equal(body.sleepState,2);assert.equal(body.type,1);
 for(let i=0;i<360;i++)t.stepPhysics(1/60);
 near(body.position.distanceTo(atRest),0);
});
