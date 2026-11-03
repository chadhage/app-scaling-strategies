'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(read(file).toString('utf8'));
const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const contract = json('evidence/source-contract.json');

test('raw working source preserves CRLF and matches immutable canonical Git-source blobs', () => {
  assert.equal(contract.sourceId, 'S083');
  assert.equal(contract.registeredCard.id, 'A-S083');
  assert.equal(contract.registeredCard.packet, 'SC-S083');
  assert.equal(contract.registeredCard.kano, 'S');
  assert.equal(contract.registeredCard.deliver, 'Restart a controller trace; identify duplicate destructive work after unsafe resumption.');
  for (const source of contract.sources) {
    const working = read(source.working.file);
    const canonical = read(source.canonicalGit.file);
    assert.equal(hash(working), source.working.sha256);
    assert.equal(hash(canonical), source.canonicalGit.sha256);
    assert.equal(working.length, source.working.bytes);
    assert.equal(canonical.length, source.canonicalGit.bytes);
    assert.equal((working.toString('utf8').match(/\r\n/g) || []).length, source.working.crlf);
    assert.ok(source.working.crlf > 0, 'raw CRLF source must not be silently normalized');
    assert.equal(working.toString('utf8').replace(/\r\n/g, '\n'), canonical.toString('utf8'));
    assert.equal(source.workingMatchesGitAfterCRLFNormalization, true);
    assert.equal(hash(Buffer.concat([Buffer.from(`blob ${canonical.length}\0`), canonical]), 'sha1'), source.gitBlob);
    const git = spawnSync('git', ['--no-pager', 'show', `${source.sourceCommit}:${source.sourcePath}`], { cwd: repo, encoding: null, windowsHide: true });
    assert.ifError(git.error);
    assert.equal(git.status, 0);
    assert.deepEqual(git.stdout, canonical);
  }
  const attributes = read('.gitattributes').toString('utf8');
  assert.equal(attributes.replace(/\r\n/g, '\n'), 'evidence/raw/source/** -text -diff\nevidence/raw/red/** -text -diff\nevidence/raw/runs/** -text -diff\n');
});

test('exact README acceptance, D parent, portable card and default packet were read and preserved', () => {
  const text = Object.fromEntries(contract.sources.map((source) => [source.sourcePath, read(source.canonicalGit.file).toString('utf8')]));
  assert.ok(text['README.md'].includes(contract.exact.readme));
  assert.ok(text['.docs/wiki/backlog.md'].includes(contract.exact.backlog));
  assert.ok(text['.docs/wiki/kanban.md'].includes(contract.exact.card));
  for (const key of ['portableHeading', 'portable', 'packet', 'banner']) assert.ok(text['.docs/wiki/kanban.md'].includes(contract.exact[key]));
  assert.match(contract.exact.backlog, /\| D-S081 \|$/);
  assert.match(contract.interpretation, /No actual controller restart/);
  assert.match(contract.acceptanceOwner, /Parent controller only/);
});

test('RED is genuine assertion output from a loadable naive stub, not missing code or tools', () => {
  const red = json('evidence/red.json');
  assert.equal(red.exitCode, 1);
  assert.equal(red.signal, null);
  const stdout = read(red.stdout.file);
  const stderr = read(red.stderr.file);
  assert.equal(hash(stdout), red.stdout.sha256);
  assert.equal(hash(stderr), red.stderr.sha256);
  assert.equal(stdout.length, red.stdout.bytes);
  assert.equal(stderr.length, red.stderr.bytes);
  const text = Buffer.concat([stdout, stderr]).toString('utf8');
  assert.match(text, /code: 'ERR_ASSERTION'/);
  assert.match(text, /2 !== 1/);
  assert.match(text, /# tests 13/);
  assert.match(text, /# fail 12/);
  assert.doesNotMatch(text, /MODULE_NOT_FOUND|SyntaxError|not recognized|ENOENT/);
  for (const input of red.capturedInputs) {
    assert.ok(input.snapshot.endsWith('.snapshot'), 'RED snapshots must not be auto-discovered tests');
    const snapshot = read(input.snapshot);
    assert.equal(hash(snapshot), input.sha256);
    if (input.file !== 'model.js') {
      assert.equal(snapshot.toString('utf8').replace(/\r\n/g, '\n'), read(input.file).toString('utf8').replace(/\r\n/g, '\n'));
    }
  }
  const stubFile = red.capturedInputs.find((input) => input.file === 'model.js').snapshot;
  const context = { module: { exports: {} } };
  vm.runInNewContext(read(stubFile).toString('utf8'), context, { filename: stubFile, timeout: 1000 });
  const stub = context.module.exports.createLesson();
  stub.stage({ policy: 'reconcile', evidence: 'complete' });
  assert.equal(stub.restart().result.metrics.destructiveExecutions, 2);
  assert.notEqual(hash(read('model.js')), hash(read(stubFile)));
  assert.ok(Date.parse(contract.capturedAtUtc) <= Date.parse(red.startedAtUtc));
});

test('IaC decision follows qualified RED and explicitly excludes resource operations', () => {
  const iac = json('evidence/iac-decision.json');
  const red = json('evidence/red.json');
  assert.equal(iac.cardId, 'A-S083');
  assert.equal(iac.decision, 'N/A');
  assert.equal(iac.recordedAfter, 'evidence/red.json');
  assert.equal(iac.redFinishedAtUtc, red.finishedAtUtc);
  assert.match(iac.reason, /data records only/);
  assert.match(iac.authorization, /local-synthetic-only/);
});
