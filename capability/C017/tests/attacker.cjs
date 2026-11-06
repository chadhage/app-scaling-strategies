'use strict';

// Test tooling, not production code: the hostile client of chunked-process.test.cjs. It runs in its OWN process, so it cannot share the
// event loop of the server it attacks (L-0138). Usage: node attacker.cjs '<json {port, head, sockets, capMs}>'. Every socket sends the
// request head and then endless 1-byte chunks as fast as the socket accepts them; one JSON line reports, per socket, the milliseconds
// until the server closed it (null: still open when the cap expired).
const net = require('node:net');

const spec = JSON.parse(process.argv[2]);
const chunk = '1\r\na\r\n'.repeat(500);
const started = Date.now();
const closedAfterMs = Array.from({ length: spec.sockets }, () => null);
let open = spec.sockets;
let reported = false;
let cap = null;

function report() {
  if (reported) return;
  reported = true;
  clearTimeout(cap);
  process.stdout.write(`${JSON.stringify({ closedAfterMs })}\n`, () => process.exit(0));
}

const sockets = closedAfterMs.map((_, index) => {
  const socket = net.connect({ host: '127.0.0.1', port: spec.port });
  socket.on('error', () => {});
  socket.on('data', () => {});
  socket.once('close', () => {
    if (!reported) closedAfterMs[index] = Date.now() - started;
    open -= 1;
    if (open === 0) report();
  });
  socket.write(spec.head);
  (function pump() {
    if (!socket.destroyed) socket.write(chunk, () => setImmediate(pump));
  }());
  return socket;
});

cap = setTimeout(() => {
  report();
  sockets.forEach((socket) => socket.destroy());
}, spec.capMs);
