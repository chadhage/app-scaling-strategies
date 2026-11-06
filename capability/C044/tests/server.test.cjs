'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const test = require('node:test');
const approved = require('../../C001/approved-contract.js');
const cursors = require('../cursor.js');
const { createLocalServer, scope, ttlMs } = require('../server.cjs');
const { createRun } = require('../run.cjs');
const { freshLoad } = require('./fresh.cjs');
const { startHost, openStream, rawConnect, fixtureContext, manualScheduler, scratchDirectory, settle, root } = require('./support.cjs');

const serverFile = path.join(root, 'server.cjs');
const contextFile = path.join(root, 'context.cjs');
const guardFile = path.join(root, '..', 'C001', 'contract-guard.js');
const clean = (env) => { const copy = { ...env }; delete copy.NODE_TEST_CONTEXT; return copy; };

async function get(host, route, options) {
  const response = await fetch(`${host.origin}${route}`, options);
  return { response, text: await response.text() };
}

test('only the closed own assets are served, noncached, with the strict content security policy and exact bytes', async () => {
  const host = await startHost();
  try {
    for (const [route, file, type] of [['/', 'index.html', 'text/html'], ['/cursor.js', 'cursor.js', 'text/javascript'], ['/reducer.js', 'reducer.js', 'text/javascript'],
      ['/page.js', 'page.js', 'text/javascript'], ['/style.css', 'style.css', 'text/css']]) {
      const { response, text } = await get(host, route);
      assert.equal(response.status, 200, route);
      assert.match(response.headers.get('content-type'), new RegExp(`^${type}`));
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
      assert.equal(response.headers.get('x-c044-scope'), 'synthetic-loopback-only');
      assert.equal(response.headers.get('access-control-allow-origin'), null);
      assert.equal(text, fs.readFileSync(path.join(root, file), 'utf8'));
    }
    for (const route of ['/page.js?x=1', '/run.json?x=1', '/stream?other=1', '/cursor?other=1']) {
      const { response, text } = await get(host, route);
      assert.equal(response.status, 400, route);
      assert.equal(JSON.parse(text).error.code, 'INVALID_QUERY');
    }
    const missing = await get(host, '/secret');
    assert.equal(missing.response.status, 404);
    assert.equal(JSON.parse(missing.text).error.code, 'NOT_FOUND');
    assert.equal((await get(host, '/%2e%2e/server.cjs')).response.status, 404);
    assert.equal((await get(host, '/tests/support.cjs')).response.status, 404);
  } finally {
    await host.close();
  }
});

test('run.json reports the attribution context, the snapshot, counters and explicit nonqualification flags', async () => {
  const host = await startHost();
  try {
    host.run.produce();
    const body = JSON.parse((await get(host, '/run.json')).text);
    assert.deepEqual(body.context, { origin: 'injected-fixture', runId: 'synthetic-run-001', epoch: 3, stateSha256: host.context.stateSha256 });
    assert.equal(body.run.headSeq, 1);
    assert.equal(body.run.resumeCursor, cursors.format('synthetic-run-001', 3, 1));
    assert.equal(body.counters.produced, 1);
    assert.deepEqual(body.restore, { persisted: false, restoredEvents: 0, created: true, tornTailBytesDiscarded: 0, knownEarlierEpochs: [] });
    assert.deepEqual(body.scope, scope);
    for (const flag of ['productionRuntimeValidated', 'identityVerified', 'nativeTargetQualified', 'controlApiImplemented', 'productionDurableStoreImplemented']) {
      assert.equal(body.scope[flag], false, flag);
    }
    assert.equal(body.scope.liveAzureRuns, 0);
    assert.equal(body.scope.authorizedCloudSpend, 0);
    assert.equal(body.scope.businessData, 'synthetic');
  } finally {
    await host.close();
  }
});

