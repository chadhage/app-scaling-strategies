'use strict';

// Resource limits a hostile client must not get around: fragment count, unread output, refused sockets, connection count.
const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const framing = require('../framing.cjs');
const { connect } = require('../conversation.cjs');
const { cursorFor } = require('../stream.cjs');
const { createLocalServer, closeServer } = require('../server.cjs');
const { listen, upgradeRequest, until, upgradeRaw } = require('./support.cjs');
const { clientFrame, delay, openUpgraded, flood, firstResponse } = require('./limits-support.cjs');

const FRAGMENTS = 64;
const text = (payload, fin) => clientFrame(framing.OPCODES.text, payload, fin);
const more = (payload, fin) => clientFrame(framing.OPCODES.continuation, payload, fin);
const serverParser = (options = {}) => framing.createParser({ requireMask: true, maxMessageBytes: 4096, ...options });

async function withServer(body) {
  const server = createLocalServer();
  const port = await listen(server);
  try {
    return await body(server, port);
  } finally {
    await closeServer(server);
  }
}

test('zero-length continuation frames are charged against the message: the 65th frame of one message is refused', () => {
  const parser = serverParser();
  parser.push(text('{', false));
  let accepted = 0;
  let failure = null;
  try {
    for (; accepted < 10000; accepted += 1) parser.push(more(Buffer.alloc(0), false));
  } catch (error) {
    failure = error;
  }
  assert.equal(failure instanceof framing.FramingError, true, `${accepted} empty continuation frames were accepted`);
  assert.deepEqual([failure.code, failure.closeCode, accepted], ['TOO_MANY_FRAGMENTS', 1009, FRAGMENTS - 1]);
});

test('exactly the fragment limit is a valid message; one more is not; the limit is an option with a safe floor', () => {
  const fragments = (count) => Buffer.concat(Array.from({ length: count }, (_, index) => (index === 0 ? text('a', count === 1) : more('b', index === count - 1))));
  assert.deepEqual(serverParser().push(fragments(FRAGMENTS)), [{ type: 'text', text: `a${'b'.repeat(FRAGMENTS - 1)}` }]);
  assert.throws(() => serverParser().push(fragments(FRAGMENTS + 1)), (error) => error.code === 'TOO_MANY_FRAGMENTS' && error.closeCode === 1009);
  assert.deepEqual(serverParser({ maxFragments: 2 }).push(fragments(2)), [{ type: 'text', text: 'ab' }]);
  assert.throws(() => serverParser({ maxFragments: 2 }).push(fragments(3)), (error) => error.code === 'TOO_MANY_FRAGMENTS');
  assert.deepEqual(serverParser({ maxFragments: 1 }).push(fragments(1)), [{ type: 'text', text: 'a' }]);
  for (const bad of [0, -1, 1.5, '64', null, Infinity]) assert.throws(() => serverParser({ maxFragments: bad }), TypeError, String(bad));
  const counted = serverParser({ maxFragments: 2 });
  assert.equal(counted.push(Buffer.concat([text('a', true), text('b', true), text('c', true)])).length, 3, 'whole messages never add up');
});

test('a fragment flood over a real socket is closed with 1009 TOO_MANY_FRAGMENTS and creates no session', () => withServer(async (server, port) => {
  const peer = await openUpgraded(port);
  peer.socket.write(Buffer.concat([text('{', false), ...Array.from({ length: 100 }, () => more(Buffer.alloc(0), false))]));
  assert.deepEqual(await peer.closeFrame(2000), { code: 1009, reason: 'TOO_MANY_FRAGMENTS' });
  assert.equal(server.hub.sessionCount(), 0);
  peer.socket.destroy();
}));

