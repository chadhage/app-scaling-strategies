'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const evidence = require(path.join(__dirname, '..', 'scripts', 'evidence.cjs'));
const lesson = require(path.join(__dirname, '..', 'model.js'));
const read = (relative) => fs.readFileSync(path.join(evidence.ROOT, relative), 'utf8');
const json = (relative) => JSON.parse(read(relative));

test('manifest preserves exact source/card/packet/frozen one-unit authority', () => {
  const manifest = json('manifest.json');
  assert.equal(manifest.sourceId, 'S121');
  assert.equal(manifest.cardId, 'A-S121');
  assert.equal(manifest.parentId, 'D-S121');
  assert.equal(manifest.packet, 'SC-S121');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S121');
  assert.equal(manifest.owner, 'worker-A-S121');
  assert.equal(manifest.objective, 'Rehearse Windows code-slot promotion; identify configuration/readiness evidence needed for a native claim.');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.banner, lesson.BANNER);
  assert.equal(manifest.entry, 'index.html');
  assert.equal(manifest.acceptance.acceptedAtUtc, null);
  for (const key of ['nativeClaim', 'sourceParentComplete', 'fiveNinesProven']) {
    assert.equal(manifest.acceptance[key], false);
  }
});

test('exact S121, D-S121 and A-S121 clauses exist at the immutable source checkpoint', () => {
  const source = json('evidence\\source-contract.json');
  assert.equal(source.kanoUnit, 'A-S121');
  assert.equal(source.packet, 'SC-S121');
  for (const record of [source.sourceScenario, source.sourceParent, source.portableCard]) {
    const original = evidence.git(['--no-pager', 'show', `${source.sourceCommit}:${record.path}`]);
    assert.ok(original.split(/\r?\n/).includes(record.exactRow), `Exact source row missing: ${record.path}`);
  }
  assert.match(source.sourceParent.exactRow, /Actual code-slot configuration, strict readiness, state, and client outcomes are evidenced on Windows/);
  assert.equal(source.sourceParent.completed, false);
  assert.deepEqual(source.sourceParent.additionalNativePrerequisites,
    ['BASE: H011 + P005 + applicable HOST', 'P001', 'D-S002']);
  assert.equal(source.portableCard.nativeSiblingGate, 'CORE, DATA, C061, C064');
});

test('documented Windows support and lifecycle constraints do not qualify an actual target', () => {
  const source = json('evidence\\source-contract.json');
  const baseline = evidence.git(['--no-pager', 'show',
    `${source.sourceCommit}:capability/C003/matrix-data.js`]);
  for (const field of ['windowsRow', 'sharedCompute', 'strictWarmup', 'slotLifecycle']) {
    assert.ok(baseline.includes(source.documentedConstraintsReadBeforeDesign[field]), field);
  }
  assert.match(source.documentedConstraintsReadBeforeDesign.authority, /unresolved/);
  assert.match(source.remainingWork['B-S121'], /Blocked/);
  assert.match(source.remainingWork['D-S121'], /Incomplete/);
  assert.match(source.remainingWork.catalogIntegration, /Parent-owned/);
});

test('IaC is explicitly N/A after original RED and before implementation', () => {
  const decision = json('evidence\\iac-na.json');
  assert.equal(decision.applicable, false);
  for (const key of ['azureExecution', 'iacGeneration', 'scaffolding', 'identityRegistration',
    'configurationDeployment', 'deployment', 'credentials', 'spend']) {
    assert.equal(decision[key], false, key);
  }
  assert.equal(decision.additionalKanoCredits, 0);
  assert.match(decision.stage, /after genuine RED and before implementation/);
  const provenance = json('evidence\\integrity.json');
  const browserRed = json('evidence\\red\\browser.json');
  const resetRed = json('evidence\\red\\retained-reset.json');
  assert.ok(Date.parse(browserRed.observedAtUtc) < Date.parse(provenance.iacCreatedAtUtc));
  assert.ok(Date.parse(provenance.iacCreatedAtUtc) < Date.parse(resetRed.observedAtUtc));
});

