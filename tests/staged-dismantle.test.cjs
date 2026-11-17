const test=require('node:test'),assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs'),P=require('../assets/js/preferences.js');
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.pointerLockElement=t.canvas;return game;}
function assembly(t,n=32){return t.makeGroup(Array.from({length:n},(_,i)=>({id:t.allocateUnitId(),shape:['cube','tetra','pyramid','coupler'][i%4],weight:1+i%3*.1,p:t.V((i%8)*.12,1+Math.floor(i/8)*.14,0),q:t.Q()})));}
function inventory(t){return [...t.groups.flatMap(t.worldParts),...t.pendingDismantleParts()].map(p=>({id:p.id,shape:p.shape,weight:p.weight,energy:p.mood.energy,name:p.mood.name,workshop:p.mood.workshop})).sort((a,b)=>a.id-b.id);}
function finish(t){let steps=0;while(t.dismantleJobs.length&&steps++<3000)t.updateDismantling(1/60);assert.equal(t.dismantleJobs.length,0,'queue must finish in a clear room');return steps;}

test('staged mode releases at most eight bodies per frame, top layers first, preserving matter and charge',()=>{
 const {t}=lab(),g=assembly(t,80);g.parts.forEach((p,i)=>{p.mood.energy=.2+i/200;p.mood.name='Original '+p.id;});const before=inventory(t),top=t.worldParts(g).sort((a,b)=>b.p.y-a.p.y||a.id-b.id).slice(0,8).map(p=>p.id);
 assert(t.beginStagedDismantle([g]));assert.equal(t.groups.length,0);assert.equal(t.scenePieceCount(),80);assert.deepEqual(inventory(t),before);
 let first=null,steps=0;while(t.dismantleJobs.length&&steps++<3000){const count=t.groups.length;t.updateDismantling(1/60);const added=t.groups.length-count;assert(added<=8);if(added&&!first)first=t.groups.map(g=>g.parts[0].id);assert.equal(t.scenePieceCount(),80);assert.equal(new Set(inventory(t).map(p=>p.id)).size,80);}
 assert.equal(t.dismantleJobs.length,0);assert(first.length>0);assert.deepEqual(Array.from(first),Array.from(top.slice(0,first.length)));assert.deepEqual(inventory(t),before);
 for(const g of t.groups){assert(t.validPose(g,g.body.position,g.body.quaternion));assert.equal(g.body.velocity.norm(),0);assert.equal(g.body.angularVelocity.norm(),0);}
});

test('a new obstacle at the target delays activation and does not generate overlapping bodies',()=>{
 const {t}=lab(),g=assembly(t,2);assert(t.beginStagedDismantle([g]));t.updateDismantling(.01);const active=t.dismantleJobs[0].active[0],blocked=active.target.clone(),obstacle=t.addQubit([blocked.x,blocked.y,blocked.z]);
 finish(t);assert.equal(t.scenePieceCount(),3);for(const group of t.groups)if(group!==obstacle)assert(t.validPose(group,group.body.position,group.body.quaternion));
});

test('saving mid-dismantle, clearing and restoring resumes exactly the remaining identities once',()=>{
 const {t}=lab(),g=assembly(t,24),before=inventory(t);t.beginStagedDismantle([g]);while(!t.groups.length)t.updateDismantling(.04);
 const saved=t.saveLab(),pending=saved.dismantling[0].parts.length;assert(pending>0&&pending<24);
 t.clearNarrativeScene();assert.equal(t.pendingDismantleParts().length,0);assert.equal(t.groups.length,0);
 for(const record of saved.groups)t.makeGroup(record.parts,record.q,record.v,record.w);t.restoreLabMechanisms(saved);
 assert.equal(t.pendingDismantleParts().length,pending);assert.deepEqual(inventory(t),before);
 t.restoreDismantling(saved.dismantling);assert.equal(t.scenePieceCount(),24,'repeated restore cannot duplicate pending inventory');
 finish(t);assert.deepEqual(inventory(t),before);
});

