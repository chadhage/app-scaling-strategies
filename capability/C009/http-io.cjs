'use strict';

const { CODES } = require('./codes.cjs');

const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-C009-Scope': 'synthetic-loopback-only'
});
// An over-limit body is drained (and discarded) up to this many bytes so the client can read the 413; beyond it the socket is cut.
const DRAIN_CAP = 65536;

function createResponder(response) {
  const send = (status, body, type, headers = {}) => {
    response.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type, 'Content-Length': body.length, ...headers });
    response.end(body);
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

function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > DRAIN_CAP) {
        request.destroy();
        resolve({ tooLarge: true });
      } else if (size <= limit) {
        chunks.push(chunk);
      }
    });
    request.on('end', () => resolve(size > limit ? { tooLarge: true } : { buffer: Buffer.concat(chunks) }));
    request.on('error', reject);
  });
}

module.exports = Object.freeze({ SECURITY_HEADERS, createResponder, localGuard, hasBody, readBody });
