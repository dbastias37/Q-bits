// Run with: node --test tests/music.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../assets/js/music.js'), 'utf8');

function environment(config, files = {}) {
  const document = new EventTarget();
  document.hidden = false;
  document.baseURI = 'https://qbits.test/index.html';
  document.currentScript = { src: 'https://qbits.test/assets/js/music.js' };
  const blobs = new Map(), storage = new Map(), fetched = [], players = [];
  let nextBlob = 0;
  class TestURL extends URL {}
  TestURL.createObjectURL = blob => { const key = 'blob:music/' + ++nextBlob; blobs.set(key, blob); return key; };
  TestURL.revokeObjectURL = url => blobs.delete(url);
  class Audio extends EventTarget {
    constructor() { super(); this.paused = true; this.currentTime = 0; this.duration = 60; this.readyState = 0; this.volume = 1; players.push(this); }
    set src(value) { this._src = value; this.readyState = 0; this.currentTime = 0; }
    get src() { return this._src; }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    load() {
      if (!this.src) return;
      const blob = blobs.get(this.src);
      queueMicrotask(() => {
        if (blob?.type === 'audio/mpeg') { this.readyState = 2; this.dispatchEvent(new Event('loadeddata')); }
        else this.dispatchEvent(new Event('error'));
      });
    }
    play() { this.paused = false; this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
    pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
  }
  const context = {
    document, Audio, URL: TestURL, AbortController, setTimeout, clearTimeout, setInterval, clearInterval, console,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    fetch: async url => {
      const file = new URL(url).pathname.split('/').pop();
      fetched.push(file);
      if (file === 'playlist.json') return { ok: true, blob: async () => new Blob([JSON.stringify(config)]) };
      const data = files[file];
      if (!data) return { ok: false, status: 404 };
      return { ok: true, blob: async () => new Blob(['music bytes'], { type: data }) };
    }
  };
  context.window = context;
  vm.runInNewContext(source, context);
  return { music: context.QBitsMusic, document, fetched, players, storage, blobs, files, config };
}

test('empty playlist is silent and completes without requesting missing tracks', async () => {
  const e = environment({ tracks: [] }), progress = [];
  await e.music.preload({ onProgress: update => progress.push(update.progress) });
  assert.equal(e.music.getState().ready, true);
  assert.equal(e.music.getState().trackCount, 0);
  assert.deepEqual(e.fetched, ['playlist.json']);
  assert.equal(e.players.length, 0);
  assert.equal(progress.at(-1), 1);
  e.music.start();
  assert.equal(e.music.getState().playing, false);
  e.music.dispose();
});

test('tracks preload before user playback, loop without requests and pause when hidden', async () => {
  const e = environment({ tracks: [{ file: 'one.mp3' }, { file: 'two.mp3' }] }, { 'one.mp3': 'audio/mpeg', 'two.mp3': 'audio/mpeg' });
  await e.music.preload();
  let initialState;
  const unsubscribe = e.music.subscribe(state => { initialState = state; });
  assert.equal(initialState.ready, true);
  unsubscribe();
  assert.equal(e.music.getState().trackCount, 2);
  assert.equal(e.music.getState().playing, false);
  assert.deepEqual(e.fetched, ['playlist.json', 'one.mp3', 'two.mp3']);
  e.music.start();
  assert.equal(e.music.getState().playing, true);
  e.players[0].dispatchEvent(new Event('ended'));
  assert.equal(e.music.getState().track, 'two.mp3');
  assert.equal(e.fetched.length, 3);
  e.document.hidden = true;
  e.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(e.music.getState().playing, false);
  e.document.hidden = false;
  e.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(e.music.getState().playing, true);
  e.music.setPaused(true);
  e.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(e.music.getState().playing, false);
  e.music.setVolume(0.17);
  e.music.setMuted(true);
  assert.deepEqual(JSON.parse(e.storage.get('qbits.music.v1')), { volume: 0.17, muted: true });
  e.music.dispose();
  assert.equal(e.blobs.size, 0);
});

test('missing or corrupted audio cannot report 100 percent, and retry succeeds', async () => {
  const e = environment({ tracks: [{ file: 'one.mp3' }, { file: 'two.mp3' }] }, { 'one.mp3': 'audio/mpeg' });
  const progress = [];
  await assert.rejects(e.music.preload({ onProgress: update => progress.push(update.progress) }), /HTTP 404/);
  assert.equal(progress.includes(1), false);
  assert.equal(e.music.getState().ready, false);
  assert.equal(e.blobs.size, 0);
  e.files['two.mp3'] = 'text/html';
  await assert.rejects(e.music.preload(), /compatible|dañado/);
  assert.equal(e.music.getState().ready, false);
  assert.equal(e.blobs.size, 0);
  e.files['two.mp3'] = 'audio/mpeg';
  await e.music.preload();
  assert.equal(e.music.getState().ready, true);
  e.music.dispose();
});

test('playlist rejects paths outside the music folder', async () => {
  const e = environment({ tracks: [{ file: '../../../other.mp3' }] });
  await assert.rejects(e.music.preload(), /dentro de assets\/audio\/music/);
  assert.deepEqual(e.fetched, ['playlist.json']);
  e.music.dispose();
});

 test('campaign advances track without fetching again and menu resume keeps current position',async()=>{
 const e=environment({tracks:[{file:'a.mp3'},{file:'b.mp3'}]},{'a.mp3':'audio/mpeg','b.mp3':'audio/mpeg'});
 await e.music.preload();e.music.start();e.players[0].currentTime=17;e.music.setPaused(false);
 assert.equal(e.players[0].currentTime,17);e.music.next();assert.equal(e.music.getState().track,'b.mp3');assert.equal(e.music.getState().playing,true);assert.equal(e.fetched.length,3);e.music.dispose();
 });
