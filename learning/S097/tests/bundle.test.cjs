'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..', '..');
const owned = (relative) => path.join(root, ...relative.split(/[\\/]/));
const read = (relative) => fs.readFileSync(owned(relative), 'utf8');
const json = (relative) => JSON.parse(read(relative));
const digest = (buffer) => createHash('sha256').update(buffer).digest('hex');
const canonical = (relative) => Buffer.from(read(relative).replace(/\r\n/g, '\n'));
const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';

function inventory(directory = root) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    assert.ok(!entry.isSymbolicLink(), 'Owned evidence cannot be a link');
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? inventory(target) : [path.relative(root, target)];
  }).sort();
}

test('manifest preserves the exact S097 source acceptance, single S unit and fixed LP-COMPARE packet', () => {
  const manifest = json('manifest.json');
  for (const [key, expected] of Object.entries({
    sourceId: 'S097', cardId: 'A-S097', parentId: 'D-S097', packet: 'LP-COMPARE',
    kano: 'S', kanoUnit: 'A-S097', owner: 'worker-A-S097', technicalEntryGate: 'SOURCE',
    entry: 'index.html', mode: 'synthetic',
    objective: 'Compare warm/cold rollback standby; detect a violated recovery promise.',
  })) assert.equal(manifest[key], expected);
  assert.equal(manifest.acceptance.acceptedAtUtc, null);
  assert.equal(manifest.syntheticInputs.maxAttempts, 6);
  assert.equal(manifest.syntheticInputs.coldExtraDelaySeconds, 16);
  assert.deepEqual(manifest.syntheticInputs.budgetsSeconds, [6, 24]);
  for (const relative of Object.values(manifest.evidence)) assert.ok(fs.existsSync(owned(relative)));
  const source = json('evidence\\source-contract.json');
  assert.equal(source.sources.length, 3);
  assert.deepEqual(source.sources.map((entry) => entry.exactRow), [
    '| S097 | **Rollback destination becomes cold:** Keep rollback capacity ready throughout its promised retention window. |',
    '| D-S097 | P0 | Add warm versus cold rollback standby during the retention window. | Ready retained capacity meets the promised recovery budget; cold recovery delays are explicit. | D-S001 |',
    '| A-S097 | D-S097 | S | Compare warm/cold rollback standby; detect a violated recovery promise. | SOURCE |',
  ]);
  assert.equal(source.packetDefinition, '| LP-COMPARE | X002 | A-S096, B-S096, A-S097, B-S097, A-S098, B-S098 |');
  assert.deepEqual(source.relatedAdmittedToDo, []);
  for (const entry of source.sources) {
    assert.match(entry.sourceCommit, /^[a-f0-9]{40}$/);
    assert.match(entry.blobOid, /^[a-f0-9]{40}$/);
    const gitPath = entry.path.split(/[\\/]/).join('/');
    const oid = execFileSync('git', ['rev-parse', `${entry.sourceCommit}:${gitPath}`], { cwd: repoRoot }).toString().trim();
    assert.equal(oid, entry.blobOid);
    const blob = execFileSync('git', ['cat-file', 'blob', oid], { cwd: repoRoot });
    assert.equal(digest(blob), entry.canonicalGitSha256);
    assert.deepEqual(fs.readFileSync(owned(path.join('evidence', entry.rawSnapshot))), blob);
    assert.ok(blob.toString('utf8').split(/\r?\n/).includes(entry.exactRow));
  }
  const packetSource = fs.readFileSync(owned(path.join('evidence', source.sources[2].rawSnapshot)), 'utf8');
  assert.ok(packetSource.includes(source.packetDefinition));
  assert.ok(packetSource.includes(source.portableContract.exactSection));
  assert.equal(digest(Buffer.from(source.portableContract.exactSection)), source.portableContract.sha256);
});

