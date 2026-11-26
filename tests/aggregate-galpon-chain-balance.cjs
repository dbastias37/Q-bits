#!/usr/bin/env node
'use strict';

// Read-only accounting. This imports the validators, never the game harness,
// Cannon, a browser or a simulation driver. A manifest declares the provenance;
// compatible snapshots and hashes do not by themselves prove how they were made.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const G = require('../assets/js/galpon-production.js');
const S = require('../assets/js/save-games.js');
const EPS = 1e-5;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const sum = values => values.reduce((n, value) => n + value, 0);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const sorted = values => [...values].sort((a, b) => a - b);
const relativeFile = (base, file) => path.resolve(base, file);

function externalCells(snapshot) {
  const parts = new Map();
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.mood?.externalBattery && Number.isSafeInteger(value.id)) {
      requireValue(!parts.has(value.id), 'Batería física repetida: ' + value.id);
      // Galpón capacity is 60 * batterySceneScale(15), not a new energy grant.
      parts.set(value.id, {id:value.id, capacityJ:900, storedJ:900 * value.mood.energy});
    }
    for (const child of Object.values(value)) visit(child);
  }
  visit(snapshot);
  const cells = [...parts.values()].sort((a, b) => a.id - b.id);
  return {cells, storedJ:sum(cells.map(cell => cell.storedJ)), scope:'Baterías externas físicas del snapshot; no es toda la carga del inventario.'};
}

function readCheckpoint(entry, base) {
  requireValue(entry && typeof entry.id === 'string' && typeof entry.path === 'string', 'Checkpoint sin id o ruta.');
  const file = relativeFile(base, entry.path), bytes = fs.readFileSync(file), raw = JSON.parse(bytes);
  const save = Array.isArray(raw.entries) ? JSON.parse(new Map(raw.entries).get(S.KEYS.galpon)) : raw;
  requireValue(save?.format === S.FORMAT && save.version === S.VERSION && save.mode === 'galpon', entry.id + ': formato de guardado desconocido.');
  requireValue(Number.isFinite(save.createdAt) && save.savedAt >= save.createdAt, entry.id + ': fechas inválidas.');
  const checked = S.validate('galpon', save.data);
  requireValue(checked.ok, entry.id + ': ' + checked.error);
  const s = save.data.production;
  G.validate(s);
  const fileHash = hash(bytes);
  requireValue(!entry.sha256 || entry.sha256 === fileHash, entry.id + ': el archivo no coincide con su SHA-256.');
  const roots = new Map(), ids = new Map(), places = {};
  for (const record of s.records) {
    roots.set(record.origin, (roots.get(record.origin) || 0) + record.weight);
    ids.set(record.id, record.origin);
    const place = places[record.place] ||= {records:0, units:0};
    place.records++;place.units += record.weight;
  }
  const products = new Map((s.chain?.products || []).map(product => [product.id, product]));
  const receivedIds = s.chain?.order?.receivedIds || [];
  const report = {
    id:entry.id, path:entry.path, label:entry.label || entry.id,
    sha256:fileHash, dataSha256:hash(JSON.stringify(save.data)), validated:true,
    createdAt:save.createdAt, seconds:s.elapsed, sourceJ:s.energyJ,
    sourceSpentSinceOpeningJ:G.CONFIG.initialEnergyJ - s.energyJ,
    spent:{...s.spent}, accountResidualJ:G.CONFIG.initialEnergyJ - s.energyJ - sum(Object.values(s.spent)),
    initialIds:[...s.initialIds], extracted:s.extracted, firstLineReceived:s.received,
    material:{records:s.records.length, origins:roots.size, units:sum([...roots.values()]),
      originSha256:hash(JSON.stringify(sorted(roots.keys()))), places},
    order:s.chain?.order ? {epoch:s.chain.order.epoch, startedAt:s.chain.order.startedAt,
      received:receivedIds.length, receivedIds:[...receivedIds], completed:s.chain.completed,
      sustained:s.chain.order.sustained, continuity:{...s.chain.order.continuity}} : null,
    externalBatteries:externalCells(save.data.snapshot),
    pendingJobs:Object.fromEntries(Object.entries({...s.jobs, ...s.chain?.jobs}).filter(([, job]) => job).map(([station, job]) =>
      [station, {inputIds:job.inputIds || [job.id], elapsed:job.elapsed, paidJ:job.paidJ ?? null, state:job.state || 'processing'}]))
  };
  return {entry, save, s, roots, ids, products, receivedIds, report};
}

