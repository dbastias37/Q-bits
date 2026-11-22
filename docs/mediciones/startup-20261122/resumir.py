#!/usr/bin/env python3
"""Aggregate saved startup evidence without running Node, the game, or profiles.

python3 resumir.py [DIRECTORY] [--require-all] [--output FILE] [--markdown FILE]
Reads JSON or gzip and writes aggregate.json / RESULTADOS.md deterministically.
"""
import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path
import statistics

BASELINE = '4fc563cc8d27e653129fc11a14524a7cfc626a5e'
BASELINE_GAME = 'c77f65c197f80f340f7f390a8d72155601589fb500bbb1014c0cbee3a3b97b4c'
OPTIMIZED_GAME = '847e7b1f99778315678478b01b7a781ecd3c2e1f0deab595e16446ecb9c52fed'
RUNNER_BEFORE_CLOCK_FIX = '6264fbd7b26e1d28e2c8d6f57cbc1b6914f21e6036b16d386bb528d1868465be'
RUNNER_BEFORE_ARM_FIX = '4f39e835035d4531468bd64256c8edbb8887c1f40a04916187ee70fab7912b71'
RUNNER_FINAL = '8965b491cd2f146928f06c74bbf8ca954c6659d720fe28e2dfa10e7afa062562'
SOURCE_PUBLICATION = {
    'gameCode': {'localCommit': 'e362708c4c9472133771394fd048541992ac29ae',
                 'publishedCommit': '4d7c128517e4951ba7acb56562e378a7ecaff904',
                 'tree': '71f18000064b816dc66b52424f338bb5920d92d4'},
    'armInstrumentFix': {'localCommit': '92192345317b06bca0c31f1a5860ecc1783c31a1',
                         'publishedCommit': '6dfc50c62dcf83a0cb20fa586f11e82d94a89ee6',
                         'tree': '46fcc530109139d871dfba962e21984e56f60923'},
}
REQUIRED = ('cold-60', 'cold-120', 'cold-240', 'cold-settle-120', 'controls-60', 'controls-120', 'controls-240',
            'matrix-operations', 'matrix-counts', 'settled-60', 'settled-120', 'settled-240', 'equivalence')
VARIANTS = ('baseline', 'optimized')


def digest(value):
    return hashlib.sha256(value).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def get(value, dotted):
    for key in dotted.split('.'):
        if isinstance(value, dict):
            value = value.get(key)
        elif isinstance(value, list) and key.isdigit() and int(key) < len(value):
            value = value[int(key)]
        else:
            return None
    return value


def stat(values):
    values = [v for v in values if finite(v)]
    return {'n': len(values), 'median': statistics.median(values) if values else None,
            'min': min(values) if values else None, 'max': max(values) if values else None, 'values': values}


def records(runs):
    for variant in VARIANTS:
        for i, run in enumerate(runs.get(variant, [])):
            yield variant, run.get('repetition', i + 1), run


def metric(runs, selector):
    read = selector if callable(selector) else lambda r: get(r, selector)
    values = {v: {r.get('repetition', i + 1): read(r) for i, r in enumerate(runs.get(v, []))} for v in VARIANTS}
    result = {v: stat(values[v].values()) for v in VARIANTS}
    paired = sorted(rep for rep in set(values['baseline']) & set(values['optimized'])
                    if finite(values['baseline'][rep]) and finite(values['optimized'][rep]))
    result['pairedOptimizedMinusBaseline'] = {'repetitions': paired, **stat([values['optimized'][rep] - values['baseline'][rep] for rep in paired])}
    result['medianDifference'] = (result['optimized']['median'] - result['baseline']['median']
                                  if all(result[v]['n'] for v in VARIANTS) else None)
    return result


def unique(values):
    result = {}
    for label, value in values:
        if value is not None:
            result.setdefault(canonical(value), {'runs': [], 'value': value})['runs'].append(label)
    return list(result.values())


def compact(value):
    if isinstance(value, dict):
        return {k: compact(v) for k, v in value.items() if k not in ('samples', 'wallSamples', 'cpuSamples', 'processCpuSamples', 'userSamples', 'systemSamples', 'checksums')}
    if isinstance(value, list):
        return [compact(v) for v in value]
    return value


