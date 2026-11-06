'use strict';

// The local fixture process: one HTTP/1.1 listener for the transcript page and one gRPC listener (HTTP/2), both on
// 127.0.0.1 with automatic ports. The CLI rechecks the current C001 local-probe consent before it binds anything.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { guardOperation } = require(path.join(__dirname, '..', 'C001', 'contract-guard.js'));
const { createGrpcServer } = require('./grpc-server.cjs');
const { produceTranscript } = require('./transcript.cjs');

const scope = Object.freeze({
  cardId: 'C028', businessData: 'synthetic', transport: '127.0.0.1 gRPC over cleartext HTTP/2 (node:http2) plus an HTTP/1.1 transcript page',
  testRuntime: process.version, approvedProductionTarget: 'Node.js 24 LTS / Express / App Service Linux',
  productionRuntimeValidated: false, identityVerified: false, nativeTargetQualified: false,
  controlApiImplemented: false, durableStoreImplemented: false, liveAzureRuns: 0, authorizedCloudSpend: 0,
  browserNativeGrpcObserved: false, transcriptProducedByServerSideConversation: true
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
  'X-C028-Scope': 'synthetic-loopback-only'
});

function createWebServer({ transcript = produceTranscript } = {}) {
  // Concurrent requests share one running conversation, so a flood of GETs cannot start a flood of fixture servers.
  let inflight = null;
  const sharedTranscript = () => {
    inflight ??= Promise.resolve().then(transcript).finally(() => { inflight = null; });
    return inflight;
  };
  const server = http.createServer((request, response) => {
    function send(status, value, type = 'application/json; charset=utf-8') {
      const body = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
      response.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type, 'Content-Length': body.length });
      response.end(body);
    }
    const fail = (status, code, message) => send(status, { error: { code, message }, businessData: 'synthetic', localOnly: true });
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
      const known = ['/scope.json', '/transcript.json', ...Object.keys(assets)];
      if (known.includes(url.pathname) && url.search) return fail(400, 'INVALID_QUERY', 'This route accepts no query parameters.');
      if (url.pathname === '/scope.json') return send(200, scope);
      if (url.pathname === '/transcript.json') {
        sharedTranscript().then((value) => send(200, value), () => {
          fail(500, 'TRANSCRIPT_UNAVAILABLE', 'The local gRPC conversation failed; no successful observation was made.');
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
  return server;
}

function closeWeb(server) {
  return new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
}

async function startLocal({ readLedger = () => fs.readFileSync(path.join(__dirname, '..', '..', '.docs', 'wiki', 'flow-state.json'), 'utf8') } = {}) {
  let approval;
  try {
    approval = JSON.parse(readLedger()).approvals?.C001;
  } catch {
    throw new Error('C001 current consent is unavailable; the local listeners were not started.');
  }
  const permission = await guardOperation('local.probe', approval);
  if (!permission.allowed) {
    throw new Error(`C001 local consent denied: ${permission.reasons.map((reason) => reason.code).join(', ')}`);
  }
  const web = createWebServer();
  await new Promise((resolve, reject) => {
    web.once('error', reject);
    web.listen(0, '127.0.0.1', resolve);
  });
  const grpc = createGrpcServer();
  await grpc.start();
  return { web, grpc, close: async () => { await Promise.all([closeWeb(web), grpc.close()]); } };
}

async function runCli(argv, { start = startLocal, log = console.log, error = console.error, onSignal = (handler) => {
  process.once('SIGINT', handler);
  process.once('SIGTERM', handler);
} } = {}) {
  if (argv.length !== 0) {
    error('C028 accepts no host, port, limit, identity, or deployment overrides.');
    return 1;
  }
  try {
    const local = await start();
    log(JSON.stringify({
      event: 'C028-local-listening', pid: process.pid, page: `http://127.0.0.1:${local.web.address().port}`, grpc: local.grpc.origin, scope
    }));
    onSignal(() => local.close());
    return 0;
  } catch (failure) {
    error(failure.message);
    return 1;
  }
}

if (require.main === module) {
  runCli(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}

module.exports = Object.freeze({ scope, createWebServer, closeWeb, startLocal, runCli });
