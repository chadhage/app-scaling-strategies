'use strict';
// Naive RED subject, retained and never edited: it never rechecks C001 consent, listens on every interface, accepts overrides,
// hands out no usable tokens and never closes itself.
const http = require('node:http');

async function startLocal() {
  const server = http.createServer((request, response) => response.end('{}')).unref();
  await new Promise((resolve) => server.listen(0, resolve));
  const closed = new Promise((resolve) => server.once('close', resolve));
  return { server, origin: `http://0.0.0.0:${server.address().port}`, tokens: {}, lifetimeMs: Infinity, closed, close() { server.close(); return closed; } };
}

if (require.main === module) {
  startLocal().then((local) => {
    console.log(JSON.stringify({ event: 'C009-local-listening', origin: local.origin }));
    process.exit(0);
  });
}

module.exports = { startLocal, readCurrentApproval: () => ({}) };
