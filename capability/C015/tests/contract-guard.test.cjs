'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const snapshot = require('..\\..\\C001\\approved-contract.js');
const c002 = require('..\\..\\C002\\synthetic-fixture.js');
const { makeState, validateState, makePersisted, validatePersisted, parseStored, digest } = require('..\\contract.cjs');
const { scopedApproval, evaluateApprovals, requireCurrentConsent } = require('..\\consent.cjs');
const { resolveNamespace } = require('..\\paths.cjs');
const { newScratch } = require('./scratch.cjs');

function approvals() {
  return { C001: structuredClone(snapshot.approval), C015: structuredClone(scopedApproval) };
}

test('current consent is actually reread under the state mutex and both explicit approvals agree', async () => {
  const current = await requireCurrentConsent();
  assert.deepEqual(current.C001, snapshot.approval);
  assert.deepEqual(current.C015, scopedApproval);
  assert.equal(current.authority.executed, false);
});

test('literal false, missing and string true deny each current approval without coercion', async () => {
  for (const card of ['C001', 'C015']) {
    for (const value of [false, undefined, 'true', 1, null]) {
      const current = approvals();
      const key = card === 'C001' ? 'designAndLocalImplementationApproved' : 'approved';
      if (value === undefined) delete current[card][key];
      else current[card][key] = value;
      await assert.rejects(evaluateApprovals(current), (error) =>
        error.code === (card === 'C001' ? 'LOCAL_CONSENT_REQUIRED' : 'SCOPED_C015_APPROVAL_REQUIRED'));
    }
  }
});

test('missing approval records, altered scope, native spend and additional flags deny', async () => {
  for (const card of ['C001', 'C015']) {
    const current = approvals();
    current[card] = null;
    await assert.rejects(evaluateApprovals(current));
  }
  for (const [key, value] of [
    ['scope', 'all files'], ['realUserData', true], ['credentials', true],
    ['cloudProvisioning', true], ['deployment', true], ['spend', true],
    ['plannedAzureTablesArchitectureChanged', true], ['productionNode24Validated', true],
  ]) {
    const current = approvals();
    current.C015[key] = value;
    await assert.rejects(evaluateApprovals(current), { code: 'SCOPED_C015_APPROVAL_DRIFT' });
  }
  const extra = approvals();
  extra.C015.visitorOverride = true;
  await assert.rejects(evaluateApprovals(extra), { code: 'CLOSED_SCHEMA' });
  const changed = approvals();
  changed.C001.expenditureApproved = true;
  await assert.rejects(evaluateApprovals(changed), { code: 'C001_CONSENT_DENIED' });
});

test('the C015 runtime has no approval override and denied current consent precedes every fixture write', async () => {
  const writes = [];
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'store.cjs'), 'utf8');
  const fakeFs = new Proxy(fs, {
    get(target, property) {
      if (['mkdirSync', 'openSync', 'writeFileSync', 'renameSync', 'unlinkSync', 'fsyncSync'].includes(property)) {
        return (...args) => { writes.push({ property, args }); throw new Error('A fixture mutation must never be reached.'); };
      }
      return target[property];
    },
  });
  for (const card of ['C001', 'C015']) {
    for (const value of [false, undefined, 'true']) {
      const current = approvals();
      const key = card === 'C001' ? 'designAndLocalImplementationApproved' : 'approved';
      if (value === undefined) delete current[card][key];
      else current[card][key] = value;
      const module = { exports: {} };
      const load = new Function('require', 'module', 'process', 'Buffer', source);
      load((specifier) => {
          if (specifier === 'node:fs') return fakeFs;
          if (specifier === './consent.cjs') return { requireCurrentConsent: () => evaluateApprovals(current) };
          if (specifier.startsWith('node:')) return require(specifier);
          return require(path.resolve(__dirname, '..', specifier));
      }, module, process, Buffer);
      const scratch = newScratch();
      await assert.rejects(module.exports.persist(scratch.namespace, makeState('synthetic-run-001', 1)), {
        code: card === 'C001' ? 'LOCAL_CONSENT_REQUIRED' : 'SCOPED_C015_APPROVAL_REQUIRED',
      });
      assert.deepEqual(writes, []);
    }
  }
});

