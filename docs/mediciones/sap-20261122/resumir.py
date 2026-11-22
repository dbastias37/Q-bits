#!/usr/bin/env python3
"""Summarize existing SAP evidence; never runs the game or performance tests.

Usage: python3 resumir-sap.py [results_directory] [--output FILE] [--require-all]
Reads NAME.json or NAME.json.gz. Output is deterministic for the same decoded
inputs. Samples remain in the source files; only repetition statistics appear
here. The script can be placed beside the published evidence and run unchanged.
"""
import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path
import statistics


INPUTS = (
    "sap-timings", "sap-counts", "sap-welded-timings",
    "matrix-settled-60", "matrix-settled-120", "matrix-settled-240",
    "matrix-settling-120", "matrix-controls-120", "control-long-120",
    "equivalence", "profile-500-120", "profile-1500-240",
)
OPTIONAL_INPUTS = ("sap-control16-long", "sap-active500-long", "sap-sleep2000-long", "isolated-large-60")
VARIANTS = ("baseline", "optimized")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def stat(values):
    values = [v for v in values if finite(v)]
    if not values:
        return {"n": 0, "median": None, "min": None, "max": None, "values": []}
    return {"n": len(values), "median": statistics.median(values), "min": min(values), "max": max(values), "values": values}


def get(obj, dotted):
    for key in dotted.split("."):
        if not isinstance(obj, dict) or key not in obj:
            return None
        obj = obj[key]
    return obj


def unique(records):
    """Collapse identical records while retaining the source run labels."""
    groups = {}
    for label, value in records:
        if value is None:
            continue
        key = canonical(value)
        if key not in groups:
            groups[key] = {"runs": [], "value": value}
        groups[key]["runs"].append(label)
    return list(groups.values())


def metric(runs, getter):
    values = {v: [(r.get("repetition", i + 1), getter(r)) for i, r in enumerate(runs.get(v, []))] for v in VARIANTS}
    result = {v: stat([x for _, x in values[v]]) for v in VARIANTS}
    by_rep = {v: {rep: x for rep, x in values[v] if finite(x)} for v in VARIANTS}
    paired = sorted(set(by_rep["baseline"]) & set(by_rep["optimized"]))
    diffs = [by_rep["optimized"][rep] - by_rep["baseline"][rep] for rep in paired]
    result["pairedOptimizedMinusBaseline"] = {"repetitions": paired, **stat(diffs)}
    result["medianDifference"] = (result["optimized"]["median"] - result["baseline"]["median"]
                                  if result["baseline"]["n"] and result["optimized"]["n"] else None)
    return result


def common_report(report):
    names = ("family", "scenario", "state", "phase", "pieces", "hz", "identicalFinalState", "queriesPreservePhysicalState", "identicalOrderedPairs", "nativePairOracle", "stateSha256", "lastCompleted")
    result = {name: report[name] for name in names if name in report}
    result["complete"] = "stopped" not in report
    if "stopped" in report:
        # Preserve where the budget stopped, without duplicating partial samples.
        result["stopped"] = {k: v for k, v in report["stopped"].items() if "Samples" not in k}
    runs = report.get("runs", {})
    result["completedRuns"] = {v: len(runs.get(v, [])) for v in VARIANTS}
    result["pairedCompletedRuns"] = min(result["completedRuns"].values(), default=0)
    for key in ("initial", "firstFrameInventory", "final", "clockBefore", "clockAfter", "clockDelta"):
        collected = unique((f"{v}:{r.get('repetition', i + 1)}", r.get(key)) for v in VARIANTS for i, r in enumerate(runs.get(v, [])))
        if collected:
            result[key] = collected
    result["caseCostsMs"] = {key: metric(runs, lambda r, key=key: r.get(key)) for key in ("setupMs", "warmupMs", "totalCaseMs") if any(key in r for v in VARIANTS for r in runs.get(v, []))}
    return result


