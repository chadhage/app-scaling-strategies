'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test, before, after } = require('node:test');
const { startLocal, closeLocal, createConductor, listenerOrigin, inspectLocal, EVENT_INTERVAL_MS, MAX_LIFETIME_MS, PREAMBLE } = require('../server.cjs');
const { getLog, encodeEvent } = require('../fixture.cjs');
const { CursorSession, eventId } = require('../protocol.js');
const { until, streamUrl, openStream, ordinaryRequest } = require('./http-driver.cjs');
const { guardOperation } = require('../../C001/contract-guard.js');
const root = path.resolve(__dirname, '..');
let server;
let conductor;
const profileFrames = (stream) => stream.frames.filter((frame) => frame.event === 'profile');
const tail = (stream) => stream.frames.find((frame) => frame.event === 'tail');

before(async () => {
  server = await startLocal({ lifetimeMs: 120000 });
  conductor = createConductor(server);
});
after(async () => {
  if (server) {
    await closeLocal(server);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(server.listening, false);
    assert.equal(inspectLocal(server).activeStreams, 0);
    assert.equal(inspectLocal(server).activeSockets, 0);
    assert.equal(inspectLocal(server).generatedFiles.length, 0);
  }
});

test('real HTTP flushes exact SSE headers and incremental UTF-8 bytes before response end', async () => {
  const stream = await openStream(server, conductor, {}, { Origin: 'null', Accept: 'text/event-stream' });
  try {
    assert.equal(stream.status, 200);
    assert.equal(stream.headers['content-type'], 'text/event-stream; charset=utf-8');
    assert.equal(stream.headers['content-length'], undefined);
    assert.equal(stream.headers['content-encoding'], undefined);
    assert.equal(stream.headers['transfer-encoding'], 'chunked');
    assert.equal(stream.headers['cache-control'], 'no-store, no-transform');
    assert.equal(stream.headers['x-accel-buffering'], 'no');
    assert.equal(stream.headers['access-control-allow-origin'], 'null');
    assert.equal(stream.headers['access-control-allow-credentials'], undefined);
    assert.equal(stream.headers['set-cookie'], undefined);
    assert.equal(stream.headers['x-c027-stream-version'], 'r1');
    assert.equal(stream.headers['x-c027-accepted-after'], 'START');
    await until(() => profileFrames(stream).length >= 2);
    const firstTwo = profileFrames(stream).slice(0, 2);
    assert.ok(firstTwo[1].receivedAt - firstTwo[0].receivedAt >= EVENT_INTERVAL_MS / 2);
    assert.equal(stream.ended, false);
    assert.equal(stream.closed, false);
    assert.ok(inspectLocal(server).activeStreams >= 1);
    assert.equal(inspectLocal(server).responseEnds, 0);
    await until(() => tail(stream));
    const expected = getLog({ profileId: 'synthetic-001', version: 'r1' });
    assert.deepEqual(profileFrames(stream).map((frame) => Buffer.from(frame.raw)), expected.map(encodeEvent));
    assert.equal(Buffer.concat(stream.chunks.map((chunk) => chunk.bytes)).subarray(0, PREAMBLE.length).equals(PREAMBLE), true);
    assert.deepEqual(profileFrames(stream).map((frame) => JSON.parse(frame.data).sequence), [1, 2, 3, 4, 5, 6]);
    assert.equal(stream.ended, false, 'The fixture tail is not a buffered HTTP response end.');
  } finally { stream.close(); }
});

test('real disconnect/resume replays after accepted one, not received three', async () => {
  const model = new CursorSession('synthetic-001');
  const first = await openStream(server, conductor, { after: model.begin() });
  let second;
  try {
    model.opened();
    await until(() => profileFrames(first).length >= 3);
    for (const frame of profileFrames(first).slice(0, 3)) model.receive({ id: frame.id, data: frame.data });
    model.acceptNext();
    assert.equal(model.snapshot().receivedCursor, eventId('synthetic-001', 3));
    const original = model.snapshot();
    first.close();
    model.disconnect();
    second = await openStream(server, conductor, { after: model.begin() });
    model.opened();
    await until(() => tail(second));
    assert.deepEqual(profileFrames(second).map((frame) => JSON.parse(frame.data).sequence), [2, 3, 4, 5, 6]);
    for (const frame of profileFrames(second)) {
      assert.equal(model.receive({ id: frame.id, data: frame.data }).queued, true);
      model.acceptNext();
    }
    model.tail(tail(second).data);
    assert.equal(model.snapshot().outcome, 'verified-local');
    assert.deepEqual(model.snapshot().acceptedEvents.map((event) => event.sequence), [1, 2, 3, 4, 5, 6]);
    assert.equal(original.acceptedSequence, 1);
    assert.equal(second.ended, false);
    const requests = inspectLocal(server).streamRequests.slice(-2);
    assert.deepEqual(requests.map((request) => request.acceptedAfter), ['START', eventId('synthetic-001', 1)]);
  } finally { first.close(); second?.close(); }
});

