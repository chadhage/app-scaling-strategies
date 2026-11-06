'use strict';

// Retained initial behavioral tests, part B (RED archive): cancel, abrupt close, restart, uncertain persistence,
// recovery controls and the scope record, all over real loopback sockets.
const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { call, cleanup, gate, inFlight, journalLines, load, scratch, startService, valid } = require('./initial-support.snapshot.cjs');

const KEY = valid().idempotencyKey;
const types = (dir) => journalLines(dir).map((line) => line.type);
const has = (result, code) => result.didNot.some((item) => item.code === code);
const settle = async () => { for (let turn = 0; turn < 3; turn += 1) await new Promise((resolve) => setImmediate(resolve)); };
const lease = async (port) => (await call(port, 'GET', '/v1/leases')).json.leases['synthetic-lease-001'];

test('an in-flight step can be cancelled explicitly, once, and nothing is undone or invented', async () => {
  const held = gate();
  const service = await startService({ executor: held.executor });
  try {
    const original = call(service.port, 'POST', '/v1/steps', valid());
    await inFlight(held, KEY, [original]);
    const inspected = await call(service.port, 'GET', `/v1/steps/${KEY}`);
    assert.equal(inspected.status, 202, inspected.text);
    assert.deepEqual([inspected.json.outcome, inspected.json.classification, inspected.json.terminal, inspected.json.step.state, inspected.json.effect.applied],
      ['unknown', 'UNKNOWN', false, 'in-flight', false]);
    assert.deepEqual(inspected.json.recovery.allowed, ['cancel', 'retry', 'inspect']);
    assert.equal((await lease(service.port)).held, 5);
    const cancelled = await call(service.port, 'POST', `/v1/steps/${KEY}/cancel`);
    assert.equal(cancelled.status, 200, cancelled.text);
    assert.deepEqual([cancelled.json.action, cancelled.json.accepted, cancelled.json.outcome, cancelled.json.classification, cancelled.json.effect.applied],
      ['cancel', true, 'cancelled', 'CANCELLED', false]);
    assert.ok(has(cancelled.json, 'NO_EFFECT') && has(cancelled.json, 'NO_UNDO'));
    const answered = await original;
    assert.equal(answered.status, 409);
    assert.deepEqual([answered.json.action, answered.json.accepted, answered.json.outcome], ['submit', false, 'cancelled']);
    held.release(KEY);
    await settle();
    const again = await call(service.port, 'POST', `/v1/steps/${KEY}/cancel`);
    assert.equal(again.status, 409);
    assert.equal(again.json.error.code, 'ACTION_NOT_ALLOWED');
    assert.deepEqual(again.json.recovery.allowed, ['correct-and-resubmit', 'inspect']);
    const after = await lease(service.port);
    assert.deepEqual([after.committed, after.held], [0, 0]);
    assert.deepEqual(types(service.dir), ['begin', 'cancel']);
  } finally {
    await service.stop();
    cleanup(service.dir);
  }
});

test('a client that disappears mid-step cancels nothing and a retry gets the one recorded success', async () => {
  const held = gate();
  const service = await startService({ executor: held.executor });
  try {
    const abandoned = http.request({ host: '127.0.0.1', port: service.port, method: 'POST', path: '/v1/steps', agent: false, headers: { 'Content-Type': 'application/json' } });
    const ended = new Promise((resolve) => { abandoned.on('response', resolve); abandoned.on('error', resolve); });
    abandoned.end(JSON.stringify(valid()));
    await inFlight(held, KEY, [ended]);
    abandoned.destroy();
    held.release(KEY);
    const retry = await call(service.port, 'POST', '/v1/steps', valid());
    assert.equal(retry.status, 200, retry.text);
    assert.deepEqual([retry.json.outcome, retry.json.replayed, retry.json.effect.appliedByThisRequest, retry.json.effect.reservedAfter], ['succeeded', true, false, 5]);
    assert.equal((await lease(service.port)).committed, 5);
    assert.deepEqual(types(service.dir), ['begin', 'commit']);
  } finally {
    await service.stop();
    cleanup(service.dir);
  }
});

test('a restart classifies unfinished work as interrupted; resume is explicit and gives one effect', async () => {
  const held = gate();
  const dir = scratch();
  const first = await startService({ dir, executor: held.executor });
  let second;
  try {
    const abandoned = call(first.port, 'POST', '/v1/steps', valid());
    abandoned.catch(() => {});
    await inFlight(held, KEY, [abandoned]);
    await first.stop();
    await abandoned.catch(() => {});
    assert.deepEqual(types(dir), ['begin']);
    second = await startService({ dir });
    const inspected = await call(second.port, 'GET', `/v1/steps/${KEY}`);
    assert.equal(inspected.status, 200, inspected.text);
    assert.deepEqual([inspected.json.outcome, inspected.json.classification, inspected.json.step.state, inspected.json.effect.applied, inspected.json.terminal],
      ['interrupted', 'INTERRUPTED', 'interrupted', false, false]);
    assert.deepEqual(inspected.json.recovery.allowed, ['resume', 'cancel', 'inspect']);
    assert.ok(has(inspected.json, 'NO_AUTOMATIC_RETRY'));
    assert.deepEqual(types(dir), ['begin']);
    const retried = await call(second.port, 'POST', '/v1/steps', valid());
    assert.deepEqual([retried.status, retried.json.outcome], [409, 'interrupted']);
    const resumed = await call(second.port, 'POST', `/v1/steps/${KEY}/resume`);
    assert.equal(resumed.status, 200, resumed.text);
    assert.deepEqual([resumed.json.action, resumed.json.outcome, resumed.json.effect.appliedByThisRequest, resumed.json.attempts], ['resume', 'succeeded', true, 2]);
    const replay = await call(second.port, 'POST', '/v1/steps', valid());
    assert.deepEqual([replay.status, replay.json.replayed], [200, true]);
    assert.deepEqual(types(dir), ['begin', 'resume', 'commit']);
    assert.equal((await lease(second.port)).committed, 5);
  } finally {
    await first.stop();
    await second?.stop();
    cleanup(dir);
  }
});

