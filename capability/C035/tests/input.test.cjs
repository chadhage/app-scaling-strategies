'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const classifier = require('..\\classifier.js');

test('only closed source, comparison, and operation identifiers are accepted without overrides', async () => {
  for (const id of ['', null, 0, true, {}, [], 'C017', 'native-cancel', '..\\C015', 'https://example.invalid',
    'C:\\private', 'closed-history ', 'constructor', 'control-below; echo']) {
    const result = await classifier.inspect(id);
    assert.equal(result.valid, false);
    assert.equal(result.code, 'UNKNOWN_SOURCE_ID');
    assert.equal(result.decision, 'HOLD');
    assert.equal(result.denominatorVerified, false);
  }
  assert.equal((await classifier.inspect('closed-history', { context: 'forged' })).code, 'NO_INSPECTION_OVERRIDES');
  assert.equal((await classifier.compare('unknown')).code, 'UNKNOWN_COMPARISON_ID');
  assert.equal((await classifier.compare('retry', true)).valid, false);
  assert.throws(() => classifier.createSession({ history: [] }), /NO_SESSION_AUTHORITY_OR_HISTORY_IMPORT/);
});
for (const [name, text, code] of [
  ['empty', '', 'REQUIRED_JSON'],
  ['malformed', '{', 'INVALID_JSON'],
  ['duplicate', '{"schema":1,"schema":2}', 'DUPLICATE_FIELD'],
  ['escaped duplicate', '{"schema":1,"\\u0073chema":2}', 'DUPLICATE_FIELD'],
  ['infinite exponent', '{"n":1e9999}', 'UNSAFE_NUMBER_LITERAL'],
  ['unsafe integer', '{"n":9007199254740993}', 'UNSAFE_NUMBER_LITERAL'],
  ['precision loss', '{"n":0.10000000000000000001}', 'UNSAFE_NUMBER_LITERAL'],
  ['negative zero', '{"n":-0}', 'UNSAFE_NUMBER_LITERAL'],
  ['oversized', '{' + ' '.repeat(classifier.MAX_BYTES + 1) + '}', 'JSON_OVERSIZE'],
  ['deep', '['.repeat(19) + '0' + ']'.repeat(19), 'JSON_DEPTH'],
  ['prototype', '{"__proto__":{}}', 'OWN_DATA_FIELDS']
]) {
  test(`${name} JSON is rejected while all known historical original failures stay failures`, async () => {
    const basis = await classifier.inspect('closed-history');
    const result = await classifier.inspectCopy(text, 'closed-history');
    assert.equal(result.valid, false);
    assert.equal(result.code, code);
    assert.equal(result.decision, 'FAIL');
    assert.deepEqual(result.originals, basis.originals);
    assert.deepEqual(result.counts, basis.counts);
    assert.equal(result.protectiveRejection, true);
    assert.equal(result.actualUserMutationSuccess, false);
    assert.equal(result.candidateAdopted, false);
  });
}
test('all closed sources support exact-copy inspection but never adopt supplied authority', async () => {
  for (const id of classifier.ids) {
    const text = await classifier.sourceJson(id);
    const result = await classifier.inspectCopy(text, id);
    assert.equal(result.valid, true, `${id}: ${result.code}`);
    assert.equal(result.copyAccepted, true);
    assert.equal(result.candidateAdopted, false);
    assert.equal(result.userSuppliedAuthorityAdopted, false);
  }
});
for (const field of ['eligibleForLiveRun', 'verdict', 'approval', 'currentContext', 'authority', 'sha256']) {
  test(`forged ${field} never becomes authority or replaces known originals`, async () => {
    const copy = JSON.parse(await classifier.sourceJson('closed-history'));
    copy[field] = field === 'currentContext' ? { runId: 'synthetic-run-001', epoch: 3 } : true;
    const result = await classifier.inspectCopy(JSON.stringify(copy), 'closed-history');
    assert.equal(result.valid, false);
    assert.equal(result.code, 'TAMPERED_OR_FORGED_SOURCE_COPY');
    assert.equal(result.counts.fail, 2);
    assert.equal(result.decision, 'FAIL');
  });
}
test('changed original ID, context, terminal, timing, history or scope rejects exact-copy binding', async () => {
  const text = await classifier.sourceJson('closed-history');
  const mutations = [
    (copy) => { copy.sourceId = 'held-snapshot'; },
    (copy) => { copy.evidence.snapshot.history.pop(); },
    (copy) => { copy.evidence.snapshot.history[2].attemptId = 'replacement'; },
    (copy) => { copy.evidence.snapshot.history[2].original.budgetMs = 12000; },
    (copy) => { copy.evidence.snapshot.history[2].endedAt -= 1000; },
    (copy) => { copy.evidence.snapshot.history[3].outcome = 'observed'; },
    (copy) => { copy.evidence.snapshot.events.reverse(); },
    (copy) => { copy.evidence.source = { kind: 'current-authority' }; }
  ];
  for (const mutate of mutations) {
    const copy = JSON.parse(text);
    mutate(copy);
    const result = await classifier.inspectCopy(JSON.stringify(copy), 'closed-history');
    assert.equal(result.valid, false);
    assert.equal(result.code, 'TAMPERED_OR_FORGED_SOURCE_COPY');
    assert.equal(result.counts.fail, 2);
    assert.equal(result.decision, 'FAIL');
  }
});
test('wrong copy types never receive default data or success-shaped fallback', async () => {
  for (const text of ['null', 'true', '0', '[]', '{}', '"closed-history"']) {
    const result = await classifier.inspectCopy(text, 'held-snapshot');
    assert.equal(result.valid, false);
    assert.equal(result.counts.hold, 1);
    assert.equal(result.decision, 'HOLD');
  }
});
test('own-data boundary rejects accessors, symbols, hidden fields, prototypes, sparse arrays, cycles and nonfinite numbers', () => {
  let invoked = false;
  const accessor = { get type() { invoked = true; return 'inspect'; } };
  const hidden = Object.defineProperty({}, 'type', { value: 'inspect' });
  const inherited = Object.create({ type: 'inspect' });
  const sparse = new Array(1);
  const extended = Object.assign([], { x: 1 });
  const cycle = {}; cycle.self = cycle;
  const symbol = { [Symbol('authority')]: true };
  for (const data of [accessor, hidden, inherited, sparse, extended, cycle, symbol,
    new Date(), new Map(), NaN, Infinity, -Infinity, -0, 9007199254740992, undefined, () => {}, 1n]) {
    assert.throws(() => classifier.ownData(data));
  }
  assert.equal(invoked, false);
  const safe = Object.assign(Object.create(null), { type: 'inspect', id: 'closed-history' });
  assert.deepEqual(classifier.ownData(safe), { type: 'inspect', id: 'closed-history' });
});
