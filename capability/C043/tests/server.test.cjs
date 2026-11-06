'use strict';

// The loopback service over real sockets: routes, strict headers, every typed refusal (table-driven, each one valid and
// closing the connection), the preset flows, shutdown, the command line and the file journals.
const test = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const approved = require('../../C001/approved-contract.js');
const { closeServer, createLocalServer, parseArguments, runCli, startLocal } = require('../server.cjs');
const { validateCatalog, validateResultEnvelope } = require('../envelope.js');
const { checkAnswer } = require('../verify.js');
const {
  assert, boot, call, doc, gate, has, raw, startService, step, text, root,
} = require('./support.cjs');

const ledgerWith = (approval) => () => JSON.stringify({ approvals: { C001: approval } });
const dataRoot = path.join(__dirname, '..', 'data');
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

test('assets, the declared presets and the read-only routes carry the strict headers', { timeout: 30000 }, async () => {
  const service = await startService();
  try {
    for (const route of ['/', '/page.js', '/styles.css', '/contract.js', '/validate.js', '/envelope.js', '/verify.js', '/c042-contract.js', '/scope.json', '/v1/presets', '/v1/leases', '/v1/journal']) {
      const answer = await call(service.port, 'GET', route);
      assert.equal(answer.status, 200, route);
      assert.equal(answer.headers['content-security-policy'], CSP, route);
      assert.equal(answer.headers['x-content-type-options'], 'nosniff');
      assert.equal(answer.headers['cache-control'], 'no-store');
      assert.equal(answer.headers['referrer-policy'], 'no-referrer');
    }
    assert.equal((await call(service.port, 'GET', '/c042-contract.js')).text, fs.readFileSync(path.join(root, '..', 'C042', 'contract.js'), 'utf8'), 'the page validates with the accepted C042 file itself');
    assert.equal(/<script(?![^>]*\bsrc=)/.test((await call(service.port, 'GET', '/')).text), false, 'no inline script');
    assert.equal(validateCatalog((await call(service.port, 'GET', '/v1/presets')).json).ok, true);
    const scope = (await call(service.port, 'GET', '/scope.json')).json;
    assert.deepEqual([scope.productionRuntimeValidated, scope.identityVerified, scope.realServiceRegistered, scope.c017ReconciliationImplemented, scope.liveAzureRuns, scope.authorizedCloudSpend], [false, false, false, false, 0, 0]);
    assert.deepEqual((await call(service.port, 'GET', '/v1/journal')).json.discardedTailBytes, 0);
  } finally {
    await service.stop();
  }
});

test('the preset flows over real sockets: run, replay, conflict, inspect, refused controls', { timeout: 30000 }, async () => {
  const service = await startService();
  try {
    const { port } = service;
    const first = await call(port, 'POST', '/v1/presets', doc());
    assert.equal(first.status, 201);
    assert.equal(checkAnswer(first.status, first.json, doc()).ok, true);
    const again = await call(port, 'POST', '/v1/presets', doc());
    assert.deepEqual([again.status, again.json.replayed], [200, true]);
    assert.equal(checkAnswer(again.status, again.json, doc()).ok, true);
    const conflict = await call(port, 'POST', '/v1/presets', doc({ steps: [step(1), step(2, { units: 6 }), step(3)] }));
    assert.deepEqual([conflict.status, conflict.json.error.code], [409, 'IDEMPOTENCY_KEY_CONFLICT']);
    assert.equal(checkAnswer(conflict.status, conflict.json, doc({ steps: [step(1), step(2, { units: 6 }), step(3)] })).ok, true);
    const inspected = await call(port, 'GET', '/v1/presets/preset-run-0001');
    assert.deepEqual([inspected.status, inspected.json.action, inspected.json.run.state], [200, 'inspect', 'completed']);
    assert.equal((await call(port, 'POST', '/v1/presets/preset-run-0001/cancel')).json.error.code, 'ACTION_NOT_ALLOWED');
    assert.equal((await call(port, 'POST', '/v1/presets/preset-run-0001/resume')).json.error.code, 'ACTION_NOT_ALLOWED');
    const undo = await call(port, 'POST', '/v1/presets/preset-run-0001/undo');
    assert.deepEqual([undo.status, undo.json.error.code], [422, 'UNSUPPORTED_ACTION']);
    assert.equal(has(undo.json, 'ACTION_NOT_PERFORMED'), true);
    assert.equal((await call(port, 'GET', '/v1/leases')).json.leases['synthetic-lease-001'].committed, 15);
    const bad = await call(port, 'POST', '/v1/presets', doc({ steps: [step(1), step(2), step(3, { units: 11 })], idempotencyKey: 'preset-run-0002' }));
    assert.deepEqual([bad.status, bad.json.error.code, bad.json.error.details[0].path], [400, 'FIELD_OUT_OF_RANGE', 'steps[2].units']);
    assert.equal((await call(port, 'GET', '/v1/presets/preset-run-0002')).json.error.code, 'RUN_NOT_FOUND');
  } finally {
    await service.stop();
  }
});

