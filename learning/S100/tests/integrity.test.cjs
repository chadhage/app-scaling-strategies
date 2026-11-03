'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(read(file));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const uncompressed = (file) => gunzipSync(read(file));
const withinRoot = (file) => {
  assert.equal(typeof file, 'string');
  assert.equal(path.isAbsolute(file), false);
  const relative = path.relative(root, path.resolve(root, file));
  assert.ok(relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};

test('raw proof is byte-exact and owned text matches canonical Git blobs without rewriting files', () => {
  const index = json(path.join('evidence', 'content-index.json'));
  assert.equal(index.schemaVersion, 2);
  assert.equal(index.gitObjectFormat, 'sha1');
  const listed = new Set();
  for (const file of index.files) {
    withinRoot(file.path);
    assert.ok(!listed.has(file.path));
    listed.add(file.path);
    assert.notEqual(file.path, path.join('evidence', 'content-index.json'));
    const bytes = read(file.path);
    const rawProof = file.path.startsWith(`evidence${path.sep}`)
      && ['.snapshot', '.gz', '.png'].includes(path.extname(file.path));
    assert.equal(file.byteMode, rawProof ? 'raw-preserved' : 'lf-canonical-git-text');
    const canonical = rawProof ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
    assert.equal(canonical.length, file.bytes, file.path);
    assert.equal(hash(canonical), file.sha256, file.path);
    if (rawProof) {
      assert.equal(bytes.length, file.workingRawBytes, file.path);
      assert.equal(hash(bytes), file.workingRawSha256, file.path);
    } else {
      assert.ok(Buffer.from(bytes.toString('utf8')).equals(bytes), file.path);
    }
    const gitPath = path.relative(repo, path.join(root, file.path)).split(path.sep).join('/');
    const git = spawnSync('git', ['hash-object', '--stdin', `--path=${gitPath}`], {
      cwd: repo, encoding: null, input: bytes,
    });
    assert.equal(git.status, 0, git.stderr.toString());
    assert.equal(git.stdout.toString().trim(), file.gitBlobOid, file.path);
    const canonicalOid = createHash('sha1')
      .update(Buffer.from(`blob ${canonical.length}\0`)).update(canonical).digest('hex');
    assert.equal(canonicalOid, file.gitBlobOid, file.path);
  }
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      assert.equal(entry.isSymbolicLink(), false, 'Owned proof must not escape through a link');
      if (entry.isDirectory()) walk(target);
      else {
        const file = path.relative(root, target);
        if (file !== path.join('evidence', 'content-index.json')) assert.ok(listed.has(file), file);
      }
    }
  }
  walk(root);
});

test('captured raw CRLF source and immutable Git blob integrity are separately evidenced', () => {
  const source = json(path.join('evidence', 'source-contract.json'));
  for (const file of source.sourceFiles) {
    withinRoot(file.rawArchive);
    withinRoot(file.canonicalArchive);
    const working = uncompressed(file.rawArchive);
    const canonical = uncompressed(file.canonicalArchive);
    assert.equal(hash(working), file.workingRawSha256);
    assert.equal(hash(canonical), file.gitBlobSha256);
    assert.equal(working.includes(Buffer.from('\r\n')), file.workingContainsCRLF);
    assert.equal(canonical.includes(Buffer.from('\r\n')), file.canonicalContainsCRLF);
    assert.ok(working.toString().split(/\r?\n/).includes(file.exactRow));
    assert.ok(canonical.toString().split(/\r?\n/).includes(file.exactRow));
    const git = spawnSync('git', ['cat-file', 'blob', file.gitBlobOid], { cwd: repo, encoding: null });
    assert.equal(git.status, 0);
    assert.equal(hash(git.stdout), file.gitBlobSha256);
    assert.equal(working.toString().replace(/\r\n/g, '\n') === canonical.toString(),
      file.wholeWorkingMatchesCanonicalAfterCRLFNormalization);
  }
  assert.match(source.byteQualification, /separately preserved/);
});

test('raw assertion RED snapshots remain unchanged, outside discovery, and genuinely reproduce the missing behavior', () => {
  const red = json(path.join('evidence', 'red.json'));
  assert.equal(red.exitStatus, 1);
  assert.equal(red.genuineAssertionRed, true);
  const stdout = uncompressed(red.stdout);
  assert.equal(hash(stdout), red.stdoutRawSha256);
  assert.match(stdout.toString(), /ERR_ASSERTION/);
  assert.match(stdout.toString(), /0 !== 4/);
  const snapshots = json(red.snapshots);
  for (const file of snapshots.snapshots) {
    withinRoot(file.snapshot);
    assert.ok(file.snapshot.endsWith('.snapshot'));
    assert.equal(hash(read(file.snapshot)), file.sha256);
  }
  const modelSnapshot = snapshots.snapshots.find((file) => file.source === 'model.js');
  const box = { module: { exports: {} } };
  vm.runInNewContext(read(modelSnapshot.snapshot).toString(), box, { timeout: 1000 });
  const stub = box.module.exports;
  let state = stub.createState();
  for (const action of [{ type: 'start', input: { condition: 'forced', prediction: 'interrupted' } },
    { type: 'observe' }, { type: 'check' }]) state = stub.transition(state, action);
  assert.throws(() => assert.equal(stub.summarize(state).attempted, 4), { code: 'ERR_ASSERTION' });
  assert.notEqual(hash(read('model.js')), modelSnapshot.sha256);
});

