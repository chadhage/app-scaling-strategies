'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const lesson = path.resolve(__dirname, '..');
const root = path.resolve(lesson, '..', '..');
const evidence = path.join(lesson, 'evidence');
const helper = path.join(root, 'testing', 'browser', 'isolated.cjs');
const expectedHelper = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const destination = path.join(evidence, 'browser-001.json');

function proofHashes() {
  const hashes = {};
  function walk(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, item.name);
      if (item.isDirectory()) walk(target);
      else hashes[path.relative(evidence, target)] = sha(fs.readFileSync(target));
    }
  }
  walk(evidence);
  return hashes;
}

test('real isolated DOM, keyboard, errors, history, failure, reset and CSP', async () => {
  assert.equal(sha(fs.readFileSync(helper)), expectedHelper, 'Use only the published helper.');
  assert.equal(process.versions.node, '22.23.4', 'Existing Node tooling only.');
  if (capture) assert.ok(!fs.existsSync(destination), 'Never overwrite retained browser proof.');
  else assert.ok(fs.existsSync(destination), 'Deliberately capture browser proof before read-only verification.');
  const before = proofHashes();
  const { openIsolatedLesson } = require(helper);
  const startedAtUtc = new Date().toISOString();
  const observations = [];
  const pageErrors = [];
  const networkRoutes = [];
  let session;
  let browserVersion;
  let closed = false;
  try {
    session = await openIsolatedLesson(path.join('learning', 'S042', 'index.html'));
    browserVersion = session.browserVersion;
    assert.equal(browserVersion, '156.0.4314.50');
    const page = session.page;
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.context().route(/^https?:\/\//, async (route) => {
      networkRoutes.push(route.request().url());
      await route.abort('blockedbyclient');
    });
    const text = (selector) => page.locator(selector).innerText();
    const outcome = async (value) => assert.match(await text('#userResult'), new RegExp(`^${value.toUpperCase()} —`));
    const metric = (name) => text(`#metrics [data-key="${name}"]`);
    const run = () => page.locator('#runLesson').click();
    const historySize = () => page.locator('#history > li').count();
    const snapshot = async (name) => {
      observations.push({
        name,
        userResult: await text('#userResult'),
        metrics: await text('#metrics'),
        assertions: await text('#checks'),
        trace: await text('#trace'),
        history: await text('#history'),
        verification: await text('#verification'),
        error: await text('#errorNotice'),
        focusedId: await page.evaluate(() => document.activeElement.id),
      });
    };

    assert.equal(await page.title(), 'S042 — Long operation: drain or continue');
    assert.equal(await text('.banner'), 'Training rehearsal - synthetic data - not a live Azure result');
    assert.equal(await historySize(), 0);
    assert.ok(await page.locator('#checkPrediction').isDisabled());
    assert.equal(await page.evaluate(() => typeof document.getElementById('lessonControls').reset), 'function');
    await page.locator('#mode').focus();
    for (const id of ['condition', 'budgetMs', 'drainMs', 'hostLimitMs', 'runLesson']) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), id);
    }
    await page.keyboard.press('Enter');
    await outcome('completed');
    assert.equal(await metric('elapsed'), '12000');
    assert.equal(await metric('units'), '12');
    await page.locator('#checkPrediction').focus();
    await page.keyboard.press('Enter');
    assert.match(await text('#verification'), /^PASS/);
    assert.ok(await page.locator('#checkPrediction').isDisabled());
    await snapshot('keyboard-default-drain-and-check');

    await page.locator('#condition').selectOption('forced-stop');
    await outcome('unknown');
    assert.equal(await historySize(), 1);
    assert.ok(await page.locator('#checkPrediction').isDisabled());
    await page.locator('#budgetMs').focus();
    await page.keyboard.press('Enter');
    await outcome('interrupted');
    assert.equal(await metric('elapsed'), '6000');
    await page.locator('#prediction').selectOption('interrupted');
    await page.locator('#checkPrediction').focus();
    await page.keyboard.press('Enter');
    assert.match(await text('#verification'), /^PASS.*user result stays INTERRUPTED/);
    await outcome('interrupted');
    await snapshot('forced-http-stop-kept-separate-from-verifier-pass');

    await page.locator('#mode').selectOption('durable');
    await page.locator('#condition').selectOption('normal');
    await page.locator('#hostLimitMs').fill('10000');
    await page.locator('#drainMs').fill('0');
    await run();
    await outcome('completed');
    assert.equal(await metric('elapsed'), '14000');
    assert.equal(await metric('checkpoint'), '4');
    assert.match(await text('#trace'), /HTTP 202 is acceptance, not completion/);
    assert.match(await text('#trace'), /5000 ms.*Retire the old HTTP host/);
    assert.equal(await metric('native'), 'UNKNOWN');
    await snapshot('durable-continues-past-http-limit');

    await page.locator('#condition').selectOption('delayed-retry');
    await run();
    await outcome('interrupted');
    assert.equal(await metric('elapsed'), '22000');
    assert.equal(await metric('retry'), '8000');
    assert.equal(await metric('deadline'), '18000');
    assert.equal(await metric('units'), '12');
    await page.locator('#prediction').selectOption('completed');
    await page.locator('#checkPrediction').click();
    assert.match(await text('#verification'), /^FAIL/);
    await outcome('interrupted');
    await snapshot('retry-fails-original-budget-despite-fast-attempt');

    await page.locator('#condition').selectOption('missing-proof');
    await run();
    await outcome('unknown');
    assert.equal(await metric('units'), 'UNKNOWN');
    assert.match(await text('[data-check="result-proof"]'), /^UNKNOWN/);
    assert.equal(await historySize(), 5);
    await snapshot('missing-proof-unknown-with-failures-retained');

    for (const value of ['', '1.5', '60001']) {
      await page.locator('#budgetMs').fill(value);
      await run();
      await outcome('unknown');
      assert.match(await text('#errorNotice'), /budgetMs must be an integer/);
      assert.equal(await historySize(), 5);
      assert.ok(await page.locator('#checkPrediction').isDisabled());
      assert.equal(await page.evaluate(() => document.activeElement.id), 'budgetMs');
    }
    await page.locator('#budgetMs').fill('18000');
    await page.evaluate(() => {
      const select = document.getElementById('mode');
      const option = document.createElement('option');
      option.value = '<img src=x onerror=window.__s042Injected=true>';
      option.textContent = option.value;
      select.append(option);
      select.value = option.value;
      select.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await run();
    assert.match(await text('#errorNotice'), /Mode must be drain or durable/);
    assert.equal(await historySize(), 5);
    assert.equal(await page.locator('img').count(), 0);
    assert.equal(await page.evaluate(() => window.__s042Injected), undefined);
    await snapshot('malformed-controls-fail-closed-with-history');

    await page.locator('#mode').selectOption('drain');
    await page.locator('#condition').selectOption('normal');
    await page.locator('#drainMs').fill('8000');
    await run();
    await outcome('interrupted');
    assert.equal(await metric('elapsed'), '10000');
    assert.match(await text('[data-check="host-limit"]'), /^FAIL/);
    assert.equal(await historySize(), 6);
    await snapshot('same-short-http-limit-fails-drain');
    await run();
    await outcome('unknown');
    assert.match(await text('#errorNotice'), /Six runs are retained/);
    assert.equal(await historySize(), 6);
    assert.match(await text('#history'), /Run 1.*COMPLETED/);
    assert.match(await text('#history'), /Run 4.*INTERRUPTED/);
    await snapshot('seventh-run-rejected-without-pruning');

    async function resetWithKeyboard() {
      await page.locator('#restoreDefaults').focus();
      await page.keyboard.press('Enter');
      assert.equal(await historySize(), 0);
      assert.equal(await text('#errorNotice'), '');
      assert.equal(await text('#verification'), 'NOT CHECKED');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'mode');
      for (const [id, value] of Object.entries({
        mode: 'drain', condition: 'normal', budgetMs: '18000',
        drainMs: '8000', hostLimitMs: '16000', prediction: 'completed',
      })) assert.equal(await page.locator(`#${id}`).inputValue(), value);
      await outcome('unknown');
      assert.ok(await page.locator('#checkPrediction').isDisabled());
    }
    await resetWithKeyboard();
    await snapshot('keyboard-reset-restores-exact-defaults-and-focus');
    await page.locator('#mode').selectOption('durable');
    await page.locator('#hostLimitMs').fill('4000');
    await page.locator('#budgetMs').fill('14000');
    await page.locator('#drainMs').fill('0');
    await run();
    await outcome('completed');
    await snapshot('inclusive-handoff-and-user-budget-boundaries');
    await page.locator('#budgetMs').fill('13999');
    await run();
    await outcome('interrupted');
    await page.locator('#condition').selectOption('missing-proof');
    await run();
    await outcome('interrupted');
    assert.match(await text('[data-check="result-proof"]'), /^UNKNOWN/);
    assert.match(await text('[data-check="original-budget"]'), /^FAIL/);
    await snapshot('known-late-result-outranks-unknown-proof');
    await page.locator('#condition').selectOption('forced-stop');
    await page.locator('#budgetMs').fill('18000');
    await run();
    await outcome('interrupted');
    assert.equal(await metric('elapsed'), '8000');
    assert.equal(await metric('checkpoint'), '4');
    assert.equal(await metric('units'), 'UNKNOWN');
    await snapshot('forced-successor-stop-not-saved-by-checkpoint');
    await resetWithKeyboard();

    await page.setViewportSize({ width: 320, height: 800 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.keyboard.press('Tab');
    assert.notEqual(await page.locator(':focus').evaluate((node) => getComputedStyle(node).outlineStyle), 'none');

    const originalUrl = page.url();
    await page.evaluate(async () => {
      window.__s042Csp = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__s042Csp.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
      });
      const script = document.createElement('script');
      script.textContent = 'window.__s042InlineExecuted=true';
      document.body.append(script);
      window.__s042FetchBlocked = await fetch('http://127.0.0.1:65420/s042-csp').then(() => false, () => true);
      const form = document.createElement('form');
      form.action = 'http://127.0.0.1:65420/s042-form';
      form.method = 'post';
      document.body.append(form);
      form.requestSubmit();
    });
    await page.waitForFunction(() => ['script-src-elem', 'connect-src', 'form-action']
      .every((directive) => window.__s042Csp.some((item) => item.directive === directive)));
    const csp = await page.evaluate(() => ({
      violations: window.__s042Csp,
      inlineExecuted: window.__s042InlineExecuted === true,
      fetchBlocked: window.__s042FetchBlocked,
    }));
    assert.equal(csp.inlineExecuted, false);
    assert.equal(csp.fetchBlocked, true);
    assert.equal(page.url(), originalUrl);
    assert.deepEqual(networkRoutes, [], 'CSP must block probes before any request reaches the route safety guard.');
    assert.deepEqual(pageErrors, []);
    await outcome('unknown');
    assert.equal(await historySize(), 0);
    observations.push({ name: 'actual-csp-and-narrow-layout', ...csp, networkRoutes, pageErrors, width: 320 });
  } finally {
    if (session) {
      await session.close();
      closed = true;
    }
  }
  assert.ok(closed, 'Awaited isolated browser cleanup must complete.');
  assert.deepEqual(proofHashes(), before, 'Browser execution must not rewrite existing proof.');
  if (capture) {
    fs.writeFileSync(destination, `${JSON.stringify({
      schemaVersion: 1,
      cardId: 'A-S042',
      mode: 'actual-isolated-browser-observation-of-synthetic-lesson',
      captureFlag: 'CAPTURE_BROWSER_EVIDENCE=1',
      startedAtUtc,
      finishedAtUtc: new Date().toISOString(),
      nodeVersion: process.version,
      browserVersion,
      playwrightVersion: require(path.join(root, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version,
      helperSha256: expectedHelper,
      applicationHashes: Object.fromEntries(['index.html', 'app.js', 'long-work.js', 'styles.css']
        .map((file) => [file, sha(fs.readFileSync(path.join(lesson, file)))])),
      observations,
      awaitedFinallyClose: closed,
      nativeAzureResult: 'unknown',
      lifecycleQualification: 'Feature evidence only; published helper known unattended lifecycle limitation is unchanged.',
    }, null, 2)}\n`, { flag: 'wx' });
  }
});
