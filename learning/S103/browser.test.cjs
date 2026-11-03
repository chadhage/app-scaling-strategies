'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const helperPath = path.resolve(__dirname, '..', '..', 'testing', 'browser', 'isolated.cjs');
const expectedHelper = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(hash(helperPath), expectedHelper, 'Use only the exact published helper, never a fallback/prototype.');
const { openIsolatedLesson } = require(helperPath);
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const evidencePath = path.join(__dirname, 'evidence', 'browser-acceptance.json');

test('S103 actual isolated DOM, keyboard, error/reset, failure and CSP observations', { timeout: 120000 }, async (t) => {
  const before = fs.existsSync(evidencePath) ? hash(evidencePath) : null;
  const observations = [];
  const pageErrors = [];
  const externalRequests = [];
  let session;
  let closed = false;
  let version;
  async function observe(name, run) {
    await t.test(name, async () => {
      const detail = await run();
      observations.push({ name, outcome: 'passed', detail });
    });
    assert.equal(observations.at(-1)?.name, name, `Browser observation failed: ${name}`);
  }
  try {
    session = await openIsolatedLesson('learning\\S103\\index.html');
    version = session.browserVersion;
    assert.match(version, /^156\./);
    const page = session.page;
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => {
      if (/^https?:/.test(request.url())) externalRequests.push(request.url());
    });
    const text = (id) => page.locator(`#${id}`).innerText();
    const rows = () => page.locator('#measurements tr').allTextContents();
    const history = () => page.locator('#history li').allTextContents();
    const probe = () => page.locator('#rehearse').click();
    const admit = () => page.locator('#checkAdmission').click();

    await observe('initial truthful banner, unmeasured state and ready native controls', async () => {
      assert.equal(await text('trainingBanner'), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.locator('#controls').evaluate((element) => element.disabled), false);
      assert.equal(await page.locator('#error').isVisible(), false);
      assert.equal((await rows()).length, 0);
      assert.equal(await text('admitted'), 'old (synthetic only)');
      return { banner: await text('trainingBanner'), admitted: await text('admitted'), rows: 0 };
    });

    await observe('keyboard selects API hostname, rehearses four passes and admits candidate', async () => {
      await page.locator('#hostnameId').focus();
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#hostnameId').inputValue(), 'api');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#certificateId').evaluate((element) => element === document.activeElement), true);
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#rehearse').evaluate((element) => element === document.activeElement), true);
      await page.keyboard.press('Enter');
      assert.equal((await rows()).length, 4);
      assert.match(await text('activeResult'), /4 pass \/ 0 fail \/ 0 unknown = 4/);
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#checkAdmission').evaluate((element) => element === document.activeElement), true);
      await page.keyboard.press('Enter');
      assert.equal(await text('admitted'), 'old, candidate (synthetic only)');
      assert.match(await text('gateResult'), /Gate verifier pass; admission admitted/);
      return { selection: await text('measuredSelection'), rows: await rows(), gate: await text('gateResult') };
    });

    await observe('hostname mismatch rejects eligible candidate while old is retained', async () => {
      await page.locator('#certificateId').selectOption('app-only');
      assert.equal(await text('admitted'), 'old (synthetic only)');
      await probe();
      await admit();
      assert.match(await text('activeResult'), /2 pass \/ 2 fail \/ 0 unknown = 4/);
      assert.match(await text('gateResult'), /admission blocked/);
      assert.equal(await text('admitted'), 'old (synthetic only)');
      return { rows: await rows(), gate: await text('gateResult'), cumulative: await text('cumulative') };
    });

    await observe('TLS incompatibility cannot borrow the passing browser/client result', async () => {
      await page.locator('#certificateId').selectOption('both-hosts');
      await page.locator('#inventoryId').selectOption('incompatible');
      await probe();
      await admit();
      assert.match(await text('activeResult'), /3 pass \/ 1 fail \/ 0 unknown = 4/);
      assert.match(await text('gateResult'), /admission blocked/);
      return { rows: await rows(), gate: await text('gateResult') };
    });

    await observe('unknown service trust remains counted and gated', async () => {
      await page.locator('#inventoryId').selectOption('supported');
      await page.locator('#certificateId').selectOption('trust-unknown');
      await probe();
      await admit();
      assert.match(await text('activeResult'), /3 pass \/ 0 fail \/ 1 unknown = 4/);
      assert.match(await text('gateResult'), /admission blocked/);
      return { rows: await rows(), gate: await text('gateResult') };
    });

    await observe('unobserved TLS is not a synthetic continuity success', async () => {
      await page.locator('#certificateId').selectOption('both-hosts');
      await page.locator('#inventoryId').selectOption('unobserved');
      await probe();
      await admit();
      assert.match(await text('activeResult'), /3 pass \/ 0 fail \/ 1 unknown = 4/);
      assert.equal(await text('admitted'), 'old (synthetic only)');
      assert.match(await text('cumulative'), /15 pass \/ 3 fail \/ 2 unknown = 20/);
      return { rows: await rows(), cumulative: await text('cumulative') };
    });

    await observe('duplicate/malformed/unmeasured errors and keyboard reset preserve history', async () => {
      const previous = await history();
      const cumulative = await text('cumulative');
      await admit();
      assert.match(await text('error'), /already has a decision/);
      await page.evaluate(() => {
        const select = document.getElementById('certificateId');
        select.add(new Option('Malformed injected selector', 'not-a-fixed-certificate'));
        select.value = 'not-a-fixed-certificate';
      });
      await probe();
      const malformedError = await text('error');
      assert.match(malformedError, /fixed certificateId/);
      assert.deepEqual(await history(), previous);
      assert.equal(await text('cumulative'), cumulative);
      await page.locator('#resetCurrent').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#hostnameId').inputValue(), 'app');
      assert.equal(await page.locator('#certificateId').inputValue(), 'both-hosts');
      assert.equal(await page.locator('#inventoryId').inputValue(), 'supported');
      assert.equal(await page.locator('#hostnameId').evaluate((element) => element === document.activeElement), true);
      assert.equal(await text('admitted'), 'old (synthetic only)');
      assert.equal((await rows()).length, 0);
      assert.deepEqual(await history(), previous);
      assert.equal(await text('cumulative'), cumulative);
      await admit();
      const unmeasuredError = await text('error');
      assert.match(unmeasuredError, /Rehearse checks/);
      assert.equal(await page.locator('#error').getAttribute('role'), 'alert');
      assert.deepEqual(await history(), previous);
      await page.locator('#resetCurrent').click();
      assert.equal(await page.locator('#error').isVisible(), false);
      return { malformedError, unmeasuredError, retainedAttempts: previous.length, cumulative, resetFocus: 'hostnameId' };
    });

    await observe('six-attempt bound and reset cannot erase failed/unknown denominator', async () => {
      await probe();
      await admit();
      const previous = await history();
      await probe();
      assert.match(await text('error'), /Six rehearsal attempts used/);
      assert.equal(previous.length, 6);
      assert.deepEqual(await history(), previous);
      await page.locator('#resetCurrent').click();
      assert.match(await text('allowance'), /6 of 6/);
      assert.match(await text('cumulative'), /19 pass \/ 3 fail \/ 2 unknown = 24/);
      assert.deepEqual(await history(), previous);
      return { history: previous, cumulative: await text('cumulative'), allowance: await text('allowance') };
    });

    await observe('real CSP enforcement rejects inline script and data connection without external traffic', async () => {
      const result = await page.evaluate(async () => {
        const violations = [];
        const listener = (event) => violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        document.addEventListener('securitypolicyviolation', listener);
        const script = document.createElement('script');
        script.textContent = 'globalThis.__S103InlineExecuted = true';
        document.head.append(script);
        let connection;
        try { await fetch('data:text/plain,synthetic-CSP-check'); connection = 'allowed'; } catch { connection = 'blocked'; }
        await new Promise((resolve) => setTimeout(resolve, 50));
        document.removeEventListener('securitypolicyviolation', listener);
        script.remove();
        return { inlineExecuted: globalThis.__S103InlineExecuted === true, connection, violations };
      });
      assert.equal(result.inlineExecuted, false);
      assert.equal(result.connection, 'blocked');
      assert.ok(result.violations.some((entry) => entry.directive.startsWith('script-src')));
      assert.ok(result.violations.some((entry) => entry.directive === 'connect-src'));
      assert.deepEqual(externalRequests, []);
      assert.deepEqual(pageErrors, []);
      return result;
    });

    await observe('actual unavailable-model startup failure leaves controls disabled and no verified result', async () => {
      await page.addInitScript(() => {
        Object.defineProperty(globalThis, 'S103Lesson', { configurable: false, get() { return undefined; }, set() {} });
      });
      await page.reload({ waitUntil: 'load' });
      assert.equal(await page.locator('#controls').evaluate((element) => element.disabled), true);
      assert.match(await text('error'), /Lesson could not start.*no result is verified/);
      assert.equal(await page.locator('#rehearse').isDisabled(), true);
      assert.match(await text('activeResult'), /Unmeasured/);
      assert.equal((await rows()).length, 0);
      return { injection: 'model unavailable before startup; not a real endpoint/TLS failure', error: await text('error'), disabled: true, rows: 0 };
    });
  } finally {
    if (session) {
      await session.close();
      closed = true;
    }
  }
  assert.equal(closed, true);
  assert.equal(observations.length, 10);
  const report = {
    cardId: 'A-S103', sourceId: 'S103', parentId: 'D-S103', packet: 'SC-S103', owner: 'worker-A-S103',
    outcome: 'passed', mode: 'synthetic', browserVersion: version, playwrightVersion: '1.56.1', nodeVersion: process.version,
    helperSHA256: expectedHelper, helperPublication: '53c0c0d', observations, pageErrors, externalRequests,
    cleanup: 'Awaited session.close() in finally completed for this run; broader unattended lifecycle remains unqualified.',
    limits: 'Actual browser observations of fixed teaching data only; no real certificates, trust/TLS/DNS/endpoint changes, native Azure, production Node 24, or source-parent acceptance.',
    capturedAtUtc: new Date().toISOString(),
  };
  if (capture) fs.writeFileSync(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
  else assert.equal(fs.existsSync(evidencePath) ? hash(evidencePath) : null, before, 'Normal verification must preserve historical browser evidence.');
});
