'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { createHash } = require('node:crypto');
const execute = promisify(execFile);
const repository = path.resolve(__dirname, '..', '..');
const pins = require(path.join(__dirname, 'imports.json'));
verifyReadOnlyImports();
const { guardOperation } = require(path.join(__dirname, '..', 'C001', 'contract-guard.js'));
const contract = require(path.join(__dirname, '..', 'C020', 'contract.js'));
const { getProfileV1, getProfileV2, FixtureError } = require(path.join(__dirname, '..', 'C020', 'profiles.cjs'));
const implementations = Object.freeze({ v1: getProfileV1, v2: getProfileV2 });
const assets = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/journey.js': ['journey.js', 'text/javascript; charset=utf-8'],
  '/page.js': ['page.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8']
});
const owners = new WeakMap();
const SERVER_TTL_MS = 120000;
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; worker-src 'none'";

function verifyReadOnlyImports() {
  return Object.entries(pins.c020CanonicalSha256).map(([name, expected]) => {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'C020', name));
    const canonical = Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
    const hash = (value) => createHash('sha256').update(value).digest('hex');
    if (hash(canonical) !== expected) throw new Error('Accepted C020 source has drifted; no C033 listener was started.');
    return { path: path.join('capability', 'C020', name), rawSha256: hash(raw), crlfToLfSha256: hash(canonical) };
  });
}

async function authorizeRecord(record) {
  const permission = await guardOperation('local.probe', record?.approval);
  if (!permission.allowed) {
    throw new Error(`C033 current C001 local consent denied: ${permission.reasons.map((item) => item.code).join(', ')}`);
  }
  const dependency = record?.dependency;
  if (dependency?.id !== 'C020' || dependency.state !== 'Done' || dependency.kano !== 'S' ||
      typeof dependency.acceptedAtUtc !== 'string' || !Number.isFinite(Date.parse(dependency.acceptedAtUtc)) ||
      dependency.accepted !== true || dependency.focusedTestsPassed !== true ||
      dependency.browserObserved !== true || dependency.remoteVerified !== true ||
      dependency.publication?.commit !== pins.acceptedC020.commit || dependency.publication?.tag !== pins.acceptedC020.tag) {
    throw new Error('C033 entry gate denied: the exact original C020 must be independently accepted with its verified publication.');
  }
  return Object.freeze({ permission, dependency: Object.freeze({ ...dependency }), observedAtUtc: record.observedAtUtc });
}

async function assertCurrentConsent() {
  let record;
  try {
    const run = await execute('pwsh.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'read-consent.ps1')
    ], { cwd: repository, timeout: 10000, maxBuffer: 128 * 1024, windowsHide: true });
    record = JSON.parse(run.stdout);
    if (record.mutex !== 'Local\\AppScalingStrategies_KanbanState_v1' || record.readHandlesClosedBeforeRelease !== true) {
      throw new Error('Guarded ledger read was not established.');
    }
  } catch {
    throw new Error('C033 current consent is unavailable; no local listener or browser may start.');
  }
  const authorization = await authorizeRecord(record);
  return Object.freeze({ ...authorization, ledgerRevision: record.ledgerRevision, imports: verifyReadOnlyImports() });
}

async function closeOwned(server) {
  const owner = owners.get(server);
  if (!owner) throw new Error('C033 cleanup requires its exact caller-owned server handle.');
  if (!owner.closing) {
    owner.closing = new Promise((resolve, reject) => {
      clearTimeout(owner.ttl);
      if (!server.listening) { owner.closed = true; resolve(); return; }
      server.close((error) => {
        if (error) reject(error);
        else { owner.closed = true; resolve(); }
      });
      server.closeAllConnections();
    });
  }
  await owner.closing;
}

function observations(server) {
  const owner = owners.get(server);
  if (!owner) throw new Error('Not a C033-owned listener.');
  return structuredClone({
    pid: process.pid, origin: owner.origin, listening: server.listening, closed: owner.closed,
    authorization: owner.authorization, providerRequests: owner.providerRequests,
    protocolReplies: owner.protocolReplies, runtimeErrors: owner.runtimeErrors,
    serverTtlMs: SERVER_TTL_MS
  });
}

