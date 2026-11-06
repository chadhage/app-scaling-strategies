'use strict';

// Test tooling, not production code: the hostile client of chunked-process.test.cjs, in its OWN process (it cannot share the event loop of the
// server it attacks, L-0138) and WITHOUT A CLOCK. One long-lived process serves one attack after the other, because a node process costs seconds
// to start on a loaded machine and the rows must still be attacked ONE AT A TIME (many rows at once dilute a naive server so that it reads
// little per connection). Protocol: one JSON command per line on stdin {id, port, head, sockets, maxBytes}; one JSON reply per line on stdout
// {id, ports, gaveUp, pushedBytes} when every socket of that attack is closed. Every socket sends the request head and then endless 1-byte
// chunks as fast as the socket accepts them and stops only when the server closes it or when it has pushed maxBytes into it (a count, never a
// time: F22 of the second independent review, L-0170). ports: the local port of each socket (the server-side log of net-log-preload.cjs is
// keyed by it); gaveUp: true when the server never closed that socket; pushedBytes: a diagnostic. The process ends when stdin ends.
const net = require('node:net');
const readline = require('node:readline');

const chunk = '1\r\na\r\n'.repeat(500);
let pending = 0;
let ended = false;
const finish = () => { if (ended && pending === 0) process.exit(0); };

function attack(spec) {
  pending += 1;
  const report = { id: spec.id, ports: Array.from({ length: spec.sockets }, () => null), gaveUp: Array.from({ length: spec.sockets }, () => false), pushedBytes: Array.from({ length: spec.sockets }, () => 0) };
  let open = spec.sockets;
  for (let index = 0; index < spec.sockets; index += 1) {
    const socket = net.connect({ host: '127.0.0.1', port: spec.port });
    socket.on('error', () => {});
    socket.on('data', () => {});
    socket.once('connect', () => { report.ports[index] = socket.localPort; });
    socket.once('close', () => {
      open -= 1;
      if (open === 0) process.stdout.write(`${JSON.stringify(report)}\n`, () => { pending -= 1; finish(); });
    });
    socket.write(spec.head);
    (function pump() {
      if (socket.destroyed) return;
      if (report.pushedBytes[index] >= spec.maxBytes) {
        report.gaveUp[index] = true;
        socket.destroy();
        return;
      }
      report.pushedBytes[index] += chunk.length;
      socket.write(chunk, () => setImmediate(pump));
    }());
  }
}

readline.createInterface({ input: process.stdin }).on('line', (line) => { if (line.trim()) attack(JSON.parse(line)); }).on('close', () => { ended = true; finish(); });
