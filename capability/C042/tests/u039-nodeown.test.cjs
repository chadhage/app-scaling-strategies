'use strict';

// U039: requests Node refuses before the handler runs, with raw sockets: a request that never completes (408), and a seeded fuzz of
// hostile bytes (mutated, truncated, duplicated, oversized requests). The answer is a typed refusal or a valid answer, never a
// crash, an unhandled rejection or a leaked connection, and the state changes only when the mutated request is itself a valid
// mutation that was answered 201. The work is bounded by counters (bytes the server read, connections left), not by time.
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const test = require('node:test');
const lib = require('./u039-lib.cjs');
const { mutation, reading } = require('./u039-rows.cjs');

const TIMEOUT = 900000;
const hostOf = (instance) => `127.0.0.1:${instance.port}`;

test('a request that never completes is refused 408 with a typed body and the connection is closed', { timeout: TIMEOUT }, async () => {
  const instance = await lib.startInProcess({ bounds: { ...lib.QUIET, headersMs: 150, checkMs: 25 } });
  try {
    const socket = net.connect({ port: instance.port, host: '127.0.0.1', allowHalfOpen: true });
    const chunks = [];
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('error', () => {});
    await new Promise((resolve) => socket.on('connect', resolve));
    socket.write(`GET /v1/leases HTTP/1.1\r\nHost: ${hostOf(instance)}\r\nX-Slow: `);
    await lib.until(() => /\r\n\r\n/.test(Buffer.concat(chunks).toString('latin1')), 'the typed answer to the stalled request', Math.max(lib.CLOSE_MS, 5000));
    const [answer] = lib.parseResponses(Buffer.concat(chunks));
    assert.deepEqual([answer.status, answer.reason, answer.code, answer.connection], [408, http.STATUS_CODES[408], 'INVALID_FORMAT', 'close']);
    await lib.until(async () => (await instance.connections()) === 0, 'the server closed the stalled connection', Math.max(lib.CLOSE_MS, 5000));
    socket.destroy();
  } finally {
    await instance.close();
  }
});

function probe(port) {
  const socket = net.connect({ port, host: '127.0.0.1' });
  const chunks = [];
  let closed = false;
  socket.on('data', (chunk) => chunks.push(chunk));
  socket.on('error', () => {});
  socket.on('close', () => { closed = true; });
  return { socket, isClosed: () => closed, answers: () => lib.parseResponses(Buffer.concat(chunks)) };
}

// Polls a condition on the check phase of the event loop. No timer is used (a mocked clock never fires one); the bound is a liveness guard for a broken server.
async function immediately(check, label, ms = Math.max(lib.CLOSE_MS * 6, 9000)) {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`never held: ${label}`);
    await new Promise((resolve) => setImmediate(resolve));
  }
}

// The test owns the clock of the timer for silent connections: the server creates it when a connection is accepted, and setTimeout is mocked while the
// two connections are accepted, so that no stall of a loaded machine (a real 150 ms timer racing the client's first write) can decide the result.
test('a connection that has started a request is not cut by the timer for silent connections, one that never speaks is', { timeout: TIMEOUT }, async (t) => {
  const instance = await lib.startInProcess({ bounds: { ...lib.QUIET, firstRequestMs: 150 } });
  try {
    const host = hostOf(instance);
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const silent = probe(instance.port);
    const speaking = probe(instance.port);
    await immediately(() => instance.sockets.length === 2, 'the server accepted both connections');
    speaking.socket.write(reading(host));
    await immediately(() => speaking.answers().length >= 1, 'the first answer');
    assert.equal(silent.isClosed(), false, 'no timer fires before the clock moves');
    t.mock.timers.tick(150);
    await immediately(() => silent.isClosed(), 'the silent connection was closed by its timer');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(speaking.isClosed(), false, 'a connection that spoke outlived the timer for silent connections');
    speaking.socket.write(reading(host));
    await immediately(() => speaking.answers().length >= 2, 'the second answer on the same connection');
    speaking.socket.destroy();
  } finally {
    t.mock.timers.reset();
    await instance.close();
  }
});

test('every status the server can answer is 2xx or 4xx/5xx, so the threshold 300 of the close rule is exact', () => {
  const contract = require('../contract.js');
  const fs = require('node:fs');
  const path = require('node:path');
  const text = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
  const found = new Set(Object.values(contract.ERRORS).map((entry) => entry.status));
  for (const match of text('server.cjs').matchAll(/\b(?:send\(|status: |HPE_HEADER_OVERFLOW: |ERR_HTTP_REQUEST_TIMEOUT: |refuseUnparsed\(socket, )([1-5]\d\d)\b/g)) found.add(Number(match[1]));
  for (const match of text('result.cjs').matchAll(/\b(20\d)\b/g)) found.add(Number(match[1]));
  const allowed = [200, 201, 202, 400, 403, 404, 405, 408, 409, 413, 414, 415, 417, 421, 422, 431, 500, 503];
  assert.deepEqual([...found].filter((status) => !allowed.includes(status)), [], 'a status outside the closed list: decide its close rule');
  assert.equal([...found].some((status) => status >= 300 && status < 400), false, 'no 3xx is ever sent');
});

function prng(seed) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6D2B79F5) >>> 0; let value = state; value = Math.imul(value ^ (value >>> 15), value | 1); value ^= value + Math.imul(value ^ (value >>> 7), value | 61); return ((value ^ (value >>> 14)) >>> 0) / 4294967296; };
}

