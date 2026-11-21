// Real Cannon integration. DOM/GPU stubs do not validate browser rendering.
const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');
const preferences = require('../assets/js/preferences.js');

function fixture({hz=60, joined=false, running=false, supports=false}={}) {
  const game = createGame({graphics:false}), {t, sandbox} = game;
  t.clearNarrativeScene();
  Object.assign(t.story, {ready:true, mode:'playing', scene:'lab', phase:'idle', progress:{}});
  sandbox.document.body.dataset.booting = 'false';
  sandbox.document.pointerLockElement = t.canvas;
  t.applyPreferences({...preferences.defaults(), physicsHz:hz, shadows:'off'});
  assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight', supports), t.V()));
  const conveyor = t.conveyors[0], base = t.rotorPart(conveyor.baseId), p = base.p.clone();
  p.y += .09;
  const battery = t.makeGroup([{id:t.allocateUnitId(), shape:'cube', weight:1, p, q:base.q.clone()}]);
  const cell = battery.parts[0];
  cell.mood.energy = 1;
  cell.mood.externalBattery = {version:1, ownerId:cell.id, packId:cell.id, enabled:true};
  assert(t.weld({source:battery, target:base.g, position:battery.body.position.clone(), quaternion:battery.body.quaternion.clone()}));
  if (joined) {
    const hit = t.rotorPart(conveyor.baseId);
    t.setSelected({g:hit.g, part:hit.part});
    assert(t.conveyorPanelAction('blueprint', {kind:'straight', height:0, quarterTurns:0, supports:false, extend:true}).ok);
    const bp = t.blueprints.at(-1);
    for (const [index, target] of t.blueprintTargets(bp).entries()) {
      const g = t.makeGroup([{id:t.allocateUnitId(), shape:target.shape, weight:1, p:target.p.clone(), q:target.q.clone()}]);
      const slot = {g, bp, index, state:'placed'};
      g.blueprintJob = slot;
      bp.slots.push(slot);
    }
    bp.active = true;
    t.updateBlueprints(0);
    assert(!t.blueprints.includes(bp));
    assert.equal(t.conveyors.length, 2);
    assert.equal(t.rotorPart(conveyor.baseId).g, t.rotorPart(t.conveyors[1].baseId).g);
  }
  for (let i=0; i<hz/2; i++) t.stepPhysics(1/hz);
  if (running) for (const section of t.conveyors) assert(t.startConveyor(section), section.status);
  return {...game, conveyor, hz};
}

function pieceAt(t, point) {
  return t.addQubit([point.x, point.y, point.z]);
}

function matter(t) {
  return t.groups.map(g=>({mass:g.body.mass, parts:g.parts.map(p=>[p.id, p.shape, p.weight])}));
}

function realTopContact(t, conveyor, body) {
  return t.world.contacts.some(contact=>{
    if (contact.bi!==body && contact.bj!==body) return false;
    const isA = contact.bi===body, other = isA?contact.bj:contact.bi;
    const shape = isA?contact.sj:contact.si, normalY = contact.ni.y*(isA?-1:1);
    return other===conveyor.surfaceBody && normalY>.8 && conveyor.surfaces.some(surface=>surface.shape===shape);
  });
}

function dropOnLane(game, height, xRatio, seconds=1.25) {
  const {t, conveyor:c, hz} = game, surface = t.conveyorSurfacePoses(c)[0];
  const point = surface.p.vadd(surface.q.vmult(t.V((2*xRatio-1)*surface.half.x, surface.half.y+.045+height, 0)));
  const cube = pieceAt(t, point), ids = t.groups.flatMap(g=>g.parts.map(p=>p.id));
  const start = t.getSimTime(), wasRunning = c.running;
  for (let i=0; i<Math.round(seconds*hz); i++) {
    t.stepPhysics(1/hz);
    const skin = t.conveyorSurfacePoses(c)[0], local = skin.inverse.vmult(cube.body.position.vsub(skin.p));
    if (Math.abs(local.x)<skin.half.x-.045 && Math.abs(local.z)<skin.half.z-.045) {
      assert(local.y>=skin.half.y-.005,
        `piece crossed through the band at step ${i+1}/${hz} Hz: local y=${local.y}`);
    }
  }
  const skin = t.conveyorSurfacePoses(c)[0], local = skin.inverse.vmult(cube.body.position.vsub(skin.p));
  assert(Math.abs(local.y-(skin.half.y+.045))<.008, 'the cube settles on the real band');
  assert(Math.abs(local.x)<skin.half.x && Math.abs(local.z)<skin.half.z, 'the cube remains inside the lane');
  assert.equal(t.getPhysicsStep(), 1/hz, 'impact handling must preserve the selected simulation rate');
  assert(Math.abs(t.getSimTime()-start-Math.round(seconds*hz)/hz)<1e-8);
  assert.deepEqual(t.groups.flatMap(g=>g.parts.map(p=>p.id)), ids);
  if (wasRunning) {
    assert(t.conveyors.every(section=>section.running));
    assert(cube.body.position.x>point.x+.015, 'contact traction continues after the impact');
  }
  return cube;
}

