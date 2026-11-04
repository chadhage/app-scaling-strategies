'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const source = require('..\\source.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
test('27 fixed raw working and accepted Git canonical source files verify without repinning', () => {
  const checked = source.checkImports();
  assert.equal(checked.length, 27);
  assert.equal(source.pins.accepted.C023.commit, '68be1c61cd83f177b45cbef4f4577c80c57d690e');
  assert.equal(source.pins.accepted.C029.commit, '257f44fa0fdcaee076769f37cf279aa3384ee171');
  assert.ok(checked.some((entry) => !entry.rawWorkingEqualsGitCanonical), 'CRLF raw evidence must not be relabeled canonical.');
  assert.equal(source.pins.privatePublisherIsNotPinnedByThisManifest, true);
});
test('separate immutable working and canonical snapshots reproduce all fixed pins', () => {
  for (const entry of source.pins.dependencies) {
    assert.notEqual(entry.workingSnapshot, entry.canonicalSnapshot);
    const raw = gunzipSync(fs.readFileSync(path.join(root, entry.workingSnapshot)));
    const canonical = gunzipSync(fs.readFileSync(path.join(root, entry.canonicalSnapshot)));
    assert.equal(source.hash(raw), entry.rawWorkingSha256);
    assert.equal(source.hash(source.normalize(raw)), entry.crlfToLfSha256);
    assert.equal(source.hash(canonical), entry.acceptedGitSha256);
    assert.equal(raw.equals(canonical), entry.rawWorkingEqualsGitCanonical);
    const altered = Buffer.from(raw); altered[0] ^= 1;
    assert.notEqual(source.hash(altered), entry.rawWorkingSha256);
  }
});
test('independent C023+C029 Done gates and exact frozen row are read under state mutex', () => {
  const gates = source.readGates();
  assert.equal(gates.literalLocalConsent, true);
  assert.equal(gates.exactOriginalRow, true);
  assert.equal(gates.readHandlesClosedBeforeRelease, true);
  assert.deepEqual(gates.cards.map((card) => card.id), ['C023', 'C029']);
  assert.ok(gates.cards.every((card) => card.state === 'Done' && card.accepted === true && card.browserObserved === true &&
    card.focusedTestsPassed === true && card.remoteVerified === true));
  assert.match(gates.mutex, /KanbanState/);
});
test('read-only source checks reject path and caller pin/gate overrides', () => {
  for (const relative of ['.git\\kanban-orchestrator\\publish.ps1', '..\\C023\\ledger.js', 'capability\\C023\\..\\C029\\evaluator.js',
    'https://example.invalid/', 'C:\\private', 'capability/C023/ledger.js']) assert.throws(() => source.read(relative));
  for (const name of ['checkImports', 'readGates', 'preflight']) assert.throws(() => source[name]({ eligible: true }));
});
test('actual CLI closes IDs, keeps exact exit codes and reads JSON without source adoption', () => {
  const cli = path.join(root, 'cli.cjs');
  const run = (args, input) => spawnSync(process.execPath, [cli, ...args], {
    cwd: repository, input, timeout: 60000, maxBuffer: 8 * 1024 * 1024, windowsHide: true
  });
  for (const [id, exit, decision] of [['control-one', 0, 'PASS'], ['control-duplicate-application', 1, 'FAIL'],
    ['model-reconciled', 2, 'HOLD'], ['control-unsupported', 2, 'UNSUPPORTED']]) {
    const output = run(['inspect', id]);
    assert.equal(output.status, exit, output.stderr.toString());
    assert.equal(JSON.parse(output.stdout).decision, decision);
  }
  const output = run(['inspect-copy', 'history-closed'], '{"id":"history-closed","id":"healthy"}');
  assert.equal(output.status, 3);
  assert.equal(JSON.parse(output.stdout).counts.originals, 7);
  assert.equal(run(['inspect', 'control-one', '--eligible']).status, 3);
  assert.equal(run(['inspect', '..\\C023\\ledger.js']).status, 3);
});
