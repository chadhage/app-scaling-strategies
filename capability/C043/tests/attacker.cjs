'use strict';

// Test tooling, not production code: a hostile client in its OWN process, so that it cannot share the event loop of the
// server under test. It opens N sockets, sends the head of a request the server must refuse, then keeps feeding an
// endless chunked body of one-byte chunks until the server closes the socket (or the hard limit passes). It prints one
// JSON line with how many sockets the server closed and how long that took.
const net = require('node:net');

const [portText, countText, kind, hardText] = process.argv.slice(2);
const port = Number(portText);
const count = Number(countText);
const hardMs = Number(hardText);
const host = `127.0.0.1:${port}`;
const HEADS = {
  'get-body': `GET /v1/leases HTTP/1.1\r\nHost: ${host}\r\nTransfer-Encoding: chunked\r\n\r\n`,
  'put-405': `PUT /v1/presets HTTP/1.1\r\nHost: ${host}\r\nTransfer-Encoding: chunked\r\n\r\n`,
  'post-404': `POST /admin HTTP/1.1\r\nHost: ${host}\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n`,
  'media-415': `POST /v1/presets HTTP/1.1\r\nHost: ${host}\r\nContent-Type: text/plain\r\nTransfer-Encoding: chunked\r\n\r\n`,
  'host-421': `POST /v1/presets HTTP/1.1\r\nHost: evil.example\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n`,
  'origin-403': `POST /v1/presets HTTP/1.1\r\nHost: ${host}\r\nOrigin: http://evil.example\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n`,
  'action-body-400': `POST /v1/presets/abcdefgh/cancel HTTP/1.1\r\nHost: ${host}\r\nTransfer-Encoding: chunked\r\n\r\n`,
  'key-400': `GET /v1/presets/short HTTP/1.1\r\nHost: ${host}\r\nTransfer-Encoding: chunked\r\n\r\n`,
  'query-400': `GET /v1/leases?x=1 HTTP/1.1\r\nHost: ${host}\r\nTransfer-Encoding: chunked\r\n\r\n`,
  'invalid-preset-400': `POST /v1/presets HTTP/1.1\r\nHost: ${host}\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n`,
};
const head = HEADS[kind];
if (!head) { console.error(`unknown kind ${kind}`); process.exit(2); }
const block = '1\r\nx\r\n'.repeat(8192);
const started = Date.now();
let closed = 0;
const sockets = [];

function finish(timedOut) {
  console.log(JSON.stringify({ kind, count, closed, timedOut, ms: Date.now() - started }));
  for (const socket of sockets) socket.destroy();
  process.exit(0);
}

for (let index = 0; index < count; index += 1) {
  const socket = net.connect({ host: '127.0.0.1', port });
  sockets.push(socket);
  socket.on('error', () => {});
  socket.on('data', () => {});
  socket.once('close', () => { closed += 1; if (closed === count) finish(false); });
  let scheduled = false;
  // Bounded work per turn, so this process keeps handling the close events of its own sockets.
  const feed = () => {
    scheduled = false;
    for (let turn = 0; turn < 32 && !socket.destroyed; turn += 1) if (!socket.write(block)) return;
    if (!scheduled && !socket.destroyed) { scheduled = true; setImmediate(feed); }
  };
  socket.on('drain', feed);
  socket.once('connect', () => { socket.write(head); feed(); });
}
setTimeout(() => finish(true), hardMs).unref();
