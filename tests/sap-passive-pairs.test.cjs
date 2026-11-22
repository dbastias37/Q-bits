const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const createGame=require('./game-harness.cjs');
const fixtures=require('./cpu-audit-fixtures.cjs');

function game(native=false){
 const source=fs.readFileSync(path.join(__dirname,'../assets/js/game.js'),'utf8'),at=source.lastIndexOf('})();');
 const hook='window.__sapInstall=installSapPassivePairFilter;';
 const result=createGame({graphics:false,gameSource:source.slice(0,at)+hook+source.slice(at)}),{t,sandbox}=result;
 if(native)t.world.broadphase.collisionPairs=sandbox.CANNON.SAPBroadphase.prototype.collisionPairs;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 t.applyPreferences({physicsHz:120,music:false,guideVoice:false,footsteps:false,joinSounds:false});
 return {...result,f:fixtures(t)};
}
let runtime;
function raw(){
 runtime ||= game();
 const C=runtime.sandbox.CANNON,world=new C.World();world.allowSleep=true;
 world.broadphase=new C.SAPBroadphase(world);runtime.sandbox.__sapInstall(world);
 return {C,world,bp:world.broadphase,native:C.SAPBroadphase.prototype.collisionPairs};
}
function vector(v){return [v.x,v.y,v.z];}
function bodyState(b){return {id:b.id,p:vector(b.position),q:[b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w],v:vector(b.velocity),w:vector(b.angularVelocity),type:b.type,sleep:b.sleepState,needs:b.aabbNeedsUpdate,lo:vector(b.aabb.lowerBound),hi:vector(b.aabb.upperBound)};}
// Invoke the two algorithms on exactly the same list and body objects. Restore
// only the query's permitted AABB/sort side effects before invoking the other.
function compare(env,label='pairs'){
 const {C,world,bp,native}=env,order=Array.from(bp.axisList),dirty=bp.dirty;
 const before=world.bodies.map(b=>({b,needs:b.aabbNeedsUpdate,lo:vector(b.aabb.lowerBound),hi:vector(b.aabb.upperBound)}));
 const prefixA={id:-1},prefixB={id:-2};
 function run(fn){
  const a=[prefixA],b=[prefixB];fn.call(bp,world,a,b);
  assert.equal(a.length,b.length);
  return {pairs:a.map((body,i)=>[body.id,b[i].id]),order:Array.from(bp.axisList,b=>b.id),dirty:bp.dirty,bodies:Array.from(world.bodies,bodyState)};
 }
 const expected=run(native);
 bp.axisList.splice(0,bp.axisList.length,...order);bp.dirty=dirty;
 for(const s of before){s.b.aabbNeedsUpdate=s.needs;s.b.aabb.lowerBound.set(...s.lo);s.b.aabb.upperBound.set(...s.hi);}
 const actual=run(bp.collisionPairs);assert.deepEqual(actual,expected,label);
 assert.equal(C.SAPBroadphase.prototype.collisionPairs,native,'the oracle remains the bundled Cannon implementation');
 return actual;
}
function add(env,{p=[0,0,0],half=[.2,.2,.2],radius=null,type=env.C.Body.DYNAMIC,sleep=env.C.Body.SLEEPING,offset=[0,0,0],turn=[0,0,0],group=1,mask=-1}={}){
 const {C,world}=env,b=new C.Body({mass:type===C.Body.STATIC?0:1});
 b.type=type;b.position.set(...p);b.quaternion.setFromEuler(...turn);
 b.addShape(radius===null?new C.Box(new C.Vec3(...half)):new C.Sphere(radius),new C.Vec3(...offset));
 b.sleepState=sleep;b.collisionFilterGroup=group;b.collisionFilterMask=mask;
 world.addBody(b);return b;
}
function passivePadding(env,n=64){for(let i=0;i<n;i++)add(env,{p:[50+i*.7,50+(i%3),50],type:i%3===0?env.C.Body.STATIC:env.C.Body.DYNAMIC});}
function random(seed){let s=seed;return ()=>((s=(s*1664525+1013904223)>>>0)/4294967296);}

