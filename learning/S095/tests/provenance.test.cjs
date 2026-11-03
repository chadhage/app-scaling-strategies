'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const lesson = path.resolve(__dirname, '..');
const root = path.resolve(lesson, '..', '..');
const read = (file) => fs.readFileSync(path.join(lesson, file));
const json = (file) => JSON.parse(read(file));
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
function git(args) {
  const result = spawnSync('git', ['--no-pager', ...args], { cwd: root, encoding: null, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr.toString('utf8'));
  return result.stdout;
}
function raw(record) {
  const bytes = read(record.path);
  assert.equal(bytes.length, record.bytes);
  assert.equal(sha(bytes), record.sha256);
  return bytes;
}

test('unaltered raw working CRLF and canonical Git source preserve exact S095, D-S095, prerequisite and A/card/packet contracts', () => {
  const source = json('evidence\\source-contract.json');
  assert.equal(source.cardId, 'A-S095');
  assert.equal(source.parentId, 'D-S095');
  assert.equal(source.packet, 'SC-S095');
  assert.equal(source.kanoUnit, 'A-S095');
  assert.equal(source.originalDependency, 'D-S022');
  assert.equal(source.sourceAcceptance, 'Remove it from new admission and retain a usable compatible destination.');
  assert.equal(source.registeredCardProjection.owner, 'worker-A-S095');
  assert.equal(source.registeredCardProjection.authorization, 'local-synthetic-only');
  assert.match(source.sourceHead, /^[a-f0-9]{40}$/);
  for (const document of source.sources) {
    for (const format of ['git', 'working']) {
      const record = document.snapshots[format];
      const bytes = zlib.gunzipSync(raw(record));
      assert.equal(bytes.length, record.rawBytes);
      assert.equal(sha(bytes), record.rawSha256);
      for (const exact of document.exactText) assert.ok(bytes.toString('utf8').split(/\r?\n/).includes(exact), exact);
      if (format === 'git') assert.deepEqual(bytes, git(['show', `${source.sourceHead}:${document.repoPath.replaceAll('\\', '/')}`]));
      else assert.ok(bytes.includes(Buffer.from('\r\n')), 'Capture-time working CRLF must remain raw, not rewritten.');
    }
  }
});

test('BDD, loadable-stub assertion RED and IaC N/A have genuine ordered provenance', () => {
  const source = json('evidence\\source-contract.json');
  const bdd = json('evidence\\bdd.json');
  const red = json('evidence\\red.json');
  const iac = json('evidence\\iac-decision.json');
  const originalFeature = raw(bdd.rawFeature);
  assert.equal(sha(canonical(read('partition.feature'))), bdd.canonicalSha256);
  assert.deepEqual(canonical(read('partition.feature')), canonical(originalFeature));
  assert.equal(red.verified, true);
  assert.equal(red.runs[0].exitCode, 1);
  assert.equal(red.runs[0].error, null);
  assert.equal(red.runs[0].signal, null);
  const stdout = raw(red.runs[0].stdout).toString('utf8');
  raw(red.runs[0].stderr);
  assert.match(stdout, /ERR_ASSERTION/);
  assert.match(stdout, /actual: 'unknown'/);
  assert.match(stdout, /expected: 'success'/);
  assert.doesNotMatch(stdout, /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError/);
  for (const snapshot of red.snapshots) {
    raw(snapshot);
    assert.ok(snapshot.path.endsWith('.snapshot'), 'Historical RED is never auto-discovered executable test code.');
  }
  assert.ok(Date.parse(source.capturedAtUtc) <= Date.parse(bdd.recordedAtUtc));
  assert.ok(Date.parse(bdd.recordedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(red.endedAtUtc) <= Date.parse(iac.decidedAtUtc));
  assert.equal(iac.decision, 'N/A');
  assert.equal(iac.resourcesCreated, 0);
  assert.equal(iac.managementCalls, 0);
  assert.equal(iac.packagesAdded, 0);
  assert.equal(iac.cloudSpend, 0);
  const oldTest = red.snapshots.find((snapshot) => snapshot.original === 'tests\\behavior.test.cjs');
  assert.ok(canonical(read('tests\\behavior.test.cjs')).toString('utf8').startsWith(canonical(raw(oldTest)).toString('utf8')), 'Original failing assertion must remain in the final behavior suite.');
});

test('read-only replay of preserved RED still fails the real assertion against the preserved loadable stub', () => {
  const env = { ...process.env, S095_MODEL: path.join(lesson, 'evidence', 'raw', 'red', 'model.js.snapshot'), CAPTURE_BROWSER_EVIDENCE: '' };
  delete env.NODE_TEST_CONTEXT;
  const replay = spawnSync(process.execPath, [
    '--test', '--test-reporter=tap', path.join(lesson, 'evidence', 'raw', 'red', 'behavior.test.cjs.snapshot'),
  ], { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert.equal(replay.status, 1, `${replay.stdout}\n${replay.stderr}`);
  assert.equal(replay.error, undefined);
  assert.match(replay.stdout, /not ok 1/);
  assert.match(replay.stdout, /ERR_ASSERTION/);
  assert.match(replay.stdout, /actual: 'unknown'/);
  assert.match(replay.stdout, /expected: 'success'/);
  assert.doesNotMatch(`${replay.stdout}\n${replay.stderr}`, /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError/);
});

test('browser tooling provenance pins published helper and signed offline runtime without treating tooling failure as RED', () => {
  const preflight = json('evidence\\preflight.json');
  assert.match(preflight.node, /^v22\./);
  assert.equal(preflight.playwright, '1.56.1');
  assert.match(preflight.edge.version, /^156\./);
  assert.equal(preflight.edge.status, 'Valid');
  assert.ok(preflight.edge.signer.includes('Microsoft Corporation'));
  assert.equal(preflight.signatureExitCode, 0);
  raw(preflight.stdout); raw(preflight.stderr);
  assert.equal(preflight.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(sha(fs.readFileSync(path.join(root, preflight.helperPath))), preflight.helperSha256);
  assert.equal(preflight.publishedHelperCommit, '53c0c0d82cc1db6780a87ac2b1085734af6d5c60');
  const probe = json('evidence\\preflight-probe.json');
  assert.equal(probe.kind, 'Tooling limitation, not behavioral RED');
  assert.equal(probe.initialExitCode, 1);
  assert.match(read(probe.rawStderr).toString('utf8'), /CouldNotAutoloadMatchingModule/);
  assert.equal(json('evidence\\refinement.json').remainder.readiness, false);
});

test('scoped publication whitespace failure is preserved as raw packaging evidence, never behavioral RED', () => {
  const failure = json('evidence\\publication-check-001.json');
  assert.equal(failure.exitCode, 2);
  assert.equal(failure.signal, null);
  assert.equal(failure.error, null);
  for (const [name, record] of Object.entries(failure.records)) {
    const compressed = read(record.path);
    assert.equal(sha(compressed), record.compressedSha256);
    const bytes = zlib.gunzipSync(compressed);
    assert.equal(bytes.length, record.rawBytes);
    assert.equal(sha(bytes), record.rawSha256);
    if (name === 'stdout') assert.match(bytes.toString('utf8'), /evidence\/raw\/bdd\/partition\.feature\.snapshot:1: trailing whitespace/);
  }
  assert.match(read('.gitattributes').toString('utf8'), /evidence\/raw\/\*\* -text -diff/);
});