def timing_report(report, unit):
    result = common_report(report)
    runs = report.get("runs", {})
    suffix = "PerQuery" if unit == "query" else "PerSimulatedFrame"
    fields = {
        "wallP50": f"wallMs{suffix}.p50", "wallP95": f"wallMs{suffix}.p95",
        "wallP99": f"wallMs{suffix}.p99", "wallMean": f"wallMs{suffix}.mean",
        "processCpuMean": f"processCpuMs{suffix}.mean",
    }
    if unit == "query":
        fields.update(processUserMean="processUserMsPerQuery.mean", processSystemMean="processSystemMsPerQuery.mean")
    result["metricsMsPer" + ("Query" if unit == "query" else "Frame")] = {name: metric(runs, lambda r, field=field: get(r, field)) for name, field in fields.items()}
    result["coldMs"] = {name: metric(runs, lambda r, name=name: get(r, "cold." + name)) for name in ("wallMs", "cpuMs", "cpuUserMs", "cpuSystemMs") if any(get(r, "cold." + name) is not None for v in VARIANTS for r in runs.get(v, []))}
    if not result["coldMs"]:
        del result["coldMs"]
    if unit == "query":
        result["pairs"] = unique((f"{v}:{r.get('repetition', i + 1)}", {k: r[k] for k in ("coldPairs", "finalPairs", "coldPairsSha256", "finalPairsSha256") if k in r}) for v in VARIANTS for i, r in enumerate(runs.get(v, [])))
    return result


def counts_report(report):
    result = common_report(report)
    runs = report.get("runs", {})
    result["counts"] = unique((f"{v}:{r.get('repetition', i + 1)}", {
        "queries": r.get("measuredQueries"), "cold": r.get("coldCounts"), "totalMeasured": r.get("counts"),
        "meanPerMeasuredQuery": {k: x / r["measuredQueries"] for k, x in r.get("counts", {}).items()} if r.get("measuredQueries") else None,
        "coldPairs": r.get("coldPairs"), "finalPairs": r.get("finalPairs"),
        "coldPairsSha256": r.get("coldPairsSha256"), "finalPairsSha256": r.get("finalPairsSha256"),
    }) for v in VARIANTS for i, r in enumerate(runs.get(v, [])))
    return result


def summarize_runner(data):
    counted = data.get("mode") == "counts"
    query = data.get("mode") in ("counts", "timings")
    reports = [counts_report(r) if counted else timing_report(r, "query" if query else "frame") for r in data.get("reports", [])]
    complete = [r for r in reports if r["complete"]]
    totals = {"configurations": len(reports), "completeConfigurations": len(complete), "stoppedConfigurations": len(reports) - len(complete), "completePairs": sum(r["pairedCompletedRuns"] for r in complete), "measuredOperationsInCompleteCasesBothVariants": 0, "physicsStepsInCompleteCasesBothVariants": 0, "simulatedSecondsInCompleteCasesBothVariants": 0.0, "discardedSecondsInCompleteCasesBothVariants": 0.0}
    for raw in data.get("reports", []):
        if "stopped" in raw:
            continue
        for v in VARIANTS:
            for r in raw.get("runs", {}).get(v, []):
                totals["measuredOperationsInCompleteCasesBothVariants"] += r.get("measuredQueries", get(r, "wallMsPerSimulatedFrame.count") or 0)
                delta = r.get("clockDelta", {})
                totals["physicsStepsInCompleteCasesBothVariants"] += delta.get("physics", 0)
                totals["simulatedSecondsInCompleteCasesBothVariants"] += delta.get("simulatedSeconds", 0)
                totals["discardedSecondsInCompleteCasesBothVariants"] += delta.get("droppedSeconds", 0)
    return {"totals": totals, "reports": reports}


def summarize_equivalence(data):
    result = []
    for raw in data.get("reports", []):
        same = raw.get("baseline") == raw.get("optimized")
        row = {k: raw[k] for k in ("scenario", "hz", "identicalFinalState", "stateSha256") if k in raw}
        row["identicalSummaries"] = same
        if same:
            row["summaryBothVariants"] = raw.get("baseline")
        else:
            row.update(baseline=raw.get("baseline"), optimized=raw.get("optimized"))
        result.append(row)
    return {"pairs": len(result), "reports": result}


