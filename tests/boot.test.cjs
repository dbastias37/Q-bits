// Run with: node --test tests/boot.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/boot.js'), 'utf8');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let n = 0; n < 12; n++) await Promise.resolve(); }
function environment({ autoFonts = true, openingFailure = null, randomValue = .5 } = {}) {
  class Element extends EventTarget {
    constructor() { super(); this.children = []; this.hidden = false; this.disabled = false; this.dataset = {}; this.style = {}; this.attributes = {}; this.textContent = ''; this.classes = new Set(); this.classList = { add: value => this.classes.add(value), remove: value => this.classes.delete(value), toggle: (value, enabled) => enabled ? this.classes.add(value) : this.classes.delete(value) }; }
    append(...nodes) { this.children.push(...nodes); }
    get firstElementChild() { return this.children[0]; }
    setAttribute(key, value) { this.attributes[key] = value; }
    cloneNode() { return new Element(); }
    focus() { this.focused = true; }
    click() { this.dispatchEvent(new Event('click')); }
  }
  const nodes = new Map();
  for (const selector of ['#boot-screen', '#boot-loading', '#boot-message', '#boot-percent', '#boot-progress', '#boot-play', '#boot-retry', '#boot-title', '#room', '#wake-button', '#main-screen', '#pause-screen', '#main-screen h1', '#main-play', '#opening-canvas']) nodes.set(selector, new Element());
  nodes.get('#boot-play').hidden = true;
  nodes.get('#boot-play').disabled = true;
  nodes.get('#boot-retry').hidden = true;
  nodes.get('#boot-loading').hidden = false;
  nodes.get('#boot-progress').append(new Element());
  nodes.get('#boot-screen').dataset.stage = 'loading';
  const scripts = [], events = [], errors = [], timers = new Map();
  let now = 0, nextTimer = 0, reloads = 0, sceneProgress, musicProgress;
  const gameReady = deferred(), musicReady = deferred(), cinematicReady = deferred();
  const fillValues = [], readyValues = [];
  const opening = {
    setProgress: value => fillValues.push(value),
    setReady: value => readyValues.push(value),
    play: ({onFrame}) => { events.push('opening.play');onFrame({matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],blur:6,opacity:0,progress:.8});return cinematicReady.promise; },
    dispose: () => events.push('opening.dispose')
  };
  const fontsReady = { Tengoku: deferred(), 'Spaceman UI': deferred(), 'LED Calculator': deferred() };
  const fontRequests = [];
  if (autoFonts) for (const [family, pending] of Object.entries(fontsReady)) pending.resolve([{ family }]);
  const document = {
    body: { dataset: { booting: 'true' } }, hidden: false,
    head: { append: script => scripts.push(script) },
    querySelector: selector => { if (!nodes.has(selector)) throw new Error('Unexpected selector ' + selector); return nodes.get(selector); },
    getElementById: id => nodes.get('#' + id),
    createElement: () => new Element(),
    fonts: { load: (font, text) => {
      fontRequests.push({ font, text });
      const family = Object.keys(fontsReady).find(name => font.includes(name));
      assert.ok(family, 'only declared typography is requested');
      return fontsReady[family].promise;
    } }
  };
  const context = Object.assign(new EventTarget(), {
    document,
    console: { error: (...values) => errors.push(values) },
    location: { reload: () => { reloads++; } },
    performance: { now: () => now },
    clearTimeout: id => timers.delete(id),
    QBitsOpening: openingFailure === 'missing' ? undefined : { create: canvas => {
      assert.equal(canvas, nodes.get('#opening-canvas'));
      events.push('opening.create');
      if (openingFailure === 'create') throw new Error('WebGL unavailable');
      return opening;
    } },
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { at: now + delay, fn }); return id; },
    QBitsGame: {
      prepare: callback => { events.push('game.prepare'); sceneProgress = callback; return gameReady.promise; },
      play: () => events.push('game.play'),
      menu: () => events.push('game.menu')
    },
    QBitsMusic: {
      preload: ({ onProgress }) => { events.push('music.preload'); musicProgress = onProgress; return musicReady.promise; },
      start: () => events.push('music.start'),
      subscribe: callback => callback({ muted: false, volume: 0.3, trackCount: 0 }),
      getState: () => ({ muted: false }),
      setMuted() {}, setVolume() {}
    }
  });
  if(randomValue!==undefined){context.Math=Object.create(Math);context.Math.random=()=>randomValue;}
  context.window = context;
  vm.runInNewContext(source, context);
  async function scriptResult(name, success = true) {
    const script = scripts.find(item => item.src.startsWith('assets/js/' + name + '?'));
    assert.ok(script, name + ' must have been requested');
    success ? script.onload() : script.onerror();
    await flush();
  }
  async function loadScripts() {
    await scriptResult('cannon.min.js');
    await scriptResult('radial-menu.js');
    await scriptResult('rotor-power.js');
    await scriptResult('campaign-reconfiguration.js');
    await scriptResult('progression.js');
    await scriptResult('campaign-automation.js');
    await scriptResult('campaign-production.js');
    await scriptResult('workshop.js');
    await scriptResult('contact-sensors.js');
    await scriptResult('preferences.js');
    await scriptResult('graphics.js');
    await scriptResult('settings.js');
    await scriptResult('game.js');
    await scriptResult('music.js');
  }
  async function advance(ms) {
    const end = now + ms;
    for (;;) {
      let next = null;
      for (const [id, timer] of timers) if (timer.at <= end && (!next || timer.at < next[1].at)) next = [id, timer];
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].fn();
      await flush();
    }
    now = end;
    await flush();
  }
  return { nodes, events, errors, document, context, gameReady, musicReady, cinematicReady, fillValues, readyValues, fontsReady, fontRequests, loadScripts, scriptResult, advance,
    sceneProgress: value => sceneProgress(value),
    musicProgress: value => musicProgress({ progress: value }),
    get reloads() { return reloads; }
  };
}

