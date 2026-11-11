'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const {inventory} = require('./inventory.cjs');
const {scopedPair} = require('./scoped-pairs.cjs');

test('U045 scoped pairs execute both actual uninitialized for-of declarations in an explicit two-iteration binding scope',async () => {
  const sites=inventory().sites.filter(site => site.kind === 'statement' && site.type === 'VariableDeclaration' &&
    site.parentType === 'ForOfStatement' && /^const \w+$/.test(site.original));
  assert.equal(sites.length,2);
  for(const site of sites) {
    const result=await scopedPair(site);
    assert.equal(result.status,'RUNNABLE_SCOPED_PAIR');
    assert.deepEqual(result.originalObservation,['first','second']);
    assert.deepEqual(result.mutantObservation,['second','second']);
    assert.equal(result.runner.at(-1),site.sourceSha256);
    assert.equal(result.runner.at(-2),site.key);
  }
});

test('U045 scoped module and default filesystem pairs observe actual executed bindings rather than counting a module fault as a kill',async () => {
  const all=inventory().sites;
  for(const site of [
    all.find(site => site.kind === 'module' && site.original === "require('node:fs')"),
    all.find(site => site.kind === 'condition' && site.original === 'fs'),
  ]) {
    assert.ok(site);
    const result=await scopedPair(site);
    assert.equal(result.status,'RUNNABLE_SCOPED_PAIR',JSON.stringify(result));
    assert.equal(result.originalObservation.type,'object');
    assert.notEqual(result.mutantObservation.type,'object');
  }
});

test('U045 scoped evidence rejects an altered source epoch and never invents an unsupported block equivalence',async () => {
  const site=inventory().sites.find(site => site.type === 'BlockStatement');
  assert.equal((await scopedPair({...site,sourceSha256:'0'.repeat(64)})).status,'NON_KILL_SCOPE_SOURCE_IDENTITY');
  assert.equal((await scopedPair(site)).status,'NO_RUNNABLE_SCOPED_PAIR');
});
