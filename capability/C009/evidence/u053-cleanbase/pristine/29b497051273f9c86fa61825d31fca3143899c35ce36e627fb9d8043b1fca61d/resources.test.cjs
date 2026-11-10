'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { startChild, clients, within } = require('./resource-harness.cjs');

// The server runs in a child capped at 48 MB with a forced GC before each reading: its baseline is about 5 MB, so a retained
// heap above 24 MB means a client made the server keep memory. The child is killed by PID if a hard timer fires.
// COST (review F9c, L-0204): the file has to fit the 60 s of the runner at several times the quiet cost, and on a loaded machine every
// sequential step (a message to the child, a poll, a request) is what costs. ONE child therefore serves ALL attacks AT ONCE (the facts of
// each attack are asserted concurrently: the server closed this connection, the upload was cut off), and then ONE settled reading says that
// the retained heap is small, that the state is unchanged and that a normal client and an authorized command are served; the CLI shutdown at
// the very end ends the child with the attackers still connected. (Four children, four baselines and four shutdowns cost 10 s quiet.)
const HEAP_LIMIT = 24 * 1024 * 1024;
const FLOODS = 16;
const SILENT = 220;
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
    await sleep(100);
  }
}

// After the attacks a normal client and a normal authorized command must still be served, and the settled retained heap must be small.
async function assertServiceable({ server, origin, tokens }, accepted) {
  const sample = await settledHeap(server, { accepted });
  assert.ok(sample.accepted >= accepted, `the attacks reached the server: ${sample.accepted} of ${accepted} connections accepted`);
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

// The header flood is refused by Node's own clientError path, which writes the 431 and destroys the socket while the flood is still
// arriving. On Windows the reset that follows can discard the 431 before the client has read it (L-0179: an EMPTY answer in about 1 run
// in 16 at 8 in parallel), so the client's view is "the 431 or nothing"; what must hold is structural and is read from the SERVER child:
// it closed that connection and read far less than the 1 MB that was offered (the header limit is 16 KB).
const FLOOD_READ_BOUND = 256 * 1024;

// Waits for the server's own account of connections [first, first + count): every one closed (one poll for the whole range).
async function closedByServer(server, first, count = 1, windowMs = 30000) {
  const deadline = Date.now() + windowMs;
  for (;;) {
    const { sockets } = await server.ask('stats', 'stats', 30000);
    const range = sockets.slice(first, first + count);
    if ((range.length === count && range.every((entry) => entry.closed)) || Date.now() > deadline) return range;
    await sleep(100);
  }
}

test('one small server process survives every attack at once, serves normal clients after them, keeps no memory, and shuts down with the attackers connected', { concurrency: 3, timeout: 55000 }, async (t) => {
  const server = startChild({ heapMb: 48, hardMs: 65000 });
  let net = null;
  try {
    const { port, tokens } = await server.receive('listening', 40000);
    const context = { server, port, tokens, origin: `http://127.0.0.1:${port}` };
    const host = `Host: 127.0.0.1:${port}`;
    net = clients(port);
    const readState = async () => (await fetch(`${context.origin}/v1/state`, { signal: AbortSignal.timeout(40000) })).json();
    const unchanged = await readState();
    // The server child lists its connections in the order it accepted them: the attackers that are checked one by one are opened in turn,
    // each after the previous one is connected, so that their places in that list are known (the connection of the fetch above is first).
    const { sockets: before } = await server.ask('stats', 'stats', 30000);
    const open = (bytes, options) => new Promise((resolve) => {
      const socket = net.open(bytes, options);
      socket.once('connect', () => resolve(socket));
    });
    // 6000 pipelined requests a socket, 16 sockets: ~96,000 request and response objects (about 100 MB) for a server that queued them, against a 48 MB heap.
    const flood = Buffer.from(`GET /v1/state HTTP/1.1\r\n${host}\r\n\r\n`.repeat(6000));
    for (let index = 0; index < FLOODS; index += 1) await open(flood);
    // The listeners of the header flood are attached in the tick that creates it: the server may cut it before the next await returns.
    const headers = net.open(`GET /v1/state HTTP/1.1\r\n${host}\r\n${'X-Pad: 1\r\n'.repeat(100000)}\r\n`, { read: true });
    const answer = new Promise((resolve) => {
      let text = '';
      headers.on('data', (chunk) => { text += chunk; });
      headers.once('close', () => resolve(text));
    });
    await new Promise((resolve) => headers.once('connect', resolve));
    const upload = await open(`POST /v1/commands/pool.resize HTTP/1.1\r\n${host}\r\nAuthorization: Bearer ${tokens.operator}\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n`, { read: true });
    const cut = new Promise((resolve) => upload.once('close', resolve));
    for (let index = 0; index < 400; index += 1) upload.write('1\r\nx\r\n'.repeat(500));
    // The last attack stays connected until the shutdown below: the silent, partial and half-open clients are still there.
    for (let index = 0; index < 100; index += 1) net.open();
    for (let index = 0; index < 40; index += 1) net.open('GET /v1/sta');
    for (let index = 0; index < 40; index += 1) net.open(`GET /v1/state HTTP/1.1\r\n${host}\r\nX-Partial: a`);
    for (let index = 0; index < 20; index += 1) net.open(`POST /v1/commands/pool.resize HTTP/1.1\r\n${host}\r\nContent-Type: application/json\r\nContent-Length: 4096\r\n\r\n{"size"`);
    for (let index = 0; index < 20; index += 1) net.open(`GET /v1/state HTTP/1.1\r\n${host}\r\n\r\n`).end();

    await Promise.all([
      t.test('pipelined floods that are never read are cut off by the server and cannot exhaust it', async () => {
        const range = await closedByServer(server, before.length, FLOODS);
        assert.equal(range.length, FLOODS);
        assert.ok(range.every((entry) => entry.closed), 'the server closed every flooding connection');
      }),
      t.test('a header flood is closed by the server after one read of at most 16 KB, not after the 1 MB offered', async () => {
        const text = await within(answer, 'the header flood is closed by the server', 40000);
        assert.ok(text === '' || /^HTTP\/1\.1 431 /.test(text), `the client saw the 431 or nothing, not ${JSON.stringify(text.slice(0, 60))}`);
        const [closed] = await closedByServer(server, before.length + FLOODS);
        assert.equal(closed && closed.closed, true, 'the server closed the flooding connection');
        assert.ok(closed.bytesRead <= FLOOD_READ_BOUND, `the server read ${closed.bytesRead} bytes of the 1 MB header flood (bound ${FLOOD_READ_BOUND})`);
      }),
      t.test('an endless chunked upload at a refused command is cut off', () => within(cut, 'the endless chunked upload is cut off', 40000))
    ]);
    await t.test('after every attack the state is unchanged, a normal client and an authorized command are served, and the retained heap is small', async () => {
      const state = await readState();
      assert.deepEqual([state.revision, state.state.pool.size], [unchanged.revision, unchanged.state.pool.size], 'no attack changed the state');
      await assertServiceable(context, before.length + FLOODS + 2 + SILENT);
    });
    await t.test('the settled reading still fails for memory the server really retains', async () => {
      await server.ask('retain', 'retained');
      const sample = await settledHeap(server, { windowMs: 800 });
      assert.ok(sample.heapUsed >= HEAP_LIMIT, `retained memory must stay visible: ${sample.heapUsed} against the limit ${HEAP_LIMIT}`);
    });
    await t.test('the CLI shutdown ends every socket and the process by itself, with the attackers still connected', () => assertShutdown(context));
  } finally {
    if (net) net.destroyAll();
    server.stop();
  }
});