for (const hz of [60, 120, 240]) for (const running of [false, true]) {
  test(`a .75 m drop stays on two joined ${running?'running':'stopped'} sections at ${hz} Hz`, () => {
    // The unfixed 60 Hz path first sees this cube below the top and resolves
    // a downward-facing band contact. 120/240 Hz already support this drop.
    dropOnLane(fixture({hz, joined:true, running}), .75, .1/.54);
  });
}

for (const hz of [60, 120, 240]) {
  test(`a 1.82 m drop near the exit stays on a stopped conveyor with feet at ${hz} Hz`, () => {
    dropOnLane(fixture({hz, supports:true}), 1.82, .88, 1.5);
  });
}

for (const refreshHz of [60, 144]) {
  test(`the production ${refreshHz} Hz RAF path catches and transports a falling cube at 60 Hz physics`, () => {
    const {t, conveyor:c} = fixture({hz:60, joined:true, running:true});
    const skin = t.conveyorSurfacePoses(c)[0];
    const point = skin.p.vadd(skin.q.vmult(t.V(-.17, skin.half.y+.045+.75, 0)));
    const cube = pieceAt(t, point), beforeMatter = matter(t), start = t.getSimTime();
    const supply = () => t.externalBatterySummary(t.rotorPart(c.baseId).g);
    const energy = supply().storedJ;
    const internal = t.conveyorRotors(c).flatMap(r=>[r.aId,r.bId]).map(id=>[id,t.rotorPart(id).part.mood.energy]);
    t.setRunning(true);
    t.resetSimulationClock(0, true);
    let actualContact = false;
    for (let frame=1; frame<=refreshHz*1.5; frame++) {
      t.frame(frame*1000/refreshHz);
      const surface = t.conveyorSurfacePoses(c)[0], local = surface.inverse.vmult(cube.body.position.vsub(surface.p));
      assert(local.y>=surface.half.y-.005, 'RAF must not allow the cube to cross through the lane');
      assert(Math.abs(local.x)<surface.half.x && Math.abs(local.z)<surface.half.z, 'the transported cube stays within the lane');
      actualContact ||= realTopContact(t, c, cube.body);
    }
    assert(actualContact, 'ordinary Cannon narrowphase eventually records a real top-face contact');
    assert(cube.body.position.x>point.x+.08, 'real contact is followed by powered transport');
    const surface = t.conveyorSurfacePoses(c)[0], local = surface.inverse.vmult(cube.body.position.vsub(surface.p));
    assert(Math.abs(local.y-(surface.half.y+.045))<.008);
    assert.equal(t.getPhysicsStep(), 1/60);
    assert(Math.abs(t.getSimTime()-start-1.5)<1e-8);
    assert.deepEqual(matter(t), beforeMatter);
    assert(Number.isFinite(supply().storedJ) && supply().storedJ>=0 && supply().storedJ<energy);
    assert.deepEqual(t.conveyorRotors(c).flatMap(r=>[r.aId,r.bId]).map(id=>[id,t.rotorPart(id).part.mood.energy]), internal,
      'external traction cannot spend or create internal motor charge');
    assert(t.conveyors.every(section=>section.running));
  });
}

