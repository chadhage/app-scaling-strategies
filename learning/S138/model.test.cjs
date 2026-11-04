'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('./model.js');

test('a preserved cursor actually observes six correctly ordered profiles after migration', () => {
  let state = model.openFirstPage(model.createState());
  state = model.migrate(state, 'preserved');
  state = model.reuseCursor(state, model.SAVED_CURSOR);
  state = model.check(state);
  assert.equal(state.audit.verdict, 'positive');
  assert.equal(state.audit.observed, 6);
});

function received(condition = 'preserved') {
  return model.reuseCursor(
    model.migrate(model.openFirstPage(model.createState()), condition),
    model.SAVED_CURSOR,
  );
}

function checked(condition) {
  return model.check(received(condition));
}

test('a short first page retains its opaque token and remains nonterminal', () => {
  const state = model.openFirstPage(model.createState());
  assert.equal(state.version, 'v1');
  assert.equal(state.savedCursor, state.pages[0].response.nextCursor);
  assert.equal(state.pages[0].response.endOfSnapshot, false);
  assert.equal(state.pages[0].response.items.length, 3);
  assert.equal(state.pages[0].request.pageLimit, 4);
  assert.equal(model.measure(state).missingIds, null);
  assert.equal(state.audit, null);
});

test('the v2 request reuses the exact v1 cursor, query, snapshot and client schema', () => {
  const state = received();
  const [first, second] = state.pages;
  assert.deepEqual(first.request, { ...second.request, targetVersion: 'v1', cursor: null });
  assert.equal(second.request.cursor, first.response.nextCursor);
  assert.equal(second.request.clientVersion, 'v1');
  assert.equal(second.response.version, 'v2');
  assert.equal(second.response.cursorAccepted, true);
  assert.equal(second.kind, 'fixed-fictional-data');
  assert.deepEqual(first, model.openFirstPage(model.createState()).pages[0]);
  assert.equal(state.audit, null, '200 and an accepted cursor are not a checked verdict');
});

const cases = [
  ['preserved', 'positive', 6, 0, [], 0, 0, []],
  ['accepted-missing', 'interrupted', 5, 0, ['profile-05'], 0, 0, []],
  ['accepted-duplicate', 'interrupted', 7, 1, [], 0, 0, []],
  ['accepted-reorder', 'interrupted', 6, 0, [], 1, 0, []],
  ['changed-schema', 'interrupted', 6, 0, [], 0, 3, []],
  ['changed-snapshot', 'interrupted', 7, 0, [], 0, 0, ['profile-07']],
  ['unknown-completion', 'unknown', 4, 0, null, 0, 0, []],
  ['rejected-cursor', 'interrupted', 3, 0, null, 0, 0, []],
];

for (const [id, verdict, count, duplicates, missing, breaks, schema, unexpected] of cases) {
  test(`${id}: measure rows, duplicates, missing/unknown, order and schema instead of status alone`, () => {
    const state = checked(id);
    assert.equal(state.audit.verdict, verdict);
    assert.equal(state.audit.observed, count);
    assert.equal(state.audit.duplicateCount, duplicates);
    assert.deepEqual(state.audit.missingIds, missing);
    assert.equal(state.audit.orderBreaks.length, breaks);
    assert.equal(state.audit.schemaErrors.length, schema);
    assert.deepEqual(state.audit.unexpectedIds, unexpected);
    assert.equal(state.audit.snapshotMatches, id !== 'changed-snapshot');
    assert.equal(state.audit.evidenceLevel, 'local synthetic rehearsal only');
    assert.equal(state.history.length, 4);
    assert.equal(state.pages.length, 2);
    const last = state.pages[1].response;
    assert.equal(last.status, id === 'rejected-cursor' ? 410 : 200);
    assert.equal(last.cursorAccepted, id !== 'rejected-cursor');
    assert.equal(last.endOfSnapshot, missing === null ? null : true);
    assert.equal(state.history[3].verdict, verdict);
  });
}

test('unknown completion keeps unobserved IDs separate from unintended missing results', () => {
  const state = checked('unknown-completion');
  assert.equal(state.pages[1].response.nextCursor, null);
  assert.equal(state.pages[1].response.status, 200);
  assert.equal(state.pages[1].response.cursorAccepted, true);
  assert.equal(state.audit.completion, 'unknown');
  assert.equal(state.audit.missingIds, null);
  assert.deepEqual(state.audit.unobservedIds, ['profile-05', 'profile-06']);
  assert.match(state.audit.reasons.join(' '), /not certified missing/);
});

