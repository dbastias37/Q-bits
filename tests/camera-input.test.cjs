const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');

// These tests dispatch the game's real handlers. Pointer Lock and the DOM are
// simulated; they do not certify a browser/driver's actual mouse samples.
function setup() {
  const game = createGame();
  const {t, sandbox} = game;
  t.clearNarrativeScene();
  Object.assign(t.story, {ready:true, scene:'lab', mode:'playing', phase:'idle'});
  sandbox.document.body.dataset.booting = 'false';
  sandbox.document.querySelector('#panel').hidden = true;
  t.setLook({yaw:0, pitch:-.2});
  return game;
}

function lock(game) {
  game.sandbox.document.pointerLockElement = game.t.canvas;
  game.sandbox.document.dispatchEvent({type:'pointerlockchange'});
}

function mouse(game, movementX, movementY) {
  game.sandbox.document.dispatchEvent({type:'mousemove', movementX, movementY});
}

async function requestCapture(game) {
  game.t.canvas.dispatchEvent({type:'click'});
  await settleCapture();
}

async function settleCapture() {
  // The DOM click handler starts captureMouse without returning its Promise.
  // Drain only the immediate Promise chain, including an unsupported-raw retry.
  for (let i=0; i<6; i++) await Promise.resolve();
}

function sameLook(actual, expected) {
  assert.equal(actual.yaw, expected.yaw);
  assert.equal(actual.pitch, expected.pitch);
  assert.deepEqual(Array.from(actual.camera), Array.from(expected.camera));
}

test('mouse capture requests unadjusted movement when the browser supports it', async () => {
  const game = setup(), calls = [];
  game.t.canvas.requestPointerLock = async options => {calls.push(options); lock(game);};
  await requestCapture(game);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.unadjustedMovement, true);
  assert.equal(game.sandbox.document.pointerLockElement, game.t.canvas);
  mouse(game, 8, -3);
  assert(Math.abs(game.t.getLook().yaw + .016) < 1e-12);
  assert(Math.abs(game.t.getLook().pitch + .194) < 1e-12);
});

test('unsupported raw movement falls back to ordinary Pointer Lock', async () => {
  const game = setup(), calls = [];
  game.t.canvas.requestPointerLock = async options => {
    calls.push(options);
    if (options?.unadjustedMovement) throw Object.assign(new Error('Raw mouse input unavailable'), {name:'NotSupportedError'});
    lock(game);
  };
  await requestCapture(game);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].unadjustedMovement, true);
  assert.equal(calls[1], undefined);
  assert.equal(game.sandbox.document.pointerLockElement, game.t.canvas);
  mouse(game, -11, 0);
  assert(Math.abs(game.t.getLook().yaw - .022) < 1e-12);
});

test('raw pointerlockerror cannot cancel a context-menu pickup before the supported fallback', async () => {
  const game=setup(),{t,sandbox}=game,calls=[];
  t.setLook({camera:[0,1,0],yaw:0,pitch:0});
  const g=t.addQubit([0,1,-.7]);
  lock(game);
  t.handleSecondary({clientX:640,clientY:360});
  const take=sandbox.document.querySelector('#command-actions').children.find(button=>button.textContent==='Tomar Q-bit');
  assert(take,'the actual context menu offers a pending pickup');
  assert.equal(sandbox.document.pointerLockElement,null);
  t.canvas.requestPointerLock=async options=>{
    calls.push(options);
    if(options?.unadjustedMovement){
      // A browser may report the event as well as reject the Promise.
      sandbox.document.dispatchEvent({type:'pointerlockerror'});
      throw Object.assign(new Error('Raw mouse input unavailable'),{name:'NotSupportedError'});
    }
    lock(game);
  };
  take.dispatchEvent({type:'click'});
  await settleCapture();
  assert.equal(calls.length,2);
  assert.equal(sandbox.document.pointerLockElement,t.canvas);
  assert.equal(t.getHeld()?.g,g,'the requested object is still picked up after fallback');
  assert.equal(t.getHeld()?.latched,true);
});

