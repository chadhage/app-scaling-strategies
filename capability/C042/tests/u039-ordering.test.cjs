'use strict';

// U039: ordering and Node-own behaviour of the central refusal path, with raw sockets. The matrix (u039-matrix.test.cjs) proves
// that nothing runs behind a refusal; these tests prove what must STILL work, the order in which things happen, that one
// connection never disturbs another, and that the cleanup of the tooling runs. No sleep decides a result: every wait polls a
// structural fact (bytes the server read, a closed socket, a connection count) under a liveness bound that only a broken server reaches.
const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const lib = require('./u039-lib.cjs');
const { gate } = require('./support.cjs');
const { mutation, reading, step } = require('./u039-rows.cjs');

const JSON_TYPE = { 'Content-Type': 'application/json' };
const TIMEOUT = 600000;
const GARBAGE = Buffer.from('GARBAGE LINE\r\n\r\n', 'latin1');
const statuses = (result) => result.responses.map((item) => item.status);
const hostOf = (instance) => `127.0.0.1:${instance.port}`;
const post = (instance, body, headers = {}) => lib.req('POST', '/v1/steps', { host: hostOf(instance), headers: { ...JSON_TYPE, ...headers }, body });
// A bodiless mutation: it cancels the open step of a prefilled journal and works whenever it runs.
const cancelOpen = (host) => lib.req('POST', '/v1/steps/key-open-0001/cancel', { host, headers: { 'Content-Length': '0' } });
// Every pipelined request reached the server (it read all the bytes) before the test goes on.
const delivered = (instance, bytes) => lib.until(() => (instance.sockets[0]?.bytesRead ?? 0) >= bytes, 'the server read the whole pipeline');

async function withService(options, body) {
  const instance = await lib.startInProcess(options);
  try {
    return await body(instance, hostOf(instance));
  } finally {
    await instance.close();
  }
}

function persistent(port) {
  const socket = net.connect({ port, host: '127.0.0.1' });
  const chunks = [];
  let closed = false;
  socket.on('data', (chunk) => chunks.push(chunk));
  socket.on('error', () => {});
  socket.on('close', () => { closed = true; });
  const answers = () => lib.parseResponses(Buffer.concat(chunks)).filter((item) => item.status !== undefined);
  return {
    socket, answers, isClosed: () => closed,
    ask: async (bytes) => { const before = answers().length; socket.write(bytes); await lib.until(() => answers().length > before || closed, 'an answer'); },
  };
}

test('a legitimate pipeline of successful requests is served in order on one kept-alive connection', { timeout: TIMEOUT }, () => withService({}, async (instance, host) => {
  const alone = await lib.startInProcess({});
  await lib.exchange(alone.port, [{ data: mutation(hostOf(alone)) }], { answers: 1 });
  const expected = await lib.settled(alone);
  await alone.close();
  const result = await lib.exchange(instance.port, [{ data: Buffer.concat([reading(host), mutation(host), reading(host), reading(host)]) }], { answers: 4 });
  assert.deepEqual(statuses(result), [200, 201, 200, 200]);
  assert.deepEqual(result.responses.map((item) => item.connection), ['keep-alive', 'keep-alive', 'keep-alive', 'keep-alive']);
  assert.equal(result.closedByServer, false, 'successful answers keep the connection open');
  assert.deepEqual(await lib.settled(instance), expected);
}));

test('at most 4 requests may be pipelined on one connection: the fifth destroys it', { timeout: TIMEOUT }, () => withService({}, async (instance, host) => {
  const result = await lib.exchange(instance.port, [{ data: Buffer.concat(Array.from({ length: 6 }, () => reading(host))) }], { answers: 6 });
  assert.equal(statuses(result).length <= 4, true, `${statuses(result).length} answers to 6 pipelined requests`);
  assert.equal(result.closedByServer, true, 'the connection was ended by the server');
}));

test('a request pipelined behind a slow request waits for its answer and then sees its effect', { timeout: TIMEOUT }, async () => {
  const held = gate();
  await withService({ executor: held.executor }, async (instance, host) => {
    const key = 'probe-key-0001';
    const data = Buffer.concat([mutation(host), lib.req('GET', `/v1/steps/${key}`, { host })]);
    const sent = lib.exchange(instance.port, [{ data }], { answers: 2 });
    await held.entered(key);
    await delivered(instance, data.length);
    held.release(key);
    const result = await sent;
    assert.deepEqual(statuses(result), [201, 200], 'the inspect ran after the submit was answered (a concurrent inspect would be 202 in flight)');
  });
});

