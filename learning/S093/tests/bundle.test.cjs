'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const resolve = (relative) => path.join(root, ...relative.split('/'));
const read = (relative) => fs.readFileSync(resolve(relative), 'utf8');
const json = (relative) => JSON.parse(read(relative));
const digest = (buffer) => createHash('sha256').update(buffer).digest('hex');
const canonical = (relative) => Buffer.from(read(relative).replace(/\r\n/g, '\n'));
const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';

function inventory(directory = root) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((item) => {
    const target = path.join(directory, item.name);
    assert.ok(!item.isSymbolicLink(), 'Owned evidence cannot be a link');
    return item.isDirectory() ? inventory(target)
      : [path.relative(root, target).split(path.sep).join('/')];
  }).sort();
}

test('manifest exposes exactly the owned synthetic S093 source contract', () => {
  const manifest = json('manifest.json');
  assert.equal(manifest.sourceId, 'S093');
  assert.equal(manifest.cardId, 'A-S093');
  assert.equal(manifest.parentId, 'D-S093');
  assert.equal(manifest.packet, 'SC-S093');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S093');
  assert.equal(manifest.owner, 'worker-A-S093');
  assert.equal(manifest.technicalEntryGate, 'SOURCE');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.entry, 'index.html');
  assert.equal(manifest.objective, 'Return slow 200 responses; an exceeded journey budget must fail acceptance.');
  assert.equal(manifest.acceptance.acceptedAtUtc, null);
  assert.equal(manifest.syntheticInputs.maxAttempts, 6);
  for (const relative of Object.values(manifest.evidence)) assert.ok(fs.existsSync(resolve(relative)));
  const source = json('evidence/source-contract.json');
  assert.equal(source.sources.length, 3);
  assert.equal(source.sources[0].exactRow, '| S093 | **Latency regression without errors:** Reject a candidate that returns successful responses too slowly. |');
  assert.equal(source.sources[1].exactRow, '| D-S093 | P0 | Add slow successful responses that violate journey budgets. | Latency regression blocks expansion even with HTTP 200; actual slow journeys count as interruptions. | D-S003 |');
  assert.equal(source.sources[2].exactRow, '| A-S093 | D-S093 | S | Return slow 200 responses; an exceeded journey budget must fail acceptance. | SOURCE |');
  assert.ok(source.sources.every((entry) => /^[a-f0-9]{40}$/.test(entry.sourceCommit)
    && /^[a-f0-9]{64}$/.test(entry.canonicalGitSha256)));
  assert.deepEqual(source.relatedAdmittedToDo, []);
});

test('standalone HTML uses owned assets, exact banner, labelled controls and restrictive CSP', () => {
  const html = read('index.html');
  assert.equal((html.match(/Training rehearsal - synthetic data - not a live Azure result/g) || []).length, 1);
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "object-src 'none'", "base-uri 'none'",
    "form-action 'none'", "frame-src 'none'",
  ]) assert.ok(policy.includes(directive));
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|\*/);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((entry) => entry[1]), ['model.js', 'app.js']);
  assert.doesNotMatch(html, /\son\w+\s*=|<script(?! src=)|<iframe|https?:\/\//i);
  for (const id of ['scenario', 'budget', 'action']) assert.ok(html.includes(`label for="${id}"`));
  assert.ok(html.includes('id="reset-rehearsal" type="button"'));
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(read('app.js'), /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.match(read('styles.css'), /:focus-visible/);
  for (const script of ['model.js', 'app.js']) {
    assert.doesNotMatch(read(script), /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|setTimeout|setInterval)\b|\bMath\.random\b|\bDate\b/);
    assert.doesNotMatch(read(script), /innerHTML|outerHTML|document\.write|eval\s*\(/);
  }
});

test('BDD declares the original latency acceptance and retained unknown/failure safeguards', () => {
  const feature = read('latency-budget.feature');
  assert.match(feature, /Slow HTTP 200 cannot pass acceptance or expand/);
  assert.match(feature, /journey acceptance is failure/);
  assert.match(feature, /interruptions remain in the attempted-journey denominator/);
  assert.match(feature, /Missing latency is unknown/);
  assert.match(feature, /History has a fixed bound/);
  assert.match(feature, /actual browser DOM/);
  assert.match(feature, /CAPTURE_BROWSER_EVIDENCE=1/);
});

