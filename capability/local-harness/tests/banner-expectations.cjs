'use strict';

const assert = require('node:assert/strict');
const SOURCE_COMMIT = 'c8b3139f07aa60a64833a5380503b2bd794c0e0e';
const CANONICAL_BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
const S148_BANNER = 'Training rehearsal - synthetic data - not a live Azure result.';
const IDS = Object.freeze(Array.from({ length: 150 }, (_, index) => `S${String(index + 1).padStart(3, '0')}`));

function expectedTrainingBanner(id, sourceCommit) {
  assert.equal(sourceCommit, SOURCE_COMMIT, 'The banner exception belongs only to the exact immutable OP165 source.');
  assert.ok(IDS.includes(id), `Unknown exact practice ID: ${id}`);
  return id === 'S148' ? S148_BANNER : CANONICAL_BANNER;
}

function assertTrainingBanner(id, actual, sourceCommit) {
  assert.equal(actual, expectedTrainingBanner(id, sourceCommit), `${id}: exact immutable original banner required`);
}

module.exports = { SOURCE_COMMIT, CANONICAL_BANNER, S148_BANNER, expectedTrainingBanner, assertTrainingBanner };
