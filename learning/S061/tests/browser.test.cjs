'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const sourceHash = (file) => sha(Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')));
assert.equal(sha(fs.readFileSync(helper)), helperHash);
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

test('actual isolated DOM: reader expansion, keyboard, errors, failure/unknown/freshness routing, retained history, reset and enforced CSP', { timeout: 240000 }, async () => {
  const proof = {
    schemaVersion: 1, cardId: 'A-S061', workerId: 'worker-A-S061', mode: 'synthetic',
    entry: 'learning\\S061\\index.html', runtime: process.version, playwrightVersion,
    startedAtUtc: new Date().toISOString(), captureExplicitlyEnabled: capture,
    helper: { path: 'testing\\browser\\isolated.cjs', sha256: helperHash, publication: '53c0c0d' },
    outcome: 'FAIL', observations: [], pageErrors: [], consoleErrors: [],
    exerciseNetworkRequests: [], probeRequests: [], probeResponses: [], cleanup: {},
    testedSourceHashes: Object.fromEntries([
      'index.html', 'styles.css', 'fixtures.js', 'model.js', 'app.js', 'tests\\browser.test.cjs',
    ].map((file) => [file, sourceHash(file)])),
  };
  let session;
  let stage = 'exercise';
  try {
    assert.equal(process.version, 'v22.23.4');
    assert.equal(playwrightVersion, '1.56.1');
    if (capture) assert.equal(fs.existsSync(path.join(root, 'evidence', 'browser.json')), false,
      'Deliberate capture must not overwrite earlier browser proof.');
    session = await openIsolatedLesson('learning\\S061\\index.html');
    proof.browserVersion = session.browserVersion;
    assert.match(proof.browserVersion, /^156\./);
    const page = session.page;
    page.on('pageerror', (error) => proof.pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') proof.consoleErrors.push({ stage, text: message.text() });
    });
    page.on('request', (request) => {
      if (/^https?:/i.test(request.url())) {
        (stage === 'exercise' ? proof.exerciseNetworkRequests : proof.probeRequests)
          .push({ url: request.url(), method: request.method() });
      }
    });
    page.on('response', (response) => {
      if (stage === 'csp-probes' && /^https?:/i.test(response.url())) proof.probeResponses.push(response.url());
    });
    await page.reload({ waitUntil: 'load' });
    const defaults = { addedReader: 'behind', routing: 'unchecked', freshness: 'one-version', coverage: 'complete' };
    const rows = (selector) => page.locator(selector).evaluateAll((entries) =>
      entries.map((row) => [...row.cells].map((cell) => cell.textContent)));
    const observe = async (name) => {
      proof.observations.push({
        name, phase: await page.locator('#phase').innerText(),
        gate: await page.locator('#gate').innerText(), impact: await page.locator('#impact').innerText(),
        topology: await page.locator('#topology').innerText(), versions: await page.locator('#versions').innerText(),
        metrics: await page.locator('#metrics').innerText(), reads: await rows('#reads tr'),
        history: await rows('#history tr'), prediction: await page.locator('#prediction-result').innerText(),
        trace: await page.locator('#trace').innerText(), alert: await page.locator('#input-error').textContent(),
        activeElement: await page.evaluate(() => document.activeElement.id),
      });
    };
    const reset = async () => {
      await page.locator('#reset-rehearsal').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'write');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: idle');
      assert.equal(await page.locator('#topology').innerText(), 'Readers: 1 · writers: 1 · acknowledged synthetic writes: 0');
      assert.equal(await page.locator('#gate').innerText(), 'Read contract gate: not evaluated');
      assert.equal(await page.locator('#impact').innerText(), 'Synthetic read impact: not evaluated');
      assert.equal(await page.locator('#versions').innerText(), 'No fixture write acknowledged.');
      assert.equal(await page.locator('#metrics').innerText(), 'No reads observed.');
      assert.equal(await page.locator('#trace').innerText(), 'No attempt started.');
      assert.equal(await page.locator('#result-detail').isHidden(), true);
      assert.equal(await page.locator('#reads tr').count(), 0);
      assert.equal(await page.locator('#history tr').count(), 0);
      assert.equal(await page.locator('#history-count').innerText(), 'Retained attempts: 0 / 6');
      assert.equal(await page.locator('#prediction').inputValue(), '');
      assert.equal(await page.locator('#prediction-result').innerText(), 'Prediction not checked.');
      assert.equal(await page.locator('#prediction').isDisabled(), true);
      assert.equal(await page.locator('#input-error').isHidden(), true);
      assert.equal(await page.locator('#input-error').textContent(), '');
      assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
      assert.equal(await page.locator('#assumptions').evaluate((node) => node.disabled), false);
      assert.equal(await page.locator('#lesson-controls').evaluate((form) => typeof form.reset), 'function');
      assert.equal(await page.locator('#prediction-controls').evaluate((form) => typeof form.reset), 'function');
      for (const [id, value] of Object.entries(defaults)) {
        assert.equal(await page.locator(`#${id}`).inputValue(), value);
        assert.equal(await page.locator(`#${id}`).isEnabled(), true);
      }
      assert.equal(await page.locator('#add-reader').isDisabled(), true);
      assert.equal(await page.locator('#run-reads').isDisabled(), true);
      assert.equal(await page.locator('#new-attempt').isDisabled(), true);
    };
    const next = async (settings = {}) => {
      const retained = await page.locator('#history').textContent();
      await page.locator('#new-attempt').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'write');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: idle');
      assert.equal(await page.locator('#history').textContent(), retained);
      assert.equal(await page.locator('#gate').innerText(), 'Read contract gate: not evaluated');
      assert.equal(await page.locator('#impact').innerText(), 'Synthetic read impact: not evaluated');
      assert.equal(await page.locator('#metrics').innerText(), 'No reads observed.');
      assert.equal(await page.locator('#result-detail').isHidden(), true);
      assert.equal(await page.locator('#reads tr').count(), 0);
      assert.equal(await page.locator('#trace').innerText(), 'No attempt started.');
      assert.equal(await page.locator('#prediction').inputValue(), '');
      assert.equal(await page.locator('#prediction-result').innerText(), 'Prediction not checked.');
      for (const [id, value] of Object.entries({ ...defaults, ...settings })) {
        assert.equal(await page.locator(`#${id}`).inputValue(), defaults[id]);
        await page.locator(`#${id}`).selectOption(value);
      }
    };
    const run = async (checkLocked = false) => {
      await page.locator('#write').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: written');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'add-reader');
      assert.equal(await page.locator('#assumptions').evaluate((node) => node.disabled), true);
      assert.equal(await page.locator('#topology').innerText(), 'Readers: 1 · writers: 1 · acknowledged synthetic writes: 1');
      for (const id of Object.keys(defaults)) assert.equal(await page.locator(`#${id}`).isDisabled(), true);
      if (checkLocked) {
        await page.locator('#lesson-controls').evaluate((form) =>
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
        assert.match(await page.locator('#input-error').innerText(), /requires idle/);
        assert.equal(await page.locator('#history tr').count(), 0);
        await observe('locked write phase rejects repeated submit without creating evidence');
      }
      await page.locator('#add-reader').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: expanded');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'run-reads');
      assert.equal(await page.locator('#topology').innerText(), 'Readers: 2 · writers: 1 · acknowledged synthetic writes: 1');
      if (checkLocked) {
        await page.locator('#add-reader').evaluate((button) =>
          button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
        assert.match(await page.locator('#input-error').innerText(), /requires written/);
        assert.equal(await page.locator('#history tr').count(), 0);
        await observe('explicit expansion and duplicate-add guard retain two readers and one writer');
      }
      await page.locator('#run-reads').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: complete');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'prediction');
      assert.equal(await page.locator('#reads tr[data-read]').count(), 4);
      assert.equal(await page.locator('#input-error').isHidden(), true);
    };
    const predict = async (selected, verifier = 'PASS') => {
      await page.locator('#prediction').selectOption(selected);
      await page.locator('#prediction').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'check-prediction');
      await page.keyboard.press('Space');
      assert.match(await page.locator('#prediction-result').innerText(), new RegExp(`^Prediction verifier: ${verifier}`));
      assert.equal(await page.locator('#prediction').isDisabled(), true);
    };
    assert.equal(await page.locator('#training-banner').innerText(),
      'Training rehearsal - synthetic data - not a live Azure result');
    await page.locator('#addedReader').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#addedReader').inputValue(), 'current');
    await page.keyboard.press('Home');
    assert.equal(await page.locator('#addedReader').inputValue(), 'behind');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'routing');
    proof.keyboardFocusOutline = await page.locator('#routing').evaluate((node) => ({
      style: getComputedStyle(node).outlineStyle, width: getComputedStyle(node).outlineWidth,
    }));
    assert.equal(proof.keyboardFocusOutline.style, 'solid');
    assert.equal(proof.keyboardFocusOutline.width, '3px');

    await page.locator('#run-reads').evaluate((button) =>
      button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    assert.match(await page.locator('#input-error').innerText(), /requires expanded/);
    assert.equal(await page.locator('#phase').innerText(), 'Phase: idle');
    await observe('state guard rejects reads before an acknowledged write and expansion');
    await reset();
    await page.locator('#addedReader').evaluate((select) => {
      select.add(new Option('Invalid synthetic choice', 'invalid'));
      select.value = 'invalid';
    });
    await page.locator('#write').click();
    assert.match(await page.locator('#input-error').innerText(), /^Added reader:/);
    assert.equal(await page.locator('#addedReader').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'addedReader');
    assert.equal(await page.locator('#phase').innerText(), 'Phase: idle');
    await observe('input guard exposes an accessible error and preserves idle state');
    await page.locator('#addedReader').evaluate((select) => select.querySelector('[value="invalid"]').remove());
    await reset();

    await run(true);
    assert.equal(await page.locator('#gate').innerText(), 'Read contract gate: FAIL');
    assert.match(await page.locator('#metrics').innerText(), /correct 3 · failed 1 · unknown 0/);
    assert.deepEqual((await rows('#reads tr'))[3], [
      'own-write-added / reader-2', 'v11', 'reader-2 / UNCHECKED_REPLICA', 'reader-2 / v10', 'FAIL / STALE_READ',
    ]);
    await predict('FAIL');
    await observe('unchecked added reader fails read-your-writes even with bounded-staleness browse');
    const firstRetained = await page.locator('#history tr[data-attempt="1"] pre').textContent();
    assert.equal(JSON.parse(firstRetained).reads[3].receivedVersion, 10);
    await page.locator('#history tr[data-attempt="1"] summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#history tr[data-attempt="1"] details').evaluate((node) => node.open), true);
    await page.keyboard.press('Enter');

    await next({ routing: 'primary-for-session' });
    await run();
    assert.equal(await page.locator('#gate').innerText(), 'Read contract gate: PASS');
    assert.match(await page.locator('#metrics').innerText(), /correct 4 · failed 0 · unknown 0 · replica reads 2 · primary reads 2 · eligible offloaded 2/);
    await predict('PASS');
    await observe('session-primary preserves the acknowledged write and offloads eligible browse reads');
    assert.equal(await page.locator('#history tr[data-attempt="1"] pre').textContent(), firstRetained);

    await next({ routing: 'primary-for-session', freshness: 'current-only' });
    await run();
    assert.equal(await page.locator('#gate').innerText(), 'Read contract gate: FAIL');
    assert.match((await rows('#reads tr'))[2][4], /^FAIL/);
    await predict('PASS', 'FAIL');
    await observe('strict browse freshness still fails; wrong learning prediction cannot change measured failure');

    await next({ routing: 'verified-or-primary', freshness: 'current-only' });
    await run();
    assert.equal(await page.locator('#gate').innerText(), 'Read contract gate: PASS');
    assert.match(await page.locator('#metrics').innerText(), /replica reads 2 · primary reads 2 · eligible offloaded 1/);
    assert.match(await page.locator('#versions').innerText(), /reader-2 v10/);
    await predict('PASS');
    await observe('verified watermark fallback satisfies strict freshness without synchronizing the replica');

    await next({ addedReader: 'unknown' });
    await run();
    assert.equal(await page.locator('#gate').innerText(), 'Read contract gate: UNKNOWN');
    assert.equal(await page.locator('#impact').innerText(), 'Synthetic read impact: UNVERIFIED');
    assert.match(await page.locator('#metrics').innerText(), /correct 2 · failed 0 · unknown 2/);
    await predict('UNKNOWN');
    await observe('unknown added-reader version produces two unknown reads rather than assumed correctness');

    await next({ addedReader: 'unknown', routing: 'verified-or-primary' });
    await run();
    assert.equal(await page.locator('#gate').innerText(), 'Read contract gate: PASS');
    assert.match(await page.locator('#metrics').innerText(), /correct 4 · failed 0 · unknown 0 · replica reads 2 · primary reads 2/);
    await predict('PASS');
    await observe('unknown watermark uses primary fallback rather than pretending the reader caught up');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'reset-rehearsal');
    assert.equal(await page.locator('#history tr[data-attempt]').count(), 6);
    assert.equal(await page.locator('#new-attempt').isDisabled(), true);
    const retained = await page.locator('#history').textContent();
    await page.locator('#new-attempt').evaluate((button) =>
      button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    assert.match(await page.locator('#input-error').innerText(), /History full/);
    assert.equal(await page.locator('#history').textContent(), retained);
    assert.equal(await page.locator('#history tr[data-attempt="1"] pre').textContent(), firstRetained);
    await observe('six-attempt history cap refuses a seventh attempt without eviction');
    await reset();
    await observe('keyboard reset from full history clears results, errors and exact defaults');

    await page.locator('#coverage').selectOption('partial');
    await run();
    assert.equal(await page.locator('#gate').innerText(), 'Read contract gate: UNKNOWN');
    assert.match(await page.locator('#metrics').innerText(), /observed 3 · correct 3 · failed 0 · unknown 1/);
    await page.locator('#check-prediction').focus();
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#input-error').innerText(), /^Prediction:/);
    assert.equal(await page.locator('#prediction').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'prediction');
    await observe('partial observations stay unknown and empty prediction has an accessible input error');
    await predict('UNKNOWN');
    assert.equal(await page.locator('#input-error').isHidden(), true);
    await next({ coverage: 'partial', freshness: 'current-only' });
    await run();
    assert.equal(await page.locator('#gate').innerText(), 'Read contract gate: FAIL');
    assert.match(await page.locator('#metrics').innerText(), /correct 2 · failed 1 · unknown 1/);
    await predict('FAIL');
    await observe('known stale read dominates incomplete coverage without dropping the remaining unknown');

    await next({ coverage: 'none', addedReader: 'unknown', freshness: 'current-only' });
    await run();
    assert.equal(await page.locator('#gate').innerText(), 'Read contract gate: UNKNOWN');
    assert.match(await page.locator('#metrics').innerText(), /observed 0 · correct 0 · failed 0 · unknown 4 · replica reads 0 · primary reads 0/);
    assert.ok((await rows('#reads tr')).every((row) => row[3] === 'No observation / version unknown' && row[4] === 'UNKNOWN / NO_OBSERVATION'));
    await predict('UNKNOWN');
    await observe('absent observations never invent returned versions or successful routing');

    await next({ addedReader: 'current', freshness: 'current-only' });
    await run();
    assert.equal(await page.locator('#gate').innerText(), 'Read contract gate: PASS');
    assert.match(await page.locator('#metrics').innerText(), /replica reads 4 · primary reads 0 · eligible offloaded 2/);
    await predict('PASS');
    await observe('current supplied replica offloads reads but writers remain one');
    await page.setViewportSize({ width: 320, height: 800 });
    proof.smallViewport = await page.evaluate(() => ({
      width: innerWidth, pageWidth: document.documentElement.scrollWidth,
      noPageHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
    }));
    assert.equal(proof.smallViewport.noPageHorizontalOverflow, true);
    await reset();
    await page.locator('#addedReader').selectOption('unknown');
    await page.locator('#write').click();
    assert.equal(await page.locator('#phase').innerText(), 'Phase: written');
    await reset();
    await observe('keyboard reset abandons written locked assumptions');
    await page.locator('#write').click();
    await page.locator('#add-reader').click();
    assert.equal(await page.locator('#phase').innerText(), 'Phase: expanded');
    await reset();
    await observe('keyboard reset abandons expanded state without stale output');

    stage = 'csp-probes';
    const probe = await page.evaluate(async () => {
      window.__s061InlineExecuted = false;
      window.__s061Violations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__s061Violations.push({
          effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition,
        });
      });
      const script = document.createElement('script');
      script.textContent = 'window.__s061InlineExecuted = true;';
      document.head.append(script);
      let fetchRejected = false;
      try { await fetch('https://synthetic.invalid/S061-csp-probe'); } catch { fetchRejected = true; }
      script.remove();
      return { fetchRejected };
    });
    await page.waitForFunction(() => window.__s061Violations.some((entry) => entry.effectiveDirective === 'connect-src')
      && window.__s061Violations.some((entry) => entry.effectiveDirective.startsWith('script-src')),
    undefined, { timeout: 5000 });
    proof.csp = await page.evaluate((result) => ({
      ...result, inlineExecuted: window.__s061InlineExecuted, violations: window.__s061Violations,
    }), probe);
    assert.equal(proof.csp.fetchRejected, true);
    assert.equal(proof.csp.inlineExecuted, false);
    assert.ok(proof.csp.violations.every((entry) => entry.disposition === 'enforce'));
    assert.deepEqual(proof.probeResponses, []);
    assert.deepEqual(proof.exerciseNetworkRequests, []);
    assert.deepEqual(proof.pageErrors, []);
    assert.ok(proof.consoleErrors.every((entry) => entry.stage === 'csp-probes'));
    proof.outcome = 'PASS';
  } catch (error) {
    proof.failure = { name: error.name, message: error.message, stack: error.stack };
    throw error;
  } finally {
    try {
      if (session) await session.close();
      proof.cleanup = { sessionCloseAwaited: Boolean(session), serversStarted: 0, foregroundLeaseUsed: false };
    } catch (error) {
      proof.outcome = 'FAIL';
      proof.cleanup = { sessionCloseAwaited: false, error: error.message };
      throw error;
    } finally {
      proof.completedAtUtc = new Date().toISOString();
      if (capture) {
        const file = proof.outcome === 'PASS' ? 'browser.json' : `browser-failure-${Date.now()}.json`;
        fs.writeFileSync(path.join(root, 'evidence', file), JSON.stringify(proof, null, 2) + '\n');
      }
    }
  }
});
