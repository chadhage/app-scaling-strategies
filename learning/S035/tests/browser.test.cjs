'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const helperPath = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
assert.equal(digest(helperPath), helperHash, 'Only the published 53c0c0d helper is qualified');
const { openIsolatedLesson } = require(helperPath);

test('S035 actual isolated DOM, keyboard, error, failure, reset and CSP acceptance', { timeout: 120000 }, async (t) => {
  const startedAtUtc = new Date().toISOString();
  const checks = [];
  const outbound = [];
  const pageErrors = [];
  let session;
  let browserVersion = null;
  let closeAwaited = false;
  let runError = null;
  let cspObservation = null;
  async function check(name, action) {
    await t.test(name, async () => {
      try {
        await action();
        checks.push({ name, result: 'PASS' });
      } catch (error) {
        checks.push({ name, result: 'FAIL', error: error.message });
        throw error;
      }
    });
  }
  try {
    assert.equal(process.version, 'v22.23.4', 'Qualified tooling runtime only');
    assert.equal(require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version, '1.56.1');
    session = await openIsolatedLesson('learning\\S035\\index.html');
    browserVersion = session.browserVersion;
    assert.equal(browserVersion, '156.0.4314.50', 'Explicit installed Edge pairing; no download or fallback');
    const page = session.page;
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route(/^https?:\/\//, async (route) => {
      outbound.push(route.request().url());
      await route.abort('blockedbyclient');
    });
    const text = async (selector) => (await page.locator(selector).textContent()).trim();
    const metric = (name) => text(`[data-metric="${name}"]`);
    const reset = async () => { await page.locator('#resetLesson').click(); };
    const conduct = async () => {
      await page.locator('#startLogin').click();
      await page.locator('#cutover').click();
      await page.locator('#deliverCallback').click();
    };
    await check('exact training surface and local assets load without a request or JavaScript error', async () => {
      assert.equal(await text('.banner'), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.match(await page.title(), /S035.*Login callback/);
      assert.equal(await page.locator('#startLogin').isEnabled(), true);
      assert.equal(await page.locator('#cutover').isDisabled(), true);
      assert.equal(await page.locator('#deliverCallback').isDisabled(), true);
      assert.equal(await page.locator('form').count(), 1);
      const assets = await page.evaluate(() => ({
        scripts: [...document.scripts].map((node) => node.src),
        styles: [...document.styleSheets].map((sheet) => sheet.href),
        bannerBackground: getComputedStyle(document.querySelector('.banner')).backgroundColor,
        modelLoaded: typeof globalThis.S035.deliverCallback === 'function',
      }));
      assert.equal(assets.scripts.length, 2);
      assert.ok(assets.scripts.every((url) => url.startsWith('file:')));
      assert.equal(assets.styles.length, 1);
      assert.ok(assets.styles[0].startsWith('file:'));
      assert.equal(assets.bannerBackground, 'rgb(20, 59, 89)');
      assert.equal(assets.modelLoaded, true);
      assert.deepEqual(outbound, []);
      assert.deepEqual(pageErrors, []);
    });
    await check('native keyboard completes login on v1 then callback on v2 within the original budget', async () => {
      await reset();
      await page.locator('.skip').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#controls').evaluate((node) => node === document.activeElement), true);
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#storeMode').evaluate((node) => node === document.activeElement), true);
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#storeMode').inputValue(), 'v1-only');
      await page.keyboard.press('ArrowUp');
      for (let index = 0; index < 7; index++) await page.keyboard.press('Tab');
      assert.equal(await page.locator('#startLogin').evaluate((node) => node === document.activeElement), true);
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#cutover').evaluate((node) => node === document.activeElement), true);
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#deliverCallback').evaluate((node) => node === document.activeElement), true);
      await page.keyboard.press('Enter');
      assert.match(await text('#outcome'), /^SUCCESS/);
      assert.match(await text('#verifier'), /^PASS/);
      assert.equal(await metric('elapsedMs'), '160');
      assert.equal(await metric('callbackVersion'), 'v2');
      assert.equal(await metric('returnPath'), '/training/home');
      assert.equal(await metric('restartRequired'), 'No');
      assert.match(await text('#journeyCounts'), /Success 1 \/ Failure 0 \/ Unknown 0/);
      const rows = await page.locator('#currentTrace tbody tr').allTextContents();
      assert.equal(rows.length, 4);
      assert.match(rows[0], /0 msv1.*login-start/);
      assert.match(rows[1], /40 msv2.*cutover/);
      assert.match(rows[3], /160 msv2.*login-complete/);
      assert.equal(await page.locator('#resultHeading').evaluate((node) => node === document.activeElement), true);
    });
    await check('active configuration and ordered actions are locked without restarting login', async () => {
      await reset();
      await page.locator('#startLogin').click();
      assert.equal(await page.locator('#configuration').evaluate((node) => node.disabled), true);
      assert.equal(await page.locator('#storeMode').isDisabled(), true);
      assert.equal(await page.locator('#startLogin').isDisabled(), true);
      assert.equal(await page.locator('#deliverCallback').isDisabled(), true);
      assert.match(await text('#outcome'), /started on v1 at 0 ms; routing still v1/);
      await page.locator('#cutover').click();
      assert.equal(await page.locator('#cutover').isDisabled(), true);
      assert.match(await text('#status'), /original login and budget are retained/);
      await page.locator('#deliverCallback').click();
      assert.equal(await page.locator('#configuration').evaluate((node) => node.disabled), false);
      assert.equal(await page.locator('#storeMode').isEnabled(), true);
      assert.equal(await page.locator('#currentTrace tbody tr').count(), 4);
    });
    await check('lost state remains FAILURE through wrong and corrected prediction with retained provenance', async () => {
      await reset();
      await page.locator('#storeMode').selectOption('v1-only');
      await conduct();
      assert.match(await text('#outcome'), /^FAILURE.*STATE_LOST/);
      assert.match(await text('#verifier'), /^FAIL/);
      assert.equal(await metric('loginCompleted'), 'No');
      assert.equal(await metric('restartRequired'), 'Yes');
      assert.match(await text('#currentTrace'), /none is executed/);
      await page.locator('#prediction').selectOption('FAILURE');
      await conduct();
      assert.match(await text('#outcome'), /^FAILURE/);
      assert.match(await text('#verifier'), /^PASS/);
      const summaries = await page.locator('#history summary').allTextContents();
      assert.deepEqual(summaries, ['Run 1 — FAILURE; verifier FAIL', 'Run 2 — FAILURE; verifier PASS']);
      assert.match(await text('#history'), /original budget 500 ms; delay 100 ms; prediction SUCCESS/);
    });
    await check('redirect loop is visibly stopped at three hops rather than hidden by retry', async () => {
      await reset();
      await page.locator('#callbackPath').selectOption('redirect-loop');
      await page.locator('#prediction').selectOption('FAILURE');
      await conduct();
      assert.match(await text('#outcome'), /^FAILURE.*REDIRECT_LOOP/);
      assert.equal(await metric('redirectHops'), '3');
      assert.equal(await metric('elapsedMs'), '200');
      assert.equal(await metric('loginCompleted'), 'No');
      const rows = await page.locator('#currentTrace tbody tr').allTextContents();
      assert.equal(rows.filter((row) => row.includes('/ redirect')).length, 3);
      assert.match(rows.at(-1), /loop-stopped/);
      assert.equal(rows.length, 7);
    });
    await check('mismatched synthetic marker is rejected without a success-shaped callback', async () => {
      await reset();
      await page.locator('#callbackState').selectOption('mismatch');
      await page.locator('#prediction').selectOption('FAILURE');
      await conduct();
      assert.match(await text('#outcome'), /^FAILURE.*STATE_MISMATCH/);
      assert.equal(await metric('correlationMatched'), 'No');
      assert.equal(await metric('loginCompleted'), 'No');
      assert.match(await text('#currentTrace'), /rejected, never bypassed/);
    });
    await check('budget equality succeeds but one millisecond late fails despite completed login', async () => {
      await reset();
      await page.locator('#budgetMs').fill('160');
      await conduct();
      assert.match(await text('#outcome'), /^SUCCESS/);
      await page.locator('#budgetMs').fill('159');
      await page.locator('#prediction').selectOption('FAILURE');
      await conduct();
      assert.match(await text('#outcome'), /^FAILURE.*BUDGET_EXCEEDED/);
      assert.equal(await metric('elapsedMs'), '160');
      assert.equal(await metric('budgetMs'), '159');
      assert.equal(await metric('loginCompleted'), 'Yes');
      assert.match(await text('#historyCount'), /^2 of 6/);
    });
    await check('unknown observations have no invented callback, completion, timing or success', async () => {
      await reset();
      await page.locator('#observations').selectOption('missing');
      await page.locator('#prediction').selectOption('UNKNOWN');
      await conduct();
      assert.match(await text('#outcome'), /^UNKNOWN.*CALLBACK_UNOBSERVED/);
      assert.match(await text('#verifier'), /^PASS/);
      assert.match(await text('#journeyCounts'), /Success 0 \/ Failure 0 \/ Unknown 1/);
      for (const name of ['callbackVersion', 'elapsedMs', 'loginCompleted', 'redirectHops', 'restartRequired']) {
        assert.match(await metric(name), /^UNOBSERVED/);
      }
      assert.match(await text('#currentTrace'), /callback-unobserved/);
      assert.match(await text('main'), /Real user impact: UNMEASURED/);
    });
    await check('invalid numeric and enum input focuses an error and preserves the existing run', async () => {
      await reset();
      await conduct();
      for (const value of ['', '99', '2001', '150.5']) {
        await page.locator('#budgetMs').fill(value);
        await page.locator('#startLogin').click();
        assert.equal(await page.locator('#error').isVisible(), true);
        assert.match(await text('#error'), /budgetMs/);
        assert.equal(await page.locator('#error').evaluate((node) => node === document.activeElement), true);
        assert.match(await text('#historyCount'), /^1 of 6/);
        assert.equal(await page.locator('#configuration').evaluate((node) => node.disabled), false);
      }
      await page.locator('#budgetMs').fill('500');
      await page.evaluate(() => {
        const option = document.createElement('option');
        option.value = 'injected';
        option.textContent = 'Invalid fixture option';
        document.getElementById('storeMode').append(option);
        document.getElementById('storeMode').value = 'injected';
      });
      await page.locator('#startLogin').click();
      assert.match(await text('#error'), /invalid storeMode/);
      await page.evaluate(() => document.querySelector('#storeMode option[value="injected"]').remove());
      await page.locator('#storeMode').selectOption('shared');
      assert.equal(await page.locator('#error').isHidden(), true);
      await conduct();
      assert.match(await text('#historyCount'), /^2 of 6/);
      assert.match(await text('#outcome'), /^SUCCESS/);
    });
    await check('edited controls invalidate the current view but keyboard history keeps its original trace', async () => {
      await reset();
      await page.locator('#storeMode').selectOption('v1-only');
      await conduct();
      await page.locator('#storeMode').selectOption('shared');
      assert.match(await text('#outcome'), /^No current checked journey/);
      assert.equal(await page.locator('#metrics dd').count(), 0);
      const summary = page.locator('#history summary').first();
      await summary.focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#history details').first().getAttribute('open'), '');
      assert.match(await text('#history details'), /Store v1-only/);
      assert.match(await text('#history details'), /state-lost/);
      assert.match(await text('#history summary'), /FAILURE; verifier FAIL/);
    });
    await check('six retained runs stop a seventh without eviction or silent reset', async () => {
      await reset();
      await page.locator('#storeMode').selectOption('v1-only');
      await conduct();
      await page.locator('#storeMode').selectOption('shared');
      for (let index = 1; index < 6; index++) await conduct();
      assert.equal(await page.locator('#history details').count(), 6);
      assert.equal(await page.locator('#startLogin').isDisabled(), true);
      const before = await text('#history');
      await page.evaluate(() => document.getElementById('exercise')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      assert.match(await text('#error'), /six runs retained/);
      assert.equal(await text('#history'), before);
      assert.match(await text('#history details:first-child summary'), /Run 1.*FAILURE/);
    });
    await check('reset clears pending login, error and retained history without form.reset shadowing', async () => {
      await reset();
      await page.locator('#callbackPath').selectOption('redirect-loop');
      await conduct();
      await page.locator('#budgetMs').fill('99');
      await page.locator('#startLogin').click();
      assert.equal(await page.locator('#error').isVisible(), true);
      await page.locator('#budgetMs').fill('500');
      await page.locator('#startLogin').click();
      assert.equal(await page.locator('#configuration').evaluate((node) => node.disabled), true);
      assert.equal(await page.locator('#storeMode').isDisabled(), true);
      await page.locator('#resetLesson').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#configuration').evaluate((node) => node.disabled), false);
      assert.equal(await page.locator('#storeMode').isEnabled(), true);
      assert.equal(await page.locator('#history details').count(), 0);
      assert.equal(await page.locator('#error').isHidden(), true);
      assert.equal(await page.locator('#budgetMs').inputValue(), '500');
      assert.equal(await page.locator('#delayMs').inputValue(), '100');
      assert.equal(await page.locator('#callbackPath').inputValue(), 'compatible');
      assert.equal(await page.locator('#prediction').inputValue(), 'SUCCESS');
      assert.equal(await page.locator('#storeMode').evaluate((node) => node === document.activeElement), true);
      assert.equal(await page.evaluate(() => typeof document.getElementById('exercise').reset), 'function');
      await conduct();
      assert.match(await text('#outcome'), /^SUCCESS/);
    });
    await check('narrow viewport preserves visible focus and a keyboard-scrollable trace without page overflow', async () => {
      await reset();
      await conduct();
      await page.setViewportSize({ width: 360, height: 800 });
      const region = page.locator('#currentTrace .trace');
      await region.focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);
      const geometry = await region.evaluate((node) => ({
        scrollLeft: node.scrollLeft, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth,
        outlineStyle: getComputedStyle(node).outlineStyle, outlineWidth: getComputedStyle(node).outlineWidth,
        documentWidth: document.documentElement.scrollWidth, viewport: innerWidth,
      }));
      assert.ok(geometry.scrollWidth > geometry.clientWidth);
      assert.ok(geometry.scrollLeft > 0);
      assert.equal(geometry.outlineStyle, 'solid');
      assert.ok(parseFloat(geometry.outlineWidth) >= 3);
      assert.ok(geometry.documentWidth <= geometry.viewport);
      await page.setViewportSize({ width: 1280, height: 900 });
    });
    await check('actual CSP blocks inline code, handlers, styles, remote resources, workers, forms and base changes', async () => {
      await reset();
      await conduct();
      cspObservation = await page.evaluate(async () => {
        const violations = [];
        const onViolation = (event) => violations.push(event.effectiveDirective);
        document.addEventListener('securitypolicyviolation', onViolation);
        const nodes = [];
        const add = (node, parent = document.body) => { nodes.push(node); parent.append(node); return node; };
        const button = add(document.createElement('button'));
        button.id = 'cspProbe';
        button.setAttribute('onclick', 'globalThis.__s035HandlerRan = true');
        button.click();
        const inline = document.createElement('script');
        inline.textContent = 'globalThis.__s035InlineRan = true';
        add(inline);
        const remote = document.createElement('script');
        remote.src = 'https://s035.invalid/script.js';
        add(remote);
        const style = document.createElement('style');
        style.textContent = '#cspProbe { color: rgb(1, 2, 3); }';
        add(style);
        button.setAttribute('style', 'background-color: rgb(4, 5, 6)');
        const inlineStyleApplied = getComputedStyle(button).color === 'rgb(1, 2, 3)'
          || getComputedStyle(button).backgroundColor === 'rgb(4, 5, 6)';
        await fetch('https://s035.invalid/connect').catch(() => undefined);
        const image = document.createElement('img');
        image.src = 'https://s035.invalid/image.png';
        add(image);
        const frame = document.createElement('iframe');
        frame.src = 'https://s035.invalid/frame';
        add(frame);
        const object = document.createElement('object');
        object.data = 'https://s035.invalid/object';
        object.type = 'text/html';
        add(object);
        const base = document.createElement('base');
        base.href = 'https://s035.invalid/base/';
        add(base, document.head);
        const baseChanged = !document.baseURI.startsWith('file:');
        const form = document.createElement('form');
        form.action = 'https://s035.invalid/form';
        form.method = 'get';
        add(form);
        HTMLFormElement.prototype.submit.call(form);
        const workerURL = URL.createObjectURL(new Blob(['postMessage("blocked")'], { type: 'text/javascript' }));
        let worker;
        try {
          worker = new Worker(workerURL);
          worker.onerror = (event) => event.preventDefault();
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 150));
        if (worker) worker.terminate();
        URL.revokeObjectURL(workerURL);
        const result = {
          directives: [...new Set(violations)].sort(), baseChanged, inlineStyleApplied,
          inlineRan: globalThis.__s035InlineRan === true, handlerRan: globalThis.__s035HandlerRan === true,
        };
        nodes.forEach((node) => node.remove());
        document.removeEventListener('securitypolicyviolation', onViolation);
        return result;
      });
      assert.equal(cspObservation.inlineRan, false);
      assert.equal(cspObservation.handlerRan, false);
      assert.equal(cspObservation.inlineStyleApplied, false);
      assert.equal(cspObservation.baseChanged, false);
      for (const directive of [
        'script-src-elem', 'script-src-attr', 'style-src-elem', 'style-src-attr',
        'connect-src', 'img-src', 'frame-src', 'object-src', 'worker-src', 'form-action', 'base-uri',
      ]) assert.ok(cspObservation.directives.includes(directive), `Missing actual CSP violation: ${directive}`);
      assert.deepEqual(outbound, [], 'CSP blocked requests before the additional test route guard');
      assert.deepEqual(pageErrors, []);
      assert.match(await text('#outcome'), /^SUCCESS/);
    });
  } catch (error) {
    runError = error.message;
    throw error;
  } finally {
    try {
      if (session) {
        await session.close();
        closeAwaited = true;
      }
    } finally {
      if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
        const directory = path.join(root, 'evidence');
        let index = 1;
        let file;
        do { file = path.join(directory, `browser-observations-${String(index++).padStart(3, '0')}.json`); }
        while (fs.existsSync(file));
        fs.writeFileSync(file, `${JSON.stringify({
          cardId: 'A-S035', workerId: 'worker-A-S035', packet: 'SC-S035', kano: 'S',
          mode: 'actual-isolated-browser-with-synthetic-lesson',
          startedAtUtc, completedAtUtc: new Date().toISOString(),
          nodeVersion: process.version, playwrightVersion: '1.56.1', browserVersion,
          helperCommit: '53c0c0d', helperSha256: helperHash,
          checks, leafChecks: checks.length, parentGroups: 1, runError,
          outcome: checks.length === 14 && checks.every((check) => check.result === 'PASS') && !runError ? 'PASS' : 'FAIL',
          cspObservation, outboundRequestsReachedRouteGuard: outbound, pageErrors,
          cleanup: { closeAwaitedInFinally: closeAwaited, liveListener: false, cloudResources: false },
          userImpact: 'UNMEASURED; all lesson identities, paths, markers, timings and outcomes are synthetic.',
          lifecycleLimit: 'Published helper only; known unattended lifecycle limit remains. Abandoned prototype is not qualified.',
          nativeQualified: false, productionNode24Qualified: false, sourceParentComplete: false,
          sourceHashes: ['index.html', 'app.js', 'styles.css', 'callback.js', 'tests\\browser.test.cjs']
            .map((source) => ({ path: source, sha256: digest(path.join(root, source)) })),
        }, null, 2)}\n`, { flag: 'wx' });
      }
    }
  }
});
