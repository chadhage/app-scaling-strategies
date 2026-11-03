'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlan, createReviewSession } = require('../plan-model.js');
const fixtures = require('../plan-fixtures.js');
const { approval } = require('../../C001/approved-contract.js');
const matrix = require('../../C003/matrix-data.js');
const envelopeFixture = require('../../C002/synthetic-fixture.js');
const provenance = require('../plan-provenance.js');
const copy = value => structuredClone(value);

async function rejected(request, code, path) {
  const result = await buildPlan(request, approval);
  assert.equal(result.valid, false);
  assert.equal(result.executed, false);
  assert.equal(result.plan, null);
  assert.ok(result.errors.some(error => error.code === code && (!path || error.path === path)),
    `${code} at ${path || 'any path'}: ${JSON.stringify(result.errors)}`);
  return result;
}

test('resource-free local plan is reviewable without inventing a zero-cost Azure estimate', async () => {
  const result = await buildPlan(fixtures.local, approval);
  assert.equal(result.valid, true);
  assert.equal(result.executed, false);
  assert.equal(result.plan.canAcknowledge, true);
  assert.equal(result.plan.cost.status, 'not-applicable');
  assert.equal(result.plan.cost.totalMinorUnits, null);
  assert.equal(result.plan.cost.currency, null);
  assert.match(result.plan.cost.notice, /no cloud execution/i);
  assert.equal(result.plan.duration.comparisonSeconds, 30);
  assert.deepEqual(result.plan.duration.suppliedBounds, { min: 1, max: 300 });
  assert.equal(result.plan.resources.cloudResourceCount, 0);
  assert.equal(result.plan.resources.reserved, false);
  assert.equal(result.plan.configuration, null);
  assert.equal(result.plan.cloudExecutionAuthorized, false);
  assert.equal(result.plan.provenance, provenance);
  assert.match(result.plan.inputFingerprint, /^[a-f0-9]{64}$/);
});

test('missing native pricing produces a readable blocked plan with null cost and actual C001 reasons', async () => {
  const result = await buildPlan(fixtures.native, approval);
  assert.equal(result.valid, true);
  assert.equal(result.plan.canAcknowledge, false);
  assert.equal(result.plan.cost.totalMinorUnits, null);
  const codes = result.plan.blockers.map(reason => reason.code);
  assert.ok(codes.includes('PRICING_MISSING'));
  assert.ok(codes.includes('LIVE_AZURE_NOT_APPROVED'));
  assert.ok(codes.includes('ZERO_NATIVE_LIMIT'));
  assert.equal(result.plan.configuration.qualified, false);
});

test('editing invalidates an actual local acknowledgement, rather than retaining stale consent', async () => {
  const session = createReviewSession();
  const review = await session.review(fixtures.local, approval);
  assert.equal(review.valid, true);
  const acknowledged = session.acknowledge(true);
  assert.equal(acknowledged.accepted, true);
  assert.equal(acknowledged.consent.scope, 'local-plan-review-only');
  assert.equal(acknowledged.consent.cloudExecutionAuthorized, false);
  session.invalidate();
  const stale = session.acknowledge(true);
  assert.equal(stale.accepted, false);
  assert.equal(stale.consent, null);
  assert.ok(stale.reasons.some(reason => reason.code === 'REVIEW_REQUIRED'));
});

test('examples reuse the actual C002 fixture, without inventing limits or another validator', () => {
  assert.equal(fixtures.local.envelopeRequest, envelopeFixture);
  assert.equal(fixtures.native.envelopeRequest, envelopeFixture);
  assert.equal(fixtures.native.configurationId, matrix.rows.find(row => row.firstPlannedNativeTarget).id);
  assert.ok(Object.isFrozen(fixtures.local.resources));
});

