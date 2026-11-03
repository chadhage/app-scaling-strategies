'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createSession, defaults, ARTIFACT, LIMITS } = require('../upload.js');

test('shared accepted parts survive ownership transfer and resume successfully', async () => {
  const session = createSession();
  for (const action of ['start', 'pause', 'transfer', 'resume', 'verify']) {
    const response = await session.dispatch(action);
    assert.equal(response.ok, true, `${action} must be a supported action`);
  }
  assert.equal(session.view().current.result.outcome, 'success',
    'reconciled shared parts, correct final content and original budget must succeed');
});

async function conduct(changes = {}, stale = false) {
  const session = createSession();
  for (const action of ['start', 'pause', 'transfer']) {
    const result = await session.dispatch(action, action === 'start' ? { ...defaults(), ...changes } : undefined);
    assert.equal(result.ok, true, result.error);
  }
  if (stale) assert.equal((await session.dispatch('probe-stale')).ok, true);
  assert.equal((await session.dispatch('resume')).ok, true);
  if (session.view().phase === 'resumed') assert.equal((await session.dispatch('verify')).ok, true);
  return session;
}

test('safe continuation measures exact parts, bytes, original clock and independent SHA-256', async () => {
  const session = await conduct();
  const result = session.view().current.result;
  const original = [1, 2, 3, 4].map((id) => `S043-part-${id}\n`).join('');
  assert.equal(Buffer.byteLength(original), ARTIFACT.bytes);
  assert.equal(result.actualSha256, createHash('sha256').update(original).digest('hex'));
  assert.equal(result.actualSha256, ARTIFACT.sha256);
  assert.equal(result.finalBytes, 48);
  assert.equal(result.finalPartCount, 4);
  assert.equal(result.preservedParts, 2);
  assert.equal(result.owner, 'v2');
  assert.equal(result.epoch, 2);
  assert.deepEqual(result.transmittedPartIds, [1, 2, 3, 4]);
  assert.equal(result.transmittedBytes, 48);
  assert.equal(result.duplicateUploads, 0);
  assert.equal(result.completionElapsedMs, 700);
  assert.equal(result.originalBudgetMs, 1000);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.unknowns, []);
  assert.equal(session.view().history.length, 1);
});

for (const [name, config, expected] of [
  ['instance-local loss', { storage: 'instance-local' }, { preserved: 0, duplicates: 2, bytes: 72, hashMatches: true }],
  ['restart duplicates', { resumePolicy: 'restart' }, { preserved: 2, duplicates: 2, bytes: 72, hashMatches: true }],
  ['same-length corruption', { payload: 'corrupt' }, { preserved: 2, duplicates: 0, bytes: 48, hashMatches: false }],
]) {
  test(`${name} fails even when a final artifact has 48 bytes`, async () => {
    const result = (await conduct(config)).view().current.result;
    assert.equal(result.outcome, 'failure');
    assert.equal(result.finalBytes, 48);
    assert.equal(result.preservedParts, expected.preserved);
    assert.equal(result.duplicateUploads, expected.duplicates);
    assert.equal(result.transmittedBytes, expected.bytes);
    assert.equal(result.actualSha256 === result.expectedSha256, expected.hashMatches);
    assert.ok(result.failures.length > 0);
  });
}

for (const [duration, expected] of [[0, 'success'], [700, 'success'], [701, 'failure'], [10000, 'failure']]) {
  test(`continuation ${duration} ms uses the inclusive original deadline`, async () => {
    const result = (await conduct({ continuationMs: duration })).view().current.result;
    assert.equal(result.outcome, expected);
    assert.equal(result.completionElapsedMs, duration + 300);
    assert.equal(result.originalBudgetMs, 1000);
    assert.equal(result.actualSha256, result.expectedSha256);
  });
}

test('unavailable listing yields unknown without speculative uploads or observed final proof', async () => {
  const state = (await conduct({ listing: 'unavailable', payload: 'corrupt', resumePolicy: 'restart' })).view();
  const result = state.current.result;
  assert.equal(result.outcome, 'unknown');
  assert.equal(state.current.acceptedPartIds, null);
  assert.equal(result.preservedParts, null);
  assert.equal(result.actualSha256, null);
  assert.equal(result.finalBytes, null);
  assert.equal(result.completionElapsedMs, null);
  assert.equal(result.uploadedParts, 2);
  assert.equal(result.duplicateUploads, 0);
  assert.deepEqual(result.transmittedPartIds, [1, 2]);
  assert.equal(state.history.length, 1);
  assert.ok(result.unknowns.length >= 3);
});

