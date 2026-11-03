'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const files = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const all = files(root);
let scripts = 0;
let records = 0;
for (const file of all) {
  if (/\.(?:js|cjs)$/.test(file)) {
    execFileSync(process.execPath, ['--check', file], { cwd: root, timeout: 10000 });
    scripts++;
  } else if (file.endsWith('.json')) {
    JSON.parse(fs.readFileSync(file, 'utf8'));
    records++;
  }
}
console.log(`Syntax PASS: ${scripts} JavaScript files; ${records} JSON records. Read-only.`);
