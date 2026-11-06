'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { makePersisted, makeState } = require('../../C015/contract.cjs');
const { freshLoad } = require('./fresh.cjs');
const { root } = require('./support.cjs');

const contextFile = path.join(root, 'context.cjs');
const storeFile = path.join(root, '..', 'C015', 'store.cjs');

function receipt(epoch = 3, changes = {}) {
  const state = makeState('synthetic-run-001', epoch);
  return { restored: true, writesPerformed: 0, state, stateSha256: makePersisted(state, null).stateSha256, ...changes };
}

function load(restore) {
  const calls = [];
  const module = freshLoad(contextFile, { [storeFile]: { restore: async (...args) => { calls.push(args); return restore(); } } });
  return { module, calls };
}

test('the attribution context is the run and epoch that the public read-only C015 restore reports', async () => {
  for (const epoch of [1, 2, 3]) {
    const { module, calls } = load(() => receipt(epoch));
    const value = await module.readContext();
    assert.deepEqual(value, { origin: 'actual-C015-public-restore-read-only', runId: 'synthetic-run-001', epoch, stateSha256: receipt(epoch).stateSha256 });
    assert.deepEqual(calls, [['synthetic-restart-v1', 'synthetic-run-001']], 'only the fixed known namespace and run are read');
  }
  assert.deepEqual(freshLoad(contextFile, { [storeFile]: { restore() {} } }).known, { namespace: 'synthetic-restart-v1', runId: 'synthetic-run-001' });
});

test('anything that is not an exact, read-only, verified C015 receipt is refused with no fallback context', async () => {
  const state = makeState('synthetic-run-001', 3);
  const bad = {
    'no receipt': () => null,
    'not restored': () => receipt(3, { restored: false }),
    'string true': () => receipt(3, { restored: 'true' }),
    'a write was performed': () => receipt(3, { writesPerformed: 1 }),
    'missing write count': () => receipt(3, { writesPerformed: undefined }),
    'another run': () => ({ ...receipt(3), state: { ...state, runId: 'synthetic-run-002' } }),
    'no state': () => receipt(3, { state: undefined }),
    'digest is not hex': () => receipt(3, { stateSha256: 'zz' }),
    'digest missing': () => receipt(3, { stateSha256: undefined }),
    'tampered state': () => ({ ...receipt(3), state: { ...state, limits: { ...state.limits, extra: 1 } } }),
  };
  for (const [name, make] of Object.entries(bad)) {
    const { module } = load(make);
    await assert.rejects(module.readContext(), (error) => error.code === 'ACTUAL_KNOWN_C015_CONTEXT_REQUIRED', name);
  }
});

test('a state outside the closed C015 epochs and a failing restore are surfaced typed, never defaulted', async () => {
  const outside = load(() => ({ ...receipt(3), state: { ...makeState('synthetic-run-001', 3), epoch: 9 } }));
  await assert.rejects(outside.module.readContext(), (error) => error.code === 'UNKNOWN_EPOCH');
  const failing = load(() => { throw Object.assign(new Error('missing'), { code: 'STATE_MISSING' }); });
  await assert.rejects(failing.module.readContext(), (error) => error.code === 'STATE_MISSING');
});
