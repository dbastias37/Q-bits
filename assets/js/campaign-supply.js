(function (root, factory) {
  'use strict';
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.QBitsCampaignSupply = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // This ledger never creates a part, stores a second physical copy, or changes
  // mood/charge. The scene owns exactly one payload per ID: reserve for queued
  // pieces, and the physical snapshot for emitting/room/returning pieces.
  const VERSION = 1, MAX_PARTS = 256, MAX_QUEUE = 4, MAX_DISPATCHES = 2, MAX_REQUESTS = 512;
  const LOCATIONS = new Set(['reserve', 'queued', 'emitting', 'room', 'returning']);
  const FACTS = ['requested', 'taken', 'placed', 'voluntaryReturns', 'offeredReturns'];
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const idValid = id => Number.isSafeInteger(id) && id > 0;
  const label = value => typeof value === 'string' && value.length > 0 && value.length <= 120 && !/[\u0000-\u001f\u007f]/.test(value);
  const destinationValid = value => label(value) && /^(?:reserve|(?:room|delivery|family|shelf):.+)$/.test(value);
  const integer = (value, minimum, maximum) => Number.isInteger(value) && value >= minimum && value <= maximum;
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const fail = (code, error) => ({ok:false, code, error});
  const event = (kind, id, extra = {}) => ({ok:true, event:{kind, id, ...extra}});
  const copy = value => JSON.parse(JSON.stringify(value));
  const record = (state, id) => state.records.find(entry => entry.id === id) || null;
  const addFact = (state, name, id) => { if (!state.facts[name].includes(id)) state.facts[name].push(id); };
  const sameIds = (left, right) => left.length === right.length && left.every((id, index) => id === right[index]);

  // Inspect descriptors before cloning. A malformed restore must not execute a
  // getter/toJSON, silently discard NaN, or smuggle a duplicate inventory ID.
  function checkJson(value, ancestors = new Set(), depth = 0, budget = {nodes:0}) {
    check(depth <= 16 && ++budget.nodes <= 40000, 'El inventario guardado excede sus límites.');
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
    if (typeof value === 'number') { check(Number.isFinite(value), 'El inventario contiene un número inválido.'); return; }
    check(value && typeof value === 'object' && !ancestors.has(value), 'El inventario no admite este valor.');
    const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
    check(array || prototype === null || Object.getPrototypeOf(prototype) === null, 'El inventario debe contener datos simples.');
    for (let parent = value; parent !== null; parent = Object.getPrototypeOf(parent)) check(!Object.getOwnPropertyDescriptor(parent, 'toJSON'), 'El inventario no admite conversiones toJSON.');
    const keys = Reflect.ownKeys(value);
    if (array) check(keys.length === value.length + 1, 'El inventario contiene una lista incompleta.');
    ancestors.add(value);
    for (const key of keys) {
      if (array && key === 'length') continue;
      check(typeof key === 'string' && !['__proto__', 'constructor', 'prototype', 'toJSON'].includes(key), 'El inventario contiene una clave inválida.');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      check(descriptor && own(descriptor, 'value') && descriptor.enumerable, 'El inventario no admite propiedades calculadas.');
      checkJson(descriptor.value, ancestors, depth + 1, budget);
    }
    ancestors.delete(value);
  }

  function exactKeys(value, keys) {
    return object(value) && Object.keys(value).length === keys.length && keys.every(key => own(value, key));
  }

  function checkedState(state) {
    checkJson(state);
    check(exactKeys(state, ['version', 'attemptId', 'maxQueue', 'maxDispatches', 'offerSeconds', 'records', 'queue', 'requests', 'transfer', 'facts']), 'Faltan datos del inventario.');
    check(state.version === VERSION && label(state.attemptId), 'La versión o el intento no son válidos.');
    check(integer(state.maxQueue, 1, MAX_QUEUE) && integer(state.maxDispatches, 1, MAX_DISPATCHES), 'La cuota o la cola no son válidas.');
    check(state.offerSeconds === null || Number.isFinite(state.offerSeconds) && state.offerSeconds > 0 && state.offerSeconds <= 120, 'El tiempo de oferta no es válido.');
    check(Array.isArray(state.records) && state.records.length > 0 && state.records.length <= MAX_PARTS, 'Falta el manifiesto finito.');
    const ids = new Set(), byId = new Map();
    for (const entry of state.records) {
      check(exactKeys(entry, ['id', 'origin', 'weight', 'destination', 'location', 'claimed', 'used', 'dispatches', 'offered', 'offerElapsed', 'requestId', 'recoveries']), 'Una identidad tiene datos inválidos.');
      check(idValid(entry.id) && !ids.has(entry.id), 'Hay identidades inválidas o repetidas.');
      ids.add(entry.id); byId.set(entry.id, entry);
      check(label(entry.origin) && destinationValid(entry.destination) && Number.isFinite(entry.weight) && entry.weight > 0, 'La materia, su origen o su destino no son válidos.');
      check(LOCATIONS.has(entry.location) && typeof entry.claimed === 'boolean' && typeof entry.used === 'boolean' && typeof entry.offered === 'boolean', 'El estado de una identidad no es válido.');
      check(integer(entry.dispatches, 0, state.maxDispatches) && Number.isSafeInteger(entry.recoveries) && entry.recoveries >= 0, 'Los movimientos de una identidad no son válidos.');
      check(Number.isFinite(entry.offerElapsed) && entry.offerElapsed >= 0 && entry.offerElapsed <= (state.offerSeconds || 0), 'La ventana de oferta no es válida.');
      check(entry.requestId === null || label(entry.requestId), 'La solicitud de una identidad no es válida.');
      check(!entry.used || entry.claimed, 'Una pieza utilizada debe seguir reclamada.');
      check(!entry.offered || !entry.claimed && !entry.used, 'Una pieza reclamada no puede seguir ofrecida.');
      if (entry.location === 'reserve') check(!entry.claimed && !entry.used && !entry.offered && entry.offerElapsed === 0 && entry.requestId === null, 'La reserva contiene una asignación activa.');
      else {
        check(entry.requestId !== null && (entry.claimed || entry.offered), 'Falta la asignación de una pieza fuera de reserva.');
        if (entry.location === 'queued') check(entry.dispatches < state.maxDispatches && entry.offerElapsed === 0, 'Una salida pendiente excede la cuota.');
        else check(entry.dispatches > 0, 'Falta el despacho de una pieza fuera de reserva.');
      }
      if (!entry.offered || !['room', 'returning'].includes(entry.location)) check(entry.offerElapsed === 0, 'Una pieza no elegible conserva un temporizador.');
    }
    check(Number.isFinite(state.records.reduce((sum, entry) => sum + entry.weight, 0)), 'La materia total no es válida.');
    const idList = (list, maximum = MAX_PARTS) => Array.isArray(list) && list.length <= maximum && new Set(list).size === list.length && list.every(id => ids.has(id));
    check(idList(state.queue, state.maxQueue), 'La cola contiene identidades inválidas o repetidas.');
    check(Array.isArray(state.requests) && state.requests.length <= MAX_REQUESTS, 'El registro de peticiones no es válido.');
    const requests = new Map(), counts = new Map(), pending = [], activeRequests = new Set();
    for (const request of state.requests) {
      check(exactKeys(request, ['id', 'ids', 'offered', 'emitted', 'cancelled']) && label(request.id) && !requests.has(request.id), 'Hay peticiones inválidas o repetidas.');
      check(idList(request.ids, state.maxQueue) && request.ids.length > 0 && typeof request.offered === 'boolean' && idList(request.emitted, state.maxQueue) && idList(request.cancelled, state.maxQueue), 'Una petición no coincide con el manifiesto.');
      check(request.emitted.every(id => request.ids.includes(id)) && request.cancelled.every(id => request.ids.includes(id) && !request.emitted.includes(id)), 'Una petición repite una salida cancelada.');
      requests.set(request.id, request);
      for (const id of request.emitted) counts.set(id, (counts.get(id) || 0) + 1);
      for (const id of request.ids) if (!request.emitted.includes(id) && !request.cancelled.includes(id)) {
        pending.push(id); activeRequests.add(request.id);
        const entry = byId.get(id);
        check(entry.location === 'queued' && entry.requestId === request.id, 'Una petición pendiente no tiene su identidad reservada.');
      }
    }
    check(sameIds(pending, state.queue), 'La cola no coincide con las peticiones pendientes.');
    for (const entry of state.records) {
      check(entry.dispatches === (counts.get(entry.id) || 0), 'El número de despachos no coincide con su historial.');
      if (entry.location !== 'reserve') {
        const request = requests.get(entry.requestId);
        check(request && request.ids.includes(entry.id), 'Una identidad apunta a una petición desconocida.');
        check(entry.location === 'queued' ? !request.emitted.includes(entry.id) && !request.cancelled.includes(entry.id) : request.emitted.includes(entry.id), 'La identidad no coincide con su salida.');
        check(request.offered || entry.claimed, 'Una petición deliberada perdió su protección.');
      }
    }
    const inTransit = state.records.filter(entry => ['emitting', 'returning'].includes(entry.location));
    if (state.transfer === null) check(inTransit.length === 0, 'Falta una transacción de traslado.');
    else {
      const transfer = state.transfer, entry = byId.get(transfer.id);
      check(exactKeys(transfer, ['kind', 'id', 'cause']) && entry && inTransit.length === 1 && inTransit[0] === entry, 'La transacción de traslado no es única.');
      if (transfer.kind === 'emission') {
        check(entry.location === 'emitting' && transfer.cause === 'request', 'La emisión no coincide con su transacción.');
        activeRequests.add(entry.requestId);
      } else check(transfer.kind === 'return' && entry.location === 'returning' && ['voluntary', 'offer'].includes(transfer.cause), 'El retorno no coincide con su transacción.');
      if (transfer.cause === 'offer') check(entry.offered && !entry.claimed && state.offerSeconds !== null && entry.offerElapsed >= state.offerSeconds, 'El retorno automático no tiene una oferta elegible.');
    }
    check(activeRequests.size <= 1 && state.queue.length + (state.transfer?.kind === 'emission' ? 1 : 0) <= state.maxQueue, 'Hay más de un lote activo.');
    check(exactKeys(state.facts, FACTS), 'Faltan los hechos de la práctica.');
    for (const name of FACTS) check(idList(state.facts[name]), 'Un hecho contiene identidades inválidas o repetidas.');
    check(state.facts.requested.every(id => state.requests.some(request => !request.offered && request.ids.includes(id))), 'Una petición acreditada no existe.');
    check(state.facts.placed.every(id => state.facts.taken.includes(id)), 'Una colocación no tiene un agarre previo.');
    for (const name of FACTS.filter(name => name !== 'requested')) check(state.facts[name].every(id => byId.get(id).dispatches > 0), 'Un hecho no tiene una pieza emitida.');
    return state;
  }

  function create(manifest, options = {}) {
    check(Array.isArray(manifest) && manifest.length > 0 && manifest.length <= MAX_PARTS, 'Se necesita un manifiesto finito.');
    const state = {
      version:VERSION, attemptId:options.attemptId || 'first-cycle', maxQueue:options.maxQueue ?? MAX_QUEUE,
      maxDispatches:options.maxDispatches ?? MAX_DISPATCHES, offerSeconds:options.offerSeconds ?? null,
      records:manifest.map(entry => ({id:entry.id, origin:entry.origin, weight:entry.weight,
        destination:entry.destination || 'reserve', location:'reserve', claimed:false, used:false,
        dispatches:0, offered:false, offerElapsed:0, requestId:null, recoveries:0})),
      queue:[], requests:[], transfer:null,
      facts:{requested:[], taken:[], placed:[], voluntaryReturns:[], offeredReturns:[]}
    };
    return checkedState(state);
  }

  function validate(saved) {
    try { checkedState(saved); return {ok:true}; }
    catch (error) { return fail('INVALID_SUPPLY', error.message || 'El inventario no es válido.'); }
  }
  function snapshot(state) { return copy(checkedState(state)); }
  function restore(saved) { return copy(checkedState(saved)); }

  function request(state, requestId, ids, options = {}) {
    if (!label(requestId) || !Array.isArray(ids) || !ids.length || ids.length > state.maxQueue || new Set(ids).size !== ids.length) return fail('INVALID_REQUEST', 'La petición necesita identidades únicas dentro del límite.');
    const offered = options.offered === true, previous = state.requests.find(item => item.id === requestId);
    if (previous) return sameIds(previous.ids, ids) && previous.offered === offered ? {ok:true, duplicate:true} : fail('REQUEST_CONFLICT', 'Esta petición ya identifica otro lote.');
    if (state.queue.length || state.transfer) return fail('QUEUE_BUSY', 'Hay un lote o traslado pendiente.');
    if (state.requests.length >= MAX_REQUESTS) return fail('REQUEST_LIMIT', 'Este intento alcanzó el límite de peticiones.');
    const entries = ids.map(id => record(state, id));
    if (entries.some(entry => !entry || entry.location !== 'reserve')) return fail('UNAVAILABLE', 'La petición necesita piezas disponibles en reserva.');
    if (entries.some(entry => entry.dispatches >= state.maxDispatches)) return fail('DISPATCH_LIMIT', 'Se agotaron las salidas de estas identidades en el intento.');
    state.requests.push({id:requestId, ids:[...ids], offered, emitted:[], cancelled:[]});
    for (const entry of entries) {
      entry.location = 'queued'; entry.requestId = requestId; entry.claimed = !offered;
      entry.offered = offered; entry.used = false; entry.offerElapsed = 0;
      if (!offered) addFact(state, 'requested', entry.id);
    }
    state.queue.push(...ids);
    return {ok:true, event:{kind:'requested', ids:[...ids], offered}};
  }

  function cancelPending(state, requestId) {
    const request = state.requests.find(item => item.id === requestId);
    if (!request) return fail('UNKNOWN_REQUEST', 'No existe esa petición.');
    const ids = state.queue.filter(id => record(state, id).requestId === requestId);
    for (const id of ids) {
      const entry = record(state, id);
      entry.location = 'reserve'; entry.requestId = null; entry.claimed = false; entry.offered = false;
      entry.used = false; entry.offerElapsed = 0; request.cancelled.push(id);
    }
    state.queue = state.queue.filter(id => !ids.includes(id));
    return {ok:true, event:{kind:'pending-cancelled', ids, educational:false}};
  }

  function next(state) { return state.transfer ? null : state.queue[0] ?? null; }
  function beginEmission(state, id) {
    if (!idValid(id) || next(state) !== id) return fail('NOT_NEXT', 'La pieza no es la próxima salida disponible.');
    const entry = record(state, id), request = state.requests.find(item => item.id === entry.requestId);
    state.queue.shift(); entry.location = 'emitting'; entry.dispatches++;
    request.emitted.push(id); state.transfer = {kind:'emission', id, cause:'request'};
    return event('emission-started', id);
  }
  function finishEmission(state, id) {
    if (state.transfer?.kind !== 'emission' || state.transfer.id !== id) return fail('NOT_EMITTING', 'No hay una emisión de esa pieza.');
    record(state, id).location = 'room'; state.transfer = null;
    return event('emitted', id);
  }

  function claim(state, id) {
    const entry = record(state, id);
    if (!entry || entry.location === 'reserve') return fail('UNAVAILABLE', 'La pieza aún está en reserva.');
    if (entry.location === 'returning' && state.transfer?.cause !== 'offer') return fail('RETURNING', 'La devolución voluntaria ya está en curso.');
    const cancelledReturn = entry.location === 'returning';
    if (cancelledReturn) { entry.location = 'room'; state.transfer = null; }
    entry.claimed = true; entry.offered = false; entry.offerElapsed = 0;
    return event('claimed', id, {cancelledReturn});
  }
  function noteUsed(state, id) {
    const result = claim(state, id);
    if (result.ok) record(state, id).used = true;
    return result;
  }
  function noteTaken(state, id) {
    const entry = record(state, id);
    if (!entry || !['room', 'returning'].includes(entry.location)) return fail('NOT_PRESENT', 'La pieza no está disponible para el agarre.');
    const result = noteUsed(state, id);
    if (result.ok) { addFact(state, 'taken', id); result.event.kind = 'taken'; }
    return result;
  }
  function notePlaced(state, id) {
    const entry = record(state, id);
    if (entry?.location !== 'room' || !state.facts.taken.includes(id)) return fail('NO_TAKE', 'Falta el agarre real antes de colocar la pieza.');
    addFact(state, 'placed', id);
    return event('placed', id);
  }

  // The first playable slice leaves offerSeconds=null. A later experiment may
  // enable it explicitly, after voluntary observation and readable instructions.
  // The caller supplies physical eligibility (stable, unused, wholly in zone).
  function advance(state, dt, options = {}) {
    if (!Number.isFinite(dt) || dt < 0) return fail('INVALID_TIME', 'El tiempo de simulación no es válido.');
    if (options.paused || state.offerSeconds === null) return {ok:true, due:[]};
    const eligible = new Set(options.eligibleIds || []), due = [];
    for (const entry of state.records) {
      if (entry.location !== 'room' || !entry.offered || entry.claimed || entry.used) continue;
      entry.offerElapsed = eligible.has(entry.id) ? Math.min(state.offerSeconds, entry.offerElapsed + dt) : 0;
      if (entry.offerElapsed >= state.offerSeconds) due.push(entry.id);
    }
    return {ok:true, due};
  }
  function beginReturn(state, id, cause = 'voluntary') {
    const entry = record(state, id);
    if (state.transfer) return fail('TRANSFER_BUSY', 'Hay otro traslado en curso.');
    if (!entry || entry.location !== 'room') return fail('NOT_PRESENT', 'La pieza no está en la sala.');
    if (!['voluntary', 'offer'].includes(cause)) return fail('INVALID_CAUSE', 'La recuperación técnica no es una devolución.');
    if (cause === 'offer' && (state.offerSeconds === null || !entry.offered || entry.claimed || entry.used || entry.offerElapsed < state.offerSeconds)) return fail('NOT_ELIGIBLE', 'La pieza no tiene un retorno de oferta elegible.');
    entry.location = 'returning'; state.transfer = {kind:'return', id, cause};
    return event('return-started', id, {cause});
  }
  function acceptReturn(state, id) {
    if (state.transfer?.kind !== 'return' || state.transfer.id !== id) return fail('NOT_RETURNING', 'No hay una devolución de esa pieza.');
    const entry = record(state, id), cause = state.transfer.cause;
    entry.location = 'reserve'; entry.claimed = false; entry.used = false; entry.offered = false;
    entry.offerElapsed = 0; entry.requestId = null; state.transfer = null;
    addFact(state, cause === 'voluntary' ? 'voluntaryReturns' : 'offeredReturns', id);
    return event('return-accepted', id, {cause, educational:true});
  }
  function recover(state, id) {
    const entry = record(state, id);
    if (!entry || !['emitting', 'room', 'returning'].includes(entry.location)) return fail('NOT_PRESENT', 'La recuperación necesita una identidad ya emitida.');
    if (state.transfer?.id === id) state.transfer = null;
    entry.location = 'room'; entry.offerElapsed = 0; entry.recoveries = Math.min(Number.MAX_SAFE_INTEGER, entry.recoveries + 1);
    return event('recovered', id, {educational:false});
  }

  // A scene adapter supplies actual, exclusive inventory locations, including
  // family/shelf/accepted installation names when those integrations exist.
  // Merely locating a piece in room/transit cannot satisfy a reserve obligation.
  // Unlisted actors (including the guide) are outside this finite manifest.
  function checkDestinations(state, inventory) {
    if (!Array.isArray(inventory)) return fail('INVALID_INVENTORY', 'Falta el inventario físico para comprobar los destinos.');
    const pending = [], locations = Object.create(null), origins = Object.create(null), actual = new Map();
    for (const piece of inventory) {
      if (!object(piece) || !idValid(piece.id) || !record(state, piece.id)) continue;
      const occurrences = actual.get(piece.id) || []; occurrences.push(piece); actual.set(piece.id, occurrences);
    }
    for (const entry of state.records) {
      const matches = actual.get(entry.id) || [], found = matches[0];
      const located = matches.length === 1 && (['reserve', 'queued'].includes(entry.location) ? found.location === 'reserve' :
        ['emitting', 'returning'].includes(entry.location) ? found.location === 'transit' :
        typeof found.location === 'string' && /^(?:room(?::.+)?|(?:delivery|family|shelf):.+)$/.test(found.location));
      const issue = matches.length !== 1 ? matches.length ? 'duplicate' : 'missing' :
        !Number.isFinite(found.weight) || Math.abs(found.weight - entry.weight) > 1e-8 || own(found, 'origin') && found.origin !== entry.origin ? 'matter' :
        found.location !== entry.destination ? 'destination' :
        !located || entry.destination === 'reserve' && entry.location !== 'reserve' ? 'assignment' : null;
      if (issue) pending.push({id:entry.id, origin:entry.origin, destination:entry.destination, location:matches.length === 1 ? found.location || 'unknown' : matches.length ? 'duplicate' : 'unknown', issue});
      if (matches.length === 1 && Number.isFinite(found.weight) && label(found.location)) locations[found.location] = (locations[found.location] || 0) + found.weight;
      origins[entry.origin] = (origins[entry.origin] || 0) + entry.weight;
    }
    return {ok:true, complete:pending.length === 0 && state.queue.length === 0 && state.transfer === null,
      pending, pieces:state.records.length, matter:state.records.reduce((sum, entry) => sum + entry.weight, 0), locations, origins};
  }

  return Object.freeze({VERSION, create, validate, snapshot, restore, record, request, cancelPending,
    next, beginEmission, finishEmission, claim, noteUsed, noteTaken, notePlaced, advance,
    beginReturn, acceptReturn, recover, checkDestinations});
});
