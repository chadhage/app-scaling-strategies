'use strict';

// RED subject: an ordinary HTTP/2 substitute. Every stream gets 200 JSON and no trailers, whatever the method,
// content type, timeout or cancel. It is what the real fixture must NOT be.
const http2 = require('node:http2');

function createGrpcServer() {
  const sessions = new Set();
  const h2 = http2.createServer();
  h2.on('session', (session) => { sessions.add(session); session.on('close', () => sessions.delete(session)); });
  h2.on('sessionError', () => undefined);
  h2.on('stream', (stream) => {
    stream.on('error', () => undefined);
    stream.respond({ ':status': 200, 'content-type': 'application/json' });
    stream.end(JSON.stringify({ ticks: [1, 2, 3, 4, 5] }));
  });
  const server = {
    calls: [], active: 0, port: 0, origin: '',
    async start() {
      await new Promise((resolve) => h2.listen(0, '127.0.0.1', resolve));
      server.port = h2.address().port;
      server.origin = `http://127.0.0.1:${server.port}`;
      return server;
    },
    async drain() { return undefined; },
    abort() { return undefined; },
    async close() {
      for (const session of sessions) session.destroy();
      await new Promise((resolve) => h2.close(resolve));
    },
    on() { return server; }
  };
  return server;
}

module.exports = Object.freeze({ createGrpcServer });
