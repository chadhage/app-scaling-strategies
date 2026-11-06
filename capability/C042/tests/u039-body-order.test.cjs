'use strict';

// U039 fix 4: the ORDER of a refusal for an incomplete request, with a request in flight before it. The request Node was still receiving when it gave up
// is the one that failed: it is never answered and never run (a queued one is dropped after its turn), and the typed refusal waits only for the requests
// BEFORE it; a request whose message IS complete still waits for its own answer. Also: the destroy after the flush is a structural fact (a spy, no race),
// and a body that merely arrives slowly is not refused. In this process only (a held step needs the injected executor).
const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const lib = require('./u039-lib.cjs');
const support = require('./support.cjs');
const { peer } = require('./u039-body-rows.cjs');
const { mutation, reading, step } = require('./u039-rows.cjs');

const TIMEOUT = 600000;
const GARBAGE = Buffer.from('GARBAGE LINE\r\n\r\n', 'latin1');
const hostOf = (instance) => `127.0.0.1:${instance.port}`;
// Every status the client saw, an interim 100 Continue included: a 100 is the mark of a handler that ran.
const seen = (result) => result.responses.map((item) => item.status);
const delivered = (instance, bytes) => lib.until(() => (instance.sockets[0]?.bytesRead ?? 0) >= bytes, 'the server read the whole pipeline');
// The held step reached the executor. A liveness guard: a server under test (a mutant) that drops the request fails the test instead of hanging it.
const gate = () => {
  const held = support.gate();
  const guard = (key) => Promise.race([held.entered(key), new Promise((_, reject) => { setTimeout(() => reject(new Error(`never held: ${key} reached the executor`)), Math.max(lib.CLOSE_MS, 1500)).unref(); })]);
  return { ...held, entered: guard };
};

async function withService(options, body) {
  const instance = await lib.startInProcess(options);
  try {
    return await body(instance, hostOf(instance));
  } finally {
    await instance.close();
  }
}

// An incomplete request: a POST or a GET whose chunked body breaks at the first chunk size.
const broken = (host, method, extra = '') => Buffer.from(`${method} ${method === 'POST' ? '/v1/steps' : '/v1/leases'} HTTP/1.1\r\nHost: ${host}\r\n${method === 'POST' ? 'Content-Type: application/json\r\n' : ''}${extra}Transfer-Encoding: chunked\r\n\r\nzz\r\n`, 'latin1');

test('an incomplete request queued behind a request in flight is dropped after its turn: its handler never runs (no 100 Continue), and the client gets ONE typed refusal', { timeout: TIMEOUT }, async () => {
  const held = gate();
  await withService({ executor: held.executor }, async (instance, host) => {
    const data = Buffer.concat([mutation(host), broken(host, 'POST', 'Expect: 100-continue\r\n')]);
    const sent = lib.exchange(instance.port, [{ data }]);
    await held.entered('probe-key-0001');
    await delivered(instance, data.length);
    held.release('probe-key-0001');
    const result = await sent;
    assert.deepEqual(seen(result), [201, 400], 'the answer of the request in flight, then ONE typed refusal; the dropped request wrote nothing (a 100 would show that its handler ran)');
    assert.equal(result.responses[1].code, 'INVALID_FORMAT');
    assert.equal(result.responses[1].connection, 'close');
    assert.equal(result.closedByServer, true);
  });
});

test('a GET with a broken chunked body queued behind a request in flight answers once, not twice (the handler of the dropped request would refuse the unexpected body again)', { timeout: TIMEOUT }, async () => {
  const held = gate();
  await withService({ executor: held.executor }, async (instance, host) => {
    const data = Buffer.concat([mutation(host), broken(host, 'GET')]);
    const sent = lib.exchange(instance.port, [{ data }]);
    await held.entered('probe-key-0001');
    await delivered(instance, data.length);
    held.release('probe-key-0001');
    const result = await sent;
    assert.deepEqual(seen(result), [201, 400], 'the answer of the request in flight and ONE typed refusal');
    assert.equal(result.responses[1].code, 'INVALID_FORMAT', 'the refusal of the connection, not the refusal of the unexpected body');
    assert.equal(result.closedByServer, true);
  });
});

test('the refusal for an incomplete request waits only for the requests before it: [submit in flight][read][incomplete] answers the submit, the read, then the refusal', { timeout: TIMEOUT }, async () => {
  const held = gate();
  await withService({ executor: held.executor }, async (instance, host) => {
    const data = Buffer.concat([mutation(host), reading(host), broken(host, 'POST')]);
    const sent = lib.exchange(instance.port, [{ data }]);
    await held.entered('probe-key-0001');
    await delivered(instance, data.length);
    assert.equal(instance.sockets[0].bytesWritten, 0, 'nothing is written while the request in flight is not answered: the refusal waits for the requests before it');
    held.release('probe-key-0001');
    const result = await sent;
    assert.deepEqual(seen(result), [201, 200, 400]);
    assert.equal(result.closedByServer, true);
  });
});

