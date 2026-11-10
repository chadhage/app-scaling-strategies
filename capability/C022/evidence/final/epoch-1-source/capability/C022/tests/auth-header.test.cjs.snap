'use strict';

// The WWW-Authenticate challenge (found by the systematic mutants: flipping the status test in the refusal helper survived the whole suite).
// EVERY 401 of the refusal table carries the challenge of this fixture's realm, and no other answer does: not another refusal status, not a
// success. One raw request per row of rows.cjs against one app.
const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { raw, startApp } = require('./helpers.cjs');
const rows = require('./rows.cjs');

let ctx;
let table;
let t;
before(async () => {
  ctx = await startApp({ app: { hooks: rows.HOOKS } });
  t = await rows.prepare(ctx);
  table = rows.ROWS(t);
});
after(async () => { await ctx.close(); });

const CHALLENGE = 'Bearer realm="c022-local"';
const label = (row) => row.name || row.code;

for (const row of rows.ROWS(new Proxy({}, { get: () => 'placeholder' }))) {
  test(`${label(row)} (${row.status}): the WWW-Authenticate challenge is present if and only if the status is 401`, async () => {
    const entry = table.find((candidate) => label(candidate) === label(row));
    const result = await raw.exchange(ctx.port, entry.build(ctx.port), { waitMs: 6000, settleMs: 250 });
    const [answer] = result.answers;
    if (!answer) {
      assert.equal(entry.lossy, true, 'only a row whose answer a reset may discard has no answer');
      return;
    }
    assert.equal(answer.status, entry.status);
    assert.equal(answer.headers['www-authenticate'], entry.status === 401 ? CHALLENGE : undefined);
  });
}

test('a success carries no challenge, and a 401 for a dead token names the realm exactly', async () => {
  const ok = await ctx.call('GET', '/v1/session', { token: t.ada });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers['www-authenticate'], undefined);
  const dead = await ctx.call('GET', '/v1/session', { token: t.revoked });
  assert.equal(dead.status, 401);
  assert.equal(dead.headers['www-authenticate'], CHALLENGE);
});
