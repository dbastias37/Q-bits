const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../assets/js/preferences.js'),createGame=require('./game-harness.cjs');
function lab(){const game=createGame();game.t.clearNarrativeScene();Object.assign(game.t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});return game;}
test('old preferences default to 240; rates persist independently of graphics and reject invalid input',()=>{
 assert.equal(P.sanitize({}).physicsHz,240);
 for(const value of [0,-1,NaN,Infinity,90,'60',null])assert.equal(P.sanitize({physicsHz:value}).physicsHz,240);
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)},tx=P.transaction(storage);
 for(const hz of [120,60,240]){tx.draft.physicsHz=hz;P.setQuality(tx.draft,'low');assert.equal(tx.draft.physicsHz,hz);tx.save();assert.equal(P.load(storage).physicsHz,hz);}
});
test('settings preview/discard never changes the physics rate; save and restore do',()=>{
 const {t,sandbox}=lab(),doc=sandbox.document,screen=doc.querySelector('#settings-screen'),tabs=['look','performance'].map(name=>{const b=doc.createElement('button');b.dataset.settingsTab=name;return b;});
 screen.querySelectorAll=q=>q==='[data-settings-tab]'?tabs:[];t.initSettingsScreen();const settings=t.getSettingsScreen(),click=id=>doc.querySelector('#'+id).dispatchEvent({type:'click'});
 settings.open('pause');tabs[1].dispatchEvent({type:'click'});
 const change=hz=>{const select=doc.querySelector('#pref-physicsHz');select.value=String(hz);select.dispatchEvent({type:'change'});};
 change(60);assert.equal(settings.draft.physicsHz,60);assert.equal(settings.draft.quality,'balanced');assert.equal(t.getPhysicsStep(),1/240);
 t.renderSettingsPreview(3000);assert.equal(t.getPhysicsStep(),1/240);
 settings.requestClose();click('settings-discard');assert.equal(t.getPhysicsStep(),1/240);
 settings.open('pause');change(120);click('settings-save');assert.equal(t.getPhysicsStep(),1/120);
 click('settings-reset');assert.equal(t.getPhysicsStep(),1/120);assert.equal(settings.draft.physicsHz,240);click('settings-save');assert.equal(t.getPhysicsStep(),1/240);
});
test('changing rates recalibrates existing and future hinges without moving or duplicating matter',()=>{
 const {t}=lab(),r=t.spawnRotor(t.V(0,.35,0));
 const snapshot=()=>JSON.stringify(t.groups.map(g=>[g.parts.map(p=>[p.id,p.mood.energy]),g.body.position,g.body.velocity,g.body.quaternion]));
 const before=snapshot(),constraint=r.constraint;
 for(const hz of [120,60,240]){
  t.applyPreferences({...P.defaults(),physicsHz:hz});assert.equal(t.getPhysicsStep(),1/hz);assert.equal(r.constraint,constraint);assert.equal(snapshot(),before);
  for(const eq of constraint.equations){const {stiffness:k,relaxation:d}=eq.qbitsSpook;assert(Math.abs(eq.a-4*hz/(1+4*d))<1e-10);assert(Math.abs(eq.eps-4*hz*hz/(k*(1+4*d)))<1e-10);}
  const added=t.spawnRotor(t.V(hz/30,1,2));assert(added);for(const eq of added.constraint.equations)assert(Math.abs(eq.a-4*hz/17)<1e-10);
  for(const group of t.rotorGroups(added))t.removeGroup(group);t.refreshRotors();
 }
});
for(const hz of [240,120,60])test(`a simple motor simulates one second at ${hz} steps without changing elapsed time`,()=>{
 const {t}=lab();t.applyPreferences({...P.defaults(),physicsHz:hz});const r=t.spawnRotor(t.V(0,.35,0));assert(t.configureRotor(r,{rpm:30,mount:'fixed',enabled:true}));
 const start=t.getSimTime();for(let i=0;i<hz;i++)t.stepPhysics(t.getPhysicsStep());assert(Math.abs(t.getSimTime()-start-1)<1e-10);
 const a=t.rotorPart(r.aId),b=t.rotorPart(r.bId);assert(t.couplerTip(a).point.distanceTo(t.couplerTip(b).point)<.003);
 for(const g of t.rotorGroups(r))assert([g.body.position.x,g.body.position.y,g.body.position.z,g.body.angularVelocity.norm()].every(Number.isFinite));
});
