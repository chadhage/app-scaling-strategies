'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const helperPath = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const expectedHelper = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(digest(fs.readFileSync(helperPath)), expectedHelper);
const { openIsolatedLesson } = require(helperPath);
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const banner = 'Training rehearsal - synthetic data - not a live Azure result';
const observations = [];

function ownedBytes() {
  const entries = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(target);
      else entries.push([path.relative(root, target), digest(fs.readFileSync(target))]);
    }
  }
  walk(root);
  return entries.sort((a, b) => a[0].localeCompare(b[0]));
}

async function dom(page) {
  return page.evaluate(() => {
    const text = (id) => document.getElementById(id).textContent;
    return {
      banner: text('training-banner'), verifier: text('verifier'),
      userImpact: text('user-impact'), cleanup: text('cleanup'), migration: text('migration'),
      phase: text('boot-status'), fraction: text('fraction'),
      counts: Object.fromEntries(['attempted', 'uninterrupted', 'interrupted', 'unknown',
        'lost', 'retried', 'duplicated', 'unresolved', 'late', 'cancelled']
        .map((key) => [key, Number(text(key))])),
      ledger: [...document.querySelectorAll('#work-ledger tr')].map((row) => row.textContent),
      history: [...document.querySelectorAll('#history li')].map((row) => row.textContent),
      error: text('error'), errorHidden: document.getElementById('error').hidden,
      focusedId: document.activeElement.id,
      formResetType: typeof document.getElementById('lesson-input').reset,
    };
  });
}

async function completeByKeyboard(page) {
  await page.locator('#start-work').press('Enter');
  assert.equal((await dom(page)).focusedId, 'observe-work');
  await page.keyboard.press('Enter');
  assert.equal((await dom(page)).focusedId, 'check-ledger');
  await page.keyboard.press('Enter');
  assert.equal((await dom(page)).focusedId, 'reset-lesson');
}

async function screenshot(page, name) {
  if (capture) await page.screenshot({ path: path.join(root, 'evidence', 'raw', `${name}.png`), fullPage: true });
}

function publishObservations() {
  if (!capture) return;
  const result = {
    schemaVersion: 1, cardId: 'A-S100', workerId: 'worker-A-S100',
    capturedAtUtc: new Date().toISOString(), mode: 'actual DOM observations of fixed synthetic data',
    helperPublishedCommit: '53c0c0d', helperSha256: expectedHelper,
    playwrightVersion: require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version,
    nodeVersion: process.version, productionNode24Qualified: false,
    deliberateCaptureFlag: 'CAPTURE_BROWSER_EVIDENCE=1',
    lifecyclePrototypeQualified: false,
    lifecycleLimit: 'Awaited finally close completed for these observations; no overall unattended lifecycle qualification is inferred.',
    observations,
  };
  fs.writeFileSync(path.join(root, 'evidence', 'browser-acceptance.json'), `${JSON.stringify(result, null, 2)}\n`);
}

