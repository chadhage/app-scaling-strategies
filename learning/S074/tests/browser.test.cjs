'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, repo, read, sha, lf } = require('./provenance.cjs');
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
assert.equal(sha(fs.readFileSync(helper)), helperHash);
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
function inventory(directory = root, found = {}) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) inventory(file, found);
    else found[path.relative(root, file)] = sha(fs.readFileSync(file));
  }
  return found;
}

test('actual isolated DOM: eviction/TTL, exact continuity, failures/unknowns, keyboard/errors/history/reset and CSP', { timeout: 210000 }, async () => {
  const before = inventory();
  const proof = {
    cardId: 'A-S074', workerId: 'worker-A-S074', mode: 'synthetic', outcome: 'FAIL',
    entry: 'learning\\S074\\index.html', runtime: process.version, playwrightVersion,
    startedAtUtc: new Date().toISOString(), captureExplicitlyEnabled: capture,
    helper: { path: 'testing\\browser\\isolated.cjs', sha256: helperHash, publication: '53c0c0d' },
    observations: [], pageErrors: [], consoleErrors: [], exerciseNetworkRequests: [],
    probeRequests: [], probeResponses: [], guardedNetworkAttempts: [], screenshots: [], cleanup: {},
    testedSourceHashes: Object.fromEntries([
      'index.html', 'styles.css', 'fixtures.js', 'model.js', 'app.js', 'manifest.json', 'README.md',
      'eviction.feature', 'tests\\browser.test.cjs',
    ].map((file) => [file, sha(lf(read(file)))])),
  };
  let session;
  let failure;
  let stage = 'exercise';
  try {
    assert.equal(process.version, 'v22.23.4');
    assert.equal(playwrightVersion, '1.56.1');
    if (capture) {
      for (const file of ['browser.json', 'browser-eviction-failure.png', 'browser-unknown.png']) {
        assert.equal(fs.existsSync(path.join(root, 'evidence', file)), false, 'Deliberate capture cannot overwrite provenance.');
      }
    }
    session = await openIsolatedLesson('learning\\S074\\index.html');
    proof.browserVersion = session.browserVersion;
    assert.match(session.browserVersion, /^156\./);
    const page = session.page;
    await page.setViewportSize({ width: 1100, height: 900 });
    page.on('pageerror', (error) => proof.pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') proof.consoleErrors.push({ stage, text: message.text() });
    });
    page.on('request', (request) => {
      if (/^https?:/.test(request.url())) {
        (stage === 'exercise' ? proof.exerciseNetworkRequests : proof.probeRequests).push(request.url());
      }
    });
    page.on('response', (response) => {
      if (/^https?:/.test(response.url())) proof.probeResponses.push(response.url());
    });
    await page.route(/^https?:/, async (route) => {
      proof.guardedNetworkAttempts.push(route.request().url());
      await route.abort('blockedbyclient');
    });
    await page.reload({ waitUntil: 'load' });
    const value = (id) => page.locator(`#${id}`).innerText();
    const rows = (id) => page.locator(`#${id} tr`).evaluateAll((entries) =>
      entries.map((entry) => [...entry.cells].map((cell) => cell.textContent)));
    const focused = async (id) => assert.equal(await page.evaluate(() => document.activeElement.id), id);
    const press = async (id, key = 'Enter') => {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press(key);
    };
    const submit = async (id) => page.locator(`#${id}`).evaluate((form) =>
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    const observe = async (name) => {
      proof.observations.push({
        name, phase: await value('phase'), outcome: await value('outcome'),
        pressure: await value('pressure-metrics'), misses: await value('miss-metrics'),
        recovery: await value('recovery-metrics'), requiredState: await value('state-metrics'),
        response: await value('response-metrics'), impact: await value('impact'),
        learning: await value('learning-result'), totals: await value('totals'),
        cache: await rows('cache-rows'), comparison: await rows('comparison-rows'),
        durableObserved: await value('durable-observed'), history: await rows('history-rows'),
        trace: await value('trace'), alert: await page.locator('#input-error').textContent(),
        activeElement: await page.evaluate(() => document.activeElement.id),
      });
    };
    const defaults = async (retained = 0) => {
      assert.equal(await value('phase'), 'Phase: idle');
      for (const [id, expected] of Object.entries({ pressure: 'capacity', durable: 'current', response: 'recover', prediction: '' })) {
        assert.equal(await page.locator(`#${id}`).inputValue(), expected);
      }
      assert.equal(await value('pressure-metrics'), 'Pressure: not applied · initial entries: 2');
      assert.equal(await value('outcome'), 'Journey outcome: not checked');
      assert.equal(await value('miss-metrics'), 'Cache misses: required not checked · optional not checked');
      assert.equal(await value('recovery-metrics'), 'Durable recoveries: not checked · optional recomputations: not checked');
      assert.equal(await value('state-metrics'), 'Required state: not checked');
      assert.equal(await value('response-metrics'), 'Synthetic response: not checked');
      assert.equal(await value('impact'), 'User-impact model: no continuity check yet.');
      assert.equal(await value('durable-observed'), 'Durable record observed: not checked');
      assert.equal(await value('trace'), 'No pressure applied.');
      assert.equal(await value('learning-result'), 'Learning prediction not checked.');
      assert.equal(await page.locator('#settings').evaluate((node) => node.disabled), false);
      assert.equal(await page.locator('#apply-pressure').isEnabled(), retained < 6);
      for (const id of ['check-continuity', 'prediction', 'retain-attempt', 'new-attempt']) {
        assert.equal(await page.locator(`#${id}`).isDisabled(), true, id);
      }
      assert.equal(await page.locator('#input-error').isHidden(), true);
      assert.equal(await page.locator('#input-error').textContent(), '');
      assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
      for (const id of ['settings-form', 'prediction-form']) {
        assert.equal(await page.locator(`#${id}`).evaluate((form) => typeof form.reset), 'function');
      }
      assert.ok((await rows('cache-rows')).every((row) => row[3] === 'not applied'));
      assert.ok((await rows('comparison-rows')).every((row) => row[3] === 'not checked'));
      assert.equal(await value('history-count'), `Retained completed attempts: ${retained} / 6`);
      assert.equal((await rows('history-rows')).length, retained);
      assert.equal(await page.locator('#retained-detail').evaluate((node) => node.open), false);
      if (!retained) assert.equal(await page.locator('#retained-proof').textContent(), '');
    };
    const reset = async () => {
      await press('reset-rehearsal', 'Space');
      await focused('apply-pressure');
      await defaults();
      assert.equal(await value('totals'), 'Retained outcomes: success 0 · failure 0 · unknown 0');
    };
    const next = async (settings) => {
      const history = await rows('history-rows');
      const retained = await page.locator('#retained-proof').textContent();
      const totals = await value('totals');
      await press('new-attempt');
      await focused(history.length < 6 ? 'apply-pressure' : 'reset-rehearsal');
      await defaults(history.length);
      assert.deepEqual(await rows('history-rows'), history);
      assert.equal(await page.locator('#retained-proof').textContent(), retained);
      assert.equal(await value('totals'), totals);
      for (const [id, selected] of Object.entries(settings || {})) await page.locator(`#${id}`).selectOption(selected);
    };
    const execute = async (expected) => {
      await press('apply-pressure');
      await focused('check-continuity');
      assert.equal(await value('phase'), 'Phase: pressured');
      assert.equal(await page.locator('#settings').evaluate((node) => node.disabled), true);
      await press('check-continuity');
      await focused('prediction');
      assert.equal(await value('outcome'), `Journey outcome: ${expected}`);
    };
    const retain = async (prediction) => {
      await page.locator('#prediction').selectOption(prediction);
      await press('retain-attempt');
      await focused('new-attempt');
      assert.equal(await value('phase'), 'Phase: checked');
    };
    const screenshot = async (name) => {
      if (capture) {
        const file = `evidence\\${name}`;
        await page.screenshot({ path: path.join(root, file), fullPage: true });
        proof.screenshots.push(file);
      }
    };

    assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
    await defaults();
    await page.locator('.skip').focus();
    await page.keyboard.press('Enter');
    await focused('exercise');
    await page.keyboard.press('Tab');
    await focused('pressure');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#pressure').inputValue(), 'none');
    await page.keyboard.press('Home');
    await page.keyboard.press('Tab');
    await focused('durable');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#durable').inputValue(), 'missing');
    await page.keyboard.press('Home');
    await page.keyboard.press('Tab');
    await focused('response');
    await page.keyboard.press('End');
    assert.equal(await page.locator('#response').inputValue(), 'empty-success');
    await page.keyboard.press('Home');
    await page.keyboard.press('Tab');
    await focused('apply-pressure');
    await page.keyboard.press('Enter');
    await focused('check-continuity');
    assert.deepEqual((await rows('cache-rows')).map((row) => row[3]), ['evicted: capacity', 'evicted: capacity']);
    await page.keyboard.press('Enter');
    await focused('prediction');
    assert.equal(await value('outcome'), 'Journey outcome: SUCCESS');
    assert.equal(await value('miss-metrics'), 'Cache misses: required 1 · optional 1');
    assert.equal(await value('recovery-metrics'), 'Durable recoveries: 1 · optional recomputations: 1');
    assert.ok((await rows('comparison-rows')).every((row) => row[3] === 'PASS'));
    await press('retain-attempt');
    await focused('prediction');
    assert.match(await value('input-error'), /Invalid prediction/);
    assert.equal(await page.locator('#prediction').getAttribute('aria-invalid'), 'true');
    assert.equal((await rows('history-rows')).length, 0);
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#prediction').inputValue(), 'SUCCESS');
    await page.keyboard.press('Tab');
    await focused('retain-attempt');
    await page.keyboard.press('Enter');
    await focused('new-attempt');
    await observe('keyboard capacity eviction and exact durable recovery; empty prediction rejected');

    await next({ durable: 'missing' });
    await execute('FAILURE');
    assert.match(await value('response-metrics'), /503.*durable-required-state-missing/);
    assert.match(await value('impact'), /interrupted journey 1/);
    await retain('SUCCESS');
    assert.match(await value('learning-result'), /incorrect.*FAILURE/);
    await observe('missing required state fails explicitly; wrong prediction cannot erase interruption');

    await next({ response: 'empty-success' });
    await execute('FAILURE');
    assert.match(await value('response-metrics'), /200.*empty-success-required-state-loss/);
    assert.match(await value('state-metrics'), /lost 1/);
    assert.ok((await rows('comparison-rows')).every((row) => row[3] === 'FAIL'));
    await retain('FAILURE');
    await observe('empty synthetic 200 is lost required state, not successful continuity');
    await screenshot('browser-eviction-failure.png');

    await next({ pressure: 'ttl-optional', durable: 'unverified', response: 'empty-success' });
    await execute('SUCCESS');
    assert.deepEqual((await rows('cache-rows')).map((row) => row[3]), ['cache retained', 'evicted: ttl']);
    assert.equal(await value('miss-metrics'), 'Cache misses: required 0 · optional 1');
    assert.equal(await value('recovery-metrics'), 'Durable recoveries: 0 · optional recomputations: 1');
    assert.match(await value('response-metrics'), /cache-hit/);
    await retain('SUCCESS');
    await observe('acceptable optional TTL miss leaves required cache hit; unused durable path not certified');

    await next({ pressure: 'ttl-session', durable: 'stale' });
    await execute('FAILURE');
    assert.deepEqual((await rows('cache-rows')).map((row) => row[3]), ['evicted: ttl', 'evicted: ttl']);
    assert.match(await value('pressure-metrics'), /logical tick 4/);
    assert.match(await value('response-metrics'), /503.*durable-required-state-stale/);
    assert.match(await value('durable-observed'), /"revision":2/);
    await retain('FAILURE');
    await observe('TTL equality expires required state; stale durable revision rejected');

    await next({ pressure: 'ttl-session', durable: 'unverified' });
    await execute('UNKNOWN');
    assert.match(await value('state-metrics'), /preserved 0 · lost 0 · unverified 1/);
    assert.ok((await rows('comparison-rows')).every((row) => row[3] === 'UNKNOWN'));
    await retain('UNKNOWN');
    await observe('unavailable durable evidence holds UNKNOWN without invented loss certainty');
    await screenshot('browser-unknown.png');
    assert.equal(await value('totals'), 'Retained outcomes: success 2 · failure 3 · unknown 1');
    const retainedSix = await page.locator('#retained-proof').textContent();
    await submit('prediction-form');
    assert.match(await value('input-error'), /already retained/);
    assert.equal(await page.locator('#retained-proof').textContent(), retainedSix);
    await next();
    await submit('settings-form');
    await focused('input-error');
    assert.match(await value('input-error'), /Six retained attempts/);
    assert.equal(await page.locator('#retained-proof').textContent(), retainedSix);
    assert.equal((await rows('history-rows')).length, 6);
    await observe('seventh attempt rejected without silent history eviction');
    await reset();
    await observe('explicit reset clears completed history, errors, totals and predictions');

    await page.locator('#pressure').evaluate((select) => {
      select.add(new Option('<img src=x onerror=alert(1)>', '__proto__'));
      select.value = '__proto__';
    });
    await submit('settings-form');
    await focused('pressure');
    assert.match(await value('input-error'), /Invalid input: pressure/);
    assert.equal(await page.locator('#pressure').getAttribute('aria-invalid'), 'true');
    assert.equal(await value('phase'), 'Phase: idle');
    assert.equal(await page.locator('img').count(), 0);
    assert.equal((await rows('history-rows')).length, 0);
    await observe('invalid injected input is rejected without result or markup execution');
    await page.locator('#pressure option[value="__proto__"]').evaluate((node) => node.remove());
    await reset();

    await submit('prediction-form');
    assert.match(await value('input-error'), /Check continuity first/);
    await reset();
    await press('apply-pressure');
    await reset();
    await execute('SUCCESS');
    await reset();
    await observe('explicit reset clears idle, pressured and evaluated phases; native form.reset remains callable');
    await page.setViewportSize({ width: 360, height: 800 });
    await page.locator('#apply-pressure').focus();
    proof.narrowViewport = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement);
      return {
        width: innerWidth, bodyOverflow: document.documentElement.scrollWidth > innerWidth,
        visibleKeyboardFocus: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2,
      };
    });
    assert.equal(proof.narrowViewport.bodyOverflow, false);
    assert.equal(proof.narrowViewport.visibleKeyboardFocus, true);

    stage = 'csp-probes';
    const urlBefore = page.url();
    await page.evaluate(async () => {
      globalThis.__s074Csp = { violations: [], inlineRan: false, connection: null };
      document.addEventListener('securitypolicyviolation', (event) => {
        globalThis.__s074Csp.violations.push({ directive: event.effectiveDirective, blocked: event.blockedURI });
      });
      const script = document.createElement('script');
      script.textContent = 'globalThis.__s074Csp.inlineRan = true';
      document.body.append(script);
      try {
        await fetch('https://s074.invalid/blocked-connect');
        globalThis.__s074Csp.connection = 'unexpected response';
      } catch (error) {
        globalThis.__s074Csp.connection = error.name;
      }
      const form = document.createElement('form');
      form.action = 'https://s074.invalid/blocked-form';
      document.body.append(form);
      HTMLFormElement.prototype.submit.call(form);
    });
    await page.waitForFunction(() => ['script-src-elem', 'connect-src', 'form-action'].every((directive) =>
      globalThis.__s074Csp.violations.some((entry) => entry.directive === directive)));
    proof.csp = await page.evaluate(() => globalThis.__s074Csp);
    assert.equal(proof.csp.inlineRan, false);
    assert.equal(proof.csp.connection, 'TypeError');
    assert.equal(page.url(), urlBefore);
    assert.deepEqual(proof.pageErrors, []);
    assert.deepEqual(proof.consoleErrors.filter((entry) => entry.stage === 'exercise'), []);
    assert.deepEqual(proof.exerciseNetworkRequests, []);
    assert.deepEqual(proof.probeResponses, []);
    assert.deepEqual(proof.guardedNetworkAttempts, [], 'CSP must block probes before the safety network route is reached.');
    proof.outcome = 'PASS';
  } catch (error) {
    failure = error;
    proof.failure = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    if (session) {
      proof.cleanup.closeAwaited = true;
      try {
        await session.close();
        proof.cleanup.closed = true;
      } catch (error) {
        proof.cleanup.closed = false;
        failure = failure ? new AggregateError([failure, error], 'Browser and cleanup failed') : error;
        proof.outcome = 'FAIL';
      }
    }
    proof.completedAtUtc = new Date().toISOString();
    const after = inventory();
    for (const [file, hash] of Object.entries(before)) assert.equal(after[file], hash, `Verification changed ${file}`);
    if (!capture) assert.deepEqual(after, before, 'Ordinary browser verification must not write owned proof.');
    else {
      const allowed = proof.screenshots;
      assert.deepEqual(Object.keys(after).filter((file) => !Object.hasOwn(before, file)).sort(), allowed.sort());
      fs.writeFileSync(path.join(root, 'evidence', 'browser.json'), JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
    }
  }
  if (failure) throw failure;
});