test('read-only methods, foreign origins, forged Host headers, bodies and oversized or invalid URLs are typed failures', async () => {
  const host = await startHost();
  try {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']) {
      const { response, text } = await get(host, '/run.json', { method });
      assert.equal(response.status, 405, method);
      if (method !== 'HEAD') assert.equal(JSON.parse(text).error.code, 'METHOD_NOT_ALLOWED');
    }
    const cross = await get(host, '/run.json', { headers: { Origin: 'https://example.invalid' } });
    assert.equal(cross.response.status, 403);
    assert.equal(JSON.parse(cross.text).error.code, 'CROSS_ORIGIN_DENIED');
    assert.equal((await get(host, '/run.json', { headers: { Origin: host.origin } })).response.status, 200);
    const forged = await openStream(host.origin, '/run.json', { Host: 'example.invalid' });
    assert.equal(forged.status, 421);
    assert.equal((await forged.json()).error.code, 'LOCAL_HOST_REQUIRED');
    for (const header of [{ 'Content-Length': '4' }, { 'Transfer-Encoding': 'chunked' }]) {
      const bodied = await rawConnect(host.port, '/run.json', header);
      await bodied.waitFor((state) => state.received.includes('\r\n\r\n') || state.closed, 'body refusal');
      assert.match(bodied.received, /^HTTP\/1\.1 400/);
      assert.match(bodied.received, /UNEXPECTED_BODY/);
      bodied.socket.destroy();
    }
    const long = await get(host, `/run.json?${'a'.repeat(2100)}`);
    assert.equal(long.response.status, 414);
    assert.equal(JSON.parse(long.text).error.code, 'URL_TOO_LONG');
    const absolute = await rawConnect(host.port, '//evil.invalid/x');
    await absolute.waitFor((state) => state.received.includes('\r\n\r\n') && state.closed === false, 'response head');
    assert.match(absolute.received, /^HTTP\/1\.1 400/);
    assert.match(absolute.received, /INVALID_URL/);
    absolute.socket.destroy();
    const broken = await rawConnect(host.port, 'http://[');
    await broken.waitFor((state) => state.received.includes('\r\n\r\n') || state.closed, 'broken target response');
    assert.match(broken.received, /^HTTP\/1\.1 400/);
    broken.socket.destroy();
  } finally {
    await host.close();
  }
});

