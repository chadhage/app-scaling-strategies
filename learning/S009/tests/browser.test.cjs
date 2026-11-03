'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const toolingRoot = path.resolve(__dirname, '..', '..', '..', 'testing', 'browser');
const { openIsolatedLesson } = require(path.join(toolingRoot, 'isolated.cjs'));

test('real isolated Edge: keyboard, intended responses, discrepancies, effects, unknown, invalid and Reset', { timeout: 60000 }, async () => {
  const report = {
    cardId: 'A-S009',
    kanoUnit: 'A-S009',
    mode: 'isolated-headless',
    engine: 'Microsoft Edge (Chromium)',
    nodeVersion: process.version,
    playwrightVersion: require(require.resolve('playwright/package.json', { paths: [toolingRoot] })).version,
    helper: 'testing\\browser\\isolated.cjs',
    openedPath: 'learning\\S009\\index.html',
    startedAtUtc: new Date().toISOString(),
    passed: false,
    nodeMockUsed: false,
    nativeProof: false,
    checks: []
  };
  let session;
  try {
    session = await openIsolatedLesson('learning\\S009\\index.html');
    const { page, browserVersion } = session;
    report.browserVersion = browserVersion;
    const pageErrors = [];
    const networkRequests = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => {
      if (/^https?:/i.test(request.url())) networkRequests.push('unexpected HTTP(S) request');
    });
    const text = async (id) => (await page.locator('#' + id).textContent()).trim();
    const replay = () => page.locator('#run-shadow').click();
    const counterIds = [
      'request-total', 'match-total', 'discrepant-total', 'unknown-total',
      'expected-writes', 'expected-notifications', 'production-writes', 'production-notifications',
      'shadow-writes', 'shadow-notifications', 'suppressed-writes', 'suppressed-notifications',
      'total-writes', 'total-notifications', 'duplicate-writes', 'duplicate-notifications'
    ];
    const snapshot = () => page.evaluate((ids) => Object.fromEntries(
      ids.map((id) => [id, document.getElementById(id).textContent])
    ), counterIds);

    assert.equal(await text('verdict'), 'NOT RUN');
    assert.equal(await page.locator('.banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
    const methods = await page.locator('#shadow-controls').evaluate((form) => ({
      reset: typeof form.reset, submit: typeof form.submit
    }));
    assert.deepEqual(methods, { reset: 'function', submit: 'function' });
    await page.locator('#production-version').focus();
    const tabOrder = [];
    for (const id of ['profile-id', 'scenario', 'request-count', 'run-shadow']) {
      await page.keyboard.press('Tab');
      const active = await page.evaluate(() => document.activeElement.id);
      tabOrder.push(active);
      assert.equal(active, id);
    }
    const focus = await page.locator('#run-shadow').evaluate((element) => ({
      style: getComputedStyle(element).outlineStyle,
      width: getComputedStyle(element).outlineWidth
    }));
    assert.notEqual(focus.style, 'none');
    assert.ok(parseFloat(focus.width) > 0);
    await page.keyboard.press('Enter');
    assert.equal(await text('verdict'), 'SAFE');
    assert.equal(await text('request-total'), '2');
    assert.equal(await text('total-writes'), '2');
    assert.equal(await text('total-notifications'), '2');
    assert.equal(await text('shadow-writes'), '0');
    assert.equal(await text('shadow-notifications'), '0');
    assert.equal(await text('suppressed-writes'), '2');
    assert.equal(await text('suppressed-notifications'), '2');
    assert.match(await text('production-version-observed'), /^v1/);
    assert.match(await text('candidate-version-observed'), /^v2/);
    report.checks.push({ name: 'keyboard-safe-v1', passed: true, tabOrder, focus, methods, counters: await snapshot() });

    await page.locator('#production-version').selectOption('v2');
    await page.locator('#request-count').fill('1');
    await replay();
    assert.equal(await text('verdict'), 'SAFE');
    assert.match(await text('production-version-observed'), /^v2/);
    assert.match(await text('candidate-version-observed'), /^v1/);
    assert.equal(await text('request-total'), '3');
    assert.equal(await text('duplicate-writes'), '0');
    report.checks.push({ name: 'intended-v2', passed: true, caller: 'v2', candidate: 'v1', counters: await snapshot() });

    await page.locator('#reset-lesson').click();
    await page.locator('#scenario').selectOption('discrepant');
    await page.locator('#request-count').fill('1');
    await replay();
    assert.equal(await text('verdict'), 'DISCREPANT');
    const caller = JSON.parse(await text('production-response'));
    const candidate = JSON.parse(await text('candidate-response'));
    assert.equal(caller.body.membershipTier, 'standard');
    assert.equal(caller.body.loyaltyPoints, 120);
    assert.equal(candidate.body.membershipTier, 'premium');
    assert.equal(candidate.body.loyaltyPoints, 0);
    assert.equal(await page.locator('#difference-rows tr').count(), 2);
    assert.match(await text('difference-rows'), /body\.membershipTier/);
    assert.match(await text('difference-rows'), /body\.loyaltyPoints/);
    assert.equal(await text('shadow-writes'), '0');
    assert.equal(await text('shadow-notifications'), '0');
    report.checks.push({ name: 'discrepant-response', passed: true, caller: caller.body, candidate: candidate.body, changedFields: 2 });

    await page.locator('#scenario').selectOption('unsafe-duplicate');
    assert.match(await text('scenario-help'), /UNSAFE/);
    await page.locator('#request-count').fill('3');
    await replay();
    assert.equal(await text('verdict'), 'UNSAFE');
    assert.match(await text('comparison'), /MATCH/);
    assert.match(await text('comparison'), /DUPLICATED/);
    assert.equal(await text('request-total'), '4');
    assert.equal(await text('total-writes'), '7');
    assert.equal(await text('total-notifications'), '7');
    assert.equal(await text('duplicate-writes'), '3');
    assert.equal(await text('duplicate-notifications'), '3');
    assert.match(await text('production-version-observed'), /^v1/);
    report.checks.push({ name: 'unsafe-duplicate-effects-despite-match', passed: true, verdict: 'UNSAFE', comparison: 'MATCH', counters: await snapshot() });

    await page.locator('#scenario').selectOption('safe');
    await page.locator('#request-count').fill('1');
    await replay();
    assert.equal(await text('verdict'), 'SAFE');
    assert.equal(await text('total-writes'), '8');
    assert.equal(await text('total-notifications'), '8');
    assert.equal(await text('duplicate-writes'), '3');
    assert.equal(await text('duplicate-notifications'), '3');
    assert.match(await text('cumulative-warning'), /UNSAFE history retained/);
    assert.match(await text('request-rows'), /MATCH \/ UNSAFE/);
    report.checks.push({ name: 'safe-retry-retains-unsafe-history', passed: true, counters: await snapshot() });

    await page.locator('#scenario').selectOption('unknown');
    await replay();
    assert.equal(await text('verdict'), 'UNKNOWN');
    assert.match(await text('candidate-response'), /UNKNOWN.*response unavailable/);
    assert.match(await text('comparison'), /comparison: UNKNOWN/);
    assert.match(await text('difference-rows'), /no comparison possible/);
    assert.equal(JSON.parse(await text('production-response')).status, 200);
    assert.equal(await text('unknown-total'), '1');
    assert.equal(await text('shadow-writes'), '3');
    assert.equal(await text('shadow-notifications'), '3');
    assert.equal(await text('suppressed-writes'), '3');
    assert.equal(await text('suppressed-notifications'), '3');
    report.checks.push({ name: 'unknown-candidate-remains-unknown', passed: true, counters: await snapshot() });

    const beforeInvalid = await snapshot();
    const historyBeforeInvalid = await text('request-rows');
    const invalidCounts = ['', '1.5', '4', '-1', 'NaN', ' 2 '];
    for (const value of invalidCounts) {
      await page.locator('#request-count').fill(value);
      await replay();
      assert.equal(await text('verdict'), 'INVALID', `invalid count ${JSON.stringify(value)}`);
      assert.deepEqual(await snapshot(), beforeInvalid);
      assert.equal(await text('request-rows'), historyBeforeInvalid);
    }
    await page.locator('#request-count').fill('1');
    await page.locator('#profile-id').selectOption('invalid-fixture');
    await replay();
    assert.equal(await text('verdict'), 'INVALID');
    assert.deepEqual(await snapshot(), beforeInvalid);
    assert.equal(await text('request-rows'), historyBeforeInvalid);
    assert.match(await text('last-executed'), /Retained from before the INVALID attempt/);
    report.checks.push({ name: 'invalid-counts-and-profile-preserve-all-evidence', passed: true, invalidCounts, invalidProfile: 'invalid-fixture', counters: await snapshot() });

    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'reset-lesson');
    await page.keyboard.press('Enter');
    assert.equal(await text('verdict'), 'NOT RUN');
    assert.ok(Object.values(await snapshot()).every((value) => value === '0'));
    assert.equal(await page.locator('#production-version').inputValue(), 'v1');
    assert.equal(await page.locator('#profile-id').inputValue(), 'synthetic-rowan');
    assert.equal(await page.locator('#scenario').inputValue(), 'safe');
    assert.equal(await page.locator('#request-count').inputValue(), '2');
    assert.equal(await text('production-response'), 'Not run.');
    assert.equal(await text('candidate-response'), 'Not run.');
    assert.equal(await text('difference-rows'), 'Not run.');
    assert.equal(await text('request-rows'), 'No requests.');
    assert.equal(await text('cumulative-warning'), 'No synthetic effects recorded.');
    assert.match(await text('live-status'), /Reset complete/);
    report.checks.push({ name: 'keyboard-reset-clears-all-state-and-defaults', passed: true, counters: await snapshot() });

    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    assert.ok(csp.includes("connect-src 'none'") && csp.includes("form-action 'none'"));
    const remoteResourceCount = await page.evaluate(() => performance.getEntriesByType('resource')
      .filter((entry) => /^https?:/i.test(entry.name)).length);
    assert.equal(remoteResourceCount, 0);
    assert.deepEqual(networkRequests, []);
    assert.deepEqual(pageErrors, []);
    report.checks.push({ name: 'local-csp-no-http-and-no-page-errors', passed: true, remoteResourceCount, networkRequests: 0, pageErrors: 0 });
    report.passed = true;
  } finally {
    try {
      if (session) {
        await session.close();
        report.sessionClosed = true;
      }
    } finally {
      report.endedAtUtc = new Date().toISOString();
      fs.writeFileSync(path.join(__dirname, '..', 'evidence', 'browser-observations.json'), JSON.stringify(report, null, 2) + '\n');
    }
  }
});
