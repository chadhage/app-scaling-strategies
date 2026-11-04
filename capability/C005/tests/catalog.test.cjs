'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../catalog-data.js');
const contract = require('../catalog-contract.js');
const matrix = require('../../C003/matrix-data.js');
const matrixContract = require('../../C003/matrix-contract.js');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = require('../catalog-source.cjs');
const clone = () => structuredClone(catalog);
const generation = require('../evidence/op-catalog-snapshot-refresh-150-ebd7433ac143/generation.json');
const expectedAccepted = generation.acceptedPortableIds;

test('C005 exposes exactly the 150 stable source scenarios and two workflows', () => {
  assert.equal(catalog.entries.length, 152, 'an empty loadable stub is not a source catalog');
  assert.deepEqual(catalog.entries.map(entry => entry.id), [
    ...Array.from({ length: 150 }, (_, index) => `S${String(index + 1).padStart(3, '0')}`),
    'W001', 'W002'
  ]);
  assert.deepEqual(contract.validateCatalog(catalog, matrix), { valid: true, errors: [] });
});

test('one generated catalog is byte-reproducible from pinned canonical source and a committed ledger', () => {
  assert.deepEqual(catalog, source.buildCatalog());
  const generated = fs.readFileSync(path.join(__dirname, '..', 'catalog-data.js'), 'utf8');
  assert.equal(generated.replace(/\r\n/g, '\n'), source.serialize(catalog));
  assert.equal(catalog.source.commit, source.PINNED_COMMIT);
  assert.equal(catalog.acceptanceSnapshot.commit, source.PINNED_COMMIT);
  assert.equal(catalog.acceptanceSnapshot.live, false);
  assert.equal(catalog.acceptanceSnapshot.commitTimeUtc, generation.acceptanceSnapshot.commitTimeUtc);
  assert.equal(catalog.acceptanceSnapshot.ledgerUpdatedAtUtc, generation.acceptanceSnapshot.ledgerUpdatedAtUtc);
});