for(const axis of [0,1,2])for(const boxes of [false,true])test(`SAP preserves ordered native pairs for mixed compounds, filters and planes on axis ${axis}, AABB=${boxes}`,()=>{
 const env=raw(),{C,world,bp}=env,r=random(901+axis);bp.axisIndex=axis;bp.useBoundingBoxes=boxes;
 for(let i=0;i<96;i++){
  const type=[C.Body.DYNAMIC,C.Body.STATIC,C.Body.KINEMATIC,C.Body.DYNAMIC|C.Body.KINEMATIC][i%4];
  const b=add(env,{p:[r()*8-4,r()*8-4,r()*8-4],half:[.05+r(),.05+r(),.05+r()],radius:i%5===0?.1+r():null,type,sleep:i%3===0?C.Body.SLEEPING:i%3===1?C.Body.AWAKE:C.Body.SLEEPY,offset:[r()*2-1,r()-.5,r()*2-1],turn:[r()*3,r()*3,r()*3],group:1<<(i%3),mask:i%7===0?0:i%5===0?2:7});
  if(i%6===0){const q=new C.Quaternion();q.setFromEuler(.2,.7,-.4);b.addShape(new C.Box(new C.Vec3(.1,.3,.2)),new C.Vec3(-1.2,.5,.3),q);}
 }
 const plane=new C.Body({mass:0});plane.addShape(new C.Plane());plane.quaternion.setFromEuler(-Math.PI/2,.2,0);world.addBody(plane);
 for(let round=0;round<8;round++){
  const b=world.bodies[(round*13)%96];b.position.x+=r()-.5;b.quaternion.setFromEuler(r(),r(),r());b.aabbNeedsUpdate=true;
  b.sleepState=[C.Body.SLEEPING,C.Body.SLEEPY,C.Body.AWAKE][round%3];b.collisionFilterMask=round%2?7:1;
  bp.dirty=true;compare(env,`round ${round}, dirty sort`);compare(env,`round ${round}, clean sorted list`);
 }
});

test('SAP preserves native filter-before-break semantics for sleeping and masked intervening bodies',()=>{
 for(const rejected of ['sleep','mask']){
  const env=raw(),{C,bp}=env;bp.useBoundingBoxes=false;
  const a=add(env,{p:[0,0,0],radius:.1,sleep:rejected==='sleep'?C.Body.SLEEPING:C.Body.AWAKE});
  const middle=add(env,{p:[1,0,0],radius:.1,group:rejected==='mask'?2:1,mask:rejected==='mask'?2:-1});
  const wide=add(env,{p:[2,0,0],half:[.1,5,.1],sleep:C.Body.AWAKE});passivePadding(env);
  assert(!bp.needBroadphaseCollision(a,middle));assert(!C.SAPBroadphase.checkBounds(a,middle,0));
  const result=compare(env,rejected);
  assert(result.pairs.some(([x,y])=>x===a.id&&y===wide.id),'the rejected middle body must not hide a later native sphere candidate');
 }
});

test('SAP keeps touching bounds and asymmetric local offsets consistent with the native output',()=>{
 const env=raw(),{C,bp}=env;passivePadding(env);
 const a=add(env,{p:[0,0,0],radius:.5,sleep:C.Body.AWAKE}),b=add(env,{p:[1,0,0],radius:.5});
 add(env,{p:[4,0,0],half:[.3,.1,.2],offset:[-3.9,0,0],turn:[.1,.2,.3]});
 for(const boxes of [false,true])for(const delta of [0,-1e-12,1e-12]){
  bp.useBoundingBoxes=boxes;b.position.x=1+delta;b.aabbNeedsUpdate=true;bp.dirty=true;
  const result=compare(env,`bounds ${boxes}/${delta}`);
  if(!boxes&&delta>=0)assert(!result.pairs.some(([x,y])=>x===a.id&&y===b.id),'native strict sphere tangency stays strict');
 }
});

test('SAP rebuilds activity from live type and sleep state after wake, masks, removal and scene replacement',()=>{
 const env=raw(),{C,world,bp}=env;bp.useBoundingBoxes=true;passivePadding(env);
 const a=add(env,{p:[0,0,0]}),b=add(env,{p:[.1,0,0]});compare(env,'all sleeping');
 const present=()=>compare(env).pairs.some(([x,y])=>x===a.id&&y===b.id||x===b.id&&y===a.id);
 a.wakeUp();assert(present(),'a wake without a dirty sort is visible immediately');
 a.sleepState=C.Body.SLEEPY;assert(present(),'SLEEPY still participates as an active body');
 a.type=C.Body.KINEMATIC;a.sleepState=C.Body.AWAKE;assert(!present(),'awake kinematic follows the bundled passive predicate');
 b.wakeUp();assert(present(),'a dynamic body can collide with the kinematic body');
 b.collisionFilterMask=0;assert(!present());b.collisionFilterMask=-1;assert(present());
 a.type=C.Body.DYNAMIC;a.sleep();b.sleep();assert(!present());
 a.type=C.Body.STATIC;b.sleepState=C.Body.SLEEPY;assert(present());
 world.removeBody(a);const afterRemoval=compare(env);assert(afterRemoval.pairs.every(pair=>!pair.includes(a.id)));
 for(const body of Array.from(world.bodies))world.removeBody(body);compare(env,'empty after a populated index');
 const single=add(env,{p:[3,0,0],sleep:C.Body.AWAKE});compare(env,'one body');world.removeBody(single);
 passivePadding(env,96);const next=add(env,{p:[0,0,0],sleep:C.Body.AWAKE}),other=add(env,{p:[.1,0,0]});
 assert(compare(env,'new scene').pairs.some(pair=>pair[0]===next.id&&pair[1]===other.id));
});

