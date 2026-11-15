const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const C=.09;
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.settings.maxCarry=128;return game;}
function pick(t,g,part=g.parts[0]){t.grabQubit({g,part,point:t.worldParts(g).find(p=>p.id===part.id).p,distance:.8});t.keys.add('ShiftLeft');}
function bar(t){return t.makeGroup(Array.from({length:7},(_,i)=>[-.5,.5].map(z=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V((i-3)*C,.3,z*C),q:t.Q()}))).flat());}
function rotorAt(t,x,side,noise=true){
 const axis=t.V(0,0,side),q=t.Q();q.setFromVectors(t.V(0,1,0),axis);q.normalize();const flip=t.Q();flip.setFromAxisAngle(t.V(1,0,0),Math.PI);
 const center=t.V(x,.3,side*C*1.5),p=center.vadd(axis.scale(C*5/56));
 const a=t.makeGroup([{id:t.allocateUnitId(),shape:'coupler',weight:1,p,q}]);
 const b=t.makeGroup([{id:t.allocateUnitId(),shape:'coupler',weight:1,p:p.vadd(axis.scale(2*C*51/56)),q:q.mult(flip)}]);
 const r=t.connectRotorTips(a.parts[0].id,b.parts[0].id,{capacity:64,maxTorque:4});assert(r);
 if(noise){const turn=t.Q();turn.setFromAxisAngle(t.V(0,1,0),.035);for(const g of [a,b]){g.body.position.copy(p.vadd(turn.vmult(g.body.position.vsub(p))).vadd(t.V(.006,.003,side*.008)));g.body.quaternion.copy(turn.mult(g.body.quaternion));}}
 return r;
}
function mount(t,r){const a=t.rotorPart(r.aId);pick(t,a.g,a.part);assert.equal(t.getHeld().items.length,2);const snap=t.findSnap();assert(snap,'a complete held rotor must offer a square-face snap');assert(!snap.rotorTip);t.updateTarget();t.releaseQubit(true);assert.equal(t.getHeld(),null);return t.rotorPart(r.aId).g;}
function gap(t,r){return t.couplerTip(t.rotorPart(r.aId)).point.distanceTo(t.couplerTip(t.rotorPart(r.bId)).point);}
function chassis(t){let body=bar(t);const rotors=[];for(const [x,side]of [[-.27,1],[.27,1],[-.27,-1],[.27,-1]]){const r=rotorAt(t,x,side);body=mount(t,r);rotors.push(r);assert.equal(body.parts.length,14+rotors.length);assert.equal(t.rotors.length,rotors.length);for(const joint of rotors)assert(gap(t,joint)<1e-7,'all tips must survive each new mounting');}return {body,rotors};}

test('Shift mounting accepts four complete rotors on one ingot without merging their moving halves',()=>{
 const {t}=lab(),{body,rotors}=chassis(t);assert.equal(t.groups.length,5);assert.equal(t.world.constraints.length,4);
 assert(rotors.every(r=>t.rotorPart(r.aId).g===body&&t.rotorPart(r.bId).g!==body));
 const ids=t.groups.flatMap(g=>g.parts.map(p=>p.id));assert.equal(new Set(ids).size,22);
 const saved=t.saveMechanism(rotors[0]);assert(saved);assert.equal(saved.groups.length,5);assert.equal(saved.joints.length,4);
 const copy=t.spawnSavedMechanism(saved,t.V(2,0,0));assert(copy);assert.equal(t.rotors.length,8);assert.equal(t.groups.length,10);
 for(const r of t.rotors)assert(gap(t,r)<.002);
 const snapshot=t.saveLab();t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=snapshot;t.enterLab(false);assert.equal(t.rotors.length,8);assert.equal(t.groups.length,10);
});

test('four assembled wheels keep independent axes and drive the common chassis',()=>{
 const {t}=lab(),{rotors}=chassis(t);
 for(const r of rotors){const endpoint=t.rotorPart(r.bId),axis=t.couplerTip(endpoint).axis,center=endpoint.p.vsub(axis.scale(C*5/56));
  for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
   const p=center.vadd(t.V(dx*C,dy*C,0)),cube=t.addQubit([p.x,p.y,p.z],1,'cube');pick(t,cube);assert(t.findSnap(),'wheel pieces snap to their chosen rotor');t.updateTarget();t.releaseQubit(true);
  }
  assert.equal(t.rotorPart(r.bId).g.parts.length,5);
 }
 const members=t.rotorConnectedGroups(t.rotorGroups(rotors[0])),floor=Math.min(...members.map(g=>t.bounds(g).min.y));for(const g of members){g.body.position.y-=floor-.002;g.body.aabbNeedsUpdate=true;}
 const body=t.rotorPart(rotors[0].aId).g,start=body.body.position.clone();let angle=rotors.map(()=>0),maxGap=0,minY=0;
 for(const r of rotors){const side=Math.sign(t.rotorPart(r.aId).p.z);assert(t.configureRotor(r,{direction:side,enabled:true}));}
 assert(rotors.every(r=>r.enabled),'starting the fourth wheel must leave the other three powered');
 for(let i=0;i<360;i++){t.stepPhysics(1/240);for(const [j,r]of rotors.entries()){angle[j]+=Math.abs(r.actualRpm||0)*2*Math.PI/60/240;maxGap=Math.max(maxGap,gap(t,r));}minY=Math.min(minY,...members.map(g=>t.bounds(g).min.y));}
 assert(angle.every(a=>a>1),'all four wheels physically turn: '+angle);
 assert(Math.hypot(body.body.position.x-start.x,body.body.position.z-start.z)>.025,'wheel contact propels the chassis');
 assert(maxGap<.003,'shared chassis must not tear its four axles: '+maxGap);assert(minY>-.003,'chassis stays above floor: '+minY);
 assert(rotors.every(r=>r.power.inputWatts>0));
});

