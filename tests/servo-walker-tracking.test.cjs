const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const createGame=require('./game-harness.cjs');
function setup(hz=120){
 const options={graphics:false};if(process.env.QBITS_GAME_SOURCE)options.gameSource=fs.readFileSync(process.env.QBITS_GAME_SOURCE,'utf8');
 const game=createGame(options),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.applyPreferences({physicsHz:hz});assert.equal(t.getPhysicsStep(),1/hz);return game;
}
function walker(t,withKnees=false,weightScale=1,auxiliary=false,geometry={}){
 const chassis=[],branches=[],C=.09,height=withKnees?.52+(geometry.shinExtra||0)*.09:.33;
 const make=(shape,x,y,z,q=t.Q(),weight=.25)=>({id:t.allocateUnitId(),shape,weight:weight*weightScale,p:t.V(x*C,height+y*C,z*C),q});
 const down=t.Q();down.setFromAxisAngle(t.V(0,0,1),Math.PI);
 for(const x of [-2,-1,0,1,2])for(const z of [-1,0,1])chassis.push(make('cube',x,0,z));
 for(const x of [-2,2])for(const z of [-1,1]){
  const hip=make('pyramid',x,-.625,z,down,.1),thigh=make('pyramid',x,-1.375,z,t.Q(),.1);
  chassis.push(hip);
  const upper=[thigh,make('cube',x,-2,z)],parts=[upper],pairs=[[hip,thigh]];
  if(withKnees){
   const knee=make('pyramid',x,-2.625,z,down,.1),shin=make('pyramid',x,-3.375,z,t.Q(),.1);
   upper.push(knee);pairs.push([knee,shin]);
   const lower=[shin],bottom=-5-(geometry.shinExtra||0);for(let y=-4;y>=bottom;y--)lower.push(make('cube',x,y,z));for(let j=1;j<=(geometry.toeCubes??1);j++)lower.push(make('cube',x+j,bottom,z));parts.push(lower);
  }else upper.push(make('cube',x,-3,z));
  branches.push({parts,pairs});
 }
 if(auxiliary){
  const hip=make('pyramid',0,.625,0,t.Q(),.1),head=make('pyramid',0,1.375,0,down,.1);
  chassis.push(hip);branches.push({parts:[[head,make('cube',0,2,0)]],pairs:[[hip,head]]});
 }
 if(geometry.turnOne){
  const branch=branches[0],hip=branch.pairs[0][0],turn=t.Q();turn.setFromAxisAngle(t.V(0,1,0),Math.PI/2);
  const pivot=hip.p.vadd(hip.q.vmult(t.V(0,.09*.375,0)));hip.q=turn.mult(hip.q);
  for(const part of branch.parts.flat()){part.p=pivot.vadd(turn.vmult(part.p.vsub(pivot)));part.q=turn.mult(part.q);}
 }
 const trunk=t.makeGroup(chassis),joints=[];
 for(const branch of branches){
  for(const parts of branch.parts)t.makeGroup(parts);
  for(const [a,b] of branch.pairs){
   const rotor=t.connectServoTips(a.id,b.id,{kind:'hinge',maxTorque:withKnees?3.2:2});
   assert(rotor);assert(t.configureServo(rotor,{min:-(joints.length%2&&withKnees?geometry.kneeRange||20:geometry.hipRange||20),max:(joints.length%2&&withKnees?geometry.kneeRange||20:geometry.hipRange||20),target:0,speed:65,direction:1}));joints.push(rotor);
  }
 }
 return {trunk,joints};
}


