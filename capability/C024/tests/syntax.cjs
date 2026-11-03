'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function list(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? list(file) : [file];
  });
}
let scripts = 0;
let json = 0;
for (const file of list(root)) {
  if (/\.(?:js|cjs)$/.test(file)) {
    const run = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 10000 });
    if (run.status !== 0) throw new Error(`${file}: ${run.stderr || run.error || 'syntax check failed'}`);
    scripts++;
  } else if (file.endsWith('.json')) {
    JSON.parse(fs.readFileSync(file, 'utf8'));
    json++;
  }
}
console.log(`C024 syntax passed: ${scripts} scripts (including retained RED); ${json} JSON documents.`);
