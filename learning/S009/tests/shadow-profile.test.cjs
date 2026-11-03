'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../model.js');

const input = (changes = {}) => ({
  productionVersion: 'v1', profileId: 'synthetic-rowan', scenario: 'safe',
  requestCount: '2', ...changes
});
const replay = (changes = {}, state = model.createState()) => model.run(state, input(changes));
const records = (state) => state.batches.flatMap((batch) => batch.records);
const copy = (value) => JSON.parse(JSON.stringify(value));

test('the model is loadable and begins with an explicitly synthetic empty state', () => {
  const state = model.createState();
  assert.equal(state.mode, 'synthetic-only');
  assert.equal(state.nativeProof, false);
  assert.equal(state.lastResult.verdict, 'NOT RUN');
  assert.deepEqual(state.batches, []);
  assert.ok(Object.values(model.summarize(state)).every((count) => count === 0));
});

for (const productionVersion of ['v1', 'v2']) {
  test(`safe replay serves only intended ${productionVersion} and suppresses candidate effects`, () => {
    const state = replay({ productionVersion });
    assert.equal(state.lastResult.verdict, 'SAFE');
    assert.equal(records(state).length, 2);
    for (const record of records(state)) {
      assert.equal(record.production.version, productionVersion);
      assert.equal(record.candidate.version, productionVersion === 'v1' ? 'v2' : 'v1');
      assert.deepEqual(record.candidate.response, record.production.response);
      assert.equal(record.comparison.status, 'MATCH');
      assert.deepEqual(record.comparison.differences, []);
      assert.deepEqual(record.production.effects, { writes: 1, notifications: 1 });
      assert.deepEqual(record.candidate.effects, {
        attemptedWrites: 1, attemptedNotifications: 1, writes: 0, notifications: 0,
        suppressedWrites: 1, suppressedNotifications: 1
      });
    }
    assert.deepEqual(model.summarize(state), {
      requests: 2, productionWrites: 2, productionNotifications: 2,
      shadowWrites: 0, shadowNotifications: 0, suppressedWrites: 2, suppressedNotifications: 2,
      totalWrites: 2, totalNotifications: 2, duplicateWrites: 0, duplicateNotifications: 0,
      matchedResponses: 2, discrepantResponses: 0, unknownResponses: 0
    });
  });
}

test('discrepant candidate fields are reported without changing the caller response', () => {
  const safe = replay({ requestCount: 1 });
  const state = replay({ scenario: 'discrepant', requestCount: 1 });
  assert.equal(state.lastResult.verdict, 'DISCREPANT');
  const record = records(state)[0];
  assert.deepEqual(record.production, records(safe)[0].production);
  assert.equal(record.production.response.body.membershipTier, 'standard');
  assert.equal(record.candidate.response.body.membershipTier, 'premium');
  assert.deepEqual(record.comparison.differences, [
    { field: 'body.loyaltyPoints', production: 120, candidate: 0 },
    { field: 'body.membershipTier', production: 'standard', candidate: 'premium' }
  ]);
  assert.equal(model.summarize(state).discrepantResponses, 1);
  assert.equal(model.summarize(state).shadowWrites, 0);
  assert.equal(model.summarize(state).shadowNotifications, 0);
});

test('matching responses cannot conceal unsafe duplicated writes and notifications', () => {
  const state = replay({ scenario: 'unsafe-duplicate', requestCount: '3' });
  assert.equal(state.lastResult.verdict, 'UNSAFE');
  assert.match(state.lastResult.message, /duplicat/i);
  const totals = model.summarize(state);
  assert.equal(totals.requests, 3);
  assert.equal(totals.matchedResponses, 3);
  assert.equal(totals.totalWrites, 6);
  assert.equal(totals.totalNotifications, 6);
  assert.equal(totals.duplicateWrites, 3);
  assert.equal(totals.duplicateNotifications, 3);
  assert.equal(totals.suppressedWrites, 0);
  assert.equal(totals.suppressedNotifications, 0);
  assert.ok(records(state).every((record) => record.production.version === 'v1'));
  assert.ok(records(state).every((record) => record.candidate.effects.writes === 1));
});

test('a later safe replay retains cumulative unsafe effects and earlier observations', () => {
  const unsafe = replay({ scenario: 'unsafe-duplicate', requestCount: 1 });
  const state = replay({ requestCount: 2 }, unsafe);
  assert.equal(state.lastResult.verdict, 'SAFE');
  assert.equal(state.batches.length, 2);
  assert.equal(state.batches[0].verdict, 'UNSAFE');
  assert.equal(model.summarize(state).duplicateWrites, 1);
  assert.equal(model.summarize(state).duplicateNotifications, 1);
  assert.equal(model.summarize(state).totalWrites, 4);
  assert.deepEqual(state.batches[0], unsafe.batches[0]);
});

test('missing candidate response is UNKNOWN while production still answers and effects are suppressed', () => {
  const state = replay({ scenario: 'unknown', requestCount: 1 });
  assert.equal(state.lastResult.verdict, 'UNKNOWN');
  const record = records(state)[0];
  assert.equal(record.production.response.status, 200);
  assert.equal(record.candidate.response, null);
  assert.equal(record.comparison.status, 'UNKNOWN');
  assert.deepEqual(record.comparison.differences, []);
  assert.match(record.comparison.reason, /unavailable|missing/i);
  assert.equal(model.summarize(state).unknownResponses, 1);
  assert.equal(model.summarize(state).matchedResponses, 0);
  assert.equal(model.summarize(state).shadowWrites, 0);
  assert.equal(model.summarize(state).shadowNotifications, 0);
});

