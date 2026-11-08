'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('U055 privacy: the public fresh driver contains no task-local execution or session token', () => {
  const source = fs.readFileSync(path.join(__dirname, 'u055-fresh.cjs'), 'utf8');
  assert.doesNotMatch(source, /execution-\d{8}-[a-f0-9]{8}/, 'public test tooling must use a caller-provided scratch placeholder');
});

test('U055 privacy: fresh scratch confinement is supplied explicitly, not embedded in public source', () => {
  const source = fs.readFileSync(path.join(__dirname, 'u055-fresh.cjs'), 'utf8');
  assert.match(source, /process\.env\.C026_U055_SCRATCH/, 'the caller must supply the owned private scratch root');
});
