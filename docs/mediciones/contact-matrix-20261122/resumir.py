#!/usr/bin/env python3
"""Summarize saved contact-matrix evidence; never run the game or benchmarks.

python3 resumir.py [DIRECTORY] [--require-all] [--output FILE] [--markdown FILE]
Reads .json or .json.gz, validates the pinned PR reference, and writes deterministic
aggregate.json and RESULTADOS.md. Missing/partial evidence remains explicit.
"""
import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path
import statistics

BASELINE = "1465a6c12160432c5df52b35d782c2f2527720cf"
BASELINE_GAME = "84bfc37c0661329ffa2cba69f22e50d2256e35944fad556778926a1fa632be0c"
OPTIMIZED_GAME = "c77f65c197f80f340f7f390a8d72155601589fb500bbb1014c0cbee3a3b97b4c"
REQUIRED = (
    "matrix-operations", "settled-60", "settled-120", "settled-240",
    "controls-120", "equivalence", "diagnostic-2000-60", "diagnostic-1500-240",
    "matrix-counts", "matrix-dense-counts", "control-long-120", "matrix-warm-counts",
)
VARIANTS = ("baseline", "optimized")


def digest(value):
    return hashlib.sha256(value).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def get(obj, path):
    for key in path.split("."):
        if not isinstance(obj, dict):
            return None
        obj = obj.get(key)
    return obj


def stats(values):
    values = [v for v in values if finite(v)]
    return {"n": len(values), "median": statistics.median(values) if values else None,
            "min": min(values) if values else None, "max": max(values) if values else None,
            "values": values}


def metric(runs, path):
    values = {v: {r.get("repetition", i + 1): get(r, path) for i, r in enumerate(runs.get(v, []))} for v in VARIANTS}
    result = {v: stats(values[v].values()) for v in VARIANTS}
    paired = sorted(k for k in set(values["baseline"]) & set(values["optimized"])
                    if finite(values["baseline"][k]) and finite(values["optimized"][k]))
    result["pairedOptimizedMinusBaseline"] = {"repetitions": paired,
        **stats([values["optimized"][k] - values["baseline"][k] for k in paired])}
    result["medianDifference"] = (result["optimized"]["median"] - result["baseline"]["median"]
                                  if all(result[v]["n"] for v in VARIANTS) else None)
    return result


def unique(records):
    groups = {}
    for label, value in records:
        if value is None:
            continue
        key = canonical(value)
        groups.setdefault(key, {"runs": [], "value": value})["runs"].append(label)
    return list(groups.values())


def records(runs):
    for variant in VARIANTS:
        for i, run in enumerate(runs.get(variant, [])):
            yield variant, run.get("repetition", i + 1), run


def without_samples(value):
    if isinstance(value, dict):
        return {k: without_samples(v) for k, v in value.items()
                if k not in ("samples", "wallSamples", "cpuSamples", "processCpuSamples", "userSamples", "systemSamples", "checksums")}
    if isinstance(value, list):
        return [without_samples(v) for v in value]
    return value


