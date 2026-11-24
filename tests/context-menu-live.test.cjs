// Exercise the production mouse handlers, RAF scheduler and Cannon simulation.
// DOM/Pointer Lock/GPU calls are instrumented; these are not browser playtests.
const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');
const preferences = require('../assets/js/preferences.js');

function lab() {
  const game = createGame({graphics:false});
  const {t, sandbox} = game, doc = sandbox.document;
  t.clearNarrativeScene();
  Object.assign(t.story, {ready:true, scene:'lab', mode:'playing', phase:'idle'});
  doc.body.dataset.booting = 'false';
  t.applyPreferences({...preferences.defaults(), physicsHz:60, shadows:'off'});
  t.canvas.requestPointerLock = () => {
    doc.pointerLockElement = t.canvas;
    doc.dispatchEvent({type:'pointerlockchange'});
  };
  t.canvas.requestPointerLock();
  t.setRunning(true);
  t.resetSimulationClock(0, true);
  let frame = 0;
  return {...game, doc, el:id=>doc.querySelector('#'+id), advance(seconds) {
    for (let i=0; i<Math.round(seconds*60); i++) t.frame(++frame*1000/60);
  }};
}

function aim(game, partId) {
  const {t} = game, p = t.rotorPart(partId).p;
  t.setLook({camera:[p.x,p.y,p.z+2], yaw:0, pitch:0});
}

function secondary(game, partId, extra={}) {
  game.t.canvas.requestPointerLock();
  aim(game, partId);
  game.t.onCanvasMouseDown({button:2, clientX:640, clientY:360, preventDefault(){}, ...extra});
}

function command(game, label) {
  const button = game.el('command-actions').children.find(item=>item.textContent===label);
  assert(button, 'the live context menu offers '+label);
  assert(!button.disabled, label+' is actionable');
  button.click();
}

function drone(game, patch={}) {
  const {t} = game;
  const g = t.spawnSavedMechanism(t.propellerBlueprintTemplate(true), t.V());
  assert(g);
  const cell = g.parts.find(t.isExternalBattery);
  cell.mood.energy = 1;
  cell.mood.externalBattery.enabled = true;
  const flight = t.flightForGroup(g);
  t.configureFlight(flight, {height:.35, speed:0, ...patch});
  assert(t.startFlight(flight), flight.status);
  return {g, cell, flight};
}

test('a secondary-click drone menu keeps RAF physics, lift, battery consumption and unrelated bodies running', () => {
  const game = lab(), {t, doc} = game, {g, flight} = drone(game);
  const falling = t.addQubit([2,1.5,0]);
  secondary(game, flight.id);
  assert.equal(game.el('command-menu').hidden, false);
  assert.equal(doc.pointerLockElement, null, 'the pointer is free for choosing a command');
  assert.equal(t.story.mode, 'playing');
  const before = t.getTickState(), energy = t.externalBatterySummary(g).storedJ;
  const look = t.getLook(), position = Array.from(t.position);
  doc.dispatchEvent({type:'mousemove', movementX:100, movementY:70});
  doc.dispatchEvent({type:'keydown', code:'KeyW', repeat:false});
  game.advance(2);
  doc.dispatchEvent({type:'keyup', code:'KeyW'});
  assert.equal(t.getTickState().physics-before.physics, 120);
  assert.equal(t.getTickState().logic-before.logic, 30);
  assert(t.bounds(g).min.y>.25, 'the powered drone actually rises while its menu is visible');
  assert(t.externalBatterySummary(g).storedJ<energy, 'hovering continues to spend real energy');
  assert(falling.body.position.y<.1, 'unselected bodies continue to fall');
  assert.equal(game.el('command-menu').hidden, false);
  assert.equal(t.getLook().yaw, look.yaw);
  assert.equal(t.getLook().pitch, look.pitch);
  assert.deepEqual(Array.from(t.position), position, 'menu input does not walk the player');
  assert(flight.enabled, flight.status);
});

test('Aterrizar from an airborne drone menu executes after the world has continued moving', () => {
  const game = lab(), {t} = game, {g, flight} = drone(game);
  game.advance(3);
  assert(t.bounds(g).min.y>.25);
  secondary(game, flight.id);
  const energy = t.externalBatterySummary(g).storedJ;
  game.advance(.5);
  assert(t.externalBatterySummary(g).storedJ<energy);
  command(game, 'Aterrizar');
  assert.equal(game.el('command-menu').hidden, true);
  assert.equal(game.doc.pointerLockElement, t.canvas);
  game.advance(5);
  assert.equal(flight.enabled, false, flight.status);
  assert(t.bounds(g).min.y<.02, 'the actual chassis reaches the floor');
});

test('an Aterrizar button cannot take off again after the drone finishes its route while the menu stays open', () => {
  const game = lab(), {t} = game;
  const {g, flight} = drone(game, {speed:.25, route:{loop:false, points:[{x:.2,z:0,height:.35,action:'land',wait:0}]}});
  game.advance(.5);
  secondary(game, flight.id);
  assert(game.el('command-actions').children.some(button=>button.textContent==='Aterrizar'));
  game.advance(15);
  assert.equal(flight.enabled, false, flight.status);
  assert(t.bounds(g).min.y<.02, 'the finite route has physically landed');
  assert.equal(game.el('command-menu').hidden, false);
  command(game, 'Aterrizar');
  assert.equal(flight.enabled, false, 'the original landing intent is not reinterpreted as takeoff');
  game.advance(.5);
  assert(t.bounds(g).min.y<.02);
});

