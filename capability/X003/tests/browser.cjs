'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash, randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { root, digest } = require('./readonly.cjs');
const engine = require('../recommendation.js');
const catalog = require('../../C005/catalog-data.js');
const contract = require('../../C005/catalog-contract.js');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
const repository = path.resolve(root, '..', '..');
const helperPath = path.join(repository, 'testing', 'browser', 'isolated.cjs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const pageURL = pathToFileURL(path.join(root, 'index.html')).href;
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'";
const goalCases = [
  ['warm-handoff', 'S001'], ['effective-capacity', 'S011'], ['preserve-session', 'S031'],
  ['finish-admitted-work', 'S041'], ['version-contracts', 'S051'], ['abort-unready', 'S091'],
  ['verify-user-correctness', 'S147'], ['retire-without-dependencies', 'S150']
];

function signedEdge() {
  const executable = path.join(process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe');
  const command = `$ErrorActionPreference='Stop';$p='${executable.replaceAll("'", "''")}';`
    + '$s=Get-AuthenticodeSignature -FilePath $p;'
    + '[ordered]@{path=$p;version=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion;'
    + 'status=[string]$s.Status;subject=$s.SignerCertificate.Subject;thumbprint=$s.SignerCertificate.Thumbprint}|ConvertTo-Json -Compress';
  return JSON.parse(execFileSync('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
    { encoding: 'utf8', windowsHide: true, timeout: 20000 }).trim());
}

async function main() {
  const before = digest();
  const helperBytes = fs.readFileSync(helperPath);
  assert.equal(hash(helperBytes), manifest.browserHelperSha256, 'Verify exact published helper before import.');
  const canonicalHelper = execFileSync('git', ['--no-pager', 'show',
    `${manifest.browserHelperPublishedCommit}:testing/browser/isolated.cjs`], {
    cwd: repository, encoding: 'buffer', timeout: 15000
  });
  assert.deepEqual(Buffer.from(helperBytes.toString('utf8').replace(/\r\n/g, '\n')), canonicalHelper);
  const { openIsolatedLesson } = require(helperPath);
  const helperRequire = createRequire(helperPath);
  assert.equal(helperRequire('playwright/package.json').version, '1.56.1');
  assert.equal(process.version, 'v22.23.4');
  assert.equal(Object.hasOwn(require.cache, path.join(path.dirname(helperPath), 'lifecycle.cjs')), false);
  const signature = signedEdge();
  assert.equal(signature.status, 'Valid');
  assert.match(signature.subject, /Microsoft Corporation/);
  assert.match(signature.version, /^156\./);
  const session = await openIsolatedLesson('capability\\X003\\index.html');
  const { page, browserVersion } = session;
  const checks = [];
  const states = [];
  const practiceNavigations = [];
  const linkSnapshots = [];
  const returns = [];
  const children = new Set();
  const pageErrors = [];
  const remoteRequests = [];
  let failure;
  let cleanupCompleted = false;
  let cspObservation;
  let lessonObservation;
  let harnessObservation;
  let child;
  function observe(observedPage) {
    observedPage.on('pageerror', error => pageErrors.push(error.message));
    observedPage.on('request', request => {
      if (/^https?:/i.test(request.url())) remoteRequests.push(request.url());
    });
  }
  observe(page);
  page.context().on('page', opened => { children.add(opened); observe(opened); });
  const active = () => page.evaluate(() => document.activeElement.id || document.activeElement.className);
  const ready = async () => {
    await page.waitForFunction(() => !document.getElementById('goal-select').disabled);
    assert.equal(await page.title(), 'Choose a learning goal — X003');
  };
  async function state(name, observedPage = page) {
    states.push({ name, url: observedPage.url(), html: await observedPage.content() });
  }
  async function check(name, run) {
    try { await run(); checks.push({ name, passed: true }); }
    catch (error) {
      checks.push({ name, passed: false, code: error.code, message: error.message });
      try { await state(`failure-${checks.length}`); } catch {}
      try { if (child && !child.isClosed()) await state(`failure-${checks.length}-actual-child`, child); } catch {}
      throw error;
    }
  }
  async function reset() {
    await page.locator('#reset').focus();
    await page.keyboard.press('Enter');
  }
  async function choose(goalId) {
    const index = engine.GOALS.findIndex(goal => goal.id === goalId);
    assert.ok(index >= 0);
    await page.locator('#goal-select').focus();
    await page.keyboard.press('Home');
    for (let count = 0; count <= index; count++) await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#goal-select').inputValue(), goalId);
    await page.keyboard.press('Tab');
    assert.equal(await active(), 'recommend');
    await page.keyboard.press('Enter');
  }
  async function why() {
    await page.locator('#inspect-why').focus();
    await page.keyboard.press('Enter');
    assert.equal(await active(), 'why-heading');
    assert.equal(await page.locator('#why-detail').isVisible(), true);
    assert.equal(await page.locator('#inspect-why').getAttribute('aria-expanded'), 'true');
  }
  async function back() {
    const from = child.url();
    await child.close();
    child = null;
    await page.locator('#return-chooser').focus();
    await page.keyboard.press('Enter');
    assert.equal(await active(), 'goal-select');
    const returnedURL = new URL(page.url());
    assert.ok(['', '#goal-select'].includes(returnedURL.hash));
    returnedURL.hash = '';
    assert.equal(returnedURL.href, pageURL);
    returns.push({ from, ownedPopupClosedByDriver: true, keyboardControl: 'return-chooser',
      key: 'Enter', focus: 'goal-select', browserChromeKeyboardCloseClaimed: false });
    await ready();
  }
  async function open(id) {
    const popup = page.waitForEvent('popup');
    await page.locator(`#${id}`).focus();
    await page.keyboard.press('Enter');
    child = await popup;
    child.setDefaultTimeout(10000);
    await child.waitForLoadState('load');
    return child;
  }
  async function links(goalId, id) {
    const observed = await page.locator('a[href]').evaluateAll(nodes => nodes.map(node => ({
      id: node.id || node.className, href: node.getAttribute('href'), target: node.getAttribute('target')
    })));
    const entry = catalog.entries.find(item => item.id === id);
    const fixed = [
      ['skip-link', '#goal-select'], ['harness-link', '../local-harness/index.html'],
      ['catalog-link', '../C005/index.html'], ['source-row-link', contract.sourceHref(catalog, entry.sourceReferences[0])],
      ['practice-link', entry.learning.href],
      ['scope-link', `https://github.com/chadhage/app-scaling-strategies/blob/${catalog.source.commit}/README.md#scope`],
      ['disclaimer-link', `https://github.com/chadhage/app-scaling-strategies/blob/${catalog.source.commit}/README.md#microsoft-open-source-disclaimer`]
    ];
    assert.deepEqual(observed.map(item => [item.id, item.href]), fixed);
    assert.equal(new Set(observed.map(item => item.href)).size, observed.length);
    assert.ok(observed.every(item => item.target === (['practice-link', 'harness-link'].includes(item.id) ? '_blank' : null)));
    for (const id of ['practice-link', 'harness-link']) {
      assert.equal(await page.locator(`#${id}`).getAttribute('rel'), 'noopener noreferrer');
    }
    const ids = await page.locator('[id]').evaluateAll(nodes => nodes.map(node => node.id));
    assert.equal(ids.length, new Set(ids).size);
    linkSnapshots.push({ goalId, suggestedId: id, links: observed, uniqueFixedTargets: true });
  }
  try {
    await check('signed installed Edge 156, offline Node/PW and exact published isolated helper are actually responsive', async () => {
      assert.equal(browserVersion, signature.version);
      await ready();
      assert.equal(page.url(), pageURL);
      assert.equal(await page.locator('h1').textContent(), 'Choose a goal; find a next practice');
      assert.equal(await page.locator('header .banner').textContent(), engine.BANNER);
    });
    await check('actual DOM labels, status, errors, exact source/availability, scripts and initial no-result state', async () => {
      assert.equal(await page.getByLabel('Chosen learning goal', { exact: true }).count(), 1);
      assert.deepEqual(await page.locator('#goal-select option').evaluateAll(nodes => nodes.map(node => node.value)),
        ['', ...engine.GOALS.map(goal => goal.id)]);
      assert.equal(await page.locator('#goal-status').getAttribute('role'), 'status');
      assert.equal(await page.locator('#goal-status').getAttribute('aria-live'), 'polite');
      assert.equal(await page.locator('#goal-status').getAttribute('aria-atomic'), 'true');
      assert.equal(await page.locator('#goal-error').getAttribute('role'), 'alert');
      assert.equal(await page.locator('#goal-error').isVisible(), false);
      assert.equal(await page.locator('#recommendation').isVisible(), false);
      assert.equal(await page.locator('#practice-link').count(), 0);
      const summary = await page.locator('#source-summary').textContent();
      for (const value of [catalog.source.commit, engine.SNAPSHOT.catalogDataSha256,
        catalog.acceptanceSnapshot.ledgerSha256, catalog.acceptanceSnapshot.ledgerUpdatedAtUtc,
        catalog.acceptanceSnapshot.commitTimeUtc]) assert.ok(summary.includes(value));
      assert.match(await page.locator('#availability-summary').textContent(),
        /152 source entries: 150 scenarios; 150 accepted available portable practices; 2 unavailable workflows \(W001, W002\).*0 native runnable; 0 native qualified; 0 completed source parents/);
      assert.deepEqual(await page.locator('script[src]').evaluateAll(nodes => nodes.map(node => node.getAttribute('src'))), [
        '../C003/matrix-contract.js', '../C003/matrix-data.js', '../C005/catalog-contract.js',
        '../C005/catalog-data.js', '../C006/search.js', '../C007/catalog-filters.js', 'recommendation.js', 'page.js'
      ]);
      assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => /^https?:/i.test(entry.name)).length), 0);
      await state('initial-validated-no-choice');
    });
    await check('keyboard skip, blank rejection, error focus, goal selection, recommendation and inspect-why form one journey', async () => {
      await page.reload({ waitUntil: 'load' });
      await ready();
      await page.keyboard.press('Tab');
      assert.equal(await active(), 'skip-link');
      assert.notEqual(await page.locator('.skip-link').evaluate(node => getComputedStyle(node).outlineStyle), 'none');
      await page.keyboard.press('Enter');
      assert.equal(await active(), 'goal-select');
      await page.keyboard.press('Home');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      assert.equal(await active(), 'goal-select');
      assert.match(await page.locator('#goal-error').textContent(), /ERR_GOAL_BLANK/);
      assert.equal(await page.locator('#goal-select').getAttribute('aria-invalid'), 'true');
      assert.equal(await page.locator('#practice-link').count(), 0);
      await state('blank-keyboard-error');
      await choose('warm-handoff');
      assert.equal(await active(), 'recommendation-heading');
      assert.equal(await page.locator('#goal-error').isVisible(), false);
      assert.equal(await page.locator('#goal-select').getAttribute('aria-invalid'), null);
      await page.keyboard.press('Tab');
      assert.equal(await active(), 'inspect-why');
      await page.keyboard.press('Enter');
      assert.equal(await active(), 'why-heading');
      assert.match(await page.locator('#goal-relevance').textContent(), /"blue-green".*AND.*portable availability AND mapped category A/);
      await page.keyboard.press('Tab');
      assert.equal(await active(), 'source-row-link');
      await page.keyboard.press('Tab');
      assert.equal(await active(), 'practice-link');
      await state('keyboard-recommendation-and-why');
    });
    await check('all eight exact goal suggestions have unique fixed targets, keyboard-opened actual lessons and app keyboard return', async () => {
      for (const [goalId, id] of goalCases) {
        await choose(goalId);
        const expected = engine.recommend(goalId);
        assert.equal(await page.locator('#recommendation').getAttribute('data-entry-id'), id);
        assert.equal(await page.locator('#recommendation-heading').textContent(), `${id} — ${expected.title}`);
        assert.equal(await page.locator('#suggested-objective').textContent(), expected.objective);
        assert.equal(await page.locator('#recommendation-banner').textContent(), engine.BANNER);
        await why();
        assert.equal(await page.locator('#goal-relevance').textContent(), expected.why);
        await links(goalId, id);
        const href = await page.locator('#practice-link').getAttribute('href');
        await open('practice-link');
        assert.ok(child.url().endsWith(`/learning/${id}/index.html`));
        assert.equal(await child.getByText(engine.BANNER, { exact: true }).first().textContent(), engine.BANNER);
        assert.equal(await child.locator('main').count(), 1);
        assert.ok(await child.locator('button').count() > 0);
        assert.equal(await child.evaluate(() => window.opener === null), true);
        practiceNavigations.push({ goalId, id, href, actualLoadedUrl: child.url(),
          trainingBanner: await child.getByText(engine.BANNER, { exact: true }).first().textContent(), localConductableControlsObserved: true });
        await back();
      }
      assert.equal(practiceNavigations.length, 8);
      assert.equal(new Set(practiceNavigations.map(item => item.href)).size, 8);
    });
    await check('repeated recommendations have identical real DOM output and do not mutate shared catalog state', async () => {
      const sourceBefore = await page.evaluate(() => JSON.stringify(C005Catalog));
      await choose('warm-handoff');
      const first = await page.locator('#recommendation-body').evaluate(node => node.outerHTML);
      for (let repeat = 0; repeat < 3; repeat++) {
        await page.locator('#recommend').focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('#recommendation-body').evaluate(node => node.outerHTML), first);
      }
      assert.equal(await page.evaluate(() => JSON.stringify(C005Catalog)), sourceBefore);
    });
    await check('recommended S001 really conducts safe/unsafe local controls and app keyboard return reaches a resettable chooser', async () => {
      await choose('warm-handoff');
      await open('practice-link');
      assert.ok(child.url().endsWith('/learning/S001/index.html'));
      assert.equal(await child.locator('#verdict').getAttribute('data-verdict'), 'NOT_RUN');
      const actions = [];
      for (const id of ['warm', 'handoff', 'drain', 'elapse', 'retire']) {
        await child.locator(`#${id}`).focus();
        await child.keyboard.press('Enter');
        actions.push({ id, verdict: await child.locator('#verdict').getAttribute('data-verdict') });
      }
      assert.equal(await child.locator('#verdict').getAttribute('data-verdict'), 'PASS');
      assert.equal(await child.locator('#v1-state').textContent(), 'RETIRED');
      await child.locator('#reset').focus();
      await child.keyboard.press('Enter');
      await child.locator('#handoff').focus();
      await child.keyboard.press('Enter');
      assert.equal(await child.locator('#verdict').getAttribute('data-verdict'), 'FAIL');
      assert.equal(await child.locator('#admission-target').textContent(), 'v1');
      lessonObservation = { id: 'S001', actualLoadedUrl: child.url(), actions,
        safeVerdict: 'PASS', unsafeVerdict: await child.locator('#verdict').textContent(),
        unsafeReason: await child.locator('#reason').textContent(), nativeAzureResult: false };
      await state('actual-s001-negative-rehearsal', child);
      await back();
      await reset();
      assert.equal(await active(), 'goal-select');
    });
    await check('one actual accepted full150 harness link browses and prepares S001 without rebuilding or crediting companions', async () => {
      await open('harness-link');
      assert.ok(child.url().endsWith('/capability/local-harness/index.html'));
      await child.waitForFunction(() => !document.getElementById('catalog-controls').disabled);
      assert.equal(await child.locator('#matching-entries > article').count(), 152);
      await child.locator('#catalog-query').focus();
      await child.keyboard.type('blue-green');
      await child.keyboard.press('Enter');
      assert.deepEqual(await child.locator('#matching-entries > article').evaluateAll(nodes => nodes.map(node => node.id)),
        ['S001', 'S124', 'S128']);
      await child.locator('#prepare-S001').focus();
      await child.keyboard.press('Enter');
      assert.equal(await child.locator('#preparation').isVisible(), true);
      assert.equal(await child.locator('.lesson-link').getAttribute('href'), catalog.entries[0].learning.href);
      assert.ok((await child.locator('#preparation-body').textContent()).includes(catalog.entries[0].objective));
      harnessObservation = { actualLoadedUrl: child.url(), totalEntriesBeforeQuery: 152, goalQuery: 'blue-green',
        preparedId: 'S001', actualPracticeHref: await child.locator('.lesson-link').getAttribute('href'),
        additionalSatisfierCredit: 0, parentCompletionClaimed: false };
      await state('actual-existing-harness-preparation', child);
      await back();
      await reset();
    });
    await check('reset clears local choice, recommendation, error and focus but keeps historical source unchanged', async () => {
      const sourceBefore = await page.locator('#source-summary').textContent();
      await choose('preserve-session');
      await why();
      await reset();
      assert.equal(await page.locator('#goal-select').inputValue(), '');
      assert.equal(await page.locator('#recommendation').isVisible(), false);
      assert.equal(await page.locator('#practice-link').count(), 0);
      assert.equal(await page.locator('#goal-error').isVisible(), false);
      assert.equal(await page.locator('#goal-select').getAttribute('aria-invalid'), null);
      assert.equal(await active(), 'goal-select');
      assert.match(await page.locator('#goal-status').textContent(), /No goal selected/);
      assert.equal(await page.locator('#source-summary').textContent(), sourceBefore);
      await state('keyboard-reset');
    });
    await check('actual DOM unknown, unsafe, blank and nonprimitive API inputs visibly reject with no stale recommendation', async () => {
      const inputs = [
        ['unknown', 'ERR_GOAL_UNKNOWN'], ['unsafe', 'ERR_GOAL_UNSAFE'], ['blank', 'ERR_GOAL_BLANK'],
        ['null', 'ERR_GOAL_TYPE'], ['undefined', 'ERR_GOAL_TYPE'], ['boxed', 'ERR_GOAL_TYPE']
      ];
      for (const [kind, code] of inputs) {
        await choose('warm-handoff');
        assert.equal(await page.evaluate(kind => {
          const controller = X003Page.mount(document);
          const values = { unknown: 'unregistered-goal', unsafe: '<img onerror=1>', blank: ' ',
            null: null, undefined: undefined, boxed: new String('warm-handoff') };
          return controller.recommend(values[kind]);
        }, kind), false);
        assert.equal(await page.locator('#goal-error').isVisible(), true);
        assert.ok((await page.locator('#goal-error').textContent()).includes(code));
        assert.equal(await page.locator('#practice-link').count(), 0);
        assert.equal(await active(), 'goal-select');
      }
      await state('explicit-type-and-unknown-errors');
      await page.evaluate(() => X003Page.mount(document));
    });
    await check('both unavailable workflow goals and zero available category matches show errors, never an unrelated lesson', async () => {
      for (const goal of ['progressive-rings', 'shared-preview']) {
        await choose(goal);
        assert.match(await page.locator('#goal-error').textContent(), /ERR_NO_AVAILABLE_MATCH.*No fallback lesson/);
        assert.equal(await page.locator('#practice-link').count(), 0);
        assert.equal(await active(), 'goal-select');
      }
      assert.equal(await page.evaluate(() => {
        const fixture = structuredClone(C005Catalog);
        Object.assign(fixture.entries[0].learning, { status: 'unavailable', available: false, href: null, evidence: null });
        return X003Page.mount(document, fixture, C003Matrix).recommend('warm-handoff');
      }), false);
      assert.match(await page.locator('#goal-error').textContent(), /ERR_SNAPSHOT/);
      assert.equal(await page.locator('#practice-link').count(), 0);
      assert.equal(await page.evaluate(() => C005Catalog.entries[0].learning.available), true);
      await state('declared-clone-availability-negative-not-source-mutation');
      await page.evaluate(() => X003Page.mount(document));
    });
    await check('malformed, sparse, altered-pin or absent providers fail closed; repeated remount leaves one handler', async () => {
      for (const kind of ['missing', 'sparse', 'native', 'unsafe-href', 'source', 'matrix', 'matrix-content']) {
        assert.equal(await page.evaluate(kind => {
          let fixture = structuredClone(C005Catalog);
          const matrixFixture = structuredClone(C003Matrix);
          if (kind === 'missing') fixture = null;
          if (kind === 'sparse') delete fixture.entries[0];
          if (kind === 'native') fixture.entries[0].native.runnable = true;
          if (kind === 'unsafe-href') fixture.entries[0].learning.href = 'javascript:alert(1)';
          if (kind === 'source') fixture.source.readme.sha256 = '0'.repeat(64);
          if (kind === 'matrix-content') matrixFixture.sources[0].title += ' Invented source title.';
          return X003Page.mount(document, fixture, kind === 'matrix' ? null : matrixFixture).recommend('warm-handoff');
        }, kind), false);
        assert.equal(await page.locator('#goal-error').isVisible(), true);
        assert.equal(await page.locator('#goal-select').isDisabled(), true);
        assert.equal(await page.locator('#recommend').isDisabled(), true);
        assert.equal(await page.locator('#practice-link').count(), 0);
        assert.match(await page.locator('#availability-summary').textContent(), /unverified/);
        await page.evaluate(() => X003Page.mount(document));
      }
      assert.equal(await page.evaluate(async () => {
        X003Page.mount(document);
        X003Page.mount(document);
        const records = [];
        const observer = new MutationObserver(mutations => records.push(...mutations));
        observer.observe(document.getElementById('goal-status'), { childList: true });
        const select = document.getElementById('goal-select');
        select.value = 'warm-handoff';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await Promise.resolve();
        observer.disconnect();
        return records.length;
      }), 1);
    });
    await check('changed source markup cannot retain original provenance, render a recommendation or execute elements', async () => {
      const objective = 'blue-green <img src="https://invalid.example/x003-markup" onerror="globalThis.X003Unexpected=true">';
      assert.equal(await page.evaluate(objective => {
        const fixture = structuredClone(C005Catalog);
        fixture.entries[0].objective = objective;
        return X003Page.mount(document, fixture, C003Matrix).recommend('warm-handoff');
      }, objective), false);
      assert.match(await page.locator('#goal-error').textContent(), /ERR_SNAPSHOT/);
      assert.equal(await page.locator('#suggested-objective').count(), 0);
      assert.equal(await page.locator('#recommendation img, #recommendation script, #recommendation svg').count(), 0);
      assert.equal(await page.evaluate(() => globalThis.X003Unexpected), undefined);
      assert.equal(await page.evaluate(() => C005Catalog.entries[0].objective), catalog.entries[0].objective);
      await page.evaluate(() => X003Page.mount(document));
    });
    await check('320px reflow keeps long fixed provenance, labels, why, links and reset keyboard usable', async () => {
      await choose('retire-without-dependencies');
      await why();
      await page.setViewportSize({ width: 320, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.evaluate(() => document.body.scrollWidth <= innerWidth), true);
      for (const id of ['goal-select', 'recommend', 'reset', 'why-heading', 'practice-link']) {
        assert.equal(await page.locator(`#${id}`).isVisible(), true);
      }
      assert.notEqual(await page.locator('#why-heading').evaluate(node => getComputedStyle(node).outlineStyle), 'none');
      await state('320px-relevance-and-provenance');
      await page.setViewportSize({ width: 1280, height: 900 });
      await reset();
    });
    await check('actual exact CSP blocks inline code and outbound connection probes without observed remote requests', async () => {
      assert.equal(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'), CSP);
      assert.deepEqual(remoteRequests, []);
      assert.deepEqual(pageErrors, []);
      cspObservation = await page.evaluate(async () => {
        const violations = [];
        const listener = event => violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        document.addEventListener('securitypolicyviolation', listener);
        const script = document.createElement('script');
        script.textContent = 'globalThis.X003CspInlineExecuted=true;';
        document.head.append(script);
        let connectionBlocked = false;
        try { await fetch('https://invalid.example/x003-csp-probe', { mode: 'no-cors' }); }
        catch { connectionBlocked = true; }
        await new Promise(resolve => setTimeout(resolve, 100));
        script.remove();
        document.removeEventListener('securitypolicyviolation', listener);
        return { violations, connectionBlocked, inlineExecuted: globalThis.X003CspInlineExecuted === true };
      });
      assert.equal(cspObservation.inlineExecuted, false);
      assert.equal(cspObservation.connectionBlocked, true);
      assert.ok(cspObservation.violations.some(item => item.directive === 'script-src-elem'));
      assert.ok(cspObservation.violations.some(item => item.directive === 'connect-src'));
      assert.deepEqual(remoteRequests, []);
      assert.deepEqual(pageErrors, []);
      await state('actual-csp-blocks-and-reset-state');
    });
    assert.equal(checks.length, 14);
  } catch (error) { failure = error; }
  finally {
    try {
      try { for (const opened of children) if (!opened.isClosed()) await opened.close(); }
      finally { await session.close(); }
      cleanupCompleted = true;
    }
    catch (error) { failure = failure ? new AggregateError([failure, error], 'Browser assertion and cleanup both failed') : error; }
  }
  assert.equal(digest(), before, 'Browser checks themselves must not modify any owned source/evidence byte.');
  assert.equal(hash(fs.readFileSync(helperPath)), manifest.browserHelperSha256);
  assert.equal(hash(fs.readFileSync(path.join(repository, 'capability', 'C005', 'catalog-data.js'))), manifest.catalogDataSha256);
  const report = {
    schema: 'X003/browser-proof/1', cardId: 'X003', workerId: 'worker-X003',
    status: failure ? 'failed' : 'passed', observedAtUtc: new Date().toISOString(),
    mode: 'actual-isolated-signed-headless-Edge', nodeVersion: process.version,
    playwrightVersion: helperRequire('playwright/package.json').version, browserVersion, browserSignature: signature,
    helperApi: 'openIsolatedLesson', helperPath: 'testing\\browser\\isolated.cjs',
    helperRawSha256: hash(helperBytes), helperGitCanonicalSha256: hash(canonicalHelper),
    helperPublishedCommit: manifest.browserHelperPublishedCommit,
    integratedBrowserUsed: false, browserMocked: false, chromiumSandboxEnabled: true,
    inactiveLifecyclePrototypeUsed: false, helperBroaderLifecycleQualified: false,
    page: 'capability\\X003\\index.html', actualDomAndKeyboardObserved: true,
    sourcePin: catalog.source.commit, catalogDataSha256: manifest.catalogDataSha256,
    acceptanceSnapshot: catalog.acceptanceSnapshot, sourceEntries: 152, sourceScenarios: 150,
    acceptedHistoricalPractices: 150, unavailableWorkflows: ['W001', 'W002'],
    nativeRunnable: 0, nativeQualified: 0, completedSourceParents: 0,
    checks, passedChecks: checks.filter(item => item.passed).length, failedChecks: checks.filter(item => !item.passed).length,
    practiceNavigations, linkSnapshots, returns, lessonObservation, harnessObservation, cspObservation,
    pageErrorsObservedAfterOpen: pageErrors, remoteRequestsObservedAfterOpen: remoteRequests,
    ordinaryInputBytesUnchanged: true, browserCleanup: cleanupCompleted ? 'completed by awaited close() in finally' : 'failed',
    additionalCompanionCredit: 0, parentAcceptancePending: true,
    nativeAzureObserved: false, productionNode24Validated: false,
    accessibilityLimit: 'Observed keyboard, labels, focus, status/error/reset and 320px reflow; not full WCAG or assistive-technology certification.',
    failure: failure ? { name: failure.name, code: failure.code, message: failure.message, stack: failure.stack } : null
  };
  if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
    const directory = path.join(root, 'evidence', 'browser',
      `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`);
    fs.mkdirSync(directory, { recursive: true });
    report.domSnapshots = states.map((value, index) => {
      const bytes = Buffer.from(value.html, 'utf8');
      const file = path.join(directory, `dom-${String(index).padStart(2, '0')}.raw.gz`);
      fs.writeFileSync(file, zlib.gzipSync(bytes), { flag: 'wx' });
      return { name: value.name, url: value.url, path: path.relative(repository, file),
        sha256: hash(bytes), bytes: bytes.length, rawPreservedWithoutNormalization: true };
    });
    const file = path.join(directory, 'report.json');
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    console.log(`X003_BROWSER_REPORT ${path.relative(repository, file)}`);
  }
  console.log(`X003 BROWSER checks=${report.passedChecks}/14; Edge ${browserVersion}; PW 1.56.1; Node ${process.version}; actual lesson targets=${practiceNavigations.length}; cleanup=${cleanupCompleted}; source/evidence unchanged before deliberate capture.`);
  if (failure) throw failure;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
