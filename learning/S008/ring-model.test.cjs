'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRehearsal, nextRing, attemptPromotion } = require('./ring-model.js');

const allV2 = { frontend: 'v2', api: 'v2', worker: 'v2' };
const allV1 = { frontend: 'v1', api: 'v1', worker: 'v1' };
const choices = (override = {}) => ({
  ring: 'pilot',
  tiers: { ...allV2 },
  contract: 'dual',
  window: 'open',
  observation: 'healthy',
  ...override
});
const findRing = (state, id) => state.rings.find((ring) => ring.id === id);
const check = (result, id) => result.assertions.find((item) => item.id === id);

test('A-S008 baseline declares unique membership, tier affinity, and the internal gate', () => {
  const state = createRehearsal();
  assert.deepEqual(state.rings.map((ring) => ring.id), ['internal', 'pilot', 'limited', 'remaining']);
  const members = state.rings.flatMap((ring) => ring.members);
  assert.equal(members.length, 8);
  assert.equal(new Set(members).size, 8);
  assert.deepEqual(findRing(state, 'internal').tiers, allV2);
  assert.equal(findRing(state, 'internal').observation.status, 'healthy');
  for (const id of ['pilot', 'limited', 'remaining']) {
    assert.deepEqual(findRing(state, id).tiers, allV1);
    assert.equal(findRing(state, id).status, 'pending');
  }
  assert.equal(nextRing(state), 'pilot');
});

test('A-S008 compatible pilot promotion observes members, not merely requested routing', () => {
  const state = createRehearsal();
  const before = structuredClone(state);
  const result = attemptPromotion(state, choices());
  assert.equal(result.verdict, 'PASS', 'matching tiers and observed compatible journeys should promote');
  assert.equal(result.phase, 'observation');
  assert.deepEqual(state, before, 'attempts must not mutate the supplied fixture');
  assert.equal(findRing(result.state, 'pilot').status, 'promoted');
  assert.deepEqual(findRing(result.state, 'pilot').tiers, allV2);
  assert.equal(nextRing(result.state), 'limited');
  assert.deepEqual(result.actual.map((row) => row.member), ['pilot-01', 'pilot-02']);
  for (const row of result.actual) {
    assert.deepEqual(row.tiers, allV2);
    assert.equal(row.outcome, 'completed');
    assert.ok(row.latencyMs <= 800);
  }
  assert.equal(result.unaffected.length, 6);
  assert.deepEqual(findRing(result.state, 'limited').tiers, allV1);
  assert.deepEqual(findRing(result.state, 'remaining').tiers, allV1);
  assert.ok(result.assertions.every((item) => item.status === 'pass'));
  assert.deepEqual(result.userImpact, { completed: 2, interrupted: 0, unknown: 0 });
});

test('A-S008 rejects out-of-order expansion before any candidate observation', () => {
  const result = attemptPromotion(createRehearsal(), choices({ ring: 'limited' }));
  assert.equal(result.verdict, 'BLOCKED', 'an unobserved predecessor blocks expansion');
  assert.equal(result.phase, 'preflight');
  assert.equal(check(result, 'ring-order').status, 'fail');
  assert.match(result.reasons.join(' '), /pilot/);
  assert.equal(result.actual.length, 0);
  assert.equal(findRing(result.state, 'pilot').status, 'pending');
  assert.deepEqual(findRing(result.state, 'limited').tiers, allV1);
});

test('A-S008 explicitly rejects mixed or unchanged requested tier versions', () => {
  for (const requested of [
    { frontend: 'v2', api: 'v1', worker: 'v2' },
    { frontend: 'v1', api: 'v2', worker: 'v2' },
    { frontend: 'v2', api: 'v2', worker: 'v1' },
    allV1
  ]) {
    const result = attemptPromotion(createRehearsal(), choices({ tiers: requested }));
    assert.equal(result.verdict, 'BLOCKED', 'all required target tiers must be v2');
    assert.equal(check(result, 'tier-affinity').status, 'fail');
    assert.equal(result.phase, 'preflight');
    assert.equal(result.actual.length, 0);
    assert.deepEqual(findRing(result.state, 'pilot').tiers, allV1);
  }
});

test('A-S008 shared-contract incompatibility is detected before expansion', () => {
  const result = attemptPromotion(createRehearsal(), choices({ contract: 'v2-only' }));
  assert.equal(result.verdict, 'BLOCKED', 'matching target tiers cannot excuse broken shared consumers');
  assert.equal(result.phase, 'preflight');
  assert.equal(check(result, 'shared-contract').status, 'fail');
  assert.match(result.reasons.join(' '), /limited/);
  assert.match(result.reasons.join(' '), /remaining/);
  assert.equal(result.actual.length, 0, 'no candidate journey before shared-contract rejection');
  assert.equal(result.unaffected.length, 0);
  assert.equal(nextRing(result.state), 'pilot');
  assert.deepEqual(findRing(result.state, 'pilot').tiers, allV1);
});

test('A-S008 a closed promotion window blocks routing before observation', () => {
  const result = attemptPromotion(createRehearsal(), choices({ window: 'closed' }));
  assert.equal(result.verdict, 'BLOCKED');
  assert.equal(result.phase, 'preflight');
  assert.equal(check(result, 'promotion-window').status, 'fail');
  assert.equal(result.actual.length, 0);
});

