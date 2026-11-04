'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const catalog = require('../../C005/catalog-data.js');
const matrix = require('../../C003/matrix-data.js');
const approved = require('../../C001/approved-contract.js');
const { prepare } = require('../preparation.js');
const generation = require('../../C005/evidence/op-catalog-snapshot-refresh-165-c8b3139f07aa/generation.json');

test('all 150 scenarios and both workflows have preparation from the shared objects', async () => {
  const views = await Promise.all(catalog.entries.map(entry => prepare(catalog, matrix, entry.id)));
  assert.equal(views.filter(view => view.state === 'ready').length, 152,
    'every source entry must have preparation, not a missing module or placeholder');
  for (let index = 0; index < views.length; index++) {
    assert.strictEqual(views[index].entry, catalog.entries[index]);
    assert.strictEqual(views[index].catalog, catalog);
    assert.strictEqual(views[index].matrix, matrix);
    assert.strictEqual(views[index].approved, approved);
  }
});

test('a valid catalog with no selection is empty, not a preparation success', async () => {
  const view = await prepare(catalog, matrix, '');
  assert.equal(view.state, 'empty');
  assert.equal(view.entry, null);
});

test('synthetic learning and unavailable practice never become native or parent completion', async () => {
  for (const id of ['S001', 'S009', 'W001', 'W002']) {
    const view = await prepare(catalog, matrix, id);
    assert.equal(view.state, 'ready');
    assert.equal(view.entry.native.runnable, false);
    assert.equal(view.entry.native.qualified, false);
    assert.equal(view.entry.parent.completed, false);
    assert.equal(view.entry.risk, 'unclassified');
    assert.equal(view.approved.approval.operatingEnvelope.maximumLiveAzureRuns, 0);
    assert.equal(view.approved.approval.operatingEnvelope.authorizedCloudSpend, 0);
  }
});

test('learning availability is exactly the accepted historical snapshot, not current files', async () => {
  const views = await Promise.all(['S001', 'S008', 'S009', 'S010', 'S018', 'S019', 'S103', 'S136', 'S137', 'S138', 'S139', 'W001', 'W002']
    .map(id => prepare(catalog, matrix, id)));
  assert.deepEqual(views.map(view => view.learningMode), [
    'synthetic-learning', 'synthetic-learning', 'synthetic-learning', 'synthetic-learning',
    'synthetic-learning', 'synthetic-learning', 'synthetic-learning',
    'synthetic-learning', 'synthetic-learning', 'synthetic-learning',
    'synthetic-learning', 'unsupported-learning', 'unsupported-learning'
  ]);
  assert.deepEqual(catalog.entries.filter(entry => entry.learning.available).map(entry => entry.id), generation.acceptedPortableIds);
  for (const view of views) {
    assert.strictEqual(view.entry.learning, catalog.entries.find(entry => entry.id === view.entry.id).learning);
    if (!view.entry.learning.available) {
      assert.equal(view.entry.learning.href, null);
      assert.equal(view.entry.learning.evidence, null);
    }
  }
});

test('canonical dependency expressions and scenario BASE are not converted into all-host requirements', async () => {
  const scenario = await prepare(catalog, matrix, 'S001');
  assert.equal(scenario.entry.prerequisites.additional, 'none');
  assert.equal(scenario.entry.prerequisites.inheritsBase, true);
  for (const id of ['W001', 'W002']) {
    const view = await prepare(catalog, matrix, id);
    assert.equal(view.entry.prerequisites.inheritsBase, false);
  }
  const workflow = await prepare(catalog, matrix, 'W002');
  assert.match(workflow.entry.prerequisites.additional, /^CONTAINER, H009,/);
  assert.match(workflow.catalog.common.dependencyRules.text, /BASE = H011 \+ P005 \+ HOST/);
  assert.match(workflow.catalog.common.dependencyRules.text, /P002 OR P003/);
});

test('native limits, target uncertainty and production validation stay owned by the shared authorities', async () => {
  const view = await prepare(catalog, matrix, 'S150');
  assert.equal(view.approvalValidation.valid, true);
  assert.equal(view.approvalValidation.nativeReady, false);
  assert.equal(view.approvalValidation.productionRuntimeValidated, false);
  assert.deepEqual(view.approvalValidation.unresolvedNativeChoices, ['OS', 'SKU', 'subscription', 'resource group', 'region']);
  assert.ok(Object.values(view.matrix.design.target).every(value => value === null));
  assert.equal(view.matrix.design.productionRuntimeValidated, false);
  for (const key of require('../../C003/matrix-contract.js').FLAG_KEYS) {
    assert.equal(view.approved.approval[key], false);
    assert.equal(view.matrix.permissions[key], false);
  }
});

