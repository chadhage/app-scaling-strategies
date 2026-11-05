'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers.cjs');
const { selectJourneys } = require('../lib/client.cjs');

test('anonymous readiness works for platform warm-up; control and journeys require distinct credentials', async t => {
  const f = await fixture(t);
  const health = await fetch(new URL('/health/ready', f.context.greenUrl));
  assert.equal(health.status, 200);
  assert.equal((await f.request('/identity', undefined, { token: 'wrong' })).status, 401);
  assert.equal((await f.request('/control/route', undefined)).status, 401);
  assert.equal((await f.request('/journey/start', { id: 'one', marker: 'm' }, { token: f.credentials.controlToken })).status, 401);
  assert.equal((await f.request('/journey/start', { id: 'one', marker: 'm' })).status, 503);
});

test('a session crosses actual blue/green servers and retried completion creates exactly one effect', async t => {
  const f = await fixture(t);
  const revision = await f.route(0);
  const body = { id: 'user-1', marker: 'original-form-state' };
  const started = await f.request('/journey/start', body);
  assert.equal(started.body.deployment.version, 'blue');
  await f.route(100, revision);
  const stepped = await f.request('/journey/step', { ...body, expectedCounter: 0 });
  assert.equal(stepped.body.deployment.version, 'green');
  assert.equal(stepped.body.state.marker, body.marker);
  const completions = await Promise.all([1, 2].map(() => f.request('/journey/complete', { ...body, operationId: 'operation-1' })));
  assert.ok(completions.every(result => result.status === 200 && result.body.state.effects === 1));
  assert.equal((await f.store.get('sessions/user-1.json')).value.effects, 1);
  assert.equal((await f.request('/journey/complete', { ...body, operationId: 'operation-2' })).status, 409);
});

test('A/B routes remain stable and actual stratified observations are half blue and half green', async t => {
  const f = await fixture(t);
  await f.route(50);
  const observed = [];
  for (const journey of selectJourneys(f.context.epoch, 10, 0, 50, 'ab')) {
    const body = { id: journey.id, marker: journey.marker };
    const start = await f.request('/journey/start', body);
    const step = await f.request('/journey/step', { ...body, expectedCounter: 0 });
    assert.equal(start.body.deployment.version, step.body.deployment.version);
    observed.push(start.body.deployment.version);
  }
  assert.equal(observed.filter(version => version === 'green').length, 5);
});

test('stale epochs, stale revisions, and racing route writes cannot change current routing', async t => {
  const f = await fixture(t);
  await f.route(0);
  assert.equal((await f.request('/control/route', { epoch: 'old', greenPercent: 100, expectedRevision: 0 }, { control: true })).status, 409);
  const requests = await Promise.all([25, 50].map(greenPercent => f.request('/control/route', {
    epoch: f.context.epoch, greenPercent, expectedRevision: 0
  }, { control: true })));
  assert.deepEqual(requests.map(result => result.status).sort(), [200, 409]);
  assert.equal((await f.request('/control/route', undefined, { control: true })).body.revision, 1);
});

test('readiness failure is non-200, preserves routing, and never creates empty-success user state', async t => {
  const f = await fixture(t);
  await f.route(0);
  const fault = await f.request('/control/fault', { epoch: f.context.epoch, unready: true, delayMs: 0 }, { control: true });
  assert.equal(fault.status, 200);
  assert.equal((await f.request('/health/ready', undefined, { base: f.context.greenUrl })).status, 503);
  assert.equal((await f.request('/journey/start', { id: 'still-blue', marker: 'm' })).body.deployment.version, 'blue');
  assert.equal((await f.request('/journey/step', { id: 'missing', marker: 'm', expectedCounter: 0 })).status, 409);
  f.store.available = false;
  assert.equal((await f.request('/health/ready', undefined, { base: f.context.blueUrl })).status, 503);
  assert.equal((await f.request('/journey/start', { id: 'storage-down', marker: 'm' })).status, 503);
  assert.ok(f.errors.length > 0);
});

test('invalid request bodies and unbounded workload parameters are explicit errors', async t => {
  const f = await fixture(t);
  await f.route(0);
  assert.equal((await f.request('/journey/start', [])).status, 400);
  assert.equal((await f.request('/journey/start', { id: '../escape', marker: 'm' })).status, 400);
  assert.equal((await f.request('/journey/start', { id: 'bounded', marker: 'm', workDelayMs: 3000 })).status, 400);
  assert.equal((await f.request('/control/fault', { epoch: f.context.epoch, unready: false, delayMs: 5001 }, { control: true })).status, 400);
  assert.equal((await f.request('/control/route', { epoch: f.context.epoch, greenPercent: '100', expectedRevision: 0 }, { control: true })).status, 400);
});
