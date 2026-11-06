'use strict';

// Third review, Q3 and Q7. (Q3) Self-review line 5, no shared mutable returns: every export of journey.js and of a11y-check.js is deeply frozen, and a WALKER mutates
// every reachable leaf of every export and of every return value in strict mode, then calls again with a fresh clone of the same input and compares the output.
// (Q7) journey.present judges an answer only against the request it answers: a caller that omits `expected` gets a typed refusal, never a misrouted envelope shown as a success.
// C059_RED_SUBJECT (the RED replay only) names a folder that holds the journey.js to load instead of the final one (tests\subject.cjs).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { c042 } = require('./harness.cjs');
const { parseHtml } = require('./dom.cjs');
const { load } = require('./subject.cjs');

const root = path.resolve(__dirname, '..');
const journey = load('journey.js');
const checker = load('a11y-check.js');
const OPTIONS = { timeout: 60000 };
const clone = (value) => JSON.parse(JSON.stringify(value));
const input = (key, over = {}) => ({ schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: key, leaseId: 'synthetic-lease-001', units: 3, ...over });

// Every object or array reachable from a value that is not frozen (a function is a leaf).
function unfrozen(value, seen = new Set(), at = 'export') {
  if (value === null || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);
  return [...(Object.isFrozen(value) ? [] : [at]), ...Object.keys(value).flatMap((key) => unfrozen(value[key], seen, `${at}.${key}`))];
}

