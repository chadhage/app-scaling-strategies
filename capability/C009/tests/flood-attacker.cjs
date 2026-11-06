'use strict';

// Test tooling, not production code: the attacker of the stall probes. It runs in its OWN process, so it cannot share an event loop
// with the server it attacks. Usage: node flood-attacker.cjs <port> <JSON request head> <sockets> <milliseconds>
// Each socket sends the head and then endless Transfer-Encoding: chunked data made of 1-byte chunks (one parser callback each).
// It prints one JSON line: for every socket the first status it read and when the server closed it (null: never within the time).
const net = require('node:net');

const [port, headJson, socketCount, milliseconds] = process.argv.slice(2);
const head = JSON.parse(headJson);
const piece = Buffer.from('1\r\nx\r\n'.repeat(10000));
const started = Date.now();
const stopAt = started + Number(milliseconds);
const results = [];

function attack() {
  const result = { status: null, closedAfterMs: null };
  results.push(result);
  const socket = net.connect({ host: '127.0.0.1', port: Number(port), allowHalfOpen: true });
  const closed = () => { if (result.closedAfterMs === null) result.closedAfterMs = Date.now() - started; };
  socket.on('data', (chunk) => { if (result.status === null) result.status = Number((/^HTTP\/1\.\d (\d+)/.exec(chunk.toString('latin1')) || [])[1]) || null; });
  socket.on('error', closed);
  socket.on('end', closed);
  socket.on('close', closed);
  socket.write(head);
  const pump = () => {
    if (socket.destroyed || Date.now() > stopAt) return;
    if (socket.write(piece)) setImmediate(pump); else socket.once('drain', pump);
  };
  pump();
  return socket;
}

const sockets = Array.from({ length: Number(socketCount) }, attack);
setTimeout(() => {
  process.stdout.write(`${JSON.stringify(results)}\n`, () => {
    sockets.forEach((socket) => socket.destroy());
    process.exit(0);
  });
}, Number(milliseconds) + 200);