test('an internal fault is an explicit SERVER_UNAVAILABLE and a fault after the headers closes the connection', async (t) => {
  const host = await startHost();
  try {
    t.mock.method(fs, 'readFileSync', () => { throw new Error('disk fault'); }, { times: 1 });
    const unavailable = await get(host, '/page.js');
    assert.equal(unavailable.response.status, 500);
    assert.equal(JSON.parse(unavailable.text).error.code, 'SERVER_UNAVAILABLE');
  } finally {
    await host.close();
  }
  const scheduler = manualScheduler();
  const real = createRun({ context: fixtureContext(), scheduler });
  const server = createLocalServer({ run: { ...real, attach() { throw new Error('attach failed'); } }, scheduler });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const raw = await rawConnect(server.address().port);
    await raw.waitFor((state) => state.closed, 'connection closed after the fault');
    assert.doesNotMatch(raw.received, /event:/, 'no event was delivered by a faulted attachment');
    assert.equal(real.counters.clientsAttached, 0);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('the listener lifecycle starts the run when listening and closes it when the server closes', async () => {
  const host = await startHost();
  assert.equal(host.run.snapshot().run.status, 'running');
  assert.equal(host.server.run, host.run);
  await host.close();
  assert.equal(host.run.snapshot().run.status, 'closed');
  assert.equal(host.scheduler.activeJobs(), 0);
  const { closeOwned } = require('../server.cjs');
  await closeOwned(host.server);
});

const approval = () => JSON.parse(JSON.stringify(approved.approval));
function loadStartLocal({ ledger, created = [], context = async () => fixtureContext(), guard } = {}) {
  const realFs = require('node:fs');
  const stubFs = { ...realFs, readFileSync(file, encoding) {
    if (typeof file === 'string' && file.endsWith('flow-state.json')) {
      if (ledger instanceof Error) throw ledger;
      return ledger;
    }
    return realFs.readFileSync(file, encoding);
  } };
  const realHttp = require('node:http');
  const stubHttp = { ...realHttp, createServer(...args) { created.push(args.length); return realHttp.createServer(...args); } };
  const replacements = { 'node:fs': stubFs, 'node:http': stubHttp, [contextFile]: { readContext: context } };
  if (guard) replacements[guardFile] = { guardOperation: guard };
  return freshLoad(serverFile, replacements);
}

test('startLocal rechecks the C001-approved consent with the real guard before any listener exists', async () => {
  const created = [];
  const scratch = scratchDirectory();
  try {
    const module = loadStartLocal({ ledger: JSON.stringify({ approvals: { C001: approval() } }), created });
    const server = await module.startLocal({ persistDir: scratch.directory, intervalMs: 50, totalSteps: 3 });
    try {
      assert.equal(server.address().address, '127.0.0.1');
      assert.equal(created.length, 1);
      const body = await (await fetch(`http://127.0.0.1:${server.address().port}/run.json`)).json();
      assert.equal(body.context.runId, 'synthetic-run-001');
      assert.equal(body.restore.persisted, true);
      assert.equal(body.run.totalSteps, 3);
    } finally {
      await module.closeOwned(server);
    }
  } finally {
    scratch.remove();
  }
});

test('missing, malformed, forged or drifted consent cannot create a listener', async () => {
  const bad = [
    new Error('ledger missing'), '{', '{}', JSON.stringify({ approvals: {} }),
    JSON.stringify({ approvals: { C001: { designAndLocalImplementationApproved: true } } }),
    JSON.stringify({ approvals: { C001: { ...approval(), liveAzureExecutionApproved: true } } }),
    JSON.stringify({ approvals: { C001: { ...approval(), authorizedCloudSpend: 1 } } }),
  ];
  for (const ledger of bad) {
    const created = [];
    const module = loadStartLocal({ ledger, created });
    await assert.rejects(module.startLocal(), /consent (is unavailable|denied)/, String(ledger));
    assert.equal(created.length, 0);
  }
  const created = [];
  const refusing = loadStartLocal({ ledger: JSON.stringify({ approvals: { C001: approval() } }), created, guard: async () => ({ allowed: false, reasons: [{ code: 'TEST_DENIED' }] }) });
  await assert.rejects(refusing.startLocal(), /consent denied: TEST_DENIED/);
  assert.equal(created.length, 0);
});

test('a context that C015 cannot restore stops startup before a run or listener exists', async () => {
  const created = [];
  const module = loadStartLocal({
    ledger: JSON.stringify({ approvals: { C001: approval() } }), created,
    context: async () => { throw Object.assign(new Error('ACTUAL_KNOWN_C015_CONTEXT_REQUIRED'), { code: 'ACTUAL_KNOWN_C015_CONTEXT_REQUIRED' }); },
  });
  await assert.rejects(module.startLocal(), /ACTUAL_KNOWN_C015_CONTEXT_REQUIRED/);
  assert.equal(created.length, 0);
});

test('a listener that cannot bind rejects with the bind error', async () => {
  const module = loadStartLocal({ ledger: JSON.stringify({ approvals: { C001: approval() } }) });
  const blocker = http.createServer();
  await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  const realListen = http.Server.prototype.listen;
  http.Server.prototype.listen = function failing() { setImmediate(() => this.emit('error', Object.assign(new Error('bind failed'), { code: 'EADDRINUSE' }))); return this; };
  try {
    await assert.rejects(module.startLocal({ persistDir: null }), /bind failed/);
  } finally {
    http.Server.prototype.listen = realListen;
    await new Promise((resolve) => blocker.close(resolve));
  }
});

test('the owned listener has a bounded lifetime constant and the CLI refuses overrides', () => {
  assert.equal(ttlMs, 600000);
  const run = spawnSync(process.execPath, [serverFile, '--host=0.0.0.0'], { encoding: 'utf8', env: clean(process.env), windowsHide: true });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /accepts no host, port/);
  assert.doesNotMatch(run.stdout, /listening/);
});

function startCli(scratchDir) {
  const env = { ...clean(process.env), C044_TEST_PERSIST_DIR: scratchDir };
  const child = spawn(process.execPath, ['--require', path.join(root, 'tests', 'cli-preload.cjs'), serverFile], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const state = { child, stdout: '', stderr: '', exit: null, exited: false };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  const wake = [];
  const poke = () => wake.splice(0).forEach((fn) => fn());
  child.stdout.on('data', (chunk) => { state.stdout += chunk; poke(); });
  child.stderr.on('data', (chunk) => { state.stderr += chunk; poke(); });
  child.on('exit', (code) => { state.exit = code; state.exited = true; poke(); });
  state.waitFor = (predicate, label) => new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error(`Timed out waiting for ${label}`)), 20000);
    const check = () => { if (predicate(state)) { clearTimeout(timer); done(state); } else wake.push(check); };
    check();
  });
  return state;
}

