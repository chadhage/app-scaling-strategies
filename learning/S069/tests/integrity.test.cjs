'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const bytes = (file) => fs.readFileSync(path.join(root, file));
const text = (file) => bytes(file).toString('utf8');
const json = (file) => JSON.parse(text(file));
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const canonical = (value) => Buffer.from(value.toString('utf8').replace(/\r\n/g, '\n'));
function git(args, input) {
  const result = spawnSync('git', ['--no-pager', ...args], { cwd: repo, input });
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout;
}
function exactAcceptance(readme, backlog, kanban) {
  function row(source, id) {
    const matches = source.split(/\r?\n/).filter((line) => line.startsWith(`| ${id} |`));
    assert.equal(matches.length, 1, id);
    return matches[0];
  }
  function section(source, start, end) {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from);
    return source.slice(from, to).replace(/\r\n/g, '\n').trimEnd();
  }
  return {
    readmeS069: row(readme, 'S069'), backlogDS069: row(backlog, 'D-S069'),
    cardAS069: row(kanban, 'A-S069'), siblingBS069: row(kanban, 'B-S069'),
    atomic: section(kanban, '## Atomic card contract', '### Portable A-card lesson contract'),
    portable: section(kanban, '### Portable A-card lesson contract', '## Concurrent pull and one-piece flow'),
    packetPolicy: kanban.split(/\r?\n/).find((line) => line.startsWith('Packet membership is fixed before admission.')),
    sourceEvidencePolicy: section(readme, '## Acceptance and evidence', '## Recommended demonstration sequence'),
  };
}
function blobId(value) {
  return crypto.createHash('sha1').update(Buffer.from(`blob ${value.length}\0`)).update(value).digest('hex');
}
function canonicalGitMatches(file, expected) {
  const relative = `learning/S069/${file.replace(/\\/g, '/')}`;
  assert.equal(git(['hash-object', '--stdin', `--path=${relative}`], bytes(file)).toString().trim(), blobId(expected), relative);
  const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '--', relative], { cwd: repo });
  if (tracked.status === 0) assert.deepEqual(git(['show', `HEAD:${relative}`]), expected, 'Published Git bytes must agree with their explicit canonical/raw policy.');
}

test('exact source acceptance matches raw working provenance, declared Git baseline and current authoritative clauses', () => {
  const source = json('evidence\\source-contract.json');
  assert.equal(source.cardId, 'A-S069');
  assert.equal(source.parentId, 'D-S069');
  assert.equal(source.kanoUnit, 'A-S069');
  assert.equal(source.packet, 'SC-S069');
  assert.equal(source.sourceReadBeforeBehaviorDesign, true);
  assert.equal(source.acceptanceEqualsBaseline, true);
  assert.equal(source.nativeAcceptanceNotCompleted, true);
  assert.equal(source.sources.length, 3);
  const working = [];
  const baseline = [];
  const current = [];
  for (const item of source.sources) {
    const raw = bytes(item.workingSnapshot);
    const committed = bytes(item.gitSnapshot);
    assert.equal(raw.length, item.workingBytes);
    assert.equal(sha(raw), item.workingSha256);
    assert.equal(sha(canonical(raw)), item.workingCanonicalSha256);
    assert.equal(sha(committed), item.gitSha256);
    assert.equal(raw.includes(Buffer.from('\r\n')), item.workingContainsCRLF);
    assert.equal(canonical(raw).equals(committed), item.fullCanonicalEqualsBaseline);
    assert.deepEqual(git(['show', `${source.baseline}:${item.path.replace(/\\/g, '/')}`]), committed);
    working.push(raw.toString());
    baseline.push(committed.toString());
    current.push(fs.readFileSync(path.join(repo, item.path), 'utf8'));
    canonicalGitMatches(item.workingSnapshot, raw);
    canonicalGitMatches(item.gitSnapshot, committed);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(exactAcceptance(...working))), source.acceptance);
  assert.deepEqual(JSON.parse(JSON.stringify(exactAcceptance(...baseline))), source.acceptance);
  assert.deepEqual(JSON.parse(JSON.stringify(exactAcceptance(...current))), source.acceptance);
  assert.match(source.acceptance.readmeS069, /Fence the previous writer before accepting writes through the replacement/);
  assert.match(source.acceptance.backlogDS069, /Only the authorized epoch writes; stale writers are rejected and acknowledged data is retained/);
});

