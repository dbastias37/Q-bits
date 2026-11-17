const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');
const C = .09, STEP = 1 / 240;

function setup() {
 const game = createGame(); const {t,sandbox} = game;
 t.clearNarrativeScene();
 Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 t.world.gravity.set(0,0,0);
 return game;
}
function make(t,kind='hinge',at=t.V(0,1,0)) {
 const a=t.addQubit([at.x,at.y,at.z],.25,'pyramid'), q=t.Q();
 if(kind==='hinge')q.setFromAxisAngle(t.V(0,0,1),Math.PI);
 const height=kind==='hinge'?.75*C:.375*C+C/2;
 const b=t.makeGroup([{id:t.allocateUnitId(),shape:kind==='hinge'?'pyramid':'cube',weight:.25,p:at.vadd(t.V(0,height,0)),q}]);
 const r=t.connectServoTips(a.parts[0].id,b.parts[0].id,{kind});
 assert(r,kind+' connects at the shared apex');
 return r;
}
function step(t,seconds,inspect=()=>{}) {for(let i=0;i<seconds/STEP;i++){t.stepPhysics(STEP);inspect();}}
function gap(t,r) {
 const a=t.rotorEndpoint(t.rotorPart(r.aId),r.servo,'a');
 const b=t.rotorEndpoint(t.rotorPart(r.bId),r.servo,'b');
 return a.point.distanceTo(b.point);
}
function near(a,b,epsilon=.5){assert(Math.abs(a-b)<=epsilon,`${a} is not within ${epsilon} of ${b}`);}

for(const kind of ['pivot','hinge'])for(const target of [-35,35])test(`${kind} moves to ${target} degrees with coincident physical attachment points`,()=>{
 const {t}=setup(),r=make(t,kind);
 assert.equal(t.groups.length,2);assert.equal(t.world.constraints.length,1);
 assert(t.configureServo(r,{min:-60,max:60,target,speed:60,mode:'once'}));
 assert(t.startServo(r));
 let maxGap=0,peak=0;
 step(t,3,()=>{maxGap=Math.max(maxGap,gap(t,r));peak=Math.max(peak,Math.abs(t.servoAngle(r)));});
 near(t.servoAngle(r),target,1);
 assert(peak<61,'controller never leaves the configured interval');
 assert(maxGap<.003,'the actual Cannon bodies stay connected, not just their drawing');
 assert.equal(r.pin,null,'servo does not silently anchor its base to the room');
 assert(t.rotorGroups(r).every(g=>g.body.type===1));
});

for(const kind of ['pivot','hinge'])test(`${kind} repeats between its endpoints without accumulating complete rotations`,()=>{
 const {t}=setup(),r=make(t,kind);
 assert(t.configureServo(r,{min:-25,max:25,target:25,speed:90,mode:'repeat'}));
 assert(t.startServo(r));
 let min=Infinity,max=-Infinity,turns=0,previous=0;
 step(t,7,()=>{
  const angle=t.servoAngle(r);min=Math.min(min,angle);max=Math.max(max,angle);
  if(previous>20&&angle<20)turns++;
  previous=angle;
  assert(gap(t,r)<.003);
 });
 assert(min< -23&&max>23,`both extremes visited: ${min}, ${max}`);
 assert(min>=-26&&max<=26,`range respected: ${min}, ${max}`);
 assert(turns>=2,'more than one return cycle');
});

test('switching off freezes the relative angle while the complete mechanism is still free to fall',()=>{
 const {t}=setup(),r=make(t);
 t.configureServo(r,{target:35,speed:60,mode:'hold'});assert(t.startServo(r));step(t,2);
 assert(t.configureRotor(r,{enabled:false}));const angle=t.servoAngle(r),before=t.rotorGroups(r)[0].body.position.y;
 t.world.gravity.set(0,-9.82,0);step(t,.2);
 near(t.servoAngle(r),angle,.7);
 assert(t.rotorGroups(r)[0].body.position.y<before-.08);
 assert.equal(r.constraint.motorEquation.enabled,false);
 assert.equal(r.pin,null);assert(gap(t,r)<.003);
});

test('empty energy stops the servo and keeps its joint connected without consuming negative energy',()=>{
 const {t}=setup(),r=make(t);
 t.configureServo(r,{target:50,speed:60,mode:'hold'});assert(t.startServo(r));step(t,.2);
 for(const id of [r.aId,r.bId])t.rotorPart(id).part.mood.energy=0;
 step(t,.1);
 assert.equal(r.enabled,false);
 assert.equal(r.constraint.motorEquation.enabled,false);
 assert.equal(r.pin,null);assert(gap(t,r)<.003);
 assert([r.aId,r.bId].every(id=>t.rotorPart(id).part.mood.energy>=0));
});

