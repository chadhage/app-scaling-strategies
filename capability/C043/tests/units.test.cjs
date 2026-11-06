'use strict';

// The closed catalogs, the shared validators (preset shape, result envelope, catalog) and the page-side verifier. Every
// honesty rule of the envelope is attacked by a forged answer that must be rejected for exactly that rule.
const test = require('node:test');
const contract = require('../contract.js');
const validate = require('../validate.js');
const envelope = require('../envelope.js');
const verify = require('../verify.js');
const presets = require('../preset.cjs');
const c42 = require('../../C042/contract.js');
const { produceTranscript } = require('../transcript.cjs');
const {
  assert, boot, clock, doc, gate, inFlight, step, createMemoryIo,
} = require('./support.cjs');

const clone = (value) => JSON.parse(JSON.stringify(value));
const KEY = 'preset-run-0001';

async function samples() {
  const out = {};
  const plain = await boot();
  out.completed = await plain.runner.run(doc());
  out.replay = await plain.runner.run(doc());
  out.inspect = plain.runner.inspect(KEY);
  out.refusedCancel = await plain.runner.cancel(KEY);
  out.undo = plain.runner.unsupportedAction(KEY);
  out.conflict = await plain.runner.run(doc({ steps: [step(1), step(2, { units: 6 }), step(3)] }));
  out.invalid = await plain.runner.run(doc({ schemaVersion: 2 }));
  out.static = await plain.runner.run(doc({ idempotencyKey: 'preset-run-0002', bounds: { maxSteps: 4, maxDurationMs: 1000, maxUnits: 14 } }));
  out.missing = plain.runner.inspect('no-such-run-001');
  const small = await boot();
  out.failed = await small.runner.run(doc({ idempotencyKey: 'preset-run-0003', steps: [step(1, { leaseId: 'synthetic-lease-002', units: 6 }), step(4, { leaseId: 'synthetic-lease-002', units: 6 }), step(5)] }));
  const clk = clock();
  const slow = await boot({ clk, executor: async () => { clk.advance(600); } });
  out.bounded = await slow.runner.run(doc());
  const interrupted = await boot({ executor: async ({ key }) => { if (key === 'preset-a-step-2') throw new Error('x'); } });
  out.interrupted = await interrupted.runner.run(doc());
  out.cancelled = await interrupted.runner.cancel(KEY);
  const held = gate();
  const live = await boot({ executor: held.executor });
  const running = live.runner.run(doc());
  await inFlight(held, 'preset-a-step-1', [running]);
  out.running = live.runner.inspect(KEY);
  live.runner.halt();
  live.real.halt();
  await running;
  return out;
}

const tamper = (base, change) => { const copy = clone(base); change(copy); return copy; };

test('the catalogs are closed, frozen and inherit the C042 entries unchanged', { timeout: 30000 }, () => {
  for (const code of Object.keys(contract.ERRORS)) {
    const item = contract.ERRORS[code];
    assert.equal(Number.isInteger(item.status) && contract.OUTCOMES.includes(item.outcome) && typeof item.group === 'string' && typeof item.message === 'string', true, code);
    assert.equal(item.actions === null || item.actions.every((name) => contract.ACTION_NAMES.includes(name)), true, code);
    if (Object.hasOwn(c42.ERRORS, code)) assert.deepEqual(item, c42.ERRORS[code], `${code} is the accepted C042 entry`);
  }
  for (const code of Object.keys(contract.RUN_CODE_STATE)) assert.equal(Object.hasOwn(contract.ERRORS, code), true);
  assert.equal(Object.isFrozen(contract.ERRORS) && Object.isFrozen(contract.ERRORS.PRESET_STEP_FAILED) && Object.isFrozen(contract.DIDNOT), true);
  assert.deepEqual(contract.allowedActions('nonsense'), []);
  assert.deepEqual(contract.expectedActions(null, 'completed'), ['retry', 'inspect']);
  assert.deepEqual(contract.expectedActions('PRESET_BOUND_EXCEEDED', 'none'), ['correct-and-resubmit']);
  assert.deepEqual(contract.expectedActions('PRESET_BOUND_EXCEEDED', 'bounded'), ['correct-and-resubmit', 'inspect']);
  assert.deepEqual(contract.expectedActions('PRESET_INTERRUPTED', 'interrupted', false), ['resume', 'inspect']);
  assert.deepEqual(contract.expectedActions('INVALID_JSON', 'none'), ['correct-and-resubmit']);
  assert.deepEqual(contract.expectedActions('UNKNOWN_CODE', 'running'), ['cancel', 'retry', 'inspect']);
  assert.equal(contract.catalogEntry('CAPACITY_EXHAUSTED').status, 409);
  assert.equal(contract.catalogEntry('PRESET_STEP_FAILED').status, 409);
  assert.equal(contract.catalogEntry('nope'), null);
  assert.equal(contract.catalogEntry(7), null);
});

