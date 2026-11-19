const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle',progress:{}});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;}
function key(game,type,code){game.sandbox.document.dispatchEvent({type,code,repeat:false});}
function choose(game,id){key(game,'keydown','KeyQ');if(game.t.story.scene==='lab'){
 const node=id=>game.sandbox.document.querySelector('#'+id);
 if(id==='rotor')node('catalog-filters').children.find(b=>b.textContent==='Máquinas').dispatchEvent({type:'click'});
 node('catalog-entries').children.find(b=>b.dataset.creation===id).dispatchEvent({type:'click'});key(game,'keyup','KeyQ');return;
 }const before=game.radial.getState(),figure=before.figures.find(f=>f.id===id);game.sandbox.document.dispatchEvent({type:'mousemove',movementX:figure.x-before.x,movementY:figure.y-before.y});key(game,'keyup','KeyQ');}
function click(game){game.t.setLook({camera:[game.t.groups.length*.5,2,2],yaw:0,pitch:-Math.PI/4});game.t.canvas.dispatchEvent({type:'mousedown',button:0});game.sandbox.document.dispatchEvent({type:'mouseup',button:0});}
function node(game,id){return game.sandbox.document.querySelector('#'+id);}

test('Tablet catalog mechanisms create a single Enganche or a two-body Rotor on the next click',()=>{
 const game=lab(),{t,sandbox}=game;t.canvas.requestPointerLock=()=>{sandbox.document.pointerLockElement=t.canvas;};choose(game,'coupler');click(game);
 assert.equal(t.groups.length,1);assert.equal(t.groups[0].parts[0].shape,'coupler');
 choose(game,'rotor');click(game);assert.equal(t.groups.length,3);assert.equal(t.rotors.length,1);
 assert.equal(t.rotorGroups(t.rotors[0]).length,2);assert.equal(t.rotors[0].enabled,false);
 t.updateAlphaHUD();assert.match(node(game,'alpha-census-text').textContent,/3 M/);
});
test('campaign progression unlocks only mechanisms while lab availability is immediate',()=>{
 const game=lab(),{t,sandbox}=game;assert(t.mechanismsAvailable());
 t.story.scene='campaign';assert.equal(t.mechanismsAvailable(),false);assert.equal(t.creationChoiceAllowed('rotor'),false);
 let saved; sandbox.localStorage.setItem=(key,value)=>{if(key==='qbits.campaign.v1')saved=JSON.parse(value);};
 t.saveStoryProgress('level5');assert(saved.level5);assert(t.mechanismsUnlocked());assert(t.mechanismsAvailable());
 assert.equal(t.creationChoiceAllowed('cube'),false);assert(t.creationChoiceAllowed('coupler'));
 choose(game,'coupler');click(game);assert.equal(t.groups.length,1);assert.equal(t.groups[0].parts[0].shape,'coupler');
});
test('bank controls choose RPM, side, direction, stop and save the articulated rotor',()=>{
 const game=lab(),{t}=game;const rotor=t.spawnRotor();assert(rotor);const g=t.rotorGroups(rotor)[0];t.setSelected({g,part:g.parts[0]});t.updateMechanismPanel();
 const rpm=node(game,'rotor-rpm');rpm.value='48';rpm.dispatchEvent({type:'input'});assert.equal(rotor.rpm,48);
 const side=node(game,'rotor-side');side.value='a';side.dispatchEvent({type:'change'});assert.equal(rotor.moving,'a');
 node(game,'rotor-counterclockwise').dispatchEvent({type:'click'});assert.equal(rotor.direction,-1);assert.equal(rotor.enabled,true);
 node(game,'rotor-stop').dispatchEvent({type:'click'});assert.equal(rotor.enabled,false);
 node(game,'rotor-save').dispatchEvent({type:'click'});assert.equal(t.savedMechanisms.length,1);assert.equal(t.savedMechanisms[0].name,'Rotor');
 assert.equal(t.savedMechanisms[0].joints[0].rpm,48);assert.equal(node(game,'saved-mechanism-list').children.length,1);
});
test('a standalone Enganche can be saved from the bank as a mechanism',()=>{
 const game=lab(),{t}=game;const g=t.addQubit([0,.2,0],1,'coupler');t.setSelected({g,part:g.parts[0]});t.updateMechanismPanel();
 assert.equal(node(game,'rotor-save').disabled,false);node(game,'rotor-save').dispatchEvent({type:'click'});
 assert.equal(t.savedMechanisms[0].name,'Enganche');assert.equal(t.savedMechanisms[0].joints.length,0);
});
test('right-click rotation submenu has both directions and an explicit mobile-side selector',()=>{
 const game=lab(),{t}=game,rotor=t.spawnRotor();t.showRotorRotation(rotor);
 const buttons=node(game,'command-actions').children;
 for(const label of ['Sentido horario','Sentido antihorario','Elegir lado que gira…'])assert(buttons.some(b=>b.textContent===label));
 buttons.find(b=>b.textContent==='Elegir lado que gira…').dispatchEvent({type:'click'});
 node(game,'command-actions').children.find(b=>b.textContent.includes('Girar lado A')).dispatchEvent({type:'click'});assert.equal(rotor.moving,'a');
});
test('Q lens transition changes FOV while world time and camera pose remain frozen, then returns',()=>{
 const game=lab(),{t}=game;t.story.scene='campaign';t.story.progress.level5=true;const before=t.getLook(),time=t.getSimTime();key(game,'keydown','KeyQ');
 t.updateHeldFocus(.05,false);assert(t.menuFocus.amount>0&&t.menuFocus.amount<.5);
 for(let i=0;i<25;i++)t.updateHeldFocus(.05,false);
 assert(t.heldFocus.focal>1.8);assert.deepEqual(t.getLook(),before);assert.equal(t.getSimTime(),time);
 key(game,'keydown','Escape');for(let i=0;i<25;i++)t.updateHeldFocus(.05,false);
 assert.equal(t.menuFocus.amount,0);assert.equal(t.heldFocus.focal,1.48256097);
});