test('invalid servo edits cannot partially change or start a mechanism',()=>{
 const {t}=setup(),r=make(t),before=JSON.stringify(r.servo);
 for(const patch of [{min:40,max:20},{speed:NaN},{target:Infinity},{mode:'continuous'},{min:-200},{max:200},{speed:0}]){
  assert.equal(t.configureServo(r,patch),false,JSON.stringify(patch));
  assert.equal(JSON.stringify(r.servo),before,'invalid edit is atomic');
  assert.equal(r.enabled,false);
 }
 assert.equal(t.connectServoTips(r.aId,r.bId,{kind:'hinge'}),null,'an occupied tip cannot be connected twice');
});

test('both servo recipes appear in the quick catalogue and create stopped usable mechanisms',()=>{
 const {t}=setup();
 for(const [i,kind]of ['pivot','hinge'].entries()){
  const record=t.servoBlueprintTemplate(kind);
  assert(t.savedMechanismValid(record),kind+' template passes strict geometry validation');
  const entry=t.quickCatalogue().find(item=>item.record?.joints?.some(j=>j.servo?.kind===kind));
  assert(entry,kind+' is available to the player in Q');
  const r=t.spawnSavedMechanism(record,t.V(i*2,.4,0));
  assert(r?.servo);assert.equal(r.enabled,false);assert(gap(t,r)<.003);
 }
});

test('a bent servo retains its settings and posture when saved as a mechanism and restored',()=>{
 const {t}=setup(),r=make(t);
 t.configureServo(r,{min:-55,max:55,target:35,speed:75,mode:'once'});assert(t.startServo(r));step(t,2);
 t.configureRotor(r,{enabled:false});const angle=t.servoAngle(r),record=t.mechanismSnapshot(r,'Rodilla doblada');
 assert(record);assert(t.savedMechanismValid(record));
 assert.equal(record.joints[0].servo.kind,'hinge');
 const copy=t.spawnSavedMechanism(record,t.V(2,.5,0));assert(copy?.servo);
 assert.equal(copy.enabled,false);near(t.servoAngle(copy),angle,.05);
 assert.equal(copy.servo.speed,75);assert.equal(copy.servo.max,55);
 assert(gap(t,copy)<.003);
});

test('a hip and knee share one rigid limb and remain two independently moving joints',()=>{
 const {t}=setup(),hip=make(t,'pivot');
 const upper=t.rotorPart(hip.bId),parts=t.worldParts(upper.g),aId=t.allocateUnitId(),bId=t.allocateUnitId();
 const qa=t.Q(),qb=t.Q();qa.setFromAxisAngle(t.V(0,0,1),-Math.PI/2);qb.setFromAxisAngle(t.V(0,0,1),Math.PI/2);
 const ap=upper.p.vadd(t.V(C*.625,0,0)),bp=ap.vadd(t.V(C*.75,0,0));
 parts.push({id:aId,shape:'pyramid',weight:.25,p:ap,q:qa});
 t.removeGroup(upper.g);t.makeGroup(parts);t.refreshRotors();
 assert(t.rotors.includes(hip),'welding a new connector preserves the hip');
 t.makeGroup([{id:bId,shape:'pyramid',weight:.25,p:bp,q:qb}]);
 const knee=t.connectServoTips(aId,bId,{kind:'hinge'});assert(knee);
 assert.equal(t.rotors.length,2);assert.equal(t.groups.length,3);
 assert.equal(t.rotorConnectedGroups(t.rotorGroups(hip)).length,3);
 t.configureServo(hip,{target:20,speed:45,mode:'hold'});
 t.configureServo(knee,{target:30,speed:45,mode:'hold'});
 assert(t.startServo(hip));assert(t.startServo(knee));
 let worst=0;step(t,3,()=>{worst=Math.max(worst,gap(t,hip),gap(t,knee));});
 near(t.servoAngle(hip),20,1);near(t.servoAngle(knee),30,1);
 assert(worst<.005,`the two joints remain closed: ${worst}`);
 const record=t.mechanismSnapshot(hip,'Extremidad');assert(record);assert.equal(record.joints.length,2);
});

