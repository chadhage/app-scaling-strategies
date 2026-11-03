'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const proof = require('./proof.cjs');
const read = (file) => JSON.parse(fs.readFileSync(path.join(proof.evidence, file), 'utf8'));

test('source, packet, single frozen unit and IaC N/A remain explicit', () => {
  const source = read('source-contract-001.json');
  assert.equal(source.cardId, 'A-S028');
  assert.equal(source.kanoUnit, 'A-S028');
  assert.equal(source.kano, 'S');
  assert.equal(source.packet, 'SC-S028');
  assert.match(source.source, /Warm-up timeout.*Abort explicitly and leave existing production routing intact/);
  assert.match(source.parent, /configurable warm-up timeout.*Abort preparation.*safe abort, not completed migration/);
  assert.match(source.card, /Expire warm-up; distinguish safe abort from completed user migration/);
  assert.match(source.atomicAndPortableContract, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(source.packetPolicy, /SC-Snnn/);
  const iac = read('iac-n-a.json');
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.resourcesCreated, 0);
  assert.equal(iac.managementCalls, 0);
});

test('portable manifest declares the exact exercise and no native, parent or production-runtime credit', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(proof.root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.cardId, 'A-S028');
  assert.equal(manifest.kanoUnit, 'A-S028');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.packet, 'SC-S028');
  assert.equal(manifest.parent, 'D-S028');
  assert.equal(manifest.source, 'S028');
  assert.equal(manifest.entryPoint, 'learning\\S028\\index.html');
  assert.equal(manifest.mode, 'synthetic-only');
  assert.equal(manifest.nativeProof, false);
  assert.equal(manifest.productionNode24Validated, false);
  assert.equal(manifest.parentComplete, false);
  assert.ok(manifest.preconditions.length && manifest.actions.length && manifest.expectedAssertions.length && manifest.limits.length);
  for (const file of [manifest.entryPoint, manifest.feature, ...manifest.tests]) {
    assert.ok(fs.existsSync(path.join(proof.repo, file)), file);
  }
  assert.deepEqual(manifest.nativeRemainderGates, ['CORE', 'DATA', 'HOST']);
});

test('raw recorded command outputs retain exact hashes and honest exit classifications', () => {
  const records = fs.readdirSync(proof.evidence).filter((file) => /^(?:red|green|syntax|browser|integrity)-\d+\.json$/.test(file));
  assert.ok(records.includes('red-001.json'));
  for (const file of records) {
    const record = read(file);
    const stem = file.slice(0, -5);
    assert.equal(proof.hashFile(path.join(proof.evidence, `${stem}.stdout.txt`)), record.stdoutSha256, file);
    assert.equal(proof.hashFile(path.join(proof.evidence, `${stem}.stderr.txt`)), record.stderrSha256, file);
    assert.equal(record.expectedExit, record.label === 'red' ? 1 : 0);
    assert.equal(record.expectedExitObserved, record.actualExit === record.expectedExit && record.error === null, file);
    if (record.label === 'red') assert.equal(record.actualExit, 1);
    assert.match(record.node, /^v22\./);
  }
});

test('retained RED snapshots match original inputs and still fail a real assertion with a loadable stub', () => {
  const red = read('red-001.json');
  assert.equal(red.assertionFailure, true);
  const snapshots = [
    ['red-feature.snapshot.txt', 'warm-up-timeout.feature'],
    ['red-warmup.js.snapshot.txt', 'warmup.js'],
    ['red-model.test.cjs.snapshot.txt', 'tests\\model.test.cjs'],
  ];
  for (const [file, original] of snapshots) {
    assert.equal(proof.hashFile(path.join(proof.evidence, file)), red.sourceHashes[original]);
  }
  const environment = {
    ...process.env, CAPTURE_BROWSER_EVIDENCE: '', S028_MODEL_PATH: path.join(proof.evidence, 'red-warmup.js.snapshot.txt'),
  };
  delete environment.NODE_TEST_CONTEXT;
  delete environment.NODE_TEST_WORKER_ID;
  const result = spawnSync(process.execPath, [
    '--test', '--test-reporter=tap', path.join(proof.evidence, 'red-model.test.cjs.snapshot.txt'),
  ], {
    env: environment,
    encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /ERR_ASSERTION/);
  assert.match(result.stdout, /# fail 1/);
  assert.match(result.stdout, /warming/);
  assert.match(result.stdout, /aborted/);
  assert.doesNotMatch(result.stdout + result.stderr, /MODULE_NOT_FOUND|Cannot find module|SyntaxError/);
});

test('published browser helper and genuine browser observations are qualified only for the recorded pair', () => {
  const expected = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
  assert.equal(proof.hashFile(path.join(proof.repo, 'testing', 'browser', 'isolated.cjs')), expected);
  const observations = fs.readdirSync(proof.evidence).filter((file) => /^browser-observation-\d+\.json$/.test(file));
  assert.ok(observations.length > 0, 'Deliberately capture actual browser evidence before integrity.');
  let successfulObservations = 0;
  for (const file of observations) {
    const observation = read(file);
    assert.equal(observation.tooling.helperSha256, expected);
    assert.equal(observation.tooling.playwright, '1.56.1');
    assert.match(observation.browserVersion, /^156\./);
    assert.equal(observation.tooling.edge.status, 'Valid');
    if (observation.passedLeafChecks === 10) {
      successfulObservations += 1;
      assert.equal(observation.cleanup.closeAwaitedInFinally, true);
      assert.equal(observation.cleanup.pageClosed, true);
      assert.equal(observation.csp.networkAttempted, false);
    }
  }
  assert.ok(successfulObservations > 0, 'A complete captured actual-browser run is required; earlier failures remain historical.');
});

test('ordinary verification capture helper cannot write proof, even for an expected failed command', () => {
  const before = fs.readdirSync(proof.evidence).sort().map((file) => [file, proof.hashFile(path.join(proof.evidence, file))]);
  const script = [
    `const p=require(${JSON.stringify(path.join(__dirname, 'proof.cjs'))});`,
    "if(p.capture)throw new Error('ordinary capture unexpectedly enabled');",
    "if(p.writeRecord('must-not-exist',{unsafe:true})!==null)throw new Error('wrote proof');",
    "p.command('read-only-expected-failure',['-e','process.exit(1)'],1);",
  ].join('');
  const result = spawnSync(process.execPath, ['-e', script], {
    env: { ...process.env, CAPTURE_BROWSER_EVIDENCE: '' }, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  const after = fs.readdirSync(proof.evidence).sort().map((file) => [file, proof.hashFile(path.join(proof.evidence, file))]);
  assert.deepEqual(after, before);
  assert.ok(fs.readdirSync(proof.evidence).filter((file) => file.includes('snapshot')).every((file) => file.endsWith('.txt')));
});
