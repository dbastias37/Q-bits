const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');

async function menu() {
  const slots = new Map();
  const storage = {getItem:key => slots.get(key) ?? null,setItem:(key,value) => slots.set(key,value)};
  const game = createGame({graphics:false,storage});
  let ready = false;
  const loading = game.api.prepare().then(() => { ready = true; });
  for (let frame = 0; frame < 30 && !ready; frame++) {
    game.frame(frame * 17);
    await Promise.resolve();
  }
  await loading;
  game.sandbox.document.body.dataset.booting = 'false';
  game.api.menu();
  return {t:game.t, el:id => game.sandbox.document.querySelector('#' + id)};
}

test('el acceso a la prueba conserva el prólogo y permite elegir equipo y plazas', async () => {
  const {t,el} = await menu();
  el('main-galpon').click();
  assert.equal(t.story.scene,'intro');
  assert.equal(el('galpon-screen').hidden,false);
  assert.equal(el('galpon-continue').disabled,true);
  el('galpon-workers').value='4';
  el('galpon-limit').value='2';
  el('galpon-start').click();
  assert.equal(t.story.scene,'intro');
  assert.match(el('galpon-menu-status').textContent,/plazas/);
  el('galpon-workers').value='1';
  el('galpon-start').click();
  assert.equal(t.story.scene,'galpon');
  assert.equal(t.story.galpon.workerCap,2);
  assert.equal(t.groups.length,1);
  assert.equal(t.hasHangarSave(),true);
});

test('volver y continuar conserva un mismo lote inicial y la consola avanza con P abierto', async () => {
  const {t,el} = await menu();
  el('main-galpon').click();
  el('galpon-workers').value='4';el('galpon-limit').value='12';
  el('galpon-start').click();
  const ids=[...t.story.galpon.initialIds];
  t.openPauseMenu();
  el('pause-main').click();
  el('main-galpon').click();
  el('galpon-start').click();
  assert.equal(el('galpon-cancel').hidden,false);
  el('galpon-cancel').click();el('galpon-continue').click();
  assert.deepEqual([...t.story.galpon.initialIds],ids);
  t.onPhysicalKeyDown({code:'KeyP',key:'p',preventDefault(){},target:t.canvas});
  t.onPhysicalKeyUp({code:'KeyP',key:'p',preventDefault(){},target:t.canvas});
  assert.equal(el('page-galpon').hidden,false);
  assert.equal(el('galpon-build').disabled,true);
  el('galpon-work').click();
  assert.equal(t.hangarWorldStatus().assigned,4);
  const before=t.story.galpon.elapsed;
  t.advanceSimulation(.05);t.advanceSimulation(.05);
  assert(t.story.galpon.elapsed>before);
  t.openPauseMenu();
  const paused=t.story.galpon.elapsed;t.advanceSimulation(.2);
  assert.equal(t.story.galpon.elapsed,paused);
});

test('la captura del galpón descarta el salto absoluto del menú y conserva el giro siguiente',async () => {
  const game=createGame({graphics:false}),{t,sandbox}=game,doc=sandbox.document;
  t.beginHangarGame();t.story.ready=true;
  doc.dispatchEvent({type:'mousemove',clientX:292,clientY:375,movementX:5,movementY:5});
  doc.pointerLockElement=t.canvas;doc.dispatchEvent({type:'pointerlockchange'});
  const before=t.getLook();
  const move=(dx,dy)=>doc.dispatchEvent({type:'mousemove',clientX:292,clientY:375,movementX:dx,movementY:dy});
  move(-292,-375);assert.deepEqual(t.getLook(),before);
  move(12,6);assert(t.getLook().yaw<before.yaw&&t.getLook().pitch<before.pitch);
});
