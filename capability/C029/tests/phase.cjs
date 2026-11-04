'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
assert.equal(process.argv.length, 3);
const stage = process.argv[2];
if (stage === 'bdd') {
  const text = fs.readFileSync(path.join(__dirname, '..', 'C029.feature'), 'utf8');
  assert.match(text, /positive retry cannot repair an original budget failure/);
  assert.match(text, /summary-only unverified/);
  assert.match(text, /pure event-log model/);
  console.log('BDD: original latency/state, unknown denominator, provenance and offline UI contract loaded.');
} else if (stage === 'stub') {
  const stub = require('..\\evidence\\red\\evaluator.stub.cjs');
  assert.equal(typeof stub.evaluateSnapshot, 'function');
  console.log('Loadable original stub; intentionally incorrect latest-healthy retry laundering.');
} else if (stage === 'iac') {
  console.log('IaC N/A: bounded offline evaluator only. No cloud, identity, storage, queue, framework, deployment or spend.');
} else if (stage === 'implementation') {
  const evaluator = require('..\\evaluator.js');
  const saved = evaluator.evaluateSaved('closed-history');
  assert.equal(saved.valid, true);
  assert.equal(saved.decision, 'FAIL');
  assert.deepEqual(saved.counts, { originals: 7, pass: 2, fail: 2, unknown: 3 });
  console.log('Minimal implementation evaluates actual saved original failures and retains all seven originals.');
} else {
  throw new Error('Only bdd, stub, iac or implementation is supported.');
}
