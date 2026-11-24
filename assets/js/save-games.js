(function (root, factory) {
  'use strict';
  const model = factory(root, typeof module === 'object' && module.exports ? require : null);
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.QBitsSavedGames = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, load) {
  'use strict';

  const VERSION = 1;
  const FORMAT = 'qbits-save';
  const KEYS = Object.freeze({lab:'qbits.save.lab.v1', campaign:'qbits.save.campaign.v1'});
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

  function validate(mode, data) {
    try {
      check(modeValid(mode), 'El modo de guardado no es válido.');
      checkJson(data);
      if (mode === 'lab') checkLab(data); else checkCampaign(data);
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
      if (mode === 'lab') checkLab(save.data); else checkCampaign(save.data);
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
    const checked = {lab:null, campaign:null};
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
