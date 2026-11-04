'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fixtures = require('..\\fixtures.js');
const model = require('..\\lesson.js');
const clone = (value) => JSON.parse(JSON.stringify(value));
const fresh = (phase = 'promotion', preset = 'observed') => clone(fixtures.getFixture(phase, preset));

function run(session, phase, preset) {
  for (const command of [
    { type: 'select', phase, preset }, { type: 'conduct' }, { type: 'inspect' }, { type: 'measure' },
  ]) session = model.advance(session, command);
  return session;
}

test('unobserved injection timing remains UNCOVERED even after recovery', () => {
  const trace = fixtures.getFixture('promotion', 'unobserved');
  assert.equal(trace.request.fault, 'TRACE');
  assert.equal(trace.request.phase, 'promotion');
  assert.equal(trace.injection.atMs, null);
  assert.equal(trace.detection.detected, true);
  assert.equal(trace.recovery.recovered, true);
  const measured = model.evaluate(trace);
  assert.equal(measured.coverage, 'UNCOVERED');
  assert.equal(measured.reason, 'injection-time-unknown');
  assert.equal(measured.detected, 'OBSERVED');
  assert.equal(measured.recovery, 'RECOVERED');
  assert.equal(measured.impact, 'UNKNOWN');
  assert.equal(measured.outcome, 'UNCOVERED');
  assert.deepEqual(measured.actualCoveredPhases, []);
  assert.ok(measured.matrix.every((row) => row.coverage === 'UNCOVERED'));
});

for (const phase of fixtures.PHASES) {
  test(`independent observed ${phase} fixture covers only its actual phase`, () => {
    const measured = model.evaluate(fixtures.getFixture(phase, 'observed'));
    assert.equal(measured.requestedPhase, phase);
    assert.equal(measured.coverage, 'COVERED');
    assert.equal(measured.detected, 'OBSERVED');
    assert.equal(measured.recovery, 'RECOVERED');
    assert.equal(measured.impact, 'NO_OBSERVED_INTERRUPTION');
    assert.equal(measured.outcome, 'OBSERVED_NO_INTERRUPTION');
    assert.deepEqual(measured.actualCoveredPhases, [phase]);
    assert.equal(measured.matrix.length, 7);
    assert.equal(measured.matrix.filter((row) => row.coverage === 'UNCOVERED').length, 6);
    assert.ok(measured.matrix.every((row) => row.windowObserved));
  });
}

test('a requested phase or timestamp cannot move a fixed actual warming observation', () => {
  const trace = fresh('warming');
  trace.request.phase = 'serving';
  trace.request.atMs = 3999;
  const measured = model.evaluate(trace);
  assert.equal(trace.injection.atMs, 1100);
  assert.equal(measured.coverage, 'UNCOVERED');
  assert.equal(measured.outcome, 'UNCOVERED');
  assert.deepEqual(measured.actualCoveredPhases, ['warming']);
  assert.equal(measured.matrix.find((row) => row.phase === 'serving').coverage, 'UNCOVERED');
});

test('planned request time is advisory even when an actual time is independently covered', () => {
  const trace = fresh();
  trace.request.atMs = 9999;
  assert.equal(model.evaluate(trace).coverage, 'COVERED');
  trace.injection.atMs = null;
  assert.equal(model.evaluate(trace).coverage, 'UNCOVERED');
});

test('half-open start and end-minus-one are covered; exact end and outside are not', () => {
  for (const atMs of [0, 999]) {
    const trace = fresh('provisioning');
    trace.injection.atMs = atMs;
    assert.equal(model.evaluate(trace).coverage, 'COVERED', `at ${atMs}`);
  }
  for (const atMs of [1000, 1001, 10000]) {
    const trace = fresh('provisioning');
    trace.injection.atMs = atMs;
    assert.equal(model.evaluate(trace).coverage, 'UNCOVERED', `at ${atMs}`);
    assert.equal(model.evaluate(trace).reason, 'outside-half-open-phase-window');
  }
});

test('exclusive end may cover the next actual phase, never the requested prior phase', () => {
  const measured = model.evaluate(fixtures.getFixture('warming', 'boundary-end'));
  assert.equal(measured.coverage, 'UNCOVERED');
  assert.deepEqual(measured.actualCoveredPhases, ['promotion']);
  assert.equal(measured.matrix[1].window[1], measured.matrix[2].window[0]);
  const last = model.evaluate(fixtures.getFixture('cleanup', 'boundary-end'));
  assert.equal(last.coverage, 'UNCOVERED');
  assert.deepEqual(last.actualCoveredPhases, []);
});

