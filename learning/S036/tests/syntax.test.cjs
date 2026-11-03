'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const lesson = path.resolve(__dirname, '..');
test('every owned executable has valid Node22 syntax; RED snapshots are not executable discovery inputs', () => {
  const files = ['antiforgery.js', 'app.js', ...fs.readdirSync(__dirname)
    .filter((name) => /\.(?:js|cjs)$/.test(name)).map((name) => path.join('tests', name))];
  for (const relative of files) {
    const result = spawnSync(process.execPath, ['--check', path.join(lesson, relative)], {
      encoding: 'utf8', windowsHide: true
    });
    assert.equal(result.status, 0, `${relative}: ${result.stderr}`);
  }
  assert.equal(fs.readdirSync(path.join(lesson, 'evidence', 'red'))
    .filter((name) => /\.(?:js|cjs|mjs)$/.test(name)).length, 0);
});
