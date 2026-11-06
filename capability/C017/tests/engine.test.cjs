'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const s = require('./support.cjs');
const J = require('../journal.cjs');
const { createEngine } = require('../engine.cjs');
const { build } = require('./scenarios.cjs');

const bytes = (file) => fs.readFileSync(file);
async function journalDir(t, name = 'partial', mutate = null) {
  const made = s.scratch('u');
  t.after(() => made.remove());
  const { journal, actionId } = await build(name);
  const writer = J.openJournal(made.dir);
  writer.read();
  const list = structuredClone(journal);
  if (mutate && mutate.entries) mutate.entries(list);
  writer.append(list);
  if (mutate && mutate.file) mutate.file(writer.file);
  return { dir: made.dir, file: writer.file, actionId };
}

const corruptions = [
  ['a digest mismatch', { file: (f) => fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('step-intent', 'step-intens')) }, 'STATE_DIGEST'],
  ['a torn tail', { file: (f) => fs.writeFileSync(f, fs.readFileSync(f, 'utf8').slice(0, -20)) }, 'TORN_TAIL'],
  ['an unknown field', { file: (f) => fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('{"formatVersion"', '{"x":1,"formatVersion"')) }, 'CLOSED_SCHEMA'],
  ['a forged decision under a valid chain', { entries: (l) => { l.find((e) => e.type === 'cancel-decided').outcome = 'COMPENSATED'; } }, 'JOURNAL_INCONSISTENT'],
  ['garbage', { file: (f) => fs.writeFileSync(f, 'garbage\n') }, 'CORRUPT_JSON'],
];
for (const [name, mutate, code] of corruptions) {
  test(`an unreadable journal is UNKNOWN and is never repaired or written: ${name}`, async (t) => {
    const j = await journalDir(t, 'partial', mutate);
    const before = bytes(j.file);
    const engine = createEngine({ dir: j.dir, ids: s.sequence(), now: s.clock() });
    t.after(() => engine.close());
    const state = engine.view();
    assert.deepEqual([state.journalStatus, state.problem.code, state.action, state.journal], ['UNREADABLE', code, null, []]);
    assert.match(state.statement, /cannot be read/);
    const answer = await engine.execute(s.cancelCmd('unread-key-001', j.actionId));
    assert.equal(answer.status, 503);
    assert.equal(answer.body.outcome, 'CANCEL_UNKNOWN');
    assert.deepEqual([answer.body.effective, answer.body.facts.effectsStanding, answer.body.facts.undone, answer.body.actionStopped], [false, null, null, null]);
    assert.equal((await engine.execute(s.startCmd('unread-start-01'))).body.error.code, 'STATE_UNREADABLE');
    assert.equal((await engine.execute(s.reconcileCmd('unread-rec-001', j.actionId))).body.error.code, 'STATE_UNREADABLE');
    assert.deepEqual(bytes(j.file), before, 'no command wrote to or repaired the file');
  });
}

test('a write failure during the decision marks the journal unreadable and answers the waiting cancel as unknown', async (t) => {
  const ctx = s.boot();
  t.after(() => ctx.cleanup());
  ctx.g.hold('before', 3);
  const actionId = await s.startAction(ctx);
  await ctx.g.reached('before', 3);
  const real = fs.writeSync;
  let calls = 0;
  t.mock.method(fs, 'writeSync', (...args) => { calls += 1; if (calls >= 2) throw new Error('disk full'); return real(...args); });
  const answer = await ctx.engine.execute(s.cancelCmd('write-fail-001', actionId));
  assert.equal(answer.status, 503);
  assert.equal(answer.body.outcome, 'CANCEL_UNKNOWN');
  assert.equal(answer.body.facts.effectsStanding, null);
  assert.equal(ctx.engine.view().journalStatus, 'UNREADABLE');
  assert.equal(ctx.engine.view().problem.code, 'WRITE_FAILED');
  assert.equal((await ctx.engine.execute(s.startCmd('write-fail-002'))).body.error.code, 'STATE_UNREADABLE');
});

test('a write failure in the runner makes the state UNKNOWN instead of guessing an effect', async (t) => {
  const made = s.scratch('w');
  t.after(() => made.remove());
  const real = fs.writeSync;
  let calls = 0;
  t.mock.method(fs, 'writeSync', (...args) => { calls += 1; if (calls >= 4) throw new Error('disk full'); return real(...args); });
  const engine = createEngine({ dir: made.dir, ids: s.sequence(), now: s.clock() });
  t.after(() => engine.close());
  assert.equal((await engine.execute(s.startCmd('runner-fail-01'))).status, 202);
  await engine.settled();
  assert.equal(engine.view().journalStatus, 'UNREADABLE');
});