const invalidInputs = [
  ['unknown profile', input({ profileId: 'real-customer' })],
  ['unknown production', input({ productionVersion: 'v3' })],
  ['unknown scenario', input({ scenario: 'live-replay' })],
  ['empty count', input({ requestCount: '' })],
  ['whitespace count', input({ requestCount: ' 2 ' })],
  ['zero count', input({ requestCount: 0 })],
  ['negative count', input({ requestCount: -1 })],
  ['fractional count', input({ requestCount: 1.5 })],
  ['overlarge count', input({ requestCount: 4 })],
  ['NaN count', input({ requestCount: NaN })],
  ['infinite count', input({ requestCount: Infinity })],
  ['boolean count', input({ requestCount: true })],
  ['exponent count', input({ requestCount: '1e0' })],
  ['unknown field', input({ endpoint: 'https://not-used.invalid' })],
  ['missing field', { productionVersion: 'v1', profileId: 'synthetic-rowan', requestCount: 1 }],
  ['null input', null],
  ['array input', []],
  ['string input', 'safe']
];

for (const [label, invalid] of invalidInputs) {
  test(`invalid ${label} fails closed and preserves records and every counter`, () => {
    const existing = replay({ scenario: 'unsafe-duplicate', requestCount: 1 });
    const before = copy(existing);
    const state = model.run(existing, invalid);
    assert.equal(state.lastResult.verdict, 'INVALID');
    assert.deepEqual(state.batches, before.batches);
    assert.deepEqual(model.summarize(state), model.summarize(before));
    assert.deepEqual(existing, before);
  });
}

test('the second profile is a separate synthetic fixture, not user-supplied traffic', () => {
  const state = replay({ profileId: 'synthetic-sage', requestCount: 1 });
  assert.equal(state.lastResult.verdict, 'SAFE');
  assert.equal(records(state)[0].production.response.body.profileId, 'synthetic-sage');
  assert.equal(records(state)[0].production.response.body.displayName, 'Synthetic Sage');
});

test('request budget stops at 30 without discarding earlier unsafe evidence', () => {
  let state = replay({ scenario: 'unsafe-duplicate', requestCount: 3 });
  for (let index = 0; index < 9; index++) state = replay({ requestCount: 3 }, state);
  assert.equal(model.summarize(state).requests, 30);
  const before = copy(state);
  state = replay({ requestCount: 1 }, state);
  assert.equal(state.lastResult.verdict, 'INVALID');
  assert.match(state.lastResult.message, /30|budget|Reset/);
  assert.deepEqual(state.batches, before.batches);
  assert.deepEqual(model.summarize(state), model.summarize(before));
  assert.equal(model.summarize(state).duplicateWrites, 3);
});

test('pure replay does not mutate prior state or share mutable historical responses', () => {
  const prior = replay({ requestCount: 1 });
  const before = copy(prior);
  const options = input({ scenario: 'discrepant' });
  const optionsBefore = copy(options);
  const next = model.run(prior, options);
  assert.deepEqual(prior, before);
  assert.deepEqual(options, optionsBefore);
  assert.equal(next.batches.length, 2);
  next.batches[0].records[0].production.response.body.displayName = 'changed in test';
  assert.deepEqual(prior, before);
});

test('corrupt or forged state is rejected instead of producing a safety verdict', () => {
  assert.throws(() => replay({}, null), TypeError);
  assert.throws(() => replay({}, { ...model.createState(), schemaVersion: 99 }), TypeError);
  const forged = replay({ requestCount: 1 });
  forged.batches[0].records[0].candidate.effects.writes = 900;
  assert.throws(() => model.run(forged, input()), TypeError);
  assert.throws(() => model.summarize(forged), TypeError);
});

test('comparison ignores object property order but retains status and body differences', () => {
  assert.equal(model.compareResponses(
    { status: 200, body: { a: 1, b: 2 } },
    { status: 200, body: { b: 2, a: 1 } }
  ).status, 'MATCH');
  assert.deepEqual(model.compareResponses(
    { status: 200, body: { a: 1 } },
    { status: 503, body: { a: 2 } }
  ).differences, [
    { field: 'status', production: 200, candidate: 503 },
    { field: 'body.a', production: 1, candidate: 2 }
  ]);
});

test('comparison reports missing fields and never treats absent responses as a match', () => {
  const result = model.compareResponses(
    { status: 200, body: { required: 'value' } },
    { status: 200, body: {} }
  );
  assert.equal(result.status, 'DISCREPANT');
  assert.deepEqual(result.differences, [
    { field: 'body.required', production: 'value', candidate: '(missing)' }
  ]);
  assert.equal(model.compareResponses({ status: 200, body: {} }, null).status, 'UNKNOWN');
  assert.equal(model.compareResponses({}, {}).status, 'UNKNOWN');
});

test('Reset is a genuinely new clean state and cannot inherit responses or effects', () => {
  const dirty = replay({ scenario: 'unsafe-duplicate' });
  const reset = model.createState();
  assert.equal(reset.lastResult.verdict, 'NOT RUN');
  assert.deepEqual(reset.batches, []);
  assert.ok(Object.values(model.summarize(reset)).every((count) => count === 0));
  reset.batches.push({ testOnly: true });
  assert.equal(dirty.batches.length, 1);
  assert.equal(model.createState().batches.length, 0);
});
