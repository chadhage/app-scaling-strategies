'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { sealedFiles, describe, verify } = require('./seal.cjs');
const root = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(__dirname, relative), 'utf8');
const bytes = (relative) => fs.readFileSync(path.join(__dirname, relative));
const digest = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const manifest = JSON.parse(read('manifest.json'));

test('exact S126 source acceptance, portable unit and packet are not native proof', () => {
  assert.equal(manifest.id, 'A-S126');
  assert.equal(manifest.sourceId, 'S126');
  assert.equal(manifest.parentId, 'D-S126');
  assert.equal(manifest.packet, 'SC-S126');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S126');
  assert.equal(manifest.objective, 'Split multiple revisions and retire one; preview access and old-work gates remain necessary.');
  assert.equal(manifest.sourceContract.acceptance, 'Native revisions and actual traffic are observed; preview routes stay authorized; old revision retirement follows verified gates.');
  assert.equal(manifest.sourceContract.nativeEntryGate, 'CORE, DATA, ACA, C070');
  assert.equal(manifest.mode, 'portable-synthetic');
  for (const key of ['accepted', 'nativeProofComplete', 'sourceParentComplete', 'productionNode24Validated']) assert.equal(manifest[key], false);
  assert.equal(manifest.extraKanoCredits, 0);
  assert.equal(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes('| S126 | **Container Apps, multiple revisions:** Demonstrate weighted canaries, controlled retirement, and compatible rollback. |'), true);
  assert.equal(fs.readFileSync(path.join(root, '.docs', 'wiki', 'backlog.md'), 'utf8').includes('| D-S126 | P0 | Add a Container Apps multiple-revision preset for canary/preview/rollback/retirement. | Native revisions and actual traffic are observed; preview routes stay authorized; old revision retirement follows verified gates. | P002, D-S003 |'), true);
  assert.equal(fs.readFileSync(path.join(root, '.docs', 'wiki', 'kanban.md'), 'utf8').includes('| A-S126 | D-S126 | S | Split multiple revisions and retire one; preview access and old-work gates remain necessary. | SOURCE |'), true);
  assert.equal(fs.readFileSync(path.join(root, '.docs', 'wiki', 'kanban.md'), 'utf8').includes('| B-S126 | D-S126 | S | Conduct one multiple-revision preset; verify native routing, authorized preview, and controlled retirement. | CORE, DATA, ACA, C070 |'), true);
});

test('documented ACA constraints and fixed-data application gates are explicitly qualified', () => {
  assert.deepEqual(manifest.documentedConstraints.references, [
    'https://learn.microsoft.com/en-us/azure/container-apps/revisions',
    'https://learn.microsoft.com/en-us/azure/container-apps/traffic-splitting',
  ]);
  assert.match(manifest.documentedConstraints.previewLabels, /independently.*zero weight/);
  assert.match(manifest.documentedConstraints.previewLabels, /not an application authorization guarantee/);
  assert.match(manifest.documentedConstraints.readinessQualification, /ALL replica probes/);
  assert.match(manifest.documentedConstraints.notSlotsOrScaling, /not App Service slots/);
  assert.match(manifest.verification.iac, /^N\/A, evaluated after genuine RED/);
  const documentation = read('README.txt');
  for (const phrase of [
    'DATA ONLY', 'ALL replica', '400 ms', 'not an ACA',
    'Parent alone accepts A-S126 once', 'zero', 'C005-C008',
    'known context/page/cleanup lifecycle limitations', 'inactive recovery prototype',
    'not Node 24 production proof', 'Microsoft Open Source',
  ]) assert.equal(documentation.includes(phrase), true, phrase);
});

