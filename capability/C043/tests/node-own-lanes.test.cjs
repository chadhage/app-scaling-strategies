'use strict';

// rev-C059 N1 (the THIRD pipelining hole, the opposite failure of the same design) against C043: a Node-own answer decided at
// PARSE time (checkExpectation answering 417 for Expect: nonsense, a request without Host, every clientError shape) must run in
// the SAME lane as the service's own refusals. With two or three legitimate requests pipelined BEFORE the refused one the
// earlier requests are answered IN ORDER, then the typed refusal, then the connection is closed and destroyed (HTTP/1.1); in
// HTTP/1.0 the first answer closes the connection and nothing behind it runs. Layouts: [G][G][X], [G][G][G][X], [G][G][X][G],
// [POST][G][X], [POST][G][G][X]. Every row runs in this process and in a SEPARATE server process, in ONE TCP write, with the
// ledger compared. Then a structural resource test: 128 sockets, each sending [G][G][X], must not pin the 128-connection cap
// (after the burst every socket is closed and a legitimate GET is answered; counts only, never a time bound).
const { fork } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const test = require('node:test');
const {
  assert, call, committed, startService,
} = require('./support.cjs');
const {
  exchange, get, hostOf, mutation, quiet,
} = require('./pipe-support.cjs');

const HARD_MS = 900000;
const v10 = (bytes) => bytes.replace(' HTTP/1.1\r\n', ' HTTP/1.0\r\n');
const G = (p) => get(p, '/v1/leases');
const X = {
  'Expect: nonsense (GET)': [417, (p) => get(p, '/v1/leases', 'Expect: nonsense\r\n')],
  'Expect: nonsense (POST with a body)': [417, (p) => `POST /v1/presets HTTP/1.1\r\nHost: ${hostOf(p)}\r\nExpect: nonsense\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}`],
  'a request without Host': [421, () => 'GET /v1/leases HTTP/1.1\r\n\r\n'],
  'a malformed request line (clientError)': [400, () => 'GET\r\n\r\n'],
  'an invalid header line (clientError)': [400, (p) => get(p, '/v1/leases', 'Bad Header: x\r\n')],
  'a header block beyond the size bound (clientError)': [431, (p) => get(p, '/v1/leases', `X-Big: ${'a'.repeat(9000)}\r\n`)],
};
const POST_X = ['Expect: nonsense (POST with a body)', 'a request without Host', 'a malformed request line (clientError)'];
// [name, layout, statuses of the answers before the refusal in HTTP/1.1, mutations applied, the refusals it runs with]
const LAYOUTS = [
  ['[G][G][X]', (p, x) => [G(p), G(p), x(p)], [200, 200], 0, Object.keys(X)],
  ['[G][G][G][X]', (p, x) => [G(p), G(p), G(p), x(p)], [200, 200, 200], 0, Object.keys(X)],
  ['[G][G][X][G]', (p, x) => [G(p), G(p), x(p), G(p)], [200, 200], 0, Object.keys(X)],
  ['[POST][G][X]', (p, x, n) => [mutation(p, n), G(p), x(p)], [201, 200], 1, POST_X],
  ['[POST][G][G][X]', (p, x, n) => [mutation(p, n), G(p), G(p), x(p)], [201, 200, 200], 1, POST_X],
];

function cleanEnvironment() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  return env;
}

async function inProcess() {
  const service = await startService();
  return { port: service.port, ledger: async () => { await quiet(service); return committed(service.real); }, dispose: () => service.stop() };
}