test('all three fonts must resolve before the dot title cinematic can be started', async () => {
  const e = environment({ autoFonts: false });
  await e.loadScripts();
  e.gameReady.resolve();e.musicReady.resolve();
  await e.advance(20000);
  assertBlocked(e);
  assert.equal(e.fontRequests.length, 3);
  for (const family of ['Tengoku', 'Spaceman UI']) {
    e.fontsReady[family].resolve([{ family }]);await flush();assertBlocked(e);
  }
  e.nodes.get('#boot-play').click();
  assert.equal(e.events.includes('opening.play'), false);
  e.fontsReady['LED Calculator'].resolve([{ family: 'LED Calculator' }]);
  await flush();await e.advance(200);
  assert.equal(e.nodes.get('#boot-play').hidden, false);
  assert.equal(e.nodes.get('#boot-percent').textContent, '100%');
  assert.equal(e.nodes.get('#boot-screen').dataset.stage, 'ready');
});

for (const family of ['Tengoku', 'Spaceman UI', 'LED Calculator']) for (const failure of ['rejected', 'empty']) {
  test(failure + ' ' + family + ' load blocks completion and offers retry', async () => {
    const e = environment({ autoFonts: false });
    await e.loadScripts();
    e.gameReady.resolve();
    e.musicReady.resolve();
    for (const [name, pending] of Object.entries(e.fontsReady)) {
      if (name !== family) pending.resolve([{ family: name }]);
      else if (failure === 'rejected') pending.reject(new Error('Missing ' + family));
      else pending.resolve([]);
    }
    await flush();
    await e.advance(10000);
    assertBlocked(e);
    assert.equal(e.nodes.get('#boot-retry').hidden, false);
    assert.equal(e.nodes.get('#boot-screen').dataset.stage, 'loading');
    e.nodes.get('#boot-play').click();
    assert.equal(e.events.includes('game.play'), false);
  });
}

function assertBlocked(e) {
  assert.equal(e.nodes.get('#boot-play').hidden, true);
  assert.equal(e.nodes.get('#boot-play').disabled, true);
  assert.notEqual(e.nodes.get('#boot-percent').textContent, '100%');
}

