'use strict';

// Hand-made producer-shaped fictional reports (C031-evaluation/1, C030-detection/1, C029-evaluation/1) for the model tests.
// The fictional "producer" states its own counts from the full list; a test may then shorten, repeat or edit the rows.
const shapes = {
  transition: ['ACTUAL_TRANSITION', null, 'TRANSITION_EVIDENCE_COMPLETE', true, '1.0.0', '2.0.0'],
  unchanged: ['UNCHANGED', null, 'UNCHANGED_NEW_VERSION_ONLY', false, '2.0.0', '2.0.0'],
  notYet: ['NOT_TRANSITIONED_YET', null, 'STILL_ON_OLD_VERSION', true, '1.0.0', '1.0.0'],
  failed: ['FAILED_OR_UNKNOWN', 'FAILED', 'FAILED_REPLY', true, '1.0.0', '1.0.0'],
  unknown: ['FAILED_OR_UNKNOWN', 'UNKNOWN', 'INTERRUPTED_BEFORE_TERMINAL_OUTCOME', true, '1.0.0', '1.0.0']
};
const clientRow = (clientId, kind) => {
  const [classification, failureKind, code, eligible, startVersion, endVersion] = shapes[kind];
  return { clientId, classification, failureKind, reasonCodes: [code], reasonMeaning: `${code} (fictional meaning)`, startVersion, endVersion, eligible,
    eligibility: eligible ? 'STARTED_ON_OLD_VERSION' : 'STARTED_ON_NEW_VERSION_NOT_ELIGIBLE', countsInNumerator: classification === 'ACTUAL_TRANSITION',
    countsInDenominator: eligible, traceCopies: 1, notes: [] };
};
function cohortReport(kinds) {
  const clients = kinds.map((kind, index) => clientRow(`client-${String(index + 1).padStart(3, '0')}`, kind));
  const count = (predicate) => clients.filter(predicate).length;
  const eligible = count((row) => row.eligible);
  const actualTransition = count((row) => row.classification === 'ACTUAL_TRANSITION');
  return { schema: 'C031-evaluation/1', cardId: 'C031', valid: true, code: null, fleetId: 'test-fleet', clients,
    counts: { clients: clients.length, eligible, notEligible: clients.length - eligible, actualTransition,
      unchanged: count((row) => row.classification === 'UNCHANGED'), notTransitionedYet: count((row) => row.classification === 'NOT_TRANSITIONED_YET'),
      failedOrUnknown: count((row) => row.classification === 'FAILED_OR_UNKNOWN'), failed: count((row) => row.failureKind === 'FAILED'),
      unknown: count((row) => row.failureKind === 'UNKNOWN'), duplicateCopiesCollapsed: 0 },
    successRate: { numerator: actualTransition, denominator: eligible, fraction: `${actualTransition}/${eligible}`,
      percent: eligible ? `${((actualTransition * 100) / eligible).toFixed(2)}%` : null } };
}
const repeat = (kind, count) => Array.from({ length: count }, () => kind);

const keys = ['profile-audit', 'preference-audit', 'completion-receipt'].map((kind) => `job-test|profile-effects/1|synthetic-002|${kind}`);
const effect = (index, status, lower, upper, deliveries) => ({ index, effectKey: keys[index], kind: keys[index].split('|')[3], intendedApplications: 1,
  confirmedApplicationsLowerBound: lower, confirmedApplicationsUpperBound: upper, deliveryAttempts: deliveries, status });
const original = (originalId, verdict, effects) => ({ originalId, verdict, includedInDenominator: true, reasonCodes: [], effects,
  effectCounts: { intendedEffects: effects.length, confirmedApplications: effects.reduce((total, item) => total + item.confirmedApplicationsLowerBound, 0),
    deliveryAttempts: effects.reduce((total, item) => total + item.deliveryAttempts, 0) } });
const detection = (sourceId, originals, counts = { originals: originals.length, pass: 0, fail: 0, unknown: 0, unsupported: 0 }) => ({
  schema: 'C030-detection/1', cardId: 'C030', valid: true, code: null, sourceId, decision: 'HOLD', counts,
  successFraction: { numerator: counts.pass, denominator: counts.originals }, originals });
const threeOk = () => [effect(0, 'ONE_APPLICATION', 1, 1, 1), effect(1, 'ONE_APPLICATION', 1, 1, 1), effect(2, 'ONE_APPLICATION', 1, 1, 1)];

const journey = (attemptId, verdict, latencyVerdict, stateVerdict, budgetMs, elapsedMs, extra = {}) => ({ attemptId, verdict, latencyVerdict, stateVerdict,
  terminalVerdict: elapsedMs === null ? 'UNKNOWN' : 'KNOWN', budgetMs, elapsedMs, includedInDenominator: true, summaryOnly: false, reasonCodes: [], ...extra });
const latencyReport = (originals, counts = { originals: originals.length, pass: 0, fail: 0, unknown: 0 }) => ({ schema: 'C029-evaluation/1', cardId: 'C029',
  valid: true, code: null, savedId: 'test-latency', decision: 'HOLD', counts, successFraction: { numerator: counts.pass, denominator: counts.originals }, originals });

module.exports = Object.freeze({ clientRow, cohortReport, repeat, keys, effect, original, detection, threeOk, journey, latencyReport });
