'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { randomBytes, randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { guardOperation } = require('../C001/contract-guard.js');
const { suffix, encodeEvent } = require('./fixture.cjs');
const { VERSION, ProtocolError, parseCursor, tailFor, fields, freeze } = require('./protocol.js');

const MAX_LIFETIME_MS = 15 * 60 * 1000;
const DEFAULT_LIFETIME_MS = 10 * 60 * 1000;
const EVENT_INTERVAL_MS = 200;
const STREAM_LIFETIME_MS = 30000;
const MODES = Object.freeze(['normal', 'gap', 'duplicate', 'invalid', 'drop']);
const PREAMBLE = Buffer.from('retry: 60000\n: C027 live synthetic loopback SSE; receipt is not acceptance\n\n');
const owned = new WeakMap();
const root = __dirname;

function ownedState(server) {
  const state = owned.get(server);
  if (!state) throw new Error('An exact owned C027 http.Server handle is required.');
  return state;
}

function listenerOrigin(server) {
  ownedState(server);
  const address = server.listening ? server.address() : null;
  if (!address || address.address !== '127.0.0.1' || address.family !== 'IPv4' ||
      !Number.isInteger(address.port) || address.port < 1) throw new Error('The exact owned IPv4 loopback listener must be live.');
  return `http://127.0.0.1:${address.port}`;
}

function inspectLocal(server) {
  const state = ownedState(server);
  return freeze(structuredClone({
    lease: state.lease, activeStreams: state.streams.size, activeSockets: state.sockets.size,
    activeTimers: state.timers.size, httpRequests: state.httpRequests, failures: state.failures,
    streamRequests: state.requests, sends: state.sends,
    responseEnds: state.responseEnds, stopped: state.stopped, generatedFiles: [...state.files]
  }));
}

async function closeLocal(server) {
  const state = ownedState(server);
  if (state.closing) return state.closing;
  state.closing = (async () => {
    state.stopped = true;
    for (const timer of state.timers) clearTimeout(timer);
    state.timers.clear();
    for (const response of state.streams) response.destroy();
    server.closeAllConnections();
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
        else resolve();
      });
    });
    for (const file of state.files) fs.rmSync(file);
    state.files.clear();
  })();
  return state.closing;
}

function createConductor(server) {
  const state = ownedState(server);
  const origin = listenerOrigin(server);
  if (state.files.size >= 1) throw new Error('Only one exact conducting file may exist for this owned listener.');
  const endpoint = `${origin}/c027/${state.ticket}/events`;
  const template = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const html = template
    .replace("connect-src 'none'", `connect-src ${endpoint}`)
    .replace('C027_ORIGIN', origin).replace('C027_TICKET', state.ticket);
  const file = path.join(root, `runtime-${randomUUID()}.html`);
  fs.writeFileSync(file, html, { flag: 'wx' });
  state.files.add(file);
  return freeze({
    relativePath: path.join('capability', 'C027', path.basename(file)),
    fileUrl: pathToFileURL(file).href, origin, endpoint
  });
}

