'use strict';

// A NAIVE service (the RED subject): it listens on 127.0.0.1 and answers every request 501.
const http = require('node:http');

async function startLocal() {
  const server = http.createServer((request, response) => {
    response.writeHead(501, { 'Content-Type': 'application/json' });
    response.end('{}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
}

module.exports = { closeServer, startLocal };
