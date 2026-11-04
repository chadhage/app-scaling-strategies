'use strict';
const { openIsolatedLesson } = require('..\\..\\..\\testing\\browser\\isolated.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');

const root = path.resolve(__dirname, '..\\..\\..');
const base = path.resolve(__dirname, '..');
const evidencePath = path.join(base, 'evidence\\browser.json');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const helperSha = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const helperGitSha = '2ccb4ee2e708d4e3131b73acb5efcf0a2ee6f0e73966388a846e0d22f07571b0';
const helperCommit = '53c0c0d82cc1db6780a87ac2b1085734af6d5c60';
const sourceFiles = ['model.js', 'app.js', 'index.html', 'styles.css', 'manifest.json', 'lesson.txt', 'partial-failure.feature', 'tests\\model.test.cjs', 'tests\\integrity.test.cjs', 'tests\\browser.test.cjs', 'tests\\browser-evidence.test.cjs'];

async function snapshot(page) {
  return page.evaluate(() => {
    const element = id => document.getElementById(id);
    const text = id => element(id).textContent;
    const rows = id => [...element(id).querySelectorAll('tr')].map(row => [...row.cells].map(cell => cell.textContent));
    return {
      banner: text('training-banner'),
      status: text('result-status'),
      verdict: text('verdict'),
      diagnosis: text('diagnosis'),
      path: text('affected-path'),
      route: text('selected-route'),
      completed: text('completed-count'),
      failed: text('failed-count'),
      elapsed: text('elapsed-time'),
      message: text('result-message'),
      probeRows: rows('probe-rows'),
      sampleRows: rows('sample-rows'),
      history: [...element('history').querySelectorAll('summary')].map(item => item.textContent),
      historyDetails: [...element('history').querySelectorAll('details')].map(item => item.textContent),
      historyStatus: text('history-status'),
      error: text('error-message'),
      errorHidden: element('error-message').hidden,
      activeId: document.activeElement.id,
      invalidCount: element('sample-count').getAttribute('aria-invalid'),
      resultHidden: element('result-panel').hidden,
      startupHidden: element('startup-note').hidden,
      startupText: text('startup-note'),
      runDisabled: element('run-button').disabled,
      resetDisabled: element('reset-button').disabled,
      formResetType: typeof element('exercise-form').reset,
      selections: {
        fixtureId: element('fixture-choice').value,
        journey: element('journey-choice').value,
        policy: element('policy-choice').value,
        samples: element('sample-count').value
      }
    };
  });
}

async function choose(page, choices) {
  for (const [key, value] of Object.entries(choices)) {
    const selectors = { fixtureId: '#fixture-choice', journey: '#journey-choice', policy: '#policy-choice' };
    await page.selectOption(selectors[key], value);
  }
}

