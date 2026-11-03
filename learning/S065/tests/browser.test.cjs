'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const helper = path.resolve(root, '..', '..', 'testing', 'browser', 'isolated.cjs');
const expectedHelper = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(fs.readFileSync(helper)), expectedHelper, 'Only the published browser helper is authorized.');
const { openIsolatedLesson } = require(helper);
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

test('actual S065 DOM, keyboard, errors, failures, unknowns, history, reset and CSP', { timeout: 90000 }, async () => {
  const session = await openIsolatedLesson(path.join('learning', 'S065', 'index.html'));
  const page = session.page;
  const checks = [];
  const pageErrors = [];
  const consoleErrors = [];
  const escapedProbeRequests = [];
  let screenshot;
  let dom;
  let csp;
  try {
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.route('https://s065.invalid/**', async (route) => {
      escapedProbeRequests.push(route.request().url());
      await route.abort('blockedbyclient');
    });
    assert.match(page.url(), /^file:/);
    assert.equal(await page.title(), 'S065 — Hot-partition rebalance rehearsal');
    assert.equal(await page.locator('.banner').innerText(),
      'Training rehearsal - synthetic data - not a live Azure result');
    assert.equal(await page.locator('#summary').getAttribute('data-verdict'), 'pending');
    assert.equal(await page.locator('#observe').isDisabled(), true);
    assert.equal(await page.locator('#new-attempt').isDisabled(), true);
    assert.equal(await page.locator('#check-prediction').isDisabled(), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.skip').evaluate((node) => node === document.activeElement), true);
    await page.keyboard.press('Enter');
    await page.locator('#routing').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#routing').inputValue(), 'gap');
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.locator('#routing').inputValue(), 'coordinated');
    await page.locator('#prediction').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#prediction').inputValue(), 'success');

    async function keyButton(id) {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press('Space');
    }

    async function readResult(name) {
      const state = await page.evaluate(() => ({
        verdict: document.getElementById('summary').dataset.verdict,
        metrics: Object.fromEntries([...document.querySelectorAll('#metrics dd')].map((node) => [node.id, node.textContent])),
        status: document.getElementById('status').textContent,
        impact: document.getElementById('impact').textContent,
        cleanup: document.getElementById('cleanup').textContent,
        reasons: document.getElementById('reasons').textContent,
        phases: document.getElementById('phase-trace').innerText,
        operations: document.getElementById('operation-trace').innerText,
        history: [...document.querySelectorAll('#history > li')].map((node) => node.innerText),
        focus: document.activeElement.id,
      }));
      checks.push({ name, ...state });
      return state;
    }

    async function observeAll() {
      assert.equal(await page.locator('#routing').isDisabled(), true);
      assert.equal(await page.locator('#start').isDisabled(), true);
      assert.equal(await page.locator('#summary').getAttribute('data-verdict'), 'pending');
      assert.equal(await page.locator('#phase-trace tr').count(), 0);
      for (let index = 0; index < 3; index++) {
        await keyButton('observe');
        assert.equal(await page.locator('#phase-trace tr').count(), index + 1);
        assert.equal(await page.locator('#summary').getAttribute('data-verdict') === 'pending', index < 2);
      }
      assert.equal(await page.locator('#observe').isDisabled(), true);
      assert.equal(await page.locator('#summary').evaluate((node) => node === document.activeElement), true);
    }

    async function runNext(config, name) {
      await keyButton('new-attempt');
      assert.equal(await page.locator('#routing').evaluate((node) => node === document.activeElement), true);
      for (const [key, value] of Object.entries({
        routing: 'coordinated', ownership: 'exclusive', data: 'current', coverage: 'complete', ...config,
      })) await page.locator(`#${key}`).selectOption(value);
      await keyButton('start');
      await observeAll();
      return readResult(name);
    }

    await page.locator('#start').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#observe').evaluate((node) => node === document.activeElement), true);
    await observeAll();
    const safe = await readResult('keyboard-safe');
    assert.equal(safe.verdict, 'success');
    assert.equal(safe.metrics['success-count'], '12');
    assert.equal(safe.metrics['moved-count'], '4');
    assert.equal(safe.metrics['cold-count'], '6');
    assert.match(safe.operations, /H0, H1, H2, H3/);
    await keyButton('check-prediction');
    assert.match(await page.locator('#prediction-result').innerText(), /Prediction matches/);

    const gap = await runNext({ routing: 'gap' }, 'routing-gap-failure-retained-after-recovery');
    assert.equal(gap.verdict, 'failure');
    assert.equal(gap.metrics['failure-count'], '2');
    assert.equal(gap.metrics['gap-count'], '1');
    assert.match(gap.operations, /NO ROUTE/);
    assert.match(gap.phases, /after\s+shard-new/);
    assert.match(gap.history[1], /Attempt 2 — failure/);

    const overlap = await runNext({ ownership: 'overlap' }, 'simultaneous-active-owners-fail-with-twelve-successes');
    assert.equal(overlap.verdict, 'failure');
    assert.equal(overlap.metrics['success-count'], '12');
    assert.equal(overlap.metrics['owner-count'], '1');
    assert.match(overlap.phases, /shard-old \(epoch 7\) \+ shard-new \(epoch 8\)/);
    assert.match(overlap.history[1], /routing gap/);

    const missing = await runNext({ data: 'behind' }, 'missing-acknowledged-effect-failure');
    assert.equal(missing.verdict, 'failure');
    assert.equal(missing.metrics['failure-count'], '2');
    assert.equal(missing.metrics['missing-effects'], 'H1');
    assert.match(missing.operations, /MISSING H1/);

    const partial = await runNext({ coverage: 'partial' }, 'missing-cutover-unknown');
    assert.equal(partial.verdict, 'unknown');
    assert.equal(partial.metrics['unknown-count'], '4');
    assert.equal(partial.metrics['success-count'], '8');
    assert.match(partial.phases, /cutover\s+unknown\s+unknown\s+unknown/);

    const none = await runNext({ coverage: 'none' }, 'all-observations-unknown-and-six-attempt-bound');
    assert.equal(none.verdict, 'unknown');
    assert.equal(none.metrics['unknown-count'], '12');
    assert.equal(none.metrics['success-count'], '0');
    assert.equal(none.history.length, 6);
    assert.equal(await page.locator('#new-attempt').isDisabled(), true);
    assert.match(none.status, /Six-attempt limit/);
    if (capture) {
      screenshot = await page.screenshot({ fullPage: true });
      dom = await page.content();
    }

    await keyButton('reset-all');
    assert.equal(await page.locator('#history > li').count(), 0);
    assert.equal(await page.locator('#phase-trace tr').count(), 0);
    assert.equal(await page.locator('#summary').getAttribute('data-verdict'), 'pending');
    assert.equal(await page.locator('#routing').inputValue(), 'coordinated');
    assert.equal(await page.locator('#coverage').inputValue(), 'complete');
    assert.equal(await page.locator('#prediction').inputValue(), '');
    assert.equal(await page.locator('#routing').evaluate((node) => node === document.activeElement), true);
    assert.equal(await page.locator('#plan').evaluate((node) => typeof node.reset), 'function');
    checks.push({ name: 'reset-six-completed-attempts', cleared: true, focus: 'routing', nativeFormReset: 'function' });

    await page.locator('#coverage').evaluate((node) => {
      node.add(new Option('Invalid synthetic test input', 'invalid'));
      node.value = 'invalid';
    });
    await keyButton('start');
    assert.equal(await page.locator('#error').isVisible(), true);
    assert.match(await page.locator('#error').innerText(), /Invalid coverage/);
    assert.equal(await page.locator('#error').evaluate((node) => node === document.activeElement), true);
    assert.equal(await page.locator('#start').isEnabled(), true);
    assert.equal(await page.locator('#history > li').count(), 0);
    assert.equal(await page.locator('#phase-trace tr').count(), 0);
    checks.push({ name: 'invalid-enum-error', message: await page.locator('#error').innerText(), noAttemptCreated: true, focus: 'error' });
    await page.locator('#coverage').evaluate((node) => node.querySelector('[value="invalid"]').remove());
    await page.locator('#coverage').selectOption('complete');
    await page.locator('#routing').selectOption('stale');
    await keyButton('start');
    assert.equal(await page.locator('#error').isHidden(), true);
    await observeAll();
    const stale = await readResult('stale-route-to-fenced-owner');
    assert.equal(stale.verdict, 'failure');
    assert.equal(stale.metrics['failure-count'], '4');
    assert.equal(stale.metrics['stale-count'], '2');
    assert.equal(stale.metrics['cold-count'], '6');
    assert.equal(stale.metrics['moved-count'], '0');
    await keyButton('check-prediction');
    assert.match(await page.locator('#error').innerText(), /Choose a success, failure or unknown prediction/);
    assert.equal(await page.locator('#summary').getAttribute('data-verdict'), 'failure');
    await page.locator('#prediction').selectOption('success');
    await keyButton('check-prediction');
    assert.match(await page.locator('#prediction-result').innerText(), /Prediction differs/);
    await page.locator('#prediction').selectOption('failure');
    await keyButton('check-prediction');
    assert.match(await page.locator('#prediction-result').innerText(), /Prediction matches/);
    assert.equal(await page.locator('#history > li').count(), 1);
    checks.push({ name: 'prediction-cannot-overwrite-run', verdict: 'failure', historyCount: 1 });

    await keyButton('new-attempt');
    await page.locator('#routing').selectOption('coordinated');
    await keyButton('start');
    await keyButton('observe');
    assert.equal(await page.locator('#phase-trace tr').count(), 1);
    await keyButton('reset-all');
    assert.equal(await page.locator('#history > li').count(), 0);
    assert.equal(await page.locator('#operation-trace tr').count(), 0);
    assert.equal(await page.locator('#observe').isDisabled(), true);
    assert.equal(await page.locator('#start').isEnabled(), true);
    assert.equal(await page.locator('#metrics').isHidden(), true);
    checks.push({ name: 'reset-in-flight-and-retained-failure', cleared: true, verdict: 'pending' });

    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    await page.locator('#routing').focus();
    assert.equal(await page.locator('#routing').evaluate((node) => getComputedStyle(node).outlineStyle), 'solid');
    checks.push({ name: 'narrow-layout-and-keyboard-focus', viewport: '390x844', documentOverflow: false, outline: 'solid' });

    await page.evaluate(async () => {
      window.__s065ProbeRan = false;
      window.__s065HandlerRan = false;
      window.__s065Csp = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__s065Csp.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition });
      });
      const script = document.createElement('script');
      script.textContent = 'window.__s065ProbeRan = true;';
      document.head.append(script);
      const button = document.createElement('button');
      button.setAttribute('onclick', 'window.__s065HandlerRan = true;');
      document.body.append(button);
      button.click();
      button.remove();
      const frame = document.createElement('iframe');
      frame.src = 'https://s065.invalid/frame';
      document.body.append(frame);
      try {
        await fetch('https://s065.invalid/blocked');
        window.__s065FetchRejected = false;
      } catch {
        window.__s065FetchRejected = true;
      }
    });
    await page.waitForFunction(() => window.__s065Csp.some((event) => event.directive === 'connect-src')
      && window.__s065Csp.some((event) => event.directive === 'frame-src')
      && window.__s065Csp.some((event) => event.directive.startsWith('script-src')));
    csp = await page.evaluate(() => ({
      inlineScriptRan: window.__s065ProbeRan, inlineHandlerRan: window.__s065HandlerRan,
      fetchRejected: window.__s065FetchRejected, violations: window.__s065Csp,
      policy: document.querySelector('[http-equiv="Content-Security-Policy"]').content,
    }));
    assert.equal(csp.inlineScriptRan, false);
    assert.equal(csp.inlineHandlerRan, false);
    assert.equal(csp.fetchRejected, true);
    assert.ok(csp.violations.some((event) => event.blockedURI === 'inline'));
    assert.ok(csp.violations.every((event) => event.disposition === 'enforce'));
    assert.deepEqual(escapedProbeRequests, [], 'CSP must block probes before the defensive network abort route.');
    assert.deepEqual(pageErrors, []);
    assert.ok(consoleErrors.length > 0);
    assert.ok(consoleErrors.every((message) => /Content Security Policy|violates.*directive/i.test(message)), consoleErrors.join('\n'));
    checks.push({ name: 'actual-enforced-csp', inlineScriptBlocked: true, inlineHandlerBlocked: true, connectionBlocked: true, frameBlocked: true, escapedRequests: 0 });
  } finally {
    await session.close();
  }
  if (capture) {
    const directory = path.join(root, 'evidence', 'raw');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'browser.png'), screenshot);
    fs.writeFileSync(path.join(directory, 'browser-dom.html'), dom, 'utf8');
    fs.writeFileSync(path.join(directory, 'browser.json'), `${JSON.stringify({
      cardId: 'A-S065', workerId: 'worker-A-S065', capturedAtUtc: new Date().toISOString(),
      mode: 'synthetic', nativeQualified: false, captureOptIn: 'CAPTURE_BROWSER_EVIDENCE=1',
      node: process.version, playwright: require('../../../testing/browser/node_modules/playwright/package.json').version,
      browser: session.browserVersion, headless: true, chromiumSandbox: true,
      helper: 'testing/browser/isolated.cjs', helperSha256: expectedHelper, helperPublication: '53c0c0d',
      cleanup: { awaitedFinallyClose: true, noLessonResourcesCreated: true },
      screenshot: 'evidence/raw/browser.png', screenshotSha256: hash(screenshot),
      dom: 'evidence/raw/browser-dom.html', domSha256: hash(Buffer.from(dom)),
      checks, csp, expectedCspConsoleErrors: consoleErrors, unexpectedPageErrors: pageErrors,
      limits: 'Existing offline PW1.56.1 / signed Edge156 / Node22 tooling only; no native, production24 or unattended lifecycle certification.',
    }, null, 2)}\r\n`, 'utf8');
  }
});
