'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function scripts(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? scripts(file) : /\.[cm]?js$/.test(entry.name) ? [file] : [];
  });
}
const files = scripts(root);
for (const file of files) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  console.log(`${check.status === 0 ? 'PASS' : 'FAIL'} ${path.relative(process.cwd(), file)}`);
  if (check.status !== 0) {
    process.stderr.write(check.stderr);
    process.exitCode = 1;
  }
}
console.log(`Checked ${files.length} C020 scripts, including retained RED sources, on ${process.version}.`);
