'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const canonical = (data) => Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'));
const read = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(read(file));
const git = (args, input) => spawnSync('git', args, { cwd: repo, input, encoding: null });
const files = (directory = root) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? files(path.join(directory, entry.name))
    : [path.relative(root, path.join(directory, entry.name))]).sort();

test('sealed owned files preserve raw evidence and qualify canonical Git clean-filter identities', () => {
  const index = json('evidence\\content-index.json');
  assert.equal(index.cardId, 'A-S078');
  assert.deepEqual(files().filter((file) => file !== index.excludedSelf), index.files.map((entry) => entry.file));
  for (const entry of index.files) {
    const raw = read(entry.file);
    const expectedMode = entry.file.startsWith('evidence\\raw\\') ? 'raw' : 'canonical-LF';
    assert.equal(entry.hashMode, expectedMode);
    const data = expectedMode === 'raw' ? raw : canonical(raw);
    assert.equal(data.length, entry.bytes, entry.file);
    assert.equal(sha(data), entry.sha256, entry.file);
    const relative = `learning/S078/${entry.file.replace(/\\/g, '/')}`;
    const clean = git(['hash-object', `--path=${relative}`, '--stdin'], raw);
    assert.equal(clean.status, 0, String(clean.stderr));
    assert.equal(clean.stdout.toString().trim(), entry.expectedGitBlobSha1, `${entry.file}: clean-filter identity`);
  }
});

test('committed owned blobs match the sealed identities after publication', (context) => {
  const present = git(['cat-file', '-e', 'HEAD:learning/S078/manifest.json']);
  if (present.status !== 0) {
    context.skip('Pre-publication clean-filter qualification only; mandatory committed-blob rerun follows publication.');
    return;
  }
  const index = json('evidence\\content-index.json');
  for (const entry of index.files) {
    const relative = `learning/S078/${entry.file.replace(/\\/g, '/')}`;
    const identity = git(['rev-parse', `HEAD:${relative}`]);
    assert.equal(identity.status, 0, String(identity.stderr));
    assert.equal(identity.stdout.toString().trim(), entry.expectedGitBlobSha1, relative);
    const blob = git(['cat-file', 'blob', entry.expectedGitBlobSha1]);
    assert.equal(blob.status, 0);
    assert.equal(sha(blob.stdout), entry.sha256, relative);
  }
  assert.deepEqual(canonical(git(['show', 'HEAD:learning/S078/evidence/content-index.json']).stdout),
    canonical(read('evidence\\content-index.json')));
});

test('historical green, syntax and browser proof are bound to the current canonical code', () => {
  for (const file of ['evidence\\focused-green.json', 'evidence\\browser-green.json']) {
    const proof = json(file);
    assert.equal(proof.exitCode, 0);
    assert.equal(proof.failed, 0);
    assert.equal(proof.spawnError, null);
    assert.equal(proof.signal, null);
    assert.equal(sha(read(proof.stdoutPath)), proof.rawStdoutSha256);
    assert.equal(sha(read(proof.stderrPath)), proof.rawStderrSha256);
    for (const [source, expected] of Object.entries(proof.sourceHashes)) assert.equal(sha(canonical(read(source))), expected, source);
  }
  const syntax = json('evidence\\syntax.json');
  assert.equal(syntax.outcome, 'PASS');
  for (const check of syntax.checks) {
    assert.equal(check.exitCode, 0);
    assert.equal(check.spawnError, null);
    assert.equal(sha(canonical(read(check.file))), check.sourceCanonicalSha256);
  }
  const browser = json('evidence\\browser-acceptance.json');
  assert.equal(browser.outcome, 'PASS');
  assert.equal(browser.captureExplicitlyEnabled, true);
  assert.equal(browser.cleanup.awaitedFinallyClose, true);
  assert.equal(browser.cleanup.error, undefined);
  assert.deepEqual(browser.pageErrors, []);
  assert.deepEqual(browser.exerciseNetworkRequests, []);
  assert.deepEqual(browser.probeNetworkRequests, []);
  assert.equal(browser.helper.sha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(browser.runtime, 'v22.23.4');
  assert.equal(browser.playwrightVersion, '1.56.1');
  assert.equal(browser.browserVersion, '156.0.4314.50');
  for (const [source, expected] of Object.entries(browser.sourceHashes)) assert.equal(sha(canonical(read(source))), expected, source);
  assert.deepEqual(browser.retainedFourConfigurationLedgers.map((entry) => entry.verdict), ['PASS', 'FAIL', 'UNKNOWN', 'FAIL']);
  assert.equal(browser.csp.inlineExecuted, false);
  assert.equal(browser.csp.connectDenied, true);
});
