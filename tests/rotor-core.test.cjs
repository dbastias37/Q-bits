const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');
const C = .09;
function setup() {
 const game = createGame(), {t,sandbox} = game;t.clearNarrativeScene();
 Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 return game;
}
function step(t,seconds=1){for(let i=0;i<seconds*240;i++)t.stepPhysics(1/240);}
function near(a,b,eps=1e-8){assert(Math.abs(a-b)<eps,`${a} != ${b}`);}
function pick(t,g,part=g.parts[0]){const point=t.partPose? t.partPose(g,part).p:t.worldParts(g).find(p=>p.id===part.id).p;t.grabQubit({g,part,point,distance:.8});}
function create(t){const r=t.spawnRotor(t.V(0,.35,0));assert(r);return r;}

test('an Enganche is one closed centroid-balanced convex cube with a pointed cap',()=>{
 const {t}=setup(),p=t.unitProfile('coupler');assert.equal(t.normalizeUnitShape('coupler'),'coupler');
 near(Math.max(...p.vertices.map(v=>v.y))-Math.min(...p.vertices.map(v=>v.y)),C*1.5);
 near(t.unitGroundHeight('coupler'),33/56*C);
 let volume=0,centroid=t.V();const edges=new Map();
 for(const [i,face] of p.faces.entries()){
  for(const v of p.vertices)assert(p.faceNormals[i].dot(v.vsub(p.faceCenters[i]))<1e-10);
  for(let j=0;j<face.length;j++){const a=face[j],b=face[(j+1)%face.length],key=[Math.min(a,b),Math.max(a,b)].join(',');edges.set(key,(edges.get(key)||0)+1);}
  for(let j=1;j<face.length-1;j++){const [a,b,c]=[face[0],face[j],face[j+1]].map(k=>p.vertices[k]),v=a.dot(b.cross(c))/6;volume+=v;centroid=centroid.vadd(a.vadd(b).vadd(c).scale(v/4));}
 }
 near(volume,C**3*7/6,1e-12);assert(centroid.scale(1/volume).norm()<1e-10);assert([...edges.values()].every(n=>n===2));
 assert.equal(p.faceKinds.filter(kind=>kind==='square').length,5);
 assert.equal(p.faceKinds.filter(kind=>kind==='coupler-cap').length,4);
 const g=t.addQubit([0,1,0],1,'coupler');assert.equal(g.parts.length,1);assert.equal(g.body.shapes.length,1);
 assert.doesNotThrow(()=>t.drawQubits());
});

test('the normal Shift release joins two tips with a hinge and keeps separate rigid bodies',()=>{
 const {t}=setup(),a=t.addQubit([0,1,0],1,'coupler'),flip=t.Q();flip.setFromAxisAngle(t.V(0,0,1),Math.PI);
 const b=t.makeGroup([{id:t.allocateUnitId(),shape:'coupler',weight:1,p:t.V(.001,1+2*C*51/56+.001,0),q:flip}]);
 pick(t,b);t.keys.add('ShiftLeft');const candidate=t.findSnap();assert(candidate?.rotorTip);
 t.updateTarget();t.releaseQubit(true);
 assert.equal(t.rotors.length,1);assert.equal(t.groups.length,2);assert.equal(t.world.constraints.length,1);
 const r=t.rotors[0];assert.equal(r.enabled,false);assert(r.constraint.motorEquation&&r.constraint.rotationalEquation1);
 assert(t.couplerTip(t.rotorPart(r.aId)).point.distanceTo(t.couplerTip(t.rotorPart(r.bId)).point)<1e-8);
 assert.equal(t.connectRotorTips(r.aId,r.bId),null,'a tip cannot be connected twice');
});

for(const moving of ['a','b'])for(const direction of [1,-1])test(`motor ${moving}/${direction} turns only the chosen side at requested RPM`,()=>{
 const {t}=setup(),r=create(t),pair=t.rotorGroups(r),movingGroup=pair[moving==='a'?0:1],base=pair[moving==='a'?1:0];
 const p=base.body.position.clone(),q=base.body.quaternion.clone();
 assert(t.configureRotor(r,{moving,direction,rpm:30,mount:'fixed',enabled:true}));step(t,2);
 const endpoint=t.rotorPart(moving==='a'?r.aId:r.bId),axis=t.couplerTip(endpoint).axis;
 near(movingGroup.body.angularVelocity.dot(axis),direction*Math.PI,.025);near(base.body.position.distanceTo(p),0);
 near(Math.abs(base.body.quaternion.dot?base.body.quaternion.dot(q):base.body.quaternion.x*q.x+base.body.quaternion.y*q.y+base.body.quaternion.z*q.z+base.body.quaternion.w*q.w),1);
 assert(t.couplerTip(t.rotorPart(r.aId)).point.distanceTo(t.couplerTip(t.rotorPart(r.bId)).point)<.002);
 t.configureRotor(r,{enabled:false});assert.equal(r.constraint.motorEquation.enabled,false);assert.equal(base.body.type,1);
});