// Writes to every reachable leaf (and appends to every array) in strict mode: a frozen node throws a TypeError (blocked), a mutable one changes.
function scribble(value) {
  const tally = { changed: 0, blocked: 0 };
  const seen = new Set();
  const attempt = (write) => {
    try { write(); tally.changed += 1; } catch (error) { assert.ok(error instanceof TypeError, String(error)); tally.blocked += 1; }
  };
  const walk = (node) => {
    if (node === null || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    for (const key of Object.keys(node)) {
      const leaf = node[key];
      if (leaf !== null && typeof leaf === 'object') walk(leaf);
      else attempt(() => { node[key] = typeof leaf === 'number' ? leaf + 1 : typeof leaf === 'boolean' ? !leaf : 'MUTATED'; });
    }
    if (Array.isArray(node)) attempt(() => node.push('EXTRA'));
  };
  walk(value);
  return tally;
}

test('the walker is not vacuous: it names every unfrozen node of a control and mutates a mutable one', OPTIONS, () => {
  assert.deepEqual(unfrozen({ table: { rows: [['a', 'b']] }, frozen: Object.freeze({ x: 1 }) }), ['export', 'export.table', 'export.table.rows', 'export.table.rows.0']);
  const control = { table: { rows: ['a', 1, true] } };
  assert.deepEqual(scribble(control), { changed: 4, blocked: 0 });
  assert.deepEqual(control, { table: { rows: ['MUTATED', 2, false, 'EXTRA'] } });
  assert.deepEqual(scribble(Object.freeze({ x: 'a' })), { changed: 0, blocked: 1 });
});

for (const [name, mod] of [['journey.js', journey], ['a11y-check.js', checker]]) {
  test(`${name}: every export is deeply frozen (every reachable object and array), and a write into any leaf of any export is refused in strict mode`, OPTIONS, () => {
    assert.ok(Object.keys(mod).length >= 8, 'the export list is not empty');
    assert.deepEqual(unfrozen(mod), []);
    const tally = scribble(mod);
    assert.equal(tally.changed, 0, 'no leaf of an export could be written');
  });
}

test('journey.js: the tables that were mutable (FIELD_NAMES, LEASES, MESSAGES, WORDS and the say table) are deeply frozen and a write is blocked, so no later wording can change', OPTIONS, async () => {
  for (const name of ['FIELD_NAMES', 'LEASES', 'MESSAGES', 'WORDS', 'say']) {
    assert.deepEqual(unfrozen(journey[name], new Set(), name), [], name);
    assert.ok(scribble(journey[name]).blocked > 0, `${name} has leaves to write to`);
  }
  assert.throws(() => { journey.say.ready = () => 'HACKED'; }, TypeError);
  assert.throws(() => { journey.WORDS.succeeded[0] = 'HACKED'; }, TypeError);
  assert.throws(() => { journey.LEASES.push('synthetic-lease-009'); }, TypeError);
  assert.throws(() => { journey.MESSAGES.KEY_REQUIRED = 'HACKED'; }, TypeError);
  assert.throws(() => { journey.FIELD_NAMES.key = 'HACKED'; }, TypeError);
  const engine = await c042('engine.cjs').openEngine({ io: c042('journal.cjs').createMemoryIo() });
  const sent = input('fz-key-0001');
  const view = journey.present(await engine.submit(sent), { key: sent.idempotencyKey, input: sent });
  assert.equal(view.heading, 'Result: Succeeded');
  assert.deepEqual(journey.LEASES, ['synthetic-lease-001', 'synthetic-lease-002']);
});

// A corpus of real answers of the real C042 engine: a success, its replay, a conflict, an inspect, an unknown key, a refusal and one that carries no key.
// Each entry names the request it answers ({ key, input }) the way the page does.
async function corpus() {
  const engine = await c042('engine.cjs').openEngine({ io: c042('journal.cjs').createMemoryIo() });
  const entry = (name, expected, answer) => ({ name, expected, answer });
  const first = input('fz-key-0001');
  const other = input('fz-key-0002', { leaseId: 'synthetic-lease-002', units: 4 });
  const again = { ...first, units: 4 };
  return [
    entry('submit', { key: first.idempotencyKey, input: first }, await engine.submit(first)),
    entry('replay', { key: first.idempotencyKey, input: first }, await engine.submit(first)),
    entry('conflict', { key: first.idempotencyKey, input: again }, await engine.submit(again)),
    entry('second step', { key: other.idempotencyKey, input: other }, await engine.submit(other)),
    entry('inspect', { key: 'fz-key-0001', input: null }, engine.inspect('fz-key-0001')),
    entry('inspect of an unknown key', { key: 'fz-key-9999', input: null }, engine.inspect('fz-key-9999')),
    entry('cancel of a committed step', { key: 'fz-key-0001', input: null }, engine.cancel('fz-key-0001')),
    entry('a refusal without a key', { key: null, input: { schemaVersion: 1 } }, c042('result.cjs').refusal('REQUIRED_FIELD', { action: 'submit' })),
  ];
}

test('journey.present: every return value is fresh and independent: after every reachable leaf of the view was written, a call with a fresh clone gives the identical output', OPTIONS, async () => {
  let changed = 0;
  for (const { name, expected, answer } of await corpus()) {
    const first = journey.present(clone(answer), clone(expected));
    assert.equal(first.ok, true, `${name}: the answer is valid for its request (${first.code})`);
    const baseline = JSON.stringify(first);
    changed += scribble(first).changed;
    assert.equal(JSON.stringify(journey.present(clone(answer), clone(expected))), baseline, `${name}: a later output is unchanged`);
    const twin = journey.present(clone(answer), clone(expected));
    assert.notEqual(twin, first, `${name}: a new object per call`);
    assert.notEqual(twin.facts, first.facts, `${name}: new facts per call`);
  }
  assert.ok(changed > 100, `the walker wrote to ${changed} leaves of the views`);
});

test('journey.js: the other functions return values that share nothing with a later call (validateForm, validationView, localFailure, say, labelOf)', OPTIONS, () => {
  const calls = {
    validateForm: () => journey.validateForm({ key: 'good-key-0001', lease: 'synthetic-lease-001', units: '5' }),
    'validateForm (problems)': () => journey.validateForm({ key: '', lease: 'x', units: '0' }),
    validationView: () => journey.validationView(journey.validateForm({ key: '', lease: '', units: '' }).problems),
    localFailure: () => journey.localFailure('NO_VALID_RESPONSE', ['retry', 'inspect'], 'MALFORMED_JSON'),
    'say.chosen': () => journey.say.chosen({ id: 'A-S001', title: 'T' }, true),
    'say.correct': () => journey.say.correct('demo-key-0009'),
    labelOf: () => journey.labelOf('retry'),
  };
  let changed = 0;
  for (const [name, call] of Object.entries(calls)) {
    const first = call();
    const baseline = JSON.stringify(first);
    changed += scribble(first).changed;
    assert.equal(JSON.stringify(call()), baseline, `${name}: a later call is unchanged`);
  }
  assert.ok(changed > 10, `the walker wrote to ${changed} leaves`);
});

test('a11y-check.js: the findings, the tab order and the style findings are fresh on every call; writing into them changes no later result', OPTIONS, () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  const broken = '<!doctype html><html><head><title>t</title></head><body><button></button><button></button></body></html>';
  const calls = {
    'check (the page)': () => checker.check(parseHtml(html), {}),
    'check (a defective page)': () => checker.check(parseHtml(broken), {}),
    'tabOrder (selectors)': () => checker.tabOrder(parseHtml(html), {}).map((element) => checker.selectorOf(element)),
    checkStyles: () => checker.checkStyles(css),
    'checkStyles (defective)': () => checker.checkStyles('button:focus { outline: none } .x { height: 10px; overflow: hidden } a { transition: all 1s } p { font-size: 12px }'),
  };
  let changed = 0;
  for (const [name, call] of Object.entries(calls)) {
    const first = call();
    const baseline = JSON.stringify(first);
    changed += scribble(first).changed;
    assert.equal(JSON.stringify(call()), baseline, `${name}: a later call is unchanged`);
  }
  assert.ok(changed > 5, `the walker wrote to ${changed} leaves`);
  assert.ok(calls['check (a defective page)']().findings.length > 0, 'the defective page is reported (the walker did not run on an empty result)');
});

