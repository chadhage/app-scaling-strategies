'use strict';

// Test tooling, not production code: ONE disposable server PROCESS for the flood probes, hosting two servers on two loopback ports: the
// real createApp ('safe') and the NAIVE control ('naive'), which answers every request 403 and does what a refusal did before review
// finding F1 (no Connection: close, no read stop, the unread body parsed on). A process start costs seconds on a loaded machine (review
// F9c, L-0204), so the safe server and the control share this process; the probes never attack both at once, so the CPU time this
// process reports (process.cpuUsage since it started to listen; the parent takes differences) is the cost of the attack that ran.
// Each server counts, per accepted socket, the bytes it READ and whether the socket is closed, in the order the sockets were accepted.
// It sends {type:'listening', ports:{safe, naive}, tokens} first. Messages from the parent: {type:'report', which} (answered with
// {type:'report:<which>', cpuMs, revision, sockets}) and {type:'close'}.
const http = require('node:http');
const { load } = require('./helpers.cjs');

const app = load('server.cjs').createApp();
const naive = http.createServer((request, response) => { response.writeHead(403, { 'Content-Length': 0 }); response.end(); });
const servers = { safe: app.server, naive };
const entries = { safe: [], naive: [] };
let baseline = null;

for (const [which, server] of Object.entries(servers)) {
  server.on('connection', (socket) => {
    const entry = { socket, bytesRead: 0, closed: false };
    entries[which].push(entry);
    socket.once('close', () => { entry.bytesRead = socket.bytesRead; entry.closed = true; });
  });
}

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
Promise.all([listen(app.server), listen(naive)]).then(([safe, naivePort]) => {
  baseline = process.cpuUsage();
  const tokens = Object.fromEntries(['visitor', 'conductor-a', 'operator'].map((name) => [name, app.issueToken(name)]));
  process.send({ type: 'listening', ports: { safe, naive: naivePort }, tokens });
});

process.on('message', (message) => {
  if (message.type === 'report') {
    const cpu = process.cpuUsage(baseline);
    process.send({
      type: `report:${message.which}`, cpuMs: Math.round((cpu.user + cpu.system) / 1000), revision: app.snapshot().revision,
      sockets: entries[message.which].map((entry) => ({ bytesRead: entry.closed ? entry.bytesRead : entry.socket.bytesRead, closed: entry.closed }))
    });
  } else if (message.type === 'close') {
    app.close().then(() => new Promise((resolve) => { naive.closeAllConnections(); naive.close(resolve); })).then(() => process.exit(0));
  }
});
