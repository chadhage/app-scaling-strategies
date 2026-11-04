'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const initial = require('.\\nested-runner.stub.cjs');
const retained = path.join(__dirname, 'delivery-is-not-effect.test.cjs');

test('child environment omits the outer test-runner variables in every spelling and keeps the rest', () => {
  const source = Object.freeze({ NODE_TEST_CONTEXT: 'child-v8', NODE_V8_COVERAGE: 'coverage', Node_Test_Context: 'mixed',
    node_v8_coverage: 'lower', PATH: 'kept-path', C030_MARKER: 'kept' });
  assert.deepEqual(initial.childEnvironment(source), { PATH: 'kept-path', C030_MARKER: 'kept' });
  assert.equal(source.NODE_TEST_CONTEXT, 'child-v8');
});
test('without a source the live process environment is sanitized and never changed', () => {
  const previous = process.env.NODE_TEST_CONTEXT;
  process.env.NODE_TEST_CONTEXT = 'child-v8';
  try {
    assert.equal(Object.hasOwn(initial.childEnvironment(), 'NODE_TEST_CONTEXT'), false);
    assert.equal(process.env.NODE_TEST_CONTEXT, 'child-v8');
  } finally {
    if (previous === undefined) delete process.env.NODE_TEST_CONTEXT; else process.env.NODE_TEST_CONTEXT = previous;
  }
});
test('retained initial stub test fails as a nested run for the behavioral reason', () => {
  const output = initial.runNodeTest(retained, { env: { ...process.env, NODE_TEST_CONTEXT: 'child-v8' } });
  assert.equal(output.status, 1);
  assert.match(output.stdout, /ERR_ASSERTION/);
  assert.match(output.stdout, /'PASS' !== 'HOLD'/);
  assert.doesNotMatch(output.stdout + output.stderr, /MODULE_NOT_FOUND/);
});
