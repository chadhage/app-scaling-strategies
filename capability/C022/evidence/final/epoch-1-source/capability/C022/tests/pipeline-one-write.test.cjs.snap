'use strict';

// Nothing runs behind a refusal, in THIS process, part 1 of 5 (the matrix is split by shape for cost: matrix-kit.cjs). Every row of the
// refusal table (rows.cjs), with raw sockets and ONE write: [R][M] (the refused request, then a valid authorized mutation: the admin
// turns dana into a viewer) and [M1][R][M2] (the first mutation is owed an answer and applies, the second never runs). The answers, the
// closed connection and dana's role decide.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { raw } = require('./helpers.cjs');
const { check, eachRow, label, useMatrix } = require('./matrix-kit.cjs');

const m = useMatrix();

eachRow(m, (row, h) => {
  test(`${label(row)}: [R][M] in one write: the mutation behind the refusal never runs`, m.cell(async () => {
    const result = await raw.exchange(m.port, Buffer.concat([h.build(), m.down()]), { waitMs: 6000, settleMs: 250 });
    check(h.entry(), result.answers, []);
    assert.equal(result.closedByServer, true);
    assert.equal(await m.danaRole(), 'member');
  }));

  test(`${label(row)}: [M1][R][M2]: the first mutation applies and is answered, the second never runs`, m.cell(async () => {
    const result = await raw.exchange(m.port, Buffer.concat([m.down(), h.build(), m.up()]), { waitMs: 6000, settleMs: 250 });
    check(h.entry(), result.answers, [200]);
    assert.equal(result.closedByServer, true);
    assert.equal(await m.danaRole(), 'viewer', 'M1 applied once and M2 behind the refusal did not');
  }));
});
