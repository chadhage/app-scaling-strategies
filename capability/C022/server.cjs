'use strict';

// The HTTP face of the fixture. The refusal path, the per-connection lanes, the answers Node gives by itself and the fail-closed read stop are
// the accepted C009 http-io.cjs, imported READ-ONLY (see imports.json and README); everything about tenants, sessions and resources is C022.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const contract = require('./contract.js');
const { createIdentity } = require('./identity.cjs');
const { createStore } = require('./store.cjs');
const { createService } = require('./service.cjs');
const { canStopReading, clientErrorCode, createLanes, createResponder, hasBody, isFinished, localGuard, readBody } = require('../C009/http-io.cjs');
const { createQueue } = require('../C009/queue.cjs');

const scope = Object.freeze({
  cardId: 'C022', businessData: 'synthetic', transport: '127.0.0.1 HTTP only', testRuntime: process.version,
  approvedProductionTarget: 'Node.js 24 LTS / Express / Microsoft Entra ID', tenantIsolationEnforcedServerSide: true,
  authorizationEnforcedServerSide: true, entraIntegrated: false, identityRegistered: false, productionRuntimeValidated: false,
  nativeTargetQualified: false, liveAzureRuns: 0, authorizedCloudSpend: 0
});
const ASSETS = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'], '/contract.js': ['contract.js', 'text/javascript; charset=utf-8'],
  '/page.js': ['page.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8']
});
const ROUTES = Object.freeze([
  { op: 'session.anonymous', method: 'POST', re: /^\/v1\/session\/anonymous$/, auth: 'none', body: false },
  { op: 'session.login', method: 'POST', re: /^\/v1\/session\/login$/, auth: 'optional', body: true },
  { op: 'session.whoami', method: 'GET', re: /^\/v1\/session$/, auth: 'required', body: false },
  { op: 'session.logout', method: 'POST', re: /^\/v1\/session\/logout$/, auth: 'required', body: false },
  { op: 'session.switch', method: 'POST', re: /^\/v1\/session\/switch$/, auth: 'required', body: true },
  { op: 'project.list', method: 'GET', re: /^\/v1\/projects$/, auth: 'required', body: false },
  { op: 'project.create', method: 'POST', re: /^\/v1\/projects$/, auth: 'required', body: true },
  { op: 'project.read', method: 'GET', re: /^\/v1\/projects\/([^/]+)$/, auth: 'required', body: false },
  { op: 'project.update', method: 'PUT', re: /^\/v1\/projects\/([^/]+)$/, auth: 'required', body: true },
  { op: 'project.delete', method: 'DELETE', re: /^\/v1\/projects\/([^/]+)$/, auth: 'required', body: false },
  { op: 'profile.list', method: 'GET', re: /^\/v1\/profiles$/, auth: 'required', body: false },
  { op: 'profile.read', method: 'GET', re: /^\/v1\/profiles\/([^/]+)$/, auth: 'required', body: false },
  { op: 'admin.sessions', method: 'GET', re: /^\/v1\/admin\/sessions$/, auth: 'required', body: false },
  { op: 'admin.audit', method: 'GET', re: /^\/v1\/admin\/audit$/, auth: 'required', body: false },
  { op: 'admin.revoke', method: 'POST', re: /^\/v1\/admin\/revoke$/, auth: 'required', body: true },
  { op: 'admin.role', method: 'POST', re: /^\/v1\/admin\/role$/, auth: 'required', body: true }
]);
const JSON_TYPE = /^application\/json\s*(;.*)?$/i;
const CREDENTIAL = /^bearer ([A-Za-z0-9._~+/-]+=*)$/i;
const REALM = 'Bearer realm="c022-local"';

// null: no credential; anything presented but not exactly one well-formed credential is an error (never read as anonymous).
function bearerOf(rawHeaders) {
  const values = [];
  for (let index = 0; index < rawHeaders.length; index += 2) if (rawHeaders[index].toLowerCase() === 'authorization') values.push(rawHeaders[index + 1]);
  if (values.length === 0) return { token: null };
  const match = values.length === 1 ? CREDENTIAL.exec(values[0]) : null;
  return match && match[1].length <= 256 ? { token: match[1] } : { error: 'TOKEN_MALFORMED' };
}

function claimsTenant(rawHeaders, url) {
  for (let index = 0; index < rawHeaders.length; index += 2) if (contract.isTenantClaimName(rawHeaders[index])) return true;
  return [...url.searchParams.keys()].some(contract.isTenantClaimName);
}

