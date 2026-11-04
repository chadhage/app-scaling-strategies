'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLesson, fixture, verifyEvidence, FIXTURE_IDS, GUARDS, LIMITS } = require('..\\model.js');

function issue(lesson, type, value = null) {
  const state = lesson.snapshot();
  return lesson.dispatch({ type, revision: state.revision, runId: state.current?.id ?? null, value });
}
function begun(id = 'outstanding') {
  const lesson = createLesson();
  issue(lesson, 'begin', id);
  return lesson;
}
function unchanged(lesson, operation, code) {
  const before = lesson.snapshot();
  assert.throws(operation, { code });
  assert.deepEqual(lesson.snapshot(), before);
}

test('100 percent v2 routing must not permit retirement with required v1 dependencies', () => {
  const lesson = createLesson();
  const begun = lesson.dispatch({ type: 'begin', revision: 0, runId: null, value: 'outstanding' });
  const checked = lesson.dispatch({
    type: 'verify', revision: begun.revision, runId: begun.current.id, value: null,
  });
  assert.equal(checked.current.latest.decision, 'REJECTED');
});

test('the complete required deletion gate has separate inventory, control, user-impact and cleanup shapes', () => {
  const lesson = begun();
  const state = issue(lesson, 'verify');
  const result = state.current.latest;
  assert.equal(result.inventoryVerifier.status, 'FAIL');
  assert.equal(result.controlVerifier.status, 'PASS');
  assert.equal(result.userImpact.classification, 'INTERRUPTED_TRANSITION');
  assert.equal(result.userImpact.originalJourneyId, 'journey-order-17');
  assert.equal(result.userImpact.originalBudgetMs, 2500);
  assert.equal(result.userImpact.elapsedMs, 2601);
  assert.equal(result.cleanupOutcome, 'HELD_WITH_REQUIRED_DEPENDENCIES');
  assert.equal(state.current.oldCapacity, 'RETAINED_IN_TEACHING_DATA');
  assert.deepEqual(result.guards.map((guard) => [guard.id, guard.dependencyId]),
    GUARDS.map((guard) => [guard.id, guard.dependencyId]));
  assert.equal(result.remainingResourceStatus.length, 6);
  assert.equal(result.remainingResourceStatus.filter((row) => row.count === 1).length, 5);
  for (const flag of ['deletionPerformed', 'migrationCertified']) assert.equal(result[flag], false);
  assert.equal(result.retirementDataOnly, true);
  assert.equal(state.totals.attempts, 1);
  assert.equal(state.totals.interruptedJourneys, 1);
});

const cases = [
  ['routing-remains', 'routing-exhaustion', 'routing-v1'],
  ['session-remains', 'session-handoff', 'session-v1'],
  ['job-remains', 'work-drain', 'job-v1'],
  ['artifact-remains', 'asset-contracts', 'artifact-v1'],
  ['lease-remains', 'ownership-release', 'lease-v1'],
  ['retention-open', 'rollback-retention', 'retained-capacity-v1'],
  ['drain-unproven', 'declared-drain', 'declared-drain-proof'],
  ['contract-unproven', 'declared-contracts', 'declared-contract-proof'],
  ['readiness-stale', 'candidate-readiness', 'candidate-v2'],
  ['duplicate-effect', 'effect-correctness', 'effect-order-17'],
];
for (const [id, guardId, dependencyId] of cases) {
  test(`${id}: exact required ${guardId}/${dependencyId} prevents deletion`, () => {
    const lesson = begun(id);
    const result = issue(lesson, 'verify').current.latest;
    assert.equal(result.decision, 'REJECTED');
    const guard = result.guards.find((item) => item.id === guardId);
    assert.equal(guard.dependencyId, dependencyId);
    assert.equal(guard.status, 'BLOCKED');
    const checked = issue(lesson, 'check', { guardId, dependencyId, decision: 'REJECTED' });
    assert.equal(checked.current.latest.learnerCheck.status, 'PASS');
    assert.equal(checked.current.latest.decision, 'REJECTED');
    assert.equal(checked.current.latest.migrationCertified, false);
    assert.equal(checked.current.latest.deletionPerformed, false);
  });
}

