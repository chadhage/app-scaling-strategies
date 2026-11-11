'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { qualifyEdge } = require('../../../testing/browser/qualify/qualify.cjs');
const { readQualified } = require('../../../testing/browser/qualify/adapters.cjs');
const { openLessonScratchSession } = require('../../../testing/browser/lifecycle/scratch-session.cjs');
const ownership = require('./native-ownership.cjs');
const { expected } = require('./oracle.cjs');
const fixtures = require('../fixtures.js');
const { remaining, write } = require('./budget.cjs');
const { sha } = require('./integrity.cjs');
const { record } = require('./journal.cjs');
const root = path.resolve(__dirname, '..');
const output = process.env.C012_BROWSER_OUTPUT;
const observations = [], sessions = [];
let actualQualification = null;
async function snapshot(page) {
  return page.evaluate(() => ({
    ids: [...document.querySelectorAll('[id]')].map(element => element.id),
    rows: [...document.querySelectorAll('#facts tr')].map(row => [row.dataset.fact, ...[...row.cells].map(cell => cell.textContent)]),
    visible: [...document.querySelectorAll('#facts tr')].map(row => {
      const bounds = row.getBoundingClientRect(), style = getComputedStyle(row);
      return bounds.width > 0 && bounds.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    }),
    live: document.querySelectorAll('[role="status"],[aria-live]').length,
    disabled: document.getElementById('acknowledge').disabled,
    checked: document.getElementById('acknowledge').checked,
    status: document.getElementById('status').textContent,
    theme: document.documentElement.dataset.theme,
    background: getComputedStyle(document.documentElement).getPropertyValue('--cp-bg').trim(),
    scripts: [...document.scripts].map(script => ({ src: script.getAttribute('src'), text: script.src ? null : script.textContent })),
    focused: document.activeElement.id
  }));
}
async function assertView(page, name, options = {}) {
  const view = await snapshot(page);
  const observation = { sequence: observations.length + 1, name: name || 'cleared', ...view };
  observations.push(observation);
  fs.appendFileSync(output + '.observations.original.ndjson', JSON.stringify(observation) + '\n');
  assert.equal(new Set(view.ids).size, view.ids.length, 'actual rendered ids unique after every action');
  assert.equal(view.live, 1, 'one polite region after every action');
  assert.deepEqual(view.rows, name ? expected(name, options.asOf) : [], 'every actual rendered key label and value');
  assert.ok(view.visible.every(Boolean), 'invisible text does not count as a visible fact');
  assert.equal(view.disabled, options.blocked === undefined ? name !== 'held' : options.blocked);
  assert.equal(view.checked, Boolean(options.checked));
  assert.equal(view.scripts.filter(script => !script.src).length, 1);
  return view;
}
async function keyboard(page, id, key, name, options) {
  await page.locator('#' + id).focus();
  await assertView(page, name, options);
  assert.equal(await page.locator('#' + id).evaluate(element => document.activeElement === element), true);
  await page.keyboard.press(key);
}
async function review(page, name, options) {
  await keyboard(page, 'review', 'Enter', null);
  await page.waitForFunction(() => /^(Local pre-run explanation ready|Review blocked)/.test(document.getElementById('status').textContent));
  return assertView(page, name, options);
}
async function tampering(page) {
  const capacity = JSON.parse(fixtures.held.text); capacity.allowance.value.allowance.lease.remainingUnits = 100;
  const pricing = JSON.parse(fixtures.held.text); pricing.allowance.value.allowance.prices.standard = 0;
  const estimate = JSON.parse(fixtures.held.text); estimate.estimate.spend = 0;
  for (const [id, value, name, options] of [
    ['owner', 'conductor-b', 'held', { blocked: true }],
    ['reservation-id', 'rsv-00000002', 'held', { blocked: true }],
    ['as-of', '2001', 'held', { blocked: true, asOf: 2001 }],
    ['as-of', '', null, { blocked: true }],
    ['packet', JSON.stringify(capacity), null, { blocked: true }],
    ['packet', JSON.stringify(pricing), null, { blocked: true }],
    ['packet', JSON.stringify(estimate), null, { blocked: true }],
    ['packet', '{"message":"<img src=x onerror=alert(1)>","executionAuthorized":true}', null, { blocked: true }]
  ]) {
    await page.selectOption('#scenario', 'held'); await assertView(page, null);
    await keyboard(page, 'load', 'Enter', null); await assertView(page, null);
    await page.fill('#' + id, value); await assertView(page, null);
    await review(page, name, options);
    assert.match((await snapshot(page)).status, /^Review blocked/);
    await page.evaluate(() => {
      const checkbox = document.getElementById('acknowledge');
      checkbox.checked = true; checkbox.dispatchEvent(new Event('change'));
    });
    await assertView(page, name, options);
    assert.match((await snapshot(page)).status, /^No local acknowledgement/);
    await keyboard(page, 'reset', 'Enter', name, options); await assertView(page, null);
  }
}
function assertFreeze(freeze) {
  for (const item of freeze.sources) assert.equal(sha(fs.readFileSync(path.join(root, item.path))), item.sha256, 'final source unchanged: ' + item.path);
}
async function main() {
  assert.ok(output && path.isAbsolute(output), 'owned browser observation output required');
  remaining(900000);
  record([process.pid], 'actual-native-controller-before-qualification-and-UI-work');
  const freezeFile = process.env.C012_SOURCE_FREEZE || path.join(root, require('./phase-plan.json').sourceFreeze);
  const freeze = JSON.parse(fs.readFileSync(freezeFile));
  assertFreeze(freeze);
  const qualification = await qualifyEdge({ timeoutMs: Math.min(remaining(600000), 120000) });
  actualQualification = qualification;
  assert.equal(require('playwright/package.json').version, '1.56.1');
  assert.equal(qualification.ok, true, JSON.stringify(qualification.reasonCodes));
  assert.equal(qualification.signature.status, 'Valid');
  assert.equal(qualification.signature.publisher, 'Microsoft Corporation');
  assert.equal(qualification.major, 157);
  assert.ok(readQualified().qualifiedMajors.includes(qualification.major));
  assert.equal(readQualified().qualifiedMajors.includes(158), false);
  const restore = ownership.observe();
  try {
    for (const injected of [false, true]) {
      remaining(600000);
      const label = injected ? 'injected-failure' : 'success';
      let session, authority, cleanup, injectedFailure = null, phaseError = null;
      const requests = [], errors = [];
      try {
        session = await ownership.scope.run(label, () => openLessonScratchSession('capability\\C012\\index.html', {
          deadlineMs: 120000, graceMs: 60000, listMs: 60000, terminateMs: 120000,
          gracefulMs: 60000, settleMs: 60000, exitSettleMs: 45000, scratchParent: ownership.runtime
        }));
        authority = await ownership.authenticate(session, label);
        const page = session.page;
        page.on('request', request => requests.push({ url: request.url(), method: request.method() }));
        page.on('pageerror', error => errors.push(error.message));
        if (injected) {
          await page.selectOption('#scenario', 'held'); await assertView(page, null);
          await keyboard(page, 'load', 'Enter', null); await assertView(page, null);
          await review(page, 'held');
          try { assert.fail('C012 deliberate assertion failure after actual final-page success'); }
          catch (error) { injectedFailure = { code: error.code, message: error.message }; assert.equal(error.code, 'ERR_ASSERTION'); }
        } else {
          for (const theme of ['light', 'dark']) {
            await page.emulateMedia({ colorScheme: theme });
            await page.reload({ waitUntil: 'load' });
            const first = await assertView(page, null);
            assert.equal(first.theme, theme);
            assert.equal(first.background, theme === 'light' ? '#f7f4ef' : '#3d3b3a');
            await page.keyboard.press('Tab'); await assertView(page, null);
            for (const name of Object.keys(fixtures)) {
              await page.selectOption('#scenario', name); await assertView(page, null);
              await keyboard(page, 'load', 'Enter', null); await assertView(page, null);
              await page.locator('#review').focus(); await assertView(page, null);
              const focus = await page.locator('#review').evaluate(element => {
                const style = getComputedStyle(element); return { outline: style.outlineStyle, width: style.outlineWidth };
              });
              assert.notEqual(focus.outline, 'none'); assert.notEqual(focus.width, '0px');
              await review(page, name);
              if (name === 'held') {
                await keyboard(page, 'acknowledge', 'Space', name); await assertView(page, name, { checked: true });
                assert.match((await snapshot(page)).status, /^Local facts marked reviewed only/);
                await page.fill('#owner', 'conductor-b'); await assertView(page, null);
                await keyboard(page, 'review', 'Enter', null);
                await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Review blocked'));
                await assertView(page, 'held', { blocked: true });
              }
              await keyboard(page, 'reset', 'Enter', name === 'held' ? 'held' : name, name === 'held' ? { blocked: true } : undefined);
              const cleared = await assertView(page, null); assert.equal(cleared.focused, 'packet');
            }
            await tampering(page);
          }
        }
        assert.deepEqual(errors, [], 'no actual browser business-script or CSP error');
        assert.ok(requests.every(request => request.url.startsWith('file:') && request.method === 'GET'), 'no server/execution/outbound network authority');
      } catch (error) { phaseError = error; throw error; }
      finally {
        let closeError = null;
        try {
          if (session) {
            if (authority) cleanup = await ownership.close(session, authority);
            else { const closed = await session.close(); assert.equal(closed.clean, true); cleanup = { clean: true, authenticatedRootUnavailable: true }; }
          }
        } catch (error) {
          closeError = error;
          cleanup = { clean: false, code: error.code || null, message: error.message, outcome: error.outcome || null };
        } finally {
          const record = { label, injectedFailure, requests, errors, cleanup };
          sessions.push(record);
          fs.appendFileSync(output + '.sessions.original.ndjson', JSON.stringify(record) + '\n');
        }
        if (closeError) throw new AggregateError(phaseError ? [phaseError, closeError] : [closeError], 'C012 actual phase and exact owned cleanup failures');
      }
      assert.equal(Boolean(injectedFailure), injected);
      assert.equal(cleanup.clean, true);
      assertFreeze(freeze);
    }
  } finally { restore(); }
  write(output, { schema: 'C012-one-final-source-native-success-injected-failure-campaign/1', qualification,
    playwright: '1.56.1', frozenSourceSha256: sha(fs.readFileSync(freezeFile)),
    sessions, observations, actualPage: true, concurrentNativeMaximum: 1, extraNativeBrowsers: 0 });
  console.log(JSON.stringify({ nativeSessions: sessions.length, observations: observations.length, clean: sessions.every(session => session.cleanup.clean), qualifiedMajor: qualification.major }));
}
main().catch(error => {
  const failure = { schema: 'C012-native-campaign-failure-not-a-success/1', qualification: actualQualification,
    sessions, observations, error: { name: error.name, code: error.code || null, message: error.message, stack: error.stack } };
  if (output) fs.writeFileSync(output + '.failure.json', JSON.stringify(failure, null, 2) + '\n', { flag: 'wx' });
  console.error(error); process.exitCode = 1;
});
