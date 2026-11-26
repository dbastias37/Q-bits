(function (root, factory) {
  'use strict';
  const model = factory(root, typeof module === 'object' && module.exports ? require : null);
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.QBitsSavedGames = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, load) {
  'use strict';

  const VERSION = 1;
  const FORMAT = 'qbits-save';
  const KEYS = Object.freeze({lab:'qbits.save.lab.v1', campaign:'qbits.save.campaign.v1', galpon:'qbits.save.galpon.v1'});
  const SHAPES = new Set(['cube', 'pyramid', 'tetra', 'coupler']);
  const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const modeValid = mode => typeof mode === 'string' && own(KEYS, mode);
  const finite = Number.isFinite;
  const positiveId = value => Number.isSafeInteger(value) && value > 0;
  const vector = value => record(value) && ['x', 'y', 'z'].every(key => own(value, key) && finite(value[key]));
  const quaternion = value => vector(value) && own(value, 'w') && finite(value.w) &&
    finite(Math.hypot(value.x, value.y, value.z, value.w)) && Math.hypot(value.x, value.y, value.z, value.w) > 1e-8;
  const arrayVector = (value, length) => Array.isArray(value) && value.length === length && value.every(finite);
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const message = (error, fallback) => error && typeof error.message === 'string' ? error.message : fallback;

  // Older checkpoints need no scene modules. Resolve the optional adapters only
  // when the save actually contains a first-cycle or passage snapshot.
  const supplyModel = () => load ? load('./campaign-supply.js') : root.QBitsCampaignSupply;
  const passageModel = () => load ? load('./factory-passage.js') : root.QBitsFactoryPassage;

  // Inspect before JSON.stringify: JSON would otherwise turn NaN into null,
  // omit functions, or invoke accessors and custom toJSON methods. Optional
  // object properties set to undefined follow JSON's ordinary omission rule;
  // array entries must remain complete so their indexes cannot change meaning.
  // Cannon vectors are accepted by their finite own coordinates, without an
  // engine dependency. Every stored/read value becomes an ordinary JSON object.
  function checkJson(value, ancestors = new Set(), depth = 0) {
    check(depth <= 128, 'El guardado está anidado en exceso.');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number') {
      check(finite(value), 'El guardado contiene un número no finito.');
      return;
    }
    check(typeof value === 'object', 'El guardado contiene un valor que no admite JSON.');
    check(!ancestors.has(value), 'El guardado contiene una referencia circular.');
    const keys = Reflect.ownKeys(value), array = Array.isArray(value), proto = Object.getPrototypeOf(value);
    const plain = proto === null || Object.getPrototypeOf(proto) === null;
    const coordinates = !array && (keys.length === 3 || keys.length === 4) &&
      keys.every(key => ['x', 'y', 'z', 'w'].includes(key)) && ['x', 'y', 'z'].every(key => own(value, key));
    check(array || plain || coordinates, 'El guardado contiene un objeto que no admite JSON.');
    for (let parent = value; parent !== null; parent = Object.getPrototypeOf(parent)) {
      check(!Object.getOwnPropertyDescriptor(parent, 'toJSON'), 'El guardado no admite conversiones toJSON.');
    }
    if (array) check(keys.length === value.length + 1, 'El guardado contiene una lista incompleta o con propiedades adicionales.');
    ancestors.add(value);
    try {
      for (const key of keys) {
        if (array && key === 'length') continue;
        check(typeof key === 'string' && !UNSAFE_KEYS.has(key), 'El guardado contiene una clave no permitida.');
        if (array) check(/^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length, 'El guardado contiene una propiedad de lista no permitida.');
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        check(descriptor && own(descriptor, 'value') && descriptor.enumerable, 'El guardado no admite propiedades calculadas u ocultas.');
        const entry = descriptor.value;
        if (!array && entry === undefined) continue;
        if (!array && !plain) check(finite(entry), 'El guardado contiene una coordenada no finita.');
        // Validate primitive leaves here; only nested objects need another
        // traversal frame. Descriptor, depth and finite-number checks remain.
        if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') {
          check(depth < 128, 'El guardado está anidado en exceso.');
        } else if (typeof entry === 'number') {
          check(depth < 128, 'El guardado está anidado en exceso.');
          check(finite(entry), 'El guardado contiene un número no finito.');
        } else checkJson(entry, ancestors, depth + 1);
      }
    } finally { ancestors.delete(value); }
  }

  // JSON.parse without a reviver produces dense arrays and ordinary own data
  // properties. It cannot produce cycles, accessors, symbols or Cannon objects.
  // Keep the checks JSON does not guarantee, including overflow (1e999), depth
  // and forbidden keys. Live input still goes through the full checkJson above.
  function checkParsedJson(value, depth = 0) {
    check(depth <= 128, 'El guardado está anidado en exceso.');
    const keys = Object.keys(value);
    // Leaves also count toward the depth limit, without a recursive call and
    // repeated type dispatch for every number, string and boolean in a save.
    check(depth < 128 || keys.length === 0, 'El guardado está anidado en exceso.');
    let arrays = Array.isArray(value);
    for (const key of keys) {
      if (UNSAFE_KEYS.has(key)) throw new Error('El guardado contiene una clave no permitida.');
      if (key === 'toJSON') throw new Error('El guardado no admite conversiones toJSON.');
      const entry = value[key];
      if (typeof entry === 'number' && !finite(entry)) throw new Error('El guardado contiene un número no finito.');
      if (entry !== null && typeof entry === 'object') arrays = checkParsedJson(entry, depth + 1) || arrays;
    }
    return arrays;
  }

  function checkParsedPrototypes(arrays) {
    // Check again even on a cache hit: adding/removing a prototype JSON hook
    // must not turn an old validation result into permission to overwrite it.
    for (let parent = Object.prototype; parent !== null; parent = Object.getPrototypeOf(parent)) {
      check(!Object.getOwnPropertyDescriptor(parent, 'toJSON'), 'El guardado no admite conversiones toJSON.');
    }
    if (arrays) for (let parent = Array.prototype; parent !== null; parent = Object.getPrototypeOf(parent)) {
      check(!Object.getOwnPropertyDescriptor(parent, 'toJSON'), 'El guardado no admite conversiones toJSON.');
    }
  }

  function checkWorldPart(part, unitIds) {
    check(record(part) && positiveId(part.id) && !unitIds.has(part.id), 'Hay un identificador de pieza inválido o repetido.');
    unitIds.add(part.id);
    check(SHAPES.has(part.shape) && finite(part.weight) && part.weight > 0, 'La forma o masa de una pieza no es válida.');
    check(vector(part.p) && quaternion(part.q), 'La posición u orientación de una pieza no es válida.');
    if (own(part, 'mood')) {
      check(record(part.mood), 'El estado de una pieza no es válido.');
      if (own(part.mood, 'energy')) check(finite(part.mood.energy) && part.mood.energy >= 0 && part.mood.energy <= 1, 'La energía de una pieza no es válida.');
    }
  }

  function checkLab(data) {
    check(record(data) && record(data.snapshot) && record(data.alphaSettings), 'Faltan los datos del banco de pruebas.');
    const snapshot = data.snapshot;
    check(Array.isArray(snapshot.groups) && Array.isArray(snapshot.cargos), 'Faltan las piezas o los cuerpos del banco.');
    check(record(snapshot.settings) && record(snapshot.moodSettings), 'Falta la configuración del banco.');
    check(arrayVector(snapshot.position, 3) && finite(snapshot.yaw) && finite(snapshot.pitch), 'La posición del jugador no es válida.');
    const unitIds = new Set(), cargoIds = new Set();
    for (const group of snapshot.groups) {
      check(record(group) && Array.isArray(group.parts) && group.parts.length > 0, 'Hay un grupo de piezas inválido.');
      check(quaternion(group.q) && vector(group.v) && vector(group.w), 'La postura o velocidad de un grupo no es válida.');
      for (const part of group.parts) checkWorldPart(part, unitIds);
    }
    // Cargo and part IDs belong to separate namespaces. Neither is assumed to
    // be contiguous or related to a counter from the previous browser session.
    for (const cargo of snapshot.cargos) {
      check(record(cargo) && positiveId(cargo.id) && !cargoIds.has(cargo.id), 'Hay un identificador de cuerpo inválido o repetido.');
      cargoIds.add(cargo.id);
      check(vector(cargo.p) && finite(cargo.side) && cargo.side > 0 && finite(cargo.required) && cargo.required > 0 && typeof cargo.color === 'string', 'Los datos de un cuerpo no son válidos.');
      if (own(cargo, 'robotPhysical')) check(typeof cargo.robotPhysical === 'boolean', 'El estado físico de un cuerpo no es válido.');
      if (cargo.robotPhysical) check(quaternion(cargo.q) && vector(cargo.v) && vector(cargo.w), 'La postura física de un cuerpo no es válida.');
    }
    for (const key of ['rotors', 'rotorSets', 'robotArms', 'conveyors', 'shelves', 'disassembly']) {
      if (own(snapshot, key)) check(Array.isArray(snapshot[key]), 'La colección '+key+' no es válida.');
    }
    for (const key of ['contacts', 'powerNetwork', 'alphaScene']) {
      if (own(snapshot, key)) check(record(snapshot[key]), 'Los datos de '+key+' no son válidos.');
    }
    for (const key of ['workshop', 'mechanismDefaults']) {
      if (own(snapshot, key)) check(snapshot[key] === null || record(snapshot[key]), 'Los datos de '+key+' no son válidos.');
    }
  }

  function checkOpeningPart(part, ids) {
    checkWorldPart(part, ids);
    // These are new full snapshots, not the historical checkpoint format. An
    // omitted mood would be regenerated on load and grant charge or erase rest.
    check(record(part.mood) && finite(part.mood.energy) && part.mood.energy >= 0 && part.mood.energy <= 1 &&
      finite(part.mood.restLeft) && part.mood.restLeft >= 0, 'Faltan la carga o el cansancio de una pieza del inicio.');
  }

  function emptyOpeningList(object, key) {
    check(!own(object, key) || Array.isArray(object[key]) && object[key].length === 0,
      'El primer ciclo contiene un inventario o mecanismo que no admite: '+key+'.');
  }

  function checkOpeningRoom(snapshot) {
    // This first slice has two actors and no secondary inventories. Existing
    // joining remains available; group roots still identify runtime motion.
    // Rejecting unsupported containers is safer than accepting hidden material
    // that its scene adapter would silently omit when it restores the room.
    for (const key of ['cargos', 'families', 'disassembly', 'rotors', 'rotorSets', 'robotArms', 'conveyors', 'shelves']) emptyOpeningList(snapshot, key);
    check(snapshot.workshop === undefined || snapshot.workshop === null, 'El primer ciclo no admite un taller guardado.');
    for (const [key, lists] of Object.entries({powerNetwork:['reservoirs', 'cables'], contacts:['sensors', 'rotors'], alphaScene:['coolers', 'blueprints'], trajectories:['routes']})) {
      if (!own(snapshot, key)) continue;
      check(record(snapshot[key]), 'El estado de '+key+' del inicio no es válido.');
      for (const list of lists) emptyOpeningList(snapshot[key], list);
    }
    const live = new Map();
    for (const group of snapshot.groups) {
      live.set(group.parts[0].id, group);
    }
    if (own(snapshot, 'runtime')) {
      const runtime = snapshot.runtime;
      check(record(runtime) && runtime.version === 1 && finite(runtime.time) && runtime.time >= 0 && runtime.blocked === null,
        'El estado de simulación del primer ciclo no es válido.');
      for (const key of ['trajectoryReceivers', 'conveyors', 'servos', 'marches', 'arms', 'flights', 'coolers']) emptyOpeningList(runtime, key);
      for (const [key, fields] of [['motion', ['v', 'w']], ['routes', ['goal']]]) {
        if (!own(runtime, key)) continue;
        check(Array.isArray(runtime[key]), 'El movimiento guardado del inicio no es válido.');
        const seen = new Set();
        for (const entry of runtime[key]) {
          check(record(entry) && live.has(entry.id) && !seen.has(entry.id) && fields.every(field => arrayVector(entry[field], 3)),
            'El movimiento guardado no corresponde a una pieza única del inicio.');
          seen.add(entry.id);
        }
      }
    }
  }

  function checkOpeningInventory(value, liveParts = [], guideId = null, closed = false) {
    check(record(value) && value.version === 1 && Array.isArray(value.reserveParts), 'Faltan los datos de la reserva inicial.');
    const supply = supplyModel();
    check(supply && typeof supply.validate === 'function', 'No está disponible el validador de la reserva inicial.');
    const validation = supply.validate(value.ledger);
    check(validation.ok, validation.error || 'El inventario inicial no es válido.');
    const ledger = value.ledger;
    check(ledger.records.length === 1 && ledger.offerSeconds === null && ledger.records.every(entry => entry.destination === 'reserve' && !entry.offered) && ledger.requests.every(request => !request.offered),
      'El primer ciclo necesita un compañero finito sin retorno automático.');
    check(guideId === null || positiveId(guideId) && !ledger.records.some(entry => entry.id === guideId), 'El guía no pertenece a la reserva del ejercicio.');
    const ids = new Set(), reserve = new Map(), live = new Map();
    for (const part of value.reserveParts) { checkOpeningPart(part, ids); reserve.set(part.id, part); }
    for (const part of liveParts) { checkOpeningPart(part, ids); live.set(part.id, part); }
    check(ids.size === ledger.records.length + (guideId === null ? 0 : 1) && (guideId === null || live.has(guideId)),
      'Falta una pieza del inicio o hay materia ajena a su manifiesto.');
    for (const entry of ledger.records) {
      const stored = ['reserve', 'queued'].includes(entry.location), part = (stored ? reserve : live).get(entry.id);
      check(part && Math.abs(part.weight - entry.weight) <= 1e-8, 'La ubicación o materia de una pieza no coincide con la reserva inicial.');
    }
    if (closed) {
      check(ledger.queue.length === 0 && ledger.transfer === null && ledger.records.every(entry => entry.location === 'reserve'),
        'El cierre todavía tiene piezas fuera de su destino.');
      const id = ledger.records[0].id;
      check(['requested', 'taken', 'placed', 'voluntaryReturns'].every(key => ledger.facts[key].includes(id)),
        'El cierre no conserva las acciones físicas de la práctica.');
    }
    return ids;
  }

  function checkFirstCycle(value, checkpoint) {
    check(checkpoint.scene === 'campaign' && checkpoint.level === 1 && !checkpoint.completed,
      'El primer ciclo no coincide con el punto de continuación.');
    check(record(value) && ['request', 'take', 'return', 'closing'].includes(value.phase) && positiveId(value.guideId),
      'La fase del primer ciclo no es válida.');
    for (const key of ['stable', 'transferTime', 'time']) check(finite(value[key]) && value[key] >= 0, 'El reloj del primer ciclo no es válido.');
    check(value.stable <= 1e6, 'La estabilidad guardada excede el límite del primer ciclo.');
    check(value.dialogueStep === null || typeof value.dialogueStep === 'string', 'La lectura guardada del primer ciclo no es válida.');
    check(typeof value.requiresPlacement === 'boolean', 'Falta la comprobación de colocación tras recuperar la práctica.');
    checkLab(value);
    checkOpeningRoom(value.snapshot);
    checkOpeningInventory(value, value.snapshot.groups.flatMap(group => group.parts), value.guideId, value.phase === 'closing');
  }

  function checkPassage(value, checkpoint, reserveIds) {
    check(checkpoint.scene === 'campaign' && checkpoint.level === 1 && checkpoint.completed,
      'El pasaje no coincide con el cierre del primer ciclo.');
    check(record(value) && value.version === 1 && arrayVector(value.player, 3) && finite(value.yaw) && finite(value.pitch) && typeof value.invitationPending === 'boolean',
      'La posición o invitación del pasaje no es válida.');
    const passage = passageModel();
    check(passage && typeof passage.restore === 'function' && passage.restore(value.state), 'El recorrido guardado del pasaje no es válido.');
    const safe = passage.constrainMove(value.player, value.player);
    check(safe.every((coordinate, index) => Math.abs(coordinate - value.player[index]) <= 1e-6),
      'La posición guardada queda fuera del suelo transitable del pasaje.');
    const guide = value.guide;
    check(record(guide) && Array.isArray(guide.parts) && guide.parts.length === 1 && quaternion(guide.q) && vector(guide.v) && vector(guide.w),
      'Falta el estado físico del guía en el pasaje.');
    checkOpeningPart(guide.parts[0], new Set(reserveIds));
    check(value.state.guideId === guide.parts[0].id, 'La identidad del guía no coincide con el recorrido.');
  }

  function checkCampaign(data) {
    check(record(data) && record(data.checkpoint) && record(data.progress), 'Faltan el punto de continuación o el progreso de campaña.');
    const checkpoint = data.checkpoint;
    check(['intro', 'campaign'].includes(checkpoint.scene) && Number.isInteger(checkpoint.level) &&
      (checkpoint.scene === 'intro' ? checkpoint.level === 0 : checkpoint.level >= 1 && checkpoint.level <= 20) &&
      typeof checkpoint.completed === 'boolean', 'El punto de continuación de campaña no es válido.');
    for (const key of Object.keys(data.progress)) {
      if (key === 'torqueTier') check(Number.isInteger(data.progress[key]) && data.progress[key] >= 1 && data.progress[key] <= 3, 'El nivel de torque guardado no es válido.');
      else if (key === 'intro' || /^level\d+$/.test(key) || key.startsWith('lore.')) check(typeof data.progress[key] === 'boolean', 'El progreso de campaña no es válido.');
    }
    const firstCycle = data.firstCycle !== undefined, reserve = data.openingReserve !== undefined, passage = data.passage !== undefined;
    check(!firstCycle || !reserve && !passage, 'El guardado duplica el primer ciclo con su cierre o pasaje.');
    if (firstCycle) checkFirstCycle(data.firstCycle, checkpoint);
    const reserveIds = reserve ? checkOpeningInventory(data.openingReserve, [], null, true) : new Set();
    if (reserve) check(checkpoint.scene === 'campaign', 'La reserva cerrada no coincide con el progreso de campaña.');
    if (passage) {
      checkPassage(data.passage, checkpoint, reserveIds);
    }
  }

  function checkHangar(data) {
    checkLab(data);
    const s = data.snapshot;
    check(data.version === 1 && record(data.world) && record(data.line) && record(data.mission),
      'Faltan las estaciones, la línea o el objetivo del galpón.');
    check(typeof data.mission.phase === 'string' && finite(data.mission.elapsed) && data.mission.elapsed >= 0 &&
      finite(data.mission.phaseTime) && data.mission.phaseTime >= 0 && finite(data.mission.logicPhase) && data.mission.logicPhase >= 0 && data.mission.logicPhase < 1/15 && finite(data.mission.height) && data.mission.height > 0 &&
      (data.mission.guideStep === null || typeof data.mission.guideStep === 'string'),
      'El estado de la misión del galpón no es válido.');
    const production = load ? load('./galpon-production.js') : root.QBitsGalponProduction;
    check(production && typeof production.validate === 'function', 'Falta el modelo de producción del galpón.');
    const model = production.validate(data.production);
    check(model && Array.isArray(model.records), 'El inventario del galpón no es válido.');
    const parts = new Map(), records = new Map(model.records.map(r => [r.id, r]));
    function mark(id, location, shape, weight, mood) {
      const r = records.get(id);
      check(r && !parts.has(id), 'Una pieza del galpón carece de procedencia o está duplicada.');
      const expectedShape = r.kind === 'raw' || r.kind === 'worker' ? 'cube' : r.kind;
      check((location === 'cargo' || shape === expectedShape) && Math.abs(r.weight - weight) < 1e-8,
        'La forma o la masa del galpón no coincide con su registro.');
      if (location !== 'cargo') {
        check(record(mood) && finite(mood.energy) && Math.abs(mood.energy-r.energy) < 1e-8 &&
          record(mood.matter) && mood.matter.root === r.origin && mood.matter.path === r.path && mood.matter.rootWeight === 1,
          'La carga o el linaje de una pieza del galpón no coincide con el inventario.');
        if (mood.externalBattery !== undefined) {
          const battery = mood.externalBattery;
          check(shape === 'cube' && weight === 1 && record(battery) && battery.version === 1 && battery.ownerId === id &&
            positiveId(battery.packId) && typeof battery.enabled === 'boolean' && !mood.production && !mood.gripper && !mood.trajectory && !mood.workshop,
            'La batería adaptada no coincide con sus cubos originales.');
        }
        if (mood.gripper?.logistics !== undefined) {
          const logistics = load ? load('./galpon-logistics.js') : root.QBitsGalponLogistics;
          check(logistics?.validConfig(mood.gripper.logistics), 'La configuración de agarre del dron no es válida.');
        }
      }
      parts.set(id, location);
    }
    for (const g of s.groups) for (const p of g.parts) {
      mark(p.id, 'room', p.shape, p.weight, p.mood);
      check(!records.get(p.id).group?.startsWith('family:'), 'Una pieza familiar también está en la sala.');
    }
    const familyModel = load ? load('./families.js') : root.QBitsFamilies, familyIds = new Set();
    check(Array.isArray(s.families), 'Faltan las familias del galpón.');
    for (const f of s.families) {
      check(familyModel.validFamily(f) && !familyIds.has(f.id), 'Una familia del galpón es inválida o está duplicada.');
      familyIds.add(f.id);
      for (const item of f.items) for (const g of item.groups) for (const p of g.parts) {
        mark(p.id, 'family', p.shape, p.weight, p.mood);
        const r = records.get(p.id);
        check(['group','received'].includes(r.place) && r.group === 'family:'+f.id, 'La identidad y su familia no coinciden.');
      }
    }
    check(record(s.powerNetwork) && s.powerNetwork.version === 1 && Array.isArray(s.powerNetwork.reservoirs) &&
      s.powerNetwork.reservoirs.length <= 1 && Array.isArray(s.powerNetwork.cables) && s.powerNetwork.cables.length <= 128,
      'La red eléctrica del galpón no es válida.');
    for (const source of s.powerNetwork.reservoirs) check(record(source) && positiveId(source.id) && arrayVector(source.p,3) &&
      Math.abs(source.p[1]) <= .02 && source.p.every(n => Math.abs(n) <= 14) && typeof source.enabled === 'boolean' &&
      finite(source.energy) && Math.abs(source.energy*production.CONFIG.initialEnergyJ-model.energyJ) < 1e-5,
      'La fuente no representa la misma reserva de la instalación.');
    const cableIds = new Set(), endpoint = e => record(e) && ['part','reservoir'].includes(e.kind) && positiveId(e.id);
    for (const cable of s.powerNetwork.cables) {
      check(record(cable) && positiveId(cable.id) && !cableIds.has(cable.id) && endpoint(cable.from) && endpoint(cable.to) &&
        !(cable.from.kind === cable.to.kind && cable.from.id === cable.to.id) && Array.isArray(cable.points) && cable.points.length <= 64 &&
        cable.points.every(p => arrayVector(p,3) && p[1] >= -.01 && p[1] <= 14 && Math.abs(p[0]) <= 14 && Math.abs(p[2]) <= 14) &&
        Array.isArray(cable.materials) && cable.materials.length > 0 && cable.materials.length <= 8,
        'Un cable perdió su trazado o su inventario.');
      cableIds.add(cable.id);
      for (const p of cable.materials) {
        check(record(p) && p.shape === 'cube' && (arrayVector(p.p,3) || vector(p.p)) && (arrayVector(p.q,4) || quaternion(p.q)) &&
          !p.mood?.externalBattery && !p.mood?.gripper && !p.mood?.trajectory && !p.mood?.production && !p.mood?.workshop,
          'El cable contiene una pieza adaptada o inválida.');
        mark(p.id,'cable',p.shape,p.weight,p.mood);
        const r = records.get(p.id);check(r.place === 'cable' && r.group === 'cable:'+cable.id,'La custodia del cable no coincide con sus cubos.');
      }
    }
    for (const job of Object.values(model.chain?.jobs || {})) if (job) {
      check(Array.isArray(job.inputs) && Array.isArray(job.inputIds) && job.inputs.length === job.inputIds.length,
        'La estación no conserva sus entradas reservadas.');
      for (const p of job.inputs) {
        check(job.inputIds.includes(p.id),'La entrada no pertenece al trabajo guardado.');
        mark(p.id,'machine',p.shape,p.weight,p.mood);
        const r=records.get(p.id);check(r.place === 'machine' && r.group === 'station:'+job.station,'La estación perdió la custodia de su entrada.');
      }
    }
    check(Array.isArray(s.disassembly), 'Faltan los desarmes pendientes del galpón.');
    for (const pending of s.disassembly) {
      check(record(pending) && Array.isArray(pending.parts) && arrayVector(pending.origin,3),'El desarme pendiente no es válido.');
      for (const p of pending.parts) {
        check((arrayVector(p.p,3) || vector(p.p)) && (arrayVector(p.q,4) || quaternion(p.q)),'Falta la postura de un desarme pendiente.');
        mark(p.id,'disassembly',p.shape,p.weight,p.mood);
      }
    }
    for (const c of s.cargos) {
      check(positiveId(c.rawId) && c.side === 1 && c.required === (model.initialIds.length === 1 ? 1 : 2) && !c.robotPhysical && quaternion(c.q) && vector(c.v) && vector(c.w) &&
        typeof c.moving === 'boolean', 'Falta el estado físico de una carga de materia.');
      const r = records.get(c.rawId);
      check(r && r.kind === 'raw', 'La carga no corresponde a una extracción de materia.');
      const h = c.haul, duration = value => finite(value) && value >= 0;
      check(typeof c.arrived === 'boolean' && (h === null || record(h) && !c.arrived && r.place === 'carry' &&
        ['planning','reuniendo','arrastrando','descansando','bloqueado'].includes(h.phase) &&
        typeof h.planning === 'boolean' && typeof h.clear === 'boolean' && vector(h.goal) && vector(h.lastPosition) &&
        Array.isArray(h.path) && h.path.every(vector) && Number.isInteger(h.index) && h.index >= 0 && h.index <= h.path.length &&
        ['sinceProgress','nextCrew','nextRoute','nextSafety','nextMatch','activeCount'].every(k => duration(h[k])) &&
        Array.isArray(h.slots) && h.slots.length === r.carriers.length && new Set(h.slots.map(slot => slot?.id)).size === h.slots.length &&
        h.slots.every(slot => record(slot) && r.carriers.includes(slot.id) && parts.get(slot.id) === 'room' &&
          vector(slot.offset) && typeof slot.ready === 'boolean' && typeof slot.fixed === 'boolean' && duration(slot.nextPlan) &&
          (slot.lastDistance === null || duration(slot.lastDistance)) && Array.isArray(slot.approach) && slot.approach.every(vector) &&
          Number.isInteger(slot.index) && slot.index >= 0 && slot.index <= Math.max(0,slot.approach.length-1))),
        'El recorrido de la carga no coincide con sus transportistas.');
      mark(c.rawId, 'cargo', null, c.side ** 3);
    }
    for (const r of model.records) {
      const location = parts.get(r.id);
      if (r.place === 'stock' || r.place === 'job') check(!location, 'Una entrada del convertidor también está en la sala.');
      else if (r.place === 'source' || r.place === 'carry') check(location === 'cargo', 'Falta la carga de una extracción.');
      else if (r.place === 'received') check(location === 'family', 'Un producto recibido carece de familia.');
      else if (r.place === 'cable') check(location === 'cable','Falta el material reservado por un cable.');
      else if (r.place === 'machine') check(location === 'machine','Falta una entrada reservada por una estación.');
      else check(location === 'room' || location === 'family' || location === 'disassembly', 'Falta una pieza registrada en el galpón.');
    }
    const machineGrips=data.machineGrips??[];
    check(Array.isArray(machineGrips) && machineGrips.length<=s.groups.length,'Los agarres de máquina guardados no son válidos.');
    const groupFor=new Map(), physicalParts=new Map(), connected=s.groups.map((_,i)=>i);
    s.groups.forEach((g,i)=>g.parts.forEach(p=>{groupFor.set(p.id,i);physicalParts.set(p.id,p);}));
    const rootGroup=i=>{while(connected[i]!==i)i=connected[i];return i;};
    const union=(a,b)=>{if(a!==undefined&&b!==undefined)connected[rootGroup(b)]=rootGroup(a);};
    for(const joint of s.rotors||[])union(groupFor.get(joint.aId),groupFor.get(joint.bId));
    const tools=new Set(),loads=new Set();
    for(const grip of machineGrips){
      const tool=physicalParts.get(grip?.toolId),load=physicalParts.get(grip?.partId),a=groupFor.get(grip?.toolId),b=groupFor.get(grip?.partId);
      check(record(grip)&&positiveId(grip.toolId)&&positiveId(grip.partId)&&tool?.mood.gripper&&load&&
        !tools.has(grip.toolId)&&!loads.has(b)&&rootGroup(a)!==rootGroup(b)&&arrayVector(grip.relative,4)&&Math.abs(Math.hypot(...grip.relative)-1)<.001&&
        (grip.offset===undefined||arrayVector(grip.offset,3)&&Math.hypot(...grip.offset)<=28),
        'Un agarre de máquina perdió su herramienta, carga o articulación.');
      tools.add(grip.toolId);loads.add(b);union(a,b);
    }
    const logistics=load?load('./galpon-logistics.js'):root.QBitsGalponLogistics;
    check(typeof logistics?.validRuntime==='function' && logistics.validRuntime(data.trajectoryRuntime)!==null,
      'El recorrido en curso del dron no es válido.');
    const charges=s.runtime?.galponCharges===undefined?[]:s.runtime.galponCharges,chargedFlights=new Set();
    check(Array.isArray(charges)&&charges.length<=64,'La recarga pendiente del galpón no es válida.');
    for(const charge of charges){
      const part=physicalParts.get(charge?.id),component=groupFor.get(charge?.id);
      const capacity=component===undefined?0:s.groups.reduce((n,g,i)=>n+(rootGroup(i)===rootGroup(component)?g.parts.filter(p=>p.mood.externalBattery).length*900:0),0);
      check(record(charge)&&positiveId(charge.id)&&part?.mood.flight&&!chargedFlights.has(charge.id)&&finite(charge.joules)&&charge.joules>=0&&charge.joules<=capacity+1e-6,
        'La recarga pendiente perdió su dron o supera su capacidad embarcada.');
      chargedFlights.add(charge.id);
    }
    check(Array.isArray(data.routes) && record(s.runtime) && s.runtime.version === 1 && s.runtime.blocked === null && Array.isArray(s.runtime.routes),
      'Faltan las órdenes de movimiento del galpón.');
    const unit = n => finite(n) && n >= 0 && n <= 1;
    const groupIds = new Set(s.groups.map(g => g.parts[0].id)), routeIds = new Set();
    for (const r of data.routes) {
      check(record(r) && groupIds.has(r.id) && !routeIds.has(r.id) && Array.isArray(r.steps) &&
        r.steps.every(n => Number.isInteger(n) && n >= 0 && n < 4) && Number.isInteger(r.index) &&
        r.index >= 0 && r.index <= r.steps.length && vector(r.goal) && vector(r.pin) &&
        Array.isArray(r.preview) && r.preview.length === r.steps.length && r.preview.every(vector) &&
        Array.isArray(r.strides) && r.strides.length === r.steps.length && r.strides.every(n => finite(n) && n > 0),
        'Una ruta del galpón es inválida o perdió a su trabajador.');
      routeIds.add(r.id);
      const a = r.align, step = r.segment;
      check(a === null || record(a) && step === null && vector(a.fromP) && vector(a.toP) &&
        quaternion(a.fromQ) && quaternion(a.toQ) && unit(a.t), 'La alineación del trabajador no es válida.');
      check(step === null || record(step) && r.index < r.steps.length && vector(step.p) && quaternion(step.q) &&
        unit(step.t) && finite(step.duration) && step.duration > 0, 'El paso en curso del trabajador no es válido.');
    }
    check(Array.isArray(data.waiting), 'Faltan las órdenes pendientes del galpón.');
    for (const p of data.waiting) {
      check(record(p) && groupIds.has(p.id) && !routeIds.has(p.id) && vector(p.goal) &&
        ['planning','descanso','bloqueo','replan'].includes(p.reason) && finite(p.delay) && p.delay >= 0 &&
        (p.obstacles === null || typeof p.obstacles === 'string'), 'Una orden pendiente del galpón es inválida.');
      routeIds.add(p.id);
    }
    const h = data.grip;
    if (h !== null) {
      check(record(h) && finite(h.distance) && h.distance >= .3 && h.distance <= 2.5 && finite(h.age) && h.age >= 0 &&
        typeof h.latched === 'boolean' && vector(h.rootOffset) && vector(h.tiltAxis) && quaternion(h.rotation) && quaternion(h.initialRotation) &&
        Array.isArray(h.items) && h.items.length && h.items.every(i=>record(i) && vector(i.anchor) && (i.target === null || vector(i.target)) &&
          vector(i.relative) && quaternion(i.initial) && (i.rest === null || quaternion(i.rest))) &&
        (h.face === null || record(h.face) && quaternion(h.face.from) && quaternion(h.face.target) && Array.isArray(h.face.queue) &&
          h.face.queue.every(quaternion) && finite(h.face.elapsed) && h.face.elapsed >= 0 && typeof h.face.active === 'boolean'),
        'El agarre guardado del galpón no es válido.');
      if (h.family !== null) check(familyIds.has(h.family) && h.part === null && h.picked === null && h.items.length === 1 && h.items[0].id === null,
        'La familia sostenida no coincide con el inventario.');
      else check(parts.get(h.part) === 'room' && parts.get(h.picked) === 'room' && h.items.every(i=>groupIds.has(i.id)) &&
        new Set(h.items.map(i=>i.id)).size === h.items.length && s.groups.find(g=>g.parts[0].id===h.items[0].id)?.parts.some(p=>p.id===h.part),
        'La selección sostenida no coincide con sus piezas.');
    }
    check(Array.isArray(s.shelves) && s.shelves.length === 0 && s.workshop === null, 'Hay un taller o depósito ajeno al galpón.');
    check(Array.isArray(s.robotArms), 'Falta la lista de brazos del galpón.');
    const armIds = new Set(), pose = (p,n) => p === null || Array.isArray(p) && p.length === n && p.every(q => arrayVector(q,4) && Math.abs(Math.hypot(...q)-1)<.001);
    for (const arm of s.robotArms) {
      const gripper=s.groups.flatMap(g=>g.parts).find(p=>p.id===arm?.gripperId);
      check(record(arm) && parts.get(arm.baseId)==='room' && gripper?.mood.gripper && !armIds.has(arm.gripperId) &&
        Array.isArray(arm.joints) && arm.joints.length >= 1 && arm.joints.length <= 4 && arm.joints.every(j=>
          record(j) && parts.get(j.aId)==='room' && parts.get(j.bId)==='room' && records.get(j.aId)?.kind==='coupler' && records.get(j.bId)?.kind==='coupler') &&
        record(arm.poses) && pose(arm.poses.pick,arm.joints.length) && pose(arm.poses.place,arm.joints.length) &&
        (arm.poses.home===undefined || pose(arm.poses.home,arm.joints.length)) && typeof arm.repeat==='boolean',
        'El brazo no conserva sus piezas, articulaciones o poses.');
      armIds.add(arm.gripperId);
    }
  }

  function checkData(mode, data) {
    if (mode === 'lab') checkLab(data);
    else if (mode === 'galpon') checkHangar(data);
    else checkCampaign(data);
  }

  function validate(mode, data) {
    try {
      check(modeValid(mode), 'El modo de guardado no es válido.');
      checkJson(data);
      checkData(mode, data);
      return {ok:true};
    } catch (error) { return {ok:false, error:message(error, 'El guardado no es válido.')}; }
  }

  function inspectParsed(mode, save) {
    try {
      check(record(save) && save.format === FORMAT && save.mode === mode, 'El guardado no corresponde a este modo.');
      check(Number.isSafeInteger(save.version) && save.version >= 1, 'La versión del guardado no es válida.');
      if (save.version !== VERSION) return {status:'unsupported', error:'Este guardado requiere otra versión del juego.'};
      const arrays = checkParsedJson(save);
      checkParsedPrototypes(arrays);
      check(finite(save.savedAt) && finite(save.createdAt) && save.createdAt >= 0 && save.savedAt >= save.createdAt, 'Las fechas del guardado no son válidas.');
      checkData(mode, save.data);
      return {status:'ready', save, arrays};
    } catch (error) { return {status:'invalid', error:message(error, 'No se pudo leer el guardado.')}; }
  }

  function inspect(mode, raw) {
    if (raw === null || raw === undefined) return {status:'empty'};
    try {
      check(typeof raw === 'string', 'El guardado no contiene texto JSON.');
      return inspectParsed(mode, JSON.parse(raw));
    } catch (error) { return {status:'invalid', error:message(error, 'No se pudo leer el guardado.')}; }
  }

  function createStore({storage = () => globalThis.localStorage, now = () => Date.now()} = {}) {
    // At most one immutable raw string and primitive metadata per slot. Never
    // retain a decoded graph or a caller-visible object. Every access still
    // reads storage, so another tab, deletion and denied access remain visible.
    const checked = Object.create(null);
    function remember(mode, raw, result) {
      checked[mode] = result.status === 'ready' ? {
        raw, arrays:result.arrays,
        createdAt:result.save.createdAt, savedAt:result.save.savedAt
      } : null;
    }
    function access() {
      const target = typeof storage === 'function' ? storage() : null;
      check(target && typeof target.getItem === 'function', 'El almacenamiento local no está disponible.');
      return target;
    }
    function readFrom(target, mode, metadataOnly = false) {
      let raw;
      try { raw = target.getItem(KEYS[mode]); }
      catch (error) { return {status:'unavailable', error:message(error, 'No se pudo acceder al almacenamiento local.')}; }
      const cached = checked[mode];
      if (cached && raw === cached.raw) {
        try {
          checkParsedPrototypes(cached.arrays);
          return {status:'ready', save:metadataOnly ? cached : JSON.parse(raw)};
        } catch (error) { return {status:'invalid', error:message(error, 'No se pudo leer el guardado.')}; }
      }
      const result = inspect(mode, raw);
      remember(mode, raw, result);
      return result.status === 'ready' ? {status:'ready', save:metadataOnly ? checked[mode] : result.save} : result;
    }
    function read(mode) {
      if (!modeValid(mode)) return {status:'invalid', error:'El modo de guardado no es válido.'};
      try { return readFrom(access(), mode); }
      catch (error) { return {status:'unavailable', error:message(error, 'El almacenamiento local no está disponible.')}; }
    }
    function write(mode, data, {replace = false} = {}) {
      if (!modeValid(mode)) return {ok:false, error:'El modo de guardado no es válido.'};
      try {
        const target = access();
        check(typeof target.setItem === 'function', 'No se puede escribir en el almacenamiento local.');
        const previous = readFrom(target, mode, true);
        check(previous.status !== 'unavailable', previous.error || 'No se pudo leer el guardado anterior.');
        check(replace === true || previous.status === 'empty' || previous.status === 'ready', 'El guardado anterior se conserva: '+previous.error);
        const result = validate(mode, data);
        check(result.ok, result.error);
        const time = now();
        check(finite(time) && time >= 0, 'La fecha actual no es válida.');
        const retained = previous.status === 'ready' && replace !== true ? previous.save : null;
        const createdAt = retained ? retained.createdAt : time;
        const savedAt = Math.max(time, retained ? retained.savedAt : createdAt);
        const serialized = JSON.stringify({format:FORMAT, version:VERSION, mode, savedAt, createdAt, data});
        const save = JSON.parse(serialized);
        // Validate the final bytes before trusting them on a later cache hit.
        // The injected clock or JSON hooks must not promote an invalid record.
        const inspected = inspectParsed(mode, save);
        check(inspected.status === 'ready', inspected.error);
        // Web Storage setItem is atomic on failure. Do not remove the old key,
        // create a second multi-megabyte backup slot, or expose live references.
        target.setItem(KEYS[mode], serialized);
        remember(mode, serialized, inspected);
        return {ok:true, save};
      } catch (error) { return {ok:false, error:message(error, 'No se pudo guardar la partida.')}; }
    }
    return Object.freeze({read, write});
  }

  return Object.freeze({VERSION, FORMAT, KEYS, validate, createStore});
});
