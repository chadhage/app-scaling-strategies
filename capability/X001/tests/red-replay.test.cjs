'use strict';

// L-0121: the archived RED file is replayed byte for byte unchanged. Against the naive stub it still fails (the RED is reproducible),
// against the final timeline.js (through tests\green-shim.cjs) every assertion passes.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runNode, childEnvironment } = require('.\\nested-runner.cjs');

const repository = path.resolve(__dirname, '..', '..', '..');
const red = path.join('capability', 'X001', 'evidence', 'red', 'timeline.red.test.cjs');
const shim = '.\\capability\\X001\\tests\\green-shim.cjs';
const count = (text, name) => Number(new RegExp(`^# ${name} (\\d+)$`, 'm').exec(text)?.[1]);

test('the unchanged RED file still fails against the naive stub (reproducible) and passes against the final code (GREEN)', () => {
  const stub = runNode(['--test', '--test-concurrency=1', '--test-reporter=tap', red], { cwd: repository });
  assert.equal(stub.status, 1);
  assert.deepEqual([count(stub.stdout, 'tests'), count(stub.stdout, 'pass'), count(stub.stdout, 'fail')], [14, 1, 13]);
  const real = runNode(['--require', shim, '--test', '--test-concurrency=1', '--test-reporter=tap', red], { cwd: repository });
  assert.equal(real.status, 0, real.stdout.slice(-600));
  assert.deepEqual([count(real.stdout, 'tests'), count(real.stdout, 'pass'), count(real.stdout, 'fail')], [14, 14, 0]);
});

test('a nested node --test never inherits the outer runner context or its coverage directory', () => {
  const env = childEnvironment({ NODE_TEST_CONTEXT: 'child-v8', NODE_V8_COVERAGE: 'C:\\outer', Path: 'p', node_v8_coverage: 'x' });
  assert.deepEqual(Object.keys(env).sort(), ['NODE_V8_COVERAGE', 'Path']);
  assert.equal(env.NODE_V8_COVERAGE, '');
  const probe = runNode(['-e', 'process.stdout.write(JSON.stringify([process.env.NODE_TEST_CONTEXT ?? null, process.env.NODE_V8_COVERAGE]))'], { env: { NODE_TEST_CONTEXT: 'child-v8', NODE_V8_COVERAGE: 'C:\\outer' } });
  assert.equal(probe.stdout, '[null,""]');
  const failing = runNode(['-e', 'require("node:test")("x", () => { throw new Error("inner") })'], { env: { NODE_TEST_CONTEXT: 'child-v8' } });
  assert.notEqual(failing.status, 0, 'a failing nested test is not reported as success');
});