test('pausing during an asynchronous raw request prevents a late fallback from recapturing input', async () => {
  const game=setup(),calls=[];
  let rejectRequest;
  game.t.canvas.requestPointerLock=options=>{
    calls.push(options);
    return new Promise((resolve,reject)=>{rejectRequest=reject;});
  };
  await requestCapture(game);
  assert.equal(calls.length,1);
  assert.equal(typeof rejectRequest,'function');
  game.t.openPauseMenu();
  rejectRequest(Object.assign(new Error('Raw mouse input unavailable'),{name:'NotSupportedError'}));
  await settleCapture();
  assert.equal(calls.length,1,'no second request is allowed after the player paused');
  assert.equal(game.t.story.mode,'pause');
  assert.equal(game.sandbox.document.pointerLockElement,null);
});

test('legacy Pointer Lock APIs without a Promise still accept capture and input', async () => {
  const game = setup();
  let calls = 0;
  game.t.canvas.requestPointerLock = () => {calls++; lock(game);};
  await requestCapture(game);
  assert.equal(calls, 1);
  assert.equal(game.sandbox.document.pointerLockElement, game.t.canvas);
  mouse(game, 13, 0);
  assert(Math.abs(game.t.getLook().yaw + .026) < 1e-12);
});

test('legacy pointerlockerror releases the pending request so a new user click can retry', async () => {
  const game=setup(),{t,sandbox}=game;
  let calls=0;
  t.canvas.requestPointerLock=()=>{calls++;};
  await requestCapture(game);
  assert.equal(calls,1);
  // Legacy failures arrive through this event instead of a rejected Promise.
  sandbox.document.dispatchEvent({type:'pointerlockerror'});
  assert.equal(sandbox.document.querySelector('#hint').hidden,false);
  assert.equal(sandbox.document.pointerLockElement,null);
  t.canvas.requestPointerLock=()=>{calls++;lock(game);};
  await requestCapture(game);
  assert.equal(calls,2);
  assert.equal(sandbox.document.pointerLockElement,t.canvas);
  assert.equal(sandbox.document.querySelector('#hint').hidden,true);
});

test('capture timeout remains recoverable for legacy and pending Promise APIs', async () => {
  for(const promiseApi of [false,true]){
    const game=setup(),{t,sandbox}=game;
    let calls=0,rejectRequest;
    t.canvas.requestPointerLock=()=>{
      calls++;
      if(promiseApi)return new Promise((resolve,reject)=>{rejectRequest=reject;});
    };
    await requestCapture(game);
    await requestCapture(game);
    assert.equal(calls,1,'a pending request is not duplicated by clicks');
    game.advanceTimers(2600);
    assert.equal(sandbox.document.querySelector('#hint').hidden,false);
    if(rejectRequest){
      rejectRequest(Object.assign(new Error('Too late'),{name:'NotSupportedError'}));
      await settleCapture();
      assert.equal(calls,1,'an expired request cannot start a fallback');
    }
    t.canvas.requestPointerLock=()=>{calls++;lock(game);};
    await requestCapture(game);
    assert.equal(calls,2);
    assert.equal(sandbox.document.pointerLockElement,t.canvas);
  }
});

test('a successful Pointer Lock event arriving after pause or hide is released', async () => {
  for(const hide of [false,true]){
    const game=setup(),{t,sandbox}=game;
    let finishRequest;
    t.canvas.requestPointerLock=()=>new Promise(resolve=>{finishRequest=resolve;});
    await requestCapture(game);
    const before=t.getLook();
    if(hide){sandbox.document.hidden=true;sandbox.document.dispatchEvent({type:'visibilitychange'});}
    else t.openPauseMenu();
    // A cancellation token cannot stop the browser's already queued success.
    lock(game);
    finishRequest();
    await settleCapture();
    assert.equal(sandbox.document.pointerLockElement,null,hide?'hidden tab':'pause menu');
    assert.equal(t.story.mode,'pause');
    mouse(game,180,-80);
    sameLook(t.getLook(),before);
  }
});

test('an intentional level transition retains capture while its source menu is fading', async () => {
  const game=createGame({graphics:false}),{t,sandbox,api}=game;
  let prepared=false;
  const preparation=api.prepare().then(()=>{prepared=true;});
  for(let i=0;i<30&&!prepared;i++){
    game.frame();
    await Promise.resolve();await Promise.resolve();
  }
  assert(prepared,'the real menu and level buttons are initialized');
  await preparation;
  sandbox.document.body.dataset.booting='false';
  api.menu();
  sandbox.document.querySelector('#main-levels').dispatchEvent({type:'click'});
  const level=sandbox.document.querySelector('#level-list').children.find(row=>row.children[0].textContent==='02');
  assert(level);
  let finishRequest;
  t.canvas.requestPointerLock=()=>new Promise(resolve=>{finishRequest=()=>{lock(game);resolve();};});
  level.dispatchEvent({type:'click'});
  assert.equal(t.story.mode,'levels');
  assert(t.story.transition,'choosing a level starts the existing fade');
  assert.equal(typeof finishRequest,'function');
  finishRequest();
  await settleCapture();
  assert.equal(sandbox.document.pointerLockElement,t.canvas,'the deliberate transition capture is retained');
  for(let i=0;i<70&&t.story.transition;i++)t.tickStory(.05);
  assert.equal(t.story.mode,'playing');
  assert.equal(t.story.level,2);
  assert.equal(t.story.transition,null);
  assert.equal(sandbox.document.pointerLockElement,t.canvas);
});

