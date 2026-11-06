'use strict';

// Third review, Q5: the equivalence proof of mutant S5 (deleting `response.once('finish', () => request.socket.destroy())` in writeAnswer survives every suite). The destroy is
// redundant because EVERY refusal says `Connection: close` (the lane, pipelining and server tests assert the header on every refusal row) and Node itself then ends the connection
// after the flush (`res._last`, then `socket.destroySoon()` when the response finishes). This file SHOWS the second half on the platform that runs the tests: a bare HTTP
// server that answers with `Connection: close` and has NO destroy anywhere closes the connection in every shape that matters (a refused request followed by more requests, a refused
// request whose chunked body never ends, HTTP/1.0), while the same server without the header keeps the connection (the control that proves the test can tell the two apart).
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const test = require('node:test');

const OPTIONS = { timeout: 60000 };
const WATCHDOG_MS = 30000;
const REFUSAL = Buffer.from('{"accepted":false}');

async function bare({ close }) {
  const finished = { count: 0 };
  const server = http.createServer((request, response) => {
    response.once('finish', () => { finished.count += 1; });
    response.writeHead(400, { 'Content-Type': 'application/json', 'Content-Length': REFUSAL.length, ...(close ? { Connection: 'close' } : {}) });
    response.end(REFUSAL);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, finished, port: server.address().port, stop: () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }) };
}

const answers = (text) => [...text.matchAll(/HTTP\/1\.[01] (\d{3}) [A-Za-z ]+\r\n/g)].map((match) => Number(match[1]));

// Writes `first`, then keeps writing `more` (when given) until the server closes the connection, the writes are used up or the watchdog fires.
async function exchange(port, first, more = null, writes = 400) {
  const socket = net.connect({ host: '127.0.0.1', port });
  const chunks = [];
  socket.on('error', () => {});
  socket.on('data', (chunk) => chunks.push(chunk));
  let closed = false;
  const done = new Promise((resolve) => socket.once('close', () => { closed = true; resolve(true); }));
  const watchdog = new Promise((resolve) => { setTimeout(() => resolve(false), WATCHDOG_MS).unref(); });
  try {
    socket.write(first);
    for (let index = 0; more !== null && index < writes && !closed; index += 1) await Promise.race([new Promise((resolve) => socket.write(more, resolve)), done]);
    const closedByServer = await Promise.race([done, watchdog]);
    return { closedByServer, text: Buffer.concat(chunks).toString('latin1') };
  } finally {
    socket.destroy();
  }
}

const GET = 'GET / HTTP/1.1\r\nHost: x\r\n\r\n';
const TINY = 'GET / HTTP/1.1\r\n\r\n'.repeat(100);

test('Node itself closes the connection after a response that says Connection: close, with no destroy anywhere (the premise of the S5 equivalence)', OPTIONS, async (t) => {
  const { port, stop } = await bare({ close: true });
  try {
    const single = await exchange(port, GET);
    assert.equal(single.closedByServer, true, 'one refused request');
    assert.deepEqual(answers(single.text), [400]);
    const pipelined = await exchange(port, GET + GET + GET);
    assert.equal(pipelined.closedByServer, true, 'three requests pipelined in one write');
    assert.ok(answers(pipelined.text).length >= 1 && answers(pipelined.text).every((status) => status === 400));
    const flooded = await exchange(port, GET, TINY);
    assert.equal(flooded.closedByServer, true, 'a refused request followed by a stream of further requests');
    const endless = await exchange(port, 'POST / HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n1\r\nx\r\n', '1\r\nx\r\n'.repeat(100));
    assert.equal(endless.closedByServer, true, 'a refused request whose chunked body never ends (the handler never read it; the answer itself may be lost to the reset)');
    const old = await exchange(port, 'GET / HTTP/1.0\r\n\r\n');
    assert.equal(old.closedByServer, true, 'HTTP/1.0');
    t.diagnostic(JSON.stringify({ single: answers(single.text), pipelined: answers(pipelined.text), flooded: answers(flooded.text), endless: answers(endless.text), http10: answers(old.text) }));
  } finally {
    await stop();
  }
});

const until = (check) => new Promise((resolve) => { const poll = () => (check() ? resolve() : setImmediate(poll)); poll(); });

test('the control: the same bare server WITHOUT the header answers BOTH pipelined requests on one connection and keeps it open, where the closing server answers one and closes, so the test above can tell closing from not closing', OPTIONS, async () => {
  const { port, finished, stop } = await bare({ close: false });
  const socket = net.connect({ host: '127.0.0.1', port });
  const chunks = [];
  socket.on('error', () => {});
  socket.on('data', (chunk) => chunks.push(chunk));
  const received = () => answers(Buffer.concat(chunks).toString('latin1'));
  try {
    socket.write(GET + GET);
    await until(() => received().length >= 2 && finished.count >= 2);
    assert.deepEqual(received(), [400, 400], 'both pipelined requests were answered on one connection');
    assert.equal(socket.destroyed, false, 'and the connection is still open after the second answer finished');
  } finally {
    socket.destroy();
    await stop();
  }
});