test('options and raw commands are validated; a closed engine claims nothing and close is idempotent', async (t) => {
  const made = s.scratch('o');
  t.after(() => made.remove());
  for (const bad of [{ steps: 0 }, { steps: 9 }, { steps: 2.5 }, { unitsPerStep: 0 }, { unitsPerStep: 1001 }]) assert.throws(() => createEngine({ dir: made.dir, ...bad }), RangeError);
  assert.throws(() => createEngine(), (error) => error.code === 'UNSAFE_PATH');
  const engine = createEngine({ dir: made.dir, ids: s.sequence(), now: s.clock() });
  for (const raw of [null, 'text', [], 7, { kind: 'cancel' }]) {
    const answer = await engine.execute(raw);
    assert.equal(answer.body.error.code, 'INVALID_COMMAND');
    assert.equal(answer.body.journalWritten, false);
  }
  const hostile = await engine.execute(JSON.parse('{"__proto__":{"x":1},"kind":"start"}'));
  assert.equal(hostile.body.error.code, 'INVALID_COMMAND');
  await engine.close();
  await engine.close();
  assert.equal((await engine.execute(s.startCmd('closed-start-01'))).body.error.code, 'SERVER_CLOSING');
});

test('with the default ids, clock and gates an action runs to completion and its ids and times are well formed', async (t) => {
  const made = s.scratch('d');
  t.after(() => made.remove());
  const engine = createEngine({ dir: made.dir });
  t.after(() => engine.close());
  const started = await engine.execute(s.startCmd('default-start-01'));
  assert.match(started.body.action.actionId, /^act-1-[0-9a-f]{8}$/);
  await engine.settled();
  const state = await engine.waitFor((view) => view.action.status === 'COMPLETED');
  assert.ok(state.journal.every((e) => !Number.isNaN(Date.parse(e.at))));
  assert.match(state.journal[0].bootId, /^[0-9a-f]{8}$/);
});

test('cancelling with compensation requested but nothing to reverse, or after completion, runs no compensating step', async (t) => {
  const before = s.boot();
  t.after(() => before.cleanup());
  before.g.hold('before', 1);
  const id1 = await s.startAction(before);
  await before.g.reached('before', 1);
  const empty = await before.engine.execute(s.cancelCmd('comp-empty-001', id1, 1, true));
  assert.equal(empty.body.outcome, 'CANCELLED_BEFORE_EFFECT');
  assert.equal(empty.body.facts.compensation, 'NOT_ATTEMPTED');
  const late = s.boot();
  t.after(() => late.cleanup());
  const id2 = await s.startAction(late);
  await s.wait(late, (state) => state.action.status === 'COMPLETED');
  const answer = await late.engine.execute(s.cancelCmd('comp-late-0001', id2, 1, true));
  assert.equal(answer.body.outcome, 'CANCEL_TOO_LATE');
  assert.equal(answer.body.facts.compensation, 'NOT_ATTEMPTED');
  assert.ok(!s.types(late).some((type) => type.startsWith('compensation')));
});

test('a crash during compensation is INTERRUPTED with an UNKNOWN step, never COMPENSATED', async (t) => {
  const ctx = s.boot();
  t.after(() => ctx.cleanup());
  ctx.g.hold('before', 3);
  ctx.g.hold('comp', 2);
  const actionId = await s.startAction(ctx);
  await ctx.g.reached('before', 3);
  const pending = ctx.engine.execute(s.cancelCmd('comp-crash-001', actionId, 1, true));
  await ctx.g.reached('comp', 2);
  await ctx.engine.close();
  assert.equal((await pending).body.error.code, 'SERVER_CLOSING');
  const again = s.boot({ dir: ctx.dir });
  t.after(() => again.engine.close());
  const action = s.actionOf(again);
  assert.deepEqual([action.status, action.compensation, action.unknownSteps, action.cancel.outcome], ['INTERRUPTED', 'INTERRUPTED', [2], 'CANCEL_UNKNOWN']);
  assert.deepEqual(action.effectsStanding.map((e) => e.step), [1]);
  const replay = await again.engine.execute(s.cancelCmd('comp-crash-001', actionId, 1, true));
  assert.equal(replay.body.outcome, 'CANCEL_UNKNOWN');
  assert.notEqual(replay.body.outcome, 'COMPENSATED');
});

