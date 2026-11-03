'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../catalog-data.js');
const matrix = require('../../C003/matrix-data.js');
const contract = require('../catalog-contract.js');
const { searchCatalog } = require('../../C006/search.js');
const { filterCatalog } = require('../../C007/catalog-filters.js');
const { prepare } = require('../../C008/preparation.js');
const { compose } = require('../../local-harness/composition.js');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const vm = require('node:vm');
const source = require('../catalog-source.cjs');
const generation = require('../evidence/op-catalog-snapshot-refresh-76-01675ac8d423/generation.json');

const FIXED_SOURCE = '01675ac8d4230c51dad027b67a1971d8d3490d74';
const repo = path.resolve(__dirname, '..', '..', '..');
const evidence = path.join(__dirname, '..', 'evidence', 'op-catalog-snapshot-refresh-76-01675ac8d423');
const sha = value => createHash('sha256').update(value).digest('hex');
const normalize = value => value.toString('utf8').replaceAll('\r\n', '\n');
const git = args => execFileSync('git', ['--no-pager', ...args], { cwd: repo });

test('the fixed historical generation exposes all 61 accepted portable lessons, not the old thirty-six', async () => {
  assert.deepEqual(contract.validateCatalog(catalog, matrix), { valid: true, errors: [] });
  const accepted = catalog.entries.filter(entry => entry.learning.available);
  assert.equal(accepted.length, 61, 'new-snapshot coverage must include every accepted portable lesson');
  assert.equal(catalog.source.commit, FIXED_SOURCE);
  assert.equal(catalog.acceptanceSnapshot.commit, FIXED_SOURCE);
  assert.equal(catalog.acceptanceSnapshot.live, false);
  assert.deepEqual(searchCatalog(catalog, matrix, '').filter(entry => entry.learning.available), accepted);
  const filtered = filterCatalog(catalog, matrix, { readiness: 'portable-available' });
  assert.equal(filtered.valid, true);
  assert.deepEqual(filtered.items.map(item => item.entry), accepted);
  const unified = await compose(catalog, matrix, { filters: { readiness: 'portable-available' } });
  assert.equal(unified.valid, true);
  assert.deepEqual(unified.items.map(item => item.entry), accepted);
  for (const entry of accepted) {
    const view = await prepare(catalog, matrix, entry.id);
    assert.equal(view.state, 'ready', entry.id);
    assert.equal(view.learningMode, 'synthetic-learning', entry.id);
    assert.strictEqual(view.entry, entry);
    assert.equal(entry.learning.href, `../../learning/${entry.id}/index.html`);
  }
  assert.equal(catalog.entries.length, 152);
  assert.equal(catalog.entries.filter(entry => entry.native.runnable || entry.native.qualified
    || entry.parent.completed || entry.support.status !== 'unknown' || entry.risk !== 'unclassified').length, 0);
});

test('generation fingerprints, all 76 accepted units and 61 lesson IDs derive from the immutable annotated source', () => {
  assert.equal(generation.kind, 'fixed-historical-generation-binding-not-unit-acceptance');
  assert.equal(generation.sourceCommit, FIXED_SOURCE);
  assert.equal(generation.sourceTag, 'kanban/flow-admin/01675ac8d423');
  assert.equal(git(['cat-file', '-t', generation.sourceTag]).toString().trim(), 'tag');
  assert.equal(git(['rev-parse', generation.sourceTag]).toString().trim(), generation.sourceTagObject);
  assert.equal(git(['rev-parse', `${generation.sourceTag}^{}`]).toString().trim(), FIXED_SOURCE);
  const pinned = source.readPinnedSources();
  const ledger = JSON.parse(pinned.ledgerText);
  const accepted = ledger.cards.filter(source.acceptedLesson);
  assert.equal(accepted.length, 76);
  assert.equal(generation.acceptedUnits, accepted.length);
  assert.deepEqual(generation.acceptedPortableIds,
    accepted.filter(card => /^A-S\d{3}$/.test(card.id)).map(card => card.id.slice(2)).sort());
  assert.equal(generation.acceptedPortableLessons, generation.acceptedPortableIds.length);
  assert.equal(generation.acceptedPortableLessons, 61);
  assert.equal(sha(pinned.readme), catalog.source.readme.sha256);
  assert.equal(sha(pinned.backlog), catalog.source.backlog.sha256);
  assert.equal(sha(pinned.ledgerText), catalog.acceptanceSnapshot.ledgerSha256);
  assert.deepEqual(generation.source, catalog.source);
  assert.deepEqual(generation.acceptanceSnapshot, catalog.acceptanceSnapshot);
  const generated = fs.readFileSync(path.join(repo, generation.data.path));
  assert.equal(sha(generated), generation.data.sha256);
  assert.equal(normalize(generated), source.serialize(source.buildCatalog()));
  assert.equal(sha(normalize(fs.readFileSync(path.join(repo, generation.generator.path)))),
    generation.generator.normalizedSha256);
  source.verifyLearningTargets(catalog);
});

