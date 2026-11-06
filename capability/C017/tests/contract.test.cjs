'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../contract.js');

const valid = {
  start: { schemaVersion: 1, kind: 'start', key: 'valid-key-0001', ...C.identity, expectedEpoch: 0 },
  cancel: { schemaVersion: 1, kind: 'cancel', key: 'valid-key-0002', ...C.identity, actionId: 'act-1-0000000a', epoch: 1, compensate: false },
  reconcile: { schemaVersion: 1, kind: 'reconcile', key: 'valid-key-0003', ...C.identity, actionId: 'act-1-0000000a', epoch: 1 },
};
const codes = (result) => result.details.map((d) => `${d.path}:${d.code}`);

test('the three closed command schemas accept exactly their fields and return frozen clean copies', () => {
  for (const [kind, command] of Object.entries(valid)) {
    const result = C.validateCommand(command);
    assert.equal(result.ok, true, kind);
    assert.deepEqual(result.command, command);
    assert.equal(Object.isFrozen(result.command), true);
    assert.notEqual(result.command, command);
  }
  assert.equal(C.validateCommand(Object.assign(Object.create(null), valid.start)).ok, true);
});

const bad = [
  ['null', null, '$:NOT_AN_OBJECT'], ['array', [], '$:NOT_AN_OBJECT'], ['number', 7, '$:NOT_AN_OBJECT'], ['class instance', new (class Cmd {})(), '$:NOT_AN_OBJECT'],
  ['unknown kind', { ...valid.cancel, kind: 'undo' }, 'kind:UNKNOWN_KIND'], ['object kind', { ...valid.cancel, kind: {} }, 'kind:UNKNOWN_KIND'],
  ['proto kind', { ...valid.cancel, kind: '__proto__' }, 'kind:UNKNOWN_KIND'],
  ['forged outcome', { ...valid.cancel, outcome: 'COMPENSATED' }, 'outcome:EXTRA_FIELD'], ['forged undone', { ...valid.cancel, undone: [] }, 'undone:EXTRA_FIELD'],
  ['forged status', { ...valid.cancel, status: 'CANCELLED' }, 'status:EXTRA_FIELD'],
  ['long extra name', { ...valid.cancel, ['x'.repeat(90)]: 1 }, `${'x'.repeat(40)}:EXTRA_FIELD`],
  ['missing key', (() => { const c = { ...valid.cancel }; delete c.key; return c; })(), 'key:MISSING_FIELD'],
  ['version 2', { ...valid.cancel, schemaVersion: 2 }, 'schemaVersion:BAD_VERSION'], ['no version', (() => { const c = { ...valid.cancel }; delete c.schemaVersion; return c; })(), 'schemaVersion:BAD_VERSION'],
  ['string epoch', { ...valid.cancel, epoch: '1' }, 'epoch:BAD_VALUE'], ['fraction epoch', { ...valid.cancel, epoch: 1.5 }, 'epoch:BAD_VALUE'],
  ['negative zero epoch', { ...valid.cancel, epoch: -0 }, 'epoch:BAD_VALUE'], ['zero epoch', { ...valid.cancel, epoch: 0 }, 'epoch:BAD_VALUE'],
  ['huge epoch', { ...valid.cancel, epoch: 1e9 }, 'epoch:BAD_VALUE'], ['NaN epoch', { ...valid.cancel, epoch: NaN }, 'epoch:BAD_VALUE'],
  ['negative expected epoch', { ...valid.start, expectedEpoch: -1 }, 'expectedEpoch:BAD_VALUE'],
  ['string boolean', { ...valid.cancel, compensate: 'true' }, 'compensate:BAD_VALUE'], ['number boolean', { ...valid.cancel, compensate: 1 }, 'compensate:BAD_VALUE'],
  ['short key', { ...valid.cancel, key: 'short' }, 'key:BAD_VALUE'], ['long key', { ...valid.cancel, key: 'k'.repeat(65) }, 'key:BAD_VALUE'],
  ['key with a space', { ...valid.cancel, key: 'has space in it' }, 'key:BAD_VALUE'], ['key with a newline', { ...valid.cancel, key: 'valid-key-0001\n' }, 'key:BAD_VALUE'],
  ['script action', { ...valid.cancel, actionId: '<script>' }, 'actionId:BAD_VALUE'], ['uppercase hex action', { ...valid.cancel, actionId: 'act-1-ABCDEF01' }, 'actionId:BAD_VALUE'],
  ['unicode lease', { ...valid.cancel, leaseId: 'lease-ünï' }, 'leaseId:BAD_VALUE'], ['numeric user', { ...valid.cancel, userId: 5 }, 'userId:BAD_VALUE'],
  ['bad run', { ...valid.cancel, runId: 'run-1' }, 'runId:BAD_VALUE'],
];
for (const [name, value, expected] of bad) {
  test(`a hostile command is refused with a closed code: ${name}`, () => {
    const result = C.validateCommand(value);
    assert.equal(result.ok, false);
    assert.ok(codes(result).includes(expected), `${codes(result)} should include ${expected}`);
  });
}

