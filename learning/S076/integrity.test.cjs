'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const repo = path.resolve(__dirname, '..', '..');
const local = (file) => path.join(__dirname, file);
const read = (file) => fs.readFileSync(local(file), 'utf8');
const json = (file) => JSON.parse(read(file));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hash = (file) => digest(fs.readFileSync(file));
const pinnedHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const row = (text, id) => text.split(/\r?\n/).find((line) => line.startsWith(`| ${id} |`));

test('exact source acceptance, original packet and one frozen unit are preserved without native credit', () => {
  const manifest = json('manifest.json');
  assert.equal(manifest.cardId, 'A-S076');
  assert.equal(manifest.sourceId, 'S076');
  assert.equal(manifest.parentId, 'D-S076');
  assert.equal(manifest.siblingId, 'B-S076');
  assert.equal(manifest.title, 'Consumer scale-in');
  assert.equal(manifest.objective, 'Remove a consumer holding work; select valid finish, renew, or release behavior.');
  assert.equal(manifest.sourceBehavior, 'Finish, renew, or safely relinquish claimed work before shutdown.');
  assert.equal(manifest.sourceAcceptance, 'Claimed jobs finish or safely relinquish ownership/checkpoints; retirement does not lose work.');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S076');
  assert.equal(manifest.packet, 'SC-S076');
  assert.deepEqual(manifest.originalPrerequisites, []);
  assert.deepEqual(manifest.sourceParentBaseGates, ['H011', 'P005', 'HOST']);
  assert.deepEqual(manifest.nativeGates, ['CORE', 'DATA', 'AKS', 'C078']);
  for (const key of ['nativeProof', 'parentComplete', 'productionNode24Validated', 'browserLifecycleRecoveryQualified']) {
    assert.equal(manifest[key], false);
  }
  for (const file of [manifest.entryPoint, manifest.feature, manifest.evidence, ...manifest.tests]) {
    assert.ok(file.startsWith('learning\\S076\\'));
    assert.ok(fs.existsSync(path.join(repo, file)));
  }
});

