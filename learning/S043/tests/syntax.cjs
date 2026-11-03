'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const sources = ['upload.js', 'app.js', 'capture.cjs', 'verify.cjs',
  ...fs.readdirSync(__dirname).filter((file) => file.endsWith('.cjs')).map((file) => path.join('tests', file))];
for (const file of sources) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, `${file}: ${result.stderr}`);
}
JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
if (fs.existsSync(path.join(root, 'evidence.json'))) JSON.parse(fs.readFileSync(path.join(root, 'evidence.json'), 'utf8'));
process.stdout.write(`Syntax PASS: ${sources.length} JavaScript/CommonJS files and declared JSON.\n`);