for(const kind of ['pivot','hinge'])for(const moving of ['socket','limb'])test(`${kind} manual Shift attachment works when holding the ${moving}`,()=>{
 const {t}=setup(),a=t.addQubit([0,1,0],.25,'pyramid'),q=t.Q();
 if(kind==='hinge')q.setFromAxisAngle(t.V(0,0,1),Math.PI);
 const h=kind==='hinge'?.75*C:.375*C+C/2;
 const b=t.makeGroup([{id:t.allocateUnitId(),shape:kind==='hinge'?'pyramid':'cube',weight:.25,p:t.V(0,1+h+.006,0),q}]);
 assert(t.prepareServoPart(t.rotorPart(a.parts[0].id),kind));
 const source=moving==='socket'?a:b,target=source===a?b:a,part=source.parts[0];
 t.grabQubit({g:source,part,point:t.rotorPart(part.id).p,distance:.8});
 t.keys.add('ShiftLeft');const candidate=t.findSnap();
 assert(candidate?.servoKind===kind,'normal placement chooses the prepared servo socket');
 t.updateTarget();t.releaseQubit(true);
 assert.equal(t.rotors.length,1);assert.equal(t.rotors[0].servo.kind,kind);
 assert.equal(t.groups.length,2);assert(gap(t,t.rotors[0])<.00001);
});

test('generic rotor controls cannot replace bounded servo control with continuous rotation',()=>{
 const {t}=setup(),r=make(t);
 assert(t.configureRotor(r,{enabled:true}),'legacy start delegates to bounded servo');
 step(t,3);near(t.servoAngle(r),r.servo.target,1);
 t.configureRotor(r,{enabled:false});
 assert.equal(t.configureRotor(r,{moving:'a'}),false);
 assert.equal(t.configureRotor(r,{mount:'fixed'}),false);
 const set=t.createRotorSet('Mi servo',[r]);
 assert.equal(t.configureRotorSet(set,{enabled:true}),false);
 assert.equal(r.enabled,false);assert.equal(r.mount,'wheel');assert.equal(r.moving,'b');
});

test('the minimum 5 degrees/second speed survives mechanism export and restoration',()=>{
 const {t}=setup(),r=make(t,'pivot');assert(t.configureServo(r,{speed:5}));
 const record=t.mechanismSnapshot(r,'Servo lento');assert(record);assert(t.savedMechanismValid(record));
 const copy=t.spawnSavedMechanism(record,t.V(2,.5,0));assert(copy?.servo);assert.equal(copy.servo.speed,5);
});

for(const kind of ['pivot','hinge'])test(`${kind} quick mechanism moves under gravity on the actual floor`,()=>{
 const {t}=setup();t.world.gravity.set(0,-9.82,0);
 const r=t.spawnSavedMechanism(t.servoBlueprintTemplate(kind),t.V(0,0,0));assert(r);
 step(t,.5);const before=t.servoAngle(r);
 assert(t.configureServo(r,{target:30,speed:45,mode:'once'}));assert(t.startServo(r));
 let maxGap=0,minY=Infinity;
 step(t,5,()=>{maxGap=Math.max(maxGap,gap(t,r));minY=Math.min(minY,...t.rotorGroups(r).map(g=>t.bounds(g).min.y));});
 assert(Math.abs(t.servoAngle(r)-before)>20,`loaded movement achieved: ${before} to ${t.servoAngle(r)}`);
 near(t.servoAngle(r),30,3);assert(maxGap<.005);assert(minY>-.01);
});

test('an attached active battery supplies the servo and protects its internal reserves',()=>{
 const {t}=setup(),r=make(t),a=t.rotorPart(r.aId),parts=t.worldParts(a.g),id=t.allocateUnitId();
 parts.push({id,shape:'cube',weight:1,p:a.p.vadd(t.V(0,-C*.625,0)),q:t.Q()});
 t.removeGroup(a.g);t.makeGroup(parts);t.refreshRotors();
 const battery=t.rotorPart(id).part;battery.mood.externalBattery={version:1,ownerId:id,packId:id,enabled:true};battery.mood.energy=.6;
 const internal=[r.aId,r.bId].map(id=>t.rotorPart(id).part.mood.energy);
 assert(t.configureServo(r,{min:-35,max:35,target:30,speed:45,mode:'repeat'}));assert(t.startServo(r));step(t,2);
 assert(battery.mood.energy<.6);assert(battery.mood.energy>0);
 assert.deepEqual([r.aId,r.bId].map(id=>t.rotorPart(id).part.mood.energy),internal);
 battery.mood.energy=0;step(t,.1);assert.equal(r.enabled,false);assert.equal(r.stopReason,'empty');
 assert.deepEqual([r.aId,r.bId].map(id=>t.rotorPart(id).part.mood.energy),internal);
});