function checkSuccessor(a, b) {
  const prefix = a.entry.id + ' → ' + b.entry.id + ': ';
  requireValue(a.save.createdAt === b.save.createdAt && same(a.s.initialIds, b.s.initialIds), prefix + 'cambió el linaje de apertura.');
  requireValue(b.s.elapsed + EPS >= a.s.elapsed && b.s.extracted >= a.s.extracted, prefix + 'retroceso de reloj o extracción.');
  requireValue(b.s.energyJ <= a.s.energyJ + EPS, prefix + 'la fuente ganó energía.');
  for (const [origin, mass] of a.roots) requireValue(b.roots.has(origin) && Math.abs(b.roots.get(origin) - mass) < EPS, prefix + 'se perdió o cambió el origen ' + origin);
  requireValue(b.roots.size - a.roots.size === b.s.extracted - a.s.extracted, prefix + 'materia nueva sin extracción.');
  for (const [id, origin] of a.ids) if (b.ids.has(id)) requireValue(b.ids.get(id) === origin, prefix + 'el ID ' + id + ' cambió de origen.');
  // Commit moves 8 J from assembly to forming. A materialization rollback
  // reverses that classification, never the debit. Compare their combined sum.
  for (const category of Object.keys(a.s.spent).filter(key => !['forming', 'assembly'].includes(key)))
    requireValue(b.s.spent[category] + EPS >= a.s.spent[category], prefix + 'retroceso de gasto en ' + category);
  requireValue(b.s.spent.forming + b.s.spent.assembly + EPS >= a.s.spent.forming + a.s.spent.assembly, prefix + 'retroceso de trabajo de conformado y montaje.');
  requireValue(a.receivedIds.every((id, i) => b.receivedIds[i] === id), prefix + 'recibos perdidos, reordenados o duplicados.');
  if (a.s.chain?.order) requireValue(b.s.chain?.order?.epoch === a.s.chain.order.epoch && b.s.chain.order.startedAt === a.s.chain.order.startedAt, prefix + 'cambió el pedido.');
  for (const id of a.receivedIds) requireValue(same(a.products.get(id), b.products.get(id)), prefix + 'cambió un producto ya recibido: ' + id);
}

function receiptObservations(segment, a, b, base) {
  const byCount = new Map(), logs = [];
  for (const input of segment.logs || []) {
    const entry = typeof input === 'string' ? {path:input} : input;
    const bytes = fs.readFileSync(relativeFile(base, entry.path)), digest = hash(bytes);
    requireValue(!entry.sha256 || entry.sha256 === digest, segment.id + ': cambió el log ' + entry.path);
    let parsed = 0, ignored = 0;
    for (const [index, line] of bytes.toString('utf8').split(/\r?\n/).entries()) {
      let event;
      try { event = JSON.parse(line); } catch { if (line.trim()) ignored++;continue; }
      parsed++;
      const match = /^rotor recibido (\d+)$/.exec(event.event || '');
      if (!match) continue;
      const count = Number(match[1]), id = b.receivedIds[count - 1], product = b.products.get(id);
      requireValue(Number.isFinite(event.seconds) && Number.isFinite(event.energyJ), segment.id + ': lectura no numérica.');
      requireValue(product && count > a.receivedIds.length && count <= b.receivedIds.length && event.chain?.total === count, segment.id + ': el log acredita un recibo ajeno al intervalo.');
      const lag = event.seconds - product.receivedAt;
      requireValue(lag >= -.011 && lag <= 1.02, segment.id + ': el recibo del log no corresponde al tiempo físico guardado.');
      requireValue(event.seconds + .011 >= a.s.elapsed && event.seconds <= b.s.elapsed + .011 && event.energyJ <= a.s.energyJ + .011 && event.energyJ + .011 >= b.s.energyJ, segment.id + ': lectura fuera de sus checkpoints.');
      const observation = {count, productId:id, receivedAt:product.receivedAt, observedAt:event.seconds,
        sourceJ:event.energyJ, log:entry.path, line:index + 1};
      const prior = byCount.get(count);
      requireValue(!prior || prior.observedAt === observation.observedAt && prior.sourceJ === observation.sourceJ, segment.id + ': recibos incompatibles entre logs; no mezcles ramas.');
      if (!prior) byCount.set(count, observation);
    }
    logs.push({path:entry.path, sha256:digest, parsedLines:parsed, ignoredNonJsonLines:ignored});
  }
  const receipts = [...byCount.values()].sort((x, y) => x.count - y.count), intervals = [];
  for (let i = 1; i < receipts.length; i++) {
    const from = receipts[i - 1], to = receipts[i];
    if (to.count !== from.count + 1) continue;
    requireValue(to.observedAt > from.observedAt && to.sourceJ <= from.sourceJ + .011, segment.id + ': lecturas no monotónicas.');
    intervals.push({from:from.count, to:to.count, observedSeconds:to.observedAt - from.observedAt,
      physicalReceiptSeconds:to.receivedAt - from.receivedAt, sourceJ:from.sourceJ - to.sourceJ});
  }
  const mean = key => intervals.length ? sum(intervals.map(i => i[key])) / intervals.length : null;
  const missingReceiptCounts = Array.from({length:b.receivedIds.length - a.receivedIds.length}, (_, i) => a.receivedIds.length + i + 1).filter(count => !byCount.has(count));
  return {logs, receipts, intervals, missingReceiptCounts, comparison:{intervals:intervals.length,
    meanSourceJPerRotor:mean('sourceJ'), meanObservedSecondsPerRotor:mean('observedSeconds'),
    meanPhysicalReceiptSecondsPerRotor:mean('physicalReceiptSeconds'),
    scope:'Débito de toda la fuente entre sondeos de recibos consecutivos del mismo intento; 0,01 J y hasta 1 s de sondeo. No es consumo aislado de drones.'}};
}