function expectInitial(dom) {
  assert.equal(dom.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.equal(dom.resultHidden, true);
  assert.equal(dom.verdict, '');
  assert.match(dom.status, /^No rehearsal run/);
  assert.deepEqual(dom.probeRows, []);
  assert.deepEqual(dom.sampleRows, []);
  assert.deepEqual(dom.history, []);
  assert.equal(dom.errorHidden, true);
  assert.equal(dom.formResetType, 'function');
  assert.deepEqual(dom.selections, { fixtureId: 'baseline', journey: 'checkout', policy: 'dependency-aware', samples: '4' });
}

test('S117 actual isolated DOM, keyboard, failures, reset and CSP; ordinary verification is read-only', { timeout: 90000 }, async () => {
  const before = fs.existsSync(evidencePath) ? fs.readFileSync(evidencePath) : null;
  assert.equal(sha(fs.readFileSync(path.join(root, 'testing\\browser\\isolated.cjs'))), helperSha);
  const canonical = cp.spawnSync('git', ['show', `${helperCommit}:testing/browser/isolated.cjs`], { cwd: root, encoding: null });
  assert.equal(canonical.status, 0);
  assert.equal(sha(canonical.stdout), helperGitSha);
  const playwrightVersion = require(path.join(root, 'testing\\browser\\node_modules\\playwright\\package.json')).version;
  assert.equal(playwrightVersion, '1.56.1');
  const report = {
    cardId: 'A-S117', workerId: 'worker-A-S117', packet: 'SC-S117', kanoUnit: 'A-S117',
    mode: 'synthetic', nativeEvidence: false, sourceParentCompleted: false, additionalKanoCredits: 0,
    node: process.version, playwrightVersion, helperWorkingSha256: helperSha,
    helperCanonicalGitSha256: helperGitSha, helperPublishedCommit: helperCommit,
    command: 'node --test learning\\S117\\tests\\browser.test.cjs',
    evidenceCapture: capture, capturedAtUtc: new Date().toISOString(),
    sourceSha256: Object.fromEntries(sourceFiles.map(file => [file, sha(fs.readFileSync(path.join(base, file)))])),
    observations: [], cleanup: null,
    limits: 'Only fixed fictional DATA and local DOM are tested. No actual resource/network/fault operation, native Azure proof, production Node 24 or unattended lifecycle qualification.'
  };
  const session = await openIsolatedLesson('learning\\S117\\index.html');
  const page = session.page;
  const browser = page.context().browser();
  const remoteRequests = [];
  const pageErrors = [];
  const consoleErrors = [];
  page.on('request', request => {
    if (/^(https?|wss?):/i.test(request.url())) remoteRequests.push(request.url());
  });
  page.on('pageerror', failure => pageErrors.push(failure.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  const observed = (name, actual) => report.observations.push({ name, passed: true, actual });
  try {
    await page.route(/^(https?|wss?):/i, route => route.abort());
    report.browserVersion = session.browserVersion;
    assert.match(session.browserVersion, /^156\./);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('run-button').disabled);
    let dom = await snapshot(page);
    expectInitial(dom);
    assert.equal(dom.startupHidden, true);
    assert.equal(consoleErrors.length, 0);
    observed('unmeasured initial DOM and exact teaching boundary', dom);

    await page.keyboard.press('Tab');
    assert.equal((await snapshot(page)).activeId, 'skip-link');
    await page.keyboard.press('Enter');
    assert.equal((await snapshot(page)).activeId, 'exercise');
    await page.keyboard.press('Tab');
    assert.equal((await snapshot(page)).activeId, 'fixture-choice');
    const tabOrder = [];
    for (const id of ['journey-choice', 'policy-choice', 'sample-count', 'run-button', 'reset-button']) {
      await page.keyboard.press('Tab');
      const actual = (await snapshot(page)).activeId;
      assert.equal(actual, id);
      tabOrder.push(actual);
    }
    observed('keyboard skip link, native controls and action tab order', { tabOrder });
    await page.keyboard.press('Space');

    await choose(page, { fixtureId: 'recovered' });
    await page.click('#run-button');
    dom = await snapshot(page);
    assert.match(dom.error, /earlier Cedar inventory-failure checkout data/);
    assert.equal(dom.errorHidden, false);
    assert.equal(dom.activeId, 'fixture-choice');
    assert.equal(dom.history.length, 0);
    assert.equal(dom.resultHidden, true);
    observed('recovery state guard rejects an unobserved failure', dom);
    await page.focus('#reset-button');
    await page.keyboard.press('Space');

    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('End');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Control+A');
    await page.keyboard.insertText('4');
    await page.keyboard.press('Enter');
    dom = await snapshot(page);
    assert.equal(dom.verdict, 'negative');
    assert.equal(dom.route, 'cedar');
    assert.equal(dom.path, 'Cedar -> inventory -> checkout');
    assert.equal(dom.completed, '0 / 4');
    assert.equal(dom.failed, '4 failed / 0 unknown');
    assert.ok(dom.probeRows.every(row => row[1] === '200'));
    assert.equal(dom.probeRows[0][4], 'failed');
    assert.equal(dom.probeRows[1][4], 'passed');
    assert.ok(dom.sampleRows.every(row => row[2] === 'failed'));
    assert.equal(dom.history.length, 1);
    observed('keyboard-submitted negative checkout behind two shallow HTTP 200 samples', dom);

    await page.keyboard.press('Shift+Tab');
    assert.equal((await snapshot(page)).activeId, 'policy-choice');
    await page.keyboard.press('Home');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    dom = await snapshot(page);
    assert.equal(dom.verdict, 'positive');
    assert.equal(dom.diagnosis, 'failed');
    assert.equal(dom.route, 'maple');
    assert.equal(dom.completed, '4 / 4');
    assert.ok(dom.sampleRows.every(row => row[1].startsWith('maple -> inventory') && row[2] === 'passed'));
    assert.equal(dom.history.length, 2);
    assert.match(dom.history[0], /negative; 0\/4 completed; route cedar/);
    observed('keyboard dependency-aware alternate and retained interrupted history', dom);

    await choose(page, { journey: 'catalog', policy: 'shallow' });
    await page.click('#run-button');
    dom = await snapshot(page);
    assert.equal(dom.verdict, 'positive');
    assert.equal(dom.route, 'cedar');
    assert.equal(dom.diagnosis, 'failed');
    assert.ok(dom.sampleRows.every(row => row[1] === 'cedar -> catalog-cache -> catalog' && row[2] === 'passed'));
    assert.ok(dom.probeRows.every(row => row[4] === 'passed'));
    assert.equal(dom.history.length, 3);
    observed('unaffected Cedar catalog is not mislabeled a regional outage', dom);

    await choose(page, { fixtureId: 'missing-cedar-evidence', journey: 'checkout', policy: 'shallow' });
    await page.click('#run-button');
    dom = await snapshot(page);
    assert.equal(dom.verdict, 'unknown');
    assert.equal(dom.diagnosis, 'unknown');
    assert.equal(dom.completed, '0 / 4');
    assert.equal(dom.failed, '0 failed / 4 unknown');
    assert.match(dom.elapsed, /^unknown/);
    assert.ok(dom.sampleRows.every(row => row[2] === 'unknown' && row[3] === 'unknown'));
    observed('missing dependency evidence keeps outcomes and elapsed time unknown', dom);

    await choose(page, { policy: 'dependency-aware' });
    await page.click('#run-button');
    dom = await snapshot(page);
    assert.equal(dom.route, 'maple');
    assert.equal(dom.completed, '4 / 4');
    assert.equal(dom.verdict, 'unknown');
    assert.match(dom.message, /cannot certify Cedar recovery/);
    observed('working alternate does not turn an unknown origin diagnosis into recovery', dom);

    await choose(page, { fixtureId: 'recovered' });
    await page.click('#run-button');
    dom = await snapshot(page);
    assert.equal(dom.verdict, 'positive');
    assert.equal(dom.diagnosis, 'passed');
    assert.equal(dom.route, 'cedar');
    assert.equal(dom.completed, '4 / 4');
    assert.match(dom.status, /phase recovered/);
    assert.equal(dom.history.length, 6);
    assert.match(dom.historyDetails[0], /Failed 4, unknown 0; shallow samples cedar HTTP 200, maple HTTP 200/);
    observed('guarded recovered fixture retains precise earlier failure attribution', dom);

    const beforeError = { history: dom.history, verdict: dom.verdict, completed: dom.completed };
    await page.fill('#sample-count', '4e0');
    await page.click('#run-button');
    dom = await snapshot(page);
    assert.equal(dom.errorHidden, false);
    assert.match(dom.error, /one digit/);
    assert.equal(dom.activeId, 'sample-count');
    assert.equal(dom.invalidCount, 'true');
    assert.deepEqual({ history: dom.history, verdict: dom.verdict, completed: dom.completed }, beforeError);
    observed('typed input error is focused, announced and nonmutating', dom);
    await page.fill('#sample-count', '4');

    await page.evaluate(() => {
      const option = new Option('Malformed fixture DATA', '<img src=x onerror=globalThis.s117Unsafe=1>');
      option.id = 'invalid-fixture-probe';
      const choice = document.getElementById('fixture-choice');
      choice.add(option);
      choice.value = option.value;
    });
    await page.click('#run-button');
    dom = await snapshot(page);
    assert.match(dom.error, /Choose a listed fixtureId/);
    assert.equal(dom.activeId, 'fixture-choice');
    assert.deepEqual(dom.history, beforeError.history);
    assert.equal(await page.evaluate(() => globalThis.s117Unsafe === undefined && document.querySelector('img') === null), true);
    observed('malformed fixture selection cannot enter trace, markup or history', dom);
    await page.evaluate(() => document.getElementById('invalid-fixture-probe').remove());

    await choose(page, { fixtureId: 'baseline' });
    for (let index = 0; index < 2; index += 1) await page.click('#run-button');
    dom = await snapshot(page);
    assert.equal(dom.history.length, 8);
    assert.equal(dom.errorHidden, true);
    assert.equal(dom.invalidCount, null);
    const lastHistory = dom.history;
    await page.click('#run-button');
    dom = await snapshot(page);
    assert.match(dom.error, /Eight-run history is full/);
    assert.equal(dom.activeId, 'reset-button');
    assert.deepEqual(dom.history, lastHistory);
    observed('eight-run bound retains all previous observations and rejects run nine', dom);

    await page.keyboard.press('Space');
    dom = await snapshot(page);
    expectInitial(dom);
    assert.equal(dom.activeId, 'fixture-choice');
    assert.equal(dom.invalidCount, null);
    assert.equal(dom.error, '');
    observed('keyboard reset clears controls, errors, result, tables and history without method shadowing', dom);

    const csp = await page.evaluate(async () => {
      const violations = [];
      const listener = event => violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
      document.addEventListener('securitypolicyviolation', listener);
      globalThis.s117CspCanary = 'unchanged';
      const script = document.createElement('script');
      script.textContent = 'globalThis.s117CspCanary = "executed";';
      document.body.append(script);
      let fetchFailure = '';
      try { await fetch('data:text/plain,local-synthetic-csp-probe'); } catch (failure) { fetchFailure = failure.name; }
      await new Promise(resolve => setTimeout(resolve, 50));
      script.remove();
      document.removeEventListener('securitypolicyviolation', listener);
      return {
        policy: document.querySelector('meta[http-equiv="Content-Security-Policy"]').content,
        canary: globalThis.s117CspCanary, fetchFailure, violations
      };
    });
    assert.equal(csp.canary, 'unchanged');
    assert.equal(csp.fetchFailure, 'TypeError');
    assert.ok(csp.violations.some(violation => violation.directive.startsWith('script-src') && violation.blockedURI === 'inline'));
    assert.ok(csp.violations.some(violation => violation.directive === 'connect-src' && violation.blockedURI === 'data'));
    observed('actual CSP blocks inline execution and a local data fetch without any network target', csp);

    const abortModel = route => route.abort();
    await page.route('**/model.js', abortModel);
    try {
      await page.reload({ waitUntil: 'load' });
      dom = await snapshot(page);
      assert.equal(dom.runDisabled, true);
      assert.equal(dom.resetDisabled, true);
      assert.equal(dom.startupHidden, false);
      assert.equal(dom.resultHidden, true);
      assert.match(dom.status, /^Startup unavailable/);
      assert.match(dom.error, /Required local model is unavailable/);
      assert.equal(dom.history.length, 0);
      observed('local model load failure is explicit and cannot present a measurement', dom);
    } finally {
      await page.unroute('**/model.js', abortModel);
    }
    const abortApp = route => route.abort();
    await page.route('**/app.js', abortApp);
    try {
      await page.reload({ waitUntil: 'load' });
      dom = await snapshot(page);
      assert.equal(dom.runDisabled, true);
      assert.equal(dom.resetDisabled, true);
      assert.equal(dom.startupHidden, false);
      assert.match(dom.startupText, /Lesson has not initialized/);
      assert.match(dom.status, /^No rehearsal run/);
      assert.equal(dom.resultHidden, true);
      assert.equal(dom.history.length, 0);
      observed('local app load failure retains static startup guidance and disabled actions', dom);
    } finally {
      await page.unroute('**/app.js', abortApp);
    }
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('run-button').disabled);
    dom = await snapshot(page);
    expectInitial(dom);
    assert.equal(dom.startupHidden, true);
    observed('restoring local assets reloads a usable unmeasured lesson', dom);

    await page.click('#run-button');
    await page.setViewportSize({ width: 360, height: 800 });
    await page.keyboard.press('Tab');
    assert.equal((await snapshot(page)).activeId, 'reset-button');
    await page.keyboard.press('Tab');
    const layout = await page.evaluate(() => ({
      viewportWidth: innerWidth,
      bodyWidth: document.body.scrollWidth,
      tableScrollable: document.querySelector('.table-scroll').scrollWidth > document.querySelector('.table-scroll').clientWidth,
      focusedTable: document.activeElement.classList.contains('table-scroll'),
      focusOutline: getComputedStyle(document.activeElement).outlineStyle,
      inputsLabelled: [...document.querySelectorAll('input,select')].every(element => element.labels.length === 1)
    }));
    assert.ok(layout.bodyWidth <= layout.viewportWidth);
    assert.equal(layout.tableScrollable, true);
    assert.equal(layout.focusedTable, true);
    assert.notEqual(layout.focusOutline, 'none');
    assert.equal(layout.inputsLabelled, true);
    observed('narrow viewport keeps body bounded and tables focusable with labelled inputs', layout);

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(remoteRequests, []);
    report.pageErrors = pageErrors;
    report.remoteRequests = remoteRequests;
    report.consoleErrors = consoleErrors;
    report.passed = true;
  } finally {
    await session.close();
    report.cleanup = { awaitedFinallyClose: true, browserDisconnected: !browser.isConnected() };
  }
  assert.equal(report.cleanup.browserDisconnected, true);
  observed('awaited finally closes the exact isolated browser', report.cleanup);
  if (capture) {
    fs.writeFileSync(evidencePath, JSON.stringify(report, null, 2) + '\n');
  } else {
    const after = fs.existsSync(evidencePath) ? fs.readFileSync(evidencePath) : null;
    assert.deepEqual(after, before, 'Ordinary verification must preserve historical browser evidence bytes.');
  }
  console.log(JSON.stringify({
    passed: report.passed, observations: report.observations.length, browserVersion: report.browserVersion,
    playwrightVersion, captured: capture, historicalEvidencePreserved: !capture,
    cleanup: report.cleanup, remoteRequests: report.remoteRequests, pageErrors: report.pageErrors
  }));
});
