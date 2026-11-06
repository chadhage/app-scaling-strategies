'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { webcrypto } = require('node:crypto');
const { prepare: prepareFromModule } = require('../preparation.js');
const catalog = require('../../C005/catalog-data.js');
const matrix = require('../../C003/matrix-data.js');
const approved = require('../../C001/approved-contract.js');
const generation = require('../../C005/evidence/op-catalog-snapshot-refresh-165-c8b3139f07aa/generation.json');

const root = path.join(__dirname, '..');
const pageScripts = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .matchAll(/<script defer src="([^"]+)"><\/script>/g)].map(match => match[1]);
const dependencyScripts = pageScripts.slice(0, pageScripts.indexOf('preparation.js'));

const VALIDATOR_UNAVAILABLE = 'The shared C005 validator is unavailable. No replacement catalog is inferred.';
const APPROVAL_UNAVAILABLE = 'The C001 approval artifact or its integrity guard is unavailable.';
const AUTHORITY_FAILED = 'Shared source or authority validation failed. Preparation remains unverified.';
const INTEGRITY_UNAVAILABLE = 'INTEGRITY_UNAVAILABLE: Snapshot integrity checking is unavailable; deny all probes.';
const SNAPSHOT_DRIFT = 'SNAPSHOT_DRIFT: The bundled artifact differs from the pinned operator-approved snapshot.';

// Runs the page's real scripts in index.html order inside a fresh browser-like global, each under its own file URL so
// Node attributes the coverage to the real source. `skip` leaves a script out; `globals` supplies a replacement authority.
function pageGlobal(options = {}) {
  const { skip = [], globals = {} } = options;
  const crypto = 'crypto' in options ? options.crypto : webcrypto;
  const sandbox = vm.createContext({ TextEncoder, crypto, ...globals });
  for (const src of [...dependencyScripts, 'preparation.js']) {
    if (skip.includes(path.basename(src))) continue;
    const file = path.resolve(root, src);
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: pathToFileURL(file).href }).runInContext(sandbox);
  }
  return sandbox;
}

const inside = (sandbox, expression) => JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, sandbox));
const prepareIn = (sandbox, ...selection) =>
  sandbox.C008Preparation.prepare(sandbox.C005Catalog, sandbox.C003Matrix, selection.length ? selection[0] : 'S001');

function assertFailClosed(view, errors) {
  assert.equal(view.state, 'error');
  assert.equal(view.entry, null);
  assert.deepEqual([...view.errors], errors);
  for (const key of ['approved', 'approvalValidation', 'catalog', 'matrix']) assert.equal(Object.hasOwn(view, key), false, key);
  assert.ok(Object.isFrozen(view) && Object.isFrozen(view.errors));
}

test('page composition: preparation.js attaches one frozen, read-only C008Preparation global that exposes only prepare', () => {
  assert.deepEqual(dependencyScripts.map(src => path.basename(src)), [
    'approved-contract.js', 'contract-guard.js', 'matrix-contract.js', 'matrix-data.js', 'catalog-contract.js', 'catalog-data.js'
  ]);
  const sandbox = pageGlobal();
  assert.equal(inside(sandbox, 'typeof module'), 'undefined');
  assert.deepEqual(inside(sandbox, `(({ writable, enumerable, configurable }) => ({ writable, enumerable, configurable }))(
    Object.getOwnPropertyDescriptor(globalThis, 'C008Preparation'))`), { writable: false, enumerable: false, configurable: false });
  assert.deepEqual(inside(sandbox, 'Object.keys(C008Preparation)'), ['prepare']);
  assert.equal(inside(sandbox, 'Object.isFrozen(C008Preparation)'), true);
  assert.equal(inside(sandbox, 'typeof C008Preparation.prepare'), 'function');
  for (const attack of ["globalThis.C008Preparation = {};", "C008Preparation.prepare = null;"]) {
    assert.throws(() => vm.runInContext(`'use strict'; ${attack}`, sandbox), { name: 'TypeError' }, attack);
  }
  assert.equal(inside(sandbox, 'delete globalThis.C008Preparation'), false);
  assert.equal(inside(sandbox, 'typeof C008Preparation.prepare'), 'function');
});

