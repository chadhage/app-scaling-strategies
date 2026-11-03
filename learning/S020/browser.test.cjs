'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const helper = path.resolve(__dirname, '..', '..', 'testing', 'browser', 'isolated.cjs');
const helperSha256 = createHash('sha256').update(fs.readFileSync(helper)).digest('hex');
assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055',
  'Only the published 53c0c0d helper is qualified for this lesson.');
const { openIsolatedLesson } = require(helper);
const observations = [];
const text = (page, id) => page.locator(`#${id}`).textContent();
const active = (page) => page.evaluate(() => document.activeElement.id);

async function withLesson(scenario, checks) {
  const isolated = await openIsolatedLesson('learning\\S020\\index.html');
  const record = {
    scenario, browserVersion: isolated.browserVersion, helperSha256,
    startedAtUtc: new Date().toISOString(), passed: false, cleanup: 'pending'
  };
  observations.push(record);
  const errors = [];
  isolated.page.on('pageerror', (error) => errors.push(error.message));
  try {
    assert.match(isolated.browserVersion, /^156\./);
    await checks(isolated.page, record);
    assert.deepEqual(errors, [], 'No uncaught lesson runtime errors');
    record.passed = true;
  } catch (error) {
    record.error = error.message;
    throw error;
  } finally {
    await isolated.close();
    record.cleanup = 'awaited isolated.close() completed';
    record.finishedAtUtc = new Date().toISOString();
    record.pageErrors = errors;
  }
}

async function blockPromotion(page) {
  for (const id of ['exhaust', 'unsafe-expansion', 'promote']) await page.locator(`#${id}`).click();
}

test('real keyboard controls exhaust, reject, block, measure, and archive/reset without losing history', async () => {
  await withLesson('keyboard-safety-and-reset', async (page, record) => {
    assert.equal(await page.locator('.banner').textContent(),
      'Training rehearsal - synthetic data - not a live Azure result');
    assert.equal(await text(page, 'verdict'), 'UNKNOWN');
    assert.equal(await text(page, 'attempted'), '0');
    await page.keyboard.press('Tab');
    assert.equal(await active(page), 'allowance');
    for (const [id, value] of [['allowance', '4'], ['extra-units', '1'], ['budget-ms', '250']]) {
      assert.equal(await active(page), id);
      await page.keyboard.press('Control+A');
      await page.keyboard.type(value);
      await page.keyboard.press('Tab');
    }
    assert.equal(await active(page), 'apply-config');
    await page.keyboard.press('Enter');
    assert.equal(await active(page), 'exhaust');
    await page.keyboard.press('Enter');
    assert.equal(await text(page, 'allocated-total'), '4');
    assert.equal(await text(page, 'reserved-units'), '2');
    assert.equal(await page.locator('#configuration-fields').evaluate((fieldset) => fieldset.disabled), true);
    assert.equal(await page.locator('#allowance').isDisabled(), true);
    assert.equal(await active(page), 'unsafe-expansion');
    await page.keyboard.press('Enter');
    assert.equal(await text(page, 'requested-total'), '5');
    assert.equal(await text(page, 'allocated-total'), '4');
    assert.equal(await text(page, 'rejection-source'), 'Harness admission limit');
    assert.equal(await text(page, 'unsupported-journeys'), '2');
    assert.equal(await text(page, 'withheld-journeys'), '4');
    assert.equal(await active(page), 'promote');
    await page.keyboard.press('Enter');
    assert.equal(await active(page), 'observation');
    assert.equal(await text(page, 'promotion'), 'blocked');
    assert.equal(await text(page, 'route'), 'reserved-v1');
    await page.keyboard.press('Tab');
    assert.equal(await active(page), 'probe');
    await page.keyboard.press('Enter');
    assert.equal(await text(page, 'verdict'), 'PASS');
    assert.equal(await text(page, 'attempted'), '4');
    assert.equal(await text(page, 'successful'), '4');
    assert.equal(await text(page, 'failed'), '0');
    assert.equal(await text(page, 'unknown'), '0');
    assert.equal(await page.locator('#samples tr').count(), 4);
    assert.equal(await page.locator('#trace li').count(), 4);
    assert.match(await text(page, 'native-quota'), /^UNTESTED/);
    assert.match(await text(page, 'user-outcome'), /expansion safely aborted before exposure/);
    assert.equal(await text(page, 'cleanup'), 'N/A - no resources created');
    record.observedBeforeReset = {
      verdict: await text(page, 'verdict'), requested: await text(page, 'requested-total'),
      allocated: await text(page, 'allocated-total'), reserved: await text(page, 'reserved-units'),
      unsupportedJourneys: await text(page, 'unsupported-journeys'), nativeQuota: await text(page, 'native-quota')
    };
    await page.keyboard.press('Tab');
    assert.equal(await active(page), 'archive-run');
    await page.keyboard.press('Space');
    assert.equal(await active(page), 'allowance');
    assert.equal(await text(page, 'verdict'), 'UNKNOWN');
    assert.equal(await text(page, 'attempted'), '0');
    assert.equal(await text(page, 'allocated-total'), '2');
    assert.equal(await page.locator('#allowance').inputValue(), '4');
    assert.equal(await page.locator('#observation').inputValue(), 'healthy');
    assert.equal(await text(page, 'history-count'), '1');
    assert.match(await page.locator('#history').textContent(), /Run 1: PASS/);
    await page.locator('#archive-run').focus();
    await page.keyboard.press('Enter');
    assert.equal(await text(page, 'history-count'), '1', 'Empty reset must not invent another completed run');
    assert.equal(await active(page), 'allowance');
    assert.equal(await page.evaluate(() => typeof document.getElementById('settings').reset), 'function');
    record.keyboard = 'Tab, Control+A, typed input, Enter, Space; guided next-action and reset focus verified';
    record.reset = 'Default UNKNOWN run, zero observations, old PASS retained; empty reset not archived; native reset not shadowed';
  });
});