const dependencies=['radial-menu.js','rotor-power.js','campaign-reconfiguration.js','progression.js','campaign-automation.js','campaign-production.js','workshop.js','contact-sensors.js'];
for(const module of dependencies)test(`a missing ${module} blocks game preparation, 100 percent and Comenzar even when music is ready`, async () => {
  const e=environment();
  await e.scriptResult('cannon.min.js');
  for(const dependency of dependencies.slice(0,dependencies.indexOf(module)))await e.scriptResult(dependency);
  assert.equal(e.events.includes('game.prepare'),false,'the game waits for the selector dependency');
  await e.scriptResult(module,false);
  assert.equal(e.events.includes('game.prepare'),false);
  assert.ok(e.errors.some(values=>values.some(value=>(value?.message||'').includes(module))),'the failed dependency is reported');
  assert.equal(e.nodes.get('#boot-retry').hidden,false);
  await e.scriptResult('music.js');
  e.musicProgress(1);e.musicReady.resolve();e.gameReady.resolve();
  await e.advance(10000);
  assertBlocked(e);
  e.nodes.get('#boot-play').click();
  assert.equal(e.events.includes('music.start'),false);assert.equal(e.events.includes('game.play'),false);
  e.nodes.get('#boot-retry').click();assert.equal(e.reloads,1);
});

test('cinematic and reported progress cannot unlock a pending scene preparation', async () => {
  const e = environment();
  await e.loadScripts();
  e.sceneProgress(1);
  e.musicProgress(1);
  e.musicReady.resolve();
  await flush();
  await e.advance(10000);
  assert.equal(e.nodes.get('#boot-screen').dataset.stage, 'loading');
  assertBlocked(e);
  e.nodes.get('#boot-play').click();
  assert.equal(e.events.includes('game.play'), false);
  e.gameReady.resolve();
  await flush();
  assert.equal(e.nodes.get('#boot-percent').textContent, '100%');
  assert.equal(e.nodes.get('#boot-play').hidden, false);
  assert.equal(e.nodes.get('#boot-play').disabled, false);
});

test('pending music blocks 100 percent even after the scene and cinematic finish', async () => {
  const e = environment();
  await e.loadScripts();
  e.sceneProgress(1);
  e.gameReady.resolve();
  e.musicProgress(0.9);
  await e.advance(10000);
  assertBlocked(e);
  // A progress callback is not proof of completion: the promise must resolve.
  e.musicProgress(1);
  assertBlocked(e);
  e.musicReady.resolve();
  await flush();
  assert.equal(e.nodes.get('#boot-percent').textContent, '100%');
  assert.equal(e.nodes.get('#boot-play').hidden, false);
});

test('ready assets still show a gradual fill before enabling Comenzar', async () => {
  const e = environment();await e.loadScripts();
  e.gameReady.resolve();e.musicReady.resolve();await flush();
  assert.equal(e.nodes.get('#boot-loading').hidden, false);
  assertBlocked(e);
  e.nodes.get('#boot-play').click();
  assert.equal(e.events.includes('opening.play'), false);
  await e.advance(2000);
  const intermediate = parseInt(e.nodes.get('#boot-percent').textContent, 10);
  assert.ok(intermediate > 0 && intermediate < 100, 'the first impression has a visible intermediate fill');
  assertBlocked(e);
  await e.advance(18000);
  assert.equal(e.nodes.get('#boot-percent').textContent, '100%');
  assert.equal(e.nodes.get('#boot-play').disabled, false);
  assert.ok(e.fillValues.length > 2);
  assert.ok(e.fillValues.every((n, i) => n >= 0 && n <= 1 && (!i || n >= e.fillValues[i - 1])), 'the glass fills monotonically');
  assert.equal(e.fillValues.at(-1), 1);
  assert.equal(e.readyValues.at(-1), true);
});

test('Comenzar starts the cinematic once and projects the inert live menu and hands off without a second animation', async () => {
  const e = environment();await e.loadScripts();
  e.gameReady.resolve();e.musicReady.resolve();await e.advance(20000);
  e.nodes.get('#boot-play').click();
  // Media activation must stay in the user-gesture stack.
  assert.ok(e.events.includes('music.start'));
  assert.ok(e.events.includes('opening.play'));
  assert.equal(e.events.includes('game.play'), false, 'opening must not begin the campaign');
  assert.equal(e.events.includes('game.menu'), false, 'menu input waits for the camera dive');
  assert.equal(e.nodes.get('#main-screen').hidden,false);
  assert.equal(e.nodes.get('#main-screen').inert,true);
  assert.equal(e.nodes.get('#main-screen').style.opacity,'0','menu stays invisible during the dive');
  assert.equal(e.nodes.get('#main-screen').style.filter,'blur(6px)');
  assert.equal(e.document.body.dataset.booting, 'true');
  e.nodes.get('#boot-play').click();
  assert.equal(e.events.filter(v => v === 'opening.play').length, 1);
  await e.advance(10000);
  assert.equal(e.events.includes('game.menu'), false);
  e.cinematicReady.resolve();await flush();
  assert.equal(e.events.filter(v => v === 'game.menu').length, 1);
  assert.equal(e.document.body.dataset.booting, 'false');
  assert.equal(e.nodes.get('#main-screen').inert,false);
  assert.equal(e.nodes.get('#main-screen').style.transform,'');
  assert.equal(e.nodes.get('#main-screen').style.filter,'');
  assert.equal(e.nodes.get('#boot-screen').hidden, true);
  assert.equal(e.nodes.get('#main-play').focused, true);
  assert.ok(e.events.includes('opening.dispose'));
  assert.equal(e.events.includes('game.play'), false);
});

