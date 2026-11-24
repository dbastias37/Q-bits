// Real game/Cannon with instrumented DOM and GPU calls. These checks cover
// lifecycle, movement and persistence; they are not visual or FPS evidence.
const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const passage=require('../assets/js/factory-passage.js');
const saves=require('../assets/js/save-games.js');
const plain=value=>JSON.parse(JSON.stringify(value));
const xyz=value=>[value.x,value.y,value.z];
const near=(actual,expected,epsilon=1e-7)=>assert(Math.abs(actual-expected)<epsilon,`${actual} != ${expected}`);
function memory(){
 const values=new Map();
 return {values,storage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))}};
}
function setup(mem=memory(),level=true){
 const game=createGame({storage:mem.storage,graphics:false}),{t,sandbox}=game;
 t.story.ready=true;sandbox.document.body.dataset.booting='false';
 t.canvas.requestPointerLock=async()=>{sandbox.document.pointerLockElement=t.canvas;};
 sandbox.document.exitPointerLock=()=>{sandbox.document.pointerLockElement=null;};
 if(level)t.beginCampaignLevel(1);
 return {...game,mem};
}
function guide(t){return t.groups.find(group=>group.parts.some(part=>part.id===t.story.guideId));}
function finishFade(t){
 for(let i=0;i<100&&t.story.transition;i++)t.tickStory(.05);
 assert.equal(t.story.transition,null,'the existing scene fade finishes');
}
function acceptInvitation(t){
 assert.equal(t.story.dialogue?.text,'Acompáñame.');
 t.advanceDialogue();t.advanceDialogue();
 assert.equal(t.story.dialogue,null);assert.equal(t.story.passage.invitationPending,false);
}
function beginWalk(game,{read=true}={}){
 game.t.beginFactoryPassage();if(read)acceptInvitation(game.t);return game;
}
function moodIdentity(g){
 const p=g.parts[0],m=p.mood;
 return plain({id:p.id,shape:p.shape,weight:p.weight,name:m.name,energy:m.energy,restLeft:m.restLeft,state:m.state,reason:m.reason});
}

test('finishing cycle one enters the gallery once with the same guide and an invitation only',()=>{
 const {t}=setup();
 Object.assign(guide(t).parts[0].mood,{name:'Compañero',energy:.43,restLeft:27,state:'restless',reason:'acalorado'});
 const before=moodIdentity(guide(t));
 t.finishCampaignLevel();const transition=t.story.transition;
 t.finishCampaignLevel();assert.equal(t.story.transition,transition);
 finishFade(t);
 assert(t.story.passage);assert.equal(t.story.level,1);assert.equal(t.story.progress.level1,true);
 assert.equal(t.story.scene,'campaign');assert.equal(t.story.mode,'playing');
 assert.deepEqual(moodIdentity(guide(t)),before);
 assert.equal(t.story.dialogue.text,'Acompáñame.');assert.equal(t.story.dialogue.modal,true);
 assert.equal(t.story.passage.invitationPending,true);
 assert.equal(t.groups.length,1,'the factory display is not a second cast or a source of pieces');
 assert.deepEqual(plain(t.position),[passage.START[0],passage.START[1]+t.EYE_HEIGHT,passage.START[2]]);
});

test('real player frames descend both flights using the analytical floor and ordinary walking',()=>{
 const game=beginWalk(setup()),{t,sandbox}=game;
 sandbox.document.pointerLockElement=t.canvas;t.setRunning(true);t.setLook({yaw:0,pitch:0});
 t.position.splice(0,3,-3,3+t.EYE_HEIGHT,-.3);
 let clock=performance.now();t.frame(clock);t.keys.add('KeyW');
 let previousHeight=t.getLook().camera[1],sawLanding=false,sawSecond=false;
 for(let i=0;i<47;i++){
  clock+=50;t.frame(clock);
  const floor=passage.floorAt(t.position[0],t.position[2]),camera=t.getLook().camera;
  near(t.position[1],floor+t.posture.height);
  assert(Math.abs(camera[1]-floor-t.posture.height)<.031,'camera preserves its normal small walking bob');
  assert(Math.abs(camera[1]-previousHeight)<.13,'the camera does not jump down individual risers');
  if(t.position[2]<-3.4&&t.position[2]>-4.6){near(floor,1.5);sawLanding=true;}
  if(t.position[2]<-4.8)sawSecond=true;
  previousHeight=camera[1];
 }
 t.keys.clear();assert(sawLanding);assert(sawSecond);assert(t.position[2]<-7.7);
});

