'use strict';

// The loopback service of the C059 journey: 127.0.0.1, automatic port, Node built-ins only. It serves the page, the pinned C042
// contract and C041 host files, the pinned C041 lesson assets (GET only) and delegates the step API to the C042 engine,
// read-only. Every answer goes through ONE send(); a request whose body was not read is answered with Connection: close and its
// socket is destroyed once the answer is flushed. It accepts no host, port, identity or deployment override.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const c041 = path.join(__dirname, '..', 'C041');
const c042 = path.join(__dirname, '..', 'C042');
const contract = require(path.join(c042, 'contract.js'));
const { delayExecutor, openEngine } = require(path.join(c042, 'engine.cjs'));
const input = require(path.join(c042, 'input.cjs'));
const { createFileIo, createMemoryIo } = require(path.join(c042, 'journal.cjs'));
const result = require(path.join(c042, 'result.cjs'));
const catalog = require(path.join(c041, 'accepted-catalog.js'));
const lessonHost = require(path.join(c041, 'serve.cjs'));

const scope = Object.freeze({
  cardId: 'C059', businessData: 'synthetic', transport: '127.0.0.1 HTTP only', testRuntime: process.version,
  approvedProductionTarget: 'Node.js 24 LTS / Express / App Service Linux', productionRuntimeValidated: false,
  identityVerified: false, realServiceRegistered: false, screenReaderRun: false, liveAzureRuns: 0, authorizedCloudSpend: 0,
  imports: ['C041 (host files and delivered lessons, read-only)', 'C042 (contract and engine, read-only)'],
});
const PAGE_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-src 'self'; img-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'; frame-ancestors 'none'";
const HEADERS = Object.freeze({
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-C059-Scope': contract.SCOPE,
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), clipboard-read=(), clipboard-write=(), fullscreen=(), display-capture=()',
});
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const OWN = Object.freeze({
  '/': 'index.html', '/page.js': 'page.js', '/journey.js': 'journey.js', '/a11y-check.js': 'a11y-check.js', '/styles.css': 'styles.css',
});
const SHARED = Object.freeze({
  '/c042/contract.js': path.join(c042, 'contract.js'), '/c041/accepted-catalog.js': path.join(c041, 'accepted-catalog.js'),
  '/c041/host-policy.js': path.join(c041, 'host-policy.js'), '/c041/lesson-host.js': path.join(c041, 'lesson-host.js'),
});
const JSON_TYPE = /^application\/json(?:\s*;\s*charset=utf-8)?$/i;
const STEP_ROUTE = /^\/v1\/steps\/([^/]+)$/;
const ACTION_ROUTE = /^\/v1\/steps\/([^/]+)\/([^/]+)$/;
const ACTION_NAME = /^[a-z][a-z-]{0,31}$/;
const DATA_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;
const sockets = new WeakMap();
const pipelined = new WeakMap();
const silent = new WeakMap();
// Per-connection and per-server bounds: nothing a client does can make memory or the number of sockets grow without limit.
// connectionsCheckingInterval makes Node enforce the header and request timeouts every checkMs instead of every 30 s.
const BOUNDS = Object.freeze({ pipelineDepth: 4, connections: 128, headerBytes: 8192, headerCount: 64, idleMs: 90000, checkMs: 1000, firstRequestMs: 5000, requestMs: 5000, headersMs: 5000, keepAliveMs: 1000 });

function readOwned(file) {
  const actual = fs.realpathSync(file);
  const comparable = (value) => (process.platform === 'win32' ? value.toLowerCase() : value);
  if (comparable(actual) !== comparable(path.resolve(file)) || !fs.statSync(actual).isFile()) throw new Error('Asset must be an owned regular file without redirected paths.');
  return fs.readFileSync(actual);
}

// Every servable byte is read once, at startup: own files, pinned imports, and the C041 lesson assets after hash verification.
function loadAssets() {
  lessonHost.validateCatalog(catalog);
  const routes = new Map();
  const add = (route, file, extra = {}) => routes.set(route, { bytes: readOwned(file), type: MIME[path.extname(file)], csp: PAGE_CSP, framed: false, ...extra });
  for (const [route, name] of Object.entries(OWN)) add(route, path.join(__dirname, name));
  for (const [route, file] of Object.entries(SHARED)) add(route, file);
  for (const lesson of catalog.lessons) {
    for (const asset of lesson.assets) {
      const file = path.join(root, ...asset.path.split('\\'));
      const bytes = lessonHost.verifyAsset(asset, readOwned(file));
      routes.set(`/c041-lessons/${lesson.id}/${asset.file}`, { bytes, type: MIME[path.extname(asset.file)], csp: lessonHost.lessonCsp, framed: true });
    }
  }
  return routes;
}

// Collects at most `limit` bytes. Past the limit it answers null at once and keeps nothing, so an endless body (also
// one made of tiny chunks) costs no memory and ends with the 413 and the closed connection.
function readBody(request, limit) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        chunks.length = 0;
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('close', () => resolve(undefined));
  });
}

