import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(directory, '..');

test('prototype entry point loads only its view and existing inert assets, never the game or Cannon', async () => {
  const html = await readFile(path.join(directory, 'index.html'), 'utf8');
  const sources = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]);
  assert.ok(sources.includes('app.mjs'));
  const allowedShared = new Set(['assets/js/rotor-power.js', 'assets/js/propeller-power.js', 'assets/js/tablet-model.js']);
  const visited = new Set();
  async function inspect(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const relative = path.relative(repo, file).replaceAll(path.sep, '/');
    assert.ok(relative.startsWith('tablet-v2/') || allowedShared.has(relative), `unexpected game dependency: ${relative}`);
    assert.notEqual(path.basename(file), 'game.js');
    assert.doesNotMatch(path.basename(file), /^cannon/i);
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /\bnew\s+CANNON\s*\./, `physics constructor found in ${relative}`);
    const imports = [...source.matchAll(/\bimport\s+(?:[^;'"\n]+?\s+from\s+)?['"]([^'"]+)['"]/g)].map(match => match[1]);
    for (const dependency of imports) {
      assert.ok(dependency.startsWith('.'), `external runtime dependency: ${dependency}`);
      await inspect(path.resolve(path.dirname(file), dependency));
    }
  }
  for (const source of sources) {
    assert.ok(!/^(?:https?:)?\/\//.test(source), 'demo must not fetch its runtime from a CDN');
    await inspect(path.resolve(directory, source));
  }
  assert.ok(visited.has(path.join(directory, 'model.mjs')));
  assert.ok(visited.has(path.join(directory, 'renderer.mjs')));
});
