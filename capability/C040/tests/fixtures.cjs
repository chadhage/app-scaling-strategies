'use strict';

// Pure builders for the fictional inputs and the explicit mutations behind the saved bundle. Shared by the tests and the deterministic
// generator (tests\build-saved.cjs). No clock, no randomness, no file access.
const OLD = '1.0.0';
const NEW = '2.0.0';
const V1 = Object.freeze({ version: OLD, deploymentStamp: 'C020-loopback-v1-r1' });
const V2 = Object.freeze({ version: NEW, deploymentStamp: 'C020-loopback-v2-r1' });
const request = (seq, at, requestId, version) => ({ seq, at, action: 'REQUEST', requestId, version });
const ack = (seq, at, requestId, stamp, issuedAt) => ({
  seq, at, action: 'ACK', requestId, version: stamp.version, deploymentStamp: stamp.deploymentStamp, issuedAt
});
const state = (seq, at, version) => ({ seq, at, action: 'STATE', version });
const client = (clientId, events) => ({ clientId, events });
const transitioned = (clientId, t) => client(clientId, [request(1, t + 10, 'r1', OLD), ack(2, t + 14, 'r1', V1, t + 12),
  request(3, t + 20, 'r2', NEW), ack(4, t + 24, 'r2', V2, t + 22), state(5, t + 30, NEW)]);
const failedOld = (clientId, t) => client(clientId, [request(1, t + 10, 'r1', OLD), { seq: 2, at: t + 14, action: 'FAILED_REPLY', requestId: 'r1', replyCode: 'UNKNOWN_PROFILE' }]);
const interruptedOld = (clientId, t) => client(clientId, [request(1, t + 10, 'r1', OLD), ack(2, t + 14, 'r1', V1, t + 12),
  { seq: 3, at: t + 20, action: 'INTERRUPTED', cause: 'INTERRUPTED_BY_RESET' }]);
const pad = (index) => String(index + 1).padStart(3, '0');

// Forty successes, three failures and two unknowns in one fixed, deliberately interleaved order (positions are 0-based).
const failedAt = Object.freeze([6, 18, 30]);
const unknownAt = Object.freeze([12, 37]);
const kindAt = (index) => (failedAt.includes(index) ? 'failed' : unknownAt.includes(index) ? 'unknown' : 'ok');
const FORTY = Object.freeze({ successes: 40, failed: failedAt.length, unknown: unknownAt.length, rows: 45 });

// C031 input: the real evaluator classifies it (40 ACTUAL_TRANSITION, 3 FAILED, 2 UNKNOWN).
function cohortFleet() {
  return {
    schema: 'C031-fleet/1', id: 'c040-forty-ok-three-failed-two-unknown',
    clients: Array.from({ length: FORTY.rows }, (_, index) => {
      const id = `client-${pad(index)}`;
      const kind = kindAt(index);
      return (kind === 'ok' ? transitioned : kind === 'failed' ? failedOld : interruptedOld)(id, index * 100);
    })
  };
}

// C030 input: fifteen cumulative originals of three effects each. Original 13 adds a second application of effect 0 (DUPLICATE from then on)
// and original 14 an unknown acknowledgment of effect 1: 36 + 2 + 1 + 1 = 40 ONE_APPLICATION rows, 3 DUPLICATE rows and 2 UNKNOWN rows.
function effectFiction(ledger) {
  const plan = ledger.create({ jobId: 'job-c040-forty', workVersion: 'profile-effects/1', profileId: 'synthetic-002', implementation: 'v1' }).plan;
  const keys = plan.effects.map((effect) => effect.key);
  const observations = (kind, effectKeys) => effectKeys.map((effectKey, index) => ({ id: `${kind}-${pad(index)}`, effectKey }));
  const originals = Array.from({ length: 15 }, (_, index) => {
    const number = index + 1;
    return {
      id: `original-${pad(index)}`, applications: observations('application', number >= 13 ? [...keys, keys[0]] : keys),
      deliveries: observations('delivery', keys), absences: [], unknownAcks: number >= 14 ? [keys[1]] : [],
      checkpoints: keys.map((afterEffectKey, at) => ({ nextIndex: at + 1, afterEffectKey })), closure: 'closed', support: 'supported'
    };
  });
  return { schema: 'C030-fictional-observations/1', plan, originals };
}

