'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { openIsolatedLesson } = require('..\\..\\..\\testing\\browser\\isolated.cjs');
const playwrightVersion = require('..\\..\\..\\testing\\browser\\node_modules\\playwright\\package.json').version;

const root = path.resolve(__dirname, '..', '..', '..');
const output = path.join(__dirname, '..', 'evidence');
const banner = 'Training rehearsal - synthetic data - not a live Azure result';
const helper = path.join(root, 'testing', 'browser', 'isolated.cjs');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('S010 actual isolated headless Edge DOM and keyboard rehearsal', { timeout: 120000 }, async (t) => {
  const session = await openIsolatedLesson('learning\\S010\\index.html');
  const { page } = session;
  const pageErrors = [];
  const consoleErrors = [];
  const requests = [];
  const observations = {
    cardId: 'A-S010', mode: 'actual-browser-check-of-synthetic-lesson',
    startedAtUtc: new Date().toISOString(), nodeVersion: process.version,
    playwrightVersion, browserVersion: session.browserVersion,
    entry: page.url(), helper: 'testing\\browser\\isolated.cjs', helperSha256: hash(helper),
    configuration: 'Verified helper: installed msedge, headless, chromiumSandbox true, fresh browser/context, no download.',
    nativeEvidence: false, productionNode24Validated: false, checks: [], cleanup: 'pending',
  };
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => requests.push(request.url()));
  const evidence = async () => JSON.parse(await page.locator('#evidence-output').inputValue());
  const press = async (id, key = 'Enter') => {
    await page.locator(`#${id}`).focus();
    await page.keyboard.press(key);
  };
  const reset = async () => press('reset-run');
  async function check(name, action) {
    await t.test(name, async () => {
      await action();
      const current = await evidence();
      observations.checks.push({
        name, passed: true, verdictText: await page.locator('#verdict').innerText(),
        countsText: await page.locator('#counts').innerText(),
        activeElement: await page.evaluate(() => document.activeElement.id || document.activeElement.tagName),
        events: current.run.events, verdict: current.verdict, clients: current.snapshot.clients,
        traceDecisions: current.snapshot.trace.map(({ sequence, type, status, code }) =>
          ({ sequence, type, status, code })),
      });
    });
  }
  try {
    await page.waitForFunction(() => document.getElementById('verdict').textContent.startsWith('NOT_RUN'));
    await check('exact visible banner, manifest scope and real file-opened browser', async () => {
      assert.equal(playwrightVersion, '1.56.1');
      assert.match(session.browserVersion, /^156\./);
      assert.match(page.url(), /^file:/);
      assert.match(await page.title(), /S010/);
      assert.equal(await page.locator('.training-banner').innerText(), banner);
      assert.equal(await page.locator('.training-banner').isVisible(), true);
      assert.match(await page.locator('#limits-heading').locator('..').innerText(), /Node 24 remains unvalidated/);
      assert.equal((await evidence()).nativeEvidence, false);
      observations.userAgent = await page.evaluate(() => navigator.userAgent);
      observations.initialResourceUrls = await page.evaluate(() =>
        performance.getEntriesByType('resource').map((entry) => entry.name));
      assert.ok(observations.initialResourceUrls.every((url) => url.startsWith('file:')));
    });

    await check('actual skip link, focus indication, labels, tab order and Space activation', async () => {
      await page.locator('.skip-link').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'exercise');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'target-cohort');
      assert.equal(await page.evaluate(() => {
        const style = getComputedStyle(document.activeElement);
        return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 3;
      }), true);
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#target-cohort').inputValue(), 'control');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'config-version');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'enable-flag');
      await page.keyboard.press('Space');
      assert.equal((await evidence()).snapshot.config.cohort, 'control');
      assert.equal((await evidence()).snapshot.config.enabled, true);
      assert.equal(await page.evaluate(() =>
        [...document.querySelectorAll('select, textarea')].every((control) => control.labels.length > 0)), true);
    });

    await check('baseline, cohort-only on and explicit reversal preserve sessions/data in the actual DOM', async () => {
      await reset();
      const initial = (await evidence()).snapshot.clients;
      await press('observe-journeys');
      await press('enable-flag');
      await press('observe-journeys');
      let current = await evidence();
      assert.equal(current.verdict.status, 'IN_PROGRESS');
      const on = current.snapshot.trace.at(-1).observations;
      assert.equal(on.length, 4);
      assert.ok(on.every((item) => item.behavior === (item.cohort === 'pilot' ? 'enhanced' : 'standard')));
      assert.match(await page.locator('#trace').innerText(), /pilot-1 \(pilot\): OK; enhanced/);
      assert.match(await page.locator('#trace').innerText(), /control-1 \(control\): OK; standard/);
      await press('revert-flag', 'Space');
      await press('observe-journeys');
      current = await evidence();
      assert.equal(current.verdict.status, 'PASS');
      assert.equal(current.verdict.counts.attempted, 12);
      assert.equal(current.verdict.counts.successful, 12);
      assert.equal(current.snapshot.config.enabled, false);
      for (const [index, client] of current.snapshot.clients.entries()) {
        assert.equal(client.cartId, initial[index].cartId);
        assert.equal(client.sessionToken, initial[index].sessionToken);
        assert.equal(client.cartCount, 4);
        assert.equal(client.effects, 3);
      }
      assert.equal(await page.locator('#session-rows tr').count(), 4);
      assert.match(await page.locator('#verdict').innerText(), /^PASS/);
      assert.match(await page.locator('#user-outcome').innerText(), /Deployment migration: not evidenced/);
      assert.equal(current.verdict.deploymentChanges, 0);
    });

    await check('keyboard config-v2 attempt shows a genuine guarded publication, not exposure', async () => {
      await reset();
      await page.locator('#config-version').focus();
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#config-version').inputValue(), '2');
      await press('enable-flag');
      const current = await evidence();
      assert.equal(current.verdict.status, 'GUARDED');
      assert.equal(current.snapshot.config.enabled, false);
      assert.equal(current.verdict.counts.attempted, 0);
      assert.equal(current.snapshot.trace[0].input.configVersion, 2);
      assert.equal(current.snapshot.trace[0].code, 'CONFIG_VERSION_UNSUPPORTED');
      assert.match(await page.locator('#user-outcome').innerText(), /safe abort before exposure/);
      assert.match(await page.locator('#trace').innerText(), /No flag change/);
    });

    await check('incompatible existing state gates cohort activation in the browser', async () => {
      await reset();
      await press('apply-state');
      await press('enable-flag');
      const current = await evidence();
      assert.equal(current.snapshot.clients[0].stateVersion, 2);
      assert.equal(current.snapshot.config.enabled, false);
      assert.equal(current.verdict.status, 'GUARDED');
      assert.equal(current.snapshot.trace.at(-1).code, 'STATE_VERSION_UNSUPPORTED');
      assert.match(await page.locator('#trace').innerText(), /cannot read state v2 for pilot-1/);
    });

    await check('interrupted attempts survive reversal and subsequent fixture restoration', async () => {
      await reset();
      await press('observe-journeys');
      await press('enable-flag');
      await press('observe-journeys');
      await press('apply-state');
      await press('observe-journeys');
      assert.equal((await evidence()).verdict.counts.interrupted, 1);
      await press('revert-flag');
      await press('observe-journeys');
      assert.equal((await evidence()).snapshot.clients[0].stateVersion, 2);
      assert.equal((await evidence()).verdict.counts.interrupted, 2);
      await press('restore-state');
      await press('observe-journeys');
      const current = await evidence();
      assert.equal(current.verdict.status, 'FAIL');
      assert.deepEqual(current.verdict.counts,
        { attempted: 20, successful: 18, interrupted: 2, guardedPublications: 0 });
      assert.equal(current.snapshot.clients[0].stateVersion, 1);
      assert.equal(current.snapshot.clients[0].cartCount, 4);
      assert.equal(current.snapshot.clients[0].effects, 3);
      assert.equal(current.snapshot.trace.filter((item) => item.status === 'interrupted').length, 2);
      assert.match(await page.locator('#trace').innerText(), /pilot-1 \(pilot\): INTERRUPTED; blocked/);
      assert.match(await page.locator('#counts').innerText(), /2 interrupted \(retained\)/);
      assert.match(await page.locator('#verdict').innerText(), /^FAIL/);
    });

    await check('malformed JSON and wrong types show focused accessible errors without changing prior evidence', async () => {
      const previous = await page.locator('#evidence-output').inputValue();
      await page.locator('#event-json').fill('{');
      await press('submit-event');
      assert.match(await page.locator('#input-error').innerText(), /ERR_EVENT_JSON/);
      assert.equal(await page.locator('#input-error').getAttribute('role'), 'alert');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'input-error');
      assert.equal(await page.locator('#evidence-output').inputValue(), previous);
      for (const event of [
        { type: 'publish-flag', cohort: 'pilot', enabled: 'true', configVersion: 1 },
        { type: 'publish-flag', cohort: 'pilot', enabled: true, configVersion: '1' },
        { type: 'set-state-version', clientId: 'pilot-1', stateVersion: 3 },
      ]) {
        await page.locator('#event-json').fill(JSON.stringify(event));
        await press('submit-event');
        assert.match(await page.locator('#input-error').innerText(), /ERR_EVENT_INPUT/);
        assert.equal(await page.locator('#evidence-output').inputValue(), previous);
      }
    });

    await check('unknown operations and hostile markup cannot become executable DOM', async () => {
      const before = (await evidence()).run.events.length;
      await page.locator('#event-json').fill('{"type":"deploy"}');
      await press('submit-event');
      assert.match(await page.locator('#input-error').innerText(), /ERR_EVENT_TYPE/);
      await page.locator('#event-json').fill(
        '{"type":"observe","extra":"<img src=x onerror=globalThis.__s010MarkupExecuted=true>"}',
      );
      await press('submit-event');
      assert.match(await page.locator('#input-error').innerText(), /ERR_EVENT_INPUT/);
      assert.equal(await page.locator('img').count(), 0);
      assert.equal(await page.evaluate(() => globalThis.__s010MarkupExecuted), undefined);
      assert.equal((await evidence()).run.events.length, before);
    });

    await check('valid explicit JSON submits through Tab and Enter and clears the error', async () => {
      await reset();
      await page.locator('#event-json').fill(
        '{"type":"publish-flag","cohort":"control","enabled":true,"configVersion":1}',
      );
      await page.locator('#event-json').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'submit-event');
      await page.keyboard.press('Enter');
      const current = await evidence();
      assert.equal(current.run.events.length, 1);
      assert.equal(current.snapshot.config.enabled, true);
      assert.equal(current.snapshot.config.cohort, 'control');
      assert.equal(current.verdict.status, 'IN_PROGRESS');
      assert.equal(await page.locator('#input-error').isVisible(), false);
      assert.match(await page.locator('#trace').innerText(), /"enabled":true/);
    });

    await check('turn-off control changes behavior while keeping ongoing cart state', async () => {
      await reset();
      await press('observe-journeys');
      await press('enable-flag');
      await press('observe-journeys');
      await press('turn-off');
      await press('observe-journeys');
      const current = await evidence();
      assert.equal(current.snapshot.config.enabled, false);
      assert.equal(current.verdict.status, 'PASS');
      assert.ok(current.snapshot.clients.every((client) => client.cartCount === 4));
      assert.ok(current.snapshot.trace.at(-1).observations.every((item) => item.behavior === 'standard'));
    });

    await check('keyboard reset visibly archives a failed run and never shadows native form.reset', async () => {
      await reset();
      await press('apply-state');
      await press('observe-journeys');
      assert.equal((await evidence()).verdict.status, 'FAIL');
      const archives = await page.locator('#archived-runs > li').count();
      await press('reset-run', 'Space');
      assert.equal((await evidence()).verdict.status, 'NOT_RUN');
      assert.equal((await evidence()).run.events.length, 0);
      assert.equal(await page.locator('#archived-runs > li').count(), archives + 1);
      assert.match(await page.locator('#archived-runs > li').last().innerText(), /FAIL; 4 attempted; 1 interrupted/);
      assert.equal(await page.evaluate(() => typeof document.getElementById('rehearsal-form').reset), 'function');
      assert.equal(await page.locator('[name="reset"], [id="reset"]').count(), 0);
      await press('observe-journeys');
      await page.evaluate(() => document.getElementById('rehearsal-form').reset());
      assert.equal((await evidence()).verdict.status, 'NOT_RUN');
      assert.equal(await page.locator('#archived-runs > li').count(), archives + 2);
      assert.equal(await page.locator('#event-json').inputValue(), '{"type":"observe"}');
      assert.equal(await page.locator('#target-cohort').inputValue(), 'pilot');
      assert.equal(await page.locator('#config-version').inputValue(), '1');
    });

    await check('browser-enforced CSP blocks inline code, inline handlers and connect attempts', async () => {
      await page.evaluate(() => {
        globalThis.__s010PolicyViolations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          globalThis.__s010PolicyViolations.push({
            directive: event.effectiveDirective, blockedURI: event.blockedURI,
          });
        });
        const script = document.createElement('script');
        script.dataset.s010CspProbe = 'inline';
        script.textContent = 'globalThis.__s010InlineExecuted = true';
        document.body.append(script);
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.s010CspProbe = 'handler';
        button.setAttribute('onclick', 'globalThis.__s010HandlerExecuted = true');
        document.body.append(button);
        button.click();
      });
      const connect = await page.evaluate(async () => {
        try {
          await fetch('data:text/plain,s010-policy-probe');
          return { blocked: false };
        } catch (error) {
          return { blocked: true, errorName: error.name };
        }
      });
      assert.equal(connect.blocked, true);
      await page.waitForFunction(() => globalThis.__s010PolicyViolations.some(
        (violation) => violation.directive === 'connect-src',
      ));
      observations.cspViolations = await page.evaluate(() => globalThis.__s010PolicyViolations);
      assert.ok(observations.cspViolations.some((item) => /^script-src/.test(item.directive)));
      assert.equal(await page.evaluate(() => globalThis.__s010InlineExecuted), undefined);
      assert.equal(await page.evaluate(() => globalThis.__s010HandlerExecuted), undefined);
      await page.evaluate(() => {
        document.querySelectorAll('[data-s010-csp-probe]').forEach((element) => element.remove());
      });
      assert.equal(requests.filter((url) => /^https?:/.test(url)).length, 0);
    });

    await check('narrow viewport keeps page controls usable without document overflow', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() =>
        document.documentElement.scrollWidth <= window.innerWidth), true);
      await page.locator('#observe-journeys').scrollIntoViewIfNeeded();
      assert.equal(await page.locator('#observe-journeys').isVisible(), true);
      await press('observe-journeys');
      assert.equal((await evidence()).verdict.counts.attempted, 4);
      await page.setViewportSize({ width: 1280, height: 900 });
    });

    await check('final actual DOM verdict and screenshot are retained without runtime/network errors', async () => {
      await reset();
      await press('observe-journeys');
      await press('enable-flag');
      await press('observe-journeys');
      await press('revert-flag');
      await press('observe-journeys');
      assert.equal((await evidence()).verdict.status, 'PASS');
      assert.deepEqual(pageErrors, []);
      assert.equal(requests.filter((url) => /^https?:/.test(url)).length, 0);
      await page.screenshot({ path: path.join(output, 'browser.png'), fullPage: true });
      fs.writeFileSync(path.join(output, 'browser-dom.txt'), await page.locator('body').innerText());
      observations.screenshotSha256 = hash(path.join(output, 'browser.png'));
      observations.domTextSha256 = hash(path.join(output, 'browser-dom.txt'));
      observations.finalEvidence = await evidence();
    });
  } finally {
    try {
      await session.close();
      observations.cleanup = 'closed in awaited finally';
    } finally {
      observations.finishedAtUtc = new Date().toISOString();
      observations.pageErrors = pageErrors;
      observations.consoleErrors = consoleErrors;
      observations.requestsAfterLoad = requests;
      observations.leafChecksPassed = observations.checks.length;
      fs.writeFileSync(path.join(output, 'browser-observations.json'), `${JSON.stringify(observations, null, 2)}\n`);
      console.log(`ACTUAL_BROWSER ${JSON.stringify({
        browserVersion: observations.browserVersion, playwrightVersion,
        leafChecksPassed: observations.leafChecksPassed, cleanup: observations.cleanup,
        pageErrors, outboundHttpRequests: requests.filter((url) => /^https?:/.test(url)).length,
      })}`);
    }
  }
});
