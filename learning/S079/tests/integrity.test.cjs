'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const seal = require('../tools/seal.cjs');
const lesson = path.resolve(__dirname, '..');
const repo = path.resolve(lesson, '..', '..');
const read = (relative) => fs.readFileSync(path.join(lesson, relative));
const json = (relative) => JSON.parse(read(relative));
function git(args) {
  const run = spawnSync('git', args, { cwd: repo, windowsHide: true });
  assert.equal(run.status, 0, run.stderr.toString());
  return run.stdout;
}

test('sealed owned content matches canonical hashes and actual Git clean-filter bytes', () => {
  const index = json(path.join('evidence', 'content-index.json'));
  assert.equal(index.cardId, 'A-S079');
  assert.deepEqual(seal.build(), index.entries);
  for (const entry of index.entries) {
    const raw = read(entry.path);
    const bytes = seal.canonical(path.join(lesson, entry.path), raw);
    const expectedBlob = crypto.createHash('sha1')
      .update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
    assert.equal(entry.gitBlob, expectedBlob, `Git clean bytes differ: ${entry.path}`);
    if (entry.mode === 'raw-bytes') {
      const attributes = git(['check-attr', 'text', '--', path.join('learning', 'S079', entry.path)]).toString();
      assert.match(attributes, /: text: unset/);
    }
  }
});

test('raw working CRLF and original canonical Git source snapshots are independently preserved', () => {
  const contract = json(path.join('evidence', 'source-contract.json'));
  assert.equal(contract.readBeforeBehaviorDesign, true);
  assert.equal(contract.cardId, 'A-S079');
  assert.equal(contract.packet, 'SC-S079');
  assert.equal(contract.sourceDependency, 'D-S075');
  assert.equal(contract.sourceAcceptance, 'Capacity drains real work within the declared deadline and ordering contract; overdue jobs are failures.');
  for (const source of contract.sources) {
    for (const kind of ['working', 'canonical']) {
      const snapshot = zlib.gunzipSync(read(source[kind].snapshot));
      assert.equal(seal.sha256(snapshot), source[kind].sha256);
      assert.equal(snapshot.length, source[kind].bytes);
      if (kind === 'working') {
        assert.ok(source.working.crlf > 0);
        assert.equal((snapshot.toString().match(/\r\n/g) || []).length, source.working.crlf);
      } else {
        assert.deepEqual(snapshot, git(['show', `${source.commit}:${source.gitPath}`]));
      }
      const normalized = snapshot.toString('utf8').replace(/\r\n/g, '\n');
      for (const slice of source.slices) {
        assert.ok(normalized.includes(slice.text), slice.id);
        assert.equal(seal.sha256(Buffer.from(slice.text)), slice.sha256);
      }
    }
    const currentWorking = fs.readFileSync(path.join(repo, source.path), 'utf8').replace(/\r\n/g, '\n');
    const currentGit = git(['show', `HEAD:${source.gitPath}`]).toString().replace(/\r\n/g, '\n');
    for (const slice of source.slices) {
      assert.ok(currentWorking.includes(slice.text), `Current working acceptance changed: ${slice.id}`);
      assert.ok(currentGit.includes(slice.text), `Current Git acceptance changed: ${slice.id}`);
    }
  }
});

test('actual assertion RED, non-discovered stub snapshots and IaC ordering remain genuine', () => {
  const prefix = path.join('evidence', 'raw', 'red');
  const run = json(path.join(prefix, 'run.json'));
  const stdout = read(path.join(prefix, 'stdout.txt'));
  const stderr = read(path.join(prefix, 'stderr.txt'));
  assert.equal(run.exitCode, 1);
  assert.equal(seal.sha256(stdout), run.stdoutSha256);
  assert.equal(seal.sha256(stderr), run.stderrSha256);
  const text = stdout.toString();
  assert.match(text, /expected: 'burst'[\s\S]*?actual: 'idle'/);
  assert.equal((text.match(/code: 'ERR_ASSERTION'/g) || []).length, 10);
  assert.match(text, /# tests 11/);
  assert.match(text, /# pass 1/);
  assert.match(text, /# fail 10/);
  assert.doesNotMatch(text, /MODULE_NOT_FOUND|SyntaxError|ERR_MODULE_NOT_FOUND|TypeError:/);
  for (const name of ['model.js.snapshot', 'model.test.cjs.snapshot', 'backlog-surge.feature.snapshot', '.gitattributes.snapshot']) {
    assert.ok(fs.statSync(path.join(lesson, prefix, name)).isFile());
  }
  const iac = json(path.join('evidence', 'iac-na.json'));
  const firstGreen = json(path.join('evidence', 'captures', 'model-green', 'run.json'));
  assert.equal(iac.status, 'N/A');
  assert.ok(run.finishedAtUtc < iac.recordedAtUtc);
  assert.ok(iac.recordedAtUtc < firstGreen.startedAtUtc);
  assert.equal(firstGreen.exitCode, 0);
});

test('browser helper and append-only capture policy are the authorized published versions', () => {
  const helper = fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'));
  assert.equal(seal.sha256(helper), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  const browser = read(path.join('tests', 'browser.test.cjs')).toString();
  assert.match(browser, /openIsolatedLesson/);
  assert.match(browser, /finally\s*\{[\s\S]*?await session\.close\(\)/);
  assert.match(browser, /CAPTURE_BROWSER_EVIDENCE === '1'/);
  const capture = read(path.join('tools', 'capture.cjs')).toString();
  assert.match(capture, /flag: 'wx'/);
  assert.match(capture, /CAPTURE_BROWSER_EVIDENCE !== '1'/);
  assert.doesNotMatch(browser, /launchPersistentContext|chromium\.launch|--no-sandbox|bypassCSP:\s*true/);
});

test('all deliberate capture outputs retain their original raw hashes and honest status', () => {
  const captures = path.join(lesson, 'evidence', 'captures');
  for (const directory of fs.readdirSync(captures, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const root = path.join(captures, directory.name);
    if (!fs.existsSync(path.join(root, 'run.json'))) continue;
    const run = JSON.parse(fs.readFileSync(path.join(root, 'run.json')));
    const stdout = fs.readFileSync(path.join(root, 'stdout.txt'));
    const stderr = fs.readFileSync(path.join(root, 'stderr.txt'));
    assert.equal(seal.sha256(stdout), run.stdoutSha256, directory.name);
    assert.equal(seal.sha256(stderr), run.stderrSha256, directory.name);
    assert.ok([0, 1].includes(run.exitCode));
    if (run.exitCode === 0) assert.match(stdout.toString(), /# fail 0/);
    else assert.match(stdout.toString(), /not ok/);
    if (run.phase === 'normal-green' && run.exitCode === 0) {
      assert.equal(run.readOnlyVerification, true);
      assert.equal(run.beforeTreeSha256, run.afterTreeSha256);
      assert.ok(run.verifiedFileCount > 0);
    }
    if (run.phase === 'browser-green' && run.exitCode === 0) {
      const proof = JSON.parse(fs.readFileSync(path.join(root, 'browser-proof.json')));
      assert.equal(proof.checks.length, 8);
      assert.equal(proof.awaitedFinallyCloseResolved, true);
      assert.equal(proof.sourceAndProofUnchangedByChecks, true);
      assert.equal(proof.screenshotSha256, seal.sha256(fs.readFileSync(path.join(root, 'faster-but-reordered.png'))));
      assert.equal(proof.failureDomSha256, seal.sha256(fs.readFileSync(path.join(root, 'failure-dom.txt'))));
    }
  }
});
