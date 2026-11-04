'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function sources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'evidence' || entry.name.startsWith('.owned-browser-')) return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sources(file) : /\.(?:js|cjs)$/.test(entry.name) ? [file] : [];
  });
}
for (const file of sources(root)) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, timeout: 10000 });
  if (result.status !== 0 || result.error) {
    throw new Error(result.error?.message || result.stderr.toString());
  }
}
console.log('S107 JavaScript syntax passed; no writes.');
