const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const createGame=require('./game-harness.cjs');
const fixtures=require('./cpu-audit-fixtures.cjs');

function game(native=false,hz=120){
 let source=fs.readFileSync(path.join(__dirname,'../assets/js/game.js'),'utf8');
 const call='installTrackedCollisionMatrices(world);';
 assert.equal(source.split(call).length,2,'disable only the game-world installer for the native oracle');
 if(native)source=source.replace(call,'');
 const at=source.lastIndexOf('})();');
 const hook='window.__contactMatrixInstall=installTrackedCollisionMatrices;';
 const result=createGame({graphics:false,gameSource:source.slice(0,at)+hook+source.slice(at)}),{t,sandbox}=result;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 t.applyPreferences({physicsHz:hz,music:false,guideVoice:false,footsteps:false,joinSounds:false});
 assert.equal(t.getPhysicsStep(),1/hz);
 return {...result,f:fixtures(t)};
}
let runtime;
function matrices(){
 runtime ||= game();
 const C=runtime.sandbox.CANNON,world=new C.World();runtime.sandbox.__contactMatrixInstall(world);
 return {C,world,native:new C.ArrayCollisionMatrix(),tracked:world.collisionMatrix};
}
const matrixHole=Symbol('matrix hole');
function backing(matrix){
 const a=matrix.matrix;
 // Keep holes distinct from both explicit undefined and zero. Array.from alone
 // would erase one observable difference made by the bundled resize/reset API.
 return {length:a.length,slots:Array.from({length:a.length},(_,i)=>i in a?a[i]:matrixHole)};
}
function compareMatrices(actual,expected,count,label){
 assert.deepEqual(backing(actual),backing(expected),label+' backing storage');
 for(let i=0;i<count;i++)for(let j=0;j<i;j++){
  assert.equal(actual.get({index:i},{index:j}),expected.get({index:i},{index:j}),label+` get ${i}/${j}`);
  assert.equal(actual.get({index:j},{index:i}),expected.get({index:j},{index:i}),label+` reversed ${j}/${i}`);
 }
}
function applyBoth(pair,method,...args){
 const expected=pair.native[method](...args),actual=pair.tracked[method](...args);
 assert.equal(actual,expected,method+' return value');
}
function random(seed){let s=seed;return ()=>((s=(s*1664525+1013904223)>>>0)/4294967296);}

test('tracked matrices preserve native holes, truth conversion, repeated writes and reset results',()=>{
 const pair=matrices(),a={index:1},b={index:0};
 compareMatrices(pair.tracked,pair.native,2,'new matrix');
 applyBoth(pair,'setNumObjects',300);compareMatrices(pair.tracked,pair.native,12,'grown but never reset');
 assert.equal(pair.tracked.get(a,b),undefined,'new allocated entries remain holes until reset or set');
 for(const value of [true,true,false,0,null,undefined,'',1,-1,'contact',{},false,true]){
  applyBoth(pair,'set',a,b,value);compareMatrices(pair.tracked,pair.native,12,'write '+String(value));
 }
 applyBoth(pair,'reset');compareMatrices(pair.tracked,pair.native,12,'first reset');
 applyBoth(pair,'reset');compareMatrices(pair.tracked,pair.native,12,'empty reset after reset');
 assert.equal(pair.tracked.get(a,b),0);
 // A lower index written false must not make a later true escape cleanup.
 for(let i=0;i<24;i++)applyBoth(pair,'set',a,b,i%3!==1);
 applyBoth(pair,'reset');compareMatrices(pair.tracked,pair.native,12,'repeated true/false/true');
 // Cannon's (0,0) key is the property "-1", not an array element. Preserve this
 // unusual public-API behavior even though the contact loop uses distinct bodies.
 const zero={index:0};applyBoth(pair,'set',zero,zero,true);
 for(const action of [()=>applyBoth(pair,'reset'),()=>applyBoth(pair,'setNumObjects',0),()=>applyBoth(pair,'reset')]){
  action();assert.equal(pair.tracked.get(zero,zero),pair.native.get(zero,zero));
  assert.equal(pair.tracked.matrix[-1],1);assert(Object.hasOwn(pair.tracked.matrix,'-1'));
 }
 assert.equal(pair.C.ArrayCollisionMatrix.prototype.get,pair.tracked.get,'reads keep the native method');
 assert.equal(pair.C.ArrayCollisionMatrix.prototype.reset,pair.native.reset,'the bundled oracle remains untouched');
});