const rawHost = (p, lines, tail) => raw(p, lines.map((line) => line.replace('Host: HOST', `Host: 127.0.0.1:${p}`)), tail);
// The request body of a refusal case.
const body = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
const post = (target, payload, extra = []) => ['POST ' + target + ' HTTP/1.1', 'Host: HOST', 'Content-Type: application/json', `Content-Length: ${payload.length}`, ...extra];
const REFUSALS = [
  ['invalid JSON', (p) => rawHost(p, post('/v1/presets', body('{nope')), '{nope'), 'INVALID_JSON', 400],
  ['an empty body', (p) => call(p, 'POST', '/v1/presets', ''), 'REQUIRED_JSON', 400],
  ['a duplicated key', (p) => call(p, 'POST', '/v1/presets', JSON.stringify(doc()).replace('"preset":"bounded-sequence"', '"preset":"bounded-sequence","preset":"x"')), 'DUPLICATE_FIELD', 400],
  ['an unknown version', (p) => call(p, 'POST', '/v1/presets', doc({ schemaVersion: 2 })), 'UNSUPPORTED_PRESET_VERSION', 422],
  ['a static bound', (p) => call(p, 'POST', '/v1/presets', doc({ bounds: { maxSteps: 4, maxDurationMs: 1000, maxUnits: 14 } })), 'PRESET_BOUND_EXCEEDED', 409],
  ['a wrong media type', (p) => call(p, 'POST', '/v1/presets', '{}', { 'Content-Type': 'text/plain' }), 'UNSUPPORTED_MEDIA_TYPE', 415],
  ['a declared body that is too large', (p) => call(p, 'POST', '/v1/presets', Buffer.alloc(2049, 120)), 'BODY_TOO_LARGE', 413],
  ['a streamed body that is too large', (p) => rawHost(p, ['POST /v1/presets HTTP/1.1', 'Host: HOST', 'Content-Type: application/json', 'Transfer-Encoding: chunked'], `${(3000).toString(16)}\r\n${'x'.repeat(3000)}\r\n0\r\n\r\n`), 'BODY_TOO_LARGE', 413],
  ['a declared large body that never arrives', (p) => rawHost(p, post('/v1/presets', { length: 3000 })), 'BODY_TOO_LARGE', 413],
  ['a GET with a body', (p) => rawHost(p, ['GET /v1/leases HTTP/1.1', 'Host: HOST', 'Content-Length: 2'], '{}'), 'UNEXPECTED_BODY', 400],
  ['an action with a body', (p) => rawHost(p, ['POST /v1/presets/abcdefgh/cancel HTTP/1.1', 'Host: HOST', 'Content-Length: 2'], '{}'), 'UNEXPECTED_BODY', 400],
  ['a query', (p) => call(p, 'GET', '/v1/leases?x=1'), 'INVALID_QUERY', 400],
  ['a wrong method', (p) => call(p, 'PUT', '/v1/presets', '{}'), 'METHOD_NOT_ALLOWED', 405],
  ['a write to a read-only route', (p) => call(p, 'POST', '/scope.json', ''), 'METHOD_NOT_ALLOWED', 405],
  ['an unknown route', (p) => call(p, 'GET', '/nothing'), 'NOT_FOUND', 404],
  ['an invalid key', (p) => call(p, 'GET', '/v1/presets/short'), 'INVALID_FORMAT', 400],
  ['an invalid key on an action', (p) => call(p, 'POST', '/v1/presets/short/cancel', ''), 'INVALID_FORMAT', 400],
  ['a missing preset (inspect)', (p) => call(p, 'GET', '/v1/presets/abcdefgh'), 'RUN_NOT_FOUND', 404],
  ['a missing preset (cancel)', (p) => call(p, 'POST', '/v1/presets/abcdefgh/cancel', ''), 'RUN_NOT_FOUND', 404],
  ['a missing preset (resume)', (p) => call(p, 'POST', '/v1/presets/abcdefgh/resume', ''), 'RUN_NOT_FOUND', 404],
  ['an action that does not exist', (p) => call(p, 'POST', '/v1/presets/abcdefgh/undo', ''), 'UNSUPPORTED_ACTION', 422],
  ['a foreign host', (p) => call(p, 'GET', '/v1/leases', undefined, { Host: 'evil.example' }), 'LOCAL_HOST_REQUIRED', 421],
  ['a foreign origin', (p) => call(p, 'GET', '/v1/leases', undefined, { Origin: 'http://evil.example' }), 'CROSS_ORIGIN_DENIED', 403],
  ['a URL that is too long', (p) => call(p, 'GET', `/${'a'.repeat(2100)}`), 'URL_TOO_LONG', 414],
  ['an absolute URL for another origin', (p) => rawHost(p, ['GET http://other.example/v1/leases HTTP/1.1', 'Host: HOST']), 'INVALID_URL', 400],
  ['a fragment-bearing target', (p) => rawHost(p, ['GET /v1/leases#frag HTTP/1.1', 'Host: HOST']), 'INVALID_URL', 400],
  ['a malformed percent escape', (p) => rawHost(p, ['GET /%zz HTTP/1.1', 'Host: HOST']), 'NOT_FOUND', 404],
];

