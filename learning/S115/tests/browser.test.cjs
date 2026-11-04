'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const helperPath = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const HELPER_SHA = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const helperHash = () => crypto.createHash('sha256').update(fs.readFileSync(helperPath)).digest('hex');
assert.equal(helperHash(), HELPER_SHA, 'only the published helper is qualified for these observations');
const { openIsolatedLesson } = require(helperPath);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

function snapshot(directory, prefix = '') {
  const files = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    assert.ok(!entry.isSymbolicLink(), 'lesson snapshots never follow links');
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(files, snapshot(absolute, name));
    else files[name] = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
  }
  return files;
}

test('S115 actual isolated Edge DOM, keyboard, error, reset, failure and CSP observations', { timeout: 120000 }, async (t) => {
  assert.equal(playwrightVersion, '1.56.1');
  assert.match(process.version, /^v22\./, 'Node 22 is the tested local tool, not production Node 24');
  const before = snapshot(root);
  const observations = [];
  const errors = [];
  const pageErrors = [];
  const externalRequests = [];
  let session;
  let browserVersion;
  let awaitedFinallyClose = false;
  let ownedFilesUnchangedBeforeCapture = false;

  try {
    session = await openIsolatedLesson(path.join('learning', 'S115', 'index.html'));
    const page = session.page;
    browserVersion = session.browserVersion;
    assert.match(browserVersion, /^156\./);
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => {
      if (!request.url().startsWith('file:')) externalRequests.push(request.url());
    });
    const text = (selector) => page.locator(selector).innerText();
    const focusId = () => page.evaluate(() => document.activeElement.id);
    async function fresh(fixtureId = 'warm-ready', budgetMs = '6000') {
      await page.reload({ waitUntil: 'load' });
      await page.locator('#standby').selectOption(fixtureId);
      await page.locator('#budget').selectOption(budgetMs);
    }
    async function run() {
      await page.locator('#inspect').click();
      await page.locator('#rehearse').click();
    }
    async function observe(name, body) {
      await t.test(name, async () => {
        try {
          const observed = await body();
          observations.push({ name, passed: true, observed });
        } catch (error) {
          errors.push({ name, message: error.message });
          observations.push({ name, passed: false, error: error.message });
          throw error;
        }
      });
    }

    await observe('exact banner, labels, defaults, limits and no pre-measurement success', async () => {
      const banner = await text('#training-banner');
      assert.equal(banner, 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.locator('#standby option').count(), 8);
      assert.equal(await page.locator('#standby').inputValue(), 'warm-ready');
      assert.equal(await page.locator('#budget').inputValue(), '6000');
      assert.equal(await page.locator('label[for="standby"]').count(), 1);
      assert.equal(await page.locator('label[for="budget"]').count(), 1);
      assert.ok(await page.locator('#rehearse').isDisabled());
      assert.match(await text('#result'), /Not measured/);
      assert.equal(await page.locator('#readiness-rows tr').count(), 0);
      assert.match(await text('main'), /Every value is fixed fictional teaching data/);
      return { banner, fixtureCount: 8, notMeasured: await text('#result') };
    });

    await observe('warm full readiness and client recovery are positive in the real DOM', async () => {
      await fresh();
      await run();
      const status = await text('#result');
      assert.match(status, /Standby contract: success/);
      assert.match(await text('#readiness-rows tr[data-dimension="compute"]'), /"capacityUnits":12/);
      assert.equal(await page.locator('#readiness-rows tr').count(), 5);
      assert.match(await text('#recovery-summary'), /completed alternate recovery 4000 synthetic ms/);
      const clients = await text('#client-list');
      assert.match(clients, /profile-read: success/);
      assert.match(clients, /preference-write: success/);
      assert.match(clients, /elapsed 4100 synthetic ms/);
      assert.match(clients, /elapsed 4150 synthetic ms/);
      assert.match(clients, /session accepted true/);
      assert.match(clients, /effect count 1/);
      assert.match(await text('#totals'), /client attempts 2: success 2, interruption\/failure 0, unknown 0/);
      return { status, recovery: await text('#recovery-summary'), clients, totals: await text('#totals') };
    });

    await observe('native keyboard actions and reset restore focus without form.reset shadowing', async () => {
      await fresh();
      await page.locator('#standby').focus();
      const sequence = [await focusId()];
      await page.keyboard.press('Tab');
      sequence.push(await focusId());
      await page.keyboard.press('Tab');
      sequence.push(await focusId());
      assert.deepEqual(sequence, ['standby', 'budget', 'inspect']);
      await page.keyboard.press('Enter');
      assert.match(await text('#result'), /Initial readiness: success/);
      assert.ok(await page.locator('#standby').isDisabled());
      await page.locator('#rehearse').focus();
      await page.keyboard.press('Enter');
      assert.match(await text('#result'), /Standby contract: success/);
      await page.locator('#clear-current').focus();
      await page.keyboard.press('Space');
      assert.equal(await focusId(), 'standby');
      assert.equal(await page.locator('#standby').inputValue(), 'warm-ready');
      assert.equal(await page.locator('#budget').inputValue(), '6000');
      assert.equal(await page.evaluate(() => typeof document.getElementById('lesson-form').reset), 'function');
      assert.equal(await page.locator('#history-list > li').count(), 1);
      return { tabSequence: sequence, activatedWith: ['Enter', 'Enter', 'Space'], focusAfterReset: await focusId(), nativeFormReset: 'function', retainedChecks: 1 };
    });

    await observe('cold six-second interruptions remain after a later larger-budget recovery', async () => {
      await fresh('cold-ready');
      await page.locator('#inspect').click();
      assert.match(await text('#current-summary'), /Shallow HTTP 200: success — NOT full readiness/);
      assert.match(await text('#result'), /Initial readiness: failure/);
      assert.match(await text('#readiness-rows tr[data-dimension="compute"]'), /"capacityUnits":0/);
      await page.locator('#rehearse').click();
      assert.match(await text('#recovery-summary'), /completed alternate recovery 20000 synthetic ms/);
      assert.match(await text('#client-list'), /profile-read: failure/);
      assert.match(await text('#client-list'), /Eventual completion exceeded the original client budget/);
      assert.match(await text('#comparison-rows tr[data-fixture="warm-ready"]'), /4000 synthetic ms/);
      assert.match(await text('#comparison-rows tr[data-fixture="cold-ready"]'), /20000 synthetic ms/);
      await page.locator('#clear-current').click();
      await page.locator('#standby').selectOption('cold-ready');
      await page.locator('#budget').selectOption('24000');
      await run();
      assert.match(await text('#result'), /Standby contract: failure.*Client recovery: success/);
      const history = await text('#history-list');
      assert.match(history, /original budget 6000 synthetic ms.*client recovery failure/s);
      assert.match(history, /original budget 24000 synthetic ms.*client recovery success/s);
      assert.match(history, /elapsed 20100 synthetic ms/);
      assert.match(await text('#totals'), /client attempts 4: success 2, interruption\/failure 2, unknown 0/);
      return { status: await text('#result'), history, totals: await text('#totals'), comparison: await text('#comparison-rows') };
    });

    for (const [fixtureId, dimension] of [
      ['compute-short', 'compute'], ['cache-incompatible', 'cache'],
      ['dependency-denied', 'dependency'], ['auth-denied', 'authentication'], ['state-behind', 'state'],
    ]) {
      await observe(`${fixtureId}: shallow success cannot override required ${dimension} failure`, async () => {
        await fresh(fixtureId, '24000');
        await run();
        const measurement = await text(`#readiness-rows tr[data-dimension="${dimension}"]`);
        assert.match(measurement, /failure/);
        assert.match(await text('#current-summary'), /Shallow HTTP 200: success — NOT full readiness/);
        assert.match(await text('#result'), /Standby contract: failure/);
        assert.match(await text('#recovery-summary'), /completed alternate recovery unknown.*Routing blocked/s);
        assert.match(await text('#client-list'), /profile-read: failure/);
        assert.match(await text('#client-list'), /preference-write: failure/);
        assert.match(await text('#totals'), /interruption\/failure 2/);
        return { fixtureId, measurement, recovery: await text('#recovery-summary'), clients: await text('#client-list') };
      });
    }

    await observe('unobserved fields and client results stay unknown despite a warm reference', async () => {
      await fresh('unobserved');
      await run();
      assert.match(await text('#result'), /Standby contract: unknown/);
      assert.match(await text('#readiness-rows tr[data-dimension="compute"]'), /"capacityUnits":null/);
      assert.match(await text('#recovery-summary'), /Recovery: unknown/);
      assert.match(await text('#client-list'), /profile-read: unknown/);
      assert.match(await text('#client-list'), /preference-write: unknown/);
      assert.match(await text('#comparison-rows tr[data-fixture="warm-ready"]'), /success/);
      assert.match(await text('#totals'), /client attempts 2: success 0, interruption\/failure 0, unknown 2/);
      return { status: await text('#result'), clients: await text('#client-list'), totals: await text('#totals') };
    });

    await observe('reset retains an unfinished measurement as unknown with no fictional client attempts', async () => {
      await fresh();
      await page.locator('#inspect').click();
      await page.locator('#clear-current').click();
      assert.equal(await page.locator('#history-list > li').count(), 1);
      assert.match(await text('#history-list'), /contract unknown; client recovery not-attempted/);
      assert.match(await text('#totals'), /Checks 1\/10: success 0, failure 0, unknown 1/);
      assert.match(await text('#totals'), /client attempts 0/);
      assert.equal(await focusId(), 'standby');
      return { history: await text('#history-list'), totals: await text('#totals'), focusAfterReset: await focusId() };
    });

    await observe('malformed DOM budget and fixture values produce focussed actionable errors, then reset', async () => {
      await fresh();
      await page.evaluate(() => {
        const option = document.createElement('option');
        option.value = '6000.0';
        option.textContent = 'Malformed teaching input';
        document.getElementById('budget').append(option);
        document.getElementById('budget').value = '6000.0';
      });
      await page.locator('#inspect').click();
      assert.match(await text('#error'), /ERR_INPUT/);
      assert.equal(await focusId(), 'error');
      assert.equal(await page.locator('#budget').getAttribute('aria-invalid'), 'true');
      assert.match(await text('#result'), /Not measured/);
      assert.equal(await page.locator('#history-list > li').count(), 0);
      const firstError = await text('#error');
      await page.locator('#clear-current').click();
      assert.ok(await page.locator('#error').isHidden());
      assert.equal(await page.locator('#budget').inputValue(), '6000');
      await page.evaluate(() => {
        const option = document.createElement('option');
        option.value = 'arbitrary-live-region';
        option.textContent = 'Malformed fixture';
        document.getElementById('standby').append(option);
        document.getElementById('standby').value = option.value;
      });
      await page.locator('#inspect').click();
      assert.match(await text('#error'), /ERR_INPUT/);
      assert.equal(await focusId(), 'error');
      assert.equal(await page.locator('#standby').getAttribute('aria-invalid'), 'true');
      await page.locator('#clear-current').click();
      assert.equal(await page.locator('#standby').inputValue(), 'warm-ready');
      assert.ok(await page.locator('#error').isHidden());
      return { firstError, invalidValues: ['6000.0', 'arbitrary-live-region'], noChecksAdded: true, resetFocus: await focusId() };
    });

    await observe('programmatic duplicate or premature DOM events cannot bypass state guards', async () => {
      await fresh();
      await page.locator('#inspect').click();
      await page.evaluate(() => document.getElementById('lesson-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      assert.match(await text('#error'), /ERR_PHASE/);
      assert.equal(await page.locator('#history-list > li').count(), 0);
      await page.locator('#rehearse').click();
      await page.evaluate(() => document.getElementById('rehearse').dispatchEvent(new Event('click', { bubbles: true })));
      assert.match(await text('#error'), /ERR_PHASE/);
      assert.equal(await page.locator('#history-list > li').count(), 1);
      await page.locator('#clear-current').click();
      await page.evaluate(() => document.getElementById('rehearse').dispatchEvent(new Event('click', { bubbles: true })));
      assert.match(await text('#error'), /ERR_PHASE/);
      assert.equal(await page.locator('#history-list > li').count(), 1);
      return { lastError: await text('#error'), guardedEvents: ['duplicate measure', 'duplicate recovery', 'premature recovery'], retainedChecks: 1 };
    });

    await observe('unexpected local DOM getter failure is not replaced by success and history survives', async () => {
      await fresh('dependency-denied');
      await run();
      await page.locator('#clear-current').click();
      await page.evaluate(() => Object.defineProperty(document.getElementById('budget'), 'value', {
        configurable: true, get() { throw new Error('Deliberate local DOM error-path observation'); },
      }));
      await page.locator('#inspect').click();
      assert.match(await text('#error'), /ERR_UNEXPECTED/);
      assert.equal(await focusId(), 'error');
      assert.match(await text('#result'), /Unverified UI result/);
      assert.equal(await page.locator('#history-list > li').count(), 1);
      assert.match(await text('#totals'), /interruption\/failure 2/);
      const failure = await text('#error');
      await page.evaluate(() => { delete document.getElementById('budget').value; });
      await page.locator('#clear-current').click();
      assert.ok(await page.locator('#error').isHidden());
      assert.equal(await focusId(), 'standby');
      assert.equal(await page.locator('#history-list > li').count(), 1);
      return { error: failure, retainedFailedChecks: 1, retainedClientFailures: 2, resetRecovered: true, successFallbackSubstituted: false };
    });

    await observe('actual DOM ten-check limit and reset cannot renew or clear completed history', async () => {
      await fresh();
      for (let index = 0; index < 10; index++) {
        await run();
        await page.locator('#clear-current').click();
      }
      assert.equal(await page.locator('#history-list > li').count(), 10);
      assert.ok(await page.locator('#standby').isDisabled());
      assert.ok(await page.locator('#inspect').isDisabled());
      assert.match(await text('#result'), /Ten-check session limit reached/);
      assert.equal(await focusId(), 'result');
      await page.evaluate(() => document.getElementById('lesson-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      assert.match(await text('#error'), /ERR_LIMIT/);
      await page.locator('#clear-current').click();
      assert.equal(await page.locator('#history-list > li').count(), 10);
      assert.match(await text('#totals'), /client attempts 20: success 20/);
      return { checks: 10, resetDidNotRenew: true, totals: await text('#totals'), focusAtLimit: await focusId() };
    });

    await observe('actual CSP blocks inline script, external connection and valid Blob worker before execution', async () => {
      await fresh();
      const probes = await page.evaluate(async () => {
        globalThis.__s115Policies = [];
        globalThis.__s115InlineRan = false;
        document.addEventListener('securitypolicyviolation', (event) => {
          globalThis.__s115Policies.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        const script = document.createElement('script');
        script.textContent = 'globalThis.__s115InlineRan = true;';
        document.head.append(script);
        let fetchResult;
        try {
          await fetch('https://standby.invalid/synthetic-csp-probe');
          fetchResult = 'unexpected success';
        } catch (error) {
          fetchResult = error.name;
        }
        const workerUrl = URL.createObjectURL(new Blob(['postMessage("unexpected worker execution");'], { type: 'text/javascript' }));
        let worker;
        let timer;
        const workerResult = await new Promise((resolve) => {
          const finish = (value) => { clearTimeout(timer); resolve(value); };
          try {
            worker = new Worker(workerUrl);
            worker.onmessage = () => finish('unexpected worker execution');
            worker.onerror = (event) => { event.preventDefault(); finish('blocked worker error'); };
            timer = setTimeout(() => finish('no attributable worker result'), 2000);
          } catch (error) {
            finish(`blocked constructor: ${error.name}`);
          }
        });
        if (worker) worker.terminate();
        URL.revokeObjectURL(workerUrl);
        return { inlineRan: globalThis.__s115InlineRan, fetchResult, workerResult };
      });
      await page.waitForFunction(() =>
        globalThis.__s115Policies.some((value) => value.directive.startsWith('script-src'))
        && globalThis.__s115Policies.some((value) => value.directive === 'connect-src')
        && globalThis.__s115Policies.some((value) => value.directive === 'worker-src'));
      const policies = await page.evaluate(() => globalThis.__s115Policies);
      assert.equal(probes.inlineRan, false);
      assert.equal(probes.fetchResult, 'TypeError');
      assert.match(probes.workerResult, /^blocked/);
      assert.equal(externalRequests.length, 0, 'the prohibited probe must not create an external network request');
      assert.match(await text('#result'), /Not measured/);
      return { ...probes, policies, externalRequestsObserved: externalRequests.length, probeMeaning: 'Browser CSP enforcement only, not a real standby dependency or network fault' };
    });

    assert.equal(observations.length, 16);
    assert.deepEqual(pageErrors, [], 'unexpected browser exceptions are failures');
    assert.equal(externalRequests.length, 0);
  } catch (error) {
    errors.push({ name: 'browser suite', message: error.message });
  } finally {
    if (session) {
      try {
        await session.close();
        awaitedFinallyClose = true;
      } catch (error) {
        errors.push({ name: 'awaited browser cleanup', message: error.message });
      }
    }
  }

  try {
    assert.deepEqual(snapshot(root), before, 'all owned lesson and historical proof bytes must remain unchanged before deliberate capture');
    assert.equal(helperHash(), HELPER_SHA);
    ownedFilesUnchangedBeforeCapture = true;
  } catch (error) {
    errors.push({ name: 'read-only integrity', message: error.message });
  }
  if (capture) {
    const name = `browser-observed-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}.json`;
    fs.writeFileSync(path.join(root, 'evidence', name), JSON.stringify({
      cardId: 'A-S115', workerId: 'worker-A-S115', mode: 'fixed-fictional-teaching-data-only',
      result: errors.length === 0 ? 'passed' : 'failed', capturedAtUtc: new Date().toISOString(),
      helperPath: 'testing/browser/isolated.cjs', helperSha256: HELPER_SHA,
      helperRevision: '53c0c0d82cc1db6780a87ac2b1085734af6d5c60',
      playwrightVersion, browserVersion, nodeVersion: process.version,
      captureEnvironment: 'CAPTURE_BROWSER_EVIDENCE=1',
      awaitedFinallyClose, ownedFilesUnchangedBeforeCapture,
      sourceFingerprints: ['model.js', 'app.js', 'index.html', 'styles.css', 'tests/browser.test.cjs'].map((relative) => ({
        path: relative, rawSha256: before[relative],
        canonicalLfSha256: crypto.createHash('sha256').update(
          fs.readFileSync(path.join(root, ...relative.split('/')), 'utf8').replace(/\r\n/g, '\n'),
        ).digest('hex'),
      })),
      observationCount: observations.length, observations, errors, pageErrors, externalRequests,
      nativeProof: false, sourceParentComplete: false, productionNode24Validated: false,
      lifecycleLimit: 'Published helper startup/context/cleanup recovery remains unqualified for unattended CI; this run awaited its actual close successfully.',
    }, null, 2) + '\n', { flag: 'wx' });
    console.log(`Deliberate owned browser evidence: learning\\S115\\evidence\\${name}`);
  }
  assert.deepEqual(errors, []);
  assert.ok(awaitedFinallyClose);
});
