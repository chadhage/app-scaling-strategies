'use strict';

// Resource bounds, proved against the real service: in a child process with a small heap and a hard external timeout
// (a hang or an out-of-memory death becomes a failed test, never a stall), and in-process for the fast cases.
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const test = require('node:test');
const { call, cleanup, deferred, rawHttp, startService, valid } = require('./support.cjs');

const MB = 1024 * 1024;
const HARD_MS = 120000;
// The timers that would end an upload or an idle connection anyway are set to ten minutes in the child, so that only the
// rule under test can close the connection.
const QUIET = Object.freeze({ requestMs: 600000, headersMs: 600000, keepAliveMs: 600000 });
const hardTimeout = (ms, label) => new Promise((resolve, reject) => { setTimeout(() => reject(new Error(`hard timeout: ${label}`)), ms).unref(); });
const settleTurn = () => new Promise((resolve) => setImmediate(resolve));

async function until(check, label, ms = 60000) {
  const deadline = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > deadline) assert.fail(`never held: ${label}`);
    await settleTurn();
  }
}

async function startChild({ heapMb = 48, settleMs = 0, bounds = {} } = {}) {
  // The child measures its own memory: it must not inherit coverage instrumentation, which adds heap of its own.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  const child = fork(path.join(__dirname, 'child-server.cjs'), [String(settleMs), JSON.stringify(bounds)], { execArgv: [`--max-old-space-size=${heapMb}`], env, silent: true });
  const errors = [];
  child.stderr.on('data', (chunk) => errors.push(chunk));
  const watchdog = setTimeout(() => child.kill(), HARD_MS);
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  const waiting = new Map();
  child.on('message', (message) => { waiting.get(message.type)?.(message); waiting.delete(message.type); });
  const next = (type) => new Promise((resolve) => waiting.set(type, resolve));
  const early = exited.then((result) => { throw new Error(`the child exited early: ${JSON.stringify(result)} ${Buffer.concat(errors)}`); });
  const { port } = await Promise.race([next('listening'), early]);
  return {
    port, exited, errors: () => Buffer.concat(errors).toString('utf8'),
    stats: () => { const reply = next('stats'); child.send({ type: 'stats' }); return reply; },
    stop: () => { const reply = next('closed'); child.send({ type: 'stop' }); return reply; },
    dispose: () => { clearTimeout(watchdog); child.kill(); },
  };
}

function connect(port, { allowHalfOpen = false, read = true } = {}) {
  const socket = net.connect({ host: '127.0.0.1', port, allowHalfOpen });
  const chunks = [];
  socket.on('error', () => {});
  if (read) socket.on('data', (chunk) => chunks.push(chunk)); else socket.pause();
  return { socket, closed: new Promise((resolve) => socket.once('close', resolve)), received: () => Buffer.concat(chunks).toString('latin1') };
}

const get = (port, target, extra = '') => `GET ${target} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n${extra}\r\n`;
const bounded = (stats, baseline) => {
  assert.equal(stats.heapUsed < 32 * MB, true, `heap ${(stats.heapUsed / MB).toFixed(1)} MB`);
  assert.equal(stats.rss - baseline.rss < 64 * MB, true, `rss grew ${((stats.rss - baseline.rss) / MB).toFixed(1)} MB`);
};

test('a client that pipelines requests and never reads is cut off after a bounded queue', async () => {
  const child = await startChild();
  const flood = connect(child.port, { read: false });
  try {
    const baseline = await child.stats();
    flood.socket.write(get(child.port, '/transcript.json').repeat(3000));
    await until(async () => (await child.stats()).connections === 0, 'the server dropped the flooding connection');
    bounded(await child.stats(), baseline);
    assert.equal((await call(child.port, 'GET', '/v1/leases')).status, 200);
  } finally {
    flood.socket.destroy();
    child.dispose();
  }
});