function aggregate(manifest, base = process.cwd()) {
  requireValue(manifest?.version === 1 && ['native', 'fixture'].includes(manifest.scope), 'Declara version:1 y scope native o fixture.');
  requireValue(Array.isArray(manifest.checkpoints) && manifest.checkpoints.length > 0, 'Faltan checkpoints.');
  const checkpoints = manifest.checkpoints.map(entry => readCheckpoint(entry, base));
  const byId = new Map(checkpoints.map(checkpoint => [checkpoint.entry.id, checkpoint]));
  requireValue(byId.size === checkpoints.length, 'IDs de checkpoint repetidos.');
  if (manifest.createdAt !== undefined) requireValue(checkpoints[0].save.createdAt === manifest.createdAt, 'La apertura no coincide con createdAt.');
  // Detect identity reuse even if an ID disappears in an intermediate snapshot.
  const history = new Map();
  for (let i = 0; i < checkpoints.length; i++) {
    const c = checkpoints[i];
    if (i) checkSuccessor(checkpoints[i - 1], c);
    for (const [id, origin] of c.ids) {
      requireValue(!history.has(id) || history.get(id) === origin, c.entry.id + ': un ID histórico cambió de origen.');
      history.set(id, origin);
    }
  }
  requireValue((manifest.segments || []).length === checkpoints.length - 1, 'Declara un segmento por cada par consecutivo; no ocultes las recuperaciones.');
  const segments = manifest.segments.map((segment, i) => {
    const a = checkpoints[i], b = checkpoints[i + 1];
    requireValue(segment.from === a.entry.id && segment.to === b.entry.id && ['setup', 'run', 'recovery'].includes(segment.kind), 'Segmento desordenado o sin clase: ' + segment.id);
    const sourceSpentJ = a.s.energyJ - b.s.energyJ;
    const spent = Object.fromEntries(Object.keys(b.s.spent).map(key => [key, b.s.spent[key] - a.s.spent[key]]));
    requireValue(Math.abs(sum(Object.values(spent)) - sourceSpentJ) < EPS, segment.id + ': las categorías no cierran con la fuente.');
    const aCells = a.report.externalBatteries, bCells = b.report.externalBatteries;
    const sameBatteryIds = same(aCells.cells.map(cell => cell.id), bCells.cells.map(cell => cell.id));
    return {id:segment.id, kind:segment.kind, outcome:segment.outcome || 'recorded', note:segment.note || '', from:segment.from, to:segment.to,
      simulationSeconds:b.s.elapsed - a.s.elapsed, sourceSpentJ, spent,
      sourceJPerNewReceipt:b.receivedIds.length > a.receivedIds.length ? sourceSpentJ / (b.receivedIds.length - a.receivedIds.length) : null,
      newReceipts:b.receivedIds.slice(a.receivedIds.length), extractedUnits:b.s.extracted - a.s.extracted,
      externalBatteryDecreaseJ:sameBatteryIds ? aCells.storedJ - bCells.storedJ : null,
      batteryNote:sameBatteryIds ? 'Mismos IDs de baterías externas. Su cambio de carga se muestra aparte y no se suma de nuevo al débito de fuente.' : 'Cambió el conjunto de baterías: sin comparación de consumo embarcado.',
      ...receiptObservations(segment, a, b, base)};
  });
  const first = checkpoints[0], last = checkpoints.at(-1);
  const targets = manifest.targets || [20, 40, 60, 80];
  const milestones = targets.map(target => {
    const observed = checkpoints.find(c => c.receivedIds.length >= target);
    const exactCount = checkpoints.find(c => c.receivedIds.length === target);
    return {target, status:observed ? 'observed' : 'pending', confirmedBy:observed?.entry.id || null,
      productId:last.receivedIds[target - 1] || null,
      receivedAt:last.products.get(last.receivedIds[target - 1])?.receivedAt ?? null,
      sourceJAtCheckpointWithCount:exactCount?.s.energyJ ?? null};
  });
  return {version:1, scope:manifest.scope, note:manifest.note || '',
    validators:Object.fromEntries(['galpon-production.js','galpon-chain.js','save-games.js'].map(file => [file, hash(fs.readFileSync(path.join(__dirname, '../assets/js', file)))])),
    lineage:{createdAt:first.save.createdAt, initialIds:[...first.s.initialIds],
    initialSourceJ:G.CONFIG.initialEnergyJ, initialPersonalGrantJ:first.s.initialIds.length * G.CONFIG.unitCapacityJ,
    sourceSpentBeforeFirstCheckpointJ:G.CONFIG.initialEnergyJ - first.s.energyJ,
    sourceSpentBetweenCheckpointsJ:first.s.energyJ - last.s.energyJ,
    finalSourceJ:last.s.energyJ, finalReceived:last.receivedIds.length,
    completeInSavedState:!!last.s.chain?.completed, historicalIdsObserved:history.size},
    checkpoints:checkpoints.map(c => c.report), segments, milestones,
    limitations:[
      'Los hashes fijan archivos y los validadores comprueban coherencia; createdAt y contabilidad no prueban por sí solos acciones físicas ni excluyen una rama clonada.',
      'Native o fixture es procedencia declarada en el manifiesto; se debe acompañar de los scripts y registros de la ejecución.',
      'El débito de fuente incluye recarga. No sumes de nuevo la carga transferida ni la capacidad nominal de baterías como consumo.',
      'No se calcula energía total disipada: las baterías externas no abarcan toda la carga almacenada en trabajadores, productos y componentes.',
      'Los intervalos dentro de un intento y los costes de recuperación se informan por separado. No se proyectan ochenta recepciones a partir de un tramo corto.',
      'No se ejecutan pasos físicos, no se acredita una interfaz visual y no se modifican los guardados.'
    ]};
}

