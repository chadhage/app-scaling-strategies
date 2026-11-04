'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const model = require('./model.js');
const captureEnabled = require('./capture-policy.cjs');
const repoRoot = path.resolve(__dirname, '..', '..');
const { openIsolatedLesson } = require(path.join(repoRoot, 'testing', 'browser', 'isolated.cjs'));
const evidenceRoot = path.join(__dirname, 'evidence');
const reportPath = path.join(evidenceRoot, 'browser-acceptance.json');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const capture = captureEnabled(process.env.CAPTURE_BROWSER_EVIDENCE);

function historyHashes() {
  const result = {};
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (!(capture && file === reportPath)) result[path.relative(evidenceRoot, file)] = sha(fs.readFileSync(file));
    }
  }
  walk(evidenceRoot);
  return result;
}

test('actual isolated S138 DOM, keyboard, negative/unknown, error/reset, load failure and active CSP', { timeout: 120000 }, async t => {
  const before = historyHashes();
  const observations = [];
  const requested = [];
  const pageErrors = [];
  let session;
  let cleanupObserved = false;
  let browserVersion;
  let failedCase = false;
  const checkCase = async (name, callback) => t.test(name, async () => {
    try {
      await callback();
    } catch (error) {
      failedCase = true;
      throw error;
    }
  });
  try {
    session = await openIsolatedLesson(path.join('learning', 'S138', 'index.html'));
    browserVersion = session.browserVersion;
    const page = session.page;
    page.on('request', request => requested.push(request.url()));
    page.on('pageerror', error => pageErrors.push(error.message));
    const text = id => page.locator(`#${id}`).textContent();
    const count = id => page.locator(`#${id} > li`).count();
    const focus = () => page.evaluate(() => document.activeElement.id);
    const record = async (caseId, extra = {}) => {
      observations.push({
        caseId,
        outcome: await text('verdict'),
        targetVersion: await text('version'),
        observedRows: await text('observed-count'),
        duplicateRows: await text('duplicate-count'),
        missingProfiles: await text('missing-count'),
        orderBreaks: await text('order-count'),
        schemaErrors: await text('schema-count'),
        snapshot: await text('snapshot-match'),
        completion: await text('completion'),
        explanation: await text('explanation'),
        resultRows: await page.locator('#results > li').allTextContents(),
        history: await page.locator('#history > li').allTextContents(),
        receipts: await text('receipts'),
        focusedControl: await focus(),
        ...extra,
      });
    };
    const reset = async () => {
      await page.getByRole('button', { name: 'Reset all (clears history)', exact: true }).click();
      assert.equal(await count('history'), 0);
      assert.equal(await count('results'), 0);
      assert.equal(await focus(), 'open-page');
      assert.equal(await text('verdict'), 'Not checked');
    };
    const run = async condition => {
      await reset();
      await page.locator('#open-page').click();
      await page.getByLabel('Migration condition', { exact: true }).selectOption(condition);
      await page.locator('#migrate').click();
      await page.locator('#reuse').click();
      assert.equal(await text('verdict'), 'Not checked', 'a receipt must not become a correctness verdict');
      await page.locator('#check').click();
    };

    await checkCase('keyboard-only positive journey and labelled disabled-state guards', async () => {
      assert.equal(await text('banner'), model.BANNER);
      assert.equal(await page.locator('#open-page').isEnabled(), true);
      for (const id of ['condition', 'migrate', 'cursor-input', 'reuse', 'check']) {
        assert.equal(await page.locator(`#${id}`).isDisabled(), true);
      }
      await page.keyboard.press('Tab');
      assert.equal(await focus(), 'open-page');
      const outline = await page.locator('#open-page').evaluate(element => getComputedStyle(element).outlineStyle);
      assert.notEqual(outline, 'none');
      await page.keyboard.press('Enter');
      assert.equal(await count('history'), 1);
      assert.equal(await count('results'), 3);
      assert.match(await text('missing-count'), /^Unknown/);
      await page.keyboard.press('Tab');
      assert.equal(await focus(), 'condition');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#condition').inputValue(), 'accepted-missing');
      await page.keyboard.press('Home');
      assert.equal(await page.locator('#condition').inputValue(), 'preserved');
      await page.keyboard.press('Tab');
      assert.equal(await focus(), 'migrate');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      assert.equal(await focus(), 'cursor-input');
      assert.equal(await page.locator('#cursor-input').inputValue(), model.SAVED_CURSOR);
      await page.keyboard.press('Tab');
      assert.equal(await focus(), 'reuse');
      await page.keyboard.press('Enter');
      assert.equal(await text('verdict'), 'Not checked');
      await page.keyboard.press('Tab');
      assert.equal(await focus(), 'check');
      await page.keyboard.press('Enter');
      assert.match(await text('verdict'), /^POSITIVE/);
      assert.equal(await count('results'), 6);
      assert.equal(await count('history'), 4);
      assert.match(await text('completion'), /Explicit terminal/);
      assert.equal(await text('missing-count'), '0: none');
      await record('preserved-keyboard', { focusOutline: outline });
    });

    const negativeCases = [
      ['accepted-missing', 'INTERRUPTED', 5, '1: profile-05', '0 observed', '0 observed', '0 observed'],
      ['accepted-duplicate', 'INTERRUPTED', 7, '0: none', '1 observed', '0 observed', '0 observed'],
      ['accepted-reorder', 'INTERRUPTED', 6, '0: none', '0 observed', '1 observed', '0 observed'],
      ['changed-schema', 'INTERRUPTED', 6, '0: none', '0 observed', '0 observed', '3 observed'],
      ['changed-snapshot', 'INTERRUPTED', 7, '0: none', '0 observed', '0 observed', '0 observed'],
      ['unknown-completion', 'UNKNOWN', 4, 'Unknown — 2 not yet observed', '0 observed', '0 observed', '0 observed'],
      ['rejected-cursor', 'INTERRUPTED', 3, 'Unknown — 3 not yet observed', '0 observed', '0 observed', '0 observed'],
    ];
    for (const [condition, outcome, rows, missing, duplicate, order, schema] of negativeCases) {
      await checkCase(`${condition}: actual rows and measured outcome, not a success-shaped receipt`, async () => {
        await run(condition);
        assert.ok((await text('verdict')).startsWith(outcome));
        assert.equal(await count('results'), rows);
        assert.equal(await text('missing-count'), missing);
        assert.equal(await text('duplicate-count'), duplicate);
        assert.equal(await text('order-count'), order);
        assert.equal(await text('schema-count'), schema);
        assert.equal(await count('history'), 4);
        const receipts = await text('receipts');
        assert.match(receipts, /FIXED FICTIONAL DATA/);
        assert.match(receipts, /"targetVersion": "v1"/);
        assert.match(receipts, /"targetVersion": "v2"/);
        assert.match(receipts, /"cursor": "teaching-cursor-s138\.snapshot-v1\.after-profile-03"/);
        if (condition === 'rejected-cursor') assert.match(receipts, /"status": 410/);
        else {
          assert.match(receipts, /"status": 200/);
          assert.match(receipts, /"cursorAccepted": true/);
        }
        if (condition === 'unknown-completion') {
          assert.equal(await text('completion'), 'Unknown');
          assert.match(await text('explanation'), /not certified missing/);
        }
        if (condition === 'changed-snapshot') assert.match(await text('snapshot-match'), /MISMATCH/);
        await record(condition);
      });
    }

    await checkCase('altered token announces an actual error without clearing first page, cutover or history', async () => {
      await reset();
      await page.locator('#open-page').click();
      await page.locator('#migrate').click();
      const priorHistory = await page.locator('#history > li').allTextContents();
      const priorReceipts = await text('receipts');
      await page.getByLabel('Cursor to reuse', { exact: true }).fill('<img src=x>');
      await page.locator('#reuse').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.getByRole('alert').isVisible(), true);
      assert.match(await text('error'), /exact saved teaching cursor/);
      assert.equal(await focus(), 'error');
      assert.deepEqual(await page.locator('#history > li').allTextContents(), priorHistory);
      assert.equal(await text('receipts'), priorReceipts);
      assert.equal(await count('results'), 3);
      assert.equal(await page.locator('img').count(), 0);
      assert.equal(await text('verdict'), 'Not checked');
      await record('altered-token-error', { error: await text('error'), historyAndReceiptRetained: true });
      await page.getByLabel('Cursor to reuse', { exact: true }).fill(model.SAVED_CURSOR);
      await page.locator('#reuse').click();
      assert.equal(await page.locator('#error').isHidden(), true);
      await page.locator('#check').click();
      assert.match(await text('verdict'), /^POSITIVE/);
    });

    await checkCase('an invalid condition injected into the control is rejected without coercion or state mutation', async () => {
      await reset();
      await page.locator('#open-page').click();
      await page.locator('#condition').evaluate(select => {
        const option = document.createElement('option');
        option.value = '__proto__';
        option.textContent = 'Invalid fixed-condition probe';
        select.append(option);
        select.value = '__proto__';
      });
      await page.locator('#migrate').click();
      assert.match(await text('error'), /eight fixed migration conditions/);
      assert.equal(await count('history'), 1);
      assert.equal(await count('results'), 3);
      assert.equal(await text('version'), 'v1');
      await record('invalid-condition-error', { error: await text('error') });
      await page.locator('#condition').evaluate(select => select.lastElementChild.remove());
    });

    await checkCase('keyboard reset clears only the synthetic attempt, announces it and restores first-control focus', async () => {
      await page.locator('#reset-all').focus();
      await page.keyboard.press('Enter');
      assert.equal(await focus(), 'open-page');
      assert.equal(await count('results'), 0);
      assert.equal(await count('history'), 0);
      assert.equal(await text('receipts'), 'No receipts observed.');
      assert.equal(await text('saved-token'), 'Not observed yet');
      assert.equal(await page.locator('#cursor-input').inputValue(), '');
      assert.equal(await page.locator('#condition').inputValue(), 'preserved');
      assert.equal(await page.locator('#error').isHidden(), true);
      assert.match(await text('status'), /reset.*history cleared/);
      assert.equal(await text('completion'), 'Unknown');
      await record('keyboard-reset', { announcement: await text('status') });
    });

    await checkCase('active CSP rejects inline script and a data-only connection probe without any network', async () => {
      await page.evaluate(async () => {
        globalThis.s138Violations = [];
        document.addEventListener('securitypolicyviolation', event => {
          globalThis.s138Violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        const script = document.createElement('script');
        script.textContent = 'document.documentElement.dataset.s138InlineProbe = "executed";';
        document.head.append(script);
        try {
          await fetch('data:text/plain,s138-fictional-csp-probe');
          globalThis.s138DataProbe = 'unexpected success';
        } catch (error) {
          globalThis.s138DataProbe = error.name;
        }
      });
      await page.waitForFunction(() => globalThis.s138Violations.some(item => item.directive.startsWith('script-src'))
        && globalThis.s138Violations.some(item => item.directive === 'connect-src'));
      const probe = await page.evaluate(() => ({
        inlineExecuted: document.documentElement.dataset.s138InlineProbe || null,
        dataConnection: globalThis.s138DataProbe,
        violations: globalThis.s138Violations,
      }));
      assert.equal(probe.inlineExecuted, null);
      assert.equal(probe.dataConnection, 'TypeError');
      assert.ok(probe.violations.some(item => item.directive === 'connect-src' && item.blockedURI.startsWith('data')));
      assert.ok(requested.every(url => url.startsWith('file:')));
      await record('active-csp', { probe, networkRequests: 0 });
    });

    await checkCase('blocked local model script visibly fails closed; reset remains available and no result is fabricated', async () => {
      await page.route('**/model.js', route => route.abort('failed'));
      await page.reload({ waitUntil: 'load' });
      assert.equal(await page.getByRole('alert').isVisible(), true);
      assert.match(await text('error'), /Local model unavailable/);
      assert.equal(await page.locator('#steps').evaluate(element => element.disabled), true);
      for (const id of ['open-page', 'condition', 'migrate', 'cursor-input', 'reuse', 'check']) {
        assert.equal(await page.locator(`#${id}`).isDisabled(), true);
      }
      assert.equal(await page.locator('#reset-all').isEnabled(), true);
      assert.equal(await text('verdict'), 'Not checked');
      assert.equal(await count('results'), 0);
      await page.locator('#reset-all').focus();
      await page.keyboard.press('Enter');
      assert.equal(await focus(), 'reset-all');
      assert.match(await text('status'), /Reset cannot fabricate/);
      await record('model-script-unavailable', { error: await text('error'), resetEnabled: true });
      await page.unroute('**/model.js');
      await page.reload({ waitUntil: 'load' });
      assert.equal(await page.locator('#error').isHidden(), true);
      assert.equal(await page.locator('#open-page').isEnabled(), true);
    });

    assert.deepEqual(pageErrors, []);
    assert.equal(failedCase, false, 'failed browser cases must never publish a success report');
    assert.ok(requested.every(url => url.startsWith('file:')), 'no remote or HTTP resource is requested');
  } finally {
    if (session) {
      await session.close();
      cleanupObserved = true;
    }
    assert.deepEqual(historyHashes(), before, 'verification must retain every historical evidence byte');
  }
  assert.equal(cleanupObserved, true);
  if (capture) {
    assert.equal(observations.length, 13);
    const implementationHashes = {};
    for (const name of ['model.js', 'app.js', 'index.html', 'lesson.css', 'browser.test.cjs', 'capture-policy.cjs']) {
      implementationHashes[name] = sha(fs.readFileSync(path.join(__dirname, name)));
    }
    const report = {
      cardId: 'A-S138', parentId: 'D-S138', packet: 'SC-S138', kanoUnit: 'A-S138',
      evidenceLevel: 'actual local browser observations of fixed fictional teaching data only',
      capturedAtUtc: new Date().toISOString(),
      capturePermission: 'CAPTURE_BROWSER_EVIDENCE=1',
      nodeVersion: process.version,
      playwrightVersion: require(path.join(repoRoot, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version,
      browserVersion,
      helper: 'testing\\browser\\isolated.cjs',
      helperSha256: sha(fs.readFileSync(path.join(repoRoot, 'testing', 'browser', 'isolated.cjs'))),
      implementationHashes,
      observations,
      pageErrors,
      networkRequests: 0,
      cleanup: { awaitedFinallyClose: cleanupObserved, result: 'owned isolated browser close completed' },
      exclusions: ['No actual database/network/user-data operation', 'No native B-S138 or source-parent completion', 'No production Node 24 or five-nines certification'],
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  }
});
