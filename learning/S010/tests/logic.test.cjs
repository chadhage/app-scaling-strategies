'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_EVENTS, RehearsalInputError, createRun, applyEvent, parseEvent, snapshot, evaluate,
} = require('..\\rehearsal.js');

const observe = { type: 'observe' };
const revert = { type: 'revert-flag' };
const flag = (cohort = 'pilot', enabled = true, configVersion = 1) => ({
  type: 'publish-flag', cohort, enabled, configVersion,
});
const state = (stateVersion, clientId = 'pilot-1') => ({
  type: 'set-state-version', clientId, stateVersion,
});
const sequence = (...events) => events.reduce(applyEvent, createRun());
function inputError(action, code) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof RehearsalInputError);
    assert.equal(error.code, code);
    assert.match(error.message, /\S/);
    return true;
  });
}
function last(run) {
  const trace = snapshot(run).trace;
  assert.ok(trace.length > 0, 'an admitted event must produce a trace record');
  return trace.at(-1);
}

test('fresh runs are independent and explicitly versioned', () => {
  const first = createRun();
  const second = createRun();
  assert.deepEqual(first, { schemaVersion: 1, events: [] });
  assert.notEqual(first, second);
  first.events.push(observe);
  assert.equal(second.events.length, 0);
});

test('initial snapshot names one predeployed code and four stable synthetic sessions', () => {
  const view = snapshot(createRun());
  assert.equal(view.deploymentId, 'synthetic-deployment-S010');
  assert.equal(view.codeVersion, 'compatible-code-1');
  assert.deepEqual(view.clients.map((client) => client.id),
    ['pilot-1', 'pilot-2', 'control-1', 'control-2']);
  assert.ok(view.clients.every((client) => client.stateVersion === 1 && client.cartCount === 1));
  assert.equal(evaluate(createRun()).status, 'NOT_RUN');
  assert.equal(evaluate(createRun()).nativeEvidence, false);
});

test('off baseline produces four standard successful journeys and one effect per session', () => {
  const run = sequence(observe);
  const record = last(run);
  assert.equal(record.observations.length, 4);
  assert.ok(record.observations.every((item) => item.ok && item.behavior === 'standard'));
  assert.ok(snapshot(run).clients.every((client) => client.effects === 1 && client.cartCount === 2));
  assert.deepEqual(evaluate(run).counts,
    { attempted: 4, successful: 4, interrupted: 0, guardedPublications: 0 });
});

for (const cohort of ['pilot', 'control']) {
  test(`activation changes only the stable ${cohort} cohort`, () => {
    const run = sequence(observe, flag(cohort), observe);
    assert.equal(snapshot(run).config.enabled, true);
    const responses = last(run).observations;
    assert.equal(responses.length, 4);
    for (const response of responses) {
      assert.equal(response.behavior, response.cohort === cohort ? 'enhanced' : 'standard');
      assert.equal(response.ok, true);
    }
  });
}

test('publishing off changes behavior without resetting sessions or data', () => {
  const run = sequence(observe, flag(), observe, flag('pilot', false), observe);
  assert.equal(snapshot(run).config.enabled, false);
  assert.equal(snapshot(run).config.revision, 2);
  assert.ok(snapshot(run).clients.every((client) => client.effects === 3 && client.cartCount === 4));
  assert.ok(last(run).observations.every((item) => item.behavior === 'standard'));
});

test('explicit reversal turns the flag off on the same deployment', () => {
  const run = sequence(observe, flag(), observe, revert, observe);
  assert.equal(evaluate(run).status, 'PASS');
  assert.equal(snapshot(run).trace.length, 5);
  assert.ok(snapshot(run).trace.every((event) => event.deploymentId === 'synthetic-deployment-S010'));
  assert.ok(last(run).observations.every((item) => item.behavior === 'standard'));
  assert.equal(evaluate(run).deploymentChanges, 0);
  assert.equal(evaluate(run).transitionOutcome, 'not-evidence-of-deployment-migration');
});

