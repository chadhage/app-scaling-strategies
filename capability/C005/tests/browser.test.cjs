'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const catalog = require('../catalog-data.js');
const contract = require('../catalog-contract.js');
const generation = require('../evidence/op-catalog-snapshot-refresh-76-01675ac8d423/generation.json');
const helperPath = path.resolve(__dirname, '..', '..', '..', 'testing', 'browser', 'isolated.cjs');
const helperSourceSha256 = createHash('sha256').update(readFileSync(helperPath)).digest('hex');
const PUBLISHED_HELPER_COMMIT = '53c0c0d82cc1db6780a87ac2b1085734af6d5c60';
const PUBLISHED_HELPER_SHA256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
assert.equal(helperSourceSha256, PUBLISHED_HELPER_SHA256, 'Verify the published helper before import.');
assert.equal(readFileSync(helperPath, 'utf8').replaceAll('\r\n', '\n'),
  execFileSync('git', ['--no-pager', 'show', `${PUBLISHED_HELPER_COMMIT}:testing/browser/isolated.cjs`],
    { encoding: 'utf8' }).replaceAll('\r\n', '\n'));
const { openIsolatedLesson } = require(helperPath);
const helperRequire = createRequire(helperPath);

test('C005 actual isolated headless DOM, keyboard, source, count and CSP acceptance', { timeout: 150000 }, async t => {
  const historicalPath = path.join(__dirname, '..', 'evidence', 'browser-observations.json');
  const historicalProof = await fs.readFile(historicalPath);
  const reportPath = path.join(__dirname, '..', 'evidence',
    `browser-op-catalog-snapshot-refresh-76-01675ac8d423-${randomUUID()}.json`);
  assert.equal(Object.hasOwn(require.cache, path.join(path.dirname(helperPath), 'lifecycle.cjs')), false);
  const session = await openIsolatedLesson('capability\\C005\\index.html');
  const { page, browserVersion } = session;
  const checks = [];
  const pageErrors = [];
  const remoteRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (/^https?:/i.test(request.url())) remoteRequests.push(request.url());
  });
  const entries = page.locator('.catalog-entry');
  async function check(name, run) {
    await t.test(name, async () => {
      await run();
      checks.push({ name, passed: true });
    });
  }
  async function restore() {
    assert.equal(await page.evaluate(() => C005Page.renderCatalog(C005Catalog, C003Matrix, document)), true);
    assert.equal(await entries.count(), 152);
    assert.equal(await page.locator('#catalog-error').isVisible(), false);
  }
  let report;
  let cspObservation;
  try {
    assert.match(browserVersion, /^156\./);
    assert.equal(helperRequire('playwright/package.json').version, '1.56.1');
    assert.match(process.version, /^v22\./);
    await check('actual DOM contains exactly S001–S150 and W001/W002 in sixteen source sections', async () => {
      assert.equal(await entries.count(), 152);
      assert.equal(await page.locator('[data-kind="scenario"]').count(), 150);
      assert.equal(await page.locator('[data-kind="workflow"]').count(), 2);
      assert.deepEqual(await entries.evaluateAll(nodes => nodes.map(node => node.dataset.entryId)), catalog.entries.map(entry => entry.id));
      assert.deepEqual(await page.locator('.catalog-entry h3').allTextContents(), catalog.entries.map(entry => `${entry.id} — ${entry.title}`));
      assert.deepEqual(await page.locator('.objective').allTextContents(), catalog.entries.map(entry => entry.objective));
      assert.equal(await page.locator('#categories a').count(), 16);
      assert.equal(await page.locator('.source-group').count(), 16);
      assert.equal(await page.locator('#catalog-count').innerText(),
        `150 source scenarios · 2 guided workflows · ${generation.acceptedPortableLessons} accepted portable lessons in snapshot · 0 native runnable · 0 completed source parents.`);
      assert.equal(await page.locator('#catalog-error').isVisible(), false);
      assert.equal(await page.locator('#catalog-empty').isVisible(), false);
    });
    await check('historical commit/time and all sixty-one accepted learning destinations are explicit, not live', async () => {
      const summary = await page.locator('#snapshot-summary').innerText();
      assert.ok(summary.includes(catalog.acceptanceSnapshot.commit));
      assert.ok(summary.includes(catalog.acceptanceSnapshot.commitTimeUtc));
      assert.ok(summary.includes(catalog.acceptanceSnapshot.ledgerUpdatedAtUtc));
      assert.match(summary, /historical snapshot, not live availability/);
      assert.equal(await page.locator('#snapshot-source a').getAttribute('href'),
        `https://github.com/chadhage/app-scaling-strategies/blob/${catalog.source.commit}/.docs/wiki/flow-state.json`);
      assert.equal(await page.locator('.lesson-link').count(), generation.acceptedPortableLessons);
      assert.deepEqual(await page.locator('.lesson-link').evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))),
        catalog.entries.filter(entry => entry.learning.available).map(entry => entry.learning.href));
      assert.equal(await page.locator('#S062 .lesson-link, #S063 .lesson-link, #W001 .lesson-link, #W002 .lesson-link').count(), 0);
      assert.match(await page.locator('#S062 .learning-status').innerText(), /No accepted Done review.*published-but-unaccepted/s);
      assert.match(await page.locator('#W002 .learning-status').innerText(), /No portable A-card lesson is defined/);
    });
    await check('all 302 actual source anchors point at the matching pinned canonical row', async () => {
      const expected = catalog.entries.flatMap(entry => entry.sourceReferences.map(ref => contract.sourceHref(catalog, ref)));
      const actual = await page.locator('.source-link').evaluateAll(nodes => nodes.map(node => node.href));
      assert.equal(actual.length, 302);
      assert.deepEqual(actual, expected);
      for (const id of ['S001', 'S150', 'W001', 'W002']) {
        assert.ok((await page.locator(`#${id} .source-link`).first().innerText()).includes(id));
      }
      const localLinks = await page.locator('a[href^="../../README"], a[href^="../../.docs"]').count();
      assert.equal(localLinks, 3);
    });
    await check('portable, native, support and parent distinctions remain separate on all cards', async () => {
      assert.equal(await page.locator('.native-status').count(), 152);
      assert.equal(await page.locator('.support-status').count(), 152);
      assert.equal(await page.locator('.parent-status').count(), 152);
      assert.ok((await page.locator('.native-status').allTextContents()).every(text => /Not runnable; qualified: false/.test(text)));
      assert.ok((await page.locator('.support-status').allTextContents()).every(text => /Unknown.*no concrete target.*unsupported\/unknown reasons/s.test(text)));
      assert.ok((await page.locator('.parent-status').allTextContents()).every(text => /incomplete.*not completed/s.test(text)));
      assert.match(await page.locator('#S001 .learning-status').innerText(), /Training rehearsal.*synthetic data.*not a live Azure result/s);
      assert.equal(await page.locator('button, input, select, form, iframe, [onclick], [data-action]').count(), 0);
    });
    await check('actual Tab and Enter operate skip link, category navigation and a preserved accepted lesson', async () => {
      await page.reload({ waitUntil: 'load' });
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
      const skipOutline = await page.locator('.skip-link').evaluate(node => getComputedStyle(node).outlineStyle);
      assert.notEqual(skipOutline, 'none');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'catalog');
      await page.locator('#categories a').first().focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'section-A');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'lesson-link');
      assert.match(await page.evaluate(() => document.activeElement.getAttribute('href')), /learning\/S001\/index\.html$/);
      await page.keyboard.press('Enter');
      await page.waitForURL(/\/learning\/S001\/index\.html$/);
      assert.match(await page.locator('body').innerText(), /synthetic|training rehearsal/i);
      await page.goBack({ waitUntil: 'load' });
      assert.equal(await entries.count(), 152);
      await page.locator('#categories a').last().focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'section-W');
      await page.keyboard.press('Tab');
      assert.match(await page.evaluate(() => document.activeElement.textContent), /C003 configuration reasons for W001/);
    });
    await check('320 CSS-pixel viewport reflows long source metadata without horizontal scrolling', async () => {
      await page.setViewportSize({ width: 320, height: 740 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await entries.count(), 152);
      assert.equal(await page.locator('#W002 h3').isVisible(), true);
      await page.setViewportSize({ width: 1280, height: 900 });
    });
    await check('missing data removes old cards and exposes real accessible error and empty states', async () => {
      assert.equal(await page.evaluate(() => C005Page.renderCatalog(undefined, C003Matrix, document)), false);
      assert.equal(await entries.count(), 0);
      assert.equal(await page.locator('#categories a').count(), 0);
      assert.equal(await page.locator('#snapshot-source a').count(), 0);
      assert.equal(await page.locator('#catalog-error').isVisible(), true);
      assert.equal(await page.locator('#catalog-error').getAttribute('role'), 'alert');
      assert.equal(await page.locator('#catalog-empty').isVisible(), true);
      assert.match(await page.locator('#catalog-count').innerText(), /unavailable.*unverified/);
      assert.match(await page.locator('#snapshot-summary').innerText(), /No validated committed snapshot/);
      await restore();
    });
    await check('empty and wrong-version data fail closed rather than reporting zero successful coverage', async () => {
      for (const kind of ['empty', 'version']) {
        assert.equal(await page.evaluate(kind => {
          const value = structuredClone(C005Catalog);
          if (kind === 'empty') value.entries = [];
          else value.schemaVersion = '99.0.0';
          return C005Page.renderCatalog(value, C003Matrix, document);
        }, kind), false);
        assert.equal(await entries.count(), 0);
        assert.equal(await page.locator('#catalog-error').isVisible(), true);
        assert.equal(await page.locator('#catalog-empty').isVisible(), true);
        assert.match(await page.locator('#catalog-count').innerText(), /unverified/);
        await restore();
      }
    });
    await check('native promotion, source-parent completion and absent C003 data are rejected in the actual DOM', async () => {
      for (const kind of ['native', 'parent', 'matrix']) {
        assert.equal(await page.evaluate(kind => {
          const value = structuredClone(C005Catalog);
          if (kind === 'native') value.entries[0].native.qualified = true;
          if (kind === 'parent') value.entries[0].parent.completed = true;
          return C005Page.renderCatalog(value, kind === 'matrix' ? undefined : C003Matrix, document);
        }, kind), false);
        assert.equal(await entries.count(), 0);
        assert.equal(await page.locator('#catalog-error').isVisible(), true);
        await restore();
      }
    });
    await check('source text is rendered literally, never as executable markup', async () => {
      const literal = '<img src="https://invalid.example/c005" onerror="globalThis.C005UnexpectedExecution=true">';
      assert.equal(await page.evaluate(literal => {
        const fixture = structuredClone(C005Catalog);
        fixture.entries[0].title = literal;
        return C005Page.renderCatalog(fixture, C003Matrix, document);
      }, literal), true);
      assert.equal(await page.locator('#S001 h3').textContent(), `S001 — ${literal}`);
      assert.equal(await page.locator('#catalog-entries img, #catalog-entries script').count(), 0);
      assert.equal(await page.evaluate(() => globalThis.C005UnexpectedExecution), undefined);
      await restore();
    });
    await check('actual CSP blocks inline code and connection attempts; no application remote requests occur', async () => {
      assert.deepEqual(remoteRequests, []);
      assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => /^https?:/.test(entry.name)).length), 0);
      cspObservation = await page.evaluate(async () => {
        const violations = [];
        const listener = event => violations.push(event.effectiveDirective);
        document.addEventListener('securitypolicyviolation', listener);
        const script = document.createElement('script');
        script.textContent = 'globalThis.C005CspInlineExecuted = true;';
        document.head.append(script);
        let connectionBlocked = false;
        try { await fetch('https://invalid.example/c005-csp-probe', { mode: 'no-cors' }); }
        catch { connectionBlocked = true; }
        await new Promise(resolve => setTimeout(resolve, 50));
        script.remove();
        document.removeEventListener('securitypolicyviolation', listener);
        return { violations, connectionBlocked, inlineExecuted: globalThis.C005CspInlineExecuted === true };
      });
      assert.equal(cspObservation.inlineExecuted, false);
      assert.equal(cspObservation.connectionBlocked, true);
      assert.ok(cspObservation.violations.includes('script-src-elem'));
      assert.ok(cspObservation.violations.includes('connect-src'));
      assert.deepEqual(remoteRequests, []);
      assert.deepEqual(pageErrors, []);
      assert.equal(await entries.count(), 152);
    });
    assert.equal(checks.length, 11);
    report = {
      schemaVersion: 1, cardId: 'C005', operation: 'OP-CATALOG-SNAPSHOT-REFRESH-76', status: 'passed',
      observedAtUtc: new Date().toISOString(), mode: 'actual-isolated-headless',
      engine: 'Microsoft Edge (Chromium)', browserVersion,
      playwrightVersion: helperRequire('playwright/package.json').version,
      helper: 'testing\\browser\\isolated.cjs', helperApi: 'openIsolatedLesson',
      helperSourceSha256, helperPublishedCommit: PUBLISHED_HELPER_COMMIT,
      helperProvenanceNote: 'Exact published helper bytes/source verified before import; no abandoned lifecycle dependency.',
      lesson: 'capability\\C005\\index.html', actualDomAndKeyboard: true, mockedBrowser: false,
      unsafeLaunchFlagsUsed: false, integratedForegroundUsed: false,
      sourcePin: catalog.source.commit, sourceScenarios: 150, guidedWorkflows: 2,
      generationSha256: generation.data.sha256, snapshotLessons: generation.acceptedPortableLessons,
      acceptedPracticeDestinations: catalog.entries.filter(entry => entry.learning.available).map(entry => entry.learning.href),
      unknownSupport: 152, nativeRunnable: 0, nativeQualified: 0, completedSourceParents: 0,
      checks, cspObservation, pageErrors, remoteRequests,
      nativeAzureObserved: false, productionNode24Validated: false,
      accessibilityLimit: 'Recorded keyboard, labels, live/error states, source links, mobile reflow and CSP checks; not a full WCAG/assistive-technology certification.'
    };
  } finally {
    await session.close();
  }
  report.browserCleanup = 'completed by awaited close() in finally';
  assert.equal(createHash('sha256').update(readFileSync(helperPath)).digest('hex'), PUBLISHED_HELPER_SHA256);
  assert.deepEqual(await fs.readFile(historicalPath), historicalProof, 'historical browser proof stays byte-for-byte unchanged');
  if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  }
  console.log(`C005 actual browser: Microsoft Edge ${browserVersion}; Playwright ${report.playwrightVersion}; 11 acceptance groups; close awaited.`);
});
