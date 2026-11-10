'use strict';

// Test tooling, not production code: the cell checker and the in-process matrix of review finding F1b, shared by the three framing files
// (pipeline-refusal.test.cjs HTTP/1.1, pipeline-refusal-http10.test.cjs, pipeline-refusal-mixed.test.cjs), by the process matrix and by the
// Node-own matrix. One raw TCP socket sends the requests of a SHAPE (pipeline-rows.cjs) with the refusal R of a ROW somewhere in them, in a
// FRAMING: whatever stands behind R must never run, whatever stands before it is answered once and in order, and the server ends the
// connection. What decides is the answers and the SERVER's own account (revision, pool size, applied audit records), read through
// state(): in this process or from a server process. COST (review F9c, L-0204): ONE app serves every shape of a row one after the other
// (each cell compares with the state before it), and a row is one test, not one app and one subtest per cell (605 cells cost 24 s).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { send, startApp } = require('./helpers.cjs');
const { ROWS } = require('./refusal-rows.cjs');
const { SHAPES, FRAMINGS, appFor, writesOf, exchangeWrites, mutations, appliedCount, wanted, resetMayDiscard, isSubsequence } = require('./pipeline-rows.cjs');

const NAMES = ['visitor', 'conductor-a', 'conductor-b', 'operator'];
const tokensOf = (context) => Object.fromEntries(NAMES.map((name) => [name, context.app.issueToken(name)]));
const labelOf = (row) => row.label || row.code;

async function checkCells({ row, framing, shapes, port, tokens, extra, state }) {
  for (const shape of shapes) {
    const where = `${labelOf(row)} [${shape.name}] ${framing.name}`;
    const before = await state();
    const refusal = row.request({ port, tokens, extra });
    const result = await exchangeWrites(port, writesOf(shape, { port, tokens, refusal }, framing));
    const expected = [...shape.earlier.map(() => 200), row.status];
    const statuses = result.answers.map((answer) => answer.status);
    // A reset can discard answers the client has not read yet (see resetMayDiscard in pipeline-rows.cjs): for those cells the answers are
    // what the client could still read, and the server-side facts below decide.
    if (resetMayDiscard(row, shape)) assert.ok(isSubsequence(statuses, expected), `${where}: got ${statuses}, expected ${expected} or what a reset left of it`);
    else assert.deepEqual(statuses, expected, `${where}: the answers of the earlier requests and the refusal, and no answer for what stands behind it`);
    if (statuses.length === expected.length) {
      assert.equal(result.answers.at(-1).json?.error?.code, row.code, `${where}: the typed code`);
      assert.equal(result.answers.at(-1).headers.connection, 'close', `${where}: the refusal announces that the connection ends`);
    }
    assert.equal(result.closedByServer, true, `${where}: the server ends the connection after the refusal`);
    const after = await state();
    const applyDone = after.revision - before.revision;
    if (row.code === 'REQUEST_TIMEOUT') {
      // A timer cuts a stalled request at once, so an earlier mutation a loaded server has not committed yet is cut with it: how many of the
      // earlier mutations ran is the machine's, that the audit log matches them and that nothing behind the refusal ran is not.
      assert.ok(applyDone >= 0 && applyDone <= mutations(shape), `${where}: only requests before the refusal were applied (${applyDone} of at most ${mutations(shape)})`);
      assert.ok([before.size, 6].includes(after.size), `${where}: the pool.resize 7 behind the refusal did not run`);
      assert.equal(after.applied - before.applied, applyDone, `${where}: the audit log records exactly the commands that were applied`);
      continue;
    }
    assert.equal(applyDone, mutations(shape), `${where}: only the requests before the refusal were applied`);
    assert.equal(after.size, shape.earlier.includes('M6') ? 6 : before.size, `${where}: the pool.resize 7 behind the refusal did not run`);
    assert.equal(after.applied - before.applied, mutations(shape), `${where}: the audit log records no applied command behind the refusal`);
  }
}

// The matrix of one framing in this process: one test per row, four rows at a time, each on its own app on its own port.
function registerInProcess(framingIndex) {
  const framing = FRAMINGS[framingIndex];
  const rows = ROWS.filter((row) => !(framing.skips || []).includes(row.code))
    .map((row) => ({ row, shapes: SHAPES.filter((shape) => wanted(`${row.code} [${shape.name}] ${framing.name}`)) }))
    .filter(({ shapes }) => shapes.length > 0);
  test(`every refusal row, ${framing.name}: nothing behind the refusal runs, what stands before it is answered, the connection ends`, { concurrency: 4, timeout: 55000 }, async (t) => {
    await Promise.all(rows.map(({ row, shapes }) => t.test(`${row.code} in ${shapes.length} shapes, ${framing.name}: nothing behind the refusal runs, what stands before it is answered, the connection ends`, { timeout: 50000 }, async () => {
      const context = await startApp({ app: appFor(row) });
      try {
        const tokens = tokensOf(context);
        const extra = (await row.setup?.({ context, tokens, send })) || {};
        const state = async () => {
          const { revision, state: ledgerState } = context.app.snapshot();
          return { revision, size: ledgerState.pool.size, applied: appliedCount(context) };
        };
        await checkCells({ row, framing, shapes, port: context.port, tokens, extra, state });
      } finally {
        await context.close();
      }
    })));
  });
}

module.exports = Object.freeze({ checkCells, registerInProcess, tokensOf, labelOf });
