const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');

function setup() {
  const game = createGame();
  game.t.story.ready = true;
  game.t.canvas.requestPointerLock = async () => { game.sandbox.document.pointerLockElement = game.t.canvas; };
  game.sandbox.document.exitPointerLock = () => { game.sandbox.document.pointerLockElement = null; };
  return game;
}
function key(t, code = 'KeyE') { return t.storyInput({code, repeat:false, preventDefault(){}}); }
function finishNarration(t) {
  key(t); // Complete the first sentence.
  key(t); // Move to the invocation.
  key(t); // Complete it, exposing Despertar without opening the eyes.
}

test('preloading retains the opening narration at time zero and never exposes Despertar', async () => {
  const game = setup(), {t,api,sandbox} = game;
  let ready = false;
  const preparing = api.prepare().then(() => { ready = true; });
  for (let i=0;i<20&&!ready;i++){ game.frame(); await Promise.resolve(); await Promise.resolve(); }
  await preparing;
  assert.equal(t.story.mode, 'boot');
  assert.equal(t.story.phase, 'invocation');
  assert.equal(t.story.dialogue.text, 'En el inicio no había nada…');
  assert.equal(t.story.dialogue.time, 0);
  assert.equal(sandbox.document.querySelector('#wake-screen').hidden, true);
  for(let i=0;i<20;i++)t.tickStory(.05);
  assert.equal(t.story.dialogue.time, 0);
  t.wakeUp();
  assert.equal(t.story.phase, 'invocation');
  api.play();
  assert.equal(t.story.mode, 'playing');
  assert.equal(sandbox.document.querySelector('#wake-screen').hidden, true);
  assert.equal(t.story.dialogue.time, 0);
  t.tickStory(.05);
  assert(t.story.dialogue.time > 0);
});

test('narration precedes the wake prompt; the explicit next gesture opens the eyes', () => {
  const {t,sandbox} = setup();t.beginIntro();
  const wake = sandbox.document.querySelector('#wake-screen'), veil = sandbox.document.querySelector('#scene-veil');
  assert.equal(t.story.dialogue.text, 'En el inicio no había nada…');
  assert.equal(wake.hidden,true);assert.equal(veil.style.opacity,'1');
  t.wakeUp();assert.equal(t.story.phase,'invocation');
  key(t);assert.equal(t.story.dialogue.done,true);assert.equal(wake.hidden,true);
  key(t);assert.equal(t.story.dialogue.text,'Y un ser todopoderoso dijo: «Hágase la luz».');
  assert.equal(t.story.dialogue.done,false);assert.equal(wake.hidden,true);
  key(t);
  assert.equal(t.story.phase,'asleep');assert.equal(t.story.dialogue.done,true);assert.equal(wake.hidden,true);
  assert.equal(sandbox.document.querySelector('#story-text').textContent,'Y un ser todopoderoso dijo: «Hágase la luz».');
  t.tickStory(30);assert.equal(t.story.phase,'asleep');assert.equal(veil.style.opacity,'1');
  key(t);
  assert.equal(t.story.phase,'opening');assert.equal(wake.hidden,true);assert.equal(t.story.dialogue,null);
  assert.equal(t.storyLookAllowed(),false);
  t.tickStory(1.4);assert(Number(veil.style.opacity)>0&&Number(veil.style.opacity)<1);
  t.tickStory(1.4);
  assert.equal(veil.style.opacity,'0');assert.equal(t.story.phase,'light');
  assert.equal(t.story.dialogue.text,'Bueno, era broma. Estoy acá atrás. Detrás tuyo.');
  assert(!/no había nada|todopoderoso/.test(t.story.dialogue.text));
});

test('automatic narration reaches the prompt, with pause and resume preserving both stages', () => {
  const {t,sandbox} = setup();t.beginIntro();t.tickStory(.3);
  const narrationTime = t.story.dialogue.time;
  t.openPauseMenu();t.tickStory(30);
  assert.equal(t.story.dialogue.time,narrationTime);assert.equal(sandbox.document.querySelector('#wake-screen').hidden,true);
  t.resumeGame();assert.equal(t.story.phase,'invocation');
  t.tickStory(10);assert.equal(t.story.dialogue.text,'Y un ser todopoderoso dijo: «Hágase la luz».');
  assert.equal(sandbox.document.querySelector('#wake-screen').hidden,true);
  t.tickStory(3);assert.equal(t.story.phase,'asleep');assert.equal(sandbox.document.querySelector('#wake-screen').hidden,true);
  t.tickStory(6.7);assert.equal(sandbox.document.querySelector('#wake-screen').hidden,false);
  t.openPauseMenu();t.wakeUp();assert.equal(t.story.phase,'asleep');
  t.resumeGame();assert.equal(sandbox.document.querySelector('#wake-screen').hidden,false);
  assert.equal(sandbox.document.querySelector('#eye-top').style.height,'52%');
  sandbox.document.hidden=true;t.wakeUp();assert.equal(t.story.phase,'asleep');
  sandbox.document.hidden=false;t.wakeUp();assert.equal(t.story.phase,'opening');
});

test('restarting through a fade replays creation before waking, while tutorial replay skips it intentionally', () => {
  const {t,sandbox} = setup();t.beginIntro();finishNarration(t);assert.equal(t.story.phase,'asleep');
  t.sceneFade(()=>t.beginIntro());
  for(let i=0;i<70;i++)t.tickStory(.05);
  assert.equal(t.story.transition,null);assert.equal(t.story.phase,'invocation');
  assert.equal(t.story.dialogue.text,'En el inicio no había nada…');
  assert.equal(sandbox.document.querySelector('#wake-screen').hidden,true);
  t.beginIntro(true);
  assert.equal(t.story.phase,'pickup');assert.equal(sandbox.document.querySelector('#wake-screen').hidden,true);
  assert.match(t.story.dialogue.text,/Va de nuevo/);
});

test('invocation fades, waits in darkness, then slowly reveals Despertar; input cannot skip it',()=>{
 const {t,sandbox}=setup();t.beginIntro();finishNarration(t);
 const dialogue=sandbox.document.querySelector('#story-dialogue'),wake=sandbox.document.querySelector('#wake-screen'),button=sandbox.document.querySelector('#wake-button');
 key(t);assert.equal(t.story.phase,'asleep');assert.equal(wake.hidden,true);
 t.tickStory(2);assert.ok(Number(dialogue.style.opacity)>0&&Number(dialogue.style.opacity)<1);
 t.openPauseMenu();t.tickStory(20);assert.equal(t.story.phaseTime,2);t.resumeGame();
 sandbox.document.hidden=true;t.tickStory(20);assert.equal(t.story.phaseTime,2);sandbox.document.hidden=false;
 t.tickStory(.7);assert.equal(dialogue.hidden,true);assert.equal(wake.hidden,true);
 t.tickStory(2.5);assert.equal(wake.hidden,false);assert.ok(Number(wake.style.opacity)<.1);assert.equal(button.disabled,true);
 key(t);t.wakeUp();assert.equal(t.story.phase,'asleep');
 t.tickStory(1.5);assert.equal(Number(wake.style.opacity),1);assert.equal(button.disabled,false);
 key(t);assert.equal(t.story.phase,'opening');
});
