'use strict';

// A sibling of F4 found while fixing it: after an interruption in the MIDDLE of a compensation the facts list the journaled reversal
// (undone [2]) but the reconcile statement said "nothing was undone". A statement must never deny a reversal the journal proves.
const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('./support.cjs');
const C = require('../contract.js');

test('an interruption in the middle of a compensation is reconciled with the journaled reversal named, never as "nothing was undone"', async (t) => {
  const first = s.boot();
  first.g.hold('before', 3);
  first.g.hold('comp', 1);
  const actionId = await s.startAction(first);
  await first.g.reached('before', 3);
  const pending = first.engine.execute(s.cancelCmd('cancel-key-0001', actionId, 1, true)).catch(() => null);
  await first.g.reached('comp', 1);
  await first.engine.close();
  await pending;
  const second = s.boot({ dir: first.dir });
  t.after(async () => { await second.cleanup(); await first.cleanup(); });
  const view = second.engine.view().action;
  assert.equal(view.status, 'INTERRUPTED');
  assert.deepEqual(view.undone.map((e) => e.step), [2], 'the journal proves that step 2 was reversed');
  assert.deepEqual(view.unknownSteps, [1]);
  const settled = await second.engine.execute(s.reconcileCmd('reconcile-key-01', actionId));
  assert.equal(settled.status, 200);
  assert.doesNotMatch(settled.body.statement, /nothing was undone/i);
  assert.match(settled.body.statement, /step\(s\) 2 were reversed by journaled compensating steps before the interruption/);
  assert.deepEqual(C.reconcileCheck(settled.body), { ok: true, problems: [] });
});

test('a reconcile statement says that nothing was undone only when its facts list no reversal (exhaustive over small fact shapes)', () => {
  let checked = 0;
  for (const determination of C.DETERMINATIONS) {
    for (const undone of [[], [{ step: 2, units: 5 }], [{ step: 3, units: 5 }, { step: 2, units: 5 }]]) {
      for (const unknownSteps of [[], [1]]) {
        const facts = { totalSteps: 4, effectsStanding: [], stepsNotRun: [4], unknownSteps, undone, standingUnits: 0, standingUnitsExact: unknownSteps.length === 0, compensation: 'INTERRUPTED', compensationFailure: null };
        const text = C.describeDetermination(determination, facts);
        checked += 1;
        if (undone.length) {
          assert.doesNotMatch(text, /nothing was undone/i, `${determination}: ${text}`);
          assert.ok(text.includes(`step(s) ${undone.map((e) => e.step).join(', ')} were reversed by journaled compensating steps before the interruption`), text);
        } else assert.match(text, /nothing was undone\.$/);
      }
    }
  }
  assert.equal(checked, 18);
});
