#!/usr/bin/env python3
"""Summarize saved pressure-pad evidence; never run Node or the game.

python3 resumir.py [DIRECTORY] [--require-all]
Reads JSON or gzip, pins the PR and cumulative baselines separately, and writes
aggregate.json / RESULTADOS.md. Percentiles are never pooled across repetitions.
"""
import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path
import statistics

BASELINE = '274a389b77d0f57c9f4c13d56c5caf86070b1b0d'
BASELINE_GAME = '847e7b1f99778315678478b01b7a781ecd3c2e1f0deab595e16446ecb9c52fed'
PERIOD_BASELINE = '1a0425a250b7911a8c230eb5d8534c54e3a03953'
PERIOD_GAME = 'd5b6af65ab6a413634e6cf70bc3ea88a16a0ab9cc81b4d5af2364045caf16159'
FINAL_GAME = '0fb81005a9a3b2a8baf54bf2b9a10b266905ab9a30e187008c0b4a50bd934085'
CODE_COMMIT = '2c6d6ed5677bc4626d8e89ba9d80590031de9d0f'
CODE_TREE = '1a0c8bf4ec80374ef1982c200ddaabfeff3a20b6'
STARTUP_RUNNER = '8965b491cd2f146928f06c74bbf8ca954c6659d720fe28e2dfa10e7afa062562'
REQUIRED = ('cold-60', 'cold-120', 'cold-240', 'cold-settle-120', 'controls-60', 'controls-120', 'controls-240',
            'settled-60', 'settled-120', 'settled-240', 'equivalence', 'query-deferred-120', 'query-counts-120')
PERIOD_CASES = {(500, 120), (1000, 120), (2000, 60)}
VARIANTS = ('baseline', 'optimized')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def get(value, path):
    for key in path.split('.'):
        if not isinstance(value, dict):
            return None
        value = value.get(key)
    return value


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def stat(values):
    values = [x for x in values if finite(x)]
    return {'n': len(values), 'median': statistics.median(values) if values else None,
            'min': min(values) if values else None, 'max': max(values) if values else None, 'values': values}


def metric(runs, path):
    values = {v: {r.get('repetition', i + 1): get(r, path) for i, r in enumerate(runs.get(v, []))} for v in VARIANTS}
    result = {v: stat(values[v].values()) for v in VARIANTS}
    paired = sorted(rep for rep in values['baseline'].keys() & values['optimized'].keys()
                    if finite(values['baseline'][rep]) and finite(values['optimized'][rep]))
    result['pairedOptimizedMinusBaseline'] = {'repetitions': paired,
        **stat([values['optimized'][rep] - values['baseline'][rep] for rep in paired])}
    return result


def each(runs):
    for variant in VARIANTS:
        for i, run in enumerate(runs.get(variant, [])):
            yield variant, run.get('repetition', i + 1), run


def distinct(values):
    result = {}
    for label, value in values:
        if value is not None:
            result.setdefault(canonical(value), {'runs': [], 'value': value})['runs'].append(label)
    return list(result.values())


def read_input(directory, name):
    contents = []
    for extension in ('.json', '.json.gz'):
        path = directory / (name + extension)
        if path.exists():
            raw = path.read_bytes()
            contents.append(gzip.decompress(raw) if extension.endswith('.gz') else raw)
    if not contents:
        return None
    if len(contents) == 2 and contents[0] != contents[1]:
        raise ValueError(name + ': JSON/gzip decoded bytes differ')
    return json.loads(contents[0]), {'decodedBytes': len(contents[0]), 'decodedSha256': sha(contents[0])}


def source_game(source):
    return source.get('gameSha256', source.get('files', {}).get('assets/js/game.js'))