test('implicit native growth, shrinking and regrowth cannot resurrect truncated contact entries',()=>{
 const pair=matrices();
 applyBoth(pair,'setNumObjects',8);applyBoth(pair,'reset');
 applyBoth(pair,'set',{index:7},{index:6},true);
 assert(pair.native.matrix.length>8*7/2,'the bundled index formula can extend its allocated triangle');
 compareMatrices(pair.tracked,pair.native,8,'implicit growth');
 applyBoth(pair,'setNumObjects',2);compareMatrices(pair.tracked,pair.native,8,'truncate dirty high index');
 applyBoth(pair,'reset');compareMatrices(pair.tracked,pair.native,8,'reset must not extend a shrunken array');
 applyBoth(pair,'setNumObjects',12);compareMatrices(pair.tracked,pair.native,12,'regrowth remains holes');
 applyBoth(pair,'set',{index:11},{index:10},false);
 compareMatrices(pair.tracked,pair.native,12,'false write can grow too');
 applyBoth(pair,'reset');compareMatrices(pair.tracked,pair.native,12,'new suffix is cleared');
 for(const n of [0,1,32,3,0,16]){
  applyBoth(pair,'setNumObjects',n);compareMatrices(pair.tracked,pair.native,32,'resize '+n);
  applyBoth(pair,'reset');compareMatrices(pair.tracked,pair.native,32,'reset '+n);
 }
});

test('large sparse matrices preserve surviving contacts and holes when shrinking above the small-world boundary',()=>{
 const pair=matrices();applyBoth(pair,'setNumObjects',400);applyBoth(pair,'reset');
 const lowA={index:150},lowB={index:149},highA={index:399},highB={index:398};
 applyBoth(pair,'set',lowA,lowB,true);applyBoth(pair,'set',highA,highB,true);
 applyBoth(pair,'setNumObjects',300);
 assert(pair.native.matrix.length>32768,'shrink still exercises tracked large storage');
 compareMatrices(pair.tracked,pair.native,400,'large shrink before reset');
 assert.equal(pair.tracked.get(lowA,lowB),1);assert.equal(pair.tracked.get(highA,highB),undefined);
 applyBoth(pair,'reset');compareMatrices(pair.tracked,pair.native,400,'large shrink cleanup');
 applyBoth(pair,'setNumObjects',400);compareMatrices(pair.tracked,pair.native,400,'large regrowth with holes');
 applyBoth(pair,'set',highA,highB,false);applyBoth(pair,'reset');compareMatrices(pair.tracked,pair.native,400,'large regrowth cleanup');
 // Crossing down into the native small-array route and back must not leave
 // an obsolete initialized prefix or pending contact in either route.
 for(const size of [100,400]){
  applyBoth(pair,'setNumObjects',size);applyBoth(pair,'set',lowA,lowB,true);applyBoth(pair,'reset');
  compareMatrices(pair.tracked,pair.native,400,'size boundary '+size);
 }
});

