'use strict';

// F24 of the third independent review. A request behind the FIRST request of a connection is never run and never answered, but Node's parser
// still builds a request and a response object for every one of them and, because nothing is ever written for them, nothing slows the socket
// down: a flood pipelined behind a PENDING first request (a valid cancel waits for its step boundary) was retained at about 1.8 KB per request
// until a small-heap server hung or aborted with an out-of-memory error. A connection may leave at most TOLERATED requests behind its first one
// (README); the next one destroys it while the first request keeps running. Everything below is COUNTED, never timed: the server-side socket is
// inspected at the moment the parser has delivered the request in question (the server's own `request` event, which fires after the central handler
// of that same request has run), so a mutant that fails to destroy fails by assertion and never by hanging. The process version of the attack
// (a 48 MB heap, 50,000 requests per connection) is in pending-flood-process.test.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const s = require('./support.cjs');
const h = require('./http.cjs');

const TOLERATED = 8;

const stateRequest = (port) => `GET /api/state HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`;

function cancelRequest(port, key, actionId) {
  const body = JSON.stringify(s.cancelCmd(key, actionId, 1, false));
  return `POST /api/cancel HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
}

// A client that records what the server answers; `closed` resolves when the connection is gone.
function client(port, bytes) {
  const socket = net.connect({ host: '127.0.0.1', port });
  const parts = [];
  const closed = new Promise((resolve) => socket.once('close', resolve));
  socket.on('data', (part) => parts.push(part));
  socket.on('error', () => {});
  if (bytes) socket.write(bytes);
  const text = () => Buffer.concat(parts).toString('latin1');
  return { socket, closed, text, statuses: () => [...text().matchAll(/HTTP\/1\.[01] (\d{3})/g)].map((match) => Number(match[1])) };
}

// A served engine whose step `step` is in flight and held, a record of the server-side sockets and a count of the requests the parser delivered.
async function startOver(t, step) {
  const env = await h.serve(t);
  env.ctx.g.hold('in', step);
  const started = await h.post(env.origin, '/api/start', s.startCmd('pending-start-0001'));
  assert.equal(started.status, 202);
  env.actionId = started.json.action.actionId;
  await env.ctx.engine.waitFor((state) => state.journal.some((entry) => entry.type === 'step-intent' && entry.step === step));
  env.port = Number(new URL(env.origin).port);
  env.accepted = [];
  env.server.on('connection', (socket) => env.accepted.push(socket));
  let seen = 0;
  const waiting = [];
  env.server.on('request', () => {
    seen += 1;
    for (const entry of waiting.filter((item) => item.count <= seen)) entry.resolve();
  });
  env.reached = (count) => (seen >= count ? Promise.resolve() : new Promise((resolve) => waiting.push({ count, resolve })));
  env.release = () => env.ctx.g.release('in', step);
  return env;
}

test('TOLERATED requests behind a pending first request do not cost the connection: its answer arrives once the step is released and nothing else is answered', async (t) => {
  const env = await startOver(t, 2);
  try {
    const pending = client(env.port, cancelRequest(env.port, 'pend-keep-0001', env.actionId) + stateRequest(env.port).repeat(TOLERATED));
    await env.reached(1 + TOLERATED);
    assert.equal(env.accepted.length, 1);
    assert.equal(env.accepted[0].destroyed, false, `${TOLERATED} requests behind the first one are within the bound`);
    env.release();
    await pending.closed;
    assert.deepEqual(pending.statuses(), [200], 'only the first request of the connection is answered');
    const answer = JSON.parse(pending.text().slice(pending.text().indexOf('\r\n\r\n') + 4));
    assert.equal(answer.kind, 'C017-cancel-result');
    assert.equal(answer.outcome, 'CANCELLED_PARTIAL');
    s.assertHonest(assert, answer, env.ctx.engine.view().journal);
    assert.equal(s.decisions(env.ctx).length, 1, 'the cancel was applied exactly once');
  } finally {
    env.release();
  }
});

test('one request more than TOLERATED destroys the connection while the first request is still pending; the cancel is applied once and its idempotent retry returns the outcome', async (t) => {
  const env = await startOver(t, 2);
  try {
    const key = 'pend-cut-0001';
    const flooded = client(env.port, cancelRequest(env.port, key, env.actionId) + stateRequest(env.port).repeat(TOLERATED + 1));
    await env.reached(1 + TOLERATED + 1);
    assert.equal(env.accepted[0].destroyed, true, `the connection survived ${TOLERATED + 1} requests behind a pending first request`);
    await flooded.closed;
    assert.deepEqual(flooded.statuses(), [], 'nothing was answered on the destroyed connection');
    const neighbour = await h.get(env.origin, '/api/state');
    assert.equal(neighbour.status, 200, 'an unrelated connection is untouched');
    env.release();
    await env.ctx.engine.waitFor((state) => Boolean(state.action.cancel && state.action.cancel.outcome === 'CANCELLED_PARTIAL'));
    const retry = await h.post(env.origin, '/api/cancel', s.cancelCmd(key, env.actionId, 1, false));
    assert.equal(retry.status, 200);
    assert.equal(retry.json.outcome, 'CANCELLED_PARTIAL');
    s.assertHonest(assert, retry.json, env.ctx.engine.view().journal);
    assert.equal(s.decisions(env.ctx).length, 1, 'the cancel of the destroyed connection was applied exactly once');
  } finally {
    env.release();
  }
});

test('the bound counts across reads: one request per write, the ninth request behind the first one destroys the connection and not the eighth', async (t) => {
  const env = await startOver(t, 2);
  try {
    const slow = client(env.port, cancelRequest(env.port, 'pend-trickle-0001', env.actionId));
    await env.reached(1);
    for (let behind = 1; behind <= TOLERATED + 1; behind += 1) {
      await new Promise((resolve) => slow.socket.write(stateRequest(env.port), resolve));
      await env.reached(1 + behind);
      assert.equal(env.accepted[0].destroyed, behind > TOLERATED, `after ${behind} requests behind the first one`);
    }
    await slow.closed;
    assert.deepEqual(slow.statuses(), []);
  } finally {
    env.release();
  }
});

test('requests behind a first request that is answered at once count as well: the ninth one destroys the connection, with no drain and no pending request needed', async (t) => {
  const env = await startOver(t, 2);
  try {
    const behind = client(env.port, stateRequest(env.port).repeat(1 + TOLERATED + 1));
    await env.reached(1 + TOLERATED + 1);
    assert.equal(env.accepted[0].destroyed, true, `a connection that leaves more than ${TOLERATED} requests behind its first one is destroyed`);
    await behind.closed;
  } finally {
    env.release();
  }
});

test('a polite client that pipelines a few requests keeps the first answer: [GET][GET] ends with one 200 and a closed connection', async (t) => {
  const env = await startOver(t, 2);
  try {
    const polite = client(env.port, stateRequest(env.port) + stateRequest(env.port));
    await polite.closed;
    assert.deepEqual(polite.statuses(), [200], 'the request behind the first one is neither run nor answered');
    assert.equal(env.accepted[0].destroyed, true);
  } finally {
    env.release();
  }
});
