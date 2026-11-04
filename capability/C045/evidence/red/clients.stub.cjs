'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { recheckConsent } = require(path.join(__dirname, '..', '..', 'consent.cjs'));
const { openIsolatedLoopback } = require(path.join(__dirname, '..', '..', '..', '..', 'testing', 'browser', 'isolated.cjs'));

async function openClients() {
  await recheckConsent();
  const assets = new Map([
    ['/', { bytes: fs.readFileSync(path.join(__dirname, 'index.stub.html')), type: 'text/html; charset=utf-8' }],
    ['/stub.js', { bytes: fs.readFileSync(path.join(__dirname, 'stub.js')), type: 'text/javascript; charset=utf-8' }]
  ]);
  let authority;
  let session;
  let deadline;
  let closing;
  const server = http.createServer((request, response) => {
    const headers = {
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; frame-ancestors 'none'",
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
    };
    const bodyless = !request.headers['transfer-encoding']
      && (request.headers['content-length'] === undefined || request.headers['content-length'] === '0');
    const asset = assets.get(request.url);
    const status = request.headers.host !== authority ? 421
      : request.headers.origin !== undefined && request.headers.origin !== `http://${authority}` ? 403
      : !['GET', 'HEAD'].includes(request.method) ? 405 : !bodyless ? 400 : !asset ? 404 : 200;
    const bytes = status === 200 ? asset.bytes : Buffer.from('Stub request refused.\n');
    response.writeHead(status, { ...headers, 'Content-Type': status === 200 ? asset.type : 'text/plain; charset=utf-8', 'Content-Length': bytes.length });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  });
  server.headersTimeout = 4000;
  server.requestTimeout = 4000;
  const close = () => {
    if (!closing) closing = (async () => {
      clearTimeout(deadline);
      try { if (session) await session.close(); }
      finally {
        if (server.listening) {
          const stopped = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
          server.closeAllConnections();
          await stopped;
        }
      }
    })();
    return closing;
  };
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    authority = `127.0.0.1:${server.address().port}`;
    deadline = setTimeout(() => { close().catch(() => { process.exitCode = 1; }); }, 90000);
    deadline.unref();
    session = await openIsolatedLoopback(path.join('capability', 'C045', 'evidence', 'red', 'index.stub.html'), server);
    const client = Object.freeze({ page: session.page, server, url: `http://${authority}/`, browserVersion: session.browserVersion });
    return Object.freeze({ clients: Object.freeze({ ga: client, preview: client }), close });
  } catch (error) {
    await close();
    throw error;
  }
}

module.exports = Object.freeze({ openClients });
