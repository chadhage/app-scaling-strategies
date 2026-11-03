'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const text = fs.readFileSync(path.join(__dirname, '..', 'workflow-version.feature'), 'utf8');
assert.equal((text.match(/^  Scenario:/gm) || []).length, 8);
for (const required of ['exact pinning', 'explicit version branch', 'Latest code', 'incompatible history', 'UNKNOWN', 'seventh comparison', 'CSP']) {
  assert.ok(text.includes(required), required);
}
assert.ok(text.includes('Training rehearsal - synthetic data - not a live Azure result'));
console.log('Eight source-specific BDD scenarios checked before stub creation.');