function markdown(report) {
  const number = value => value === null ? '—' : Number(value).toFixed(2);
  const lines = ['# Balance de la cadena del galpón', '',
    `Procedencia declarada: **${report.scope}**. Linaje: \`${report.lineage.createdAt}\`. Recibos observados: **${report.lineage.finalReceived}**.`, '',
    '| Checkpoint | Tiempo (s) | Fuente (J) | Recibos | Orígenes / materia (u) |', '| --- | ---: | ---: | ---: | ---: |'];
  for (const c of report.checkpoints) lines.push(`| ${c.id} | ${number(c.seconds)} | ${number(c.sourceJ)} | ${c.order?.received || 0} | ${c.material.origins} / ${number(c.material.units)} |`);
  lines.push('', '| Segmento | Clase | Nuevos recibos | Tiempo (s) | Fuente gastada (J) |', '| --- | --- | ---: | ---: | ---: |');
  for (const s of report.segments) lines.push(`| ${s.id} | ${s.kind} · ${s.outcome} | ${s.newReceipts.length} | ${number(s.simulationSeconds)} | ${number(s.sourceSpentJ)} |`);
  lines.push('', '## Intervalos comparables dentro de cada intento', '', '| Intento | Intervalos | s/rotor (sondeo) | J de fuente/rotor |', '| --- | ---: | ---: | ---: |');
  for (const s of report.segments.filter(s => s.comparison.intervals)) lines.push(`| ${s.id} | ${s.comparison.intervals} | ${number(s.comparison.meanObservedSecondsPerRotor)} | ${number(s.comparison.meanSourceJPerRotor)} |`);
  lines.push('', '## Hitos', '', ...report.milestones.map(m => `- ${m.target}: ${m.status === 'observed' ? 'observado en ' + m.confirmedBy : 'pendiente'}.`), '', '## Alcance', '', ...report.limitations.map(text => '- ' + text), '');
  return lines.join('\n');
}

if (require.main === module) {
  try {
    const [manifestPath, outputPrefix] = process.argv.slice(2);
    requireValue(manifestPath, 'Uso: node tests/aggregate-galpon-chain-balance.cjs manifiesto.json [prefijo-salida]');
    const absolute = path.resolve(manifestPath);
    const report = aggregate(JSON.parse(fs.readFileSync(absolute, 'utf8')), path.dirname(absolute));
    if (outputPrefix) {
      fs.mkdirSync(path.dirname(path.resolve(outputPrefix)), {recursive:true});
      fs.writeFileSync(outputPrefix + '.json', JSON.stringify(report, null, 2) + '\n');
      fs.writeFileSync(outputPrefix + '.md', markdown(report));
      console.log(JSON.stringify({json:outputPrefix + '.json', markdown:outputPrefix + '.md', received:report.lineage.finalReceived, sourceJ:report.lineage.finalSourceJ}));
    } else process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } catch (error) { console.error(error.message);process.exitCode = 1; }
}

module.exports = {aggregate, markdown};
