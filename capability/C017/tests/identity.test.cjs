'use strict';

// F5: attribution is bound to the journal. derive() must refuse an action-accepted entry that names another lease, run or user, even when
// the digest chain and the grammar are valid: such a journal is UNKNOWN (unreadable), never answered with a FOREIGN identity.
const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('./support.cjs');
const R = require('../reconcile.cjs');
const C = require('../contract.js');
const { openJournal } = require('../journal.cjs');

async function baseJournal() {
  const ctx = s.boot();
  ctx.g.hold('before', 3);
  const actionId = await s.startAction(ctx);
  await ctx.g.reached('before', 3);
  const entries = ctx.engine.view().journal;
  await ctx.cleanup();
  return { entries, actionId };
}

const foreign = [['runId', 'synthetic-run-002'], ['leaseId', 'lease-other-001'], ['userId', 'user-other-001']];

for (const [field, value] of foreign) {
  test(`a valid-chain journal whose action names another ${field.replace('Id', '')} is refused by derive() and never answered with the foreign identity`, async (t) => {
    const { entries, actionId } = await baseJournal();
    const forged = entries.map((entry) => (entry.type === 'action-accepted' ? { ...entry, [field]: value } : entry));
    assert.doesNotThrow(() => R.derive(entries), 'the honest journal is accepted');
    assert.throws(() => R.derive(forged), (error) => error.code === 'JOURNAL_INCONSISTENT' && /lease, run and user/.test(error.message));

    const made = s.scratch('id');
    t.after(() => made.remove());
    openJournal(made.dir).append(forged);
    const engine = s.engineModule().createEngine({ dir: made.dir, steps: 4, unitsPerStep: 5, ids: s.sequence(), now: s.clock() });
    t.after(() => engine.close());
    assert.equal(engine.view().journalStatus, 'UNREADABLE');
    const cancel = await engine.execute(s.cancelCmd('cancel-key-0001', actionId, 1, false));
    assert.equal(cancel.status, 503);
    assert.equal(cancel.body.outcome, 'CANCEL_UNKNOWN');
    assert.equal(cancel.body.effective, false);
    const start = await engine.execute(s.startCmd('start-key-0002', 1));
    assert.equal(start.status, 503);
    for (const answer of [cancel.body, start.body, engine.view()]) assert.doesNotMatch(JSON.stringify(answer), new RegExp(value), 'a foreign identity was echoed');
  });
}

test('the journal the engine writes names exactly the closed server identity', async () => {
  const { entries } = await baseJournal();
  const accepted = entries.filter((e) => e.type === 'action-accepted');
  assert.equal(accepted.length, 1);
  assert.deepEqual({ leaseId: accepted[0].leaseId, runId: accepted[0].runId, userId: accepted[0].userId }, C.identity);
});