test('Q7: journey.present has no default for `expected`: an answer is never judged without its request (omitted, null and any non-object are refused as EXPECTED_REQUIRED)', OPTIONS, async () => {
  const engine = await c042('engine.cjs').openEngine({ io: c042('journal.cjs').createMemoryIo() });
  const mine = input('fz-key-0004');
  const misrouted = await engine.submit(input('fz-key-0005', { leaseId: 'synthetic-lease-002', units: 9 }));
  assert.equal(misrouted.status, 201, 'a perfectly valid envelope of ANOTHER step');
  const expected = { key: mine.idempotencyKey, input: mine };
  for (const missing of [undefined, null, 'fz-key-0004', 5, true]) {
    assert.deepEqual(journey.present(misrouted, missing), { ok: false, code: 'EXPECTED_REQUIRED', detail: [] }, `expected ${String(missing)}`);
  }
  assert.deepEqual(journey.present(misrouted), { ok: false, code: 'EXPECTED_REQUIRED', detail: [] }, 'expected omitted');
  assert.equal(journey.present(misrouted, expected).code, 'KEY_MISMATCH', 'with the request it does not belong to, the envelope is refused too');
  const own = await engine.submit(mine);
  assert.equal(journey.present(own, expected).ok, true, 'the answer of its own request is shown');
  assert.equal(journey.present(own).ok, false, 'and refused when the caller does not say which request it answers');
});

test('expectedFor derives the expectation of a recorded exchange: a submit is bound to its key and input, every other step request to the key of its path', OPTIONS, () => {
  assert.equal(typeof journey.expectedFor, 'function', 'journey.expectedFor exists');
  const body = input('fz-key-0006');
  const cases = [
    [{ method: 'POST', path: '/v1/steps', body }, { key: 'fz-key-0006', input: body }],
    [{ method: 'POST', path: '/v1/steps', body: { schemaVersion: 1 } }, { key: null, input: { schemaVersion: 1 } }],
    [{ method: 'POST', path: '/v1/steps', body: { idempotencyKey: 7 } }, { key: null, input: { idempotencyKey: 7 } }],
    [{ method: 'POST', path: '/v1/steps', body: null }, { key: null, input: null }],
    [{ method: 'POST', path: '/v1/steps' }, { key: null, input: null }],
    [{ method: 'POST', path: '/v1/steps', body: 'text' }, { key: null, input: null }],
    [{ method: 'GET', path: '/v1/steps/fz-key-0007', body: null }, { key: 'fz-key-0007', input: null }],
    [{ method: 'POST', path: '/v1/steps/fz-key-0008/cancel', body: null }, { key: 'fz-key-0008', input: null }],
    [{ method: 'POST', path: '/v1/steps/fz-key-0009/undo', body: null }, { key: 'fz-key-0009', input: null }],
    [{ method: 'GET', path: '/v1/leases', body: null }, { key: null, input: null }],
    [{ method: 'GET', path: '/v1/steps/a/b/c', body: null }, { key: null, input: null }],
    [{ method: 'GET', path: '/v1/steps', body: { idempotencyKey: 'fz-key-0010' } }, { key: null, input: null }],
    [{ method: 'PUT', path: '/v1/steps', body: input('fz-key-0011') }, { key: null, input: null }],
  ];
  for (const [request, expected] of cases) assert.deepEqual(journey.expectedFor(request), expected, JSON.stringify(request));
});
