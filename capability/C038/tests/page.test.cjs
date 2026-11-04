'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { fixtureSubject } = require('./support.cjs');
const { runPage } = require('./dom-stub.cjs');
const text = (document, id) => document.element(id).textContent;
const pick = async (document, id) => { document.element('fixture').value = id; await document.element('load').click(); };
const inspect = async (document, id) => { await pick(document, id); await document.element('inspect').click(); };
const lines = (document) => document.element('history').children.map((item) => item.textContent);
const cells = (row) => row.children.map((cell) => cell.textContent);
test('setup lists every closed fixture, the explicit inventory, the context origin and all-false native flags', async () => {
  const readiness = fixtureSubject();
  const document = await runPage(readiness);
  const options = document.element('fixture').children;
  assert.deepEqual(options.map((item) => item.value), [...readiness.ids]);
  assert.ok(options.every((item) => item.textContent === item.value.replaceAll('-', ' ')));
  const inventory = JSON.parse(text(document, 'inventory'));
  assert.equal(inventory.complete, true);
  assert.equal(inventory.instances.length, 2);
  assert.equal(JSON.parse(text(document, 'context')).origin, (await readiness.open()).snapshot().ownerContextOrigin);
  const flags = JSON.parse(text(document, 'native-flags'));
  assert.deepEqual(flags, { ...readiness.flags });
  assert.ok(Object.values(flags).every((value) => value === false));
  assert.deepEqual(['load', 'copy', 'inspect', 'compare', 'reset'].map((id) => document.element(id).disabled),
    [false, false, false, true, false]);
});
test('every element id page.js touches exists in the real index.html', async () => {
  const document = await runPage(fixtureSubject());
  await inspect(document, 'single-probe');
  await inspect(document, 'complete');
  await document.element('compare').click();
  await document.element('copy').click();
  for (let index = 0; index < 8; index++) {
    document.element('candidate').value = '{}';
    await document.element('inspect').click();
  }
  await document.element('reset').click();
  for (const id of document.requested) assert.ok(document.elements.has(id), `index.html lacks #${id}`);
  assert.deepEqual([...document.requested].sort(), ['candidate', 'compare', 'comparison', 'context', 'copy', 'coverage',
    'coverage-count', 'error', 'fixture', 'historical', 'history', 'history-limit', 'inspect', 'inventory', 'load',
    'missing', 'native-flags', 'reset', 'status']);
});
test('an unpicked fixture reports UNKNOWN_FIXTURE_ID instead of loading a default positive', async () => {
  const document = await runPage(fixtureSubject());
  await document.element('load').click();
  assert.equal(text(document, 'error'), 'UNKNOWN_FIXTURE_ID');
  assert.equal(document.element('candidate').value, '');
  assert.equal(document.element('history').children.length, 0);
});
test('a loader error without a code still reports UNKNOWN_FIXTURE_ID', async () => {
  const real = fixtureSubject();
  const readiness = { ...real, open: async () => ({ ...(await real.open()), getEvidence() { throw new Error('plain'); } }) };
  const document = await runPage(readiness);
  await pick(document, 'complete');
  assert.equal(text(document, 'error'), 'UNKNOWN_FIXTURE_ID');
});
test('load, select-for-copy and inspect a single probe: UNKNOWN / HOLD, 1 / 6 and one retained original', async () => {
  const document = await runPage(fixtureSubject());
  await pick(document, 'single-probe');
  assert.equal(text(document, 'status'), 'JSON copy loaded — no readiness decision made.');
  assert.equal(document.element('status').dataset.decision, 'LOADED');
  assert.equal(JSON.parse(document.element('candidate').value).roundId, 'fictional-C038-round-01');
  await document.element('copy').click();
  assert.equal(document.activeElement, document.element('candidate'));
  assert.equal(document.element('candidate').selected, true);
  assert.equal(text(document, 'status'), 'JSON selected for copy. Press Ctrl+C. No readiness decision made.');
  await document.element('inspect').click();
  assert.equal(document.element('status').dataset.decision, 'UNKNOWN');
  assert.equal(text(document, 'status'), 'UNKNOWN / HOLD — INCOMPLETE_OR_UNKNOWN_REQUIRED_EVIDENCE');
  assert.equal(text(document, 'coverage-count'), '1 / 6');
  const rows = document.element('coverage').children;
  assert.equal(rows.length, 6);
  assert.deepEqual(cells(rows[0]).slice(0, 4), ['fictional-C038-node-a', 'service', 'FRESH_READY', '5']);
  assert.match(text(document, 'missing'), /^Missing \/ held: /);
  assert.deepEqual(lines(document), ['1. fictional-C038-round-01 — UNKNOWN / INCOMPLETE_OR_UNKNOWN_REQUIRED_EVIDENCE; fresh 1/6. Original retained.']);
  assert.equal(document.element('compare').disabled, true);
  assert.equal(JSON.parse(text(document, 'historical')).actualC034HistoryRemainsUnlinked, true);
  assert.equal(text(document, 'error'), '');
});
test('a later complete round is the sole synthetic positive and compare shows both originals unchanged', async () => {
  const document = await runPage(fixtureSubject());
  await inspect(document, 'single-probe');
  await inspect(document, 'complete');
  assert.equal(document.element('status').dataset.decision, 'CLOSED_SYNTHETIC_READY');
  assert.equal(text(document, 'status'), 'CLOSED_SYNTHETIC_READY / INSPECT_ONLY — COMPLETE_FRESH_CLOSED_SYNTHETIC_COVERAGE');
  assert.equal(text(document, 'coverage-count'), '6 / 6');
  assert.equal(text(document, 'missing'), 'No required fictional observations missing. Actual pool still UNKNOWN.');
  assert.equal(lines(document).length, 2);
  assert.equal(document.element('compare').disabled, false);
  await document.element('compare').click();
  const comparison = JSON.parse(text(document, 'comparison'));
  assert.equal(comparison.previousOriginal.decision, 'UNKNOWN');
  assert.equal(comparison.currentOriginal.decision, 'CLOSED_SYNTHETIC_READY');
  assert.deepEqual([comparison.previousOriginalUnchanged, comparison.comparisonDoesNotProveScaling, comparison.actualPoolReady],
    [true, true, false]);
});
test('a replayed original is rejected with its code, unknown ages and a retained history entry', async () => {
  const document = await runPage(fixtureSubject());
  await inspect(document, 'complete');
  await inspect(document, 'complete');
  assert.equal(text(document, 'error'), 'REPLAYED_ORIGINAL_ROUND');
  assert.equal(text(document, 'missing'), 'Missing / held: REPLAYED_ORIGINAL_ROUND');
  assert.ok(document.element('coverage').children.every((row) => cells(row)[3] === 'UNKNOWN'));
  assert.equal(lines(document).length, 2);
});
test('actual saved C034 history is shown unlinked with its failures and is never joined to the current lease', async () => {
  const document = await runPage(fixtureSubject());
  await inspect(document, 'saved-closed-unlinked');
  assert.equal(document.element('status').dataset.decision, 'UNKNOWN');
  const historical = JSON.parse(text(document, 'historical'));
  assert.equal(historical.actualHistoryJoinedToCurrentLease, false);
  const classes = historical.observations.attempts.map((item) => item.classification);
  assert.ok(classes.includes('failed') && classes.includes('unknown') && classes.includes('original-budget-exceeded'));
  assert.equal(text(document, 'coverage-count'), '0 / 6');
});
test('reset clears only the presentation, restores picker focus and keeps every retained original', async () => {
  const document = await runPage(fixtureSubject());
  await inspect(document, 'failed-node');
  const retained = lines(document);
  await document.element('reset').click();
  assert.equal(document.element('candidate').value, '');
  assert.equal(document.element('fixture').value, '');
  assert.equal(document.element('coverage').children.length, 0);
  assert.equal(text(document, 'coverage-count'), '0 / 6');
  assert.equal(text(document, 'comparison'), 'Display cleared. Originals and replay protection retained.');
  assert.equal(text(document, 'historical'), 'Display cleared; actual history remains UNLINKED.');
  assert.equal(text(document, 'error'), '');
  assert.equal(text(document, 'missing'), '');
  assert.equal(text(document, 'status'), 'UNKNOWN / HOLD — display reset only; no model, original or replay state reset.');
  assert.equal(document.element('status').dataset.decision, 'UNKNOWN');
  assert.equal(document.activeElement, document.element('fixture'));
  assert.deepEqual(lines(document), retained);
});
test('the ten-entry history limit refuses new work, disables load and inspect and survives reset', async () => {
  const document = await runPage(fixtureSubject());
  for (let index = 0; index < 10; index++) {
    document.element('candidate').value = '{}';
    await document.element('inspect').click();
  }
  assert.equal(lines(document).length, 10);
  assert.ok(lines(document).every((item) => item.includes('unknown original')));
  assert.match(text(document, 'history-limit'), /^HISTORY LIMIT: new inspections refused, not dropped\./);
  assert.deepEqual(['load', 'copy', 'inspect', 'compare', 'reset'].map((id) => document.element(id).disabled),
    [true, false, true, false, false]);
  const before = text(document, 'status');
  await document.element('inspect').click();
  assert.equal(text(document, 'status'), before);
  assert.equal(lines(document).length, 10);
  await document.element('reset').click();
  assert.equal(document.element('inspect').disabled, true);
  assert.equal(lines(document).length, 10);
});
test('an inspection in flight disables the controls and a forced second dispatch cannot adopt parallel input', async () => {
  const document = await runPage(fixtureSubject());
  await pick(document, 'single-probe');
  const first = document.element('inspect').click();
  assert.deepEqual(['load', 'copy', 'inspect', 'compare', 'reset'].map((id) => document.element(id).disabled),
    [true, true, true, true, true]);
  const second = document.element('inspect').forceClick();
  await Promise.all([first, second]);
  assert.equal(lines(document).length, 1);
  assert.equal(document.element('inspect').disabled, false);
});
test('setup failure keeps every control inert and shows UNKNOWN / HOLD with the reason or the default', async () => {
  for (const [code, expected] of [['OWNER_CONTEXT_UNAVAILABLE', 'OWNER_CONTEXT_UNAVAILABLE'], [undefined, 'CONTEXT_UNAVAILABLE']]) {
    const readiness = { ...fixtureSubject(), open: async () => { throw Object.assign(new Error('unavailable'), { code }); } };
    const document = await runPage(readiness);
    assert.equal(text(document, 'error'), `UNKNOWN / HOLD — ${expected}`);
    assert.equal(document.element('load').listeners.size, 0);
    assert.equal(document.element('fixture').children.length, 0);
  }
});
