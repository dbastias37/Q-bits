/**
 * Tablet 2.0 demonstration state. No game globals, Cannon bodies or game saves.
 * Parameter sources: game.js servoConfig/configureServo/mechanismDefaults,
 * rotor-power.js LIMITS, propeller-power.js config/validConfig.
 * Presets are new UI shortcuts, not new motor specifications.
 */
export const DEMO_FORMAT = 'qbits-tablet-v2-demo';
export const STORAGE_KEY = 'qbits.tablet-v2.demo-saves.v1';
// Visual fixture roles identify this demonstration's existing articulated parts.
// They are not inferred joints, game connections, mechanics or physical bodies.
export const DEMO_ROLES = Object.freeze([
  'base-1', 'base-2', 'base-3', 'base-4', 'rotor-1', 'column-1', 'column-2',
  'servo-1', 'arm-1', 'arm-2', 'servo-2', 'gripper-1', 'gripper-2',
  'battery-1', 'cube-1', 'drone-1'
]);
const range = (min, max, value, unit, presets = {}) => Object.freeze({ min, max, default: value, unit, presets: Object.freeze(presets) });
const motor = {
  force: range(2, 3200, 320, '', { soft: 80, normal: 320, strong: 800 }),
  torque: range(.02, 32, 3.2, 'N·m'),
  capacity: range(2, 16000, 256, 'u')
};
export const PARAMS = Object.freeze({
  rotor: Object.freeze({ speed: range(1, 360, 30, 'rpm', { slow: 15, normal: 30, fast: 90 }), ...motor }),
  servo: Object.freeze({ speed: range(5, 540, 45, '°/s', { slow: 15, normal: 45, fast: 135 }), ...motor,
    min: range(-90, 90, -60, '°'), max: range(-90, 90, 60, '°'), target: range(-90, 90, 30, '°') }),
  drone: Object.freeze({ speed: range(0, 1.2, 0, 'm/s', { slow: .25, normal: .5, fast: 1 }),
    height: range(.15, 3, .5, 'm'), heading: range(-Math.PI, Math.PI, 0, 'rad') }),
  route: Object.freeze({ x: range(-28, 28, 0, 'm'), z: range(-28, 28, 0, 'm'), height: range(.15, 3, .5, 'm'), wait: range(0, 120, 0, 's'), maxPoints: 48 })
});
const clone = value => JSON.parse(JSON.stringify(value));
const finite = Number.isFinite;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const MAX_COUNTER = 1000000000;
const validId = value => typeof value === 'string' && /^[a-z][a-z0-9_-]{0,79}$/i.test(value) && !['constructor', 'prototype', '__proto__'].includes(value);
const validCounter = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNTER;
const totalPieces = state => state.pieces.length + state.families.reduce((sum, f) => sum + f.pieces.length, 0);
const validName = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 40;
const inRange = (value, limits) => finite(value) && value >= limits.min && value <= limits.max;
const vector = value => Array.isArray(value) && value.length === 3 && value.every(n => finite(n) && Math.abs(n) <= 1000);
const freeze = object => {
  if (!object || typeof object !== 'object' || Object.isFrozen(object)) return object;
  Object.freeze(object);
  for (const value of Object.values(object)) freeze(value);
  return object;
};