test('captured command outputs are raw, successful, and sequenced BDD → RED → IaC → green', () => {
  const source = json(path.join('evidence', 'source-contract.json'));
  const bdd = json(path.join('evidence', 'bdd.json'));
  const red = json(path.join('evidence', 'red.json'));
  const iac = json(path.join('evidence', 'iac-decision.json'));
  const focused = json(path.join('evidence', 'focused-green.json'));
  assert.ok(source.capturedAtUtc <= bdd.specifiedAtUtc);
  assert.ok(bdd.specifiedAtUtc <= red.startedAtUtc);
  assert.ok(red.endedAtUtc <= iac.decidedAtUtc);
  assert.ok(iac.decidedAtUtc <= focused.startedAtUtc);
  assert.equal(iac.applicability, 'N/A');
  const records = [red, focused, json(path.join('evidence', 'browser-run.json')),
    ...json(path.join('evidence', 'syntax.json')).results];
  if (fs.existsSync(path.join(root, 'evidence', 'green.json'))) {
    records.push(json(path.join('evidence', 'green.json')));
  }
  if (fs.existsSync(path.join(root, 'evidence', 'qualification-green.json'))) {
    records.push(json(path.join('evidence', 'qualification-green.json')));
  }
  if (fs.existsSync(path.join(root, 'evidence', 'portability-green.json'))) {
    records.push(json(path.join('evidence', 'portability-green.json')));
  }
  for (const record of records) {
    assert.equal(record.exitStatus, record.stage === 'red' ? 1 : 0);
    assert.equal(record.error, null);
    assert.equal(record.signal, null);
    for (const stream of ['stdout', 'stderr']) {
      withinRoot(record[stream]);
      const archive = read(record[stream]);
      assert.equal(hash(archive), record[`${stream}ArchiveSha256`]);
      assert.equal(hash(gunzipSync(archive)), record[`${stream}RawSha256`]);
    }
  }
  const repair = json(path.join('evidence', 'publication-byte-qualification-repair.json'));
  assert.equal(repair.exitStatus, 2);
  assert.equal(repair.initialPublicationCreatedCommit, false);
  assert.equal(repair.additionalOriginalCredits, 0);
  for (const stream of ['stdout', 'stderr']) {
    const bytes = uncompressed(path.join('evidence', 'raw', `publication-gate-before-repair.${stream}.raw.gz`));
    assert.equal(hash(bytes), repair[`${stream}RawSha256`]);
  }
  const binding = json(path.join('evidence', 'canonical-bdd-before-repair.json'));
  assert.equal(binding.code, 'ERR_ASSERTION');
  assert.equal(binding.remoteVerified, true);
  assert.notEqual(binding.canonicalFeatureSha256, binding.originalRawBDDSha256);
  assert.equal(binding.additionalOriginalCredits, 0);
});

test('tooling qualification is the approved offline pair and published helper, not production or lifecycle certification', () => {
  const tooling = json(path.join('evidence', 'tooling.json'));
  assert.equal(tooling.nodeVersion, 'v22.23.4');
  assert.equal(tooling.playwrightVersion, '1.56.1');
  assert.equal(tooling.edge.version, '156.0.4314.50');
  assert.equal(tooling.edge.signatureStatus, 'Valid');
  assert.match(tooling.edge.signer, /Microsoft Corporation/);
  assert.equal(tooling.productionNode24Qualified, false);
  assert.equal(tooling.lifecyclePrototypeQualified, false);
  assert.equal(tooling.helperPublishedCommit, '53c0c0d');
  assert.equal(tooling.helperWorkingSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(hash(fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'))), tooling.helperWorkingSha256);
  assert.equal(hash(uncompressed(path.join('evidence', 'raw', 'edge-signature.stdout.raw.gz'))),
    tooling.signatureRawStdoutSha256);
});

test('actual browser evidence includes pass/interrupted, positive, unknown, fail, focused errors, reset and enforced CSP', () => {
  const browser = json(path.join('evidence', 'browser-acceptance.json'));
  assert.equal(browser.cardId, 'A-S100');
  assert.equal(browser.observations.length, 2);
  for (const group of browser.observations) {
    assert.equal(group.finallyCloseAwaited, true);
    assert.equal(group.browserVersion, '156.0.4314.50');
    assert.deepEqual(group.pageErrors, []);
  }
  const [journey, other] = browser.observations;
  const find = (step) => journey.snapshots.find((entry) => entry.step === step);
  assert.equal(find('expected-interruption-education-pass').verifier, 'PASS');
  assert.equal(find('expected-interruption-education-pass').counts.interrupted, 3);
  assert.equal(find('orderly-positive-with-retained-negative').counts.uninterrupted, 4);
  assert.equal(find('observation-gap-unknown').verifier, 'UNKNOWN');
  assert.equal(find('wrong-prediction-assertion-fail').verifier, 'FAIL');
  assert.equal(find('invalid-input-focused-error').focusedId, 'error');
  assert.equal(find('four-start-cap-focused-error').counts.attempted, 16);
  assert.equal(other.snapshots[0].counts.unknown, 4);
  assert.equal(other.snapshots[1].counts.interrupted, 3);
  assert.equal(other.csp.inlineRan, false);
  assert.equal(other.csp.connectionDenied, true);
  assert.ok(other.csp.violations.some((entry) => entry.directive === 'connect-src' && entry.disposition === 'enforce'));
});
