'use strict';

// Resource bounds, proved against the REAL service: in a child process with a small heap and a hard external watchdog (a hang
// or an out-of-memory death becomes a failed test), with the ATTACKER in a separate process, polling to quiescence (no fixed sleeps).
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const { MB, call, connect, get, settleTurn, startChild, until } = require('./net.cjs');

// Timers that would end an upload or an idle connection anyway are set to ten minutes, so only the rule under test can close it.
const QUIET = Object.freeze({ requestMs: 600000, headersMs: 600000, keepAliveMs: 600000, idleMs: 600000, firstRequestMs: 600000 });
const hardTimeout = (ms, label) => new Promise((resolve, reject) => { setTimeout(() => reject(new Error(`hard timeout: ${label}`)), ms).unref(); });
const bounded = (stats, baseline) => {
  assert.equal(stats.heapUsed < 32 * MB, true, `heap ${(stats.heapUsed / MB).toFixed(1)} MB`);
  assert.equal(stats.rss - baseline.rss < 96 * MB, true, `rss grew ${((stats.rss - baseline.rss) / MB).toFixed(1)} MB`);
};

function attack(port, connections, limitMs) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  const child = spawn(process.execPath, [path.join(__dirname, 'attacker.cjs'), String(port), String(connections), String(limitMs)], { env, windowsHide: true });
  const chunks = [];
  child.stdout.on('data', (chunk) => chunks.push(chunk));
  const watchdog = setTimeout(() => child.kill(), limitMs + 15000);
  return new Promise((resolve, reject) => child.once('close', (code) => {
    clearTimeout(watchdog);
    try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error(`the attacker printed no report (exit ${code})`)); }
  }));
}

test('a refusal flood from ANOTHER process (60 sockets, every refusal status, endless chunked bodies) is cut off and cannot starve a concurrent GET', { timeout: 150000 }, async () => {
  const child = await startChild({ bounds: QUIET });
  const probe = async (count) => {
    const latencies = [];
    for (let index = 0; index < count; index += 1) {
      const started = process.hrtime.bigint();
      assert.equal((await call(child.port, 'GET', '/scope.json')).status, 200);
      latencies.push(Number(process.hrtime.bigint() - started) / 1e6);
    }
    return latencies;
  };
  try {
    await probe(5);
    await child.stats(true);
    const quiet = await probe(30);
    const quietStats = await child.stats(true);
    assert.ok(quietStats.lagMaxMs < 1000 && Math.max(...quiet) < 1000, 'the child is responsive before the attack');
    const baseline = quietStats;
    let flooding = true;
    const latencies = [];
    const prober = (async () => {
      while (flooding) {
        latencies.push(...await probe(1));
        await settleTurn();
      }
    })();
    const report = await attack(child.port, 60, 30000);
    flooding = false;
    await prober;
    assert.equal(report.timedOut, false, 'the attacker sockets were not all closed by the server');
    assert.equal(report.closed, 60);
    assert.ok(report.answered >= 1, 'at least some attackers saw a typed answer (a reset may discard the rest; the typed answers are proved without a race in server.test.cjs)');
    await until(async () => (await child.stats()).connections === 0, 'the server holds no attacker connection');
    const stats = await child.stats();
    // Every refused socket costs the child about 50 ms once (its first burst is parsed before the answer is flushed and the socket destroyed): the
    // stall is bounded by 150 ms per attacker socket and stops growing as soon as the sockets are closed. Without the destroy the sockets are never
    // closed (report.timedOut) and the stall grows for as long as the attacker keeps sending.
    const lagBound = 500 + 150 * report.connections;
    const latencyBound = lagBound + 2000;
    assert.ok(stats.lagMaxMs < lagBound, `event-loop lag ${stats.lagMaxMs.toFixed(0)} ms against ${lagBound.toFixed(0)} ms (quiet ${quietStats.lagMaxMs.toFixed(0)} ms)`);
    assert.ok(Math.max(...latencies) < latencyBound, `a concurrent GET took ${Math.max(...latencies).toFixed(0)} ms against ${latencyBound.toFixed(0)} ms`);
    assert.ok(latencies.length >= 3, 'the prober ran during the flood');
    bounded(stats, baseline);
  } finally {
    child.dispose();
  }
});

test('a client that pipelines requests and never reads is cut off after a bounded queue', { timeout: 60000 }, async () => {
  const child = await startChild();
  const flood = connect(child.port, { read: false });
  try {
    const baseline = await child.stats();
    flood.socket.write(get(child.port, '/scope.json').repeat(3000));
    await until(async () => (await child.stats()).connections === 0, 'the server dropped the flooding connection');
    bounded(await child.stats(), baseline);
    assert.equal((await call(child.port, 'GET', '/v1/leases')).status, 200);
  } finally {
    flood.socket.destroy();
    child.dispose();
  }
});

