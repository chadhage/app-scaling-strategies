'use strict';

const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const framing = require('../framing.cjs');
const { connect, runScript } = require('../conversation.cjs');
const { createHub } = require('../stream.cjs');
const { createLocalServer, closeServer } = require('../server.cjs');
const { listen } = require('./support.cjs');

const head = (key, accept = framing.acceptKey(key)) => `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`;
const frame = (opcode, payload, maskKey) => framing.encodeFrame({ opcode, payload, maskKey });

// A scripted peer on 127.0.0.1: after the client's upgrade request it hands the socket and the client's key to `behave`.
async function serve(behave) {
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.once('data', (chunk) => behave(socket, /sec-websocket-key: (.+)\r\n/i.exec(chunk.toString('latin1'))?.[1]));
  });
  const port = await listen(server);
  return {
    port,
    close: () => new Promise((resolve) => { for (const socket of sockets) socket.destroy(); server.close(() => resolve()); })
  };
}

async function against(behave, body) {
  const peer = await serve(behave);
  try {
    return await body(peer.port);
  } finally {
    await peer.close();
  }
}

test('connect refuses anything that is not a correct 101 upgrade', async () => {
  await against((socket) => socket.end('HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n'), async (port) => {
    await assert.rejects(connect(port), /HANDSHAKE_REFUSED HTTP\/1\.1 200 OK/);
  });
  await against((socket, key) => socket.write(head(key, 'AAAAAAAAAAAAAAAAAAAAAAAAAAA=')), async (port) => {
    await assert.rejects(connect(port), /HANDSHAKE_REFUSED HTTP\/1\.1 101/);
  });
  await against((socket) => socket.write(Buffer.alloc(9000, 0x41)), async (port) => {
    await assert.rejects(connect(port), /HANDSHAKE_TOO_LARGE/);
  });
  await against((socket) => { socket.write('HTTP/1.1 101 Switching Protocols\r\n'); setImmediate(() => socket.end()); }, async (port) => {
    await assert.rejects(connect(port), /CONNECTION_ENDED_BEFORE_UPGRADE/);
  });
});

test('connect to a port nobody listens on is an error, not a hang', async () => {
  const server = net.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  await assert.rejects(connect(port), /ECONNREFUSED/);
});

test('the client answers a ping that arrives with the handshake and delivers JSON text and close frames', async () => {
  let seen;
  const ponged = new Promise((resolve) => { seen = resolve; });
  await against((socket, key) => {
    const parser = framing.createParser({ requireMask: true });
    socket.on('data', (chunk) => {
      for (const message of parser.push(chunk)) if (message.type === 'pong') seen(message.data.toString());
    });
    socket.write(Buffer.concat([Buffer.from(head(key)), frame(framing.OPCODES.ping, 'p1'), frame(framing.OPCODES.pong, ''), frame(framing.OPCODES.binary, 'b'), frame(framing.OPCODES.text, '{"n":1}')]));
    ponged.then(() => socket.write(framing.encodeClose(1000, 'bye')));
  }, async (port) => {
    const client = await connect(port);
    assert.deepEqual(await client.next(), { kind: 'message', value: { n: 1 } });
    assert.equal(await ponged, 'p1');
    assert.deepEqual(await client.next(), { kind: 'close', code: 1000, reason: 'bye' });
    client.abort();
  });
});

test('a frame that is not JSON, or breaks framing, fails the reader and every later read', async () => {
  const cases = [
    ['text that is not JSON', frame(framing.OPCODES.text, 'not json'), SyntaxError],
    ['a masked server frame', frame(framing.OPCODES.text, '{}', Buffer.from([1, 2, 3, 4])), framing.FramingError]
  ];
  for (const [name, bytes, kind] of cases) {
    await against((socket, key) => socket.write(Buffer.concat([Buffer.from(head(key)), bytes])), async (port) => {
      const client = await connect(port);
      const first = await client.next().then(() => null, (error) => error);
      assert.equal(first instanceof kind, true, name);
      assert.equal(await client.next().then(() => null, (error) => error), first, name);
    });
  }
});

test('a connection that ends is reported to a waiting and to a later reader', async () => {
  await against((socket, key) => { socket.write(head(key)); setImmediate(() => socket.end()); }, async (port) => {
    const client = await connect(port);
    await assert.rejects(client.next(), /CONNECTION_ENDED/);
    await assert.rejects(client.next(), /CONNECTION_ENDED/);
  });
});