test('a refused request that carries an endless body is closed at once, not after a timeout', async () => {
  const child = await startChild({ bounds: QUIET });
  try {
    const baseline = await child.stats();
    const body = '1\r\nx\r\n'.repeat(9000).repeat(4);
    const refusals = [
      ['GET', '/v1/leases', 'application/json', 400, 'UNEXPECTED_BODY'],
      ['POST', '/v1/steps/key-0001-aaaa/cancel', 'application/json', 400, 'UNEXPECTED_BODY'],
      ['PUT', '/v1/steps', 'application/json', 405, 'METHOD_NOT_ALLOWED'],
      ['POST', '/admin', 'application/json', 404, 'NOT_FOUND'],
      ['POST', '/v1/steps', 'text/plain', 415, 'UNSUPPORTED_MEDIA_TYPE'],
    ];
    for (const [method, target, type, status, code] of refusals) {
      const attacker = connect(child.port);
      attacker.socket.write(`${method} ${target} HTTP/1.1\r\nHost: 127.0.0.1:${child.port}\r\nContent-Type: ${type}\r\nTransfer-Encoding: chunked\r\n\r\n${body}`);
      await Promise.race([attacker.closed, hardTimeout(30000, `${method} ${target} was kept open for an endless body`)]);
      // A reset can discard the answer; the typed answers and Connection: close are proved without a race in server-http.test.cjs.
      if (attacker.received()) assert.match(attacker.received(), new RegExp(`^HTTP/1\\.1 ${status} .*${code}`, 's'), target);
    }
    bounded(await child.stats(), baseline);
    assert.equal((await call(child.port, 'GET', '/v1/leases')).status, 200);
  } finally {
    child.dispose();
  }
});

