// Headless logic harness: real game/Cannon code, DOM and GPU calls are stubs.
// This cannot validate pixels, shader compilation, real audio or browser input.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
module.exports = function createGame() {
  const root = path.join(__dirname, '..');
  let nextBuffer = 0, nextFrame = 0, seed = 731;
  const buffers = new Set(), frames = new Map(), elements = new Map();
  const gl = new Proxy({
    getShaderParameter: () => true, getProgramParameter: () => true,
    getAttribLocation: () => 0, getUniformLocation: () => 0,
    createBuffer: () => { buffers.add(++nextBuffer); return nextBuffer; },
    deleteBuffer: id => buffers.delete(id), createShader: () => ({}), createProgram: () => ({}),
    isContextLost: () => false
  }, { get: (o, key) => key in o ? o[key] : /^[A-Z_]+$/.test(key) ? 0 : () => {} });
  function element(key = '') {
    if (elements.has(key)) return elements.get(key);
    const el = {
      id: key, style: { setProperty() {} }, dataset: {},
      classList: { add() {}, remove() {}, toggle() {} }, value: 1, hidden: true,
      checked: false, clientWidth: 1280, clientHeight: 720, offsetWidth: 150, offsetHeight: 30,
      children: [], getContext: () => gl, addEventListener() {}, removeEventListener() {},
      setAttribute() {}, getAttribute: () => '', append(...items) { this.children.push(...items); },
      appendChild(item) { this.children.push(item); return item; },
      replaceChildren(...items) { this.children = items; }, remove() {}, focus() {}, blur() {},
      querySelector: query => element(key + ' ' + query), querySelectorAll: () => [],
      contains: () => false, matches: () => false, closest: () => null,
      getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 })
    };
    elements.set(key, el); return el;
  }
  const document = {
    querySelector: element, querySelectorAll: () => [], getElementById: id => element('#' + id),
    createElement: tag => element(tag + ' ' + elements.size),
    createElementNS: (_, tag) => element(tag + ' ' + elements.size),
    body: element('body'), documentElement: element('html'), addEventListener() {}, removeEventListener() {},
    hidden: false, activeElement: null, pointerLockElement: null
  };
  const seededMath = Object.create(Math);
  seededMath.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const sandbox = {
    console, document, navigator: { userAgent: 'logic-test' }, performance, URL, Blob,
    Float32Array, Int32Array, Uint32Array, Uint16Array, Uint8Array, ArrayBuffer, Map, Set,
    Math: seededMath, JSON, Promise, localStorage: { getItem: () => null, setItem() {} },
    requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1
  };
  sandbox.window = sandbox; sandbox.self = sandbox;
  vm.createContext(sandbox);
  let scripts;
  const gameFile = path.join(root, 'assets/js/game.js');
  if (fs.existsSync(gameFile)) {
    scripts = [fs.readFileSync(path.join(root, 'assets/js/cannon.min.js'), 'utf8'), fs.readFileSync(gameFile, 'utf8')];
  } else {
    scripts = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  }
  const hook = `window.__testGame={beginCampaignLevel,beginIntro,showMain,hideStoryDialogue,
    planRoute,planCargoPath,startRoute,stopRoute,stepPhysics,groups,cargos,V,Q,world,story,bounds,
    poses,corners,drawQubits,drawStoryWorld,drawStoryGlass,updateTarget,updateSpeech,updateStoryMarker,
    makeGroup,worldParts,addQubit,removeGroup,orientations,clearNarrativeScene,rollGeometry,beginHaul,stopHaul,assignCrew,
    navigationJobs,runNavigationJobs,setRunning:value=>{running=value}};`;
  scripts = scripts.map(source => {
    if (!source.includes('function beginCampaignLevel(')) return source;
    const at = source.lastIndexOf('})();');
    if (at < 0) throw new Error('Game closure not found');
    return source.slice(0, at) + hook + source.slice(at);
  });
  for (const source of scripts) vm.runInContext(source, sandbox, { timeout: 10000 });
  return {
    t: sandbox.__testGame, api: sandbox.QBitsGame, sandbox, buffers,
    frame(time = performance.now()) { const batch = [...frames.values()]; frames.clear(); for (const fn of batch) fn(time); },
    navigationUntilIdle(limit = 2000) {
      let turns = 0;
      while (sandbox.__testGame.navigationJobs.size && turns++ < limit) sandbox.__testGame.runNavigationJobs();
      if (sandbox.__testGame.navigationJobs.size) throw new Error('Navigation did not settle');
      return turns;
    }
  };
};