function piece(id, name, type, position, size = [.62, .62, .62], extra = {}) {
  return { id, name, type, position, size, rotation: [0, 0, 0], groupId: 'arm', color: '#343b3d', ...(DEMO_ROLES.includes(id) ? { demoRole: id } : {}), ...extra };
}
export function createInitialState() {
  const pieces = [
    piece('base-1', 'Base izquierda', 'cube', [-.66, .31, 0]),
    piece('base-2', 'Base central', 'cube', [0, .31, 0]),
    piece('base-3', 'Base derecha', 'cube', [.66, .31, 0]),
    piece('base-4', 'Apoyo posterior', 'cube', [0, .31, -.66]),
    piece('rotor-1', 'Rotor de la base', 'rotor', [0, .93, 0], [.62, .62, .62], { color: '#7c8889' }),
    piece('column-1', 'Columna inferior', 'cube', [0, 1.55, 0]),
    piece('column-2', 'Columna superior', 'cube', [0, 2.17, 0]),
    piece('servo-1', 'Servo del brazo', 'servo', [0, 2.79, 0], [.64, .64, .64], { shape: 'pyramid', color: '#8e9f9d' }),
    piece('arm-1', 'Tramo del brazo', 'cube', [.62, 2.79, 0]),
    piece('arm-2', 'Extensión del brazo', 'cube', [1.24, 2.79, 0]),
    piece('servo-2', 'Servo de la pinza', 'servo', [1.86, 2.79, 0], [.55, .55, .55], { shape: 'pyramid', color: '#8e9f9d' }),
    piece('gripper-1', 'Pinza izquierda', 'gripper', [2.04, 2.29, -.27], [.25, .64, .22], { color: '#718e89' }),
    piece('gripper-2', 'Pinza derecha', 'gripper', [2.04, 2.29, .27], [.25, .64, .22], { color: '#718e89' }),
    piece('battery-1', 'Batería del mecanismo', 'battery', [-.82, .89, -.65], [.55, 1.12, .55], { color: '#6dbca9', charge: 1, enabled: true, cells: 1 }),
    piece('cube-1', 'Q-bit de prueba', 'cube', [2.05, .31, 0], [.62, .62, .62], { groupId: 'loose' }),
    piece('drone-1', 'Dron de prueba', 'drone', [0, 1.2, 0], [1.8, .38, 1.8], { groupId: 'drone', color: '#608b85' })
  ];
  // This fixture represents a manually assembled servo (servoConfig), not the
  // catalogue recipe servoBlueprintTemplate (-40/+40, repeat, .4 N·m, 32 u).
  const servo = kind => ({ type: 'servo', kind, status: 'stopped', direction: 1, speed: 45, force: 320, torque: 3.2, capacity: 256, min: -60, max: 60, target: 30, mode: 'once', restartSerial: 0 });
  return {
    version: 1, name: 'Brazo de pruebas', section: 'control', scene: 'arm', pieces,
    selectedIds: ['servo-1'], selectionMode: 'piece', tool: 'select', blueprint: null,
    mechanisms: {
      'rotor-1': { type: 'rotor', status: 'stopped', direction: 1, speed: 30, force: 320, torque: 3.2, capacity: 256, restartSerial: 0 },
      'servo-1': servo('pivot'), 'servo-2': servo('hinge'),
      'drone-1': { type: 'drone', status: 'stopped', direction: 1, speed: 0, height: .5, heading: 0, restartSerial: 0 }
    },
    families: [],
    route: { ownerId: 'drone-1', loop: false, speed: .5, status: 'stopped', selectedPointId: 'point-1', points: [
      { id: 'point-1', x: -1.6, z: -.8, height: .65, action: 'pass', wait: 0 },
      { id: 'point-2', x: .8, z: -1.5, height: .9, action: 'wait', wait: 2 },
      { id: 'point-3', x: 1.6, z: .9, height: .65, action: 'pass', wait: 0 }
    ] },
    serial: 1, notice: '', revision: 0
  };
}
export function getSelection(state) {
  const ids = new Set(state.selectedIds);
  return state.pieces.filter(p => ids.has(p.id));
}
export function getCapabilities(state) {
  const selection = getSelection(state), mechanisms = selection.filter(p => state.mechanisms[p.id]);
  const families = selection.filter(p => p.type === 'family');
  const anyRunning = mechanisms.some(p => state.mechanisms[p.id].status === 'running');
  const count = selection.length, editable = count > 0 && !anyRunning && state.route.status !== 'running';
  const reason = count ? anyRunning ? 'Detén el mecanismo para modificarlo.' : state.route.status === 'running' ? 'Detén la prueba del recorrido.' : '' : 'Selecciona una pieza o un conjunto.';
  return {
    count, type: count === 1 ? selection[0].type : count ? 'assembly' : 'none',
    mechanismIds: mechanisms.map(p => p.id), anyRunning,
    canMove: editable, canRotate: editable, canDelete: editable,
    canGroup: editable && count > 1 && !families.length && !selection.some(p => p.type === 'drone') && count <= 100,
    canUngroup: editable && families.length === 1 && count === 1,
    canDuplicate: editable && !families.length && !selection.some(p => p.type === 'drone'),
    canStart: mechanisms.length > 0 && !anyRunning,
    canStop: anyRunning,
    canRestart: mechanisms.length > 0,
    canReverse: mechanisms.length > 0 && !anyRunning && mechanisms.every(p => state.mechanisms[p.id].type !== 'drone'),
    canAdjust: mechanisms.length > 0 && !anyRunning,
    canBatteryControl: count === 1 && selection[0].type === 'battery',
    canFamilyColor: count === 1 && selection[0].type === 'family',
    canEditRoute: state.route.status !== 'running' && state.pieces.some(p => p.id === state.route.ownerId),
    reason, reasons: {
      group: count < 2 ? 'Selecciona al menos dos piezas.' : families.length ? 'Retira las piezas de la familia antes de agrupar.' : selection.some(p => p.type === 'drone') ? 'El dron conserva su trayectoria independiente.' : count > 100 ? 'Una familia admite hasta 100 piezas base.' : reason,
      ungroup: families.length !== 1 || count !== 1 ? 'Selecciona una familia para retirar sus piezas.' : reason,
      duplicate: families.length ? 'Retira primero las piezas de la familia.' : selection.some(p => p.type === 'drone') ? 'Este ejemplo conserva un único dron de recorrido.' : reason,
      adjust: !mechanisms.length ? 'Selecciona un rotor o un servo.' : anyRunning ? 'Detén el mecanismo para ajustar sus controles.' : ''
    }
  };
}
function routePointValid(p) {
  return plain(p) && validId(p.id) && ['x', 'z', 'height', 'wait'].every(k => inRange(p[k], PARAMS.route[k])) && ['pass', 'wait', 'land'].includes(p.action);
}
function mechanismValid(m) {
  if (!plain(m) || !['rotor', 'servo', 'drone'].includes(m.type) || !['stopped', 'running'].includes(m.status) || ![1, -1].includes(m.direction) || !validCounter(m.restartSerial)) return false;
  if (!Object.entries(PARAMS[m.type]).every(([key, limits]) => inRange(m[key], limits))) return false;
  if (m.type !== 'drone' && Math.abs(m.force - m.torque * 100) > 1e-8) return false;
  return m.type !== 'servo' || (['pivot', 'hinge'].includes(m.kind) && ['hold', 'once', 'repeat'].includes(m.mode) && m.min < m.max && m.target >= m.min && m.target <= m.max);
}
function pieceValid(p) {
  return plain(p) && validId(p.id) && validName(p.name) && ['cube', 'rotor', 'servo', 'battery', 'gripper', 'drone', 'family', 'pyramid', 'coupler'].includes(p.type) && (p.demoRole === undefined || DEMO_ROLES.includes(p.demoRole)) && (p.shape === undefined || ['cube', 'pyramid', 'tetra', 'coupler'].includes(p.shape)) && vector(p.position) && vector(p.rotation) && vector(p.size) && p.size.every(n => n > 0 && n < 100) && validId(p.groupId) && typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color) && (p.type !== 'family' || Number.isInteger(p.count) && p.count >= 1 && p.count <= 100) && (p.type !== 'battery' || finite(p.charge) && p.charge >= 0 && p.charge <= 1 && typeof p.enabled === 'boolean' && [1, 2, 3].includes(p.cells));
}
function snapshotValid(s) {
  if (!plain(s) || s.version !== 1 || !validName(s.name) || !['build', 'control', 'route', 'saves'].includes(s.section) || !['arm', 'drone'].includes(s.scene) || !['piece', 'assembly'].includes(s.selectionMode) || !['select', 'move', 'rotate', 'blueprint'].includes(s.tool) || typeof s.notice !== 'string' || s.notice.length > 500) return false;
  if (!Array.isArray(s.pieces) || s.pieces.length > 500 || !s.pieces.every(pieceValid) || new Set(s.pieces.map(p => p.id)).size !== s.pieces.length) return false;
  const ids = new Set(s.pieces.map(p => p.id));
  if (!Array.isArray(s.selectedIds) || s.selectedIds.some(id => !ids.has(id)) || new Set(s.selectedIds).size !== s.selectedIds.length) return false;
  if (s.blueprint !== null && (!plain(s.blueprint) || s.tool !== 'blueprint' || !Array.isArray(s.blueprint.ids) || !s.blueprint.ids.length || new Set(s.blueprint.ids).size !== s.blueprint.ids.length || s.blueprint.ids.some(id => !ids.has(id) || !s.selectedIds.includes(id)) || !vector(s.blueprint.offset) || !finite(s.blueprint.rotation) || Math.abs(s.blueprint.rotation) > 1000)) return false;
  if (!plain(s.mechanisms) || !Object.entries(s.mechanisms).every(([id, m]) => ids.has(id) && mechanismValid(m) && s.pieces.find(p => p.id === id).type === m.type)) return false;
  if (s.pieces.some(p => ['rotor', 'servo', 'drone'].includes(p.type) && (!Object.hasOwn(s.mechanisms, p.id) || s.mechanisms[p.id].type !== p.type))) return false;
  if (!Array.isArray(s.families) || !s.families.every(f => plain(f) && vector(f.origin) && ids.has(f.id) && s.pieces.find(p => p.id === f.id).type === 'family' && Array.isArray(f.pieces) && f.pieces.length > 0 && f.pieces.length <= 100 && s.pieces.find(p => p.id === f.id).count === f.pieces.length && f.pieces.every(p => pieceValid(p) && p.type !== 'family' && p.type !== 'drone' && !ids.has(p.id)) && plain(f.mechanisms) && Object.entries(f.mechanisms).every(([id, m]) => f.pieces.some(p => p.id === id && p.type === m.type) && mechanismValid(m)))) return false;
  if (new Set(s.families.map(f => f.id)).size !== s.families.length || s.families.some(f => f.pieces.some(p => ['rotor', 'servo'].includes(p.type) && !Object.hasOwn(f.mechanisms, p.id)))) return false;
  const inventoryIds = s.families.flatMap(f => f.pieces.map(p => p.id));
  if (new Set(inventoryIds).size !== inventoryIds.length || totalPieces(s) > 500) return false;
  if (s.pieces.filter(p => p.type === 'family').length !== s.families.length) return false;
  const r = s.route;
  if (!plain(r) || !validId(r.ownerId) || typeof r.loop !== 'boolean' || !inRange(r.speed, PARAMS.drone.speed) || !['stopped', 'running'].includes(r.status) || !Array.isArray(r.points) || r.points.length > 48 || !r.points.every(routePointValid) || new Set(r.points.map(p => p.id)).size !== r.points.length || !(r.selectedPointId === null || r.points.some(p => p.id === r.selectedPointId))) return false;
  const routeOwner = s.pieces.find(p => p.id === r.ownerId);
  if (routeOwner ? routeOwner.type !== 'drone' : r.points.length !== 0 || r.status !== 'stopped') return false;
  if (!validCounter(s.serial) || s.serial < 1 || !validCounter(s.revision)) return false;
  return true;
}
export function serializeDemo(state) {
  if (!snapshotValid(state)) throw new Error('No se puede guardar una demostración con datos inválidos.');
  const copy = clone(state);
  copy.tool = 'select'; copy.blueprint = null; copy.notice = ''; copy.route.status = 'stopped';
  for (const m of Object.values(copy.mechanisms)) m.status = 'stopped';
  return JSON.stringify({ format: DEMO_FORMAT, version: 1, state: copy });
}
export function restoreDemo(data) {
  let text;
  try { text = typeof data === 'string' ? data : JSON.stringify(data); } catch { throw new Error('El archivo no contiene una demostración válida.'); }
  if (typeof text !== 'string' || text.length > 1000000) throw new Error('La demostración supera el tamaño permitido.');
  let envelope;
  try { envelope = JSON.parse(text); } catch { throw new Error('El archivo no contiene una demostración válida.'); }
  if (!plain(envelope) || envelope.format !== DEMO_FORMAT || envelope.version !== 1 || !snapshotValid(envelope.state)) throw new Error('Este guardado no es compatible con Tablet 2.0.');
  const state = clone(envelope.state);
  state.tool = 'select'; state.blueprint = null; state.route.status = 'stopped'; state.notice = 'Demostración recuperada.';
  for (const m of Object.values(state.mechanisms)) m.status = 'stopped';
  return state;
}
function uid(state, prefix) {
  const used = new Set([...state.pieces.map(p => p.id), ...state.families.flatMap(f => f.pieces.map(p => p.id)), ...state.route.points.map(p => p.id)]);
  let id;
  do { state.serial = state.serial >= MAX_COUNTER ? 1 : state.serial + 1; id = `${prefix}-${state.serial}`; } while (used.has(id));
  return id;
}
function rotated(point, axis, angle) {
  const out = [...point], a = (axis + 1) % 3, b = (axis + 2) % 3, c = Math.cos(angle), s = Math.sin(angle);
  out[a] = point[a] * c - point[b] * s;
  out[b] = point[a] * s + point[b] * c;
  return out;
}
function setParam(m, key, value) {
  if (key === 'mode' && m.type === 'servo') {
    if (!['hold', 'once', 'repeat'].includes(value)) return false;
    m.mode = value; return true;
  }
  const limits = PARAMS[m.type]?.[key];
  if (!limits || !inRange(value, limits)) return false;
  if (key === 'force' || key === 'capacity') value = Math.round(value);
  const candidate = { ...m, [key]: value };
  if (key === 'force') candidate.torque = value / 100;
  if (key === 'torque') candidate.force = value * 100;
  if (!mechanismValid(candidate)) return false;
  Object.assign(m, candidate); return true;
}

