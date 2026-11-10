'use strict';

// The C010 server: wiring only. Identity, the role table, the refusal path and the lanes are the accepted C009 pieces (imported read-only);
// who owns what is decided in store.cjs and nowhere else. Every request goes through ONE function, route(); every refusal through ONE refuse().
// The order of a request: guard (Host, Origin), URL, route (unknown, method), credential (always verified when presented), role (deny by
// default), query (closed vocabulary), body, then the owner of every target, and for a mutation the owner of every target AGAIN inside the
// linearized commit (store.cjs), together with the token. A request whose connection was refused or ended while it waited is dropped without
// an answer, audit record or effect.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { AuthError, claimedHeaders: sharedClaims, createTokenRegistry, decide, parseBearer } = require('../C009/authz.cjs');
const { createQueue } = require('../C009/queue.cjs');
const { canStopReading, clientErrorCode, createLanes, createResponder, hasBody, isFinished, localGuard, readBody } = require('../C009/http-io.cjs');
const contract = require('./contract.js');
const { CODES } = require('./codes.cjs');
const { createAudit } = require('./audit.cjs');
const { createStore } = require('./store.cjs');

const scope = Object.freeze({
  cardId: 'C010', businessData: 'synthetic', transport: '127.0.0.1 HTTP only', testRuntime: process.version,
  approvedProductionTarget: 'Node.js 24 LTS / Express / Microsoft Entra ID', roles: contract.roles,
  leaseOwnershipEnforcedServerSide: true, publicState: false, entraIntegrated: false, identityRegistered: false, productionRuntimeValidated: false,
  nativeTargetQualified: false, liveAzureRuns: 0, authorizedCloudSpend: 0
});
const ASSETS = Object.freeze({
  'asset.index': ['index.html', 'text/html; charset=utf-8'], 'asset.page': ['page.js', 'text/javascript; charset=utf-8'], 'asset.style': ['style.css', 'text/css; charset=utf-8']
});
const JSON_TYPE = /^application\/json\s*(;.*)?$/i;
// Names a client may use to claim an owner, a lease or a method; they are reported by name and never obeyed (C009 lists the role and subject ones).
const MORE_CLAIMS = new Set(['x-lease', 'x-lease-id', 'lease', 'lease-id', 'x-tenant', 'x-resource-owner', 'x-http-method-override', 'x-method-override', 'x-http-method']);
const METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE']);

function claimedHeaders(rawHeaders) {
  const names = new Set(sharedClaims(rawHeaders));
  for (let index = 0; index < rawHeaders.length; index += 2) if (MORE_CLAIMS.has(rawHeaders[index].toLowerCase())) names.add(rawHeaders[index].toLowerCase());
  return [...names].sort();
}

function resolveLimits(given = {}) {
  const limits = { ...contract.limits };
  for (const [name, value] of Object.entries(given)) {
    if (!contract.tunable.includes(name) || !Number.isInteger(value) || value < 1) throw Object.assign(new RangeError(`Invalid limit ${name}`), { code: 'LIMITS_INVALID' });
    limits[name] = value;
  }
  return limits;
}

// What each route asks of the store. READS change nothing; WRITES run inside the queue and resolve their targets again.
const READS = Object.freeze({
  'lease.list': ({ store, subject, query }) => store.listLeases(subject, query),
  'lease.read': ({ store, subject, params }) => store.readLease(subject, params.lease),
  'resource.list': ({ store, subject, params, query, route }) => store.listResources(subject, params.lease, route.kind, query),
  'resource.read': ({ store, subject, params, route }) => store.readResource(subject, params.lease, route.kind, params.id),
  'operator.leases': ({ store, query }) => store.operatorLeases(query)
});
const WRITES = Object.freeze({
  'lease.create': ({ store, subject, body }) => store.apply(subject, 'createLease', body),
  'lease.end': ({ store, subject, params }) => store.apply(subject, 'endLease', { lease: params.lease }),
  'resource.create': ({ store, subject, params, body, route }) => store.apply(subject, 'createResource', { lease: params.lease, kind: route.kind, input: body }),
  'resource.update': ({ store, subject, params, body, route }) => store.apply(subject, 'updateResource', { lease: params.lease, kind: route.kind, id: params.id, patch: body }),
  'resource.delete': ({ store, subject, params, route }) => store.apply(subject, 'deleteResource', { lease: params.lease, kind: route.kind, id: params.id }),
  'run.cancel': ({ store, subject, params }) => store.apply(subject, 'cancelRun', { lease: params.lease, id: params.id }),
  batch: ({ store, subject, body }) => store.batch(subject, body.ops)
});
// The targets a mutation names in its URL, decided before its body is read.
const URL_TARGETS = Object.freeze({
  'lease.end': (params) => [{ lease: params.lease }], 'resource.create': (params) => [{ lease: params.lease }],
  'resource.update': (params, route) => [{ lease: params.lease, kind: route.kind, id: params.id }], 'resource.delete': (params, route) => [{ lease: params.lease, kind: route.kind, id: params.id }],
  'run.cancel': (params) => [{ lease: params.lease, kind: 'run', id: params.id }]
});

