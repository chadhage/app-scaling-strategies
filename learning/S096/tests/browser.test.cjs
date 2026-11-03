'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const lesson = path.resolve(__dirname, '..');
const repo = path.resolve(lesson, '..', '..');
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const approvedHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
assert.equal(digest(fs.readFileSync(helper)), approvedHash, 'Only the published helper is qualified');
const { openIsolatedLesson } = require(helper);
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const captureFiles = ['evidence\\browser-acceptance.json', 'evidence\\raw\\browser-dom.json'];

function snapshot(directory = lesson, prefix = '') {
  return Object.fromEntries(fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    assert.ok(!entry.isSymbolicLink());
    const name = prefix ? path.join(prefix, entry.name) : entry.name;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return Object.entries(snapshot(target, name));
    return capture && captureFiles.includes(name) ? [] : [[name, digest(fs.readFileSync(target))]];
  }));
}

test('S096 actual isolated DOM, keyboard, failures, unknowns, reset, limit and CSP', { timeout: 120000 }, async (t) => {
  const preflight = JSON.parse(fs.readFileSync(path.join(lesson, 'evidence', 'tooling-preflight.json')));
  assert.equal(process.version, preflight.node);
  assert.equal(require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version, '1.56.1');
  const before = snapshot();
  const startedAtUtc = new Date().toISOString();
  const checks = [];
  const observations = [];
  const requests = [];
  const guardedRequests = [];
  const pageErrors = [];
  const consoleErrors = [];
  const session = await openIsolatedLesson(path.join('learning', 'S096', 'index.html'));
  const page = session.page;
  let closed = false;
  let cspObservation;
  const value = (id) => page.locator(`#${id}`).textContent();
  const active = () => page.evaluate(() => document.activeElement.id);
  const count = () => page.locator('#history > li').count();
  const submit = () => page.locator('#warm-run').click();
  const forcedSubmit = () => page.evaluate(() => document.getElementById('controls').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  const reset = async () => {
    await page.locator('#reset-rehearsal').focus();
    await page.keyboard.press('Space');
    assert.equal(await active(), 'topology');
    assert.equal(await page.locator('#topology').inputValue(), 'shared');
    assert.equal(await page.locator('#production-workers').inputValue(), '1');
    assert.equal(await page.locator('#slot-count').inputValue(), '2');
    assert.equal(await page.locator('#coverage').inputValue(), 'complete');
    assert.equal(await page.locator('#result').isHidden(), true);
    assert.equal(await value('verdict'), '');
    assert.equal(await page.locator('#error').isHidden(), true);
    assert.equal(await page.evaluate(() => typeof document.getElementById('controls').reset), 'function');
  };
  const observe = async (label) => observations.push(await page.evaluate((name) => {
    const get = (id) => document.getElementById(id);
    const table = (id) => [...get(id).rows].map((row) => [...row.cells].map((cell) => cell.textContent));
    return {
      label: name,
      banner: document.querySelector('.banner').textContent,
      controls: Object.fromEntries([...document.querySelectorAll('#controls input, #controls select')].map((control) => [control.id, control.value])),
      verdict: get('result').dataset.verdict || null,
      impact: get('result').dataset.impact || null,
      metrics: Object.fromEntries(['total-compute', 'added-compute', 'slot-compute', 'production-headroom', 'candidate-headroom', 'dependency-headroom', 'candidate-ready', 'journey-counts', 'transitions', 'transition-rate'].map((id) => [id, get(id).textContent])),
      gates: table('gates'),
      productionTrace: table('production-trace'),
      warmTrace: table('warm-trace'),
      history: [...get('history').children].map((item) => ({ verdict: item.dataset.verdict, text: item.textContent })),
      totals: Object.fromEntries(['total-runs', 'total-attempted', 'total-success', 'total-interrupted', 'total-unknown', 'total-transitions'].map((id) => [id, get(id).textContent])),
      error: { visible: !get('error').hidden, text: get('error').textContent },
      activeId: document.activeElement.id,
    };
  }, label));
  const check = async (name, operation) => {
    await t.test(name, async () => { await operation(); checks.push({ name, passed: true }); });
    assert.ok(checks.some((item) => item.name === name), `No qualified pass for ${name}`);
  };
  page.on('request', (request) => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });

  try {
    await page.route('**/*', async (route) => {
      if (/^https?:/.test(route.request().url())) {
        guardedRequests.push(route.request().url());
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    await page.reload({ waitUntil: 'load' });
    await check('all keyboard controls conduct actual shared-plan overload and rendered measurements', async () => {
      assert.equal(session.browserVersion, preflight.browser.productVersion);
      assert.match(await page.title(), /S096.*Shared-plan resource contention/);
      assert.equal(await page.locator('.banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      for (const id of ['topology', 'production-workers', 'candidate-workers', 'slot-count', 'production-demand', 'warm-demand', 'dependency-capacity', 'journey-budget', 'warmup-budget', 'coverage', 'warm-run']) {
        await page.keyboard.press('Tab');
        assert.equal(await active(), id);
      }
      assert.equal(await page.locator('#warm-run').evaluate((element) => getComputedStyle(element).outlineStyle), 'solid');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#result').getAttribute('data-verdict'), 'failure');
      assert.equal(await value('total-compute'), '100 units');
      assert.equal(await value('added-compute'), '0 units');
      assert.equal(await value('production-headroom'), '-50 units');
      assert.equal(await value('dependency-headroom'), '20 units');
      assert.equal(await value('journey-counts'), '0 / 4 / 0');
      assert.equal(await page.locator('#production-trace > tr').count(), 4);
      assert.match(await value('production-trace'), /180 ms120 msinterrupted/);
      assert.match(await value('production-trace'), /192 ms120 msinterrupted/);
      assert.equal(await page.locator('#warm-trace > tr').count(), 2);
      assert.equal(await page.locator('#phase-trace > li').count(), 4);
      assert.equal(await count(), 1);
      assert.equal(await value('total-interrupted'), '4');
      assert.equal(await page.locator('#warm-run').isDisabled(), true);
      await observe('shared-pressure-failure');
    });

    await check('duplicate, fractional, blank, out-of-bounds and unsupported inputs preserve evidence with focused errors', async () => {
      await forcedSubmit();
      assert.match(await value('error'), /ERR_STATE/);
      assert.equal(await active(), 'error');
      assert.equal(await count(), 1);
      await observe('duplicate-rejected');
      await reset();
      for (const invalid of ['1.5', '', '0', '251']) {
        await page.locator('#production-demand').fill(invalid);
        await submit();
        assert.match(await value('error'), /ERR_INPUT/);
        assert.equal(await active(), 'error');
        assert.equal(await page.locator('#production-demand').getAttribute('aria-invalid'), 'true');
        assert.equal(await count(), 1);
        assert.equal(await value('total-interrupted'), '4');
        await reset();
      }
      await page.evaluate(() => {
        const select = document.getElementById('topology');
        select.add(new Option('Unsupported <img> choice', '<img src=x onerror=alert(1)>'));
        select.value = '<img src=x onerror=alert(1)>';
      });
      await submit();
      assert.match(await value('error'), /ERR_INPUT: Unknown plan placement/);
      assert.equal(await page.locator('#result').isHidden(), true);
      assert.equal(await page.locator('#history img').count(), 0);
      assert.equal(await count(), 1);
      await observe('unsupported-choice-rejected');
      await reset();
    });

    await check('explicit extra production worker adds compute and no migrated users', async () => {
      await page.locator('#production-workers').fill('2');
      await page.locator('#warm-run').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.locator('#result').getAttribute('data-verdict'), 'success');
      assert.equal(await value('total-compute'), '200 units');
      assert.equal(await value('added-compute'), '100 units');
      assert.equal(await value('production-headroom'), '50 units');
      assert.equal(await value('journey-counts'), '4 / 0 / 0');
      assert.equal(await value('transitions'), '0 attempted / 0 successful');
      assert.match(await value('transition-rate'), /Unknown.*empty transition sample/);
      assert.equal(await count(), 2);
      assert.equal(await value('total-interrupted'), '4');
      await observe('shared-extra-worker-success');
      await reset();
    });

    await check('separately provisioned candidate plan exposes its own compute and headroom', async () => {
      await page.locator('#topology').selectOption('separate');
      await submit();
      assert.equal(await page.locator('#result').getAttribute('data-verdict'), 'success');
      assert.equal(await value('total-compute'), '200 units');
      assert.equal(await value('added-compute'), '100 units');
      assert.equal(await value('production-headroom'), '30 units');
      assert.equal(await value('candidate-headroom'), '20 units');
      assert.match(await value('candidate-ready'), /^2 \/ 2/);
      assert.match(await value('warm-trace'), /103 ms160 msready/);
      await observe('separate-compute-success');
      await reset();
    });

    await check('shared dependency contention retains production interruptions despite separate compute', async () => {
      await page.locator('#topology').selectOption('separate');
      await page.locator('#dependency-capacity').fill('60');
      await submit();
      assert.equal(await page.locator('#result').getAttribute('data-verdict'), 'failure');
      assert.equal(await value('dependency-headroom'), '-20 units');
      assert.equal(await value('journey-counts'), '1 / 3 / 0');
      assert.match(await value('gates'), /dependencyfail/);
      assert.equal(await value('total-interrupted'), '7');
      await observe('shared-dependency-failure');
      await reset();
    });

    await check('missing capacity is unknown, never substituted by configured workers', async () => {
      await page.locator('#topology').selectOption('separate');
      await page.locator('#coverage').selectOption('missing-capacity');
      await submit();
      assert.equal(await page.locator('#result').getAttribute('data-verdict'), 'unknown');
      assert.equal(await value('total-compute'), 'Unknown (not observed)');
      assert.equal(await value('added-compute'), 'Unknown (not observed)');
      assert.match(await value('configured-compute'), /200 units \(intent, not observation\)/);
      assert.match(await value('candidate-ready'), /unknown 2/);
      assert.equal(await value('journey-counts'), '4 / 0 / 0');
      await observe('missing-capacity-unknown');
      await reset();
    });

    await check('unknown journeys, retained history and seventh-run guard survive keyboard reset', async () => {
      await page.locator('#topology').selectOption('separate');
      await page.locator('#coverage').selectOption('missing-journeys');
      await submit();
      assert.equal(await page.locator('#result').getAttribute('data-verdict'), 'unknown');
      assert.equal(await value('journey-counts'), '0 / 0 / 4');
      assert.equal(await value('total-runs'), '6 / 6');
      assert.equal(await value('total-attempted'), '24');
      assert.equal(await value('total-interrupted'), '7');
      assert.equal(await value('total-unknown'), '4');
      assert.equal(await value('total-transitions'), '0');
      assert.deepEqual(await page.locator('#history > li').evaluateAll((items) => items.map((item) => item.dataset.verdict)), ['failure', 'success', 'success', 'failure', 'unknown', 'unknown']);
      await observe('six-runs-retained-before-reset');
      await reset();
      assert.equal(await count(), 6);
      assert.equal(await page.locator('#warm-run').isDisabled(), true);
      await forcedSubmit();
      assert.match(await value('error'), /ERR_LIMIT/);
      assert.equal(await active(), 'error');
      assert.equal(await count(), 6);
      assert.equal(await value('total-interrupted'), '7');
      await observe('seventh-run-rejected-after-reset');
    });

    await check('fresh page lifetime covers safe abort, missing readiness and known failure with missing capacity', async () => {
      await page.reload({ waitUntil: 'load' });
      assert.equal(await count(), 0);
      await page.locator('#topology').selectOption('separate');
      await page.locator('#slot-count').fill('4');
      await page.locator('#dependency-capacity').fill('200');
      await submit();
      assert.equal(await page.locator('#result').getAttribute('data-impact'), 'safe-abort-before-exposure');
      assert.equal(await value('journey-counts'), '4 / 0 / 0');
      assert.equal(await value('candidate-headroom'), '-60 units');
      assert.match(await value('admission'), /blocked before exposure/);
      await observe('saturated-candidate-safe-abort');
      await reset();
      await page.locator('#topology').selectOption('separate');
      await page.locator('#coverage').selectOption('missing-warmup');
      await submit();
      assert.equal(await page.locator('#result').getAttribute('data-verdict'), 'unknown');
      assert.match(await value('candidate-ready'), /unknown 2/);
      await observe('missing-warmup-unknown');
      await reset();
      await page.locator('#coverage').selectOption('missing-capacity');
      await submit();
      assert.equal(await page.locator('#result').getAttribute('data-verdict'), 'failure');
      assert.equal(await value('journey-counts'), '0 / 4 / 0');
      assert.match(await value('gates'), /computeunknown/);
      await observe('known-journey-failure-with-capacity-gap');
      assert.equal(await count(), 3);
    });

    await check('actual CSP rejects inline and remote scripts and connections without escaped requests', async () => {
      assert.deepEqual(requests, []);
      assert.deepEqual(guardedRequests, []);
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(consoleErrors, []);
      cspObservation = await page.evaluate(async () => {
        const violations = [];
        document.addEventListener('securitypolicyviolation', (event) => violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI }));
        const inline = document.createElement('script');
        inline.textContent = 'window.s096InlineExecuted = true;';
        document.head.append(inline);
        const remote = await new Promise((resolve) => {
          const script = document.createElement('script');
          script.src = 'https://s096.invalid/blocked-script.js';
          script.onload = () => resolve('loaded');
          script.onerror = () => resolve('blocked');
          document.head.append(script);
        });
        const connection = await fetch('https://s096.invalid/blocked-connection').then(() => 'connected', () => 'blocked');
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { inlineExecuted: window.s096InlineExecuted === true, remote, connection, violations };
      });
      assert.equal(cspObservation.inlineExecuted, false);
      assert.equal(cspObservation.remote, 'blocked');
      assert.equal(cspObservation.connection, 'blocked');
      assert.ok(cspObservation.violations.some((event) => event.blockedURI === 'inline' && /^script-src/.test(event.directive)));
      assert.ok(cspObservation.violations.some((event) => event.blockedURI.includes('s096.invalid') && /^script-src/.test(event.directive)));
      assert.ok(cspObservation.violations.some((event) => event.directive === 'connect-src'));
      assert.deepEqual(guardedRequests, [], 'CSP, not the added route guard, must block these requests');
      assert.deepEqual(pageErrors, []);
      assert.ok(consoleErrors.every((message) => /Content Security Policy|violates.*policy/i.test(message)));
      await observe('csp-enforced');
    });
  } finally {
    await session.close();
    closed = true;
  }

  assert.equal(closed, true);
  assert.deepEqual(snapshot(), before, 'Source and evidence bytes changed during verification');
  if (capture) {
    const raw = {
      cardId: 'A-S096', workerId: 'worker-A-S096', startedAtUtc, finishedAtUtc: new Date().toISOString(),
      mode: 'actual-isolated-browser-synthetic-lesson', node: process.version, playwright: '1.56.1',
      browserVersion: session.browserVersion, helperSha256: approvedHash, observations, cspObservation,
      attemptedRemoteRequests: requests, guardedRequests, pageErrors, consoleErrors,
      awaitedFinallyClose: closed, nativeCertification: false,
    };
    const bytes = Buffer.from(JSON.stringify(raw, null, 2).replace(/\n/g, '\r\n') + '\r\n', 'utf8');
    fs.writeFileSync(path.join(lesson, captureFiles[1]), bytes);
    fs.writeFileSync(path.join(lesson, captureFiles[0]), JSON.stringify({
      cardId: 'A-S096', workerId: 'worker-A-S096', packet: 'LP-COMPARE', kano: 'S', mode: 'synthetic',
      startedAtUtc, finishedAtUtc: raw.finishedAtUtc, passed: true, checks, leafChecks: checks.length,
      parentGroups: 1, observations: observations.length, rawSha256: digest(bytes),
      helperSha256: approvedHash, playwright: '1.56.1', browserVersion: session.browserVersion,
      awaitedFinallyClose: closed, ownedBytesPreservedExceptDeliberateCapture: true, nativeCertification: false,
      productionNode24Qualified: false, sourceParentComplete: false, delighterComplete: false,
    }, null, 2) + '\n');
  }
});
