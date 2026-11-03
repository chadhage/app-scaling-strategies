'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { sources, extract, canonical, sha, git } = require('./sources.cjs');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence');
const json = (file) => JSON.parse(fs.readFileSync(path.join(evidence, file), 'utf8'));

test('raw source snapshots retain their bytes while canonical excerpts match immutable Git sources', () => {
  const contract = json('source-contract.json');
  assert.equal(contract.records.length, sources.length);
  for (const record of contract.records) {
    const spec = sources.find((source) => source.name === record.name);
    assert.ok(spec);
    const snapshot = fs.readFileSync(path.join(evidence, record.snapshot));
    assert.equal(sha(snapshot), record.rawSnapshotSha256);
    assert.equal(sha(canonical(snapshot)), record.canonicalExcerptSha256);
    const current = extract(fs.readFileSync(path.join(repo, spec.path)), spec);
    assert.ok(canonical(current).equals(canonical(snapshot)), `current canonical source: ${record.name}`);
    const blob = git(['rev-parse', `${contract.sourceCommit}:${record.path.replace(/\\/g, '/')}`]).toString().trim();
    assert.equal(blob, record.gitBlob);
    const committed = git(['cat-file', 'blob', blob]);
    assert.equal(sha(committed), record.canonicalGitFileSha256);
    assert.ok(canonical(extract(committed, spec)).equals(canonical(snapshot)), `Git canonical excerpt: ${record.name}`);
    assert.ok(snapshot.includes(Buffer.from('\r\n')), `raw CRLF source preservation: ${record.name}`);
  }
  const attributes = fs.readFileSync(path.join(root, '.gitattributes'), 'utf8');
  assert.match(attributes, /\* text eol=lf/);
  assert.match(attributes, /\*\.snapshot -text -diff/);
  assert.match(attributes, /\*\.tap -text -diff/);
});

test('exact source acceptance, inventory packet and frozen single-unit scope are retained', () => {
  const contract = json('source-contract.json');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  const backlog = fs.readFileSync(path.join(evidence, 'source-backlog.snapshot'), 'utf8');
  assert.equal(backlog.split('|')[4].trim(), manifest.sourceAcceptance);
  assert.deepEqual([contract.cardId, contract.parentId, contract.sourceId, contract.packet, contract.kano],
    ['A-S056', 'D-S056', 'S056', 'SC-S056', 'S']);
  assert.deepEqual(contract.inventoryCards.map((card) => card.id), ['A-S056', 'B-S056']);
  for (const card of contract.inventoryCards) {
    assert.equal(card.packet, 'SC-S056');
    assert.equal(card.kano, 'S');
    assert.deepEqual(card.parents, ['D-S056']);
  }
  const packet = fs.readFileSync(path.join(evidence, contract.packetRule.snapshot));
  assert.equal(sha(packet), contract.packetRule.sha256);
  assert.ok(packet.includes(Buffer.from('SC-$($Matches[1])')));
  assert.match(contract.packetRule.provenance, /not a committed source blob/);
  const iac = json('iac.json');
  assert.equal(iac.status, 'N/A');
  for (const key of ['cloudCalls', 'iacGenerated', 'identityRegistration', 'deployment', 'spending', 'dependencyChanges']) {
    assert.equal(iac[key], false);
  }
});

