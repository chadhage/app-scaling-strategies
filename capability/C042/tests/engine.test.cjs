'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { delayExecutor, openEngine } = require('../engine.cjs');
const input = require('../input.cjs');
const journal = require('../journal.cjs');
const { gate, inFlight, settle, valid } = require('./support.cjs');

const checked = (overrides = {}) => input.validateInput(valid(overrides)).input;
const KEY = valid().idempotencyKey;
const other = (name, overrides = {}) => checked({ idempotencyKey: name, ...overrides });
const types = (io) => io.read().split('\n').filter(Boolean).map((line) => JSON.parse(line).type);

test('a step is admitted, driven and committed once, and the ledger follows', async () => {
  const io = journal.createMemoryIo();
  const engine = await openEngine({ io });
  const { status, body } = await engine.submit(checked());
  assert.deepEqual([status, body.outcome, body.effect.reservedAfter, body.attempts], [201, 'succeeded', 5, 1]);
  assert.deepEqual(engine.leases()['synthetic-lease-001'], { capacity: 100, committed: 5, held: 0, available: 95 });
  assert.equal(engine.snapshot().journalRecords, 2);
  const second = await engine.submit(other('key-0002-bbbb', { units: 7 }));
  assert.equal(second.body.effect.reservedAfter, 12);
  assert.deepEqual(types(io), ['begin', 'commit', 'begin', 'commit']);
  assert.equal(engine.tornTailBytes, 0);
});

test('duplicates join the step in flight and capacity counts what is held', async () => {
  const held = gate();
  const io = journal.createMemoryIo();
  const engine = await openEngine({ io, executor: held.executor });
  const big = other('key-0010-big1', { leaseId: 'synthetic-lease-002', units: 6 });
  const pending = [engine.submit(big), engine.submit(big), engine.submit(big)];
  await inFlight(held, big.idempotencyKey, pending);
  assert.deepEqual(engine.leases()['synthetic-lease-002'], { capacity: 10, committed: 0, held: 6, available: 4 });
  const refused = await engine.submit(other('key-0011-big2', { leaseId: 'synthetic-lease-002', units: 6 }));
  assert.deepEqual([refused.status, refused.body.error.code, refused.body.step.state], [409, 'CAPACITY_EXHAUSTED', 'none']);
  const conflict = await engine.submit({ ...big, units: 7 });
  assert.deepEqual([conflict.status, conflict.body.error.code, conflict.body.step.state], [409, 'IDEMPOTENCY_KEY_CONFLICT', 'in-flight']);
  held.release(big.idempotencyKey);
  const answers = await Promise.all(pending);
  assert.deepEqual(answers.map((item) => item.status).sort(), [200, 200, 201]);
  assert.equal(answers.filter((item) => item.body.effect.appliedByThisRequest).length, 1);
  assert.deepEqual(types(io), ['begin', 'commit']);
});

test('cancel stops an in-flight step before any effect, and a late finish creates none', async () => {
  const held = gate();
  const io = journal.createMemoryIo();
  const engine = await openEngine({ io, executor: held.executor });
  const original = engine.submit(checked());
  await inFlight(held, KEY, [original]);
  const cancelled = engine.cancel(KEY);
  assert.deepEqual([cancelled.status, cancelled.body.outcome, cancelled.body.accepted, cancelled.body.terminal], [200, 'cancelled', true, true]);
  assert.deepEqual([(await original).status, (await original).body.outcome], [409, 'cancelled']);
  held.release(KEY);
  await settle();
  assert.deepEqual(types(io), ['begin', 'cancel']);
  assert.deepEqual(engine.leases()['synthetic-lease-001'], { capacity: 100, committed: 0, held: 0, available: 100 });
  assert.equal(engine.cancel(KEY).body.error.code, 'ACTION_NOT_ALLOWED');
  assert.equal(engine.cancel('key-0404-nope').body.error.code, 'STEP_NOT_FOUND');
  assert.equal((await engine.resume(KEY)).body.error.code, 'ACTION_NOT_ALLOWED');
  const again = await engine.submit(checked());
  assert.deepEqual([again.status, again.body.outcome, again.body.replayed], [409, 'cancelled', true]);
});

