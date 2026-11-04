'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
const evidence = JSON.parse(fs.readFileSync(path.join(root, 'evidence.json')));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const crlf = (bytes) => (bytes.toString('utf8').match(/\r\n/g) || []).length;
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const rawRoot = path.join(root, 'evidence', 'raw');
const records = fs.readdirSync(rawRoot).map((name) => {
  const file = path.join(rawRoot, name, 'record.json');
  return fs.existsSync(file) ? { file, value: JSON.parse(fs.readFileSync(file)) } : null;
}).filter(Boolean);
const recordFor = (label) => records.find((record) => record.value.label === label).value;

function owned(file) {
  assert.equal(path.isAbsolute(file), false);
  const result = path.resolve(repository, file);
  const relative = path.relative(root, result);
  assert.ok(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  return result;
}

function preservedSource(record, suffix) {
  const snapshot = record.snapshots.find((item) => item.path.endsWith(suffix));
  assert.ok(snapshot, `Missing original snapshot ${suffix}`);
  return zlib.gunzipSync(fs.readFileSync(owned(snapshot.snapshot)));
}

test('manifest pins accepted C021/C023 and read-only C020 raw CRLF separately from canonical Git blobs', () => {
  assert.deepEqual(manifest.acceptedDependencies.map((item) => item.cardId), ['C021', 'C023']);
  for (const item of [...manifest.sourceLineage, ...manifest.acceptedDependencies]) {
    const bytes = fs.readFileSync(path.join(repository, item.path));
    assert.equal(sha256(bytes), item.rawSha256, `Unchanged raw ${item.path}`);
    assert.equal(crlf(bytes), item.rawCRLF);
    assert.equal(sha256(canonical(bytes)), item.gitCanonicalSha256);
    const gitPath = item.path.split(path.sep).join('/');
    const blob = execFileSync('git', ['show', `${item.commit}:${gitPath}`], { cwd: repository, encoding: 'buffer' });
    assert.equal(sha256(blob), item.gitCanonicalSha256);
    assert.deepEqual(canonical(bytes), blob);
    const tag = execFileSync('git', ['rev-parse', `${item.tag}^{}`], { cwd: repository, encoding: 'utf8' }).trim();
    assert.equal(tag, item.commit);
  }
});

test('qualified shared helper is byte-exact and both offline Playwright packages remain 1.56.1', () => {
  assert.equal(sha256(fs.readFileSync(path.join(repository, manifest.browserAuthority.helperPath))), manifest.browserAuthority.helperSha256);
  for (const name of ['playwright', 'playwright-core']) {
    const pkg = JSON.parse(fs.readFileSync(path.join(repository, 'testing', 'browser', 'node_modules', name, 'package.json')));
    assert.equal(pkg.version, '1.56.1');
  }
  assert.equal(manifest.browserAuthority.abandonedLifecyclePrototypeUsed, false);
  assert.equal(manifest.browserAuthority.unattendedLifecycleQualification, false);
});

test('every immutable capture verifies exact compressed raw streams and source snapshots without CRLF normalization', () => {
  assert.ok(records.length >= 4);
  for (const { value } of records) {
    assert.equal(value.schema, 'C048/raw-proof/1');
    assert.equal(value.cardId, 'C048');
    assert.equal(value.workerId, 'worker-C048');
    assert.equal(value.captureRequested, true);
    assert.equal(value.rawPreservedWithoutNormalization, true);
    assert.equal(value.runtime, 'v22.23.4');
    for (const stream of Object.values(value.streams)) {
      const bytes = zlib.gunzipSync(fs.readFileSync(owned(stream.path)));
      assert.equal(sha256(bytes), stream.sha256);
      assert.equal(bytes.length, stream.bytes);
      assert.equal(crlf(bytes), stream.rawCRLF);
    }
    for (const snapshot of value.snapshots) {
      const bytes = zlib.gunzipSync(fs.readFileSync(owned(snapshot.snapshot)));
      assert.equal(sha256(bytes), snapshot.rawSha256);
      assert.equal(crlf(bytes), snapshot.rawCRLF);
      assert.equal(sha256(canonical(bytes)), snapshot.gitCanonicalSha256);
    }
    for (const item of value.dependencies) {
      const pinned = [...manifest.sourceLineage, ...manifest.acceptedDependencies].find((pin) => pin.path === item.path);
      assert.ok(pinned);
      assert.equal(item.rawSha256, pinned.rawSha256);
      assert.equal(item.gitCanonicalSha256, pinned.gitCanonicalSha256);
      assert.equal(item.rawCRLF, pinned.rawCRLF);
      assert.equal(item.canonicalUnchanged, true);
    }
  }
});

test('original RED is three authentic actual-transition AssertionErrors plus two passing control paths', () => {
  const red = recordFor('behavioral-red');
  assert.equal(red.status, 1);
  const stdout = zlib.gunzipSync(fs.readFileSync(owned(red.streams.stdout.path))).toString('utf8');
  assert.match(stdout, /A bad DATA consumer must block the actual admission transition/);
  assert.match(stdout, /A bad EVENT consumer must block the actual expansion transition/);
  assert.match(stdout, /Unknown evidence is not a positive admission result/);
  assert.equal((stdout.match(/name: 'AssertionError'/g) || []).length, 3);
  assert.match(stdout, /expected: 0\s+actual: 1/);
  assert.match(stdout, /# pass 2/);
  assert.match(stdout, /# fail 3/);
  const stub = preservedSource(red, 'C048\\admission.js');
  const tests = preservedSource(red, 'C048\\tests\\admission.test.cjs');
  new vm.Script(stub.toString('utf8'));
  assert.notEqual(sha256(stub), sha256(fs.readFileSync(path.join(root, 'admission.js'))));
  assert.deepEqual(tests, fs.readFileSync(path.join(root, 'tests', 'admission.test.cjs')));
  assert.match(stub.toString('utf8'), /counts\.admissions\+\+/);
  assert.doesNotMatch(stub.toString('utf8'), /DATA_INCOMPATIBLE/);
});

test('BDD then loadable stub then genuine RED then IaC N/A preceded implemented focused GREEN', () => {
  const stub = recordFor('stub-load');
  const red = recordFor('behavioral-red');
  const iac = recordFor('iac-na');
  const green = recordFor('focused-model-green');
  assert.equal(stub.status, 0);
  assert.equal(iac.status, 0);
  assert.equal(green.status, 0);
  assert.ok(stub.finishedAtUtc <= red.startedAtUtc);
  assert.ok(red.finishedAtUtc <= iac.startedAtUtc);
  assert.ok(iac.finishedAtUtc <= green.startedAtUtc);
  assert.deepEqual(preservedSource(stub, 'C048\\C048.feature'), preservedSource(red, 'C048\\C048.feature'));
  assert.deepEqual(preservedSource(red, 'C048\\C048.feature'), fs.readFileSync(path.join(root, 'C048.feature')));
  assert.deepEqual(preservedSource(stub, 'C048\\admission.js'), preservedSource(red, 'C048\\admission.js'));
  const stdout = zlib.gunzipSync(fs.readFileSync(owned(green.streams.stdout.path))).toString('utf8');
  assert.match(stdout, /# tests 137/);
  assert.match(stdout, /# pass 137/);
  assert.match(stdout, /# fail 0/);
  assert.match(preservedSource(green, 'C048\\admission.js').toString('utf8'), /evidence = eligibility\(candidate\)/);
});

test('RED source and replay are outside test autodiscovery and never replace production admission.js', () => {
  const directories = [path.join(root, 'evidence', 'red'), rawRoot];
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else files.push(file);
    }
  }
  directories.forEach(visit);
  assert.ok(files.some((file) => file.endsWith('replay.cjs.txt')));
  assert.equal(files.some((file) => /\.(?:js|cjs|mjs)$/.test(file)), false);
  const replay = fs.readFileSync(path.join(root, 'evidence', 'red', 'replay.cjs.txt'), 'utf8');
  assert.match(replay, /stub\._compile/);
  assert.doesNotMatch(replay, /writeFile|rename|unlink|rmSync/);
});

test('proof creation is explicit exact-flag, unique create-only; normal runners have no proof rewrite path', () => {
  const recorder = fs.readFileSync(path.join(root, 'tests', 'capture.cjs'), 'utf8');
  const browser = fs.readFileSync(path.join(root, 'tests', 'browser.cjs'), 'utf8');
  assert.match(recorder, /assert\.equal\(process\.env\.CAPTURE_BROWSER_EVIDENCE, '1'/);
  assert.match(browser, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  for (const text of [recorder, browser]) {
    assert.match(text, /randomUUID\(\)/);
    assert.match(text, /flag: 'wx'/);
    assert.doesNotMatch(text, /unlink|rmSync|renameSync|process\.env\.CAPTURE_BROWSER_EVIDENCE\s*=(?!=)/);
  }
  assert.match(browser, /await session\.close\(\)/);
  assert.match(browser, /finally \{/);
  assert.match(browser, /proofDigest\(\)/);
  assert.match(browser, /before !== after/);
  assert.equal(manifest.qualifications.cloudCalls, 0);
  assert.equal(evidence.extraUnitsForTestsRepairsProofRefinement, 0);
});

test('current C048 raw CRLF and Git-canonical bytes are separately checked; raw evidence stays binary', () => {
  const attributes = fs.readFileSync(path.join(root, '.gitattributes'), 'utf8');
  assert.match(attributes, /\* text eol=lf/);
  assert.match(attributes, /evidence\/raw\/\*\* -text/);
  assert.match(attributes, /evidence\/red\/\*\* -text/);
  assert.match(attributes, /evidence\/red\/replay\.cjs\.txt text eol=lf/);
  assert.match(attributes, /\*\.gz -text/);
  const sample = recordFor('behavioral-red').streams.stdout.path;
  const attributesOutput = execFileSync('git', ['check-attr', 'text', '--', sample], { cwd: repository, encoding: 'utf8' });
  assert.match(attributesOutput, /text: unset/);
  const archive = JSON.parse(fs.readFileSync(path.join(root, 'evidence',
    'replay-line-ending-archive-2026-11-04T05-47-03-440Z-7d538e1f-299f-4ee7-a06e-1f37727ef7cf', 'record.json')));
  assert.equal(archive.schema, 'C048/replay-line-ending-archive/1');
  assert.equal(archive.captureRequested, true);
  assert.equal(archive.additionalUnits, 0);
  for (const snapshot of archive.snapshots) {
    const bytes = zlib.gunzipSync(fs.readFileSync(owned(snapshot.snapshot)));
    assert.equal(sha256(bytes), snapshot.rawSha256);
    assert.equal(sha256(canonical(bytes)), snapshot.gitCanonicalSha256);
    assert.equal(crlf(bytes), snapshot.rawCRLF);
    if (snapshot.path.endsWith('replay.cjs.txt')) assert.deepEqual(bytes, fs.readFileSync(owned(snapshot.path)));
  }
  for (const name of ['admission.js', 'index.html', 'page.js', 'styles.css', 'C048.feature', 'manifest.json', 'CONTRACT.txt',
    'evidence\\red\\replay.cjs.txt']) {
    const bytes = fs.readFileSync(path.join(root, name));
    assert.equal(bytes.toString('utf8').replace(/\r\n/g, '').includes('\r'), false);
    const file = path.relative(repository, path.join(root, name));
    const filtered = execFileSync('git', ['hash-object', `--path=${file}`, file], { cwd: repository, encoding: 'utf8' }).trim();
    const expected = execFileSync('git', ['hash-object', '--no-filters', '--stdin'], {
      cwd: repository, input: canonical(bytes), encoding: 'utf8'
    }).trim();
    assert.equal(filtered, expected, `Git-canonical LF ${file}; original raw CRLF remains separately captured.`);
  }
});

test('owned publication wrapper checks actual main equality under publisher lock and delegates only to standard scoped publisher', () => {
  const publisher = fs.readFileSync(path.join(root, 'publication', 'publish.cjs.txt'), 'utf8');
  const authority = manifest.publicationAuthority;
  const privatePublisher = fs.readFileSync(path.join(repository, authority.path));
  assert.equal(sha256(privatePublisher), authority.approvedRawSha256);
  assert.equal(sha256(canonical(privatePublisher)), authority.gitCanonicalSha256);
  assert.equal(crlf(privatePublisher), authority.rawCRLF);
  assert.equal(authority.approvedRawSha256, '91c8cf83dd07e34a467eae35445e2337783ce28aaf9c4d3d2d4932b17fb59244');
  assert.equal(authority.sharedPublisherModifiedByWorker, false);
  const boundary = JSON.parse(fs.readFileSync(owned(authority.boundaryRecord)));
  assert.equal(boundary.schema, 'C048/parent-publisher-boundary/2');
  assert.equal(boundary.cardId, 'C048');
  assert.equal(boundary.kano, 'D');
  assert.equal(boundary.captureRequested, true);
  assert.equal(boundary.additionalUnits, 0);
  const initialBoundary = JSON.parse(fs.readFileSync(owned(boundary.previousBoundaryRecord)));
  assert.equal(initialBoundary.oldSharedPublisher.parentDeclaredHistoricalSha256, authority.previousParentDeclaredHistoricalSha256);
  assert.equal(initialBoundary.oldSharedPublisher.previousOwnedManifestPinnedSharedPublisher, false);
  assert.equal(initialBoundary.oldSharedPublisher.originalSharedSourceSnapshotClaimed, false);
  assert.equal(boundary.previousSharedSnapshot.rawSha256, authority.previousApprovedRawSha256);
  assert.equal(boundary.currentSharedSnapshot.rawSha256, authority.approvedRawSha256);
  assert.equal(boundary.sharedPublisherChangedByWorker, false);
  assert.equal(boundary.globalGitConfigChanged, false);
  for (const snapshot of [boundary.previousSharedSnapshot, boundary.currentSharedSnapshot]) {
    const bytes = zlib.gunzipSync(fs.readFileSync(owned(snapshot.snapshot)));
    assert.equal(sha256(bytes), snapshot.rawSha256);
    assert.equal(sha256(canonical(bytes)), snapshot.gitCanonicalSha256);
    assert.equal(crlf(bytes), snapshot.rawCRLF);
  }
  assert.match(privatePublisher.toString(), /core\.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol/);
  for (const snapshot of boundary.previousOwnedSnapshots) {
    const bytes = zlib.gunzipSync(fs.readFileSync(owned(snapshot.snapshot)));
    assert.equal(sha256(bytes), snapshot.rawSha256);
    assert.equal(sha256(canonical(bytes)), snapshot.gitCanonicalSha256);
    assert.equal(crlf(bytes), snapshot.rawCRLF);
    if (snapshot.path.endsWith('result.json')) {
      const previous = JSON.parse(bytes);
      assert.equal(previous.outcome, 'blocked');
      assert.equal(previous.commit, null);
      assert.equal(previous.tag, null);
    }
  }
  assert.equal(fs.readFileSync(path.join(root, '.gitignore'), 'utf8').trim(), 'result.json');
  assert.equal(authority.reportFileIgnoredFromImplementationCommit, true);
  assert.equal(execFileSync('git', ['check-ignore', '-z', '--stdin'], {
    cwd: repository, encoding: 'utf8', input: `${authority.reportFile}\0`
  }).split('\0')[0].split('\\').join('/'),
    authority.reportFile.split(path.sep).join('/'));
  assert.match(publisher, /process\.env\.NODE_TEST_CONTEXT, undefined/);
  assert.equal(fs.existsSync(path.join(root, 'tests', 'publish.cjs')), false);
  let spawned = false;
  assert.throws(() => vm.runInNewContext(publisher, {
    __dirname: path.join(root, 'publication'),
    process: { argv: ['node', 'publish.cjs.txt'], env: { NODE_TEST_CONTEXT: 'child-v8' } },
    require: (name) => name === 'node:child_process' ? {
      spawnSync: () => { spawned = true; throw new Error('Publication child must not start in tests.'); }
    } : require(name)
  }), { code: 'ERR_ASSERTION' });
  assert.equal(spawned, false);
  assert.match(publisher, /Local\\AppScalingStrategies_KanbanPublisher_v1/);
  assert.match(publisher, /'ls-remote', 'origin', 'refs\/heads\/main'/);
  assert.match(publisher, /HEAD_MAIN_MISMATCH/);
  assert.match(publisher, /PUBLISHER_BOUNDARY_MISMATCH/);
  assert.match(publisher, /Get-FileHash -LiteralPath .git\\kanban-orchestrator\\publish.ps1 -Algorithm SHA256/);
  assert.match(publisher, /assert\.equal\(qualification\.current, true/);
  assert.match(publisher, /publish\.ps1 -CardId C048 -WorkerId worker-C048 -Paths @\('capability\\C048'\)/);
  assert.match(publisher, /\[C048\]\[D\]/);
  assert.doesNotMatch(publisher, /git.*(?:add|commit|push|reset|stash|amend)|index\.lock|--force|-Admin/);
  assert.match(publisher, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(publisher, /writesDeferredUntilChildExit: true/);
  for (const name of fs.readdirSync(path.join(root, 'evidence')).filter((file) => /^publication-.*\.json$/.test(file))) {
    const attempt = JSON.parse(fs.readFileSync(path.join(root, 'evidence', name)));
    assert.equal(attempt.schema, 'C048/publication-attempt/1');
    assert.equal(attempt.cardId, 'C048');
    assert.equal(attempt.workerId, 'worker-C048');
    assert.equal(attempt.captureRequested, true);
    assert.equal(attempt.writesDeferredUntilChildExit, true);
    assert.notEqual(attempt.status, 0);
    assert.equal(sha256(Buffer.from(attempt.script)), attempt.scriptSha256);
    for (const stream of Object.values(attempt.streams)) {
      const bytes = zlib.gunzipSync(fs.readFileSync(owned(stream.path)));
      assert.equal(sha256(bytes), stream.sha256);
      assert.equal(bytes.length, stream.bytes);
      assert.equal(crlf(bytes), stream.rawCRLF);
    }
  }
});

test('finalized browser authority is actual captured signed-Edge proof with blocked admissions, cleanup and honest qualifications', () => {
  if (!evidence.browserAuthority) {
    assert.equal(evidence.status, 'model-green-browser-qualification-pending');
    return;
  }
  const proof = JSON.parse(fs.readFileSync(owned(evidence.browserAuthority.record)));
  assert.equal(proof.schema, 'C048/browser-proof/1');
  assert.equal(proof.requestedScope, 'full');
  assert.equal(proof.outcome, 'passed');
  assert.equal(proof.captureRequested, true);
  assert.equal(proof.runtime, 'v22.23.4');
  assert.equal(proof.playwrightVersion, '1.56.1');
  assert.match(proof.browserVersion, /^156\./);
  assert.equal(proof.installedBinary.status, 'Valid');
  assert.match(proof.installedBinary.signer, /Microsoft Corporation/);
  assert.equal(proof.helper.observedSha256, manifest.browserAuthority.helperSha256);
  assert.equal(proof.helper.finalSha256, manifest.browserAuthority.helperSha256);
  assert.equal(proof.helper.abandonedLifecyclePrototypeUsed, false);
  assert.equal(proof.cleanup.browserClosed, true);
  assert.equal(proof.cleanup.awaitedFinallyClose, true);
  assert.equal(proof.cleanup.listenersCreated, 0);
  assert.equal(proof.cleanup.foregroundLeaseUsed, false);
  assert.equal(proof.chromiumSandbox, true);
  assert.equal(proof.unsafeFlagsUsed, false);
  assert.equal(proof.qualifications.nativeQualified, false);
  assert.equal(proof.qualifications.productionNode24Validated, false);
  assert.equal(proof.qualifications.cloudCalls, 0);
  assert.equal(proof.qualifications.spend, 0);
  assert.ok(proof.checks.length >= 24);
  assert.equal(proof.checks.every((check) => check.passed === true), true);
  assert.ok(proof.checks.some((check) => /bad old DATA consumer blocks admit with zero/.test(check.name)));
  assert.ok(proof.checks.some((check) => /incompatible EVENT consumer blocks expansion/.test(check.name)));
  assert.ok(proof.checks.some((check) => /unknown EVENT evidence/.test(check.name)));
  assert.ok(proof.checks.some((check) => /native keyboard reset/.test(check.name)));
  assert.ok(proof.checks.some((check) => /actual CSP denies/.test(check.name)));
  assert.equal(proof.finalSession.active, null);
  assert.equal(proof.finalSession.archives, 2);
  assert.equal(proof.finalSession.counts.admissions, 2);
  assert.equal(proof.finalSession.counts.expansions, 1);
  assert.equal(proof.finalSession.counts.modeledEffectApplications, 6);
  const current = evidence.browserAuthority.current !== false;
  const boundary = current ? null : JSON.parse(fs.readFileSync(owned(manifest.publicationAuthority.boundaryRecord)));
  if (!current) assert.equal(evidence.status, 'parent-approved-publisher-boundary-refresh-pending');
  for (const [file, expected] of Object.entries(proof.sourceHashes)) {
    const historical = boundary?.previousOwnedSnapshots.find((item) => item.path === file);
    const bytes = historical ? zlib.gunzipSync(fs.readFileSync(owned(historical.snapshot))) : fs.readFileSync(owned(file));
    assert.equal(sha256(bytes), expected);
    assert.equal(sha256(canonical(bytes)), proof.sourceGitCanonicalHashes[file]);
    assert.equal(crlf(bytes), proof.sourceRawCRLF[file]);
  }
  for (const image of proof.images) {
    const bytes = fs.readFileSync(owned(image.path));
    assert.equal(sha256(bytes), image.sha256);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  }
});