test('missing occurrence, observation, timestamp, or actual-phase observation cannot cover a requested label', () => {
  for (const [field, value] of [
    ['occurred', null], ['occurred', false], ['observationId', null], ['atMs', null], ['phase', null],
  ]) {
    const trace = fresh();
    trace.injection[field] = value;
    assert.equal(model.evaluate(trace).coverage, 'UNCOVERED', field);
  }
});

test('unjoined lifecycle clock leaves coverage unknown while detection and recovery remain observed', () => {
  const measured = model.evaluate(fixtures.getFixture('promotion', 'clock-unknown'));
  assert.equal(measured.coverage, 'UNCOVERED');
  assert.equal(measured.reason, 'fault-clock-or-epoch-unaligned');
  assert.equal(measured.detected, 'OBSERVED');
  assert.equal(measured.recovery, 'RECOVERED');
  assert.equal(measured.impact, 'UNKNOWN');
});

test('clock and epoch equality are required independently of a requested phase label', () => {
  for (const [field, value] of [
    ['clockId', null], ['epoch', null], ['epoch', 'fictional-other-epoch'],
    ['clockId', 'fictional-other-clock'],
  ]) {
    const trace = fresh();
    trace.injection[field] = value;
    assert.equal(model.evaluate(trace).coverage, 'UNCOVERED', field);
  }
});

test('a planned or missing window is uncovered, and a gap is not silently interpolated', () => {
  const planned = fresh();
  planned.windows[2].observationId = null;
  assert.equal(model.evaluate(planned).coverage, 'UNCOVERED');
  const missing = model.evaluate(fixtures.getFixture('promotion', 'window-unknown'));
  assert.equal(missing.coverage, 'UNCOVERED');
  assert.equal(missing.matrix[2].windowObserved, false);
  assert.deepEqual(missing.matrix[2].window, [null, null]);
  const gap = fresh('serving');
  gap.windows[3].startMs = 3110;
  assert.equal(model.evaluate(gap).reason, 'outside-half-open-phase-window');
});

test('wrong request, resource, version, or window scope cannot join actual injection evidence', () => {
  for (const [field, value] of [
    ['requestId', 'REQ.other'], ['resourceId', 'fictional-other-workflow'],
    ['resourceId', null], ['version', 'fictional-other-version'], ['version', null],
  ]) {
    const trace = fresh();
    trace.injection[field] = value;
    assert.equal(model.evaluate(trace).coverage, 'UNCOVERED', field);
  }
  for (const field of ['resourceId', 'version', 'clockId', 'epoch']) {
    const trace = fresh();
    trace.windows[2][field] = null;
    assert.equal(model.evaluate(trace).coverage, 'UNCOVERED', `window ${field}`);
  }
});

test('an actual phase label inconsistent with its observed timestamp does not establish coverage', () => {
  const trace = fresh('warming');
  trace.injection.phase = 'promotion';
  const measured = model.evaluate(trace);
  assert.deepEqual(measured.actualCoveredPhases, []);
  assert.equal(measured.coverage, 'UNCOVERED');
});

test('a request-only negative trace never becomes coverage because its fault did not occur', () => {
  const measured = model.evaluate(fixtures.getFixture('draining', 'not-injected'));
  assert.equal(measured.coverage, 'UNCOVERED');
  assert.equal(measured.reason, 'observed-fault-did-not-occur');
  assert.equal(measured.detected, 'NOT_DETECTED');
  assert.equal(measured.recovery, 'UNKNOWN');
  assert.equal(measured.outcome, 'UNCOVERED');
});

test('fault handling is measured separately from phase coverage and user samples', () => {
  const trace = fresh();
  trace.detection.detected = false;
  const missed = model.evaluate(trace);
  assert.equal(missed.coverage, 'COVERED');
  assert.equal(missed.detected, 'NOT_DETECTED');
  assert.equal(missed.outcome, 'FAULT_HANDLING_FAILED');
  const failed = model.evaluate(fixtures.getFixture('rollback', 'recovery-failed'));
  assert.equal(failed.coverage, 'COVERED');
  assert.equal(failed.recovery, 'FAILED');
  assert.equal(failed.impact, 'INTERRUPTED');
});