for (const name of ['model', 'browser', 'retained-reset']) {
  test(`${name} genuine assertion RED retains exact raw stdout, stderr and source snapshots`, () => {
    const record = json(`evidence\\red\\${name}.json`);
    assert.equal(record.exitCode, 1);
    assert.equal(record.cardId, 'A-S121');
    const stdout = fs.readFileSync(path.join(evidence.ROOT, 'evidence', 'red', `${name}.stdout.raw`));
    const stderr = fs.readFileSync(path.join(evidence.ROOT, 'evidence', 'red', `${name}.stderr.raw`));
    assert.equal(evidence.sha256(stdout), record.stdoutSha256);
    assert.equal(evidence.sha256(stderr), record.stderrSha256);
    assert.match(Buffer.concat([stdout, stderr]).toString('utf8'), /ERR_ASSERTION/);
    for (const [file, expected] of Object.entries(record.snapshots)) {
      assert.ok(file.endsWith('.snapshot'));
      const bytes = fs.readFileSync(path.join(evidence.ROOT, 'evidence', 'red', file));
      assert.equal(evidence.sha256(bytes), expected.rawSha256, file);
      assert.equal(bytes.length, expected.byteLength, file);
    }
    assert.equal(evidence.listFiles(path.join(evidence.ROOT, 'evidence', 'red'))
      .filter((file) => /\.(?:test|spec)\.(?:cjs|js)$/.test(file)).length, 0);
  });
}

test('preserved original stub is loadable and really lacks the prepared behavior', () => {
  const context = { module: { exports: {} } };
  vm.runInNewContext(read('evidence\\red\\model-model.js.snapshot'), context);
  const stub = context.module.exports;
  assert.equal(typeof stub.create, 'function');
  assert.equal(typeof stub.step, 'function');
  const configured = stub.step(stub.create(), {
    kind: 'configure', fixture: 'ready', target: 'production', acknowledged: true,
  });
  assert.equal(stub.step(configured, { kind: 'inspect' }).phase, 'stub');
  assert.match(read('evidence\\red\\model.stdout.raw'), /prepared/);
  assert.match(read('evidence\\red\\browser.stdout.raw'), /stub/);
  assert.match(read('evidence\\red\\retained-reset.stdout.raw'), /reset must restore current state/);
});

test('standalone HTML has exact banner, local external assets and deny-by-default CSP', () => {
  const html = read('index.html');
  assert.ok(html.includes(`<p id="training-banner" class="banner">${lesson.BANNER}</p>`));
  assert.equal((html.match(/<script\b/g) || []).length, 2);
  assert.ok(html.includes('<script src="model.js" defer></script>'));
  assert.ok(html.includes('<script src="app.js" defer></script>'));
  assert.ok(html.includes('<link rel="stylesheet" href="styles.css">'));
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "img-src 'none'", "object-src 'none'", "frame-src 'none'",
    "worker-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
    assert.ok(html.includes(directive), directive);
  }
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|<script(?![^>]*\bsrc=)|\sonclick=|\sstyle=/);
  assert.doesNotMatch(read('app.js') + read('model.js'), /\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage/);
});

test('keyboard labels, unique IDs, errors and native non-shadowed reset are present', () => {
  const html = read('index.html');
  const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), (match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['fixture', 'target', 'synthetic-ack']) assert.ok(html.includes(`for="${id}"`));
  assert.ok(html.includes('id="input-error" role="alert" tabindex="-1"'));
  assert.ok(html.includes('id="action-status" role="status" aria-live="polite"'));
  assert.doesNotMatch(html, /\b(?:id|name)="reset"/);
  assert.ok(read('app.js').includes('form.reset()'));
  assert.ok(read('app.js').includes("model.step(state, { kind: 'reset' })"));
  assert.ok(read('styles.css').includes(':focus-visible'));
  assert.ok(read('styles.css').includes('[aria-invalid="true"]'));
});

test('published helper and actual fixture constants match the declared teaching contract', () => {
  const manifest = json('manifest.json');
  assert.equal(evidence.sha256(fs.readFileSync(path.join(evidence.REPO,
    'testing', 'browser', 'isolated.cjs'))), evidence.HELPER_SHA256);
  assert.deepEqual(manifest.syntheticInputs.fixtureIds, lesson.FIXTURES.map((entry) => entry.id));
  assert.equal(manifest.syntheticInputs.maxAcceptedActions, lesson.ENVELOPE.maxActions);
  assert.equal(manifest.syntheticInputs.readinessBudgetMs, lesson.ENVELOPE.readinessBudgetMs);
  assert.equal(manifest.syntheticInputs.journeyBudgetMs, lesson.ENVELOPE.journeyBudgetMs);
  assert.equal(manifest.syntheticInputs.sku, lesson.ENVELOPE.sku);
  assert.deepEqual(manifest.syntheticInputs.acceptableStatuses, lesson.ENVELOPE.acceptableStatuses);
  assert.ok(manifest.limits.some((value) => value.includes('inactive prototype unqualified')));
});