test('standalone assets, exact banner, labelled controls, safe reset and restrictive CSP are intact', () => {
  const html = read('index.html');
  assert.equal((html.match(/Training rehearsal - synthetic data - not a live Azure result/g) || []).length, 1);
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'"]) {
    assert.ok(policy.includes(directive));
  }
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|\*/);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((entry) => entry[1]), ['model.js', 'app.js']);
  assert.doesNotMatch(html, /\son\w+\s*=|<script(?! src=)|<iframe|https?:\/\//i);
  for (const id of ['fixture', 'budget', 'answer']) assert.ok(html.includes(`label for="${id}"`));
  assert.ok(html.includes('id="reset-rehearsal" type="button"'));
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(read('app.js'), /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.match(read('styles.css'), /:focus-visible/);
  for (const script of ['model.js', 'app.js']) {
    assert.doesNotMatch(read(script), /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|setTimeout|setInterval)\b|\bMath\.random\b|\bDate\b/);
    assert.doesNotMatch(read(script), /innerHTML|outerHTML|document\.write|eval\s*\(/);
  }
});

test('BDD and byte-preserved genuine RED precede explicit IaC N/A without auto-discovered snapshots', () => {
  const feature = read('standby-promise.feature');
  for (const phrase of ['Cold standby violates the promised recovery budget', 'A larger budget cannot repair a cold retention gap',
    'Missing evidence is unknown', 'History', 'Actual browser DOM, keyboard, errors, reset, failure and CSP',
    'CAPTURE_BROWSER_EVIDENCE=1']) assert.ok(feature.toLowerCase().includes(phrase.toLowerCase()));
  const red = json('evidence\\red.json');
  const iac = json('evidence\\iac-decision.json');
  assert.equal(red.exitCode, 1);
  assert.equal(red.archivedExitCode, 1);
  assert.equal(red.assertion.code, 'ERR_ASSERTION');
  assert.equal(red.assertion.actual, 'success');
  assert.equal(red.assertion.expected, 'failure');
  assert.equal(red.missingCodeOrToolFailure, false);
  assert.equal(red.autoDiscovered, false);
  for (const [field, hash] of [['stubSnapshot', 'stubSha256'], ['initialTestSnapshot', 'initialTestSha256'], ['rawTranscript', 'rawTranscriptSha256']]) {
    assert.equal(digest(fs.readFileSync(owned(path.join('evidence', red[field])))), red[hash]);
  }
  const transcript = fs.readFileSync(owned(path.join('evidence', red.rawTranscript)));
  assert.ok(transcript.includes(Buffer.from('\r\n')));
  assert.match(transcript.toString('utf8'), /ERR_ASSERTION/);
  assert.match(transcript.toString('utf8'), /actual: 'success'/);
  assert.match(transcript.toString('utf8'), /expected: 'failure'/);
  assert.doesNotMatch(transcript.toString('utf8'), /MODULE_NOT_FOUND|ENOENT|not recognized/);
  assert.match(read('evidence\\raw\\red-acceptance.assertion.cjs'), /assert\.equal\(observed\.acceptance, 'failure'\)/);
  assert.equal(iac.decision, 'N/A');
  assert.equal(iac.applicable, false);
  assert.ok(Date.parse(iac.recordedAtUtc) >= Date.parse(red.completedAtUtc));
  assert.equal(iac.extraCredit, 0);
  assert.match(read('.gitattributes'), /^evidence\/raw\/\*\* -text -diff$/m);
  assert.ok(inventory().filter((relative) => /^evidence[\\/]raw[\\/]/.test(relative))
    .every((relative) => !/\.test\.[cm]?js$|(^|[\\/])test-[^\\/]*\.[cm]?js$/.test(relative)));
});

