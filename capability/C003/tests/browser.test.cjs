'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { createRequire } = require('node:module');
const matrix = require('../matrix-data.js');
const helperPath = path.join(__dirname, '..', '..', '..', 'testing', 'browser', 'isolated.cjs');
const hashHelper = () => createHash('sha256').update(readFileSync(helperPath)).digest('hex');
const helperSourceSha256 = hashHelper();
const { openIsolatedLesson } = require(helperPath);
assert.equal(hashHelper(), helperSourceSha256, 'shared helper must not change during import');
const helperRequire = createRequire(helperPath);

test('real isolated browser: C003 local matrix acceptance', { timeout: 90000 }, async t => {
  const reportPath = path.join(__dirname, '..', 'evidence', 'browser-acceptance.json');
  await fs.rm(reportPath, { force: true });
  const session = await openIsolatedLesson('capability\\C003\\index.html');
  const { page, browserVersion } = session;
  const checks = [];
  const errors = [];
  const remoteRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/^https?:/i.test(request.url())) remoteRequests.push(request.method() + ' [remote URL redacted]');
  });
  const rows = page.locator('#matrix-rows tr');
  async function check(name, run) {
    await t.test(name, async () => {
      await run();
      checks.push({ name, passed: true });
    });
  }
  async function restore() {
    await page.locator('#restore').click();
    assert.equal(await rows.count(), 17);
    assert.equal(await page.locator('#data-error').isVisible(), false);
  }
  async function inspect(value) {
    await page.locator('#local-json').fill(typeof value === 'string' ? value : JSON.stringify(value));
    await page.locator('#inspect').click();
  }
  const clone = () => structuredClone(matrix);
  let report;

  try {
    await check('real DOM loads 17 validated rows and all five distinct label options', async () => {
      assert.equal(await rows.count(), 17);
      assert.equal(await page.locator('#status option').count(), 6);
      assert.match(await page.locator('#result-count').innerText(), /17 of 17.*Qualified native configurations: 0/);
      assert.match(await page.locator('#scope-heading').innerText(), /Local \/ documented-only/);
      assert.match(await page.locator('#design-summary').innerText(), /Node.js 24 LTS \/ Express.*Node.js 22.23.4.*false/);
      assert.match(await page.locator('#data-origin').innerText(), /Immutable documented baseline/);
      assert.equal(await page.locator('#sources li').count(), 8);
      assert.equal(await page.evaluate(() => Object.isFrozen(globalThis.C003Matrix.rows[0].constraints)), true);
    });
    await check('actual Tab/arrows/type/Enter combine filters and restore keyboard focus', async () => {
      await page.locator('#query').focus();
      await page.keyboard.type('AUTO-SWAP');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'host');
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'format');
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'status');
      await page.keyboard.press('End');
      await page.keyboard.press('ArrowUp');
      assert.equal(await rows.count(), 1);
      assert.equal(await rows.first().getAttribute('data-row-id'), 'app-service-linux-auto-swap');
      assert.match(await rows.first().innerText(), /Unsupported.*Native: unqualified/s);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'clear');
      await page.keyboard.press('Enter');
      assert.equal(await rows.count(), 17);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'query');
    });
    await check('qualified and incompatible filters display honest empty results', async () => {
      await page.locator('#status').focus();
      await page.keyboard.press('Home');
      for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#status').inputValue(), 'qualified');
      assert.equal(await rows.count(), 0);
      assert.equal(await page.locator('#empty').isVisible(), true);
      assert.match(await page.locator('#result-count').innerText(), /Qualified native configurations: 0/);
      await page.locator('#clear').click();
      await page.locator('#host').selectOption('aks');
      await page.locator('#format').selectOption('code');
      assert.equal(await rows.count(), 0);
      assert.equal(await page.locator('#empty').isVisible(), true);
      await page.locator('#clear').click();
    });
    await check('documented revision filters and unsupported reasons remain distinct with no run controls', async () => {
      await page.locator('#host').selectOption('container-apps');
      await page.locator('#format').selectOption('container');
      await page.locator('#status').selectOption('documented-supported');
      await page.locator('#query').fill('IMMUTABLE');
      assert.equal(await rows.count(), 2);
      assert.ok((await rows.allTextContents()).every(text => text.includes('revisions') && text.includes('Native: unqualified')));
      await page.locator('#clear').click();
      await page.locator('#status').selectOption('unsupported');
      assert.equal(await rows.count(), 4);
      assert.match((await rows.allTextContents()).join(' '), /Linux.*auto-swap.*Containers.*auto-swap.*automatic scaling.*Flex/s);
      const buttons = await page.locator('button').allTextContents();
      assert.deepEqual(buttons, ['Clear filters', 'Validate and view local JSON', 'Restore documented baseline']);
      assert.equal(await page.locator('form, iframe, [onclick], [data-action]').count(), 0);
      await page.locator('#clear').click();
      await page.getByText('Optional local JSON inspection — no upload or execution', { exact: true }).click();
    });
    await check('malformed JSON clears stale rows, provenance, and permissions with an accessible alert', async () => {
      await inspect('{invalid');
      assert.equal(await rows.count(), 0);
      assert.equal(await page.locator('#sources li').count(), 0);
      assert.equal(await page.locator('#data-error').isVisible(), true);
      assert.equal(await page.locator('#data-error').getAttribute('role'), 'alert');
      assert.match(await page.locator('#data-error').innerText(), /Invalid JSON/);
      await page.getByText('Denied permissions and zero-live-run envelope', { exact: true }).press('Enter');
      assert.equal(await page.locator('#permissions').isVisible(), true);
      assert.match(await page.locator('#permissions').innerText(), /remain forbidden/);
      await restore();
    });
    await check('wrong version, true permission, native evidence, and unsupported promotion are rejected in the actual UI', async () => {
      const cases = [
        ['schemaVersion', value => { value.schemaVersion = '2.0.0'; }],
        ['liveAzureExecutionApproved', value => { value.permissions.liveAzureExecutionApproved = true; }],
        ['nativeEvidence', value => { value.rows[1].nativeEvidence = ['ten-completed-synthetic-lessons']; }],
        ['reserved', value => { value.rows[1].status = 'qualified'; }],
        ['unsupported', value => {
          Object.assign(value.rows.find(row => row.id === 'app-service-linux-auto-swap'),
            { status: 'documented-supported', documentedSupport: 'documented-supported', adapter: 'planned' });
        }]
      ];
      for (const [expected, mutate] of cases) {
        const value = clone();
        mutate(value);
        await inspect(value);
        assert.equal(await rows.count(), 0);
        assert.ok((await page.locator('#data-error').innerText()).includes(expected), expected);
        await restore();
      }
    });
    await check('local imported text stays literal, is labeled untrusted, and cannot create executable DOM', async () => {
      const value = clone();
      const literal = '<img src="https://invalid.example/c003" onerror="globalThis.C003UnexpectedExecution=true">';
      value.rows[0].title = literal;
      await inspect(value);
      assert.equal(await rows.count(), 17);
      assert.equal(await rows.first().locator('p').first().textContent(), literal);
      assert.equal(await page.locator('#matrix-rows img, #matrix-rows script').count(), 0);
      assert.equal(await page.evaluate(() => globalThis.C003UnexpectedExecution), undefined);
      assert.match(await page.locator('#data-origin').innerText(), /not authenticated documentation, approval, or native evidence/);
      await restore();
    });
    await check('CSP, normal mobile reflow, no remote requests, and clean real-browser execution', async () => {
      const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
      for (const directive of ["default-src 'none'", "script-src 'self'", "connect-src 'none'", "object-src 'none'"]) {
        assert.ok(csp.includes(directive));
      }
      assert.ok(!csp.includes('unsafe-inline') && !csp.includes('unsafe-eval'));
      const remoteResources = await page.evaluate(() => performance.getEntriesByType('resource')
        .filter(resource => /^https?:/.test(resource.name)).length);
      assert.equal(remoteResources, 0);
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('#clear').isVisible(), true);
      assert.equal(await rows.count(), 17);
      assert.deepEqual(errors, []);
      assert.deepEqual(remoteRequests, []);
    });
    assert.equal(checks.length, 8, 'every real-browser acceptance check must complete');
    report = {
      schemaVersion: 1, cardId: 'C003', status: 'passed', observedAtUtc: new Date().toISOString(),
      mode: 'isolated-headless', engine: 'Microsoft Edge (Chromium)', browserVersion,
      playwrightVersion: helperRequire('playwright/package.json').version,
      helper: 'testing\\browser\\isolated.cjs', helperPublishedBaseCommit: 'eaf266c631d286a3dacb24c1caab9686f504a458',
      helperSourceSha256, helperApi: 'openIsolatedLesson',
      helperProvenanceNote: 'Published verified lesson API; the source hash records the exact imported worktree file. Unrelated in-progress loopback exports are not called.',
      lesson: 'capability\\C003\\index.html', actualDomAndKeyboard: true, mockedBrowser: false,
      integratedForegroundUsed: false, checks, pageErrors: errors, remoteRequests,
      nativeAzureObserved: false, nativeQualified: false, documentationTruthValidatedByBrowser: false
    };
  } finally {
    await session.close();
  }
  report.browserCleanup = 'completed via awaited close() in finally';
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log('C003 actual browser: Microsoft Edge ' + browserVersion + '; isolated-headless; Playwright ' + report.playwrightVersion);
});
