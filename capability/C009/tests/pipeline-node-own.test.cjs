'use strict';

const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { test } = require('node:test');
const { startApp } = require('./helpers.cjs');
const { startChild, within } = require('./resource-harness.cjs');
const { bare } = require('./raw-http.cjs');
const { ROWS, auth, post, JSON_HEADERS } = require('./refusal-rows.cjs');
const { FRAMINGS, appFor, appliedCount, isSubsequence } = require('./pipeline-rows.cjs');
const { checkCells, tokensOf } = require('./pipeline-matrix.cjs');

// The THIRD pipelining hole (rev-C059 N1, controller note of 6 Nov 10:10): a refusal that Node decides at PARSE time (the checkExpectation
// answer for an unknown Expect) runs outside a per-socket lane unless it is routed through it. With TWO OR MORE legitimate requests
// before it, a design that answers it at once clears the queue, the earlier queued request is dropped, Node cannot flush the 417 queued
// behind it and the connection stays OPEN ([G][X] is fine, [G][G][X] is not; 128 sockets of 150 bytes pin a 128-connection cap). Here the
// shapes are [G][G][X], [G][G][G][X], [G][G][X][G] and [POST][G][X] for EVERY refusal that Node decides itself (an unknown Expect on a GET
// and on a POST with a body, a parse error, an oversized header, a request without Host, CONNECT, a request timeout), in HTTP/1.1 and in
// HTTP/1.0 (Node ignores Expect there, so the two Expect rows are HTTP/1.1 only; the HTTP/1.0 mutation BEHIND the refusal is the mixed
// framing), in this process and in a separate server process: the earlier requests are answered IN ORDER, then the typed refusal, then
// the connection ends, and nothing behind it runs. A structural test sends 128 sockets [G][G][X] at a 128-connection cap: afterwards
// every socket is closed and a legitimate GET is answered (counts, never a time bound).
const CHILD = path.join(__dirname, 'pipeline-child.cjs');
const SHAPES = Object.freeze([
  { name: 'G G R', parts: ['G', 'G', 'R'], earlier: ['G', 'G'] },
  { name: 'G G G R', parts: ['G', 'G', 'G', 'R'], earlier: ['G', 'G', 'G'] },
  { name: 'G G R G', parts: ['G', 'G', 'R', 'G'], earlier: ['G', 'G'] },
  { name: 'M6 G R', parts: ['M6', 'G', 'R'], earlier: ['M6', 'G'] }
]);
const timeoutRow = ROWS.find((row) => row.code === 'REQUEST_TIMEOUT');
// The apps: the rows share ONE plain app (the code of a row of refusal-rows.cjs names the app that the server process opens: this row has
// no options and no setup); the request timeout needs its own app with a 300 ms limit.
const PLAIN = 'AUTHENTICATION_REQUIRED';
const NODE_OWN = Object.freeze([
  { label: 'an unknown Expect on a GET', code: 'EXPECTATION_FAILED', status: 417, appCode: PLAIN, http10: false, request: ({ port }) => bare(port, 'GET', '/v1/state', ['Expect: nonsense']) },
  {
    label: 'an unknown Expect on a permitted POST with a body', code: 'EXPECTATION_FAILED', status: 417, appCode: PLAIN, http10: false,
    request: ({ port, tokens }) => post(port, 'pool.resize', [auth(tokens.operator), ...JSON_HEADERS, 'Expect: nonsense'], '{"size":7}')
  },
  { label: 'a parse error', code: 'REQUEST_MALFORMED', status: 400, appCode: PLAIN, http10: true, request: () => Buffer.from('GET\r\n\r\n') },
  { label: 'an oversized header', code: 'HEADERS_TOO_LARGE', status: 431, appCode: PLAIN, http10: true, request: ({ port }) => bare(port, 'GET', '/v1/state', [`X-Pad: ${'a'.repeat(20000)}`]) },
  { label: 'a request without Host', code: 'LOCAL_HOST_REQUIRED', status: 421, appCode: PLAIN, http10: true, request: () => Buffer.from('GET /v1/state HTTP/1.1\r\n\r\n') },
  { label: 'CONNECT', code: 'METHOD_NOT_ALLOWED', status: 405, appCode: PLAIN, http10: true, request: ({ port }) => Buffer.from(`CONNECT 127.0.0.1:${port} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`) },
  { label: 'a request that times out', code: 'REQUEST_TIMEOUT', status: 408, appCode: 'REQUEST_TIMEOUT', http10: true, request: timeoutRow.request }
]);
const GROUPS = [PLAIN, 'REQUEST_TIMEOUT'].map((appCode) => ({ appCode, rows: NODE_OWN.filter((row) => row.appCode === appCode) }));

// What each framing sends: HTTP/1.1 and HTTP/1.0 keep-alive every shape (HTTP/1.0 only for a row Node does not ignore there); the mixed
// framing (the refusal and what is before it HTTP/1.1, what is behind it HTTP/1.0) only the one shape that has something behind it. The
// timer-driven row costs 300 ms a cell, and the bytes behind a stalled request are its body: it gets the shapes with the refusal last.
const named = (...names) => SHAPES.filter((shape) => names.includes(shape.name));
const plan = (row) => (row.code === 'REQUEST_TIMEOUT'
  ? [[FRAMINGS[0], named('G G R', 'G G G R', 'M6 G R')], [FRAMINGS[1], named('G G R')]]
  : [[FRAMINGS[0], SHAPES], ...(row.http10 ? [[FRAMINGS[1], SHAPES]] : []), [FRAMINGS[2], named('G G R G')]]);