test('a chunked body of tiny chunks is refused at the limit, answered, closed and costs no memory', async () => {
  const child = await startChild({ bounds: QUIET });
  const client = connect(child.port);
  try {
    const baseline = await child.stats();
    // 2300 payload bytes in 2300 chunks and no terminating chunk: the body never ends, the limit is 2048.
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

test('idle connections are bounded by the connection cap and the service stays responsive', async () => {
  const child = await startChild();
  const all = [];
  try {
    const baseline = await child.stats();
    for (let index = 0; index < 100; index += 1) all.push(connect(child.port));
    await until(async () => (await child.stats()).connections >= 100, 'a hundred idle connections');
    assert.equal((await call(child.port, 'GET', '/v1/leases')).status, 200);
    for (let index = 0; index < 100; index += 1) all.push(connect(child.port));
    await until(() => all.filter((item) => item.socket.destroyed).length >= 60, 'connections beyond the cap are refused');
    const stats = await child.stats();
    assert.equal(stats.connections <= 128, true, `${stats.connections} open connections`);
    bounded(stats, baseline);
    for (const item of all) item.socket.destroy();
    await until(async () => (await child.stats()).connections === 0, 'every connection is released');
    assert.equal((await call(child.port, 'GET', '/v1/leases')).status, 200);
  } finally {
    for (const item of all) item.socket.destroy();
    child.dispose();
  }
});

test('shutdown never waits for a half-open peer, an unread response or a step still in flight', async () => {
  const child = await startChild({ settleMs: 60000 });
  const held = [];
  const hold = (options) => { held.push(connect(child.port, options)); return held.at(-1).socket; };
  try {
    const { port } = child;
    const body = JSON.stringify(valid());
    hold({ allowHalfOpen: true });
    hold({ allowHalfOpen: true }).write('GET /v1/lea');
    hold({ allowHalfOpen: true }).write(get(port, '/v1/leases', 'X-Partial: ').slice(0, -2));
    hold({ allowHalfOpen: true }).write(`POST /v1/steps HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{"schemaV`);
    hold({ allowHalfOpen: true }).write(get(port, '/', 'Connection: Upgrade\r\nUpgrade: websocket\r\n'));
    hold({ allowHalfOpen: true }).write(`POST /v1/steps HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: text/plain\r\nContent-Length: 2\r\n\r\n{}`);
    hold({ read: false }).write(`POST /v1/steps HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\n\r\n${body}`);
    hold({ read: false }).write(get(port, '/transcript.json').repeat(200));
    await until(async () => (await child.stats()).connections >= 3, 'half-open peers are connected');
    const closed = await Promise.race([child.stop(), hardTimeout(60000, 'closeServer did not finish')]);
    assert.equal(closed.type, 'closed');
    const exit = await Promise.race([child.exited, hardTimeout(60000, 'the child did not exit')]);
    assert.deepEqual(exit, { code: 0, signal: null }, child.errors());
  } finally {
    for (const item of held) item.socket.destroy();
    child.dispose();
  }
});

test('closeServer finishes while a refused client keeps its half of the connection open', async () => {
  const service = await startService();
  const client = connect(service.port, { allowHalfOpen: true });
  client.socket.write(`POST /v1/steps HTTP/1.1\r\nHost: 127.0.0.1:${service.port}\r\nContent-Type: text/plain\r\nContent-Length: 2\r\n\r\n{}`);
  try {
    await until(() => /^HTTP\/1\.1 415 /.test(client.received()), 'the refusal arrives');
    await Promise.race([service.stop(), hardTimeout(30000, 'closeServer hung on a half-open peer')]);
    assert.equal(service.server.listening, false);
  } finally {
    client.socket.destroy();
    cleanup(service.dir);
  }
});

test('pipelining is allowed to a small depth and cut off beyond it', async () => {
  const service = await startService();
  const { port } = service;
  try {
    const four = await rawHttp(port, get(port, '/scope.json').repeat(3) + get(port, '/scope.json', 'Connection: close\r\n'));
    assert.equal((four.text.match(/"cardId":"C042"/g) ?? []).length, 4, 'four pipelined requests are all answered');
    const flood = connect(port);
    flood.socket.write(get(port, '/scope.json').repeat(50));
    await Promise.race([flood.closed, hardTimeout(30000, 'the pipelined flood was not cut off')]);
    assert.equal((flood.received().match(/HTTP\/1\.1 200/g) ?? []).length <= 4, true);
    assert.equal((await call(port, 'GET', '/scope.json')).status, 200, 'the service is still healthy');
  } finally {
    await service.stop();
    cleanup(service.dir);
  }
});

test('connections that never complete a request are closed by the server', async () => {
  const service = await startService();
  const { port } = service;
  const silent = connect(port);
  const slow = connect(port);
  slow.socket.write(get(port, '/v1/leases', 'X-Slow: ').slice(0, -2));
  try {
    await Promise.race([Promise.all([silent.closed, slow.closed]), hardTimeout(60000, 'idle sockets were kept')]);
    assert.match(slow.received(), /^HTTP\/1\.1 408 |^$/);
    assert.equal((await call(port, 'GET', '/scope.json')).status, 200);
  } finally {
    silent.socket.destroy();
    slow.socket.destroy();
    await service.stop();
    cleanup(service.dir);
  }
});

test('oversized or numerous headers are refused by the parser and the service stays healthy', async () => {
  const service = await startService();
  const { port } = service;
  try {
    const attempt = async (extra) => rawHttp(port, `GET /v1/leases HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n${extra}\r\n`).catch(() => ({ status: 0 }));
    assert.equal([0, 431].includes((await attempt(`X-Big: ${'a'.repeat(20000)}\r\n`)).status), true);
    assert.equal([0, 431].includes((await attempt(Array.from({ length: 200 }, (_, index) => `X-N${index}: 1\r\n`).join(''))).status), true);
    assert.equal((await call(port, 'GET', '/v1/leases')).status, 200);
  } finally {
    await service.stop();
    cleanup(service.dir);
  }
});

test('the transcript is built once for concurrent requests and again only after a failure', async () => {
  let builds = 0;
  let failing = true;
  const hold = deferred();
  const transcript = async () => { builds += 1; await hold.promise; if (failing) throw new Error('the build fails'); return { kind: 'C042-server-transcript', builds }; };
  const service = await startService({ transcript });
  try {
    const pending = Array.from({ length: 10 }, () => call(service.port, 'GET', '/transcript.json'));
    await until(() => new Promise((resolve) => service.server.getConnections((error, count) => resolve(count >= 10))), 'ten requests are connected');
    for (let turn = 0; turn < 5; turn += 1) await settleTurn();
    hold.resolve();
    const failed = await Promise.all(pending);
    assert.deepEqual([...new Set(failed.map((item) => item.status))], [500]);
    assert.equal(builds, 1, 'ten concurrent requests shared one build');
    failing = false;
    const answers = await Promise.all(Array.from({ length: 25 }, () => call(service.port, 'GET', '/transcript.json')));
    assert.deepEqual([...new Set(answers.map((item) => item.json.builds))], [2]);
    assert.equal(builds, 2, 'a failure is retried once and a success is kept');
  } finally {
    await service.stop();
    cleanup(service.dir);
  }
});