test('large empty and repeated sparse batches clear only required entries after native initialization',()=>{
 const pair=matrices(),writes={native:0,tracked:0};
 for(const name of ['native','tracked']){
  const matrix=pair[name];matrix.matrix=new Proxy(matrix.matrix,{set(target,key,value){writes[name]++;return Reflect.set(target,key,value);}});
 }
 applyBoth(pair,'setNumObjects',300);writes.native=0;writes.tracked=0;applyBoth(pair,'reset');
 const length=pair.native.matrix.length;assert(length>32768);
 assert.equal(writes.native,length);assert.equal(writes.tracked,length,'initial holes receive the native required zeros');
 writes.native=0;writes.tracked=0;applyBoth(pair,'reset');
 assert.equal(writes.native,length);assert.equal(writes.tracked,0,'an already empty large matrix has no entries to clear');
 for(let i=0;i<24;i++)applyBoth(pair,'set',{index:123},{index:7},i%3!==1);
 writes.native=0;writes.tracked=0;applyBoth(pair,'reset');
 assert.equal(writes.native,length);assert.equal(writes.tracked,1,'repeated writes retain one pending contact entry');
 compareMatrices(pair.tracked,pair.native,300,'counted sparse reset');
});

test('sparse, dense and changing contact batches match the native matrix through repeated ticks',()=>{
 const pair=matrices(),r=random(42531);
 for(let phase=0;phase<32;phase++){
  const n=[2,16,48,9,32,3,0,24][phase%8];applyBoth(pair,'setNumObjects',n);
  if(n>1){
   if(phase%3===0)for(let i=1;i<n;i++)for(let j=0;j<i;j++)applyBoth(pair,'set',{index:i},{index:j},true);
   else for(let k=0;k<96;k++){
    const i=1+Math.floor(r()*(n-1)),j=Math.floor(r()*i);
    applyBoth(pair,'set',{index:i},{index:j},k%5!==0);
   }
  }
  compareMatrices(pair.tracked,pair.native,48,'batch '+phase);
  applyBoth(pair,'reset');compareMatrices(pair.tracked,pair.native,48,'batch reset '+phase);
 }
});

test('non-array properties keep native values through sparse, dense and empty resets',()=>{
 const pair=matrices(),a={index:2},b={index:.5};
 applyBoth(pair,'setNumObjects',300);applyBoth(pair,'reset');
 applyBoth(pair,'set',a,b,true);
 assert.equal(pair.native.matrix['2.5'],1,'the fractional native key is a property, not an array element');
 for(const dense of [false,true,false]){
  if(dense)for(let i=1;i<300;i++)for(let j=0;j<i;j++)applyBoth(pair,'set',{index:i},{index:j},true);
  else applyBoth(pair,'set',{index:5},{index:1},true);
  applyBoth(pair,'reset');compareMatrices(pair.tracked,pair.native,64,'properties after '+(dense?'dense':'sparse'));
  assert.equal(pair.tracked.get(a,b),pair.native.get(a,b));assert.equal(pair.tracked.matrix['2.5'],1);
 }
 applyBoth(pair,'setNumObjects',0);applyBoth(pair,'reset');
 assert.equal(pair.tracked.matrix.length,0);assert.equal(pair.tracked.get(a,b),1);assert.equal(pair.native.get(a,b),1);
});

function rawWorlds(){
 runtime ||= game();const C=runtime.sandbox.CANNON;
 return [false,true].map(tracked=>{
  const world=new C.World();world.allowSleep=true;world.gravity.set(0,0,0);
  if(tracked)runtime.sandbox.__contactMatrixInstall(world);
  return {C,world,events:[]};
 });
}
function addBody(env,{x=0,y=0,z=0,mass=1,response=false,box=false}={}){
 const {C,world,events}=env,body=new C.Body({mass});body.position.set(x,y,z);body.collisionResponse=response;
 body.addShape(box?new C.Box(new C.Vec3(.5,.5,.5)):new C.Sphere(.5));
 body.addEventListener('collide',event=>events.push({
  type:event.type,self:body.index,other:event.body.index,
  current:world.collisionMatrix.get(body,event.body),previous:world.collisionMatrixPrevious.get(body,event.body),
  normal:[event.contact.ni.x,event.contact.ni.y,event.contact.ni.z]
 }));
 for(const type of ['sleepy','sleep','wakeup'])body.addEventListener(type,()=>events.push({type,self:body.index}));
 world.addBody(body);return body;
}
function worldState(env){
 const v=a=>[a.x,a.y,a.z],{world}=env;
 return {
  time:world.time,step:world.stepnumber,
  bodies:Array.from(world.bodies,b=>({index:b.index,type:b.type,mass:b.mass,sleep:b.sleepState,
   p:v(b.position),q:[b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w],v:v(b.velocity),w:v(b.angularVelocity),force:v(b.force),torque:v(b.torque)})),
  contacts:Array.from(world.contacts,c=>({a:c.bi.index,b:c.bj.index,enabled:c.enabled,n:v(c.ni),aPoint:v(c.ri),bPoint:v(c.rj),multiplier:c.multiplier})),
  matrix:backing(world.collisionMatrix),previous:backing(world.collisionMatrixPrevious),events:env.events
 };
}
function compareWorlds(worlds,label){assert.deepEqual(worldState(worlds[1]),worldState(worlds[0]),label);}

