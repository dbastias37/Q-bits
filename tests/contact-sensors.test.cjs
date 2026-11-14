const test=require('node:test');
const assert=require('node:assert/strict');
const contacts=require('../assets/js/contact-sensors.js');
const createGame=require('./game-harness.cjs');
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle',progress:{level1:true}});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.world.defaultContactMaterial.friction=0;t.world.defaultContactMaterial.restitution=0;return game;}
function fit(game,g){const {t,sandbox}=game,W=sandbox.QBitsWorkshop,p=g.parts[0],profile=W.purchase(W.awardCompleted({},t.story.progress).profile,'sensor').profile;const plan=W.planPartUpgrade(p,{sensor:true},profile);assert(!plan.error,plan.error);Object.assign(p,plan.part);return p.id;}
function wall(game,x=.12){const {t,sandbox}=game,body=new sandbox.CANNON.Body({mass:0,shape:new sandbox.CANNON.Box(t.V(.04,.3,.4)),position:t.V(x,.3,0)});t.world.addBody(body);return body;}
function steps(t,n=30,push=[]){for(let i=0;i<n;i++){for(const g of push){g.body.wakeUp();g.body.aabbNeedsUpdate=true;g.body.velocity.x=.7;}t.stepPhysics(1/240);}}
function fixture(){const game=lab(),{t}=game,g=t.addQubit([0,.046,0]),id=fit(game,g),r=t.spawnRotor(t.V(1.2,.3,0),{mount:'fixed'});g.body.fixedRotation=true;g.body.updateMassProperties();assert(t.linkContactSensor(id,r));assert(t.configureRotor(r,{enabled:true}));wall(game);return {...game,g,id,r};}

test('contact edge debounces short clear gaps and freezes its clock while paused',()=>{
 let state=contacts.create(),next=contacts.step(state,true,.01);assert(next.fire);state=next.state;
 for(let i=0;i<100;i++){next=contacts.step(state,true,.01);assert(!next.fire);state=next.state;}
 state=contacts.step(state,false,.04).state;assert(!contacts.step(state,true,.01).fire);
 const paused=contacts.step(state,false,100,true);assert.equal(paused.state,state);assert(!paused.fire);
 state=contacts.step(state,false,.04).state;assert.equal(state.latched,false);assert(contacts.step(state,true,.01).fire);
 assert(!contacts.step(state,true,NaN).fire);assert(!contacts.step(state,true,0).fire);
});
test('a real wall contact reverses the chosen physical rotor once until full separation',()=>{
 const {t,g,id,r}=fixture();steps(t,80,[g]);assert.equal(r.sensorPulses,1);assert.equal(r.direction,-1);assert(t.sensorContactActive(t.rotorPart(id)));
 const motorSign=Math.sign(r.constraint.motorEquation.targetVelocity);assert.notEqual(motorSign,0);
 steps(t,120,[g]);assert.equal(r.sensorPulses,1,'persistent contact cannot chatter');assert.equal(Math.sign(r.constraint.motorEquation.targetVelocity),motorSign);
 g.body.position.x=-.2;g.body.velocity.set(0,0,0);steps(t,30);assert.equal(t.contactStates.get(id).latched,false);
 g.body.position.x=.036;steps(t,60,[g]);assert.equal(r.sensorPulses,2);assert.equal(r.direction,1);assert.equal(Math.sign(r.constraint.motorEquation.targetVelocity),-motorSign);
});
test('two staggered tips on one rotor form one contact and rearm only when every tip clears',()=>{
 const game=fixture(),{t,g,r}=game,second=t.addQubit([-.006,.046,.13]),id=fit(game,second);second.body.fixedRotation=true;second.body.updateMassProperties();assert(t.linkContactSensor(id,r));
 steps(t,80,[g,second]);assert.equal(r.sensorPulses,1);assert.equal(r.direction,-1);
 g.body.position.x=-.2;g.body.velocity.set(0,0,0);steps(t,30,[second]);g.body.position.x=.036;steps(t,40,[g,second]);assert.equal(r.sensorPulses,1,'one tip clearing does not rearm an occupied rotor');
 for(const body of [g,second]){body.body.position.x=-.2;body.body.velocity.set(0,0,0);}steps(t,30);second.body.position.x=.036;steps(t,50,[second]);assert.equal(r.sensorPulses,2);
});
test('floor, back face and a neighboring welded cube are not the active sensor tip',()=>{
 const game=lab(),{t}=game,g=t.addQubit([0,.046,0]),id=fit(game,g),r=t.spawnRotor(t.V(1.2,.3,0),{mount:'fixed'});assert(t.linkContactSensor(id,r));t.configureRotor(r,{enabled:true});steps(t,100);assert.equal(r.sensorPulses,undefined);assert(!t.sensorContactActive(t.rotorPart(id)));
 const back=wall(game,-.12);for(let i=0;i<80;i++){g.body.wakeUp();g.body.velocity.x=-.7;t.stepPhysics(1/240);}assert.equal(r.sensorPulses,undefined);t.world.removeBody(back);
 t.removeGroup(g);const compound=t.makeGroup([{id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(0,.046,0),q:t.Q()},{id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(.09,.046,0),q:t.Q()}]),compoundId=fit(game,compound);compound.body.fixedRotation=true;compound.body.updateMassProperties();assert(t.linkContactSensor(compoundId,r));wall(game,.21);steps(t,100,[compound]);assert(t.world.contacts.some(c=>c.bi===compound.body||c.bj===compound.body));assert(!t.sensorContactActive(t.rotorPart(compoundId)));assert.equal(r.sensorPulses,undefined,'ordinary adjacent shape cannot trigger the sensor');
});
test('pause and hidden state cannot consume a contact or rearm its latch',()=>{
 const {t,sandbox,g,id,r}=fixture();steps(t,70,[g]);assert.equal(r.sensorPulses,1);
 t.story.mode='pause';g.body.position.x=-.2;g.body.velocity.set(0,0,0);steps(t,50);assert.equal(t.contactStates.get(id).latched,true);
 t.story.mode='playing';g.body.position.x=.036;steps(t,30,[g]);assert.equal(r.sensorPulses,1);
 sandbox.document.hidden=true;g.body.position.x=-.2;steps(t,50);assert.equal(t.contactStates.get(id).latched,true);sandbox.document.hidden=false;
});
test('unlinking or deleting either endpoint is safe even when drawing before physics resumes',()=>{
 const {t,g,id,r}=fixture();assert(t.unlinkContactSensor(id));steps(t,80,[g]);assert.equal(r.sensorPulses,undefined);assert(t.linkContactSensor(id,r));
 t.removeGroup(t.rotorPart(r.aId).g);assert.doesNotThrow(()=>t.drawWorkshop());assert.doesNotThrow(()=>t.tickContactSensors(.02));assert.equal(t.rotorPart(id).part.mood.sensorLink,undefined);
 t.removeGroup(g);assert.doesNotThrow(()=>t.tickContactSensors(.02));assert(!t.contactStates.has(id));t.clearNarrativeScene();assert.equal(t.contactStates.size,0);
});

