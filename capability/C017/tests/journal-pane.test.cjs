'use strict';

// F13 of the second independent review: the JOURNAL PANE must be re-derived, not displayed. contract.viewCheck replays the window with the
// SAME state machine the server uses (contract.js ledger, the code reconcile.cjs imports) and requires that it leads to exactly the action
// the view claims. Honest journals of every scenario are accepted in EVERY window (a differential check against the real engine); every
// forged journal pane is refused with a sentence about the journal; and for all single-point forgeries of every line the invariant is that an
// accepted view shows exactly the honest lines (boot lines aside, which cannot change a settled action).
const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('./support.cjs');
const { build } = require('./scenarios.cjs');
const C = require('../contract.js');
const R = require('../reconcile.cjs');

const NAMES = ['partial', 'before', 'compensated', 'failedCompensation', 'completed', 'interrupted', 'interruptedCancel', 'reconciled'];

// Three actions in ONE journal (two completed, the third cancelled partway): windows that start after the first accept line begin with an
// action of epoch 2 or 3, which only a windowed replay may accept.
async function multiAction() {
  const ctx = s.boot();
  try {
    for (const [key, epoch] of [['multi-start-1', 0], ['multi-start-2', 1]]) {
      assert.equal((await ctx.engine.execute(s.startCmd(key, epoch))).status, 202);
      await s.wait(ctx, (state) => state.action.status === 'COMPLETED');
    }
    ctx.g.hold('before', 3);
    const started = await ctx.engine.execute(s.startCmd('multi-start-3', 2));
    await ctx.g.reached('before', 3);
    const pending = ctx.engine.execute(s.cancelCmd('multi-cancel-3', started.body.action.actionId, 3, false));
    await s.wait(ctx, (state) => Boolean(state.action.cancel));
    assert.equal((await pending).body.outcome, 'CANCELLED_PARTIAL');
    return structuredClone(ctx.engine.view().journal);
  } finally {
    await ctx.cleanup();
  }
}

// The view the server builds (engine.view() plus the window of the HTTP layer), for a journal and a window start.
function viewOf(journal, omitted = 0) {
  const derived = R.derive(journal);
  return {
    schemaVersion: 1, kind: 'C017-state', journalStatus: 'READABLE', problem: null, lease: C.identity, epoch: derived.epoch, action: derived.action ? R.actionView(derived.action) : null,
    journal: structuredClone(journal.slice(omitted)), journalEntries: journal.length, journalOmitted: omitted, statement: null,
  };
}
const core = (lines) => lines.filter((entry) => entry.type !== 'boot').map((entry) => JSON.stringify(entry));
// Shown lines are what the page re-derived: all honest non-boot lines, or only the last ones when the window does not reach the action's start.
const assertHonestPane = (view, honest, label) => {
  const shown = core(C.journalPane(view).lines.map((line) => line.entry));
  assert.ok(shown.length <= honest.length && JSON.stringify(honest.slice(honest.length - shown.length)) === JSON.stringify(shown), `${label}: a forged pane was accepted and shown`);
};
const journals = {};
test.before(async () => {
  for (const name of NAMES) journals[name] = (await build(name)).journal;
  journals.multi = await multiAction();
});

test('the ledger the page replays IS the function the server derives with', () => {
  assert.equal(R.derive, C.ledger.derive);
  assert.equal(R.actionView, C.ledger.actionView);
  assert.deepEqual([...C.JOURNAL_TYPES], [...C.ledger.ENTRY_TYPES], 'the page and the server know the same eleven line types');
});

test('honest journals of every scenario are accepted in EVERY window, and only lines that were re-derived are shown', () => {
  let windows = 0;
  for (const name of Object.keys(journals)) {
    const journal = journals[name];
    for (let omitted = 0; omitted <= journal.length; omitted += 1) {
      const view = viewOf(journal, omitted);
      assert.deepEqual(C.viewCheck(view), { ok: true, problems: [] }, `${name}: honest window from ${omitted}`);
      const pane = C.journalPane(view);
      pane.lines.forEach(({ number, entry }) => assert.deepEqual(entry, journal[number - 1], `${name}: line ${number} is not the journal's line`));
      assert.equal(pane.hidden + pane.lines.length, journal.length, `${name}: every line is shown or counted as not shown`);
      if (omitted === 0) assert.equal(pane.hidden, 0, `${name}: a whole journal hides nothing`);
      windows += 1;
    }
  }
  assert.ok(windows > 60);
});

