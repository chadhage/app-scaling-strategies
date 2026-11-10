'use strict';

require('./u060-loop-bound.preload.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const { openRunner } = require('../runner.cjs');
const { openEngine } = require('../../C042/engine.cjs');
const { createMemoryIo } = require('../../C042/journal.cjs');

test('U060 structural-loop control: maximum eight valid steps complete with a nonadvancing clock', async () => {
  const engine = await openEngine({ io: createMemoryIo() });
  const runner = await openRunner({ engine, io: createMemoryIo(), clock: () => 0 });
  const steps = Array.from({ length: 8 }, (_, index) => ({
    schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: `u060-control-step-${index}`,
    leaseId: 'synthetic-lease-001', units: 1,
  }));
  const result = await runner.run({
    schemaVersion: 1, preset: 'bounded-sequence', idempotencyKey: 'u060-control-run-1',
    bounds: { maxSteps: 8, maxDurationMs: 1000, maxUnits: 80 }, steps,
  });
  assert.equal(result.body.run.state, 'completed');
  assert.equal(result.body.effects.length, 8);
  assert.equal(engine.leases()['synthetic-lease-001'].committed, 8);
});
