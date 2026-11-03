'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const folder = path.resolve(__dirname, '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const helperPath = path.resolve(folder, '..', '..', 'testing', 'browser', 'isolated.cjs');
const helperSha256 = hash(fs.readFileSync(helperPath));
assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helperPath);
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const label = process.env.S058_BROWSER_LABEL;
if (capture && !/^browser-\d{3}$/.test(label || '')) throw new Error('Deliberate capture requires a new S058_BROWSER_LABEL=browser-NNN.');

test('actual isolated browser: workflow version strategy, keyboard, errors, history, reset and CSP', { timeout: 120000 }, async (t) => {
  const report = {
    cardId: 'A-S058', workerId: 'worker-A-S058', executionMode: 'synthetic',
    label: capture ? label : null, startedAtUtc: new Date().toISOString(), node: process.version,
    helper: 'testing\\browser\\isolated.cjs', helperSha256, helperPublication: '53c0c0d',
    canonicalSourceSha256: Object.fromEntries([
      'model.js', 'lesson.js', 'index.html', 'styles.css', path.join('tests', 'browser.cjs'), path.join('tests', 'csp-probe.js'),
    ].map((file) => [file, hash(Buffer.from(fs.readFileSync(path.join(folder, file), 'utf8').replace(/\r\n/g, '\n')))])),
    checks: [], artifacts: [], externalRequests: [], pageErrors: [], cleanup: 'not yet closed',
    limits: 'Real local DOM interaction with a synthetic command-prefix model, not actual durable engine replay/storage, native Azure, production Node.js 24 or source-parent proof.',
  };
  let session;
  async function check(name, callback) {
    await t.test(name, async () => {
      await callback();
      report.checks.push(name);
    });
  }
  async function saveDOM(page, suffix, screenshot = false) {
    if (!capture) return;
    const file = `${label}-${suffix}.dom.html`;
    const bytes = Buffer.from(await page.content());
    fs.writeFileSync(path.join(folder, 'evidence', file), bytes, { flag: 'wx' });
    report.artifacts.push({ file, bytes: bytes.length, sha256: hash(bytes) });
    if (screenshot) {
      const image = `${label}-${suffix}.png`;
      const target = path.join(folder, 'evidence', image);
      assert.equal(fs.existsSync(target), false, 'Never overwrite retained browser images.');
      const raw = await page.screenshot({ path: target, fullPage: true });
      report.artifacts.push({ file: image, bytes: raw.length, sha256: hash(raw) });
    }
  }
  try {
    session = await openIsolatedLesson('learning\\S058\\index.html');
    const { page } = session;
    report.browserVersion = session.browserVersion;
    assert.match(report.browserVersion, /^156\./);
    page.on('pageerror', (error) => report.pageErrors.push(error.message));
    await page.context().route(/^https?:/, async (route) => {
      report.externalRequests.push(route.request().url());
      await route.abort('blockedbyclient');
    });
    const text = (id) => page.locator(`#${id}`).textContent();
    const activeId = () => page.evaluate(() => document.activeElement?.id);
    async function runKeyboard() {
      await page.locator('#conduct').focus();
      await page.keyboard.press('Enter');
    }

    await check('exact banner, initial state, labels, native form reset and keyboard tab order', async () => {
      assert.match(page.url(), /^file:/);
      assert.equal(await text('training-banner'), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await text('verdict'), 'Synthetic verifier: NOT RUN');
      assert.equal(await page.evaluate(() => typeof document.querySelector('#replay-form').reset), 'function');
      for (const id of ['strategy', 'workers', 'historyEvidence']) assert.equal(await page.locator(`label[for="${id}"]`).count(), 1);
      await page.locator('#strategy').focus();
      for (const id of ['workers', 'historyEvidence', 'conduct', 'restart']) {
        await page.keyboard.press('Tab');
        assert.equal(await activeId(), id);
      }
      await page.keyboard.press('Shift+Tab');
      assert.equal(await activeId(), 'conduct');
    });

    await check('exact pins with overlapping workers permit three distinct modeled continuations', async () => {
      await runKeyboard();
      assert.equal(await text('verdict'), 'Synthetic verifier: PASSED');
      assert.equal(await text('metric-started'), '3');
      assert.equal(await text('metric-matched'), '3');
      assert.equal(await text('metric-replayedEvents'), '6');
      assert.equal(await text('metric-externalEffects'), '0');
      assert.equal(await page.locator('#histories tr').count(), 3);
      assert.deepEqual(await page.locator('#histories tr td:nth-child(2)').allTextContents(), [
        'worker 1.0 / definition 1.0', 'worker 1.0 / definition 1.0', 'worker 2.0 / definition 2.0',
      ]);
      assert.match(await page.locator('#histories tr').nth(1).textContent(), /next: ReserveStock/);
      assert.equal(await page.locator('#attempts li').count(), 1);
    });

    await check('unversioned latest exposes recorded divergence and unsafe short-prefix continuation', async () => {
      await page.locator('#strategy').selectOption('latest');
      await runKeyboard();
      assert.equal(await text('verdict'), 'Synthetic verifier: FAILED');
      assert.equal(await text('metric-mismatches'), '1');
      assert.equal(await text('metric-blocked'), '1');
      assert.equal(await text('metric-matched'), '1');
      assert.equal(await page.locator('#histories [data-outcome="history-mismatch"]').count(), 1);
      assert.equal(await page.locator('#histories [data-outcome="version-mismatch"]').count(), 1);
      assert.match(await page.locator('#histories tr').nth(0).textContent(), /Recorded event 2 is ReserveStock.*expects RiskCheck/s);
      assert.match(await page.locator('#histories tr').nth(1).textContent(), /requires next ReserveStock.*would choose RiskCheck/s);
      await saveDOM(page, 'failure', true);
    });

    await check('retiring the old worker blocks pinned histories instead of reporting migration success', async () => {
      await page.locator('#strategy').selectOption('pin-exact');
      await page.locator('#workers').selectOption('new-only');
      await runKeyboard();
      assert.equal(await text('verdict'), 'Synthetic verifier: FAILED');
      assert.equal(await text('metric-blocked'), '2');
      assert.equal(await page.locator('#histories [data-outcome="worker-unavailable"]').count(), 2);
      assert.equal(await page.locator('#attempts li').count(), 3);
    });

    await check('explicit immutable-version branch on v2 succeeds while preserving earlier failed attempts', async () => {
      await page.locator('#strategy').focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#strategy').inputValue(), 'explicit-branch');
      await runKeyboard();
      assert.equal(await text('verdict'), 'Synthetic verifier: PASSED');
      assert.equal(await text('metric-matched'), '3');
      assert.deepEqual(await page.locator('#histories tr td:nth-child(2)').allTextContents(), [
        'worker 2.0 / definition 1.0', 'worker 2.0 / definition 1.0', 'worker 2.0 / definition 2.0',
      ]);
      assert.equal(await page.locator('#attempts li').count(), 4);
      assert.match(await page.locator('#attempts li').nth(1).textContent(), /FAILED; matched 1\/3, mismatches 1, blocked 1/);
    });

    await check('forged enum creates a focused error without changing prior result, denominator or history', async () => {
      const before = { rows: await text('histories'), metrics: await text('metrics'), attempts: await text('attempts') };
      await page.evaluate(() => {
        const select = document.querySelector('#strategy');
        select.append(new Option('Unapproved test-only option', 'forged'));
        select.value = 'forged';
        document.querySelector('#replay-form').requestSubmit();
      });
      assert.equal(await page.locator('#error').isVisible(), true);
      assert.match(await text('error'), /invalid input.*strategy.*unchanged/i);
      assert.equal(await activeId(), 'error');
      assert.deepEqual({ rows: await text('histories'), metrics: await text('metrics'), attempts: await text('attempts') }, before);
      await page.evaluate(() => {
        document.querySelector('#strategy option[value="forged"]').remove();
        document.querySelector('#strategy').value = 'explicit-branch';
      });
    });

    await check('unknowns retain their denominator, known failure dominates, and seventh attempt is rejected', async () => {
      await page.locator('#historyEvidence').selectOption('missing');
      await runKeyboard();
      assert.equal(await text('verdict'), 'Synthetic verifier: UNKNOWN');
      assert.equal(await text('metric-started'), '3');
      assert.equal(await text('metric-matched'), '2');
      assert.equal(await text('metric-unknown'), '1');
      assert.equal(await page.locator('#histories [data-outcome="unknown"]').count(), 1);
      assert.equal(await page.locator('#error').isVisible(), false);
      await saveDOM(page, 'unknown');
      await page.locator('#strategy').selectOption('latest');
      await runKeyboard();
      assert.equal(await text('verdict'), 'Synthetic verifier: FAILED');
      assert.equal(await text('metric-unknown'), '1');
      assert.equal(await text('metric-mismatches'), '1');
      assert.equal(await text('metric-blocked'), '1');
      assert.equal(await text('metric-matched'), '0');
      assert.equal(await page.locator('#attempts li').count(), 6);
      const previous = await text('histories');
      await runKeyboard();
      assert.match(await text('error'), /Six comparisons retained.*Reset/i);
      assert.equal(await activeId(), 'error');
      assert.equal(await text('histories'), previous);
      assert.equal(await page.locator('#attempts li').count(), 6);
    });

    await check('keyboard reset restores defaults, clears only local results and history, and focuses the first control', async () => {
      await page.locator('#restart').focus();
      await page.keyboard.press('Enter');
      assert.equal(await activeId(), 'strategy');
      assert.equal(await text('verdict'), 'Synthetic verifier: NOT RUN');
      assert.equal(await text('impact'), 'Synthetic user impact: not observed');
      assert.equal(await page.locator('#metrics dd').count(), 0);
      assert.equal(await page.locator('#histories tr').count(), 0);
      assert.equal(await page.locator('#attempts li').count(), 0);
      assert.equal(await page.locator('#error').isVisible(), false);
      assert.equal(await text('capacity'), '0/6 comparisons retained');
      assert.deepEqual(await page.locator('select').evaluateAll((controls) => controls.map((control) => control.value)), [
        'pin-exact', 'overlap', 'complete',
      ]);
      await saveDOM(page, 'reset');
    });

    await check('an incompatible history fails under a matching version; reload does not invent durable storage', async () => {
      await page.locator('#historyEvidence').selectOption('incompatible');
      await runKeyboard();
      assert.equal(await text('verdict'), 'Synthetic verifier: FAILED');
      assert.equal(await text('metric-mismatches'), '1');
      assert.equal(await text('metric-matched'), '2');
      assert.match(await page.locator('#histories tr').nth(1).textContent(), /worker 1\.0 \/ definition 1\.0.*ChargeCard.*expects ReserveStock/s);
      await saveDOM(page, 'incompatible-history');
      await page.reload({ waitUntil: 'load' });
      assert.equal(await text('verdict'), 'Synthetic verifier: NOT RUN');
      assert.equal(await page.locator('#attempts li').count(), 0);
    });

    await check('actual CSP blocks inline code, eval and external connection without bypass or page errors', async () => {
      await page.evaluate(() => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL('tests/csp-probe.js', location.href).href;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Allowed local CSP probe did not load.'));
        document.head.append(script);
      }));
      await page.waitForFunction(() => globalThis.__s058Csp?.finished && globalThis.__s058Csp.violations.length >= 3);
      const csp = await page.evaluate(() => globalThis.__s058Csp);
      assert.equal(csp.inlineRan, false);
      assert.equal(csp.evalRan, false);
      assert.equal(csp.evalBlocked, true);
      assert.equal(csp.connectionBlocked, true);
      assert.ok(csp.violations.some((entry) => entry.directive === 'script-src-elem' && entry.blockedURI === 'inline'));
      assert.ok(csp.violations.some((entry) => entry.directive === 'script-src' && entry.blockedURI === 'eval'));
      assert.ok(csp.violations.some((entry) => entry.directive === 'connect-src' && entry.blockedURI.startsWith('https://s058.invalid')));
      assert.deepEqual(report.externalRequests, []);
      assert.deepEqual(report.pageErrors, []);
      report.csp = csp;
    });
  } finally {
    if (session) {
      await session.close();
      report.cleanup = 'Awaited close() in finally; isolated browser/context and helper scratch released.';
    }
    report.finishedAtUtc = new Date().toISOString();
    if (capture) fs.writeFileSync(path.join(folder, 'evidence', `${label}.observations.json`), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    console.log(JSON.stringify(report, null, 2));
  }
});