def validate_source(name, data, category):
    expected_commit, expected_game = (PERIOD_BASELINE, PERIOD_GAME) if category == 'cumulative' else (BASELINE, BASELINE_GAME)
    sources = data.get('sources')
    if sources:
        baseline = sources.get('baseline', {}); commit = baseline.get('commit', baseline.get('headCommit'))
        if commit != expected_commit or source_game(baseline) != expected_game or data.get('referenceCommit', expected_commit) != expected_commit:
            raise ValueError(name + ': wrong reference commit or game bytes')
        if category != 'reference' and source_game(sources.get('optimized', {})) != FINAL_GAME:
            raise ValueError(name + ': optimized bytes differ from the final measured game')
        if category == 'reference' and source_game(sources.get('optimized', baseline)) != expected_game:
            raise ValueError(name + ': reference control must use the reference in both arms')
        if data.get('mode') == 'cold-process-startup' and category == 'main':
            config = data.get('configuration', {})
            if (config.get('benchmarkSha256') != STARTUP_RUNNER or not config.get('freshProcessPerArm')
                    or config.get('warmup') != 0 or config.get('nativeCannonTimeMultiplier') != 2
                    or config.get('repetitions') != 3 or config.get('order') != 'AB/BA/AB'):
                raise ValueError(name + ': unexpected main cold-runner configuration')
        return 'commit-and-game-hash'
    identity = data.get('identity')
    if identity:
        if category == 'reference':
            if identity.get('commit') != BASELINE or identity.get('gameSha256') != BASELINE_GAME:
                raise ValueError(name + ': wrong reference profile')
        elif identity.get('gameSha256') != FINAL_GAME:
            raise ValueError(name + ': wrong optimized profile')
        return 'profile-identity'
    raise ValueError(name + ': no supported source identity')


def common(raw, repetitions):
    runs = raw.get('runs', {})
    result = {k: raw[k] for k in ('scenario', 'family', 'name', 'phase', 'pieces', 'hz', 'buttons', 'lastCompleted',
                                   'identicalFinalState', 'identical', 'stateSha256', 'comparisons') if k in raw}
    completed = {v: {r.get('repetition', i + 1) for i, r in enumerate(runs.get(v, []))
                    if r.get('complete', True) is not False and not r.get('stopped') and not r.get('failure')} for v in VARIANTS}
    pairs = completed['baseline'] & completed['optimized']
    result['completePairs'] = len(pairs)
    result['complete'] = raw.get('complete', True) is not False and not raw.get('stopped') and all(len(completed[v]) == repetitions for v in VARIANTS)
    certificates = {c.get('repetition') for c in raw.get('comparisons', [])
                    if c.get('identicalFinalState', c.get('identicalState')) is True
                    and all(c.get(key, True) is True for key in ('identicalFrameClocksAndInventories', 'identicalOutputs', 'identicalInventory', 'identicalClocks'))}
    if raw.get('identicalFinalState') is True or raw.get('identical') is True:
        certificates = pairs
    result['certifiedEquivalentPairs'] = len(pairs & certificates)
    result['pairsWithoutFinalStateCertificate'] = len(pairs - certificates)
    result['stops'] = [raw['stopped']] if raw.get('stopped') else []
    for variant, repetition, run in each(runs):
        if run.get('stopped') or run.get('failure'):
            result['stops'].append({'variant': variant, 'repetition': repetition, 'stopped': run.get('stopped'),
                                    'failure': run.get('failure'), 'finalClock': run.get('finalClock'), 'finalInventory': run.get('finalInventory')})
    for key in ('initial', 'initialInventory', 'firstFrameInventory', 'final', 'finalInventory', 'inventory', 'clockBefore', 'clockAfter',
                'clockDelta', 'finalClock', 'memoryBeforeFrames', 'memoryAfterFrames', 'processMemoryAtExit', 'memoryBefore', 'memoryAfter', 'cacheSnapshots', 'outputs'):
        values = distinct((f'{v}:{rep}', r.get(key)) for v, rep, r in each(runs))
        if values:
            result[key] = values
    if result['complete']:
        clocks = [r.get('clockDelta', {}) for _, _, r in each(runs)]
        result['workBothVariants'] = {'physicsSteps': sum(c.get('physicsSteps', c.get('physics', 0)) for c in clocks),
            'simulatedSeconds': sum(c.get('simulatedSeconds', 0) for c in clocks), 'droppedSeconds': sum(c.get('droppedSeconds', 0) for c in clocks)}
    return result


