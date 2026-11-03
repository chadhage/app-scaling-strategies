'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { guardOperation } = require(path.join(__dirname, '..', 'C001', 'contract-guard.js'));
const { getProfileV1, getProfileV2, FixtureError } = require('./profiles.cjs');

const scope = Object.freeze({
  cardId: 'C020', businessData: 'synthetic', transport: '127.0.0.1 HTTP only',
  testRuntime: process.version, approvedProductionTarget: 'Node.js 24 LTS / Express / App Service Linux',
  productionRuntimeValidated: false, identityVerified: false, nativeTargetQualified: false,
  controlApiImplemented: false, durableStoreImplemented: false, liveAzureRuns: 0, authorizedCloudSpend: 0
});
const assets = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/contract.js': ['contract.js', 'text/javascript; charset=utf-8'],
  '/inspector.js': ['inspector.js', 'text/javascript; charset=utf-8'],
  '/page.js': ['page.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8']
});
const implementations = Object.freeze({ v1: getProfileV1, v2: getProfileV2 });

function createLocalServer() {
  const server = http.createServer((request, response) => {
    const headers = {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-C020-Scope': 'synthetic-loopback-only'
    };
    function send(status, value, type = 'application/json; charset=utf-8', extra = {}) {
      const body = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
      response.writeHead(status, { ...headers, 'Content-Type': type, 'Content-Length': body.length, ...extra });
      response.end(body);
    }
    function fail(status, code, message) {
      send(status, { error: { code, message }, businessData: 'synthetic', localOnly: true });
    }

    try {
      const address = server.address();
      const host = `127.0.0.1:${address.port}`;
      const origin = `http://${host}`;
      if (request.socket.remoteAddress !== '127.0.0.1' || request.headers.host !== host) {
        return fail(421, 'LOCAL_HOST_REQUIRED', 'Only the actual 127.0.0.1 listener is supported.');
      }
      if (request.headers.origin && request.headers.origin !== origin) {
        return fail(403, 'CROSS_ORIGIN_DENIED', 'This synthetic inspector supports only its own loopback origin.');
      }
      if (request.method !== 'GET') return fail(405, 'METHOD_NOT_ALLOWED', 'Only read-only GET is supported.');
      if (request.headers['transfer-encoding'] || Number(request.headers['content-length'] || 0) > 0) {
        return fail(400, 'UNEXPECTED_BODY', 'GET fixture requests must not contain a body.');
      }
      if (!request.url || request.url.length > 2048) return fail(414, 'URL_TOO_LONG', 'The local request URL is too long.');
      const url = new URL(request.url, origin);
      if (url.origin !== origin || url.hash) return fail(400, 'INVALID_URL', 'An explicit local URL without a fragment is required.');
      const match = /^\/fixtures\/(v1|v2)\/getProfile$/.exec(url.pathname);
      if (match) {
        const keys = [...url.searchParams.keys()];
        if (keys.length !== 1 || keys[0] !== 'profileId') {
          return fail(400, 'INVALID_QUERY', 'Exactly one profileId parameter is required; stamp overrides are forbidden.');
        }
        const result = implementations[match[1]]({ profileId: url.searchParams.get('profileId') });
        return send(200, result, undefined, {
          'X-C020-Implementation-Version': result.stamp.implementationVersion,
          'X-C020-Deployment-Stamp': result.stamp.deploymentStamp
        });
      }
      if (url.pathname === '/scope.json') {
        if (url.search) return fail(400, 'INVALID_QUERY', 'The scope record accepts no query parameters.');
        return send(200, scope);
      }
      if (Object.hasOwn(assets, url.pathname)) {
        if (url.search) return fail(400, 'INVALID_QUERY', 'The inspection assets accept no query parameters.');
        const [file, type] = assets[url.pathname];
        return send(200, fs.readFileSync(path.join(__dirname, file)), type);
      }
      return fail(404, 'NOT_FOUND', 'No local fixture or inspection asset has that path.');
    } catch (error) {
      if (error instanceof FixtureError) return fail(error.status, error.code, error.message);
      if (error instanceof TypeError && error.code === 'ERR_INVALID_URL') return fail(400, 'INVALID_URL', 'The local URL is malformed.');
      return fail(500, 'FIXTURE_UNAVAILABLE', 'The local fixture is unavailable; no successful observation was made.');
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 1000;
  return server;
}

async function startLocal() {
  let approval;
  try {
    const file = path.join(__dirname, '..', '..', '.docs', 'wiki', 'flow-state.json');
    approval = JSON.parse(fs.readFileSync(file, 'utf8')).approvals?.C001;
  } catch {
    throw new Error('C001 current consent is unavailable; the local listener was not started.');
  }
  const permission = await guardOperation('local.probe', approval);
  if (!permission.allowed) {
    throw new Error(`C001 local consent denied: ${permission.reasons.map((reason) => reason.code).join(', ')}`);
  }
  const server = createLocalServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

if (require.main === module) {
  if (process.argv.length !== 2) {
    console.error('C020 accepts no host, port, identity, implementation-stamp, or deployment overrides.');
    process.exitCode = 1;
  } else {
    startLocal().then((server) => {
      console.log(JSON.stringify({
        event: 'C020-local-listening', pid: process.pid,
        origin: `http://127.0.0.1:${server.address().port}`, scope
      }));
      const close = () => { server.closeAllConnections(); server.close(); };
      process.once('SIGINT', close);
      process.once('SIGTERM', close);
    }).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}

module.exports = Object.freeze({ createLocalServer, startLocal });