test('unknown required observations hold; known blockers dominate but do not hide unknowns', () => {
  const unknown = verifyEvidence(fixture('unobserved'));
  assert.equal(unknown.decision, 'HELD_UNVERIFIED');
  assert.equal(unknown.inventoryVerifier.status, 'UNKNOWN');
  assert.equal(unknown.guards.every((guard) => guard.status === 'UNKNOWN'), true);
  assert.equal(unknown.userImpact.classification, 'UNVERIFIED');
  const mixed = verifyEvidence(fixture('mixed-unknown'));
  assert.equal(mixed.decision, 'REJECTED');
  assert.ok(mixed.blocked.includes('work-drain'));
  assert.ok(mixed.unknown.includes('asset-contracts'));
  const zeroButUnobserved = fixture('clear');
  zeroButUnobserved.inventory[1].observed = false;
  assert.equal(verifyEvidence(zeroButUnobserved).decision, 'HELD_UNVERIFIED');
  const missingWindow = fixture('clear');
  missingWindow.rollback.clockObserved = false;
  assert.equal(verifyEvidence(missingWindow).decision, 'HELD_UNVERIFIED');
  const missingTiming = fixture('clear');
  missingTiming.journey.elapsedMs = null;
  assert.equal(verifyEvidence(missingTiming).decision, 'HELD_UNVERIFIED');
});

test('a known blocked guard retains its own missing facts and promised rollback availability', () => {
  const evidence = fixture('clear');
  Object.assign(evidence.inventory[3], { observed: false, count: null });
  evidence.proofs.assets = false;
  const result = verifyEvidence(evidence);
  assert.equal(result.decision, 'REJECTED');
  assert.ok(result.blocked.includes('asset-contracts'));
  assert.ok(result.unknown.includes('asset-contracts'));
  assert.equal(result.guards.find((guard) => guard.id === 'asset-contracts').hasUnknownRequiredFact, true);
  const rollback = fixture('retention-open');
  rollback.rollback.readyV1 = null;
  const held = verifyEvidence(rollback);
  assert.equal(held.decision, 'REJECTED');
  assert.ok(held.unknown.includes('rollback-retention'));
  rollback.tick = 2;
  rollback.observedAtTick = 2;
  rollback.inventory[5].count = 0;
  assert.equal(verifyEvidence(rollback).decision, 'SIMULATED_RETIRED',
    'An observed ended window has no remaining rollback capacity requirement.');
});

test('a retention deadline and declared proofs cannot be bypassed by empty counts or green requests', () => {
  const evidence = fixture('retention-open');
  evidence.inventory[5].count = 0;
  assert.equal(verifyEvidence(evidence).decision, 'REJECTED');
  evidence.rollback.untilTick = null;
  assert.equal(verifyEvidence(evidence).decision, 'HELD_UNVERIFIED');
  for (const key of ['drain', 'assets', 'leases', 'contracts', 'candidateFresh',
    'candidateCapacity', 'candidateCompatible']) {
    const missing = fixture('clear');
    missing.proofs[key] = null;
    assert.equal(verifyEvidence(missing).decision, 'HELD_UNVERIFIED', key);
  }
  const stale = fixture('clear');
  stale.observedAtTick = 0;
  assert.equal(verifyEvidence(stale).decision, 'REJECTED');
  const oldOnly = fixture('clear');
  oldOnly.journey.finalTiers = { frontend: 'v1', api: 'v1', worker: 'v1' };
  assert.equal(verifyEvidence(oldOnly).decision, 'REJECTED');
  assert.equal(verifyEvidence(oldOnly).userImpact.classification, 'UNVERIFIED');
});

test('only all observed proofs allow simulated retirement; this never performs deletion or native migration', () => {
  const lesson = begun('clear');
  const state = issue(lesson, 'verify');
  const result = state.current.latest;
  assert.equal(result.decision, 'SIMULATED_RETIRED');
  assert.ok(result.guards.every((guard) => guard.status === 'PASS'));
  assert.equal(result.userImpact.classification, 'SYNTHETIC_UNINTERRUPTED_TRANSITION');
  assert.equal(result.userImpact.effectCount, 1);
  assert.equal(result.inventoryVerifier.status, 'PASS');
  assert.equal(result.cleanupOutcome, 'SIMULATED_RETIRED_NO_DELETION');
  assert.equal(state.current.lifecycle, 'SIMULATED_RETIRED');
  const checked = issue(lesson, 'check', {
    guardId: 'no-v1-dependencies', dependencyId: 'all-required-inventory', decision: 'SIMULATED_RETIRED',
  });
  assert.equal(checked.current.latest.learnerCheck.status, 'PASS');
  assert.equal(checked.current.latest.deletionPerformed, false);
  unchanged(lesson, () => issue(lesson, 'verify'), 'ERR_STATE');
  unchanged(lesson, () => issue(lesson, 'record-proofs'), 'ERR_STATE');
  assert.equal(lesson.exportReport().nativeMigrationObserved, false);
});

