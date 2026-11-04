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
const catalogContract = require('../../C005/catalog-contract.js');
const matrix = require('../../C003/matrix-data.js');
const filterApi = require('../catalog-filters.js');
const generation = require('../../C005/evidence/op-catalog-snapshot-refresh-165-c8b3139f07aa/generation.json');
const helperPath = path.resolve(__dirname, '..', '..', '..', 'testing', 'browser', 'isolated.cjs');
const helperSourceSha256 = createHash('sha256').update(readFileSync(helperPath)).digest('hex');
const PUBLISHED_HELPER_COMMIT = '53c0c0d82cc1db6780a87ac2b1085734af6d5c60';
const PUBLISHED_HELPER_SHA256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const TRAINING_BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
assert.equal(helperSourceSha256, PUBLISHED_HELPER_SHA256, 'Verify the published helper before import.');
assert.equal(readFileSync(helperPath, 'utf8').replaceAll('\r\n', '\n'),
  execFileSync('git', ['--no-pager', 'show', `${PUBLISHED_HELPER_COMMIT}:testing/browser/isolated.cjs`],
    { encoding: 'utf8' }).replaceAll('\r\n', '\n'));
const { openIsolatedLesson } = require(helperPath);
const helperRequire = createRequire(helperPath);
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

async function existingBytes(filename) {
  try { return await fs.readFile(filename); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

test('C007 actual isolated headless DOM, keyboard, filters and CSP acceptance', { timeout: 180000 }, async t => {
  const historicalPath = path.join(__dirname, '..', 'evidence', 'browser-observations.json');
  const previousProof = await existingBytes(historicalPath);
  const reportPath = path.join(__dirname, '..', 'evidence',
    `browser-op-catalog-snapshot-refresh-165-c8b3139f07aa-${randomUUID()}.json`);
  assert.equal(Object.hasOwn(require.cache, path.join(path.dirname(helperPath), 'lifecycle.cjs')), false);
  const session = await openIsolatedLesson('capability\\C007\\index.html');
  const { page, browserVersion } = session;
  const checks = [];
  const pageErrors = [];
  const remoteRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => { if (/^https?:/i.test(request.url())) remoteRequests.push(request.url()); });
  const entries = page.locator('#catalog-entries .catalog-entry');
  const actualIds = () => entries.evaluateAll(nodes => nodes.map(node => node.dataset.entryId));
  async function check(name, run) {
    await t.test(name, async () => { await run(); checks.push({ name, passed: true }); });
  }
  async function choose(id, value) {
    const control = page.locator(`#${id}`);
    const values = await control.locator('option').evaluateAll(nodes => nodes.map(node => node.value));
    const index = values.indexOf(value);
    assert.ok(index >= 0, `${id} has option ${value}`);
    await control.focus();
    await page.keyboard.press('Home');
    for (let step = 0; step < index; step++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    assert.equal(await control.inputValue(), value);
  }
  async function reset(key = 'Enter') {
    await page.locator('#reset-filters').focus();
    await page.keyboard.press(key);
    for (const id of ['host-filter', 'risk-filter', 'readiness-filter']) {
      assert.equal(await page.locator(`#${id}`).inputValue(), 'all');
    }
    assert.equal(await page.evaluate(() => document.activeElement.id), 'host-filter');
  }
  async function restore() {
    assert.equal(await page.evaluate(() => C007Page.render(C005Catalog, C003Matrix, document)), true);
    await reset();
    assert.equal(await entries.count(), 152);
    assert.equal(await page.locator('#catalog-error').isVisible(), false);
  }
  let report;
  let cspObservation;
  let acceptedPracticeNavigation;
  try {
    await page.reload({ waitUntil: 'load' });
    await check('default actual DOM preserves all 152 original IDs, titles, objectives and 302 pinned source links', async () => {
      assert.equal(await entries.count(), 152);
      assert.deepEqual(await actualIds(), catalog.entries.map(entry => entry.id));
      assert.deepEqual(await entries.locator('h3').allTextContents(), catalog.entries.map(entry => `${entry.id} — ${entry.title}`));
      assert.deepEqual(await page.locator('.objective').allTextContents(), catalog.entries.map(entry => entry.objective));
      assert.deepEqual(await page.locator('.source-link').evaluateAll(nodes => nodes.map(node => node.href)),
        catalog.entries.flatMap(entry => entry.sourceReferences.map(reference => catalogContract.sourceHref(catalog, reference))));
      assert.equal(await page.locator('.source-link').count(), 302);
      assert.equal(await page.locator('#catalog-empty').isVisible(), false);
      assert.equal(await page.locator('#catalog-error').isVisible(), false);
    });
    await check('historical lesson availability, native false, parent false and unchanged permission denials are separate', async () => {
      const summary = await page.locator('#snapshot-summary').innerText();
      for (const value of [catalog.source.commit, catalog.acceptanceSnapshot.commitTimeUtc,
        catalog.acceptanceSnapshot.ledgerUpdatedAtUtc]) assert.ok(summary.includes(value));
      assert.match(summary, /Historical snapshot, not live availability/);
      assert.equal(await page.locator('.lesson-link').count(), generation.acceptedPortableLessons);
      assert.deepEqual(await page.locator('.lesson-link').evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))),
        catalog.entries.filter(entry => entry.learning.available).map(entry => entry.learning.href));
      assert.equal(await page.locator('#W001 .lesson-link, #W002 .lesson-link').count(), 0);
      assert.equal(await page.locator('#S103 .lesson-link').getAttribute('href'), '../../learning/S103/index.html');
      assert.equal(await page.locator('#S150 .lesson-link').getAttribute('href'), '../../learning/S150/index.html');
      assert.ok((await page.locator('.native-status').allTextContents()).every(text => /runnable: false; qualified: false/.test(text)));
      assert.ok((await page.locator('.parent-status').allTextContents()).every(text => /incomplete; completed: false/.test(text)));
      assert.deepEqual(JSON.parse(await page.locator('#permission-values').innerText()), matrix.permissions);
      assert.equal(await page.locator('button').count(), 1);
      assert.equal(await page.locator('button:not([type="reset"]), iframe, input, [onclick]').count(), 0);
      assert.match(await page.locator('header').innerText(), /Node\.js 22.*production Node\.js 24 remains unvalidated/s);
    });
    await check('actual skip, Tab sequence, accessible names and keyboard-visible focus operate native controls', async () => {
      await page.reload({ waitUntil: 'load' });
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
      assert.notEqual(await page.locator('.skip-link').evaluate(node => getComputedStyle(node).outlineStyle), 'none');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'catalog');
      for (const [label, id] of [['Host under test', 'host-filter'], ['Risk classification', 'risk-filter'],
        ['Readiness / availability', 'readiness-filter']]) {
        assert.equal(await page.getByLabel(label, { exact: true }).getAttribute('id'), id);
      }
      await page.locator('#host-filter').focus();
      for (const id of ['risk-filter', 'readiness-filter', 'reset-filters']) {
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), id);
      }
      assert.notEqual(await page.locator('#reset-filters').evaluate(node => getComputedStyle(node).outlineStyle), 'none');
      assert.equal(await page.locator('#catalog-count').getAttribute('aria-live'), 'polite');
      assert.equal(await page.locator('#catalog-error').getAttribute('role'), 'alert');
      await page.keyboard.press('Space');
      assert.equal(await entries.count(), 152);
    });
    await check('App Service excludes direct conflicts with original unavailability/native/parent reasons and unchanged C003 rows', async () => {
      await choose('host-filter', 'app-service');
      const expected = filterApi.filterCatalog(catalog, matrix, { host: 'app-service' });
      assert.deepEqual(await actualIds(), expected.items.map(item => item.entry.id));
      assert.deepEqual(await page.locator('.incompatible-entry').evaluateAll(nodes => nodes.map(node => node.dataset.entryId)),
        expected.incompatible.map(item => item.entry.id));
      assert.equal(await entries.locator('[data-host-status="documented-supported"]').count(), 0);
      assert.ok((await entries.evaluateAll(nodes => nodes.map(node => node.dataset.hostStatus))).every(status => status === 'unknown'));
      assert.match(await page.locator('#W002 .incompatible-reason').innerText(), /CONTAINER.*P002 OR P003/);
      assert.equal(await page.locator('#W002 .learning-status').count(), 1);
      assert.ok((await page.locator('#W002 .learning-status').innerText()).includes(catalog.entries[151].learning.reason));
      assert.match(await page.locator('#W002 .native-status').innerText(), /runnable: false; qualified: false/);
      assert.match(await page.locator('#W002 .parent-status').innerText(), /incomplete; completed: false/);
      assert.match(await page.locator('#S047 .incompatible-reason').innerText(), /P003.*AKS/);
      assert.deepEqual(await page.locator('.matrix-row').evaluateAll(nodes => nodes.map(node => node.dataset.matrixId)),
        expected.matrixRows.map(row => row.id));
      assert.deepEqual(await page.locator('.matrix-reason').allTextContents(), expected.matrixRows.map(row => row.reason));
      assert.equal(await page.locator('.matrix-row[data-status="unsupported"]').count(), 3);
      assert.deepEqual(await page.locator('.matrix-source-link').evaluateAll(nodes => nodes.map(node => node.href)),
        expected.matrixRows.flatMap(row => row.sourceIds.map(id => matrix.sources.find(source => source.id === id).url)));
    });
    await check('CONTAINER alternatives retain W002 for either ACA or AKS, and unselected host preserves every unknown', async () => {
      for (const host of ['container-apps', 'aks']) {
        await choose('host-filter', host);
        assert.equal(await page.locator('#catalog-entries #W002').count(), 1);
        assert.match(await page.locator('#W002 .host-status').innerText(), /Unknown target support/);
      }
      assert.match(await page.locator('#incompatible-entries #S002 .learning-status').innerText(), /Portable lesson accepted/);
      assert.equal(await page.locator('#incompatible-entries #S002 .lesson-link').getAttribute('href'),
        catalog.entries[1].learning.href);
      await choose('host-filter', 'app-service');
      assert.match(await page.locator('#S026 .host-status').innerText(), /IMAGEHOST.*container mode/i);
      await choose('host-filter', 'unselected');
      assert.equal(await entries.count(), 152);
      assert.equal(await page.locator('.incompatible-entry').count(), 0);
      assert.ok((await entries.evaluateAll(nodes => nodes.map(node => node.dataset.hostStatus))).every(status => status === 'unknown'));
      await reset();
    });
    await check('actual risk controls preserve UNCLASSIFIED and produce honest empty assessed/low/medium/high views', async () => {
      for (const risk of filterApi.RISKS) {
        await choose('risk-filter', risk);
        const count = ['all', 'unclassified'].includes(risk) ? 152 : 0;
        assert.equal(await entries.count(), count);
        assert.equal(await page.locator('#catalog-error').isVisible(), false);
        assert.equal(await page.locator('#catalog-empty').isVisible(), count === 0);
        if (count) assert.ok((await page.locator('.risk-status').allTextContents()).every(text => /Risk: UNCLASSIFIED/.test(text)));
        else assert.match(await page.locator('#catalog-empty').innerText(), /All source risks are UNCLASSIFIED/);
      }
      await reset('Space');
    });
    await check('keyboard readiness choices distinguish 150 accepted, two unavailable workflows and zero native/parent results', async () => {
      for (const [readiness, count] of [['portable-available', generation.acceptedPortableLessons],
        ['portable-unavailable', catalog.entries.length - generation.acceptedPortableLessons],
        ['native-unavailable', 152], ['native-runnable', 0], ['native-qualified', 0], ['parent-complete', 0]]) {
        await choose('readiness-filter', readiness);
        assert.equal(await entries.count(), count);
        assert.equal(await page.locator('#catalog-error').isVisible(), false);
        if (readiness === 'portable-unavailable') {
          assert.equal(await page.locator('.lesson-link').count(), 0);
          for (const id of ['W001', 'W002']) {
            assert.equal(await page.locator(`#${id} .learning-status`).innerText(),
              `Portable lesson unavailable: ${catalog.entries.find(entry => entry.id === id).learning.reason}`, id);
          }
        }
      }
      await reset();
    });
    await check('combined filters intersect in either selection order and real Tab/Enter reset restores every default', async () => {
      await choose('host-filter', 'aks');
      await choose('risk-filter', 'unclassified');
      await choose('readiness-filter', 'portable-available');
      const firstOrder = await actualIds();
      const expected = filterApi.filterCatalog(catalog, matrix,
        { host: 'aks', risk: 'unclassified', readiness: 'portable-available' });
      assert.deepEqual(firstOrder, expected.items.map(item => item.entry.id));
      assert.deepEqual(await page.locator('.incompatible-entry').evaluateAll(nodes => nodes.map(node => node.dataset.entryId)),
        ['S002', 'S012', 'S014', 'S017', 'S024', 'S032', 'S033', 'S058', 'S096', 'S105',
          'S121', 'S122', 'S123', 'S124', 'S125', 'S126', 'S129', 'S130']);
      assert.equal(firstOrder.length + expected.incompatible.length, generation.acceptedPortableLessons);
      await reset();
      await choose('readiness-filter', 'portable-available');
      await choose('risk-filter', 'unclassified');
      await choose('host-filter', 'aks');
      assert.deepEqual(await actualIds(), firstOrder);
      await page.locator('#host-filter').focus();
      for (const id of ['risk-filter', 'readiness-filter', 'reset-filters']) {
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), id);
      }
      await page.keyboard.press('Enter');
      assert.equal(await entries.count(), 152);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'host-filter');
      assert.deepEqual(await actualIds(), catalog.entries.map(entry => entry.id));
    });
    await check('valid no-match state has a live zero count, no alert and keyboard recovery without hiding unknown risk', async () => {
      await choose('host-filter', 'functions');
      await choose('risk-filter', 'low');
      await choose('readiness-filter', 'portable-available');
      assert.equal(await entries.count(), 0);
      assert.equal(await page.locator('.incompatible-entry').count(), 0);
      assert.match(await page.locator('#catalog-count').innerText(), /^0 of 152/);
      assert.equal(await page.locator('#catalog-error').isVisible(), false);
      assert.match(await page.locator('#catalog-empty').innerText(), /UNCLASSIFIED/);
      assert.ok((await page.locator('#snapshot-summary').innerText()).includes(catalog.source.commit));
      await reset();
    });
    await check('bad, absent, empty, promoted and wrong-version data clears stale DOM, provenance and permissions persistently', async () => {
      for (const kind of ['absent', 'empty', 'version', 'risk', 'native', 'parent', 'matrix', 'permission']) {
        const valid = await page.evaluate(kind => {
          const value = structuredClone(C005Catalog);
          const matrix = structuredClone(C003Matrix);
          if (kind === 'empty') value.entries = [];
          if (kind === 'version') value.schemaVersion = '2.0.0';
          if (kind === 'risk') value.entries[0].risk = 'low';
          if (kind === 'native') value.entries[0].native.qualified = true;
          if (kind === 'parent') value.entries[0].parent.completed = true;
          if (kind === 'permission') matrix.permissions.iacGenerationApproved = true;
          return C007Page.render(kind === 'absent' ? undefined : value, kind === 'matrix' ? undefined : matrix, document);
        }, kind);
        assert.equal(valid, false);
        assert.equal(await entries.count(), 0);
        assert.equal(await page.locator('.incompatible-entry, .matrix-row, .source-link, #snapshot-source a, #dependency-reference a').count(), 0);
        assert.equal(await page.locator('#permission-values').innerText(), 'No validated permissions.');
        assert.match(await page.locator('#snapshot-summary').innerText(), /No validated committed snapshot/);
        assert.match(await page.locator('#catalog-count').innerText(), /unavailable \/ unverified/);
        assert.equal(await page.locator('#catalog-error').isVisible(), true);
        await choose('risk-filter', 'unclassified');
        assert.equal(await entries.count(), 0);
        assert.equal(await page.locator('#catalog-error').isVisible(), true);
        await reset();
        assert.equal(await entries.count(), 0);
        assert.equal(await page.locator('#catalog-error').isVisible(), true);
        await restore();
      }
    });
    await check('invalid actual selection fails closed and keyboard reset recovers only the currently valid data', async () => {
      await page.evaluate(() => {
        const option = document.createElement('option');
        option.value = 'P0';
        option.textContent = 'Invalid risk fixture — priority is not risk';
        option.id = 'bad-option-fixture';
        document.getElementById('risk-filter').append(option);
      });
      await choose('risk-filter', 'P0');
      assert.equal(await entries.count(), 0);
      assert.match(await page.locator('#catalog-error').innerText(), /Invalid risk filter/);
      assert.equal(await page.locator('.matrix-row').count(), 0);
      await reset();
      assert.equal(await entries.count(), 152);
      await page.locator('#bad-option-fixture').evaluate(node => node.remove());
    });
    await check('original accepted portable link opens with Enter without implying live/native availability', async () => {
      await choose('readiness-filter', 'portable-available');
      assert.deepEqual(await page.locator('.lesson-link').evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))),
        catalog.entries.filter(entry => entry.learning.available).map(entry => entry.learning.href));
      await page.locator('#S001 .lesson-link').focus();
      await page.keyboard.press('Enter');
      await page.waitForURL(/\/learning\/S001\/index\.html$/);
      acceptedPracticeNavigation = { id: 'S001', loadedUrl: page.url(),
        trainingBanner: await page.locator('.banner').textContent() };
      assert.equal(acceptedPracticeNavigation.trainingBanner, TRAINING_BANNER);
      await page.goBack({ waitUntil: 'load' });
      await restore();
    });
    await check('source text is literal rather than injected markup in actual rendered results', async () => {
      const literal = '<img src="https://invalid.example/c007" onerror="globalThis.C007UnexpectedExecution=true">';
      assert.equal(await page.evaluate(literal => {
        const value = structuredClone(C005Catalog);
        value.entries[0].title = literal;
        return C007Page.render(value, C003Matrix, document);
      }, literal), true);
      assert.equal(await page.locator('#S001 h3').textContent(), `S001 — ${literal}`);
      assert.equal(await page.locator('#catalog-entries img, #catalog-entries script').count(), 0);
      assert.equal(await page.evaluate(() => globalThis.C007UnexpectedExecution), undefined);
      await restore();
    });
    await check('320-pixel layout, focus visibility and filter/reset controls remain usable without horizontal overflow', async () => {
      await page.setViewportSize({ width: 320, height: 800 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await choose('host-filter', 'container-apps');
      await choose('risk-filter', 'unclassified');
      await choose('readiness-filter', 'portable-available');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await reset('Space');
      assert.notEqual(await page.locator('#host-filter').evaluate(node => getComputedStyle(node).outlineStyle), 'none');
      await page.setViewportSize({ width: 1280, height: 900 });
    });
    await check('actual browser CSP blocks inline code and connection probes, with no application remote requests or page errors', async () => {
      assert.deepEqual(remoteRequests, []);
      assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => /^https?:/.test(entry.name)).length), 0);
      cspObservation = await page.evaluate(async () => {
        const violations = [];
        const listener = event => violations.push(event.effectiveDirective);
        document.addEventListener('securitypolicyviolation', listener);
        const script = document.createElement('script');
        script.textContent = 'globalThis.C007CspInlineExecuted = true;';
        document.head.append(script);
        let connectionBlocked = false;
        try { await fetch('https://invalid.example/c007-csp-probe', { mode: 'no-cors' }); }
        catch { connectionBlocked = true; }
        await new Promise(resolve => setTimeout(resolve, 50));
        script.remove();
        document.removeEventListener('securitypolicyviolation', listener);
        return { violations, connectionBlocked, inlineExecuted: globalThis.C007CspInlineExecuted === true };
      });
      assert.equal(cspObservation.inlineExecuted, false);
      assert.equal(cspObservation.connectionBlocked, true);
      assert.ok(cspObservation.violations.includes('script-src-elem'));
      assert.ok(cspObservation.violations.includes('connect-src'));
      assert.deepEqual(remoteRequests, []);
      assert.deepEqual(pageErrors, []);
      assert.equal(await entries.count(), 152);
    });
    assert.equal(checks.length, 15, 'all actual acceptance groups must pass before any proof capture');
    assert.equal(helperRequire('playwright/package.json').version, '1.56.1');
    assert.match(browserVersion, /^156\./);
    assert.match(process.version, /^v22\./);
    report = {
      schemaVersion: 1, cardId: 'C007',       operation: 'OP-CATALOG-SNAPSHOT-REFRESH-165', status: 'passed',
      observedAtUtc: new Date().toISOString(), mode: 'actual-isolated-headless',
      engine: 'Microsoft Edge (Chromium)', browserVersion,
      playwrightVersion: helperRequire('playwright/package.json').version, nodeVersion: process.version,
      helper: 'testing\\browser\\isolated.cjs', helperApi: 'openIsolatedLesson', helperSourceSha256,
      helperPublishedCommit: PUBLISHED_HELPER_COMMIT,
      lesson: 'capability\\C007\\index.html', actualDomAndKeyboard: true, mockedBrowser: false,
      unsafeLaunchFlagsUsed: false, integratedForegroundUsed: false, packageInstalls: 0,
      sourcePin: catalog.source.commit, sourceScenarios: 150, guidedWorkflows: 2,
      generationSha256: generation.data.sha256, historicalPortableLessons: generation.acceptedPortableLessons,
      acceptedPracticeDestinations: catalog.entries.filter(entry => entry.learning.available).map(entry => entry.learning.href),
      practiceNavigations: [acceptedPracticeNavigation], actualPracticeNavigationCount: 1,
      unavailablePracticeIdsChecked: ['W001', 'W002'],
      unknownSupport: 152, risk: 'UNCLASSIFIED', nativeRunnable: 0,
      nativeQualified: 0, completedSourceParents: 0, excludedAvailabilityReasons: true, permissions: matrix.permissions,
      checks, cspObservation, pageErrors, remoteRequests,
      productionNode24Validated: false, nativeAzureObserved: false,
      accessibilityLimit: 'Recorded labels, keyboard, visible focus, live/error/empty states, source links and 320-pixel reflow; not full WCAG/assistive-technology certification.'
    };
  } finally {
    await session.close();
  }
  report.browserCleanup = 'completed by awaited close() in finally';
  assert.equal(createHash('sha256').update(readFileSync(helperPath)).digest('hex'), PUBLISHED_HELPER_SHA256);
  assert.deepEqual(await existingBytes(historicalPath), previousProof, 'historical browser proof stays byte-for-byte unchanged');
  if (capture) {
    assert.equal(t.signal.aborted, false, 'A timed-out or cancelled suite cannot append a success observation.');
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  }
  console.log(`C007: Edge ${browserVersion}; Playwright ${report.playwrightVersion}; ${checks.length} actual acceptance groups; close awaited; proof ${capture ? 'deliberately captured' : 'preserved'}.`);
});
