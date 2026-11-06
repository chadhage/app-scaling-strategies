'use strict';

// Test tooling, not production code: the pipelining matrix of review finding F1b. One raw TCP socket sends several requests, the
// refusal R of a row of refusal-rows.cjs somewhere in the middle. Whatever stands behind R must never run, whatever stands before it
// is answered once, and the server ends the connection. G is a GET of the state, M6 and M7 are permitted pool.resize commands of the
// operator (the effect is visible: pool size and revision), and a shape with a cut sends its bytes in two TCP writes.
const net = require('node:net');
const { load } = require('./helpers.cjs');
const { parseAnswers, bare } = require('./raw-http.cjs');
const { auth, post, JSON_HEADERS } = require('./refusal-rows.cjs');

const contract = load('contract.js');
const { defaultHandlers } = load('handlers.cjs');

const SHAPES = Object.freeze([
  { name: 'R M7', parts: ['R', 'M7'], earlier: [] },
  { name: 'G R M7', parts: ['G', 'R', 'M7'], earlier: ['G'] },
  { name: 'M6 R M7', parts: ['M6', 'R', 'M7'], earlier: ['M6'] },
  { name: 'G G R M7', parts: ['G', 'G', 'R', 'M7'], earlier: ['G', 'G'] },
  { name: 'R | M7', parts: ['R', 'M7'], cut: 1, earlier: [] },
  { name: 'G R | M7', parts: ['G', 'R', 'M7'], cut: 2, earlier: ['G'] }
]);

// The framing of the request line (rev-C017 F12): Node applies maxRequestsPerSocket to HTTP/1.1 only, so nothing here may depend on it.
// 'HTTP/1.0 keep-alive' frames EVERY request as HTTP/1.0 with Connection: keep-alive (a legal pipeline); 'refusal then HTTP/1.0' keeps
// the refusal and what stands before it HTTP/1.1 and frames what stands behind the refusal as plain HTTP/1.0, which Node answers with a
// close. Node ignores Expect in HTTP/1.0 (the unknown-Expect row is no refusal there) and rejects a chunked body in HTTP/1.0 as a parse
// error (REQUEST_MALFORMED, which has its own row).
const FRAMINGS = Object.freeze([
  { name: 'HTTP/1.1', version: null },
  { name: 'HTTP/1.0 keep-alive', version: 'HTTP/1.0', keepAlive: true, skips: ['EXPECTATION_FAILED', 'UNEXPECTED_BODY'] },
  { name: 'refusal then HTTP/1.0', version: 'HTTP/1.0', keepAlive: false, behindOnly: true }
]);

function reframe(bytes, framing) {
  const text = bytes.toString('latin1');
  const line = /^([A-Z]+ \S+) HTTP\/1\.1\r\n/.exec(text);
  if (!line) return bytes;
  const extra = framing.keepAlive ? 'Connection: keep-alive\r\n' : '';
  return Buffer.from(text.replace(line[0], () => `${line[1]} ${framing.version}\r\n${extra}`), 'latin1');
}

// Three rows replace the handlers or the validator of the whole app, which would refuse the permitted command too: keep it working.
const KEEP_PERMITTED = {
  COMMAND_NOT_IMPLEMENTED: () => ({ handlers: { 'pool.resize': defaultHandlers['pool.resize'] } }),
  COMMAND_FAILED: () => ({ handlers: { ...defaultHandlers, 'run.create': () => { throw new Error('synthetic failure'); } } }),
  INTERNAL_ERROR: () => ({
    validateInput(name, body) {
      if (name === 'run.create') throw new Error('synthetic failure');
      return contract.validateInput(name, body);
    }
  })
};
const appFor = (row) => (KEEP_PERMITTED[row.code] ? KEEP_PERMITTED[row.code]() : row.app);

const requestBytes = (name, { port, tokens, refusal }) => {
  if (name === 'R') return refusal;
  if (name === 'G') return bare(port, 'GET', '/v1/state');
  const size = Number(name.slice(1));
  return post(port, 'pool.resize', [auth(tokens.operator), ...JSON_HEADERS], JSON.stringify({ size }));
};