test('unknown completion cannot be promoted to success by editing a verdict, missing count, terminal flag or receipt', () => {
  const edits = [
    state => { state.audit.verdict = 'positive'; },
    state => { state.audit.missingIds = []; },
    state => { state.audit.terminalObserved = true; },
    state => { state.audit.completion = 'terminal observed'; },
    state => { state.pages[1].response.endOfSnapshot = true; },
  ];
  for (const edit of edits) {
    const state = JSON.parse(JSON.stringify(checked('unknown-completion')));
    edit(state);
    assert.throws(() => model.validateState(state), /altered/);
  }
  assert.equal(checked('unknown-completion').audit.verdict, 'unknown');
});

test('rejection retains the v1 page and does not fabricate a completion or retry', () => {
  const state = checked('rejected-cursor');
  assert.deepEqual(state.pages[0].response.items.map(row => row.id), model.CONTRACT.expectedIds.slice(0, 3));
  assert.deepEqual(state.pages[1].response.items, []);
  assert.equal(state.audit.terminalObserved, false);
  assert.equal(state.audit.verdict, 'interrupted');
  assert.equal(state.history.length, 4);
});

test('schema drift retains raw new-schema data while rejecting old-client compatibility', () => {
  const state = checked('changed-schema');
  assert.equal(state.pages[1].response.schemaVersion, 2);
  assert.equal(Object.hasOwn(state.pages[1].response.items[0], 'label'), false);
  assert.equal(typeof state.pages[1].response.items[0].name, 'string');
  assert.equal(state.audit.uniqueObserved, 6);
  assert.equal(state.audit.verdict, 'interrupted');
});

test('no duplicate or wrong-order result passes merely because all unique IDs were seen', () => {
  for (const id of ['accepted-duplicate', 'accepted-reorder']) {
    const state = checked(id);
    assert.equal(state.audit.uniqueObserved, 6);
    assert.deepEqual(state.audit.missingIds, []);
    assert.equal(state.audit.verdict, 'interrupted');
  }
});

test('all fixed receipts have strict observation types and bounded pages', () => {
  for (const { id } of model.SCENARIOS) {
    const state = checked(id);
    for (const page of state.pages) {
      assert.equal(typeof page.request.pageLimit, 'number');
      assert.ok(page.response.items.length <= model.CONTRACT.pageLimit);
      assert.equal(typeof page.response.status, 'number');
      assert.ok(page.response.cursorAccepted === null || typeof page.response.cursorAccepted === 'boolean');
      assert.ok(page.response.endOfSnapshot === null || typeof page.response.endOfSnapshot === 'boolean');
      assert.ok(page.response.nextCursor === null || typeof page.response.nextCursor === 'string');
      for (const row of page.response.items) {
        assert.equal(typeof row.id, 'string');
        assert.ok(Number.isSafeInteger(row.ordinal));
        assert.ok(row.schemaVersion === 1 || row.schemaVersion === 2);
      }
    }
  }
});

test('out-of-order and repeated steps cannot extend or mutate an attempt', () => {
  const ready = model.createState();
  const first = model.openFirstPage(ready);
  const migrated = model.migrate(first, 'preserved');
  const observed = received();
  const done = model.check(observed);
  const operations = [
    () => model.migrate(ready, 'preserved'),
    () => model.reuseCursor(first, model.SAVED_CURSOR),
    () => model.check(migrated),
    () => model.openFirstPage(first),
    () => model.migrate(migrated, 'preserved'),
    () => model.reuseCursor(observed, model.SAVED_CURSOR),
    () => model.check(done),
  ];
  const before = JSON.stringify([ready, first, migrated, observed, done]);
  operations.forEach(operation => assert.throws(operation, RangeError));
  assert.equal(JSON.stringify([ready, first, migrated, observed, done]), before);
});

test('typed condition IDs are exact, with no coercion or unbounded fixture input', () => {
  const first = model.openFirstPage(model.createState());
  for (const input of [undefined, null, true, 1, [], {}, new String('preserved'), '', ' preserved', 'preserved ', '__proto__']) {
    assert.throws(() => model.migrate(first, input), /condition|identifier/);
  }
  assert.equal(first.history.length, 1);
});

test('typed tokens are exact and never decoded, repaired or trimmed', () => {
  const state = model.migrate(model.openFirstPage(model.createState()), 'preserved');
  const before = JSON.stringify(state);
  for (const input of [undefined, null, true, 1, [], {}, new String(model.SAVED_CURSOR), '', ` ${model.SAVED_CURSOR}`, `${model.SAVED_CURSOR} `, 'teaching-cursor-s138', '<img src=x>']) {
    assert.throws(() => model.reuseCursor(state, input), /exact saved teaching cursor/);
  }
  assert.equal(JSON.stringify(state), before);
});

