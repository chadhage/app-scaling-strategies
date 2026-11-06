'use strict';

// The HTTP side. Every answer is built by ONE of two paths: static assets (bytes of three fixed files) and JSON that is a PublicBody, minted by the
// redactor (publish) alone; createOut() refuses anything else. Refusals, pipelining lanes and the answers Node would give itself use the accepted C009
// refusal path (http-io.cjs, read-only): a refusal answers once, ends the connection and stops reading in the same tick, and nothing behind it runs.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const contract = require('../C009/contract.js');
const { AuthError, authenticate } = require('../C009/authz.cjs');
const { CODES } = require('../C009/codes.cjs');
const { canStopReading, clientErrorCode, createLanes, createResponder, hasBody, localGuard } = require('../C009/http-io.cjs');
const { isPublicBody, KINDS } = require('./redact.cjs');
const { createService } = require('./service.cjs');

const ASSETS = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'], '/page.js': ['page.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8']
});
const COMMAND_ROUTE = /^\/v1\/commands\/([^/]+)$/;
const EVIDENCE_ROUTE = /^\/v1\/evidence\/(trace|runs|audit|logs)$/;
const FIXED_ROUTES = new Set(['/scope.json', '/v1/manage/config', '/v1/evidence/bundle']);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const BUNDLE_HEADERS = Object.freeze({ 'Content-Disposition': 'attachment; filename="c014-evidence-bundle.json"' });

function routeClass(pathname) {
  if (Object.hasOwn(ASSETS, pathname)) return 'asset';
  if (pathname === '/scope.json') return 'scope';
  if (EVIDENCE_ROUTE.test(pathname) || pathname === '/v1/evidence/bundle') return 'evidence';
  if (pathname === '/v1/manage/config') return 'manage';
  return COMMAND_ROUTE.test(pathname) ? 'command' : 'unknown';
}

// The one way a JSON answer leaves this server: a PublicBody, from the redactor. The command pipeline of C009 talks to this same object.
function createOut(response, service, ctx) {
  const base = createResponder(response);
  const send = (status, body, headers) => {
    if (!isPublicBody(body)) throw new TypeError('Only a PublicBody may be sent as JSON');
    return base.json(status, body, headers);
  };
  return {
    send,
    json(status, value, headers) {
      ctx.code = 'ok';
      return send(status, service.publish('answer', value), headers);
    },
    fail(code, extra = {}, headers) {
      const [status, message] = CODES[code];
      ctx.code = code;
      return send(status, service.publish('error', { outcome: code, error: { code, message }, ...extra }), headers);
    },
    file: (buffer, type) => { ctx.code = 'ok'; return base.file(buffer, type); },
    proceed: () => base.proceed()
  };
}

function parseLimit(url) {
  const params = [...url.searchParams];
  if (params.length === 0) return DEFAULT_LIMIT;
  const ok = params.length === 1 && params[0][0] === 'limit' && /^[1-9]\d{0,2}$/.test(params[0][1]) && Number(params[0][1]) <= MAX_LIMIT;
  return ok ? Number(params[0][1]) : null;
}