function flakyIo(failOnCall, reachesDisk) {
  const io = load('journal.cjs').createMemoryIo();
  let calls = 0;
  return {
    ...io,
    append(text) {
      calls += 1;
      if (calls !== failOnCall) return io.append(text);
      if (reachesDisk) io.append(text);
      throw new Error('simulated write failure');
    },
  };
}

test('a failed journal write is unknown and never success, and a retry reads the journal to decide', async () => {
  const landed = await startService({ io: flakyIo(2, true) });
  try {
    const unknown = await call(landed.port, 'POST', '/v1/steps', valid());
    assert.equal(unknown.status, 503, unknown.text);
    assert.deepEqual([unknown.json.accepted, unknown.json.outcome, unknown.json.classification, unknown.json.effect.applied, unknown.json.error.code],
      [false, 'unknown', 'UNKNOWN', null, 'JOURNAL_UNCERTAIN']);
    assert.deepEqual(unknown.json.recovery.allowed, ['retry', 'inspect']);
    assert.ok(has(unknown.json, 'NOT_CONFIRMED'));
    const retry = await call(landed.port, 'POST', '/v1/steps', valid());
    assert.equal(retry.status, 200, retry.text);
    assert.deepEqual([retry.json.outcome, retry.json.effect.appliedByThisRequest, (await lease(landed.port)).committed], ['succeeded', false, 5]);
  } finally {
    await landed.stop();
    cleanup(landed.dir);
  }
  const lost = await startService({ io: flakyIo(2, false) });
  try {
    assert.equal((await call(lost.port, 'POST', '/v1/steps', valid())).status, 503);
    const retry = await call(lost.port, 'POST', '/v1/steps', valid());
    assert.deepEqual([retry.status, retry.json.outcome], [409, 'interrupted']);
    const resumed = await call(lost.port, 'POST', `/v1/steps/${KEY}/resume`);
    assert.deepEqual([resumed.status, resumed.json.outcome, (await lease(lost.port)).committed], [200, 'succeeded', 5]);
  } finally {
    await lost.stop();
    cleanup(lost.dir);
  }
});

test('only the offered recovery controls execute and every refusal says what is allowed', async () => {
  const service = await startService();
  try {
    const done = await call(service.port, 'POST', '/v1/steps', valid());
    for (const action of ['cancel', 'resume']) {
      const refused = await call(service.port, 'POST', `/v1/steps/${KEY}/${action}`);
      assert.equal(refused.status, 409, refused.text);
      assert.deepEqual([refused.json.accepted, refused.json.outcome, refused.json.error.code], [false, 'rejected', 'ACTION_NOT_ALLOWED']);
      assert.deepEqual(refused.json.recovery.allowed, done.json.recovery.allowed);
      assert.deepEqual([refused.json.effect.applied, refused.json.effect.appliedByThisRequest], [true, false]);
    }
    for (const action of done.json.recovery.allowed) {
      const executed = action === 'retry' ? await call(service.port, 'POST', '/v1/steps', valid()) : await call(service.port, 'GET', `/v1/steps/${KEY}`);
      assert.equal(executed.status, 200, action);
    }
    const missing = await call(service.port, 'GET', '/v1/steps/unknown-key-0001');
    assert.deepEqual([missing.status, missing.json.error.code, missing.json.outcome], [404, 'STEP_NOT_FOUND', 'rejected']);
    const badKey = await call(service.port, 'POST', '/v1/steps/x/cancel');
    assert.deepEqual([badKey.status, badKey.json.error.code], [400, 'INVALID_FORMAT']);
    assert.deepEqual(types(service.dir), ['begin', 'commit']);
  } finally {
    await service.stop();
    cleanup(service.dir);
  }
});

test('the scope record states the synthetic limits and every answer carries the strict headers', async () => {
  const service = await startService();
  try {
    const scope = await call(service.port, 'GET', '/scope.json');
    assert.equal(scope.status, 200);
    assert.deepEqual([scope.json.cardId, scope.json.businessData, scope.json.liveAzureRuns, scope.json.productionRuntimeValidated], ['C042', 'synthetic', 0, false]);
    for (const response of [scope, await call(service.port, 'GET', '/nope'), await call(service.port, 'PUT', '/v1/steps')]) {
      assert.match(response.headers['content-security-policy'], /default-src 'none'/);
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
    }
    assert.equal((await call(service.port, 'GET', '/nope')).status, 404);
    assert.equal((await call(service.port, 'PUT', '/v1/steps')).status, 405);
  } finally {
    await service.stop();
    cleanup(service.dir);
  }
});
