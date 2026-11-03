'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('../synthetic-fixture.js');
const snapshot = require('../../C001/approved-contract.js');
const { validateRunEnvelope } = require('../validator.js');

const fresh = () => structuredClone(fixture);
const approval = () => structuredClone(snapshot.approval);
const at = (object, path) => path.split('.').reduce((value, key) => value[key], object);
function set(object, path, value) {
  const keys = path.split('.');
  at(object, keys.slice(0, -1).join('.'))[keys.at(-1)] = value;
}
function hasError(result, path, code) {
  assert.equal(result.valid, false);
  assert.equal(result.outcome, 'rejected');
  assert.equal(result.executed, false);
  assert.equal(result.validatedEnvelope, null);
  assert.equal(result.appliedLimits, null);
  assert.ok(result.errors.some((error) => error.path === path && (!code || error.code === code)),
    `Expected ${path} ${code || ''}; got ${JSON.stringify(result.errors)}`);
}

test('accepts the explicit in-range local envelope without executing anything', async () => {
  const input = fresh();
  const result = await validateRunEnvelope(input, approval());
  assert.equal(result.valid, true);
  assert.equal(result.outcome, 'valid-local-envelope');
  assert.equal(result.executed, false);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.validatedEnvelope, input.envelope);
  assert.deepEqual(result.appliedLimits, input.limits);
  assert.notEqual(result.validatedEnvelope, input.envelope);
  assert.equal(result.authority.allowed, true);
  assert.equal(result.authority.executed, false);
  assert.equal(result.authority.nativeExecutionLimit, 0);
  assert.equal(result.authority.authorizedCloudSpend, 0);
  assert.equal(result.authority.nativeReady, false);
  assert.equal(result.authority.productionRuntimeValidated, false);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.appliedLimits.load.requestsPerSecond));
  assert.ok(Object.isFrozen(result.validatedEnvelope.scope));
});

const metrics = [
  'load.requestsPerSecond', 'load.concurrentUsers', 'durationSeconds',
  'capacity.units', 'budget.cloudSpend'
];

test('uses inclusive supplied bounds for every metric and rejects both sides', async (t) => {
  for (const metric of metrics) {
    const range = at(fixture.limits, metric);
    for (const [label, value, valid] of [
      ['minimum', range.min, true], ['maximum', range.max, true],
      ['below', range.min - 1, false], ['above', range.max + 1, false]
    ]) {
      await t.test(`${metric}: ${label}`, async () => {
        const input = fresh();
        set(input, `envelope.${metric}`, value);
        const result = await validateRunEnvelope(input, approval());
        if (valid) assert.equal(result.valid, true, JSON.stringify(result.errors));
        else {
          hasError(result, `envelope.${metric}`, 'OUT_OF_RANGE');
          const error = result.errors.find((item) => item.path === `envelope.${metric}` && item.code === 'OUT_OF_RANGE');
          assert.ok(error.message.includes(`[${range.min}, ${range.max}]`));
        }
      });
    }
  }
});

test('caller-supplied limits change comparisons and are never silently defaulted', async () => {
  const input = fresh();
  input.limits.load.requestsPerSecond.max = 7;
  hasError(await validateRunEnvelope(input, approval()), 'envelope.load.requestsPerSecond', 'OUT_OF_RANGE');
  input.envelope.load.requestsPerSecond = 7;
  assert.equal((await validateRunEnvelope(input, approval())).valid, true);
  delete input.limits;
  hasError(await validateRunEnvelope(input, approval()), 'limits', 'REQUIRED_FIELD');
  delete input.envelope;
  hasError(await validateRunEnvelope(input, approval()), 'envelope', 'REQUIRED_FIELD');
});

test('missing endpoints, inverted ranges, invalid domains and kinds are rejected', async (t) => {
  const cases = [
    ['limits.load.requestsPerSecond.min', undefined, 'REQUIRED_FIELD'],
    ['limits.durationSeconds.max', undefined, 'REQUIRED_FIELD'],
    ['limits.capacity.units.min', 5, 'INVALID_RANGE'],
    ['limits.durationSeconds.min', 0, 'INVALID_BOUND'],
    ['limits.kind', 'azure-authorized', 'CONSTANT_MISMATCH'],
    ['limits.label', '   ', 'INVALID_STRING'],
    ['limits.budget.cloudSpend.max', 1, 'SCOPE_ESCALATION'],
    ['limits.budget.cloudSpend.min', -1, 'INVALID_BOUND']
  ];
  for (const [path, value, code] of cases) {
    await t.test(path, async () => {
      const input = fresh();
      if (value === undefined) {
        const keys = path.split('.');
        delete at(input, keys.slice(0, -1).join('.'))[keys.at(-1)];
      } else set(input, path, value);
      hasError(await validateRunEnvelope(input, approval()), path, code);
    });
  }
});