test('world ticks preserve the identity and contents of the current and previous matrices',()=>{
 const worlds=rawWorlds();
 for(const env of worlds){
  for(let i=0;i<5;i++)addBody(env,{x:i*3});
  env.first=env.world.collisionMatrix;env.second=env.world.collisionMatrixPrevious;
  env.world.collisionMatrix.set(env.world.bodies[3],env.world.bodies[1],true);
 }
 compareWorlds(worlds,'before first tick');
 for(let tick=0;tick<6;tick++){
  for(const env of worlds){
   const {world}=env,oldCurrent=world.collisionMatrix,oldPrevious=world.collisionMatrixPrevious;
   world.collisionMatrixTick();assert.equal(world.collisionMatrix,oldPrevious);assert.equal(world.collisionMatrixPrevious,oldCurrent);
   if(tick%2===0)world.collisionMatrix.set(world.bodies[4],world.bodies[tick%3],true);
  }
  compareWorlds(worlds,'swap '+tick);
 }
});

test('stable-size sparse to dense to sparse batches preserve both matrix slots across swaps and resizing',()=>{
 const worlds=rawWorlds(),count=300;
 for(const env of worlds){
  for(let i=0;i<count;i++)addBody(env,{x:i*3});
  // Pre-initialize both arrays to the native maximum key for this fixed body
  // count. Later dense/sparse transitions therefore do not rely on growth.
  for(const matrix of [env.world.collisionMatrix,env.world.collisionMatrixPrevious]){
   matrix.setNumObjects(count);matrix.set(env.world.bodies[count-1],env.world.bodies[count-2],false);matrix.reset();
  }
  env.stableLength=env.world.collisionMatrix.matrix.length;
 }
 for(const [phase,dense] of [false,true,false,false,true,true,false,false].entries()){
  for(const env of worlds){
   const {world}=env,matrix=world.collisionMatrix,b=world.bodies;
   if(dense)for(let i=1;i<count;i++)for(let j=0;j<i;j++)matrix.set(b[i],b[j],true);
   else for(const [i,j] of [[1,0],[19,7],[count-1,count-2]]){
    matrix.set(b[i],b[j],true);matrix.set(b[i],b[j],false);matrix.set(b[i],b[j],true);
   }
   assert.equal(matrix.matrix.length,env.stableLength,'constant capacity during density transitions');
  }
  compareWorlds(worlds,'batch '+phase);
  for(const env of worlds){
   const before=env.world.collisionMatrix,contents=backing(before);
   env.world.collisionMatrixTick();assert.equal(env.world.collisionMatrixPrevious,before);
   assert.deepEqual(backing(env.world.collisionMatrixPrevious),contents,'swap retains the preceding contacts');
  }
  compareWorlds(worlds,'density transition '+phase);
  compareMatrices(worlds[1].world.collisionMatrix,worlds[0].world.collisionMatrix,count,'cleared slot '+phase);
 }
 // Shrink while a dense batch still awaits cleanup, then grow it through the
 // normal add/remove API. Previous and current arrays have different lifetimes.
 for(const env of worlds){
  const {world}=env,b=Array.from(world.bodies);
  for(let i=1;i<count;i++)for(let j=0;j<i;j++)world.collisionMatrix.set(b[i],b[j],true);
  for(let i=count-1;i>=3;i--)world.removeBody(b[i]);
 }
 compareWorlds(worlds,'dense slot shrunk before cleanup');
 for(let tick=0;tick<2;tick++){
  for(const env of worlds)env.world.collisionMatrixTick();compareWorlds(worlds,'shrunk tick '+tick);
 }
 for(const env of worlds)for(let i=3;i<count;i++)addBody(env,{x:i*3});
 compareWorlds(worlds,'grow after dense cleanup');
 for(let tick=0;tick<2;tick++){
  for(const env of worlds)env.world.collisionMatrixTick();compareWorlds(worlds,'regrown tick '+tick);
 }
});

