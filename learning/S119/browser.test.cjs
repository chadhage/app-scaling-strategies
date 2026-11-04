'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');
const test = require('node:test');
const model = require('./model.js');

const repoRoot = path.resolve(__dirname, '..', '..');
const helperPath = path.join(repoRoot, 'testing', 'browser', 'isolated.cjs');
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const helperSha256 = digest(fs.readFileSync(helperPath));
assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helperPath);

function ownedHashes(directory = __dirname, prefix = '') {
  const result = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.join(prefix, entry.name);
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(result, ownedHashes(target, relative));
    else {
      assert.equal(entry.isFile(), true, 'Owned evidence must be an ordinary file');
      result[relative] = digest(fs.readFileSync(target));
    }
  }
  return result;
}

test('actual standalone DOM, keyboard, failback failures, reset, CSP and awaited cleanup', { timeout: 120000 }, async (t) => {
  assert.equal(process.version, 'v22.23.4');
  assert.equal(require(path.join(repoRoot, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version, '1.56.1');
  const before = ownedHashes();
  const observations = [];
  let checksFailed = false;
  const check = (name, action) => t.test(name, async () => {
    try { await action(); } catch (failure) { checksFailed = true; throw failure; }
  });
  const session = await openIsolatedLesson(path.join('learning', 'S119', 'index.html'));
  const page = session.page;
  const errors = [];
  const remoteRequests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (/^(https?|wss?):/i.test(request.url())) remoteRequests.push(request.url());
  });
  const key = async (id) => {
    await page.locator(`#${id}`).focus();
    await page.keyboard.press('Enter');
  };
  const reset = async (fixture = 'aligned') => {
    await key('reset-button');
    assert.equal(await page.locator('#phase').textContent(), 'awaiting-restore');
    assert.equal(await page.locator('#fixture-select').evaluate((el) => document.activeElement === el), true);
    await page.locator('#fixture-select').selectOption(fixture);
  };
  const gates = async (fixture = 'aligned') => {
    await reset(fixture);
    await key('restore-button');
    await key('sync-button');
    await key('ownership-button');
  };
  const returnAt = async (value) => {
    await page.locator('#cohort-percent').fill(String(value));
    await page.locator('#cohort-percent').press('Enter');
  };
  const observe = async (name, extra = {}) => {
    const snapshot = await page.evaluate(() => {
      const fields = {};
      for (const id of ['phase', 'restoration', 'synchronization', 'ownership', 'requested', 'effective', 'attempted', 'passed', 'failed', 'unknown', 'safe-aborts', 'completed', 'outcome', 'error']) {
        fields[id] = document.getElementById(id).textContent;
      }
      return {
        fields, retainedActions: document.querySelectorAll('#history > li').length,
        latestFixedData: document.getElementById('observations').textContent,
      };
    });
    observations.push({ name, ...snapshot, ...extra });
  };
  try {
    assert.equal(session.browserVersion, '156.0.4314.50');
    await check('standalone load, exact banner, labeled controls and actual focus navigation', async () => {
      assert.equal(await page.title(), 'S119 - Controlled regional failback rehearsal');
      assert.equal(await page.locator('.banner').textContent(), model.BANNER);
      assert.equal(await page.getByLabel('Fixed observation fixture').count(), 1);
      assert.equal(await page.getByLabel('Return cohort percent', { exact: true }).count(), 1);
      await page.locator('#fixture-select').focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#restore-button').evaluate((el) => document.activeElement === el), true);
      const focusOutline = await page.locator('#restore-button').evaluate((el) => getComputedStyle(el).outlineWidth);
      assert.equal(focusOutline, '3px');
      await observe('load-and-keyboard', { focusOutline });
    });

    await check('return rejects unchecked data and ownership then completes progressive keyboard cohorts', async () => {
      await key('restore-button');
      await returnAt(25);
      assert.equal(await page.locator('#outcome').getAttribute('data-outcome'), 'negative');
      assert.equal(await page.locator('#effective').textContent(), '0%');
      assert.equal(await page.locator('#attempted').textContent(), '0');
      await key('sync-button');
      await returnAt(25);
      assert.equal(await page.locator('#outcome').getAttribute('data-outcome'), 'negative');
      await key('ownership-button');
      await returnAt(100);
      assert.match(await page.locator('#outcome').textContent(), /next bounded cohort is 25%/);
      for (const percent of [25, 50, 100]) {
        await returnAt(percent);
        assert.equal(await page.locator('#outcome').getAttribute('data-outcome'), 'positive');
        assert.equal(await page.locator('#effective').textContent(), `${percent}%`);
      }
      assert.equal(await page.locator('#phase').textContent(), 'complete');
      assert.equal(await page.locator('#attempted').textContent(), '6');
      assert.equal(await page.locator('#passed').textContent(), '6');
      assert.equal(await page.locator('#failed').textContent(), '0');
      assert.equal(await page.locator('#unknown').textContent(), '0');
      assert.equal(await page.locator('#history > li').count(), 9);
      assert.equal(await page.locator('#fixture-select').isDisabled(), true);
      await observe('ordered-positive-with-safe-aborts');
    });

    await check('typed input error retains trace, announces error and focuses the exact field', async () => {
      const retained = await page.locator('#history').textContent();
      for (const invalid of ['25.0', ' 25', '+25', '25x', '', '26']) {
        await returnAt(invalid);
        assert.equal(await page.locator('#cohort-percent').getAttribute('aria-invalid'), 'true');
        assert.equal(await page.locator('#cohort-percent').evaluate((el) => document.activeElement === el), true);
        assert.match(await page.getByRole('alert').textContent(), /enter exactly 25, 50, or 100/);
        assert.equal(await page.locator('#history').textContent(), retained);
        assert.equal(await page.locator('#phase').textContent(), 'complete');
      }
      await observe('typed-error-with-unchanged-history');
    });

    await check('reset is keyboard accessible, clears state/error and cannot be shadowed by a reset control', async () => {
      await page.evaluate(() => {
        const input = document.createElement('input');
        input.name = 'reset';
        input.id = 'test-reset-shadow';
        document.getElementById('cohort-form').append(input);
      });
      await key('reset-button');
      assert.equal(await page.locator('#cohort-percent').inputValue(), '25');
      assert.equal(await page.locator('#history > li').count(), 0);
      assert.equal(await page.locator('#phase').textContent(), 'awaiting-restore');
      assert.equal(await page.locator('#attempted').textContent(), '0');
      assert.equal(await page.locator('#error').textContent(), '');
      assert.equal(await page.locator('#cohort-percent').getAttribute('aria-invalid'), null);
      assert.equal(await page.locator('#fixture-select').isEnabled(), true);
      assert.equal(await page.locator('#fixture-select').evaluate((el) => document.activeElement === el), true);
      await page.locator('#test-reset-shadow').evaluate((el) => el.remove());
      await observe('reset-and-reset-method-shadow-regression');
    });

    await check('known failed restoration-state, writer/fence and capacity gates reject return', async () => {
      for (const [fixture, gate] of [
        ['lagging-state', 'synchronization'],
        ['unfenced-writer', 'ownership'],
        ['capacity-shortfall', 'outcome'],
      ]) {
        await gates(fixture);
        await returnAt(25);
        assert.equal(await page.locator('#outcome').getAttribute('data-outcome'), 'negative');
        if (gate !== 'outcome') assert.equal(await page.locator(`#${gate}`).textContent(), 'negative');
        assert.equal(await page.locator('#attempted').textContent(), '0');
        assert.equal(await page.locator('#effective').textContent(), '0%');
        assert.equal(await page.locator('#completed').textContent(), 'No');
        await observe(`failed-gate-${fixture}`);
      }
    });

    await check('unverified restore, synchronization and ownership remain unknown without exposure', async () => {
      for (const [fixture, gate] of [
        ['restore-unknown', 'restoration'],
        ['sync-unknown', 'synchronization'],
        ['ownership-unknown', 'ownership'],
      ]) {
        await gates(fixture);
        await returnAt(25);
        assert.equal(await page.locator(`#${gate}`).textContent(), 'unknown');
        assert.equal(await page.locator('#outcome').getAttribute('data-outcome'), 'unknown');
        assert.equal(await page.locator('#attempted').textContent(), '0');
        assert.equal(await page.locator('#effective').textContent(), '0%');
        await observe(`unknown-gate-${fixture}`);
      }
    });

    await check('committed effects, state and latency failures retain earlier successful journeys', async () => {
      for (const fixture of ['continuity-break', 'latency-breach']) {
        await gates(fixture);
        await returnAt(25);
        assert.equal(await page.locator('#outcome').getAttribute('data-outcome'), 'positive');
        await returnAt(50);
        assert.equal(await page.locator('#phase').textContent(), 'held');
        assert.equal(await page.locator('#outcome').getAttribute('data-outcome'), 'negative');
        assert.equal(await page.locator('#attempted').textContent(), '4');
        assert.equal(await page.locator('#passed').textContent(), '3');
        assert.equal(await page.locator('#failed').textContent(), '1');
        assert.equal(await page.locator('#history > li').count(), 5);
        const evidence = await page.locator('#history').textContent();
        await returnAt(100);
        assert.equal(await page.locator('#attempted').textContent(), '4');
        assert.equal(await page.locator('#completed').textContent(), 'No');
        assert.equal((await page.locator('#history').textContent()).startsWith(evidence), true);
        await observe(`attempted-failure-${fixture}`);
      }
    });

    await check('unknown and mismatched effective routing or identity cannot certify migration', async () => {
      for (const [fixture, outcome, passed, failed, unknown] of [
        ['routing-mismatch', 'negative', '0', '2', '0'],
        ['routing-unknown', 'unknown', '0', '0', '2'],
        ['journey-unknown', 'unknown', '1', '0', '1'],
      ]) {
        await gates(fixture);
        await returnAt(25);
        assert.equal(await page.locator('#outcome').getAttribute('data-outcome'), outcome);
        assert.equal(await page.locator('#attempted').textContent(), '2');
        assert.equal(await page.locator('#passed').textContent(), passed);
        assert.equal(await page.locator('#failed').textContent(), failed);
        assert.equal(await page.locator('#unknown').textContent(), unknown);
        assert.equal(await page.locator('#completed').textContent(), 'No');
        if (fixture === 'routing-unknown') assert.equal(await page.locator('#effective').textContent(), 'Unknown (not observed)');
        if (fixture === 'routing-mismatch') assert.equal(await page.locator('#effective').textContent(), '0%');
        await observe(`unverified-migration-${fixture}`);
      }
    });

    await check('unknown fixture input errors are text-only and leave the actual DOM state intact', async () => {
      await reset();
      await page.locator('#fixture-select').evaluate((select) => {
        const option = document.createElement('option');
        option.value = '<img src=x onerror=alert(1)>';
        option.textContent = 'Deliberately invalid local test input';
        option.id = 'invalid-fixture-option';
        select.append(option);
        select.value = option.value;
      });
      await key('restore-button');
      assert.match(await page.getByRole('alert').textContent(), /ERR_S119_INPUT/);
      assert.equal(await page.locator('#history > li').count(), 0);
      assert.equal(await page.locator('#phase').textContent(), 'awaiting-restore');
      assert.equal(await page.locator('img').count(), 0);
      await page.locator('#invalid-fixture-option').evaluate((el) => el.remove());
      await observe('invalid-fixed-fixture-error-text-only');
    });

    await check('24 retained actions stop without pruning and reset releases only local state', async () => {
      await reset();
      await key('restore-button');
      for (let i = 1; i < 24; i += 1) await returnAt(25);
      assert.equal(await page.locator('#history > li').count(), 24);
      for (const id of ['restore-button', 'sync-button', 'ownership-button', 'return-button']) {
        assert.equal(await page.locator(`#${id}`).isDisabled(), true);
      }
      assert.equal(await page.locator('#reset-button').isEnabled(), true);
      assert.match(await page.getByRole('status').textContent(), /24-action limit/);
      await observe('bounded-history');
      await reset();
      assert.equal(await page.locator('#return-button').isEnabled(), true);
    });

    await check('real CSP blocks inline scripts, eval, styles, data connections/images and form navigation', async () => {
      const beforeUrl = page.url();
      await page.evaluate((url) => {
        const script = document.createElement('script');
        script.id = 'csp-probe-script';
        script.src = url;
        document.head.append(script);
      }, pathToFileURL(path.join(__dirname, 'evidence', 'csp-probe.js')).href);
      await page.waitForFunction(() => window.__s119CspResult !== undefined);
      const csp = await page.evaluate(() => window.__s119CspResult);
      await page.evaluate(() => document.getElementById('csp-probe-script').remove());
      assert.equal(csp.execution, 'allowed external self script, not DevTools evaluation');
      assert.equal(csp.inlineExecuted, false);
      assert.equal(csp.evalExecuted, false);
      assert.equal(csp.evalBlocked, true);
      assert.equal(csp.connectionBlocked, true);
      assert.equal(csp.imageBlocked, true);
      assert.equal(csp.bodyVisible, true);
      for (const directive of ['script-src-elem', 'script-src', 'style-src-elem', 'connect-src', 'img-src', 'form-action']) {
        assert.equal(csp.violations.some((v) => v.directive === directive && v.disposition === 'enforce'), true, `Actual enforced ${directive} violation must be observed`);
      }
      assert.equal(page.url(), beforeUrl);
      assert.deepEqual(remoteRequests, []);
      await observe('enforced-CSP-no-real-network', { csp });
    });

    assert.equal(checksFailed, false, 'All actual browser assertions must pass before any positive evidence capture');
    assert.equal(observations.length, 18);
    assert.deepEqual(errors, []);
    assert.deepEqual(remoteRequests, []);
  } finally {
    await session.close();
  }
  const after = ownedHashes();
  assert.deepEqual(after, before, 'Browser verification must not rewrite any owned source or proof');
  const evidence = {
    cardId: 'A-S119', parentId: 'D-S119', packet: 'SC-S119', kanoUnit: 'A-S119',
    observedAtUtc: new Date().toISOString(),
    mode: 'actual local DOM observations of fixed fictional failback DATA only',
    nodeVersion: process.version, playwrightVersion: '1.56.1', browserVersion: session.browserVersion,
    helperSha256, helperPublication: '53c0c0d', observations,
    pageErrors: errors, remoteRequests,
    ownedSourceAndProofFilesBefore: before, ownedSourceAndProofFilesAfter: after,
    ownedBytesUnchangedDuringVerification: true,
    cleanup: 'awaited session.close() in finally completed',
    liveAzureResult: false, nativeProof: false, originalSourceParentAccepted: false,
    productionNode24Validated: false, unattendedHarnessQualified: false, additionalCredits: 0,
  };
  if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
    const name = `browser-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}.json`;
    const target = path.join(__dirname, 'evidence', 'raw', name);
    fs.writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
    t.diagnostic(`Deliberate append-only capture: ${path.relative(repoRoot, target)}`);
  } else {
    t.diagnostic(`READ-ONLY: ${Object.keys(before).length} owned source/proof files unchanged; ${observations.length} actual observations; awaited cleanup completed.`);
  }
});
