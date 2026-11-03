'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../model.js');

const step = (state, type, fields = {}) => model.apply(state, { type, ...fields });
const ready = () => step(step(model.start(), 'check-green', { condition: 'compatible' }), 'switch-new');
const find = (state, id) => state.sessions.find((session) => session.id === id);
function drained() {
  let state = ready();
  for (const type of ['finish-old', 'reconnect-pinned', 'finish-work']) state = step(state, type);
  return state;
}
function data(state) {
  return {
    clock: state.clock, nominalGreenPercent: state.nominalGreenPercent,
    newSessionTarget: state.newSessionTarget, blue: state.blue, green: state.green,
    sessions: state.sessions, work: state.work, requests: state.requests, damage: state.damage,
    cutoverAt: state.cutoverAt, retentionUntil: state.retentionUntil, retirement: state.retirement
  };
}

test('baseline is an explicit synthetic fixture, not invented request history', () => {
  const state = model.start();
  assert.equal(state.mode, 'synthetic');
  assert.equal(state.nativeProof, false);
  assert.equal(find(state, 'old-journey').status, 'active');
  assert.equal(find(state, 'old-pinned').pinned, true);
  assert.equal(state.work.status, 'pending');
  assert.deepEqual(state.requests, []);
  assert.deepEqual(state.events, []);
});

test('unready green blocks the new-session boundary', () => {
  const state = step(model.start(), 'switch-new');
  assert.equal(state.lastOutcome.code, 'blocked');
  assert.equal(state.newSessionTarget, 'blue');
  assert.equal(state.requests.length, 0);
});

for (const condition of ['cold', 'incompatible']) {
  test(`${condition} green cannot become the new-session target`, () => {
    const checked = step(model.start(), 'check-green', { condition });
    assert.equal(checked.lastOutcome.code, 'not-ready');
    assert.equal(checked.green.ready, false);
    assert.equal(step(checked, 'switch-new').newSessionTarget, 'blue');
  });
}

test('compatible-state readiness enables but does not itself switch admission', () => {
  const state = step(model.start(), 'check-green', { condition: 'compatible' });
  assert.equal(state.green.ready, true);
  assert.equal(state.newSessionTarget, 'blue');
});

test('nominal 100 percent is not the observed admission boundary', () => {
  let state = step(model.start(), 'check-green', { condition: 'compatible' });
  state = step(state, 'set-weight', { percent: 100 });
  state = step(state, 'admit-new', { sessionId: 'before-boundary' });
  assert.equal(state.nominalGreenPercent, 100);
  assert.deepEqual(state.requests.map((request) => request.version), ['blue']);
  assert.equal(find(state, 'before-boundary').version, 'blue');
  assert.equal(model.summarize(state).counts.greenRequests, 0);
});

test('ready green receives new sessions even when nominal weight remains zero', () => {
  const state = step(ready(), 'admit-new', { sessionId: 'after-boundary' });
  assert.equal(state.nominalGreenPercent, 0);
  assert.equal(state.newSessionTarget, 'green');
  assert.equal(find(state, 'after-boundary')?.version, 'green');
  assert.deepEqual(state.requests.map((request) => [request.operation, request.version, request.stateValid]),
    [['start', 'green', true]]);
});

test('switching admission does not move, replay, or mutate the admitted blue cart', () => {
  const before = model.start();
  const after = step(step(before, 'check-green', { condition: 'compatible' }), 'switch-new');
  assert.deepEqual(find(after, 'old-journey'), find(before, 'old-journey'));
  assert.deepEqual(find(after, 'old-pinned'), find(before, 'old-pinned'));
  assert.equal(after.requests.length, 0);
});

