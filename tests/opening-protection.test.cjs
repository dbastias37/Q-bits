// Production input handlers and Cannon state with DOM/GPU/audio stubs.
// These regressions do not certify pixels, audible playback or browser comfort.
const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const Supply=require('../assets/js/campaign-supply.js');
const Saves=require('../assets/js/save-games.js');
const plain=value=>JSON.parse(JSON.stringify(value));

function memory(){
 const values=new Map();
 return {values,storage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))}};
}
async function setup(scene='firstCycle',{dismiss=true}={}){
 const mem=memory(),game=createGame({graphics:false,storage:mem.storage}),{t,sandbox}=game,doc=sandbox.document;
 t.canvas.requestPointerLock=()=>{doc.pointerLockElement=t.canvas;doc.dispatchEvent({type:'pointerlockchange'});};
 let ready=false;const pending=game.api.prepare().then(()=>{ready=true;});
 for(let i=0;i<30&&!ready;i++){game.frame();await Promise.resolve();await Promise.resolve();}
 assert(ready,'the real game prepares');await pending;doc.body.dataset.booting='false';
 t.beginIntro(true);
 if(scene==='firstCycle')t.beginOpeningSupply();else t.beginFactoryPassage();
 const el=id=>doc.querySelector('#'+id);
 const key=code=>{doc.dispatchEvent({type:'keydown',code,repeat:false});doc.dispatchEvent({type:'keyup',code});};
 const gameTools={...game,mem,doc,el,key};
 if(dismiss)dismissReading(gameTools);
 doc.pointerLockElement=t.canvas;
 return gameTools;
}
function dismissReading(game){
 if(!game.t.story.dialogue)return;
 game.key('KeyE');game.key('KeyE');
 assert.equal(game.t.story.dialogue,null,'the player dismisses the reading with its existing action');
}
function emitted(game){
 const {t}=game;
 assert(t.requestOpeningCompanion());
 for(let i=0;i<18;i++)t.tickOpeningSupply(.05);
 dismissReading(game);
 const id=t.story.firstCycle.ledger.records[0].id;
 return t.groups.find(g=>g.parts.some(p=>p.id===id));
}
function selectedTablet(game,group){
 game.key('KeyP');assert.equal(game.el('panel').hidden,false);
 game.t.setSelected({g:group,part:group.parts[0]});
 // Seed the focused record; the actions below go through production handlers.
 game.t.switchPanelTab('cube');
 const mass=game.el('mass');mass.value=String(group.parts[0].weight);
 return group.parts[0];
}
function partState(t){
 return plain(t.groups.flatMap(g=>t.worldParts(g)).map(p=>({id:p.id,weight:p.weight,shape:p.shape,mood:p.mood})).sort((a,b)=>a.id-b.id));
}
function choose(game,label){
 const button=game.el('story-choices').children.find(item=>item.textContent===label);
 assert(button,'choice exists: '+label);button.click();
}
function revealChoices(game){
 game.key('KeyE');assert.equal(game.el('story-choices').hidden,false);
}
function finishTransition(t){
 for(let i=0;i<80&&t.story.transition;i++)t.tickStory(.1);
 assert.equal(t.story.transition,null);
}
function addClosedArchive(game){
 const {t}=game,guide=t.groups.find(g=>g.parts.some(p=>p.id===t.story.guideId));
 const part=plain(t.worldParts(guide)[0]);part.id+=10000;part.mood.energy=.37;part.mood.restLeft=29;
 const ledger=Supply.create([{id:part.id,origin:'reserva-inicial',weight:part.weight,destination:'reserve'}],{maxQueue:1});
 for(const action of [()=>Supply.request(ledger,'archived-request',[part.id]),()=>Supply.beginEmission(ledger,part.id),
  ()=>Supply.finishEmission(ledger,part.id),()=>Supply.noteTaken(ledger,part.id),()=>Supply.notePlaced(ledger,part.id),
  ()=>Supply.beginReturn(ledger,part.id),()=>Supply.acceptReturn(ledger,part.id)])assert(action().ok);
 t.story.openingReserve={version:1,ledger:Supply.snapshot(ledger),reserveParts:[part]};
 const saved=t.saveCurrentGame();assert(saved.ok,saved.error);
 return plain(t.story.openingReserve);
}