def summarize_profile(data):
    result = {"identicalFinalStateBetweenVariants": data.get("identicalFinalStateBetweenVariants"), "inclusiveBlocksMustNotBeSummed": True, "captures": [], "diagnostics": {}}
    for raw in data.get("reports", []):
        row = {k: raw[k] for k in ("variant", "scenario", "pieces", "hz", "inventory", "identicalStateAcrossProfileCaptures", "stopped") if k in raw}
        for kind, capture in raw.get("captures", {}).items():
            # CPU self samples, allocation samples and elapsed block timings
            # have different meanings. Keep them in separate structures.
            row[kind] = {k: capture[k] for k in ("profileFile", "gc", "operations", "inventoryBefore", "inventory", "clockDelta", "stateSha256", "windowWallMs", "heapBefore", "heapAfter", "stopped") if k in capture}
            row[kind]["topSampledFunctions"] = capture.get("top", [])[:20]
            if "heapBefore" in capture and "heapAfter" in capture:
                row[kind]["memoryDeltaBytes"] = {k: capture["heapAfter"][k] - before for k, before in capture["heapBefore"].items() if k in capture["heapAfter"]}
        result["captures"].append(row)
    diagnostics = {x["variant"]: x for x in data.get("diagnostics", [])}
    by_mode = {instrumented: {v: [r for r in diagnostics.get(v, {}).get("runs", []) if r.get("instrumented") is instrumented] for v in VARIANTS} for instrumented in (False, True)}
    for instrumented, runs in by_mode.items():
        label = "instrumented" if instrumented else "uninstrumented"
        entry = {"wallMsPerFrame": metric(runs, lambda r: r["wallMs"] / r["frames"]), "processCpuMsPerFrame": metric(runs, lambda r: r["processCpuMs"] / r["frames"])}
        entry["clocks"] = unique((f"{v}:{r.get('repetition', i + 1)}", {"frames": r.get("frames"), "clockDelta": r.get("clockDelta"), "observedCannonSteps": r.get("observedCannonSteps"), "inventory": r.get("inventory")}) for v in VARIANTS for i, r in enumerate(runs.get(v, [])))
        if instrumented:
            blocks = sorted({key for v in VARIANTS for r in runs.get(v, []) for key in (r.get("blocks") or {})})
            entry["inclusiveBlocks"] = {}
            for name in blocks:
                entry["inclusiveBlocks"][name] = {
                    "inclusiveMsPerFrame": metric(runs, lambda r, name=name: (r.get("blocks") or {}).get(name, {}).get("inclusiveMs", 0) / r["frames"]),
                    "callsPerFrame": metric(runs, lambda r, name=name: (r.get("blocks") or {}).get(name, {}).get("calls", 0) / r["frames"]),
                    "inclusiveMsPerCall": metric(runs, lambda r, name=name: ((r.get("blocks") or {}).get(name, {}).get("inclusiveMs", 0) / r["blocks"][name]["calls"]) if (r.get("blocks") or {}).get(name, {}).get("calls") else None),
                }
            phases = sorted({key for v in VARIANTS for r in runs.get(v, []) for key in (r.get("cannonPhaseSumMs") or {})})
            entry["nativeCannonPhases"] = {name: {
                "msPerFrame": metric(runs, lambda r, name=name: r["cannonPhaseSumMs"][name] / r["frames"] if name in (r.get("cannonPhaseSumMs") or {}) else None),
                "msPerStep": metric(runs, lambda r, name=name: (r.get("cannonPhaseMeanMsPerStep") or {}).get(name)),
            } for name in phases}
        result["diagnostics"][label] = entry
    result["instrumentationOverheadMsPerFrame"] = {}
    for v in VARIANTS:
        off = {r["repetition"]: r for r in by_mode[False][v]}
        on = {r["repetition"]: r for r in by_mode[True][v]}
        paired = sorted(set(off) & set(on))
        result["instrumentationOverheadMsPerFrame"][v] = {"repetitions": paired, "wall": stat([on[n]["wallMs"] / on[n]["frames"] - off[n]["wallMs"] / off[n]["frames"] for n in paired]), "processCpu": stat([on[n]["processCpuMs"] / on[n]["frames"] - off[n]["processCpuMs"] / off[n]["frames"] for n in paired])}
    result["identicalStateWithInstrumentation"] = {v: diagnostics.get(v, {}).get("identicalStateWithInstrumentation") for v in VARIANTS}
    return result