test('reading, pause, menu and hidden tabs suspend the situation while the operational tablet does not',()=>{
 const game=beginWalk(setup(),{read:false}),{t,sandbox}=game;
 const frozen=plain(t.story.passage.state),body=xyz(guide(t).body.position),player=[...t.position];
 for(let i=0;i<100;i++)t.tickStory(.05);
 assert.deepEqual(plain(t.story.passage.state),frozen);
 assert.deepEqual(xyz(guide(t).body.position),body);assert.deepEqual([...t.position],player);
 assert.equal(t.story.dialogue.text,'Acompáñame.','reading never expires automatically');
 acceptInvitation(t);
 for(const menu of [()=>t.openPauseMenu(),()=>t.showMain()]){
  menu();const before=plain(t.story.passage.state);
  for(let i=0;i<20;i++)t.tickStory(.1);
  assert.deepEqual(plain(t.story.passage.state),before);t.resumeGame();
 }
 sandbox.document.hidden=true;const hidden=plain(t.story.passage.state);t.tickStory(30);
 assert.deepEqual(plain(t.story.passage.state),hidden);sandbox.document.hidden=false;
 t.storyInput({code:'KeyP',repeat:false,preventDefault(){}});
 assert.equal(sandbox.document.querySelector('#panel').hidden,false);assert.equal(t.storySuspended(),false);
 t.tickStory(.05);assert(t.story.passage.state.time>hidden.time);
});

test('the existing grab action suspends escort only and release returns the same guide smoothly',()=>{
 const game=beginWalk(setup()),{t,sandbox}=game,g=guide(t),id=g.parts[0].id;
 sandbox.document.pointerLockElement=t.canvas;
 t.grabQubit({g,part:g.parts[0],point:g.body.position.clone(),distance:1.35});
 assert.equal(t.getHeld()?.g,g);assert.equal(g.body.type,sandbox.CANNON.Body.DYNAMIC);
 const distance=t.story.passage.state.guideDistance,time=t.story.passage.state.time;
 t.tickStory(.05);assert.equal(t.story.passage.state.guideDistance,distance);assert(t.story.passage.state.time>time);
 g.body.position.x+=.6;const dropped=g.body.position.clone();
 t.releaseQubit();assert.equal(t.getHeld(),null);t.tickStory(.05);
 assert.equal(g.body.type,sandbox.CANNON.Body.KINEMATIC);assert.equal(g.parts[0].id,id);
 assert(g.body.position.distanceTo(dropped)>.001);assert(g.body.position.distanceTo(dropped)<.08,'release cannot teleport a companion back to its route');
 assert.equal(t.story.passage.state.guideDistance,distance,'the route waits until the released guide has returned');
});

