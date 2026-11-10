'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { startChild, clients, within } = require('./resource-harness.cjs');

// The server runs in a child capped at 48 MB with a forced GC before each reading: its baseline is about 5 MB, so a retained
// heap above 24 MB means a client made the server keep memory. Every child is killed by PID if a hard timer fires.
const HEAP_LIMIT = 24 * 1024 * 1024;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Retention, not scheduling (L-0144): a child starved by a loaded machine still holds the request and response objects of the
// attack it has not finished with, so ONE reading after a fixed sleep measured the load and failed about 1 run in 20 (28.5 MB).
// Poll forced-GC readings until the whole attack has been accepted and one is below the limit; memory that is really retained stays
// above it for the whole window, and the lowest reading is reported.
async function settledHeap(server, { accepted = 0, limit = HEAP_LIMIT, windowMs = 20000 } = {}) {
  const deadline = Date.now() + windowMs;
  let lowest = Infinity;
  for (;;) {
    const sample = await server.ask('stats', 'stats', 30000);
    lowest = Math.min(lowest, sample.heapUsed);
    if ((sample.accepted >= accepted && sample.heapUsed < limit) || Date.now() > deadline) return { heapUsed: lowest, accepted: sample.accepted };
    await sleep(250);
  }
}

async function withChild(probe) {
  const server = startChild({ heapMb: 48, hardMs: 90000 });
  let net;
  try {
    const { port, tokens } = await server.receive('listening', 30000);
    net = clients(port);
    return await probe({ server, net, port, tokens, origin: `http://127.0.0.1:${port}` });
  } finally {
    if (net) net.destroyAll();
    server.stop();
  }
}

// After the attack a normal client and a normal authorized command must still be served, and the settled retained heap must be small.
async function assertServiceable({ server, origin, tokens }, accepted) {
  const sample = await settledHeap(server, { accepted });
  assert.ok(sample.accepted >= accepted, `the attack reached the server: ${sample.accepted} of ${accepted} connections accepted`);
  assert.ok(sample.heapUsed < HEAP_LIMIT, `retained heap ${sample.heapUsed} must stay below ${HEAP_LIMIT}`);
  assert.equal((await fetch(`${origin}/v1/state`, { signal: AbortSignal.timeout(20000) })).status, 200, 'a normal client is still served');
  const resize = await fetch(`${origin}/v1/commands/pool.resize`, {
    method: 'POST', headers: { Authorization: `Bearer ${tokens.operator}`, 'Content-Type': 'application/json' }, body: '{"size":5}', signal: AbortSignal.timeout(20000)
  });
  assert.equal(resize.status, 200, 'a normal authorized command still works');
}

// The attackers are still connected: the CLI shutdown must end every socket and the process must exit by itself, code 0.
async function assertShutdown({ server }) {
  await server.ask('close', 'closed', 25000);
  const end = await within(server.exited, 'the server process ends by itself', 25000);
  assert.deepEqual([end.code, end.signal], [0, null], `the child exits cleanly: ${end.stderr}`);
}

test('pipelined floods that are never read cannot exhaust a small server process, and shutdown still ends it', () => withChild(async (context) => {
  const line = `GET /v1/state HTTP/1.1\r\nHost: 127.0.0.1:${context.port}\r\n\r\n`;
  const flood = Buffer.from(line.repeat(20000));
  for (let index = 0; index < 16; index += 1) context.net.open(flood);
  await sleep(1500);
  await assertServiceable(context, 16);
  await assertShutdown(context);
}));

test('silent, partial and half-open clients cannot keep the server alive or block its shutdown', () => withChild(async (context) => {
  const { net, port } = context;
  const host = `Host: 127.0.0.1:${port}`;
  for (let index = 0; index < 100; index += 1) net.open();
  for (let index = 0; index < 40; index += 1) net.open('GET /v1/sta');
  for (let index = 0; index < 40; index += 1) net.open(`GET /v1/state HTTP/1.1\r\n${host}\r\nX-Partial: a`);
  for (let index = 0; index < 20; index += 1) {
    net.open(`POST /v1/commands/pool.resize HTTP/1.1\r\n${host}\r\nContent-Type: application/json\r\nContent-Length: 4096\r\n\r\n{"size"`);
  }
  for (let index = 0; index < 20; index += 1) net.open(`GET /v1/state HTTP/1.1\r\n${host}\r\n\r\n`).end();
  await sleep(500);
  await assertServiceable(context, 220);
  await assertShutdown(context);
}));

// The header flood is refused by Node's own clientError path, which writes the 431 and destroys the socket while the flood is still
// arriving. On Windows the reset that follows can discard the 431 before the client has read it (L-0179: an EMPTY answer in about 1 run
// in 16 at 8 in parallel), so the client's view is "the 431 or nothing"; what must hold is structural and is read from the SERVER child:
// it closed that connection and read far less than the 1 MB that was offered (the header limit is 16 KB).
const FLOOD_READ_BOUND = 256 * 1024;

async function closedByServer(server, index, windowMs = 30000) {
  const deadline = Date.now() + windowMs;
  for (;;) {
    const { sockets } = await server.ask('stats', 'stats', 30000);
    if ((sockets[index] && sockets[index].closed) || Date.now() > deadline) return sockets[index];
    await sleep(100);
  }
}

test('a header flood and an endless chunked upload are cut off without effect and without retained memory', () => withChild(async (context) => {
  const { net, port, tokens, origin, server } = context;
  const host = `Host: 127.0.0.1:${port}`;
  const flood = net.open(`GET /v1/state HTTP/1.1\r\n${host}\r\n${'X-Pad: 1\r\n'.repeat(100000)}\r\n`, { read: true });
  const answer = await within(new Promise((resolve) => {
    let text = '';
    flood.on('data', (chunk) => { text += chunk; });
    flood.once('close', () => resolve(text));
  }), 'the header flood is closed by the server', 45000);
  assert.ok(answer === '' || /^HTTP\/1\.1 431 /.test(answer), `the client saw the 431 or nothing, not ${JSON.stringify(answer.slice(0, 60))}`);
  const closed = await closedByServer(server, 0);
  assert.equal(closed && closed.closed, true, 'the server closed the flooding connection');
  assert.ok(closed.bytesRead <= FLOOD_READ_BOUND, `the server read ${closed.bytesRead} bytes of the 1 MB header flood (bound ${FLOOD_READ_BOUND})`);
  const upload = net.open(`POST /v1/commands/pool.resize HTTP/1.1\r\n${host}\r\nAuthorization: Bearer ${tokens.operator}\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n`, { read: true });
  const cut = new Promise((resolve) => upload.once('close', resolve));
  for (let index = 0; index < 400; index += 1) upload.write('1\r\nx\r\n'.repeat(500));
  await within(cut, 'the endless chunked upload is cut off', 45000);
  const state = await (await fetch(`${origin}/v1/state`, { signal: AbortSignal.timeout(45000) })).json();
  assert.deepEqual([state.revision, state.state.pool.size], [0, 2], 'neither attack changed the state');
  await assertServiceable(context, 2);
  await assertShutdown(context);
}));

test('the settled reading still fails for memory the server really retains', () => withChild(async ({ server }) => {
  await server.ask('retain', 'retained');
  const sample = await settledHeap(server, { windowMs: 1500 });
  assert.ok(sample.heapUsed >= HEAP_LIMIT, `retained memory must stay visible: ${sample.heapUsed} against the limit ${HEAP_LIMIT}`);
}));
