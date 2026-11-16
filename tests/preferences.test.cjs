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
function uiSetup(store=storage()){const game=createGame(),{t,sandbox}=game,doc=sandbox.document,screen=doc.querySelector('#settings-screen');sandbox.localStorage=store;const tabs=['look','performance','game','audio','keyboard','mando','subtitles'].map(name=>{const node=doc.createElement('button');node.dataset.settingsTab=name;return node;});screen.querySelectorAll=q=>q==='[data-settings-tab]'?tabs:[];Object.assign(t.story,{ready:true,mode:'pause'});t.initSettingsScreen();return {...game,tabs,doc,store,settings:t.getSettingsScreen(),click:id=>doc.querySelector('#'+id).dispatchEvent({type:'click'})};}
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
 tabs[3].dispatchEvent({type:'click'});const volume=doc.querySelector('#pref-volume');volume.value='65';volume.dispatchEvent({type:'input'});assert.equal(settings.draft.volume,65);
 const before=t.groups.map(g=>[g.body.position.x,g.body.position.y,g.body.position.z]),look=t.getLook();assert.doesNotThrow(()=>t.renderSettingsPreview(3000));assert.deepEqual(t.getLook(),look);assert.deepEqual(t.groups.map(g=>[g.body.position.x,g.body.position.y,g.body.position.z]),before);
});
test('after saving without leaving, subsequent edits remain attached to the new draft',()=>{
 const {settings,doc,click,t}=uiSetup();settings.open('pause');let color=doc.querySelector('#pref-outlineColor');color.value='#ffaa00';color.dispatchEvent({type:'input'});click('settings-save');assert.equal(t.getVisuals().outlineColor,'#ffaa00');
 color=doc.querySelector('#pref-outlineColor');color.value='#dd33ee';color.dispatchEvent({type:'input'});assert.equal(settings.draft.outlineColor,'#dd33ee');assert.equal(t.getVisuals().outlineColor,'#ffaa00');settings.requestClose();assert.equal(doc.querySelector('#settings-confirm').hidden,false);click('settings-confirm-save');assert.equal(t.getVisuals().outlineColor,'#dd33ee');
});

test('legacy settings acquire independent keyboard, controller and subtitle defaults without losing visual profiles',()=>{
 const old=P.defaults();delete old.controls;delete old.subtitles;old.profiles.neon.outlineColor='#ff5500';
 const migrated=P.load(storage({[P.KEY]:JSON.stringify(old)}));assert.equal(migrated.profiles.neon.outlineColor,'#ff5500');assert.equal(migrated.controls.keyboard.bindings.forward,'KeyW');assert.equal(migrated.controls.gamepad.preset,'explore');assert.equal(migrated.subtitles.npc.enabled,true);
 migrated.subtitles.npc.size=30;assert.equal(P.defaults().subtitles.npc.size,16);assert.equal(migrated.subtitles.qbits.size,15);
 const clean=P.sanitize({controls:{keyboard:{sensitivity:99}},subtitles:{npc:{color:'url(x)',size:100,opacity:-10},qbits:{enabled:false}}});assert.equal(clean.controls.keyboard.sensitivity,3);assert.equal(clean.subtitles.npc.size,32);assert.equal(clean.subtitles.npc.opacity,0);assert.equal(clean.subtitles.npc.color,'#34423a');assert.equal(clean.subtitles.qbits.enabled,false);
});
test('keyboard rebinding swaps duplicates inside the draft and capture Escape cancels without closing',()=>{
 const {t,doc,settings,tabs,click}=uiSetup();settings.open('pause');tabs[4].dispatchEvent({type:'click'});
 click('bind-keyboard-forward');assert.equal(doc.querySelector('#settings-screen').dataset.bindingCapture,'keyboard');
 doc.dispatchEvent({type:'keydown',code:'KeyD'});assert.equal(settings.draft.controls.keyboard.bindings.forward,'KeyD');assert.equal(settings.draft.controls.keyboard.bindings.right,'KeyW');assert.equal(t.getVisuals().controls.keyboard.bindings.forward,'KeyW');
 click('bind-keyboard-forward');doc.dispatchEvent({type:'keydown',code:'Escape'});assert(settings.isOpen);assert.equal(doc.querySelector('#settings-screen').dataset.bindingCapture,'');
 click('settings-save');assert.equal(t.getVisuals().controls.keyboard.bindings.forward,'KeyD');
 click('settings-reset');assert.equal(settings.draft.controls.keyboard.bindings.forward,'KeyW');settings.requestClose();assert.equal(doc.querySelector('#settings-confirm').hidden,false);click('settings-discard');assert.equal(t.getVisuals().controls.keyboard.bindings.forward,'KeyD');
});
test('controller capture waits for a new press and applies assignments only on save',()=>{
 const game=uiSetup(),{t,doc,settings,tabs,click,sandbox}=game;const buttons=Array.from({length:17},()=>({pressed:false,value:0})),pad={index:0,mapping:'standard',connected:true,id:'Test DualShock',buttons,axes:[0,0,0,0]};sandbox.navigator.getGamepads=()=>[pad];
 settings.open('pause');tabs[5].dispatchEvent({type:'click'});buttons[7]={pressed:true,value:1};click('bind-gamepad-forward');game.frame(1000);assert.equal(settings.draft.controls.gamepad.bindings.forward,null);
 buttons[7]={pressed:false,value:0};game.frame(1200);buttons[7]={pressed:true,value:1};game.frame(1400);assert.equal(settings.draft.controls.gamepad.bindings.forward,7);assert.equal(settings.draft.controls.gamepad.bindings.secondary,null);assert.equal(t.getVisuals().controls.gamepad.bindings.forward,null);
 click('settings-save');assert.equal(t.getVisuals().controls.gamepad.bindings.forward,7);assert.equal(doc.querySelector('#settings-screen').dataset.bindingCapture,'');
});
test('subtitle edits preserve independent channels and discard restores applied values',()=>{
 const {t,doc,settings,tabs,click}=uiSetup();settings.open('pause');tabs[6].dispatchEvent({type:'click'});
 const color=doc.querySelector('#pref-npc-color');color.value='#cc8800';color.dispatchEvent({type:'input'});const size=doc.querySelector('#pref-qbits-size');size.value='28';size.dispatchEvent({type:'input'});
 assert.equal(settings.draft.subtitles.npc.color,'#cc8800');assert.equal(settings.draft.subtitles.qbits.size,28);assert.equal(t.getVisuals().subtitles.qbits.size,15);assert.equal(doc.querySelector('#settings-subtitle-preview-qbits').style.fontSize,'28px');
 click('settings-save');assert.equal(t.getVisuals().subtitles.npc.color,'#cc8800');assert.equal(t.getVisuals().subtitles.qbits.size,28);
 const enabled=doc.querySelector('#pref-qbits-enabled');enabled.checked=false;enabled.dispatchEvent({type:'change'});settings.requestClose();click('settings-discard');assert.equal(t.getVisuals().subtitles.qbits.enabled,true);
});