for (const status of ['missing', 'unknown']) {
  for (const mode of ['local', 'native']) {
    test(`${mode} ${status} pricing stays null and blocks acknowledgement`, async () => {
      const request = copy(fixtures[mode]);
      request.pricing.status = status;
      const result = await buildPlan(request, approval);
      assert.equal(result.valid, true);
      assert.equal(result.outcome, 'blocked-plan');
      assert.equal(result.plan.canAcknowledge, false);
      assert.equal(result.plan.cost.totalMinorUnits, null);
      assert.equal(result.plan.cost.currency, null);
      assert.ok(result.plan.blockers.some(reason => reason.code === `PRICING_${status.toUpperCase()}`));
      const session = createReviewSession();
      await session.review(request, approval);
      assert.equal(session.acknowledge(true).accepted, false);
    });
  }
}

for (const row of matrix.rows) {
  test(`actual C003 ${row.id} remains ${row.status}, unqualified and blocked`, async () => {
    const request = copy(fixtures.native);
    request.configurationId = row.id;
    const result = await buildPlan(request, approval);
    assert.equal(result.valid, true);
    assert.equal(result.plan.configuration, row);
    assert.equal(result.plan.configuration.reason, row.reason);
    assert.equal(result.plan.configuration.constraints, row.constraints);
    assert.equal(result.plan.configuration.qualified, false);
    assert.equal(result.plan.canAcknowledge, false);
    assert.ok(result.plan.blockers.some(reason => reason.code === 'NATIVE_UNQUALIFIED'));
    if (row.status !== 'documented-supported') {
      assert.ok(result.plan.blockers.some(reason => reason.code === `CONFIGURATION_${row.status.toUpperCase()}`));
    }
    for (const key of [
      'liveAzureExecutionApproved', 'iacGenerationApproved', 'scaffoldApproved',
      'deploymentApproved', 'identityRegistrationApproved', 'expenditureApproved'
    ]) assert.equal(result.plan.permissions[key], false);
    assert.equal(result.plan.liveAzureRuns, 0);
    assert.equal(result.plan.permissions.maximumLiveAzureRuns, 0);
    assert.equal(result.plan.permissions.authorizedCloudSpend, 0);
    assert.equal(result.plan.productionRuntimeValidated, false);
  });
}

function withEstimate() {
  const request = copy(fixtures.native);
  request.configurationId = matrix.rows.find(row => row.status === 'documented-supported').id;
  request.pricing = {
    status: 'unverified-estimate',
    currency: 'USD',
    totalMinorUnits: 125,
    basis: 'Synthetic unit-test input only, not current Azure pricing. Total coverage, currency precision, tax, discounts, duration and cleanup cost are unverified.',
    source: {
      reference: 'Declared synthetic test source only; not fetched or trusted',
      capturedAtUtc: '2026-11-03T14:00:00.000Z',
      configurationId: request.configurationId
    }
  };
  return request;
}

test('even a declared positive estimate plus documented support grants no native consent', async () => {
  const result = await buildPlan(withEstimate(), approval);
  assert.equal(result.valid, true);
  assert.equal(result.plan.cost.totalMinorUnits, 125);
  assert.match(result.plan.cost.notice, /unverified.*not a provider quote/i);
  assert.equal(result.plan.canAcknowledge, false);
  assert.equal(result.plan.configuration.status, 'documented-supported');
  for (const code of ['PRICING_UNVERIFIED', 'NATIVE_UNQUALIFIED', 'LIVE_AZURE_NOT_APPROVED', 'ZERO_NATIVE_LIMIT', 'CLOUD_SPEND_FORBIDDEN']) {
    assert.ok(result.plan.blockers.some(reason => reason.code === code));
  }
});