async function inChild() {
  const child = fork(path.join(__dirname, 'child-server.cjs'), ['{}'], { execArgv: ['--max-old-space-size=48'], env: cleanEnvironment(), silent: true });
  const watchdog = setTimeout(() => child.kill(), HARD_MS);
  const stop = new Promise((resolve) => child.on('message', (message) => { if (message.type === 'closed') resolve(); }));
  const port = await new Promise((resolve) => child.on('message', (message) => { if (message.type === 'listening') resolve(message.port); }));
  const read = async () => (await call(port, 'GET', '/v1/leases')).json.leases['synthetic-lease-001'].committed;
  const ledger = async () => {
    let previous = await read();
    for (let stable = 0; stable < 4;) {
      await new Promise((resolve) => setImmediate(resolve));
      const now = await read();
      stable = now === previous ? stable + 1 : 0;
      previous = now;
    }
    return previous;
  };
  return {
    port, ledger,
    dispose: async () => { child.send({ type: 'stop' }); await Promise.race([stop, new Promise((resolve) => setTimeout(resolve, 5000).unref())]); clearTimeout(watchdog); child.kill(); },
  };
}

for (const [where, start] of [['in this process', inProcess], ['in a SEPARATE server process', inChild]]) {
  test(`NODE-OWN LANES ${where}: two or three legitimate requests before a Node-own refusal are answered in order, then the typed refusal, then the connection closes (HTTP/1.1 and HTTP/1.0)`, { timeout: 1800000 }, async (context) => {
    let counter = 200;
    for (const [name, layout, before11, applied, refusals] of LAYOUTS) {
      // A POST layout applies one mutation per case: one service per layout keeps the 100-unit lease far from its limit.
      const shared = applied === 0 && where !== 'in this process' ? await start() : null;
      try {
        for (const refusal of refusals) {
          const [status, request] = X[refusal];
          for (const framing of ['HTTP/1.1', 'HTTP/1.0']) {
            await context.test(`${name} + ${refusal} ${framing}`, async () => {
              const target = shared ?? await start();
              try {
                counter += 1;
                const before = await target.ledger();
                const bytes = layout(target.port, request, counter).map((part) => (framing === 'HTTP/1.0' ? v10(part) : part));
                const seen = await exchange(target.port, bytes);
                const after = await target.ledger();
                const expected = framing === 'HTTP/1.0' ? [before11[0]] : [...before11, status];
                assert.deepEqual(seen.statuses, expected, 'the earlier answers in order, then the typed refusal (HTTP/1.0: the first answer closes the connection)');
                assert.equal(seen.closed, true, 'the server closed the connection');
                assert.equal(after - before, 15 * applied, `${applied} mutation(s) of 15 units applied`);
              } finally {
                if (shared === null) await target.dispose();
              }
            });
          }
        }
      } finally {
        if (shared !== null) await shared.dispose();
      }
    }
  });
}

test('NODE-OWN LANES 128 sockets, each sending [G][G][X], do not pin the 128-connection cap: every socket is closed with [200, 200, 417] and a legitimate GET is answered', { timeout: 1800000 }, async () => {
  const target = await inChild();
  try {
    const count = 128;
    const texts = [];
    await Promise.all(Array.from({ length: count }, () => new Promise((resolve) => {
      const socket = net.connect({ host: '127.0.0.1', port: target.port });
      const chunks = [];
      socket.on('error', () => {});
      socket.on('data', (chunk) => chunks.push(chunk));
      socket.once('close', () => { texts.push(Buffer.concat(chunks).toString('latin1')); resolve(); });
      socket.once('connect', () => socket.write(`${G(target.port)}${G(target.port)}${X['Expect: nonsense (GET)'][1](target.port)}`));
    })));
    const statuses = (text) => [...text.matchAll(/HTTP\/1\.1 (\d{3}) /g)].map((match) => Number(match[1]));
    assert.equal(texts.length, count, 'every socket was closed by the server');
    assert.equal(texts.filter((text) => JSON.stringify(statuses(text)) === JSON.stringify([200, 200, 417])).length, count, 'every socket got the two answers in order and then the typed 417');
    assert.equal((await call(target.port, 'GET', '/v1/leases')).status, 200, 'a legitimate GET is answered after the burst');
  } finally {
    await target.dispose();
  }
});
