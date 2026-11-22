"""Verify stored/decoded evidence and regenerated summaries; never run the game."""
import gzip
import hashlib
import json
from pathlib import Path
import runpy

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'manifest.json').read_text())
decoded_files = {}
for item in manifest['files']:
    path = root / item['name']
    stored = path.read_bytes()
    decoded = gzip.decompress(stored) if path.suffix == '.gz' else stored
    assert len(stored) == item['storedBytes'], path
    assert len(decoded) == item['decodedBytes'], path
    assert hashlib.sha256(stored).hexdigest() == item['storedSha256'], path
    assert hashlib.sha256(decoded).hexdigest() == item['decodedSha256'], path
    if path.suffix == '.gz':
        assert stored[4:8] == b'\0\0\0\0', (path, 'gzip mtime')
    decoded_files[item['name']] = decoded

# A user may regenerate aggregate.json beside the published compressed file.
# Accept that extra generated file only when it is byte-identical to its source;
# every other evidence file must be listed, so missing logs cannot go unnoticed.
expected = set(decoded_files) | {'manifest.json'}
for output in manifest.get('generatedOutputs', []):
    generated, published = root / output['name'], output['storedAs']
    if generated.exists() and output['name'] != published:
        assert generated.read_bytes() == decoded_files[published], generated
        expected.add(output['name'])
actual = {path.relative_to(root).as_posix() for path in root.rglob('*') if path.is_file()}
assert actual == expected, {'unlisted': sorted(actual - expected), 'missing': sorted(expected - actual)}

summary = runpy.run_path(str(root / 'resumir.py'))
result = summary['build'](root, require_all=True)
aggregate = (json.dumps(result, ensure_ascii=False, indent=2) + '\n').encode()
assert aggregate == decoded_files['aggregate.json.gz'], 'regenerated aggregate differs'
assert summary['markdown'](result).encode() == decoded_files['RESULTADOS.md'], 'regenerated tables differ'
print('Verified', len(manifest['files']), 'evidence files, complete coverage, and exact regenerated summaries')
