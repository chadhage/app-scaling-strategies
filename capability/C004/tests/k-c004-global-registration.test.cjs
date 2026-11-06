'use strict';

// K-C004: behavior of the real plan-provenance.js and plan-fixtures.js when no CommonJS loader exists,
// which is how index.html loads them, and when the fixtures' dependencies are missing or unusable.
// The real source files run unchanged as plain scripts in fresh contexts; nothing in them is replaced.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const envelopeFixture = require('../../C002/synthetic-fixture.js');
const matrix = require('../../C003/matrix-data.js');
const provenanceExport = require('../plan-provenance.js');
const fixturesExport = require('../plan-fixtures.js');

const directory = path.resolve(__dirname, '..');
const flagged = matrix.rows.find(row => row.firstPlannedNativeTarget);
const lastRow = matrix.rows[matrix.rows.length - 1];

// A plain browser script: no module, require or window, only the globals the page's earlier script tags define.
function runAsBrowserScript(fileName, globals = {}) {
  const file = path.join(directory, fileName);
  const sandbox = vm.createContext({ ...globals });
  assert.equal(vm.runInContext('typeof module + typeof require + typeof window', sandbox), 'undefinedundefinedundefined',
    'a browser script has no CommonJS loader and no window');
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: pathToFileURL(file).href }).runInContext(sandbox);
  return sandbox;
}

function newGlobals(sandbox, supplied) {
  return Object.getOwnPropertyNames(sandbox).filter(name => !Object.hasOwn(supplied, name));
}

function assertDeepFrozen(value, label) {
  if (!value || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value), `${label} must be frozen`);
  for (const [key, child] of Object.entries(value)) assertDeepFrozen(child, `${label}.${key}`);
}

function assertReadOnlyGlobal(sandbox, name) {
  const registered = sandbox[name];
  assert.throws(() => vm.runInContext(`'use strict'; globalThis.${name} = { replaced: true };`, sandbox), { name: 'TypeError' });
  assert.throws(() => vm.runInContext(`'use strict'; Object.defineProperty(globalThis, '${name}', { value: { replaced: true } });`, sandbox),
    { name: 'TypeError' });
  assert.equal(sandbox[name], registered, `${name} must stay the registered record`);
}

function withFlaggedRow(id) {
  return { ...matrix, rows: matrix.rows.map(row => ({ ...row, firstPlannedNativeTarget: row.id === id })) };
}

test('provenance registers exactly one read-only browser global and matches its CommonJS export', () => {
  const sandbox = runAsBrowserScript('plan-provenance.js');
  assert.deepEqual(newGlobals(sandbox, {}), ['C004Provenance']);
  assert.equal(JSON.stringify(sandbox.C004Provenance), JSON.stringify(provenanceExport));
  assertDeepFrozen(sandbox.C004Provenance, 'C004Provenance');
  assert.throws(() => vm.runInContext(`'use strict'; C004Provenance.C001.commit = 'edited';`, sandbox), { name: 'TypeError' });
  assertReadOnlyGlobal(sandbox, 'C004Provenance');
});

test('fixtures register one read-only browser global from the loaded C002 fixture and C003 matrix', () => {
  const supplied = { C002SyntheticFixture: envelopeFixture, C003Matrix: matrix };
  const sandbox = runAsBrowserScript('plan-fixtures.js', supplied);
  const registered = sandbox.C004Fixtures;
  assert.deepEqual(newGlobals(sandbox, supplied), ['C004Fixtures']);
  assert.deepEqual(Object.keys(registered), ['local', 'native']);
  assert.equal(registered.unavailable, undefined);
  assert.equal(registered.local.envelopeRequest, envelopeFixture, 'local reuses the C002 fixture itself');
  assert.equal(registered.native.envelopeRequest, envelopeFixture, 'native reuses the C002 fixture itself');
  assert.equal(JSON.stringify(registered), JSON.stringify(fixturesExport));
  assertDeepFrozen(registered, 'C004Fixtures');
  assertReadOnlyGlobal(sandbox, 'C004Fixtures');
});

