'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
assert.equal(sha(fs.readFileSync(helper)), helperHash, 'Only the published helper is qualified');
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const evidence = path.join(root, 'evidence');
const proofPath = path.join(evidence, 'browser-verified.json');
const domPath = path.join(evidence, 'browser-final', 'dom.snapshot');
const fingerprint = () => {
  const entries = {};
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else entries[path.relative(evidence, file)] = sha(fs.readFileSync(file));
    }
  };
  walk(evidence);
  return entries;
};

test('actual isolated DOM, keyboard, bounded history, failures, unknowns, guards, reset and CSP', { timeout: 180000 }, async () => {
  const before = !capture && fingerprint();
  const proof = {
    schemaVersion: 1, cardId: 'A-S073', workerId: 'worker-A-S073', mode: 'synthetic',
    entry: 'learning\\S073\\index.html', runtime: process.version, playwrightVersion,
    startedAtUtc: new Date().toISOString(), captureExplicitlyEnabled: capture,
    helper: { path: 'testing\\browser\\isolated.cjs', publication: '53c0c0d', sha256: helperHash },
    outcome: 'FAIL', observations: [], pageErrors: [], consoleErrors: [],
    exerciseNetworkRequests: [], probeRequests: [], probeResponses: [], egressGuardHits: [],
    cleanup: { awaitedFinallyClose: false },
    canonicalSourceHashes: Object.fromEntries([
      'index.html', 'styles.css', 'model.js', 'app.js', 'tests\\browser.test.cjs', 'tests\\csp-probe.js',
    ].map((file) => [file, sha(Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')))])),
  };
  let session;
  let stage = 'exercise';
  let domSnapshot;
  let verified = false;
  try {
    assert.equal(process.version, 'v22.23.4');
    assert.equal(playwrightVersion, '1.56.1');
    if (capture) {
      assert.equal(fs.existsSync(proofPath), false, 'Capture must not overwrite retained proof');
      assert.equal(fs.existsSync(domPath), false, 'Capture must not overwrite raw DOM');
    }
    session = await openIsolatedLesson('learning\\S073\\index.html');
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
      if (/^https?:/i.test(response.url())) proof.probeResponses.push(response.url());
    });
    // Safety backstop only: zero hits plus native CSP events are required below.
    await page.route(/^https?:\/\//, async (route) => {
      proof.egressGuardHits.push(route.request().url());
      await route.abort('blockedbyclient');
    });
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.title(), 'S073 — Cache loss and required profile recovery');
    assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
    const defaults = { cache: 'lost', recovery: 'durable', durable: 'correct', budget: '150' };
    const historyText = () => page.locator('#history').textContent();
    const observe = async (name) => {
      proof.observations.push({
        name, phase: await page.locator('#phase').innerText(),
        outcome: await page.locator('#outcome').innerText(),
        metrics: await page.locator('#metrics').innerText(),
        profile: await page.locator('#profile').innerText(),
        trace: await page.locator('#trace').innerText(),
        history: await historyText(), totals: await page.locator('#totals').innerText(),
        prediction: await page.locator('#prediction-result').innerText(),
        error: await page.locator('#input-error').textContent(),
        focus: await page.evaluate(() => document.activeElement.id),
      });
    };
    const empty = async (historyCount) => {
      assert.equal(await page.locator('#phase').innerText(), 'Phase: configuring');
      assert.equal(await page.locator('#outcome').innerText(), 'Not evaluated — no recovery proof.');
      assert.equal(await page.locator('#metrics').innerText(), 'No attempt measured.');
      assert.equal(await page.locator('#profile').innerText(), 'No returned profile observation.');
      assert.equal(await page.locator('#trace').innerText(), 'No attempt started.');
      assert.equal(await page.locator('#detail').textContent(), '');
      assert.equal(await page.locator('#prediction-result').innerText(), 'Prediction not checked.');
      assert.equal(await page.locator('#prediction').inputValue(), '');
      assert.equal(await page.locator('#prediction').isDisabled(), true);
      assert.equal(await page.locator('#new-attempt').isDisabled(), true);
      assert.equal(await page.locator('#run-attempt').isEnabled(), true);
      assert.equal(await page.locator('#history tr').count(), historyCount);
      assert.equal(await page.locator('#history-count').innerText(), `Retained attempts: ${historyCount} / 6`);
      assert.equal(await page.locator('#input-error').isHidden(), true);
      assert.equal(await page.locator('#input-error').textContent(), '');
      assert.equal(await page.locator('[aria-invalid]').count(), 0);
      for (const [id, value] of Object.entries(defaults)) {
        assert.equal(await page.locator(`#${id}`).inputValue(), value);
        assert.equal(await page.locator(`#${id}`).isEnabled(), true);
      }
      for (const id of ['attempt-form', 'check-form']) {
        assert.equal(await page.locator(`#${id}`).evaluate((form) => typeof form.reset), 'function');
      }
    };
    const run = async (classification, reason, elapsed = 110) => {
      const count = await page.locator('#history tr').count();
      await page.locator('#run-attempt').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: observed');
      assert.equal(await page.locator('#outcome').innerText(), `${classification} — ${reason}`);
      assert.ok((await page.locator('#metrics').innerText()).includes(`Elapsed: ${elapsed === null ? 'unknown' : elapsed} synthetic ms`));
      assert.equal(await page.locator('#history tr').count(), count + 1);
      assert.equal(await page.locator('#history tr').last().locator('td').nth(4).innerText(), 'Unchecked');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'prediction');
      assert.equal(await page.locator('#input-error').isHidden(), true);
      for (const id of Object.keys(defaults)) assert.equal(await page.locator(`#${id}`).isDisabled(), true);
    };
    const check = async (prediction, correct = true) => {
      const outcome = await page.locator('#outcome').innerText();
      await page.locator('#prediction').selectOption(prediction);
      await page.locator('#check-result').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: checked');
      assert.equal(await page.locator('#outcome').innerText(), outcome);
      assert.ok((await page.locator('#prediction-result').innerText()).startsWith(`Prediction ${correct ? 'correct' : 'incorrect'};`));
      const focus = await page.locator('#history tr').count() < 6 ? 'new-attempt' : 'reset-rehearsal';
      assert.equal(await page.evaluate(() => document.activeElement.id), focus);
      assert.equal(await page.locator('#prediction').isDisabled(), true);
    };
    const next = async (settings = {}) => {
      const count = await page.locator('#history tr').count();
      const beforeHistory = await historyText();
      await page.locator('#new-attempt').focus();
      await page.keyboard.press('Enter');
      await empty(count);
      assert.equal(await historyText(), beforeHistory);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'cache');
      for (const [id, value] of Object.entries(settings)) await page.locator(`#${id}`).selectOption(value);
    };
    const reset = async () => {
      await page.locator('#reset-rehearsal').focus();
      await page.keyboard.press('Space');
      await empty(0);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'cache');
      assert.equal(await page.locator('#totals').innerText(), 'Measured attempts: 0; SUCCESS 0; FAILURE 0; UNKNOWN 0. No recovery proof.');
    };

    await empty(0);
    await page.getByLabel('Cache observation', { exact: true }).focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'recovery');
    assert.equal(await page.locator('#recovery').evaluate((element) => getComputedStyle(element).outlineWidth), '3px');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#recovery').inputValue(), 'empty');

    await page.locator('#budget').evaluate((select) => {
      select.add(new Option('Invalid synthetic test option', '110oops'));
      select.value = '110oops';
    });
    await page.locator('#run-attempt').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#input-error').innerText(), 'Choose a supported budget value.');
    assert.equal(await page.locator('#budget').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('#history tr').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'budget');
    await observe('Malformed DOM budget rejected before any observation');
    await page.locator('#budget').evaluate((select) => {
      [...select.options].find((option) => option.value === '110oops').remove();
      select.value = '150';
    });

    await run('FAILURE', 'EMPTY_PROFILE', 20);
    assert.equal(await page.locator('#profile').innerText(), '{}');
    await page.locator('#check-result').focus();
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#input-error').innerText(), /Choose SUCCESS, FAILURE or UNKNOWN/);
    assert.equal(await page.locator('#history tr').count(), 1);
    await page.locator('#attempt-form').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.match(await page.locator('#input-error').innerText(), /configuring phase/);
    assert.equal(await page.locator('#history tr').count(), 1);
    await check('SUCCESS', false);
    await observe('Fast empty profile fails even when the learner predicts success');
    domSnapshot = await page.content();

    await next({ budget: '110' });
    await run('SUCCESS', 'DURABLE_PROFILE_VERIFIED');
    assert.deepEqual(JSON.parse(await page.locator('#profile').innerText()), require('..\\model.js').REQUIRED);
    await check('SUCCESS');
    await observe('Exact required durable state succeeds at the 110 ms boundary');
    await next({ budget: '80' });
    await run('FAILURE', 'BUDGET_EXCEEDED');
    assert.equal(JSON.parse(await page.locator('#profile').innerText()).revision, 7);
    await check('FAILURE');
    await observe('Correct state still fails a known 80 ms budget');
    await next({ durable: 'unknown' });
    await run('UNKNOWN', 'DURABLE_RECEIPT_UNKNOWN');
    assert.equal(await page.locator('#profile').innerText(), 'No returned profile observation.');
    await check('UNKNOWN');
    await observe('Missing durable receipt remains unknown');
    await next({ durable: 'stale' });
    await run('FAILURE', 'STALE_PROFILE');
    assert.equal(JSON.parse(await page.locator('#profile').innerText()).revision, 6);
    await check('FAILURE');
    await next({ recovery: 'fail' });
    await run('FAILURE', 'EXPLICIT_FAILURE', 20);
    await check('FAILURE');
    assert.equal(await page.locator('#new-attempt').isDisabled(), true);
    const fullHistory = await historyText();
    await page.locator('#new-attempt').dispatchEvent('click');
    assert.match(await page.locator('#input-error').innerText(), /Six attempts are retained/);
    assert.equal(await historyText(), fullHistory);
    await page.locator('#check-form').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.match(await page.locator('#input-error').innerText(), /observed phase/);
    assert.equal(await historyText(), fullHistory);
    assert.match(await page.locator('#totals').innerText(), /Measured attempts: 6; SUCCESS 1; FAILURE 4; UNKNOWN 1/);
    await observe('Six retained attempts, repeated-check and seventh-attempt guards');
    await reset();
    await observe('Keyboard reset clears full history, guards, trace, prediction and metrics');

    const cases = [
      [{ durable: 'wrong' }, 'FAILURE', 'WRONG_PROFILE', 110],
      [{ durable: 'empty' }, 'FAILURE', 'EMPTY_PROFILE', 110],
      [{ durable: 'unavailable' }, 'FAILURE', 'DURABLE_UNAVAILABLE', 110],
      [{ cache: 'unknown' }, 'UNKNOWN', 'CACHE_OBSERVATION_UNKNOWN', null],
      [{ cache: 'available', recovery: 'empty' }, 'SUCCESS', 'CACHE_PROFILE_VERIFIED', 10],
      [{ durable: 'unknown', budget: '80' }, 'FAILURE', 'BUDGET_EXCEEDED', 110],
    ];
    for (const [i, [settings, classification, reason, elapsed]] of cases.entries()) {
      if (i) await next(settings);
      else for (const [id, value] of Object.entries(settings)) await page.locator(`#${id}`).selectOption(value);
      await run(classification, reason, elapsed);
      await check(classification);
      await observe(`Additional native-DOM synthetic condition: ${reason}`);
    }
    await reset();
    await page.locator('#attempt-form').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await page.locator('#check-result').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#prediction').getAttribute('aria-invalid'), 'true');
    await reset();
    await observe('Reset also clears an unchecked attempt and visible prediction error');
    assert.deepEqual(proof.pageErrors, []);
    assert.deepEqual(proof.consoleErrors.filter((entry) => entry.stage === 'exercise'), []);
    assert.deepEqual(proof.exerciseNetworkRequests, []);

    stage = 'csp';
    const entryUrl = page.url();
    await page.evaluate((url) => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('The owned external CSP probe failed to load.'));
      script.src = url;
      document.head.append(script);
    }), new URL('tests/csp-probe.js', page.url()).href);
    await page.waitForFunction(() => {
      const probe = globalThis.__s073CspProbe;
      return probe && probe.fetchRejected && ['script-src', 'style-src', 'connect-src', 'frame-src', 'form-action']
        .every((prefix) => probe.violations.some((event) => event.directive.startsWith(prefix)));
    }, null, { timeout: 10000 });
    proof.csp = await page.evaluate(() => ({
      ...globalThis.__s073CspProbe,
      inlineGlobalAbsent: globalThis.__s073InlineExecuted === undefined,
      inlineStyleAbsent: getComputedStyle(document.body).getPropertyValue('--s073-inline-style').trim() === '',
    }));
    assert.equal(proof.csp.inlineExecuted, false);
    assert.equal(proof.csp.inlineGlobalAbsent, true);
    assert.equal(proof.csp.inlineStyleAbsent, true);
    assert.equal(proof.csp.fetchRejected, true);
    assert.equal(page.url(), entryUrl, 'CSP prevents native form submission navigation');
    assert.deepEqual(proof.egressGuardHits, [], 'Native CSP, not the safety route, must stop each probe');
    assert.deepEqual(proof.probeResponses, []);
    assert.deepEqual(proof.pageErrors, []);
    proof.actualSyntheticAttempts = 13;
    verified = true;
  } catch (error) {
    proof.failure = { message: error.message, stack: error.stack };
    throw error;
  } finally {
    try {
      if (session) {
        await session.close();
        proof.cleanup.awaitedFinallyClose = true;
      }
      if (verified) proof.outcome = 'PASS';
    } finally {
      proof.completedAtUtc = new Date().toISOString();
      if (capture) {
        if (domSnapshot) {
          fs.mkdirSync(path.dirname(domPath), { recursive: true });
          fs.writeFileSync(domPath, domSnapshot, { flag: 'wx' });
          proof.domSnapshot = { path: 'evidence\\browser-final\\dom.snapshot', rawSha256: sha(Buffer.from(domSnapshot)) };
        }
        fs.writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, { flag: 'wx' });
      } else assert.deepEqual(fingerprint(), before, 'Ordinary browser verification must not rewrite retained proof');
    }
  }
});
