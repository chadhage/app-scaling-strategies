'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createJourney } = require(path.join(__dirname, '..', 'journey.js'));
const { getProfileV1, getProfileV2 } = require(path.join(__dirname, '..', '..', 'C020', 'profiles.cjs'));
const config = Object.freeze({
  profileId: 'synthetic-001', draft: 'synthetic-draft-A',
  boundary: 'before-first-read', budgetMs: 1000
});
const turn = () => new Promise((resolve) => setImmediate(resolve));

async function directProviderRead(request) {
  const value = (request.implementation === 'v1' ? getProfileV1 : getProfileV2)({ profileId: request.profileId });
  return {
    requestToken: request.requestToken, implementation: request.implementation, status: 200, value,
    headerVersion: value.stamp.implementationVersion, headerDeployment: value.stamp.deploymentStamp
  };
}
function subject(t, options = {}) {
  const journey = createJourney({ clock: () => 10, read: directProviderRead, ...options });
  t.after(() => journey.stop());
  return journey;
}

test('start really holds the driver before its first action', { timeout: 2000 }, (t) => {
  const reads = [];
  const journey = subject(t, { read: (request) => { reads.push(request); return directProviderRead(request); } });
  journey.start(config);
  assert.equal(journey.snapshot().phase, 'paused');
  assert.equal(reads.length, 0);
  assert.equal(journey.snapshot().original.draft, config.draft);
  assert.equal(journey.snapshot().requests, 0);
});

test('Resume continues the SAME original attempt through both accepted provider functions', { timeout: 2000 }, async (t) => {
  const reads = [];
  const journey = subject(t, { read: (request) => { reads.push(request.implementation); return directProviderRead(request); } });
  const id = journey.start(config);
  assert.equal(journey.resume(), true);
  assert.equal(journey.resume(), false);
  await journey.done();
  const observed = journey.snapshot();
  assert.deepEqual(reads, ['v1', 'v2']);
  assert.equal(observed.attemptId, id);
  assert.equal(observed.acknowledgements.length, 2);
  assert.equal(observed.phase, 'complete');
  assert.deepEqual(observed.acknowledgements[0].profile, observed.acknowledgements[1].profile);
  assert.deepEqual(observed.acknowledgements.map((value) => value.stamp.implementationVersion), ['1.0.0', '2.0.0']);
  assert.equal(observed.fullJourneyQualified, false);
});

test('controlled oracle clock: pause spends original budget and Resume cannot restart it', { timeout: 2000 }, async (t) => {
  let now = 50;
  const journey = subject(t, { clock: () => now });
  journey.start(config);
  const started = journey.snapshot().startedAt;
  now = 1450;
  assert.equal(journey.snapshot().elapsedMs, 1400);
  assert.equal(journey.snapshot().pausedMs, 1400);
  assert.equal(journey.snapshot().budgetExceeded, true);
  journey.resume();
  await journey.done();
  assert.equal(journey.snapshot().startedAt, started);
  assert.equal(journey.snapshot().deadline, started + config.budgetMs);
  assert.equal(journey.snapshot().budgetExceeded, true);
});

test('Stop and Reset retain interrupted unknown history without releasing a read', { timeout: 2000 }, async (t) => {
  const reads = [];
  const journey = subject(t, { read: (request) => { reads.push(request); return directProviderRead(request); } });
  journey.start(config);
  assert.equal(journey.stop(), true);
  assert.equal(journey.stop(), false);
  journey.reset();
  await journey.done();
  const state = journey.snapshot();
  assert.equal(state.phase, 'idle');
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].outcome, 'unknown');
  assert.equal(state.history[0].code, 'INTERRUPTED_BY_STOP');
  assert.equal(reads.length, 0);
});

test('between-reads is after acknowledged v1, not an in-flight or painted pause', { timeout: 2000 }, async (t) => {
  const reads = [];
  const journey = subject(t, { read: (request) => { reads.push(request.implementation); return directProviderRead(request); } });
  journey.start({ ...config, boundary: 'between-reads', draft: 'synthetic-draft-B' });
  await turn();
  const held = journey.snapshot();
  assert.equal(held.phase, 'paused');
  assert.deepEqual(reads, ['v1']);
  assert.equal(held.acknowledgements.length, 1);
  assert.equal(held.acknowledgements[0].profile.id, config.profileId);
  await turn();
  assert.deepEqual(reads, ['v1']);
  journey.resume();
  await journey.done();
  assert.equal(journey.snapshot().attemptId, held.attemptId);
  assert.deepEqual(journey.snapshot().original, held.original);
  assert.deepEqual(reads, ['v1', 'v2']);
});

test('original configuration and draft are immutable; reentry cannot replace the active attempt', { timeout: 2000 }, (t) => {
  const journey = subject(t);
  const input = { ...config };
  const id = journey.start(input);
  input.draft = 'synthetic-draft-B';
  assert.equal(journey.snapshot().original.draft, config.draft);
  assert.ok(Object.isFrozen(journey.snapshot().original));
  assert.throws(() => { journey.snapshot().original.draft = input.draft; }, TypeError);
  assert.throws(() => journey.start(config), /ORIGINAL_ATTEMPT_ALREADY_ACTIVE/);
  assert.equal(journey.snapshot().attemptId, id);
});

