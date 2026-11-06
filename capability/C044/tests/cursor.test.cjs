'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const cursors = require('../cursor.js');

const run = 'synthetic-run-001';
const view = { runId: run, epoch: 3, headSeq: 20, firstRetainedSeq: 13, replayWindow: 8 };

test('ids round-trip and only canonical run:epoch:sequence strings parse', () => {
  const id = cursors.format(run, 3, 42);
  assert.equal(id, 'synthetic-run-001:3:42');
  assert.deepEqual(cursors.parse(id), { ok: true, cursor: { runId: run, epoch: 3, seq: 42 } });
  for (const bad of ['', ' synthetic-run-001:3:42', 'synthetic-run-001:3:42 ', 'synthetic-run-001:3:042', 'synthetic-run-001:03:42',
    'synthetic-run-001:3:0', 'synthetic-run-001:0:1', 'synthetic-run-1:3:1', 'synthetic-run-001:3', 'synthetic-run-001:3:1:1',
    'synthetic-run-001:3:-1', 'synthetic-run-001:3:1e3', 'synthetic-run-001:3:1.5', 'synthetic-run-001:3:9999999999',
    'synthetic-run-001:3:١', 'real-run-001:3:1', 'synthetic-run-001:3:1\n', null, undefined, 7, {}]) {
    assert.deepEqual(cursors.parse(bad), { ok: false }, `must reject ${String(bad)}`);
  }
});

test('format refuses anything that would not parse back', () => {
  for (const args of [['x', 1, 1], [run, 0, 1], [run, 1, 0], [run, 1.5, 1], [run, 1, 2 ** 40], [run, '1', 1], [undefined, 1, 1]]) {
    assert.throws(() => cursors.format(...args), TypeError);
  }
});

test('the failure table is closed: every code has a group, status, fixed reason and known allowed actions', () => {
  assert.ok(cursors.codes.length >= 13);
  for (const code of cursors.codes) {
    const entry = cursors.map[code];
    assert.ok(entry.group && entry.status >= 400 && entry.reason.length > 20, code);
    assert.ok(entry.actions.length > 0 && entry.actions.every((name) => Object.hasOwn(cursors.actions, name)), code);
    assert.ok(entry.actions.includes('stop'));
  }
  assert.equal(cursors.map.UNRECOGNIZED_ERROR.status, 0);
  assert.deepEqual(cursors.map.UNRECOGNIZED_ERROR.actions, ['confirm-operator-review', 'stop']);
  assert.equal(Object.isFrozen(cursors.map), true);
  assert.equal(Object.isFrozen(cursors.actions.stop), true);
});

test('failure() builds the typed body and never echoes unvalidated input', () => {
  const failure = cursors.failure('CURSOR_EXPIRED', view, 'synthetic-run-001:3:2');
  assert.equal(failure.ok, false);
  assert.equal(failure.status, 410);
  assert.deepEqual(failure.context, { runId: run, epoch: 3, headSeq: 20, firstRetainedSeq: 13, replayWindow: 8, cursor: { runId: run, epoch: 3, seq: 2 } });
  assert.deepEqual(failure.allowedActions.map((item) => item.action), ['resync-from-snapshot', 'reinspect', 'stop']);
  const hostile = cursors.failure('CURSOR_MALFORMED', { runId: '<script>', epoch: -1, headSeq: 1.5, firstRetainedSeq: '1', replayWindow: NaN }, '<script>alert(1)</script>');
  assert.deepEqual(hostile.context, { runId: null, epoch: null, headSeq: null, firstRetainedSeq: null, replayWindow: null, cursor: null });
  assert.equal(cursors.failure('NOT_A_CODE').error.code, 'UNRECOGNIZED_ERROR');
  assert.equal(cursors.failure('NOT_FOUND', null).context.runId, null, 'a missing view never throws');
  assert.equal(cursors.failure('NOT_FOUND', 'text').context.headSeq, null);
  assert.equal(cursors.failure('CURSOR_EXPIRED').context.cursor, null);
  assert.equal(cursors.failure('CURSOR_EXPIRED', undefined, { runId: run, epoch: 3, seq: 4 }).context.cursor.seq, 4);
  assert.equal(Object.isFrozen(failure) && Object.isFrozen(failure.allowedActions[0]), true);
});

