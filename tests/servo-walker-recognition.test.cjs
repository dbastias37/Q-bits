const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const createGame=require('./game-harness.cjs');

function setup(hz=120){
 const game=createGame({graphics:false,...(process.env.QBITS_GAME_SOURCE?{gameSource:fs.readFileSync(process.env.QBITS_GAME_SOURCE,'utf8')}: {})}),{t,sandbox}=game;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.applyPreferences({physicsHz:hz});assert.equal(t.getPhysicsStep(),1/hz);return game;
}
function fixture(t,{feet=4,head=true,shortFeet=false}={}){
 const C=.09,height=.33,chassis=[],branches=[];
 const make=(shape,x,y,z,q=t.Q(),weight=.25)=>({id:t.allocateUnitId(),shape,weight,p:t.V(x*C,height+y*C,z*C),q});
 const down=t.Q();down.setFromAxisAngle(t.V(0,0,1),Math.PI);
 for(const x of [-2,-1,0,1,2])for(const z of [-1,0,1])chassis.push(make('cube',x,0,z));
 const corners=[[-2,-1],[-2,1],[2,-1],[2,1]],points=feet===6?[[-2,-1],[-2,1],[0,-1],[0,1],[2,-1],[2,1]]:feet===5?[...corners,[0,0]]:corners.slice(0,feet);
 for(const [x,z]of points){
  const hip=make('pyramid',x,-.625,z,down,.1),thigh=make('pyramid',x,-1.375,z,t.Q(),.1);
  chassis.push(hip);branches.push({parts:shortFeet?[thigh]:[thigh,make('cube',x,-2,z),make('cube',x,-3,z)],a:hip,b:thigh,foot:true});
 }
 if(head){const hip=make('pyramid',0,.625,0,t.Q(),.1),tip=make('pyramid',0,1.375,0,down,.1);chassis.push(hip);branches.push({parts:[tip,make('cube',0,2,0)],a:hip,b:tip,foot:false});}
 const trunk=t.makeGroup(chassis),joints=[],feetBodies=[];let auxiliary=null;
 for(const branch of branches){
  const group=t.makeGroup(branch.parts),r=t.connectServoTips(branch.a.id,branch.b.id,{kind:'hinge',maxTorque:2});assert(r);
  assert(t.configureServo(r,{min:-20,max:20,target:0,speed:65,direction:1}));joints.push(r);
  if(branch.foot)feetBodies.push(group.body);else auxiliary=r;
 }
 return {trunk,joints,feetBodies,auxiliary};
}
function step(t,seconds,hz=120,check=()=>{}){assert.equal(t.getPhysicsStep(),1/hz);for(let i=0;i<Math.round(seconds*hz);i++){t.stepPhysics(t.getPhysicsStep());check();}}
const identity=t=>Array.from(t.groups,g=>({ids:Array.from(g.parts,p=>p.id),mass:g.body.mass,type:g.body.type}));

for(const hz of [60,120,240])test(`four feet retain floor locomotion with an upper auxiliary servo at ${hz} Hz`,()=>{
 const {t}=setup(hz),{trunk,joints,feetBodies,auxiliary}=fixture(t);step(t,.2,hz);
 const origin=trunk.body.position.clone(),before=identity(t);assert(t.startServoMarch(joints[0]));
 const march=t.servoMarchFor(joints[0]);assert(march.walk,'an upper branch must not silently disable the four-foot gait');
 assert.equal(march.walk.feet.size,4);assert(feetBodies.every(b=>march.walk.feet.has(b)));
 assert.equal(march.members.length,5);assert(!march.walk.feet.has(t.rotorPart(auxiliary.bId).g.body));
 let low=Infinity,high=-Infinity,powered=false;
 step(t,8,hz,()=>{const angle=t.servoAngle(auxiliary);low=Math.min(low,angle);high=Math.max(high,angle);powered ||= auxiliary.power?.inputWatts>0;});
 assert(trunk.body.position.x-origin.x>.8,'actual contacts must carry the chassis forward');
 assert(Math.abs(trunk.body.position.y-origin.y)<.03);assert(trunk.body.quaternion.vmult(t.V(0,1,0)).y>.95);
 assert(joints.every(r=>r.enabled));assert(high-low>25,'the auxiliary servo remains under the common controller');assert(powered,'auxiliary motion still uses the power model');
 assert.deepEqual(identity(t),before,'locomotion preserves pieces, masses and dynamic bodies');
 assert(t.stopServoMarch(march));assert(joints.every(r=>!r.enabled&&r.constraint.stopBrake.equation.enabled));
});

