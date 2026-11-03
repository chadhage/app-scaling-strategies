'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', '..', '..');
const lesson = path.resolve(__dirname, '..');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const helperSha256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const helper = path.join(root, 'testing', 'browser', 'isolated.cjs');
assert.equal(sha(fs.readFileSync(helper)), helperSha256, 'Only the exact published browser helper is qualified.');
const { openIsolatedLesson } = require(helper);
const playwrightVersion = JSON.parse(fs.readFileSync(path.join(root, 'testing', 'browser', 'node_modules', 'playwright', 'package.json'), 'utf8')).version;

function inventory() {
  const files = [];
  function walk(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) walk(file);
      else {
        assert.ok(item.isFile());
        files.push({ path: path.relative(lesson, file).split(path.sep).join('/'), sha256: sha(fs.readFileSync(file)) });
      }
    }
  }
  walk(lesson);
  return { count: files.length, sha256: sha(Buffer.from(JSON.stringify(files))) };
}

test('actual isolated Edge: crash/abort versus migration, failures/unknowns, keyboard, guards, reset and enforced CSP', { timeout: 120000 }, async () => {
  assert.equal(process.versions.node.split('.')[0], '22');
  assert.equal(playwrightVersion, '1.56.1');
  const before = inventory();
  const startedAtUtc = new Date().toISOString();
  const checks = [];
  const pageErrors = [];
  const requests = [];
  const session = await openIsolatedLesson(path.join('learning', 'S091', 'index.html'));
  let closed = false;
  try {
    assert.match(session.browserVersion, /^156\./);
    const page = session.page;
    page.on('pageerror', (failure) => pageErrors.push(failure.message));
    page.on('request', (request) => requests.push(request.url()));
    await page.reload({ waitUntil: 'load' });
    const text = (id) => page.locator(`#${id}`).innerText();
    const count = async (id, value) => assert.equal(await text(id), String(value), id);
    const fixture = page.locator('#fixture');
    const conclusion = page.locator('#conclusion');
    const run = page.locator('#run-lesson');
    const reset = page.locator('#reset-lesson');
    const history = page.locator('#history tr');
    const focused = async (id) => assert.equal(await page.evaluate(() => document.activeElement.id), id);

    assert.equal(await page.title(), 'S091 · Candidate warm-up crash rehearsal');
    assert.equal(await text('training-banner'), 'Training rehearsal - synthetic data - not a live Azure result');
    assert.equal(await fixture.inputValue(), 'guarded-crash');
    assert.equal(await conclusion.inputValue(), 'safe-abort');
    await count('attempt-count', 0);
    assert.equal(await text('observed-outcome'), 'Not run');
    assert.equal(await page.locator('#observed-outcome').getAttribute('data-outcome'), 'not-run');
    assert.equal(await text('transition-rate'), 'No transition evidence');
    assert.equal(await history.count(), 0);
    assert.ok(requests.length >= 4 && requests.every((url) => url.startsWith('file:')));
    checks.push({ name: 'Portable initial DOM, exact banner, baseline-only labels, no optimistic result, local file assets', passed: true });

    await fixture.focus();
    await page.keyboard.press('Tab');
    await focused('conclusion');
    await page.keyboard.press('Tab');
    await focused('run-lesson');
    await page.keyboard.press('Space');
    await count('attempt-count', 1);
    assert.equal(await text('observed-outcome'), 'safe-abort');
    assert.equal(await text('acceptance'), 'pass');
    assert.equal(await text('conclusion-check'), 'pass');
    assert.equal(await text('abort-status'), 'acknowledged-before-exposure');
    assert.equal(await text('peak-exposure'), '0 synthetic journeys');
    assert.equal(await text('old-route'), '100%');
    assert.equal(await text('candidate-route'), '0%');
    await count('production-successes', 3);
    await count('transition-attempts', 0);
    await count('migration-count', 0);
    assert.equal(await text('transition-rate'), 'No transition evidence');
    await page.locator('summary').click();
    assert.match(await text('trace'), /"CRASHED"/);
    assert.match(await text('trace'), /Block candidate admission/);
    assert.match(await text('trace'), /"ABORTED"/);
    const firstRow = await history.first().innerText();
    checks.push({ name: 'Keyboard Space submits a visible guarded crash/abort with usable old journeys, zero exposure and no migration credit', passed: true });

    await conclusion.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    assert.equal(await conclusion.inputValue(), 'completed-migration');
    await page.keyboard.press('Tab');
    await focused('run-lesson');
    await page.keyboard.press('Enter');
    await count('attempt-count', 2);
    assert.equal(await text('observed-outcome'), 'safe-abort');
    assert.equal(await text('acceptance'), 'pass');
    assert.equal(await text('conclusion-check'), 'fail');
    assert.match(await text('conclusion-reason'), /not completed-migration/);
    await count('safe-abort-count', 2);
    await count('migration-count', 0);
    assert.equal(await history.first().innerText(), firstRow);
    checks.push({ name: 'Wrong migration conclusion fails without rewriting the safe abort, trace or retained first attempt', passed: true });

    await fixture.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    assert.equal(await fixture.inputValue(), 'forced-exposure');
    await page.keyboard.press('Tab');
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowUp');
    assert.equal(await conclusion.inputValue(), 'interrupted-transition');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await count('attempt-count', 3);
    assert.equal(await text('observed-outcome'), 'interrupted-transition');
    assert.equal(await text('acceptance'), 'fail');
    assert.equal(await text('conclusion-check'), 'pass');
    assert.equal(await text('peak-exposure'), '3 synthetic journeys');
    assert.equal(await text('abort-status'), 'recovery-after-exposure');
    assert.equal(await text('old-route'), '100%');
    assert.equal(await text('candidate-route'), '0%');
    await count('transition-attempts', 3);
    await count('transition-interruptions', 3);
    assert.match(await text('trace'), /"httpStatus": 503/);
    assert.match(await text('acceptance-reason'), /cannot erase the three interrupted/);
    checks.push({ name: 'Unsafe teaching trace fails source acceptance; synthetic recovery retains all three earlier exposure/503 interruptions', passed: true });

    await fixture.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    assert.equal(await fixture.inputValue(), 'production-regression');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await count('attempt-count', 4);
    assert.equal(await text('observed-outcome'), 'interrupted-transition');
    assert.equal(await text('acceptance'), 'fail');
    assert.equal(await text('peak-exposure'), '0 synthetic journeys');
    assert.equal(await text('abort-status'), 'acknowledged-before-exposure');
    await count('production-interruptions', 1);
    await count('transition-attempts', 3);
    assert.match(await text('trace'), /"httpStatus": 200/);
    assert.match(await text('trace'), /"latencyMs": 400/);
    checks.push({ name: 'Visible zero-exposure abort cannot pass production continuity when a slow old-v1 200 exceeds the original budget', passed: true });

    await fixture.focus();
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowUp');
    assert.equal(await fixture.inputValue(), 'missing-evidence');
    await page.keyboard.press('Tab');
    await page.keyboard.press('End');
    assert.equal(await conclusion.inputValue(), 'unknown');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await count('attempt-count', 5);
    assert.equal(await text('observed-outcome'), 'unknown');
    assert.equal(await text('acceptance'), 'unknown');
    assert.equal(await text('conclusion-check'), 'pass');
    assert.equal(await text('old-route'), 'Unknown');
    assert.equal(await text('candidate-route'), 'Unknown');
    assert.equal(await text('peak-exposure'), 'Unknown');
    assert.equal(await text('abort-status'), 'unverified');
    assert.match(await text('route-evidence'), /Unverified; last-known baseline is not current evidence/);
    await count('transition-attempts', 6);
    await count('transition-unknown', 3);
    await count('production-unknown', 3);
    await count('migration-count', 0);
    checks.push({ name: 'Missing observations remain unknown, current routing is not fabricated, and three unknown started transitions remain counted', passed: true });

    await fixture.focus();
    await page.keyboard.press('End');
    assert.equal(await fixture.inputValue(), 'healthy-migration');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    assert.equal(await conclusion.inputValue(), 'completed-migration');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await count('attempt-count', 6);
    assert.equal(await text('observed-outcome'), 'completed-migration');
    assert.equal(await text('acceptance'), 'pass');
    assert.equal(await text('conclusion-check'), 'pass');
    assert.equal(await text('old-route'), '0%');
    assert.equal(await text('candidate-route'), '100%');
    assert.match(await text('retention'), /retained-standby; not retired/);
    assert.match(await text('trace'), /"READY"/);
    assert.match(await text('trace'), /"deploymentEpoch": 2/);
    for (const [id, value] of [['safe-abort-count', 2], ['migration-count', 1], ['interrupted-run-count', 2],
      ['unknown-run-count', 1], ['transition-attempts', 9], ['transition-successes', 3],
      ['transition-interruptions', 3], ['transition-unknown', 3], ['production-successes', 14],
      ['production-interruptions', 1], ['production-unknown', 3]]) await count(id, value);
    assert.match(await text('transition-rate'), /^33\.33% of started synthetic transitions$/);
    assert.equal(await history.count(), 6);
    assert.equal(await history.first().innerText(), firstRow);
    checks.push({ name: 'Healthy comparison has actual synthetic candidate-version movement; six-row aggregate retains safe aborts, failed predictions, interruptions and unknowns', passed: true });

    assert.equal(await run.isDisabled(), true);
    const fullHistory = await page.locator('#history').innerText();
    await page.evaluate(() => document.getElementById('lesson-form').requestSubmit());
    assert.equal(await page.locator('#input-error').isVisible(), true);
    assert.match(await text('input-error'), /six-attempt limit/);
    await focused('input-error');
    assert.equal(await page.locator('#history').innerText(), fullHistory);
    await count('attempt-count', 6);
    checks.push({ name: 'Disabled seventh action and forged form submission both preserve history and show a focused accessible bound error', passed: true });

    await reset.focus();
    await page.keyboard.press('Space');
    await focused('fixture');
    assert.equal(await fixture.inputValue(), 'guarded-crash');
    assert.equal(await conclusion.inputValue(), 'safe-abort');
    assert.equal(await page.evaluate(() => typeof document.getElementById('lesson-form').reset), 'function');
    assert.equal(await run.isDisabled(), false);
    assert.equal(await page.locator('#input-error').isHidden(), true);
    assert.equal(await text('observed-outcome'), 'Not run');
    assert.equal(await text('acceptance'), 'Not run');
    assert.equal(await text('conclusion-check'), 'Not checked');
    assert.equal(await text('route-evidence'), 'Baseline fixture only');
    assert.equal(await text('old-route'), '100%');
    assert.equal(await text('candidate-route'), '0%');
    assert.equal(await text('transition-rate'), 'No transition evidence');
    assert.equal(await history.count(), 0);
    for (const id of ['attempt-count', 'safe-abort-count', 'migration-count', 'interrupted-run-count', 'unknown-run-count',
      'production-successes', 'production-interruptions', 'production-unknown', 'transition-attempts',
      'transition-successes', 'transition-interruptions', 'transition-unknown']) await count(id, 0);
    checks.push({ name: 'Actual keyboard reset clears errors, all accounting and observations, restores defaults/focus and does not shadow form.reset', passed: true });

    await page.evaluate(() => {
      const select = document.getElementById('fixture');
      select.add(new Option('Injected unsupported teaching value', '<invalid-fixture>'));
      select.value = '<invalid-fixture>';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('lesson-form').requestSubmit();
    });
    assert.equal(await page.locator('#input-error').isVisible(), true);
    assert.match(await text('input-error'), /Input fixture.*No rehearsal was recorded/);
    await focused('input-error');
    await count('attempt-count', 0);
    assert.equal(await history.count(), 0);
    assert.equal(await text('observed-outcome'), 'Not run');
    await fixture.selectOption('guarded-crash');
    assert.equal(await page.locator('#input-error').isHidden(), true);
    await page.evaluate(() => {
      const select = document.getElementById('conclusion');
      select.add(new Option('Injected unsupported conclusion', '<invalid-conclusion>'));
      select.value = '<invalid-conclusion>';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('lesson-form').requestSubmit();
    });
    assert.match(await text('input-error'), /Input conclusion.*No rehearsal was recorded/);
    await count('attempt-count', 0);
    assert.equal(await history.count(), 0);
    await reset.focus();
    await page.keyboard.press('Enter');
    await focused('fixture');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await count('attempt-count', 1);
    await page.reload({ waitUntil: 'load' });
    await count('attempt-count', 0);
    assert.equal(await history.count(), 0);
    assert.equal(await page.locator('#input-error').isHidden(), true);
    assert.ok(requests.every((url) => url.startsWith('file:')));
    checks.push({ name: 'Actual invalid fixture/conclusion DOM submissions are rejected without optimistic results; keyboard recovery and reload clear memory-only state', passed: true });

    const originalUrl = page.url();
    const fetchResult = await page.evaluate(async () => {
      globalThis.__s091Violations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        globalThis.__s091Violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition });
      });
      const script = document.createElement('script');
      script.textContent = 'globalThis.__s091InlineExecuted = true;';
      document.head.append(script);
      let result;
      try { await fetch('http://127.0.0.1:48991/s091-csp-probe'); result = 'unexpected success'; }
      catch { result = 'blocked'; }
      const form = document.createElement('form');
      form.action = 'http://127.0.0.1:48991/s091-form-probe';
      form.method = 'get';
      document.body.append(form);
      form.submit();
      return result;
    });
    await page.waitForFunction(() => ['script-src-elem', 'connect-src', 'form-action'].every((name) => globalThis.__s091Violations.some((event) => event.directive === name)));
    const violations = await page.evaluate(() => globalThis.__s091Violations);
    assert.equal(fetchResult, 'blocked');
    assert.equal(await page.evaluate(() => globalThis.__s091InlineExecuted), undefined);
    assert.equal(page.url(), originalUrl);
    assert.ok(violations.every((item) => item.disposition === 'enforce'));
    assert.deepEqual(pageErrors, []);
    checks.push({ name: 'Actual enforced CSP denies inline script, connection and native form navigation without unsafe browser flags', passed: true, violations });
  } finally {
    await session.close();
    closed = true;
  }
  const after = inventory();
  assert.deepEqual(after, before, 'Normal browser verification must not modify owned source or historical evidence.');
  assert.equal(closed, true);
  if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
    let output = path.join(lesson, 'evidence', 'browser-acceptance.json');
    for (let suffix = 2; fs.existsSync(output); suffix += 1) output = path.join(lesson, 'evidence', `browser-acceptance-${String(suffix).padStart(3, '0')}.json`);
    fs.writeFileSync(output, `${JSON.stringify({
      schemaVersion: 1, cardId: 'A-S091', workerId: 'worker-A-S091', packet: 'SC-S091', mode: 'synthetic',
      startedAtUtc, finishedAtUtc: new Date().toISOString(),
      nodeVersion: process.version, playwrightVersion, browserVersion: session.browserVersion,
      helper: { path: 'testing/browser/isolated.cjs', sourceCommit: '53c0c0d82cc1db6780a87ac2b1085734af6d5c60', sha256: helperSha256, api: 'openIsolatedLesson' },
      captureIntent: 'Deliberate CAPTURE_BROWSER_EVIDENCE=1 author capture only; normal reruns are read-only.',
      checks, pageErrors, ownedFiles: { before, after, unchanged: true },
      cleanup: { awaitedCloseInFinally: true, completed: closed },
      limits: 'Existing offline PW1.56.1 / installed signed Edge156 / Node22 tooling only. No production24, native/source-parent proof, real process/candidate crash, readiness/abort/production continuity, or unattended lifecycle qualification. No recovery prototype.',
    }, null, 2)}\n`);
  }
});
