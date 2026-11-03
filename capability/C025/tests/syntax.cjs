'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const scripts = fs.readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(?:cjs|js)$/.test(entry.name))
  .map((entry) => path.join(entry.parentPath, entry.name)).sort();
for (const script of scripts) {
  const result = spawnSync(process.execPath, ['--check', script], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${path.relative(root, script)}: ${result.stderr}`);
}
console.log(JSON.stringify({ label: '[C025][S]', checkedScripts: scripts.length, syntax: 'passed', runtime: process.version }));