test('square-side attachment preserves the rotor link and carries an added rigid load',()=>{
 const {t}=setup(),r=create(t),old=t.rotorGroups(r)[1],endpoint=t.rotorPart(r.bId);
 const local=t.V(C,-5/56*C,0),point=endpoint.p.vadd(endpoint.q.vmult(local));
 const cube=t.makeGroup([{id:t.allocateUnitId(),shape:'cube',weight:1,p:point,q:endpoint.q}]);
 pick(t,cube);t.keys.add('ShiftLeft');const candidate=t.findSnap();assert(candidate&&!candidate.rotorTip);
 t.updateTarget();t.releaseQubit(true);t.refreshRotors();
 const moving=t.rotorGroups(r)[1];assert.notEqual(moving,old);assert.equal(moving.parts.length,2);
 assert.equal(t.rotors.length,1);assert.equal(t.world.constraints.length,1);assert.equal(r.constraint.bodyB,moving.body);
 t.configureRotor(r,{rpm:45,enabled:true});step(t,1);
 assert(t.couplerTip(t.rotorPart(r.aId)).point.distanceTo(t.couplerTip(t.rotorPart(r.bId)).point)<.002);
 assert.equal(t.startRoute(moving,t.V(1,0,1)),false,'a connected mechanism cannot recruit one side into a walking route');
});

test('pickup checks the whole connected weight, stops the motor and carries both sides',()=>{
 const {t}=setup(),r=create(t),pair=t.rotorGroups(r);t.configureRotor(r,{enabled:true});
 t.settings.maxCarry=1;pick(t,pair[0]);assert.equal(t.getHeld(),null);assert.equal(r.enabled,true);
 t.settings.maxCarry=2;pick(t,pair[0]);assert.equal(t.getHeld().items.length,2);assert.equal(t.getHeld().weight,2);assert.equal(r.enabled,false);
 assert.equal(t.configureRotor(r,{enabled:true}),false);assert.equal(t.world.constraints.length,3);
 t.releaseQubit();assert.equal(t.world.constraints.length,1);assert.equal(t.getHeld(),null);
});

test('deleting an endpoint removes its hinge and releases the pinned base before the next physics step',()=>{
 const {t}=setup(),r=create(t);t.configureRotor(r,{enabled:true});const [a,b]=t.rotorGroups(r);
 t.removeGroup(b);assert.equal(t.world.constraints.length,0);assert.equal(a.body.type,1);
 t.refreshRotors();assert.equal(t.rotors.length,0);assert.equal(t.rotorForGroup(a),null);
});

test('ordinary welding cannot close a rigid loop through an existing rotor',()=>{
 const {t}=setup(),r=create(t),[a,b]=t.rotorGroups(r);pick(t,a);t.keys.add('ShiftLeft');
 assert.equal(t.findSnap(),null);t.releaseQubit();
 assert.equal(t.weld({source:a,target:b,position:a.body.position.clone(),quaternion:a.body.quaternion.clone()}),null);
 assert.equal(t.groups.length,2);assert.equal(t.rotors.length,1);
});

test('a shared rigid base permits only one fixed motor at a time',()=>{
 const {t}=setup(),r=create(t),a=t.rotorGroups(r)[0],aPose=t.rotorPart(r.aId),nextId=t.allocateUnitId();
 const parts=t.worldParts(a);parts.push({id:nextId,shape:'coupler',weight:1,p:aPose.p.vadd(t.V(C,0,0)),q:t.Q()});
 t.removeGroup(a);const shared=t.makeGroup(parts);t.refreshRotors();
 const flip=t.Q();flip.setFromAxisAngle(t.V(0,0,1),Math.PI);
 const endpoint=t.makeGroup([{id:t.allocateUnitId(),shape:'coupler',weight:1,p:aPose.p.vadd(t.V(C,2*C*51/56,0)),q:flip}]);
 const second=t.connectRotorTips(nextId,endpoint.parts[0].id);assert(second);assert.equal(t.rotors.length,2);
 t.configureRotor(r,{mount:'fixed',enabled:true});t.configureRotor(second,{mount:'fixed',enabled:true});
 assert.equal(r.enabled,false);assert.equal(second.enabled,true);assert.equal(shared.body.type,4);
 t.disconnectRotor(second);assert.equal(shared.body.type,1);assert.equal(t.rotors.length,1);
});
