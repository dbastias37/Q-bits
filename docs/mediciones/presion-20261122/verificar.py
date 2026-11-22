"""Verify packaged pressure-pad evidence and exact regeneration; never run Node."""
import gzip
import hashlib
import json
from pathlib import Path
import runpy

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'manifest.json').read_text())
assert manifest['referenceCommit'] == '274a389b77d0f57c9f4c13d56c5caf86070b1b0d'
assert manifest['periodReferenceCommit'] == '1a0425a250b7911a8c230eb5d8534c54e3a03953'
assert manifest['optimizedGameSha256'] == '0fb81005a9a3b2a8baf54bf2b9a10b266905ab9a30e187008c0b4a50bd934085'
assert manifest['optimizedCodeCommitPublished'] == '7a851724ce17a05f0315cd0e0d17b2892566859b'
assert manifest['optimizedCodeTree'] == '1a0c8bf4ec80374ef1982c200ddaabfeff3a20b6'
decoded_files = {}
for item in manifest['files']:
    relative = Path(item['name'])
    assert not relative.is_absolute() and '..' not in relative.parts, relative
    assert item['name'] not in decoded_files, ('duplicate manifest entry', item['name'])
    path = root / relative
    stored = path.read_bytes(); decoded = gzip.decompress(stored) if path.suffix == '.gz' else stored
    assert len(stored) == item['storedBytes'] and len(decoded) == item['decodedBytes'], path
    assert hashlib.sha256(stored).hexdigest() == item['storedSha256'], path
    assert hashlib.sha256(decoded).hexdigest() == item['decodedSha256'], path
    if path.suffix == '.gz':
        assert stored[4:8] == b'\0\0\0\0', (path, 'gzip mtime')
    decoded_files[item['name']] = decoded

expected = set(decoded_files) | {'manifest.json'}; outputs = {}
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
print('Verified', len(manifest['files']), 'files, both baseline gates, complete coverage, and exact summaries')