test('a hidden tab pauses the simulated fill instead of skipping the first impression', async () => {
  const e = environment();await e.loadScripts();
  e.gameReady.resolve();e.musicReady.resolve();await e.advance(1000);
  e.document.hidden = true;
  const before = e.nodes.get('#boot-percent').textContent;
  await e.advance(30000);
  assert.equal(e.nodes.get('#boot-percent').textContent, before);
  assertBlocked(e);
  e.document.hidden = false;await e.advance(20000);
  assert.equal(e.nodes.get('#boot-percent').textContent, '100%');
});

test('cinematic failure keeps gameplay blocked and offers a retry', async () => {
  const e = environment();await e.loadScripts();
  e.gameReady.resolve();e.musicReady.resolve();await e.advance(20000);
  e.nodes.get('#boot-play').click();
  e.cinematicReady.reject(new Error('Opening renderer lost context'));await flush();
  assert.equal(e.events.includes('game.menu'), false);
  assert.equal(e.events.includes('game.play'), false);
  assert.equal(e.document.body.dataset.booting, 'true');
  assert.equal(e.nodes.get('#boot-retry').hidden, false);
  assert.equal(e.nodes.get('#boot-play').disabled, true);
  e.nodes.get('#boot-retry').click();assert.equal(e.reloads, 1);
});

for (const failure of ['missing', 'create']) test('opening ' + failure + ' failure offers retry without entering campaign', async () => {
  const e = environment({ openingFailure: failure });await flush();
  assert.equal(e.nodes.get('#boot-retry').hidden, false);
  assert.equal(e.nodes.get('#boot-play').disabled, true);
  assert.equal(e.events.includes('game.play'), false);
  e.nodes.get('#boot-retry').click();assert.equal(e.reloads, 1);
});

for (const failure of ['script', 'music', 'scene']) {
  test(failure + ' failure shows retry and cannot be overwritten by later readiness', async () => {
    const e = environment();
    if (failure === 'script') await e.scriptResult('cannon.min.js', false);
    else {
      await e.loadScripts();
      (failure === 'music' ? e.musicReady : e.gameReady).reject(new Error('Expected ' + failure + ' failure'));
      await flush();
    }
    assert.equal(e.nodes.get('#boot-retry').hidden, false);
    assert.equal(e.nodes.get('#boot-retry').focused, true);
    assert.equal(e.nodes.get('#boot-loading').hidden, false);
    assertBlocked(e);
    e.gameReady.resolve();
    e.musicReady.resolve();
    await e.advance(10000);
    assertBlocked(e);
    e.nodes.get('#boot-play').click();
    assert.equal(e.events.includes('music.start'), false);
    e.nodes.get('#boot-retry').click();
    assert.equal(e.reloads, 1);
  });
}

test('different startup random values change the loading pauses',async()=>{
 const a=environment({randomValue:0}),b=environment({randomValue:.9});
 await a.advance(3000);await b.advance(3000);
 assert.notEqual(a.nodes.get('#boot-percent').textContent,b.nodes.get('#boot-percent').textContent);
 assertBlocked(a);assertBlocked(b);
});

test('short loading presentation finishes within 4.2 seconds even with longest random pauses',async()=>{
 const e=environment({randomValue:.999});await e.loadScripts();e.gameReady.resolve();e.musicReady.resolve();await flush();
 await e.advance(2000);assertBlocked(e);
 await e.advance(2200);assert.equal(e.nodes.get('#boot-percent').textContent,'100%');assert.equal(e.nodes.get('#boot-play').disabled,false);
});