test('a snap moves every hinge of a held chassis when attaching an extra rigid piece',()=>{
 const {t}=lab(),{body,rotors}=chassis(t),piece=t.addQubit([0,.3+C+.008,.045],1,'cube');pick(t,body,body.parts.find(p=>p.shape==='cube'&&Math.abs(t.worldParts(body).find(v=>v.id===p.id).p.x)<1e-8&&t.worldParts(body).find(v=>v.id===p.id).p.z>0));
 assert.equal(t.getHeld().items.length,5);assert(t.findSnap());t.updateTarget();t.releaseQubit(true);assert.equal(t.rotors.length,4);assert.equal(t.groups.length,5);assert(!t.groups.includes(piece));
 for(const r of rotors)assert(gap(t,r)<1e-7);
});

test('an obstacle at the other half rejects the whole placement without moving any part',()=>{
 const {t}=lab();bar(t);const r=rotorAt(t,-.27,1,false),a=t.rotorPart(r.aId),b=t.rotorPart(r.bId);
 // Root has space at its exact mount, but the other half would hit this cube.
 t.addQubit([b.p.x,b.p.y,b.p.z],1,'cube');const before=t.rotorGroups(r).map(g=>t.worldParts(g));
 pick(t,a.g,a.part);assert(!t.weld({source:a.g,target:t.groups[0],position:a.g.body.position.clone(),quaternion:a.g.body.quaternion.clone()}),'the obstructed placement cannot be committed');
 assert.deepEqual(t.rotorGroups(r).map(g=>t.worldParts(g).map(p=>[p.id,p.p.x,p.p.y,p.p.z,p.q.x,p.q.y,p.q.z,p.q.w])),before.map(parts=>parts.map(p=>[p.id,p.p.x,p.p.y,p.p.z,p.q.x,p.q.y,p.q.z,p.q.w])));assert.equal(t.rotors.length,1);t.releaseQubit(true);
});

test('unrelated held selections and rigid loops remain ineligible for mechanism snapping',()=>{
 const {t}=lab();bar(t);const r=rotorAt(t,-.27,1),a=t.rotorPart(r.aId);pick(t,a.g,a.part);const held=t.getHeld(),extra=t.addQubit([2,.3,0]);held.items.push({g:extra});assert(!t.findSnap(),"placement must be rejected");held.items.pop();
 const b=t.rotorPart(r.bId);assert.equal(t.weld({source:a.g,target:b.g,position:a.g.body.position.clone(),quaternion:a.g.body.quaternion.clone()}),null);assert.equal(t.rotors.length,1);t.releaseQubit();
});

test('magnetic preview guides both held halves together before releasing Shift',()=>{
 const {t}=lab();t.world.gravity.set(0,0,0);t.settings.gravity=0;bar(t);const r=rotorAt(t,-.27,1),a=t.rotorPart(r.aId);pick(t,a.g,a.part);let largestGap=0;
 for(let i=0;i<30;i++){t.updateTarget();assert(t.findSnap(),'alignment remains available during preview');t.stepPhysics(1/240);largestGap=Math.max(largestGap,gap(t,r));}
 assert(largestGap<.002,'preview cannot pull only one end of a rotor');t.updateTarget();t.releaseQubit(true);assert.equal(t.rotorPart(r.aId).g.parts.length,15);assert(gap(t,r)<.002);
});

test('a rejected tip connection restores every body of the moving mechanism',()=>{
 const {t}=lab(),r=rotorAt(t,0,1,false),a=t.rotorPart(r.aId),b=t.rotorPart(r.bId),other=t.addQubit([1,1,1],1,'coupler');
 const before=[a.g,b.g].map(g=>[...Object.values(g.body.position),...Object.values(g.body.quaternion)]);
 const result=t.weld({source:a.g,target:other,position:a.g.body.position.vadd(t.V(.01,.01,0)),quaternion:a.g.body.quaternion.clone(),rotorTip:true,aId:r.aId,bId:other.parts[0].id});
 assert(!result,'occupied mechanical tip cannot be connected again');assert.deepEqual([a.g,b.g].map(g=>[...Object.values(g.body.position),...Object.values(g.body.quaternion)]),before);assert.equal(t.rotors.length,1);assert(gap(t,r)<1e-7);
});
