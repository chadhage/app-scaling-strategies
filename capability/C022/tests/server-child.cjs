'use strict';

// Test tooling, not production code: a disposable server PROCESS. C022_MODE=real (default) serves the app under test (C022_SUBJECT_DIR is
// honored) with every state the refusal rows need already prepared and sends the tokens; C022_MODE=naive serves the NAIVE control: a
// plain node:http server that answers every request 403 and does what a refusal did before review finding F1 of C009 (no Connection:
// close, no read stop, the unread body parsed on). It counts what it did itself: per accepted socket the bytes it READ and whether the
// socket is closed, its own CPU time since it started to listen, and a digest of the whole world. Messages from the parent: 'report',
// 'close'. It sends {type:'ready', port, tokens} first. Start it with a small heap for the flood tests.
const http = require('node:http');
const h = require('./helpers.cjs');
const rows = require('./rows.cjs');

const naive = process.env.C022_MODE === 'naive';
const entries = [];
let baseline = null;
let ctx = null;
let server = null;

const track = (target) => target.on('connection', (socket) => {
  const entry = { socket, bytesRead: 0, closed: false };
  entries.push(entry);
  socket.once('close', () => { entry.bytesRead = socket.bytesRead; entry.closed = true; });
});

(async () => {
  let tokens = {};
  if (naive) {
    server = http.createServer((request, response) => { response.writeHead(403, { 'Content-Length': 0 }); response.end(); });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  } else {
    ctx = await h.startApp({ app: { hooks: rows.HOOKS } });
    ({ server } = ctx.app);
    tokens = await rows.prepare(ctx);
  }
  track(server);
  baseline = process.cpuUsage();
  process.send({ type: 'ready', port: server.address().port, tokens });
})();

process.on('message', (message) => {
  if (message === 'report') {
    const cpu = process.cpuUsage(baseline);
    process.send({
      type: 'report', cpuMs: Math.round((cpu.user + cpu.system) / 1000), digest: ctx ? h.sha256(ctx.world()) : '',
      sockets: entries.map((entry) => ({ bytesRead: entry.closed ? entry.bytesRead : entry.socket.bytesRead, closed: entry.closed }))
    });
  } else if (message === 'close') {
    (ctx ? ctx.close() : new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); })).then(() => process.exit(0));
  }
});
