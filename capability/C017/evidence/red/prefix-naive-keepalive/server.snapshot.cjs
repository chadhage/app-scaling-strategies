'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { parseJsonInput } = require('../C002/json-input.js');
const C = require('./contract.js');

const MAX_BODY = 2048;
const MAX_JOURNAL_VIEW = 48;
// After an answer is flushed the request body is still dumped, but only up to this many more bytes and this long, and only while fewer than
// MAX_DRAINING connections of the process are draining: a polite client that is still uploading a finite oversize body (a few KB, the
// commands are under 2 KB) receives its typed answer, an endless or slow one is cut, and N attackers cost at most MAX_DRAINING times the
// bound plus N immediate closes, not N times the bound (L-0120, L-0132, F23 of the second independent review).
const DRAIN_BYTES = 32768;
const DRAIN_MS = 1000;
const MAX_DRAINING = 4;
const tracked = new WeakMap();
let draining = 0;
const scope = Object.freeze({
  cardId: 'C017', businessData: 'synthetic', transport: '127.0.0.1 HTTP only', testRuntime: process.version,
  approvedProductionTarget: 'Node.js 24 LTS / Express / App Service Linux', productionRuntimeValidated: false, identityVerified: false,
  nativeTargetQualified: false, durableStoreImplemented: 'local-append-only-journal-only', powerLossGuarantee: false, liveAzureRuns: 0, authorizedCloudSpend: 0,
});
const assets = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'], '/contract.js': ['contract.js', 'text/javascript; charset=utf-8'],
  '/page.js': ['page.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'],
});
const commandRoutes = Object.freeze({ '/api/start': 'start', '/api/cancel': 'cancel', '/api/reconcile': 'reconcile' });
const headers = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-C017-Scope': 'synthetic-loopback-only',
});

function readBody(request) {
  return new Promise((resolve) => {
    const declared = request.headers['content-length'];
    if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY)) return resolve({ tooLarge: true });
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        chunks.length = 0;
        resolve({ tooLarge: true });
      } else chunks.push(chunk);
    });
    request.on('end', () => resolve({ text: Buffer.concat(chunks).toString('utf8') }));
    request.on('error', () => resolve({ tooLarge: true }));
    return undefined;
  });
}

function closeAfterAnswer(socket) {
  if (socket.destroyed) return;
  if (draining >= MAX_DRAINING) { socket.destroy(); return; }
  draining += 1;
  const limit = socket.bytesRead + DRAIN_BYTES;
  const cut = () => socket.destroy();
  const timer = setTimeout(cut, DRAIN_MS);
  timer.unref();
  const watch = () => { if (socket.bytesRead > limit) cut(); };
  socket.on('data', watch);
  socket.once('close', () => { draining -= 1; clearTimeout(timer); socket.off('data', watch); });
}