test('a load three cubes wide lands on its finite supporting face and keeps its mass', () => {
  const {t, conveyor:c, hz} = fixture({hz:60, joined:true, running:true});
  const surface = t.conveyorSurfacePoses(c)[0], startX = surface.p.x-.17;
  const load = t.makeGroup([-1,0,1].map(z=>({
    id:t.allocateUnitId(), shape:'cube', weight:1,
    p:t.V(startX, surface.p.y+surface.half.y+.045+.75, surface.p.z+z*.09), q:t.Q()
  })));
  const before = matter(t);
  assert.equal(load.body.mass, .75);
  let actualContact = false;
  for (let step=0; step<hz*1.5; step++) {
    t.stepPhysics(1/hz);
    const skin = t.conveyorSurfacePoses(c)[0], local = skin.inverse.vmult(load.body.position.vsub(skin.p));
    assert(local.y>=skin.half.y-.005, 'the broad face cannot pass through the band between steps');
    actualContact ||= realTopContact(t, c, load.body);
  }
  assert(actualContact);
  assert(load.body.position.x>startX+.06);
  const skin = t.conveyorSurfacePoses(c)[0], local = skin.inverse.vmult(load.body.position.vsub(skin.p));
  assert(Math.abs(local.y-(skin.half.y+.045))<.008);
  assert.deepEqual(matter(t), before);
  assert.equal(load.parts.length, 3);
  assert(c.running);
});

test('falling outside the lane reaches the floor without horizontal attraction', () => {
  const {t, conveyor:c, hz} = fixture(), surface = t.conveyorSurfacePoses(c)[0];
  const point = surface.p.vadd(t.V(0, .797, .5)), cube = pieceAt(t, point);
  for (let i=0; i<hz; i++) t.stepPhysics(1/hz);
  assert(Math.abs(cube.body.position.y-.045)<.003);
  assert(Math.hypot(cube.body.position.x-point.x, cube.body.position.z-point.z)<.001);
});

test('an upward approach from below cannot be placed on the top face', () => {
  const {t, conveyor:c, hz} = fixture(), surface = t.conveyorSurfacePoses(c)[0];
  const cube = pieceAt(t, surface.p.vadd(t.V(.25, -.1, 0)));
  cube.body.velocity.set(0, 6, 0);
  for (let i=0; i<8; i++) {
    t.stepPhysics(1/hz);
    const skin = t.conveyorSurfacePoses(c)[0], local = skin.inverse.vmult(cube.body.position.vsub(skin.p));
    assert(local.y<skin.half.y+.015, 'the underside contact must not lift the cube through the band');
  }
  assert(cube.body.velocity.y<0, 'Cannon retains the underside collision');
});

test('a lateral approach below the lip cannot jump onto the band', () => {
  const {t, conveyor:c, hz} = fixture(), surface = t.conveyorSurfacePoses(c)[0];
  const point = surface.p.vadd(t.V(.42, -.1, 0)), cube = pieceAt(t, point);
  cube.body.velocity.set(-6, 0, 0);
  for (let i=0; i<3; i++) {
    t.stepPhysics(1/hz);
    assert(cube.body.position.y<=point.y+.002);
  }
  assert(cube.body.position.x<point.x-.15, 'ordinary lateral movement still occurs');
});

test('a vertical conveyor face creates no horizontal supporting plane beside it', () => {
  const {t, conveyor:c, hz} = fixture(), body = t.rotorPart(c.baseId).g.body, turn = t.Q();
  turn.setFromAxisAngle(t.V(0, 0, 1), Math.PI/2);
  body.quaternion.copy(turn);
  body.position.y += 1;
  // A fixed obstacle fixture isolates orientation from an entire machine
  // toppling over; its original Cannon collision shapes remain unchanged.
  body.type = 2;
  body.mass = 0;
  body.velocity.set(0, 0, 0);
  body.angularVelocity.set(0, 0, 0);
  body.updateMassProperties();
  body.aabbNeedsUpdate = true;
  const surface = t.conveyorSurfacePoses(c)[0], point = surface.p.vadd(surface.up.scale(.12));
  point.y += .75;
  const cube = pieceAt(t, point);
  for (let i=0; i<hz*1.5; i++) t.stepPhysics(1/hz);
  assert(Math.abs(cube.body.position.y-.045)<.003);
  assert(Math.hypot(cube.body.position.x-point.x, cube.body.position.z-point.z)<.001);
});