def common(raw, repetitions):
    runs = raw.get('runs', {})
    result = {k: raw[k] for k in ('scenario', 'name', 'phase', 'pieces', 'bodies', 'hz', 'lastCompleted', 'identical', 'identicalFinalState', 'comparisons', 'stateSha256') if k in raw}
    result['complete'] = (raw.get('complete', True) is not False and not raw.get('stopped')
                          and all(len(runs.get(v, [])) == repetitions for v in VARIANTS)
                          and all(r.get('complete', True) is not False and not r.get('stopped') and not r.get('failure') for _, _, r in records(runs)))
    completed = {v: {r.get('repetition', i + 1) for i, r in enumerate(runs.get(v, []))
                     if r.get('complete', True) is not False and not r.get('stopped') and not r.get('failure')} for v in VARIANTS}
    result['completePairs'] = len(completed['baseline'] & completed['optimized'])
    # The old integrated runner certifies its final state only after all three
    # repetitions. A budget stop may leave finished timing pairs without that
    # certificate; never infer equivalence merely from equal sample counts.
    certificates = {c.get('repetition') for c in raw.get('comparisons', [])
                    if c.get('identicalFinalState') is True and c.get('identicalFrameClocksAndInventories') is True}
    if raw.get('identical') is True or raw.get('identicalFinalState') is True:
        certificates = completed['baseline'] & completed['optimized']
    result['certifiedEquivalentPairs'] = len(certificates & completed['baseline'] & completed['optimized'])
    result['completedPairsWithoutEquivalenceCertificate'] = result['completePairs'] - result['certifiedEquivalentPairs']
    result['availableRuns'] = {v: len(runs.get(v, [])) for v in VARIANTS}
    result['stops'] = [compact(raw['stopped'])] if raw.get('stopped') else []
    for variant, repetition, run in records(runs):
        if run.get('stopped') or run.get('failure'):
            result['stops'].append({'variant': variant, 'repetition': repetition, 'stopped': compact(run.get('stopped')), 'failure': run.get('failure'),
                                   **{k: compact(run[k]) for k in ('finalClock', 'finalInventory', 'workerElapsedMs', 'completedSamples', 'nativeOracleRoundsCompleted') if k in run}})
    for key in ('initial', 'initialInventory', 'afterGrowth', 'afterPriming', 'firstFrameInventory', 'final', 'finalInventory', 'clockBefore', 'clockAfter', 'clockDelta', 'finalClock', 'finalMatrices', 'memoryBeforeFrames', 'memoryAfterFrames', 'processMemoryAtExit', 'memoryAfterGrowth', 'memoryDuringPriming', 'memoryDuringMeasurement'):
        values = unique((f'{v}:{rep}', r.get(key)) for v, rep, r in records(runs))
        if values:
            result[key] = values
    if result['complete']:
        all_runs = [r for _, _, r in records(runs)]
        clocks = [r.get('clockDelta', {}) for r in all_runs]
        result['workBothVariants'] = {
            'framesOrRounds': sum(len(r['frames']) if isinstance(r.get('frames'), list) else r.get('completedSamples', get(r, 'wallMsPerSimulatedFrame.count') or 0) for r in all_runs),
            'physicsSteps': sum(c.get('physicsSteps', c.get('physics', 0)) for c in clocks),
            'simulatedSeconds': sum(c.get('simulatedSeconds', 0) for c in clocks),
            'droppedSeconds': sum(c.get('droppedSeconds', 0) for c in clocks),
        }
        if all('cannonSteps' in c for c in clocks):
            result['workBothVariants']['cannonSteps'] = sum(c['cannonSteps'] for c in clocks)
    return result


def startup_report(raw, repetitions):
    result = common(raw, repetitions); runs = raw.get('runs', {})
    result['unit'] = 'ms/synthetic-frame; fresh process per arm'
    fields = {'wallP50': 'statistics.wallMs.p50', 'wallP95': 'statistics.wallMs.p95', 'wallP99': 'statistics.wallMs.p99',
              'wallMean': 'statistics.wallMs.mean', 'framePeak': 'statistics.wallMs.max', 'processCpuMean': 'statistics.processCpuMs.mean',
              'timeToFirstFrame': 'workerTimeToFirstFrameMs', 'sceneToFirstFrame': 'sceneStartToFirstFrameMs',
              'frameWindow': 'frameWindow.wallMs', 'workerElapsed': 'workerElapsedMs', 'workerCpu': 'workerProcessCpuMs',
              'subprocessElapsed': 'subprocess.elapsedMs', 'parentOrchestrationCpu': 'subprocess.parentOrchestrationCpuMs'}
    result['metrics'] = {name: metric(runs, field) for name, field in fields.items()}
    result['setupStages'] = {stage: {field: metric(runs, f'stages.{stage}.{field}') for field in ('wallMs', 'processCpuMs', 'processUserMs', 'processSystemMs')}
                             for stage in ('sourceAndModules', 'harness', 'preferencesAndSceneReset', 'sceneCreation', 'finalStateCapture')}
    result['phaseStatistics'] = {phase: {
        **{f'wall{p.upper()}': metric(runs, f'statistics.phases.{phase}.wallMs.{p}') for p in ('p50', 'p95', 'p99')},
        'wallPeak': metric(runs, f'statistics.phases.{phase}.wallMs.max'),
        'processCpuMean': metric(runs, f'statistics.phases.{phase}.processCpuMs.mean'),
    } for phase in ('advance', 'liquids', 'targetQuery', 'renderPreparation')}
    result['setupMemoryDeltas'] = unique((f'{v}:{rep}', {k: s.get('memoryDelta') for k, s in r.get('stages', {}).items()}) for v, rep, r in records(runs))
    result['frames'] = []
    count = max((len(r.get('frames', [])) for _, _, r in records(runs)), default=0)
    for index in range(count):
        frames = {v: [{'repetition': r.get('repetition', i + 1), **r['frames'][index]} for i, r in enumerate(runs.get(v, [])) if len(r.get('frames', [])) > index] for v in VARIANTS}
        row = {'index': index + 1, 'wallMs': metric(frames, 'wallMs'), 'processCpuMs': metric(frames, 'processCpuMs'),
               'phases': {phase: {field: metric(frames, f'phases.{phase}.{field}') for field in ('wallMs', 'processCpuMs')}
                          for phase in ('advance', 'liquids', 'targetQuery', 'renderPreparation')}}
        for key in ('inventory', 'clockBefore', 'clockAfter', 'clockDelta', 'memoryDelta'):
            row[key] = unique((f'{v}:{rep}', r.get(key)) for v, rep, r in records(frames))
        result['frames'].append(row)
    result['peakFrames'] = [{'variant': v, 'repetition': rep, 'index': max(r['frames'], key=lambda f: f['wallMs'])['index']}
                            for v, rep, r in records(runs) if r.get('frames')]
    return result


