'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const probeModule = require('../probe.cjs');
const snapshot = require('../approved-contract.js');

const { evaluateCurrentApproval } = probeModule;
const codes = (result) => result.reasons.map((reason) => reason.code);
const approval = JSON.stringify(snapshot.approval);
const approved = `{"approvals":{"C001":${approval}}}`;
const SECRET = 'k-c001-secret-detail';
const SOURCE_MESSAGE = 'Cannot read current approvals.C001 from .docs\\wiki\\flow-state.json; all operations are denied.';
const fails = (value) => () => { throw value; };

test('the module exports exactly one frozen function', () => {
  assert.deepEqual(Object.keys(probeModule), ['evaluateCurrentApproval']);
  assert.equal(Object.isFrozen(probeModule), true);
  assert.equal(typeof evaluateCurrentApproval, 'function');
});

test('the reader is called exactly once per probe, with no arguments', async () => {
  const calls = [];
  const reader = (...args) => { calls.push(args); return approved; };
  assert.equal((await evaluateCurrentApproval('local.summary', reader)).allowed, true);
  assert.deepEqual(calls, [[]]);
  assert.equal((await evaluateCurrentApproval('native.execute', reader)).allowed, false);
  assert.equal(calls.length, 2);
});

test('the approved record allows exactly local.summary and local.probe and carries the zero limits', async () => {
  for (const action of ['local.summary', 'local.probe']) {
    const result = await evaluateCurrentApproval(action, () => approved);
    assert.equal(result.action, action);
    assert.equal(result.allowed, true);
    assert.equal(result.approvalValid, true);
    assert.deepEqual(result.reasons, []);
    assert.equal(result.executed, false);
    assert.equal(result.nativeExecutionLimit, 0);
    assert.equal(result.authorizedCloudSpend, 0);
    assert.equal(result.nativeReady, false);
    assert.equal(result.productionRuntimeValidated, false);
    assert.deepEqual(result.unresolvedNativeChoices, ['OS', 'SKU', 'subscription', 'resource group', 'region']);
  }
});

test('with the approved record every other action is denied and never executed', async () => {
  const expected = {
    'native.execute': 'LIVE_AZURE_NOT_APPROVED', 'native.provision': 'LIVE_AZURE_NOT_APPROVED', 'iac.generate': 'IAC_GENERATION_NOT_APPROVED',
    'scaffold.generate': 'SCAFFOLD_NOT_APPROVED', 'deployment.execute': 'DEPLOYMENT_NOT_APPROVED',
    'identity.register': 'IDENTITY_REGISTRATION_NOT_APPROVED', 'spend.authorize': 'EXPENDITURE_NOT_APPROVED', 'local.other': 'UNKNOWN_ACTION'
  };
  for (const [action, code] of Object.entries(expected)) {
    const result = await evaluateCurrentApproval(action, () => approved);
    assert.equal(result.allowed, false, action);
    assert.equal(result.executed, false, action);
    assert.equal(codes(result)[0], code, action);
  }
  const lookalike = { toString: () => 'local.summary' };
  for (const action of [undefined, null, 42, lookalike, ['local.summary']]) {
    const result = await evaluateCurrentApproval(action, () => approved);
    assert.equal(result.allowed, false);
    assert.equal(result.action, null);
    assert.equal(codes(result)[0], 'UNKNOWN_ACTION');
  }
});

test('the class of a reader failure picks the source reason: a SyntaxError or bad text is invalid JSON, anything else is unavailable', async () => {
  const cases = [
    [fails(new SyntaxError('bad')), 'SOURCE_INVALID_JSON'], [() => '', 'SOURCE_INVALID_JSON'], [() => undefined, 'SOURCE_INVALID_JSON'],
    [() => '{"approvals"', 'SOURCE_INVALID_JSON'], [fails(new TypeError('bad')), 'SOURCE_UNAVAILABLE'],
    [fails(new Error('bad')), 'SOURCE_UNAVAILABLE'], [fails('plain text'), 'SOURCE_UNAVAILABLE'], [fails(null), 'SOURCE_UNAVAILABLE']
  ];
  for (const [reader, code] of cases) {
    const result = await evaluateCurrentApproval('local.summary', reader);
    assert.deepEqual(codes(result), [code, 'APPROVAL_MISSING'], code);
    assert.equal(result.allowed, false);
  }
});

test('a source failure is a frozen answer: the source reason first, the guard reasons after it, no thrown text echoed', async () => {
  const result = await evaluateCurrentApproval('local.summary', fails(new Error(`EACCES ${SECRET}`)));
  assert.equal(result.action, 'local.summary');
  assert.equal(result.allowed, false);
  assert.equal(result.executed, false);
  assert.equal(result.approvalValid, false);
  assert.deepEqual(result.reasons[0], { code: 'SOURCE_UNAVAILABLE', message: SOURCE_MESSAGE });
  assert.equal(JSON.stringify(result).includes(SECRET), false);
  for (const frozen of [result, result.reasons, result.reasons[0]]) assert.equal(Object.isFrozen(frozen), true);
  const restricted = await evaluateCurrentApproval('native.execute', fails(new Error('unavailable')));
  assert.deepEqual(codes(restricted), ['SOURCE_UNAVAILABLE', 'APPROVAL_MISSING', 'LIVE_AZURE_NOT_APPROVED', 'LOCAL_ONLY',
    'ZERO_NATIVE_LIMIT', 'CLOUD_SPEND_FORBIDDEN', 'NATIVE_TARGET_UNAPPROVED']);
});

test('an inherited, nested, mis-keyed, array or primitive approval is never authority', async () => {
  const texts = [
    `{"approvals":{"__proto__":{"C001":${approval}}}}`, `{"approvals":[${approval}]}`, `{"approvals":{"C001":[${approval}]}}`,
    `{"approvals":"C001"}`, `[${approved}]`, `{"approval":{"C001":${approval}}}`, `{"approvals":{"c001":${approval}}}`,
    `{"approvals":{"C001 ":${approval}}}`, '{"approvals":{"C001":true}}', '{"approvals":{"C001":1}}', '{"approvals":null}', '{"approvals":0}'
  ];
  for (const text of texts) {
    const result = await evaluateCurrentApproval('local.summary', () => text);
    assert.equal(result.allowed, false, text);
    assert.deepEqual(codes(result), ['APPROVAL_MISSING'], text);
  }
});