function createApp(options = {}) {
  const limits = resolveLimits(options.limits);
  const roleTable = options.roleTable || contract.roleTable;
  const hooks = options.hooks || {};
  const conductors = Object.values(contract.identities).filter((identity) => identity.role === 'conductor').map((identity) => identity.subject);
  const registry = createTokenRegistry({ now: options.now, randomBytes: options.randomBytes });
  const store = createStore({ now: options.now, newId: options.newId, ownerEntries: limits.ownerEntries, owners: conductors });
  const audit = createAudit({ perSubject: limits.auditEntries, anonymous: limits.anonymousEntries });
  const queue = createQueue();

  function auditView({ limit, offset }) {
    const log = audit.log();
    const items = log.slice(offset, offset + limit).map(({ seq, subject, role, route, method, outcome, code }) => ({ seq, subject, role, route, method, outcome, code }));
    return { total: log.length, offset, limit, items };
  }

  async function route(request, response, forced = null) {
    const out = createResponder(response);
    const claims = claimedHeaders(request.rawHeaders);
    const ctx = { subject: null, role: null, route: null, method: METHODS.has(request.method) ? request.method : 'OTHER' };
    // A connection that was refused (marked by C009) or ended (the client left, or the lane cut it) while this request waited: nothing is committed or answered.
    const cancelled = () => isFinished(request.socket) || request.socket.destroyed;
    const finish = (outcome, code) => audit.record({ subject: ctx.subject, role: ctx.role, route: ctx.route, method: ctx.method, outcome, code });
    // THE refusal: every error answer of this server is written here; the responder marks the socket, says Connection: close and stops reading.
    const refuse = (code, extra = {}, headers = {}) => {
      finish('refused', code);
      const [status, message] = CODES[code];
      return out.json(status, { outcome: code, error: { code, message }, ...extra, ignoredClaims: claims }, headers);
    };
    const refuseAuth = (error) => refuse(error.code, {}, { 'WWW-Authenticate': error.challenge });
    const answer = (build, outcome) => {
      finish(outcome, 'ok');
      return out.json(200, { outcome: 'ok', ...build(), ignoredClaims: claims });
    };
    try {
      if (forced !== null) return refuse(forced);
      const guard = localGuard(request, server);
      if (guard) return refuse(guard);
      if (request.url.length > limits.urlChars) return refuse('URL_TOO_LONG');
      if (!request.url.startsWith('/') || request.url.startsWith('//') || request.url.includes('#')) return refuse('INVALID_URL');
      const cut = request.url.indexOf('?');
      const pathname = cut === -1 ? request.url : request.url.slice(0, cut);
      const rawQuery = cut === -1 ? '' : request.url.slice(cut + 1);
      const found = contract.resolve(pathname);
      if (found.routes.length === 0) return refuse(pathname.startsWith('/v1/leases/') ? 'TARGET_NOT_FOUND' : 'NOT_FOUND');
      const matched = found.routes.find((candidate) => candidate.method === request.method);
      if (!matched) return refuse('METHOD_NOT_ALLOWED', {}, { Allow: contract.allowedMethods(found.routes) });
      ctx.route = matched.name;

      // A presented credential is always verified, on public routes too; it is never read as anonymous.
      const token = parseBearer(request.rawHeaders);
      const identity = token === null ? null : registry.verify(token);
      if (matched.public) {
        if (rawQuery !== '') return refuse('QUERY_NOT_ALLOWED');
        if (hasBody(request)) return refuse('UNEXPECTED_BODY');
        if (matched.name === 'scope') return out.json(200, scope);
        const [file, type] = ASSETS[matched.name];
        return out.file(fs.readFileSync(path.join(__dirname, file)), type);
      }
      if (identity === null) throw new AuthError('AUTHENTICATION_REQUIRED');
      ctx.subject = identity.subject;
      ctx.role = identity.role;
      const decision = decide(roleTable, matched.name, identity.role);
      if (!decision.allowed) return refuse(decision.code);
      const query = contract.parseQuery(matched, rawQuery);
      if (!query.ok) return refuse(query.code);
      if (matched.body === null && hasBody(request)) return refuse('UNEXPECTED_BODY');

      const context = { store, subject: identity.subject, params: found.params, query: query.value, route: matched, body: null };
      if (!matched.mutating) {
        if (matched.name === 'me') return answer(() => ({ subject: identity.subject, role: identity.role }), 'read');
        if (matched.name === 'operator.audit') return answer(() => auditView(query.value), 'read');
        const result = READS[matched.name](context);
        return result.ok ? answer(() => result.value, 'read') : refuse(result.code);
      }

      // The first decision of a mutation, before its body is read: every target in the URL must belong to this subject.
      const targets = Object.hasOwn(URL_TARGETS, matched.name) ? URL_TARGETS[matched.name](found.params, matched) : [];
      if (targets.some((target) => !store.has(identity.subject, target))) return refuse('TARGET_NOT_FOUND');
      if (matched.body !== null && !JSON_TYPE.test(request.headers['content-type'] || '')) return refuse('MEDIA_TYPE_UNSUPPORTED');
      if (matched.body !== null) {
        out.proceed();
        const read = await readBody(request, limits.bodyBytes);
        if (cancelled()) return undefined;
        if (read.tooLarge) return refuse('BODY_TOO_LARGE');
        let parsed;
        try { parsed = JSON.parse(read.buffer.toString('utf8')); } catch { return refuse('BODY_INVALID_JSON'); }
        const checked = contract.validateBody(matched.body, parsed);
        if (!checked.ok) return refuse(checked.code, checked.field === undefined ? {} : { field: checked.field });
        context.body = checked.value;
        if (matched.name === 'batch' && context.body.ops.some((operation) => !store.has(identity.subject, operation))) return refuse('TARGET_NOT_FOUND');
      }

      // The second decision, where the effect is committed: the hook may change the world while this request waits; the token is verified again
      // and every target is decided again (inside the store), and a connection that ended or was refused in the meantime ends the request with no
      // effect, no audit record and no answer. The role is not decided twice: it belongs to the token entry, which never changes after issue.
      const effect = async () => {
        try {
          await hooks.beforeCommit?.({ route: matched.name, subject: identity.subject });
          if (cancelled()) return undefined;
          registry.verify(token);
          const result = WRITES[matched.name](context);
          return result.ok ? answer(() => result.value, 'applied') : refuse(result.code);
        } catch (error) {
          if (error instanceof AuthError) return refuseAuth(error);
          throw error;
        }
      };
      return await queue.run(effect);
    } catch (error) {
      if (error instanceof AuthError) return refuseAuth(error); else if (cancelled()) return undefined;
      return refuse('INTERNAL_ERROR');
    }
  }

  // The requests of one connection run one at a time, in order (C009 createLanes); everything Node would answer by itself goes through the same
  // lanes and the same refusal (http-io.cjs rule 4). No `upgrade` listener exists: an Upgrade header is an ordinary request here.
  const admit = createLanes({ depth: limits.pipelined });
  const server = http.createServer({ connectionsCheckingInterval: limits.checkMs, requireHostHeader: false }, (request, response) => admit(request, response, route));
  server.on('checkContinue', (request, response) => admit(request, response, route));
  server.on('checkExpectation', (request, response) => admit(request, response, (queued, answered) => route(queued, answered, 'EXPECTATION_FAILED')));
  const refuseSocket = (socket, code) => {
    audit.record({ subject: null, role: null, route: null, method: 'OTHER', outcome: 'refused', code });
    admit.refuse(socket, code);
  };
  server.on('clientError', (error, socket) => refuseSocket(socket, clientErrorCode(error)));
  server.on('connect', (request, socket) => refuseSocket(socket, 'METHOD_NOT_ALLOWED'));
  server.requestTimeout = limits.headerMs;
  server.headersTimeout = limits.headerMs;
  server.keepAliveTimeout = 1000;
  server.timeout = limits.idleMs;
  server.maxConnections = limits.connections;
  // A refusal stops reading with a Node internal (http-io.cjs rule 3): where it is missing nothing is served (fail closed).
  let broken = null;
  const failClosed = () => {
    if (broken === null) process.emitWarning('C010 cannot stop reading a refused connection and serves nothing.', { code: 'C010_READ_STOP_UNAVAILABLE' });
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
  return {
    server, close, queued: queue.size, snapshot: store.snapshot, auditLog: audit.log, stats: store.stats, transfer: store.transfer,
    health: () => ({ ok: broken === null, reason: broken }), issueToken: (identity, tokenOptions) => registry.issue(identity, tokenOptions)
  };
}

// A server on 127.0.0.1 and an automatic port with a token for each of the four synthetic identities (the page, the child process and the browser use it).
async function startLocal(options = {}) {
  const app = createApp(options);
  await new Promise((resolve, reject) => {
    app.server.once('error', reject);
    app.server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = app.server.address();
  const tokens = Object.fromEntries(Object.keys(contract.identities).map((name) => [name, app.issueToken(name, { ttlMs: options.tokenMs })]));
  return { app, port, origin: `http://127.0.0.1:${port}`, tokens, close: app.close };
}

module.exports = Object.freeze({ createApp, startLocal, scope });