def ordinary_report(raw, repetitions, kind):
    result = common(raw, repetitions); runs = raw.get('runs', {})
    if kind == 'counts':
        result['counts'] = []
        for variant, repetition, run in records(runs):
            row = {'variant': variant, 'repetition': repetition, 'completedSamples': run.get('completedSamples')}
            for stage in ('growthCounts', 'primingCounts', 'coldCounts', 'totalCounts'):
                if stage in run:
                    value = run[stage]
                    row[stage] = {k: x for k, x in value.items() if k != 'resizes'}
                    row[stage]['resizeEvents'] = len(value.get('resizes', []))
            a, b = run.get('coldCounts'), run.get('totalCounts')
            if a and b:
                row['measuredDelta'] = {k: b[k] - a[k] for k in ('numericReads', 'numericWrites', 'lengthReads', 'lengthWrites')}
                row['measuredDelta']['calls'] = {k: b['calls'][k] - a['calls'][k] for k in b['calls']}
                row['measuredDelta']['resets'] = b.get('resets', [])[len(a.get('resets', [])):]
            result['counts'].append(row)
        return result
    prefix = 'statistics.wallMs' if kind == 'operations' else 'wallMsPerSimulatedFrame'
    cpu = 'statistics.processCpuMs.mean' if kind == 'operations' else 'processCpuMsPerSimulatedFrame.mean'
    result['unit'] = 'ms/matrix-operation-round' if kind == 'operations' else 'ms/synthetic-frame; existing runner, see recorded phase'
    result['metrics'] = {f'wall{p.upper()}': metric(runs, prefix + '.' + p) for p in ('p50', 'p95', 'p99')}
    result['metrics'].update(processCpuMean=metric(runs, cpu), framePeak=metric(runs, prefix + '.max'))
    result['stageCosts'] = {stage: {field: metric(runs, f'{stage}.{field}') for field in ('wallMs', 'processCpuMs')}
                            for stage in ('growth', 'priming', 'cold') if any(get(r, stage) for _, _, r in records(runs))}
    return result


def equivalence(data):
    rows = []
    for raw in data.get('reports', []):
        row = {k: raw[k] for k in ('scenario', 'hz', 'identicalFinalState', 'stateSha256', 'stopped') if k in raw}
        row['identicalSummaries'] = raw.get('baseline') == raw.get('optimized')
        if row['identicalSummaries']:
            row['summaryBothVariants'] = raw.get('baseline')
        else:
            row.update(baseline=raw.get('baseline'), optimized=raw.get('optimized'))
        rows.append(row)
    return rows


def profile_summary(data):
    # These are single diagnostic captures, never folded into the three-pair
    # primary distributions. Keep counters, phase samples and GC separate.
    keep = ('identity', 'configuration', 'complete', 'stopped', 'failure', 'measuredWindowWallMs', 'gc', 'profileFile', 'profileTop', 'profileSamples',
            'initialInventory', 'finalInventory', 'clockBefore', 'clockAfter', 'clockDelta', 'finalStateSha256', 'finalStateCapture')
    return {**{k: data[k] for k in keep if k in data}, 'stages': data.get('stages', []), 'frames': data.get('frames', []), 'inclusiveBlocksMustNotBeSummed': True}


def read_input(directory, name):
    choices = []
    for suffix in ('.json', '.json.gz'):
        path = directory / (name + suffix)
        if path.exists():
            raw = path.read_bytes(); choices.append(gzip.decompress(raw) if suffix.endswith('.gz') else raw)
    if not choices:
        return None
    if len(choices) == 2 and choices[0] != choices[1]:
        raise ValueError(name + ': JSON/gzip decoded bytes differ')
    return json.loads(choices[0]), {'decodedBytes': len(choices[0]), 'decodedSha256': digest(choices[0])}


