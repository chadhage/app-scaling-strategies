'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..', '..', '..');
const helperPath = path.join(root, 'testing', 'browser', 'isolated.cjs');
const helperSha256 = crypto.createHash('sha256').update(fs.readFileSync(helperPath)).digest('hex');
assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helperPath);

test('S027 actual isolated DOM, keyboard, errors, reset and CSP', { timeout: 120000 }, async (t) => {
  const observations = {
    schemaVersion: 1,
    cardId: 'A-S027',
    packet: 'SC-S027',
    mode: 'synthetic',
    startedAtUtc: new Date().toISOString(),
    helper: 'testing\\browser\\isolated.cjs',
    helperSha256,
    helperPublishedCommit: '53c0c0d',
    checks: [],
    pageErrors: [],
    nonFileRequestsReachedGuard: 0,
    cleanup: 'NOT_YET_CLOSED',
  };
  let session;
  try {
    session = await openIsolatedLesson('learning\\S027\\index.html');
    const { page } = session;
    observations.browserVersion = session.browserVersion;
    assert.equal(session.browserVersion, '156.0.4314.50');
    page.on('pageerror', (error) => observations.pageErrors.push(error.message));
    await page.route('**/*', (route) => {
      if (new URL(route.request().url()).protocol === 'file:') return route.continue();
      observations.nonFileRequestsReachedGuard++;
      return route.abort('blockedbyclient');
    });
    const text = (selector) => page.locator(selector).textContent();
    const rows = () => page.locator('#history > tr').count();
    const check = async (name, action) => {
      await t.test(name, async () => {
        const observed = await action();
        observations.checks.push({ name, verifier: 'PASS', observed });
      });
    };
    const enterCheck = async () => {
      await page.locator('#check-candidate').focus();
      await page.keyboard.press('Enter');
    };
    const reset = async () => {
      await page.locator('#clear-session').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#fixture').evaluate((element) => element === document.activeElement), true);
    };

    await check('exact banner, native controls and keyboard skip link load', async () => {
      assert.equal(await text('.banner'), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.title(), 'S027 — False-positive health response');
      assert.equal(await page.locator('#fixture').inputValue(), 'error-500');
      assert.equal(await page.locator('#prediction').inputValue(), 'HOLD');
      assert.equal(await rows(), 0);
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('.skip').evaluate((element) => element === document.activeElement), true);
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#exercise').evaluate((element) => element === document.activeElement), true);
      return { title: await page.title(), banner: await text('.banner'), checks: await rows() };
    });

    await check('500 fails original status, leaves business unknown, predicts safe hold', async () => {
      await enterCheck();
      assert.equal(await text('#response-status'), '500');
      assert.equal(await text('#status-check'), 'FAILURE');
      assert.equal(await text('#business-check'), 'UNKNOWN');
      assert.equal(await text('#readiness'), 'FAILURE');
      assert.equal(await text('#gate'), 'HOLD');
      assert.equal(await text('#prediction-verifier'), 'PASS');
      assert.deepEqual(await page.locator('#success-count, #failure-count, #unknown-count').allTextContents(), ['0', '1', '1']);
      assert.equal(await rows(), 1);
      return { verdict: await text('#verdict'), counts: ['0', '1', '1'], trace: await text('#trace') };
    });

    await check('arrow-key 302 selection rejects the redirect without navigating', async () => {
      await page.locator('#fixture').focus();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#fixture').inputValue(), 'redirect-302');
      await enterCheck();
      assert.equal(await text('#response-status'), '302');
      assert.equal(await text('#gate'), 'HOLD');
      assert.match(await text('#raw-response'), /\/sign-in/);
      assert.match(await text('#trace'), /not followed/);
      assert.match(new URL(page.url()).pathname, /\/S027\/index\.html$/);
      assert.equal(new URL(page.url()).protocol, 'file:');
      return { originalStatus: await text('#response-status'), trace: await text('#trace'), url: page.url() };
    });

    await check('misleading 200 rejects wrong profile even when the learner predicts ADMIT', async () => {
      await page.selectOption('#fixture', 'misleading-200');
      await page.selectOption('#prediction', 'ADMIT');
      await enterCheck();
      assert.equal(await text('#status-check'), 'SUCCESS');
      assert.equal(await text('#business-check'), 'FAILURE');
      assert.equal(await text('#gate'), 'HOLD');
      assert.equal(await text('#prediction-verifier'), 'FAIL');
      assert.deepEqual(await page.locator('#success-count, #failure-count, #unknown-count').allTextContents(), ['1', '1', '0']);
      assert.match(await text('#raw-response'), /"ready": true/);
      assert.match(await text('#raw-response'), /wrong-profile/);
      return { verdict: await text('#verdict'), rawResponse: await text('#raw-response') };
    });

    await check('valid 200 passes both assertions without reporting a performed promotion', async () => {
      await page.selectOption('#fixture', 'ready-200');
      await enterCheck();
      assert.equal(await text('#readiness'), 'SUCCESS');
      assert.equal(await text('#gate'), 'ADMIT');
      assert.equal(await text('#prediction-verifier'), 'PASS');
      assert.deepEqual(await page.locator('#success-count, #failure-count, #unknown-count').allTextContents(), ['2', '0', '0']);
      assert.match(await text('#verdict'), /No promotion performed/);
      assert.match(await text('#impact'), /v1 100%, v2 0%/);
      assert.match(await text('#impact'), /UNMEASURED, zero attempts/);
      return { verdict: await text('#verdict'), impact: await text('#impact') };
    });

    await check('unobserved business response remains UNKNOWN and holds eligibility', async () => {
      await page.selectOption('#fixture', 'unobserved-200');
      await page.selectOption('#prediction', 'HOLD');
      await enterCheck();
      assert.equal(await text('#readiness'), 'UNKNOWN');
      assert.equal(await text('#gate'), 'HOLD');
      assert.equal(await text('#prediction-verifier'), 'PASS');
      assert.deepEqual(await page.locator('#success-count, #failure-count, #unknown-count').allTextContents(), ['1', '0', '1']);
      assert.equal(await rows(), 5);
      return { verdict: await text('#verdict'), counts: ['1', '0', '1'] };
    });

    await check('settings invalidate only current output and retain prior configurations and failed answers', async () => {
      const before = await text('#history');
      await page.selectOption('#fixture', 'error-500');
      assert.equal(await page.locator('#result').isHidden(), true);
      assert.equal(await rows(), 5);
      assert.equal(await text('#history'), before);
      assert.match(before, /misleading-200/);
      assert.match(before, /ADMIT \/ FAIL/);
      assert.match(before, /UNKNOWN \/ HOLD/);
      assert.match(before, /"trace"/);
      return { retainedChecks: await rows(), currentInvalidated: true, historyText: before };
    });

    await check('forged DOM fixture is rejected with a focused alert and reset recovers', async () => {
      await page.locator('#fixture').evaluate((select) => {
        const option = document.createElement('option');
        option.value = 'bypass';
        option.textContent = 'Invalid test-only option';
        select.append(option);
        select.value = 'bypass';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      assert.equal(await page.locator('#problem').isVisible(), true);
      assert.match(await text('#problem'), /fixture is unsupported/);
      assert.equal(await page.locator('#problem').evaluate((element) => element === document.activeElement), true);
      await enterCheck();
      assert.equal(await rows(), 5);
      const focusedError = await text('#problem');
      await reset();
      assert.equal(await rows(), 0);
      assert.equal(await page.locator('#problem').isHidden(), true);
      assert.equal(await page.locator('#result').isHidden(), true);
      assert.equal(await page.locator('#fixture').inputValue(), 'error-500');
      await page.locator('#fixture option[value="bypass"]').evaluate((option) => option.remove());
      return { focusedError, afterReset: await text('#session-status') };
    });

    await check('ninth check is rejected without evicting any of eight retained failures', async () => {
      for (let i = 0; i < 8; i++) await enterCheck();
      const before = await text('#history');
      await enterCheck();
      assert.equal(await rows(), 8);
      assert.equal(await text('#history'), before);
      assert.match(await text('#problem'), /limit eight \(8\)/);
      assert.match(await text('#problem'), /No history was evicted/);
      assert.equal(await page.locator('#problem').evaluate((element) => element === document.activeElement), true);
      return { checks: await rows(), rejection: await text('#problem') };
    });

    await check('retained traces and repeated reset are keyboard operable without reset shadowing', async () => {
      const summary = page.locator('#history summary').first();
      await summary.focus();
      await page.keyboard.press('Enter');
      assert.equal(await summary.evaluate((element) => element.parentElement.open), true);
      assert.equal(await page.locator('#exercise').evaluate((form) => typeof form.reset), 'function');
      await reset();
      await enterCheck();
      assert.equal(await rows(), 1);
      await reset();
      await reset();
      assert.equal(await rows(), 0);
      assert.equal(await page.locator('#prediction').inputValue(), 'HOLD');
      assert.equal(await page.locator('#problem').isHidden(), true);
      return { resetIsNativeMethod: true, keyboardDetailsOpened: true, retainedAfterReset: await rows() };
    });

    await check('actual CSP blocks inline code, inline handlers and fetch before the route guard', async () => {
      await page.evaluate(() => {
        globalThis.__s027Violations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          globalThis.__s027Violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        const script = document.createElement('script');
        script.textContent = 'globalThis.__s027InlineRan = true';
        document.body.append(script);
        script.remove();
        const button = document.createElement('button');
        button.id = 'csp-probe';
        button.type = 'button';
        button.textContent = 'Test-only CSP probe';
        button.setAttribute('onclick', 'globalThis.__s027HandlerRan = true');
        document.body.append(button);
      });
      await page.locator('#csp-probe').click();
      const connection = await page.evaluate(async () => {
        try { await fetch('https://example.invalid/s027-csp'); return 'unexpectedly allowed'; }
        catch (error) { return error.name; }
      });
      await page.waitForFunction(() => globalThis.__s027Violations.length >= 3);
      const proof = await page.evaluate(() => ({
        inlineRan: globalThis.__s027InlineRan === true,
        handlerRan: globalThis.__s027HandlerRan === true,
        violations: globalThis.__s027Violations,
      }));
      assert.equal(connection, 'TypeError');
      assert.equal(proof.inlineRan, false);
      assert.equal(proof.handlerRan, false);
      for (const directive of ['script-src-elem', 'script-src-attr', 'connect-src']) {
        assert.ok(proof.violations.some((violation) => violation.directive === directive), directive);
      }
      assert.equal(observations.nonFileRequestsReachedGuard, 0);
      await page.locator('#csp-probe').evaluate((element) => element.remove());
      return { ...proof, connection, nonFileRequestsReachedGuard: observations.nonFileRequestsReachedGuard };
    });

    await check('narrow viewport preserves controls, local resources and an error-free lesson', async () => {
      await page.setViewportSize({ width: 375, height: 812 });
      const measured = await page.evaluate(() => ({
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        resources: performance.getEntriesByType('resource').map((entry) => entry.name),
        frameCount: window.frames.length,
      }));
      assert.ok(measured.documentWidth <= measured.viewport);
      assert.equal(await page.locator('#check-candidate').isVisible(), true);
      assert.equal(await page.locator('#clear-session').isVisible(), true);
      assert.equal(measured.frameCount, 0);
      assert.ok(measured.resources.filter((url) => !url.includes('s027-csp')).every((url) => url.startsWith('file:')));
      assert.deepEqual(observations.pageErrors, []);
      assert.equal(observations.nonFileRequestsReachedGuard, 0);
      return measured;
    });
  } finally {
    if (session) {
      await session.close();
      observations.cleanup = 'AWAITED_CLOSE_RESOLVED';
    }
    observations.completedAtUtc = new Date().toISOString();
    observations.verifier = observations.checks.length === 12
      && observations.cleanup === 'AWAITED_CLOSE_RESOLVED' ? 'PASS' : 'FAIL';
    if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
      const directory = path.resolve(__dirname, '..', 'evidence');
      let index = 1;
      let destination;
      do {
        destination = path.join(directory, `browser-observations-${String(index++).padStart(3, '0')}.json`);
      } while (fs.existsSync(destination));
      fs.writeFileSync(destination, `${JSON.stringify(observations, null, 2)}\n`, { flag: 'wx' });
    }
  }
});