// One hostile request from one seed: a valid read or mutation, then 1 to 3 hostile edits.
function hostile(random, host) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  let bytes = pick([reading(host), mutation(host), lib.req('POST', '/v1/steps/key-0001-aaaa/cancel', { host, headers: { 'Content-Length': '0' } })]);
  const edits = 1 + Math.floor(random() * 3);
  for (let index = 0; index < edits; index += 1) {
    const at = Math.floor(random() * bytes.length);
    const kind = pick(['flip', 'truncate', 'insert', 'header', 'big', 'many', 'method', 'length', 'expect', 'fold', 'nul']);
    if (kind === 'flip') { bytes = Buffer.from(bytes); bytes[at] = Math.floor(random() * 256); }
    else if (kind === 'truncate') bytes = bytes.subarray(0, Math.max(1, at));
    else if (kind === 'insert') bytes = Buffer.concat([bytes.subarray(0, at), Buffer.from(pick(['\r\n', '\n', '\0', '\r', ' ', '\t', '%', '\xff'])), bytes.subarray(at)]);
    else if (kind === 'big') bytes = lib.join([...lib.split(bytes).head, `X-Big: ${'a'.repeat(7000 + Math.floor(random() * 4000))}`], lib.split(bytes).body);
    else if (kind === 'many') bytes = lib.join([...lib.split(bytes).head, ...Array.from({ length: 70 + Math.floor(random() * 80) }, (_, number) => `X-N${number}: 1`)], lib.split(bytes).body);
    else if (kind === 'header') bytes = lib.join([...lib.split(bytes).head, pick(['Host: 127.0.0.1:1', 'Content-Length: -1', 'Content-Length: 99999999999999999999', 'Content-Length: 2, 3', 'Transfer-Encoding: chunked', 'Transfer-Encoding: identity', 'Connection: Upgrade', 'Upgrade: websocket', 'Origin: null'])], lib.split(bytes).body);
    else if (kind === 'method') bytes = Buffer.concat([Buffer.from(pick(['BREW', 'PRI', 'TRACE', 'G E T', '\0GET', 'get'])), bytes.subarray(bytes.indexOf(' '))]);
    else if (kind === 'length') bytes = lib.join(lib.split(bytes).head.filter((line) => !/^content-length:/i.test(line)).concat(`Content-Length: ${pick(['0', '5', '2049', '4294967297'])}`), lib.split(bytes).body);
    else if (kind === 'expect') bytes = lib.join([...lib.split(bytes).head, `Expect: ${pick(['100-continue', 'x-unknown', '', '100-continue, x'])}`], lib.split(bytes).body);
    else if (kind === 'fold') bytes = lib.join([...lib.split(bytes).head, 'X-Fold: a', ' b'], lib.split(bytes).body);
    else bytes = Buffer.concat([bytes.subarray(0, at), Buffer.from('\0'), bytes.subarray(at)]);
  }
  return bytes;
}

test('a seeded fuzz of hostile raw requests: typed or valid answers only, no crash, no leaked connection, the state changes only by an answered mutation', { timeout: TIMEOUT }, async () => {
  const failures = [];
  const onFailure = (error) => failures.push(String(error?.stack ?? error));
  process.on('uncaughtException', onFailure);
  process.on('unhandledRejection', onFailure);
  const instance = await lib.startInProcess({});
  const host = hostOf(instance);
  let refused = 0;
  try {
    for (let seed = 1; seed <= 120; seed += 1) {
      const before = await instance.state();
      const bytes = hostile(prng(seed), host);
      const peer = probe(instance.port);
      await new Promise((resolve) => peer.socket.on('connect', resolve));
      peer.socket.write(bytes);
      await lib.until(() => (instance.sockets.at(-1)?.bytesRead ?? 0) >= bytes.length || peer.isClosed(), `seed ${seed}: the server read the request`);
      const after = await lib.settled(instance);
      const changed = JSON.stringify(before) !== JSON.stringify(after);
      if (changed) await lib.until(() => peer.answers().some((item) => item.status === 201), `seed ${seed}: the state changed, so a 201 must reach the client`);
      const finals = peer.answers().filter((item) => item.status !== undefined && item.status !== 100);
      for (const item of peer.answers()) assert.equal(item.garbage === undefined, true, `seed ${seed}: an answer that is not HTTP`);
      for (const item of finals) {
        assert.equal(item.status < 300 || item.code !== null, true, `seed ${seed}: ${item.status} is neither typed nor a plain 2xx`);
        if (item.status >= 300) assert.equal(item.connection, 'close', `seed ${seed}: a refusal says Connection: close`);
      }
      refused += finals.some((item) => item.status >= 300) ? 1 : 0;
      peer.socket.destroy();
    }
    const healthy = await lib.exchange(instance.port, [{ data: reading(host) }], { answers: 1 });
    assert.equal(healthy.responses[0].status, 200, 'the service still answers');
    await lib.until(async () => (await instance.connections()) === 0, 'no connection is left');
    assert.equal(refused > 30, true, `the fuzz must reach the refusal paths (${refused} of 120 seeds were refused)`);
    assert.deepEqual(failures, []);
  } finally {
    process.off('uncaughtException', onFailure);
    process.off('unhandledRejection', onFailure);
    await instance.close();
  }
});
