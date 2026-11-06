'use strict';

// F25 of the third independent review: the lifecycle waits of tests\child.cjs (the child's listening line, its exit after "stop" and its exit
// after a kill) carry NO deadline that can fire on a healthy child. Proved with a FAKE child that is slower than any deadline the helper could
// have, on a MOCKED clock: ten minutes of virtual time pass (t.mock.timers) before the fake child prints its listening line and before it exits,
// and the helper still resolves with the event. A helper that raced a timer against the child (the 20 s and 8 s guards of the third review)
// rejects at the first tick and fails these tests by assertion. The polling helpers are proved the same way: a named error only when the test's own
// signal aborts, never after a time.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const s = require('./support.cjs');
const { startChild, pollState, readMem } = require('./child.cjs');

const TEN_MINUTES = 10 * 60 * 1000;
const settle = () => new Promise((resolve) => setImmediate(resolve));

function fakeChild({ killExits = true } = {}) {
  const child = new EventEmitter();
  Object.assign(child, { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), exitCode: null, signalCode: null });
  child.exit = (code) => { child.exitCode = code; child.emit('exit', code, null); };
  child.kill = () => { if (killExits) child.exit(1); return true; };
  child.listening = (origin) => child.stdout.write(`${JSON.stringify({ event: 'C017-local-listening', origin })}\n`);
  return child;
}

// Follows a promise without awaiting it, so that a test can look at it while it is still pending.
function track(promise) {
  const state = { done: false };
  state.promise = promise.then((value) => { state.done = true; state.value = value; return value; }, (error) => { state.done = true; state.error = error; });
  return state;
}

test('origin() waits for the listening line of a child that is slower than any deadline: ten virtual minutes pass and it still resolves with the origin', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const child = fakeChild();
  const kid = startChild(t, { launch: () => child });
  const waiting = track(kid.origin());
  t.mock.timers.tick(TEN_MINUTES);
  await settle();
  assert.equal(waiting.done, false, `origin() settled after ten virtual minutes: ${waiting.error ? waiting.error.message : waiting.value}`);
  child.listening('http://127.0.0.1:4321');
  assert.equal(await waiting.promise, 'http://127.0.0.1:4321');
  child.exit(0);
});

test('origin() rejects at once, with the child\'s own words, when the child exits before it listened (an event, not a deadline)', async (t) => {
  const child = fakeChild();
  const kid = startChild(t, { launch: () => child });
  const waiting = track(kid.origin());
  child.stderr.write('boom: consent unavailable');
  await settle();
  child.exit(3);
  await waiting.promise;
  assert.match(waiting.error.message, /the child exited early: boom: consent unavailable/);
});

test('stop() waits for the exit of a child that needs longer than any deadline and resolves with its exit code', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const child = fakeChild();
  const kid = startChild(t, { launch: () => child });
  const stopping = track(kid.stop());
  t.mock.timers.tick(TEN_MINUTES);
  await settle();
  assert.equal(stopping.done, false, `stop() settled after ten virtual minutes: ${stopping.error ? stopping.error.message : JSON.stringify(stopping.value)}`);
  child.exit(0);
  assert.deepEqual(await stopping.promise, { code: 0, signal: null });
});

test('kill() waits for the exit of a child that is slow to die and resolves with its exit', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const child = fakeChild({ killExits: false });
  const kid = startChild(t, { launch: () => child });
  const killing = track(kid.kill());
  t.mock.timers.tick(TEN_MINUTES);
  await settle();
  assert.equal(killing.done, false, `kill() settled after ten virtual minutes: ${killing.error ? killing.error.message : JSON.stringify(killing.value)}`);
  child.exit(1);
  assert.deepEqual(await killing.promise, { code: 1, signal: null });
});

test('pollState waits until the predicate holds, and with a signal it ends with the named message only when the signal aborts', async (t) => {
  let ready = false;
  let polls = 0;
  const waiting = [];
  const server = http.createServer((request, response) => {
    polls += 1;
    for (const entry of waiting.filter((item) => item.count <= polls)) entry.resolve();
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ journal: [], ready }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const afterPolls = (count) => (polls >= count ? Promise.resolve() : new Promise((resolve) => waiting.push({ count, resolve })));

  const controller = new AbortController();
  const aborted = track(pollState(origin, () => false, 'the state never changed', { signal: controller.signal }));
  await afterPolls(3);
  assert.equal(aborted.done, false, 'no signal, no end');
  controller.abort();
  // Counted, never timed: the helper ends by itself, or it is still polling three polls later and the assertion below names it.
  await Promise.race([aborted.promise, afterPolls(polls + 3)]);
  assert.equal(aborted.done, true, 'the poll went on after the signal aborted');
  assert.equal(aborted.error.message, 'the state never changed');

  const open = track(pollState(origin, (state) => state.ready, 'never ready'));
  await afterPolls(polls + 2);
  assert.equal(open.done, false);
  ready = true;
  assert.equal((await open.promise).ready, true);
});

test('readMem with a signal waits until the file parses and ends only when the signal aborts; without a signal it keeps its own deadline', async (t) => {
  const made = s.scratch('lc');
  t.after(() => made.remove());
  const file = path.join(made.dir, 'mem.json');
  const controller = new AbortController();
  const waiting = track(readMem(file, { signal: controller.signal }));
  await settle();
  assert.equal(waiting.done, false);
  fs.writeFileSync(file, '{"heapUsed":');
  await settle();
  assert.equal(waiting.done, false, 'a half-written sample is retried');
  fs.writeFileSync(file, JSON.stringify({ heapUsed: 10, rss: 20 }));
  assert.deepEqual(await waiting.promise, { heapUsed: 10, rss: 20 });

  fs.rmSync(file);
  const never = track(readMem(file, { signal: controller.signal }));
  await settle();
  controller.abort();
  await never.promise;
  assert.match(never.error.message, /never produced a parseable heap sample \(/);
  await assert.rejects(readMem(file, { ms: 100 }), /never produced a parseable heap sample within 100 ms/);
});