test('standalone HTML/runtime have narrow CSP, no live calls and prototype reset', () => {
  const html = read('index.html');
  assert.equal(html.includes(manifest.banner), true);
  assert.equal(html.indexOf('Content-Security-Policy') < html.indexOf('<link'), true);
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "img-src 'none'", "font-src 'none'", "object-src 'none'", "base-uri 'none'",
    "form-action 'none'", "frame-src 'none'", "worker-src 'none'",
  ]) assert.equal(html.includes(directive), true, directive);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|\son[a-z]+\s*=|<script[^>]*>[^<]+\S[^<]*<\/script>/i);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]), ['model.js', 'app.js']);
  assert.deepEqual([...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map((match) => match[1]), ['lesson.css']);
  for (const file of ['model.js', 'app.js']) {
    assert.doesNotMatch(read(file), /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|document\.cookie|\beval\s*\(|innerHTML|\bsetTimeout\s*\(|Math\.random|Date\.now/);
  }
  assert.doesNotMatch(read('lesson.css'), /@import|\burl\s*\(/);
  assert.match(read('app.js'), /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.match(html, /role="alert"/);
  assert.match(html, /role="status"/);
  assert.equal(html.includes('csp-probe.js'), false);
});

test('BDD preceded genuine assertion RED on a loadable archived raw stub; IaC N/A followed', () => {
  const red = read(path.join('evidence', 'raw', 'red.stdout.tap'));
  assert.match(red, /not ok 1/);
  assert.match(red, /ERR_ASSERTION/);
  assert.match(red, /prepared/);
  assert.match(red, /baseline/);
  assert.doesNotMatch(red, /MODULE_NOT_FOUND|ENOENT|SyntaxError/);
  const summary = JSON.parse(read(path.join('evidence', 'raw', 'red-summary.json')));
  assert.equal(summary.exitCode, 1);
  assert.equal(summary.errorCode, 'ERR_ASSERTION');
  assert.equal(summary.behavioralRed, true);
  assert.equal(summary.extraKanoCredits, 0);
  assert.match(summary.iac, /Not yet evaluated/);
  assert.match(read(path.join('evidence', 'iac-na.txt')), /AFTER the preserved genuine behavioral assertion RED/);
  const observed = JSON.parse(read(path.join('evidence', 'raw', 'stub-browser.json')));
  assert.equal(observed.phaseAfterKeyboardPrepare, 'baseline');
  assert.equal(observed.loadableNoOpStub, true);
  assert.equal(observed.awaitedCleanupCompleted, true);
  assert.equal(observed.node, 'v22.23.4');
  assert.equal(observed.browser, '156.0.4314.50');
  const snapshot = JSON.parse(read(path.join('evidence', 'raw', 'stub-byte-snapshot.json')));
  for (const [original, hash] of Object.entries(snapshot.rawSha256)) {
    const archived = original === 'model.test.cjs' ? 'assertions.cjs' : original;
    assert.equal(digest(bytes(path.join('evidence', 'red-stub', archived))), hash);
  }
  const stub = require('./evidence/red-stub/model.js');
  assert.equal(stub.execute(stub.createState(), { type: 'prepare', fixture: 'healthy', token: 'v2' }).phase, 'baseline');
  assert.match(read(path.join('evidence', 'red-stub', 'assertions.cjs')), /assert\.equal\(state\.phase, 'prepared'\)/);
  for (const name of fs.readdirSync(path.join(__dirname, 'evidence', 'red-stub'))) assert.doesNotMatch(name, /(?:^test[-.]|[.-]test\.[cm]?js$)/i);
  assert.match(read('multiple-revisions.feature'), /Feature: A bounded multiple-revision/);
});

test('published isolated helper and exact capture-only/read-only contract remain pinned', () => {
  assert.equal(digest(fs.readFileSync(path.join(root, 'testing', 'browser', 'isolated.cjs'))), manifest.verification.publishedHelperSha256);
  assert.equal(manifest.verification.publishedHelperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  const source = read('browser.test.cjs');
  assert.match(source, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(source, /flag: 'wx'/);
  assert.match(source, /finally \{\s+await session\.close\(\)/);
  assert.match(source, /assert\.deepEqual\(after, before/);
  assert.doesNotMatch(source, /bypassCSP\s*:\s*true|chromiumSandbox\s*:\s*false|--no-sandbox|ignoreHTTPSErrors|playwright.*install/);
  assert.equal(manifest.limits.some((limit) => limit.includes('inactive recovery prototype remains unqualified')), true);
});

test('source seal distinguishes raw working-tree, canonical LF and Git object bytes', () => {
  const seal = JSON.parse(read(path.join('evidence', 'source-hashes.json')));
  assert.equal(seal.cardId, 'A-S126');
  assert.equal(seal.extraKanoCredits, 0);
  assert.deepEqual(seal.entries.map((entry) => entry.path).sort(), sealedFiles());
  for (const entry of seal.entries) verify(entry, bytes(entry.path));
  assert.equal(seal.entries.some((entry) => entry.path.endsWith('assertions.cjs') && entry.gitTextMode === 'raw'), true);
  assert.equal(seal.entries.some((entry) => entry.path === 'model.js' && entry.gitTextMode === 'text-lf'), true);
});

test('narrow raw-byte attributes protect RED/browser/green proof even when CRLF has the same canonical LF', () => {
  const attributes = read('.gitattributes');
  for (const rule of ['* text eol=lf', 'evidence/raw/** -text -diff', 'evidence/red-stub/** -text -diff']) assert.equal(attributes.includes(rule), true);
  if (fs.existsSync(path.join(root, '.git'))) {
    const rawPath = path.join('learning', 'S126', 'evidence', 'raw', 'red.stdout.tap');
    const textPath = path.join('learning', 'S126', 'model.js');
    const actual = execFileSync('git', ['check-attr', 'text', 'eol', 'diff', '--', rawPath, textPath], { cwd: root, encoding: 'utf8' });
    assert.match(actual, /red\.stdout\.tap"?: text: unset/);
    assert.match(actual, /model\.js"?: text: set/);
    assert.match(actual, /model\.js"?: eol: lf/);
    assert.match(actual, /red\.stdout\.tap"?: diff: unset/);
  }
  const original = Buffer.from('proof\r\n');
  const normalized = Buffer.from('proof\n');
  const raw = describe(path.join('evidence', 'raw', 'sample.tap'), original);
  assert.notEqual(raw.rawSha256, raw.canonicalLfSha256);
  assert.throws(() => verify(raw, normalized), assert.AssertionError);
  const text = describe('sample.js', original);
  assert.doesNotThrow(() => verify(text, normalized));
});

test('final published proof snapshot contains actual positive/negative/unknown DOM and cleanup observations', () => {
  const verification = JSON.parse(read(path.join('evidence', 'verification.json')));
  assert.equal(verification.cardId, 'A-S126');
  assert.equal(verification.focusedTestsPassed, true);
  assert.equal(verification.browserObserved, true);
  assert.equal(verification.normalVerificationReadOnly, true);
  assert.equal(verification.extraKanoCredits, 0);
  for (const proof of verification.proofs) assert.equal(digest(bytes(proof.path)), proof.rawSha256, proof.path);
  const browser = JSON.parse(read(verification.browserCapture));
  assert.equal(browser.verified, true);
  assert.equal(browser.checks.every((check) => check.passed), true);
  assert.equal(browser.awaitedCleanupCompleted, true);
  assert.equal(browser.existingOwnedBytesUnchanged, true);
  assert.equal(browser.nativeProofComplete, false);
  assert.equal(browser.sourceParentComplete, false);
  assert.equal(browser.productionNode24Validated, false);
  assert.equal(browser.unattendedHelperQualified, false);
  assert.equal(browser.inactivePrototypeUsed, false);
  assert.deepEqual(browser.pageErrors, []);
  assert.deepEqual(browser.remoteRequests, []);
  for (const name of [
    'positive-controlled-teaching-retirement', 'measured-retirement-held',
    'post-retirement-authorized-preview-paths', 'post-promotion-preview-leak-despite-successful-journeys',
    'measured-readiness', 'measured-preview-paths',
    'compatible-rollback-preserves-earlier-failure', 'keyboard-reset-archives-interrupted-run',
    'twenty-action-history-cap', 'bounded-reset-archive-limit',
    'prototype-reset-survives-reset-name-shadow', 'actual-csp-enforcement',
    'actual-missing-local-model-safe-failure', 'reload-reset-after-visible-failure',
  ]) assert.equal(browser.observations.some((observation) => observation.name === name), true, name);
  const csp = browser.observations.find((observation) => observation.name === 'actual-csp-enforcement').csp;
  for (const field of ['inlineBlocked', 'inlineEventBlocked', 'inlineStyleBlocked', 'evalBlocked', 'connectionRejected', 'imageRejected']) assert.equal(csp[field], true);
  for (const directive of ['connect-src', 'img-src', 'frame-src', 'form-action']) {
    assert.equal(csp.violations.some((event) => event.effectiveDirective === directive && event.disposition === 'enforce'), true);
  }
  const workingTreeAtBrowserRun = browser.rawSourceHashesBefore;
  const seal = JSON.parse(read(path.join('evidence', 'source-hashes.json')));
  for (const entry of seal.entries) assert.equal(workingTreeAtBrowserRun[entry.path], entry.rawSha256, `Browser exercised the measured sealed source bytes: ${entry.path}`);
});
