'use strict';

// Test tooling, not production code: the NAIVE CONTROL of flood-structural.test.cjs. A plain Node HTTP server that answers every request
// and keeps the connection: no Connection: close, no destroy after the answer, no bound on what it reads, Node's own defaults for
// everything (including its own 417 for an unknown Expect header). It is the behaviour the close-after-refusal rule exists to prevent; the
// structural test runs the same attack against it in the same run, so a test that cannot tell this server from the real one is exposed.
// It prints the same listening line as cli.cjs and stops on the word "stop" on stdin.
const http = require('node:http');

const server = http.createServer((request, response) => {
  response.writeHead(404, { 'Content-Type': 'text/plain', 'Content-Length': 2 });
  response.end('no');
});

server.listen(0, '127.0.0.1', () => {
  console.log(JSON.stringify({ event: 'C017-local-listening', pid: process.pid, origin: `http://127.0.0.1:${server.address().port}` }));
});

process.stdin.setEncoding('utf8');
process.stdin.on('data', (text) => {
  if (text.includes('stop')) {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  }
});