test('preparation does not mutate or duplicate the shared catalog, matrix or approval', async () => {
  const before = [catalog, matrix, approved].map(value => JSON.stringify(value));
  const view = await prepare(catalog, matrix, 'W002');
  assert.ok(Object.isFrozen(view));
  assert.ok(Object.isFrozen(catalog.entries[0].prerequisites));
  assert.ok(Object.isFrozen(matrix.rows[0].constraints));
  assert.ok(Object.isFrozen(approved.approval.operatingEnvelope));
  assert.throws(() => { approved.approval.operatingEnvelope.maximumLiveAzureRuns = 1; }, TypeError);
  assert.deepEqual([catalog, matrix, approved].map(value => JSON.stringify(value)), before);
  assert.equal(Object.hasOwn(view, 'prerequisites'), false);
  assert.equal(Object.hasOwn(view, 'permissions'), false);
});

const invalidCatalogCases = [
  ['missing catalog', () => undefined],
  ['empty entries', value => { value.entries = []; return value; }],
  ['wrong major version', value => { value.schemaVersion = '2.0.0'; return value; }],
  ['missing entry', value => { value.entries.pop(); return value; }],
  ['duplicate ID', value => { value.entries[1].id = 'S001'; return value; }],
  ['native runnable promotion', value => { value.entries[0].native.runnable = true; return value; }],
  ['native qualification promotion', value => { value.entries[0].native.qualified = true; return value; }],
  ['source-parent completion', value => { value.entries[0].parent.completed = true; return value; }],
  ['invented risk classification', value => { value.entries[0].risk = 'low'; return value; }],
  ['invented learning link', value => { value.entries[150].learning.href = '../../learning/S136/index.html'; return value; }],
  ['rewritten dependency expression', value => { value.entries[0].prerequisites.additional = 'HOST AND P001'; return value; }]
];
for (const [name, change] of invalidCatalogCases) {
  test(`fails closed for ${name}`, async () => {
    const view = await prepare(change(structuredClone(catalog)), matrix, 'S001');
    assert.equal(view.state, 'error');
    assert.equal(view.entry, null);
    assert.ok(view.errors.length > 0);
    assert.equal(Object.hasOwn(view, 'approved'), false);
  });
}
for (const [name, change] of [
  ['missing C003 authority', () => undefined],
  ['invented native SKU', value => { value.design.target.sku = 'unreviewed'; return value; }],
  ['expenditure promotion', value => { value.permissions.expenditureApproved = true; return value; }],
  ['positive live-run limit', value => { value.permissions.maximumLiveAzureRuns = 1; return value; }],
  ['unsafe documentation URL', value => { value.sources[0].url = 'javascript:alert(1)'; return value; }]
]) {
  test(`delegates rejection of ${name} to the C003 validator`, async () => {
    const view = await prepare(catalog, change(structuredClone(matrix)), 'S001');
    assert.equal(view.state, 'error');
    assert.equal(view.entry, null);
  });
}
for (const id of ['S000', 'S151', 's001', ' S001', 'S001 ', 'W003', '<script>', 1, null, undefined]) {
  test(`rejects noncatalog selection ${JSON.stringify(id)}`, async () => {
    const view = await prepare(catalog, matrix, id);
    assert.equal(view.state, 'error');
    assert.equal(view.entry, null);
    assert.match(view.errors.join(' '), /exact source ID/);
  });
}

test('missing browser approval/integrity authority fails closed without a replacement', async () => {
  const sandbox = { C005Contract: require('../../C005/catalog-contract.js') };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'preparation.js'), 'utf8'), sandbox);
  const view = await sandbox.C008Preparation.prepare(catalog, matrix, 'S001');
  assert.equal(view.state, 'error');
  assert.match(view.errors.join(' '), /C001 approval artifact or its integrity guard is unavailable/);
});

test('an invalid C001 integrity verdict cannot display an approval', async () => {
  const sandbox = {
    C005Contract: require('../../C005/catalog-contract.js'),
    C001ApprovedContract: approved,
    C001ContractGuard: {
      validateApproval: async () => ({ valid: false, reasons: [{ code: 'SNAPSHOT_DRIFT', message: 'Test drift rejection.' }] })
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'preparation.js'), 'utf8'), sandbox);
  const view = await sandbox.C008Preparation.prepare(catalog, matrix, 'S001');
  assert.equal(view.state, 'error');
  assert.equal(Object.hasOwn(view, 'approved'), false);
  assert.match(view.errors.join(' '), /SNAPSHOT_DRIFT/);
});

test('unreadable inputs produce a bounded error state rather than a stale ready entry', async () => {
  const value = new Proxy({}, { ownKeys() { throw new Error('Unreadable fixture'); } });
  const view = await prepare(value, matrix, 'S001');
  assert.equal(view.state, 'error');
  assert.equal(view.entry, null);
});