test('observed cohorts include green starts and blue pinned reads and completions', () => {
  let state = step(ready(), 'admit-new', { sessionId: 'new-green-001' });
  state = step(state, 'read-pinned');
  state = step(state, 'finish-old');
  assert.deepEqual(state.requests.map((request) => [request.sessionId, request.version, request.operation]), [
    ['new-green-001', 'green', 'start'],
    ['old-pinned', 'blue', 'read'],
    ['old-journey', 'blue', 'finish']
  ]);
  const { counts } = model.summarize(state);
  assert.equal(counts.blueRequests, 2);
  assert.equal(counts.greenRequests, 1);
  assert.equal(counts.failedRequests, 0);
});

test('admitted blue journey finishes once with its original subject and cart', () => {
  const before = ready();
  const state = step(before, 'finish-old');
  const session = find(state, 'old-journey');
  assert.deepEqual(session.state.cart, find(before, 'old-journey').state.cart);
  assert.equal(session.state.subject, 'learner-old');
  assert.equal(session.state.schema, 1);
  assert.equal(session.state.revision, 2);
  assert.equal(session.state.receipt, 'receipt-old-journey');
  assert.equal(session.status, 'complete');
  assert.equal(state.requests.at(-1)?.stateValid, true);
  const again = step(state, 'finish-old');
  assert.equal(again.lastOutcome.code, 'blocked');
  assert.equal(again.requests.length, 1);
});

test('idle pinned client blocks retirement after active journey and work finish', () => {
  let state = step(step(ready(), 'finish-old'), 'finish-work');
  state = step(state, 'tick', { minutes: 10 });
  const summary = model.summarize(state);
  assert.equal(summary.counts.activeBlue, 0);
  assert.equal(summary.counts.unresolvedPinned, 1);
  assert.equal(summary.retention.elapsed, true);
  assert.equal(summary.retire.allowed, false);
  assert.match(summary.retire.blockers.join(' '), /pinned/i);
  assert.equal(step(state, 'retire').blue.alive, true);
});

test('pending blue work is a separate retirement blocker', () => {
  let state = step(step(ready(), 'finish-old'), 'reconnect-pinned');
  state = step(state, 'tick', { minutes: 10 });
  const summary = model.summarize(state);
  assert.equal(summary.counts.unresolvedPinned, 0);
  assert.equal(summary.counts.pendingBlueWork, 1);
  assert.match(summary.retire.blockers.join(' '), /work/i);
  assert.equal(step(state, 'retire').blue.alive, true);
});

test('active admitted work blocks retirement even after pinned resolution and retention', () => {
  let state = step(step(ready(), 'reconnect-pinned'), 'finish-work');
  state = step(state, 'tick', { minutes: 10 });
  const summary = model.summarize(state);
  assert.equal(summary.counts.activeBlue, 1);
  assert.match(summary.retire.blockers.join(' '), /journey/i);
  assert.equal(step(state, 'retire').lastOutcome.code, 'blocked');
});

test('elapsed retention does not fabricate a completed drain', () => {
  const state = step(ready(), 'tick', { minutes: 10 });
  const summary = model.summarize(state);
  assert.equal(summary.retention.elapsed, true);
  assert.equal(summary.drain.complete, false);
  assert.equal(summary.drain.blockers.length, 3);
  assert.equal(step(state, 'retire').blue.alive, true);
});

test('completed drain cannot bypass rollback retention', () => {
  const state = drained();
  const summary = model.summarize(state);
  assert.equal(summary.drain.complete, true);
  assert.equal(summary.retention.elapsed, false);
  assert.equal(summary.retention.remaining, 10);
  assert.deepEqual(summary.retire.blockers, ['Rollback retention has 10 synthetic minutes remaining.']);
  assert.equal(step(state, 'retire').lastOutcome.code, 'blocked');
  assert.equal(state.blue.alive, true);
});