// The only answer that does not go through send(): a request Node cannot parse has no ServerResponse. It is typed all the same, then the
// connection is destroyed (Node's own default does the same with prose and no body).
function answerUnparsable(error, socket) {
  if (socket.writable && socket.bytesWritten === 0) {
    const { status, body } = C.failure(error && error.code === 'HPE_HEADER_OVERFLOW' ? 'HEADERS_TOO_LARGE' : 'MALFORMED_REQUEST');
    const bytes = Buffer.from(JSON.stringify(body));
    const head = { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': bytes.length, Connection: 'close' };
    socket.write(`HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\n${Object.entries(head).map(([name, value]) => `${name}: ${value}\r\n`).join('')}\r\n`);
    socket.write(bytes);
  }
  socket.destroy();
}

// Resource bounds: ONE request per connection (every answer closes it), a 2 KB body, 8 KB of headers, a capped journal view,
// a connection cap and short request and idle timeouts. Every accepted socket is tracked so shutdown can never hang on one.
function createLocalServer({ engine, requestTimeoutMs = 5000, socketTimeoutMs = 30000, maxConnections = 64 }) {
  const sockets = new Set();
  // Sockets whose one request was taken. The mark is made at the first line of EVERY handler, synchronously, on request.socket (a response
  // queued behind another one has no socket yet), whatever the HTTP version: Node dispatches every request of one TCP read before the first
  // answer exists, and neither maxRequestsPerSocket nor its Host check count an HTTP/1.0 request or a request without Host, so a mutation
  // pipelined behind a refusal used to run while the client only saw the refusal (F12). A request behind the first is never run and never answered.
  const taken = new WeakSet();
  // mode.expectation: Node would answer an unknown Expect header with its own bodiless 417 and keep the connection (F11); mode.continued: the
  // client waits for 100 Continue, which is sent only when the request is about to be read, so a refusal never invites an upload.
  async function handle(request, response, mode = {}) {
    const { socket } = request;
    if (taken.has(socket)) return undefined;
    taken.add(socket);
    // The ONE send path of every answer: once it is flushed the connection is closed after a bounded drain (closeAfterAnswer). Node's own
    // close at the end of a response waits for pending reads on Windows, which an endless chunked body never lets finish.
    const send = (status, value, type = 'application/json; charset=utf-8') => {
      const body = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
      response.writeHead(status, { ...headers, 'Content-Type': type, 'Content-Length': body.length });
      response.end(body);
    };
    const fail = (code, details) => { const { status, body } = C.failure(code, { details }); send(status, body); };
    try {
      const address = server.address();
      const host = `127.0.0.1:${address.port}`;
      const origin = `http://${host}`;
      const site = request.headers['sec-fetch-site'];
      if (socket.remoteAddress !== '127.0.0.1' || request.headers.host !== host || (request.headers.origin && request.headers.origin !== origin)
        || (site && !['same-origin', 'none'].includes(site))) return fail('FORBIDDEN_ORIGIN');
      if (mode.expectation) return fail('EXPECTATION_FAILED');
      if (!request.url || request.url.length > 512) return fail('NOT_FOUND');
      const url = new URL(request.url, origin);
      if (url.origin !== origin || url.hash || url.search) return fail('NOT_FOUND');
      const route = url.pathname;
      if (Object.hasOwn(commandRoutes, route)) {
        if (request.method !== 'POST') return fail('METHOD_NOT_ALLOWED');
        const type = String(request.headers['content-type'] || '').toLowerCase().replace(/\s+/g, '');
        if (type !== 'application/json' && type !== 'application/json;charset=utf-8') return fail('UNSUPPORTED_MEDIA_TYPE');
        if (mode.continued) response.writeContinue();
        const body = await readBody(request);
        if (body.tooLarge) return fail('BODY_TOO_LARGE');
        const parsed = parseJsonInput(body.text);
        if (parsed.errors.length) return fail('INVALID_JSON', parsed.errors.map(({ path: at, code }) => ({ path: String(at).slice(0, 40), code })));
        if (!C.isPlain(parsed.value) || parsed.value.kind !== commandRoutes[route]) return fail('INVALID_COMMAND', [{ path: 'kind', code: 'KIND_MISMATCH' }]);
        const result = await engine.execute(parsed.value);
        return send(result.status, result.body);
      }
      if (request.method !== 'GET') return fail('METHOD_NOT_ALLOWED');
      if (route === '/api/state') {
        const state = engine.view();
        const omitted = Math.max(0, state.journal.length - MAX_JOURNAL_VIEW);
        return send(200, { ...state, journal: state.journal.slice(omitted), journalEntries: state.journal.length, journalOmitted: omitted });
      }
      if (route === '/scope.json') return send(200, scope);
      if (Object.hasOwn(assets, route)) {
        const [file, type] = assets[route];
        return send(200, fs.readFileSync(path.join(__dirname, file)), type);
      }
      return fail('NOT_FOUND');
    } catch {
      if (!response.headersSent) fail('INTERNAL');
      return undefined;
    }
  }
  // requireHostHeader is off so that a request without Host reaches handle() and gets the typed 403 of the central path; Node's own 400 for it
  // is bodiless, keeps the connection and does not count the request against any per-socket limit.
  const server = http.createServer({ connectionsCheckingInterval: 250, maxHeaderSize: 8192, requireHostHeader: false }, (request, response) => handle(request, response));
  server.on('checkExpectation', (request, response) => handle(request, response, { expectation: true }));
  server.on('checkContinue', (request, response) => handle(request, response, { continued: true }));
  server.on('clientError', answerUnparsable);
  server.requestTimeout = requestTimeoutMs;
  server.headersTimeout = Math.min(requestTimeoutMs, 5000);
  server.keepAliveTimeout = 1000;
  server.maxHeadersCount = 32;
  server.maxConnections = maxConnections;
  server.setTimeout(socketTimeoutMs);
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  tracked.set(server, sockets);
  return server;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function closeOwned(server) {
  server.closeAllConnections();
  for (const socket of tracked.get(server) || []) socket.destroy();
  if (server.listening) await new Promise((resolve) => server.close(resolve));
}

// drain: the bounded drain after an answer, exposed so that its bounds are proved with fake sockets and fake timers, not with wall-clock measurements.
const drain = Object.freeze({ closeAfterAnswer, DRAIN_BYTES, DRAIN_MS, MAX_DRAINING, active: () => draining });

module.exports = Object.freeze({ MAX_BODY, MAX_JOURNAL_VIEW, scope, createLocalServer, listen, closeOwned, drain });
