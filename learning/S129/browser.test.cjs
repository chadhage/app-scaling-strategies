'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const repo = path.resolve(__dirname, '..', '..');
const helperPath = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const helperHash = digest(fs.readFileSync(helperPath));
assert.equal(helperHash, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helperPath);
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

function ownedHashes(directory = __dirname, prefix = '') {
  const result = {};
  for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    assert.equal(item.isSymbolicLink(), false);
    const relative = path.join(prefix, item.name);
    if (item.isDirectory()) Object.assign(result, ownedHashes(path.join(directory, item.name), relative));
    else {
      assert.equal(item.isFile(), true);
      result[relative] = digest(fs.readFileSync(path.join(directory, item.name)));
    }
  }
  return result;
}

test('actual isolated S129 DOM, keyboard, errors/reset, failures and CSP', { timeout: 120000 }, async (t) => {
  assert.equal(process.version, 'v22.23.4');
  assert.equal(require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version, '1.56.1');
  const before = ownedHashes();
  const observations = [];
  const checks = [];
  const failures = [];
  const pageErrors = [];
  const remoteRequests = [];
  const failedAssets = [];
  const screenshots = [];
  const stem = capture ? `browser-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}` : null;
  let session;
  let page;
  let awaitedCleanupCompleted = false;
  let browserVersion = null;
  let entryURL;
  const read = (id) => page.locator(`#${id}`).textContent();
  const key = async (id) => {
    await page.locator(`#${id}`).focus();
    await page.keyboard.press('Enter');
  };
  const fresh = async () => {
    await page.goto(entryURL, { waitUntil: 'load' });
    assert.equal(await read('phase'), 'idle');
  };
  const begin = async ({ host = 'supporting-slots', policy = 'deduplicate', budget = '6' } = {}) => {
    await page.locator('#host').selectOption(host);
    await page.locator('#policy').selectOption(policy);
    await page.locator('#budget').fill(budget);
    await page.locator('#consent').focus();
    if (!(await page.locator('#consent').isChecked())) await page.keyboard.press('Space');
    await page.locator('#budget').press('Enter');
    assert.equal(await read('phase'), 'prepared');
  };
  const complete = async (options) => {
    await begin(options);
    for (const action of ['swap', 'probe', 'replay', 'evaluate']) await key(`${action}-button`);
    assert.equal(await read('phase'), 'reviewed');
  };
  const observe = async (name, extra = {}) => {
    const data = await page.evaluate(() => {
      const fields = {};
      for (const id of ['phase', 'swap-result', 'probe-result', 'replay-result', 'effects', 'checkpoint', 'http-result', 'verification', 'impact', 'metric', 'claims', 'cleanup', 'attempted', 'uninterrupted', 'interrupted', 'unknown', 'run-count', 'error', 'status']) {
        fields[id] = document.getElementById(id)?.textContent ?? null;
      }
      return {
        fields,
        executions: document.getElementById('executions')?.textContent ?? null,
        journeys: document.getElementById('journeys')?.textContent ?? null,
        history: Array.from(document.querySelectorAll('#history > li'), (item) => item.textContent),
        focusedId: document.activeElement?.id,
      };
    });
    observations.push({ name, ...data, ...extra });
  };
  const screenshot = async (name) => {
    if (!capture) return;
    const relative = path.join('evidence', 'raw', `${stem}-${name}.png`);
    assert.equal(fs.existsSync(path.join(__dirname, relative)), false);
    await page.screenshot({ path: path.join(__dirname, relative), fullPage: true });
    screenshots.push(relative);
  };
  const check = (name, action) => t.test(name, { timeout: 20000 }, async () => {
    try {
      await action();
      checks.push({ name, passed: true });
    } catch (error) {
      failures.push({ name, message: error.message });
      checks.push({ name, passed: false });
      if (page) await observe(`failure: ${name}`).catch(() => {});
      throw error;
    }
  });
  try {
    session = await openIsolatedLesson(path.join('learning', 'S129', 'index.html'));
    page = session.page;
    entryURL = page.url();
    browserVersion = session.browserVersion;
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => {
      if (/^(https?|wss?):/i.test(request.url())) remoteRequests.push(request.url());
    });
    page.on('requestfailed', (request) => failedAssets.push({
      file: path.basename(new URL(request.url()).pathname),
      error: request.failure()?.errorText,
    }));
    assert.equal(browserVersion, '156.0.4314.50');

    await check('standalone exact banner, labels, visible focus and native Tab order', async () => {
      assert.equal(await page.title(), 'S129 - Functions swap rehearsal');
      assert.equal(await page.locator('.banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.getByLabel('Fictional hosting category', { exact: true }).count(), 1);
      assert.equal(await page.getByLabel('Fixed replay policy', { exact: true }).count(), 1);
      assert.equal(await page.getByRole('alert', { includeHidden: true }).count(), 1);
      await page.locator('#host').focus();
      for (const id of ['policy', 'budget', 'consent', 'begin-button']) {
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), id);
      }
      const outline = await page.locator('#begin-button').evaluate((element) => getComputedStyle(element).outlineWidth);
      assert.equal(outline, '3px');
      assert.equal(await page.locator('#swap-button').isDisabled(), true);
      assert.equal(await read('metric'), 'No sample — not 100% success');
      await observe('standalone-keyboard', { outline });
    });

    await check('false consent and malformed numeric input focus errors without adding any run', async () => {
      await fresh();
      await page.locator('#budget').press('Enter');
      assert.match(await read('error'), /literal true/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
      assert.equal(await page.locator('#consent').getAttribute('aria-invalid'), 'true');
      assert.equal(await page.locator('#history > li').count(), 0);
      await page.locator('#consent').check();
      for (const invalid of [' 6', '6 ', '06', '6.0', '+6', '6e0', '11', '<script>6</script>']) {
        await page.locator('#budget').fill(invalid);
        await page.locator('#budget').press('Enter');
        assert.match(await read('error'), /exact whole number/);
        assert.equal(await read('phase'), 'idle');
        assert.equal(await read('attempted'), '0');
        assert.equal(await page.locator('#history > li').count(), 0);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
        await observe('invalid-budget', { input: invalid });
      }
      await screenshot('typed-error');
      await page.locator('#budget').fill('6');
      await page.locator('#budget').press('Enter');
      assert.equal(await read('phase'), 'prepared');
      assert.equal(await page.locator('#error').isHidden(), true);
      assert.equal(await page.locator('#budget').getAttribute('aria-invalid'), null);
    });

    await check('DOM-injected policy and premature action still meet strict runtime guards', async () => {
      await fresh();
      await page.evaluate(() => {
        const option = document.createElement('option');
        option.value = 'deduplicate ';
        option.textContent = 'invalid fixed policy';
        document.getElementById('policy').append(option);
      });
      await page.locator('#policy').selectOption('deduplicate ');
      await page.locator('#consent').check();
      await page.locator('#budget').press('Enter');
      assert.match(await read('error'), /exact fixed replay policy/);
      assert.equal(await read('phase'), 'idle');
      assert.equal(await page.locator('#history > li').count(), 0);
      await page.locator('#probe-button').evaluate((element) => { element.disabled = false; });
      await key('probe-button');
      assert.match(await read('error'), /Safe hold.*idle/);
      assert.equal(await read('attempted'), '0');
      assert.equal(await page.locator('#history > li').count(), 0);
      await observe('tampered-DOM-safe-hold');
    });

    await check('active old executions, successful swap and probe retain 3 original outcomes', async () => {
      await fresh();
      await begin();
      assert.equal(await page.locator('#executions > tr').count(), 2);
      assert.equal(await page.locator('#host').isDisabled(), true);
      assert.equal(await read('attempted'), '0');
      await key('swap-button');
      assert.match(await read('swap-result'), /successful.*candidate-v2.*added compute 0/);
      assert.equal(await read('attempted'), '3');
      assert.equal(await read('uninterrupted'), '1');
      assert.equal(await read('interrupted'), '1');
      assert.equal(await read('unknown'), '1');
      assert.match(await page.locator('#executions').textContent(), /EX-old-queue.*terminated/);
      assert.match(await page.locator('#executions').textContent(), /EX-old-http.*unknown/);
      const original = await page.locator('#journeys').textContent();
      await key('probe-button');
      assert.match(await read('probe-result'), /HTTP 200.*probe only/);
      assert.equal(await page.locator('#journeys').textContent(), original);
      assert.equal(await read('attempted'), '3');
      assert.match(await read('claims'), /unverified.*not guaranteed.*incomplete/);
      await observe('swap-probe-do-not-prove-continuity');
    });

    await check('safe replay advances checkpoint and ack but cannot erase termination or HTTP unknown', async () => {
      await fresh();
      await complete();
      assert.match(await read('verification'), /^PASS/);
      assert.match(await read('effects'), /1 known queue effect.*0 duplicate/);
      assert.match(await read('checkpoint'), /3 \/ 3.*observed on replay only/);
      assert.match(await read('http-result'), /unknown.*not reconciled/);
      assert.equal(await page.locator('#executions > tr').count(), 4);
      assert.match(await page.locator('#executions').textContent(), /EX-old-queue.*terminated/);
      assert.match(await page.locator('#executions').textContent(), /EX-replay-queue.*completed/);
      assert.match(await read('impact'), /^Interrupted/);
      assert.match(await read('metric'), /1 \/ 3.*33.33%/);
      assert.equal(await read('interrupted'), '1');
      assert.equal(await read('unknown'), '1');
      await observe('safe-replay-original-impact-retained');
      await screenshot('safe-replay');
    });

    await check('blind replay is a measured duplicate-effect failure, not successful continuity', async () => {
      await fresh();
      await complete({ policy: 'blind-replay' });
      assert.match(await read('verification'), /^FAIL.*duplicate/);
      assert.match(await read('replay-result'), /^completed/);
      assert.match(await read('effects'), /2 known queue effect.*1 duplicate/);
      assert.match(await read('checkpoint'), /observed on replay only/);
      assert.equal(await read('attempted'), '3');
      assert.equal(await read('interrupted'), '1');
      assert.equal(await read('unknown'), '1');
      await observe('blind-replay-duplicate');
    });

    await check('insufficient recovery budget leaves replay checkpoint and acknowledgment unverified', async () => {
      await fresh();
      await complete({ budget: '5' });
      assert.match(await read('verification'), /^UNVERIFIED/);
      assert.match(await read('replay-result'), /5 observed \/ 6 required/);
      assert.match(await read('checkpoint'), /2 \/ 3.*not observed within replay budget/);
      assert.match(await page.locator('#executions').textContent(), /EX-replay-queue.*unknown/);
      assert.equal(await read('unknown'), '1');
      assert.equal(await read('interrupted'), '1');
      await observe('bounded-replay-no-receipt');
    });

    await check('unsupported Flex and Container Apps categories start no slot-transition journeys', async () => {
      for (const host of ['flex-no-slots', 'functions-container-apps']) {
        await fresh();
        await begin({ host });
        await key('swap-button');
        assert.equal(await read('phase'), 'unsupported');
        assert.equal(await page.locator('#probe-button').isDisabled(), true);
        assert.equal(await page.locator('#replay-button').isDisabled(), true);
        await key('evaluate-button');
        assert.match(await read('verification'), /^UNSUPPORTED/);
        assert.equal(await read('attempted'), '0');
        assert.equal(await page.locator('#executions > tr').count(), 0);
        assert.equal(await read('metric'), 'No sample — not 100% success');
        await observe('unsupported-host', { host });
      }
    });

    await check('keyboard reset restores defaults while preserving original errors/unknowns and event details', async () => {
      await fresh();
      await complete({ policy: 'blind-replay', budget: '8' });
      const historyBefore = await page.locator('#history > li').first().textContent();
      await key('reset-button');
      assert.equal(await read('phase'), 'idle');
      assert.equal(await page.locator('#host').inputValue(), 'supporting-slots');
      assert.equal(await page.locator('#policy').inputValue(), 'deduplicate');
      assert.equal(await page.locator('#budget').inputValue(), '6');
      assert.equal(await page.locator('#consent').isChecked(), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'host');
      assert.equal(await page.locator('#history > li').count(), 1);
      const retained = await page.locator('#history > li').first().textContent();
      assert.equal(retained.includes(historyBefore), false);
      assert.match(retained, /1 uninterrupted, 1 interrupted, 1 unknown \/ 3 started/);
      assert.match(retained, /"outcome": "interrupted"/);
      assert.match(retained, /"outcome": "unknown"/);
      assert.match(retained, /"effects": 2/);
      assert.match(retained, /reset; evidence retained/);
      assert.equal(await page.locator('#history > li > ol > li').count(), 6);
      const details = page.locator('#history > li details').first();
      await details.locator('summary').focus();
      await page.keyboard.press('Enter');
      assert.equal(await details.getAttribute('open'), '');
      await observe('keyboard-reset-retains-evidence');
    });

    await check('six-run UI bound never prunes history or admits a seventh run through DOM tampering', async () => {
      await fresh();
      for (let run = 1; run <= 6; run++) {
        await begin();
        await key('reset-button');
      }
      assert.equal(await page.locator('#history > li').count(), 6);
      assert.equal(await read('run-count'), '6 / 6 retained runs');
      assert.equal(await page.locator('#begin-button').isDisabled(), true);
      await page.locator('#consent').check();
      await page.locator('#begin-button').evaluate((element) => { element.disabled = false; });
      await key('begin-button');
      assert.match(await read('error'), /Six-run session bound/);
      assert.equal(await page.locator('#history > li').count(), 6);
      assert.equal(await read('phase'), 'idle');
      await observe('bounded-history-no-pruning');
    });

    await check('actual CSP blocks inline/eval, data fetch without network, and a valid Blob worker', async () => {
      await fresh();
      await page.evaluate((url) => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.addEventListener('load', () => resolve());
        script.addEventListener('error', () => reject(new Error('Owned CSP probe did not load.')));
        document.body.append(script);
      }), pathToFileURL(path.join(__dirname, 'evidence', 'csp-probe.js')).href);
      await page.waitForFunction(() => {
        const observed = window.S129CspObservation;
        return observed?.done && ['script-src-elem', 'script-src', 'connect-src', 'worker-src'].every((directive) => observed.events.some((event) => event.directive === directive));
      });
      const csp = await page.evaluate(() => window.S129CspObservation);
      assert.equal(csp.fixtureError, undefined);
      for (const flag of ['inlineExecuted', 'evalExecuted', 'dataFetchSucceeded', 'workerStarted']) assert.equal(csp[flag], false);
      assert.equal(csp.events.some((event) => event.directive === 'worker-src' && event.blockedURI.startsWith('blob')), true);
      assert.equal(csp.events.every((event) => event.disposition === 'enforce'), true);
      assert.deepEqual(remoteRequests, []);
      await observe('observed-CSP-denials', { csp });
      await page.evaluate(() => {
        if (window.S129CspWorker) window.S129CspWorker.terminate();
        URL.revokeObjectURL(window.S129CspWorkerURL);
      });
    });

    await check('missing required model fails visibly with disabled operations and no false result', async () => {
      await page.goto(pathToFileURL(path.join(__dirname, 'evidence', 'missing-model.html')).href, { waitUntil: 'load' });
      assert.equal(await read('phase'), 'unavailable');
      assert.match(await read('error'), /required local model data failed to load/);
      assert.match(await read('status'), /No result is inferred/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
      for (const control of await page.locator('main button').all()) assert.equal(await control.isDisabled(), true);
      assert.equal(failedAssets.some((asset) => asset.file === 'missing-required-model.js'), true);
      await observe('missing-model-visible-failure');
      await screenshot('missing-model');
    });
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(remoteRequests, []);
    assert.equal(checks.length, 12);
    assert.equal(checks.every((item) => item.passed), true);
  } catch (error) {
    failures.push({ name: 'browser execution', message: error.message });
    throw error;
  } finally {
    try {
      if (session) {
        await session.close();
        awaitedCleanupCompleted = true;
      }
    } catch (error) {
      failures.push({ name: 'awaited cleanup', message: error.message });
      throw error;
    } finally {
      const after = ownedHashes();
      for (const [file, hash] of Object.entries(before)) assert.equal(after[file], hash, `Historical file changed: ${file}`);
      if (!capture) assert.deepEqual(after, before, 'Normal verification must be read-only to the entire owned bundle.');
      if (capture) {
        for (const file of Object.keys(after).filter((file) => !Object.hasOwn(before, file))) {
          assert.equal(screenshots.includes(file), true, `Unexpected file added during browser check: ${file}`);
        }
        const report = {
          cardId: 'A-S129', workerId: 'worker-A-S129', packet: 'SC-S129',
          mode: 'portable-synthetic', actualBrowser: true, mockDOM: false,
          browserVersion, node: process.version, playwright: '1.56.1', helperHash,
          checks, observations, failures, pageErrors, remoteRequests, failedAssets,
          screenshots, awaitedCleanupCompleted, historicalBytesPreserved: true,
          passed: failures.length === 0 && checks.length === 12 && checks.every((item) => item.passed),
          nativeVerified: false, sourceParentComplete: false, extraKanoCredits: 0,
        };
        const reportPath = path.join(__dirname, 'evidence', 'raw', `${stem}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        t.diagnostic(`Deliberate new browser evidence: ${path.relative(repo, reportPath)}`);
      }
    }
  }
});