test('queued frames are delivered in arrival order before any waiter is used', async () => {
  await against((socket, key) => socket.write(Buffer.concat([Buffer.from(head(key)), frame(framing.OPCODES.text, '{"n":1}'), frame(framing.OPCODES.text, '{"n":2}')])), async (port) => {
    const client = await connect(port);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual([(await client.next()).value.n, (await client.next()).value.n], [1, 2]);
    client.abort();
  });
});

function wrapped(hub, { frame: rewrite = (value) => value, close: rewriteClose = (code, reason) => [code, reason] } = {}) {
  return {
    connect: ({ send, close }) => hub.connect({
      send: (value) => send(rewrite(value)),
      close: (code, reason) => close(...rewriteClose(code, reason))
    })
  };
}

async function script(hub) {
  const server = createLocalServer({ hub, transcript: null });
  const port = await listen(server);
  try {
    return await runScript(`http://127.0.0.1:${port}`);
  } finally {
    await closeServer(server);
  }
}

test('the scripted conversation records every step and aliases the session ids', async () => {
  const result = await script(createHub({ total: 6, window: 3 }));
  assert.deepEqual(result.sessionAliases, ['S-A', 'S-B', 'S-C', 'S-D']);
  assert.deepEqual([result.total, result.window], [6, 3]);
  assert.deepEqual(result.events.map((event) => event.n), result.events.map((_, index) => index + 1));
  assert.equal(JSON.stringify(result.events).includes('synthetic message 6 of 6'), true);
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-/.test(JSON.stringify(result)), false, 'no real session id leaks');
  const abort = result.events.findIndex((event) => event.dir === 'abort');
  assert.equal(result.events[abort - 1].frame.type, 'message');
  const resume = result.events.find((event) => event.dir === 'send' && event.frame.type === 'resume');
  assert.equal(resume.frame.cursor, 'c1.S-A.2');
  const redelivered = result.events.filter((event) => event.dir === 'recv' && event.frame.redelivered === true);
  assert.deepEqual(redelivered.map((event) => [event.conn, event.frame.seq, event.frame.deliveries]),
    [['A2', 3, 2], ['A2', 4, 2], ['A2', 5, 2], ['B2', 1, 2], ['B2', 2, 2], ['B2', 3, 2]]);
  assert.deepEqual(result.events.filter((event) => event.dir === 'recv' && event.frame.type === 'error').map((event) => [event.conn, event.frame.code]),
    [['B1', 'ACK_UNSENT'], ['C1', 'CURSOR_FROM_FUTURE'], ['C2', 'CURSOR_FOREIGN_SESSION'], ['C3', 'CLIENT_SEQUENCE_FORBIDDEN'], ['C4', 'ACK_OUT_OF_ORDER']]);
  assert.deepEqual(result.events.filter((event) => event.dir.startsWith('close')).map((event) => [event.conn, event.dir, event.code]),
    [['A2', 'close-recv', 1000], ['B1', 'close-recv', 1008], ['B2', 'close-send', 1000], ['B2', 'close-recv', 1000],
      ['C1', 'close-recv', 1008], ['C2', 'close-recv', 1008], ['C3', 'close-recv', 1008], ['C4', 'close-recv', 1008]]);
});

test('a fixture that diverges from the script stops the conversation instead of producing a transcript', async () => {
  await assert.rejects(script(wrapped(createHub({ total: 6, window: 3 }), { frame: (value) => (value.type === 'welcome' ? { ...value, type: 'error' } : value) })),
    /SCRIPT_DIVERGED A1 expected welcome/);
  await assert.rejects(script(wrapped(createHub({ total: 6, window: 3 }), { frame: (value) => (value.type === 'error' ? { ...value, code: 'WRONG' } : value) })),
    /SCRIPT_DIVERGED B1 expected ACK_UNSENT/);
  await assert.rejects(script(wrapped(createHub({ total: 6, window: 3 }), { close: (code, reason) => (code === 1000 ? [1001, reason] : [code, reason]) })),
    /SCRIPT_DIVERGED A2 expected close 1000/);
  await assert.rejects(script(wrapped(createHub({ total: 6, window: 3 }), { frame: (value) => (value.type === 'message' ? { ...value, type: 'acked' } : value) })),
    /SCRIPT_DIVERGED A1 expected message/);
});
