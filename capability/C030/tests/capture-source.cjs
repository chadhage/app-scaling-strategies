'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1');
assert.equal(process.argv.length, 2);
assert.equal(fs.existsSync(path.join(root, 'imports.json')), false, 'Immutable imports are captured only once.');
const upstream = require('..\\..\\C029\\imports.json');
const gates = JSON.parse(execFileSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive',
  '-File', path.join(root, 'read-gates.ps1')], { cwd: repository, windowsHide: true, timeout: 40000 }).toString('utf8'));
const accepted = structuredClone(upstream.accepted);
for (const gate of gates.cards) {
  assert.equal(gate.state, 'Done');
  for (const key of ['accepted', 'focusedTestsPassed', 'browserObserved', 'remoteVerified']) assert.equal(gate[key], true);
  assert.equal(gate.reviewCommit, gate.publication.commit);
  assert.equal(gate.reviewTag, gate.publication.tag);
  accepted[gate.id] = gate.publication;
}
assert.equal(accepted.C023.commit, '68be1c61cd83f177b45cbef4f4577c80c57d690e');
assert.equal(accepted.C029.commit, '257f44fa0fdcaee076769f37cf279aa3384ee171');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const paths = [...new Set([...upstream.dependencies.map((entry) => entry.path),
  ...['evaluator.js', 'source.cjs', 'imports.json', 'read-gates.ps1', 'tests\\owned-browser.ps1'].map((name) =>
    path.join('capability', 'C029', name))])];
const directory = path.join(root, 'evidence', 'raw', `source-pins-${randomUUID()}`);
fs.mkdirSync(directory);
const dependencies = paths.map((relative, index) => {
  const card = relative.split('\\')[1];
  const raw = fs.readFileSync(path.join(repository, relative));
  const canonical = execFileSync('git', ['--no-pager', 'show', `${accepted[card].commit}:${relative.replaceAll('\\', '/')}`],
    { cwd: repository, windowsHide: true, maxBuffer: 2 * 1024 * 1024, timeout: 15000 });
  const normalized = Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'));
  const previous = upstream.dependencies.find((entry) => entry.path === relative);
  if (previous) {
    assert.equal(hash(raw), previous.rawSha256);
    assert.equal(hash(canonical), previous.acceptedGitSha256);
  }
  const base = `${String(index + 1).padStart(3, '0')}-${card}-${path.basename(relative)}`;
  const workingSnapshot = path.join(directory, `${base}.working.raw.gz`);
  const canonicalSnapshot = path.join(directory, `${base}.git-canonical.raw.gz`);
  fs.writeFileSync(workingSnapshot, gzipSync(raw), { flag: 'wx' });
  fs.writeFileSync(canonicalSnapshot, gzipSync(canonical), { flag: 'wx' });
  return {
    card, path: relative, rawWorkingSha256: hash(raw), crlfToLfSha256: hash(normalized),
    acceptedGitSha256: hash(canonical), rawWorkingEqualsGitCanonical: raw.equals(canonical),
    workingSnapshot: path.relative(root, workingSnapshot), canonicalSnapshot: path.relative(root, canonicalSnapshot)
  };
});
const manifest = {
  schema: 'C030-source-pins/1', capturedAtUtc: new Date().toISOString(), accepted, gateObservation: gates,
  browserHelperRawSha256: '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055',
  sourceMeaning: 'Fixed immutable accepted C023/C029 and transitive source; raw working bytes and Git canonical bytes are separate.',
  mathematicalControlsAreNotSourceReceipts: true, sourcePinsDoNotAuthorizeNativeClaims: true,
  privatePublisherIsNotPinnedByThisManifest: true, dependencies
};
fs.writeFileSync(path.join(root, 'imports.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(directory, 'gate-observation.json'), JSON.stringify(gates, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ cardId: 'C030', pinnedFiles: dependencies.length, separateRawAndCanonicalSnapshots: dependencies.length * 2,
  capturedAtUtc: manifest.capturedAtUtc, directory: path.relative(repository, directory) }));
