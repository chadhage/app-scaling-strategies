'use strict';

// The driver CLI: argument parsing, the C001 consent recheck, exit codes, and real child-process runs against the real server.
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const { test } = require('node:test');
const approved = require('../../C001/approved-contract.js');
const { parseArguments, summarize, runCli, UsageError } = require('../driver-cli.cjs');
const s = require('./support.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const preload = path.join(root, 'tests', 'fixtures', 'ledger-preload.cjs');
const ledgerWith = (approval) => () => JSON.stringify({ approvals: { C001: approval } });
const consent = ledgerWith(approved.approval);
const O = 'http://127.0.0.1:4000';

function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE']) delete env[name];
  return env;
}

async function run(argv, deps = {}) {
  const lines = [];
  const errors = [];
  const code = await runCli(argv, { readLedger: consent, log: (line) => lines.push(line), error: (line) => errors.push(line), ...deps });
  return { code, lines, errors };
}

test('parseArguments accepts the documented forms and nothing else', () => {
  assert.deepEqual(parseArguments([O, 'watch', 'alpha', '5']), { origin: O, command: 'watch', topic: 'alpha', count: 5, options: {} });
  assert.deepEqual(parseArguments([O, 'watch', 'alpha', '5', '--interval-ms', '0', '--payload-bytes', '10', '--timeout-ms', '100', '--cancel-after', '2']).options,
    { interval_ms: 0, payload_bytes: 10, timeoutMs: 100, cancelAfter: 2 });
  assert.deepEqual(parseArguments([O, 'watch', '--timeout-ms', '9', 'alpha', '0']).options, { timeoutMs: 9 });
  assert.deepEqual(parseArguments([O, 'chat', 'hello', 'world']), { origin: O, command: 'chat', notes: ['hello', 'world'] });
  const usage = [
    [], [O], [O, 'watch'], [O, 'watch', 'alpha'], [O, 'watch', 'alpha', 'x'], [O, 'watch', 'alpha', '-1'], [O, 'watch', 'alpha', '1', 'extra'],
    [O, 'watch', 'alpha', '1', '--nope', '1'], [O, 'watch', 'alpha', '1', '--timeout-ms'], [O, 'watch', 'alpha', '1', '--timeout-ms', '0'],
    [O, 'watch', 'alpha', '1', '--cancel-after', '0'], [O, 'watch', 'alpha', '1', '--timeout-ms', '1', '--timeout-ms', '2'],
    [O, 'watch', 'alpha', '1', '--timeout-ms', '--cancel-after'], [O, 'watch', 'alpha', '1', '--interval-ms', '1.5'], [O, 'watch', 'alpha', '1', '--constructor', '1'],
    [O, 'chat'], [O, 'chat', '--port'], [O, 'chat', 'ok', '--x'], [O, 'sing', 'alpha'], [O, 'watch', 'alpha', '9999999999']
  ];
  for (const argv of usage) assert.throws(() => parseArguments(argv), UsageError, JSON.stringify(argv));
});

test('a watch prints the report and exits 0 only because the conversation was clean', () => s.withServer({}, async (server) => {
  const { code, lines, errors } = await run([server.origin, 'watch', 'alpha', '3']);
  assert.deepEqual([code, errors], [0, []]);
  const printed = JSON.parse(lines[0]);
  assert.deepEqual([printed.ok, printed.outcome, printed.messageCount, printed.status.origin], [true, 'ok', 3, 'server-trailers']);
  assert.deepEqual(printed.messages.map((message) => message.seq), [1, 2, 3]);
  assert.equal(printed.trailers['grpc-status'], '0');
  assert.equal(Object.hasOwn(printed, 'events'), false, 'the summary leaves out the wire event log');
}));

test('a chat prints the echoes; a refused watch, a cancel and a deadline exit 1 with an honest status', () => s.withServer({}, async (server) => {
  const chat = await run([server.origin, 'chat', 'a', 'b']);
  assert.equal(chat.code, 0);
  assert.deepEqual(JSON.parse(chat.lines[0]).messages.map((message) => message.text), ['echo: a', 'echo: b']);
  const refused = await run([server.origin, 'watch', 'alpha', '0']);
  assert.equal(refused.code, 1);
  assert.equal(JSON.parse(refused.lines[0]).status.name, 'INVALID_ARGUMENT');
  const cancelled = await run([server.origin, 'watch', 'alpha', '10000', '--cancel-after', '2']);
  assert.equal(cancelled.code, 1);
  assert.equal(JSON.parse(cancelled.lines[0]).status.name, 'CANCELLED');
  const late = await run([server.origin, 'watch', 'alpha', '10000', '--interval-ms', '1000', '--timeout-ms', '60']);
  assert.equal(late.code, 1);
  assert.equal(JSON.parse(late.lines[0]).outcome, 'deadline-exceeded');
}));