test('every typed refusal is a valid envelope, carries its status and closes the connection', { timeout: 60000 }, async (context) => {
  const service = await startService();
  try {
    for (const [name, send, code, status] of REFUSALS) {
      await context.test(name, async () => {
        const answer = await send(service.port).catch(() => null);
        assert.notEqual(answer, null, 'an answer was delivered');
        const fixed = answer.json ?? (answer.text ? JSON.parse(answer.text) : null);
        assert.equal(answer.status, status);
        assert.equal(fixed.error.code, code);
        assert.equal(answer.headers.connection, 'close', 'a refusal is never kept alive');
        assert.equal(validateResultEnvelope(fixed).ok, true, JSON.stringify(validateResultEnvelope(fixed).problems));
        assert.equal(checkAnswer(answer.status, fixed, undefined).ok, true);
      });
    }
  } finally {
    await service.stop();
  }
});

test('faults the service cannot foresee are typed: an internal error, a missing or failing transcript, a halted runner', { timeout: 30000 }, async () => {
  const booted = await boot();
  const broken = createLocalServer({ engine: { snapshot() { throw new Error('boom'); }, tornTailBytes: 0, halt() {} }, runner: booted.runner, transcript: null });
  await new Promise((resolve) => broken.listen(0, '127.0.0.1', resolve));
  try {
    const answer = await call(broken.address().port, 'GET', '/v1/leases');
    assert.deepEqual([answer.status, answer.json.error.code], [500, 'INTERNAL_ERROR']);
    assert.equal((await call(broken.address().port, 'GET', '/transcript.json')).json.error.code, 'NOT_FOUND');
  } finally {
    await closeServer(broken);
  }
  const failing = await startService({ transcript: () => Promise.reject(new Error('no')) });
  try {
    const first = await call(failing.port, 'GET', '/transcript.json');
    assert.deepEqual([first.status, first.json.error.code], [500, 'TRANSCRIPT_UNAVAILABLE']);
    assert.equal((await call(failing.port, 'GET', '/transcript.json')).status, 500, 'a failure is retried, not cached');
    failing.runner.halt();
    const halted = await call(failing.port, 'POST', '/v1/presets', doc());
    assert.deepEqual([halted.status, halted.json.error.code], [503, 'RUN_JOURNAL_UNAVAILABLE']);
  } finally {
    await failing.stop();
  }
});

