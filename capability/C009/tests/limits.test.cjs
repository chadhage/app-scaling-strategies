'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load, withApp, send } = require('./helpers.cjs');

test('state growth by authorized clients is bounded: past the entry limit a command is a typed 409 with no effect', () => withApp({ app: { limits: { entries: 3 } } }, async (context) => {
  const conductor = context.app.issueToken('conductor-a');
  const operator = context.app.issueToken('operator');
  assert.equal((await send(context, 'run.create', conductor, { name: 'a', units: 1 })).status, 200);
  assert.equal((await send(context, 'scratch.create', conductor, { name: 'b' })).status, 200);
  assert.equal((await send(context, 'experiment.approve', operator, { experimentId: 'exp-001' })).status, 200);
  const before = context.app.snapshot();
  const attempts = [['run.create', conductor, { name: 'c', units: 1 }], ['scratch.create', conductor, { name: 'c' }], ['experiment.approve', operator, { experimentId: 'exp-002' }]];
  for (const [command, token, body] of attempts) {
    const answer = await send(context, command, token, body);
    assert.deepEqual([answer.status, answer.json.error?.code], [409, 'STATE_FULL'], command);
  }
  assert.deepEqual(context.app.snapshot(), before);
  assert.equal((await send(context, 'pool.resize', operator, { size: 7 })).status, 200, 'a command that adds no entry still works');
  const refused = context.app.auditLog().filter((entry) => entry.code === 'STATE_FULL');
  assert.deepEqual(refused.map((entry) => [entry.outcome, entry.subject, entry.role]),
    [['rejected', 'conductor-a', 'conductor'], ['rejected', 'conductor-a', 'conductor'], ['rejected', 'operator', 'operator']]);
}));

test('the shipped entry limit is finite, generous and part of the frozen contract', () => {
  const { limits } = load('contract.js');
  assert.ok(Number.isInteger(limits.entries) && limits.entries >= 100 && limits.entries <= 10000, String(limits.entries));
  assert.equal(Object.isFrozen(limits), true);
});
