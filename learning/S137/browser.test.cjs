'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..', '..');
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const helperPath = path.join(root, 'testing', 'browser', 'isolated.cjs');
const helperSha256 = digest(fs.readFileSync(helperPath));
assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helperPath);
const { EXPECTATIONS } = require('./model.js');
const sourceNames = [
  '.gitattributes', 'old-bundle.feature', 'model.js', 'app.js', 'index.html',
  'manifest.json', 'README.txt', 'model.test.cjs', 'integrity.test.cjs', 'browser.test.cjs',
];

function hashes(directory = __dirname, prefix = '') {
  const result = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    assert.equal(entry.isSymbolicLink(), false, 'Only owned ordinary lesson/proof paths.');
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(result, hashes(path.join(directory, entry.name), relative));
    else result[relative] = digest(fs.readFileSync(path.join(directory, entry.name)));
  }
  return result;
}

function sourceBytes() {
  const snapshots = {};
  const provenance = {};
  for (const name of sourceNames) {
    const absolute = path.join(__dirname, name);
    const raw = fs.readFileSync(absolute);
    const canonical = Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'));
    const canonicalGitOid = execFileSync('git', ['--no-pager', 'hash-object', '--path', path.relative(root, absolute), absolute], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    snapshots[name] = raw;
    provenance[name] = {
      rawSha256: digest(raw), rawByteLength: raw.length,
      rawCrlfCount: (raw.toString('utf8').match(/\r\n/g) || []).length,
      canonicalSha256: digest(canonical), canonicalGitOid,
    };
  }
  return { snapshots, provenance };
}

test('actual isolated S137 DOM, keyboard, errors, reset, failure, unknown and CSP observations', { timeout: 120000 }, async (t) => {
  const before = hashes();
  const source = sourceBytes();
  const report = {
    schemaVersion: 1, cardId: 'A-S137', workerId: 'worker-A-S137', mode: 'portable-synthetic',
    observedAtUtc: new Date().toISOString(), helperSha256, node: process.version,
    playwright: require(path.join(root, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version,
    sourceProvenance: source.provenance, rawLessonHashesBefore: before,
    observations: [], checks: [], failures: [], pageErrors: [], consoleErrors: [], remoteRequests: [], localRequests: [],
    lessonAndExistingProofUnchanged: false, awaitedCleanupCompleted: false,
    workerProbePerformed: false, workerSrcBehaviorValidated: false, realServiceWorkerValidated: false,
    actualCacheValidated: false, actualAPIValidated: false, actualBackendValidated: false,
    productionNode24Validated: false, sourceParentComplete: false, extraKanoCredits: 0,
    scope: 'Fixed fictional bundle/service-worker/cache/asset/API/state/backend/version DATA ONLY. Real DOM/CSP observations are file-origin tooling evidence, not native service-worker or Azure proof.',
    lifecycleLimit: 'Published helper retains known unattended context/page/cleanup limitations; inactive recovery prototype is unqualified.',
  };
  const check = (name, action) => t.test(name, async () => {
    try {
      await action();
      report.checks.push({ name, passed: true });
    } catch (error) {
      report.checks.push({ name, passed: false });
      report.failures.push({ name, message: error.message });
      throw error;
    }
  });
  let session;
  let category = 'normal';
  try {
    assert.equal(report.node, 'v22.23.4');
    assert.equal(report.playwright, '1.56.1');
    session = await openIsolatedLesson(path.join('learning', 'S137', 'index.html'));
    const page = session.page;
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(10000);
    report.browserVersion = session.browserVersion;
    assert.equal(report.browserVersion, '156.0.4314.50');
    page.on('pageerror', (error) => report.pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') report.consoleErrors.push({ category, text: message.text() });
    });
    page.on('request', (request) => {
      if (/^(https?|wss?):/i.test(request.url())) report.remoteRequests.push(request.url());
      else report.localRequests.push(request.url());
    });
    await page.reload({ waitUntil: 'load' });
    const key = async (action, keyName = 'Enter') => {
      await page.locator(`#${action}-button`).focus();
      await page.keyboard.press(keyName);
    };
    const observe = async (name, details = {}) => {
      const actual = await page.evaluate(() => ({
        fields: Object.fromEntries([
          'phase', 'current-run', 'fixture', 'bundle', 'cache-lineage', 'backend', 'warmup',
          'api-observation', 'asset-observation', 'state-observation', 'candidate-render',
          'outcome', 'measurement-summary', 'safe-view', 'render-decision',
          'history-summary', 'status', 'error',
        ].map((id) => [id, document.getElementById(id)?.textContent ?? null])),
        checkRows: Array.from(document.querySelectorAll('#checks-body tr'), (row) => ({
          id: row.dataset.check, cells: Array.from(row.cells, (cell) => cell.textContent),
        })),
        retainedRuns: Array.from(document.querySelectorAll('#run-history > li > p'), (item) => item.textContent),
        acceptedActions: Array.from(document.querySelectorAll('#action-history > li'), (item) => item.textContent),
        rejectedActions: Array.from(document.querySelectorAll('#rejected-history > li'), (item) => item.textContent),
        focusedId: document.activeElement?.id ?? null,
      }));
      report.observations.push({ name, ...actual, ...details });
    };
    const reset = async () => {
      const retained = await page.locator('#run-history > li > p').allTextContents();
      const errors = await page.locator('#rejected-history > li').allTextContents();
      const accepted = await page.locator('#action-history > li').count();
      await key('reset', 'Space');
      assert.equal(await page.locator('#phase').textContent(), 'idle');
      assert.equal(await page.locator('#preset').inputValue(), 'preserved');
      assert.equal(await page.locator('#preset').evaluate((element) => document.activeElement === element), true);
      assert.equal(await page.locator('#error').textContent(), '');
      assert.equal(await page.locator('#outcome').textContent(), 'NOT MEASURED');
      assert.deepEqual(await page.locator('#run-history > li > p').allTextContents(), retained);
      assert.deepEqual(await page.locator('#rejected-history > li').allTextContents(), errors);
      assert.equal(await page.locator('#action-history > li').count(), accepted + 1);
    };
    const conduct = async (presetId) => {
      await page.locator('#preset').selectOption(presetId);
      await key('pin');
      assert.equal(await page.locator('#phase').textContent(), 'pinned');
      assert.equal(await page.locator('#bundle').textContent(), 'teaching-client-v1');
      assert.equal(await page.locator('#backend').textContent(), 'teaching-backend-v1');
      await key('cutover', 'Space');
      assert.equal(await page.locator('#phase').textContent(), 'cutover');
      assert.equal(await page.locator('#bundle').textContent(), 'teaching-client-v1');
      assert.equal(await page.locator('#backend').textContent(), 'teaching-backend-v2');
      assert.match(await page.locator('#warmup').textContent(), /HTTP 200.*DATA ONLY.*not compatibility proof/);
      assert.equal(await page.locator('#outcome').textContent(), 'NOT MEASURED');
      await key('measure');
      assert.equal(await page.locator('#phase').textContent(), 'measured');
      assert.equal(await page.locator('#error').textContent(), '');
      assert.equal(await page.locator('#outcome').textContent(), EXPECTATIONS[presetId].verdict);
      const cells = await page.locator('#checks-body tr td:nth-child(2)').allTextContents();
      assert.equal(cells.length, 7);
      for (const [field, value] of [['passed', 'PASS'], ['failed', 'FAIL'], ['unknown', 'UNKNOWN']]) {
        assert.equal(cells.filter((cell) => cell === value).length, EXPECTATIONS[presetId][field]);
      }
      assert.equal(await page.locator('#safe-view').textContent(), 'Paper star × 2');
      assert.match(await page.locator('#render-decision').textContent(),
        EXPECTATIONS[presetId].verdict === 'POSITIVE' ? /allowed for this fictional record only/ : /withheld; safe old view retained/);
    };

    await check('exact banner, labeled controls, live status, visible Tab focus and Enter/Space actions', async () => {
      assert.equal(await page.title(), 'S137 - Old bundle compatibility rehearsal');
      assert.equal(await page.locator('.banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.getByLabel('Fixed old-client observations', { exact: true }).count(), 1);
      assert.equal(await page.locator('#preset option').count(), 8);
      assert.equal(await page.getByRole('alert').count(), 1);
      assert.equal(await page.locator('#status').getAttribute('role'), 'status');
      assert.equal(await page.locator('#measure-button').getAttribute('aria-disabled'), 'true');
      await key('measure');
      assert.match(await page.locator('#error').textContent(), /ERR_S137_ORDER/);
      assert.equal(await page.locator('#phase').textContent(), 'idle');
      assert.equal(await page.locator('#action-history > li').count(), 0);
      await page.locator('#preset').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#pin-button').evaluate((element) => document.activeElement === element), true);
      const focus = await page.locator('#pin-button').evaluate((element) => ({
        outlineStyle: getComputedStyle(element).outlineStyle,
        outlineWidth: getComputedStyle(element).outlineWidth,
      }));
      assert.deepEqual(focus, { outlineStyle: 'solid', outlineWidth: '3px' });
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#phase').textContent(), 'pinned');
      await reset();
      await observe('actual-keyboard-order-alert-reset', { focus });
    });

    await check('tampered preset, typed model guards and rejected action order leave accepted history unchanged', async () => {
      const accepted = await page.locator('#action-history > li').count();
      await page.evaluate(() => {
        const option = document.createElement('option');
        option.value = 'arbitrary-not-fixed';
        option.textContent = 'Test-only invalid input';
        option.id = 'invalid-preset-probe';
        document.getElementById('preset').appendChild(option);
        document.getElementById('preset').value = option.value;
      });
      await key('pin');
      assert.match(await page.locator('#error').textContent(), /ERR_S137_INPUT/);
      assert.equal(await page.locator('#phase').textContent(), 'idle');
      assert.equal(await page.locator('#action-history > li').count(), accepted);
      assert.equal(await page.locator('#preset').evaluate((element) => document.activeElement === element), true);
      const guardCodes = await page.evaluate(() => {
        const state = S137.createState();
        const codes = [];
        for (const [input, action] of [
          [state, { type: 'pin', presetId: 1 }],
          [{ ...state, phase: 'measured' }, { type: 'reset' }],
          [state, { type: 'pin', presetId: 'preserved', ignored: true }],
        ]) {
          try { S137.execute(input, action); codes.push('unexpected acceptance'); }
          catch (error) { codes.push(error.code); }
        }
        document.getElementById('invalid-preset-probe').remove();
        document.getElementById('preset').value = 'preserved';
        return codes;
      });
      assert.deepEqual(guardCodes, ['ERR_S137_INPUT', 'ERR_S137_STATE', 'ERR_S137_INPUT']);
      await key('pin');
      const pinnedActions = await page.locator('#action-history > li').count();
      await key('measure');
      assert.match(await page.locator('#error').textContent(), /ERR_S137_ORDER/);
      assert.equal(await page.locator('#error').evaluate((element) => document.activeElement === element), true);
      assert.equal(await page.locator('#action-history > li').count(), pinnedActions);
      assert.equal(await page.locator('#phase').textContent(), 'pinned');
      await observe('strict-input-state-order-rejections', { guardCodes });
      await reset();
    });

    for (const presetId of Object.keys(EXPECTATIONS)) {
      await check(`actual measured ${presetId} fixture with unchanged old bundle`, async () => {
        await conduct(presetId);
        if (presetId === 'api-shape-break') assert.match(await page.locator('[data-check="old-api-contract"]').textContent(), /FAIL.*label=undefined; stock=string/);
        if (presetId === 'missing-old-asset') assert.match(await page.locator('#asset-observation').textContent(), /404/);
        if (presetId === 'changed-old-asset') assert.match(await page.locator('#asset-observation').textContent(), /200.*incompatible-js-v2/);
        if (presetId === 'lost-client-state') assert.match(await page.locator('#state-observation').textContent(), /ui-draft-v2.*quantity":0/);
        if (presetId === 'corrupt-render') assert.match(await page.locator('#candidate-render').textContent(), /"label":""/);
        if (presetId === 'backend-only') assert.match(await page.locator('#measurement-summary').textContent(), /2 PASS \/ 0 FAIL \/ 5 UNKNOWN/);
        if (presetId === 'cache-unknown') assert.match(await page.locator('#cache-lineage').textContent(), /UNKNOWN/);
        await observe(`actual-measured-${presetId}`);
        await reset();
      });
    }

    await check('real native-prototype reset survives a shadow attempt and retains positive/negative/unknown history at the run bound', async () => {
      let shadowed = false;
      for (let run = 9; run <= 12; run += 1) {
        await conduct('preserved');
        if (run === 9) {
          shadowed = await page.evaluate(() => {
            const button = document.createElement('button');
            button.type = 'button';
            button.name = 'reset';
            button.id = 'reset-shadow-probe';
            button.hidden = true;
            document.getElementById('operator-form').appendChild(button);
            return typeof document.getElementById('operator-form').reset !== 'function';
          });
          assert.equal(shadowed, true);
        }
        await reset();
        if (run === 9) await page.locator('#reset-shadow-probe').evaluate((element) => element.remove());
      }
      const retained = await page.locator('#run-history > li > p').allTextContents();
      const accepted = await page.locator('#action-history > li').count();
      assert.equal(retained.length, 12);
      assert.equal(retained.filter((text) => text.includes('NEGATIVE')).length, 5);
      assert.equal(retained.filter((text) => text.includes('UNKNOWN -')).length, 2);
      assert.equal(await page.locator('#pin-button').getAttribute('aria-disabled'), 'true');
      await key('pin');
      assert.match(await page.locator('#error').textContent(), /ERR_S137_LIMIT/);
      assert.equal(await page.locator('#action-history > li').count(), accepted);
      assert.deepEqual(await page.locator('#run-history > li > p').allTextContents(), retained);
      await observe('retained-positive-negative-unknown-reset-envelope', { formResetWasShadowed: shadowed });
      for (let i = 0; i < 14; i += 1) await key('measure');
      assert.equal(await page.locator('#rejected-history > li').count(), 12);
      assert.equal(await page.locator('#action-history > li').count(), accepted);
      assert.deepEqual(await page.locator('#run-history > li > p').allTextContents(), retained);
      const summary = page.locator('#run-history details > summary').first();
      await summary.focus();
      await page.keyboard.press('Enter');
      assert.equal(await summary.evaluate((element) => element.parentElement.open), true);
      await observe('bounded-error-window-and-keyboard-retained-details');
    });

    await check('actual CSP denies unapproved inline script and inline style without any worker/network probe', async () => {
      category = 'controlled-csp-probe';
      await page.evaluate(() => {
        globalThis.__s137Csp = { inlineScriptRan: false, inlineStyleApplied: false, violations: [] };
        document.addEventListener('securitypolicyviolation', (event) => {
          globalThis.__s137Csp.violations.push({
            directive: event.effectiveDirective, blockedURI: event.blockedURI,
            disposition: event.disposition, policy: event.originalPolicy,
          });
        });
        const script = document.createElement('script');
        script.id = 'csp-inline-probe';
        script.textContent = 'globalThis.__s137Csp.inlineScriptRan = true;';
        document.head.appendChild(script);
        const span = document.createElement('span');
        span.id = 'csp-style-probe';
        span.textContent = 'Test-only CSP probe';
        span.setAttribute('style', 'position:fixed');
        document.body.appendChild(span);
        globalThis.__s137Csp.inlineStyleApplied = getComputedStyle(span).position === 'fixed';
      });
      await page.waitForFunction(() => globalThis.__s137Csp.violations.length >= 2, null, { timeout: 5000 });
      report.csp = await page.evaluate(() => globalThis.__s137Csp);
      await observe('actual-csp-observations-before-assertions', { csp: report.csp });
      assert.equal(report.csp.inlineScriptRan, false);
      assert.equal(report.csp.inlineStyleApplied, false);
      assert.equal(report.csp.violations.some((entry) => entry.directive.startsWith('script-src') && entry.blockedURI === 'inline' && entry.disposition === 'enforce'), true);
      assert.equal(report.csp.violations.some((entry) => entry.directive.startsWith('style-src') && entry.disposition === 'enforce'), true);
      assert.equal(report.workerProbePerformed, false);
      await page.locator('#csp-inline-probe').evaluate((element) => element.remove());
      await page.locator('#csp-style-probe').evaluate((element) => element.remove());
      await observe('actual-csp-denial-declared-only-worker-scope');
    });

    await check('actual blocked model dependency fails closed, invalid helper path rejects and local reload recovers', async () => {
      category = 'controlled-dependency-failure';
      const abortModel = (route) => route.abort('blockedbyclient');
      await page.route('**/model.js', abortModel);
      try {
        await page.reload({ waitUntil: 'load' });
        assert.equal(await page.locator('#phase').textContent(), 'unavailable');
        assert.match(await page.locator('#error').textContent(), /model failed to load/);
        assert.match(await page.locator('#outcome').textContent(), /UNAVAILABLE - no compatibility claim/);
        assert.equal(await page.locator('#operator-form button:disabled').count(), 4);
        assert.equal(await page.locator('#preset').isDisabled(), true);
        assert.equal(await page.locator('#run-history > li').count(), 0);
        await observe('actual-model-load-failure-no-native-claim');
        await assert.rejects(openIsolatedLesson(path.join('learning', 'S137', 'absent-entry.html')), (error) => error.code === 'ERR_LESSON_PATH');
      } finally {
        await page.unroute('**/model.js', abortModel);
      }
      category = 'normal';
      await page.reload({ waitUntil: 'load' });
      assert.equal(await page.locator('#phase').textContent(), 'idle');
      assert.equal(await page.locator('#error').textContent(), '');
      assert.equal(await page.locator('#preset').isDisabled(), false);
      assert.equal(await page.locator('#run-history > li').count(), 0, 'Documented reload is not persistent storage.');
      await observe('actual-local-reload-recovery');
    });

    await check('no page exceptions or remote requests and lesson/earlier proof remain byte-for-byte read-only', async () => {
      assert.deepEqual(report.pageErrors, []);
      assert.deepEqual(report.remoteRequests, []);
      assert.deepEqual(report.consoleErrors.filter((entry) => entry.category === 'normal'), []);
      assert.equal(report.localRequests.some((url) => url.endsWith('/model.js')), true);
      assert.equal(report.localRequests.some((url) => url.endsWith('/app.js')), true);
      assert.deepEqual(hashes(), before);
      report.lessonAndExistingProofUnchanged = true;
      await observe('read-only-lesson-and-existing-proof-no-remote-request');
    });
    assert.deepEqual(report.failures, []);
  } catch (error) {
    if (report.failures.length === 0) report.failures.push({ name: 'browser execution', message: error.message });
    throw error;
  } finally {
    try {
      if (session) {
        await session.close();
        report.awaitedCleanupCompleted = true;
      }
    } catch (error) {
      report.failures.push({ name: 'awaited cleanup', message: error.message });
      throw error;
    } finally {
      report.success = report.failures.length === 0 && report.awaitedCleanupCompleted && report.lessonAndExistingProofUnchanged;
      assert.deepEqual(hashes(), before, 'Source and existing proof must remain READ-ONLY before deliberate capture.');
      if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
        const directory = path.join(__dirname, 'evidence', 'browser');
        fs.mkdirSync(directory, { recursive: true });
        const name = `capture-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}`;
        const capture = path.join(directory, name);
        fs.mkdirSync(capture);
        fs.mkdirSync(path.join(capture, 'sources'));
        for (const [file, bytes] of Object.entries(source.snapshots)) {
          fs.writeFileSync(path.join(capture, 'sources', `${file}.txt`), bytes, { flag: 'wx' });
        }
        fs.writeFileSync(path.join(capture, 'observations.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
        console.log(`Deliberate browser capture: ${name}; success=${report.success}`);
      } else {
        assert.deepEqual(hashes(), before, 'Normal verification must remain READ-ONLY, including archived proof.');
      }
    }
  }
});
