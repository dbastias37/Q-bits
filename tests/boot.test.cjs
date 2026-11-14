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
function environment({ autoFonts = true } = {}) {
  class Element extends EventTarget {
    constructor() { super(); this.children = []; this.hidden = false; this.disabled = false; this.dataset = {}; this.style = {}; this.attributes = {}; this.textContent = ''; this.classes = new Set(); this.classList = { add: value => this.classes.add(value) }; }
    append(...nodes) { this.children.push(...nodes); }
    get firstElementChild() { return this.children[0]; }
    setAttribute(key, value) { this.attributes[key] = value; }
    cloneNode() { return new Element(); }
    focus() { this.focused = true; }
    click() { this.dispatchEvent(new Event('click')); }
  }
  const nodes = new Map();
  for (const selector of ['#boot-screen', '#boot-loading', '#boot-message', '#boot-percent', '#boot-progress', '#boot-play', '#boot-retry', '#boot-title', '#wake-button', '#main-screen', '#pause-screen', '#main-screen h1']) nodes.set(selector, new Element());
  nodes.get('#boot-play').hidden = true;
  nodes.get('#boot-play').disabled = true;
  nodes.get('#boot-retry').hidden = true;
  nodes.get('#boot-loading').hidden = true;
  nodes.get('#boot-progress').append(new Element());
  nodes.get('#boot-screen').dataset.stage = 'black';
  const scripts = [], events = [], errors = [], timers = new Map();
  let now = 0, nextTimer = 0, reloads = 0, sceneProgress, musicProgress;
  const gameReady = deferred(), musicReady = deferred();
  const fontsReady = { Parisienne: deferred(), Spaceman: deferred() };
  const fontRequests = [];
  if (autoFonts) for (const [family, pending] of Object.entries(fontsReady)) pending.resolve([{ family }]);
  const document = {
    body: { dataset: { booting: 'true' } },
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
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { at: now + delay, fn }); return id; },
    QBitsGame: {
      prepare: callback => { events.push('game.prepare'); sceneProgress = callback; return gameReady.promise; },
      play: () => events.push('game.play')
    },
    QBitsMusic: {
      preload: ({ onProgress }) => { events.push('music.preload'); musicProgress = onProgress; return musicReady.promise; },
      start: () => events.push('music.start'),
      subscribe: callback => callback({ muted: false, volume: 0.3, trackCount: 0 }),
      getState: () => ({ muted: false }),
      setMuted() {}, setVolume() {}
    }
  });
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
  return { nodes, events, errors, document, context, gameReady, musicReady, fontsReady, fontRequests, loadScripts, scriptResult, advance,
    sceneProgress: value => sceneProgress(value),
    musicProgress: value => musicProgress({ progress: value }),
    get reloads() { return reloads; }
  };
}

test('both font faces must finish before the title and Jugar can appear', async () => {
  const e = environment({ autoFonts: false });
  await e.loadScripts();
  e.gameReady.resolve();
  e.musicReady.resolve();
  await e.advance(10000);
  assertBlocked(e);
  assert.equal(e.nodes.get('#boot-screen').dataset.stage, 'black');
  assert.deepEqual(e.fontRequests.map(request => request.font), ['28px Parisienne', '14px Spaceman']);
  e.fontsReady.Parisienne.resolve([{ family: 'Parisienne' }]);
  await flush();
  assertBlocked(e);
  assert.equal(e.nodes.get('#boot-screen').dataset.stage, 'black');
  e.fontsReady.Spaceman.resolve([{ family: 'Spaceman' }]);
  await flush();
  assert.equal(e.nodes.get('#boot-screen').dataset.stage, 'title');
  assert.equal(e.nodes.get('#boot-play').hidden, true);
  await e.advance(1600);
  assert.equal(e.nodes.get('#boot-play').hidden, false);
  assert.equal(e.nodes.get('#boot-percent').textContent, '100%');
});

for (const failure of ['rejected', 'empty']) {
  test(failure + ' font load blocks completion and offers retry', async () => {
    const e = environment({ autoFonts: false });
    await e.loadScripts();
    e.gameReady.resolve();
    e.musicReady.resolve();
    e.fontsReady.Parisienne.resolve([{ family: 'Parisienne' }]);
    if (failure === 'rejected') e.fontsReady.Spaceman.reject(new Error('Missing font'));
    else e.fontsReady.Spaceman.resolve([]);
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

test('ready assets wait for the cinematic; the click starts audio synchronously and plays once', async () => {
  const e = environment();
  await e.loadScripts();
  e.gameReady.resolve();
  e.musicReady.resolve();
  await flush();
  assert.equal(e.nodes.get('#boot-loading').hidden, true);
  assert.equal(e.nodes.get('#boot-play').hidden, true);
  assert.equal(e.nodes.get('#boot-play').disabled, true);
  e.nodes.get('#boot-play').click();
  assert.equal(e.events.includes('music.start'), false);
  await e.advance(250);
  assert.equal(e.nodes.get('#boot-screen').dataset.stage, 'credit-visible');
  await e.advance(3100);
  assert.equal(e.nodes.get('#boot-screen').dataset.stage, 'black');
  await e.advance(2900);
  assert.equal(e.nodes.get('#boot-screen').dataset.stage, 'title');
  assert.equal(e.nodes.get('#boot-play').hidden, true);
  await e.advance(1600);
  assert.equal(e.nodes.get('#boot-screen').dataset.stage, 'loading');
  assert.equal(e.nodes.get('#boot-play').disabled, false);
  e.nodes.get('#boot-play').click();
  // No promise/timer flush here: both calls must occur in the click call stack.
  assert.deepEqual(e.events.slice(-2), ['music.start', 'game.play']);
  assert.equal(e.document.body.dataset.booting, 'false');
  e.nodes.get('#boot-play').click();
  assert.equal(e.events.filter(event => event === 'game.play').length, 1);
  await e.advance(850);
  assert.equal(e.nodes.get('#boot-screen').hidden, true);
  assert.equal(e.nodes.get('#wake-button').focused, true);
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