def paired_report(raw, repetitions, kind):
    result = common(raw, repetitions); runs = raw.get('runs', {})
    if kind == 'counts':
        result['recordedRuns'] = runs
        return result
    if kind == 'query':
        paths = {'totalWall': 'totalWallMs', 'totalCpu': 'totalCpuMs', 'coldTotalWall': 'coldTotalWallMs', 'coldTotalCpu': 'coldTotalCpuMs'}
    else:
        wall, cpu = ('statistics.wallMs', 'statistics.processCpuMs') if kind == 'cold' else ('wallMsPerSimulatedFrame', 'processCpuMsPerSimulatedFrame')
        paths = {**{'wall' + p.upper(): wall + '.' + p for p in ('p50', 'p95', 'p99')},
                 **{'cpu' + p.upper(): cpu + '.' + p for p in ('p50', 'p95', 'p99')},
                 'wallPeak': wall + '.max', 'cpuMean': cpu + '.mean'}
        if kind == 'cold':
            paths.update(windowWall='frameWindow.wallMs', windowCpu='frameWindow.processCpuMs', firstFrameLatency='workerTimeToFirstFrameMs',
                         sceneToFirstFrame='sceneStartToFirstFrameMs', workerWall='workerElapsedMs', workerCpu='workerProcessCpuMs', subprocessWall='subprocess.elapsedMs')
    result['metrics'] = {name: metric(runs, path) for name, path in paths.items()}
    stages = sorted({stage for _, _, r in each(runs) for stage in r.get('stages', {})})
    result['stages'] = {stage: {field: metric(runs, f'stages.{stage}.{field}') for field in ('wallMs', 'processCpuMs')}
                        for stage in stages}
    if kind == 'steady':
        result['stages'] = {key: {'wallMs': metric(runs, key + 'Ms')} for key in ('setup', 'warmup', 'totalCase')}
    if kind == 'cold':
        result['frames'] = []
        count = max((len(r.get('frames', [])) for _, _, r in each(runs)), default=0)
        for index in range(count):
            frames = {v: [{'repetition': r.get('repetition', i + 1), **r['frames'][index]}
                          for i, r in enumerate(runs.get(v, [])) if len(r.get('frames', [])) > index] for v in VARIANTS}
            row = {'index': index + 1, 'wall': metric(frames, 'wallMs'), 'cpu': metric(frames, 'processCpuMs'),
                   'phases': {phase: {field: metric(frames, f'phases.{phase}.{field}') for field in ('wallMs', 'processCpuMs')}
                              for phase in ('advance', 'liquids', 'targetQuery', 'renderPreparation')}}
            for key in ('inventory', 'clockBefore', 'clockAfter', 'clockDelta', 'memoryDelta'):
                row[key] = distinct((f'{v}:{rep}', r.get(key)) for v, rep, r in each(frames))
            result['frames'].append(row)
    return result