test('raw SHA256/byte lengths and canonical Git IDs stay separate and match every bound source', () => {
  const integrity = json('evidence\\integrity.json');
  assert.equal(integrity.rawAndCanonicalAreSeparate, true);
  assert.deepEqual(Object.keys(integrity.sources).sort(), evidence.sourceFiles(false));
  for (const [relative, expected] of Object.entries(integrity.sources)) {
    const full = path.join(evidence.ROOT, relative);
    const bytes = fs.readFileSync(full);
    assert.equal(evidence.sha256(bytes), expected.rawSha256, relative);
    assert.equal(bytes.length, expected.byteLength, relative);
    assert.equal(evidence.rawGitBlob(bytes), expected.rawGitBlobSha1, relative);
    assert.equal(evidence.git(['hash-object', `--path=${evidence.gitLogicalPath(full)}`, full]),
      expected.canonicalGitBlobSha1, relative);
    assert.equal(expected.crlfPairs, (bytes.toString('utf8').match(/\r\n/g) || []).length, relative);
    assert.match(expected.attributes, /: text: unset/);
    assert.equal(expected.canonicalGitBlobSha1, expected.rawGitBlobSha1);
    assert.match(expected.attributes, /: whitespace: blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol/);
    if (relative.endsWith('.raw')) assert.match(expected.attributes, /: diff: unset/);
  }
});

test('pre-pinning failed LF assumption and original raw sources remain preserved, not rewritten', () => {
  const current = json('evidence\\integrity.json');
  const proof = current.prePinning;
  const oldBytes = fs.readFileSync(path.join(evidence.ROOT, proof.integrity));
  assert.equal(evidence.sha256(oldBytes), proof.integritySha256);
  const old = JSON.parse(oldBytes.toString('utf8'));
  assert.ok(old.sources['README.txt'].crlfPairs > 0);
  assert.notEqual(old.sources['README.txt'].rawGitBlobSha1, old.sources['README.txt'].canonicalGitBlobSha1);
  assert.equal(proof.priorCanonicalPathQualified, false);
  const archiveBytes = fs.readFileSync(path.join(evidence.ROOT, proof.archive));
  assert.equal(evidence.sha256(archiveBytes), proof.archiveSha256);
  const archive = JSON.parse(zlib.gunzipSync(archiveBytes).toString('utf8'));
  for (const [relative, expected] of Object.entries(old.sources)) {
    const bytes = Buffer.from(archive.files[relative].base64, 'base64');
    assert.equal(evidence.sha256(bytes), expected.rawSha256, relative);
  }
  const failed = json(proof.failedRun);
  assert.equal(failed.exitCode, 1);
  assert.equal(failed.failed, 1);
  assert.equal(failed.normalVerificationReadOnly, true);
});

test('Windows filesystem paths and Git logical --path grammar are independently qualified', () => {
  const current = json('evidence\\integrity.json');
  const proof = current.gitPathRepair;
  assert.equal(proof.priorCanonicalPathQualified, false);
  const bytes = fs.readFileSync(path.join(evidence.ROOT, proof.integrity));
  assert.equal(evidence.sha256(bytes), proof.integritySha256);
  const archiveBytes = fs.readFileSync(path.join(evidence.ROOT, proof.archive));
  assert.equal(evidence.sha256(archiveBytes), proof.archiveSha256);
  const archive = JSON.parse(zlib.gunzipSync(archiveBytes).toString('utf8'));
  const old = JSON.parse(bytes.toString('utf8'));
  for (const [relative, expected] of Object.entries(old.sources)) {
    assert.equal(evidence.sha256(Buffer.from(archive.files[relative].base64, 'base64')),
      expected.rawSha256, relative);
  }
  assert.equal(json(proof.failedRun).exitCode, 1);
  const full = path.join(evidence.ROOT, 'model.js');
  const logical = evidence.gitLogicalPath(full);
  assert.equal(logical, 'learning/S121/model.js');
  assert.equal(evidence.git(['hash-object', `--path=${logical}`, full]),
    evidence.rawGitBlob(fs.readFileSync(full)));
});

test('failed automation-context CSP assertion remains separate from page-owned click proof', () => {
  const proof = json('evidence\\integrity.json').pageOwnedCspRepair;
  assert.equal(proof.automationEvalContextQualified, false);
  const oldBytes = fs.readFileSync(path.join(evidence.ROOT, proof.integrity));
  assert.equal(evidence.sha256(oldBytes), proof.integritySha256);
  const archiveBytes = fs.readFileSync(path.join(evidence.ROOT, proof.archive));
  assert.equal(evidence.sha256(archiveBytes), proof.archiveSha256);
  const archive = JSON.parse(zlib.gunzipSync(archiveBytes).toString('utf8'));
  for (const [relative, expected] of Object.entries(JSON.parse(oldBytes.toString('utf8')).sources)) {
    assert.equal(evidence.sha256(Buffer.from(archive.files[relative].base64, 'base64')),
      expected.rawSha256, relative);
  }
  assert.equal(json(proof.failedRun).exitCode, 1);
  assert.match(read('evidence\\raw\\browser.stdout.raw'), /Actual CSP did not block evalBlocked/);
  assert.ok(read('scripts\\csp-probe.js').includes("launcher.addEventListener('click'"));
  assert.ok(read('tests\\browser.test.cjs').includes("page.locator('#run-csp-probe').click()"));
  assert.doesNotMatch(read('tests\\browser.test.cjs'),
    /page\.evaluate\(\(\) => globalThis\.runS121CspProbe\(\)\)/);
});

