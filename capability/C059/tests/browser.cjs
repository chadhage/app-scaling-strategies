'use strict';

// Real isolated headless Edge observation of the C059 journey. Run (heavy-run slot first when other agents are active):
//   node capability\C059\tests\browser.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const { call } = require('./net.cjs');
const { INITIAL_ORDER, K, checked, checks, openIsolatedLoopback, prepare, qualifyEdge, body } = require('./browser-support.cjs');
const { closeServer } = require('../server.cjs');
const { NEGATIVES, POSITIVES, documentHtml } = require('./negatives.cjs');

async function main() {
  const edge = await qualifyEdge();
  assert.equal(edge.ok, true, edge.reasons.join(' | '));
  assert.equal(edge.signature.publisher, 'Microsoft Corporation');
  checked('the installed Edge is Microsoft-signed and within the qualified major (no equality pin)', { version: edge.version, major: edge.major, sha256: edge.sha256 });
  const prepared = await prepare();
  let session;
  const summary = { browserVersion: null, tabOrder: null, snapshots: {}, outcomes: {}, announcements: {}, requests: [] };
  try {
    session = await openIsolatedLoopback(path.join('capability', 'C059', 'index.html'), prepared.server);
    summary.browserVersion = session.browserVersion;
    assert.equal(session.browserVersion.split('.')[0], String(edge.major), 'the running browser is the qualified major');
    const { page } = session;
    // Cleanup proof (review N5, self-review line 9): with C059_BROWSER_INJECT_FAILURE=1 this run fails right here, and tests\browser-cleanup.cjs asserts that the finally below still closed the session.
    if (process.env.C059_BROWSER_INJECT_FAILURE === '1') assert.fail('injected failure: the real session must still be closed in finally');
    const pageErrors = [];
    const consoleErrors = [];
    const requests = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push({ text: message.text(), url: message.location().url }); });
    page.on('request', (request) => requests.push(`${request.method()} ${new URL(request.url()).pathname}`));
    await page.waitForFunction(() => document.getElementById('status')?.textContent.startsWith('Ready.'));
    await page.evaluate(() => {
      window.__live = [];
      new MutationObserver((records) => { for (const record of records) window.__live.push(record.target.textContent); }).observe(document.getElementById('status'), { childList: true, subtree: true, characterData: true });
    });
    const active = () => page.evaluate(() => document.activeElement.id || document.activeElement.tagName.toLowerCase());
    // Focus crosses the boundary of the sandboxed frame asynchronously: poll (up to 5 s) for the settled focus instead of asserting the first read.
    const settled = async (expected) => {
      for (let turn = 0; turn < 100 && (await active()) !== expected; turn += 1) await new Promise((resolve) => setTimeout(resolve, 50));
      return active();
    };
    const idle = () => page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 15000 });
    const audit = async (label, options = {}) => {
      const findings = await page.evaluate((opts) => globalThis.C059A11y.check(document, opts).findings.map((item) => `${item.code} ${item.selector}`), options);
      assert.deepEqual(findings, [], `${label}: the checker found defects on the REAL DOM`);
    };
    const live = () => page.evaluate(() => window.__live.length);
    const text = (selector) => page.locator(selector).textContent();
    const tree = () => page.locator('body').ariaSnapshot();
    const act = async (label, action, { announced, check } = {}) => {
      const before = await live();
      await action();
      await idle();
      await audit(label, check);
      const count = (await live()) - before;
      if (announced !== undefined) assert.equal(count, announced, `${label}: ${count} live-region writes`);
      return { text: await text('#status'), focus: await active(), count };
    };
    const press = (key) => page.keyboard.press(key);
    const focusRing = () => page.evaluate(() => { const style = getComputedStyle(document.activeElement); return `${style.outlineStyle} ${style.outlineWidth}`; });

    assert.equal(await active(), 'page-heading');
    await audit('render');
    const first = await tree();
    summary.snapshots.initial = first;
    for (const expected of [/heading "Conduct one step: reserve synthetic capacity" \[level=1\]/, /main/, /navigation "Journey steps"/, /radiogroup/, /radio "A-S001: /, /button "Open the chosen lesson"/, /textbox "Idempotency key"/, /combobox "Lease"/, /textbox "Units to reserve"/, /button "Conduct the step"/, /heading "3\. Result: none yet" \[level=2\]/, /status/]) assert.match(first, expected);
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
    checked('render: the accessibility tree has the h1, main, navigation, radiogroup, named controls and the status; the checker finds nothing on the real DOM', { focus: 'page-heading' });

    const tabOrder = await page.evaluate(() => globalThis.C059A11y.tabOrder(document).map((element) => element.id));
    assert.deepEqual(tabOrder, INITIAL_ORDER);
    const forward = [];
    const rings = new Set();
    for (let index = 0; index < INITIAL_ORDER.length - 1; index += 1) { await press('Tab'); forward.push(await active()); rings.add(await focusRing()); }
    assert.deepEqual(forward, INITIAL_ORDER.slice(1), 'the Tab order recorded in Edge, from the h1, equals the expected order');
    assert.deepEqual([...rings], ['solid 3px'], 'every tab stop shows a visible focus indicator');
    const backward = [];
    for (let index = 0; index < INITIAL_ORDER.length - 2; index += 1) { await press('Shift+Tab'); backward.push(await active()); }
    assert.deepEqual(backward, [...INITIAL_ORDER].slice(1, -1).reverse(), 'Shift+Tab walks the same order backwards');
    summary.tabOrder = { expected: INITIAL_ORDER, recordedForward: forward, recordedBackward: backward };
    checked('the Tab order recorded in Edge equals the expected order (forwards and backwards) and the checker tabOrder; every stop has a visible focus indicator', summary.tabOrder);

    await page.focus('#skip-link');
    await press('Enter');
    assert.equal(await active(), 'main');
    await audit('skip link');
    checked('the skip link moves the focus to main', await active());

    await page.focus('#lesson-A-S001');
    const down = await act('ArrowDown', () => press('ArrowDown'), { announced: 1 });
    assert.equal(down.focus, 'lesson-A-S003');
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('[role=radio]')].map((radio) => `${radio.tabIndex}/${radio.getAttribute('aria-checked')}`)), ['-1/false', '0/true']);
    await act('ArrowUp', () => press('ArrowUp'), { announced: 1 });
    await act('Space', async () => { await page.focus('#lesson-A-S003'); await press(' '); }, { announced: 1 });
    await act('click', () => page.click('#lesson-A-S001'), { announced: 1 });
    assert.match(await text('#status'), /^A-S001 chosen: /);
    checked('the lesson chooser follows the radio group pattern in Edge: arrows move and choose, Space chooses, one tab stop, each choice announced once', await text('#status'));
    assert.match(await text('#host-note'), /^A-S001 is chosen and not open\./, 'the host note is true after a choice');
    checked('the host note under Open is true after a choice in Edge (it never says that no lesson is selected while one is chosen)', await text('#host-note'));

    await page.focus('#open-lesson');
    const opened = await act('open the lesson', () => press('Enter'), { announced: 1 });
    assert.equal(opened.focus, 'lesson-heading');
    let frame;
    for (let turn = 0; turn < 200 && !frame; turn += 1) {
      frame = page.frames().find((candidate) => candidate.url().includes('/c041-lessons/A-S001/'));
      if (!frame) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(frame, 'the delivered lesson loaded in the sandboxed frame');
    await frame.waitForLoadState('load');
    assert.ok((await frame.title()).length > 0);
    assert.match(await page.locator('iframe').getAttribute('title'), /^A-S001: .* isolated synthetic training$/);
    const frameStop = await page.evaluate(() => document.querySelector('iframe').id || 'iframe');
    await press('Tab');
    assert.equal(await settled(frameStop), frameStop, 'Tab from the lesson heading enters the frame');
    await press('Shift+Tab');
    assert.equal(await settled('close-lesson'), 'close-lesson', 'Shift+Tab leaves the frame');
    await act('close the lesson', () => press('Enter'), { announced: 1 });
    assert.equal(await active(), 'open-lesson');
    assert.equal(await page.locator('iframe').count(), 0);
    checked('opening a lesson names the frame and focuses its heading; Tab enters the frame, Shift+Tab and Close the lesson leave it; focus returns to the invoker', opened.text);

    await page.fill('#key', 'x');
    await page.fill('#units', '0');
    await page.focus('#submit');
    const invalid = await act('invalid submit', () => press('Enter'), { announced: 1, check: { afterSubmit: true } });
    assert.equal(invalid.focus, 'key');
    assert.deepEqual(requests.filter((item) => item.startsWith('POST')), [], 'an invalid form is not sent');
    assert.match(await tree(), /heading "Fix these fields" \[level=3\]/);
    assert.equal(await page.getAttribute('#key', 'aria-invalid'), 'true');
    assert.match(await page.getAttribute('#units', 'aria-describedby'), /units-error/);
    assert.match(invalid.text, /^Not submitted: 2 fields need correction: Idempotency key, Units\./);
    checked('invalid fields: aria-invalid, described by their messages, summary with links, first invalid field focused, announced once, nothing sent', invalid.text);

    await page.fill('#key', K.done);
    await page.fill('#units', '5');
    await page.focus('#submit');
    const blocked = await act('the POST the helper blocks', () => press('Enter'), { announced: 2 });
    assert.equal(await page.getAttribute('#result', 'data-outcome'), 'unknown');
    assert.equal(await page.getAttribute('#result', 'data-code'), 'NO_VALID_RESPONSE');
    assert.equal(blocked.focus, 'result-heading');
    assert.doesNotMatch(blocked.text, /succe|done|complete/i);
    assert.match(blocked.text, /^Unknown\. Code NO_VALID_RESPONSE\. .* Offered: Retry with the same key, Inspect the step\.$/);
    assert.ok(requests.includes('POST /v1/steps'), 'the browser did try to POST');
    assert.equal((await call(prepared.port, 'GET', '/v1/leases')).json.leases['synthetic-lease-001'].committed, 5, 'the blocked POST changed nothing');
    summary.snapshots.unknown = await tree();
    assert.match(summary.snapshots.unknown, /heading "Result: Unknown" \[level=2\]/);
    assert.match(summary.snapshots.unknown, /button "Retry with the same key"/);
    checked('the helper blocks the POST: the page says UNKNOWN with its own wording, never success, offers Retry and Inspect, focus on the result heading, two announcements', blocked.text);

    const inspect = async (key) => {
      await page.fill('#key', key);
      await page.focus('#submit');
      await act(`submit ${key}`, () => press('Enter'), { announced: 2 });
      await page.focus('#recovery-inspect');
      return act(`inspect ${key}`, () => press('Enter'), { announced: 2 });
    };
    const CASES = [
      ['done', K.done, 'succeeded', null, /^Succeeded\. Reserved 5 synthetic units on synthetic-lease-001; 5 of 100 are now reserved\./, ['recovery-retry', 'recovery-inspect']],
      ['in flight', K.flight, 'unknown', 'STEP_IN_FLIGHT', /^Unknown\. Code STEP_IN_FLIGHT\. /, ['recovery-cancel', 'recovery-retry', 'recovery-inspect']],
      ['cancelled', K.cancelled, 'cancelled', 'STEP_CANCELLED', /^Cancelled\. Code STEP_CANCELLED\. /, ['recovery-correct-and-resubmit', 'recovery-inspect']],
      ['interrupted', K.interrupted, 'interrupted', 'STEP_INTERRUPTED', /^Interrupted\. Code STEP_INTERRUPTED\. /, ['recovery-resume', 'recovery-cancel', 'recovery-inspect']],
      ['not found', K.unknown, 'rejected', 'STEP_NOT_FOUND', /^Rejected\. Code STEP_NOT_FOUND\. /, ['recovery-correct-and-resubmit']],
    ];
    for (const [name, key, outcome, code, wording, buttons] of CASES) {
      const shown = await inspect(key);
      assert.equal(await page.getAttribute('#result', 'data-outcome'), outcome, name);
      assert.equal(await page.getAttribute('#result', 'data-code'), code, name);
      assert.match(shown.text, wording, name);
      assert.equal(shown.focus, 'result-heading', name);
      assert.deepEqual(await page.locator('#recovery button').evaluateAll((list) => list.map((button) => button.id)), buttons, name);
      assert.ok(requests.includes(`GET /v1/steps/${key}`), `${name}: a real GET reached the service`);
      const snapshot = await tree();
      for (const id of buttons) assert.match(snapshot, new RegExp(`button "${await page.locator(`#${id}`).textContent()}"`), `${name}: ${id} is in the accessibility tree`);
      assert.equal(outcome === 'succeeded', /Succeeded/.test(shown.text), `${name}: success wording only for a succeeded outcome`);
      summary.outcomes[name] = { outcome, code, text: shown.text, buttons };
      checked(`Inspect (GET) shows the real server state "${name}": outcome, typed code, re-derived wording, offered controls, focus, two announcements, the checker finds nothing`, shown.text);
      if (name === 'cancelled') {
        summary.snapshots.cancelled = snapshot;
        const fresh = await act('correct and resubmit after a cancel', async () => { await page.focus('#recovery-correct-and-resubmit'); await press('Enter'); }, { announced: 1 });
        assert.equal(fresh.focus, 'key');
        assert.match(await page.inputValue('#key'), /^demo-key-\d{4}$/);
        assert.match(fresh.text, /A fresh key, demo-key-\d{4}, was entered\./);
      }
    }
    await inspect(K.flight);
    const cancelAttempt = await act('Cancel is a POST the helper blocks', async () => { await page.focus('#recovery-cancel'); await press('Enter'); }, { announced: 2 });
    assert.match(cancelAttempt.text, /^Unknown\. Code NO_VALID_RESPONSE\./);
    assert.equal((await call(prepared.port, 'GET', `/v1/steps/${K.flight}`)).status, 202, 'the step is still in flight: the blocked cancel changed nothing');
    checked('a blocked recovery POST (Cancel) is again UNKNOWN and changes nothing on the service', cancelAttempt.text);

    const over = await act('start over', async () => { await page.focus('#start-over'); await press('Enter'); }, { announced: 1 });
    assert.equal(over.focus, 'lesson-A-S001');
    assert.equal(await page.getAttribute('#result', 'data-outcome'), 'none');
    checked('start over: focus on the first lesson, nothing chosen, no result, announced once', over.text);

    const durations = async () => page.evaluate(() => getComputedStyle(document.getElementById('submit')).transitionDuration);
    assert.equal(await durations(), '0.15s');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await durations(), '0s');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    for (const [width, scale] of [[1280, '100%'], [320, '100%'], [320, '200%']]) {
      await page.setViewportSize({ width, height: 700 });
      await page.evaluate((size) => { document.documentElement.style.fontSize = size; }, scale);
      const metrics = await page.evaluate(() => ({
        horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        clipped: [...document.querySelectorAll('body *')].filter((element) => !['INPUT', 'SELECT', 'TEXTAREA', 'IFRAME'].includes(element.tagName)).filter((element) => { const style = getComputedStyle(element); return ['hidden', 'clip'].includes(style.overflowX) || ['hidden', 'clip'].includes(style.overflowY); }).filter((element) => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1).map((element) => element.id || element.tagName),
      }));
      assert.ok(metrics.horizontal <= 1, `${width}px at ${scale}: horizontal scroll ${metrics.horizontal}`);
      assert.deepEqual(metrics.clipped, [], `${width}px at ${scale}: clipped content`);
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    checked('reduced motion turns every transition off; the page reflows at 320 px and at 200% text size with no horizontal scroll and no clipped content', {});

    const verdicts = await page.evaluate(async () => {
      const transcript = await (await fetch('/transcript.json')).json();
      return transcript.events.filter((event) => event.kind === 'exchange' && event.response.body.kind === 'C042-step-result').map((event) => {
        const view = globalThis.C059Journey.present(event.response, globalThis.C059Journey.expectedFor(event.request));
        return { ok: view.ok, outcome: view.outcome, success: /succe/i.test(view.announcement) };
      });
    });
    assert.ok(verdicts.length >= 10 && verdicts.every((item) => item.ok));
    assert.ok(verdicts.every((item) => item.success === (item.outcome === 'succeeded')), 'success wording only for succeeded outcomes');
    assert.deepEqual([...new Set(verdicts.map((item) => item.outcome))].sort(), ['cancelled', 'interrupted', 'rejected', 'succeeded', 'unknown', 'unsupported']);
    checked('the server-produced transcript (the POST journey the browser cannot make) is re-derived by the page rules in Edge: every envelope valid, success wording only for succeeded', { envelopes: verdicts.length });

    // Review F1 on the REAL DOM: every named negative fixture is reported by name, the positives are clean, and real Tab presses never reach the
    // controls that are not in the Tab order (found independently of the focusable set by unreachable()). The page document is replaced for this
    // part, so it runs after every page observation above.
    // The page CSP (style-src 'self') blocks inline style ATTRIBUTES in markup, so the fixtures' style attributes are applied through the CSSOM, which it allows.
    const load = (fixture) => page.evaluate(({ html, focus }) => {
      document.open();
      document.write(html.replace(/ style="([^"]*)"/g, ' data-fixture-style="$1"'));
      document.close();
      for (const element of document.querySelectorAll('[data-fixture-style]')) { element.style.cssText = element.getAttribute('data-fixture-style'); element.removeAttribute('data-fixture-style'); }
      document.getElementById(focus)?.focus();
      const isHidden = (element) => { const style = getComputedStyle(element); return style.display === 'none' || style.visibility === 'hidden'; };
      return globalThis.C059A11y.check(document, { isHidden }).findings.map((item) => item.code);
    }, { html: documentHtml(fixture), focus: fixture.focus ?? 'top' });
    const reported = {};
    for (const fixture of NEGATIVES) {
      const found = await load(fixture);
      reported[fixture.id] = [...new Set(found)];
      for (const code of fixture.codes) assert.ok(found.includes(code), `${fixture.id} (${fixture.name}): ${code} missing on the real DOM in [${reported[fixture.id]}]`);
      for (const code of fixture.absent ?? []) assert.ok(!found.includes(code), `${fixture.id}: ${code} must not be reported on the real DOM`);
    }
    checked('the named negative fixtures (K3, K5-K15, V2, V3 and the boundary fixtures X1-X24) are each reported BY NAME on the real DOM in Edge', { fixtures: NEGATIVES.length, K5: reported.K5, K6: reported.K6, V2: reported.V2 });
    const walked = {};
    for (const fixture of NEGATIVES.filter((item) => item.unreachable)) {
      await load(fixture);
      const visited = [];
      for (let step = 0; step < 4; step += 1) { await press('Tab'); visited.push(await active()); }
      assert.ok(!visited.includes(fixture.unreachable), `${fixture.id}: Tab reached #${fixture.unreachable} in Edge: ${visited}`);
      const missed = await page.evaluate((ids) => globalThis.C059A11y.unreachable(document, ids.map((id) => document.getElementById(id)).filter(Boolean)).map((element) => element.id), visited);
      assert.ok(missed.includes(fixture.unreachable), `${fixture.id}: unreachable() did not name #${fixture.unreachable}`);
      walked[fixture.id] = visited;
    }
    for (const fixture of POSITIVES) assert.deepEqual(await load(fixture), [], `${fixture.id} (${fixture.name}) has no finding on the real DOM`);
    await load(POSITIVES.find((item) => item.id === 'P1'));
    const roving = [];
    for (let step = 0; step < 3; step += 1) { await press('Tab'); roving.push(await active()); }
    assert.ok(roving.includes('r1') && !roving.includes('r2'), `a roving radio group is ONE Tab stop in Edge: ${roving}`);
    checked('real Tab presses in Edge never reach the controls that are not in the Tab order (K5-K8, X12, X13, X24), unreachable() names them, the positives (P1-P13, among them the decorative aria-hidden controls and nav role=tablist) are clean and a roving radio group is one Tab stop', { walked, roving });

    // Every console error is classified: the blocked POSTs (the helper aborts them: one error per POST the page attempted), the one typed 404
    // (STEP_NOT_FOUND) and the service-worker message of the sandboxed lesson frame (its own content). Anything else fails.
    // The sandboxed lesson (accepted C041 content) reads navigator.serviceWorker and fails inside its opaque origin: that uncaught error is
    // its own, so it is attributed only when no C059 source mentions serviceWorker and the lesson was opened exactly once.
    const own = ['a11y-check.js', 'journey.js', 'page.js', 'server.cjs', 'index.html'].map((name) => require('node:fs').readFileSync(path.join(__dirname, '..', name), 'utf8')).join('\n');
    assert.doesNotMatch(own, /serviceWorker/, 'no C059 source touches serviceWorker');
    const lessonErrors = pageErrors.filter((message) => /serviceWorker/.test(message) && /sandboxed/.test(message));
    assert.deepEqual(pageErrors.filter((message) => !lessonErrors.includes(message)), [], 'no uncaught page error of C059 own');
    assert.ok(lessonErrors.length <= 1, 'at most the one lesson-frame error');
    const blockedErrors = consoleErrors.filter((item) => /ERR_BLOCKED_BY_CLIENT/.test(item.text));
    const notFound = consoleErrors.filter((item) => /status of 404/.test(item.text));
    const lesson = consoleErrors.filter((item) => /serviceWorker/.test(item.text) && item.url.includes('/c041-lessons/'));
    const unexpected = consoleErrors.filter((item) => ![...blockedErrors, ...notFound, ...lesson].includes(item));
    assert.deepEqual(unexpected, [], 'no console error other than the blocked POSTs, the typed 404 and the lesson frame');
    assert.equal(blockedErrors.length, requests.filter((item) => item.startsWith('POST')).length, 'one blocked-request error per POST the page attempted');
    assert.equal(notFound.length, 1, 'exactly the STEP_NOT_FOUND answer');
    summary.consoleErrors = { blockedPosts: blockedErrors.length, typed404: notFound.length, lessonFrameServiceWorker: lesson.length };
    checked('no uncaught page error; every console error is a blocked POST, the typed 404 or the lesson frame own service-worker message (no CSP violation)', summary.consoleErrors);
    summary.requests = requests;
    console.log(JSON.stringify({ summary }));
    return summary;
  } finally {
    if (session) {
      await session.close();
      if (process.env.C059_BROWSER_INJECT_FAILURE === '1') console.log(JSON.stringify({ cleanup: { sessionClosed: true, pageClosed: session.page.isClosed() } }));
    }
    prepared.release();
    await closeServer(prepared.server);
  }
}

main().then(() => { console.log(JSON.stringify({ result: 'ok', checks: checks.length })); }).catch((error) => { console.error(error); process.exitCode = 1; });
