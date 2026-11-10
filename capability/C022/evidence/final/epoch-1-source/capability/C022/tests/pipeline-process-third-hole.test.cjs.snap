'use strict';

// The THIRD HOLE (rev-C059 N1) against a server in a SEPARATE PROCESS (one child for the whole file, matrix-kit.cjs): a Node-own answer
// decided at PARSE time with two or three legitimate requests, or a mutation, before it, in both framings; and the structural resource
// test: 128 sockets that each send [G][G][X] must pin nothing. Facts are COUNTED (answers, closed sockets), never timed.
const assert = require('node:assert/strict');
const net = require('node:net');
const { test } = require('node:test');
const { raw } = require('./helpers.cjs');
const rows = require('./rows.cjs');
const { nodeOwn, thirdHole, useMatrix } = require('./matrix-kit.cjs');

const m = useMatrix({ remote: true });

for (const x of nodeOwn(m)) {
  test(`third hole in a separate process, ${x.name}: [G][G][X], [G][G][G][X], [G][G][X][G], [POST][G][X] in both framings`, m.cell(() => thirdHole(m, x)));
}

// Many sockets, each with two legitimate requests before the Node-own refusal. Afterwards every socket is closed BY THE SERVER, each saw
// exactly its owed answers, and a legitimate request is still served. Counted, not timed: the wait is for the close EVENTS.
function burst(count, build, statuses) {
  return new Promise((resolve, reject) => {
    const results = [];
    let pending = count;
    const deadline = setTimeout(() => reject(new Error(`${pending} of ${count} sockets were not closed by the server`)), 120000);
    for (let index = 0; index < count; index += 1) {
      const socket = net.connect({ host: '127.0.0.1', port: m.port, allowHalfOpen: true });
      const chunks = [];
      let done = false;
      const settle = () => {
        if (done) return;
        done = true;
        socket.destroy();
        results.push(raw.parseAnswers(Buffer.concat(chunks)).map((answer) => answer.status));
        pending -= 1;
        if (pending === 0) { clearTimeout(deadline); resolve(results); }
      };
      socket.on('data', (chunk) => chunks.push(chunk));
      socket.on('end', settle);
      socket.on('close', settle);
      socket.on('error', settle);
      socket.write(build());
    }
  }).then((results) => {
    assert.equal(results.length, count);
    for (const answers of results) assert.deepEqual(answers, statuses);
  });
}

test('128 sockets that each send [G][G][X] (unknown Expect) are all closed by the server and pin nothing; the 128 x [G][G][404] control behaves the same', async () => {
  await burst(128, () => Buffer.concat([m.legit(), m.legit(), rows.get(m.port, '/v1/projects', m.t.alf, '1.1', ['Expect: nonsense'])]), [200, 200, 417]);
  await burst(128, () => Buffer.concat([m.legit(), m.legit(), rows.get(m.port, '/v1/nowhere', m.t.alf, '1.1')]), [200, 200, 404]);
  await burst(64, () => Buffer.concat([m.legit(), m.legit(), Buffer.from(`GET /v1/projects HTTP/1.1\r\nHost: 127.0.0.1:${m.port}\r\nBad Header Line\r\n\r\n`)]), [200, 200, 400]);
  assert.equal((await m.call('GET', '/v1/session', { token: m.t.alf })).status, 200, 'a legitimate GET is answered after the bursts');
  // Polled to quiescence (the client side of a socket may be destroyed a moment before the server's own close event fires): no fixed sleep decides.
  let report = await m.server.ask('report', 'report');
  for (let attempt = 0; attempt < 200 && report.sockets.some((socket) => !socket.closed); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    report = await m.server.ask('report', 'report');
  }
  assert.ok(report.sockets.length >= 320, 'the server counted every attacking socket');
  assert.equal(report.sockets.filter((socket) => !socket.closed).length, 0, 'no socket is left open on the server side');
});

test('after every cell of this file the world of the server process is exactly what it was before (no refusal and no pipelined request left a trace)', () => m.worldUnchanged());
