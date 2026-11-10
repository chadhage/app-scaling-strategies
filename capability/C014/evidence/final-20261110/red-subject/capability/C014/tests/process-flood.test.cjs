'use strict';

// The cross-process refusal flood and the third pipelining hole, with a naive control in the same test under the same load. One server child (small heap,
// 128-connection cap), one naive control child and ONE attacker process per phase are shared by the file, so that the whole file fits the 60 s cap of the runner
// under a 4x slowdown. Every assertion is a count or a ratio (sockets the server ended, bytes it read, its CPU against the control's); nothing is a wall-clock bound.
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { startChild, runAttacker } = require('./child.cjs');
const { seedConfig } = require('./canaries.cjs');
const { call } = require('./harness.cjs');

const config = seedConfig();
let real;
let naive;

test.before(async () => {
  [real, naive] = await Promise.all([startChild({ mode: 'real', limits: { connections: 128 } }), startChild({ mode: 'naive' })]);
});
test.after(async () => { await Promise.all([real && real.close(), naive && naive.close()]); });

// A legitimate client that keeps its connection while the server lets it. The server reaps an idle keep-alive connection after one second (keepAliveTimeout) and a
// starved test process can stay silent for longer, so a request that finds its connection ended by the server is asked again on a new one (a GET is idempotent):
// what is asserted is that EVERY request is answered, never that one socket lives. A request whose connection ends before the answer resolves null, so nothing waits forever.
function legitimate(port) {
  const state = { socket: null, seen: Buffer.alloc(0), waiting: null, opened: 0, retried: 0 };
  const settle = (answer) => { if (state.waiting) { const resolve = state.waiting; state.waiting = null; resolve(answer); } };
  const open = () => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    state.socket = socket;
    state.seen = Buffer.alloc(0);
    state.opened += 1;
    socket.on('data', (chunk) => {
      state.seen = Buffer.concat([state.seen, chunk]);
      const end = state.seen.indexOf('\r\n\r\n');
      if (end >= 0 && state.seen.length >= end + 4 + Number(/content-length: (\d+)/i.exec(state.seen.subarray(0, end).toString())[1])) { const text = state.seen.toString('latin1'); state.seen = Buffer.alloc(0); settle(text); }
    });
    socket.on('error', () => {});
    socket.on('close', () => { if (state.socket === socket) state.socket = null; settle(null); });
  };
  const once = () => new Promise((resolve) => {
    if (!state.socket) open();
    state.waiting = resolve;
    state.socket.write(`GET /scope.json HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`);
  });
  return {
    state,
    // the status line of the answer, or null when two connections in a row ended before they answered
    async get() {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const text = await once();
        if (text !== null) return text.slice(0, 12);
        state.retried += 1;
      }
      return null;
    },
    close: () => { if (state.socket) state.socket.destroy(); }
  };
}

