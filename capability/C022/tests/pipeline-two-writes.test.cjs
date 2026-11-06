'use strict';

// Nothing runs behind a refusal, in THIS process, part 3 of 5 (see matrix-kit.cjs): the pair [R][M] of every row of the refusal table in
// TWO writes a few milliseconds apart (the pause only SHAPES the input, no assertion waits on a clock): nothing runs behind the refusal
// either.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { check, eachRow, label, useMatrix } = require('./matrix-kit.cjs');

const m = useMatrix();

eachRow(m, (row, h) => {
  test(`${label(row)}: the same pair in TWO writes: nothing runs behind the refusal either`, m.cell(async () => {
    const result = await m.exchangeParts([h.build(), m.down()]);
    // A reset can discard an answer the client has not read yet (Windows resets a connection that still has unread data in flight): the
    // answers only have to be the ones owed, in order (none is allowed); the state decides.
    check({ ...h.entry(), lossy: true }, result.answers, []);
    assert.equal(result.closedByServer, true);
    assert.equal(await m.danaRole(), 'member');
  }));
});
