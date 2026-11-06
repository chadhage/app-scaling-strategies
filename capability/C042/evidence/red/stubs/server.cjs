'use strict';

const http = require('node:http');

// RED stub: a listener that answers every request with 501 and implements nothing of the specified behavior.
function createLocalServer() {
  return http.createServer((request, response) => {
    request.resume();
    response.writeHead(501, { 'Content-Type': 'application/json' });
    response.end('{}');
  });
}

function closeServer(server) {
  return new Promise((resolve) => { server.closeAllConnections(); server.close(() => resolve()); });
}

module.exports = { createLocalServer, closeServer };
