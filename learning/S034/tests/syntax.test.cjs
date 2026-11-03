'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { files, lesson } = require('.\\proof.cjs');

test('every owned JavaScript source parses without executing historical RED snapshots', () => {
  const sources = files(lesson).filter((file) => /\.(?:js|cjs)$/.test(file));
  assert.ok(sources.length >= 8);
  for (const source of sources) {
    const result = spawnSync(process.execPath, ['--check', source], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, `${source}: ${result.stderr}`);
  }
});

test('every current JSON evidence and manifest file parses', () => {
  for (const source of files(lesson).filter((file) => file.endsWith('.json'))) {
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(source, 'utf8')), source);
  }
});
