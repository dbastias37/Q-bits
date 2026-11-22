const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
function setup(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});return {...game,C:sandbox.CANNON};}
const vector=v=>[v.x,v.y,v.z];
function compound(C,count=64){
 const body=new C.Body({mass:1});
 for(let i=0;i<count;i++){
  const shape=i%3===0?new C.Sphere(.042):new C.Box(new C.Vec3(.04,.04,.04)),q=new C.Quaternion();q.setFromEuler(0,i%2*.13,0);
  // Sparse material keeps real gaps, and the two offset compounds touch only
  // near their matching cells, despite their overlapping body bounds.
  body.addShape(shape,new C.Vec3((i%8)*.2,0,Math.floor(i/8)*.2),q);
 }body.position.y=1;return body;
}
function query(game,a,b,native=false,contactPool=[],frictionPool=[]){
 const {t,C}=game,contacts=[],friction=[];
 const fn=native?C.Narrowphase.prototype.getContacts:t.world.narrowphase.getContacts;
 fn.call(t.world.narrowphase,a,b,t.world,contacts,contactPool,friction,frictionPool);
 return {contacts,friction};
}
function snapshot(result){
 return {contacts:result.contacts.map(e=>({b:[e.bi.id,e.bj.id],s:[e.si.id,e.sj.id],ri:vector(e.ri),rj:vector(e.rj),ni:vector(e.ni),restitution:e.restitution,enabled:e.enabled,a:e.a,beta:e.b,eps:e.eps,min:e.minForce,max:e.maxForce})),friction:result.friction.map(e=>({b:[e.bi.id,e.bj.id],ri:vector(e.ri),rj:vector(e.rj),t:vector(e.t),enabled:e.enabled,a:e.a,beta:e.b,eps:e.eps,min:e.minForce,max:e.maxForce}))};
}

test('indexed compound contacts preserve native order, shape materials, friction and equation reuse',()=>{
 const game=setup(),{C,t}=game,a=compound(C),b=compound(C),plane=new C.Body({mass:0});plane.addShape(new C.Plane());plane.quaternion.setFromEuler(-Math.PI/2,0,0);b.position.x=.045;b.position.y=1.007;
 const materials=[new C.Material('body-a'),new C.Material('body-b'),new C.Material('shape-a'),new C.Material('shape-b')];a.material=materials[0];b.material=materials[1];
 t.world.addContactMaterial(new C.ContactMaterial(materials[0],materials[1],{friction:.17,restitution:.23}));t.world.addContactMaterial(new C.ContactMaterial(materials[2],materials[3],{friction:.41,restitution:.37}));a.shapes[0].material=materials[2];b.shapes[0].material=materials[3];
 for(const reverse of [false,true])for(const reduction of [false,true]){
  t.world.narrowphase.enableFrictionReduction=reduction;const first=reverse?[b,plane,a]:[a,plane,b],second=reverse?[a,b,plane]:[b,a,plane];
  const native=query(game,first,second,true),optimized=query(game,first,second);assert(native.contacts.length>100);assert.deepEqual(snapshot(optimized),snapshot(native));
  const oldContacts=optimized.contacts.slice(),oldFriction=optimized.friction.slice(),contactObjects=new Set(oldContacts),frictionObjects=new Set(oldFriction);
  const reused=query(game,first,second,false,oldContacts,oldFriction);assert.deepEqual(snapshot(reused),snapshot(native));assert(reused.contacts.every(e=>contactObjects.has(e)));assert(reused.friction.every(e=>frictionObjects.has(e)));assert.equal(oldContacts.length,0);assert.equal(oldFriction.length,0);
 }
});

