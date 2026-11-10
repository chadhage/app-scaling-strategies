'use strict';

// Test tooling, not production code: a disposable server PROCESS for the pending-first-request flood (rev-C017 F24, L-0209, L-0213). Start
// it with a small heap and --expose-gc. C022_MODE=real serves the app under test (C022_SUBJECT_DIR is honored) in which every project.create
// is HELD open (afterAuthorize hook) between 'arm' and 'release': the FIRST request of an attacking connection stays pending while tiny
// requests are pipelined behind it. C022_MODE=naive serves the NAIVE control: a plain node:http server that holds the first request of every
// connection and drops every later request WITHOUT answering it (nothing written, nothing paused, nothing destroyed: the defect of the
// first C017 fix). Both count what they did themselves: per accepted socket the requests Node parsed ('request' events) and whether the
// socket is closed. Messages from the parent: 'arm', 'release', 'report' (heap after a forced GC), 'peek' (the same without the GC), 'close'.
// It sends {type:'ready', port, token}.
const http = require('node:http');
const v8 = require('node:v8');
const h = require('./helpers.cjs');

const naive = process.env.C022_MODE === 'naive';
const entries = new Map();
let armed = false;
let release = () => {};
let held = Promise.resolve();
let ctx = null;
let server = null;

const arm = () => {
  armed = true;
  held = new Promise((resolve) => { release = resolve; });
};

(async () => {
  let token = '';
  if (naive) {
    const seen = new WeakSet();
    server = http.createServer({ requireHostHeader: false }, (request, response) => {
      if (seen.has(request.socket)) return;
      seen.add(request.socket);
      held.then(() => { response.writeHead(204); response.end(); });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  } else {
    ctx = await h.startApp({ app: { hooks: { afterAuthorize: (info) => (armed && info.op === 'project.create' ? held : undefined) } } });
    ({ server } = ctx.app);
    token = (await ctx.session('alf')).token;
  }
  server.on('connection', (socket) => {
    const entry = { parsed: 0, closed: false };
    entries.set(socket, entry);
    socket.once('close', () => { entry.closed = true; });
  });
  server.on('request', (request) => {
    const entry = entries.get(request.socket);
    if (entry) entry.parsed += 1;
  });
  process.send({ type: 'ready', port: server.address().port, token });
})();

process.on('message', (message) => {
  if (message === 'arm') {
    arm();
  } else if (message === 'release') {
    armed = false;
    release();
  } else if (message === 'report' || message === 'peek') {
    if (message === 'report' && global.gc) global.gc();
    process.send({ type: 'report', heapMb: Math.round(v8.getHeapStatistics().used_heap_size / 1048576), sockets: [...entries.values()].map((entry) => ({ parsed: entry.parsed, closed: entry.closed })) });
  } else if (message === 'close') {
    release();
    (ctx ? ctx.close() : new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); })).then(() => process.exit(0));
  }
});
