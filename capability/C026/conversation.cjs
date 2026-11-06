'use strict';

// A small RFC 6455 client over node:net. It exists so the server can produce a transcript of a REAL WebSocket
// conversation with its own fixture (the isolated browser cannot carry a WebSocket) and so tests can destroy a socket
// without a close frame. It speaks to 127.0.0.1 only.
const crypto = require('node:crypto');
const net = require('node:net');
const framing = require('./framing.cjs');
const { cursorFor } = require('./stream.cjs');

const HANDSHAKE_LIMIT = 8192;
const WAIT_MS = 5000;

function connect(port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const key = crypto.randomBytes(16).toString('base64');
    const parser = framing.createParser({ requireMask: false });
    const inbox = [];
    const waiters = [];
    const state = { head: Buffer.alloc(0), upgraded: false, ended: false, error: null };
    const mask = () => crypto.randomBytes(4);

    function settleWaiters(error) {
      state.ended = true;
      state.error = error;
      for (const waiter of waiters.splice(0)) waiter.fail(error);
    }

    function deliver(item) {
      if (waiters.length > 0) waiters.shift().ok(item); else inbox.push(item);
    }

    function feed(chunk) {
      try {
        for (const message of parser.push(chunk)) {
          if (message.type === 'text') deliver({ kind: 'message', value: JSON.parse(message.text) });
          else if (message.type === 'close') deliver({ kind: 'close', code: message.code, reason: message.reason });
          else if (message.type === 'ping') socket.write(framing.encodeFrame({ opcode: framing.OPCODES.pong, payload: message.data, maskKey: mask() }));
        }
      } catch (error) {
        socket.destroy();
        settleWaiters(error);
      }
    }

    function handshake(chunk) {
      state.head = Buffer.concat([state.head, chunk]);
      const end = state.head.indexOf('\r\n\r\n');
      if (end === -1) {
        if (state.head.length > HANDSHAKE_LIMIT) {
          socket.destroy();
          reject(new Error('HANDSHAKE_TOO_LARGE'));
        }
        return;
      }
      const lines = state.head.subarray(0, end).toString('latin1').split('\r\n');
      const accept = lines.find((line) => /^sec-websocket-accept:/i.test(line))?.split(':')[1]?.trim();
      if (!/^HTTP\/1\.1 101 /.test(lines[0]) || accept !== framing.acceptKey(key)) {
        socket.destroy();
        reject(new Error(`HANDSHAKE_REFUSED ${lines[0]}`));
        return;
      }
      state.upgraded = true;
      const rest = state.head.subarray(end + 4);
      state.head = Buffer.alloc(0);
      resolve(client);
      if (rest.length > 0) feed(rest);
    }

    const client = Object.freeze({
      say(value) {
        socket.write(framing.encodeFrame({ opcode: framing.OPCODES.text, payload: JSON.stringify(value), maskKey: mask() }));
      },
      writeRaw(bytes) { socket.write(bytes); },
      next() {
        if (inbox.length > 0) return Promise.resolve(inbox.shift());
        if (state.ended) return Promise.reject(state.error);
        return new Promise((ok, fail) => {
          const timer = setTimeout(() => fail(new Error('NO_FRAME_WITHIN_5000_MS')), WAIT_MS);
          waiters.push({ ok: (item) => { clearTimeout(timer); ok(item); }, fail: (error) => { clearTimeout(timer); fail(error); } });
        });
      },
      close(code = 1000) { socket.write(framing.encodeClose(code, '', mask())); },
      abort() { socket.destroy(); }
    });

    socket.once('connect', () => {
      socket.write([
        'GET /stream HTTP/1.1', `Host: 127.0.0.1:${port}`, 'Upgrade: websocket', 'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`, 'Sec-WebSocket-Version: 13', '', ''
      ].join('\r\n'));
    });
    socket.on('data', (chunk) => (state.upgraded ? feed(chunk) : handshake(chunk)));
    socket.on('error', (error) => { settleWaiters(error); reject(error); });
    socket.on('close', () => {
      settleWaiters(new Error('CONNECTION_ENDED'));
      reject(new Error('CONNECTION_ENDED_BEFORE_UPGRADE'));
    });
  });
}