def validate_artifact_map(name, data, directory):
    # This metadata describes renames, not measured source. Validate the saved
    # experiment itself instead of inventing a commit for the rename operation.
    if directory is None or not isinstance(data.get('renamed'), dict) or not data['renamed']:
        raise ValueError(name + ': artifact map requires its evidence directory')
    validated_reports = []
    for original, destination in data['renamed'].items():
        target = directory / Path(destination).name
        if Path(original).parent != Path(destination).parent or not target.name.startswith('exploratory-'):
            raise ValueError(name + ': unexpected preserved artifact mapping')
        if not target.exists() and not target.with_name(target.name + '.gz').exists():
            raise ValueError(name + ': preserved artifact is missing: ' + target.name)
        if target.name.endswith('.json'):
            report_name = target.stem; report, _ = read_input(directory, report_name)
            validate_identity(report_name, report, 'experimental', directory)
            validate_startup_runner(report_name, report, 'experimental', directory)
            if not report.get('failure'):
                raise ValueError(name + ': mapped failure report has no recorded failure')
            validated_reports.append(report_name)
    if not validated_reports:
        raise ValueError(name + ': artifact map contains no preserved JSON report')
    return 'artifact-map; sources verified in ' + ', '.join(validated_reports)


def validate_startup_runner(name, data, category, directory=None):
    if data.get('mode') != 'cold-process-startup':
        return None
    config = data.get('configuration', {}); runner = config.get('benchmarkSha256')
    allowed = {RUNNER_BEFORE_ARM_FIX, RUNNER_FINAL}
    if category == 'experimental':
        allowed.add(RUNNER_BEFORE_CLOCK_FIX)
    if runner not in allowed:
        raise ValueError(name + ': unrecognized cold-runner source: ' + str(runner))
    if runner == RUNNER_BEFORE_CLOCK_FIX and (name != 'exploratory-prelength' or get(data, 'failure.message') != 'Cannon time agrees'):
        raise ValueError(name + ': pre-clock-fix runner is permitted only for its preserved failure')
    if category == 'main':
        if config.get('repetitions') != 3 or config.get('order') != 'AB/BA/AB':
            raise ValueError(name + ': principal cold evidence must have three AB/BA/AB pairs')
        if (not config.get('freshProcessPerArm') or config.get('warmup') != 0
                or config.get('nativeCannonTimeMultiplier') != 2 or not config.get('preferencesBeforeJoints')):
            raise ValueError(name + ': unexpected cold-process or physical-clock configuration')
        if 'few-articulated' in config.get('families', []) and config.get('activeArms'):
            if runner != RUNNER_FINAL or config.get('activeArmsStartMethod') != 'startRobotArm with existing poses and energy':
                raise ValueError(name + ': active-arm controls require the legal controller instrument')
    archived = {RUNNER_BEFORE_CLOCK_FIX: 'benchmark-startup-before-clock-fix.cjs',
                RUNNER_BEFORE_ARM_FIX: 'benchmark-startup-before-arm-fix.cjs'}.get(runner)
    if archived and directory is not None:
        source = directory / archived
        if not source.is_file() or digest(source.read_bytes()) != runner:
            raise ValueError(name + ': archived runner bytes do not match ' + archived)
    return {'sha256': runner, 'archivedSource': archived,
            'version': 'before-clock-fix' if runner == RUNNER_BEFORE_CLOCK_FIX else 'before-arm-fix' if runner == RUNNER_BEFORE_ARM_FIX else 'legal-arm-controller'}


def validate_identity(name, data, category, directory=None):
    sources = data.get('sources')
    if sources:
        base = sources.get('baseline', {}); commit = base.get('commit', base.get('headCommit'))
        game = base.get('gameSha256', base.get('files', {}).get('assets/js/game.js'))
        if commit != BASELINE or game != BASELINE_GAME or data.get('referenceCommit', BASELINE) != BASELINE:
            raise ValueError(f'{name}: wrong PR2 baseline: {commit}, {game}')
        if category in ('main', 'counts'):
            source = sources.get('optimized', {}); value = source.get('gameSha256', source.get('files', {}).get('assets/js/game.js'))
            if value != OPTIMIZED_GAME:
                raise ValueError(f'{name}: optimized source {value!r}, expected final measured {OPTIMIZED_GAME}')
        return 'commit-and-game-hash'
    identity = data.get('identity')
    if identity:
        if category == 'reference' and (identity.get('commit') != BASELINE or identity.get('gameSha256') != BASELINE_GAME):
            raise ValueError(name + ': reference profile source differs from the PR2 baseline')
        if category == 'diagnostic' and identity.get('gameSha256') != OPTIMIZED_GAME:
            raise ValueError(name + ': optimized profile source differs from final game')
        return 'profile-identity'
    if category == 'instrument':
        if 'renamed' in data:
            return validate_artifact_map(name, data, directory)
        if data.get('referenceCommit') != BASELINE:
            raise ValueError(name + ': wrong instrument reference')
        for row in data.get('reports', []):
            expected = {'baseline': BASELINE_GAME, 'optimized': OPTIMIZED_GAME}.get(row.get('variant'))
            if expected and row.get('gameSha256') != expected:
                raise ValueError(name + ': functional instrument check source differs')
        return 'reference-commit-only; instrument note'
    if data.get('gameSha256'):
        expected = BASELINE_GAME if category == 'reference' else OPTIMIZED_GAME
        if data['gameSha256'] != expected:
            raise ValueError(name + ': wrong standalone probe game hash')
        return 'game-hash-only; standalone probe did not record a commit'
    raise ValueError(name + ': evidence has no supported source identity')


