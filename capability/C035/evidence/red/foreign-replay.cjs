'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const stub = require('./foreign-index.initial.snapshot.cjs');
const { withFixture, foreignPath } = require('..\\..\\tests\\foreign-fixture.cjs');

test('foreign C048 staged entry is observed and verified as preserved by the initial stub', () => withFixture((fixture) => {
  const blob = fixture.stageForeign('foreign content staged by another card\n');
  fixture.changeOwn();
  const before = stub.snapshot(fixture.directory);
  assert.deepEqual(before.paths, [foreignPath]);
  assert.equal(before.entries, `100644 ${blob} 0\t${foreignPath}\n`);
  fixture.publishOwn();
  assert.equal(stub.verify(before, fixture.directory).preserved, true);
}));
test('foreign restaged content must not be reported as preserved by the initial stub', () => withFixture((fixture) => {
  fixture.stageForeign();
  const before = stub.snapshot(fixture.directory);
  fixture.stageForeign('foreign content restaged\n');
  assert.equal(stub.verify(before, fixture.directory).preserved, false);
}));
