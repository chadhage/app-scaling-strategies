'use strict';

// The transcript page server and the local fixture start-up, over real HTTP/1.1 and HTTP/2 loopback sockets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { test } = require('node:test');
const approved = require('../../C001/approved-contract.js');
const { connect } = require('../driver.cjs');
const { createWebServer, closeWeb, startLocal, runCli, scope } = require('../server.cjs');
const { produceTranscript } = require('../transcript.cjs');
const { until } = require('./support.cjs');

const root = path.resolve(__dirname, '..');
const ledgerWith = (approval) => () => JSON.stringify({ approvals: { C001: approval } });

async function withWeb(options, fn) {
  const server = createWebServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await fn(server, `http://127.0.0.1:${server.address().port}`);
  } finally {
    await closeWeb(server);
  }
}

const get = (origin, route, options = {}) => fetch(`${origin}${route}`, options);
const rawHttp = (port, text) => new Promise((resolve) => {
  const socket = net.connect(port, '127.0.0.1', () => socket.write(text));
  const chunks = [];
  socket.on('data', (chunk) => chunks.push(chunk));
  socket.on('error', () => undefined);
  socket.on('close', () => resolve(Buffer.concat(chunks).toString()));
});

test('the assets are served byte for byte with a strict CSP, no caching and the synthetic-scope stamp', () => withWeb({ transcript: async () => ({}) }, async (server, origin) => {
  for (const [route, file, type] of [['/', 'index.html', 'text/html; charset=utf-8'], ['/page.js', 'page.js', 'text/javascript; charset=utf-8'], ['/styles.css', 'styles.css', 'text/css; charset=utf-8']]) {
    const response = await get(origin, route);
    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get('content-type'), type);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), fs.readFileSync(path.join(root, file)), route);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-c028-scope'), 'synthetic-loopback-only');
    assert.equal(response.headers.get('content-security-policy'),
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  }
  const body = await (await get(origin, '/scope.json')).json();
  assert.deepEqual(body, JSON.parse(JSON.stringify(scope)));
  assert.deepEqual([body.productionRuntimeValidated, body.identityVerified, body.nativeTargetQualified, body.liveAzureRuns, body.authorizedCloudSpend, body.browserNativeGrpcObserved], [false, false, false, 0, 0, false]);
}));

test('/transcript.json serves what the transcript producer returns and fails explicitly when it cannot', async () => {
  await withWeb({ transcript: async () => ({ marker: 'stub' }) }, async (server, origin) => {
    assert.deepEqual(await (await get(origin, '/transcript.json')).json(), { marker: 'stub' });
  });
  await withWeb({ transcript: async () => { throw new Error('private detail'); } }, async (server, origin) => {
    const response = await get(origin, '/transcript.json');
    const body = await response.json();
    assert.equal(response.status, 500);
    assert.equal(body.error.code, 'TRANSCRIPT_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(body), /private detail/);
  });
});

test('concurrent /transcript.json requests share one running conversation and a failed one can be retried', async () => {
  let started = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await withWeb({ transcript: async () => { started += 1; await gate; return { marker: started }; } }, async (server, origin) => {
    let arrived = 0;
    server.on('request', () => { arrived += 1; });
    const pending = Array.from({ length: 5 }, () => get(origin, '/transcript.json').then((response) => response.json()));
    assert.equal(await until(() => arrived === 5), true, 'all five requests reached the server while the conversation was still running');
    release();
    assert.deepEqual(await Promise.all(pending), Array(5).fill({ marker: 1 }));
    assert.deepEqual(await (await get(origin, '/transcript.json')).json(), { marker: 2 }, 'a later request starts a new conversation');
  });
  let attempts = 0;
  await withWeb({ transcript: () => { attempts += 1; if (attempts === 1) throw new Error('first fails'); return { marker: 'ok' }; } }, async (server, origin) => {
    assert.equal((await get(origin, '/transcript.json')).status, 500);
    assert.deepEqual(await (await get(origin, '/transcript.json')).json(), { marker: 'ok' });
  });
});

test('the default transcript is a real, reproducible gRPC conversation', () => withWeb({}, async (server, origin) => {
  const first = await (await get(origin, '/transcript.json')).json();
  const second = await (await get(origin, '/transcript.json')).json();
  assert.deepEqual(first, second);
  assert.deepEqual(first.calls.map((call) => call.id), ['watch-ok', 'chat-ok', 'watch-cancelled', 'watch-deadline', 'unknown-method', 'invalid-argument', 'message-too-large']);
  assert.deepEqual(first, JSON.parse(JSON.stringify(await produceTranscript())));
}));

test('foreign hosts, foreign origins, writes, bodies, queries and unknown routes are refused explicitly', () => withWeb({ transcript: async () => ({}) }, async (server, origin) => {
  const port = server.address().port;
  const status = async (text) => Number(/^HTTP\/1\.1 (\d+)/.exec(await rawHttp(port, text))[1]);
  assert.equal(await status(`GET / HTTP/1.1\r\nHost: evil.example:${port}\r\nConnection: close\r\n\r\n`), 421);
  assert.equal(await status(`GET / HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: http://evil.example\r\nConnection: close\r\n\r\n`), 403);
  assert.equal(await status(`GET /x HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Length: 3\r\nConnection: close\r\n\r\nabc`), 400);
  assert.equal(await status(`GET http://evil.example/ HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`), 400);
  assert.equal(await status(`GET // HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`), 400);
  for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await get(origin, '/', { method })).status, 405);
  for (const route of ['/?x=1', '/page.js?v=2', '/scope.json?a', '/transcript.json?x=1']) assert.equal((await get(origin, route)).status, 400, route);
  for (const route of ['/missing', '/index.html', '/../server.cjs', '/stream']) assert.equal((await get(origin, route)).status, 404, route);
  const refused = await (await get(origin, '/missing')).json();
  assert.deepEqual([refused.error.code, refused.localOnly, refused.businessData], ['NOT_FOUND', true, 'synthetic']);
}));

