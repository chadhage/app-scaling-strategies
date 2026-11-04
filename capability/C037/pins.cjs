'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..', '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalize = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
function fail(code) { throw Object.assign(new Error(code), { code }); }
function readRegular(relative, maximum = 1048576) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || /[:\0]/.test(relative)) fail('RELATIVE_PINNED_SOURCE_REQUIRED');
  const file = path.resolve(root, relative);
  if (!file.startsWith(`${root}${path.sep}`)) fail('SOURCE_SCOPE');
  let current = root;
  for (const piece of path.relative(root, file).split(path.sep)) {
    current = path.join(current, piece);
    if (fs.lstatSync(current).isSymbolicLink() || fs.realpathSync(current) !== current) fail('LINKED_SOURCE_FORBIDDEN');
  }
  const before = fs.lstatSync(file);
  if (!before.isFile() || before.nlink !== 1 || before.size > maximum) fail('REGULAR_BOUNDED_SOURCE_REQUIRED');
  const fd = fs.openSync(file, fs.constants.O_RDONLY);
  try {
    const opened = fs.fstatSync(fd);
    if (opened.ino !== before.ino || opened.dev !== before.dev || opened.nlink !== 1) fail('SOURCE_CHANGED');
    const bytes = fs.readFileSync(fd);
    const after = fs.fstatSync(fd);
    if (bytes.length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) fail('SOURCE_CHANGED');
    return bytes;
  } finally { fs.closeSync(fd); }
}
function imports() { return JSON.parse(readRegular(path.join('capability', 'C037', 'imports.json')).toString('utf8')); }
function checkImports() {
  if (arguments.length) fail('NO_PIN_OVERRIDES');
  const pins = imports();
  const input = pins.dependencies.map((entry) => `${entry.commit}:${entry.path.replaceAll('\\', '/')}`).join('\n') + '\n';
  const batch = execFileSync('git', ['--no-pager', 'cat-file', '--batch'], {
    cwd: root, input, timeout: 20000, maxBuffer: 4194304, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
  });
  let offset = 0;
  const checked = pins.dependencies.map((entry) => {
    const raw = readRegular(entry.path);
    const end = batch.indexOf(10, offset);
    const match = /^[0-9a-f]{40} blob (\d+)$/.exec(batch.subarray(offset, end).toString('ascii'));
    if (end < offset || !match) fail('ACCEPTED_GIT_BLOB_REQUIRED');
    const length = Number(match[1]);
    const blob = batch.subarray(end + 1, end + 1 + length);
    offset = end + length + 2;
    if (blob.length !== length || batch[offset - 1] !== 10 || hash(blob) !== entry.acceptedGitSha256 ||
        hash(raw) !== entry.rawSha256 || hash(normalize(raw)) !== entry.crlfToLfSha256) fail('PINNED_GIT_OR_DISK_BYTES_CHANGED');
    return { path: entry.path, rawSha256: hash(raw), acceptedGitSha256: hash(blob),
      rawEqualsGit: raw.equals(blob), crlfToLfSha256: hash(normalize(raw)) };
  });
  if (offset !== batch.length) fail('GIT_BATCH_TRAILING_BYTES');
  require('..\\C036\\pins.cjs').checkImports();
  return checked;
}
function readState() {
  if (arguments.length) fail('NO_STATE_OVERRIDES');
  const bytes = execFileSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
    path.join(__dirname, 'read-state.ps1')], {
    cwd: root, timeout: 45000, maxBuffer: 65536, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  const snapshot = require('..\\C034\\trace.js').parseJson(bytes.toString('utf8'));
  const pins = imports();
  if (snapshot.controllerId !== '942b9aec-aa3f-4179-b6ed-e2bc57abeed2' ||
      snapshot.C001LocalConsent !== true || snapshot.C015FixtureApproval !== true ||
      !Array.isArray(snapshot.prerequisites) || snapshot.prerequisites.length !== 5) fail('CURRENT_ACCEPTANCE_AND_LOCAL_CONSENT_REQUIRED');
  const seen = new Set();
  for (const entry of snapshot.prerequisites) {
    const expected = pins.accepted[entry.id];
    if (!expected || seen.has(entry.id) || entry.state !== 'Done' || entry.publication?.commit !== expected.commit ||
        entry.publication?.tag !== expected.tag || entry.reviewCommit !== expected.commit || entry.reviewTag !== expected.tag ||
        ['accepted', 'focusedTestsPassed', 'browserObserved', 'remoteVerified'].some((key) => entry[key] !== true)) {
      fail('INDEPENDENT_ACCEPTED_SOURCES_REQUIRED');
    }
    seen.add(entry.id);
  }
  return snapshot;
}
module.exports = Object.freeze({ hash, normalize, readRegular, imports, checkImports, readState });