test('every valid accepted prefix has the exact real ordered suffix, including an empty suffix at six', async () => {
  for (let accepted = 0; accepted <= 6; accepted++) {
    const after = accepted ? eventId('synthetic-002', accepted) : 'START';
    const stream = await openStream(server, conductor, { profileId: 'synthetic-002', after });
    try {
      await until(() => tail(stream));
      const actual = profileFrames(stream).map((frame) => JSON.parse(frame.data));
      const log = getLog({ profileId: 'synthetic-002', version: 'r1' });
      assert.deepEqual(actual, log.slice(accepted));
      assert.equal(stream.headers['x-c027-accepted-after'], after);
      assert.equal(stream.ended, false);
    } finally { stream.close(); }
  }
});

test('HTTP cursor/query/identity errors are typed JSON errors, never SSE success or silent reset', async () => {
  const cases = [
    [{ after: '' }, {}, 400, 'INVALID_CURSOR'],
    [{ after: '1' }, {}, 400, 'INVALID_CURSOR'],
    [{ after: 'C027:r1:synthetic-001:000000' }, {}, 400, 'INVALID_CURSOR'],
    [{ after: 'C027:r1:synthetic-001:000007' }, {}, 416, 'FUTURE_CURSOR'],
    [{ after: 'C027:r2:synthetic-001:000001' }, {}, 409, 'CURSOR_STREAM_MISMATCH'],
    [{ after: eventId('synthetic-002', 1) }, {}, 409, 'CURSOR_STREAM_MISMATCH'],
    [{ profileId: 'synthetic-999' }, {}, 404, 'UNKNOWN_PROFILE'],
    [{ version: 'r2' }, {}, 404, 'UNKNOWN_VERSION'],
    [{ mode: 'healthy-fallback' }, {}, 400, 'UNKNOWN_MODE'],
    [{}, { 'Last-Event-ID': eventId('synthetic-001', 3) }, 409, 'CURSOR_CONFLICT'],
    [{}, { Origin: 'https://not-an-approved-origin.invalid' }, 403, 'ORIGIN_DENIED'],
    [{}, { Host: 'localhost' }, 421, 'LOCAL_HOST_REQUIRED'],
    [{}, { Cookie: 'synthetic-test-only=forbidden' }, 403, 'CREDENTIALS_FORBIDDEN'],
    [{}, { Authorization: 'synthetic-test-only-forbidden' }, 403, 'CREDENTIALS_FORBIDDEN']
  ];
  for (const [query, headers, status, code] of cases) {
    const response = await ordinaryRequest(server, streamUrl(server, conductor, query), { headers });
    assert.equal(response.status, status);
    assert.equal(response.value.error.code, code);
    assert.equal(response.value.localOnly, true);
    assert.match(response.headers['content-type'], /^application\/json/);
    assert.equal(response.headers['x-c027-stream-version'], undefined);
  }
  for (const change of [
    (url) => url.searchParams.delete('after'),
    (url) => url.searchParams.append('after', 'START'),
    (url) => url.searchParams.append('override', 'true')
  ]) {
    const url = streamUrl(server, conductor);
    change(url);
    const response = await ordinaryRequest(server, url, { headers: { 'Last-Event-ID': eventId('synthetic-001', 3) } });
    assert.equal(response.status, 400);
    assert.equal(response.value.error.code, 'INVALID_QUERY');
  }
  const wrongPath = new URL('/not-an-owned-endpoint', listenerOrigin(server));
  assert.equal((await ordinaryRequest(server, wrongPath)).status, 404);
  const post = await ordinaryRequest(server, streamUrl(server, conductor), { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET');
  const body = await ordinaryRequest(server, streamUrl(server, conductor), { method: 'GET', headers: { 'Content-Length': '1' }, body: 'x' });
  assert.equal(body.status, 400);
  assert.equal(body.value.error.code, 'UNEXPECTED_BODY');
});

test('matching Last-Event-ID cannot replace the required explicit accepted cursor', async () => {
  const acceptedAfter = eventId('synthetic-001', 4);
  const stream = await openStream(server, conductor, { after: acceptedAfter }, { 'Last-Event-ID': acceptedAfter });
  try {
    await until(() => tail(stream));
    assert.deepEqual(profileFrames(stream).map((frame) => JSON.parse(frame.data).sequence), [5, 6]);
    assert.equal(inspectLocal(server).streamRequests.at(-1).acceptedAfter, acceptedAfter);
  } finally { stream.close(); }
});

test('read-only audit retains rejected HTTP attempts and exact owned timer cleanup', async () => {
  const before = inspectLocal(server);
  assert.ok(Array.isArray(before.httpRequests), 'CSP evidence needs ALL HTTP requests, not only successful SSE requests.');
  assert.ok(Array.isArray(before.failures), 'Rejected cursor attempts must remain inspectable.');
  const response = await ordinaryRequest(server, streamUrl(server, conductor, { after: 'bad-audit-cursor' }));
  assert.equal(response.status, 400);
  const after = inspectLocal(server);
  assert.equal(after.httpRequests.length, before.httpRequests.length + 1);
  assert.equal(after.failures.at(-1).code, 'INVALID_CURSOR');
  assert.equal(after.failures.at(-1).status, 400);
  assert.equal(Object.isFrozen(after.httpRequests.at(-1)), true);
  const bounded = await startLocal({ lifetimeMs: 10000 });
  try {
    assert.ok(inspectLocal(bounded).activeTimers >= 1);
  } finally { await closeLocal(bounded); }
  assert.equal(inspectLocal(bounded).activeTimers, 0);
});

for (const [mode, phase, code] of [
  ['gap', 'error', 'EVENT_GAP'], ['duplicate', 'error', 'DUPLICATE_EVENT'],
  ['invalid', 'error', 'INVALID_JSON'], ['drop', 'unknown', 'TRANSPORT_INTERRUPTED']
]) {
  test(`real ${mode} stream retains a strict ${phase}/${code} outcome without acceptance`, async () => {
    const model = new CursorSession('synthetic-001');
    const stream = await openStream(server, conductor, { mode, after: model.begin() });
    try {
      model.opened();
      await until(() => mode === 'drop' ? stream.closed : profileFrames(stream).length >= (mode === 'duplicate' ? 2 : 1));
      for (const frame of profileFrames(stream)) {
        if (!model.receive({ id: frame.id, data: frame.data }).queued) break;
      }
      if (mode === 'drop') model.interrupt();
      assert.equal(model.snapshot().phase, phase);
      assert.equal(model.snapshot().error.code, code);
      assert.equal(model.snapshot().acceptedCursor, 'START');
      assert.equal(model.snapshot().acceptedEvents.length, 0);
      assert.ok(model.snapshot().receipts.length > 0);
    } finally { stream.close(); }
  });
}

test('listener options cannot override address, port, consent or the fifteen-minute ceiling', async () => {
  for (const input of [
    null, [], { host: '0.0.0.0' }, { port: 43210 }, { approval: true },
    { lifetimeMs: 0 }, { lifetimeMs: -1 }, { lifetimeMs: 900001 }, { lifetimeMs: Infinity },
    { lifetimeMs: '1000' }, { lifetimeMs: 1.5 }, Object.create({ lifetimeMs: 1000 }),
    { get lifetimeMs() { throw new Error('must not execute'); } }
  ]) await assert.rejects(startLocal(input));
  assert.equal(MAX_LIFETIME_MS, 900000);
  assert.equal(server.address().address, '127.0.0.1');
  assert.equal(server.address().family, 'IPv4');
  assert.throws(() => listenerOrigin({ address: () => server.address(), listening: true }), /exact owned/);
  assert.throws(() => createConductor(server), /Only one/);
});

test('unchanged C001 guard denies missing, false, string and drifted consent without ledger mutation', async () => {
  const approval = JSON.parse(fs.readFileSync(path.join(root, '..', '..', '.docs', 'wiki', 'flow-state.json'), 'utf8')).approvals.C001;
  assert.equal((await guardOperation('local.probe', approval)).allowed, true);
  for (const candidate of [
    undefined, null, {}, { ...approval, designAndLocalImplementationApproved: false },
    { ...approval, designAndLocalImplementationApproved: 'true' }, { ...approval, expenditureApproved: true }
  ]) assert.equal((await guardOperation('local.probe', candidate)).allowed, false);
  assert.equal((await guardOperation('native.execute', approval)).allowed, false);
  assert.equal((await guardOperation('iac.generate', approval)).allowed, false);
});

test('concurrency allowance rejects a fifth owned stream and exact cleanup removes all four', async () => {
  const streams = [];
  try {
    await until(() => inspectLocal(server).activeStreams === 0);
    for (let index = 0; index < 4; index++) streams.push(await openStream(server, conductor));
    assert.equal(inspectLocal(server).activeStreams, 4);
    const fifth = await ordinaryRequest(server, streamUrl(server, conductor));
    assert.equal(fifth.status, 429);
    assert.equal(fifth.value.error.code, 'LOCAL_CAPACITY_LIMIT');
  } finally {
    for (const stream of streams) stream.close();
    await until(() => inspectLocal(server).activeStreams === 0);
  }
});

test('bound expiry closes the exact live response, every connection and only its generated conductor file', async () => {
  const short = await startLocal({ lifetimeMs: 500 });
  const file = createConductor(short);
  const stream = await openStream(short, file);
  try {
    assert.equal(stream.status, 200);
    assert.equal(short.listening, true);
    await until(() => !short.listening && stream.closed);
    await closeLocal(short);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(inspectLocal(short).activeStreams, 0);
    assert.equal(inspectLocal(short).activeSockets, 0);
    assert.equal(inspectLocal(short).generatedFiles.length, 0);
    assert.equal(fs.existsSync(path.join(root, path.basename(file.relativePath))), false);
    assert.equal(server.listening, true, 'Expiry must not close any other owned listener.');
  } finally { stream.close(); await closeLocal(short); }
});

test('CLI refuses every override rather than creating an unbounded or public listener', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'server.cjs'), '--host', '127.0.0.1'], {
    cwd: root, encoding: 'utf8', timeout: 5000
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /accepts no CLI overrides/);
  assert.equal(result.stdout, '');
});