// C029-shaped fictional output (the real producer cannot be fed 45 journeys): 40 within budget, 2 exceeded, 1 failed reply, 2 unknown.
function latencyReport() {
  const journeys = Array.from({ length: FORTY.rows }, (_, index) => {
    const attemptId = `fictional-journey-${pad(index)}`;
    const base = { attemptId, terminalVerdict: 'KNOWN', budgetMs: 1000, includedInDenominator: true, summaryOnly: false, classification: 'observed-local-segment' };
    if (index === 6 || index === 30) {
      return { ...base, verdict: 'FAIL', latencyVerdict: 'FAIL', stateVerdict: 'PASS', elapsedMs: index === 6 ? 1000.25 : 1500.5, reasonCodes: ['ORIGINAL_LATENCY_BUDGET_MISS'] };
    }
    if (index === 18) return { ...base, verdict: 'FAIL', latencyVerdict: 'PASS', stateVerdict: 'FAIL', elapsedMs: 75.5, classification: 'failed', reasonCodes: ['ORIGINAL_FAILED_REPLY'] };
    if (index === 12) {
      return { ...base, verdict: 'UNKNOWN', latencyVerdict: 'UNKNOWN', stateVerdict: 'UNKNOWN', terminalVerdict: 'UNKNOWN', elapsedMs: null,
        classification: 'unknown', reasonCodes: ['REQUIRED_STATE_OR_TERMINAL_UNKNOWN', 'END_TIME_NOT_SAVED'] };
    }
    if (index === 37) {
      return { ...base, verdict: 'UNKNOWN', latencyVerdict: 'PASS', stateVerdict: 'UNKNOWN', terminalVerdict: 'UNKNOWN', elapsedMs: 49.5,
        classification: 'unknown', reasonCodes: ['REQUIRED_STATE_OR_TERMINAL_UNKNOWN'] };
    }
    return { ...base, verdict: 'PASS', latencyVerdict: 'PASS', stateVerdict: 'PASS', elapsedMs: 100 + ((index * 37) % 400), reasonCodes: [] };
  });
  return { schema: 'C029-evaluation/1', cardId: 'C029', valid: true, code: null, savedId: 'c040-fictional-forty', decision: 'FAIL',
    counts: { originals: FORTY.rows, pass: FORTY.successes, fail: 3, unknown: 2 }, successFraction: { numerator: FORTY.successes, denominator: FORTY.rows },
    originals: journeys };
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const zeroCohort = { clients: 0, eligible: 0, notEligible: 0, actualTransition: 0, unchanged: 0, notTransitionedYet: 0, failedOrUnknown: 0, failed: 0, unknown: 0, duplicateCopiesCollapsed: 0 };
// Explicit, named edits of a saved producer output. Each edits the clone it is given; none touches a producer.
const mutations = Object.freeze({
  unrecognised: {
    cohort(report) { report.clients[1].classification = 'PARTIALLY_MIGRATED'; },
    effect(report) { report.originals[0].effects[0].status = 'MOSTLY_ONE_APPLICATION'; },
    latency(report) { report.originals[1].verdict = 'HEALTHY_ISH'; }
  },
  empty: {
    cohort(report) { Object.assign(report, { clients: [], counts: { ...zeroCohort }, successRate: { numerator: 0, denominator: 0, fraction: '0/0', percent: null } }); },
    effect(report) { Object.assign(report, { originals: [], counts: { originals: 0, pass: 0, fail: 0, unknown: 0, unsupported: 0 }, successFraction: { numerator: 0, denominator: 0 } }); },
    latency(report) { Object.assign(report, { originals: [], counts: { originals: 0, pass: 0, fail: 0, unknown: 0 }, successFraction: { numerator: 0, denominator: 0 } }); }
  },
  truncated: {
    cohort(report) { report.clients = report.clients.slice(0, 4); },
    effect(report) { report.originals = report.originals.slice(0, 1); },
    latency(report) { report.originals = report.originals.slice(0, 1); }
  },
  duplicated: {
    cohort(report) { report.clients.push(clone(report.clients[0]), clone(report.clients[6])); },
    effect(report) { report.originals[0].effects.push(clone(report.originals[0].effects[2])); },
    latency(report) { report.originals.push(clone(report.originals[0])); }
  }
});
const pick = (source, keys) => Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
// The saved shape keeps exactly the fields the inspector reads; everything else of a producer report is dropped, nothing is changed.
const slim = Object.freeze({
  cohort: (report) => ({ ...pick(report, ['schema', 'cardId', 'valid', 'code', 'fleetId', 'savedId']), counts: report.counts,
    successRate: pick(report.successRate, ['numerator', 'denominator', 'fraction', 'percent']),
    clients: report.clients.map((row) => pick(row, ['clientId', 'classification', 'failureKind', 'reasonCodes', 'reasonMeaning', 'startVersion', 'endVersion',
      'eligible', 'eligibility', 'countsInNumerator', 'countsInDenominator', 'traceCopies', 'notes'])) }),
  effect: (report) => ({ ...pick(report, ['schema', 'cardId', 'valid', 'code', 'sourceId', 'decision']), counts: report.counts,
    successFraction: pick(report.successFraction, ['numerator', 'denominator']),
    originals: report.originals.map((original) => ({ ...pick(original, ['originalId', 'verdict', 'includedInDenominator', 'reasonCodes']),
      effects: original.effects.map((effect) => pick(effect, ['index', 'effectKey', 'kind', 'intendedApplications', 'confirmedApplicationsLowerBound',
        'confirmedApplicationsUpperBound', 'deliveryAttempts', 'status'])),
      effectCounts: pick(original.effectCounts, ['intendedEffects', 'confirmedApplications', 'deliveryAttempts']) })) }),
  latency: (report) => ({ ...pick(report, ['schema', 'cardId', 'valid', 'code', 'savedId', 'controlId', 'decision']), counts: report.counts,
    successFraction: pick(report.successFraction, ['numerator', 'denominator']),
    originals: report.originals.map((row) => pick(row, ['attemptId', 'verdict', 'latencyVerdict', 'stateVerdict', 'terminalVerdict', 'budgetMs', 'startedAt',
      'deadline', 'endedAt', 'elapsedMs', 'pausedMs', 'includedInDenominator', 'summaryOnly', 'classification', 'reasonCodes'])) })
});

module.exports = Object.freeze({
  OLD, NEW, V1, V2, request, ack, state, client, transitioned, failedOld, interruptedOld, FORTY, kindAt, cohortFleet, effectFiction, latencyReport,
  clone, mutations, slim, pick
});
