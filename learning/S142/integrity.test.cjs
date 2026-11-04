'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const { root, sealPath, sha256, canonicalSha256, canCapture, lessonFiles, hashTree, captureBrowser } = require('./record.cjs');
const load = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const git = (args) => cp.execFileSync('git', ['--no-pager', ...args], { cwd: path.resolve(root, '..', '..') });
const canonical = (bytes, raw) => raw ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const rawFiles = () => lessonFiles().filter((file) => file.startsWith(path.join('evidence', 'raw') + path.sep));

test('all sealed owned files preserve raw bytes independently of canonical LF code', () => {
  const seal = load(sealPath);
  assert.equal(seal.schema, 's142-byte-integrity/1');
  assert.equal(seal.verificationWrites, false);
  assert.deepEqual(seal.entries.map((entry) => entry.path).sort(), lessonFiles().filter((file) => file !== sealPath).sort());
  for (const entry of seal.entries) {
    const bytes = fs.readFileSync(path.join(root, entry.path));
    const raw = entry.gitTreatment === 'raw-no-text-conversion';
    if (raw) assert.equal(sha256(bytes), entry.rawSha256, entry.path + ' literal raw bytes');
    else assert.match(entry.rawSha256, /^[a-f0-9]{64}$/, entry.path + ' producer working-byte observation');
    assert.equal(sha256(canonical(bytes, raw)), entry.canonicalSha256, entry.path + ' canonical bytes');
    if (!raw) assert.doesNotMatch(canonical(bytes, false).toString('utf8'), /\r/, entry.path + ' canonical Git form must use LF');
  }
  const captures = rawFiles().filter((file) => /(?:browser-[\w-]+|stub-browser-[\w-]+)\.json\.txt$/.test(file));
  assert.ok(captures.length >= 2);
  for (const file of captures) {
    const bytes = fs.readFileSync(path.join(root, file));
    assert.ok(bytes.includes(Buffer.from('\r\n')), file + ' retains CRLF');
    assert.doesNotMatch(bytes.toString('utf8'), /(?<!\r)\n|\r(?!\n)/, file + ' CRLF is not normalized');
  }
});

test('Git attributes narrowly keep raw evidence literal and canonical code LF', () => {
  const attributes = fs.readFileSync(path.join(root, '.gitattributes'), 'utf8');
  assert.match(attributes, /^evidence\/raw\/\*\* -text -diff$/m);
  assert.doesNotMatch(attributes, /^\*\*.*-text/m);
  const raw = rawFiles().find((file) => /browser-/.test(file));
  const output = git(['check-attr', '-z', 'text', 'diff', 'eol', '--',
    path.join('learning', 'S142', raw), path.join('learning', 'S142', 'model.js')]).toString().split('\0');
  const attributesByFile = new Map();
  for (let index = 0; index + 2 < output.length; index += 3) {
    const file = path.basename(output[index]);
    const attributes = attributesByFile.get(file) || {};
    attributes[output[index + 1]] = output[index + 2];
    attributesByFile.set(file, attributes);
  }
  assert.deepEqual(attributesByFile.get(path.basename(raw)), { text: 'unset', diff: 'unset', eol: 'unspecified' });
  assert.deepEqual(attributesByFile.get('model.js'), { text: 'set', diff: 'unspecified', eol: 'lf' });
});

test('published Git storage matches canonical code and unconverted raw CRLF separately', (context) => {
  const tree = git(['ls-tree', '-r', '--format=%(objectname) %(path)', 'HEAD', '--', path.join('learning', 'S142')]).toString().trim();
  if (!tree) { context.skip('Prepublication only: rerun this exact check after scoped publication.'); return; }
  const blobs = new Map(tree.split(/\r?\n/).map((line) => [line.slice(41), line.slice(0, 40)]));
  const seal = load(sealPath);
  for (const entry of seal.entries) {
    const bytes = fs.readFileSync(path.join(root, entry.path));
    const storedBytes = canonical(bytes, entry.gitTreatment === 'raw-no-text-conversion');
    const oid = crypto.createHash('sha1').update(Buffer.from(`blob ${storedBytes.length}\0`)).update(storedBytes).digest('hex');
    const gitPath = path.join('learning', 'S142', entry.path).replaceAll(path.sep, '/');
    assert.equal(blobs.get(gitPath), oid, gitPath + ' stored Git bytes');
  }
  assert.equal(blobs.size, seal.entries.length + 1, 'only the seal is excluded from its own entry hashes');
});

