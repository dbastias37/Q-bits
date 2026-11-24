// Pure movement/scenery contracts. These tests do not certify browser pixels,
// frame time, rendered stairs, audio or the integration with physical grabbing.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const passage=require('../assets/js/factory-passage.js');
const close=(a,b,epsilon=1e-7)=>assert(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const clone=value=>JSON.parse(JSON.stringify(value));

test('passage is available in browser and Node without physics or DOM dependencies',()=>{
 const sandbox={window:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/js/factory-passage.js'),'utf8'),sandbox);
 assert.equal(typeof sandbox.window.QBitsFactoryPassage.constrainMove,'function');
 assert.equal(sandbox.window.QBitsFactoryPassage.VERSION,passage.VERSION);
 assert.equal('CANNON' in sandbox,false);assert.equal('document' in sandbox,false);
});

test('route fits the room, reaches two distinct flights and keeps a horizontal landing',()=>{
 assert.deepEqual(passage.sampleRoute(0).p,[...passage.START]);
 assert.deepEqual(passage.sampleRoute(passage.ROUTE_LENGTH).p,[...passage.EXIT]);
 let previous=passage.sampleRoute(0).p,landings=0;
 for(let d=.01;d<passage.ROUTE_LENGTH;d+=.01){
  const {p}=passage.sampleRoute(d);
  assert(p[0]>-14&&p[0]<14&&p[2]>-14&&p[2]<14);
  assert(p[1]>=0&&p[1]<=3);assert(p[1]<=previous[1]+1e-7);
  assert(Math.hypot(p[0]-previous[0],p[1]-previous[1],p[2]-previous[2])<.04,'no guide teleport at a corner or riser');
  if(p[2]<-3.4&&p[2]>-4.6){close(p[1],1.5);landings++;}
  previous=p;
 }
 assert(landings>100);
 for(const [z,y] of [[-.3,3],[-1.8,2.25],[-3.3,1.5],[-4,1.5],[-4.7,1.5],[-6.2,.75],[-7.7,0]])close(passage.floorAt(-3,z),y);
});

test('camera floor is continuous and the guide stays above every visible stair tread',()=>{
 for(const z of [-.3,-3.3,-4.7,-7.7])close(passage.floorAt(-3,z-1e-7),passage.floorAt(-3,z+1e-7),1e-6);
 for(let d=0;d<=passage.ROUTE_LENGTH;d+=.003){
  const p=passage.sampleRoute(d).p;
  assert(p[1]+1e-7>=passage.treadHeightAt(p[0],p[2]),'a small guide cannot sink into a taller stair');
 }
});

test('guide turns continuously through the corridor corners',()=>{
 let previous=passage.sampleRoute(0);
 for(let d=.01;d<=passage.ROUTE_LENGTH;d+=.01){
  const pose=passage.sampleRoute(d);
  assert(Math.abs(pose.yaw-previous.yaw)<.15,'no instantaneous quarter turn');
  assert(Math.abs(pose.pitch-previous.pitch)<.15,'no instantaneous change of slope');
  previous=pose;
 }
});

test('a player can walk the complete corridor and both turns using ordinary incremental movement',()=>{
 let player=[...passage.START];
 for(let d=0;d<=passage.ROUTE_LENGTH+.05;d+=.05){
  const target=passage.sampleRoute(Math.min(d,passage.ROUTE_LENGTH)).p;
  player=passage.constrainMove(player,target);
  close(player[0],target[0]);close(player[2],target[2]);close(player[1],passage.floorAt(player[0],player[2]));
 }
 assert.deepEqual(player,[...passage.EXIT]);
});

test('walls prevent shortcuts and large steps cannot tunnel through the inside corner',()=>{
 const againstGlass=passage.constrainMove(passage.START,[12,3,7.5]);
 assert(againstGlass[0]<=.72+1e-7);close(againstGlass[2],7.5);
 const blocked=passage.constrainMove([0,3,5],[-3,3,5]);
 assert(blocked[0]>=-.72-1e-7);close(blocked[2],5);
 const downUpperWall=passage.constrainMove([0,3,.7],[0,0,-9]);
 assert(downUpperWall[2]>=-.02-1e-7);
 const outside=passage.constrainMove([Infinity,NaN,0],[NaN,0,1]);
 assert.deepEqual(outside,[...passage.START]);
});

test('guide waits indefinitely for an observer without completing by elapsed time',()=>{
 const state=passage.create({guideId:41});
 for(let i=0;i<12000;i++)passage.tick(state,.05,passage.START);
 close(state.guideDistance,passage.LEAD_DISTANCE);assert.equal(state.arrived,false);
 assert(state.time>599);assert.equal(state.guideId,41);
});

test('escort can catch up with a player ahead but waits when the player falls behind',()=>{
 const state=passage.create({guideId:77});
 for(let i=0;i<30;i++)passage.tick(state,.05,passage.sampleRoute(4).p);
 assert(state.guideDistance>passage.LEAD_DISTANCE);
 state.guideDistance=6;
 const waiting=state.guideDistance;
 for(let i=0;i<100;i++)passage.tick(state,.05,passage.START);
 assert.equal(state.guideDistance,waiting);
 for(let i=0;i<1000;i++)passage.tick(state,.05,passage.EXIT);
 assert.equal(state.guideDistance,passage.ROUTE_LENGTH);assert.equal(state.arrived,true);
});

test('pause freezes the complete situation while holding a guide freezes only the escort',()=>{
 const state=passage.create(),before=passage.snapshot(state);
 passage.tick(state,60,passage.EXIT,{paused:true});assert.deepEqual(state,before);
 passage.tick(state,.05,passage.EXIT,{escortPaused:true});
 close(state.time,.05);assert.equal(state.guideDistance,before.guideDistance);
 const frozen=passage.snapshot(state);
 for(const dt of [NaN,Infinity,-1,0])passage.tick(state,dt,passage.EXIT);
 assert.deepEqual(state,frozen);
 passage.tick(state,30,passage.EXIT);assert(state.time<.16,'a resumed long frame cannot fast-forward the passage');
});

test('snapshot restores the same identity, progress and animation phase without sharing mutable state',()=>{
 const state=passage.create({guideId:214});
 for(let i=0;i<100;i++)passage.tick(state,.05,passage.sampleRoute(4).p);
 const saved=passage.snapshot(state),loaded=passage.restore(clone(saved));
 assert.deepEqual(loaded,state);assert.notEqual(saved,state);assert.notEqual(saved,loaded);
 const frame=clone(passage.scenery(state.time));
 assert.deepEqual(clone(passage.scenery(loaded.time)),frame);
 passage.tick(loaded,.05,passage.EXIT);assert.notEqual(loaded.guideDistance,state.guideDistance);
 assert.equal(loaded.guideId,214);
 for(const patch of [{version:2},{time:-1},{time:NaN},{guideDistance:Infinity},{guideDistance:-1},{guideDistance:passage.ROUTE_LENGTH+1},{guideId:0},{guideId:'214'},{arrived:true}])
  assert.equal(passage.restore({...saved,...patch}),null,JSON.stringify(patch));
 assert.equal(passage.restore(null),null);assert.equal(passage.restore([]),null);
});

test('the complete scenery has bounded counts and reuses its object graph',()=>{
 const still=passage.staticBoxes(),moving=passage.scenery(0),first=moving[0],point=first.p;
 assert(still.length<=130,`static boxes: ${still.length}`);assert(moving.length<=40,`moving boxes: ${moving.length}`);
 assert(still.some(box=>box.glass));assert(still.some(box=>box.section==='factory'));
 assert.equal(passage.staticBoxes(),still);assert.equal(passage.scenery(19),moving);assert.equal(moving[0],first);assert.equal(moving[0].p,point);
 for(let time=0;time<passage.SCENERY_PERIOD;time+=.25)for(const item of passage.scenery(time)){
  assert(item.p.every(Number.isFinite));assert(item.size.every(value=>Number.isFinite(value)&&value>0));
  assert(item.p[0]>1.3&&item.p[0]<12.1);assert(item.p[1]>0&&item.p[1]<6.4);assert(item.p[2]>.1&&item.p[2]<8.8);
 }
});

test('scenic floors avoid the global depth plane and stair accents face the descent',()=>{
 const boxes=passage.staticBoxes(),floors=boxes.filter(box=>box.surface==='floor'||box.surface==='tread');
 assert(floors.some(box=>box.section==='factory'));
 for(const floor of floors)assert(floor.p[1]+floor.size[1]/2>.02,'no duplicate floor within 2 cm of the global y=0 plane');
 for(const edge of boxes.filter(box=>box.surface==='nosing')){
  const tread=floors.find(box=>box.surface==='tread'&&Math.abs(box.p[1]+box.size[1]/2-(edge.p[1]-.004))<1e-7&&Math.abs(box.p[2]-edge.p[2])<.16);
  assert(tread,'every accent belongs to a real tread');
  assert(edge.p[2]<tread.p[2],'the visible edge is downstream, away from the upper riser');
 }
 // The scenic correction must not lift the player or change either descent.
 const nearFloor=[[-.3,3],[-3.3,1.5],[-4.7,1.5],[-7.7,0],[-9.6,0]];
 for(const [z,height] of nearFloor)close(passage.floorAt(-3,z),height);
 const door=boxes.find(box=>box.surface==='door-panel'),back=boxes.find(box=>box.surface==='door-back');
 assert(door.p[2]+door.size[2]/2-(back.p[2]+back.size[2]/2)>.08,'the distant door cannot share the backing wall depth');
 assert(door.size[2]>.08,'front and back faces of the distant panel must remain distinct with 16-bit depth');
});

test('all moving props close their loops and remain continuous across cycle seams',()=>{
 const start=clone(passage.scenery(0)),end=clone(passage.scenery(passage.SCENERY_PERIOD));
 assert.deepEqual(end,start);
 for(const time of [0,5.04,6,11.04,12,16,20,24,30,240]){
  const before=clone(passage.scenery(time-1e-6)),after=clone(passage.scenery(time+1e-6));
  for(let i=0;i<before.length;i++)assert(Math.hypot(...before[i].p.map((v,axis)=>v-after[i].p[axis]))<1e-4,'no visible prop teleports when its phase wraps');
 }
 const atTwenty=clone(passage.scenery(20));passage.scenery(100);assert.deepEqual(clone(passage.scenery(20)),atTwenty,'culling and later rendering cannot change a sampled pose');
});
