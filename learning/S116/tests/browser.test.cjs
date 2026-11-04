'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const helperPath = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const helperSha256 = crypto.createHash('sha256').update(fs.readFileSync(helperPath)).digest('hex');
assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helperPath);
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const bytes = (folder = root, result = {}) => {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const target = path.join(folder, entry.name);
    if (entry.isDirectory()) bytes(target, result);
    else result[path.relative(root, target).split(path.sep).join('/')] =
      crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
  }
  return result;
};
const save = (name, proof) => {
  if (capture) fs.writeFileSync(path.join(root, 'evidence', name), `${JSON.stringify(proof, null, 2)}\n`);
};

test('actual isolated DOM, keyboard, negative/unknown impact, guards, reset, limit and CSP', { timeout: 120000 }, async () => {
  const before = bytes();
  const proof = {
    cardId: 'A-S116', mode: 'synthetic', helper: 'openIsolatedLesson', helperSha256,
    recordedAtUtc: new Date().toISOString(), browserObservations: [],
    nativeAzureValidated: false, sourceParentValidated: false, productionNode24Validated: false,
    captureWasDeliberate: capture, normalOwnedVerificationReadOnly: false, awaitedFinallyClose: false,
  };
  try {
    let session;
    try {
      session = await openIsolatedLesson('learning\\S116\\index.html');
      const { page } = session;
      proof.browserVersion = session.browserVersion;
      proof.nodeVersion = process.version;
      proof.playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
      assert.equal(proof.playwrightVersion, '1.56.1');
      assert.match(proof.browserVersion, /^156\./);
      const errors = [];
      const networkRequests = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        if (/^https?:/.test(request.url())) networkRequests.push(request.url());
      });
      assert.equal(await page.locator('#training-banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.locator('#history-output > li').count(), 0);
      assert.equal(await page.locator('#observe-form').evaluate((form) => typeof form.reset), 'function');
      assert.equal(await page.locator('[name="reset"], [id="reset"]').count(), 0);
      const current = page.locator('#current-output');
      const record = page.locator('#observe-button');
      const history = page.locator('#history-output > li');
      const active = () => page.evaluate(() => document.activeElement.id);
      const status = () => current.locator('[data-overall]').getAttribute('data-overall');
      const snapshot = async (label) => ({
        label, outcome: await status(), currentDOM: await current.innerText(),
        totalsDOM: await page.locator('#totals').innerText(), retainedRecords: await history.count(),
      });

      await page.locator('#trace-choice').focus();
      await page.keyboard.press('Tab');
      assert.equal(await active(), 'action-choice');
      await page.keyboard.press('Tab');
      assert.equal(await active(), 'observe-button');
      await page.keyboard.press('Enter');
      assert.equal(await status(), 'unknown');
      assert.match(await current.innerText(), /Write routes: unknown/);
      assert.equal(await current.locator('[data-check="both-serving"]').getAttribute('data-result'), 'positive');
      proof.browserObservations.push(await snapshot('keyboard serving-only; unknown writing proof'));

      const retainedBeforeInvalid = await history.count();
      await page.locator('#trace-choice').evaluate((select) => { select.value = 'forged-token'; });
      await record.click();
      assert.equal(await active(), 'error-output');
      assert.match(await page.locator('#error-output').innerText(), /Invalid input/);
      assert.equal(await history.count(), retainedBeforeInvalid);
      proof.invalidInput = { focusedError: true, unchangedHistory: true, actualDOM: await page.locator('#error-output').innerText() };
      await page.locator('#restart-button').focus();
      await page.keyboard.press('Enter');
      assert.equal(await active(), 'trace-choice');
      assert.equal(await page.locator('#trace-choice').inputValue(), 'supported');
      assert.equal(await page.locator('#action-choice').inputValue(), 'inspect-serving');
      assert.equal(await history.count(), 1);
      assert.equal(await page.locator('#error-output').isHidden(), true);
      assert.match(await current.innerText(), /No observation yet/);
      proof.keyboardReset = { defaultsRestored: true, currentCleared: true, focusedFirstControl: true, historyRetained: 1 };

      await page.locator('#action-choice').focus();
      await page.keyboard.press('End');
      assert.equal(await page.locator('#action-choice').inputValue(), 'verify-contract');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      assert.equal(await status(), 'positive');
      assert.match(await current.innerText(), /region-two[\s\S]*region-one[\s\S]*forwarded/);
      assert.match(await current.innerText(), /Both readers return revision 11/);
      proof.browserObservations.push(await snapshot('keyboard supported writer and consistency'));

      await page.locator('#trace-choice').focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#trace-choice').inputValue(), 'stale-reader');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      assert.equal(await status(), 'negative');
      assert.match(await current.innerText(), /revision 10 is below client minimum 11/);
      assert.equal(await current.locator('[data-check="both-serving"]').getAttribute('data-result'), 'positive');
      assert.equal(await current.locator('[data-check="read-your-writes"]').getAttribute('data-result'), 'negative');
      proof.browserObservations.push(await snapshot('keyboard stale reader: serving positive, contract negative'));

      await page.selectOption('#trace-choice', 'writer-unobserved');
      await record.click();
      assert.equal(await status(), 'unknown');
      assert.match(await current.innerText(), /unknown \(unobserved\)/);
      assert.equal(await current.locator('[data-check="mutation-outcome"]').getAttribute('data-result'), 'unknown');
      proof.browserObservations.push(await snapshot('missing writer/epoch/effect/duration remain unknown'));

      for (const [scenario, protectiveCheck, outcome] of [
        ['stale-epoch', 'epoch-fencing', 'rejected-stale-epoch'],
        ['version-conflict', 'conflict-handling', 'rejected-revision-conflict'],
        ['local-writer', 'writer-topology', 'rejected-unsupported-writer'],
      ]) {
        await page.selectOption('#trace-choice', scenario);
        await record.click();
        assert.equal(await status(), 'negative');
        assert.match(await current.innerText(), new RegExp(outcome));
        assert.equal(await current.locator('[data-check="mutation-outcome"]').getAttribute('data-result'), 'negative');
        assert.equal(await current.locator(`[data-check="${protectiveCheck}"]`).getAttribute('data-result'), scenario === 'local-writer' ? 'negative' : 'positive');
        proof.browserObservations.push({
          label: scenario, overall: await status(), protectiveCheck,
          protectiveResult: await current.locator(`[data-check="${protectiveCheck}"]`).getAttribute('data-result'),
          mutationCheckDOM: await current.locator('[data-check="mutation-outcome"]').innerText(),
        });
      }
      assert.equal(await history.count(), 7);
      assert.match(await page.locator('#totals').innerText(), /Positive 1 \| Negative 4 \| Unknown 2/);
      const retainedSummaries = await page.locator('#history-output summary').allTextContents();
      assert.ok(retainedSummaries.some((text) => text.includes('NEGATIVE')));
      assert.ok(retainedSummaries.some((text) => text.includes('UNKNOWN')));
      assert.ok(retainedSummaries.some((text) => text.includes('POSITIVE')));
      proof.retainedHistory = { summaries: retainedSummaries, negative: 4, unknown: 2, positive: 1 };

      await page.selectOption('#trace-choice', 'supported');
      for (let index = 7; index < 12; index += 1) await record.click();
      assert.equal(await history.count(), 12);
      await record.click();
      assert.equal(await active(), 'error-output');
      assert.match(await page.locator('#error-output').innerText(), /12-observation allowance is exhausted/);
      assert.equal(await history.count(), 12);
      proof.limitError = { focusedError: true, retainedRecords: 12, actualDOM: await page.locator('#error-output').innerText() };
      await page.locator('#restart-button').focus();
      await page.keyboard.press('Enter');
      assert.equal(await active(), 'trace-choice');
      assert.equal(await history.count(), 12);
      assert.match(await page.locator('#totals').innerText(), /Recorded 12\/12 \| Positive 6 \| Negative 4 \| Unknown 2 \| Remaining 0/);
      assert.match(await current.innerText(), /No observation yet/);
      proof.finalReset = { retainedRecords: 12, defaultsRestored: true, focusedFirstControl: true, totalsDOM: await page.locator('#totals').innerText() };

      await page.evaluate(() => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL('tests/csp-probe.js', document.baseURI).href;
        script.addEventListener('load', resolve);
        script.addEventListener('error', () => reject(Error('Local page-owned CSP probe did not load')));
        document.head.append(script);
      }));
      await page.waitForFunction(() => window.S116CspProbe?.complete
        && window.S116CspProbe.violations.length >= 3);
      const csp = await page.evaluate(() => window.S116CspProbe);
      assert.equal(csp.inlineRan, false);
      assert.equal(csp.evalRan, false);
      assert.equal(csp.evalError.name, 'EvalError');
      assert.equal(csp.connectionResult, 'TypeError');
      assert.ok(csp.violations.some((entry) => entry.effectiveDirective.startsWith('script-src') && entry.blockedURI === 'inline'));
      assert.ok(csp.violations.some((entry) => entry.effectiveDirective.startsWith('script-src') && entry.blockedURI === 'eval'));
      assert.ok(csp.violations.some((entry) => entry.effectiveDirective === 'connect-src' && entry.blockedURI === 'data'));
      assert.ok(csp.violations.every((entry) => entry.disposition === 'enforce'));
      proof.csp = { ...csp, pageOwnedExternalLocalProbe: true, devtoolsEvaluationUsedAsOracle: false, noRemoteURL: true };
      assert.deepEqual(errors, []);
      assert.deepEqual(networkRequests, []);
      proof.unexpectedPageErrors = errors;
      proof.httpRequests = networkRequests;
    } finally {
      if (session) {
        await session.close();
        proof.awaitedFinallyClose = true;
      }
    }
    const after = bytes();
    assert.deepEqual(after, before, 'Browser verification must not rewrite any owned file');
    proof.normalOwnedVerificationReadOnly = true;
    proof.ownedFilesUnchanged = Object.keys(before).length;
    proof.passed = true;
    save('browser-acceptance.json', proof);
  } catch (error) {
    save(`browser-failed-${Date.now()}.json`, { ...proof, passed: false, failure: { name: error.name, message: error.message } });
    throw error;
  }
});
