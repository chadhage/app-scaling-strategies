'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
assert.equal(process.argv.length, 3);
const stage = process.argv[2];
if (stage === 'bdd') {
  const bdd = fs.readFileSync(path.join(root, 'C036.feature'), 'utf8');
  assert.match(bdd, /Scenario: Reject false attribution before the private attachment transition/);
  assert.match(bdd, /declared fixture association/);
  assert.match(bdd, /UNVERIFIED\/HOLD/);
  console.log('BDD loaded: actual pre-attachment guard, current owner context, missing correlation HOLD, fictional-only positive and immutable proof.');
} else if (stage === 'stub') {
  const stub = require('..\\evidence\\red\\attribution.stub.cjs');
  assert.equal(typeof stub.open, 'function');
  stub.open().then(async (gate) => {
    assert.equal(typeof gate.attachText, 'function');
    const result = await gate.attachText(JSON.stringify(gate.getEvidence('wrong-run')));
    assert.equal(result.outcome, 'attached');
    assert.equal(gate.snapshot().metrics.currentAttributedTierRecords, 3);
    console.log('Original stub is loadable; its actual private transition wrongly attaches other-run records and metrics.');
  }).catch((error) => { console.error(error); process.exitCode = 1; });
} else if (stage === 'iac') {
  console.log('IaC N/A: local read-only attribution model, not an Azure/control API/authentication/lease authority or new storage engine.');
} else {
  throw new Error('One closed bdd, stub or iac phase required.');
}
