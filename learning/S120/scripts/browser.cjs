'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sha256, capture } = require('./evidence.cjs');
const repo = path.resolve(__dirname, '..', '..', '..');
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const expectedHelperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const report = {
  cardId: 'A-S120', workerId: 'worker-A-S120', packet: 'SC-S120',
  mode: 'actual local DOM observations of fixed synthetic lesson data',
  startedAtUtc: new Date().toISOString(), success: false, groups: [],
  tooling: { node: process.version, productionNode24Validated: false, helperSha256: sha256(fs.readFileSync(helper)), helperRevision: '53c0c0d82cc1db6780a87ac2b1085734af6d5c60' },
  evidenceLimit: 'No live Azure, native proof, five-nines qualification, lifecycle-prototype qualification, or source-parent completion.'
};
let stage = 'tooling';

async function main() {
  assert.equal(report.tooling.helperSha256, expectedHelperHash, 'only the published pinned helper is permitted');
  report.tooling.playwright = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
  assert.equal(report.tooling.playwright, '1.56.1');
  const { openIsolatedLesson } = require(helper);
  let session;
  const pageErrors = [];
  const requests = [];
  const failedRequests = [];
  try {
    session = await openIsolatedLesson(path.join('learning', 'S120', 'index.html'));
    report.tooling.edge = session.browserVersion;
    const page = session.page;
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => requests.push(request.url()));
    page.on('requestfailed', (request) => failedRequests.push({ url: request.url(), error: request.failure().errorText }));
    const text = async (selector) => (await page.locator(selector).textContent()).trim();
    const group = async (name, action) => {
      stage = name;
      const observed = await action();
      report.groups.push({ name, passed: true, observed });
    };
    await group('load and exact training scope', async () => {
      assert.equal(await text('#training-banner'), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.title(), 'S120 - No viable destination');
      assert.match(await text('#load-status'), /fixture loaded/i);
      assert.equal(await text('#verification'), 'unverified');
      assert.equal(await text('#viable-count'), 'Viable destinations: 2');
      assert.equal(await page.locator('#observe').isEnabled(), true);
      return { banner: await text('#training-banner'), title: await page.title(), load: await text('#load-status') };
    });
    await group('supported positive control is not a migration', async () => {
      await page.locator('#observe').click();
      assert.equal(await text('#counts'), '2 attempted · 2 succeeded · 0 interrupted · 0 unknown');
      assert.equal(await text('#affected'), '0 affected attempts · 0 successful migrations');
      assert.equal(await page.locator('#attempts tr').count(), 2);
      return { counts: await text('#counts'), sample: await text('#affected'), receipts: await text('#attempts') };
    });
    await group('keyboard, strict removal and text-only errors', async () => {
      await page.locator('#remove-destination').focus();
      await page.keyboard.press('Enter');
      assert.match(await text('#error'), /boolean true/i);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'confirm-remove');
      assert.equal(await text('#viable-count'), 'Viable destinations: 2');
      const payload = '<img src=x onerror=window.__unsafe=true>';
      await page.evaluate((value) => { document.getElementById('destination').options[0].value = value; }, payload);
      await page.locator('#confirm-remove').focus();
      await page.keyboard.press('Space');
      await page.locator('#remove-destination').focus();
      await page.keyboard.press('Enter');
      assert.match(await text('#error'), /owned fictional destination/i);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'destination');
      assert.equal(await page.locator('#error img').count(), 0);
      assert.equal(await page.evaluate(() => window.__unsafe), undefined);
      await page.evaluate(() => { document.getElementById('destination').options[0].value = 'origin-a'; });
      await page.locator('#confirm-remove').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'remove-destination');
      await page.keyboard.press('Enter');
      assert.equal(await text('#viable-count'), 'Viable destinations: 1');
      assert.equal(await page.locator('#error').isHidden(), true);
      await page.locator('#observe').click();
      assert.equal(await text('#counts'), '4 attempted · 4 succeeded · 0 interrupted · 0 unknown');
      assert.match(await text('#attempts'), /origin-b/);
      return { keyboardDestination: 'remove-destination', malformedInputRenderedAsHTML: false, counts: await text('#counts'), inventory: await text('#inventory') };
    });
    await group('total loss: passing negative verifier, interrupted users and unknown write', async () => {
      await page.locator('#destination').selectOption('origin-b');
      await page.locator('#remove-destination').focus();
      await page.keyboard.press('Enter');
      assert.equal(await text('#viable-count'), 'Viable destinations: 0');
      await page.locator('#observe').click();
      await page.locator('#verify').click();
      assert.equal(await text('#verification'), 'pass');
      assert.equal(await text('#user-impact'), 'interrupted');
      assert.match(await text('#envelope'), /unsupported.*no viable destination/i);
      assert.equal(await text('#counts'), '7 attempted · 4 succeeded · 2 interrupted · 1 unknown');
      assert.equal(await text('#affected'), '3 affected attempts · 0 successful migrations');
      assert.match(await text('#attempts'), /unknown/);
      assert.match(await text('#attempts'), /503/);
      assert.match(await text('#effects'), /unresolved/);
      return { verification: await text('#verification'), impact: await text('#user-impact'), counts: await text('#counts'), affected: await text('#affected'), envelope: await text('#envelope'), receipts: await text('#attempts'), effects: await text('#effects') };
    });
    await group('incorrect zero-downtime claim genuinely fails', async () => {
      await page.locator('#claim').selectOption('zero-downtime');
      await page.locator('#verify').click();
      assert.equal(await text('#verification'), 'fail');
      assert.equal(await text('#user-impact'), 'interrupted');
      assert.equal(await text('#affected'), '3 affected attempts · 0 successful migrations');
      return { verification: await text('#verification'), impact: await text('#user-impact'), reason: await text('#reason') };
    });
    await group('blind retry and unreconciled recovery are rejected without effects', async () => {
      const before = await text('#effects');
      await page.locator('#retry').click();
      assert.match(await text('#error'), /unknown acknowledgment.*new mutation/i);
      await page.locator('#recover').click();
      assert.match(await text('#error'), /boolean true/i);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'reconcile');
      assert.equal(await text('#viable-count'), 'Viable destinations: 0');
      assert.equal(await text('#effects'), before);
      return { error: await text('#error'), effectsUnchanged: true, correctionFocus: await page.evaluate(() => document.activeElement.id) };
    });
    await group('owned recovery preserves prior interruptions and uncertainty', async () => {
      await page.locator('#reconcile').focus();
      await page.keyboard.press('Space');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'recover');
      await page.keyboard.press('Enter');
      await page.locator('#observe').click();
      await page.locator('#claim').selectOption('expected-interruption');
      await page.locator('#verify').click();
      assert.equal(await text('#viable-count'), 'Viable destinations: 1');
      assert.equal(await text('#verification'), 'pass');
      assert.equal(await text('#user-impact'), 'interrupted');
      assert.equal(await text('#counts'), '9 attempted · 6 succeeded · 2 interrupted · 1 unknown');
      assert.equal(await text('#affected'), '3 affected attempts · 0 successful migrations');
      assert.match(await text('#cleanup'), /owned fixture recovered: origin-a/);
      assert.match(await text('#envelope'), /unsupported/);
      assert.equal(await page.locator('#effects li[data-effect="pending-commit"]').count(), 1);
      assert.match(await text('#inventory'), /origin-b.*unavailable/s);
      return { counts: await text('#counts'), cleanup: await text('#cleanup'), sample: await text('#affected'), receipts: await text('#attempts'), effects: await text('#effects') };
    });
    await group('native reset, retained receipts, keyboard history and bounded archives', async () => {
      assert.equal(await page.evaluate(() => Array.from(document.forms).every((form) => typeof form.reset === 'function')), true);
      await page.locator('#start-over').click();
      assert.equal(await text('#counts'), '0 attempted · 0 succeeded · 0 interrupted · 0 unknown');
      assert.equal(await text('#viable-count'), 'Viable destinations: 2');
      assert.equal(await text('#history-count'), '1 / 5 archived runs');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'destination');
      assert.equal(await page.locator('#confirm-remove').isChecked(), false);
      assert.equal(await page.locator('#reconcile').isChecked(), false);
      assert.equal(await page.locator('#claim').inputValue(), 'expected-interruption');
      assert.match(await text('#history'), /9 attempted · 6 succeeded · 2 interrupted · 1 unknown/);
      await page.locator('#history summary').first().focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#history details').first().getAttribute('open'), '');
      assert.equal(await page.locator('#history details').first().locator('tbody tr').count(), 9);
      for (let index = 1; index < 5; index++) await page.locator('#start-over').click();
      await page.locator('#start-over').click();
      assert.equal(await text('#history-count'), '5 / 5 archived runs');
      assert.match(await text('#error'), /history.*full/i);
      assert.match(await text('#history'), /unknown/);
      return { history: await text('#history-count'), nativeResetCallable: true, fullHistoryError: await text('#error'), priorResult: await page.locator('#history summary').first().textContent() };
    });
    await group('actual CSP enforcement without external network requests', async () => {
      const before = page.url();
      await page.evaluate(() => {
        window.__csp = { violations: [], evalBlocked: false, connectBlocked: false, done: false };
        document.addEventListener('securitypolicyviolation', (event) => {
          window.__csp.violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        const probe = document.createElement('script');
        probe.src = new URL('scripts/csp-probe.js', window.location.href).href;
        document.body.append(probe);
      });
      await page.waitForFunction(() => window.__csp.done && window.__csp.violations.length >= 4);
      const observed = await page.evaluate(() => ({ ...window.__csp, inlineRan: window.__inlineRan === true, evalRan: window.__evalRan === true }));
      assert.equal(observed.inlineRan, false);
      assert.equal(observed.evalRan, false);
      assert.equal(observed.evalBlocked, true);
      assert.equal(observed.connectBlocked, true);
      for (const directive of ['script-src-elem', 'script-src', 'connect-src', 'form-action']) {
        assert.ok(observed.violations.some((item) => item.directive === directive), `missing observed ${directive} enforcement`);
      }
      assert.equal(page.url(), before);
      assert.ok(requests.every((url) => url.startsWith('file:')), 'no external request may leave the lesson');
      return observed;
    });
    await group('actual blocked-script load failure remains disabled and unverified', async () => {
      await page.route((url) => url.pathname.endsWith('/model.js'), (route) => route.abort('failed'));
      await page.reload({ waitUntil: 'load' });
      assert.match(await text('#load-status'), /failed.*unverified/i);
      assert.equal(await page.locator('#observe').isDisabled(), true);
      assert.equal(await page.locator('#start-over').isDisabled(), true);
      assert.equal(await text('#verification'), 'unverified');
      assert.ok(failedRequests.some((item) => item.url.endsWith('/model.js')));
      assert.deepEqual(pageErrors, []);
      return { load: await text('#load-status'), controlsDisabled: true, verification: await text('#verification'), failedRequests, pageErrors };
    });
    report.requests = requests;
  } finally {
    stage = report.groups.length === 10 ? 'cleanup' : stage;
    if (session) await session.close();
    report.cleanupAwaited = true;
  }
  report.success = true;
}

main().catch((error) => {
  report.failure = { stage, name: error.name, code: error.code || null, message: error.message, stack: error.stack };
  process.exitCode = 1;
}).finally(() => {
  report.finishedAtUtc = new Date().toISOString();
  const captured = capture(report);
  console.log(JSON.stringify({ ...report, captured }, null, 2));
});