def common(raw, repetitions):
    runs = raw.get("runs", {})
    result = {k: raw[k] for k in ("name", "scenario", "phase", "bodies", "pieces", "hz", "lastCompleted", "identical", "identicalFinalState", "stateSha256") if k in raw}
    result["complete"] = (raw.get("complete", True) is not False and "stopped" not in raw
                          and all(len(runs.get(v, [])) == repetitions for v in VARIANTS)
                          and all(not r.get("stopped") for _, _, r in records(runs)))
    result["availableRuns"] = {v: len(runs.get(v, [])) for v in VARIANTS}
    done = {v: {r.get("repetition", i + 1) for i, r in enumerate(runs.get(v, [])) if not r.get("stopped")} for v in VARIANTS}
    result["completePairs"] = len(done["baseline"] & done["optimized"])
    result["stops"] = ([without_samples(raw["stopped"])] if "stopped" in raw else [])
    for variant, rep, run in records(runs):
        if run.get("stopped"):
            result["stops"].append({"variant": variant, "repetition": rep, **without_samples(run["stopped"]),
                                   **{k: run[k] for k in ("completedSamples", "nativeOracleRoundsRequested", "nativeOracleRoundsCompleted", "nativeOracleMs") if k in run}})
    for key in ("initial", "afterGrowth", "afterPriming", "firstFrameInventory", "final", "clockBefore", "clockAfter", "clockDelta", "finalMatrices", "inventoryBefore", "inventoryAfterWarmup", "inventoryAfter", "matricesAfterWarmup", "matricesAfterMeasurement", "memoryAfterGrowth", "memoryDuringPriming", "memoryDuringMeasurement"):
        values = unique((f"{v}:{rep}", r.get(key)) for v, rep, r in records(runs))
        if values:
            result[key] = values
    result["caseCostsMs"] = {key: metric(runs, key) for key in
                             ("setupMs", "runtimeSetupMs", "warmupMs", "totalCaseMs", "nativeOracleMs")
                             if any(finite(get(r, key)) for _, _, r in records(runs))}
    if result["complete"]:
        result["workTotalsBothVariants"] = {
            "measuredRoundsOrFrames": sum(r.get("completedSamples", get(r, "wallMsPerSimulatedFrame.count") or 0) for _, _, r in records(runs)),
            "physicsSteps": sum(get(r, "clockDelta.physics") or 0 for _, _, r in records(runs)),
            "simulatedSeconds": sum(get(r, "clockDelta.simulatedSeconds") or 0 for _, _, r in records(runs)),
            "droppedSeconds": sum(get(r, "clockDelta.droppedSeconds") or 0 for _, _, r in records(runs)),
        }
    return result


def stage_metrics(runs, stage):
    return {field: metric(runs, f"{stage}.{field}") for field in ("wallMs", "processCpuMs", "processUserMs", "processSystemMs")
            if any(finite(get(r, f"{stage}.{field}")) for _, _, r in records(runs))}


def summarize_case(raw, kind, repetitions):
    result = common(raw, repetitions)
    runs = raw.get("runs", {})
    if kind == "counts":
        result["counts"] = []
        for variant, rep, run in records(runs):
            entry = {"variant": variant, "repetition": rep, "completedSamples": run.get("completedSamples")}
            for stage in ("growthCounts", "primingCounts", "coldCounts", "totalCounts"):
                if stage in run:
                    count = run[stage]
                    # Keep numeric counts and each reset. Hundreds of resize
                    # events remain in the source; summarize their count/range.
                    entry[stage] = {k: value for k, value in count.items() if k != "resizes"}
                    sizes = count.get("resizes", [])
                    entry[stage]["resizeEvents"] = len(sizes)
                    entry[stage]["resizeObjectRange"] = [min(s["objects"] for s in sizes), max(s["objects"] for s in sizes)] if sizes else None
            total, cold = run.get("totalCounts"), run.get("coldCounts")
            if total and cold:
                entry["measuredDelta"] = {k: total[k] - cold[k] for k in ("numericReads", "numericWrites", "lengthReads", "lengthWrites")}
                entry["measuredDelta"]["calls"] = {k: total["calls"][k] - cold["calls"][k] for k in total["calls"]}
                entry["measuredDelta"]["resets"] = total.get("resets", [])[len(cold.get("resets", [])):]
                if run.get("completedSamples"):
                    entry["perMeasuredRound"] = {k: entry["measuredDelta"][k] / run["completedSamples"] for k in ("numericReads", "numericWrites", "lengthReads", "lengthWrites")}
            result["counts"].append(entry)
        return result
    prefix = "statistics" if kind == "operations" else None
    fields = ({"wallP50": "statistics.wallMs.p50", "wallP95": "statistics.wallMs.p95", "wallP99": "statistics.wallMs.p99", "wallMean": "statistics.wallMs.mean", "processCpuMean": "statistics.processCpuMs.mean", "processUserMean": "statistics.processUserMs.mean", "processSystemMean": "statistics.processSystemMs.mean"}
              if prefix else {"wallP50": "wallMsPerSimulatedFrame.p50", "wallP95": "wallMsPerSimulatedFrame.p95", "wallP99": "wallMsPerSimulatedFrame.p99", "wallMean": "wallMsPerSimulatedFrame.mean", "processCpuMean": "processCpuMsPerSimulatedFrame.mean"})
    result["unit"] = "ms/round" if kind == "operations" else "ms/synthetic-frame"
    result["metrics"] = {name: metric(runs, field) for name, field in fields.items()}
    for stage in ("growth", "priming", "cold"):
        value = stage_metrics(runs, stage)
        if value:
            result[stage + "Ms"] = value
    return result


