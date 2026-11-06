'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const { load } = require('./helpers.cjs');

// Defense in depth of review finding F1b: even when a request was dispatched before a refusal was decided on its connection (an
// importer that does not use createLanes, or a future change), nothing after the refusal may reach the audit log or ledger.commit.
// The pipeline re-checks the mark of its socket after every await and immediately before the commit.
const { createCommandPipeline } = load('commands.cjs');
const { createTokenRegistry } = load('authz.cjs');
const { createLedger } = load('ledger.cjs');
const { createQueue } = load('queue.cjs');
const { defaultHandlers } = load('handlers.cjs');
const contract = load('contract.js');
const io = load('http-io.cjs');

function fixture(hooks = {}) {
  const registry = createTokenRegistry({});
  const ledger = createLedger(contract.limits.auditEntries, contract.limits.entries);
  const handle = createCommandPipeline({ registry, ledger, queue: createQueue(), table: contract.commands, handlers: defaultHandlers, hooks, validate: contract.validateInput });
  const token = registry.issue('operator');
  const socket = { destroyed: false, _handle: { readStop() {} }, destroy() { this.destroyed = true; } };
  const answers = [];
  const out = { json: (status, value) => answers.push([status, value.outcome]), fail: (code) => answers.push([code]), proceed() {} };
  const request = Object.assign(new EventEmitter(), {
    socket, rawHeaders: ['Authorization', `Bearer ${token}`, 'Content-Type', 'application/json'], headers: { 'content-type': 'application/json' }
  });
  const url = new URL('http://127.0.0.1/v1/commands/pool.resize');
  const run = (body, beforeBody = () => {}) => {
    setImmediate(() => { beforeBody(); request.emit('data', Buffer.from(body)); request.emit('end'); });
    return handle(request, out, url, 'pool.resize');
  };
  return { ledger, socket, answers, run };
}

test('control: a request on a connection nobody refused is applied and answered', async () => {
  const { ledger, answers, run } = fixture();
  await run('{"size":7}');
  assert.deepEqual(answers, [[200, 'ok']]);
  assert.equal(ledger.snapshot().revision, 1);
});

test('a request whose connection was refused while its body was arriving is dropped before it is parsed: no answer, no audit record', async () => {
  const { ledger, socket, answers, run } = fixture();
  await run('{bad json', () => io.endConnection(socket));
  assert.deepEqual(answers, [], 'nothing is answered on a refused connection');
  assert.deepEqual(ledger.auditLog(), [], 'and nothing is audited for a request that never ran');
  assert.equal(ledger.snapshot().revision, 0);
});

test('a request whose connection was refused while it waited for its turn to commit never reaches ledger.commit', async () => {
  let mark = () => {};
  const { ledger, socket, answers, run } = fixture({ beforeCommit: () => mark() });
  mark = () => io.endConnection(socket);
  await run('{"size":7}');
  assert.deepEqual(answers, [], 'no answer');
  assert.equal(ledger.snapshot().revision, 0, 'no commit');
  assert.equal(ledger.snapshot().state.pool.size, 2);
  assert.deepEqual(ledger.auditLog(), [], 'no audit record');
});