test('validatePresetShape: every hostile class is a typed problem, unsupported comes last, problems are capped', { timeout: 30000 }, () => {
  const good = clone(doc());
  assert.deepEqual(validate.validatePresetShape(good), { ok: true });
  const first = (value, stepProblems) => { const result = validate.validatePresetShape(value, stepProblems); return [result.ok, result.problems[0]?.code ?? result.unsupported?.code]; };
  const cases = [
    ['null', null, 'INVALID_SHAPE'], ['an array', [], 'INVALID_SHAPE'], ['a missing key', (() => { const x = clone(good); delete x.bounds; return x; })(), 'REQUIRED_FIELD'],
    ['an unknown key', { ...good, extra: 1 }, 'UNKNOWN_FIELD'], ['an own __proto__ key', JSON.parse(JSON.stringify(good).replace('{', '{"__proto__":1,')), 'FORBIDDEN_FIELD'],
    ['a string version', { ...good, schemaVersion: '1' }, 'WRONG_TYPE'], ['a fractional version', { ...good, schemaVersion: 1.5 }, 'UNSAFE_NUMBER'], ['negative zero', { ...good, schemaVersion: -0 }, 'UNSAFE_NUMBER'],
    ['a version 2', { ...good, schemaVersion: 2 }, 'UNSUPPORTED_PRESET_VERSION'], ['a numeric name', { ...good, preset: 5 }, 'WRONG_TYPE'], ['a bad name', { ...good, preset: 'Bad Name' }, 'INVALID_FORMAT'],
    ['a numeric key', { ...good, idempotencyKey: 5 }, 'WRONG_TYPE'], ['a short key', { ...good, idempotencyKey: 'short' }, 'INVALID_FORMAT'],
    ['bounds as a string', { ...good, bounds: 'x' }, 'WRONG_TYPE'], ['a missing bound', { ...good, bounds: { maxSteps: 4, maxDurationMs: 1000 } }, 'REQUIRED_FIELD'],
    ['an unknown bound', { ...good, bounds: { ...good.bounds, other: 1 } }, 'UNKNOWN_FIELD'], ['a forbidden bound', { ...good, bounds: JSON.parse('{"maxSteps":4,"maxDurationMs":1000,"maxUnits":40,"__proto__":1}') }, 'FORBIDDEN_FIELD'],
    ['a string bound', { ...good, bounds: { ...good.bounds, maxSteps: '4' } }, 'WRONG_TYPE'], ['an unsafe bound', { ...good, bounds: { ...good.bounds, maxUnits: 2 ** 53 } }, 'UNSAFE_NUMBER'],
    ['a bound of zero', { ...good, bounds: { ...good.bounds, maxSteps: 0 } }, 'FIELD_OUT_OF_RANGE'], ['a huge duration', { ...good, bounds: { ...good.bounds, maxDurationMs: 60001 } }, 'FIELD_OUT_OF_RANGE'],
    ['steps as an object', { ...good, steps: {} }, 'WRONG_TYPE'], ['no steps', { ...good, steps: [] }, 'FIELD_OUT_OF_RANGE'],
    ['nine steps', { ...good, steps: Array.from({ length: 9 }, (_, i) => step(i + 1)) }, 'TOO_MANY_STEPS'], ['a non-object step', { ...good, steps: [5] }, 'INVALID_SHAPE'],
    ['a step with an extra key', { ...good, steps: [{ ...step(1), extra: 1 }] }, 'UNKNOWN_FIELD'], ['a step with a __proto__ key', { ...good, steps: [JSON.parse('{"__proto__":1,"schemaVersion":1,"step":"reserve-capacity","idempotencyKey":"preset-a-step-1","leaseId":"synthetic-lease-001","units":5}')] }, 'FORBIDDEN_FIELD'],
    ['a step missing a key', { ...good, steps: [{ schemaVersion: 1 }] }, 'REQUIRED_FIELD'], ['a step with a bad key', { ...good, steps: [step(1, { idempotencyKey: 'x' })] }, 'INVALID_FORMAT'],
    ['an unknown lease', { ...good, steps: [step(1, { leaseId: 'nope' })] }, 'FIELD_OUT_OF_RANGE'], ['units 11', { ...good, steps: [step(1, { units: 11 })] }, 'FIELD_OUT_OF_RANGE'],
    ['twin keys', { ...good, steps: [step(1), step(1)] }, 'DUPLICATE_STEP_KEY'], ['another step name', { ...good, steps: [step(1, { step: 'release-capacity' })] }, 'UNSUPPORTED_STEP'],
  ];
  for (const [name, value, code] of cases) assert.deepEqual(first(value), [false, code], name);
  assert.equal(validate.validatePresetShape({ ...good, steps: [step(1, { schemaVersion: 2 }), step(2)] }).unsupported.path, 'steps[0].step');
  assert.deepEqual(first({ ...good, steps: [step(1, { step: 'release-capacity' }), step(2, { units: 99 })] }), [false, 'FIELD_OUT_OF_RANGE'], 'a typed problem wins over an unsupported step');
  const many = { schemaVersion: 'x', preset: 5, idempotencyKey: 5, bounds: 5, steps: Array.from({ length: 8 }, () => 5), extra: 1, extra2: 2, extra3: 3, extra4: 4, extra5: 5, extra6: 6, extra7: 7, extra8: 8, extra9: 9, extra10: 10, extra11: 11, extra12: 12 };
  assert.equal(validate.validatePresetShape(many).problems.length, 16, 'problems are capped at 16');
  assert.deepEqual(validate.validatePresetShape(good, () => [{ path: '', code: 'INVALID_SHAPE' }]).problems[0].path, 'steps[0]');
});