test('save and load restore passage position, guide identity, mood and animation phase',()=>{
 const mem=memory(),writer=beginWalk(setup(mem)),{t}=writer;
 t.story.passage.state.time=27.125;t.story.passage.state.guideDistance=13.8;
 const g=guide(t),pose=passage.sampleRoute(13.8).p;
 g.body.position.set(pose[0]+.11,pose[1]+.23,pose[2]);
 Object.assign(g.parts[0].mood,{name:'El mismo compañero',energy:.29,restLeft:48,state:'restless',reason:'necesita descanso'});
 t.position.splice(0,3,-3,1.5+t.EYE_HEIGHT,-4);t.setLook({yaw:.31,pitch:-.22});
 const identity=moodIdentity(g),guidePose=xyz(g.body.position),saved=plain(t.passagePayload());
 assert.equal(t.saveCurrentGame().ok,true);
 const record=JSON.parse(mem.values.get(saves.KEYS.campaign));assert(record.data.passage);
 const reader=setup(mem,false),r=reader.t;assert.equal(r.continueSavedGame('campaign'),true);
 assert(r.story.passage);assert.equal(r.story.level,1,'the completed checkpoint must not skip the corridor');
 assert.deepEqual(plain(r.story.passage.state),saved.state);assert.deepEqual(moodIdentity(guide(r)),identity);
 xyz(guide(r).body.position).forEach((value,i)=>near(value,guidePose[i]));
 assert.deepEqual(plain(r.position),[-3,1.5+r.EYE_HEIGHT,-4]);near(r.getLook().yaw,.31);near(r.getLook().pitch,-.22);
 assert.equal(r.story.passage.invitationPending,false);assert.equal(r.story.dialogue,null);
 assert.deepEqual(plain(passage.scenery(r.story.passage.state.time)),plain(passage.scenery(saved.state.time)));
});

test('an unread invitation remains pending and suspended after loading',()=>{
 const mem=memory(),writer=beginWalk(setup(mem),{read:false});
 assert.equal(writer.t.saveCurrentGame().ok,true);
 const reader=setup(mem,false),{t}=reader;assert.equal(t.continueSavedGame('campaign'),true);
 assert.equal(t.story.passage.invitationPending,true);assert.equal(t.story.dialogue.text,'Acompáñame.');
 const state=plain(t.story.passage.state);t.tickStory(20);
 assert.deepEqual(plain(t.story.passage.state),state);assert(t.story.dialogue);
 acceptInvitation(t);t.tickStory(.05);assert(t.story.passage.state.time>state.time);
});

test('reaching the end enters cycle two once and preserves the guide without reclaiming it',()=>{
 const {t}=beginWalk(setup()),g=guide(t);
 Object.assign(g.parts[0].mood,{name:'Compañero del inicio',energy:.38,restLeft:19,state:'restless',reason:'acalorado'});
 const identity=moodIdentity(g);
 t.story.passage.state.guideDistance=passage.ROUTE_LENGTH;t.story.passage.state.arrived=true;
 g.body.position.set(passage.EXIT[0],.049,passage.EXIT[2]);
 t.position.splice(0,3,passage.EXIT[0],t.EYE_HEIGHT,passage.EXIT[2]);
 t.tickStory(.05);const transition=t.story.transition;assert(transition);
 t.tickFactoryPassage(.05);assert.equal(t.story.transition,transition);
 finishFade(t);assert.equal(t.story.level,2);assert.equal(t.story.passage,null);
 assert.deepEqual(moodIdentity(guide(t)),identity);
 assert.equal(t.groups.flatMap(group=>group.parts).filter(part=>part.id===identity.id).length,1);
 assert.equal(t.saveStore.read('campaign').save.data.passage,undefined);
});

test('background machines create no Cannon bodies and their drawing buffers are reclaimed on every exit',()=>{
 const game=setup(),{t}=game;
 t.clearNarrativeScene();const baseBodies=t.world.bodies.length,baseBuffers=game.buffers.size;
 for(let attempt=0;attempt<3;attempt++){
  t.beginCampaignLevel(1);t.beginFactoryPassage();
  assert.equal(t.storyWorld.walls.length,0);assert.equal(t.world.bodies.length,baseBodies+1,'only the actual guide enters the physics world');
  assert.equal(t.groups.length,1);const bodies=[...t.world.bodies],buffers=game.buffers.size;
  assert(buffers>baseBuffers,'static scenery is compiled once on entry');
  for(let i=0;i<30;i++){t.story.passage.state.time=i*.07;t.drawFactoryPassage(false);t.drawFactoryPassage(true);}
  assert.deepEqual([...t.world.bodies],bodies);assert.equal(game.buffers.size,buffers,'animation does not allocate new GPU buffers');
  t.clearNarrativeScene();assert.equal(t.world.bodies.length,baseBodies);assert.equal(game.buffers.size,baseBuffers);
 }
});
