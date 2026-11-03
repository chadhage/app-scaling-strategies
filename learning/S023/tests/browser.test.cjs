'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..', '..');
const helper = path.join(root, 'testing', 'browser', 'isolated.cjs');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const expectedHelper = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
assert.equal(sha(fs.readFileSync(helper)), expectedHelper, 'only published 53c0c0d helper bytes are approved');
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(root, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
assert.equal(playwrightVersion, '1.56.1');
assert.match(process.version, /^v22\./, 'Node 22 is the tooling runtime, not production Node 24');

test('actual isolated browser: DOM, keyboard, errors, failures, retained history, reset and CSP', { timeout: 90000 }, async () => {
  const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
  const label = process.env.BROWSER_EVIDENCE_LABEL || 'browser-acceptance';
  assert.match(label, /^[a-z][a-z0-9-]{0,60}$/);
  const startedAtUtc = new Date().toISOString();
  const observations = [];
  const requests = [];
  const routeAttempts = [];
  const pageErrors = [];
  const consoleErrors = [];
  let session;
  let checksCompleted = false;
  let closeResolved = false;
  let failure = null;
  let historyDom = '';
  let cspViolations = [];
  let browserVersion = null;
  let page;

  async function snapshot(name) {
    const view = await page.evaluate(() => {
      const text = id => document.getElementById(id).textContent.trim();
      const rows = id => [...document.querySelectorAll(`#${id} tr`)].map(row => [...row.cells].map(cell => cell.textContent));
      return {
        outcome: text('outcome'), readiness: text('readiness'), reason: text('reason'),
        endpoint: text('endpoint-result'), passed: text('passed'), failed: text('failed'),
        unmeasured: text('unmeasured'), duration: text('duration'), commits: text('fixture-commits'),
        externalWrites: text('external-writes'), trace: rows('trace-body'), history: rows('history-body'),
        historyCount: text('history-count'), announcement: text('announcement'),
        error: { hidden: document.getElementById('error').hidden, text: text('error') },
        activeId: document.activeElement.id,
        controls: { mode: document.getElementById('check-mode').value, fixture: document.getElementById('fixture').value,
          budgetMs: document.getElementById('budget-ms').value, isolated: document.getElementById('isolated').checked }
      };
    });
    observations.push({ name, view });
    return view;
  }

  try {
    session = await openIsolatedLesson(path.join('learning', 'S023', 'index.html'));
    page = session.page;
    browserVersion = session.browserVersion;
    assert.match(browserVersion, /^156\./);
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('request', request => { if (/^https?:/i.test(request.url())) requests.push(request.url()); });
    await page.route(/^https?:/i, route => {
      routeAttempts.push(route.request().url());
      return route.abort('blockedbyclient');
    });
    assert.equal(await page.title(), 'S023 - Representative journey warm-up');
    assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
    assert.equal(await page.locator('#journey-form').evaluate(form => typeof form.reset), 'function');
    assert.equal((await snapshot('initial')).outcome, 'Not assessed');

    await page.locator('#check-mode').focus();
    for (const expected of ['fixture', 'budget-ms', 'isolated', 'run-lesson']) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), expected);
    }
    await page.keyboard.press('Enter');
    let view = await snapshot('keyboard-shallow-probe');
    assert.equal(view.outcome, 'unknown');
    assert.match(view.endpoint, /HTTP 200/);
    assert.equal(view.passed, '0/3');
    assert.equal(view.unmeasured, '3');
    assert.ok(view.trace.every(row => row[1] === 'not-run'));
    assert.equal(view.history.length, 1);

    await page.locator('#check-mode').selectOption('representative');
    await page.locator('#run-lesson').click();
    view = await snapshot('representative-rejected-transaction');
    assert.equal(view.outcome, 'failure');
    assert.match(view.endpoint, /HTTP 200/);
    assert.equal(view.passed, '2/3');
    assert.equal(view.failed, '1');
    assert.equal(view.trace[2][2], '409');
    assert.equal(view.commits, '0');
    assert.equal(view.history.length, 2);

    await page.locator('#fixture').selectOption('healthy');
    await page.locator('#run-lesson').click();
    const success = await snapshot('representative-success');
    assert.equal(success.outcome, 'success');
    assert.match(success.readiness, /synthetic rehearsal only/);
    assert.equal(success.passed, '3/3');
    assert.equal(success.duration, '100 / 150 ms');
    assert.match(success.commits, /1 \(fixture-v1-run-3\)/);
    assert.equal(success.history.length, 3);

    await page.locator('#budget-ms').fill('150.5');
    await page.locator('#run-lesson').click();
    view = await snapshot('invalid-budget-retains-success-and-history');
    assert.equal(view.error.hidden, false);
    assert.match(view.error.text, /whole number/);
    assert.equal(view.activeId, 'error');
    assert.deepEqual(view.history, success.history);
    assert.equal(view.reason, success.reason);
    assert.equal(view.outcome, 'success');
    assert.equal(view.duration, success.duration);

    await page.locator('#budget-ms').fill('150');
    await page.locator('#fixture').evaluate(select => {
      select.add(new Option('Undeclared fixture', 'production'));
      select.value = 'production';
    });
    await page.locator('#run-lesson').click();
    view = await snapshot('undeclared-fixture-rejected');
    assert.match(view.error.text, /declared fixture/);
    assert.deepEqual(view.history, success.history);
    assert.equal(view.activeId, 'error');
    await page.locator('#fixture').evaluate(select => {
      [...select.options].find(option => option.value === 'production').remove();
    });

    await page.locator('#fixture').selectOption('transaction-unobserved');
    await page.locator('#run-lesson').click();
    view = await snapshot('missing-receipt-remains-unknown');
    assert.equal(view.outcome, 'unknown');
    assert.equal(view.unmeasured, '1');
    assert.equal(view.duration, 'unknown / 150 ms');
    assert.equal(view.commits, 'unknown (receipt unobserved)');
    assert.equal(view.trace[2][2], 'unmeasured');
    assert.equal(view.error.hidden, true);

    await page.locator('#fixture').selectOption('healthy');
    await page.locator('#budget-ms').fill('99');
    await page.locator('#run-lesson').click();
    view = await snapshot('journey-latency-budget-failure');
    assert.equal(view.outcome, 'failure');
    assert.equal(view.passed, '3/3');
    assert.equal(view.duration, '100 / 99 ms');
    assert.match(view.reason, /budget failed/);

    await page.locator('#budget-ms').fill('150');
    await page.locator('#isolated').uncheck();
    await page.locator('#run-lesson').click();
    const six = await snapshot('isolation-guard-before-execution');
    assert.equal(six.outcome, 'failure');
    assert.match(six.endpoint, /Not run/);
    assert.ok(six.trace.every(row => row[1] === 'not-run'));
    assert.equal(six.commits, '0');
    assert.deepEqual(six.history.map(row => row[2]), ['unknown', 'failure', 'success', 'unknown', 'failure', 'failure']);
    assert.equal(six.externalWrites, '0 (no external operations exist)');
    historyDom = await page.content();

    await page.locator('#isolated').check();
    await page.locator('#run-lesson').click();
    view = await snapshot('history-cap-preserves-all-six-observations');
    assert.match(view.error.text, /History is full/);
    assert.equal(view.activeId, 'error');
    assert.deepEqual(view.history, six.history);
    assert.equal(view.reason, six.reason);

    await page.locator('#reset-lesson').focus();
    await page.keyboard.press('Enter');
    view = await snapshot('keyboard-reset-restores-defaults');
    assert.equal(view.activeId, 'check-mode');
    assert.equal(view.outcome, 'Not assessed');
    assert.deepEqual(view.controls, { mode: 'shallow', fixture: 'transaction-rejected', budgetMs: '150', isolated: true });
    assert.equal(view.history.length, 0);
    assert.equal(view.trace.length, 0);
    assert.equal(view.error.hidden, true);
    assert.equal(view.error.text, '');
    assert.match(view.announcement, /Lesson reset/);
    assert.equal(view.duration, 'Not measured');

    await page.locator('#check-mode').selectOption('representative');
    await page.locator('#fixture').selectOption('login-denied');
    await page.locator('#run-lesson').click();
    view = await snapshot('login-denied-stops-later-steps');
    assert.equal(view.outcome, 'failure');
    assert.deepEqual(view.trace.map(row => row[1]), ['failure', 'not-run', 'not-run']);
    assert.equal(view.trace[0][2], '403');
    await page.locator('#fixture').selectOption('read-wrong-owner');
    await page.locator('#run-lesson').click();
    view = await snapshot('wrong-owner-read-fails-despite-200');
    assert.equal(view.outcome, 'failure');
    assert.equal(view.trace[1][2], '200');
    assert.deepEqual(view.trace.map(row => row[1]), ['success', 'failure', 'not-run']);
    assert.match(view.trace[1][4], /owner/);
    await page.locator('#reset-lesson').focus();
    await page.keyboard.press('Enter');
    assert.equal((await snapshot('repeat-reset-is-idempotent')).history.length, 0);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);

    const beforeCspUrl = page.url();
    await page.evaluate(() => {
      globalThis.__s023Violations = [];
      document.addEventListener('securitypolicyviolation', event => {
        globalThis.__s023Violations.push({
          effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition
        });
      });
      const inline = document.createElement('script');
      inline.textContent = 'globalThis.__s023InlineExecuted = true;';
      document.body.append(inline);
    });
    const fetchResult = await page.evaluate(async () => {
      try {
        await fetch('https://s023.invalid/never-sent');
        return 'unexpectedly allowed';
      } catch (error) {
        return error.name;
      }
    });
    assert.equal(fetchResult, 'TypeError');
    await page.evaluate(() => {
      const blocked = document.createElement('form');
      blocked.id = 'csp-probe-form';
      blocked.action = 'https://s023.invalid/never-submitted';
      blocked.method = 'post';
      document.body.append(blocked);
      blocked.submit();
    });
    await page.waitForFunction(() => {
      const entries = globalThis.__s023Violations;
      return entries.some(entry => entry.effectiveDirective.startsWith('script-src'))
        && entries.some(entry => entry.effectiveDirective === 'connect-src')
        && entries.some(entry => entry.effectiveDirective === 'form-action');
    });
    cspViolations = await page.evaluate(() => globalThis.__s023Violations);
    assert.equal(await page.evaluate(() => globalThis.__s023InlineExecuted), undefined);
    assert.equal(page.url(), beforeCspUrl);
    assert.deepEqual(requests, []);
    assert.deepEqual(routeAttempts, []);
    assert.deepEqual(pageErrors, []);
    observations.push({ name: 'actual-csp-enforcement', cspViolations, requests, routeAttempts, consoleErrors });
    checksCompleted = true;
  } catch (error) {
    failure = { message: error.message, stack: error.stack };
    throw error;
  } finally {
    try {
      if (session) {
        await session.close();
        closeResolved = true;
        assert.equal(page.isClosed(), true);
      }
    } finally {
      const record = {
        cardId: 'A-S023', packet: 'SC-S023', kano: 'S', mode: 'synthetic', startedAtUtc,
        completedAtUtc: new Date().toISOString(), node: process.version, playwrightVersion, browserVersion,
        helper: 'testing\\browser\\isolated.cjs', helperSha256: expectedHelper,
        checksCompleted, closeResolved, passed: checksCompleted && closeResolved && !failure,
        failure, observations, pageErrors, requests, routeAttempts, cspViolations,
        cleanup: 'Owned isolated session.close() awaited in finally; no shared browser, foreground lease, or unrelated process cleanup.',
        lifecycleLimit: 'Published helper has a documented lifecycle deadline limitation; abandoned prototype is not used.',
        scopeLimit: 'Local synthetic lesson only; no native Azure, production Node 24 or source-parent certification.',
        historyDomSha256: sha(historyDom)
      };
      if (capture) {
        const destination = path.join(__dirname, '..', 'evidence');
        fs.writeFileSync(path.join(destination, `${label}.dom.html.txt`), historyDom, { flag: 'wx' });
        fs.writeFileSync(path.join(destination, `${label}.json`), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
      }
      console.log(JSON.stringify({ cardId: 'A-S023', browserVersion, playwrightVersion, observations: observations.length,
        passed: record.passed, closeResolved, proofWritten: capture }));
    }
  }
});
