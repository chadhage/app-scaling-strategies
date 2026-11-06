'use strict';

// Resource bounds, proved against the REAL service: in a child process with a small heap and a hard external watchdog (a hang
// or an out-of-memory death becomes a failed test), polling to quiescence (no fixed sleeps). The refusal flood with the attacker in a
// separate process is judged by structure and by controls in flood.test.cjs.
const assert = require('node:assert/strict');
const test = require('node:test');
const { MB, call, connect, get, startChild, startService, until } = require('./net.cjs');

// Timers that would end an upload or an idle connection anyway are set to ten minutes, so only the rule under test can close it.
const QUIET = Object.freeze({ requestMs: 600000, headersMs: 600000, keepAliveMs: 600000, idleMs: 600000, firstRequestMs: 600000 });
const hardTimeout = (ms, label) => new Promise((resolve, reject) => { setTimeout(() => reject(new Error(`hard timeout: ${label}`)), ms).unref(); });
const bounded = (stats, baseline) => {
  assert.equal(stats.heapUsed < 32 * MB, true, `heap ${(stats.heapUsed / MB).toFixed(1)} MB`);
  assert.equal(stats.rss - baseline.rss < 96 * MB, true, `rss grew ${((stats.rss - baseline.rss) / MB).toFixed(1)} MB`);
};

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

test('the first-request timer ends only a socket that never sends: a connection that made a request survives it', { timeout: 60000 }, async () => {
  const child = await startChild({ bounds: { ...QUIET, firstRequestMs: 200 } });
  const client = connect(child.port);
  try {
    client.socket.write(get(child.port, '/scope.json'));
    await until(() => /^HTTP\/1\.1 200 /.test(client.received()), 'the first answer arrives');
    // A MINIMUM wait of three times the timer; nothing is asserted about how long anything takes.
    await new Promise((resolve) => setTimeout(resolve, 600));
    client.socket.write(get(child.port, '/v1/leases', 'Connection: close\r\n'));
    await Promise.race([client.closed, hardTimeout(20000, 'the second request was not answered')]);
    assert.equal(client.received().match(/HTTP\/1\.1 200 /g)?.length, 2, 'both requests were answered on the one connection');
  } finally {
    client.socket.destroy();
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

test('the parser timeouts are enforced every second: connectionsCheckingInterval is set (Node checks headersTimeout and requestTimeout only at that interval, 30 s by default)', { timeout: 60000 }, async () => {
  const service = await startService();
  try {
    assert.equal(service.server.connectionsCheckingInterval, 1000);
    assert.equal(service.server.headersTimeout, 5000);
    assert.equal(service.server.requestTimeout, 5000);
  } finally {
    await service.stop();
  }
});

test('a client that trickles one byte at a time is cut off by the configured timers', { timeout: 60000 }, async () => {
  const child = await startChild({ bounds: { ...QUIET, headersMs: 600, requestMs: 600, checkMs: 100, firstRequestMs: 600000 } });
  const trickle = connect(child.port);
  const line = 'GET /scope.json HTTP/1.1\r\nHost: 127.0.0.1:1\r\nX-Slow: ';
  const ticker = setInterval(() => { if (!trickle.socket.destroyed) trickle.socket.write(line.slice(0, 1)); }, 150);
  try {
    // The only bound here is the hard timeout that turns a stuck condition into a failed test; how fast the cut-off came is not asserted (shared machine).
    await Promise.race([trickle.closed, hardTimeout(20000, 'the trickling client was kept')]);
    assert.equal((await call(child.port, 'GET', '/v1/leases')).status, 200);
  } finally {
    clearInterval(ticker);
    trickle.socket.destroy();
    child.dispose();
  }
});

test('a request that is too slow gets the typed 408 on the one refusal path, and the connection is closed', { timeout: 60000 }, async () => {
  const child = await startChild({ bounds: { ...QUIET, headersMs: 400, requestMs: 400, checkMs: 100, firstRequestMs: 600000 } });
  const slow = connect(child.port);
  try {
    slow.socket.write(`GET /scope.json HTTP/1.1\r\nHost: 127.0.0.1:${child.port}\r\n`);
    await Promise.race([slow.closed, hardTimeout(20000, 'the slow request was kept')]);
    assert.match(slow.received(), /^HTTP\/1\.1 408 /);
    assert.match(slow.received(), /REQUEST_TIMEOUT/);
    assert.match(slow.received(), /connection: close/i);
  } finally {
    slow.socket.destroy();
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
