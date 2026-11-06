'use strict';

// R3 self-review line 14: the requests that bypass or abort the HTTP handler. CONNECT: without a 'connect' listener Node
// destroys the socket at once, so a valid mutation written BEFORE a CONNECT applies and its answer is lost with the
// connection (the F1 class). Upgrade and h2c: the header is ignored (RFC 9110 section 7.8), the request is an ordinary one
// and the closing mark applies. Expect: 100-continue after a refusal. Every row runs in HTTP/1.1 and HTTP/1.0 framing, in
// this process and in a SEPARATE server process, in ONE TCP write, with the ledger and the revision compared.
const { fork } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const test = require('node:test');
const { validateResultEnvelope } = require('../envelope.js');
const {
  assert, call, committed, startService,
} = require('./support.cjs');
const {
  exchange, get, hostOf, mutation, parseAnswers, quiet, sample,
} = require('./pipe-support.cjs');

const HARD_MS = 900000;
const v10 = (bytes) => bytes.replace(' HTTP/1.1\r\n', ' HTTP/1.0\r\n');
const connect = (p) => `CONNECT ${hostOf(p)} HTTP/1.1\r\nHost: ${hostOf(p)}\r\n\r\n`;
const upgraded = (bytes, protocol = 'websocket') => bytes.replace('Host:', `Connection: Upgrade\r\nUpgrade: ${protocol}\r\nHost:`);
const h2c = (bytes) => bytes.replace('Host:', 'Connection: Upgrade, HTTP2-Settings\r\nUpgrade: h2c\r\nHTTP2-Settings: AAMAAABkAAQCAAAAAAIAAAAA\r\nHost:');
const expecting = (bytes) => bytes.replace('Content-Type:', 'Expect: 100-continue\r\nContent-Type:');
const media = (bytes) => bytes.replace('application/json', 'text/plain');
const wrongMethod = (p) => `DELETE /v1/presets HTTP/1.1\r\nHost: ${hostOf(p)}\r\n\r\n`;

// [name, layout(port, n), statuses in HTTP/1.1, statuses in HTTP/1.0, mutations applied (each is 15 units)]
const ROWS = [
  ['[CONNECT]', (p) => [connect(p)], [405], [405], 0],
  ['[valid mutation][CONNECT]', (p, n) => [mutation(p, n), connect(p)], [201, 405], [201], 1],
  ['[GET][CONNECT]', (p) => [get(p, '/v1/leases'), connect(p)], [200, 405], [200], 0],
  ['[CONNECT][valid mutation]', (p, n) => [connect(p), mutation(p, n)], [405], [405], 0],
  ['[refused 404][CONNECT][valid mutation]', (p, n) => [get(p, '/nope'), connect(p), mutation(p, n)], [404], [404], 0],
  ['[valid mutation with Upgrade: websocket]', (p, n) => [upgraded(mutation(p, n))], [201], [201], 1],
  ['[valid mutation with Upgrade: h2c]', (p, n) => [h2c(mutation(p, n))], [201], [201], 1],
  ['[GET with Upgrade: websocket]', (p) => [upgraded(get(p, '/v1/leases'))], [200], [200], 0],
  ['[refused 404][valid mutation with Upgrade: websocket]', (p, n) => [get(p, '/nope'), upgraded(mutation(p, n))], [404], [404], 0],
  ['[refused 405][valid mutation with Upgrade: h2c]', (p, n) => [wrongMethod(p), h2c(mutation(p, n))], [405], [405], 0],
  ['[refused 415][valid mutation with Upgrade: websocket]', (p, n) => [media(mutation(p, n)), upgraded(mutation(p, n + 1000))], [415], [415], 0],
  ['[refused 404][valid mutation with Expect: 100-continue]', (p, n) => [get(p, '/nope'), expecting(mutation(p, n))], [404], [404], 0],
  ['[refused 415 with Expect: 100-continue][valid mutation]', (p, n) => [expecting(media(mutation(p, n))), mutation(p, n + 1000)], [415], [415], 0],
  ['[valid mutation with Expect: 100-continue][refused 404]', (p, n) => [expecting(mutation(p, n)), get(p, '/nope')], [201, 404], [201], 1],
];

const typed = (answer) => { try { return JSON.parse(answer.body); } catch { return null; } };

async function inProcess() {
  const service = await startService();
  return {
    port: service.port,
    before: async () => { await quiet(service); return { ...sample(service) }; },
    after: async () => { await quiet(service); return { ...sample(service) }; },
    unchanged: (before, after) => assert.deepEqual(after, before, 'the ledger and both journals are unchanged'),
    dispose: () => service.stop(),
  };
}