test('a queued request whose client has gone never runs', { timeout: TIMEOUT }, async () => {
  const held = gate();
  await withService({ executor: held.executor, prefill: 3 }, async (instance, host) => {
    const data = Buffer.concat([mutation(host), cancelOpen(host)]);
    const socket = net.connect({ port: instance.port, host: '127.0.0.1' });
    socket.on('error', () => {});
    await new Promise((resolve) => socket.on('connect', resolve));
    socket.write(data);
    await held.entered('probe-key-0001');
    await delivered(instance, data.length);
    socket.destroy();
    await lib.until(() => instance.sockets[0].destroyed, 'the server saw the client leave');
    held.release('probe-key-0001');
    const state = await lib.settled(instance);
    assert.equal(state.snapshot.journalRecords, 7, 'the prefilled journal (5 records) and the first step (begin, commit); the queued cancel never ran');
  });
});

test('a request queued behind a refusal is dropped, and so is every request queued behind that one: no handler waits forever', { timeout: TIMEOUT }, () => withService({}, async (instance, host) => {
  const [handle] = instance.server.listeners('request');
  const handlers = [];
  instance.server.removeAllListeners('request');
  instance.server.on('request', (request, response) => { const promise = handle(request, response); handlers.push(promise); return promise; });
  const data = Buffer.concat([lib.req('GET', '/nope', { host }), reading(host), reading(host), reading(host)]);
  const result = await lib.exchange(instance.port, [{ data }]);
  assert.deepEqual(statuses(result), [404], 'only the refusal is answered');
  assert.equal(result.closedByServer, true);
  assert.equal(handlers.length, 4, 'all four requests reached the handler');
  // The bound is a liveness guard: a dropped request that does not release its place leaves the handler behind it pending for ever.
  const timeout = new Promise((resolve) => { setTimeout(resolve, Math.max(lib.CLOSE_MS, 1500), 'pending').unref(); });
  assert.equal(await Promise.race([Promise.allSettled(handlers).then(() => 'settled'), timeout]), 'settled', 'every handler settled');
}));

test('Expect: 100-continue is answered only for a request that will be read', { timeout: TIMEOUT }, () => withService({}, async (instance, host) => {
  const refused = await lib.exchange(instance.port, [{ data: lib.req('POST', '/v1/steps', { host, headers: { 'Content-Type': 'text/plain', Expect: '100-continue' }, body: 'x' }) }]);
  assert.deepEqual(statuses(refused), [415], 'a refusal is never preceded by 100 Continue');
  assert.equal(refused.closedByServer, true);
  const accepted = await lib.exchange(instance.port, [{ data: lib.expecting(mutation(host)) }], { answers: 1 });
  assert.deepEqual(statuses(accepted), [100, 201]);
  const after = await lib.exchange(instance.port, [{ data: Buffer.concat([reading(host), lib.expecting(post(instance, step({ idempotencyKey: 'probe-key-0005' })))]) }], { answers: 2 });
  assert.deepEqual(statuses(after), [200, 100, 201], 'an Expect request behind a successful one runs in order');
}));

test('a parse error behind a request in flight is answered after that request, typed, and ends the connection', { timeout: TIMEOUT }, async () => {
  const held = gate();
  await withService({ executor: held.executor }, async (instance, host) => {
    const data = Buffer.concat([mutation(host), GARBAGE]);
    const sent = lib.exchange(instance.port, [{ data }]);
    await held.entered('probe-key-0001');
    await delivered(instance, data.length);
    held.release('probe-key-0001');
    const result = await sent;
    assert.deepEqual(statuses(result), [201, 400], 'the first answer is not lost');
    assert.equal(result.responses[1].code, 'INVALID_FORMAT');
    assert.equal(result.responses[1].connection, 'close');
    assert.equal(result.closedByServer, true);
  });
});

test('a parse error answers the requests queued before it in order, then the typed refusal, and ends the connection', { timeout: TIMEOUT }, async () => {
  const held = gate();
  await withService({ executor: held.executor }, async (instance, host) => {
    const data = Buffer.concat([mutation(host), reading(host), GARBAGE]);
    const sent = lib.exchange(instance.port, [{ data }]);
    await held.entered('probe-key-0001');
    await delivered(instance, data.length);
    held.release('probe-key-0001');
    const result = await sent;
    assert.deepEqual(statuses(result), [201, 200, 400], 'the answers of the requests before the parse error arrive in order, then the typed refusal');
    assert.equal(result.responses[2].code, 'INVALID_FORMAT');
    assert.equal(result.responses[2].connection, 'close');
    assert.equal(result.closedByServer, true);
  });
});