test('raw CRLF source snapshots and canonical Git source integrity are qualified separately', () => {
  const contract = json('evidence\\source-contract.json');
  assert.equal(contract.readBeforeBehaviorDesign, true);
  assert.equal(contract.card.packet, 'SC-S076');
  assert.equal(contract.card.kanoUnit, 'A-S076');
  assert.match(contract.atomicContract, /genuine behavioral TDD red/);
  assert.match(contract.portableContract, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(contract.portableContract, /source ID, objective, preconditions, actions, synthetic input\/trace, expected assertions, and limits/);
  assert.match(contract.sourceAcceptance, /failed or uncertain started transitions must not be removed from the denominator/);
  for (const source of contract.sources) {
    const snapshot = fs.readFileSync(path.join(repo, source.snapshot));
    assert.equal(digest(snapshot), source.rawSha256);
    assert.equal(digest(Buffer.from(snapshot.toString('utf8').replace(/\r\n/g, '\n'))), source.normalizedRawSha256);
    assert.equal([...snapshot.toString('utf8').matchAll(/\r\n/g)].length, source.rawCrLfCount);
    assert.ok(source.rawCrLfCount > 0);
    const canonical = execFileSync('git', ['show', `${source.canonicalGitHead}:${source.path.replaceAll('\\', '/')}`], { cwd: repo });
    assert.equal(digest(canonical), source.canonicalGitSha256);
    for (const id of source.path === 'README.md' ? ['S076'] : source.path.includes('backlog') ? ['D-S076'] : ['A-S076', 'B-S076']) {
      assert.equal(row(snapshot.toString('utf8'), id), row(canonical.toString('utf8'), id));
    }
  }
  assert.equal(contract.rows.scenario, row(read('evidence\\source-readme.source.txt'), 'S076'));
  assert.equal(contract.rows.parent, row(read('evidence\\source-backlog.source.txt'), 'D-S076'));
  assert.equal(contract.rows.card, row(read('evidence\\source-kanban.source.txt'), 'A-S076'));
  assert.equal(contract.rows.native, row(read('evidence\\source-kanban.source.txt'), 'B-S076'));
});

test('qualified RED is actual assertion failure against the exact saved loadable stub', () => {
  const red = json('evidence\\red-qualified.json');
  assert.equal(red.exitCode, 1);
  assert.deepEqual(red.summary, { tests: 81, pass: 1, fail: 80, skipped: 0 });
  assert.equal(red.assertionFailures, 79);
  assert.equal(red.failedSubtestGroups, 1);
  assert.equal(hash(path.join(repo, red.log.path)), red.log.sha256);
  assert.equal(hash(path.join(repo, red.stderr.path)), red.stderr.sha256);
  const log = read('evidence\\red-qualified.tap.txt');
  assert.equal([...log.matchAll(/code: 'ERR_ASSERTION'/g)].length, 79);
  assert.equal([...log.matchAll(/failureType: 'subtestsFailed'/g)].length, 1);
  assert.doesNotMatch(log, /MODULE_NOT_FOUND|Cannot find module|name: '(?:TypeError|ReferenceError)'/);
  for (const snapshot of red.snapshots) {
    assert.equal(hash(path.join(repo, snapshot.path)), snapshot.sha256);
    assert.ok(snapshot.path.endsWith('.source.txt'));
    assert.doesNotMatch(snapshot.path, /\.test\.(?:cjs|js|mjs)$/);
  }
  for (const file of ['model.test.cjs', 'guards.test.cjs', 'consumer-scale-in.feature']) {
    assert.equal(read(file), read(`evidence\\red-qualified-${file.replaceAll('.', '-')}.source.txt`));
  }
  const moduleObject = { exports: {} };
  vm.runInNewContext(read('evidence\\red-qualified-model-js.source.txt'), { module: moduleObject, globalThis: {} });
  const stub = moduleObject.exports;
  assert.equal(typeof stub.createSession, 'function');
  assert.equal(typeof stub.step, 'function');
  const baseline = stub.createSession();
  assert.equal(stub.step(baseline, 'start', stub.DEFAULTS).phase, 'IDLE');
  assert.notEqual(hash(local('model.js')), hash(local('evidence\\red-qualified-model-js.source.txt')));
});

test('initial over-strict capture guard and its genuine assertion RED remain disclosed and unchanged', () => {
  const initial = json('evidence\\red.json');
  assert.equal(initial.assertionFailures, 79);
  assert.equal(initial.summary.fail, 80);
  assert.equal(hash(path.join(repo, initial.log.path)), initial.log.sha256);
  for (const snapshot of initial.snapshots) assert.equal(hash(path.join(repo, snapshot.path)), snapshot.sha256);
  const note = json('evidence\\red-qualification-note.json');
  assert.equal(note.firstCaptureGuardExited, 1);
  assert.equal(note.productOrTestsChanged, false);
  assert.match(note.reason, /parent of 45 actual assertion-failing subtests/);
  assert.equal(note.extraKanoCredit, false);
});

test('IaC N/A was recorded after qualified RED and before implementation', () => {
  const contract = json('evidence\\source-contract.json');
  const red = json('evidence\\red-qualified.json');
  const iac = json('evidence\\iac-na.json');
  const implementation = json('evidence\\implementation-start.json');
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.afterQualifiedRed, true);
  assert.equal(iac.beforeImplementation, true);
  assert.ok(Date.parse(contract.readAtUtc) < Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(iac.recordedAtUtc) >= Date.parse(red.finishedAtUtc));
  assert.ok(Date.parse(implementation.recordedAtUtc) > Date.parse(iac.recordedAtUtc));
  assert.equal(iac.redLogSha256, red.log.sha256);
  assert.equal(iac.stubSha256, hash(local('evidence\\red-qualified-model-js.source.txt')));
});