test('genuine RED preserves a loadable stub, original BDD/assertions and twelve assertion failures, not missing code/tools', () => {
  const red = json('evidence\\red\\run.json');
  assert.equal(red.exitCode, 1);
  assert.equal(red.tests, 13);
  assert.equal(red.pass, 1);
  assert.equal(red.fail, 12);
  assert.equal(red.assertionFailures, 12);
  assert.equal(red.missingCodeOrTools, false);
  assert.equal(red.spawnError, null);
  for (const item of red.snapshots) {
    assert.ok(item.snapshot.endsWith('.snapshot'));
    assert.doesNotMatch(item.snapshot, /\.test\.(?:cjs|js)$/);
    const file = `evidence\\red\\${item.snapshot}`;
    const raw = bytes(file);
    assert.equal(raw.length, item.bytes);
    assert.equal(sha(raw), item.sha256);
    assert.equal(sha(canonical(raw)), item.canonicalSha256);
    canonicalGitMatches(file, raw);
    if (item.source !== 'model.js') assert.deepEqual(canonical(bytes(item.source)), canonical(raw), 'Original BDD/model assertions remain unchanged after RED.');
  }
  const output = bytes(red.rawStdout);
  const errors = bytes(red.rawStderr);
  assert.equal(sha(output), red.rawStdoutSha256);
  assert.equal(sha(errors), red.rawStderrSha256);
  assert.match(output.toString(), /code: 'ERR_ASSERTION'/);
  assert.doesNotMatch(output.toString() + errors.toString(), /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError/);
  const moduleObject = { exports: {} };
  new vm.Script(text('evidence\\red\\model.js.snapshot')).runInNewContext({ module: moduleObject });
  const stub = moduleObject.exports.createLesson();
  assert.equal(stub.snapshot().phase, 'idle');
  for (const action of ['begin', 'transfer', 'probe', 'replay', 'verify', 'predict', 'next', 'reset']) assert.equal(typeof stub[action], 'function');
  assert.notEqual(sha(canonical(bytes('model.js'))), red.snapshots.find((item) => item.source === 'model.js').canonicalSha256);
});

test('resource-free IaC N/A follows actual RED and precedes the retained first model green command', () => {
  const red = json('evidence\\red\\run.json');
  const decision = json('evidence\\iac-decision.json');
  const green = json('evidence\\verification\\model-green.json');
  assert.equal(decision.status, 'N/A');
  assert.equal(decision.beforeBehaviorImplementation, true);
  assert.equal(decision.nativeEpochLeaseFencingConcurrentWriterProof, false);
  assert.ok(Date.parse(decision.decidedAtUtc) >= Date.parse(red.completedAtUtc));
  assert.ok(Date.parse(green.startedAtUtc) >= Date.parse(decision.decidedAtUtc));
  assert.equal(green.exitCode, 0);
  assert.equal(green.tests, 13);
  assert.equal(green.pass, 13);
  assert.equal(green.fail, 0);
  assert.equal(sha(bytes(green.rawStdout)), green.rawStdoutSha256);
  assert.equal(sha(bytes(green.rawStderr)), green.rawStderrSha256);
});

