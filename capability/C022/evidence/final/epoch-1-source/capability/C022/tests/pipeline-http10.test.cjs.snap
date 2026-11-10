'use strict';

// Nothing runs behind a refusal, in THIS process, part 4 of 5 (see matrix-kit.cjs): HTTP/1.0 framing for every row of the refusal table
// that has an HTTP/1.0 form. [G][R][M] with keep-alive in HTTP/1.0, and an HTTP/1.1 refusal behind which an HTTP/1.0 mutation is
// pipelined (the server's own per-connection guard decides, never maxRequestsPerSocket).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { raw } = require('./helpers.cjs');
const { check, eachRow, label, useMatrix } = require('./matrix-kit.cjs');

const m = useMatrix();

eachRow(m, (row, h) => {
  if (row.only11) return;
  test(`${label(row)}: HTTP/1.0 framing: [G][R][M] with keep-alive, and an HTTP/1.1 refusal behind which an HTTP/1.0 mutation is pipelined`, m.cell(async () => {
    const framed = Buffer.concat([m.legit('1.0'), h.build('1.0'), m.down('1.0')]);
    const result = await raw.exchange(m.port, framed, { waitMs: 6000, settleMs: 250 });
    check(h.entry(), result.answers, [200]);
    assert.equal(await m.danaRole(), 'member', 'HTTP/1.0 keep-alive');
    const mixed = Buffer.concat([m.legit(), h.build(), m.down('1.0')]);
    const second = await raw.exchange(m.port, mixed, { waitMs: 6000, settleMs: 250 });
    check(h.entry(), second.answers, [200]);
    assert.equal(await m.danaRole(), 'member', 'an HTTP/1.0 mutation behind an HTTP/1.1 refusal');
  }));
});
