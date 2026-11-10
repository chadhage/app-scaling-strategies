'use strict';

// Test tooling, not production code: the test bodies shared by the four pipelining files (the server in this process or in a child process, each
// file holding a share of the rows so that it fits the per-file time cap under load). Every cell: nothing behind any refusal runs, what stands
// before it is answered in order, the server ends the connection, in HTTP/1.1 and HTTP/1.0.
const assert = require('node:assert/strict');
const test = require('node:test');
const { runMatrix } = require('./matrix.cjs');

function defineMatrix({ where, start, plan }) {
  for (const [config, part] of plan) {
    const share = part ? `, rows ${part[0] + 1} of ${part[1]}` : '';
    test(`the pipelining matrix ${where}, config ${config}${share}: nothing runs behind any refusal, earlier requests are answered in order, the connection ends`, { timeout: 120000 }, async () => {
      const target = await start(config);
      try {
        const { cells, problems } = await runMatrix(target, config, { part: part || [0, 1] });
        assert.ok(cells > 0 || process.env.C010_MATRIX_ONLY, 'the config has cells');
        assert.deepEqual(problems.slice(0, 12), [], `${problems.length} of ${cells} cells failed`);
      } finally {
        await target.close();
      }
    });
  }
}

module.exports = Object.freeze({ defineMatrix });