test('the real CLI starts under the consent gate, serves its own origin and closes on the exact stop command', async () => {
  const scratch = scratchDirectory();
  const cli = startCli(scratch.directory);
  try {
    await cli.waitFor((state) => state.stdout.includes('\n'), 'listening line');
    const line = JSON.parse(cli.stdout.split('\n')[0]);
    assert.equal(line.event, 'C044-local-listening');
    assert.equal(line.pid, cli.child.pid);
    assert.match(line.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(line.ttlMs, 600000);
    const body = await (await fetch(`${line.origin}/run.json`)).json();
    assert.equal(body.context.epoch, 3);
    assert.equal(body.restore.persisted, true);
    cli.child.stdin.write('stop\n');
    await cli.waitFor((state) => state.exited, 'exit');
    assert.equal(cli.exit, 0);
    assert.match(cli.stdout, /C044-local-closed/);
    assert.equal(cli.stderr, '');
  } finally {
    if (!cli.exited) cli.child.kill();
    await cli.waitFor((state) => state.exited, 'cleanup exit');
    scratch.remove();
  }
});

test('the real CLI rejects any other stdin command and still closes its listener', async () => {
  const scratch = scratchDirectory();
  const cli = startCli(scratch.directory);
  try {
    await cli.waitFor((state) => state.stdout.includes('\n'), 'listening line');
    cli.child.stdin.write('restart\n');
    await cli.waitFor((state) => state.exited, 'exit');
    assert.equal(cli.exit, 1);
    assert.match(cli.stderr, /Only the exact owned stop command is supported/);
    assert.match(cli.stdout, /C044-local-closed/);
  } finally {
    if (!cli.exited) cli.child.kill();
    await cli.waitFor((state) => state.exited, 'cleanup exit');
    scratch.remove();
  }
});

test('the real CLI reports a denied consent on stderr and exits non-zero without listening', async () => {
  const scratch = scratchDirectory();
  const preload = path.join(scratch.directory, 'deny.cjs');
  fs.writeFileSync(preload, "const fs=require('node:fs');const real=fs.readFileSync;fs.readFileSync=function(f,...r){if(typeof f==='string'&&f.endsWith('flow-state.json'))return '{}';return real.call(this,f,...r);};\n");
  try {
    const run = spawnSync(process.execPath, ['--require', preload, serverFile], { encoding: 'utf8', env: clean(process.env), windowsHide: true, timeout: 20000 });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /consent denied/);
    assert.doesNotMatch(run.stdout, /listening/);
  } finally {
    scratch.remove();
  }
});
