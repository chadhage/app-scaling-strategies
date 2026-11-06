'use strict';

// Test tooling, not production code: the hostile client of pending-flood-process.test.cjs, in its OWN process (it cannot share the event loop of
// the server it attacks, L-0138) and WITHOUT A CLOCK. Usage: node pending-attacker.cjs '<json {port, sockets, firsts, request, requestsPerBlock,
// maxRequests}>'. Socket i writes firsts[i] (the first request of its connection: a valid cancel that stays pending) and then pipelines blocks of
// requestsPerBlock copies of `request` (about 64 KB), the next block only after the previous one was flushed, until it has pushed maxRequests of
// them (it gives up: gaveUp) or the server closes the connection. The give-up is a COUNT, never a time. One JSON line reports ports (the
// server-side log of net-log-preload.cjs is keyed by the local port of each socket), pushed (requests written per socket) and gaveUp (true: the
// server never closed that socket).
const net = require('node:net');

const spec = JSON.parse(process.argv[2]);
const block = spec.request.repeat(spec.requestsPerBlock);
const ports = Array.from({ length: spec.sockets }, () => null);
const pushed = Array.from({ length: spec.sockets }, () => 0);
const gaveUp = Array.from({ length: spec.sockets }, () => false);
let open = spec.sockets;

for (let index = 0; index < spec.sockets; index += 1) {
  const socket = net.connect({ host: '127.0.0.1', port: spec.port });
  socket.on('error', () => {});
  socket.on('data', () => {});
  socket.once('connect', () => { ports[index] = socket.localPort; });
  socket.once('close', () => {
    open -= 1;
    if (open === 0) process.stdout.write(`${JSON.stringify({ ports, pushed, gaveUp })}\n`, () => process.exit(0));
  });
  socket.write(spec.firsts[index]);
  (function pump() {
    if (socket.destroyed) return;
    if (pushed[index] >= spec.maxRequests) {
      gaveUp[index] = true;
      socket.destroy();
      return;
    }
    pushed[index] += spec.requestsPerBlock;
    socket.write(block, () => setImmediate(pump));
  }());
}