def summarize_diagnostic(data):
    runs = {v: [run for run in data.get("runs", []) if run.get("variant") == v] for v in VARIANTS}
    raw = {"scenario": "independent", "pieces": data["configuration"]["pieces"], "hz": data["configuration"]["hz"], "runs": runs, "complete": data.get("complete", False)}
    result = common(raw, data["configuration"].get("repetitions", 3))
    if result["complete"]:
        # Diagnostic clocks live inside measurement, unlike the integrated
        # runner's top-level clockDelta. Count only the measured window; warmup
        # is reported elsewhere. These totals stay in their own category.
        result["workTotalsBothVariants"] = {
            "measuredRoundsOrFrames": sum(get(r, "measurement.completed") or 0 for _, _, r in records(runs)),
            "physicsSteps": sum(get(r, "measurement.clockDelta.physicsSteps") or 0 for _, _, r in records(runs)),
            "cannonSteps": sum(get(r, "measurement.clockDelta.cannonSteps") or 0 for _, _, r in records(runs)),
            "simulatedSeconds": sum(get(r, "measurement.clockDelta.simulatedSeconds") or 0 for _, _, r in records(runs)),
            "droppedSeconds": sum(get(r, "measurement.clockDelta.droppedSeconds") or 0 for _, _, r in records(runs)),
        }
    result["unit"] = "ms/instrumented-frame"
    result["metrics"] = {"wall" + stat.upper() if stat != "mean" else "wallMean": metric(runs, f"measurement.statistics.wallMs.{stat}") for stat in ("p50", "p95", "p99", "mean")}
    result["metrics"]["processCpuMean"] = metric(runs, "measurement.statistics.processCpuMs.mean")
    result["inclusiveBlocks"] = {}
    for block in ("matrixMs", "worldMs", "broadphase", "narrowphase", "makeContactConstraints", "solve", "integrate", "worldOutsideNativeAndMatrixMs"):
        result["inclusiveBlocks"][block] = {stat: metric(runs, f"measurement.statistics.{block}.{stat}") for stat in ("mean", "p50", "p95", "p99")}
    result["clockDeltas"] = unique((f"{v}:{rep}", get(r, "measurement.clockDelta")) for v, rep, r in records(runs))
    result["comparisons"] = data.get("comparisons", [])
    return result


def summarize_equivalence(data):
    rows = []
    for raw in data.get("reports", []):
        row = {k: raw[k] for k in ("scenario", "hz", "identicalFinalState", "stateSha256", "stopped") if k in raw}
        row["identicalSummaries"] = raw.get("baseline") == raw.get("optimized")
        if row["identicalSummaries"]:
            row["summaryBothVariants"] = raw.get("baseline")
        else:
            row.update(baseline=raw.get("baseline"), optimized=raw.get("optimized"))
        rows.append(row)
    return rows


def load(directory, name):
    found = []
    for suffix in (".json", ".json.gz"):
        path = directory / (name + suffix)
        if path.exists():
            encoded = path.read_bytes()
            decoded = gzip.decompress(encoded) if suffix.endswith(".gz") else encoded
            found.append((path, decoded))
    if not found:
        return None
    if len(found) == 2 and found[0][1] != found[1][1]:
        raise ValueError(f"{name}: .json and .json.gz have different decoded bytes")
    path, raw = found[0]
    data = json.loads(raw)
    source = data.get("sources", {}).get("baseline", {})
    commit = source.get("commit", source.get("headCommit"))
    if commit != BASELINE:
        raise ValueError(f"{name}: baseline {commit!r}, expected {BASELINE}")
    if data.get("referenceCommit", BASELINE) != BASELINE:
        raise ValueError(f"{name}: referenceCommit does not match the PR baseline")
    game_hash = source.get("gameSha256", source.get("files", {}).get("assets/js/game.js"))
    if game_hash != BASELINE_GAME:
        raise ValueError(f"{name}: wrong baseline game.js hash: {game_hash!r}")
    return data, {"decodedSha256": digest(raw), "decodedBytes": len(raw), "sources": data["sources"], "configuration": data.get("configuration", {}), "method": data.get("method"), "runtime": data.get("runtime"), "failure": data.get("failure")}


