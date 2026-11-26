(function (root, factory) {
  'use strict';
  const rules = factory();
  if (typeof module === 'object' && module.exports) module.exports = rules;
  else root.QBitsGalponProduction = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Only the galpón owns this material ledger. A record describes the same ID
  // as its physical payload; a chamber temporarily owns it instead of a body.
  const CONFIG = Object.freeze({
    workerCap:12, maxParts:2000, sourceCapacity:4, stockCapacity:12, extractionSeconds:.65,
    conversionSeconds:.8, formingSeconds:.55, initialEnergyJ:180000, unitCapacityJ:300,
    extractionJ:2, conversionJ:5, formingJ:4, cubeCharge:.05, workerCharge:.75,
    passivePerSecond:.085, activePerSecond:.9, activeWatts:4, activeSeconds:.5,
    manipHeat:.45, stableHeat:.12, quota:12
  });
  const EPS = 1e-8;
  const categories = ['extraction','conversion','forming','charge','cooling','transport','assembly','reconfiguration'];
  const kinds = ['raw','cube','worker','coupler','pyramid','tetra'];
  const places = ['source','carry','belt','stock','job','world','group','received'];
  const finite = Number.isFinite;
  const idOK = value => Number.isSafeInteger(value) && value > 0;
  const between = (num, min, max) => finite(num) && num >= min && num <= max;
  const close = (a,b) => Math.abs(a-b) < EPS;
  const nameOK = value => typeof value === 'string' && value.length > 0 && value.length <= 120;
  const unique = ids => Array.isArray(ids) && ids.length > 0 && ids.every(idOK) && new Set(ids).size === ids.length;
  const clone = value => JSON.parse(JSON.stringify(value));
  const check = (value, message) => { if (!value) throw new Error('Galpón · '+message); };
  const manipulable = r => !!r && r.heat <= CONFIG.manipHeat+EPS;
  const stabilized = r => !!r && r.heat <= CONFIG.stableHeat+EPS;
  const record = (s,id) => s.records.find(r => r.id === id) || null;
  const matches = (s,place) => s.records.filter(r => r.place === place);
  const busyCarrier = (s,id) => s.records.some(r => r.place === 'carry' && r.carriers.includes(id));
  const weightAt = path => path === '' ? 1 : /^[0-5]$/.test(path) ? 1/6 : /^[0-5][ab]$/.test(path) ? 1/12 : 0;
  const makeRecord = (id,source,kind,place,energy) => ({
    id, origin:id, source, path:'', weight:1, kind, place, worker:kind === 'worker',
    energy, heat:0, activeSeconds:0, carriers:[], group:null, credited:false
  });

  function create(workerIds, options = {}) {
    const workerCap = options.workerCap ?? CONFIG.workerCap;
    check(unique(workerIds) && [1,4].includes(workerIds.length), 'el inicio requiere una o cuatro identidades distintas.');
    check(Number.isSafeInteger(workerCap) && between(workerCap,workerIds.length,128), 'límite de trabajadores inválido.');
    return {
      version:1, workerCap, initialIds:[...workerIds], extracted:0, received:0, elapsed:0,
      sourceElapsed:0, energyJ:CONFIG.initialEnergyJ,
      spent:Object.fromEntries(categories.map(key => [key,0])),
      jobs:{converter:null, former:null}, records:workerIds.map(id => makeRecord(id,'initial','worker','world',1))
    };
  }

  function population(s) {
    return new Set(s.records.filter(r => r.worker).map(r => r.origin)).size;
  }
  function workerUnits(s, ids) {
    if (!unique(ids)) return 0;
    return ids.reduce((n,id) => {
      const r = record(s,id);
      return n+(r?.worker && r.kind !== 'coupler' && r.place === 'world' && manipulable(r) && !busyCarrier(s,id) ? r.weight : 0);
    },0);
  }
  function available(s, kind) {
    return s.records.filter(r => r.kind === kind && r.place === 'world' && manipulable(r) && !busyCarrier(s,r.id));
  }
  function canAddWorker(s) {
    return population(s)+(s.jobs.converter?.target === 'worker' ? 1 : 0) < s.workerCap;
  }
  function assignWorker(s,id) {
    const r = record(s,id);
    if (r?.kind !== 'cube' || r.place !== 'world' || !manipulable(r) || !canAddWorker(s)) return false;
    r.kind = 'worker'; r.worker = true;
    return true;
  }
  function syncEnergy(s,id,value) {
    const r = record(s,id);
    if (!r || !['world','group','received'].includes(r.place) || !between(value,0,1)) return false;
    r.energy = value;
    return true;
  }
  function spend(s,joules,category) {
    if (!categories.includes(category) || !finite(joules) || joules < 0 || s.energyJ < joules) return false;
    s.energyJ -= joules;
    s.spent[category] += joules;
    return true;
  }

  function canExtract(s) {
    return s.records.length < CONFIG.maxParts && s.sourceElapsed+EPS >= CONFIG.extractionSeconds && matches(s,'source').length < CONFIG.sourceCapacity &&
      s.energyJ >= CONFIG.extractionJ;
  }
  function extract(s,id) {
    if (!idOK(id) || !canExtract(s) || s.records.some(r => r.id === id || r.origin === id)) return null;
    const raw = makeRecord(id,'extraction','raw','source',0);
    spend(s,CONFIG.extractionJ,'extraction');
    s.extracted++;
    s.sourceElapsed = 0;
    s.records.push(raw);
    return raw;
  }
  function take(s,id,workerId) {
    const r = record(s,id), team = Array.isArray(workerId) ? workerId : [workerId];
    if (r?.place !== 'source' || workerUnits(s,team) < 1-EPS || !team.every(w => {
      const p = record(s,w); return p?.worker && p.kind !== 'coupler' && p.place === 'world' && manipulable(p) && !busyCarrier(s,w);
    })) return false;
    r.place = 'carry'; r.carriers = [...team];
    return true;
  }
  function ownsCargo(r,workerId) {
    const team = Array.isArray(workerId) ? workerId : [workerId];
    return unique(team) && team.length === r.carriers.length && team.every(id => r.carriers.includes(id));
  }
  function unload(s,id,workerId) {
    const r = record(s,id);
    if (r?.place !== 'carry' || !ownsCargo(r,workerId)) return false;
    r.place = 'belt'; r.carriers = [];
    return true;
  }
  function store(s,id,workerId) {
    const r = record(s,id);
    if (!r || !(r.place === 'belt' || r.place === 'carry' && ownsCargo(r,workerId)) ||
        matches(s,'stock').length >= CONFIG.stockCapacity) return false;
    r.place = 'stock'; r.carriers = [];
    return true;
  }
  function drop(s,id,workerId) {
    const r = record(s,id);
    if (r?.place !== 'carry' || !ownsCargo(r,workerId) || matches(s,'source').length >= CONFIG.sourceCapacity) return false;
    r.carriers = []; r.place = 'source';
    return true;
  }

  const duration = station => station === 'converter' ? CONFIG.conversionSeconds : CONFIG.formingSeconds;
  const outputCharge = target => target === 'worker' ? CONFIG.workerCharge : CONFIG.cubeCharge;
  function start(s,station,id,target) {
    if (!Object.hasOwn(s.jobs,station) || s.jobs[station]) return false;
    const r = record(s,id);
    if (!r) return false;
    if (station === 'converter') {
      if (r.kind !== 'raw' || r.place !== 'stock' || !['cube','worker'].includes(target) ||
          target === 'worker' && population(s) >= s.workerCap) return false;
      const chargeJ = CONFIG.unitCapacityJ*outputCharge(target);
      if (s.energyJ < CONFIG.conversionJ+chargeJ) return false;
      spend(s,CONFIG.conversionJ,'conversion');
      spend(s,chargeJ,'charge');
    } else {
      if (target !== 'coupler' || !['worker','cube'].includes(r.kind) || r.place !== 'world' ||
          !manipulable(r) || busyCarrier(s,id) || !spend(s,CONFIG.formingJ,'forming')) return false;
    }
    r.place = 'job';
    s.jobs[station] = {id,target,elapsed:0};
    return true;
  }
  function ready(s,station) {
    const job = Object.hasOwn(s.jobs,station) && s.jobs[station];
    if (!job || job.elapsed+EPS < duration(station)) return null;
    const r = record(s,job.id);
    return {...r,kind:job.target,worker:r.worker || job.target === 'worker',place:'world',
      heat:1,activeSeconds:0,energy:station === 'converter' ? outputCharge(job.target) : r.energy};
  }
  function finish(s,station) {
    const out = ready(s,station);
    if (!out) return null;
    const r = record(s,out.id);
    Object.assign(r,out);
    s.jobs[station] = null;
    return r;
  }

  function tick(s,dt,options = {}) {
    if (!finite(dt) || dt <= 0) return;
    s.elapsed += dt;
    if (options.extracting !== false && matches(s,'source').length < CONFIG.sourceCapacity) s.sourceElapsed = Math.min(CONFIG.extractionSeconds,s.sourceElapsed+dt);
    for (const station of ['converter','former']) {
      const job = s.jobs[station];
      if (job) job.elapsed = Math.min(duration(station),job.elapsed+dt);
    }
    const active = new Set(options.activeCoolingIds || []);
    for (const r of s.records) {
      if (r.kind === 'raw' || r.place !== 'world') continue;
      if (active.has(r.id) && (r.heat > 0 || r.activeSeconds < CONFIG.activeSeconds)) {
        const useful = Math.max(r.heat/CONFIG.activePerSecond, CONFIG.activeSeconds-r.activeSeconds);
        const seconds = Math.min(dt,useful,s.energyJ/CONFIG.activeWatts);
        spend(s,seconds*CONFIG.activeWatts,'cooling');
        r.activeSeconds = Math.min(CONFIG.activeSeconds,r.activeSeconds+seconds);
        r.heat = Math.max(0,r.heat-CONFIG.activePerSecond*seconds-CONFIG.passivePerSecond*(dt-seconds));
      } else {
        r.heat = Math.max(0,r.heat-CONFIG.passivePerSecond*dt);
      }
    }
  }

  function markGrouped(s,ids,key) {
    if (!unique(ids) || !nameOK(key)) return false;
    const rs = ids.map(id => record(s,id));
    if (!rs.every(r => r && r.place === 'world' && r.kind !== 'raw' && manipulable(r) && !busyCarrier(s,r.id))) return false;
    for (const r of rs) { r.place = 'group'; r.group = key; }
    return true;
  }
  function markReleased(s,ids,key) {
    if (!unique(ids) || !nameOK(key)) return false;
    const rs = ids.map(id => record(s,id));
    if (!rs.every(r => r?.group === key && ['received','group'].includes(r.place))) return false;
    for (const r of rs) { r.place = 'world'; r.group = null; }
    return true;
  }
  function moveFamily(s,ids,fromKey,toKey) {
    if (!unique(ids) || !nameOK(fromKey) || !nameOK(toKey)) return false;
    const rs = ids.map(id => record(s,id));
    if (!rs.every(r => r?.group === fromKey && ['received','group'].includes(r.place))) return false;
    for (const r of rs) r.group = toKey;
    return true;
  }
  function receive(s,ids,key) {
    if (!unique(ids) || !nameOK(key)) return false;
    const rs = ids.map(id => record(s,id));
    if (!rs.every(r => r?.kind === 'cube' && r.source === 'extraction' && r.place === 'world' &&
        manipulable(r) && r.activeSeconds+EPS >= CONFIG.activeSeconds)) return false;
    if (s.received+rs.filter(r => !r.credited).length > CONFIG.quota) return false;
    for (const r of rs) {
      r.place = 'received'; r.group = key;
      if (!r.credited) { r.credited = true; s.received++; }
    }
    return true;
  }

  // World adapter supplies actual parts returned by QBitsReconfiguration.plan.
  // The existing engine owns their moods. Only lineage/energy may cross here.
  function reconfigure(s,action,inputs,outputs) {
    if (!Array.isArray(inputs) || !Array.isArray(outputs) || !unique(inputs.map(p => p?.id)) || !unique(outputs.map(p => p?.id))) return false;
    const rs = inputs.map(p => record(s,p.id));
    if (!rs.every((r,i) => r && r.place === 'world' && r.kind !== 'raw' && r.kind !== 'coupler' &&
        !busyCarrier(s,r.id) && manipulable(r) && r.origin === rs[0].origin && r.path === inputs[i].mood?.matter?.path &&
        r.origin === inputs[i].mood.matter.root && close(r.weight,inputs[i].weight) && between(inputs[i].mood.energy,0,1))) return false;
    const r = rs[0], paths = rs.map(p => p.path), inputIds = new Set(rs.map(p => p.id));
    let wanted, kind;
    if (action === 'divide' && paths.length === 1 && paths[0] === '') {
      wanted = ['0','1','2','3','4','5']; kind = 'pyramid';
    } else if (action === 'subdivide' && paths.length === 1 && /^[0-5]$/.test(paths[0])) {
      wanted = [paths[0]+'a',paths[0]+'b']; kind = 'tetra';
    } else if (action === 'pyramid' && paths.length === 2 && /^[0-5][ab]$/.test(paths[0]) &&
        paths[1][0] === paths[0][0] && paths[0] !== paths[1]) {
      wanted = [paths[0][0]]; kind = 'pyramid';
    } else if (action === 'cube' && paths.length === 6 && paths.every(p => /^[0-5]$/.test(p))) {
      wanted = ['']; kind = 'cube';
    } else return false;
    const mass = rs.reduce((n,p) => n+p.weight,0);
    const energy = inputs.reduce((n,p) => n+p.weight*p.mood.energy,0)/mass;
    if (s.records.length-inputs.length+outputs.length > CONFIG.maxParts || outputs.length !== wanted.length || !outputs.every(p => {
      const path = p.mood?.matter?.path;
      return p.shape === kind && p.mood?.matter?.root === r.origin && wanted.includes(path) &&
        close(p.weight,weightAt(path)) && close(p.mood.energy,energy) &&
        !s.records.some(old => !inputIds.has(old.id) && (old.id === p.id || old.origin === p.id && old.origin !== r.origin));
    }) || new Set(outputs.map(p => p.mood.matter.path)).size !== outputs.length) return false;
    const heat = Math.max(...rs.map(p => p.heat)), activeSeconds = Math.min(...rs.map(p => p.activeSeconds));
    s.records = s.records.filter(p => !inputIds.has(p.id)).concat(outputs.map(p => ({
      ...r,id:p.id,path:p.mood.matter.path,kind:r.worker && kind === 'cube' ? 'worker' : kind,
      weight:p.weight,energy,heat,activeSeconds,carriers:[]
    })));
    return true;
  }

  function stats(s) {
    const byPlace = Object.fromEntries(places.map(key => [key,0]));
    for (const r of s.records) byPlace[r.place] += r.weight;
    return {population:population(s),workerCap:s.workerCap,extracted:s.extracted,received:s.received,
      mass:s.initialIds.length+s.extracted,pieces:s.records.length,energyJ:s.energyJ,byPlace};
  }

  function validate(s) {
    check(s?.version === 1 && unique(s.initialIds) && [1,4].includes(s.initialIds.length),'inicio inválido.');
    check(Number.isSafeInteger(s.workerCap) && between(s.workerCap,s.initialIds.length,128),'plazas inválidas.');
    check(Array.isArray(s.records) && s.records.length <= CONFIG.maxParts && unique(s.records.map(r => r?.id)), 'identidades ausentes o repetidas.');
    check(Number.isSafeInteger(s.extracted) && s.extracted >= 0 && Number.isSafeInteger(s.received) && between(s.received,0,CONFIG.quota), 'contadores inválidos.');
    check(finite(s.elapsed) && s.elapsed >= 0 && between(s.sourceElapsed,0,CONFIG.extractionSeconds), 'reloj inválido.');
    check(between(s.energyJ,0,CONFIG.initialEnergyJ) && s.spent && categories.every(k => finite(s.spent[k]) && s.spent[k] >= 0) &&
      Math.abs(categories.reduce((n,k) => n+s.spent[k],s.energyJ)-CONFIG.initialEnergyJ) < 1e-5,'energía sin respaldo.');
    const roots = new Map(), ids = new Map(), carriers = new Set(), initial = new Set(s.initialIds);
    for (const r of s.records) {
      check(idOK(r.origin) && kinds.includes(r.kind) && places.includes(r.place) && typeof r.worker === 'boolean' &&
        typeof r.credited === 'boolean' && between(r.energy,0,1) && between(r.heat,0,1) && between(r.activeSeconds,0,CONFIG.activeSeconds),
        'registro de materia inválido.');
      check(r.source === (initial.has(r.origin) ? 'initial' : 'extraction') && (r.source !== 'initial' || r.worker && !r.credited),
        'origen no autorizado.');
      check(typeof r.path === 'string' && weightAt(r.path) > 0 && close(r.weight,weightAt(r.path)) &&
        (r.kind === 'pyramid' ? /^[0-5]$/.test(r.path) : r.kind === 'tetra' ? /^[0-5][ab]$/.test(r.path) : r.path === ''),
        'masa o escala inválida.');
      check(r.kind !== 'cube' || !r.worker, 'cubo activo sin plaza.');
      check(r.kind !== 'worker' || r.worker, 'trabajador sin plaza.');
      check((['source','carry','belt','stock'].includes(r.place) ? r.kind === 'raw' : true) &&
        (r.kind !== 'raw' || r.source === 'extraction' && !r.worker && !r.credited && r.energy === 0 && r.heat === 0 &&
         ['source','carry','belt','stock','job'].includes(r.place)), 'ubicación de materia inválida.');
      check(Array.isArray(r.carriers) && (r.place === 'carry' ? unique(r.carriers) : r.carriers.length === 0) &&
        (['group','received'].includes(r.place) ? nameOK(r.group) : r.group === null), 'custodia inválida.');
      check(r.place !== 'received' || r.kind === 'cube' && r.credited && manipulable(r) && r.activeSeconds+EPS >= CONFIG.activeSeconds,'recepción inválida.');
      const root = roots.get(r.origin) || {mass:0,worker:r.worker,credited:r.credited,paths:new Set()};
      check(r.worker === root.worker && r.credited === root.credited && !root.paths.has(r.path),'linaje repetido o inconsistente.');
      root.mass += r.weight; root.paths.add(r.path); roots.set(r.origin,root);
      ids.set(r.id,r);
    }
    for (const [origin,root] of roots) {
      check(close(root.mass,1) && (!ids.has(origin) || ids.get(origin).origin === origin),'identidad o masa de origen alterada.');
      for (const path of root.paths) check(path.length < 2 || !root.paths.has(path[0]),'materia dividida solapada.');
    }
    for (const r of s.records) if (r.place === 'carry') {
      let units = 0;
      for (const id of r.carriers) {
        const w = ids.get(id);
        check(!carriers.has(id) && w?.worker && w.kind !== 'coupler' && w.place === 'world' && manipulable(w), 'transportista duplicado o ausente.');
        units += w.weight; carriers.add(id);
      }
      check(units >= 1-EPS,'carga sin capacidad suficiente.');
    }
    check(s.initialIds.every(id => roots.has(id)) && roots.size === s.initialIds.length+s.extracted &&
      [...roots.values()].filter(r => r.credited).length === s.received && s.spent.extraction === s.extracted*CONFIG.extractionJ, 'balance de origen o pedido inválido.');
    check(matches(s,'source').length <= CONFIG.sourceCapacity && matches(s,'stock').length <= CONFIG.stockCapacity,'almacén fuera de capacidad.');
    const inJobs = new Set();
    check(s.jobs && Object.keys(s.jobs).length === 2,'faltan cámaras.');
    for (const station of ['converter','former']) {
      const job = s.jobs[station]; if (job === null) continue;
      const input = ids.get(job?.id);
      check(input?.place === 'job' && !inJobs.has(job.id) && between(job.elapsed,0,duration(station)) &&
        (station === 'converter' ? input.kind === 'raw' && ['cube','worker'].includes(job.target) :
          ['worker','cube'].includes(input.kind) && job.target === 'coupler'), 'trabajo sin su entrada.');
      inJobs.add(job.id);
    }
    const convertedRoots = new Set(s.records.filter(r => r.source === 'extraction' && r.kind !== 'raw').map(r => r.origin));
    const converted = convertedRoots.size+(s.jobs.converter ? 1 : 0);
    const formed = s.records.filter(r => r.kind === 'coupler').length+(s.jobs.former ? 1 : 0);
    check(s.spent.conversion === converted*CONFIG.conversionJ && s.spent.forming === formed*CONFIG.formingJ &&
      s.spent.charge+EPS >= converted*CONFIG.unitCapacityJ*CONFIG.cubeCharge,'transformación sin pago.');
    check(inJobs.size === matches(s,'job').length && population(s)+(s.jobs.converter?.target === 'worker' ? 1 : 0) <= s.workerCap,
      'entrada sin cámara o exceso de población.');
    return s;
  }
  const snapshot = s => clone(validate(s));
  const restore = data => clone(validate(data));
  return Object.freeze({
    CONFIG,create,record,available,population,workerUnits,canAddWorker,assignWorker,syncEnergy,canExtract,extract,take,store,unload,drop,
    start,ready,finish,tick,spend,manipulable,stabilized,markGrouped,markReleased,moveFamily,receive,reconfigure,stats,validate,snapshot,restore
  });
});
