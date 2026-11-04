'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const stage = process.argv[2];
assert.equal(process.argv.length, 3);
if (stage === 'bdd') {
  const text = fs.readFileSync(path.join(root, 'C034.feature'), 'utf8');
  assert.match(text, /Scenario: Reject a genuinely wrong-ordered saved trace/);
  assert.match(text, /declared fixture association/);
  console.log('BDD C034 saved-source ordering, unknowns and non-adoption contract loaded.');
} else if (stage === 'stub') {
  const stub = require(path.join(root, 'evidence', 'red', 'trace.stub.cjs'));
  assert.equal(typeof stub.validateSnapshot, 'function');
  assert.equal(stub.validateSnapshot({}).valid, true);
  console.log('Original loadable C034 stub exports validateSnapshot; behavior intentionally incomplete.');
} else if (stage === 'iac') {
  console.log('IaC N/A: offline historical trace inspection; no infrastructure, framework, cloud, identity, deployment or spend.');
} else {
  throw new Error('Only bdd, stub or iac phases are supported.');
}
