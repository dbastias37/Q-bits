const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');

const shapes = ['cube', 'tetra', 'pyramid'];
function setup() {
  const game = createGame(), { t, sandbox } = game;
  t.clearNarrativeScene();
  Object.assign(t.story, { ready: true, mode: 'playing', scene: 'lab', phase: 'idle' });
  sandbox.document.body.dataset.booting = 'false';
  sandbox.document.pointerLockElement = t.canvas;
  t.initUnitRadial();
  return game;
}
function key(game, type, code) { game.sandbox.document.dispatchEvent({ type, code, repeat: false }); }
function hover(game, index) {
  const state = game.radial.getState(), item = state.figures[index];
  game.sandbox.document.dispatchEvent({ type: 'mousemove', movementX: item.x-state.x, movementY: item.y-state.y });
  assert.equal(game.radial.hovered, shapes[index]);
}
function countNodes(node) { return 1 + node.children.reduce((sum, child) => sum+countNodes(child), 0); }

test('real radial geometry hits every visible sector and rejects gaps, hole, outside and lower half at varied sizes', () => {
  const { sandbox } = setup(), { layout, hitTest } = sandbox.QBitsRadial;
  for (const [width, height] of [[1280, 720], [320, 568], [1920, 1080], [600, 420]]) {
    const g = layout(width, height), radius = (g.inner+g.radius)/2;
    const point = (angle, r=radius) => [g.cx+Math.cos(angle*Math.PI/180)*r, g.cy+Math.sin(angle*Math.PI/180)*r];
    for (let i=0; i<3; i++) assert.equal(hitTest(...point(210+i*60), width, height), i);
    for (const p of [[g.cx,g.cy], point(270,g.inner-1), point(270,g.radius+1), point(90),
      ...[180,240,300,360].flatMap(angle => [point(angle-1), point(angle), point(angle+1)])]) {
      assert.equal(hitTest(...p, width, height), -1);
    }
  }
});

test('hover accelerates only the chosen figure, draws its description and keeps the same DOM nodes', () => {
  const game = setup(), { sandbox } = game;
  key(game, 'keydown', 'KeyQ');
  const root = sandbox.document.querySelector('#unit-radial');
  const stage = root.children.find(child => child.className === 'radial-stage');
  const detail = stage.children.find(child => child.className === 'radial-description');
  const nodeCount = countNodes(root), start = performance.now();
  for (let i=0; i<30; i++) game.frame(start+i*50);
  const before = game.radial.getState();
  hover(game, 1);
  assert.match(detail.children[0].textContent, /Triangular/);
  assert(detail.children[1].textContent.length > 20);
  assert.equal(detail.style.opacity, '0', 'a changed description starts its entrance animation');
  for (let i=30; i<60; i++) game.frame(start+i*50);
  const after = game.radial.getState();
  assert(after.figures[1].speed > after.figures[0].speed*2);
  assert(after.figures[1].angle-before.figures[1].angle > after.figures[0].angle-before.figures[0].angle);
  assert(Math.abs(Number(detail.style.opacity)-1)<1e-12);
  assert.equal(countNodes(root), nodeCount);
  for (let i=0; i<4; i++) { game.t.closeUnitRadial(false);game.t.openUnitRadial();game.frame(start+3100+i*50); }
  assert.equal(countNodes(root), nodeCount);
});

test('resizing clears stale hover and accepts native pixel movement at the new dimensions', () => {
  const game = setup(), { t, sandbox } = game;
  key(game, 'keydown', 'KeyQ');hover(game, 0);
  sandbox.innerWidth=640;sandbox.innerHeight=480;
  sandbox.dispatchEvent({ type: 'resize' });
  const state=game.radial.getState(),mechanisms=state.figures.filter(item=>item.section==='mechanisms').length,g=sandbox.QBitsRadial.layout(640,480,state.figures.length-mechanisms,mechanisms);
  assert.equal(game.radial.hovered,null);
  assert.equal(state.x,g.cx);assert.equal(state.y,g.cy-g.inner*.25);
  hover(game,2);key(game,'keyup','KeyQ');
  assert.equal(t.settings.unitShape,'pyramid');
  assert.equal(t.groups.length,0,'a selection does not create a piece');
  key(game,'keydown','KeyN');assert.equal(t.getSelected().part.shape,'pyramid');
});

test('reopening during fade-out keeps the selector visible and final closing hides it', () => {
  const game=setup(),{t,sandbox}=game;
  key(game,'keydown','KeyQ');game.frame();
  const overlay=sandbox.document.querySelector('#unit-radial');
  assert(overlay.classList.contains('visible'));
  t.closeUnitRadial(false);game.frame(performance.now()+100);
  key(game,'keydown','KeyQ');game.frame(performance.now()+500);
  assert.equal(game.radial.isOpen,true);assert.equal(overlay.hidden,false);assert(overlay.classList.contains('visible'));
  t.closeUnitRadial(false);game.frame(performance.now()+500);assert.equal(overlay.hidden,true);
});

test('bad relative pointer samples cannot poison later selection', () => {
  const game=setup();key(game,'keydown','KeyQ');
  const before=game.radial.getState();
  game.sandbox.document.dispatchEvent({type:'mousemove',movementX:NaN,movementY:undefined});
  const after=game.radial.getState();assert.equal(after.x,before.x);assert.equal(after.y,before.y);
  hover(game,1);key(game,'keyup','KeyQ');assert.equal(game.t.settings.unitShape,'tetra');
});

test('queued navigation remains suspended while choosing and resumes after cancellation', () => {
  const game=setup(),{t}=game;let steps=0;
  const owner={},iterator=(function*(){steps++;yield;return []})();
  t.navigationJobs.set(owner,{owner,iterator,valid:()=>true,complete(){}});
  key(game,'keydown','KeyQ');t.runNavigationJobs();assert.equal(steps,0);
  t.closeUnitRadial(false);t.runNavigationJobs();assert(steps>0);
});
