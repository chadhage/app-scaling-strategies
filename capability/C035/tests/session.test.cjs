'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const classifier = require('..\\classifier.js');

test('reset only clears presentation; a later positive cannot erase retained FAIL or UNKNOWN history', async () => {
  const session = classifier.createSession();
  await session.apply({ type: 'inspect', id: 'modeled-cancel-request' });
  await session.apply({ type: 'inspect', id: 'closed-history' });
  const before = session.snapshot();
  const reset = await session.apply({ type: 'reset' });
  assert.equal(reset.latest, null);
  assert.equal(reset.presentationReset, true);
  assert.equal(reset.storedWorkChanged, false);
  assert.deepEqual(reset.history, before.history);
  assert.equal(reset.retainedDecision, 'FAIL');
  const positive = await session.apply({ type: 'inspect', id: 'modeled-complete' });
  assert.equal(positive.latest.decision, 'PASS');
  assert.equal(positive.retainedDecision, 'FAIL');
  assert.equal(positive.history[0].result.originals[0].classification, 'UNKNOWN');
  assert.equal(positive.history[1].result.counts.fail, 2);
  assert.ok(Object.isFrozen(positive.history));
  assert.throws(() => { positive.history[1].result.originals[2].decision = 'PASS'; }, TypeError);
});
test('typed command errors are retained and cannot import history, identity, approvals or context', async () => {
  const session = classifier.createSession();
  for (const input of [
    '{', '{"type":"inspect","type":"reset"}', '{"type":"inspect","id":"closed-history","eligible":true}',
    { type: 'cancel', id: 'modeled-cancel-request' },
    { type: 'reset', history: [] }, { type: 'inspect', id: 'modeled-complete', context: { epoch: 3 } },
    { type: 'restore-history', history: [] }
  ]) {
    const state = await session.apply(input);
    assert.equal(state.latest.valid, false);
    assert.equal(state.latest.actualUserMutationSuccess, false);
    assert.equal(state.latest.decision, 'HOLD');
  }
  const state = session.snapshot();
  assert.equal(state.retainedEntries, 7);
  assert.equal(state.history[0].result.code, 'INVALID_JSON');
  assert.equal(state.history[1].result.code, 'DUPLICATE_FIELD');
  assert.equal(state.history[2].result.code, 'CLOSED_COMMAND_SCHEMA');
});
test('bounded history refuses overflow, preserves every error/original and cannot be freed by reset', async () => {
  const session = classifier.createSession();
  for (let i = 0; i < classifier.MAX_HISTORY; i++) {
    await session.apply({ type: 'inspect', id: i === 0 ? 'closed-history' : 'modeled-cancel-request' });
  }
  const before = session.snapshot();
  const overflow = await session.apply({ type: 'inspect', id: 'modeled-complete' });
  assert.equal(overflow.error, 'HISTORY_LIMIT_RETAINED');
  assert.equal(overflow.overflowRefused, true);
  assert.deepEqual(overflow.history, before.history);
  assert.equal(overflow.retainedDecision, 'FAIL');
  const reset = await session.apply({ type: 'reset' });
  assert.equal(reset.retainedEntries, 16);
  assert.equal(reset.overflowRefused, true);
  const again = await session.apply({ type: 'repair', history: [] });
  assert.equal(again.error, 'HISTORY_LIMIT_RETAINED');
  assert.deepEqual(again.history, before.history);
});
test('compare keeps before/after explicit, counts after originals once, and retains original failures', async () => {
  const session = classifier.createSession();
  const result = await session.apply('{"type":"compare","id":"retry"}');
  assert.equal(result.latest.counts.originals, 2);
  assert.equal(result.latest.decision, 'FAIL');
  assert.equal(result.latest.before.originals[0].decision, 'FAIL');
  assert.equal(result.latest.after.originals[0].decision, 'FAIL');
  assert.equal(result.latest.after.originals[1].decision, 'PASS');
  assert.equal(result.retainedDecision, 'FAIL');
});
