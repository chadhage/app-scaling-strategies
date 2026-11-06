'use strict';

// Test tooling, not production code: the ATTACKER, run as a separate process so that it cannot share an event loop with the
// server under test. It opens many connections, each sends one refusal-bound request (every refusal status the service can
// emit before it reads a body) followed by an endless chunked body, and keeps sending until the server closes the socket.
// Usage: node attacker.cjs <port> <connections> <hardLimitMs>. Prints one JSON line when every socket is gone or the limit hits.
const net = require('node:net');

const [port, count, limitMs] = process.argv.slice(2).map(Number);
const REFUSALS = [
  ['GET', '/v1/leases', 'application/json', null],
  ['POST', '/v1/steps/key-0001-aaaa/cancel', 'application/json', null],
  ['PUT', '/v1/steps', 'application/json', null],
  ['POST', '/admin', 'application/json', null],
  ['POST', '/v1/steps', 'text/plain', null],
  ['GET', '/', 'application/json', 'example.test'],
  ['GET', '/v1/leases?x=1', 'application/json', null],
  ['POST', '/v1/steps/not%20a%20key/cancel', 'application/json', null],
  ['GET', `/${'a'.repeat(2100)}`, 'application/json', null],
  ['POST', '/v1/steps', 'application/json', null],
];
const burst = '1\r\nx\r\n'.repeat(400);
let closed = 0;
let answered = 0;
let burstsAfterAnswer = 0;
const sockets = [];

function finish(timedOut) {
  console.log(JSON.stringify({ connections: count, closed, answered, timedOut, burstsAfterAnswer }));
  for (const socket of sockets) socket.destroy();
  process.exit(0);
}

for (let index = 0; index < count; index += 1) {
  const [method, target, type, host] = REFUSALS[index % REFUSALS.length];
  const socket = net.connect({ host: '127.0.0.1', port });
  let seen = false;
  sockets.push(socket);
  socket.on('error', () => {});
  socket.on('data', (chunk) => { if (!seen && /^HTTP\/1\.1 \d{3} /.test(chunk.toString('latin1'))) { seen = true; answered += 1; } });
  socket.once('close', () => { closed += 1; if (closed === count) finish(false); });
  const ticker = setInterval(() => { if (!socket.destroyed) { if (seen) burstsAfterAnswer += 1; socket.write(burst); } }, 20);
  socket.once('close', () => clearInterval(ticker));
  socket.write(`${method} ${target} HTTP/1.1\r\nHost: ${host ?? `127.0.0.1:${port}`}\r\nContent-Type: ${type}\r\nTransfer-Encoding: chunked\r\n\r\n${burst}`);
}
setTimeout(() => finish(true), limitMs).unref();
