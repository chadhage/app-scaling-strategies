'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { guardOperation } = require(path.join(__dirname, '..', 'C001', 'contract-guard.js'));
const framing = require('./framing.cjs');
const { runScript } = require('./conversation.cjs');
const { createHub } = require('./stream.cjs');

const MAX_CLIENT_MESSAGE_BYTES = 4096;
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

function errorBody(code, message) {
  return JSON.stringify({ error: { code, message }, businessData: 'synthetic', localOnly: true });
}

function refuseUpgrade(socket, status, code, message, extra = {}) {
  const body = errorBody(code, message);
  const headers = {
    ...SECURITY_HEADERS, ...extra, Connection: 'close',
    'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body)
  };
  const lines = Object.entries(headers).map(([name, value]) => `${name}: ${value}`);
  socket.end(`HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\n${lines.join('\r\n')}\r\n\r\n${body}`);
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
  if (url.pathname !== '/stream') return { status: 404, code: 'NOT_FOUND', message: 'The only WebSocket route is /stream.' };
  if (url.search || url.hash) return { status: 400, code: 'INVALID_QUERY', message: 'The stream route accepts no query or fragment.' };
  if (request.method !== 'GET') return { status: 405, code: 'METHOD_NOT_ALLOWED', message: 'A WebSocket upgrade is a GET.' };
  const connection = String(request.headers.connection ?? '').toLowerCase().split(',').map((token) => token.trim());
  if (String(request.headers.upgrade ?? '').toLowerCase() !== 'websocket' || !connection.includes('upgrade')) {
    return { status: 400, code: 'UPGRADE_HEADERS_REQUIRED', message: 'Upgrade: websocket and Connection: Upgrade are required.' };
  }
  if (request.headers['sec-websocket-version'] !== '13') {
    return {
      status: 426, code: 'UNSUPPORTED_VERSION', message: 'Only WebSocket version 13 is supported.',
      extra: { 'Sec-WebSocket-Version': '13' }
    };
  }
  try {
    return { accept: framing.acceptKey(request.headers['sec-websocket-key']) };
  } catch {
    return { status: 400, code: 'INVALID_KEY', message: 'Sec-WebSocket-Key must be the base64 form of 16 bytes.' };
  }
}

function serveSocket(socket, head, hub, accept) {
  socket.write([
    'HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`, 'X-C026-Scope: synthetic-loopback-only', '', ''
  ].join('\r\n'));
  socket.setNoDelay(true);
  const parser = framing.createParser({ requireMask: true, maxMessageBytes: MAX_CLIENT_MESSAGE_BYTES });
  let closing = false;
  const write = (bytes) => { if (!socket.destroyed && socket.writable) socket.write(bytes); };
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
  const server = http.createServer((request, response) => {
    function send(status, value, type = 'application/json; charset=utf-8', extra = {}) {
      const body = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
      response.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type, 'Content-Length': body.length, ...extra });
      response.end(body);
    }
    function fail(status, code, message) {
      send(status, { error: { code, message }, businessData: 'synthetic', localOnly: true });
    }
    try {
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
      if (url.pathname === '/stream') return fail(426, 'UPGRADE_REQUIRED', 'Open /stream with a WebSocket upgrade (RFC 6455).');
      if (url.pathname === '/scope.json' || url.pathname === '/transcript.json' || Object.hasOwn(assets, url.pathname)) {
        if (url.search) return fail(400, 'INVALID_QUERY', 'This route accepts no query parameters.');
      }
      if (url.pathname === '/scope.json') return send(200, scope);
      if (url.pathname === '/transcript.json') {
        if (transcript === null) return fail(404, 'NOT_FOUND', 'This instance does not produce transcripts.');
        transcript().then((value) => send(200, value), () => {
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
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 1000;
  const sockets = new Set();
  openSockets.set(server, sockets);
  Object.defineProperty(server, 'hub', { value: hub });
  server.on('upgrade', (request, socket, head) => {
    // An upgraded socket leaves the http server's own error handling, so every path needs this one.
    socket.on('error', () => socket.destroy());
    const verdict = inspectUpgrade(request, server.address().port);
    if (verdict.accept === undefined) {
      refuseUpgrade(socket, verdict.status, verdict.code, verdict.message, verdict.extra);
      return;
    }
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    serveSocket(socket, head, hub, verdict.accept);
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

module.exports = Object.freeze({ scope, createLocalServer, closeServer, startLocal, runCli, produceLocalTranscript });