async function startLocal() {
  if (arguments.length !== 0) throw new Error('C033 accepts no host, port, provider, consent or identity overrides.');
  const authorization = await assertCurrentConsent();
  const owner = {
    authorization, providerRequests: [], protocolReplies: [], runtimeErrors: [],
    origin: null, closed: false, closing: null, ttl: null
  };
  const server = http.createServer((request, response) => {
    const headers = {
      'Cache-Control': 'no-store', 'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-C033-Card': 'C033', 'X-C033-Business-Data': 'synthetic',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    };
    let providerObservation;
    const send = (status, body, type = 'application/json; charset=utf-8', extra = {}) => {
      const bytes = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
      if (providerObservation) {
        providerObservation.status = status;
        providerObservation.repliedAt = performance.now();
        if (status === 200) providerObservation.stamp = structuredClone(body.stamp);
      }
      if (owner.protocolReplies.length < 256) owner.protocolReplies.push({ status, at: performance.now() });
      response.writeHead(status, { ...headers, 'Content-Type': type, 'Content-Length': bytes.length, ...extra });
      response.end(bytes);
    };
    const fail = (status, code) => send(status, { error: { code }, businessData: 'synthetic', localOnly: true });
    try {
      const address = server.address();
      const host = address && `127.0.0.1:${address.port}`;
      const rawCount = (header) => request.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === header).length;
      if (request.socket.remoteAddress !== '127.0.0.1' || request.headers.host !== host || rawCount('host') !== 1) {
        return fail(421, 'LOCAL_HOST_REQUIRED');
      }
      if (rawCount('origin') > 1 || (request.headers.origin !== undefined && request.headers.origin !== owner.origin)) {
        return fail(403, 'FOREIGN_ORIGIN_DENIED');
      }
      if (request.method !== 'GET') return fail(405, 'READ_ONLY_GET_REQUIRED');
      if (request.headers['transfer-encoding'] !== undefined ||
          (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0')) {
        return fail(400, 'BODY_DENIED');
      }
      for (const header of ['authorization', 'proxy-authorization', 'cookie', 'upgrade', 'expect', 'forwarded',
        'x-forwarded-host', 'x-forwarded-for', 'x-c020-implementation-version', 'x-c020-deployment-stamp']) {
        if (request.headers[header] !== undefined) return fail(400, 'HEADER_OVERRIDE_DENIED');
      }
      const target = request.url;
      if (typeof target !== 'string' || target.length > 256) return fail(414, 'BOUNDED_URL_REQUIRED');
      if (!target.startsWith('/') || target.startsWith('//') || /[#\\\s]/.test(target)) return fail(400, 'NONCANONICAL_TARGET');
      const match = /^\/fixtures\/(v1|v2)\/getProfile(?:\?(.*))?$/.exec(target);
      if (match) {
        const query = /^profileId=(synthetic-\d{3})$/.exec(match[2] || '');
        if (!query) return fail(400, 'EXACT_SYNTHETIC_QUERY_REQUIRED');
        if (owner.providerRequests.length >= 128) return fail(429, 'OWN_REQUEST_LIMIT_REACHED');
        providerObservation = { implementation: match[1], profileId: query[1], requestedAt: performance.now(), status: null };
        owner.providerRequests.push(providerObservation);
        const value = implementations[match[1]]({ profileId: query[1] });
        if (value.apiContract !== contract.apiContract ||
            JSON.stringify(value.stamp) !== JSON.stringify(contract.stamps[match[1]]) ||
            JSON.stringify(value.profile) !== JSON.stringify(contract.profiles.find((profile) => profile.id === query[1]))) {
          return fail(500, 'ACCEPTED_FIXTURE_DRIFT');
        }
        return send(200, value, undefined, {
          'X-C020-Implementation-Version': value.stamp.implementationVersion,
          'X-C020-Deployment-Stamp': value.stamp.deploymentStamp
        });
      }
      if (Object.hasOwn(assets, target)) {
        const [file, type] = assets[target];
        const ownPath = path.join(__dirname, file);
        if (fs.realpathSync(ownPath) !== ownPath) return fail(500, 'OWN_ASSET_REQUIRED');
        return send(200, fs.readFileSync(ownPath), type);
      }
      if (target.includes('?')) return fail(400, 'QUERY_DENIED');
      return fail(404, 'CLOSED_PATH_NOT_FOUND');
    } catch (error) {
      if (error instanceof FixtureError) return fail(error.status, error.code);
      return fail(500, 'LOCAL_FIXTURE_UNAVAILABLE');
    }
  });
  owners.set(server, owner);
  server.requestTimeout = 3000;
  server.headersTimeout = 3000;
  server.keepAliveTimeout = 500;
  server.maxRequestsPerSocket = 32;
  server.on('clientError', (_error, socket) => {
    if (!socket.destroyed) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
  const rejectHandshake = (socket, status) => {
    const bytes = Buffer.from(JSON.stringify({ error: { code: 'READ_ONLY_GET_REQUIRED' }, localOnly: true }));
    socket.setTimeout(1000, () => socket.destroy());
    socket.end(`HTTP/1.1 ${status} ${status === 405 ? 'Method Not Allowed' : 'Bad Request'}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: ${bytes.length}\r\n\r\n${bytes}`);
  };
  server.on('connect', (_request, socket) => rejectHandshake(socket, 405));
  server.on('upgrade', (_request, socket) => rejectHandshake(socket, 400));
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { server.close(); reject(new Error('C033 bounded listener startup expired.')); }, 5000);
    const failed = (error) => { clearTimeout(timeout); reject(error); };
    server.once('error', failed);
    server.listen(0, '127.0.0.1', () => {
      clearTimeout(timeout);
      server.removeListener('error', failed);
      owner.origin = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  server.on('error', (error) => {
    owner.runtimeErrors.push(error.code || 'OWN_LISTENER_ERROR');
    closeOwned(server).catch(() => {});
  });
  owner.ttl = setTimeout(() => { closeOwned(server).catch((error) => console.error(error.message)); }, SERVER_TTL_MS);
  server.once('close', () => { clearTimeout(owner.ttl); owner.closed = true; });
  return server;
}

async function cli() {
  if (process.argv.length !== 2) throw new Error('C033 CLI accepts no arguments or configurable targets; no listener was started.');
  const server = await startLocal();
  console.log(JSON.stringify({
    event: 'C033-owned-listening', pid: process.pid, url: observations(server).origin,
    ttlMs: SERVER_TTL_MS, toolingRuntime: process.version, productionRuntimeValidated: false,
    instructions: 'Open exactly this URL. Type stop and Enter or use Ctrl+C; automatic owned TTL is 120 seconds.'
  }));
  let closing = false;
  let input = '';
  const stop = async () => {
    if (closing) return;
    closing = true;
    process.stdin.pause();
    process.stdin.removeListener('data', onInput);
    process.stdin.destroy();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await closeOwned(server);
    console.log(JSON.stringify({ event: 'C033-owned-closed', pid: process.pid, listening: server.listening }));
  };
  const onInput = (chunk) => {
    input += chunk;
    if (input.length > 64 || (input.includes('\n') && input.trim() !== 'stop')) {
      console.error('Only the exact owned stop command is supported.');
      process.exitCode = 1;
      stop().catch((error) => { console.error(error.message); process.exitCode = 1; });
    } else if (input.trim() === 'stop' && input.includes('\n')) {
      stop().catch((error) => { console.error(error.message); process.exitCode = 1; });
    }
  };
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', onInput);
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  server.once('close', () => {
    if (!closing) stop().catch((error) => { console.error(error.message); process.exitCode = 1; });
  });
}

if (require.main === module) cli().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = Object.freeze({ startLocal, closeOwned, observations, assertCurrentConsent, authorizeRecord, verifyReadOnlyImports, CSP });