test('a denied capture does not retry as raw fallback and remains recoverable', async () => {
  const game = setup();
  let calls = 0;
  game.t.canvas.requestPointerLock = async () => {calls++; throw Object.assign(new Error('User activation required'), {name:'NotAllowedError'});};
  const before = game.t.getLook();
  await requestCapture(game);
  assert.equal(calls, 1);
  assert.equal(game.sandbox.document.pointerLockElement, null);
  mouse(game, 900, 700);
  sameLook(game.t.getLook(), before);
  assert.equal(game.sandbox.document.querySelector('#hint').hidden, false);
  game.t.canvas.requestPointerLock = async () => {calls++; lock(game);};
  await requestCapture(game);
  assert.equal(calls, 2);
  mouse(game, 4, 0);
  assert(Math.abs(game.t.getLook().yaw + .008) < 1e-12);
});

test('invalid relative mouse samples cannot poison either camera angle', () => {
  const game = setup();
  lock(game);
  const before = game.t.getLook();
  for (const [x,y] of [[NaN,2],[2,NaN],[Infinity,0],[0,-Infinity],[undefined,5],[5,undefined],['4',1],[1,null]]) {
    mouse(game, x, y);
    sameLook(game.t.getLook(), before);
  }
  mouse(game, 7, -4);
  assert(Math.abs(game.t.getLook().yaw + .014) < 1e-12);
  assert(Math.abs(game.t.getLook().pitch + .192) < 1e-12);
});

test('suspended scenes ignore mouse deltas even before the browser releases capture', () => {
  const cases = [
    ['pause', game => {game.t.story.mode='pause';}],
    ['transition', game => {game.t.story.transition={phase:'out'};}],
    ['hidden tab', game => {game.sandbox.document.hidden=true;}],
    ['modal reading', game => {game.t.story.dialogue={modal:true};}],
    ['command menu', game => {game.sandbox.document.querySelector('#command-menu').hidden=false;}],
  ];
  for (const [name, suspend] of cases) {
    const game = setup();
    lock(game);
    const before = game.t.getLook();
    suspend(game);
    mouse(game, 90, -30);
    assert.equal(game.t.getLook().yaw, before.yaw, name);
    assert.equal(game.t.getLook().pitch, before.pitch, name);
  }
});

test('recapture does not replay unlocked movements or discard the next valid movement', async () => {
  const game = setup();
  lock(game);
  mouse(game, 12, -2);
  const before = game.t.getLook();
  game.sandbox.document.exitPointerLock();
  mouse(game, 4000, -1500);
  sameLook(game.t.getLook(), before);
  game.t.story.mode='playing';
  game.t.canvas.requestPointerLock=async()=>lock(game);
  await requestCapture(game);
  sameLook(game.t.getLook(), before);
  mouse(game, -6, 3);
  assert(Math.abs(game.t.getLook().yaw - (before.yaw+.012)) < 1e-12);
  assert(Math.abs(game.t.getLook().pitch - (before.pitch-.006)) < 1e-12);
});

test('fast valid turns preserve mouse travel across the angular wrap without smoothing', () => {
  const game=setup();
  lock(game);
  const before=Array.from(game.t.position);
  let expected=0;
  for (const x of [1200,1400,-1900,3200,-5100,23,-9]) {
    expected-=x*.002;
    mouse(game,x,0);
    const look=game.t.getLook();
    assert(Math.abs(Math.sin(look.yaw)-Math.sin(expected)) < 1e-12);
    assert(Math.abs(Math.cos(look.yaw)-Math.cos(expected)) < 1e-12);
    assert.equal(look.pitch,-.2);
    assert.deepEqual(Array.from(game.t.position),before);
  }
});
