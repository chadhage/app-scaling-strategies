'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { gunzipSync } = require('node:zlib');
const trace = require('..\\trace.js');
const { hash, normalize, pins } = require('..\\pins.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const manifest = require('..\\evidence-index.json');
function own(relative) {
  const file = path.resolve(repository, relative);
  assert.ok(file.startsWith(`${root}${path.sep}`));
  assert.equal(fs.realpathSync(file), file);
  const stat = fs.lstatSync(file);
  assert.equal(stat.isFile(), true);
  assert.equal(stat.nlink, 1);
  return fs.readFileSync(file);
}
const json = (relative) => JSON.parse(own(relative).toString('utf8'));
const seal = json(manifest.seal.path);
test('one original C034 S and all source, raw evidence and seal bytes remain exact, not regenerated', () => {
  assert.equal(manifest.cardId, 'C034');
  assert.equal(manifest.frozenKanoClass, 'S');
  assert.equal(manifest.packet, 'LP-REPLAY');
  assert.equal(manifest.maximumOriginalUnits, 1);
  assert.equal(manifest.testsRepairsProofRefinementExtraCredits, 0);
  assert.equal(manifest.parentAloneAccepts, true);
  assert.equal(manifest.H006Complete, false);
  assert.equal(manifest.H007Complete, false);
  assert.deepEqual(manifest.acceptedReadOnlyPrerequisites, pins.accepted);
  assert.equal(hash(own(manifest.seal.path)), manifest.seal.rawSha256);
  for (const entry of [...seal.sourceHashes, ...seal.evidenceHashes]) {
    const raw = own(entry.path);
    assert.equal(hash(raw), entry.rawSha256, entry.path);
    if (entry.crlfToLfSha256) assert.equal(hash(normalize(raw)), entry.crlfToLfSha256, `Separate LF bytes: ${entry.path}`);
  }
});

test('BDD, loadable stub, authentic wrong-order assertion RED and IaC N/A precede actual implementation proof', () => {
  const stages = Object.fromEntries(Object.entries(manifest.workflow).map(([stage, file]) => [stage, json(file)]));
  for (const [before, after] of [['bdd', 'stub'], ['stub', 'red'], ['red', 'iac'], ['iac', 'trace'],
    ['trace', 'focused'], ['focused', 'syntax'], ['syntax', 'browser']]) {
    assert.ok(stages[before].completedAtUtc < stages[after].startedAtUtc, `${before} must actually precede ${after}`);
  }
  assert.equal(stages.red.exitCode, 1);
  const red = gunzipSync(own(stages.red.stdout)).toString('utf8');
  assert.equal((red.match(/name: 'AssertionError'/g) || []).length, 1);
  assert.match(red, /acknowledgment before the actual request/);
  assert.doesNotMatch(red, /Cannot find module|SyntaxError/);
  for (const name of ['trace.stub.cjs', 'trace.initial.snapshot.cjs']) {
    const relative = path.join('capability', 'C034', 'evidence', 'red', name);
    assert.equal(stages.red.sourceHashes.find((entry) => entry.path === relative)?.rawSha256, hash(own(relative)));
  }
  assert.equal(stages.stub.exitCode, 0);
  assert.equal(stages.iac.exitCode, 0);
  assert.match(gunzipSync(own(stages.iac.stdout)).toString('utf8'), /IaC N\/A/);
  for (const stage of ['trace', 'focused', 'syntax', 'browser']) assert.equal(stages[stage].exitCode, 0);
});

test('all captured attempts and failure streams remain readable with original bytes and actual exits', () => {
  const raw = path.join(root, 'evidence', 'raw');
  for (const entry of fs.readdirSync(raw, { withFileTypes: true })) {
    assert.equal(entry.isDirectory(), true);
    assert.match(entry.name, /^[a-z]+-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const file = path.join(raw, entry.name, 'run.json');
    if (!fs.existsSync(file)) {
      assert.deepEqual(fs.readdirSync(path.dirname(file)), [], 'Only an empty, still-running deliberate capture may lack its completed report; not acceptance evidence.');
      continue;
    }
    const run = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(run.cardId, 'C034');
    assert.equal(run.workerId, 'worker-C034');
    assert.equal(run.deliberateCapture, 'CAPTURE_BROWSER_EVIDENCE=1');
    assert.ok(run.startedAtUtc < run.completedAtUtc);
    for (const stream of ['stdout', 'stderr']) assert.equal(hash(gunzipSync(own(run[stream]))), run[`${stream}Sha256`]);
  }
  assert.ok(manifest.retainedExecutionHistory.some((run) => run.stage === 'red' && run.exitCode === 1));
});

test('saved versioned trace is the actual closed/partial source projection, not replacement reconstruction or run adoption', () => {
  assert.equal(hash(own(manifest.savedTrace.json)), manifest.savedTrace.jsonRawSha256);
  assert.equal(hash(own(manifest.savedTrace.browserData)), manifest.savedTrace.browserDataRawSha256);
  const bundle = json(manifest.savedTrace.json);
  const expectedScript = `(function(root){'use strict';function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}Object.defineProperty(root,'C034Saved',{value:freeze(${JSON.stringify(bundle).replaceAll('<', '\\u003c')})});}(globalThis));\n`;
  assert.equal(own(manifest.savedTrace.browserData).toString('utf8'), expectedScript);
  for (const id of trace.ids) {
    const inspected = trace.inspectSaved(id);
    assert.equal(inspected.valid, true);
    assert.equal(inspected.liveRunAdopted, false);
    assert.equal(inspected.actualRunCorrelation, false);
    assert.equal(inspected.identityVerified, false);
    assert.equal(inspected.migrationQualified, false);
  }
  assert.equal(trace.inspectSaved('closed-history').attempts[5].classification, 'unknown');
  assert.equal(trace.inspectSaved('held-snapshot').attempts.at(-1).endedAt, null);
});

test('new signed Edge proof observes actual DOM/keyboard/order/error/partial/reset/CSP and exact cleanup, not new live telemetry', () => {
  const run = json(manifest.workflow.browser);
  const browser = json(manifest.browser.summary);
  assert.equal(browser.outcome, 'passed');
  assert.equal(browser.actualSignedEdge.authenticodeStatus, 'Valid');
  assert.ok(browser.actualSignedEdge.actualOwnedBrowserPid > 0);
  assert.equal(browser.browserVersion, '156.0.4314.50');
  assert.equal(browser.playwrightVersion, '1.56.1');
  assert.match(browser.testRuntime, /^v22\./);
  assert.ok(Object.values(browser.cleanup).every((value) => value === true));
  assert.equal(browser.checks.length, 11);
  assert.ok(browser.actualBrowserRequests.every((request) => request.url.startsWith('file:') && request.method === 'GET'));
  assert.equal(browser.nativeTransportQualified, false);
  assert.equal(browser.fullJourneyQualified, false);
  assert.equal(browser.identityVerified, false);
  assert.equal(browser.actualRunCorrelation, false);
  assert.equal(browser.productionRuntimeValidated, false);
  for (const name of ['index.html', 'page.js', 'trace.js', 'style.css']) {
    const relative = path.join('capability', 'C034', name);
    assert.equal(run.sourceHashes.find((entry) => entry.path === relative)?.rawSha256, hash(own(relative)), `Actually observed current UI source: ${name}`);
  }
  assert.equal(run.sourceHashes.find((entry) => entry.path === manifest.savedTrace.browserData)?.rawSha256,
    manifest.savedTrace.browserDataRawSha256);
});

test('Git raw-byte gate is explicit pending before publication and verified for every sealed file after publication', () => {
  const entries = [...seal.sourceHashes, ...seal.evidenceHashes,
    { path: manifest.seal.path, rawSha256: manifest.seal.rawSha256 },
    { path: path.join('capability', 'C034', 'evidence-index.json'), rawSha256: hash(fs.readFileSync(path.join(root, 'evidence-index.json'))) }];
  const input = entries.map((entry) => `HEAD:${entry.path.replaceAll('\\', '/')}`).join('\n') + '\n';
  const bytes = execFileSync('git', ['--no-pager', 'cat-file', '--batch'], {
    cwd: repository, input, timeout: 10000, windowsHide: true, maxBuffer: 8 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe']
  });
  let offset = 0;
  let published = 0;
  for (const entry of entries) {
    const end = bytes.indexOf(10, offset);
    const line = bytes.subarray(offset, end).toString('utf8');
    offset = end + 1;
    if (line.endsWith(' missing')) continue;
    const match = /^[0-9a-f]{40} blob (\d+)$/.exec(line);
    assert.ok(match, 'Exact owned Git blob required, not inferred publication.');
    const size = Number(match[1]);
    assert.equal(hash(bytes.subarray(offset, offset + size)), entry.rawSha256, `Published raw bytes: ${entry.path}`);
    offset += size + 1;
    published++;
  }
  assert.equal(offset, bytes.length);
  if (published) assert.equal(published, entries.length, 'Partial own publication is not qualification.');
  console.log(JSON.stringify({ ownRawGitChecks: published, sealedOwnedFiles: entries.length, publicationByteGate: published ? 'verified exact HEAD raw blobs' : 'pending; own sealed working bytes only, not publication' }));
});