test('an own __proto__ key from JSON.parse is an extra field and pollutes nothing', () => {
  const parsed = JSON.parse(JSON.stringify(valid.cancel).replace('{', '{"__proto__":{"polluted":true},'));
  const result = C.validateCommand(parsed);
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('__proto__:EXTRA_FIELD'));
  assert.equal({}.polluted, undefined);
});

test('every typed failure has a closed status, group and allowed recovery actions and claims nothing', () => {
  const groups = new Set(['input', 'identity', 'epoch', 'state', 'integrity', 'server']);
  for (const [code, entry] of Object.entries(C.failures)) {
    const { status, body } = C.failure(code, {});
    assert.equal(status, entry.status);
    assert.ok(groups.has(entry.group), code);
    assert.ok(entry.actions.length > 0 && entry.actions.every((a) => C.recovery.includes(a)), code);
    assert.deepEqual([body.kind, body.error.code, body.effectClaimed, body.journalWritten, body.outcome], ['C017-typed-failure', code, false, false, undefined]);
  }
  assert.equal(Object.keys(C.failures).length, 23);
});

test('a typed failure echoes only well-formed identifiers and never the caller text', () => {
  const evil = { leaseId: '<img onerror=1>', runId: 'synthetic-run-002', userId: 5, actionId: 'act-1-0000000a', epoch: 1.5 };
  const { body } = C.failure('UNKNOWN_ACTION', { requested: evil, details: [{ path: 'x', code: 'Y' }], current: { epoch: 1 } });
  assert.deepEqual(body.requested, { leaseId: null, runId: 'synthetic-run-002', userId: null, actionId: 'act-1-0000000a', epoch: null });
  assert.deepEqual(body.details, [{ path: 'x', code: 'Y' }]);
  assert.deepEqual(body.current, { epoch: 1 });
  assert.equal(C.failure('NOT_FOUND').body.current, null);
});

const facts = (o = {}) => ({ totalSteps: 4, effectsStanding: [{ step: 1, units: 5 }, { step: 2, units: 5 }], stepsNotRun: [3, 4], unknownSteps: [], undone: [], standingUnits: 10, standingUnitsExact: true, compensation: 'NOT_REQUESTED', compensationFailure: null, ...o });
const answer = (outcome, f, o = {}) => ({ outcome, facts: f, statement: C.describe(outcome, f), effective: C.EFFECTIVE.includes(outcome), actionStopped: outcome !== 'CANCEL_TOO_LATE', actionCompleted: outcome === 'CANCEL_TOO_LATE', nothingUndone: f.undone === null ? null : f.undone.length === 0, ...o });
const unknownFacts = facts({ unknownSteps: [3], stepsNotRun: [4], standingUnitsExact: false });
const nullFacts = { totalSteps: null, effectsStanding: null, stepsNotRun: null, unknownSteps: null, undone: null, standingUnits: null, standingUnitsExact: false, compensation: null, compensationFailure: null };
const good = {
  CANCELLED_BEFORE_EFFECT: answer('CANCELLED_BEFORE_EFFECT', facts({ effectsStanding: [], stepsNotRun: [1, 2, 3, 4], standingUnits: 0 })),
  CANCELLED_PARTIAL: answer('CANCELLED_PARTIAL', facts()),
  PARTIAL_FAILED: answer('CANCELLED_PARTIAL', facts({ effectsStanding: [{ step: 1, units: 5 }], undone: [{ step: 2, units: 5 }], standingUnits: 5, compensation: 'FAILED', compensationFailure: { step: 1, reason: 'SYNTHETIC_FAULT' } })),
  CANCEL_TOO_LATE: answer('CANCEL_TOO_LATE', facts({ effectsStanding: [1, 2, 3, 4].map((step) => ({ step, units: 5 })), stepsNotRun: [], standingUnits: 20 })),
  COMPENSATED: answer('COMPENSATED', facts({ effectsStanding: [], undone: [{ step: 2, units: 5 }, { step: 1, units: 5 }], standingUnits: 0, compensation: 'COMPLETE' })),
  CANCEL_UNKNOWN: answer('CANCEL_UNKNOWN', unknownFacts, { effective: false, actionStopped: null, nothingUndone: null }),
  UNREADABLE: answer('CANCEL_UNKNOWN', nullFacts, { effective: false, actionStopped: null, nothingUndone: null }),
};