test('shutdown never waits for a peer: half-open, silent and partial clients are all dropped', { timeout: 30000 }, async () => {
  const service = await startService();
  const peers = [];
  for (const bytes of [null, 'GET /v1/leases HTTP/1.1\r\n', 'POST /v1/presets HTTP/1.1\r\nHost: x\r\nContent-Length: 50\r\n\r\n{']) {
    const peer = net.connect({ host: '127.0.0.1', port: service.port, allowHalfOpen: true });
    await new Promise((resolve) => peer.once('connect', resolve));
    if (bytes) peer.write(bytes);
    peer.on('error', () => {});
    peers.push(peer);
  }
  const started = process.hrtime.bigint();
  await service.stop();
  assert.equal(Number(process.hrtime.bigint() - started) / 1e6 < 5000, true, 'shutdown took far less than any timer');
  for (const peer of peers) peer.destroy();
});

test('closing the server stops the step service: a step released after shutdown writes nothing', { timeout: 30000 }, async () => {
  const held = gate();
  const service = await startService({ executor: held.executor });
  const pending = call(service.port, 'POST', '/v1/presets', doc()).catch(() => null);
  await held.entered('preset-a-step-1');
  const before = service.stepIo.read();
  await service.stop();
  held.release('preset-a-step-1');
  for (let turn = 0; turn < 5; turn += 1) await new Promise((resolve) => setImmediate(resolve));
  await pending;
  assert.equal(service.stepIo.read(), before, 'no commit was written after shutdown');
  assert.equal(service.stepIo.read().includes('"type":"commit"'), false);
});

test('arguments are closed: only a data name and a bounded settle time are accepted', { timeout: 30000 }, () => {
  assert.deepEqual(parseArguments([]), { dataName: null, settleMs: 0 });
  assert.deepEqual(parseArguments(['--data-dir=demo', '--settle-ms=2500']), { dataName: 'demo', settleMs: 2500 });
  assert.deepEqual(parseArguments(['--settle-ms=60000']), { dataName: null, settleMs: 60000 });
  for (const bad of [['--port=1'], ['--host=0.0.0.0'], ['--settle-ms=60001'], ['--settle-ms=abc'], ['--settle-ms=-1'], ['--settle-ms=1.5'],
    ['--data-dir=a', '--data-dir=b'], ['--data-dir='], ['extra'], ['--identity=x'], ['--settle-ms=123456']]) {
    assert.equal(parseArguments(bad), null, bad.join(' '));
  }
});

test('startLocal rechecks C001 consent, binds 127.0.0.1 and serves; missing or drifted consent keeps it from starting', { timeout: 30000 }, async () => {
  const server = await startLocal({ readLedger: ledgerWith(approved.approval) });
  try {
    const address = server.address();
    assert.deepEqual([address.address, address.family, address.port > 0], ['127.0.0.1', 'IPv4', true]);
    assert.equal((await call(address.port, 'POST', '/v1/presets', doc())).status, 201);
    assert.deepEqual([(await call(address.port, 'GET', '/transcript.json')).status], [200]);
  } finally {
    await closeServer(server);
    await closeServer(server);
  }
  await assert.rejects(startLocal({ readLedger: ledgerWith({ ...approved.approval, expenditureApproved: true }) }), /C001 local consent denied: .*APPROVAL_DRIFT/);
  await assert.rejects(startLocal({ readLedger: () => JSON.stringify({ approvals: {} }) }), /C001 local consent denied: .*APPROVAL_MISSING/);
  await assert.rejects(startLocal({ readLedger: () => { throw new Error('no ledger'); } }), /current consent is unavailable/);
  await assert.rejects(startLocal({ readLedger: () => '{not json' }), /current consent is unavailable/);
});