test('A-S008 unknown worker evidence remains unknown and cannot unlock the next ring', () => {
  const result = attemptPromotion(createRehearsal(), choices({ observation: 'unknown' }));
  assert.equal(result.phase, 'observation', 'the unknown fixture must actually exercise an observation');
  assert.equal(result.verdict, 'UNKNOWN');
  assert.equal(result.actual.length, 2);
  assert.ok(result.actual.every((row) => row.tiers.worker === null && row.outcome === 'unknown'));
  assert.equal(check(result, 'actual-affinity').status, 'unknown');
  assert.deepEqual(result.userImpact, { completed: 0, interrupted: 0, unknown: 2 });
  assert.equal(findRing(result.state, 'pilot').status, 'unknown');
  assert.deepEqual(findRing(result.state, 'pilot').tiers, allV1);
  const skipped = attemptPromotion(result.state, choices({ ring: 'limited' }));
  assert.equal(skipped.verdict, 'BLOCKED');
  assert.equal(skipped.actual.length, 0);
});

test('A-S008 completed v1 journeys do not establish desired v2 migration', () => {
  const result = attemptPromotion(createRehearsal(), choices({ observation: 'stale-route' }));
  assert.equal(result.verdict, 'BLOCKED', 'successful user completion is not version movement');
  assert.deepEqual(result.desired.tiers, allV2);
  assert.ok(result.actual.every((row) => row.outcome === 'completed'));
  assert.ok(result.actual.every((row) => Object.values(row.tiers).every((version) => version === 'v1')));
  assert.equal(check(result, 'actual-affinity').status, 'fail');
  assert.equal(check(result, 'journey-outcomes').status, 'pass');
  assert.equal(findRing(result.state, 'pilot').status, 'failed');
  assert.deepEqual(findRing(result.state, 'pilot').tiers, allV1);
});

test('A-S008 observed mixed tiers fail affinity even with all-v2 desired routing', () => {
  const result = attemptPromotion(createRehearsal(), choices({ observation: 'tier-drift' }));
  assert.equal(result.verdict, 'BLOCKED');
  assert.deepEqual(result.desired.tiers, allV2);
  assert.equal(result.actual[0].tiers.frontend, 'v2');
  assert.equal(result.actual[0].tiers.api, 'v1');
  assert.equal(result.actual[0].tiers.worker, 'v2');
  assert.equal(check(result, 'actual-affinity').status, 'fail');
  assert.equal(findRing(result.state, 'pilot').status, 'failed');
});

test('A-S008 observation duration is a real gate, not healthy-looking completion', () => {
  const result = attemptPromotion(createRehearsal(), choices({ observation: 'too-short' }));
  assert.equal(result.verdict, 'BLOCKED');
  assert.equal(result.phase, 'observation');
  assert.equal(result.observation.seconds, 30);
  assert.equal(check(result, 'observation-window').status, 'fail');
  assert.ok(result.actual.every((row) => row.outcome === 'completed'));
  assert.equal(nextRing(result.state), 'pilot');
});

test('A-S008 interruptions survive a later compatible retry in cumulative user impact', () => {
  const failed = attemptPromotion(createRehearsal(), choices({ observation: 'interrupted' }));
  assert.equal(failed.verdict, 'BLOCKED');
  assert.deepEqual(failed.userImpact, { completed: 1, interrupted: 1, unknown: 0 });
  assert.equal(check(failed, 'journey-outcomes').status, 'fail');
  assert.deepEqual(findRing(failed.state, 'pilot').tiers, allV1);
  const retry = attemptPromotion(failed.state, choices());
  assert.equal(retry.verdict, 'PASS');
  assert.deepEqual(retry.state.cumulativeImpact, { completed: 3, interrupted: 1, unknown: 0 });
  assert.equal(retry.cleanup.resourcesCreated, 0);
});

test('A-S008 all rings advance in order with separate per-ring observations', () => {
  let state = createRehearsal();
  for (const ring of ['pilot', 'limited', 'remaining']) {
    const result = attemptPromotion(state, choices({ ring }));
    assert.equal(result.verdict, 'PASS', `${ring} should pass its own observation gate`);
    assert.equal(result.actual.length, 2);
    assert.ok(result.actual.every((row) => row.ring === ring));
    state = result.state;
  }
  assert.equal(nextRing(state), null);
  assert.equal(state.attempts, 3);
  const repeated = attemptPromotion(state, choices({ ring: 'remaining' }));
  assert.equal(repeated.verdict, 'BLOCKED', 'an already promoted ring cannot manufacture another success');
  assert.equal(repeated.actual.length, 0);
});

test('A-S008 unrecognized observation evidence fails closed without invented journeys', () => {
  const result = attemptPromotion(createRehearsal(), choices({ observation: 'unverified' }));
  assert.match(result.reasons.join(' '), /Unrecognized observation/);
  assert.equal(result.verdict, 'UNKNOWN');
  assert.equal(result.phase, 'preflight');
  assert.equal(result.actual.length, 0);
  assert.deepEqual(findRing(result.state, 'pilot').tiers, allV1);
});

test('A-S008 unknown contract and incomplete choices fail closed', () => {
  for (const input of [choices({ contract: 'assumed-safe' }), choices({ tiers: {} }), {}]) {
    const result = attemptPromotion(createRehearsal(), input);
    assert.equal(result.phase, 'preflight');
    assert.notEqual(result.verdict, 'PASS');
    assert.equal(result.actual.length, 0);
    assert.equal(nextRing(result.state), 'pilot');
  }
});

test('A-S008 an invalidated predecessor observation blocks the otherwise next ring', () => {
  const first = attemptPromotion(createRehearsal(), choices());
  assert.equal(first.verdict, 'PASS');
  findRing(first.state, 'pilot').observation.status = 'unknown';
  const second = attemptPromotion(first.state, choices({ ring: 'limited' }));
  assert.equal(second.verdict, 'BLOCKED');
  assert.equal(check(second, 'ring-order').status, 'fail');
  assert.equal(second.actual.length, 0);
});
