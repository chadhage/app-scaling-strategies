'use strict';

// Specified in K-C034.feature: saved history, accepted gates and the known context are read only from exact sources and fail closed.
const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const { freshLoad } = require('./fixtures/fresh-modules.cjs');
const trace = require('..\\trace.js');
const pinsApi = require('..\\pins.cjs');
const { makeState } = require('..\\..\\C015\\contract.cjs');

const historicalPath = require.resolve('..\\historical.cjs');
const pinsPath = require.resolve('..\\pins.cjs');
const tracePath = require.resolve('..\\trace.js');
const storePath = require.resolve('..\\..\\C015\\store.cjs');
const accepted = pinsApi.pins.accepted;
const code = (expected) => (error) => error.code === expected && error.message === expected;

const fixtureGates = () => ({
  observedAtUtc: '2026-11-04T00:00:00.000Z', readerPid: 1, ledgerRevision: 1,
  cards: ['C020', 'C015', 'C033'].map((id) => ({
    id, state: 'Done', publication: structuredClone(accepted[id]), reviewCommit: accepted[id].commit, reviewTag: accepted[id].tag,
    accepted: true, focusedTestsPassed: true, browserObserved: true, remoteVerified: true
  }))
});
const receiptFor = (runId, overrides = {}) => ({
  schemaVersion: 1, mode: 'actual-local-filesystem', restored: true, namespace: 'synthetic-restart-v1', pid: 4242,
  state: makeState(runId, 3), acknowledgment: { kind: 'fixture' }, stateSha256: 'a'.repeat(64), history: [],
  source: 'fixture', writesPerformed: 0, directoryDurability: 'not-guaranteed', powerLossGuarantee: false, ...overrides
});
const storeReturning = (overrides) => ({ restore: async (namespace, runId) => receiptFor(runId, overrides) });

// Loads a fresh historical.cjs whose gate reader, store, pins or trace come from fixtures instead of the live ledger and C015 storage.
function load({ gates = fixtureGates(), store, pins, replacementTrace } = {}) {
  const original = childProcess.execFileSync;
  childProcess.execFileSync = () => Buffer.from(JSON.stringify(gates));
  const replacements = {};
  if (store) replacements[storePath] = store;
  if (pins) replacements[pinsPath] = pins;
  if (replacementTrace) replacements[tracePath] = replacementTrace;
  try {
    return freshLoad(historicalPath, replacements);
  } finally {
    childProcess.execFileSync = original;
  }
}
const pinsWith = (mutate) => ({ ...pinsApi, readPinned: (entry) => mutate(entry, pinsApi.readPinned(entry)) });
const text = (bytes) => bytes.toString('utf8');
const reportWith = (change) => pinsWith((entry, bytes) => (entry.path.endsWith('summary.json') ? Buffer.from(JSON.stringify(change(JSON.parse(text(bytes))))) : bytes));
const pageWith = (change) => pinsWith((entry, bytes) => (entry.path.endsWith('reset-history.html') ? Buffer.from(change(text(bytes))) : bytes));

test('both closed traces are read from exact pinned sources, never from caller input', () => {
  const historical = load();
  const result = historical.readHistorical();
  assert.deepEqual(result.observations.map((entry) => entry.id), trace.ids);
  assert.equal(result.imports.length, pinsApi.pins.dependencies.length);
  assert.equal(result.source.newLiveRunAttested, false);
  assert.ok(result.replacementSummary);
  assert.throws(() => historical.readHistorical('C:\\caller.json'), code('NO_SOURCE_OVERRIDES'));
});

test('a saved page with a missing or duplicated state element is refused', () => {
  assert.throws(() => load({ pins: pageWith((html) => html.replace('<pre id="state"', '<pre id="stat"')) }).readHistorical(), code('EXACT_SAVED_DOM_REQUIRED'));
  assert.throws(() => load({ pins: pageWith((html) => `${html}<pre id="state">{}</pre>`) }).readHistorical(), code('EXACT_SAVED_DOM_REQUIRED'));
});

test('a saved page whose events or history panels differ from its state is refused', () => {
  const replacePanel = (id, content) => (html) => html.replace(new RegExp(`(<pre id="${id}"[^>]*>)[\\s\\S]*?(</pre>)`), `$1${content}$2`);
  assert.throws(() => load({ pins: pageWith(replacePanel('events', '[]')) }).readHistorical(), code('SAVED_DOM_PANELS_DIFFER'));
  assert.throws(() => load({ pins: pageWith(replacePanel('history', '["changed"]')) }).readHistorical(), code('SAVED_DOM_PANELS_DIFFER'));
});

test('a snapshot that fails closed validation is refused with its own closed code', () => {
  const replacementTrace = { ...trace, validateSnapshot: () => ({ valid: false, code: 'FIXTURE_INVALID_SNAPSHOT' }) };
  assert.throws(() => load({ replacementTrace }).readHistorical(), code('FIXTURE_INVALID_SNAPSHOT'));
});

