'use strict';

// Real isolated headless Edge observation of capability\C040\index.html through the unchanged published helper.
// Read-only by default. Only an exact CAPTURE_BROWSER_EVIDENCE=1 appends one new unique evidence directory (summary plus DOM snapshots).
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
const T = require(path.join(root, 'tables.js'));
const saved = require(path.join(root, 'saved.js'));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const banner = 'Training rehearsal - synthetic data - not a live Azure result';
const catalog = T.catalog(saved);
const expectedAttention = (id, tableId) => catalog.tables(id)[tableId].rows.filter((row) => row.attention).length;
const record = {
  schema: 'C040-browser-proof/1', cardId: 'C040', startedAtUtc: new Date().toISOString(), outcome: 'not-run',
  meaning: 'Actual static DOM and keyboard verification of local saved producer outputs, not a live Azure result, a user journey or an SLA.',
  testRuntime: process.version, productionNode24Validated: false, liveAzureResult: false, helperPatched: false, unsafeFlagsUsed: false,
  packagesDownloaded: 0, cloudRuns: 0, spend: 0, checks: [], scans: [], snapshots: {},
  sourceSha256: Object.fromEntries(['index.html', 'page.js', 'tables.js', 'saved.js', 'style.css'].map((name) => [name, sha(fs.readFileSync(path.join(root, name)))])),
  cleanup: { browserClosed: false, exactHelperSessionRemoved: false, exactOwnedProfileRemoved: false, exactOwnedEdgeGone: false }
};
const snapshotText = {};
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
const sessions = (runtime) => fs.readdirSync(runtime).filter((name) => /^session-[0-9a-f-]{36}$/.test(name));
async function main() {
  let session;
  let profile;
  const failures = [];
  try {
    assert.match(process.version, /^v22\./);
    record.playwrightVersion = require(path.join(repository, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
    assert.equal(record.playwrightVersion, '1.56.1');
    const helper = path.join(repository, 'testing', 'browser', 'isolated.cjs');
    record.helperRawSha256 = sha(fs.readFileSync(helper));
    assert.equal(record.helperRawSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
    record.installedSignature = await signature();
    const { openIsolatedLesson } = require(helper);
    const runtime = path.join(repository, '.git', 'kanban-orchestrator', 'browser-runtime');
    // A peer browser starting at the same moment would make the newly created helper session ambiguous (L-0040): retry, never guess.
    let created = [];
    for (let attempt = 0; attempt < 4 && created.length !== 1; attempt++) {
      if (session) { await session.close(); session = undefined; await new Promise((resolve) => setTimeout(resolve, 15000)); }
      const existing = new Set(sessions(runtime));
      session = await openIsolatedLesson(path.join('capability', 'C040', 'index.html'));
      created = sessions(runtime).filter((name) => !existing.has(name));
    }
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
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.reload({ waitUntil: 'load', timeout: 10000 });
    const text = (id) => page.locator(`#${id}`).textContent();
    const focused = () => page.evaluate(() => document.activeElement.id);
    const press = async (id, key) => { await page.locator(`#${id}`).focus(); assert.equal(await focused(), id); await page.keyboard.press(key); };
    const pickByKeys = async (id, order, value) => {
      await page.locator(`#${id}`).focus();
      assert.equal(await focused(), id);
      for (let guard = 0; guard < 24 && await page.locator(`#${id}`).inputValue() !== value; guard++) {
        const current = order.indexOf(await page.locator(`#${id}`).inputValue());
        await page.keyboard.press(order.indexOf(value) > current ? 'ArrowDown' : 'ArrowUp');
      }
      assert.equal(await page.locator(`#${id}`).inputValue(), value);
    };
    await page.evaluate(() => {
      window.__announcements = 0;
      new MutationObserver((list) => { window.__announcements += list.length; }).observe(document.getElementById('status'), { childList: true, characterData: true, subtree: true });
    });
    const announced = () => page.evaluate(() => window.__announcements);
    // The global invariant read back from the real DOM after EVERY action (L-0118): unique ids, counts add up, no failed or unknown row missing.
    const scan = async (label, setId, tableId) => {
      const found = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
        const rows = [...document.querySelectorAll('#rows > tr')];
        const summary = document.getElementById('summary');
        return {
          duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index), idCount: ids.length,
          countsSum: [...document.querySelectorAll('#status-counts li')].reduce((sum, item) => sum + Number(item.dataset.count), 0),
          total: Number(summary.dataset.total), shown: Number(summary.dataset.shown), rows: rows.length, state: summary.dataset.state,
          attention: rows.filter((row) => row.dataset.attention === 'true').length,
          unlabelled: rows.filter((row) => row.dataset.attention === 'true' && !/needs attention/.test(row.textContent)).length,
          error: document.getElementById('error').textContent, rowIds: rows.map((row) => row.id)
        };
      });
      assert.deepEqual(found.duplicateIds, [], `${label}: repeated ids`);
      assert.equal(found.countsSum, found.total, `${label}: the rendered counts add up to the total`);
      assert.equal(found.rows, found.shown, `${label}: rows rendered equal the shown number`);
      assert.equal(found.error, '', `${label}: no page alert`);
      assert.equal(found.unlabelled, 0, `${label}: every failed or unknown row carries its text label`);
      if (setId) assert.equal(found.attention, expectedAttention(setId, tableId), `${label}: every failed and unknown row is on screen`);
      record.scans.push({ label, set: setId || null, table: tableId || null, rows: found.rows, attention: found.attention, countsSum: found.countsSum, total: found.total,
        state: found.state, idCount: found.idCount, repeatedIds: found.duplicateIds.length });
      return found;
    };
    const load = async (setId, key = 'Enter') => {
      const before = await announced();
      await pickByKeys('saved-set', ['', ...catalog.ids], setId);
      await page.keyboard.press('Tab');
      assert.equal(await focused(), 'load');
      await page.keyboard.press(key);
      assert.ok(await announced() > before, 'the live region changed after loading');
    };
    const snapshot = async (name) => {
      const html = await page.locator('main').evaluate((element) => element.outerHTML);
      snapshotText[name] = html;
      record.snapshots[name] = { sha256: sha(html), bytes: Buffer.byteLength(html) };
    };

    assert.equal(await text('banner'), banner);
    assert.equal(await page.locator('#status').getAttribute('data-state'), 'UNLOADED');
    assert.equal(await page.locator('#rows > tr').count(), 0);
    assert.equal(await page.locator('#saved-set option').count(), 9);
    assert.equal(await page.locator('#tab-cohort').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#status').getAttribute('aria-live'), 'polite');
    assert.equal(await page.locator('#status').getAttribute('role'), 'status');
    assert.match(await text('summary'), /^No saved set is loaded: 0 of 0 rows/);
    checked('actual initial static DOM has the exact training banner, no rows, no default success and a live status region', banner);

    await press('load', 'Enter');
    assert.equal(await text('error'), 'UNKNOWN_SAVED_SET');
    assert.equal(await page.locator('#rows > tr').count(), 0);
    checked('actual Enter on load with no saved set rejects with a code and shows nothing', await text('error'));

    const forty = 'negative-3-failed-2-unknown-of-40';
    await load(forty);
    assert.equal(await page.locator('#status').getAttribute('data-state'), 'COMPLETE');
    assert.match(await text('summary'), /showing 45 of 45 rows, COMPLETE\. Status counts: ACTUAL_TRANSITION 40, UNCHANGED 0, NOT_TRANSITIONED_YET 0, FAILED 3, UNKNOWN 2, NOT_SAVED 0; together 45 of 45 rows\./);
    const focus = await page.locator('#load').evaluate((element) => ({ focusVisible: element.matches(':focus-visible'), outline: getComputedStyle(element).outlineWidth }));
    assert.equal(focus.focusVisible, true);
    assert.equal(focus.outline, '3px');
    const base = await scan('cohort 40/3/2 loaded', forty, 'cohort');
    assert.deepEqual([base.rows, base.attention], [45, 5]);
    await snapshot('cohort-forty-loaded');
    checked('actual ArrowDown/Tab/Enter loads 3 failed and 2 unknown among 40 successes: 45 of 45 rows, spelled-out status counts, visible focus, ids unique', { rows: base.rows, attention: base.attention });

    let before = await announced();
    await pickByKeys('status-filter', T.filterOptions('cohort').map((option) => option.value), 'success');
    assert.ok(await announced() > before, 'the live region changed after the filter');
    const note = await text('filter-note');
    assert.match(note, /alone would have hidden 3 FAILED and 2 UNKNOWN rows: failed and unknown rows are never hidden/);
    assert.match(note, /Choose "All statuses"/);
    const filtered = await scan('cohort filter success', forty, 'cohort');
    assert.deepEqual([filtered.rows, filtered.attention], [45, 5]);
    assert.match(await text('status'), /alone would have hidden 3 FAILED and 2 UNKNOWN rows/);
    const labels = await page.locator('#rows > tr[data-attention="true"]').evaluateAll((rows) => rows.map((row) => row.children[2].textContent));
    assert.deepEqual(labels.sort(), ['FAILED (needs attention)', 'FAILED (needs attention)', 'FAILED (needs attention)', 'UNKNOWN (needs attention)', 'UNKNOWN (needs attention)']);
    await snapshot('cohort-forty-filter-success');
    checked('actual keyboard status filter "success" keeps all 5 failed and unknown rows with text labels and says what it would have hidden', { note: note.slice(0, 160), labels });

    for (const [column, direction] of [['status', 'desc'], ['reason', 'asc'], ['id', 'desc'], ['position', 'asc']]) {
      before = await announced();
      await pickByKeys('sort-column', T.columns.cohort.map((item) => item.key), column);
      await pickByKeys('sort-direction', ['asc', 'desc'], direction);
      assert.ok(await announced() > before);
      const sorted = await scan(`cohort sorted by ${column} ${direction}`, forty, 'cohort');
      assert.deepEqual([sorted.rows, sorted.attention], [45, 5]);
    }
    await pickByKeys('sort-column', T.columns.cohort.map((item) => item.key), 'status');
    await pickByKeys('sort-direction', ['asc', 'desc'], 'desc');
    const order = await page.locator('#rows > tr').evaluateAll((rows) => rows.map((row) => row.dataset.status));
    assert.deepEqual(order.slice(0, 2), ['UNKNOWN', 'UNKNOWN']);
    assert.equal(await page.locator('#head > th').nth(2).getAttribute('aria-sort'), 'descending');
    checked('actual keyboard sorting by every chosen column and direction never removes a failed or unknown row', order.slice(0, 6));

    await page.locator('#search').focus();
    before = await announced();
    await page.keyboard.type('zzz no match');
    assert.ok(await announced() > before);
    const searched = await scan('cohort search that matches nothing', forty, 'cohort');
    assert.deepEqual([searched.rows, searched.attention], [5, 5]);
    assert.match(await text('filter-note'), /^The filter "success" and search "zzz no match" hides 40 rows: ACTUAL_TRANSITION 40\./);
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    const cleared = await scan('cohort search cleared', forty, 'cohort');
    assert.equal(cleared.rows, 45);
    checked('actual typing a search that matches nothing leaves exactly the 5 failed and unknown rows and names the 40 hidden ones', { rows: searched.rows });

    const expectedCounts = {
      cohort: { ACTUAL_TRANSITION: 40, UNCHANGED: 0, NOT_TRANSITIONED_YET: 0, FAILED: 3, UNKNOWN: 2, NOT_SAVED: 0 },
      effect: { ONE_INTENDED_EFFECT: 40, DUPLICATE: 3, MISSING: 0, MISSING_OBSERVATION: 0, UNKNOWN: 2, NOT_SAVED: 0 },
      latency: { WITHIN: 40, EXCEEDED: 2, FAILED: 1, UNKNOWN: 2, NOT_SAVED: 0 }
    };
    const readCounts = () => page.locator('#status-counts > li').evaluateAll((items) => Object.fromEntries(items.map((item) => [item.dataset.status, Number(item.dataset.count)])));
    await page.locator('#tab-cohort').focus();
    assert.equal(await focused(), 'tab-cohort');
    const tabs = [];
    for (const [key, expected] of [['ArrowRight', 'effect'], ['ArrowRight', 'latency'], ['ArrowRight', 'cohort'], ['ArrowLeft', 'latency'], ['Home', 'cohort'], ['End', 'latency'], ['Home', 'cohort'], ['ArrowRight', 'effect']]) {
      before = await announced();
      await page.keyboard.press(key);
      assert.equal(await focused(), `tab-${expected}`, `${key} focuses ${expected}`);
      assert.equal(await page.locator(`#tab-${expected}`).getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator(`#tab-${expected}`).getAttribute('tabindex'), '0');
      assert.equal(await page.locator('#panel').getAttribute('aria-labelledby'), `tab-${expected}`);
      assert.ok(await announced() > before, `the live region changed after ${key}`);
      assert.equal(await page.locator('#status-filter').inputValue(), 'all', 'a table switch resets the filter');
      assert.deepEqual(await readCounts(), expectedCounts[expected]);
      const switched = await scan(`${expected} after ${key}`, forty, expected);
      assert.deepEqual([switched.rows, switched.attention], [45, 5]);
      tabs.push(`${key}->${expected}`);
    }
    const aria = await page.locator('#tablist').ariaSnapshot();
    assert.match(aria, /tablist "Result tables"/);
    assert.match(aria, /tab "Effect \(C030\)" \[selected\]/);
    assert.equal(await page.locator('[role="tab"][tabindex="0"]').count(), 1);
    await snapshot('effect-forty');
    checked('actual tablist arrow keys, Home and End wrap around, move focus and selection, and every table keeps its 5 failed and unknown rows', { tabs, aria });
    await pickByKeys('status-filter', T.filterOptions('effect').map((option) => option.value), 'success');
    const effectFilter = await scan('effect filter success', forty, 'effect');
    assert.deepEqual([effectFilter.rows, effectFilter.attention], [45, 5]);
    const effectNote = await text('filter-note');
    assert.match(effectNote, /3 DUPLICATE and 2 UNKNOWN rows/);
    await press('tab-effect', 'ArrowRight');
    assert.deepEqual(await readCounts(), expectedCounts.latency);
    await pickByKeys('status-filter', T.filterOptions('latency').map((option) => option.value), 'success');
    const latencyFilter = await scan('latency filter success', forty, 'latency');
    assert.deepEqual([latencyFilter.rows, latencyFilter.attention], [45, 5]);
    const latencyNote = await text('filter-note');
    assert.match(latencyNote, /2 EXCEEDED and 1 FAILED and 2 UNKNOWN rows/);
    checked('actual success filter on the effect and latency tables keeps the 5 failed and unknown rows too', { effect: effectNote.slice(0, 140), latency: latencyNote.slice(0, 140) });

    const historical = 'closed-history';
    await press('tab-latency', 'Home');
    await load(historical, 'Space');
    const closedCohort = await scan('closed-history cohort', historical, 'cohort');
    assert.equal(closedCohort.rows, 7);
    assert.match(await text('producer-line'), /^Producer C031 says: 3 of 7 eligible clients = 42\.86%/);
    await press('tab-cohort', 'ArrowRight');
    const closedEffect = await scan('closed-history effect', historical, 'effect');
    assert.deepEqual([closedEffect.rows, closedEffect.attention], [7, 7]);
    assert.equal(await page.locator('#rows > tr[data-flags~="NO_EFFECT_ROWS_SAVED"]').count(), 7);
    await press('tab-effect', 'ArrowRight');
    const closedLatency = await scan('closed-history latency', historical, 'latency');
    assert.deepEqual([closedLatency.rows, closedLatency.attention], [7, 5]);
    assert.match(await text('producer-line'), /^Producer C029 says: decision FAIL; originals 7: pass 2, fail 2, unknown 3\.$/);
    const exceeded = await page.locator('#rows > tr[data-status="EXCEEDED"]').evaluateAll((rows) => rows.map((row) => [...row.children].map((cell) => cell.textContent)));
    assert.deepEqual(exceeded.map((cells) => [cells[1], cells[2], cells[3]]), [['synthetic-C033-attempt-3', '1000 ms', '1118.9000000953674 ms']]);
    checked('actual Space loads the saved closed history: 7 clients (3 of 7), 7 originals without effect rows all UNKNOWN, 7 journeys with the 1118.9 ms budget miss kept', { exceeded });

    const negatives = {};
    await press('tab-latency', 'Home');
    await load('negative-empty');
    for (const tableId of T.tableIds) {
      if (tableId !== 'cohort') await press(`tab-${T.tableIds[T.tableIds.indexOf(tableId) - 1]}`, 'ArrowRight');
      const empty = await scan(`empty ${tableId}`, 'negative-empty', tableId);
      assert.equal(empty.rows, 0);
      assert.equal(empty.state, 'EMPTY');
      assert.match(await text('summary'), /no attempts recorded \(showing 0 of 0 rows\)/);
      assert.doesNotMatch(await text('status'), /all passed|100/i);
    }
    negatives.empty = 'no attempts recorded in all three tables';
    await press('tab-latency', 'Home');
    await load('negative-truncated');
    const truncated = await scan('truncated cohort', 'negative-truncated', 'cohort');
    assert.deepEqual([truncated.rows, truncated.total, truncated.state], [4, 10, 'INCOMPLETE']);
    assert.match(await text('summary'), /INCOMPLETE, showing 4 of 10 rows/);
    assert.equal(await page.locator('#status-counts > li[data-status="NOT_SAVED"]').getAttribute('data-count'), '6');
    negatives.truncated = await text('summary');
    await load('negative-duplicated-row');
    const duplicated = await scan('duplicated cohort', 'negative-duplicated-row', 'cohort');
    assert.equal(duplicated.rows, 12);
    assert.equal(await page.locator('#rows > tr[data-row-id="client-007"]').count(), 2);
    assert.equal(await page.locator('#rows > tr[data-row-id="client-007"][data-flags~="DUPLICATE_ROW"]').count(), 2);
    await snapshot('cohort-duplicated');
    negatives.duplicated = { rows: duplicated.rows, repeatedIds: duplicated.duplicateIds };
    await load('negative-unrecognised-status');
    await scan('unrecognised cohort', 'negative-unrecognised-status', 'cohort');
    assert.equal(await page.locator('#rows > tr[data-flags~="UNRECOGNISED_STATUS"][data-status="UNKNOWN"]').count(), 1);
    negatives.unrecognised = await page.locator('#rows > tr[data-flags~="UNRECOGNISED_STATUS"]').first().evaluate((row) => row.children[2].textContent);
    checked('actual keyboard loads of the empty, truncated, duplicated and unrecognised-status sets: no attempts recorded, INCOMPLETE 4 of 10, duplicates kept and flagged with unique ids, unknown status shown as UNKNOWN', negatives);

    await load('fiction-failed-then-retry');
    await press('tab-cohort', 'ArrowRight');
    await press('tab-effect', 'ArrowRight');
    const retry = await scan('retry latency', 'fiction-failed-then-retry', 'latency');
    assert.equal(retry.rows, 2);
    assert.deepEqual(await page.locator('#rows > tr').evaluateAll((rows) => rows.map((row) => row.dataset.status)), ['EXCEEDED', 'WITHIN']);
    assert.match(await page.locator('#rows > tr').first().locator('td').nth(5).textContent(), /a retry cannot hide it/);
    checked('actual retry set: the exceeded first original stays a failed row although the retry is within budget, with the retry flag shown', 'EXCEEDED, WITHIN');

    // Recovery operations: reset, reload of the same set, a refused load and a switch of set; the invariant holds after each.
    before = await announced();
    await press('reset', 'Space');
    assert.equal(await focused(), 'saved-set');
    assert.equal(await page.locator('#rows > tr').count(), 0);
    assert.equal(await page.locator('#status').getAttribute('data-state'), 'UNLOADED');
    assert.ok(await announced() > before);
    await scan('after reset');
    await load(forty);
    await scan('reload after reset', forty, 'latency');
    await page.locator('#saved-set').focus();
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.locator('#saved-set').inputValue(), 'fiction-failed-then-retry');
    await press('load', 'Enter');
    await scan('another set after reload', 'fiction-failed-then-retry', 'latency');
    await pickByKeys('saved-set', ['', ...catalog.ids], '');
    await press('load', 'Enter');
    assert.equal(await text('error'), 'UNKNOWN_SAVED_SET');
    assert.equal(await page.locator('#rows > tr').count(), 0);
    await press('reset', 'Enter');
    assert.equal(await text('error'), '');
    await load('negative-duplicated-row');
    await press('tab-latency', 'Home');
    await scan('duplicated set after recovery', 'negative-duplicated-row', 'cohort');
    checked('actual recovery operations (reset, reload, switch of set, refused load) keep ids unique, counts reconciled and every failed and unknown row on screen', record.scans.length);

    assert.deepEqual(errors, [], 'no page error and no console error before the deliberate CSP probe');
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
      script.textContent = 'globalThis.__c040InlineRan = true;';
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
      return { inline, connection, submission, connected, inlineRan: Boolean(globalThis.__c040InlineRan) };
    });
    assert.match(csp.inline.effectiveDirective, /^script-src/);
    assert.equal(csp.inline.blockedURI, 'inline');
    assert.equal(csp.inlineRan, false);
    assert.equal(csp.connection.effectiveDirective, 'connect-src');
    assert.equal(csp.connected, false);
    assert.equal(csp.submission.effectiveDirective, 'form-action');
    checked('actual enforced CSP blocks inline code, connections and forms', csp);
    const probeErrors = errors.splice(0);
    assert.ok(probeErrors.length > 0 && probeErrors.every((message) => /Content Security Policy|violates/.test(message)), 'the only console errors are the probe\'s own CSP violations');
    assert.deepEqual(errors, []);
    assert.ok(requests.length > 0);
    assert.ok(requests.every((request) => request.method === 'GET' && request.url.startsWith('file:')), 'only local file GETs');
    for (const [name, html] of Object.entries(snapshotText)) {
      const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
      assert.equal(new Set(ids).size, ids.length, `${name}: the archived DOM snapshot repeats no id`);
      record.snapshots[name].idCount = ids.length;
      record.snapshots[name].repeatedIds = 0;
    }
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
      for (const [name, html] of Object.entries(snapshotText)) fs.writeFileSync(path.join(directory, `dom-${name}.html`), html, { flag: 'wx' });
      fs.writeFileSync(path.join(directory, 'summary.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
      record.captured = path.relative(repository, directory);
    }
    console.log(JSON.stringify({ cardId: 'C040', outcome: record.outcome, actualBrowserVersion: record.browserVersion, checks: record.checks.length, scans: record.scans.length,
      cleanup: record.cleanup, captured: record.captured || false }));
  }
  if (failures.length) throw new AggregateError(failures, 'C040 actual browser verification failed; the raw failure is retained.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
