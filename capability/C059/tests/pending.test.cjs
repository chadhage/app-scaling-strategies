'use strict';

// Third review, Q2 (F24): a pending first request keeps the parsed requests of its first 64 KB read until it ends. Node's HTTP parser consumes the socket directly and parses a WHOLE
// read (about 3,600 tiny pipelined requests) before any JavaScript can cut the connection, so the cost is PER SOCKET (about 6 MB) and bounded by the connection cap; it does not grow
// with the requests a client sends after that read (the depth bound destroys the socket). The facts below are STRUCTURAL: request events counted per socket, sockets closed, a
// legitimate request answered, the cap read back from the server. Never a heap size and never a time: the only waits are polls to quiescence with a hard bound.
const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const { BOUNDS } = require('./subject.cjs').load('server.cjs');
const { call, startChild, until } = require('./net.cjs');
const { submitBody } = require('./lane-support.cjs');

const OPTIONS = { timeout: 180000 };
const UNIT = 'GET / HTTP/1.1\r\n\r\n';
const READ_BYTES = 65536;
const BLOCK = UNIT.repeat(Math.floor(READ_BYTES / UNIT.length));
// Timers that would end an idle or slow connection anyway are set to ten minutes, so only the rule under test can close it.
const QUIET = Object.freeze({ requestMs: 600000, headersMs: 600000, keepAliveMs: 600000, idleMs: 600000, firstRequestMs: 600000 });
// One read holds at most this many requests; the lane may admit its depth bound of requests in earlier reads before the read that overflows it.
const ONE_READ = Math.floor(READ_BYTES / UNIT.length) + BOUNDS.pipelineDepth + 2;

function attacker(port, key) {
  const socket = net.connect({ host: '127.0.0.1', port });
  const body = submitBody(key);
  const client = { socket, blocks: 0, closed: false };
  socket.on('error', () => {});
  socket.on('data', () => {});
  client.done = new Promise((resolve) => socket.once('close', () => { client.closed = true; resolve(); }));
  socket.write(`POST /v1/steps HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  return client;
}

// Writes 64 KB blocks of the cheapest request until the server closes the socket or `blocks` were written.
async function flood(client, blocks) {
  while (client.blocks < blocks && !client.closed) {
    const written = await Promise.race([new Promise((resolve) => client.socket.write(BLOCK, (error) => resolve(!error))), client.done.then(() => false)]);
    if (!written) break;
    client.blocks += 1;
  }
}

async function pending(child, sockets, blocks, label) {
  const clients = Array.from({ length: sockets }, (_, index) => attacker(child.port, `${label}-${String(index).padStart(4, '0')}`));
  try {
    await until(async () => (await child.stats()).entered === sockets, 'every first request is in flight (held by the executor)');
    await Promise.all(clients.map((client) => flood(client, blocks)));
    await Promise.all(clients.map((client) => client.done));
    await until(async () => (await child.stats()).connections === 0, 'the server holds no connection once every attacker was cut');
    return { clients, stats: await child.stats() };
  } finally {
    for (const client of clients) client.socket.destroy();
  }
}

for (const blocks of [1, 40]) {
  test(`${blocks === 1 ? 'one 64 KB read' : 'up to 40 reads (2.5 MB)'} of tiny GETs behind a pending POST: the request events per socket stay within ONE read, whatever the client sends after it`, OPTIONS, async () => {
    const child = await startChild({ mode: 'hold', heapMb: 256, bounds: QUIET, watchdogMs: 120000 });
    try {
      const { clients, stats } = await pending(child, 3, blocks, `pend-${blocks}`);
      assert.equal(stats.perSocket.length, 3, 'three attacker sockets were served');
      assert.ok(stats.perSocket.every((count) => count <= ONE_READ), `request events per socket ${JSON.stringify(stats.perSocket)} are bounded by one read (${ONE_READ})`);
      assert.ok(stats.perSocket.every((count) => count >= 50), `the parser did consume a read of tiny requests before the lane could cut the socket (${JSON.stringify(stats.perSocket)}): the limit is real, not an artefact`);
      assert.ok(clients.every((client) => client.closed), 'every attacker socket was closed by the server');
      assert.equal(stats.entered, 3, 'all three first requests were still pending (the shape of the finding)');
      assert.equal((await call(child.port, 'GET', '/scope.json')).status, 200, 'a legitimate GET is answered while the three first requests are pending');
      await child.release();
    } finally {
      child.dispose();
    }
  });
}

test('three pending sockets in a child with a 48 MB heap: the child stays alive, every socket is closed, a legitimate GET is answered (the cost is about 6 MB per pending socket, so 3 fit)', OPTIONS, async () => {
  const child = await startChild({ mode: 'hold', heapMb: 48, bounds: QUIET, watchdogMs: 120000 });
  try {
    const { clients, stats } = await pending(child, 3, 40, 'heap');
    assert.ok(child.alive(), `the child survived: ${child.errors().slice(0, 200)}`);
    assert.ok(clients.every((client) => client.closed), 'every attacker socket was closed by the server');
    assert.equal(stats.entered, 3);
    assert.ok(stats.perSocket.every((count) => count <= ONE_READ));
    assert.equal((await call(child.port, 'GET', '/scope.json')).status, 200);
    await child.release();
    assert.ok(child.alive(), 'and it survived the release of the three held steps');
  } finally {
    child.dispose();
  }
});

test(`the connection cap is ${BOUNDS.connections}, read back from the server: of 128 idle sockets it keeps ${BOUNDS.connections} and Node drops the rest at accept, and every one is accounted for`, OPTIONS, async () => {
  assert.equal(BOUNDS.connections, 32, 'the documented cap (32 x about 6 MB of pending first requests is the worst case, about 190 MB)');
  const child = await startChild({ bounds: QUIET, watchdogMs: 120000 });
  const sockets = [];
  try {
    for (let index = 0; index < 128; index += 1) {
      const socket = net.connect({ host: '127.0.0.1', port: child.port });
      socket.on('error', () => {});
      socket.on('data', () => {});
      sockets.push(socket);
    }
    await until(async () => { const stats = await child.stats(); return stats.accepted + stats.dropped === 128; }, 'every socket was accepted or dropped at accept');
    const stats = await child.stats();
    assert.deepEqual([stats.maxConnections, stats.accepted, stats.dropped, stats.connections], [32, 32, 96, 32]);
    for (const socket of sockets) socket.destroy();
    await until(async () => (await child.stats()).connections === 0, 'the server holds no connection once the idle sockets are gone');
    assert.equal((await call(child.port, 'GET', '/scope.json')).status, 200, 'a legitimate GET is answered');
  } finally {
    for (const socket of sockets) socket.destroy();
    child.dispose();
  }
});
