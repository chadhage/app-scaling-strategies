'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const browserRoot = path.resolve(root, '..', '..', 'testing', 'browser');
const helperPath = path.join(browserRoot, 'isolated.cjs');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(fs.readFileSync(helperPath)), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helperPath);
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const evidencePath = path.join(root, 'evidence', 'browser.json');
function ownedHashes(dir = root) {
  return Object.fromEntries(fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? Object.entries(ownedHashes(file))
      : [[path.relative(root, file), hash(fs.readFileSync(file))]];
  }).sort(([a], [b]) => a.localeCompare(b)));
}

test('actual isolated browser: DNS DATA-only lesson, keyboard, outcomes, error/reset, bound and enforced CSP', { timeout: 90000 }, async () => {
  if (process.env.CAPTURE_BROWSER_EVIDENCE !== undefined) assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1');
  if (capture) assert.equal(fs.existsSync(evidencePath), false, 'Deliberate capture cannot overwrite browser evidence');
  assert.equal(require(path.join(browserRoot, 'node_modules', 'playwright', 'package.json')).version, '1.56.1');
  assert.equal(process.version, 'v22.23.4');
  const before = ownedHashes();
  const observations = [];
  const pageErrors = [];
  const externalResponses = [];
  let session;
  let browserVersion;
  let csp;
  let finalSummary;
  try {
    session = await openIsolatedLesson('learning\\S102\\index.html');
    browserVersion = session.browserVersion;
    assert.equal(browserVersion, '156.0.4314.50');
    const page = session.page;
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => {
      if (/^https?:/.test(response.url())) externalResponses.push({ url: response.url(), status: response.status() });
    });
    const value = (id) => page.locator(`#${id}`).inputValue();
    const text = (id) => page.locator(`#${id}`).innerText();
    const press = async (id, key = 'Enter') => {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press(key);
    };
    const choose = async (id, index) => {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press('Home');
      for (let n = 0; n < index; n += 1) await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
    };
    const observe = async (name) => observations.push({
      name, phase: await text('phase'), outcome: await text('current-status'),
      agreement: await text('sample-agreement'), interpretation: await text('interpretation'),
      currentRows: await page.locator('#trace-rows tr').allTextContents(),
      historyRows: await page.locator('#history-rows tr').count(), summary: await text('history-summary'),
      error: await page.locator('#error-message').isVisible() ? await text('error-message') : null,
      focusedId: await page.evaluate(() => document.activeElement.id)
    });
    const reset = async () => {
      await press('reset-rehearsal');
      assert.equal(await page.locator('#trace-rows tr').count(), 0);
      assert.equal(await value('retention-policy'), 'retain');
      assert.equal(await value('sample-time'), 'immediate');
      assert.equal(await value('observation-coverage'), 'complete');
      assert.equal(await value('predicted-outcome'), 'success');
      assert.equal(await value('convergence-reason'), 'fresh-proves-all');
      assert.equal(await page.locator('#error-message').isVisible(), false);
    };

    assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
    assert.equal(new URL(page.url()).protocol, 'file:');
    assert.match(await page.title(), /S102/);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
    assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'solid');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'lesson');
    await observe('initial keyboard skip, exact banner, empty history');

    await press('publish-answer', 'Enter');
    assert.equal(await page.locator('#retention-policy').isDisabled(), true);
    await press('compare-answers', 'Space');
    assert.equal(await page.locator('#trace-rows tr').count(), 3);
    assert.match(await text('current-status'), /^SUCCESS — attempted 3, successful 3, interruptions 0, unknown 0/);
    assert.match(await page.locator('#trace-rows tr').nth(1).innerText(), /192\.0\.2\.10.*90 s.*usable.*8 ms.*SUCCESS/s);
    assert.match(await page.locator('#trace-rows tr').nth(2).innerText(), /192\.0\.2\.10.*150 s.*usable.*9 ms.*SUCCESS/s);
    await press('check-explanation');
    assert.match(await text('interpretation'), /^FAIL — measured outcome stays SUCCESS/);
    await observe('positive retained overlap; wrong immediate-convergence interpretation');
    await reset();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'publish-answer');
    assert.equal(await page.locator('#history-rows tr').count(), 1);

    await choose('retention-policy', 1);
    assert.equal(await value('retention-policy'), 'retire-now');
    await press('publish-answer', 'Space');
    await press('compare-answers');
    assert.match(await text('current-status'), /^FAILURE — attempted 3, successful 1, interruptions 2, unknown 0/);
    await choose('predicted-outcome', 1);
    await choose('convergence-reason', 1);
    await press('check-explanation', 'Space');
    assert.match(await text('interpretation'), /^PASS — measured outcome stays FAILURE/);
    await observe('early retirement interrupts cached journeys; learner PASS is not success');
    await reset();

    await press('publish-answer');
    await choose('observation-coverage', 1);
    await press('compare-answers', 'Space');
    assert.match(await text('current-status'), /^UNKNOWN — attempted 3, successful 2, interruptions 0, unknown 1/);
    assert.match(await page.locator('#trace-rows tr').nth(2).innerText(), /missing-observation.*UNKNOWN.*UNKNOWN.*UNKNOWN.*UNKNOWN.*UNKNOWN.*UNKNOWN/s);
    await choose('predicted-outcome', 2);
    await choose('convergence-reason', 1);
    await press('check-explanation');
    assert.match(await text('interpretation'), /^PASS — measured outcome stays UNKNOWN/);
    await observe('unknown cached B without fabricated answer or routing');
    await reset();

    await press('publish-answer');
    await choose('sample-time', 1);
    await press('compare-answers');
    assert.match(await page.locator('#trace-rows tr').nth(1).innerText(), /192\.0\.2\.20/);
    assert.match(await page.locator('#trace-rows tr').nth(2).innerText(), /192\.0\.2\.10.*60 s/s);
    await observe('first expiry does not expire every cached answer');
    await reset();
    await press('publish-answer');
    await choose('sample-time', 2);
    await press('compare-answers');
    assert.equal((await page.locator('#trace-rows').innerText()).split('192.0.2.20').length - 1, 3);
    assert.match(await text('sample-agreement'), /yes, only these three samples/);
    assert.match(await text('convergence-warning'), /Universal convergence: NOT ESTABLISHED/);
    await observe('overlap-end sampled agreement remains non-universal');
    await reset();

    const historyCount = await page.locator('#history-rows tr').count();
    await page.evaluate(() => {
      const option = new Option('Invalid teaching input', 'not-a-policy');
      document.getElementById('retention-policy').add(option);
      document.getElementById('retention-policy').value = option.value;
    });
    await press('publish-answer');
    assert.match(await text('error-message'), /Invalid retention policy/);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'error-message');
    assert.equal(await page.locator('#history-rows tr').count(), historyCount);
    await observe('invalid enum rejected, announced and focused without mutation');
    const stale = await page.locator('#publish-answer').getAttribute('data-run-id');
    await reset();
    await page.locator('#publish-answer').evaluate((button, old) => { button.dataset.runId = old; }, stale);
    await press('publish-answer');
    assert.match(await text('error-message'), /Stale run token/);
    assert.equal(await page.locator('#history-rows tr').count(), historyCount);
    await observe('stale typed run token rejected without mutation');
    await reset();
    await page.locator('#compare-answers').evaluate((button) => { button.disabled = false; });
    await press('compare-answers');
    assert.match(await text('error-message'), /Invalid phase/);
    await observe('forced out-of-phase command fails at the state guard');
    await reset();
    await press('publish-answer');
    await page.evaluate(() => {
      const option = new Option('Invalid observation', 'bogus');
      document.getElementById('observation-coverage').add(option);
      document.getElementById('observation-coverage').value = option.value;
    });
    await press('compare-answers');
    assert.match(await text('error-message'), /Invalid observation coverage/);
    assert.equal(await page.locator('#history-rows tr').count(), historyCount);
    await observe('bad coverage rejects comparison; reset repairs current controls only');
    await reset();

    for (let n = historyCount; n < 12; n += 1) {
      await press('publish-answer');
      await press('compare-answers', n % 2 ? 'Space' : 'Enter');
      await reset();
    }
    assert.equal(await page.locator('#history-rows tr').count(), 12);
    assert.equal(await page.locator('#publish-answer').isDisabled(), true);
    assert.equal(await page.locator('#reset-rehearsal').isDisabled(), false);
    finalSummary = await text('history-summary');
    assert.equal(finalSummary, 'Comparisons 12/12 · attempted 36 · successful 33 · interruptions 2 · unknown 1');
    await page.locator('#publish-answer').evaluate((button) => { button.disabled = false; });
    await press('publish-answer');
    assert.match(await text('error-message'), /Comparison limit reached/);
    await observe('thirteenth comparison fails; prior failures/unknowns stay in denominator');
    await reset();
    assert.equal(await text('history-summary'), finalSummary);
    await observe('bounded reset still works and retains all twelve records');
    assert.deepEqual(pageErrors, []);

    const originalURL = page.url();
    await page.evaluate(() => {
      const script = document.createElement('script');
      script.src = new URL('tests/csp-probe.js', location.href).href;
      document.head.append(script);
    });
    await page.waitForFunction(() => globalThis.s102CspResult?.done === true
      && ['img-src', 'connect-src', 'form-action'].every(
        (directive) => globalThis.s102CspViolations.some((event) => event.directive === directive)
      ));
    csp = await page.evaluate(() => globalThis.s102CspResult);
    assert.equal(csp.inlineExecuted, false);
    assert.equal(csp.evalExecuted, false);
    assert.equal(csp.evalBlocked, true);
    assert.equal(csp.connectionBlocked, true);
    assert.ok(csp.violations.some((event) => event.blockedURI === 'inline' && event.directive.startsWith('script-src')));
    assert.ok(csp.violations.some((event) => event.blockedURI === 'eval' && event.directive.startsWith('script-src')));
    for (const directive of ['img-src', 'connect-src', 'form-action']) {
      assert.ok(csp.violations.some((event) => event.directive === directive && event.disposition === 'enforce'), directive);
    }
    assert.equal(page.url(), originalURL);
    assert.deepEqual(externalResponses, []);
    assert.deepEqual(pageErrors, []);
    assert.equal(await text('history-summary'), finalSummary);
    await observe('actual CSP blocks inline/eval/image/connect/form with no external response or navigation');
  } finally {
    if (session) await session.close();
  }
  assert.deepEqual(ownedHashes(), before, 'Browser verification modified source or published evidence');
  if (capture) {
    fs.writeFileSync(evidencePath, `${JSON.stringify({
      capturedAtUtc: new Date().toISOString(), cardId: 'A-S102', workerId: 'worker-A-S102',
      mode: 'fixed synthetic teaching data', entry: 'learning\\S102\\index.html',
      tooling: { node: process.version, playwright: '1.56.1', edge: browserVersion,
        helperRawSha256: hash(fs.readFileSync(helperPath)), helperPublishedCommit: '53c0c0d',
        lifecyclePrototype: 'unqualified, not used', productionNode24: 'not validated' },
      observations, csp, pageErrors, externalResponses, finalSummary,
      ownedFileCount: Object.keys(before).length, originalOwnedFilesUnchanged: true,
      closeAwaitedInFinally: true, nativeResult: false, sourceParentCompleted: false
    }, null, 2)}\n`, { flag: 'wx' });
  }
});