test('actual DOM: keyboard, strict input error, expected-negative pass, positive, unknown, fail, reset and cap', async () => {
  const before = ownedBytes();
  const record = { check: 'operator-journeys', startedAtUtc: new Date().toISOString(), snapshots: [], pageErrors: [] };
  const session = await openIsolatedLesson(path.join('learning', 'S100', 'index.html'));
  try {
    const page = session.page;
    record.browserVersion = session.browserVersion;
    page.on('pageerror', (error) => record.pageErrors.push(error.message));
    assert.equal(await page.title(), 'S100 — Forced active work accounting');
    const initial = await dom(page);
    assert.equal(initial.banner, banner);
    assert.equal(initial.formResetType, 'function');
    assert.equal(initial.counts.attempted, 0);
    assert.equal(await page.locator('#observe-work').isDisabled(), true);
    assert.equal(await page.locator('#check-ledger').isDisabled(), true);
    assert.equal(await page.locator('#start-work').isEnabled(), true);
    record.snapshots.push({ step: 'initial', ...initial });

    await page.evaluate(() => {
      const option = document.createElement('option');
      option.value = 'not-a-declared-trace';
      option.textContent = 'Invalid test value';
      document.getElementById('condition').append(option);
    });
    await page.selectOption('#condition', 'not-a-declared-trace');
    await page.locator('#start-work').press('Enter');
    const invalid = await dom(page);
    assert.match(invalid.error, /^ERR_INPUT:/);
    assert.equal(invalid.errorHidden, false);
    assert.equal(invalid.focusedId, 'error');
    assert.equal(invalid.counts.attempted, 0);
    record.snapshots.push({ step: 'invalid-input-focused-error', ...invalid });
    await page.locator('#reset-lesson').press('Enter');
    assert.equal((await dom(page)).focusedId, 'condition');
    assert.equal((await dom(page)).errorHidden, true);
    assert.equal(await page.inputValue('#condition'), 'forced');
    assert.equal(await page.inputValue('#prediction'), 'interrupted');

    await page.keyboard.press('Tab');
    assert.equal((await dom(page)).focusedId, 'prediction');
    await page.keyboard.press('Tab');
    assert.equal((await dom(page)).focusedId, 'start-work');
    await completeByKeyboard(page);
    const forced = await dom(page);
    assert.equal(forced.verifier, 'PASS');
    assert.match(forced.userImpact, /Interrupted transition — expected interruption observed; 3 interrupted, 1 unknown/);
    assert.equal(forced.migration, 'Not established');
    assert.match(forced.cleanup, /Not applicable — data only/);
    assert.deepEqual(forced.counts, {
      attempted: 4, uninterrupted: 0, interrupted: 3, unknown: 1,
      lost: 1, retried: 2, duplicated: 1, unresolved: 1, late: 2, cancelled: 0,
    });
    assert.equal(forced.ledger.length, 4);
    assert.match(forced.ledger[1], /1300/);
    assert.match(forced.ledger[2], /interruptedtrue60022new-v2/);
    assert.equal(forced.history.length, 1);
    record.snapshots.push({ step: 'expected-interruption-education-pass', ...forced });
    await screenshot(page, 'forced-work');

    await page.keyboard.press('Enter');
    const reset = await dom(page);
    assert.equal(reset.history.length, 1);
    assert.equal(reset.counts.attempted, 4);
    assert.equal(reset.focusedId, 'condition');
    assert.match(reset.phase, /phase: ready/);
    await page.selectOption('#condition', 'orderly');
    await page.selectOption('#prediction', 'uninterrupted');
    await completeByKeyboard(page);
    const orderly = await dom(page);
    assert.equal(orderly.verifier, 'PASS');
    assert.match(orderly.userImpact, /Uninterrupted synthetic comparison — 4 correct, timely journeys/);
    assert.match(orderly.migration, /only for this fixed synthetic/);
    assert.equal(orderly.counts.attempted, 8);
    assert.equal(orderly.counts.uninterrupted, 4);
    assert.equal(orderly.counts.interrupted, 3);
    assert.equal(orderly.counts.unknown, 1);
    assert.equal(orderly.history.length, 2);
    assert.match(orderly.history[0], /3 interrupted, 1 unknown/);
    record.snapshots.push({ step: 'orderly-positive-with-retained-negative', ...orderly });
    await screenshot(page, 'orderly-work');

    await page.keyboard.press('Enter');
    await page.selectOption('#condition', 'gap');
    await page.selectOption('#prediction', 'unverified');
    await completeByKeyboard(page);
    const gap = await dom(page);
    assert.equal(gap.verifier, 'UNKNOWN');
    assert.match(gap.userImpact, /Unverified — 4 unknown outcomes/);
    assert.equal(gap.migration, 'Not established');
    assert.equal(gap.counts.attempted, 12);
    assert.equal(gap.counts.unknown, 5);
    assert.equal(gap.history.length, 3);
    record.snapshots.push({ step: 'observation-gap-unknown', ...gap });
    await screenshot(page, 'unknown-work');

    await page.keyboard.press('Enter');
    await page.selectOption('#prediction', 'uninterrupted');
    await completeByKeyboard(page);
    const failed = await dom(page);
    assert.equal(failed.verifier, 'FAIL');
    assert.match(failed.userImpact, /3 interrupted, 1 unknown/);
    assert.equal(failed.migration, 'Not established');
    assert.equal(failed.counts.attempted, 16);
    assert.equal(failed.counts.interrupted, 6);
    assert.equal(failed.counts.unknown, 6);
    assert.equal(failed.history.length, 4);
    record.snapshots.push({ step: 'wrong-prediction-assertion-fail', ...failed });
    await screenshot(page, 'failed-prediction');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#start-work').isDisabled(), true);
    await page.evaluate(() => document.getElementById('lesson-input').requestSubmit());
    const capped = await dom(page);
    assert.match(capped.error, /^ERR_LIMIT:/);
    assert.equal(capped.focusedId, 'error');
    assert.equal(capped.counts.attempted, 16);
    assert.equal(capped.history.length, 4);
    record.snapshots.push({ step: 'four-start-cap-focused-error', ...capped });
    assert.deepEqual(record.pageErrors, []);
  } finally {
    await session.close();
    record.finallyCloseAwaited = true;
  }
  if (!capture) assert.deepEqual(ownedBytes(), before, 'Normal browser verification must not write owned evidence');
  record.normalReadOnlyVerified = !capture;
  record.endedAtUtc = new Date().toISOString();
  observations.push(record);
});