def build(directory, require_all=False):
    names = set(REQUIRED)
    for path in directory.iterdir():
        if path.name.endswith(('.json', '.json.gz')):
            name = path.name.removesuffix('.gz').removesuffix('.json')
            if name.startswith(('cold-', 'controls-', 'control-', 'settled-', 'matrix-', 'reference-', 'optimized-', 'exploratory-', 'diagnostic-', 'instrument-')):
                names.add(name)
    result = {'schema': 1, 'referenceCommit': BASELINE, 'referenceGameSha256': BASELINE_GAME, 'expectedOptimizedGameSha256': OPTIMIZED_GAME,
              'sourcePublication': SOURCE_PUBLICATION,
              'requiredInputs': list(REQUIRED), 'missingRequiredInputs': [], 'inputs': {}, 'datasets': {},
              'method': 'Median/range of per-repetition statistics, with every paired optimized-minus-baseline difference retained. No pooled percentiles, no mixing cold/warm/profile data. Four-frame p95/p99 equal their maximum. Native Cannon world.time is a double-increment counter; game simTime and game/Cannon step counts verify actual simulated time. Reaggregation never runs the game.'}
    for name in [*REQUIRED, *sorted(names - set(REQUIRED))]:
        loaded = read_input(directory, name)
        if loaded is None:
            if name in REQUIRED:
                result['missingRequiredInputs'].append(name)
            continue
        data, info = loaded
        category = ('experimental' if name.startswith('exploratory-') else 'reference' if name.startswith('reference-') else
                    'instrument' if name.startswith('instrument-') else 'diagnostic' if name.startswith(('optimized-', 'diagnostic-')) else 'counts' if data.get('mode') == 'counts' else 'main')
        info['identityValidation'] = validate_identity(name, data, category, directory)
        runner_validation = validate_startup_runner(name, data, category, directory)
        if runner_validation:
            info['runnerValidation'] = runner_validation
        if name == 'exploratory-prelength':
            info['instrumentFailureKind'] = 'asserted native Cannon world.time equals actual simulated time'
        elif name == 'exploratory-controls-arm-failure':
            if get(data, 'failure.message') != 'start arm joint':
                raise ValueError(name + ': unexpected failure for the preserved arm-fixture attempt')
            info['instrumentFailureKind'] = 'shared fixture requested direct activation of controller-owned robot arm joints'
        info.update({k: data[k] for k in ('sources', 'identity', 'runtime', 'configuration', 'method', 'failure', 'probeSha256') if k in data})
        repetitions = data.get('configuration', {}).get('repetitions', 3)
        if data.get('mode') == 'cold-process-startup':
            kind = 'startup'; rows = [startup_report(row, repetitions) for row in data.get('reports', [])]
        elif data.get('mode') == 'equivalence':
            kind = 'equivalence'; rows = equivalence(data)
        elif data.get('mode') in ('matrix', 'timings', 'counts'):
            kind = {'matrix': 'steady', 'timings': 'operations', 'counts': 'counts'}[data['mode']]
            rows = [ordinary_report(row, repetitions, kind) for row in data.get('reports', [])]
        elif 'identity' in data and 'stages' in data:
            kind = 'profile'; rows = [profile_summary(data)]
        else:
            kind = 'instrument' if category == 'instrument' else 'elements-probe'; rows = [data]
        config = data.get('configuration', {})
        expected = (len(config.get('families', [])) * len(config.get('scales', [])) if kind in ('startup', 'steady') else
                    len(config.get('cases', [])) * len(config.get('scales', [])) if kind in ('operations', 'counts') else None)
        result['inputs'][name] = info
        result['datasets'][name] = {'category': category, 'kind': kind, 'expectedConfigurations': expected,
            'complete': not data.get('failure') and data.get('complete', True) is not False and (expected is None or len(rows) == expected) and all(row.get('complete', True) for row in rows), 'reports': rows}
    if require_all and result['missingRequiredInputs']:
        raise ValueError('Missing required inputs: ' + ', '.join(result['missingRequiredInputs']))
    result['totalsByCategory'] = {}
    for category in ('main', 'counts', 'diagnostic', 'reference', 'experimental', 'instrument'):
        datasets = [d for d in result['datasets'].values() if d['category'] == category]; rows = [r for d in datasets for r in d['reports']]
        totals = {'inputs': len(datasets), 'configurations': len(rows), 'completeConfigurations': sum(r.get('complete', True) for r in rows),
                  'completePairs': sum(r.get('completePairs', 0) for r in rows),
                  'certifiedEquivalentPairs': sum(r.get('certifiedEquivalentPairs', 0) for r in rows),
                  'completedPairsWithoutEquivalenceCertificate': sum(r.get('completedPairsWithoutEquivalenceCertificate', 0) for r in rows),
                  'equivalencePairs': sum(len(d['reports']) for d in datasets if d['kind'] == 'equivalence')}
        paired_work = [r['workBothVariants'] for r in rows if 'workBothVariants' in r]
        if paired_work:
            keys = ('framesOrRounds', 'physicsSteps', 'simulatedSeconds', 'droppedSeconds')
            totals['workBothVariantsInCompleteCases'] = {key: sum(w.get(key, 0) for w in paired_work) for key in keys}
            cannon_work = [w['cannonSteps'] for w in paired_work if 'cannonSteps' in w]
            if cannon_work:
                totals['cannonStepsWhereRecorded'] = sum(cannon_work)
        captures = [r for d in datasets if d['kind'] == 'profile' for r in d['reports'] if r.get('complete')]
        if captures:
            totals['workInCompleteDiagnosticCaptures'] = {'captures': len(captures), 'frames': sum(len(r.get('frames', [])) for r in captures),
                **{key: sum(r.get('clockDelta', {}).get(key, 0) for r in captures) for key in ('physicsSteps', 'cannonSteps', 'simulatedSeconds', 'droppedSeconds')}}
        result['totalsByCategory'][category] = totals
    return result