test('scene size and active-density transitions preserve pairs when switching query paths',()=>{
 const env=raw(),{C,world}=env,a=add(env,{p:[0,0,0],sleep:C.Body.AWAKE});add(env,{p:[.1,0,0]});passivePadding(env,29);
 assert.equal(world.bodies.length,31);compare(env,'31 bodies');
 const extra=add(env,{p:[100,0,0]});compare(env,'32 bodies, sparse activity');
 for(const b of world.bodies)b.wakeUp();compare(env,'32 bodies, dense activity');
 for(const b of world.bodies)b.sleep();a.wakeUp();compare(env,'32 bodies, sparse again');
 world.removeBody(extra);compare(env,'31 bodies again');
});

test('a wholly passive list avoids quadratic predicate visits while retaining AABB sorting and output prefixes',()=>{
 const env=raw(),{C,world,bp,native}=env;passivePadding(env,128);
 const need=bp.needBroadphaseCollision;let calls=0;bp.needBroadphaseCollision=function(a,b){calls++;return need.call(this,a,b);};
 const a=[],b=[];native.call(bp,world,a,b);assert.equal(calls,128*127/2);assert.equal(a.length,0);
 calls=0;bp.axisList.reverse();bp.dirty=true;for(const body of world.bodies)body.aabbNeedsUpdate=true;
 bp.collisionPairs(world,a,b);assert.equal(calls,0);assert.equal(bp.dirty,false);assert.equal(a.length,0);
 assert(world.bodies.every(body=>!body.aabbNeedsUpdate&&body.sleepState===C.Body.SLEEPING));
 compare(env,'query preserves side effects and existing output entries');
});

function pairedGames(){const games=[game(true),game(false)];for(const {t} of games)for(let i=0;i<64;i++){const g=t.addQubit([4+(i%8)*.22,.045,-4+Math.floor(i/8)*.22]);g.body.sleep();}return games;}
function equalGames(games,label){assert.equal(games[1].f.state(),games[0].f.state(),label);}
function stepGames(games,count,label,each=()=>{}){
 for(let step=0;step<count;step++){
  for(const g of games){each(g,step);g.t.stepPhysics(g.t.getPhysicsStep());}
  if(step%15===0||step===count-1)equalGames(games,`${label}, step ${step}`);
 }
}
test('real impact, grab, release and motor restart preserve full game states with sleeping background bodies',()=>{
 const games=pairedGames();for(const g of games)g.r=g.t.spawnRotor(g.t.V(0,0,0));
 stepGames(games,360,'settle');
 for(const g of games){assert(g.t.rotorGroups(g.r).every(m=>m.body.sleepState===2));g.before=g.t.rotorGroups(g.r)[1].body.position.clone();g.projectile=g.t.addQubit([-.4,.17,0]);g.projectile.body.velocity.x=2;g.projectile.body.wakeUp();g.woke=false;}
 stepGames(games,60,'impact',g=>{g.woke ||= g.t.rotorGroups(g.r).some(m=>m.body.sleepState!==2);});
 for(const g of games){
  const {t}=g,m=t.rotorGroups(g.r)[1];assert(g.woke);assert(m.body.position.distanceTo(g.before)>.003);
  t.grabQubit({g:m,part:m.parts[0],point:m.body.position.clone(),distance:.6});assert(t.getHeld());
  const held=t.getHeld(),camera=t.V(...t.getLook().camera),dir=t.screenRay(640,360);
  held.rootOffset=m.body.position.vadd(t.V(.1,.15,0)).vsub(camera.vadd(dir.scale(held.distance)));
 }
 stepGames(games,30,'grab');for(const {t} of games)t.releaseQubit(false);stepGames(games,60,'release');
 for(const g of games){g.t.removeGroup(g.projectile);assert(g.t.configureRotor(g.r,{enabled:true}));}
 stepGames(games,60,'motor restarted');for(const g of games)assert(Math.abs(g.r.actualRpm)>1);
});

