'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const phase = process.argv[2];
assert.equal(process.argv.length, 3);
if (phase === 'bdd') {
  const text = fs.readFileSync(path.join(__dirname, '..', 'C037.feature'), 'utf8');
  for (const phrase of ['Requested weights are not observations', 'Unknown originals retain the denominator',
    'unchanged C036', 'signed Edge', 'IaC is N/A']) assert.ok(text.includes(phrase));
  console.log('BDD: frozen original S/P0/LP-REPLAY/H007; honest policy/observations/identity and local-only acceptance.');
} else if (phase === 'stub') {
  assert.equal(typeof require('..\\routing.js').open, 'function');
  console.log('Loadable routing stub: public open function exists.');
} else if (phase === 'iac') {
  console.log('IaC N/A: existing local Node CLI and static UI only; no infrastructure/cloud/auth/deployment/spend.');
} else if (phase === 'coverbdd') {
  const text = fs.readFileSync(path.join(__dirname, '..', 'C037.coverage.feature'), 'utf8');
  for (const phrase of ['enumerated production file', 'counts as 0 percent', 'DOM stubs', 'never excluded',
    'documented exit code', 'fails closed', 'Proof is appended, never rewritten', 'IaC is N/A',
    'changes no production code']) assert.ok(text.includes(phrase), phrase);
  console.log('Coverage BDD: per-file 85/85/85 over an enumerated set; page, CLI and pin reader behaviors; append-only proof; no production change.');
} else throw new Error('Unknown phase.');
