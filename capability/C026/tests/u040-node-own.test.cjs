'use strict';

// U040: Node answers some requests itself and never calls the request handler (an unknown Expect header, a request without Host,
// bytes it cannot parse). Those answers must be the same typed refusal as every other one: Connection: close, the connection
// closed, and nothing pipelined behind them allowed to upgrade. Rows run in this process and in a separate node process.
// The third pipelining hole (rev-C059 N1, the opposite failure of a per-connection queue): such a refusal is decided when the request head
// is parsed, so with legitimate requests pipelined BEFORE it the earlier answers must still come first, in order, then the typed refusal,
// then the close, and a burst of such connections must not pin the connection cap. No row decides on a clock: every wait is the server's
// own close, a count of sockets or a count of attempts; the node:test timeouts are hang guards only.
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const test = require('node:test');
const { createLocalServer, limits } = require('../server.cjs');
const { MODES, startFixture } = require('./u040-fixtures.cjs');
const { wire, upgradeWithHello, exchange, parseResponses } = require('./u040-support.cjs');

// Node's own answers have no JSON body: that is reported as a failed comparison, never as a parse error.
const codeOf = (response) => {
  try {
    return JSON.parse(response.body).error.code;
  } catch {
    return `(not a typed refusal: ${JSON.stringify(response.body.slice(0, 40))})`;
  }
};

// The refusals that Node decides while it parses a request head (X), each with the framings it applies to (an unknown Expect header is
// only looked at in HTTP/1.1). A parse error has no request to queue an answer behind: its typed 400 is only promised when nothing was
// pipelined before it (Node's own default also drops the connection once an answer is in flight), so behind earlier requests it must
// still close the connection, never upgrade and never answer more than the expected answers.
const read = (host, framing) => wire({ target: '/scope.json', host, framing });
const NODE_OWN = Object.freeze([
  { name: 'unknown Expect header', status: 417, code: 'EXPECTATION_FAILED', framings: ['1.1'], build: (host, framing) => wire({ target: '/scope.json', host, framing, headers: ['Expect: nonsense'] }) },
  {
    name: 'unknown Expect header on a POST with a body', status: 417, code: 'EXPECTATION_FAILED', framings: ['1.1'],
    build: (host, framing) => wire({ method: 'POST', target: '/scope.json', host, framing, headers: ['Expect: nonsense', 'Content-Length: 5'], body: 'hello' })
  },
  { name: 'no Host', status: 421, code: 'LOCAL_HOST_REQUIRED', framings: ['1.1', '1.0k'], build: (host, framing) => wire({ target: '/scope.json', host: null, framing }) },
  { name: 'Expect: 100-continue on a refused path', status: 404, code: 'NOT_FOUND', framings: ['1.1'], build: (host, framing) => wire({ target: '/nope', host, framing, headers: ['Expect: 100-continue'] }) },
  {
    name: 'bytes Node cannot parse', status: 400, code: 'MALFORMED_REQUEST', framings: ['1.1', '1.0k'], parseError: true,
    build: (host, framing) => Buffer.from(`GET / HTTP/${framing === '1.1' ? '1.1' : '1.0'}\r\nHost: ${host}\r\nBad Header\r\n\r\n`, 'latin1')
  }
]);
// G a valid read, X the Node-own refusal, M a valid upgrade with a masked hello frame, P a refused POST with a body (decided by the handler).
const SHAPES = Object.freeze(['X', 'G,X', 'G,G,X', 'G,G,G,X', 'G,G,X,G', 'G,G,X,M', 'X,G,G', 'P,G,X']);

// What the client is owed: every answer up to and including the first refusal; whatever was pipelined behind a refusal is never answered.
function expectedAnswers(shape, kind) {
  const answers = [];
  for (const part of shape.split(',')) {
    if (part === 'G') answers.push({ status: 200 });
    else if (part === 'P') { answers.push({ status: 405, code: 'METHOD_NOT_ALLOWED' }); break; }
    else if (part === 'X') { answers.push({ status: kind.status, code: kind.code }); break; }
  }
  return answers;
}

