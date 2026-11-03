'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const lessonRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(lessonRoot, '..', '..');
const helperPath = path.join(repoRoot, 'testing', 'browser', 'isolated.cjs');
const approvedHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const digest = (buffer) => createHash('sha256').update(buffer).digest('hex');
assert.equal(digest(fs.readFileSync(helperPath)), approvedHash, 'Only the published isolated helper is qualified');
const { openIsolatedLesson } = require(helperPath);
const playwrightVersion = require(path.join(repoRoot, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const capturedFiles = ['evidence/browser-acceptance.json', 'evidence/raw/browser-dom.json'];
const coreFiles = [
  '.gitattributes', 'README.md', 'app.js', 'index.html', 'latency-budget.feature',
  'manifest.json', 'model.js', 'styles.css',
  'tests/browser.test.cjs', 'tests/bundle.test.cjs', 'tests/model.test.cjs',
];
const ownedPath = (relative) => path.join(lessonRoot, ...relative.split('/'));

function snapshotOwned(directory = lessonRoot) {
  const result = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), 'Owned files cannot be links');
    if (entry.isDirectory()) Object.assign(result, snapshotOwned(target));
    else {
      const relative = path.relative(lessonRoot, target).split(path.sep).join('/');
      if (!(capture && capturedFiles.includes(relative))) result[relative] = digest(fs.readFileSync(target));
    }
  }
  return result;
}

