'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const catalog = require('../../C005/catalog-data.js');
const contract = require('../../C005/catalog-contract.js');
const generation = require('../../C005/evidence/op-catalog-snapshot-refresh-76-01675ac8d423/generation.json');
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

test('C006 actual isolated browser search, keyboard, failure, reset, literal and CSP acceptance', { timeout: 180000 }, async t => {
  const historicalPath = path.join(__dirname, '..', 'evidence', 'browser-observations.json');
  const historicalProof = await fs.readFile(historicalPath);
  assert.equal(Object.hasOwn(require.cache, path.join(path.dirname(helperPath), 'lifecycle.cjs')), false);
  const session = await openIsolatedLesson('capability\\C006\\index.html');
  const { page, browserVersion } = session;
  const checks = [];
  const pageErrors = [];
  const remoteRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (/^https?:/i.test(request.url())) remoteRequests.push(request.url());
  });
  const entries = page.locator('.search-result');
  const input = page.getByRole('searchbox', { name: 'Search titles and objectives', exact: true });
  const actualIds = () => entries.evaluateAll(nodes => nodes.map(node => node.dataset.entryId));
  async function check(name, run) {
    await t.test(name, async () => {
      await run();
      checks.push({ name, passed: true });
    });
  }
  async function query(text) {
    await input.fill(text);
    await input.press('Enter');
  }
  async function restore() {
    assert.equal(await page.evaluate(() => {
      C006Page.mountSearch(C005Catalog, C003Matrix, document);
      return document.getElementById('search-error').hidden;
    }), true);
    assert.equal(await entries.count(), 152);
    assert.equal(await page.locator('#search-error').isVisible(), false);
    assert.equal(await page.locator('#search-empty').isVisible(), false);
  }
  let report;
  let cspObservation;
  try {
    await check('actual DOM has all 152 original IDs, titles and objectives in stable order', async () => {
      assert.match(browserVersion, /^156\./);
      assert.equal(helperRequire('playwright/package.json').version, '1.56.1');
      assert.match(process.version, /^v22\./);
      assert.equal(await entries.count(), 152);
      assert.equal(await page.locator('[data-kind="scenario"]').count(), 150);
      assert.equal(await page.locator('[data-kind="workflow"]').count(), 2);
      assert.deepEqual(await actualIds(), catalog.entries.map(entry => entry.id));
      assert.deepEqual(await page.locator('.search-result h3').allTextContents(), catalog.entries.map(entry => `${entry.id} — ${entry.title}`));
      assert.deepEqual(await page.locator('.objective').allTextContents(), catalog.entries.map(entry => entry.objective));
      assert.equal(await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
        return ids.length === new Set(ids).size;
      }), true);
      assert.match(await page.locator('#search-count').innerText(), /152 of 152.*empty query/);
      assert.equal(await page.locator('#search-count').getAttribute('role'), 'status');
      assert.equal(await page.locator('#search-count').getAttribute('aria-live'), 'polite');
      assert.equal(await page.locator('#search-error').isVisible(), false);
      assert.equal(await page.locator('#search-empty').isVisible(), false);
    });
    await check('historical provenance and sixty-one accepted lesson destinations bind to the new generation, not live state', async () => {
      const summary = await page.locator('#snapshot-summary').innerText();
      for (const value of [catalog.acceptanceSnapshot.commit, catalog.acceptanceSnapshot.commitTimeUtc,
        catalog.acceptanceSnapshot.ledgerUpdatedAtUtc, catalog.acceptanceSnapshot.ledgerSha256]) {
        assert.ok(summary.includes(value));
      }
      assert.match(summary, /historical snapshot, not live availability/);
      assert.equal(await page.locator('#snapshot-source a').getAttribute('href'),
        `https://github.com/chadhage/app-scaling-strategies/blob/${catalog.acceptanceSnapshot.commit}/.docs/wiki/flow-state.json`);
      assert.deepEqual(await page.locator('.lesson-link').evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))),
        catalog.entries.filter(entry => entry.learning.available).map(entry => entry.learning.href));
      assert.equal(await page.locator('.lesson-link').count(), generation.acceptedPortableLessons);
      assert.equal(await page.locator('#S062 .lesson-link, #S063 .lesson-link, #W001 .lesson-link, #W002 .lesson-link').count(), 0);
      assert.ok((await page.locator('#S062 .learning-status').innerText()).includes(catalog.entries[61].learning.reason));
      assert.match(await page.locator('#availability-summary').innerText(),
        new RegExp(`${generation.acceptedPortableLessons} accepted portable lessons.*0 native runnable.*0 native qualified.*0 completed source parents`));
    });
    await check('all 302 pinned canonical source-row links and shared entry links retain their source IDs', async () => {
      assert.deepEqual(await page.locator('.source-link').evaluateAll(nodes => nodes.map(node => node.href)),
        catalog.entries.flatMap(entry => entry.sourceReferences.map(reference => contract.sourceHref(catalog, reference))));
      assert.deepEqual(await page.locator('.catalog-link').evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))),
        catalog.entries.map(entry => `../C005/index.html#${entry.id}`));
      assert.equal(await page.locator('.source-link').count(), 302);
    });
    await check('native false, unknown support, unclassified risk and planned parents remain separate from learning', async () => {
      for (const selector of ['.native-status', '.support-status', '.risk-status', '.parent-status']) {
        assert.equal(await page.locator(selector).count(), 152);
      }
      assert.ok((await page.locator('.native-status').allTextContents()).every(text => /unverified; runnable: false; qualified: false/.test(text)));
      assert.ok((await page.locator('.support-status').allTextContents()).every(text => text.startsWith('unknown.')));
      assert.ok((await page.locator('.risk-status').allTextContents()).every(text => text === `unclassified. ${catalog.common.riskReason}`));
      assert.deepEqual(await page.locator('.parent-status').allTextContents(),
        catalog.entries.map(entry => `${entry.parentId} — planned; completed: false. ${entry.parent.reason}`));
      assert.ok((await page.locator('.support-status a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))))
        .every(href => href === catalog.capabilityMatrix.href));
      assert.equal(await page.locator('button').count(), 2);
      assert.equal(await page.locator('input').count(), 1);
      assert.equal(await page.locator('select, iframe, [onclick], [data-action]').count(), 0);
    });
    await check('full title and full objective searches submit through the real keyboard without navigation', async () => {
      const url = page.url();
      await query('Warm blue-green handoff');
      assert.deepEqual(await actualIds(), ['S001']);
      assert.equal(await input.inputValue(), 'Warm blue-green handoff');
      assert.match(await page.locator('#search-count').innerText(), /1 of 152/);
      await query(catalog.entries[0].objective);
      assert.deepEqual(await actualIds(), ['S001']);
      assert.equal(page.url(), url);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'search-query');
    });
    await check('partial title/objective input is live, literal, case-insensitive and deterministically ordered', async () => {
      await input.fill('  BLUE-GREEN  ');
      assert.deepEqual(await actualIds(), ['S001', 'S124', 'S128']);
      await input.fill('migrate traffic only after');
      assert.deepEqual(await actualIds(), ['S001']);
      for (const text of ['blue-green', 'BLUE-GREEN', 'blue-green']) {
        await query(text);
        assert.deepEqual(await actualIds(), ['S001', 'S124', 'S128']);
      }
      await query('.*');
      assert.equal(await entries.count(), 0);
      assert.equal(await page.locator('#search-empty').isVisible(), true);
      assert.equal(await page.locator('#search-error').isVisible(), false);
    });
    await check('both guided workflows are discoverable without becoming executable', async () => {
      for (const entry of catalog.entries.slice(150)) {
        await query(entry.title);
        assert.deepEqual(await actualIds(), [entry.id]);
        assert.equal(await page.locator('.lesson-link').count(), 0);
        assert.match(await page.locator('.native-status').innerText(), /runnable: false; qualified: false/);
      }
      await query('getProfile');
      assert.deepEqual(await actualIds(), ['W002']);
    });
    await check('no-result, whitespace, empty and native keyboard Reset have distinct successful states', async () => {
      const literal = '<img src="https://invalid.example/c006-query" onerror="globalThis.C006UnexpectedExecution=true">';
      await query(literal);
      assert.equal(await entries.count(), 0);
      assert.equal(await page.locator('#search-empty').isVisible(), true);
      assert.equal(await page.locator('#search-error').isVisible(), false);
      assert.ok((await page.locator('#search-count').textContent()).includes(literal));
      assert.match(await page.locator('#search-count').innerText(), /0 of 152.*No matching titles or objectives/);
      assert.equal(await page.locator('#search-count img, #search-count script').count(), 0);
      for (const text of ['   \t', '']) {
        await query(text);
        assert.equal(await entries.count(), 152);
        assert.equal(await page.locator('#search-empty').isVisible(), false);
      }
      await query('c006-no-matching-title-79583');
      const url = page.url();
      await page.evaluate(() => { globalThis.C006ResetToken = 'same-document'; });
      await input.focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Search');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Reset');
      await page.keyboard.press('Enter');
      assert.equal(await input.inputValue(), '');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'search-query');
      assert.equal(await entries.count(), 152);
      assert.equal(await page.locator('#search-empty').isVisible(), false);
      assert.equal(await page.evaluate(() => globalThis.C006ResetToken), 'same-document');
      assert.equal(page.url(), url);
    });
    await check('Tab and Enter operate the skip link and visibly focused labeled search controls', async () => {
      await page.reload({ waitUntil: 'load' });
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
      assert.notEqual(await page.locator('.skip-link').evaluate(node => getComputedStyle(node).outlineStyle), 'none');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'search-query');
      assert.notEqual(await input.evaluate(node => getComputedStyle(node).outlineStyle), 'none');
      assert.equal(await input.getAttribute('aria-describedby'), 'search-help');
      assert.equal(await page.locator('#search-form').getAttribute('role'), 'search');
      await page.keyboard.type('BLUE-GREEN');
      await page.keyboard.press('Enter');
      assert.deepEqual(await actualIds(), ['S001', 'S124', 'S128']);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'search-query');
    });
    await check('a result links to the original accepted synthetic lesson through keyboard navigation', async () => {
      await query('Warm blue-green handoff');
      await input.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'lesson-link');
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), catalog.entries[0].learning.href);
      await page.keyboard.press('Enter');
      await page.waitForURL(/\/learning\/S001\/index\.html$/);
      assert.match(await page.locator('body').innerText(), /Training rehearsal|synthetic/i);
      await page.goBack({ waitUntil: 'load' });
      await restore();
    });
    await check('320 CSS-pixel reflow contains long titles, provenance, source URLs and controls', async () => {
      await page.setViewportSize({ width: 320, height: 850 });
      for (const text of ['', catalog.entries[151].title]) {
        await query(text);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        assert.equal(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth), true);
      }
      await page.setViewportSize({ width: 1280, height: 900 });
      await restore();
    });
    await check('non-string query errors clear all stale results and provenance, and valid input recovers', async () => {
      for (const kind of ['null', 'number', 'array', 'object', 'boxed', 'symbol']) {
        assert.equal(await page.evaluate(kind => {
          const controller = C006Page.mountSearch(C005Catalog, C003Matrix, document);
          const value = kind === 'null' ? null : kind === 'number' ? 42 : kind === 'array' ? []
            : kind === 'object' ? {} : kind === 'boxed' ? new String('blue-green') : Symbol('query');
          return controller.search(value);
        }, kind), false);
        assert.equal(await entries.count(), 0);
        assert.equal(await page.locator('#search-error').isVisible(), true);
        assert.equal(await page.locator('#search-error').getAttribute('role'), 'alert');
        assert.match(await page.locator('#search-error').innerText(), /primitive string/);
        assert.equal(await input.getAttribute('aria-invalid'), 'true');
        assert.equal(await page.locator('#snapshot-source a').count(), 0);
        assert.equal(await page.locator('#search-empty').isVisible(), false);
        assert.match(await page.locator('#search-count').innerText(), /unavailable.*unverified/);
        await input.fill('Warm blue-green handoff');
        assert.deepEqual(await actualIds(), ['S001']);
        assert.equal(await page.locator('#search-error').isVisible(), false);
        assert.equal(await input.getAttribute('aria-invalid'), null);
      }
      await restore();
    });
    await check('malformed catalogs, sparse data and missing C003 fail closed in the actual DOM', async () => {
      for (const kind of ['missing', 'empty', 'version', 'native', 'parent', 'risk', 'source', 'sparse', 'reference', 'matrix']) {
        assert.equal(await page.evaluate(kind => {
          let value = structuredClone(C005Catalog);
          if (kind === 'missing') value = undefined;
          if (kind === 'empty') value.entries = [];
          if (kind === 'version') value.schemaVersion = '99.0.0';
          if (kind === 'native') value.entries[0].native.runnable = true;
          if (kind === 'parent') value.entries[0].parent.completed = true;
          if (kind === 'risk') value.entries[0].risk = 'low';
          if (kind === 'source') value.source.readme.sha256 = 'invalid';
          if (kind === 'sparse') delete value.entries[0];
          if (kind === 'reference') delete value.entries[0].sourceReferences[0];
          return C006Page.mountSearch(value, kind === 'matrix' ? undefined : C003Matrix, document).search('');
        }, kind), false);
        assert.equal(await entries.count(), 0);
        assert.equal(await page.locator('#snapshot-source a').count(), 0);
        assert.equal(await page.locator('#search-error').isVisible(), true);
        assert.match(await page.locator('#search-error').innerText(), /Catalog rejected by C005/);
        assert.match(await page.locator('#availability-summary').innerText(), /unverified/);
        assert.equal(await page.locator('#search-empty').isVisible(), false);
        await restore();
      }
    });
    await check('remounting removes previous handlers instead of duplicating live search updates', async () => {
      const observation = await page.evaluate(async () => {
        C006Page.mountSearch(C005Catalog, C003Matrix, document);
        C006Page.mountSearch(C005Catalog, C003Matrix, document);
        const mutations = [];
        const observer = new MutationObserver(records => mutations.push(...records));
        observer.observe(document.getElementById('search-count'), { childList: true });
        const input = document.getElementById('search-query');
        input.value = 'blue-green';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await Promise.resolve();
        observer.disconnect();
        return { countUpdates: mutations.length, ids: [...document.querySelectorAll('.search-result')].map(node => node.dataset.entryId) };
      });
      assert.equal(observation.countUpdates, 1);
      assert.deepEqual(observation.ids, ['S001', 'S124', 'S128']);
      await restore();
    });
    await check('source title/objective markup is literal text, never an executable element', async () => {
      const title = '<img src="https://invalid.example/c006-title" onerror="globalThis.C006UnexpectedExecution=true">';
      const objective = '<svg onload="globalThis.C006UnexpectedExecution=true">literal objective</svg>';
      assert.equal(await page.evaluate(({ title, objective }) => {
        const fixture = structuredClone(C005Catalog);
        fixture.entries[0].title = title;
        fixture.entries[0].objective = objective;
        return C006Page.mountSearch(fixture, C003Matrix, document).search('<img');
      }, { title, objective }), true);
      assert.deepEqual(await actualIds(), ['S001']);
      assert.equal(await page.locator('#S001 h3').textContent(), `S001 — ${title}`);
      assert.equal(await page.locator('#S001 .objective').textContent(), objective);
      assert.equal(await page.locator('#search-results img, #search-results script, #search-results svg').count(), 0);
      assert.equal(await page.evaluate(() => globalThis.C006UnexpectedExecution), undefined);
      await restore();
    });
    await check('actual CSP blocks inline code and connection probes without application remote requests', async () => {
      assert.deepEqual(remoteRequests, []);
      assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => /^https?:/.test(entry.name)).length), 0);
      cspObservation = await page.evaluate(async () => {
        const violations = [];
        const listener = event => violations.push(event.effectiveDirective);
        document.addEventListener('securitypolicyviolation', listener);
        const script = document.createElement('script');
        script.textContent = 'globalThis.C006CspInlineExecuted = true;';
        document.head.append(script);
        let connectionBlocked = false;
        try { await fetch('https://invalid.example/c006-csp-probe', { mode: 'no-cors' }); }
        catch { connectionBlocked = true; }
        await new Promise(resolve => setTimeout(resolve, 75));
        script.remove();
        document.removeEventListener('securitypolicyviolation', listener);
        return { violations, connectionBlocked, inlineExecuted: globalThis.C006CspInlineExecuted === true };
      });
      assert.equal(cspObservation.inlineExecuted, false);
      assert.equal(cspObservation.connectionBlocked, true);
      assert.ok(cspObservation.violations.includes('script-src-elem'));
      assert.ok(cspObservation.violations.includes('connect-src'));
      assert.deepEqual(remoteRequests, []);
      assert.deepEqual(pageErrors, []);
      assert.equal(await entries.count(), 152);
    });
    assert.equal(checks.length, 16);
    report = {
      schemaVersion: 1, cardId: 'C006', operation: 'OP-CATALOG-SNAPSHOT-REFRESH-76', status: 'passed',
      observedAtUtc: new Date().toISOString(), mode: 'actual-isolated-headless',
      nodeVersion: process.version, browser: 'Microsoft Edge', browserVersion,
      playwrightVersion: helperRequire('playwright/package.json').version,
      helper: 'testing\\browser\\isolated.cjs', helperApi: 'openIsolatedLesson', helperSourceSha256,
      helperPublishedCommit: PUBLISHED_HELPER_COMMIT,
      helperProvenance: 'Exact published helper bytes/source verified before import; no abandoned lifecycle dependency.',
      page: 'capability\\C006\\index.html', mockedBrowser: false, actualDomAndKeyboard: true,
      unsafeLaunchFlagsUsed: false, integratedForegroundUsed: false,
      catalogGenerationSha256: generation.data.sha256,
      sourcePin: catalog.source.commit, acceptanceSnapshot: catalog.acceptanceSnapshot,
      sourceScenarios: 150, guidedWorkflows: 2, acceptedHistoricalLessons: generation.acceptedPortableLessons,
      acceptedPracticeDestinations: catalog.entries.filter(entry => entry.learning.available).map(entry => entry.learning.href),
      unknownSupport: 152,
      nativeRunnable: 0, nativeQualified: 0, completedSourceParents: 0,
      checks, cspObservation, pageErrors, remoteRequests,
      nativeAzureObserved: false, productionNode24Validated: false,
      accessibilityLimit: 'Actual keyboard, labels, focus, live/error/empty states and 320px reflow; not full WCAG/assistive-technology certification.'
    };
  } finally {
    await session.close();
  }
  report.browserCleanup = 'completed by awaited close() in finally';
  assert.equal(createHash('sha256').update(readFileSync(helperPath)).digest('hex'), PUBLISHED_HELPER_SHA256);
  assert.deepEqual(await fs.readFile(historicalPath), historicalProof, 'historical browser proof stays byte-for-byte unchanged');
  if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
    const reportPath = path.join(__dirname, '..', 'evidence',
      `browser-op-catalog-snapshot-refresh-76-01675ac8d423-${randomUUID()}.json`);
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  }
  console.log(`C006 actual browser: Edge ${browserVersion}; Playwright ${report.playwrightVersion}; ${checks.length} acceptance groups; close awaited; evidence ${process.env.CAPTURE_BROWSER_EVIDENCE === '1' ? 'deliberately captured' : 'unchanged'}.`);
});
