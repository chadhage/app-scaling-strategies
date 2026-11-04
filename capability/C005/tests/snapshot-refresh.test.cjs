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
const { gunzipSync } = require('node:zlib');
const source = require('../catalog-source.cjs');
const generation = require('../evidence/op-catalog-snapshot-refresh-165-c8b3139f07aa/generation.json');

const FIXED_SOURCE = 'c8b3139f07aa60a64833a5380503b2bd794c0e0e';
const repo = path.resolve(__dirname, '..', '..', '..');
const evidence = path.join(__dirname, '..', 'evidence', 'op-catalog-snapshot-refresh-165-c8b3139f07aa');
const sha = value => createHash('sha256').update(value).digest('hex');
const normalize = value => value.toString('utf8').replaceAll('\r\n', '\n');
const git = args => execFileSync('git', ['--no-pager', ...args], { cwd: repo, maxBuffer: 8 * 1024 * 1024 });

test('the fixed historical generation exposes all 150 accepted practices, not the old135', async () => {
  assert.deepEqual(contract.validateCatalog(catalog, matrix), { valid: true, errors: [] });
  const accepted = catalog.entries.filter(entry => entry.learning.available);
  assert.equal(accepted.length, 150, 'new-snapshot coverage must include every accepted portable lesson');
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

test('generation fingerprints, all165 accepted units and150 practice IDs derive from the immutable annotated source', () => {
  assert.equal(generation.kind, 'fixed-historical-generation-binding-not-unit-acceptance');
  assert.equal(generation.sourceCommit, FIXED_SOURCE);
  assert.equal(generation.sourceTag, 'kanban/flow-admin/c8b3139f07aa');
  assert.equal(git(['cat-file', '-t', generation.sourceTag]).toString().trim(), 'tag');
  assert.equal(git(['rev-parse', generation.sourceTag]).toString().trim(), generation.sourceTagObject);
  assert.equal(git(['rev-parse', `${generation.sourceTag}^{}`]).toString().trim(), FIXED_SOURCE);
  const pinned = source.readPinnedSources();
  const ledger = JSON.parse(pinned.ledgerText);
  const accepted = ledger.cards.filter(source.acceptedLesson);
  assert.equal(accepted.length, 165);
  assert.equal(generation.acceptedUnits, accepted.length);
  assert.deepEqual(generation.acceptedPortableIds,
    accepted.filter(card => /^A-S\d{3}$/.test(card.id)).map(card => card.id.slice(2)).sort());
  assert.equal(generation.acceptedPortableLessons, generation.acceptedPortableIds.length);
  assert.equal(generation.acceptedPortableLessons, 150);
  assert.deepEqual(generation.acceptedPortableIds, Array.from({ length: 150 }, (_, index) =>
    `S${String(index + 1).padStart(3, '0')}`));
  assert.deepEqual(generation.sourceKanoDone, { S: 163, L: 0, D: 2 });
  assert.deepEqual(generation.unavailableGaps, []);
  assert.equal(generation.unavailableFrom, null);
  assert.deepEqual(generation.unavailableWorkflowIds, ['W001', 'W002']);
  assert.equal(ledger.updatedAtUtc, '2026-11-04T05:06:14.4697468Z');
  assert.equal(catalog.source.commitTimeUtc, '2026-11-04T05:06:17.000Z');
  assert.ok(Date.parse(ledger.updatedAtUtc) < Date.parse(catalog.source.commitTimeUtc));
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
  assert.equal(sha(fs.readFileSync(path.join(repo, generation.generator.path))), generation.generator.rawSha256);
  source.verifyLearningTargets(catalog);
});

test('all eight preceding catalogs, all635 original bytes and561 historical proofs remain intact; only the full generator pin changes', () => {
  assert.equal(generation.previous.sha256, '00df2f58566b4cb663b8dabcb175ef96fb7bdac269256781b34d29f579467863');
  assert.equal(generation.prior120.sha256, '549fba2019ea40d0cc6cdd8b23ad87be31fa30dcbf1cf4f22c843f0cd12e9334');
  assert.equal(generation.prior100.sha256, '88d21eb94d378661f878a1b143d798759b62d1e8a4d52b1bea9746b72db8499f');
  assert.equal(generation.prior86.sha256, '0a923b28e95c7547ff532823616829979ef053c0eb207a8e8c160cb416374b71');
  assert.equal(generation.prior61.sha256, 'e354a72d5a15a2b0f8fce8a5c22ed1b0826bef1897e40cd1245e420ab1822d6a');
  assert.equal(generation.prior36.sha256, '17edc4bc779efdfa7fe6fe340c5d92c52bc700a10503c5da74f491020d99fbe4');
  assert.equal(generation.intermediate.sha256, 'c5857b4c9b98ecf5d465f5d7a321dbf4d5164513d426f29ff42c721d592886ba');
  assert.equal(generation.original.sha256, '23a79f3203c06006d7b5bc1a17728d1a2d9c729b5e744dd4b4f2972b9c9a26bc');
  const snapshots = JSON.parse(fs.readFileSync(path.join(evidence, 'previous-snapshots.json'))).files;
  assert.deepEqual(snapshots.map(snapshot => snapshot.acceptedPortableLessons), [11, 20, 36, 61, 86, 100, 120, 135]);
  for (const snapshot of snapshots) {
    const archived = fs.readFileSync(path.join(repo, snapshot.path));
    assert.equal(sha(archived), snapshot.sha256);
    assert.equal(normalize(archived), normalize(git([
      'show', `${snapshot.acceptedPublication}:capability/C005/catalog-data.js`
    ])));
    assert.ok(fs.statSync(path.join(repo, snapshot.generationPath)).isFile());
    assert.ok(fs.statSync(path.join(repo, snapshot.generatorPath)).isFile());
  }
  const oldGenerator = fs.readFileSync(path.join(repo, generation.previous.generatorPath));
  assert.equal(normalize(oldGenerator), normalize(git([
    'show', `${generation.previous.acceptedPublication}:capability/C005/catalog-source.cjs`
  ])));
  assert.equal(normalize(fs.readFileSync(path.join(repo, generation.generator.path))),
    normalize(oldGenerator).replace(generation.previous.sourceCommit, FIXED_SOURCE));
  assert.equal(generation.generator.gitReadMaxBufferBytes, 8 * 1024 * 1024);
  assert.equal(generation.generator.onlyFullShaPinChanged, true);
  assert.equal(generation.generator.requiredTransportRepair, false);
  const oldMetadata = fs.readFileSync(path.join(repo, generation.previous.generationPath));
  assert.equal(sha(oldMetadata), generation.previous.generationSha256);
  assert.equal(JSON.parse(oldMetadata).sourceCommit, generation.previous.sourceCommit);
  const oldCatalog = require(path.join(repo, generation.previous.path));
  const identity = entry => { const { learning, ...unchanged } = entry; return unchanged; };
  assert.deepEqual(catalog.entries.map(identity), oldCatalog.entries.map(identity));
  const historical = JSON.parse(fs.readFileSync(path.join(evidence, 'historical-proof-hashes.json'), 'utf8'));
  const initial = JSON.parse(fs.readFileSync(path.join(evidence, 'initial-owned-hashes.json')));
  const bundle = JSON.parse(fs.readFileSync(path.join(evidence, 'source-archives.json')));
  assert.equal(initial.files, 635);
  assert.equal(bundle.count, 74);
  const archives = new Map(bundle.files.map(file => [file.originalPath, file]));
  for (const file of initial.entries) {
    const archived = archives.get(file.path);
    assert.equal(sha(fs.readFileSync(path.join(repo, archived ? archived.path : file.path))), file.sha256, file.path);
  }
  const original = JSON.parse(fs.readFileSync(path.join(repo, generation.preservation.originalManifest)));
  const frozen = JSON.parse(fs.readFileSync(path.join(repo, generation.preservation.frozenBlockedManifest)));
  assert.deepEqual(historical.files.map(file => file.path).sort(), initial.entries
    .filter(file => /(?:^|\\)evidence(?:\\|\.json$)|\\result\.json$/.test(file.path)).map(file => file.path).sort());
  assert.equal(original.files.length, 371);
  assert.equal(frozen.files.length, 51);
  assert.equal(historical.files.length, generation.preservation.files);
  for (const file of historical.files) {
    assert.equal(sha(fs.readFileSync(path.join(repo, file.path))), file.sha256, file.path);
  }
  for (const file of original.files) {
    assert.equal(sha(git(['show', `${FIXED_SOURCE}:${file.path.replaceAll('\\', '/')}`])),
      file.canonicalGitSourceSha256, file.path);
  }
  const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'prior-archives.json')));
  assert.deepEqual([raw.count, raw.textArchives, raw.gzipArchives], [276, 152, 124]);
  assert.deepEqual([raw.previousOp150Count, raw.previousOp150Text, raw.previousOp150Gzip], [111, 45, 66]);
  for (const file of raw.files) assert.equal(sha(fs.readFileSync(path.join(repo, file.path))), file.sha256, file.path);
  for (const file of raw.previousOp150Archives) {
    const object = git(['hash-object', '--no-filters', '--', file.path]).toString().trim();
    assert.equal(git(['hash-object', `--path=${file.canonicalGitPath}`, '--', file.path]).toString().trim(), object);
    assert.equal(git(['rev-parse', `${FIXED_SOURCE}:${file.canonicalGitPath}`]).toString().trim(), object);
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
  const redPath = path.join(repo, generation.recovery.originalBehavioralRed.path);
  const red = JSON.parse(fs.readFileSync(redPath, 'utf8'));
  const binding = JSON.parse(fs.readFileSync(path.join(repo, generation.recovery.originalBehavioralRed.bindingPath)));
  const iac = JSON.parse(fs.readFileSync(path.join(evidence, 'iac-na.json'), 'utf8'));
  assert.equal(red.exitCode, 1);
  assert.deepEqual(red.summary, { tests: 18, suites: 0, pass: 1, fail: 17, cancelled: 0, skipped: 0, todo: 0 });
  assert.match(red.stdout, /135 !== 150/);
  for (const id of generation.newlyAcceptedPortableIds) {
    assert.match(red.stdout, new RegExp(`not ok \\d+ - ${id} newly accepted`));
  }
  assert.match(red.stdout, /ok 18 - negative gates/);
  assert.match(red.stdout, /ERR_ASSERTION/);
  assert.doesNotMatch(red.stdout, /MODULE_NOT_FOUND|SyntaxError/);
  assert.equal(sha(fs.readFileSync(path.join(repo, binding.assertionsPath))), binding.assertionsSha256);
  assert.equal(sha(fs.readFileSync(path.join(repo, binding.bddPath))), binding.bddSha256);
  assert.equal(binding.oldCatalogSha256, generation.previous.sha256);
  assert.equal(binding.oldCatalogAfterSha256, binding.oldCatalogSha256);
  assert.equal(binding.oldCatalogLoadable, true);
  assert.deepEqual(binding.unchangedValidatorBeforeRed, { valid: true, errors: [] });
  for (const stream of ['stdout', 'stderr']) {
    const raw = gunzipSync(fs.readFileSync(path.join(path.dirname(redPath), red.transcripts[stream].path)));
    assert.equal(sha(raw), red.transcripts[stream].sha256);
    assert.equal(raw.toString('utf8'), red[stream]);
  }
  assert.ok(Date.parse(iac.recordedAtUtc) >= Date.parse(red.completedAtUtc));
  assert.equal(iac.applicability, 'not-applicable');
  assert.equal(iac.recordedBefore, 'fixed165 source-pin catalog write');
  const written = JSON.parse(fs.readFileSync(path.join(evidence, 'source-write-01.json')));
  assert.ok(Date.parse(written.startedAtUtc) >= Date.parse(iac.recordedAtUtc));
});

