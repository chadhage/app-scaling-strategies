'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = (file) => Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'));
assert.equal(sha(fs.readFileSync(helper)), helperHash, 'Only the published helper is qualified.');
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

test('actual isolated DOM, keyboard, recovery/failure/unknown, strict errors, retained reset, capacity and enforced CSP', { timeout: 240000 }, async () => {
  const proofPath = path.join(root, 'evidence', 'browser.json');
  if (capture) assert.equal(fs.existsSync(proofPath), false, 'Preserve existing deliberate browser proof.');
  const proofBefore = !capture && fs.existsSync(proofPath) ? fs.readFileSync(proofPath) : null;
  const proof = {
    schemaVersion: 1, cardId: 'A-S060', workerId: 'worker-A-S060', mode: 'synthetic',
    entry: 'learning\\S060\\index.html', runtime: process.version, playwrightVersion,
    startedAtUtc: new Date().toISOString(), captureExplicitlyEnabled: capture,
    helper: { path: 'testing\\browser\\isolated.cjs', sha256: helperHash, publication: '53c0c0d' },
    outcome: 'FAIL', observations: [], pageErrors: [], consoleErrors: [],
    exerciseNetworkRequests: [], probeRequests: [], probeResponses: [], cleanup: {},
    testedSourceHashes: Object.fromEntries([
      'index.html', 'styles.css', 'fixtures.js', 'model.js', 'app.js',
      path.join('tests', 'browser.test.cjs'), path.join('tests', 'csp-probe.js'),
    ].map((file) => [file, sha(canonical(file))])),
  };
  let session;
  let stage = 'exercise';
  try {
    assert.equal(process.version, 'v22.23.4');
    assert.equal(playwrightVersion, '1.56.1');
    session = await openIsolatedLesson('learning\\S060\\index.html');
    proof.browserVersion = session.browserVersion;
    assert.match(proof.browserVersion, /^156\./);
    const page = session.page;
    page.on('pageerror', (error) => proof.pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') proof.consoleErrors.push({ stage, text: message.text() });
    });
    page.on('request', (request) => {
      if (/^https?:/i.test(request.url())) {
        (stage === 'exercise' ? proof.exerciseNetworkRequests : proof.probeRequests)
          .push({ url: request.url(), method: request.method() });
      }
    });
    page.on('response', (response) => {
      if (stage === 'csp-probes' && /^https?:/i.test(response.url())) proof.probeResponses.push(response.url());
    });
    const rows = (selector) => page.locator(selector).evaluateAll((entries) =>
      entries.map((entry) => [...entry.cells].map((cell) => cell.textContent)));
    const observe = async (name) => {
      proof.observations.push({
        name, phase: await page.locator('#phase').innerText(),
        result: await page.locator('#result').innerText(), impact: await page.locator('#impact').innerText(),
        metrics: await page.locator('#metrics').innerText(), observed: await page.locator('#observed').innerText(),
        committed: await rows('#committed tr'), history: await rows('#history tr'),
        trace: await page.locator('#trace').innerText(), alert: await page.locator('#input-error').textContent(),
        capacity: await page.locator('#capacity').innerText(),
        activeElement: await page.evaluate(() => document.activeElement.id),
      });
    };
    const historyCount = () => page.locator('#history tr[data-sequence]').count();
    const evolve = async (mode = 'compatible') => {
      await page.selectOption('#mode', mode);
      await page.locator('#evolve').focus();
      await page.keyboard.press('Enter');
      assert.match(await page.locator('#phase').innerText(), /Phase: evolved.*active code: v2/);
      assert.equal(await page.locator('#configuration').evaluate((element) => element.disabled), true);
      assert.equal(await page.locator('#mode').isDisabled(), true);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'rollback');
      assert.equal(await page.locator('#committed tr').count(), 3);
    };
    const reset = async () => {
      await page.locator('#reset-rehearsal').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: ready | active code: v1 | schema: v1');
      assert.equal(await page.locator('#mode').inputValue(), 'compatible');
      assert.equal(await page.locator('#observation').inputValue(), 'complete');
      assert.equal(await page.locator('#input-error').isHidden(), true);
      assert.equal(await page.locator('#committed tr').count(), 2);
      if (await historyCount() < 12) assert.equal(await page.evaluate(() => document.activeElement.id), 'mode');
    };
    assert.equal(await page.title(), 'S060 · Rollback after schema evolution');
    assert.equal(await page.locator('#training-banner').innerText(),
      'Training rehearsal - synthetic data - not a live Azure result');
    assert.equal(await page.locator('#rollback').isDisabled(), true);
    assert.match(await page.locator('#metrics').innerText(), /Recovery attempts: 0.*success fraction: no evidence/);
    await observe('initial unknown, empty sample is no evidence');

    await page.locator('#mode').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'evolve');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'rollback');
    const compatibleData = await rows('#committed tr');
    await page.locator('#controls').evaluate((form) =>
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.match(await page.locator('#input-error').innerText(), /requires ready/);
    assert.equal(await historyCount(), 0);
    assert.deepEqual(await rows('#committed tr'), compatibleData);
    await observe('stale state guard is visible and data/history unchanged');
    await page.locator('#rollback').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#phase').innerText(), 'Phase: recovered | active code: v1 | schema: expanded');
    assert.match(await page.locator('#result').innerText(), /SUCCESS/);
    assert.match(await page.locator('#observed').innerText(), /3\/3.*USD 4000.*7 ms \/ 10 ms/);
    assert.deepEqual(await rows('#committed tr'), compatibleData);
    assert.match(compatibleData[2][1], /500.*New committed v2 write/);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'reset-rehearsal');
    await observe('compatible keyboard rollback preserves all committed v2 data and expanded schema');
    await reset();
    assert.equal(await historyCount(), 1);
    assert.match(await page.locator('#metrics').innerText(), /success fraction: 1\/1/);
    await observe('reset retains success but current result becomes unknown');

    await evolve('irreversible');
    const irreversibleData = await rows('#committed tr');
    assert.doesNotMatch(JSON.stringify(irreversibleData), /totalCents/);
    assert.match(JSON.stringify(irreversibleData), /EUR/);
    await page.keyboard.press('Space');
    assert.match(await page.locator('#result').innerText(), /SAFE ABORT/);
    assert.equal(await page.locator('#phase').innerText(), 'Phase: evolved | active code: v2 | schema: v2-only');
    assert.match(await page.locator('#metrics').innerText(), /Recovery attempts: 1.*safe aborts: 1/);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'forward');
    assert.deepEqual(await rows('#committed tr'), irreversibleData);
    await observe('unsafe irreversible reversal is blocked, not successful migration');
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#phase').innerText(), 'Phase: recovered | active code: v2.1 | schema: v2-only');
    assert.match(await page.locator('#result').innerText(), /SUCCESS/);
    assert.match(await page.locator('#observed').innerText(), /3\/3.*USD 3500 \+ EUR 700/);
    assert.deepEqual(await rows('#committed tr'), irreversibleData);
    assert.equal(await historyCount(), 3);
    assert.equal((await rows('#history tr'))[2][2], 'forward');
    await observe('explicit forward recovery preserves all IDs and both currency totals');

    await reset();
    await evolve();
    await page.selectOption('#observation', 'missing-row');
    await page.locator('#rollback').click();
    assert.match(await page.locator('#result').innerText(), /FAILURE/);
    assert.match(await page.locator('#impact').innerText(), /interrupted/);
    assert.match(await page.locator('#observed').innerText(), /2\/3.*USD 3500.*expected: USD 4000/);
    assert.equal(await page.locator('#committed tr').count(), 3);
    assert.match(await page.locator('#metrics').innerText(), /Recovery attempts: 3.*failure: 1.*success fraction: 2\/3/);
    await observe('missing committed read is failure despite retained durable fixture');
    await reset();
    await evolve('irreversible');
    await page.selectOption('#observation', 'unavailable');
    await page.locator('#forward').click();
    assert.match(await page.locator('#result').innerText(), /UNKNOWN/);
    assert.match(await page.locator('#observed').innerText(), /unobserved.*latency: unobserved/);
    assert.match(await page.locator('#metrics').innerText(),
      /Recovery attempts: 4.*success: 2.*failure: 1.*unknown: 1.*safe aborts: 1.*success fraction: 2\/4/);
    await observe('unavailable forward read is unknown and remains in denominator');
    await reset();
    assert.equal(await historyCount(), 5);
    assert.match(await page.locator('#metrics').innerText(), /failure: 1.*unknown: 1.*success fraction: 2\/4/);
    await observe('reset retains failed and unknown outcomes and returns keyboard focus');

    await page.locator('#mode').evaluate((select) => { select.value = 'unsupported'; });
    await page.locator('#controls').evaluate((form) =>
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.match(await page.locator('#input-error').innerText(), /mode: unsupported value/);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'input-error');
    assert.equal(await historyCount(), 5);
    assert.equal(await page.locator('#committed tr').count(), 2);
    await observe('invalid input guard is visible, focused and non-mutating');
    await reset();
    await page.locator('#rollback').evaluate((button) =>
      button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    assert.match(await page.locator('#input-error').innerText(), /requires evolved/);
    assert.equal(await historyCount(), 5);
    await observe('forced recovery before evolution is rejected by state guard');
    await reset();
    for (let count = 5; count < 12; count += 1) {
      await evolve();
      await page.locator('#rollback').click();
      if (count < 11) await reset();
    }
    assert.equal(await historyCount(), 12);
    await reset();
    assert.equal(await page.locator('#evolve').isDisabled(), true);
    assert.equal(await page.locator('#mode').isDisabled(), true);
    await page.locator('#controls').evaluate((form) =>
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.match(await page.locator('#input-error').innerText(), /History limit: 12/);
    assert.equal(await historyCount(), 12);
    assert.match(await page.locator('#metrics').innerText(),
      /Recovery attempts: 11.*success: 9.*failure: 1.*unknown: 1.*safe aborts: 1.*success fraction: 9\/11/);
    await observe('bounded capacity cannot be bypassed by reset and never erases failures');
    assert.deepEqual(proof.pageErrors, []);
    assert.deepEqual(proof.consoleErrors.filter((entry) => entry.stage === 'exercise'), []);
    assert.deepEqual(proof.exerciseNetworkRequests, []);

    stage = 'csp-probes';
    const originalURL = page.url();
    await page.evaluate(() => {
      const script = document.createElement('script');
      script.src = 'tests/csp-probe.js';
      document.head.append(script);
    });
    await page.waitForFunction(() => globalThis.__s060CspProbe && globalThis.__s060CspProbe.done);
    proof.cspAttempt = await page.evaluate(() => globalThis.__s060CspProbe);
    await page.waitForFunction(() => ['script-src-elem', 'script-src', 'connect-src', 'form-action']
      .every((directive) => globalThis.__s060Violations.some((entry) => entry.effectiveDirective === directive)));
    proof.cspViolations = await page.evaluate(() => globalThis.__s060Violations);
    proof.inlineRan = await page.evaluate(() => globalThis.__s060InlineRan);
    proof.evalRan = await page.evaluate(() => globalThis.__s060EvalRan);
    assert.equal(proof.inlineRan, false);
    assert.equal(proof.evalRan, false);
    assert.equal(proof.cspAttempt.evalError, 'EvalError');
    assert.equal(proof.cspAttempt.fetchError, 'TypeError');
    assert.ok(proof.cspViolations.every((entry) => entry.disposition === 'enforce'));
    assert.equal(page.url(), originalURL);
    assert.deepEqual(proof.probeResponses, []);
    assert.deepEqual(proof.pageErrors, []);
    await observe('enforced CSP blocks inline code, evaluation, connection and form probes');
    proof.outcome = 'PASS';
  } catch (error) {
    proof.failure = { message: error.message, stack: error.stack };
    throw error;
  } finally {
    try {
      if (session) {
        await session.close();
        proof.cleanup = { browserCloseAwaited: true, result: 'closed', serversStarted: 0 };
      }
    } catch (error) {
      proof.outcome = 'FAIL';
      proof.cleanup = { browserCloseAwaited: true, result: 'failed', error: error.message };
      throw error;
    } finally {
      proof.completedAtUtc = new Date().toISOString();
      if (capture) fs.writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, { flag: 'wx' });
      else if (proofBefore) assert.deepEqual(fs.readFileSync(proofPath), proofBefore, 'Normal verification preserves proof.');
    }
  }
});
