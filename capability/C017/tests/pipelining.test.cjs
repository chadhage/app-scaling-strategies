'use strict';

// F12 of the second independent review and orders\_PIPELINING.md: once a request is refused on a connection, NO later request on that
// connection may run effects, whatever its HTTP version and however the refusal was decided (synchronously, after an await, or by Node
// itself before any handler). Raw sockets, ONE write per case (two writes 5 ms apart for a selection), a server in a SEPARATE process, the
// journal's sha256 plus the state's revision unchanged behind every refusal. Matrix: the mutations cancel, start and reconcile; every
// refusal of the catalogue as first request, behind a valid GET, and in both framings (HTTP/1.1 and HTTP/1.0) for the refusal and for the
// mutation; controls prove that the same mutation alone applies in each framing, and a valid mutation THEN a refusal applies exactly once.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('./pipelining.cjs');

const { describe, it } = test;
const VERSIONS = ['1.1', '1.0'];
const OK = { cancel: 200, start: 202, reconcile: 200 };
const SELECTED = /^(417|403 foreign|413 chunked|400 INVALID_JSON \(|engine refusal: cancel)/;
const MUTATIONS = ['cancel', 'start', 'reconcile'];
const SURVEY = /^(403 foreign|404 unknown route|405 GET|415 text|417|400 INVALID_JSON \(|engine refusal: cancel)/;

// Every answer after the first may only be Node's own 503 for a second HTTP/1.1 request: never an answer of the mutation.
const verdict = (name, answered, expectedFirst, before, after, { mayBeReset = false } = {}) => {
  const problems = [];
  const [first, ...rest] = answered.statuses;
  // Two writes 5 ms apart: the server may already have answered and closed when the second write arrives, and on Windows the reset then discards the answer
  // that was still in flight (L-0179). Such a case may show no answer at all; what it must never show is a later answer or a changed journal.
  const lost = mayBeReset && first === undefined;
  if (!lost && (expectedFirst === null ? !(first >= 400 && first < 500) : first !== expectedFirst)) problems.push(`${name}: the client saw ${JSON.stringify(answered.statuses)}, expected a first answer of ${expectedFirst === null ? '4xx' : expectedFirst}`);
  if (!rest.every((status) => status === 503)) problems.push(`${name}: a later request was answered: ${JSON.stringify(answered.statuses)}`);
  if (before !== after) problems.push(`${name}: THE JOURNAL OR THE REVISION CHANGED behind a refusal: ${after}`);
  return problems;
};

async function refusalMatrix(t, type, survey) {
  const ctx = await P.prepare(t, type);
  const before = await P.settled(ctx);
  const problems = [];
  let cases = 0;
  for (const [name, status, kinds, build] of P.REFUSALS.filter((row) => !survey || SURVEY.test(row[0]))) {
    for (const refusedAs of kinds) {
      for (const mutatedAs of VERSIONS) {
        const patterns = [['refusal first', () => build(ctx, refusedAs) + P.mutation(ctx, mutatedAs), status]];
        if (!survey && refusedAs === kinds[0]) patterns.push(['behind a valid GET', () => P.okGet(ctx, '1.1') + build(ctx, refusedAs) + P.mutation(ctx, mutatedAs), 200]);
        for (const [pattern, bytes, expectedFirst] of patterns) {
          const answered = await P.exchange(ctx.port, [{ bytes: bytes() }]);
          problems.push(...verdict(`${type}: ${name} (${refusedAs}) then ${type} (${mutatedAs}), ${pattern}`, answered, expectedFirst, before, await P.settled(ctx)));
          cases += 1;
        }
        if (!survey && refusedAs === kinds[0] && SELECTED.test(name)) {
          const slow = await P.exchange(ctx.port, [{ bytes: build(ctx, refusedAs) }, { bytes: P.mutation(ctx, mutatedAs), pauseMs: 5 }]);
          problems.push(...verdict(`${type}: ${name} (${refusedAs}) then ${type} (${mutatedAs}) in TWO writes 5 ms apart`, slow, status, before, await P.settled(ctx), { mayBeReset: true }));
          cases += 1;
        }
      }
    }
  }
  return { ctx, problems, cases, before };
}

describe('a mutation pipelined behind a refusal (three server processes at a time)', { concurrency: 3 }, () => {
  for (const type of MUTATIONS) {
    it(`${type}: a mutation pipelined behind ANY refusal never applies, in HTTP/1.1 and HTTP/1.0 framing, against a server in a separate process`, { timeout: 240000 }, async (t) => {
    const { ctx, problems, cases } = await refusalMatrix(t, type, type !== 'cancel');
    assert.ok(cases >= (type === 'cancel' ? 100 : 20), `only ${cases} cases ran`);
    assert.deepEqual(problems, [], `${problems.length} of ${cases} cases failed`);
    const stopped = await ctx.kid.stop();
    assert.equal(stopped.code, 0, ctx.kid.errors());
  });

    it(`${type}: controls: the same mutation alone applies in HTTP/1.1 and HTTP/1.0, and a valid mutation THEN a refusal applies exactly once`, { timeout: 240000 }, async (t) => {
    for (const version of VERSIONS) {
      const ctx = await P.prepare(t, type);
      const before = await P.settled(ctx);
      const alone = await P.exchange(ctx.port, [{ bytes: P.mutation(ctx, version) }]);
      assert.equal(alone.statuses[0], OK[type], `the control mutation alone (${version}) was not accepted: ${alone.text}`);
      const after = await P.settled(ctx);
      assert.notEqual(after, before, `the control mutation (${version}) did not change the journal, so the matrix could not tell an applied mutation from a refused one`);
      await ctx.kid.stop();
    }
    const ctx = await P.prepare(t, type);
    const before = await P.settled(ctx);
    const first = await P.exchange(ctx.port, [{ bytes: `${P.mutation(ctx, '1.1')}${P.REFUSALS[4][3](ctx, '1.1')}` }]);
    assert.equal(first.statuses[0], OK[type], `the mutation FIRST must be answered: ${first.text}`);
    assert.ok(first.statuses.slice(1).every((status) => status === 503), `the refusal behind a valid mutation was answered: ${JSON.stringify(first.statuses)}`);
    const once = await P.settled(ctx);
    assert.notEqual(once, before);
    const again = await P.exchange(ctx.port, [{ bytes: P.okGet(ctx, '1.0') }]);
    assert.equal(again.statuses[0], 200);
    assert.equal(await P.settled(ctx), once, 'reading the state changed it');
    await ctx.kid.stop();
  });
  }
});