def fmt(value):
    return '—' if not finite(value) else f'{value:.6f}'


def pair(value):
    return fmt(value['baseline']['median']) + ' → ' + fmt(value['optimized']['median'])


def interval(value):
    return fmt(value['min']) + '–' + fmt(value['max'])


def label(row):
    return f"{row.get('scenario', row.get('name', 'caso'))} / {row.get('pieces', row.get('bodies', '—'))}" + (f" / {row['hz']} Hz" if 'hz' in row else '')


def timing_table(lines, rows):
    lines.extend(['| Caso | Pares ejecutados / con equivalencia | p50 A → B | p95 A → B | p99 A → B | Pico A → B | CPU media A → B | Rango pico A | Rango pico B | Δ pico B−A por pareja |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |'])
    for row in rows:
        m = row['metrics']; peak = m['framePeak']; delta = '; '.join(fmt(v) for v in peak['pairedOptimizedMinusBaseline']['values']) or '—'
        lines.append(f"| {label(row)}{' **incompleto**' if not row['complete'] else ''} | {row['completePairs']} / {row['certifiedEquivalentPairs']} | {pair(m['wallP50'])} | {pair(m['wallP95'])} | {pair(m['wallP99'])} | {pair(peak)} | {pair(m['processCpuMean'])} | {interval(peak['baseline'])} | {interval(peak['optimized'])} | {delta} |")
    lines.append('')


