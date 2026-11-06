'use strict';

// Killers of the mutants that the systematic campaign (tests\mutants.cjs, recorded in evidence\fix\mutants) found alive after the earlier suites: each test names the
// mutant it kills by file, operator and line. Only test(name, fn) and node:assert are used, because the campaign runs the suites under its own minimal runner.
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('..\\describe.js');

test('describe.js lines 10 and 128 (freeze-removed): the wording table and the module are frozen, a write throws in strict mode and changes nothing', () => {
  assert.equal(Object.isFrozen(D.LABELS), true);
  assert.equal(Object.isFrozen(D), true);
  const before = D.LABELS.applied;
  assert.throws(() => { D.LABELS.applied = 'changed'; }, TypeError);
  assert.throws(() => { D.label = () => 'changed'; }, TypeError);
  assert.equal(D.LABELS.applied, before);
  assert.equal(D.label('applied'), before);
});

const T = require('..\\timeline.js');
const saved = require('..\\saved.js');
const limitLinesOf = (id) => D.limitLines(T.build(saved.runs.find((run) => run.id === id)).limits);

test('describe.js lines 96 and 97 (if-true): the duplicate and out-of-order limit lines exist only when such deliveries were recorded, and then name exactly their positions', () => {
  for (const id of ['c044-complete', 'c044-truncated', 'c034-closed-history', 'c034-held-snapshot']) assert.deepEqual(limitLinesOf(id).filter((line) => /^Dropped /.test(line)), [], id);
  assert.deepEqual(limitLinesOf('c044-restart-gap').filter((line) => /^Dropped /.test(line)), ['Dropped duplicates (never shown as new events) at positions 28, 29, 30.']);
  assert.deepEqual(limitLinesOf('c044-hostile-mix').filter((line) => /^Dropped /.test(line)),
    ['Dropped duplicates (never shown as new events) at positions 13, 25.', 'Dropped out-of-order deliveries at positions 8, 10.']);
});

const applied = (data) => D.headline({ mark: 'applied', detail: null, entry: { event: 'step-completed', data } });

test('describe.js line 35 (operator-|| and operand-||-false of both halves): an applied event needs a safe integer step AND a safe integer of, else it is "an event was applied"', () => {
  for (const data of [{ step: 3 }, { of: 20 }, { step: '3', of: 20 }, { step: 3, of: '20' }, { step: 1.5, of: 20 }, { step: 3, of: 2.5 }, { step: Number.MAX_SAFE_INTEGER + 2, of: 20 }, { step: 3, of: Number.NaN }, {}, undefined, null]) {
    assert.equal(applied(data), 'an event was applied', JSON.stringify(data));
  }
  assert.equal(applied({ step: 3, of: 20 }), 'step 3 of 20 completed');
  assert.equal(D.headline({ mark: 'applied', detail: null, entry: { event: 'run-started', data: { step: 0, of: 20 } } }), 'run started (step 0 of 20)');
  assert.equal(D.headline({ mark: 'applied', detail: null, entry: { event: 'run-completed', data: { step: 20, of: 20 } } }), 'run completed (step 20 of 20)');
});
