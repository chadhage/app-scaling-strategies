'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sources } = require('./ast.cjs');
const { observe } = require('./probes.cjs');
test('complete pristine actual CJS browser client and inline source satisfies independent named probes', async () => {
  const result = await observe(sources());
  assert.deepEqual(result.faults, []);
  assert.deepEqual(result.failures, []);
  assert.ok(result.assertions.length > 300);
});
test('a returned-value assertion stops naturally before invalid dependent client calls manufacture faults', async () => {
  const input = sources();
  const changed = input['model.js'].replace('return result(codes, rows);', 'return undefined;');
  assert.notEqual(changed, input['model.js']);
  const result = await observe({ ...input, 'model.js': changed });
  assert.deepEqual(result.faults, [], 'no artificial follow-on fault after the named result-contract assertion');
  assert.equal(result.failures.length, 1, 'same assertion-stop semantics as a real test case');
  assert.equal(result.failures[0].name, 'C012 CommonJS actual producer observation held');
  assert.equal(result.failures[0].code, 'ERR_ASSERTION');
});
