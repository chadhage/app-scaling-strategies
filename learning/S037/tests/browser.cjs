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
if (capture && fs.existsSync(evidencePath)) throw new Error('Browser proof already exists; ordinary reruns are read-only.');

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
    session = await openIsolatedLesson('learning\\S037\\index.html');
    assert.match(session.browserVersion, /^156\./);
    const { page } = session;
    page.on('pageerror', (error) => pageErrors.push({ phase, message: error.message }));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push({ phase, text: message.text() });
    });
    page.on('request', (request) => requests.push({
      phase, url: request.url(), method: request.method(),
    }));
    await page.addInitScript(() => {
      window.__s037Csp = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__s037Csp.push({
          effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI,
          disposition: event.disposition,
        });
      });
    });
    await page.reload({ waitUntil: 'load' });
    const text = async (id) => (await page.locator(`#${id}`).textContent()).trim();
    const historyCount = () => page.locator('#history > li').count();
    const statuses = () => page.locator('#probe-rows tr td:nth-child(2)').allTextContents();
    const select = async (reader, writer = 'schema1', payload = 'intact') => {
      await page.locator('#reader').selectOption(reader);
      await page.locator('#writer').selectOption(writer);
      await page.locator('#payload').selectOption(payload);
    };
    const attempt = () => page.locator('#transition').click();
    const fixture = await text('fixture');
    let firstFailure;
    let retainedBeforeReset;
    let normalDiagnostics;

    await check('actual DOM initial unknown, exact banner and safe form methods', async () => {
      assert.equal(await page.title(), 'S037 — Session serialization change');
      assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.match(await text('verdict'), /^Unknown/);
      assert.match(await text('state'), /Run 1 · Active synthetic version v1 · 0\/12/);
      assert.equal(await historyCount(), 0);
      assert.equal(await page.locator('#rollback').isEnabled(), false);
      assert.equal(await page.evaluate(() => typeof document.getElementById('controls').reset), 'function');
      assert.deepEqual(JSON.parse(await text('expected')), {
        sessionId: 'synthetic-session-037', cart: [{ sku: 'DEMO-PEN', quantity: 2 }], checkoutStep: 2,
      });
      return { verdict: await text('verdict'), state: await text('state') };
    });
    await check('native arrow, Tab and Enter operate an incompatible reader failure', async () => {
      await page.locator('#reader').focus();
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#reader').inputValue(), 'schema2-only');
      for (const id of ['writer', 'payload', 'transition']) {
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), id);
      }
      await page.keyboard.press('Enter');
      assert.match(await text('verdict'), /^FAILURE/);
      assert.match(await text('counts'), /1 preserved \/ 2 failed \/ 0 unknown/);
      assert.deepEqual(await statuses(), ['rejected', 'rejected', 'preserved']);
      assert.match(await text('state'), /version v1/);
      assert.equal(await historyCount(), 1);
      firstFailure = await page.locator('#history > li').first().textContent();
      return { counts: await text('counts'), statuses: await statuses() };
    });
    await check('keyboard-compatible transition preserves all state and locks configuration', async () => {
      for (const id of ['payload', 'writer', 'reader']) {
        await page.keyboard.press('Shift+Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), id);
      }
      await page.keyboard.press('ArrowUp');
      assert.equal(await page.locator('#reader').inputValue(), 'dual');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      assert.match(await text('verdict'), /^SUCCESS/);
      assert.match(await text('counts'), /3 preserved \/ 0 failed \/ 0 unknown/);
      assert.match(await text('state'), /version v2/);
      assert.equal(await page.locator('#conditions').evaluate((element) => element.disabled), true);
      for (const id of ['reader', 'writer', 'payload']) assert.equal(await page.locator(`#${id}`).isDisabled(), true);
      assert.equal(await page.locator('#transition').isEnabled(), false);
      assert.equal(await page.locator('#rollback').isEnabled(), true);
      assert.equal(await page.locator('#history > li').first().textContent(), firstFailure);
      assert.equal(await text('fixture'), fixture);
      return { counts: await text('counts'), impact: await text('impact') };
    });
    await check('actual keyboard rollback rereads retained candidate bytes', async () => {
      await page.locator('#rollback').focus();
      await page.keyboard.press('Enter');
      assert.match(await text('verdict'), /^SUCCESS — rollback/);
      assert.match(await text('counts'), /1 preserved \/ 0 failed \/ 0 unknown/);
      assert.match(await text('state'), /version v1/);
      assert.equal(await page.locator('#conditions').evaluate((element) => element.disabled), false);
      for (const id of ['reader', 'writer', 'payload']) assert.equal(await page.locator(`#${id}`).isEnabled(), true);
      assert.equal(await historyCount(), 3);
      assert.match(await text('totals'), /2 failed/);
      return { state: await text('state'), totals: await text('totals') };
    });
    await check('silent-reset failure is visible as lost cart and checkout step', async () => {
      await select('reset-on-error');
      await attempt();
      assert.match(await text('verdict'), /^FAILURE/);
      assert.match(await text('counts'), /Silent resets detected: 2/);
      assert.deepEqual(await statuses(), ['lost', 'lost', 'preserved']);
      assert.match(await text('probe-rows'), /"cart":\[\],"checkoutStep":0/);
      assert.equal(await text('fixture'), fixture);
      assert.match(await text('impact'), /safe-abort-before-exposure/);
      return { counts: await text('counts'), rows: await text('probe-rows') };
    });
    await check('new writes fail the old-reader coexistence and rollback gate', async () => {
      await select('dual', 'schema2');
      await attempt();
      assert.match(await text('counts'), /2 preserved \/ 1 failed \/ 0 unknown/);
      assert.deepEqual(await statuses(), ['preserved', 'preserved', 'rejected']);
      assert.match(await text('probe-rows'), /legacy cannot read schema 2/);
      assert.match(await text('state'), /version v1/);
      return { counts: await text('counts'), statuses: await statuses() };
    });
    await check('missing payload is unknown and does not become a successful transition', async () => {
      await select('dual', 'schema1', 'unavailable');
      await attempt();
      assert.match(await text('verdict'), /^UNKNOWN/);
      assert.match(await text('counts'), /2 preserved \/ 0 failed \/ 1 unknown/);
      assert.deepEqual(await statuses(), ['unknown', 'preserved', 'preserved']);
      assert.match(await text('existing'), /unavailable — unknown/);
      assert.equal(await text('fixture'), fixture);
      return { counts: await text('counts'), state: await text('state') };
    });
    await check('malformed JSON is a known read failure, not a reset or unknown', async () => {
      await select('dual', 'schema1', 'malformed');
      await attempt();
      assert.match(await text('verdict'), /^FAILURE/);
      assert.match(await text('counts'), /2 preserved \/ 1 failed \/ 0 unknown/);
      assert.match(await text('counts'), /Silent resets detected: 0/);
      assert.match(await text('probe-rows'), /Malformed JSON/);
      assert.equal(await historyCount(), 7);
      return { counts: await text('counts') };
    });
    await check('tampered select produces a focused error without changing state or proof', async () => {
      const before = {};
      for (const id of ['state', 'verdict', 'counts', 'history', 'fixture', 'candidate']) before[id] = await text(id);
      await page.locator('#reader').evaluate((element) => {
        element.add(new Option('Invalid injected test selection', 'not-a-reader'));
        element.value = 'not-a-reader';
      });
      await attempt();
      assert.equal(await page.locator('#error').isVisible(), true);
      assert.match(await text('error'), /declared reader, writer and payload/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'error');
      for (const [id, value] of Object.entries(before)) assert.equal(await text(id), value, id);
      retainedBeforeReset = await text('history');
      return { alert: await text('error'), unchangedActions: await historyCount() };
    });
    await check('native keyboard reset restores unknown defaults, focus and retained history', async () => {
      await page.locator('#restart').focus();
      await page.keyboard.press('Enter');
      assert.match(await text('state'), /Run 2 · Active synthetic version v1/);
      assert.match(await text('verdict'), /^Unknown/);
      assert.match(await text('counts'), /^0 read probes/);
      assert.equal(await page.locator('#reader').inputValue(), 'dual');
      assert.equal(await page.locator('#writer').inputValue(), 'schema1');
      assert.equal(await page.locator('#payload').inputValue(), 'intact');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'reader');
      assert.equal(await page.locator('#reader').evaluate((element) => getComputedStyle(element).outlineWidth), '3px');
      assert.equal(await page.locator('#error').isVisible(), false);
      assert.equal(await text('history'), retainedBeforeReset);
      assert.equal(await text('fixture'), fixture);
      return { state: await text('state'), retainedActions: await historyCount(), focus: 'reader' };
    });
    await check('actual DOM action cap retains all 12 results and reset cannot bypass it', async () => {
      await select('schema2-only');
      for (let count = 0; count < 5; count += 1) await attempt();
      assert.equal(await historyCount(), 12);
      assert.equal(await page.locator('#transition').isEnabled(), false);
      assert.equal(await page.locator('#rollback').isEnabled(), false);
      assert.equal(await page.locator('#conditions').evaluate((element) => element.disabled), true);
      for (const id of ['reader', 'writer', 'payload']) assert.equal(await page.locator(`#${id}`).isDisabled(), true);
      assert.equal(await page.locator('#history > li').first().textContent(), firstFailure);
      await page.locator('#restart').click();
      assert.match(await text('verdict'), /^Unknown/);
      assert.equal(await historyCount(), 12);
      assert.equal(await page.locator('#transition').isEnabled(), false);
      return { state: await text('state'), retainedActions: await historyCount() };
    });
    await check('actual DOM run cap disables a thirteenth reset without losing history', async () => {
      for (let run = 3; run < 12; run += 1) await page.locator('#restart').click();
      assert.match(await text('state'), /Run 12 · Active synthetic version v1 · 12\/12/);
      assert.equal(await page.locator('#restart').isEnabled(), false);
      assert.equal(await historyCount(), 12);
      assert.equal(await page.locator('#history > li').first().textContent(), firstFailure);
      return { state: await text('state'), resetEnabled: false };
    });
    await check('narrow viewport preserves readable controls without body overflow', async () => {
      await page.setViewportSize({ width: 380, height: 900 });
      const layout = await page.evaluate(() => ({
        viewport: window.innerWidth, body: document.documentElement.scrollWidth,
        reader: document.getElementById('reader').getBoundingClientRect().width,
      }));
      assert.ok(layout.body <= layout.viewport, JSON.stringify(layout));
      assert.ok(layout.reader > 200 && layout.reader < 380);
      return layout;
    });
    await check('normal interactions emit no page, console, CSP or network errors', async () => {
      const csp = await page.evaluate(() => window.__s037Csp);
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(consoleErrors, []);
      assert.deepEqual(csp, []);
      assert.ok(requests.length >= 4);
      assert.ok(requests.every((request) => request.url.startsWith('file:') && request.method === 'GET'));
      normalDiagnostics = { pageErrors: [], consoleErrors: [], csp: [], requests: requests.slice() };
      return normalDiagnostics;
    });
    await check('actual CSP blocks inline execution and a reserved synthetic outbound URL', async () => {
      phase = 'intentional-csp-probe';
      const blocked = await page.evaluate(async () => {
        const script = document.createElement('script');
        script.textContent = 'window.__s037InlineRan = true';
        document.body.append(script);
        let connectionBlocked = false;
        try { await fetch('https://synthetic.invalid/s037'); } catch { connectionBlocked = true; }
        return { inlineRan: window.__s037InlineRan === true, connectionBlocked };
      });
      assert.deepEqual(blocked, { inlineRan: false, connectionBlocked: true });
      await page.waitForFunction(() => window.__s037Csp.length >= 2);
      const violations = await page.evaluate(() => window.__s037Csp);
      assert.ok(violations.some((event) => event.effectiveDirective.startsWith('script-src') && event.blockedURI === 'inline'));
      assert.ok(violations.some((event) => event.effectiveDirective === 'connect-src' && event.blockedURI.startsWith('https://synthetic.invalid')));
      assert.ok(violations.every((event) => event.disposition === 'enforce'));
      assert.equal(pageErrors.length, 0);
      return { ...blocked, violations };
    });
    report = {
      schemaVersion: 1, cardId: 'A-S037', workerId: 'worker-A-S037',
      mode: 'actual isolated browser against a local synthetic lesson',
      startedAtUtc, node: process.version, playwrightVersion, browserVersion: session.browserVersion,
      helper: { path: 'testing\\browser\\isolated.cjs', publishedCommit: '53c0c0d', sha256: helperSHA256 },
      entry: 'learning\\S037\\index.html', checksPassed: checks.length, checks,
      normalDiagnostics, intentionalCspConsole: consoleErrors.filter((entry) => entry.phase === 'intentional-csp-probe'),
      requests, pageErrors, forcedClicks: false, skippedAssertions: false,
      foregroundLease: false, productionNode24Validated: false, nativeProof: false,
    };
  } finally {
    if (session) await session.close();
  }
  report.cleanup = 'awaited isolated session.close() in finally; no resources or listener created';
  report.completedAtUtc = new Date().toISOString();
  if (capture) fs.writeFileSync(evidencePath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(report));
}
main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
