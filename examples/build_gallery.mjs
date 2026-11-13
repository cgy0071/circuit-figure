// Regenerate the README previews without a browser or third-party dependencies.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pipeline from './example_pipeline.mjs';
import datapath from './example_datapath.mjs';
import logic from './example_logic.mjs';

const directory = new URL('../docs/images/', import.meta.url);
fs.mkdirSync(directory, { recursive: true });
for (const [name, make] of Object.entries({ example_pipeline: pipeline, example_datapath: datapath, example_logic: logic })) {
  const figure = make();
  assert.deepEqual(figure.crossings(), [], `${name}: wire crossings`);
  assert.deepEqual(figure.warnings, [], `${name}: drawing warnings`);
  const target = new URL(`${name}.svg`, directory);
  fs.writeFileSync(target, figure.svg() + '\n', 'utf8');
  console.log(`Gallery: ${fileURLToPath(target)}`);
}
