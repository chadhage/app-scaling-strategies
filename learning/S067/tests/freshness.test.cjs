'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../model.js');
const fixture = require('../fixture.js');

const run = (changes = {}) => model.read(model.introduceLag(model.initial(),
  { ...fixture.defaults, ...changes }));

test('the model and finite fixture load without missing code or tools', () => {
  for (const action of ['initial', 'introduceLag', 'read', 'check', 'next', 'reset']) {
    assert.equal(typeof model[action], 'function');
  }
  assert.equal(model.initial().phase, 'configuring');
  assert.equal(fixture.primaryVersion, 12);
});

test('five ticks of lag on a direct strict read must FAIL, not silently pass', () => {
  const state = run();
  assert.equal(state.result.gate, 'FAIL');
  assert.equal(state.result.impact, 'INTERRUPTED');
  assert.equal(state.result.code, 'STALE_READ');
  assert.equal(state.result.selectedReader, 'reader-1');
  assert.equal(state.result.requiredVersion, 12);
  assert.equal(state.result.receivedVersion, 7);
  assert.equal(state.result.observedLagTicks, 5);
  assert.equal(state.lagObservation.lagTicks, 5);
});

test('watermark-gated routing meets strict freshness through primary without catching up reader', () => {
  const state = run({ routing: 'gated' });
  assert.equal(state.result.gate, 'PASS');
  assert.equal(state.result.selectedReader, 'primary');
  assert.equal(state.result.receivedVersion, 12);
  assert.equal(state.result.observedLagTicks, 0);
  assert.equal(state.lagObservation.readerVersion, 7);
  assert.equal(state.lagObservation.lagTicks, 5);
});

test('a reader exactly two ticks behind meets a two-tick freshness declaration', () => {
  const state = run({ lag: 'two', freshness: 'two-ticks' });
  assert.equal(state.result.gate, 'PASS');
  assert.equal(state.result.selectedReader, 'reader-1');
  assert.equal(state.result.requiredVersion, 10);
  assert.equal(state.result.receivedVersion, 10);
  assert.equal(state.result.observedLagTicks, 2);
});

test('the same two-tick reader fails a strict-current declaration', () => {
  const state = run({ lag: 'two' });
  assert.equal(state.result.gate, 'FAIL');
  assert.equal(state.result.requiredVersion, 12);
  assert.equal(state.result.receivedVersion, 10);
});

test('an unknown reader watermark cannot certify a direct read', () => {
  const state = run({ lag: 'unknown' });
  assert.equal(state.result.code, 'READER_WATERMARK_UNKNOWN');
  assert.equal(state.result.gate, 'UNKNOWN');
  assert.equal(state.result.impact, 'UNVERIFIED');
  assert.equal(state.result.selectedReader, 'reader-1');
  assert.equal(state.result.receivedVersion, null);
});

test('unknown reader lag routes to the known-current primary when gated', () => {
  const state = run({ lag: 'unknown', routing: 'gated' });
  assert.equal(state.result.gate, 'PASS');
  assert.equal(state.result.selectedReader, 'primary');
  assert.equal(state.lagObservation.lagTicks, null);
});

test('a missing returned-read observation stays UNKNOWN even after selecting primary', () => {
  const state = run({ routing: 'gated', coverage: 'missing' });
  assert.equal(state.result.code, 'READ_OBSERVATION_MISSING');
  assert.equal(state.result.gate, 'UNKNOWN');
  assert.equal(state.result.selectedReader, 'primary');
  assert.equal(state.result.receivedVersion, null);
  assert.equal(state.result.impact, 'UNVERIFIED');
});

test('predicting a failure correctly retains the failing read and interrupted impact', () => {
  const checked = model.check(run(), 'FAIL');
  assert.equal(checked.history.length, 1);
  assert.equal(checked.prediction.matched, true);
  assert.equal(checked.history[0].result.gate, 'FAIL');
  assert.equal(checked.history[0].result.impact, 'INTERRUPTED');
  assert.equal(checked.history[0].predicted, 'FAIL');
});
