'use strict';

// The independent reviewer's two memory reproductions, each against the fixture in a child process whose heap is limited
// to 96 MB. Without the fix the child dies (exit 134, heap out of memory); with it the child survives and answers HTTP.
const assert = require('node:assert/strict');
const test = require('node:test');
const framing = require('../framing.cjs');
const { request } = require('./support.cjs');
const { HEAP_MB, clientFrame, delay, startChild, openUpgraded, flood, firstResponse } = require('./limits-support.cjs');

async function health(child) {
  return (await firstResponse(child.port, request(child.port, { target: '/scope.json' }), 3000)).status;
}

test('F1a: a message of 1.8 million zero-length continuation frames ends in a 1009 close, not a dead 96 MB fixture', { timeout: 90000 }, async () => {
  const child = await startChild();
  try {
    const peer = await openUpgraded(child.port);
    const empty = clientFrame(framing.OPCODES.continuation, Buffer.alloc(0), false);
    const batch = Buffer.concat(Array.from({ length: 10000 }, () => empty));
    peer.socket.write(clientFrame(framing.OPCODES.text, '{', false));
    const batches = await flood(peer.socket, batch, 180, () => peer.seen.close !== null);
    const close = await peer.closeFrame(2000);
    await delay(close.code === null ? 1500 : 0);
    assert.deepEqual(close, { code: 1009, reason: 'TOO_MANY_FRAGMENTS' }, `${batches} batches of 10000 empty frames were sent; the child heap limit is ${HEAP_MB} MB`);
    assert.equal(child.state.alive, true, `the fixture died: ${JSON.stringify(child.state.exit)}`);
    assert.equal(await health(child), 200);
    peer.socket.destroy();
  } finally {
    await child.stop();
  }
});

test('F1b: 1.2 million pings from a client that never reads end with that client dropped, not a dead 96 MB fixture', { timeout: 90000 }, async () => {
  const child = await startChild();
  try {
    const peer = await openUpgraded(child.port, { read: false });
    const batch = Buffer.concat(Array.from({ length: 500 }, () => clientFrame(framing.OPCODES.ping, Buffer.alloc(125, 7))));
    const batches = await flood(peer.socket, batch, 2400);
    await delay(child.state.alive ? 500 : 0);
    assert.equal(child.state.alive, true, `the fixture died after ${batches} of 2400 batches: ${JSON.stringify(child.state.exit)}`);
    assert.equal(batches < 2400, true, 'the fixture kept queueing replies for a client that never reads');
    assert.equal(await health(child), 200);
    peer.socket.destroy();
  } finally {
    await child.stop();
  }
});