test('all five browser suites gate published provenance and append new observations only with the exact capture opt-in', () => {
  for (const scope of ['C005', 'C006', 'C007', 'C008', 'local-harness']) {
    const browser = fs.readFileSync(path.join(repo, 'capability', scope, 'tests', 'browser.test.cjs'), 'utf8');
    assert.ok(browser.includes('53c0c0d82cc1db6780a87ac2b1085734af6d5c60'), scope);
    assert.ok(browser.includes('86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055'), scope);
    const gate = browser.indexOf('PUBLISHED_HELPER_SHA256,');
    assert.ok(gate >= 0 && gate < browser.indexOf('const { openIsolatedLesson } = require(helperPath)'), scope);
    assert.match(browser, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
    assert.match(browser, /browser-op-catalog-snapshot-refresh-165-c8b3139f07aa-\$\{randomUUID\(\)\}\.json/);
    assert.match(browser, /flag: 'wx'/);
    assert.match(browser, /assert\.equal\(t\.signal\.aborted, false/);
    assert.doesNotMatch(browser, /fs\.(?:rm|unlink|truncate)/);
    assert.match(browser, /finally \{\s*await session\.close\(\)/);
  }
});

test('the preceding actual oversized-ledger failure is retained and its existing 8 MiB bound is unchanged', () => {
  const priorEvidence = path.join(repo, 'capability', 'C005', 'evidence', 'op-catalog-snapshot-refresh-115-e8a3064f8554');
  const failed = JSON.parse(fs.readFileSync(path.join(priorEvidence, 'source-write-attempt-01.json')));
  const repaired = JSON.parse(fs.readFileSync(path.join(priorEvidence, 'source-write-attempt-02.json')));
  const provenance = JSON.parse(fs.readFileSync(path.join(priorEvidence, 'source-buffer-failure-provenance.json')));
  assert.equal(failed.exitCode, 1);
  assert.match(failed.stderr, /ENOBUFS/);
  assert.equal(repaired.exitCode, 0);
  assert.ok(Date.parse(repaired.startedAtUtc) >= Date.parse(failed.completedAtUtc));
  assert.ok(Buffer.byteLength(source.readPinnedSources().ledgerText) > 1024 * 1024);
  assert.equal(generation.generator.gitReadMaxBufferBytes, 8 * 1024 * 1024);
  assert.equal(sha(fs.readFileSync(path.join(priorEvidence, provenance.failedGeneratorArchive))),
    provenance.failedGeneratorRawSha256);
  assert.equal(provenance.unchangedOldDataSha256, generation.prior86.sha256);
  assert.equal(JSON.parse(fs.readFileSync(path.join(evidence, 'source-write-01.json'))).exitCode, 0);
});

test('S107 static preparation retains local CORS requirements without certifying HTTP-origin or native Azure behavior', async () => {
  const view = await prepare(catalog, matrix, 'S107');
  assert.equal(view.learningMode, 'synthetic-learning');
  assert.equal(view.entry.title, 'CORS differences');
  assert.match(view.entry.implementation, /two owned browser origins.*compatible\/incompatible CORS/);
  assert.match(view.entry.acceptance, /Real browser enforcement is measured.*denied access is not bypassed/);
  assert.equal(view.entry.learning.href, '../../learning/S107/index.html');
  assert.equal(view.entry.native.runnable, false);
  assert.equal(view.entry.native.qualified, false);
  assert.deepEqual(view.entry.native.evidence, []);
  assert.equal(view.entry.parent.completed, false);
  assert.equal(view.approvalValidation.nativeReady, false);
  assert.equal(view.approved.approval.operatingEnvelope.maximumLiveAzureRuns, 0);
  assert.equal(view.approved.approval.operatingEnvelope.authorizedCloudSpend, 0);
  assert.equal(generation.S107StaticEntryCertifiesHttpOriginBehavior, false);
  assert.equal(generation.S107NativeAzureProof, false);
});

test('helper and Admin stay unchanged while the exact parent-approved publisher version is separately bound', () => {
  const initial = JSON.parse(fs.readFileSync(path.join(evidence, 'initial-boundary.json')));
  const version = JSON.parse(fs.readFileSync(path.join(evidence, 'readonly-boundary-version-change-04.json')));
  assert.equal(initial.readonlyExtra.standardPublisher.sha256,
    '7120de03173ca30bd993c8a7a77c81ebdafa504a508060aed18ec00bef6de7d3');
  assert.equal(version.parentApproved, true);
  assert.equal(version.currentPublisher.sha256,
    'f6df80bdafc028538813330fe810bd81a69a50822a4a862e0bf42f59b2b0b2a4');
  assert.equal(version.previousPublisher.sha256,
    '48846487727dd2ef35f03d88d65e64121059b6867188bbf34daeaee3fda1c09d');
  assert.equal(version.catalogRuntimeSchemaAuthorityOrSourceChanged, false);
  assert.equal(version.oldInitialBoundaryRewritten, false);
  const approvedPublisher = fs.readFileSync(path.join(__dirname, 'fixtures', 'publish-f6df80bdafc0.ps1.txt'));
  for (const file of Object.values(initial.readonlyExtra)) {
    const bound = file.path === version.currentPublisher.path;
    const bytes = bound ? approvedPublisher : fs.readFileSync(path.join(repo, file.path));
    assert.equal(sha(bytes), bound ? version.currentPublisher.sha256 : file.sha256, file.path);
  }
  assert.equal(generation.originalParentOrKanoCredit, false);
  for (const key of ['H001Complete', 'H002Complete', 'production24Validated', 'liveAvailability']) {
    assert.equal(generation[key], false, key);
  }
});
