'use strict';

// L-0120: a refused request is answered with Connection: close and the server closes the socket itself, so a client that
// keeps streaming a body it was told is refused cannot keep the server parsing it. Every wait here ends on a timer.
const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const { createLocalServer, closeServer } = require('../server.cjs');
const { listen, request, upgradeRequest, until } = require('./support.cjs');
const { delay, flood, firstResponse } = require('./limits-support.cjs');

async function withServer(body) {
  const server = createLocalServer();
  const port = await listen(server);
  try {
    return await body(server, port);
  } finally {
    await closeServer(server);
  }
}

// Sends a head, waits for the answer, then streams 1-byte chunks (an endless chunked body) until the server closes or 4 MB are out.
async function streamAfterAnswer(port, head) {
  const socket = net.connect({ host: '127.0.0.1', port });
  const seen = { text: '', closed: false };
  socket.on('error', () => {});
  socket.on('data', (chunk) => { seen.text += chunk.toString('latin1'); });
  socket.on('close', () => { seen.closed = true; });
  try {
    await new Promise((resolve) => socket.once('connect', resolve));
    socket.write(head);
    await until(() => seen.text.includes('\r\n\r\n'), 'the refusal is answered');
    const batch = Buffer.from('1\r\nx\r\n'.repeat(4000));
    const batches = await flood(socket, batch, 170, () => seen.closed);
    for (let waited = 0; waited < 2000 && !seen.closed; waited += 20) await delay(20);
    const [headText, ...rest] = seen.text.split('\r\n\r\n');
    return { status: Number(headText.split(' ')[1]), head: headText.toLowerCase(), body: rest.join('\r\n\r\n'), closed: seen.closed, batches };
  } finally {
    socket.destroy();
  }
}

test('a refused plain request with an endless chunked body is answered 400, then closed by the server', () => withServer(async (server, port) => {
  const head = `GET / HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nTransfer-Encoding: chunked\r\n\r\n`;
  const result = await streamAfterAnswer(port, head);
  assert.equal(result.status, 400);
  assert.match(result.body, /UNEXPECTED_BODY/);
  assert.match(result.head, /\r\nconnection: close/);
  assert.equal(result.closed, true, `the server kept reading an endless body (${result.batches} batches of 4000 chunks accepted)`);
  assert.equal((await firstResponse(port, request(port, { target: '/scope.json' }), 1500)).status, 200, 'the fixture still answers');
}));

test('a refused upgrade with an endless chunked body is answered 400, then closed by the server', () => withServer(async (server, port) => {
  const result = await streamAfterAnswer(port, upgradeRequest(port, { headers: { 'Transfer-Encoding': 'chunked', Connection: 'Upgrade' } }));
  assert.equal(result.status, 400);
  assert.match(result.body, /UNEXPECTED_BODY/);
  assert.equal(result.closed, true, `the server kept reading an endless body (${result.batches} batches accepted)`);
  assert.equal(server.hub.sessionCount(), 0);
  assert.equal((await firstResponse(port, request(port, { target: '/scope.json' }), 1500)).status, 200, 'the fixture still answers');
}));

test('every refusal of the plain routes says Connection: close; an answered request does not', () => withServer(async (server, port) => {
  const keepAlive = { Connection: undefined };
  const refusals = [
    ['/nowhere', { headers: keepAlive }, 404],
    ['/stream', { headers: keepAlive }, 426],
    ['/', { method: 'POST', headers: keepAlive }, 405],
    ['/', { headers: { ...keepAlive, Host: 'example.invalid' } }, 421],
    ['/', { headers: { ...keepAlive, Origin: 'http://example.invalid' } }, 403],
    ['/page.js?x=1', { headers: keepAlive }, 400],
    ['/', { headers: { ...keepAlive, 'Content-Length': '5' } }, 400]
  ];
  for (const [target, options, status] of refusals) {
    const response = await firstResponse(port, request(port, { target, ...options }), 1500);
    assert.equal(response.status, status, `${target} ${JSON.stringify(options)}`);
    assert.equal(response.headers.connection, 'close', `${status} for ${target} must close the connection`);
  }
  const answered = await firstResponse(port, request(port, { target: '/scope.json', headers: keepAlive }), 1500);
  assert.equal(answered.status, 200);
  assert.notEqual(answered.headers.connection, 'close');
}));
