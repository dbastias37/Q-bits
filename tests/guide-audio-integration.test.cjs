const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
async function prepare(game){let ready=false;const pending=game.api.prepare().then(()=>ready=true);for(let i=0;i<30&&!ready;i++){game.frame();await Promise.resolve();await Promise.resolve();}await pending;}
test('quick wake shows an enabled button and stays asleep until a separate gesture, preserving progress',async()=>{
 const game=createGame(),{t,api,sandbox}=game;assert.equal(api.quickWake(),false);await prepare(game);
 t.story.progress.level5=true;assert.equal(api.quickWake(),true);
 assert.equal(t.story.mode,'playing');assert.equal(t.story.phase,'asleep');assert.equal(t.story.dialogue,null);
 assert.equal(t.story.progress.level5,true);assert.equal(sandbox.document.querySelector('#wake-screen').hidden,false);
 assert.equal(sandbox.document.querySelector('#wake-button').disabled,false);
 let unlock=0;sandbox.QBitsGuideAudio.unlock=()=>unlock++;
 t.wakeUp();assert.equal(unlock,1);assert.equal(t.story.phase,'opening');assert.equal(api.quickWake(),false);
 t.tickStory(2.8);assert.equal(t.story.phase,'light');assert.match(t.story.dialogue.text,/era broma/);
 assert.equal(api.quickWake(),false,'active prologue cannot be reset by the shortcut');
});
test('physical º shortcut works from menu but ignores edits, repeats and active lab',async()=>{
 const game=createGame(),{t,api,sandbox}=game;await prepare(game);api.menu();
 const key=extra=>sandbox.document.dispatchEvent({type:'keydown',code:'Backquote',key:'º',...extra});
 key({repeat:true});assert.equal(t.story.mode,'menu');
 key({target:{tagName:'INPUT'}});assert.equal(t.story.mode,'menu');
 key({ctrlKey:true});assert.equal(t.story.mode,'menu');
 key();assert.equal(t.story.phase,'asleep');
 t.enterLab(false);const count=t.groups.length;key();assert.equal(t.story.scene,'lab');assert.equal(t.groups.length,count);
});
test('guide events follow actual revealed text; skip and pause stop voice while mysterious narration stays unvoiced',()=>{
 const game=createGame(),{t,sandbox}=game,events=[];Object.assign(t.story,{ready:true});
 sandbox.QBitsGuideAudio={begin:(text,options)=>events.push(['begin',text,options.voice]),reveal:(n,options)=>events.push(['reveal',n,!!options?.skip]),stop:()=>events.push(['stop']),setPaused:value=>events.push(['pause',value]),unlock:()=>events.push(['unlock'])};
 t.beginIntro();assert.deepEqual(events.find(e=>e[0]==='begin'),['begin','En el inicio no había nada…',false]);
 t.advanceDialogue();assert(events.some(e=>e[0]==='reveal'&&e[2]));
 t.beginIntro(true);assert.equal(events.filter(e=>e[0]==='begin').at(-1)[2],true);
 events.length=0;t.tickStory(.1);assert(events.some(e=>e[0]==='reveal'&&e[1]>0&&e[1]===sandbox.document.querySelector('#story-text').textContent.length));
 t.openPauseMenu();assert.deepEqual(events.at(-1),['pause',true]);
 events.length=0;t.tickStory(10);assert(!events.some(e=>e[0]==='reveal'));
 t.clearNarrativeScene();assert(events.some(e=>e[0]==='stop'));
});
