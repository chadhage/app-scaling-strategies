'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { guardOperation } = require(path.join(__dirname, '..', 'C001', 'contract-guard.js'));
const contract = require('./contract.js');
const { createWorld, FixtureError } = require('./fixture.cjs');

const LEDGER = path.join(__dirname, '..', '..', '.docs', 'wiki', 'flow-state.json');
const LISTENER_LIFETIME_MS = 10 * 60 * 1000;
const scope = Object.freeze({
  cardId: 'C032', businessData: 'synthetic', transport: '127.0.0.1 HTTP only',
  credentialTransport: 'Authorization Bearer header only; cookies are never read or set',
  testRuntime: process.version, approvedProductionTarget: 'Node.js 24 LTS / Express / App Service Linux',
  productionRuntimeValidated: false, identityVerified: false, nativeTargetQualified: false,
  controlApiImplemented: false, durableStoreImplemented: false, liveAzureRuns: 0, authorizedCloudSpend: 0
});
const assets = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/contract.js': ['contract.js', 'text/javascript; charset=utf-8'],
  '/client.js': ['client.js', 'text/javascript; charset=utf-8'],
  '/page.js': ['page.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8']
});
const baseHeaders = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-C032-Scope': 'synthetic-loopback-only'
});

function readAssetFile(file) {
  return fs.readFileSync(path.join(__dirname, file));
}

function authorizationOf(request) {
  const lines = request.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'authorization');
  if (lines.length > 1) throw new FixtureError(400, 'CREDENTIAL_AMBIGUOUS', 'Exactly one Authorization header is allowed.');
  return request.headers.authorization;
}

// The Cookie request header is deliberately never read, and no response ever sets a cookie.
function createLocalServer({ world = createWorld(), onRequest, readAsset = readAssetFile } = {}) {
  const server = http.createServer((request, response) => {
    function send(status, value, type = 'application/json; charset=utf-8', extra = {}) {
      const body = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
      response.writeHead(status, { ...baseHeaders, 'Content-Type': type, 'Content-Length': body.length, ...extra });
      response.end(body);
    }
    function fail(status, code, message, extra) {
      send(status, { error: { code, message }, businessData: 'synthetic', localOnly: true }, undefined, extra);
    }

    try {
      if (onRequest) onRequest({ method: request.method, url: request.url, headers: { ...request.headers }, rawHeaders: [...request.rawHeaders] });
      const host = `127.0.0.1:${server.address().port}`;
      const origin = `http://${host}`;
      if (request.socket.remoteAddress !== '127.0.0.1' || request.headers.host !== host) {
        return fail(421, 'LOCAL_HOST_REQUIRED', 'Only the actual 127.0.0.1 listener is supported.');
      }
      if (request.headers.origin && request.headers.origin !== origin) {
        return fail(403, 'CROSS_ORIGIN_DENIED', 'This synthetic fixture supports only its own loopback origin.');
      }
      if (!request.url || request.url.length > 2048) return fail(414, 'URL_TOO_LONG', 'The local request URL is too long.');
      const url = new URL(request.url, origin);
      if (url.origin !== origin || url.hash) return fail(400, 'INVALID_URL', 'An explicit local URL without a fragment is required.');
      const known = url.pathname === contract.paths.observation || url.pathname === contract.paths.scope || Object.hasOwn(assets, url.pathname);
      if (!known) return fail(404, 'NOT_FOUND', 'No local fixture route or asset has that path.');
      if (request.method !== 'GET') return fail(405, 'METHOD_NOT_ALLOWED', 'Only read-only GET is supported.', { Allow: 'GET' });
      if (request.headers['transfer-encoding'] || Number(request.headers['content-length'] || 0) > 0) {
        return fail(400, 'UNEXPECTED_BODY', 'Requests must not contain a body; nothing a caller sends is an observation.');
      }
      if (request.url.includes('?')) {
        return fail(400, 'INVALID_QUERY', 'No query parameters are accepted; destination, state and stamp are server-owned.');
      }
      if (url.pathname === contract.paths.observation) {
        const observation = world.serve(world.authenticate(authorizationOf(request)));
        return send(200, observation, undefined, {
          'X-C032-Destination': observation.destination.id,
          'X-C032-State-Counter': String(observation.state.counter),
          'X-C032-Stamp': observation.stamp
        });
      }
      if (url.pathname === contract.paths.scope) return send(200, scope);
      const [file, type] = assets[url.pathname];
      return send(200, readAsset(file), type);
    } catch (error) {
      if (error instanceof FixtureError) {
        return fail(error.status, error.code, error.message, error.status === 401 ? { 'WWW-Authenticate': 'Bearer realm="c032-synthetic"' } : undefined);
      }
      if (error instanceof TypeError && error.code === 'ERR_INVALID_URL') return fail(400, 'INVALID_URL', 'The local URL is malformed.');
      return fail(500, 'FIXTURE_UNAVAILABLE', 'The local fixture is unavailable; no observation was made.');
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 1000;
  return server;
}

function readLedgerText(file = LEDGER) {
  return fs.readFileSync(file, 'utf8');
}

function readCurrentApproval({ read = readLedgerText, attempts = 3 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return JSON.parse(read()).approvals.C001;
    } catch {
      // The ledger can be mid-write while the coordinator updates it; retry before failing closed.
    }
  }
  throw new Error('C001 current consent is unavailable; the local listener was not started.');
}

async function startLocal({ readApproval = readCurrentApproval, guard = guardOperation, ...serverOptions } = {}) {
  const permission = await guard('local.probe', readApproval());
  if (!permission.allowed) {
    throw new Error(`C001 local consent denied: ${permission.reasons.map((reason) => reason.code).join(', ')}`);
  }
  const server = createLocalServer(serverOptions);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

function onceProcess(name, handler) {
  process.once(name, handler);
}

function scheduleClose(handler, delay) {
  return setTimeout(handler, delay).unref();
}

async function runCli(argv, {
  start = startLocal, log = console.log, error = console.error, once = onceProcess,
  lifetimeMs = LISTENER_LIFETIME_MS, schedule = scheduleClose
} = {}) {
  if (argv.length !== 0) {
    error('C032 accepts no host, port, identity, credential, destination, stamp, or consent overrides.');
    return { exitCode: 1 };
  }
  let server;
  try {
    server = await start();
  } catch (failure) {
    error(failure.message);
    return { exitCode: 1 };
  }
  log(JSON.stringify({
    event: 'C032-local-listening', pid: process.pid, origin: `http://127.0.0.1:${server.address().port}`, lifetimeMs, scope
  }));
  const close = () => { server.closeAllConnections(); server.close(); };
  once('SIGINT', close);
  once('SIGTERM', close);
  schedule(close, lifetimeMs);
  return { exitCode: 0, server, close };
}

if (require.main === module) {
  runCli(process.argv.slice(2)).then((result) => { process.exitCode = result.exitCode; });
}

module.exports = Object.freeze({
  LISTENER_LIFETIME_MS, scope, createLocalServer, readLedgerText, readCurrentApproval, startLocal, onceProcess, scheduleClose, runCli
});