test('an executor that fails leaves the step interrupted, and resume or cancel are explicit', async () => {
  let calls = 0;
  const io = journal.createMemoryIo();
  const engine = await openEngine({ io, executor: async () => { calls += 1; if (calls === 1) throw new Error('boom'); } });
  const failed = await engine.submit(checked());
  assert.deepEqual([failed.status, failed.body.outcome, failed.body.step.state, failed.body.effect.applied], [409, 'interrupted', 'interrupted', false]);
  assert.deepEqual(failed.body.recovery.allowed, ['resume', 'cancel', 'inspect']);
  assert.equal(engine.leases()['synthetic-lease-001'].held, 0);
  const resumed = await engine.resume(KEY);
  assert.deepEqual([resumed.status, resumed.body.outcome, resumed.body.attempts, resumed.body.effect.appliedByThisRequest], [200, 'succeeded', 2, true]);
  assert.deepEqual(types(io), ['begin', 'resume', 'commit']);
  const sync = await openEngine({ io: journal.createMemoryIo(), executor: () => { throw new Error('sync'); } });
  assert.equal((await sync.submit(checked())).body.outcome, 'interrupted');
});

test('a restart interrupts unfinished steps; resume checks capacity; cancel is allowed', async () => {
  const held = gate();
  const io = journal.createMemoryIo();
  const first = await openEngine({ io, executor: held.executor });
  const a = other('key-0020-aaaa', { leaseId: 'synthetic-lease-002', units: 6 });
  const pending = first.submit(a);
  await inFlight(held, a.idempotencyKey, [pending]);
  first.halt();
  assert.equal((await first.submit(checked())).body.error.code, 'JOURNAL_UNAVAILABLE');
  assert.equal(first.inspect(KEY).body.error.code, 'JOURNAL_UNAVAILABLE');
  assert.equal(first.unsupportedAction(KEY).body.error.code, 'JOURNAL_UNAVAILABLE');
  held.release(a.idempotencyKey);
  await settle();
  assert.deepEqual(types(io), ['begin'], 'a halted engine writes nothing');
  const second = await openEngine({ io });
  const seen = second.inspect(a.idempotencyKey);
  assert.deepEqual([seen.status, seen.body.outcome, seen.body.step.state, seen.body.trail.map((item) => item.type)], [200, 'interrupted', 'interrupted', ['begin']]);
  assert.equal(second.leases()['synthetic-lease-002'].held, 0);
  const taker = await second.submit(other('key-0021-bbbb', { leaseId: 'synthetic-lease-002', units: 6 }));
  assert.equal(taker.body.outcome, 'succeeded');
  const refused = await second.resume(a.idempotencyKey);
  assert.deepEqual([refused.status, refused.body.error.code, refused.body.step.state], [409, 'CAPACITY_EXHAUSTED', 'interrupted']);
  const cancelled = second.cancel(a.idempotencyKey);
  assert.deepEqual([cancelled.status, cancelled.body.outcome, cancelled.body.trail.map((item) => item.type)], [200, 'cancelled', ['begin', 'cancel']]);
  assert.equal(second.inspect('key-0404-nope').body.error.code, 'STEP_NOT_FOUND');
  assert.equal(second.unsupportedAction('key-0404-nope').body.error.code, 'UNSUPPORTED_ACTION');
});

function flaky(failCall, reachesDisk) {
  const inner = journal.createMemoryIo();
  let calls = 0;
  const io = { ...inner, append(text) { calls += 1; if (calls === failCall) { if (reachesDisk) inner.append(text); throw new Error('EIO'); } inner.append(text); }, raw: inner };
  return io;
}

test('a write that cannot be confirmed is unknown, and the next request decides from the journal', async () => {
  const lost = flaky(1, false);
  const engine = await openEngine({ io: lost });
  const unknown = await engine.submit(checked());
  assert.deepEqual([unknown.status, unknown.body.outcome, unknown.body.step.state, unknown.body.effect.applied], [503, 'unknown', 'uncertain', null]);
  const fresh = await engine.submit(checked());
  assert.deepEqual([fresh.status, fresh.body.outcome], [201, 'succeeded']);
  const landed = flaky(1, true);
  const second = await openEngine({ io: landed });
  assert.equal((await second.submit(checked())).body.outcome, 'unknown');
  const interrupted = await second.submit(checked());
  assert.deepEqual([interrupted.status, interrupted.body.outcome], [409, 'interrupted']);
  assert.equal((await second.resume(KEY)).body.outcome, 'succeeded');
  const committedLanded = flaky(2, true);
  const third = await openEngine({ io: committedLanded });
  const held = await third.submit(checked());
  assert.deepEqual([held.status, held.body.error.code], [503, 'JOURNAL_UNCERTAIN']);
  const replay = await third.submit(checked());
  assert.deepEqual([replay.status, replay.body.replayed, replay.body.effect.appliedByThisRequest, replay.body.effect.reservedAfter], [200, true, false, 5]);
  assert.deepEqual(types(committedLanded.raw), ['begin', 'commit']);
});