test('large sparse compounds avoid the quadratic sphere tests without dropping a native dispatch',()=>{
 const game=setup(),{C,t}=game,a=compound(C,128),b=compound(C,128);b.position.x=.045;
 const originalDistance=C.Vec3.prototype.distanceTo;let distances=0,dispatches=[];
 C.Vec3.prototype.distanceTo=function(...args){distances++;return originalDistance.apply(this,args);};
 for(const key of Object.keys(C.Narrowphase.prototype).filter(k=>/^\d+$/.test(k))){const original=t.world.narrowphase[key];if(typeof original==='function')t.world.narrowphase[key]=function(...args){dispatches.push([key,args[8].id,args[9].id]);return original.apply(this,args);};}
 try{
  const before=query(game,[a],[b],true),nativeDistances=distances,nativeDispatches=dispatches;distances=0;dispatches=[];
  const after=query(game,[a],[b]);assert.deepEqual(snapshot(after),snapshot(before));assert.deepEqual(dispatches,nativeDispatches);assert(distances<nativeDistances/8,`sphere tests should scale with nearby shapes: ${distances} vs ${nativeDistances}`);
 }finally{C.Vec3.prototype.distanceTo=originalDistance;}
});

test('index is rebuilt after body transforms, local offsets, shape orientation, addition and removal',()=>{
 const game=setup(),{C}=game,a=compound(C),b=compound(C);b.position.x=.045;
 const compare=()=>assert.deepEqual(snapshot(query(game,[a],[b])),snapshot(query(game,[a],[b],true)));
 compare();a.position.z+=.013;a.quaternion.setFromEuler(.03,.08,-.02);compare();
 b.shapeOffsets[12].y+=.02;b.shapeOrientations[19].setFromEuler(.3,.4,.2);compare();
 b.addShape(new C.Box(new C.Vec3(.04,.04,.04)),new C.Vec3(.12,0,.12));compare();
 b.shapes.splice(3,1);b.shapeOffsets.splice(3,1);b.shapeOrientations.splice(3,1);compare();
 b.position.set(30,30,30);compare();assert.equal(query(game,[a],[b]).contacts.length,0);
});

function joinedLine(t,n,z){let last=null;for(let i=0;i<n;i++){
 const record=t.conveyorBlueprintTemplate('straight'),q=t.Q();let p=t.V(-2,0,z);
 if(last){const placement=t.conveyorBlueprintPlacement(record,last);p=placement.point.clone();p.y-=.003;q.setFromAxisAngle(t.V(0,1,0),placement.quarterTurns*Math.PI/2);}
 const before=new Set(t.groups);assert(t.spawnSavedMechanism(record,p,q));const next=t.conveyors.at(-1);if(last)assert(t.joinCompletedConveyorBlueprint({conveyorLink:last.baseId},t.groups.filter(g=>!before.has(g))));last=next;
 }return t.rotorPart(last.baseId).g;
}
function simulatedContacts(native){
 const {t,C}=setup();if(native)t.world.narrowphase.getContacts=C.Narrowphase.prototype.getContacts;
 const a=joinedLine(t,6,-1),b=joinedLine(t,6,1);for(let i=0;i<12;i++)t.stepPhysics(1/120);
 const ab=t.physicalGroupBounds(a),bb=t.physicalGroupBounds(b),shift=ab.max.z+.00005-bb.min.z;
 for(const g of t.rotorConnectedGroups([b])){g.body.position.z+=shift;g.body.aabbNeedsUpdate=true;g.body.wakeUp();}a.body.velocity.z=.16;b.body.velocity.z=-.16;
 const frames=[];
 for(let i=0;i<30;i++){
  a.body.force.z+=a.body.mass*6;b.body.force.z-=b.body.mass*6;t.stepPhysics(1/120);
  frames.push({bodies:t.groups.map(g=>[g.body.mass,...vector(g.body.position),...vector(g.body.velocity),...vector(g.body.angularVelocity),g.body.quaternion.x,g.body.quaternion.y,g.body.quaternion.z,g.body.quaternion.w,g.body.sleepState]),contacts:snapshot({contacts:t.world.contacts,friction:t.world.frictionEquations}),rotors:t.serializeRotorState(),belts:t.serializeConveyors(),moods:t.groups.map(g=>g.parts.map(p=>p.mood))});
 }assert(frames.some(f=>f.contacts.contacts.some(e=>e.b[0]!==0&&e.b[1]!==0)),'the real conveyor chassis must physically touch');return JSON.parse(JSON.stringify(frames));
}
test('real joined conveyor collisions retain every state and contact over successive physical steps',()=>{
 assert.deepEqual(simulatedContacts(false),simulatedContacts(true));
});
