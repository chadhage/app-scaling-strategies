'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { allowlist } = require('../scripts/native.cjs');
const { verifyPackages } = require('../scripts/pins.cjs');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = bytes => Buffer.from(bytes.toString().replace(/\r\n/g, '\n'));
const read = file => fs.readFileSync(path.join(root, file));
const load = file => JSON.parse(read(`evidence\\${file}`));

function raw(descriptor) {
  const bytes = fs.readFileSync(path.join(evidence, descriptor.path));
  assert.equal(bytes.length, descriptor.bytes);
  assert.equal(hash(bytes), descriptor.sha256);
  assert.equal((bytes.toString().match(/\r\n/g) || []).length, descriptor.crlf);
  return bytes;
}
function git(args, input) {
  const result = spawnSync('git', ['--no-pager', ...args], { cwd: repo, input, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout;
}
function latestPassed() {
  const names = fs.readdirSync(evidence).filter(file => /^browser-native-.*\.json$/.test(file)).sort();
  const records = names.map(file => ({ file, report: load(file) }));
  const passed = records.filter(entry => entry.report.status === 'passed');
  assert.ok(passed.length >= 1, 'Real native proof must exist; no model-only completion');
  return { ...passed.at(-1), records };
}

test('exact S107 source rows, original acceptance, portable contract and packet retain independent raw CRLF and canonical Git identity', () => {
  const source = load('source-contract.json');
  assert.equal(source.cardId, 'A-S107');
  assert.equal(source.owner, 'worker-A-S107');
  assert.equal(source.kanoUnit, 'A-S107');
  assert.equal(source.kano, 'S');
  assert.equal(source.packet, 'SC-S107');
  assert.equal(source.readBeforeDesign, true);
  const texts = {};
  for (const entry of source.entries) {
    const working = raw(entry.rawWorking);
    const canonicalGit = raw(entry.canonicalGit);
    assert.ok(entry.rawWorking.crlf > 0, 'Windows source raw CRLF must not be relabeled canonical LF');
    assert.equal(entry.canonicalGit.crlf, 0);
    assert.notEqual(entry.rawWorking.sha256, entry.canonicalGit.sha256);
    assert.deepEqual(canonical(working), canonicalGit);
    const blob = git(['cat-file', 'blob', entry.gitBlob]);
    assert.ok(blob.includes(canonicalGit), 'Exact canonical excerpt belongs to its independently pinned Git blob');
    texts[entry.name] = canonicalGit.toString();
  }
  assert.match(texts.readme, /CORS differences:\*\* Preserve browser access for existing origins throughout migration/);
  assert.match(texts.backlog, /two owned browser origins and compatible\/incompatible CORS transitions/);
  assert.match(texts.backlog, /Real browser enforcement is measured; valid existing origins continue, and denied access is not bypassed/);
  assert.match(texts['a-card'], /identify real browser enforcement without bypassing denials/);
  assert.match(texts['b-card'], /Conduct one two-origin browser transition/);
  assert.match(texts.portable, /standalone, browser-openable lesson bundle/);
  assert.match(texts.packet, /every other A\/B card belongs to SC-Snnn/);
  assert.equal(source.helper.rawWorking.sha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.deepEqual(canonical(raw(source.helper.rawWorking)), raw(source.helper.canonicalGit));
  assert.deepEqual(raw(source.helper.canonicalGit),
    git(['show', `${source.helper.commit}:testing/browser/isolated.cjs`]));
});
test('original genuine assertion RED precedes IaC N/A and real browser implementation evidence', () => {
  const source = load('source-contract.json');
  const red = load('red.json');
  const iac = load('iac.json');
  const stdout = raw(red.stdout).toString();
  raw(red.stderr);
  assert.equal(red.exitCode, 1);
  assert.match(stdout, /ERR_ASSERTION/);
  assert.match(stdout, /0 !== 1/);
  assert.match(stdout, /# fail 4/);
  assert.doesNotMatch(stdout, /MODULE_NOT_FOUND|SyntaxError|ENOENT/);
  assert.match(read('evidence\\raw\\red-model.stub.snapshot').toString(), /function transition\(state\)/);
  assert.match(read('evidence\\raw\\red-model.assertions.snapshot').toString(), /loadable baseline retains an attempted rehearsal/);
  assert.ok(Date.parse(source.capturedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(red.finishedAtUtc) <= Date.parse(iac.recordedAtUtc));
  assert.equal(iac.applicability, 'N/A');
  assert.ok(Date.parse(iac.recordedAtUtc) < Date.parse(latestPassed().report.startedAtUtc));
});
test('native proof has actual two-origin HTTP allow/deny receipts, browser diagnostics, recovery and no CSP/network substitute', () => {
  const { report } = latestPassed();
  const proof = JSON.parse(raw(report.raw));
  assert.equal(report.nativeBrowserCORSMeasured, true);
  assert.equal(proof.noRoutingInterception, true);
  assert.equal(proof.deniedPayloadBypassed, false);
  assert.equal(proof.nativeAzureCertified, false);
  assert.equal(proof.broaderLifecycleQualified, false);
  assert.equal(proof.steps.length, 26);
  assert.equal(proof.wireReceipts.length, 8);
  assert.equal(new Set(Object.values(proof.origins)).size, 3);
  for (const origin of Object.values(proof.origins)) assert.match(origin, /^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/);
  for (const label of ['A', 'B']) {
    for (const policy of ['baseline', 'compatible']) {
      const receipt = proof.wireReceipts.find(entry => entry.request.origin === proof.origins[label]
        && entry.receipt.policy === policy);
      assert.equal(receipt.request.remoteAddress, '127.0.0.1');
      assert.equal(receipt.response.status, 200);
      assert.equal(receipt.response.headers['access-control-allow-origin'], proof.origins[label]);
    }
  }
  const denial = proof.nativeCORS.deniedRequest;
  assert.equal(denial.request.origin, proof.origins.B);
  assert.equal(denial.response.status, 200);
  assert.equal(denial.response.finished, true);
  assert.equal(denial.response.headers['access-control-allow-origin'], undefined);
  assert.equal(denial.response.headers['access-control-allow-credentials'], undefined);
  const trace = JSON.parse(proof.nativeCORS.deniedBrowserDOM.trace);
  assert.equal(trace.cors, 'cors-denied');
  assert.equal(trace.userImpact, 'interrupted');
  assert.equal(trace.verifier, 'pass');
  assert.equal(trace.observation.cspBlocked, false);
  assert.equal(trace.observation.payloadVerified, false);
  assert.equal(trace.actualBrowserCORS, false);
  assert.ok(proof.events.console.some(event => /blocked by CORS policy/i.test(event.text)
    && event.text.includes(`${proof.origins.api}/profile?policy=incompatible&attempt=3`)
    && event.text.includes(proof.origins.B)));
  const recovery = proof.steps.find(step => /B compatible recovery/.test(step.label));
  assert.equal(recovery.dom.userImpact, 'preserved');
  assert.equal(recovery.dom.journal[2].userImpact, 'interrupted');
  const failedNetwork = proof.steps.find(step => /real transport refusal/.test(step.label));
  assert.equal(failedNetwork.dom.cors, 'unknown');
  assert.equal(JSON.parse(failedNetwork.dom.trace).observation.receipt, null);
  assert.deepEqual(proof.cspProbe, { connectResult: 'TypeError', otherOwnedRequestReachedServer: false, inlineExecuted: false });
  assert.notEqual(proof.freshnessProbe.previousRunId, proof.freshnessProbe.currentRunId);
  assert.equal(proof.freshnessProbe.previousDeniedReceiptRetained, true);
  assert.equal(proof.freshnessProbe.currentReceipt, null);
  assert.equal(proof.freshnessProbe.currentCORS, 'unknown');
  assert.equal(proof.freshnessProbe.currentBrowserNetworkFailure, 'ERR_CONNECTION_REFUSED');
  assert.deepEqual(proof.allowlistViolations, []);
  assert.deepEqual(proof.events.pageErrors, []);
  assert.equal(report.browserCleanup.processExited, true);
  assert.equal(report.browserCleanup.scratchRemoved, true);
  assert.equal(report.browserCleanup.forcedOwnedClose, false);
  assert.equal(report.fixtureCleanup.listenersClosed, true);
});
test('failed original browser/cleanup-unknown attempt is retained, and late cleanup does not promote it to passed', () => {
  const { records } = latestPassed();
  const failures = records.filter(entry => entry.report.status === 'failed');
  assert.ok(failures.length >= 1);
  const original = failures[0];
  raw(original.report.raw);
  assert.equal(original.report.nativeBrowserCORSMeasured, false);
  assert.equal(original.report.browserCleanup.processExited, false);
  assert.equal(original.report.browserCleanup.scratchRemoved, false);
  const followup = load('cleanup-first-followup.json');
  assert.equal(followup.originalAttempt, original.file);
  assert.equal(followup.originalFailurePreserved, true);
  assert.equal(followup.rootAndDirectChildrenRemaining, 0);
  assert.equal(followup.ownedCommandLineTokenProcessesRemaining, 0);
  assert.equal(followup.processesStoppedByThisFollowup, 0);
  assert.equal(followup.scratchRemoved, true);
  assert.equal(followup.broaderLifecycleQualified, false);
  assert.equal(fs.existsSync(path.join(root, original.report.browserCleanup.ownedScratch)), false);
});
test('exact approved cache digests and public installed package bytes remain verified with no install or fallback', () => {
  const packages = verifyPackages();
  assert.deepEqual(packages.map(pkg => [pkg.name, pkg.version, pkg.installedFilesVerified]),
    [['playwright', '1.56.1', 170], ['playwright-core', '1.56.1', 340]]);
  const { report } = latestPassed();
  const proof = JSON.parse(raw(report.raw));
  assert.equal(proof.tooling.edge.signatureStatus, 'Valid');
  assert.match(proof.tooling.edge.signer, /CN=Microsoft Corporation/);
  assert.equal(proof.tooling.edge.version, '156.0.4314.50');
  assert.equal(proof.tooling.installs, 0);
  assert.equal(proof.tooling.downloads, 0);
  assert.equal(proof.tooling.publicCacheReadOnly, true);
  assert.ok(raw(report.edgeStdout).includes(Buffer.from('Microsoft Corporation')));
  for (const value of [null, {}, 'http://127.0.0.1:80', { servers: [], origins: {} }]) {
    assert.throws(() => allowlist(value));
  }
});
test('published bundle byte index preserves all historical browser attempts and exact Git filtering with non-self-referential metadata', () => {
  const indexes = fs.readdirSync(evidence).filter(file => /^integrity(?:-.*)?\.json$/.test(file))
    .map(file => load(file)).sort((a, b) => Date.parse(a.capturedAtUtc) - Date.parse(b.capturedAtUtc));
  assert.ok(indexes.length > 0);
  const index = indexes.at(-1);
  assert.deepEqual(index.excluded.filter(file => !/^evidence\\integrity(?:-.*)?\.json$/.test(file)).sort(),
    ['evidence\\green.json', 'evidence\\raw\\green.stderr.snapshot', 'evidence\\raw\\green.stdout.snapshot'].sort());
  for (const previous of index.previousIndexes || []) {
    assert.deepEqual(raw(previous.raw), read(`evidence\\${previous.path}`));
  }
  for (const entry of index.files) {
    const bytes = read(entry.path);
    if (entry.path.startsWith(`evidence${path.sep}`)) {
      assert.equal(bytes.length, entry.bytes, entry.path);
      assert.equal(hash(bytes), entry.rawSHA256, entry.path);
    }
    assert.equal(hash(canonical(bytes)), entry.normalizedLfSHA256, entry.path);
    const gitPath = `learning/S107/${entry.path.split(path.sep).join('/')}`;
    assert.equal(git(['hash-object', '--path', gitPath, '--stdin'], bytes).toString().trim(),
      entry.gitFilteredBlobSHA1, entry.path);
  }
  function files(directory = root) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      assert.equal(entry.name.startsWith('.owned-browser-'), false, 'No owned browser scratch may remain');
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? files(file) : [path.relative(root, file)];
    });
  }
  assert.deepEqual(files().filter(file => !index.excluded.includes(file)).sort(), index.files.map(entry => entry.path).sort());
  const { report } = latestPassed();
  for (const snapshot of report.snapshots) {
    const bytes = raw(snapshot.raw);
    assert.equal(hash(canonical(bytes)), snapshot.canonicalSHA256);
    assert.deepEqual(canonical(bytes), canonical(read(snapshot.path)),
      `Latest empirical raw source and current canonical Git source agree independently: ${snapshot.path}`);
  }
});
test('the failed ordinary click rerun stays failed and is not relabeled by later proof or keyboard refinement', () => {
  const record = load('readonly-rerun-failure.json');
  assert.equal(record.status, 'failed');
  assert.equal(record.verificationMode, 'READ-ONLY');
  assert.equal(record.captureEnvironmentValue, 'true');
  assert.equal(record.nativeBrowserCORSMeasuredByThisRerun, false);
  assert.equal(record.ownedScratchRemainingAfterRerun, 0);
  assert.equal(record.originalHistoricalProofReplaced, false);
  assert.match(read(`evidence\\${record.availableEvidence}`).toString(), /Timeout 5000ms exceeded/);
  assert.match(record.byteQualification, /not an original byte-exact/);
});
test('publication preflight failure remains explicit and raw CRLF evidence is binary, never silently normalized', () => {
  const record = load('publication-preflight-failure.json');
  assert.equal(record.stage, 'git diff --cached --check');
  assert.equal(record.exitCode, 2);
  assert.equal(record.commitCreated, false);
  assert.equal(record.tagCreated, false);
  assert.equal(record.pushPerformed, false);
  assert.match(read('.gitattributes').toString(), /evidence\/\*\.json -text -diff/);
  assert.match(read('.gitattributes').toString(), /evidence\/raw\/\*\* -text -diff/);
  assert.match(read('evidence\\cleanup-first-followup.json').toString(), /\r\n/);
});
test('tightly coupled missing receipt-correlation behavior has a retained genuine assertion RED', () => {
  const names = fs.readdirSync(evidence).filter(file => /^correlation-red-.*\.json$/.test(file));
  assert.equal(names.length, 1);
  const record = load(names[0]);
  assert.equal(record.exitCode, 1);
  const stdout = raw(record.stdout).toString();
  assert.match(stdout, /ERR_ASSERTION/);
  assert.match(stdout, /undefined/);
  assert.doesNotMatch(stdout, /MODULE_NOT_FOUND|SyntaxError|ENOENT/);
});
test('exact capture flag is required and attempted ordinary source capture is read-only', () => {
  const source = read('evidence\\source-contract.json');
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'capture.cjs'), 'source'], {
    cwd: repo, timeout: 10000, env: { ...process.env, CAPTURE_BROWSER_EVIDENCE: 'true' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr.toString(), /exact CAPTURE_BROWSER_EVIDENCE=1/);
  assert.deepEqual(read('evidence\\source-contract.json'), source);
  assert.match(read('scripts\\browser.cjs').toString(), /CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(read('scripts\\browser.cjs').toString(), /Ordinary verification must preserve every bundle\/evidence byte/);
});
