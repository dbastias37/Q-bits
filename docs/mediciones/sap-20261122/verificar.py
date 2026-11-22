#!/usr/bin/env python3
"""Verify stored/decoded evidence and regenerate the aggregate; never run the game."""

import argparse
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile


METADATA = {
    "schema": 1,
    "baselineCommit": "a98861012eb4968f8d58e4fc6ce1aa5c20460a35",
    "baselineTree": "aa4277daacc737d8487682d52ef5e86e0791f3ff",
    "measuredCodeCommit": "bba9f8f02d81e47a21921ff4cc4ceb8e05629787",
    "measuredCodeTree": "255c317281a0a1ad17d7d347bc11cf57042882a4",
    "baselineGameSha256": "db3f26eee06a5b7768cb27ef3dcb18be15dd1d46d32f92efc33201f6e129f4e7",
    "measuredGameSha256": "84bfc37c0661329ffa2cba69f22e50d2256e35944fad556778926a1fa632be0c",
    "aggregateInputs": 16,
    "aggregateCompleteRunnerPairs": 346,
    "excludedFromAggregate": [
        "matrix-diagnostic-2000-60", "sap-crossover-2000-60",
        "architecture-baseline", "architecture-final", "ground-baseline",
        "ground-final", "benchmark-retention", "unit-test logs",
    ],
    "compression": "gzip, mtime=0; SHA-256 covers both stored and decoded bytes",
    "selfReference": "manifest.json is excluded from its own file list",
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def files(directory):
    return sorted(p for p in directory.rglob("*")
                  if p.is_file() and p.name != "manifest.json"
                  and "__pycache__" not in p.parts)


def record(directory, path):
    stored = path.read_bytes()
    decoded = gzip.decompress(stored) if path.suffix == ".gz" else stored
    if path.suffix == ".gz" and int.from_bytes(stored[4:8], "little") != 0:
        raise ValueError(f"Nonzero gzip mtime: {path.name}")
    return {
        "path": path.relative_to(directory).as_posix(),
        "bytes": len(stored), "sha256": digest(stored),
        "decodedBytes": len(decoded), "decodedSha256": digest(decoded),
    }


def read_json(directory, name):
    return json.loads(gzip.decompress((directory / (name + ".json.gz")).read_bytes()))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", nargs="?", type=Path,
                        default=Path(__file__).resolve().parent)
    parser.add_argument("--refresh", action="store_true",
                        help="Rebuild the manifest after deliberately adding evidence, then verify.")
    options = parser.parse_args()
    directory = options.directory.resolve()
    manifest_path = directory / "manifest.json"
    actual = [record(directory, p) for p in files(directory)]
    if options.refresh:
        manifest_path.write_text(json.dumps({**METADATA, "files": actual},
                                           ensure_ascii=False, indent=2) + "\n",
                                 encoding="utf-8")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest["files"] != actual:
        wanted = {r["path"]: r for r in manifest["files"]}
        observed = {r["path"]: r for r in actual}
        different = sorted(k for k in wanted.keys() | observed.keys()
                           if wanted.get(k) != observed.get(k))
        raise ValueError("Evidence differs from manifest: " + ", ".join(different))
    with tempfile.TemporaryDirectory(prefix="qbits-sap-aggregate-") as scratch:
        output = Path(scratch) / "aggregate.json"
        completed = subprocess.run(
            [sys.executable, str(directory / "resumir.py"), str(directory),
             "--output=" + str(output), "--require-all"],
            check=True, text=True, capture_output=True,
        )
        regenerated = output.read_bytes()
        expected = gzip.decompress((directory / "aggregate.json.gz").read_bytes())
        if regenerated != expected:
            raise ValueError("Regenerated aggregate differs from aggregate.json.gz")
        aggregate = json.loads(regenerated)
        if len(aggregate["inputs"]) != 16 or aggregate["totalCompleteRunnerPairs"] != 346:
            raise ValueError("Unexpected input count or complete-pair count")
        if aggregate["missingInputs"] or aggregate["missingOptionalInputs"]:
            raise ValueError("An input is missing from the complete evidence set")
    before = read_json(directory, "architecture-baseline")
    after = read_json(directory, "architecture-final")
    if before["reports"] != after["reports"]:
        raise ValueError("Architecture benchmark reports differ")
    before = read_json(directory, "ground-baseline")
    after = read_json(directory, "ground-final")
    if any(before[k] != after[k] for k in ("summary", "cases")):
        raise ValueError("Ground-contact benchmark results differ")
    print(json.dumps({
        "verified": True, "evidenceFiles": len(actual),
        "storedBytesExcludingManifest": sum(r["bytes"] for r in actual),
        "decodedBytesExcludingManifest": sum(r["decodedBytes"] for r in actual),
        "aggregateInputs": len(aggregate["inputs"]),
        "completeRunnerPairs": aggregate["totalCompleteRunnerPairs"],
        "aggregateByteIdentical": True,
        "architectureReportsIdentical": True, "groundCasesIdentical": True,
        "runsGameOrPerformanceTests": False,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
