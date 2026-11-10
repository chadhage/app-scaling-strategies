'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { createLedger } = require('../../C009/ledger.cjs');
const { createEvidence, errorSteps, RING } = require('../evidence.cjs');
const { createRedactor, MASK } = require('../redact.cjs');

const KEY = 'unit-test-signing-key-0123456789abcdef';
const LATE = 'late-secret-value-abcdefghij';
const rig = () => {
  const redactor = createRedactor({ secrets: [] });
  const ledger = createLedger(200, 1000, { ownerLimit: 400, anonymousLimit: 50 });
  const signed = [];
  const evidence = createEvidence({ redactor, ledger, sign: (text) => { signed.push(text); return createHmac('sha256', KEY).update(text).digest('hex'); } });
  return { redactor, ledger, evidence, signed };
};
const trace = (over = {}) => ({ kind: 'request', method: 'GET', route: 'asset', status: 200, role: null, code: 'ok', steps: [], ...over });
const commitRun = (ledger, id = 'run-0001', over = {}) => ledger.commit((draft) => { draft.runs.push({ id, units: 1, owner: 'operator', revision: 1, status: 'ok', artifacts: [{ file: 'a' }, { file: 'b' }], steps: [], ...over }); return {}; },
  { actor: { subject: 'operator', role: 'operator' }, input: {} });

test('the trace and log rings keep the newest RING records, numbered by a sequence that never repeats', () => {
  const { evidence } = rig();
  for (let index = 0; index < RING + 50; index += 1) evidence.record('trace', trace({ status: 200 }));
  assert.equal(RING, 200);
  assert.equal(evidence.size('trace'), RING);
  const list = evidence.listBody('trace', 200).value;
  assert.equal(list.total, RING);
  assert.equal(list.shown, RING);
  assert.equal(list.items[0].seq, 51);
  assert.equal(list.items.at(-1).seq, RING + 50);
  assert.equal(evidence.record('logs', { level: 'info', event: 'request', route: 'asset', status: 200 }), 1);
});