async function inChild() {
  const child = fork(path.join(__dirname, 'child-server.cjs'), ['{}'], { execArgv: ['--max-old-space-size=48'], env: cleanEnvironment(), silent: true });
  const errors = [];
  child.stderr.on('data', (chunk) => errors.push(chunk));
  const watchdog = setTimeout(() => child.kill(), HARD_MS);
  const early = new Promise((resolve, reject) => child.once('exit', (code, signal) => reject(new Error(`the child exited early: ${code} ${signal} ${Buffer.concat(errors)}`))));
  early.catch(() => {});
  const listening = new Promise((resolve) => child.on('message', (message) => { if (message.type === 'listening') resolve(message.port); }));
  const stop = new Promise((resolve) => child.on('message', (message) => { if (message.type === 'closed') resolve(); }));
  const port = await Promise.race([listening, early]);
  const observe = async () => {
    const leases = (await call(port, 'GET', '/v1/leases')).json;
    const journal = (await call(port, 'GET', '/v1/journal')).json;
    return { committed: leases.leases['synthetic-lease-001'].committed, stepRecords: leases.journalRecords, runs: journal.runs, live: journal.live };
  };
  const quiescent = async () => {
    let previous = JSON.stringify(await observe());
    for (let stable = 0; stable < 4;) {
      await new Promise((resolve) => setImmediate(resolve));
      const now = JSON.stringify(await observe());
      stable = now === previous && JSON.parse(now).live === 0 ? stable + 1 : 0;
      previous = now;
    }
    return JSON.parse(previous);
  };
  return {
    port,
    before: quiescent,
    after: quiescent,
    unchanged: (before, after) => assert.deepEqual(after, before, 'the child process was not changed'),
    dispose: async () => { child.send({ type: 'stop' }); await Promise.race([stop, new Promise((resolve) => setTimeout(resolve, 5000).unref())]); clearTimeout(watchdog); child.kill(); },
  };
}

function cleanEnvironment() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  return env;
}

for (const [where, start] of [['in this process', inProcess], ['in a SEPARATE server process', inChild]]) {
  test(`CONNECT, Upgrade, h2c and Expect rows, ${where}: nothing behind a refusal runs, a request before a CONNECT is answered, HTTP/1.1 and HTTP/1.0`, { timeout: 1800000 }, async (context) => {
    let counter = 10;
    for (const [name, layout, statuses11, statuses10, applied] of ROWS) {
      // A fresh service per row: the two framings of a row move the 100-unit lease by at most 30 units.
      const target = await start();
      try {
        for (const [framing, convert, expected] of [['HTTP/1.1', (bytes) => bytes, statuses11], ['HTTP/1.0', v10, statuses10]]) {
          await context.test(`${name} ${framing}`, async () => {
            counter += 1;
            const before = await target.before();
            const seen = await exchange(target.port, layout(target.port, counter).map(convert));
            const after = await target.after();
            assert.deepEqual(seen.statuses, expected, `${name} ${framing}`);
            assert.equal(seen.closed, true, 'the server closed the connection');
            assert.equal(after.committed - before.committed, 15 * applied, `${applied} mutation(s) of 15 units applied`);
            if (applied === 0) target.unchanged(before, after);
            for (const answer of seen.answers.filter((item) => item.status >= 400)) {
              const envelope = typed(answer);
              assert.equal(envelope !== null && validateResultEnvelope(envelope).ok, true, `a typed envelope for the ${answer.status}`);
              assert.equal(answer.close, true, 'Connection: close on a refusal');
            }
          });
        }
      } finally {
        await target.dispose();
      }
    }
  });
}

function rawBytes(port, bytes) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const chunks = [];
    const done = () => { clearTimeout(timer); socket.destroy(); resolve(Buffer.concat(chunks).toString('latin1')); };
    const timer = setTimeout(done, 60000);
    socket.on('error', () => {});
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('close', done);
    socket.on('connect', () => socket.write(bytes));
  });
}

test('a CONNECT request is answered 405 METHOD_NOT_ALLOWED with an Allow header and the connection is closed; a refusal behind a mutation adds no 100 Continue', { timeout: 120000 }, async () => {
  const service = await startService();
  try {
    const text = await rawBytes(service.port, connect(service.port));
    assert.match(text, /^HTTP\/1\.1 405 Method Not Allowed\r\n/);
    assert.match(text, /\r\nAllow: GET, POST\r\n/);
    assert.match(text, /\r\nConnection: close\r\n/);
    const answers = parseAnswers(text);
    assert.deepEqual([answers.length, typed(answers[0]).error.code], [1, 'METHOD_NOT_ALLOWED']);
    const refused = await rawBytes(service.port, `${get(service.port, '/nope')}${expecting(mutation(service.port, 2))}`);
    assert.equal(refused.includes('100 Continue'), false, 'no interim answer after a refusal');
    await quiet(service);
    assert.equal(committed(service.real), 0);
  } finally {
    await service.stop();
  }
});
