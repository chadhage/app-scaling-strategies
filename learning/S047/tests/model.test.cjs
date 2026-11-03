'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLesson, DEFAULTS, BOUNDS, validateConfig } = require('../stream.js');

function conduct(overrides = {}, lesson = createLesson()) {
  lesson.start({ ...DEFAULTS, ...overrides });
  lesson.cutover();
  lesson.resume();
  return lesson.verify();
}

test('checkpoint continuation requests the first unacknowledged result on a new stream', () => {
  const lesson = createLesson();
  lesson.start({ ...DEFAULTS });
  lesson.cutover();
  lesson.resume();
  const result = lesson.verify();
  assert.equal(result.native.resumeFrom, 4);
  assert.equal(result.native.originalStreamSurvived, false);
  assert.deepEqual(result.native.streamIds, ['synthetic-native-v1-1', 'synthetic-native-v2-1']);
  assert.deepEqual(result.native.records, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(result.elapsedMs, 120);
  assert.equal(result.verdict, 'PASS');
});

test('unsafe replay, skipped continuation, and no continuation expose exact losses', () => {
  const replay = conduct({ continuation: 'restart' });
  assert.equal(replay.verdict, 'FAIL');
  assert.deepEqual(replay.native.metrics.duplicateSequences, [1, 2, 3]);
  assert.equal(replay.native.metrics.duplicateCount, 3);
  assert.equal(replay.native.metrics.orderOk, false);
  const skipped = conduct({ continuation: 'skip' });
  assert.equal(skipped.verdict, 'FAIL');
  assert.deepEqual(skipped.native.metrics.missingSequences, [4]);
  const absent = conduct({ continuation: 'none' });
  assert.equal(absent.verdict, 'FAIL');
  assert.equal(absent.native.resumeFrom, null);
  assert.deepEqual(absent.native.streamIds, ['synthetic-native-v1-1']);
  assert.deepEqual(absent.native.metrics.missingSequences, [4, 5, 6, 7, 8]);
  assert.equal(absent.native.grpcStatus, 14);
});

test('a proxy drop or duplicate fails independently of the complete native-shaped trace', () => {
  const dropped = conduct({ proxyEvidence: 'drop' });
  assert.equal(dropped.native.verdict, 'PASS');
  assert.equal(dropped.proxy.verdict, 'FAIL');
  assert.equal(dropped.verdict, 'FAIL');
  assert.deepEqual(dropped.proxy.metrics.missingSequences, [8]);
  const repeated = conduct({ proxyEvidence: 'duplicate' });
  assert.equal(repeated.native.verdict, 'PASS');
  assert.equal(repeated.verdict, 'FAIL');
  assert.deepEqual(repeated.proxy.metrics.duplicateSequences, [4]);
  assert.equal(repeated.proxy.metrics.duplicateCount, 1);
});

test('ordinary HTTP 200 and proxy success are not gRPC streaming evidence', () => {
  const result = conduct({ nativeEvidence: 'ordinary-http' });
  assert.equal(result.native.transport, 'HTTP/1.1');
  assert.equal(result.native.contentType, 'application/json');
  assert.equal(result.native.httpStatus, 200);
  assert.equal(result.proxy.verdict, 'PASS');
  assert.equal(result.native.verdict, 'UNSUPPORTED');
  assert.equal(result.verdict, 'UNSUPPORTED');
  assert.equal(result.nativeProof, 'not performed');
});

test('HTTP 200 and all results cannot hide a nonzero gRPC trailer', () => {
  const result = conduct({ nativeEvidence: 'grpc-error' });
  assert.equal(result.native.httpStatus, 200);
  assert.equal(result.native.grpcStatus, 14);
  assert.equal(result.native.metrics.complete, true);
  assert.equal(result.proxy.verdict, 'PASS');
  assert.equal(result.native.verdict, 'FAIL');
  assert.equal(result.verdict, 'FAIL');
});

test('missing native observations are unknown, not zero losses inferred from proxy success', () => {
  const result = conduct({ nativeEvidence: 'missing' });
  assert.equal(result.native.verdict, 'UNKNOWN');
  assert.equal(result.verdict, 'UNKNOWN');
  assert.equal(result.proxy.verdict, 'PASS');
  assert.equal(result.native.records, null);
  assert.equal(result.native.streamIds, null);
  assert.equal(result.native.originalStreamSurvived, null);
  assert.equal(result.native.metrics.missingCount, null);
  assert.equal(result.native.metrics.observed, null);
  assert.equal(result.native.metrics.unknown, 8);
});

test('missing gRPC trailers are not supplied by complete sequences or HTTP status', () => {
  const result = conduct({ nativeEvidence: 'missing-trailers' });
  assert.equal(result.native.transport, 'HTTP/2');
  assert.equal(result.native.contentType, 'application/grpc');
  assert.equal(result.native.httpStatus, 200);
  assert.equal(result.native.metrics.complete, true);
  assert.equal(result.native.grpcStatus, null);
  assert.equal(result.native.verdict, 'UNKNOWN');
  assert.equal(result.verdict, 'UNKNOWN');
});

test('missing proxy evidence does not erase independently checked native observations', () => {
  const result = conduct({ proxyEvidence: 'missing' });
  assert.equal(result.native.verdict, 'PASS');
  assert.equal(result.proxy.verdict, 'UNKNOWN');
  assert.equal(result.proxy.records, null);
  assert.equal(result.proxy.metrics.missingSequences, null);
  assert.equal(result.proxy.metrics.unknown, 8);
  assert.equal(result.verdict, 'UNKNOWN');
});

test('known failure takes precedence over missing or unsupported evidence', () => {
  const missing = conduct({ nativeEvidence: 'missing', proxyEvidence: 'duplicate' });
  assert.equal(missing.native.verdict, 'UNKNOWN');
  assert.equal(missing.proxy.verdict, 'FAIL');
  assert.equal(missing.verdict, 'FAIL');
  const late = conduct({ nativeEvidence: 'ordinary-http', budgetMs: 119 });
  assert.equal(late.verdict, 'FAIL');
  assert.equal(late.checks.find((check) => check.id === 'native-protocol').status, 'UNSUPPORTED');
  const noContinuation = conduct({ continuation: 'none', nativeEvidence: 'missing', proxyEvidence: 'missing' });
  assert.equal(noContinuation.verdict, 'FAIL');
  assert.equal(noContinuation.checks.find((check) => check.id === 'new-stream').status, 'FAIL');
});

test('deadline is inclusive and includes work admitted before cutover', () => {
  const exact = conduct({ budgetMs: 120 });
  assert.equal(exact.elapsedMs, 120);
  assert.equal(exact.verdict, 'PASS');
  const late = conduct({ budgetMs: 119 });
  assert.equal(late.verdict, 'FAIL');
  assert.equal(late.checks.find((check) => check.id === 'original-deadline').status, 'FAIL');
  assert.deepEqual(late.trace.map((event) => event.atMs), [30, 30, 120, 120]);
  assert.equal(conduct({ resumeDelayMs: 0, budgetMs: 80 }).verdict, 'PASS');
});

test('input validation rejects malformed, ambiguous, inherited, extra and nonfinite values atomically', () => {
  const bad = [null, [], 'defaults', {}, Object.create(DEFAULTS)];
  for (const [key, values] of [
    ['acknowledged', [0, 7, 1.5, '3', '', NaN, Infinity, undefined]],
    ['resumeDelayMs', [-1, 1001, 1.5, '0', NaN, Infinity]],
    ['budgetMs', [0, 1001, 2.5, '120', NaN, Infinity]],
    ['continuation', ['CHECKPOINT', 'unknown', '', null]],
    ['nativeEvidence', ['http', 'unknown', '', null]],
    ['proxyEvidence', ['success', 'unknown', '', null]],
  ]) {
    values.forEach((value) => bad.push({ ...DEFAULTS, [key]: value }));
  }
  bad.push({ ...DEFAULTS, extra: true }, { ...DEFAULTS, [Symbol('extra')]: true });
  const accessor = { ...DEFAULTS };
  Object.defineProperty(accessor, 'budgetMs', { get() { throw new Error('Accessor must never execute'); }, enumerable: true });
  bad.push(accessor);
  for (const input of bad) {
    const lesson = createLesson();
    const before = lesson.snapshot();
    assert.throws(() => lesson.start(input), { code: 'INVALID_INPUT' });
    assert.deepEqual(lesson.snapshot(), before);
  }
  assert.deepEqual(validateConfig({ ...DEFAULTS, acknowledged: 1, resumeDelayMs: 1000, budgetMs: 1000 }), { ...DEFAULTS, acknowledged: 1, resumeDelayMs: 1000, budgetMs: 1000 });
  assert.deepEqual(validateConfig({ ...DEFAULTS, acknowledged: 6, resumeDelayMs: 0, budgetMs: 1 }), { ...DEFAULTS, acknowledged: 6, resumeDelayMs: 0, budgetMs: 1 });
});

test('phase guards reject out-of-order and repeated actions without changing state', () => {
  const lesson = createLesson();
  function unchanged(action) {
    const before = lesson.snapshot();
    assert.throws(action, { code: 'INVALID_PHASE' });
    assert.deepEqual(lesson.snapshot(), before);
  }
  unchanged(() => lesson.cutover());
  unchanged(() => lesson.resume());
  unchanged(() => lesson.verify());
  lesson.start({ ...DEFAULTS });
  unchanged(() => lesson.start({ ...DEFAULTS }));
  unchanged(() => lesson.resume());
  unchanged(() => lesson.verify());
  lesson.cutover();
  unchanged(() => lesson.cutover());
  unchanged(() => lesson.verify());
  lesson.resume();
  unchanged(() => lesson.resume());
  unchanged(() => lesson.cutover());
  lesson.verify();
  unchanged(() => lesson.verify());
  unchanged(() => lesson.start({ ...DEFAULTS }));
});

test('admission copies inputs; returned state, results and full history are deeply immutable', () => {
  const config = { ...DEFAULTS };
  const lesson = createLesson();
  lesson.start(config);
  config.acknowledged = 6;
  assert.equal(lesson.snapshot().config.acknowledged, 3);
  assert.throws(() => { lesson.snapshot().config.acknowledged = 6; }, TypeError);
  lesson.cutover();
  lesson.resume();
  const result = lesson.verify();
  assert.throws(() => result.native.records.push(9), TypeError);
  assert.throws(() => { lesson.snapshot().history[0].native.grpcStatus = 14; }, TypeError);
  assert.throws(() => lesson.snapshot().history.push(result), TypeError);
  assert.equal(lesson.snapshot().result.native.grpcStatus, 0);
});

test('reset preserves a checked failure and returns exact defaults without duplicating history', () => {
  const lesson = createLesson();
  const failed = conduct({ continuation: 'skip' }, lesson);
  lesson.reset();
  assert.deepEqual(lesson.snapshot(), {
    phase: 'ready', runId: null, config: null, resumeFrom: null, elapsedMs: 0,
    nativeRecords: [], proxyRecords: [], trace: [], result: null, history: [failed],
  });
  const before = lesson.snapshot();
  lesson.reset();
  assert.deepEqual(lesson.snapshot(), before);
  const next = conduct({}, lesson);
  assert.equal(next.runId, 2);
  assert.equal(next.verdict, 'PASS');
  assert.equal(lesson.snapshot().history[0].verdict, 'FAIL');
});

test('reset records each unfinished phase as UNKNOWN with partial receipts and no fabricated drops', () => {
  for (const phase of ['streaming', 'cutover', 'resumed']) {
    const lesson = createLesson();
    lesson.start({ ...DEFAULTS });
    if (phase !== 'streaming') lesson.cutover();
    if (phase === 'resumed') lesson.resume();
    lesson.reset();
    const result = lesson.snapshot().history[0];
    assert.equal(result.verdict, 'UNKNOWN');
    assert.equal(result.phaseAtReset, phase);
    assert.equal(result.reason, 'RESET_INCOMPLETE');
    assert.equal(result.native.metrics.missingCount, null);
    assert.equal(result.native.metrics.unknown, 8);
    assert.ok(result.partialObservations.native.length >= 3);
    assert.equal(result.trace.at(-1).action, 'reset-incomplete');
    lesson.reset();
    assert.equal(lesson.snapshot().history.length, 1);
  }
});

test('only the eight newest complete receipts are retained; run numbers are never reused', () => {
  const lesson = createLesson();
  for (let index = 0; index < 12; index += 1) {
    conduct({ proxyEvidence: index % 2 ? 'complete' : 'drop' }, lesson);
    lesson.reset();
  }
  const history = lesson.snapshot().history;
  assert.equal(history.length, BOUNDS.history);
  assert.deepEqual(history.map((result) => result.runId), [5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(history[0].verdict, 'FAIL');
  assert.deepEqual(history[0].proxy.metrics.missingSequences, [8]);
  assert.equal(history[0].trace.length, 4);
});

test('the fixed fixture and clock are deterministic with no ambient timestamps', () => {
  assert.deepEqual(conduct(), conduct());
  assert.equal(conduct({ acknowledged: 1 }).elapsedMs, 120);
  assert.equal(conduct({ acknowledged: 6 }).elapsedMs, 120);
  assert.equal(conduct({ acknowledged: 6, continuation: 'restart', proxyEvidence: 'duplicate' }).proxy.records.length, 15);
});

test('all 80 bounded policy/observer combinations preserve independent classifications', () => {
  const combine = (left, right) => ['FAIL', 'UNSUPPORTED', 'UNKNOWN', 'PASS'].find((status) => left === status || right === status);
  let checked = 0;
  for (const continuation of ['checkpoint', 'restart', 'skip', 'none']) {
    for (const nativeEvidence of ['grpc', 'ordinary-http', 'missing-trailers', 'grpc-error', 'missing']) {
      for (const proxyEvidence of ['complete', 'drop', 'duplicate', 'missing']) {
        const result = conduct({ continuation, nativeEvidence, proxyEvidence });
        const native = continuation === 'none' || nativeEvidence === 'grpc-error'
          || (nativeEvidence !== 'missing' && continuation !== 'checkpoint') ? 'FAIL'
          : nativeEvidence === 'ordinary-http' ? 'UNSUPPORTED'
            : ['missing', 'missing-trailers'].includes(nativeEvidence) ? 'UNKNOWN' : 'PASS';
        const proxy = proxyEvidence === 'missing' ? 'UNKNOWN'
          : continuation !== 'checkpoint' || proxyEvidence !== 'complete' ? 'FAIL' : 'PASS';
        assert.equal(result.native.verdict, native, JSON.stringify(result.configuration));
        assert.equal(result.proxy.verdict, proxy, JSON.stringify(result.configuration));
        assert.equal(result.verdict, combine(native, proxy), JSON.stringify(result.configuration));
        assert.ok(result.elapsedMs <= 180);
        assert.ok(result.trace.length <= 4);
        checked += 1;
      }
    }
  }
  assert.equal(checked, 80);
});
