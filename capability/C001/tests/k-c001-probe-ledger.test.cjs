'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { resolve } = require('node:path');
const { snapshot, ledgerPath, SECRET, ledgerOf, approved, codes, run, runAll, decisionOf } = require('./fixtures/k-c001-run-probe.cjs');

// The real probe.cjs runs as a child whose reads of .docs\wiki\flow-state.json are served from memory: the live ledger is never read.
const LONG = { timeout: 180000 };
const drifted = (change) => {
  const approval = structuredClone(snapshot.approval);
  change(approval);
  return ledgerOf(approval);
};
const LOCAL_ONLY = ['LOCAL_ONLY', 'ZERO_NATIVE_LIMIT', 'CLOUD_SPEND_FORBIDDEN', 'NATIVE_TARGET_UNAPPROVED'];
const SOURCE_MESSAGE = 'Cannot read current approvals.C001 from .docs\\wiki\\flow-state.json; all operations are denied.';

test('approved ledger: local.summary and local.probe are allowed, nothing is executed, limits are zero', LONG, async () => {
  const actions = ['local.summary', 'local.probe'];
  const results = await runAll(actions.map((action) => [[action], { text: approved }]));
  results.forEach((result, index) => {
    assert.equal(result.status, 0, actions[index]);
    const decision = decisionOf(result);
    assert.equal(decision.action, actions[index]);
    assert.equal(decision.allowed, true);
    assert.equal(decision.approvalValid, true);
    assert.deepEqual(decision.reasons, []);
    assert.equal(decision.nativeReady, false);
    assert.equal(decision.productionRuntimeValidated, false);
  });
});

const RESTRICTED = [
  ['native.execute', 'LIVE_AZURE_NOT_APPROVED'], ['native.provision', 'LIVE_AZURE_NOT_APPROVED'],
  ['iac.generate', 'IAC_GENERATION_NOT_APPROVED'], ['scaffold.generate', 'SCAFFOLD_NOT_APPROVED'],
  ['deployment.execute', 'DEPLOYMENT_NOT_APPROVED'], ['identity.register', 'IDENTITY_REGISTRATION_NOT_APPROVED'],
  ['spend.authorize', 'EXPENDITURE_NOT_APPROVED'], ['local.other', 'UNKNOWN_ACTION'], ['LOCAL.SUMMARY', 'UNKNOWN_ACTION']
];

test('approved ledger: every restricted or unknown action is denied with its own reason before the fixed local-only reasons', LONG, async () => {
  const results = await runAll(RESTRICTED.map(([action]) => [[action], { text: approved }]));
  results.forEach((result, index) => {
    const [action, code] = RESTRICTED[index];
    assert.equal(result.status, 1, action);
    const decision = decisionOf(result);
    assert.equal(decision.action, action);
    assert.equal(decision.allowed, false, action);
    assert.equal(decision.approvalValid, true, action);
    assert.deepEqual(codes(decision), [code, ...LOCAL_ONLY], action);
  });
});

const DEFECTS = [
  ['drifted runtime', { text: drifted((approval) => { approval.runtime = 'Node.js 22.23.4'; }) }, ['APPROVAL_DRIFT']],
  ['visitor approved flag', { text: drifted((approval) => { approval.approved = true; }) }, ['APPROVAL_DRIFT']],
  ['no approvals section', { text: '{}' }, ['APPROVAL_MISSING']],
  ['null ledger', { text: 'null' }, ['APPROVAL_MISSING']],
  ['approval is an array', { text: '{"approvals":{"C001":[]}}' }, ['APPROVAL_MISSING']],
  ['approval is text', { text: '{"approvals":{"C001":"approved"}}' }, ['APPROVAL_MISSING']],
  ['approval under another key', { text: approved.replace('"C001"', '"C002"') }, ['APPROVAL_MISSING']],
  ['invalid JSON', { text: '{' }, ['SOURCE_INVALID_JSON', 'APPROVAL_MISSING']],
  ['blank ledger', { text: ' ' }, ['SOURCE_INVALID_JSON', 'APPROVAL_MISSING']],
  ['missing ledger file', { error: 'ENOENT' }, ['SOURCE_UNAVAILABLE', 'APPROVAL_MISSING']],
  ['unreadable ledger file', { error: 'EACCES' }, ['SOURCE_UNAVAILABLE', 'APPROVAL_MISSING']]
];

test('every ledger defect denies local.summary with the ledger reason first, one fixed message and no leaked error text', LONG, async () => {
  const results = await runAll(DEFECTS.map(([, setup]) => [['local.summary'], setup]));
  results.forEach((result, index) => {
    const [label, , expected] = DEFECTS[index];
    assert.equal(result.status, 1, label);
    const decision = decisionOf(result);
    assert.equal(decision.allowed, false, label);
    assert.equal(decision.approvalValid, false, label);
    assert.deepEqual(codes(decision), expected, label);
    if (expected[0].startsWith('SOURCE_')) assert.equal(decision.reasons[0].message, SOURCE_MESSAGE, label);
    assert.equal(result.stdout.includes(SECRET), false, label);
  });
});

test('the command line asks for .docs\\wiki\\flow-state.json under the repository root and nowhere else', LONG, async () => {
  const [asked, elsewhere] = await Promise.all([
    run(['local.summary'], { text: approved }),
    run(['local.summary'], { text: approved, ledger: resolve(ledgerPath, '..', 'other', 'flow-state.json') })
  ]);
  assert.equal(asked.status, 0);
  assert.equal(decisionOf(asked).allowed, true);
  assert.equal(elsewhere.status, 1);
  assert.deepEqual(codes(decisionOf(elsewhere)), ['SOURCE_UNAVAILABLE', 'APPROVAL_MISSING']);
});
