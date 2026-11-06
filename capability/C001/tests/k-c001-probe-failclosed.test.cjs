'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { SECRET, FAILED_CLOSED, approved, codes, node, probe, runAll, decisionOf } = require('./fixtures/k-c001-run-probe.cjs');

// The real probe.cjs runs as a child with a private in-memory ledger and, in some tests, one fault injected into a collaborator.
const LONG = { timeout: 180000 };
const FAULTS = ['reject', 'throw', 'empty', 'bigint', 'console'];

function assertFailedClosed(result, label) {
  assert.equal(result.status, 1, label);
  assert.equal(result.stderr, `${JSON.stringify(FAILED_CLOSED)}\n`, label);
  assert.doesNotMatch(result.stdout, /allowed/, `${label}: no decision on standard output`);
  assert.equal(`${result.stdout}${result.stderr}`.includes(SECRET), false, `${label}: the underlying error text never reaches the visitor`);
}

test('a failure while deciding or reporting fails closed: exit 1, one constant JSON line on stderr, no decision on stdout', LONG, async () => {
  // The control run proves the same input is allowed, so the bigint and console faults hit an allowed decision that cannot be reported.
  const [control, ...faulted] = await runAll([
    [['local.summary'], { text: approved }],
    ...FAULTS.map((fault) => [['local.summary'], { text: approved, fault }]),
    [['native.execute'], { text: approved, fault: 'reject' }]
  ]);
  assert.equal(control.status, 0, 'without a fault the same input is allowed');
  assert.equal(decisionOf(control).allowed, true);
  faulted.forEach((result, index) => assertFailedClosed(result, [...FAULTS, 'native.execute'][index]));
});

test('a fault on the invalid-arguments path fails closed with the same constant message', LONG, async () => {
  const results = await runAll([[[], { text: approved, fault: 'reject' }], [['local.summary', 'extra'], { text: approved, fault: 'throw' }]]);
  results.forEach((result, index) => assertFailedClosed(result, `invalid arguments ${index}`));
});

test('anything but exactly one action argument is INVALID_ARGUMENTS and never allowed, even for an approved ledger', LONG, async () => {
  const cases = [[], ['local.summary', 'extra'], ['local.summary', 'local.probe']];
  const results = await runAll(cases.map((args) => [args, { text: approved }]));
  results.forEach((result, index) => {
    const label = cases[index].join(' ') || 'no argument';
    assert.equal(result.status, 1, label);
    const decision = decisionOf(result);
    assert.equal(decision.allowed, false, label);
    assert.equal(decision.action, null, label);
    assert.deepEqual(codes(decision), ['INVALID_ARGUMENTS', 'APPROVAL_MISSING', 'UNKNOWN_ACTION', 'LOCAL_ONLY',
      'ZERO_NATIVE_LIMIT', 'CLOUD_SPEND_FORBIDDEN', 'NATIVE_TARGET_UNAPPROVED'], label);
  });
});

test('requiring probe.cjs as a module runs no command line and exposes only evaluateCurrentApproval', LONG, async () => {
  const result = await node(['-e', 'process.stdout.write(Object.keys(require(process.argv[1])).join())', probe], { text: approved });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, 'evaluateCurrentApproval');
});