test('a historical report outside the exact accepted browser scope is refused field by field', () => {
  for (const [name, change] of [
    ['card', (report) => ({ ...report, cardId: 'C999' })],
    ['outcome', (report) => ({ ...report, outcome: 'failed' })],
    ['browser version', (report) => ({ ...report, browserVersion: '1.0.0.0' })],
    ['playwright version', (report) => ({ ...report, playwrightVersion: '0.0.0' })],
    ['signature', (report) => ({ ...report, actualSignedEdge: { ...report.actualSignedEdge, authenticodeStatus: 'NotSigned' } })],
    ['helper digest', (report) => ({ ...report, helperRawSha256: '0'.repeat(64) })],
    ['cleanup', (report) => ({ ...report, cleanup: Object.fromEntries(Object.keys(report.cleanup).map((key, index) => [key, index !== 0])) })]
  ]) {
    assert.throws(() => load({ pins: reportWith(change) }).readHistorical(), code('HISTORICAL_REPORT_SCOPE'), name);
  }
});

test('exactly the three accepted independent gates are required, and any drift in any field is refused', () => {
  const historical = load();
  assert.deepEqual(historical.readAcceptedGates().cards.map((card) => card.id), ['C020', 'C015', 'C033']);
  assert.throws(() => historical.readAcceptedGates({ approved: true }), code('NO_GATE_OVERRIDES'));
  const mutateFirst = (change) => (gates) => ({ ...gates, cards: gates.cards.map((card, index) => (index === 0 ? change(card) : card)) });
  const cases = [
    ['too few cards', (gates) => ({ ...gates, cards: gates.cards.slice(1) }), 'ACCEPTED_GATES_REQUIRED'],
    ['unknown card', mutateFirst((card) => ({ ...card, id: 'C999' })), 'EXACT_INDEPENDENT_ACCEPTANCE_REQUIRED'],
    ['not done', mutateFirst((card) => ({ ...card, state: 'In Progress' })), 'EXACT_INDEPENDENT_ACCEPTANCE_REQUIRED'],
    ['publication', mutateFirst((card) => ({ ...card, publication: { ...card.publication, tag: 'kanban/C020/other' } })), 'EXACT_INDEPENDENT_ACCEPTANCE_REQUIRED'],
    ['review commit', mutateFirst((card) => ({ ...card, reviewCommit: '0'.repeat(40) })), 'EXACT_INDEPENDENT_ACCEPTANCE_REQUIRED'],
    ['review tag', mutateFirst((card) => ({ ...card, reviewTag: 'kanban/C020/other' })), 'EXACT_INDEPENDENT_ACCEPTANCE_REQUIRED'],
    ...['accepted', 'focusedTestsPassed', 'browserObserved', 'remoteVerified'].map((field) =>
      [field, mutateFirst((card) => ({ ...card, [field]: false })), 'EXACT_INDEPENDENT_ACCEPTANCE_REQUIRED'])
  ];
  for (const [name, mutate, expected] of cases) assert.throws(() => load({ gates: mutate(fixtureGates()) }).readAcceptedGates(), code(expected), name);
});

test('the known context is the actual read-only C015 restore of exactly the closed fixture state', async () => {
  const historical = load({ store: storeReturning({}) });
  const context = await historical.readContext();
  assert.equal(context.association, 'declared-fixture-association-only-not-client-run-correlation');
  assert.equal(context.receipt.writesPerformed, 0);
  assert.deepEqual(context.gatesObserved.cards.map((card) => card.id), ['C020', 'C015', 'C033']);
  assert.ok(context.readStartedAtUtc <= context.readCompletedAtUtc);
  await assert.rejects(historical.readContext('synthetic-run-002'), code('NO_CONTEXT_OVERRIDES'));
  for (const [name, overrides] of [
    ['not restored', { restored: false }],
    ['wrote while reading', { writesPerformed: 1 }],
    ['state outside the closed fixture', { state: { ...makeState('synthetic-run-001', 3), extra: true } }]
  ]) {
    await assert.rejects(load({ store: storeReturning(overrides) }).readContext(), code('ACTUAL_KNOWN_CONTEXT_REQUIRED'), name);
  }
});

test('a capture bundle holds both closed traces with the same exact source and known context', async () => {
  const historical = load({ store: storeReturning({}) });
  const bundle = await historical.buildBundle();
  assert.equal(bundle.bundleVersion, 1);
  assert.equal(bundle.cardId, 'C034');
  assert.deepEqual(bundle.traces.map((entry) => entry.id), trace.ids);
  for (const entry of bundle.traces) {
    assert.equal(entry.traceFormat, 'C034-saved-client-trace/1');
    assert.equal(entry.context.receipt.writesPerformed, 0);
    assert.equal(entry.source.newLiveRunAttested, false);
    assert.equal(trace.validateSnapshot(entry.snapshot).valid, true);
  }
  await assert.rejects(historical.buildBundle({ provenance: 'live' }), code('NO_CAPTURE_INPUT_OVERRIDES'));
});