test('rejects unsafe numeric values without coercion in metrics and bounds', async (t) => {
  const bad = ['10', true, null, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, 1n, new Number(1), -0];
  for (const path of [...metrics.map((metric) => `envelope.${metric}`), 'envelope.scope.liveAzureRuns', 'limits.load.requestsPerSecond.max']) {
    for (let index = 0; index < bad.length; index++) {
      await t.test(`${path}: unsafe case ${index}`, async () => {
        const input = fresh();
        set(input, path, bad[index]);
        const result = await validateRunEnvelope(input, approval());
        hasError(result, path, 'UNSAFE_NUMBER');
        assert.doesNotThrow(() => JSON.stringify(result));
      });
    }
  }
});

test('rejects non-record shapes at the root and every nested record', async (t) => {
  const paths = ['$', 'envelope', 'envelope.scope', 'envelope.load', 'envelope.capacity',
    'envelope.budget', 'limits', 'limits.load', 'limits.load.requestsPerSecond',
    'limits.load.concurrentUsers', 'limits.durationSeconds', 'limits.capacity',
    'limits.capacity.units', 'limits.budget', 'limits.budget.cloudSpend'];
  for (const path of paths) {
    for (const [index, bad] of [null, [], 'record', new Date(), new Map()].entries()) {
      await t.test(`${path}: shape ${index}`, async () => {
        const input = fresh();
        if (path !== '$') {
          if (path.includes('.')) set(input, path, bad);
          else input[path] = bad;
        }
        hasError(await validateRunEnvelope(path === '$' ? bad : input, approval()), path, 'INVALID_SHAPE');
      });
    }
  }
});

test('rejects unknown and missing fields at every record level', async (t) => {
  const paths = ['$', 'envelope', 'envelope.scope', 'envelope.load', 'envelope.capacity',
    'envelope.budget', 'limits', 'limits.load', 'limits.load.requestsPerSecond',
    'limits.load.concurrentUsers', 'limits.durationSeconds', 'limits.capacity',
    'limits.capacity.units', 'limits.budget', 'limits.budget.cloudSpend'];
  for (const path of paths) {
    await t.test(`${path}: unknown`, async () => {
      const input = fresh();
      (path === '$' ? input : at(input, path)).extra = true;
      hasError(await validateRunEnvelope(input, approval()), path === '$' ? 'extra' : `${path}.extra`, 'UNKNOWN_FIELD');
    });
    await t.test(`${path}: required`, async () => {
      const input = fresh();
      const object = path === '$' ? input : at(input, path);
      const key = Object.keys(object)[0];
      delete object[key];
      hasError(await validateRunEnvelope(input, approval()), path === '$' ? key : `${path}.${key}`, 'REQUIRED_FIELD');
    });
  }
});

test('does not execute accessors and rejects symbols, hidden and inherited fields', async () => {
  let reads = 0;
  const accessor = fresh();
  Object.defineProperty(accessor.envelope.load, 'requestsPerSecond', {
    enumerable: true, get() { reads++; return 10; }
  });
  hasError(await validateRunEnvelope(accessor, approval()), 'envelope.load.requestsPerSecond', 'DATA_PROPERTY_REQUIRED');
  assert.equal(reads, 0);

  const symbol = fresh();
  symbol.envelope[Symbol('scope')] = true;
  hasError(await validateRunEnvelope(symbol, approval()), 'envelope', 'NON_JSON_PROPERTY');

  const hidden = fresh();
  Object.defineProperty(hidden.limits, 'label', { value: 'hidden', enumerable: false });
  hasError(await validateRunEnvelope(hidden, approval()), 'limits.label', 'NON_JSON_PROPERTY');

  const inherited = fresh();
  Object.setPrototypeOf(inherited.envelope.scope, { liveAzureExecutionApproved: true });
  hasError(await validateRunEnvelope(inherited, approval()), 'envelope.scope', 'INVALID_SHAPE');

  const polluted = JSON.parse(JSON.stringify(fresh()).replace('"scope":', '"__proto__":{"approved":true},"scope":'));
  hasError(await validateRunEnvelope(polluted, approval()), 'envelope.__proto__', 'UNKNOWN_FIELD');
  assert.equal({}.approved, undefined);
});

