/**
 * A top-view timeline for the existing drone route data, not a flight simulator.
 * Horizontal travel is projected at the requested speed; `wait` and `land`
 * pause for point.wait and then continue, as flightGuidance does. Landing does
 * not terminate a route. Height is retained by the route editor but vertical
 * ascent/descent duration, acceleration, collisions and energy are NOT simulated.
 */
const ORIGIN = Object.freeze({ x: 0, z: 0 });
const EPSILON = 1e-10;

export function buildRouteTimeline(route) {
  if (!route || !Array.isArray(route.points) || route.points.length > 48) throw new Error('Recorrido no válido.');
  const speed = route.speed === 0 || route.speed === undefined ? .5 : route.speed;
  if (!Number.isFinite(speed) || speed <= 0 || speed > 1.2) throw new Error('Velocidad de recorrido no válida.');
  const points = route.points.map(p => {
    if (!p || ![p.x, p.z, p.wait].every(Number.isFinite) || Math.abs(p.x) > 28 || Math.abs(p.z) > 28 || p.wait < 0 || p.wait > 120 || !['pass', 'wait', 'land'].includes(p.action)) throw new Error('Punto de recorrido no válido.');
    return { x: p.x, z: p.z, wait: p.wait, action: p.action };
  });
  const loop = route.loop === true && points.length > 0;
  const segments = [];
  let duration = 0, previous = ORIGIN, loopStart = null;
  function append(from, to, seconds, pointIndex, phase) {
    segments.push({ start: duration, duration: seconds, from: { x: from.x, z: from.z }, to: { x: to.x, z: to.z }, pointIndex, phase });
    duration += seconds;
  }
  points.forEach((point, index) => {
    append(previous, point, Math.hypot(point.x - previous.x, point.z - previous.z) / speed, index, 'travel');
    if (index === 0 && loop) loopStart = duration;
    if (point.action === 'wait' || point.action === 'land') append(point, point, point.wait, index, point.action);
    previous = point;
  });
  // The closing edge ends upon arrival at point 1. Its pause belongs to the
  // start of the next cycle, avoiding a second wait at the same visit.
  if (loop) append(previous, points[0], Math.hypot(points[0].x - previous.x, points[0].z - previous.z) / speed, 0, 'travel');
  return { duration, segments, loopStart, loop, origin: { ...ORIGIN }, end: { x: previous.x, z: previous.z }, pointCount: points.length };
}

export function sampleRouteTimeline(timeline, elapsed) {
  const seconds = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  if (!timeline.pointCount) return { ...ORIGIN, finished: true, pointIndex: -1, phase: 'finished' };
  if (!timeline.loop && seconds >= timeline.duration) return { ...timeline.end, finished: true, pointIndex: timeline.pointCount - 1, phase: 'finished' };
  let at = seconds;
  if (timeline.loop && seconds >= timeline.duration) {
    const cycle = timeline.duration - timeline.loopStart;
    if (cycle <= EPSILON) {
      const point = timeline.segments[0]?.to || timeline.end;
      return { x: point.x, z: point.z, finished: false, pointIndex: 0, phase: 'stationary' };
    }
    at = timeline.loopStart + ((seconds - timeline.loopStart) % cycle);
  }
  // Strict upper bound transfers boundary instants to the next phase. Empty
  // segments represent instantaneous visits and cannot trap a zero-length loop.
  const segment = timeline.segments.find(s => s.duration > 0 && at >= s.start && at < s.start + s.duration);
  if (!segment) {
    const point = timeline.loop ? timeline.segments[0]?.to || timeline.end : timeline.end;
    return { x: point.x, z: point.z, finished: !timeline.loop, pointIndex: timeline.loop ? 0 : timeline.pointCount - 1, phase: timeline.loop ? 'stationary' : 'finished' };
  }
  const t = Math.min(1, Math.max(0, (at - segment.start) / segment.duration));
  return {
    x: segment.from.x + (segment.to.x - segment.from.x) * t,
    z: segment.from.z + (segment.to.z - segment.from.z) * t,
    finished: false, pointIndex: segment.pointIndex, phase: segment.phase
  };
}
