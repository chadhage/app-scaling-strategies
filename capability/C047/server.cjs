'use strict';
const http = require('node:http');
const contract = require('../C022/contract.js');
const { createCore } = require('../C022/server.cjs');
const { parseBearer } = require('../C009/authz.cjs');
const { createQueue } = require('../C009/queue.cjs');
const io = require('../C009/http-io.cjs');

const ROUTES = Object.freeze([
  ...['/candidate', '/candidate/', '/candidate/profile.json', '/v2', '/v2/', '/v2/profile.json', '/assets/candidate.json']
    .map(path => Object.freeze({ path, method: 'GET', op: 'profile.list', candidate: true, body: false })),
  ...['/candidate/manifest.json', '/v2/manifest.json']
    .map(path => Object.freeze({ path, method: 'GET', op: 'manifest', candidate: true, body: false })),
  ...['/candidate/projects', '/v2/projects']
    .map(path => Object.freeze({ path, method: 'POST', op: 'project.create', candidate: true, body: true })),
  ...[
    ['/', 'GET', 'scope', false], ['/scope.json', 'GET', 'scope', false],
    ['/v1/session/anonymous', 'POST', 'session.anonymous', false], ['/v1/session/login', 'POST', 'session.login', true],
    ['/v1/session', 'GET', 'session.whoami', false], ['/v1/session/logout', 'POST', 'session.logout', false],
    ['/v1/session/switch', 'POST', 'session.switch', true], ['/v1/admin/revoke', 'POST', 'admin.revoke', true],
    ['/v1/admin/role', 'POST', 'admin.role', true]
  ].map(([path, method, op, body]) => Object.freeze({ path, method, op, body, candidate: false }))
]);
const SCOPE = Object.freeze({
  cardId: 'C047', mode: 'synthetic-offline-loopback', previewAuthority: 'C022 project.create (current member/admin)',
  cloudActions: false, entraIntegrated: false, liveAzureRuns: 0, authorizedCloudSpend: 0,
  routes: ROUTES
});

