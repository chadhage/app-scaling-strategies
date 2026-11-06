'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { test } = require('node:test');
const { exchange, ledgerFile, privateLedger, request, serverFile, startLocal } = require('./k-c020-support.cjs');

const LIMIT = { timeout: 30000 };
const preload = path.join(__dirname, 'k-c020-cli-preload.cjs');
const UNAVAILABLE = /^C001 current consent is unavailable; the local listener was not started\.$/;
const sameFile = (file, other) => path.resolve(String(file)).toLowerCase() === path.resolve(other).toLowerCase();

function injectLedger(t, answer) {
  const original = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', function readFileSync(file, ...rest) {
    return sameFile(file, ledgerFile) ? answer() : original.call(this, file, ...rest);
  });
}
const missing = () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); };

// A deadline that clears its own timer, so a passing race leaves no timer behind.
function within(promise, ms, message) {
  let timer;
  const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

for (const [name, answer, expected] of [
  ['an unreadable ledger', missing, UNAVAILABLE],
  ['a malformed ledger', () => '{', UNAVAILABLE],
  ['a ledger without approvals', () => '{}', /^C001 local consent denied: .*APPROVAL_MISSING/],
  ['an approval that is not a record', () => '{"approvals":{"C001":"granted"}}', /^C001 local consent denied: .*APPROVAL_MISSING/],
  ['a hollow approval', () => '{"approvals":{"C001":{"designAndLocalImplementationApproved":true}}}', /CHOICE_MISSING/],
  ['a drifted approval', () => privateLedger((approval) => { approval.deploymentApproved = true; }), /^C001 local consent denied: .*APPROVAL_DRIFT/],
  ['an unresolved approved choice', () => privateLedger((approval) => { approval.runtime = 'TBD'; }), /CHOICE_UNRESOLVED/]
]) {
  test(`startLocal refuses to listen with ${name} and creates no server`, LIMIT, async (t) => {
    injectLedger(t, answer);
    const created = t.mock.method(http, 'createServer');
    await assert.rejects(startLocal(), (error) => { assert.match(error.message, expected); return true; });
    assert.equal(created.mock.callCount(), 0, 'no listener may be created before consent is confirmed');
  });
}

test('startLocal binds only 127.0.0.1 on an ephemeral port after a valid approval and serves the scope', LIMIT, async (t) => {
  injectLedger(t, () => privateLedger());
  const server = await startLocal();
  try {
    const { address, family, port } = server.address();
    assert.equal(address, '127.0.0.1');
    assert.equal(family, 'IPv4');
    assert.ok(port > 0);
    const scope = await exchange(port, request(`127.0.0.1:${port}`, 'GET', '/scope.json'));
    assert.equal(scope.status, 200);
    assert.equal(JSON.parse(scope.text).cardId, 'C020');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('a listen failure rejects startLocal with that very error', LIMIT, async (t) => {
  injectLedger(t, () => privateLedger());
  const failure = Object.assign(new Error('simulated EADDRNOTAVAIL'), { code: 'EADDRNOTAVAIL' });
  const original = http.createServer;
  t.mock.method(http, 'createServer', function createServer(...args) {
    const server = original.apply(this, args);
    server.listen = () => { process.nextTick(() => server.emit('error', failure)); return server; };
    return server;
  });
  await assert.rejects(startLocal(), (error) => error === failure);
});

// The CLI runs as a real child process with a hard stop; the preload supplies the private ledger and the signal stand-in.
function startCli({ ledger, mode = 'private', args = [] }) {
  const child = spawn(process.execPath, ['--require', preload, serverFile, ...args], {
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    env: { ...process.env, K_C020_LEDGER_FILE: ledgerFile, K_C020_LEDGER_JSON: ledger ?? '', K_C020_LEDGER_MODE: mode }
  });
  let stdout = '';
  let stderr = '';
  let seen;
  const line = new Promise((resolve, reject) => { seen = { resolve, reject }; });
  child.stdout.setEncoding('utf8').on('data', (text) => {
    stdout += text;
    if (stdout.includes('\n')) seen.resolve(stdout.slice(0, stdout.indexOf('\n')));
  });
  child.stderr.setEncoding('utf8').on('data', (text) => { stderr += text; });
  const timer = setTimeout(() => child.kill(), 20000);
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      seen.reject(new Error(`The CLI exited (${code}) before it printed a record.`));
      resolve({ code, signal, stdout, stderr });
    });
  });
  line.catch(() => {});
  return { child, line, exited, signal: (name) => child.stdin.write(`${name}\n`), stop: () => { child.kill(); return exited.catch(() => {}); } };
}

for (const name of ['SIGINT', 'SIGTERM']) {
  test(`the CLI prints one listening record, serves, and drops every connection and the listener on ${name}`, LIMIT, async () => {
    const cli = startCli({ ledger: privateLedger() });
    let busy;
    try {
      const record = JSON.parse(await cli.line);
      const port = Number(new URL(record.origin).port);
      assert.equal(record.event, 'C020-local-listening');
      assert.equal(record.pid, cli.child.pid);
      assert.equal(record.origin, `http://127.0.0.1:${port}`);
      const scope = await exchange(port, request(`127.0.0.1:${port}`, 'GET', '/scope.json'));
      assert.deepEqual(JSON.parse(scope.text), record.scope);
      busy = net.connect({ host: '127.0.0.1', port });
      await new Promise((resolve, reject) => { busy.once('error', reject); busy.once('connect', resolve); });
      busy.write(`GET /scope.json HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n`);
      const dropped = new Promise((resolve) => busy.once('close', resolve));
      cli.signal(name);
      await within(dropped, 4000, 'An in-flight connection survived the shutdown.');
      const result = await cli.exited;
      assert.deepEqual([result.code, result.signal, result.stderr], [0, null, '']);
      assert.equal(result.stdout.trim().split('\n').length, 1, 'exactly one listening record');
      await assert.rejects(exchange(port, request(`127.0.0.1:${port}`, 'GET', '/scope.json')), (error) => error.code === 'ECONNREFUSED');
    } finally {
      busy?.destroy();
      await cli.stop();
    }
  });
}

for (const [name, options, expected] of [
  ['an unreadable ledger', { mode: 'missing' }, UNAVAILABLE],
  ['a missing approval', { ledger: '{}' }, /^C001 local consent denied: .*APPROVAL_MISSING/],
  ['a drifted approval', { ledger: privateLedger((approval) => { approval.scaffoldApproved = true; }) }, /^C001 local consent denied: .*APPROVAL_DRIFT/]
]) {
  test(`the CLI exits 1 with the reason on stderr and no listening record for ${name}`, LIMIT, async () => {
    const result = await startCli(options).exited;
    assert.equal(result.code, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr.trim(), expected);
  });
}

test('the CLI refuses every extra argument before it reads consent or listens', LIMIT, async () => {
  for (const extra of ['--port=0', '8080', '--host=127.0.0.1', '--implementation-version=9']) {
    const result = await startCli({ mode: 'missing', args: [extra] }).exited;
    assert.equal(result.code, 1, extra);
    assert.equal(result.stdout, '', extra);
    assert.equal(result.stderr.trim(), 'C020 accepts no host, port, identity, implementation-stamp, or deployment overrides.', extra);
  }
});