// Node reports the same connection again (the timer for requests whose headers never completed fires at every check). The first
// report decided the answer: a later one writes no second answer and never destroys the socket before the first answer is flushed.
test('a parse error reported again while the first one waits is answered once, and the socket is destroyed only after the flush', { timeout: TIMEOUT }, async () => {
  const held = gate();
  await withService({ executor: held.executor }, async (instance, host) => {
    const data = Buffer.concat([mutation(host), GARBAGE]);
    const sent = lib.exchange(instance.port, [{ data }]);
    await held.entered('probe-key-0001');
    await delivered(instance, data.length);
    const [serverSide] = instance.sockets;
    const answers = [];
    const destroys = [];
    const end = serverSide.end.bind(serverSide);
    const destroy = serverSide.destroy.bind(serverSide);
    serverSide.end = (...args) => { answers.push(Buffer.isBuffer(args[0])); return end(...args); };
    serverSide.destroy = (...args) => { destroys.push(serverSide.writableFinished); return destroy(...args); };
    for (const code of ['ERR_HTTP_REQUEST_TIMEOUT', 'HPE_HEADER_OVERFLOW']) instance.server.emit('clientError', Object.assign(new Error(code), { code }), serverSide);
    held.release('probe-key-0001');
    const result = await sent;
    assert.deepEqual(statuses(result), [201, 400], 'the answer of the request in flight and ONE typed refusal');
    assert.equal(result.responses[1].code, 'INVALID_FORMAT');
    await lib.until(() => serverSide.destroyed, 'the server destroyed the connection');
    assert.deepEqual(answers, [true], 'the refusal was written exactly once');
    assert.deepEqual(destroys, [true], 'the socket was destroyed once, after the answer was flushed');
  });
});

test('a parse error on a connection that can no longer be written closes it without an answer or a write error', { timeout: TIMEOUT }, () => withService({}, async (instance) => {
  const client = net.connect({ port: instance.port, host: '127.0.0.1', allowHalfOpen: true });
  const received = [];
  client.on('data', (chunk) => received.push(chunk));
  client.on('error', () => {});
  await new Promise((resolve) => client.on('connect', resolve));
  await lib.until(() => instance.sockets.length === 1, 'the server accepted the connection');
  const [serverSide] = instance.sockets;
  const failures = [];
  let gone = false;
  serverSide.on('error', (error) => failures.push(error.code));
  serverSide.once('close', () => { gone = true; });
  // Node ends the writable side the same way after an answer with Connection: close; the socket itself is not destroyed yet.
  serverSide.end();
  assert.deepEqual([serverSide.writable, serverSide.destroyed], [false, false]);
  instance.server.emit('clientError', Object.assign(new Error('parse error'), { code: 'HPE_INVALID_METHOD' }), serverSide);
  const closed = await lib.until(() => gone, 'the server closed the connection').then(() => true, () => false);
  assert.equal(closed, true, 'the connection was closed');
  assert.deepEqual(failures, [], 'nothing was written after the end');
  assert.equal(Buffer.concat(received).length, 0, 'no answer was written to a connection that was already ended');
  client.destroy();
}));

test('after a parse error the server stops reading the connection', { timeout: TIMEOUT }, async () => {
  const held = gate();
  await withService({ executor: held.executor }, async (instance, host) => {
    const socket = net.connect({ port: instance.port, host: '127.0.0.1' });
    socket.on('error', () => {});
    await new Promise((resolve) => socket.on('connect', resolve));
    socket.write(Buffer.concat([mutation(host), GARBAGE]));
    await held.entered('probe-key-0001');
    const chunk = Buffer.alloc(65536, 0x78);
    for (let index = 0; index < 128; index += 1) socket.write(chunk);
    let last = -1;
    let same = 0;
    for (let polls = 0; same < 3; polls += 1) {
      assert.equal(polls < 300, true, 'the byte count never settled');
      await lib.sleep(100);
      same = instance.sockets[0].bytesRead === last ? same + 1 : 0;
      last = instance.sockets[0].bytesRead;
    }
    assert.equal(last < 1024 * 1024, true, `the server read ${last} bytes of a connection that had sent a parse error`);
    held.release('probe-key-0001');
    socket.destroy();
  });
});

test('the server closes its side after a parse error even when the client keeps its side open', { timeout: TIMEOUT }, () => withService({}, async (instance) => {
  const socket = net.connect({ port: instance.port, host: '127.0.0.1', allowHalfOpen: true });
  const chunks = [];
  socket.on('data', (chunk) => chunks.push(chunk));
  socket.on('error', () => {});
  await new Promise((resolve) => socket.on('connect', resolve));
  socket.write(GARBAGE);
  await lib.until(() => /\r\n\r\n/.test(Buffer.concat(chunks).toString('latin1')), 'the typed answer');
  assert.match(Buffer.concat(chunks).toString('latin1'), /^HTTP\/1\.1 400 Bad Request\r\n/);
  await lib.until(async () => (await instance.connections()) === 0, 'the server closed its side (no timer is left to do it)');
  socket.destroy();
}));

