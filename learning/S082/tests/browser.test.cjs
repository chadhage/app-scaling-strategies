'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(fs.readFileSync(helper)), helperHash, 'only the qualified published helper may launch this check');
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

test('actual isolated DOM, epoch rejection, failure, unknown, keyboard, errors, history, reset and CSP', { timeout: 80000 }, async () => {
  const proofPath = path.join(root, 'evidence', 'browser-acceptance-v2.json');
  if (capture) assert.equal(fs.existsSync(proofPath), false, 'historical browser evidence must not be overwritten');
  assert.equal(playwrightVersion, '1.56.1');
  assert.match(process.version, /^v22\./);
  const proof = {
    schemaVersion: 1, cardId: 'A-S082', workerId: 'worker-A-S082', mode: 'synthetic',
    entry: 'learning\\S082\\index.html', startedAtUtc: new Date().toISOString(),
    node: process.version, playwrightVersion, captureExplicitlyEnabled: capture,
    helper: { path: 'testing\\browser\\isolated.cjs', publication: '53c0c0d', sha256: helperHash },
    outcome: 'FAIL', observations: [], pageErrors: [], consoleErrors: [],
    exerciseNetworkRequests: [], probeRequests: [], probeResponses: [], routedProbes: [],
    cleanup: { awaitedFinallyClose: false },
    sourceCanonicalLfHashes: Object.fromEntries([
      'index.html', 'styles.css', 'model.js', 'app.js', 'tests\\browser.test.cjs', 'tests\\csp-probe.js',
    ].map((file) => [file, sha(Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')))])),
  };
  let session;
  let failure;
  let screenshot;
  let stage = 'exercise';
  try {
    session = await openIsolatedLesson('learning\\S082\\index.html');
    proof.browserVersion = session.browserVersion;
    assert.match(session.browserVersion, /^156\./);
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
      if (/^https?:/i.test(response.url())) proof.probeResponses.push(response.url());
    });
    await page.route(/^https?:\/\//, async (route) => {
      proof.routedProbes.push(route.request().url());
      await route.abort('blockedbyclient');
    });
    await page.reload({ waitUntil: 'load' });
    const value = (id) => page.locator(`#${id}`).textContent();
    const rows = () => page.locator('#history tr').allTextContents();
    const observe = async (label) => proof.observations.push({
      label, outcome: await value('outcome'), command: await value('command-evidence'),
      measurements: await value('measurements'), history: await rows(),
      progress: await value('progress'), error: await value('lesson-error'),
    });
    const check = async (answer) => {
      await page.locator('#answer').selectOption(answer);
      await page.locator('#check-answer').click();
    };
    const next = () => page.locator('#next-attempt').click();
    const reset = () => page.locator('#reset-lesson').click();
    assert.equal(await page.locator('.banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
    assert.equal(await value('outcome'), 'Not delivered');
    assert.deepEqual(await rows(), []);
    await observe('loadable standalone entry with exact synthetic banner');

    await page.locator('#epoch').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#epoch').inputValue(), 'current');
    await page.keyboard.press('ArrowUp');
    for (const id of ['field', 'guard', 'observation', 'deliver']) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), id);
    }
    await page.keyboard.press('Enter');
    assert.equal(await value('outcome'), 'PASS');
    assert.equal(await value('after'), await value('before'));
    assert.match(await value('command-evidence'), /epoch 11.*current 12.*REJECTED \/ STALE_EPOCH/);
    assert.match(await value('measurements'), /0\/2 \(routing 0, readiness 0\)/);
    assert.equal(await page.locator('#epoch').isDisabled(), true);
    assert.equal(await page.locator('#deliver').isDisabled(), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'outcome');
    await observe('keyboard delivery rejects stale routing and readiness without changing either');

    const deliveredRows = await rows();
    await page.locator('#command-form').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.match(await value('lesson-error'), /ORDER/);
    assert.equal(await page.locator('#lesson-error').isVisible(), true);
    assert.deepEqual(await rows(), deliveredRows);
    assert.equal(await value('outcome'), 'PASS');
    await observe('out-of-order DOM submission announces an error without state loss');
    await check('FAIL');
    assert.match(await value('interpretation'), /FAIL does not match the verifier PASS/);
    assert.equal(await value('outcome'), 'PASS');
    assert.equal(await page.locator('#lesson-error').isVisible(), false);
    const firstRetained = (await rows())[0];
    await next();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'epoch');
    await observe('wrong learner answer cannot rewrite measured success');

    await page.locator('#guard').selectOption('bypassed');
    await page.locator('#deliver').click();
    assert.equal(await value('outcome'), 'FAIL');
    assert.match(await value('command-evidence'), /APPLIED \/ GUARD_BYPASSED/);
    assert.match(await value('measurements'), /2\/2 \(routing 1, readiness 1\)/);
    assert.match(await value('after'), /green 0%[\s\S]*green false/);
    if (capture) screenshot = await page.screenshot({ fullPage: true });
    await check('FAIL');
    assert.match(await value('interpretation'), /FAIL matches the verifier FAIL/);
    assert.equal(await value('outcome'), 'FAIL');
    assert.equal((await rows())[0], firstRetained);
    await observe('unsafe stale command changes protected state and stays FAIL after correct interpretation');
    await next();

    await page.locator('#guard').selectOption('enforced');
    await page.locator('#observation').selectOption('missing');
    await page.locator('#deliver').click();
    assert.equal(await value('outcome'), 'UNKNOWN');
    assert.match(await value('command-evidence'), /REJECTED \/ STALE_EPOCH/);
    assert.match(await value('after'), /^UNKNOWN/);
    assert.match(await value('measurements'), /unknown/);
    assert.doesNotMatch(await value('measurements'), /0\/2/);
    await check('PASS');
    assert.equal(await value('outcome'), 'UNKNOWN');
    await observe('rejection without after evidence remains UNKNOWN despite a claimed PASS');
    await next();

    await page.locator('#epoch').selectOption('current');
    await page.locator('#field').selectOption('routing');
    await page.locator('#observation').selectOption('complete');
    await page.locator('#deliver').click();
    assert.equal(await value('outcome'), 'PASS');
    assert.match(await value('command-evidence'), /APPLIED \/ MATCHED_EPOCH/);
    assert.match(await value('measurements'), /1\/2 \(routing 1, readiness 0\)/);
    await check('PASS');
    await observe('matching epoch comparison applies routing only without claiming migration');
    await next();

    await page.locator('#epoch').selectOption('future');
    await page.locator('#field').selectOption('readiness');
    await page.locator('#deliver').click();
    assert.match(await value('command-evidence'), /REJECTED \/ FUTURE_EPOCH/);
    assert.equal(await value('after'), await value('before'));
    await check('PASS');
    await observe('unowned future epoch comparison is rejected without installing authority');
    await next();

    await page.locator('#epoch').selectOption('stale');
    await page.locator('#deliver').click();
    assert.equal(await value('outcome'), 'PASS');
    assert.equal(await value('after'), await value('before'));
    await check('PASS');
    assert.equal((await rows()).length, 6);
    assert.equal((await rows())[0], firstRetained);
    assert.equal(await page.locator('#next-attempt').isDisabled(), true);
    assert.equal(await page.locator('#deliver').isDisabled(), true);
    assert.match(await value('progress'), /History full/);
    assert.equal(await value('totals'), 'PASS 4 · FAIL 1 · UNKNOWN 1');
    await page.locator('#next-attempt').evaluate((button) => button.dispatchEvent(new Event('click')));
    assert.match(await value('lesson-error'), /LIMIT/);
    assert.equal((await rows()).length, 6);
    await observe('stale readiness is protected and six histories retain both failure and unknown without eviction');

    await reset();
    assert.deepEqual(await rows(), []);
    assert.equal(await value('outcome'), 'Not delivered');
    assert.equal(await page.locator('#lesson-error').isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'epoch');
    for (const [id, expected] of [['epoch', 'stale'], ['field', 'both'], ['guard', 'enforced'], ['observation', 'complete']]) {
      assert.equal(await page.locator(`#${id}`).inputValue(), expected);
      assert.equal(await page.locator(`#${id}`).isDisabled(), false);
    }
    await observe('explicit reset clears completed history, result and errors and restores keyboard focus');

    await page.locator('#epoch').evaluate((select) => {
      select.append(new Option('Invalid synthetic input', 'invalid'));
      select.value = 'invalid';
    });
    await page.locator('#deliver').click();
    assert.match(await value('lesson-error'), /INPUT: Invalid epoch/);
    assert.equal(await value('outcome'), 'Not delivered');
    assert.deepEqual(await rows(), []);
    await observe('tampered enum is rejected in the actual DOM without consuming an attempt');
    await page.locator('#reset-lesson').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'epoch');
    assert.equal(await page.locator('#epoch').inputValue(), 'stale');
    assert.equal(await page.locator('#lesson-error').isVisible(), false);
    await page.locator('#field').selectOption('routing');
    await page.locator('#deliver').click();
    assert.equal(await value('after'), await value('before'));
    assert.match(await value('command-evidence'), /STALE_EPOCH; target routing/);
    await observe('keyboard reset avoids form.reset shadowing; stale routing-only update is unchanged');
    await reset();
    assert.deepEqual(await rows(), []);
    await page.locator('#deliver').click();
    await check('PASS');
    await reset();
    assert.deepEqual(await rows(), []);
    await page.locator('#deliver').click();
    await page.reload({ waitUntil: 'load' });
    assert.deepEqual(await rows(), []);
    assert.equal(await value('outcome'), 'Not delivered');
    await observe('reset works in delivered and checked phases; reload does not restore tab memory');
    assert.deepEqual(proof.exerciseNetworkRequests, []);
    assert.deepEqual(proof.consoleErrors, []);
    assert.deepEqual(proof.pageErrors, []);

    stage = 'csp';
    const pageURL = page.url();
    await page.evaluate(async () => {
      globalThis.__S082_CSP = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        globalThis.__S082_CSP.push({
          directive: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition,
        });
      });
      await new Promise((resolve, reject) => {
        const probe = document.createElement('script');
        probe.src = new URL('tests/csp-probe.js', location.href).href;
        probe.onload = resolve;
        probe.onerror = reject;
        document.head.append(probe);
      });
      const inline = document.createElement('script');
      inline.textContent = 'globalThis.__S082_INLINE_RAN = true';
      document.head.append(inline);
      const external = document.createElement('script');
      external.src = 'https://s082.invalid/script.js';
      document.head.append(external);
      try { await fetch('https://s082.invalid/connect'); } catch { globalThis.__S082_FETCH_BLOCKED = true; }
      const image = new Image();
      image.src = 'https://s082.invalid/image.png';
      document.body.append(image);
      const frame = document.createElement('iframe');
      frame.src = 'https://s082.invalid/frame';
      document.body.append(frame);
      const base = document.createElement('base');
      base.href = 'https://s082.invalid/';
      document.head.append(base);
      const style = document.createElement('style');
      style.textContent = 'body { color: rgb(255, 0, 0) !important; }';
      document.head.append(style);
      const form = document.createElement('form');
      form.action = 'https://s082.invalid/form';
      form.method = 'post';
      document.body.append(form);
      form.requestSubmit();
    });
    await page.waitForFunction(() => [
      'script-src', 'script-src-elem', 'connect-src', 'img-src', 'frame-src',
      'base-uri', 'style-src-elem', 'form-action',
    ].every((directive) => globalThis.__S082_CSP.some((event) => event.directive === directive && event.disposition === 'enforce')));
    proof.cspViolations = await page.evaluate(() => globalThis.__S082_CSP);
    for (const [directive, uri] of [
      ['script-src', 'eval'], ['script-src-elem', 'inline'], ['script-src-elem', 'https://s082.invalid/script.js'],
      ['connect-src', 'https://s082.invalid/connect'], ['img-src', 'https://s082.invalid/image.png'],
      ['frame-src', 'https://s082.invalid'], ['base-uri', 'https://s082.invalid/'], ['style-src-elem', 'inline'],
    ]) assert.ok(proof.cspViolations.some((event) => event.directive === directive
      && event.blockedURI === uri && event.disposition === 'enforce'), `${directive}: ${uri}`);
    assert.ok(proof.cspViolations.some((event) => event.directive === 'form-action'
      && event.blockedURI.startsWith('https://s082.invalid/form') && event.disposition === 'enforce'));
    assert.equal(await page.evaluate(() => globalThis.__S082_DYNAMIC_CODE), 'blocked');
    assert.equal(await page.evaluate(() => globalThis.__S082_INLINE_RAN), undefined);
    assert.equal(await page.evaluate(() => globalThis.__S082_FETCH_BLOCKED), true);
    assert.equal(await page.evaluate(() => document.baseURI), pageURL);
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).color), 'rgb(255, 0, 0)');
    assert.equal(page.url(), pageURL);
    assert.deepEqual(proof.routedProbes, []);
    assert.deepEqual(proof.probeResponses, []);
    assert.deepEqual(proof.pageErrors, []);
    proof.cspChecks = {
      inlineScript: 'blocked', dynamicEvaluation: 'blocked', externalScript: 'blocked',
      connection: 'blocked', image: 'blocked', frame: 'blocked', base: 'blocked',
      inlineStyle: 'blocked', form: 'blocked', bypassCSP: false, remoteResponses: 0,
      frameReportScope: 'Cross-origin frame violation reports the origin only; expected synthetic origin matched.',
      workerSrcIndependentlyQualified: false,
    };
    await observe('actual enforced CSP blocks nine probe categories without a remote response');
    proof.outcome = 'PASS';
  } catch (error) {
    failure = error;
    proof.failure = { name: error.name, message: error.message };
  } finally {
    if (session) {
      try {
        await session.close();
        proof.cleanup.awaitedFinallyClose = true;
      } catch (error) {
        failure = failure ? new AggregateError([failure, error], 'Browser check and cleanup failed') : error;
        proof.cleanup.error = error.message;
      }
    }
    proof.finishedAtUtc = new Date().toISOString();
    if (failure) proof.outcome = 'FAIL';
    if (capture) {
      if (screenshot) {
        fs.writeFileSync(path.join(root, 'evidence', 'browser-failure-v2.png'), screenshot, { flag: 'wx' });
        proof.failureFixtureScreenshot = { path: 'evidence\\browser-failure-v2.png', bytes: screenshot.length, rawSha256: sha(screenshot) };
      }
      fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
    }
  }
  if (failure) throw failure;
  assert.equal(proof.outcome, 'PASS');
  assert.equal(proof.cleanup.awaitedFinallyClose, true);
});
