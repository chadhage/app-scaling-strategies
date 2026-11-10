'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { dataNameProblem } = require('../runlog.cjs');
const { createLocalServer } = require('../server.cjs');
const { boot } = require('./support.cjs');

test('U060 data-name predicates reject devices and trailing separators before any OS operation', () => {
  for (const name of ['nul', 'con', 'prn', 'aux', 'COM1', 'lpt9', 'nul.json', 'store.', 'store ']) {
    assert.equal(dataNameProblem(name), 'DATA_NAME_REJECTED', name);
  }
  assert.equal(dataNameProblem('owned-store-1'), null);
});

test('U060 first-request guard invokes exact owned socket destruction on its virtual timer', async (context) => {
  const { real, runner } = await boot();
  const server = createLocalServer({ engine: real, runner });
  const callbacks = [];
  context.mock.method(globalThis, 'setTimeout', (callback, ms) => {
    callbacks.push({ callback, ms });
    return { unref() {} };
  });
  const socket = new EventEmitter();
  let destroyed = 0;
  socket.destroy = () => { destroyed += 1; socket.emit('close'); };
  const connection = server.listeners('connection').at(-1);
  connection(socket);
  assert.equal(callbacks.length, 1);
  assert.equal(callbacks[0].ms, 5000);
  callbacks[0].callback();
  assert.equal(destroyed, 1, 'the configured callback must destroy this socket, not an empty replacement');
});

test('U060 header-count guard configures the actual parser bound without waiting for a refused socket', async () => {
  const { real, runner } = await boot();
  const server = createLocalServer({ engine: real, runner });
  assert.equal(server.maxHeadersCount, 64);
});
