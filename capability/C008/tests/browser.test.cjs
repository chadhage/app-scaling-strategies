'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const catalog = require('../../C005/catalog-data.js');
const helperPath = path.resolve(__dirname, '..', '..', '..', 'testing', 'browser', 'isolated.cjs');
const helperRequire = createRequire(helperPath);
const helperSourceSha256 = createHash('sha256').update(readFileSync(helperPath)).digest('hex');
const { openIsolatedLesson } = require(helperPath);

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

test('C008 real isolated browser preparation, keyboard, reset, errors, CSP and all-152 coverage', { timeout: 180000 }, async t => {
  const reportPath = path.join(__dirname, '..', 'evidence', 'browser-observations.json');
  const previous = await fs.readFile(reportPath).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  const signature = signedEdge();
  assert.equal(signature.status, 'Valid');
  assert.match(signature.subject, /Microsoft Corporation/);
  assert.match(signature.version, /^156\./);
  const playwrightVersion = helperRequire('playwright/package.json').version;
  assert.equal(playwrightVersion, '1.56.1');
  assert.match(process.versions.node, /^22\./);
  const session = await openIsolatedLesson('capability\\C008\\index.html');
  const { page, browserVersion } = session;
  const checks = [];
  const pageErrors = [];
  const remoteRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (/^https?:/i.test(request.url())) remoteRequests.push(request.url());
  });
  let report;
  let coverage;
  let cspObservation;
  async function check(name, run) {
    await t.test(name, async () => {
      await run();
      checks.push({ name, passed: true });
    });
  }
  async function reset() {
    await page.locator('#reset-preparation').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.getElementById('entry-select').disabled
      && document.getElementById('entry-select').value === ''
      && document.getElementById('preparation').hidden);
  }
  async function open(id) {
    await page.locator('#entry-select').selectOption(id);
    await page.locator('#open-preparation').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(id => !document.getElementById('preparation').hidden
      && document.getElementById('entry-heading').textContent.startsWith(`${id} — `), id);
  }
  async function restore() {
    assert.equal(await page.evaluate(() => C008Page.renderPreparation(C005Catalog, C003Matrix, '', document)), true);
  }
  try {
    assert.match(browserVersion, /^156\./);
    assert.equal(browserVersion, signature.version);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('entry-select').disabled);
    await check('real initial empty state exposes exactly all 152 stable ID/title options and the historical source pin', async () => {
      assert.equal(await page.locator('#entry-select option').count(), 153);
      assert.deepEqual(await page.locator('#entry-select option').evaluateAll(nodes => nodes.slice(1).map(node => [node.value, node.textContent])),
        catalog.entries.map(entry => [entry.id, `${entry.id} — ${entry.title}`]));
      assert.equal(await page.locator('#preparation').isVisible(), false);
      assert.equal(await page.locator('#preparation-empty').isVisible(), true);
      assert.equal(await page.locator('#preparation-error').isVisible(), false);
      const snapshot = await page.locator('#snapshot-content').innerText();
      assert.ok(snapshot.includes(catalog.acceptanceSnapshot.commit));
      assert.ok(snapshot.includes(catalog.acceptanceSnapshot.commitTimeUtc));
      assert.ok(snapshot.includes(catalog.acceptanceSnapshot.ledgerUpdatedAtUtc));
      assert.match(snapshot, /Historical committed snapshot, not live availability/);
      assert.match(await page.locator('#preparation-status').innerText(), /150 scenarios · 2 workflows · 11 accepted synthetic lessons/);
    });
    await check('actual Tab, arrows and Enter operate skip, select and open with visible focus and announcements', async () => {
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => !document.getElementById('entry-select').disabled);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
      assert.notEqual(await page.locator('.skip-link').evaluate(node => getComputedStyle(node).outlineStyle), 'none');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'preparation-controls');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'entry-select');
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#entry-select').inputValue(), 'S001');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'open-preparation');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.activeElement.id === 'entry-heading');
      assert.equal(await page.locator('#entry-heading').innerText(), `S001 — ${catalog.entries[0].title}`);
      assert.notEqual(await page.locator('#entry-heading').evaluate(node => getComputedStyle(node).outlineStyle), 'none');
      assert.equal(await page.locator('#preparation-status').getAttribute('role'), 'status');
      assert.equal(await page.locator('#preparation-status').getAttribute('aria-live'), 'polite');
      assert.match(await page.locator('#preparation-status').innerText(), /S001 preparation opened/);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'source-row-link');
    });
    await check('accepted resource-free practice links only the original synthetic lesson and is keyboard reachable', async () => {
      await open('S001');
      assert.equal(await page.locator('#learning-preparation').getAttribute('data-learning-mode'), 'synthetic-learning');
      assert.match(await page.locator('#learning-preparation').innerText(), /No Azure account, subscription, CLI, management credentials, server or cloud setup/);
      assert.equal(await page.locator('.lesson-link').getAttribute('href'), catalog.entries[0].learning.href);
      await page.locator('.lesson-link').focus();
      await page.keyboard.press('Enter');
      await page.waitForURL(/\/learning\/S001\/index\.html$/);
      assert.match(await page.locator('body').innerText(), /synthetic|training rehearsal/i);
      await page.goBack({ waitUntil: 'load' });
      await restore();
    });
    await check('unaccepted files and workflow-only entries stay unavailable rather than becoming native or completed parents', async () => {
      for (const id of ['S009', 'S010', 'W001', 'W002']) {
        await open(id);
        assert.equal(await page.locator('.lesson-link').count(), 0);
        assert.equal(await page.locator('#learning-preparation').getAttribute('data-learning-mode'),
          id.startsWith('W') ? 'unsupported-learning' : 'unavailable-learning');
        assert.match(await page.locator('.native-status').innerText(), /runnable: false; qualified: false/);
        assert.match(await page.locator('.parent-status').innerText(), /completed: false/);
        assert.match(await page.locator('.risk-status').innerText(), /Risk: unclassified/);
      }
      assert.match(await page.locator('.additional-prerequisites').innerText(), /^CONTAINER, H009,/);
      assert.match(await page.locator('.base-prerequisites').innerText(), /do not automatically add the D-S BASE rule/);
      assert.match(await page.locator('[data-section="dependencyRules"] pre').textContent(), /CONTAINER.*P002 OR P003/);
    });
    await check('all six missing approvals, five unapproved target values, zero limits and cleanup uncertainty are explicit', async () => {
      assert.equal(await page.locator('.missing-approvals li').count(), 6);
      assert.ok((await page.locator('.missing-approvals li').allTextContents()).every(text => /false.*approval is missing/.test(text)));
      const target = await page.locator('.native-target').innerText();
      assert.match(target, /Native OS/);
      assert.match(target, /Native SKU/);
      assert.match(target, /Native subscription/);
      assert.match(target, /Native resource group/);
      assert.match(target, /Native region/);
      assert.equal((target.match(/Unapproved — no value supplied; not a default/g) || []).length, 5);
      assert.match(await page.locator('.operating-envelope').innerText(), /Maximum live Azure runs\s+0/);
      assert.match(await page.locator('.operating-envelope').innerText(), /Authorized cloud spend\s+0/);
      assert.match(await page.locator('#limits-evidence').innerText(), /Pricing is unknown/);
      assert.match(await page.locator('.evidence-status').innerText(), /unverified.*not measured.*not applicable.*No cloud deletion/s);
      assert.match(await page.locator('#native-preparation').innerText(), /No reviewed tenant\/app identity/);
      assert.equal(await page.locator('button').count(), 2);
      assert.equal(await page.locator('input, form, iframe, [onclick], [data-action]').count(), 0);
    });
    await check('every S001–S150 and W001/W002 preparation has exact source, prerequisites, learning, constraints and evidence in the actual DOM', async () => {
      coverage = await page.evaluate(async () => {
        const ids = [];
        const failures = [];
        const modes = { 'synthetic-learning': 0, 'unavailable-learning': 0, 'unsupported-learning': 0 };
        const same = (actual, expected, label, id) => {
          if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(`${id}: ${label}`);
        };
        for (const entry of C005Catalog.entries) {
          const rendered = await C008Page.renderPreparation(C005Catalog, C003Matrix, entry.id, document);
          same(rendered, true, 'render result', entry.id);
          same(document.getElementById('preparation').hidden, false, 'visible preparation', entry.id);
          same(document.getElementById('entry-heading').textContent, `${entry.id} — ${entry.title}`, 'title', entry.id);
          same(document.querySelector('.entry-objective').textContent, entry.objective, 'objective', entry.id);
          same(document.querySelector('.source-implementation').textContent, entry.implementation, 'implementation', entry.id);
          same(document.querySelector('.source-acceptance').textContent, entry.acceptance, 'acceptance', entry.id);
          same(document.querySelector('.additional-prerequisites').textContent, entry.prerequisites.additional, 'prerequisites', entry.id);
          same(document.querySelector('.base-prerequisites').textContent.includes('also inherits BASE'), entry.prerequisites.inheritsBase, 'BASE', entry.id);
          same([...document.querySelectorAll('.source-row-link')].map(node => node.getAttribute('href')),
            entry.sourceReferences.map(ref => C005Contract.sourceHref(C005Catalog, ref)), 'source row links', entry.id);
          same(document.querySelector('.learning-reason').textContent, entry.learning.reason, 'learning reason', entry.id);
          same([...document.querySelectorAll('.lesson-link')].map(node => node.getAttribute('href')),
            entry.learning.available ? [entry.learning.href] : [], 'accepted lesson destination', entry.id);
          const mode = document.getElementById('learning-preparation').dataset.learningMode;
          modes[mode]++;
          same(mode, entry.learning.available ? 'synthetic-learning' : entry.kind === 'workflow' ? 'unsupported-learning' : 'unavailable-learning', 'learning mode', entry.id);
          same(document.querySelector('.native-status').textContent.includes(entry.native.reason), true, 'native reason', entry.id);
          same(document.querySelector('.support-status').textContent.includes(entry.support.reason), true, 'support reason', entry.id);
          same(document.querySelector('.parent-status').textContent.includes(entry.parent.reason), true, 'parent reason', entry.id);
          same(document.querySelector('.risk-status').textContent, `Risk: ${entry.risk}. ${C005Catalog.common.riskReason}`, 'unclassified risk', entry.id);
          for (const key of ['dependencyRules', 'sharedDefinitionOfDone', 'operatingLimits', 'acceptanceAndEvidence']) {
            const excerpt = document.querySelector(`[data-section="${key}"]`);
            same(excerpt.querySelector('pre').textContent, C005Catalog.common[key].text, key, entry.id);
            same(excerpt.querySelector('a').getAttribute('href'),
              C005Contract.sourceHref(C005Catalog, C005Catalog.common[key].reference), `${key} source`, entry.id);
          }
          same([...document.querySelectorAll('.matrix-configuration')].map(node => node.dataset.configurationId),
            C003Matrix.rows.map(row => row.id), 'matrix IDs', entry.id);
          same([...document.querySelectorAll('.matrix-reason')].map(node => node.textContent),
            C003Matrix.rows.map(row => row.reason), 'matrix reasons', entry.id);
          same([...document.querySelectorAll('.constraint-text')].map(node => node.textContent),
            C003Matrix.rows.flatMap(row => row.constraints.map(value => value.text)), 'unchanged matrix constraints', entry.id);
          same(document.querySelectorAll('.missing-approvals li').length, 6, 'missing approvals', entry.id);
          same(document.getElementById('preparation-error').hidden, true, 'no validation error', entry.id);
          ids.push(entry.id);
        }
        return { count: ids.length, ids, modes, failures, actualBrowserDOM: true };
      });
      assert.equal(coverage.count, 152);
      assert.deepEqual(coverage.ids, catalog.entries.map(entry => entry.id));
      assert.deepEqual(coverage.modes, { 'synthetic-learning': 11, 'unavailable-learning': 139, 'unsupported-learning': 2 });
      assert.deepEqual(coverage.failures, []);
      assert.equal(await page.locator('.matrix-configuration').count(), 17);
      await page.locator('#matrix-details summary').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#matrix-details').getAttribute('open'), '');
      assert.match(await page.locator('#matrix-details').innerText(), /unsupported/);
      assert.match(await page.locator('#matrix-details').innerText(), /Unknown|unknown/);
    });
    await check('reset is keyboard operable and restores a genuinely empty local view without claiming cleanup', async () => {
      await reset();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'entry-select');
      assert.equal(await page.locator('#preparation').isVisible(), false);
      assert.equal(await page.locator('.source-row-link, .lesson-link, .missing-approvals li').count(), 0);
      assert.equal(await page.locator('#entry-select option').count(), 153);
      assert.equal(await page.locator('#preparation-empty').isVisible(), true);
      assert.match(await page.locator('#preparation-controls').innerText(), /does not cancel a run, release a lease or clean up cloud resources/);
      await page.locator('#open-preparation').focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.getElementById('preparation-status').textContent.includes('No preparation selected'));
      assert.equal(await page.locator('#preparation').isVisible(), false);
    });
    await check('missing, empty, incompatible, promoted and unknown-ID inputs clear stale claims with an accessible error and reset recovery', async () => {
      for (const kind of ['missing', 'empty', 'version', 'matrix', 'native', 'parent', 'target', 'risk', 'id']) {
        await open('S001');
        assert.equal(await page.evaluate(async kind => {
          let data = structuredClone(C005Catalog);
          let matrix = C003Matrix;
          if (kind === 'missing') data = undefined;
          if (kind === 'empty') data.entries = [];
          if (kind === 'version') data.schemaVersion = '99.0.0';
          if (kind === 'matrix') matrix = undefined;
          if (kind === 'native') data.entries[0].native.runnable = true;
          if (kind === 'parent') data.entries[0].parent.completed = true;
          if (kind === 'risk') data.entries[0].risk = 'low';
          if (kind === 'target') {
            matrix = structuredClone(C003Matrix);
            matrix.design.target.sku = 'unreviewed';
          }
          return C008Page.renderPreparation(data, matrix, kind === 'id' ? 'S999' : 'S001', document);
        }, kind), false);
        assert.equal(await page.locator('#preparation').isVisible(), false);
        assert.equal(await page.locator('#snapshot').isVisible(), false);
        assert.equal(await page.locator('#preparation-body, #snapshot-content').evaluateAll(nodes => nodes.every(node => node.childElementCount === 0)), true);
        assert.equal(await page.locator('#preparation-error').isVisible(), true);
        assert.equal(await page.locator('#preparation-error').getAttribute('role'), 'alert');
        assert.equal(await page.locator('#preparation-empty').isVisible(), true);
        assert.equal(await page.locator('#entry-select').isDisabled(), true);
        assert.equal(await page.locator('#open-preparation').isDisabled(), true);
        assert.match(await page.locator('#preparation-status').innerText(), /coverage unavailable — unverified/);
        await reset();
        assert.equal(await page.locator('#preparation-error').isVisible(), false);
      }
    });
    await check('a pending earlier validation cannot repopulate stale preparation after reset', async () => {
      await page.evaluate(async () => {
        await Promise.all([
          C008Page.renderPreparation(C005Catalog, C003Matrix, 'S001', document),
          C008Page.renderPreparation(C005Catalog, C003Matrix, '', document)
        ]);
      });
      assert.equal(await page.locator('#preparation').isVisible(), false);
      assert.equal(await page.locator('#entry-select').inputValue(), '');
      assert.equal(await page.locator('#preparation-body').textContent(), '');
    });
    await check('source strings render literally without creating executable markup', async () => {
      const literal = '<img src="https://c008.invalid/markup" onerror="globalThis.C008UnexpectedExecution=true">';
      assert.equal(await page.evaluate(literal => {
        const data = structuredClone(C005Catalog);
        data.entries[0].title = literal;
        data.entries[0].implementation = literal;
        return C008Page.renderPreparation(data, C003Matrix, 'S001', document);
      }, literal), true);
      assert.equal(await page.locator('#entry-heading').textContent(), `S001 — ${literal}`);
      assert.equal(await page.locator('.source-implementation').textContent(), literal);
      assert.equal(await page.locator('#preparation img, #preparation script').count(), 0);
      assert.equal(await page.evaluate(() => globalThis.C008UnexpectedExecution), undefined);
      await restore();
    });
    await check('320 CSS-pixel reflow includes long workflow metadata and expanded canonical prerequisites', async () => {
      await open('W002');
      await page.locator('[data-section="dependencyRules"] summary').focus();
      await page.keyboard.press('Enter');
      await page.setViewportSize({ width: 320, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('#entry-heading').isVisible(), true);
      assert.equal(await page.locator('#entry-select').isVisible(), true);
      await page.setViewportSize({ width: 1280, height: 900 });
    });
    await check('CSP really denies inline code and connection probes while the application makes no remote requests', async () => {
      assert.deepEqual(remoteRequests, []);
      assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => /^https?:/.test(entry.name)).length), 0);
      cspObservation = await page.evaluate(async () => {
        const violations = [];
        const listener = event => violations.push(event.effectiveDirective);
        document.addEventListener('securitypolicyviolation', listener);
        const script = document.createElement('script');
        script.textContent = 'globalThis.C008InlineExecuted = true;';
        document.head.append(script);
        let connectionBlocked = false;
        try { await fetch('https://c008.invalid/csp-probe', { mode: 'no-cors' }); }
        catch { connectionBlocked = true; }
        await new Promise(resolve => setTimeout(resolve, 50));
        script.remove();
        document.removeEventListener('securitypolicyviolation', listener);
        return { violations, connectionBlocked, inlineExecuted: globalThis.C008InlineExecuted === true };
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
      schemaVersion: 1, cardId: 'C008', workerId: 'worker-C008', status: 'passed',
      observedAtUtc: new Date().toISOString(), mode: 'actual-isolated-headless',
      engine: 'Microsoft Edge (Chromium)', browserVersion, signature, playwrightVersion,
      nodeVersion: process.version, productionNode24Validated: false,
      helper: 'testing\\browser\\isolated.cjs', helperApi: 'openIsolatedLesson', helperSourceSha256,
      helperProvenance: 'Exact imported shared-helper worktree hash; unchanged by C008. File-only API, no foreground or loopback lease.',
      lesson: 'capability\\C008\\index.html', actualDomAndKeyboard: true, mockedBrowser: false,
      unsafeLaunchFlagsUsed: false, integratedForegroundUsed: false,
      sourcePin: catalog.source.commit, coverage, checks, cspObservation, pageErrors, remoteRequests,
      maximumLiveAzureRuns: 0, authorizedCloudSpend: 0,
      nativeAzureObserved: false, nativeQualified: false, sourceParentsCompleted: 0,
      accessibilityLimit: 'Observed keyboard, labels, focus, live/error/empty states, reset, 320px reflow and all-entry preparation. Not a full WCAG or assistive-technology certification.'
    };
  } finally {
    await session.close();
  }
  report.browserCleanup = 'completed by awaited close() in finally';
  if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log('C008 explicit browser observation capture requested with CAPTURE_BROWSER_EVIDENCE=1.');
  } else {
    const after = await fs.readFile(reportPath).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    assert.deepEqual(after, previous, 'ordinary verification must preserve existing observations byte-for-byte');
    console.log('C008 ordinary verification preserved browser observations without write or deletion.');
  }
  console.log(`C008 actual browser: signed Edge ${browserVersion}; Playwright ${playwrightVersion}; ${coverage.count} preparation views; ${checks.length} acceptance groups; close awaited.`);
});