for (const config of [{ storage: 'instance-local' }, { budgetMs: 100 }]) {
  test(`known ${Object.keys(config)[0]} failure outranks missing listing proof`, async () => {
    const result = (await conduct({ ...config, listing: 'unavailable' })).view().current.result;
    assert.equal(result.outcome, 'failure');
    assert.equal(result.actualSha256, null);
    assert.equal(result.uploadedParts, 2);
    assert.ok(result.failures.length > 0);
    assert.ok(result.unknowns.length > 0);
  });
}

test('stale epochs are rejected with no accepted-part or upload effects', async () => {
  const session = createSession();
  for (const action of ['start', 'pause', 'transfer']) await session.dispatch(action);
  const before = session.view().current;
  await session.dispatch('probe-stale');
  const after = session.view().current;
  assert.deepEqual(after.acceptedPartIds, before.acceptedPartIds);
  assert.deepEqual(after.transmittedPartIds, before.transmittedPartIds);
  assert.equal(after.duplicateUploads, 0);
  assert.equal(after.elapsedMs, before.elapsedMs);
  assert.equal(after.staleRejections, 1);
  assert.match(after.trace.at(-1).event, /Rejected stale v1 epoch 1/);
  await session.dispatch('resume');
  await session.dispatch('verify');
  assert.equal(session.view().current.result.outcome, 'success');
  assert.equal(session.view().current.result.staleRejections, 1);
});

test('stale writer probes have a per-run bound', async () => {
  const session = createSession();
  for (const action of ['start', 'pause', 'transfer']) await session.dispatch(action);
  for (let count = 0; count < LIMITS.staleProbes; count++) {
    assert.equal((await session.dispatch('probe-stale')).ok, true);
  }
  const before = session.view();
  assert.equal((await session.dispatch('probe-stale')).ok, false);
  assert.deepEqual(session.view(), before);
});

const invalidConfigurations = [
  null, [], 'shared', {}, { ...defaults(), extra: true },
  { ...defaults(), storage: 'unknown' }, { ...defaults(), resumePolicy: 'partial' },
  { ...defaults(), listing: '' }, { ...defaults(), payload: 'silent' },
  ...[-1, 0.5, 10001, NaN, Infinity, '400', null].map((continuationMs) => ({ ...defaults(), continuationMs })),
  ...[99, 10001, 100.5, '1000', NaN, Infinity].map((budgetMs) => ({ ...defaults(), budgetMs })),
];
invalidConfigurations.forEach((config, index) => {
  test(`invalid configuration ${index + 1} is rejected without changing state`, async () => {
    const session = createSession();
    const before = session.view();
    const result = await session.dispatch('start', config);
    assert.equal(result.ok, false);
    assert.ok(result.error.length > 0);
    assert.deepEqual(session.view(), before);
  });
});

test('missing fields, foreign prototypes and inherited configuration are rejected', async () => {
  const missing = defaults();
  delete missing.budgetMs;
  for (const config of [missing, Object.create(defaults()), Object.assign(Object.create(null), defaults())]) {
    const session = createSession();
    assert.equal((await session.dispatch('start', config)).ok, false);
    assert.equal(session.view().runCount, 0);
  }
});

test('unknown, out-of-order and extra-payload actions are non-destructive', async () => {
  const session = createSession();
  for (const action of [null, {}, '__proto__', 'constructor', 'deploy', 'pause', 'transfer', 'resume', 'verify', 'probe-stale']) {
    const before = session.view();
    assert.equal((await session.dispatch(action)).ok, false);
    assert.deepEqual(session.view(), before);
  }
  await session.dispatch('start');
  for (const action of ['start', 'transfer', 'resume', 'verify', 'probe-stale']) {
    const before = session.view();
    assert.equal((await session.dispatch(action)).ok, false);
    assert.deepEqual(session.view(), before);
  }
  const before = session.view();
  assert.equal((await session.dispatch('pause', defaults())).ok, false);
  assert.deepEqual(session.view(), before);
});

test('input and returned views cannot mutate captured configuration or history', async () => {
  const config = defaults();
  const session = createSession();
  await session.dispatch('start', config);
  config.budgetMs = 100;
  const external = session.view();
  external.current.config.storage = 'instance-local';
  external.current.transmittedPartIds.push(1);
  external.limits.runs = 100;
  for (const action of ['pause', 'transfer', 'resume', 'verify']) await session.dispatch(action);
  const original = session.view();
  const tampered = session.view();
  tampered.history[0].outcome = 'success-without-proof';
  tampered.current.result.actualSha256 = 'forged';
  assert.deepEqual(session.view(), original);
  assert.equal(original.current.result.outcome, 'success');
  assert.equal(original.current.config.budgetMs, 1000);
  assert.equal(defaults().storage, 'shared');
});

