'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { startChild } = require('./resource-harness.cjs');
const { ROWS } = require('./refusal-rows.cjs');
const { SHAPES, FRAMINGS, writesOf, exchangeWrites, mutations, wanted, resetMayDiscard, isSubsequence } = require('./pipeline-rows.cjs');

// Review finding F1b against a server in a SEPARATE process: the same refusal rows, six shapes and three framings (HTTP/1.0
// keep-alive, an HTTP/1.0 mutation behind an HTTP/1.1 refusal: rev-C017 F12) as pipeline-refusal.test.cjs, the requests sent from this
// process over real loopback sockets, the state read back from the server process. The server process holds one app per row (a process
// start per row did not fit the 60 s of the suite command at 8 in parallel); every shape and framing of a row runs one after the other
// against its app (the effects add up: revision and pool size are compared with the state before each exchange).
const CHILD = path.join(__dirname, 'pipeline-child.cjs');

async function checkRow(child, row) {
  const { port, tokens, extra } = await child.ask({ type: 'open', code: row.code }, `opened:${row.code}`, 60000);
  const state = () => child.ask({ type: 'state', code: row.code }, `state:${row.code}`, 60000);
  {
    for (const framing of FRAMINGS.filter((entry) => !(entry.skips || []).includes(row.code))) {
      for (const shape of SHAPES) {
        const before = await state();
        const refusal = row.request({ port, tokens, extra });
        const result = await exchangeWrites(port, writesOf(shape, { port, tokens, refusal }, framing));
        const where = `${row.code} [${shape.name}] ${framing.name}`;
        const expected = [...shape.earlier.map(() => 200), row.status];
        const statuses = result.answers.map((answer) => answer.status);
        // A reset can discard answers the client has not read yet (see resetMayDiscard in pipeline-rows.cjs): for those cells the answers
        // are what the client could still read, and the server-side facts below decide.
        if (resetMayDiscard(row, shape)) assert.ok(isSubsequence(statuses, expected), `${where}: got ${statuses}, expected ${expected} or what a reset left of it`); else assert.deepEqual(statuses, expected, `${where}: answers`);
        if (statuses.length === expected.length) assert.equal(result.answers.at(-1).headers.connection, 'close', `${where}: Connection: close`);
        assert.equal(result.closedByServer, true, `${where}: the server process ends the connection`);
        const after = await state();
        const applyDone = after.revision - before.revision;
        if (row.code === 'REQUEST_TIMEOUT') {
          // A timer cuts a stalled request at once, so an earlier mutation a loaded server has not committed yet is cut with it: how many
          // of the earlier mutations ran is the machine's, that nothing behind the refusal ran and that the audit log matches is not.
          assert.ok(applyDone >= 0 && applyDone <= mutations(shape), `${where}: only requests before the refusal were applied (${applyDone} of at most ${mutations(shape)})`);
          assert.ok([before.size, 6].includes(after.size), `${where}: the pool.resize 7 behind the refusal did not run`);
          assert.equal(after.applied - before.applied, applyDone, `${where}: the audit log records exactly the commands that were applied`);
          continue;
        }
        assert.equal(applyDone, mutations(shape), `${where}: only the requests before the refusal were applied`);
        assert.equal(after.size, shape.earlier.includes('M6') ? 6 : before.size, `${where}: the pool.resize 7 behind the refusal did not run`);
        assert.equal(after.applied, before.applied + mutations(shape), `${where}: no applied audit record behind the refusal`);
      }
    }
  }
}

// Four rows at a time against the one server process.
test('every refusal row against a server in a separate process: nothing behind the refusal runs in any shape or framing', { concurrency: 4, timeout: 280000 }, async (t) => {
  const child = startChild({ heapMb: 128, hardMs: 290000, script: CHILD, args: [] });
  try {
    await child.receive('ready', 60000);
    await Promise.all(ROWS.filter((row) => wanted(`${row.code} [R M7] HTTP/1.1`)).map((row) => t.test(`${row.code} in a separate server process: nothing behind the refusal runs in any shape or framing`, { timeout: 120000 }, () => checkRow(child, row))));
  } finally {
    child.stop();
  }
});