function createLocalServer({ engine, assets = loadAssets(), transcript = null, bounds = {} } = {}) {
  // Tests may relax a timer to prove a single rule in isolation; the defaults are the documented bounds.
  const limits = { ...BOUNDS, ...bounds };
  let produced = null;
  // One transcript per service, shared by concurrent requests: a client cannot make the server rebuild it again and again.
  const produce = () => {
    produced ??= transcript().catch((error) => { produced = null; throw error; });
    return produced;
  };
  const server = http.createServer({ maxHeaderSize: limits.headerBytes, connectionsCheckingInterval: limits.checkMs }, async (request, response) => {
    const depth = (pipelined.get(request.socket) ?? 0) + 1;
    clearTimeout(silent.get(request.socket));
    if (depth > limits.pipelineDepth) {
      request.socket.destroy();
      return undefined;
    }
    pipelined.set(request.socket, depth);
    response.once('close', () => pipelined.set(request.socket, pipelined.get(request.socket) - 1));
    const hasBody = Boolean(request.headers['transfer-encoding']) || Number(request.headers['content-length'] || 0) > 0;
    let consumed = !hasBody;
    // THE one send path, for every answer: a request whose body was not read is never kept alive. Answer with
    // Connection: close, then destroy the socket once the answer is flushed, because Node would otherwise keep
    // parsing an endless (chunked) body behind a refusal.
    const send = (status, value, type = 'application/json; charset=utf-8', extra = {}) => {
      if (response.destroyed || response.writableEnded) return;
      const body = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
      if (!consumed) response.once('finish', () => request.socket.destroy());
      response.writeHead(status, { ...HEADERS, 'Content-Security-Policy': PAGE_CSP, ...extra, 'Content-Type': type, 'Content-Length': body.length, ...(consumed ? {} : { Connection: 'close' }) });
      response.end(body);
    };
    const reply = ({ status, body }, extra = {}) => send(status, body, undefined, extra);
    const refuse = (code, options, extra) => reply(result.refusal(code, options), extra);
    try {
      const host = `127.0.0.1:${server.address().port}`;
      const origin = `http://${host}`;
      if (request.socket.remoteAddress !== '127.0.0.1' || request.headers.host !== host) return refuse('LOCAL_HOST_REQUIRED');
      if (request.headers.origin && request.headers.origin !== origin) return refuse('CROSS_ORIGIN_DENIED');
      if (!request.url || request.url.length > 2048) return refuse('URL_TOO_LONG');
      const url = new URL(request.url, origin);
      if (url.origin !== origin || url.hash) return refuse('INVALID_URL');
      const only = (method) => {
        if (request.method !== method) { refuse('METHOD_NOT_ALLOWED', {}, { Allow: method }); return false; }
        if (url.search) { refuse('INVALID_QUERY'); return false; }
        if (method === 'GET' && hasBody) { refuse('UNEXPECTED_BODY'); return false; }
        return true;
      };
      const key = (value, action) => {
        if (contract.KEY_PATTERN.test(value)) return true;
        refuse('INVALID_FORMAT', { action, details: [{ path: 'key', code: 'INVALID_FORMAT', message: contract.ERRORS.INVALID_FORMAT.message }] });
        return false;
      };
      const route = url.pathname;
      if (assets.has(route)) {
        if (!only('GET')) return undefined;
        const asset = assets.get(route);
        return send(200, asset.bytes, asset.type, { 'Content-Security-Policy': asset.csp, ...(asset.framed ? {} : { 'X-Frame-Options': 'DENY' }) });
      }
      if (route === '/scope.json') return only('GET') ? send(200, scope) : undefined;
      if (route === '/v1/leases') return only('GET') ? send(200, engine.snapshot()) : undefined;
      if (route === '/transcript.json') {
        if (!only('GET')) return undefined;
        if (transcript === null) return refuse('NOT_FOUND');
        return produce().then((value) => send(200, value), () => refuse('TRANSCRIPT_UNAVAILABLE'));
      }
      if (route === '/v1/steps') {
        if (!only('POST')) return undefined;
        if (!JSON_TYPE.test(request.headers['content-type'] ?? '')) return refuse('UNSUPPORTED_MEDIA_TYPE', { action: 'submit' });
        if (Number(request.headers['content-length'] || 0) > contract.LIMITS.bodyBytes) return refuse('BODY_TOO_LARGE', { action: 'submit' });
        const bytes = await readBody(request, contract.LIMITS.bodyBytes);
        if (bytes === undefined) return undefined;
        if (bytes === null) return refuse('BODY_TOO_LARGE', { action: 'submit', details: [{ path: '$', code: 'BODY_TOO_LARGE', message: contract.ERRORS.BODY_TOO_LARGE.message }] });
        consumed = true;
        const parsed = input.parseBody(bytes);
        if (parsed.ok) return reply(await engine.submit(parsed.input));
        if (parsed.unsupported) return refuse(parsed.unsupported, { action: 'submit' });
        return refuse(parsed.problems[0].code, { action: 'submit', details: parsed.problems });
      }
      const stepMatch = STEP_ROUTE.exec(route);
      if (stepMatch) {
        if (!only('GET') || !key(stepMatch[1], 'inspect')) return undefined;
        return reply(engine.inspect(stepMatch[1]));
      }
      const actionMatch = ACTION_ROUTE.exec(route);
      if (actionMatch && ACTION_NAME.test(actionMatch[2])) {
        if (!only('POST') || !key(actionMatch[1], 'none')) return undefined;
        if (hasBody) return refuse('UNEXPECTED_BODY');
        if (actionMatch[2] === 'cancel') return reply(engine.cancel(actionMatch[1]));
        if (actionMatch[2] === 'resume') return reply(await engine.resume(actionMatch[1]));
        return reply(engine.unsupportedAction(actionMatch[1]));
      }
      return refuse('NOT_FOUND');
    } catch (error) {
      if (error instanceof TypeError && error.code === 'ERR_INVALID_URL') return refuse('INVALID_URL');
      return refuse('INTERNAL_ERROR');
    }
  });
  server.requestTimeout = limits.requestMs;
  server.headersTimeout = limits.headersMs;
  server.keepAliveTimeout = limits.keepAliveMs;
  server.timeout = limits.idleMs;
  server.maxConnections = limits.connections;
  server.maxHeadersCount = limits.headerCount;
  Object.defineProperty(server, 'engine', { value: engine });
  const open = new Set();
  sockets.set(server, open);
  server.on('connection', (socket) => {
    open.add(socket);
    // A socket that never starts a request is not kept: it costs a slot of the bounded connection count.
    const timer = setTimeout(() => socket.destroy(), limits.firstRequestMs);
    timer.unref();
    silent.set(socket, timer);
    socket.once('close', () => { open.delete(socket); clearTimeout(timer); });
  });
  return server;
}