test('collision events retain native order and multiplicity across persistence, separation and recontact',()=>{
 const worlds=rawWorlds();
 for(const env of worlds){
  env.world.allowSleep=false;
  for(let i=0;i<300;i++)addBody(env,{mass:0,x:100+i*3});
  env.a=addBody(env,{mass:0,box:true});env.b=addBody(env,{x:.8,box:true});
 }
 function step(label){for(const env of worlds)env.world.step(1/120);compareWorlds(worlds,label);}
 step('first contact');
 const firstCount=worlds[0].events.length;assert(firstCount>2,'box contact points retain native repeated collide events for one body pair');
 assert(worlds[0].events.every(e=>e.type==='collide'&&e.current===1));
 step('persistent contact');assert.equal(worlds[0].events.length,firstCount,'persistence is not reported as a new impact');
 for(const env of worlds){env.b.position.x=4;env.b.aabbNeedsUpdate=true;}
 step('separation');assert.equal(worlds[0].world.contacts.length,0);assert.equal(worlds[0].events.length,firstCount);
 step('second separated step');
 for(const env of worlds){env.b.position.x=.8;env.b.aabbNeedsUpdate=true;}
 step('contact again');assert.equal(worlds[0].events.length,firstCount*2,'a later contact must fire again');
});

test('removing and reindexing bodies preserves native current/previous history through new contacts',()=>{
 const worlds=rawWorlds();
 for(const env of worlds){
  env.retired=addBody(env,{x:-20,mass:0});env.a=addBody(env,{x:0,mass:0});env.b=addBody(env,{x:.8});env.last=addBody(env,{x:8});
  env.world.step(1/120);env.world.step(1/120);
 }
 compareWorlds(worlds,'initial contacts');
 for(const env of worlds){env.world.removeBody(env.retired);assert.equal(env.a.index,0);assert.equal(env.b.index,1);}
 compareWorlds(worlds,'remove before tick, including native unremapped history');
 for(const env of worlds){env.world.step(1/120);env.world.removeBody(env.last);env.world.step(1/120);}
 compareWorlds(worlds,'after removal and ticks');
 for(const env of worlds){env.next=addBody(env,{x:1.6});env.world.step(1/120);}
 compareWorlds(worlds,'new body with reused last index');
 for(const env of worlds){
  for(const body of Array.from(env.world.bodies))env.world.removeBody(body);
  env.world.collisionMatrixTick();env.world.collisionMatrixTick();
  addBody(env,{mass:0});addBody(env,{x:.8});env.world.step(1/120);
 }
 compareWorlds(worlds,'empty then entirely replaced scene');
});

function pairedGames(hz=120){
 const games=[game(true,hz),game(false,hz)];
 for(const {t} of games)for(let i=0;i<300;i++){const g=t.addQubit([4+(i%8)*.22,.045,-4+Math.floor(i/8)*.22]);g.body.sleep();}
 return games;
}
function equalGames(games,label){
 assert.equal(games[1].f.state(),games[0].f.state(),label+' complete physical/game state');
 assert.deepEqual(backing(games[1].t.world.collisionMatrix),backing(games[0].t.world.collisionMatrix),label+' current');
 assert.deepEqual(backing(games[1].t.world.collisionMatrixPrevious),backing(games[0].t.world.collisionMatrixPrevious),label+' previous');
}
function stepGames(games,count,label,each=()=>{}){
 for(let step=0;step<count;step++){
  for(const g of games){each(g,step);g.t.stepPhysics(g.t.getPhysicsStep());}
  if(step%15===0||step===count-1)equalGames(games,`${label}, step ${step}`);
 }
}

