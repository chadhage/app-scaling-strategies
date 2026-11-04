'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const repo = path.resolve(__dirname, '..', '..');
const revision = process.argv[2];
assert.equal(process.argv.length, 3, 'Supply only the exact implementation commit.');
assert.equal(typeof revision === 'string' && revision.length === 40 && /^[0-9a-f]{40}$/.test(revision), true, 'Expected an exact 40-character lowercase commit SHA.');
const git = (...args) => execFileSync('git', ['--no-pager', ...args], { cwd: repo });
assert.equal(git('cat-file', '-t', revision).toString().trim(), 'commit');
const message = git('show', '-s', '--format=%B', revision).toString();
assert.match(message, /^\[A-S129\]\[S\]/);
assert.match(message, /Co-authored-by: Copilot <223556219\+Copilot@users\.noreply\.github\.com>/);
const tag = `kanban/A-S129/${revision.slice(0, 12)}`;
assert.equal(git('cat-file', '-t', tag).toString().trim(), 'tag');
assert.equal(git('rev-parse', `${tag}^{}`).toString().trim(), revision);
const files = git('diff-tree', '--no-commit-id', '--name-only', '-r', revision).toString().trim().split('\n');
assert.equal(files.length > 0 && files.every((file) => file.startsWith('learning/S129/')), true, 'Implementation changes must be owned-only.');
let rawFiles = 0;
for (const file of files) {
  const bytes = fs.readFileSync(path.join(repo, ...file.split('/')));
  const raw = file.startsWith('learning/S129/evidence/raw/') || file.startsWith('learning/S129/evidence/red-stub/');
  if (raw) rawFiles++;
  const expected = raw ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
  assert.deepEqual(git('show', `${revision}:${file}`), expected, `Published bytes: ${file}`);
}
const rawDirectory = path.join(__dirname, 'evidence', 'raw');
const reports = fs.readdirSync(rawDirectory).filter((name) => /^browser-.*\.json$/.test(name))
  .map((name) => ({ name, report: JSON.parse(fs.readFileSync(path.join(rawDirectory, name), 'utf8')) }));
const acceptedObservation = reports.find(({ report }) => report.passed && report.awaitedCleanupCompleted && report.checks.length === 12 && report.checks.every((check) => check.passed));
assert.equal(!!acceptedObservation, true, 'A genuine successful browser observation with awaited cleanup is required.');
assert.equal(acceptedObservation.report.actualBrowser, true);
assert.equal(acceptedObservation.report.mockDOM, false);
assert.equal(acceptedObservation.report.nativeVerified, false);
assert.equal(acceptedObservation.report.sourceParentComplete, false);
assert.equal(acceptedObservation.report.extraKanoCredits, 0);
console.log(JSON.stringify({
  cardId: 'A-S129', commit: revision, tag, ownedFiles: files.length, rawFiles,
  canonicalTextFiles: files.length - rawFiles, browserEvidence: acceptedObservation.name,
  browserLeafChecks: 12, nativeVerified: false, sourceParentComplete: false, extraKanoCredits: 0,
}));
