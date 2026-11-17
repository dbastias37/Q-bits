const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');

test('hierarchical rotated bounds match every original convex vertex in a 2000-piece mixed structure',()=>{
 const {t}=createGame();t.clearNarrativeScene();const g=t.makeGroup(Array.from({length:2000},(_,i)=>{
  const q=t.Q();q.setFromEuler((i%7)*.13,(i%11)*.17,(i%13)*.09);
  return {id:t.allocateUnitId(),shape:['cube','coupler','tetra','pyramid'][i%4],weight:1,p:t.V((i%50)*.12,1+(Math.floor(i/50)%4)*.13,Math.floor(i/200)*.12),q};
 }));
 for(let i=0;i<24;i++){
  const q=t.Q();q.setFromEuler(i*.19,-i*.23,i*.11);const p=t.V(i*.003,1,-.5),actual=t.bounds(g,p,q),points=t.poses(g,p,q).flatMap(t.corners);
  for(const key of ['x','y','z']){const lo=Math.min(...points.map(v=>v[key])),hi=Math.max(...points.map(v=>v[key]));assert(Math.abs(actual.min[key]-lo)<1e-10);assert(Math.abs(actual.max[key]-hi)<1e-10);}
 }
});

test('long thin assemblies reject distant bodies before compound narrowphase',()=>{
 const {t}=createGame();t.clearNarrativeScene();t.story.ready=false;
 const bar=t.makeGroup(Array.from({length:200},(_,i)=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V((i-99.5)*.09,1,0),q:t.Q()})));
 for(let i=0;i<40;i++)t.addQubit([-4+(i%20)*.4,1,1+Math.floor(i/20)*.5]);
 const count=boxes=>{t.world.broadphase.useBoundingBoxes=boxes;t.world.broadphase.dirty=true;const a=[],b=[];t.world.broadphase.collisionPairs(t.world,a,b);return a.filter((body,i)=>body===bar.body||b[i]===bar.body).length;};
 assert.equal(t.world.broadphase.useBoundingBoxes,true);
 const spheres=count(false),boxes=count(true);assert(spheres>=40);assert.equal(boxes,0);
});

test('AABB pruning preserves real contacts and motion for rotating mixed compounds and loads',()=>{
 function run(boxes){
  const {t}=createGame();t.clearNarrativeScene();t.story.ready=false;t.world.broadphase.useBoundingBoxes=boxes;
  const shapes=['cube','pyramid','tetra','coupler'];
  for(let row=0;row<4;row++){
   const turn=t.Q();turn.setFromEuler(.05*row,.3*row,.04*row);
   const g=t.makeGroup(Array.from({length:12},(_,i)=>({id:t.allocateUnitId(),shape:shapes[row],weight:1,p:t.V(-1+i*.09,.10+row*.16,row*.4),q:turn.clone()})));
   g.body.angularVelocity.set(.1,.15,-.05);
   for(let i=0;i<3;i++)t.addQubit([-.8+i*.3,.3+row*.16,row*.4]);
  }
  const samples=[];
  for(let i=0;i<120;i++){
   t.world.step(1/240);
   const bodyIndex=b=>t.world.bodies.indexOf(b);
   samples.push(t.world.contacts.map(c=>[bodyIndex(c.bi),bodyIndex(c.bj),c.ri.x,c.ri.y,c.ri.z,c.ni.x,c.ni.y,c.ni.z]));
  }
  return {samples,poses:t.groups.map(g=>[...['x','y','z'].map(k=>g.body.position[k]),...['x','y','z','w'].map(k=>g.body.quaternion[k])])};
 }
 assert.equal(JSON.stringify(run(true)),JSON.stringify(run(false)));
});
