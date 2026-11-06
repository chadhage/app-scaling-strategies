'use strict';

// F17 and F23 of the second independent review: the bounded drain after an answer, proved with fake sockets and fake timers (no wall clock, no
// load dependence). The byte bound, the time bound and the per-process budget are each killed by a mutant of server.cjs (tests\mutants.cjs):
// the reviewer's mutants "no byte bound", "byte bound 1 GB" and "drain timer 2.8 s" used to pass every test.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { drain } = require('../server.cjs');

function fakeSocket(bytesRead = 0) {
  const socket = new EventEmitter();
  Object.assign(socket, { bytesRead, destroyed: false });
  socket.destroy = () => { if (!socket.destroyed) { socket.destroyed = true; socket.emit('close'); } };
  return socket;
}

function fakeTimers(t) {
  const scheduled = [];
  t.mock.method(globalThis, 'setTimeout', (handler, ms) => { const timer = { handler, ms, cleared: false, unref() {} }; scheduled.push(timer); return timer; });
  t.mock.method(globalThis, 'clearTimeout', (timer) => { if (timer) timer.cleared = true; });
  return scheduled;
}

test('the documented bounds of the drain', () => {
  assert.deepEqual([drain.DRAIN_BYTES, drain.DRAIN_MS, drain.MAX_DRAINING], [32768, 1000, 4]);
});

test('a drained connection is cut once it has sent more than DRAIN_BYTES, and not a byte earlier', (t) => {
  fakeTimers(t);
  const socket = fakeSocket(1000);
  drain.closeAfterAnswer(socket);
  socket.bytesRead = 1000 + drain.DRAIN_BYTES;
  socket.emit('data', Buffer.alloc(1));
  assert.equal(socket.destroyed, false, 'exactly the bound is still drained');
  socket.bytesRead += 1;
  socket.emit('data', Buffer.alloc(1));
  assert.equal(socket.destroyed, true, 'one byte over the bound is cut');
  assert.equal(drain.active(), 0, 'the budget is given back on close');
});

test('a drained connection is cut after DRAIN_MS whatever it sends, and the timer is cleared when it closes first', (t) => {
  const scheduled = fakeTimers(t);
  const slow = fakeSocket(0);
  drain.closeAfterAnswer(slow);
  assert.deepEqual(scheduled.map((timer) => timer.ms), [drain.DRAIN_MS]);
  assert.equal(slow.destroyed, false);
  scheduled[0].handler();
  assert.equal(slow.destroyed, true, 'the drain timer cuts a slow client');
  assert.equal(scheduled[0].cleared, true, 'the timer of a closed connection is cleared');
});

test('at most MAX_DRAINING connections of the process are drained at once: the surplus is closed right after its answer and the budget is returned', (t) => {
  fakeTimers(t);
  const draining = Array.from({ length: drain.MAX_DRAINING }, () => fakeSocket());
  draining.forEach((socket) => drain.closeAfterAnswer(socket));
  assert.equal(drain.active(), drain.MAX_DRAINING);
  const surplus = fakeSocket();
  drain.closeAfterAnswer(surplus);
  assert.equal(surplus.destroyed, true, 'over the budget: no drain at all');
  assert.equal(draining.some((socket) => socket.destroyed), false, 'the connections inside the budget are untouched');
  assert.equal(drain.active(), drain.MAX_DRAINING, 'a refused surplus connection takes no budget');
  draining[0].destroy();
  assert.equal(drain.active(), drain.MAX_DRAINING - 1);
  const next = fakeSocket();
  drain.closeAfterAnswer(next);
  assert.equal(next.destroyed, false, 'a returned slot is usable again');
  draining.slice(1).forEach((socket) => socket.destroy());
  next.destroy();
  assert.equal(drain.active(), 0);
});

test('a socket that is already destroyed takes no budget and no timer', (t) => {
  const scheduled = fakeTimers(t);
  const gone = fakeSocket();
  gone.destroy();
  drain.closeAfterAnswer(gone);
  assert.equal(scheduled.length, 0);
  assert.equal(drain.active(), 0);
});