test('actual invalid input, out-of-order state, forged fixtures, locked settings and probe bounds cannot mutate results', async () => {
  await withLesson('input-state-and-bounds', async (page, record) => {
    for (const [id, value] of [['allowance', ''], ['allowance', '3.5'], ['allowance', '7'],
      ['extra-units', '0'], ['budget-ms', '99']]) {
      await page.locator('#allowance').fill('4');
      await page.locator('#extra-units').fill('1');
      await page.locator('#budget-ms').fill('250');
      await page.locator(`#${id}`).fill(value);
      await page.locator('#apply-config').click();
      assert.equal(await page.locator('#error').isVisible(), true);
      assert.equal(await active(page), 'error');
      assert.match(await text(page, 'error'), /No configuration was changed/);
      assert.equal(await text(page, 'declared-allowance'), '4');
      assert.equal(await text(page, 'allocated-total'), '2');
      assert.equal(await page.locator('#trace li').count(), 0);
    }
    await page.evaluate(() => document.getElementById('promote').dispatchEvent(new Event('click')));
    assert.match(await text(page, 'error'), /Request the unsafe expansion first/);
    assert.equal(await text(page, 'route'), 'reserved-v1');
    assert.equal(await page.locator('#trace li').count(), 0);
    await page.locator('#allowance').fill('5');
    await page.locator('#extra-units').fill('2');
    await page.locator('#budget-ms').fill('100');
    await page.locator('#apply-config').click();
    await page.locator('#exhaust').click();
    await page.evaluate(() => {
      document.getElementById('configuration-fields').disabled = false;
      document.getElementById('allowance').value = '6';
      document.getElementById('settings').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    assert.match(await text(page, 'error'), /Configuration is locked/);
    assert.equal(await text(page, 'declared-allowance'), '5');
    assert.equal(await text(page, 'allocated-total'), '5');
    await page.locator('#unsafe-expansion').click();
    await page.locator('#promote').click();
    await page.evaluate(() => {
      const option = new Option('<img src=x onerror=alert(1)>', '<script>forged</script>');
      document.getElementById('observation').append(option);
      document.getElementById('observation').value = option.value;
    });
    await page.locator('#probe').click();
    assert.match(await text(page, 'error'), /ERR_S020_INPUT/);
    assert.equal(await text(page, 'attempted'), '0');
    assert.equal(await page.locator('#trace li').count(), 3);
    assert.equal(await page.locator('img').count(), 0, 'Untrusted option text is never inserted as HTML');
    await page.locator('#observation').selectOption('healthy');
    for (let count = 0; count < 3; count += 1) await page.locator('#probe').click();
    assert.equal(await text(page, 'attempted'), '12');
    assert.equal(await text(page, 'verdict'), 'PASS');
    assert.equal(await text(page, 'requested-total'), '7');
    assert.equal(await text(page, 'unsupported-journeys'), '4');
    assert.equal(await page.locator('#probe').isDisabled(), true);
    await page.evaluate(() => document.getElementById('probe').dispatchEvent(new Event('click')));
    assert.match(await text(page, 'error'), /ERR_S020_BOUND/);
    assert.equal(await text(page, 'attempted'), '12');
    assert.equal(await page.locator('#trace li').count(), 6);
    await page.setViewportSize({ width: 360, height: 800 });
    assert.equal(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth), true);
    await page.locator('#archive-run').focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    assert.equal(await active(page), 'archive-run');
    assert.notEqual(await page.locator('#archive-run').evaluate((button) => getComputedStyle(button).outlineStyle), 'none');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#error').isVisible(), false);
    assert.equal(await text(page, 'history-count'), '1');
    record.invalidInputCases = 5;
    record.guards = ['out-of-order promotion', 'locked configuration despite DOM tampering',
      'forged observation without HTML interpretation', 'three-probe bound despite synthetic click dispatch'];
    record.observedBound = { attempted: 12, actionTrace: 6, requested: 7, allocated: 5, unsupportedJourneys: 4 };
    record.accessibility = '360px viewport without body overflow; visible keyboard outline; focused text-only errors and reset';
  });
});

test('failed and unknown journeys remain cumulative through recovery and bounded archived history', async () => {
  await withLesson('failure-unknown-retention-and-pruning', async (page, record) => {
    await blockPromotion(page);
    await page.locator('#observation').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#observation').inputValue(), 'over-budget');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    assert.equal(await text(page, 'verdict'), 'FAIL');
    assert.equal(await text(page, 'failed'), '1');
    assert.match(await page.locator('#samples tr').first().textContent(), /200251Correctfailure/);
    await page.locator('#observation').selectOption('healthy');
    await page.locator('#probe').click();
    assert.equal(await text(page, 'verdict'), 'FAIL');
    assert.equal(await text(page, 'attempted'), '8');
    assert.equal(await text(page, 'successful'), '7');
    assert.equal(await text(page, 'failed'), '1');
    assert.equal(await text(page, 'user-outcome'), 'Interrupted reserved service');
    await page.locator('#archive-run').click();
    const failedArchive = page.locator('#history article').first();
    assert.equal(await failedArchive.getAttribute('data-verdict'), 'FAIL');
    await failedArchive.locator('summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await failedArchive.locator('tbody tr').count(), 8);
    assert.match(await failedArchive.locator('tbody tr').first().textContent(), /200251Correctfailure/);
    await blockPromotion(page);
    await page.locator('#observation').selectOption('missing-observations');
    await page.locator('#probe').click();
    assert.equal(await text(page, 'verdict'), 'UNKNOWN');
    assert.equal(await text(page, 'successful'), '2');
    assert.equal(await text(page, 'unknown'), '2');
    assert.match(await page.locator('#samples tr').nth(2).textContent(), /UnknownUnknownUnknownunknown/);
    await page.locator('#observation').selectOption('healthy');
    await page.locator('#probe').click();
    assert.equal(await text(page, 'verdict'), 'UNKNOWN');
    assert.equal(await text(page, 'attempted'), '8');
    assert.equal(await text(page, 'successful'), '6');
    assert.equal(await text(page, 'unknown'), '2');
    await page.locator('#archive-run').click();
    assert.equal(await page.locator('#history article[data-verdict="FAIL"]').count(), 1);
    assert.equal(await page.locator('#history article[data-verdict="UNKNOWN"]').count(), 1);
    record.retainedRecovery = {
      failedRun: { attempted: 8, successful: 7, failed: 1, verdict: 'FAIL' },
      missingRun: { attempted: 8, successful: 6, unknown: 2, verdict: 'UNKNOWN' }
    };
    for (let index = 0; index < 3; index += 1) {
      await blockPromotion(page);
      await page.locator('#probe').click();
      await page.locator('#archive-run').click();
    }
    await page.locator('#exhaust').click();
    await page.locator('#archive-run').click();
    assert.equal(await text(page, 'history-count'), '4');
    assert.equal(await text(page, 'pruned-count'), '2');
    assert.equal(await page.locator('#history article').count(), 4);
    assert.equal(await page.locator('#history article').first().getAttribute('data-verdict'), 'UNKNOWN',
      'An archived partial run with no probes must not become a success');
    assert.match(await page.locator('#history article').first().textContent(), /0 attempted/);
    assert.equal(await active(page), 'allowance');
    assert.equal(await text(page, 'verdict'), 'UNKNOWN');
    record.archiveBound = { archived: 6, retained: 4, explicitlyPruned: 2, emptyNewRun: 'UNKNOWN' };
  });
});

test('actual CSP permits local assets but blocks inline code, eval, connections, images, frames, base and forms', async () => {
  await withLesson('csp-runtime-enforcement', async (page, record) => {
    assert.equal(await page.evaluate(() => typeof globalThis.S020Lesson.act), 'function');
    assert.equal(await page.locator('.banner').evaluate((banner) => getComputedStyle(banner).backgroundColor), 'rgb(23, 60, 89)');
    const originalURL = page.url();
    const injected = await page.evaluate(async () => {
      globalThis.__s020Violations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        globalThis.__s020Violations.push({ directive: event.effectiveDirective, blocked: event.blockedURI });
      });
      const script = document.createElement('script');
      script.textContent = 'globalThis.__s020InlineRan = true';
      document.head.append(script);
      const evalButton = document.createElement('button');
      evalButton.id = 'csp-eval-probe';
      evalButton.type = 'button';
      evalButton.textContent = 'Test eval under actual browser input';
      evalButton.addEventListener('click', () => {
        try { new Function('globalThis.__s020EvalRan = true')(); } catch (error) {
          globalThis.__s020EvalBlocked = error instanceof EvalError;
        }
      });
      document.body.append(evalButton);
      let connectionBlocked = false;
      try { await fetch('http://127.0.0.1:9/s020-csp-probe'); } catch { connectionBlocked = true; }
      const image = document.createElement('img');
      image.alt = 'CSP test only';
      image.src = 'data:image/png;base64,AAAA';
      document.body.append(image);
      const frame = document.createElement('iframe');
      frame.title = 'CSP test only';
      frame.src = 'data:text/html,blocked';
      document.body.append(frame);
      const base = document.createElement('base');
      base.href = 'https://invalid.example/';
      document.head.append(base);
      return { connectionBlocked };
    });
    // CDP evaluation allows eval; a real browser input event must exercise the document's CSP.
    await page.locator('#csp-eval-probe').click();
    await page.locator('#exhaust').click();
    assert.equal(await text(page, 'allocated-total'), '4', 'Local scripts remain operational after blocked code injections');
    await page.evaluate(() => {
      const form = document.createElement('form');
      form.action = 'http://127.0.0.1:9/s020-form-probe';
      document.body.append(form);
      form.submit();
    });
    await page.waitForFunction(() => {
      const directives = new Set(globalThis.__s020Violations.map((event) => event.directive));
      return ['script-src-elem', 'script-src', 'connect-src', 'img-src', 'frame-src', 'base-uri', 'form-action']
        .every((directive) => directives.has(directive));
    });
    const observed = await page.evaluate(() => ({
      violations: globalThis.__s020Violations,
      inlineRan: globalThis.__s020InlineRan === true,
      evalRan: globalThis.__s020EvalRan === true,
      evalBlocked: globalThis.__s020EvalBlocked === true,
      imageLoaded: document.querySelector('img').naturalWidth > 0
    }));
    assert.equal(observed.evalBlocked, true);
    assert.equal(injected.connectionBlocked, true);
    assert.equal(observed.inlineRan, false);
    assert.equal(observed.evalRan, false);
    assert.equal(observed.imageLoaded, false);
    assert.equal(page.url(), originalURL);
    record.csp = { localAssetsLoaded: true, ...injected, ...observed, navigationUnchanged: true };
  });
});

test.after(() => {
  if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1') return;
  const stem = process.env.S020_CAPTURE_STEM || `browser-${Date.now()}`;
  assert.match(stem, /^browser-\d+$/);
  const target = path.join(__dirname, 'evidence', `${stem}-observations.json`);
  fs.writeFileSync(target, `${JSON.stringify({
    cardId: 'A-S020', workerId: 'worker-A-S020', kanoUnit: 'A-S020', packet: 'SC-S020',
    node: process.version, playwright: require(path.resolve(__dirname, '..', '..', 'testing', 'browser',
      'node_modules', 'playwright', 'package.json')).version,
    helper: 'testing\\browser\\isolated.cjs', helperSha256, helperPublishedCommit: '53c0c0d',
    captureWasExplicit: true, observations
  }, null, 2)}\n`, { flag: 'wx' });
});
