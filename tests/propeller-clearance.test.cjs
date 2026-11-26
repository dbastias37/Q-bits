'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
const RADIUS=.09*Math.SQRT2+.003,LOW=.001,HIGH=.09/2+.002;
function game(){const g=createGame({nativeContext:true,graphics:false});g.t.clearNarrativeScene();Object.assign(g.t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});return g;}
function rotation(t,axis,degrees){const q=t.Q();q.setFromAxisAngle(t.V(...axis),degrees*Math.PI/180);return q;}
function box(t,p,half,q=t.Q()){return {p:t.V(...p),half:t.V(...half),q};}
function intersects(t,pose,tip=t.V(),q=t.Q()){return t.propellerSweepIntersects(pose,tip,q.inverse(),RADIUS);}
function droneAt(t,tip,q=t.Q()){
 const g=t.spawnSavedMechanism(t.propellerBlueprintTemplate(true),t.V());assert(g);
 const f=t.flightForGroup(g),cell=g.parts.find(t.isExternalBattery);cell.mood.energy=1;cell.mood.externalBattery.enabled=true;
 g.body.quaternion.copy(q);const current=t.couplerTip(t.rotorPart(f.id)).point;g.body.position.vadd(tip.vsub(current),g.body.position);
 return {g,f};
}

test('the recorded transfer table is clear at 7.70147 degrees and at every yaw, with the original blade radius',()=>{
 const {t}=game(),table=box(t,[3.08,.55,-.25],[.34,.025,.35]);
 const tip=t.V(3.5977093746952984,.4807260547477143,-.24692034919916023);
 assert(tip.x-(table.p.x+table.half.x)>RADIUS,'the actual table ends 177.709 mm from the axis');
 assert.equal(intersects(t,table,tip,rotation(t,[0,1,0],7.70147)),false);
 for(let yaw=0;yaw<360;yaw+=5){
  const q=rotation(t,[0,1,0],yaw);
  assert.equal(intersects(t,table,tip,q),false,`recorded clear table, yaw ${yaw}`);
  assert.equal(intersects(t,table,t.V(3.42+RADIUS-1e-5,tip.y,tip.z),q),true,`10 micrometre penetration, yaw ${yaw}`);
  assert.equal(intersects(t,table,t.V(3.42+RADIUS+1e-5,tip.y,tip.z),q),false,`10 micrometre gap, yaw ${yaw}`);
 }
});

test('distant room walls cannot obstruct a vertical takeoff column at any yaw',()=>{
 const {t}=game(),walls=[box(t,[6,1.8,0],[.1,1.8,4.72]),box(t,[0,1.8,-4.35],[6.1,1.8,.1])];
 for(let yaw=0;yaw<360;yaw+=5)for(let i=0;i<=120;i++)for(const wall of walls)
  assert.equal(intersects(t,wall,t.V(4,.315+i*.01,-.25),rotation(t,[0,1,0],yaw)),false,`wall at ${wall.p.x},${wall.p.z}; yaw ${yaw}; height ${i}`);
});

test('axial clipping rejects the empty part of a tilted rod but preserves a real edge crossing',()=>{
 const {t}=game(),q=rotation(t,[0,0,1],-45),half=[.005,.4,.005];
 // The complete projection of both rods reaches the disk. In the axial slab,
 // the first rod has x-y >= .15-sqrt(2)*.005, strictly beyond the radius.
 const outside=box(t,[.35,.2,0],half,q),crossing=box(t,[.30,.2,0],half,q);
 assert(.15-Math.SQRT2*.005+LOW>RADIUS);
 assert(t.corners(crossing).every(p=>p.y<LOW||p.y>HIGH),'no original vertex lies inside the blade slab');
 assert.equal(intersects(t,outside),false);
 assert.equal(intersects(t,crossing),true,'intersections of the long edges with the slab retain the real obstruction');
});

test('the exact pyramid, tetrahedron and coupler caps preserve their empty corners and real incursions',()=>{
 const {t}=game();
 for(const [shape,y,clearX,blockedX]of [['pyramid',-.02,.16,.14],['tetra',-.02,.17,.15],['coupler',-.06,.16,.15]]){
  const pose={shape,p:t.V(clearX,y,0),q:t.Q()};
  assert.equal(intersects(t,pose),false,`${shape}: empty box corner`);
  pose.p.x=blockedX;assert.equal(intersects(t,pose),true,`${shape}: actual clipped cap`);
 }
});

test('the complete swept disk detects interior and edge crossings without any vertex inside its radius',()=>{
 const {t}=game(),cover=box(t,[0,.025,0],[.5,.02,.5]),edge=box(t,[0,.025,RADIUS-.001],[.4,.002,.0005]);
 for(const pose of [cover,edge]){
  assert(t.corners(pose).every(p=>Math.hypot(p.x,p.z)>RADIUS));
  assert.equal(intersects(t,pose),true);
 }
 // The cap intersection may degenerate to a face, line or point. These pure
 // geometric cases exercise the same narrow phase without creating bodies.
 for(const half of [[.4,0,.4],[.4,0,0],[0,0,0]])
  assert.equal(intersects(t,box(t,[0,LOW,0],half)),true);
 assert.equal(intersects(t,box(t,[RADIUS+.001,LOW,0],[0,0,0])),false);
});

