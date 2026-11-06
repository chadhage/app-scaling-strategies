'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const approved = require('../../C001/approved-contract.js');
const { LISTENER_LIFETIME_MS, onceProcess, readCurrentApproval, readLedgerText, runCli, scheduleClose, scope, startLocal } = require('../server.cjs');

const fixtureLedger = path.join(__dirname, 'fixtures', 'ledger-c001-approved.json');
// A closed server's handle leaves the active-resource list a few loop turns after its close event, so wait for the
// count to reach the expectation within a bounded number of short turns instead of sampling once.
const activeListeners = () => process.getActiveResourcesInfo().filter((name) => name === 'TCPServerWrap').length;
async function listeners(expected) {
  for (let turn = 0; turn < 200 && expected !== undefined && activeListeners() !== expected; turn += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  return activeListeners();
}
const approval = () => structuredClone(approved.approval);
const ledgerText = (value) => JSON.stringify({ approvals: { C001: value } });

async function closed(server) {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

test('the hermetic ledger fixture is exactly the pinned C001 approval snapshot', () => {
  assert.deepEqual(JSON.parse(readLedgerText(fixtureLedger)).approvals.C001, approved.approval);
});

test('the current approval is read from the ledger, retrying a torn read and then failing closed', () => {
  assert.deepEqual(readCurrentApproval({ read: () => readLedgerText(fixtureLedger) }), approved.approval);
  let reads = 0;
  const flaky = () => { reads += 1; if (reads < 3) return '{"approvals":'; return ledgerText(approval()); };
  assert.deepEqual(readCurrentApproval({ read: flaky }), approved.approval);
  assert.equal(reads, 3);
  for (const text of ['{', '{}', '', 'null']) {
    assert.throws(() => readCurrentApproval({ read: () => text }), /consent is unavailable; the local listener was not started/, text);
  }
  assert.equal(readCurrentApproval({ read: () => '{"approvals":{}}' }), undefined, 'a missing record is left for the consent guard to deny');
  assert.throws(() => readCurrentApproval({ read: () => { throw new Error('ENOENT'); } }), /consent is unavailable/);
  reads = 0;
  assert.throws(() => readCurrentApproval({ read: () => { reads += 1; return '{'; }, attempts: 1 }), /unavailable/);
  assert.equal(reads, 1);
});

test('current C001 local-probe consent allows a listener bound only to 127.0.0.1 on an automatic port', async () => {
  const before = await listeners(0);
  const server = await startLocal({ readApproval: () => approval() });
  try {
    assert.equal(await listeners(before + 1), before + 1);
    assert.equal(server.address().address, '127.0.0.1');
    assert.ok(server.address().port > 0);
    const response = await fetch(`http://127.0.0.1:${server.address().port}/scope.json`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), scope);
  } finally {
    await closed(server);
  }
  assert.equal(await listeners(before), before);
});

test('missing, unreadable, drifted or denied consent cannot create a listener', async () => {
  const before = await listeners(0);
  const drift = (change) => () => ({ ...approval(), ...change });
  const denials = [
    ['an unreadable ledger', () => { throw new Error('C001 current consent is unavailable; the local listener was not started.'); }, /unavailable/],
    ['no approval record', () => undefined, /consent denied: APPROVAL_MISSING/],
    ['an empty approval', () => ({}), /consent denied/],
    ['live Azure execution switched on', drift({ liveAzureExecutionApproved: true }), /consent denied: .*APPROVAL_DRIFT/],
    ['a changed operating envelope', drift({ operatingEnvelope: { ...approval().operatingEnvelope, authorizedCloudSpend: 1 } }), /consent denied: .*APPROVAL_DRIFT/],
    ['an unresolved choice', drift({ framework: 'TBD' }), /consent denied/]
  ];
  for (const [name, readApproval, pattern] of denials) {
    await assert.rejects(startLocal({ readApproval }), pattern, name);
    assert.equal(await listeners(before), before, `${name} left no listener`);
  }
  await assert.rejects(startLocal({ readApproval: () => approval(), guard: async () => ({ allowed: false, reasons: [{ code: 'LOCAL_ONLY' }] }) }), /consent denied: LOCAL_ONLY/);
  assert.equal(await listeners(before), before);
});

test('the CLI refuses any override before consent is read or a listener is created', async () => {
  for (const argv of [['--host=0.0.0.0'], ['--port=8080'], ['--credential=x'], ['--stamp=forged'], ['a', 'b']]) {
    let started = 0;
    const errors = [];
    const result = await runCli(argv, { start: async () => { started += 1; }, error: (text) => errors.push(text), log: () => assert.fail('no listening event') });
    assert.equal(result.exitCode, 1);
    assert.equal(started, 0);
    assert.match(errors[0], /accepts no host, port, identity, credential, destination, stamp, or consent overrides/);
  }
});

test('the CLI reports a consent or startup failure without listening', async () => {
  const errors = [];
  const result = await runCli([], { start: async () => { throw new Error('C001 local consent denied: APPROVAL_DRIFT'); }, error: (text) => errors.push(text), log: () => assert.fail('no event') });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(errors, ['C001 local consent denied: APPROVAL_DRIFT']);
});

test('the CLI prints the exact origin and owned PID, registers signals and a bounded lifetime, and closes its exact server', async () => {
  const lines = [];
  const signals = [];
  const timers = [];
  const result = await runCli([], {
    start: () => startLocal({ readApproval: () => approval() }), log: (line) => lines.push(JSON.parse(line)),
    once: (name, handler) => signals.push([name, handler]), schedule: (handler, delay) => timers.push([handler, delay])
  });
  assert.equal(result.exitCode, 0);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].event, 'C032-local-listening');
  assert.equal(lines[0].pid, process.pid);
  assert.equal(lines[0].origin, `http://127.0.0.1:${result.server.address().port}`);
  assert.equal(lines[0].lifetimeMs, LISTENER_LIFETIME_MS);
  assert.ok(LISTENER_LIFETIME_MS <= 15 * 60 * 1000, 'within the browser helper lifetime ceiling');
  assert.deepEqual(lines[0].scope, scope);
  assert.deepEqual(signals.map(([name]) => name), ['SIGINT', 'SIGTERM']);
  assert.deepEqual(timers.map(([, delay]) => delay), [LISTENER_LIFETIME_MS]);
  assert.equal((await fetch(`${lines[0].origin}/scope.json`)).status, 200);
  const stopped = new Promise((resolve) => result.server.once('close', resolve));
  timers[0][0]();
  await stopped;
  assert.equal(result.server.listening, false);
});

test('the default signal and lifetime helpers are real but never leave a listener or a ref-ed timer behind', () => {
  let fired = 0;
  onceProcess('c032-test-event', () => { fired += 1; });
  process.emit('c032-test-event');
  process.emit('c032-test-event');
  assert.equal(fired, 1, 'once semantics');
  const timer = scheduleClose(() => { fired += 100; }, 60000);
  assert.equal(timer.hasRef(), false);
  clearTimeout(timer);
  assert.equal(fired, 1);
});

test('the real process refuses host overrides before listening', () => {
  // Deleting NODE_V8_COVERAGE is not enough: Node re-injects it into children while coverage is on. An empty value stops it.
  const env = { ...process.env, NODE_V8_COVERAGE: '' };
  delete env.NODE_TEST_CONTEXT;
  const run = spawnSync(process.execPath, [path.join(__dirname, '..', 'server.cjs'), '--host=0.0.0.0'], { encoding: 'utf8', env, windowsHide: true, timeout: 30000 });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /accepts no host, port/);
  assert.equal(run.stdout, '');
});
