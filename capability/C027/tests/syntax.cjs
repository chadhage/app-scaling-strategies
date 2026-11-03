'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = fs.readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(?:js|cjs)$/.test(entry.name))
  .map((entry) => path.join(entry.parentPath, entry.name)).sort();
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${path.relative(root, file)}: ${result.stderr}`);
}
console.log(JSON.stringify({ label: '[C027][S]', syntax: 'passed', files: files.map((file) => path.relative(root, file)), runtime: process.version, proofWrites: false }));