test('the declared presets are valid and the page-side verifier accepts the catalog and rejects a forged one', { timeout: 30000 }, () => {
  const catalog = presets.catalogDocument();
  assert.equal(envelope.validateCatalog(catalog).ok, true);
  const bad = [
    ['wrong kind', { ...catalog, kind: 'x' }], ['wrong scope', { ...catalog, scope: 'x' }], ['no presets', { ...catalog, presets: [] }],
    ['too many', { ...catalog, presets: [...catalog.presets, ...catalog.presets, ...catalog.presets] }], ['an invalid preset', { ...catalog, presets: [{ ...catalog.presets[0], steps: [] }] }],
    ['twin names', { ...catalog, presets: [catalog.presets[0], { ...catalog.presets[1], preset: catalog.presets[0].preset }] }],
    ['twin keys', { ...catalog, presets: [catalog.presets[0], { ...catalog.presets[1], idempotencyKey: catalog.presets[0].idempotencyKey }] }],
    ['an extra key', { ...catalog, extra: 1 }], ['a non-array', { ...catalog, presets: 'x' }],
  ];
  for (const [name, value] of bad) assert.equal(envelope.validateCatalog(clone(value)).ok, false, name);
  for (const entry of catalog.presets) assert.equal(entry.steps.every((item) => validate.stepShapeProblems(item).length === 0), true);
  assert.deepEqual(validate.stepShapeProblems(5), [{ path: '', code: 'INVALID_SHAPE' }]);
  assert.equal(validate.stepShapeProblems({ ...step(1), schemaVersion: 2 })[0].code, 'UNSUPPORTED_STEP');
});

