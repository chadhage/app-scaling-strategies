'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const model = require('../model.js');
const folder = path.resolve(__dirname, '..');
const repo = path.resolve(folder, '..', '..');
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const helperSha256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function sourceHashes(directory = folder) {
  return Object.fromEntries(fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'evidence') return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? Object.entries(sourceHashes(file))
      : [[path.relative(folder, file), hash(Buffer.from(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')))]];
  }));
}

test('actual isolated Edge DOM, keyboard, errors, failure/unknown paths, retained history, reset and CSP', async () => {
  assert.equal(hash(fs.readFileSync(helper)), helperSha256);
  const requireHelper = createRequire(helper);
  const playwrightVersion = requireHelper('playwright/package.json').version;
  assert.equal(playwrightVersion, '1.56.1');
  assert.match(process.version, /^v22\./);
  const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
  const evidenceId = process.env.BROWSER_EVIDENCE_ID;
  if (capture) assert.match(evidenceId || '', /^browser-\d{3}$/);
  const destination = capture ? path.join(folder, 'evidence', 'raw', evidenceId) : null;
  if (capture) {
    fs.mkdirSync(destination, { recursive: true });
    for (const name of ['observations.json', 'comparison.png']) {
      assert.equal(fs.existsSync(path.join(destination, name)), false, 'Use a fresh browser evidence ID.');
    }
  }
  const observations = {
    cardId: 'A-S063', mode: 'synthetic', node: process.version, playwrightVersion,
    startedAtUtc: new Date().toISOString(),
    headAtStart: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
    helperSha256, helperPublication: '53c0c0d', canonicalSourceSha256: sourceHashes(),
    checks: [], pageErrors: [], externalRequests: [], localRequestCount: 0, artifacts: [],
  };
  const { openIsolatedLesson } = require(helper);
  let session;
  try {
    session = await openIsolatedLesson(path.join('learning', 'S063', 'index.html'));
    observations.browserVersion = session.browserVersion;
    assert.match(session.browserVersion, /^156\./);
    const { page } = session;
    page.on('pageerror', (error) => observations.pageErrors.push(error.message));
    page.on('request', (request) => {
      if (request.url().startsWith('file:')) observations.localRequestCount += 1;
    });
    await page.context().route(/^https?:\/\//, async (route) => {
      observations.externalRequests.push(route.request().url());
      await route.abort('blockedbyclient');
    });
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.locator('.banner').innerText(), model.BANNER);
    assert.equal(await page.locator('#results').isHidden(), true);
    assert.equal(await page.locator('#history > li').count(), 0);
    for (const field of Object.keys(model.DEFAULTS)) {
      assert.equal(await page.locator(`label[for="${field}"]`).count(), 1);
      assert.equal(await page.locator(`#${field}`).inputValue(), String(model.DEFAULTS[field]));
    }
    observations.checks.push('Standalone DOM: exact visible banner, seven labels/default controls, no initial results or history.');

    await page.locator('#path').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#path').inputValue(), 'parallel-failover');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'fixture');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#fixture').inputValue(), 'restart-required');
    for (const id of ['readiness', 'transaction', 'observation', 'reconnectBudgetMs', 'recoveryBudgetMs', 'compare']) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), id);
    }
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#run-summary').innerText(), /Run 1: Parallel-capacity failover PASSED/);
    const resize = page.locator('tr[data-path="in-place"]');
    const failover = page.locator('tr[data-path="parallel-failover"]');
    assert.match(await resize.innerText(), /NOT ONLINE[\s\S]*FAILED[\s\S]*2400 ms[\s\S]*3100 ms/);
    assert.match(await failover.innerText(), /inspected[\s\S]*PASSED[\s\S]*180 ms[\s\S]*320 ms/);
    assert.match(await page.locator('#trace').innerText(), /parallel-failover/);
    assert.match(await page.locator('#native-limit').innerText(), /UNKNOWN: no native platform/);
    observations.checks.push('Keyboard arrows/Tab/Enter compare both paths: disruptive in-place FAILED / NOT ONLINE, inspected parallel PASSED with measured budgets.');
    if (capture) {
      const bytes = await page.screenshot({ fullPage: true });
      fs.writeFileSync(path.join(destination, 'comparison.png'), bytes, { flag: 'wx' });
      observations.artifacts.push({ file: 'comparison.png', bytes: bytes.length, sha256: hash(bytes) });
    }

    await page.locator('#path').selectOption('in-place');
    await page.locator('#fixture').selectOption('bounded-resize');
    await page.locator('#transaction').selectOption('unresolved');
    await page.locator('#compare').click();
    assert.match(await page.locator('#run-summary').innerText(), /Run 2: In-place resize UNKNOWN/);
    assert.match(await resize.innerText(), /2\/3 completed; 0 failed; 1 unresolved/);
    assert.match(await page.locator('#transaction-rows').innerText(), /tx-in-flight: unresolved; effects unknown/);
    assert.equal(await page.locator('#history > li').count(), 2);
    observations.checks.push('Unresolved in-flight transaction is visibly UNKNOWN with unknown effects retained in the 3-started denominator.');

    await page.locator('#transaction').selectOption('failed');
    await page.locator('#observation').selectOption('missing');
    await page.locator('#compare').click();
    assert.match(await page.locator('#run-summary').innerText(), /Run 3: In-place resize FAILED/);
    assert.match(await resize.innerText(), /Not observed[\s\S]*2\/3 completed; 1 failed; 0 unresolved/);
    assert.match(await page.locator('#trace').innerText(), /reconnect: not observed/);
    observations.checks.push('Known failed transaction dominates missing timing evidence; failure and unknown measurements are distinct.');

    const retained = await page.locator('#history').innerText();
    const previousComparison = await page.locator('#comparison-rows').innerText();
    for (const value of ['', '-1', '1.5', '1e2', '5001', ' 600', '0600']) {
      await page.locator('#reconnectBudgetMs').fill(value);
      await page.locator('#compare').click();
      assert.equal(await page.locator('#error').isVisible(), true);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'reconnectBudgetMs');
      assert.equal(await page.locator('#reconnectBudgetMs').getAttribute('aria-invalid'), 'true');
      assert.equal(await page.locator('#history').innerText(), retained);
      assert.equal(await page.locator('#comparison-rows').innerText(), previousComparison);
    }
    await page.locator('#reconnectBudgetMs').fill('600');
    await page.locator('#recoveryBudgetMs').fill('');
    await page.locator('#compare').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'recoveryBudgetMs');
    await page.locator('#recoveryBudgetMs').fill('800');
    await page.evaluate(() => {
      const option = document.createElement('option');
      option.value = '__proto__';
      option.textContent = 'Undeclared test option';
      document.getElementById('fixture').append(option);
      document.getElementById('fixture').value = '__proto__';
    });
    await page.locator('#compare').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'fixture');
    assert.match(await page.locator('#error').innerText(), /declared fixture/);
    assert.equal(await page.locator('#history').innerText(), retained);
    await page.locator('#fixture option[value="__proto__"]').evaluate((node) => node.remove());
    observations.checks.push('Blank/negative/fractional/exponent/out-of-range/space/leading-zero budgets and a tampered enum focus errors without changing retained evidence.');

    await page.locator('#path').selectOption('parallel-failover');
    await page.locator('#fixture').selectOption('bounded-resize');
    await page.locator('#transaction').selectOption('recovered');
    await page.locator('#observation').selectOption('complete');
    await page.locator('#readiness').selectOption('not-ready');
    await page.locator('#compare').click();
    assert.match(await failover.innerText(), /FAILED[\s\S]*Not observed[\s\S]*0\/0 completed; 0 failed; 0 unresolved; 3 not run/);
    assert.match(await page.locator('#trace').innerText(), /handoff blocked/);
    assert.match(await resize.innerText(), /PASSED/);
    observations.checks.push('Unsynchronized parallel handoff is visibly blocked: no timings, zero started and three not run; in-place remains independent.');

    await page.locator('#readiness').selectOption('ready');
    await page.locator('#fixture').selectOption('parallel-unavailable');
    await page.locator('#compare').click();
    assert.match(await failover.innerText(), /UNSUPPORTED[\s\S]*FAILED[\s\S]*Not observed/);
    await page.locator('#fixture').selectOption('unverified');
    await page.locator('#compare').click();
    assert.match(await failover.innerText(), /UNVERIFIED[\s\S]*UNKNOWN/);
    assert.equal(await page.locator('#history-count').innerText(), '6 / 6');
    assert.equal(await page.locator('#history > li').count(), 6);
    observations.checks.push('Unsupported operation fails; unqualified capability is UNKNOWN, not passed; all six positive/negative/unknown runs remain visible.');

    const sixRuns = await page.locator('#history').innerText();
    await page.locator('#fixture').selectOption('bounded-resize');
    await page.locator('#compare').click();
    assert.match(await page.locator('#error').innerText(), /Six comparisons retained/);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'clear-lesson');
    assert.equal(await page.locator('#history').innerText(), sixRuns);
    observations.checks.push('Seventh run is explicitly rejected with focus on reset; six prior runs are unchanged.');

    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'path');
    assert.equal(await page.locator('#results').isHidden(), true);
    assert.equal(await page.locator('#error').isHidden(), true);
    assert.equal(await page.locator('#history > li').count(), 0);
    assert.equal(await page.locator('#history-count').innerText(), '0 / 6');
    assert.equal(await page.evaluate(() => typeof document.getElementById('comparison-form').reset), 'function');
    for (const [field, value] of Object.entries(model.DEFAULTS)) {
      assert.equal(await page.locator(`#${field}`).inputValue(), String(value));
    }
    await page.locator('#reconnectBudgetMs').focus();
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#run-summary').innerText(), /Run 1: In-place resize PASSED/);
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.locator('#history > li').count(), 0);
    observations.checks.push('Keyboard reset restores every default, clears errors/results/history and focuses path; keyboard resubmission works and reload clears memory.');

    await page.evaluate(() => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('tests/csp-probe.js', location.href).href;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Local CSP probe failed to load'));
      document.head.append(script);
    }));
    await page.waitForFunction(() => globalThis.__s063CspProbe?.complete
      && globalThis.__s063CspProbe.violations.length >= 3);
    observations.csp = await page.evaluate(() => globalThis.__s063CspProbe);
    assert.equal(observations.csp.inlineRan, false);
    assert.equal(observations.csp.evalRan, false);
    assert.equal(observations.csp.evalBlocked, true);
    assert.equal(observations.csp.connectionBlocked, true);
    assert.ok(observations.csp.violations.some((item) => item.directive === 'connect-src'));
    assert.deepEqual(observations.externalRequests, []);
    assert.deepEqual(observations.pageErrors, []);
    assert.deepEqual(sourceHashes(), observations.canonicalSourceSha256);
    observations.checks.push('Real CSP blocks inline script, dynamic evaluation and an external-connect probe before the network guard; no external dispatch or page errors.');
    console.log(JSON.stringify({ cardId: observations.cardId, browserVersion: observations.browserVersion, checks: observations.checks.length, proofWrites: capture }, null, 2));
  } catch (error) {
    observations.failure = { name: error.name, message: error.message, stack: error.stack };
    throw error;
  } finally {
    try {
      if (session) {
        await session.close();
        observations.cleanup = 'Awaited close() in finally: isolated context/browser and helper scratch released.';
      }
    } catch (error) {
      observations.cleanupError = error.message;
      throw error;
    } finally {
      observations.finishedAtUtc = new Date().toISOString();
      if (capture) {
        fs.writeFileSync(path.join(destination, 'observations.json'), `${JSON.stringify(observations, null, 2)}\n`, { flag: 'wx' });
      }
    }
  }
});