const invalidCases = [
  ['wrong version', value => { value.schemaVersion = 2; }, 'VERSION_MISMATCH', 'schemaVersion'],
  ['missing mode', value => { delete value.mode; }, 'REQUIRED_FIELD', '$.mode'],
  ['unknown root field', value => { value.approveNative = true; }, 'UNKNOWN_FIELD', '$.approveNative'],
  ['invalid mode', value => { value.mode = 'native.execute'; }, 'INVALID_MODE', 'mode'],
  ['local native target', value => { value.configurationId = fixtures.native.configurationId; }, 'LOCAL_CONFIGURATION_FORBIDDEN', 'configurationId'],
  ['missing duration basis', value => { delete value.durationBasis; }, 'REQUIRED_FIELD', '$.durationBasis'],
  ['blank duration basis', value => { value.durationBasis = '  '; }, 'INVALID_TEXT', 'durationBasis'],
  ['array resources', value => { value.resources = []; }, 'INVALID_SHAPE', 'resources'],
  ['unknown resource field', value => { value.resources.reserved = true; }, 'UNKNOWN_FIELD', 'resources.reserved'],
  ['local resource count unknown', value => { value.resources.cloudResourceCount = null; }, 'LOCAL_RESOURCES_FORBIDDEN', 'resources.cloudResourceCount'],
  ['local resource count positive', value => { value.resources.cloudResourceCount = 1; }, 'LOCAL_RESOURCES_FORBIDDEN', 'resources.cloudResourceCount'],
  ['negative zero resource count', value => { value.resources.cloudResourceCount = -0; }, 'INVALID_RESOURCE_COUNT', 'resources.cloudResourceCount'],
  ['fraction resource count', value => { value.resources.cloudResourceCount = 0.5; }, 'INVALID_RESOURCE_COUNT', 'resources.cloudResourceCount'],
  ['unsafe resource count', value => { value.resources.cloudResourceCount = Number.MAX_SAFE_INTEGER + 1; }, 'INVALID_RESOURCE_COUNT', 'resources.cloudResourceCount'],
  ['resource count string', value => { value.resources.cloudResourceCount = '0'; }, 'INVALID_RESOURCE_COUNT', 'resources.cloudResourceCount'],
  ['missing resource description', value => { delete value.resources.description; }, 'REQUIRED_FIELD', 'resources.description'],
  ['missing pricing', value => { delete value.pricing; }, 'REQUIRED_FIELD', '$.pricing'],
  ['null pricing', value => { value.pricing = null; }, 'INVALID_SHAPE', 'pricing'],
  ['unknown pricing status', value => { value.pricing.status = 'approved-free'; }, 'INVALID_PRICING_STATUS', 'pricing.status'],
  ['fake free local estimate', value => { value.pricing.totalMinorUnits = 0; }, 'UNPRICED_VALUE_FORBIDDEN', 'pricing.totalMinorUnits'],
  ['unpriced currency', value => { value.pricing.currency = 'USD'; }, 'UNPRICED_VALUE_FORBIDDEN', 'pricing.currency'],
  ['unpriced source', value => { value.pricing.source = {}; }, 'UNPRICED_VALUE_FORBIDDEN', 'pricing.source'],
  ['missing price basis', value => { delete value.pricing.basis; }, 'REQUIRED_FIELD', 'pricing.basis'],
  ['pricing approval override', value => { value.pricing.approved = true; }, 'UNKNOWN_FIELD', 'pricing.approved']
];
for (const [label, mutate, code, field] of invalidCases) {
  test(`strict plan shape rejects ${label} without defaults`, async () => {
    const request = copy(fixtures.local);
    mutate(request);
    await rejected(request, code, field);
  });
}