test('preserved genuine RED is an assertion mismatch and precedes the IaC N/A decision', () => {
  const red = json('evidence/red.json');
  const iac = json('evidence/iac-decision.json');
  assert.equal(red.exitCode, 1);
  assert.equal(red.assertion.code, 'ERR_ASSERTION');
  assert.equal(red.assertion.actual, 'success');
  assert.equal(red.assertion.expected, 'failure');
  assert.equal(red.missingCodeOrToolFailure, false);
  assert.equal(red.autoDiscovered, false);
  assert.equal(red.archivedExitCode, 1);
  assert.equal(digest(fs.readFileSync(resolve(`evidence/${red.stubSnapshot}`))), red.stubSha256);
  const transcript = fs.readFileSync(resolve(`evidence/${red.rawTranscript}`));
  assert.ok(transcript.includes(Buffer.from('\r\n')));
  assert.match(transcript.toString('utf8'), /ERR_ASSERTION/);
  assert.match(transcript.toString('utf8'), /actual: 'success'/);
  assert.match(transcript.toString('utf8'), /expected: 'failure'/);
  assert.doesNotMatch(transcript.toString('utf8'), /MODULE_NOT_FOUND|ENOENT|not recognized/);
  assert.match(read('evidence/raw/red-acceptance.assertion.cjs'), /assert\.equal\(observed\.acceptance, 'failure'\)/);
  assert.equal(iac.decision, 'N/A');
  assert.equal(iac.applicable, false);
  assert.ok(Date.parse(iac.recordedAtUtc) >= Date.parse(red.completedAtUtc));
  assert.equal(iac.extraCredit, 0);
  assert.match(read('.gitattributes'), /^evidence\/raw\/\*\* -text -diff$/m);
  assert.ok(inventory().filter((entry) => entry.startsWith('evidence/raw/'))
    .every((entry) => !/\.test\.[cm]?js$|(^|\/)test-[^/]*\.[cm]?js$/.test(entry)));
});

test('actual browser evidence qualifies only the explicit offline pair and owned source version', () => {
  const tooling = json('evidence/tooling-preflight.json');
  const browser = json('evidence/browser-acceptance.json');
  assert.equal(tooling.helper.sha256, helperHash);
  assert.equal(tooling.playwright, '1.56.1');
  assert.equal(tooling.browser.signatureStatus, 'Valid');
  assert.match(tooling.browser.signer, /Microsoft Corporation/);
  assert.match(tooling.browser.productVersion, /^156\./);
  assert.match(tooling.node, /^v22\./);
  assert.equal(browser.outcome, 'passed');
  assert.equal(browser.helper.sha256, helperHash);
  assert.equal(browser.browserVersion, tooling.browser.productVersion);
  assert.equal(browser.playwright, '1.56.1');
  assert.equal(browser.actualHttpRequests, 0);
  assert.equal(browser.cleanup.awaitedFinallyClose, true);
  assert.equal(browser.cleanup.returned, true);
  assert.equal(browser.normalVerificationReadOnly, true);
  assert.equal(browser.abandonedPrototypeUsed, false);
  assert.equal(browser.checks.length, 6);
  assert.ok(browser.checks.every((check) => check.passed));
  for (const [relative, hash] of Object.entries(browser.sourceCanonicalSha256)) {
    assert.equal(digest(canonical(relative)), hash, `Browser evidence source differs: ${relative}`);
  }
  assert.equal(Object.keys(browser.sourceCanonicalSha256).length, 11);
  const focused = json('evidence/focused-green.json');
  assert.equal(focused.exitCode, 0);
  assert.equal(focused.syntax.exitCode, 0);
  assert.equal(focused.extraCredit, 0);
});

test('all owned files match explicit canonical Git text or byte-preserved raw integrity', () => {
  const index = json('evidence/content-index.json');
  assert.equal(index.cardId, 'A-S093');
  assert.equal(index.schemaVersion, 1);
  assert.deepEqual(index.excluded, ['evidence/content-index.json']);
  const files = inventory().filter((entry) => !index.excluded.includes(entry));
  assert.deepEqual(index.entries.map((entry) => entry.path).sort(), files);
  for (const entry of index.entries) {
    const raw = entry.path.startsWith('evidence/raw/');
    assert.equal(entry.mode, raw ? 'raw-bytes' : 'git-canonical-lf');
    assert.equal(digest(raw ? fs.readFileSync(resolve(entry.path)) : canonical(entry.path)),
      entry.sha256, `Owned integrity mismatch: ${entry.path}`);
  }
});