test('named proof/retention observations preserve the original interrupted journey and earlier failure', () => {
  const lesson = begun();
  issue(lesson, 'verify');
  unchanged(lesson, () => issue(lesson, 'observe-retention-end'), 'ERR_STATE');
  const handoff = issue(lesson, 'record-proofs');
  assert.equal(handoff.current.evidence.journey.id, 'journey-order-17');
  assert.equal(handoff.current.evidence.journey.budgetMs, 2500);
  assert.equal(handoff.current.evidence.journey.elapsedMs, 2701);
  assert.equal(handoff.current.evidence.journey.events[0].status, 'ERROR');
  assert.equal(handoff.current.evidence.journey.events.length, 2);
  const held = issue(lesson, 'verify');
  assert.deepEqual(held.current.latest.blocked, ['rollback-retention']);
  issue(lesson, 'observe-retention-end');
  const final = issue(lesson, 'verify');
  assert.equal(final.current.latest.decision, 'SIMULATED_RETIRED');
  assert.equal(final.current.latest.userImpact.classification, 'INTERRUPTED_TRANSITION');
  assert.deepEqual(final.current.attempts.map((attempt) => attempt.decision),
    ['REJECTED', 'REJECTED', 'SIMULATED_RETIRED']);
  assert.equal(final.current.latest.userImpact.originalBudgetMs, 2500);
  assert.equal(final.totals.attemptedJourneys, 1);
  assert.equal(final.totals.interruptedJourneys, 1);
  const archived = issue(lesson, 'archive');
  assert.equal(archived.current, null);
  assert.equal(archived.history[0].evidence.journey.events[0].status, 'ERROR');
  assert.equal(archived.history[0].attempts[0].userImpact.elapsedMs, 2601);
  issue(lesson, 'begin', 'clear');
  const next = issue(lesson, 'verify');
  assert.equal(next.totals.attemptedJourneys, 2);
  assert.equal(next.totals.interruptedJourneys, 1);
  assert.equal(next.history.length, 1);
});

test('duplicate effects cannot be erased by the named handoff observation', () => {
  const lesson = begun('duplicate-effect');
  issue(lesson, 'verify');
  issue(lesson, 'record-proofs');
  const result = issue(lesson, 'verify').current.latest;
  assert.equal(result.decision, 'REJECTED');
  assert.equal(result.userImpact.effectCount, 2);
  assert.ok(result.userImpact.interruptions.includes('duplicate_effect'));
});

test('wrong guard, dependency or decision produces an inspectable failed answer without changing evidence', () => {
  for (const answer of [
    { guardId: 'routing-exhaustion', dependencyId: 'routing-v1', decision: 'REJECTED' },
    { guardId: 'session-handoff', dependencyId: 'job-v1', decision: 'REJECTED' },
    { guardId: 'session-handoff', dependencyId: 'session-v1', decision: 'SIMULATED_RETIRED' },
  ]) {
    const lesson = begun();
    const before = issue(lesson, 'verify').current.latest;
    const after = issue(lesson, 'check', answer);
    assert.equal(after.current.latest.learnerCheck.status, 'FAIL');
    assert.deepEqual(after.current.latest.evidence, before.evidence);
    assert.equal(after.current.latest.decision, before.decision);
    assert.equal(after.totals.learnerFailed, 1);
    unchanged(lesson, () => issue(lesson, 'check', answer), 'ERR_STATE');
  }
});

test('strict evidence schemas reject coerced booleans/counts, missing or reordered dependencies and wrong epochs', () => {
  const mutations = [
    (e) => { e.inventory[0].required = 'true'; },
    (e) => { e.inventory[0].required = false; },
    (e) => { e.inventory[0].observed = 'true'; },
    (e) => { e.inventory[0].count = '0'; },
    (e) => { e.inventory[0].count = false; },
    (e) => { e.inventory[0].count = -1; },
    (e) => { e.inventory[0].count = NaN; },
    (e) => { e.inventory[0].count = Infinity; },
    (e) => { e.inventory[0].count = 0.5; },
    (e) => { e.inventory[0].count = 4; },
    (e) => { e.inventory[0].extra = true; },
    (e) => { e.inventory.pop(); },
    (e) => { e.inventory.reverse(); },
    (e) => { e.inventory[1].id = 'routing-v1'; },
    (e) => { e.proofs.drain = 'true'; },
    (e) => { e.signals.healthyV2 = 1; },
    (e) => { e.rollback.clockObserved = 'true'; },
    (e) => { e.rollback.untilTick = '2'; },
    (e) => { e.epoch = 18; },
    (e) => { e.candidateEpoch = 17; },
    (e) => { e.tick = 0; e.observedAtTick = 2; },
    (e) => { e.journey.id = 'replacement-journey'; },
    (e) => { e.journey.budgetMs = 10000; },
    (e) => { e.journey.completed = 'true'; },
    (e) => { e.journey.effectCount = '1'; },
    (e) => { e.journey.initialTiers.api = 'v2'; },
    (e) => { e.journey.finalTiers.api = 'v3'; },
    (e) => { e.journey.events = []; },
    (e) => { e.journey.interruptions = ['undeclared']; },
  ];
  for (const mutate of mutations) {
    const evidence = fixture('clear');
    mutate(evidence);
    assert.throws(() => verifyEvidence(evidence), { code: 'ERR_EVIDENCE' });
  }
});

