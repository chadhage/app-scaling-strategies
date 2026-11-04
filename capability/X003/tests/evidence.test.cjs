'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { root, digest } = require('./readonly.cjs');
const repository = path.resolve(root, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
const browser = JSON.parse(fs.readFileSync(path.join(repository, manifest.browserProof)));
const engine = require('../recommendation.js');
const catalog = require('../../C005/catalog-data.js');
const contract = require('../../C005/catalog-contract.js');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

test('immutable actual browser proof binds signed Edge, exact source/helper, 14 checks and awaited cleanup', () => {
  assert.equal(browser.status, 'passed');
  assert.equal(browser.passedChecks, 14);
  assert.equal(browser.failedChecks, 0);
  assert.equal(browser.checks.length, 14);
  assert.ok(browser.checks.every(check => check.passed));
  assert.equal(browser.browserSignature.status, 'Valid');
  assert.match(browser.browserSignature.subject, /Microsoft Corporation/);
  assert.equal(browser.browserVersion, browser.browserSignature.version);
  assert.match(browser.browserVersion, /^156\./);
  assert.equal(browser.nodeVersion, 'v22.23.4');
  assert.equal(browser.playwrightVersion, '1.56.1');
  assert.equal(browser.helperRawSha256, manifest.browserHelperSha256);
  assert.equal(browser.sourcePin, manifest.sourceCommit);
  assert.equal(browser.catalogDataSha256, manifest.catalogDataSha256);
  assert.equal(browser.browserCleanup, 'completed by awaited close() in finally');
  assert.equal(browser.chromiumSandboxEnabled, true);
  assert.equal(browser.integratedBrowserUsed, false);
  assert.equal(browser.inactiveLifecyclePrototypeUsed, false);
  assert.equal(browser.helperBroaderLifecycleQualified, false);
  assert.deepEqual(browser.pageErrorsObservedAfterOpen, []);
  assert.deepEqual(browser.remoteRequestsObservedAfterOpen, []);
  assert.equal(browser.nativeAzureObserved, false);
  assert.equal(browser.productionNode24Validated, false);
  assert.equal(browser.additionalCompanionCredit, 0);
});

test('all eight observed goal links are relevant exact catalog destinations with unique fixed targets and ten honest returns', () => {
  const expected = engine.GOALS.slice(0, 8).map(goal => engine.recommend(goal.id));
  assert.deepEqual(browser.practiceNavigations.map(item => [item.goalId, item.id, item.href]),
    expected.map(item => [item.goalId, item.suggestedId, item.lessonHref]));
  assert.equal(new Set(browser.practiceNavigations.map(item => item.href)).size, 8);
  for (const item of browser.practiceNavigations) {
    assert.equal(new URL(item.actualLoadedUrl).protocol, 'file:');
    assert.ok(item.actualLoadedUrl.endsWith(`/learning/${item.id}/index.html`));
    assert.equal(item.trainingBanner, engine.BANNER);
    assert.equal(item.localConductableControlsObserved, true);
  }
  for (const snapshot of browser.linkSnapshots) {
    assert.equal(snapshot.uniqueFixedTargets, true);
    assert.equal(new Set(snapshot.links.map(link => link.href)).size, snapshot.links.length);
    const entry = catalog.entries.find(item => item.id === snapshot.suggestedId);
    assert.equal(snapshot.links.find(item => item.id === 'practice-link').href, entry.learning.href);
    assert.equal(snapshot.links.find(item => item.id === 'source-row-link').href,
      contract.sourceHref(catalog, entry.sourceReferences[0]));
  }
  assert.equal(browser.returns.length, 10);
  assert.ok(browser.returns.every(item => item.ownedPopupClosedByDriver && item.keyboardControl === 'return-chooser'
    && item.key === 'Enter' && item.focus === 'goal-select' && item.browserChromeKeyboardCloseClaimed === false));
  assert.equal(browser.lessonObservation.safeVerdict, 'PASS');
  assert.equal(browser.lessonObservation.unsafeVerdict, 'FAIL');
  assert.equal(browser.harnessObservation.totalEntriesBeforeQuery, 152);
  assert.equal(browser.harnessObservation.preparedId, 'S001');
});

test('all actual DOM raw bytes and browser CSP violations are retained without normalization', () => {
  assert.equal(browser.domSnapshots.length, 10);
  for (const item of browser.domSnapshots) {
    const bytes = zlib.gunzipSync(fs.readFileSync(path.join(repository, item.path)));
    assert.equal(bytes.length, item.bytes);
    assert.equal(hash(bytes), item.sha256);
    assert.equal(item.rawPreservedWithoutNormalization, true);
  }
  const initial = browser.domSnapshots.find(item => item.name === 'initial-validated-no-choice');
  const html = zlib.gunzipSync(fs.readFileSync(path.join(repository, initial.path))).toString('utf8');
  assert.ok(html.includes(engine.BANNER));
  assert.ok(html.includes(manifest.sourceCommit));
  assert.ok(html.includes(manifest.catalogDataSha256));
  assert.match(html, /150 accepted available portable practices/);
  assert.equal(browser.cspObservation.inlineExecuted, false);
  assert.equal(browser.cspObservation.connectionBlocked, true);
  assert.ok(browser.cspObservation.violations.some(item => item.directive === 'script-src-elem' && item.blockedURI === 'inline'));
  assert.ok(browser.cspObservation.violations.some(item => item.directive === 'connect-src'));
});

test('all earlier real browser failures remain failures with their raw DOM snapshots and exact causes retained', () => {
  const reports = fs.readdirSync(path.join(root, 'evidence', 'browser')).map(name =>
    JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'browser', name, 'report.json'))));
  const failed = reports.filter(item => item.status === 'failed');
  assert.ok(failed.length >= 3);
  assert.ok(failed.some(item => /page\.waitForURL/.test(item.failure.message)));
  assert.ok(failed.some(item => /#goal-select/.test(item.failure.message)));
  assert.ok(failed.some(item => /locator\.textContent/.test(item.failure.message)));
  for (const item of failed) {
    assert.ok(item.failure);
    assert.equal(item.browserCleanup, 'completed by awaited close() in finally');
    for (const snapshot of item.domSnapshots) {
      const bytes = zlib.gunzipSync(fs.readFileSync(path.join(repository, snapshot.path)));
      assert.equal(hash(bytes), snapshot.sha256);
    }
  }
});

test('unset, truthy-looking and whitespace-padded capture flags reject before any owned file write', () => {
  const before = digest();
  for (const value of [undefined, '', '0', 'true', ' 1', '1 ']) {
    const env = { ...process.env, NODE_DISABLE_COLORS: '1' };
    if (value === undefined) delete env.CAPTURE_BROWSER_EVIDENCE;
    else env.CAPTURE_BROWSER_EVIDENCE = value;
    const result = spawnSync(process.execPath, [path.join(__dirname, 'capture.cjs'), 'forbidden-capture', '--version'],
      { cwd: repository, env, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Only exact CAPTURE_BROWSER_EVIDENCE=1/);
  }
  assert.equal(digest(), before);
});
