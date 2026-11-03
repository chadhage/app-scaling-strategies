'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  fs, path, root, repo, read, sha, testedHashes, helperPath, helperSha256,
} = require('./provenance.cjs');

const captureEnabled = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
assert.equal(sha(fs.readFileSync(path.join(repo, helperPath))), helperSha256,
  'Only the published, qualified isolated helper is authorized');
const { openIsolatedLesson } = require(path.join(repo, helperPath));

test('actual isolated Edge lesson: DOM, keyboard, negatives, unknowns, guards, reset and CSP',
  { timeout: 120000, concurrency: false }, async (t) => {
    let session;
    let browserVersion;
    let stage = 'exercise';
    const checks = [];
    const images = [];
    const pageErrors = [];
    const consoleErrors = [];
    const requests = [];
    const responses = [];
    let csp;
    const cleanup = { attempted: false, awaited: false, completed: false };
    try {
      session = await openIsolatedLesson('learning\\S089\\index.html');
      browserVersion = session.browserVersion;
      const page = session.page;
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push({ stage, message: message.text() });
      });
      page.on('request', (request) => {
        if (/^https?:/.test(request.url())) requests.push({ stage, url: request.url(), method: request.method() });
      });
      page.on('response', (response) => {
        if (/^https?:/.test(response.url())) responses.push({ stage, url: response.url(), status: response.status() });
      });
      await page.reload({ waitUntil: 'load' });
      await page.setViewportSize({ width: 1280, height: 900 });
      const value = (id) => page.locator(`#${id}`).textContent();
      const phase = () => value('phase');
      const click = (id) => page.locator(`#${id}`).click();
      const keyboard = async (id, key = 'Enter') => {
        await page.locator(`#${id}`).focus();
        await page.locator(`#${id}`).press(key);
      };
      const dom = () => page.evaluate(() => {
        const text = (id) => document.getElementById(id).textContent;
        const counts = (prefix) => Object.fromEntries(['attempted', 'success', 'failure', 'unknown']
          .map((key) => [key, Number(text(`${prefix}-${key}`))]));
        return {
          phase: text('phase'), control: text('control-availability'), data: text('data-outcome'),
          harness: text('harness-status'), recovery: text('recovery-outcome'),
          verification: text('verification'), prediction: text('prediction-result'),
          route: text('route-state'), command: text('command-result'),
          active: counts('active'), retained: counts('retained'),
          history: [...document.querySelectorAll('#history article h3')].map((node) => node.textContent),
          trace: [...document.querySelectorAll('#trace li')].map((node) => node.textContent),
        };
      });
      const image = async (name) => {
        if (captureEnabled) images.push({ file: `evidence\\${name}.png`, bytes: await page.screenshot({ fullPage: true }) });
      };
      const record = async (name, details = {}) => checks.push({ name, ...details, observed: await dom() });
      const runFixture = async (condition, recovery, prediction) => {
        if (await phase() === 'checked') await click('new-attempt');
        await page.locator('#condition').selectOption(condition);
        await page.locator('#recovery-evidence').selectOption(recovery);
        for (const id of ['start-run', 'lose-management', 'sample-journeys', 'report-fault', 'recover-control']) await click(id);
        await page.locator('#prediction').selectOption(prediction);
        await click('check-prediction');
      };

      await t.test('initial DOM has exact banner, labels, zero samples and guarded native controls', async () => {
        assert.equal(await page.locator('.banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
        assert.equal(await phase(), 'idle');
        assert.equal(await page.locator('#start-run').isEnabled(), true);
        for (const id of ['lose-management', 'sample-journeys', 'report-fault', 'recover-control',
          'prediction', 'check-prediction', 'new-attempt']) assert.equal(await page.locator(`#${id}`).isDisabled(), true);
        assert.deepEqual((await dom()).active, { attempted: 0, success: 0, failure: 0, unknown: 0 });
        assert.equal(await page.getByLabel('Established-route condition').count(), 1);
        assert.equal(await page.getByLabel('Harness recovery evidence').count(), 1);
        assert.equal(await page.evaluate(() => typeof document.getElementById('scenario-form').reset), 'function');
        assert.match(browserVersion, /^156\.0\.4314\.50$/);
        await image('initial');
        await record('initial-dom');
      });

      await t.test('injected out-of-order event fails visibly without mutating idle state', async () => {
        const before = await dom();
        await page.locator('#sample-journeys').dispatchEvent('click');
        assert.equal(await page.locator('#error').isVisible(), true);
        assert.match(await value('error'), /Invalid state/);
        assert.equal(await page.locator('#error').evaluate((node) => node === document.activeElement), true);
        assert.deepEqual(await dom(), before);
        await record('state-guard', { visibleError: await value('error') });
        await click('reset-lesson');
      });

      await t.test('complete positive path uses actual Tab, Enter and Space through independent service/recovery', async () => {
        await page.locator('#condition').focus();
        await page.keyboard.press('Tab');
        assert.equal(await page.locator('#recovery-evidence').evaluate((node) => node === document.activeElement), true);
        await page.keyboard.press('Tab');
        await page.keyboard.press('Enter');
        assert.equal(await phase(), 'prepared');
        assert.equal(await page.locator('#lose-management').evaluate((node) => node === document.activeElement), true);
        await page.keyboard.press('Space');
        assert.equal(await value('control-availability'), 'unavailable');
        assert.match(await value('command-result'), /1 rejected-control-unavailable/);
        await page.keyboard.press('Enter');
        const duringOutage = await dom();
        assert.deepEqual(duringOutage.active, { attempted: 3, success: 3, failure: 0, unknown: 0 });
        assert.equal(duringOutage.control, 'unavailable');
        assert.equal(duringOutage.data, 'continuing-established-service');
        assert.match(duringOutage.route, /^blue-v1 · epoch 7 · established$/);
        await page.keyboard.press('Enter');
        assert.match(await value('harness-status'), /available — scoped fault report recorded/);
        assert.equal(await value('control-availability'), 'unavailable');
        await page.keyboard.press('Space');
        assert.equal(await page.locator('#prediction').evaluate((node) => node === document.activeElement), true);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Tab');
        assert.equal(await page.locator('#prediction').inputValue(), 'PASS');
        await page.keyboard.press('Enter');
        assert.equal(await phase(), 'checked');
        assert.equal(await value('verification'), 'Verification: PASS');
        assert.match(await value('prediction-result'), /^Correct prediction PASS/);
        assert.equal((await dom()).history.length, 1);
        await image('independent');
        await record('keyboard-independent-pass', { keys: ['Tab', 'Enter', 'Space', 'ArrowDown'], duringOutage });
      });

      await t.test('independent service failure stays failed after confirmed control recovery', async () => {
        await runFixture('service-error', 'confirmed', 'FAIL');
        assert.equal(await value('verification'), 'Verification: FAIL');
        assert.equal(await value('control-availability'), 'available');
        assert.deepEqual((await dom()).active, { attempted: 3, success: 2, failure: 1, unknown: 0 });
        assert.deepEqual((await dom()).retained, { attempted: 6, success: 5, failure: 1, unknown: 0 });
        assert.match(await page.locator('#journey-rows').textContent(), /service-error/);
        await image('failure');
        await record('independent-service-failure');
      });

      await t.test('per-request controller dependency fails all journeys and wrong prediction cannot override it', async () => {
        await runFixture('controller-dependent', 'confirmed', 'PASS');
        assert.equal(await value('verification'), 'Verification: FAIL');
        assert.deepEqual((await dom()).active, { attempted: 3, success: 0, failure: 3, unknown: 0 });
        assert.match(await value('prediction-result'), /^Incorrect prediction PASS; actual verdict FAIL/);
        assert.match(await page.locator('#journey-rows').textContent(), /controller-required-but-unavailable/);
        assert.equal((await dom()).history.length, 3);
        await record('controller-dependency-failure-wrong-prediction');
      });

      await t.test('missing data observation stays unknown despite confirmed control recovery', async () => {
        await runFixture('missing-sample', 'confirmed', 'UNKNOWN');
        assert.equal(await value('verification'), 'Verification: UNKNOWN');
        assert.equal(await value('control-availability'), 'available');
        assert.equal(await value('data-outcome'), 'unverified');
        assert.deepEqual((await dom()).active, { attempted: 3, success: 2, failure: 0, unknown: 1 });
        assert.match(await page.locator('#journey-rows').textContent(), /unknown — no observation/);
        await image('unknown');
        await record('missing-data-unknown');
      });

      await t.test('missing recovery evidence keeps control unknown without erasing independent data successes', async () => {
        await runFixture('independent', 'missing', 'UNKNOWN');
        assert.equal(await value('control-availability'), 'unknown');
        assert.equal(await value('data-outcome'), 'continuing-established-service');
        assert.equal(await value('recovery-outcome'), 'Recovery: unverified');
        assert.equal(await value('verification'), 'Verification: UNKNOWN');
        assert.deepEqual((await dom()).active, { attempted: 3, success: 3, failure: 0, unknown: 0 });
        assert.equal((await dom()).history.length, 5);
        await record('missing-recovery-unknown-control-successful-data');
      });

      await t.test('six histories retain failures/unknowns and block new attempts without eviction', async () => {
        await runFixture('independent', 'confirmed', 'PASS');
        assert.equal((await dom()).history.length, 6);
        assert.deepEqual((await dom()).retained, { attempted: 18, success: 13, failure: 4, unknown: 1 });
        assert.equal(await page.locator('#new-attempt').isDisabled(), true);
        assert.match(await value('history-note'), /History full; explicit reset required. No records evicted/);
        const before = await dom();
        await page.locator('#new-attempt').dispatchEvent('click');
        assert.match(await value('error'), /History full/);
        assert.deepEqual(await dom(), before);
        await record('retained-history-capacity', { visibleError: await value('error') });
      });

      await t.test('invalid enum is rejected with focused error and no HTML execution; reset restores defaults', async () => {
        await click('reset-lesson');
        await page.evaluate(() => {
          const option = document.createElement('option');
          option.value = '<img src=x onerror=synthetic>';
          option.textContent = 'invalid synthetic fixture';
          option.dataset.testOnly = 'true';
          document.getElementById('condition').append(option);
        });
        await page.locator('#condition').selectOption('<img src=x onerror=synthetic>');
        await keyboard('start-run');
        assert.match(await value('error'), /Invalid input/);
        assert.equal(await page.locator('#error').evaluate((node) => node === document.activeElement), true);
        assert.equal(await phase(), 'idle');
        assert.deepEqual((await dom()).retained, { attempted: 0, success: 0, failure: 0, unknown: 0 });
        assert.equal(await page.locator('img').count(), 0);
        await image('validation-error');
        await record('invalid-input-focused-error', { visibleError: await value('error') });
        await click('reset-lesson');
        await page.locator('option[data-test-only]').evaluate((node) => node.remove());
        assert.equal(await page.locator('#condition').inputValue(), 'independent');
        assert.equal(await page.locator('#recovery-evidence').inputValue(), 'confirmed');
        assert.equal(await page.locator('#error').isVisible(), false);
      });

      await t.test('reset during a partial outage is explicit, idempotent, zeroed and returns keyboard focus', async () => {
        await keyboard('start-run');
        await keyboard('lose-management');
        assert.equal(await value('control-availability'), 'unavailable');
        await keyboard('reset-lesson');
        const after = await dom();
        assert.equal(after.phase, 'idle');
        assert.equal(after.control, 'available');
        assert.deepEqual(after.active, { attempted: 0, success: 0, failure: 0, unknown: 0 });
        assert.deepEqual(after.retained, after.active);
        assert.deepEqual(after.history, []);
        assert.deepEqual(after.trace, ['No actions yet.']);
        assert.equal(await page.locator('#condition').evaluate((node) => node === document.activeElement), true);
        await keyboard('reset-lesson');
        assert.deepEqual(await dom(), after);
        assert.equal(await page.locator('#prediction').inputValue(), '');
        await record('partial-and-idempotent-reset');
      });

      await t.test('narrow real DOM has no horizontal overflow and visible keyboard focus', async () => {
        await page.setViewportSize({ width: 360, height: 800 });
        await runFixture('service-error', 'confirmed', 'FAIL');
        await page.locator('#reset-lesson').focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        const layout = await page.evaluate(() => ({
          viewport: innerWidth, document: document.documentElement.scrollWidth,
          focusWidth: getComputedStyle(document.getElementById('reset-lesson')).outlineWidth,
          focusStyle: getComputedStyle(document.getElementById('reset-lesson')).outlineStyle,
          focused: document.activeElement.id,
        }));
        assert.ok(layout.document <= layout.viewport, JSON.stringify(layout));
        assert.equal(layout.focused, 'reset-lesson');
        assert.equal(layout.focusWidth, '3px');
        assert.equal(layout.focusStyle, 'solid');
        await image('narrow');
        await record('narrow-keyboard-layout', { layout });
        await page.setViewportSize({ width: 1280, height: 900 });
      });

      await t.test('actual CSP blocks inline execution and connections; exercise has no errors or network requests', async () => {
        assert.deepEqual(pageErrors, []);
        assert.deepEqual(consoleErrors.filter((entry) => entry.stage === 'exercise'), []);
        assert.deepEqual(requests.filter((entry) => entry.stage === 'exercise'), []);
        assert.deepEqual(responses, []);
        stage = 'csp-diagnostic';
        const first = await page.evaluate(async () => {
          globalThis.__S089Violations = [];
          globalThis.addEventListener('securitypolicyviolation', (event) => {
            globalThis.__S089Violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
          });
          globalThis.__S089InlineProbe = false;
          const script = document.createElement('script');
          script.textContent = 'globalThis.__S089InlineProbe = true';
          document.head.append(script);
          let connection;
          try {
            await fetch('http://127.0.0.1:9/s089-csp-probe');
            connection = 'unexpected-response';
          } catch (error) {
            connection = error.name;
          }
          return { inlineRan: globalThis.__S089InlineProbe, connection };
        });
        await page.waitForFunction(() => globalThis.__S089Violations.some((entry) => entry.directive.startsWith('script-src'))
          && globalThis.__S089Violations.some((entry) => entry.directive === 'connect-src'));
        csp = { ...first, violations: await page.evaluate(() => globalThis.__S089Violations) };
        assert.equal(csp.inlineRan, false);
        assert.equal(csp.connection, 'TypeError');
        assert.ok(csp.violations.some((entry) => entry.directive.startsWith('script-src') && entry.blockedURI === 'inline'));
        assert.ok(csp.violations.some((entry) => entry.directive === 'connect-src'));
        assert.deepEqual(responses, []);
        assert.deepEqual(pageErrors, []);
        await record('enforced-csp-no-exercise-errors-or-network', { csp });
      });
      assert.equal(checks.length, 12, 'Every actual browser group must have passed');
    } finally {
      if (session) {
        cleanup.attempted = true;
        cleanup.awaited = true;
        await session.close();
        cleanup.completed = true;
      }
    }
    if (captureEnabled) {
      const screenshots = images.map((image) => {
        fs.writeFileSync(path.join(root, image.file), image.bytes);
        return { path: image.file, bytes: image.bytes.length, sha256: sha(image.bytes) };
      });
      const diagnostic = Buffer.from(`${JSON.stringify({ csp, consoleErrors, requests, responses }, null, 2)}\n`);
      fs.writeFileSync(path.join(root, 'evidence\\raw\\csp-diagnostic.json'), diagnostic);
      fs.writeFileSync(path.join(root, 'evidence\\browser.json'), `${JSON.stringify({
        cardId: 'A-S089', workerId: 'worker-A-S089', mode: 'synthetic', outcome: 'PASS',
        capturedAtUtc: new Date().toISOString(), captureExplicitlyEnabled: true,
        runtime: process.version, playwrightVersion: '1.56.1', browserVersion,
        helper: { path: helperPath, sha256: helperSha256, publication: '53c0c0d' },
        inputHashes: testedHashes(), checks, screenshots, csp,
        rawCspDiagnosticSha256: sha(diagnostic), pageErrors, consoleErrors,
        exerciseNetworkRequests: requests.filter((entry) => entry.stage === 'exercise'),
        probeRequests: requests.filter((entry) => entry.stage === 'csp-diagnostic'),
        probeResponses: responses, cleanup,
        actualNetworkManagementOrDataPlaneCertification: false,
        nativeSourceParentCompleted: false, productionNode24Validated: false,
        unattendedLifecycleRunnerQualified: false, foregroundLease: false, unsafeFlags: false,
      }, null, 2)}\n`);
    }
  });
