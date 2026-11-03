'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const { evaluateCurrentApproval } = require('../probe.cjs');
const snapshot = require('../approved-contract.js');

const codes = (result) => result.reasons.map((reason) => reason.code);
const source = (approval) => () => JSON.stringify({ approvals: { C001: approval } });

test('local command reads actual operator authority by default', async () => {
  const result = await evaluateCurrentApproval('local.summary');
  assert.equal(result.allowed, true);
  assert.equal(result.executed, false);
});

test('unreadable current authority denies even local summary', async () => {
  const result = await evaluateCurrentApproval('local.summary', () => { throw new Error('unavailable'); });
  assert.equal(result.allowed, false);
  assert.equal(result.executed, false);
  assert.ok(codes(result).includes('SOURCE_UNAVAILABLE'));
  assert.ok(codes(result).includes('APPROVAL_MISSING'));
});

test('malformed current authority denies explicitly', async () => {
  const result = await evaluateCurrentApproval('local.summary', () => '{');
  assert.equal(result.allowed, false);
  assert.ok(codes(result).includes('SOURCE_INVALID_JSON'));
});

test('missing current approval denies without falling back to bundled consent', async () => {
  for (const text of ['{}', 'null', '{"approvals":{}}', '{"approvals":{"C001":null}}']) {
    const result = await evaluateCurrentApproval('local.summary', () => text);
    assert.equal(result.allowed, false);
    assert.ok(codes(result).includes('APPROVAL_MISSING'));
  }
});

test('changed source runtime, extra visitor approval, or live approval cannot pass', async () => {
  const changes = [
    (approval) => { approval.runtime = 'Node.js 22.23.4'; },
    (approval) => { approval.approved = true; },
    (approval) => { approval.liveAzureExecutionApproved = true; }
  ];
  for (const change of changes) {
    const approval = structuredClone(snapshot.approval);
    change(approval);
    for (const action of ['local.summary', 'native.execute']) {
      const result = await evaluateCurrentApproval(action, source(approval));
      assert.equal(result.allowed, false);
      assert.equal(result.executed, false);
      assert.ok(codes(result).includes('APPROVAL_DRIFT'));
    }
  }
});

test('current authority is read again for each probe', async () => {
  const approval = structuredClone(snapshot.approval);
  const read = source(approval);
  assert.equal((await evaluateCurrentApproval('local.probe', read)).allowed, true);
  approval.decisionOwner = 'visitor';
  assert.equal((await evaluateCurrentApproval('local.probe', read)).allowed, false);
});

test('CLI reports local allowance and native denial with useful exit codes', () => {
  const command = resolve(__dirname, '..', 'probe.cjs');
  for (const [action, expectedExit, allowed] of [['local.summary', 0, true], ['native.execute', 1, false], ['unknown', 1, false]]) {
    const result = spawnSync(process.execPath, [command, action], { encoding: 'utf8' });
    assert.equal(result.status, expectedExit, result.stderr);
    const decision = JSON.parse(result.stdout);
    assert.equal(decision.allowed, allowed);
    assert.equal(decision.executed, false);
    assert.equal(decision.nativeExecutionLimit, 0);
    assert.equal(decision.authorizedCloudSpend, 0);
  }
});

test('CLI never accepts an approved=true argument or approval override', () => {
  const command = resolve(__dirname, '..', 'probe.cjs');
  for (const args of [[], ['native.execute', 'approved=true'], ['local.summary', '--approval', 'true']]) {
    const result = spawnSync(process.execPath, [command, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr);
    const decision = JSON.parse(result.stdout);
    assert.equal(decision.allowed, false);
    assert.equal(decision.executed, false);
    assert.ok(codes(decision).includes('INVALID_ARGUMENTS'));
  }
});
