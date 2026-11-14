const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');

function lab() {
  const game = createGame(), {t,sandbox} = game;
  for (const g of [...t.groups]) t.removeGroup(g);
  t.story.ready=true;t.story.scene='lab';t.story.mode='playing';
  sandbox.document.querySelector('#panel').hidden=true;
  return game;
}

test('the lab creates each selected unit at its own floor height; campaign creation remains cubic', () => {
  const {t,sandbox}=lab();
  for(const shape of ['cube','tetra','pyramid']) {
    t.settings.unitShape=shape;
    const g=t.spawnQubit();assert(g);
    assert.equal(g.parts[0].shape,shape);
    assert.match(g.parts[0].mood.name,shape==='cube'?/^Q-bit /:/^T-bit /);
    assert(Math.abs(t.bounds(g).min.y-.002)<1e-9);
  }
  t.updateAlphaHUD();assert.equal(sandbox.document.querySelector('#alpha-census-text').textContent,'× 1 Q · 2 T');
  t.story.scene='campaign';
  assert.equal(t.creationShape(),'cube');
});

test('taking, releasing and duplicating a T-bit preserves its type and gives the copy its own identity', () => {
  const {t,sandbox}=lab();
  for(const shape of ['tetra','pyramid']) {
    const g=t.addQubit([2,t.unitGroundHeight(shape)+.002,0],1,shape);
    const hit={g,part:g.parts[0],point:g.body.position.clone(),distance:1};
    sandbox.document.pointerLockElement=t.canvas;
    t.grabQubit(hit);assert.equal(t.getHeld().g,g);
    t.releaseQubit();assert.equal(t.getHeld(),null);assert.equal(g.parts[0].shape,shape);
    t.setSelected(hit);
    const copies=t.duplicateSelection();assert.equal(copies.length,1);
    const copy=copies[0];assert.equal(copy.parts[0].shape,shape);
    assert.notEqual(copy.parts[0].id,g.parts[0].id);
    assert.notEqual(copy.parts[0].mood,g.parts[0].mood);
    assert.match(copy.parts[0].mood.name,/^T-bit /);
    for(const item of [...t.groups])t.removeGroup(item);
  }
});

test('leaving the lab and returning preserves T-bit identities, custom names, energy, poses and selection of spawn type', () => {
  const {t}=lab();
  t.settings.unitShape='pyramid';
  for(const [i,shape] of ['tetra','pyramid'].entries()) {
    const g=t.addQubit([i*.3,t.unitGroundHeight(shape)+.002,0],1+i,shape);
    g.parts[0].mood.name='Compañero '+i;g.parts[0].mood.energy=.31+i*.1;
    g.body.quaternion.setFromEuler(.1*i,.3,.2*i);
  }
  const snapshot=()=>JSON.parse(JSON.stringify(t.saveLab().groups,(_,value)=>typeof value==='number'?+value.toFixed(12):value));
  const before=snapshot();
  t.beginIntro();t.enterLab(false);
  const after=snapshot();
  assert.deepEqual(after,before);
  assert.equal(t.settings.unitShape,'pyramid');
});

test('both T-bit shapes use the same cooling and energy recovery as Q-bits', () => {
  const {t}=lab(),cooler=t.createCooler(t.V(0,0,0));assert(cooler);cooler.coolSeconds=.1;
  for(const [i,shape] of ['tetra','pyramid'].entries()) {
    const g=t.addQubit([-.08+i*.16,t.unitGroundHeight(shape)+.02,0],1,shape);
    Object.assign(g.parts[0].mood,{energy:.01,state:'restless',reason:'agotado',restLeft:20});
  }
  t.updateCooling(.2);
  assert.equal(cooler.occupants,2);
  for(const g of t.groups){assert.equal(g.cooler,cooler);assert.equal(g.parts[0].mood.state,'neutral');assert(g.parts[0].mood.energy>.4);}
});
