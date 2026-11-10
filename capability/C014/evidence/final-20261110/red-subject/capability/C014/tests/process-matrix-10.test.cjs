'use strict';

// The second half of the matrix against a server in its OWN process: the refusal in HTTP/1.0 framing (the mutation behind it in 1.0 and in 1.1), one file per
// half so that each process-spawning file fits the 60 s cap of the runner under a 4x slowdown.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startChild } = require('./child.cjs');
const { seedConfig } = require('./canaries.cjs');
const { call } = require('./harness.cjs');
const { runMatrix } = require('./matrix.cjs');

test('the matrix against a server in another process, refusal in HTTP/1.0 (mutation in 1.0 and in 1.1): the earlier answers in order, the typed refusal, the end; nothing runs behind a refusal', { timeout: 150000 }, async () => {
  const config = seedConfig();
  const child = await startChild({ mode: 'real' });
  try {
    const problems = await runMatrix({ port: child.port, tokens: config.tokens, runs: async () => (await call(child.port, 'GET', '/v1/evidence/runs')).json().total, framings: [['1.0', '1.0'], ['1.0', '1.1']], concurrency: 24 });
    assert.deepEqual(problems, []);
    const stats = await child.stats();
    assert.ok(stats.connections <= 1 && stats.heapBytes < 48 * 1024 * 1024);
  } finally { await child.close(); }
});