// The writes of one shape in one framing: all its requests in one TCP write, or cut after the given number of requests.
function writesOf(shape, context, framing = FRAMINGS[0]) {
  const refusalAt = shape.parts.indexOf('R');
  const buffers = shape.parts.map((name, index) => {
    const bytes = requestBytes(name, context);
    return framing.version && (!framing.behindOnly || index > refusalAt) ? reframe(bytes, framing) : bytes;
  });
  return shape.cut ? [Buffer.concat(buffers.slice(0, shape.cut)), Buffer.concat(buffers.slice(shape.cut))] : [Buffer.concat(buffers)];
}

// Writes the buffers one after the other (gapMs apart) and collects every answer until the server ends the connection, no byte arrives
// for settleMs, or waitMs pass. A write into a connection the server already ended is ignored. A correct server ends the connection at
// once after its refusal, so these windows only matter for a broken one (the RED) and only as generous deadlines: a server that is
// slowed down by a loaded machine (a 0.3 s request timeout, a descheduled process) must still be waited for.
function exchangeWrites(port, writes, { gapMs = 25, waitMs = 20000, settleMs = 5000 } = {}) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port, allowHalfOpen: true });
    const chunks = [];
    let closedByServer = false;
    let settle = null;
    const finish = () => {
      clearTimeout(timer);
      clearTimeout(settle);
      socket.destroy();
      resolve({ answers: parseAnswers(Buffer.concat(chunks)), closedByServer });
    };
    const timer = setTimeout(finish, waitMs);
    const ended = () => { closedByServer = true; finish(); };
    socket.on('data', (chunk) => {
      chunks.push(chunk);
      clearTimeout(settle);
      settle = setTimeout(finish, settleMs);
    });
    socket.on('error', ended);
    socket.on('end', ended);
    socket.on('close', ended);
    socket.write(writes[0]);
    writes.slice(1).forEach((bytes, index) => setTimeout(() => { if (!socket.destroyed) socket.write(bytes); }, gapMs * (index + 1)));
  });
}

// Selects cells of the matrix for a mutation run: C009_MATRIX_ONLY is a regular expression over "<row code> [<shape>] <framing>" (the
// process matrix tests "<row code> [R M7] HTTP/1.1" once per row); every other run executes all cells.
const ONLY = process.env.C009_MATRIX_ONLY ? new RegExp(process.env.C009_MATRIX_ONLY) : null;
const wanted = (label) => ONLY === null || ONLY.test(label);

const mutations = (shape) => shape.earlier.filter((name) => name.startsWith('M')).length;
const appliedCount = (context) => context.app.auditLog().filter((entry) => entry.outcome === 'applied').length;

// Windows resets a connection that is closed while it still has unread data in flight, and a reset discards the answers the client has
// not read yet. That happens after a second TCP write (a cut shape), after the 20 KB header of HEADERS_TOO_LARGE (more than one read) and
// when a timer ends a request whose body is still arriving (REQUEST_TIMEOUT). For those cells the answers are only required to be
// what the client could still read: a subsequence of the expected ones, with nothing extra and nothing out of order (a request that ran
// behind the refusal would add an answer); the state, the revision and the audit log decide.
const RESET_MAY_DISCARD = new Set(['HEADERS_TOO_LARGE', 'REQUEST_TIMEOUT']);
const resetMayDiscard = (row, shape) => Boolean(shape.cut) || RESET_MAY_DISCARD.has(row.code);
const isSubsequence = (actual, expected) => {
  let at = 0;
  return actual.every((status) => {
    at = expected.indexOf(status, at);
    if (at === -1) return false;
    at += 1;
    return true;
  });
};

module.exports = Object.freeze({ SHAPES, FRAMINGS, appFor, writesOf, exchangeWrites, mutations, appliedCount, wanted, resetMayDiscard, isSubsequence });
