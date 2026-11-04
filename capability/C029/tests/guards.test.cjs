'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const evaluator = require('..\\evaluator.js');
const decoder = require('..\\..\\C034\\trace.js');
const ledger = require('..\\..\\C023\\ledger.js');
const { copy } = require('./helpers.cjs');
const saved = () => copy(decoder.getSavedTrace('closed-history'));
function rejectedCopy(candidate) {
  const report = evaluator.evaluateCandidate(JSON.stringify(candidate), 'closed-history');
  assert.equal(report.valid, false);
  assert.equal(report.decision, 'HOLD');
  assert.equal(report.eligibleForLiveRun, false);
  assert.equal(report.sourceConsistentHistorical, false);
  assert.deepEqual(report.counts, { originals: 7, pass: 0, fail: 0, unknown: 7 });
  return report;
}
const modifications = [
  ['own root schema', (value) => { value.eligible = true; }],
  ['claimed verdict', (value) => { value.verdict = 'PASS'; }],
  ['claimed qualification', (value) => { value.snapshot.fullJourneyQualified = true; }],
  ['source hash authority', (value) => { value.source.savedDom.rawSha256 = '0'.repeat(64); }],
  ['source publication', (value) => { value.source.acceptedC033.commit = '0'.repeat(40); }],
  ['original identity', (value) => { value.snapshot.history[2].attemptId = 'synthetic-C033-attempt-7'; }],
  ['replacement chosen only', (value) => { value.snapshot.history = [value.snapshot.history[1]]; }],
  ['failed original deleted', (value) => { value.snapshot.history.splice(3, 1); }],
  ['unknown original deleted', (value) => { value.snapshot.history.splice(4, 1); }],
  ['original history order', (value) => { [value.snapshot.history[0], value.snapshot.history[1]] = [value.snapshot.history[1], value.snapshot.history[0]]; }],
  ['start clock', (value) => { value.snapshot.history[2].startedAt += 1000; }],
  ['new retry deadline', (value) => { value.snapshot.history[2].deadline += 1000; }],
  ['held time subtracted', (value) => { value.snapshot.history[2].elapsedMs -= value.snapshot.history[2].pausedMs; }],
  ['budget flag lie', (value) => { value.snapshot.history[2].budgetExceeded = false; }],
  ['budget type', (value) => { value.snapshot.history[2].original.budgetMs = '1000'; }],
  ['budget override', (value) => { value.snapshot.history[2].original.budgetMs = 12000; }],
  ['terminal missing', (value) => { value.snapshot.events = value.snapshot.events.filter((event) => !(event.attemptId === 'synthetic-C033-attempt-3' && event.outcome)); }],
  ['timing missing', (value) => { delete value.snapshot.history[2].endedAt; }],
  ['business state changed', (value) => { value.snapshot.history[0].acknowledgements[1].profile.preferences.theme = 'light'; }],
  ['state missing', (value) => { delete value.snapshot.history[0].acknowledgements[1].profile; }],
  ['v2 stamp missing', (value) => { delete value.snapshot.history[0].acknowledgements[1].stamp; }],
  ['unchanged version disguised', (value) => { value.snapshot.history[0].acknowledgements[1].stamp.implementationVersion = '1.0.0'; }],
  ['duplicate acknowledgment', (value) => { value.snapshot.history[0].acknowledgements.push(value.snapshot.history[0].acknowledgements[1]); }],
  ['negative monotonic time', (value) => { value.snapshot.events[0].at = -1; }],
  ['reversed original request order', (value) => {
    const events = value.snapshot.events;
    const index = events.findIndex((event) => event.code === 'ACTUAL_READ_STARTED');
    [events[index], events[index + 1]] = [events[index + 1], events[index]];
  }],
  ['summary replacement verdict', (value) => { value.replacementSummary.verdict = 'PASS'; }],
  ['historical context forged', (value) => { value.context.receipt.state.epoch += 1; }]
];
for (const [name, modify] of modifications) test(`reject ${name}; retain selected original denominator`, () => {
  const value = saved();
  modify(value);
  rejectedCopy(value);
});

test('coherently rewritten positive-only history can be mathematical PASS but cannot acquire historical authority', () => {
  const value = saved();
  const first = value.snapshot.history[0];
  value.snapshot = {
    ...value.snapshot, phase: 'complete', attemptId: first.attemptId, original: first.original,
    startedAt: first.startedAt, deadline: first.deadline, sampledAt: first.endedAt, elapsedMs: first.elapsedMs,
    pausedMs: first.pausedMs, budgetExceeded: false, requests: 2, responses: 2,
    acknowledgements: first.acknowledgements, outcome: first.outcome, code: first.code,
    history: [first], events: value.snapshot.events.filter((event) => event.attemptId === first.attemptId)
  };
  const oracle = evaluator.evaluateSnapshot(value.snapshot);
  assert.equal(oracle.valid, true);
  assert.equal(oracle.decision, 'PASS');
  assert.equal(oracle.sourceConsistentHistorical, false);
  assert.equal(oracle.eligibleForLiveRun, false);
  const rejection = rejectedCopy(value);
  assert.equal(rejection.code, 'NOT_EXACT_SAVED_OBSERVATION');
});

