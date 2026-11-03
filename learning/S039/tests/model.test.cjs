'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createLesson, LIMITS, KINDS, STORES, OBSERVATIONS, DEFAULTS,
} = require('..\\model.js');

test('durable upload preserves required artifact after ownership changes, not merely status 200', () => {
  assert.equal(typeof createLesson, 'function');
  const lesson = createLesson();
  lesson.prepare({ kind: 'upload', storage: 'durable', observation: 'intact' });
  lesson.handoff();
  const result = lesson.verify();
  assert.equal(result.verdict, 'success');
  assert.equal(result.successful, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.unknown, 0);
  assert.equal(result.responseStatus, 200);
  assert.equal(result.expected.bytes, result.observed.bytes);
  assert.deepEqual(result.expected.checkpoint, result.observed.checkpoint);
  assert.equal(result.owner, 'B');
});

function exercise(config = DEFAULTS) {
  const lesson = createLesson();
  lesson.prepare(config);
  lesson.handoff();
  return { lesson, result: lesson.verify() };
}
function unchanged(lesson, command, pattern) {
  const before = lesson.snapshot();
  assert.throws(command, pattern);
  assert.deepEqual(lesson.snapshot(), before);
}

for (const kind of KINDS) {
  for (const storage of STORES) {
    for (const observation of OBSERVATIONS) {
      test(`declared matrix: ${kind} / ${storage} / ${observation}`, () => {
        const { lesson, result } = exercise({ kind, storage, observation });
        const expectedVerdict = observation === 'unavailable' ? 'unknown'
          : storage === 'durable' && observation === 'intact' ? 'success' : 'failure';
        assert.equal(result.verdict, expectedVerdict);
        assert.equal(result.attempted, 1);
        assert.equal(result.successful + result.failed + result.unknown, 1);
        assert.equal(result[expectedVerdict === 'success' ? 'successful' : expectedVerdict === 'failure' ? 'failed' : 'unknown'], 1);
        assert.equal(result.owner, 'B');
        assert.equal(result.from, 'A');
        assert.equal(result.expected.byteLength, Buffer.byteLength(result.expected.bytes, 'utf8'));
        assert.ok(result.expected.byteLength > 0 && result.expected.byteLength <= LIMITS.artifactBytes);
        assert.match(result.expected.bytes, /^[\x00-\x7f]+$/);
        assert.match(result.expected.checksum, /^[a-f0-9]{8}$/);
        assert.deepEqual(result.checks.map((entry) => entry.id), ['byteLength', 'bytes', 'checksum', 'checkpoint']);
        if (expectedVerdict === 'unknown') {
          assert.equal(result.responseStatus, null);
          assert.equal(result.observed, null);
          assert.ok(result.checks.every((entry) => entry.status === 'unknown'));
          assert.equal(result.impact, 'unverified');
        } else {
          assert.equal(result.responseStatus, 200);
          assert.equal(result.observed.byteLength, Buffer.byteLength(result.observed.bytes));
          assert.ok(result.checks.every((entry) => ['passed', 'failed'].includes(entry.status)));
          assert.equal(result.impact, expectedVerdict === 'success'
            ? 'synthetic-uninterrupted-transition' : 'synthetic-interrupted-transition');
        }
        assert.equal(lesson.snapshot().phase, 'verified');
        assert.deepEqual(lesson.snapshot().history, [result]);
        assert.deepEqual(result.trace.map((entry) => [entry.step, entry.owner]), [
          ['prepare', 'A'], ['handoff', 'B'], ['verify', 'B'],
        ]);
      });
    }
  }
}

test('each fixture has worked bytes and required workflow state, not just status labels', () => {
  const expected = {
    upload: ['S039 synthetic upload\npart=1\ncontent=DEMO-UPLOAD\n', 2, 'awaiting-review'],
    workflow: ['{"workflowId":"synthetic-workflow-039","step":3,"status":"awaiting-review"}', 3, 'awaiting-review'],
    generated: ['S039 DEMO EXPORT\nsku,quantity\nDEMO-PEN,2\n', 4, 'ready-for-download'],
  };
  for (const kind of KINDS) {
    const { result } = exercise({ ...DEFAULTS, kind });
    const [bytes, step, status] = expected[kind];
    assert.equal(result.observed.bytes, bytes);
    assert.deepEqual(result.observed.checkpoint, { workflowId: 'synthetic-workflow-039', step, status });
    assert.ok(result.checks.every((entry) => entry.status === 'passed'));
  }
});

