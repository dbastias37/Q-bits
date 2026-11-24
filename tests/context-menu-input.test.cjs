const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

// Real handlers, frame loop and Cannon; the asynchronous Pointer Lock events
// are simulated. These are not browser, rendering or mouse-driver checks.
function setup(kind='command'){
 const game=createGame({graphics:false}),{t,sandbox}=game,doc=sandbox.document;
 t.clearNarrativeScene();
 Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});
 doc.body.dataset.booting='false';
 t.position.splice(0,3,0,t.EYE_HEIGHT,0);
 t.setLook({camera:[...t.position],yaw:0,pitch:0});
 const group=t.makeGroup([0,.09].map(x=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(x,t.EYE_HEIGHT,-1),q:t.Q()})));
 doc.pointerLockElement=t.canvas;doc.dispatchEvent({type:'pointerlockchange'});
 let unlockRequests=0;
 doc.exitPointerLock=()=>{unlockRequests++;};
 const finishUnlock=()=>{doc.pointerLockElement=null;doc.dispatchEvent({type:'pointerlockchange'});};
 t.resetSimulationClock(0,true);
 t.handleSecondary({clientX:640,clientY:360,altKey:kind==='detach'});
 const menu=doc.querySelector(kind==='detach'?'#detach-menu':'#command-menu');
 assert.equal(menu.hidden,false,'the real secondary-click path opens its menu');
 assert.equal(unlockRequests,1,'opening requests a cursor but does not synchronously release it');
 assert.equal(doc.pointerLockElement,t.canvas);
 return {...game,doc,group,menu,finishUnlock};
}

function mouse(doc,x,y){doc.dispatchEvent({type:'mousemove',movementX:x,movementY:y});}
function key(doc,type,code){doc.dispatchEvent({type,code,repeat:false});}
const point=vector=>[vector.x,vector.y,vector.z];

for(const kind of ['command','detach']){
 test(`${kind} menu keeps physics running while delayed pointer unlock blocks looking and walking`,()=>{
  const {t,doc,group,menu}=setup(kind),before=t.getLook(),position=Array.from(t.position),height=group.body.position.y,sim=t.getSimTime();
  assert.equal(t.storySuspended(),false,'operational menus do not pause the world');
  assert.equal(t.gameInputActive(),false,'a pending browser unlock cannot leave game controls active');
  key(doc,'keydown','KeyW');mouse(doc,90,-30);
  for(let i=1;i<=8;i++)t.frame(i*20);
  key(doc,'keyup','KeyW');
  assert.equal(t.getLook().yaw,before.yaw);
  assert.equal(t.getLook().pitch,before.pitch);
  assert.deepEqual(Array.from(t.getLook().camera),Array.from(before.camera));
  assert.deepEqual(Array.from(t.position),position,'menu navigation cannot move the player');
  assert(group.body.position.y<height-.04,'the actual Cannon body keeps falling behind the menu');
  assert(t.getSimTime()>sim+.1,'the shared simulation clock advances through frame()');
  assert.equal(menu.hidden,false);assert.equal(t.story.mode,'playing');
 });
}

test('delayed intentional unlock preserves play and closing the menu restores fresh mouse input',async()=>{
 const {t,doc,menu,finishUnlock}=setup(),before=t.getLook();
 finishUnlock();
 assert.equal(t.story.mode,'playing','the delayed pointerlockchange must not open the pause screen');
 assert.equal(doc.querySelector('#pause-screen').hidden,true);
 mouse(doc,5000,-2000);
 assert.equal(t.getLook().yaw,before.yaw);assert.equal(t.getLook().pitch,before.pitch);
 t.canvas.requestPointerLock=async()=>{doc.pointerLockElement=t.canvas;doc.dispatchEvent({type:'pointerlockchange'});};
 const close=doc.querySelector('#command-actions').children.find(button=>button.textContent==='Cerrar');
 assert(close);close.click();
 for(let i=0;i<6;i++)await Promise.resolve();
 assert.equal(menu.hidden,true);assert.equal(doc.pointerLockElement,t.canvas);assert.equal(t.gameInputActive(),true);
 assert.equal(t.story.mode,'playing');
 mouse(doc,10,-4);
 assert(Math.abs(t.getLook().yaw-(before.yaw-.02))<1e-12,'only the new captured sample affects yaw');
 assert(Math.abs(t.getLook().pitch-(before.pitch+.008))<1e-12,'unlocked samples are never replayed');
 const z=t.position[2];key(doc,'keydown','KeyW');t.frame(50);key(doc,'keyup','KeyW');
 assert(t.position[2]<z-.05,'ordinary walking is available again after closing');
});

test('real window blur still pauses physics when a context-menu unlock is pending',()=>{
 const {t,sandbox,doc,group,finishUnlock}=setup();
 sandbox.dispatchEvent({type:'blur'});
 assert.equal(t.story.mode,'pause');assert.equal(t.storySuspended(),true);
 finishUnlock();
 assert.equal(t.story.mode,'pause','the delayed unlock cannot resume a deliberate focus-loss pause');
 const body=point(group.body.position),sim=t.getSimTime(),look=t.getLook();
 key(doc,'keydown','KeyW');mouse(doc,120,40);
 for(let i=1;i<=8;i++)t.frame(i*20);
 key(doc,'keyup','KeyW');
 assert.deepEqual(point(group.body.position),body);assert.equal(t.getSimTime(),sim);
 assert.equal(t.getLook().yaw,look.yaw);assert.equal(t.getLook().pitch,look.pitch);
 assert.equal(doc.pointerLockElement,null);
});