test('sleeping mechanisms wake on impact, accept grabs and restart without changing full game state',()=>{
 const games=pairedGames();for(const g of games)g.r=g.t.spawnRotor(g.t.V(0,0,0));
 stepGames(games,360,'settle');
 for(const g of games){
  assert(g.t.rotorGroups(g.r).every(m=>m.body.sleepState===2));g.before=g.t.rotorGroups(g.r)[1].body.position.clone();
  g.projectile=g.t.addQubit([-.4,.17,0]);g.projectile.body.velocity.x=2;g.projectile.body.wakeUp();g.woke=false;
 }
 stepGames(games,60,'impact',g=>{g.woke ||= g.t.rotorGroups(g.r).some(m=>m.body.sleepState!==2);});
 for(const g of games){
  const {t}=g,m=t.rotorGroups(g.r)[1];assert(g.woke);assert(m.body.position.distanceTo(g.before)>.003);
  t.grabQubit({g:m,part:m.parts[0],point:m.body.position.clone(),distance:.6});assert(t.getHeld());
  const held=t.getHeld(),camera=t.V(...t.getLook().camera),dir=t.screenRay(640,360);
  held.rootOffset=m.body.position.vadd(t.V(.1,.15,0)).vsub(camera.vadd(dir.scale(held.distance)));
 }
 stepGames(games,30,'grab');for(const {t} of games)t.releaseQubit(false);stepGames(games,60,'release');
 for(const g of games){g.t.removeGroup(g.projectile);assert(g.t.configureRotor(g.r,{enabled:true}));}
 stepGames(games,60,'motor restart');for(const g of games)assert(Math.abs(g.r.actualRpm)>1);
});

test('contact and weight sensors preserve sleeping loads, immediate changes and saved-scene restoration',()=>{
 const games=pairedGames();
 for(const g of games){g.base=g.t.addQubit([0,.045,0]);g.middle=g.t.addQubit([0,.135,0]);g.top=g.t.addQubit([0,.225,0]);g.id=g.f.sensor(g.base).part.id;}
 const reading=g=>({weight:g.t.sensorReading(g.t.rotorPart(g.id),{mode:'weight',weight:1}).value,contact:g.t.sensorContactActive(g.t.rotorPart(g.id))});
 stepGames(games,8,'initial stack');
 for(const g of games){assert.equal(reading(g).weight,2);for(const m of [g.base,g.middle,g.top])m.body.sleep();}
 stepGames(games,1,'sleeping stack');assert.deepEqual(reading(games[1]),reading(games[0]));
 for(const g of games){
  assert.equal(reading(g).weight,2);g.top.body.position.y+=1;g.top.body.aabbNeedsUpdate=true;g.top.body.wakeUp();assert.equal(reading(g).weight,1);
  g.newLoad=g.t.addQubit([0,g.middle.body.position.y+.09,0],2);g.newLoad.body.sleep();assert.equal(reading(g).weight,3);
 }
 equalGames(games,'new sleeping load');assert.deepEqual(reading(games[1]),reading(games[0]));
 for(const g of games){g.t.removeGroup(g.newLoad);assert.equal(reading(g).weight,1);g.snapshot=g.t.saveLab();}
 equalGames(games,'removed load');
 for(const g of games){
  const {t}=g,saved=t.hydrateLabSnapshot(JSON.parse(JSON.stringify(g.snapshot)));
  t.clearNarrativeScene();t.story.lab=saved;t.story.scene='campaign';t.enterLab(false);
  const restored=t.restoreLabRuntime(saved.runtime);assert(restored.ok,restored.warnings.join('; '));assert(t.rotorPart(g.id));
 }
 equalGames(games,'restored scene');stepGames(games,30,'restored supports');assert.deepEqual(reading(games[1]),reading(games[0]));
});

