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
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (file) => JSON.parse(fs.readFileSync(path.join(evidence, file), 'utf8'));
function active() {
  const pointer = json('content-hashes.json');
  assert.match(pointer.active, /^content-hashes-\d{3}\.json$/);
  const raw = fs.readFileSync(path.join(evidence, pointer.active));
  assert.equal(hash(raw), pointer.sha256);
  const index = JSON.parse(raw.toString('utf8'));
  assert.equal(index.cardId, 'A-S058');
  assert.equal(index.kanoUnit, 'A-S058');
  return { pointer, index };
}
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    assert.equal(entry.isSymbolicLink(), false);
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [path.relative(folder, file)];
  });
}

test('active integrity index covers all owned files except its explicit self-reference', () => {
  const { pointer, index } = active();
  const actual = walk(folder).filter((file) => ![
    path.join('evidence', 'content-hashes.json'), path.join('evidence', pointer.active),
  ].includes(file)).sort();
  assert.deepEqual(index.files.map((entry) => entry.path).sort(), actual);
  assert.ok(index.files.length > 40);
});

test('raw proof and canonical LF source match real Git filters and unchanged indexed blobs', () => {
  const { index } = active();
  const tracked = new Map(
    execFileSync('git', ['ls-files', '--stage', '--', 'learning\\S058'], { cwd: repo, encoding: 'utf8' })
      .split(/\r?\n/).filter(Boolean).map((line) => {
        const match = line.match(/^\d+ ([a-f0-9]{40}) 0\t(.+)$/);
        assert.ok(match, line);
        return [match[2].replace(/\//g, path.sep), match[1]];
      }),
  );
  const pending = new Set(
    execFileSync('git', ['diff', '--name-only', '--', 'learning\\S058'], { cwd: repo, encoding: 'utf8' })
      .split(/\r?\n/).filter(Boolean).map((file) => file.replace(/\//g, path.sep)),
  );
  for (const entry of index.files) {
    assert.equal(path.isAbsolute(entry.path), false);
    const file = path.resolve(folder, entry.path);
    assert.ok(file.startsWith(`${folder}${path.sep}`));
    const raw = fs.readFileSync(file);
    const proof = entry.path.startsWith(`evidence${path.sep}`);
    assert.equal(entry.mode, proof ? 'raw-proof-bytes' : 'canonical-lf-git-source');
    const bytes = proof ? raw : Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'));
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(hash(bytes), entry.sha256, entry.path);
    const gitHash = execFileSync('git', ['hash-object', `--path=${path.basename(file)}`, file], {
      cwd: path.dirname(file), encoding: 'utf8',
    }).trim();
    assert.equal(gitHash, entry.gitBlobSha1, `${entry.path}: actual Git-filtered content`);
    const relative = path.join('learning', 'S058', entry.path);
    if (tracked.has(relative) && !pending.has(relative)) assert.equal(tracked.get(relative), entry.gitBlobSha1, `${entry.path}: unchanged indexed blob`);
  }
});

test('retained actual browser evidence qualifies current sources, raw artifacts, CSP and cleanup', () => {
  const browser = json('browser-001.observations.json');
  const receipt = json('browser-001.json');
  assert.equal(receipt.exitCode, 0);
  assert.equal(receipt.browserCaptureAuthorized, true);
  assert.equal(browser.checks.length, 10);
  assert.equal(browser.node, 'v22.23.4');
  assert.match(browser.browserVersion, /^156\./);
  assert.equal(browser.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(browser.helperPublication, '53c0c0d');
  assert.match(browser.cleanup, /Awaited close\(\) in finally/);
  assert.deepEqual(browser.externalRequests, []);
  assert.deepEqual(browser.pageErrors, []);
  assert.equal(browser.csp.inlineRan, false);
  assert.equal(browser.csp.evalRan, false);
  assert.equal(browser.csp.evalBlocked, true);
  assert.equal(browser.csp.connectionBlocked, true);
  for (const [file, expected] of Object.entries(browser.canonicalSourceSha256)) {
    assert.equal(hash(Buffer.from(fs.readFileSync(path.join(folder, file), 'utf8').replace(/\r\n/g, '\n'))), expected, file);
  }
  for (const artifact of browser.artifacts) {
    const raw = fs.readFileSync(path.join(evidence, artifact.file));
    assert.equal(raw.length, artifact.bytes);
    assert.equal(hash(raw), artifact.sha256);
  }
});

test('all raw execution streams match receipts; diagnostic failure is explicit and corrected', () => {
  let receipts = 0;
  for (const file of fs.readdirSync(evidence).filter((name) => name.endsWith('.json'))) {
    const receipt = json(file);
    if (!Array.isArray(receipt.command) || !receipt.stdout || !receipt.stderr) continue;
    receipts += 1;
    assert.equal(receipt.processError, null, file);
    for (const stream of [receipt.stdout, receipt.stderr]) {
      const raw = fs.readFileSync(path.join(evidence, stream.file));
      assert.equal(raw.length, stream.bytes);
      assert.equal(hash(raw), stream.sha256);
    }
    if (receipt.exitCode !== receipt.expectedExitCode) {
      assert.equal(receipt.label, 'green-core', `Unqualified failure: ${file}`);
      assert.equal(receipt.exitCode, 1);
    }
  }
  assert.ok(receipts >= 12);
  assert.equal(json('green-core-002.json').exitCode, 0);
  assert.equal(json('tooling.json').exitCode, 0);
});