test('session tokens, cart IDs, prior data and exact effect counts survive all phases', () => {
  const initial = snapshot(createRun()).clients;
  const run = sequence(observe, flag(), observe, revert, observe);
  assert.deepEqual(snapshot(run).clients.map((client) => ({
    id: client.id, sessionToken: client.sessionToken, cartId: client.cartId,
  })), initial.map((client) => ({
    id: client.id, sessionToken: client.sessionToken, cartId: client.cartId,
  })));
  assert.ok(snapshot(run).clients.every((client) => client.cartCount === 4 && client.effects === 3));
  assert.equal(evaluate(run).counts.attempted, 12);
  assert.equal(evaluate(run).counts.successful, 12);
});

test('changing desired flags alone is not observed continuity', () => {
  const verdict = evaluate(sequence(flag(), revert));
  assert.equal(verdict.status, 'IN_PROGRESS');
  assert.equal(verdict.counts.attempted, 0);
  assert.deepEqual(verdict.missing, ['baseline', 'cohort', 'reversal']);
});

test('reversal requires a subsequent observed off journey', () => {
  const verdict = evaluate(sequence(observe, flag(), observe, revert));
  assert.equal(verdict.status, 'IN_PROGRESS');
  assert.deepEqual(verdict.missing, ['reversal']);
});

test('a missing baseline cannot be replaced by a later off observation', () => {
  const verdict = evaluate(sequence(flag(), observe, revert, observe));
  assert.equal(verdict.status, 'IN_PROGRESS');
  assert.deepEqual(verdict.missing, ['baseline']);
});

test('an off publication after observed activation also rehearses reversal', () => {
  const verdict = evaluate(sequence(observe, flag(), observe, flag('pilot', false), observe));
  assert.equal(verdict.status, 'PASS');
});

test('configuration v2 is guarded without exposure or a false success', () => {
  const run = sequence(flag('pilot', true, 2));
  const record = last(run);
  assert.equal(record.status, 'guarded');
  assert.equal(record.code, 'CONFIG_VERSION_UNSUPPORTED');
  assert.equal(record.input.configVersion, 2);
  assert.deepEqual(record.configBefore, record.configAfter);
  assert.equal(snapshot(run).config.enabled, false);
  assert.equal(evaluate(run).status, 'GUARDED');
  assert.equal(evaluate(run).userOutcome, 'safe abort before exposure');
  assert.equal(evaluate(run).counts.guardedPublications, 1);
});

test('incompatible session state gates activation before exposure', () => {
  const run = sequence(state(2), flag());
  const record = last(run);
  assert.equal(record.status, 'guarded');
  assert.equal(record.code, 'STATE_VERSION_UNSUPPORTED');
  assert.match(record.message, /pilot-1/);
  assert.equal(snapshot(run).config.enabled, false);
  assert.equal(snapshot(run).clients[0].stateVersion, 2);
  assert.equal(evaluate(run).counts.attempted, 0);
});

test('incompatible control state also gates a pilot publication', () => {
  const run = sequence(state(2, 'control-1'), flag());
  assert.equal(last(run).code, 'STATE_VERSION_UNSUPPORTED');
  assert.equal(snapshot(run).config.enabled, false);
});

test('a post-activation state fault interrupts only the incompatible session without a write', () => {
  const run = sequence(observe, flag(), state(2), observe);
  const record = last(run);
  assert.equal(record.status, 'interrupted');
  assert.equal(record.observations.length, 4);
  const failed = record.observations.find((item) => item.clientId === 'pilot-1');
  assert.equal(failed.ok, false);
  assert.equal(failed.code, 'STATE_VERSION_UNSUPPORTED');
  assert.equal(failed.beforeCount, failed.afterCount);
  assert.equal(record.observations.filter((item) => item.ok).length, 3);
  assert.equal(evaluate(run).status, 'FAIL');
  assert.deepEqual(evaluate(run).counts,
    { attempted: 8, successful: 7, interrupted: 1, guardedPublications: 0 });
});