test('actual DOM: cancelled reset retains work, phase error is focused, and CSP is enforced', async () => {
  const before = ownedBytes();
  const record = { check: 'reset-errors-csp', startedAtUtc: new Date().toISOString(), snapshots: [], pageErrors: [] };
  const session = await openIsolatedLesson(path.join('learning', 'S100', 'index.html'));
  try {
    const page = session.page;
    record.browserVersion = session.browserVersion;
    page.on('pageerror', (error) => record.pageErrors.push(error.message));
    await page.locator('#start-work').press('Enter');
    await page.locator('#reset-lesson').press('Enter');
    const cancelled = await dom(page);
    assert.equal(cancelled.verifier, 'UNKNOWN');
    assert.equal(cancelled.counts.attempted, 4);
    assert.equal(cancelled.counts.unknown, 4);
    assert.equal(cancelled.counts.cancelled, 1);
    assert.equal(cancelled.history.length, 1);
    assert.equal(cancelled.focusedId, 'condition');
    record.snapshots.push({ step: 'reset-before-observation-retains-attempts', ...cancelled });

    await page.locator('#start-work').press('Enter');
    await page.keyboard.press('Enter');
    await page.locator('#reset-lesson').press('Enter');
    const observedReset = await dom(page);
    assert.equal(observedReset.verifier, 'UNKNOWN');
    assert.equal(observedReset.counts.attempted, 8);
    assert.equal(observedReset.counts.interrupted, 3);
    assert.equal(observedReset.counts.unknown, 5);
    assert.equal(observedReset.counts.lost, 1);
    assert.equal(observedReset.counts.duplicated, 1);
    assert.equal(observedReset.history.length, 2);
    record.snapshots.push({ step: 'reset-after-observation-retains-loss-duplicate', ...observedReset });

    assert.equal(await page.locator('#check-ledger').isDisabled(), true);
    await page.evaluate(() => document.getElementById('check-ledger')
      .dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const phaseError = await dom(page);
    assert.match(phaseError.error, /^ERR_PHASE:/);
    assert.equal(phaseError.focusedId, 'error');
    assert.deepEqual(phaseError.counts, observedReset.counts);
    record.snapshots.push({ step: 'adversarial-dom-phase-skip-focused-error', ...phaseError });
    await page.locator('#reset-lesson').press('Enter');
    assert.equal((await dom(page)).errorHidden, true);
    assert.equal((await dom(page)).focusedId, 'condition');

    await page.evaluate(async () => {
      globalThis.__s100Policy = [];
      globalThis.__s100InlineRan = false;
      document.addEventListener('securitypolicyviolation', (event) => {
        globalThis.__s100Policy.push({
          directive: event.effectiveDirective, blockedURI: event.blockedURI,
          disposition: event.disposition, originalPolicy: event.originalPolicy,
        });
      });
      const script = document.createElement('script');
      script.textContent = 'globalThis.__s100InlineRan = true;';
      document.head.append(script);
      globalThis.__s100ConnectDenied = await fetch('http://127.0.0.1:9/S100-csp-probe')
        .then(() => false, () => true);
    });
    await page.waitForFunction(() => globalThis.__s100Policy.length >= 2);
    record.csp = await page.evaluate(() => ({
      inlineRan: globalThis.__s100InlineRan,
      connectionDenied: globalThis.__s100ConnectDenied, violations: globalThis.__s100Policy,
      meta: document.querySelector('meta[http-equiv="Content-Security-Policy"]').content,
    }));
    assert.equal(record.csp.inlineRan, false);
    assert.equal(record.csp.connectionDenied, true);
    assert.ok(record.csp.violations.some((item) => item.directive === 'script-src-elem' && item.blockedURI === 'inline' && item.disposition === 'enforce'));
    assert.ok(record.csp.violations.some((item) => item.directive === 'connect-src' && item.disposition === 'enforce'));
    assert.match(record.csp.meta, /connect-src 'none'/);
    assert.deepEqual(record.pageErrors, []);
  } finally {
    await session.close();
    record.finallyCloseAwaited = true;
  }
  if (!capture) assert.deepEqual(ownedBytes(), before, 'Normal browser verification must not write owned evidence');
  record.normalReadOnlyVerified = !capture;
  record.endedAtUtc = new Date().toISOString();
  observations.push(record);
  publishObservations();
});
