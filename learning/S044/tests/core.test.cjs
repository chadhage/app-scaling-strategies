'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { DEFAULTS, createRehearsal } = require('..\\range-resume.js');

async function run(changes = {}, lesson = createRehearsal()) {
  lesson.admit({ ...DEFAULTS, ...changes });
  return lesson.resume();
}

test('the stub contract is loadable without packages or browser tools', () => {
  assert.equal(typeof createRehearsal, 'function');
  for (const method of ['admit', 'resume', 'reset', 'snapshot']) {
    assert.equal(typeof createRehearsal()[method], 'function');
  }
});

test('correct range resumes the retained prefix and verifies real SHA-256', async () => {
  const result = await run();
  assert.equal(result.verdict, 'PASS');
  assert.equal(result.request.range, 'bytes=12-');
  assert.equal(result.request.ifRange, '"s044-artifact-v1"');
  assert.equal(result.bytes.assembled, 32);
  assert.deepEqual(result.bytes.missing, []);
  assert.deepEqual(result.bytes.duplicates, []);
  assert.equal(result.hash.observed, createHash('sha256').update(Buffer.from(Array.from({ length: 32 }, (_, i) => i))).digest('hex'));
  assert.equal(result.hash.observed, result.hash.expected);
  assert.equal(result.timing.elapsedMs, 70);
  assert.deepEqual(result.counts, { attempted: 1, succeeded: 1, interrupted: 0, unknown: 0 });
});

test('a successful 206 with a gap fails and identifies its missing offset', async () => {
  const result = await run({ response: 'gap' });
  assert.equal(result.verdict, 'FAIL');
  assert.equal(result.response.status, 206);
  assert.deepEqual(result.bytes.missing, [12]);
  assert.equal(result.bytes.assembled, 31);
  assert.equal(result.hash.matches, false);
  assert.equal(result.counts.interrupted, 1);
});

test('a successful 206 with overlap fails and identifies the duplicate offset', async () => {
  const result = await run({ response: 'duplicate' });
  assert.equal(result.verdict, 'FAIL');
  assert.equal(result.response.status, 206);
  assert.deepEqual(result.bytes.duplicates, [11]);
  assert.equal(result.bytes.assembled, 33);
  assert.equal(result.hash.matches, false);
});

test('same-length corruption needs a content digest, not only byte counts', async () => {
  const result = await run({ response: 'corrupt' });
  assert.equal(result.verdict, 'FAIL');
  assert.equal(result.bytes.assembled, 32);
  assert.equal(result.checks.byteCount, true);
  assert.equal(result.checks.coverage, true);
  assert.equal(result.hash.matches, false);
});

test('a 200 response is unsupported range resumption, never appended as success', async () => {
  const result = await run({ response: 'ignored' });
  assert.equal(result.verdict, 'FAIL');
  assert.equal(result.response.status, 200);
  assert.equal(result.checks.rangeSupported, false);
  assert.equal(result.bytes.received, 32);
  assert.equal(result.bytes.assembled, 12);
  assert.equal(result.hash.observed, null);
  assert.match(result.reasons.join(' '), /unsupported/i);
});

test('original-clock deadline is inclusive and a retry does not reset it', async () => {
  const boundary = await run({ delayMs: 40 });
  assert.equal(boundary.verdict, 'PASS');
  assert.equal(boundary.timing.elapsedMs, 100);
  const late = await run({ delayMs: 41 });
  assert.equal(late.verdict, 'FAIL');
  assert.equal(late.timing.elapsedMs, 101);
  assert.equal(late.timing.withinBudget, false);
});

test('missing checksum proof is UNKNOWN, not a successful response', async () => {
  const result = await run({ hashEvidence: 'missing' });
  assert.equal(result.verdict, 'UNKNOWN');
  assert.equal(result.hash.matches, null);
  assert.equal(result.checks.contentHash, null);
  assert.deepEqual(result.counts, { attempted: 1, succeeded: 0, interrupted: 0, unknown: 1 });
  assert.match(result.reasons.join(' '), /checksum.*not observed/i);
});

test('missing checksum evidence cannot erase a known gap or original budget violation', async () => {
  const gap = await run({ response: 'gap', hashEvidence: 'missing' });
  assert.equal(gap.verdict, 'FAIL');
  assert.deepEqual(gap.bytes.missing, [12]);
  assert.equal(gap.checks.contentHash, null);
  const late = await run({ delayMs: 41, hashEvidence: 'missing' });
  assert.equal(late.verdict, 'FAIL');
  assert.equal(late.timing.withinBudget, false);
});