test('oracle classification: failed HTTP reply is terminal and does not advance', { timeout: 2000 }, async (t) => {
  const journey = subject(t, { read: async (request) => ({
    requestToken: request.requestToken, implementation: request.implementation,
    status: 404, value: { error: { code: 'UNKNOWN_PROFILE' } }
  }) });
  journey.start(config);
  journey.resume();
  await journey.done();
  const state = journey.snapshot();
  assert.equal(state.phase, 'failed');
  assert.equal(state.requests, 1);
  assert.equal(state.responses, 1);
  assert.equal(state.acknowledgements.length, 0);
  assert.equal(state.history[0].replyCode, 'UNKNOWN_PROFILE');
});

test('oracle classification: malformed/stamp/profile replies stay unknown, never successful v2', { timeout: 2000 }, async (t) => {
  for (const mutate of [
    (reply) => { reply.value.apiContract = 'getProfile/2'; },
    (reply) => { reply.value.stamp.implementationVersion = '999'; },
    (reply) => { reply.headerDeployment = 'not-the-server-label'; },
    (reply) => { reply.value.profile.id = 'synthetic-002'; },
    (reply) => { delete reply.value.profile.preferences; }
  ]) {
    const journey = subject(t, { read: async (request) => {
      const reply = structuredClone(await directProviderRead(request));
      mutate(reply);
      return reply;
    } });
    journey.start(config);
    journey.resume();
    await journey.done();
    assert.equal(journey.snapshot().phase, 'unknown');
    assert.equal(journey.snapshot().requests, 1);
    assert.equal(journey.snapshot().fullJourneyQualified, false);
  }
});

test('oracle classification: out-of-order reply and earlier failures survive Reset and later success', { timeout: 2000 }, async (t) => {
  let bad = true;
  const journey = subject(t, { read: async (request) => {
    const reply = await directProviderRead(request);
    if (bad) reply.requestToken = 'synthetic-another-attempt/read-2/v2';
    return reply;
  } });
  const first = journey.start(config);
  journey.resume();
  await journey.done();
  assert.equal(journey.snapshot().phase, 'unknown');
  assert.equal(journey.snapshot().code, 'OUT_OF_ORDER_REPLY');
  journey.reset();
  bad = false;
  const second = journey.start(config);
  journey.resume();
  await journey.done();
  assert.notEqual(second, first);
  assert.equal(journey.snapshot().history.length, 2);
  assert.equal(journey.snapshot().history[0].code, 'OUT_OF_ORDER_REPLY');
  assert.ok(journey.snapshot().events.some((event) => event.code === 'OUT_OF_ORDER_REPLY'));
});

test('oracle classification: an interrupted late read cannot acknowledge the replacement attempt', { timeout: 2000 }, async (t) => {
  let release;
  const journey = subject(t, { read: (request) => new Promise((resolve) => { release = async () => resolve(await directProviderRead(request)); }) });
  const original = journey.start(config);
  journey.resume();
  await turn();
  const oldDone = journey.done();
  assert.equal(journey.snapshot().requests, 1);
  journey.stop();
  journey.reset();
  const replacement = journey.start(config);
  await release();
  await oldDone;
  const state = journey.snapshot();
  assert.notEqual(replacement, original);
  assert.equal(state.phase, 'paused');
  assert.equal(state.requests, 0);
  assert.equal(state.acknowledgements.length, 0);
  assert.equal(state.history[0].outcome, 'unknown');
  assert.ok(state.events.some((event) => event.attemptId === original && event.code === 'LATE_OR_OUT_OF_ORDER_REPLY'));
});

test('Reset while held records unknown and does not release the next action', { timeout: 2000 }, async (t) => {
  const reads = [];
  const journey = subject(t, { read: (request) => { reads.push(request.implementation); return directProviderRead(request); } });
  journey.start({ ...config, boundary: 'between-reads' });
  await turn();
  journey.reset();
  await journey.done();
  assert.deepEqual(reads, ['v1']);
  assert.equal(journey.snapshot().history[0].code, 'INTERRUPTED_BY_RESET');
});

test('regressed or invalid monotonic clocks make the attempt unknown rather than fabricating duration', { timeout: 2000 }, (t) => {
  let now = 20;
  const journey = subject(t, { clock: () => now });
  journey.start(config);
  now = 19;
  const state = journey.snapshot();
  assert.equal(state.phase, 'unknown');
  assert.equal(state.code, 'MONOTONIC_CLOCK_INVALID');
  assert.equal(state.clockValid, false);
  assert.equal(state.history[0].outcome, 'unknown');
});

test('closed config rejects defaults, real data, arbitrary boundaries and caller attempt identities', (t) => {
  const journey = subject(t);
  for (const value of [
    undefined, {}, { ...config, profileId: 'real-user' }, { ...config, draft: 'arbitrary real text' },
    { ...config, boundary: 'freeze-network' }, { ...config, budgetMs: 9999999 },
    { ...config, attemptId: 'caller-replaces-original' }
  ]) assert.throws(() => journey.start(value), /EXPLICIT_CLOSED_SYNTHETIC_CONFIG_REQUIRED/);
});

test('attempt history is bounded by refusal, not by silently dropping earlier errors', { timeout: 2000 }, (t) => {
  const journey = subject(t);
  for (let i = 0; i < 16; i++) { journey.start(config); journey.stop(); journey.reset(); }
  assert.equal(journey.snapshot().history.length, 16);
  assert.throws(() => journey.start(config), /OWN_ATTEMPT_LIMIT_REACHED_HISTORY_RETAINED/);
  assert.equal(journey.snapshot().history[0].code, 'INTERRUPTED_BY_STOP');
});