test('sleeping weight sensors retain live loads across additions, removals and saved-scene restoration',()=>{
 const games=pairedGames();
 for(const g of games){g.base=g.t.addQubit([0,.045,0]);g.middle=g.t.addQubit([0,.135,0]);g.top=g.t.addQubit([0,.225,0]);g.id=g.f.sensor(g.base).part.id;}
 stepGames(games,8,'initial stack');
 const read=g=>g.t.sensorReading(g.t.rotorPart(g.id),{mode:'weight',weight:1}).value;
 for(const g of games){assert.equal(read(g),2);for(const m of [g.base,g.middle,g.top])m.body.sleep();}
 stepGames(games,1,'sleeping contacts');for(const g of games)assert.equal(read(g),2);
 for(const g of games){g.top.body.position.y+=1;g.top.body.aabbNeedsUpdate=true;g.top.body.wakeUp();assert.equal(read(g),1);g.newLoad=g.t.addQubit([0,g.middle.body.position.y+.09,0],2);g.newLoad.body.sleep();assert.equal(read(g),3);}
 equalGames(games,'new load read immediately');
 for(const g of games){g.t.removeGroup(g.newLoad);assert.equal(read(g),1);g.snapshot=g.t.saveLab();}
 equalGames(games,'removed load');
 for(const g of games){
  const {t}=g,saved=t.hydrateLabSnapshot(JSON.parse(JSON.stringify(g.snapshot)));
  t.clearNarrativeScene();t.story.lab=saved;t.story.scene='campaign';t.enterLab(false);
  const restored=t.restoreLabRuntime(saved.runtime);assert(restored.ok,restored.warnings.join('; '));assert(t.rotorPart(g.id));
 }
 equalGames(games,'restored scene');stepGames(games,30,'restored supports');assert.equal(read(games[0]),read(games[1]));
});

test('welding and separating sleeping pieces preserve full states, matter and current SAP membership',()=>{
 const games=pairedGames();
 const inventory=t=>Array.from(t.groups).flatMap(g=>Array.from(g.parts,p=>[p.id,p.shape,p.weight])).sort((a,b)=>a[0]-b[0]);
 const mass=t=>t.groups.reduce((sum,g)=>sum+g.body.mass,0);
 const membership=g=>{
  const {world}=g.t,list=world.broadphase.axisList;
  assert.equal(list.length,world.bodies.length);assert.equal(new Set(list).size,list.length);
  for(const body of list)assert(world.bodies.includes(body),'only current world bodies remain in SAP');
  for(const body of g.retired)assert(!list.includes(body),'retired pre-weld/pre-split bodies are absent');
  assert.deepEqual(inventory(g.t),g.inventory);assert.equal(mass(g.t),g.mass);
 };
 for(const g of games){
  const {t}=g;g.a=t.addQubit([0,.045,0],2);g.b=t.addQubit([.09,.045,0],3);
  g.ids=[g.a.parts[0].id,g.b.parts[0].id];g.inventory=inventory(t);g.mass=mass(t);g.retired=[];
  g.a.body.sleep();g.b.body.sleep();g.count=t.world.bodies.length;
 }
 stepGames(games,1,'populate passive query before weld');
 for(const g of games){
  const {t}=g;g.retired.push(g.a.body,g.b.body);
  g.joined=t.weld({source:g.a,target:g.b,position:g.a.body.position.clone(),quaternion:g.a.body.quaternion.clone()});
  assert(g.joined,'adjacent cubes weld through the production operation');assert.equal(t.world.bodies.length,g.count-1);
  assert.equal(g.joined.body.mass,g.a.body.mass+g.b.body.mass);membership(g);g.joined.body.sleep();
 }
 equalGames(games,'after weld');stepGames(games,2,'welded sleep');
 for(const g of games){g.joined.body.wakeUp();g.joined.body.applyImpulse(g.t.V(.04,0,0),g.joined.body.position);}
 stepGames(games,15,'welded wake and motion');
 for(const g of games){
  const {t}=g;g.retired.push(g.joined.body);
  t.detachPart({g:g.joined,part:g.joined.parts.find(p=>p.id===g.ids[0])});
  assert.equal(t.world.bodies.length,g.count);assert.notEqual(t.rotorPart(g.ids[0]).g,t.rotorPart(g.ids[1]).g);membership(g);
 }
 equalGames(games,'after split');stepGames(games,45,'separated motion');
 for(const g of games)for(const id of g.ids)g.t.rotorPart(id).g.body.sleep();
 stepGames(games,2,'separated sleep');
 for(const g of games)g.t.rotorPart(g.ids[1]).g.body.wakeUp();
 stepGames(games,15,'one separated piece wakes');for(const g of games)membership(g);
});