test('guarded retirement succeeds only after drain and retention, while green stays usable', () => {
  let state = step(step(drained(), 'tick', { minutes: 10 }), 'retire');
  assert.equal(state.blue.alive, false);
  assert.equal(state.green.alive, true);
  assert.equal(state.retirement, 'guarded');
  assert.deepEqual(state.damage, { interruptedSessions: [], lostWork: [] });
  assert.match(model.summarize(state).verdict, /^PASS/);
  state = step(state, 'admit-new', { sessionId: 'after-retirement' });
  assert.equal(state.requests.at(-1)?.version, 'green');
  assert.equal(state.requests.at(-1)?.stateValid, true);
});

test('pinned reconnect closes the old binding and preserves state at a new boundary', () => {
  const before = ready();
  const state = step(before, 'reconnect-pinned');
  assert.equal(find(state, 'old-pinned').status, 'closed');
  assert.equal(find(state, 'old-pinned').pinned, false);
  const reconnected = find(state, 'reconnected-pinned');
  assert.equal(reconnected?.version, 'green');
  assert.deepEqual(reconnected?.state, find(before, 'old-pinned').state);
  assert.deepEqual(state.requests.map((request) => [request.operation, request.version]), [['reconnect', 'green']]);
});

test('blue work effect is completed once, not counted as an HTTP request', () => {
  let state = step(ready(), 'finish-work');
  assert.equal(state.work.effects, 1);
  assert.equal(state.work.output, 'effect-old-work');
  assert.equal(state.work.status, 'complete');
  assert.equal(state.requests.length, 0);
  state = step(state, 'finish-work');
  assert.equal(state.lastOutcome.code, 'blocked');
  assert.equal(state.work.effects, 1);
});

test('rollback changes new admission but preserves admitted green sessions', () => {
  let state = step(ready(), 'admit-new', { sessionId: 'new-green-001' });
  state = step(state, 'rollback');
  assert.equal(state.newSessionTarget, 'blue');
  assert.equal(state.blue.alive, true);
  assert.equal(state.green.alive, true);
  assert.equal(find(state, 'new-green-001')?.version, 'green');
  state = step(state, 'admit-new', { sessionId: 'after-rollback' });
  state = step(state, 'finish-session', { sessionId: 'new-green-001' });
  assert.deepEqual(state.requests.map((request) => [request.version, request.operation]), [
    ['green', 'start'], ['blue', 'start'], ['green', 'finish']
  ]);
  assert.equal(find(state, 'new-green-001')?.state.receipt, 'receipt-new-green-001');
});

test('rollback after the declared retention window is rejected, not promised', () => {
  const state = step(step(ready(), 'tick', { minutes: 10 }), 'rollback');
  assert.equal(state.lastOutcome.code, 'blocked');
  assert.equal(state.newSessionTarget, 'green');
});

test('restarting cutover after rollback establishes a fresh retention deadline', () => {
  let state = step(step(ready(), 'tick', { minutes: 4 }), 'rollback');
  state = step(state, 'switch-new');
  assert.equal(state.cutoverAt, 4);
  assert.equal(state.retentionUntil, 14);
});

test('deliberately forced retirement records interruption and lost work, never safety success', () => {
  const state = step(ready(), 'force-retire');
  assert.equal(state.blue.alive, false);
  assert.equal(state.retirement, 'forced');
  assert.deepEqual(state.damage.interruptedSessions, ['old-journey', 'old-pinned']);
  assert.deepEqual(state.damage.lostWork, ['old-work']);
  assert.equal(state.work.effects, 0);
  assert.equal(state.work.status, 'lost');
  assert.match(model.summarize(state).verdict, /^FAIL/);
  assert.match(model.summarize(state).impact, /interrupted/i);
  assert.doesNotMatch(model.summarize(state).impact, /uninterrupted/i);
});

test('a pinned request after forced retirement is actual modeled failure evidence', () => {
  const state = step(step(ready(), 'force-retire'), 'read-pinned');
  assert.deepEqual(state.requests.map((request) => [request.version, request.status, request.stateValid]),
    [['blue', 'unavailable', false]]);
  assert.equal(model.summarize(state).counts.failedRequests, 1);
  assert.match(model.summarize(state).verdict, /^FAIL/);
});

