'use strict';

// Real isolated headless Edge observation of the C044 console. Run from the repository root:
//   node capability\C044\tests\browser.cjs
// The server is the real consent-gated startLocal() (current C001 consent and the C015 public restore are read for real),
// bound to 127.0.0.1 port 0. Evidence is written only for exact CAPTURE_BROWSER_EVIDENCE=1 with C044_CAPTURE_DIR set by record.cjs.
// Every page observation is taken atomically inside one waitForFunction evaluation, because the page legitimately re-opens
// its bounded stream every few hundred milliseconds and markers change with each reconnect.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { startLocal, closeOwned } = require('../server.cjs');
const cursors = require('../cursor.js');
const { scratchDirectory } = require('./support.cjs');

const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
const { openIsolatedLoopback } = require(path.join(repositoryRoot, 'testing', 'browser', 'isolated.cjs'));
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1' && process.env.C044_CAPTURE_DIR ? process.env.C044_CAPTURE_DIR : null;
const record = {
  cardId: 'C044', startedAtUtc: new Date().toISOString(), outcome: 'not-run', mode: 'isolated-headless', engine: 'Microsoft Edge (Chromium)',
  testRuntime: process.version, businessData: 'synthetic', nativeTargetQualified: false, productionRuntimeValidated: false,
  integratedForegroundLeaseUsed: false, checks: [], cleanup: { serverClosed: false, browserClosed: false, scratchRemoved: false },
};
const helperPath = path.join(repositoryRoot, 'testing', 'browser', 'isolated.cjs');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(predicate, label, limitMs = 15000) {
  const deadline = Date.now() + limitMs;
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
    await wait(25);
  }
}

function checked(name, observed) {
  record.checks.push({ name, passed: true, observed });
  console.log(`PASS ${name}`);
}

function save(name, content) {
  if (capture) fs.writeFileSync(path.join(capture, name), content, { flag: 'wx' });
}

