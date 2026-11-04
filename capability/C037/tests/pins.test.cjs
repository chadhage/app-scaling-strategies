'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const pins = require('..\\pins.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const pinsFile = require.resolve('..\\pins.cjs');
const realExecFileSync = childProcess.execFileSync;
const manifest = path.join('capability', 'C037', 'manifest.json');
const codeOf = (operation) => {
  try { operation(); } catch (error) { return error.code; }
  return 'NO_FAILURE';
};
const overlay = (stat, values) => Object.create(stat, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])));
// Patches fs only for one synchronous call and returns the failure code, so no assertion code runs while fs is patched.
function failureWith(replacements, operation) {
  const originals = Object.fromEntries(Object.keys(replacements).map((name) => [name, fs[name]]));
  try {
    for (const [name, make] of Object.entries(replacements)) fs[name] = make(originals[name]);
    return codeOf(operation);
  } finally { Object.assign(fs, originals); }
}
// Loads a fresh pins module whose child-process runner is replaced; the stub is captured at load time.
function loadWith(execFileSync) {
  const cached = require.cache[pinsFile];
  delete require.cache[pinsFile];
  childProcess.execFileSync = execFileSync;
  try { return require(pinsFile); } finally {
    childProcess.execFileSync = realExecFileSync;
    delete require.cache[pinsFile];
    if (cached) require.cache[pinsFile] = cached;
  }
}
function archivedState() {
  const history = JSON.parse(fs.readFileSync(path.join(root, 'authority-history.json'), 'utf8'));
  const bytes = fs.readFileSync(path.join(root, history.approval));
  assert.equal(pins.hash(bytes), history.approvalSha256, 'The archived State snapshot is pinned by its recorded hash.');
  return JSON.parse(bytes);
}
const gitBatch = (tamper) => loadWith((command, args, options) => {
  const output = realExecFileSync(command, args, options);
  return command === 'git' && args.includes('--batch') ? tamper(Buffer.from(output)) : output;
});
const stateReader = (state, calls = []) => loadWith((command, args, options) => {
  calls.push({ command, args, options });
  return Buffer.from(typeof state === 'string' ? state : JSON.stringify(state));
});
test('a pinned source is read only as a bounded regular file inside the repository', () => {
  assert.deepEqual(pins.readRegular(manifest), fs.readFileSync(path.join(repository, manifest)));
  assert.equal(pins.imports().dependencies.length, 23);
  assert.deepEqual(Object.keys(pins.imports().accepted), ['C036', 'C034', 'C033', 'C020', 'C015']);
});
test('paths that are not plain relative repository paths are refused before touching the filesystem', () => {
  for (const argument of [undefined, 42, path.join(repository, manifest), 'C:capability', 'capability\0manifest.json']) {
    assert.equal(codeOf(() => pins.readRegular(argument)), 'RELATIVE_PINNED_SOURCE_REQUIRED', String(argument));
  }
  for (const escape of ['..\\outside.txt', 'capability\\..\\..\\outside.txt']) assert.equal(codeOf(() => pins.readRegular(escape)), 'SOURCE_SCOPE', escape);
});
test('directories, oversize files and hard links are not regular bounded sources and a missing file is an error', () => {
  assert.equal(codeOf(() => pins.readRegular(path.join('capability', 'C037'))), 'REGULAR_BOUNDED_SOURCE_REQUIRED');
  assert.equal(codeOf(() => pins.readRegular(manifest, 10)), 'REGULAR_BOUNDED_SOURCE_REQUIRED');
  assert.equal(codeOf(() => pins.readRegular(path.join('capability', 'C037', 'absent-source.json'))), 'ENOENT');
  const hardLinked = failureWith({ lstatSync: (real) => (target, ...rest) => {
    const stat = real(target, ...rest);
    return String(target).endsWith(`${path.sep}manifest.json`) ? overlay(stat, { nlink: 2 }) : stat;
  } }, () => pins.readRegular(manifest));
  assert.equal(hardLinked, 'REGULAR_BOUNDED_SOURCE_REQUIRED');
});
test('a linked path component is refused, by link flag or by a real path that differs', () => {
  const flagged = failureWith({ lstatSync: (real) => (target, ...rest) => {
    const stat = real(target, ...rest);
    return String(target).endsWith(`${path.sep}capability`) ? overlay(stat, { isSymbolicLink: () => true }) : stat;
  } }, () => pins.readRegular(manifest));
  assert.equal(flagged, 'LINKED_SOURCE_FORBIDDEN');
  const redirected = failureWith({ realpathSync: () => () => 'elsewhere' }, () => pins.readRegular(manifest));
  assert.equal(redirected, 'LINKED_SOURCE_FORBIDDEN');
});
test('a source that changes identity, size or time between the check and the read is refused', () => {
  const opened = (values) => failureWith({ fstatSync: (real) => (fd, ...rest) => overlay(real(fd, ...rest), values) }, () => pins.readRegular(manifest));
  assert.equal(opened({ ino: -1 }), 'SOURCE_CHANGED');
  assert.equal(opened({ dev: -1 }), 'SOURCE_CHANGED');
  assert.equal(opened({ nlink: 2 }), 'SOURCE_CHANGED');
  const shortRead = failureWith({ readFileSync: (real) => (target, ...rest) => {
    const bytes = real(target, ...rest);
    return typeof target === 'number' ? bytes.subarray(1) : bytes;
  } }, () => pins.readRegular(manifest));
  assert.equal(shortRead, 'SOURCE_CHANGED');
  for (const values of [{ size: 1 }, { mtimeMs: 1 }]) {
    const afterRead = failureWith({ fstatSync: (real) => {
      let calls = 0;
      return (fd, ...rest) => {
        const stat = real(fd, ...rest);
        return ++calls === 2 ? overlay(stat, values) : stat;
      };
    } }, () => pins.readRegular(manifest));
    assert.equal(afterRead, 'SOURCE_CHANGED', JSON.stringify(values));
  }
});
test('no pin or State override argument is ever accepted', () => {
  assert.equal(codeOf(() => pins.checkImports('override')), 'NO_PIN_OVERRIDES');
  assert.equal(codeOf(() => pins.readState('override')), 'NO_STATE_OVERRIDES');
});
test('the accepted git blobs are verified byte for byte and every deviation is refused', () => {
  assert.equal(codeOf(() => gitBatch((batch) => batch).checkImports()), 'NO_FAILURE');
  const missing = () => Buffer.from(`${'0'.repeat(40)} missing\n`);
  assert.equal(codeOf(() => gitBatch(missing).checkImports()), 'ACCEPTED_GIT_BLOB_REQUIRED');
  const flipped = (batch) => { batch[batch.indexOf(10) + 1] ^= 0xff; return batch; };
  assert.equal(codeOf(() => gitBatch(flipped).checkImports()), 'PINNED_GIT_OR_DISK_BYTES_CHANGED');
  const trailing = (batch) => Buffer.concat([batch, Buffer.from('trailing')]);
  assert.equal(codeOf(() => gitBatch(trailing).checkImports()), 'GIT_BATCH_TRAILING_BYTES');
});
test('the State snapshot is read by the closed PowerShell reader with no argument and returned unchanged', () => {
  const calls = [];
  const expected = archivedState();
  const snapshot = stateReader(expected, calls).readState();
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), expected);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'pwsh.exe');
  assert.deepEqual(calls[0].args, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', path.join(root, 'read-state.ps1')]);
  assert.equal(calls[0].options.cwd, repository);
  assert.deepEqual(calls[0].options.stdio, ['ignore', 'pipe', 'pipe']);
});
test('a State snapshot without exact consent and five independently accepted prerequisites is refused', () => {
  const edits = [
    ['CURRENT_ACCEPTANCE_AND_LOCAL_CONSENT_REQUIRED', [
      (s) => { s.controllerId = '00000000-0000-0000-0000-000000000000'; },
      (s) => { s.C001LocalConsent = false; },
      (s) => { s.C015FixtureApproval = 'true'; },
      (s) => { s.prerequisites = {}; },
      (s) => { s.prerequisites.pop(); },
      (s) => { s.prerequisites.push(structuredClone(s.prerequisites[0])); }]],
    ['INDEPENDENT_ACCEPTED_SOURCES_REQUIRED', [
      (s) => { s.prerequisites[0].id = 'C999'; },
      (s) => { s.prerequisites[1].id = 'C036'; },
      (s) => { s.prerequisites[0].state = 'In Progress'; },
      (s) => { s.prerequisites[0].publication.commit = '0'.repeat(40); },
      (s) => { delete s.prerequisites[0].publication; },
      (s) => { s.prerequisites[0].publication.tag = 'kanban/C036/unreviewed'; },
      (s) => { s.prerequisites[0].reviewCommit = '0'.repeat(40); },
      (s) => { s.prerequisites[0].reviewTag = 'unreviewed'; },
      (s) => { s.prerequisites[0].accepted = false; },
      (s) => { s.prerequisites[1].focusedTestsPassed = 'true'; },
      (s) => { s.prerequisites[2].browserObserved = null; },
      (s) => { s.prerequisites[4].remoteVerified = false; }]]
  ];
  for (const [code, list] of edits) {
    for (const edit of list) {
      const snapshot = archivedState();
      edit(snapshot);
      assert.equal(codeOf(() => stateReader(snapshot).readState()), code, edit.toString());
    }
  }
});
