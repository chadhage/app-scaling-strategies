'use strict';

// The canary sweep against a server in its OWN process (small heap): the answers are scanned as the attacker sees them, and so is everything the child
// process printed (its stdout and stderr are the console of the service). The planting seam and the token issue travel over IPC.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startChild } = require('./child.cjs');
const { runSweep } = require('./sweep.cjs');

test('the sweep over a server in another process: zero canary hits in the answers and in everything the process printed', { timeout: 150000 }, async () => {
  const result = await runSweep({ start: () => startChild({ mode: 'real' }), stream: false });
  assert.deepEqual(result.hits, []);
  assert.deepEqual(result.consoleHits, []);
  assert.ok(result.requests >= 100 && result.size > 50000, `${result.requests} requests, ${result.size} bytes`);
  assert.ok(result.consoleLines >= 100, `${result.consoleLines} lines of console output were scanned`);
  assert.deepEqual([result.facts.created, result.facts.visitor, result.facts.checked, result.facts.failed], [200, 403, 200, 500]);
});