test('opening Separar on a drone and cancelling leaves its powered flight intact', () => {
  const game = lab(), {t} = game, {g, flight} = drone(game);
  game.advance(2);
  secondary(game, flight.id);
  command(game, 'Separar pieza…');
  assert.equal(game.el('detach-menu').hidden, false);
  assert(flight.enabled, 'opening the choice list is not a stop command');
  const energy = t.externalBatterySummary(g).storedJ;
  game.advance(1);
  assert(t.bounds(g).min.y>.25);
  assert(t.externalBatterySummary(g).storedJ<energy);
  game.el('detach-cancel').click();
  assert.equal(game.el('detach-menu').hidden, true);
  assert(flight.enabled);
});

test('rotor submenus keep spending energy and their reverse/stop commands affect the live motor', () => {
  const game = lab(), {t} = game;
  const rotor = t.spawnRotor(t.V(0,.2,0), {mount:'fixed', rpm:30, maxTorque:.4, capacity:32});
  assert(rotor);
  assert(t.configureRotor(rotor, {enabled:true, direction:1}));
  secondary(game, rotor.aId);
  command(game, 'Rotación…');
  const energy = () => t.rotorPart(rotor.aId).part.mood.energy+t.rotorPart(rotor.bId).part.mood.energy;
  const before = energy();
  game.advance(.5);
  assert(energy()<before, 'the rotation submenu does not freeze motor consumption');
  command(game, 'Sentido antihorario');
  assert.equal(rotor.enabled, true);
  assert.equal(rotor.direction, -1);
  game.advance(.5);
  assert(Math.abs(rotor.actualRpm)>1, 'the physical hinge is rotating');
  secondary(game, rotor.aId);
  command(game, 'Rotación…');
  command(game, 'Detener rotación');
  assert.equal(rotor.enabled, false);
  const ticks = t.getTickState().physics;
  game.advance(.25);
  assert.equal(t.getTickState().physics-ticks, 15, 'stopping one motor does not pause the world');
});

test('opening and cancelling the detach list preserves a routed assembly and its progress', () => {
  const game = lab(), {t} = game;
  const g = t.makeGroup([0,.09].map(x=>({id:t.allocateUnitId(), shape:'cube', weight:1, p:t.V(x,.045,0), q:t.Q()})));
  assert(t.startRoute(g, t.V(2.7,0,0)));
  game.navigationUntilIdle();
  assert(g.route);
  secondary(game, g.parts[0].id, {altKey:true});
  assert.equal(game.el('detach-menu').hidden, false);
  assert(g.route, 'inspecting detach options must not cancel the route');
  const x = g.body.position.x;
  game.advance(1.5);
  assert(g.body.position.x>x+.09, 'the assembly rolls while its detach list remains open');
  assert.equal(game.el('detach-menu').hidden, false);
  game.el('detach-cancel').click();
  assert.equal(game.el('detach-menu').hidden, true);
  assert(g.route, 'cancelling the list preserves the original order');
  const resumed = g.body.position.x;
  game.advance(1);
  assert(g.body.position.x>resumed+.05);
});

test('Escape closes an operational menu first, and the next Escape still pauses actual physics', () => {
  const game = lab(), {t, doc} = game;
  const g = t.addQubit([0,1.5,0]);
  secondary(game, g.parts[0].id);
  const escape = () => doc.dispatchEvent({type:'keydown', code:'Escape', repeat:false});
  escape();
  assert.equal(game.el('command-menu').hidden, true);
  assert.equal(t.story.mode, 'playing');
  const y = g.body.position.y;
  game.advance(.2);
  assert(g.body.position.y<y);
  escape();
  assert.equal(t.story.mode, 'pause');
  const paused = {ticks:t.getTickState().physics, y:g.body.position.y};
  game.advance(.5);
  assert.equal(t.getTickState().physics, paused.ticks);
  assert.equal(g.body.position.y, paused.y);
  escape();
  assert.equal(t.story.mode, 'playing');
  game.advance(.5);
  assert(g.body.position.y<paused.y, 'resuming still advances the falling piece');
});

for (const reason of ['window blur','hidden tab']) {
  test(reason+' still freezes a drone when a live context menu is open', () => {
    const game = lab(), {t, doc, sandbox} = game, {g, flight} = drone(game);
    game.advance(1);
    secondary(game, flight.id);
    if (reason==='window blur') sandbox.dispatchEvent({type:'blur'});
    else {doc.hidden=true;doc.dispatchEvent({type:'visibilitychange'});}
    assert.equal(t.story.mode, 'pause');
    const state = () => JSON.stringify({ticks:t.getTickState(), p:g.body.position, q:g.body.quaternion, energy:t.externalBatterySummary(g).storedJ});
    const before = state();
    game.advance(1);
    assert.equal(state(), before, 'actual pause retains the exact physics and energy state');
  });
}