test('current approval is rechecked immediately at the mutation boundary, not cached from initial validation', async () => {
  let checks = 0;
  let writes = 0;
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'store.cjs'), 'utf8');
  const module = { exports: {} };
  const load = new Function('require', 'module', 'process', 'Buffer', source);
  load((specifier) => {
    if (specifier === 'node:fs') return new Proxy(fs, {
      get(target, key) {
        if (['mkdirSync', 'openSync', 'writeFileSync', 'renameSync', 'unlinkSync'].includes(key)) {
          return () => { writes++; throw new Error('Must not mutate after consent changes.'); };
        }
        return target[key];
      },
    });
    if (specifier === './consent.cjs') return { requireCurrentConsent: () => {
      const current = approvals();
      if (++checks > 1) current.C015.approved = false;
      return evaluateApprovals(current);
    } };
    return specifier.startsWith('node:') ? require(specifier) : require(path.resolve(__dirname, '..', specifier));
  }, module, process, Buffer);
  await assert.rejects(module.exports.persist(newScratch().namespace, makeState('synthetic-run-001', 1)), {
    code: 'SCOPED_C015_APPROVAL_REQUIRED',
  });
  assert.equal(checks, 2);
  assert.equal(writes, 0);
});

test('valid state consumes the C002 versioned envelope and copies only closed synthetic records', async () => {
  const state = makeState('synthetic-run-001', 2);
  const result = await validateState(state, snapshot.approval);
  assert.deepEqual(result.envelope, c002.envelope);
  assert.deepEqual(result.limits, c002.limits);
  assert.deepEqual(result, state);
  assert.notEqual(result, state);
  const persisted = makePersisted(result, 'a'.repeat(64));
  assert.deepEqual(await validatePersisted(persisted, snapshot.approval, 'a'.repeat(64)), persisted);
  assert.equal(persisted.acknowledgment.stateSha256, digest(state));
});

test('unknown IDs, traversal, namespaces, epochs and numeric coercion fail closed', () => {
  for (const namespace of ['..', '..\\C001', 'C001', 'C:\\outside', 'test-arbitrary', '', null, 1]) {
    assert.throws(() => resolveNamespace(namespace), { code: 'UNKNOWN_FIXTURE_ID' });
  }
  for (const runId of ['..\\C001', 'real-user', 'synthetic-run-003', '', undefined]) {
    assert.throws(() => makeState(runId, 1), { code: 'UNKNOWN_RUN_ID' });
  }
  for (const epoch of [-0, 0, 4, 1.5, '1', true, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => makeState('synthetic-run-001', epoch), { code: 'UNKNOWN_EPOCH' });
  }
});

test('wrong types, extra fields, getters, cycles and non-synthetic data are not serialized', async () => {
  const cases = [
    (state) => { state.extra = true; },
    (state) => { state.record.extra = true; },
    (state) => { state.record.status = 'real-user-data'; },
    (state) => { state.schemaVersion = '1'; },
    (state) => { state.record.acknowledgedUnits = '1'; },
    (state) => { state.envelope.scope.liveAzureRuns = 1; },
    (state) => { state.envelope.budget.cloudSpend = 1; },
    (state) => { state.envelope.target = 'unknown'; },
    (state) => { state.limits.capacity.units.max = '4'; },
    (state) => { state.record.self = state; },
    (state) => { Object.defineProperty(state.record, 'hidden', { value: 1 }); },
    (state) => { state.record[Symbol('extra')] = 1; },
    (state) => { Object.defineProperty(state.record, 'status', { get() { throw new Error('Getter must not execute'); }, enumerable: true }); },
  ];
  for (const change of cases) {
    const state = makeState('synthetic-run-001', 1);
    change(state);
    await assert.rejects(validateState(state, snapshot.approval));
  }
});

test('text parsing rejects duplicates, precision loss, invalid UTF8 and corrupt data before schema validation', () => {
  for (const text of [
    '{"formatVersion":1,"formatVersion":1}', '{"epoch":1.00000000000000001}',
    '{"epoch":-0}', '{"epoch":1e-1000}', '{partial',
  ]) assert.throws(() => parseStored(Buffer.from(text)), { code: 'CORRUPT_JSON' });
  assert.throws(() => parseStored(Buffer.from([0xff])), { code: 'INVALID_UTF8' });
});
