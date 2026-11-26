// Exercise a fresh mission through menu/tablet actions. Navigation and Cannon run
// at their normal clocks. DOM and GL are instrumented by the repository harness.
// node tests/benchmark-galpon.cjs --workers=4 --hz=60 --seconds=1800 --output=/tmp/galpon.json
const fs = require('node:fs');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');
const args = Object.fromEntries(process.argv.slice(2).map(s => s.replace(/^--/, '').split('=')));
const workers = Number(args.workers || 4);
const hz = Number(args.hz || 60);
const limit = Number(args.seconds || 1800);
assert([1, 4].includes(workers) && [60, 120, 240].includes(hz) && limit > 0);
const rounded = x => Math.round(x * 100) / 100;
const quantile = (values, q) => values.slice().sort((a, b) => a - b)[Math.floor((values.length - 1) * q)];
async function run() {
  const game = createGame();
  const { t, sandbox, api } = game;
  const el = id => sandbox.document.querySelector('#' + id);
  let ready = false;
  const prepared = api.prepare().then(() => { ready = true; });
  for (let i = 0; i < 30 && !ready; i++) {
    game.frame(i * 17);
    await Promise.resolve();
    await Promise.resolve();
  }
  assert(ready);
  await prepared;
  api.menu();
  t.applyPreferences({ physicsHz: hz });
  el('main-galpon').click();
  el('galpon-workers').value = String(workers);
  el('galpon-limit').value = '12';
  el('galpon-start').click();
  assert.equal(t.story.scene, 'galpon');
  t.onPhysicalKeyDown({code:'KeyP', key:'p', preventDefault(){}, target:t.canvas});
  t.onPhysicalKeyUp({code:'KeyP', key:'p', preventDefault(){}, target:t.canvas});
  assert.equal(el('page-galpon').hidden, false);
  el('galpon-work').click();
  assert.equal(t.hangarWorldStatus().assigned, workers);
  assert.equal(t.getPhysicsStep(), 1 / hz);
  const result = {
    node: process.version, workers, physicsHz: hz,
    frameHz: 60, sampleSeconds: 1, milestones: [], samples: [], costs: [],
    description: 'Tiempo simulado desde la entrada. Acciones por menú y tableta, DOM/GPU instrumentados. Mediana y p95 de CPU real para navegación y física por fotograma simulado.'
  };
  const start = t.getTickState().simTime;
  let built = 0, received = 0, first = false, firstRaw = false;
  let frames = [], costSegment = 0, maxBodies = 0, peakGroups = 0, observation;
  const mark = (event, seconds) => {
    result.milestones.push({event, seconds});
    console.error(event, seconds);
  };
  const cost = () => {
    if (!frames.length) return;
    t.cullingLab.stats = true;
    t.renderScene();
    t.cullingLab.stats = false;
    result.costs.push({
      built:costSegment, frames:frames.length, maxBodies, peakGroups,
      frameCpuMsMedian:rounded(quantile(frames,.5)), frameCpuMsP95:rounded(quantile(frames,.95)),
      drawCalls:t.renderCounts.calls, triangles:t.renderCounts.triangles, lines:t.renderCounts.lines
    });
    frames = [];
    maxBodies = 0;
    peakGroups = 0;
  };
  for (let frame=0; frame<limit*60; frame++) {
    const before=process.cpuUsage();
    // The normal frame also gives asynchronous route searches their scheduler slot.
    if (t.navigationJobs.size) t.runNavigationJobs();
    for (let sub=0;sub<hz/60;sub++) t.stepSimulation(1/hz);
    const delta=process.cpuUsage(before);
    frames.push((delta.user+delta.system)/1000);
    maxBodies=Math.max(maxBodies,t.world.bodies.length);
    peakGroups=Math.max(peakGroups,t.groups.length);
    if ((frame+1)%60) continue;
    const seconds=rounded(t.getTickState().simTime-start);
    const shop=t.hangarWorldStatus(), line=t.hangarLineStatus(), model=t.story.galpon;
    if (!firstRaw && model.extracted) {firstRaw=true;mark('primera extracción',seconds);}
    if (!first && model.records.some(r=>r.kind==='cube'&&r.source==='extraction')) {first=true;mark('primer cubo producido',seconds);}
    if (built<8 && !el('galpon-build').disabled) {
      el('galpon-build').click();
      const next=t.hangarLineStatus().built;
      if (next>built) {
        cost();costSegment=next;built=next;mark('tramo '+next,seconds);
        el('galpon-run').click();
      }
    }
    if (line.received>received) {received=line.received;mark('recepción '+received,seconds);}
    observation={seconds,extracted:model.extracted,workers:shop.workers,carrying:shop.carrying,
      stock:shop.raw,cubes:shop.cubes,couplers:shop.couplers,built,received,
      running:line.running,energyJ:rounded(model.energyJ),status:shop.message,lineStatus:line.status};
    if (seconds%30===0) {result.samples.push(observation);console.error(JSON.stringify(observation));}
    if(received===12) break;
  }
  cost();
  result.final=observation;
  result.complete=built===8&&received===12;
  const json=JSON.stringify(result,null,2)+'\n';
  if (args.output) fs.writeFileSync(args.output,json); else process.stdout.write(json);
  if (!result.complete) process.exitCode=1;
}
run().catch(e => {console.error(e);process.exitCode=1;});