// Polls the child until it holds at most `limit` connections (no fixed sleep): the count is a fact, the deadline only keeps a broken server from hanging the test.
async function quiescent(child, limit, deadline = 45000) {
  const stop = Date.now() + deadline;
  for (;;) {
    const stats = await child.stats();
    if (stats.connections <= limit || Date.now() > stop) return stats;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

// Polls a fact until it holds; the deadline only keeps a broken control from hanging the test.
async function waitFor(fact, label, deadline = 50000) {
  const stop = Date.now() + deadline;
  while (!(await fact())) {
    assert.ok(Date.now() <= stop, `never held: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

test('flood of refused requests with endless one-byte chunks, attacker in another process: the server ends every socket, reads little, spends little CPU, and still serves; the naive control does none of that', { timeout: 90000 }, async () => {
  const legit = legitimate(real.port);
  try {
    assert.equal(await legit.get(), 'HTTP/1.1 200');
    const before = { real: await real.stats(), naive: await naive.stats() };
    const attacked = runAttacker([
      { key: 'real', port: real.port, sockets: 12, shape: 'chunked', bytes: 200000, token: config.tokens.visitor, waitMs: 30000, maxMs: 60000 },
      { key: 'naive', port: naive.port, sockets: 4, shape: 'chunked', bytes: 200000, token: config.tokens.visitor, waitMs: 800, maxMs: 80000, hold: true }
    ], {
      // the control is not judged before it has consumed what it was sent: its total read count is a fact to wait for, never a fixed wait
      beforeRelease: () => waitFor(async () => (await naive.stats()).readTotal >= 4 * 200000, 'the control has read every body'),
    });
    // a legitimate client keeps asking while the flood runs (a bounded number of times, so that the CPU it costs the server stays small): every request must be answered with a 200
    let flooding = true;
    const answers = [];
    const asking = (async () => { while (flooding && answers.length < 8) { answers.push(await legit.get()); await new Promise((resolve) => setTimeout(resolve, 50)); } })();
    const sockets = await attacked;
    flooding = false;
    await asking;
    const after = { real: await quiescent(real, 1), naive: await quiescent(naive, 0) };
    assert.equal(after.real.typed403Writes - before.real.typed403Writes, 12, 'G1 exactly twelve typed 403 writes observed on the server after quiescence');
    assert.ok(answers.length >= 1 && answers.every((line) => line === 'HTTP/1.1 200'), `${answers.length} legitimate requests during the flood, all answered 200 (${legit.state.opened} connections, ${legit.state.retried} asked again after the server had ended one)`);
    // The typed 403 is visible on most sockets; on a few the reset that follows the server's close can discard it before the client reads it (L-0179), so a socket may
    // show no status at all, but never another one, and every one of them was ended by the server.
    assert.equal(sockets.real.filter((socket) => socket.serverEnded).length, 12, `the server ended every attacker socket: ${JSON.stringify(sockets.real.map((socket) => [socket.status, socket.serverEnded, socket.written]))}`);
    assert.ok(sockets.real.every((socket) => socket.status === 403 || socket.status === 0) && sockets.real.filter((socket) => socket.status === 403).length >= 6, 'and answered 403 where the answer survived');
    assert.equal(sockets.naive.filter((socket) => socket.serverEnded).length, 0, 'the control never ends a connection (it may not even answer all of them while it parses): this test can fail');
    const realReads = after.real.reads.slice(before.real.reads.length).filter((bytes) => bytes > 0);
    const naiveReads = after.naive.reads.filter((bytes) => bytes > 0);
    assert.ok(realReads.length >= 12 && naiveReads.length >= 4, `${realReads.length} server and ${naiveReads.length} control connections were read`);
    const naiveAverage = naiveReads.reduce((sum, bytes) => sum + bytes, 0) / naiveReads.length;
    assert.ok(naiveAverage >= 200000, `the control consumed every body it was sent (${Math.round(naiveAverage)} bytes per socket on average)`);
    assert.ok(Math.max(...realReads.slice(-12)) * 4 < naiveAverage * 3, `the server stops reading after the refusal (${Math.max(...realReads.slice(-12))} bytes at most against the control's ${Math.round(naiveAverage)} on average)`);
    const perSocket = { real: (after.real.cpuMs - before.real.cpuMs) / 12, naive: (after.naive.cpuMs - before.naive.cpuMs) / 4 };
    assert.ok(perSocket.real * 2 < perSocket.naive, `server CPU ${perSocket.real.toFixed(1)} ms per attacker socket against the control's ${perSocket.naive.toFixed(1)} ms (a ratio under the same load)`);
    assert.ok(after.real.connections <= 1, 'no attacker connection is left');
    assert.equal((await call(real.port, 'GET', '/v1/evidence/runs')).status, 200, 'the server still serves after the flood');
    assert.ok(after.real.heapBytes < 48 * 1024 * 1024, 'the 64 MB child is nowhere near its heap');
  } finally { legit.close(); }
});

test('[GET][GET][Expect: nonsense] on 128 sockets (the third pipelining hole): the answers in order, the typed 417, every socket ended, the 128-connection cap not pinned; the bare control keeps them open', { timeout: 90000 }, async () => {
  const sockets = await runAttacker([
    { key: 'real', port: real.port, sockets: 128, shape: 'gg-expect', waitMs: 15000, maxMs: 40000 }, { key: 'naive', port: naive.port, sockets: 16, shape: 'gg-expect', waitMs: 1500, maxMs: 40000 }
  ]);
  assert.equal(sockets.real.filter((socket) => socket.serverEnded).length, 128, 'every socket was ended by the server');
  assert.equal(sockets.real.filter((socket) => socket.answers === 3 && socket.status === 200).length, 128, 'two answers, then the refusal, on every socket');
  assert.equal(sockets.naive.filter((socket) => socket.serverEnded).length, 0, 'the control keeps them open: this test can fail');
  const stats = await quiescent(real, 0);
  assert.equal(stats.connections, 0, 'no socket is left, so the cap of 128 is free');
  assert.equal((await call(real.port, 'GET', '/scope.json')).status, 200, 'and a legitimate GET is answered');
});
