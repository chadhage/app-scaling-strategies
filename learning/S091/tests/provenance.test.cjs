'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', '..', '..');
const lesson = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(lesson, ...name.split('/')));
const parse = (name) => JSON.parse(read(name));
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const contract = parse('evidence/source-contract.json');
const red = parse('evidence/red.json');
const verifyBytes = (record) => {
  const bytes = read(record.path);
  assert.equal(bytes.length, record.bytes, record.path);
  assert.equal(sha(bytes), record.sha256, record.path);
  return bytes;
};

test('exact source working/Git snapshots preserve raw bytes and their pinned source revision', () => {
  assert.match(contract.sourceHead, /^[a-f0-9]{40}$/);
  assert.equal(contract.sources.length, 3);
  for (const source of contract.sources) {
    const gitBytes = verifyBytes(source.snapshots.git);
    const workingBytes = verifyBytes(source.snapshots.working);
    assert.ok(gitBytes.toString('utf8').split(/\r?\n/).includes(source.exactRow));
    assert.ok(workingBytes.toString('utf8').split(/\r?\n/).includes(source.exactRow));
    const result = spawnSync('git', ['show', `${contract.sourceHead}:${source.repoPath}`], {
      cwd: root, encoding: null, windowsHide: true, maxBuffer: 8 * 1024 * 1024,
    });
    assert.equal(result.status, 0, String(result.stderr));
    assert.equal(sha(result.stdout), source.snapshots.git.sha256);
    assert.ok(workingBytes.includes(Buffer.from('\r\n')), 'Raw Windows source CRLF was preserved, not normalized.');
    assert.equal(gitBytes.includes(Buffer.from('\r\n')), false, 'Canonical source Git object uses LF.');
  }
});

test('the exact parent, original prerequisite, portable contract and default packet stay authoritative', () => {
  assert.equal(contract.cardId, 'A-S091');
  assert.equal(contract.parentId, 'D-S091');
  assert.equal(contract.sourceId, 'S091');
  assert.equal(contract.workerId, 'worker-A-S091');
  assert.equal(contract.kano, 'S');
  assert.equal(contract.kanoUnit, 'A-S091');
  assert.equal(contract.packet, 'SC-S091');
  assert.match(contract.originalDependency, /^D-S028:/);
  const readme = read(contract.sources[0].snapshots.git.path).toString('utf8');
  const backlog = read(contract.sources[1].snapshots.git.path).toString('utf8');
  const kanban = read(contract.sources[2].snapshots.git.path).toString('utf8');
  assert.match(readme, /\| S028 \| \*\*Warm-up timeout:\*\* Abort explicitly and leave existing production routing intact\./);
  assert.match(readme, /Safe abort before exposure \| Existing production remains usable, but no completed user migration is claimed/);
  assert.match(readme, /An empty transition sample produces no evidence, not 100% success/);
  assert.match(backlog, /Unknown started outcomes cannot be excluded or presented as successful/);
  assert.match(kanban, /### Portable A-card lesson contract/);
  assert.match(kanban, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(kanban, /every other A\/B card belongs to SC-Snnn/);
  assert.match(kanban, /A worker cannot award its own Done credit/);
});

test('BDD precedes genuine loadable-stub RED, which precedes the resource-free IaC N/A decision', () => {
  const bdd = parse('evidence/bdd.json');
  const iac = parse('evidence/iac-decision.json');
  assert.ok(Date.parse(bdd.recordedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(red.finishedAtUtc) <= Date.parse(iac.decidedAtUtc));
  assert.equal(red.verified, true);
  assert.equal(red.commands.length, 1);
  assert.equal(red.commands[0].status, 1);
  const stdout = verifyBytes(red.streams['stdout.tap.raw']).toString('utf8');
  const stderr = verifyBytes(red.streams['stderr.raw']).toString('utf8');
  assert.match(stdout, /ERR_ASSERTION/);
  assert.match(stdout, /0 !== 1/);
  assert.match(stdout, /# pass 1/);
  assert.match(stdout, /# fail 1/);
  assert.doesNotMatch(stdout + stderr, /MODULE_NOT_FOUND|SyntaxError|ERR_MODULE_NOT_FOUND/);
  for (const snapshot of red.snapshots) {
    verifyBytes(snapshot);
    assert.match(snapshot.path, /\.snapshot$/);
    assert.doesNotMatch(snapshot.path, /\.test\.cjs$/);
  }
  const feature = red.snapshots.find((item) => item.original === 'candidate-crash.feature');
  assert.equal(feature.sha256, bdd.sha256);
  assert.equal(sha(read('candidate-crash.feature')), bdd.sha256);
  const stub = red.snapshots.find((item) => item.original === 'model.js');
  assert.match(read(stub.path).toString('utf8'), /function runLesson\(session\) \{\r?\n    return session;/);
  assert.equal(iac.decision, 'N/A');
  assert.equal(iac.resourcesCreated, 0);
  assert.equal(iac.managementCalls, 0);
  assert.equal(iac.newPackages, 0);
  assert.equal(iac.cloudSpend, 0);
});

test('frozen RED snapshots still reproduce the original real assertion failure without writes', () => {
  const stub = red.snapshots.find((item) => item.original === 'model.js');
  const tests = red.snapshots.find((item) => item.original === 'tests/behavior.test.cjs');
  const bootstrap = `
    const fs = require('node:fs');
    const Module = require('node:module');
    const path = require('node:path');
    const model = new Module(path.resolve('learning', 'S091', 'model.js'));
    model.filename = model.id;
    model._compile(fs.readFileSync(${JSON.stringify(path.join(lesson, ...stub.path.split('/')))}, 'utf8'), model.filename);
    const suite = new Module(path.resolve('learning', 'S091', 'tests', 'behavior.test.cjs'));
    suite.filename = suite.id;
    suite.paths = Module._nodeModulePaths(path.dirname(suite.filename));
    const originalRequire = suite.require.bind(suite);
    suite.require = (name) => name === '../model.js' ? model.exports : originalRequire(name);
    suite._compile(fs.readFileSync(${JSON.stringify(path.join(lesson, ...tests.path.split('/')))}, 'utf8'), suite.filename);
  `;
  const environment = { ...process.env };
  // A replay must not inherit the parent runner's private V8 event-stream reporter.
  delete environment.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--eval', bootstrap], { cwd: root, env: environment, encoding: 'utf8', windowsHide: true, timeout: 20000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /ERR_ASSERTION/);
  assert.match(result.stdout, /# pass 1/);
  assert.match(result.stdout, /# fail 1/);
  assert.doesNotMatch(result.stdout + result.stderr, /MODULE_NOT_FOUND|SyntaxError|ERR_MODULE_NOT_FOUND/);
});