test('resolve() classifies every cursor and lets the header win over a stale query cursor', () => {
  const id = (seq, runId = run, epoch = 3) => cursors.format(runId, epoch, seq);
  assert.deepEqual(cursors.resolve(view, { query: [] }), { ok: true, source: 'none', afterSeq: null, cursor: null });
  assert.equal(cursors.resolve(view, {}).source, 'none');
  assert.equal(cursors.resolve(view, { header: id(15), query: [id(2)] }).afterSeq, 15);
  assert.equal(cursors.resolve(view, { query: [id(15)] }).source, 'query');
  assert.equal(cursors.resolve(view, { header: id(12) }).afterSeq, 12, 'N + 1 = first retained is the oldest resumable cursor');
  assert.equal(cursors.resolve(view, { header: id(20) }).afterSeq, 20, 'the head itself resumes with nothing to replay');
  const expect = (input, code) => {
    const result = cursors.resolve(view, input);
    assert.equal(result.ok, false);
    assert.equal(result.failure.error.code, code);
  };
  expect({ header: id(11) }, 'CURSOR_EXPIRED');
  expect({ header: id(21) }, 'CURSOR_FROM_FUTURE');
  expect({ header: id(15, 'synthetic-run-002') }, 'CURSOR_RUN_MISMATCH');
  expect({ header: id(15, run, 2) }, 'CURSOR_EPOCH_MISMATCH');
  expect({ header: id(15, run, 4) }, 'CURSOR_EPOCH_MISMATCH');
  expect({ header: 'x' }, 'CURSOR_MALFORMED');
  expect({ header: '' }, 'CURSOR_MALFORMED');
  expect({ query: ['x'] }, 'CURSOR_MALFORMED');
  expect({ query: [id(1), id(2)] }, 'CURSOR_MALFORMED');
  expect({ header: 'synthetic-run-001:3:1, synthetic-run-001:3:2' }, 'CURSOR_MALFORMED');
});

test('resolve() checks attribution before the window so a foreign cursor is never called merely old', () => {
  const result = cursors.resolve(view, { header: cursors.format('synthetic-run-002', 3, 1) });
  assert.equal(result.failure.error.code, 'CURSOR_RUN_MISMATCH');
  assert.equal(cursors.resolve({ ...view, headSeq: 0, firstRetainedSeq: 1 }, { header: cursors.format(run, 3, 1) }).failure.error.code, 'CURSOR_FROM_FUTURE');
});

test('inspectFailure() accepts exactly the server body and degrades anything else to UNRECOGNIZED_ERROR', () => {
  const sample = JSON.parse(JSON.stringify(cursors.failure('CURSOR_EXPIRED', view, 'synthetic-run-001:3:2')));
  assert.equal(cursors.inspectFailure(sample).error.code, 'CURSOR_EXPIRED');
  assert.deepEqual(cursors.inspectFailure(sample).context.cursor, { runId: run, epoch: 3, seq: 2 });
  const mutations = {
    'unknown code': (value) => { value.error.code = 'SOMETHING_ELSE'; },
    'wrong status': (value) => { value.status = 200; },
    'wrong group': (value) => { value.error.group = 'x'; },
    'changed reason': (value) => { value.error.message = 'all good'; },
    'ok true': (value) => { value.ok = true; },
    'schema version': (value) => { value.schemaVersion = 2; },
    'extra field': (value) => { value.extra = 1; },
    'missing context': (value) => { delete value.context; },
    'business data': (value) => { value.businessData = 'real'; },
    'local only': (value) => { value.localOnly = false; },
    'actions not array': (value) => { value.allowedActions = 'stop'; },
    'extra action': (value) => { value.allowedActions.push({ action: 'delete-everything', label: 'x', description: 'y' }); },
    'action order': (value) => { value.allowedActions.reverse(); },
    'action label': (value) => { value.allowedActions[0].label = 'Trust me'; },
    'action not record': (value) => { value.allowedActions[0] = 'resync-from-snapshot'; },
    'action not string': (value) => { value.allowedActions[0].action = { toString: () => 'resync-from-snapshot' }; },
    'cursor not canonical': (value) => { value.context.cursor = { runId: run, epoch: 3, seq: 0 }; },
    'cursor not record': (value) => { value.context.cursor = 5; },
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const value = JSON.parse(JSON.stringify(sample));
    mutate(value);
    assert.equal(cursors.inspectFailure(value).error.code, 'UNRECOGNIZED_ERROR', name);
  }
  const accessor = Object.defineProperty({ ...sample }, 'status', { get() { throw new Error('accessor'); }, enumerable: true });
  for (const hostile of [null, undefined, 3, 'text', [], accessor, Object.create({ inherited: true }), Object.create(sample)]) {
    assert.equal(cursors.inspectFailure(hostile).error.code, 'UNRECOGNIZED_ERROR');
  }
  assert.equal(cursors.inspectFailure(cursors.failure('NOT_FOUND', view)).error.code, 'NOT_FOUND');
});

test('every table code survives a JSON round trip through inspectFailure', () => {
  for (const code of cursors.codes) {
    const wire = JSON.parse(JSON.stringify(cursors.failure(code, view, 'synthetic-run-001:3:5')));
    assert.equal(cursors.inspectFailure(wire).error.code, code);
  }
});
