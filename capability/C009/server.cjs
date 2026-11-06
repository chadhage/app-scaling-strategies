'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const contract = require('./contract.js');
const { AuthError, authenticate, claimedHeaders, createTokenRegistry, decide } = require('./authz.cjs');
const { createCommandPipeline } = require('./commands.cjs');
const { defaultHandlers } = require('./handlers.cjs');
const { createLedger } = require('./ledger.cjs');
const { createQueue } = require('./queue.cjs');
const { canStopReading, clientErrorCode, createLanes, createResponder, hasBody, localGuard } = require('./http-io.cjs');

const scope = Object.freeze({
  cardId: 'C009', businessData: 'synthetic', transport: '127.0.0.1 HTTP only', testRuntime: process.version,
  approvedProductionTarget: 'Node.js 24 LTS / Express / Microsoft Entra ID', roles: contract.roles,
  authorizationEnforcedServerSide: true, entraIntegrated: false, identityRegistered: false, productionRuntimeValidated: false,
  nativeTargetQualified: false, liveAzureRuns: 0, authorizedCloudSpend: 0
});
const ASSETS = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/page.js': ['page.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8']
});
const COMMAND_ROUTE = /^\/v1\/commands\/([^/]+)$/;
const READ_ROUTES = new Set(['/v1/state', '/v1/authorization/preview', '/scope.json', ...Object.keys(ASSETS)]);

function createApp(options = {}) {
  const { idleMs, connections, pipelined, entries, ownerEntries, auditEntries, anonymousEntries, headerMs, checkMs } = { ...contract.limits, ...options.limits };
  const table = options.commands || contract.commands;
  const registry = createTokenRegistry({ now: options.now, randomBytes: options.randomBytes });
  const ledger = createLedger(auditEntries, entries, { ownerLimit: ownerEntries, anonymousLimit: anonymousEntries });
  const queue = createQueue();
  const handleCommand = createCommandPipeline({
    registry, ledger, queue, table, handlers: options.handlers || defaultHandlers, hooks: options.hooks || {},
    validate: options.validateInput || contract.validateInput
  });

  // Every GET verifies a presented credential, so a bad one is never read as "anonymous"; only the preview requires one.
  function read(request, out, url) {
    const identity = authenticate(registry, request.rawHeaders);
    if (Object.hasOwn(ASSETS, url.pathname)) {
      if (url.search !== '') return out.fail('QUERY_NOT_ALLOWED');
      const [file, type] = ASSETS[url.pathname];
      return out.file(fs.readFileSync(path.join(__dirname, file)), type);
    }
    if (url.pathname !== '/v1/authorization/preview') {
      if (url.search !== '') return out.fail('QUERY_NOT_ALLOWED');
      return out.json(200, url.pathname === '/scope.json' ? scope : { outcome: 'ok', ...ledger.snapshot() });
    }
    if (identity === null) throw new AuthError('AUTHENTICATION_REQUIRED');
    const params = [...url.searchParams];
    if (params.length !== 1 || params[0][0] !== 'command') return out.fail('QUERY_INVALID');
    const command = params[0][1];
    if (!contract.isCommandName(command)) return out.fail('COMMAND_NAME_INVALID');
    const { allowed, status, code, requiredRoles } = decide(table, command, identity.role);
    return out.json(200, {
      outcome: 'ok', preview: { command, allowed, status, code, role: identity.role, subject: identity.subject, requiredRoles },
      ignoredClaims: claimedHeaders(request.rawHeaders)
    });
  }

  async function route(request, response) {
    const out = createResponder(response);
    try {
      const refused = localGuard(request, server);
      if (refused) return out.fail(refused);
      if (request.url.length > 2048) return out.fail('URL_TOO_LONG');
      const origin = `http://127.0.0.1:${server.address().port}`;
      const url = new URL(request.url, origin);
      if (url.origin !== origin || request.url.includes('#')) return out.fail('INVALID_URL');
      const command = COMMAND_ROUTE.exec(url.pathname);
      if (command) {
        if (request.method !== 'POST') return out.fail('METHOD_NOT_ALLOWED', {}, { Allow: 'POST' });
        return await handleCommand(request, out, url, command[1]);
      }
      if (!READ_ROUTES.has(url.pathname)) return out.fail('NOT_FOUND');
      if (request.method !== 'GET') return out.fail('METHOD_NOT_ALLOWED', {}, { Allow: 'GET' });
      if (hasBody(request)) return out.fail('UNEXPECTED_BODY');
      return read(request, out, url);
    } catch (error) {
      if (error instanceof AuthError) return out.fail(error.code, {}, { 'WWW-Authenticate': error.challenge });
      if (error?.code === 'ERR_INVALID_URL') return out.fail('INVALID_URL');
      return out.fail('INTERNAL_ERROR');
    }
  }

  // The requests of one connection run one at a time, in order (createLanes): Node emits every pipelined request of a TCP read before the
  // first answer has finished, so a request pipelined behind a refusal would otherwise run. A client past the bound of requests in
  // flight per socket is cut off.
  const admit = createLanes({ depth: pipelined });
  // Node checks the header and request timeouts only every connectionsCheckingInterval (30 s by default): set it, or a client that
  // trickles one byte every 2 s is cut after 30 s and 256 of them hold the whole listener. requireHostHeader: false lets a request
  // without Host reach localGuard, which refuses it with a typed answer, instead of Node's own bare 400.
  const server = http.createServer({ connectionsCheckingInterval: checkMs, requireHostHeader: false }, (request, response) => admit(request, response, route));
  // Everything Node would answer by itself goes through the same lanes and the same final-answer path (http-io.cjs rule 4): an
  // Expect other than 100-continue (Node would answer 417 and keep the connection), the 100 Continue of a request that is about to be
  // read (a refused one is never invited to send its body), a parse error, an oversized header, a timeout, and CONNECT.
  server.on('checkContinue', (request, response) => admit(request, response, route));
  server.on('checkExpectation', (request, response) => admit(request, response, (_request, answer) => createResponder(answer).fail('EXPECTATION_FAILED')));
  server.on('clientError', (error, socket) => admit.refuse(socket, clientErrorCode(error)));
  server.on('connect', (request, socket) => admit.refuse(socket, 'METHOD_NOT_ALLOWED'));
  server.requestTimeout = headerMs;
  server.headersTimeout = headerMs;
  server.keepAliveTimeout = 1000;
  server.timeout = idleMs;
  server.maxConnections = connections;
  // A refusal stops reading with a Node internal (http-io.cjs rule 3). Where it is missing the server serves nothing: it fails closed on
  // the first connection, and at startup when its own listener lacks it, instead of degrading to Connection: close alone.
  let broken = null;
  const failClosed = () => {
    if (broken === null) process.emitWarning('C009 cannot stop reading a refused connection and serves nothing.', { code: 'C009_READ_STOP_UNAVAILABLE' });
    broken = 'READ_STOP_UNAVAILABLE';
  };
  server.once('listening', () => {
    if (canStopReading(server)) return;
    failClosed();
    server.emit('error', new Error('READ_STOP_UNAVAILABLE: this Node cannot stop reading a refused connection'));
  });
  // Every accepted socket is tracked here as well, so close() ends a half-open or never-read one the HTTP layer no longer owns.
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
    server, close, queued: queue.size, snapshot: ledger.snapshot, auditLog: ledger.auditLog, health: () => ({ ok: broken === null, reason: broken }),
    issueToken: (identity, tokenOptions) => registry.issue(identity, tokenOptions)
  };
}

module.exports = Object.freeze({ createApp, defaultHandlers, scope });