const FORGERIES = [
  ['a missing envelope key', (e) => { delete e.scope; }, 'ENVELOPE_KEYS'], ['an extra envelope key', (e) => { e.extra = 1; }, 'ENVELOPE_KEYS'],
  ['another schema version', (e) => { e.schemaVersion = 2; }, 'IDENTITY'], ['another kind', (e) => { e.kind = 'C042-step-result'; }, 'IDENTITY'], ['another scope', (e) => { e.scope = 'x'; }, 'IDENTITY'],
  ['an unknown action', (e) => { e.action = 'undo'; }, 'ACTION'], ['a string flag', (e) => { e.accepted = 'yes'; }, 'FLAGS'],
  ['a classification that disagrees', (e) => { e.classification = 'FAILED'; }, 'OUTCOME'], ['an unknown state', (e) => { e.run.state = 'done'; }, 'RUN'],
  ['rewritten error wording', (e) => { e.error.message = 'All good.'; }, 'PARTS', 'failed'], ['rewritten what-did-not wording', (e) => { e.didNot[0].text = 'Nothing happened.'; }, 'PARTS'],
  ['a repeated what-did-not code', (e) => { e.didNot.push({ ...e.didNot[0] }); }, 'PARTS'], ['an unknown recovery action', (e) => { e.recovery.allowed.push('undo'); }, 'PARTS'],
  ['a trail that goes backwards', (e) => { e.trail.reverse(); }, 'PARTS'], ['an invalid preset', (e) => { e.preset.steps = []; }, 'PRESET'],
  ['a digest without a preset', (e) => { e.presetSha256 = null; }, 'PRESET_DIGEST'], ['a key that is not the preset key', (e) => { e.idempotencyKey = 'another-key-0001'; }, 'KEY_MATCH'],
  ['a missing step', (e) => { e.steps.pop(); }, 'STEPS'], ['an unknown step status', (e) => { e.steps[0].status = 'great'; }, 'STEPS'], ['changed units in a step', (e) => { e.steps[0].units = 9; }, 'STEPS'],
  ['a step claiming success without an effect', (e) => { e.steps[0].applied = false; }, 'STEPS'], ['a step applied by an inspect', (e) => { e.steps[0].appliedByThisRequest = true; }, 'STEPS', 'inspect'],
  ['a derived listing that was edited', (e) => { e.ran = []; }, 'DERIVED_LISTS'], ['an edited effects list', (e) => { e.effects = []; }, 'DERIVED_LISTS'], ['edited usage', (e) => { e.usage.units += 1; }, 'USAGE'],
  ['a flipped terminal flag', (e) => { e.terminal = !e.terminal; }, 'TERMINAL_STATE'], ['a run with no trail', (e) => { e.trail = []; }, 'RUN_HAS_TRAIL'],
  ['a trail without a begin', (e) => { e.trail[0].type = 'start'; }, 'RUN_HAS_TRAIL'], ['a bound on an answer that has none', (e) => { e.bound = { name: 'maxSteps', limit: 1, observed: 2 }; }, 'BOUND'],
  ['success that lost its error but kept a failed step', (e) => { e.steps[2].status = 'failed'; e.steps[2].applied = false; e.steps[2].appliedByThisRequest = false; e.steps[2].code = 'CAPACITY_EXHAUSTED'; e.steps[2].reservedAfter = null; e.ran = [1, 2, 3]; e.effects.pop(); e.usage.units = 10; }, 'SUCCESS_NEEDS_COMPLETED_RUN'],
  ['an outcome that disagrees with the code', (e) => { e.error = { code: 'ACTION_NOT_ALLOWED', group: 'state', message: contract.ERRORS.ACTION_NOT_ALLOWED.message, details: [] }; }, 'OUTCOME_MATCHES_CODE'],
  ['a replay on an inspect', (e) => { e.replayed = true; }, 'REPLAY_ACTION', 'inspect'], ['an accepted cancel that is not a cancellation', (e) => { e.action = 'cancel'; }, 'ACCEPTED_MEANING', 'inspect'],
  ['offered controls that the state does not allow', (e) => { e.recovery.allowed = ['resume', 'inspect']; }, 'RECOVERY'], ['rewritten recovery prose', (e) => { e.recovery.reason = 'Trust me.'; }, 'RECOVERY'],
];