def build(directory, require_all=False):
    names = set(REQUIRED)
    for path in directory.iterdir():
        name = path.name.removesuffix('.gz').removesuffix('.json')
        if path.name.endswith(('.json', '.json.gz')) and name.startswith(('cold-', 'controls-', 'settled-', 'reference-', 'baseline-', 'optimized-', 'exploratory-', 'acumulado-', 'cumulative-', 'query-', 'pressure-query')):
            names.add(name)
    result = {'schema': 1, 'referenceCommit': BASELINE, 'referenceGameSha256': BASELINE_GAME,
              'periodReferenceCommit': PERIOD_BASELINE, 'periodReferenceGameSha256': PERIOD_GAME,
              'optimizedGameSha256': FINAL_GAME, 'codeCommitLocal': CODE_COMMIT, 'codeTree': CODE_TREE,
              'requiredInputs': list(REQUIRED), 'missingRequiredInputs': [], 'missingPeriodCases': [], 'inputs': {}, 'datasets': {},
              'method': 'Median and min/max of each repetition statistic, retaining paired B-minus-A differences. PR and period comparisons have separate pinned baselines. No pooled percentiles or mixed cold/warm/profile times. Finished timing pairs without final-state certification remain explicitly partial.'}
    period_seen = set()
    for name in [*REQUIRED, *sorted(names - set(REQUIRED))]:
        loaded = read_input(directory, name)
        if loaded is None:
            if name in REQUIRED:
                result['missingRequiredInputs'].append(name)
            continue
        data, info = loaded; config = data.get('configuration', {}); mode = data.get('mode')
        category = ('experimental' if name.startswith('exploratory-') else 'reference' if name.startswith(('reference-', 'baseline-')) else
                    'cumulative' if name.startswith(('acumulado-', 'cumulative-')) else 'diagnostic' if name.startswith('optimized-') else
                    'counts' if config.get('mode') == 'counts' or config.get('instrumentation') == 'counts' else 'main')
        info['identityValidation'] = validate_source(name, data, category)
        info.update({k: data[k] for k in ('sources', 'identity', 'configuration', 'runtime', 'method', 'failure', 'probeSha256') if k in data})
        repetitions = config.get('repetitions', 3)
        if mode in ('cold-process-startup', 'matrix', 'pressure-pad-query'):
            kind = 'counts' if category == 'counts' else {'cold-process-startup': 'cold', 'matrix': 'steady', 'pressure-pad-query': 'query'}[mode]
            rows = [paired_report({'hz': config.get('hz'), **r}, repetitions, kind) for r in data.get('reports', [])]
        elif mode == 'equivalence':
            kind = 'equivalence'; rows = [{**r, 'identicalSummaries': r.get('baseline') == r.get('optimized')} for r in data.get('reports', [])]
        elif 'identity' in data and 'stages' in data:
            kind = 'profile'; rows = [data]
        else:
            raise ValueError(name + ': unsupported evidence schema')
        expected = len(config.get('families') or []) * len(config.get('scales') or []) if kind in ('cold', 'steady') else None
        if mode == 'pressure-pad-query':
            expected = len(config.get('families') or []) * len(config.get('scales') or []) * len(config.get('buttonModes') or [])
        complete = not data.get('failure') and data.get('complete', True) is not False and all(r.get('complete', True) for r in rows)
        if expected is not None:
            complete = complete and len(rows) == expected
        result['inputs'][name] = info
        result['datasets'][name] = {'category': category, 'kind': kind, 'complete': complete, 'expectedConfigurations': expected, 'reports': rows}
        if category == 'cumulative':
            for row in rows:
                a = get(row, 'metrics.cpuMean.baseline.median'); b = get(row, 'metrics.cpuMean.optimized.median')
                row['cpuReductionPercentFromMedians'] = 100 * (1 - b / a) if finite(a) and a > 0 and finite(b) else None
            period_seen.update((r.get('pieces'), r.get('hz')) for r in rows if r.get('scenario') == 'independent')
    result['missingPeriodCases'] = [dict(pieces=p, hz=h) for p, h in sorted(PERIOD_CASES - period_seen)]
    if require_all and (result['missingRequiredInputs'] or result['missingPeriodCases']):
        raise ValueError('Missing inputs: ' + canonical({'main': result['missingRequiredInputs'], 'period': result['missingPeriodCases']}))
    result['totalsByCategory'] = {}
    for category in ('main', 'cumulative', 'counts', 'diagnostic', 'reference', 'experimental'):
        datasets = [d for d in result['datasets'].values() if d['category'] == category]; rows = [r for d in datasets for r in d['reports']]
        result['totalsByCategory'][category] = {'inputs': len(datasets), 'configurations': len(rows), 'completeConfigurations': sum(r.get('complete', True) for r in rows),
            'completePairs': sum(r.get('completePairs', 0) for r in rows), 'certifiedEquivalentPairs': sum(r.get('certifiedEquivalentPairs', 0) for r in rows),
            'pairsWithoutFinalStateCertificate': sum(r.get('pairsWithoutFinalStateCertificate', 0) for r in rows),
            'functionalComparisons': sum(len(d['reports']) for d in datasets if d['kind'] == 'equivalence')}
    return result


def fmt(value):
    return '—' if not finite(value) else f'{value:.6f}'


def pair(value):
    return fmt(value['baseline']['median']) + ' → ' + fmt(value['optimized']['median'])