function createApp(options = {}) {
  const { identity, store, service, limits } = createCore(options);
  const hooks = options.hooks || {}, queue = createQueue(), sockets = new Set();
  const admit = io.createLanes({ depth: limits.pipelined });
  let broken = null, closing;

  async function route(request, response) {
    const out = io.createResponder(response);
    const send = (status, body, headers = {}) => out.json(status, body, { Vary: 'Authorization', ...headers });
    const refuse = code => {
      const [status, message] = contract.CODES[code];
      return send(status, { outcome: code, error: { code, message } }, status === 401 ? { 'WWW-Authenticate': 'Bearer realm="c047-local"' } : {});
    };
    const answer = result => result.ok ? send(result.status, { outcome: 'ok', ...result.body }) : refuse(result.code);
    const reject = code => { service.reject(null, 'preview', code); return refuse(code); };
    try {
      const local = io.localGuard(request, server);
      if (local) return reject(local);
      if (request.url.length > 2048) return reject('URL_TOO_LONG');
      const origin = `http://127.0.0.1:${server.address().port}`, url = new URL(request.url, origin);
      if (url.origin !== origin || !request.url.startsWith('/') || request.url.includes('#') || url.pathname !== request.url.split('?')[0]) return reject('INVALID_URL');
      const row = ROUTES.find(candidate => candidate.path === url.pathname);
      if (!row) return reject('NOT_FOUND');
      if (!row.candidate && request.method !== row.method) return reject('METHOD_NOT_ALLOWED');
      let token = null;
      if (row.op !== 'scope' && row.op !== 'session.anonymous') {
        try { token = parseBearer(request.rawHeaders); } catch { return reject('TOKEN_MALFORMED'); }
        if (row.op !== 'session.login') {
          const decision = service.authorize(token, row.candidate ? 'project.create' : row.op);
          if (!decision.ok) return refuse(decision.code);
        }
      }
      for (let index = 0; index < request.rawHeaders.length; index += 2) {
        if (contract.isTenantClaimName(request.rawHeaders[index])) return reject('TENANT_CLAIM_REJECTED');
      }
      if ([...url.searchParams.keys()].some(contract.isTenantClaimName)) return reject('TENANT_CLAIM_REJECTED');
      if (url.search !== '') return reject('QUERY_INVALID');
      if (request.method !== row.method) return reject('METHOD_NOT_ALLOWED');
      if (!row.body && io.hasBody(request)) return reject('UNEXPECTED_BODY');
      const info = Object.freeze({ path: row.path, op: row.op, candidate: row.candidate });
      await hooks.afterAuthorize?.(info);
      if (request.socket.destroyed || io.isFinished(request.socket)) return undefined;
      let value = null;
      if (row.body) {
        if (!/^application\/json\s*(;.*)?$/i.test(request.headers['content-type'] || '')) return reject('MEDIA_TYPE_UNSUPPORTED');
        out.proceed();
        const body = await io.readBody(request, limits.bodyBytes);
        if (request.socket.destroyed || io.isFinished(request.socket)) return undefined;
        if (body.tooLarge) return reject('BODY_TOO_LARGE');
        let parsed;
        try { parsed = JSON.parse(body.buffer.toString('utf8')); } catch { return reject('BODY_INVALID_JSON'); }
        const checked = contract.validateInput(row.op, parsed);
        if (!checked.ok) return reject(checked.code);
        value = checked.value;
      }
      return await queue.run(async () => {
        await hooks.beforeBoundary?.(info);
        if (request.socket.destroyed || io.isFinished(request.socket)) return undefined;
        // The accepted authority is repeated after every await, in the same tick as serving or the effect.
        if (row.candidate) {
          const current = service.authorize(token, 'project.create');
          if (!current.ok) return refuse(current.code);
          if (row.op === 'manifest') return send(200, {
            outcome: 'ok', candidate: 'v2', tenant: current.session.tenant, authority: 'C022 project.create', synthetic: true
          });
        }
        if (row.op === 'scope') return send(200, SCOPE);
        if (row.op === 'session.anonymous') return answer(service.start());
        if (row.op === 'session.login') return answer(service.login(token, value.ticket));
        return answer(service.execute(token, row.op, { value }));
      });
    } catch { return reject('INTERNAL_ERROR'); }
  }

  const server = http.createServer({ connectionsCheckingInterval: limits.checkMs, requireHostHeader: false }, (q, r) => admit(q, r, route));
  server.on('checkContinue', (q, r) => admit(q, r, route));
  server.on('checkExpectation', (q, r) => admit(q, r, (_q, answer) => io.createResponder(answer).fail('EXPECTATION_FAILED')));
  server.on('clientError', (error, socket) => admit.refuse(socket, io.clientErrorCode(error)));
  server.on('connect', (_q, socket) => admit.refuse(socket, 'METHOD_NOT_ALLOWED'));
  server.on('upgrade', (_q, socket) => admit.refuse(socket, 'METHOD_NOT_ALLOWED'));
  server.requestTimeout = limits.headerMs;
  server.headersTimeout = limits.headerMs;
  server.keepAliveTimeout = 1000;
  server.timeout = limits.idleMs;
  server.maxConnections = limits.connections;
  const failClosed = () => { broken = 'READ_STOP_UNAVAILABLE'; };
  server.once('listening', () => {
    if (!io.canStopReading(server)) { failClosed(); server.emit('error', new Error(broken)); }
  });
  server.on('connection', socket => {
    if (!io.canStopReading(socket)) failClosed();
    if (broken !== null) { socket.destroy(); return; }
    sockets.add(socket); socket.once('close', () => sockets.delete(socket));
  });
  const close = () => {
    if (!closing) closing = new Promise(resolve => {
      server.close(resolve); server.closeAllConnections();
      for (const socket of sockets) socket.destroy();
    });
    return closing;
  };
  return Object.freeze({
    server, close, health: () => ({ ok: broken === null, reason: broken }), queued: queue.size,
    issueTicket: (grant, ticketOptions) => identity.issueTicket(grant, ticketOptions),
    snapshot: () => ({ world: { identity: identity.snapshot(), resources: store.snapshot().tenants } })
  });
}
module.exports = Object.freeze({ createApp, ROUTES, SCOPE });