test('known true detection or recovery labels without observed evidence stay UNKNOWN', () => {
  for (const event of ['detection', 'recovery']) {
    for (const field of ['observationId', 'atMs', 'clockId', 'epoch', 'requestId', 'resourceId', 'version']) {
      const trace = fresh();
      trace[event][field] = null;
      const measured = model.evaluate(trace);
      assert.equal(measured[event === 'detection' ? 'detected' : 'recovery'], 'UNKNOWN', `${event}.${field}`);
      assert.notEqual(measured.outcome, 'OBSERVED_NO_INTERRUPTION');
    }
  }
});

test('positive detection and recovery cannot claim observed chronology before the actual fault', () => {
  const earlyDetection = fresh();
  earlyDetection.detection.atMs = 2099;
  assert.equal(model.evaluate(earlyDetection).detected, 'UNKNOWN');
  const earlyRecovery = fresh();
  earlyRecovery.recovery.atMs = 2099;
  assert.equal(model.evaluate(earlyRecovery).recovery, 'UNKNOWN');
  const foreignRecovery = fresh();
  foreignRecovery.recovery.clockId = 'fictional-unjoined-ms';
  assert.equal(model.evaluate(foreignRecovery).recovery, 'UNKNOWN');
});

test('an interrupted during-fault sample remains interrupted after observed recovery', () => {
  const measured = model.evaluate(fixtures.getFixture('promotion', 'interrupted'));
  assert.equal(measured.coverage, 'COVERED');
  assert.equal(measured.recovery, 'RECOVERED');
  assert.equal(measured.journeys[2].impact, 'NO_OBSERVED_INTERRUPTION');
  assert.equal(measured.impact, 'INTERRUPTED');
  assert.equal(measured.outcome, 'INTERRUPTED');
});

test('an unobserved during-fault journey remains UNKNOWN after observed recovery', () => {
  const measured = model.evaluate(fixtures.getFixture('serving', 'journey-unknown'));
  assert.equal(measured.coverage, 'COVERED');
  assert.equal(measured.recovery, 'RECOVERED');
  assert.equal(measured.impact, 'UNKNOWN');
  assert.equal(measured.outcome, 'UNKNOWN');
});

test('before/during/after labels do not establish actual continuous sample placement', () => {
  for (const [index, time] of [[0, 2100], [1, 2121], [2, 2119]]) {
    const trace = fresh();
    trace.journeys[index].atMs = time;
    assert.equal(model.evaluate(trace).journeys[index].impact, 'UNKNOWN', `journey ${index}`);
    assert.equal(model.evaluate(trace).impact, 'UNKNOWN');
  }
  const knownInterruption = fresh('promotion', 'interrupted');
  knownInterruption.journeys[1].atMs = 9999;
  knownInterruption.journeys[2].observationId = null;
  assert.equal(model.evaluate(knownInterruption).impact, 'INTERRUPTED');
});

test('unobserved or wrong-scope interruption labels are unknown rather than fabricated evidence', () => {
  for (const [field, value] of [['observationId', null], ['resourceId', 'fictional-other-workflow']]) {
    const trace = fresh('promotion', 'interrupted');
    trace.journeys[1][field] = value;
    assert.equal(model.evaluate(trace).impact, 'UNKNOWN');
  }
});

