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
const generation = require('../../C005/evidence/op-catalog-snapshot-refresh-3565746a0882/generation.json');
const repo = path.resolve(__dirname, '..', '..', '..');
const helperPath = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const helperRequire = createRequire(helperPath);
const PUBLISHED_HELPER_COMMIT = '53c0c0d82cc1db6780a87ac2b1085734af6d5c60';
const PUBLISHED_HELPER_SHA256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const historicalPath = path.join(__dirname, '..', 'evidence', 'browser-observations.json');
const reportPath = path.join(__dirname, '..', 'evidence',
  `browser-op-catalog-snapshot-refresh-3565746a0882-${randomUUID()}.json`);

async function previousReport() {
  return fs.readFile(historicalPath).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
}

function signedEdge() {
  const executable = path.join(process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe');
  const shell = path.join(process.env.ProgramFiles, 'PowerShell', '7', 'pwsh.exe');
  const command = `$ErrorActionPreference='Stop'; $p='${executable.replaceAll("'", "''")}'; $s=Get-AuthenticodeSignature -FilePath $p; `
    + '[ordered]@{path=$p;version=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion;'
    + 'status=[string]$s.Status;subject=$s.SignerCertificate.Subject;thumbprint=$s.SignerCertificate.Thumbprint}|ConvertTo-Json -Compress';
  return JSON.parse(execFileSync(shell, ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8', windowsHide: true, timeout: 20000
  }).trim());
}