test('captured actual browser checks and focused green qualify only the approved offline tooling pair', () => {
  const tooling = json('evidence\\tooling-preflight.json');
  const browser = json('evidence\\browser-acceptance.json');
  assert.equal(tooling.helper.sha256, helperHash);
  assert.equal(tooling.playwright, '1.56.1');
  assert.match(tooling.node, /^v22\./);
  assert.equal(tooling.browser.signatureStatus, 'Valid');
  assert.match(tooling.browser.signer, /Microsoft Corporation/);
  assert.match(tooling.browser.productVersion, /^156\./);
  assert.equal(tooling.installationOrDownload, false);
  assert.equal(tooling.unsafeFlags, false);
  assert.equal(browser.outcome, 'passed');
  assert.equal(browser.helper.sha256, helperHash);
  assert.equal(browser.helper.publishedCommit, tooling.helper.publishedCommit);
  assert.equal(browser.browserVersion, tooling.browser.productVersion);
  assert.equal(browser.playwright, '1.56.1');
  assert.equal(browser.actualHttpRequests, 0);
  assert.equal(browser.cleanup.awaitedFinallyClose, true);
  assert.equal(browser.cleanup.returned, true);
  assert.equal(browser.normalVerificationReadOnly, true);
  assert.equal(browser.captureWasExplicit, true);
  assert.equal(browser.abandonedPrototypeUsed, false);
  assert.equal(browser.acceptedAtUtc, null);
  assert.equal(browser.checks.length, 7);
  assert.ok(browser.checks.every((check) => check.passed));
  assert.equal(Object.keys(browser.sourceCanonicalSha256).length, 11);
  for (const [relative, hash] of Object.entries(browser.sourceCanonicalSha256)) {
    assert.equal(digest(canonical(relative)), hash, `Browser evidence source differs: ${relative}`);
  }
  const raw = json(path.join('evidence', browser.rawDom));
  assert.ok(raw.observations.some((item) => item.label === 'cold-6-second-promise-failure' && item.current.acceptance === 'failure'));
  assert.ok(raw.observations.some((item) => item.label === 'later-warm-success-retains-failures' && item.totals.failure === '3'));
  assert.ok(raw.observations.some((item) => item.label === 'unknown-selected-evidence-not-reference-success' && item.current.acceptance === 'unknown'));
  assert.ok(raw.observations.some((item) => item.label === 'full-session-reset-retains-every-outcome'
    && item.totals.attempted === '6' && item.totals.failure === '4' && item.totals.unknown === '1'));
  assert.ok(raw.observations.some((item) => item.label === 'actual-inline-csp-refusal' && item.executed === false));
  const focused = json('evidence\\focused-green.json');
  assert.equal(focused.exitCode, 0);
  assert.equal(focused.modelTests, 14);
  assert.equal(focused.syntax.exitCode, 0);
  assert.equal(focused.extraCredit, 0);
});

test('normal test verification cannot automatically replace evidence or source-integrity baselines', () => {
  const browser = read('tests\\browser.test.cjs');
  assert.match(browser, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(browser, /finally \{\s*await session\.close\(\)/);
  assert.match(browser, /assert\.deepEqual\(snapshot\(\), before/);
  assert.match(browser, /if \(capture\) \{/);
  assert.doesNotMatch(browser, /writeFileSync\([^\n]*(?:content-index|focused-green|source-contract)/);
  assert.doesNotMatch(read('tests\\model.test.cjs'), /writeFile|appendFile|unlink|rmSync/);
});

test('all owned files match canonical Git text or byte-preserved raw evidence with no silent omissions', () => {
  const index = json('evidence\\content-index.json');
  assert.equal(index.schemaVersion, 1);
  assert.equal(index.cardId, 'A-S097');
  assert.deepEqual(index.excluded, [path.join('evidence', 'content-index.json')]);
  const files = inventory().filter((relative) => !index.excluded.includes(relative));
  assert.deepEqual(index.entries.map((entry) => entry.path).sort(), files);
  for (const entry of index.entries) {
    const raw = /^evidence[\\/]raw[\\/]/.test(entry.path);
    assert.equal(entry.mode, raw ? 'raw-bytes' : 'git-canonical-lf');
    assert.equal(digest(raw ? fs.readFileSync(owned(entry.path)) : canonical(entry.path)), entry.sha256,
      `Owned integrity differs: ${entry.path}`);
  }
});