test('an unexpected failure while serving an asset is a generic 500 that leaks nothing', async (t) => {
  await withWeb({ transcript: async () => ({}) }, async (server, origin) => {
    t.mock.method(fs, 'readFileSync', () => { throw new Error('disk path C:\\secret'); });
    const response = await get(origin, '/page.js');
    const body = await response.json();
    assert.equal(response.status, 500);
    assert.equal(body.error.code, 'FIXTURE_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(body), /secret/);
  });
});

test('startLocal rechecks C001 consent, binds only 127.0.0.1 and serves both the page and real gRPC', async () => {
  const local = await startLocal({ readLedger: ledgerWith(approved.approval) });
  try {
    assert.equal(local.web.address().address, '127.0.0.1');
    assert.equal(new URL(local.grpc.origin).hostname, '127.0.0.1');
    assert.notEqual(local.web.address().port, new URL(local.grpc.origin).port);
    assert.equal((await get(`http://127.0.0.1:${local.web.address().port}`, '/scope.json')).status, 200);
    const client = await connect(local.grpc.origin);
    try {
      const report = await client.call('/acme.ticker.v1.Ticker/Watch', { topic: 'alpha', count: 3 }).result;
      assert.deepEqual([report.ok, report.messageCount], [true, 3]);
    } finally {
      client.close();
    }
  } finally {
    await local.close();
  }
  assert.equal(local.web.listening, false);
});

test('startLocal refuses to bind anything without current C001 consent', async () => {
  await assert.rejects(startLocal({ readLedger: ledgerWith({ ...approved.approval, expenditureApproved: true }) }), /C001 local consent denied: .*APPROVAL_DRIFT/);
  await assert.rejects(startLocal({ readLedger: () => JSON.stringify({ approvals: {} }) }), /C001 local consent denied: .*APPROVAL_MISSING/);
  await assert.rejects(startLocal({ readLedger: () => { throw new Error('no ledger'); } }), /current consent is unavailable; the local listeners were not started/);
  await assert.rejects(startLocal({ readLedger: () => '{not json' }), /current consent is unavailable/);
});

test('runCli prints one JSON line with both origins, accepts no overrides and reports start-up failures', async () => {
  const lines = [];
  const errors = [];
  const handlers = [];
  let closed = 0;
  const local = { web: { address: () => ({ port: 4321 }) }, grpc: { origin: 'http://127.0.0.1:4322' }, close: async () => { closed += 1; } };
  assert.equal(await runCli([], { start: async () => local, log: (line) => lines.push(line), error: (line) => errors.push(line), onSignal: (handler) => handlers.push(handler) }), 0);
  const printed = JSON.parse(lines[0]);
  assert.deepEqual([printed.event, printed.pid, printed.page, printed.grpc], ['C028-local-listening', process.pid, 'http://127.0.0.1:4321', 'http://127.0.0.1:4322']);
  assert.equal(printed.scope.cardId, 'C028');
  await handlers[0]();
  assert.equal(closed, 1);
  assert.equal(await runCli(['--port', '80'], { start: async () => local, error: (line) => errors.push(line) }), 1);
  assert.match(errors[0], /accepts no host, port, limit, identity, or deployment overrides/);
  assert.equal(await runCli([], { start: async () => { throw new Error('consent denied'); }, error: (line) => errors.push(line) }), 1);
  assert.equal(errors[1], 'consent denied');
});

test('runCli registers SIGINT and SIGTERM handlers by default that close the listeners exactly once', async () => {
  const before = { SIGINT: process.listeners('SIGINT'), SIGTERM: process.listeners('SIGTERM') };
  let closed = 0;
  const local = { web: { address: () => ({ port: 1 }) }, grpc: { origin: 'http://127.0.0.1:2' }, close: async () => { closed += 1; } };
  assert.equal(await runCli([], { start: async () => local, log: () => undefined }), 0);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const added = process.listeners(signal).filter((listener) => !before[signal].includes(listener));
    assert.equal(added.length, 1, signal);
    process.off(signal, added[0]);
    await added[0]();
  }
  assert.equal(closed, 2);
});