test('real local learner composition, accepted lesson controls, errors, keyboard, reset and CSP', { timeout: 180000 }, async t => {
  assert.equal(sha256(readFileSync(helperPath)), PUBLISHED_HELPER_SHA256, 'Verify the only authorized helper before importing it.');
  const published = execFileSync('git', ['--no-pager', 'show', `${PUBLISHED_HELPER_COMMIT}:testing/browser/isolated.cjs`], {
    cwd: repo, encoding: 'utf8', timeout: 15000
  });
  assert.equal(readFileSync(helperPath, 'utf8').replaceAll('\r\n', '\n'), published.replaceAll('\r\n', '\n'));
  const { openIsolatedLesson } = require(helperPath);
  const lifecyclePath = path.join(path.dirname(helperPath), 'lifecycle.cjs');
  assert.equal(Object.hasOwn(require.cache, lifecyclePath), false);
  const previous = await previousReport();
  const signature = signedEdge();
  assert.equal(signature.status, 'Valid');
  assert.match(signature.subject, /Microsoft Corporation/);
  const playwrightVersion = helperRequire('playwright/package.json').version;
  assert.equal(playwrightVersion, '1.56.1');
  assert.match(signature.version, /^156\./);
  assert.match(process.version, /^v22\./);
  const session = await openIsolatedLesson('capability\\local-harness\\index.html');
  const { page, browserVersion } = session;
  const children = new Set();
  page.context().on('page', child => children.add(child));
  const pageErrors = [];
  const remoteRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => { if (/^https?:/i.test(request.url())) remoteRequests.push(request.url()); });
  const checks = [];
  let report;
  let lessonObservation;
  let cspObservation;
  const practiceLinks = [];
  async function check(name, run) {
    await t.test(name, async () => {
      await run();
      checks.push({ name, passed: true });
    });
  }
  async function ready() {
    await page.waitForFunction(() => !document.getElementById('catalog-status').textContent.startsWith('Validating'));
  }
  async function actualIds(selector = '#matching-entries > article') {
    return page.locator(selector).evaluateAll(nodes => nodes.map(node => node.dataset.entryId));
  }
  async function query(text) {
    await page.locator('#catalog-query').fill(text);
    await ready();
  }
  async function choose(id, value) {
    const control = page.locator(`#${id}`);
    const values = await control.locator('option').evaluateAll(nodes => nodes.map(node => node.value));
    const index = values.indexOf(value);
    assert.ok(index >= 0);
    await control.focus();
    await page.keyboard.press('Home');
    for (let step = 0; step < index; step++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await ready();
    assert.equal(await control.inputValue(), value);
  }
  async function reset() {
    await page.locator('#reset-catalog').focus();
    await page.keyboard.press('Enter');
    await ready();
    await page.waitForFunction(() => document.getElementById('catalog-query').value === ''
      && document.querySelectorAll('#matching-entries > article').length === 152);
  }
  async function restore() {
    assert.equal(await page.evaluate(() => CatalogFlow.mount(C005Catalog, C003Matrix, document).ready), true);
    await reset();
  }
  async function open(id) {
    await page.locator(`#prepare-${id}`).focus();
    await page.keyboard.press('Enter');
    await ready();
    await page.waitForFunction(id => !document.getElementById('preparation').hidden
      && document.getElementById('preparation-heading').textContent.startsWith(`${id} — `), id);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'preparation-heading');
  }
  try {
    assert.equal(browserVersion, signature.version);
    await page.reload({ waitUntil: 'load' });
    await ready();
    await check('all 152 original IDs, titles and objectives retain order and historical/native/parent distinctions', async () => {
      assert.deepEqual(await actualIds(), catalog.entries.map(entry => entry.id));
      const observed = await page.locator('#matching-entries > article').evaluateAll(nodes => nodes.map(node => ({
        title: node.querySelector('h3').textContent, objective: node.querySelector('.objective').textContent,
        risk: node.querySelector('.risk-status').textContent, native: node.querySelector('.native-status').textContent,
        parent: node.querySelector('.parent-status').textContent
      })));
      observed.forEach((value, index) => {
        const entry = catalog.entries[index];
        assert.equal(value.title, `${entry.id} — ${entry.title}`);
        assert.equal(value.objective, entry.objective);
        assert.match(value.risk, /UNCLASSIFIED/);
        assert.match(value.native, /runnable: false; qualified: false/);
        assert.match(value.parent, /incomplete; completed: false/);
      });
      const pin = await page.locator('#snapshot-body').textContent();
      for (const value of [catalog.source.commit, catalog.acceptanceSnapshot.commitTimeUtc,
        catalog.acceptanceSnapshot.ledgerUpdatedAtUtc]) assert.ok(pin.includes(value));
      assert.match(pin, /Historical snapshot, not live availability/);
      assert.equal(await page.locator('#catalog-error').isVisible(), false);
      assert.equal(await page.locator('#preparation').isVisible(), false);
    });
    await check('all twenty accepted lessons pass through real readiness controls, keyboard preparation and original practice links', async () => {
      await choose('readiness-filter', 'portable-available');
      assert.deepEqual(await actualIds(), generation.acceptedPortableIds);
      assert.equal(await page.locator('#matching-entries > article').count(), 20);
      for (const id of generation.acceptedPortableIds) {
        await open(id);
        const entry = catalog.entries.find(candidate => candidate.id === id);
        assert.equal(await page.locator('#preparation-body').getAttribute('data-learning-mode'), 'synthetic-learning');
        const href = await page.locator('.lesson-link').getAttribute('href');
        assert.equal(href, entry.learning.href);
        assert.match(await page.locator('#preparation-body .native-status').textContent(), /runnable: false; qualified: false/);
        assert.equal(await page.locator('#preparation-body .parent-status').textContent(),
          `Source parent ${entry.parentId}: ${entry.parent.status}; completed: ${entry.parent.completed}. ${entry.parent.reason}`);
        practiceLinks.push({ id, href });
        await page.locator('#back-results').focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('#preparation').isVisible(), false);
        assert.equal(await page.evaluate(() => document.activeElement.id), `prepare-${id}`);
      }
      assert.deepEqual(practiceLinks, catalog.entries.filter(entry => entry.learning.available)
        .map(entry => ({ id: entry.id, href: entry.learning.href })));
      await reset();
    });
    await check('keyboard skip, query plus three AND filters, exact preparation and focus form one continuous journey', async () => {
      await page.reload({ waitUntil: 'load' });
      await ready();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
      assert.notEqual(await page.locator('.skip-link').evaluate(node => getComputedStyle(node).outlineStyle), 'none');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'catalog-query');
      await query('  BLUE-GREEN  ');
      await choose('host-filter', 'aks');
      await choose('risk-filter', 'unclassified');
      await choose('readiness-filter', 'portable-available');
      assert.deepEqual(await actualIds(), ['S001']);
      assert.deepEqual(await actualIds('#excluded-entries > article'), []);
      assert.match(await page.locator('#S001 .host-status').textContent(), /Unknown target support for AKS/);
      await open('S001');
      const text = await page.locator('#preparation-body').textContent();
      for (const value of [catalog.entries[0].objective, catalog.entries[0].implementation, catalog.entries[0].acceptance]) {
        assert.ok(text.includes(value));
      }
      assert.match(text, /also inherits BASE/);
      for (const key of ['dependencyRules', 'operatingLimits', 'sharedDefinitionOfDone', 'acceptanceAndEvidence']) {
        assert.equal(await page.locator(`[data-source-section="${key}"] pre`).textContent(), catalog.common[key].text);
      }
      assert.notEqual(await page.locator('#preparation-heading').evaluate(node => getComputedStyle(node).outlineStyle), 'none');
      await page.locator('[data-source-section="operatingLimits"] summary').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('[data-source-section="operatingLimits"] pre').isVisible(), true);
      assert.equal(await page.locator('.lesson-link').getAttribute('href'), catalog.entries[0].learning.href);
      assert.equal(await page.locator('.lesson-link').getAttribute('target'), '_blank');
    });
    await check('open the accepted S001 lesson, conduct its safe and unsafe controls, then return to the same preparation/results', async () => {
      const popup = page.waitForEvent('popup');
      await page.locator('.lesson-link').focus();
      await page.keyboard.press('Enter');
      const lesson = await popup;
      children.add(lesson);
      lesson.on('pageerror', error => pageErrors.push(error.message));
      lesson.on('request', request => { if (/^https?:/i.test(request.url())) remoteRequests.push(request.url()); });
      await lesson.waitForLoadState('load');
      assert.ok(lesson.url().endsWith('/learning/S001/index.html'));
      assert.match(await lesson.locator('.banner').textContent(), /synthetic data - not a live Azure result/);
      assert.equal(await lesson.locator('#verdict').getAttribute('data-verdict'), 'NOT_RUN');
      const actions = [];
      for (const id of ['warm', 'handoff', 'drain', 'elapse', 'retire']) {
        await lesson.locator(`#${id}`).focus();
        await lesson.keyboard.press('Enter');
        actions.push({ control: id, verdict: await lesson.locator('#verdict').getAttribute('data-verdict'),
          v1: await lesson.locator('#v1-state').textContent(), admission: await lesson.locator('#admission-target').textContent() });
      }
      assert.equal(await lesson.locator('#verdict').getAttribute('data-verdict'), 'PASS');
      assert.equal(await lesson.locator('#v1-state').textContent(), 'RETIRED');
      assert.equal(await lesson.locator('#admission-target').textContent(), 'v2');
      assert.ok(await lesson.locator('#assertions tr').count() > 0);
      assert.equal(await lesson.locator('#assertions tr[data-result="fail"], #assertions tr[data-result="unknown"]').count(), 0);
      assert.match(await lesson.locator('#sample-count').textContent(), /Attempted: 1 · proven successful: 1 · interrupted: 0/);
      const safeResult = {
        verdict: await lesson.locator('#verdict').textContent(), impact: await lesson.locator('#user-impact').textContent(),
        samples: await lesson.locator('#sample-count').textContent(), cleanup: await lesson.locator('#cleanup').textContent(),
        traceSteps: await lesson.locator('#trace > li').count()
      };
      await lesson.locator('#reset').focus();
      await lesson.keyboard.press('Enter');
      assert.equal(await lesson.locator('#verdict').getAttribute('data-verdict'), 'NOT_RUN');
      await lesson.locator('#handoff').focus();
      await lesson.keyboard.press('Enter');
      assert.equal(await lesson.locator('#verdict').getAttribute('data-verdict'), 'FAIL');
      assert.equal(await lesson.locator('#admission-target').textContent(), 'v1');
      lessonObservation = { originalHref: catalog.entries[0].learning.href, actions, safeResult,
        unsafeVerdict: await lesson.locator('#verdict').textContent(), unsafeReason: await lesson.locator('#reason').textContent(),
        nativeAzureResult: false };
      await lesson.close();
      assert.equal(await page.locator('#preparation').isVisible(), true);
      assert.equal(await page.locator('#catalog-query').inputValue(), '  BLUE-GREEN  ');
      await page.locator('#back-results').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#preparation').isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'prepare-S001');
      assert.deepEqual(await actualIds(), ['S001']);
      assert.equal(await page.locator('#host-filter').inputValue(), 'aks');
      assert.equal(await page.locator('#risk-filter').inputValue(), 'unclassified');
      assert.equal(await page.locator('#readiness-filter').inputValue(), 'portable-available');
    });
    await check('no-result, literal query, classified risk and native readiness states clear old preparation and reset with focus', async () => {
      await open('S001');
      await query('op-catalog-definitely-absent');
      assert.deepEqual(await actualIds(), []);
      assert.equal(await page.locator('#preparation-body').textContent(), '');
      assert.equal(await page.locator('#catalog-empty').isVisible(), true);
      assert.equal(await page.locator('#catalog-error').isVisible(), false);
      await query('<script>literal.*</script>');
      assert.ok((await page.locator('#catalog-status').textContent()).includes('<script>literal.*</script>'));
      assert.equal(await page.locator('#catalog-results script').count(), 0);
      await reset();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'catalog-query');
      await choose('host-filter', 'aks');
      await choose('risk-filter', 'low');
      assert.deepEqual(await actualIds(), []);
      assert.deepEqual(await actualIds('#excluded-entries > article'), []);
      await reset();
      await choose('readiness-filter', 'native-runnable');
      assert.deepEqual(await actualIds(), []);
      assert.equal(await page.locator('#catalog-error').isVisible(), false);
      await reset();
      for (const id of ['host-filter', 'risk-filter', 'readiness-filter']) assert.equal(await page.locator(`#${id}`).inputValue(), 'all');
    });
    await check('host-conflict preparation preserves the original accepted lesson and exact C007 reason', async () => {
      await query(catalog.entries[1].title);
      await choose('host-filter', 'aks');
      await choose('readiness-filter', 'portable-available');
      assert.deepEqual(await actualIds(), []);
      assert.deepEqual(await actualIds('#excluded-entries > article'), ['S002']);
      assert.match(await page.locator('#S002 .host-status').textContent(), /P001/);
      await open('S002');
      assert.equal(await page.locator('.lesson-link').getAttribute('href'), catalog.entries[1].learning.href);
      assert.match(await page.locator('#preparation-body .host-status').textContent(), /Incompatible direct host prerequisite/);
      assert.match(await page.locator('#preparation-body .native-status').textContent(), /runnable: false; qualified: false/);
      await reset();
    });
    await check('unavailable lessons and workflow CONTAINER/BASE distinctions retain exact preparation and all unapproved limits', async () => {
      await open('S018');
      assert.equal(await page.locator('.lesson-link').count(), 0);
      assert.equal(await page.locator('#preparation-body').getAttribute('data-learning-mode'), 'unavailable-learning');
      await reset();
      await query('getProfile');
      await choose('host-filter', 'app-service');
      assert.deepEqual(await actualIds('#excluded-entries > article'), ['W002']);
      await open('W002');
      assert.equal(await page.locator('#preparation-body').getAttribute('data-learning-mode'), 'unsupported-learning');
      assert.equal(await page.locator('.lesson-link').count(), 0);
      const text = await page.locator('#preparation-body').textContent();
      assert.ok(text.includes(catalog.entries[151].prerequisites.additional));
      assert.match(text, /no D-S BASE rule is added/);
      for (const key of ['liveAzureExecutionApproved', 'iacGenerationApproved', 'scaffoldApproved',
        'deploymentApproved', 'identityRegistrationApproved', 'expenditureApproved']) {
        assert.ok(text.includes(`${key}false`), key);
      }
      assert.match(text, /Unapproved — no value supplied; not a default/);
      assert.match(text, /Pricing is unknown/);
      assert.match(text, /cloud cleanup is unobserved/);
      assert.equal(await page.locator('[data-source-section="dependencyRules"] pre').textContent(), catalog.common.dependencyRules.text);
    });
    await check('320-pixel reflow contains expanded exact prerequisites, long source metadata and keyboard controls', async () => {
      await page.locator('[data-source-section="dependencyRules"] summary').focus();
      await page.keyboard.press('Enter');
      await page.setViewportSize({ width: 320, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.evaluate(() => document.body.scrollWidth <= innerWidth), true);
      for (const id of ['catalog-query', 'host-filter', 'risk-filter', 'readiness-filter', 'back-results']) {
        assert.equal(await page.locator(`#${id}`).isVisible(), true);
      }
      await page.setViewportSize({ width: 1280, height: 900 });
      await reset();
    });
    await check('invalid catalog/matrix replacements immediately remove all claims and reset cannot restore old data', async () => {
      for (const kind of ['missing', 'version', 'sparse', 'native-promotion', 'matrix', 'spend']) {
        await open('S001');
        const outcome = await page.evaluate(async kind => {
          let data = structuredClone(C005Catalog);
          let authority = structuredClone(C003Matrix);
          if (kind === 'missing') data = undefined;
          if (kind === 'version') data.schemaVersion = '2.0.0';
          if (kind === 'sparse') delete data.entries[0];
          if (kind === 'native-promotion') data.entries[0].native.runnable = true;
          if (kind === 'matrix') authority = undefined;
          if (kind === 'spend') authority.permissions.expenditureApproved = true;
          const controller = CatalogFlow.mount(data, authority, document);
          const immediatelyCleared = document.getElementById('preparation-body').textContent === ''
            && document.querySelectorAll('#matching-entries > article').length === 0;
          return { immediatelyCleared, valid: await controller.ready };
        }, kind);
        assert.equal(outcome.immediatelyCleared, true);
        assert.equal(outcome.valid, false);
        assert.equal(await page.locator('#catalog-error').isVisible(), true);
        assert.equal(await page.locator('#catalog-empty').isVisible(), false);
        assert.equal(await page.locator('#snapshot-body a, #preparation-body a').count(), 0);
        assert.deepEqual(await actualIds(), []);
        await page.locator('#reset-catalog').focus();
        await page.keyboard.press('Enter');
        await ready();
        assert.equal(await page.locator('#catalog-error').isVisible(), true);
        assert.deepEqual(await actualIds(), []);
        await restore();
      }
    });
    await check('invalid selection and obsolete asynchronous preparation cannot repopulate stale results', async () => {
      assert.equal(await page.evaluate(async () => {
        const controller = CatalogFlow.mount(C005Catalog, C003Matrix, document);
        await controller.ready;
        return controller.open('S151');
      }), false);
      assert.equal(await page.locator('#catalog-error').isVisible(), true);
      assert.deepEqual(await actualIds(), []);
      await restore();
      const outcomes = await page.evaluate(async () => {
        const controller = CatalogFlow.mount(C005Catalog, C003Matrix, document);
        await controller.ready;
        return Promise.all([controller.open('S001'), controller.reset()]);
      });
      assert.deepEqual(outcomes, [false, true]);
      assert.equal(await page.locator('#preparation').isVisible(), false);
      assert.equal(await page.locator('#matching-entries > article').count(), 152);
    });
    await check('source title/objective markup renders literally in results and preparation without creating elements', async () => {
      const literal = '<img src="https://invalid.example/catalog" onerror="globalThis.CatalogUnexpectedExecution=true"> & <script>literal.*</script>';
      assert.equal(await page.evaluate(async literal => {
        const fixture = structuredClone(C005Catalog);
        fixture.entries[0].title = literal;
        fixture.entries[0].objective = literal;
        const controller = CatalogFlow.mount(fixture, C003Matrix, document);
        await controller.ready;
        const query = document.getElementById('catalog-query');
        query.value = '<script>literal.*</script>';
        await controller.refresh();
        return controller.open('S001');
      }, literal), true);
      assert.equal(await page.locator('#S001 h3').textContent(), `S001 — ${literal}`);
      assert.equal(await page.locator('.preparation-objective').textContent(), literal);
      assert.equal(await page.locator('#catalog-results img, #catalog-results script, #preparation img, #preparation script').count(), 0);
      assert.equal(await page.evaluate(() => globalThis.CatalogUnexpectedExecution), undefined);
      await restore();
    });
    await check('actual CSP denies inline code and connection probes; the learner flow makes no remote requests', async () => {
      assert.deepEqual(remoteRequests, []);
      assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => /^https?:/.test(entry.name)).length), 0);
      cspObservation = await page.evaluate(async () => {
        const violations = [];
        const listener = event => violations.push(event.effectiveDirective);
        document.addEventListener('securitypolicyviolation', listener);
        const script = document.createElement('script');
        script.textContent = 'globalThis.CatalogInlineExecuted = true;';
        document.head.append(script);
        let connectionBlocked = false;
        try { await fetch('https://invalid.example/catalog-csp-probe', { mode: 'no-cors' }); }
        catch { connectionBlocked = true; }
        await new Promise(resolve => setTimeout(resolve, 75));
        script.remove();
        document.removeEventListener('securitypolicyviolation', listener);
        return { violations, connectionBlocked, inlineExecuted: globalThis.CatalogInlineExecuted === true };
      });
      assert.equal(cspObservation.inlineExecuted, false);
      assert.equal(cspObservation.connectionBlocked, true);
      assert.ok(cspObservation.violations.includes('script-src-elem'));
      assert.ok(cspObservation.violations.includes('connect-src'));
      assert.deepEqual(remoteRequests, []);
      assert.deepEqual(pageErrors, []);
    });
    assert.equal(checks.length, 12);
    report = {
      operation: 'OP-CATALOG-SNAPSHOT-REFRESH', status: 'passed', observedAtUtc: new Date().toISOString(),
      mode: 'actual-isolated-headless', mockedBrowser: false, browserVersion, signature, playwrightVersion,
      nodeVersion: process.version, productionNode24Validated: false,
      helper: 'testing\\browser\\isolated.cjs', helperApi: 'openIsolatedLesson',
      helperPublishedCommit: PUBLISHED_HELPER_COMMIT, helperSourceSha256: PUBLISHED_HELPER_SHA256,
      helperPublishedSourceMatches: true, experimentalLifecycleDependencyImported: false,
      foregroundLeaseUsed: false, unsafeLaunchFlagsUsed: false,
      entry: 'capability\\local-harness\\index.html',
      sourcePin: catalog.source.commit, historicalAvailabilityNotLive: true, originalDomEntryCount: 152,
      generationSha256: generation.data.sha256, acceptedPracticeDestinations: practiceLinks,
      historicalPortableLessons: practiceLinks.length, unknownSupport: 152, nativeRunnable: 0,
      combinedSelection: { query: '  BLUE-GREEN  ', host: 'aks', risk: 'unclassified', readiness: 'portable-available', entryId: 'S001' },
      exactPreparationSectionsSha256: Object.fromEntries(['dependencyRules', 'operatingLimits', 'sharedDefinitionOfDone', 'acceptanceAndEvidence']
        .map(key => [key, sha256(catalog.common[key].text)])),
      lessonObservation, checks, cspObservation, pageErrors, remoteRequests,
      nativeAzureObserved: false, nativeQualified: false, sourceParentsCompleted: 0,
      maximumLiveAzureRuns: 0, authorizedCloudSpend: 0, kanoCredit: 0, parentAcceptanceClaimed: false,
      accessibilityLimit: 'Observed labels, keyboard, focus, live/error/empty states, reset and 320px reflow; not full WCAG/assistive-technology certification.'
    };
  } finally {
    const closeErrors = [];
    try {
      const allChildren = new Set([...children, ...page.context().pages()]);
      for (const child of allChildren) {
        if (child === page || child.isClosed()) continue;
        try { await child.close(); } catch (error) { closeErrors.push(error); }
      }
    } finally {
      await session.close();
    }
    if (closeErrors.length) throw new AggregateError(closeErrors, 'All child page close attempts were awaited.');
  }
  report.browserCleanup = 'All child pages and helper close() awaited in finally.';
  assert.equal(sha256(readFileSync(helperPath)), PUBLISHED_HELPER_SHA256);
  assert.equal(Object.hasOwn(require.cache, lifecyclePath), false);
  assert.deepEqual(await previousReport(), previous, 'historical browser proof stays byte-for-byte unchanged');
  if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    console.log('Explicit CAPTURE_BROWSER_EVIDENCE=1: successful browser observation captured after awaited cleanup.');
  } else {
    assert.deepEqual(await previousReport(), previous, 'Ordinary browser tests preserve committed observations byte-for-byte.');
    console.log('Ordinary browser verification did not refresh or delete evidence.');
  }
  console.log(`Signed Edge ${browserVersion}; Playwright ${playwrightVersion}; ${checks.length} groups; original accepted lesson conducted; cleanup awaited.`);
});