async function startLocal(options = {}) {
  let lifetimeMs;
  try {
    const keys = Reflect.ownKeys(Object.getOwnPropertyDescriptors(options));
    if (keys.length > 1 || (keys.length && keys[0] !== 'lifetimeMs')) throw new TypeError();
    const parsed = fields(options, keys);
    lifetimeMs = keys.length ? parsed.lifetimeMs : DEFAULT_LIFETIME_MS;
  } catch {
    throw new Error('Only a bounded lifetimeMs option is accepted; host, port and consent overrides are forbidden.');
  }
  if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs < 1 || lifetimeMs > MAX_LIFETIME_MS) {
    throw new Error('lifetimeMs must be a positive integer at most 900000 (15 minutes).');
  }
  let ledger;
  try { ledger = JSON.parse(fs.readFileSync(path.join(root, '..', '..', '.docs', 'wiki', 'flow-state.json'), 'utf8')); }
  catch { throw new Error('Current C001 local consent is unavailable; no listener was started.'); }
  if (!(await guardOperation('local.probe', ledger.approvals?.C001)).allowed) {
    throw new Error('Current C001 local consent denies this listener.');
  }
  if (ledger.cards?.find((card) => card.id === 'C020')?.state !== 'Done') {
    throw new Error('The C020 accepted entry gate is required before starting this fixture.');
  }
  const state = {
    ticket: randomBytes(24).toString('hex'), files: new Set(), sockets: new Set(), streams: new Set(),
    timers: new Set(), requests: [], httpRequests: [], failures: [], sends: [],
    responseEnds: 0, stopped: false, closing: null,
    lease: freeze({
      lifetimeMs, expiresAtUtc: new Date(Date.now() + lifetimeMs).toISOString(),
      bindAddress: '127.0.0.1', streamLifetimeMs: STREAM_LIFETIME_MS, maxConcurrentStreams: 4,
      scope: 'synthetic local memory, no foreground lease, no durable state'
    })
  };
  const server = http.createServer({ maxHeaderSize: 4096 }, (request, response) => {
    const common = {
      'Cache-Control': 'no-store, no-transform', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Access-Control-Allow-Origin': 'null', Vary: 'Origin',
      'Access-Control-Expose-Headers': 'X-C027-Stream-Version, X-C027-Accepted-After',
      'X-C027-Scope': 'synthetic-loopback-only'
    };
    const fail = (status, code, message, extra = {}) => {
      if (state.failures.length < 128) {
        state.failures.push({ requestNumber: state.httpRequests.length, status, code, observedAt: Date.now() });
      }
      const body = Buffer.from(JSON.stringify({ error: { code, message }, dataKind: 'synthetic', localOnly: true }));
      response.writeHead(status, { ...common, ...extra, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
      response.end(body);
    };
    try {
      if (state.httpRequests.length >= 128) return fail(429, 'HTTP_AUDIT_LIMIT', 'The bounded HTTP audit allowance is exhausted.');
      state.httpRequests.push({
        method: request.method, url: String(request.url || '').slice(0, 2048),
        origin: request.headers.origin || null, host: request.headers.host || null,
        credentialsPresent: Boolean(request.headers.authorization || request.headers.cookie),
        receivedAt: Date.now()
      });
      const origin = listenerOrigin(server);
      if (request.socket.remoteAddress !== '127.0.0.1' || request.headers.host !== new URL(origin).host) {
        return fail(421, 'LOCAL_HOST_REQUIRED', 'Only the actual literal 127.0.0.1 listener is supported.');
      }
      if (request.headers.origin !== undefined && request.headers.origin !== 'null') {
        return fail(403, 'ORIGIN_DENIED', 'Only the explicit null file origin (or an owned Node driver) is supported.');
      }
      if (request.headers.authorization || request.headers.cookie) {
        return fail(403, 'CREDENTIALS_FORBIDDEN', 'This synthetic fixture accepts no real credentials or cookies.');
      }
      if (request.method !== 'GET') return fail(405, 'METHOD_NOT_ALLOWED', 'Only GET is supported.', { Allow: 'GET' });
      if (request.headers['transfer-encoding'] || Number(request.headers['content-length'] || 0) !== 0) {
        return fail(400, 'UNEXPECTED_BODY', 'The streaming fixture accepts no request body.');
      }
      if (!request.url || request.url.length > 2048) return fail(414, 'URL_TOO_LONG', 'The fixture URL exceeds its bound.');
      if (!request.url.startsWith('/') || request.url.startsWith('//') || request.url.includes('\\')) {
        return fail(400, 'INVALID_URL', 'An origin-relative fixture URL is required.');
      }
      const url = new URL(request.url, origin);
      if (url.origin !== origin || url.hash) return fail(400, 'INVALID_URL', 'Only an owned local URL without a fragment is supported.');
      if (url.pathname !== `/c027/${state.ticket}/events`) return fail(404, 'NOT_FOUND', 'No such owned fixture endpoint exists.');
      const keys = [...url.searchParams.keys()].sort();
      if (keys.length !== 4 || keys.join(',') !== 'after,mode,profileId,version') {
        return fail(400, 'INVALID_QUERY', 'Exactly one profileId, version, mode and explicit accepted after cursor are required.');
      }
      const profileId = url.searchParams.get('profileId');
      const version = url.searchParams.get('version');
      const after = url.searchParams.get('after');
      const mode = url.searchParams.get('mode');
      let events = suffix({ profileId, version }, after);
      const cursorSequence = parseCursor(after, profileId);
      if (!MODES.includes(mode)) return fail(400, 'UNKNOWN_MODE', 'Only declared local normal/gap/duplicate/invalid/drop modes exist.');
      if (request.headers['last-event-id'] !== undefined && request.headers['last-event-id'] !== after) {
        return fail(409, 'CURSOR_CONFLICT', 'Last-Event-ID is receipt, not acceptance; it must not override explicit after.');
      }
      if (state.requests.length >= 64 || state.streams.size >= 4) {
        return fail(429, 'LOCAL_CAPACITY_LIMIT', 'The bounded fixture request/stream allowance is exhausted.');
      }
      if (mode === 'gap') events = events.slice(1);
      if (mode === 'duplicate' && events.length) events = [events[0], ...events];
      if (mode === 'drop') events = events.slice(0, 2);
      const attempt = state.requests.length + 1;
      state.requests.push({
        attempt, profileId, version, mode, acceptedAfter: after, cursorSequence,
        lastEventIdHeader: request.headers['last-event-id'] || null, origin: request.headers.origin || null,
        requestedAt: Date.now()
      });
      state.streams.add(response);
      response.writeHead(200, {
        ...common, 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', 'X-C027-Stream-Version': VERSION, 'X-C027-Accepted-After': after
      });
      response.flushHeaders();
      response.write(PREAMBLE);
      let sequenceIndex = 0;
      let timer;
      let bound;
      const schedule = (callback, ms) => {
        const handle = setTimeout(() => { state.timers.delete(handle); callback(); }, ms);
        state.timers.add(handle);
        return handle;
      };
      const write = (bytes, callback) => {
        if (response.destroyed || state.stopped) return;
        if (response.write(bytes)) timer = schedule(callback, EVENT_INTERVAL_MS);
        else response.once('drain', () => { timer = schedule(callback, EVENT_INTERVAL_MS); });
      };
      const heartbeat = () => write(Buffer.from(': C027 open stream heartbeat\n\n'), heartbeat);
      const tick = () => {
        if (response.destroyed || state.stopped) return;
        if (sequenceIndex < events.length) {
          const event = events[sequenceIndex++];
          const bytes = mode === 'invalid' && sequenceIndex === 1
            ? Buffer.from(`id: ${event.id}\nevent: profile\ndata: {invalid-json\n\n`)
            : encodeEvent(event);
          state.sends.push({ attempt, eventId: event.id, sequence: event.sequence, sentAt: Date.now(), bytes: bytes.length });
          write(bytes, tick);
        } else if (mode === 'drop') {
          response.destroy();
        } else {
          const tail = Buffer.from(`event: tail\ndata: ${JSON.stringify(tailFor(profileId))}\n\n`);
          write(tail, heartbeat);
        }
      };
      response.once('finish', () => { state.responseEnds++; });
      response.once('close', () => {
        clearTimeout(timer);
        clearTimeout(bound);
        state.timers.delete(timer);
        state.timers.delete(bound);
        state.streams.delete(response);
      });
      timer = schedule(tick, EVENT_INTERVAL_MS);
      bound = schedule(() => response.destroy(), STREAM_LIFETIME_MS);
    } catch (error) {
      if (error instanceof ProtocolError) return fail(error.status, error.code, error.message);
      if (response.headersSent) response.destroy();
      else fail(500, 'FIXTURE_UNAVAILABLE', 'No successful stream observation was made.');
    }
  });
  owned.set(server, state);
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 500;
  server.maxHeadersCount = 40;
  server.maxRequestsPerSocket = 64;
  server.maxConnections = 8;
  server.on('connection', (socket) => {
    state.sockets.add(socket);
    socket.once('close', () => state.sockets.delete(socket));
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
    });
    const expiry = setTimeout(() => { closeLocal(server).catch((error) => { console.error(error.message); process.exitCode = 1; }); }, lifetimeMs);
    expiry.unref();
    state.timers.add(expiry);
  } catch (error) {
    await closeLocal(server);
    throw error;
  }
  return server;
}

