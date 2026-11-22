const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const createGame=require('./game-harness.cjs');
function fixture(){const game=createGame({graphics:false,...(process.env.CANNON_GEOMETRY_SOURCE?{gameSource:fs.readFileSync(process.env.CANNON_GEOMETRY_SOURCE,'utf8')}:{})});game.t.clearNarrativeScene();return game;}
function near(a,b,label){assert(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-10,`${label}: ${a} versus ${b}`);}
function vertices(body){return body.shapes.flatMap((shape,index)=>{const rotation=body.quaternion.mult(body.shapeOrientations[index]),origin=body.quaternion.vmult(body.shapeOffsets[index]).vadd(body.position);return (shape.vertices||shape.convexPolyhedronRepresentation.vertices).map(v=>rotation.vmult(v).vadd(origin));});}
function exactBounds(body){const points=vertices(body);body.computeAABB();for(const k of ['x','y','z']){near(body.aabb.lowerBound[k],Math.min(...points.map(v=>v[k])),`lower ${k}`);near(body.aabb.upperBound[k],Math.max(...points.map(v=>v[k])),`upper ${k}`);}}
test('compound broadphase bounds use the same body/local transforms as actual collision geometry',()=>{
 const {t,sandbox}=fixture(),C=sandbox.CANNON;
 for(let i=0;i<36;i++){
  const body=new C.Body({mass:1});body.position.set(.2,2,.3);body.quaternion.setFromEuler(.31+i*.07,.27+i*.11,-.4+i*.17);
  const q=t.Q();q.setFromEuler(.7,-.3,.6);const box=new C.Box(t.V(.09,.06,.04)),p=box.convexPolyhedronRepresentation;
  body.addShape(i%2?new C.ConvexPolyhedron(p.vertices.map(v=>v.clone()),p.faces.map(f=>f.slice())):box,t.V(.3,.1,-.2),q);
  body.addShape(new C.Box(t.V(.02,.04,.06)),t.V(-.2,.15,.05),t.Q());
  const identity=body.shapes.slice(),offsets=body.shapeOffsets.map(v=>v.toArray()),orientations=body.shapeOrientations.map(q=>q.toArray());
  exactBounds(body);assert.deepEqual(body.shapes,identity);assert.deepEqual(body.shapeOffsets.map(v=>v.toArray()),offsets);assert.deepEqual(body.shapeOrientations.map(q=>q.toArray()),orientations);assert.equal(body.aabbNeedsUpdate,false);
 }
});
test('convex extrema include the first vertex and are independent of vertex order',()=>{
 const {t,sandbox}=fixture(),C=sandbox.CANNON,profile=t.unitProfile('coupler'),shape=new C.ConvexPolyhedron(profile.vertices.map(v=>v.clone()),profile.faces.map(f=>f.slice()));
 const position=t.V(.2,1,-.3),q=t.Q(),min=t.V(),max=t.V();
 for(const angles of [[.3,.7,1.1],[-.6,1.2,-.4],[0,0,0]]){
  q.setFromEuler(...angles);const points=shape.vertices.map(v=>q.vmult(v).vadd(position));
  for(let n=0;n<shape.vertices.length;n++){
   shape.calculateWorldAABB(position,q,min,max);
   for(const k of ['x','y','z']){near(min[k],Math.min(...points.map(v=>v[k])),`convex min ${k}`);near(max[k],Math.max(...points.map(v=>v[k])),`convex max ${k}`);}
   shape.vertices.push(shape.vertices.shift());
  }
 }
});
test('broadphase preserves a real contact against an offset and locally rotated compound shape',()=>{
 const {t,sandbox}=fixture(),C=sandbox.CANNON;t.world.gravity.set(0,0,0);
 const support=new C.Body({mass:0}),local=t.Q();local.setFromAxisAngle(t.V(0,0,1),Math.PI/2);support.position.set(0,2,0);support.quaternion.setFromAxisAngle(t.V(0,1,0),.3);support.addShape(new C.Box(t.V(.05,.05,.05)),t.V(.5,0,0),local);t.world.addBody(support);
 const load=new C.Body({mass:1});load.position.copy(support.quaternion.vmult(t.V(.5,0,0)).vadd(support.position));load.addShape(new C.Box(t.V(.04,.04,.04)));t.world.addBody(load);
 t.world.step(1/120);assert(t.world.contacts.some(c=>c.bi===support&&c.bj===load||c.bi===load&&c.bj===support),'the broadphase must not omit this overlapping pair');
});
test('compound bounds track a moved and rotated body without retaining a previous pose',()=>{
 const {t,sandbox}=fixture(),C=sandbox.CANNON,body=new C.Body({mass:1}),local=t.Q();local.setFromEuler(.4,.6,.8);body.addShape(new C.Box(t.V(.08,.03,.05)),t.V(.25,-.1,.07),local);
 exactBounds(body);const old=body.aabb.lowerBound.clone();body.position.set(2,3,-4);body.quaternion.setFromEuler(-.8,.5,.2);body.aabbNeedsUpdate=true;exactBounds(body);assert(body.aabb.lowerBound.distanceTo(old)>1);
});