test('the envelope validator rejects every forged answer for exactly its rule and accepts every honest one', { timeout: 60000 }, async () => {
  const all = await samples();
  for (const [name, answer] of Object.entries(all)) {
    const verdict = envelope.validateResultEnvelope(answer.body);
    assert.deepEqual([name, verdict.ok, verdict.problems], [name, true, []]);
    assert.equal(verify.checkAnswer(answer.status, answer.body, undefined).ok, true, name);
  }
  assert.equal(all.cancelled.body.outcome, 'cancelled');
  assert.equal(all.running.status, 202);
  for (const [name, change, expected, base = 'completed'] of FORGERIES) {
    const forged = tamper(all[base].body, change);
    const verdict = envelope.validateResultEnvelope(forged);
    assert.equal(verdict.ok, false, `${name} must be rejected`);
    assert.equal(verdict.problems.includes(expected), true, `${name}: ${verdict.problems.join(',')} lacks ${expected}`);
  }
  const more = [
    ['a stopped run without its failed step', all.failed.body, (e) => { e.steps[1].status = 'interrupted'; e.steps[1].code = null; }, 'RUN_CODE_MATCHES_STATE'],
    ['a stopped run whose detail names another code', all.failed.body, (e) => { e.error.details[0].code = 'STEP_CANCELLED'; e.error.details[0].message = contract.ERRORS.STEP_CANCELLED?.message ?? c42.ERRORS.STEP_CANCELLED.message; }, 'RUN_CODE_MATCHES_STATE'],
    ['a refusal that claims to be accepted', all.conflict.body, (e) => { e.accepted = true; }, 'REFUSAL_NOT_ACCEPTED'],
    ['a bound with the wrong observation', all.bounded.body, (e) => { e.bound.observed += 1; }, 'BOUND'],
    ['a static bound with the wrong declared total', all.static.body, (e) => { e.bound.observed = 99; }, 'BOUND'],
    ['a bound answer that lost its bound', all.static.body, (e) => { e.bound = null; }, 'BOUND_NAMED'],
    ['an interrupted run claiming an unknown step', all.interrupted.body, (e) => { e.steps[1].status = 'unknown'; e.steps[1].applied = null; e.steps[1].code = 'JOURNAL_UNCERTAIN'; }, 'RUN_CODE_MATCHES_STATE'],
    ['a running state that is not running', all.running.body, (e) => { e.run.state = 'interrupted'; e.terminal = false; }, 'RUN_CODE_MATCHES_STATE'],
    ['a step after a stop that claims to have run', all.failed.body, (e) => { e.steps[2].status = 'succeeded'; e.steps[2].applied = true; e.steps[2].reservedAfter = 5; }, 'STEP_ORDER'],
    ['units beyond the declared bound', all.completed.body, (e) => { e.preset.bounds.maxUnits = 10; }, 'UNITS_WITHIN_BOUND'],
    ['a run state with no run', all.invalid.body, (e) => { e.trail = [{ seq: 1, type: 'begin' }]; }, 'NO_RUN_NO_TRAIL'],
  ];
  for (const [name, base, change, expected] of more) {
    const verdict = envelope.validateResultEnvelope(tamper(base, change));
    assert.equal(verdict.ok, false, `${name} must be rejected`);
    assert.equal(verdict.problems.includes(expected), true, `${name}: ${verdict.problems.join(',')} lacks ${expected}`);
  }
  assert.equal(envelope.validateResultEnvelope(null).ok, false);
  assert.deepEqual(envelope.validateResultEnvelope({}).problems, ['ENVELOPE_KEYS']);
});

test('the page-side checks bind the HTTP status and the preset that was sent to the answer', { timeout: 60000 }, async () => {
  const all = await samples();
  const sent = clone(doc());
  assert.equal(verify.expectedStatus(all.completed.body), 201);
  assert.equal(verify.expectedStatus(all.replay.body), 200);
  assert.equal(verify.expectedStatus(all.running.body), 202);
  assert.equal(verify.expectedStatus(all.conflict.body), 409);
  assert.equal(verify.checkAnswer(200, all.completed.body, sent).problems[0], 'HTTP_STATUS_CONTRADICTS_ENVELOPE');
  assert.equal(verify.checkAnswer(201, all.completed.body, sent).ok, true);
  assert.equal(verify.checkAnswer(201, all.completed.body, { ...sent, bounds: { ...sent.bounds, maxUnits: 39 } }).problems[0], 'PRESET_DIFFERS_FROM_REQUEST');
  assert.equal(verify.checkAnswer(201, all.completed.body, null).problems[0], 'PRESET_DIFFERS_FROM_REQUEST', 'the sent text was not a valid preset, so the answer may not show one');
  assert.equal(verify.checkAnswer(409, all.conflict.body, { ...sent, steps: [] }).ok, true, 'a conflict shows the stored preset, not the sent one');
  assert.equal(verify.checkAnswer(all.invalid.status, all.invalid.body, { ...sent, schemaVersion: 2 }).ok, true);
  assert.equal(verify.checkAnswer(200, tamper(all.completed.body, (e) => { e.outcome = 'rejected'; }), undefined).ok, false);
  assert.equal(verify.canon(sent), verify.canon(clone(sent)));
});

