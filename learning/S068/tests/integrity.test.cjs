'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(read(file));
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const canonical = (data) => Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'));
const row = (text, id) => text.split(/\r?\n/).find((line) => line.startsWith(`| ${id} |`));
const atomic = (text) => text.slice(text.indexOf('## Atomic card contract'),
  text.indexOf('## Concurrent pull and one-piece flow')).replace(/\r\n/g, '\n');
const packet = (text) => text.split(/\r?\n/).find((line) => line.startsWith('Packet membership is fixed'));
const git = (args) => {
  const result = spawnSync('git', args, { cwd: repo, encoding: null });
  assert.equal(result.status, 0, String(result.stderr));
  return result.stdout;
};

test('exact source acceptance, portable/atomic contract and default SC-S068 packet were captured', () => {
  const source = json('evidence\\source-contract.json');
  assert.equal(source.sourceReadBeforeBehaviorDesign, true);
  assert.equal(source.sourceRow, '| S068 | **Index creation under load:** Use supported online operations or reject changes whose locking behavior violates user budgets. |');
  assert.equal(source.backlogRow, '| D-S068 | P1 | Add supported online index creation and a deliberately blocking-operation comparison. | Locking, latency, and native capability are observed; unsupported online operations are rejected or labeled. | none |');
  assert.equal(source.cardRow, '| A-S068 | D-S068 | S | Build an index under load; compare permitted online behavior with blocking locks. | SOURCE |');
  assert.equal(source.nativeRow, '| B-S068 | D-S068 | S | Conduct one supported index experiment; verify native locks, latency, and explicit capability limits. | CORE, DATA, HOST |');
  assert.equal(source.kanoUnit, 'A-S068');
  assert.equal(source.kano, 'S');
  assert.equal(source.packet, 'SC-S068');
  const raw = read(source.files[2].snapshot).toString('utf8');
  assert.equal(source.atomicAndPortableContract.replace(/\r\n/g, '\n'), atomic(raw));
  assert.match(source.atomicAndPortableContract, /A worker cannot award its own Done credit/);
  assert.match(source.atomicAndPortableContract, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.equal(source.packetRule, packet(raw));
  assert.match(source.packetRule, /every other A\/B card belongs to SC-Snnn/);
  assert.match(source.acceptanceBoundary, /B-S068 and D-S068 remain incomplete/);
});

test('raw CRLF provenance stays byte-exact and canonical source is qualified against immutable Git blobs', () => {
  const source = json('evidence\\source-contract.json');
  for (const [index, item] of source.files.entries()) {
    const raw = read(item.snapshot);
    const committed = read(item.gitSnapshot);
    assert.equal(raw.length, item.rawBytes);
    assert.equal(sha(raw), item.rawSha256);
    assert.equal(raw.includes(Buffer.from('\r\n')), item.rawHasCRLF);
    assert.equal(item.rawHasCRLF, true);
    assert.equal(sha(canonical(raw)), item.rawCanonicalSha256);
    assert.equal(committed.length, item.canonicalGitBytes);
    assert.equal(sha(committed), item.canonicalGitSha256);
    assert.equal(committed.includes(Buffer.from('\r\n')), false);
    assert.equal(canonical(raw).equals(canonical(committed)), item.wholeFileCanonicalEquality);
    const object = `${source.baselineCommit}:${item.path.replace(/\\/g, '/')}`;
    assert.equal(git(['rev-parse', object]).toString().trim(), item.gitBlob);
    assert.deepEqual(git(['cat-file', 'blob', item.gitBlob]), committed);
    const a = raw.toString('utf8');
    const b = committed.toString('utf8');
    if (index < 2) {
      const id = index === 0 ? 'S068' : 'D-S068';
      assert.equal(row(a, id), row(b, id));
    } else {
      assert.equal(row(a, 'A-S068'), row(b, 'A-S068'));
      assert.equal(row(a, 'B-S068'), row(b, 'B-S068'));
      assert.equal(atomic(a), atomic(b));
      assert.equal(packet(a), packet(b));
    }
    assert.equal(item.exactAcceptanceSlicesMatch, true);
  }
});

test('qualified behavioral RED and non-discovered original snapshots precede IaC N/A and green', () => {
  const red = json('evidence\\red\\run.json');
  const iac = json('evidence\\iac-na.json');
  const green = json('evidence\\model-green\\run.json');
  assert.equal(red.exitCode, 1);
  assert.equal(red.tests, 11);
  assert.equal(red.passed, 1);
  assert.equal(red.failed, 10);
  assert.equal(red.assertionFailures, 10);
  assert.equal(red.missingCodeOrTools, false);
  assert.equal(red.spawnError, null);
  assert.equal(sha(read('evidence\\red\\stdout.raw')), red.rawStdoutSha256);
  assert.equal(sha(read('evidence\\red\\stderr.raw')), red.rawStderrSha256);
  assert.match(read('evidence\\red\\stdout.raw').toString(), /code: 'ERR_ASSERTION'/);
  for (const item of red.snapshots) {
    assert.equal(sha(read(item.snapshot)), item.sha256);
    assert.equal(read(item.snapshot).length, item.bytes);
    assert.ok(item.snapshot.endsWith('.snapshot'));
    assert.ok(!item.snapshot.endsWith('.test.cjs'));
  }
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.beforeImplementation, true);
  assert.ok(Date.parse(red.completedAtUtc) <= Date.parse(iac.recordedAtUtc));
  assert.ok(Date.parse(iac.recordedAtUtc) <= Date.parse(green.startedAtUtc));
  assert.notEqual(red.sourceHashes['model.js'], green.sourceHashes['model.js']);
  assert.equal(red.sourceHashes['tests\\model.test.cjs'], green.sourceHashes['tests\\model.test.cjs']);
});

