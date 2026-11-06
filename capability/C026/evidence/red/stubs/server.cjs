'use strict';

const http = require('node:http');

// Loadable RED stub: an HTTP server that knows no WebSocket route and never upgrades.
function createLocalServer() {
  return http.createServer((request, response) => {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('no stream yet');
  });
}

function closeServer(server) {
  return new Promise((resolve) => { server.closeAllConnections(); server.close(() => resolve()); });
}

module.exports = Object.freeze({ createLocalServer, closeServer });
