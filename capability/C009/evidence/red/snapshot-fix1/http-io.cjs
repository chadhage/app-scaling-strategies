'use strict';

const { CODES } = require('./codes.cjs');

const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-C009-Scope': 'synthetic-loopback-only'
});
// Every error answer is final. An unread request body is parsed byte by byte (a 1-byte chunk costs one JS callback) and libuv reads up
// to 2 MB per loop turn, so a refusal that waited for its own flush callback let one client block the server for seconds. A refusal
// therefore announces Connection: close and stops reading in the very tick that decides it; Node ends the connection once the answer
// is flushed. A socket in this set receives no further request: one pipelined behind a refusal is never run.
const finished = new WeakSet();
const isFinished = (socket) => finished.has(socket);

function endConnection(socket) {
  if (!socket || socket.destroyed) return;
  finished.add(socket);
  socket._handle?.readStop?.();
}

function createResponder(response) {
  const send = (status, body, type, headers = {}) => {
    const { socket } = response;
    const refusal = status >= 400;
    response.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type, 'Content-Length': body.length, ...(refusal && { Connection: 'close' }), ...headers });
    response.end(body);
    if (refusal) endConnection(socket);
  };
  return {
    json: (status, value, headers) => send(status, Buffer.from(JSON.stringify(value)), 'application/json; charset=utf-8', headers),
    file: (buffer, type) => send(200, buffer, type),
    fail(code, body = {}, headers = {}) {
      const [status, message] = CODES[code];
      send(status, Buffer.from(JSON.stringify({ outcome: code, error: { code, message }, ...body })), 'application/json; charset=utf-8', headers);
    }
  };
}

// Only the exact listener is served: the Host must be this 127.0.0.1 port and a browser Origin, when sent, must be this origin.
// Returns the typed error code to answer with, or null.
function localGuard(request, server) {
  const host = `127.0.0.1:${server.address().port}`;
  if (request.socket.remoteAddress !== '127.0.0.1' || request.headers.host !== host) return 'LOCAL_HOST_REQUIRED';
  if (request.headers.origin !== undefined && request.headers.origin !== `http://${host}`) return 'CROSS_ORIGIN_DENIED';
  return null;
}

function hasBody(request) {
  return request.headers['transfer-encoding'] !== undefined || Number(request.headers['content-length'] || 0) > 0;
}

// The body is cut at the limit: nothing beyond it is read, the caller answers 413 and the connection ends with that answer.
function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) resolve({ tooLarge: true });
      else chunks.push(chunk);
    });
    request.on('end', () => resolve({ buffer: Buffer.concat(chunks) }));
    request.on('error', reject);
  });
}

module.exports = Object.freeze({ SECURITY_HEADERS, createResponder, localGuard, hasBody, isFinished, readBody });