export function createStore(initial = createInitialState()) {
  if (!snapshotValid(initial)) throw new Error('Estado inicial inválido.');
  let state = freeze(clone(initial));
  const listeners = new Set();
  const reject = reason => ({ ok: false, changed: false, reason, state });
  const publish = next => {
    next.revision = state.revision >= MAX_COUNTER ? 0 : state.revision + 1; state = freeze(next);
    for (const listener of [...listeners]) listener(state);
    return { ok: true, changed: true, state };
  };
  function dispatch(action) {
    if (!plain(action) || typeof action.type !== 'string') return reject('Acción no disponible.');
    if (action.type === 'RESET') return publish(createInitialState());
    if (action.type === 'RESTORE') {
      try { return publish(restoreDemo(action.data)); } catch (error) { return reject(error.message); }
    }
    const next = clone(state), selected = getSelection(next), caps = getCapabilities(next);
    next.notice = '';
    const targets = () => action.id ? Object.hasOwn(next.mechanisms, action.id) ? [next.mechanisms[action.id]] : [] : selected.map(p => next.mechanisms[p.id]).filter(Boolean);
    const requireEditable = () => caps.canMove;
    switch (action.type) {
      case 'SET_SECTION': {
        if (!['build', 'control', 'route', 'saves'].includes(action.section)) return reject('Sección no disponible.');
        if (state.section === action.section) return { ok: true, changed: false, state };
        next.section = action.section;
        if (action.section === 'route') { next.scene = 'drone'; next.selectedIds = next.pieces.some(p => p.id === next.route.ownerId) ? [next.route.ownerId] : []; }
        else if (action.section !== 'saves' && next.scene === 'drone') { next.scene = 'arm'; next.selectedIds = next.pieces.some(p => p.id === 'servo-1') ? ['servo-1'] : []; }
        next.tool = 'select'; next.blueprint = null;
        break;
      }
      case 'SELECT': {
        const p = next.pieces.find(p => p.id === action.id); if (!p) return reject('La pieza ya no está en la demostración.');
        const ids = next.selectionMode === 'assembly' && p.groupId !== 'loose' ? next.pieces.filter(q => q.groupId === p.groupId).map(q => q.id) : [p.id];
        next.selectedIds = action.additive ? ids.every(id => next.selectedIds.includes(id)) ? next.selectedIds.filter(id => !ids.includes(id)) : [...new Set([...next.selectedIds, ...ids])] : ids;
        next.blueprint = null; next.tool = 'select'; break;
      }
      case 'SELECT_ALL': next.selectedIds = next.pieces.filter(p => next.scene === 'drone' ? p.groupId === 'drone' : p.groupId !== 'drone').map(p => p.id); next.blueprint = null; next.tool = 'select'; break;
      case 'CLEAR_SELECTION': next.selectedIds = []; next.blueprint = null; next.tool = 'select'; break;
      case 'SET_SELECTION_MODE': {
        if (!['piece', 'assembly'].includes(action.mode)) return reject('Modo de selección no disponible.');
        next.selectionMode = action.mode;
        if (action.mode === 'assembly' && selected.length) {
          const groups = new Set(selected.map(p => p.groupId).filter(id => id !== 'loose'));
          next.selectedIds = [...new Set([...next.selectedIds, ...next.pieces.filter(p => groups.has(p.groupId)).map(p => p.id)])];
        }
        if (action.mode === 'piece' && selected.length > 1) next.selectedIds = [selected[0].id];
        next.blueprint = null; break;
      }
      case 'SET_TOOL': {
        if (!['select', 'move', 'rotate', 'blueprint'].includes(action.tool)) return reject('Herramienta no disponible.');
        if (action.tool !== 'select' && !requireEditable()) return reject(caps.reason);
        next.tool = action.tool;
        next.blueprint = action.tool === 'blueprint' ? { ids: [...next.selectedIds], offset: [1.2, 0, .6], rotation: 0 } : null;
        break;
      }
      case 'MOVE': {
        if (!requireEditable()) return reject(caps.reason);
        if (!vector(action.delta)) return reject('Desplazamiento inválido.');
        for (const p of selected) p.position = p.position.map((n, i) => n + action.delta[i]);
        next.notice = 'Posición de prueba actualizada.'; break;
      }
      case 'ROTATE': {
        if (!requireEditable()) return reject(caps.reason);
        if (!['x', 'y', 'z'].includes(action.axis) || !finite(action.degrees)) return reject('Orientación inválida.');
        const axis = ['x', 'y', 'z'].indexOf(action.axis), angle = action.degrees * Math.PI / 180;
        const center = selected.reduce((sum, p) => sum.map((n, i) => n + p.position[i] / selected.length), [0, 0, 0]);
        for (const p of selected) {
          p.rotation[axis] += angle;
          p.position = rotated(p.position.map((n, i) => n - center[i]), axis, angle).map((n, i) => n + center[i]);
        }
        next.notice = 'Orientación de prueba actualizada.'; break;
      }
      case 'PLACE_BLUEPRINT': {
        if (!next.blueprint || !requireEditable()) return reject('Activa primero la guía de colocación.');
        for (const p of selected) p.position = p.position.map((n, i) => n + next.blueprint.offset[i]);
        next.blueprint = null; next.tool = 'select'; next.notice = 'Colocación de prueba confirmada.'; break;
      }
      case 'BLUEPRINT_MOVE': {
        if (!next.blueprint || !requireEditable()) return reject('Activa primero la guía de colocación.');
        if (!vector(action.delta)) return reject('Desplazamiento de guía inválido.');
        const offset = next.blueprint.offset.map((n, i) => n + action.delta[i]);
        if (!vector(offset)) return reject('La guía ha alcanzado el límite del visor de prueba.');
        next.blueprint.offset = offset; next.notice = 'Guía desplazada. Confirma para colocar las piezas.'; break;
      }
      case 'CANCEL_BLUEPRINT': next.blueprint = null; next.tool = 'select'; next.notice = 'Colocación cancelada.'; break;
      case 'GROUP': {
        if (!caps.canGroup) return reject(caps.reasons.group || caps.reason);
        if (totalPieces(next) >= 500) return reject('Este visor de prueba admite hasta 500 piezas, incluido el contenido de las familias.');
        const name = action.name ?? 'Familia de prueba'; if (!validName(name)) return reject('Usa un nombre de 1 a 40 caracteres.');
        const id = uid(next, 'family'), position = selected.reduce((sum, p) => sum.map((n, i) => n + p.position[i] / selected.length), [0, 0, 0]);
        position[1] = .5;
        const mechanisms = {};
        for (const p of selected) if (next.mechanisms[p.id]) { mechanisms[p.id] = next.mechanisms[p.id]; mechanisms[p.id].status = 'stopped'; delete next.mechanisms[p.id]; }
        next.families.push({ id, origin: [...position], pieces: clone(selected), mechanisms: clone(mechanisms) });
        const ids = new Set(next.selectedIds);
        next.pieces = next.pieces.filter(p => !ids.has(p.id));
        next.pieces.push(piece(id, name.trim(), 'family', position, [.95, .95, .95], { groupId: id, color: '#567974', count: selected.length }));
        next.selectedIds = [id]; next.notice = `${selected.length} piezas guardadas en ${name.trim()}.`; next.blueprint = null; next.tool = 'select'; break;
      }
      case 'UNGROUP': {
        if (!caps.canUngroup) return reject(caps.reasons.ungroup || caps.reason);
        const family = next.families.find(f => f.id === selected[0].id); if (!family) return reject('La familia no está disponible.');
        const recovered = clone(family.pieces), container = selected[0], origin = family.origin ?? container.position;
        for (const p of recovered) {
          if (container.rotation.every(n => n === 0)) {
            p.position = p.position.map((n, i) => n + (container.position[i] - origin[i]));
            continue;
          }
          let relative = p.position.map((n, i) => n - origin[i]);
          for (let axis = 0; axis < 3; axis++) relative = rotated(relative, axis, container.rotation[axis]);
          p.position = relative.map((n, i) => n + container.position[i]);
          p.rotation = p.rotation.map((n, i) => n + container.rotation[i]);
        }
        next.pieces = next.pieces.filter(p => p.id !== family.id).concat(recovered);
        Object.assign(next.mechanisms, clone(family.mechanisms)); next.families = next.families.filter(f => f.id !== family.id); next.selectedIds = family.pieces.map(p => p.id);
        next.notice = 'Piezas recuperadas con su identidad y sus ajustes.'; break;
      }
      case 'DUPLICATE': {
        if (!caps.canDuplicate) return reject(caps.reasons.duplicate || caps.reason);
        if (totalPieces(next) + selected.length > 500) return reject('Este visor de prueba admite hasta 500 piezas, incluido el contenido de las familias.');
        const groupIds = new Map(), copies = selected.map(p => {
          const copy = clone(p), id = uid(next, p.type);
          copy.id = id; copy.position[0] += 2.8; copy.position[2] += .5;
          if (copy.groupId !== 'loose') { if (!groupIds.has(copy.groupId)) groupIds.set(copy.groupId, uid(next, 'assembly')); copy.groupId = groupIds.get(copy.groupId); }
          if (copy.type === 'battery') copy.charge = 0;
          if (next.mechanisms[p.id]) next.mechanisms[id] = { ...clone(next.mechanisms[p.id]), status: 'stopped' };
          return copy;
        });
        next.pieces.push(...copies); next.selectedIds = copies.map(p => p.id); next.notice = 'Copia creada. Las baterías copiadas comienzan vacías.'; break;
      }
      case 'DELETE': {
        if (!caps.canDelete) return reject(caps.reason);
        const ids = new Set(next.selectedIds); next.pieces = next.pieces.filter(p => !ids.has(p.id));
        for (const id of ids) delete next.mechanisms[id];
        next.families = next.families.filter(f => !ids.has(f.id));
        if (ids.has(next.route.ownerId)) { next.route.status = 'stopped'; next.route.points = []; next.route.selectedPointId = null; }
        next.selectedIds = []; next.tool = 'select'; next.blueprint = null; next.notice = 'Selección eliminada de esta demostración.'; break;
      }
      case 'RENAME': {
        if (!validName(action.name)) return reject('Usa un nombre de 1 a 40 caracteres.');
        if (selected.length === 1 && selected[0].type === 'family') selected[0].name = action.name.trim();
        else next.name = action.name.trim();
        next.notice = 'Nombre actualizado.'; break;
      }
      case 'SET_BATTERY': {
        const batteries = action.id ? next.pieces.filter(p => p.id === action.id && p.type === 'battery') : selected.filter(p => p.type === 'battery');
        if (batteries.length !== 1 || typeof action.enabled !== 'boolean') return reject('Selecciona una batería y el estado de su interruptor.');
        batteries[0].enabled = action.enabled;
        next.notice = `Interruptor de la batería ${action.enabled ? 'encendido' : 'apagado'}. La carga se conserva.`; break;
      }
      case 'FAMILY_COLOR': {
        const family = action.id ? next.pieces.find(p => p.id === action.id && p.type === 'family') : selected.length === 1 && selected[0].type === 'family' ? selected[0] : null;
        if (!family || typeof action.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(action.color)) return reject('Selecciona una familia y un color válido.');
        family.color = action.color.toLowerCase(); next.notice = 'Color de la familia actualizado.'; break;
      }
      case 'MECHANISM': {
        const motors = targets(); if (!motors.length) return reject('Selecciona un mecanismo.');
        if (!['start', 'stop', 'restart', 'reverse'].includes(action.command)) return reject('Control no disponible.');
        if (action.command === 'reverse' && motors.some(m => m.status === 'running' || m.type === 'drone')) return reject('Detén el rotor o el servo antes de cambiar el sentido.');
        for (const m of motors) {
          if (action.command === 'start') m.status = 'running';
          if (action.command === 'stop') m.status = 'stopped';
          if (action.command === 'restart') { m.status = 'running'; m.restartSerial = m.restartSerial >= MAX_COUNTER ? 0 : m.restartSerial + 1; }
          if (action.command === 'reverse') {
            m.direction *= -1;
            // Original servo-panel invert reverses the target as well as the
            // repeat direction. A one-shot servo must move to the other side.
            if (m.type === 'servo') m.target = Math.max(m.min, Math.min(m.max, -m.target));
          }
        }
        next.notice = { start: 'Vista previa en marcha.', stop: 'Mecanismo detenido.', restart: 'Vista previa reiniciada desde su posición inicial.', reverse: 'Sentido de movimiento invertido.' }[action.command]; break;
      }
      case 'SET_PARAM':
      case 'SET_PRESET': {
        const motors = targets(); if (!motors.length) return reject('Selecciona un mecanismo.');
        if (motors.some(m => m.status === 'running')) return reject('Detén el mecanismo para ajustar sus controles.');
        for (const m of motors) {
          const value = action.type === 'SET_PRESET' ? PARAMS[m.type]?.[action.key]?.presets?.[action.preset] : action.value;
          if (!setParam(m, action.key, value)) return reject('El ajuste no es válido para esta pieza o sus límites actuales.');
        }
        next.notice = 'Ajuste aplicado. El mecanismo sigue detenido.'; break;
      }
      case 'ROUTE_SELECT': {
        if (!next.route.points.some(p => p.id === action.id)) return reject('Punto no disponible.');
        next.route.selectedPointId = action.id; break;
      }
      case 'ROUTE_ADD': {
        if (!caps.canEditRoute) return reject('Detén la prueba antes de editar el recorrido.');
        if (next.route.points.length >= 48) return reject('El recorrido admite hasta 48 puntos.');
        const last = next.route.points.at(-1), point = { id: uid(next, 'point'), x: last ? Math.min(28, last.x + .6) : 0, z: last ? Math.min(28, last.z + .4) : 0, height: .65, action: 'pass', wait: 0, ...action.point };
        point.id = `point-${next.serial}`;
        if (!routePointValid(point)) return reject('Revisa posición, altura y espera del punto.');
        next.route.points.push(point); next.route.selectedPointId = point.id; next.notice = 'Punto añadido al final del recorrido.'; break;
      }
      case 'ROUTE_UPDATE': {
        if (!caps.canEditRoute) return reject('Detén la prueba antes de editar el recorrido.');
        const p = next.route.points.find(p => p.id === action.id); if (!p || !plain(action.patch) || Object.keys(action.patch).some(k => !['x', 'z', 'height', 'action', 'wait'].includes(k))) return reject('Punto o ajuste no disponible.');
        const updated = { ...p, ...action.patch };
        if (!routePointValid(updated)) return reject('Usa coordenadas entre −28 y 28 m, altura de 0,15 a 3 m y espera de 0 a 120 s.');
        Object.assign(p, updated); next.route.selectedPointId = p.id; next.notice = 'Punto actualizado.'; break;
      }
      case 'ROUTE_DELETE': {
        if (!caps.canEditRoute) return reject('Detén la prueba antes de editar el recorrido.');
        const id = action.id ?? next.route.selectedPointId, index = next.route.points.findIndex(p => p.id === id); if (index < 0) return reject('Selecciona un punto.');
        next.route.points.splice(index, 1); next.route.selectedPointId = next.route.points[Math.min(index, next.route.points.length - 1)]?.id ?? null; next.notice = 'Punto eliminado. Se conserva el orden de los restantes.'; break;
      }
      case 'ROUTE_LOOP': {
        if (!caps.canEditRoute) return reject('Detén la prueba antes de editar el recorrido.');
        if (typeof action.loop !== 'boolean') return reject('Modo de recorrido inválido.');
        next.route.loop = action.loop; break;
      }
      case 'ROUTE_SPEED': {
        if (!caps.canEditRoute) return reject('Detén la prueba antes de editar el recorrido.');
        if (!inRange(action.value, PARAMS.drone.speed)) return reject('Velocidad fuera del rango del dron.');
        next.route.speed = action.value; break;
      }
      case 'ROUTE_RUN': {
        if (!next.pieces.some(p => p.id === next.route.ownerId)) return reject('Recupera el dron de prueba para ejecutar su recorrido.');
        if (!next.route.points.length) return reject('Añade al menos un punto para probar el recorrido.');
        next.route.status = 'running'; next.notice = next.route.speed === 0 ? 'Prueba en marcha. Velocidad automática del recorrido: 0,5 m/s, como en el dron original.' : 'Prueba visual del recorrido en marcha.'; break;
      }
      case 'ROUTE_STOP': next.route.status = 'stopped'; next.notice = 'Prueba del recorrido detenida.'; break;
      default: return reject('Acción no disponible en esta demostración.');
    }
    if (!snapshotValid(next)) return reject('El cambio no es válido para esta demostración.');
    return publish(next);
  }
  return Object.freeze({ getState: () => state, dispatch, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } });
}
