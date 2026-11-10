'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { main } = require('../cli.cjs');

const approved = require('../../C001/approved-contract.js').approval;

function fakes() {
  const seen = { logs: [], errors: [], handlers: new Map() };
  return { seen, io: { log: (line) => seen.logs.push(line), error: (line) => seen.errors.push(line), onSignal: (name, handler) => seen.handlers.set(name, handler) } };
}

test('main refuses any argument before it reads consent or listens', async () => {
  const { seen, io } = fakes();
  let reads = 0;
  const result = await main(['node', 'cli.cjs', '--port=80'], io, { readApproval: () => { reads += 1; return approved; } });
  assert.equal(result.code, 1);
  assert.equal(reads, 0);
  assert.match(seen.errors[0], /accepts no host, port, identity, role, token, lifetime or permission overrides/);
  assert.deepEqual(seen.logs, []);
});

test('main prints one startup line, registers both signals and closes the listener on SIGTERM', async () => {
  const { seen, io } = fakes();
  const result = await main(['node', 'cli.cjs'], io, { readApproval: () => approved });
  assert.equal(result.code, 0);
  assert.equal(seen.logs.length, 1);
  const started = JSON.parse(seen.logs[0]);
  assert.equal(started.event, 'C009-local-listening');
  assert.equal(started.origin, result.local.origin);
  assert.deepEqual(Object.keys(started.tokens), ['visitor', 'conductor-a', 'conductor-b', 'operator']);
  assert.deepEqual([...seen.handlers.keys()], ['SIGINT', 'SIGTERM']);
  seen.handlers.get('SIGTERM')();
  await result.local.closed;
  assert.equal(result.local.server.listening, false);
});

test('main reports a consent failure on the error stream with exit code 1 and never prints a startup line', async () => {
  const { seen, io } = fakes();
  const result = await main(['node', 'cli.cjs'], io, { readApproval: () => ({}) });
  assert.equal(result.code, 1);
  assert.match(seen.errors[0], /C001 local consent denied/);
  assert.deepEqual(seen.logs, []);
  assert.equal(seen.handlers.size, 0);
});

test('with the default console and signal wiring main still behaves the same', async (t) => {
  const log = t.mock.method(console, 'log', () => {});
  const once = t.mock.method(process, 'once', () => process);
  const result = await main(['node', 'cli.cjs'], undefined, { readApproval: () => approved });
  try {
    assert.equal(result.code, 0);
    assert.equal(log.mock.callCount(), 1);
    assert.deepEqual(once.mock.calls.map((call) => call.arguments[0]), ['SIGINT', 'SIGTERM']);
  } finally {
    await result.local.close();
  }
});