for(const hz of [60,120,240])test(`a live contact sensor activates, separates and reactivates at the selected ${hz} Hz`,()=>{
 const games=pairedGames(hz);
 for(const g of games){
  const {t,sandbox}=g;g.sensor=t.addQubit([.04,.046,0]);g.hit=g.f.sensor(g.sensor,'contact');
  g.wall=new sandbox.CANNON.Body({mass:0,shape:new sandbox.CANNON.Box(t.V(.04,.3,.4)),position:t.V(.12,.3,0)});t.world.addBody(g.wall);
 }
 stepGames(games,1,'contact');for(const g of games)assert(g.t.sensorContactActive(g.hit));
 for(const g of games)g.t.world.removeBody(g.wall);
 stepGames(games,1,'wall removed');for(const g of games)assert(!g.t.sensorContactActive(g.hit));
 for(const g of games){
  g.sensor.body.position.set(.04,.046,0);g.sensor.body.quaternion.set(0,0,0,1);g.sensor.body.velocity.set(0,0,0);g.sensor.body.angularVelocity.set(0,0,0);
  g.sensor.body.aabbNeedsUpdate=true;g.sensor.body.wakeUp();g.t.world.addBody(g.wall);
 }
 stepGames(games,1,'wall added again');for(const g of games)assert(g.t.sensorContactActive(g.hit));
});

test('welding and splitting change body indices without changing matter, mass or contact history semantics',()=>{
 const games=pairedGames();
 const inventory=t=>Array.from(t.groups).flatMap(g=>Array.from(g.parts,p=>[p.id,p.shape,p.weight])).sort((a,b)=>a[0]-b[0]);
 const mass=t=>t.groups.reduce((sum,g)=>sum+g.body.mass,0);
 for(const g of games){
  const {t}=g;g.a=t.addQubit([0,.045,0],2);g.b=t.addQubit([.09,.045,0],3);g.ids=[g.a.parts[0].id,g.b.parts[0].id];
  g.inventory=inventory(t);g.mass=mass(t);g.count=t.world.bodies.length;g.a.body.sleep();g.b.body.sleep();
 }
 stepGames(games,1,'before weld');
 for(const g of games){
  const {t}=g;g.joined=t.weld({source:g.a,target:g.b,position:g.a.body.position.clone(),quaternion:g.a.body.quaternion.clone()});
  assert(g.joined);assert.equal(t.world.bodies.length,g.count-1);assert.equal(g.joined.body.mass,g.a.body.mass+g.b.body.mass);
  assert.deepEqual(inventory(t),g.inventory);assert.equal(mass(t),g.mass);g.joined.body.sleep();
 }
 equalGames(games,'welded');stepGames(games,2,'welded sleep');
 for(const g of games){g.joined.body.wakeUp();g.joined.body.applyImpulse(g.t.V(.04,0,0),g.joined.body.position);}
 stepGames(games,15,'welded motion');
 for(const g of games){
  const {t}=g;t.detachPart({g:g.joined,part:g.joined.parts.find(p=>p.id===g.ids[0])});
  assert.equal(t.world.bodies.length,g.count);assert.notEqual(t.rotorPart(g.ids[0]).g,t.rotorPart(g.ids[1]).g);
  assert.deepEqual(inventory(t),g.inventory);assert.equal(mass(t),g.mass);
 }
 equalGames(games,'split');stepGames(games,45,'split motion');
 for(const g of games)for(const id of g.ids)g.t.rotorPart(id).g.body.sleep();
 stepGames(games,2,'split sleep');for(const g of games)g.t.rotorPart(g.ids[1]).g.body.wakeUp();stepGames(games,15,'wake one piece');
});
