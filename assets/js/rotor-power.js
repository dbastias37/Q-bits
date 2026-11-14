(function (root, factory) {
  'use strict';
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.QBitsRotorPower = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULTS = Object.freeze({ rpm: 30, maxTorque: .4, capacity: 16 });
  const LIMITS = Object.freeze({
    rpm: Object.freeze([1, 120]),
    maxTorque: Object.freeze([.02, 4]),
    capacity: Object.freeze([2, 128])
  });
  // Gameplay calibration: each Enganche owns a 20 J reservoir, represented by
  // its existing 0..1 energy bar. Both sides supply the motor equally. Ordinary
  // attached Q-bits add load, not battery capacity. This is an explicit motor
  // model, not a specification of a particular real-world motor or battery.
  const MODEL = Object.freeze({
    joulesPerSide: 20,
    idleWatts: .06,
    efficiency: .72,
    copperWattsPerTorqueSquared: 5,
    emptyEpsilon: 1e-6
  });
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
  function setting(value, key) {
    return clamp(finite(value, DEFAULTS[key]), LIMITS[key][0], LIMITS[key][1]);
  }

  /**
   * Evaluate one simulation step without modifying state.
   *
   * load/capacity use game weight units (1 u = a standard Q-bit), including both
   * Enganches and every rigid group connected through the mechanism network.
   * torque is N m; actualRpm is relative motion around the axle, not world spin.
   * Invalid/negative dt acts as a paused step. dt=0 can preview live demand and
   * preflight limits, but never spends energy. Disabled motors have no demand.
   * Energy is drawn equally; an exhausted side opens the circuit immediately.
   * There is no regenerative charging. Opposing or stalled effort still costs
   * energy through winding loss, even when mechanical output is zero.
   */
  function evaluate(state = {}, dt = 0) {
    state = state && typeof state === 'object' ? state : {};
    const seconds = Math.max(0, finite(dt, 0));
    const maxTorque = setting(state.maxTorque, 'maxTorque');
    const capacity = setting(state.capacity, 'capacity');
    const load = Math.max(0, finite(state.load, 0));
    // A geometric obstruction guard can stop the solver motor before it reports
    // torque. Explicitly stalled means its controller still demands holding
    // current at the configured limit; low RPM alone does not imply a stall.
    const torque = state.stalled ? maxTorque : Math.min(maxTorque, Math.abs(finite(state.actualTorque, 0)));
    // The simulation limits commanded speed to 120 RPM. This wider guard only
    // bounds corrupt/external measurements and keeps every power value finite.
    const rpm = state.stalled ? 0 : Math.min(10000, Math.abs(finite(state.actualRpm, 0)));
    const beforeA = clamp(finite(state.energyA, 0), 0, 1);
    const beforeB = clamp(finite(state.energyB, 0), 0, 1);
    let stopReason = !state.enabled ? null : load > capacity ? 'overload' : Math.min(beforeA, beforeB) <= MODEL.emptyEpsilon ? 'empty' : null;
    const powered = !!state.enabled && stopReason === null;
    const mechanicalWatts = powered ? torque * rpm * Math.PI * 2 / 60 : 0;
    const heatWatts = powered ? MODEL.copperWattsPerTorqueSquared * torque * torque : 0;
    const inputWatts = powered ? MODEL.idleWatts + heatWatts + mechanicalWatts / MODEL.efficiency : 0;
    const drainPerSecond = inputWatts / (MODEL.joulesPerSide * 2);
    const availableSeconds = drainPerSecond > 0 ? Math.min(beforeA, beforeB) / drainPerSecond : null;
    const suppliedSeconds = powered ? Math.min(seconds, availableSeconds) : 0;
    const exhausted = powered && seconds > 0 && seconds >= availableSeconds;
    const drainPerSide = powered ? exhausted ? Math.min(beforeA, beforeB) : Math.min(beforeA, beforeB, suppliedSeconds * drainPerSecond) : 0;
    const energyA = Math.max(0, beforeA - drainPerSide);
    const energyB = Math.max(0, beforeB - drainPerSide);
    if (exhausted) stopReason = 'empty';
    return {
      drainPerSide, drainPerSecond, energyA, energyB, suppliedSeconds,
      inputWatts, mechanicalWatts, heatWatts,
      spentJoules: drainPerSide * MODEL.joulesPerSide * 2,
      remainingSeconds: drainPerSecond > 0 ? Math.min(energyA, energyB) / drainPerSecond : state.enabled && stopReason === 'empty' ? 0 : null,
      load, capacity, maxTorque, loadRatio: load / capacity, torqueRatio: torque / maxTorque,
      stopReason
    };
  }

  return Object.freeze({ DEFAULTS, LIMITS, MODEL, evaluate });
});