test('all three preceding catalogs and all historical proof remain intact; generator semantics change only its explicit pin', () => {
  assert.equal(generation.previous.sha256, '17edc4bc779efdfa7fe6fe340c5d92c52bc700a10503c5da74f491020d99fbe4');
  assert.equal(generation.intermediate.sha256, 'c5857b4c9b98ecf5d465f5d7a321dbf4d5164513d426f29ff42c721d592886ba');
  assert.equal(generation.original.sha256, '23a79f3203c06006d7b5bc1a17728d1a2d9c729b5e744dd4b4f2972b9c9a26bc');
  for (const snapshot of [generation.original, generation.intermediate, generation.previous]) {
    const archived = fs.readFileSync(path.join(repo, snapshot.path));
    assert.equal(sha(archived), snapshot.sha256);
    assert.equal(normalize(archived), normalize(git([
      'show', `${snapshot.acceptedPublication}:capability/C005/catalog-data.js`
    ])));
  }
  const oldGenerator = fs.readFileSync(path.join(repo, generation.previous.generatorPath));
  assert.equal(normalize(oldGenerator), normalize(git([
    'show', `${generation.previous.acceptedPublication}:capability/C005/catalog-source.cjs`
  ])));
  assert.equal(normalize(fs.readFileSync(path.join(repo, generation.generator.path))),
    normalize(oldGenerator).replace(generation.previous.sourceCommit, FIXED_SOURCE));
  const historical = JSON.parse(fs.readFileSync(path.join(evidence, 'historical-proof-hashes.json'), 'utf8'));
  const historicalPaths = git(['ls-tree', '-r', '--name-only', FIXED_SOURCE, '--',
    'capability/C005', 'capability/C006', 'capability/C007', 'capability/C008', 'capability/local-harness'])
    .toString().trim().split('\n').filter(file => /(?:^|\/)evidence(?:\/|\.json$)|\/result\.json$/.test(file))
    .map(file => file.replaceAll('/', '\\'));
  assert.deepEqual(historical.files.map(file => file.path).sort(), historicalPaths.sort());
  assert.equal(historical.files.length, generation.preservation.files);
  for (const file of historical.files) {
    assert.equal(sha(fs.readFileSync(path.join(repo, file.path))), file.sha256, file.path);
  }
});

test('exact-current-checkout CLI rejects controlled canonical drift while historical extraction stays reproducible', () => {
  const filename = path.join(repo, generation.generator.path);
  const main = { exports: {} };
  const driftFs = {
    ...fs,
    readFileSync(file, options) {
      if (path.resolve(file) === path.join(repo, 'README.md')) return `${source.readPinnedSources().readme}\ncontrolled canonical drift\n`;
      return fs.readFileSync(file, options);
    }
  };
  const driftRequire = name => name === 'node:fs' ? driftFs : require(name);
  driftRequire.main = main;
  assert.throws(() => new vm.Script(fs.readFileSync(filename, 'utf8'), { filename }).runInNewContext({
    require: driftRequire, module: main, __dirname: path.dirname(filename),
    process: { argv: [process.execPath, filename, '--check'] }, console
  }, { timeout: 30000 }), /readme changed; explicitly review and refresh the pin/);
  assert.deepEqual(source.buildCatalog(), catalog);
});

test('new-snapshot RED precedes IaC N/A and uses the real old data, not a missing module or fabricated failure', () => {
  const red = JSON.parse(fs.readFileSync(path.join(evidence, 'red-corrected-02.json'), 'utf8'));
  const iac = JSON.parse(fs.readFileSync(path.join(evidence, 'iac-na.json'), 'utf8'));
  assert.equal(red.exitCode, 1);
  assert.match(red.stdout, /36 !== 61/);
  assert.match(red.stdout, /S035/);
  assert.match(red.stdout, /ERR_ASSERTION/);
  assert.doesNotMatch(red.stdout, /MODULE_NOT_FOUND|SyntaxError/);
  assert.equal(sha(fs.readFileSync(path.join(evidence, 'red-corrected-02.cjs.txt'))), red.assertionsSha256);
  assert.equal(sha(fs.readFileSync(path.join(evidence, 'red-snapshot-refresh-76.feature.txt'))), red.bddSha256);
  assert.equal(red.oldCatalogSha256, generation.previous.sha256);
  assert.ok(Date.parse(iac.recordedAtUtc) >= Date.parse(red.completedAtUtc));
  assert.equal(iac.applicability, 'not-applicable');
  assert.equal(iac.recordedBefore, 'snapshot implementation');
});

test('all five browser suites gate published provenance and append new observations only with the exact capture opt-in', () => {
  for (const scope of ['C005', 'C006', 'C007', 'C008', 'local-harness']) {
    const browser = fs.readFileSync(path.join(repo, 'capability', scope, 'tests', 'browser.test.cjs'), 'utf8');
    assert.ok(browser.includes('53c0c0d82cc1db6780a87ac2b1085734af6d5c60'), scope);
    assert.ok(browser.includes('86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055'), scope);
    const gate = browser.indexOf('PUBLISHED_HELPER_SHA256,');
    assert.ok(gate >= 0 && gate < browser.indexOf('const { openIsolatedLesson } = require(helperPath)'), scope);
    assert.match(browser, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
    assert.match(browser, /browser-op-catalog-snapshot-refresh-76-01675ac8d423-\$\{randomUUID\(\)\}\.json/);
    assert.match(browser, /flag: 'wx'/);
    assert.doesNotMatch(browser, /fs\.(?:rm|unlink|truncate)/);
    assert.match(browser, /finally \{\s*await session\.close\(\)/);
  }
});