test('early nominal-weight or guard observations are not a completed migration claim', () => {
  assert.match(model.summarize(model.start()).verdict, /^PENDING/);
  assert.match(model.summarize(step(ready(), 'retire')).verdict, /^PENDING/);
});

test('readiness degradation blocks new green admissions without moving blue journeys', () => {
  let state = step(ready(), 'check-green', { condition: 'incompatible' });
  state = step(state, 'admit-new', { sessionId: 'must-not-start' });
  assert.equal(state.lastOutcome.code, 'blocked');
  assert.equal(find(state, 'must-not-start'), undefined);
  assert.equal(find(state, 'old-journey').version, 'blue');
  assert.equal(state.requests.length, 0);
});

const invalidCommands = [
  null, {}, { type: 'unknown' },
  { type: 'set-weight', percent: NaN }, { type: 'set-weight', percent: Infinity },
  { type: 'set-weight', percent: 50.5 }, { type: 'set-weight', percent: -1 },
  { type: 'set-weight', percent: 101 }, { type: 'set-weight', percent: '100' },
  { type: 'tick', minutes: -1 }, { type: 'tick', minutes: NaN },
  { type: 'tick', minutes: 0.5 }, { type: 'tick', minutes: 121 },
  { type: 'admit-new', sessionId: '<img>' }, { type: 'admit-new', sessionId: '' },
  { type: 'admit-new', sessionId: 'old-journey' },
  { type: 'check-green', condition: 'maybe' }
];
for (let index = 0; index < invalidCommands.length; index += 1) {
  test(`invalid command ${index + 1} is rejected without changing domain data`, () => {
    const before = ready();
    const state = model.apply(before, invalidCommands[index]);
    assert.equal(state.lastOutcome.code, 'invalid-input');
    assert.equal(state.lastOutcome.ok, false);
    assert.deepEqual(data(state), data(before));
  });
}

test('unknown session finish and reserved reconnect identity cannot fabricate work', () => {
  const before = ready();
  const unknown = step(before, 'finish-session', { sessionId: 'missing' });
  assert.equal(unknown.lastOutcome.code, 'invalid-input');
  assert.deepEqual(data(unknown), data(before));
  const reserved = step(before, 'admit-new', { sessionId: 'reconnected-pinned' });
  assert.equal(reserved.lastOutcome.code, 'invalid-input');
});

test('state schema corruption fails closed instead of reporting a passing rehearsal', () => {
  const state = ready();
  find(state, 'old-journey').state.schema = 99;
  assert.throws(() => step(state, 'finish-old'), /invalid rehearsal state/i);
  assert.throws(() => model.summarize(state), /invalid rehearsal state/i);
});

test('transitions do not mutate a previous observation snapshot', () => {
  const before = ready();
  const copy = JSON.stringify(before);
  step(before, 'finish-old');
  assert.equal(JSON.stringify(before), copy);
});

test('finish observations preserve distinct before/after state evidence', () => {
  const state = step(ready(), 'finish-old');
  assert.equal(state.requests[0].before.revision, 1);
  assert.equal(state.requests[0].before.receipt, null);
  assert.equal(state.requests[0].after.revision, 2);
  assert.equal(state.requests[0].after.receipt, 'receipt-old-journey');
});

test('extra pre-boundary blue admissions must also finish before retirement', () => {
  let state = step(model.start(), 'admit-new', { sessionId: 'extra-blue' });
  state = step(step(state, 'check-green', { condition: 'compatible' }), 'switch-new');
  for (const type of ['finish-old', 'reconnect-pinned', 'finish-work']) state = step(state, type);
  state = step(state, 'tick', { minutes: 10 });
  assert.equal(model.summarize(state).counts.activeBlue, 1);
  assert.equal(step(state, 'retire').lastOutcome.code, 'blocked');
  state = step(state, 'finish-session', { sessionId: 'extra-blue' });
  assert.equal(model.summarize(state).retire.allowed, true);
});