test('archived RED is genuine and replayable, not absent code or tooling', () => {
  const run = json(path.join('red', 'run.json'));
  assert.equal(run.exitCode, 1);
  assert.equal(run.signal, null);
  const stdout = fs.readFileSync(path.join(evidence, 'red', 'stdout.tap'));
  const stderr = fs.readFileSync(path.join(evidence, 'red', 'stderr.tap'));
  assert.equal(sha(stdout), run.stdoutSha256);
  assert.equal(sha(stderr), run.stderrSha256);
  assert.match(stdout.toString(), /code: 'ERR_ASSERTION'/);
  assert.match(stdout.toString(), /expected: true/);
  assert.match(stdout.toString(), /actual: false/);
  assert.doesNotMatch(stdout.toString() + stderr, /MODULE_NOT_FOUND|ENOENT|SyntaxError|not a function|Cannot find/);
  for (const snapshot of run.snapshots) {
    assert.equal(sha(fs.readFileSync(path.join(evidence, 'red', snapshot.snapshot))), snapshot.sha256);
    assert.ok(snapshot.snapshot.endsWith('.snapshot'));
  }
  const archivedTest = fs.readFileSync(path.join(evidence, 'red', 'model.test.cjs.snapshot'), 'utf8').trimEnd();
  assert.ok(fs.readFileSync(path.join(root, 'tests', 'model.test.cjs'), 'utf8').startsWith(archivedTest));
  const replayEnv = { ...process.env, S056_MODEL_PATH: path.join(evidence, 'red', 'model.js.snapshot') };
  // Node's inherited test-runner marker suppresses recursively spawned --test runs.
  delete replayEnv.NODE_TEST_CONTEXT;
  const replay = spawnSync(process.execPath,
    ['--test', '--test-name-pattern=complete compatible overlap', path.join(root, 'tests', 'model.test.cjs')],
    { cwd: repo, encoding: 'utf8', timeout: 15000, env: replayEnv });
  assert.ifError(replay.error);
  assert.equal(replay.status, 1);
  assert.match(replay.stdout, /ERR_ASSERTION/);
  assert.match(replay.stdout, /actual: false/);
  assert.doesNotMatch(replay.stdout + replay.stderr, /MODULE_NOT_FOUND|ENOENT|SyntaxError|not a function/);
});

test('published browser helper and deliberate real-browser proof qualify only the pinned local pair', () => {
  const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
  assert.equal(sha(fs.readFileSync(helper)), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.ok(canonical(fs.readFileSync(helper))
    .equals(canonical(git(['show', '53c0c0d:testing/browser/isolated.cjs']))));
  const proof = json('browser.json');
  const tooling = json('tooling.json');
  assert.equal(tooling.signatureStatus, 'Valid');
  assert.match(tooling.signer, /Microsoft Corporation/);
  assert.equal(tooling.version, proof.browserVersion);
  assert.equal(tooling.node, proof.node);
  assert.equal(tooling.downloads, false);
  assert.equal(tooling.flagsChanged, false);
  assert.equal(proof.cardId, 'A-S056');
  assert.equal(proof.passed, true);
  assert.equal(proof.playwrightVersion, '1.56.1');
  assert.match(proof.browserVersion, /^156\./);
  assert.match(proof.node, /^v22\./);
  assert.equal(proof.cleanup.awaitedFinallyClose, true);
  assert.equal(proof.cleanup.pageClosed, true);
  assert.deepEqual(proof.pageErrors, []);
  assert.deepEqual(proof.exerciseNetworkRequests, []);
  assert.deepEqual(proof.escapedProbeRequests, []);
  assert.ok(proof.observations.length >= 15);
  assert.equal(proof.productionNode24Certification, false);
  for (const record of proof.sources) {
    assert.equal(sha(canonical(fs.readFileSync(path.join(root, record.path)))), record.canonicalSha256);
  }
});

test('stage-order metadata and preserved real verification failures remain honest and hash-checked', () => {
  const sequence = json('sequence.json');
  const times = sequence.stages.map((stage) => Date.parse(stage.atUtc));
  assert.ok(times.every((value) => Number.isFinite(value)));
  assert.ok(times.every((value, index) => !index || value >= times[index - 1]));
  assert.deepEqual(sequence.stages.map((stage) => stage.name),
    ['BDD created', 'Loadable stub created', 'Behavioral RED started', 'Behavioral RED completed',
      'IaC N/A file created', 'Implementation/refactor observed']);
  const browserFailure = fs.readFileSync(path.join(evidence, sequence.browserFailure.snapshot));
  assert.equal(sha(browserFailure), sequence.browserFailure.sha256);
  const observation = JSON.parse(browserFailure);
  assert.equal(observation.passed, false);
  assert.equal(observation.cleanup.awaitedFinallyClose, true);
  assert.match(observation.failure.message, /regular expression/);
  for (const record of sequence.focusedFailure.files) {
    assert.equal(sha(fs.readFileSync(path.join(evidence, record.path))), record.sha256);
  }
  assert.equal(json(path.join('focused-001-failure', 'run.json')).exitCode, 1);
});