test('local empty response is an observed interruption, never an empty success', () => {
  const { result } = exercise({ ...DEFAULTS, storage: 'local' });
  assert.equal(result.observed.bytes, '');
  assert.equal(result.observed.byteLength, 0);
  assert.equal(result.observed.checkpoint, null);
  assert.match(result.reason, /remained on A/);
  assert.match(result.reason, /200.*zero bytes/);
  assert.equal(result.failed, 1);
  assert.ok(result.checks.every((entry) => entry.status === 'failed'));
});

test('same-length corruption fails exact-byte and checksum checks', () => {
  const { result } = exercise({ ...DEFAULTS, observation: 'corrupt' });
  assert.equal(result.observed.byteLength, result.expected.byteLength);
  assert.notEqual(result.observed.bytes, result.expected.bytes);
  assert.notEqual(result.observed.checksum, result.expected.checksum);
  assert.deepEqual(result.checks.map((entry) => entry.status), ['passed', 'failed', 'failed', 'passed']);
});

test('matching bytes do not conceal a missing workflow checkpoint', () => {
  const { result } = exercise({ ...DEFAULTS, kind: 'workflow', observation: 'missing-checkpoint' });
  assert.equal(result.observed.bytes, result.expected.bytes);
  assert.deepEqual(result.checks.map((entry) => entry.status), ['passed', 'passed', 'passed', 'failed']);
  assert.match(result.reason, /workflow checkpoint/);
});

test('unavailable observation is not counted as known loss, even with local storage', () => {
  const { result } = exercise({ ...DEFAULTS, storage: 'local', observation: 'unavailable' });
  assert.equal(result.failed, 0);
  assert.equal(result.successful, 0);
  assert.equal(result.unknown, 1);
  assert.equal(result.observed, null);
  assert.match(result.reason, /Neither persistence nor loss has been observed/);
});

test('initial state has no false success, reads or mutation history', () => {
  const lesson = createLesson();
  const state = lesson.snapshot();
  assert.equal(state.run, 1);
  assert.equal(state.phase, 'idle');
  assert.equal(state.owner, 'A');
  assert.equal(state.result, null);
  assert.equal(state.expected, null);
  assert.equal(state.config, null);
  assert.deepEqual(state.totals, { attempted: 0, successful: 0, failed: 0, unknown: 0 });
  assert.deepEqual(state.history, []);
});

test('bad configuration types, keys, values and accessors reject without mutation or coercion', () => {
  let getterCalls = 0;
  const accessor = { ...DEFAULTS };
  Object.defineProperty(accessor, 'kind', { enumerable: true, get() { getterCalls += 1; return 'upload'; } });
  const invalid = [
    null, undefined, true, 'upload', 1, [], new Date(), new String('upload'),
    {}, { kind: 'upload' }, { ...DEFAULTS, extra: true }, { ...DEFAULTS, [Symbol('extra')]: true },
    Object.assign(Object.create({ inherited: true }), DEFAULTS), accessor,
    ...['kind', 'storage', 'observation'].flatMap((key) => [
      { ...DEFAULTS, [key]: null }, { ...DEFAULTS, [key]: 1 },
      { ...DEFAULTS, [key]: { toString() { throw new Error('must not coerce'); } } },
      { ...DEFAULTS, [key]: `${DEFAULTS[key]} ` }, { ...DEFAULTS, [key]: '' },
      { ...DEFAULTS, [key]: '__proto__' }, { ...DEFAULTS, [key]: '<script>demo</script>' },
    ]),
  ];
  const lesson = createLesson();
  for (const value of invalid) unchanged(lesson, () => lesson.prepare(value), TypeError);
  assert.equal(getterCalls, 0);
  const plain = Object.assign(Object.create(null), DEFAULTS);
  lesson.prepare(plain);
  assert.deepEqual(lesson.snapshot().config, DEFAULTS);
});

