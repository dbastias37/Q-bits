const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs'),P=require('../assets/js/preferences.js');
const plain=x=>JSON.parse(JSON.stringify(x));
function lab(){const game=createGame();game.t.clearNarrativeScene();Object.assign(game.t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});game.sandbox.document.pointerLockElement=game.t.canvas;let now=0;game.sandbox.performance={now:()=>now+=.001};return game;}
function compound(t,n=32){return t.makeGroup(Array.from({length:n},(_,i)=>({id:i+100,shape:['cube','pyramid','tetra','coupler'][i%4],weight:1+i/100,p:t.V(2+(i%8)*.18,.5+Math.floor(i/8)*.18,1),q:t.Q(),mood:{energy:.21+i/1000,name:'Original '+i}})));}
function inventory(t){return [...t.groups.flatMap(g=>g.parts),...t.disassemblyJobs.flatMap(j=>j.parts.slice(j.cursor))].map(p=>[p.id,p.weight,p.shape,p.mood.energy,p.mood.name]).sort((a,b)=>a[0]-b[0]);}
function finish(t,max=5000){for(let i=0;i<max&&t.pendingDisassemblyCount();i++){const before=t.groups.length;t.updateDisassembly(1/60);assert(t.groups.length-before<=4);}assert.equal(t.pendingDisassemblyCount(),0);}
test('staged disassembly caps releases, preserves all matter/energy and lands without overlap',()=>{
 const {t}=lab(),g=compound(t,64),before=inventory(t),bodies=t.world.bodies.length;t.setPreferences({disassemblyMode:'staged'});t.detachPart({g,part:g.parts[0]},true);
 assert.equal(t.pendingDisassemblyCount(),64);assert.equal(t.groups.length,0);assert.equal(t.world.bodies.length,bodies-1);assert.deepEqual(inventory(t),before);
 t.updateDisassembly(1/60);assert.equal(t.groups.length,0);assert(t.disassemblyJobs[0].active.length<=4);finish(t);
 assert.deepEqual(inventory(t),before);assert.equal(t.groups.length,64);assert(t.groups.every(g=>g.body.velocity.norm()===0&&g.body.angularVelocity.norm()===0));
 const poses=t.groups.map(g=>t.worldParts(g)[0]);for(let i=0;i<poses.length;i++)for(let j=0;j<i;j++)assert(!t.obbOverlap(poses[i],poses[j]));
});
test('a 2000-piece pending job still occupies room capacity and retires its render buffers',()=>{
 const game=lab(),{t}=game,g=compound(t,2000);assert(t.beginStagedDisassembly([g]));assert.equal(t.scenePartCount(),2000);const baseline=game.buffers.size;t.drawDisassembly();const allocated=game.buffers.size;assert(allocated>baseline&&allocated-baseline<=3);t.drawDisassembly();assert.equal(game.buffers.size,allocated);
 t.spawnQubit('cube');assert.equal(t.groups.length,0);assert.equal(t.scenePartCount(),2000);t.clearNarrativeScene();assert.equal(t.scenePartCount(),0);assert.equal(game.buffers.size,baseline);
});
test('pause/hidden freezes queue; save/restore mid-flight preserves identities and energy exactly',()=>{
 const {t,sandbox}=lab();t.beginStagedDisassembly([compound(t)]);for(let i=0;i<30;i++)t.updateDisassembly(1/60);const before=inventory(t);assert(t.groups.length>0&&t.pendingDisassemblyCount()>0);
 const state=plain(t.serializeDisassembly()),count=t.groups.length;sandbox.document.hidden=true;t.updateDisassembly(10);assert.equal(t.groups.length,count);assert.deepEqual(plain(t.serializeDisassembly()),state);sandbox.document.hidden=false;
 t.story.mode='pause';t.updateDisassembly(10);assert.equal(t.groups.length,count);t.story.mode='playing';
 const saved=t.saveLab();t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);assert.deepEqual(inventory(t),before);finish(t);assert.deepEqual(inventory(t),before);
});
test('a newly occupied destination is rechecked; queued pieces remain recoverable',()=>{
 const {t}=lab();t.beginStagedDisassembly([compound(t,4)]);t.updateDisassembly(1/60);const target=t.disassemblyJobs[0].active[0].target.clone();t.storyWall(t.V(target.x,.3,target.z),t.V(.11,.3,.11));finish(t);assert(t.groups.every(g=>Math.hypot(g.body.position.x-target.x,g.body.position.z-target.z)>.12));
});
test('full floor waits without losing matter and resumes when room becomes free',()=>{
 const {t}=lab();t.beginStagedDisassembly([compound(t,4)]);const wall=t.storyWall(t.V(0,.4,0),t.V(14,.4,14));for(let i=0;i<20;i++)t.updateDisassembly(.05);assert.equal(t.pendingDisassemblyCount(),4);assert.equal(t.groups.length,0);t.world.removeBody(wall.body);t.storyWorld.walls.splice(t.storyWorld.walls.indexOf(wall),1);finish(t);
});
test('articulated machines stop and detach constraints before gradual release',()=>{
 const {t}=lab(),r=t.spawnRotor(t.V(2,1,1));t.configureRotor(r,{enabled:true});const members=t.rotorGroups(r),before=inventory(t);assert(t.beginStagedDisassembly(members));assert.equal(t.rotors.length,0);assert(!t.world.constraints.includes(r.constraint));finish(t);assert.deepEqual(inventory(t),before);
});
test('disassembly preferences preserve instant behavior by default and transact on save',()=>{
 assert.equal(P.sanitize({}).disassemblyMode,'instant');assert.equal(P.sanitize({disassemblyMode:'bad'}).disassemblyMode,'instant');const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},tx=P.transaction(storage);tx.draft.disassemblyMode='staged';tx.discard();assert.equal(tx.draft.disassemblyMode,'instant');tx.draft.disassemblyMode='staged';tx.save();assert.equal(P.load(storage).disassemblyMode,'staged');
});
test('the gesture uses staged mode in the lab and campaign retains the original dismantle',()=>{
 for(const scene of ['lab','campaign']){
  const {t,sandbox}=lab(),g=compound(t,8);t.story.scene=scene;t.setPreferences({disassemblyMode:'staged'});t.grabQubit({g,part:g.parts[0],point:t.worldParts(g)[0].p,distance:1});t.getHeld().age=.4;sandbox.document.dispatchEvent({type:'keydown',code:'ShiftLeft',repeat:false});
  for(let i=0;i<5;i++)sandbox.document.dispatchEvent({type:'mousemove',movementX:i%2?-50:50,movementY:0,timeStamp:1000+i*70});
  if(scene==='lab'){assert.equal(t.pendingDisassemblyCount(),8);assert.equal(t.getHeld(),null);assert.equal(t.startCullingBenchmark(),false);}else{assert.equal(t.pendingDisassemblyCount(),0);assert.equal(t.groups.length,8);assert(t.getHeld());}
 }
});
test('staged preference UI only applies on save and resets to immediate',()=>{
 const {t,sandbox}=lab(),doc=sandbox.document,screen=doc.querySelector('#settings-screen'),tabs=['look','game'].map(name=>{const b=doc.createElement('button');b.dataset.settingsTab=name;return b;});screen.querySelectorAll=q=>q==='[data-settings-tab]'?tabs:[];t.initSettingsScreen();const settings=t.getSettingsScreen(),click=id=>doc.querySelector('#'+id).dispatchEvent({type:'click'});settings.open('pause');tabs[1].dispatchEvent({type:'click'});
 const change=()=>{const input=doc.querySelector('#pref-disassemblyMode');input.value='staged';input.dispatchEvent({type:'change'});};change();assert.equal(t.getVisuals().disassemblyMode,'instant');settings.requestClose();click('settings-discard');assert.equal(t.getVisuals().disassemblyMode,'instant');settings.open('pause');change();click('settings-save');assert.equal(t.getVisuals().disassemblyMode,'staged');click('settings-reset');assert.equal(settings.draft.disassemblyMode,'instant');assert.equal(t.getVisuals().disassemblyMode,'staged');click('settings-save');assert.equal(t.getVisuals().disassemblyMode,'instant');
});