def markdown(result):
    lines = ['# Arranque de escenas: resultados reproducibles', '', f'Referencia PR2: `{BASELINE}`. A = referencia integrada del PR1; B = fuente de cada input. SHA final medido: `{OPTIMIZED_GAME}`.', '',
             'Todas las cifras de tiempos son milisegundos de Node con DOM/GPU simulados. Pared y CPU de proceso son magnitudes distintas; no son FPS ni porcentaje de CPU. Se muestran medianas de los estadísticos de cada repetición, rangos mínimo–máximo y diferencias pareadas B−A. No se mezclan muestras de procesos ni se suman fases inclusivas al total.', '',
             '**Ventanas frías de cuatro frames:** p95 y p99 son el máximo de esos cuatro frames, no una estimación de la cola de una partida larga. Cada brazo arranca un proceso nuevo, sin calentamiento ni snapshot previo. El sistema operativo conserva sus propias cachés. Los perfiles, experimentos y controles calientes están separados.', '',
             '**Reloj nativo:** Cannon 0.6.2 incrementa `world.time` en `internalStep(dt)` y `World.step(dt)`; `cannonSeconds` puede ser el doble del tiempo físico. La duración simulada se verifica con `simTime` y los pasos del juego/Cannon. La primera ejecución que falló por el assert incorrecto se conserva como fallo del instrumento.', '']
    if result['missingRequiredInputs']:
        lines.extend(['**Inputs pendientes:** ' + ', '.join(result['missingRequiredInputs']) + '.', ''])
    primary = result['totalsByCategory'].get('main', {})
    lines.extend([f"**Cobertura principal:** {primary.get('completePairs', 0)} pares ejecutados; {primary.get('certifiedEquivalentPairs', 0)} con equivalencia registrada y {primary.get('completedPairsWithoutEquivalenceCertificate', 0)} sin certificado final, más {primary.get('equivalencePairs', 0)} comparaciones funcionales independientes. Los pares ejecutados de un caso incompleto no se certifican por inferencia.", ''])
    for name, dataset in result['datasets'].items():
        rows = dataset['reports']; kind = dataset['kind']; info = result['inputs'][name]
        lines.extend([f"## {name} · {dataset['category']}", ''])
        if info.get('configuration'):
            lines.extend(['Configuración: `' + canonical(info['configuration']) + '`.', ''])
        if not dataset['complete']:
            lines.extend(['**Ejecución incompleta o fallida; sus datos se conservan.**', ''])
        if info.get('instrumentFailureKind'):
            lines.extend(['**Fallo del instrumento:** ' + info['instrumentFailureKind'] + '. Se conserva separado de las mediciones finales; no se clasifica como regresión del juego.', ''])
        if info.get('failure'):
            lines.extend(['Fallo: `' + canonical(info['failure']) + '`.', ''])
        if kind in ('startup', 'steady', 'operations'):
            timing_table(lines, rows)
            for row in rows:
                if row.get('completedPairsWithoutEquivalenceCertificate'):
                    lines.extend([f"**Sin certificado final — {label(row)}:** se conservan {row['completedPairsWithoutEquivalenceCertificate']} pares ejecutados dentro del caso incompleto. El runner integrado guarda `identicalFinalState` y `stateSha256` después de terminar todas las repeticiones; la parada por presupuesto ocurrió antes. Estos tiempos parciales no certifican estados completos equivalentes.", ''])
            if kind == 'startup':
                lines.extend(['### Preparación y latencia', '', 'El worker completo incluye captura/validación final. El tiempo de subproceso incluye lanzamiento de Node y serialización/IPC; ninguno reemplaza al coste de los frames del juego.', '',
                              '| Caso | Harness A → B | Escena A → B | Escena→primer dibujo A → B | Ventana de frames A → B | Worker completo A → B | Subproceso A → B |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |'])
                for row in rows:
                    m = row['metrics']; stages = row['setupStages']
                    lines.append(f"| {label(row)} | {pair(stages['harness']['wallMs'])} | {pair(stages['sceneCreation']['wallMs'])} | {pair(m['sceneToFirstFrame'])} | {pair(m['frameWindow'])} | {pair(m['workerElapsed'])} | {pair(m['subprocessElapsed'])} |")
                lines.extend(['', '### Frames y fases externas', '', 'Se muestran todos los frames en ventanas cortas; en ventanas largas, los ocho iniciales, los cuatro finales y el máximo de cada repetición. Todos los frames permanecen en el agregado y en los originales. Las fases ya están dentro del total.', '',
                              '| Caso / frame | Total A → B | Advance A → B | Líquidos A → B | Consulta A → B | Dibujo A → B | CPU A → B |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |'])
                for row in rows:
                    frames = row['frames']; shown = set(range(1, min(8, len(frames)) + 1)) | set(range(max(1, len(frames) - 3), len(frames) + 1)) | {p['index'] for p in row['peakFrames']}
                    for frame in frames:
                        if frame['index'] not in shown:
                            continue
                        phases = frame['phases']
                        values = [pair(frame['wallMs']), *[pair(phases[p]['wallMs']) for p in ('advance', 'liquids', 'targetQuery', 'renderPreparation')], pair(frame['processCpuMs'])]
                        lines.append(f"| {label(row)} / {frame['index']} | " + ' | '.join(values) + ' |')
                lines.append('')
            elif kind == 'operations':
                lines.extend(['### Crecimiento y primera ronda', '', '| Caso | Crecimiento A → B | Priming A → B | Primera ronda A → B |', '| --- | ---: | ---: | ---: |'])
                for row in rows:
                    values = [pair(row['stageCosts'][s]['wallMs']) if s in row['stageCosts'] else '—' for s in ('growth', 'priming', 'cold')]
                    lines.append(f"| {label(row)} | " + ' | '.join(values) + ' |')
                lines.append('')
        elif kind == 'counts':
            lines.extend(['Conteos independientes de tiempos; se resta `coldCounts` de `totalCounts`. Esa diferencia incluye el calentamiento configurado y las rondas de muestras indicadas en la tabla. No cuenta búsquedas internas de Set, GC ni crecimiento de almacenamiento.', '', '| Caso | Variante / rep | Rondas de muestras | Lecturas | Escrituras | Reset | Set | Resize |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |'])
            for row in rows:
                for count in row['counts']:
                    d = count.get('measuredDelta', {}); calls = d.get('calls', {})
                    values = [count.get('completedSamples'), d.get('numericReads'), d.get('numericWrites'), calls.get('reset'), calls.get('set'), calls.get('setNumObjects')]
                    lines.append(f"| {label(row)} | {count['variant']} / {count['repetition']} | " + ' | '.join(str(v) if v is not None else '—' for v in values) + ' |')
            lines.append('')
        elif kind == 'equivalence':
            lines.extend(['| Escenario / Hz | Estado exacto | Resumen exacto | Entregas | Joules | Segundos simulados | Pasos | Descarte |', '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |'])
            for row in rows:
                summary = row.get('summaryBothVariants') or {}; values = [summary.get(k) for k in ('delivered', 'joules', 'simulatedSeconds', 'physicsSteps', 'droppedSeconds')]
                lines.append(f"| {row.get('scenario')} / {row.get('hz')} | {row.get('identicalFinalState')} | {row['identicalSummaries']} | " + ' | '.join(str(v) if v is not None else '—' for v in values) + ' |')
            lines.append('')
        elif kind == 'profile':
            lines.extend(['Captura diagnóstica separada, con fases inclusivas y/o muestreo. Sus tiempos no sustituyen las tres repeticiones principales ni se suman entre bloques anidados.', '', '| Etapa / frame | Pared | CPU | Bloque inclusivo más costoso | Tiempo de ese bloque |', '| --- | ---: | ---: | --- | ---: |'])
            for row in rows:
                for stage in row['stages']:
                    blocks = stage.get('blocks', {}); top = max(blocks, key=lambda k: blocks[k].get('inclusiveMs', 0)) if blocks else None
                    lines.append(f"| {stage.get('name')} / {stage.get('frame')} | {fmt(stage.get('wallMs'))} | {fmt(stage.get('processCpuMs'))} | {top or 'sin wrappers'} | {fmt(blocks[top].get('inclusiveMs')) if top else '—'} |")
                if row.get('profileTop'):
                    lines.extend(['', 'Primeras funciones por muestras propias; no confundir CPU sampling con tiempos inclusivos de wrappers:', '', '| Función | CPU muestreada, ms / bytes muestreados |', '| --- | ---: |'])
                    for function in row['profileTop'][:10]:
                        lines.append(f"| {function.get('name')} | {fmt(function.get('selfMs', function.get('sampledBytes')))} |")
                if row.get('gc'):
                    lines.extend(['', 'GC observado: `' + canonical(row['gc']) + '`.'])
            lines.append('')
        elif kind == 'instrument':
            lines.extend(['Corrección del instrumento conservada íntegramente en el original y en el agregado:', '', '```json', json.dumps(rows[0], ensure_ascii=False, indent=2), '```', ''])
        else:
            lines.extend(['Sonda de representación de arrays separada de tiempos principales. Su fuente se valida por SHA de juego; este formato no registró un commit. El agregado conserva las observaciones completas, sin inferir que un estado de V8 explique por sí solo la latencia.', ''])
            for row in rows:
                lines.extend(['| Frame | Advance | Líquidos | Consulta | Dibujo |', '| --- | ---: | ---: | ---: | ---: |'])
                for frame in row.get('frames', []):
                    lines.append(f"| {frame.get('frame')} | " + ' | '.join(fmt(frame.get(k)) for k in ('advance', 'liquids', 'target', 'render')) + ' |')
                lines.append('')
        for row in rows:
            for stop in row.get('stops', []):
                lines.extend(['**Parada/fallo:** `' + canonical(stop) + '`.', ''])
    lines.extend(['## Integridad y límites', '', 'Los inputs principales están fijados al commit/hash de referencia y al SHA final optimizado indicados arriba. Los experimentos, fallos del instrumento, perfiles y sonda de arrays permanecen separados. Si coexisten JSON y gzip, sus bytes decodificados deben coincidir.', '',
                  'Inventarios, relojes, acumuladores, consumo/producción, memoria, todos los frames y rangos/deltas pareados se conservan en `aggregate.json`; los originales retienen cada muestra. Los deltas de memoria del proceso incluyen VM, compilación y GC; no equivalen a asignaciones contadas ni a tamaño retenido de una caché. Regenerar estas tablas no vuelve a ejecutar ni aprobar pruebas del juego.', ''])
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', nargs='?', type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument('--require-all', action='store_true')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--markdown', type=Path)
    options = parser.parse_args(); result = build(options.directory.resolve(), options.require_all)
    (options.output or options.directory / 'aggregate.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    (options.markdown or options.directory / 'RESULTADOS.md').write_text(markdown(result))
    print(json.dumps({'inputs': len(result['inputs']), 'missing': result['missingRequiredInputs'], 'totals': result['totalsByCategory']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
