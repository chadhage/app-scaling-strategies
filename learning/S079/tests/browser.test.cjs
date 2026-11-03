'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const lesson = path.resolve(__dirname, '..');
const repo = path.resolve(lesson, '..', '..');
const helperPath = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const helperHash = sha256(fs.readFileSync(helperPath));
assert.equal(helperHash, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helperPath);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const captureRun = process.env.S079_CAPTURE_RUN || 'browser-green';
function tree(directory = lesson) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? tree(target) : [{
      path: path.relative(lesson, target), sha256: sha256(fs.readFileSync(target)),
    }];
  }).sort((left, right) => left.path.localeCompare(right.path));
}
function writeNew(name, bytes) {
  assert.match(captureRun, /^browser-green(?:-\d{3})?$/);
  const target = path.join(lesson, 'evidence', 'captures', captureRun, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, { flag: 'wx' });
}

test('actual isolated Edge DOM, keyboard, outcomes, guards, reset and CSP', { timeout: 180000 }, async (t) => {
  assert.equal(playwrightVersion, '1.56.1');
  assert.match(process.version, /^v22\./);
  const before = tree();
  const session = await openIsolatedLesson(path.join('learning', 'S079', 'index.html'));
  const { page } = session;
  const pageErrors = [];
  const unexpectedRequests = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    if (!request.url().startsWith('file:')) unexpectedRequests.push(request.url());
  });
  const proof = {
    cardId: 'A-S079', workerId: 'worker-A-S079', packet: 'SC-S079', kano: 'S',
    mode: 'actual local browser over synthetic lesson; not native Azure evidence',
    startedAtUtc: new Date().toISOString(), node: process.version,
    playwright: playwrightVersion, browser: session.browserVersion,
    helper: { publishedCommit: '53c0c0d', sha256: helperHash },
    captureWasExplicit: capture, checks: [], outcomes: [],
  };
  let screenshot;
  let failureDOM;
  async function check(name, work) {
    await t.test(name, async () => {
      await work();
      proof.checks.push(name);
    });
  }
  const active = () => page.evaluate(() => document.activeElement.id);
  const text = (id) => page.locator(`#${id}`).innerText();
  async function conduct() {
    for (const id of ['burst', 'expand', 'drain', 'verify']) await page.locator(`#${id}`).click();
  }
  async function retain(prediction) {
    await page.locator('#prediction').selectOption(prediction);
    await page.locator('#check').click();
  }
  async function outcome(expected) {
    assert.equal(await page.locator('#result').getAttribute('data-outcome'), expected);
    proof.outcomes.push({ expected, measuredDOM: await text('result'), diagnosticDOM: await text('diagnostic') });
  }
  try {
    assert.match(session.browserVersion, /^156\./);
    await check('standalone DOM, banner, assets and initial state', async () => {
      assert.equal(await page.title(), 'S079 — Backlog surge rehearsal');
      assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.locator('h1').innerText(), 'S079 — Backlog surge');
      assert.equal(await page.locator('#burst').isEnabled(), true);
      for (const id of ['expand', 'drain', 'verify', 'check', 'next']) assert.equal(await page.locator(`#${id}`).isDisabled(), true);
      assert.equal(await page.locator('#jobs tr').count(), 0);
      assert.equal(await page.locator('#history details').count(), 0);
      assert.match(await text('phase'), /Phase: idle/);
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('form')].map((form) => typeof form.reset)), ['function', 'function']);
      const assets = await page.evaluate(() => [
        ...[...document.scripts].map((element) => element.src),
        ...[...document.querySelectorAll('link[rel="stylesheet"]')].map((element) => element.href),
      ]);
      assert.equal(assets.length, 3);
      assert.ok(assets.every((url) => url.startsWith('file:') && /(?:model\.js|page\.js|lesson\.css)$/.test(url)));
      assert.equal(await page.evaluate(() => typeof window.BacklogSurge.createSession), 'function');
      assert.equal(await page.locator('.banner').evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(255, 242, 191)');
    });
    await check('actual Tab/arrows/Enter/Space positive journey and retained prediction', async () => {
      await page.keyboard.press('Tab');
      assert.equal(await page.locator(':focus').innerText(), 'Skip to exercise');
      await page.keyboard.press('Enter');
      assert.equal(await active(), 'exercise');
      await page.keyboard.press('Tab');
      assert.equal(await active(), 'burst-size');
      await page.keyboard.press('Tab');
      assert.equal(await active(), 'added-workers');
      await page.keyboard.press('ArrowUp');
      assert.equal(await page.locator('#added-workers').inputValue(), '0');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab');
      assert.equal(await active(), 'scheduling');
      await page.keyboard.press('Tab');
      assert.equal(await active(), 'deadline');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowUp');
      assert.equal(await page.locator('#deadline').inputValue(), '5');
      await page.keyboard.press('Tab');
      assert.equal(await active(), 'evidence');
      await page.keyboard.press('Tab');
      assert.equal(await active(), 'burst');
      await page.keyboard.press('Enter');
      assert.equal(await active(), 'expand');
      assert.equal(await page.locator('#jobs tr').count(), 6);
      assert.equal(await page.locator('#burst-size').isDisabled(), true);
      await page.keyboard.press('Space');
      assert.equal(await active(), 'drain');
      await page.keyboard.press('Enter');
      assert.equal(await active(), 'verify');
      await page.keyboard.press('Space');
      assert.equal(await active(), 'prediction');
      await outcome('PASS');
      assert.match(await text('result'), /6 successful \/ 0 failed \/ 0 unknown/);
      assert.match(await text('diagnostic'), /by tick 5/);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab');
      assert.equal(await active(), 'check');
      await page.keyboard.press('Enter');
      assert.equal(await active(), 'next');
      assert.match(await text('learning'), /Correct prediction: PASS/);
      await page.keyboard.press('Space');
      assert.equal(await active(), 'burst');
      assert.equal(await page.locator('#history details').count(), 1);
      assert.match(await text('totals'), /PASS: 1; FAIL: 0; UNKNOWN: 0/);
    });
    await check('overdue completion and faster reordered drain stay failed in history', async () => {
      await page.locator('#deadline').selectOption('4');
      await conduct();
      await outcome('FAIL');
      assert.match(await text('result'), /4 successful \/ 2 failed \/ 0 unknown.*2 overdue; 0 ordering failures/);
      assert.match(await text('diagnostic'), /6\/6 observed completions by tick 5/);
      await retain('PASS');
      assert.match(await text('learning'), /Incorrect prediction: PASS. Measured outcome stays FAIL/);
      await page.locator('#next').click();
      await page.locator('#added-workers').selectOption('2');
      await page.locator('#scheduling').selectOption('parallel');
      await page.locator('#deadline').selectOption('4');
      await conduct();
      await outcome('FAIL');
      assert.match(await text('result'), /0 overdue; 2 ordering failures/);
      assert.match(await text('diagnostic'), /6\/6 observed completions by tick 4.*1\.50 jobs\/tick/);
      const commits = await page.locator('#trace li').allTextContents();
      assert.ok(commits.findIndex((line) => line.includes('commits A2')) < commits.findIndex((line) => line.includes('commits A1')));
      assert.equal(await page.locator('#jobs tr').nth(2).locator('td').nth(4).innerText(), 'No');
      if (capture) {
        await page.locator('#trace-details').evaluate((details) => { details.open = true; });
        screenshot = await page.screenshot({ fullPage: true });
        failureDOM = await page.locator('body').innerText();
      }
      await retain('FAIL');
      assert.equal(await page.locator('#history details').count(), 3);
      assert.match(await text('totals'), /PASS: 1; FAIL: 2; UNKNOWN: 0/);
      await page.locator('#next').click();
      assert.match(await page.locator('#history details').nth(1).textContent(), /"deadline": 4/);
    });
    await check('unknown observations and mixed known-failure attribution remain visible', async () => {
      await page.locator('#evidence').selectOption('gap');
      await conduct();
      await outcome('UNKNOWN');
      assert.match(await text('result'), /5 successful \/ 0 failed \/ 1 unknown/);
      assert.match(await text('diagnostic'), /5\/6 observed completions/);
      assert.equal(await page.locator('#jobs tr').last().locator('td').nth(2).innerText(), 'Unknown');
      assert.equal((await page.locator('#trace li').allTextContents()).some((line) => line.includes('commits B3')), false);
      await retain('UNKNOWN');
      await page.locator('#next').click();
      await page.locator('#evidence').selectOption('gap');
      await page.locator('#deadline').selectOption('4');
      await conduct();
      await outcome('FAIL');
      assert.match(await text('result'), /4 successful \/ 1 failed \/ 1 unknown/);
      await retain('FAIL');
      assert.match(await text('totals'), /PASS: 1; FAIL: 3; UNKNOWN: 1/);
      assert.match(await text('totals'), /23 successful \/ 5 failed \/ 2 unknown/);
      await page.locator('#next').click();
    });
    await check('six-attempt limit rejects forced next without silent eviction', async () => {
      await conduct();
      await retain('PASS');
      assert.equal(await page.locator('#history details').count(), 6);
      assert.equal(await page.locator('#next').isDisabled(), true);
      assert.equal(await active(), 'clear-data');
      await page.locator('#next').evaluate((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      assert.match(await text('error'), /six retained attempts/);
      assert.equal(await page.locator('#history details').count(), 6);
      assert.equal(await page.locator('#result').getAttribute('data-outcome'), 'PASS');
      await page.locator('#clear-data').click();
    });
    await check('strict DOM input/state errors and complete keyboard reset', async () => {
      await page.locator('#added-workers').evaluate((select) => {
        select.add(new Option('Malformed synthetic input', '1e0'));
        select.value = '1e0';
      });
      await page.locator('#burst').click();
      assert.match(await text('error'), /Invalid addedWorkers/);
      assert.equal(await active(), 'added-workers');
      assert.match(await text('phase'), /Phase: idle/);
      assert.equal(await page.locator('#jobs tr').count(), 0);
      await page.locator('#clear-data').click();
      await page.locator('#added-workers option[value="1e0"]').evaluate((option) => option.remove());
      await page.locator('#verify').evaluate((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      assert.match(await text('error'), /Invalid state/);
      assert.equal(await active(), 'error');
      assert.equal(await page.locator('#result').getAttribute('data-outcome'), 'PENDING');
      await page.locator('#clear-data').click();
      await conduct();
      await page.locator('#check').click();
      assert.match(await text('error'), /Invalid prediction/);
      assert.equal(await active(), 'prediction');
      assert.equal(await page.locator('#history details').count(), 0);
      assert.equal(await page.locator('#result').getAttribute('data-outcome'), 'PASS');
      await retain('FAIL');
      await page.locator('details').evaluateAll((details) => details.forEach((element) => { element.open = true; }));
      await page.locator('#prediction-form').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      assert.equal(await page.locator('#error').isVisible(), true);
      await page.locator('#clear-data').focus();
      await page.keyboard.press('Space');
      assert.equal(await active(), 'burst');
      assert.equal(await page.locator('#error').isHidden(), true);
      assert.equal(await text('error'), '');
      assert.equal(await page.locator('#jobs tr').count(), 0);
      assert.equal(await page.locator('#trace li').count(), 0);
      assert.equal(await page.locator('#history details').count(), 0);
      assert.equal(await page.locator('details[open]').count(), 0);
      assert.equal(await text('learning'), 'No prediction checked.');
      assert.equal(await text('totals'), 'No retained attempts.');
      assert.match(await text('result'), /^Not verified/);
      assert.match(await text('phase'), /Phase: idle. Workers: 1. Observation tick: 0. Retained: 0\/6/);
      const controls = await page.locator('#settings select').evaluateAll((selects) => selects.map((select) => [select.value, select.disabled]));
      assert.deepEqual(controls, [['6', false], ['1', false], ['keyed', false], ['5', false], ['complete', false]]);
      assert.equal(await page.locator('#prediction').inputValue(), '');
      assert.equal(await page.locator('#prediction').isDisabled(), true);
    });
    await check('narrow viewport, scroll containment and visible keyboard focus', async () => {
      await page.locator('#clear-data').click();
      await page.setViewportSize({ width: 360, height: 800 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
      await page.locator('#burst-size').focus();
      await page.keyboard.press('Tab');
      assert.equal(await active(), 'added-workers');
      const style = await page.locator('#added-workers').evaluate((element) => {
        const computed = getComputedStyle(element);
        return { outline: computed.outlineStyle, width: computed.outlineWidth, height: element.getBoundingClientRect().height };
      });
      assert.equal(style.outline, 'solid');
      assert.equal(style.width, '3px');
      assert.ok(style.height >= 44);
      await page.setViewportSize({ width: 1280, height: 900 });
    });
    await check('actual CSP blocks inline code/styles, connections, forms, frames, objects and base changes', async () => {
      const originalURL = page.url();
      await page.evaluate(async () => {
        window.__s079Csp = { violations: [], inlineExecuted: false, baseBefore: document.baseURI };
        window.__s079Csp.listener = (event) => window.__s079Csp.violations.push(event.effectiveDirective);
        document.addEventListener('securitypolicyviolation', window.__s079Csp.listener);
        function probe(tag) {
          const element = document.createElement(tag);
          element.dataset.s079Probe = 'true';
          return element;
        }
        const script = probe('script');
        script.textContent = 'window.__s079Csp.inlineExecuted = true;';
        document.head.append(script);
        const style = probe('style');
        style.textContent = 'body { background-color: rgb(1, 2, 3) !important; }';
        document.head.append(style);
        const base = probe('base');
        base.href = 'http://127.0.0.1:9/blocked-base/';
        document.head.append(base);
        const frame = probe('iframe');
        frame.src = 'data:text/html,<p>blocked synthetic frame</p>';
        document.body.append(frame);
        const object = probe('object');
        object.type = 'text/html';
        object.data = 'data:text/html,<p>blocked synthetic object</p>';
        document.body.append(object);
        const form = probe('form');
        form.action = 'http://127.0.0.1:9/blocked-form';
        document.body.append(form);
        HTMLFormElement.prototype.submit.call(form);
        try {
          await fetch('http://127.0.0.1:9/blocked-fetch');
          window.__s079Csp.fetch = 'unexpected success';
        } catch (error) {
          window.__s079Csp.fetch = error.name;
        }
      });
      const directives = ['script-src-elem', 'style-src-elem', 'connect-src', 'form-action', 'frame-src', 'object-src', 'base-uri'];
      await page.waitForFunction((expected) => expected.every((directive) => window.__s079Csp.violations.includes(directive)), directives);
      const observation = await page.evaluate(() => ({
        inlineExecuted: window.__s079Csp.inlineExecuted,
        fetch: window.__s079Csp.fetch, violations: window.__s079Csp.violations,
        baseUnchanged: document.baseURI === window.__s079Csp.baseBefore,
        bodyColor: getComputedStyle(document.body).backgroundColor,
      }));
      assert.equal(observation.inlineExecuted, false);
      assert.equal(observation.fetch, 'TypeError');
      assert.equal(observation.baseUnchanged, true);
      assert.notEqual(observation.bodyColor, 'rgb(1, 2, 3)');
      assert.equal(page.url(), originalURL);
      proof.csp = observation;
      await page.evaluate(() => {
        document.querySelectorAll('[data-s079-probe]').forEach((element) => element.remove());
        document.removeEventListener('securitypolicyviolation', window.__s079Csp.listener);
        delete window.__s079Csp;
      });
    });
    assert.equal(proof.checks.length, 8);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(unexpectedRequests, []);
  } finally {
    await session.close();
    proof.awaitedFinallyCloseResolved = true;
  }
  assert.deepEqual(tree(), before, 'Browser verification modified owned source or proof before deliberate capture.');
  proof.sourceAndProofUnchangedByChecks = true;
  proof.pageErrors = pageErrors;
  proof.unexpectedRequests = unexpectedRequests;
  proof.finishedAtUtc = new Date().toISOString();
  if (capture) {
    assert.ok(screenshot && failureDOM);
    writeNew('faster-but-reordered.png', screenshot);
    writeNew('failure-dom.txt', failureDOM);
    proof.screenshotSha256 = sha256(screenshot);
    proof.failureDomSha256 = sha256(Buffer.from(failureDOM));
    writeNew('browser-proof.json', `${JSON.stringify(proof, null, 2)}\n`);
  }
});
