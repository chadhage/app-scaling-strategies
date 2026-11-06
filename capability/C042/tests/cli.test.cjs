'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const approved = require('../../C001/approved-contract.js');
const { closeServer, createLocalServer, parseArguments, runCli, startLocal } = require('../server.cjs');
const journal = require('../journal.cjs');
const { call, startService, valid } = require('./support.cjs');

const ledgerWith = (approval) => () => JSON.stringify({ approvals: { C001: approval } });
const dataRoot = path.join(__dirname, '..', 'data');

test('startLocal rechecks C001 consent, binds 127.0.0.1 on an automatic port and serves the step', async () => {
  const server = await startLocal({ readLedger: ledgerWith(approved.approval) });
  try {
    const address = server.address();
    assert.deepEqual([address.address, address.family, address.port > 0], ['127.0.0.1', 'IPv4', true]);
    assert.equal((await call(address.port, 'POST', '/v1/steps', valid())).status, 201);
    const transcript = await call(address.port, 'GET', '/transcript.json');
    assert.deepEqual([transcript.status, transcript.json.kind], [200, 'C042-server-transcript']);
  } finally {
    await closeServer(server);
    await closeServer(server);
  }
});

test('consent that is missing, drifted or unreadable keeps the listener from starting', async () => {
  await assert.rejects(startLocal({ readLedger: ledgerWith({ ...approved.approval, expenditureApproved: true }) }), /C001 local consent denied: .*APPROVAL_DRIFT/);
  await assert.rejects(startLocal({ readLedger: () => JSON.stringify({ approvals: {} }) }), /C001 local consent denied: .*APPROVAL_MISSING/);
  await assert.rejects(startLocal({ readLedger: () => { throw new Error('no ledger'); } }), /current consent is unavailable/);
  await assert.rejects(startLocal({ readLedger: () => '{not json' }), /current consent is unavailable/);
});

test('the data name is closed, and the file journal lives only under the namespace data folder', async () => {
  for (const name of ['../x', 'a b', '', '.hidden', 'a'.repeat(33), 'a/b', 'a\\b', ' x', 'x\n']) {
    await assert.rejects(startLocal({ readLedger: ledgerWith(approved.approval), dataName: name }), /data name must be/, JSON.stringify(name));
  }
  const name = `t-${crypto.randomUUID().slice(0, 12)}`;
  const server = await startLocal({ readLedger: ledgerWith(approved.approval), dataName: name, settleMs: 5 });
  try {
    assert.equal((await call(server.address().port, 'POST', '/v1/steps', valid())).status, 201);
    assert.equal(fs.existsSync(path.join(dataRoot, name, journal.FILE)), true);
  } finally {
    await closeServer(server);
    fs.rmSync(path.join(dataRoot, name), { recursive: true, force: true });
    if (fs.existsSync(dataRoot) && fs.readdirSync(dataRoot).length === 0) fs.rmdirSync(dataRoot);
  }
});

test('arguments are closed: only a data name and a bounded settle time are accepted', () => {
  assert.deepEqual(parseArguments([]), { dataName: null, settleMs: 0 });
  assert.deepEqual(parseArguments(['--data-dir=demo', '--settle-ms=2500']), { dataName: 'demo', settleMs: 2500 });
  assert.deepEqual(parseArguments(['--settle-ms=60000']), { dataName: null, settleMs: 60000 });
  for (const bad of [['--port=1'], ['--host=0.0.0.0'], ['--settle-ms=60001'], ['--settle-ms=abc'], ['--settle-ms=-1'], ['--settle-ms=1.5'],
    ['--data-dir=a', '--data-dir=b'], ['--data-dir='], ['extra'], ['--identity=x'], ['--settle-ms=123456']]) {
    assert.equal(parseArguments(bad), null, bad.join(' '));
  }
});

test('the command line reports the exact origin, refuses overrides and closes the server on a signal', async () => {
  const logs = [];
  const errors = [];
  const server = await startLocal({ readLedger: ledgerWith(approved.approval) });
  let closer;
  const code = await runCli(['--settle-ms=3'], { start: async (options) => { assert.deepEqual(options, { dataName: null, settleMs: 3 }); return server; }, log: (line) => logs.push(line), error: (line) => errors.push(line), onSignal: (handler) => { closer = handler; } });
  assert.equal(code, 0);
  const started = JSON.parse(logs[0]);
  assert.deepEqual([started.event, started.origin, started.journal, started.scope.cardId], ['C042-local-listening', `http://127.0.0.1:${server.address().port}`, 'memory (not persisted)', 'C042']);
  await closer();
  await assert.rejects(call(server.address()?.port ?? 1, 'GET', '/scope.json'));
  const named = [];
  const second = await startLocal({ readLedger: ledgerWith(approved.approval) });
  const withName = await runCli(['--data-dir=demo'], { start: async () => second, log: (line) => named.push(line), error: () => {}, onSignal: () => {} });
  await closeServer(second);
  assert.equal(withName, 0);
  assert.equal(JSON.parse(named[0]).journal, 'capability/C042/data/demo');
  assert.equal(await runCli(['--port=80'], { error: (line) => errors.push(line) }), 1);
  assert.match(errors.at(-1), /accepts only --data-dir=<name> and --settle-ms/);
  assert.equal(await runCli([], { start: () => Promise.reject(new Error('C001 current consent is unavailable')), error: (line) => errors.push(line) }), 1);
  assert.match(errors.at(-1), /consent is unavailable/);
  const child = spawnSync(process.execPath, [path.join(__dirname, '..', 'server.cjs'), '--bogus'], { encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: undefined }, timeout: 20000 });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /accepts only --data-dir/);
});

test('unexpected failures are typed unknown outcomes, never a fabricated success', async () => {
  const broken = { submit() { throw new Error('boom'); }, snapshot() { throw new Error('boom'); }, halt() {} };
  const server = createLocalServer({ engine: broken, transcript: async () => { throw new Error('no transcript'); } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const failed = await call(port, 'POST', '/v1/steps', valid());
    assert.deepEqual([failed.status, failed.json.outcome, failed.json.error.code, failed.json.effect.applied, failed.json.recovery.allowed], [500, 'unknown', 'INTERNAL_ERROR', null, ['retry', 'inspect']]);
    assert.equal((await call(port, 'GET', '/v1/leases')).json.error.code, 'INTERNAL_ERROR');
    const transcript = await call(port, 'GET', '/transcript.json');
    assert.deepEqual([transcript.status, transcript.json.error.code], [500, 'TRANSCRIPT_UNAVAILABLE']);
  } finally {
    await closeServer(server);
  }
  const plain = http.createServer();
  await new Promise((resolve) => plain.listen(0, '127.0.0.1', resolve));
  await closeServer(plain);
  const service = await startService({ io: journal.createMemoryIo() });
  await service.stop();
  await service.stop();
  const late = await service.engine.submit(Object.freeze(valid()));
  assert.deepEqual([late.status, late.body.error.code], [503, 'JOURNAL_UNAVAILABLE']);
});
