'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const helperPath = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const EXPECTED_HELPER = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(fs.readFileSync(helperPath)), EXPECTED_HELPER);
const { openIsolatedLesson } = require(helperPath);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
assert.equal(playwrightVersion, '1.56.1');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

function lessonHashes() {
  function list(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? list(file) : [[path.relative(root, file), sha(fs.readFileSync(file))]];
    });
  }
  return Object.fromEntries(list(root).sort((a, b) => a[0].localeCompare(b[0])));
}

test('actual isolated DOM keyboard guards reset failures unknowns retained history and enforced CSP', { timeout: 90000 }, async () => {
  const startedAtUtc = new Date().toISOString();
  const beforeHashes = lessonHashes();
  const preflight = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'tooling-preflight.json')));
  const evidence = {
    schemaVersion: 1, cardId: 'A-S099', parentId: 'D-S099', packet: 'SC-S099', kano: 'S', kanoUnit: 'A-S099',
    startedAtUtc, producerCapture: capture, runtime: process.version, playwrightVersion,
    helperPublishedCommit: '53c0c0d', helperSha256: EXPECTED_HELPER,
    mode: 'Synthetic local file lesson; no live Azure result',
    checks: [], observations: [], pageErrors: [], consoleErrors: [], requests: [],
    cleanup: { awaitedFinallyClose: false, pageClosed: false, browserDisconnected: false },
    certification: 'No actual rollback, reversal, routing, continuity, native/source-parent, Node24 production or unattended lifecycle certification.'
  };
  let session;
  let browser;
  let serializedDom = '';
  let failure;
  try {
    session = await openIsolatedLesson('learning\\S099\\index.html');
    const page = session.page;
    browser = page.context().browser();
    evidence.browserVersion = session.browserVersion;
    assert.equal(session.browserVersion, preflight.edge.version);
    assert.equal(preflight.edge.signatureStatus, 'Valid');
    assert.match(preflight.edge.signer, /Microsoft Corporation/);
    assert.match(process.version, /^v22\./);
    page.setDefaultTimeout(5000);
    page.on('pageerror', error => evidence.pageErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') evidence.consoleErrors.push(message.text());
    });
    page.on('request', request => evidence.requests.push(request.url()));
    await page.reload({ waitUntil: 'load', timeout: 15000 });
    async function value(id) { return page.locator(`#${id}`).innerText(); }
    async function choose(action) {
      await page.locator('#operator-action').selectOption(action);
      await page.locator('#apply-choice').click();
    }
    async function observe(name) {
      evidence.observations.push({
        name, command: await value('command-status'), observedRouting: await value('observed-routing'),
        recovery: await value('recovery-result'), complete: await value('completion'), knownGood: await value('known-good'),
        rollbackCommands: await value('rollback-attempts'), reconciliations: await value('reconcile-attempts'),
        note: await value('current-note'), historyEntries: await page.locator('#history li').count(),
        error: await page.locator('#error').textContent()
      });
      evidence.checks.push({ name, passed: true });
    }

    assert.equal(await value('training-banner'), 'Training rehearsal - synthetic data - not a live Azure result');
    assert.equal(await value('started-count'), '0');
    assert.equal(await page.locator('#apply-choice').isDisabled(), true);
    assert.equal(await page.evaluate(() => typeof document.getElementById('trace-form').reset), 'function');
    assert.equal(await page.evaluate(() => typeof document.getElementById('action-form').reset), 'function');
    await observe('Loadable DOM, exact banner, no sample, native reset methods');

    await page.locator('#failure-trace').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#record-failure').evaluate(element => element === document.activeElement), true);
    await page.keyboard.press('Enter');
    assert.match(await value('command-status'), /^Failure/);
    assert.match(await value('observed-routing'), /^Unknown/);
    assert.equal(await value('recovery-result'), 'Unknown');
    assert.match(await value('completion'), /^No/);
    assert.equal(await value('rollback-attempts'), '1');
    await observe('Keyboard starts failed rollback without guessing effective routing');

    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    assert.match(await value('current-note'), /Blind reversal rejected/);
    assert.equal(await value('blind-rejection-count'), '1');
    assert.equal(await value('rollback-attempts'), '1');
    await observe('Keyboard blind repeated reversal rejected; no second rollback');

    const beforeInvalid = await page.locator('#history li').count();
    await page.evaluate(() => {
      const option = document.createElement('option');
      option.value = 'unlisted-action';
      option.textContent = 'Unlisted synthetic input';
      document.getElementById('operator-action').append(option);
      document.getElementById('operator-action').value = option.value;
      document.getElementById('action-form').requestSubmit();
      option.remove();
    });
    assert.match(await page.locator('#error').innerText(), /Invalid action/);
    assert.equal(await page.locator('#error').evaluate(element => element === document.activeElement), true);
    assert.equal(await page.locator('#history li').count(), beforeInvalid);
    await observe('Invalid DOM input is focused and cannot append a result');

    await page.locator('#operator-action').selectOption('blind-repeat');
    await page.locator('#operator-action').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#operator-action').inputValue(), 'inspect-routing');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    assert.match(await value('observed-routing'), /Known-good 75%, candidate 25%/);
    assert.equal(await page.locator('#error').isHidden(), true);
    assert.match(await value('known-good'), /^Yes/);
    await observe('Keyboard inspection reveals unchanged routing, clears error, retains known-good');

    await choose('reconcile-known-good');
    assert.equal(await value('reconcile-attempts'), '1');
    assert.match(await value('observed-routing'), /^Unknown/);
    await choose('verify-recovery');
    assert.equal(await value('recovery-result'), 'Unknown');
    assert.match(await value('current-note'), /stale observation|current effective routing revision/);
    assert.equal(await page.locator('#apply-choice').isDisabled(), false);
    await observe('Grounded reconciliation invalidates snapshot; stale recovery check rejected');
    await choose('inspect-routing');
    await choose('verify-recovery');
    assert.equal(await value('recovery-result'), 'Success');
    assert.match(await value('observed-routing'), /Known-good 100%, candidate 0%.*revision 2/);
    assert.match(await value('completion'), /^Yes/);
    assert.equal(await value('rollback-failure-count'), '1');
    assert.equal(await page.locator('#apply-choice').isDisabled(), true);
    await observe('Fresh observed recovery succeeds while original command failure remains');

    const completedHistory = await page.locator('#history li').allTextContents();
    await page.evaluate(() => document.getElementById('action-form').requestSubmit());
    assert.match(await page.locator('#error').innerText(), /terminal/);
    assert.equal(await page.locator('#error').evaluate(element => element === document.activeElement), true);
    assert.deepEqual(await page.locator('#history li').allTextContents(), completedHistory);
    await observe('Terminal state rejects duplicate forced DOM submission without changing history');
    await page.locator('#reset-current').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#failure-trace').inputValue(), 'failed-before-apply');
    assert.equal(await page.locator('#operator-action').inputValue(), 'blind-repeat');
    assert.equal(await page.locator('#failure-trace').evaluate(element => element === document.activeElement), true);
    assert.equal(await page.locator('#error').isHidden(), true);
    assert.deepEqual(await page.locator('#history li').allTextContents(), completedHistory);
    assert.equal(await value('success-count'), '1');
    await observe('Keyboard reset restores defaults/focus and retains success, failure and all trace entries');

    await page.locator('#failure-trace').selectOption('failed-after-apply');
    await page.locator('#record-failure').click();
    await choose('inspect-routing');
    await choose('verify-recovery');
    assert.equal(await value('recovery-result'), 'Success');
    assert.equal(await value('reconcile-attempts'), '0');
    assert.equal(await value('rollback-attempts'), '1');
    await observe('Failed acknowledgement with inspected applied target succeeds without another routing command');
    await page.locator('#reset-current').click();

    await page.locator('#failure-trace').selectOption('reconciliation-fails');
    await page.locator('#record-failure').click();
    await choose('inspect-routing');
    await choose('reconcile-known-good');
    assert.match(await value('current-note'), /also failed/);
    await choose('inspect-routing');
    await choose('reconcile-known-good');
    assert.match(await value('current-note'), /Blind retry rejected/);
    assert.equal(await value('reconcile-attempts'), '1');
    await choose('verify-recovery');
    assert.equal(await value('recovery-result'), 'Failure');
    assert.match(await value('observed-routing'), /Known-good 50%, candidate 50%/);
    assert.match(await value('completion'), /^No/);
    assert.match(await value('known-good'), /^Yes/);
    assert.equal(await value('reconciliation-failure-count'), '1');
    await observe('Reconciliation itself fails; second attempt rejected; recovery remains incomplete');
    await page.locator('#reset-current').click();

    await page.locator('#failure-trace').selectOption('routing-unobserved');
    await page.locator('#record-failure').click();
    await choose('inspect-routing');
    await choose('reconcile-known-good');
    assert.match(await value('current-note'), /Reconciliation blocked/);
    assert.equal(await value('reconcile-attempts'), '0');
    await choose('verify-recovery');
    assert.equal(await value('recovery-result'), 'Unknown');
    assert.match(await value('completion'), /^No/);
    assert.equal(await value('unknown-count'), '1');
    await observe('Unusable routing evidence produces unknown recovery, never a complete reversal');

    evidence.retainedTotals = {
      started: Number(await value('started-count')), success: Number(await value('success-count')),
      failure: Number(await value('failure-count')), unknown: Number(await value('unknown-count')),
      rollbackFailures: Number(await value('rollback-failure-count')),
      reconciliationFailures: Number(await value('reconciliation-failure-count')),
      blindRejections: Number(await value('blind-rejection-count'))
    };
    assert.deepEqual(evidence.retainedTotals, { started: 4, success: 2, failure: 1, unknown: 1, rollbackFailures: 4, reconciliationFailures: 1, blindRejections: 1 });
    const retainedHistory = await page.locator('#history li').allTextContents();
    assert.equal(retainedHistory.length, 20);
    await page.locator('#reset-current').click();
    assert.equal(await page.locator('#record-failure').isDisabled(), true);
    assert.equal(await page.locator('#failure-trace').evaluate(element => element === document.activeElement), true);
    assert.deepEqual(await page.locator('#history li').allTextContents(), retainedHistory);
    await page.evaluate(() => document.getElementById('trace-form').requestSubmit());
    assert.match(await page.locator('#error').innerText(), /four-rehearsal allowance/);
    assert.equal(await page.locator('#error').evaluate(element => element === document.activeElement), true);
    assert.equal(await value('started-count'), '4');
    assert.deepEqual(await page.locator('#history li').allTextContents(), retainedHistory);
    await page.locator('#reset-current').click();
    assert.equal(await page.locator('#error').isHidden(), true);
    await observe('Full allowance and reset retain all 20 entries and honest 2 + 1 + 1 = 4 accounting');

    assert.deepEqual(evidence.pageErrors, []);
    assert.deepEqual(evidence.consoleErrors, []);
    const allowed = new Set(['index.html', 'model.js', 'app.js', 'styles.css'].map(file => pathToFileURL(path.join(root, file)).href));
    assert.ok(evidence.requests.length >= 4);
    assert.ok(evidence.requests.every(url => allowed.has(url)));
    await page.evaluate(() => {
      globalThis.syntheticCspViolations = [];
      globalThis.syntheticInlineScriptRan = false;
      globalThis.syntheticInlineHandlerRan = false;
      document.addEventListener('securitypolicyviolation', event => globalThis.syntheticCspViolations.push(event.effectiveDirective));
      const script = document.createElement('script');
      script.textContent = 'globalThis.syntheticInlineScriptRan = true';
      document.body.append(script);
      script.remove();
      const button = document.createElement('button');
      button.id = 'synthetic-csp-probe';
      button.textContent = 'Test-only blocked inline handler';
      button.setAttribute('onclick', 'globalThis.syntheticInlineHandlerRan = true');
      document.body.append(button);
    });
    await page.locator('#synthetic-csp-probe').click();
    const connectionBlocked = await page.evaluate(async () => {
      try { await fetch('data:text/plain,synthetic-CSP-probe'); return false; }
      catch (error) { return error instanceof TypeError; }
    });
    assert.equal(connectionBlocked, true);
    await page.waitForFunction(() => ['script-src-elem', 'script-src-attr', 'connect-src']
      .every(directive => globalThis.syntheticCspViolations.includes(directive)));
    assert.equal(await page.evaluate(() => globalThis.syntheticInlineScriptRan), false);
    assert.equal(await page.evaluate(() => globalThis.syntheticInlineHandlerRan), false);
    await page.evaluate(() => document.getElementById('synthetic-csp-probe').remove());
    await observe('Actual CSP blocks inline script, inline handler and data-URL connection');

    const unchangedUrl = page.url();
    await page.evaluate(() => {
      const form = document.createElement('form');
      form.id = 'synthetic-csp-form';
      form.action = document.location.href;
      document.body.append(form);
      form.submit();
    });
    await page.waitForFunction(() => globalThis.syntheticCspViolations.includes('form-action'));
    assert.equal(page.url(), unchangedUrl);
    await page.evaluate(() => document.getElementById('synthetic-csp-form').remove());
    evidence.cspViolations = await page.evaluate(() => [...new Set(globalThis.syntheticCspViolations)].sort());
    assert.equal(evidence.requests.filter(url => /^https?:/i.test(url)).length, 0);
    assert.deepEqual(evidence.pageErrors, []);
    assert.ok(evidence.consoleErrors.every(message => /Content Security Policy|content security policy/i.test(message)));
    await observe('Actual form-action CSP blocks test-only same-owned-file submission; no HTTP or management requests');
    serializedDom = await page.content();
    evidence.retainedHistory = await page.locator('#history li').allTextContents();
  } catch (error) {
    failure = error;
    evidence.failure = { name: error.name, message: error.message, stack: error.stack };
    if (session && !session.page.isClosed()) {
      try {
        evidence.cspViolations = await session.page.evaluate(() => [...new Set(globalThis.syntheticCspViolations || [])].sort());
        serializedDom = await session.page.content();
      } catch (captureError) {
        evidence.failureCaptureError = captureError.message;
      }
    }
  } finally {
    try {
      if (session) {
        await session.close();
        evidence.cleanup.awaitedFinallyClose = true;
        evidence.cleanup.pageClosed = session.page.isClosed();
        evidence.cleanup.browserDisconnected = !browser.isConnected();
        assert.equal(evidence.cleanup.pageClosed, true);
        assert.equal(evidence.cleanup.browserDisconnected, true);
      }
    } catch (error) {
      evidence.cleanupFailure = { name: error.name, message: error.message };
      failure = failure ? new AggregateError([failure, error], 'Browser checks and cleanup failed') : error;
    }
    if (!capture) {
      try {
        assert.deepEqual(lessonHashes(), beforeHashes, 'Normal browser verification must not modify lesson or evidence files');
        evidence.readOnlyLessonVerified = true;
      } catch (error) {
        failure = failure ? new AggregateError([failure, error], 'Browser checks and read-only verification failed') : error;
      }
    }
    evidence.finishedAtUtc = new Date().toISOString();
    evidence.passed = !failure && evidence.cleanup.awaitedFinallyClose && evidence.checks.length >= 12;
    evidence.sourceCanonicalSha256 = Object.fromEntries(
      ['model.js', 'app.js', 'index.html', 'styles.css', 'manifest.json', 'tests\\browser.test.cjs'].map(file => [
        file, sha(Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')))
      ])
    );
    if (capture) {
      const output = path.join(root, 'evidence');
      const raw = path.join(output, 'raw');
      const captureId = `browser-${evidence.passed ? 'accepted' : 'failed'}-${startedAtUtc.replace(/[:.]/g, '-')}`;
      const domName = `${captureId}.dom.html.txt`;
      const observationsName = `${captureId}.observations.json.txt`;
      fs.writeFileSync(path.join(raw, domName), Buffer.from(serializedDom));
      fs.writeFileSync(path.join(raw, observationsName), Buffer.from(JSON.stringify(evidence.observations, null, 2) + '\n'));
      evidence.rawDom = { path: `raw/${domName}`, sha256: sha(Buffer.from(serializedDom)), qualification: 'Actual browser DOM serialization, UTF-8; not original source or wire bytes.' };
      evidence.rawObservations = { path: `raw/${observationsName}`, sha256: sha(fs.readFileSync(path.join(raw, observationsName))) };
      fs.writeFileSync(path.join(output, 'browser-acceptance.json'), JSON.stringify(evidence, null, 2) + '\n');
    }
  }
  if (failure) throw failure;
  assert.equal(evidence.passed, true);
});
