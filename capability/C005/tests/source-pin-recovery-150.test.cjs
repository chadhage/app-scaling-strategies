'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const catalog = require('../catalog-data.js');
const contract = require('../catalog-contract.js');
const matrix = require('../../C003/matrix-data.js');
const source = require('../catalog-source.cjs');
const generation = require('../evidence/op-catalog-snapshot-refresh-150-ebd7433ac143/generation.json');
const root = path.resolve(__dirname, '..', '..', '..');
const read = file => fs.readFileSync(path.join(root, file));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = args => execFileSync('git', ['--no-pager', ...args], { cwd: root, maxBuffer: 8388608 });

test('the frozen failed source remains rejected by unchanged chronology and retains its original RED and exact file set', () => {
  const failed = require(path.join(root, generation.recovery.failedGeneratedData.path));
  assert.equal(sha(read(generation.recovery.failedGeneratedData.path)), generation.recovery.failedGeneratedData.sha256);
  assert.deepEqual(contract.validateCatalog(failed, matrix), { valid: false, errors: [
    'acceptanceSnapshot.ledgerUpdatedAtUtc: cannot postdate the committed snapshot'
] });
  const ledger = JSON.parse(git(['show', `${generation.recovery.supersededSource}:.docs/wiki/flow-state.json`]));
  assert.equal(ledger.updatedAtUtc, '2026-11-04T02:52:27.0181908Z');
  assert.equal(Date.parse(ledger.updatedAtUtc) - Date.parse(failed.source.commitTimeUtc), 18);
  const frozen = JSON.parse(read(generation.preservation.frozenBlockedManifest));
  assert.equal(frozen.files.length, 51);
  const blockedPath = path.join(root, generation.recovery.blockedAttempt);
  const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.relative(root, path.join(directory, entry.name))]);
  assert.deepEqual(walk(blockedPath).sort(), frozen.files.map(file => file.path).sort());
  for (const file of frozen.files) assert.equal(sha(read(file.path)), file.sha256, file.path);
  const red = JSON.parse(read(generation.recovery.originalBehavioralRed.path));
  assert.deepEqual(red.summary, { tests: 18, suites: 0, pass: 1, fail: 17, cancelled: 0, skipped: 0, todo: 0 });
  assert.equal(red.oldCatalogSha256, '549fba2019ea40d0cc6cdd8b23ad87be31fa30dcbf1cf4f22c843f0cd12e9334');
  assert.equal(red.oldCatalogAfterSha256, red.oldCatalogSha256);
});

test('the approved full source has exactly150 originals/135 practices and valid unmodified Node-parsed timestamps', () => {
  assert.equal(generation.sourceCommit, 'ebd7433ac143242ab633b52aff864bb2923dac2c');
  const ledgerBytes = git(['show', `${generation.sourceCommit}:.docs/wiki/flow-state.json`]);
  const ledger = JSON.parse(ledgerBytes);
  assert.equal(ledger.updatedAtUtc, '2026-11-04T02:53:47.0882168Z');
  assert.equal(catalog.source.commitTimeUtc, '2026-11-04T02:53:48.000Z');
  assert.ok(Date.parse(ledger.updatedAtUtc) < Date.parse(catalog.source.commitTimeUtc));
  assert.equal(catalog.acceptanceSnapshot.ledgerUpdatedAtUtc, ledger.updatedAtUtc);
  assert.equal(catalog.acceptanceSnapshot.ledgerSha256, sha(ledgerBytes));
  assert.equal(ledger.cards.filter(source.acceptedLesson).length, 150);
  assert.deepEqual(ledger.kanoDone, { S: 148, L: 0, D: 2 });
  assert.deepEqual(ledger.cards.filter(source.acceptedLesson).filter(card => /^A-S\d{3}$/.test(card.id))
    .map(card => card.id.slice(2)).sort(), Array.from({ length: 135 }, (_, index) => `S${String(index + 1).padStart(3, '0')}`));
  assert.deepEqual(contract.validateCatalog(catalog, matrix), { valid: true, errors: [] });
  assert.equal(source.PINNED_COMMIT, generation.sourceCommit);
  assert.deepEqual(source.buildCatalog(), catalog);
  assert.deepEqual(ledger.completedParents, []);
  assert.equal(generation.recovery.timestampFalsification, false);
  assert.equal(generation.recovery.validatorSchemaAuthorityOrChronologyRelaxation, false);
});
