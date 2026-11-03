'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const folder = path.resolve(__dirname, '..');
const repo = path.resolve(folder, '..', '..');
const evidence = path.join(folder, 'evidence');
const readJSON = (file) => JSON.parse(fs.readFileSync(path.join(evidence, file), 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function active() {
  const pointer = readJSON('content-hashes.json');
  assert.match(pointer.active, /^content-hashes-\d{3}\.json$/);
  const raw = fs.readFileSync(path.join(evidence, pointer.active));
  assert.equal(hash(raw), pointer.sha256);
  const index = JSON.parse(raw.toString('utf8'));
  assert.equal(index.cardId, 'A-S053');
  assert.equal(index.kanoUnit, 'A-S053');
  return { pointer, index };
}
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    assert.equal(entry.isSymbolicLink(), false);
    return entry.isDirectory() ? walk(file) : [path.relative(folder, file)];
  });
}

test('active integrity index covers the entire owned scope except its self-reference', () => {
  const { pointer, index } = active();
  const actual = walk(folder).filter((file) => ![
    path.join('evidence', 'content-hashes.json'), path.join('evidence', pointer.active),
  ].includes(file)).sort();
  assert.deepEqual(index.files.map((entry) => entry.path).sort(), actual);
  assert.ok(index.files.length > 40);
});

test('canonical source and raw proof match Git filters and unchanged indexed blobs', () => {
  const { index } = active();
  const tracked = new Map(
    execFileSync('git', ['ls-files', '--stage', '--', 'learning\\S053'], { cwd: repo, encoding: 'utf8' })
      .split(/\r?\n/).filter(Boolean).map((line) => {
        const match = line.match(/^\d+ ([a-f0-9]{40}) 0\t(.+)$/);
        assert.ok(match, line);
        return [match[2].replace(/\//g, path.sep), match[1]];
      }),
  );
  const pending = new Set(
    execFileSync('git', ['diff', '--name-only', '--', 'learning\\S053'], { cwd: repo, encoding: 'utf8' })
      .split(/\r?\n/).filter(Boolean).map((file) => file.replace(/\//g, path.sep)),
  );
  for (const entry of index.files) {
    assert.equal(path.isAbsolute(entry.path), false);
    const file = path.resolve(folder, entry.path);
    assert.ok(file.startsWith(`${folder}${path.sep}`));
    const raw = fs.readFileSync(file);
    const bytes = entry.mode === 'raw-proof-bytes' ? raw : Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'));
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(hash(bytes), entry.sha256, entry.path);
    const relative = path.join('learning', 'S053', entry.path);
    // Git's --path attribute lookup does not normalize Windows backslashes.
    const gitHash = execFileSync('git', ['hash-object', `--path=${path.basename(file)}`, file], {
      cwd: path.dirname(file), encoding: 'utf8',
    }).trim();
    assert.equal(gitHash, entry.gitBlobSha1, `${entry.path}: actual Git-filtered content`);
    if (tracked.has(relative) && !pending.has(relative)) {
      assert.equal(tracked.get(relative), entry.gitBlobSha1, `${entry.path}: unchanged indexed Git blob`);
    }
  }
});

test('actual browser capture qualifies the current runtime/test sources, artifacts, CSP and cleanup', () => {
  const browser = readJSON('browser-001.observations.json');
  const receipt = readJSON('browser-001.json');
  assert.equal(receipt.exitCode, 0);
  assert.equal(receipt.browserCaptureAuthorized, true);
  assert.equal(browser.checks.length, 10);
  assert.match(browser.browserVersion, /^156\./);
  assert.equal(browser.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.match(browser.cleanup, /Awaited close\(\) in finally/);
  assert.deepEqual(browser.externalRequests, []);
  assert.deepEqual(browser.pageErrors, []);
  assert.equal(browser.csp.evalBlocked, true);
  assert.equal(browser.csp.connectionBlocked, true);
  assert.equal(browser.csp.inlineRan, false);
  for (const [file, expected] of Object.entries(browser.canonicalSourceSha256)) {
    const bytes = Buffer.from(fs.readFileSync(path.join(folder, file), 'utf8').replace(/\r\n/g, '\n'));
    assert.equal(hash(bytes), expected, file);
  }
  for (const artifact of browser.artifacts) {
    const raw = fs.readFileSync(path.join(evidence, artifact.file));
    assert.equal(raw.length, artifact.bytes);
    assert.equal(hash(raw), artifact.sha256);
  }
});

test('all raw execution receipts match streams; diagnostic failures are retained, not relabelled GREEN', () => {
  const allowedDiagnosticFailures = ['tooling', 'green-prebrowser', 'verification-001'];
  let receipts = 0;
  for (const file of fs.readdirSync(evidence).filter((name) => name.endsWith('.json'))) {
    const receipt = readJSON(file);
    if (!Array.isArray(receipt.command) || !receipt.stdout || !receipt.stderr) continue;
    receipts += 1;
    assert.equal(receipt.processError, null, file);
    for (const stream of [receipt.stdout, receipt.stderr]) {
      const raw = fs.readFileSync(path.join(evidence, stream.file));
      assert.equal(raw.length, stream.bytes, stream.file);
      assert.equal(hash(raw), stream.sha256, stream.file);
    }
    if (receipt.exitCode !== receipt.expectedExitCode) {
      assert.ok(allowedDiagnosticFailures.includes(receipt.label), `Unqualified failure: ${file}`);
      assert.equal(receipt.exitCode, 1);
    }
  }
  assert.ok(receipts >= 10);
  const qualified = readJSON('tooling-002.json');
  assert.equal(qualified.exitCode, 0);
  assert.equal(qualified.expectedExitCode, 0);
});
