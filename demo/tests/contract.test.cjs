'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { catalog, experiments, summarize, resourceGroup, destination } = require('../lib/contract.cjs');
const { configuration, contextFor, preflight } = require('../pipeline.cjs');
const { selectJourneys, Evidence, Client, newJourney } = require('../lib/client.cjs');
const { packageReleases } = require('../package.cjs');
const { unzipSync, strFromU8 } = require('fflate');
const { temporaryDirectory } = require('./helpers.cjs');

const valid = {
  AZURE_SUBSCRIPTION_ID: '11111111-1111-1111-1111-111111111111',
  AZURE_TENANT_ID: '22222222-2222-2222-2222-222222222222',
  AZURE_CLIENT_ID: '33333333-3333-3333-3333-333333333333',
  AZURE_LOCATION: 'centralus', CONFIRM_COST: 'true', ESTIMATED_COST_USD: '2', MAX_ESTIMATED_COST_USD: '20',
  USERS: '4', OBSERVATION_SECONDS: '2', JOURNEYS_PER_SECOND: '1', EXPERIMENT: 'blue-green',
  GITHUB_REPOSITORY: 'owner/repo', GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1'
};

test('all 150 source scenarios are accounted for without qualification or fabricated coverage', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'README.md'), 'utf8');
  const rows = catalog(source);
  assert.equal(rows.length, 150);
  assert.ok(rows.every(row => row.qualification === 'not-qualified'));
  assert.ok(rows.some(row => row.implementation === 'planned' && row.phase === 2));
  assert.equal(rows.find(row => row.id === 'S149').implementation, 'planned');
  assert.ok(rows.filter(row => row.implementedBy.length).every(row => row.implementation === 'partial-bounded-demonstration'));
  assert.throws(() => catalog(source.replace('| S150 |', '| S151 |')), /ordered S001-S150/);
});

test('dispatch fails closed on consent, target, limits, arbitrary IDs, and campaign estimates', () => {
  assert.equal(configuration(valid).subscription, valid.AZURE_SUBSCRIPTION_ID);
  for (const override of [
    { CONFIRM_COST: 'false' }, { AZURE_CLIENT_ID: '' }, { AZURE_LOCATION: '' },
    { ESTIMATED_COST_USD: '0' }, { MAX_ESTIMATED_COST_USD: '1' },
    { USERS: '5' }, { USERS: '1000' }, { USERS: '4.0' },
    { EXPERIMENT: 'S149' }, { OBSERVATION_SECONDS: '61' }, { JOURNEYS_PER_SECOND: '6' },
    { EXPERIMENT: 'all-implemented', ESTIMATED_COST_USD: '10' }
  ]) assert.throws(() => configuration({ ...valid, ...override }));
  assert.equal(configuration({ ...valid, EXPERIMENT: 'all-implemented' }).selected.length, Object.keys(experiments).length);
});

test('contexts bind each isolated group and immutable epoch to the exact Actions attempt', () => {
  const context = contextFor(valid, configuration(valid), 'blue-green');
  assert.equal(context.resourceGroup, 'ass-demo-123-1-blue-green');
  assert.equal(context.epoch, '123.1');
  assert.ok(Date.parse(context.expiresAt) > Date.now());
  assert.throws(() => resourceGroup('123;rm', '1', 'blue-green'));
  assert.throws(() => resourceGroup('123', '1', 'S150'));
});

test('empty samples are not 100%; unknown and interrupted attempts remain in the denominator', () => {
  assert.equal(summarize([]).successRatio, null);
  const result = summarize([{ outcome: 'uninterrupted' }, { outcome: 'interrupted' }, { outcome: 'unverified' }]);
  assert.equal(result.attempted, 3);
  assert.equal(result.successRatio, 1 / 3);
  assert.equal(result.illustrativeIndependentZeroFailure95UpperBound, null);
  const zero = summarize(Array.from({ length: 299572 }, () => ({ outcome: 'uninterrupted' })));
  assert.ok(zero.illustrativeIndependentZeroFailure95UpperBound <= 0.00001);
  assert.equal(zero.fiveNinesEstablished, false);
  assert.equal(zero.independenceEstablished, false);
});

test('canary samples include actual moving users and stable controls at every increment', () => {
  for (const [from, to] of [[0, 5], [5, 25], [25, 50], [50, 100]]) {
    const journeys = selectJourneys('123.1', 10, from, to, `stage-${to}`);
    assert.equal(journeys.length, 10);
    assert.equal(journeys.filter(journey => journey.affected).length, 5);
    for (const journey of journeys) {
      assert.equal(destination({ epoch: '123.1', greenPercent: from }, journey.id) !== destination({ epoch: '123.1', greenPercent: to }, journey.id), journey.affected);
    }
  }
});

test('preflight rejects unknown or exhausted quota and preserves subscription isolation', async () => {
  const context = contextFor(valid, configuration(valid), 'blue-green');
  const evidence = { event() {} };
  const mock = used => async args => {
    if (args[0] === 'account') return context.subscription;
    if (args[0] === 'group') return false;
    if (args[0] === 'appservice') return [{ name: 'Central US' }];
    if (args[0] === 'webapp') return [{ config: 'NODE|24-lts' }];
    if (args[1] === 'list') return [{ name: 'P1v3', properties: { limit: { value: 10 } } }];
    return [{ name: 'P1v3', properties: { usages: { value: used } } }];
  };
  await preflight(context, mock(0), evidence);
  await assert.rejects(preflight(context, mock(-1), evidence), /unknown quotas/);
  await assert.rejects(preflight(context, mock(9), evidence), /two available/);
  await assert.rejects(preflight(context, async () => 'another-subscription', evidence), /different subscription/);
});

test('the client correctness oracle rejects empty-success and missing identity responses', t => {
  const evidence = new Evidence(temporaryDirectory(t), {});
  const client = new Client({}, {}, evidence);
  const journey = newJourney('oracle-1', true);
  assert.throws(() => client.check({}, journey, 0, 0), /identity/);
  assert.throws(() => client.check({ deployment: { instanceId: 'w' }, state: {} }, journey, 0, 0), /oracle/);
});

test('all deployment archives include dependencies and immutable, distinct release identities', t => {
  const directory = temporaryDirectory(t);
  packageReleases(directory, '123.1', 'a'.repeat(40));
  for (const version of ['blue', 'green', 'router']) {
    const files = unzipSync(fs.readFileSync(path.join(directory, `${version}.zip`)));
    const release = JSON.parse(strFromU8(files['release.json']));
    assert.deepEqual(release, { version, epoch: '123.1', commit: 'a'.repeat(40) });
    assert.ok(files['node_modules/express/index.js']);
    assert.ok(files['node_modules/@azure/storage-blob/package.json']);
    assert.ok(files['server.cjs']);
    assert.ok(!Object.keys(files).some(name => name.includes('private-parameters')));
  }
});