const corruptions = [
  ['string state version', s => { s.stateVersion = '1'; }],
  ['boolean state version', s => { s.stateVersion = true; }],
  ['missing state key', s => { delete s.audit; }],
  ['extra state key', s => { s.unowned = 'data'; }],
  ['wrong phase', s => { s.phase = 'ready'; }],
  ['wrong version', s => { s.version = 'v1'; }],
  ['wrong condition', s => { s.scenarioId = 'changed-schema'; }],
  ['altered saved cursor', s => { s.savedCursor += ' '; }],
  ['history deletion', s => { s.history.pop(); }],
  ['history mutation', s => { s.history[0].note = 'invented'; }],
  ['request token mutation', s => { s.pages[1].request.cursor = null; }],
  ['request snapshot mutation', s => { s.pages[1].request.snapshotId = 's138-live-snapshot-v2'; }],
  ['request dataset mutation', s => { s.pages[1].request.datasetId = 'other'; }],
  ['request order mutation', s => { s.pages[1].request.order = 'ordinal DESC'; }],
  ['request schema mutation', s => { s.pages[1].request.schema = 'profile-v2'; }],
  ['request client version mutation', s => { s.pages[1].request.clientVersion = 'v2'; }],
  ['request page limit coercion', s => { s.pages[1].request.pageLimit = '4'; }],
  ['response status coercion', s => { s.pages[1].response.status = '200'; }],
  ['response accepted coercion', s => { s.pages[1].response.cursorAccepted = 'true'; }],
  ['response completion coercion', s => { s.pages[1].response.endOfSnapshot = 'true'; }],
  ['response token fabrication', s => { s.pages[1].response.nextCursor = model.SAVED_CURSOR; }],
  ['response version mutation', s => { s.pages[1].response.version = 'v1'; }],
  ['response snapshot mutation', s => { s.pages[1].response.snapshotId = 'other'; }],
  ['response schema coercion', s => { s.pages[1].response.schemaVersion = '1'; }],
  ['result deletion', s => { s.pages[1].response.items.pop(); }],
  ['result duplication', s => { s.pages[1].response.items[1] = s.pages[1].response.items[0]; }],
  ['result reordering', s => { s.pages[1].response.items.reverse(); }],
  ['result label mutation', s => { s.pages[1].response.items[0].label = 'invented'; }],
  ['result ordinal coercion', s => { s.pages[1].response.items[0].ordinal = '4'; }],
  ['result ID mutation', s => { s.pages[1].response.items[0].id = 'other'; }],
  ['fake checked audit', s => { s.audit = { verdict: 'positive' }; }],
  ['hidden extra property', s => { Object.defineProperty(s, 'hidden', { value: true }); }],
  ['accessor property', s => { Object.defineProperty(s, 'stateVersion', { enumerable: true, get() { throw new Error('Getter must never run'); } }); }],
  ['symbol property', s => { s[Symbol('extra')] = true; }],
  ['unsafe numeric value', s => { s.stateVersion = NaN; }],
  ['sparse result array', s => { delete s.pages[1].response.items[1]; }],
];

for (const [name, corrupt] of corruptions) {
  test(`canonical typed state guard rejects ${name}`, () => {
    const state = JSON.parse(JSON.stringify(received()));
    corrupt(state);
    assert.throws(() => model.validateState(state), /State|condition|identifier/);
    assert.throws(() => model.check(state));
  });
}

test('null, primitive, custom-prototype and oversized records are not accepted states', () => {
  for (const input of [null, undefined, true, 1, 'ready', [], new Date(), Object.create(null)]) {
    assert.throws(() => model.measure(input));
  }
  const state = JSON.parse(JSON.stringify(received()));
  state.pages = Array(17).fill(state.pages[0]);
  assert.throws(() => model.validateState(state));
});

test('independent attempts are deterministic, deeply frozen, and reset has no retained hidden state', () => {
  const done = checked('accepted-duplicate');
  assert.deepEqual(done, checked('accepted-duplicate'));
  assert.ok(Object.isFrozen(done.pages[0].response.items[0]));
  assert.ok(Object.isFrozen(done.audit.observedIds));
  assert.throws(() => { done.audit.verdict = 'positive'; }, TypeError);
  assert.throws(() => { done.history.push({}); }, TypeError);
  const reset = model.createState();
  assert.deepEqual(reset, model.createState());
  assert.deepEqual(reset.pages, []);
  assert.deepEqual(reset.history, []);
  assert.equal(reset.savedCursor, null);
  assert.equal(done.audit.verdict, 'interrupted');
});