test('wrong-state and extra-argument commands are non-destructive', () => {
  assert.throws(() => createLesson({}), TypeError);
  const lesson = createLesson();
  unchanged(lesson, () => lesson.prepare(), TypeError);
  unchanged(lesson, () => lesson.prepare(DEFAULTS, 'extra'), TypeError);
  unchanged(lesson, () => lesson.handoff(), /requires prepared/);
  unchanged(lesson, () => lesson.verify(), /requires transferred/);
  unchanged(lesson, () => lesson.reset('extra'), TypeError);
  unchanged(lesson, () => lesson.snapshot('extra'), TypeError);
  lesson.prepare(DEFAULTS);
  unchanged(lesson, () => lesson.prepare(DEFAULTS), /requires idle/);
  unchanged(lesson, () => lesson.verify(), /requires transferred/);
  unchanged(lesson, () => lesson.handoff('B'), TypeError);
  lesson.handoff();
  unchanged(lesson, () => lesson.handoff(), /requires prepared/);
  unchanged(lesson, () => lesson.prepare(DEFAULTS), /requires idle/);
  unchanged(lesson, () => lesson.verify('extra'), TypeError);
  lesson.verify();
  unchanged(lesson, () => lesson.verify(), /requires transferred/);
  unchanged(lesson, () => lesson.handoff(), /requires prepared/);
});

test('snapshots, results and captured configuration cannot rewrite internal state', () => {
  const lesson = createLesson();
  const input = { ...DEFAULTS };
  const prepared = lesson.prepare(input);
  input.storage = 'local';
  assert.equal(lesson.snapshot().config.storage, 'durable');
  assert.throws(() => { prepared.expected.bytes = ''; }, TypeError);
  assert.throws(() => { prepared.expected.checkpoint.step = 0; }, TypeError);
  lesson.handoff();
  const result = lesson.verify();
  assert.throws(() => result.trace.push({}), TypeError);
  assert.throws(() => { result.observed.bytes = ''; }, TypeError);
  const state = lesson.snapshot();
  assert.throws(() => state.history.splice(0, 1), TypeError);
  assert.equal(lesson.snapshot().history.length, 1);
  assert.equal(lesson.snapshot().history[0].verdict, 'success');
  assert.ok(Object.isFrozen(lesson));
});

test('reset preserves raw failure/unknown/success history and cumulative counts', () => {
  const lesson = createLesson();
  const results = [];
  for (const [storage, observation] of [['local', 'intact'], ['durable', 'unavailable'], ['durable', 'intact']]) {
    lesson.prepare({ kind: 'upload', storage, observation });
    lesson.handoff();
    results.push(lesson.verify());
    lesson.reset();
  }
  const state = lesson.snapshot();
  assert.equal(state.run, 4);
  assert.equal(state.owner, 'A');
  assert.equal(state.phase, 'idle');
  assert.equal(state.result, null);
  assert.equal(state.expected, null);
  assert.deepEqual(state.trace, []);
  assert.deepEqual(state.history, results);
  assert.deepEqual(state.totals, { attempted: 3, successful: 1, failed: 1, unknown: 1 });
});

test('reset safely abandons a prepared or transferred unverified run without fabricating a result', () => {
  const lesson = createLesson();
  lesson.prepare(DEFAULTS);
  lesson.reset();
  lesson.prepare(DEFAULTS);
  lesson.handoff();
  lesson.reset();
  assert.equal(lesson.snapshot().run, 3);
  assert.deepEqual(lesson.snapshot().history, []);
  assert.equal(lesson.snapshot().totals.attempted, 0);
});

test('page lifetime is bounded and resets never replenish run or journey budgets', () => {
  const lesson = createLesson();
  for (let index = 1; index <= LIMITS.runs; index += 1) {
    lesson.prepare(DEFAULTS);
    lesson.handoff();
    lesson.verify();
    if (index < LIMITS.runs) lesson.reset();
  }
  const state = lesson.snapshot();
  assert.equal(state.run, 12);
  assert.equal(state.totals.attempted, 12);
  assert.equal(state.history.length, 12);
  assert.equal(state.canPrepare, false);
  assert.equal(state.canReset, false);
  unchanged(lesson, () => lesson.reset(), /12-run page budget/);
  unchanged(lesson, () => lesson.prepare(DEFAULTS), /requires idle/);
  unchanged(lesson, () => lesson.verify(), /requires transferred/);
  const empty = createLesson();
  for (let index = 1; index < LIMITS.runs; index += 1) empty.reset();
  unchanged(empty, () => empty.reset(), /12-run page budget/);
  assert.equal(empty.snapshot().totals.attempted, 0);
  assert.equal(empty.snapshot().canPrepare, true);
});

test('repeating the same rehearsal produces identical deterministic results and traces', () => {
  assert.deepEqual(exercise().lesson.snapshot(), exercise().lesson.snapshot());
});