test('strict input guards reject invalid numbers, enums, object shapes, and extra fields', () => {
  const invalid = [
    { prefixBytes: '' }, { prefixBytes: '12' }, { prefixBytes: null }, { prefixBytes: true },
    { prefixBytes: 3 }, { prefixBytes: 29 }, { prefixBytes: 12.5 }, { prefixBytes: NaN },
    { delayMs: -1 }, { delayMs: 1001 }, { delayMs: Infinity }, { delayMs: '10' },
    { budgetMs: 0 }, { budgetMs: 1001 }, { budgetMs: false }, { budgetMs: 1.5 },
    { response: '206' }, { response: '<script>bad</script>' }, { hashEvidence: 'yes' },
    { extra: 'ignored?' },
  ];
  for (const changes of invalid) {
    const lesson = createRehearsal();
    assert.throws(() => lesson.admit({ ...DEFAULTS, ...changes }), /input/i, JSON.stringify(changes));
    assert.equal(lesson.snapshot().phase, 'idle');
  }
  for (const value of [null, [], 'config', 12, undefined, {}]) {
    assert.throws(() => createRehearsal().admit(value), /input/i);
  }
});

test('state guards reject premature/repeated actions, including reset during verification', async () => {
  const lesson = createRehearsal();
  await assert.rejects(lesson.resume(), /state/i);
  lesson.admit({ ...DEFAULTS });
  assert.equal(lesson.snapshot().phase, 'paused');
  assert.throws(() => lesson.admit({ ...DEFAULTS }), /state/i);
  const verification = lesson.resume();
  assert.equal(lesson.snapshot().phase, 'verifying');
  assert.throws(() => lesson.reset(), /state/i);
  await assert.rejects(lesson.resume(), /state/i);
  await verification;
  await assert.rejects(lesson.resume(), /state/i);
});

test('reset preserves failed history and an unfinished prefix becomes UNKNOWN', async () => {
  const lesson = createRehearsal();
  await run({ response: 'gap' }, lesson);
  lesson.reset();
  await run({}, lesson);
  const reset = lesson.reset();
  assert.equal(reset.phase, 'idle');
  assert.deepEqual(reset.history.map((item) => item.verdict), ['FAIL', 'PASS']);
  lesson.admit({ ...DEFAULTS });
  lesson.reset();
  assert.equal(lesson.snapshot().history[2].verdict, 'UNKNOWN');
  assert.match(lesson.snapshot().history[2].reasons.join(' '), /reset before resume/i);
});

test('history is bounded at eight completed outcomes with monotonic identifiers', async () => {
  const lesson = createRehearsal();
  for (let i = 0; i < 10; i += 1) {
    await run({ response: i % 2 ? 'correct' : 'gap' }, lesson);
    lesson.reset();
  }
  const snapshot = lesson.snapshot();
  assert.equal(snapshot.history.length, 8);
  assert.deepEqual(snapshot.history.map((item) => item.runId), [3, 4, 5, 6, 7, 8, 9, 10]);
});

test('active configuration and returned snapshots cannot mutate private state', async () => {
  const lesson = createRehearsal();
  const input = { ...DEFAULTS };
  lesson.admit(input);
  input.response = 'gap';
  const snapshot = lesson.snapshot();
  assert.ok(snapshot.active);
  assert.throws(() => { snapshot.active.config.response = 'gap'; }, TypeError);
  const result = await lesson.resume();
  assert.equal(result.verdict, 'PASS');
  assert.throws(() => { result.verdict = 'FAIL'; }, TypeError);
  assert.equal(lesson.snapshot().history[0].verdict, 'PASS');
});

test('all permitted prefix extremes preserve exact original content', async () => {
  for (const prefixBytes of [4, 28]) {
    const result = await run({ prefixBytes, delayMs: 0, budgetMs: 60 });
    assert.equal(result.verdict, 'PASS');
    assert.equal(result.bytes.received, 32 - prefixBytes);
    assert.equal(result.hash.observed, result.hash.expected);
    assert.equal(result.timing.completedAtMs, 60);
  }
});

test('checksum execution errors become explicit UNKNOWN while known failures still win', async (context) => {
  context.mock.method(globalThis.crypto.subtle, 'digest', async () => { throw new Error('Synthetic digest unavailable'); });
  const unknown = await run();
  assert.equal(unknown.verdict, 'UNKNOWN');
  assert.match(unknown.reasons.join(' '), /checksum calculation unavailable/i);
  assert.equal(unknown.hash.observed, null);
  assert.equal(unknown.timing.completedAtMs, null);
  const failed = await run({ response: 'gap' });
  assert.equal(failed.verdict, 'FAIL');
  assert.equal(failed.checks.contentHash, null);
  assert.equal(failed.counts.interrupted, 1);
});