test('model green binds the current finite fixture, implementation and unchanged original assertions', () => {
  const green = json('evidence\\model-green\\run.json');
  assert.equal(green.exitCode, 0);
  assert.equal(green.tests, 11);
  assert.equal(green.failed, 0);
  assert.equal(green.passed, 11);
  assert.equal(sha(read('evidence\\model-green\\stdout.raw')), green.rawStdoutSha256);
  assert.equal(sha(read('evidence\\model-green\\stderr.raw')), green.rawStderrSha256);
  for (const [file, hash] of Object.entries(green.sourceHashes)) {
    assert.equal(sha(canonical(read(file))), hash, file);
  }
  assert.equal(require('../fixture.js').id, 'S068-four-requests-v1');
});

test('standalone surface uses safe DOM, strict CSP, no management/storage requests and non-shadowing reset', () => {
  const html = read('index.html').toString();
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  for (const directive of ['default-src', 'connect-src', 'frame-src', 'object-src', 'worker-src',
    'base-uri', 'form-action', 'media-src', 'manifest-src']) {
    assert.ok(html.includes(`${directive} 'none'`), directive);
  }
  assert.match(html, /script-src 'self'; style-src 'self'/);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|<script(?! src=)|\son\w+=|name="reset"|id="reset"/i);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]),
    ['fixture.js', 'model.js', 'lesson.js']);
  const script = ['fixture.js', 'model.js', 'lesson.js'].map((file) => read(file)).join('\n');
  assert.doesNotMatch(script, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|localStorage|sessionStorage|indexedDB|fetch\s*\(|XMLHttpRequest|WebSocket|eval\s*\(|new Function/);
  assert.match(read('lesson.js').toString(), /form\.reset\(\)/);
  assert.match(read('lesson.js').toString(), /Configuration changed after assessment/);
});

test('actual isolated browser proof and offline signed tooling are explicitly bounded and preserved', () => {
  const tooling = json('evidence\\tooling.json');
  const observed = json('evidence\\browser-observation.json');
  const green = json('evidence\\browser-green\\run.json');
  const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
  assert.equal(sha(fs.readFileSync(helper)), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(tooling.helperRawSha256, sha(fs.readFileSync(helper)));
  assert.equal(tooling.playwright, '1.56.1');
  assert.equal(tooling.signatureStatus, 'Valid');
  assert.match(tooling.signerSubject, /Microsoft Corporation/);
  assert.match(tooling.browserFileVersion, /^156\./);
  assert.equal(tooling.installsOrDownloads, false);
  assert.equal(tooling.unsafeFlags, false);
  assert.equal(tooling.productionNode24Certified, false);
  assert.equal(tooling.nativeDatabaseCertified, false);
  assert.equal(tooling.abandonedPrototypeQualified, false);
  assert.equal(observed.outcome, 'passed');
  assert.equal(observed.observations.length, 8);
  assert.match(observed.cleanup, /awaited session.close\(\) in finally/);
  assert.equal(observed.nativeCertification, false);
  assert.deepEqual(observed.pageErrors, []);
  assert.equal(green.exitCode, 0);
  assert.equal(green.failed, 0);
  assert.equal(green.browserCaptureExplicitlyEnabled, true);
  assert.equal(sha(read('evidence\\browser-green\\stdout.raw')), green.rawStdoutSha256);
  assert.equal(sha(read('evidence\\browser-green\\stderr.raw')), green.rawStderrSha256);
  assert.ok(observed.cspViolations.length >= 6);
  const browserTest = read('tests\\browser.test.cjs').toString();
  assert.match(browserTest, /openIsolatedLesson\('learning\\\\S068\\\\index.html'\)/);
  assert.match(browserTest, /finally \{\s*if \(session\) await session\.close\(\);/);
  assert.match(browserTest, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(browserTest, /flag: 'wx'/);
});