test('page composition: all 152 source entries are ready from the global catalog, matrix and approval, like the Node module', async () => {
  const sandbox = pageGlobal();
  const ids = sandbox.C005Catalog.entries.map(entry => entry.id);
  assert.equal(ids.length, 152);
  const views = await Promise.all(ids.map(id => prepareIn(sandbox, id)));
  const moduleViews = await Promise.all(ids.map(id => prepareFromModule(catalog, matrix, id)));
  const accepted = new Set(generation.acceptedPortableIds);
  views.forEach((view, index) => {
    const id = ids[index];
    assert.equal(view.state, 'ready', id);
    assert.strictEqual(view.entry, sandbox.C005Catalog.entries[index]);
    assert.strictEqual(view.catalog, sandbox.C005Catalog);
    assert.strictEqual(view.matrix, sandbox.C003Matrix);
    assert.strictEqual(view.approved, sandbox.C001ApprovedContract);
    assert.equal(view.approvalValidation.valid, true, id);
    assert.equal(view.learningMode, accepted.has(id) ? 'synthetic-learning' : 'unsupported-learning', id);
    assert.equal(view.learningMode, moduleViews[index].learningMode, id);
    assert.equal(JSON.stringify(view.entry), JSON.stringify(moduleViews[index].entry), id);
    assert.equal(JSON.stringify(view.approvalValidation), JSON.stringify(moduleViews[index].approvalValidation), id);
  });
  assert.deepEqual(views.filter(view => view.learningMode === 'unsupported-learning').map(view => view.entry.id), ['W001', 'W002']);
  assert.equal(views.filter(view => view.learningMode === 'synthetic-learning').length, 150);
});

test('page composition: an empty selection is empty and any noncatalog selection is an exact-ID error', async () => {
  const sandbox = pageGlobal();
  const empty = await prepareIn(sandbox, '');
  assert.equal(empty.state, 'empty');
  assert.equal(empty.entry, null);
  assert.equal(empty.approvalValidation.valid, true);
  assert.equal(empty.errors.length, 0);
  for (const id of ['S000', 'S151', 's001', ' S001', 'W003', '<script>', 1, null, undefined]) {
    assertFailClosed(await prepareIn(sandbox, id), ['Choose an exact source ID from the validated catalog.']);
  }
});

test('a scenario whose portable practice is unavailable is unavailable-learning, never synthetic or unsupported', async () => {
  const changed = structuredClone(catalog);
  changed.entries.find(entry => entry.id === 'S002').learning = {
    status: 'unavailable', available: false, cardId: 'A-S002', href: null, evidence: null,
    reason: 'Fixture: no accepted portable lesson exists for this scenario in this snapshot.'
  };
  const unavailable = await prepareFromModule(changed, matrix, 'S002');
  assert.equal(unavailable.state, 'ready');
  assert.equal(unavailable.learningMode, 'unavailable-learning');
  assert.equal(unavailable.entry.learning.available, false);
  assert.equal(unavailable.entry.learning.href, null);
  assert.equal(unavailable.entry.native.runnable, false);
  assert.equal(unavailable.entry.parent.completed, false);
  assert.equal((await prepareFromModule(changed, matrix, 'S001')).learningMode, 'synthetic-learning');
  assert.equal((await prepareFromModule(changed, matrix, 'W001')).learningMode, 'unsupported-learning');
});

for (const [name, options] of [
  ['absent', { skip: ['catalog-contract.js'] }],
  ['null', { skip: ['catalog-contract.js'], globals: { C005Contract: null } }],
  ['an empty object', { skip: ['catalog-contract.js'], globals: { C005Contract: {} } }],
  ['without a callable validateCatalog', { skip: ['catalog-contract.js'], globals: { C005Contract: { validateCatalog: 'valid' } } }]
]) {
  test(`page composition: a C005 validator that is ${name} fails closed without inferring a replacement`, async () => {
    const view = await prepareIn(pageGlobal(options));
    assertFailClosed(view, [VALIDATOR_UNAVAILABLE]);
  });
}

