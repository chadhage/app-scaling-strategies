'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash, webcrypto } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const snapshot = require('../approved-contract.js');
const guard = require('../contract-guard.js');

const copy = () => structuredClone(snapshot.approval);
const codes = (result) => result.reasons.map((reason) => reason.code);
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

test('approved artifact exactly records current operator approval and source', () => {
  const state = JSON.parse(readFileSync(resolve(__dirname, '..', '..', '..', '.docs', 'wiki', 'flow-state.json'), 'utf8'));
  assert.deepEqual(snapshot.approval, state.approvals.C001);
  assert.equal(snapshot.source.commit, '26747d4fbbd51235c612dbd9d8c92ab335aef78e');
  assert.equal(snapshot.source.selector, 'approvals.C001');
  assert.equal(snapshot.cardId, 'C001');
  assert.equal(snapshot.parentId, 'H001');
  assert.equal(snapshot.kano, 'D');
});

test('approved artifact is recursively immutable', () => {
  function check(value) {
    if (!value || typeof value !== 'object') return;
    assert.ok(Object.isFrozen(value));
    Object.values(value).forEach(check);
  }
  check(snapshot);
  assert.throws(() => { snapshot.approval.runtime = 'visitor runtime'; }, TypeError);
  assert.throws(() => { snapshot.approval.controlStorage.push('other'); }, TypeError);
});

test('approved artifact is pinned independently by a SHA-256 fingerprint', () => {
  assert.equal(guard.snapshotSha256, createHash('sha256').update(canonical(snapshot)).digest('hex'));
});

test('valid operator snapshot allows only local probes', async () => {
  const validation = await guard.validateApproval(copy());
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.reasons, []);
  for (const action of ['local.summary', 'local.probe']) {
    const result = await guard.guardOperation(action, copy());
    assert.equal(result.allowed, true, `${action} must be allowed with exact operator consent`);
    assert.equal(result.executed, false);
    assert.equal(result.nativeExecutionLimit, 0);
    assert.equal(result.authorizedCloudSpend, 0);
    assert.equal(result.nativeReady, false);
    assert.equal(result.productionRuntimeValidated, false);
  }
});

test('native choices stay unresolved without inferring OS from App Service Linux', async () => {
  const result = await guard.validateApproval(copy());
  assert.deepEqual(result.unresolvedNativeChoices, ['OS', 'SKU', 'subscription', 'resource group', 'region']);
  assert.equal(result.nativeReady, false);
  assert.equal(snapshot.approval.hosting, 'App Service Linux');
  assert.equal(snapshot.approval.operatingEnvelope.nativeTargetQualified, false);
  assert.equal(result.productionRuntimeValidated, false);
});

const denied = [
  ['native.execute', 'LIVE_AZURE_NOT_APPROVED'],
  ['native.provision', 'LIVE_AZURE_NOT_APPROVED'],
  ['iac.generate', 'IAC_GENERATION_NOT_APPROVED'],
  ['scaffold.generate', 'SCAFFOLD_NOT_APPROVED'],
  ['deployment.execute', 'DEPLOYMENT_NOT_APPROVED'],
  ['identity.register', 'IDENTITY_REGISTRATION_NOT_APPROVED'],
  ['spend.authorize', 'EXPENDITURE_NOT_APPROVED']
];

for (const [action, reason] of denied) {
  test(`${action} is denied with explicit zero limits and approval reasons`, async () => {
    const result = await guard.guardOperation(action, copy());
    assert.equal(result.allowed, false);
    assert.equal(result.executed, false);
    assert.ok(codes(result).includes(reason), JSON.stringify(result));
    assert.ok(codes(result).includes('LOCAL_ONLY'));
    assert.ok(codes(result).includes('ZERO_NATIVE_LIMIT'));
    assert.ok(codes(result).includes('CLOUD_SPEND_FORBIDDEN'));
    assert.ok(codes(result).includes('NATIVE_TARGET_UNAPPROVED'));
    assert.equal(result.nativeExecutionLimit, 0);
    assert.equal(result.authorizedCloudSpend, 0);
    assert.equal(result.nativeReady, false);
    assert.match(result.reasons.find((item) => item.code === 'CLOUD_SPEND_FORBIDDEN').message, /forbidden.*not.*free/i);
  });
}

test('unknown, malformed, and prototype-named actions always deny', async () => {
  for (const action of ['visitor.approve', 'local.delete', 'native', 'constructor', 'toString', '__proto__', '', null, undefined, 0, { approved: true }]) {
    const result = await guard.guardOperation(action, copy());
    assert.equal(result.allowed, false);
    assert.equal(result.executed, false);
    assert.ok(codes(result).includes('UNKNOWN_ACTION'));
  }
});

test('missing approval never silently defaults to the approved snapshot', async () => {
  for (const candidate of [undefined, null, false, 1, '', []]) {
    for (const action of ['local.probe', 'native.execute']) {
      const result = await guard.guardOperation(action, candidate);
      assert.equal(result.allowed, false);
      assert.ok(codes(result).includes('APPROVAL_MISSING'));
    }
  }
});

