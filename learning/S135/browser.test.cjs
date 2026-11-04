'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const test = require('node:test');
const { openIsolatedLesson } = require('..\\..\\testing\\browser\\isolated.cjs');
const root = path.resolve(__dirname, '..', '..');
const helperSha256 = createHash('sha256').update(fs.readFileSync(path.join(root, 'testing', 'browser', 'isolated.cjs'))).digest('hex');
const expectedHelperSha256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const banner = 'Training rehearsal - synthetic data - not a live Azure result';

test('actual isolated Edge observations of synthetic S135 DOM, keyboard, guards, reset, failure and CSP', { timeout: 120000 }, async (t) => {
  const report = {
    schemaVersion: 1, cardId: 'A-S135', workerId: 'worker-A-S135',
    mode: 'actual-browser-on-fixed-fictional-DATA-ONLY',
    observedAtUtc: new Date().toISOString(), nodeVersion: process.version,
    playwrightVersion: require('..\\..\\testing\\browser\\node_modules\\playwright\\package.json').version,
    publishedHelperCommit: '53c0c0d', helperSha256,
    lifecycle: 'Individual bounded feature observations only; unattended lifecycle recovery and inactive prototype remain unqualified.',
    groups: [], pageErrors: [], consoleErrors: [], unexpectedNetworkRequests: [],
    awaitedCleanupCompleted: false,
  };
  let session;
  async function group(name, operation) {
    const observation = { name, passed: false };
    report.groups.push(observation);
    await t.test(name, async () => {
      try { await operation(observation); observation.passed = true; }
      catch (error) {
        observation.failure = { name: error.name, message: error.message };
        throw error;
      }
    });
  }
  try {
    assert.equal(helperSha256, expectedHelperSha256, 'use only the pinned published helper');
    assert.equal(report.playwrightVersion, '1.56.1');
    session = await openIsolatedLesson('learning\\S135\\index.html');
    report.browserVersion = session.browserVersion;
    assert.match(session.browserVersion, /^156\./);
    const page = session.page;
    page.on('pageerror', (error) => report.pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
    await page.route(/^https?:/i, async (route) => {
      report.unexpectedNetworkRequests.push(route.request().url());
      await route.abort('blockedbyclient');
    });
    const value = async (id) => (await page.locator(`#${id}`).textContent()).trim();
    const counts = async () => Object.fromEntries(await Promise.all(
      ['attempt-count', 'event-count', 'positive-count', 'negative-count', 'unknown-count', 'unknown-attempt-count', 'history-count']
        .map(async (id) => [id, await value(id)]),
    ));
    const reset = async () => { await page.locator('#reset-lesson').click(); assert.equal(await value('phase'), 'ready'); };
    const conduct = async (presetId) => {
      await page.locator('#preset').selectOption(presetId);
      for (const id of ['load', 'cutover', 'redeliver', 'measure']) await page.locator(`#${id}`).click();
      assert.equal(await value('phase'), 'measured');
    };

    await group('initial standalone DOM, exact banner, labeled controls and bounded DATA contract', async (observation) => {
      observation.title = await page.title();
      observation.banner = await page.locator('.banner').textContent();
      assert.equal(observation.banner, banner);
      assert.equal(await value('phase'), 'ready');
      assert.equal(await value('positive-count'), '0');
      assert.match(await value('status'), /Not yet verified/);
      assert.equal(await page.getByLabel('Fixed preset DATA', { exact: true }).count(), 1);
      assert.equal(await page.getByLabel('Exact fictional event token', { exact: true }).inputValue(), 'fictional-event-135');
      assert.equal(await page.getByLabel('Original budget DATA in ms', { exact: true }).inputValue(), '1000');
      observation.presets = await page.locator('#preset option').evaluateAll((options) => options.map((option) => option.value));
      assert.deepEqual(observation.presets, ['stable-key', 'versioned-key', 'lost-ack', 'unknown-completion', 'budget-exceeded', 'wrong-effect']);
      for (const id of ['cutover', 'redeliver', 'measure']) assert.equal(await page.locator(`#${id}`).isDisabled(), true);
      assert.equal(await page.locator('a[href]').count(), 0);
      observation.initialCounts = await counts();
    });

    await group('actual Tab and Enter flow measures two attempts but only one correct event result', async (observation) => {
      observation.focusSequence = [];
      for (const id of ['preset', 'event-token', 'budget', 'load']) {
        await page.keyboard.press('Tab');
        const focused = await page.evaluate(() => document.activeElement.id);
        observation.focusSequence.push(focused);
        assert.equal(focused, id);
      }
      observation.outline = await page.locator('#load').evaluate((control) => getComputedStyle(control).outlineWidth);
      assert.equal(observation.outline, '3px');
      await page.keyboard.press('Enter');
      assert.equal(await value('phase'), 'loaded');
      assert.equal(await value('attempt-count'), '1');
      assert.equal(await value('event-count'), '0');
      for (const [id, phase] of [['cutover', 'cutover'], ['redeliver', 'redelivered'], ['measure', 'measured']]) {
        await page.keyboard.press('Tab');
        const focused = await page.evaluate(() => document.activeElement.id);
        observation.focusSequence.push(focused);
        assert.equal(focused, id);
        await page.keyboard.press('Enter');
        assert.equal(await value('phase'), phase);
      }
      observation.counts = await counts();
      assert.deepEqual(observation.counts, {
        'attempt-count': '2', 'event-count': '1', 'positive-count': '1', 'negative-count': '0',
        'unknown-count': '0', 'unknown-attempt-count': '0', 'history-count': '4 / 16',
      });
      observation.attemptRows = await page.locator('#attempt-rows tr').allTextContents();
      observation.resultRow = await page.locator('#result-rows tr').textContent();
      assert.equal(observation.attemptRows.length, 2);
      assert.match(observation.resultRow, /positive \/ verified-positive/);
      assert.equal(await page.locator('#result-rows tr td').nth(4).textContent(), '1', 'latest effect snapshot is one, not additive two');
      assert.equal(await page.locator('#result-rows tr td').nth(5).textContent(), '1', 'one verified correct business result');
    });

    await group('native prototype reset works with an actual form.reset shadow and restores keyboard focus', async (observation) => {
      observation.shadowed = await page.evaluate(() => {
        const control = document.createElement('input');
        control.name = 'reset';
        control.id = 'shadow-reset';
        document.getElementById('controls').append(control);
        return typeof document.getElementById('controls').reset !== 'function';
      });
      assert.equal(observation.shadowed, true);
      await page.locator('#reset-lesson').focus();
      await page.keyboard.press('Enter');
      assert.equal(await value('phase'), 'ready');
      assert.equal(await value('history-count'), '0 / 16');
      assert.equal(await page.locator('#attempt-rows tr').count(), 0);
      assert.equal(await page.locator('#result-rows tr').count(), 0);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'preset');
      assert.equal(await page.locator('#event-token').inputValue(), 'fictional-event-135');
      assert.equal(await page.locator('#budget').inputValue(), '1000');
      observation.counts = await counts();
      observation.focusAfterReset = await page.evaluate(() => document.activeElement.id);
      await page.locator('#shadow-reset').evaluate((control) => control.remove());
    });

    await group('malformed raw budget/token/preset DATA produces visible focused errors without state mutation', async (observation) => {
      observation.rejections = [];
      for (const malformed of ['1000 ', '1e3', '01000', '', '999', 'Infinity', '1000.0']) {
        await page.locator('#budget').fill(malformed);
        await page.locator('#load').click();
        const error = await value('error');
        assert.match(error, /ERR_LESSON_INPUT/);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
        assert.equal(await page.locator('#budget').getAttribute('aria-invalid'), 'true');
        assert.equal(await value('history-count'), '0 / 16');
        assert.equal(await value('positive-count'), '0');
        observation.rejections.push({ input: malformed, error });
      }
      await page.locator('#budget').fill('1000');
      await page.locator('#event-token').fill(' fictional-event-135');
      await page.locator('#load').click();
      assert.match(await value('error'), /no trimming or coercion/);
      assert.equal(await page.locator('#event-token').getAttribute('aria-invalid'), 'true');
      await page.locator('#event-token').fill('fictional-event-135');
      await page.locator('#preset').evaluate((select) => {
        const option = document.createElement('option');
        option.value = 'not-a-fixture';
        option.textContent = 'Evidence-only malformed option';
        select.append(option);
        select.value = 'not-a-fixture';
      });
      await page.locator('#load').click();
      assert.match(await value('error'), /exact fixed preset/);
      assert.equal(await value('phase'), 'ready');
      assert.equal(await value('history-count'), '0 / 16');
      observation.invalidPresetError = await value('error');
      await page.locator('#preset option[value="not-a-fixture"]').evaluate((option) => option.remove());
      await reset();
      assert.equal(await value('error'), '');
    });

    await group('forced out-of-order DOM action is safely rejected and remains disabled', async (observation) => {
      await page.locator('#cutover').evaluate((button) => { button.disabled = false; });
      await page.locator('#cutover').click();
      observation.error = await value('error');
      assert.match(observation.error, /ERR_LESSON_ORDER.*requires phase loaded/);
      assert.equal(await value('phase'), 'ready');
      assert.equal(await value('history-count'), '0 / 16');
      assert.equal(await page.locator('#cutover').isDisabled(), true);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
      await reset();
    });

    await group('actual fixed presets expose positive, duplicate, budget, incorrect-effect and retained unknown outcomes', async (observation) => {
      observation.presets = [];
      const expected = [
        ['stable-key', 'positive / verified-positive', '1', '0', '0', '1'],
        ['versioned-key', 'negative / verified-negative', '0', '1', '0', '2'],
        ['lost-ack', 'unknown / unverified', '0', '0', '1', '1'],
        ['unknown-completion', 'unknown / unverified', '0', '0', '1', '1'],
        ['budget-exceeded', 'negative / verified-negative', '0', '1', '0', '1'],
        ['wrong-effect', 'negative / verified-negative', '0', '1', '0', '1'],
      ];
      for (const [presetId, verdict, positive, negative, unknown, effects] of expected) {
        await reset();
        await conduct(presetId);
        const result = await page.locator('#result-rows tr').textContent();
        assert.equal(await page.locator('#result-rows tr td').nth(7).textContent(), verdict);
        assert.equal(await value('positive-count'), positive);
        assert.equal(await value('negative-count'), negative);
        assert.equal(await value('unknown-count'), unknown);
        assert.equal(await page.locator('#result-rows tr td').nth(4).textContent(), effects);
        assert.equal(await value('event-count'), '1');
        assert.equal(await value('attempt-count'), '2');
        if (presetId === 'lost-ack') {
          assert.equal(await page.locator('#attempt-rows tr').first().locator('td').nth(6).textContent(), 'lost');
          assert.equal(await page.locator('#attempt-rows tr').last().locator('td').nth(6).textContent(), 'received');
          assert.match(result, /ORIGINAL unknown remains unverified/);
        }
        if (presetId === 'unknown-completion') {
          assert.equal(await page.locator('#attempt-rows tr').first().locator('td').nth(5).textContent(), 'unknown');
          assert.equal(await page.locator('#attempt-rows tr').first().locator('td').nth(8).textContent(), 'Unobserved');
          assert.equal(await page.locator('#attempt-rows tr').last().locator('td').nth(8).textContent(), '1');
          assert.match(result, /original completion was unobserved/);
        }
        if (presetId === 'budget-exceeded') assert.match(result, /1250 ms exceeds the ORIGINAL 1000 ms/);
        if (presetId === 'wrong-effect') assert.match(result, /state or result is not/);
        observation.presets.push({ presetId, counts: await counts(), result, attempts: await page.locator('#attempt-rows tr').allTextContents() });
      }
    });

    await group('a later positive run retains all earlier duplicate and lost-ack observations and denominators', async (observation) => {
      await reset();
      await conduct('versioned-key');
      await conduct('lost-ack');
      const prior = await page.locator('#result-rows tr').allTextContents();
      await conduct('stable-key');
      const after = await page.locator('#result-rows tr').allTextContents();
      assert.deepEqual(after.slice(0, 2), prior);
      assert.deepEqual(await counts(), {
        'attempt-count': '6', 'event-count': '3', 'positive-count': '1', 'negative-count': '1',
        'unknown-count': '1', 'unknown-attempt-count': '1', 'history-count': '12 / 16',
      });
      assert.match(after[0], /negative \/ verified-negative/);
      assert.match(after[1], /unknown \/ unverified/);
      assert.match(await page.locator('#history-rows tr').allTextContents().then((rows) => rows.join(' ')), /acknowledgement lost/);
      observation.counts = await counts();
      observation.retainedResults = after;
    });

    await group('sixteenth action is retained and the seventeenth is a visible safe hold until explicit reset', async (observation) => {
      await conduct('stable-key');
      assert.equal(await value('history-count'), '16 / 16');
      assert.equal(await value('attempt-count'), '8');
      assert.equal(await value('event-count'), '4');
      assert.equal(await page.locator('#load').isDisabled(), true);
      assert.match(await value('limit'), /earlier failures and unknowns are not pruned/);
      const prior = await page.locator('#result-rows tr').allTextContents();
      await page.locator('#controls').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      observation.error = await value('error');
      assert.match(observation.error, /ERR_LESSON_LIMIT.*Reset lesson/);
      assert.equal(await value('history-count'), '16 / 16');
      assert.deepEqual(await page.locator('#result-rows tr').allTextContents(), prior);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
      observation.counts = await counts();
      await reset();
      assert.equal(await value('error'), '');
    });

    await group('missing local model fails visibly closed without results, then an ordinary reload recovers the lesson', async (observation) => {
      await page.route('**/model.js', (route) => route.abort('blockedbyclient'));
      try {
        await page.reload({ waitUntil: 'load' });
        observation.error = await value('error');
        observation.status = await value('status');
        assert.match(observation.error, /ERR_LESSON_UNAVAILABLE.*model is unavailable/);
        assert.equal(await value('phase'), 'unavailable');
        assert.equal(await value('positive-count'), '0');
        assert.equal(await value('event-count'), '0');
        for (const id of ['load', 'cutover', 'redeliver', 'measure', 'reset-lesson']) assert.equal(await page.locator(`#${id}`).isDisabled(), true);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
      } finally {
        await page.unroute('**/model.js');
        await page.reload({ waitUntil: 'load' });
      }
      assert.equal(await value('phase'), 'ready');
      observation.recoveredCounts = await counts();
    });

    await group('actual enforced CSP blocks inline script/event, eval, style, DATA connections/images/frames and local form navigation', async (observation) => {
      const beforeURL = page.url();
      await page.evaluate(() => {
        const script = document.createElement('script');
        script.src = new URL('evidence/fixtures/csp-probe.js', document.URL).href;
        document.head.append(script);
      });
      await page.waitForFunction(() => {
        const probe = globalThis.__S135CSPProbe;
        return probe && probe.done && ['connect-src', 'img-src', 'frame-src', 'form-action']
          .every((directive) => probe.violations.some((event) => event.directive === directive))
          && probe.violations.some((event) => event.directive.startsWith('style-src'));
      });
      observation.probe = await page.evaluate(() => ({
        ...globalThis.__S135CSPProbe,
        inlineRan: globalThis.__S135InlineRan === true,
        eventRan: globalThis.__S135InlineEventRan === true,
        evalRan: globalThis.__S135EvalRan === true,
        actualColor: getComputedStyle(document.body).color,
      }));
      assert.equal(observation.probe.inlineRan, false);
      assert.equal(observation.probe.eventRan, false);
      assert.equal(observation.probe.evalRan, false);
      assert.equal(observation.probe.evalBlocked, true);
      assert.equal(observation.probe.connectionBlocked, true);
      assert.equal(observation.probe.actualColor, observation.probe.originalColor);
      for (const directive of ['script-src-elem', 'script-src-attr', 'script-src', 'style-src-elem', 'style-src-attr', 'connect-src', 'img-src', 'frame-src', 'form-action']) {
        assert.equal(observation.probe.violations.some((event) => event.directive === directive && event.disposition === 'enforce'), true, directive);
      }
      assert.equal(page.url(), beforeURL);
      assert.deepEqual(report.unexpectedNetworkRequests, []);
      observation.navigationUnchanged = true;
      await page.reload({ waitUntil: 'load' });
      assert.equal(await value('positive-count'), '0');
    });

    await group('all observations use only local DATA and preserve fail-closed runtime with no unexpected page errors', async (observation) => {
      assert.deepEqual(report.pageErrors, []);
      assert.deepEqual(report.unexpectedNetworkRequests, []);
      assert.equal(await value('phase'), 'ready');
      observation.finalCounts = await counts();
      observation.pageErrors = [...report.pageErrors];
      observation.unexpectedNetworkRequests = [...report.unexpectedNetworkRequests];
    });
    assert.equal(report.groups.every((observation) => observation.passed), true, 'raw report cannot call a failed observation green');
  } catch (error) {
    report.failure = { name: error.name, message: error.message };
    throw error;
  } finally {
    try {
      if (session) {
        await session.close();
        report.awaitedCleanupCompleted = true;
      }
    } catch (error) {
      report.cleanupFailure = { name: error.name, message: error.message };
      throw error;
    } finally {
      if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
        const raw = path.join(__dirname, 'evidence', 'raw');
        fs.mkdirSync(raw, { recursive: true });
        const name = `browser-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}-${randomUUID()}.json`;
        fs.writeFileSync(path.join(raw, name), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
      }
    }
  }
});
