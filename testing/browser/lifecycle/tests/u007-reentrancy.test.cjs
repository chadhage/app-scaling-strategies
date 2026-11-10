'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const subject = process.env.U007_REENTRANCY_SUBJECT || path.resolve(__dirname, '..');
const core = require(path.join(subject, 'scratch.cjs'));
const { ManualClock, fakeFileSystem } = require('./u007-support.cjs');
const parent = path.resolve('owned-parent');
const observed = (promise) => promise.then(() => ({ ok: true }), (error) => ({ ok: false, code: error.code }));
test('U007-R007: option getter reentrancy cannot exceed the same-owner one-root bound', async () => {
  const clock = new ManualClock(), fake = fakeFileSystem(parent, clock);
  const owner = core.createScratchOwner({ parent, clock, fs: fake.adapter });
  const first = path.join(parent, 'session-first'), second = path.join(parent, 'session-reentrant');
  let reentrant, reads = 0;
  const creating = observed(owner.mkdir(first, { get recursive() {
    reads += 1; reentrant = observed(owner.mkdir(second)); return false;
  } }));
  const creation = await creating, nested = await reentrant;
  const recorded = owner.paths();
  const secondCreated = fake.entries.has(second);
  const result = await owner.cleanup();
  assert.deepEqual({ creation, nested, reads, recorded, secondCreated, removed: result.removed,
    removalTargets: fake.state.calls.map((call) => call.path) }, {
    creation: { ok: true }, nested: { ok: false, code: 'ERR_SCRATCH_OWNERSHIP' }, reads: 1,
    recorded: [first], secondCreated: false, removed: [first], removalTargets: [first],
  }, 'capacity must be reserved before a caller getter can reenter mkdir');
});
test('U007-R008: cleanup invoked by an option getter prevents any later mkdir issue', async () => {
  const clock = new ManualClock(), fake = fakeFileSystem(parent, clock);
  const owner = core.createScratchOwner({ parent, clock, fs: fake.adapter });
  const target = path.join(parent, 'session-close-during-options');
  let closing, reads = 0;
  const creation = await observed(owner.mkdir(target, { get recursive() {
    reads += 1; closing = owner.cleanup(); return false;
  } }));
  const report = await closing;
  assert.deepEqual({ creation, reads, recorded: owner.paths(), rootExists: fake.entries.has(target),
    cleanupClean: report.clean, remaining: report.remaining, unconfirmed: report.unconfirmed,
    removalTargets: fake.state.calls.map((call) => call.path) }, {
    creation: { ok: false, code: 'ERR_SCRATCH_CLOSED' }, reads: 1, recorded: [], rootExists: false,
    cleanupClean: false, remaining: [target], unconfirmed: [{ path: target, phase: 'refusal' }], removalTargets: [],
  }, 'an option getter must not make mkdir run after the caller received cleanup');
});
