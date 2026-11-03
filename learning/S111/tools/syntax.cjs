'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
let javascriptFiles = 0;
let jsonFiles = 0;

function check(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) check(file);
    else if (/\.(?:js|cjs)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr || 'Syntax check did not complete.');
      javascriptFiles++;
    } else if (entry.name.endsWith('.json')) {
      JSON.parse(fs.readFileSync(file, 'utf8'));
      jsonFiles++;
    }
  }
}

check(root);
console.log(JSON.stringify({ passed: true, javascriptFiles, jsonFiles, runtime: process.version, writes: 0 }));