function createApp(options = {}) {
  const bounds = { ...contract.limits, ...options.limits };
  const service = createService({ config: options.config, logSink: options.logSink, limits: options.limits, now: options.now });
  let server = null;

  function read(request, out, url, ctx) {
    const identity = authenticate(service.registry, request.rawHeaders);
    ctx.role = identity === null ? null : identity.role;
    const { pathname } = url;
    if (Object.hasOwn(ASSETS, pathname) || pathname === '/scope.json' || pathname === '/v1/manage/config' || pathname === '/v1/evidence/bundle') {
      if (url.search !== '') return out.fail('QUERY_NOT_ALLOWED');
      if (Object.hasOwn(ASSETS, pathname)) return out.file(fs.readFileSync(path.join(__dirname, ASSETS[pathname][0])), ASSETS[pathname][1]);
      if (pathname === '/scope.json') { ctx.code = 'ok'; return out.send(200, service.scopeBody()); }
      if (pathname === '/v1/evidence/bundle') { ctx.code = 'ok'; return out.send(200, service.bundleBody(), BUNDLE_HEADERS); }
      if (identity === null) throw new AuthError('AUTHENTICATION_REQUIRED');
      if (!service.table['config.check'].roles.includes(identity.role)) return out.fail('ROLE_FORBIDDEN', { role: identity.role, requiredRoles: service.table['config.check'].roles });
      ctx.code = 'ok';
      return out.send(200, service.configBody());
    }
    const limit = parseLimit(url);
    if (limit === null) return out.fail('QUERY_INVALID');
    ctx.code = 'ok';
    return out.send(200, service.listBody(EVIDENCE_ROUTE.exec(pathname)[1], limit));
  }

  // One request: its out, its trace and log record when the answer is done, and the typed fallbacks.
  async function handle(request, response, task) {
    const ctx = { code: null, role: null, route: 'unknown' };
    const out = createOut(response, service, ctx);
    response.once('finish', () => service.recordRequest({ method: request.method, route: ctx.route, status: response.statusCode, code: ctx.code, role: ctx.role, url: request.url, headers: request.headers }));
    try {
      return await task(out, ctx);
    } catch (error) {
      if (error instanceof AuthError) return out.fail(error.code, {}, { 'WWW-Authenticate': error.challenge });
      if (error?.code === 'ERR_INVALID_URL') return out.fail('INVALID_URL');
      return out.fail('INTERNAL_ERROR');
    }
  }

  const route = (request, response) => handle(request, response, async (out, ctx) => {
    const refused = localGuard(request, server);
    if (refused) return out.fail(refused);
    if (request.url.length > 2048) return out.fail('URL_TOO_LONG');
    const origin = `http://127.0.0.1:${server.address().port}`;
    const url = new URL(request.url, origin);
    if (url.origin !== origin || request.url.includes('#')) return out.fail('INVALID_URL');
    ctx.route = routeClass(url.pathname);
    try { ctx.role = authenticate(service.registry, request.rawHeaders)?.role ?? null; } catch { ctx.role = null; }
    const command = COMMAND_ROUTE.exec(url.pathname);
    if (command) {
      if (request.method !== 'POST') return out.fail('METHOD_NOT_ALLOWED', {}, { Allow: 'POST' });
      return service.handleCommand(request, out, url, command[1]);
    }
    if (!Object.hasOwn(ASSETS, url.pathname) && !FIXED_ROUTES.has(url.pathname) && !EVIDENCE_ROUTE.test(url.pathname)) return out.fail('NOT_FOUND');
    if (request.method !== 'GET') return out.fail('METHOD_NOT_ALLOWED', {}, { Allow: 'GET' });
    if (hasBody(request)) return out.fail('UNEXPECTED_BODY');
    return read(request, out, url, ctx);
  });

  // Every answer Node would give by itself goes through the same lanes and the same final-answer path (C009 http-io.cjs rule 4).
  const admit = createLanes({ depth: bounds.pipelined });
  server = http.createServer({ connectionsCheckingInterval: bounds.checkMs, requireHostHeader: false }, (request, response) => admit(request, response, route));
  server.on('checkContinue', (request, response) => admit(request, response, route));
  server.on('checkExpectation', (request, response) => admit(request, response, (_request, answer) => handle(request, answer, (out) => out.fail('EXPECTATION_FAILED'))));
  server.on('clientError', (error, socket) => admit.refuse(socket, clientErrorCode(error)));
  server.on('connect', (request, socket) => admit.refuse(socket, 'METHOD_NOT_ALLOWED'));
  server.requestTimeout = bounds.headerMs;
  server.headersTimeout = bounds.headerMs;
  server.keepAliveTimeout = 1000;
  server.timeout = bounds.idleMs;
  server.maxConnections = bounds.connections;

  // Stopping reads is a Node internal (C009 http-io.cjs rule 3): where it is missing the server serves nothing instead of degrading to Connection: close alone.
  let broken = null;
  const failClosed = () => {
    if (broken === null) process.emitWarning('C014 cannot stop reading a refused connection and serves nothing.', { code: 'C014_READ_STOP_UNAVAILABLE' });
    broken = 'READ_STOP_UNAVAILABLE';
  };
  server.once('listening', () => {
    if (canStopReading(server)) return;
    failClosed();
    server.emit('error', new Error('READ_STOP_UNAVAILABLE: this Node cannot stop reading a refused connection'));
  });
  const sockets = new Set();
  server.on('connection', (socket) => {
    if (broken === null && !canStopReading(socket)) failClosed();
    if (broken !== null) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  const close = () => new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
    for (const socket of sockets) socket.destroy();
  });
  return { server, service, close, health: () => ({ ok: broken === null, reason: broken }) };
}

async function startLocal(options = {}) {
  const app = createApp(options);
  try {
    await new Promise((resolve, reject) => {
      app.server.once('error', reject);
      app.server.listen(0, '127.0.0.1', () => { app.server.off('error', reject); resolve(); });
    });
  } catch (error) {
    await app.close();
    throw error;
  }
  const { port } = app.server.address();
  return { server: app.server, service: app.service, health: app.health, close: app.close, port, origin: `http://127.0.0.1:${port}` };
}

module.exports = Object.freeze({ ASSETS, KINDS, createApp, createOut, routeClass, startLocal });
