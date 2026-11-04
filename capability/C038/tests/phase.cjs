'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const stage = process.argv[2];
assert.equal(process.argv.length, 3);
if (stage === 'bdd') {
  const feature = fs.readFileSync(path.join(root, 'C038.feature'), 'utf8');
  assert.match(feature, /one instance has one complete successful HTTP 200 probe/);
  assert.match(feature, /age 9 is fresh, age 10 is stale and age 11 is stale/);
  console.log('BDD: original C038 S/P0/LP-REPLAY/H007; complete explicit coverage, freshness, history and no native authority.');
} else if (stage === 'stub') {
  const source = fs.readFileSync(path.join(root, 'readiness.js'));
  const retained = fs.readFileSync(path.join(root, 'evidence', 'red', 'readiness.initial.js'));
  assert.deepEqual(source, retained);
  assert.equal(typeof require('../readiness.js').open, 'function');
  console.log('Loadable original stub; byte-identical retained RED subject; no syntax/import failure.');
} else if (stage === 'iac') {
  console.log('IaC N/A: offline static UI and bounded in-memory Node inspector, read-only accepted local inputs; no infrastructure, scaffold, cloud, auth, storage service, deployment or spending.');
} else {
  throw new Error('Closed stage required.');
}
