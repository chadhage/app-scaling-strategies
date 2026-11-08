'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { guardOperation } = require(path.join(__dirname, '..', 'C001', 'contract-guard.js'));
const framing = require('./framing.cjs');
const { runScript } = require('./conversation.cjs');
const { createHub } = require('./stream.cjs');

const MAX_CLIENT_MESSAGE_BYTES = 4096;
const MAX_OUTBOUND_BYTES = 64 * 1024;
const MAX_CONNECTIONS = 128;
// Every resource a client can make this fixture hold is bounded here: the largest message and its fragments, the output
// a client may leave unread, and the connections. Sessions are bounded by the stream hub and are never released.
const limits = Object.freeze({
  maxClientMessageBytes: MAX_CLIENT_MESSAGE_BYTES, maxFragmentsPerMessage: framing.DEFAULT_MAX_FRAGMENTS,
  maxOutboundBytes: MAX_OUTBOUND_BYTES, maxConnections: MAX_CONNECTIONS
});
// A 426 must name the protocol it asks for (RFC 9110 15.5.22). Every refusal also says Connection: close, so the upgrade
// connection option is not added: nothing may keep this connection or forward the header.
const UPGRADE_REQUIRED_HEADERS = Object.freeze({ Upgrade: 'websocket' });
const scope = Object.freeze({
  cardId: 'C026', businessData: 'synthetic', transport: '127.0.0.1 HTTP and RFC 6455 WebSocket only',
  testRuntime: process.version, approvedProductionTarget: 'Node.js 24 LTS / Express / App Service Linux',
  productionRuntimeValidated: false, identityVerified: false, nativeTargetQualified: false,
  controlApiImplemented: false, durableStoreImplemented: false, liveAzureRuns: 0, authorizedCloudSpend: 0,
  browserWebSocketObserved: false, transcriptProducedByServerSideConversation: true
});
const assets = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/page.js': ['page.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8']
});
const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-C026-Scope': 'synthetic-loopback-only'
});
const openSockets = new WeakMap();
// A connection on which a refusal was decided. Node parses every request the peer pipelined in one read and emits each of them
// (an upgrade included) before the first answer has finished, so nothing behind a refusal may run. The mark is made at decision time
// with request.socket: response.socket is null for an answer that is queued behind another one.
const closing = new WeakSet();
// What a marked connection may still make the server read. Everything behind the mark is dropped without an answer, and a dropped request
// writes nothing, so Node never sees output pile up behind an unfinished answer and never pauses the connection: it would keep parsing and
// holding one request and one response object (about 2 KB) per pipelined request for as long as the peer sends. The first
// MAX_DROPPED_REQUESTS are dropped quietly, so that the answers queued before the mark and the refusal itself are still flushed; the next one
// destroys the connection. The minimum is the 18-byte GET / HTTP/1.1 without Host; the review observed 3,639 request events per 64 KiB read.
// An all-minimal aligned read fits 3,640 requests, or one marking request plus 3,639 more.
// The accepted review observed about 6 MB per socket, about 0.8 GB extrapolated at 128 connections, and a 12 to 15 s stall at 32 sockets.
// These observations are not memory or latency guarantees. The destroy ends further reads; objects are released when the socket closes.
const MAX_DROPPED_REQUESTS = 16;
const dropped = new WeakMap();
// Parse errors that Node reports through 'clientError' (it would write its own bare 400, 408 or 431): the typed refusal for each.
const MALFORMED_REQUEST = Object.freeze([400, 'MALFORMED_REQUEST', 'The request could not be parsed.']);
const CLIENT_ERRORS = new Map([
  ['HPE_HEADER_OVERFLOW', [431, 'HEADERS_TOO_LARGE', 'The request head is larger than this fixture accepts.']],
  ['ERR_HTTP_REQUEST_TIMEOUT', [408, 'REQUEST_TIMEOUT', 'The request was not completed in time.']]
]);

function errorBody(code, message) {
  return JSON.stringify({ error: { code, message }, businessData: 'synthetic', localOnly: true });
}

// Every refusal closes the connection once the answer is flushed: the peer may still be streaming a body nobody reads.
function refuseSocket(socket, status, code, message, extra = {}) {
  const body = errorBody(code, message);
  const headers = {
    ...SECURITY_HEADERS, Connection: 'close', ...extra,
    'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body)
  };
  const lines = Object.entries(headers).map(([name, value]) => `${name}: ${value}`);
  socket.write(`HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\n${lines.join('\r\n')}\r\n\r\n${body}`);
  socket.destroySoon();
}

