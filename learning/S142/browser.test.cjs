'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sha256, canonicalSha256, hashTree, captureBrowser } = require('./record.cjs');
const helper = path.resolve(__dirname, '..', '..', 'testing', 'browser', 'isolated.cjs');
const helperSha256 = sha256(fs.readFileSync(helper));
assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.resolve(__dirname, '..', '..', 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;

test('actual isolated Edge DOM, keyboard, all outcomes, recovery, reset, error and CSP', { timeout: 120000 }, async () => {
  const before = hashTree();
  const proof = {
    schema: 's142-local-browser-proof/1', mode: 'fixed-fiction-data-only',
    node: process.version, playwright: playwrightVersion, helperSha256,
    codeSha256: {
      model: sha256(fs.readFileSync(path.join(__dirname, 'model.js'))),
      lesson: sha256(fs.readFileSync(path.join(__dirname, 'lesson.js'))),
      html: sha256(fs.readFileSync(path.join(__dirname, 'index.html'))),
      css: sha256(fs.readFileSync(path.join(__dirname, 'style.css'))),
    },
    codeCanonicalSha256: {
      model: canonicalSha256(fs.readFileSync(path.join(__dirname, 'model.js'))),
      lesson: canonicalSha256(fs.readFileSync(path.join(__dirname, 'lesson.js'))),
      html: canonicalSha256(fs.readFileSync(path.join(__dirname, 'index.html'))),
      css: canonicalSha256(fs.readFileSync(path.join(__dirname, 'style.css'))),
    },
    status: 'running', cases: [], requests: [], pageErrors: [], cspViolations: [],
    noLiveLoadOrBenchmark: true, nativeProof: false, productionNode24Proof: false,
    lifecyclePrototypeQualified: false, cleanup: 'not started',
  };
  let session;
  let failure;
  try {
    assert.match(process.version, /^v22\./);
    assert.equal(playwrightVersion, '1.56.1');
    session = await openIsolatedLesson('learning\\S142\\index.html');
    proof.browser = session.browserVersion;
    proof.cleanup = 'owned session open';
    assert.match(session.browserVersion, /^156\./);
    const page = session.page;
    proof.requests.push(...await page.evaluate(() => [
      { url: location.href, method: 'GET', resourceType: 'document', observation: 'initial-file-entry' },
      ...performance.getEntriesByType('resource').map((entry) => ({
        url: entry.name, method: 'GET', resourceType: entry.initiatorType, observation: 'initial-resource-timing',
      })),
    ]));
    page.on('request', (request) => proof.requests.push({ url: request.url(), method: request.method(), resourceType: request.resourceType() }));
    page.on('pageerror', (cause) => proof.pageErrors.push(String(cause)));
    const value = async (id) => page.locator('#' + id).textContent();
    const measured = async () => JSON.parse(await value('measurement-json'));
    const retained = async () => JSON.parse(await value('retained-json'));
    const enter = async () => page.keyboard.press('Enter');
    async function startWithKeyboard(key) {
      await page.locator('#trace').focus();
      await page.keyboard.press(key);
      if (key === 'Home' && (await page.locator('#trace').inputValue()) !== 'within-envelope') {
        throw new Error('Native select Home did not choose the first fixed trace.');
      }
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'initialize');
      await enter();
      assert.match(await value('phase'), /initializing/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'burst');
      await page.keyboard.press('Space');
      assert.match(await value('phase'), /burst/);
      assert.equal(await page.locator('#measure').isDisabled(), true);
      await enter();
      assert.match(await value('phase'), /inspected/);
      await enter();
      assert.match(await value('phase'), /measured/);
    }
    async function recoverWithKeyboard() {
      await page.locator('#recover').focus();
      await enter();
      assert.match(await value('phase'), /recovered/);
      assert.equal(await page.locator('#measure').isDisabled(), true);
      assert.match(await value('verifier'), /PRIOR measurement/);
      await enter();
      await enter();
      assert.match(await value('phase'), /measured/);
    }
    async function resetWithKeyboard(expectedAttempted) {
      await page.locator('#reset-rehearsal').focus();
      await page.keyboard.press('Space');
      assert.match(await value('phase'), /idle/);
      assert.equal(await page.locator('#trace').inputValue(), 'within-envelope');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'trace');
      assert.equal(await value('verdict'), 'NOT MEASURED');
      assert.match(await value('session-counts'), new RegExp('attempted ' + expectedAttempted + ';'));
      assert.equal(await page.evaluate(() => typeof document.getElementById('rehearsal-form').reset), 'function');
    }

    assert.equal(await page.title(), 'S142 - Burst during initialization');
    assert.equal(await page.locator('[data-training-banner]').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
    assert.equal(await value('verdict'), 'NOT MEASURED');
    assert.equal(await page.locator('#initialize').isDisabled(), false);
    assert.equal(await page.locator('#burst').isDisabled(), true);
    assert.equal(await page.evaluate(() => typeof document.getElementById('rehearsal-form').reset), 'function');
    assert.equal(await page.locator('[name="reset"], [id="reset"]').count(), 0);
    assert.equal(await page.locator('.banner').evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(218, 234, 253)');
    proof.cases.push({ name: 'load-and-real-CSS', passed: true });

    await page.evaluate(() => {
      const option = document.createElement('option');
      option.value = 'unregistered-trace';
      option.textContent = 'Invalid fixed trace (test probe)';
      document.getElementById('trace').append(option);
      document.getElementById('trace').value = option.value;
    });
    await page.locator('#initialize').focus();
    await enter();
    assert.match(await value('error'), /Command rejected \(ERR_S142_COMMAND\)/);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
    assert.equal((await retained()).history.length, 0);
    assert.equal(await value('verdict'), 'NOT MEASURED');
    await page.locator('#trace option[value="unregistered-trace"]').evaluate((element) => element.remove());
    proof.cases.push({ name: 'invalid-input-error-keeps-history', passed: true });

    await startWithKeyboard('Home');
    assert.equal(await value('error'), '');
    const positive = await measured();
    assert.equal(positive.verdict, 'PASS');
    assert.deepEqual(positive.counts, { attempted: 4, successful: 4, interrupted: 0, unknown: 0 });
    assert.equal(positive.latency.maxMs, 1500);
    assert.equal(positive.nativeProof, false);
    assert.match(await value('counts'), /4 \/ 4 = 100%/);
    assert.match(await page.locator('#pressure-body').textContent(), /30 \+ 70 = 100/);
    assert.match(await page.locator('#pressure-body').textContent(), /30 \+ 55 = 85/);
    await recoverWithKeyboard();
    assert.equal((await retained()).runs[0].measurements.length, 2);
    proof.cases.push({ name: 'positive-inclusive-boundaries-by-keyboard', passed: true, observed: positive });
    await resetWithKeyboard(4);
    assert.equal((await retained()).runs[0].measurements[0].verdict, 'PASS');
    proof.cases.push({ name: 'reset-retains-positive-run-and-native-form-reset', passed: true });

    await page.locator('#trace').focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#trace').inputValue(), 'contention');
    await page.keyboard.press('Tab');
    await enter();
    await page.keyboard.press('Space');
    await enter();
    await enter();
    const negative = await measured();
    assert.equal(negative.verdict, 'FAIL');
    assert.deepEqual(negative.counts, { attempted: 4, successful: 1, interrupted: 2, unknown: 1 });
    assert.equal(negative.successFraction, 0.25);
    assert.equal(negative.failedChecks.length, 5);
    assert.match(await value('diagnostics'), /Separate tier passes 4 \/ 4; peak ready true, HTTP 200, average throughput 118/);
    assert.match(await page.locator('#pressure-body').textContent(), /45 \+ 70 = 115/);
    assert.match(await page.locator('#pressure-body').textContent(), /35 \+ 55 = 90/);
    assert.match(await value('checks'), /FAIL combined shared connections: 115 > 100/);
    assert.match(await value('counts'), /1 \/ 4 = 25%/);
    proof.cases.push({ name: 'known-contention-not-masked-by-tier-health-throughput', passed: true, observed: negative });
    await recoverWithKeyboard();
    const recovered = await measured();
    assert.deepEqual(recovered.counts, negative.counts);
    assert.equal(recovered.verdict, 'FAIL');
    assert.equal(recovered.latency.maxMs, 1800);
    assert.ok(recovered.latency.meanMs < 1500);
    assert.deepEqual(recovered.journeys.find((item) => item.id === 'J1').interruptions, [{ atMs: 600, code: 'user-visible-queue-timeout' }]);
    assert.deepEqual(recovered.journeys.find((item) => item.id === 'J3').interruptions, [{ atMs: 700, code: 'broken-required-connection' }]);
    assert.equal((await retained()).runs[1].measurements.length, 2);
    assert.equal(await page.locator('#pressure-body tr').count(), 2);
    assert.equal(await page.locator('#journeys-body tr').count(), 8);
    proof.cases.push({ name: 'recovery-retains-original-interruption-and-budget-failure', passed: true, observed: recovered });
    await resetWithKeyboard(8);
    assert.match(await value('session-counts'), /interrupted 2; unknown 1/);
    proof.cases.push({ name: 'reset-retains-interrupted-and-unknown-started-journeys', passed: true });

    await startWithKeyboard('End');
    const unknown = await measured();
    assert.equal(unknown.traceId, 'unobserved-peak');
    assert.equal(unknown.verdict, 'UNKNOWN');
    assert.deepEqual(unknown.counts, { attempted: 4, successful: 2, interrupted: 0, unknown: 2 });
    assert.equal(unknown.successFraction, 0.5);
    assert.match(await value('checks'), /UNKNOWN combined shared connections/);
    assert.match(await value('checks'), /J3 unknown.*migration observed false/);
    assert.match(await value('counts'), /2 \/ 4 = 50%/);
    await recoverWithKeyboard();
    assert.equal((await measured()).verdict, 'UNKNOWN');
    const allRuns = await retained();
    assert.equal(allRuns.runs.length, 3);
    assert.equal(allRuns.history.length, 23);
    assert.equal(await page.locator('#reset-rehearsal').isDisabled(), true);
    assert.equal(await page.locator('button:enabled').count(), 0);
    assert.match(await value('session-counts'), /attempted 12; successful 7; interrupted 2; unknown 3/);
    proof.cases.push({ name: 'unknown-denominator-three-run-bound-full-retained-history', passed: true, observed: unknown, retainedCommandCount: 23, retainedAttempted: 12 });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#measurement-heading').scrollIntoViewIfNeeded();
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth, documentWidth: document.documentElement.scrollWidth,
      bannerText: document.querySelector('[data-training-banner]').textContent,
    }));
    assert.ok(viewport.documentWidth <= viewport.width, 'tables/JSON must scroll inside their containers, not overflow the page');
    await page.locator('#measurement-json').evaluate((element) => element.parentElement.open = true);
    await page.locator('summary').first().focus();
    await page.keyboard.press('Tab');
    proof.cases.push({ name: 'actual-mobile-layout-and-keyboard-details', passed: true, observed: viewport });

    await page.evaluate(() => {
      window.__S142_POLICY_VIOLATIONS__ = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__S142_POLICY_VIOLATIONS__.push({ effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI });
      });
      const probe = document.createElement('p');
      probe.id = 's142-csp-probe';
      probe.textContent = 'Fixed inline-style policy probe';
      document.body.append(probe);
      const script = document.createElement('script');
      script.textContent = 'window.__S142_INLINE_EXECUTED__ = true;';
      document.head.append(script);
      const style = document.createElement('style');
      style.textContent = '#s142-csp-probe { color: rgb(255, 0, 0); }';
      document.head.append(style);
    });
    await page.waitForFunction(() => window.__S142_POLICY_VIOLATIONS__.some((event) => event.effectiveDirective.startsWith('script-src'))
      && window.__S142_POLICY_VIOLATIONS__.some((event) => event.effectiveDirective.startsWith('style-src')));
    assert.equal(await page.evaluate(() => window.__S142_INLINE_EXECUTED__), undefined);
    assert.notEqual(await page.locator('#s142-csp-probe').evaluate((element) => getComputedStyle(element).color), 'rgb(255, 0, 0)');
    proof.cspViolations = await page.evaluate(() => window.__S142_POLICY_VIOLATIONS__);
    proof.cases.push({ name: 'actual-inline-script-and-style-CSP-enforcement', passed: true, observed: proof.cspViolations });

    await page.route(/model\.js$/, (route) => route.abort('failed'));
    await page.reload({ waitUntil: 'load', timeout: 15000 });
    assert.equal(await value('phase'), 'LOCAL SCRIPT ERROR - no result');
    assert.match(await value('error'), /local model did not load/);
    assert.equal(await value('verdict'), 'NOT MEASURED');
    assert.equal(await page.locator('button:enabled').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
    assert.equal(await page.evaluate(() => typeof window.S142), 'undefined');
    proof.cases.push({ name: 'actual-blocked-model-dependency-error-no-false-verdict', passed: true });

    assert.equal(proof.pageErrors.length, 0);
    assert.ok(proof.requests.every((request) => request.url.startsWith('file:') && request.method === 'GET'));
    proof.networkAttemptCount = proof.requests.filter((request) => /^(?:https?|wss?):/.test(request.url)).length;
    assert.equal(proof.networkAttemptCount, 0);
    proof.status = 'passed';
  } catch (cause) {
    proof.status = 'failed';
    proof.failure = String(cause.stack || cause);
    failure = cause;
  } finally {
    try {
      if (session) await session.close();
      proof.cleanup = session ? 'awaited finally close complete' : 'no owned session created';
    } catch (cause) {
      proof.cleanup = 'failed';
      proof.cleanupFailure = String(cause.stack || cause);
      failure = failure ? new AggregateError([failure, cause], 'Browser verification and cleanup failed') : cause;
      proof.status = 'failed';
    }
    try {
      assert.deepEqual(hashTree(), before, 'normal verification must not mutate any owned lesson or prior evidence bytes');
      proof.lessonBytesUnchangedBeforeCapture = true;
    } catch (cause) {
      proof.lessonBytesUnchangedBeforeCapture = false;
      proof.integrityFailure = String(cause.stack || cause);
      failure = failure ? new AggregateError([failure, cause], 'Browser and byte-integrity verification failed') : cause;
      proof.status = 'failed';
    }
    const capture = captureBrowser(proof);
    if (capture) console.log(`Deliberate unique raw capture: ${capture.path}; SHA-256 ${capture.rawSha256}`);
  }
  if (failure) throw failure;
  console.log(`Observed ${proof.cases.length} actual browser cases; ${proof.browser}; cleanup awaited; zero network attempts.`);
});