for (const [label, mutate, code, field] of [
  ['not-applicable native pricing', value => { value.pricing.status = 'not-applicable'; }, 'NATIVE_PRICING_REQUIRED', 'pricing.status'],
  ['unknown target', value => {
    value.configurationId = 'invented-target';
    value.pricing.source.configurationId = value.configurationId;
  }, 'CONFIGURATION_NOT_FOUND', 'configurationId'],
  ['native zero resource count', value => { value.resources.cloudResourceCount = 0; }, 'NATIVE_RESOURCES_UNKNOWN', 'resources.cloudResourceCount'],
  ['native zero estimate', value => { value.pricing.totalMinorUnits = 0; }, 'POSITIVE_ESTIMATE_REQUIRED', 'pricing.totalMinorUnits'],
  ['native negative estimate', value => { value.pricing.totalMinorUnits = -1; }, 'POSITIVE_ESTIMATE_REQUIRED', 'pricing.totalMinorUnits'],
  ['native fractional estimate', value => { value.pricing.totalMinorUnits = 1.5; }, 'POSITIVE_ESTIMATE_REQUIRED', 'pricing.totalMinorUnits'],
  ['native infinite estimate', value => { value.pricing.totalMinorUnits = Infinity; }, 'POSITIVE_ESTIMATE_REQUIRED', 'pricing.totalMinorUnits'],
  ['native null estimate', value => { value.pricing.totalMinorUnits = null; }, 'POSITIVE_ESTIMATE_REQUIRED', 'pricing.totalMinorUnits'],
  ['missing currency', value => { value.pricing.currency = null; }, 'CURRENCY_REQUIRED', 'pricing.currency'],
  ['missing price source', value => { value.pricing.source = null; }, 'INVALID_SHAPE', 'pricing.source'],
  ['source target mismatch', value => { value.pricing.source.configurationId = 'different'; }, 'PRICE_TARGET_MISMATCH', 'pricing.source.configurationId'],
  ['impossible source date', value => { value.pricing.source.capturedAtUtc = '2026-02-30T00:00:00Z'; }, 'INVALID_PRICE_TIMESTAMP', 'pricing.source.capturedAtUtc'],
  ['source extra flag', value => { value.pricing.source.verified = true; }, 'UNKNOWN_FIELD', 'pricing.source.verified']
]) {
  test(`strict native proposal rejects ${label}`, async () => {
    const request = withEstimate();
    mutate(request);
    await rejected(request, code, field);
  });
}

for (const [metric, mutate] of [
  ['load.requestsPerSecond', envelope => { envelope.load.requestsPerSecond = 101; }],
  ['load.concurrentUsers', envelope => { envelope.load.concurrentUsers = 21; }],
  ['durationSeconds', envelope => { envelope.durationSeconds = 301; }],
  ['capacity.units', envelope => { envelope.capacity.units = 5; }]
]) {
  test(`C002 retains its original OUT_OF_RANGE error for ${metric}`, async () => {
    const request = copy(fixtures.local);
    mutate(request.envelopeRequest.envelope);
    await rejected(request, 'OUT_OF_RANGE', `envelopeRequest.envelope.${metric}`);
  });
}

test('missing limits and forbidden actions preserve C002/C001 errors, not hidden defaults', async () => {
  const missing = copy(fixtures.local);
  delete missing.envelopeRequest.limits;
  await rejected(missing, 'REQUIRED_FIELD', 'envelopeRequest.limits');
  const native = copy(fixtures.local);
  native.envelopeRequest.envelope.action = 'native.execute';
  await rejected(native, 'LIVE_AZURE_NOT_APPROVED', 'envelopeRequest.envelope.action');
  const runs = copy(fixtures.local);
  runs.envelopeRequest.envelope.scope.liveAzureRuns = 1;
  await rejected(runs, 'SCOPE_ESCALATION', 'envelopeRequest.envelope.scope.liveAzureRuns');
  const cost = copy(fixtures.local);
  cost.envelopeRequest.envelope.budget.cloudSpend = 1;
  await rejected(cost, 'OUT_OF_RANGE', 'envelopeRequest.envelope.budget.cloudSpend');
});

test('approval is explicit and unchanged; missing or changed C001 approval fails', async () => {
  for (const candidate of [undefined, null, { ...approval, expenditureApproved: true }]) {
    const result = await buildPlan(fixtures.local, candidate);
    assert.equal(result.valid, false);
    assert.equal(result.plan, null);
    assert.ok(result.errors.some(error => error.path.startsWith('approval')));
  }
});