test('a client that pings and never reads is dropped at the outbound bound and its session stays resumable', () => withServer(async (server, port) => {
  const dropped = [];
  server.on('limit', (event) => dropped.push(event));
  const peer = await upgradeRaw(port, { trailer: text('{"type":"hello"}') });
  const welcome = JSON.parse((await peer.next()).text);
  peer.socket.pause();
  const batch = Buffer.concat(Array.from({ length: 500 }, () => clientFrame(framing.OPCODES.ping, Buffer.alloc(125, 7))));
  const sent = await flood(peer.socket, batch, 400, () => dropped.length > 0);
  await until(() => dropped.length > 0, `the server drops a client that never reads (${sent} batches of 500 pings sent)`);
  assert.deepEqual(dropped[0], { code: 'OUTBOUND_BACKLOG', limit: 65536 });
  await until(() => server.hub.inspect(welcome.session).attached === false, 'the dropped client releases its session');
  peer.socket.destroy();
  const again = await connect(port);
  again.say({ type: 'resume', session: welcome.session, cursor: cursorFor(welcome.session, 0) });
  assert.equal((await again.next()).value.type, 'resumed');
  again.abort();
}));

// Clients that keep their own half of the connection open after the server answered and ended its side.
async function halfOpenPeers(port, requests) {
  const peers = requests.map((bytes) => {
    const peer = { status: null, socket: net.connect({ host: '127.0.0.1', port, allowHalfOpen: true }) };
    peer.socket.on('error', () => {});
    peer.socket.on('data', (chunk) => { peer.status ??= chunk.toString('latin1').split(' ')[1]; });
    peer.socket.once('connect', () => peer.socket.write(bytes));
    return peer;
  });
  await until(() => peers.every((peer) => peer.status !== null), 'every refusal is answered');
  return peers;
}

test('closeServer resolves although clients keep their half of a refused upgrade open', async () => {
  const server = createLocalServer();
  const port = await listen(server);
  let peers = [];
  try {
    peers = await halfOpenPeers(port, [
      upgradeRequest(port, { headers: { 'Sec-WebSocket-Version': '12' } }),
      upgradeRequest(port, { target: '/elsewhere' }),
      upgradeRequest(port, { headers: { Origin: 'http://example.invalid' } }),
      upgradeRequest(port, { headers: { 'Sec-WebSocket-Key': 'AAAA' } })
    ]);
    assert.deepEqual(peers.map((peer) => peer.status), ['426', '404', '403', '400']);
    const outcome = await Promise.race([closeServer(server).then(() => 'closed'), delay(2000).then(() => 'closeServer is still waiting for the clients')]);
    assert.equal(outcome, 'closed');
  } finally {
    for (const peer of peers) peer.socket.destroy();
    await closeServer(server);
  }
});

test('a refused upgrade is closed by the server itself once the answer is flushed', () => withServer(async (server, port) => {
  let peers = [];
  try {
    peers = await halfOpenPeers(port, Array.from({ length: 3 }, () => upgradeRequest(port, { target: '/elsewhere' })));
    const open = () => new Promise((resolve) => server.getConnections((error, count) => resolve(count)));
    for (let waited = 0; waited < 2000 && (await open()) > 0; waited += 20) await delay(20);
    assert.equal(await open(), 0, 'the refused sockets are gone although the clients never closed theirs');
  } finally {
    for (const peer of peers) peer.socket.destroy();
  }
}));

test('the fixture holds at most 128 connections; one more is dropped and a freed slot is usable again', () => withServer(async (server, port) => {
  const held = [];
  for (let index = 0; index < 128; index += 1) held.push(await openUpgraded(port));
  const extra = await firstResponse(port, upgradeRequest(port), 1500);
  assert.equal(extra.status, null, 'the 129th connection is dropped without an answer');
  held.pop().socket.destroy();
  let status = null;
  for (let attempt = 0; attempt < 40 && status !== 101; attempt += 1) {
    status = (await firstResponse(port, upgradeRequest(port), 1500)).status;
    if (status !== 101) await delay(25);
  }
  assert.equal(status, 101);
  for (const peer of held) peer.socket.destroy();
}));
