'use strict';

// Test tooling, not production code: the attacker, in its own process. C014_ATTACK is a JSON list of targets, attacked at the same time:
//   { key, port, sockets, shape, bytes, token, waitMs, maxMs, hold } with shape
//   chunked  : POST a refused command with Transfer-Encoding: chunked, then pump one-byte chunks (6 bytes each) until `bytes` are written or the server ends it.
//   gg-expect: one write [GET][GET][GET with Expect: nonsense] (the third pipelining hole), then wait for the server to end the connection.
// hold: true keeps the sockets of that target OPEN after their last byte is written, until the parent sends `release` (a control server then gets the time it needs to consume
// everything, decided by a fact the parent polls, never by a timer); the parent is told with `written` once every socket of every target has written its last byte.
// It reports, per target and socket, the status of the first answer, how many answers came, whether the SERVER ended the connection (the end, the close or the
// error came before this process gave up) and how many bytes it wrote. Nothing here measures time; maxMs is a hard cap so a stalled server cannot hang the test.
const net = require('node:net');

const targets = JSON.parse(process.env.C014_ATTACK);
const PUMP = '1\r\nx\r\n'.repeat(2048);
const released = new Promise((resolve) => process.on('message', (message) => { if (message && message.type === 'release') resolve(); }));
const writes = [];

function attack(options, index) {
  return new Promise((resolve) => {
    const socket = net.connect({ port: options.port, host: '127.0.0.1' });
    const report = { index, status: 0, serverEnded: false, written: 0, answers: 0 };
    let writesDone;
    writes.push(new Promise((resolveWrites) => { writesDone = resolveWrites; }));
    let seen = '';
    let finished = false;
    const done = () => { writesDone(); if (!finished) { finished = true; clearTimeout(guard); socket.destroy(); resolve(report); } };
    const guard = setTimeout(done, options.maxMs || 20000);
    const ended = () => { if (!finished) { report.serverEnded = true; done(); } };
    socket.on('data', (chunk) => {
      seen += chunk.toString('latin1');
      report.answers = (seen.match(/HTTP\/1\.[01] \d{3}/g) || []).length;
      const match = /^HTTP\/1\.[01] (\d{3})/.exec(seen);
      if (match) report.status = Number(match[1]);
    });
    socket.on('end', () => { if (!finished) report.serverEnded = true; });
    socket.on('close', ended);
    socket.on('error', ended);
    socket.on('connect', () => {
      if (options.shape === 'gg-expect') {
        const get = (extra = '') => `GET /scope.json HTTP/1.1\r\nHost: 127.0.0.1:${options.port}\r\n${extra}\r\n`;
        socket.write(get() + get() + get('Expect: nonsense\r\n'));
        writesDone();
        setTimeout(done, options.waitMs || 6000);
        return;
      }
      socket.write(`POST /v1/commands/run.create HTTP/1.1\r\nHost: 127.0.0.1:${options.port}\r\nContent-Type: application/json\r\nAuthorization: Bearer ${options.token}\r\nTransfer-Encoding: chunked\r\n\r\n`);
      const pump = () => {
        if (finished) return;
        if (report.written >= options.bytes || socket.destroyed) {
          writesDone();
          if (options.hold) released.then(() => setTimeout(done, options.waitMs || 1500)); else setTimeout(done, options.waitMs || 1500);
          return;
        }
        report.written += PUMP.length;
        if (socket.write(PUMP, 'latin1')) setImmediate(pump); else socket.once('drain', pump);
      };
      pump();
    });
  });
}

(async () => {
  const attacked = Promise.all(targets.map(async (target) => [target.key, await Promise.all(Array.from({ length: target.sockets }, (_, index) => attack(target, index)))]));
  Promise.all(writes).then(() => process.send({ type: 'written' }));
  const entries = await attacked;
  process.send({ type: 'report', sockets: Object.fromEntries(entries) }, () => process.exit(0));
})();
