const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');
const preferences = require('../assets/js/preferences.js');

function lab() {
 const game = createGame(), {t, sandbox} = game, doc = sandbox.document;
 t.clearNarrativeScene();
 Object.assign(t.story, {ready:true, scene:'lab', mode:'playing', phase:'idle'});
 doc.body.dataset.booting='false';
 doc.pointerLockElement=t.canvas;
 t.canvas.requestPointerLock=()=>{doc.pointerLockElement=t.canvas;doc.dispatchEvent({type:'pointerlockchange'});};
 const el=id=>doc.getElementById(id), key=(type,code,target)=>doc.dispatchEvent({type,code,target,repeat:false});
 const middle=surface=>surface.dispatchEvent({type:'mousedown',button:1});
 return {...game,doc,el,key,middle};
}

test('M3 opens while walking, the wheel changes section, and a second M3 returns control',()=>{
 const {t,doc,el,key,middle}=lab();
 key('keydown','KeyW');middle(t.canvas);
 assert.equal(el('panel').hidden,false);assert.equal(doc.pointerLockElement,null);
 assert(t.keys.has('KeyW'));
 const before=[...t.position];t.frame(performance.now()+500);
 assert.notDeepEqual([...t.position],before);
 key('keyup','KeyW');assert(!t.keys.has('KeyW'));
 key('keydown','KeyW',{tagName:'INPUT',type:'text'});assert(!t.keys.has('KeyW'));
 el('panel').dispatchEvent({type:'wheel',deltaY:100});
 assert.equal(el('wheel-machines').getAttribute('aria-pressed'),'true');
 assert.equal(el('page-mechanisms').hidden,false);
 middle(el('panel'));assert.equal(el('panel').hidden,true);assert.equal(doc.pointerLockElement,t.canvas);
});

test('Q selects a catalog category in the same tablet and prepares one blueprint',()=>{
 const {t,doc,el,key}=lab();
 key('keydown','KeyQ');key('keyup','KeyQ');assert(!el('page-catalog').hidden);assert(!t.radialOpen());
 const filters=el('catalog-filters');
 filters.children.find(b=>b.textContent==='Máquinas').dispatchEvent({type:'click'});
 const arm=el('catalog-entries').children.find(b=>b.dataset.creation==='quick-arm');
 assert(arm);arm.dispatchEvent({type:'click'});
 assert.equal(el('panel').hidden,true);assert.equal(doc.pointerLockElement,t.canvas);assert(t.getCreationPreview());
 assert.equal(t.groups.length,0);
});

test('Shift and the wheel open only a nearby physical workbench and walking away restores the bank',()=>{
 const {t,el,middle}=lab();
 t.setupWorkshop();const {p}=t.getWorkshopBench();t.position[0]=p.x+6;t.position[2]=p.z;
 middle(t.canvas);assert.equal(el('tablet-workshop').disabled,true);
 el('tablet-workshop').dispatchEvent({type:'click'});assert(!t.getWorkshopPanel()?.isOpen);
 t.position[0]=p.x+.8;t.frame(performance.now()+500);assert.equal(el('tablet-workshop').disabled,false);
 el('panel').dispatchEvent({type:'wheel',deltaY:100,shiftKey:true});assert(t.getWorkshopPanel().isOpen);
 assert(!t.storySuspended());t.position[0]=p.x+6;t.frame(performance.now()+600);
 assert(!t.getWorkshopPanel().isOpen);assert(!el('panel').hidden);assert.equal(el('panel').dataset.mode,'bank');
});

test('hand changes persist and old preferences acquire the default tablet scale',()=>{
 const {t,el,middle,sandbox}=lab();let stored;
 sandbox.localStorage.setItem=(key,data)=>{if(key===preferences.KEY)stored=JSON.parse(data);};
 middle(t.canvas);el('tablet-hand').dispatchEvent({type:'click'});
 assert.equal(stored.tabletHand,'right');assert.equal(el('panel').dataset.hand,'right');
 assert.equal(preferences.sanitize({}).tabletScale,100);
 assert.equal(preferences.sanitize({tabletScale:250}).tabletScale,125);
});