// The opposite case, the one the incomplete check must not touch: a request whose message IS complete can be answered, so the refusal behind it waits for its answer.
async function completeThenGarbage(frame) {
  const held = gate();
  await withService({ executor: held.executor }, async (instance, host) => {
    const data = Buffer.concat([frame(mutation(host)), GARBAGE]);
    const sent = lib.exchange(instance.port, [{ data }]);
    await held.entered('probe-key-0001');
    await delivered(instance, data.length);
    assert.equal(instance.sockets[0].bytesWritten, 0, 'nothing is written while the complete request is in flight');
    held.release('probe-key-0001');
    const result = await sent;
    assert.deepEqual(seen(result), [201, 400], 'its own answer first, then the typed refusal');
    assert.equal(result.responses[1].code, 'INVALID_FORMAT');
    assert.equal(result.closedByServer, true);
  });
}
test('a request whose message is complete (a Content-Length body) is answered before the refusal behind it, the submit still in flight', { timeout: TIMEOUT }, () => completeThenGarbage((bytes) => bytes));
test('a request whose message is complete (a chunked body) is answered before the refusal behind it, the submit still in flight', { timeout: TIMEOUT }, () => completeThenGarbage(lib.chunked));

// A spy on the server-side socket: the connection is destroyed when the answer of a refusal has been flushed (the response finished), which is BEFORE the
// socket has finished its own shutdown. Without the destroy Node would end the socket later (destroySoon) and keep parsing an endless chunked body meanwhile.
test('a refused connection is destroyed at the flush of the refusal, not left to Node: destroy() runs while the socket has not finished its own shutdown', { timeout: TIMEOUT }, () => withService({}, async (instance, host) => {
  const client = net.connect({ port: instance.port, host: '127.0.0.1', allowHalfOpen: true });
  client.on('error', () => {});
  try {
    await lib.until(() => instance.sockets.length === 1, 'the server accepted the connection');
    const [serverSide] = instance.sockets;
    const finished = [];
    const destroy = serverSide.destroy.bind(serverSide);
    serverSide.destroy = (...args) => { finished.push(serverSide.writableFinished); return destroy(...args); };
    client.write(lib.req('GET', '/nope', { host }));
    await lib.until(() => serverSide.destroyed, 'the server destroyed the refused connection');
    assert.equal(finished[0], false, 'the first destroy() of the refused connection came at the flush of the answer, before the socket finished its shutdown');
  } finally {
    client.destroy();
  }
}));

test('a body that arrives slowly is not refused: the incomplete check applies only after the client error, and the connection stays usable', { timeout: TIMEOUT }, () => withService({}, async (instance, host) => {
  const whole = mutation(host);
  const half = whole.length - 20;
  const result = await lib.exchange(instance.port, [{ data: whole.subarray(0, half) }, { data: whole.subarray(half), delay: 60 }, { data: reading(host), delay: 20 }], { answers: 2 });
  assert.deepEqual(seen(result), [201, 200], 'the slow submit is applied and the next request on the connection is served');
  assert.equal(result.closedByServer, false, 'nothing was refused: the connection is still open');
}));

test('a queued request whose body is still arriving when its turn comes is served, not dropped: only a client error makes an incomplete request refused', { timeout: TIMEOUT }, async () => {
  const held = gate();
  await withService({ executor: held.executor }, async (instance, host) => {
    const second = lib.req('POST', '/v1/steps', { host, headers: { 'Content-Type': 'application/json' }, body: step({ idempotencyKey: 'probe-key-0002', leaseId: 'synthetic-lease-002', units: 1 }) });
    const cut = second.length - 15;
    const first = Buffer.concat([mutation(host), second.subarray(0, cut)]);
    const client = peer(instance.port, first);
    try {
      await held.entered('probe-key-0001');
      await delivered(instance, first.length);
      held.release('probe-key-0001');
      held.release('probe-key-0002');
      await lib.until(() => client.answers().length >= 1, 'the answer of the first submit');
      client.socket.write(second.subarray(cut));
      await lib.until(() => client.answers().length >= 2, 'the answer of the second submit, whose body arrived after its turn began');
      assert.deepEqual(client.answers().map((item) => item.status), [201, 201], 'both submits are applied, in order');
      assert.equal(client.closed, false, 'nothing was refused: the connection is still open');
    } finally {
      client.destroy();
    }
  });
});
