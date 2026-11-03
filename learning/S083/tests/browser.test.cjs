'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const owned = path.resolve(__dirname, '..');
const repo = path.resolve(owned, '..', '..');
const helperFile = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const helperHash = createHash('sha256').update(fs.readFileSync(helperFile)).digest('hex');
assert.equal(helperHash, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helperFile);
const playwright = JSON.parse(fs.readFileSync(require.resolve('playwright/package.json', { paths: [path.dirname(helperFile)] }), 'utf8')).version;
assert.equal(playwright, '1.56.1');

function hashes(directory, result = {}) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) hashes(file, result);
    else result[path.relative(owned, file)] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
  return result;
}

async function dom(page) {
  return page.evaluate(() => {
    const text = (id) => document.getElementById(id).textContent;
    const rows = (id) => [...document.querySelectorAll(`#${id} tr`)].map((row) => [...row.cells].map((cell) => cell.textContent));
    return {
      phase: text('phase'), outcome: document.getElementById('result').dataset.outcome,
      checkpoint: text('checkpoint'), receipt: text('effect-receipt'), console: text('console-state'),
      metrics: Object.fromEntries(['destructive-count', 'duplicate-count', 'attempted-count', 'success-count', 'failure-count', 'unknown-count'].map((id) => [id, text(id)])),
      trace: rows('trace-body'), users: rows('user-body'),
      prediction: text('prediction-result'), historyCount: text('history-count'),
      history: [...document.querySelectorAll('#history > li')].map((item) => ({
        summary: item.querySelector('summary').textContent, fullEvidence: item.textContent
      })),
      error: { visible: !document.getElementById('error').hidden, text: text('error') },
      focus: document.activeElement.id
    };
  });
}

async function reset(page) {
  await page.locator('#clear-all').click();
  assert.equal(await page.locator('#policy').inputValue(), 'reconcile');
  assert.equal(await page.locator('#evidence').inputValue(), 'complete');
  assert.equal(await page.locator('#prediction').inputValue(), '');
  const state = await dom(page);
  assert.equal(state.outcome, 'NOT_RUN');
  assert.equal(state.trace.length, 0);
  assert.equal(state.users.length, 0);
  assert.equal(state.history.length, 0);
  assert.equal(state.error.visible, false);
  assert.equal(state.error.text, '');
  assert.equal(state.prediction, 'Prediction not checked.');
  assert.equal(state.focus, 'policy');
  assert.ok(Object.values(state.metrics).every((value) => value === '—'));
  assert.equal(await page.locator('#restart-trace').isDisabled(), true);
  assert.equal(await page.locator('#check-prediction').isDisabled(), true);
  assert.equal(await page.locator('#new-attempt').isDisabled(), true);
  assert.equal(await page.locator('#policy').isEnabled(), true);
  return state;
}

async function run(page, policy, evidence, prediction) {
  await page.locator('#policy').selectOption(policy);
  await page.locator('#evidence').selectOption(evidence);
  await page.locator('#stage-crash').click();
  await page.locator('#restart-trace').click();
  if (prediction) {
    await page.locator('#prediction').selectOption(prediction);
    await page.locator('#check-prediction').click();
  }
  return dom(page);
}

