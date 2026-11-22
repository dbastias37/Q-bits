import sys, json, subprocess, pathlib, time, datetime, hashlib

spec = json.loads(pathlib.Path(sys.argv[1]).read_text())
manifest = pathlib.Path(spec['manifest'])
records = json.loads(manifest.read_text()) if manifest.exists() else []
for job in spec['jobs']:
    print('START ' + job['name'], flush=True)
    for expected in job.get('expectedSources', []):
        location = pathlib.Path(expected['root'])
        actual_commit = subprocess.check_output(['git', '-C', str(location), 'rev-parse', 'HEAD'], text=True).strip()
        assert actual_commit == expected['commit'], ('source commit changed', str(location), actual_commit)
        for filename, wanted in expected['sha256'].items():
            actual = hashlib.sha256((location / filename).read_bytes()).hexdigest()
            assert actual == wanted, ('source bytes changed', str(location), filename)

    entry = {**job, 'startedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    start = time.monotonic()
    output = pathlib.Path(job['stdout'])
    output.parent.mkdir(parents=True, exist_ok=True)
    error = pathlib.Path(job.get('stderr', str(output) + '.stderr'))
    with output.open('wb') as out, error.open('wb') as err:
        try:
            result = subprocess.run(job['argv'], cwd=job['cwd'], stdout=out, stderr=err,
                                    timeout=job.get('timeoutSeconds', 1200), check=False)
            entry['exitCode'] = result.returncode
        except subprocess.TimeoutExpired:
            entry['exitCode'] = 124
            entry['timedOut'] = True
    entry['wallSeconds'] = time.monotonic() - start
    entry['endedUtc'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    records.append(entry)
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps(records, indent=2) + '\n')
    print('DONE ' + job['name'] + ' exit=' + str(entry['exitCode']) +
          ' seconds=' + str(round(entry['wallSeconds'], 3)), flush=True)
    if entry['exitCode'] and not job.get('allowFailure', False):
        sys.exit(entry['exitCode'])
