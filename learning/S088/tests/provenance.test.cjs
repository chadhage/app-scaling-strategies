'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', '..', '..');
const lesson = path.resolve(__dirname, '..');
const file = (name) => path.join(lesson, ...name.split('/'));
const read = (name) => fs.readFileSync(file(name));
const json = (name) => JSON.parse(read(name));
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const source = json('evidence/source-contract.json');
const red = json('evidence/red.json');

test('exact source acceptance rows and raw committed/working snapshots have preserved provenance', () => {
  assert.equal(source.cardId, 'A-S088');
  assert.equal(source.kanoUnit, 'A-S088');
  assert.equal(source.kano, 'S');
  assert.equal(source.packet, 'SC-S088');
  assert.equal(source.sources.length, 3);
  assert.match(source.sourceHead, /^[a-f0-9]{40}$/);
  for (const entry of source.sources) {
    for (const snapshot of Object.values(entry.snapshots)) {
      const bytes = read(snapshot.path);
      assert.equal(bytes.length, snapshot.bytes);
      assert.equal(hash(bytes), snapshot.sha256);
      assert.ok(bytes.toString('utf8').split(/\r?\n/).some((line) => line.trim() === entry.exactRow));
    }
    const result = spawnSync('git', ['show', `${source.sourceHead}:${entry.repoPath}`], { cwd: root, encoding: null, windowsHide: true });
    assert.equal(result.status, 0, String(result.stderr));
    assert.deepEqual(result.stdout, read(entry.snapshots.git.path));
  }
  assert.ok(read(source.sources[0].snapshots.working.path).includes(Buffer.from('\r\n')));
  assert.notEqual(source.sources[0].snapshots.git.sha256, source.sources[0].snapshots.working.sha256);
});

test('the RED was actual assertion failure, not a missing module, tool, or syntax failure', () => {
  assert.equal(red.verified, true);
  assert.equal(red.commands[0].status, 1);
  assert.equal(red.commands[0].error, null);
  assert.equal(red.commands[0].signal, null);
  for (const stream of Object.values(red.streams)) {
    const bytes = read(stream.path);
    assert.equal(hash(bytes), stream.sha256);
    assert.equal(bytes.length, stream.bytes);
  }
  const stdout = read(red.streams['stdout.tap.raw'].path).toString('utf8');
  const stderr = read(red.streams['stderr.raw'].path).toString('utf8');
  assert.match(stdout, /code: 'ERR_ASSERTION'/);
  assert.match(stdout, /a real modeled attempt must be recorded/);
  assert.match(stdout, /# tests 11/);
  assert.match(stdout, /# pass 1/);
  assert.match(stdout, /# fail 10/);
  assert.doesNotMatch(stdout + stderr, /MODULE_NOT_FOUND|SyntaxError|ERR_MODULE_NOT_FOUND|ENOENT/);
});

test('RED stub/test/BDD snapshots are intact, loadable and not auto-discovered test filenames', () => {
  for (const snapshot of red.snapshots) {
    assert.ok(snapshot.path.endsWith('.snapshot'));
    assert.equal(hash(read(snapshot.path)), snapshot.sha256);
    assert.equal(read(snapshot.path).length, snapshot.bytes);
  }
  const context = { module: { exports: {} } };
  vm.runInNewContext(read('evidence/raw/red/model.js.snapshot').toString('utf8'), context, { timeout: 1000 });
  const stub = context.module.exports;
  assert.equal(typeof stub.attempt, 'function');
  assert.equal(stub.createState().history.length, 0);
  assert.throws(() => assert.equal(stub.attempt(stub.createState(), { decision: 'denied', response: 'explicit' }).history.length, 1), { code: 'ERR_ASSERTION' });
  assert.equal(
    read('evidence/raw/red/behavior.test.cjs.snapshot').toString('utf8').replace(/\r\n/g, '\n'),
    read('tests/behavior.test.cjs').toString('utf8').replace(/\r\n/g, '\n'),
  );
  assert.equal(
    read('evidence/raw/red/permission-failure.feature.snapshot').toString('utf8').replace(/\r\n/g, '\n'),
    read('permission-failure.feature').toString('utf8').replace(/\r\n/g, '\n'),
  );
});

test('resource-free IaC N/A was decided after RED and before implementation verification', () => {
  const iac = json('evidence/iac-decision.json');
  assert.equal(iac.decision, 'N/A');
  assert.equal(iac.redRawSha256, red.streams['stdout.tap.raw'].sha256);
  assert.ok(Date.parse(source.capturedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(red.finishedAtUtc) < Date.parse(iac.decidedAtUtc));
  assert.match(iac.reason, /fixed fictional teaching data/);
  assert.ok(iac.prohibited.includes('Azure or identity operations'));
});

test('owned attributes preserve raw bytes separately from canonical Git LF source', () => {
  const attributes = read('.gitattributes').toString('utf8');
  assert.match(attributes, /^\* text=auto eol=lf/m);
  assert.match(attributes, /^evidence\/raw\/\*\* -text/m);
});
