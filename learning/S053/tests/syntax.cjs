'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const folder = path.resolve(__dirname, '..');
function scripts(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name !== 'evidence')
    .flatMap((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? scripts(file) : /\.(js|cjs)$/.test(entry.name) ? [file] : [];
    });
}
const files = scripts(folder).sort();
for (const file of files) {
  const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.equal(checked.status, 0, `${file}\n${checked.stderr}`);
}
console.log(JSON.stringify({ syntax: 'passed', files: files.map((file) => path.relative(folder, file)) }, null, 2));