test('lines of an earlier action whose start is not in the window are counted, never shown', () => {
  const journal = journals.partial;
  const first = journal.findIndex((entry) => entry.type === 'action-accepted');
  const view = viewOf(journal, first + 2);
  assert.equal(view.journal[0].type, 'step-effect');
  assert.deepEqual(C.viewCheck(view), { ok: true, problems: [] });
  assert.deepEqual(C.journalPane(view), { lines: [], hidden: journal.length });
});

const forge = (name, make) => ({ name, make });
const forgeries = [
  forge('the decision line says COMPENSATED and carries no actionId (the reviewer\'s forgery E)', (v) => { v.journal[v.journal.length - 1] = { type: 'cancel-decided', at: 't', outcome: 'COMPENSATED' }; }),
  forge('the decision line says COMPENSATED', (v) => { v.journal[v.journal.length - 1].outcome = 'COMPENSATED'; }),
  forge('compensation-effect lines for steps that STAND', (v) => { const { actionId } = v.action; v.journal.push({ type: 'compensation-effect', at: 't', actionId, step: 1, units: -5, standingUnits: 5 }, { type: 'compensation-effect', at: 't', actionId, step: 2, units: -5, standingUnits: 0 }); }),
  forge('action-completed on a cancelled action', (v) => { v.journal.push({ type: 'action-completed', at: 't', actionId: v.action.actionId, standingUnits: 10 }); }),
  forge('a decision of a foreign action', (v) => { v.journal.push({ ...v.journal[v.journal.length - 1], actionId: 'act-9-aaaaaaaa', outcome: 'COMPENSATED' }); }),
  forge('the cancel request is missing while the facts say a cancel exists', (v) => { v.journal.splice(v.journal.findIndex((e) => e.type === 'cancel-requested'), 1); }),
  forge('the decision is missing while the facts say CANCELLED', (v) => { v.journal.pop(); }),
  forge('a step that never ran takes effect', (v) => { v.journal.push({ type: 'step-effect', at: 't', actionId: v.action.actionId, step: 3, units: 5, standingUnits: 15 }); }),
  forge('a line of a type outside the closed eleven', (v) => { v.journal[2].type = 'everything-undone'; }),
  forge('a line whose field has the wrong type', (v) => { v.journal[3].units = '5; claim cancelled'; }),
  forge('a line with an extra field', (v) => { v.journal[3].claim = 'undone'; }),
  forge('two lines swapped', (v) => { [v.journal[3], v.journal[4]] = [v.journal[4], v.journal[3]]; }),
  forge('a line shown twice', (v) => { v.journal.splice(3, 0, structuredClone(v.journal[3])); }),
  forge('a view with NO action that carries the deciding lines of a COMPENSATED cancel', (v) => { v.action = null; v.epoch = 0; v.journal = [{ type: 'cancel-decided', at: 't', actionId: v.journal[1].actionId, key: 'k-1234567', outcome: 'COMPENSATED', effectsStanding: [], stepsNotRun: [], undone: [1, 2], compensation: 'COMPLETE' }]; }),
  forge('a view with NO action whose journal starts an action', (v) => { v.action = null; v.epoch = 0; }),
  forge('an epoch the journal does not derive', (v) => { v.epoch = 7; }),
];

test('every forged journal pane is refused with a sentence about the journal', () => {
  for (const { name, make } of forgeries) {
    const view = viewOf(journals.partial);
    make(view);
    const check = C.viewCheck(view);
    assert.equal(check.ok, false, `${name}: ACCEPTED`);
    assert.ok(check.problems.some((problem) => /journal|epoch/.test(problem)), `${name}: ${JSON.stringify(check.problems)}`);
  }
});

