'use strict';

const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { load } = require('./helpers.cjs');

const approved = require('../../C001/approved-contract.js').approval;
const subject = process.env.C009_SUBJECT_DIR ? path.resolve(process.env.C009_SUBJECT_DIR) : path.resolve(__dirname, '..');
const cliPath = path.join(subject, 'cli.cjs');
const { startLocal, readCurrentApproval } = load('cli.cjs');
const NAMES = ['visitor', 'conductor-a', 'conductor-b', 'operator'];
const within = (promise, label, ms = 15000) => {
  let timer;
  const late = new Promise((resolve, reject) => { timer = setTimeout(() => reject(new assert.AssertionError({ message: `${label} was not reached` })), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
};
const post = (origin, command, token, body) => fetch(`${origin}/v1/commands/${command}`, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
});

test('startLocal binds only 127.0.0.1 on an automatic port and hands out four working synthetic tokens', async () => {
  const local = await startLocal({ readApproval: () => approved });
  try {
    const address = local.server.address();
    assert.equal(address.address, '127.0.0.1');
    assert.ok(address.port > 0);
    assert.equal(local.origin, `http://127.0.0.1:${address.port}`);
    assert.deepEqual(Object.keys(local.tokens), NAMES);
    assert.equal(new Set(Object.values(local.tokens)).size, 4);
    assert.equal((await post(local.origin, 'pool.resize', local.tokens.operator, { size: 4 })).status, 200);
    assert.equal((await post(local.origin, 'pool.resize', local.tokens.visitor, { size: 5 })).status, 403);
    const scope = await (await fetch(`${local.origin}/scope.json`)).json();
    assert.deepEqual([scope.liveAzureRuns, scope.authorizedCloudSpend, scope.identityRegistered, scope.entraIntegrated], [0, 0, false, false]);
  } finally {
    await local.close();
  }
  await assert.rejects(fetch(`${local.origin}/scope.json`));
});

test('missing, unreadable, malformed, forged or drifted consent never creates a listener', async (t) => {
  const listen = t.mock.method(net.Server.prototype, 'listen');
  const readers = [
    ['unreadable ledger', () => readCurrentApproval(() => { throw new Error('missing'); }), /consent is unavailable/],
    ['malformed ledger', () => readCurrentApproval(() => '{'), /consent is unavailable/],
    ['no approval record', () => readCurrentApproval(() => '{"approvals":{}}'), /consent denied: .*APPROVAL_MISSING/],
    ['empty approval', () => ({}), /consent denied/],
    ['live Azure flipped on', () => ({ ...approved, liveAzureExecutionApproved: true }), /consent denied: .*APPROVAL_DRIFT/],
    ['spend flipped on', () => ({ ...approved, operatingEnvelope: { ...approved.operatingEnvelope, authorizedCloudSpend: 1 } }), /consent denied: .*APPROVAL_DRIFT/],
    ['a changed owner', () => ({ ...approved, decisionOwner: 'someone-else' }), /consent denied: .*APPROVAL_DRIFT/]
  ];
  for (const [name, readApproval, message] of readers) await assert.rejects(startLocal({ readApproval }), message, name);
  assert.equal(listen.mock.callCount(), 0);
});

test('readCurrentApproval returns exactly approvals.C001 from the ledger text', () => {
  assert.deepEqual(readCurrentApproval(() => JSON.stringify({ approvals: { C001: approved } })), approved);
  assert.equal(readCurrentApproval(() => '{"approvals":{}}'), undefined);
  assert.equal(readCurrentApproval(() => '{}'), undefined);
});

test('the listener closes itself after its bounded lifetime and rejects unbounded ones before reading consent', async () => {
  let reads = 0;
  const readApproval = () => { reads += 1; return approved; };
  for (const lifetimeMs of [0, -1, 1.5, '5', 900001, Number.NaN]) {
    await assert.rejects(startLocal({ readApproval, lifetimeMs }), { name: 'RangeError' }, String(lifetimeMs));
  }
  assert.equal(reads, 0);
  const local = await startLocal({ readApproval, lifetimeMs: 40 });
  await within(local.closed, 'the self-close');
  assert.equal(local.server.listening, false);
  assert.equal(reads, 1);
});

test('the CLI refuses every override before any consent check or listener', () => {
  for (const extra of [['--port=80'], ['--host=0.0.0.0'], ['operator'], ['--role=operator', '--lifetime=1']]) {
    const run = spawnSync(process.execPath, [cliPath, ...extra], { encoding: 'utf8', timeout: 20000, windowsHide: true });
    assert.equal(run.status, 1, extra.join(' '));
    assert.match(run.stderr, /accepts no host, port, identity, role, token, lifetime or permission overrides/);
    assert.doesNotMatch(run.stdout, /listening/);
  }
});

test('the real CLI rechecks the live C001 consent, prints one startup line, serves, and stops on request', async () => {
  const child = spawn(process.execPath, [cliPath], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  try {
    const line = await within(new Promise((resolve, reject) => {
      let text = '';
      child.stdout.on('data', (chunk) => { text += chunk; if (text.includes('\n')) resolve(text.split('\n')[0]); });
      child.once('exit', (code) => reject(new Error(`CLI exited ${code} before listening`)));
    }), 'the startup line');
    const started = JSON.parse(line);
    assert.equal(started.event, 'C009-local-listening');
    assert.match(started.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.deepEqual(Object.keys(started.tokens), NAMES);
    assert.equal(started.scope.cardId, 'C009');
    assert.equal(started.lifetimeMs, 600000);
    assert.equal((await post(started.origin, 'run.create', started.tokens['conductor-a'], { name: 'alpha', units: 5 })).status, 200);
    assert.equal((await post(started.origin, 'run.create', started.tokens.operator, { name: 'alpha', units: 5 })).status, 403);
  } finally {
    child.kill();
    await within(exited, 'the CLI exit', 20000);
  }
});
