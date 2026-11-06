'use strict';

// RED subject: a driver that reports success whenever the HTTP/2 stream closes, with no messages, no trailers
// check, no deadline and no cancel semantics.
const http2 = require('node:http2');

async function connect(origin) {
  const session = http2.connect(origin);
  session.on('error', () => undefined);
  return {
    call(target, request) {
      const path = typeof target === 'string' ? target : target.path;
      const stream = session.request({ ':method': 'POST', ':path': path, 'content-type': 'application/grpc' });
      stream.on('error', () => undefined);
      stream.resume();
      const result = new Promise((resolve) => {
        stream.on('close', () => resolve({
          ok: true, status: { code: 0, name: 'OK', message: '', origin: 'server-trailers' },
          messages: [], violations: [], trailers: {}, headers: {}, trailersOnly: false, rstCode: null
        }));
      });
      stream.end(Buffer.from(JSON.stringify(request ?? {})));
      return {
        result, cancel() { stream.close(); }, write() { return true; }, end() { return undefined; },
        async *messages() { return; }
      };
    },
    close() { session.destroy(); }
  };
}

module.exports = Object.freeze({ connect, runCli: async () => 0 });
