import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import example from '../examples/example_pipeline.mjs';
import datapath from '../examples/example_datapath.mjs';
import logic from '../examples/example_logic.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'circuit-figure-'));
const builder = path.join(root, 'lib/build.mjs');
const run = (...args) => spawnSync(process.execPath, [builder, ...args], { encoding: 'utf8' });
try {
  for (const [name, make] of Object.entries({ example_pipeline: example, example_datapath: datapath, example_logic: logic })) {
    const preview = make();
    assert.deepEqual(preview.crossings(), [], `${name}: wire crossings`);
    assert.deepEqual(preview.warnings, [], `${name}: drawing warnings`);
    const stored = fs.readFileSync(path.join(root, 'docs/images', name + '.svg'), 'utf8');
    assert.equal(stored, preview.svg() + '\n', `${name}: run node examples/build_gallery.mjs`);
  }
  const fig = example();
  assert.equal(fig.crossings().length, 0);
  assert.deepEqual(fig.warnings, []);
  assert.match(fig.html(), /<svg/);
  assert.ok(JSON.parse(fig.json()).prims.length > 0);
  let result = run(path.join(root, 'examples/example_pipeline.mjs'), '--out', temp, '--no-png', '--strict');
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.ok(fs.existsSync(path.join(temp, 'example_pipeline.html')));
  assert.ok(fs.existsSync(path.join(temp, 'example_pipeline.json')));
  assert.equal(fs.existsSync(path.join(temp, 'example_pipeline.png')), false);

  const fixture = path.join(temp, 'fixture.mjs');
  fs.writeFileSync(fixture, `import { Fig } from ${JSON.stringify(pathToFileURL(path.join(root, 'lib/figlib.mjs')).href)};
export function make() { return new Fig(30, 20, 'Smoke'); }
export default make;
export const parts = { a: make, b: make };
export function crossing() { const f = make(); f.line([[2, 10], [28, 10]]); f.line([[15, 2], [15, 18]]); return f; }
`);
  result = run(fixture, '--out', temp, '--name', 'panels', '--export', 'make', '--no-png', '--strict');
  assert.equal(result.status, 0, result.stderr + result.stdout);
  for (const name of ['panels', 'panels_a', 'panels_b']) {
    assert.match(fs.readFileSync(path.join(temp, name + '.html'), 'utf8'), /<svg/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(temp, name + '.json'), 'utf8')).w, 30);
  }
  result = run(fixture, '--out', temp, '--name', 'crossing', '--export', 'crossing', '--no-png', '--strict');
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.match(result.stdout, /crossings=1/);
  console.log('SMOKE_PASS: gallery freshness, example, parts, named export, output name, no-png, strict crossings');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