test('pending matter still reserves the 2000-piece capacity and census',()=>{
 const {t,sandbox}=lab(),g=t.makeGroup(Array.from({length:2000},(_,i)=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(i%10*.09,1+Math.floor(i/100)*.09,Math.floor(i/10)%10*.09),q:t.Q()})));
 assert(t.beginStagedDismantle([g]));assert.equal(t.scenePieceCount(),2000);t.spawnQubit();assert.equal(t.scenePieceCount(),2000);assert.equal(t.groups.length,0);
 t.updateAlphaHUD();assert.match(sandbox.document.querySelector('#alpha-census-text').textContent,/2000/);
});

test('staged dismantling disconnects an active conveyor and retires its skins and controllers',()=>{
 const {t}=lab();assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('left'),t.V()));const c=t.conveyors[0],members=t.rotorConnectedGroups([t.rotorPart(c.baseId).g]),before=inventory(t),skin=c.surfaceBody;
 assert(t.beginStagedDismantle(members));assert.equal(t.rotors.length,0);assert.equal(t.conveyors.length,0);assert(!t.world.bodies.includes(skin));assert.equal(t.world.constraints.length,0);finish(t);assert.deepEqual(inventory(t),before);
});

test('mode selection preserves immediate default and staged mode applies to the existing shake action',()=>{
 assert.equal(P.defaults().dismantleMode,'instant');assert.equal(P.sanitize({dismantleMode:'bad'}).dismantleMode,'instant');
 const {t}=lab(),g=assembly(t,3),hit={g,part:g.parts[0],point:g.body.position.clone(),distance:.8};t.grabQubit(hit);assert(t.getHeld());t.applyPreferences({...P.defaults(),dismantleMode:'staged'});
 assert(t.dismantleHeldAssembly());assert.equal(t.getHeld(),null);assert.equal(t.groups.length,0);assert.equal(t.pendingDismantleParts().length,3);finish(t);
});

test('zero elapsed time pauses animation and clearing releases its GPU previews',()=>{
 const {t,buffers}=lab(),g=assembly(t);t.beginStagedDismantle([g]);const before=buffers.size;t.drawDismantling();assert(buffers.size>before);const state=JSON.stringify(t.serializeDismantling());
 for(let i=0;i<10;i++)t.updateDismantling(0);assert.equal(JSON.stringify(t.serializeDismantling()),state);t.clearNarrativeScene();assert.equal(t.dismantleJobs.length,0);assert.equal(buffers.size,before);
});

test('the gameplay menu offers both modes, applies only on save, and restores the immediate default',()=>{
 const {t,sandbox}=lab(),doc=sandbox.document,tabs=['look','game'].map(name=>{const b=doc.createElement('button');b.dataset.settingsTab=name;return b;});
 doc.querySelector('#settings-screen').querySelectorAll=q=>q==='[data-settings-tab]'?tabs:[];t.initSettingsScreen();const ui=t.getSettingsScreen(),click=id=>doc.querySelector('#'+id).dispatchEvent({type:'click'});
 ui.open('pause');tabs[1].dispatchEvent({type:'click'});const change=()=>{const select=doc.querySelector('#pref-dismantleMode');assert.equal(select.options.length,2);select.value='staged';select.dispatchEvent({type:'change'});};
 change();assert.equal(ui.draft.dismantleMode,'staged');assert.equal(t.getVisuals().dismantleMode,'instant');ui.requestClose();click('settings-discard');assert.equal(t.getVisuals().dismantleMode,'instant');
 ui.open('pause');change();click('settings-save');assert.equal(t.getVisuals().dismantleMode,'staged');click('settings-reset');assert.equal(t.getVisuals().dismantleMode,'staged');click('settings-save');assert.equal(t.getVisuals().dismantleMode,'instant');
});