test('reverting the flag does not pretend to downgrade incompatible state', () => {
  const run = sequence(observe, flag(), state(2), observe, revert, observe);
  assert.equal(snapshot(run).config.enabled, false);
  assert.equal(snapshot(run).clients[0].stateVersion, 2);
  assert.equal(evaluate(run).counts.interrupted, 2);
  assert.equal(evaluate(run).status, 'FAIL');
  assert.equal(evaluate(run).userOutcome, 'synthetic interruption observed');
});

test('restoring the state fixture and later success cannot erase prior failures or denominator', () => {
  const run = sequence(observe, flag(), observe, state(2), observe, revert, state(1), observe);
  const verdict = evaluate(run);
  assert.equal(verdict.status, 'FAIL');
  assert.equal(verdict.counts.attempted, 16);
  assert.equal(verdict.counts.successful, 15);
  assert.equal(verdict.counts.interrupted, 1);
  assert.equal(last(run).status, 'applied');
  assert.equal(snapshot(run).clients[0].effects, 3);
  assert.equal(snapshot(run).trace.filter((record) => record.status === 'interrupted').length, 1);
});

test('guarded attempts remain visible even after a later complete happy sequence', () => {
  const run = sequence(flag('pilot', true, 2), observe, flag(), observe, revert, observe);
  assert.equal(evaluate(run).status, 'GUARDED');
  assert.equal(evaluate(run).counts.guardedPublications, 1);
  assert.equal(evaluate(run).counts.interrupted, 0);
});

test('a guard after exposure does not incorrectly claim abort before exposure', () => {
  const run = sequence(observe, flag(), observe, flag('pilot', true, 2));
  assert.equal(evaluate(run).status, 'GUARDED');
  assert.equal(evaluate(run).userOutcome, 'publication blocked; prior exposure retained');
});

test('same explicit events produce the same deterministic snapshot and verdict', () => {
  const events = [observe, flag(), observe, state(2), observe, revert, state(1), observe];
  assert.equal(snapshot(sequence(...events)).trace.length, events.length);
  assert.deepEqual(snapshot(sequence(...events)), snapshot(sequence(...events)));
  assert.deepEqual(evaluate(sequence(...events)), evaluate(sequence(...events)));
  assert.deepEqual(snapshot(sequence(...events)).trace.map((record) => record.sequence),
    events.map((_, index) => index + 1));
});

test('admitting an event does not mutate prior run or caller input', () => {
  const previous = createRun();
  const event = flag();
  const next = applyEvent(previous, event);
  assert.equal(previous.events.length, 0);
  assert.equal(next.events.length, 1);
  event.enabled = false;
  assert.equal(snapshot(next).config.enabled, true);
  const view = snapshot(next);
  view.clients[0].cartCount = 999;
  assert.equal(snapshot(next).clients[0].cartCount, 1);
});

test('reset through a fresh run leaves an independently readable prior result', () => {
  const prior = sequence(observe, flag(), state(2), observe);
  const archive = { snapshot: snapshot(prior), verdict: evaluate(prior) };
  const fresh = createRun();
  assert.equal(archive.verdict.status, 'FAIL');
  assert.equal(archive.snapshot.trace.length, 4);
  assert.equal(snapshot(fresh).config.enabled, false);
  assert.equal(snapshot(fresh).trace.length, 0);
  assert.equal(evaluate(fresh).status, 'NOT_RUN');
});

test('valid JSON preserves primitive types and canonical event fields', () => {
  const text = '{"type":"publish-flag","cohort":"pilot","enabled":false,"configVersion":1}';
  assert.deepEqual(parseEvent(text), flag('pilot', false));
});