def build(directory, require_all=False):
    names = set(REQUIRED)
    for path in directory.iterdir():
        name = path.name.removesuffix(".gz").removesuffix(".json")
        if path.name.endswith((".json", ".json.gz")) and name.startswith(("exploratory-", "reference-diagnostic-", "control-long-")):
            names.add(name)
    inputs, datasets, missing = {}, {}, []
    for name in [*REQUIRED, *sorted(names - set(REQUIRED))]:
        loaded = load(directory, name)
        if not loaded:
            missing.append(name)
            continue
        data, info = loaded
        if data.get("mode") == "equivalence":
            kind, rows = "equivalence", summarize_equivalence(data)
        elif "comparisons" in data and "runs" in data:
            kind, rows = "diagnostic", [summarize_diagnostic(data)]
        else:
            kind = "counts" if data.get("mode") == "counts" else "operations" if data.get("mode") == "timings" else "frames"
            rows = [summarize_case(r, kind, data.get("configuration", {}).get("repetitions", 3)) for r in data.get("reports", [])]
        category = "experimental" if name.startswith("exploratory-") else "reference" if name.startswith("reference-") else "counts" if kind == "counts" else "diagnostic" if kind == "diagnostic" else "main"
        inputs[name] = info
        config = data.get("configuration", {})
        expected = (len(config.get("cases", [])) * len(config.get("scales", [])) if kind in ("operations", "counts")
                    else len(config.get("families", [])) * len(config.get("scales", [])) if kind == "frames" else None)
        datasets[name] = {"kind": kind, "category": category, "expectedConfigurations": expected,
                          "complete": not data.get("failure") and data.get("complete", True) is not False
                          and (expected is None or len(rows) == expected) and all(r.get("complete", True) for r in rows), "reports": rows}
    if require_all and missing:
        raise ValueError("Missing required inputs: " + ", ".join(missing))
    hashes = set()
    for name, dataset in datasets.items():
        if dataset["category"] in ("main", "counts", "diagnostic"):
            source = inputs[name]["sources"].get("optimized", {})
            value = source.get("gameSha256", source.get("files", {}).get("assets/js/game.js"))
            if value != OPTIMIZED_GAME:
                raise ValueError(f"{name}: optimized game.js {value!r}, expected final measured source {OPTIMIZED_GAME}")
            hashes.add(value)
    if len(hashes) > 1:
        raise ValueError("Primary datasets used different optimized game.js sources: " + ", ".join(sorted(hashes)))
    totals = {}
    for category in ("main", "counts", "diagnostic", "experimental", "reference"):
        selected = [dataset for dataset in datasets.values() if dataset["category"] == category]
        rows = [row for dataset in selected for row in dataset["reports"]]
        totals[category] = {"inputs": len(selected), "configurations": len(rows), "completeConfigurations": sum(row.get("complete", True) for row in rows), "completePairs": sum(row.get("completePairs", 0) for row in rows), "equivalencePairs": sum(len(dataset["reports"]) for dataset in selected if dataset["kind"] == "equivalence")}
        totals[category]["measuredWorkInCompleteCasesBothVariants"] = {key: sum(row.get("workTotalsBothVariants", {}).get(key, 0) for row in rows)
                                                                     for key in ("measuredRoundsOrFrames", "physicsSteps", "simulatedSeconds", "droppedSeconds")}
        if any("cannonSteps" in row.get("workTotalsBothVariants", {}) for row in rows):
            totals[category]["measuredWorkInCompleteCasesBothVariants"]["cannonSteps"] = sum(row.get("workTotalsBothVariants", {}).get("cannonSteps", 0) for row in rows)
    return {"schema": 1, "referenceCommit": BASELINE, "referenceGameSha256": BASELINE_GAME, "expectedOptimizedGameSha256": OPTIMIZED_GAME, "method": {
        "aggregation": "Median/min/max of repetition statistics; samples are not pooled. Every metric retains per-repetition values and optimized-minus-baseline paired deltas. Missing variants are not fabricated.",
        "units": "Matrix operations use ms/round; integrated game uses ms/synthetic-frame; diagnostic blocks are inclusive ms/instrumented-frame and must not be summed. Counts and experiments are separate.",
        "memory": "Process memory deltas include harness/runtime/GC and are not retained structure sizes.",
        "limits": "Node with DOM/GPU stubs: no browser FPS/GPU. Cold and priming remain separate; partial reports and unfavorable results are retained. Reaggregating does not rerun or validate the game."},
        "missingRequiredInputs": missing, "allRequiredInputsPresent": not missing, "primaryOptimizedGameSha256": sorted(hashes), "inputs": inputs, "datasets": datasets, "totalsByCategory": totals}