for(const scene of ['firstCycle','passage'])test(scene+': tablet cannot change matter, delete an actor or recharge it',async()=>{
 const game=await setup(scene),{t,el}=game;
 const group=scene==='firstCycle'?emitted(game):t.groups.find(g=>g.parts.some(p=>p.id===t.story.guideId));
 const part=selectedTablet(game,group);part.mood.energy=.23;part.mood.restLeft=33;
 const before=partState(t),gravity=t.settings.gravity;
 for(const [id,value] of [['mass',2],['gravity',0]]){
  const input=el(id);input.value=String(value);input.dispatchEvent({type:'input',target:input});
 }
 // Dispatch explicitly as well as checking disabled controls: stale handlers
 // must not bypass conservation after an interface/scene transition.
 for(const id of ['remove','mood-test-rested','mood-test-tired'])el(id).dispatchEvent({type:'click'});
 assert.deepEqual(partState(t),before);
 assert.equal(t.settings.gravity,gravity);
 assert.equal(el('mass').disabled,true);assert.equal(el('remove').disabled,true);
 assert.equal(el('mood-test-rested').disabled,true);
 assert.equal(t.storySuspended(),false,'an operational tablet is not an automatic pause');
 const saved=t.saveCurrentGame();assert(saved.ok,saved.error);
});

for(const scene of ['firstCycle','passage'])test(scene+': previous unlocks cannot create resources through tablet, keyboard or floor menus',async()=>{
 const game=await setup(scene),{t,el,key,doc}=game;
 if(scene==='firstCycle')emitted(game);
 t.story.progress.level5=true;
 const before=partState(t),bodies=t.world.bodies.length;
 assert(t.mechanismsUnlocked());assert.equal(t.mechanismsAvailable(),false);
 key('KeyP');
 for(const shape of ['coupler','rotor']){
  el('unit-shape').value=shape;el('unit-shape').dispatchEvent({type:'change',target:el('unit-shape')});
  el('create').dispatchEvent({type:'click'});
  assert.equal(t.getCreationPreview(),null,shape+' cannot open a resource preview');
 }
 el('create-cargo').dispatchEvent({type:'click'});
 el('place-cooler').dispatchEvent({type:'click'});
 assert.equal(t.getCreationPreview(),null);
 key('KeyP');doc.pointerLockElement=t.canvas;
 for(const code of ['KeyQ','KeyN','KeyB','KeyV','Delete'])key(code);
 assert.equal(t.radialOpen(),false);assert.equal(t.getCreationPreview(),null);
 t.openFloorOrders(t.V(0,0,.5));
 const cooler=el('command-actions').children.find(button=>button.textContent==='Colocar enfriador');
 assert(cooler);cooler.click();
 assert.deepEqual(partState(t),before);assert.equal(t.world.bodies.length,bodies);
 assert.equal(t.blueprints.length,0);
 // Saved construction plans are an existing second path into placement.
 const shape={name:'Cubo conocido',geometryVersion:3,parts:[{shape:'cube',p:[0,.045,0],q:[0,0,0,1]}]};
 assert(t.savedShapeValid(shape));t.savedShapes.push(shape);t.showSavedShapes(t.V(0,0,.5),'shapes');
 const plan=el('command-actions').children.find(button=>button.textContent.startsWith('Cubo conocido'));
 assert(plan);plan.click();
 assert.equal(t.getCreationPreview(),null,'a saved plan also respects the protected room');
 assert.deepEqual(partState(t),before);assert.equal(t.blueprints.length,0);
});

test('contextual orders appear fully while the world clock is suspended',async()=>{
 const game=await setup(),{t,el}=game;const group=emitted(game);
 t.setSelected({g:group,part:group.parts[0]});t.openFloorOrders(t.V(.4,0,.4));
 const menu=el('command-menu');
 assert.equal(menu.hidden,false);assert.equal(menu.style.opacity,'1');assert(t.storySuspended());
 const before={sim:t.getSimTime(),practice:t.story.firstCycle.time,position:plain(group.body.position)};
 t.resetSimulationClock(1000,true);for(let i=1;i<=8;i++)t.frame(1000+i*20);
 assert.equal(menu.style.opacity,'1');assert.equal(t.getSimTime(),before.sim);
 assert.equal(t.story.firstCycle.time,before.practice);assert.deepEqual(plain(group.body.position),before.position);
 const close=el('command-actions').children.find(button=>button.textContent==='Cerrar');assert(close);close.click();
 assert.equal(menu.hidden,true);assert.equal(t.storySuspended(),false);
});