test('idempotency keys are bound to one command kind and survive a restart and a newer epoch', async (t) => {
  const ctx = s.boot();
  t.after(() => ctx.cleanup());
  const actionId = await s.startAction(ctx, 'idem-start-0001');
  await s.wait(ctx, (state) => state.action.status === 'COMPLETED');
  const cancel = await ctx.engine.execute(s.cancelCmd('idem-cancel-001', actionId));
  assert.equal(cancel.body.outcome, 'CANCEL_TOO_LATE');
  assert.equal((await ctx.engine.execute({ ...s.startCmd('idem-cancel-001', 1) })).body.error.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal((await ctx.engine.execute(s.reconcileCmd('idem-start-0001', actionId))).body.error.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal((await ctx.engine.execute(s.cancelCmd('idem-start-0001', actionId))).body.error.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal((await ctx.engine.execute(s.startCmd('idem-start-0001', 0, { expectedEpoch: 0 }))).body.idempotentReplay, true);
  assert.equal((await ctx.engine.execute(s.startCmd('idem-start-0001', 3))).body.error.code, 'IDEMPOTENCY_CONFLICT');
  const next = await ctx.engine.execute(s.startCmd('idem-start-0002', 1));
  assert.equal(next.body.action.epoch, 2);
  await ctx.engine.close();
  const again = s.boot({ dir: ctx.dir });
  t.after(() => again.engine.close());
  const replay = await again.engine.execute(s.cancelCmd('idem-cancel-001', actionId));
  assert.equal(replay.status, 409);
  assert.equal(replay.body.idempotentReplay, true);
  assert.equal(replay.body.outcome, 'CANCEL_TOO_LATE');
  assert.equal(replay.body.epoch, 1, 'a replay is answered from the journal even though epoch 1 is now stale');
});

test('reconcile refuses a running, settled, unknown or off-epoch target with typed failures', async (t) => {
  const ctx = s.boot();
  t.after(() => ctx.cleanup());
  ctx.g.hold('before', 2);
  const actionId = await s.startAction(ctx);
  await ctx.g.reached('before', 2);
  const size = ctx.engine.view().journal.length;
  const cases = [[s.reconcileCmd('rec-run-00001', actionId), 'NOT_INTERRUPTED'], [s.reconcileCmd('rec-run-00002', 'act-1-ffffffff'), 'UNKNOWN_ACTION'],
    [s.reconcileCmd('rec-run-00003', actionId, 2), 'FUTURE_EPOCH'], [{ ...s.reconcileCmd('rec-run-00004', actionId), leaseId: 'lease-other-0001' }, 'UNKNOWN_LEASE']];
  for (const [command, code] of cases) assert.equal((await ctx.engine.execute(command)).body.error.code, code);
  assert.equal(ctx.engine.view().journal.length, size);
  const empty = s.boot();
  t.after(() => empty.cleanup());
  assert.equal((await empty.engine.execute(s.cancelCmd('no-action-0001', 'act-1-ffffffff'))).body.error.code, 'FUTURE_EPOCH');
  assert.equal((await empty.engine.execute(s.reconcileCmd('no-action-0002', 'act-1-ffffffff'))).body.error.code, 'FUTURE_EPOCH');
  assert.equal(path.basename(empty.engine.view().lease.leaseId), 'lease-synthetic-001');
});

test('a crash between the last effect and the decision leaves COMPLETED with a derivable TOO_LATE; a new key is refused and the journal stays readable', async (t) => {
  const made = s.scratch('w');
  t.after(() => made.remove());
  const { journal, actionId } = await build('completed');
  const list = structuredClone(journal);
  assert.equal(list.pop().type, 'cancel-decided');
  const writer = J.openJournal(made.dir);
  writer.read();
  writer.append(list);
  const engine = createEngine({ dir: made.dir, ids: s.sequence(), now: s.clock() });
  t.after(() => engine.close());
  const state = engine.view();
  assert.equal(state.journalStatus, 'READABLE');
  assert.deepEqual([state.action.status, state.action.cancel.decided, state.action.cancel.outcome], ['COMPLETED', false, 'CANCEL_TOO_LATE']);
  const size = state.journal.length;
  const replay = await engine.execute(s.cancelCmd('build-cancel-01', actionId));
  assert.deepEqual([replay.status, replay.body.outcome, replay.body.idempotentReplay], [409, 'CANCEL_TOO_LATE', true]);
  const fresh = await engine.execute(s.cancelCmd('fresh-cancel-001', actionId));
  assert.equal(fresh.body.error?.code, 'ALREADY_TERMINAL');
  assert.equal(engine.view().journalStatus, 'READABLE', 'a legitimate command must never make the journal unreadable');
  assert.equal(engine.view().journal.length, size);
  assert.equal((await engine.execute(s.startCmd('after-window-01', 1))).status, 202);
});