const invalidJson = [
  ['empty', ''], ['malformed', '{'], ['duplicate', '{"id":"x","id":"y"}'],
  ['escaped duplicate', '{"id":"x","\\u0069d":"y"}'], ['negative zero', '{"x":-0}'],
  ['overflow', '{"x":1e400}'], ['unsafe integer', '{"x":9007199254740993}'],
  ['lossy decimal', '{"x":0.1000000000000000000001}'],
  ['forbidden prototype key', '{"__proto__":{"eligible":true}}'],
  ['too deep', '['.repeat(20) + '0' + ']'.repeat(20)],
  ['oversize', '"' + 'a'.repeat(evaluator.MAX_BYTES) + '"']
];
for (const [name, text] of invalidJson) test(`reject ${name} JSON with UNKNOWN/HOLD and retained originals`, () => {
  const report = evaluator.evaluateCandidate(text, 'closed-history');
  assert.equal(report.valid, false);
  assert.equal(report.decision, 'HOLD');
  assert.equal(report.counts.originals, 7);
  assert.equal(report.counts.unknown, 7);
});

for (const [name, make] of [
  ['accessor', (value) => { Object.defineProperty(value, 'sampledAt', { enumerable: true, get() { throw new Error('getter executed'); } }); return value; }],
  ['inherited', (value) => Object.assign(Object.create({ eligible: true }), value)],
  ['symbol', (value) => { value[Symbol('eligible')] = true; return value; }],
  ['nonenumerable', (value) => { Object.defineProperty(value, 'eligible', { value: true }); return value; }],
  ['NaN', (value) => { value.sampledAt = NaN; return value; }],
  ['Infinity', (value) => { value.sampledAt = Infinity; return value; }],
  ['negative zero', (value) => { value.sampledAt = -0; return value; }],
  ['sparse array', (value) => { delete value.events[0]; return value; }],
  ['array extra property', (value) => { value.events.eligible = true; return value; }],
  ['array inherited property', (value) => { Object.setPrototypeOf(value.events, Object.create(Array.prototype)); return value; }],
  ['cycle', (value) => { value.self = value; return value; }],
  ['unbounded array', (value) => { value.events = Array(2049).fill(0); return value; }]
]) test(`unbound object rejects ${name} without invoking an accessor or accepting authority`, () => {
  const value = make(copy(decoder.getSavedTrace('closed-history').snapshot));
  const report = evaluator.evaluateSnapshot(value);
  assert.equal(report.valid, false);
  assert.equal(report.decision, 'HOLD');
  assert.equal(report.eligibleForLiveRun, false);
  assert.notEqual(report.code, 'EVALUATION_UNAVAILABLE');
});

test('undefined/extra saved, source/hash/verdict arguments cannot become evaluation authority', async () => {
  for (const report of [
    evaluator.evaluateSnapshot({}, { eligible: true }), evaluator.evaluateSaved('closed-history', { hash: 'trusted' }),
    evaluator.evaluateCandidate(evaluator.savedJson('closed-history'), 'closed-history', { verdict: 'PASS' }),
    await evaluator.evaluateControl('control-at', 6000), await evaluator.compareRetry('healthy'),
    evaluator.evaluateModel('model-clean', { durable: true }), evaluator.evaluateSaved('../C033/index.html')
  ]) {
    assert.equal(report.valid, false);
    assert.equal(report.decision, 'HOLD');
    assert.equal(report.eligibleForLiveRun, false);
  }
});

test('C029 model guard rejects excess commands instead of dropping original history', () => {
  let state = ledger.create({ jobId: 'job-c029-bound', workVersion: 'profile-effects/1', profileId: 'synthetic-001', implementation: 'v1' });
  state = ledger.apply(state, { type: 'run', interruption: 'before-commit', effectIndex: 0 });
  for (let index = 1; index < 17; index++) state = ledger.apply(state, { type: 'resume', interruption: 'before-commit', effectIndex: 0 });
  const original = JSON.stringify(state);
  const report = evaluator.evaluateModelSnapshot(state);
  assert.equal(report.valid, false);
  assert.equal(report.code, 'MODEL_HISTORY_LIMIT_RETAINED');
  assert.equal(JSON.stringify(state), original);
});
