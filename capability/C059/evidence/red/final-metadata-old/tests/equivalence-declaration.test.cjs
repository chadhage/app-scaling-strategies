'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { demonstrationFile, proofKind } = require('./mutate-classify.cjs');
const server = require('./mutants-server.cjs');
const checker = require('./mutants-checker.cjs');

test('D1 accounting: the exact decide(socket)-deletion mutant names the individually asserted queued-cancel family', () => {
  const mutant = server.find((item) => item.label.startsWith('decide() on a parse error'));
  assert.ok(mutant);
  assert.equal(mutant.equivalent, undefined);
  assert.ok(mutant.suites.includes('queued-cancel'));
});

for (const label of ['checkContinue: Node sends 100 Continue itself', 'closeServer destroying every tracked socket', 'checker: an empty composite widget allowed']) {
  test(`D2 equivalence declaration is backed by an existing runnable current proof: ${label}`, () => {
    const mutant = [...server, ...checker].find((item) => item.label.startsWith(label));
    assert.ok(mutant);
    assert.equal(proofKind(mutant.equivalent), 'demonstrated', 'reasoning is not a runnable platform demonstration');
    assert.equal(fs.existsSync(path.join(__dirname, demonstrationFile(mutant.equivalent))), true);
  });
}

test('identity controls really replace bytes with identical bytes; no other equivalent is labelled as an identity', () => {
  const mutants = [...server, ...checker, ...require('./mutants-page.cjs')];
  const identities = mutants.filter((mutant) => proofKind(mutant.equivalent) === 'identity');
  assert.equal(identities.length, 2);
  for (const mutant of identities) assert.equal(mutant.to, mutant.from, mutant.label);
});
