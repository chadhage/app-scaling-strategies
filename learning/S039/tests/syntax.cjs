'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const lesson = path.resolve(__dirname, '..');
function collect(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name !== 'evidence')
    .flatMap((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? collect(file) : [file];
    });
}
const files = collect(lesson).filter((file) => /\.(?:js|cjs)$/.test(file));
for (const file of files) {
  const run = spawnSync(process.execPath, ['--check', file], { windowsHide: true, encoding: 'utf8', timeout: 10000 });
  if (run.error || run.status !== 0) throw new Error(`${file}: ${run.error || run.stderr}`);
}
console.log(`Syntax OK: ${files.length} active JavaScript files; historical RED snapshots excluded.`);