test('a repeated switch does not extend rollback retention', () => {
  const before = step(ready(), 'tick', { minutes: 3 });
  const state = step(before, 'switch-new');
  assert.equal(state.lastOutcome.code, 'blocked');
  assert.equal(state.retentionUntil, 10);
  assert.equal(state.clock, 3);
});

test('reconnect before a green boundary is rejected without closing the old pin', () => {
  const state = step(model.start(), 'reconnect-pinned');
  assert.equal(state.lastOutcome.code, 'blocked');
  assert.equal(find(state, 'old-pinned').pinned, true);
  assert.equal(state.requests.length, 0);
});

test('unsafe retention-only bypass reports actual zero interruption but still fails the gate', () => {
  const state = step(drained(), 'force-retire');
  assert.equal(state.retirement, 'forced');
  assert.deepEqual(state.damage, { interruptedSessions: [], lostWork: [] });
  assert.match(model.summarize(state).impact, /0 interrupted/);
  assert.match(model.summarize(state).verdict, /^FAIL/);
});

test('unsafe retirement and failed requests never manufacture duplicate loss or work effects', () => {
  let state = step(ready(), 'force-retire');
  state = step(state, 'force-retire');
  state = step(state, 'finish-work');
  state = step(state, 'reconnect-pinned');
  state = step(state, 'read-pinned');
  state = step(state, 'read-pinned');
  assert.equal(state.damage.interruptedSessions.length, 2);
  assert.equal(state.damage.lostWork.length, 1);
  assert.equal(state.work.effects, 0);
  assert.equal(state.requests.length, 2);
  assert.equal(model.summarize(state).counts.failedRequests, 2);
});

test('session capacity rejects admissions rather than truncating observations', () => {
  let state = ready();
  for (let index = 0; index < 28; index += 1) state = step(state, 'admit-new', { sessionId: `bounded-${index}` });
  const next = step(state, 'admit-new', { sessionId: 'over-capacity' });
  assert.equal(next.lastOutcome.code, 'blocked');
  assert.equal(next.sessions.length, 30);
  assert.deepEqual(next.requests, state.requests);
});

test('request capacity rejects new dispatches rather than dropping prior rows', () => {
  let state = ready();
  for (let index = 0; index < 120; index += 1) state = step(state, 'read-pinned');
  const next = step(state, 'read-pinned');
  assert.equal(next.lastOutcome.code, 'blocked');
  assert.deepEqual(next.requests, state.requests);
  assert.equal(model.summarize(next).counts.blueRequests, 120);
});

test('trace capacity explicitly stops new actions without inventing time or history', () => {
  let state = model.start();
  for (let index = 0; index < 200; index += 1) state = step(state, 'set-weight', { percent: 0 });
  const next = step(state, 'tick', { minutes: 10 });
  assert.equal(next.lastOutcome.code, 'limit');
  assert.equal(next.clock, 0);
  assert.deepEqual(next.events, state.events);
});

test('a fixture cannot be silently rebound to the wrong service by invalid data', () => {
  const state = ready();
  find(state, 'old-journey').version = 'green';
  assert.throws(() => model.summarize(state), /invalid rehearsal state/i);
});

test('request snapshots with mismatched subjects fail closed', () => {
  const state = step(ready(), 'finish-old');
  state.requests[0].before.subject = 'another-subject';
  assert.throws(() => model.summarize(state), /invalid rehearsal state/i);
});

test('invalid fixture closure cannot hide an unfinished admitted journey', () => {
  const state = ready();
  find(state, 'old-journey').status = 'closed';
  assert.throws(() => model.summarize(state), /invalid rehearsal state/i);
});

test('a finish snapshot without a state transition is invalid completion evidence', () => {
  const state = step(ready(), 'finish-old');
  state.requests[0].before = { ...state.requests[0].after };
  assert.throws(() => model.summarize(state), /invalid rehearsal state/i);
});