function state(t){return JSON.parse(JSON.stringify(Array.from(t.groups,g=>({ids:Array.from(g.parts,p=>p.id),mass:g.body.mass,p:g.body.position.toArray(),q:g.body.quaternion.toArray(),v:g.body.velocity.toArray(),w:g.body.angularVelocity.toArray()}))));}
function measure(t,sandbox,mechanism,hz,scenario='eight planar joints'){
 assert.equal(t.getPhysicsStep(),1/hz,'use the player-selected rate, including constraint calibration');
 const {trunk,joints}=mechanism;for(let i=0;i<Math.round(.2*hz);i++)t.stepPhysics(1/hz);
 const start=trunk.body.position.clone(),before=state(t),config=joints.map(r=>JSON.stringify({servo:r.servo,rpm:r.rpm,torque:r.maxTorque,capacity:r.capacity}));
 assert(t.startServoMarch(joints[0]));assert.deepEqual(state(t),before,'planning a gait must not move or propel any body');
 const march=t.servoMarchFor(joints[0]);assert(march.walk);const floor=t.world.bodies.find(b=>b.shapes.some(s=>s instanceof sandbox.CANNON.Plane));
 let maxError=0,slip=0,contactCount=0,loadedSteps=0,loadedContacts=0,auxMin=Infinity,auxMax=-Infinity;
 for(let i=0;i<10*hz;i++){
  t.stepPhysics(1/hz);assert(joints.every(r=>r.enabled));
  for(const r of joints)maxError=Math.max(maxError,Math.abs(t.servoAngle(r)-r.servoGoal));
  if(joints.length===9){const a=t.servoAngle(joints.at(-1));auxMin=Math.min(auxMin,a);auxMax=Math.max(auxMax,a);}
  if(i<2*hz)continue;
  const sine=Math.sin(2*Math.PI*march.elapsed/march.period);
  for(const [foot,phase]of march.walk.feet){
   if(phase*sine>=0)continue;loadedSteps++;
   const contacts=t.world.contacts.filter(c=>(c.bi===floor&&c.bj===foot||c.bj===floor&&c.bi===foot)&&Math.abs(c.ni.y)>.9);
   if(contacts.length)loadedContacts++;
   for(const c of contacts){const offset=c.bi===foot?c.ri:c.rj,v=foot.angularVelocity.cross(offset).vadd(foot.velocity);slip+=Math.hypot(v.x,v.z);contactCount++;}
  }
 }
 const result={forward:trunk.body.position.x-start.x,error:maxError,slip:slip/contactCount,support:loadedContacts/loadedSteps,phases:Array.from(march.walk.drives,([r,d])=>[r.id,d.offset]),auxRange:auxMax-auxMin};
 assert(maxError<10,'hips and knees must track within ten degrees: '+JSON.stringify(result));
 assert(result.forward>.8,'real ground contacts must carry the mechanism forward');assert(result.slip<.012,'loaded feet must not skate');assert(result.support>.8,'the loading diagonal needs actual contacts');
 assert(trunk.body.quaternion.vmult(t.V(0,1,0)).y>.98);assert(Math.abs(trunk.body.position.y-start.y)<.03);
 assert.deepEqual(joints.map(r=>JSON.stringify({servo:r.servo,rpm:r.rpm,torque:r.maxTorque,capacity:r.capacity})),config);
 assert.deepEqual(state(t).map(g=>({ids:g.ids,mass:g.mass})),before.map(g=>({ids:g.ids,mass:g.mass})));
 assert(t.stopServoMarch(march));assert(joints.every(r=>!r.enabled&&r.constraint.stopBrake.equation.enabled));
 if(process.env.QBITS_GAIT_METRICS)console.log('QBITS_GAIT '+JSON.stringify({scenario,physicsHz:hz,seconds:10,pieces:before.reduce((n,g)=>n+g.ids.length,0),motors:joints.length,...result}));return result;
}
for(const hz of [60,120,240])test(`eight planar joints coordinate support and track their goals at ${hz} Hz`,()=>{
 const {t,sandbox}=setup(hz);measure(t,sandbox,walker(t,true),hz);
});
for(const [label,geometry]of [['a longer shin',{shinExtra:1}],['a moderate fifteen-degree stride',{hipRange:15,kneeRange:15}]])test('geometric phase adapts to '+label,()=>{
 const {t,sandbox}=setup();measure(t,sandbox,walker(t,true,1,false,geometry),120,label);
});
test('eight walking joints and a moving auxiliary servo retain one powered start and stop',()=>{
 const {t,sandbox}=setup(),m=walker(t,true,1,true),result=measure(t,sandbox,m,120,'eight joints and an upper auxiliary');assert(result.auxRange>25);
});
test('gait geometry is invariant under room yaw and does not change an ordinary four-hinge gait',()=>{
 const phases=[];
 for(const angle of [0,Math.PI/4,Math.PI/2]){
  const {t}=setup(),m=walker(t,true),turn=t.Q();turn.setFromAxisAngle(t.V(0,1,0),angle);
  for(const g of t.groups){g.body.position.copy(turn.vmult(g.body.position));g.body.quaternion.copy(turn.mult(g.body.quaternion));g.body.aabbNeedsUpdate=true;}
  const before=state(t);assert(t.startServoMarch(m.joints[0]));assert.deepEqual(state(t),before);
  phases.push(m.joints.filter((r,i)=>i%2).map(r=>t.servoMarchFor(r).walk.drives.get(r).offset));
 }
 for(const row of phases)for(let i=0;i<4;i++)assert(Math.abs(row[i]-phases[0][i])<1e-7);
 const {t}=setup(),m=walker(t,false);assert(t.startServoMarch(m.joints[0]));assert.deepEqual(Array.from(t.servoMarchFor(m.joints[0]).walk.drives.values(),d=>({...d})),[{sign:1,offset:0},{sign:-1,offset:0},{sign:-1,offset:0},{sign:1,offset:0}]);
});
for(const [label,geometry]of [['large angular swings',{hipRange:60,kneeRange:60}],['a large predicted foot lift',{hipRange:15,kneeRange:25}],['perpendicular leg planes',{turnOne:true}]])test(label+' keep the existing general knee phases',()=>{
 const {t}=setup(),m=walker(t,true,1,false,geometry);assert(t.startServoMarch(m.joints[0]));const march=t.servoMarchFor(m.joints[0]);assert(march.walk);
 for(const [i,r]of m.joints.entries())assert.equal(march.walk.drives.get(r).offset,i%2?Math.PI/2:0);
});
