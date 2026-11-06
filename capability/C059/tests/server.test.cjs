'use strict';

// The loopback service, real sockets: assets and their strict headers, the step API over the C042 engine, ONE central
// refuse() proved by a TABLE of every refusal the service can emit before it reads a body (typed answer, Connection: close, the
// socket destroyed once flushed), keep-alive after a consumed refusal, the CLI and the data-name guard.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { c042, repository } = require('./harness.cjs');
const { call, raw, startService } = require('./net.cjs');
const server = require('../server.cjs');

const OPTIONS = { timeout: 30000 };
const root = path.resolve(__dirname, '..');
const input = (over = {}) => ({ schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: 'srv-key-0001', leaseId: 'synthetic-lease-001', units: 5, ...over });
const request = (port, line, headers = [], body = 'abcd') => `${line} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n${headers.join('\r\n')}${headers.length ? '\r\n' : ''}Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;

test('every page asset, pinned import and delivered lesson asset is served byte-exact with strict headers; lesson assets are framed under their own CSP', OPTIONS, async () => {
  const service = await startService();
  try {
    const files = { '/': 'index.html', '/page.js': 'page.js', '/journey.js': 'journey.js', '/a11y-check.js': 'a11y-check.js', '/styles.css': 'styles.css' };
    for (const [route, name] of Object.entries(files)) {
      const answer = await call(service.port, 'GET', route);
      assert.equal(answer.status, 200, route);
      assert.ok(answer.bytes.equals(fs.readFileSync(path.join(root, name))), `${route} bytes`);
      assert.match(answer.headers['content-security-policy'], /default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-src 'self'/);
      assert.equal(answer.headers['x-frame-options'], 'DENY');
      assert.equal(answer.headers['cache-control'], 'no-store');
      assert.equal(answer.headers['x-content-type-options'], 'nosniff');
      assert.match(answer.headers['permissions-policy'], /camera=\(\)/);
    }
    for (const [route, file] of [['/c042/contract.js', 'C042/contract.js'], ['/c041/accepted-catalog.js', 'C041/accepted-catalog.js'], ['/c041/host-policy.js', 'C041/host-policy.js'], ['/c041/lesson-host.js', 'C041/lesson-host.js']]) {
      assert.ok((await call(service.port, 'GET', route)).bytes.equals(fs.readFileSync(path.join(repository, 'capability', ...file.split('/')))), route);
    }
    const catalog = require(path.join(repository, 'capability', 'C041', 'accepted-catalog.js'));
    for (const lesson of catalog.lessons) {
      for (const asset of lesson.assets) {
        const answer = await call(service.port, 'GET', `/c041-lessons/${lesson.id}/${asset.file}`);
        assert.equal(answer.status, 200);
        assert.match(answer.headers['content-security-policy'], /sandbox allow-scripts/);
        assert.equal(answer.headers['x-frame-options'], undefined);
      }
    }
    assert.equal((await call(service.port, 'GET', '/c041-lessons/A-S002/index.html')).status, 404, 'a lesson that is not delivered is not served');
    const scope = (await call(service.port, 'GET', '/scope.json')).json;
    assert.deepEqual([scope.cardId, scope.screenReaderRun, scope.productionRuntimeValidated, scope.liveAzureRuns], ['C059', false, false, 0]);
  } finally {
    await service.stop();
  }
});

test('the step API: one effect per key, replay, conflict, capacity, inspect, an unknown action, and the lease ledger', OPTIONS, async () => {
  const service = await startService();
  try {
    const first = await call(service.port, 'POST', '/v1/steps', input());
    assert.equal(first.status, 201);
    assert.equal(c042('contract.js').validateResultEnvelope(first.json).ok, true);
    assert.equal((await call(service.port, 'POST', '/v1/steps', input())).status, 200, 'the same key and input replays');
    assert.equal((await call(service.port, 'POST', '/v1/steps', input({ units: 6 }))).json.error.code, 'IDEMPOTENCY_KEY_CONFLICT');
    assert.equal((await call(service.port, 'POST', '/v1/steps', input({ idempotencyKey: 'srv-key-0002', leaseId: 'synthetic-lease-002', units: 10 }))).status, 201);
    assert.equal((await call(service.port, 'POST', '/v1/steps', input({ idempotencyKey: 'srv-key-0003', leaseId: 'synthetic-lease-002', units: 1 }))).json.error.code, 'CAPACITY_EXHAUSTED');
    assert.equal((await call(service.port, 'GET', '/v1/steps/srv-key-0001')).status, 200);
    assert.equal((await call(service.port, 'GET', '/v1/steps/srv-key-9999')).json.error.code, 'STEP_NOT_FOUND');
    assert.equal((await call(service.port, 'POST', '/v1/steps/srv-key-0001/frobnicate')).json.error.code, 'UNSUPPORTED_ACTION');
    assert.equal((await call(service.port, 'POST', '/v1/steps/srv-key-0001/cancel')).json.error.code, 'ACTION_NOT_ALLOWED');
    assert.equal((await call(service.port, 'GET', '/v1/leases')).json.leases['synthetic-lease-001'].committed, 5);
    for (const [body, code] of [['{"units":', 'INVALID_JSON'], ['', 'REQUIRED_JSON'], ['{}', 'REQUIRED_FIELD'], ['[]', 'INVALID_SHAPE']]) {
      assert.equal((await call(service.port, 'POST', '/v1/steps', body)).json.error.code, code, body);
    }
  } finally {
    await service.stop();
  }
});

test('a step in flight is inspected as in flight, cancelled explicitly, and a duplicate joins it', OPTIONS, async () => {
  const service = await startService({ hold: true });
  try {
    const pending = call(service.port, 'POST', '/v1/steps', input({ idempotencyKey: 'srv-hold-0001' }));
    await service.held.entered('srv-hold-0001');
    const inspected = await call(service.port, 'GET', '/v1/steps/srv-hold-0001');
    assert.equal(inspected.status, 202);
    assert.equal(inspected.json.error.code, 'STEP_IN_FLIGHT');
    const cancelled = await call(service.port, 'POST', '/v1/steps/srv-hold-0001/cancel');
    assert.equal(cancelled.json.outcome, 'cancelled');
    service.held.release('srv-hold-0001');
    await pending.catch(() => {});
  } finally {
    await service.stop();
  }
});

const TABLE = [
  ['a foreign Host', () => 'GET / HTTP/1.1\r\nHost: example.test\r\nContent-Length: 4\r\n\r\nabcd', 421, 'LOCAL_HOST_REQUIRED'],
  ['a cross origin', (port) => request(port, 'GET /scope.json', ['Origin: http://evil.test']), 403, 'CROSS_ORIGIN_DENIED'],
  ['a URL that is too long', (port) => request(port, `GET /${'a'.repeat(2100)}`), 414, 'URL_TOO_LONG'],
  ['another authority in the target', (port) => request(port, 'GET //evil.test/x'), 400, 'INVALID_URL'],
  ['a fragment', (port) => request(port, 'GET /scope.json#x'), 400, 'INVALID_URL'],
  ['a query', (port) => request(port, 'GET /v1/leases?x=1'), 400, 'INVALID_QUERY'],
  ['a GET with a body', (port) => request(port, 'GET /v1/leases', [], 'abcd'), 400, 'UNEXPECTED_BODY'],
  ['PUT on the step route', (port) => request(port, 'PUT /v1/steps', [], 'abcd'), 405, 'METHOD_NOT_ALLOWED'],
  ['DELETE on an asset', (port) => request(port, 'DELETE /scope.json', [], 'abcd'), 405, 'METHOD_NOT_ALLOWED'],
  ['POST on an asset', (port) => request(port, 'POST /scope.json', [], 'abcd'), 405, 'METHOD_NOT_ALLOWED'],
  ['HEAD', (port) => request(port, 'HEAD /'), 405, null],
  ['an unknown route', (port) => request(port, 'POST /admin', [], 'abcd'), 404, 'NOT_FOUND'],
  ['an upper-case action name', (port) => request(port, 'POST /v1/steps/srv-key-0001/Cancel', [], 'abcd'), 404, 'NOT_FOUND'],
  ['no transcript configured (bodiless: nothing to leave unread)', (port) => request(port, 'GET /transcript.json', ['Connection: close'], ''), 404, 'NOT_FOUND'],
  ['a wrong media type', (port) => request(port, 'POST /v1/steps', ['Content-Type: text/plain'], 'abcd'), 415, 'UNSUPPORTED_MEDIA_TYPE'],
  ['a declared body that is too large', (port) => `POST /v1/steps HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: 5000\r\n\r\nabcd`, 413, 'BODY_TOO_LARGE'],
  ['a key that is not a key (inspect; bodiless)', (port) => request(port, 'GET /v1/steps/bad%20key', ['Connection: close'], ''), 400, 'INVALID_FORMAT'],
  ['a key that is not a key (action)', (port) => request(port, 'POST /v1/steps/not%20a%20key/cancel'), 400, 'INVALID_FORMAT'],
  ['an action with a body', (port) => request(port, 'POST /v1/steps/srv-key-0001/cancel', [], 'abcd'), 400, 'UNEXPECTED_BODY'],
  ['a GET on an action route', (port) => request(port, 'GET /v1/steps/srv-key-0001/cancel'), 405, 'METHOD_NOT_ALLOWED'],
];

for (const [name, make, status, code] of TABLE) {
  test(`refusal table: ${name} is answered ${status} ${code} with Connection: close and the socket is destroyed`, OPTIONS, async () => {
    const service = await startService();
    try {
      const answer = await raw(service.port, make(service.port));
      assert.equal(answer.status, status, answer.received.slice(0, 200));
      assert.equal(answer.headers.connection, 'close');
      assert.equal(answer.closed, true, 'the server destroyed the socket once the answer was flushed');
      if (code !== null) {
        assert.equal(answer.json.error.code, code);
        assert.equal(answer.json.accepted, false);
      }
    } finally {
      await service.stop();
    }
  });
}

test('a refusal after the body was read keeps the connection alive: two pipelined requests are both answered', OPTIONS, async () => {
  const service = await startService();
  try {
    const bad = request(service.port, 'POST /v1/steps', ['Content-Type: application/json'], '{}');
    const answers = await raw(service.port, `${bad}${request(service.port, 'GET /v1/leases', ['Connection: close'], '')}`);
    assert.equal(answers.received.match(/HTTP\/1\.1 \d{3} /g).length, 2);
    assert.match(answers.received, /^HTTP\/1\.1 400 /);
    assert.doesNotMatch(answers.received.split('\r\n\r\n')[0], /connection: close/i);
  } finally {
    await service.stop();
  }
});

test('the CLI accepts only --data-dir and --settle-ms, prints one JSON line with the exact origin, and closes on a signal', OPTIONS, async () => {
  assert.deepEqual(server.parseArguments([]), { dataName: null, settleMs: 0 });
  assert.deepEqual(server.parseArguments(['--data-dir=demo', '--settle-ms=2500']), { dataName: 'demo', settleMs: 2500 });
  for (const bad of [['--port=80'], ['--host=0.0.0.0'], ['--settle-ms=60001'], ['--settle-ms=-1'], ['--data-dir=a', '--data-dir=b'], ['--settle-ms=abc'], ['x']]) assert.equal(server.parseArguments(bad), null, bad.join(' '));
  const errors = [];
  assert.equal(await server.runCli(['--host=0.0.0.0'], { error: (line) => errors.push(line) }), 1);
  assert.match(errors[0], /no host, port, identity or deployment override/);
  const lines = [];
  let closer;
  assert.equal(await server.runCli([], { log: (line) => lines.push(line), onSignal: (handler) => { closer = handler; } }), 0);
  const listening = JSON.parse(lines[0]);
  assert.match(listening.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(listening.journal, 'memory (not persisted)');
  assert.equal(listening.scope.liveAzureRuns, 0);
  assert.equal((await call(Number(new URL(listening.origin).port), 'GET', '/scope.json')).status, 200);
  await closer();
  const failed = [];
  assert.equal(await server.runCli(['--data-dir=nul'], { error: (line) => failed.push(line) }), 1);
  assert.match(failed[0], /did not start: The data name must be/);
});

test('the data name is validated: device names, trailing dots and bad characters are refused before anything is created', OPTIONS, async () => {
  for (const name of ['nul', 'CON', 'prn.txt', 'aux', 'com1', 'LPT9', 'name.', '.hidden', '-lead', 'a b', '../up', 'a/b', '', 'x'.repeat(40)]) {
    await assert.rejects(server.startLocal({ dataName: name }), /The data name must be/, name);
  }
  assert.equal(fs.existsSync(path.join(root, 'data')), false, 'nothing was created');
});

test('a file journal persists across a restart: the step is replayed, not applied twice', OPTIONS, async () => {
  const name = `t-${Date.now().toString(36)}`;
  const first = await server.startLocal({ dataName: name });
  try {
    assert.equal((await call(first.address().port, 'POST', '/v1/steps', input({ idempotencyKey: 'srv-file-0001' }))).status, 201);
  } finally {
    await server.closeServer(first);
  }
  const second = await server.startLocal({ dataName: name });
  try {
    const again = await call(second.address().port, 'POST', '/v1/steps', input({ idempotencyKey: 'srv-file-0001' }));
    assert.equal(again.status, 200);
    assert.equal(again.json.replayed, true);
  } finally {
    await server.closeServer(second);
    fs.rmSync(path.join(root, 'data'), { recursive: true, force: true });
  }
});

test('readOwned refuses a directory, a missing file and a path that resolves elsewhere; loadAssets reads each file once', OPTIONS, async () => {
  assert.throws(() => server.readOwned(root), /owned regular file/);
  assert.throws(() => server.readOwned(path.join(root, 'no-such-file.js')), /ENOENT/);
  const assets = server.loadAssets();
  assert.ok(assets.has('/') && assets.has('/c041-lessons/A-S001/index.html') && assets.has('/c042/contract.js'));
});