test('precise raw-log diff policy preserves Node assertion whitespace and the prior real-browser observation', () => {
  const proof = json('evidence\\integrity.json').rawLogDiffPolicy;
  assert.equal(proof.noRawProofRewritten, true);
  const oldBytes = fs.readFileSync(path.join(evidence.ROOT, proof.integrity));
  assert.equal(evidence.sha256(oldBytes), proof.integritySha256);
  const archiveBytes = fs.readFileSync(path.join(evidence.ROOT, proof.archive));
  assert.equal(evidence.sha256(archiveBytes), proof.archiveSha256);
  const archive = JSON.parse(zlib.gunzipSync(archiveBytes).toString('utf8'));
  for (const [relative, expected] of Object.entries(JSON.parse(oldBytes.toString('utf8')).sources)) {
    assert.equal(evidence.sha256(Buffer.from(archive.files[relative].base64, 'base64')),
      expected.rawSha256, relative);
  }
  const prior = json(proof.priorBrowserObservation);
  assert.equal(evidence.sha256(fs.readFileSync(path.join(evidence.ROOT, proof.priorBrowserObservation))),
    proof.priorBrowserObservationSha256);
  assert.equal(evidence.sha256(fs.readFileSync(path.join(evidence.ROOT, 'evidence', 'browser', prior.sourceArchive))),
    prior.sourceArchiveSha256);
  assert.equal(prior.groups.length, 18);
  assert.ok(prior.groups.every((entry) => entry.passed));
  assert.equal(prior.nativeClaim, false);
  assert.ok(read('.gitattributes').includes('evidence/red/*.raw -diff'));
  assert.ok(read('.gitattributes').includes('evidence/raw/*.raw -diff'));
  assert.match(read('evidence\\red\\model.stdout.raw'), /[ \t]+\r?$/m);
});

test('actual staged CRLF failure is preserved and exact path attributes retain other whitespace checks', () => {
  const proof = json('evidence\\integrity.json').stagedWhitespaceRepair;
  assert.equal(proof.noIndexProbeQualified, false);
  const oldBytes = fs.readFileSync(path.join(evidence.ROOT, proof.integrity));
  assert.equal(evidence.sha256(oldBytes), proof.integritySha256);
  const archiveBytes = fs.readFileSync(path.join(evidence.ROOT, proof.archive));
  assert.equal(evidence.sha256(archiveBytes), proof.archiveSha256);
  const archive = JSON.parse(zlib.gunzipSync(archiveBytes).toString('utf8'));
  for (const [relative, expected] of Object.entries(JSON.parse(oldBytes.toString('utf8')).sources)) {
    assert.equal(evidence.sha256(Buffer.from(archive.files[relative].base64, 'base64')),
      expected.rawSha256, relative);
  }
  const failed = json(proof.failedCheck);
  assert.equal(failed.exitCode, 2);
  assert.equal(failed.readOnly, true);
  const stdout = fs.readFileSync(path.join(evidence.ROOT, 'evidence', 'raw', 'staged-whitespace.stdout.raw'));
  assert.equal(evidence.sha256(stdout), failed.stdoutSha256);
  assert.match(stdout.toString('utf8'), /trailing whitespace/);
  assert.equal(evidence.sha256(fs.readFileSync(path.join(evidence.ROOT, proof.priorBrowserObservation))),
    proof.priorBrowserObservationSha256);
  assert.ok(read('.gitattributes').includes('evidence/red/*.snapshot -diff'));
});

test('capture gate is exact and all verification helpers read owned files without writing them', () => {
  assert.equal(evidence.captureRequested('1'), true);
  for (const value of [undefined, null, true, 1, 'true', '01', '1 ', 'yes', '0']) {
    assert.equal(evidence.captureRequested(value), false);
  }
  const before = evidence.treeHashes();
  evidence.sourceHashes();
  evidence.sourceBytes();
  assert.deepEqual(evidence.treeHashes(), before);
  const attributes = read('.gitattributes');
  for (const line of ['evidence/red/** -text', 'evidence/raw/** -text', 'evidence/browser/** -text']) {
    assert.ok(attributes.includes(line));
  }
});