test('the server-produced transcript verifies, and every tampering of it is rejected', { timeout: 120000 }, async () => {
  const transcript = await produceTranscript();
  const verdict = verify.verifyTranscript(transcript);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.summary.replays >= 1 && verdict.summary.exchanges >= 25, true);
  const events = (value) => value.events;
  const exchange = (value, predicate) => events(value).find((event) => event.kind === 'exchange' && predicate(event.response.body));
  const bad = [
    ['a wrong kind', (t) => { t.kind = 'x'; }, 'TRANSCRIPT_SHAPE'], ['a wrong version', (t) => { t.schemaVersion = 2; }, 'TRANSCRIPT_SHAPE'], ['a wrong scope', (t) => { t.scope = 'x'; }, 'TRANSCRIPT_SHAPE'],
    ['no events', (t) => { t.events = []; }, 'TRANSCRIPT_SHAPE'], ['too many events', (t) => { t.events = Array.from({ length: 301 }, (_, i) => ({ n: i + 1, kind: 'note' })); }, 'TRANSCRIPT_SHAPE'],
    ['a gap', (t) => { t.events.splice(3, 1); }, 'SEQUENCE_GAP'], ['an unknown event kind', (t) => { t.events[2].kind = 'abort'; }, 'EVENT_SHAPE'],
    ['an event without a response', (t) => { t.events[1].response = null; }, 'EVENT_SHAPE'], ['a response without a status', (t) => { t.events[1].response.status = 'ok'; }, 'EVENT_SHAPE'],
    ['a forged catalog', (t) => { t.events[0].response.body.presets = []; }, 'CATALOG_INVALID'],
    ['a forged ledger', (t) => { const e = events(t).find((event) => event.kind === 'exchange' && event.response.body.kind === 'C042-lease-snapshot'); e.response.body.leases['synthetic-lease-001'].committed += 1; }, 'LEDGER_MISMATCH'],
    ['an invalid envelope', (t) => { exchange(t, (b) => b.kind === 'C043-preset-result' && b.outcome === 'succeeded').response.body.outcome = 'rejected'; }, 'ENVELOPE_INVALID'],
    ['a dishonest HTTP status', (t) => { exchange(t, (b) => b.kind === 'C043-preset-result' && b.outcome === 'succeeded').response.status = 200; }, 'ENVELOPE_INVALID'],
    ['two different effects for one step', (t) => { const hit = events(t).filter((event) => event.kind === 'exchange' && event.response.body.kind === 'C043-preset-result' && event.response.body.effects.length > 0 && event.scenario === 'conduct'); hit[1].response.body.effects[0].reservedAfter += 1; hit[1].response.body.steps[0].reservedAfter += 1; }, 'SECOND_EFFECT'],
    ['two requests that both applied a step', (t) => { const hit = events(t).filter((event) => event.kind === 'exchange' && event.response.body.kind === 'C043-preset-result' && event.scenario === 'conduct' && event.response.body.outcome === 'succeeded'); const copy = clone(hit[0].response); hit[1].response = copy; }, 'SECOND_EFFECT'],
    ['missing required evidence', (t) => { t.events = t.events.filter((event) => !(event.kind === 'exchange' && event.response.body.error && event.response.body.error.code === 'DUPLICATE_FIELD')).map((event, index) => ({ ...event, n: index + 1 })); }, 'MISSING_EVIDENCE'],
  ];
  for (const [name, change, code] of bad) {
    const forged = clone(transcript);
    change(forged);
    const result = verify.verifyTranscript(forged);
    assert.deepEqual([name, result.ok, result.code], [name, false, code]);
  }
  assert.equal(verify.verifyTranscript(null).code, 'TRANSCRIPT_SHAPE');
  assert.equal(verify.verifyTranscript({ kind: 'C043-server-transcript', schemaVersion: 1, scope: contract.SCOPE, events: [{ n: 1, kind: 'exchange', response: { status: 200, body: { kind: 'C042-lease-snapshot', leases: null } } }] }).code, 'TRANSCRIPT_SHAPE');
  assert.equal(createMemoryIo().read(), '');
});