test('the data name is closed (reserved Windows names, trailing dots and spaces included) and the journals live under data', { timeout: 60000 }, async () => {
  const rejected = ['../x', 'a b', '', '.hidden', 'a'.repeat(33), 'a/b', 'a\\b', ' x', 'x\n', 'nul', 'NUL', 'con', 'prn', 'aux', 'com1', 'COM9', 'lpt1', 'con.txt', 'nul.json', 'abc.', 'abc..'];
  for (const name of rejected) await assert.rejects(startLocal({ readLedger: ledgerWith(approved.approval), dataName: name }), /data name must be/, JSON.stringify(name));
  for (const name of ['console', 'com10', 'lpt', 'nullable']) assert.equal(require('../runlog.cjs').dataNameProblem(name), null, name);
  const name = `t-${crypto.randomUUID().slice(0, 12)}`;
  const first = await startLocal({ readLedger: ledgerWith(approved.approval), dataName: name, settleMs: 2 });
  try {
    assert.equal((await call(first.address().port, 'POST', '/v1/presets', doc())).status, 201);
  } finally {
    await closeServer(first);
  }
  assert.equal(fs.existsSync(path.join(dataRoot, name, 'steps', 'journal.jsonl')) && fs.existsSync(path.join(dataRoot, name, 'runs', 'journal.jsonl')), true);
  const second = await startLocal({ readLedger: ledgerWith(approved.approval), dataName: name });
  try {
    const answer = await call(second.address().port, 'POST', '/v1/presets', doc());
    assert.deepEqual([answer.status, answer.json.replayed, answer.json.outcome], [200, true, 'succeeded'], 'a restart over the file journals returns the recorded result');
    assert.equal((await call(second.address().port, 'GET', '/v1/leases')).json.leases['synthetic-lease-001'].committed, 15);
  } finally {
    await closeServer(second);
    fs.rmSync(path.join(dataRoot, name), { recursive: true, force: true });
    if (fs.existsSync(dataRoot) && fs.readdirSync(dataRoot).length === 0) fs.rmdirSync(dataRoot);
  }
});

test('the command line reports the exact origin, refuses overrides and closes the server on a signal', { timeout: 30000 }, async () => {
  const logs = [];
  const errors = [];
  const server = await startLocal({ readLedger: ledgerWith(approved.approval) });
  let closer;
  const code = await runCli(['--settle-ms=3'], { start: async (options) => { assert.deepEqual(options, { dataName: null, settleMs: 3 }); return server; }, log: (line) => logs.push(line), error: (line) => errors.push(line), onSignal: (handler) => { closer = handler; } });
  assert.equal(code, 0);
  const started = JSON.parse(logs[0]);
  assert.deepEqual([started.event, started.origin, started.journal, started.scope.cardId], ['C043-local-listening', `http://127.0.0.1:${server.address().port}`, 'memory (not persisted)', 'C043']);
  const port = server.address().port;
  await closer();
  await assert.rejects(call(port, 'GET', '/scope.json'));
  const named = [];
  const second = await startLocal({ readLedger: ledgerWith(approved.approval) });
  assert.equal(await runCli(['--data-dir=demo'], { start: async () => second, log: (line) => named.push(line), error: () => {}, onSignal: () => {} }), 0);
  await closeServer(second);
  assert.equal(JSON.parse(named[0]).journal, 'capability/C043/data/demo');
  const refused = [];
  assert.equal(await runCli(['--port=80'], { start: async () => { throw new Error('must not start'); }, log: () => {}, error: (line) => refused.push(line) }), 1);
  assert.match(refused[0], /no host, port, identity or deployment override/);
  assert.equal(await runCli([], { start: async () => { throw new Error('consent denied'); }, log: () => {}, error: (line) => refused.push(line) }), 1);
  assert.equal(refused[1], 'consent denied');
  assert.equal(typeof text, 'function');
});
