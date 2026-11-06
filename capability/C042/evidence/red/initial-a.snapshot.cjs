'use strict';

// Retained initial behavioral tests, part A (RED archive): real sockets against the specified HTTP behavior.
const assert = require('node:assert/strict');
const test = require('node:test');
const { call, cleanup, gate, inFlight, journalLines, startService, valid } = require('./initial-support.snapshot.cjs');

const KEY = valid().idempotencyKey;
const types = (dir) => journalLines(dir).map((line) => line.type);
const has = (result, code) => result.didNot.some((item) => item.code === code);

test('a valid step is conducted once and the result says what happened and what did not', async () => {
  const service = await startService();
  try {
    const response = await call(service.port, 'POST', '/v1/steps', valid());
    assert.equal(response.status, 201, response.text);
    const result = response.json;
    assert.deepEqual([result.schemaVersion, result.kind], [1, 'C042-step-result']);
    assert.deepEqual([result.action, result.accepted, result.replayed, result.outcome, result.classification, result.terminal],
      ['submit', true, false, 'succeeded', 'COMPLETED', true]);
    assert.deepEqual(result.validatedInput, valid());
    assert.match(result.inputSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(result.effect, { applied: true, appliedByThisRequest: true, leaseId: 'synthetic-lease-001', units: 5, reservedAfter: 5, capacity: 100 });
    assert.deepEqual([result.step, result.error], [{ state: 'committed' }, null]);
    for (const code of ['NO_SECOND_EFFECT', 'NO_UNDO', 'NO_CLOUD_CALL']) assert.ok(has(result, code), code);
    assert.deepEqual(result.recovery.allowed, ['retry', 'inspect']);
    assert.deepEqual(result.trail.map((item) => item.type), ['begin', 'commit']);
    assert.deepEqual(types(service.dir), ['begin', 'commit']);
  } finally {
    await service.stop();
    cleanup(service.dir);
  }
});

test('an identical retry returns the recorded result and the lease shows one effect', async () => {
  const service = await startService();
  try {
    const first = await call(service.port, 'POST', '/v1/steps', valid());
    const retry = await call(service.port, 'POST', '/v1/steps', valid());
    assert.equal(first.status, 201);
    assert.equal(retry.status, 200, retry.text);
    assert.deepEqual([retry.json.replayed, retry.json.effect.appliedByThisRequest, retry.json.effect.applied], [true, false, true]);
    for (const field of ['outcome', 'inputSha256', 'trail']) assert.deepEqual(retry.json[field], first.json[field]);
    assert.ok(has(retry.json, 'NO_EFFECT_BY_THIS_REQUEST'));
    const leases = await call(service.port, 'GET', '/v1/leases');
    assert.equal(leases.status, 200);
    assert.equal(leases.json.leases['synthetic-lease-001'].committed, 5);
    assert.deepEqual(types(service.dir), ['begin', 'commit']);
  } finally {
    await service.stop();
    cleanup(service.dir);
  }
});

test('parallel duplicate submissions race to exactly one effect', async () => {
  const held = gate();
  const service = await startService({ executor: held.executor });
  try {
    const pending = Array.from({ length: 8 }, () => call(service.port, 'POST', '/v1/steps', valid()));
    await inFlight(held, KEY, pending);
    held.release(KEY);
    const answers = await Promise.all(pending);
    assert.deepEqual(answers.map((answer) => answer.json?.outcome), Array(8).fill('succeeded'));
    assert.equal(answers.filter((answer) => answer.status === 201).length, 1);
    assert.equal(answers.filter((answer) => answer.status === 200).length, 7);
    assert.equal(answers.filter((answer) => answer.json.effect.appliedByThisRequest).length, 1);
    assert.deepEqual(types(service.dir), ['begin', 'commit']);
  } finally {
    await service.stop();
    cleanup(service.dir);
  }
});

test('reusing a key with different inputs is a typed conflict and changes nothing', async () => {
  const service = await startService();
  try {
    await call(service.port, 'POST', '/v1/steps', valid());
    const conflict = await call(service.port, 'POST', '/v1/steps', valid({ units: 6 }));
    assert.equal(conflict.status, 409, conflict.text);
    assert.deepEqual([conflict.json.accepted, conflict.json.outcome, conflict.json.error.code, conflict.json.effect.appliedByThisRequest],
      [false, 'rejected', 'IDEMPOTENCY_KEY_CONFLICT', false]);
    assert.ok(conflict.json.recovery.allowed.includes('correct-and-resubmit'));
    const leases = await call(service.port, 'GET', '/v1/leases');
    assert.equal(leases.json.leases['synthetic-lease-001'].committed, 5);
    assert.deepEqual(types(service.dir), ['begin', 'commit']);
  } finally {
    await service.stop();
    cleanup(service.dir);
  }
});

const base = JSON.stringify(valid());
const withUnits = (text) => base.replace('"units":5', text);
const without = (name) => { const input = valid(); delete input[name]; return JSON.stringify(input); };
const patched = (patch) => JSON.stringify(valid(patch));
const rejections = [
  ['a missing field', without('units'), 400, 'REQUIRED_FIELD'],
  ['an extra field', patched({ extra: 1 }), 400, 'UNKNOWN_FIELD'],
  ['units as a string', patched({ units: '5' }), 400, 'WRONG_TYPE'],
  ['units as a fraction', withUnits('"units":5.5'), 400, 'UNSAFE_NUMBER'],
  ['units as 1e1', withUnits('"units":1e1'), 400, 'UNSAFE_NUMBER'],
  ['units as negative zero', withUnits('"units":-0'), 400, 'UNSAFE_NUMBER'],
  ['units 0', patched({ units: 0 }), 400, 'FIELD_OUT_OF_RANGE'],
  ['units 11', patched({ units: 11 }), 400, 'FIELD_OUT_OF_RANGE'],
  ['an unknown lease', patched({ leaseId: 'synthetic-lease-999' }), 400, 'FIELD_OUT_OF_RANGE'],
  ['a short key', patched({ idempotencyKey: 'abc' }), 400, 'INVALID_FORMAT'],
  ['a duplicated key', withUnits('"units":5,"units":6'), 400, 'DUPLICATE_FIELD'],
  ['a duplicated key written with an escape', withUnits('"units":5,"un\\u0069ts":6'), 400, 'DUPLICATE_FIELD'],
  ['__proto__', withUnits('"units":5,"__proto__":{"units":1}'), 400, 'FORBIDDEN_FIELD'],
  ['__proto__ written with an escape', withUnits('"units":5,"\\u005f_proto__":1'), 400, 'FORBIDDEN_FIELD'],
  ['constructor', withUnits('"units":5,"constructor":{"prototype":{}}'), 400, 'FORBIDDEN_FIELD'],
  ['an oversized body', patched({ idempotencyKey: `key-${'x'.repeat(4000)}` }), 413, 'BODY_TOO_LARGE'],
  ['text that is not JSON', '{"schemaVersion":', 400, 'INVALID_JSON'],
  ['an empty body', '', 400, 'REQUIRED_JSON'],
  ['an array', '[]', 400, 'INVALID_SHAPE'],
  ['null', 'null', 400, 'INVALID_SHAPE'],
  ['a byte order mark', `\uFEFF${base}`, 400, 'INVALID_JSON'],
  ['invalid UTF-8', Buffer.from([0x7b, 0xff, 0x7d]), 400, 'INVALID_ENCODING'],
];

test('invalid input is a typed rejection with no effect and no journal entry', async () => {
  const service = await startService();
  try {
    for (const [name, body, status, code] of rejections) {
      const response = await call(service.port, 'POST', '/v1/steps', body);
      assert.equal(response.status, status, `${name}: ${response.text}`);
      assert.deepEqual([response.json.accepted, response.json.outcome, response.json.error.code], [false, 'rejected', code], name);
      assert.deepEqual(response.json.recovery.allowed, ['correct-and-resubmit'], name);
      assert.ok(has(response.json, 'NO_EFFECT') && has(response.json, 'NO_JOURNAL_ENTRY'), name);
    }
    const media = await call(service.port, 'POST', '/v1/steps', base, { 'Content-Type': 'text/plain' });
    assert.deepEqual([media.status, media.json.error.code], [415, 'UNSUPPORTED_MEDIA_TYPE']);
    assert.deepEqual(journalLines(service.dir), []);
    const leases = await call(service.port, 'GET', '/v1/leases');
    assert.equal(leases.json.leases['synthetic-lease-001'].committed, 0);
    const accepted = await call(service.port, 'POST', '/v1/steps', valid());
    assert.equal(accepted.status, 201, 'the key was never consumed by the rejected attempts');
  } finally {
    await service.stop();
    cleanup(service.dir);
  }
});

test('an unsupported step, version or action is a typed refusal and nothing is invented', async () => {
  const service = await startService();
  try {
    const step = await call(service.port, 'POST', '/v1/steps', valid({ step: 'release-capacity' }));
    assert.equal(step.status, 422, step.text);
    assert.deepEqual([step.json.outcome, step.json.classification, step.json.error.code], ['unsupported', 'UNSUPPORTED', 'UNSUPPORTED_STEP']);
    const version = await call(service.port, 'POST', '/v1/steps', valid({ schemaVersion: 2 }));
    assert.deepEqual([version.status, version.json.error.code], [422, 'UNSUPPORTED_SCHEMA_VERSION']);
    assert.deepEqual(journalLines(service.dir), []);
    await call(service.port, 'POST', '/v1/steps', valid());
    for (const action of ['undo', 'rollback']) {
      const refused = await call(service.port, 'POST', `/v1/steps/${KEY}/${action}`);
      assert.equal(refused.status, 422, refused.text);
      assert.deepEqual([refused.json.accepted, refused.json.outcome, refused.json.error.code], [false, 'unsupported', 'UNSUPPORTED_ACTION']);
      assert.ok(has(refused.json, 'NO_UNDO'));
    }
    assert.deepEqual(types(service.dir), ['begin', 'commit']);
    const leases = await call(service.port, 'GET', '/v1/leases');
    assert.equal(leases.json.leases['synthetic-lease-001'].committed, 5);
  } finally {
    await service.stop();
    cleanup(service.dir);
  }
});
