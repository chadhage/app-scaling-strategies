'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const contract = require('../contract.js');
const journal = require('../journal.cjs');
const { call, cleanup, gate, inFlight, scratch, startService, valid } = require('./support.cjs');

const KEY = valid().idempotencyKey;
const text = (overrides) => JSON.stringify(valid(overrides));
const honest = (response) => {
  assert.equal(response.status >= 200 && response.status < 300, response.json.accepted, response.text);
  assert.equal(contract.validateResultEnvelope(response.json).ok, true, response.text);
};

// Builds a service whose step for KEY is in the given state and returns the envelope that offers the controls.
async function build(state) {
  const held = gate();
  const dir = scratch();
  let service = await startService({ dir, executor: held.executor });
  const pending = call(service.port, 'POST', '/v1/steps', text());
  pending.catch(() => {});
  if (state === 'committed') {
    held.release(KEY);
    await pending;
  } else {
    await inFlight(held, KEY, [pending]);
  }
  if (state === 'cancelled') {
    await call(service.port, 'POST', `/v1/steps/${KEY}/cancel`);
    held.release(KEY);
  }
  if (state === 'interrupted') {
    await service.stop();
    service = await startService({ dir });
  }
  const offered = await call(service.port, 'GET', `/v1/steps/${KEY}`);
  honest(offered);
  assert.equal(offered.json.step.state, state);
  return { service, held, pending, offered: offered.json, close: async () => { await service.stop(); cleanup(dir); } };
}

const run = (port, action) => (action === 'inspect' ? call(port, 'GET', `/v1/steps/${KEY}`) : call(port, 'POST', `/v1/steps/${KEY}/${action}`));

test('a control executes exactly when the result offers it, and every refusal repeats what is allowed', async () => {
  const offers = { committed: ['retry', 'inspect'], 'in-flight': ['cancel', 'retry', 'inspect'], cancelled: ['correct-and-resubmit', 'inspect'], interrupted: ['resume', 'cancel', 'inspect'] };
  for (const [state, allowed] of Object.entries(offers)) {
    for (const action of ['cancel', 'resume', 'inspect']) {
      const fixture = await build(state);
      try {
        assert.deepEqual(fixture.offered.recovery.allowed, allowed, state);
        const response = await run(fixture.service.port, action);
        honest(response);
        const offered = allowed.includes(action);
        assert.equal(response.json.accepted, offered, `${state}/${action}`);
        if (!offered) {
          assert.deepEqual([response.status, response.json.error.code, response.json.action], [409, 'ACTION_NOT_ALLOWED', action]);
          assert.deepEqual(response.json.recovery.allowed, allowed);
          const after = await call(fixture.service.port, 'GET', `/v1/steps/${KEY}`);
          assert.deepEqual([after.json.step.state, after.json.trail], [fixture.offered.step.state, fixture.offered.trail], 'a refused action changes nothing');
        }
        fixture.held.release(KEY);
      } finally {
        await fixture.close();
      }
    }
  }
});

test('retry is executable where it is offered: it replays, joins or reports, and never applies a second effect', async () => {
  const done = await build('committed');
  try {
    const retry = await call(done.service.port, 'POST', '/v1/steps', text());
    assert.deepEqual([retry.status, retry.json.replayed, retry.json.effect.appliedByThisRequest], [200, true, false]);
  } finally {
    await done.close();
  }
  const running = await build('in-flight');
  try {
    const joined = call(running.service.port, 'POST', '/v1/steps', text());
    running.held.release(KEY);
    const [first, second] = await Promise.all([running.pending, joined]);
    assert.deepEqual([first.status, second.status].sort(), [200, 201]);
  } finally {
    await running.close();
  }
  const stopped = await build('interrupted');
  try {
    const retry = await call(stopped.service.port, 'POST', '/v1/steps', text());
    assert.deepEqual([retry.status, retry.json.outcome, retry.json.recovery.allowed], [409, 'interrupted', ['resume', 'cancel', 'inspect']]);
  } finally {
    await stopped.close();
  }
});

test('cancel and resume do what they say, and nothing else', async () => {
  const running = await build('in-flight');
  try {
    const cancelled = await run(running.service.port, 'cancel');
    assert.deepEqual([cancelled.status, cancelled.json.outcome, cancelled.json.effect.applied], [200, 'cancelled', false]);
    assert.deepEqual((await running.pending).json.outcome, 'cancelled');
  } finally {
    await running.close();
  }
  const stopped = await build('interrupted');
  try {
    const resumed = await run(stopped.service.port, 'resume');
    assert.deepEqual([resumed.status, resumed.json.outcome, resumed.json.attempts, resumed.json.trail.map((item) => item.type)], [200, 'succeeded', 2, ['begin', 'resume', 'commit']]);
  } finally {
    await stopped.close();
  }
  const abandoned = await build('interrupted');
  try {
    const cancelled = await run(abandoned.service.port, 'cancel');
    assert.deepEqual([cancelled.status, cancelled.json.outcome, cancelled.json.trail.map((item) => item.type)], [200, 'cancelled', ['begin', 'cancel']]);
    assert.equal((await run(abandoned.service.port, 'resume')).json.error.code, 'ACTION_NOT_ALLOWED');
  } finally {
    await abandoned.close();
  }
});