def budget_crossings(datasets, threshold):
    result = []
    for name, dataset in datasets.items():
        if not name.startswith("matrix-"):
            continue
        groups = {}
        for row in dataset.get("reports", []):
            if not row.get("complete"):
                continue
            key = (row.get("scenario"), row.get("phase"), row.get("hz"))
            groups.setdefault(key, []).append(row)
        for (scenario, phase, hz), rows in groups.items():
            entry = {"input": name, "scenario": scenario, "phase": phase, "hz": hz, "thresholdMs": threshold, "testedCompletedScales": sorted(row["pieces"] for row in rows)}
            for variant in VARIANTS:
                exceeded = [row["pieces"] for row in rows if row["metricsMsPerFrame"]["wallP95"][variant]["median"] > threshold]
                entry[variant + "FirstTestedScaleAbove"] = min(exceeded) if exceeded else None
                entry[variant + "ScalesAbove"] = sorted(exceeded)
                entry[variant + "ScalesAtOrBelow"] = sorted(row["pieces"] for row in rows if row["pieces"] not in exceeded)
                entry[variant + "ReturnsAtOrBelowAfterFirstExceedance"] = [n for n in entry[variant + "ScalesAtOrBelow"] if exceeded and n > min(exceeded)]
            result.append(entry)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", nargs="?", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--require-all", action="store_true")
    options = parser.parse_args()
    directory = options.directory.resolve()
    output = options.output or directory / "analysis-summary.json"
    result = {"schema": 1, "method": {
        "aggregation": "Median/min/max of repetition statistics, not percentiles pooled across runs. Per-repetition values and paired optimized-minus-baseline differences are retained.",
        "timing": "Wall elapsed and process user+system CPU are separate. None is utilization or browser FPS. Query preparation is outside the query timer; AABB, sorting and index maintenance are inside.",
        "smallSamples": "With 30 samples, nearest-rank p99 is the maximum and p95 is the second-largest sample. Cold has one observation per repetition.",
        "profiles": "Instrumented inclusive blocks overlap and must not be summed. Native Cannon phases, sampled CPU self times, sampled allocations, GC, and process memory remain separate diagnostic evidence. Allocation sampling is not a census; process memory deltas include V8/harness/profiler effects and are not cache sizes.",
        "budget": "First TESTED completed scale whose median repetition p95 exceeds 16.67 ms of partial Node frame work; not a browser capacity certification.",
        "inputs": "Reads raw or gzip JSON. Per-operation samples are not duplicated. Missing inputs are listed; --require-all rejects an incomplete evidence set.",
    }, "inputs": {}, "missingInputs": [], "missingOptionalInputs": [], "datasets": {}}
    for name in INPUTS + OPTIONAL_INPUTS:
        plain, zipped = directory / (name + ".json"), directory / (name + ".json.gz")
        chosen = plain if plain.exists() else zipped if zipped.exists() else None
        if chosen is None:
            result["missingOptionalInputs" if name in OPTIONAL_INPUTS else "missingInputs"].append(name)
            continue
        raw = chosen.read_bytes()
        decoded = gzip.decompress(raw) if chosen.suffix == ".gz" else raw
        data = json.loads(decoded)
        result["inputs"][name] = {"logicalFile": name + ".json", "decodedBytes": len(decoded), "decodedSha256": digest(decoded), "sources": data.get("sources"), "configuration": data.get("configuration"), "runtime": data.get("runtime"), "mode": data.get("mode"), "failure": data.get("failure")}
        if name.startswith("profile-"):
            summarized = summarize_profile(data)
        elif name == "equivalence":
            summarized = summarize_equivalence(data)
        else:
            summarized = summarize_runner(data)
        result["datasets"][name] = summarized
    if options.require_all and result["missingInputs"]:
        parser.error("Missing evidence: " + ", ".join(result["missingInputs"]))
    result["partialNodeBudgetCrossings"] = budget_crossings(result["datasets"], 16.67)
    result["totalCompleteRunnerPairs"] = sum(d.get("totals", {}).get("completePairs", d.get("pairs", 0)) for d in result["datasets"].values())
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), "inputs": len(result["inputs"]), "missingInputs": result["missingInputs"], "missingOptionalInputs": result["missingOptionalInputs"], "completeRunnerPairs": result["totalCompleteRunnerPairs"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
