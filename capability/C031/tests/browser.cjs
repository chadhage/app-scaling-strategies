'use strict';

// Real isolated headless Edge observation of capability\C031\index.html through the unchanged published helper.
// Read-only by default. Only an exact CAPTURE_BROWSER_EVIDENCE=1 appends one new unique evidence directory.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const execute = promisify(execFile);
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const banner = 'Training rehearsal - synthetic data - not a live Azure result';
const order = ['', 'c034-closed-history', 'c034-held-snapshot', 'fleet-baseline', 'negative-unchanged-flood', 'negative-replayed-v2-request',
  'negative-duplicated-trace', 'negative-stale-cached-ack', 'negative-out-of-order'];
const record = {
  schema: 'C031-browser-proof/1', cardId: 'C031', startedAtUtc: new Date().toISOString(), outcome: 'not-run',
  meaning: 'Actual static DOM and keyboard verification of local fictional saved traces, not a live migration, user journey or Azure result.',
  testRuntime: process.version, productionNode24Validated: false, liveAzureResult: false, helperPatched: false, unsafeFlagsUsed: false,
  packagesDownloaded: 0, cloudRuns: 0, spend: 0, checks: [],
  sourceSha256: Object.fromEntries(['index.html', 'page.js', 'evaluator.js', 'saved.js', 'style.css'].map((name) => [name, sha(path.join(root, name))])),
  cleanup: { browserClosed: false, exactHelperSessionRemoved: false, exactOwnedProfileRemoved: false, exactOwnedEdgeGone: false }
};
const checked = (name, observed) => { record.checks.push({ name, passed: true, observed }); console.log(`PASS ${name}`); };
async function signature(pid) {
  const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', path.join(repository, 'capability', 'C033', 'tests', 'signed-edge.ps1')];
  if (pid) args.push('-CallerNodePid', String(pid));
  return JSON.parse((await execute('pwsh.exe', args, { timeout: 20000, windowsHide: true, maxBuffer: 32768 })).stdout);
}
async function ownedBrowser(pid, action = 'profile') {
  return JSON.parse((await execute('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
    path.join(repository, 'capability', 'C029', 'tests', 'owned-browser.ps1'),
    '-CallerNodePid', String(process.pid), '-BrowserPid', String(pid), '-Action', action],
  { timeout: 20000, windowsHide: true, maxBuffer: 32768 })).stdout);
}
async function main() {
  let session;
  let profile;
  const failures = [];
  try {
    assert.match(process.version, /^v22\./);
    record.playwrightVersion = require(path.join(repository, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
    assert.equal(record.playwrightVersion, '1.56.1');
    const helper = path.join(repository, 'testing', 'browser', 'isolated.cjs');
    record.helperRawSha256 = sha(helper);
    assert.equal(record.helperRawSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
    record.installedSignature = await signature();
    const { openIsolatedLesson } = require(helper);
    const runtime = path.join(repository, '.git', 'kanban-orchestrator', 'browser-runtime');
    const before = new Set(fs.readdirSync(runtime).filter((name) => /^session-[0-9a-f-]{36}$/.test(name)));
    session = await openIsolatedLesson(path.join('capability', 'C031', 'index.html'));
    const created = fs.readdirSync(runtime).filter((name) => /^session-[0-9a-f-]{36}$/.test(name) && !before.has(name));
    assert.equal(created.length, 1, 'Only the exact newly created helper session is attributable; no sibling cleanup.');
    record.actualHelperSession = path.join(runtime, created[0]);
    record.browserVersion = session.browserVersion;
    assert.match(record.browserVersion, /^156\./);
    record.actualSignedEdge = await signature(process.pid);
    assert.equal(record.actualSignedEdge.authenticodeStatus, 'Valid');
    assert.equal(record.actualSignedEdge.fileVersion, record.browserVersion);
    profile = await ownedBrowser(record.actualSignedEdge.actualOwnedBrowserPid);
    checked('actual Microsoft-signed Edge 156 / Node 22 / offline Playwright 1.56.1 and unchanged isolated helper', {
      actualBrowserPid: profile.actualBrowserPid, browserVersion: record.browserVersion,
      authenticodeStatus: record.actualSignedEdge.authenticodeStatus, actualNodePid: process.pid
    });
    const { page } = session;
    page.setDefaultTimeout(5000);
    const requests = [];
    const errors = [];
    page.on('request', (request) => requests.push({ url: request.url(), method: request.method() }));
    page.on('pageerror', (error) => errors.push(error.message));
    await page.reload({ waitUntil: 'load', timeout: 10000 });
    const text = (id) => page.locator(`#${id}`).textContent();
    const state = () => page.locator('#status').getAttribute('data-state');
    const focused = () => page.evaluate(() => document.activeElement.id);
    const rows = () => page.locator('#clients > tr').count();
    const press = async (id, key) => { await page.locator(`#${id}`).focus(); assert.equal(await focused(), id); await page.keyboard.press(key); };
    const choose = async (value) => {
      await page.locator('#source-id').focus();
      assert.equal(await focused(), 'source-id');
      for (let guard = 0; guard < 12 && await page.locator('#source-id').inputValue() !== value; guard++) {
        const current = order.indexOf(await page.locator('#source-id').inputValue());
        await page.keyboard.press(order.indexOf(value) > current ? 'ArrowDown' : 'ArrowUp');
      }
      assert.equal(await page.locator('#source-id').inputValue(), value);
    };
    assert.equal(await text('banner'), banner);
    assert.equal(await state(), 'UNASSESSED');
    assert.equal(await rows(), 0);
    assert.equal(await text('rate'), 'No verified denominator yet.');
    checked('actual initial static DOM has the exact training banner, no rows and no default success', banner);

    await press('evaluate', 'Enter');
    assert.equal(await state(), 'REJECTED');
    assert.equal(await text('error'), 'UNKNOWN_SAVED_ID');
    assert.equal(await text('rate'), 'No success rate: rejected input or unknown saved set.');
    checked('actual Enter with no saved set rejects and shows no success rate', await text('error'));

    await choose('fleet-baseline');
    await page.keyboard.press('Tab');
    assert.equal(await focused(), 'evaluate');
    const focus = await page.locator('#evaluate').evaluate((element) => ({ focusVisible: element.matches(':focus-visible'), outline: getComputedStyle(element).outlineWidth }));
    assert.equal(focus.focusVisible, true);
    assert.equal(focus.outline, '3px');
    await page.keyboard.press('Enter');
    assert.equal(await state(), 'EVALUATED');
    assert.equal(await text('rate'), 'Migration success rate: 3 of 8 = 37.50%');
    assert.match(await text('numerator'), /^Numerator 3: clients with an ACTUAL_TRANSITION/);
    assert.match(await text('denominator'), /^Denominator 8: eligible clients that started on the old version 1\.0\.0/);
    assert.match(await text('counts'), /unchanged 2 .* \| failed 1 \| unknown 1 \| not transitioned yet 3 \| 10 clients/);
    assert.equal(await rows(), 10);
    const classes = await page.locator('#clients > tr').evaluateAll((items) => items.map((item) => item.dataset.classification));
    assert.deepEqual(classes, ['ACTUAL_TRANSITION', 'ACTUAL_TRANSITION', 'ACTUAL_TRANSITION', 'NOT_TRANSITIONED_YET', 'NOT_TRANSITIONED_YET',
      'NOT_TRANSITIONED_YET', 'FAILED_OR_UNKNOWN', 'FAILED_OR_UNKNOWN', 'UNCHANGED', 'UNCHANGED']);
    checked('actual ArrowDown/Tab/Enter chooses and evaluates the baseline: 3 of 8, spelled out, with visible focus and the classification table', { rate: await text('rate'), focus });

    await choose('negative-unchanged-flood');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    assert.equal(await focused(), 'compare');
    await page.keyboard.press('Space');
    assert.equal(await text('rate'), 'Migration success rate: 3 of 8 = 37.50%');
    assert.match(await text('counts'), /unchanged 42 \(new version only, outside the rate\) \| failed 1 \| unknown 1/);
    const comparison = await text('comparison');
    assert.match(comparison, /Rate raised: no\. Numerator increased: no\. Decision: NOT_RAISED\./);
    assert.equal(await rows(), 50);
    checked('actual Space compares the flood of 40 unchanged v2 clients: still 3 of 8, 42 unchanged, not raised', comparison.slice(0, 220));

    const negatives = {};
    for (const [value, fraction, code] of [['negative-replayed-v2-request', '3 of 10 = 30.00%', 'UNACKNOWLEDGED_NEW_VERSION_REQUEST'],
      ['negative-duplicated-trace', '3 of 9 = 33.33%', 'CONFLICTING_DUPLICATE_TRACES'], ['negative-stale-cached-ack', '3 of 9 = 33.33%', 'STALE_ACKNOWLEDGMENT'],
      ['negative-out-of-order', '3 of 11 = 27.27%', 'ACK_BEFORE_REQUEST']]) {
      await choose(value);
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      assert.equal(await text('rate'), `Migration success rate: ${fraction}`);
      assert.match(await text('comparison'), /Rate raised: no\. Numerator increased: no\. Decision: NOT_RAISED\./);
      assert.ok((await page.locator(`#clients > tr[data-reason="${code}"]`).count()) >= 1, code);
      negatives[value] = { rate: await text('rate'), code };
    }
    checked('actual keyboard comparison of replay, duplicates, stale acknowledgment and out-of-order: never raised, exact reason codes shown', negatives);

    await choose('c034-closed-history');
    await press('evaluate', 'Enter');
    assert.equal(await text('rate'), 'Migration success rate: 3 of 7 = 42.86%');
    assert.match(await text('counts'), /failed 1 \| unknown 3 \| not transitioned yet 0 \| 7 clients/);
    assert.equal(await page.locator('#clients > tr[data-reason="SUMMARY_ONLY_NO_TRACE"]').count(), 1);
    assert.equal(await page.locator('#clients > tr[data-failure="FAILED"]').count(), 1);
    assert.match(await text('provenance'), /"kind": "c034-saved-trace-adapted-read-only"/);
    const closed = await page.locator('#clients > tr').evaluateAll((items) => items.map((item) => [item.dataset.client, item.dataset.classification, item.dataset.reason]));
    await choose('c034-held-snapshot');
    await press('evaluate', 'Space');
    assert.equal(await text('rate'), 'Migration success rate: 1 of 2 = 50.00%');
    assert.equal(await page.locator('#clients > tr[data-classification="NOT_TRANSITIONED_YET"]').count(), 1);
    checked('actual keyboard evaluation of the exact saved C034 traces: 3 of 7 with failed, interrupted and summary-only kept, then 1 of 2 with the held original', closed);

    await page.locator('#clients > tr').first().locator('summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#clients > tr').first().locator('details').evaluate((element) => element.open), true);
    assert.match(await page.locator('#clients > tr').first().locator('pre').textContent(), /"action": "REQUEST"/);
    checked('actual Enter on the saved-actions summary opens the exact saved events of a client', true);

    const retained = await page.locator('#inspection-history > li').count();
    await press('reset', 'Space');
    assert.equal(await focused(), 'source-id');
    assert.equal(await state(), 'UNASSESSED');
    assert.equal(await rows(), 0);
    assert.equal(await text('rate'), 'No verified denominator yet.');
    assert.equal(await page.locator('#inspection-history > li').count(), retained);
    assert.match(await page.locator('#inspection-history').textContent(), /negative-out-of-order: 3\/11 = 27\.27%.*c034-held-snapshot: 1\/2 = 50\.00%/s);
    checked('actual Space reset clears only the display, returns focus to the picker and retains the operation history', retained);

    for (let count = retained; count < 16; count++) await press('evaluate', 'Enter');
    for (const id of ['evaluate', 'compare']) assert.equal(await page.locator(`#${id}`).isDisabled(), true);
    assert.match(await text('history-limit'), /refused, not dropped/);
    assert.equal(await page.locator('#inspection-history > li').count(), 16);
    checked('actual sixteen-operation bound disables evaluation and evicts nothing', 16);

    const csp = await page.evaluate(async () => {
      async function violation(operation) {
        const event = new Promise((resolve) => {
          const listener = (value) => { clearTimeout(timer); document.removeEventListener('securitypolicyviolation', listener); resolve({ effectiveDirective: value.effectiveDirective, blockedURI: value.blockedURI }); };
          const timer = setTimeout(() => { document.removeEventListener('securitypolicyviolation', listener); resolve({ effectiveDirective: null }); }, 1500);
          document.addEventListener('securitypolicyviolation', listener);
        });
        await operation();
        return event;
      }
      const script = document.createElement('script');
      script.textContent = 'globalThis.__c031InlineRan = true;';
      const inline = await violation(async () => document.head.appendChild(script));
      script.remove();
      let connected = false;
      const connection = await violation(async () => { try { await fetch(location.href); connected = true; } catch { connected = false; } });
      const form = document.createElement('form');
      form.action = location.href;
      form.method = 'get';
      document.body.appendChild(form);
      const submission = await violation(async () => form.requestSubmit());
      form.remove();
      return { inline, connection, submission, connected, inlineRan: Boolean(globalThis.__c031InlineRan) };
    });
    assert.match(csp.inline.effectiveDirective, /^script-src/);
    assert.equal(csp.inline.blockedURI, 'inline');
    assert.equal(csp.inlineRan, false);
    assert.equal(csp.connection.effectiveDirective, 'connect-src');
    assert.equal(csp.connected, false);
    assert.equal(csp.submission.effectiveDirective, 'form-action');
    checked('actual enforced CSP blocks inline code, connections and forms', csp);
    assert.deepEqual(errors, []);
    assert.ok(requests.length > 0);
    assert.ok(requests.every((request) => request.method === 'GET' && request.url.startsWith('file:')), 'only local file GETs');
    record.pageErrors = errors;
    record.requestCount = requests.length;
    record.outcome = 'passed';
  } catch (error) {
    failures.push(error);
    record.outcome = 'failed';
    record.error = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    if (session) {
      try { await session.close(); record.cleanup.browserClosed = true; } catch (error) { failures.push(error); }
    }
    if (profile) {
      record.cleanup.exactHelperSessionRemoved = !fs.existsSync(record.actualHelperSession);
      record.cleanup.exactOwnedProfileRemoved = !fs.existsSync(profile.actualIsolatedProfile);
      try { record.cleanup.exactOwnedEdgeGone = (await ownedBrowser(profile.actualBrowserPid, 'closed')).processGone; } catch (error) { failures.push(error); }
    }
    if (!Object.values(record.cleanup).every((value) => value === true)) failures.push(new Error('Actual exact owned cleanup is incomplete or unobserved.'));
    if (failures.length) record.outcome = 'failed';
    record.completedAtUtc = new Date().toISOString();
    record.captureMode = capture ? 'Exact deliberate CAPTURE_BROWSER_EVIDENCE=1, unique owned append.' : 'Read-only: no evidence byte is written.';
    if (capture) {
      const directory = path.join(root, 'evidence', 'browser', `browser-${randomUUID()}`);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, 'summary.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
      record.captured = path.relative(repository, directory);
    }
    console.log(JSON.stringify({ cardId: 'C031', outcome: record.outcome, actualBrowserVersion: record.browserVersion, checks: record.checks.length,
      cleanup: record.cleanup, captured: record.captured || false }));
  }
  if (failures.length) throw new AggregateError(failures, 'C031 actual browser verification failed; the raw failure is retained.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