function problemsOf(result, shape, kind) {
  const problems = [];
  const owed = expectedAnswers(shape, kind);
  const statuses = owed.map((answer) => answer.status);
  const lossy = kind.parseError && shape !== 'X';
  const shown = lossy ? statuses.slice(0, result.statuses.length) : statuses;
  if (JSON.stringify(result.statuses) !== JSON.stringify(shown)) problems.push(`answers ${JSON.stringify(result.statuses)} instead of ${lossy ? 'a prefix of ' : ''}${JSON.stringify(statuses)}`);
  result.responses.forEach((response, index) => {
    const wanted = owed[index];
    if (wanted?.code === undefined) return;
    if (codeOf(response) !== wanted.code) problems.push(`answer ${index + 1} is ${codeOf(response)} instead of ${wanted.code}`);
    if (response.headers.connection !== 'close') problems.push(`answer ${index + 1} does not say Connection: close`);
  });
  if (result.saw101) problems.push('a 101 was sent');
  if (!result.closedByServer) problems.push(`the connection was not closed (${result.reason})`);
  return problems;
}

// Opens `count` sockets at once, writes `request` on each as soon as it is connected and resolves when the server has ended every one of
// them. The hang guard only turns a pinned connection into a failed count instead of a hung suite.
function burst(port, request, count, guardMs = 60000) {
  return new Promise((resolve) => {
    const chunks = Array.from({ length: count }, () => []);
    const ended = new Set();
    const sockets = [];
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      for (const socket of sockets) socket.destroy();
      resolve({ closedByServer: ended.size, answers: chunks.map((parts) => parseResponses(Buffer.concat(parts))) });
    };
    const guard = setTimeout(finish, guardMs);
    for (let index = 0; index < count; index += 1) {
      const socket = net.connect({ host: '127.0.0.1', port, allowHalfOpen: true });
      const over = () => { ended.add(index); if (ended.size === count) finish(); };
      socket.on('data', (chunk) => chunks[index].push(chunk));
      socket.on('end', over);
      socket.on('close', over);
      socket.on('error', () => {});
      socket.once('connect', () => socket.write(request));
      sockets.push(socket);
    }
  });
}

// The server counts a connection until it has destroyed its own side, so the first attempts after a burst may still meet the cap; a
// pinned connection never releases, so the count of attempts (not a clock) separates the two.
async function readAfterBurst(fixture, attempts = 50) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await exchange(fixture.port, [{ data: read(fixture.host, '1.1') }]);
    if (result.statuses.length > 0) return result.statuses;
  }
  return [];
}

