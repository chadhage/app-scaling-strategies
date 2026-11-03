'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const lesson = path.resolve(__dirname, '..');
const repo = path.resolve(lesson, '..', '..');
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const helperSHA256 = crypto.createHash('sha256').update(fs.readFileSync(helper)).digest('hex');
assert.equal(helperSHA256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
assert.equal(playwrightVersion, '1.56.1');
assert.match(process.version, /^v22\./);
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const evidencePath = path.join(lesson, 'evidence', 'browser-observation.json');
if (capture && fs.existsSync(evidencePath)) throw new Error('Refusing to overwrite historical browser proof.');

async function main() {
  const startedAtUtc = new Date().toISOString();
  const checks = [];
  const pageErrors = [];
  const consoleErrors = [];
  const requests = [];
  let phase = 'normal';
  let session;
  let report;
  const check = async (name, action) => {
    const observed = await action();
    checks.push({ name, result: 'passed', observed: observed === undefined ? null : observed });
  };
  try {
    session = await openIsolatedLesson('learning\\S039\\index.html');
    assert.match(session.browserVersion, /^156\./);
    const { page } = session;
    page.on('pageerror', (error) => pageErrors.push({ phase, message: error.message }));
    page.on('console', (entry) => {
      if (entry.type() === 'error') consoleErrors.push({ phase, text: entry.text() });
    });
    page.on('request', (request) => requests.push({ phase, url: request.url(), method: request.method() }));
    await page.addInitScript(() => {
      window.__s039Csp = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__s039Csp.push({
          effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI,
          disposition: event.disposition,
        });
      });
    });
    await page.reload({ waitUntil: 'load' });
    const text = async (id) => (await page.locator(`#${id}`).textContent()).trim();
    const count = () => page.locator('#history > li').count();
    const latest = async () => JSON.parse(await page.locator('#history > li pre').last().textContent());
    const statuses = () => page.locator('#checks tr td:nth-child(2)').allTextContents();
    const choose = async ({ kind = 'upload', storage = 'durable', observation = 'intact' } = {}) => {
      for (const [id, value] of Object.entries({ kind, storage, observation })) {
        await page.locator(`#${id}`).selectOption(value);
      }
    };
    const run = async (config) => {
      await choose(config);
      for (const id of ['prepare', 'handoff', 'verify']) await page.locator(`#${id}`).click();
      return latest();
    };
    const reset = () => page.locator('#restart').click();
    let firstFailure;
    let normalDiagnostics;

    await check('actual DOM initial unknown, exact banner, guarded controls and unshadowed form methods', async () => {
      assert.equal(await page.title(), 'S039 — Instance-local temporary state');
      assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.match(await text('verdict'), /^UNKNOWN/);
      assert.match(await text('state'), /Run 1\/12 · Owner A · Phase idle/);
      assert.equal(await count(), 0);
      assert.equal(await page.locator('#prepare').isEnabled(), true);
      for (const id of ['handoff', 'verify']) assert.equal(await page.locator(`#${id}`).isDisabled(), true);
      assert.equal(await page.evaluate(() => typeof document.getElementById('controls').reset), 'function');
      return { state: await text('state'), verdict: await text('verdict') };
    });
    await check('native arrows, Tab, Enter and Space conduct a local artifact loss', async () => {
      await page.locator('#storage').focus();
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#storage').inputValue(), 'local');
      for (const id of ['observation', 'prepare']) {
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), id);
      }
      await page.keyboard.press('Enter');
      assert.match(await text('state'), /Owner A · Phase prepared/);
      assert.equal(await page.locator('#conditions').evaluate((element) => element.disabled), true);
      for (const id of ['kind', 'storage', 'observation']) assert.equal(await page.locator(`#${id}`).isDisabled(), true);
      await page.locator('#handoff').focus();
      await page.keyboard.press('Space');
      assert.match(await text('state'), /Owner B · Phase transferred/);
      await page.locator('#verify').focus();
      await page.keyboard.press('Enter');
      assert.match(await text('verdict'), /^FAILURE/);
      const localResult = await latest();
      assert.equal(await text('response'), `HTTP-like response 200 · Bytes 0/${localResult.expected.byteLength}`);
      assert.match(await text('reason'), /remained on A/);
      assert.match(await text('impact'), /synthetic-interrupted-transition/);
      assert.deepEqual(await statuses(), ['failed', 'failed', 'failed', 'failed']);
      assert.equal(await page.locator('#trace > li').count(), 3);
      assert.equal(await count(), 1);
      firstFailure = await page.locator('#history > li').first().textContent();
      return { response: await text('response'), result: await latest() };
    });
    await check('keyboard reset restores defaults, untested result and focus while retaining failure', async () => {
      await page.locator('#restart').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'kind');
      assert.match(await text('state'), /Run 2\/12 · Owner A · Phase idle/);
      assert.match(await text('verdict'), /^UNKNOWN/);
      assert.match(await text('counts'), /0 attempted/);
      assert.equal(await text('expected'), 'Not prepared.');
      assert.equal(await text('observed'), 'Not observed.');
      for (const [id, value] of Object.entries({ kind: 'upload', storage: 'durable', observation: 'intact' })) {
        assert.equal(await page.locator(`#${id}`).inputValue(), value);
      }
      assert.equal(await page.locator('#history > li').first().textContent(), firstFailure);
      assert.match(await text('totals'), /1\/12 attempted \/ 0 successful \/ 1 failed \/ 0 unknown/);
      return { state: await text('state'), totals: await text('totals') };
    });
    await check('all three durable fixtures preserve actual bytes and workflow checkpoints on B', async () => {
      const observed = [];
      for (const kind of ['upload', 'workflow', 'generated']) {
        if (kind !== 'upload') await reset();
        const result = await run({ kind });
        assert.match(await text('verdict'), /^SUCCESS/);
        assert.equal(result.owner, 'B');
        assert.deepEqual(result.observed, result.expected);
        assert.ok(result.observed.byteLength > 0);
        assert.deepEqual(await statuses(), ['passed', 'passed', 'passed', 'passed']);
        assert.equal(await page.locator('#history > li').first().textContent(), firstFailure);
        observed.push(result);
      }
      return observed;
    });
    await check('an empty 200 response fails even in durable mode', async () => {
      await reset();
      const result = await run({ observation: 'empty-200' });
      assert.equal(result.verdict, 'failure');
      assert.equal(result.responseStatus, 200);
      assert.equal(result.observed.byteLength, 0);
      assert.equal(result.observed.checkpoint, null);
      assert.match(await text('reason'), /Status alone cannot establish/);
      return result;
    });
    await check('same-length corruption fails exact-byte and teaching-checksum assertions', async () => {
      await reset();
      const result = await run({ kind: 'generated', observation: 'corrupt' });
      assert.equal(result.verdict, 'failure');
      assert.equal(result.observed.byteLength, result.expected.byteLength);
      assert.notEqual(result.observed.bytes, result.expected.bytes);
      assert.notEqual(result.observed.checksum, result.expected.checksum);
      assert.deepEqual(await statuses(), ['passed', 'failed', 'failed', 'passed']);
      return result;
    });
    await check('matching bytes cannot hide lost workflow state', async () => {
      await reset();
      const result = await run({ kind: 'workflow', observation: 'missing-checkpoint' });
      assert.equal(result.verdict, 'failure');
      assert.equal(result.observed.bytes, result.expected.bytes);
      assert.equal(result.observed.checkpoint, null);
      assert.deepEqual(await statuses(), ['passed', 'passed', 'passed', 'failed']);
      return result;
    });
    await check('unavailable retrieval remains unknown with unobserved metrics, not invented loss', async () => {
      await reset();
      const result = await run({ observation: 'unavailable' });
      assert.equal(result.verdict, 'unknown');
      assert.equal(result.failed, 0);
      assert.equal(result.unknown, 1);
      assert.equal(result.responseStatus, null);
      assert.equal(result.observed, null);
      assert.match(await text('response'), /unobserved/);
      assert.deepEqual(await statuses(), ['unknown', 'unknown', 'unknown', 'unknown']);
      assert.match(await text('totals'), /8\/12 attempted \/ 3 successful \/ 4 failed \/ 1 unknown/);
      return result;
    });
    await check('tampered input and wrong-state events produce focused, non-destructive DOM errors', async () => {
      await reset();
      const history = await page.locator('#history').textContent();
      const initialState = await text('state');
      await page.locator('#storage').evaluate((element) => {
        const option = document.createElement('option');
        option.value = 'unsupported';
        option.textContent = 'Synthetic invalid input probe';
        option.selected = true;
        element.append(option);
      });
      await page.locator('#prepare').click();
      assert.equal(await page.locator('#error').isVisible(), true);
      assert.match(await text('error'), /Unsupported storage/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
      assert.equal(await text('state'), initialState);
      assert.equal(await page.locator('#history').textContent(), history);
      await page.locator('#storage').evaluate((element) => element.querySelector('option[value="unsupported"]').remove());
      await page.locator('#storage').selectOption('durable');
      await page.locator('#verify').dispatchEvent('click');
      assert.match(await text('error'), /requires transferred/);
      assert.equal(await text('state'), initialState);
      assert.equal(await page.locator('#history').textContent(), history);
      await page.locator('#controls').evaluate((element) => element.requestSubmit());
      assert.match(await text('error'), /form navigation is disabled/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
      assert.equal(await page.locator('#history').textContent(), history);
      await run();
      assert.equal(await page.locator('#error').isHidden(), true);
      return { invalidInput: 'Unsupported storage', wrongState: 'requires transferred', historyPreserved: true };
    });
    await check('keyboard history expansion and narrow viewport preserve readable results', async () => {
      const summary = page.locator('#history > li').first().locator('summary');
      await summary.focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#history > li').first().locator('details').evaluate((element) => element.open), true);
      await page.keyboard.press('Shift+Tab');
      assert.notEqual(await page.evaluate(() => document.activeElement.tagName), 'BODY');
      await page.setViewportSize({ width: 360, height: 800 });
      const sizes = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(sizes.scroll <= sizes.width, JSON.stringify(sizes));
      assert.equal(await page.locator('#history > li').first().textContent(), firstFailure);
      await page.setViewportSize({ width: 1100, height: 850 });
      return sizes;
    });
    await check('12-run lifetime cap locks controls and guards reset without erasing any outcome', async () => {
      for (let index = 0; index < 3; index += 1) {
        await reset();
        await run();
      }
      assert.equal(await count(), 12);
      assert.match(await text('state'), /Run 12\/12/);
      assert.match(await text('totals'), /12\/12 attempted \/ 7 successful \/ 4 failed \/ 1 unknown/);
      for (const id of ['prepare', 'handoff', 'verify', 'restart']) {
        assert.equal(await page.locator(`#${id}`).isDisabled(), true);
      }
      const before = await page.locator('#history').textContent();
      await page.locator('#restart').dispatchEvent('click');
      assert.match(await text('error'), /12-run page budget/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
      assert.equal(await page.locator('#history').textContent(), before);
      assert.equal(await page.locator('#history > li').first().textContent(), firstFailure);
      return { totals: await text('totals'), retained: await count() };
    });
    await check('normal browser operation has no page errors, CSP violations or HTTP requests', async () => {
      normalDiagnostics = {
        pageErrors: pageErrors.filter((entry) => entry.phase === 'normal'),
        consoleErrors: consoleErrors.filter((entry) => entry.phase === 'normal'),
        cspViolations: await page.evaluate(() => window.__s039Csp),
        httpRequests: requests.filter((entry) => /^https?:/.test(entry.url)),
        fileRequests: requests.filter((entry) => entry.url.startsWith('file:')).length,
      };
      assert.deepEqual(normalDiagnostics.pageErrors, []);
      assert.deepEqual(normalDiagnostics.consoleErrors, []);
      assert.deepEqual(normalDiagnostics.cspViolations, []);
      assert.deepEqual(normalDiagnostics.httpRequests, []);
      assert.equal(normalDiagnostics.fileRequests, 4);
      return normalDiagnostics;
    });
    phase = 'intentional-csp-probe';
    await check('actual enforced CSP blocks inline code and a synthetic outbound connection', async () => {
      const inlineResult = await page.evaluate(() => {
        window.__s039Inline = false;
        const script = document.createElement('script');
        script.textContent = 'window.__s039Inline = true;';
        document.body.append(script);
        return window.__s039Inline;
      });
      assert.equal(inlineResult, false);
      const connection = await page.evaluate(async () => {
        try {
          await fetch('https://s039.invalid/synthetic-csp-probe');
          return 'unexpected success';
        } catch (failure) {
          return failure.name;
        }
      });
      assert.equal(connection, 'TypeError');
      await page.waitForFunction(() => window.__s039Csp.some((event) => event.effectiveDirective === 'connect-src')
        && window.__s039Csp.some((event) => event.effectiveDirective === 'script-src-elem'));
      const violations = await page.evaluate(() => window.__s039Csp);
      assert.ok(violations.every((entry) => entry.disposition === 'enforce'));
      assert.deepEqual(pageErrors, []);
      return { inlineExecutionBlocked: true, connectionBlocked: true, violations };
    });
    report = {
      schemaVersion: 1, cardId: 'A-S039', workerId: 'worker-A-S039', mode: 'synthetic',
      startedAtUtc, node: process.version, playwrightVersion, browserVersion: session.browserVersion,
      helper: 'testing\\browser\\isolated.cjs', helperPublishedRevision: '53c0c0d', helperSHA256,
      protocol: 'tests\\browser.cjs', checks, normalDiagnostics, pageErrors, consoleErrors, requests,
      forcedClicks: false, skippedAssertions: false, foregroundLease: false,
      ordinaryVerification: 'Read-only to proof; CAPTURE_BROWSER_EVIDENCE=1 is a deliberate producer operation.',
      qualification: 'Node 22 test tooling and this offline Playwright/installed Edge pair only; not production Node 24, native Azure or unattended lifecycle certification.',
    };
  } finally {
    if (session) await session.close();
  }
  report.completedAtUtc = new Date().toISOString();
  report.cleanup = 'Awaited session.close() in finally; helper completed owned context/browser/scratch cleanup.';
  if (capture) fs.writeFileSync(evidencePath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(`Browser OK: ${checks.length} actual DOM/keyboard/error/reset/failure/CSP checks; ${capture ? 'deliberately captured' : 'proof unchanged'}; awaited cleanup complete.`);
}

main().catch((failure) => {
  console.error(failure);
  process.exitCode = 1;
});
