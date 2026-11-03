'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const owned = path.resolve(__dirname, '..');
const repo = path.resolve(owned, '..', '..');
const helperPath = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const expectedHelperSha = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const helperSha = crypto.createHash('sha256').update(fs.readFileSync(helperPath)).digest('hex');
assert.equal(helperSha, expectedHelperSha, 'only published 53c0c0d helper is qualified');
assert.equal(require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version, '1.56.1');
assert.match(process.version, /^v22\./);
const { openIsolatedLesson } = require(helperPath);

test('actual isolated Edge DOM, keyboard, failures, uncertainty, errors, reset, and CSP', { timeout: 120000 }, async (t) => {
  const startedAtUtc = new Date().toISOString();
  const observations = [];
  const runtimeErrors = [];
  const requests = [];
  let isolated;
  let browserVersion;
  let closed = false;
  try {
    isolated = await openIsolatedLesson(path.join('learning', 'S072', 'index.html'));
    const { page } = isolated;
    browserVersion = isolated.browserVersion;
    assert.match(browserVersion, /^156\./);
    page.on('pageerror', (error) => runtimeErrors.push(String(error)));
    page.on('request', (request) => requests.push({ url: request.url(), method: request.method() }));
    const text = (id) => page.locator(`#${id}`).innerText();
    const count = () => page.locator('#history tr').count();
    const run = async () => {
      await page.locator('#run').focus();
      await page.keyboard.press('Enter');
    };
    const check = async (name, action) => {
      let passed = false;
      await t.test(name, async () => {
        await action();
        observations.push({
          name, observedAtUtc: new Date().toISOString(), status: await text('status'),
          totals: await text('totals'), historyRows: await count(),
          history: await page.locator('#history').innerText(),
          focusedId: await page.evaluate(() => document.activeElement.id),
        });
        passed = true;
      });
      assert.equal(passed, true, `browser check failed: ${name}`);
    };

    await check('standalone exact banner, labels, initial state, and unshadowed reset', async () => {
      assert.equal(await page.title(), 'S072 — Cold-cache refill comparison');
      assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await count(), 0);
      assert.equal(await page.locator('#latest').isVisible(), false);
      assert.equal(await page.evaluate(() => typeof document.querySelector('#controls').reset), 'function');
      const labels = await page.locator('#controls input, #controls select, #controls button').evaluateAll((controls) =>
        controls.every((control) => control.tagName === 'BUTTON' ? Boolean(control.textContent.trim()) : control.labels.length === 1));
      assert.equal(labels, true);
      assert.equal(await page.locator('#error').isVisible(), false);
    });

    await check('Tab and Enter run the unbounded stampede with all six failures counted', async () => {
      await page.locator('#strategy').focus();
      for (const id of ['requests', 'keys', 'dbCapacity', 'refillMs', 'budgetMs', 'refillLimit', 'observation', 'run']) {
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), id);
      }
      await page.keyboard.press('Enter');
      assert.equal(await text('attempted'), '8');
      assert.equal(await text('success'), '2');
      assert.equal(await text('failure'), '6');
      assert.equal(await text('db-attempted'), '8');
      assert.equal(await text('db-rejected'), '6');
      assert.equal(await text('db-peak'), '2');
      assert.equal(await text('latency'), '40 ms');
      assert.match(await text('interpretation'), /Database-overloading stampede/);
      assert.equal(await page.locator('#journeys tr').count(), 8);
      assert.equal(await page.locator('#journeys tr').filter({ hasText: 'database-overload' }).count(), 6);
      assert.equal(await count(), 1);
    });

    await check('keyboard strategy change coalesces without rewriting the earlier failure', async () => {
      const previous = await text('status');
      await page.locator('#strategy').focus();
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#strategy').inputValue(), 'coalesced');
      assert.equal(await text('status'), previous);
      await run();
      assert.equal(await text('db-attempted'), '1');
      assert.equal(await text('db-rejected'), '0');
      assert.equal(await text('success'), '8');
      assert.equal(await text('failure'), '0');
      assert.equal(await text('latency'), '40 ms');
      assert.match(await text('totals'), /16 attempted; 10 success; 6 failure; 0 unknown/);
      assert.match(await page.locator('#history tr').first().innerText(), /failure/);
    });

    await check('coalescing different keys still exposes overload and affected journeys', async () => {
      await page.locator('#keys').fill('4');
      await run();
      assert.equal(await text('db-attempted'), '4');
      assert.equal(await text('db-rejected'), '2');
      assert.equal(await text('failure'), '4');
      assert.equal(await page.locator('#journeys tr').filter({ hasText: 'database-overload' }).count(), 4);
    });

    await check('bounded FIFO protects data capacity but cannot hide original-budget failures', async () => {
      await page.locator('#strategy').selectOption('bounded');
      await page.locator('#refillLimit').fill('1');
      await page.locator('#budgetMs').fill('80');
      await run();
      assert.equal(await text('db-rejected'), '0');
      assert.equal(await text('db-peak'), '1');
      assert.equal(await text('success'), '4');
      assert.equal(await text('failure'), '4');
      assert.equal(await text('latency'), '160 ms');
      assert.equal(await page.locator('#journeys tr').filter({ hasText: 'latency-budget' }).count(), 4);
      assert.deepEqual(await page.locator('#refills tr td:nth-child(3)').allTextContents(), ['0', '40', '80', '120']);
      await page.locator('#refillLimit').fill('2');
      await run();
      assert.equal(await text('success'), '8');
      assert.equal(await text('failure'), '0');
      assert.equal(await text('latency'), '80 ms');
      assert.match(await text('totals'), /40 attempted; 26 success; 14 failure; 0 unknown/);
    });

    await check('unknown observations stay in the denominator and do not mask known failures', async () => {
      await page.locator('#strategy').selectOption('coalesced');
      await page.locator('#keys').fill('1');
      await page.locator('#budgetMs').fill('100');
      await page.locator('#observation').selectOption('missing-one');
      await run();
      assert.equal(await text('success'), '7');
      assert.equal(await text('unknown'), '1');
      assert.match(await text('status'), /Run 6: unknown/);
      assert.equal(await page.locator('#journeys tr').filter({ hasText: 'missing-latency' }).count(), 1);
      await page.locator('#strategy').selectOption('unbounded');
      await run();
      assert.equal(await text('failure'), '6');
      assert.equal(await text('unknown'), '1');
      assert.match(await text('status'), /Run 7: failure/);
      assert.match(await text('totals'), /56 attempted; 34 success; 20 failure; 2 unknown/);
    });

    await check('invalid decimal, range, relationship, bound, and enum input preserve state with focused errors', async () => {
      const previous = await text('status');
      const retained = await page.locator('#history').innerText();
      const invalid = async (id, value) => {
        await page.locator(`#${id}`).fill(value);
        await run();
        assert.equal(await page.locator('#error').isVisible(), true);
        assert.equal(await page.evaluate(() => document.activeElement.id), id);
        assert.equal(await page.locator(`#${id}`).getAttribute('aria-invalid'), 'true');
        assert.equal(await text('status'), previous);
        assert.equal(await page.locator('#history').innerText(), retained);
      };
      for (const value of ['25', '1.5', '1e1', '', '0']) {
        await invalid('requests', value);
        await page.locator('#requests').fill('8');
      }
      await page.locator('#requests').fill('2');
      await invalid('keys', '3');
      await page.locator('#requests').fill('8');
      await page.locator('#keys').fill('1');
      await page.locator('#strategy').selectOption('bounded');
      await invalid('refillLimit', '3');
      await page.locator('#refillLimit').fill('2');
      await page.locator('#strategy').evaluate((select) => {
        select.add(new Option('Invalid synthetic test option', 'forged'));
        select.value = 'forged';
      });
      await run();
      assert.match(await text('error'), /Invalid strategy/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'strategy');
      assert.equal(await page.locator('#history').innerText(), retained);
      await page.locator('#strategy').selectOption('coalesced');
      await page.locator('#strategy option[value="forged"]').evaluate((option) => option.remove());
      await page.locator('#observation').selectOption('complete');
      await run();
      assert.equal(await count(), 8);
      assert.equal(await page.locator('#error').isVisible(), false);
      assert.equal(await page.locator('[aria-invalid]').count(), 0);
    });

    await check('history cap blocks more work without dropping the first failure', async () => {
      for (let i = 8; i < 12; i += 1) await run();
      assert.equal(await count(), 12);
      assert.equal(await page.locator('#run').isDisabled(), true);
      assert.match(await text('limit-note'), /12 runs retained/);
      assert.match(await page.locator('#history tr').first().innerText(), /unbounded.*complete/);
      assert.match(await page.locator('#history tr').first().innerText(), /failure/);
      await page.locator('#controls').evaluate((form) => form.requestSubmit());
      assert.match(await text('error'), /12 runs retained/);
      assert.equal(await count(), 12);
    });

    await check('Space resets defaults, focus, errors, traces, and history without shadowing form.reset', async () => {
      await page.locator('#restart').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'strategy');
      assert.equal(await page.locator('#strategy').inputValue(), 'unbounded');
      assert.equal(await page.locator('#requests').inputValue(), '8');
      assert.equal(await page.locator('#keys').inputValue(), '1');
      assert.equal(await page.locator('#dbCapacity').inputValue(), '2');
      assert.equal(await page.locator('#refillMs').inputValue(), '40');
      assert.equal(await page.locator('#budgetMs').inputValue(), '100');
      assert.equal(await page.locator('#refillLimit').inputValue(), '2');
      assert.equal(await page.locator('#observation').inputValue(), 'complete');
      assert.equal(await page.locator('#error').isVisible(), false);
      assert.equal(await count(), 0);
      assert.equal(await page.locator('#latest').isVisible(), false);
      assert.equal(await page.locator('#journeys tr').count(), 0);
      assert.equal(await page.locator('#refills tr').count(), 0);
      assert.equal(await page.locator('#run').isEnabled(), true);
      assert.match(await text('totals'), /0 attempted; 0 success; 0 failure; 0 unknown/);
      await run();
      assert.match(await text('status'), /Run 1: failure/);
      assert.equal(await text('failure'), '6');
    });

    await check('small viewport retains usable controls with overflow contained in tables', async () => {
      await page.setViewportSize({ width: 360, height: 800 });
      assert.equal(await page.locator('#run').isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.locator('#restart').focus();
      assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none'), true);
    });

    await check('real CSP blocks inline code and connection attempts with no external requests', async () => {
      await page.evaluate(() => {
        globalThis.__s072Csp = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          globalThis.__s072Csp.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        const script = document.createElement('script');
        script.textContent = 'globalThis.__s072InlineRan = true;';
        document.head.appendChild(script);
      });
      const connection = await page.evaluate(async () => {
        try {
          await fetch(new URL('model.js', location.href));
          return 'unexpectedly allowed';
        } catch {
          return 'blocked';
        }
      });
      assert.equal(connection, 'blocked');
      await page.waitForFunction(() => globalThis.__s072Csp.length >= 2);
      assert.equal(await page.evaluate(() => globalThis.__s072InlineRan), undefined);
      const violations = await page.evaluate(() => globalThis.__s072Csp);
      assert.ok(violations.some((event) => event.directive === 'script-src-elem' && event.blockedURI === 'inline'));
      assert.ok(violations.some((event) => event.directive === 'connect-src'));
      assert.ok(requests.every((request) => request.url.startsWith('file:') && request.method === 'GET'));
      observations.push({ name: 'actual CSP violations', violations, requests });
      assert.deepEqual(runtimeErrors, []);
    });
  } finally {
    if (isolated) {
      await isolated.close();
      closed = true;
    }
  }
  assert.equal(closed, true);
  if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
    const destination = path.join(owned, 'evidence', 'raw', 'browser-observed.json');
    fs.writeFileSync(destination, `${JSON.stringify({
      cardId: 'A-S072', packet: 'SC-S072', mode: 'synthetic-only',
      startedAtUtc, completedAtUtc: new Date().toISOString(),
      node: process.version, playwright: '1.56.1', browserVersion,
      helperCommit: '53c0c0d', helperSha256: helperSha,
      lifecycle: 'openIsolatedLesson; awaited finally close completed',
      capture: 'CAPTURE_BROWSER_EVIDENCE=1 explicitly set for this run only',
      observations, runtimeErrors,
      limits: 'No actual concurrent refill/database stampede, native Azure, production Node.js 24, source-parent completion, or availability certification.',
    }, null, 2)}\n`, { flag: 'wx' });
  }
});