for (const mode of MODES) {
  test(`${mode}: an unknown Expect header is the typed 417 refusal, with Connection: close, and an upgrade behind it creates no session`, { timeout: 60000 }, async () => {
    const fixture = await startFixture(mode, 'none');
    try {
      const request = wire({ target: '/scope.json', host: fixture.host, headers: ['Expect: nonsense'] });
      const result = await exchange(fixture.port, [{ data: Buffer.concat([request, upgradeWithHello(fixture.host)]) }]);
      assert.deepEqual(result.statuses, [417]);
      assert.equal(codeOf(result.responses[0]), 'EXPECTATION_FAILED');
      assert.equal(result.responses[0].headers.connection, 'close');
      assert.equal(result.closedByServer, true);
      assert.equal((await fixture.state()).sessions, 0);
    } finally {
      await fixture.close();
    }
  });

  test(`${mode}: Expect: 100-continue is decided by the handler: a refused request gets no 100 Continue, a valid read is answered without one`, { timeout: 60000 }, async () => {
    const fixture = await startFixture(mode, 'none');
    try {
      const refused = wire({ target: '/nope', host: fixture.host, headers: ['Expect: 100-continue'] });
      const first = await exchange(fixture.port, [{ data: Buffer.concat([refused, upgradeWithHello(fixture.host)]) }]);
      assert.deepEqual(first.statuses, [404], 'no 100 Continue before the refusal, no 101 after it');
      assert.equal(codeOf(first.responses[0]), 'NOT_FOUND');
      assert.equal(first.closedByServer, true);
      const valid = wire({ target: '/scope.json', host: fixture.host, headers: ['Expect: 100-continue'] });
      const second = await exchange(fixture.port, [{ data: valid }]);
      assert.deepEqual(second.statuses, [200], 'a request without content needs no 100 Continue');
      assert.equal((await fixture.state()).sessions, 0);
    } finally {
      await fixture.close();
    }
  });

  test(`${mode}: a request without Host is the typed 421 refusal in both framings, and an upgrade behind it creates no session`, { timeout: 60000 }, async () => {
    const fixture = await startFixture(mode, 'none');
    try {
      for (const framing of ['1.1', '1.0k']) {
        const request = wire({ target: '/scope.json', host: null, framing });
        const result = await exchange(fixture.port, [{ data: Buffer.concat([request, upgradeWithHello(fixture.host)]) }]);
        assert.deepEqual(result.statuses, [421], framing);
        assert.equal(codeOf(result.responses[0]), 'LOCAL_HOST_REQUIRED', framing);
        assert.equal(result.responses[0].headers.connection, 'close', framing);
        assert.equal(result.closedByServer, true, framing);
      }
      assert.equal((await fixture.state()).sessions, 0);
    } finally {
      await fixture.close();
    }
  });

  test(`${mode}: bytes Node cannot parse get the typed 400 refusal that closes the connection; nothing behind them upgrades`, { timeout: 60000 }, async () => {
    const fixture = await startFixture(mode, 'none');
    try {
      const garbage = Buffer.from(`GET / HTTP/1.1\r\nHost: ${fixture.host}\r\nBad Header\r\n\r\n`, 'latin1');
      const result = await exchange(fixture.port, [{ data: Buffer.concat([garbage, upgradeWithHello(fixture.host)]) }]);
      assert.deepEqual(result.statuses, [400]);
      assert.equal(codeOf(result.responses[0]), 'MALFORMED_REQUEST');
      assert.equal(result.responses[0].headers.connection, 'close');
      assert.equal(result.closedByServer, true);
      assert.equal((await fixture.state()).sessions, 0);
    } finally {
      await fixture.close();
    }
  });

  test(`${mode}: an h2c upgrade attempt is refused and closed: only a WebSocket upgrade on /stream is ever accepted`, { timeout: 60000 }, async () => {
    const fixture = await startFixture(mode, 'none');
    try {
      const headers = ['Upgrade: h2c', 'Connection: Upgrade, HTTP2-Settings', 'HTTP2-Settings: AAMAAABkAARAAAAAAAIAAAAA'];
      for (const [target, status, code] of [['/stream', 400, 'UPGRADE_HEADERS_REQUIRED'], ['/scope.json', 404, 'NOT_FOUND']]) {
        const request = wire({ target, host: fixture.host, headers });
        const result = await exchange(fixture.port, [{ data: Buffer.concat([request, upgradeWithHello(fixture.host)]) }]);
        assert.deepEqual(result.statuses, [status], target);
        assert.equal(codeOf(result.responses[0]), code, target);
        assert.equal(result.closedByServer, true, target);
      }
      assert.equal((await fixture.state()).sessions, 0);
    } finally {
      await fixture.close();
    }
  });

  test(`${mode}: legitimate reads pipelined BEFORE a Node-own refusal are answered in order, then the typed refusal, then the connection is closed`, { timeout: 120000 }, async () => {
    const fixture = await startFixture(mode, 'none');
    try {
      const problems = [];
      let rows = 0;
      for (const kind of NODE_OWN) {
        for (const framing of kind.framings) {
          for (const shape of SHAPES) {
            const host = fixture.host;
            const parts = shape.split(',').map((part) => ({
              G: read(host, framing), X: kind.build(host, framing), M: upgradeWithHello(host),
              P: wire({ method: 'POST', target: '/scope.json', host, framing, headers: ['Content-Length: 5'], body: 'hello' })
            }[part]));
            const result = await exchange(fixture.port, [{ data: Buffer.concat(parts) }]);
            rows += 1;
            problems.push(...problemsOf(result, shape, kind).map((problem) => `${kind.name}, HTTP/${framing === '1.1' ? '1.1' : '1.0'}, [${shape}]: ${problem}`));
          }
        }
      }
      assert.deepEqual(problems, []);
      assert.equal(rows, SHAPES.length * NODE_OWN.reduce((sum, kind) => sum + kind.framings.length, 0), 'every shape ran for every refusal and framing');
      assert.equal(rows, 56, 'the README states 56 rows per mode');
      assert.equal((await fixture.state()).sessions, 0, 'no upgrade behind any of them created a session');
    } finally {
      await fixture.close();
    }
  });

  test(`${mode}: ${limits.maxConnections} sockets that each send [G][G][X] in one write are all ended by the server, and a legitimate read is answered afterwards`, { timeout: 120000 }, async () => {
    for (const kind of NODE_OWN) {
      const fixture = await startFixture(mode, 'none');
      try {
        const request = Buffer.concat([read(fixture.host, '1.1'), read(fixture.host, '1.1'), kind.build(fixture.host, '1.1')]);
        const result = await burst(fixture.port, request, limits.maxConnections);
        assert.equal(result.closedByServer, limits.maxConnections, `${kind.name}: sockets ended by the server`);
        const owed = [200, 200, kind.status];
        const wrong = result.answers.map((responses) => responses.map((response) => response.status))
          .filter((statuses) => JSON.stringify(statuses) !== JSON.stringify(kind.parseError ? owed.slice(0, statuses.length) : owed));
        assert.deepEqual(wrong, [], `${kind.name}: every socket got the answers in order and nothing else`);
        if (!kind.parseError) {
          for (const responses of result.answers) {
            assert.equal(codeOf(responses[2]), kind.code, kind.name);
            assert.equal(responses[2].headers.connection, 'close', kind.name);
          }
        }
        assert.deepEqual(await readAfterBurst(fixture), [200], `${kind.name}: a legitimate read is answered after the burst`);
        assert.equal((await fixture.state()).sessions, 0);
      } finally {
        await fixture.close();
      }
    }
  });
}