test('the statement for each outcome is derived from the facts and claims no more than they prove', () => {
  assert.equal(C.describe('CANCELLED_BEFORE_EFFECT', good.CANCELLED_BEFORE_EFFECT.facts), 'Stopped before any step ran. No effect was produced, so there was nothing to undo.');
  assert.equal(good.CANCELLED_PARTIAL.statement, 'Stopped after step 2 of 4. Step(s) 1, 2 took effect and STAND (10 synthetic units); step(s) 3, 4 were NOT run. Nothing was undone or rolled back.');
  assert.match(good.PARTIAL_FAILED.statement, /^Stopped after step 2 of 4\. Compensating step 1 failed: step\(s\) 1 still STAND \(5 synthetic units\); step\(s\) 2 were reversed/);
  assert.match(good.CANCEL_TOO_LATE.statement, /^Too late: the action had already completed\. All 4 steps took effect and STAND \(20 synthetic units\)\. The cancel was NOT effective\.$/);
  assert.match(good.COMPENSATED.statement, /^Stopped after step 2 and reversed by journaled compensating steps 2, 1 .* No effect remains standing \(0 units\)\./);
  assert.match(good.CANCEL_UNKNOWN.statement, /^Cancel not confirmed: the state is UNKNOWN\. Step\(s\) 1, 2 are journaled as taken effect \(at least 10 synthetic units\); step\(s\) 3 may or may not have taken effect; step\(s\) 4 never ran\./);
  assert.match(good.UNREADABLE.statement, /^Cancel not confirmed: the state is UNKNOWN because the journal cannot be read\./);
  for (const outcome of C.OUTCOMES.filter((o) => o !== 'COMPENSATED')) {
    const text = C.describe(outcome, outcome === 'CANCEL_UNKNOWN' ? unknownFacts : good[outcome].facts);
    assert.doesNotMatch(text.replace(/Nothing was undone or rolled back\.|nothing to undo|Nothing is claimed as cancelled, completed or undone\./g, ''), /undone|rolled back|reversed/i, outcome);
  }
});

test('the three reconciliation determinations are worded from facts and never claim cancelled or completed', () => {
  const known = C.describeDetermination('INTERRUPTED_KNOWN', facts({ stepsNotRun: [3, 4] }));
  assert.match(known, /^Interrupted by a restart\. Journaled effects of step\(s\) 1, 2 STAND \(10 synthetic units\); step\(s\) 3, 4 never ran\. The action did not complete and was not cancelled; nothing was undone\.$/);
  assert.match(C.describeDetermination('INTERRUPTED_UNKNOWN', unknownFacts), /step\(s\) 3 have an UNKNOWN effect \(begun but not recorded as done\); step\(s\) 4 never ran/);
  assert.match(C.describeDetermination('CANCEL_UNKNOWN', unknownFacts), /^A cancel request raced the restart and was never decided: its outcome is UNKNOWN\./);
});

