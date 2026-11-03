'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, repo, sha, snapshot, inputHashes } = require('.\\support.cjs');
const helperPath = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const helperSha = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
assert.equal(sha(fs.readFileSync(helperPath)), helperSha, 'Only the published raw helper may be loaded');
const { openIsolatedLesson } = require(helperPath);
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

test('S106 actual isolated DOM, keyboard, failed/unknown private gates, errors, retained reset, bound and CSP', { timeout: 90000 }, async () => {
  assert.match(process.version, /^v22\./);
  const before = capture ? null : snapshot();
  const startedAtUtc = new Date().toISOString();
  const runId = startedAtUtc.replace(/[:.]/g, '-');
  const record = {
    schemaVersion: 1, sourceId: 'S106', cardId: 'A-S106', parentId: 'D-S106',
    packet: 'SC-S106', kano: 'S', kanoUnit: 'A-S106', workerId: 'worker-A-S106',
    mode: 'synthetic', startedAtUtc, deliberateCapture: capture, passed: false,
    banner: '', node: process.version, helperRawSha256: helperSha,
    helperCommit: '53c0c0d82cc1db6780a87ac2b1085734af6d5c60',
    command: 'node --test learning\\S106\\tests\\browser.test.cjs',
    inputHashes: inputHashes(), checkpoints: [], screenshots: [], pageErrors: [], externalRequests: [], assetRequests: [],
    close: { attempted: false, awaited: false, pageClosed: false, error: null },
    limits: 'Actual local DOM/browser observations only. Every network/DNS/identity/probe/dependency observation is fixed fictional teaching DATA ONLY, not real operations or native proof. Existing offline PW1.56.1/signed Edge156/Node22 test tooling; not production24, source-parent or universal browser qualification. Published helper only; lifecycle prototype unqualified.'
  };
  const consoleErrors = [];
  let session;
  let observationsPassed = false;

  function save(label, bytes) {
    if (!capture) return null;
    const relative = path.join('raw', `browser-${runId}-${label}`);
    const target = path.join(root, 'evidence', relative);
    assert.equal(fs.existsSync(target), false, 'Raw browser observations cannot be overwritten');
    fs.writeFileSync(target, bytes);
    return { path: relative, bytes: bytes.length, sha256: sha(bytes) };
  }

  try {
    session = await openIsolatedLesson('learning\\S106\\index.html');
    const page = session.page;
    record.browserVersion = session.browserVersion;
    assert.match(record.browserVersion, /^156\./);
    page.on('pageerror', error => record.pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('request', request => {
      if (new URL(request.url()).protocol !== 'file:') record.externalRequests.push(request.url());
      else record.assetRequests.push(request.url());
    });
    await page.reload({ waitUntil: 'load', timeout: 15000 });
    await page.waitForFunction(() => document.getElementById('counts').textContent.includes('Attempts 0/12'));
    assert.equal(await page.title(), 'S106 - Public probes versus the private dependency path');
    record.banner = await page.textContent('.training');
    assert.equal(record.banner, 'Training rehearsal - synthetic data - not a live Azure result');
    record.formResetType = await page.evaluate(() => typeof document.getElementById('probe-form').reset);
    assert.equal(record.formResetType, 'function');
    record.initialResourceEntries = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));
    assert.ok(record.initialResourceEntries.every(url => new URL(url).protocol === 'file:'));
    record.theme = await page.getAttribute('html', 'data-theme');
    assert.ok(['dark', 'light'].includes(record.theme));

    async function observe(label) {
      const value = await page.evaluate(() => ({
        privateStatus: document.getElementById('assessment').dataset.status,
        privateOutcome: document.getElementById('private-outcome').textContent,
        public: document.getElementById('public-result').textContent,
        internal: document.getElementById('internal-result').textContent,
        client: document.getElementById('observed-client').textContent,
        duration: document.getElementById('private-duration').textContent,
        eligibility: document.getElementById('eligibility').textContent,
        explanation: document.getElementById('explanation').textContent,
        counts: document.getElementById('counts').textContent,
        separateProbes: document.getElementById('separate-probes').textContent,
        condition: document.getElementById('condition').value,
        action: document.getElementById('operator-action').value,
        focus: document.activeElement.id,
        error: document.getElementById('input-error').textContent,
        errorHidden: document.getElementById('input-error').hidden,
        history: [...document.querySelectorAll('#history li')].map(item => item.textContent),
        trace: [...document.querySelectorAll('#private-checks tr')].map(row => ({
          id: row.dataset.check, status: row.dataset.status, text: row.textContent
        }))
      }));
      const dom = save(`${label}.dom.html.snapshot`, Buffer.from(await page.content()));
      record.checkpoints.push({ label, ...value, dom });
      return value;
    }

    async function compare(condition, status, failingCheck) {
      await page.selectOption('#condition', condition);
      await page.selectOption('#operator-action', 'compare-private');
      await page.click('#record-probes');
      const value = await observe(condition);
      assert.equal(value.privateStatus, status);
      assert.match(value.public, /success.*HTTP 200.*24 synthetic ms/);
      assert.match(value.internal, /success.*HTTP 200.*18 synthetic ms/);
      assert.match(value.eligibility, status === 'success' ? /synthetic fixture only.*unverified/ : /Not eligible/);
      if (failingCheck) assert.equal(value.trace.find(row => row.id === failingCheck).status, 'failure');
      return value;
    }

    const initial = await observe('initial');
    assert.equal(initial.privateStatus, 'idle');
    assert.equal(initial.history.length, 0);

    await page.focus('#condition');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'operator-action');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'record-probes');
    await page.keyboard.press('Enter');
    const publicOnly = await observe('keyboard-public-only');
    assert.equal(publicOnly.privateStatus, 'unknown');
    assert.match(publicOnly.public, /success.*HTTP 200.*24 synthetic ms/);
    assert.match(publicOnly.internal, /Unknown - not measured/);
    assert.match(publicOnly.duration, /Unknown/);
    assert.ok(publicOnly.trace.every(row => row.status === 'unknown'));
    assert.match(publicOnly.eligibility, /Not eligible/);

    await page.focus('#operator-action');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.inputValue('#operator-action'), 'public-internal');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    const internal = await observe('keyboard-public-internal');
    assert.equal(internal.privateStatus, 'unknown');
    assert.match(internal.internal, /success.*18 synthetic ms/);
    assert.match(internal.eligibility, /Not eligible/);

    await page.focus('#condition');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.inputValue('#condition'), 'dns-public-answer');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.inputValue('#operator-action'), 'compare-private');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    const dns = await observe('keyboard-private-dns-failure');
    assert.equal(dns.privateStatus, 'failure');
    assert.equal(dns.trace.find(row => row.id === 'dns').status, 'failure');
    assert.match(dns.trace.find(row => row.id === 'dns').text, /public-address-label.*private-address-label/);
    assert.match(dns.public, /success/);
    assert.match(dns.internal, /success/);
    assert.match(dns.eligibility, /Not eligible/);
    if (capture) record.screenshots.push(save('private-dns-failure.png', await page.screenshot({ fullPage: true })));

    await page.focus('#reset-lesson');
    await page.keyboard.press('Enter');
    const reset = await observe('keyboard-reset-retained');
    assert.equal(reset.privateStatus, 'idle');
    assert.equal(reset.focus, 'condition');
    assert.equal(reset.condition, 'private-ready');
    assert.equal(reset.action, 'public-only');
    assert.equal(reset.history.length, 3);
    assert.match(reset.history[2], /private failure/);
    assert.equal(reset.errorHidden, true);

    await page.evaluate(() => {
      const condition = document.getElementById('condition');
      condition.append(new Option('Invalid teaching selection', 'forged-condition'));
      condition.value = 'forged-condition';
    });
    await page.focus('#record-probes');
    await page.keyboard.press('Enter');
    const invalid = await observe('invalid-selection');
    assert.equal(invalid.errorHidden, false);
    assert.equal(invalid.focus, 'input-error');
    assert.match(invalid.error, /exact typed schema/);
    assert.deepEqual(invalid.history, reset.history);
    assert.equal(invalid.privateStatus, 'idle');
    await page.evaluate(() => {
      document.querySelector('#condition option[value="forged-condition"]').remove();
    });

    const positive = await compare('private-ready', 'success');
    assert.ok(positive.trace.every(row => row.status === 'success'));
    assert.match(positive.duration, /84 synthetic ms.*150/);
    assert.match(positive.client, /application-private-segment/);
    assert.equal(positive.errorHidden, true);
    assert.match(positive.history[2], /private failure/);
    if (capture) record.screenshots.push(save('private-success.png', await page.screenshot({ fullPage: true })));
    const denied = await compare('connection-denied', 'failure', 'connectivity');
    assert.equal(denied.trace.find(row => row.id === 'authorization').status, 'unknown');
    assert.equal(denied.trace.find(row => row.id === 'dependency').status, 'unknown');
    assert.match(denied.duration, /Unknown/);
    await compare('authorization-denied', 'failure', 'authorization');
    const unrelated = await compare('wrong-client', 'unknown', 'placement');
    assert.ok(unrelated.trace.slice(1).every(row => row.status === 'unknown'));
    assert.match(unrelated.client, /external-probe-segment/);
    assert.match(unrelated.duration, /Unknown/);
    await compare('wrong-dependency', 'failure', 'dependency');
    const unobserved = await compare('private-unobserved', 'unknown');
    assert.ok(unobserved.trace.every(row => row.status === 'unknown'));
    assert.match(unobserved.duration, /Unknown/);
    const missingDns = await compare('dns-unobserved', 'unknown');
    assert.equal(missingDns.trace.find(row => row.id === 'dns').status, 'unknown');
    const management = await compare('management-exposed', 'failure', 'management');
    assert.equal(management.trace.find(row => row.id === 'dependency').status, 'success');
    const slow = await compare('dependency-slow', 'failure', 'dependency');
    assert.match(slow.duration, /220 synthetic ms/);
    assert.match(slow.counts, /Attempts 12\/12.*Private success 1.*Private failure 6.*Private unknown 5/);
    assert.match(slow.separateProbes, /Public successes 12; internal successes 11/);

    await page.click('#record-probes');
    const bound = await observe('bound-error');
    assert.equal(bound.focus, 'input-error');
    assert.equal(bound.errorHidden, false);
    assert.match(bound.error, /12-record page-session limit/);
    assert.deepEqual(bound.history, slow.history);
    assert.equal(bound.privateStatus, 'failure');
    await page.focus('#reset-lesson');
    await page.keyboard.press('Enter');
    const boundReset = await observe('keyboard-reset-at-bound');
    assert.equal(boundReset.privateStatus, 'idle');
    assert.equal(boundReset.history.length, 12);
    assert.equal(boundReset.focus, 'condition');
    assert.equal(boundReset.errorHidden, true);
    await page.click('#record-probes');
    const boundAgain = await observe('bound-after-reset');
    assert.equal(boundAgain.focus, 'input-error');
    assert.equal(boundAgain.history.length, 12);
    assert.equal(boundAgain.privateStatus, 'idle');
    assert.match(boundAgain.error, /Reset keeps history/);

    assert.deepEqual(record.pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(record.externalRequests, []);
    const pageURL = page.url();
    await page.evaluate(() => {
      globalThis.s106CspViolations = [];
      document.addEventListener('securitypolicyviolation', event => {
        globalThis.s106CspViolations.push({
          directive: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition
        });
      });
      const script = document.createElement('script');
      script.src = new URL('tests/fixtures/csp-probe.js', document.baseURI).href;
      document.body.append(script);
    });
    await page.waitForFunction(() => document.documentElement.dataset.s106CspProbeDone === 'true'
      && globalThis.s106CspViolations.length >= 2);
    const csp = await page.evaluate(() => ({
      probeRan: document.documentElement.dataset.s106CspProbeRan === 'true',
      evalBlocked: document.documentElement.dataset.s106EvalBlocked,
      inlineExecuted: document.documentElement.dataset.s106InlineExecuted === 'true',
      violations: globalThis.s106CspViolations
    }));
    record.csp = { ...csp, consoleErrors: [...consoleErrors], pageURLChanged: page.url() !== pageURL };
    assert.equal(csp.probeRan, true);
    assert.equal(csp.evalBlocked, 'EvalError');
    assert.equal(csp.inlineExecuted, false);
    assert.ok(csp.violations.some(event => event.blockedURI === 'eval' && event.directive.startsWith('script-src')));
    assert.ok(csp.violations.some(event => event.blockedURI === 'inline' && event.directive.startsWith('script-src')));
    assert.ok(consoleErrors.some(message => /inline script.*Content Security Policy/.test(message)));
    assert.equal(record.csp.pageURLChanged, false);
    await observe('csp');
    assert.deepEqual(record.pageErrors, []);
    assert.deepEqual(record.externalRequests, []);
    observationsPassed = true;
  } catch (error) {
    record.failure = { name: error.name, message: error.message, code: error.code || null };
    throw error;
  } finally {
    let cleanupError;
    if (session) {
      record.close.attempted = true;
      try {
        await session.close();
        record.close.awaited = true;
        record.close.pageClosed = session.page.isClosed();
      } catch (error) {
        cleanupError = error;
        record.close.error = error.message;
      }
    }
    record.finishedAtUtc = new Date().toISOString();
    record.passed = observationsPassed && record.close.awaited && record.close.pageClosed && !cleanupError;
    if (capture) {
      const target = path.join(root, 'evidence', 'browser-acceptance.json');
      if (fs.existsSync(target)) {
        const previous = fs.readFileSync(target);
        record.priorAttempts = [{
          ...JSON.parse(previous.toString('utf8')),
          rawRecord: save('prior-acceptance.json.snapshot', previous)
        }];
      }
      fs.writeFileSync(target, `${JSON.stringify(record, null, 2)}\n`);
    } else {
      assert.deepEqual(snapshot(), before, 'Normal browser verification must leave all owned source and evidence bytes unchanged');
    }
    if (cleanupError) throw cleanupError;
  }
});
