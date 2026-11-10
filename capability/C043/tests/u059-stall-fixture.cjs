'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const repository = path.resolve(__dirname, '..', '..', '..');
const CURRENT = 'capability\\C043\\tests\\stall.preload.cjs';
const ORIGINAL = 'capability\\C043\\evidence\\u059\\superseded\\tests\\stall.preload.cjs.txt';

function exercise(relative = CURRENT) {
  let armed = false;
  let ticks = 0n;
  let unarmedClockCalls = 0;
  let armedClockCalls = 0;
  const messages = [];
  const listeners = [];
  class Server {
    emit() { return true; }
  }
  const processFixture = {
    env: { C043_STALL_MS: '5' }, argv: ['node', path.join(repository, 'capability', 'C043', 'tests', 'child-server-r3.cjs')],
    hrtime: { bigint() {
      if (armed) armedClockCalls += 1; else unarmedClockCalls += 1;
      assert.ok(unarmedClockCalls + armedClockCalls < 100, 'injected clock bounds the retained blocking loop');
      const value = ticks;
      ticks += 5_000_000n;
      return value;
    } },
    send(message) {
      if (message.type === 'listening') armed = true;
      messages.push(message);
      return true;
    },
    prependListener(name, callback) { assert.equal(name, 'message'); listeners.unshift(callback); },
  };
  const resolve = (name) => {
    if (name === 'node:net') return { Server };
    if (name === 'node:path') return path;
    if (name === './u059-stall-observer.cjs') return require('./u059-stall-observer.cjs');
    throw new Error(`UNEXPECTED_STALL_FIXTURE_IMPORT ${name}`);
  };
  const source = fs.readFileSync(path.join(repository, relative), 'utf8');
  vm.compileFunction(source, ['require', 'process', '__dirname'], { filename: CURRENT })(resolve, processFixture, __dirname);
  const server = new Server();
  server.emit('connection', {});
  processFixture.send({ type: 'listening', port: 0 });
  server.emit('connection', {});
  server.emit('connection', {});
  processFixture.send({ type: 'stats' });
  const first = messages.at(-1);
  for (const callback of listeners) callback({ type: 'reset' });
  server.emit('connection', {});
  processFixture.send({ type: 'stats' });
  return { unarmedClockCalls, armedClockCalls, first, second: messages.at(-1) };
}

function assertObserved(result) {
  assert.equal(result.unarmedClockCalls, 0, 'U059: a requested stall must not be consumed before observation is armed');
  for (const message of [result.first, result.second]) {
    assert.ok(message.stallObservation, 'U059: each armed phase must report exercised stall facts');
    assert.equal(message.stallObservation.armed, true);
    assert.deepEqual(
      [message.stallObservation.requests, message.stallObservation.starts, message.stallObservation.blockCalls, message.stallObservation.completions],
      [1, 1, 1, 1], 'U059: exactly one requested block completes in each armed phase',
    );
  }
  assert.equal(result.second.stallObservation.phase, result.first.stallObservation.phase + 1);
}

module.exports = { CURRENT, ORIGINAL, exercise, assertObserved };