test('listBody shows the newest `limit` entries and reconciles shown against total', () => {
  const { evidence } = rig();
  for (let index = 0; index < 30; index += 1) evidence.record('trace', trace());
  const list = evidence.listBody('trace', 10).value;
  assert.deepEqual([list.total, list.shown, list.limit, list.items.length], [30, 10, 10, 10]);
  assert.deepEqual(list.items.map((item) => item.seq), [21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
  assert.equal(evidence.listBody('audit', 5).value.total, 0);
  assert.equal(evidence.listBody('runs', 5).value.revision, 0);
});

test('a published item is reused until the redactor learns a new secret, then it is published again (and masked)', () => {
  const { redactor, evidence } = rig();
  evidence.record('trace', trace({ steps: [{ event: 'note', detail: `contains ${LATE} here` }] }));
  assert.equal(evidence.listBody('trace', 5).value.items[0].steps[0].detail, `contains ${LATE} here`);
  const first = evidence.listBody('trace', 5);
  assert.equal(evidence.listBody('trace', 5).value.items[0], first.value.items[0], 'the same frozen item is reused');
  redactor.register(LATE);
  assert.equal(evidence.listBody('trace', 5).value.items[0].steps[0].detail, `contains ${MASK} here`);
});

test('a record that cannot be read is published as nothing: shown excludes it, total counts it, and the items reconcile', () => {
  const { evidence } = rig();
  evidence.record('trace', trace());
  const broken = trace();
  Object.defineProperty(broken, 'steps', { get() { throw new Error('boom'); }, enumerable: true });
  evidence.record('trace', broken);
  evidence.record('trace', trace({ status: 99 }));
  const list = evidence.listBody('trace', 10).value;
  assert.deepEqual([list.total, list.shown, list.items.length], [3, 1, 1]);
  const bundle = evidence.bundleBody().value;
  assert.equal(bundle.counts.trace, 1);
  assert.equal(bundle.trace.length, 1);
});

test('errorSteps: the message of an error and of its causes, at most four deep, a cycle is cut, a message that is not text is empty, a non-object has none', () => {
  const chain = Array.from({ length: 6 }, (_, index) => new Error(`level ${index}`));
  chain.forEach((error, index) => { if (index < 5) error.cause = chain[index + 1]; });
  assert.deepEqual(errorSteps(chain[0]).map((step) => step.detail), ['level 0', 'level 1', 'level 2', 'level 3']);
  const loop = new Error('loop');
  loop.cause = loop;
  assert.equal(errorSteps(loop).length, 4);
  assert.deepEqual(errorSteps({ message: 42 }), [{ event: 'failure', detail: '' }]);
  assert.deepEqual(errorSteps({ cause: { message: 'inner' } }).map((step) => step.detail), ['', 'inner']);
  for (const value of ['text', 7, null, undefined, true]) assert.deepEqual(errorSteps(value), []);
  assert.ok(errorSteps(chain[0]).every((step) => step.event === 'failure'));
});

test('a raw error becomes failure steps next to the raw steps; the stack is never read', () => {
  const { redactor, evidence } = rig();
  redactor.register(LATE);
  const error = new Error(`login failed ${LATE}`, { cause: new Error('inner') });
  evidence.record('trace', trace({ kind: 'error', steps: [{ event: 'connect', detail: 'dial' }], error, stack: `STACK-${LATE}` }));
  const item = evidence.listBody('trace', 5).value.items[0];
  assert.deepEqual(item.steps, [{ event: 'connect', detail: 'dial' }, { event: 'failure', detail: `login failed ${MASK}` }, { event: 'failure', detail: 'inner' }]);
  assert.ok(!JSON.stringify(item).includes('STACK'));
});

test('runs come from the committed ledger state: files become a count, a refused commit leaves no phantom run, audit entries are typed', () => {
  const { evidence, ledger } = rig();
  commitRun(ledger);
  assert.throws(() => ledger.commit((draft) => { draft.runs.push({ id: 'run-0002' }); throw new Error('refused'); }, { actor: { subject: 'operator', role: 'operator' }, input: {} }));
  const runs = evidence.listBody('runs', 10).value;
  assert.deepEqual(runs.items.map((item) => [item.id, item.artifacts]), [['run-0001', 2]]);
  assert.equal(runs.revision, 1);
  ledger.record({ outcome: 'applied', code: 'ok', command: 'run.create', subject: 'operator', role: 'operator', note: 'dropped' });
  const audit = evidence.listBody('audit', 10).value;
  assert.deepEqual(audit.items, [{ seq: 1, outcome: 'applied', code: 'ok', command: 'run.create', subject: 'operator', role: 'operator' }]);
  assert.equal(evidence.listBody('audit', 10).value.items[0], audit.items[0], 'audit items are reused too');
});

test('a run whose files are not an array counts none; a run item is reused by id', () => {
  const { evidence, ledger } = rig();
  commitRun(ledger, 'run-0001', { artifacts: 'nope' });
  assert.equal(evidence.listBody('runs', 10).value.items[0].artifacts, 0);
  const again = evidence.listBody('runs', 10);
  assert.equal(again.value.items[0], evidence.listBody('runs', 10).value.items[0]);
});

test('the bundle: every kind through the item path, counts that equal the item counts, a signature over exactly the unsigned JSON text', () => {
  const { evidence, ledger, signed } = rig();
  commitRun(ledger);
  evidence.record('trace', trace());
  evidence.record('logs', { level: 'info', event: 'request', route: 'asset', status: 200, code: 'ok', role: null });
  ledger.record({ outcome: 'denied', code: 'ROLE_FORBIDDEN', command: 'run.create', subject: 'visitor', role: 'visitor' });
  const body = evidence.bundleBody();
  const text = JSON.stringify(body);
  const { signature, ...unsigned } = JSON.parse(text);
  assert.equal(signed.length, 1);
  assert.equal(signed[0], JSON.stringify(unsigned));
  assert.equal(signature.value, createHmac('sha256', KEY).update(signed[0]).digest('hex'));
  assert.equal(unsigned.schema, 'c014-evidence/1');
  assert.deepEqual(unsigned.counts, { trace: 1, runs: 1, audit: 1, logs: 1 });
  assert.deepEqual(Object.keys(unsigned), ['schema', 'revision', 'counts', 'trace', 'runs', 'audit', 'logs']);
});

test('the bundle shows at most RING items per kind, newest last', () => {
  const { evidence } = rig();
  for (let index = 0; index < RING + 5; index += 1) evidence.record('logs', { level: 'info', event: 'request', route: 'asset', status: 200 });
  const bundle = evidence.bundleBody().value;
  assert.equal(bundle.logs.length, RING);
  assert.equal(bundle.logs.at(-1).seq, RING + 5);
});
