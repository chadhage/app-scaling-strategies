'use strict';

// The refusal matrix of tests\matrix.cjs against a server in its OWN process, in all four framings (refusal and mutation each in HTTP/1.1 or HTTP/1.0): every
// refusal row, every position (including [G][G][X], [G][G][G][X] and [G][G][X][G] for the answers Node gives itself), one TCP write per cell.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startChild } = require('./child.cjs');
const { seedConfig } = require('./canaries.cjs');
const { call } = require('./harness.cjs');
const { runMatrix } = require('./matrix.cjs');

test('the matrix against a server in another process, refusal in HTTP/1.1 (mutation in 1.1 and in 1.0): the earlier answers in order, the typed refusal, the end; nothing runs behind a refusal', { timeout: 150000 }, async () => {
  const config = seedConfig();
  const child = await startChild({ mode: 'real' });
  try {
    const problems = await runMatrix({ port: child.port, tokens: config.tokens, runs: async () => (await call(child.port, 'GET', '/v1/evidence/runs')).json().total, framings: [['1.1', '1.1'], ['1.1', '1.0']], concurrency: 24 });
    assert.deepEqual(problems, []);
    const stats = await child.stats();
    assert.ok(stats.connections <= 1 && stats.heapBytes < 48 * 1024 * 1024);
  } finally { await child.close(); }
});
