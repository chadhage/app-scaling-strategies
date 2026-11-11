'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { definitions, createLoader } = require('./u069-loader.cjs');
const { identify, prove } = require('./u069-equivalence.cjs');
const known = definitions().filter((definition) => identify(definition));
test('U069 only individually identified source-bound equivalence facts have witnesses', () => {
  assert.ok(known.length >= 8);
  assert.equal(identify({file:'store.cjs',label:'unknown survivor',start:0,end:0,replacement:''}),null);
});
for (const definition of known) {
  test(`U069 specific paired equivalence: ${definition.file} ${definition.label}`, { timeout: 60000 }, async () => {
    const fact=identify(definition),loader=createLoader(definition);
    const witness=await prove(fact,definition,loader);
    assert.ok(witness.cases>0);
    assert.ok(witness.domain.length>20);
    assert.equal(loader.bounded(),true);
  });
}
