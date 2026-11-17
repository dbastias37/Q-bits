const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./benchmark-selection-conveyors.cjs');
const source=fs.readFileSync(path.join(__dirname,'../assets/js/game.js'),'utf8');
function pick(t,base){t.grabQubit({...base,point:base.g.body.position.clone(),distance:1});assert(t.getHeld());const held=t.getHeld();assert.equal(held.items.filter(item=>item.anchorBody).length,1);return held;}
function aim(t,target){const held=t.getHeld();held.rootOffset=target.vsub(t.V(...t.getLook().camera).vadd(t.screenRay(640,360).scale(held.distance)));}
function exactJoints(t){for(const rotor of t.rotors){const a=t.couplerTip(t.rotorPart(rotor.aId)),b=t.couplerTip(t.rotorPart(rotor.bId));assert(a.point.distanceTo(b.point)<.0015,'original physical hinge remains connected');}}
function identities(t){return t.groups.flatMap(g=>g.parts.map(p=>[p.id,p.shape,p.weight])).sort((a,b)=>a[0]-b[0]);}

test('six virtual conveyor modules lift and translate with one hand anchor and the full original mass',()=>{
 const {t,base}=fixture(source,180),before=identities(t),weight=t.rotorConnectedGroups([base.g]).reduce((sum,g)=>sum+g.body.mass,0),initial=base.g.body.position.clone(),held=pick(t,base);assert.equal(held.items.length,19);assert.equal(held.items[0].gripMass,weight);aim(t,initial.vadd(t.V(.25,.35,0)));
 for(let i=0;i<180;i++){t.stepPhysics(1/120);exactJoints(t);}
 assert(base.g.body.position.y>initial.y+.2,'aggregate grip lifts the roller mass too');assert(base.g.body.position.x>initial.x+.15);assert.deepEqual(identities(t),before);t.releaseQubit();assert.equal(t.rotors.length,18,'all original motor identities survive');assert(t.rotors.every(rotor=>rotor.virtualConveyor&&!rotor.constraint),'standard rollers remain virtual after release');assert.equal(t.world.constraints.length,0,'no roller hinge returns to the physical solver');assert(t.groups.every(g=>Number.isFinite(g.body.position.y)));
});

test('passive rollers follow a bounded quarter rotation and stay on the same side of a thin panel',()=>{
 const {t,base}=fixture(source,180);t.settings.gravity=0;t.world.gravity.set(0,0,0);for(const g of t.rotorConnectedGroups([base.g]))g.body.position.y+=1;
 const held=pick(t,base),initial=base.g.body.position.clone(),box=t.physicalGroupBounds(base.g),wall=t.storyWall(t.V(box.max.x+.025,initial.y,initial.z),t.V(.002,2,3));aim(t,initial.vadd(t.V(.4,0,0)));
 for(let i=0;i<60;i++){t.stepPhysics(1/120);exactJoints(t);for(const item of held.items)assert(!t.physicalGroupPoses(item.g).some(p=>t.obbOverlap(p,{p:wall.p,q:wall.q,half:wall.half},.001)));}
 t.keys.add('ShiftLeft');t.keys.add('KeyA');
 for(let i=0;i<60;i++){t.stepPhysics(1/120);exactJoints(t);for(const item of held.items)assert(!t.physicalGroupPoses(item.g).some(p=>t.obbOverlap(p,{p:wall.p,q:wall.q,half:wall.half},.001)));}
 assert(base.g.body.position.x-initial.x<.03);t.keys.clear();t.releaseQubit();
});