async function runScript(origin) {
  const port = Number(new URL(origin).port);
  const events = [];
  const clients = [];
  const log = (conn, dir, extra) => events.push({ n: events.length + 1, conn, dir, ...extra });
  async function open(name) {
    const client = await connect(port);
    clients.push(client);
    log(name, 'open');
    return client;
  }
  function send(name, client, frame) {
    client.say(frame);
    log(name, 'send', { frame });
  }
  async function receive(name, client, type, count = 1) {
    let value;
    for (let index = 0; index < count; index += 1) {
      const item = await client.next();
      if (item.kind !== 'message' || item.value.type !== type) throw new Error(`SCRIPT_DIVERGED ${name} expected ${type}`);
      value = item.value;
      log(name, 'recv', { frame: value });
    }
    return value;
  }
  async function closedBy(name, client, code) {
    const item = await client.next();
    if (item.kind !== 'close' || item.code !== code) throw new Error(`SCRIPT_DIVERGED ${name} expected close ${code}`);
    log(name, 'close-recv', { code: item.code, reason: item.reason });
  }
  async function failed(name, client, code) {
    const error = await receive(name, client, 'error');
    if (error.code !== code) throw new Error(`SCRIPT_DIVERGED ${name} expected ${code}`);
    await closedBy(name, client, 1008);
  }

  try {
    const a1 = await open('A1');
    send('A1', a1, { type: 'hello' });
    const welcomeA = await receive('A1', a1, 'welcome');
    await receive('A1', a1, 'message', 3);
    send('A1', a1, { type: 'ack', seq: 1 });
    await receive('A1', a1, 'acked');
    await receive('A1', a1, 'message');
    send('A1', a1, { type: 'ack', seq: 2 });
    const ackedTwo = await receive('A1', a1, 'acked');
    await receive('A1', a1, 'message');
    a1.abort();
    log('A1', 'abort');

    const a2 = await open('A2');
    send('A2', a2, { type: 'resume', session: welcomeA.session, cursor: ackedTwo.cursor });
    await receive('A2', a2, 'resumed');
    await receive('A2', a2, 'message', 3);
    send('A2', a2, { type: 'ack', seq: 3 });
    await receive('A2', a2, 'acked');
    await receive('A2', a2, 'message');
    for (const seq of [4, 5, 6]) {
      send('A2', a2, { type: 'ack', seq });
      await receive('A2', a2, 'acked');
    }
    await receive('A2', a2, 'complete');
    await closedBy('A2', a2, 1000);

    const b1 = await open('B1');
    send('B1', b1, { type: 'hello' });
    const welcomeB = await receive('B1', b1, 'welcome');
    await receive('B1', b1, 'message', 3);
    send('B1', b1, { type: 'ack', seq: 6 });
    await failed('B1', b1, 'ACK_UNSENT');
    const b2 = await open('B2');
    send('B2', b2, { type: 'resume', session: welcomeB.session, cursor: welcomeB.cursor });
    await receive('B2', b2, 'resumed');
    await receive('B2', b2, 'message', 3);
    b2.close(1000);
    log('B2', 'close-send', { code: 1000 });
    await closedBy('B2', b2, 1000);

    const c1 = await open('C1');
    send('C1', c1, { type: 'resume', session: welcomeA.session, cursor: cursorFor(welcomeA.session, 99) });
    await failed('C1', c1, 'CURSOR_FROM_FUTURE');
    const c2 = await open('C2');
    send('C2', c2, { type: 'resume', session: welcomeA.session, cursor: welcomeB.cursor });
    await failed('C2', c2, 'CURSOR_FOREIGN_SESSION');
    const c3 = await open('C3');
    send('C3', c3, { type: 'hello' });
    const welcomeC = await receive('C3', c3, 'welcome');
    await receive('C3', c3, 'message', 3);
    send('C3', c3, { type: 'message', seq: 7, body: 'forged by the client' });
    await failed('C3', c3, 'CLIENT_SEQUENCE_FORBIDDEN');
    const c4 = await open('C4');
    send('C4', c4, { type: 'hello' });
    const welcomeD = await receive('C4', c4, 'welcome');
    await receive('C4', c4, 'message', 3);
    send('C4', c4, { type: 'ack', seq: 3 });
    await failed('C4', c4, 'ACK_OUT_OF_ORDER');

    const aliases = [[welcomeA.session, 'S-A'], [welcomeB.session, 'S-B'], [welcomeC.session, 'S-C'], [welcomeD.session, 'S-D']];
    let text = JSON.stringify(events);
    for (const [real, alias] of aliases) text = text.replaceAll(real, alias);
    return { total: 6, window: 3, sessionAliases: aliases.map(([, alias]) => alias), events: JSON.parse(text) };
  } finally {
    for (const client of clients) client.abort();
  }
}

module.exports = Object.freeze({ connect, runScript });
