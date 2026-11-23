// Shared real-game fixtures: actual cube geometry, motors and Cannon physics.
const assert=require('node:assert/strict');
const Drive=require('../assets/js/trajectory-drive.js');
const createGame=require('./game-harness.cjs');

const access=t=>({groupsOf:t.rotorGroups,partOf:t.rotorPart,endpoint:t.rotorEndpoint,boundsOf:t.physicalGroupBounds});
function setup(){
  const game=createGame({graphics:false}),{t,sandbox}=game;t.clearNarrativeScene();
  Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});
  sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
  t.applyPreferences({physicsHz:120});return game;
}
function wheeledCar(t){
  const C=.09,height=.16,chassis=[],wheels=[],pairs=[];
  const make=(shape,p,q=t.Q(),weight=.15)=>({id:t.allocateUnitId(),shape,weight,p,q});
  for(const x of [-3,-2,-1,0,1,2,3])for(const z of [-.5,.5])chassis.push(make('cube',t.V(x*C,height,z*C)));
  for(const x of [-3,3])for(const side of [-1,1]){
    const axis=t.V(0,0,side),q=t.Q(),flip=t.Q();q.setFromVectors(t.V(0,1,0),axis);q.normalize();flip.setFromAxisAngle(t.V(1,0,0),Math.PI);
    const a=make('coupler',t.V(x*C,height,side*C*1.5).vadd(axis.scale(C*5/56)),q);
    const b=make('coupler',a.p.vadd(axis.scale(2*C*51/56)),q.mult(flip));chassis.push(a);
    const center=b.p.vadd(axis.scale(C*5/56)),parts=[b];
    for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]])parts.push(make('cube',center.vadd(t.V(dx*C,dy*C,0))));
    wheels.push(parts);pairs.push([a.id,b.id]);
  }
  const trunk=t.makeGroup(chassis);wheels.forEach(parts=>t.makeGroup(parts));
  const motors=pairs.map(([a,b])=>t.connectRotorTips(a,b,{rpm:24,capacity:256,maxTorque:.8}));assert(motors.every(Boolean));
  const component=t.rotorConnectedGroups([trunk]),bottom=Math.min(...component.map(g=>t.physicalGroupBounds(g).min.y));
  for(const g of component){g.body.position.y-=bottom-.002;g.body.aabbNeedsUpdate=true;}
  return {trunk,motors,component};
}
function apply(description,command){for(const request of Drive.wheelCommands(description,command))request.rotor.trajectoryDrive={rpm:request.rpm,direction:request.direction};}
function walker(t){
  const C=.09,height=.52,chassis=[],branches=[],down=t.Q();down.setFromAxisAngle(t.V(0,0,1),Math.PI);
  const make=(shape,x,y,z,q=t.Q(),weight=.25)=>({id:t.allocateUnitId(),shape,weight,p:t.V(x*C,height+y*C,z*C),q});
  for(const x of [-2,-1,0,1,2])for(const z of [-1,0,1])chassis.push(make('cube',x,0,z));
  for(const x of [-2,2])for(const z of [-1,1]){
    const hip=make('pyramid',x,-.625,z,down,.1),thigh=make('pyramid',x,-1.375,z,t.Q(),.1);
    const knee=make('pyramid',x,-2.625,z,down,.1),shin=make('pyramid',x,-3.375,z,t.Q(),.1);chassis.push(hip);
    branches.push({upper:[thigh,make('cube',x,-2,z),knee],lower:[shin,make('cube',x,-4,z),make('cube',x,-5,z),make('cube',x+1,-5,z)],pairs:[[hip,thigh],[knee,shin]]});
  }
  const trunk=t.makeGroup(chassis),motors=[];
  for(const branch of branches){t.makeGroup(branch.upper);t.makeGroup(branch.lower);for(const [a,b]of branch.pairs){const r=t.connectServoTips(a.id,b.id,{kind:'hinge',maxTorque:3.2});assert(r);assert(t.configureServo(r,{min:-20,max:20,target:0,speed:65,direction:1}));motors.push(r);}}
  return {trunk,motors,component:t.rotorConnectedGroups([trunk])};
}

module.exports={access,setup,wheeledCar,walker,apply};