test('reset preserves a terminal failure and all measurements', async () => {
  const session = await conduct({ resumePolicy: 'restart' });
  const before = session.view();
  const result = await session.dispatch('reset');
  assert.equal(result.ok, true);
  assert.equal(result.view.phase, 'idle');
  assert.equal(result.view.current, null);
  assert.equal(result.view.runCount, 1);
  assert.equal(result.view.commandCount, before.commandCount + 1);
  assert.deepEqual(result.view.history, before.history);
  await session.dispatch('start');
  assert.deepEqual(session.view().current.config, defaults());
  assert.equal(session.view().current.runId, 2);
});

for (const [budgetMs, expected] of [[1000, 'unknown'], [100, 'failure']]) {
  test(`reset of an unfinished upload records ${expected} instead of erasing it`, async () => {
    const session = createSession();
    await session.dispatch('start', { ...defaults(), budgetMs });
    await session.dispatch('reset');
    assert.equal(session.view().history.length, 1);
    assert.equal(session.view().history[0].outcome, expected);
    assert.equal(session.view().history[0].actualSha256, null);
    const before = session.view();
    await session.dispatch('reset');
    assert.deepEqual(session.view(), before);
  });
}

test('missing Web Crypto evidence stays unknown with observed bytes', async (context) => {
  context.mock.method(globalThis.crypto.subtle, 'digest', async () => { throw new Error('Synthetic digest unavailable'); });
  const result = (await conduct()).view().current.result;
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.finalBytes, 48);
  assert.equal(result.actualSha256, null);
  assert.ok(result.unknowns.some((reason) => reason.includes('SHA-256')));
});

test('a concurrent reset cannot race asynchronous hash verification', async () => {
  const session = createSession();
  for (const action of ['start', 'pause', 'transfer', 'resume']) await session.dispatch(action);
  const verification = session.dispatch('verify');
  const rejected = await session.dispatch('reset');
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /running/);
  await verification;
  assert.equal(session.view().current.result.outcome, 'success');
  assert.equal(session.view().history.length, 1);
});

test('twelve started runs remain retained and reset never replenishes the run bound', async () => {
  const session = createSession();
  for (let index = 0; index < LIMITS.runs; index++) {
    assert.equal((await session.dispatch('start')).ok, true);
    assert.equal((await session.dispatch('reset')).ok, true);
  }
  const before = session.view();
  assert.equal(before.history.length, LIMITS.runs);
  assert.equal((await session.dispatch('start')).ok, false);
  await session.dispatch('reset');
  assert.deepEqual(session.view(), before);
});

test('the 96-action bound is independent and still permits a non-erasing reset', async () => {
  const session = createSession();
  for (let index = 0; index < 9; index++) {
    for (const action of ['start', 'pause', 'transfer', ...Array(4).fill('probe-stale'), 'resume', 'verify', 'reset']) {
      assert.equal((await session.dispatch(action)).ok, true);
    }
  }
  for (const action of ['start', 'pause', 'transfer', ...Array(3).fill('probe-stale')]) {
    assert.equal((await session.dispatch(action)).ok, true);
  }
  assert.equal(session.view().commandCount, 96);
  const before = session.view();
  assert.equal((await session.dispatch('resume')).ok, false);
  assert.deepEqual(session.view(), before);
  await session.dispatch('reset');
  assert.equal(session.view().commandCount, 96);
  assert.equal(session.view().history.length, 10);
  assert.equal(session.view().history.at(-1).outcome, 'unknown');
  assert.equal((await session.dispatch('start')).ok, false);
  assert.ok(session.view().history.every((result) => result.trace.length <= LIMITS.trace));
});

test('the fixed model is deterministic and trace offsets remain ordered', async () => {
  const first = (await conduct({ resumePolicy: 'restart', continuationMs: 0 }, true)).view();
  const second = (await conduct({ resumePolicy: 'restart', continuationMs: 0 }, true)).view();
  assert.deepEqual(first, second);
  const offsets = first.current.trace.map((event) => event.atMs);
  assert.deepEqual(offsets, [...offsets].sort((a, b) => a - b));
});
