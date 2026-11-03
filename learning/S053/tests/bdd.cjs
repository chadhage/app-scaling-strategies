'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const text = fs.readFileSync(path.join(__dirname, '..', 'api-migration.feature'), 'utf8');
const scenarios = text.match(/^  Scenario: .+$/gm) || [];
assert.equal(scenarios.length, 8);
for (const phrase of [
  'stable transitional adapter', 'Versioned endpoints', 'Force-rerouting',
  'explicit complete client upgrade', 'old-deployment requests',
  'missing observation', 'forged history', 'keyboard and explicit reset',
]) assert.ok(text.includes(phrase), phrase);
assert.ok(text.includes('Training rehearsal - synthetic data - not a live Azure result'));
console.log(`BDD authored before stub: ${scenarios.length} source-bound scenarios.`);
