'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const lib = require('./u039-lib.cjs');

test('mutant J: dropping a request releases its lane entry before the event-loop barrier', { timeout: 60000 }, async () => {
  const instance = await lib.startInProcess();
  try {
    const [handle] = instance.server.listeners('request');
    const socket = { remoteAddress: '127.0.0.1', destroy() { this.destroyed = true; } };
    const response = () => Object.assign(new EventEmitter(), {
      destroyed: false, writableEnded: false,
      writeHead(status) { this.status = status; },
      end() { this.writableEnded = true; this.emit('finish'); }
    });
    const responses = Array.from({ length: 4 }, response);
    const settled = [];
    const handlers = responses.map((reply, index) => Promise.resolve(handle({
      socket, method: 'GET', url: index === 0 ? '/nope' : '/v1/leases',
      headers: { host: `127.0.0.1:${instance.port}` }, complete: true
    }, reply)).then(() => { settled.push(index); }));
    await handlers[0];
    assert.equal(responses[0].status, 404, 'the first handler actually refused');
    assert.equal(socket.destroyed, true, 'the refusal decided closure');
    responses[0].emit('close');
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(settled.sort(), [0, 1, 2, 3], 'all four handlers settled after the response-close microtasks; no timer chooses this assertion');
    assert.equal(responses.slice(1).every((reply) => !reply.writableEnded), true, 'dropped requests never wrote');
  } finally { await instance.close(); }
});
