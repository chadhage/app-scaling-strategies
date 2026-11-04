'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { inspectCurrent, readCurrentAuthority } = require('./publisher-authority.cjs');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function inventory() {
  const files = {};
  function visit(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, item.name);
      if (directory === root && item.name === 'publication.json') continue;
      if (item.isSymbolicLink()) throw new Error('Source/evidence inventory will not follow a link.');
      if (item.isDirectory()) visit(target);
      else if (item.isFile()) files[path.relative(root, target)] = sha(fs.readFileSync(target));
      else throw new Error('Only owned regular source/evidence files are supported.');
    }
  }
  visit(root);
  return files;
}

function checkDependencies() {
  const pins = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'dependencies.json'), 'utf8'));
  const observed = {};
  for (const pin of pins.files) {
    const file = path.join(repo, pin.path);
    const bytes = fs.readFileSync(file);
    if (sha(bytes) !== pin.rawSha256) throw new Error(`Dependency raw bytes changed: ${pin.path}`);
    const gitName = pin.path.split(path.sep).join('/');
    const blob = execFileSync('git', ['hash-object', `--path=${gitName}`, file], { encoding: 'utf8', windowsHide: true }).trim();
    if (blob !== pin.referenceGitBlob) throw new Error(`Dependency Git canonical bytes changed: ${pin.path}`);
    const canonical = execFileSync('git', ['cat-file', 'blob', blob], { windowsHide: true });
    if (sha(canonical) !== pin.canonicalSha256) throw new Error(`Dependency canonical SHA changed: ${pin.path}`);
    observed[pin.path] = sha(bytes);
  }
  for (const helper of [pins.browser]) {
    const bytes = fs.readFileSync(path.join(repo, helper.path));
    if (sha(bytes) !== helper.sha256) throw new Error(`Approved exact helper SHA changed: ${helper.path}`);
    observed[helper.path] = sha(bytes);
  }
  return observed;
}

const historicalCommit = '845079a65b74f73a5d6b163e7d7f88527b53d828';
const historicalPublisherSha256 = 'f6df80bdafc028538813330fe810bd81a69a50822a4a862e0bf42f59b2b0b2a4';

function verifyHistoricalPublisher(history, source, boundary, authority, report) {
  if (history?.schemaVersion !== 1 || history.cardId !== 'C018' || history.kano !== 'S' ||
      history.role !== 'historical-publication-used' || history.usedForCommit !== historicalCommit ||
      history.tag !== 'kanban/C018/845079a65b74' || history.publisherRawSha256 !== historicalPublisherSha256 ||
      boundary?.expectedSha256 !== historicalPublisherSha256 ||
      authority?.actualPublisherSha256 !== historicalPublisherSha256 ||
      authority.currentParentAuthorization?.publisherSha256 !== historicalPublisherSha256 ||
      authority.currentParentAuthorization?.approvedBy !== 'parent-controller' ||
      authority.currentParentAuthorization?.exactAddedClasses?.C018 !== 'S' ||
      report?.commit !== historicalCommit || report.tag !== history.tag ||
      report.publisherSha256 !== historicalPublisherSha256 || report.kano !== 'S') {
    throw new Error('HISTORICAL_ATTRIBUTION_MISMATCH: 845079 used the preserved F6 authority, not a later publisher.');
  }
  if (!Buffer.isBuffer(source) || sha(source) !== historicalPublisherSha256) {
    throw new Error('HISTORICAL_SOURCE_MISMATCH: inspect preserved F6 bytes, never the live private publisher.');
  }
  return Object.freeze({ role: history.role, commit: historicalCommit, tag: history.tag,
    usedPublisherSha256: historicalPublisherSha256, historicalSnapshotVerified: true,
    normalVerificationAuthorizesPublication: false, publicationPerformed: false });
}

function historicalPublisherBoundary() {
  const history = JSON.parse(fs.readFileSync(path.join(root, 'publisher-history.json'), 'utf8'));
  const read = (entry) => {
    const bytes = fs.readFileSync(path.join(root, entry.path));
    if (sha(bytes) !== entry.rawSha256) throw new Error(`Historical raw evidence changed: ${entry.path}`);
    return bytes;
  };
  const source = read(history.publisherSourceSnapshot);
  const files = Object.fromEntries(Object.entries(history.files).map(([name, entry]) => [name, read(entry)]));
  const blob = execFileSync('git', ['rev-parse', `${historicalCommit}:capability/C018/publisher-boundary.json`],
    { encoding: 'utf8', windowsHide: true }).trim();
  if (blob !== history.historicalBoundaryGitBlob) throw new Error('Historical canonical boundary identity changed.');
  const canonical = JSON.parse(execFileSync('git', ['cat-file', 'blob', blob], { encoding: 'utf8', windowsHide: true }));
  const boundary = JSON.parse(files.boundary);
  if (JSON.stringify(canonical) !== JSON.stringify(boundary)) throw new Error('Historical boundary raw/canonical content differs.');
  return verifyHistoricalPublisher(history, source, boundary, JSON.parse(files.authority), JSON.parse(files.publishedReport));
}

function publisherBoundary() {
  const historical = historicalPublisherBoundary();
  const observed = readCurrentAuthority();
  let current = observed.assessment;
  try {
    const actual = sha(fs.readFileSync(path.join(repo, '.git', 'kanban-orchestrator', 'publish.ps1')));
    current = observed.snapshot ? inspectCurrent(observed.snapshot, actual)
      : Object.freeze({ ...observed.assessment, actualSha256: actual, exactAuthorizedBytes: false });
  } catch {
    current = Object.freeze({ ...observed.assessment, code: 'HOLD_CURRENT_PUBLISHER_UNAVAILABLE', exactAuthorizedBytes: false });
  }
  return Object.freeze({ historical, current, diagnosticOnly: true,
    normalVerificationAuthorizesPublication: false, publicationPerformed: false });
}

module.exports = Object.freeze({ root, repo, sha, inventory, checkDependencies, historicalCommit,
  historicalPublisherSha256, verifyHistoricalPublisher, historicalPublisherBoundary, publisherBoundary });