test('visitor approved=true and copied approval with extra flags confer no authority', async () => {
  for (const candidate of [{ approved: true }, { ...copy(), approved: true }]) {
    for (const action of ['local.probe', 'native.execute']) {
      const result = await guard.guardOperation(action, candidate);
      assert.equal(result.allowed, false);
      assert.ok(codes(result).includes('APPROVAL_DRIFT'));
    }
  }
});

test('every selected design choice must be present and resolved', async () => {
  const fields = ['status', 'approvedAtUtc', 'decisionOwner', 'frontend', 'runtime', 'framework', 'hosting', 'authentication', 'authorization', 'firstNativeHost', 'firstNativeConfiguration', 'preferredIacFormat', 'testTooling'];
  for (const field of fields) {
    const missing = copy();
    delete missing[field];
    let result = await guard.guardOperation('local.summary', missing);
    assert.equal(result.allowed, false, `missing ${field}`);
    assert.ok(result.reasons.some((reason) => reason.code === 'CHOICE_MISSING' && reason.path === field));
    for (const value of ['', '  ', null, 'TBD', 'unknown', 'unresolved']) {
      const unresolved = copy();
      unresolved[field] = value;
      result = await guard.guardOperation('local.summary', unresolved);
      assert.equal(result.allowed, false, `unresolved ${field}`);
      assert.ok(result.reasons.some((reason) => reason.code === 'CHOICE_UNRESOLVED' && reason.path === field));
    }
  }
});

test('selected runtime drift cannot pass local or native probes', async () => {
  const changed = copy();
  changed.runtime = 'Node.js 22.23.4';
  for (const action of ['local.probe', 'native.execute']) {
    const result = await guard.guardOperation(action, changed);
    assert.equal(result.allowed, false);
    assert.ok(result.reasons.some((reason) => reason.code === 'APPROVAL_DRIFT' && reason.path === 'runtime'));
  }
});

test('visitor changes to approval flags are rejected against the snapshot', async () => {
  for (const field of ['designAndLocalImplementationApproved', 'liveAzureExecutionApproved', 'iacGenerationApproved', 'scaffoldApproved', 'deploymentApproved', 'identityRegistrationApproved', 'expenditureApproved']) {
    const changed = copy();
    changed[field] = !changed[field];
    const result = await guard.guardOperation('local.probe', changed);
    assert.equal(result.allowed, false);
    assert.ok(result.reasons.some((reason) => reason.code === 'APPROVAL_DRIFT' && reason.path === field));
  }
});

test('missing flags, changed storage, and altered envelope fail closed', async () => {
  const changes = [
    (value) => { delete value.expenditureApproved; },
    (value) => { value.controlStorage.reverse(); },
    (value) => { value.controlStorage = []; },
    (value) => { delete value.operatingEnvelope; },
    (value) => { value.operatingEnvelope.maximumLiveAzureRuns = 1; },
    (value) => { value.operatingEnvelope.authorizedCloudSpend = 1; },
    (value) => { value.operatingEnvelope.authorizedCloudSpend = '0'; },
    (value) => { value.operatingEnvelope.nativeTargetQualified = true; },
    (value) => { value.operatingEnvelope.mode = 'native'; },
    (value) => { value.operatingEnvelope.region = 'visitor-selected'; }
  ];
  for (const change of changes) {
    const changed = copy();
    change(changed);
    const result = await guard.guardOperation('local.probe', changed);
    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes('APPROVAL_DRIFT'));
  }
});

test('cyclic, non-JSON, and throwing approval inputs deny rather than crash', async () => {
  const cyclic = copy();
  cyclic.loop = cyclic;
  const throwing = new Proxy({}, { ownKeys() { throw new Error('untrusted input'); } });
  for (const value of [cyclic, { runtime: 1n }, throwing]) {
    const result = await guard.guardOperation('local.probe', value);
    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes('APPROVAL_INVALID'));
  }
});

function browserGuard(artifact, crypto = webcrypto) {
  const context = vm.createContext({ C001ApprovedContract: artifact, crypto, TextEncoder });
  vm.runInContext(readFileSync(resolve(__dirname, '..', 'contract-guard.js'), 'utf8'), context);
  return context.C001ContractGuard;
}

test('missing or drifted bundled authority cannot approve a matching visitor input', async () => {
  let result = await browserGuard(undefined).guardOperation('local.probe', copy());
  assert.equal(result.allowed, false);
  assert.ok(codes(result).includes('SNAPSHOT_UNAVAILABLE'));
  const changed = structuredClone(snapshot);
  changed.approval.decisionOwner = 'visitor';
  result = await browserGuard(changed).guardOperation('local.probe', changed.approval);
  assert.equal(result.allowed, false);
  assert.ok(codes(result).includes('SNAPSHOT_DRIFT'));
});

test('unavailable integrity checking fails closed', async () => {
  const result = await browserGuard(snapshot, null).guardOperation('local.probe', copy());
  assert.equal(result.allowed, false);
  assert.ok(codes(result).includes('INTEGRITY_UNAVAILABLE'));
});

test('guard decisions and reason arrays are immutable', async () => {
  const result = await guard.guardOperation('native.execute', copy());
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.reasons));
  assert.ok(Object.isFrozen(result.reasons[0]));
  assert.throws(() => { result.allowed = true; }, TypeError);
});