test('reuses C001 consent checks; absent or changed authority never validates', async (t) => {
  const cases = [
    undefined, null, { approved: true },
    { ...approval(), runtime: 'Node.js 22' },
    { ...approval(), liveAzureExecutionApproved: true },
    { ...approval(), iacGenerationApproved: true },
    { ...approval(), scaffoldApproved: true },
    { ...approval(), deploymentApproved: true },
    { ...approval(), identityRegistrationApproved: true },
    { ...approval(), expenditureApproved: true },
    { ...approval(), operatingEnvelope: { ...approval().operatingEnvelope, authorizedCloudSpend: 1 } }
  ];
  for (const [index, candidate] of cases.entries()) {
    await t.test(`authority case ${index}`, async () => {
      const result = await validateRunEnvelope(fresh(), candidate);
      assert.equal(result.valid, false);
      assert.equal(result.executed, false);
      assert.equal(result.authority.approvalValid, false);
      assert.ok(result.errors.some((error) => error.path === 'approval' || error.path.startsWith('approval.')));
    });
  }
});

test('scope and bounds cannot promote local validation to an executed cloud action', async (t) => {
  const actions = [
    ['native.execute', 'LIVE_AZURE_NOT_APPROVED'],
    ['native.provision', 'LIVE_AZURE_NOT_APPROVED'],
    ['iac.generate', 'IAC_GENERATION_NOT_APPROVED'],
    ['scaffold.generate', 'SCAFFOLD_NOT_APPROVED'],
    ['deployment.execute', 'DEPLOYMENT_NOT_APPROVED'],
    ['identity.register', 'IDENTITY_REGISTRATION_NOT_APPROVED'],
    ['spend.authorize', 'EXPENDITURE_NOT_APPROVED'],
    ['visitor.approve', 'UNKNOWN_ACTION'],
    ['local.summary', 'CONSTANT_MISMATCH']
  ];
  for (const [action, code] of actions) {
    await t.test(action, async () => {
      const input = fresh();
      input.envelope.action = action;
      hasError(await validateRunEnvelope(input, approval()), 'envelope.action', code);
    });
  }
  for (const [path, value] of [
    ['envelope.scope.liveAzureRuns', 1], ['envelope.scope.mode', 'azure-live'],
    ['limits.budget.cloudSpend.max', 5]
  ]) {
    const input = fresh();
    set(input, path, value);
    hasError(await validateRunEnvelope(input, approval()), path, 'SCOPE_ESCALATION');
  }
  for (const field of ['approved', 'approval', 'region', 'tenant', 'sku', 'deploymentApproved', 'iacGenerationApproved']) {
    const input = fresh();
    input.envelope[field] = true;
    hasError(await validateRunEnvelope(input, approval()), `envelope.${field}`, 'UNKNOWN_FIELD');
  }
  assert.equal(snapshot.approval.liveAzureExecutionApproved, false);
  assert.equal(snapshot.approval.iacGenerationApproved, false);
  assert.equal(snapshot.approval.scaffoldApproved, false);
  assert.equal(snapshot.approval.deploymentApproved, false);
  assert.equal(snapshot.approval.identityRegistrationApproved, false);
  assert.equal(snapshot.approval.expenditureApproved, false);
});

test('schema and data remain immutable and validation never mutates the caller', async () => {
  const input = fresh();
  const before = structuredClone(input);
  const candidate = approval();
  const result = await validateRunEnvelope(input, candidate);
  assert.deepEqual(input, before);
  assert.deepEqual(candidate, snapshot.approval);
  input.envelope.durationSeconds = 9999;
  input.limits.durationSeconds.max = 9999;
  assert.equal(result.validatedEnvelope.durationSeconds, 30);
  assert.equal(result.appliedLimits.durationSeconds.max, 300);
  assert.equal(result.executed, false);
});
