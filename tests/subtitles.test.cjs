const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const S=require('../assets/js/subtitles.js');
test('subtitle channels validate independently, clamp size/opacity and reject injected colors',()=>{
 const s=S.sanitize({npc:{enabled:false,color:'red;display:none',background:'#AaBbCc',size:999,opacity:-20},qbits:{enabled:'false',color:'#ABCDEF',size:NaN,opacity:Infinity}});
 assert.equal(s.npc.enabled,false);assert.equal(s.npc.color,S.defaults().npc.color);assert.equal(s.npc.background,'#aabbcc');assert.equal(s.npc.size,32);assert.equal(s.npc.opacity,0);
 assert.equal(s.qbits.enabled,true);assert.equal(s.qbits.color,'#abcdef');assert.equal(s.qbits.size,15);assert.equal(s.qbits.opacity,96);
 const a=S.defaults();a.qbits.size=30;assert.equal(S.defaults().qbits.size,15);
});
test('applying subtitles sets appearance without mutating saved values or hiding progression controls',()=>{
 const values=new Map(),body={dataset:{},style:{setProperty:(key,value)=>values.set(key,value)}},saved={subtitles:S.defaults()};
 S.apply(saved,body);assert.equal(body.dataset.npcSubtitleCustom,'false');assert.equal(values.get('--subtitle-qbits-size'),'15px');
 saved.subtitles.npc.enabled=false;saved.subtitles.qbits.color='#ff6600';saved.subtitles.qbits.size=24;saved.subtitles.qbits.background='#000000';saved.subtitles.qbits.opacity=75;
 const before=JSON.stringify(saved);S.apply(saved,body);
 assert.equal(body.dataset.npcSubtitles,'off');assert.equal(body.dataset.qbitsSubtitles,'on');assert.equal(body.dataset.npcSubtitleCustom,'false');
 assert.equal(values.get('--subtitle-qbits-background'),'rgba(0,0,0,0.75)');assert.equal(values.get('--subtitle-qbits-size'),'24px');assert.equal(JSON.stringify(saved),before);
 saved.subtitles.npc.size=20;S.apply(saved,body);assert.equal(body.dataset.npcSubtitleCustom,'true');
 const css=fs.readFileSync(path.join(__dirname,'../assets/css/subtitles.css'),'utf8');
 assert(css.includes("[data-npc-subtitles='off'] #story-text{visibility:hidden!important;}"));
 for(const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g))if(/display\s*:\s*none|visibility\s*:\s*hidden/.test(block[2]))assert(!/#story-dialogue|#story-choices|#dialogue-hint|#cooling-track/.test(block[1]),'interactive/progression containers are never hidden');
});
test('subtitle preview uses the same safe appearance as runtime',()=>{
 assert.deepEqual(S.styleObject({color:'#FF00CC',size:22,background:'#102030',opacity:50}),{color:'#ff00cc',fontSize:'22px',backgroundColor:'rgba(16,32,48,0.5)'});
 assert.doesNotThrow(()=>S.apply({subtitles:null},null));
});
test('turning NPC text off preserves the introduction advance and wake interaction',()=>{
 const game=require('./game-harness.cjs')(),{t,sandbox}=game,prefs=require('../assets/js/preferences.js').defaults();
 prefs.subtitles.npc.enabled=false;prefs.subtitles.qbits.enabled=false;t.applyPreferences(prefs);
 assert.equal(sandbox.document.body.dataset.npcSubtitles,'off');assert.equal(sandbox.document.body.dataset.qbitsSubtitles,'off');
 t.story.ready=true;t.beginIntro();const next=()=>t.storyInput({code:'KeyE',repeat:false,preventDefault(){}});
 next();next();next();assert.equal(t.story.phase,'asleep');t.tickStory(7);assert.equal(sandbox.document.querySelector('#wake-button').disabled,false);next();assert.equal(t.story.phase,'opening');
});
