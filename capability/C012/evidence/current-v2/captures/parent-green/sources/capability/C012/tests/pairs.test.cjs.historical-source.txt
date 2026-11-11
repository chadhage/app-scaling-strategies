'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sources, inventory } = require('./ast.cjs');
const { RULES, choose, paired } = require('./pairs.cjs');
const { classify } = require('./verdict.cjs');
test('all seventeen explicit source-exact survivor domains execute real scoped pairs', async () => {
  const input = sources(), domain = inventory(input);
  const ids = Object.values(RULES).flat();
  assert.equal(new Set(ids).size, 17);
  for (const id of ids) {
    const definition = domain.definitions.find(row => row.id === id);
    const proof = await paired(definition, input);
    assert.ok(proof.domain.length > 100);
    assert.equal(proof.assertedPairs, proof.cases);
    assert.ok(proof.cases > 300);
    assert.equal(proof.counterfactualSha256, definition.mutantSha256);
  }
});
test('no passing test default source drift or identity can manufacture equivalence or a kill', async () => {
  const input = sources(), domain = inventory(input), definition = domain.definitions.find(row => row.id === 4);
  assert.equal(choose({ ...definition, id: 99999 }, input), null);
  await assert.rejects(() => paired({ ...definition, id: 99999 }, input), /NO_DEFAULT_EQUIVALENCE/);
  assert.throws(() => choose(definition, { ...input, 'fixtures.js': input['fixtures.js'] + '\n' }), /pair binds/);
  assert.throws(() => choose({ ...definition, replacement: 'true' }, input));
  assert.equal(classify({ identity: true }, { faults: [], failures: [{ code: 'ERR_ASSERTION' }] }), 'nonkill-identity');
  assert.equal(classify({ syntax: {} }, { faults: [], failures: [{ code: 'ERR_ASSERTION' }] }), 'nonkill-syntax');
  for (const code of ['ERR_MODULE_NOT_FOUND', 'EACCES', 'ERR_SCRIPT_EXECUTION_TIMEOUT', 'ETIMEDOUT']) {
    assert.equal(classify({}, { faults: [{ code }], failures: [{ code: 'ERR_ASSERTION' }] }), 'nonkill-runtime-module-environment-fault');
  }
  assert.equal(classify({}, { faults: [], failures: [] }), 'survivor-unresolved');
});
