'use strict';

// C010 scenario "Every refusal closes the connection and nothing behind it runs", the PENDING-FIRST-REQUEST shape (rev-C017 F24): a request that is
// still pending (here: a mutation held in the commit hook of a CHILD server with a 48 MB heap) while 64 KB blocks of `GET /x HTTP/1.1` are pipelined
// behind it on three sockets, up to 50 000 requests. A handler that returns for a later request without answering and without pausing or destroying the
// socket lets the parser queue a request and a response object (about 1.8 KB each) per request with no backpressure; C010 uses the C009 lane, which
// destroys the socket at the first request beyond its depth. Counted facts only (requests sent, sockets closed, connections left, heap, an answered GET,
// the state unchanged after the held requests were released): no time bound decides the result.
const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const { startChildTarget } = require('./targets.cjs');
const { call } = require('./helpers.cjs');

const SOCKETS = 3;
const REQUESTS = 50000;
const MB = 1024 * 1024;

function pipeline(port, token, perSocket) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const one = `GET /x HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`;
    const block = Buffer.from(one.repeat(Math.floor(65536 / one.length)));
    const perBlock = block.length / one.length;
    const report = { requests: 0, closed: false };
    const body = JSON.stringify({ name: 'held', ttlMs: 60000 });
    let ended = false;
    const end = () => { if (!ended) { ended = true; resolve(report); } };
    socket.on('error', () => {});
    socket.once('close', () => { report.closed = true; end(); });
    const pump = () => {
      while (!socket.destroyed && report.requests < perSocket) {
        report.requests += perBlock;
        if (!socket.write(block)) { socket.once('drain', pump); return; }
      }
      // Everything is written: a server that does not end the connection leaves the socket open, counted after a bounded wait for the close.
      if (!socket.destroyed) setTimeout(() => { socket.destroy(); end(); }, 5000).unref();
    };
    socket.write(`POST /v1/leases HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nAuthorization: Bearer ${token}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    pump();
  });
}

async function until(check, label) {
  for (let turn = 0; turn < 4000; turn += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`never held: ${label}`);
}

test(`a PENDING first request with 64 KB blocks of GET /x pipelined behind it on ${SOCKETS} sockets (up to ${REQUESTS} requests) in a 48 MB-heap child: alive, bounded, every socket closed, a legitimate GET answered`, { timeout: 170000 }, async () => {
  const child = await startChildTarget('default', { mode: 'hold', heapMb: 48, watchdogMs: 160000 });
  let alive = true;
  child.exited.then(() => { alive = false; });
  try {
    const a = child.tokens['conductor-a'];
    const before = (await call(child, a, 'GET', '/v1/leases')).json;
    const reports = await Promise.all(Array.from({ length: SOCKETS }, () => pipeline(child.port, a, Math.ceil(REQUESTS / SOCKETS))));
    assert.ok(alive, `the child is still alive: ${child.errors().slice(0, 300)}`);
    await until(async () => (await child.stats()).connections === 0, 'no connection remains');
    const stats = await child.stats();
    assert.equal(reports.filter((report) => report.closed).length, SOCKETS, `every attacker socket was closed by the server (requests sent per socket: ${reports.map((report) => report.requests)})`);
    assert.ok(reports.every((report) => report.requests > 0));
    assert.equal(stats.connections, 0);
    assert.ok(stats.heapUsed < 32 * MB, `the heap stays bounded: ${Math.round(stats.heapUsed / MB)} MB`);
    assert.equal((await call(child, child.tokens['conductor-b'], 'GET', '/v1/me')).status, 200, 'a legitimate GET is answered afterwards');
    await child.release();
    // The commit queue is FIFO: once this mutation answers, every held request of the flood has passed the commit decision.
    assert.equal((await call(child, child.tokens['conductor-b'], 'POST', '/v1/leases', { name: 'after', ttlMs: 60000 })).status, 200);
    // Decision (recorded, not hidden): a mutation that was already RUNNING when the lane cut its connection still commits and its answer is lost
    // (only requests that were queued behind it or came later are dropped); at most one lease per attacker socket can exist, and only conductor-a sees them.
    const after = (await call(child, a, 'GET', '/v1/leases')).json;
    assert.ok(after.items.length <= SOCKETS, `at most one held mutation per socket committed: ${after.items.length}`);
    assert.deepEqual(before.items, []);
    assert.ok(alive);
    console.log(`# pending-first flood: requests sent per socket ${reports.map((report) => report.requests)}, heapUsed ${Math.round(stats.heapUsed / MB)} MB, connections ${stats.connections}, held mutations that committed ${after.items.length}`);
  } finally {
    await child.close();
  }
});
