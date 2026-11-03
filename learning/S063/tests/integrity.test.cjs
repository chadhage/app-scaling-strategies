'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const folder = path.resolve(__dirname, '..');
const repo = path.resolve(folder, '..', '..');
const evidence = path.join(folder, 'evidence');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(evidence, file), 'utf8'));
function active() {
  const pointer = readJson('integrity.json');
  assert.match(pointer.active, /^integrity-\d{3}\.json$/);
  const raw = fs.readFileSync(path.join(evidence, pointer.active));
  assert.equal(hash(raw), pointer.sha256);
  const index = JSON.parse(raw.toString('utf8'));
  assert.equal(index.cardId, 'A-S063');
  assert.equal(index.kanoUnit, 'A-S063');
  assert.deepEqual(index.exclusions, ['evidence\\integrity.json', `evidence\\${pointer.active}`]);
  return { pointer, index };
}
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    assert.equal(entry.isSymbolicLink(), false);
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [path.relative(folder, file)];
  });
}

test('active integrity index covers every owned file except its explicit pointer/self-reference', () => {
  const { index } = active();
  const actual = walk(folder).filter((file) => !index.exclusions.includes(file)).sort();
  assert.deepEqual(index.files.map((file) => file.path).sort(), actual);
  assert.ok(index.files.length >= 35);
});

test('raw proof bytes and canonical source bytes match real Git filters and unchanged indexed blobs', () => {
  const { index } = active();
  const tracked = new Map(execFileSync('git', ['ls-files', '--stage', '--', 'learning\\S063'], {
    cwd: repo, encoding: 'utf8',
  }).split(/\r?\n/).filter(Boolean).map((line) => {
    const match = line.match(/^\d+ ([a-f0-9]{40}) 0\t(.+)$/);
    assert.ok(match, line);
    return [match[2].replace(/\//g, path.sep), match[1]];
  }));
  const pending = new Set(execFileSync('git', ['diff', '--name-only', '--', 'learning\\S063'], {
    cwd: repo, encoding: 'utf8',
  }).split(/\r?\n/).filter(Boolean).map((file) => file.replace(/\//g, path.sep)));
  for (const entry of index.files) {
    assert.equal(path.isAbsolute(entry.path), false);
    const file = path.resolve(folder, entry.path);
    assert.ok(file.startsWith(`${folder}${path.sep}`), entry.path);
    const raw = fs.readFileSync(file);
    const proof = entry.path.startsWith(`evidence${path.sep}raw${path.sep}`);
    assert.equal(entry.mode, proof ? 'raw-proof-bytes' : 'canonical-lf-git-source');
    const bytes = proof ? raw : Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'));
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(hash(bytes), entry.sha256, entry.path);
    const gitPath = path.relative(repo, file);
    const gitHash = execFileSync('git', ['hash-object', `--path=${path.basename(file)}`, file], {
      cwd: path.dirname(file), encoding: 'utf8',
    }).trim();
    assert.equal(gitHash, entry.gitBlobSha1, `${entry.path}: actual Git-filtered content`);
    if (tracked.has(gitPath) && !pending.has(gitPath)) {
      assert.equal(tracked.get(gitPath), gitHash, `${entry.path}: unchanged indexed blob`);
    }
  }
});

test('raw execution streams retain actual exits, lengths and hashes; the diagnosed qualifier failure is explicit', () => {
  const receipts = fs.readdirSync(path.join(evidence, 'raw'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(evidence, 'raw', entry.name, 'run.json')));
  assert.ok(receipts.length >= 4);
  for (const { name } of receipts) {
    const receipt = readJson(path.join('raw', name, 'run.json'));
    assert.equal(receipt.cardId, 'A-S063');
    assert.equal(receipt.workerId, 'worker-A-S063');
    assert.equal(receipt.node, 'v22.23.4');
    assert.equal(receipt.processError, null);
    if (name === 'integrity-003') {
      assert.equal(receipt.expectedExitCode, 0);
      assert.equal(receipt.exitCode, 1);
      const diagnostic = readJson(path.join('raw', name, 'path-filter-diagnostic.json'));
      assert.equal(diagnostic.previousProbe.sha1, diagnostic.canonicalGitBlobSha1);
      assert.equal(diagnostic.correctProbe.sha1, diagnostic.rawGitBlobSha1);
      assert.notEqual(diagnostic.rawGitBlobSha1, diagnostic.canonicalGitBlobSha1);
      assert.ok(diagnostic.indexed.includes(diagnostic.rawGitBlobSha1));
      assert.match(diagnostic.diagnosis, /earlier qualifier used the wrong attribute lookup/);
    } else {
      assert.equal(receipt.exitCode, receipt.expectedExitCode, name);
    }
    assert.equal(receipt.signal, null);
    if (name === 'publication-check-001') {
      assert.equal(receipt.command[0], 'git');
      assert.equal(receipt.expectedExitCode, 2);
      assert.match(receipt.diagnosis, /raw CRLF/);
    } else {
      assert.equal(receipt.command[0].toLowerCase().endsWith('node.exe'), true);
    }
    for (const stream of [receipt.stdout, receipt.stderr]) {
      const raw = fs.readFileSync(path.join(evidence, 'raw', name, stream.file));
      assert.equal(raw.length, stream.bytes);
      assert.equal(hash(raw), stream.sha256);
    }
  }
});

test('retained actual browser evidence qualifies the current canonical sources, raw screenshot, CSP and cleanup', () => {
  const observed = readJson(path.join('raw', 'browser-004', 'observations.json'));
  const receipt = readJson(path.join('raw', 'browser-004', 'run.json'));
  const tooling = readJson(path.join('raw', 'tooling', 'identity.json'));
  assert.equal(receipt.exitCode, 0);
  assert.equal(receipt.browserCaptureAuthorized, true);
  assert.equal(observed.checks.length, 10);
  assert.equal(observed.node, 'v22.23.4');
  assert.equal(observed.playwrightVersion, '1.56.1');
  assert.match(observed.browserVersion, /^156\./);
  assert.equal(observed.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(observed.helperPublication, '53c0c0d');
  assert.equal(hash(fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'))), observed.helperSha256);
  assert.equal(tooling.edgeSignatureStatus, 'Valid');
  assert.match(tooling.signer, /Microsoft Corporation/);
  assert.match(tooling.edgeVersion, /^156\./);
  assert.equal(tooling.playwrightVersion, observed.playwrightVersion);
  assert.match(observed.cleanup, /Awaited close\(\) in finally/);
  assert.equal(observed.failure, undefined);
  assert.equal(observed.cleanupError, undefined);
  assert.deepEqual(observed.externalRequests, []);
  assert.deepEqual(observed.pageErrors, []);
  assert.equal(observed.csp.inlineRan, false);
  assert.equal(observed.csp.evalRan, false);
  assert.equal(observed.csp.evalBlocked, true);
  assert.equal(observed.csp.connectionBlocked, true);
  for (const [file, expected] of Object.entries(observed.canonicalSourceSha256)) {
    assert.equal(hash(Buffer.from(fs.readFileSync(path.join(folder, file), 'utf8').replace(/\r\n/g, '\n'))), expected, file);
  }
  for (const artifact of observed.artifacts) {
    const raw = fs.readFileSync(path.join(evidence, 'raw', 'browser-004', artifact.file));
    assert.equal(raw.length, artifact.bytes);
    assert.equal(hash(raw), artifact.sha256);
  }
});
