'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const lesson = path.resolve(__dirname, '..');

test('all owned JavaScript and CommonJS files parse with existing Node tooling', () => {
  const files = [];
  function walk(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      if (item.name === 'evidence') continue;
      const target = path.join(directory, item.name);
      if (item.isDirectory()) walk(target);
      else if (/\.(?:js|cjs)$/.test(item.name)) files.push(target);
    }
  }
  walk(lesson);
  assert.ok(files.length >= 8);
  for (const file of files) {
    const child = spawnSync(process.execPath, ['--check', file], {
      encoding: 'utf8', windowsHide: true, timeout: 15000,
    });
    assert.equal(child.status, 0, `${path.relative(lesson, file)}\n${child.stderr}`);
    assert.equal(child.error, undefined);
  }
});
