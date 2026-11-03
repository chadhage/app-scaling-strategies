'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, LIMITS, createSession, step } = require('./model.js');

const invalidConfigurations = [
  ['null', null],
  ['array', []],
  ['string', 'finish'],
  ['extra field', { ...DEFAULTS, endpoint: 'synthetic-only' }],
  ['inherited object', Object.assign(Object.create({ mode: 'finish' }), DEFAULTS)],
  ['unsupported mode', { ...DEFAULTS, mode: 'stop' }],
  ['unsupported condition', { ...DEFAULTS, condition: 'assume-success' }],
  ...['mode', 'leaseTicks', 'graceTicks', 'workBudget', 'condition'].map((key) => {
    const config = { ...DEFAULTS };
    delete config[key];
    return [`missing ${key}`, config];
  }),
  ...['leaseTicks', 'graceTicks', 'workBudget'].flatMap((key) =>
    ['5', true, null, undefined, NaN, Infinity, -Infinity, 1.5, 0, -1].map((value) =>
      [`${key} rejects ${String(value)}`, { ...DEFAULTS, [key]: value }])),
  ['lease maximum', { ...DEFAULTS, leaseTicks: 7 }],
  ['grace maximum', { ...DEFAULTS, graceTicks: 9 }],
  ['work budget maximum', { ...DEFAULTS, workBudget: 13 }]
];

test('strict exact configuration records reject malformed inputs without mutating baseline', async (t) => {
  for (const [label, config] of invalidConfigurations) {
    await t.test(label, () => {
      const state = createSession();
      assert.throws(() => step(state, 'start', config), /configuration|mode|condition|leaseTicks|graceTicks|workBudget/i);
      assert.equal(state.phase, 'IDLE');
      assert.equal(state.metrics.attempted, 0);
    });
  }
});

test('forged, cloned, missing and primitive states cannot carry authority', () => {
  const state = createSession();
  for (const forged of [undefined, null, 2, {}, structuredClone(state), { ...state }]) {
    assert.throws(() => step(forged, 'verify'), /issued state/i);
  }
});

test('unknown commands and unexpected payloads are rejected before state changes', () => {
  const state = createSession();
  for (const command of ['', null, 1, 'delete', '__proto__']) {
    assert.throws(() => step(state, command), /action/i);
  }
  for (const payload of [null, {}, false, { confirmed: true }]) {
    assert.throws(() => step(state, 'verify', payload), /payload/i);
  }
  for (const payload of [undefined, null, {}, { confirmed: 'true' }, { confirmed: 1 }, { confirmed: true, extra: true }]) {
    assert.throws(() => step(state, 'force-stop', payload), /consent/i);
  }
});

test('state ordering blocks start twice and all pre-start operational actions', () => {
  for (const command of ['begin-scale-in', 'tick', 'renew', 'checkpoint', 'release', 'claim', 'retire']) {
    const state = step(createSession(), command);
    assert.equal(state.lastAction?.verdict, 'BLOCKED', command);
    assert.equal(state.metrics.attempted, 0);
  }
  const started = step(createSession(), 'start', { ...DEFAULTS });
  const repeated = step(started, 'start', { ...DEFAULTS, mode: 'release' });
  assert.equal(repeated.lastAction?.verdict, 'BLOCKED');
  assert.equal(repeated.config.mode, 'finish');
  assert.equal(repeated.job.epoch, 1);
});

test('mode-specific actions never grant the wrong mechanism or another live owner', () => {
  let state = step(step(createSession(), 'start', { ...DEFAULTS }), 'begin-scale-in');
  for (const command of ['renew', 'checkpoint', 'release', 'claim']) {
    state = step(state, command);
    assert.equal(state.lastAction?.verdict, 'BLOCKED', command);
    assert.equal(state.job.owner, 'consumer-A');
    assert.equal(state.job.epoch, 1);
  }
});

test('a blocked action cannot present a retained PASS as the current verification', () => {
  let state = step(step(createSession(), 'start', { ...DEFAULTS }), 'begin-scale-in');
  for (let n = 0; n < 4; n++) state = step(state, 'tick');
  state = step(state, 'retire');
  assert.equal(state.result.verifier, 'PASS');
  state = step(state, 'release');
  assert.equal(state.lastAction?.verdict, 'BLOCKED');
  assert.equal(state.result.verifier, 'UNKNOWN');
  assert.equal(state.metrics.succeeded, 1);
  state = step(state, 'verify');
  assert.equal(state.result.verifier, 'PASS');
});

test('action history is finite and only an archive-preserving reset remains possible at its limit', () => {
  let state = createSession();
  for (let n = 0; n < LIMITS.events; n++) state = step(state, 'verify');
  assert.equal(state.events.length, 40);
  assert.throws(() => step(state, 'verify'), /history limit/i);
  state = step(state, 'reset');
  assert.equal(state.attempt, 2);
  assert.equal(state.history[0].events.length, 40);
  assert.equal(state.events.length, 0);
});
