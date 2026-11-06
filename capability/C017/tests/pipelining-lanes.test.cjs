'use strict';

// A THIRD pipelining hole (rev-C059 N1, orders\_PIPELINING.md): a Node-own answer decided at PARSE time (checkExpectation, checkContinue, a request
// without Host, clientError) must not leave a connection open when TWO OR MORE legitimate requests came before it. This server marks the socket at
// the first line of the first handler and closes it after that one answer, so [G][G][X], [G][G][G][X], [G][G][X][G] and [POST][G][X] must end with
// the answer of the FIRST request only (a parse error may even cost that one: README), no later answer, no later effect, and a connection closed BY
// THE SERVER: the exchange below waits for the close with no timer, so a socket that stays open fails by the node:test timeout alone (no time bound
// decides anything). The matrix runs against a server in this process AND in a separate process, in HTTP/1.1 and HTTP/1.0 where the shape exists; a
// structural resource test sends 128 such sockets and requires every one to be closed afterwards and a legitimate GET to be answered (counted, not timed).
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const s = require('./support.cjs');
const h = require('./http.cjs');
const P = require('./pipelining.cjs');

const JSON_TYPE = { 'Content-Type': 'application/json' };
let counter = 0;
const next = () => String(++counter).padStart(5, '0');

function exchange(port, bytes) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const parts = [];
    let done = false;
    const answers = () => [...Buffer.concat(parts).toString('latin1').matchAll(/HTTP\/1\.[01] (\d{3})/g)].map((match) => Number(match[1]));
    // The exchange ends when the server closes the connection (no timer: a socket that stays open fails by the node:test timeout alone) or as soon as a
    // SECOND answer shows that a later request was answered, which is already the failure and need not wait for a close.
    const finish = () => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ text: Buffer.concat(parts).toString('latin1'), statuses: answers() });
    };
    socket.on('data', (part) => { parts.push(part); if (answers().length > 1) finish(); });
    socket.on('error', () => {});
    socket.once('close', finish);
    socket.write(bytes);
  });
}

// Every Node-own answer: [name, framings, answered (false: a parse error may lose even the first answer), build(port, version)].
const bigHeader = (port, version) => `GET /api/state HTTP/${version}\r\nHost: 127.0.0.1:${port}\r\nX-Big: ${'z'.repeat(12000)}\r\n\r\n`;
const NODE_OWN = [
  ['417 unknown Expect on a GET', ['1.1'], true, (port, v) => P.frame('GET', '/api/state', v, { port, headers: { Expect: 'nonsense' } })],
  ['417 unknown Expect on a POST with a body', ['1.1'], true, (port, v) => P.frame('POST', '/api/cancel', v, { port, headers: { ...JSON_TYPE, Expect: 'nonsense' }, body: JSON.stringify(s.cancelCmd(`lane-x-${next()}`, 'act-9-ffffffff', 1, false)) })],
  ['417 unknown Expect with a chunked body', ['1.1'], true, (port, v) => P.frame('POST', '/api/cancel', v, { port, headers: { ...JSON_TYPE, Expect: 'nonsense' }, chunkedBody: `${'1\r\na\r\n'.repeat(50)}0\r\n\r\n` })],
  ['Expect: 100-continue with an unsupported media type', ['1.1'], true, (port, v) => P.frame('POST', '/api/cancel', v, { port, headers: { 'Content-Type': 'text/plain', Expect: '100-continue' }, body: 'hello' })],
  ['request without a Host header', ['1.1', '1.0'], true, (port, v) => P.frame('GET', '/api/state', v, { noHost: true })],
  ['malformed request line', ['1.1'], false, () => 'G@T /api/state HTTP/1.1\r\n\r\n'],
  ['oversize header', ['1.1', '1.0'], false, bigHeader],
];

const PATTERNS = [
  ['[G][G][X]', (g, x) => g + g + x],
  ['[G][G][G][X]', (g, x) => g + g + g + x],
  ['[G][G][X][G]', (g, x) => g + g + x + g],
  ['[POST][G][X]', (g, x, post) => post + g + x],
];

async function matrix(port, mutation, quiet) {
  const problems = [];
  let cases = 0;
  for (const [name, versions, answered, build] of NODE_OWN) {
    for (const version of versions) {
      for (const [pattern, assemble] of PATTERNS) {
        const post = pattern === '[POST][G][X]';
        const before = await quiet();
        const got = await exchange(port, assemble(P.okGet({ port }, version), build(port, version), post ? mutation(version) : null));
        const label = `${name} (HTTP/${version}) as ${pattern}`;
        cases += 1;
        if (got.statuses.length > 1) problems.push(`${label}: a later request was answered: ${JSON.stringify(got.statuses)}`);
        if (answered && got.statuses.length === 0) problems.push(`${label}: not even the first request was answered`);
        if (answered && !post && got.statuses.length === 1 && got.statuses[0] !== 200) problems.push(`${label}: the first answer was ${got.statuses[0]}`);
        // A start behind nothing applies (the first request of a [POST] case is answered and may change the journal); a GET-first case must leave it as it was.
        if (!post && (await quiet()) !== before) problems.push(`${label}: THE JOURNAL OR THE REVISION CHANGED`);
      }
    }
  }
  return { problems, cases };
}

test('two and three legitimate requests before a Node-own answer end with the first answer and a closed connection (server in this process)', { timeout: 240000 }, async (t) => {
  const env = await h.serve(t);
  const port = Number(new URL(env.origin).port);
  const mutation = (version) => P.frame('POST', '/api/start', version, { port, headers: JSON_TYPE, body: JSON.stringify(s.startCmd(`lane-start-${next()}`)) });
  const { problems, cases } = await matrix(port, mutation, async () => String(env.ctx.engine.view().journal.length));
  assert.equal(cases, 36, `${cases} cases ran`);
  assert.deepEqual(problems, []);
});

test('two and three legitimate requests before a Node-own answer end with the first answer and a closed connection (server in a SEPARATE process)', { timeout: 300000 }, async (t) => {
  const ctx = await P.prepare(t, 'start');
  const mutation = (version) => P.mutation(ctx, version);
  const { problems, cases } = await matrix(ctx.port, mutation, () => P.settled(ctx));
  assert.equal(cases, 36, `${cases} cases ran`);
  assert.deepEqual(problems, []);
  const stopped = await ctx.kid.stop();
  assert.equal(stopped.code, 0, ctx.kid.errors());
});

test('128 sockets that each send [G][G][X] do not pin the connection cap: every socket is closed afterwards and a legitimate GET is answered (counted, not timed)', { timeout: 300000 }, async (t) => {
  const ctx = await P.prepare(t, 'start');
  const burst = Array.from({ length: 128 }, () => exchange(ctx.port, P.okGet(ctx, '1.1') + P.okGet(ctx, '1.1') + NODE_OWN[0][3](ctx.port, '1.1')));
  const results = await Promise.all(burst);
  assert.equal(results.length, 128, 'every socket was closed');
  assert.ok(results.every((got) => got.statuses.length <= 1), 'no socket got a later answer');
  assert.ok(results.some((got) => got.statuses[0] === 200), 'the server answered the first request of the sockets it accepted');
  const served = await h.get(ctx.origin, '/api/state');
  assert.equal(served.status, 200, 'a legitimate GET after the burst');
  const stopped = await ctx.kid.stop();
  assert.equal(stopped.code, 0, ctx.kid.errors());
});
