'use strict';

// Review fixes F2 (a refused request body must not keep the connection) and F5 (replayed frames are byte-identical).
const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const { createRun } = require('../run.cjs');
const { startHost, rawConnect, scratchDirectory, manualScheduler, fixtureContext } = require('./support.cjs');

const BOUND_MS = 2000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function closedWithin(state, ms) {
  const deadline = Date.now() + ms;
  while (!state.closed && Date.now() < deadline) await delay(5);
  return state.closed;
}

// One-byte chunks of an endless chunked body, written while the server decides what to do with the request.
function flood(port, chunks) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    const state = { socket, closed: false, written: 0 };
    socket.on('data', () => {});
    socket.on('error', () => {});
    socket.on('close', () => { state.closed = true; });
    socket.once('connect', () => {
      socket.write(`GET /run.json HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nTransfer-Encoding: chunked\r\n\r\n`);
      const pump = () => {
        for (let count = 0; count < 100 && !state.closed && state.written < chunks; count += 1) {
          socket.write('1\r\nA\r\n');
          state.written += 1;
        }
        if (!state.closed && state.written < chunks) setImmediate(pump);
      };
      pump();
      resolve(state);
    });
  });
}

test('F2: an endless chunked body on GET is answered and the connection is destroyed within a short bound', async () => {
  const host = await startHost();
  const accepted = [];
  host.server.on('connection', (socket) => accepted.push(socket));
  try {
    const state = await flood(host.port, 20000);
    assert.equal(await closedWithin(state, BOUND_MS), true, 'the server closes the connection after refusing the body');
    assert.equal(accepted.length, 1);
    assert.equal(accepted[0].destroyed, true, 'the server-side socket is destroyed');
    const read = accepted[0].bytesRead;
    await delay(100);
    assert.equal(accepted[0].bytesRead, read, 'no further body byte is processed');
  } finally {
    await host.close();
  }
});

test('F2: the refusal itself stays intact: 400 UNEXPECTED_BODY with Connection: close, then the connection ends', async () => {
  const host = await startHost();
  try {
    for (const header of [{ 'Content-Length': '4' }, { 'Transfer-Encoding': 'chunked' }]) {
      const client = await rawConnect(host.port, '/run.json', header);
      assert.equal(await closedWithin(client, BOUND_MS), true, `the connection ends after the refusal (${Object.keys(header)[0]})`);
      assert.match(client.received, /^HTTP\/1\.1 400 /);
      assert.match(client.received, /\r\nConnection: close\r\n/i);
      assert.match(client.received, /"code":"UNEXPECTED_BODY"/);
    }
    const next = await rawConnect(host.port, '/run.json');
    await next.waitFor((state) => state.received.includes('"scope"'), 'a normal request is still served');
    assert.match(next.received, /^HTTP\/1\.1 200 /);
    next.socket.destroy();
  } finally {
    await host.close();
  }
});

test('F5: frames replayed after a restart are byte-identical to the frames sent before it', () => {
  const scratch = scratchDirectory();
  const options = () => ({ context: fixtureContext(), scheduler: manualScheduler(), persistDir: scratch.directory, totalSteps: 20, replayWindow: 8 });
  const frames = (run) => {
    const attached = run.attach(null, () => {});
    attached.detach();
    return attached.replay.map((event) => event.frame);
  };
  try {
    const first = createRun(options());
    first.start();
    for (let count = 0; count < 12; count += 1) first.produce();
    const before = frames(first);
    first.close();
    const second = createRun(options());
    const after = frames(second);
    second.close();
    assert.equal(before.length, 8);
    assert.deepEqual(after, before, 'id, event name and data string are equal byte for byte');
    for (const frame of after) {
      assert.match(frame, /^id: synthetic-run-001:3:\d+\nevent: [a-z-]+\ndata: \{"runId":"synthetic-run-001","epoch":3,"seq":\d+,"step":\d+,"of":20,"note":"[^"]*"\}\n\n$/);
    }
  } finally {
    scratch.remove();
  }
});