// Every accepted socket is tracked, so shutdown never waits for a peer: stop listening first, then end every connection.
function closeServer(server) {
  return new Promise((resolve) => {
    server.engine?.halt();
    server.close(() => resolve());
    for (const socket of sockets.get(server) ?? []) socket.destroy();
    server.closeAllConnections();
  });
}

// Windows accepts device names (nul, con, com1 ...) and trailing dots as directory names that its tools then cannot delete.
const RESERVED = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\..*)?$/i;

async function startLocal({ dataName = null, io = null, settleMs = 0, executor = null, transcript = null, bounds = {} } = {}) {
  if (dataName !== null && (!DATA_NAME.test(dataName) || RESERVED.test(dataName) || dataName.endsWith('.'))) {
    throw new Error('The data name must be 1 to 32 letters, digits, dots, hyphens or underscores, and no reserved device name.');
  }
  const journalIo = io ?? (dataName === null ? createMemoryIo() : createFileIo(path.join(__dirname, 'data', dataName)));
  const engine = await openEngine({ io: journalIo, executor: executor ?? (settleMs > 0 ? delayExecutor(settleMs) : undefined) });
  const server = createLocalServer({ engine, transcript, bounds });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

function parseArguments(argv) {
  const options = { dataName: null, settleMs: 0 };
  for (const argument of argv) {
    const data = /^--data-dir=(.+)$/.exec(argument);
    const settle = /^--settle-ms=(\d{1,5})$/.exec(argument);
    if (data && options.dataName === null) options.dataName = data[1];
    else if (settle && Number(settle[1]) <= 60000) options.settleMs = Number(settle[1]);
    else return null;
  }
  return options;
}

function closeOnSignal(handler) {
  process.once('SIGINT', handler);
  process.once('SIGTERM', handler);
}

async function runCli(argv, { start = (options) => startLocal({ ...options, transcript: require('./transcript.cjs').produceTranscript }), log = console.log, error = console.error, onSignal = closeOnSignal } = {}) {
  const options = parseArguments(argv);
  if (options === null) {
    error('C059 accepts only --data-dir=<name> and --settle-ms=<0 to 60000>; no host, port, identity or deployment override.');
    return 1;
  }
  try {
    const server = await start(options);
    log(JSON.stringify({
      event: 'C059-local-listening', pid: process.pid, origin: `http://127.0.0.1:${server.address().port}`, scope,
      journal: options.dataName === null ? 'memory (not persisted)' : `capability/C059/data/${options.dataName}`,
    }));
    onSignal(() => closeServer(server));
    return 0;
  } catch (failure) {
    error(`C059 did not start: ${failure.message}`);
    return 1;
  }
}

if (require.main === module) {
  runCli(process.argv.slice(2)).then((code) => { if (code !== 0) process.exitCode = code; });
}

module.exports = Object.freeze({ BOUNDS, closeServer, createLocalServer, loadAssets, parseArguments, readOwned, runCli, scope, startLocal });
