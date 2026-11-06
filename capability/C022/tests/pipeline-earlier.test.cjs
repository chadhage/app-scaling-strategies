'use strict';

// Nothing runs behind a refusal, in THIS process, part 2 of 5 (see matrix-kit.cjs): [G][R][M] and [G][G][R][M] for every row of the
// refusal table in ONE write. The earlier legitimate requests are answered IN ORDER, then the refusal, then the connection is closed,
// and the mutation behind the refusal never runs.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { raw } = require('./helpers.cjs');
const { check, eachRow, label, useMatrix } = require('./matrix-kit.cjs');

const m = useMatrix();

eachRow(m, (row, h) => {
  test(`${label(row)}: [G][R][M] and [G][G][R][M]: the earlier requests are answered IN ORDER, the mutation never runs`, m.cell(async () => {
    for (const earlier of [1, 2]) {
      const bytes = Buffer.concat([...Array(earlier).fill(0).map(() => m.legit()), h.build(), m.down()]);
      const result = await raw.exchange(m.port, bytes, { waitMs: 6000, settleMs: 250 });
      check(h.entry(), result.answers, Array(earlier).fill(200));
      assert.equal(result.closedByServer, true, `${earlier} legitimate request(s) before`);
      assert.equal(await m.danaRole(), 'member', `${earlier} legitimate request(s) before`);
    }
  }));
});
