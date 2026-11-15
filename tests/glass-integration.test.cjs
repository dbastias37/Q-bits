const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');

function setup(success=true) {
  const calls=[];
  const game=createGame({glass:{create:()=>({render(...args){calls.push(args);return success;},release(){calls.push('release');}})}});
  game.t.clearNarrativeScene();
  Object.assign(game.t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});
  game.sandbox.document.body.dataset.booting='false';
  game.sandbox.document.pointerLockElement=game.t.canvas;
  game.t.initUnitRadial();
  return {...game,calls};
}

test('glass uses the live rounded selector contours and states without changing simulation',()=>{
  const game=setup(),{t,calls,sandbox}=game;
  assert(t.openUnitRadial());
  const start=performance.now()+1000;
  const before=t.getSimTime();
  t.renderScene(start);
  const panels=calls.at(-1)[4];
  assert.equal(panels.length,5);
  assert(panels.every(p=>p.opacity===1&&p.points.length>20&&p.thickness>0));
  assert(sandbox.document.querySelector('#unit-radial').classList.contains('glass-native'));
  const item=t.getUnitRadial().getState().figures[1];
  t.getUnitRadial().moveTo(item.x,item.y);
  t.menuFocus.amount=1;
  t.frame(start+50);
  assert(calls.at(-1)[4][1].hovered);
  assert.equal(t.getSimTime(),before);
  const count=calls.length;
  t.frame(start+100);
  assert.equal(calls.length,count,'a static selection does not recapture the entire room every frame');
});

test('closing removes the glass capture after its fade and changing mode suppresses it',()=>{
  const game=setup(),{t,calls,sandbox}=game;
  t.openUnitRadial();t.renderScene(performance.now()+1000);
  t.closeUnitRadial(false);
  game.frame(performance.now()+2000);
  t.renderScene(performance.now()+2100);
  assert(calls.includes('release'));
  assert(!sandbox.document.querySelector('#unit-radial').classList.contains('glass-native'));
  t.openUnitRadial();t.renderScene(performance.now()+2200);
  t.story.mode='pause';
  t.renderScene(performance.now()+2300);
  assert.equal(calls.at(-1),'release');
});

test('a GPU material failure keeps the CSS selector usable',()=>{
  const game=setup(false),{t,sandbox}=game;
  t.openUnitRadial();t.renderScene(performance.now()+1000);
  assert(!sandbox.document.querySelector('#unit-radial').classList.contains('glass-native'));
  const item=t.getUnitRadial().getState().figures[2];
  t.getUnitRadial().moveTo(item.x,item.y);
  assert(t.closeUnitRadial(true));
  assert.equal(t.settings.unitShape,'pyramid');
});

test('transparent settings freeze the room once while the preview reuses the game canvas',()=>{
  const {t,sandbox}=setup();
  const backdrop=sandbox.document.querySelector('#settings-room-backdrop');
  let captures=0,previewFrames=0;
  backdrop.getContext=()=>({fillRect(){},drawImage(){captures++;}});
  sandbox.document.querySelector('#settings-preview-canvas').getContext=()=>({drawImage(){previewFrames++;}});
  t.initSettingsScreen();const settings=t.getSettingsScreen();
  settings.open('pause');
  assert.equal(captures,1);assert.equal(backdrop.hidden,false);
  assert(backdrop.width*backdrop.height<=1201000);
  const size=[backdrop.width,backdrop.height];
  for(let i=0;i<3;i++)t.renderSettingsPreview(1000+i*40);
  assert.equal(captures,1,'preview never paints into the frozen backdrop');
  assert.equal(previewFrames,3);assert.deepEqual([backdrop.width,backdrop.height],size);
  settings.requestClose();
  assert.equal(backdrop.hidden,true);assert.equal(backdrop.width*backdrop.height,1);
});
