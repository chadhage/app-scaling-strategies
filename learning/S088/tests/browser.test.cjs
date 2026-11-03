'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..', '..', '..');
const lesson = path.resolve(__dirname, '..');
const helperPath = path.join(root, 'testing', 'browser', 'isolated.cjs');
const helperSha256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(fs.readFileSync(helperPath)), helperSha256, 'Only the published browser helper is qualified.');
const { openIsolatedLesson } = require(helperPath);
const playwrightVersion = JSON.parse(fs.readFileSync(path.join(root, 'testing', 'browser', 'node_modules', 'playwright', 'package.json'), 'utf8')).version;

function inventory() {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else {
        assert.ok(entry.isFile());
        files.push({ path: path.relative(lesson, file).split(path.sep).join('/'), sha256: sha(fs.readFileSync(file)) });
      }
    }
  }
  walk(lesson);
  return { count: files.length, sha256: sha(Buffer.from(JSON.stringify(files))) };
}

test('actual isolated Edge: denial, invalid fallback, unknowns, keyboard, strict guards, reset and CSP', { timeout: 120000 }, async () => {
  assert.equal(process.versions.node.split('.')[0], '22');
  assert.equal(playwrightVersion, '1.56.1');
  const before = inventory();
  const checks = [];
  const pageErrors = [];
  const requests = [];
  const startedAtUtc = new Date().toISOString();
  const session = await openIsolatedLesson(path.join('learning', 'S088', 'index.html'));
  let closed = false;
  try {
    assert.match(session.browserVersion, /^156\./);
    const page = session.page;
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => requests.push(request.url()));
    await page.reload({ waitUntil: 'load' });
    const text = (id) => page.locator(`#${id}`).innerText();
    const count = async (id, value) => assert.equal(await text(id), String(value));
    const decision = page.locator('#decision');
    const response = page.locator('#response');
    const run = page.locator('#run-lesson');
    const reset = page.locator('#reset-lesson');
    const history = page.locator('#history tr');
    assert.equal(await page.title(), 'S088 · Permission failure rehearsal');
    assert.equal(await text('training-banner'), 'Training rehearsal - synthetic data - not a live Azure result');
    assert.equal(await decision.inputValue(), 'denied');
    assert.equal(await response.inputValue(), 'explicit');
    await count('attempt-count', 0);
    assert.equal(await page.locator('#operation-outcome').getAttribute('data-outcome'), 'not-run');
    assert.ok(requests.every((url) => url.startsWith('file:')));
    checks.push({ name: 'Portable initial DOM, exact banner, no optimistic outcome, file-only assets', passed: true });

    await decision.focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'response');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'run-lesson');
    await page.keyboard.press('Space');
    await count('attempt-count', 1);
    assert.equal(await text('operation-outcome'), 'failure');
    assert.equal(await text('verifier'), 'pass');
    assert.match(await text('verifier-reason'), /Safe abort.*no migration is claimed/);
    assert.match(await text('response-trace'), /"status": 403/);
    assert.match(await text('response-trace'), /"ok": false/);
    assert.match(await text('response-trace'), /PermissionDenied/);
    assert.equal(await text('old-route'), '100%');
    assert.equal(await text('candidate-route'), '0%');
    assert.match(await text('required-state'), /revision 7 · saved-draft-088/);
    checks.push({ name: 'Keyboard submission: explicit denial fails visibly, observed state unchanged, safe-abort verifier only', passed: true });

    await response.focus();
    await page.keyboard.press('End');
    assert.equal(await response.inputValue(), 'success-shaped');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await count('attempt-count', 2);
    assert.equal(await text('operation-outcome'), 'failure');
    assert.equal(await text('verifier'), 'fail');
    assert.match(await text('verifier-reason'), /Invalid success-shaped error/);
    assert.match(await text('response-trace'), /"status": 200/);
    assert.match(await text('response-trace'), /"ok": true/);
    assert.match(await text('response-trace'), /PermissionDenied/);
    assert.equal(await text('candidate-route'), '0%');
    assert.equal(await history.count(), 2);
    await count('success-count', 0);
    await count('failure-count', 2);
    checks.push({ name: 'Keyboard invalid 200/ok-true error stays operation failure and fails the verifier; prior failure retained', passed: true });

    await decision.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    assert.equal(await decision.inputValue(), 'allowed');
    assert.equal(await response.inputValue(), 'explicit');
    assert.equal(await response.isDisabled(), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'run-lesson');
    await page.keyboard.press('Enter');
    await count('attempt-count', 3);
    assert.equal(await text('operation-outcome'), 'success');
    assert.equal(await text('verifier'), 'pass');
    assert.equal(await text('old-route'), '0%');
    assert.equal(await text('candidate-route'), '100%');
    assert.match(await text('required-state'), /saved-draft-088/);
    assert.doesNotMatch(await text('response-trace'), /PermissionDenied/);
    checks.push({ name: 'Allowed positive fixture has matching observed routing/state and resets denial-only response selection', passed: true });

    await decision.focus();
    await page.keyboard.press('End');
    assert.equal(await decision.inputValue(), 'unknown');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await count('attempt-count', 4);
    assert.equal(await text('operation-outcome'), 'unknown');
    assert.equal(await text('verifier'), 'unknown');
    assert.match(await text('observation-label'), /Last known only/);
    assert.equal(await text('old-route'), '100%');
    assert.equal(await text('candidate-route'), '0%');
    await count('success-count', 1);
    await count('failure-count', 2);
    await count('unknown-count', 1);
    assert.equal(await history.count(), 4);
    checks.push({ name: 'Missing evidence stays unknown; last-known state is labeled and all four attempts remain in denominator', passed: true });

    const priorHistory = await page.locator('#history').innerText();
    await page.evaluate(() => {
      const select = document.getElementById('decision');
      select.add(new Option('Injected invalid teaching value', '<invalid-fixture>'));
      select.value = '<invalid-fixture>';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('lesson-form').requestSubmit();
    });
    assert.equal(await page.locator('#input-error').isVisible(), true);
    assert.match(await text('input-error'), /Input decision.*No rehearsal was recorded/);
    assert.equal(await page.locator('#history').innerText(), priorHistory);
    await count('attempt-count', 4);
    checks.push({ name: 'Actual DOM-injected invalid input is rejected with accessible error and no optimistic/history mutation', passed: true });

    await decision.selectOption('denied');
    assert.equal(await page.locator('#input-error').isHidden(), true);
    await run.click();
    await run.click();
    await count('attempt-count', 6);
    await count('success-count', 1);
    await count('failure-count', 4);
    await count('unknown-count', 1);
    assert.equal(await run.isDisabled(), true);
    const fullHistory = await page.locator('#history').innerText();
    await page.evaluate(() => document.getElementById('lesson-form').requestSubmit());
    assert.match(await text('input-error'), /six-attempt limit/);
    assert.equal(await page.locator('#history').innerText(), fullHistory);
    await count('attempt-count', 6);
    checks.push({ name: 'Six-attempt bound, disabled run, forged excess submit rejected, failures and unknown retained', passed: true });

    await reset.focus();
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'decision');
    assert.equal(await page.evaluate(() => typeof document.getElementById('lesson-form').reset), 'function');
    assert.equal(await decision.inputValue(), 'denied');
    assert.equal(await response.inputValue(), 'explicit');
    assert.equal(await response.isDisabled(), false);
    assert.equal(await run.isDisabled(), false);
    for (const id of ['attempt-count', 'success-count', 'failure-count', 'unknown-count']) await count(id, 0);
    assert.equal(await history.count(), 0);
    assert.equal(await page.locator('#input-error').isHidden(), true);
    assert.equal(await text('operation-outcome'), 'Not run');
    assert.equal(await text('candidate-route'), '0%');
    assert.match(await text('observation-label'), /Baseline fixture only/);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await count('attempt-count', 1);
    await reset.click();
    await count('attempt-count', 0);
    checks.push({ name: 'Real keyboard reset clears ledger/error/results, restores baseline/focus and permits another attempt without form.reset shadowing', passed: true });

    const originalUrl = page.url();
    const fetchResult = await page.evaluate(async () => {
      globalThis.__s088Violations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        globalThis.__s088Violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition });
      });
      const script = document.createElement('script');
      script.textContent = 'globalThis.__s088InlineExecuted = true;';
      document.head.append(script);
      let result;
      try { await fetch('http://127.0.0.1:48188/s088-csp-probe'); result = 'unexpected success'; }
      catch { result = 'blocked'; }
      const form = document.createElement('form');
      form.action = 'http://127.0.0.1:48188/s088-form-probe';
      form.method = 'get';
      document.body.append(form);
      form.submit();
      return result;
    });
    await page.waitForFunction(() => ['script-src-elem', 'connect-src', 'form-action'].every((name) => globalThis.__s088Violations.some((event) => event.directive === name)));
    const violations = await page.evaluate(() => globalThis.__s088Violations);
    assert.equal(fetchResult, 'blocked');
    assert.equal(await page.evaluate(() => globalThis.__s088InlineExecuted), undefined);
    assert.equal(page.url(), originalUrl);
    assert.ok(violations.every((event) => event.disposition === 'enforce'));
    assert.deepEqual(pageErrors, []);
    checks.push({ name: 'Actual enforced CSP blocks inline script, connection and native form navigation', passed: true, violations });
  } finally {
    await session.close();
    closed = true;
  }
  const after = inventory();
  assert.deepEqual(after, before, 'Ordinary browser verification must not modify owned source or historical evidence.');
  assert.equal(closed, true);
  if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
    let output = path.join(lesson, 'evidence', 'browser-acceptance.json');
    for (let suffix = 2; fs.existsSync(output); suffix += 1) output = path.join(lesson, 'evidence', `browser-acceptance-${String(suffix).padStart(3, '0')}.json`);
    fs.writeFileSync(output, `${JSON.stringify({
      schemaVersion: 1, cardId: 'A-S088', workerId: 'worker-A-S088', mode: 'synthetic',
      startedAtUtc, finishedAtUtc: new Date().toISOString(),
      nodeVersion: process.version, playwrightVersion, browserVersion: session.browserVersion,
      helper: { path: 'testing/browser/isolated.cjs', sourceCommit: '53c0c0d82cc1db6780a87ac2b1085734af6d5c60', sha256: helperSha256, api: 'openIsolatedLesson' },
      captureIntent: 'Deliberate CAPTURE_BROWSER_EVIDENCE=1 author capture; ordinary runs do not write.',
      checks, pageErrors, ownedFiles: { before, after, unchanged: true },
      cleanup: { awaitedCloseInFinally: true, completed: closed },
      limits: 'Existing offline PW1.56.1 / installed signed Edge156 / Node22 tooling only; not production24, native Azure, real permission operations, source-parent completion or unattended runner qualification. Published helper lifecycle limitation remains; no recovery prototype.',
    }, null, 2)}\n`);
  }
});