test('actual browser proof binds current canonical lesson sources to the exact qualified offline helper and signed Edge', () => {
  const proof = json('evidence\\browser.json');
  const tooling = json('evidence\\tooling.json');
  assert.equal(proof.cardId, 'A-S069');
  assert.equal(proof.outcome, 'PASS');
  assert.equal(proof.captureExplicitlyEnabled, true);
  assert.equal(proof.runtime, 'v22.23.4');
  assert.equal(proof.playwrightVersion, '1.56.1');
  assert.match(proof.browserVersion, /^156\./);
  assert.equal(proof.browserVersion, tooling.browserVersion);
  assert.equal(tooling.signatureStatus, 'Valid');
  assert.match(tooling.signer, /Microsoft Corporation/);
  for (const key of ['packagesInstalled', 'browserDownloaded', 'foregroundLease', 'unsafeFlags', 'abandonedLifecyclePrototypeQualified', 'productionNode24Certified']) {
    assert.equal(tooling[key], false, key);
  }
  const helperHash = sha(fs.readFileSync(path.join(repo, proof.helper.path)));
  assert.equal(helperHash, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(proof.helper.sha256, helperHash);
  assert.equal(tooling.helperSha256, helperHash);
  assert.equal(proof.helper.publication, '53c0c0d');
  assert.deepEqual(proof.pageErrors, []);
  assert.deepEqual(proof.consoleErrors.filter((entry) => entry.stage === 'exercise'), []);
  assert.deepEqual(proof.exerciseNetworkRequests, []);
  assert.deepEqual(proof.probeResponses, []);
  assert.equal(proof.cleanup.closeAwaited, true);
  assert.equal(proof.cleanup.closed, true);
  assert.equal(proof.narrowViewport.bodyOverflow, false);
  assert.equal(proof.narrowViewport.visibleKeyboardFocus, true);
  assert.equal(proof.csp.inlineRan, false);
  assert.equal(proof.csp.connection, 'TypeError');
  assert.ok(proof.csp.violations.some((entry) => entry.directive === 'connect-src'));
  assert.ok(proof.csp.violations.some((entry) => entry.directive.startsWith('script-src')));
  for (const term of ['confirmed fencing PASS', 'unsafe competing writers FAIL', 'unavailable authority UNKNOWN', 'lost acknowledged SYN-692 FAIL', 'six-proof hard cap', 'invalid authority', 'invalid retention', 'all six phases reset']) {
    assert.ok(proof.observations.some((entry) => entry.name.includes(term)), term);
  }
  for (const [file, hash] of Object.entries(proof.testedSourceHashes)) {
    const expected = canonical(bytes(file));
    assert.equal(sha(expected), hash, `${file}: recorded browser source is canonical LF, not mutable raw-CRLF equivalence.`);
    canonicalGitMatches(file, expected);
  }
  assert.equal(proof.screenshots.length, 2);
  for (const screenshot of proof.screenshots) {
    assert.equal(sha(bytes(screenshot.file)), screenshot.sha256);
    assert.deepEqual(bytes(screenshot.file).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    canonicalGitMatches(screenshot.file, bytes(screenshot.file));
  }
});

test('raw evidence remains non-normalized while normal verification and RED snapshots remain non-destructive', () => {
  const attributes = text('.gitattributes').trim().split(/\r?\n/);
  assert.deepEqual(attributes, ['evidence/raw/** -text -diff', 'evidence/red/*.snapshot -text -diff', 'evidence/*.png -text -diff']);
  const raw = bytes('evidence\\raw\\source-1.working.snapshot');
  assert.equal(raw.includes(Buffer.from('\r\n')), true, 'Preserve the original Windows source bytes.');
  const attr = git(['check-attr', 'text', 'diff', '--', 'learning\\S069\\evidence\\raw\\source-1.working.snapshot']).toString();
  assert.match(attr, /text: unset/);
  assert.match(attr, /diff: unset/);
  for (const file of fs.readdirSync(path.join(root, 'evidence', 'raw'))) {
    const relative = `evidence\\raw\\${file}`;
    canonicalGitMatches(relative, bytes(relative));
  }
  const browserTest = text('tests\\browser.test.cjs');
  assert.match(browserTest, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(browserTest, /if \(capture\)/);
  assert.match(browserTest, /await session\.close\(\)/);
  assert.match(browserTest, /finally/);
  assert.match(browserTest, /assert\.deepEqual\(evidenceInventory\(\), before/);
  assert.doesNotMatch(browserTest, /lifecycle|openIsolatedLoopback|--no-sandbox|ignoreHTTPSErrors|bypassCSP/);
  assert.doesNotMatch(text('tests\\model.test.cjs') + text('tests\\surface.test.cjs'), /writeFile|appendFile|mkdirSync/);
});
