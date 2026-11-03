'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const folder = path.resolve(__dirname, '..');
const helperPath = path.resolve(folder, '..', '..', 'testing', 'browser', 'isolated.cjs');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const helperSha256 = hash(fs.readFileSync(helperPath));
assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helperPath);
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const label = process.env.S053_BROWSER_LABEL;
if (capture && !/^browser-\d{3}$/.test(label || '')) throw new Error('Deliberate capture requires a unique S053_BROWSER_LABEL=browser-NNN.');

test('actual isolated browser: source-specific DOM, keyboard, errors, history, reset and CSP', async (t) => {
  const report = {
    cardId: 'A-S053', workerId: 'worker-A-S053', mode: 'synthetic', label: capture ? label : null,
    startedAtUtc: new Date().toISOString(), node: process.version,
    helper: 'testing\\browser\\isolated.cjs', helperSha256, publication: '53c0c0d',
    canonicalSourceSha256: Object.fromEntries([
      'model.js', 'lesson.js', 'index.html', 'styles.css', path.join('tests', 'browser.cjs'), path.join('tests', 'csp-probe.js'),
    ].map((file) => [file, hash(Buffer.from(fs.readFileSync(path.join(folder, file), 'utf8').replace(/\r\n/g, '\n')))])),
    checks: [], artifacts: [], pageErrors: [], externalRequests: [], cleanup: 'not yet closed',
    limits: 'Real browser interactions with a portable synthetic model, not HTTP/API/native Azure or production runtime proof.',
  };
  let session;
  async function saveDOM(page, suffix, screenshot = false) {
    if (!capture) return;
    const name = `${label}-${suffix}.dom.html`;
    const raw = Buffer.from(await page.content());
    fs.writeFileSync(path.join(folder, 'evidence', name), raw, { flag: 'wx' });
    report.artifacts.push({ file: name, bytes: raw.length, sha256: hash(raw) });
    if (screenshot) {
      const imageName = `${label}-${suffix}.png`;
      const imagePath = path.join(folder, 'evidence', imageName);
      assert.equal(fs.existsSync(imagePath), false, 'Never overwrite retained browser images.');
      const image = await page.screenshot({ path: imagePath, fullPage: true });
      report.artifacts.push({ file: imageName, bytes: image.length, sha256: hash(image) });
    }
  }
  async function check(name, callback) {
    await t.test(name, async () => {
      await callback();
      report.checks.push(name);
    });
  }
  try {
    session = await openIsolatedLesson('learning\\S053\\index.html');
    const { page } = session;
    report.browserVersion = session.browserVersion;
    assert.match(report.browserVersion, /^156\./);
    page.on('pageerror', (error) => report.pageErrors.push(error.message));
    await page.context().route(/^https?:/, async (route) => {
      report.externalRequests.push(route.request().url());
      await route.abort('blockedbyclient');
    });
    const value = (id) => page.locator(`#${id}`).textContent();
    const activeId = () => page.evaluate(() => document.activeElement?.id);
    const runKeyboard = async () => {
      await page.locator('#conduct').focus();
      await page.keyboard.press('Enter');
    };

    await check('exact banner, file-only page, labels and actual keyboard tab order', async () => {
      assert.match(page.url(), /^file:/);
      assert.equal(await value('training-banner'), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await value('verdict'), 'Synthetic verifier: NOT RUN');
      assert.equal(await page.evaluate(() => typeof document.querySelector('#migration-form').reset), 'function');
      await page.locator('#deployment').focus();
      for (const id of ['route', 'upgrades', 'observation', 'conduct', 'restart']) {
        await page.keyboard.press('Tab');
        assert.equal(await activeId(), id);
      }
      await page.keyboard.press('Shift+Tab');
      assert.equal(await activeId(), 'conduct');
    });

    await check('stable adapter: mixed consumers migrate with distinct API and software identities', async () => {
      await runKeyboard();
      assert.equal(await value('verdict'), 'Synthetic verifier: PASSED');
      assert.equal(await value('metric-migrated'), '3');
      assert.equal(await value('metric-interruptions'), '0');
      assert.equal(await page.locator('#journeys tr').count(), 3);
      const cells = await page.locator('#journeys tr').allTextContents();
      assert.match(cells[0], /requires API v2.*software 2\.0\.0.*API v2/s);
      assert.match(cells[1], /requires API v1.*software 2\.0\.0.*API v1.*"displayName": "Ada Example"/s);
      assert.match(cells[1], /adapter: yes/);
      assert.equal(await page.locator('#history li').count(), 1);
    });

    await check('versioned endpoints preserve both contracts on green software 2.0.0', async () => {
      await page.locator('#route').selectOption('versioned');
      await runKeyboard();
      assert.equal(await value('verdict'), 'Synthetic verifier: PASSED');
      assert.deepEqual(await page.locator('#journeys tr td:nth-child(2)').allTextContents(), [
        '/api/v2/profile', '/api/v1/profile', '/api/v1/profile',
      ]);
      assert.equal(await page.locator('#history li').count(), 2);
    });

    await check('forced incompatible HTTP-200 endpoint switch is FAILED, not safe migration', async () => {
      await page.locator('#route').selectOption('force-v2');
      await runKeyboard();
      assert.equal(await value('verdict'), 'Synthetic verifier: FAILED');
      assert.equal(await value('impact'), 'Synthetic user impact: interrupted');
      assert.equal(await value('metric-attempted'), '3');
      assert.equal(await value('metric-migrationFraction'), '1/3');
      assert.equal(await value('metric-interruptions'), '2');
      assert.equal(await page.locator('#journeys [data-outcome="failed"]').count(), 2);
      assert.equal((await value('journeys')).match(/HTTP 200; adapter: no/g)?.length, 3);
      await saveDOM(page, 'failure', true);
    });

    await check('explicit all-client upgrade succeeds without erasing the earlier interruption', async () => {
      await page.locator('#upgrades').focus();
      await page.keyboard.press('End');
      assert.equal(await page.locator('#upgrades').inputValue(), 'all');
      await runKeyboard();
      assert.equal(await value('verdict'), 'Synthetic verifier: PASSED');
      assert.equal(await value('metric-migrationFraction'), '3/3');
      assert.equal(await page.locator('#history li').count(), 4);
      assert.match(await page.locator('#history li').nth(2).textContent(), /FAILED.*interrupted.*interruptions 2/);
    });

    await check('forged enum is rejected with a focused error and unchanged DOM results/history', async () => {
      const previous = await value('journeys');
      await page.evaluate(() => {
        const option = new Option('Invalid test-only value', 'unapproved');
        document.querySelector('#route').append(option);
        document.querySelector('#route').value = 'unapproved';
        document.querySelector('#migration-form').requestSubmit();
      });
      assert.equal(await page.locator('#error').isVisible(), true);
      assert.match(await value('error'), /invalid route.*Previous results are unchanged/i);
      assert.equal(await activeId(), 'error');
      assert.equal(await value('journeys'), previous);
      assert.equal(await page.locator('#history li').count(), 4);
      await page.evaluate(() => {
        document.querySelector('#route option[value="unapproved"]').remove();
        document.querySelector('#route').value = 'force-v2';
      });
    });

    await check('unknowns retain their denominator; known failure wins; six-attempt guard retains everything', async () => {
      await page.locator('#observation').selectOption('missing-last');
      await runKeyboard();
      assert.equal(await value('verdict'), 'Synthetic verifier: UNKNOWN');
      assert.equal(await value('metric-attempted'), '3');
      assert.equal(await value('metric-unknown'), '1');
      assert.equal(await value('metric-migrationFraction'), '2/3');
      assert.match(await page.locator('#journeys tr').nth(2).textContent(), /UNKNOWN — no response or deployment observation/);
      assert.equal(await page.locator('#error').isVisible(), false);
      await page.locator('#upgrades').selectOption('one');
      await runKeyboard();
      assert.equal(await value('verdict'), 'Synthetic verifier: FAILED');
      assert.equal(await value('metric-interruptions'), '1');
      assert.equal(await value('metric-unknown'), '1');
      assert.equal(await page.locator('#history li').count(), 6);
      assert.equal(await page.locator('#conduct').isDisabled(), true);
      const previous = await value('history');
      await page.evaluate(() => document.querySelector('#migration-form').requestSubmit());
      assert.match(await value('error'), /six-attempt history limit/);
      assert.equal(await value('history'), previous);
      await saveDOM(page, 'failure-and-unknown');
    });

    await check('keyboard reset restores defaults, clears only local results and focuses first control', async () => {
      await page.locator('#restart').focus();
      await page.keyboard.press('Enter');
      assert.equal(await activeId(), 'deployment');
      assert.equal(await value('verdict'), 'Synthetic verifier: NOT RUN');
      assert.equal(await page.locator('#history li').count(), 0);
      assert.equal(await page.locator('#journeys tr').count(), 0);
      assert.equal(await page.locator('#metrics dd').count(), 0);
      assert.equal(await page.locator('#error').isVisible(), false);
      assert.equal(await page.locator('#conduct').isDisabled(), false);
      assert.deepEqual(await page.locator('select').evaluateAll((controls) => controls.map((control) => control.value)), [
        'green', 'adapter', 'one', 'complete',
      ]);
      await saveDOM(page, 'reset');
    });

    await check('successful blue requests are UNKNOWN migration; page reload has no invented persistence', async () => {
      await page.locator('#deployment').selectOption('blue');
      await page.locator('#route').selectOption('versioned');
      await page.locator('#upgrades').selectOption('none');
      await runKeyboard();
      assert.equal(await value('verdict'), 'Synthetic verifier: UNKNOWN');
      assert.equal(await value('impact'), 'Synthetic user impact: no-migration');
      assert.equal(await value('metric-completed'), '3');
      assert.equal(await value('metric-migrated'), '0');
      assert.equal(await value('metric-stayedOnBlue'), '3');
      await page.reload({ waitUntil: 'load' });
      assert.equal(await value('verdict'), 'Synthetic verifier: NOT RUN');
      assert.equal(await page.locator('#history li').count(), 0);
    });

    await check('actual CSP blocks inline execution, eval and external connection without bypass', async () => {
      await page.evaluate(() => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL('tests/csp-probe.js', location.href).href;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Allowed local CSP probe did not load.'));
        document.head.append(script);
      }));
      await page.waitForFunction(() => globalThis.__s053Csp?.finished
        && globalThis.__s053Csp.violations.length >= 3);
      const csp = await page.evaluate(() => globalThis.__s053Csp);
      assert.equal(csp.inlineRan, false);
      assert.equal(csp.evalRan, false);
      assert.equal(csp.evalBlocked, true);
      assert.equal(csp.connectionBlocked, true);
      assert.ok(csp.violations.some((entry) => entry.directive === 'script-src-elem' && entry.blockedURI === 'inline'));
      assert.ok(csp.violations.some((entry) => entry.directive === 'script-src' && entry.blockedURI === 'eval'));
      assert.ok(csp.violations.some((entry) => entry.directive === 'connect-src' && entry.blockedURI.startsWith('https://s053.invalid')));
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
    if (capture) {
      fs.writeFileSync(path.join(folder, 'evidence', `${label}.observations.json`), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    }
    console.log(JSON.stringify(report, null, 2));
  }
});