test('claimCheck accepts every consistent answer and the HTTP status of a non-effective answer is never 200', () => {
  for (const [name, body] of Object.entries(good)) assert.deepEqual(C.claimCheck(body), { ok: true, problems: [] }, name);
  assert.deepEqual(C.EFFECTIVE, ['CANCELLED_BEFORE_EFFECT', 'CANCELLED_PARTIAL', 'COMPENSATED']);
  assert.deepEqual([C.HTTP_STATUS.CANCEL_TOO_LATE, C.HTTP_STATUS.CANCEL_UNKNOWN], [409, 503]);
  assert.ok(C.OUTCOMES.every((o) => C.EFFECTIVE.includes(o) || C.HTTP_STATUS[o] >= 400));
});

const lies = [
  ['not an object', () => 7], ['unknown outcome', () => ({ ...good.CANCELLED_PARTIAL, outcome: 'CANCELLED' })], ['no facts', () => ({ outcome: 'CANCELLED_PARTIAL' })],
  ['effective flag flipped', () => ({ ...good.CANCEL_TOO_LATE, effective: true })], ['statement swapped', () => ({ ...good.CANCELLED_PARTIAL, statement: 'Cancelled.' })],
  ['unknown claims stopped', () => ({ ...good.CANCEL_UNKNOWN, actionStopped: true })], ['unknown claims nothing undone', () => ({ ...good.CANCEL_UNKNOWN, nothingUndone: true })],
  ['facts incomplete', () => answer('CANCELLED_PARTIAL', { ...facts(), undone: null })], ['steps do not partition', () => answer('CANCELLED_PARTIAL', facts({ stepsNotRun: [3] }))],
  ['unknown step in a known outcome', () => answer('CANCELLED_PARTIAL', facts({ unknownSteps: [3], stepsNotRun: [4] }))],
  ['units do not add up', () => answer('CANCELLED_PARTIAL', facts({ standingUnits: 11 }))], ['nothingUndone lies', () => ({ ...good.COMPENSATED, nothingUndone: true })],
  ['before-effect with a standing effect', () => answer('CANCELLED_BEFORE_EFFECT', facts())],
  ['partial with nothing standing', () => answer('CANCELLED_PARTIAL', facts({ effectsStanding: [], stepsNotRun: [3, 4, 1, 2], standingUnits: 0 }))],
  ['partial claiming complete compensation', () => answer('CANCELLED_PARTIAL', facts({ compensation: 'COMPLETE' }))],
  ['partial with an undo but no failure', () => answer('CANCELLED_PARTIAL', facts({ effectsStanding: [{ step: 1, units: 5 }], undone: [{ step: 2, units: 5 }], standingUnits: 5 }))],
  ['too late without completion', () => ({ ...good.CANCEL_TOO_LATE, actionCompleted: false })], ['too late with an undo', () => answer('CANCEL_TOO_LATE', facts({ effectsStanding: [{ step: 1, units: 5 }, { step: 2, units: 5 }, { step: 3, units: 5 }], undone: [{ step: 4, units: 5 }], stepsNotRun: [], standingUnits: 15 }), { actionCompleted: true })],
  ['compensated with a standing effect', () => answer('COMPENSATED', facts({ undone: [{ step: 2, units: 5 }], stepsNotRun: [3, 4], effectsStanding: [{ step: 1, units: 5 }], standingUnits: 5, compensation: 'COMPLETE' }))],
  ['compensated without a compensating step', () => answer('COMPENSATED', facts({ effectsStanding: [], stepsNotRun: [1, 2, 3, 4], standingUnits: 0 }))],
];
for (const [name, make] of lies) {
  test(`claimCheck refuses an answer that overstates: ${name}`, () => {
    const result = C.claimCheck(make());
    assert.equal(result.ok, false);
    assert.ok(result.problems.length >= 1);
  });
}

test('the exports are frozen and the UMD loads as a browser global without module', () => {
  assert.equal(Object.isFrozen(C), true);
  assert.equal(Object.isFrozen(C.failures), true);
  assert.throws(() => { 'use strict'; C.OUTCOMES.push('X'); });
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const { pathToFileURL } = require('node:url');
  const file = path.join(__dirname, '..', 'contract.js');
  const context = vm.createContext({});
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: pathToFileURL(file).href }).runInContext(context);
  assert.equal(vm.runInContext('typeof C017Contract.describe', context), 'function');
});