test('strict trace types reject coercion, unsupported schemas, malformed windows and extra fields', () => {
  const variants = [
    (trace) => { trace.schemaVersion = '1'; },
    (trace) => { trace.dataKind = 'live'; },
    (trace) => { trace.request.phase = 'warm'; },
    (trace) => { trace.request.atMs = '2100'; },
    (trace) => { trace.request.fault = 'NETWORK'; },
    (trace) => { trace.injection.atMs = NaN; },
    (trace) => { trace.injection.atMs = Infinity; },
    (trace) => { trace.injection.atMs = -1; },
    (trace) => { trace.injection.atMs = 10001; },
    (trace) => { trace.injection.atMs = 2100.5; },
    (trace) => { trace.injection.occurred = 'true'; },
    (trace) => { trace.detection.detected = 1; },
    (trace) => { trace.recovery.recovered = 'false'; },
    (trace) => { trace.injection.resourceId = ''; },
    (trace) => { trace.injection.observationId = 'OBS.\nforged'; },
    (trace) => { trace.windows[2].startMs = null; },
    (trace) => { trace.windows[2].endMs = 2000; },
    (trace) => { trace.windows[2].startMs = 1999; },
    (trace) => { trace.windows.reverse(); },
    (trace) => { trace.windows.pop(); },
    (trace) => { delete trace.windows[2]; },
    (trace) => { trace.windows.extra = true; },
    (trace) => { trace.journeys[1].result = 'success'; },
    (trace) => { trace.journeys[1].window = 'after'; },
    (trace) => { trace.journeys[1].id = trace.journeys[0].id; },
    (trace) => { trace.detection.observationId = trace.injection.observationId; },
    (trace) => { trace.covered = true; },
    (trace) => { trace.injection.phaseProof = true; },
    (trace) => { Object.setPrototypeOf(trace, { covered: true }); },
  ];
  variants.forEach((mutate, index) => {
    const trace = fresh();
    mutate(trace);
    assert.throws(() => model.evaluate(trace), TypeError, `variant ${index}`);
  });
});

test('accessors and symbol or sparse list entries are rejected without executing getters', () => {
  let invoked = false;
  const trace = fresh();
  Object.defineProperty(trace.injection, 'atMs', { enumerable: true, get() { invoked = true; return 2100; } });
  assert.throws(() => model.evaluate(trace), TypeError);
  const command = { phase: 'promotion', preset: 'observed' };
  Object.defineProperty(command, 'type', { enumerable: true, get() { invoked = true; return 'select'; } });
  assert.throws(() => model.advance(model.createSession(), command), TypeError);
  const events = [];
  Object.defineProperty(events, '0', { enumerable: true, get() { invoked = true; return { type: 'measure' }; } });
  assert.throws(() => model.replay({ schemaVersion: 1, events }), TypeError);
  const symbolic = fresh();
  symbolic.windows[Symbol('extra')] = true;
  assert.throws(() => model.evaluate(symbolic), TypeError);
  assert.equal(invoked, false);
});

test('all seventy fixtures are bounded, deterministic, loadable and deeply immutable', () => {
  const identities = new Set();
  for (const phase of fixtures.PHASES) {
    for (const { id } of fixtures.PRESETS) {
      const trace = fixtures.getFixture(phase, id);
      const before = JSON.stringify(trace);
      const measured = model.evaluate(trace);
      identities.add(trace.fixtureId);
      assert.equal(JSON.stringify(trace), before);
      assert.deepEqual(measured, model.evaluate(fixtures.getFixture(phase, id)));
      assert.ok(Object.isFrozen(trace.injection));
      assert.ok(Object.isFrozen(measured.matrix[0]));
    }
  }
  assert.equal(identities.size, 70);
  assert.throws(() => { fixtures.getFixture('promotion', 'observed').injection.atMs = 0; }, TypeError);
  assert.throws(() => fixtures.getFixture('promotion', 'unknown-preset'), TypeError);
});

test('select/conduct/inspect/measure replays exact fixed trace evidence rather than supplied results', () => {
  const start = model.createSession();
  const session = run(start, 'promotion', 'unobserved');
  const view = model.replay(session);
  assert.equal(start.events.length, 0);
  assert.equal(view.stage, 'measured');
  assert.equal(view.history.length, 1);
  assert.equal(view.history[0].runId, 'R01');
  assert.deepEqual(view.result, model.evaluate(fixtures.getFixture('promotion', 'unobserved')));
  assert.throws(() => { session.events[0].phase = 'serving'; }, TypeError);
  assert.throws(() => { view.history[0].result.coverage = 'COVERED'; }, TypeError);
});

test('out-of-order, duplicate, typed or result-bearing commands are rejected transactionally', () => {
  const idle = model.createSession();
  for (const command of [
    { type: 'conduct' }, { type: 'inspect' }, { type: 'measure' }, { type: 'discard' },
    { type: true }, { type: 'select', phase: 'promotion', preset: 'observed', result: 'COVERED' },
    { type: 'select', phase: 'promotion', preset: 'observed', measured: true },
    { type: 'select', phase: 2, preset: 'observed' },
  ]) assert.throws(() => model.advance(idle, command), TypeError);
  const selected = model.advance(idle, { type: 'select', phase: 'promotion', preset: 'observed' });
  assert.throws(() => model.advance(selected, { type: 'measure' }), TypeError);
  const conducted = model.advance(selected, { type: 'conduct' });
  assert.throws(() => model.advance(conducted, { type: 'conduct' }), TypeError);
  const measured = run(idle, 'promotion', 'observed');
  assert.throws(() => model.advance(measured, { type: 'measure' }), TypeError);
  assert.equal(model.replay(measured).history.length, 1);
});