test('modal text progresses without frame-by-frame blip cancellation and pauses on the actual pause menu',async()=>{
 const game=await setup('firstCycle',{dismiss:false}),{t,sandbox,doc}=game,pauses=[],reveals=[];
 sandbox.QBitsGuideAudio={begin(){},stop(){},unlock(){},setPaused:value=>pauses.push(value),reveal:count=>reveals.push(count)};
 assert(t.modalReadingActive());assert.equal(t.guideNarrationPaused(),false);
 const before={sim:t.getSimTime(),practice:t.story.firstCycle.time,look:t.getLook()};
 doc.dispatchEvent({type:'mousemove',movementX:120,movementY:60});
 assert.deepEqual(t.getLook(),before.look,'mouse look respects the same modal suspension as a controller');
 t.resetSimulationClock(1000,true);for(let i=1;i<=12;i++)t.frame(1000+i*20);
 assert(pauses.length>0);assert(pauses.every(value=>value===false));assert(reveals.some(value=>value>0));
 assert.equal(t.getSimTime(),before.sim);assert.equal(t.story.firstCycle.time,before.practice);
 const textTime=t.story.dialogue.time;t.openPauseMenu();pauses.length=0;reveals.length=0;
 t.frame(1500);
 assert(pauses.some(value=>value===true));assert.equal(reveals.length,0);assert.equal(t.story.dialogue.time,textTime);
 t.resumeGame();pauses.length=0;t.frame(1520);t.frame(1540);
 assert(pauses.length>0);assert(pauses.every(value=>value===false));
});

test('an archived reserve survives the reset prompt and cancellation until explicit confirmation',async()=>{
 const game=await setup('passage'),{t,sandbox,el}=game,archive=addClosedArchive(game),voices=[];let called=0,archiveAtCallback;
 sandbox.QBitsGuideAudio={begin:(_,options)=>voices.push(options.voice),reveal(){},stop(){},setPaused(){},unlock(){}};
 const action=()=>{called++;archiveAtCallback=t.story.openingReserve;};
 t.openingResetPrompt(action,{archive:true});
 assert.equal(called,0);assert.deepEqual(plain(t.story.openingReserve),archive);
 assert.equal(el('story-speaker').textContent,'INSTALACIÓN');assert.equal(voices.at(-1),false);
 revealChoices(game);choose(game,'Seguir aquí');
 assert.equal(called,0);assert.deepEqual(plain(t.story.openingReserve),archive);
 t.openingResetPrompt(action,{archive:true});revealChoices(game);choose(game,'Reiniciar el intento');
 assert.equal(called,1);assert.equal(archiveAtCallback,null);assert.equal(t.story.openingReserve,null);
});

test('selecting the prologue shows the material reset before clearing the archived companion',async()=>{
 const game=await setup('passage'),{t,el}=game,archive=addClosedArchive(game);
 const selectIntro=()=>{t.openPauseMenu();el('pause-levels').click();assert.equal(t.story.mode,'levels');el('level-list').children[0].click();};
 selectIntro();assert(t.story.passage);assert.deepEqual(plain(t.story.openingReserve),archive);
 assert.equal(t.story.transition,null);revealChoices(game);choose(game,'Seguir aquí');
 assert(t.story.passage);assert.deepEqual(plain(t.story.openingReserve),archive);
 selectIntro();revealChoices(game);choose(game,'Reiniciar el intento');finishTransition(t);
 assert.equal(t.story.scene,'intro');assert.equal(t.story.openingReserve,null);
});

test('a new campaign clears the archive only after the existing full-reset confirmation',async()=>{
 const game=await setup('passage'),{t,el,mem}=game,archive=addClosedArchive(game);
 t.showSavedGames('campaign');const saved=mem.values.get(Saves.KEYS.campaign);
 el('saves-campaign-new').click();assert.equal(el('saves-confirm').hidden,false);
 assert.match(el('saves-confirm-text').textContent,/reinician.*piezas/);
 assert.deepEqual(plain(t.story.openingReserve),archive);assert.equal(mem.values.get(Saves.KEYS.campaign),saved);
 el('saves-confirm-cancel').click();assert.deepEqual(plain(t.story.openingReserve),archive);
 el('saves-campaign-new').click();el('saves-confirm-new').click();finishTransition(t);
 assert.equal(t.story.scene,'intro');assert.equal(t.story.openingReserve,null);
 const data=t.saveStore.read('campaign').save.data;
 assert.deepEqual(plain(data.checkpoint),{scene:'intro',level:0,completed:false});
 assert.equal(Object.hasOwn(data,'openingReserve'),false);assert.equal(Object.hasOwn(data,'passage'),false);
});
