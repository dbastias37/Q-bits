(function (root, factory) {
  'use strict';
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.QBitsSavedGames = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
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
        if (!array && descriptor.value === undefined) continue;
        if (!array && !plain) check(finite(descriptor.value), 'El guardado contiene una coordenada no finita.');
        checkJson(descriptor.value, ancestors, depth + 1);
      }
    } finally { ancestors.delete(value); }
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
      for (const part of group.parts) {
        check(record(part) && positiveId(part.id) && !unitIds.has(part.id), 'Hay un identificador de pieza inválido o repetido.');
        unitIds.add(part.id);
        check(SHAPES.has(part.shape) && finite(part.weight) && part.weight > 0, 'La forma o masa de una pieza no es válida.');
        check(vector(part.p) && quaternion(part.q), 'La posición u orientación de una pieza no es válida.');
        if (own(part, 'mood')) {
          check(record(part.mood), 'El estado de una pieza no es válido.');
          if (own(part.mood, 'energy')) check(finite(part.mood.energy) && part.mood.energy >= 0 && part.mood.energy <= 1, 'La energía de una pieza no es válida.');
        }
      }
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
  }

  function validate(mode, data) {
    try {
      check(modeValid(mode), 'El modo de guardado no es válido.');
      checkJson(data);
      if (mode === 'lab') checkLab(data); else checkCampaign(data);
      return {ok:true};
    } catch (error) { return {ok:false, error:message(error, 'El guardado no es válido.')}; }
  }

  function inspect(mode, raw) {
    if (raw === null || raw === undefined) return {status:'empty'};
    try {
      check(typeof raw === 'string', 'El guardado no contiene texto JSON.');
      const save = JSON.parse(raw);
      check(record(save) && save.format === FORMAT && save.mode === mode, 'El guardado no corresponde a este modo.');
      check(Number.isSafeInteger(save.version) && save.version >= 1, 'La versión del guardado no es válida.');
      if (save.version !== VERSION) return {status:'unsupported', error:'Este guardado requiere otra versión del juego.'};
      checkJson(save);
      check(finite(save.savedAt) && finite(save.createdAt) && save.createdAt >= 0 && save.savedAt >= save.createdAt, 'Las fechas del guardado no son válidas.');
      if (mode === 'lab') checkLab(save.data); else checkCampaign(save.data);
      return {status:'ready', save};
    } catch (error) { return {status:'invalid', error:message(error, 'No se pudo leer el guardado.')}; }
  }

  function createStore({storage = () => globalThis.localStorage, now = () => Date.now()} = {}) {
    function access() {
      const target = typeof storage === 'function' ? storage() : null;
      check(target && typeof target.getItem === 'function', 'El almacenamiento local no está disponible.');
      return target;
    }
    function readFrom(target, mode) {
      try { return inspect(mode, target.getItem(KEYS[mode])); }
      catch (error) { return {status:'unavailable', error:message(error, 'No se pudo acceder al almacenamiento local.')}; }
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
        const previous = readFrom(target, mode);
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
        // Web Storage setItem is atomic on failure. Do not remove the old key,
        // create a second multi-megabyte backup slot, or expose live references.
        target.setItem(KEYS[mode], serialized);
        return {ok:true, save};
      } catch (error) { return {ok:false, error:message(error, 'No se pudo guardar la partida.')}; }
    }
    return Object.freeze({read, write});
  }

  return Object.freeze({VERSION, FORMAT, KEYS, validate, createStore});
});
