'use strict';

// Test tooling, not production code: the F24 probe attacker (rev-C017: a server that DROPS pipelined requests behind a pending first request without pausing
// or destroying the socket keeps queueing request and response objects with no backpressure). C014_PENDING is { port, sockets, requests }. Every socket sends
// ONE request whose answer waits (a POST that promises 100 body bytes and sends 10, so its handler stays pending) and then 64 KB blocks of `GET /x HTTP/1.1` until
// `requests` of them were written or the server ended the connection. It reports, per socket, whether the SERVER ended it and how many requests it managed to write.
const net = require('node:net');

const options = JSON.parse(process.env.C014_PENDING);
const BLOCK = 'GET /x HTTP/1.1\r\n\r\n'.repeat(Math.floor(65536 / 19));
const PER_BLOCK = Math.floor(65536 / 19);

function attack(index) {
  return new Promise((resolve) => {
    const socket = net.connect({ port: options.port, host: '127.0.0.1' });
    const report = { index, serverEnded: false, requestsWritten: 0 };
    let finished = false;
    const done = () => { if (!finished) { finished = true; clearTimeout(guard); socket.destroy(); resolve(report); } };
    const guard = setTimeout(done, options.maxMs || 40000);
    const ended = () => { if (!finished) { report.serverEnded = true; done(); } };
    socket.on('data', () => {});
    socket.on('close', ended);
    socket.on('error', ended);
    socket.on('connect', () => {
      socket.write(`POST /v1/commands/run.create HTTP/1.1\r\nHost: 127.0.0.1:${options.port}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n0123456789`);
      const pump = () => {
        if (finished) return;
        if (report.requestsWritten >= options.requests || socket.destroyed) { setTimeout(done, options.waitMs || 3000); return; }
        report.requestsWritten += PER_BLOCK;
        if (socket.write(BLOCK, 'latin1')) setImmediate(pump); else socket.once('drain', pump);
      };
      pump();
    });
  });
}

(async () => {
  const sockets = await Promise.all(Array.from({ length: options.sockets }, (_, index) => attack(index)));
  process.send({ type: 'report', sockets }, () => process.exit(0));
})();