test('registered local example is resource-free with not-applicable pricing, native is unknown and unpriced, never zero', () => {
  const { local, native } = runAsBrowserScript('plan-fixtures.js', { C002SyntheticFixture: envelopeFixture, C003Matrix: matrix }).C004Fixtures;
  assert.equal(local.mode, 'local-resource-free');
  assert.equal(local.configurationId, null);
  assert.equal(local.resources.cloudResourceCount, 0);
  assert.equal(local.pricing.status, 'not-applicable');
  assert.equal(local.pricing.currency, null);
  assert.equal(local.pricing.totalMinorUnits, null);
  assert.equal(local.pricing.source, null);
  assert.match(local.pricing.basis, /no cloud execution/i);
  assert.equal(native.mode, 'native-proposal');
  assert.equal(native.configurationId, flagged.id);
  assert.equal(native.resources.cloudResourceCount, null);
  assert.equal(native.pricing.status, 'missing');
  assert.equal(native.pricing.currency, null);
  assert.equal(native.pricing.totalMinorUnits, null);
  assert.equal(native.pricing.source, null);
  assert.match(native.pricing.basis, /not zero cost/i);
});

test('the native example follows the C003 flag, not the row order or a remembered identifier', () => {
  assert.notEqual(matrix.rows[0].id, lastRow.id);
  const flaggedLast = { ...matrix, rows: [...matrix.rows.filter(row => row !== flagged), flagged] };
  const reordered = runAsBrowserScript('plan-fixtures.js', { C002SyntheticFixture: envelopeFixture, C003Matrix: flaggedLast });
  assert.equal(reordered.C004Fixtures.native.configurationId, flagged.id);
  assert.notEqual(flaggedLast.rows[0].id, flagged.id);

  assert.notEqual(lastRow.id, flagged.id);
  const reflagged = runAsBrowserScript('plan-fixtures.js', { C002SyntheticFixture: envelopeFixture, C003Matrix: withFlaggedRow(lastRow.id) });
  assert.equal(reflagged.C004Fixtures.native.configurationId, lastRow.id);
  assert.equal(reflagged.C004Fixtures.unavailable, undefined);
});

const matrixWithoutRows = Object.fromEntries(Object.entries(matrix).filter(([key]) => key !== 'rows'));

for (const [label, globals] of [
  ['the C002 synthetic fixture was never loaded', { C003Matrix: matrix }],
  ['the C003 matrix was never loaded', { C002SyntheticFixture: envelopeFixture }],
  ['neither dependency was loaded', {}],
  ['the C002 fixture global is null', { C002SyntheticFixture: null, C003Matrix: matrix }],
  ['the C003 matrix has no rows property', { C002SyntheticFixture: envelopeFixture, C003Matrix: matrixWithoutRows }],
  ['the C003 rows property is null', { C002SyntheticFixture: envelopeFixture, C003Matrix: { ...matrix, rows: null } }],
  ['the C003 rows property is an array-like object', { C002SyntheticFixture: envelopeFixture, C003Matrix: { ...matrix, rows: { ...matrix.rows, length: matrix.rows.length } } }],
  ['the C003 rows property is text', { C002SyntheticFixture: envelopeFixture, C003Matrix: { ...matrix, rows: 'no rows here' } }],
  ['the C003 matrix has no row flagged firstPlannedNativeTarget', { C002SyntheticFixture: envelopeFixture, C003Matrix: withFlaggedRow(null) }],
  ['the C003 matrix has an empty rows array', { C002SyntheticFixture: envelopeFixture, C003Matrix: { ...matrix, rows: [] } }]
]) {
  test(`fixtures fail closed with a frozen unavailable record when ${label}`, () => {
    const sandbox = runAsBrowserScript('plan-fixtures.js', globals);
    const registered = sandbox.C004Fixtures;
    assert.deepEqual(newGlobals(sandbox, globals), ['C004Fixtures']);
    assert.deepEqual(Object.keys(registered), ['unavailable']);
    assert.equal(registered.unavailable, true);
    assert.equal(registered.local, undefined, 'no local example may be offered');
    assert.equal(registered.native, undefined, 'no native example may be offered');
    assert.ok(Object.isFrozen(registered));
    assert.throws(() => vm.runInContext(`'use strict'; C004Fixtures.local = { forged: true };`, sandbox), { name: 'TypeError' });
    assertReadOnlyGlobal(sandbox, 'C004Fixtures');
  });
}