test('a chunked body of tiny chunks is refused at the limit, answered, closed and costs no memory', { timeout: 60000 }, async () => {
  const child = await startChild({ bounds: QUIET });
  const client = connect(child.port);
  try {
    const baseline = await child.stats();
    client.socket.write(`POST /v1/steps HTTP/1.1\r\nHost: 127.0.0.1:${child.port}\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n${'1\r\nx\r\n'.repeat(2300)}`);
    await until(() => /^HTTP\/1\.1 413 /.test(client.received()), 'the 413 arrives');
    assert.match(client.received(), /BODY_TOO_LARGE/);
    assert.match(client.received(), /connection: close/i);
    await Promise.race([client.closed, hardTimeout(30000, 'the refused upload was kept open')]);
    bounded(await child.stats(), baseline);
    assert.equal((await call(child.port, 'GET', '/v1/leases')).status, 200);
  } finally {
    client.socket.destroy();
    child.dispose();
  }
});

test('the connection cap holds, silent sockets are closed after the first-request limit, and the service recovers', { timeout: 60000 }, async () => {
  const child = await startChild({ bounds: { ...QUIET, connections: 8, firstRequestMs: 400 } });
  const idlers = [];
  try {
    for (let index = 0; index < 30; index += 1) idlers.push(connect(child.port));
    await until(async () => (await child.stats()).connections > 0, 'some connections are accepted');
    assert.ok((await child.stats()).connections <= 8, 'never more than the cap');
    await until(async () => (await child.stats()).connections === 0, 'the silent sockets are closed');
    assert.equal((await call(child.port, 'GET', '/v1/leases')).status, 200);
  } finally {
    for (const idler of idlers) idler.socket.destroy();
    child.dispose();
  }
});

test('shutdown never waits for a half-open peer or an unread response', { timeout: 60000 }, async () => {
  const child = await startChild({ bounds: QUIET });
  const half = connect(child.port, { allowHalfOpen: true });
  const unread = connect(child.port, { read: false });
  try {
    half.socket.write(`GET /scope.json HTTP/1.1\r\nHost: 127.0.0.1:${child.port}\r\n\r\nGET /sc`);
    unread.socket.write(get(child.port, '/scope.json').repeat(3));
    await until(async () => (await child.stats()).connections >= 2, 'both clients are connected');
    const stopped = await Promise.race([child.stop(), hardTimeout(20000, 'closeServer waited for a peer')]);
    assert.equal(stopped.type, 'closed');
    const exit = await Promise.race([child.exited, hardTimeout(20000, 'the child did not exit')]);
    assert.equal(exit.code, 0);
  } finally {
    half.socket.destroy();
    unread.socket.destroy();
    child.dispose();
  }
});

test('a client that trickles one byte at a time is cut off within the configured bound (connectionsCheckingInterval is set)', { timeout: 60000 }, async () => {
  const child = await startChild({ bounds: { ...QUIET, headersMs: 600, requestMs: 600, checkMs: 100, firstRequestMs: 600000 } });
  const trickle = connect(child.port);
  const started = process.hrtime.bigint();
  try {
    const line = 'GET /scope.json HTTP/1.1\r\nHost: 127.0.0.1:1\r\nX-Slow: ';
    const ticker = setInterval(() => { if (!trickle.socket.destroyed) trickle.socket.write(line.slice(0, 1)); }, 150);
    await Promise.race([trickle.closed, hardTimeout(20000, 'the trickling client was kept')]);
    clearInterval(ticker);
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;
    assert.ok(seconds < 5, `the trickling client was cut off after ${seconds.toFixed(1)} s`);
    assert.equal((await call(child.port, 'GET', '/v1/leases')).status, 200);
  } finally {
    trickle.socket.destroy();
    child.dispose();
  }
});

test('oversized or numerous headers are refused by the parser and the service stays healthy', { timeout: 60000 }, async () => {
  const child = await startChild({ bounds: QUIET });
  try {
    const baseline = await child.stats();
    const big = connect(child.port);
    big.socket.write(`GET /scope.json HTTP/1.1\r\nHost: 127.0.0.1:${child.port}\r\nX-Big: ${'a'.repeat(20000)}\r\n\r\n`);
    await Promise.race([big.closed, hardTimeout(20000, 'the oversized header was kept')]);
    const many = connect(child.port);
    many.socket.write(`GET /scope.json HTTP/1.1\r\nHost: 127.0.0.1:${child.port}\r\n${Array.from({ length: 200 }, (_, index) => `X-${index}: 1`).join('\r\n')}\r\n\r\n`);
    await Promise.race([many.closed, hardTimeout(20000, 'the many headers were kept')]);
    bounded(await child.stats(), baseline);
    assert.equal((await call(child.port, 'GET', '/v1/leases')).status, 200);
  } finally {
    child.dispose();
  }
});