def ranges(value):
    return ' → '.join('[' + fmt(value[v]['min']) + '; ' + fmt(value[v]['max']) + ']' for v in VARIANTS)


def label(row):
    return f"{row.get('scenario', row.get('family', row.get('name', 'caso')))} / {row.get('pieces', '—')} / {row.get('hz', '—')} Hz" + (f" / botones={row['buttons']}" if 'buttons' in row else '')


def markdown(result):
    lines = ['# Apoyos de plataformas: resultados reproducibles', '',
        f'Referencia del PR: `{BASELINE}`. Referencia acumulada desde antes de #26: `{PERIOD_BASELINE}`. Fuente final: `{FINAL_GAME}`.', '',
        'Tiempos en milisegundos de Node con Cannon/lógica reales y DOM/GPU simulados. Pared y CPU de proceso se presentan por separado; no son FPS. Cada celda muestra la mediana de los estadísticos de las repeticiones, sin mezclar muestras. Los rangos y deltas pareados se conservan en el agregado.', '',
        'Las comparaciones acumuladas miden directamente ambos extremos del período en sus escenas; no suman porcentajes de PR anteriores. Las ventanas frías recrean procesos por brazo y repetición. En cuatro frames, p95/p99 coinciden con el máximo; no representan una partida prolongada. Perfiles y conteos están separados.', '']
    if result['missingRequiredInputs'] or result['missingPeriodCases']:
        lines.extend(['**Evidencia todavía pendiente:** `' + canonical({'main': result['missingRequiredInputs'], 'period': result['missingPeriodCases']}) + '`.', ''])
    for name, dataset in result['datasets'].items():
        info = result['inputs'][name]; kind = dataset['kind']; rows = dataset['reports']
        lines.extend([f"## {name} · {dataset['category']}", '', 'Configuración: `' + canonical(info.get('configuration', {})) + '`.', ''])
        if not dataset['complete']:
            lines.extend(['**Ejecución incompleta o fallida: se conservan todos sus resultados.**', ''])
        if info.get('failure'):
            lines.extend(['Fallo: `' + canonical(info['failure']) + '`.', ''])
        if kind in ('cold', 'steady'):
            lines.extend(['| Caso | Pares ejecutados / certificados | Pared p50 A → B | p95 | p99 | CPU media | Rango p50 A → B | Δ p50 B−A por pareja |', '| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |'])
            for r in rows:
                m = r['metrics']; delta = '; '.join(fmt(v) for v in m['wallP50']['pairedOptimizedMinusBaseline']['values'])
                lines.append(f"| {label(r)}{' **incompleto**' if not r['complete'] else ''} | {r['completePairs']} / {r['certifiedEquivalentPairs']} | {pair(m['wallP50'])} | {pair(m['wallP95'])} | {pair(m['wallP99'])} | {pair(m['cpuMean'])} | {ranges(m['wallP50'])} | {delta or '—'} |")
            lines.append('')
            if dataset['category'] == 'cumulative':
                lines.extend(['Reducción calculada directamente como `100 × (1 − mediana_CPU_final / mediana_CPU_inicial)`, sobre las medias de CPU de cada repetición. Se refiere a estas escenas en reposo, no a utilización porcentual del equipo ni a todas las cargas del juego.', '',
                              '| Caso | Reducción de CPU de proceso | Rango de medias CPU A → B, ms |', '| --- | ---: | --- |'])
                for r in rows:
                    value = r.get('cpuReductionPercentFromMedians')
                    lines.append(f"| {label(r)} | {fmt(value)} % | {ranges(r['metrics']['cpuMean'])} |")
                lines.append('')
            if kind == 'cold':
                lines.extend(['| Caso | Máximo de frame A → B | Rango del máximo | Ventana de pared | CPU de ventana | Escena→primer dibujo |', '| --- | ---: | --- | ---: | ---: | ---: |'])
                for r in rows:
                    m = r['metrics']; lines.append(f"| {label(r)} | {pair(m['wallPeak'])} | {ranges(m['wallPeak'])} | {pair(m['windowWall'])} | {pair(m['windowCpu'])} | {pair(m['sceneToFirstFrame'])} |")
                lines.append('')
        elif kind == 'query':
            lines.extend(['Primera consulta posterior y preparación se miden por separado; estos tiempos no se añaden a los frames físicos.', '', '| Caso / etapa | Pared A → B | CPU A → B | Rango de pared |', '| --- | ---: | ---: | --- |'])
            for r in rows:
                for stage, fields in r['stages'].items():
                    lines.append(f"| {label(r)} / {stage} | {pair(fields['wallMs'])} | {pair(fields['processCpuMs'])} | {ranges(fields['wallMs'])} |")
            lines.append('')
            lines.extend(['| Caso | Pares ejecutados / certificados | Hasta primera bounds, pared | Hasta primera bounds, CPU | Total con consultas posteriores, pared | Total CPU |', '| --- | ---: | ---: | ---: | ---: | ---: |'])
            for r in rows:
                m = r['metrics']; lines.append(f"| {label(r)} | {r['completePairs']} / {r['certifiedEquivalentPairs']} | {pair(m['coldTotalWall'])} | {pair(m['coldTotalCpu'])} | {pair(m['totalWall'])} | {pair(m['totalCpu'])} |")
            lines.append('')
        elif kind == 'counts':
            lines.extend(['Conteos instrumentados separados, conservados íntegramente en el agregado y originales. Sus tiempos no se mezclan con las comparaciones principales.', ''])
        elif kind == 'equivalence':
            lines.extend(['| Escenario / Hz | Estado exacto | Resumen exacto | Entregas | Energía J | Tiempo simulado s | Pasos | Descarte s |', '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |'])
            for r in rows:
                s = r.get('optimized', {}); values = [s.get(k) for k in ('delivered', 'joules', 'simulatedSeconds', 'physicsSteps', 'droppedSeconds')]
                lines.append(f"| {r.get('scenario')} / {r.get('hz')} | {r.get('identicalFinalState')} | {r['identicalSummaries']} | " + ' | '.join(str(v) if v is not None else '—' for v in values) + ' |')
            lines.append('')
        elif kind == 'profile':
            lines.extend(['Diagnóstico separado; bloques inclusivos y anidados que no deben sumarse. Los conteos completos y el muestreo permanecen en el agregado.', '', '| Etapa / frame | Pared | CPU | onCampaignPad, llamadas | bounds, llamadas |', '| --- | ---: | ---: | ---: | ---: |'])
            for r in rows:
                for s in r.get('stages', []):
                    b = s.get('blocks', {}); lines.append(f"| {s.get('name')} / {s.get('frame')} | {fmt(s.get('wallMs'))} | {fmt(s.get('processCpuMs'))} | {b.get('onCampaignPad', {}).get('calls', '—')} | {b.get('bounds', {}).get('calls', '—')} |")
            lines.append('')
        for r in rows:
            if r.get('pairsWithoutFinalStateCertificate'):
                lines.extend([f"**{label(r)}:** {r['pairsWithoutFinalStateCertificate']} pares ejecutados sin certificado final. El runner integrado sólo publica equivalencia al terminar todas las repeticiones; no se infiere a partir de tiempos o inventarios.", ''])
            for stop in r.get('stops', []):
                lines.extend(['Parada preservada: `' + canonical(stop) + '`.', ''])
    lines.extend(['## Integridad', '', 'El agregado conserva cada repetición, rangos y diferencias pareadas, etapas, frames, inventarios, relojes y memoria. Los originales conservan las muestras. Los deltas de memoria incluyen VM/JIT/GC y no equivalen a bytes exactos de una caché. Regenerar estas tablas no vuelve a ejecutar ni aprobar pruebas del juego.', ''])
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', nargs='?', type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument('--require-all', action='store_true')
    options = parser.parse_args(); result = build(options.directory.resolve(), options.require_all)
    (options.directory / 'aggregate.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    (options.directory / 'RESULTADOS.md').write_text(markdown(result))
    print(json.dumps({'inputs': len(result['inputs']), 'missing': result['missingRequiredInputs'], 'missingPeriod': result['missingPeriodCases'], 'totals': result['totalsByCategory']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
