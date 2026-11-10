'use strict';

// Test tooling, not production code: a disposable server process for the flood probes. Start it with a small heap. By default it
// serves the real createApp on 127.0.0.1 port 0. With C009_NAIVE=1 it serves the NAIVE control instead: a server that answers every
// request 403 and does what a refusal did before review finding F1 (no Connection: close, no read stop, the unread body parsed on).
// It counts what it did itself: per accepted socket the bytes it READ and whether the socket is closed, and its own CPU time since it
// started to listen (process.cpuUsage counts time on the CPU, so a loaded machine does not change it much).
// Messages from the parent: 'report' and 'close'.
const http = require('node:http');
const { load } = require('./helpers.cjs');

const naive = process.env.C009_NAIVE === '1';
const app = naive ? null : load('server.cjs').createApp();
const server = naive
  ? http.createServer((request, response) => { response.writeHead(403, { 'Content-Length': 0 }); response.end(); })
  : app.server;
const entries = [];
let baseline = null;

server.on('connection', (socket) => {
  const entry = { socket, bytesRead: 0, closed: false };
  entries.push(entry);
  socket.once('close', () => { entry.bytesRead = socket.bytesRead; entry.closed = true; });
});

server.listen(0, '127.0.0.1', () => {
  baseline = process.cpuUsage();
  const tokens = naive ? {} : Object.fromEntries(['visitor', 'conductor-a', 'operator'].map((name) => [name, app.issueToken(name)]));
  process.send({ type: 'listening', port: server.address().port, tokens });
});

process.on('message', (message) => {
  if (message === 'report') {
    const cpu = process.cpuUsage(baseline);
    process.send({
      type: 'report', cpuMs: Math.round((cpu.user + cpu.system) / 1000), revision: app ? app.snapshot().revision : 0,
      sockets: entries.map((entry) => ({ bytesRead: entry.closed ? entry.bytesRead : entry.socket.bytesRead, closed: entry.closed }))
    });
  } else if (message === 'close') {
    (app ? app.close() : new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); })).then(() => process.exit(0));
  }
});