for (const [name, validateCatalog] of [
  ['throws', () => { throw new Error('validator exploded'); }],
  ['answers nothing', () => undefined]
]) {
  test(`page composition: a C005 validator that ${name} yields a bounded unverified error`, async () => {
    const view = await prepareIn(pageGlobal({ skip: ['catalog-contract.js'], globals: { C005Contract: { validateCatalog } } }));
    assertFailClosed(view, [AUTHORITY_FAILED]);
  });
}

test('page composition: a validator rejection is reported by the validator and never shows an approval', async () => {
  const sandbox = pageGlobal();
  const changed = structuredClone(catalog);
  changed.entries.pop();
  const view = await sandbox.C008Preparation.prepare(changed, sandbox.C003Matrix, 'S001');
  assert.equal(view.state, 'error');
  assert.equal(view.entry, null);
  assert.ok(view.errors.length > 0);
  assert.match(view.errors.join(' '), /exactly 150 source scenarios plus W001 and W002/);
  assert.equal(Object.hasOwn(view, 'approved'), false);
});

for (const [name, options] of [
  ['the C001 approval artifact is absent', { skip: ['approved-contract.js'] }],
  ['the C001 approval artifact is null', { skip: ['approved-contract.js'], globals: { C001ApprovedContract: null } }],
  ['the C001 integrity guard is absent', { skip: ['contract-guard.js'] }],
  ['the C001 integrity guard is null', { skip: ['contract-guard.js'], globals: { C001ContractGuard: null } }],
  ['the C001 integrity guard has no validateApproval', { skip: ['contract-guard.js'], globals: { C001ContractGuard: {} } }],
  ['the C001 integrity guard has a non-callable validateApproval', { skip: ['contract-guard.js'], globals: { C001ContractGuard: { validateApproval: true } } }]
]) {
  test(`page composition: when ${name}, a valid catalog and source ID are not shown without an approval`, async () => {
    assert.equal((await prepareIn(pageGlobal())).state, 'ready');
    assertFailClosed(await prepareIn(pageGlobal(options)), [APPROVAL_UNAVAILABLE]);
  });
}

test('page composition: the real integrity guard without WebCrypto refuses every approval', async () => {
  for (const crypto of [undefined, {}, { subtle: {} }]) {
    assertFailClosed(await prepareIn(pageGlobal({ crypto })), [INTEGRITY_UNAVAILABLE]);
  }
});

test('page composition: a drifted bundled approval is refused with the real guard reason, not shown', async () => {
  const drifted = structuredClone(approved);
  drifted.approval.operatingEnvelope.maximumLiveAzureRuns = 1;
  const view = await prepareIn(pageGlobal({ skip: ['approved-contract.js'], globals: { C001ApprovedContract: drifted } }));
  assertFailClosed(view, [SNAPSHOT_DRIFT]);
  assert.equal(approved.approval.operatingEnvelope.maximumLiveAzureRuns, 0);
});

test('page composition: every guard reason reaches the visitor as code, colon and message in the guard order', async () => {
  const damaged = structuredClone(approved);
  delete damaged.approval.frontend;
  damaged.approval.runtime = 'TBD';
  assertFailClosed(await prepareIn(pageGlobal({ skip: ['approved-contract.js'], globals: { C001ApprovedContract: damaged } })), [
    SNAPSHOT_DRIFT,
    'CHOICE_MISSING: A required approved choice is missing.',
    'CHOICE_UNRESOLVED: A required approved choice is unresolved.'
  ]);
  const hollow = structuredClone(approved);
  hollow.approval = null;
  assertFailClosed(await prepareIn(pageGlobal({ skip: ['approved-contract.js'], globals: { C001ApprovedContract: hollow } })), [
    'SNAPSHOT_UNAVAILABLE: The operator-approved snapshot is unavailable; deny all probes.',
    'APPROVAL_MISSING: An explicit, current operator approval record is required.'
  ]);
});