test('all canonical row titles, objectives, acceptance and dependencies retain source identity and line links', () => {
  const { readme, backlog } = source.readPinnedSources();
  const documents = { readme: readme.split('\n'), backlog: backlog.split('\n') };
  for (const entry of catalog.entries) {
    for (const ref of entry.sourceReferences) {
      const row = documents[ref.document][ref.line - 1];
      assert.match(row, new RegExp(`^\\| ${ref.document === 'readme' ? entry.id : entry.parentId} \\|`));
      const href = contract.sourceHref(catalog, ref);
      assert.equal(href, `https://github.com/chadhage/app-scaling-strategies/blob/${source.PINNED_COMMIT}/${ref.path.replaceAll('\\', '/')}#L${ref.line}`);
      const sourceLines = documents[ref.document];
      const heading = sourceLines.slice(0, ref.line).filter(line => /^#{2,3} /.test(line)).at(-1).replace(/^#{2,3} /, '');
      const anchor = heading.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');
      assert.equal(ref.anchor, anchor);
    }
    const backlogRef = entry.sourceReferences.at(-1);
    const cells = documents.backlog[backlogRef.line - 1].split('|').slice(1, -1).map(cell => cell.trim());
    const plain = text => text.replace(/\*\*/g, '').replace(/`([^`]+)`/g, '$1').trim();
    assert.equal(entry.priority, cells[1]);
    assert.equal(entry.implementation, plain(cells[2]));
    assert.equal(entry.acceptance, plain(cells[3]));
    assert.equal(entry.prerequisites.additional, cells[4]);
    if (entry.kind === 'scenario') {
      const row = documents.readme[entry.sourceReferences[0].line - 1];
      const match = /\*\*(.+?):\*\* (.+) \|$/.exec(row);
      assert.equal(entry.title, plain(match[1]));
      assert.equal(entry.objective, plain(match[2]));
      assert.equal(entry.prerequisites.inheritsBase, true);
    } else {
      assert.equal(entry.title, /\*\*(.+?)\*\*/.exec(cells[2])[1]);
      assert.equal(entry.objective, plain(cells[2]));
      assert.equal(entry.prerequisites.inheritsBase, false);
    }
  }
  assert.equal(catalog.entries[150].title, 'Progressive deployment rings');
  assert.equal(catalog.entries[151].title, 'Shared-orchestrator getProfile: v1 GA to v2 private preview to v2 GA');
});

test('all 135 accepted Done snapshot lessons are linked; pending and absent cards are unavailable', () => {
  assert.equal(expectedAccepted.length, 135);
  assert.deepEqual(catalog.entries.filter(entry => entry.learning.available).map(entry => entry.id), expectedAccepted);
  for (const entry of catalog.entries) {
    if (!expectedAccepted.includes(entry.id)) {
      assert.equal(entry.learning.available, false);
      assert.equal(entry.learning.href, null);
      assert.equal(entry.learning.evidence, null);
      assert.ok(entry.learning.reason.length > 40);
    } else {
      assert.equal(entry.learning.status, 'accepted-snapshot');
      assert.equal(entry.learning.href, `../../learning/${entry.id}/index.html`);
    }
    assert.equal(entry.native.qualified, false);
    assert.equal(entry.native.runnable, false);
    assert.deepEqual(entry.native.evidence, []);
    assert.equal(entry.parent.completed, false);
    assert.equal(entry.support.status, 'unknown');
    assert.match(entry.support.reason, /no concrete target configuration.*C003/i);
    assert.equal(entry.risk, 'unclassified');
  }
  for (const id of ['S136', 'S137', 'S138', 'S139']) {
    assert.equal(catalog.entries.find(entry => entry.id === id).learning.available, false, id);
  }
  assert.equal(catalog.entries.find(entry => entry.id === 'S103').learning.available, true);
});

test('accepted lesson targets exist at their actual implementation commits and the snapshot ancestry', () => {
  source.verifyLearningTargets(catalog);
});

test('availability extraction rejects file-only, published-but-unaccepted and mismatched evidence', () => {
  const ledger = JSON.parse(source.readPinnedSources().ledgerText);
  const accepted = ledger.cards.find(card => card.id === 'A-S001');
  assert.equal(source.acceptedLesson(accepted), true);
  for (const mutate of [
    card => { card.state = 'In Progress'; },
    card => { card.review.accepted = false; },
    card => { card.review.remoteVerified = false; },
    card => { card.review.focusedTestsPassed = false; },
    card => { card.review.browserObserved = false; },
    card => { card.review.commit = '0'.repeat(40); },
    card => { card.result.tag = 'unpublished'; },
    card => { card.publication.tag = 'not-annotated-card-tag'; },
    card => { card.acceptedAtUtc = 'invalid'; }
  ]) {
    const copy = structuredClone(accepted);
    mutate(copy);
    assert.equal(source.acceptedLesson(copy), false);
  }
  assert.equal(source.acceptedLesson(undefined), false);
  assert.equal(source.acceptedLesson({ id: 'A-S001', state: 'Done' }), false);
});

test('the C003 contract remains the sole matrix authority, without copied permissions', () => {
  assert.deepEqual(matrixContract.validateMatrix(matrix), { valid: true, errors: [] });
  assert.equal(catalog.capabilityMatrix.schemaVersion, matrix.schemaVersion);
  assert.equal(catalog.capabilityMatrix.sourceCommit, source.PINNED_COMMIT);
  assert.equal(Object.hasOwn(catalog, 'permissions'), false);
  assert.equal(Object.hasOwn(catalog, 'approvals'), false);
  const unknownMatrix = structuredClone(matrix);
  unknownMatrix.schemaVersion = '99.0.0';
  assert.equal(contract.validateCatalog(catalog, unknownMatrix).valid, false);
  const qualified = structuredClone(matrix);
  qualified.rows[0].qualified = true;
  assert.equal(contract.validateCatalog(catalog, qualified).valid, false);
  assert.equal(contract.validateCatalog(catalog, undefined).valid, false);
});

for (const [name, mutate] of [
  ['wrong schema version', value => { value.schemaVersion = '2.0.0'; }],
  ['additional root approval flag', value => { value.permissions = { liveAzureExecutionApproved: true }; }],
  ['duplicate stable identifier', value => { value.entries[1].id = 'S001'; }],
  ['missing scenario', value => { value.entries.splice(42, 1); }],
  ['extra workflow', value => { value.entries.push(structuredClone(value.entries[151])); }],
  ['empty catalog', value => { value.entries = []; }],
  ['native qualification', value => { value.entries[0].native.qualified = true; }],
  ['native execution', value => { value.entries[0].native.runnable = true; }],
  ['synthetic native evidence', value => { value.entries[0].native.evidence = ['portable-lesson']; }],
  ['completed parent', value => { value.entries[0].parent.completed = true; }],
  ['unexplained unknown', value => { value.entries[40].support.reason = ''; }],
  ['inferred support', value => { value.entries[0].support.status = 'supported'; }],
  ['inferred risk', value => { value.entries[0].risk = 'low'; }],
  ['available without evidence', value => { value.entries[135].learning.available = true; }],
  ['unavailable with learning link', value => { value.entries[135].learning.href = '../../learning/S136/index.html'; }],
  ['wrong learning destination', value => { value.entries[0].learning.href = '../../learning/S002/index.html'; }],
  ['workflow lesson', value => { value.entries[150].learning = structuredClone(value.entries[0].learning); }],
  ['malformed acceptance timestamp', value => { value.entries[0].learning.evidence.acceptedAtUtc = '2026-02-31T10:00:00Z'; }],
  ['future acceptance timestamp', value => { value.entries[0].learning.evidence.acceptedAtUtc = '2027-01-01T10:00:00Z'; }],
  ['live ledger claim', value => { value.acceptanceSnapshot.live = true; }],
  ['future ledger timestamp', value => { value.acceptanceSnapshot.ledgerUpdatedAtUtc = '2027-01-01T10:00:00Z'; }],
  ['mismatched source snapshot', value => { value.acceptanceSnapshot.commit = '1'.repeat(40); }],
  ['URL in canonical source path', value => { value.entries[0].sourceReferences[0].path = 'https://example.invalid'; }],
  ['invalid source line', value => { value.entries[0].sourceReferences[0].line = -1; }],
  ['javascript source anchor', value => { value.entries[0].sourceReferences[0].anchor = 'javascript:alert(1)'; }],
  ['invalid dependency notation', value => { value.entries[0].prerequisites.additional = 'all hosts qualified'; }],
  ['erased BASE gate', value => { value.entries[0].prerequisites.inheritsBase = false; }]
]) {
  test(`versioned catalog validation rejects ${name}`, () => {
    const copy = clone();
    mutate(copy);
    assert.equal(contract.validateCatalog(copy, matrix).valid, false, name);
  });
}

test('malformed data fails closed without throwing', () => {
  for (const value of [undefined, null, false, [], '', 0, {}, { schemaVersion: '1.0.0' }]) {
    assert.equal(contract.validateCatalog(value, matrix).valid, false);
  }
  const malformed = clone();
  malformed.entries[0] = null;
  malformed.entries[1].sourceReferences = [null, 4];
  malformed.entries[2].category = [];
  malformed.common = [];
  malformed.source = null;
  assert.equal(contract.validateCatalog(malformed, matrix).valid, false);
});

test('pinned source link construction rejects URLs, prototype names, missing pins and invalid lines', () => {
  for (const ref of [null, {}, { document: '__proto__', path: 'README.md', line: 1 },
    { document: 'readme', path: 'javascript:alert(1)', line: 1 },
    { document: 'readme', path: 'README.md', line: 0 }]) {
    assert.throws(() => contract.sourceHref(catalog, ref), TypeError);
  }
  assert.throws(() => contract.sourceHref({}, catalog.entries[0].sourceReferences[0]), TypeError);
});

test('the module is recursively immutable and usable by classic browser scripts without fetching', () => {
  function frozen(value) {
    if (!value || typeof value !== 'object') return;
    assert.equal(Object.isFrozen(value), true);
    Object.values(value).forEach(frozen);
  }
  frozen(catalog);
  assert.throws(() => { catalog.entries[0].title = 'mutated'; }, TypeError);
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'catalog-data.js'), 'utf8'), context);
  assert.equal(JSON.stringify(context.C005Catalog), JSON.stringify(catalog));
  assert.equal(Object.getOwnPropertyDescriptor(context, 'C005Catalog').writable, false);
});

test('shared preparation metadata remains verbatim source, with AND/OR and safety boundaries intact', () => {
  assert.match(catalog.common.dependencyRules.text, /BASE = H011 \+ P005 \+ HOST/);
  assert.match(catalog.common.dependencyRules.text, /\*\*P001 OR P002 OR P003 OR P004\*\*/);
  assert.match(catalog.common.dependencyRules.text, /comma-separated list means all/);
  assert.match(catalog.common.sharedDefinitionOfDone.text, /supported hosts\/formats/);
  assert.match(catalog.common.operatingLimits.text, /retir/i);
  assert.match(catalog.common.acceptanceAndEvidence.text, /299,572|299572/);
  assert.match(catalog.common.riskReason, /priority is not risk/i);
});
