'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { resolveNamespace } = require('..\\C015\\paths.cjs');
const { readFresh } = require('./process-reader.cjs');
const { probeBeforeListener } = require('./consent.cjs');

const csp = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; frame-ancestors 'none'; worker-src 'none'";
const maximumLifetimeMs = 180000;
const assetNames = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/inspection.js': ['inspection.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
});

async function startInspection(namespace) {
  if (arguments.length !== 1) throw new Error('Supply exactly the explicit C015 fixture namespace, without server overrides.');
  resolveNamespace(namespace);
  const probe = await probeBeforeListener();
  const assets = new Map();
  for (const [route, [file, type]] of Object.entries(assetNames)) {
    const target = path.join(__dirname, file);
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 ||
        path.relative(target, fs.realpathSync(target)) !== '') throw new Error('Only exact owned regular source assets may be served.');
    assets.set(route, { bytes: fs.readFileSync(target), type });
  }
  const sockets = new Set();
  const requests = [];
  let origin;
  let timer;
  let closing;
  let closed = false;

  function send(request, response, status, value, type = 'application/json; charset=utf-8') {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
    response.writeHead(status, {
      'Content-Type': type, 'Content-Length': bytes.length,
      'Cache-Control': 'no-store', 'Content-Security-Policy': csp,
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Resource-Policy': 'same-origin', Connection: 'close',
    });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  }

  function reject(request, response, status, code, message) {
    send(request, response, status, { restored: false, code, message, details: [], pid: process.pid });
  }

  function requestHandler(request, response) {
    requests.push({ method: request.method, path: request.url });
    const host = new URL(origin).host;
    const count = (name) => request.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === name).length;
    if (count('host') !== 1 || request.headers.host !== host) {
      return reject(request, response, 421, 'FOREIGN_HOST', 'Only this exact literal loopback Host is accepted.');
    }
    if (count('origin') > 1 || (request.headers.origin !== undefined && request.headers.origin !== origin)) {
      return reject(request, response, 403, 'FOREIGN_ORIGIN', 'Foreign and opaque origins are rejected.');
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      return reject(request, response, 405, 'READ_ONLY', 'Only GET and HEAD inspection are implemented; no run mutation endpoint.');
    }
    if (closed || typeof request.url !== 'string' || request.url.length > 128 || /[?%#\\]/.test(request.url)) {
      return reject(request, response, 400, 'CLOSED_ROUTE', 'Only exact owned routes without query, escaping or traversal are supported.');
    }
    const asset = assets.get(request.url);
    if (asset) return send(request, response, 200, asset.bytes, asset.type);
    if (/^\/api\/runs\/[a-zA-Z0-9-]{1,64}$/.test(request.url)) {
      const runId = request.url.slice('/api/runs/'.length);
      readFresh(namespace, runId).then((receipt) => {
        if (!response.destroyed) send(request, response, 200, receipt);
      }).catch((error) => {
        if (response.destroyed) return;
        const status = error.code === 'UNKNOWN_RUN_ID' ? 400
          : error.code === 'STATE_MISSING' ? 404 : error.code === 'HOLD_UNOBSERVED' ? 409 : 503;
        send(request, response, status, { restored: false, code: error.code || 'READER_UNAVAILABLE',
          message: error.message, details: error.details || [], pid: error.pid || process.pid });
      });
      return;
    }
    return reject(request, response, 404, 'CLOSED_ROUTE', 'This is not an owned asset or exact run inspection route.');
  }

  const server = http.createServer(requestHandler);
  const constructorListeners = server.eventNames().flatMap((name) =>
    server.listeners(name).map((listener) => ({ name, listener })));
  server.maxConnections = 8;
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 1;
  function connection(socket) {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  }
  server.on('connection', connection);

  function close() {
    if (!closing) {
      closed = true;
      clearTimeout(timer);
      closing = (async () => {
        const socketClosures = [...sockets].map((socket) => new Promise((resolve) => socket.once('close', resolve)));
        const serverClosure = new Promise((resolve, reject) => {
          if (server.listening) server.close((error) => { if (error) reject(error); else resolve(); });
          else resolve();
        });
        for (const socket of sockets) socket.destroy();
        try {
          await Promise.all([serverClosure, ...socketClosures]);
        } finally {
          server.removeListener('connection', connection);
          for (const { name, listener } of constructorListeners) server.removeListener(name, listener);
        }
      })();
    }
    return closing;
  }

  try {
    await new Promise((resolve, reject) => {
      function failed(error) { server.removeListener('listening', ready); reject(error); }
      function ready() { server.removeListener('error', failed); resolve(); }
      server.once('error', failed);
      server.once('listening', ready);
      server.listen({ host: '127.0.0.1', port: 0, exclusive: true });
    });
    const address = server.address();
    origin = `http://127.0.0.1:${address.port}`;
    timer = setTimeout(() => close().catch((error) => {
      process.stderr.write(`${JSON.stringify({ code: 'OWNED_LISTENER_CLEANUP_FAILED', message: error.message })}\n`);
      process.exitCode = 1;
    }), maximumLifetimeMs);
    timer.unref();
    return Object.freeze({ server, url: origin, namespace, probe, requests,
      maximumLifetimeMs, close, socketCount: () => sockets.size });
  } catch (error) {
    try { await close(); } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Own listener startup and cleanup failed.');
    }
    throw error;
  }
}

module.exports = Object.freeze({ startInspection, csp, maximumLifetimeMs });
