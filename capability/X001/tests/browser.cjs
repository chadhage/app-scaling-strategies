'use strict';

// Real isolated headless Edge observation of capability\X001\index.html through the unchanged published helper (openIsolatedLesson) after
// testing\browser\qualify qualifyEdge() (valid Microsoft signature, qualified major, actual version and SHA recorded, no equality pin).
// Run it under a heavy slot, from the repository root:  node capability\X001\tests\browser.cjs
// Read-only unless CAPTURE_BROWSER_EVIDENCE=1, which appends ONE new evidence directory (summary + DOM snapshot, flag wx).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { readDom, facade } = require('.\\browser-dom.cjs');
const { assertShown, hitsFor, appliedIndex } = require('.\\invariants.cjs');
const saved = require('..\\saved.js');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sources = ['index.html', 'page.js', 'timeline.js', 'describe.js', 'saved.js', 'style.css', 'tests\\browser.cjs', 'tests\\browser-dom.cjs'];
const valid = saved.runs.filter((run) => !run.source.hostile || run.kind === 'console');
const sizeOf = (run) => (run.kind === 'console' ? run.entries.length : run.snapshot.events.length);
const record = { schema: 'X001-browser-proof/1', cardId: 'X001', startedAtUtc: new Date().toISOString(), outcome: 'not-run', testRuntime: process.version,
  meaning: 'Actual static DOM, keyboard and URL verification of local saved recordings, not a live Azure result and not a user journey.', liveAzureResult: false,
  packagesDownloaded: 0, cloudRuns: 0, spend: 0, checks: [], counts: { positionsChecked: 0, actions: 0 }, sourceSha256: Object.fromEntries(sources.map((name) => [name, sha(fs.readFileSync(path.join(root, name)))])) };
const checked = (name, observed) => { record.checks.push({ name, passed: true, observed }); console.log(`PASS ${name}`); };
const instrument = () => {
  window.__network = [];
  window.__csp = [];
  for (const name of ['fetch', 'XMLHttpRequest', 'EventSource', 'WebSocket']) {
    const original = window[name];
    window[name] = new Proxy(original, { apply(target, self, args) { window.__network.push(name); return Reflect.apply(target, self, args); },
      construct(target, args) { window.__network.push(name); return Reflect.construct(target, args); } });
  }
  document.addEventListener('securitypolicyviolation', (event) => window.__csp.push(event.violatedDirective));
};

