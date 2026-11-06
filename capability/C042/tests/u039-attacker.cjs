'use strict';

// Test tooling, not production code (U039): the ATTACKER of the refusal flood, in its own process. Usage: node u039-attacker.cjs
// <port> <count> <closeMs>. Every socket sends a refusal (a rotation of bodiless, unread-body, endless-body and asynchronous
// refusals), waits for the answer, then sends one valid request on the SAME connection. A server that closes after every
// refusal never answers it; a keep-alive server does. The result is one JSON line on stdout.
const net = require('node:net');
const lib = require('./u039-lib.cjs');

const [port, count, closeMs] = process.argv.slice(2).map(Number);
const host = `127.0.0.1:${port}`;
const KINDS = [
  { name: 'bodiless 404', build: () => lib.req('GET', '/nope', { host }) },
  { name: 'foreign Host 421', build: () => lib.req('GET', '/v1/leases', { host: 'evil.example:1' }) },
  { name: 'unread endless body 415', build: () => lib.req('POST', '/v1/steps', { host, headers: { 'Content-Type': 'text/plain', 'Transfer-Encoding': 'chunked' } }), endless: true },
  { name: 'invalid JSON 400', build: () => lib.req('POST', '/v1/steps', { host, headers: { 'Content-Type': 'application/json' }, body: '{bad' }) },
  { name: 'unread body 405', build: () => lib.req('PUT', '/v1/steps', { host, body: '{}' }) },
];

function one(index) {
  return new Promise((resolve) => {
    const kind = KINDS[index % KINDS.length];
    const chunks = [];
    const outcome = { kind: kind.name, endless: Boolean(kind.endless), refused: false, followUpAnswered: false, closed: false, timedOut: false };
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.setNoDelay(true);
    let finished = false;
    let followed = false;
    const finish = () => { if (!finished) { finished = true; clearTimeout(bound); socket.destroy(); resolve(outcome); } };
    const bound = setTimeout(() => { outcome.timedOut = true; finish(); }, closeMs);
    const pump = () => {
      while (!socket.destroyed && !outcome.closed) {
        if (!socket.write('1\r\nx\r\n'.repeat(2048))) { socket.once('drain', pump); return; }
      }
    };
    socket.on('error', () => { outcome.closed = true; finish(); });
    socket.on('close', () => { outcome.closed = true; finish(); });
    socket.on('data', (chunk) => {
      chunks.push(chunk);
      const answers = lib.parseResponses(Buffer.concat(chunks)).filter((item) => item.status !== undefined);
      if (answers.length >= 1 && !outcome.refused) {
        outcome.refused = true;
        if (!followed) { followed = true; socket.write(lib.req('GET', '/scope.json', { host })); }
      }
      if (answers.length >= 2) { outcome.followUpAnswered = true; finish(); }
    });
    socket.on('connect', () => {
      socket.write(kind.build());
      if (kind.endless) pump();
    });
  });
}

Promise.all(Array.from({ length: count }, (_, index) => one(index))).then((outcomes) => {
  const sum = (test) => outcomes.filter(test).length;
  // The refusal of an endless body can be lost to the reset that follows the server's close (Windows), so it is not required.
  const report = {
    count, expectedRefused: sum((item) => !item.endless), refused: sum((item) => item.refused && !item.endless), closed: sum((item) => item.closed),
    followUpAnswered: sum((item) => item.followUpAnswered), timedOut: sum((item) => item.timedOut), kinds: [...new Set(outcomes.map((item) => item.kind))],
  };
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exit(0);
});