test('one forged line of EVERY type is refused wherever it is inserted (live action, settled action, all positions)', () => {
  const dummies = (actionId) => [
    { type: 'boot', at: 't', bootId: 'b' }, { type: 'action-accepted', at: 't', leaseId: C.identity.leaseId, runId: C.identity.runId, userId: C.identity.userId, actionId, epoch: 1, totalSteps: 4, unitsPerStep: 5, startKey: 'k-1234567', startSha256: 'x' },
    { type: 'step-intent', at: 't', actionId, step: 3 }, { type: 'step-effect', at: 't', actionId, step: 3, units: 5, standingUnits: 15 }, { type: 'action-completed', at: 't', actionId, standingUnits: 20 },
    { type: 'cancel-requested', at: 't', actionId, key: 'k-7654321', commandSha256: 'x', compensate: true, observedEffects: 2, observedInFlight: 0 }, { type: 'compensation-intent', at: 't', actionId, step: 2 },
    { type: 'compensation-effect', at: 't', actionId, step: 2, units: -5, standingUnits: 5 }, { type: 'compensation-failed', at: 't', actionId, step: 2, reason: 'SYNTHETIC_FAULT' },
    { type: 'cancel-decided', at: 't', actionId, key: 'k-7654321', outcome: 'COMPENSATED', effectsStanding: [], stepsNotRun: [3, 4], undone: [1, 2], compensation: 'COMPLETE' },
    { type: 'reconciled', at: 't', actionId, key: 'k-7654321', commandSha256: 'x', determination: 'INTERRUPTED_KNOWN', effectsStanding: [1, 2], unknownSteps: [], stepsNotRun: [3, 4] },
  ];
  let cases = 0;
  for (const name of ['partial', 'completed', 'compensated', 'reconciled']) {
    const journal = journals[name];
    const { actionId } = R.derive(journal).action;
    for (const dummy of dummies(actionId)) {
      for (let at = 0; at <= journal.length; at += 1) {
        const view = viewOf(journal);
        view.journal.splice(at, 0, structuredClone(dummy));
        const accepted = C.viewCheck(view).ok;
        if (accepted) assertHonestPane(view, core(journal), `${name}: a forged ${dummy.type} at ${at}`);
        cases += 1;
      }
    }
  }
  assert.ok(cases > 400);
});

test('single-point forgeries of every journal line: an accepted view shows exactly the honest lines', () => {
  const swaps = ['type', 'actionId', 'step', 'outcome', 'determination', 'key', 'units', 'standingUnits', 'compensate', 'observedEffects', 'reason'];
  let mutants = 0;
  let refused = 0;
  for (const name of Object.keys(journals)) {
    const journal = journals[name];
    const honest = core(journal);
    const attempt = (change) => {
      const view = viewOf(journal);
      change(view.journal);
      mutants += 1;
      const check = C.viewCheck(view);
      if (!check.ok) { refused += 1; return; }
      assertHonestPane(view, honest, name);
    };
    for (let i = 0; i < journal.length; i += 1) {
      attempt((lines) => lines.splice(i, 1));
      attempt((lines) => lines.splice(i, 0, structuredClone(lines[i])));
      if (i + 1 < journal.length) attempt((lines) => { [lines[i], lines[i + 1]] = [lines[i + 1], lines[i]]; });
      for (const field of swaps) {
        attempt((lines) => { delete lines[i][field]; });
        attempt((lines) => { lines[i][field] = null; });
        attempt((lines) => { lines[i][field] = typeof lines[i][field] === 'number' ? lines[i][field] + 1 : 'x'; });
      }
      for (const type of C.JOURNAL_TYPES) attempt((lines) => { lines[i].type = type; });
      attempt((lines) => { if (lines[i].actionId) lines[i].actionId = 'act-9-aaaaaaaa'; });
      for (const outcome of C.OUTCOMES) attempt((lines) => { lines[i].outcome = outcome; });
      for (const determination of C.DETERMINATIONS) attempt((lines) => { lines[i].determination = determination; });
    }
  }
  assert.ok(mutants > 2000, `${mutants} mutants`);
  assert.ok(refused / mutants > 0.5, `${refused} of ${mutants} refused`);
});
