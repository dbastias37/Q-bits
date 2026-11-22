#!/usr/bin/env python3
"""Print portable commands from the original 16 jobs; --run executes them serially."""

import argparse
import json
from pathlib import Path
import shlex
import subprocess
import time


def main():
    package = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=package.parents[2])
    parser.add_argument("--baseline-root", type=Path)
    parser.add_argument("--output-root", type=Path)
    parser.add_argument("--select", default="all", help="Comma-separated names from commands.json, or all.")
    parser.add_argument("--run", action="store_true", help="Execute the selected commands, sequentially.")
    parser.add_argument("--timeout", type=float, default=600,
                        help="Additional wall-clock limit in seconds per process.")
    options = parser.parse_args()
    repo = options.repo_root.resolve()
    baseline = (options.baseline_root or repo.parent / "qbits-sap-baseline").resolve()
    destination = (options.output_root or repo.parent / "sap-reproduction").resolve()
    if destination == package or package in destination.parents:
        parser.error("Output must be outside the committed evidence directory")
    if options.timeout <= 0:
        parser.error("--timeout must be positive")
    original = json.loads((package / "commands.json").read_text(encoding="utf-8"))
    names = {entry["name"] for entry in original}
    chosen = names if options.select == "all" else set(options.select.split(","))
    unknown = chosen - names
    if unknown:
        parser.error("Unknown names: " + ", ".join(sorted(unknown)))
    jobs = []
    for entry in original:
        if entry["name"] not in chosen:
            continue
        command = []
        for argument in entry["command"]:
            if argument.startswith("--baseline-root="):
                argument = "--baseline-root=" + str(baseline)
            elif argument.startswith("--output="):
                argument = "--output=" + str(destination / (entry["name"] + ".json"))
            command.append(argument)
        jobs.append({"name": entry["name"], "command": command, "cwd": str(repo)})
    print("# cwd: " + str(repo))
    for job in jobs:
        print(shlex.join(job["command"]))
    if not options.run:
        return
    if not (repo / "tests/game-harness.cjs").is_file():
        parser.error("--repo-root must point to the tested repository checkout")
    if not (baseline / "assets/js/game.js").is_file():
        parser.error("--baseline-root must point to the baseline worktree")
    destination.mkdir(parents=True, exist_ok=True)
    outputs = [destination / (job["name"] + suffix)
               for job in jobs for suffix in (".json", ".log")]
    outputs.append(destination / "reproduction-commands.json")
    if any(p.exists() for p in outputs):
        parser.error("Selected outputs already exist; choose a fresh --output-root")
    records = []
    for job in jobs:
        begin = time.perf_counter()
        timeout = False
        with (destination / (job["name"] + ".log")).open("w", encoding="utf-8") as log:
            try:
                result = subprocess.run(job["command"], cwd=repo, stdout=log,
                                        stderr=subprocess.STDOUT, timeout=options.timeout)
                code = result.returncode
            except subprocess.TimeoutExpired:
                code, timeout = None, True
        records.append({**job, "exitCode": code, "timedOut": timeout,
                        "elapsedSeconds": time.perf_counter() - begin})
        (destination / "reproduction-commands.json").write_text(
            json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if timeout or code != 0:
            raise SystemExit("Stopped after incomplete job: " + job["name"])


if __name__ == "__main__":
    main()