test('triangular existing pieces use their real convex face as the contact sensor',()=>{
 for(const shape of ['tetra','pyramid']){const game=lab(),{t}=game,g=t.addQubit([0,.2,0],1,shape),id=fit(game,g),r=t.spawnRotor(t.V(1.2,.3,0),{mount:'fixed'});g.body.fixedRotation=true;g.body.updateMassProperties();t.world.gravity.set(0,0,0);wall(game);assert(t.linkContactSensor(id,r));assert(t.configureRotor(r,{enabled:true}));steps(t,80,[g]);assert.equal(r.sensorPulses,1,shape);assert.equal(r.direction,-1);assert.equal(t.rotorPart(id).part.shape,shape);assert.doesNotThrow(()=>t.drawWorkshop());}
});
test('a sensor reverses real relative rotation of a linked rolling axle while keeping its hinge closed',()=>{
 const {t,g,r}=fixture();t.configureRotor(r,{enabled:false,mount:'wheel'});const turn=t.Q();turn.setFromAxisAngle(t.V(0,0,1),Math.PI/2);const pivot=t.couplerTip(t.rotorPart(r.aId)).point;
 for(const body of t.rotorGroups(r)){body.body.position.copy(pivot.vadd(turn.vmult(body.body.position.vsub(pivot))));body.body.quaternion.copy(turn.mult(body.body.quaternion));}
 const low=Math.min(...t.rotorGroups(r).map(body=>t.bounds(body).min.y));for(const body of t.rotorGroups(r)){body.body.position.y-=low-.002;body.body.aabbNeedsUpdate=true;}t.configureRotor(r,{enabled:true});
 function angle(n,push){let sum=0;for(let i=0;i<n;i++){steps(t,1,push?[g]:[]);const [a,b]=t.rotorGroups(r),tip=t.couplerTip(t.rotorPart(r.bId));sum+=b.body.angularVelocity.vsub(a.body.angularVelocity).dot(tip.axis)/240;}return sum;}
 assert(angle(240,false)>1,'floor-loaded axle turns before the event');g.body.position.x=.036;steps(t,30,[g]);assert.equal(r.direction,-1);assert(angle(240,true)<-1,'actual angular motion reverses after the signal');assert.equal(r.pin,null);assert(t.couplerTip(t.rotorPart(r.aId)).point.distanceTo(t.couplerTip(t.rotorPart(r.bId)).point)<.002);
});