test('S093 actual isolated DOM, keyboard, guards, history and CSP', { timeout: 120000 }, async (t) => {
  assert.match(process.version, /^v22\./);
  assert.equal(playwrightVersion, '1.56.1');
  const preflight = JSON.parse(fs.readFileSync(ownedPath('evidence/tooling-preflight.json'), 'utf8'));
  const before = snapshotOwned();
  const startedAtUtc = new Date().toISOString();
  const checks = [];
  const observations = [];
  const requests = [];
  const pageErrors = [];
  const consoleErrors = [];
  let closed = false;
  const session = await openIsolatedLesson(path.join('learning', 'S093', 'index.html'));
  const page = session.page;
  page.on('request', (request) => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  const text = (selector) => page.locator(selector).textContent();
  const activeId = () => page.evaluate(() => document.activeElement.id);
  const historyCount = () => page.locator('#history > li').count();
  const submit = () => page.locator('#apply-decision').click();
  const reset = async () => {
    await page.locator('#reset-rehearsal').focus();
    await page.keyboard.press('Space');
    assert.equal(await activeId(), 'scenario');
    assert.equal(await page.locator('#scenario').inputValue(), 'slow-200');
    assert.equal(await page.locator('#budget').inputValue(), '1000');
    assert.equal(await page.locator('#action').inputValue(), 'expand');
    assert.equal(await page.locator('#result').isHidden(), true);
    assert.equal(await page.locator('#error').isHidden(), true);
    assert.equal(await page.evaluate(() => typeof document.getElementById('rehearsal-controls').reset), 'function');
  };
  const observe = async (label) => {
    observations.push(await page.evaluate((name) => {
      const get = (id) => document.getElementById(id);
      return {
        label: name,
        banner: document.querySelector('.banner').textContent,
        controls: { scenario: get('scenario').value, budget: get('budget').value, action: get('action').value },
        current: {
          visible: !get('result').hidden,
          acceptance: get('result').dataset.acceptance || null,
          verifier: get('result').dataset.verifier || null,
          verdict: get('verdict').textContent,
          routing: get('routing').textContent,
          metrics: Object.fromEntries(['attempted', 'http200', 'success', 'interrupted', 'unknown'].map((key) => [key, get(`sample-${key}`).textContent])),
        },
        trace: [...get('trace').rows].map((row) => [...row.cells].map((cell) => cell.textContent)),
        totals: Object.fromEntries(['runs', 'attempted', 'success', 'interrupted', 'unknown'].map((key) => [key, get(`total-${key}`).textContent])),
        history: [...get('history').children].map((item) => item.textContent),
        error: { visible: !get('error').hidden, text: get('error').textContent },
        activeId: document.activeElement.id,
      };
    }, label));
  };
  const check = async (name, operation) => {
    await t.test(name, async () => {
      await operation();
      checks.push({ name, passed: true });
    });
    assert.ok(checks.some((item) => item.name === name), `No qualified pass for ${name}`);
  };

  try {
    await check('keyboard slow-200 rejection and real rendered trace', async () => {
      assert.equal(session.browserVersion, preflight.browser.productVersion);
      assert.match(session.browserVersion, /^156\./);
      assert.match(await page.title(), /S093.*Latency regression without errors/);
      assert.equal(await text('.banner'), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await text('#total-attempted'), '0');
      await page.keyboard.press('Tab');
      assert.equal(await activeId(), 'scenario');
      await page.keyboard.press('Tab');
      assert.equal(await activeId(), 'budget');
      await page.keyboard.press('Tab');
      assert.equal(await activeId(), 'action');
      await page.keyboard.press('Tab');
      assert.equal(await activeId(), 'apply-decision');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#result').getAttribute('data-acceptance'), 'failure');
      assert.equal(await page.locator('#result').getAttribute('data-verifier'), 'fail');
      assert.match(await text('#routing'), /blocked.*25% → 25%/);
      for (const [key, value] of Object.entries({ attempted: '3', http200: '3', success: '1', interrupted: '2', unknown: '0' })) {
        assert.equal(await text(`#sample-${key}`), value);
      }
      assert.equal(await page.locator('#trace > tr').count(), 3);
      assert.match(await text('#trace'), /1700 ms1000 msinterrupted/);
      assert.match(await text('#trace'), /2400 ms1000 msinterrupted/);
      assert.equal(await historyCount(), 1);
      assert.equal(await text('#total-interrupted'), '2');
      assert.equal(await page.locator('#apply-decision').isDisabled(), true);
      await observe('slow200-failed-acceptance');
    });

    await check('duplicate and invalid-input errors with keyboard reset and retained history', async () => {
      await page.evaluate(() => document.getElementById('rehearsal-controls')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      assert.match(await text('#error'), /ERR_STATE/);
      assert.equal(await activeId(), 'error');
      assert.equal(await historyCount(), 1);
      await reset();
      assert.equal(await historyCount(), 1);
      assert.equal(await text('#total-interrupted'), '2');
      await page.evaluate(() => {
        const select = document.getElementById('scenario');
        select.add(new Option('Unsupported injected choice', 'not-a-fixture'));
        select.value = 'not-a-fixture';
      });
      await submit();
      assert.match(await text('#error'), /ERR_INPUT/);
      assert.equal(await activeId(), 'error');
      assert.equal(await historyCount(), 1);
      assert.equal(await page.locator('#result').isHidden(), true);
      await reset();
      await page.evaluate(() => {
        const select = document.getElementById('budget');
        select.add(new Option('Coercible numeric input', '1e3'));
        select.value = '1e3';
      });
      await submit();
      assert.match(await text('#error'), /ERR_INPUT.*numeric coercion/);
      assert.equal(await historyCount(), 1);
      await observe('guard-error-no-new-history');
      await reset();
    });

    await check('safe hold stays failed acceptance and later keyboard success preserves interruptions', async () => {
      await page.locator('#action').selectOption('hold');
      await submit();
      assert.equal(await page.locator('#result').getAttribute('data-acceptance'), 'failure');
      assert.equal(await page.locator('#result').getAttribute('data-verifier'), 'pass');
      assert.match(await text('#routing'), /held.*25% → 25%/);
      assert.equal(await text('#total-interrupted'), '4');
      await observe('safe-hold-still-interrupted');
      await reset();
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#scenario').inputValue(), 'within-budget');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#result').getAttribute('data-acceptance'), 'success');
      assert.equal(await page.locator('#result').getAttribute('data-verifier'), 'pass');
      assert.match(await text('#routing'), /allowed.*25% → 50%/);
      assert.equal(await text('#sample-success'), '3');
      assert.equal(await text('#total-attempted'), '9');
      assert.equal(await text('#total-success'), '5');
      assert.equal(await text('#total-interrupted'), '4');
      assert.equal(await page.locator('#history > li[data-acceptance="failure"]').count(), 2);
      await observe('later-success-retains-failure');
    });

    await check('unknown latency blocks expansion without inflating success', async () => {
      await reset();
      await page.locator('#scenario').selectOption('unmeasured-200');
      await submit();
      assert.equal(await page.locator('#result').getAttribute('data-acceptance'), 'unknown');
      assert.equal(await page.locator('#result').getAttribute('data-verifier'), 'unknown');
      assert.equal(await text('#sample-success'), '2');
      assert.equal(await text('#sample-unknown'), '1');
      assert.equal(await text('#sample-attempted'), '3');
      assert.match(await text('#routing'), /blocked.*25% → 25%/);
      assert.equal(await text('#total-attempted'), '12');
      assert.equal(await text('#total-success'), '7');
      assert.equal(await text('#total-interrupted'), '4');
      assert.equal(await text('#total-unknown'), '1');
      await observe('unknown-latency-is-not-success');
    });

    await check('six-decision bound and reset cannot discard failure accounting', async () => {
      for (let i = 0; i < 2; i += 1) {
        await reset();
        await page.locator('#scenario').selectOption('within-budget');
        await submit();
      }
      assert.equal(await historyCount(), 6);
      await reset();
      assert.equal(await historyCount(), 6);
      assert.equal(await text('#total-attempted'), '18');
      assert.equal(await text('#total-success'), '13');
      assert.equal(await text('#total-interrupted'), '4');
      assert.equal(await text('#total-unknown'), '1');
      assert.equal(await page.locator('#apply-decision').isDisabled(), true);
      assert.match(await text('#current-status'), /Session full/);
      await page.evaluate(() => document.getElementById('rehearsal-controls')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      assert.match(await text('#error'), /ERR_HISTORY_LIMIT/);
      assert.equal(await activeId(), 'error');
      assert.equal(await historyCount(), 6);
      await observe('bounded-history-retains-interruptions');
    });

    await check('actual inline-script CSP refusal and no HTTP requests or runtime errors', async () => {
      await page.evaluate(() => {
        window.__s093PolicyViolations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          window.__s093PolicyViolations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        const script = document.createElement('script');
        script.textContent = 'window.__s093InlineExecuted = true;';
        document.body.append(script);
      });
      await page.waitForFunction(() => window.__s093PolicyViolations.length > 0, null, { timeout: 5000 });
      const policy = await page.evaluate(() => ({
        executed: window.__s093InlineExecuted === true,
        violations: window.__s093PolicyViolations,
      }));
      assert.equal(policy.executed, false);
      assert.ok(policy.violations.some((event) => event.directive.startsWith('script-src') && event.blockedURI === 'inline'));
      assert.deepEqual(requests, []);
      assert.deepEqual(pageErrors, []);
      assert.ok(consoleErrors.every((message) => /Content Security Policy|script-src/i.test(message)));
      observations.push({ label: 'actual-csp-refusal', ...policy, actualHttpRequests: requests.length, pageErrors, consoleErrors });
    });
  } finally {
    await session.close();
    closed = true;
  }
  assert.equal(closed, true);
  assert.deepEqual(snapshotOwned(), before, 'Browser verification changed owned files');
  if (capture) {
    const sourceCanonicalSha256 = Object.fromEntries(coreFiles.map((relative) => [
      relative, digest(Buffer.from(fs.readFileSync(ownedPath(relative), 'utf8').replace(/\r\n/g, '\n'))),
    ]));
    const evidence = {
      cardId: 'A-S093', workerId: 'worker-A-S093', sourceId: 'S093', parentId: 'D-S093',
      packet: 'SC-S093', kano: 'S', kanoUnit: 'A-S093', outcome: 'passed',
      mode: 'fixed synthetic data, actual local browser interaction only',
      startedAtUtc, completedAtUtc: new Date().toISOString(),
      command: 'CAPTURE_BROWSER_EVIDENCE=1 node --test learning\\S093\\tests\\browser.test.cjs',
      node: process.version, playwright: playwrightVersion, browserVersion: session.browserVersion,
      helper: { path: 'testing\\browser\\isolated.cjs', publishedCommit: '53c0c0d82cc1db6780a87ac2b1085734af6d5c60', sha256: approvedHash },
      checks, actualHttpRequests: requests.length, sourceCanonicalSha256,
      rawDom: 'raw/browser-dom.json',
      normalVerificationReadOnly: true,
      cleanup: { awaitedFinallyClose: true, returned: closed, limit: 'Published helper has documented lifecycle limits; no unattended recovery certification' },
      abandonedPrototypeUsed: false,
      captureWasExplicit: true, extraCredit: 0,
      limits: 'No real HTTP, elapsed latency, load, user-journey acceptance, native Azure, source-parent, production Node 24 or reliability certification.',
      reviewer: 'Parent controller only', acceptedAtUtc: null,
    };
    fs.writeFileSync(ownedPath(capturedFiles[1]), JSON.stringify({ provenance: evidence.command, observations }, null, 2) + '\n');
    fs.writeFileSync(ownedPath(capturedFiles[0]), JSON.stringify(evidence, null, 2) + '\n');
  }
});