test('malformed, stale, replayed and out-of-order commands reject with absolutely no state changes', () => {
  const lesson = createLesson();
  unchanged(lesson, () => issue(lesson, 'verify'), 'ERR_STATE');
  for (const value of [null, true, 0, 'clear ', '__proto__', 'delete-v1', {}]) {
    unchanged(lesson, () => issue(lesson, 'begin', value), 'ERR_INPUT');
  }
  issue(lesson, 'begin', 'outstanding');
  const before = lesson.snapshot();
  const valid = { type: 'verify', revision: before.revision, runId: before.current.id, value: null };
  for (const command of [
    null, {}, { ...valid, extra: true }, { ...valid, type: 'delete' },
    { ...valid, revision: String(valid.revision) }, { ...valid, revision: -1 },
    { ...valid, runId: 'run-0' }, { ...valid, value: 'true' },
  ]) {
    const code = command?.revision !== undefined
      && (command.revision !== before.revision || command.runId !== before.current.id) ? 'ERR_REPLAY' : 'ERR_INPUT';
    unchanged(lesson, () => lesson.dispatch(command), code);
  }
  unchanged(lesson, () => issue(lesson, 'archive'), 'ERR_STATE');
  unchanged(lesson, () => issue(lesson, 'record-proofs'), 'ERR_STATE');
  lesson.dispatch(valid);
  unchanged(lesson, () => lesson.dispatch(valid), 'ERR_REPLAY');
  for (const answer of [
    { guardId: 'session-handoff', dependencyId: 'session-v1', decision: true },
    { guardId: 'SESSION-HANDOFF', dependencyId: 'session-v1', decision: 'REJECTED' },
    { guardId: 'session-handoff', dependencyId: 'unknown', decision: 'REJECTED' },
    { guardId: 'session-handoff', decision: 'REJECTED' },
  ]) unchanged(lesson, () => issue(lesson, 'check', answer), 'ERR_INPUT');
  const oldReset = { type: 'reset', revision: lesson.snapshot().revision, runId: before.current.id, value: null };
  lesson.dispatch(oldReset);
  unchanged(lesson, () => lesson.dispatch(oldReset), 'ERR_REPLAY');
});

test('attempt, event and retained-history bounds never silently evict evidence', () => {
  const lesson = begun('routing-remains');
  for (let i = 0; i < LIMITS.attempts; i++) issue(lesson, 'verify');
  unchanged(lesson, () => issue(lesson, 'verify'), 'ERR_LIMIT');
  issue(lesson, 'archive');
  for (let i = 1; i < LIMITS.rehearsals; i++) {
    issue(lesson, 'begin', 'clear');
    issue(lesson, 'verify');
    issue(lesson, 'archive');
  }
  assert.equal(lesson.snapshot().history.length, 4);
  assert.equal(lesson.snapshot().totals.attempts, 8);
  unchanged(lesson, () => issue(lesson, 'begin', 'clear'), 'ERR_LIMIT');
  const reset = issue(lesson, 'reset');
  assert.equal(reset.history.length, 0);
  assert.equal(reset.current, null);
  assert.ok(Object.values(reset.totals).every((value) => value === 0));
  const bounded = begun('routing-remains');
  for (let i = 0; i < 5; i++) {
    issue(bounded, 'verify');
    issue(bounded, 'check', { guardId: 'routing-exhaustion', dependencyId: 'routing-v1', decision: 'REJECTED' });
  }
  assert.equal(bounded.snapshot().current.trace.length, 11);
  unchanged(bounded, () => issue(bounded, 'record-proofs'), 'ERR_LIMIT');
  const archived = issue(bounded, 'archive');
  assert.equal(archived.history[0].trace.length, LIMITS.events);
});

test('all fixtures and public snapshots are detached; inspecting or exporting cannot mutate a lesson', () => {
  assert.equal(FIXTURE_IDS.length, 14);
  const first = fixture('clear');
  first.inventory[0].count = 3;
  assert.equal(fixture('clear').inventory[0].count, 0);
  const lesson = begun();
  const snapshot = issue(lesson, 'verify');
  const before = lesson.snapshot();
  snapshot.current.evidence.inventory[1].count = 0;
  snapshot.current.latest.guards[1].status = 'PASS';
  const report = lesson.exportReport();
  report.current.latest.decision = 'SIMULATED_RETIRED';
  report.current.evidence.journey.interruptions.length = 0;
  assert.deepEqual(lesson.snapshot(), before);
  assert.equal(lesson.exportReport().sourceParentComplete, false);
});