// The decisions and effects without HTTP: also the surface of the model-level property test.
function createCore(options = {}) {
  const limits = { ...contract.limits, ...options.limits };
  const identity = createIdentity({ now: options.now, randomBytes: options.randomBytes, limits });
  const store = createStore({ limits, randomBytes: options.randomBytes, observe: options.observe });
  return { identity, store, service: createService({ identity, store }), limits };
}

function createApp(options = {}) {
  const { identity, store, service, limits } = createCore(options);
  const hooks = options.hooks || {};
  const queue = createQueue();

  async function route(request, response) {
    const out = createResponder(response);
    const send = (status, body, headers = {}) => out.json(status, body, { Vary: 'Authorization', ...headers });
    const refuse = (code, extra = {}, headers = {}) => {
      const [status, message] = contract.CODES[code];
      return send(status, { outcome: code, error: { code, message }, ...extra }, { ...(status === 401 && { 'WWW-Authenticate': REALM }), ...headers });
    };
    const answer = (result) => {
      if (!result.ok) return refuse(result.code, result.extra);
      return send(result.status, result.status === 304 ? null : { outcome: 'ok', ...result.body }, result.headers);
    };
    let principal = null;
    let op = null;
    // A refusal decided here (not by the service) is recorded where it belongs: the caller's own tenant, or the anonymous ring.
    const reject = (code, extra) => {
      const result = service.reject(principal, op, code, extra);
      return refuse(result.code, result.extra);
    };
    try {
      const refused = localGuard(request, server);
      if (refused) return refuse(refused);
      if (request.url.length > 2048) return refuse('URL_TOO_LONG');
      const origin = `http://127.0.0.1:${server.address().port}`;
      const url = new URL(request.url, origin);
      if (url.origin !== origin || request.url.includes('#')) return refuse('INVALID_URL');
      const isScope = url.pathname === '/scope.json';
      if (isScope || Object.hasOwn(ASSETS, url.pathname)) {
        if (request.method !== 'GET') return refuse('METHOD_NOT_ALLOWED', {}, { Allow: 'GET' });
        if (hasBody(request)) return refuse('UNEXPECTED_BODY');
        if (url.search !== '') return refuse('QUERY_INVALID');
        if (isScope) return send(200, scope);
        const [file, type] = ASSETS[url.pathname];
        return out.file(fs.readFileSync(path.join(__dirname, file)), type);
      }
      const matched = ROUTES.map((candidate) => ({ candidate, found: candidate.re.exec(url.pathname) })).filter((entry) => entry.found);
      if (matched.length === 0) return refuse('NOT_FOUND');
      const hit = matched.find((entry) => entry.candidate.method === request.method);
      if (!hit) return refuse('METHOD_NOT_ALLOWED', {}, { Allow: [...new Set(matched.map((entry) => entry.candidate.method))].join(', ') });
      const { candidate } = hit;
      ({ op } = candidate);
      let id = null;
      if (hit.found[1] !== undefined) {
        try { id = decodeURIComponent(hit.found[1]); } catch { id = ''; }
      }

      // Decision 1: who is it, may this role do this (a presented credential is always verified).
      const bearer = candidate.auth === 'none' ? { token: null } : bearerOf(request.rawHeaders);
      if (bearer.error) return reject(bearer.error);
      if (candidate.auth === 'required') {
        const decided = service.authorize(bearer.token, op);
        if (!decided.ok) return refuse(decided.code, decided.extra);
        principal = decided;
      }
      if (claimsTenant(request.rawHeaders, url)) return reject('TENANT_CLAIM_REJECTED');
      if (!candidate.body && hasBody(request)) return reject('UNEXPECTED_BODY');
      const input = { id, query: null, ifNoneMatch: request.headers['if-none-match'] ?? null, ifMatch: request.headers['if-match'] ?? null, value: null };

      if (candidate.method === 'GET') {
        if (op === 'project.list') {
          const parsed = contract.parseListQuery(url.searchParams);
          if (!parsed.ok) return reject(parsed.code);
          input.query = parsed.query;
        } else if (url.search !== '') {
          return reject('QUERY_INVALID');
        }
        return answer(service.execute(bearer.token, op, input));
      }
      if (url.search !== '') return reject('QUERY_INVALID');
      const info = { op, user: principal ? principal.session.user : null, tenant: principal ? principal.session.tenant : null, sid: principal ? principal.session.sid : null };
      if (candidate.body) {
        if (!JSON_TYPE.test(request.headers['content-type'] || '')) return reject('MEDIA_TYPE_UNSUPPORTED');
        out.proceed();
        hooks.afterAuthorize?.(info);
        const body = await readBody(request, limits.bodyBytes);
        if (isFinished(request.socket)) return undefined;
        if (body.tooLarge) return reject('BODY_TOO_LARGE');
        let parsed;
        try { parsed = JSON.parse(body.buffer.toString('utf8')); } catch { return reject('BODY_INVALID_JSON'); }
        const checked = contract.validateInput(op, parsed);
        if (!checked.ok) return reject(checked.code);
        input.value = checked.value;
      } else {
        hooks.afterAuthorize?.(info);
      }

      // Decision 2 and the effect, linearized: the service repeats the whole decision in the same step as the write.
      return await queue.run(async () => {
        try {
          await hooks.beforeCommit?.(info);
          if (isFinished(request.socket)) return undefined;
          if (op === 'session.anonymous') return answer(service.start());
          if (op === 'session.login') return answer(service.login(bearer.token, input.value.ticket));
          return answer(service.execute(bearer.token, op, input));
        } catch {
          return reject('INTERNAL_ERROR');
        }
      });
    } catch {
      return reject('INTERNAL_ERROR');
    }
  }

  // The requests of one connection run one at a time, in order (createLanes): Node emits every pipelined request of a TCP read before the
  // first answer has finished, so a request pipelined behind a refusal would otherwise run. A client past the bound is cut off.
  const admit = createLanes({ depth: limits.pipelined });
  const server = http.createServer({ connectionsCheckingInterval: limits.checkMs, requireHostHeader: false }, (request, response) => admit(request, response, route));
  // Everything Node would answer by itself goes through the same lanes and the same final-answer path (C009 http-io.cjs rule 4).
  server.on('checkContinue', (request, response) => admit(request, response, route));
  server.on('checkExpectation', (request, response) => admit(request, response, (_request, answer) => createResponder(answer).json(417, {
    outcome: 'EXPECTATION_FAILED', error: { code: 'EXPECTATION_FAILED', message: contract.CODES.EXPECTATION_FAILED[1] }
  }, { Vary: 'Authorization' })));
  server.on('clientError', (error, socket) => admit.refuse(socket, clientErrorCode(error)));
  server.on('connect', (request, socket) => admit.refuse(socket, 'METHOD_NOT_ALLOWED'));
  server.requestTimeout = limits.headerMs;
  server.headersTimeout = limits.headerMs;
  server.keepAliveTimeout = 1000;
  server.timeout = limits.idleMs;
  server.maxConnections = limits.connections;
  // A refusal stops reading with a Node internal (C009 http-io.cjs rule 3). Where it is missing the server serves nothing: it fails closed
  // on the first connection, and at startup when its own listener lacks it, instead of degrading to Connection: close alone.
  let broken = null;
  const failClosed = () => {
    if (broken === null) process.emitWarning('C022 cannot stop reading a refused connection and serves nothing.', { code: 'C022_READ_STOP_UNAVAILABLE' });
    broken = 'READ_STOP_UNAVAILABLE';
  };
  server.once('listening', () => {
    if (canStopReading(server)) return;
    failClosed();
    server.emit('error', new Error('READ_STOP_UNAVAILABLE: this Node cannot stop reading a refused connection'));
  });
  // Every accepted socket is tracked as well, so close() ends a half-open or never-read one the HTTP layer no longer owns.
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
  return {
    server, close, health: () => ({ ok: broken === null, reason: broken }), queued: queue.size,
    issueTicket: (grant, ticketOptions) => identity.issueTicket(grant, ticketOptions),
    // Everything that can change, as plain data. world: identities and resources (what a refused request must not touch); audit: decisions.
    snapshot: () => {
      const state = store.snapshot();
      return { world: { identity: identity.snapshot(), resources: state.tenants }, audit: { tenants: state.audit, anonymous: state.anonymousAudit } };
    },
    auditLog: (tenant) => store.scope(tenant).auditLog(), anonymousLog: store.anonymousLog
  };
}

module.exports = Object.freeze({ createApp, createCore, scope });
