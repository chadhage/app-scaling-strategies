'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { captureBrowserEvidence } = require('..\\capture.cjs');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const helperPath = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const source = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'source-seal.json')));
const helperRaw = fs.readFileSync(helperPath);
assert.ok([source.helper.workingRawSha256, source.helper.canonicalGitSha256].includes(hash(helperRaw)));
assert.equal(hash(Buffer.from(helperRaw.toString('utf8').replace(/\r\n/g, '\n'))), source.helper.canonicalGitSha256);
const { openIsolatedLesson } = require(helperPath);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;

test('actual isolated DOM, keyboard, negative/unknown, error/reset, asset-failure and CSP observations', async () => {
  assert.equal(playwrightVersion, '1.56.1');
  assert.equal(process.versions.node.split('.')[0], '22');
  const checks = [];
  const requests = new Set();
  const pageErrors = [];
  const browserVersions = [];
  let closedSessions = 0;
  const observed = (id, observations) => checks.push({ id, passed: true, observations });
  const lessonPath = path.join('learning', 'S127', 'index.html');
  const session = await openIsolatedLesson(lessonPath);
  try {
    browserVersions.push(session.browserVersion);
    assert.match(session.browserVersion, /^156\./);
    const page = session.page;
    page.on('request', (request) => { requests.add(request.url()); });
    page.on('pageerror', (error) => { pageErrors.push(error.message); });
    const current = async () => JSON.parse(await page.locator('#current-trace').innerText());
    const result = async () => (await current()).result;
    async function fresh() {
      await page.reload({ waitUntil: 'load' });
      assert.equal(await page.locator('#choose-settings').isEnabled(), true);
    }
    async function conduct(overrides = {}) {
      const controls = {
        maxUnavailable: '#max-unavailable', maxSurge: '#max-surge', probe: '#probe-policy',
        headroom: '#headroom-record', observation: '#observation-record',
      };
      for (const [name, selector] of Object.entries(controls)) {
        if (Object.hasOwn(overrides, name)) await page.locator(selector).selectOption(String(overrides[name]));
      }
      if (Object.hasOwn(overrides, 'graceSeconds')) await page.locator('#grace-seconds').fill(String(overrides.graceSeconds));
      await page.locator('#choose-settings').click();
      await page.locator('#observe-data').click();
      await page.locator('#rehearse-step').click();
      if (await page.locator('#drain-work').isEnabled()) await page.locator('#drain-work').click();
      return result();
    }

    assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
    assert.equal(await page.locator('h1').innerText(), 'S127: readiness, surge, rollout and grace');
    assert.equal(await page.locator('#observe-data').isDisabled(), true);
    assert.equal(await page.locator('#reset-lesson').isEnabled(), true);
    observed('initial-labelled-training-surface', { title: await page.title(), banner: await page.locator('.banner').innerText(), status: await page.locator('#lesson-status').innerText() });

    await page.locator('#max-unavailable').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'max-surge');
    await page.locator('#choose-settings').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'observe-data');
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'rehearse-step');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'drain-work');
    await page.keyboard.press('Space');
    const positive = await result();
    assert.equal(positive.successfulTransitions, 2);
    assert.equal(positive.interruptedTransitions, 0);
    assert.equal(positive.readyFloor, 3);
    assert.equal(positive.peakPods, 4);
    assert.equal(positive.drain.availableSeconds, 16);
    assert.equal(positive.drain.succeeded, 2);
    assert.equal(positive.verification, 'pass');
    observed('keyboard-positive-rollout-grace', { result: positive, displayed: await page.locator('#current-result').innerText() });

    await page.locator('#compare-disruption').focus();
    await page.keyboard.press('Enter');
    const permitted = await page.locator('#disruption-result').innerText();
    assert.match(permitted, /PDB applies true; eviction allowed true/);
    assert.match(permitted, /ready after 2; required 3/);
    assert.match(permitted, /2 interrupted/);
    assert.deepEqual(await result(), positive);
    observed('pdb-permitted-eviction-not-capacity-guarantee', { displayed: permitted, rolloutUnchanged: true });

    await page.locator('#reset-lesson').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'max-unavailable');
    assert.equal(await page.locator('#grace-seconds').inputValue(), '20');
    assert.equal(await page.locator('#retained-history li').count(), 6);
    assert.match(await page.locator('#retained-history').innerText(), /insufficient-surviving-capacity/);
    const nativeReset = await page.evaluate(() => ({
      type: typeof document.getElementById('settings-form').reset,
      shadow: document.getElementById('settings-form').elements.namedItem('reset') !== null,
    }));
    assert.deepEqual(nativeReset, { type: 'function', shadow: false });
    observed('keyboard-reset-retains-history-native-reset-unshadowed', { nativeReset, count: await page.locator('#history-count').innerText(), current: await page.locator('#current-result').innerText() });

    await page.locator('#grace-seconds').fill('20.0');
    await page.locator('#choose-settings').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'lesson-error');
    assert.match(await page.locator('#lesson-error').innerText(), /ERR_INPUT.*exactly 10 \/ 20/);
    assert.equal(await page.locator('#grace-seconds').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('#retained-history li').count(), 6);
    observed('canonical-input-error-focus-no-state-mutation', { alert: await page.locator('#lesson-error').innerText(), historyEntries: 6 });
    await page.locator('#grace-seconds').fill('20');
    await page.locator('#choose-settings').click();
    assert.equal(await page.locator('#lesson-error').isHidden(), true);
    assert.equal(await page.locator('#grace-seconds').getAttribute('aria-invalid'), null);
    observed('input-error-recovery', { phase: await page.locator('#lesson-status').innerText() });

    const beforeStageError = await page.locator('#history-count').innerText();
    await page.evaluate(() => { document.getElementById('rehearse-step').disabled = false; });
    await page.locator('#rehearse-step').click();
    assert.match(await page.locator('#lesson-error').innerText(), /ERR_STATE/);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'lesson-error');
    assert.equal(await page.locator('#history-count').innerText(), beforeStageError);
    observed('dom-reenabled-control-still-enforces-stage-guard', { alert: await page.locator('#lesson-error').innerText(), unchangedHistory: beforeStageError });

    await fresh();
    const deficit = await conduct({ maxUnavailable: 1 });
    assert.equal(deficit.readyFloor, 2);
    assert.equal(deficit.interruptedTransitions, 1);
    assert.equal(deficit.verification, 'fail');
    observed('availability-deficit-is-negative-not-pdb-protected', { result: deficit });
    await page.evaluate(() => { document.getElementById('drain-work').disabled = false; });
    const finishedCount = await page.locator('#history-count').innerText();
    await page.locator('#drain-work').click();
    assert.match(await page.locator('#lesson-error').innerText(), /ERR_STATE/);
    assert.deepEqual(await result(), deficit);
    assert.equal(await page.locator('#history-count').innerText(), finishedCount);
    observed('finished-result-cannot-be-repaired-by-repeated-drain', { alert: await page.locator('#lesson-error').innerText(), unchangedResult: true });

    await fresh();
    const short = await conduct({ graceSeconds: 10 });
    assert.equal(short.drain.availableSeconds, 6);
    assert.equal(short.drain.interrupted, 2);
    assert.equal(short.verification, 'fail');
    observed('prestop-inside-short-grace-interrupts-old-work', { result: short });
    await page.locator('#reset-lesson').click();
    const unknownState = await conduct({ observation: 'state-unknown' });
    assert.equal(unknownState.unknownTransitions, 2);
    assert.equal(unknownState.successfulTransitions, 0);
    assert.equal(unknownState.verification, 'unverified');
    observed('unknown-business-state-not-success', { result: unknownState });
    await page.locator('#reset-lesson').click();
    const laterPositive = await conduct();
    assert.equal(laterPositive.verification, 'pass');
    await page.locator('#reset-lesson').click();
    const retained = await page.locator('#retained-history').innerText();
    assert.match(retained, /Verification fail; transition interrupted/);
    assert.match(retained, /Verification unverified; transition unknown/);
    assert.match(retained, /Verification pass; transition uninterrupted-step/);
    assert.match(retained, /2 interrupted; PreStop 4s; remaining grace 6s/);
    assert.equal(await page.locator('#grace-seconds').inputValue(), '20');
    observed('reset-and-positive-do-not-erase-negative-or-unknown', { count: await page.locator('#history-count').innerText(), retained });

    await fresh();
    const mismatch = await conduct({ observation: 'state-failed' });
    assert.equal(mismatch.journeys.every((journey) => journey.http === 200), true);
    assert.equal(mismatch.interruptedTransitions, 2);
    assert.equal(mismatch.verification, 'fail');
    observed('green-probes-http200-incompatible-state-negative', { result: mismatch });

    for (const [id, overrides, expected] of [
      ['full-surge-headroom-safe-abort', { headroom: 'full' }, 'pass'],
      ['failed-readiness-safe-abort', { observation: 'readiness-failed' }, 'pass'],
      ['unknown-surge-headroom-hold', { headroom: 'unknown' }, 'unverified'],
      ['unknown-readiness-hold', { observation: 'readiness-unknown' }, 'unverified'],
      ['startup-only-not-readiness', { probe: 'startup-only' }, 'unverified'],
      ['desired-replicas-not-observed-ready', { observation: 'desired-only' }, 'unverified'],
    ]) {
      await fresh();
      const held = await conduct(overrides);
      assert.equal(held.held, true);
      assert.equal(held.verification, expected);
      assert.equal(held.attemptedTransitions, 0);
      assert.equal(held.successfulTransitions, 0);
      assert.equal(held.oldOnly.succeeded, 2);
      assert.equal(await page.locator('#drain-work').isDisabled(), true);
      if (overrides.observation === 'desired-only') {
        assert.equal(held.desiredReplicas, 3);
        assert.equal(held.observedReadyBefore, 1);
        assert.equal(held.unknownOldReadiness, 1);
      }
      if (overrides.probe === 'startup-only') assert.equal(held.observedReadyBefore, 0);
      observed(id, { result: held, displayed: await page.locator('#current-result').innerText() });
    }

    for (const [kind, ready, outcome] of [
      ['eviction-two', '3', 'blocked-voluntary-eviction'],
      ['node-loss', '2', 'insufficient-surviving-capacity'],
      ['zone-loss', '2', 'insufficient-surviving-capacity'],
      ['region-loss', '0', 'insufficient-surviving-capacity'],
      ['unrecorded', 'unknown', 'unknown'],
    ]) {
      await fresh();
      const stableRollout = await conduct();
      await page.locator('#disruption-record').selectOption(kind);
      await page.locator('#compare-disruption').click();
      const displayed = await page.locator('#disruption-result').innerText();
      assert.ok(displayed.includes(outcome));
      assert.ok(displayed.includes(`Observed ready after ${ready}; required 3`));
      assert.ok(displayed.includes(`PDB applies ${kind.startsWith('eviction-')}`));
      assert.match(displayed, /No universal node\/zone\/region protection/);
      assert.deepEqual(await result(), stableRollout);
      assert.equal(await page.locator('#compare-disruption').isDisabled(), true);
      observed(`independent-${kind}`, { displayed, rollingResultUnchanged: true });
    }

    await fresh();
    const csp = await page.evaluate(async () => {
      const violations = [];
      const listener = (event) => violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
      document.addEventListener('securitypolicyviolation', listener);
      const script = document.createElement('script');
      script.textContent = 'globalThis.__s127InlineExecuted = true;';
      document.body.append(script);
      const probe = document.createElement('span');
      probe.id = 's127-csp-probe';
      probe.textContent = 'CSP observation probe';
      document.body.append(probe);
      const beforeColor = getComputedStyle(probe).color;
      const style = document.createElement('style');
      style.textContent = '#s127-csp-probe { color: rgb(1, 2, 3); }';
      document.body.append(style);
      const image = document.createElement('img');
      image.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"></svg>';
      document.body.append(image);
      let fetchError = null;
      try { await fetch(location.href); } catch (error) { fetchError = error.name; }
      const form = document.createElement('form');
      form.action = location.href;
      form.method = 'get';
      document.body.append(form);
      form.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const observations = { violations, inlineExecuted: globalThis.__s127InlineExecuted === true, fetchError, beforeColor, afterColor: getComputedStyle(probe).color, location: location.href };
      [script, probe, style, image, form].forEach((element) => element.remove());
      document.removeEventListener('securitypolicyviolation', listener);
      return observations;
    });
    assert.equal(csp.inlineExecuted, false);
    assert.equal(csp.fetchError, 'TypeError');
    assert.equal(csp.beforeColor, csp.afterColor);
    for (const directive of ['script-src-elem', 'style-src-elem', 'img-src', 'connect-src', 'form-action']) {
      assert.ok(csp.violations.some((violation) => violation.directive === directive), directive);
    }
    assert.equal(page.url(), csp.location);
    observed('actual-csp-blocks-inline-style-image-connect-form', csp);
    assert.deepEqual(pageErrors, []);
    assert.equal([...requests].every((url) => url.startsWith('file:')), true);
    observed('local-file-only-no-unexpected-page-errors', { requests: [...requests], pageErrors });
  } finally {
    await session.close();
    closedSessions++;
  }

  for (const [file, expected, modelAvailable] of [
    ['missing-model.html', /required model asset did not load/, false],
    ['missing-app.html', /An asset failed; controls remain unavailable/, true],
  ]) {
    const failed = await openIsolatedLesson(path.join('learning', 'S127', 'tests', 'fixtures', file));
    try {
      browserVersions.push(failed.browserVersion);
      const status = await failed.page.locator('#lesson-status').innerText();
      assert.match(status, expected);
      assert.equal(await failed.page.locator('button').isDisabled(), true);
      assert.equal(await failed.page.locator('input').isDisabled(), true);
      assert.equal(await failed.page.evaluate(() => typeof globalThis.S127Lesson !== 'undefined'), modelAvailable);
      if (!modelAvailable) {
        assert.equal(await failed.page.locator('#lesson-error').isVisible(), true);
        assert.match(await failed.page.locator('#lesson-error').innerText(), /controls remain unavailable/);
      }
      observed(`actual-startup-${file}`, { title: await failed.page.title(), status, controlsDisabled: true, modelAvailable });
    } finally {
      await failed.close();
      closedSessions++;
    }
  }

  const report = {
    schemaVersion: 1, cardId: 'A-S127', kano: 'S', kanoUnit: 'A-S127', packet: 'SC-S127',
    mode: 'actual isolated browser DOM on fixed fictional teaching DATA ONLY',
    banner: 'Training rehearsal - synthetic data - not a live Azure result',
    observedAtUtc: new Date().toISOString(),
    tooling: { runtime: process.version, playwright: playwrightVersion, browserVersions, helperWorkingRawSha256: hash(helperRaw), helperPinnedRawSha256: source.helper.workingRawSha256, helperCanonicalGitSha256: source.helper.canonicalGitSha256, helperPublishedCommit: source.helper.publishedCommit },
    checks,
    cleanup: { sessionsOpened: 3, sessionsClosed: closedSessions, awaitedFinallyClose: true },
    qualification: { native: false, sourceParentComplete: false, productionNode24: false, unattendedLifecycleRecovery: false, additionalCredits: 0 },
  };
  assert.equal(closedSessions, 3);
  assert.equal(checks.every((check) => check.passed), true);
  const captured = captureBrowserEvidence(report);
  console.log(JSON.stringify({ cardId: report.cardId, actualBrowserGroups: checks.length, captured, cleanup: report.cleanup, browserVersions }));
});