test('old saves preserve their settings and acquire the original grab speed; only supported numeric speeds survive',()=>{
 const old=P.defaults();delete old.grabSpeed;old.volume=62;old.controls.gamepad.sensitivity=1.75;const migrated=P.load(storage({[P.KEY]:JSON.stringify(old)}));assert.equal(migrated.grabSpeed,1);assert.equal(migrated.volume,62);assert.equal(migrated.controls.gamepad.sensitivity,1.75);
 for(const speed of [1,2,3.5])assert.equal(P.sanitize({...old,grabSpeed:speed}).grabSpeed,speed);
 for(const speed of [undefined,null,'2',NaN,Infinity,-1,0,1.5,3,4])assert.equal(P.sanitize({...old,grabSpeed:speed}).grabSpeed,1);
});

test('gameplay speed is a shared saved setting with visible collision guidance, discard and a scoped reset',()=>{
 const base=P.defaults();base.controls.keyboard.sensitivity=2.2;base.controls.gamepad.sensitivity=1.7;base.volume=64;const store=storage({[P.KEY]:JSON.stringify(base)}),{t,doc,settings,tabs,click}=uiSetup(store);t.applyPreferences(base);settings.open('pause');tabs.find(tab=>tab.dataset.settingsTab==='game').dispatchEvent({type:'click'});
 const select=()=>doc.querySelector('#pref-grabSpeed');assert.deepEqual(select().options.map(option=>Number(option.value)),[1,2,3.5]);assert.match(doc.querySelector('#settings-grab-help').textContent,/piezas sujetas.*conjuntos.*teclado.*mando/);assert.match(doc.querySelector('#settings-grab-help').textContent,/caminar.*giro/);assert.equal(doc.querySelector('#settings-grab-warning').textContent,'Con velocidades altas, los choques pueden lanzar las piezas cercanas. Mueve con cuidado.');assert.match(select().getAttribute('aria-describedby'),/settings-grab-warning/);
 select().value='3.5';select().dispatchEvent({type:'change'});assert.equal(settings.draft.grabSpeed,3.5);assert.equal(t.getVisuals().grabSpeed,1);assert.equal(P.load(store).grabSpeed,1);click('settings-save');assert.equal(t.getVisuals().grabSpeed,3.5);assert.equal(P.load(store).grabSpeed,3.5);
 select().value='2';select().dispatchEvent({type:'change'});settings.requestClose();click('settings-discard');assert.equal(t.getVisuals().grabSpeed,3.5);assert.equal(P.load(store).grabSpeed,3.5);
 settings.open('pause');assert.equal(select().value,3.5);click('settings-reset');assert.equal(settings.draft.grabSpeed,1);assert.equal(settings.draft.controls.keyboard.sensitivity,2.2);assert.equal(settings.draft.controls.gamepad.sensitivity,1.7);assert.equal(settings.draft.volume,64);assert.equal(P.load(store).grabSpeed,3.5);settings.requestClose();click('settings-confirm-save');assert.equal(P.load(store).grabSpeed,1);assert.equal(t.getVisuals().grabSpeed,1);
});

test('guide voice has independent persisted volume, mute, validation and audio reset',()=>{
 const legacy=P.sanitize({volume:63,music:false});assert.equal(legacy.guideVolume,35);assert.equal(legacy.guideVoice,true);
 assert.equal(P.sanitize({guideVolume:999}).guideVolume,100);assert.equal(P.sanitize({guideVolume:NaN}).guideVolume,35);
 const {settings,tabs,doc,click,store,t}=uiSetup();settings.open('pause');tabs[3].dispatchEvent({type:'click'});
 const volume=doc.querySelector('#pref-guideVolume');volume.value='52';volume.dispatchEvent({type:'input'});
 const enabled=doc.querySelector('#pref-guideVoice');enabled.checked=false;enabled.dispatchEvent({type:'change'});
 assert.equal(t.getVisuals().guideVolume,35);click('settings-save');assert.equal(P.load(store).guideVolume,52);assert.equal(P.load(store).guideVoice,false);
 assert.equal(P.load(store).volume,30);click('settings-reset');assert.equal(settings.draft.guideVolume,35);assert.equal(settings.draft.guideVoice,true);
});
