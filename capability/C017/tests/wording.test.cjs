'use strict';

// F4: a compensation that fails at its FIRST compensating step reversed nothing, and the statement must say so without putting
// "reversed" next to "none". The oracle is extended two ways: every (stop, failing step) pair of a real engine, and an exhaustive sweep over
// every fact shape the contract can describe, with the keyword guard of the first publication plus the affirmative-claim regex.
const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('./support.cjs');
const C = require('../contract.js');

const affirmative = /\b(was|were|been|is) (cancelled|undone|rolled back|reversed)\b/i;
const keywords = /undone|rolled back|reversed|compensated|undo/i;
const negations = [/nothing was undone or rolled back\./gi, /nothing to undo/gi, /nothing is claimed as cancelled, completed or undone\./gi];
const strip = (text) => negations.reduce((out, pattern) => out.replace(pattern, ''), text);

function assertNoUndoClaimed(statement, undone, where) {
  if (undone.length === 0) {
    assert.doesNotMatch(strip(statement), keywords, `${where}: nothing was reversed but the statement says so: ${statement}`);
    assert.doesNotMatch(strip(statement), affirmative, `${where}: an affirmative claim without an undo: ${statement}`);
  } else {
    assert.ok(statement.includes(`${undone.join(', ')}`) && statement.includes('reversed by journaled compensating steps'), `${where}: the reversed steps must be listed: ${statement}`);
  }
}

for (const stopped of [1, 2, 3]) {
  for (let failing = stopped; failing >= 1; failing -= 1) {
    test(`a compensation failing at step ${failing} after a stop following step ${stopped} is described without a claim of an undo that did not happen`, async (t) => {
      const ctx = s.boot({ engine: { faults: { compensation: (step) => step === failing } } });
      t.after(() => ctx.cleanup());
      ctx.g.hold('before', stopped + 1);
      const actionId = await s.startAction(ctx);
      await ctx.g.reached('before', stopped + 1);
      const answer = await ctx.engine.execute(s.cancelCmd('cancel-key-0001', actionId, 1, true));
      const { body } = answer;
      assert.equal(body.outcome, 'CANCELLED_PARTIAL');
      assert.equal(body.facts.compensation, 'FAILED');
      const undone = body.facts.undone.map((e) => e.step);
      assert.equal(undone.length, stopped - failing);
      s.assertHonest(assert, body, ctx.engine.view().journal);
      assertNoUndoClaimed(body.statement, undone, `stop ${stopped} fail ${failing}`);
      if (undone.length === 0) assert.match(body.statement, /no compensating step took effect/);
      assert.equal(C.claimCheck(body).ok, true);
    });
  }
}

test('no statement the contract can produce claims an undo that its facts do not show (exhaustive over small fact shapes)', () => {
  const range = (from, to) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
  let checked = 0;
  for (let total = 1; total <= 4; total += 1) {
    for (let ran = 0; ran <= total; ran += 1) {
      for (let count = 0; count <= ran; count += 1) {
        for (const compensation of ['NOT_REQUESTED', 'FAILED', 'COMPLETE']) {
          const undone = range(ran - count + 1, ran).reverse().map((step) => ({ step, units: 5 }));
          const standing = range(1, ran - count).map((step) => ({ step, units: 5 }));
          const facts = { totalSteps: total, effectsStanding: standing, stepsNotRun: range(ran + 1, total), unknownSteps: [], undone, standingUnits: standing.length * 5, standingUnitsExact: true,
            compensation, compensationFailure: compensation === 'FAILED' ? { step: ran - count, reason: 'SYNTHETIC_FAULT' } : null };
          for (const outcome of C.OUTCOMES.filter((name) => name !== 'CANCEL_UNKNOWN')) {
            const body = { outcome, facts, effective: C.EFFECTIVE.includes(outcome), actionStopped: outcome !== 'CANCEL_TOO_LATE', actionCompleted: outcome === 'CANCEL_TOO_LATE',
              nothingUndone: undone.length === 0, statement: C.describe(outcome, facts) };
            if (!C.claimCheck(body).ok) continue;
            checked += 1;
            assertNoUndoClaimed(body.statement, undone.map((e) => e.step), `${outcome} total ${total} ran ${ran} undone ${count} ${compensation}`);
          }
        }
      }
    }
  }
  assert.ok(checked >= 40, `only ${checked} fact shapes were described`);
});