test('correct-and-resubmit works for every typed failure that offers it', async () => {
  const service = await startService();
  try {
    const { port } = service;
    const bad = await call(port, 'POST', '/v1/steps', text().replace('"units":5', '"units":5,"units":6'));
    assert.deepEqual(bad.json.recovery.allowed, ['correct-and-resubmit']);
    assert.equal((await call(port, 'POST', '/v1/steps', text())).status, 201, 'the same key is free after a rejection');
    const conflict = await call(port, 'POST', '/v1/steps', text({ units: 6 }));
    assert.deepEqual(conflict.json.recovery.allowed, ['correct-and-resubmit', 'inspect']);
    assert.equal((await call(port, 'GET', `/v1/steps/${KEY}`)).status, 200);
    assert.deepEqual((await call(port, 'POST', '/v1/steps', text())).json.replayed, true);
    assert.equal((await call(port, 'POST', '/v1/steps', text({ idempotencyKey: 'key-0002-bbbb', units: 6 }))).status, 201, 'a new key is the correction');
    const unsupported = await call(port, 'POST', '/v1/steps', text({ idempotencyKey: 'key-0003-cccc', step: 'release-capacity' }));
    assert.deepEqual([unsupported.status, unsupported.json.recovery.allowed], [422, ['correct-and-resubmit']]);
    assert.equal((await call(port, 'POST', '/v1/steps', text({ idempotencyKey: 'key-0003-cccc' }))).status, 201);
    const big = { leaseId: 'synthetic-lease-002', units: 10 };
    assert.equal((await call(port, 'POST', '/v1/steps', text({ idempotencyKey: 'key-0004-dddd', ...big }))).status, 201);
    const exhausted = await call(port, 'POST', '/v1/steps', text({ idempotencyKey: 'key-0005-eeee', leaseId: 'synthetic-lease-002', units: 1 }));
    assert.deepEqual([exhausted.status, exhausted.json.error.code, exhausted.json.recovery.allowed], [409, 'CAPACITY_EXHAUSTED', ['correct-and-resubmit']]);
    const cancelledKey = (await build('cancelled'));
    try {
      const again = await call(cancelledKey.service.port, 'POST', '/v1/steps', text());
      assert.deepEqual([again.status, again.json.outcome, again.json.recovery.allowed], [409, 'cancelled', ['correct-and-resubmit', 'inspect']]);
      cancelledKey.held.release('key-0006-ffff');
      assert.equal((await call(cancelledKey.service.port, 'POST', '/v1/steps', text({ idempotencyKey: 'key-0006-ffff' }))).status, 201, 'a cancelled step needs a new key');
    } finally {
      await cancelledKey.close();
    }
  } finally {
    await service.stop();
    cleanup(service.dir);
  }
});

test('an unknown outcome offers retry and inspect, and both resolve it from the journal', async () => {
  const inner = journal.createMemoryIo();
  let writes = 0;
  const io = { ...inner, append(line) { writes += 1; inner.append(line); if (writes === 2) throw new Error('lost acknowledgment'); } };
  const service = await startService({ io });
  try {
    const unknown = await call(service.port, 'POST', '/v1/steps', text());
    honest(unknown);
    assert.deepEqual([unknown.status, unknown.json.outcome, unknown.json.recovery.allowed], [503, 'unknown', ['retry', 'inspect']]);
    const inspected = await call(service.port, 'GET', `/v1/steps/${KEY}`);
    assert.deepEqual([inspected.status, inspected.json.outcome, inspected.json.effect.applied], [200, 'succeeded', true]);
    const retry = await call(service.port, 'POST', '/v1/steps', text());
    assert.deepEqual([retry.status, retry.json.replayed, retry.json.effect.appliedByThisRequest], [200, true, false]);
  } finally {
    await service.stop();
  }
});

test('the undo family of actions is unsupported in every state and never executes', async () => {
  const states = ['committed', 'in-flight', 'cancelled', 'interrupted'];
  for (const state of states) {
    const fixture = await build(state);
    try {
      for (const action of ['undo', 'rollback', 'release', 'refund', 'delete', 'force']) {
        const refused = await call(fixture.service.port, 'POST', `/v1/steps/${KEY}/${action}`);
        honest(refused);
        assert.deepEqual([refused.status, refused.json.outcome, refused.json.error.code, refused.json.step.state], [422, 'unsupported', 'UNSUPPORTED_ACTION', state]);
        assert.equal(refused.json.didNot.some((item) => item.code === 'ACTION_NOT_PERFORMED'), true);
        assert.deepEqual(refused.json.recovery.allowed, contract.allowedActions(state));
      }
      const after = await call(fixture.service.port, 'GET', `/v1/steps/${KEY}`);
      assert.deepEqual([after.json.step.state, after.json.trail], [state, fixture.offered.trail]);
      fixture.held.release(KEY);
    } finally {
      await fixture.close();
    }
  }
});
