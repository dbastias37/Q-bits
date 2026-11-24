// Reproduce scheduler decisions with the real game source and the existing
// headless harness. This does not run a browser or measure GPU/display FPS.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const createGame = require('../../../tests/game-harness.cjs');

const root = path.resolve(__dirname, '../../..');
const baseSha = '2786aa8617f1712fd38f03d84f6d971acc2fcac3';
const baselineSource = execFileSync('git', ['show', baseSha + ':assets/js/game.js'], {
  cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024
});
const currentSource = fs.readFileSync(path.join(root, 'assets/js/game.js'), 'utf8');
const sources = {baseline: baselineSource, current: currentSource};
const angularSpeed = 90;
const round = number => Math.round(number * 1e9) / 1e9;

function schedulerHash(source) {
  const match = source.match(/function visualFrameDue\(time,fps\)\{[\s\S]*?\n\}/);
  if (!match) throw new Error('Cannot identify the visualFrameDue source');
  return crypto.createHash('sha256').update(match[0]).digest('hex');
}

function metrics(times, durationMs) {
  const gaps = times.slice(1).map((time, index) => time - times[index]);
  const maxGap = gaps.length ? Math.max(...gaps) : 0;
  return {
    count: times.length,
    duration_ms: durationMs,
    first_presentation_ms: times.length ? round(times[0]) : null,
    last_presentation_ms: times.length ? round(times.at(-1)) : null,
    max_gap_ms: round(maxGap),
    max_hypothetical_angular_step_deg_at_90_deg_per_s: round(maxGap * angularSpeed / 1000)
  };
}

function run(source, refreshHz, cap, jitterMs, seconds = 10) {
  const {t} = createGame({gameSource: source});
  const presented = [];
  const samples = refreshHz * seconds;
  for (let sample = 1; sample <= samples; sample++) {
    const time = sample * 1000 / refreshHz + (sample % 2 ? jitterMs : -jitterMs);
    if (t.visualFrameDue(time, cap)) presented.push(time);
  }
  return {t, metrics: metrics(presented, seconds * 1000), presented, samples};
}

const configurations = [
  [60, 60, 0], [60, 60, .6], [60, 60, 1], [60, 60, 2],
  [120, 120, .6], [120, 120, 2], [120, 60, .6],
  [144, 60, 0], [165, 120, 0], [165, 120, 2],
  [144, 120, 2], [90, 60, 4], [75, 30, 0]
];

const cases = configurations.map(([refreshHz, cap, jitterMs]) => {
  if (jitterMs * 2 >= 1000 / refreshHz) throw new Error('Synthetic callbacks must remain monotonic');
  const result = {
    id: `${refreshHz}hz_cap${cap}_jitter${String(jitterMs).replace('.', '_')}ms`,
    nominal_refresh_hz: refreshHz,
    configured_cap: cap,
    alternating_timestamp_jitter_ms: jitterMs,
    sample_count: refreshHz * 10,
    nominal_duration_ms: 10000,
    last_callback_ms: round(10000 - jitterMs)
  };
  for (const [name, source] of Object.entries(sources)) result[name] = run(source, refreshHz, cap, jitterMs).metrics;
  return result;
});

const pauseCases = [30, 60, 120].map(cap => {
  const resumeAt = 15000;
  const offsets = [0, 0, .1, .2, .5, 1, 1000 / cap];
  const result = {
    id: `144hz_cap${cap}_long_pause`,
    nominal_refresh_hz_before_pause: 144,
    configured_cap: cap,
    warmup_duration_ms: 3000,
    resumed_at_ms: resumeAt,
    probe_offsets_ms: offsets.map(round),
    note: 'The repeated timestamp and submillisecond probes check that missed frames are not replayed. The intentional pause is excluded from the post-resume gap and angular-step metrics.'
  };
  for (const [name, source] of Object.entries(sources)) {
    const warmup = run(source, 144, cap, 0, 3);
    const decisions = offsets.map(offset => warmup.t.visualFrameDue(resumeAt + offset, cap));
    const resumedTimes = offsets.filter((_, index) => decisions[index]);
    result[name] = {
      warmup: warmup.metrics,
      decisions,
      renders_during_duplicate_and_early_probes: decisions.slice(1, -1).filter(Boolean).length,
      post_resume: metrics(resumedTimes, round(offsets.at(-1)))
    };
  }
  return result;
});

const report = {
  base_sha: baseSha,
  measured_at_utc: new Date().toISOString(),
  reproduction_command: 'node docs/mediciones/camera-20261124/measure.cjs',
  harness: 'tests/game-harness.cjs: real game source with DOM/GPU stubs',
  scope: 'Synthetic timestamp inputs to visualFrameDue. Counts are presentation decisions, not measured browser or GPU FPS. No visual play session is certified.',
  source_identification: {
    baseline_scheduler_sha256: schedulerHash(baselineSource),
    current_scheduler_sha256: schedulerHash(currentSource),
    note: 'Only visualFrameDue is hashed; changes to unrelated input-capture code do not change these hashes.'
  },
  metric_definitions: {
    count: 'Number of callbacks for which the actual game scheduler returns true.',
    duration_ms: 'Nominal input window; alternating jitter can place its last callback slightly before this boundary.',
    max_gap_ms: 'Largest gap between consecutive callbacks accepted for presentation; excludes time before the first accepted callback.',
    hypothetical_angular_step: 'Derived, not observed: max_gap_ms * 90 degrees/second / 1000. Assumes a constant hypothetical turn and is not a measured camera angle.',
    callback_formula: 'sample * 1000 / nominal_refresh_hz + (sample % 2 ? jitter_ms : -jitter_ms)'
  },
  cases,
  pause_cases: pauseCases
};

const output = path.join(__dirname, 'pacing.json');
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
process.stdout.write(`Saved ${cases.length} cadence cases and ${pauseCases.length} pause cases to docs/mediciones/camera-20261124/pacing.json\n`);
