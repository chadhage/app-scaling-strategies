'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load, send, withApp } = require('./helpers.cjs');

const contract = load('contract.js');
const status = async (promise) => (await promise).status;
const code = async (promise) => (await promise).json?.error?.code;

test('one conductor cannot fill the state: a per-owner quota refuses it while the other conductor and the operator are still served', () => withApp({ app: { limits: { entries: 10, ownerEntries: 4 } } }, async (context) => {
  const a = context.app.issueToken('conductor-a');
  const b = context.app.issueToken('conductor-b');
  const operator = context.app.issueToken('operator');
  for (let index = 0; index < 4; index += 1) {
    assert.equal(await status(send(context, 'run.create', a, { name: `a-${index}`, units: 1 })), 200, `run ${index} is inside the quota`);
  }
  const before = JSON.stringify(context.app.snapshot());
  const over = await send(context, 'run.create', a, { name: 'a-over', units: 1 });
  assert.deepEqual([over.status, over.json?.error?.code], [409, 'OWNER_QUOTA_FULL']);
  assert.equal(JSON.stringify(context.app.snapshot()), before, 'the refused command changed nothing');
  assert.equal(await status(send(context, 'scratch.create', b, { name: 'b-scratch' })), 200, 'the other conductor is not starved');
  assert.equal(await status(send(context, 'experiment.approve', operator, { experimentId: 'exp-001' })), 200, 'the operator approval is not starved');
  assert.equal(await status(send(context, 'pool.resize', operator, { size: 4 })), 200);
  assert.equal(await code(send(context, 'scratch.create', a, { name: 'a-scratch' })), 'OWNER_QUOTA_FULL', 'scratches count toward the same owner quota');
}));

test('the shipped limits leave room for the operator approvals even when both conductors use their whole quota', () => {
  const { entries, ownerEntries } = contract.limits;
  assert.equal(Number.isInteger(ownerEntries) && ownerEntries > 0, true, 'a per-owner quota exists');
  assert.ok(2 * ownerEntries + 3 <= entries, `two conductors (${2 * ownerEntries}) plus three approvals fit in ${entries}`);
});

async function denyAs(context, token, count) {
  for (let index = 0; index < count; index += 1) assert.equal(await status(send(context, 'run.create', token, { name: 'x', units: 1 })), 403);
}

test('250 anonymous refusals cannot evict the record of an identified denial: anonymous noise has a ring of its own', () => withApp({}, async (context) => {
  await denyAs(context, context.app.issueToken('visitor'), 1);
  for (let batch = 0; batch < 10; batch += 1) {
    const answers = await Promise.all(Array.from({ length: 25 }, () => send(context, 'run.create', null, { name: 'x', units: 1 })));
    assert.deepEqual(new Set(answers.map((answer) => answer.status)), new Set([401]));
  }
  const log = context.app.auditLog();
  assert.deepEqual(log.filter((entry) => entry.outcome === 'denied').map((entry) => [entry.code, entry.subject, entry.role]), [['ROLE_FORBIDDEN', 'visitor', 'visitor']], 'the denial of the identified visitor is still recorded');
  assert.ok(log.length <= contract.limits.auditEntries + contract.limits.anonymousEntries);
}));

test('the anonymous ring is bounded and keeps the newest; the log stays in sequence order', () => withApp({ app: { limits: { auditEntries: 5, anonymousEntries: 3 } } }, async (context) => {
  await denyAs(context, context.app.issueToken('visitor'), 1);
  for (let index = 0; index < 10; index += 1) assert.equal(await status(send(context, 'run.create', null, { name: 'x', units: 1 })), 401);
  const log = context.app.auditLog();
  const anonymous = log.filter((entry) => entry.subject === null);
  assert.equal(anonymous.length, 3, 'the anonymous ring keeps only its newest entries');
  assert.equal(log.filter((entry) => entry.subject === 'visitor').length, 1);
  assert.deepEqual(log.map((entry) => entry.seq), log.map((entry) => entry.seq).sort((x, y) => x - y), 'the log is in sequence order');
  assert.equal(anonymous.at(-1).seq, log.at(-1).seq);
}));

test('the ring of identified entries is bounded and keeps the newest', () => withApp({ app: { limits: { auditEntries: 5, anonymousEntries: 3 } } }, async (context) => {
  await denyAs(context, context.app.issueToken('visitor'), 8);
  const log = context.app.auditLog();
  assert.equal(log.length, 5);
  assert.deepEqual(log.map((entry) => entry.seq), [4, 5, 6, 7, 8]);
}));

test('the shipped audit limits give anonymous noise a smaller ring than identified records', () => {
  const { auditEntries, anonymousEntries } = contract.limits;
  assert.equal(Number.isInteger(anonymousEntries) && anonymousEntries > 0 && anonymousEntries < auditEntries, true);
});