// The parse-error listener, driven directly so that the timeout and header-overflow answers need no 5 s timer and no flood.
function fakeSocket(overrides = {}) {
  const socket = { writable: true, bytesWritten: 0, written: [], soon: 0, destroyed: 0, ...overrides };
  socket.write = (text) => { socket.written.push(text); };
  socket.destroySoon = () => { socket.soon += 1; };
  socket.destroy = () => { socket.destroyed += 1; };
  return socket;
}

test('a parse error is answered with the typed refusal that its cause maps to, then the connection is ended after the flush', () => {
  const server = createLocalServer({ transcript: null });
  const cases = [['HPE_HEADER_OVERFLOW', 431, 'HEADERS_TOO_LARGE'], ['ERR_HTTP_REQUEST_TIMEOUT', 408, 'REQUEST_TIMEOUT'], ['HPE_INVALID_METHOD', 400, 'MALFORMED_REQUEST'], [undefined, 400, 'MALFORMED_REQUEST']];
  for (const [cause, status, code] of cases) {
    const socket = fakeSocket();
    assert.equal(server.emit('clientError', Object.assign(new Error('parse'), { code: cause }), socket), true, `${cause}: a listener must handle it`);
    assert.equal(socket.written.length, 1, cause);
    assert.match(socket.written[0], new RegExp(`^HTTP/1\\.1 ${status} `), cause);
    assert.match(socket.written[0], /\r\nConnection: close\r\n/, cause);
    assert.equal(JSON.parse(socket.written[0].split('\r\n\r\n')[1]).error.code, code, cause);
    assert.deepEqual([socket.soon, socket.destroyed], [1, 0], `${cause}: ended after the flush, not destroyed unflushed`);
  }
});

test('a parse error on a socket that is gone, or that has already been answered, writes nothing and just destroys it', () => {
  const server = createLocalServer({ transcript: null });
  for (const overrides of [{ writable: false }, { bytesWritten: 120 }]) {
    const socket = fakeSocket(overrides);
    assert.equal(server.emit('clientError', Object.assign(new Error('parse'), { code: 'HPE_INVALID_METHOD' }), socket), true);
    assert.deepEqual([socket.written.length, socket.soon, socket.destroyed], [0, 0, 1], JSON.stringify(overrides));
  }
});

// The limit that the README states: behind earlier pipelined reads a parse error gets no typed 400, only a close. Control: a plain node:http
// server without any clientError listener behaves the same, so this is what Node does while an answer is in flight, not what the fixture adds.
test('control: a plain node:http server also answers at most the first earlier read when a parse error follows pipelined reads, then closes', { timeout: 60000 }, async () => {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Length': 2 });
    response.end('ok');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const host = `127.0.0.1:${port}`;
    const garbage = Buffer.from(`GET / HTTP/1.1\r\nHost: ${host}\r\nBad Header\r\n\r\n`, 'latin1');
    for (const reads of [1, 2, 3]) {
      const result = await exchange(port, [{ data: Buffer.concat([...Array(reads).fill(read(host, '1.1')), garbage]) }]);
      assert.equal(result.closedByServer, true, `${reads} read(s): the connection was closed (${result.reason})`);
      assert.equal(result.statuses.length <= 1 && result.statuses.every((status) => status === 200), true, `${reads} read(s): answers ${JSON.stringify(result.statuses)}`);
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
