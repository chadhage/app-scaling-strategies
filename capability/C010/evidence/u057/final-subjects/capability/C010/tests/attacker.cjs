'use strict';

// Test tooling, not production code: the ATTACKER, run as a separate process so that it cannot share an event loop with the server under test.
// It opens many connections; each sends one refusal-bound request (a status the server answers before it reads a body), every second one
// queued behind a legitimate GET in the same write, followed by an endless chunked body, and keeps sending until the server closes the socket.
// Usage: node attacker.cjs <port> <connections> <hardLimitMs>. Prints one JSON line when every socket is gone or the limit hits.
const net = require('node:net');

const [port, count, limitMs] = process.argv.slice(2).map(Number);
const REFUSALS = [
  ['GET', '/v1/me', null], ['POST', '/v1/leases', 'application/json'], ['PUT', '/v1/leases', 'application/json'], ['GET', '/nope', null],
  ['GET', `/${'a'.repeat(2100)}`, null], ['GET', '/v1/leases?x=1', null], ['DELETE', '/v1/leases/lease-ffffffffffffffff', null], ['GET', '/', 'evil.example']
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
  const [method, target, extra] = REFUSALS[index % REFUSALS.length];
  const host = extra && !extra.includes('/') ? extra : `127.0.0.1:${port}`;
  const type = extra && extra.includes('/') ? `Content-Type: ${extra}\r\n` : '';
  const socket = net.connect({ host: '127.0.0.1', port });
  let seen = 0;
  sockets.push(socket);
  socket.on('error', () => {});
  socket.on('data', (chunk) => { seen += (chunk.toString('latin1').match(/HTTP\/1\.1 \d{3} /g) || []).length; if (seen === 1 + (index % 2)) answered += 1; });
  socket.once('close', () => { closed += 1; if (closed === count) finish(false); });
  const ticker = setInterval(() => { if (!socket.destroyed) { if (seen > 0) burstsAfterAnswer += 1; socket.write(burst); } }, 20);
  socket.once('close', () => clearInterval(ticker));
  const first = index % 2 === 1 ? `GET /scope.json HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n` : '';
  socket.write(`${first}${method} ${target} HTTP/1.1\r\nHost: ${host}\r\n${type}Transfer-Encoding: chunked\r\n\r\n${burst}`);
}
setTimeout(() => finish(true), limitMs).unref();
