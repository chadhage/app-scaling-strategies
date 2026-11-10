'use strict';

// Test tooling, not production code (U039 fix 4): the rows of the INCOMPLETE-BODY tests. A client error that Node reports for the request it
// is still receiving (a bad chunk size, a missing CRLF after chunk data, a Content-Length body cut by the request timeout or by the client's FIN)
// must get its typed answer and a closed connection: the refusal waits only for the requests BEFORE that request, never for its own lane entry.
// `peer` is a raw client that writes once, optionally half-closes, and then only listens: it never closes first, so a closed connection and a
// server-side connection count of zero are the work of the server.
const net = require('node:net');
const lib = require('./u039-lib.cjs');
const { reading } = require('./u039-rows.cjs');

// Node treats requestMs and headersMs as ONE pair: when the headers timeout is the larger of the two it swaps them, so a short request timeout needs a
// short headers timeout too (the head of these requests arrives in one write; the timers are polled every 50 ms). Node also counts the time from the moment
// a connection is accepted, so a machine that stalls longer than this bound before it reads the first bytes times the connection out: only the one row kind
// that needs the request timeout (a body that stops) uses these bounds, and `trial` repeats such a row when it sees that stall (see u039-body.test.cjs).
const TIMER_BOUNDS = Object.freeze({ ...lib.QUIET, requestMs: 1000, headersMs: 1000, checkMs: 50 });
const EXPECT = 'Expect: 100-continue\r\n';
const head = (host, version, extra, expect) => `POST /v1/steps HTTP/${version}\r\nHost: ${host}\r\nContent-Type: application/json\r\n${expect ? EXPECT : ''}${extra}\r\n`;

// status: what the typed refusal says (408 for the request timeout, otherwise 400); fin: the client half-closes after its write; timer: needs TIMER_BOUNDS.
const BODY_KINDS = {
  'bad-chunk-size': { status: 400, fin: false, timer: false, make: (host, version, expect) => `${head(host, version, 'Transfer-Encoding: chunked\r\n', expect)}zz\r\n` },
  'short-body-silence': { status: 408, fin: false, timer: true, make: (host, version, expect) => `${head(host, version, 'Content-Length: 100\r\n', expect)}0123456789` },
  'short-body-fin': { status: 400, fin: true, timer: false, make: (host, version, expect) => `${head(host, version, 'Content-Length: 100\r\n', expect)}0123456789` },
  'missing-crlf-after-chunk': { status: 400, fin: false, timer: false, make: (host, version, expect) => `${head(host, version, 'Transfer-Encoding: chunked\r\n', expect)}5\r\nhelloXY` },
  'chunk-cut-fin': { status: 400, fin: true, timer: false, make: (host, version, expect) => `${head(host, version, 'Transfer-Encoding: chunked\r\n', expect)}5\r\nhel` },
};
// U056's approved narrowing is HTTP/1.1 without Expect. These are separate rows because Node does not emit the ordinary immediate body error for them.
const upgradeHead = (host, framing) => head(host, '1.1', `Connection: Upgrade\r\nUpgrade: websocket\r\n${framing}\r\n`, false);
const UPGRADE_BODY_KINDS = {
  'upgrade-bad-chunk-size': { status: 408, fin: false, timer: true, make: (host) => `${upgradeHead(host, 'Transfer-Encoding: chunked')}zz\r\n` },
  'upgrade-short-body-fin': { status: null, fin: true, timer: false, make: (host) => `${upgradeHead(host, 'Content-Length: 100')}0123456789` },
};
// G = a complete legitimate read before the failing request; X = the failing request.
const BODY_SHAPES = { X: 0, GX: 1, GGX: 2 };
// h11: everything HTTP/1.1 (also after Expect: 100-continue). h10: everything HTTP/1.0 asking to keep alive (Node ignores Expect there).
const BODY_FRAMINGS = [{ id: 'h11', version: '1.1', expects: [false, true] }, { id: 'h10', version: '1.0', expects: [false] }];
const bodyName = (target, framing, shape, kind, expect) => `incomplete ${target} ${framing} [${shape}] ${kind}${expect ? ' after Expect: 100-continue' : ''}: typed refusal after the earlier answers, then the connection is closed and no slot is kept`;
const burstName = (target) => `a burst of 128 sockets that each send a bad chunk size (${target}) leaves no connection open, and a legitimate GET is answered (the connection cap is not pinned)`;
const leaversName = (target) => `8 clients that send a partial body and then close their side (${target}) leave no connection open: an aborted upload does not keep a slot`;

// The bytes of one row: `earlier` complete GETs, then the failing request, all in the framing of the row.
function bodyBytes(host, { kind, earlier, version, expect }) {
  const legit = (raw) => (version === '1.0' ? lib.asVersion(raw, '1.0', true) : raw);
  return Buffer.concat([...Array.from({ length: earlier }, () => legit(reading(host))), Buffer.from(BODY_KINDS[kind].make(host, version, expect), 'latin1')]);
}

// A client that writes `bytes` once (half-closing when `fin`) and listens. `done` resolves when the server ended the connection, or after `closeMs` without any
// activity (a liveness guard for a broken server, never the thing asserted). The caller destroys the socket AFTER it has looked at the server.
function peer(port, bytes, { fin = false, closeMs = lib.CLOSE_MS } = {}) {
  const socket = net.connect({ port, host: '127.0.0.1', allowHalfOpen: true });
  const record = { socket, chunks: [], closed: false, error: null, active: Date.now() };
  socket.setNoDelay(true);
  socket.on('data', (chunk) => { record.chunks.push(chunk); record.active = Date.now(); });
  socket.on('end', () => { record.closed = true; });
  socket.on('close', () => { record.closed = true; });
  socket.on('error', (failure) => { record.error = failure.code ?? String(failure); record.closed = true; });
  socket.on('connect', () => { socket.write(bytes); if (fin) socket.end(); record.active = Date.now(); });
  record.done = new Promise((resolve) => {
    const timer = setInterval(() => {
      if (!record.closed && Date.now() - record.active <= closeMs) return;
      clearInterval(timer);
      resolve(record);
    }, 15);
  });
  // The answers the client received; an interim 100 Continue is not an answer.
  record.answers = () => lib.parseResponses(Buffer.concat(record.chunks)).filter((item) => item.status !== 100);
  record.destroy = () => socket.destroy();
  return record;
}

const statusesOf = (answers) => answers.map((item) => item.status ?? (item.partial === undefined ? 'garbage' : 'partial'));
// The server holds no connection any more: a bounded poll of a COUNT (the bound is a liveness guard, never asserted).
const noConnections = (instance, label = 'the server holds no connection', ms) => lib.until(async () => (await instance.connections()) === 0, label, ms).then(() => true, () => false);

module.exports = { BODY_FRAMINGS, BODY_KINDS, BODY_SHAPES, EXPECT, TIMER_BOUNDS, UPGRADE_BODY_KINDS, bodyBytes, bodyName, burstName, leaversName, noConnections, peer, statusesOf };