function inspectUpgrade(request, port) {
  const host = `127.0.0.1:${port}`;
  const origin = `http://${host}`;
  if (request.socket.remoteAddress !== '127.0.0.1' || request.headers.host !== host) {
    return { status: 421, code: 'LOCAL_HOST_REQUIRED', message: 'Only the actual 127.0.0.1 listener is supported.' };
  }
  if (request.headers.origin !== undefined && request.headers.origin !== origin) {
    return { status: 403, code: 'CROSS_ORIGIN_DENIED', message: 'Only this fixture\'s own loopback origin may upgrade.' };
  }
  let url;
  try {
    url = new URL(request.url, origin);
  } catch {
    return { status: 400, code: 'INVALID_URL', message: 'The local URL is malformed.' };
  }
  if (url.origin !== origin) return { status: 400, code: 'INVALID_URL', message: 'An explicit local URL is required.' };
  if (url.pathname !== '/stream') return { status: 404, code: 'NOT_FOUND', message: 'The only WebSocket route is /stream.' };
  if (url.search || url.hash || /[?#]/.test(request.url)) return { status: 400, code: 'INVALID_QUERY', message: 'The stream route accepts no query or fragment.' };
  if (request.method !== 'GET') return { status: 405, code: 'METHOD_NOT_ALLOWED', message: 'A WebSocket upgrade is a GET.' };
  if (request.headers['transfer-encoding'] || Number(request.headers['content-length'] || 0) > 0) {
    return { status: 400, code: 'UNEXPECTED_BODY', message: 'A WebSocket upgrade must not contain a body.' };
  }
  const connection = String(request.headers.connection ?? '').toLowerCase().split(',').map((token) => token.trim());
  if (String(request.headers.upgrade ?? '').toLowerCase() !== 'websocket' || !connection.includes('upgrade')) {
    return { status: 400, code: 'UPGRADE_HEADERS_REQUIRED', message: 'Upgrade: websocket and Connection: Upgrade are required.' };
  }
  if (request.headers['sec-websocket-version'] !== '13') {
    return {
      status: 426, code: 'UNSUPPORTED_VERSION', message: 'Only WebSocket version 13 is supported.',
      extra: { 'Sec-WebSocket-Version': '13', ...UPGRADE_REQUIRED_HEADERS }
    };
  }
  try {
    return { accept: framing.acceptKey(request.headers['sec-websocket-key']) };
  } catch {
    return { status: 400, code: 'INVALID_KEY', message: 'Sec-WebSocket-Key must be the base64 form of 16 bytes.' };
  }
}

function serveSocket(socket, head, hub, accept, onLimit) {
  socket.write([
    'HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`, 'X-C026-Scope: synthetic-loopback-only', '', ''
  ].join('\r\n'));
  socket.setNoDelay(true);
  const parser = framing.createParser({ requireMask: true, maxMessageBytes: MAX_CLIENT_MESSAGE_BYTES, maxFragments: framing.DEFAULT_MAX_FRAGMENTS });
  let closing = false;
  // A client that stops reading must not make the server queue its replies forever: past the bound it is dropped (its
  // session stays resumable) and the limit is announced as a typed event. A close frame could not reach it anyway.
  const write = (bytes) => {
    if (socket.destroyed || !socket.writable) return;
    if (socket.writableLength + bytes.length > MAX_OUTBOUND_BYTES) {
      closing = true;
      connection.disconnected();
      onLimit({ code: 'OUTBOUND_BACKLOG', limit: MAX_OUTBOUND_BYTES });
      socket.destroy();
      return;
    }
    socket.write(bytes);
  };
  const connection = hub.connect({
    send: (message) => write(framing.encodeFrame({ opcode: framing.OPCODES.text, payload: JSON.stringify(message) })),
    close: (code, reason) => {
      closing = true;
      write(framing.encodeClose(code, reason));
      socket.end();
    }
  });

  function closeWith(code, reason) {
    if (closing) return;
    closing = true;
    connection.disconnected();
    write(framing.encodeClose(code, reason));
    socket.end();
  }

  function handle(message) {
    if (message.type === 'text') connection.receive(message.text);
    else if (message.type === 'binary') closeWith(1003, 'BINARY_UNSUPPORTED');
    else if (message.type === 'ping') write(framing.encodeFrame({ opcode: framing.OPCODES.pong, payload: message.data }));
    else if (message.type === 'close') closeWith(message.code === 1005 ? 1000 : message.code, '');
  }

  function feed(chunk) {
    try {
      for (const message of parser.push(chunk)) {
        if (closing) return;
        handle(message);
      }
    } catch (error) {
      if (error instanceof framing.FramingError) closeWith(error.closeCode, error.code);
      else closeWith(1011, 'INTERNAL_ERROR');
    }
  }

  socket.on('data', feed);
  // http sockets allow half-open connections, so a peer that just closes its side must be answered or it never closes
  socket.on('end', () => {
    connection.disconnected();
    socket.end();
  });
  socket.on('close', () => connection.disconnected());
  if (head.length > 0) feed(head);
}

async function produceLocalTranscript() {
  const instance = createLocalServer({ hub: createHub({ total: 6, window: 3 }), transcript: null });
  await new Promise((resolve, reject) => {
    instance.once('error', reject);
    instance.listen(0, '127.0.0.1', resolve);
  });
  try {
    const result = await runScript(`http://127.0.0.1:${instance.address().port}`);
    return {
      cardId: 'C026', kind: 'server-side-websocket-transcript', businessData: 'synthetic',
      note: 'Produced by a real WebSocket conversation between this server and a node:net client; session ids are aliased.',
      ...result
    };
  } finally {
    await closeServer(instance);
  }
}

function createLocalServer({ hub = createHub(), transcript = produceLocalTranscript } = {}) {
  // Whatever was pipelined behind a mark is dropped without effect and without an answer, and counted (see MAX_DROPPED_REQUESTS). Within the
  // budget nothing is destroyed: the refusal said Connection: close, so Node ends the connection once that answer (queued behind earlier ones)
  // has been flushed. The request that exceeds the budget destroys the connection and announces the limit once.
  function dropRequest(socket) {
    if (socket.destroyed) return;
    const count = (dropped.get(socket) ?? 0) + 1;
    dropped.set(socket, count);
    if (count <= MAX_DROPPED_REQUESTS) return;
    server.emit('limit', { code: 'DROPPED_REQUEST_BACKLOG', limit: MAX_DROPPED_REQUESTS });
    socket.destroy();
  }
  // The one request path. Node calls it for every request, and for the two it would otherwise answer itself: Expect: 100-continue
  // and an unknown Expect header (expectationFailed), so that every refusal of the plain routes is decided, marked and closed here.
  function handle(request, response, expectationFailed = false) {
    if (closing.has(request.socket)) {
      dropRequest(request.socket);
      return;
    }
    function send(status, value, type = 'application/json; charset=utf-8', extra = {}) {
      const body = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
      response.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type, 'Content-Length': body.length, ...extra });
      // Node forces Connection: close on the answer to a request that expects 100 Continue and gets none (the peer may still be sending a
      // body nobody reads): a request or an upgrade pipelined behind such an answer must not run either.
      if (!response.shouldKeepAlive) closing.add(request.socket);
      response.end(body);
    }
    // Every refusal says Connection: close, so Node closes the socket once the answer is flushed and stops parsing a body
    // the fixture refused to read (an endless chunked body would otherwise be read for as long as the peer sends it).
    function fail(status, code, message, extra = {}) {
      closing.add(request.socket);
      send(status, { error: { code, message }, businessData: 'synthetic', localOnly: true }, undefined, { Connection: 'close', ...extra });
    }
    try {
      if (expectationFailed) return fail(417, 'EXPECTATION_FAILED', 'This fixture supports no Expect header.');
      const host = `127.0.0.1:${server.address().port}`;
      const origin = `http://${host}`;
      if (request.socket.remoteAddress !== '127.0.0.1' || request.headers.host !== host) {
        return fail(421, 'LOCAL_HOST_REQUIRED', 'Only the actual 127.0.0.1 listener is supported.');
      }
      if (request.headers.origin && request.headers.origin !== origin) {
        return fail(403, 'CROSS_ORIGIN_DENIED', 'This synthetic fixture supports only its own loopback origin.');
      }
      if (request.method !== 'GET') return fail(405, 'METHOD_NOT_ALLOWED', 'Only read-only GET is supported.');
      if (request.headers['transfer-encoding'] || Number(request.headers['content-length'] || 0) > 0) {
        return fail(400, 'UNEXPECTED_BODY', 'GET requests must not contain a body.');
      }
      const url = new URL(request.url, origin);
      if (url.origin !== origin || url.hash) return fail(400, 'INVALID_URL', 'An explicit local URL without a fragment is required.');
      if (url.pathname === '/stream') return fail(426, 'UPGRADE_REQUIRED', 'Open /stream with a WebSocket upgrade (RFC 6455).', UPGRADE_REQUIRED_HEADERS);
      if (url.pathname === '/scope.json' || url.pathname === '/transcript.json' || Object.hasOwn(assets, url.pathname)) {
        if (url.search) return fail(400, 'INVALID_QUERY', 'This route accepts no query parameters.');
      }
      if (url.pathname === '/scope.json') return send(200, scope);
      if (url.pathname === '/transcript.json') {
        if (transcript === null) return fail(404, 'NOT_FOUND', 'This instance does not produce transcripts.');
        // The answer comes after an await, so nothing pipelined behind it can be ordered against it: the connection is marked now
        // and closed after the answer, whether it succeeds or fails.
        closing.add(request.socket);
        transcript().then((value) => send(200, value, undefined, { Connection: 'close' }), () => {
          fail(500, 'TRANSCRIPT_UNAVAILABLE', 'The local conversation failed; no successful observation was made.');
        });
        return undefined;
      }
      if (Object.hasOwn(assets, url.pathname)) {
        const [file, type] = assets[url.pathname];
        return send(200, fs.readFileSync(path.join(__dirname, file)), type);
      }
      return fail(404, 'NOT_FOUND', 'No local fixture or inspection asset has that path.');
    } catch (error) {
      if (error instanceof TypeError && error.code === 'ERR_INVALID_URL') return fail(400, 'INVALID_URL', 'The local URL is malformed.');
      return fail(500, 'FIXTURE_UNAVAILABLE', 'The local fixture is unavailable; no successful observation was made.');
    }
  }
  // Node answers a request without Host with its own bare 400 and never calls the handler; with requireHostHeader off the handler
  // refuses it (421) like every other foreign Host.
  const server = http.createServer({ requireHostHeader: false }, (request, response) => handle(request, response));
  // Node also answers these itself: it writes 100 Continue before the handler (checkContinue), answers an unknown Expect header with
  // its own 417 and no handler (checkExpectation), and answers a parse error with a bare 400, 408 or 431 (clientError).
  server.on('checkContinue', (request, response) => handle(request, response));
  server.on('checkExpectation', (request, response) => handle(request, response, true));
  server.on('clientError', (error, socket) => {
    // A socket that is gone, or that already carried an answer, gets none: a second answer would corrupt the first.
    if (!socket.writable || socket.bytesWritten > 0) { socket.destroy(); return; }
    refuseSocket(socket, ...(CLIENT_ERRORS.get(error.code) ?? MALFORMED_REQUEST));
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 1000;
  server.maxConnections = MAX_CONNECTIONS;
  // Every accepted socket is tracked from the first byte, including those the http server detaches (upgrades, refusals).
  const sockets = new Set();
  openSockets.set(server, sockets);
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  Object.defineProperty(server, 'hub', { value: hub });
  server.on('upgrade', (request, socket, head) => {
    // An upgraded socket leaves the http server's own error handling, so every path needs this one.
    socket.on('error', () => socket.destroy());
    // Node emits upgrade for an upgrade request pipelined behind a refusal: the refusal said Connection: close, so the upgrade is
    // dropped here and Node ends the connection once that answer is flushed (destroying now could cut the refusal off).
    if (closing.has(socket)) return;
    const verdict = inspectUpgrade(request, server.address().port);
    if (verdict.accept === undefined) {
      refuseSocket(socket, verdict.status, verdict.code, verdict.message, verdict.extra);
      return;
    }
    serveSocket(socket, head, hub, verdict.accept, (event) => server.emit('limit', event));
  });
  return server;
}

function closeServer(server) {
  return new Promise((resolve) => {
    for (const socket of openSockets.get(server) ?? []) socket.destroy();
    server.closeAllConnections();
    server.close(() => resolve());
  });
}

async function startLocal({ readLedger = () => fs.readFileSync(path.join(__dirname, '..', '..', '.docs', 'wiki', 'flow-state.json'), 'utf8') } = {}) {
  let approval;
  try {
    approval = JSON.parse(readLedger()).approvals?.C001;
  } catch {
    throw new Error('C001 current consent is unavailable; the local listener was not started.');
  }
  const permission = await guardOperation('local.probe', approval);
  if (!permission.allowed) {
    throw new Error(`C001 local consent denied: ${permission.reasons.map((reason) => reason.code).join(', ')}`);
  }
  const server = createLocalServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

function closeOnSignal(handler) {
  process.once('SIGINT', handler);
  process.once('SIGTERM', handler);
}

async function runCli(argv, { start = startLocal, log = console.log, error = console.error, onSignal = closeOnSignal } = {}) {
  if (argv.length !== 0) {
    error('C026 accepts no host, port, stream size, identity, or deployment overrides.');
    return 1;
  }
  try {
    const server = await start();
    log(JSON.stringify({
      event: 'C026-local-listening', pid: process.pid, origin: `http://127.0.0.1:${server.address().port}`, scope
    }));
    onSignal(() => closeServer(server));
    return 0;
  } catch (failure) {
    error(failure.message);
    return 1;
  }
}

if (require.main === module) {
  runCli(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}

module.exports = Object.freeze({ scope, limits, createLocalServer, closeServer, startLocal, runCli, produceLocalTranscript });
