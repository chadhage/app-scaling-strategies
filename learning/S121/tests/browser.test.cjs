'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const evidence = require(path.join(__dirname, '..', 'scripts', 'evidence.cjs'));
const helper = path.join(evidence.REPO, 'testing', 'browser', 'isolated.cjs');
assert.equal(evidence.sha256(fs.readFileSync(helper)), evidence.HELPER_SHA256);
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(evidence.REPO, 'testing', 'browser',
  'node_modules', 'playwright', 'package.json')).version;

test('actual DOM/keyboard/error/reset/failure/CSP on the published isolated helper', { timeout: 100000 }, async () => {
  const before = evidence.treeHashes();
  const startedAtUtc = new Date().toISOString();
  const session = await openIsolatedLesson('learning\\S121\\index.html');
  const browser = session.page.context().browser();
  const groups = [];
  const pageErrors = [];
  const nonFileRequests = [];
  const page = session.page;
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    if (!request.url().startsWith('file:')) nonFileRequests.push(request.url());
  });
  const read = (id) => page.locator(`#${id}`).textContent();
  const focused = () => page.evaluate(() => document.activeElement.id);
  const group = async (name, run) => groups.push({ name, passed: true, details: await run() });
  const reload = async () => {
    await page.reload({ waitUntil: 'load' });
    await page.locator('body[data-ready="true"]').waitFor();
  };
  const selectCase = async (fixture, target = 'production', fresh = true) => {
    if (fresh) await reload();
    await page.locator('#fixture').selectOption(fixture);
    await page.locator('#target').selectOption(target);
    await page.locator('#synthetic-ack').check();
    await page.locator('#configure').click();
    await page.locator('#inspect').click();
  };
  const finishCase = async (fixture, fresh = true) => {
    await selectCase(fixture, 'production', fresh);
    await page.locator('#request-promotion').click();
    await page.locator('#observe').click();
  };
  const noNative = async () => {
    const claim = await read('native-claim');
    assert.equal(claim, 'UNVERIFIED — no live Azure evidence');
    return claim;
  };
  try {
    await group('load-banner-and-boundary', async () => {
      assert.equal(playwrightVersion, '1.56.1');
      assert.match(session.browserVersion, /^156\./);
      assert.match(process.version, /^v22\./);
      const banner = await read('training-banner');
      assert.equal(banner, 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.title(), 'S121 — Windows code-slot promotion rehearsal');
      assert.equal(await read('phase'), 'baseline');
      assert.equal(await page.locator('#fixture option').count(), 9);
      assert.equal(await page.locator('#lesson-form [name="reset"]').count(), 0);
      assert.equal(await page.evaluate(() => typeof document.getElementById('lesson-form').reset), 'function');
      assert.equal(await page.locator('#action-status').getAttribute('role'), 'status');
      assert.equal(await page.locator('#input-error').getAttribute('role'), 'alert');
      return { banner, phase: await read('phase'), nativeClaim: await noNative(),
        allowance: await read('allowance') };
    });
    await group('keyboard-positive-prepared', async () => {
      await page.locator('#fixture').focus();
      await page.keyboard.press('Tab');
      assert.equal(await focused(), 'target');
      await page.keyboard.press('Tab');
      assert.equal(await focused(), 'synthetic-ack');
      await page.keyboard.press('Space');
      assert.equal(await page.locator('#synthetic-ack').isChecked(), true);
      await page.keyboard.press('Tab');
      assert.equal(await focused(), 'configure');
      await page.keyboard.press('Enter');
      assert.equal(await read('phase'), 'configured');
      assert.equal(await focused(), 'inspect');
      await page.keyboard.press('Enter');
      assert.equal(await read('phase'), 'prepared');
      assert.equal(await focused(), 'request-promotion');
      const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineWidth);
      assert.equal(outline, '3px');
      assert.equal(await page.locator('#gates tr').count(), 8);
      const verdicts = await page.locator('#gates tr td:last-child').allTextContents();
      assert.ok(verdicts.every((value) => value === 'pass'));
      assert.equal(await page.locator('#history > li').count(), 2);
      assert.match(await read('configuration-receipt'), /DATA ONLY: Windows\/code/);
      return { phase: await read('phase'), focus: await focused(), focusOutline: outline,
        keyboard: ['Tab', 'Tab', 'Space', 'Tab', 'Enter', 'Enter'], verdicts,
        effectiveConfiguration: await read('configuration-receipt') };
    });
    await group('wished-is-not-observed', async () => {
      await page.keyboard.press('Enter');
      assert.equal(await read('phase'), 'promotion-requested');
      assert.match(await read('desired-routing'), /win-code-v2/);
      assert.match(await read('observed-routing'), /win-code-v1/);
      assert.equal(await read('counts'), '0 / 0 / 0 / 0');
      assert.match(await read('verification'), /^PENDING/);
      assert.equal(await page.locator('#journeys tr').count(), 0);
      assert.equal(await focused(), 'observe');
      return { phase: await read('phase'), desired: await read('desired-routing'),
        observed: await read('observed-routing'), counts: await read('counts'),
        nativeClaim: await noNative() };
    });
    await group('completed-synthetic-journeys', async () => {
      await page.keyboard.press('Enter');
      assert.equal(await read('phase'), 'measured');
      assert.equal(await focused(), 'result-heading');
      assert.equal(await read('classification'), 'uninterrupted-rehearsal');
      assert.equal(await read('counts'), '3 / 3 / 0 / 0');
      assert.match(await read('verification'), /^PASS/);
      assert.equal(await page.locator('#journeys tr').count(), 3);
      const receipts = await page.locator('#journeys tr').allTextContents();
      assert.ok(receipts.every((value) => value.includes('win-code-v2') && value.includes('successful')));
      assert.equal(await page.locator('#history > li').count(), 4);
      return { classification: await read('classification'), counts: await read('counts'),
        fraction: await read('fraction'), receipts, focus: await focused(), nativeClaim: await noNative() };
    });
    await group('reset-retains-evidence-and-allowance', async () => {
      await page.locator('#reset-lesson').focus();
      await page.keyboard.press('Enter');
      assert.equal(await read('phase'), 'baseline');
      assert.equal(await focused(), 'fixture');
      assert.equal(await page.locator('#synthetic-ack').isChecked(), false);
      assert.equal(await page.locator('#fixture').inputValue(), 'ready');
      assert.equal(await page.locator('#target').inputValue(), 'production');
      assert.equal(await page.locator('#history > li').count(), 4);
      assert.equal(await page.locator('#gates tr').count(), 0);
      assert.equal(await page.locator('#journeys tr').count(), 0);
      assert.equal(await read('counts'), '0 / 0 / 0 / 0');
      assert.match(await read('allowance'), /^12 accepted/);
      assert.match(await page.locator('#history > li:last-child pre').textContent(), /"successful": 3/);
      return { phase: await read('phase'), status: await read('action-status'),
        allowance: await read('allowance'), retainedHistoryRows: await page.locator('#history > li').count() };
    });
    await group('acknowledgement-error-recovery', async () => {
      await page.locator('#configure').click();
      assert.match(await read('input-error'), /Acknowledge the synthetic-only boundary/);
      assert.equal(await focused(), 'synthetic-ack');
      assert.equal(await page.locator('#synthetic-ack').getAttribute('aria-invalid'), 'true');
      assert.equal(await read('phase'), 'baseline');
      assert.equal(await page.locator('#history > li').count(), 4);
      const error = await read('input-error');
      await page.keyboard.press('Space');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      assert.equal(await read('phase'), 'configured');
      assert.equal(await page.locator('#input-error').isHidden(), true);
      assert.equal(await page.locator('#synthetic-ack').getAttribute('aria-invalid'), null);
      await page.locator('#reset-lesson').click();
      return { error, recovered: true, retainedHistoryRows: await page.locator('#history > li').count() };
    });
    await group('typed-selection-error-recovery', async () => {
      await reload();
      await page.evaluate(() => {
        const option = document.createElement('option');
        option.value = 'not-a-fixed-case';
        option.textContent = '<invalid teaching case>';
        const select = document.getElementById('fixture');
        select.append(option);
        select.value = option.value;
      });
      await page.locator('#synthetic-ack').check();
      await page.locator('#configure').click();
      assert.match(await read('input-error'), /exact fixed teaching case/);
      assert.equal(await read('phase'), 'baseline');
      assert.equal(await focused(), 'fixture');
      assert.equal(await page.locator('#fixture').getAttribute('aria-invalid'), 'true');
      assert.equal(await page.locator('#history > li').count(), 0);
      const error = await read('input-error');
      await page.locator('#reset-lesson').click();
      assert.equal(await page.locator('#fixture option').count(), 9);
      assert.equal(await page.locator('#fixture').inputValue(), 'ready');
      assert.equal(await page.locator('#input-error').isHidden(), true);
      return { error, focusAfterReset: await focused(), recoveredFixedOptions: 9 };
    });
    for (const [name, fixture, target, classification, text] of [
      ['production-target-negative', 'ready', 'staging', 'safe-abort', 'Production target'],
      ['declared-configuration-unknown', 'declared-only', 'production', 'unverified', 'UNKNOWN: no effective configuration receipt'],
      ['healthy-200-negative', 'shallow-200', 'production', 'safe-abort', 'shallow HTTP 200; dependency check failed'],
      ['effective-setting-negative', 'setting-mismatch', 'production', 'safe-abort', 'profile-store=isolated-empty-store'],
      ['state-compatibility-negative', 'incompatible-state', 'production', 'safe-abort', 'session decoder rejected schema v1'],
    ]) {
      await group(name, async () => {
        await selectCase(fixture, target);
        assert.equal(await read('phase'), 'blocked');
        assert.equal(await read('classification'), classification);
        assert.equal(await read('counts'), '0 / 0 / 0 / 0');
        assert.equal(await page.locator('#request-promotion').isDisabled(), true);
        assert.ok((await page.locator('#gates').textContent()).includes(text));
        assert.match(await read('fraction'), /no migration proof/);
        assert.match(await read('verification'), /^PASS/);
        if (fixture === 'shallow-200') {
          const warmup = page.locator('#gates tr').filter({ hasText: 'Strict warm-up path' });
          assert.match(await warmup.textContent(), /HTTP 200/);
          assert.equal(await warmup.locator('td:last-child').textContent(), 'pass');
        }
        return { fixture, target, phase: await read('phase'), classification: await read('classification'),
          counts: await read('counts'), gates: await page.locator('#gates tr').allTextContents(),
          nativeClaim: await noNative() };
      });
    }
    for (const [name, fixture] of [
      ['missing-routing-unknown', 'missing-routing'],
      ['unfinished-journey-unknown', 'unfinished'],
      ['pinned-client-no-migration-proof', 'pinned-old'],
    ]) {
      await group(name, async () => {
        await finishCase(fixture);
        assert.equal(await read('classification'), 'unverified-transition');
        assert.equal(await read('counts'), '3 / 2 / 0 / 1');
        assert.match(await page.locator('#journeys tr:last-child').textContent(), /unknown/);
        assert.equal(await page.locator('#history > li').count(), 4);
        return { fixture, classification: await read('classification'), counts: await read('counts'),
          observedRouting: await read('observed-routing'),
          finalReceipt: await page.locator('#journeys tr:last-child').textContent(), nativeClaim: await noNative() };
      });
    }
    await group('former-worker-failure-retained', async () => {
      await finishCase('recycled-worker');
      assert.equal(await read('classification'), 'interrupted-rehearsal');
      assert.equal(await read('counts'), '3 / 2 / 1 / 0');
      assert.match(await read('configuration-receipt'), /old slot retained/);
      const failedReceipt = await page.locator('#journeys tr:last-child').textContent();
      assert.match(failedReceipt, /235 \/ 500/);
      assert.match(failedReceipt, /former worker recycled; volatile work abandoned/);
      assert.match(await read('verification'), /^PASS/);
      await page.locator('#reset-lesson').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#history > li').count(), 4);
      assert.match(await read('allowance'), /^12 accepted/);
      const summary = page.locator('#history > li:last-child summary');
      await summary.focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#history > li:last-child details').getAttribute('open'), '');
      const retained = await page.locator('#history > li:last-child pre').textContent();
      assert.match(retained, /"interrupted": 1/);
      assert.match(retained, /"workerWork": "abandoned"/);
      assert.equal(await read('phase'), 'baseline');
      return { failedReceipt, retainedFailedReceiptVisible: true, countsBeforeReset: '3 / 2 / 1 / 0',
        retainedHistoryRows: 4, allowance: await read('allowance'), nativeClaim: await noNative() };
    });
    await group('exhausted-allowance-error-reset', async () => {
      await reload();
      for (let run = 0; run < 4; run++) {
        await finishCase('recycled-worker', false);
        await page.locator('#reset-lesson').click();
      }
      assert.equal(await page.locator('#history > li').count(), 16);
      assert.match(await read('allowance'), /^0 accepted/);
      await page.locator('#synthetic-ack').check();
      await page.locator('#configure').click();
      assert.match(await read('input-error'), /allowance is exhausted/);
      assert.equal(await focused(), 'input-error');
      assert.equal(await page.locator('#history > li').count(), 16);
      const error = await read('input-error');
      await page.locator('#reset-lesson').click();
      assert.equal(await read('phase'), 'baseline');
      assert.match(await read('allowance'), /^0 accepted/);
      assert.equal(await page.locator('#history > li').count(), 16);
      return { error, allowanceAfterReset: await read('allowance'),
        retainedHistoryRows: 16, nativeClaim: await noNative() };
    });
    await group('real-CSP-enforcement', async () => {
      const probe = pathToFileURL(path.join(evidence.ROOT, 'scripts', 'csp-probe.js')).href;
      await page.addScriptTag({ url: probe });
      await page.locator('#run-csp-probe').click();
      await page.locator('#run-csp-probe[data-complete="true"]').waitFor();
      const result = await page.evaluate(() => globalThis.s121CspObservation);
      console.log(JSON.stringify({ actualPageOwnedCspObservation: result }));
      for (const property of ['inlineBlocked', 'handlerBlocked', 'evalBlocked', 'connectBlocked']) {
        assert.equal(result[property], true, `Actual CSP did not block ${property}`);
      }
      const observed = new Set(result.violations.map((entry) => entry.effectiveDirective));
      for (const directive of ['script-src-elem', 'script-src-attr', 'script-src', 'connect-src']) {
        assert.ok(observed.has(directive), `Missing actual ${directive} enforcement observation.`);
      }
      assert.ok(result.violations.every((entry) => entry.disposition === 'enforce'));
      return result;
    });
    assert.deepEqual(groups.map((entry) => entry.name), evidence.BROWSER_GROUPS);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(nonFileRequests, []);
  } finally {
    await session.close();
  }
  assert.equal(session.page.isClosed(), true);
  assert.equal(browser.isConnected(), false);
  assert.deepEqual(evidence.treeHashes(), before, 'Browser verification must not modify any owned file.');
  const record = {
    cardId: 'A-S121', workerId: 'worker-A-S121', packet: 'SC-S121', sourceId: 'S121',
    mode: 'actual isolated file-browser observation of fixed fictional teaching DATA',
    startedAtUtc, finishedAtUtc: new Date().toISOString(),
    nodeVersion: process.version, playwrightVersion, browserVersion: session.browserVersion,
    helper: { path: 'testing\\browser\\isolated.cjs', publishedCommit: '53c0c0d',
      rawSha256: evidence.HELPER_SHA256, api: 'openIsolatedLesson; awaited finally close',
      lifecyclePrototypeQualified: false },
    groups, pageErrors, nonFileRequests,
    cleanup: { awaitedFinallyClose: true, pageClosed: session.page.isClosed(), browserDisconnected: !browser.isConnected() },
    verificationReadOnlyBeforeCapture: true, nativeClaim: false,
    sourceParentComplete: false, fiveNinesProven: false, additionalKanoCredits: 0,
  };
  const output = evidence.captureRequested(process.env.CAPTURE_BROWSER_EVIDENCE)
    ? evidence.captureBrowser(record) : null;
  console.log(JSON.stringify({ ...record, deliberateCapture: output !== null, output }, null, 2));
});