test('real DOM, keyboard, guard, reset, failure, UNKNOWN and CSP rehearsal', { timeout: 120000 }, async (t) => {
  const before = hashes(owned);
  const externalRequests = [];
  const pageErrors = [];
  const consoleErrors = [];
  const report = {
    schemaVersion: 1, cardId: 'A-S083', workerId: 'worker-A-S083',
    startedAtUtc: new Date().toISOString(), node: process.version, playwright,
    helper: { file: 'testing/browser/isolated.cjs', sha256: helperHash, sourceCommit: '53c0c0d82cc1db6780a87ac2b1085734af6d5c60', api: 'openIsolatedLesson' },
    entry: 'learning\\S083\\index.html', checks: [], closeAwaitedInFinally: false,
    limits: 'One observed local browser run, not unattended lifecycle qualification. No actual controller restart, durable resumption, side-effect certification, native Azure, production Node24 or source-parent completion.'
  };
  const session = await openIsolatedLesson('learning\\S083\\index.html');
  report.browserVersion = session.browserVersion;
  const page = session.page;
  page.on('request', (request) => {
    if (/^https?:/i.test(request.url())) externalRequests.push({ url: request.url(), method: request.method() });
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  const check = async (name, action) => {
    await t.test(name, async () => {
      try {
        const observed = await action();
        report.checks.push({ name, passed: true, observed });
      } catch (error) {
        report.checks.push({ name, passed: false, error: error.message });
        throw error;
      }
    });
  };
  try {
    await check('load exact banner, guarded idle controls and no success-shaped empty sample', async () => {
      assert.match(report.browserVersion, /^156\./);
      await page.reload({ waitUntil: 'load' });
      assert.equal(await page.title(), 'S083 - Controller restart rehearsal');
      assert.equal(await page.locator('#training-banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.locator('noscript').count(), 1);
      assert.equal(await page.locator('#restart-trace').isDisabled(), true);
      assert.equal(await page.locator('#prediction').isDisabled(), true);
      const state = await dom(page);
      assert.equal(state.outcome, 'NOT_RUN');
      assert.equal(state.trace.length, 0);
      assert.match(state.console, /AVAILABLE/);
      return state;
    });

    await check('keyboard-only safe reconciliation through staging, restart and checked history', async () => {
      await page.locator('#policy').focus();
      await page.keyboard.press('Tab');
      assert.equal((await dom(page)).focus, 'evidence');
      await page.keyboard.press('Tab');
      assert.equal((await dom(page)).focus, 'stage-crash');
      await page.keyboard.press('Enter');
      assert.equal((await dom(page)).focus, 'restart-trace');
      assert.equal(await page.locator('#policy').isDisabled(), true);
      assert.equal(await page.locator('#stage-crash').isDisabled(), true);
      assert.match((await dom(page)).phase, /crashed/);
      await page.keyboard.press('Enter');
      assert.equal((await dom(page)).focus, 'prediction');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#prediction').inputValue(), 'SUCCESS');
      await page.keyboard.press('Tab');
      assert.equal((await dom(page)).focus, 'check-prediction');
      await page.keyboard.press('Enter');
      const state = await dom(page);
      assert.equal(state.outcome, 'SUCCESS');
      assert.equal(state.metrics['destructive-count'], '1');
      assert.equal(state.metrics['duplicate-count'], '0');
      assert.equal(state.metrics['attempted-count'], '3');
      assert.equal(state.metrics['success-count'], '3');
      assert.equal(state.history.length, 1);
      assert.match(state.prediction, /Prediction correct/);
      assert.equal(state.focus, 'new-attempt');
      return state;
    });

    await check('keyboard unsafe replay retains the earlier success and exposes a duplicate with incorrect prediction', async () => {
      await page.keyboard.press('Space');
      assert.equal((await dom(page)).focus, 'policy');
      assert.equal((await dom(page)).history.length, 1);
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#policy').inputValue(), 'unsafe-replay');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      const state = await dom(page);
      assert.equal(state.outcome, 'FAILURE');
      assert.equal(state.metrics['destructive-count'], '2');
      assert.equal(state.metrics['duplicate-count'], '1');
      assert.equal(state.metrics['success-count'], '3');
      const effects = state.trace.filter((row) => row[1] === 'DESTRUCTIVE_DATA');
      assert.equal(effects.length, 2);
      assert.equal(effects[0][2], effects[1][2]);
      assert.match(state.prediction, /Prediction incorrect/);
      assert.equal(state.history.length, 2);
      assert.match(state.history[0].summary, /SUCCESS/);
      assert.match(state.history[1].summary, /FAILURE/);
      assert.ok(state.history.every((item) => item.fullEvidence.includes('VERDICT')));
      await page.locator('#history details').first().locator('summary').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#history details').first().getAttribute('open'), '');
      return state;
    });

    await check('keyboard explicit reset clears history, metrics, forms and focus without form.reset shadowing', async () => {
      await page.locator('#clear-all').focus();
      await page.keyboard.press('Space');
      const state = await dom(page);
      assert.equal(state.history.length, 0);
      assert.equal(state.trace.length, 0);
      assert.equal(state.outcome, 'NOT_RUN');
      assert.equal(state.focus, 'policy');
      assert.equal(await page.locator('#prediction').inputValue(), '');
      assert.equal(await page.locator('#policy').inputValue(), 'reconcile');
      assert.ok(Object.values(state.metrics).every((value) => value === '—'));
      return state;
    });

    await check('tampered enum gives a visible input error with unchanged trace and then resets', async () => {
      await page.locator('#policy').evaluate((select) => {
        const option = document.createElement('option');
        option.value = 'unregistered-policy';
        option.textContent = 'Invalid test fixture';
        select.append(option);
        select.value = option.value;
      });
      await page.locator('#stage-crash').click();
      const state = await dom(page);
      assert.equal(state.error.visible, true);
      assert.match(state.error.text, /^INPUT:/);
      assert.match(state.phase, /idle/);
      assert.equal(state.trace.length, 0);
      assert.equal(state.history.length, 0);
      assert.equal(state.outcome, 'NOT_RUN');
      await reset(page);
      await page.locator('#policy option[value="unregistered-policy"]').evaluate((option) => option.remove());
      return state;
    });

    await check('bypassing a disabled restart cannot bypass the model phase guard', async () => {
      await page.locator('#restart-trace').evaluate((button) => { button.disabled = false; });
      await page.locator('#restart-trace').click();
      const state = await dom(page);
      assert.equal(state.error.visible, true);
      assert.match(state.error.text, /^STATE:/);
      assert.equal(state.trace.length, 0);
      assert.equal(state.outcome, 'NOT_RUN');
      await reset(page);
      return state;
    });

    await check('empty prediction errors visibly and cannot retain or alter a measured result', async () => {
      const resumed = await run(page, 'reconcile', 'complete');
      await page.locator('#check-prediction').click();
      const state = await dom(page);
      assert.equal(state.error.visible, true);
      assert.match(state.error.text, /^INPUT:/);
      assert.equal(state.history.length, 0);
      assert.equal(state.outcome, 'SUCCESS');
      assert.deepEqual(state.trace, resumed.trace);
      await reset(page);
      return state;
    });

    await check('recorded user failure remains counted after a guarded restart', async () => {
      const state = await run(page, 'reconcile', 'recorded-user-failure', 'FAILURE');
      assert.equal(state.outcome, 'FAILURE');
      assert.equal(state.metrics['failure-count'], '1');
      assert.equal(state.metrics['duplicate-count'], '0');
      assert.equal(state.metrics['attempted-count'], '3');
      assert.deepEqual(state.users[1], ['journey-B', 'FAILURE']);
      assert.match(state.history[0].fullEvidence, /pre-crash interruption/);
      return state;
    });

    await check('missing effect receipt holds progress as UNKNOWN without replay', async () => {
      await page.locator('#new-attempt').click();
      const state = await run(page, 'reconcile', 'missing-effect-receipt', 'UNKNOWN');
      assert.equal(state.outcome, 'UNKNOWN');
      assert.match(state.checkpoint, /RECONCILE_REQUIRED/);
      assert.match(state.receipt, /MISSING/);
      assert.equal(state.metrics['destructive-count'], '1');
      assert.equal(state.metrics['unknown-count'], '1');
      assert.equal(state.history.length, 2);
      assert.match(state.history[0].summary, /FAILURE/);
      return state;
    });

    await check('missing user outcome is UNKNOWN even with a complete checkpoint', async () => {
      await page.locator('#new-attempt').click();
      const state = await run(page, 'reconcile', 'missing-user-outcome', 'UNKNOWN');
      assert.equal(state.outcome, 'UNKNOWN');
      assert.match(state.checkpoint, /COMPLETE/);
      assert.equal(state.metrics['success-count'], '2');
      assert.equal(state.metrics['unknown-count'], '1');
      assert.equal(state.metrics['attempted-count'], '3');
      assert.deepEqual(state.users[1], ['journey-B', 'UNKNOWN']);
      assert.equal(state.history.length, 3);
      return state;
    });

    await check('duplicate work remains FAILURE when a user outcome is also unknown', async () => {
      await page.locator('#new-attempt').click();
      const state = await run(page, 'unsafe-replay', 'missing-user-outcome', 'FAILURE');
      assert.equal(state.outcome, 'FAILURE');
      assert.equal(state.metrics['duplicate-count'], '1');
      assert.equal(state.metrics['unknown-count'], '1');
      assert.equal(state.history.length, 4);
      return state;
    });

    await check('all eight bounded combinations produce the measured result in the real DOM', async () => {
      const observed = [];
      for (const policy of ['reconcile', 'unsafe-replay']) {
        for (const receipt of ['complete', 'missing-effect-receipt', 'missing-user-outcome', 'recorded-user-failure']) {
          await reset(page);
          const expected = policy === 'unsafe-replay' || receipt === 'recorded-user-failure' ? 'FAILURE' : receipt === 'complete' ? 'SUCCESS' : 'UNKNOWN';
          const state = await run(page, policy, receipt, expected);
          assert.equal(state.outcome, expected);
          const metrics = state.metrics;
          assert.equal(Number(metrics['success-count']) + Number(metrics['failure-count']) + Number(metrics['unknown-count']), 3);
          assert.equal(metrics['duplicate-count'], policy === 'unsafe-replay' ? '1' : '0');
          observed.push({ policy, receipt, expected, actual: state.outcome, metrics });
        }
      }
      return observed;
    });

    await check('six full histories have no eviction and the limit rejects a forged new-attempt click', async () => {
      await reset(page);
      for (let index = 0; index < 6; index += 1) {
        await run(page, index % 2 ? 'unsafe-replay' : 'reconcile', 'complete', index % 2 ? 'FAILURE' : 'SUCCESS');
        if (index < 5) await page.locator('#new-attempt').click();
      }
      const beforeLimit = await dom(page);
      assert.equal(beforeLimit.history.length, 6);
      assert.match(beforeLimit.history[0].summary, /Attempt 1: SUCCESS/);
      assert.match(beforeLimit.historyCount, /Limit reached/);
      assert.equal(await page.locator('#new-attempt').isDisabled(), true);
      await page.locator('#new-attempt').evaluate((button) => { button.disabled = false; });
      await page.locator('#new-attempt').click();
      const state = await dom(page);
      assert.match(state.error.text, /^LIMIT:/);
      assert.deepEqual(state.history, beforeLimit.history);
      assert.deepEqual(state.trace, beforeLimit.trace);
      return state;
    });

    await check('explicit reset restores the DOM from idle, crashed, resumed and checked phases', async () => {
      const states = [];
      for (const phase of ['idle', 'crashed', 'resumed', 'checked']) {
        await reset(page);
        if (phase !== 'idle') await page.locator('#stage-crash').click();
        if (['resumed', 'checked'].includes(phase)) await page.locator('#restart-trace').click();
        if (phase === 'checked') {
          await page.locator('#prediction').selectOption('SUCCESS');
          await page.locator('#check-prediction').click();
        }
        assert.match((await dom(page)).phase, new RegExp(`Phase: ${phase}`));
        states.push({ resetFrom: phase, after: await reset(page) });
      }
      return states;
    });

    await check('reload is an explicit memory boundary; narrow layout and visible keyboard focus remain usable', async () => {
      await run(page, 'unsafe-replay', 'complete', 'FAILURE');
      assert.equal((await dom(page)).history.length, 1);
      await page.reload({ waitUntil: 'load' });
      const state = await dom(page);
      assert.equal(state.history.length, 0);
      assert.equal(state.outcome, 'NOT_RUN');
      await page.setViewportSize({ width: 375, height: 812 });
      await page.locator('#policy').focus();
      await page.keyboard.press('Tab');
      const layout = await page.evaluate(() => ({
        width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth,
        focused: document.activeElement.id,
        outlineStyle: getComputedStyle(document.activeElement).outlineStyle,
        outlineWidth: getComputedStyle(document.activeElement).outlineWidth
      }));
      assert.ok(layout.scrollWidth <= layout.width);
      assert.equal(layout.focused, 'evidence');
      assert.notEqual(layout.outlineStyle, 'none');
      assert.ok(parseFloat(layout.outlineWidth) >= 3);
      return { state, layout };
    });

    await check('actual inline-script and connection probes are blocked by enforced CSP', async () => {
      await page.evaluate((url) => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('The local CSP probe could not load.'));
        document.head.append(script);
      }), pathToFileURL(path.join(__dirname, 'csp-probe.js')).href);
      await page.waitForFunction(() => window.__s083CspProbe && window.__s083CspProbe.done
        && window.__s083CspProbe.violations.some((event) => event.directive === 'connect-src')
        && window.__s083CspProbe.violations.some((event) => event.directive.startsWith('script-src')));
      const probe = await page.evaluate(() => window.__s083CspProbe);
      assert.equal(probe.inlineRan, false);
      assert.equal(probe.connectionBlocked, true);
      assert.ok(probe.violations.some((event) => event.blockedURI === 'inline'));
      assert.ok(probe.violations.some((event) => event.directive === 'connect-src'));
      assert.equal(externalRequests.length, 0);
      assert.deepEqual(pageErrors, []);
      assert.ok(consoleErrors.every((message) => /Content Security Policy|security policy|Refused to|violates/i.test(message)), consoleErrors.join('\n'));
      return probe;
    });
  } finally {
    await session.close();
    report.closeAwaitedInFinally = true;
  }
  assert.deepEqual(hashes(owned), before, 'normal browser verification must not rewrite owned source or evidence');
  report.ownedFilesUnchanged = true;
  report.externalRequests = externalRequests;
  report.pageErrors = pageErrors;
  report.expectedCspConsoleErrors = consoleErrors;
  report.finishedAtUtc = new Date().toISOString();
  assert.ok(report.checks.every((item) => item.passed), 'a failed browser check is not publishable evidence');
  if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
    const output = path.join(owned, 'evidence', 'browser-acceptance.json');
    assert.equal(fs.existsSync(output), false, 'browser evidence is immutable; never overwrite a prior capture');
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  }
});
