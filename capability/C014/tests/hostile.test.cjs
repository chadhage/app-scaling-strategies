'use strict';

// Third-review minors F4 (b) and F4 (c): the mutant R15 (the array limit removed) was decided only by a hang, and the mutants R29 (the own-property check removed, so inherited
// keys are read) and H12 were undecided at the time limit. Here each is decided by a number or a value, never by a clock: reads counted by a proxy, and fields that exist only on a prototype.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRedactor, LIMITS, SCHEMAS, ROLES } = require('../redact.cjs');

const instance = createRedactor({ secrets: [] });
const run = (over = {}) => ({ id: 'run-0001', units: 1, revision: 0, status: 'ok', artifacts: 0, steps: [], ...over });
const counting = (target, meter) => new Proxy(target, {
  get(inner, key, receiver) { meter.reads += 1; return Reflect.get(inner, key, receiver); },
  getOwnPropertyDescriptor(inner, key) { meter.reads += 1; return Reflect.getOwnPropertyDescriptor(inner, key); },
  has(inner, key) { meter.reads += 1; return Reflect.has(inner, key); },
  ownKeys(inner) { meter.reads += 1; return Reflect.ownKeys(inner); }
});
const BUNDLE = { schema: 'c014-evidence/1', revision: 0, counts: { trace: 0, runs: 0, audit: 0, logs: 0 }, trace: [], runs: [], audit: [], logs: [] };
const ERROR = { outcome: 'ok', error: { code: 'ok', message: 'm' }, role: null, command: null, requiredRoles: [], field: null, auditSeq: null, ignoredClaims: [] };

test('R15: the limit of every array of the schemas is checked BEFORE the loop: an array that claims a million entries is read at most as often as its limit allows (counted reads, no clock)', () => {
  const cases = [
    ['runs.steps', 'runs', (huge) => run({ steps: huge }), LIMITS.steps],
    ['trace.steps', 'trace', (huge) => ({ seq: 1, kind: 'request', method: 'GET', route: 'asset', status: 200, role: null, code: null, steps: huge }), LIMITS.steps],
    ['list.items', 'list', (huge) => ({ outcome: 'ok', kind: 'runs', revision: 0, total: 0, shown: 0, limit: 50, items: huge }), LIMITS.entries],
    ['bundle.runs', 'bundle', (huge) => ({ ...BUNDLE, runs: huge }), LIMITS.entries],
    ['bundle.logs', 'bundle', (huge) => ({ ...BUNDLE, logs: huge }), LIMITS.entries],
    ['answer.ignoredClaims', 'answer', (huge) => ({ outcome: 'ok', command: 'run.create', revision: 0, actor: { subject: 'operator', role: 'operator' }, result: { id: null, checked: null }, auditSeq: 0, ignoredClaims: huge }), LIMITS.claims],
    ['error.ignoredClaims', 'error', (huge) => ({ ...ERROR, ignoredClaims: huge }), LIMITS.claims],
    ['error.requiredRoles', 'error', (huge) => ({ ...ERROR, requiredRoles: huge }), ROLES.length]
  ];
  for (const [label, kind, build, limit] of cases) {
    const meter = { reads: 0 };
    const body = instance.publish(kind, build(counting(new Array(1e6), meter)));
    assert.ok(body.redactions >= 1, `${label}: the array is cut and counted`);
    assert.ok(meter.reads >= 1 && meter.reads <= 1 + 2 * limit, `${label}: ${meter.reads} reads for a limit of ${limit}`);
  }
});

test('R15: a list with exactly its limit of entries is read once per entry, and one entry more is cut and counted', () => {
  for (const [label, kind, build, limit] of [['runs.steps', 'runs', (list) => run({ steps: list }), LIMITS.steps], ['list.items', 'list', (list) => ({ outcome: 'ok', kind: 'runs', revision: 0, total: 0, shown: 0, limit: 50, items: list }), LIMITS.entries]]) {
    const entries = (count) => Array.from({ length: count }, () => (kind === 'runs' ? { event: 'note', detail: 'x' } : instance.publish('runs', run())));
    const exact = { reads: 0 };
    const full = instance.publish(kind, build(counting(entries(limit), exact)));
    assert.equal(exact.reads >= limit, true, `${label}: every entry up to the limit is read`);
    const more = { reads: 0 };
    const cut = instance.publish(kind, build(counting(entries(limit + 1), more)));
    assert.equal(cut.redactions, full.redactions + 1, `${label}: one entry more is counted as one redaction`);
    assert.ok(more.reads <= exact.reads + 2, `${label}: but never read (${more.reads} against ${exact.reads})`);
  }
});

// A document of each kind built from its schema alone: the first value of every vocabulary, the smallest number, one entry in every array.
function validOf(node) {
  switch (node.t) {
    case 'int': return node.min;
    case 'bool': return true;
    case 'enum': return node.values[0];
    case 'id': return 'run-0001';
    case 'hex': return '0'.repeat(node.length);
    case 'text': return 'text';
    case 'public': return instance.publish('runs', validOf(SCHEMAS.runs));
    case 'array': return [validOf(node.of)];
    default: return Object.fromEntries(Object.entries(node.fields).map(([key, child]) => [key, validOf(child)]));
  }
}

test('R29: only OWN properties are read: a document whose fields all stand on its prototype is the same as an empty document, in every kind', () => {
  for (const kind of Object.keys(SCHEMAS)) {
    const valid = validOf(SCHEMAS[kind]);
    const text = (value) => JSON.stringify(instance.publish(kind, value));
    assert.notEqual(text(valid), text({}), `${kind}: the sample document is not empty`);
    assert.equal(text(Object.create(valid)), text({}), `${kind}: inherited fields are no fields`);
  }
});

test('R29: a polluted Object.prototype adds no field to any document: the required field that is missing still drops the item', () => {
  Object.prototype.units = 7;
  Object.prototype.id = 'run-9999';
  try {
    const { units, id, ...rest } = run();
    assert.equal(units, 1);
    assert.equal(id, 'run-0001');
    assert.equal(instance.publish('runs', rest).value, null);
    assert.equal(instance.publish('runs', { ...rest, id }).value, null, 'units is still missing');
  } finally {
    delete Object.prototype.units;
    delete Object.prototype.id;
  }
  assert.equal(Object.prototype.units, undefined);
  assert.equal(instance.publish('runs', run()).value.units, 1);
});