async function checkGroup(t, group, where, base) {
  for (const row of group.rows) {
    await t.test(`${row.label} behind two or three legitimate requests, ${where}`, { timeout: 50000 }, async () => {
      for (const [framing, shapes] of plan(row)) await checkCells({ ...base, row, framing, shapes });
    });
  }
}

const inThisProcess = (t) => Promise.all(GROUPS.map((group) => t.test(`the ${group.appCode} app, in this process`, { timeout: 52000 }, async (sub) => {
  const context = await startApp({ app: appFor(ROWS.find((entry) => entry.code === group.appCode)) });
  try {
    const state = async () => {
      const { revision, state: ledgerState } = context.app.snapshot();
      return { revision, size: ledgerState.pool.size, applied: appliedCount(context) };
    };
    await checkGroup(sub, group, 'in this process', { port: context.port, tokens: tokensOf(context), extra: {}, state });
  } finally {
    await context.close();
  }
})));

async function inAServerProcess(t) {
  const child = startChild({ heapMb: 128, hardMs: 65000, script: CHILD, args: [] });
  try {
    await child.receive('ready', 30000);
    await Promise.all(GROUPS.map((group) => t.test(`the ${group.appCode} app, in a separate server process`, { timeout: 52000 }, async (sub) => {
      const { port, tokens } = await child.ask({ type: 'open', code: group.appCode }, `opened:${group.appCode}`, 30000);
      const state = async () => {
        const { revision, size, applied } = await child.ask({ type: 'state', code: group.appCode }, `state:${group.appCode}`, 30000);
        return { revision, size, applied };
      };
      await checkGroup(sub, group, 'in a separate server process', { port, tokens, extra: {}, state });
    })));
  } finally {
    child.stop();
  }
}

// 128 sockets, each sending two legitimate requests and an unknown Expect (and, for every second socket, a parse error) in ONE write, at a
// 128-connection cap: a connection that the server leaves open would pin the cap and lock a legitimate client out. Counted: every socket is
// closed BY THE SERVER (the clients never end first), the server holds no connection, a legitimate GET is answered. The idle timeout is set
// to ten minutes so that the server's own idle drop (5 s by default) cannot close a connection that the refusal path left open.
const BURST = 128;
async function burst() {
  const context = await startApp({ app: { limits: { connections: BURST, idleMs: 600000 } } });
  const sockets = [];
  try {
    const get = bare(context.port, 'GET', '/v1/state');
    const expect = bare(context.port, 'GET', '/v1/state', ['Expect: nonsense']);
    const closed = Array.from({ length: BURST }, (unused, index) => new Promise((resolve) => {
      const socket = net.connect({ host: '127.0.0.1', port: context.port, allowHalfOpen: true });
      const seen = [];
      sockets.push(socket);
      socket.on('data', (chunk) => { for (const match of chunk.toString('latin1').matchAll(/HTTP\/1\.1 (\d+)/g)) seen.push(Number(match[1])); });
      socket.on('error', () => {});
      // A client that allows a half-open connection only sees the server's end as 'end' (it never ends first here).
      const ended = () => resolve(seen);
      socket.once('end', ended);
      socket.once('close', ended);
      socket.write(Buffer.concat([get, get, index % 2 === 0 ? expect : Buffer.from('GET\r\n\r\n')]));
    }));
    const answers = await within(Promise.all(closed), `all ${BURST} sockets are closed by the server`, 40000);
    assert.equal(answers.length, BURST);
    answers.forEach((seen, index) => assert.ok(isSubsequence(seen, [200, 200, index % 2 === 0 ? 417 : 400]), `socket ${index} read ${seen}: only the answers it was owed, in order`));
    const open = await within((async () => {
      for (;;) {
        const count = await new Promise((resolve) => context.app.server.getConnections((error, number) => resolve(error ? -1 : number)));
        if (count === 0) return count;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    })(), 'the server holds no connection after the burst', 20000);
    assert.equal(open, 0, 'the server holds no connection after the burst');
    const response = await fetch(`${context.origin}/v1/state`, { signal: AbortSignal.timeout(20000) });
    assert.equal(response.status, 200, 'a legitimate client is still served');
  } finally {
    sockets.forEach((socket) => socket.destroy());
    await context.close();
  }
}

// The three run at the same time (F9c): the timer-driven rows cost 300 ms a cell, and the sum would not fit a loaded machine.
test('a refusal Node decides itself after two or three legitimate requests ends the connection in order, and 128 of them do not pin the connection cap', { concurrency: 3, timeout: 55000 }, async (t) => {
  await Promise.all([
    t.test('a refusal Node decides itself after two or three legitimate requests ends the connection in order: in this process', { concurrency: 2 }, inThisProcess),
    t.test('a refusal Node decides itself after two or three legitimate requests ends the connection in order: in a separate server process', { concurrency: 2 }, inAServerProcess),
    t.test('128 sockets that each send two legitimate requests and a Node-own refusal are all closed and do not pin the connection cap', { timeout: 50000 }, burst)
  ]);
});
