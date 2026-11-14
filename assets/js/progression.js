(function (root, factory) {
  'use strict';
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.QBitsProgression = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Provisional campaign balance, in N m. These caps only permit a setting;
  // unlocking a tier never changes an existing motor's force or efficiency.
  // The unrestricted test bank continues to use QBitsRotorPower.LIMITS.
  const TIERS = Object.freeze({
    1: Object.freeze({ tier: 1, label: 'Torque I', maxTorque: .4, unlockLevel: 0,
      description: 'Hasta 0,40 N·m. Calibración inicial para aprender a girar y sostener una carga.' }),
    2: Object.freeze({ tier: 2, label: 'Torque II', maxTorque: .65, unlockLevel: 16,
      description: 'Hasta 0,65 N·m. Se obtiene al completar el nivel 16. Exigir más fuerza aumenta el consumo del motor.' }),
    3: Object.freeze({ tier: 3, label: 'Torque III', maxTorque: 1, unlockLevel: 18,
      description: 'Hasta 1,00 N·m. Se obtiene al completar el nivel 18. La energía y la capacidad de carga siguen limitando el mecanismo.' })
  });
  const DEFAULTS = Object.freeze({ tier: 1, maxTorque: .4 });
  const MIN_TORQUE = .02;
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const tierNumber = value => Number.isInteger(value) && value >= 1 && value <= 3 ? value : 1;
  const completed = (progress, level) => record(progress) && own(progress, 'level' + level) && progress['level' + level] === true;

  function availableTier(progress) {
    return completed(progress, 18) ? 3 : completed(progress, 16) ? 2 : 1;
  }

  function capFor(tier) {
    return TIERS[tierNumber(tier)].maxTorque;
  }

  function effectiveTier(requested, progress) {
    return Math.min(tierNumber(requested), availableTier(progress));
  }

  /** Normalize a player-selected limit without mutating a save or motor. */
  function normalize(input, progress) {
    input = record(input) ? input : DEFAULTS;
    const tier = effectiveTier(input.tier, progress);
    const requested = Number.isFinite(input.maxTorque) ? input.maxTorque : DEFAULTS.maxTorque;
    return { tier, maxTorque: Math.max(MIN_TORQUE, Math.min(capFor(tier), requested)) };
  }

  /** True only when a saved selection is valid as-is for this campaign. */
  function validate(input, progress) {
    if (!record(input) || !own(input, 'tier') || !own(input, 'maxTorque')) return false;
    if (!Number.isInteger(input.tier) || input.tier < 1 || input.tier > availableTier(progress)) return false;
    return Number.isFinite(input.maxTorque) && input.maxTorque >= MIN_TORQUE && input.maxTorque <= capFor(input.tier);
  }

  return Object.freeze({ TIERS, DEFAULTS, MIN_TORQUE, availableTier, capFor, effectiveTier, normalize, validate });
});
