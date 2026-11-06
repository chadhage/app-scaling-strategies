'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { startChild, clients, within } = require('./resource-harness.cjs');

// The server runs in a child capped at 48 MB with a forced GC before each reading: its baseline is about 5 MB, so a retained
// heap above 24 MB means a client made the server keep memory. The child is killed by PID if a hard timer fires.
// COST (review F9c, L-0204): the file has to fit the 60 s of the runner at ten times the quiet cost, and on a loaded machine every step
// that waits for the child (a message, a poll, a request) is what costs. ONE child therefore serves ALL attacks (the header flood first, then
// the upload, the floods and the silent clients at once, whose facts are asserted concurrently), and then ONE settled reading says that the
// retained heap is small, that the state is unchanged and that a normal client and an authorized command are served; the CLI shutdown at
// the very end ends the child with the attackers still connected. (Four children, four baselines and four shutdowns cost 10 s quiet.)
const HEAP_LIMIT = 24 * 1024 * 1024;
const FLOODS = 8;
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

test('one small server process survives every attack, serves normal clients after them, keeps no memory, and shuts down with the attackers connected', { concurrency: 2, timeout: 55000 }, async (t) => {
  const server = startChild({ heapMb: 48, hardMs: 65000 });
  let net = null;
  try {
    const { port, tokens } = await server.receive('listening', 40000);
    const context = { server, port, tokens, origin: `http://127.0.0.1:${port}` };
    const host = `Host: 127.0.0.1:${port}`;
    net = clients(port);
    const readState = async () => (await fetch(`${context.origin}/v1/state`, { signal: AbortSignal.timeout(40000) })).json();
    const unchanged = await readState();
    // The server child lists its connections in the order it accepted them. The attackers that are checked one by one are opened in turn,
    // each after the previous one is connected (the header flood first, then the upload, then the floods), so that their places in that
    // list are known; an attacker that a loaded machine failed to connect is tried again, and every attacker that really connected is
    // counted: the server must have accepted the connections it already had plus those.
    const { sockets: before } = await server.ask('stats', 'stats', 30000);
    let connected = 0;
    const attempt = (socket) => new Promise((resolve) => {
      socket.once('connect', () => { connected += 1; resolve(true); });
      socket.once('error', () => resolve(false));
    });
    // The listeners of an attacker that reads are attached in the tick that creates it: the server may cut it before the next await returns.
    const connectWith = async (bytes, options, attach) => {
      for (let tries = 1; ; tries += 1) {
        const socket = net.open(bytes, options);
        const hooks = attach ? attach(socket) : null;
        if (await attempt(socket)) return { socket, hooks };
        socket.destroy();
        assert.ok(tries < 4, 'an attacker could not connect to the loopback server in 3 tries');
      }
    };
    const header = await connectWith(`GET /v1/state HTTP/1.1\r\n${host}\r\n${'X-Pad: 1\r\n'.repeat(100000)}\r\n`, { read: true }, (socket) => new Promise((resolve) => {
      let text = '';
      socket.on('data', (chunk) => { text += chunk; });
      socket.once('close', () => resolve(text));
    }));
    await t.test('a header flood is closed by the server after one read of at most 16 KB, not after the 1 MB offered', async () => {
      const text = await within(header.hooks, 'the header flood is closed by the server', 40000);
      // The 431 of the header limit, the 408 of the request timeout (a starved server can time the slow header out first), or nothing
      // (Windows resets a connection that still has unread data and the reset can discard the answer): any other answer is a defect.
      assert.ok(text === '' || /^HTTP\/1\.1 (?:431|408) /.test(text), `the client saw the 431 or the 408 or nothing, not ${JSON.stringify(text.slice(0, 60))}`);
      const [closed] = await closedByServer(server, before.length);
      assert.equal(closed && closed.closed, true, 'the server closed the flooding connection');
      assert.ok(closed.bytesRead <= FLOOD_READ_BOUND, `the server read ${closed.bytesRead} bytes of the 1 MB header flood (bound ${FLOOD_READ_BOUND})`);
    });

    const upload = await connectWith(`POST /v1/commands/pool.resize HTTP/1.1\r\n${host}\r\nAuthorization: Bearer ${tokens.operator}\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n`, { read: true }, (socket) => new Promise((resolve) => socket.once('close', resolve)));
    // 3000 pipelined requests a socket, 8 sockets: ~24,000 request and response objects (about 25 MB) for a server that queued them, against a 48 MB heap.
    const flood = Buffer.from(`GET /v1/state HTTP/1.1\r\n${host}\r\n\r\n`.repeat(3000));
    for (let index = 0; index < FLOODS; index += 1) await connectWith(flood);
    for (let index = 0; index < 400; index += 1) upload.socket.write('1\r\nx\r\n'.repeat(500));
    // The last attack stays connected until the shutdown below: the silent, partial and half-open clients are still there.
    const crowd = [];
    for (let index = 0; index < 15; index += 1) crowd.push(attempt(net.open()));
    for (let index = 0; index < 5; index += 1) crowd.push(attempt(net.open('GET /v1/sta')));
    for (let index = 0; index < 5; index += 1) crowd.push(attempt(net.open(`GET /v1/state HTTP/1.1\r\n${host}\r\nX-Partial: a`)));
    for (let index = 0; index < 3; index += 1) crowd.push(attempt(net.open(`POST /v1/commands/pool.resize HTTP/1.1\r\n${host}\r\nContent-Type: application/json\r\nContent-Length: 4096\r\n\r\n{"size"`)));
    for (let index = 0; index < 2; index += 1) crowd.push(attempt(net.open(`GET /v1/state HTTP/1.1\r\n${host}\r\n\r\n`).end()));

    await Promise.all([
      t.test('pipelined floods that are never read are cut off by the server and cannot exhaust it', async () => {
        const range = await closedByServer(server, before.length + 2, FLOODS);
        assert.equal(range.length, FLOODS);
        assert.ok(range.every((entry) => entry.closed), 'the server closed every flooding connection');
      }),
      t.test('an endless chunked upload at a refused command is cut off', () => within(upload.hooks, 'the endless chunked upload is cut off', 40000))
    ]);
    await t.test('after every attack the state is unchanged, a normal client and an authorized command are served, and the retained heap is small', async () => {
      await Promise.all(crowd);
      const state = await readState();
      assert.deepEqual([state.revision, state.state.pool.size], [unchanged.revision, unchanged.state.pool.size], 'no attack changed the state');
      await assertServiceable(context, before.length + connected);
    });
    await t.test('the settled reading still fails for memory the server really retains', async () => {
      await server.ask('retain', 'retained');
      const sample = await settledHeap(server, { windowMs: 400 });
      assert.ok(sample.heapUsed >= HEAP_LIMIT, `retained memory must stay visible: ${sample.heapUsed} against the limit ${HEAP_LIMIT}`);
    });
    await t.test('the CLI shutdown ends every socket and the process by itself, with the attackers still connected', () => assertShutdown(context));
  } finally {
    if (net) net.destroyAll();
    server.stop();
  }
});
