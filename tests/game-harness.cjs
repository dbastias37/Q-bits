// Headless logic harness: real game/Cannon code, DOM and GPU calls are stubs.
// This cannot validate pixels, shader compilation, real audio or browser input.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
module.exports = function createGame() {
  const root = path.join(__dirname, '..');
  let nextBuffer = 0, nextFrame = 0, seed = 731, nextTimer=0, timerTime=0;
  const buffers = new Set(), frames = new Map(), elements = new Map(), timers=new Map();
  function events(target) {
    const listeners = new Map();
    target.addEventListener = (type, callback, options = {}) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({callback, once:options?.once === true});
    };
    target.removeEventListener = (type, callback) => {
      listeners.set(type, (listeners.get(type) || []).filter(item => item.callback !== callback));
    };
    target.dispatchEvent = event => {
      event.target ||= target;event.currentTarget = target;
      event.preventDefault ||= function(){this.defaultPrevented=true;};
      event.stopPropagation ||= function(){};
      for (const item of [...(listeners.get(event.type) || [])]) {
        if(item.once)target.removeEventListener(event.type,item.callback);
        item.callback.call(target,event);
      }
      return !event.defaultPrevented;
    };
    return target;
  }
  const gl = new Proxy({
    getShaderParameter: () => true, getProgramParameter: () => true,
    getAttribLocation: () => 0, getUniformLocation: () => 0,
    createBuffer: () => { buffers.add(++nextBuffer); return nextBuffer; },
    deleteBuffer: id => buffers.delete(id), createShader: () => ({}), createProgram: () => ({}),
    isContextLost: () => false
  }, { get: (o, key) => key in o ? o[key] : /^[A-Z_]+$/.test(key) ? 0 : () => {} });
  const canvas2d = new Proxy({}, { get: (target,key) => key in target ? target[key] : () => {} });
  function element(key = '') {
    if (elements.has(key)) return elements.get(key);
    if(key.startsWith('#')){
      const created=[...elements.values()].find(el=>el.id===key.slice(1));
      if(created)return created;
    }
    const attributes = new Map(), classes = new Set();
    const el = events({
      id: key, style: { setProperty() {} }, dataset: {},
      classList: { add(...names){names.forEach(name=>classes.add(name));}, remove(...names){names.forEach(name=>classes.delete(name));}, contains:name=>classes.has(name), toggle(name,force){const enabled=force??!classes.has(name);if(enabled)classes.add(name);else classes.delete(name);return enabled;} }, value: 1, hidden: true,
      checked: false, clientWidth: 1280, clientHeight: 720, offsetWidth: 150, offsetHeight: 30,
      children: [], getContext: type => type==='2d'?canvas2d:gl,
      setAttribute(name,value) { attributes.set(name,String(value)); }, getAttribute:name=>attributes.get(name)??null,
      removeAttribute(name) { attributes.delete(name); },
      append(...items) { for(const item of items)this.appendChild(item); },
      appendChild(item) { item.parentNode?.removeChild(item);this.children.push(item);item.parentNode=this;return item; },
      removeChild(item) { const at=this.children.indexOf(item);if(at>=0)this.children.splice(at,1);item.parentNode=null;return item; },
      replaceChildren(...items) { for(const item of this.children)item.parentNode=null;this.children=[];this.append(...items); },
      remove() { this.parentNode?.removeChild(this); }, focus() {}, blur() {},
      querySelector: query => element(key + ' ' + query), querySelectorAll: () => [],
      contains: () => false, matches: () => false, closest: () => null,
      getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 })
    });
    elements.set(key, el); return el;
  }
  const document = events({
    querySelector: element, querySelectorAll: () => [], getElementById: id => element('#' + id),
    createElement: tag => element(tag + ' ' + elements.size),
    createElementNS: (_, tag) => element(tag + ' ' + elements.size),
    body: element('body'), documentElement: element('html'),
    hidden: false, activeElement: null, pointerLockElement: null,
    exitPointerLock(){this.pointerLockElement=null;this.dispatchEvent({type:'pointerlockchange'});}
  });
  const seededMath = Object.create(Math);
  seededMath.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const sandbox = events({
    console, document, navigator: { userAgent: 'logic-test' }, performance, URL, Blob,
    Float32Array, Int32Array, Uint32Array, Uint16Array, Uint8Array, ArrayBuffer, Map, Set,
    Math: seededMath, JSON, Promise, localStorage: { getItem: () => null, setItem() {} },
    requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(fn,delay=0,...args) { const id=++nextTimer;timers.set(id,{at:timerTime+Math.max(0,delay),fn,args});return id; },
    clearTimeout(id) { timers.delete(id); }, setInterval() {}, clearInterval() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1
  });
  sandbox.window = sandbox; sandbox.self = sandbox;
  vm.createContext(sandbox);
  let scripts;
  const gameFile = path.join(root, 'assets/js/game.js');
  if (fs.existsSync(gameFile)) {
    const wheelFile=path.join(root,'assets/js/radial-menu.js');
    scripts = [fs.readFileSync(path.join(root, 'assets/js/cannon.min.js'), 'utf8'),
      ...(fs.existsSync(wheelFile)?[fs.readFileSync(wheelFile,'utf8')]:[]), fs.readFileSync(path.join(root,'assets/js/rotor-power.js'),'utf8'), fs.readFileSync(gameFile, 'utf8')];
  } else {
    scripts = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  }
  const hook = `window.__testGame={
    savedMechanisms,mechanismSnapshot,mechanismGroups,mechanismPartCount,savedMechanismValid,saveMechanism,spawnSavedMechanism,persistMechanisms,loadSavedMechanisms,mechanismsExportData,importMechanismsData,serializeRotorState,restoreRotorState,clearPuzzleScene,leavePuzzle,
    beginCampaignLevel,beginIntro,showMain,hideStoryDialogue,
    planRoute,planCargoPath,startRoute,stopRoute,stepPhysics,groups,cargos,V,Q,world,story,bounds,
    poses,corners,drawQubits,drawStoryWorld,drawStoryGlass,updateTarget,updateSpeech,updateStoryMarker,
    measureEncounterBubbles,placeEncounterBubble,addEncounterBubble,encounterBubbles,
    findSnap,weld,makeFragments,detachPart,validPose,settings,spawnQubit,creationShape,updateAlphaHUD,
    rotors,rotorPart,couplerTip,rotorForGroup,rotorForPart,rotorGroups,rotorConnectedGroups,connectRotorTips,configureRotor,disconnectRotor,refreshRotors,spawnRotor,findRotorSnap,updateRotorMotors,allocateUnitId,rotorPowerState,prepareRotorPower,updateRotorPower,updateMoods,mechanismDefaults,
    unitProfile,unitFaces,unitGroundHeight,isTBit,normalizeUnitShape,rayPart,obbOverlap,drawUnitMesh,drawUnitOutline,
    touchingUnitFaces,findConvexSnap,duplicateSelection,saveLab,enterLab,rememberLab,updateCooling,createCooler,
    rollPoseAt,updateRoutes,makeRollSegment,savedShapeValid,saveShape,savedShapes,blueprintTargets,
    placeBlueprint,activateBlueprint,nearBlueprint,updateBlueprints,blueprints,importShapesData,drawAlpha,
    setHeld:value=>{held=value},setSelected:value=>{selected=value},getSelected:()=>selected,
    puzzle,getLook:()=>({yaw,pitch,camera:[...camera]}),setMarquee:value=>{marquee=value},
    initUnitRadial,openUnitRadial,closeUnitRadial,handleKeyUp,getUnitRadial:()=>unitRadial,
    radialOpen,unitRadialAllowed,storySuspended,onCanvasMouseDown,onCanvasMouseUp,pause,getSimTime:()=>simTime,
    makeGroup,worldParts,addQubit,removeGroup,orientations,clearNarrativeScene,rollGeometry,beginHaul,stopHaul,assignCrew,
    navigationJobs,runNavigationJobs,updatePosture,handleKey,handleWheel,grabQubit,releaseQubit,
    menuFocus,mechanismsUnlocked,mechanismsAvailable,creationChoiceAllowed,saveStoryProgress,showRotorRotation,showRotorSide,updateMechanismPanel,
    heldFocus,heldInspectionStrength,updateHeldFocus,updateMoodCallout,updateMoodSelection,project,screenRay,
    renderScene,focusPass,ensureFocusPass,disableFocusPass,resize,
    posture,position,keys,canvas,storyWorld,EYE_HEIGHT,frame,sceneFade,tickSceneFade,tickStory,storyInput,wakeUp,renderDialogue,advanceDialogue,resumeGame,openPauseMenu,storyLookAllowed,getHeld:()=>held,
    setRunning:value=>{running=value}};`;
  scripts = scripts.map(source => {
    if (!source.includes('function beginCampaignLevel(')) return source;
    const at = source.lastIndexOf('})();');
    if (at < 0) throw new Error('Game closure not found');
    return source.slice(0, at) + hook + source.slice(at);
  });
  for (const source of scripts) vm.runInContext(source, sandbox, { timeout: 10000 });
  return {
    t: sandbox.__testGame, api: sandbox.QBitsGame, sandbox, buffers,
    get radial() { return sandbox.__testGame.getUnitRadial(); },
    frame(time = performance.now()) { const batch = [...frames.values()]; frames.clear(); for (const fn of batch) fn(time); },
    advanceTimers(ms) {
      const end=timerTime+ms;let count=0;
      while(true){
        const next=[...timers.entries()].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
        if(!next)break;if(count++>1000)throw new Error('Timer queue did not settle');
        timers.delete(next[0]);timerTime=next[1].at;next[1].fn(...next[1].args);
      }
      timerTime=end;
    },
    navigationUntilIdle(limit = 2000) {
      let turns = 0;
      while (sandbox.__testGame.navigationJobs.size && turns++ < limit) sandbox.__testGame.runNavigationJobs();
      if (sandbox.__testGame.navigationJobs.size) throw new Error('Navigation did not settle');
      return turns;
    }
  };
};
