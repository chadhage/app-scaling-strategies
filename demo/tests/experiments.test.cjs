'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, temporaryDirectory } = require('./helpers.cjs');
const { Evidence } = require('../lib/client.cjs');
const { runExperiment } = require('../experiments.cjs');

for (const experiment of ['blue-green', 'canary', 'ab', 'readiness-abort', 'rollback', 'native-swap']) {
  test(`controller executes ${experiment} against real loopback HTTP servers (not native proof)`, async t => {
    const f = await fixture(t);
    const context = { ...f.context, experiment };
    const directory = temporaryDirectory(t);
    const evidence = new Evidence(directory, context);
    const platform = {
      async swap() {
        f.releases.blue.version = 'green';
        f.releases.green.version = 'blue';
      }
    };
    await runExperiment(context, f.credentials, evidence, platform);
    const result = JSON.parse(fs.readFileSync(path.join(directory, 'result.json'), 'utf8'));
    assert.equal(result.controlPassed, true);
    assert.equal(result.transitionJourneys.fiveNinesEstablished, false);
    assert.equal(result.evidenceLevel, 'native-demo-not-qualified');
    if (experiment === 'readiness-abort') {
      assert.equal(result.outcome, 'safe-abort-before-exposure');
      assert.equal(result.transitionJourneys.attempted, 0);
      assert.equal(result.transitionJourneys.successRatio, null);
      assert.equal((await f.request('/control/route', undefined, { control: true })).body.greenPercent, 0);
    } else if (experiment === 'rollback') {
      assert.equal(result.outcome, 'interrupted-transition');
      assert.ok(result.transitionJourneys.interrupted > 0);
      assert.ok(result.journeys.some(journey => journey.error === 'latency-budget-exceeded'));
      assert.equal((await f.request('/control/route', undefined, { control: true })).body.greenPercent, 0);
    } else {
      assert.ok(result.transitionJourneys.attempted > 0);
      assert.equal(result.transitionJourneys.unverified, 0);
      assert.equal(result.transitionJourneys.interrupted, 0);
      if (experiment === 'ab') assert.equal((await f.request('/control/route', undefined, { control: true })).body.greenPercent, 50);
      else assert.ok(result.journeys.filter(journey => journey.affected).every(journey => journey.versions.includes('blue') && journey.versions.includes('green')));
    }
    if (experiment === 'blue-green') {
      assert.ok(evidence.requests.some(request => request.endpoint === '/journey/step' && request.version === 'blue' && request.milliseconds >= 1900));
    }
  });
}

test('an Azure transition command failure preserves unknown attempts, emits failure evidence, and recovers routing', async t => {
  const f = await fixture(t);
  const context = { ...f.context, experiment: 'native-swap' };
  const directory = temporaryDirectory(t);
  const evidence = new Evidence(directory, context);
  await assert.rejects(runExperiment(context, f.credentials, evidence, {
    async swap() { throw Object.assign(new Error('Injected Azure permission denial'), { code: 'permission-denied' }); }
  }), /permission denial/);
  const result = JSON.parse(fs.readFileSync(path.join(directory, 'result.json'), 'utf8'));
  assert.equal(result.controlPassed, false);
  assert.equal(result.transitionJourneys.unverified, context.users);
  assert.equal(result.transitionJourneys.attempted, context.users);
  assert.equal(result.transitionJourneys.successRatio, 0);
  assert.equal((await f.request('/control/route', undefined, { control: true })).body.greenPercent, 0);
  assert.ok(evidence.events.some(event => event.type === 'rollback' && event.verified));
});