test('upper and lower axial limits and the strict radial limit remain unchanged',()=>{
 const {t}=game(),half=[.02,.005,.02];
 assert.equal(intersects(t,box(t,[0,LOW-.005-1e-7,0],half)),false);
 assert.equal(intersects(t,box(t,[0,LOW-.005+1e-7,0],half)),true);
 assert.equal(intersects(t,box(t,[0,HIGH+.005+1e-7,0],half)),false);
 assert.equal(intersects(t,box(t,[0,HIGH+.005-1e-7,0],half)),true);
 assert.equal(intersects(t,box(t,[RADIUS,LOW,0],[0,0,0])),false);
 assert.equal(intersects(t,box(t,[RADIUS-1e-7,LOW,0],[0,0,0])),true);
});

test('box rejection and exact clipping are invariant under a rigid world rotation and translation',()=>{
 const {t}=game(),fixtures=[
  [box(t,[.35,.2,0],[.005,.4,.005],rotation(t,[0,0,1],-45)),false],
  [box(t,[.30,.2,0],[.005,.4,.005],rotation(t,[0,0,1],-45)),true],
  [{shape:'tetra',p:t.V(.15,-.02,0),q:t.Q()},true],
  [box(t,[6,1.8,0],[.1,1.8,4.72]),false]
 ];
 const origin=t.V(-7.5,2.25,5.75);
 for(const axis of [[1,0,0],[0,1,0],[0,0,1]])for(const angle of [0,23,89,178]){
  const q=rotation(t,axis,angle);
  for(const [pose,expected]of fixtures){
   const transformed={...pose,p:q.vmult(pose.p).vadd(origin),q:q.mult(pose.q)};
   assert.equal(intersects(t,transformed,origin,q),expected,`${axis}, ${angle}`);
  }
 }
});

test('the flight protection uses the true table boundary and still rejects an intrusive static wall',()=>{
 const {t}=game(),tip=t.V(3.5977093746952984,.4807260547477143,-.24692034919916023);
 const {f}=droneAt(t,tip,rotation(t,[0,1,0],7.70147));
 t.storyWall(t.V(3.08,.55,-.25),t.V(.34,.025,.35));
 assert.equal(t.flightSnapshot(f).obstruction,null);assert(t.startFlight(f),f.status);t.stopFlight(f);
 const stored=t.externalBatterySummary(f.component).storedJ;
 t.storyWall(t.V(tip.x,tip.y+.025,tip.z),t.V(.3,.002,.003));
 assert.equal(t.flightSnapshot(f).obstruction,'solid');assert.equal(t.startFlight(f),false);assert.match(f.status,/obstruida/);
 assert.equal(t.externalBatterySummary(f.component).storedJ,stored,'rejected startup never spends charge');
});

test('foreign triangular solids and sensors still obstruct the full blade sweep in every scene',()=>{
 for(const scene of ['lab','galpon']){
  const {t}=game(),tip=t.V(0,.5,0),{f}=droneAt(t,tip);
  // Geometry fixtures are built in the free laboratory. Only the query scene
  // changes; this does not grant or construct any mission material.
  const obstruction=()=>{t.story.scene=scene;try{return t.propellerObstruction(f.modules[0]);}finally{t.story.scene='lab';}};
  assert.equal(obstruction(),null,'own hub and blades stay exempt');
  const solid=t.addQubit([0,tip.y+.01,.08],1/12,'tetra');
  assert.equal(obstruction(),'solid');t.removeGroup(solid);
  const sensor=t.addQubit([0,tip.y+.03,.1]),part=sensor.parts[0];
  part.mood.workshop={version:1,ownerId:part.id,sensor:true,battery:1,lightweight:1,movement:1,baseWeight:1,ballast:0};
  assert.equal(obstruction(),'sensor');t.removeGroup(sensor);
  assert.equal(obstruction(),null);
 }
});

test('an archived family obstructs through its physical shell without materializing its stored parts',()=>{
 const {t}=game(),tip=t.V(0,.5,0),{f}=droneAt(t,tip),loose=t.addQubit([3,.045,3]);
 const family=t.groupIntoFamilies([loose])?.[0];assert(family);assert(!t.groups.includes(loose));assert(t.world.bodies.includes(family.body));
 const inventory=JSON.stringify(family.items),stored=t.externalBatterySummary(f.component).storedJ,ids=t.groups.flatMap(g=>g.parts.map(p=>p.id));
 family.body.position.set(RADIUS+.075+1e-5,tip.y+.024,0);family.body.aabbNeedsUpdate=true;
 assert.equal(t.propellerObstruction(f.modules[0]),null,'family shell outside the disk');
 family.body.position.x-=2e-5;family.body.aabbNeedsUpdate=true;
 assert.equal(t.propellerObstruction(f.modules[0]),'solid','family shell crosses the disk by 10 micrometres');
 assert.equal(t.startFlight(f),false);assert.match(f.status,/obstruida/);
 assert.equal(t.externalBatterySummary(f.component).storedJ,stored);assert.equal(JSON.stringify(family.items),inventory);
 assert.deepEqual(t.groups.flatMap(g=>g.parts.map(p=>p.id)),ids,'collision queries never create stored members');
 family.body.position.set(3,.075,3);family.body.aabbNeedsUpdate=true;
 assert(t.startFlight(f),f.status);
});
