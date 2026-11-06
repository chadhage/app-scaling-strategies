'use strict';

// Test tooling, not production code: real loopback servers and a raw HTTP requester for the C032 suites.
const http = require('node:http');
const { createLocalServer } = require('../server.cjs');

const credentials = Object.freeze({
  alpha: 'c032-synthetic-opaque-alpha-0001',
  beta: 'c032-synthetic-opaque-beta-0002',
  expired: 'c032-synthetic-opaque-expired-0003',
  forged: 'c032-synthetic-opaque-alpha-9999'
});
// The complete set of response header names the server may ever send. Anything else, notably Set-Cookie, is a failure.
const allowedResponseHeaders = Object.freeze(['cache-control', 'content-security-policy', 'x-content-type-options',
  'referrer-policy', 'x-c032-scope', 'content-type', 'content-length', 'date', 'connection', 'keep-alive',
  'www-authenticate', 'x-c032-destination', 'x-c032-state-counter', 'x-c032-stamp', 'allow']);

async function startServer(options = {}) {
  const seen = [];
  const server = createLocalServer({ onRequest: (info) => seen.push(info), ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    server, port, seen, origin: `http://127.0.0.1:${port}`,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

async function withServer(options, body) {
  const fixture = await startServer(options);
  try { return await body(fixture); } finally { await fixture.close(); }
}

// Raw requester: arbitrary method, path, header lines (array values send duplicate lines) and body.
function request(fixture, { path: target = '/api/v1/observation', method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = http.request({ hostname: '127.0.0.1', port: fixture.port, path: target, method, headers, agent: false }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* assets are not JSON */ }
        resolve({ status: response.statusCode, headers: response.headers, rawHeaders: response.rawHeaders, text, json });
      });
    });
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}

const bearer = (credential, extra = {}) => ({ Authorization: `Bearer ${credential}`, ...extra });

module.exports = Object.freeze({ credentials, allowedResponseHeaders, startServer, withServer, request, bearer });
