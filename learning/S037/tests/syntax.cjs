'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const lesson = path.resolve(__dirname, '..');
function scripts(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name !== 'evidence')
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? scripts(target) : /\.(?:js|cjs)$/.test(target) ? [target] : [];
    }).sort();
}
const files = scripts(lesson);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    windowsHide: true, timeout: 15000, encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`${path.relative(lesson, file)}: ${result.error || result.stderr}`);
  }
  console.log(`Syntax OK: ${path.relative(lesson, file)}`);
}
console.log(`Checked ${files.length} files; Node ${process.version} is test tooling only.`);
