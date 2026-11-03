'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

for (const relative of [
  'app.js', 'probe.js', 'tests\\probe.test.cjs', 'tests\\browser.test.cjs',
  'tests\\integrity.test.cjs', 'tests\\syntax.test.cjs', 'tests\\capture.cjs', 'tests\\tooling.cjs',
]) {
  test(`syntax: ${relative}`, () => {
    const result = spawnSync(process.execPath, ['--check', path.resolve(__dirname, '..', relative)], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
  });
}
