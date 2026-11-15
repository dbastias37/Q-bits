const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../assets/js/preferences.js'),createGame=require('./game-harness.cjs');
function storage(raw={}){const data=new Map(Object.entries(raw));return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};}
test('settings draft never persists before save; discard and reload retain the saved snapshot',()=>{
 const store=storage(),tx=P.transaction(store);tx.begin();tx.draft.style='neon';tx.draft.profiles.neon.outlineColor='#ff6600';tx.draft.music=false;
 assert(tx.dirty);assert.equal(store.getItem(P.KEY),null);tx.discard();assert(!tx.dirty);assert.equal(tx.draft.style,'clean');
 tx.draft.style='psx';tx.draft.profiles.psx.warp=80;tx.save();assert(!tx.dirty);tx.draft.profiles.psx.warp=20;
 assert.equal(P.load(store).profiles.psx.warp,80);tx.begin();assert.equal(tx.draft.profiles.psx.warp,80);
});
test('a failed save preserves pending edits and the last applied snapshot',()=>{
 const store=storage(),tx=P.transaction(store);tx.draft.volume=63;store.setItem=()=>{throw Error('quota');};assert.throws(()=>tx.save(),/quota/);assert(tx.dirty);assert.equal(tx.saved.volume,30);assert.equal(tx.draft.volume,63);
});
test('styles own their colors and effects; performance presets do not erase them',()=>{
 const d=P.defaults();d.profiles.clean.outlineWidth=5;d.style='psx';d.profiles.psx.warp=90;P.setQuality(d,'low');assert.equal(d.profiles.psx.warp,90);assert.equal(d.profiles.clean.outlineWidth,5);assert.equal(d.resolution,65);assert.equal(d.shadows,'off');
 d.style='clean';assert.equal(P.effective(d).outlineWidth,5);assert.equal(P.effective(d).warp,0);
});
test('corrupt saves, impossible values and legacy music settings recover safely',()=>{
 assert.deepEqual(P.load(storage({[P.KEY]:'{broken'})),P.defaults());
 const clean=P.sanitize({resolution:999,volume:NaN,shadows:'RTX',fps:9000,profiles:{clean:{outlineColor:'javascript:',pathWidth:-10,warp:Infinity}}});
 assert.equal(clean.resolution,150);assert.equal(clean.volume,30);assert.equal(clean.shadows,'soft');assert.equal(clean.profiles.clean.pathWidth,1);assert.equal(clean.profiles.clean.warp,0);assert.match(clean.profiles.clean.outlineColor,/^#[a-f0-9]{6}$/);
 const legacy=P.load(storage({'qbits.music.v1':JSON.stringify({volume:.65,muted:true})}));assert.equal(legacy.volume,65);assert.equal(legacy.music,false);
});
test('selection markers follow live groups and disappear when the selected group is deleted',()=>{
 const {t}=createGame();t.clearNarrativeScene();for(const g of [...t.groups])t.removeGroup(g);
 const a=t.addQubit([0,.05,0]),b=t.addQubit([.3,.05,0]);t.setSelected({g:a,part:a.parts[0]});assert.deepEqual(Array.from(t.selectionGroups()),[a]);t.setMultiSelection([a,b]);assert.equal(t.selectionGroups().length,2);t.removeGroup(a);assert.deepEqual(Array.from(t.selectionGroups()),[b]);t.setMultiSelection([]);assert.equal(t.selectionGroups().length,0);
});
test('quality limits frame dimensions to the texture cap and pixel budget',()=>{
 const {t}=createGame(),s=P.defaults();s.resolution=150;s.sampling=2;
 for(const [w,h]of [[3840,2160],[5120,1440],[300,700]]){const scale=t.visualResolution(w,h,s);assert(w*h*scale*scale<=4500000.01);assert(Math.max(w,h)*scale<=4096);assert(scale>0);}
});
test('triangle strokes use requested pixel width, with no native wide-line dependency',()=>{
 const {t}=createGame(),gl=t.canvas.getContext('webgl'),uploads=[];gl.bufferData=(target,data)=>uploads.push(data);
 const {camera,yaw,pitch}=t.getLook(),a=t.V(...camera).vadd(t.V(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)).scale(1)),b=a.vadd(t.V(.15,0,0));
 t.drawWideLines([a,b],[0,1,1,1],5);assert.equal(uploads.length,1);const points=uploads[0];assert.equal(points.length,36);const pa=t.project(t.V(...points.slice(0,3))),pb=t.project(t.V(...points.slice(6,9)));assert(Math.abs(Math.hypot(pa.x-pb.x,pa.y-pb.y)-5)<.001);
});
function uiSetup(){const game=createGame(),{t,sandbox}=game,doc=sandbox.document,screen=doc.querySelector('#settings-screen');const tabs=['look','performance','audio'].map(name=>{const node=doc.createElement('button');node.dataset.settingsTab=name;return node;});screen.querySelectorAll=q=>q==='[data-settings-tab]'?tabs:[];Object.assign(t.story,{ready:true,mode:'pause'});t.initSettingsScreen();return {...game,tabs,doc,settings:t.getSettingsScreen(),click:id=>doc.querySelector('#'+id).dispatchEvent({type:'click'})};}
test('settings UI preserves the game and supports cancel, discard, and save-and-exit',()=>{
 const {t,doc,settings,click}=uiSetup(),initial=t.groups.length;settings.open('pause');assert.equal(t.story.mode,'settings');
 const selector=doc.querySelector('#pref-style');selector.value='neon';selector.dispatchEvent({type:'change'});assert.equal(settings.draft.style,'neon');assert.equal(t.getVisuals().style,'clean');
 settings.requestClose();assert.equal(doc.querySelector('#settings-confirm').hidden,false);click('settings-keep');assert(settings.isOpen);assert.equal(doc.querySelector('#settings-confirm').hidden,true);
 settings.requestClose();click('settings-discard');assert(!settings.isOpen);assert.equal(t.story.mode,'pause');assert.equal(t.getVisuals().style,'clean');assert.equal(t.groups.length,initial);
 settings.open('pause');const color=doc.querySelector('#pref-outlineColor');color.value='#ff7700';color.dispatchEvent({type:'input'});settings.requestClose();click('settings-confirm-save');assert(!settings.isOpen);assert.equal(t.getVisuals().outlineColor,'#ff7700');
});
test('settings exposes all performance/audio controls and preview cannot advance physics',()=>{
 const {t,settings,tabs,doc}=uiSetup();settings.open('pause');tabs[1].dispatchEvent({type:'click'});assert.equal(doc.querySelector('#pref-vsync').disabled,true);
 const quality=doc.querySelector('#pref-quality');quality.value='high';quality.dispatchEvent({type:'change'});assert.equal(settings.draft.shadows,'sharp');
 tabs[2].dispatchEvent({type:'click'});const volume=doc.querySelector('#pref-volume');volume.value='65';volume.dispatchEvent({type:'input'});assert.equal(settings.draft.volume,65);
 const before=t.groups.map(g=>[g.body.position.x,g.body.position.y,g.body.position.z]),look=t.getLook();assert.doesNotThrow(()=>t.renderSettingsPreview(3000));assert.deepEqual(t.getLook(),look);assert.deepEqual(t.groups.map(g=>[g.body.position.x,g.body.position.y,g.body.position.z]),before);
});
test('after saving without leaving, subsequent edits remain attached to the new draft',()=>{
 const {settings,doc,click,t}=uiSetup();settings.open('pause');let color=doc.querySelector('#pref-outlineColor');color.value='#ffaa00';color.dispatchEvent({type:'input'});click('settings-save');assert.equal(t.getVisuals().outlineColor,'#ffaa00');
 color=doc.querySelector('#pref-outlineColor');color.value='#dd33ee';color.dispatchEvent({type:'input'});assert.equal(settings.draft.outlineColor,'#dd33ee');assert.equal(t.getVisuals().outlineColor,'#ffaa00');settings.requestClose();assert.equal(doc.querySelector('#settings-confirm').hidden,false);click('settings-confirm-save');assert.equal(t.getVisuals().outlineColor,'#dd33ee');
});
