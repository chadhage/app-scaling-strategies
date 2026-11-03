'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..', '..');
const helper = path.join(root, 'testing', 'browser', 'isolated.cjs');
const expectedHelperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const helperHash = hash(fs.readFileSync(helper));
assert.equal(helperHash, expectedHelperHash, 'Only the published 53c0c0d helper is authorized.');
const { openIsolatedLesson } = require(helper);
const playwright = require(path.join(root, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

test('S032 actual isolated DOM, keyboard, error, reset, failure and CSP checks', async (t) => {
  const startedAtUtc = new Date().toISOString();
  assert.equal(process.version, 'v22.23.4');
  assert.equal(playwright, '1.56.1');
  const executable = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const signedBrowser = JSON.parse(execFileSync('pwsh.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    `$ErrorActionPreference='Stop'; $p='${executable}'; $s=Get-AuthenticodeSignature -LiteralPath $p; `
      + `$v=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion; `
      + `[ordered]@{path=$p;status=$s.Status.ToString();signer=$s.SignerCertificate.Subject;productVersion=$v} | ConvertTo-Json -Compress`
  ], { encoding: 'utf8', windowsHide: true, timeout: 30000 }));
  assert.equal(signedBrowser.status, 'Valid');
  assert.match(signedBrowser.signer, /Microsoft Corporation/);
  assert.match(signedBrowser.productVersion, /^156\./);
  signedBrowser.sha256 = hash(fs.readFileSync(executable));
  const observations = [];
  const pageErrors = [];
  const consoleErrors = [];
  let session;
  let closeAwaited = false;
  let browserVersion = null;
  let outsideRoutes = 0;
  try {
    session = await openIsolatedLesson('learning\\S032\\index.html');
    browserVersion = session.browserVersion;
    assert.equal(browserVersion, signedBrowser.productVersion);
    const page = session.page;
    page.on('pageerror', (problem) => pageErrors.push(problem.message));
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.route('https://example.invalid/**', async (route) => {
      outsideRoutes += 1;
      await route.abort('blockedbyclient');
    });
    const text = async (id) => (await page.locator(`#${id}`).textContent()).trim();
    const cells = (id) => page.locator(`#${id} tr`).evaluateAll((rows) =>
      rows.map((row) => Array.from(row.cells, (cell) => cell.textContent)));
    const press = async (id, key = 'Enter') => {
      await page.locator(`#${id}`).focus();
      await page.locator(`#${id}`).press(key);
    };
    const archive = async () => {
      await press('archive-run', 'Space');
      assert.equal(await page.locator('#green-percent').inputValue(), '100');
      assert.equal(await page.locator('#client-id').inputValue(), 'pinned-a');
      assert.equal(await page.locator('#reply-outcome').inputValue(), 'complete');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'green-percent');
      assert.equal(await text('counts'), '0 / 0 / 0 / 0');
    };
    async function check(name, run) {
      await t.test(name, async () => {
        const details = await run();
        observations.push({
          name, passed: true, details: details || null,
          dom: {
            runEpoch: await text('run-epoch'), nominal: await text('nominal'),
            migrated: await text('migrated'), counts: await text('counts'),
            impact: await text('impact'), retirement: await text('retirement'),
            bounds: await text('bounds'), clients: await cells('client-rows'),
            actionCount: await page.locator('#action-log > li').count(),
            requestCount: await page.locator('#request-rows > tr').count(),
            archiveCount: await page.locator('#archives > details').count()
          }
        });
      });
    }

    await check('honest initial DOM, labels, focus and unknown unobserved evidence', async () => {
      assert.equal(await page.title(), 'S032 · Slot-routing cookie transition');
      assert.equal(await page.getByRole('note').textContent(),
        'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await text('impact'), 'unknown');
      assert.equal(await text('migrated'), '0 / 2');
      assert.equal(await page.locator('#reassign-client').isDisabled(), true);
      assert.equal(await page.getByLabel('Nominal green allocation (%)').count(), 1);
      assert.equal(await page.getByLabel('Originally blue-pinned client').count(), 1);
      assert.equal(await page.getByLabel('Synthetic reassignment reply').count(), 1);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'skip');
      await page.keyboard.press('Tab');
      await page.locator('#green-percent').focus();
      const outline = await page.locator('#green-percent').evaluate((node) => getComputedStyle(node).outlineWidth);
      assert.equal(outline, '3px');
      assert.match(await page.locator('footer').textContent(), /No native Azure support/);
      assert.deepEqual(consoleErrors, []);
      return { initialOutsideRequests: outsideRoutes, focusedOutline: outline };
    });

    await check('keyboard replay reveals pinned destinations at nominal 100 and retirement stays blocked', async () => {
      await press('replay-cohort');
      assert.equal(await text('counts'), '4 / 4 / 0 / 0');
      const rows = await cells('client-rows');
      assert.deepEqual(rows.map((row) => row[3]), ['blue', 'blue', 'green', 'green']);
      assert.equal(await text('migrated'), '0 / 2');
      assert.equal(await text('nominal'), '100%');
      await press('retire-blue', 'Space');
      assert.equal(await text('retirement'), 'blocked');
      assert.match(await text('action-log'), /Blue retained/);
      assert.equal(await text('counts'), '4 / 4 / 0 / 0');
    });

    await check('keyboard-controlled reassignment verifies two migrations then guarded terminal retirement', async () => {
      await press('reassign-client');
      assert.equal(await text('migrated'), '1 / 2');
      await page.locator('#client-id').focus();
      await page.locator('#client-id').press('End');
      assert.equal(await page.locator('#client-id').inputValue(), 'pinned-b');
      await press('reassign-client', 'Space');
      assert.equal(await text('migrated'), '2 / 2');
      assert.equal(await text('retirement'), 'ready');
      assert.equal(await text('impact'), 'success');
      await press('retire-blue');
      assert.equal(await text('retirement'), 'retired');
      assert.equal(await text('counts'), '6 / 6 / 0 / 0');
      assert.equal(await page.locator('#replay-cohort').isDisabled(), true);
      assert.equal(await page.locator('#reassign-client').isDisabled(), true);
      assert.equal(await page.locator('#retire-blue').isDisabled(), true);
      assert.equal(await page.locator('#archive-run').isEnabled(), true);
    });

    await check('keyboard reset uses unshadowed form reset, restores focus and retains the complete prior trace', async () => {
      await archive();
      assert.equal(await text('run-epoch'), '2 / 1');
      assert.equal(await page.locator('#reassign-client').isDisabled(), true);
      assert.equal(await page.locator('#archives details').count(), 1);
      const archived = JSON.parse(await page.locator('#archives pre').textContent());
      assert.equal(archived.summary.verdict, 'success');
      assert.equal(archived.requests.length, 6);
      assert.equal(archived.timeline.at(-1).outcome, 'retired');
      assert.equal(await page.locator('#input-error').isHidden(), true);
      assert.equal(await page.locator('#lesson-controls').evaluate((form) => typeof form.reset), 'function');
      return { archivedSummary: archived.summary, archivedActions: archived.events.length };
    });

    await check('malformed operator input and explicit form submission leave state and trace unchanged', async () => {
      for (const value of ['', '-1', '101', '1e2', '01', ' 5', '5.0']) {
        await page.locator('#green-percent').fill(value);
        await press('apply-weight');
        assert.equal(await page.locator('#input-error').isVisible(), true);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'input-error');
        assert.equal(await page.locator('#green-percent').getAttribute('aria-invalid'), 'true');
        assert.equal(await text('counts'), '0 / 0 / 0 / 0');
        assert.equal(await page.locator('#action-log li').count(), 0);
      }
      await page.locator('#lesson-controls').evaluate((form) => form.requestSubmit());
      assert.match(await text('input-error'), /form submission is disabled/);
      assert.equal(await page.locator('#action-log li').count(), 0);
      await archive();
      assert.equal(await text('run-epoch'), '2 / 1');
      assert.equal(await page.locator('#archives details').count(), 1);
    });

    await check('a missing reassignment reply blocks retirement and remains unknown after current recovery', async () => {
      await press('replay-cohort');
      await page.locator('#reply-outcome').selectOption('unknown');
      await press('reassign-client');
      let first = (await cells('client-rows'))[0];
      assert.deepEqual(first.slice(1, 4), ['green', 'green', 'unknown']);
      assert.equal(await text('counts'), '5 / 4 / 0 / 1');
      assert.equal(await text('migrated'), '0 / 2');
      await press('retire-blue');
      assert.equal(await text('retirement'), 'blocked');
      await press('replay-cohort');
      await page.locator('#client-id').selectOption('pinned-b');
      await page.locator('#reply-outcome').selectOption('complete');
      await press('reassign-client');
      assert.equal(await text('retirement'), 'ready');
      assert.equal(await text('migrated'), '2 / 2');
      assert.equal(await text('impact'), 'unknown');
      const missing = (await cells('request-rows')).filter((row) => row[5].includes('unknown'));
      assert.equal(missing.length, 1);
      assert.equal(missing[0][4], 'unknown');
      first = (await cells('client-rows'))[0];
      assert.equal(first[3], 'green');
      return { retainedMissingRequest: missing[0] };
    });

    await check('an interrupted request is retained through recovery and retirement as failure, not success', async () => {
      await archive();
      await press('replay-cohort');
      await page.locator('#reply-outcome').selectOption('interrupted');
      await press('reassign-client');
      assert.equal(await text('impact'), 'failure');
      assert.equal(await text('counts'), '5 / 4 / 1 / 0');
      await page.locator('#client-id').selectOption('pinned-b');
      await page.locator('#reply-outcome').selectOption('complete');
      await press('reassign-client');
      await press('replay-cohort');
      assert.equal(await text('migrated'), '2 / 2');
      assert.equal(await text('retirement'), 'ready');
      assert.equal(await text('impact'), 'failure');
      await press('retire-blue');
      assert.equal(await text('retirement'), 'retired');
      assert.equal(await text('impact'), 'failure');
      const failed = (await cells('request-rows')).filter((row) => row[5].includes('503'));
      assert.equal(failed.length, 1);
      assert.equal(failed[0][4], 'green');
      return { retainedInterruptedRequest: failed[0] };
    });

    await check('new routing epoch invalidates observations and tampered select values cannot alter state', async () => {
      await archive();
      await press('replay-cohort');
      await press('reassign-client');
      await page.locator('#client-id').selectOption('pinned-b');
      await press('reassign-client');
      await press('apply-weight');
      assert.equal(await text('migrated'), '0 / 2');
      assert.equal(await page.locator('#reassign-client').isDisabled(), true);
      assert.ok((await cells('client-rows')).every((row) => row[4].includes('stale')));
      await press('retire-blue');
      assert.equal(await text('retirement'), 'blocked');
      await press('replay-cohort');
      assert.equal(await text('retirement'), 'ready');
      const before = await text('counts');
      const actions = await page.locator('#action-log li').count();
      for (const id of ['client-id', 'reply-outcome']) {
        await page.locator(`#${id}`).evaluate((select) => {
          select.add(new Option('Invalid synthetic choice', 'unsupported'));
          select.value = 'unsupported';
        });
        await press('reassign-client');
        assert.equal(await page.locator('#input-error').isVisible(), true);
        assert.equal(await text('counts'), before);
        assert.equal(await page.locator('#action-log li').count(), actions);
        await page.locator(`#${id}`).selectOption(id === 'client-id' ? 'pinned-a' : 'complete');
      }
    });

    await check('actual DOM action bound and reset retain at most three archives with counted eviction', async () => {
      await archive();
      await page.locator('#replay-cohort').evaluate((button) => {
        for (let index = 0; index < 24; index += 1) button.click();
      });
      assert.equal(await page.locator('#action-log li').count(), 24);
      assert.equal(await page.locator('#request-rows tr').count(), 96);
      assert.equal(await text('counts'), '96 / 96 / 0 / 0');
      assert.match(await text('bounds'), /^0 actions remaining/);
      assert.equal(await page.locator('#replay-cohort').isDisabled(), true);
      assert.equal(await page.locator('#archive-run').isEnabled(), true);
      await archive();
      assert.equal(await page.locator('#archives details').count(), 3);
      assert.match(await text('bounds'), /2 archived runs evicted/);
      const archives = await page.locator('#archives pre').allTextContents();
      const parsed = archives.map((value) => JSON.parse(value));
      assert.deepEqual(parsed.map((value) => value.run), [3, 4, 5]);
      assert.equal(parsed[0].summary.verdict, 'failure');
      assert.equal(parsed[2].requests.length, 96);
      return { retainedRuns: parsed.map((value) => value.run), evictedRuns: 2 };
    });

    await check('actual CSP blocks inline code, inline handlers, connections, base changes and form navigation', async () => {
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(consoleErrors, []);
      const beforeURL = page.url();
      const result = await page.evaluate(async () => {
        globalThis.s032Violations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          globalThis.s032Violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        const script = document.createElement('script');
        script.textContent = 'globalThis.s032InlineExecuted = true';
        document.head.append(script);
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('onclick', 'globalThis.s032HandlerExecuted = true');
        document.body.append(button);
        button.click();
        button.remove();
        let connectionBlocked = false;
        try { await fetch('https://example.invalid/s032-evidence'); } catch { connectionBlocked = true; }
        const base = document.createElement('base');
        base.href = 'https://example.invalid/';
        document.head.append(base);
        const form = document.createElement('form');
        form.action = 'https://example.invalid/s032-form';
        form.method = 'post';
        document.body.append(form);
        form.requestSubmit();
        return {
          connectionBlocked, inlineExecuted: globalThis.s032InlineExecuted === true,
          handlerExecuted: globalThis.s032HandlerExecuted === true
        };
      });
      await page.waitForFunction(() => ['script-src-elem', 'script-src-attr', 'connect-src', 'base-uri', 'form-action']
        .every((directive) => globalThis.s032Violations.some((entry) => entry.directive === directive)));
      const violations = await page.evaluate(() => globalThis.s032Violations);
      assert.equal(result.connectionBlocked, true);
      assert.equal(result.inlineExecuted, false);
      assert.equal(result.handlerExecuted, false);
      assert.equal(page.url(), beforeURL);
      assert.equal(outsideRoutes, 0, 'CSP must block before the protective test route is invoked.');
      assert.equal(await page.evaluate(() => document.baseURI), beforeURL);
      assert.deepEqual(pageErrors, []);
      assert.ok(consoleErrors.every((entry) => /Content Security Policy|violates.*directive/i.test(entry)));
      return { ...result, violations, outsideRequestsRouted: outsideRoutes };
    });
  } finally {
    try {
      if (session) {
        await session.close();
        closeAwaited = true;
      }
    } finally {
      if (capture) {
        const evidence = path.join(__dirname, 'evidence');
        let number = 1;
        while (fs.existsSync(path.join(evidence, `browser-observation-${number}.json`))) number += 1;
        fs.writeFileSync(path.join(evidence, `browser-observation-${number}.json`), `${JSON.stringify({
          cardId: 'A-S032', workerId: 'worker-A-S032', packet: 'SC-S032',
          status: observations.length === 10 && closeAwaited && pageErrors.length === 0 ? 'passed' : 'failed',
          startedAtUtc, finishedAtUtc: new Date().toISOString(), captureWasExplicit: true,
          mode: 'actual-isolated-headless-file-browser-exercising-synthetic-lesson',
          node: process.version, playwright, signedBrowser, browserVersion,
          helper: 'testing\\browser\\isolated.cjs', helperSha256: helperHash,
          helperPublishedCommit: '53c0c0d', openAPI: 'openIsolatedLesson', closeAwaited,
          knownLifecycleLimitation: 'Published helper limit remains; abandoned lifecycle prototype unused and unqualified.',
          parentGroups: 1, expectedLeafChecks: 10, passedLeafChecks: observations.length,
          pageErrors, consoleErrors, outsideRequestsRouted: outsideRoutes, observations,
          sourceHashes: Object.fromEntries(fs.readdirSync(__dirname)
            .filter((name) => fs.statSync(path.join(__dirname, name)).isFile()
              && !['evidence.json', 'result.json'].includes(name))
            .sort().map((name) => [name, hash(fs.readFileSync(path.join(__dirname, name)))])),
          cleanup: { listenersStarted: 0, foregroundLeases: 0, cloudResourcesCreated: 0, unownedCleanupPerformed: false },
          nativeProof: false, productionNode24Validated: false, sourceParentComplete: false
        }, null, 2)}\n`, { flag: 'wx' });
      }
    }
  }
});
