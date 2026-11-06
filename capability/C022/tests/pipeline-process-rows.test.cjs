'use strict';

// Nothing runs behind a refusal against a server in a SEPARATE PROCESS (one child for the whole file, matrix-kit.cjs), HTTP/1.1 and HTTP/1.0,
// for every row of the refusal table: [G][R][M], [G][G][R][M], [M1][R][M2], and the HTTP/1.0 framings. Facts are COUNTED (answers, closed
// connection, the role of dana), never timed. The third hole and the 128-socket resource test are in pipeline-process-third-hole.test.cjs.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { raw } = require('./helpers.cjs');
const { check, eachRow, label, useMatrix } = require('./matrix-kit.cjs');

const m = useMatrix({ remote: true });

test('the child serves a prepared world and a positive control keeps its connection open', async () => {
  const result = await raw.exchange(m.port, m.legit(), { waitMs: 3000, settleMs: 300 });
  assert.deepEqual(result.answers.map((answer) => answer.status), [200]);
  assert.equal(result.closedByServer, false);
});

eachRow(m, (row, h) => {
  test(`${label(row)} in a separate server process: [G][R][M], [G][G][R][M], [M1][R][M2] in HTTP/1.1 and HTTP/1.0`, m.cell(async () => {
    for (const earlier of [1, 2]) {
      const result = await raw.exchange(m.port, Buffer.concat([...Array(earlier).fill(0).map(() => m.legit()), h.build(), m.down()]), { waitMs: 6000, settleMs: 250 });
      check(h.entry(), result.answers, Array(earlier).fill(200));
      assert.equal(result.closedByServer, true);
      assert.equal(await m.danaRole(), 'member', `${earlier} legitimate before`);
    }
    const first = await raw.exchange(m.port, Buffer.concat([m.down(), h.build(), m.up()]), { waitMs: 6000, settleMs: 250 });
    check(h.entry(), first.answers, [200]);
    assert.equal(await m.danaRole(), 'viewer', 'M1 applied, M2 behind the refusal did not');
    await m.reset();
    if (!row.only11) {
      const old = await raw.exchange(m.port, Buffer.concat([m.legit('1.0'), h.build('1.0'), m.down('1.0')]), { waitMs: 6000, settleMs: 250 });
      check(h.entry(), old.answers, [200]);
      assert.equal(await m.danaRole(), 'member', 'HTTP/1.0 keep-alive');
      const mixed = await raw.exchange(m.port, Buffer.concat([m.legit(), h.build(), m.down('1.0')]), { waitMs: 6000, settleMs: 250 });
      check(h.entry(), mixed.answers, [200]);
      assert.equal(await m.danaRole(), 'member', 'HTTP/1.0 mutation behind an HTTP/1.1 refusal');
    }
  }));
});

test('after every cell of this file the world of the server process is exactly what it was before (no refusal and no pipelined request left a trace)', () => m.worldUnchanged());