test('joiners of a step whose commit cannot be confirmed are unknown too, and cancel and resume writes are checked', async () => {
  const held = gate();
  const io = flaky(2, false);
  const engine = await openEngine({ io, executor: held.executor });
  const pending = [engine.submit(checked()), engine.submit(checked())];
  await inFlight(held, KEY, pending);
  held.release(KEY);
  assert.deepEqual((await Promise.all(pending)).map((item) => item.body.error.code), ['JOURNAL_UNCERTAIN', 'JOURNAL_UNCERTAIN']);
  const interrupted = await engine.submit(checked());
  assert.equal(interrupted.body.outcome, 'interrupted');
  let failing = false;
  const inner = journal.createMemoryIo();
  const writes = { ...inner, append(text) { if (failing) throw new Error('EIO'); inner.append(text); } };
  const seeded = await openEngine({ io: writes, executor: async () => { throw new Error('x'); } });
  await seeded.submit(checked());
  failing = true;
  assert.equal(seeded.cancel(KEY).body.error.code, 'JOURNAL_UNCERTAIN');
  failing = false;
  assert.equal(seeded.cancel(KEY).body.outcome, 'cancelled');
  const again = await openEngine({ io: writes, executor: async () => { throw new Error('x'); } });
  await again.submit(checked({ idempotencyKey: 'key-0030-cccc' }));
  failing = true;
  assert.equal((await again.resume('key-0030-cccc')).body.error.code, 'JOURNAL_UNCERTAIN');
});

test('a degraded engine that cannot re-read its journal reports unavailable, never success', async () => {
  const inner = journal.createMemoryIo();
  let failing = false;
  const io = { ...inner, append(text) { if (failing) throw new Error('EIO'); inner.append(text); } };
  const engine = await openEngine({ io });
  failing = true;
  assert.equal((await engine.submit(checked())).body.outcome, 'unknown');
  inner.append('garbage\n');
  const refused = await engine.submit(checked());
  assert.deepEqual([refused.status, refused.body.error.code, refused.body.effect.applied], [503, 'JOURNAL_UNAVAILABLE', null]);
  assert.equal(engine.inspect(KEY).body.error.code, 'JOURNAL_UNAVAILABLE');
});

test('the step count is bounded, and a halted engine aborts its timers', async () => {
  const held = gate();
  const engine = await openEngine({ io: journal.createMemoryIo(), executor: held.executor });
  for (let index = 0; index < 256; index += 1) {
    const key = `key-${String(index).padStart(4, '0')}-load`;
    const pending = engine.submit(other(key, { units: 1 }));
    await held.entered(key);
    assert.equal(engine.cancel(key).body.outcome, 'cancelled');
    assert.equal((await pending).status, 409);
  }
  const limited = await engine.submit(other('key-9999-over', { units: 1 }));
  assert.deepEqual([limited.status, limited.body.error.code, limited.body.step.state], [503, 'STEP_LIMIT_REACHED', 'none']);
  const delayed = await openEngine({ io: journal.createMemoryIo(), executor: delayExecutor(60000) });
  const pending = delayed.submit(checked());
  await settle();
  delayed.halt();
  assert.equal(delayed.leases()['synthetic-lease-001'].held, 5);
  assert.equal((await pending).body.step.state, 'in-flight');
  const aborted = new AbortController();
  const waiting = delayExecutor(60000)({ signal: aborted.signal });
  aborted.abort();
  await waiting;
  await delayExecutor(1)({ signal: new AbortController().signal });
});

test('a journal that is internally valid but semantically impossible is refused when the engine opens', async () => {
  const build = (steps) => {
    const io = journal.createMemoryIo();
    const opened = journal.openJournal(io);
    for (const record of steps) opened.append(record);
    return io;
  };
  const begin = (overrides) => ({ type: 'begin', key: overrides?.idempotencyKey ?? KEY, inputSha256: input.digestInput(checked(overrides)), input: checked(overrides) });
  const cases = [
    ['a commit without a begin', [{ type: 'commit', key: KEY, leaseId: 'synthetic-lease-001', units: 5, reservedAfter: 5 }]],
    ['a key that began twice', [begin(), begin()]],
    ['a record after a cancel', [begin(), { type: 'cancel', key: KEY }, { type: 'resume', key: KEY }]],
    ['a commit with other units than its begin', [begin(), { type: 'commit', key: KEY, leaseId: 'synthetic-lease-001', units: 4, reservedAfter: 4 }]],
    ['a commit with a wrong running total', [begin(), { type: 'commit', key: KEY, leaseId: 'synthetic-lease-001', units: 5, reservedAfter: 6 }]],
  ];
  for (const [name, steps] of cases) await assert.rejects(openEngine({ io: build(steps) }), (error) => error.code === 'JOURNAL_CORRUPT', name);
  await assert.rejects(openEngine({}), TypeError);
  await assert.rejects(openEngine({ io: { read() {} } }), TypeError);
  await assert.rejects(openEngine(), TypeError);
});