def fmt(value):
    return "—" if not finite(value) else f"{value:.6f}"


def pair(value):
    return f"{fmt(value['baseline']['median'])} → {fmt(value['optimized']['median'])}"


def interval(value):
    return f"{fmt(value['min'])}–{fmt(value['max'])}"


def label(row):
    name = row.get("name", row.get("scenario", "caso"))
    size = row.get("bodies", row.get("pieces"))
    return f"{name} / {size}" + (f" / {row['hz']} Hz" if "hz" in row else "")


def timing_table(lines, rows):
    lines.extend(["| Caso | p50 A → B | p95 A → B | p99 A → B | CPU media A → B | Rango p50 A | Rango p50 B | Δ p50 pareado B−A |",
                  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |"])
    for row in rows:
        m = row["metrics"]; p50 = m["wallP50"]
        deltas = "; ".join(fmt(v) for v in p50["pairedOptimizedMinusBaseline"]["values"]) or "—"
        incomplete = " **(incompleto)**" if not row["complete"] else ""
        lines.append(f"| {label(row)}{incomplete} | {pair(p50)} | {pair(m['wallP95'])} | {pair(m['wallP99'])} | {pair(m['processCpuMean'])} | {interval(p50['baseline'])} | {interval(p50['optimized'])} | {deltas} |")


def markdown(result):
    lines = ["# Matriz de contactos: resultados reproducibles", "", f"Referencia fija: `{BASELINE}`. A = referencia; B = variante de cada archivo. Los experimentos se distinguen del código final por sus hashes, conservados en `aggregate.json`.", "",
             "Tablas calculadas desde los JSON guardados: mediana entre repeticiones de p50/p95/p99 y CPU media; rangos mínimo–máximo entre repeticiones. Δ es optimizado menos referencia, por pareja. No se mezclan muestras ni se suman ahorros de subsistemas. Los intervalos no son intervalos de confianza.", "",
             "Todos los tiempos son milisegundos. Node usa DOM/GPU simulados; pared y CPU de proceso son magnitudes distintas. No son FPS ni porcentaje de CPU. Con 30 muestras, p99 es el máximo y p95 la segunda mayor. El coste frío tiene una observación por repetición.", ""]
    if result["missingRequiredInputs"]:
        lines.extend(["**Evidencia todavía incompleta:** " + ", ".join(result["missingRequiredInputs"]) + ".", ""])
    for name, dataset in result["datasets"].items():
        rows = dataset["reports"]; kind = dataset["kind"]; info = result["inputs"][name]
        title = " · experimento conservado" if dataset["category"] == "experimental" else " · diagnóstico de referencia" if dataset["category"] == "reference" else ""
        lines.extend([f"## {name}{title}", "", "Configuración: `" + canonical(info["configuration"]) + "`.", ""])
        if not dataset["complete"]:
            lines.extend([f"**Input incompleto:** {len(rows)} configuraciones registradas; esperadas: {dataset['expectedConfigurations']}. Se conservan las mediciones parciales sin considerarlas una comparación completa.", ""])
        if info.get("failure"):
            lines.extend(["**Fallo registrado:** `" + canonical(info["failure"]) + "`.", ""])
        if kind in ("operations", "frames", "diagnostic"):
            lines.extend(["Unidad: **" + (rows[0]["unit"] if rows else "sin muestras") + "**. Los valores parciales no constituyen una comparación completa.", ""])
            timing_table(lines, rows); lines.append("")
            if kind == "operations":
                lines.extend(["### Crecimiento, priming y primera ronda", "", "Cada valor es la mediana de una observación por repetición. Son etapas separadas; `priming` no está oculto en el calentamiento.", "", "| Caso | Crecimiento pared A → B | Priming pared A → B | Primera ronda pared A → B | Primera ronda CPU A → B |", "| --- | ---: | ---: | ---: | ---: |"])
                for row in rows:
                    def stage(name, field):
                        return pair(row[name][field]) if field in row.get(name, {}) else "—"
                    lines.append(f"| {label(row)} | {stage('growthMs','wallMs')} | {stage('primingMs','wallMs')} | {stage('coldMs','wallMs')} | {stage('coldMs','processCpuMs')} |")
                lines.append("")
            if kind == "diagnostic":
                lines.extend(["### Bloques instrumentados inclusivos", "", "La matriz y las fases ya están dentro de `world.step`. No sumar estas columnas al coste total ni compararlas directamente con una corrida sin instrumentación.", "", "| Bloque | Media A → B | p50 A → B | p95 A → B | p99 A → B |", "| --- | ---: | ---: | ---: | ---: |"])
                for row in rows:
                    for block, values in row["inclusiveBlocks"].items():
                        lines.append(f"| {block} | {pair(values['mean'])} | {pair(values['p50'])} | {pair(values['p95'])} | {pair(values['p99'])} |")
                lines.append("")
            for row in rows:
                for stop in row.get("stops", []):
                    lines.extend([f"**Detenido: {label(row)}.** Última escala completa: `{row.get('lastCompleted')}`. `" + canonical(stop) + "`.", ""])
        elif kind == "counts":
            lines.extend(["Conteos separados de tiempos. Los snapshots originales son acumulativos; esta tabla resta `coldCounts` de `totalCounts` para aislar las rondas medidas. Se conserva el detalle de los resets en el agregado.", "", "| Caso | Variante / rep | Rondas | Lecturas numéricas | Escrituras numéricas | Reset | Get | Set | Resize |", "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"])
            for row in rows:
                for count in row.get("counts", []):
                    d = count.get("measuredDelta", {}); calls = d.get("calls", {})
                    values = [count.get("completedSamples"), d.get("numericReads"), d.get("numericWrites"), *[calls.get(k) for k in ("reset", "get", "set", "setNumObjects")]]
                    lines.append(f"| {label(row)} | {count['variant']} / {count['repetition']} | " + " | ".join(str(v) if v is not None else "—" for v in values) + " |")
                for stop in row.get("stops", []):
                    lines.append("\n**Conteo incompleto:** `" + canonical(stop) + "`.\n")
            lines.append("")
        else:
            lines.extend(["| Escenario / Hz | Estado exacto | Resúmenes exactos | Entregas | Joules | Segundos simulados | Pasos | Descarte, s |", "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |"])
            for row in rows:
                summary = row.get("summaryBothVariants") or {}
                values = [summary.get(k) for k in ("delivered", "joules", "simulatedSeconds", "physicsSteps", "droppedSeconds")]
                lines.append(f"| {row.get('scenario')} / {row.get('hz')} | {row.get('identicalFinalState')} | {row['identicalSummaries']} | " + " | ".join(str(v) if v is not None else "—" for v in values) + " |")
            lines.append("")
    lines.extend(["## Integridad y límites de esta agregación", "", "Cada input verifica el commit y el SHA-256 de `game.js` de la referencia. Los inputs principales deben coincidir con el SHA-256 fijado del código final optimizado: `" + OPTIMIZED_GAME + "`; los experimentos se conservan por separado. Si existen JSON y gzip del mismo input, sus bytes decodificados deben coincidir. Recalcular estas tablas no ejecuta ni aprueba pruebas del juego.", "", "Memoria de proceso, inventarios, matrices, relojes, acumuladores, descartes, rangos y diferencias de todos los estadísticos permanecen en `aggregate.json`; las muestras individuales permanecen en los inputs. Los conteos no son tiempos, y los bloques del diagnóstico son inclusivos. Los ensayos incompletos no se convierten en pares válidos.", ""])
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, nargs="?", default=Path(__file__).resolve().parent)
    parser.add_argument("--require-all", action="store_true")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--markdown", type=Path)
    options = parser.parse_args()
    result = build(options.directory.resolve(), options.require_all)
    (options.output or options.directory / "aggregate.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    (options.markdown or options.directory / "RESULTADOS.md").write_text(markdown(result))
    print(json.dumps({"inputs": len(result["inputs"]), "missing": result["missingRequiredInputs"], "totals": result["totalsByCategory"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
