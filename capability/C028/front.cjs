'use strict';

// The listener in front of node:http2. gRPC over cleartext HTTP/2 starts with the fixed client connection preface; any
// other first bytes (a plain HTTP/1.1 request, a stray client) get an HTTP/1.1 refusal and are never answered as gRPC.
const net = require('node:net');
const { Duplex } = require('node:stream');

const PREFACE = Buffer.from('PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n', 'latin1');
const REFUSAL = 'This port speaks gRPC over HTTP/2 with prior knowledge only (content-type application/grpc).\n';

function looksLikeHttp2(first) {
  const length = Math.min(first.length, PREFACE.length);
  return length > 0 && first.subarray(0, length).equals(PREFACE.subarray(0, length));
}

function refuse(socket) {
  socket.end([
    'HTTP/1.1 505 HTTP Version Not Supported', 'Connection: close', 'Content-Type: text/plain; charset=utf-8',
    `Content-Length: ${Buffer.byteLength(REFUSAL)}`, '', REFUSAL
  ].join('\r\n'));
}

// node:http2 reads a TCP handle natively, so bytes that were already read for sniffing cannot be handed back. A Duplex
// that replays them lets http2 read through JavaScript instead.
function bridge(socket, first) {
  const duplex = new Duplex({
    read() { socket.resume(); },
    write(chunk, encoding, callback) { socket.write(chunk, encoding, callback); },
    final(callback) { socket.end(callback); },
    destroy(error, callback) {
      socket.destroy();
      callback(error);
    }
  });
  socket.on('data', (chunk) => { if (!duplex.push(chunk)) socket.pause(); });
  socket.once('end', () => duplex.push(null));
  socket.once('close', () => duplex.destroy());
  duplex.push(first);
  return duplex;
}

function createFront({ h2, firstByteTimeoutMs }) {
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
    socket.setTimeout(firstByteTimeoutMs, () => socket.destroy());
    socket.once('data', (first) => {
      socket.setTimeout(0);
      if (looksLikeHttp2(first)) h2.emit('connection', bridge(socket, first));
      else refuse(socket);
    });
  });
  return { server, sockets };
}

module.exports = Object.freeze({ PREFACE, createFront, looksLikeHttp2, refuse, bridge });