test('no getter, class, symbol or nonenumerable field is silently accepted', async () => {
  let getterCalls = 0;
  const getter = copy(fixtures.local);
  Object.defineProperty(getter.resources, 'description', { enumerable: true, get() { getterCalls++; return 'not read'; } });
  await rejected(getter, 'DATA_PROPERTY_REQUIRED', 'resources.description');
  assert.equal(getterCalls, 0);
  const symbol = copy(fixtures.local);
  symbol[Symbol('approval')] = true;
  await rejected(symbol, 'NON_JSON_PROPERTY', '$');
  const hidden = copy(fixtures.local);
  Object.defineProperty(hidden, 'durationBasis', { value: 'hidden', enumerable: false });
  await rejected(hidden, 'DATA_PROPERTY_REQUIRED', '$.durationBasis');
  await rejected(new (class Plan {})(), 'INVALID_SHAPE', '$');
  await rejected(null, 'INVALID_SHAPE', '$');
});

test('successful plans are frozen copies, not retained caller data; fingerprints change with assumptions', async () => {
  const input = copy(fixtures.local);
  const first = await buildPlan(input, approval);
  input.resources.description = 'Edited after review';
  input.envelopeRequest.limits.durationSeconds.max = 100;
  assert.equal(first.plan.resources.description, fixtures.local.resources.description);
  assert.deepEqual(first.plan.duration.suppliedBounds, { min: 1, max: 300 });
  assert.ok(Object.isFrozen(first.plan.resources));
  assert.ok(Object.isFrozen(first.plan.comparisonLimits.load));
  const second = await buildPlan(input, approval);
  assert.equal(second.valid, true);
  assert.notEqual(first.plan.inputFingerprint, second.plan.inputFingerprint);
});

test('acknowledgement requires exact true and a current valid review; invalid reviews revoke prior consent', async () => {
  const session = createReviewSession();
  assert.equal(session.acknowledge(true).accepted, false);
  await session.review(fixtures.local, approval);
  for (const confirmation of [undefined, null, false, 1, 'true', {}, []]) {
    const result = session.acknowledge(confirmation);
    assert.equal(result.accepted, false);
    assert.equal(result.consent, null);
    assert.equal(result.reasons[0].code, 'CONFIRMATION_REQUIRED');
  }
  assert.equal(session.acknowledge(true).accepted, true);
  assert.ok(Object.isFrozen(session.snapshot().consent));
  await session.review(fixtures.local, approval);
  assert.equal(session.snapshot().consent, null);
  assert.equal(session.acknowledge(true).accepted, true);
  await session.review({}, approval);
  assert.equal(session.snapshot().consent, null);
  assert.equal(session.acknowledge(true).accepted, false);
});

test('an edit during asynchronous review discards stale results and cannot recreate consent', async () => {
  const session = createReviewSession();
  const pending = session.review(fixtures.local, approval);
  assert.equal(session.snapshot().pending, true);
  assert.equal(session.acknowledge(true).accepted, false);
  session.invalidate();
  const result = await pending;
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, 'STALE_REVIEW');
  assert.equal(session.snapshot().review, null);
  assert.equal(session.snapshot().consent, null);
});

test('overlapping reviews cannot let an old local plan replace a newer blocked native plan', async () => {
  const session = createReviewSession();
  const old = session.review(fixtures.local, approval);
  const current = session.review(fixtures.native, approval);
  const [discarded, blocked] = await Promise.all([old, current]);
  assert.equal(discarded.errors[0].code, 'STALE_REVIEW');
  assert.equal(blocked.outcome, 'blocked-plan');
  assert.equal(session.snapshot().review, blocked);
  assert.equal(session.acknowledge(true).accepted, false);
});