test('authorized exact Windows helper also matches its canonical published LF Git blob', () => {
  const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
  assert.equal(hash(helper), pinnedHash);
  const published = execFileSync('git', ['show', '53c0c0d82cc1db6780a87ac2b1085734af6d5c60:testing/browser/isolated.cjs'], { cwd: repo });
  assert.equal(digest(Buffer.from(fs.readFileSync(helper, 'utf8').replace(/\r\n/g, '\n'))), digest(published));
  const provenance = json('evidence\\browser-provenance.json');
  assert.equal(provenance.status, 'Valid');
  assert.match(provenance.signer, /Microsoft Corporation/);
  assert.match(provenance.productVersion, /^156\./);
  assert.equal(provenance.node, 'v22.23.4');
  assert.equal(provenance.playwright, '1.56.1');
  assert.equal(provenance.helperSha256, pinnedHash);
  assert.equal(provenance.lifecycleRecoveryQualified, false);
  assert.equal(hash(provenance.path), provenance.sha256);
  const browser = read('browser.test.cjs');
  assert.match(browser, /openIsolatedLesson\('learning\\\\S076\\\\index\.html'\)/);
  assert.match(browser, /finally\s*\{[\s\S]*await session\.close\(\)/);
  assert.match(browser, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(browser, /if \(capture\) fs\.writeFileSync/);
  assert.match(browser, /Ordinary verification must not rewrite/);
  assert.doesNotMatch(browser, /chromium\.launch|executablePath|--no-sandbox|ignoreHTTPSErrors|bypassCSP:\s*true|prototype\.cjs/);
});

test('runtime is local only, renderers are text-only and CSP forbids active remote content', () => {
  const html = read('index.html');
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"
  ]) assert.ok(policy.includes(directive));
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|https?:|data:/);
  assert.doesNotMatch(html, /\son\w+=|<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  for (const file of ['model.js', 'lesson.js']) {
    assert.doesNotMatch(read(file), /innerHTML|outerHTML|document\.write|fetch\(|XMLHttpRequest|WebSocket|setInterval|setTimeout|localStorage|sessionStorage|Math\.random|Date\./);
  }
  assert.match(read('lesson.js'), /form\.addEventListener\('reset'/);
  assert.match(read('styles.css'), /:focus-visible/);
  assert.match(html, /role="alert"/);
  assert.match(html, /aria-live="polite"/);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (!match[1].startsWith('#')) assert.ok(fs.existsSync(local(match[1])), match[1]);
  }
});

test('narrow owned attributes preserve raw captures without disabling runtime whitespace checks', () => {
  const attributes = read('.gitattributes');
  assert.match(attributes, /^\* -text whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol/m);
  assert.match(attributes, /evidence\/\*\.source\.txt -text/);
  assert.match(attributes, /evidence\/\*\.tap\.txt -text -whitespace/);
  const raw = execFileSync('git', ['check-attr', 'text', 'whitespace', '--', 'learning\\S076\\evidence\\red-qualified.tap.txt'], { cwd: repo, encoding: 'utf8' });
  assert.match(raw, /text: unset/);
  assert.match(raw, /whitespace: unset/);
  const runtime = execFileSync('git', ['check-attr', 'text', 'whitespace', '--', 'learning\\S076\\model.js'], { cwd: repo, encoding: 'utf8' });
  assert.match(runtime, /text: unset/);
  assert.match(runtime, /whitespace: blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol/);
  const correction = json('evidence\\publication-canonical-correction.json');
  assert.equal(correction.exitCode, 1);
  assert.deepEqual(correction.summary, { tests: 57, pass: 43, fail: 14 });
  assert.equal(correction.assertionFailures, 14);
  for (const item of [correction.source, correction.log, correction.stderr]) {
    assert.equal(hash(path.join(repo, item.path)), item.sha256);
  }
  const initialGreen = json('evidence\\green-final.json');
  assert.equal(hash(local('evidence\\publication-01-integrity-test-cjs.source.txt')),
    initialGreen.sourceHashes['integrity.test.cjs']);
});

test('sealed owned proof index and actual browser checks remain byte-preserved on ordinary reruns', () => {
  const index = json('evidence.json');
  assert.equal(index.cardId, 'A-S076');
  assert.equal(index.kanoUnit, 'A-S076');
  assert.equal(index.nativeProof, false);
  for (const item of index.files) {
    assert.ok(item.path.startsWith('learning\\S076\\'));
    assert.equal(hash(path.join(repo, item.path)), item.sha256, item.path);
  }
  const observed = json(index.browserObservation.replace('learning\\S076\\', ''));
  assert.equal(observed.status, 'passed');
  assert.equal(observed.cases.length, 17);
  assert.ok(observed.cases.every((entry) => entry.status === 'passed'));
  assert.equal(observed.closeAwaited, true);
  assert.equal(observed.ownedTreeUnchanged, true);
  assert.equal(observed.lifecycleRecoveryQualified, false);
  assert.deepEqual(observed.applicationErrors, []);
  assert.deepEqual(observed.externalCompleted, []);
  assert.deepEqual(observed.escapedCspRequests, []);
  for (const directive of ['script-src-elem', 'connect-src', 'frame-src', 'form-action', 'worker-src', 'base-uri']) {
    assert.ok(observed.cspViolations.some((entry) => entry.directive === directive), directive);
  }
  for (const [file, sha256] of Object.entries(observed.sourceHashes)) assert.equal(hash(local(file)), sha256);
  const correction = json('evidence\\browser-correction.json');
  assert.equal(correction.modelBehaviorChanged, false);
  assert.equal(correction.cspRelaxed, false);
  for (const snapshot of correction.snapshots) assert.equal(hash(path.join(repo, snapshot.path)), snapshot.sha256);
  const firstBrowser = json('evidence\\browser-01.json');
  assert.deepEqual(firstBrowser.summary, { tests: 18, pass: 15, fail: 3, skipped: 0 });
  assert.equal(hash(path.join(repo, firstBrowser.log.path)), firstBrowser.log.sha256);
});

test('related documentation preserves honest remaining To Do and exact acceptance limits', () => {
  const readme = read('README.md');
  assert.match(readme, /B-S076.*CORE, DATA, AKS, C078/);
  assert.match(readme, /D-S076.*incomplete/);
  assert.match(readme, /BASE = H011 \+ P005 \+ applicable HOST/);
  assert.match(readme, /parent-owned independent review\s+and acceptance/i);
  assert.match(readme, /production Node\.js 24/);
  assert.match(readme, /79 actual assertion failures/);
  assert.match(readme, /CAPTURE_BROWSER_EVIDENCE='1'/);
  assert.match(readme, /retirement\s+does not lose work/);
  assert.match(readme, /No cloud, IaC, scaffold, identity, credentials, deployment or expenditure/);
});
