'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createJourney } = require(path.join(__dirname, 'journey.stub.cjs'));
const config = Object.freeze({
  profileId: 'synthetic-001', draft: 'synthetic-draft-A',
  boundary: 'before-first-read', budgetMs: 1000
});
const contract = require(path.join(__dirname, '..', '..', '..', 'C020', 'contract.js'));

function fixture(request) {
  return Promise.resolve({
    requestToken: request.requestToken, implementation: request.implementation, status: 200,
    value: { apiContract: contract.apiContract, profile: contract.profiles[0], stamp: contract.stamps[request.implementation] },
    headerVersion: contract.stamps[request.implementation].implementationVersion,
    headerDeployment: contract.stamps[request.implementation].deploymentStamp
  });
}

test('RED: start actually holds the driver before its first read', { timeout: 2000 }, () => {
  const reads = [];
  const journey = createJourney({ clock: () => 10, read: (request) => { reads.push(request); return fixture(request); } });
  journey.start(config);
  assert.equal(journey.snapshot().phase, 'paused');
  assert.equal(reads.length, 0);
  assert.equal(journey.snapshot().original.draft, config.draft);
  journey.stop();
});

test('RED: Resume continues the same attempt through actual read actions', { timeout: 2000 }, async () => {
  const reads = [];
  const journey = createJourney({ clock: () => 20, read: (request) => { reads.push(request.implementation); return fixture(request); } });
  journey.start(config);
  assert.equal(journey.resume(), true);
  await journey.done();
  assert.deepEqual(reads, ['v1', 'v2']);
  assert.equal(journey.snapshot().acknowledgements.length, 2);
});

test('RED: held monotonic time spends the ORIGINAL budget without restarting it', { timeout: 2000 }, async () => {
  let now = 50;
  const journey = createJourney({ clock: () => now, read: fixture });
  journey.start(config);
  const started = journey.snapshot().startedAt;
  now = 1450;
  assert.equal(journey.snapshot().elapsedMs, 1400);
  assert.equal(journey.snapshot().budgetExceeded, true);
  journey.resume();
  await journey.done();
  assert.equal(journey.snapshot().startedAt, started);
  assert.equal(journey.snapshot().deadline, started + config.budgetMs);
  assert.equal(journey.snapshot().budgetExceeded, true);
});

test('RED: Stop and Reset retain an interrupted unknown attempt and never release a read', { timeout: 2000 }, () => {
  const reads = [];
  const journey = createJourney({ clock: () => 30, read: (request) => { reads.push(request); return fixture(request); } });
  journey.start(config);
  assert.equal(journey.stop(), true);
  journey.reset();
  assert.equal(journey.snapshot().history.length, 1);
  assert.equal(journey.snapshot().history[0].outcome, 'unknown');
  assert.equal(reads.length, 0);
});
