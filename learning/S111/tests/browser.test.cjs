'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const { sha256, captureEnabled, ownedSnapshot, writeBrowserEvidence } = require(path.join(root, 'tools', 'proof.cjs'));
const helperPath = path.join(repo, 'testing', 'browser', 'isolated.cjs');
assert.equal(sha256(fs.readFileSync(helperPath)), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helperPath);
const playwrightVersion = JSON.parse(fs.readFileSync(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json'), 'utf8')).version;
assert.equal(playwrightVersion, '1.56.1');

test('actual isolated Edge DOM, keyboard, synthetic failures, guards, reset, history and CSP', { timeout: 150000 }, async t => {
  const before = ownedSnapshot();
  const checks = [];
  const pageErrors = [];
  const consoleErrors = [];
  const requestProtocols = [];
  let externalRequests = 0;
  let session;
  let browserVersion;
  let closed = false;

  async function group(name, fn) {
    let failure;
    await t.test(name, async () => {
      try {
        const observed = await fn();
        checks.push({ name, passed: true, observed });
      } catch (error) {
        failure = error;
        throw error;
      }
    });
    if (failure) throw failure;
  }

  try {
    session = await openIsolatedLesson(path.join('learning', 'S111', 'index.html'));
    browserVersion = session.browserVersion;
    assert.match(browserVersion, /^156\./);
    const page = session.page;
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('request', request => {
      const protocol = new URL(request.url()).protocol;
      requestProtocols.push(protocol);
      if (protocol === 'http:' || protocol === 'https:') externalRequests++;
    });
    await page.reload({ waitUntil: 'load' });
    const text = id => page.locator(`#${id}`).innerText();
    const phase = expected => page.waitForFunction(value => document.getElementById('phase').textContent.startsWith(`Phase: ${value}.`), expected);
    async function key(id, keyName = 'Enter') {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press(keyName);
    }
    async function begin(fixture, scopeClaim = 'application-worker') {
      await page.locator('#fixture').selectOption(fixture);
      await page.locator('#scope-claim').selectOption(scopeClaim);
      await page.locator('#begin').click();
      await phase('baseline');
    }
    async function observeLoss() {
      await page.locator('#observe-baseline').click();
      await page.locator('#record-loss').click();
      await page.locator('#measure').click();
      await phase('measured');
    }
    async function reset(recover = true) {
      if (recover) {
        await page.locator('#recover').click();
        await phase('recovered');
      }
      await page.locator('#reset-lesson').click();
      await phase('ready');
    }

    await group('loaded local assets, exact banner and honest failure-domain labels', async () => {
      assert.equal(await text('banner'), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.locator('#boot-error').isHidden(), true);
      assert.equal(await page.locator('#topology tr').count(), 4);
      assert.match(await text('topology'), /same-node, same-zone survivor/);
      assert.match(await text('topology'), /readiness and capacity unverified/);
      assert.match(await text('scope-limit'), /Node, zone and region outage tolerance: unverified/);
      assert.equal(await page.locator('#begin').isEnabled(), true);
      for (const id of ['observe-baseline', 'record-loss', 'measure', 'recover', 'reset-lesson']) assert.equal(await page.locator(`#${id}`).isDisabled(), true);
      assert.equal(await page.locator('#error').isHidden(), true);
      return { title: await page.title(), banner: await text('banner'), topology: await text('topology'), scopeLimit: await text('scope-limit') };
    });

    await group('native keyboard positive path requires explicit baseline and post-loss observation', async () => {
      await page.locator('#fixture').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'scope-claim');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'begin');
      await page.keyboard.press('Enter');
      await phase('baseline');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'feedback');
      assert.match(await text('status'), /unknown/);
      await key('observe-baseline', 'Space');
      await phase('loss-ready');
      assert.match(await text('metrics'), /baseline: 120/);
      await key('record-loss');
      await phase('awaiting-measurement');
      assert.equal(await page.locator('#journeys tr').count(), 0);
      assert.match(await text('status'), /unknown/);
      await key('measure', 'Space');
      await phase('measured');
      assert.match(await text('status'), /Overall: positive.*contract: positive.*Scope claim: positive/);
      assert.match(await text('metrics'), /capacity: 80.*6 success, 0 interruption, 0 unknown/);
      assert.equal(await page.locator('#journeys tr').count(), 6);
      assert.deepEqual(await page.locator('#journeys td:nth-child(6)').allTextContents(), Array(6).fill('success'));
      assert.match(await text('scope-results'), /Same-node worker-b is observed serving/);
      assert.match(await text('scope-results'), /Same-zone worker-b is observed serving/);
      assert.match(await text('scope-limit'), /unverified/);
      return { status: await text('status'), metrics: await text('metrics'), journeys: await text('journeys'), domains: await text('scope-results'), focused: await page.evaluate(() => document.activeElement.id) };
    });

    await group('keyboard fictional recovery and native reset preserve earlier positive history', async () => {
      await key('recover');
      await phase('recovered');
      assert.match(await text('recovery'), /capacity 120.*6 success, 0 interruption, 0 unknown.*unchanged/);
      const recovery = await text('recovery');
      await key('reset-lesson', 'Space');
      await phase('ready');
      assert.equal(await page.locator('#fixture').inputValue(), 'redundant');
      assert.equal(await page.locator('#scope-claim').inputValue(), 'application-worker');
      assert.equal(await page.locator('#history li').count(), 1);
      assert.match(await text('history'), /loss result positive.*recovery positive.*evidence retained/);
      assert.equal(await page.locator('#begin').isEnabled(), true);
      assert.equal(await page.locator('#measure').isDisabled(), true);
      return { recovery, history: await text('history'), controls: await text('phase') };
    });

    await group('malformed fixed-trace input receives focused error without mutating retained state', async () => {
      const historyBefore = await text('history');
      const countBefore = await text('history-count');
      await page.evaluate(() => {
        const option = document.createElement('option');
        option.value = 'not-a-fixture';
        option.textContent = 'Invalid authored input';
        option.id = 'invalid-test-option';
        document.getElementById('fixture').append(option);
        document.getElementById('fixture').value = option.value;
        document.getElementById('exercise-form').requestSubmit();
      });
      assert.equal(await page.locator('#error').isVisible(), true);
      assert.match(await text('error'), /Action rejected.*listed fixture.*unchanged/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
      await phase('ready');
      assert.equal(await text('history'), historyBefore);
      assert.equal(await text('history-count'), countBefore);
      const error = await text('error');
      await page.evaluate(() => {
        document.getElementById('invalid-test-option').remove();
        document.getElementById('fixture').value = 'redundant';
      });
      return { error, phase: await text('phase'), retainedHistory: await text('history') };
    });

    await group('out-of-order guard and insufficient capacity show actual DOM interruptions and recovery', async () => {
      await begin('capacity-shortfall');
      assert.equal(await page.locator('#measure').isDisabled(), true);
      const beforeAction = await text('history-count');
      await page.evaluate(() => document.getElementById('measure').dispatchEvent(new Event('click')));
      assert.match(await text('error'), /out of order.*unchanged/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
      await phase('baseline');
      assert.equal(await text('history-count'), beforeAction);
      const rejectedAction = await text('error');
      await observeLoss();
      assert.equal(await page.locator('#error').isHidden(), true);
      assert.match(await text('status'), /Overall: negative.*contract: negative/);
      assert.match(await text('metrics'), /capacity: 40.*4 success, 2 interruption, 0 unknown/);
      assert.deepEqual(await page.locator('#journeys td:nth-child(6)').allTextContents(), ['success', 'success', 'success', 'success', 'interruption', 'interruption']);
      const observed = { rejectedAction, status: await text('status'), metrics: await text('metrics'), journeys: await text('journeys') };
      await reset();
      assert.match(await text('history'), /loss result negative; 4 success \/ 2 interruption/);
      return { ...observed, retainedHistory: await text('history') };
    });

    await group('known state mismatch remains negative even when every response is HTTP 200', async () => {
      await begin('state-mismatch');
      await observeLoss();
      assert.match(await text('status'), /Overall: negative.*contract: negative/);
      assert.match(await text('metrics'), /capacity: 80.*state gate: negative.*5 success, 1 interruption, 0 unknown/);
      assert.deepEqual(await page.locator('#journeys td:nth-child(3)').allTextContents(), Array(6).fill('200'));
      assert.match(await page.locator('#journeys tr').nth(5).innerText(), /200.*120.*false.*interruption/s);
      assert.match(await text('workers'), /fixture-receipt-other/);
      const observed = { status: await text('status'), metrics: await text('metrics'), failedReceiptSample: await page.locator('#journeys tr').nth(5).innerText() };
      await reset();
      assert.match(await text('history'), /loss result negative; 5 success \/ 1 interruption/);
      return { ...observed, retainedHistory: await text('history') };
    });

    await group('missing observations display unknown capacity, state and three unknown journeys', async () => {
      await begin('missing-observations');
      await observeLoss();
      assert.match(await text('status'), /Overall: unknown.*contract: unknown/);
      assert.match(await text('metrics'), /capacity: unknown.*state gate: unknown.*3 success, 0 interruption, 3 unknown/);
      assert.deepEqual(await page.locator('#journeys td:nth-child(6)').allTextContents(), ['success', 'success', 'success', 'unknown', 'unknown', 'unknown']);
      assert.match(await page.locator('#workers tr').nth(1).innerText(), /unknown.*unknown.*unknown/s);
      const observed = { status: await text('status'), metrics: await text('metrics'), workers: await text('workers'), journeys: await text('journeys') };
      await reset();
      assert.match(await text('history'), /loss result unknown; 3 success \/ 0 interruption \/ 3 unknown/);
      return { ...observed, retainedHistory: await text('history') };
    });

    for (const scopeClaim of ['zone', 'region']) {
      await group(`${scopeClaim} overclaim is negative despite positive worker-loss capacity and state`, async () => {
        await begin('redundant', scopeClaim);
        await observeLoss();
        assert.match(await text('status'), /Overall: negative.*contract: positive.*Scope claim: negative/);
        assert.match(await text('metrics'), /capacity: 80.*6 success, 0 interruption, 0 unknown/);
        assert.match(await text('scope-results'), /Same-node.*observed serving/s);
        assert.match(await text('scope-results'), /Same-zone.*observed serving/s);
        assert.match(await text('scope-results'), /region-east.*observed serving/s);
        assert.match(await text('scope-limit'), /unverified.*not an Azure-zone or Azure-region outage experiment/s);
        const observed = { claim: scopeClaim, status: await text('status'), metrics: await text('metrics'), domains: await text('scope-results'), limit: await text('scope-limit') };
        await reset(false);
        return { ...observed, retainedHistory: await text('history') };
      });
    }

    await group('six-run admission limit disables controls and rejects forced submit without erasing history', async () => {
      assert.equal(await page.locator('#history li').count(), 6);
      for (const id of ['begin', 'fixture', 'scope-claim', 'observe-baseline', 'record-loss', 'measure', 'recover', 'reset-lesson']) {
        assert.equal(await page.locator(`#${id}`).isDisabled(), true);
      }
      assert.match(await text('status'), /Session full.*retained/);
      const countBefore = await text('history-count');
      const historyBefore = await text('history');
      await page.evaluate(() => document.getElementById('exercise-form').requestSubmit());
      assert.match(await text('error'), /Six rehearsals are retained.*unchanged/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
      assert.equal(await text('history'), historyBefore);
      assert.equal(await text('history-count'), countBefore);
      return { error: await text('error'), count: await text('history-count'), retainedHistory: await text('history') };
    });

    await group('active CSP rejects inline script and data connection before any external request', async () => {
      await page.evaluate(() => {
        globalThis.__s111CspViolations = [];
        document.addEventListener('securitypolicyviolation', event => {
          globalThis.__s111CspViolations.push({ effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        const script = document.createElement('script');
        script.textContent = 'globalThis.__s111InlineDidRun = true;';
        document.head.append(script);
      });
      await page.waitForFunction(() => globalThis.__s111CspViolations.some(event => event.effectiveDirective.startsWith('script-src')));
      assert.equal(await page.evaluate(() => globalThis.__s111InlineDidRun === true), false);
      const connection = await page.evaluate(async () => {
        try { await fetch('data:application/json,{}'); return 'unexpectedly permitted'; }
        catch { return 'blocked before transport'; }
      });
      assert.equal(connection, 'blocked before transport');
      await page.waitForFunction(() => globalThis.__s111CspViolations.some(event => event.effectiveDirective === 'connect-src'));
      assert.equal(externalRequests, 0);
      return { inlineExecuted: false, connection, violations: await page.evaluate(() => globalThis.__s111CspViolations), externalRequests };
    });
  } finally {
    if (session) {
      await session.close();
      closed = true;
    }
  }

  await group('awaited isolated cleanup and read-only verification preserve all owned source and proof bytes', async () => {
    assert.equal(closed, true);
    assert.deepEqual(pageErrors, []);
    assert.ok(consoleErrors.every(message => /violates|Content Security Policy/i.test(message)));
    assert.equal(externalRequests, 0);
    assert.ok(requestProtocols.filter(protocol => protocol === 'file:').length >= 4);
    assert.deepEqual(ownedSnapshot(), before);
    return { cleanup: 'awaited session.close() in finally completed', pageErrors, externalRequests,
      protectedFiles: Object.keys(before).length, unchanged: true, requestProtocols };
  });
  const canonical = execFileSync('git', ['show', '53c0c0d:testing/browser/isolated.cjs'], { cwd: repo });
  assert.equal(sha256(canonical), '2ccb4ee2e708d4e3131b73acb5efcf0a2ee6f0e73966388a846e0d22f07571b0');
  const observation = {
    cardId: 'A-S111', workerId: 'worker-A-S111', packet: 'SC-S111', mode: 'synthetic', passed: true,
    runtime: process.version, playwrightVersion, browserVersion,
    helperPublishedCommit: execFileSync('git', ['rev-parse', '53c0c0d^{commit}'], { cwd: repo, encoding: 'utf8' }).trim(),
    helperWorkingSha256: sha256(fs.readFileSync(helperPath)), helperCanonicalGitSha256: sha256(canonical),
    cleanup: 'awaited session.close() in finally completed', externalRequests, pageErrors, consoleErrors,
    protectedFileSha256: before, normalVerificationWrites: 0,
    observationLimit: 'Actual DOM operation of fixed fictional teaching DATA ONLY; no live worker, node, zone or region fault, migration, cloud operation or production Node 24 validation.',
    inactiveLifecyclePrototypeUsed: false, sourceParentComplete: false, additionalKanoCredits: 0, checks,
  };
  if (!writeBrowserEvidence(observation)) {
    assert.equal(captureEnabled(process.env.CAPTURE_BROWSER_EVIDENCE), false);
    assert.deepEqual(ownedSnapshot(), before);
  }
});