for (const text of ['', ' ', '{', '{"type":', '{"type":"observe",}']) {
  test(`malformed JSON ${JSON.stringify(text)} has an explicit parse error`, () => {
    inputError(() => parseEvent(text), 'ERR_EVENT_JSON');
  });
}
for (const value of [null, 1, false, {}, []]) {
  test(`JSON editor rejects non-string ${JSON.stringify(value)}`, () => {
    inputError(() => parseEvent(value), 'ERR_EVENT_INPUT');
  });
}
test('oversized JSON is rejected before parsing', () => {
  inputError(() => parseEvent(' '.repeat(2001)), 'ERR_EVENT_INPUT');
});
for (const event of [null, [], 1, false, new Date(0)]) {
  test(`event must be a plain object (${Object.prototype.toString.call(event)})`, () => {
    inputError(() => applyEvent(createRun(), event), 'ERR_EVENT_INPUT');
  });
}
for (const value of ['true', 1, null, [], {}]) {
  test(`enabled is a boolean, never coerced from ${JSON.stringify(value)}`, () => {
    inputError(() => applyEvent(createRun(), { ...flag(), enabled: value }), 'ERR_EVENT_INPUT');
  });
}
for (const value of ['1', 0, 3, 1.5, NaN, Infinity, null, true]) {
  test(`config version is a named integer fixture, not ${String(value)}`, () => {
    inputError(() => applyEvent(createRun(), flag('pilot', true, value)), 'ERR_EVENT_INPUT');
  });
}
for (const value of ['1', 0, 3, 1.5, NaN, Infinity, null, false]) {
  test(`state version is a named integer fixture, not ${String(value)}`, () => {
    inputError(() => applyEvent(createRun(), state(value)), 'ERR_EVENT_INPUT');
  });
}
test('unknown cohort, client, operation, missing fields, and extra fields are explicit errors', () => {
  inputError(() => applyEvent(createRun(), flag('everyone')), 'ERR_EVENT_INPUT');
  inputError(() => applyEvent(createRun(), state(1, 'foreign-client')), 'ERR_EVENT_INPUT');
  inputError(() => applyEvent(createRun(), { type: 'deploy' }), 'ERR_EVENT_TYPE');
  inputError(() => applyEvent(createRun(), { type: 'publish-flag' }), 'ERR_EVENT_INPUT');
  inputError(() => parseEvent('{"type":"observe","extra":true}'), 'ERR_EVENT_INPUT');
  inputError(() => parseEvent('{"type":"observe","__proto__":{}}'), 'ERR_EVENT_INPUT');
});
test('unsupported run versions and malformed run state never fall back to success', () => {
  inputError(() => snapshot({ schemaVersion: 2, events: [] }), 'ERR_RUN_VERSION');
  for (const run of [null, [], {}, { schemaVersion: 1, events: null },
    { schemaVersion: 1, events: [], extra: true }]) {
    inputError(() => evaluate(run), 'ERR_RUN_INPUT');
  }
  inputError(() => snapshot({ schemaVersion: 1, events: [{ type: 'deploy' }] }), 'ERR_EVENT_TYPE');
});
test('invalid inputs do not mutate a valid run or conceal its prior result', () => {
  const run = sequence(observe, flag(), state(2), observe);
  const before = JSON.stringify(run);
  inputError(() => applyEvent(run, { ...flag(), enabled: 'false' }), 'ERR_EVENT_INPUT');
  assert.equal(JSON.stringify(run), before);
  assert.equal(evaluate(run).status, 'FAIL');
});
test('bounded event log rejects overflow explicitly without overwriting prior attempts', () => {
  assert.equal(MAX_EVENTS, 60);
  let run = createRun();
  for (let index = 0; index < MAX_EVENTS; index += 1) run = applyEvent(run, observe);
  assert.equal(run.events.length, MAX_EVENTS);
  inputError(() => applyEvent(run, observe), 'ERR_EVENT_LIMIT');
  assert.equal(evaluate(run).counts.attempted, MAX_EVENTS * 4);
  inputError(() => snapshot({ schemaVersion: 1, events: [...run.events, observe] }), 'ERR_RUN_INPUT');
});