async function main() {
  let session;
  try {
    const { qualifyEdge } = require(path.join(repository, 'testing', 'browser', 'qualify', 'qualify.cjs'));
    const report = await qualifyEdge();
    assert.equal(report.ok, true, JSON.stringify(report.reasons));
    assert.equal(report.signature.status, 'Valid');
    assert.equal(report.signature.publisher, 'Microsoft Corporation');
    record.edge = { version: report.version, major: report.major, sha256: report.sha256, path: report.path, qualifiedMajors: report.qualifiedMajors, signature: report.signature.status };
    checked('Edge is Microsoft-signed and inside the qualified major (qualifyEdge); actual version and SHA recorded, no equality pin', { version: report.version, major: report.major });
    const { openIsolatedLesson } = require(path.join(repository, 'testing', 'browser', 'isolated.cjs'));
    session = await openIsolatedLesson(path.join('capability', 'X001', 'index.html'));
    const { page } = session;
    page.setDefaultTimeout(8000);
    const requests = [];
    const failed = [];
    const responses = [];
    const errors = [];
    let dialogs = 0;
    page.on('request', (request) => requests.push(request.url()));
    page.on('requestfailed', (request) => failed.push([request.url(), request.failure() ? request.failure().errorText : '']));
    page.on('response', (response) => responses.push(response.url()));
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', async (dialog) => { dialogs += 1; await dialog.dismiss(); });
    await page.addInitScript(instrument);
    await page.reload({ waitUntil: 'load', timeout: 15000 });
    const base = page.url().split('#')[0];
    const dom = () => page.evaluate(readDom);
    const shown = async (id, index, label) => { assertShown(facade(await dom()), id, index, label); record.counts.positionsChecked += 1; };
    const press = async (key) => { await page.locator('#scrub').focus(); await page.keyboard.press(key); record.counts.actions += 1; };
    record.browserVersion = session.browserVersion;
    assert.equal(String(session.browserVersion).split('.')[0], String(report.major), 'the helper launched the qualified Edge');

    const initial = await dom();
    assert.equal(initial.slider['aria-disabled'], 'true');
    assert.equal(initial.items.length, 0);
    assert.match(initial.texts.status, /^No saved run is loaded\. Nothing is assumed to have succeeded\.$/);
    checked('initial state: nothing loaded, slider disabled, no default success', { status: initial.texts.status });

    await page.goto(`${base}#run=c044-restart-gap&pos=20`);
    await page.reload({ waitUntil: 'load' });
    await shown('c044-restart-gap', 19, 'initial fragment');
    checked('a fragment in the address loads that run at that position after a fresh load', { hash: (await dom()).hash });

    for (const [key, index] of [['ArrowRight', 20], ['ArrowLeft', 19], ['PageUp', 29], ['PageDown', 19], ['End', 43], ['Home', 0], ['ArrowDown', null], ['ArrowUp', 1]]) {
      await press(key);
      if (index === null) {
        const refusal = await dom();
        assert.match(refusal.texts.error, /^NOT_RECORDED: the requested position 0 is outside this recording \(positions 1 to 44\)\./);
        assert.equal(refusal.positionData, '1');
      } else await shown('c044-restart-gap', index, key);
    }
    checked('Left, Right, Up, Down, PageUp, PageDown, Home and End move exactly and a move off the recording is a typed NOT_RECORDED that changes nothing', { positionsChecked: record.counts.positionsChecked });
    const navigate = async (hash) => {
      await page.evaluate((next) => new Promise((resolve) => { addEventListener('hashchange', resolve, { once: true }); setTimeout(resolve, 600); location.hash = next; }), hash);
    };
    const jumps = ['gap', 'failure', 'unknown', 'epoch'];
    for (const run of valid) {
      const n = sizeOf(run);
      await navigate(`#run=${run.id}&pos=1`);
      await shown(run.id, 0, `${run.id} loaded`);
      for (let i = 1; i < n; i++) { await press('ArrowRight'); await shown(run.id, i, `${run.id} forward to ${i + 1}`); }
      await press('ArrowRight');
      assert.match((await dom()).texts.error, /^NOT_RECORDED: the requested position \d+ is outside/);
      for (let i = n - 2; i >= 0; i--) { await press('ArrowLeft'); await shown(run.id, i, `${run.id} backward to ${i + 1}`); }
      const hits = hitsFor(run);
      for (const kind of jumps) {
        const forward = [];
        while (!(await page.locator(`#next-${kind}`).isDisabled())) {
          await page.locator(`#next-${kind}`).click();
          const index = Number((await dom()).positionData) - 1;
          forward.push(index);
          await shown(run.id, index, `${run.id} next-${kind}`);
        }
        assert.deepEqual(forward, hits[kind].filter((i) => i > 0), `${run.id} next-${kind} lands on every hit in order`);
        const backward = [];
        while (!(await page.locator(`#prev-${kind}`).isDisabled())) {
          await page.locator(`#prev-${kind}`).click();
          backward.push(Number((await dom()).positionData) - 1);
        }
        assert.deepEqual(backward, forward.slice(0, -1).reverse(), `${run.id} prev-${kind}`);
        await navigate(`#run=${run.id}&pos=1`);
      }
    }
    checked('every position of every valid run, forward and backward by keyboard, and every jump target, satisfies the page invariants in real Edge', record.counts);
    await navigate('#run=c044-restart-gap&pos=30');
    await page.locator('#prev-failure').focus();
    await page.keyboard.press('Enter');
    await shown('c044-restart-gap', hitsFor(valid[0]).failure.findLast((i) => i < 29), 'keyboard Enter on a jump button');
    checked('a jump button is operable by keyboard alone', { active: (await dom()).active });

    await navigate('#run=c044-restart-gap&pos=1');
    await page.fill('#seq-epoch', '1');
    await page.fill('#seq-number', '11');
    await page.press('#seq-number', 'Enter');
    const inGap = await dom();
    assert.equal(inGap.texts['seq-result'], 'NOT_RECORDED: sequence 11 of epoch 1 lies in a gap; sequences 10 to 12 were never recorded. No nearby state is shown instead.');
    assert.equal(inGap.positionData, '1');
    await page.fill('#seq-number', '13');
    await page.press('#seq-number', 'Enter');
    await shown('c044-restart-gap', appliedIndex(valid[0]).get('1:13'), 'sequence 13 of epoch 1 found by keyboard');
    checked('a sequence inside a gap is a typed NOT_RECORDED with its exact range and changes nothing; a recorded sequence is found by keyboard', { gap: '1:11', found: '1:13' });
    const calm = await dom();
    for (const hostile of ['#run=<script>window.__x=1</script>&pos=1', '#run=__proto__&pos=1', '#run=c044-restart-gap&pos=1&pos=2', '#run=c044-restart-gap&pos=0',
      `#run=${'a'.repeat(3000)}&pos=1`, '#run=%3Cimg%20src%3Dx%20onerror%3Dwindow.__x%3D1%3E&pos=1', '#javascript:window.__x=1', '#run=c044-complete&pos=999']) {
      await navigate(hostile);
      const after = await dom();
      assert.match(after.texts.error, /^(FRAGMENT_[A-Z_]+|RUN_UNKNOWN|POSITION_INVALID|NOT_RECORDED)/, hostile.slice(0, 30));
      assert.equal(after.hash, calm.hash, 'the address is restored to the displayed position');
      assert.equal(after.positionData, calm.positionData);
      assert.doesNotMatch(JSON.stringify(after.texts), /alert|onerror|__x|script>/);
    }
    assert.deepEqual([await page.evaluate(() => window.__x), dialogs, errors], [undefined, 0, []]);
    checked('hostile fragments never throw or execute, echo nothing, change nothing and are replaced by the displayed position in the address', { refusals: 8 });

    await page.selectOption('#saved-run', 'c034-reordered');
    await page.click('#load');
    const refusal = await dom();
    assert.match(refusal.texts.error, /^REFUSED DECODER_REFUSED \(BOUNDARY_ACTION_ORDER\)/);
    assert.deepEqual([refusal.items.length, refusal.slider['aria-disabled'], refusal.hash], [0, 'true', '#run=c034-reordered&pos=1']);
    await page.reload({ waitUntil: 'load' });
    assert.match((await dom()).texts.error, /^REFUSED DECODER_REFUSED/);
    await navigate('#run=c034-closed-history&pos=2');
    await shown('c034-closed-history', 1, 'recovered after a refused run');
    checked('a refused saved run shows its typed decoder code and no timeline, survives a reload, and the next valid fragment recovers', { code: 'BOUNDARY_ACTION_ORDER' });
    await navigate('#run=c044-restart-gap&pos=17');
    await shown('c044-restart-gap', 16, 'before the network audit');
    const scrubbing = await dom();
    assert.deepEqual(scrubbing.calls, [], 'scrubbing called no fetch, XMLHttpRequest, EventSource or WebSocket');
    assert.equal(requests.length > 0 && requests.every((url) => url.startsWith('file:')), true, `only file: requests: ${requests.filter((url) => !url.startsWith('file:')).join(' ')}`);
    record.requests = [...new Set(requests.map((url) => path.basename(decodeURIComponent(url).split('#')[0])))].sort();
    checked('scrubbing made zero network requests: no fetch, XHR, EventSource or WebSocket call and only file: resources were requested', { resources: record.requests });
    const snapshot = await page.evaluate(() => document.querySelector('main').outerHTML);

    const probes = await page.evaluate(async () => {
      const out = {};
      out.fetch = await fetch('http://127.0.0.1:9/x').then(() => 'allowed', (error) => `blocked ${error.name}`);
      out.xhr = await new Promise((resolve) => { const x = new XMLHttpRequest(); x.onerror = () => resolve('blocked'); x.onload = () => resolve('allowed'); try { x.open('GET', 'http://127.0.0.1:9/x'); x.send(); } catch (error) { resolve(`blocked ${error.name}`); } });
      out.eventSource = await new Promise((resolve) => { const s = new EventSource('http://127.0.0.1:9/x'); s.onerror = () => { s.close(); resolve('blocked'); }; s.onopen = () => resolve('allowed'); });
      out.webSocket = await new Promise((resolve) => { try { const w = new WebSocket('ws://127.0.0.1:9/x'); w.onerror = () => resolve('blocked'); w.onopen = () => { w.close(); resolve('allowed'); }; } catch (error) { resolve(`blocked ${error.name}`); } });
      const script = document.createElement('script');
      script.textContent = 'window.__injected = 1';
      document.body.append(script);
      out.inlineScript = window.__injected === undefined ? 'blocked' : 'executed';
      const banner = document.getElementById('banner');
      banner.setAttribute('style', 'color: red');
      out.inlineStyle = banner.style.color === '' ? 'blocked' : 'applied';
      banner.removeAttribute('style');
      return out;
    });
    const violations = await page.evaluate(() => window.__csp);
    assert.deepEqual(Object.fromEntries(Object.entries(probes).map(([name, outcome]) => [name, outcome.split(' ')[0]])),
      { fetch: 'blocked', xhr: 'blocked', eventSource: 'blocked', webSocket: 'blocked', inlineScript: 'blocked', inlineStyle: 'blocked' });
    for (const directive of ['connect-src', 'script-src-elem', 'style-src-attr']) assert.ok(violations.some((item) => item.startsWith(directive)), `a ${directive} violation was reported: ${violations}`);
    assert.ok(violations.filter((item) => item.startsWith('connect-src')).length >= 4, `one connect-src violation per probe (fetch, XHR, EventSource, WebSocket): ${violations}`);
    record.cspViolations = violations;
    const external = requests.filter((url) => !url.startsWith('file:'));
    for (const url of external) assert.ok(failed.some(([target, why]) => target === url && /csp/i.test(why)), `${url} was blocked by the content security policy (failure text csp), not by the network`);
    assert.deepEqual(responses.filter((url) => !url.startsWith('file:')), [], 'no response ever arrived from outside');
    record.blockedRequests = external.map((url) => ({ url, failure: failed.find(([target]) => target === url)[1] }));
    checked('CSP probe: connect-src none blocks fetch, XHR, EventSource and WebSocket; inline script and inline style are blocked', { probes, violations: [...new Set(violations)] });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reduced = await page.evaluate(() => getComputedStyle(document.getElementById('scrub-fill')).transitionDuration);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const normal = await page.evaluate(() => getComputedStyle(document.getElementById('scrub-fill')).transitionDuration);
    assert.deepEqual([reduced, normal], ['0s', '0.2s']);
    checked('prefers-reduced-motion removes the scrub bar transition', { reduced, normal });
    assert.deepEqual([errors, dialogs], [[], 0]);

    record.outcome = 'passed';
    record.finishedAtUtc = new Date().toISOString();
    if (capture) {
      const directory = path.join(root, 'evidence', 'browser', `browser-${randomUUID()}`);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, 'dom-restart-gap-position-17.html'), snapshot, { flag: 'wx' });
      record.snapshotSha256 = sha(Buffer.from(snapshot));
      fs.writeFileSync(path.join(directory, 'summary.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
      console.log(`evidence written to ${path.relative(repository, directory)}`);
    }
    console.log(`PASS all ${record.checks.length} browser checks (${record.counts.positionsChecked} positions, ${record.counts.actions} key actions) on Edge ${record.browserVersion}`);
  } finally {
    if (session) await session.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