test('forged derived fields and reordered replay events cannot manufacture coverage or erase failures', () => {
  const original = run(model.createSession(), 'promotion', 'interrupted');
  const derived = clone(original);
  derived.history = [{ coverage: 'COVERED', impact: 'NO_OBSERVED_INTERRUPTION' }];
  assert.throws(() => model.replay(derived), TypeError);
  const forged = clone(original);
  forged.events[1] = { type: 'measure' };
  assert.throws(() => model.replay(forged), TypeError);
  const numericSchema = clone(original);
  numericSchema.schemaVersion = '1';
  assert.throws(() => model.replay(numericSchema), TypeError);
  assert.equal(model.replay(original).history[0].result.impact, 'INTERRUPTED');
});

test('changing selection discards current work but retains interruption and unknown after recovery', () => {
  let session = run(model.createSession(), 'promotion', 'interrupted');
  session = run(session, 'serving', 'journey-unknown');
  session = run(session, 'promotion', 'unobserved');
  session = model.advance(session, { type: 'select', phase: 'cleanup', preset: 'observed' });
  session = model.advance(session, { type: 'conduct' });
  session = model.advance(session, { type: 'discard' });
  assert.equal(model.replay(session).stage, 'idle');
  assert.equal(model.replay(session).history.length, 3);
  session = run(session, 'cleanup', 'observed');
  const view = model.replay(session);
  assert.deepEqual(view.history.map((row) => row.result.outcome), ['INTERRUPTED', 'UNKNOWN', 'UNCOVERED', 'OBSERVED_NO_INTERRUPTION']);
  assert.equal(view.summary.interruptedRuns, 1);
  assert.equal(view.summary.unknownImpactRuns, 2);
  assert.equal(view.summary.uncoveredRuns, 1);
  assert.equal(view.summary.retainedOutcome, 'INTERRUPTED');
});

test('seven separately observed fixtures cover the matrix, not a single requested label', () => {
  let session = model.createSession();
  for (const phase of fixtures.PHASES) session = run(session, phase, 'observed');
  const summary = model.replay(session).summary;
  assert.deepEqual(summary.coveredPhases, fixtures.PHASES);
  assert.deepEqual(summary.uncoveredPhases, []);
  assert.equal(summary.totalRuns, 7);
  assert.equal(summary.uniqueFixtures, 7);
});

test('twelve-run bound retains history and repeated fixtures are not independent trials', () => {
  let session = model.createSession();
  for (let index = 0; index < model.MAX_RUNS; index += 1) session = run(session, 'promotion', 'observed');
  const before = JSON.stringify(session);
  assert.equal(model.replay(session).summary.totalRuns, 12);
  assert.equal(model.replay(session).summary.uniqueFixtures, 1);
  assert.throws(() => model.advance(session, { type: 'select', phase: 'cleanup', preset: 'observed' }), /twelve-run/);
  assert.equal(JSON.stringify(session), before);
  assert.equal(model.replay(model.createSession()).history.length, 0);
});

test('eighty-four-event bound is exact and cannot be bypassed with extra or sparse entries', () => {
  let session = model.createSession();
  for (let index = 0; index < model.MAX_EVENTS / 2; index += 1) {
    session = model.advance(session, { type: 'select', phase: 'promotion', preset: 'observed' });
    session = model.advance(session, { type: 'discard' });
  }
  assert.equal(model.replay(session).eventCount, 84);
  assert.throws(() => model.advance(session, { type: 'select', phase: 'cleanup', preset: 'observed' }), /eighty-four-event/);
  assert.throws(() => model.replay({ schemaVersion: 1, events: [...session.events, { type: 'select', phase: 'cleanup', preset: 'observed' }] }), TypeError);
  assert.throws(() => model.replay({ schemaVersion: 1, events: Array(1) }), TypeError);
});
