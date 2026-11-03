'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const expectedHelperSHA256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

function ownedDigest() {
  const hashes = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else hashes.push([path.relative(root, file), sha(fs.readFileSync(file))]);
    }
  }
  walk(root);
  return hashes;
}
function once(file, bytes) {
  const target = path.join(root, 'evidence', file);
  fs.writeFileSync(target, bytes, { flag: 'wx' });
}

test('actual published-helper browser checks: expired readiness, UX and CSP', { timeout: 150000 }, async (t) => {
  assert.equal(sha(fs.readFileSync(helper)), expectedHelperSHA256);
  const before = ownedDigest();
  const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
  assert.equal(playwrightVersion, '1.56.1');
  if (capture) assert.equal(fs.existsSync(path.join(root, 'evidence', 'browser.json')), false, 'capture is append-only');
  const { openIsolatedLesson } = require(helper);
  const startedAtUtc = new Date().toISOString();
  const session = await openIsolatedLesson('learning\\S086\\index.html');
  const page = session.page;
  const groups = [];
  const screenshots = [];
  const pageErrors = [];
  const requestURLs = [];
  let cspEvidence;
  let closed = false;
  page.on('pageerror', (problem) => pageErrors.push(problem.message));
  page.on('request', (request) => requestURLs.push(request.url()));
  const get = (id) => page.locator(`#${id}`);
  const contains = async (id, pattern) => assert.match(await get(id).innerText(), pattern);
  const focused = async (id) => assert.equal(await page.evaluate(() => document.activeElement.id), id);
  const disabled = async (id, expected = true) => assert.equal(await get(id).isDisabled(), expected, id);
  const rows = async (id, count) => assert.equal(await get(id).locator('tr').count(), count, id);
  const click = async (id) => get(id).click();
  async function check(name, run) {
    const previous = groups.length;
    await t.test(name, async () => {
      await run();
      groups.push({ name, result: 'PASS' });
    });
    assert.equal(groups.length, previous + 1, `Stop after failed browser group: ${name}`);
  }
  async function shot(file) {
    if (capture) screenshots.push({ file, bytes: await page.screenshot({ fullPage: true }) });
  }
  async function prediction(value) {
    await get('prediction').selectOption(value);
    await click('check');
  }
  async function start(health = 'healthy', delay = '2') {
    await get('health').selectOption(health);
    await get('delay-ticks').fill(delay);
    await click('start');
    await click('advance');
  }
  async function blank() {
    await click('reset-lesson');
    await rows('history', 0);
    await rows('decisions', 0);
    await rows('trace', 0);
    assert.equal(await get('history-details').locator('details').count(), 0);
    assert.equal(await get('health').inputValue(), 'healthy');
    assert.equal(await get('delay-ticks').inputValue(), '2');
    assert.equal(await get('prediction').inputValue(), '');
    assert.equal(await get('error').isVisible(), false);
    await contains('clock', /Not started/);
    await contains('totals', /attempts: 0; correct predictions: 0; decisions: 0; SUCCESS: 0; FAILURE: 0; UNKNOWN: 0/);
    await focused('start');
  }
  try {
    assert.equal(session.browserVersion, '156.0.4314.50');
    await check('initial DOM, exact banner, source labels and keyboard skip link', async () => {
      assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.match(await page.title(), /S086/);
      await disabled('start', false);
      for (const id of ['advance', 'promote', 'revalidate', 'check', 'new-attempt']) await disabled(id);
      await rows('history', 0);
      await contains('route', /blue-v1 100% \/ green-v2 0%/);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'skip');
      await page.keyboard.press('Enter');
      await focused('lesson');
      await shot('initial.png');
    });

    await check('real keyboard stale rejection then fresh promotion preserves both decisions', async () => {
      await get('health').focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('Tab');
      await focused('delay-ticks');
      await page.keyboard.press('Control+A');
      await page.keyboard.type('2');
      await page.keyboard.press('Tab');
      await focused('start');
      await page.keyboard.press('Space');
      await focused('advance');
      await disabled('health');
      await disabled('delay-ticks');
      await page.keyboard.press('Space');
      await focused('promote');
      await page.keyboard.press('Enter');
      await contains('promotion-result', /FAILURE — EXPIRED; BLOCKED at tick 2/);
      await contains('original-evidence', /Healthy at tick 0; age 2; EXPIRED/);
      await contains('route', /blue-v1 100% \/ green-v2 0%/);
      await contains('verifier-result', /PASS - freshness gate enforced/);
      await contains('user-impact', /SAFE ABORT BEFORE EXPOSURE/);
      await focused('revalidate');
      await shot('expired-blocked.png');
      await page.keyboard.press('Enter');
      await focused('promote');
      await contains('latest-evidence', /#2: healthy at tick 2/);
      await page.keyboard.press('Enter');
      await contains('promotion-result', /SUCCESS — FRESH_HEALTHY; PROMOTED/);
      await contains('evidence-age', /Age 0; required < 2/);
      await contains('route', /blue-v1 0% \/ green-v2 100%/);
      await contains('user-impact', /UNVERIFIED - no live user journeys/);
      await focused('prediction');
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      assert.equal(await get('prediction').inputValue(), 'SUCCESS');
      await page.keyboard.press('Tab');
      await focused('check');
      await page.keyboard.press('Enter');
      await focused('new-attempt');
      await rows('decisions', 2);
      await rows('history', 1);
      await contains('history', /FAILURE \(EXPIRED\).*SUCCESS \(FRESH_HEALTHY\)/);
      await contains('totals', /decisions: 2; SUCCESS: 1; FAILURE: 1; UNKNOWN: 0/);
      await contains('learning-result', /CORRECT.*Not a user-migration verdict/);
      await shot('fresh-after-revalidation.png');
    });

    await check('new attempt retains history and refreshed green can expire again', async () => {
      await click('new-attempt');
      await focused('start');
      await rows('history', 1);
      const summary = get('history-details').locator('summary').first();
      await summary.focus();
      await page.keyboard.press('Space');
      assert.equal(await get('history-details').locator('details').first().getAttribute('open'), '');
      await contains('history-details', /"observations".*"decisions".*"trace"/s);
      await contains('history-details', /EXPIRED.*FRESH_HEALTHY/s);
      assert.equal(await get('prediction').inputValue(), '');
      await start();
      await click('revalidate');
      await click('advance');
      await click('promote');
      await contains('promotion-result', /FAILURE — EXPIRED; BLOCKED at tick 4/);
      await contains('latest-evidence', /#2: healthy at tick 2/);
      await contains('evidence-age', /Age 2; required < 2; EXPIRED/);
      await prediction('FAILURE');
      await rows('history', 2);
      await contains('totals', /decisions: 3; SUCCESS: 1; FAILURE: 2; UNKNOWN: 0/);
    });

    await check('fresh unhealthy is blocked and cannot inherit original green', async () => {
      await click('new-attempt');
      await start('unhealthy', '5');
      await click('revalidate');
      await click('promote');
      await contains('original-evidence', /Healthy at tick 0; age 5; EXPIRED/);
      await contains('latest-evidence', /#2: unhealthy at tick 5/);
      await contains('promotion-result', /FAILURE — UNHEALTHY; BLOCKED/);
      await contains('route', /blue-v1 100% \/ green-v2 0%/);
      await prediction('FAILURE');
      await contains('learning-result', /CORRECT.*latest promotion FAILURE/);
      await rows('history', 3);
    });

    await check('missing sample remains UNKNOWN and wrong prediction stays in denominators', async () => {
      await click('new-attempt');
      await start('missing');
      await click('revalidate');
      await click('promote');
      await contains('latest-evidence', /MISSING.*no health or timestamp returned/);
      await contains('evidence-age', /UNKNOWN — no observed timestamp/);
      await contains('promotion-result', /UNKNOWN — MISSING; BLOCKED/);
      await contains('route', /green-v2 0%/);
      await prediction('SUCCESS');
      await contains('learning-result', /INCORRECT prediction SUCCESS; latest promotion UNKNOWN/);
      await rows('history', 4);
      await contains('totals', /attempts: 4; correct predictions: 3; decisions: 5; SUCCESS: 1; FAILURE: 3; UNKNOWN: 1/);
      await shot('unknown-retained.png');
    });

    await check('actual invalid input, blank prediction and state errors focus without mutation', async () => {
      await blank();
      for (const value of ['', '1', '6', '2.5', '2e0']) {
        await get('delay-ticks').fill(value);
        await click('start');
        await contains('error', /integer from 2 to 5/);
        await focused('delay-ticks');
        await rows('trace', 0);
        await rows('history', 0);
      }
      await get('delay-ticks').fill('2');
      await get('health').evaluate((select) => {
        select.append(new Option('unapproved', 'unapproved'));
        select.value = 'unapproved';
      });
      await click('start');
      await contains('error', /declared synthetic/);
      await focused('health');
      await get('health').evaluate((select) => select.querySelector('option[value="unapproved"]').remove());
      await blank();
      await click('start');
      await get('revalidate').evaluate((button) => { button.disabled = false; });
      await click('revalidate');
      await contains('error', /Expire the original first/);
      await focused('error');
      await rows('trace', 1);
      await click('advance');
      await click('promote');
      await click('check');
      await contains('error', /Choose SUCCESS, FAILURE or UNKNOWN/);
      await focused('prediction');
      await rows('history', 0);
      await shot('validation-error.png');
      await blank();
    });

    await check('six-attempt bound rejects forced seventh without evicting evidence', async () => {
      for (let n = 0; n < 6; n += 1) {
        await start();
        await click('promote');
        await prediction('FAILURE');
        if (n < 5) await click('new-attempt');
      }
      await rows('history', 6);
      await contains('totals', /attempts: 6; correct predictions: 6; decisions: 6; SUCCESS: 0; FAILURE: 6; UNKNOWN: 0/);
      await disabled('new-attempt');
      await focused('reset-lesson');
      assert.equal(await get('history-full').isVisible(), true);
      const history = await get('history').innerText();
      await get('new-attempt').evaluate((button) => { button.disabled = false; });
      await click('new-attempt');
      await contains('error', /reset explicitly after six/i);
      await focused('error');
      assert.equal(await get('history').innerText(), history);
      await blank();
    });

    await check('explicit reset clears inputs, errors, traces and results without form reset shadowing', async () => {
      await start('missing', '5');
      await click('revalidate');
      await click('promote');
      await prediction('FAILURE');
      await contains('clock', /Tick 5/);
      await contains('learning-result', /INCORRECT/);
      assert.deepEqual(await page.evaluate(() => [
        typeof document.getElementById('lesson-controls').reset,
        typeof document.getElementById('prediction-form').reset,
      ]), ['function', 'function']);
      await blank();
      await contains('promotion-result', /not attempted/);
      await contains('verifier-result', /not run/);
      await contains('learning-result', /No learning check yet/);
      await contains('route', /blue-v1 100% \/ green-v2 0%/);
    });

    await check('reload intentionally clears memory-only retained history', async () => {
      await start();
      await click('promote');
      await prediction('FAILURE');
      await rows('history', 1);
      await page.reload({ waitUntil: 'load' });
      await rows('history', 0);
      await rows('trace', 0);
      await contains('totals', /attempts: 0/);
      await disabled('start', false);
    });

    await check('narrow viewport keeps visible focus and tables inside scroll regions', async () => {
      await page.setViewportSize({ width: 375, height: 812 });
      await start('unhealthy');
      await click('revalidate');
      await click('promote');
      await get('prediction').focus();
      await page.keyboard.press('Tab');
      const outline = await get('check').evaluate((button) => getComputedStyle(button).outlineStyle);
      assert.equal(outline, 'solid');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      assert.equal(await page.locator('.table-wrap').first().evaluate((element) => getComputedStyle(element).overflowX), 'auto');
      await shot('narrow.png');
      await blank();
      await page.setViewportSize({ width: 1280, height: 900 });
    });

    await check('browser actually enforces CSP for inline code, styles, connect, frames, workers and forms', async () => {
      let routed = 0;
      await page.route('http://127.0.0.1:9/**', async (route) => {
        routed += 1;
        await route.abort('blockedbyclient');
      });
      const originalURL = page.url();
      const observations = await page.evaluate(async () => {
        window.__s086CSP = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          window.__s086CSP.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        const script = document.createElement('script');
        script.dataset.s086CspProbe = 'yes';
        script.textContent = 'window.__s086InlineExecuted = true;';
        document.body.append(script);
        const style = document.createElement('style');
        style.dataset.s086CspProbe = 'yes';
        style.textContent = 'body { display: none !important; }';
        document.head.append(style);
        let connection;
        try { await fetch('http://127.0.0.1:9/s086-denied-connect'); connection = 'UNEXPECTED'; }
        catch (problem) { connection = problem.name; }
        const frame = document.createElement('iframe');
        frame.dataset.s086CspProbe = 'yes';
        frame.name = 's086-csp-sink';
        frame.hidden = true;
        frame.src = 'data:text/html,<p>blocked synthetic frame</p>';
        document.body.append(frame);
        const worker = await new Promise((resolve) => {
          // A file worker can fail its origin check before CSP; the blob isolates worker-src enforcement.
          const url = URL.createObjectURL(new Blob(['postMessage("UNEXPECTED");'], { type: 'text/javascript' }));
          const finish = (result) => { URL.revokeObjectURL(url); resolve(result); };
          try {
            const instance = new Worker(url);
            instance.onerror = (event) => { event.preventDefault(); instance.terminate(); finish('blocked'); };
            instance.onmessage = () => { instance.terminate(); finish('UNEXPECTED'); };
          } catch (problem) { finish(problem.name); }
        });
        const form = document.createElement('form');
        form.dataset.s086CspProbe = 'yes';
        // Keep the deliberately blocked navigation off the main lesson frame.
        form.target = 's086-csp-sink';
        form.action = 'http://127.0.0.1:9/s086-denied-form';
        document.body.append(form);
        form.submit();
        return {
          connection, worker, inlineExecuted: window.__s086InlineExecuted === true,
          bodyDisplay: getComputedStyle(document.body).display,
        };
      });
      await page.waitForFunction(() => window.__s086CSP.length >= 6);
      cspEvidence = await page.evaluate(() => window.__s086CSP);
      const directives = cspEvidence.map((item) => item.directive);
      for (const directive of ['script-src-elem', 'style-src-elem', 'connect-src', 'frame-src', 'worker-src', 'form-action']) {
        assert.ok(directives.includes(directive), `Missing actual CSP violation: ${directive}`);
      }
      assert.equal(observations.inlineExecuted, false);
      assert.equal(observations.bodyDisplay, 'block');
      assert.equal(observations.connection, 'TypeError');
      assert.ok(['blocked', 'SecurityError'].includes(observations.worker));
      assert.equal(routed, 0, 'CSP must block before the protective local request route');
      assert.equal(page.url(), originalURL);
      await page.evaluate(() => {
        for (const node of document.querySelectorAll('[data-s086-csp-probe]')) node.remove();
      });
    });

    await check('CSP checks leave lesson functional with no unexpected page errors or transport requests', async () => {
      await start();
      await click('promote');
      await contains('promotion-result', /FAILURE — EXPIRED/);
      await blank();
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(requestURLs.filter((url) => /^https?:/.test(url)), []);
      assert.deepEqual(ownedDigest(), before, 'browser verification must be read-only before deliberate capture');
    });
  } finally {
    await session.close();
    closed = true;
  }
  assert.equal(closed, true);
  if (capture) {
    for (const screenshot of screenshots) once(screenshot.file, screenshot.bytes);
    once('browser.json', `${JSON.stringify({
      cardId: 'A-S086', workerId: 'worker-A-S086', packet: 'SC-S086', mode: 'synthetic',
      startedAtUtc, finishedAtUtc: new Date().toISOString(),
      helper: 'testing\\browser\\isolated.cjs', helperCommit: '53c0c0d',
      helperSHA256: expectedHelperSHA256, node: process.version, playwrightVersion,
      browserVersion: session.browserVersion, captureEnvironment: 'CAPTURE_BROWSER_EVIDENCE=1',
      awaitedFinallyClose: closed, groups, cspViolations: cspEvidence, pageErrors,
      screenshots: screenshots.map((item) => ({ file: item.file, sha256: sha(item.bytes) })),
      qualification: 'Actual isolated synthetic file-page browser checks only; published helper lifecycle limitation remains. No native, production24 or source-parent certification.',
    }, null, 2)}\n`);
  } else {
    assert.deepEqual(ownedDigest(), before, 'normal browser verification never writes proof');
  }
});
