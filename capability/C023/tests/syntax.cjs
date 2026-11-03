'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
let checked = 0;
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(js|cjs)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 10000 });
      assert.equal(result.status, 0, `${file}\n${result.stderr || result.error?.message || ''}`);
      checked++;
    }
  }
}
walk(root);
console.log(`Syntax valid: ${checked} owned scripts, including retained RED snapshots; runtime ${process.version}.`);