test('ordinary four-foot diagonal phases remain unchanged and an auxiliary starting end cannot alter them',()=>{
 for(const head of [false,true]){
  const {t}=setup(),{joints,auxiliary}=fixture(t,{head});if(auxiliary)assert(t.configureServo(auxiliary,{direction:-1}));
  assert(t.startServoMarch(joints[0]));const march=t.servoMarchFor(joints[0]);assert(march.walk);
  assert.deepEqual(Array.from(joints.slice(0,4),r=>({...march.walk.drives.get(r)})),[{sign:1,offset:0},{sign:-1,offset:0},{sign:-1,offset:0},{sign:1,offset:0}]);
  step(t,.5);assert.match(t.servoMarchSnapshot(joints[0]).status,/cuatro apoyos/);
 }
});

test('an empty auxiliary motor still prevents a partial start',()=>{
 const {t}=setup(),{joints,auxiliary}=fixture(t);for(const id of [auxiliary.aId,auxiliary.bId])t.rotorPart(id).part.mood.energy=0;
 assert.equal(t.startServoMarch(joints[0]),false);assert(joints.every(r=>!r.enabled));assert.equal(t.servoMarches.size,0);
});

test('saving the complete mechanism preserves the auxiliary configuration and restores a stopped, recognizable walker',()=>{
 const {t}=setup(),{joints,auxiliary}=fixture(t);assert(t.configureServo(auxiliary,{min:-15,max:25,speed:55,direction:-1}));
 const saved=t.mechanismSnapshot(joints[0],'Caminante con cabeza');assert(saved);assert.equal(saved.joints.length,5);
 const copy=t.spawnSavedMechanism(saved,t.V(3,0,0));assert(copy);const members=t.servoMarchMembers(copy);assert.equal(members.length,5);assert(members.every(r=>!r.enabled));
 const restored=members.find(r=>r.servo.min===-15);assert(restored);assert.equal(restored.servo.max,25);assert.equal(restored.servo.speed,55);assert.equal(restored.servo.direction,-1);
 assert(t.startServoMarch(copy));const march=t.servoMarchFor(copy);assert(march.walk);assert.equal(march.walk.feet.size,4);assert.equal(march.members.length,5);
 assert(joints.every(r=>!r.enabled),'starting the restored machine does not start the original');
});

for(const feet of [5,6])test(`${feet} lower branches stay in the general controller instead of dropping feet to force a quadruped pattern`,()=>{
 const {t}=setup(),{joints}=fixture(t,{feet,head:false});assert(t.startServoMarch(joints[0]));const march=t.servoMarchFor(joints[0]);
 assert(march.walk===null,'ambiguous support counts must use the general controller');assert.equal(march.members.length,feet);assert(joints.every(r=>r.enabled));
 step(t,.5);assert.match(t.servoMarchSnapshot(joints[0]).status,/sin cuatro apoyos/);
});

test('three lower branches and an upper appendage are not mislabeled as four supports',()=>{
 const {t}=setup(),{joints}=fixture(t,{feet:3,head:true});assert(t.startServoMarch(joints[0]));assert(t.servoMarchFor(joints[0]).walk===null,'an upper appendage cannot count as a floor support');
});

test('short feet are recognized from their physical extent instead of their center of mass',()=>{
 const {t}=setup(),{joints,feetBodies}=fixture(t,{head:false,shortFeet:true});assert(t.startServoMarch(joints[0]));const march=t.servoMarchFor(joints[0]);
 assert(march.walk,'four short pyramidal soles are still four lower supports');assert.equal(march.walk.feet.size,4);assert(feetBodies.every(b=>march.walk.feet.has(b)));
});
