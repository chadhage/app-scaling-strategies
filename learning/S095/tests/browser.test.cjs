'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const lesson = path.resolve(__dirname, '..');
const root = path.resolve(lesson, '..', '..');
const helperPath = path.join(root, 'testing', 'browser', 'isolated.cjs');
const helperSha256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(fs.readFileSync(helperPath)), helperSha256, 'Only the published qualified helper may be loaded.');
const { openIsolatedLesson } = require(helperPath);
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const label = process.env.S095_CAPTURE_RUN || 'browser';
if (capture) assert.match(label, /^browser(?:-\d{3})?$/);
const rawDirectory = path.join(lesson, 'evidence', 'raw', 'runs', label);

test('browser selection is the approved published helper and existing offline Node22/Playwright1.56.1', () => {
  assert.match(process.version, /^v22\./);
  assert.equal(require(path.join(root, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version, '1.56.1');
  const preflight = JSON.parse(fs.readFileSync(path.join(lesson, 'evidence', 'preflight.json')));
  assert.equal(preflight.edge.status, 'Valid');
  assert.match(preflight.edge.version, /^156\./);
  assert.equal(preflight.helperSha256, helperSha256);
});

test('actual isolated DOM, keyboard, failure, unknown, guards, reset, responsive layout and enforced CSP', { timeout: 120000 }, async (t) => {
  let session;
  let browserVersion;
  let closed = false;
  let failure = null;
  const startedAtUtc = new Date().toISOString();
  const steps = [];
  const snapshots = [];
  const screenshots = [];
  const pageErrors = [];
  const blockedRoutes = [];
  const failedRequests = [];
  let csp = [];
  async function step(name, action) {
    try {
      await action();
      steps.push({ name, passed: true });
      t.diagnostic(`Observed PASS: ${name}`);
    } catch (error) {
      steps.push({ name, passed: false, error: error.message });
      throw error;
    }
  }
  async function observe(name) {
    snapshots.push({
      name,
      dom: await session.page.evaluate(() => ({
        url: location.href,
        banner: document.getElementById('training-banner').textContent,
        activeElement: document.activeElement.id,
        controls: ['fixture', 'admission-action', 'prediction'].map((id) => ({ id, value: document.getElementById(id).value })),
        nativeResetType: typeof document.getElementById('rehearsal-form').reset,
        resultHidden: document.getElementById('result').hidden,
        sourceResult: document.getElementById('source-result').textContent,
        learningResult: document.getElementById('learning-result').textContent,
        error: { hidden: document.getElementById('input-error').hidden, text: document.getElementById('input-error').textContent, role: document.getElementById('input-error').getAttribute('role') },
        status: document.getElementById('run-status').textContent,
        facts: document.getElementById('facts').textContent,
        assertions: [...document.querySelectorAll('#assertion-rows tr')].map((row) => row.textContent),
        journeys: [...document.querySelectorAll('#journey-rows tr')].map((row) => row.textContent),
        recovery: [...document.querySelectorAll('#recovery-rows tr')].map((row) => row.textContent),
        history: [...document.querySelectorAll('#history-rows tr')].map((row) => row.textContent),
        summary: document.getElementById('summary').textContent,
        trace: [...document.querySelectorAll('#trace li')].map((item) => item.textContent),
      })),
    });
  }
  async function screenshot(name) {
    if (!capture) return;
    fs.mkdirSync(rawDirectory, { recursive: true });
    const file = path.join(rawDirectory, `${name}.png`);
    assert.ok(!fs.existsSync(file), 'Historical browser images cannot be overwritten.');
    await session.page.screenshot({ path: file, fullPage: true });
    const bytes = fs.readFileSync(file);
    screenshots.push({ path: path.relative(lesson, file), sha256: sha(bytes), bytes: bytes.length });
  }
  try {
    session = await openIsolatedLesson('learning\\S095\\index.html');
    browserVersion = session.browserVersion;
    assert.match(browserVersion, /^156\./);
    const page = session.page;
    await page.setViewportSize({ width: 1200, height: 850 });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('requestfailed', (request) => failedRequests.push({ url: request.url(), error: request.failure().errorText }));
    await page.route(/^https?:\/\//, async (route) => {
      blockedRoutes.push(route.request().url());
      await route.abort('blockedbyclient');
    });
    const active = () => page.evaluate(() => document.activeElement.id);
    const history = () => page.locator('#history-rows tr').allTextContents();
    const choose = async (fixture, action, prediction) => {
      await page.locator('#fixture').selectOption(fixture);
      await page.locator('#admission-action').selectOption(action);
      await page.locator('#prediction').selectOption(prediction);
    };
    const run = () => page.getByRole('button', { name: 'Rehearse and check', exact: true }).click();
    const source = () => page.locator('#source-result').textContent();
    const facts = () => page.locator('#facts').textContent();
    await step('standalone exact banner and native Tab/arrow/Enter successful gate operation', async () => {
      assert.equal(new URL(page.url()).protocol, 'file:');
      assert.equal(await page.locator('#training-banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.ok(await page.locator('#training-banner').isVisible());
      assert.equal(await page.evaluate(() => typeof document.getElementById('rehearsal-form').reset), 'function');
      assert.equal(await page.locator('#result').isVisible(), false);
      assert.equal((await history()).length, 0);
      await page.locator('#fixture').focus();
      await page.keyboard.press('Tab');
      assert.equal(await active(), 'admission-action');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#admission-action').inputValue(), 'keep-candidate');
      await page.keyboard.press('ArrowUp');
      assert.equal(await page.locator('#admission-action').inputValue(), 'gate-candidate');
      await page.keyboard.press('Tab');
      assert.equal(await active(), 'prediction');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#prediction').inputValue(), 'failure');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Tab');
      assert.equal(await active(), 'run-rehearsal');
      await page.keyboard.press('Enter');
      assert.equal(await source(), 'Source safety acceptance: SUCCESS');
      assert.match(await page.locator('#learning-result').textContent(), /Learning prediction: PASS/);
      assert.equal(await active(), 'result-title');
      assert.equal((await history()).length, 1);
      assert.equal(await page.locator('#journey-rows tr').count(), 4);
      assert.match(await facts(), /No transition evidence/);
      assert.match(await facts(), /CURRENT candidate admission after reconciliationREMOVED/);
      assert.ok((await page.locator('#assertion-rows tr').allTextContents()).every((row) => row.endsWith('SUCCESS')));
      await observe('keyboard-success');
    });
    await step('unsafe admission produces two retained interruptions despite later recovery', async () => {
      const first = (await history())[0];
      await choose('healthy-survivor', 'keep-candidate', 'failure');
      await run();
      assert.equal(await source(), 'Source safety acceptance: FAILURE');
      assert.match(await page.locator('#learning-result').textContent(), /Learning prediction: PASS/);
      assert.equal((await history()).length, 2);
      assert.equal((await history())[0], first);
      assert.match(await facts(), /DURING partitionELIGIBLE/);
      assert.match(await facts(), /CURRENT candidate admission after reconciliationREMOVED/);
      assert.match(await facts(), /2: 0 success \/ 2 interruption \/ 0 unknown/);
      assert.equal((await page.locator('#journey-rows tr').allTextContents()).filter((row) => row.includes('FAILURE:')).length, 2);
      assert.ok((await page.locator('#recovery-rows tr').allTextContents()).every((row) => row.includes('SUCCESS:')));
      await observe('unsafe-failure-with-recovery');
      await screenshot('failure-with-retained-history');
    });
    await step('missing observations stay UNKNOWN with intended candidate trials counted', async () => {
      await choose('missing-evidence', 'keep-candidate', 'unknown');
      await run();
      assert.equal(await source(), 'Source safety acceptance: UNKNOWN');
      assert.match(await page.locator('#learning-result').textContent(), /Learning prediction: PASS/);
      assert.match(await facts(), /Observed candidate arrivals during partitionUNKNOWN/);
      assert.match(await facts(), /2: 0 success \/ 0 interruption \/ 2 unknown/);
      assert.match(await facts(), /CURRENT candidate admission after reconciliationUNKNOWN/);
      assert.ok((await page.locator('#journey-rows tr').allTextContents()).every((row) => row.includes('UNKNOWN:')));
      assert.ok((await page.locator('#recovery-rows tr').allTextContents()).every((row) => row.includes('UNKNOWN:')));
      assert.ok((await page.locator('#assertion-rows tr').allTextContents()).every((row) => row.endsWith('UNKNOWN')));
      assert.equal((await history()).length, 3);
      assert.match((await history())[1], /FAILURE/);
      await observe('unknown-with-known-intended-denominator');
      await screenshot('unknown-and-retained-ledger');
    });
    await step('healthy incompatible survivor fails complete journeys despite HTTP200 and correct removal', async () => {
      await choose('incompatible-survivor', 'gate-candidate', 'failure');
      await run();
      assert.equal(await source(), 'Source safety acceptance: FAILURE');
      const journeys = await page.locator('#journey-rows tr').allTextContents();
      assert.equal(journeys.length, 4);
      assert.ok(journeys.every((row) => row.includes('200 /') && row.includes('yes / no / 0') && row.includes('FAILURE:')));
      assert.match(await facts(), /4: 0 success \/ 4 interruption \/ 0 unknown/);
      assert.match(await facts(), /No transition evidence/);
      assert.equal((await history()).length, 4);
      await observe('incompatible-200-failure');
    });
    await step('forged selector input is announced/focused without optimistic history or result changes', async () => {
      const before = await history();
      const oldResult = await source();
      await page.evaluate(() => {
        const option = document.createElement('option');
        option.id = 's095-invalid-option';
        option.value = '__not_allowed__';
        option.textContent = 'Invalid teaching input probe';
        document.getElementById('fixture').append(option);
        document.getElementById('fixture').value = option.value;
      });
      await run();
      assert.ok(await page.locator('#input-error').isVisible());
      assert.equal(await page.locator('#input-error').getAttribute('role'), 'alert');
      assert.match(await page.locator('#input-error').textContent(), /allowed fixture/);
      assert.equal(await active(), 'input-error');
      assert.deepEqual(await history(), before);
      assert.equal(await source(), oldResult);
      await observe('invalid-input-error');
      await page.evaluate(() => document.getElementById('s095-invalid-option').remove());
    });
    await step('false prediction cannot rewrite source success; seventh attempt preserves all six rows', async () => {
      await choose('healthy-survivor', 'gate-candidate', 'failure');
      await run();
      assert.equal(await source(), 'Source safety acceptance: SUCCESS');
      assert.match(await page.locator('#learning-result').textContent(), /Learning prediction: FAIL/);
      assert.equal(await page.locator('#input-error').isVisible(), false);
      await choose('healthy-survivor', 'gate-candidate', 'success');
      await run();
      assert.equal((await history()).length, 6);
      assert.match(await page.locator('#summary').textContent(), /6 \/ 6 attempts\. Safety: 3 success, 2 failure, 1 unknown\. Journeys: 14 success, 6 interruption, 4 unknown/);
      assert.match(await page.locator('#summary').textContent(), /Intended transition trials 4: 0 success, 2 interruption, 2 unknown/);
      const before = await history();
      const summary = await page.locator('#summary').textContent();
      const result = await source();
      await run();
      assert.match(await page.locator('#input-error').textContent(), /History limit: six attempts retained/);
      assert.equal(await active(), 'input-error');
      assert.deepEqual(await history(), before);
      assert.equal(await page.locator('#summary').textContent(), summary);
      assert.equal(await source(), result);
      await observe('history-limit-error');
    });
    await step('keyboard Space reset restores native defaults, errors, results, counters, history and focus', async () => {
      await page.locator('#reset-rehearsal').focus();
      await page.keyboard.press('Space');
      assert.equal(await active(), 'fixture');
      assert.equal(await page.evaluate(() => typeof document.getElementById('rehearsal-form').reset), 'function');
      assert.equal(await page.locator('#fixture').inputValue(), 'healthy-survivor');
      assert.equal(await page.locator('#admission-action').inputValue(), 'gate-candidate');
      assert.equal(await page.locator('#prediction').inputValue(), 'success');
      assert.equal(await page.locator('#result').isVisible(), false);
      assert.equal(await page.locator('#source-result').textContent(), '');
      assert.equal(await page.locator('#journey-rows tr').count(), 0);
      assert.equal(await page.locator('#trace li').count(), 0);
      assert.equal((await history()).length, 0);
      assert.equal(await page.locator('#input-error').isVisible(), false);
      assert.equal(await page.locator('#input-error').textContent(), '');
      assert.match(await page.locator('#summary').textContent(), /^0 \/ 6 attempts\. Safety: 0 success, 0 failure, 0 unknown/);
      assert.match(await page.locator('#summary').textContent(), /No transition evidence/);
      await observe('keyboard-reset');
      await screenshot('reset-empty-defaults');
      await page.setViewportSize({ width: 480, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Narrow layout must not create page-wide horizontal overflow.');
      await observe('responsive-reset');
    });
    await step('actual CSP blocks inline script/handler, connection, form navigation, frames, objects and base URI before network', async () => {
      const originalURL = page.url();
      await page.evaluate(() => {
        window.__s095Csp = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          window.__s095Csp.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition });
        });
        const script = document.createElement('script');
        script.dataset.s095CspProbe = 'true';
        script.textContent = 'window.__s095InlineRan = true;';
        document.body.append(script);
        const button = document.createElement('button');
        button.id = 's095-inline-probe';
        button.type = 'button';
        button.dataset.s095CspProbe = 'true';
        button.textContent = 'Blocked inline handler probe';
        button.setAttribute('onclick', 'window.__s095HandlerRan = true;');
        document.body.append(button);
      });
      await page.waitForFunction(() => window.__s095Csp.some((event) => event.directive === 'script-src-elem'));
      assert.equal(await page.evaluate(() => window.__s095InlineRan), undefined);
      await page.locator('#s095-inline-probe').click();
      await page.waitForFunction(() => window.__s095Csp.some((event) => event.directive === 'script-src-attr'));
      assert.equal(await page.evaluate(() => window.__s095HandlerRan), undefined);
      const connection = await page.evaluate(async () => {
        try {
          await fetch('https://example.invalid/s095-denied-csp-probe');
          return 'unexpected success';
        } catch (error) {
          return error.name;
        }
      });
      assert.equal(connection, 'TypeError');
      await page.waitForFunction(() => window.__s095Csp.some((event) => event.directive === 'connect-src'));
      await page.evaluate(() => {
        const form = document.createElement('form');
        form.dataset.s095CspProbe = 'true';
        form.action = 'https://example.invalid/s095-denied-form-probe';
        form.method = 'get';
        document.body.append(form);
        form.submit();
        const frame = document.createElement('iframe');
        frame.dataset.s095CspProbe = 'true';
        frame.src = 'data:text/html,synthetic-csp-probe';
        document.body.append(frame);
        const object = document.createElement('object');
        object.dataset.s095CspProbe = 'true';
        object.data = location.href;
        document.body.append(object);
        const base = document.createElement('base');
        base.dataset.s095CspProbe = 'true';
        base.href = 'https://example.invalid/s095-denied-base-probe';
        document.head.append(base);
      });
      await page.waitForFunction(() => ['form-action', 'frame-src', 'object-src', 'base-uri'].every((directive) => window.__s095Csp.some((event) => event.directive === directive)));
      csp = await page.evaluate(() => window.__s095Csp);
      assert.ok(csp.every((event) => event.disposition === 'enforce'));
      assert.equal(page.url(), originalURL);
      assert.equal(await page.evaluate(() => document.baseURI), originalURL);
      assert.deepEqual(blockedRoutes, [], 'CSP must block before the independent fail-closed HTTP guard is needed; no HTTP traffic is conducted.');
      assert.deepEqual(pageErrors, []);
      await page.evaluate(() => document.querySelectorAll('[data-s095-csp-probe]').forEach((item) => item.remove()));
      await observe('enforced-csp-no-navigation-or-network');
    });
  } catch (error) {
    failure = { name: error.name, message: error.message, stack: error.stack };
    throw error;
  } finally {
    try {
      if (session) {
        await session.close();
        closed = session.page.isClosed();
        assert.equal(closed, true);
      }
    } finally {
      if (capture) {
        fs.mkdirSync(rawDirectory, { recursive: true });
        const rawFile = path.join(rawDirectory, 'browser-observations.json.snapshot');
        const bytes = Buffer.from(`${JSON.stringify({ snapshots, csp, blockedRoutes, failedRequests, pageErrors, failure }, null, 2)}\n`);
        fs.writeFileSync(rawFile, bytes, { flag: 'wx' });
        const suffix = label === 'browser' ? '' : label.substring('browser'.length);
        fs.writeFileSync(path.join(lesson, 'evidence', `browser-acceptance${suffix}.json`), `${JSON.stringify({
          cardId: 'A-S095', workerId: 'worker-A-S095', kano: 'S', packet: 'SC-S095', mode: 'synthetic',
          startedAtUtc, endedAtUtc: new Date().toISOString(), node: process.version, playwright: '1.56.1',
          browserVersion, helperSha256, helperPublishedCommit: '53c0c0d82cc1db6780a87ac2b1085734af6d5c60',
          helperAPI: 'openIsolatedLesson', headless: true, awaitedFinallyClose: true, pageClosed: closed,
          verified: !failure && closed && steps.length === 8 && steps.every((item) => item.passed),
          steps, csp, successfulHTTPRequests: 0, networkGuardInvocations: blockedRoutes.length,
          rawObservations: { path: path.relative(lesson, rawFile), bytes: bytes.length, sha256: sha(bytes) },
          screenshots, failure,
          limit: 'Fixed synthetic teaching data only. CSP probes are blocked before network by policy and independently guarded; no dependency, routing, admission or recovery operation/certification occurs. Published helper lifecycle limitation remains; no abandoned prototype, unsafe flags, foreground lease, new package, download or production/native/source-parent claim.',
        }, null, 2)}\n`, { flag: 'wx' });
      }
    }
  }
});