if (require.main === module) {
  if (process.argv.length !== 2) {
    console.error('C027 accepts no CLI overrides. Its literal loopback listener expires after ten minutes.');
    process.exitCode = 1;
  } else {
    startLocal().then((server) => {
      let conductor;
      try { conductor = createConductor(server); }
      catch (error) { return closeLocal(server).then(() => { throw error; }); }
      console.log(JSON.stringify({
        label: '[C027][S]', ...conductor, lease: inspectLocal(server).lease, testRuntime: process.version,
        nativeTargetQualified: false, productionRuntimeValidated: false, durableStorage: false, exactlyOnce: false
      }));
      const close = () => { closeLocal(server).catch((error) => { console.error(error.message); process.exitCode = 1; }); };
      process.once('SIGINT', close);
      process.once('SIGTERM', close);
      server.once('close', () => { process.removeListener('SIGINT', close); process.removeListener('SIGTERM', close); });
    }).catch((error) => { console.error(error.message); process.exitCode = 1; });
  }
}

module.exports = Object.freeze({
  startLocal, closeLocal, createConductor, listenerOrigin, inspectLocal,
  MAX_LIFETIME_MS, DEFAULT_LIFETIME_MS, STREAM_LIFETIME_MS, EVENT_INTERVAL_MS, MODES, PREAMBLE
});
