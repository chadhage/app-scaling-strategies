'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const owned = path.resolve(__dirname, '..');
const root = path.resolve(owned, '..', '..');
const helper = path.join(root, 'testing', 'browser', 'isolated.cjs');
const helperSHA256 = crypto.createHash('sha256').update(fs.readFileSync(helper)).digest('hex');
assert.equal(helperSHA256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(root, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
assert.equal(playwrightVersion, '1.56.1');
assert.match(process.version, /^v22\./);
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const observationName = process.env.S040_BROWSER_CAPTURE_NAME || 'browser-observation';
assert.match(observationName, /^browser-observation(?:-[a-z0-9-]{1,40})?$/);
const observationPath = path.join(owned, 'evidence', `${observationName}.json`);
if (capture && fs.existsSync(observationPath)) throw new Error('Historical browser evidence is immutable; ordinary verification is read-only.');

async function main() {
  const report = {
    cardId: 'A-S040', workerId: 'worker-A-S040', mode: 'synthetic',
    startedAt: new Date().toISOString(), nodeVersion: process.version, playwrightVersion,
    helper: 'testing\\browser\\isolated.cjs', helperPublishedRevision: '53c0c0d',
    helperSHA256, checks: [], pageErrors: [], consoleErrors: [], requests: [], nonFileResponses: [],
    passed: false, sessionClosed: false, nativeProof: false, parentComplete: false,
    productionNode24Validated: false,
  };
  let session;
  let phase = 'exercise';
  let failure;
  const check = async (name, action) => {
    const observed = await action();
    report.checks.push({ name, result: 'passed', observed: observed === undefined ? null : observed });
  };
  try {
    session = await openIsolatedLesson('learning\\S040\\index.html');
    report.browserVersion = session.browserVersion;
    assert.match(report.browserVersion, /^156\./);
    const page = session.page;
    page.on('pageerror', (error) => report.pageErrors.push({ phase, message: error.message }));
    page.on('console', (message) => {
      if (message.type() === 'error') report.consoleErrors.push({ phase, text: message.text() });
    });
    page.on('request', (request) => report.requests.push({ phase, url: request.url(), method: request.method() }));
    page.on('response', (response) => {
      if (new URL(response.url()).protocol !== 'file:') report.nonFileResponses.push(response.url());
    });
    await page.addInitScript(() => {
      window.__s040Csp = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__s040Csp.push({
          effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI,
          disposition: event.disposition,
        });
      });
    });
    await page.reload({ waitUntil: 'load' });
    const text = async (id) => (await page.locator(`#${id}`).textContent()).trim();
    const count = () => page.locator('#history > li').count();
    const record = async (index) => JSON.parse(await page.locator('#history pre').nth(index).textContent());
    const run = () => page.locator('#rehearse').click();
    const reset = () => page.locator('#reset-lesson').click();
    const submitBypass = () => page.evaluate(() => document.getElementById('controls')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    let firstFailure;
    let retainedHistory;

    await check('real DOM loads local assets, exact banner, initial unknown and safe reset method', async () => {
      assert.equal(await page.title(), 'S040 — Cookie-less clients');
      assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.locator('.banner').isVisible(), true);
      assert.equal(await page.locator('.banner').evaluate((node) => getComputedStyle(node).fontWeight), '700');
      assert.equal(await text('verdict'), 'UNKNOWN — not yet rehearsed');
      assert.equal(await count(), 0);
      assert.equal(await page.evaluate(() => typeof document.getElementById('controls').reset), 'function');
      for (const id of ['cookies', 'identity', 'routing', 'state', 'observation']) {
        assert.ok(await page.locator(`label[for="${id}"]`).textContent());
      }
      return { title: await page.title(), runState: await text('run-state') };
    });
    await check('native arrows, Tab and Enter expose cookie-dependent identity failure', async () => {
      await page.locator('#cookies').focus();
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#cookies').inputValue(), 'browser-fixture');
      await page.keyboard.press('ArrowUp');
      assert.equal(await page.locator('#cookies').inputValue(), 'absent');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'identity');
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'cookies');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'identity');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#identity').inputValue(), 'browser-session');
      for (const id of ['routing', 'state', 'observation', 'rehearse']) {
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), id);
      }
      await page.keyboard.press('Enter');
      assert.match(await text('verdict'), /^FAILURE/);
      assert.equal(await text('counts'), '5 passed · 4 failed · 0 unknown checks');
      assert.equal(await count(), 1);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'result-heading');
      firstFailure = await page.locator('#history > li').first().textContent();
      const observed = await record(0);
      assert.deepEqual(observed.clients.map((client) => client.after.status), [401, 401]);
      assert.match(await text('trace'), /REJECTED/);
      return { counts: await text('counts'), statuses: observed.clients.map((client) => client.after.status) };
    });
    await check('stale DOM submission is guarded, announced and non-destructive', async () => {
      const previous = await text('verdict');
      assert.equal(await page.locator('#rehearse').isDisabled(), true);
      for (const id of ['cookies', 'identity', 'routing', 'state', 'observation']) assert.equal(await page.locator(`#${id}`).isDisabled(), true);
      await submitBypass();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'input-error');
      assert.equal(await page.locator('#input-error').getAttribute('role'), 'alert');
      assert.match(await text('input-error'), /Reset the checked rehearsal/);
      assert.equal(await text('verdict'), previous);
      assert.equal(await count(), 1);
      assert.equal(await page.locator('#history > li').first().textContent(), firstFailure);
      return { error: await text('input-error'), retained: await count() };
    });
    await check('Space reset restores default choices, unknown and focus without erasing failure', async () => {
      await page.locator('#reset-lesson').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'cookies');
      assert.equal(await text('verdict'), 'UNKNOWN — not yet rehearsed');
      assert.equal(await page.locator('#input-error').isHidden(), true);
      assert.equal(await count(), 1);
      assert.equal(await page.locator('#history > li').first().textContent(), firstFailure);
      assert.deepEqual(await page.locator('#conditions select').evaluateAll((nodes) => nodes.map((node) => node.value)),
        ['absent', 'bearer-subject', 'api-policy', 'shared-subject', 'complete']);
      return { verdict: await text('verdict'), focus: 'cookies', retained: await count() };
    });
    await check('invalid select input focuses the error and cannot append or alter results', async () => {
      await page.locator('#cookies').evaluate((node) => { node.value = 'not-a-choice'; });
      await submitBypass();
      assert.match(await text('input-error'), /Invalid cookies/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'input-error');
      assert.equal(await count(), 1);
      assert.equal(await text('verdict'), 'UNKNOWN — not yet rehearsed');
      await reset();
      assert.equal(await page.locator('#cookies').inputValue(), 'absent');
      return { retained: await count(), recovered: await page.locator('#input-error').isHidden() };
    });
    await check('keyboard-only safe cookie-less handoff passes all nine actual DOM checks', async () => {
      await page.locator('#cookies').focus();
      for (const id of ['identity', 'routing', 'state', 'observation', 'rehearse']) {
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), id);
      }
      await page.keyboard.press('Enter');
      assert.match(await text('verdict'), /^SUCCESS/);
      assert.equal(await text('counts'), '9 passed · 0 failed · 0 unknown checks');
      assert.equal(await page.locator('#trace tr').count(), 4);
      const observed = await record(1);
      assert.equal(observed.metrics.cookiesSent, 0);
      for (const client of observed.clients) {
        assert.equal(client.after.destination, 'v2');
        assert.equal(client.after.subject, client.before.subject);
        assert.deepEqual(client.after.work, client.before.work);
        assert.equal(client.after.originalDeadlineMs, 300);
      }
      assert.deepEqual(observed.clients.map((client) => client.after.elapsedMs), [150, 240]);
      assert.match(await text('trace'), /cookies 0/);
      return observed.metrics;
    });
    await check('HTTP 200 cannot conceal missing instance-local work in actual DOM', async () => {
      await reset();
      await page.locator('#state').selectOption('instance-local');
      await run();
      assert.match(await text('verdict'), /^FAILURE/);
      assert.equal(await text('counts'), '7 passed · 2 failed · 0 unknown checks');
      assert.match(await text('trace'), /HTTP 200/);
      assert.match(await text('trace'), /MISSING required work/);
      return (await record(2)).metrics;
    });
    await check('cookie routing without cookies retains v1 rather than inventing migration', async () => {
      await reset();
      await page.locator('#routing').selectOption('browser-cookie');
      await run();
      assert.match(await text('verdict'), /^FAILURE/);
      const observed = await record(3);
      assert.equal(observed.metrics.moved, 0);
      assert.deepEqual(observed.clients.map((client) => client.after.destination), ['v1', 'v1']);
      assert.match(await text('assertions'), /Cookie routing falls back to v1/);
      return observed.metrics;
    });
    await check('delayed clients exceed unchanged original budgets in the visible trace', async () => {
      await reset();
      await page.locator('#observation').selectOption('delayed');
      await run();
      assert.match(await text('verdict'), /^FAILURE/);
      assert.match(await text('trace'), /350 ms \/ 300 ms/);
      assert.match(await text('trace'), /440 ms \/ 300 ms/);
      assert.equal((await record(4)).metrics.withinOriginalBudget, 0);
      return { elapsed: [350, 440], originalDeadline: 300 };
    });
    await check('invalid synthetic bearers remain 401 even with browser cookie fixtures', async () => {
      await reset();
      await page.locator('#cookies').selectOption('browser-fixture');
      await page.locator('#observation').selectOption('invalid-bearer');
      await run();
      assert.match(await text('verdict'), /^FAILURE/);
      const observed = await record(5);
      assert.deepEqual(observed.clients.map((client) => client.after.status), [401, 401]);
      assert.equal(observed.metrics.identitiesPreserved, 0);
      assert.match(await text('trace'), /synthetic invalid bearer rejected/);
      return observed.metrics;
    });
    await check('unavailable mobile observation remains four unknowns, not success', async () => {
      await reset();
      await page.locator('#observation').selectOption('unavailable');
      await run();
      assert.match(await text('verdict'), /^UNKNOWN/);
      assert.equal(await text('counts'), '5 passed · 0 failed · 4 unknown checks');
      assert.match(await text('trace'), /UNKNOWN — observation unavailable/);
      assert.equal((await record(6)).clients[1].after, null);
      return (await record(6)).metrics;
    });
    await check('eight good browser-cookie checks cannot prove the cookie-less ninth check', async () => {
      await reset();
      await page.locator('#cookies').selectOption('browser-fixture');
      await page.locator('#identity').selectOption('browser-session');
      await page.locator('#routing').selectOption('browser-cookie');
      await run();
      assert.match(await text('verdict'), /^UNKNOWN/);
      assert.equal(await text('counts'), '8 passed · 0 failed · 1 unknown checks');
      assert.match(await text('assertions'), /cookie-less continuity has not been exercised/);
      return (await record(7)).metrics;
    });
    await check('known failure dominates missing evidence and both are retained', async () => {
      await reset();
      await page.locator('#routing').selectOption('browser-cookie');
      await page.locator('#observation').selectOption('unavailable');
      await run();
      assert.match(await text('verdict'), /^FAILURE/);
      assert.equal(await text('counts'), '4 passed · 1 failed · 4 unknown checks');
      assert.equal(await count(), 9);
      assert.equal(await page.locator('#history > li').first().textContent(), firstFailure);
      return (await record(8)).metrics;
    });
    await check('capacity, retained history, keyboard details and reset cannot replenish twelve runs', async () => {
      while (await count() < 12) {
        await reset();
        await run();
      }
      retainedHistory = await page.locator('#history > li').allTextContents();
      assert.equal(retainedHistory.length, 12);
      await reset();
      assert.equal(await text('verdict'), 'UNKNOWN — not yet rehearsed');
      assert.match(await text('run-state'), /^Exhausted · 12\/12 recorded rehearsals · 0 remaining$/);
      assert.equal(await page.locator('#rehearse').isDisabled(), true);
      await submitBypass();
      assert.match(await text('input-error'), /budget is exhausted/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'input-error');
      assert.deepEqual(await page.locator('#history > li').allTextContents(), retainedHistory);
      await reset();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'result-heading');
      const summary = page.locator('#history summary').first();
      await summary.focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#history details').first().evaluate((node) => node.open), true);
      await page.keyboard.press('Space');
      assert.equal(await page.locator('#history details').first().evaluate((node) => node.open), false);
      assert.deepEqual(await page.locator('#history > li').allTextContents(), retainedHistory);
      return { used: 12, remaining: 0, firstFailurePreserved: retainedHistory[0] === firstFailure };
    });
    await check('ordinary exercise has no page errors, console errors or remote responses', async () => {
      assert.deepEqual(report.pageErrors, []);
      assert.deepEqual(report.consoleErrors, []);
      assert.deepEqual(report.nonFileResponses, []);
      const prefix = pathToFileURL(owned + path.sep).href;
      assert.ok(report.requests.length >= 4);
      assert.ok(report.requests.every((request) => request.url.startsWith(prefix)), JSON.stringify(report.requests));
      return { requests: report.requests.length, ownedFileAssetsOnly: true };
    });
    phase = 'csp-probes';
    await check('real CSP blocks inline script/style, connection, frame and form navigation', async () => {
      const originalURL = page.url();
      await page.evaluate(async () => {
        window.__s040InlineRan = false;
        const script = document.createElement('script');
        script.textContent = 'window.__s040InlineRan = true;';
        document.head.append(script);
        const style = document.createElement('style');
        style.textContent = 'body { color: rgb(255, 0, 255); }';
        document.head.append(style);
        try { await fetch('https://synthetic.invalid/s040-csp-connection'); } catch {}
        const frame = document.createElement('iframe');
        frame.src = 'https://synthetic.invalid/s040-csp-frame';
        document.body.append(frame);
        const form = document.createElement('form');
        form.action = 'https://synthetic.invalid/s040-csp-form';
        form.method = 'post';
        document.body.append(form);
        form.submit();
      });
      await page.waitForFunction(() => ['script-src-elem', 'style-src-elem', 'connect-src', 'frame-src', 'form-action']
        .every((name) => window.__s040Csp.some((event) => event.effectiveDirective === name && event.disposition === 'enforce')));
      report.cspViolations = await page.evaluate(() => window.__s040Csp);
      assert.equal(await page.evaluate(() => window.__s040InlineRan), false);
      // Locator actions wait for a navigation that Chromium has correctly blocked.
      assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).color), 'rgb(255, 0, 255)');
      assert.equal(page.url(), originalURL);
      assert.deepEqual(report.nonFileResponses, []);
      assert.deepEqual(report.pageErrors, []);
      assert.ok(report.consoleErrors.filter((error) => error.phase === 'csp-probes').length >= 5);
      assert.ok(report.consoleErrors.every((error) => /Content Security Policy|violates/i.test(error.text)));
      return report.cspViolations;
    });
    report.passed = true;
  } catch (error) {
    failure = error;
    report.failure = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    if (session) {
      try {
        await session.close();
        report.sessionClosed = true;
      } catch (error) {
        report.passed = false;
        report.cleanupError = error.message;
        failure = failure || error;
      }
    }
    report.finishedAt = new Date().toISOString();
    if (capture) fs.writeFileSync(observationPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
  if (failure) throw failure;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
