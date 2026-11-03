'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const canonical = (data) => Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'));
const read = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(read(file));
const git = (args) => {
  const run = spawnSync('git', args, { cwd: repo, encoding: null });
  assert.equal(run.status, 0, String(run.stderr));
  assert.equal(run.error, undefined);
  return run.stdout;
};
const row = (text, id) => text.split(/\r?\n/).find((line) => line.startsWith(`| ${id} |`));
const section = (text, begin, end) => {
  const normalized = canonical(Buffer.from(text)).toString();
  return normalized.slice(normalized.indexOf(begin), normalized.indexOf(end, normalized.indexOf(begin)));
};

test('raw working source and canonical immutable Git blobs preserve the exact source acceptance', () => {
  const source = json('evidence\\source-contract.json');
  assert.equal(source.cardId, 'A-S078');
  assert.equal(source.kanoUnit, source.cardId);
  assert.equal(source.kano, 'S');
  assert.equal(source.packet, 'SC-S078');
  assert.equal(source.exactSourceReadBeforeBehaviorDesign, true);
  assert.equal(source.files.length, 3);
  for (const entry of source.files) {
    const raw = read(entry.snapshot);
    const blob = read(entry.gitSnapshot);
    assert.equal(raw.length, entry.rawBytes);
    assert.equal(sha(raw), entry.rawSha256);
    assert.equal(raw.includes(Buffer.from('\r\n')), entry.rawHasCRLF);
    assert.equal(sha(canonical(raw)), entry.rawCanonicalSha256);
    assert.equal(blob.length, entry.gitBytes);
    assert.equal(sha(blob), entry.gitSha256);
    assert.deepEqual(blob, git(['cat-file', 'blob', entry.gitBlob]));
    const objectPath = `${source.baselineCommit}:${entry.path.replace(/\\/g, '/')}`;
    assert.equal(git(['rev-parse', objectPath]).toString().trim(), entry.gitBlob);
    assert.equal(canonical(raw).equals(canonical(blob)), entry.wholeFileCanonicalEquality);
    assert.equal(entry.exactAcceptanceSlicesMatch, true);
    const rawText = raw.toString();
    const gitText = blob.toString();
    if (entry.path === 'README.md') {
      assert.equal(row(rawText, 'S078'), source.sourceRow);
      assert.equal(row(gitText, 'S078'), source.sourceRow);
      assert.equal(section(rawText, '## Acceptance and evidence', '## Recommended demonstration sequence'), source.acceptanceAndEvidence);
      assert.equal(section(gitText, '## Acceptance and evidence', '## Recommended demonstration sequence'), source.acceptanceAndEvidence);
    } else if (entry.path.endsWith('backlog.md')) {
      assert.equal(row(rawText, 'D-S078'), source.backlogRow);
      assert.equal(row(gitText, 'D-S078'), source.backlogRow);
    } else {
      for (const [id, expected] of [['A-S078', source.cardRow], ['B-S078', source.nativeRow]]) {
        assert.equal(row(rawText, id), expected);
        assert.equal(row(gitText, id), expected);
      }
      assert.equal(section(rawText, '## Atomic card contract', '## Concurrent pull and one-piece flow'), source.atomicAndPortableContract);
      assert.equal(section(gitText, '## Atomic card contract', '## Concurrent pull and one-piece flow'), source.atomicAndPortableContract);
      assert.ok(rawText.includes(source.packetRule));
      assert.ok(gitText.includes(source.packetRule));
      assert.match(source.packetRule, /every other A\/B card belongs to SC-Snnn/);
    }
  }
  assert.equal(source.sourceRow, '| S078 | **Duplicate schedulers across deployments:** Use suitable ownership leases and fencing to prevent duplicate scheduled work. |');
  assert.equal(source.backlogRow, '| D-S078 | P1 | Add simultaneous v1/v2 schedulers and ownership-lease/fencing comparison. | Only the valid owner performs each scheduled effect; duplicate scheduling is detected. | none |');
  assert.equal(source.cardRow, '| A-S078 | D-S078 | S | Start two schedulers; use lease/fencing evidence to identify the valid executor. | SOURCE |');
  assert.match(source.boundary, /B-S078 and D-S078 remain incomplete/);
});

test('RED retains a loadable no-op stub and actual assertion failures, not missing code or tools', () => {
  const red = json('evidence\\red.json');
  assert.equal(red.exitCode, 1);
  assert.equal(red.tests, 13);
  assert.equal(red.passed, 2);
  assert.equal(red.failed, 11);
  assert.equal(red.assertionFailures, 11);
  assert.equal(red.missingCodeOrTools, false);
  assert.equal(red.spawnError, null);
  assert.equal(red.signal, null);
  const stdout = read(red.stdoutPath);
  assert.equal(sha(stdout), red.rawStdoutSha256);
  assert.equal(sha(read(red.stderrPath)), red.rawStderrSha256);
  assert.equal((stdout.toString().match(/code: 'ERR_ASSERTION'/g) || []).length, 11);
  assert.doesNotMatch(stdout.toString(), /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError|TypeError:/);
  for (const snapshot of red.snapshots) {
    const data = read(snapshot.snapshot);
    assert.equal(data.length, snapshot.bytes);
    assert.equal(sha(data), snapshot.sha256);
    assert.ok(snapshot.snapshot.endsWith('.snapshot'));
    if (snapshot.source !== 'model.js') assert.deepEqual(canonical(data), canonical(read(snapshot.source)));
  }
  const stubFile = red.snapshots.find((entry) => entry.source === 'model.js');
  const context = { module: { exports: {} } };
  vm.runInNewContext(read(stubFile.snapshot).toString(), context, { timeout: 1000 });
  const stub = context.module.exports;
  assert.equal(typeof stub.execute, 'function');
  assert.equal(stub.start(stub.createState(), { protection: 'fenced', receipt: 'observed' }).schedulers.length, 0);
  assert.equal(stub.execute(stub.createState()).verdict, 'NOT_EVALUATED');
});

test('BDD/RED precede explicit IaC N/A and raw evidence has narrowly scoped binary attributes', () => {
  const red = json('evidence\\red.json');
  const source = json('evidence\\source-contract.json');
  const iac = json('evidence\\iac-decision.json');
  assert.ok(Date.parse(source.capturedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(red.completedAtUtc) <= Date.parse(iac.decidedAtUtc));
  assert.equal(iac.afterRedCompletedAtUtc, red.completedAtUtc);
  assert.equal(iac.stage, 'after behavioral RED; before implementation');
  assert.equal(iac.status, 'N/A');
  for (const field of ['resourcesCreated', 'managementCalls', 'generatedInfrastructureFiles']) assert.equal(iac[field], 0);
  assert.equal(read('.gitattributes').toString().replace(/\r\n/g, '\n'), '* text=auto eol=lf\nevidence/raw/** -text\n');
});