async function main() {
  const scratch = scratchDirectory();
  let server;
  let session;
  let failure;
  try {
    server = await startLocal({
      persistDir: scratch.directory, intervalMs: 100, totalSteps: 1500, replayWindow: 40, retryMs: 100, heartbeatMs: 200, streamLifetimeMs: 600,
    });
    const { run } = server;
    record.server = { pid: process.pid, address: server.address(), ownership: 'this process, exact returned http.Server handle', context: run.snapshot().context };
    assert.equal(record.server.context.origin, 'actual-C015-public-restore-read-only', 'the stream is attributed to the real C015 restore');
    session = await openIsolatedLoopback(path.join('capability', 'C044', 'index.html'), server);
    record.browserVersion = session.browserVersion;
    record.playwrightVersion = require(path.join(repositoryRoot, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
    record.helperRawSha256 = createHash('sha256').update(fs.readFileSync(helperPath)).digest('hex');
    const { page } = session;
    const pageErrors = [];
    const requests = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => requests.push({ method: request.method(), url: request.url() }));
    await page.evaluate(() => {
      window.c044Snapshot = () => {
        const text = (id) => document.getElementById(id).textContent;
        const cursor = text('cursor');
        return {
          connection: text('connection'), applied: Number(text('count-applied')), duplicates: Number(text('count-duplicates')),
          reconnects: Number(text('count-reconnects')), marker: text('marker'), detached: text('detached'), cursor,
          lastSeq: Number((/:(\d+)$/.exec(cursor) || [])[1] || 0), failure: text('failure'), notice: text('notice'), rewind: document.getElementById('rewind').value,
          seqs: [...document.querySelectorAll('#log li')].map((item) => Number(item.textContent.split(' · ')[0].split(':')[2])),
          ids: [...document.querySelectorAll('#log li.applied')].map((item) => item.textContent.split(' · ')[0]),
          dropped: [...document.querySelectorAll('#dropped li')].map((item) => item.textContent),
          actions: [...document.querySelectorAll('#actions button')].map((button) => button.textContent),
        };
      };
    });
    const observe = async (predicate, arg = null, timeout = 20000) => (await page.waitForFunction(predicate, arg, { timeout })).jsonValue();
    const snap = () => observe(() => window.c044Snapshot());
    const contiguous = (seqs, message) => seqs.forEach((seq, index) => assert.equal(seq, seqs[0] + index, message));
    // The page may be between two bounded stream responses; retry the keyboard press until the Disconnect really took effect.
    const disconnectByKeyboard = async () => {
      for (let attempt = 0; attempt < 30; attempt++) {
        await page.waitForFunction(() => !document.getElementById('disconnect').disabled, null, { timeout: 15000 });
        await page.locator('#disconnect').focus();
        await page.keyboard.press('Enter');
        const taken = await observe(() => { const value = window.c044Snapshot(); return value.connection.includes('(by you') ? value : false; }, null, 1500).catch(() => null);
        if (taken) return taken;
      }
      throw new Error('Disconnect by keyboard did not take effect');
    };

    const live = await observe(() => { const value = window.c044Snapshot(); return value.applied >= 3 ? value : false; }, null, 15000);
    assert.match(live.connection, /^Connection: /);
    assert.match(await page.locator('main').textContent(), /Training rehearsal - synthetic data - not a live Azure result/);
    const inline = await page.evaluate(() => new Promise((resolve) => {
      document.addEventListener('securitypolicyviolation', (event) => resolve({ violated: event.violatedDirective, ran: window.c044InlineRan === true }), { once: true });
      const script = document.createElement('script');
      script.textContent = 'window.c044InlineRan = true';
      document.head.append(script);
      setTimeout(() => resolve({ violated: null, ran: window.c044InlineRan === true }), 1500);
    }));
    assert.equal(inline.ran, false, 'the strict CSP blocks an injected inline script');
    assert.match(inline.violated, /^script-src/);
    checked('the console connects with EventSource and applies live events from the owned listener', { ...live, seqs: undefined, ids: undefined });

    // Keyboard Disconnect: only this client connection closes; the server keeps producing.
    const detachedAt = await disconnectByKeyboard();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'reconnect', 'focus moves to the control that is now available');
    const producedAtDisconnect = run.counters.produced;
    await page.waitForFunction(() => /^Server counter at disconnect: \d+/.test(document.getElementById('detached').textContent));
    await until(() => run.counters.produced >= producedAtDisconnect + 10, 'the run to keep producing while detached');
    await wait(150);
    const whileDetached = await snap();
    assert.equal(whileDetached.applied, detachedAt.applied, 'nothing is applied while detached');
    assert.equal(run.snapshot().run.producerActive, true);
    assert.equal(run.counters.clientsAttached, 0, 'the server sees no client while detached');
    save('detached.html', await page.locator('main').innerHTML());
    checked('keyboard Disconnect closes only the client stream while the server producer keeps going', { applied: detachedAt.applied, lastSeq: detachedAt.lastSeq, serverProducedWhileDetached: run.counters.produced - producedAtDisconnect });

    // Keyboard Reconnect: resumes at the next event and shows the gap exactly once.
    await page.locator('#reconnect').focus();
    await page.keyboard.press('Enter');
    const resumed = await observe(({ from }) => { const value = window.c044Snapshot(); return value.applied >= from + 10 ? value : false; }, { from: detachedAt.applied });
    assert.match(resumed.marker, new RegExp(`^reconnected from id synthetic-run-001:\\d+:${detachedAt.lastSeq}$`));
    assert.match(resumed.detached, /^Produced while detached: \d+ \(server counter \d+ to \d+\)\.$/);
    const advanced = Number(/Produced while detached: (\d+)/.exec(resumed.detached)[1]);
    assert.ok(advanced >= 10, `the run produced ${advanced} events while detached`);
    contiguous(resumed.seqs, 'the console shows every event once, contiguous across the gap');
    assert.equal(resumed.seqs[detachedAt.applied], detachedAt.lastSeq + 1, 'the first event after the reconnect is the next event after the cursor');
    assert.equal(resumed.duplicates, 0);
    save('reconnected.html', await page.locator('main').innerHTML());
    checked('keyboard Reconnect resumes at the next event: the gap events appear exactly once, no duplicate', { marker: resumed.marker, detached: resumed.detached, shownContiguous: [resumed.seqs[0], resumed.seqs.at(-1)] });

    // Duplicate drill: re-request three applied events; each is dropped by id and counted.
    await disconnectByKeyboard();
    await page.locator('#rewind').fill('3');
    await page.locator('#reconnect').focus();
    await page.keyboard.press('Enter');
    const drilled = await observe(() => { const value = window.c044Snapshot(); return value.duplicates >= 3 ? value : false; });
    assert.match(drilled.marker, /^reconnected from id synthetic-run-001:\d+:\d+ \(re-requested 3 applied events\)$/);
    assert.equal(drilled.duplicates, 3);
    assert.equal(drilled.dropped.length, 3);
    assert.ok(drilled.dropped.every((line) => line.startsWith('dropped duplicate: synthetic-run-001:')));
    contiguous(drilled.seqs, 'dropped duplicates never appear as new events');
    assert.equal(drilled.rewind, '0', 'the re-request applies to one reconnect only');
    save('duplicates.html', await page.locator('main').innerHTML());
    checked('a re-requested cursor re-sends applied events; the reducer drops them by id and shows the dropped-duplicate counter', { duplicates: drilled.duplicates, marker: drilled.marker, dropped: drilled.dropped });

    // Typed failure: a cursor older than the replay window is explicit, never a silent restart.
    await observe(() => { const value = window.c044Snapshot(); return value.applied >= 70 ? value : false; }, null, 40000);
    const beforeFailure = await disconnectByKeyboard();
    await page.locator('#rewind').fill('60');
    await page.locator('#reconnect').focus();
    await page.keyboard.press('Enter');
    const failed = await observe(() => { const value = window.c044Snapshot(); return value.failure.startsWith('CURSOR_EXPIRED (stale)') ? value : false; });
    assert.equal(failed.connection, 'Connection: failed');
    assert.deepEqual(failed.actions, ['Resync from snapshot', 'Reinspect read-only', 'Stop reconnecting']);
    assert.equal(failed.applied, beforeFailure.applied, 'no event was applied and no stream was silently restarted');
    contiguous(failed.seqs, 'the history stays intact');
    save('failure.html', await page.locator('main').innerHTML());
    await page.getByRole('button', { name: 'Reinspect read-only' }).focus();
    await page.keyboard.press('Enter');
    await observe(() => { const value = window.c044Snapshot(); return value.notice.startsWith('Read-only snapshot inspected') ? value : false; });
    checked('a cursor older than the replay window shows a typed CURSOR_EXPIRED failure with only its allowed actions and no silent restart', { failure: failed.failure, actions: failed.actions });

    const lastBefore = failed.lastSeq;
    const lastIdBefore = failed.cursor.replace('Last applied id: ', '');
    const windowBefore = run.view().firstRetainedSeq;
    await page.getByRole('button', { name: 'Resync from snapshot' }).focus();
    await page.keyboard.press('Enter');
    // F1: the retained window replayed by the cursorless stream is judged by id: events already applied are counted dropped
    // duplicates and never shown again; only a range that the server no longer retains may be named as a gap.
    const resynced = await observe(({ from }) => {
      const value = window.c044Snapshot();
      return value.applied > from && value.marker.startsWith('resynced after id') && !value.marker.endsWith('first retained event') ? value : false;
    }, { from: failed.applied });
    assert.equal(resynced.failure, 'No failure.');
    assert.equal(new Set(resynced.ids).size, resynced.ids.length, 'after Resync no id appears twice among the applied entries');
    assert.equal(resynced.ids.length, resynced.seqs.length);
    const replayed = resynced.dropped.slice(failed.duplicates).map((line) => Number(line.split(':').at(-1)));
    const fresh = resynced.seqs.slice(resynced.seqs.indexOf(lastBefore) + 1);
    assert.ok(fresh.length >= 1, 'events after the last pre-resync event were applied');
    if (replayed.length > 0) {
      contiguous(replayed, 'the replayed window part is one contiguous range');
      assert.equal(replayed.at(-1), lastBefore, 'the overlap ends at the last event that was already applied');
      assert.ok(replayed[0] >= windowBefore, 'the replay starts inside the retained window');
      assert.equal(resynced.duplicates, failed.duplicates + replayed.length, '#count-duplicates equals the overlap');
      assert.equal(fresh[0], lastBefore + 1, 'the first new event follows the last applied one');
      assert.match(resynced.marker, new RegExp(`^resynced after id ${lastIdBefore}: nothing was skipped`));
      assert.doesNotMatch(resynced.marker, /is a gap/);
    } else {
      assert.equal(resynced.duplicates, failed.duplicates, 'no overlap, so no duplicate');
      assert.ok(fresh[0] > lastBefore + 1);
      assert.equal(resynced.marker, `resynced after id ${lastIdBefore}: skipped sequences ${lastBefore + 1} to ${fresh[0] - 1} (${fresh[0] - 1 - lastBefore} events are no longer retained)`);
    }
    contiguous(fresh, 'the new events are contiguous');
    save('resynced.html', await page.locator('main').innerHTML());
    checked('the explicit Resync is the only way back to a stream: replayed events are dropped duplicates, no id is shown twice, a skipped range is named',
      { marker: resynced.marker, lastBefore, replayedDuplicates: replayed.length, firstNew: fresh[0], duplicates: resynced.duplicates });

    const finalState = await snap();
    assert.equal(new Set(finalState.ids).size, finalState.ids.length, 'at the end no id appears twice among the applied entries');
    const snapshot = run.snapshot();
    assert.equal(snapshot.run.producerActive, true);
    assert.ok(snapshot.counters.disconnects >= 3, 'the server observed the client losses');
    assert.ok(snapshot.counters.resumes >= 2);
    assert.equal(snapshot.counters.rejectedCursors >= 1, true);
    const own = new URL(`http://127.0.0.1:${server.address().port}/`).origin;
    const paths = new Set(requests.filter((request) => request.url.startsWith('http')).map((request) => new URL(request.url).pathname));
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => new URL(entry.name).pathname));
    const allowed = new Set(['/', '/cursor', '/cursor.js', '/page.js', '/reducer.js', '/run.json', '/stream', '/style.css']);
    assert.ok(requests.every((request) => request.method === 'GET'), 'only GET requests were made');
    assert.ok(requests.filter((request) => request.url.startsWith('http')).every((request) => new URL(request.url).origin === own), 'only the owned origin was contacted');
    assert.ok([...paths, ...resources].every((entry) => allowed.has(entry)), 'only the closed own routes were requested');
    for (const needed of ['/cursor', '/run.json', '/stream']) assert.ok(paths.has(needed), `${needed} was used`);
    for (const needed of ['/cursor.js', '/page.js', '/reducer.js', '/style.css']) assert.ok(resources.includes(needed), `${needed} was loaded from the owned origin`);
    assert.deepEqual(pageErrors, []);
    save('final.html', await page.locator('main').innerHTML());
    if (capture) await page.screenshot({ path: path.join(capture, 'final.png'), fullPage: true });
    checked('only GET requests to the owned origin; no page errors; the server producer never stopped', {
      paths: [...paths].sort(), resources: [...new Set(resources)].sort(), pageErrors, serverCounters: snapshot.counters, final: { ...finalState, seqs: undefined, ids: undefined },
    });
    record.outcome = 'passed';
    record.cursorExample = cursors.format('synthetic-run-001', snapshot.context.epoch, snapshot.run.headSeq);
    record.limits = [
      'The isolated helper buffers each response with route.fetch, so the page is served bounded stream responses (streamLifetimeMs) and reconnects with ?lastEventId=; header-based Last-Event-ID resume and abrupt/slow-reader loss are proven with real Node sockets, not in the browser.',
      'This is not native Chromium TCP, proxy, Node 24, Express, Entra or Azure qualification.',
    ];
  } catch (error) {
    failure = error;
    record.outcome = 'failed';
    record.failure = error.message;
  } finally {
    record.completedAtUtc = new Date().toISOString();
    try {
      if (session) await session.close();
      record.cleanup.browserClosed = Boolean(session);
    } catch (error) {
      failure = failure || error;
    }
    try {
      if (server) await closeOwned(server);
      record.cleanup.serverClosed = Boolean(server) && !server.listening;
    } catch (error) {
      failure = failure || error;
    }
    scratch.remove();
    record.cleanup.scratchRemoved = !fs.existsSync(scratch.directory);
    if (capture) save('summary.json', `${JSON.stringify(record, null, 2)}\n`);
  }
  if (failure) throw failure;
  console.log(JSON.stringify({ outcome: record.outcome, checks: record.checks.length, browser: record.browserVersion, cleanup: record.cleanup }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
