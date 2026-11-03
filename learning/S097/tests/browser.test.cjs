'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..', '..');
const owned = (relative) => path.join(root, ...relative.split(/[\\/]/));
const digest = (buffer) => createHash('sha256').update(buffer).digest('hex');
const helperPath = path.join(repoRoot, 'testing', 'browser', 'isolated.cjs');
const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
assert.equal(digest(fs.readFileSync(helperPath)), helperHash, 'Only the published helper is qualified');
const { openIsolatedLesson } = require(helperPath);
const playwrightVersion = require(path.join(repoRoot, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const captureFiles = [path.join('evidence', 'browser-acceptance.json'), path.join('evidence', 'raw', 'browser-dom.json')];
const coreFiles = [
  '.gitattributes', 'README.md', 'app.js', 'index.html', 'standby-promise.feature',
  'manifest.json', 'model.js', 'styles.css',
  path.join('tests', 'browser.test.cjs'), path.join('tests', 'bundle.test.cjs'), path.join('tests', 'model.test.cjs'),
];

function snapshot(directory = root) {
  const result = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    assert.ok(!entry.isSymbolicLink(), 'Owned evidence must not be a link');
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(result, snapshot(target));
    else {
      const relative = path.relative(root, target);
      if (!(capture && captureFiles.includes(relative))) result[relative] = digest(fs.readFileSync(target));
    }
  }
  return result;
}

test('S097 actual isolated DOM, keyboard, errors, reset, retained failures and CSP', { timeout: 120000 }, async (t) => {
  assert.match(process.version, /^v22\./);
  assert.equal(playwrightVersion, '1.56.1');
  const preflight = JSON.parse(fs.readFileSync(owned('evidence\\tooling-preflight.json'), 'utf8'));
  const before = snapshot();
  const startedAtUtc = new Date().toISOString();
  const checks = [];
  const observations = [];
  const requests = [];
  const pageErrors = [];
  const consoleErrors = [];
  let closed = false;
  const session = await openIsolatedLesson(path.join('learning', 'S097', 'index.html'));
  const page = session.page;
  page.on('request', (request) => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  const text = (selector) => page.locator(selector).textContent();
  const activeId = () => page.evaluate(() => document.activeElement.id);
  const countHistory = () => page.locator('#history > li').count();
  const submit = () => page.locator('#check-promise').click();
  const dispatchSubmit = () => page.evaluate(() => document.getElementById('rehearsal-controls')
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  const reset = async () => {
    await page.locator('#reset-rehearsal').focus();
    await page.keyboard.press('Space');
    assert.equal(await activeId(), 'fixture');
    assert.equal(await page.locator('#fixture').inputValue(), 'cold-gap');
    assert.equal(await page.locator('#budget').inputValue(), '6');
    assert.equal(await page.locator('#answer').inputValue(), 'promise-met');
    assert.equal(await page.locator('#result').isHidden(), true);
    assert.equal(await page.locator('#error').isHidden(), true);
    assert.equal(await page.evaluate(() => typeof document.getElementById('rehearsal-controls').reset), 'function');
  };
  const observe = async (label) => {
    observations.push(await page.evaluate((name) => {
      const get = (id) => document.getElementById(id);
      const rows = (id) => [...get(id).rows].map((row) => [...row.cells].map((cell) => cell.textContent));
      return {
        label: name,
        banner: document.querySelector('.banner').textContent,
        controls: Object.fromEntries(['fixture', 'budget', 'answer'].map((id) => [id, get(id).value])),
        current: {
          visible: !get('result').hidden,
          acceptance: get('result').dataset.acceptance || null,
          verifier: get('result').dataset.verifier || null,
          verdict: get('verdict').textContent,
          decision: get('decision-verifier').textContent,
          recovery: get('recovery-impact').textContent,
          retention: get('retention-gate').textContent,
          capacity: get('selected-capacity').textContent,
        },
        comparison: rows('comparison'), trace: rows('trace'),
        totals: Object.fromEntries(['attempted', 'success', 'failure', 'unknown'].map((key) => [key, get(`total-${key}`).textContent])),
        history: [...get('history').children].map((item) => ({ acceptance: item.dataset.acceptance, text: item.textContent })),
        error: { visible: !get('error').hidden, text: get('error').textContent },
        status: get('current-status').textContent,
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
    await check('keyboard cold-promise failure with real warm/cold comparison and phase trace', async () => {
      assert.equal(session.browserVersion, preflight.browser.productVersion);
      assert.match(session.browserVersion, /^156\./);
      assert.match(await page.title(), /S097.*Warm and cold rollback standby/);
      assert.equal(await text('.banner'), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await text('#total-attempted'), '0');
      assert.match(await text('#history-evidence'), /No evidence/);
      for (const id of ['fixture', 'budget', 'answer', 'check-promise']) {
        await page.keyboard.press('Tab');
        assert.equal(await activeId(), id);
      }
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#result').getAttribute('data-acceptance'), 'failure');
      assert.equal(await page.locator('#result').getAttribute('data-verifier'), 'fail');
      assert.match(await text('#recovery-impact'), /failure.*20 s > original 6 s/);
      assert.match(await text('#retention-gate'), /failure.*cold 180–258 s/);
      assert.match(await text('#cold-delay'), /16 s extra cold delay/);
      assert.equal(await page.locator('#comparison > tr').count(), 2);
      assert.match(await text('#comparison'), /Warm retained standby.*4 ssuccesssuccess/);
      assert.match(await text('#comparison'), /Cold rollback standby.*20 sfailurefailure/);
      assert.equal(await page.locator('#trace > tr').count(), 4);
      assert.match(await text('#trace'), /Reactivate capacity4 s4 s.*Warm up12 s16 s/);
      assert.equal(await text('#sample-failure'), '1');
      assert.equal(await text('#total-failure'), '1');
      assert.equal(await countHistory(), 1);
      assert.equal(await page.locator('#check-promise').isDisabled(), true);
      await observe('cold-6-second-promise-failure');
    });

    await check('duplicate and all input guards announce errors; keyboard reset preserves history and form.reset', async () => {
      await dispatchSubmit();
      assert.match(await text('#error'), /ERR_STATE/);
      assert.equal(await activeId(), 'error');
      assert.equal(await page.locator('#error').getAttribute('role'), 'alert');
      assert.equal(await countHistory(), 1);
      await observe('duplicate-error');
      for (const [id, value] of [['fixture', 'not-a-fixture'], ['budget', '06'], ['answer', 'success']]) {
        await reset();
        await page.evaluate(({ id: target, value: injected }) => {
          const select = document.getElementById(target);
          select.add(new Option('Unsupported injected choice', injected));
          select.value = injected;
        }, { id, value });
        await submit();
        assert.match(await text('#error'), /ERR_INPUT/);
        assert.equal(await activeId(), 'error');
        assert.equal(await countHistory(), 1);
        assert.equal(await text('#total-failure'), '1');
        assert.equal(await page.locator('#result').isHidden(), true);
        await observe(`${id}-input-error`);
      }
      await reset();
      assert.equal(await countHistory(), 1);
      assert.equal(await text('#total-failure'), '1');
      await observe('keyboard-reset-retains-cold-failure');
    });

    await check('correct failure answer passes only the verifier, retaining failed promise checks', async () => {
      await page.locator('#answer').selectOption('promise-violated');
      await submit();
      assert.equal(await page.locator('#result').getAttribute('data-acceptance'), 'failure');
      assert.equal(await page.locator('#result').getAttribute('data-verifier'), 'pass');
      assert.equal(await text('#sample-success'), '0');
      assert.equal(await text('#sample-failure'), '1');
      assert.equal(await text('#total-attempted'), '2');
      assert.equal(await text('#total-failure'), '2');
      assert.equal(await text('#total-success'), '0');
      await observe('correct-detection-not-promise-success');
    });

    await check('larger timing budget cannot repair a cold retention gap or rewrite the original budget', async () => {
      await reset();
      await page.locator('#budget').selectOption('24');
      await page.locator('#answer').selectOption('promise-violated');
      await submit();
      assert.equal(await page.locator('#result').getAttribute('data-acceptance'), 'failure');
      assert.equal(await page.locator('#result').getAttribute('data-verifier'), 'pass');
      assert.match(await text('#recovery-impact'), /success.*20 s ≤ original 24 s/);
      assert.match(await text('#retention-gate'), /failure.*cold 180–258 s/);
      assert.match(await text('#comparison'), /Cold rollback standby.*20 ssuccessfailure/);
      assert.match(await page.locator('#history > li').first().textContent(), /original budget 6 s.*timing failure/);
      assert.equal(await text('#total-failure'), '3');
      await observe('cold-24-second-timing-success-retention-failure');
    });

    await check('keyboard warm-ready success retains all earlier cold failures', async () => {
      await reset();
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#fixture').inputValue(), 'warm-ready');
      for (const id of ['budget', 'answer', 'check-promise']) {
        await page.keyboard.press('Tab');
        assert.equal(await activeId(), id);
      }
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#result').getAttribute('data-acceptance'), 'success');
      assert.equal(await page.locator('#result').getAttribute('data-verifier'), 'pass');
      assert.match(await text('#recovery-impact'), /success.*4 s ≤ original 6 s/);
      assert.match(await text('#selected-capacity'), /12 \/ 10 required/);
      assert.equal(await text('#total-attempted'), '4');
      assert.equal(await text('#total-success'), '1');
      assert.equal(await text('#total-failure'), '3');
      assert.equal(await page.locator('#history > li[data-acceptance="failure"]').count(), 3);
      await observe('later-warm-success-retains-failures');
    });

    await check('unknown and insufficient capacity stay counted; six-check reset cannot renew the allowance', async () => {
      await reset();
      await page.locator('#fixture').selectOption('missing-evidence');
      await page.locator('#answer').selectOption('unverified');
      await submit();
      assert.equal(await page.locator('#result').getAttribute('data-acceptance'), 'unknown');
      assert.equal(await page.locator('#result').getAttribute('data-verifier'), 'pass');
      assert.match(await text('#recovery-impact'), /unknown.*unobserved/);
      assert.match(await text('#trace'), /Warm upunknownunknown/);
      assert.equal(await text('#sample-unknown'), '1');
      assert.equal(await text('#total-unknown'), '1');
      assert.equal(await text('#total-attempted'), '5');
      await observe('unknown-selected-evidence-not-reference-success');
      await reset();
      await page.locator('#fixture').selectOption('capacity-shortfall');
      await page.locator('#answer').selectOption('promise-violated');
      await submit();
      assert.equal(await page.locator('#result').getAttribute('data-acceptance'), 'failure');
      assert.equal(await page.locator('#result').getAttribute('data-verifier'), 'pass');
      assert.match(await text('#recovery-impact'), /success.*4 s ≤ original 6 s/);
      assert.match(await text('#selected-capacity'), /6 \/ 10 required/);
      assert.match(await text('#reasons'), /cannot serve the declared demand/);
      await observe('fast-insufficient-capacity-fails-promise');
      await reset();
      assert.equal(await countHistory(), 6);
      for (const [key, value] of Object.entries({ attempted: '6', success: '1', failure: '4', unknown: '1' })) {
        assert.equal(await text(`#total-${key}`), value);
      }
      assert.equal(await page.locator('#check-promise').isDisabled(), true);
      assert.match(await text('#current-status'), /Session full/);
      await dispatchSubmit();
      assert.match(await text('#error'), /ERR_HISTORY_LIMIT/);
      assert.equal(await activeId(), 'error');
      assert.equal(await countHistory(), 6);
      await reset();
      assert.equal(await countHistory(), 6);
      assert.equal(await text('#total-failure'), '4');
      assert.equal(await text('#total-unknown'), '1');
      await observe('full-session-reset-retains-every-outcome');
    });

    await check('actual CSP refuses inline script without HTTP requests or unexpected browser errors', async () => {
      await page.evaluate(() => {
        window.__s097Violations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          window.__s097Violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        const script = document.createElement('script');
        script.textContent = 'window.__s097InlineExecuted = true;';
        document.body.append(script);
      });
      await page.waitForFunction(() => window.__s097Violations.length > 0, null, { timeout: 5000 });
      const policy = await page.evaluate(() => ({
        executed: window.__s097InlineExecuted === true,
        violations: window.__s097Violations,
        resourceURLs: performance.getEntriesByType('resource').map((entry) => entry.name),
      }));
      assert.equal(policy.executed, false);
      assert.ok(policy.violations.some((event) => event.directive.startsWith('script-src') && event.blockedURI === 'inline'));
      assert.ok(policy.resourceURLs.every((url) => url.startsWith('file:')));
      assert.deepEqual(requests, []);
      assert.deepEqual(pageErrors, []);
      assert.ok(consoleErrors.every((message) => /Content Security Policy|script-src/i.test(message)));
      observations.push({ label: 'actual-inline-csp-refusal', ...policy, actualHttpRequests: requests.length, pageErrors, consoleErrors });
    });
  } finally {
    await session.close();
    closed = true;
  }
  assert.equal(closed, true);
  assert.deepEqual(snapshot(), before, 'Browser verification changed owned files');
  if (capture) {
    const sourceCanonicalSha256 = Object.fromEntries(coreFiles.map((relative) => [
      relative, digest(Buffer.from(fs.readFileSync(owned(relative), 'utf8').replace(/\r\n/g, '\n'))),
    ]));
    const command = 'CAPTURE_BROWSER_EVIDENCE=1 node --test learning\\S097\\tests\\browser.test.cjs';
    const evidence = {
      cardId: 'A-S097', workerId: 'worker-A-S097', sourceId: 'S097', parentId: 'D-S097',
      packet: 'LP-COMPARE', kano: 'S', kanoUnit: 'A-S097', outcome: 'passed',
      mode: 'Fixed synthetic teaching data; actual local browser interaction only',
      startedAtUtc, completedAtUtc: new Date().toISOString(), command,
      node: process.version, playwright: playwrightVersion, browserVersion: session.browserVersion,
      helper: { path: path.join('testing', 'browser', 'isolated.cjs'), publishedCommit: preflight.helper.publishedCommit, sha256: helperHash },
      checks, actualHttpRequests: requests.length, sourceCanonicalSha256,
      rawDom: path.join('raw', 'browser-dom.json'), captureWasExplicit: true,
      normalVerificationReadOnly: true, abandonedPrototypeUsed: false,
      cleanup: { awaitedFinallyClose: true, returned: closed, limit: 'Published helper has documented lifecycle limits; no unattended recovery certification.' },
      reviewer: 'Parent controller only', acceptedAtUtc: null, extraCredit: 0,
      limits: 'No actual standby, rollback, measured recovery, recovery-budget, user-journey, native Azure, source-parent, cost, production Node 24 or reliability certification.',
    };
    fs.writeFileSync(owned(captureFiles[1]), JSON.stringify({ provenance: command, encoding: 'UTF-8 CRLF capture representation of actual DOM observations', observations }, null, 2).replace(/\n/g, '\r\n') + '\r\n');
    fs.writeFileSync(owned(captureFiles[0]), JSON.stringify(evidence, null, 2) + '\n');
  }
});
