'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence');
const sha = (data) => createHash('sha256').update(data).digest('hex');
const read = (file) => fs.readFileSync(path.join(evidence, file));
const json = (file) => JSON.parse(read(file));

test('retained RED is a real loaded behavioral assertion and snapshots are not discoverable tests', () => {
  const run = json('red-run-001.json');
  const tap = read('red-run-001.tap').toString();
  assert.equal(run.exitCode, 1);
  assert.equal(run.error, null);
  assert.match(tap, /ERR_ASSERTION/);
  assert.match(tap, /actual: 'unknown'/);
  assert.match(tap, /expected: 'success'/);
  assert.doesNotMatch(tap, /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError/);
  const stub = read(run.snapshots['model.js'].snapshot).toString();
  const context = vm.createContext({});
  new vm.Script(stub).runInContext(context);
  assert.equal(vm.runInContext("['route','resolve','retire'].reduce((s,a)=>S050.step(s,a),S050.createState()).result.outcome", context), 'unknown');
  assert.notEqual(sha(Buffer.from(stub)), sha(fs.readFileSync(path.join(root, 'model.js'))));
  const originalTest = read(run.snapshots['tests\\model.test.cjs'].snapshot).toString();
  assert.ok(fs.readFileSync(path.join(root, 'tests', 'model.test.cjs'), 'utf8').replace(/\r\n/g, '\n')
    .startsWith(originalTest.replace(/\r\n/g, '\n')));
  for (const snapshot of Object.values(run.snapshots)) assert.ok(snapshot.snapshot.endsWith('.snapshot'));
  const iac = json('iac.json');
  assert.equal(iac.status, 'N/A');
  assert.ok(Date.parse(iac.recordedAtUtc) > Date.parse(run.finishedAtUtc));
  assert.match(iac.decisionStage, /after.*RED.*before implementation/i);
});

test('every retained raw run, TAP and source snapshot matches its recorded byte provenance', () => {
  const records = fs.readdirSync(evidence).filter((file) => /^(?:red|focused|browser|publication)-run-\d+\.json$/.test(file));
  assert.ok(records.length >= 1);
  for (const file of records) {
    const run = json(file);
    for (const channel of ['stdout', 'stderr']) {
      const raw = gunzipSync(read(run[channel].gzip));
      assert.equal(raw.length, run[channel].bytes, `${file} ${channel} byte length`);
      assert.equal(sha(raw), run[channel].sha256, `${file} ${channel} SHA256`);
      if (channel === 'stdout' && run.stage !== 'publication-preflight') {
        assert.deepEqual(raw, read(file.replace(/\.json$/, '.tap')));
      }
    }
    for (const snapshot of Object.values(run.snapshots)) assert.equal(sha(read(snapshot.snapshot)), snapshot.sha256);
    if (run.observations) {
      const observed = read(run.observations.file);
      assert.equal(observed.length, run.observations.bytes);
      assert.equal(sha(observed), run.observations.sha256);
    }
    assert.equal(run.cardId, 'A-S050');
    assert.equal(run.kano, 'S');
    assert.ok(Date.parse(run.finishedAtUtc) >= Date.parse(run.startedAtUtc));
  }
});

test('source entries and approved helper remain precise without editing shared contracts', () => {
  const contract = json('source-contract.json');
  for (const key of ['source', 'backlog']) {
    assert.ok(fs.readFileSync(path.join(repo, contract[key].path), 'utf8').includes(contract[key].exactEntry));
  }
  assert.ok(fs.readFileSync(path.join(repo, contract.portableContract.path), 'utf8').includes(contract.portableContract.exactCard));
  assert.equal(contract.refinement.additionalUnits, 0);
  const tooling = json('tooling.json');
  assert.equal(sha(fs.readFileSync(path.join(repo, tooling.helperPath))), tooling.helperSha256);
  assert.equal(tooling.helperPublishedCommit, '53c0c0d');
  assert.equal(tooling.browserSignatureStatus, 'Valid');
});

test('any retained browser summary identifies real observations, current assets and awaited cleanup', () => {
  if (!fs.existsSync(path.join(evidence, 'browser.json'))) return;
  const proof = json('browser.json');
  assert.equal(proof.outcome, 'PASS');
  assert.equal(proof.captureExplicitlyEnabled, true);
  assert.equal(proof.cleanup.closed, true);
  assert.equal(proof.cleanup.awaitedFinallyClose, true);
  assert.ok(proof.observations.length >= 12);
  assert.ok(proof.cspViolations.length >= 8);
  assert.deepEqual(proof.pageErrors, []);
  assert.deepEqual(proof.exerciseNetworkRequests, []);
  for (const [file, digest] of Object.entries(proof.testedSourceHashes)) {
    assert.equal(sha(Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'))),
      digest, `browser proof current asset ${file}`);
  }
});
