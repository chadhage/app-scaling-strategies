'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const s = require('./support.cjs');
const h = require('./http.cjs');
const cli = require('../cli.cjs');
const approved = require('../../C001/approved-contract.js');

const allow = async () => ({ allowed: true, reasons: [] });
const deps = (extra = {}) => ({ guard: allow, readApproval: () => approved.approval, log: () => {}, ...extra });

test('options are closed: only --name=value inside their ranges, no host, port, identity or outcome override', () => {
  assert.deepEqual(cli.parseArgs([]), cli.defaults);
  const options = cli.parseArgs(['--steps=3', '--units=7', '--step-delay-ms=0', '--hold-before-step=2', '--hold-in-step=3', '--ttl-ms=1000']);
  assert.deepEqual([options.steps, options.units, options.stepDelayMs, options.holdBeforeStep, options.holdInStep, options.ttlMs], [3, 7, 0, 2, 3, 1000]);
  for (const bad of ['--host=0.0.0.0', '--port=80', '--outcome=COMPENSATED', '--user=x', '--steps', 'steps=3', '--steps=0', '--steps=9', '--steps=1.5', '--steps=-1',
    '--units=1001', '--step-delay-ms=60001', '--ttl-ms=999', '--hold-in-step=9', '--dir=', '--steps=0x3']) {
    assert.throws(() => cli.parseArgs([bad]), cli.UsageError, bad);
  }
  assert.throws(() => cli.parseArgs(['--unknown-flag-with-a-very-long-name-that-is-cut-for-the-message-x=1']), (error) => error.message.length < 80);
});

test('the journal directory is confined to the namespace', () => {
  const inside = path.join(__dirname, '..', 'test-scratch', 'x');
  assert.equal(cli.parseArgs([`--dir=${inside}`]).dir, path.resolve(inside));
  assert.equal(cli.parseArgs([`--dir=${path.join(__dirname, '..')}`]).dir, path.resolve(__dirname, '..'));
  for (const outside of [path.join(__dirname, '..', '..', 'C016'), 'C:\\Windows', path.join(__dirname, '..', '..', 'C017-evil'), path.join(__dirname, '..', '..', '..', '..', 'x'), '..\\..\\x']) {
    assert.throws(() => cli.parseArgs([`--dir=${outside}`]), cli.UsageError, outside);
  }
});

test('rehearsal gates: a held gate never opens, the pace gate waits and wakes on abort, zero delay is immediate', async () => {
  const gates = cli.makeGates({ holdBeforeStep: 2, holdInStep: 3, stepDelayMs: 60000 });
  const quick = (promise) => s.withTimeout(Promise.race([promise.then(() => 'opened'), new Promise((resolve) => setTimeout(() => resolve('held'), 60))]), 'race');
  const control = new AbortController();
  assert.equal(await quick(gates.beforeStep(2, { signal: control.signal })), 'held');
  assert.equal(await quick(Promise.resolve(gates.inStep(3))), 'held');
  assert.equal(gates.inStep(1), undefined);
  const waiting = gates.beforeStep(1, { signal: control.signal });
  assert.equal(await quick(waiting), 'held');
  control.abort();
  await s.withTimeout(waiting, 'abort must wake the pace gate');
  const compControl = new AbortController();
  const comp = cli.makeGates({ holdBeforeStep: 0, holdInStep: 0, stepDelayMs: 60000 }).inCompensation(1, { signal: compControl.signal });
  assert.ok(comp instanceof Promise);
  compControl.abort();
  await s.withTimeout(comp, 'abort must wake the compensation pace gate');
  await s.withTimeout(cli.makeGates({ holdBeforeStep: 0, holdInStep: 0, stepDelayMs: 0 }).beforeStep(1, { signal: control.signal }), 'zero delay is immediate');
});

test('consent is read from the ledger and failures are explicit', (t) => {
  t.mock.method(fs, 'readFileSync', () => JSON.stringify({ approvals: { C001: { marker: 'x' } } }));
  assert.deepEqual(cli.readApproval(), { marker: 'x' });
  t.mock.method(fs, 'readFileSync', () => { throw new Error('missing'); });
  assert.throws(() => cli.readApproval(), /C001 current consent is unavailable; the local listener was not started\./);
});

test('main rechecks C001 consent: denied consent starts nothing, approved consent binds only 127.0.0.1 on an automatic port', async (t) => {
  const made = s.scratch('c');
  t.after(() => made.remove());
  await assert.rejects(cli.main([`--dir=${made.dir}`], deps({ guard: async () => ({ allowed: false, reasons: [{ code: 'APPROVAL_DRIFT' }, { code: 'X' }] }) })), /C001 local consent denied: APPROVAL_DRIFT, X/);
  assert.equal(fs.existsSync(path.join(made.dir, 'journal.jsonl')), false, 'nothing was written without consent');
  const lines = [];
  const real = await cli.main([`--dir=${made.dir}`, '--step-delay-ms=0'], { readApproval: () => approved.approval, log: (line) => lines.push(JSON.parse(line)) });
  t.after(() => real.stop());
  const address = real.server.address();
  assert.deepEqual([address.address, address.family, address.port > 0], ['127.0.0.1', 'IPv4', true]);
  assert.equal(lines[0].event, 'C017-local-listening');
  assert.equal(lines[0].origin, `http://127.0.0.1:${address.port}`);
  assert.deepEqual([lines[0].scope.liveAzureRuns, lines[0].scope.authorizedCloudSpend], [0, 0]);
  assert.equal((await h.get(real.origin, '/api/state')).status, 200);
  const drift = { ...approved.approval, runtime: 'Node.js 99' };
  await assert.rejects(cli.main([`--dir=${made.dir}`], { readApproval: () => drift, log: () => {} }), /C001 local consent denied/);
});

function fakeHost() {
  const host = new EventEmitter();
  host.stdin = new PassThrough();
  host.exitCode = undefined;
  return host;
}

test('runCli closes the owned listener on the exact stop word, SIGINT, SIGTERM and the TTL, and flags any other input', async (t) => {
  const made = s.scratch('r');
  t.after(() => made.remove());
  const run = async (trigger) => {
    const host = fakeHost();
    const lines = [];
    const started = await cli.runCli([`--dir=${made.dir}`, '--step-delay-ms=0'], host, deps({ log: (line) => lines.push(JSON.parse(line)) }));
    assert.equal(started.server.listening, true);
    await trigger(host, started);
    await s.withTimeout(new Promise((resolve) => { const poll = () => (started.server.listening ? setTimeout(poll, 10) : resolve()); poll(); }), 'the listener did not close');
    assert.ok(lines.some((line) => line.event === 'C017-local-closed' && line.listening === false));
    return host;
  };
  assert.equal((await run((host) => host.stdin.write('stop\n'))).exitCode, undefined);
  assert.equal((await run((host) => host.stdin.write('anything else\n'))).exitCode, 1);
  assert.equal((await run((host) => host.stdin.write('x'.repeat(100)))).exitCode, 1);
  await run((host) => host.emit('SIGINT'));
  await run((host) => host.emit('SIGTERM'));
  await run(async (host, started) => { await started.stopAll(); await started.stopAll(); });
});

test('the TTL closes the listener without any input', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const made = s.scratch('t');
  t.after(() => made.remove());
  const host = fakeHost();
  const started = await cli.runCli([`--dir=${made.dir}`, '--ttl-ms=1000'], host, deps());
  t.mock.timers.tick(1000);
  t.mock.timers.reset();
  await s.withTimeout(new Promise((resolve) => started.server.once('close', resolve)), 'the TTL did not close the listener');
  assert.equal(started.server.listening, false);
});