test('usage errors, a denied consent and an unreachable or foreign origin exit 2 before anything is sent', async () => {
  const usage = await run([O, 'nope']);
  assert.deepEqual([usage.code, usage.lines], [2, []]);
  assert.match(usage.errors[0], /^usage: driver-cli\.cjs/);
  assert.match((await run([O, 'watch', 'alpha', 'x'])).errors[0], /^watch needs <topic> <count>$/);
  assert.match((await run([O, 'watch', 'alpha', '1', '--nope', '1'])).errors[0], /^unknown option --nope$/);
  const drift = await run([O, 'watch', 'alpha', '1'], { readLedger: ledgerWith({ ...approved.approval, expenditureApproved: true }) });
  assert.deepEqual([drift.code, drift.lines], [2, []]);
  assert.match(drift.errors[0], /^C001 local consent denied: .*APPROVAL_DRIFT/);
  assert.match((await run([O, 'watch', 'alpha', '1'], { readLedger: () => JSON.stringify({ approvals: {} }) })).errors[0], /APPROVAL_MISSING/);
  for (const readLedger of [() => { throw new Error('x'); }, () => 'not json']) {
    assert.match((await run([O, 'watch', 'alpha', '1'], { readLedger })).errors[0], /^C001 current consent is unavailable; no connection was made\.$/);
  }
  let connected = 0;
  const foreign = await run(['http://example.com:80', 'watch', 'alpha', '1'], { connectTo: require('../driver.cjs').connect });
  assert.deepEqual([foreign.code, foreign.errors[0]], [2, 'cannot connect: ORIGIN_REFUSED']);
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  const closedPort = await run([`http://127.0.0.1:${port}`, 'watch', 'alpha', '1'], { connectTo: async (origin) => { connected += 1; return require('../driver.cjs').connect(origin); } });
  assert.deepEqual([closedPort.code, closedPort.errors[0], connected], [2, 'cannot connect: ECONNREFUSED', 1]);
  const failing = await run([O, 'watch', 'alpha', '1'], { connectTo: async () => { throw new Error('plain failure'); } });
  assert.equal(failing.errors[0], 'cannot connect: plain failure');
});

test('the CLI sends a 30 second deadline by default and the one it is given otherwise', async () => {
  const seen = [];
  const server = await s.evilServer((stream, sockets, headers) => {
    seen.push(headers['grpc-timeout']);
    stream.respond(s.GRPC, { waitForTrailers: true });
    stream.on('wantTrailers', () => stream.sendTrailers({ 'grpc-status': '0' }));
    stream.end();
  });
  try {
    for (const argv of [['watch', 'alpha', '1'], ['watch', 'alpha', '1', '--timeout-ms', '250'], ['chat', 'hi']]) {
      assert.equal((await run([server.origin, ...argv])).code, 0, argv.join(' '));
    }
    assert.deepEqual(seen, ['30000m', '250m', '30000m']);
  } finally {
    await server.close();
  }
});

test('summarize keeps the evidence the user needs and drops the wire log', () => {
  const kept = summarize({ ok: false, outcome: 'x', status: { code: 1 }, httpStatus: 200, trailersOnly: false, trailers: null, violations: [], messageCount: 0, messages: [], events: [1], headers: {} });
  assert.deepEqual(Object.keys(kept).sort(), ['httpStatus', 'messageCount', 'messages', 'ok', 'outcome', 'status', 'trailers', 'trailersOnly', 'violations']);
});

function startServerChild(extraEnv = {}) {
  const child = spawn(process.execPath, ['--require', preload, path.join('capability', 'C028', 'server.cjs')], { cwd: repository, env: childEnv(extraEnv), windowsHide: true });
  const ready = new Promise((resolve, reject) => {
    let text = '';
    child.stdout.on('data', (chunk) => {
      text += chunk;
      if (text.includes('\n')) resolve(JSON.parse(text.split('\n')[0]));
    });
    child.once('exit', (code) => reject(new Error(`server child exited with ${code}`)));
  });
  return { child, ready };
}

test('the real CLIs work as processes: the server prints its origins and the driver CLI exits 0 and 1 by evidence', { timeout: 120000 }, async () => {
  const { child, ready } = startServerChild();
  try {
    const started = await ready;
    assert.equal(started.event, 'C028-local-listening');
    assert.match(started.grpc, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.match(started.page, /^http:\/\/127\.0\.0\.1:\d+$/);
    const cli = (args, env = {}) => spawnSync(process.execPath, ['--require', preload, path.join('capability', 'C028', 'driver-cli.cjs'), ...args], { cwd: repository, env: childEnv(env), encoding: 'utf8', windowsHide: true, timeout: 30000 });
    const ok = cli([started.grpc, 'watch', 'alpha', '3']);
    assert.equal(ok.status, 0, ok.stderr);
    assert.deepEqual(JSON.parse(ok.stdout).messages.map((message) => message.seq), [1, 2, 3]);
    const missing = cli([started.grpc, 'watch', 'alpha', '0']);
    assert.equal(missing.status, 1);
    assert.equal(JSON.parse(missing.stdout).status.name, 'INVALID_ARGUMENT');
    assert.equal(cli([started.grpc, 'watch']).status, 2);
    assert.equal(cli(['http://example.com:80', 'watch', 'alpha', '1']).status, 2);
    const drift = cli([started.grpc, 'watch', 'alpha', '1'], { C028_FIXTURE_APPROVAL: 'drift' });
    assert.equal(drift.status, 2);
    assert.match(drift.stderr, /APPROVAL_DRIFT/);
    const refusedServer = spawnSync(process.execPath, ['--require', preload, path.join('capability', 'C028', 'server.cjs')], { cwd: repository, env: childEnv({ C028_FIXTURE_APPROVAL: 'missing' }), encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert.equal(refusedServer.status, 1);
    assert.match(refusedServer.stderr, /APPROVAL_MISSING/);
    assert.equal(refusedServer.stdout, '', 'nothing was listening, nothing was printed');
    const overrides = spawnSync(process.execPath, ['--require', preload, path.join('capability', 'C028', 'server.cjs'), '--port', '8080'], { cwd: repository, env: childEnv(), encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert.equal(overrides.status, 1);
    assert.match(overrides.stderr, /accepts no host, port/);
  } finally {
    child.kill();
  }
});
