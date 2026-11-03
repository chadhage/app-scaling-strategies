'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createRehearsal, nextRing, attemptPromotion } = require('./ring-model.js');

const allV2 = { frontend: 'v2', api: 'v2', worker: 'v2' };
const request = (override = {}) => ({
  ring: 'pilot', tiers: { ...allV2 }, contract: 'dual',
  window: 'open', observation: 'healthy', ...override
});
const pilot = (state) => state.rings.find((ring) => ring.id === 'pilot');
const assertion = (result, id) => result.assertions.find((item) => item.id === id);

test('A-S008 completed deployment leaves unobserved ring rollout pending', () => {
  const state = createRehearsal();
  assert.equal(state.deployment?.lifecycle, 'completed');
  assert.equal(nextRing(state), 'pilot');
  for (const ring of state.rings.slice(1)) {
    assert.equal(ring.status, 'pending');
    assert.deepEqual(ring.tiers, { frontend: 'v1', api: 'v1', worker: 'v1' });
  }
});

test('A-S008 ring promotion changes rollout status, never deployment lifecycle', () => {
  const state = createRehearsal();
  const result = attemptPromotion(state, request());
  assert.equal(result.verdict, 'PASS');
  assert.equal(pilot(result.state).status, 'promoted');
  assert.equal(result.state.deployment?.lifecycle, 'completed');
  assert.deepEqual(result.state.deployment, state.deployment);
  assert.equal(assertion(result, 'deployment-readiness')?.status, 'pass');
  assert.match(result.trace.join(' '), /deployment lifecycle.*completed/i);
  assert.equal(pilot(state).status, 'pending', 'input state remains immutable');
});

test('A-S008 completed deployment cannot override tier or shared-contract rejection', () => {
  for (const input of [
    request({ tiers: { ...allV2, api: 'v1' } }),
    request({ contract: 'v2-only' })
  ]) {
    const result = attemptPromotion(createRehearsal(), input);
    assert.equal(result.verdict, 'BLOCKED');
    assert.equal(result.state.deployment?.lifecycle, 'completed');
    assert.equal(pilot(result.state).status, 'pending');
    assert.equal(result.actual.length, 0);
    assert.equal(result.phase, 'preflight');
  }
});

test('A-S008 unfinished or failed deployment blocks otherwise compatible expansion', () => {
  for (const lifecycle of ['pending', 'running', 'failed']) {
    const state = createRehearsal();
    state.deployment = { lifecycle };
    const before = structuredClone(state);
    const result = attemptPromotion(state, request());
    assert.equal(result.verdict, 'BLOCKED', `${lifecycle} deployment is not ready`);
    assert.equal(assertion(result, 'deployment-readiness')?.status, 'fail');
    assert.equal(result.phase, 'preflight');
    assert.equal(result.actual.length, 0);
    assert.equal(pilot(result.state).status, 'pending');
    assert.deepEqual(result.state.deployment, before.deployment);
    assert.deepEqual(state, before);
  }
});

test('A-S008 absent or unrecognized deployment lifecycle remains unknown', () => {
  for (const deployment of [undefined, null, {}, { lifecycle: 'assumed-ready' }]) {
    const state = createRehearsal();
    state.deployment = deployment;
    const result = attemptPromotion(state, request());
    assert.equal(result.verdict, 'UNKNOWN');
    assert.equal(assertion(result, 'deployment-readiness')?.status, 'unknown');
    assert.equal(result.actual.length, 0);
    assert.equal(nextRing(result.state), 'pilot');
  }
});

test('A-S008 malformed choices fail closed without throwing or fabricating outcomes', () => {
  for (const input of [null, false, 42, 'pilot', [], Object.assign([], request())]) {
    const state = createRehearsal();
    let result;
    assert.doesNotThrow(() => { result = attemptPromotion(state, input); });
    assert.equal(result.verdict, 'BLOCKED');
    assert.equal(assertion(result, 'request-input')?.status, 'fail');
    assert.equal(result.phase, 'preflight');
    assert.equal(result.actual.length, 0);
    assert.deepEqual(result.userImpact, { completed: 0, interrupted: 0, unknown: 0 });
    assert.equal(nextRing(result.state), 'pilot');
    assert.equal(state.attempts, 0);
  }
});

test('A-S008 wrong field types and incomplete choices fail the input gate', () => {
  for (const input of [
    {}, request({ tiers: null }), request({ tiers: Object.assign([], allV2) }),
    request({ ring: {} }), request({ contract: 2 }),
    request({ window: null }), request({ observation: false })
  ]) {
    const result = attemptPromotion(createRehearsal(), input);
    assert.equal(result.verdict, 'BLOCKED');
    assert.equal(assertion(result, 'request-input')?.status, 'fail');
    assert.equal(result.actual.length, 0);
  }
});

test('A-S008 a fresh reset fixture does not retain prior attempts or lifecycle mutations', () => {
  const failed = attemptPromotion(createRehearsal(), request({ observation: 'interrupted' }));
  failed.state.deployment = { lifecycle: 'failed' };
  const reset = createRehearsal();
  assert.equal(reset.deployment?.lifecycle, 'completed');
  assert.equal(pilot(reset).status, 'pending');
  assert.equal(reset.attempts, 0);
  assert.deepEqual(reset.cumulativeImpact, { completed: 0, interrupted: 0, unknown: 0 });
  assert.equal(nextRing(reset), 'pilot');
});

test('A-S008 browser contract names deployment lifecycle and ring rollout separately', () => {
  const html = readFileSync(join(__dirname, 'index.html'), 'utf8');
  assert.match(html, /id="deployment-lifecycle"/);
  assert.match(html, /<th[^>]*>Ring rollout status<\/th>/);
  assert.match(html, /completed deployment does not promote rings/i);
});
