'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { lesson, sha256 } = require('.\\proof.cjs');
const helper = path.resolve(lesson, '..', '..', 'testing', 'browser', 'isolated.cjs');
assert.equal(sha256(fs.readFileSync(helper)), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.resolve(lesson, '..', '..', 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;

test('actual isolated file lesson: DOM, keyboard, negative, error, reset, state and CSP', { timeout: 120000 }, async (t) => {
  assert.equal(playwrightVersion, '1.56.1');
  const session = await openIsolatedLesson('learning\\S034\\index.html');
  const { page } = session;
  const pageErrors = [];
  const networkAttempts = [];
  const checks = [];
  const observed = {};
  const check = (name, action) => t.test(name, async () => { await action(); checks.push(name); });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route(/^https?:/, async (route) => {
    networkAttempts.push(route.request().url());
    await route.abort('blockedbyclient');
  });
  try {
    await check('initial DOM is local, honestly labeled, accessible and unmutated', async () => {
      assert.match(session.browserVersion, /^156\./);
      assert.equal(await page.title(), 'S034 — Authentication-key continuity');
      assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.locator('#history tr').count(), 0);
      assert.equal(await page.locator('#summary').getAttribute('data-migration'), 'none');
      assert.equal(await page.locator('#run').isEnabled(), true);
      assert.equal(await page.evaluate(() => typeof document.getElementById('rotation-form').reset), 'function');
      observed.resources = await page.evaluate(() => ({
        scripts: [...document.scripts].map((node) => node.src),
        styles: [...document.styleSheets].map((sheet) => sheet.href),
        performanceEntries: performance.getEntriesByType('resource').map((entry) => entry.name),
        bannerBackground: getComputedStyle(document.querySelector('.banner')).backgroundColor,
        oracleLoaded: typeof window.KeyContinuity?.createLesson === 'function',
      }));
      assert.equal(observed.resources.scripts.length, 2);
      assert.equal(observed.resources.styles.length, 1);
      assert.ok([...observed.resources.scripts, ...observed.resources.styles, ...observed.resources.performanceEntries]
        .every((url) => url.startsWith('file:')));
      assert.equal(observed.resources.bannerBackground, 'rgb(255, 241, 189)');
      assert.equal(observed.resources.oracleLoaded, true);
    });

    await check('keyboard selects token and submits a successful compatible comparison', async () => {
      await page.locator('#credential').focus();
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#credential').inputValue(), 'token');
      for (const id of ['rotation', 'profiles', 'observation', 'run']) {
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), id);
      }
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'result-heading');
      assert.equal(await page.locator('#summary').getAttribute('data-migration'), 'success');
      assert.equal(await page.locator('#verification').getAttribute('data-verifier'), 'pass');
      assert.match(await page.locator('#counts').innerText(), /Attempted 4; accepted 4; rejected 0; unknown 0\. Success: 100\.00%/);
      assert.equal(await page.locator('#trace tbody tr').count(), 4);
      assert.equal(await page.locator('#trace tbody tr').filter({ hasText: 'token' }).count(), 4);
      assert.equal(await page.locator('#guards tbody tr').filter({ hasText: 'tampered fixture' }).filter({ hasText: 'rejected' }).count(), 2);
      observed.success = await page.locator('#result').innerText();
    });

    await check('incompatible cookie rotation is an interrupted migration even with a passing negative verifier', async () => {
      await page.locator('#credential').selectOption('cookie');
      await page.locator('#rotation').selectOption('drop-old');
      await page.locator('#run').click();
      assert.equal(await page.locator('#summary').getAttribute('data-migration'), 'failure');
      assert.match(await page.locator('#summary').innerText(), /interrupted transition/);
      assert.equal(await page.locator('#verification').getAttribute('data-verifier'), 'pass');
      assert.match(await page.locator('#verification').innerText(), /not migration success/);
      assert.match(await page.locator('#counts').innerText(), /accepted 0; rejected 4; unknown 0\. Success: 0\.00%/);
      assert.equal(await page.locator('#trace tbody tr').filter({ hasText: 'Authentication rejected:' }).count(), 4);
      observed.failure = await page.locator('#result').innerText();
    });

    await check('missing evidence retains the original denominator and cannot hide observed failures', async () => {
      await page.locator('#rotation').selectOption('overlap');
      await page.locator('#observation').selectOption('missing');
      await page.locator('#run').click();
      assert.equal(await page.locator('#summary').getAttribute('data-migration'), 'unknown');
      assert.equal(await page.locator('#verification').getAttribute('data-verifier'), 'unverified');
      assert.match(await page.locator('#counts').innerText(), /Attempted 4; accepted 3; rejected 0; unknown 1\. Success: 75\.00%/);
      observed.unknown = await page.locator('#result').innerText();
      await page.locator('#rotation').selectOption('drop-old');
      await page.locator('#run').click();
      assert.equal(await page.locator('#summary').getAttribute('data-migration'), 'failure');
      assert.match(await page.locator('#counts').innerText(), /accepted 0; rejected 3; unknown 1/);
      assert.equal(await page.locator('#history tr').count(), 4);
    });

    await check('invalid numeric and forged select values focus errors without modifying result or history', async () => {
      const before = await page.locator('#history').innerText();
      await page.locator('#profiles').fill('9');
      await page.locator('#run').click();
      assert.equal(await page.locator('#error').isVisible(), true);
      assert.match(await page.locator('#error').innerText(), /one digit from 1 to 8/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
      assert.equal(await page.locator('#history').innerText(), before);
      assert.equal(await page.locator('#summary').getAttribute('data-migration'), 'failure');
      await page.locator('#profiles').fill('2');
      await page.evaluate(() => {
        const select = document.getElementById('rotation');
        select.append(new Option('Injected invalid policy', 'bypass'));
        select.value = 'bypass';
      });
      await page.locator('#run').click();
      assert.match(await page.locator('#error').innerText(), /Choose overlap or incompatible rotation/);
      assert.equal(await page.locator('#history').innerText(), before);
      observed.invalidInput = await page.locator('#error').innerText();
      await page.evaluate(() => document.querySelector('#rotation option[value="bypass"]').remove());
    });

    await check('keyboard reset restores defaults and focus while retaining success, failure and unknown history', async () => {
      const before = await page.locator('#history').innerText();
      await page.locator('#reset-controls').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'credential');
      for (const [id, value] of Object.entries({ credential: 'cookie', rotation: 'overlap', profiles: '2', observation: 'complete' })) {
        assert.equal(await page.locator(`#${id}`).inputValue(), value);
      }
      assert.equal(await page.locator('#summary').getAttribute('data-migration'), 'none');
      assert.equal(await page.locator('#result').innerText(), '');
      assert.equal(await page.locator('#error').isVisible(), false);
      assert.equal(await page.locator('#history').innerText(), before);
      assert.equal(await page.locator('#history tr[data-migration="failure"]').count(), 2);
      assert.equal(await page.locator('#history tr[data-migration="unknown"]').count(), 1);
      observed.retainedHistory = before;
    });

    await check('eight-run state boundary remains closed after reset and a forced submit event', async () => {
      for (let count = 0; count < 4; count += 1) await page.locator('#run').click();
      assert.equal(await page.locator('#history tr').count(), 8);
      assert.equal(await page.locator('#history tr').last().getAttribute('data-run-id'), 'run-08');
      assert.equal(await page.locator('#run').isDisabled(), true);
      await page.locator('#reset-controls').click();
      assert.equal(await page.locator('#run').isDisabled(), true);
      await page.locator('#rotation-form').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      assert.match(await page.locator('#error').innerText(), /History limit reached/);
      assert.equal(await page.locator('#history tr').count(), 8);
      assert.equal(await page.locator('#summary').getAttribute('data-migration'), 'none');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
      observed.limit = await page.locator('#capacity').innerText();
    });

    await check('actual browser CSP blocks inline code, network connections and embedded objects', async () => {
      await page.evaluate(async () => {
        window.s034CspViolations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          window.s034CspViolations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        const script = document.createElement('script');
        script.textContent = 'window.s034InlineExecuted = true';
        document.body.append(script);
        const object = document.createElement('object');
        object.id = 'csp-object-probe';
        object.data = 'data:text/html,synthetic-probe';
        document.body.append(object);
        try {
          await fetch('https://s034.invalid/blocked');
          window.s034FetchResult = 'unexpected-success';
        } catch {
          window.s034FetchResult = 'blocked';
        }
      });
      await page.waitForFunction(() => ['script-src-elem', 'connect-src', 'object-src']
        .every((directive) => window.s034CspViolations.some((entry) => entry.directive === directive)));
      assert.equal(await page.evaluate(() => window.s034InlineExecuted), undefined);
      assert.equal(await page.evaluate(() => window.s034FetchResult), 'blocked');
      assert.equal(await page.locator('#csp-object-probe').evaluate((node) => node.contentDocument === null), true);
      observed.cspViolations = await page.evaluate(() => window.s034CspViolations);
      assert.deepEqual(networkAttempts, []);
      assert.deepEqual(pageErrors, []);
    });
    assert.equal(checks.length, 8);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(networkAttempts, []);
  } finally {
    await session.close();
  }
  if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
    const name = process.env.S034_CAPTURE_NAME;
    assert.match(name || '', /^browser-\d{3}$/);
    fs.writeFileSync(path.join(lesson, 'evidence', `${name}.observation.json`), `${JSON.stringify({
      cardId: 'A-S034', workerId: 'worker-A-S034', mode: 'actual-browser-synthetic-lesson',
      capturedAtUtc: new Date().toISOString(), node: process.version, playwrightVersion,
      browserVersion: session.browserVersion, helperSha256: sha256(fs.readFileSync(helper)),
      entry: 'learning\\S034\\index.html', checks, observed, pageErrors, networkAttempts,
      cleanup: 'awaited session.close() in finally completed', result: 'pass',
      limits: 'No native Azure, real authentication, production Node.js 24 or source-parent certification.',
    }, null, 2)}\n`, { flag: 'wx' });
  }
});
