"""Verify stored/decoded startup evidence and exact summaries; never run Node."""
import gzip
import hashlib
import json
from pathlib import Path
import runpy

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'manifest.json').read_text())
assert manifest['referenceCommit'] == '4fc563cc8d27e653129fc11a14524a7cfc626a5e'
assert manifest['optimizedGameSha256'] == '847e7b1f99778315678478b01b7a781ecd3c2e1f0deab595e16446ecb9c52fed'
decoded_files = {}
for item in manifest['files']:
    relative = Path(item['name'])
    assert not relative.is_absolute() and '..' not in relative.parts, relative
    assert item['name'] not in decoded_files, ('duplicate manifest entry', item['name'])
    path = root / relative
    stored = path.read_bytes()
    decoded = gzip.decompress(stored) if path.suffix == '.gz' else stored
    assert len(stored) == item['storedBytes'], path
    assert len(decoded) == item['decodedBytes'], path
    assert hashlib.sha256(stored).hexdigest() == item['storedSha256'], path
    assert hashlib.sha256(decoded).hexdigest() == item['decodedSha256'], path
    if path.suffix == '.gz':
        assert stored[4:8] == b'\0\0\0\0', (path, 'gzip mtime')
    decoded_files[item['name']] = decoded

# Permit a regenerated plain aggregate only when its bytes exactly match the
# published compressed result. Every other file, including empty logs, must be
# covered by the manifest; no raw failure disappears during packaging.
expected = set(decoded_files) | {'manifest.json'}
outputs = {}
for output in manifest.get('generatedOutputs', []):
    generated, published = root / output['name'], output['storedAs']
    assert published in decoded_files, published
    outputs[output['name']] = decoded_files[published]
    if generated.exists() and output['name'] != published:
        assert generated.read_bytes() == decoded_files[published], generated
        expected.add(output['name'])
actual = {path.relative_to(root).as_posix() for path in root.rglob('*') if path.is_file()}
assert actual == expected, {'unlisted': sorted(actual - expected), 'missing': sorted(expected - actual)}

summary = runpy.run_path(str(root / 'resumir.py'))
result = summary['build'](root, require_all=True)
aggregate = (json.dumps(result, ensure_ascii=False, indent=2) + '\n').encode()
assert aggregate == outputs['aggregate.json'], 'regenerated aggregate differs'
assert summary['markdown'](result).encode() == outputs['RESULTADOS.md'], 'regenerated tables differ'
print('Verified', len(manifest['files']), 'evidence files, complete coverage, and exact regenerated summaries')