test('exact original source acceptance and frozen inventory are independently Git-pinned', () => {
  const source = load('source.json');
  assert.deepEqual([source.cardId, source.workerId, source.parent, source.kanoUnit, source.kano, source.priority, source.packet, source.gate],
    ['A-S142', 'worker-A-S142', 'D-S142', 'A-S142', 'S', 'P1', 'SC-S142', 'SOURCE']);
  assert.equal(source.sourceReadBeforeDesign, true);
  assert.equal(source.authorization, 'local-synthetic-only');
  assert.equal(source.mode, 'fixed-fiction-data-only');
  assert.equal(source.inventory.card.id, source.cardId);
  assert.equal(source.inventory.card.packet, 'SC-S142');
  assert.equal(source.inventory.card.technicalEntryGate, 'SOURCE');
  for (const record of source.sources) {
    const objectPath = record.path.replaceAll(path.sep, '/');
    const stored = git(['show', source.sourceCommit + ':' + objectPath]);
    assert.equal(sha256(stored), record.canonicalSha256);
    assert.equal(git(['rev-parse', source.sourceCommit + ':' + objectPath]).toString().trim(), record.canonicalBlob);
    assert.ok(stored.toString().split(/\r?\n/).includes(record.exactRow));
    const rawRow = fs.readFileSync(path.join(root, 'evidence', 'raw', record.rawRow));
    assert.equal(sha256(rawRow), record.rawRowSha256);
    assert.equal(rawRow.toString().replace(/\r?\n$/, ''), record.exactRow);
    assert.match(record.rawSha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(source.sources[0].exactRow, '| S142 | **Burst during warm-up:** Test initialization and production demand competing within the declared peak-load envelope. |');
  assert.match(source.sources[1].exactRow, /Shared initialization\/demand pressure stays within the declared envelope or produces explicit budget failures/);
  assert.equal(source.inventory.card.deliver, 'Burst demand during initialization; detect contention hidden by separate tier benchmarks.');
});

test('genuine failing assertion and actually loadable stub remain raw outside autodiscovery', () => {
  const red = load(path.join('evidence', 'red.json'));
  const stdout = fs.readFileSync(path.join(root, 'evidence', 'raw', 'red.stdout.txt'));
  const stderr = fs.readFileSync(path.join(root, 'evidence', 'raw', 'red.stderr.txt'));
  assert.equal(red.exitCode, 1);
  assert.equal(red.expected, 'FAIL');
  assert.equal(red.actual, 'UNKNOWN');
  assert.equal(sha256(stdout), red.stdoutSha256);
  assert.equal(sha256(stderr), red.stderrSha256);
  assert.match(stdout.toString(), /ERR_ASSERTION/);
  assert.match(stdout.toString(), /known coupled pressure must not be masked/);
  assert.match(stdout.toString(), /# pass 0/);
  assert.match(stdout.toString(), /# fail 1/);
  assert.equal(red.loadableStubObservedBeforeRed, true);
  const stubProof = rawFiles().filter((file) => /stub-browser-.*\.json\.txt$/.test(file)).map(load)[0];
  assert.equal(stubProof.modelLoaded, true);
  assert.equal(stubProof.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.equal(stubProof.cleanup, 'awaited close complete');
  const stub = fs.readFileSync(path.join(root, 'evidence', 'raw', 'red.stub.model.js.txt'), 'utf8');
  assert.match(stub, /verdict: 'UNKNOWN'/);
  assert.ok(rawFiles().every((file) => !/\.(?:test|spec)\.(?:js|cjs|mjs)$/.test(file)));
});

test('recorded actual browser checks are code-bound, closed and distinct from negative user outcomes', () => {
  const captures = rawFiles().filter((file) => path.basename(file).startsWith('browser-')).map(load);
  const currentModel = canonicalSha256(fs.readFileSync(path.join(root, 'model.js')));
  const proof = captures.find((item) => item.status === 'passed' && item.codeCanonicalSha256?.model === currentModel);
  assert.ok(proof, 'a current successful actual-browser capture is required');
  assert.equal(proof.schema, 's142-local-browser-proof/1');
  assert.equal(proof.mode, 'fixed-fiction-data-only');
  assert.equal(proof.cleanup, 'awaited finally close complete');
  assert.equal(proof.lessonBytesUnchangedBeforeCapture, true);
  assert.equal(proof.networkAttemptCount, 0);
  assert.equal(proof.nativeProof, false);
  assert.equal(proof.productionNode24Proof, false);
  assert.equal(proof.lifecyclePrototypeQualified, false);
  for (const [key, file] of [['model', 'model.js'], ['lesson', 'lesson.js'], ['html', 'index.html'], ['css', 'style.css']]) {
    assert.equal(proof.codeCanonicalSha256[key], canonicalSha256(fs.readFileSync(path.join(root, file))));
    assert.match(proof.codeSha256[key], /^[a-f0-9]{64}$/, 'producer working-byte observation');
  }
  assert.ok(proof.cases.every((item) => item.passed));
  assert.equal(proof.cases.length, 11);
  assert.equal(proof.cases.find((item) => item.name === 'known-contention-not-masked-by-tier-health-throughput').observed.verdict, 'FAIL');
  assert.equal(proof.cases.find((item) => item.name === 'unknown-denominator-three-run-bound-full-retained-history').observed.verdict, 'UNKNOWN');
  assert.ok(proof.cspViolations.some((item) => item.effectiveDirective.startsWith('script-src')));
  assert.ok(proof.cspViolations.some((item) => item.effectiveDirective.startsWith('style-src')));
});

test('approved tooling is pinned without claiming production or general lifecycle qualification', () => {
  const tooling = load(path.join('evidence', 'tooling.json'));
  assert.equal(tooling.node, 'v22.23.4');
  assert.equal(tooling.playwright, '1.56.1');
  assert.equal(tooling.edgeFileVersion, '156.0.4314.50');
  assert.equal(tooling.signatureStatus, 'Valid');
  assert.match(tooling.signer, /CN=Microsoft Corporation/);
  const helper = path.resolve(root, '..', '..', 'testing', 'browser', 'isolated.cjs');
  assert.equal(sha256(fs.readFileSync(helper)), tooling.isolatedHelperSha256);
  assert.equal(tooling.isolatedHelperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  for (const key of ['downloads', 'packagesInstalled', 'unsafeFlags', 'foregroundLeases', 'productionNode24Validation', 'nativeAzureProof', 'inactiveLifecyclePrototypeQualified']) {
    assert.equal(tooling[key], false);
  }
});

test('normal evidence verification is read-only and capture accepts only the exact string 1', () => {
  const before = hashTree();
  for (const value of [undefined, null, false, true, 0, 1, '', '0', '01', 'true', ' 1', '1 ', 'yes']) {
    if (value === undefined && process.env.CAPTURE_BROWSER_EVIDENCE === '1') continue;
    assert.equal(canCapture(value), false);
    assert.equal(captureBrowser({ status: 'must-not-write' }, value), null);
  }
  assert.equal(canCapture('1'), true);
  if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
    assert.equal(captureBrowser({ status: 'argument-cannot-bypass-environment' }, '1'), null);
  }
  assert.deepEqual(hashTree(), before);
});

test('runtime assets enforce CSP and perform only in-memory fixed-data replay', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('Training rehearsal - synthetic data - not a live Azure result'));
  assert.match(html, /default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'/);
  for (const directive of ["img-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(html.includes(directive));
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|<script[^>]*>[^<\s]|<style|\son\w+=|(?:id|name)="reset"/i);
  for (const file of ['model.js', 'lesson.js']) {
    const script = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|WebSocket|serviceWorker|localStorage|sessionStorage|setInterval|setTimeout|https?:\/\//);
  }
  assert.match(html, /Four correlated started journeys/);
});

test('BDD to RED to IaC N/A and honest native remainder preserve one original unit', () => {
  const bdd = fs.readFileSync(path.join(root, 'burst-initialization.feature'), 'utf8');
  assert.match(bdd, /Separate passing tier samples cannot certify a coupled burst/);
  assert.match(bdd, /Missing peak evidence and unresolved started journeys remain unknown/);
  const iac = load('iac.json');
  assert.equal(iac.applicability, 'N/A');
  assert.equal(iac.stage, 'After genuine behavioral RED, before implementation');
  const remainder = load('remainder.json');
  assert.deepEqual([remainder.originalUnit, remainder.kano, remainder.priority, remainder.packet, remainder.gate],
    ['A-S142', 'S', 'P1', 'SC-S142', 'SOURCE']);
  assert.equal(remainder.nativeSibling.id, 'B-S142');
  assert.deepEqual(remainder.nativeSibling.gates, ['CORE', 'DATA', 'HOST']);
  assert.equal(remainder.sourceParent.id, 'D-S142');
  assert.deepEqual(remainder.sourceParent.dependencies, ['D-S011', 'D-S030']);
  assert.equal(remainder.extraCards, 0);
  assert.equal(remainder.additionalCreditsForTestsRepairsProofRefinement, 0);
});