test('an h2c upgrade header is ignored: the request is an ordinary one, and behind a refusal it never runs', { timeout: TIMEOUT }, async () => {
  const upgrading = (buffer) => {
    const { head, body } = lib.split(buffer);
    return lib.join([...head, 'Connection: Upgrade, HTTP2-Settings', 'Upgrade: h2c', 'HTTP2-Settings: AAMAAABkAAQAAP__'], body);
  };
  await withService({}, async (instance, host) => {
    const alone = await lib.exchange(instance.port, [{ data: upgrading(mutation(host)) }], { answers: 1 });
    assert.deepEqual(statuses(alone), [201], 'no 101 Switching Protocols: the Upgrade header is ignored');
  });
  await withService({}, async (instance, host) => {
    const before = await lib.settled(instance);
    const behind = await lib.exchange(instance.port, [{ data: Buffer.concat([lib.req('GET', '/nope', { host }), upgrading(mutation(host))]) }]);
    assert.deepEqual(statuses(behind), [404]);
    assert.equal(behind.closedByServer, true);
    assert.deepEqual(await lib.settled(instance), before);
  });
});

test('a long kept-alive connection adds no listener per request and keeps counting its pipeline', { timeout: TIMEOUT }, () => withService({}, async (instance, host) => {
  const warnings = [];
  const onWarning = (warning) => warnings.push(warning.name);
  process.on('warning', onWarning);
  try {
    const peer = persistent(instance.port);
    for (let index = 1; index <= 30; index += 1) {
      await peer.ask(reading(host));
      assert.equal(peer.answers().length, index);
    }
    assert.equal(instance.sockets.length, 1);
    assert.equal(instance.sockets[0].listenerCount('close') <= 8, true, `${instance.sockets[0].listenerCount('close')} close listeners on the server side of one connection`);
    peer.socket.write(Buffer.concat([reading(host), reading(host), reading(host), reading(host)]));
    await lib.until(() => peer.answers().length >= 34, 'four more answers (the pipeline depth counter came back to zero)');
    peer.socket.destroy();
    assert.deepEqual(warnings.filter((name) => name === 'MaxListenersExceededWarning'), []);
  } finally {
    process.off('warning', onWarning);
  }
}));

for (const order of ['the first service is closed first', 'the second service is closed first']) {
  test(`two services in one process (${order}): a refusal closes only its own connection, neighbours stay untouched, closing twice is safe`, { timeout: TIMEOUT }, async () => {
    const [first, second] = [await lib.startInProcess({}), await lib.startInProcess({})];
    const peers = [persistent(first.port), persistent(first.port), persistent(second.port)];
    try {
      const [victim, neighbour, other] = peers;
      for (const [peer, instance] of [[victim, first], [neighbour, first], [other, second]]) await peer.ask(reading(hostOf(instance)));
      assert.deepEqual(peers.map((peer) => peer.answers().map((item) => item.connection)), [['keep-alive'], ['keep-alive'], ['keep-alive']]);
      await victim.ask(lib.req('GET', '/nope', { host: hostOf(first) }));
      assert.equal(victim.answers().at(-1).status, 404);
      await lib.until(() => victim.isClosed(), 'the refused connection was closed by its server');
      for (const [peer, instance] of [[neighbour, first], [other, second]]) {
        await peer.ask(reading(hostOf(instance)));
        assert.deepEqual(peer.answers().map((item) => item.status), [200, 200], 'an unrelated connection still works');
        assert.equal(peer.isClosed(), false);
      }
      const [early, late] = order.startsWith('the first') ? [first, second] : [second, first];
      await early.close();
      const survivor = early === first ? other : neighbour;
      await survivor.ask(reading(hostOf(late)));
      assert.equal(survivor.answers().at(-1).status, 200, 'the other service is untouched by the close of its neighbour');
      await late.close();
      await early.close();
      await late.close();
      await lib.until(() => peers.every((peer) => peer.isClosed()), 'every connection ended with its service');
    } finally {
      for (const peer of peers) peer.socket.destroy();
      await Promise.all([first.close(), second.close()]);
    }
  });
}

test('a failing assertion still runs the cleanup: the service stops listening and the child process is gone', { timeout: TIMEOUT }, async () => {
  let port = 0;
  await assert.rejects(withService({}, async (instance) => { port = instance.port; assert.fail('injected failure'); }), /injected failure/);
  const outcome = await new Promise((resolve) => {
    const probe = net.connect({ port, host: '127.0.0.1' });
    probe.on('connect', () => { probe.destroy(); resolve('connected'); });
    probe.on('error', (failure) => resolve(failure.code));
  });
  assert.equal(outcome, 'ECONNREFUSED');
  const child = await lib.startChild();
  await child.start();
  const exit = await child.stop();
  assert.equal(typeof exit.code === 'number' || typeof exit.signal === 'string', true, 'the child ended');
  assert.throws(() => process.kill(child.pid, 0), (failure) => failure.code === 'ESRCH');
});
